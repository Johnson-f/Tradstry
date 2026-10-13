package app_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"

	"tradstry-mcp/mcptest"
	"tradstry-mcp/oauth"
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

func TestMetadataNamesTheIssuerAsTheAuthorizationServer(t *testing.T) {
	s := mcptest.Start(t, func(mcptest.Request) string { return `{}` })

	for path, resource := range map[string]string{
		"/.well-known/oauth-protected-resource":     s.URL,
		"/.well-known/oauth-protected-resource/mcp": s.URL + "/mcp",
	} {
		resp, err := http.Get(s.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		var meta struct {
			Resource             string   `json:"resource"`
			AuthorizationServers []string `json:"authorization_servers"`
		}
		err = json.NewDecoder(resp.Body).Decode(&meta)
		resp.Body.Close()
		if err != nil || meta.Resource != resource || len(meta.AuthorizationServers) != 1 || meta.AuthorizationServers[0] != mcptest.Issuer {
			t.Errorf("%s: %+v (%v)", path, meta, err)
		}
	}
}
