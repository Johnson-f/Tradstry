package routers

import (
	"github.com/Johnson-f/tradistry_backend/services"
	"github.com/gofiber/fiber/v2"
)

// TradeRouter handles trade-related routes
type TradeRouter struct {
	tradeService services.TradeServiceInterface
}

// NewTradeRouter creates a new trade router instance
func NewTradeRouter(tradeService services.TradeServiceInterface) *TradeRouter {
	return &TradeRouter{
		tradeService: tradeService,
	}
}

// SetupTradeRoutes configures trade routes
func (tr *TradeRouter) SetupTradeRoutes(api fiber.Router) {
	trades := api.Group("/trades")

	trades.Post("/", tr.CreateTrade)
	trades.Get("/", tr.GetTrades)
	trades.Get("/:id", tr.GetTrade)
	trades.Put("/:id", tr.UpdateTrade)
	trades.Delete("/:id", tr.DeleteTrade)
	trades.Post("/:id/close", tr.CloseTrade)
	
	// Analytics routes
	trades.Get("/analytics/summary", tr.GetTradingSummary)
	trades.Get("/analytics/performance", tr.GetPerformanceMetrics)
}

// CreateTrade handles trade creation
func (tr *TradeRouter) CreateTrade(c *fiber.Ctx) error {
	return tr.tradeService.CreateTradeHandler(c)
}

// GetTrades handles getting all trades for a user
func (tr *TradeRouter) GetTrades(c *fiber.Ctx) error {
	return tr.tradeService.GetTradesHandler(c)
}

// GetTrade handles getting a single trade
func (tr *TradeRouter) GetTrade(c *fiber.Ctx) error {
	return tr.tradeService.GetTradeHandler(c)
}

// UpdateTrade handles trade updates
func (tr *TradeRouter) UpdateTrade(c *fiber.Ctx) error {
	return tr.tradeService.UpdateTradeHandler(c)
}

// DeleteTrade handles trade deletion
func (tr *TradeRouter) DeleteTrade(c *fiber.Ctx) error {
	return tr.tradeService.DeleteTradeHandler(c)
}

// CloseTrade handles closing a trade
func (tr *TradeRouter) CloseTrade(c *fiber.Ctx) error {
	return tr.tradeService.CloseTrade(c)
}

// GetTradingSummary handles getting trading summary analytics
func (tr *TradeRouter) GetTradingSummary(c *fiber.Ctx) error {
	return tr.tradeService.GetTradingSummary(c)
}

// GetPerformanceMetrics handles getting performance metrics
func (tr *TradeRouter) GetPerformanceMetrics(c *fiber.Ctx) error {
	return tr.tradeService.GetPerformanceMetrics(c)
}
