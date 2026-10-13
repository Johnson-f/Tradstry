package oauth_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/mcptest"
	"tradstry-mcp/oauth"
)

func newVerifier(signer *mcptest.Signer) *oauth.Verifier {
	return oauth.NewVerifierWithKeys(mcptest.Issuer, mcptest.Audience, signer.Keyfunc)
}

func TestVerifyAcceptsConnectedAppAccessTokens(t *testing.T) {
	signer := mcptest.NewSigner(t)
	verifier := newVerifier(signer)

	token := signer.Token(t, "JWT", jwt.MapClaims{"aud": []string{mcptest.Audience, "other-audience"}})
	info, err := verifier.Verify(context.Background(), token, nil)
	if err != nil {
		t.Fatal(err)
	}
	caller, err := oauth.CallerOf(&mcp.CallToolRequest{Extra: &mcp.RequestExtra{TokenInfo: info}})
	if err != nil || caller.Subject != mcptest.Subject || caller.Token != token {
		t.Errorf("caller = %+v, err = %v", caller, err)
	}
	if len(info.Scopes) != 4 || info.Scopes[0] != "openid" {
		t.Errorf("scopes = %v", info.Scopes)
	}
}

func TestVerifyRejectsTokensThatAreNotThisProjectsAccessTokens(t *testing.T) {
	signer := mcptest.NewSigner(t)
	other := mcptest.NewSigner(t)
	verifier := newVerifier(signer)

	hs256 := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"iss": mcptest.Issuer, "aud": []string{mcptest.Audience}, "sub": mcptest.Subject,
		"client_id": "app", "exp": time.Now().Add(time.Hour).Unix(),
	})
	symmetric, err := hs256.SignedString([]byte("secret"))
	if err != nil {
		t.Fatal(err)
	}

	cases := map[string]string{
		"session token without client_id": signer.Token(t, "JWT", jwt.MapClaims{"client_id": ""}),
		"other issuer":                    signer.Token(t, "JWT", jwt.MapClaims{"iss": "https://auth.example.com"}),
		"no audience":                     signer.Token(t, "JWT", jwt.MapClaims{"aud": nil}),
		"other audience":                  signer.Token(t, "JWT", jwt.MapClaims{"aud": []string{"project-other"}}),
		"expired":                         signer.Token(t, "JWT", jwt.MapClaims{"exp": time.Now().Add(-time.Minute).Unix()}),
		"not yet valid":                   signer.Token(t, "JWT", jwt.MapClaims{"nbf": time.Now().Add(time.Hour).Unix()}),
		"no expiry":                       signer.Token(t, "JWT", jwt.MapClaims{"exp": nil}),
		"no subject":                      signer.Token(t, "JWT", jwt.MapClaims{"sub": ""}),
		"signed by other key":             other.AccessToken(t),
		"HS256":                           symmetric,
		"garbage":                         "not-a-jwt",
	}
	for name, token := range cases {
		if _, err := verifier.Verify(context.Background(), token, nil); !errors.Is(err, sdkauth.ErrInvalidToken) {
			t.Errorf("%s: err = %v, want ErrInvalidToken", name, err)
		}
	}
}

func TestCallerOfRequiresAVerifiedToken(t *testing.T) {
	for name, req := range map[string]*mcp.CallToolRequest{
		"no extra":      {},
		"no token info": {Extra: &mcp.RequestExtra{}},
		"no token":      {Extra: &mcp.RequestExtra{TokenInfo: &sdkauth.TokenInfo{UserID: mcptest.Subject}}},
	} {
		if _, err := oauth.CallerOf(req); !errors.Is(err, oauth.ErrNoCaller) {
			t.Errorf("%s: err = %v, want ErrNoCaller", name, err)
		}
	}
}
