package app_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/mcptest"
)

// These mirror the Rust server's protocol compatibility tests: clients speak to
// /mcp over plain HTTP, some with the stateless 2026-07-28 protocol that starts
// with server/discover, some with the classic initialize handshake.

func post(t *testing.T, s *mcptest.Stack, headers map[string]string, body any) (*http.Response, map[string]any) {
	t.Helper()
	raw, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, s.URL+"/mcp", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Authorization", "Bearer "+s.Signer.AccessToken(t))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	text := string(data)
	// A streamed reply carries the JSON-RPC message on a data: line.
	if strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		for line := range strings.SplitSeq(text, "\n") {
			if after, ok := strings.CutPrefix(line, "data: "); ok {
				text = after
			}
		}
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatalf("status %d, content type %q, body %q: %v", resp.StatusCode, resp.Header.Get("Content-Type"), data, err)
	}
	return resp, out
}

func modernMeta() map[string]any {
	return map[string]any{
		"io.modelcontextprotocol/protocolVersion":    "2026-07-28",
		"io.modelcontextprotocol/clientInfo":         map[string]any{"name": "modern-mcp-client", "version": "2.0.0"},
		"io.modelcontextprotocol/clientCapabilities": map[string]any{},
	}
}

func TestModernClientsDiscoverThenListToolsWithoutInitialize(t *testing.T) {
	s := mcptest.Start(t, func(mcptest.Request) string { return `{"data":{}}` })
	headers := map[string]string{"MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "server/discover"}

	resp, body := post(t, s, headers, map[string]any{
		"jsonrpc": "2.0", "id": "server-discover-probe-1", "method": "server/discover", "params": map[string]any{"_meta": modernMeta()},
	})
	if resp.StatusCode != http.StatusOK || body["error"] != nil {
		t.Fatalf("discover: %d %v", resp.StatusCode, body)
	}
	discovered, _ := body["result"].(map[string]any)
	versions, _ := discovered["supportedVersions"].([]any)
	found := false
	for _, v := range versions {
		found = found || v == "2026-07-28"
	}
	if !found {
		t.Errorf("2026-07-28 missing from discover: %v", body)
	}

	headers["Mcp-Method"] = "tools/list"
	resp, body = post(t, s, headers, map[string]any{
		"jsonrpc": "2.0", "id": "tools-list-1", "method": "tools/list", "params": map[string]any{"_meta": modernMeta()},
	})
	result, _ := body["result"].(map[string]any)
	tools, _ := result["tools"].([]any)
	if resp.StatusCode != http.StatusOK || len(tools) == 0 {
		t.Fatalf("modern tools/list: %d %v", resp.StatusCode, body)
	}
}

func TestClassicClientsInitialize(t *testing.T) {
	s := mcptest.Start(t, func(mcptest.Request) string { return `{"data":{}}` })
	resp, body := post(t, s, nil, map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": map[string]any{
			"protocolVersion": "2025-11-25", "capabilities": map[string]any{}, "clientInfo": map[string]any{"name": "ClaudeAI", "version": "1.0.0"},
		},
	})
	if resp.StatusCode != http.StatusOK || body["result"] == nil {
		t.Fatalf("initialize: %d %v", resp.StatusCode, body)
	}
}

func TestModernClientsConfirmByAnsweringAnInputRequest(t *testing.T) {
	deleted := false
	s := mcptest.Start(t, func(req mcptest.Request) string {
		if strings.Contains(req.Query, "deleteWorkspace") {
			deleted = true
			return `{"data":{"deleteWorkspace":true}}`
		}
		return `{"data":{"workspaces":[{"id":"ws1","name":"Main"},{"id":"ws2","name":"Options"}]}}`
	})
	meta := modernMeta()
	meta["io.modelcontextprotocol/clientCapabilities"] = map[string]any{"elicitation": map[string]any{"form": map[string]any{}}}
	headers := map[string]string{"MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "delete_workspace"}
	params := map[string]any{"name": "delete_workspace", "arguments": map[string]any{"workspace_id": "ws2"}, "_meta": meta}

	_, body := post(t, s, headers, map[string]any{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": params})
	result, _ := body["result"].(map[string]any)
	asks, _ := result["inputRequests"].(map[string]any)
	if result["resultType"] != "input_required" || len(asks) != 1 || deleted {
		t.Fatalf("first call: %v", body)
	}

	for id := range asks {
		params["inputResponses"] = map[string]any{id: map[string]any{"action": "accept", "content": map[string]any{"confirm": true}}}
	}
	_, body = post(t, s, headers, map[string]any{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": params})
	result, _ = body["result"].(map[string]any)
	out, _ := result["structuredContent"].(map[string]any)
	if out["status"] != "deleted" || !deleted {
		t.Fatalf("retry: %v", body)
	}
}

func TestClassicClientsConfirmInAPromptTheServerSends(t *testing.T) {
	deleted := false
	s := mcptest.Start(t, func(req mcptest.Request) string {
		if strings.Contains(req.Query, "deleteWorkspace") {
			deleted = true
			return `{"data":{"deleteWorkspace":true}}`
		}
		return `{"data":{"workspaces":[{"id":"ws1","name":"Main"},{"id":"ws2","name":"Options"}]}}`
	})
	asked := 0
	session := s.ConnectAt(t, &mcp.ClientOptions{
		ElicitationHandler: func(context.Context, *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
			asked++
			return &mcp.ElicitResult{Action: "accept", Content: map[string]any{"confirm": true}}, nil
		},
	}, "2025-11-25")
	if v := session.InitializeResult().ProtocolVersion; v != "2025-11-25" {
		t.Fatalf("negotiated %s", v)
	}

	result, out := mcptest.Call[map[string]any](t, session, "delete_workspace", map[string]any{"workspace_id": "ws2"})
	if out["status"] != "deleted" || !deleted || asked != 1 {
		t.Fatalf("asked %d times, result %v %q", asked, out, mcptest.Text(result))
	}
}
