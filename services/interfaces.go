package services

import (
	"context"

	"github.com/Johnson-f/tradistry_backend/models"
	"github.com/gofiber/fiber/v2"
)

// UserServiceInterface defines the contract for user services
type UserServiceInterface interface {
	CreateUserHandler(c *fiber.Ctx) error
	GetUsersHandler(c *fiber.Ctx) error
	GetUserHandler(c *fiber.Ctx) error
	UpdateUserHandler(c *fiber.Ctx) error
	DeleteUserHandler(c *fiber.Ctx) error
}

// TradeServiceInterface defines the contract for trade services
type TradeServiceInterface interface {
	CreateTradeHandler(c *fiber.Ctx) error
	GetTradesHandler(c *fiber.Ctx) error
	GetTradeHandler(c *fiber.Ctx) error
	UpdateTradeHandler(c *fiber.Ctx) error
	DeleteTradeHandler(c *fiber.Ctx) error
	CloseTrade(c *fiber.Ctx) error
	GetTradingSummary(c *fiber.Ctx) error
	GetPerformanceMetrics(c *fiber.Ctx) error
}

// UserRepositoryInterface defines the contract for user data operations
type UserRepositoryInterface interface {
	CreateUser(ctx context.Context, req models.UserCreateRequest) (*models.User, error)
	GetUserByID(ctx context.Context, userID int64) (*models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	GetUserByUsername(ctx context.Context, username string) (*models.User, error)
	UpdateUser(ctx context.Context, userID int64, updates map[string]interface{}) (*models.User, error)
	DeleteUser(ctx context.Context, userID int64) error
	GetAllUsers(ctx context.Context) ([]models.User, error)
	UserExists(ctx context.Context, email, username string) (bool, error)
}

// TradeRepositoryInterface defines the contract for trade data operations
type TradeRepositoryInterface interface {
	CreateTrade(ctx context.Context, userID int64, req models.TradeCreateRequest) (*models.Trade, error)
	GetTradeByID(ctx context.Context, userID, tradeID int64) (*models.Trade, error)
	GetUserTrades(ctx context.Context, userID int64) ([]models.Trade, error)
	UpdateTrade(ctx context.Context, userID, tradeID int64, req models.TradeUpdateRequest) (*models.Trade, error)
	DeleteTrade(ctx context.Context, userID, tradeID int64) error
	GetTradesByStatus(ctx context.Context, userID int64, status models.TradeStatus) ([]models.Trade, error)
}
