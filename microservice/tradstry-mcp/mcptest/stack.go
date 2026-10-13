package mcptest

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/redis/go-redis/v9"

	"tradstry-mcp/app"
	"tradstry-mcp/gqlcheck"
	"tradstry-mcp/graphql"
	"tradstry-mcp/oauth"
	"tradstry-mcp/ratelimit"
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
	// Redis holds the rate limit counts; tests can inspect or break it.
	Redis *miniredis.Miniredis

	mu       sync.Mutex
	requests []Request
	files    map[string]file
}

type file struct {
	contentType string
	body        []byte
}

// Start runs a Stack whose fake API answers each request with respond's JSON body.
// Every request is first validated against the backend's real schema.
func Start(t *testing.T, respond func(Request) string) *Stack {
	t.Helper()
	s := &Stack{Signer: NewSigner(t)}

	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			s.mu.Lock()
			f, ok := s.files[r.URL.Path]
			s.mu.Unlock()
			if !ok {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", f.contentType)
			_, _ = w.Write(f.body)
			return
		}
		var body struct {
			Query     string         `json:"query"`
			Variables map[string]any `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("fake API: decode request: %v", err)
		}
		if err := gqlcheck.Operation(body.Query, body.Variables); err != nil {
			t.Errorf("invalid GraphQL sent to the Tradstry API: %v\n%s", err, body.Query)
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
		PublicURL:     "http://" + server.Listener.Addr().String(),
		OAuthIssuer:   Issuer,
		OAuthAudience: Audience,
		APIURL:        api.URL,
	}
	verifier := oauth.NewVerifierWithKeys(Issuer, Audience, s.Signer.Keyfunc)
	s.Redis = miniredis.RunT(t)
	limiter := ratelimit.New(redis.NewClient(&redis.Options{Addr: s.Redis.Addr()}))
	server.Config.Handler = app.NewHandler(cfg, verifier, graphql.NewClient(api.URL, api.Client()), limiter)
	server.Start()
	t.Cleanup(server.Close)

	s.URL = server.URL
	return s
}

// ServeFile makes the fake API answer GET path with body, as it serves notebook media.
func (s *Stack) ServeFile(path, contentType string, body []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.files == nil {
		s.files = map[string]file{}
	}
	s.files[path] = file{contentType: contentType, body: body}
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
	return s.ConnectAt(t, opts, "")
}

// ConnectAt is Connect asking for a protocol version, where "" means the latest.
func (s *Stack) ConnectAt(t *testing.T, opts *mcp.ClientOptions, version string) *mcp.ClientSession {
	t.Helper()
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, opts)
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{
		Endpoint:   s.URL + "/mcp",
		HTTPClient: &http.Client{Transport: bearer{s.Signer.AccessToken(t)}},
	}, &mcp.ClientSessionOptions{ProtocolVersion: version})
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
