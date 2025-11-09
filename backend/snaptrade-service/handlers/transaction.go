package handlers

import (
	"snaptrade-service/client"

	"github.com/gofiber/fiber/v2"
)

// GetTransactionsRequest represents the request to get transactions
type GetTransactionsRequest struct {
	UserSecret string  `json:"user_secret"`
	StartDate  *string `json:"start_date,omitempty"`
	EndDate    *string `json:"end_date,omitempty"`
}

// GetTransactions fetches transactions for an account
func GetTransactions(snapTradeClient *client.SnapTradeClient) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userId := c.Get("X-User-Id")
		if userId == "" {
			return c.Status(401).JSON(fiber.Map{
				"error": "Missing user ID",
			})
		}

		accountId := c.Params("accountId")
		if accountId == "" {
			return c.Status(400).JSON(fiber.Map{
				"error": "account_id is required",
			})
		}

		// Get user_secret from header or query parameter
		userSecret := c.Get("X-User-Secret")
		if userSecret == "" {
			userSecret = c.Query("user_secret")
		}
		if userSecret == "" {
			return c.Status(400).JSON(fiber.Map{
				"error": "user_secret is required (header X-User-Secret or query param)",
			})
		}

		startDate := c.Query("start_date")
		endDate := c.Query("end_date")
		var startDatePtr *string
		var endDatePtr *string
		if startDate != "" {
			startDatePtr = &startDate
		}
		if endDate != "" {
			endDatePtr = &endDate
		}

		transactions, err := snapTradeClient.GetTransactions(userId, userSecret, accountId, startDatePtr, endDatePtr)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error": err.Error(),
			})
		}

		return c.JSON(transactions)
	}
}

// GetHoldings fetches current positions for an account
func GetHoldings(snapTradeClient *client.SnapTradeClient) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userId := c.Get("X-User-Id")
		if userId == "" {
			return c.Status(401).JSON(fiber.Map{
				"error": "Missing user ID",
			})
		}

		accountId := c.Params("accountId")
		if accountId == "" {
			return c.Status(400).JSON(fiber.Map{
				"error": "account_id is required",
			})
		}

		// Get user_secret from header or query parameter
		userSecret := c.Get("X-User-Secret")
		if userSecret == "" {
			userSecret = c.Query("user_secret")
		}
		if userSecret == "" {
			return c.Status(400).JSON(fiber.Map{
				"error": "user_secret is required (header X-User-Secret or query param)",
			})
		}

		holdings, err := snapTradeClient.GetHoldings(userId, userSecret, accountId)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error": err.Error(),
			})
		}

		return c.JSON(holdings)
	}
}
