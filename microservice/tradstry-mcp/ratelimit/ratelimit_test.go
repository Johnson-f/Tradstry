package ratelimit_test

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"tradstry-mcp/mcptest"
	"tradstry-mcp/ratelimit"
)

func TestBucketsArePerUserAndRefill(t *testing.T) {
	server := miniredis.RunT(t)
	server.SetTime(time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC))
	limiter := ratelimit.New(redis.NewClient(&redis.Options{Addr: server.Addr()}))
	ctx := context.Background()
	small := ratelimit.Bucket{Name: "test", Capacity: 2, PerSecond: 1}

	for i := 0; i < 2; i++ {
		if wait, err := limiter.Take(ctx, "alice", small); err != nil || wait != 0 {
			t.Fatalf("call %d: wait %v, err %v", i, wait, err)
		}
	}
	if wait, _ := limiter.Take(ctx, "alice", small); wait != time.Second {
		t.Errorf("third call waits %v, want 1s", wait)
	}
	if wait, _ := limiter.Take(ctx, "bob", small); wait != 0 {
		t.Error("another user shares alice's bucket")
	}
	server.SetTime(time.Date(2026, 10, 10, 12, 0, 2, 0, time.UTC))
	if wait, _ := limiter.Take(ctx, "alice", small); wait != 0 {
		t.Error("the bucket did not refill")
	}
}

func TestToolCallsAreLimitedAndWritesMoreSo(t *testing.T) {
	var reached atomic.Int64
	s := mcptest.Start(t, func(req mcptest.Request) string {
		reached.Add(1)
		if strings.Contains(req.Query, "createWorkspace") {
			return `{"data":{"createWorkspace":{"id":"ws2","name":"x","currency":"USD","assetClass":"mixed","riskProfile":"moderate"}}}`
		}
		return `{"data":{"workspaces":[]}}`
	})
	session := s.Connect(t, nil)

	for i := 0; i < int(ratelimit.Writes.Capacity); i++ {
		if result, _ := mcptest.Call[any](t, session, "create_workspace", map[string]any{"name": "x"}); result.IsError {
			t.Fatalf("write %d refused: %s", i, mcptest.Text(result))
		}
	}
	result, _ := mcptest.Call[any](t, session, "create_workspace", map[string]any{"name": "x"})
	if !result.IsError || !strings.Contains(mcptest.Text(result), "too many changes") || !strings.Contains(mcptest.Text(result), "wait") {
		t.Fatalf("write past the limit: %q", mcptest.Text(result))
	}
	before := reached.Load()
	if result, _ := mcptest.Call[any](t, session, "list_workspaces", nil); result.IsError {
		t.Errorf("reads still go through while writes are limited: %s", mcptest.Text(result))
	}

	for i := 0; i < int(ratelimit.Calls.Capacity); i++ {
		mcptest.Call[any](t, session, "list_workspaces", nil)
	}
	result, _ = mcptest.Call[any](t, session, "list_workspaces", nil)
	if !result.IsError || !strings.Contains(mcptest.Text(result), "too many requests") {
		t.Errorf("read past the limit: %q", mcptest.Text(result))
	}
	if got := reached.Load() - before; got >= int64(ratelimit.Calls.Capacity)+2 {
		t.Errorf("a limited call still reached the Tradstry API (%d requests)", got)
	}
}

func TestCallsGoAheadWhenRedisIsDown(t *testing.T) {
	s := mcptest.Start(t, func(mcptest.Request) string { return `{"data":{"workspaces":[]}}` })
	session := s.Connect(t, nil)
	s.Redis.Close()
	if result, _ := mcptest.Call[any](t, session, "list_workspaces", nil); result.IsError {
		t.Errorf("a Redis outage blocked the call: %s", mcptest.Text(result))
	}
}
