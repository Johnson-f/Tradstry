package handlers

import (
	"strings"
	"snaptrade-service/client"

	"github.com/gofiber/fiber/v2"
)

// CreateUserRequest represents the request to create a SnapTrade user
type CreateUserRequest struct {
	UserId string `json:"user_id"`
}

// CreateUserResponse represents the response from creating a user
type CreateUserResponse struct {
	UserId       string `json:"user_id"`
	UserSecret   string `json:"user_secret"`
}

// CreateSnapTradeUser creates a new SnapTrade user
func CreateSnapTradeUser(snapTradeClient *client.SnapTradeClient) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userId := c.Get("X-User-Id")
		if userId == "" {
			return c.Status(401).JSON(fiber.Map{
				"error": "Missing user ID",
			})
		}

		var req CreateUserRequest
		if err := c.BodyParser(&req); err != nil {
			// If body parsing fails, use the userId from header
			req.UserId = userId
		}

		// Use userId from header if not provided in body
		if req.UserId == "" {
			req.UserId = userId
		}

		result, err := snapTradeClient.CreateUser(req.UserId)
		if err != nil {
			// Check if error is due to user already existing
			errorMsg := err.Error()
			if strings.Contains(errorMsg, "400") || strings.Contains(errorMsg, "already exist") {
				// User might already exist - return 400 instead of 500
				return c.Status(400).JSON(fiber.Map{
					"error": errorMsg,
				})
			}
			return c.Status(500).JSON(fiber.Map{
				"error": errorMsg,
			})
		}

		return c.JSON(CreateUserResponse{
			UserId:     result.GetUserId(),
			UserSecret: result.GetUserSecret(),
		})
	}
}

// GetSnapTradeUser gets information about a SnapTrade user (if needed)
func GetSnapTradeUser(snapTradeClient *client.SnapTradeClient) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userId := c.Get("X-User-Id")
		if userId == "" {
			return c.Status(401).JSON(fiber.Map{
				"error": "Missing user ID",
			})
		}

		// For now, just return the user ID
		// SnapTrade doesn't have a direct "get user" endpoint
		return c.JSON(fiber.Map{
			"user_id": userId,
		})
	}
}
