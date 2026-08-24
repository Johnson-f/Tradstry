package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestOAuthCodeExchangeUsesBasicAuthAndPKCEWithoutLeakingSecrets(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/metadata":
			_ = json.NewEncoder(writer).Encode(map[string]string{
				"authorization_endpoint": server.URL + "/authorize",
				"token_endpoint":         server.URL + "/token",
				"revocation_endpoint":    server.URL + "/revoke",
			})
		case "/token":
			clientID, secret, ok := request.BasicAuth()
			if !ok || clientID != "oauth-client" || secret != "oauth-secret" {
				t.Fatalf("missing OAuth client authentication")
			}
			body := make([]byte, request.ContentLength)
			_, _ = request.Body.Read(body)
			values, _ := url.ParseQuery(string(body))
			if values.Get("code_verifier") != "verifier" || values.Get("code") != "code" {
				t.Fatalf("missing authorization code or PKCE verifier")
			}
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"access_token": "access", "refresh_token": "refresh", "expires_in": 36000,
				"scope": "read webhook", "sub": map[string]string{"snaptrade_user_id": "personal-user"},
			})
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()
	client := &SnapTradeClient{
		httpClient: server.Client(), oauthClientID: "oauth-client",
		oauthClientSecret: "oauth-secret", oauthMetadataURL: server.URL + "/metadata",
	}
	tokens, _, err := client.ExchangeOAuthCode("code", "verifier", "http://localhost/callback")
	if err != nil {
		t.Fatal(err)
	}
	if tokens.SnapTradeUserID != "personal-user" || strings.Join(tokens.Scopes, " ") != "read webhook" {
		t.Fatalf("unexpected normalized tokens: %#v", tokens)
	}
}

func TestBearerAccountRequestOmitsCommercialCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer access" {
			t.Fatalf("missing bearer authorization")
		}
		if request.URL.Query().Has("userId") || request.URL.Query().Has("userSecret") || request.Header.Get("Signature") != "" {
			t.Fatalf("OAuth request included Commercial authentication")
		}
		_, _ = writer.Write([]byte(`[]`))
	}))
	defer server.Close()
	client := &SnapTradeClient{httpClient: server.Client(), baseURL: server.URL}
	if _, _, err := client.ListAccountsOAuth("access"); err != nil {
		t.Fatal(err)
	}
}
