package graphql_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"tradstry-mcp/graphql"
)

func fakeAPI(t *testing.T, status int, body string) *graphql.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/graphql" || r.Method != http.MethodPost {
			t.Errorf("request = %s %s, want POST /graphql", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer user-token" {
			t.Errorf("Authorization = %q, want the user's token forwarded", got)
		}
		var req struct {
			Query     string         `json:"query"`
			Variables map[string]any `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Query != "query Q { q }" || req.Variables["id"] != "ws1" {
			t.Errorf("request body = %+v (%v)", req, err)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return graphql.NewClient(srv.URL, srv.Client())
}

func do(client *graphql.Client, out any) error {
	return client.Do(context.Background(), "user-token", "query Q { q }", map[string]any{"id": "ws1"}, out)
}

func TestDoDecodesData(t *testing.T) {
	var out struct {
		Q string `json:"q"`
	}
	if err := do(fakeAPI(t, http.StatusOK, `{"data":{"q":"answer"}}`), &out); err != nil || out.Q != "answer" {
		t.Errorf("out = %+v, err = %v", out, err)
	}
}

func TestDoMapsBackendErrors(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		check  func(error) bool
	}{
		{"no account", http.StatusOK,
			`{"data":null,"errors":[{"message":"ACCOUNT_REQUIRED: ...","extensions":{"code":"ACCOUNT_REQUIRED"}}]}`,
			func(err error) bool { return errors.Is(err, graphql.ErrAccountRequired) }},
		{"rejected token", http.StatusUnauthorized, ``,
			func(err error) bool { return errors.Is(err, graphql.ErrUnauthorized) }},
		{"resolver error", http.StatusOK,
			`{"data":null,"errors":[{"message":"Workspace not found"}]}`,
			func(err error) bool {
				var apiErr *graphql.Error
				return errors.As(err, &apiErr) && apiErr.Messages[0] == "Workspace not found"
			}},
		{"server error", http.StatusBadGateway, `bad gateway`,
			func(err error) bool { return err != nil }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := do(fakeAPI(t, tc.status, tc.body), nil); !tc.check(err) {
				t.Errorf("err = %v", err)
			}
		})
	}
}

func TestForUserHidesTransportFailures(t *testing.T) {
	visible := []error{graphql.ErrAccountRequired, graphql.ErrUnauthorized, &graphql.Error{Messages: []string{"bad name"}}}
	for _, err := range visible {
		if got := graphql.ForUser(err); got != err {
			t.Errorf("ForUser(%v) = %v, want it unchanged", err, got)
		}
	}
	if got := graphql.ForUser(errors.New("dial tcp 10.0.0.5:7901: connection refused")); !errors.Is(got, graphql.ErrUnavailable) {
		t.Errorf("transport error became %v, want ErrUnavailable", got)
	}
}
