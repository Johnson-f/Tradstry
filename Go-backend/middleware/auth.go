package middleware

import (
	"strings"

	"github.com/Johnson-f/tradistry_backend/services"
	"github.com/gofiber/fiber/v2"
)

// AuthMiddleware handles authentication with Supabase JWT validation
func AuthMiddleware(authService *services.AuthService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get the Authorization header
		authHeader := c.Get("Authorization")
		
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Authorization header required",
			})
		}

		// Check if it's a Bearer token
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid authorization format. Use Bearer token",
			})
		}

		// Extract token (remove "Bearer " prefix)
		token := strings.TrimPrefix(authHeader, "Bearer ")
		
		if token == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Token required",
			})
		}

		// Validate the token and extract user claims
		user, err := authService.ValidateToken(token)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid or expired token",
			})
		}

		// Store user info in context for use in handlers
		c.Locals("user", user)
		c.Locals("userID", user.ID)
		c.Locals("userEmail", user.Email)
		c.Locals("userRole", user.Role)
		
		return c.Next()
	}
}

// OptionalAuthMiddleware handles optional authentication
func OptionalAuthMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		
		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			token := strings.TrimPrefix(authHeader, "Bearer ")
			if token != "" {
				// Store user ID in context if token is present
				c.Locals("userID", 1)
			}
		}
		
		return c.Next()
	}
}
