package mcptest

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/app"
	"tradstry-mcp/clerk"
	"tradstry-mcp/graphql"
)

// Request is one GraphQL request the fake Tradstry API received.
type Request struct {
	Query         string
	Variables     map[string]any
	Authorization string
}

// Stack is the real HTTP handler, verifying tokens from Signer, in front of a
// fake Tradstry API.
type Stack struct {
	URL    string
	Signer *Signer

	mu       sync.Mutex
	requests []Request
}

// Start runs a Stack whose fake API answers each request with respond's JSON body.
func Start(t *testing.T, respond func(Request) string) *Stack {
	t.Helper()
	s := &Stack{Signer: NewSigner(t)}

	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Query     string         `json:"query"`
			Variables map[string]any `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("fake API: decode request: %v", err)
		}
		req := Request{Query: body.Query, Variables: body.Variables, Authorization: r.Header.Get("Authorization")}
		s.mu.Lock()
		s.requests = append(s.requests, req)
		s.mu.Unlock()
		_, _ = w.Write([]byte(respond(req)))
	}))
	t.Cleanup(api.Close)

	server := httptest.NewUnstartedServer(nil)
	cfg := app.Config{
		PublicURL:   "http://" + server.Listener.Addr().String(),
		ClerkIssuer: Issuer,
		APIURL:      api.URL,
	}
	verifier := clerk.NewVerifierWithKeys(Issuer, s.Signer.Keyfunc)
	server.Config.Handler = app.NewHandler(cfg, verifier, graphql.NewClient(api.URL, api.Client()))
	server.Start()
	t.Cleanup(server.Close)

	s.URL = server.URL
	return s
}

func (s *Stack) Requests() []Request {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Request(nil), s.requests...)
}

// Connect opens an MCP session as Subject with a valid access token. opts can
// set an ElicitationHandler to act as a client that asks the user directly.
func (s *Stack) Connect(t *testing.T, opts *mcp.ClientOptions) *mcp.ClientSession {
	t.Helper()
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, opts)
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{
		Endpoint:   s.URL + "/mcp",
		HTTPClient: &http.Client{Transport: bearer{s.Signer.AccessToken(t)}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return session
}

type bearer struct{ token string }

func (b bearer) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	r.Header.Set("Authorization", "Bearer "+b.token)
	return http.DefaultTransport.RoundTrip(r)
}

// Call calls a tool and decodes its structured output into Out. It fails the
// test if the call itself fails; tool errors are left for the caller to check.
func Call[Out any](t *testing.T, session *mcp.ClientSession, tool string, args any) (*mcp.CallToolResult, Out) {
	t.Helper()
	var out Out
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: tool, Arguments: args})
	if err != nil {
		t.Fatalf("call %s: %v", tool, err)
	}
	if !result.IsError {
		raw, _ := json.Marshal(result.StructuredContent)
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("decode %s output: %v", tool, err)
		}
	}
	return result, out
}

// Text returns a tool result's first text block, such as an error message.
func Text(result *mcp.CallToolResult) string {
	for _, c := range result.Content {
		if text, ok := c.(*mcp.TextContent); ok {
			return text.Text
		}
	}
	return ""
}
