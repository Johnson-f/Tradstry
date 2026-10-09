// Package mcptest runs the real server against a fake Tradstry API, for tests.
package mcptest

import (
	"crypto/rand"
	"crypto/rsa"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	Issuer  = "https://clerk.test.tradstry.com"
	Subject = "user_123"
)

// Signer mints Clerk-shaped tokens with a throwaway key.
type Signer struct {
	key *rsa.PrivateKey
}

func NewSigner(t *testing.T) *Signer {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return &Signer{key: key}
}

func (s *Signer) Keyfunc(*jwt.Token) (any, error) {
	return &s.key.PublicKey, nil
}

// Token returns a token with the given JOSE typ header. Claims left unset
// default to a valid Clerk OAuth access token for Subject.
func (s *Signer) Token(t *testing.T, typ string, claims jwt.MapClaims) string {
	t.Helper()
	all := jwt.MapClaims{
		"iss": Issuer,
		"sub": Subject,
		"exp": time.Now().Add(time.Hour).Unix(),
	}
	for k, v := range claims {
		all[k] = v
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, all)
	token.Header["typ"] = typ
	signed, err := token.SignedString(s.key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func (s *Signer) AccessToken(t *testing.T) string {
	return s.Token(t, "at+jwt", nil)
}
