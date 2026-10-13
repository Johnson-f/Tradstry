package oauth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const bearerTokenKey = "bearer_token"

// Verifier accepts only OAuth access tokens that a Stytch Connected App issued
// for this server. The backend's own check is looser, so this is what keeps
// session tokens and tokens meant for other projects out.
type Verifier struct {
	issuer   string
	audience string
	keys     jwt.Keyfunc
}

type claims struct {
	jwt.RegisteredClaims
	ClientID string `json:"client_id"`
	Scope    string `json:"scope"`
}

func NewVerifier(ctx context.Context, issuer, audience string) (*Verifier, error) {
	keys, err := keyfunc.NewDefaultCtx(ctx, []string{issuer + "/.well-known/jwks.json"})
	if err != nil {
		return nil, fmt.Errorf("load OAuth signing keys: %w", err)
	}
	return NewVerifierWithKeys(issuer, audience, keys.Keyfunc), nil
}

func NewVerifierWithKeys(issuer, audience string, keys jwt.Keyfunc) *Verifier {
	return &Verifier{issuer: issuer, audience: audience, keys: keys}
}

// Verify accepts only a JWT access token from the configured issuer. A
// rejection is logged with its reason, never the token, because the client only
// sees a bare 401.
func (v *Verifier) Verify(ctx context.Context, token string, r *http.Request) (*sdkauth.TokenInfo, error) {
	info, err := v.verify(token)
	if err != nil {
		slog.Warn("rejected an MCP access token", "reason", err.Error(), "issuer", v.issuer)
	}
	return info, err
}

func (v *Verifier) verify(token string) (*sdkauth.TokenInfo, error) {
	var c claims
	_, err := jwt.ParseWithClaims(token, &c, v.keys,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience(v.audience),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(5*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", sdkauth.ErrInvalidToken, err)
	}
	if c.Subject == "" {
		return nil, fmt.Errorf("%w: missing subject", sdkauth.ErrInvalidToken)
	}
	// Session JWTs share the issuer and signing keys but carry no client_id.
	if c.ClientID == "" {
		return nil, fmt.Errorf("%w: not an OAuth access token", sdkauth.ErrInvalidToken)
	}
	return &sdkauth.TokenInfo{
		UserID:     c.Subject,
		Scopes:     strings.Fields(c.Scope),
		Expiration: c.ExpiresAt.Time,
		Extra:      map[string]any{bearerTokenKey: token},
	}, nil
}

// Caller is the user a tool call acts for.
type Caller struct {
	// Subject is the Stytch user ID.
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
