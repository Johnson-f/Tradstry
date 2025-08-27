package services

import (
	"fmt"
	"strings"
	"time"

	"github.com/Johnson-f/tradistry_backend/config"
	"github.com/golang-jwt/jwt/v5"
	"github.com/supabase-community/supabase-go"
)

// AuthService handles authentication operations
type AuthService struct {
	supabase *supabase.Client
	config   *config.Config
}

// AuthUser represents the authenticated user
type AuthUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// SupabaseClaims represents the JWT claims structure from Supabase
type SupabaseClaims struct {
	Sub   string `json:"sub"`   // User ID
	Email string `json:"email"`
	Role  string `json:"role"`
	Aud   string `json:"aud"`   // Audience
	Exp   int64  `json:"exp"`   // Expiration time
	Iat   int64  `json:"iat"`   // Issued at
	Iss   string `json:"iss"`   // Issuer
	jwt.RegisteredClaims
}

// NewAuthService creates a new authentication service
func NewAuthService(cfg *config.Config) (*AuthService, error) {
	client, err := supabase.NewClient(cfg.Supabase.URL, cfg.Supabase.AnonKey, &supabase.ClientOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create supabase client: %w", err)
	}

	return &AuthService{
		supabase: client,
		config:   cfg,
	}, nil
}

// ValidateToken validates a Supabase JWT token and extracts user claims
func (a *AuthService) ValidateToken(tokenString string) (*AuthUser, error) {
	// Clean the token (remove "Bearer " prefix if present)
	cleanToken := strings.TrimPrefix(tokenString, "Bearer ")
	
	if cleanToken == "" {
		return nil, fmt.Errorf("token is required")
	}

	// Parse the token with Supabase claims
	token, err := jwt.ParseWithClaims(cleanToken, &SupabaseClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify the signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		// Return the JWT secret for validation
		return []byte(a.config.JWT.Secret), nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	// Extract claims
	claims, ok := token.Claims.(*SupabaseClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	// Check token expiration
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("token has expired")
	}

	// Extract user information from claims
	return &AuthUser{
		ID:    claims.Sub,
		Email: claims.Email,
		Role:  claims.Role,
	}, nil
}

// GetAuthenticatedClient returns a Supabase client with authentication
func (a *AuthService) GetAuthenticatedClient(accessToken string) (*supabase.Client, error) {
	// Create authenticated client using service key for backend operations
	client, err := supabase.NewClient(a.config.Supabase.URL, a.config.Supabase.ServiceKey, &supabase.ClientOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create authenticated client: %w", err)
	}

	return client, nil
}

// GetUserFromToken extracts user information from a token
func (a *AuthService) GetUserFromToken(tokenString string) (*AuthUser, error) {
	return a.ValidateToken(tokenString)
}

// GetUserIDFromToken extracts just the user ID from a JWT token
func (a *AuthService) GetUserIDFromToken(tokenString string) (string, error) {
	user, err := a.ValidateToken(tokenString)
	if err != nil {
		return "", err
	}
	return user.ID, nil
}
