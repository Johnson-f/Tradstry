package clerk_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/clerk"
	"tradstry-mcp/mcptest"
)

func TestVerifyAcceptsClerkOAuthAccessTokens(t *testing.T) {
	signer := mcptest.NewSigner(t)
	verifier := clerk.NewVerifierWithKeys(mcptest.Issuer, signer.Keyfunc)

	for _, typ := range []string{"at+jwt", "application/at+jwt", "AT+JWT"} {
		token := signer.Token(t, typ, nil)
		info, err := verifier.Verify(context.Background(), token, nil)
		if err != nil {
			t.Fatalf("typ %q: %v", typ, err)
		}
		caller, err := clerk.CallerOf(&mcp.CallToolRequest{Extra: &mcp.RequestExtra{TokenInfo: info}})
		if err != nil || caller.Subject != mcptest.Subject || caller.Token != token {
			t.Errorf("typ %q: caller = %+v, err = %v", typ, caller, err)
		}
	}
}

func TestVerifyRejectsTokensThatAreNotThisInstancesAccessTokens(t *testing.T) {
	signer := mcptest.NewSigner(t)
	other := mcptest.NewSigner(t)
	verifier := clerk.NewVerifierWithKeys(mcptest.Issuer, signer.Keyfunc)

	hs256 := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"iss": mcptest.Issuer, "sub": mcptest.Subject, "exp": time.Now().Add(time.Hour).Unix(),
	})
	hs256.Header["typ"] = "at+jwt"
	symmetric, err := hs256.SignedString([]byte("secret"))
	if err != nil {
		t.Fatal(err)
	}

	cases := map[string]string{
		"web session token":   signer.Token(t, "JWT", nil),
		"untyped token":       signer.Token(t, "", nil),
		"other Clerk issuer":  signer.Token(t, "at+jwt", jwt.MapClaims{"iss": "https://clerk.example.com"}),
		"expired":             signer.Token(t, "at+jwt", jwt.MapClaims{"exp": time.Now().Add(-time.Minute).Unix()}),
		"not yet valid":       signer.Token(t, "at+jwt", jwt.MapClaims{"nbf": time.Now().Add(time.Hour).Unix()}),
		"no expiry":           signer.Token(t, "at+jwt", jwt.MapClaims{"exp": nil}),
		"no subject":          signer.Token(t, "at+jwt", jwt.MapClaims{"sub": ""}),
		"signed by other key": other.AccessToken(t),
		"HS256":               symmetric,
		"garbage":             "not-a-jwt",
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
		if _, err := clerk.CallerOf(req); !errors.Is(err, clerk.ErrNoCaller) {
			t.Errorf("%s: err = %v, want ErrNoCaller", name, err)
		}
	}
}

func TestVerifyChecksTheAudienceTheTokenNames(t *testing.T) {
	signer := mcptest.NewSigner(t)
	audiences := []string{"https://mcp.tradstry.com", "https://mcp.tradstry.com/mcp"}
	lenient := clerk.NewVerifierWithKeys(mcptest.Issuer, signer.Keyfunc).WithAudience(audiences, false)
	strict := clerk.NewVerifierWithKeys(mcptest.Issuer, signer.Keyfunc).WithAudience(audiences, true)

	cases := []struct {
		name            string
		aud             any
		lenient, strict bool
	}{
		{"this server's endpoint", "https://mcp.tradstry.com/mcp", true, true},
		{"this server's origin", []string{"https://mcp.tradstry.com"}, true, true},
		{"one of several", []string{"https://other.example.com", "https://mcp.tradstry.com/mcp"}, true, true},
		{"another server", "https://other.example.com/mcp", false, false},
		{"no audience", nil, true, false},
	}
	for _, c := range cases {
		claims := jwt.MapClaims{}
		if c.aud != nil {
			claims["aud"] = c.aud
		}
		token := signer.Token(t, "at+jwt", claims)
		for verifier, want := range map[*clerk.Verifier]bool{lenient: c.lenient, strict: c.strict} {
			_, err := verifier.Verify(context.Background(), token, nil)
			if got := err == nil; got != want {
				t.Errorf("%s (strict %v): accepted = %v, err = %v", c.name, verifier == strict, got, err)
			}
			if err != nil && !errors.Is(err, sdkauth.ErrInvalidToken) {
				t.Errorf("%s: err = %v, want ErrInvalidToken", c.name, err)
			}
		}
	}
}
