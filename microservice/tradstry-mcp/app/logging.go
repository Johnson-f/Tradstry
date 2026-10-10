package app

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// logRequests logs every HTTP request but health checks: method, path, status,
// duration and client. Headers and bodies are never logged, so no token is.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		slog.Info("http request", "method", r.Method, "path", r.URL.Path, "status", rec.status,
			"duration", time.Since(start).Round(time.Millisecond), "user_agent", r.UserAgent())
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// Flush keeps streamed MCP responses working through the recorder.
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// logMethods logs each MCP request the server receives: the method, the tool for
// tools/call, how long it took, the response size and any error. Arguments and
// results are not logged.
func logMethods(next mcp.MethodHandler) mcp.MethodHandler {
	return func(ctx context.Context, method string, req mcp.Request) (mcp.Result, error) {
		start := time.Now()
		result, err := next(ctx, method, req)
		attrs := []any{"method", method, "duration", time.Since(start).Round(time.Millisecond)}
		if call, ok := req.(*mcp.CallToolRequest); ok {
			attrs = append(attrs, "tool", call.Params.Name)
			if r, ok := result.(*mcp.CallToolResult); ok && r.IsError {
				attrs = append(attrs, "tool_error", true)
			}
		}
		if result != nil {
			if raw, marshalErr := json.Marshal(result); marshalErr == nil {
				attrs = append(attrs, "response_bytes", len(raw))
			}
		}
		if err != nil {
			slog.Warn("mcp request failed", append(attrs, "error", err)...)
		} else {
			slog.Info("mcp request", attrs...)
		}
		return result, err
	}
}
