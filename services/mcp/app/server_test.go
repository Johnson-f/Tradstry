package app_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"

	"github.com/Johnson-f/Tradstry-v2-/services/mcp/mcptest"
	"github.com/Johnson-f/Tradstry-v2-/services/mcp/oauth"
)

func TestUnauthenticatedRequestsPointClientsAtTheIssuer(t *testing.T) {
	s := mcptest.Start(t, func(mcptest.Request) string { return `{}` })

	for name, token := range map[string]string{
		"no token":      "",
		"session token": s.Signer.Token(t, "JWT", jwt.MapClaims{"client_id": ""}),
	} {
		req, _ := http.NewRequest(http.MethodPost, s.URL+"/mcp", strings.NewReader(`{}`))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		challenge := resp.Header.Get("WWW-Authenticate")
		if resp.StatusCode != http.StatusUnauthorized || !strings.Contains(challenge, s.URL+oauth.MetadataPath) {
			t.Errorf("%s: status %d, WWW-Authenticate %q", name, resp.StatusCode, challenge)
		}
	}
	if len(s.Requests()) != 0 {
		t.Error("an unauthenticated request reached the Tradstry API")
	}
}

func TestProtectedResourceMetadataNamesTheIssuer(t *testing.T) {
	s := mcptest.Start(t, func(mcptest.Request) string { return `{}` })

	for _, path := range []string{"/.well-known/oauth-protected-resource", oauth.MetadataPath} {
		resp, err := http.Get(s.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		var metadata struct {
			Resource             string   `json:"resource"`
			AuthorizationServers []string `json:"authorization_servers"`
		}
		err = json.NewDecoder(resp.Body).Decode(&metadata)
		resp.Body.Close()
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if len(metadata.AuthorizationServers) != 1 || metadata.AuthorizationServers[0] != mcptest.Issuer {
			t.Errorf("%s: authorization_servers = %v", path, metadata.AuthorizationServers)
		}
		if !strings.HasPrefix(metadata.Resource, s.URL) {
			t.Errorf("%s: resource = %q", path, metadata.Resource)
		}
	}
}
