package clerk

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const bearerTokenKey = "bearer_token"

// Verifier accepts only Clerk OAuth access tokens from one Clerk instance. The
// backend's own check is looser (signature and expiry only), so this is what
// keeps web session tokens and tokens from other Clerk instances out.
type Verifier struct {
	issuer string
	keys   jwt.Keyfunc
}

func NewVerifier(ctx context.Context, issuer string) (*Verifier, error) {
	keys, err := keyfunc.NewDefaultCtx(ctx, []string{issuer + "/.well-known/jwks.json"})
	if err != nil {
		return nil, fmt.Errorf("load Clerk signing keys: %w", err)
	}
	return NewVerifierWithKeys(issuer, keys.Keyfunc), nil
}

func NewVerifierWithKeys(issuer string, keys jwt.Keyfunc) *Verifier {
	return &Verifier{issuer: issuer, keys: keys}
}

func (v *Verifier) Verify(_ context.Context, token string, _ *http.Request) (*sdkauth.TokenInfo, error) {
	var claims jwt.RegisteredClaims
	parsed, err := jwt.ParseWithClaims(token, &claims, v.keys,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(v.issuer),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(5*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", sdkauth.ErrInvalidToken, err)
	}
	if !isAccessToken(parsed.Header["typ"]) {
		return nil, fmt.Errorf("%w: not an OAuth access token", sdkauth.ErrInvalidToken)
	}
	if claims.Subject == "" {
		return nil, fmt.Errorf("%w: missing subject", sdkauth.ErrInvalidToken)
	}
	return &sdkauth.TokenInfo{
		UserID:     claims.Subject,
		Expiration: claims.ExpiresAt.Time,
		Extra:      map[string]any{bearerTokenKey: token},
	}, nil
}

// isAccessToken reports whether the JOSE typ header marks an RFC 9068 access
// token. Media types compare case-insensitively (RFC 7515 §4.1.9).
func isAccessToken(typ any) bool {
	s, _ := typ.(string)
	return strings.EqualFold(s, "at+jwt") || strings.EqualFold(s, "application/at+jwt")
}

// Caller is the user a tool call acts for.
type Caller struct {
	// Subject is the Clerk user ID.
	Subject string
	// Token is forwarded to the Tradstry API, which resolves the account from it.
	Token string
}

var ErrNoCaller = errors.New("request has no verified Tradstry login")

func CallerOf(req *mcp.CallToolRequest) (Caller, error) {
	if req.Extra == nil || req.Extra.TokenInfo == nil {
		return Caller{}, ErrNoCaller
	}
	info := req.Extra.TokenInfo
	token, _ := info.Extra[bearerTokenKey].(string)
	if token == "" || info.UserID == "" {
		return Caller{}, ErrNoCaller
	}
	return Caller{Subject: info.UserID, Token: token}, nil
}
