// Package ratelimit caps how fast one user's assistant can call tools, so a
// looping or retrying client cannot flood the Tradstry API. Counts live in Redis,
// shared by every copy of this server.
package ratelimit

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/redis/go-redis/v9"

	"tradstry-mcp/clerk"
)

// Bucket is a token bucket: Capacity calls at once, refilled at PerSecond.
type Bucket struct {
	Name      string
	Capacity  float64
	PerSecond float64
}

var (
	// Calls covers every tool call.
	Calls = Bucket{Name: "calls", Capacity: 60, PerSecond: 1}
	// Writes covers tools that change or delete data, on top of Calls.
	Writes = Bucket{Name: "writes", Capacity: 20, PerSecond: 20.0 / 60}
)

// The same refill-and-take the Rust MCP server uses, in one atomic script on
// Redis server time so every replica agrees.
var tokenBucket = redis.NewScript(`
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local t = redis.call('TIME')
local now = tonumber(t[1]) + tonumber(t[2]) / 1000000.0
local d = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(d[1])
local ts = tonumber(d[2])
if tokens == nil then tokens = capacity; ts = now end
local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refill)
local allowed = 0
local retry = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retry = math.ceil((1 - tokens) / refill)
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / refill * 1000) + 1000)
return {allowed, retry}
`)

type Limiter struct {
	redis *redis.Client
}

func New(client *redis.Client) *Limiter {
	return &Limiter{redis: client}
}

// Take spends one call from subject's bucket. It returns how long to wait when
// the bucket is empty.
func (l *Limiter) Take(ctx context.Context, subject string, b Bucket) (time.Duration, error) {
	key := fmt.Sprintf("mcp:ratelimit:%s:%s", b.Name, subject)
	res, err := tokenBucket.Run(ctx, l.redis, []string{key}, b.Capacity, b.PerSecond).Int64Slice()
	if err != nil {
		return 0, err
	}
	if len(res) == 2 && res[0] == 1 {
		return 0, nil
	}
	retry := int64(1)
	if len(res) == 2 && res[1] > 1 {
		retry = res[1]
	}
	return time.Duration(retry) * time.Second, nil
}

// Middleware limits tools/call requests. Tools in readOnly spend only from Calls;
// every other tool also spends from Writes.
//
// It fails open: when Redis cannot be reached the call goes ahead and the error
// is logged, so a Redis outage slows nothing down rather than taking the server
// with it.
func (l *Limiter) Middleware(readOnly map[string]bool) mcp.Middleware {
	return func(next mcp.MethodHandler) mcp.MethodHandler {
		return func(ctx context.Context, method string, req mcp.Request) (mcp.Result, error) {
			call, ok := req.(*mcp.CallToolRequest)
			if method != "tools/call" || !ok {
				return next(ctx, method, req)
			}
			caller, err := clerk.CallerOf(call)
			if err != nil {
				return next(ctx, method, req)
			}
			buckets := []Bucket{Calls}
			if !readOnly[call.Params.Name] {
				buckets = append(buckets, Writes)
			}
			for _, b := range buckets {
				wait, err := l.Take(ctx, caller.Subject, b)
				if err != nil {
					slog.Error("rate limit check failed; allowing the call", "error", err)
					continue
				}
				if wait > 0 {
					return limited(b, wait), nil
				}
			}
			return next(ctx, method, req)
		}
	}
}

func limited(b Bucket, wait time.Duration) *mcp.CallToolResult {
	what := "requests"
	if b.Name == Writes.Name {
		what = "changes"
	}
	result := &mcp.CallToolResult{}
	result.SetError(fmt.Errorf("too many %s to Tradstry in a short time; wait %d seconds, then try again", what, int(wait.Seconds())))
	return result
}
