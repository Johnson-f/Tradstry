package clerk

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
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
	// audiences are the identifiers this server answers to. A token that names
	// an audience must name one of them.
	audiences []string
	// requireAudience also rejects tokens that name no audience, once Clerk is
	// set to include one and every client sends the resource parameter.
	requireAudience bool
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

// WithAudience makes v accept only tokens issued for one of audiences. Without
// require, a token naming no audience is still accepted, and logged.
func (v *Verifier) WithAudience(audiences []string, require bool) *Verifier {
	v.audiences, v.requireAudience = audiences, require
	return v
}

// Verify accepts only a JWT access token from the configured Clerk issuer. A
// rejection is logged with its reason, never the token, because the client only
// sees a bare 401.
func (v *Verifier) Verify(ctx context.Context, token string, r *http.Request) (*sdkauth.TokenInfo, error) {
	info, err := v.verify(token)
	if err != nil {
		reason := err.Error()
		if strings.Count(token, ".") != 2 {
			reason = "the token is not a JWT; turn on JWT access tokens for OAuth applications in Clerk"
		}
		slog.Warn("rejected an MCP access token", "reason", reason, "issuer", v.issuer)
	}
	return info, err
}

func (v *Verifier) verify(token string) (*sdkauth.TokenInfo, error) {
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
	if err := v.checkAudience(claims.Audience); err != nil {
		return nil, err
	}
	return &sdkauth.TokenInfo{
		UserID:     claims.Subject,
		Expiration: claims.ExpiresAt.Time,
		Extra:      map[string]any{bearerTokenKey: token},
	}, nil
}

func (v *Verifier) checkAudience(audience jwt.ClaimStrings) error {
	if len(v.audiences) == 0 {
		return nil
	}
	if len(audience) == 0 {
		if v.requireAudience {
			return fmt.Errorf("%w: the token names no audience; turn on Include Audience for OAuth applications in Clerk", sdkauth.ErrInvalidToken)
		}
		slog.Info("accepted an MCP access token that names no audience")
		return nil
	}
	for _, aud := range audience {
		if slices.Contains(v.audiences, aud) {
			return nil
		}
	}
	return fmt.Errorf("%w: the token was issued for %v, not this server", sdkauth.ErrInvalidToken, []string(audience))
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
