package services

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/Johnson-f/tradistry_backend/models"
	"github.com/gofiber/fiber/v2"
)

// SupabaseTradeService handles trade operations using Supabase
type SupabaseTradeService struct {
	db *DatabaseService
}

// NewSupabaseTradeService creates a new Supabase trade service
func NewSupabaseTradeService(db *DatabaseService) *SupabaseTradeService {
	return &SupabaseTradeService{
		db: db,
	}
}

// CreateTrade creates a new trade in Supabase
func (s *SupabaseTradeService) CreateTrade(ctx context.Context, userID int64, req models.TradeCreateRequest) (*models.Trade, error) {
	now := time.Now()
	
	trade := models.Trade{
		UserID:     userID,
		Symbol:     req.Symbol,
		Type:       req.Type,
		Status:     models.TradeOpen,
		Quantity:   req.Quantity,
		EntryPrice: req.EntryPrice,
		StopLoss:   req.StopLoss,
		TakeProfit: req.TakeProfit,
		Notes:      req.Notes,
		EntryDate:  req.EntryDate,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	err := s.db.Insert(ctx, "trades", trade)
	if err != nil {
		return nil, fmt.Errorf("failed to create trade: %w", err)
	}

	// Fetch the created trade to get the ID
	var createdTrades []models.Trade
	filters := map[string]interface{}{
		"user_id":    userID,
		"symbol":     req.Symbol,
		"created_at": now.Format(time.RFC3339),
	}
	
	err = s.db.Select(ctx, "trades", "*", filters, &createdTrades)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch created trade: %w", err)
	}

	if len(createdTrades) == 0 {
		return nil, fmt.Errorf("trade was created but not found")
	}

	return &createdTrades[0], nil
}

// GetTradeByID retrieves a trade by ID
func (s *SupabaseTradeService) GetTradeByID(ctx context.Context, userID, tradeID int64) (*models.Trade, error) {
	var trades []models.Trade
	filters := map[string]interface{}{
		"id":      tradeID,
		"user_id": userID,
	}

	err := s.db.Select(ctx, "trades", "*", filters, &trades)
	if err != nil {
		return nil, fmt.Errorf("failed to get trade: %w", err)
	}

	if len(trades) == 0 {
		return nil, fmt.Errorf("trade not found")
	}

	return &trades[0], nil
}

// GetUserTrades retrieves all trades for a user
func (s *SupabaseTradeService) GetUserTrades(ctx context.Context, userID int64) ([]models.Trade, error) {
	var trades []models.Trade
	filters := map[string]interface{}{
		"user_id": userID,
	}

	err := s.db.Select(ctx, "trades", "*", filters, &trades)
	if err != nil {
		return nil, fmt.Errorf("failed to get user trades: %w", err)
	}

	return trades, nil
}

// UpdateTrade updates an existing trade
func (s *SupabaseTradeService) UpdateTrade(ctx context.Context, userID, tradeID int64, req models.TradeUpdateRequest) (*models.Trade, error) {
	// First check if trade exists and belongs to user
	existingTrade, err := s.GetTradeByID(ctx, userID, tradeID)
	if err != nil {
		return nil, err
	}

	// Prepare update data
	updateData := map[string]interface{}{
		"updated_at": time.Now(),
	}

	if req.ExitPrice != nil {
		updateData["exit_price"] = *req.ExitPrice
		// Calculate PnL if exit price is provided
		if existingTrade.Type == models.TradeBuy {
			pnl := (*req.ExitPrice - existingTrade.EntryPrice) * existingTrade.Quantity
			updateData["pnl"] = pnl
		} else {
			pnl := (existingTrade.EntryPrice - *req.ExitPrice) * existingTrade.Quantity
			updateData["pnl"] = pnl
		}
	}

	if req.StopLoss != nil {
		updateData["stop_loss"] = *req.StopLoss
	}

	if req.TakeProfit != nil {
		updateData["take_profit"] = *req.TakeProfit
	}

	if req.Notes != "" {
		updateData["notes"] = req.Notes
	}

	if req.ExitDate != nil {
		updateData["exit_date"] = *req.ExitDate
	}

	if req.Status != "" {
		updateData["status"] = req.Status
	}

	// Update the trade
	filters := map[string]interface{}{
		"id":      tradeID,
		"user_id": userID,
	}

	err = s.db.Update(ctx, "trades", updateData, filters)
	if err != nil {
		return nil, fmt.Errorf("failed to update trade: %w", err)
	}

	// Return updated trade
	return s.GetTradeByID(ctx, userID, tradeID)
}

// DeleteTrade deletes a trade
func (s *SupabaseTradeService) DeleteTrade(ctx context.Context, userID, tradeID int64) error {
	// First check if trade exists and belongs to user
	_, err := s.GetTradeByID(ctx, userID, tradeID)
	if err != nil {
		return err
	}

	filters := map[string]interface{}{
		"id":      tradeID,
		"user_id": userID,
	}

	err = s.db.Delete(ctx, "trades", filters)
	if err != nil {
		return fmt.Errorf("failed to delete trade: %w", err)
	}

	return nil
}

// GetTradesByStatus retrieves trades by status for a user
func (s *SupabaseTradeService) GetTradesByStatus(ctx context.Context, userID int64, status models.TradeStatus) ([]models.Trade, error) {
	var trades []models.Trade
	filters := map[string]interface{}{
		"user_id": userID,
		"status":  status,
	}

	err := s.db.Select(ctx, "trades", "*", filters, &trades)
	if err != nil {
		return nil, fmt.Errorf("failed to get trades by status: %w", err)
	}

	return trades, nil
}

// getUserIDFromContext extracts user ID from fiber context
func (s *SupabaseTradeService) getUserIDFromContext(c *fiber.Ctx) (int64, error) {
	userIDStr, ok := c.Locals("userID").(string)
	if !ok || userIDStr == "" {
		return 0, fmt.Errorf("user ID not found in context")
	}
	
	// Convert string user ID to int64
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid user ID format: %w", err)
	}
	
	return userID, nil
}

// HTTP Handlers

// CreateTradeHandler handles POST /trades
func (s *SupabaseTradeService) CreateTradeHandler(c *fiber.Ctx) error {
	var req models.TradeCreateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Get user ID from context (set by auth middleware)
	userID, err := s.getUserIDFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Authentication required",
		})
	}

	trade, err := s.CreateTrade(c.Context(), userID, req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(trade)
}

// GetTradesHandler handles GET /trades
func (s *SupabaseTradeService) GetTradesHandler(c *fiber.Ctx) error {
	// Get user ID from context (set by auth middleware)
	userID, err := s.getUserIDFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Authentication required",
		})
	}

	trades, err := s.GetUserTrades(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(trades)
}

// GetTradeHandler handles GET /trades/:id
func (s *SupabaseTradeService) GetTradeHandler(c *fiber.Ctx) error {
	tradeID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid trade ID",
		})
	}

	// Get user ID from context (set by auth middleware)
	userID, err := s.getUserIDFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Authentication required",
		})
	}

	trade, err := s.GetTradeByID(c.Context(), userID, tradeID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(trade)
}

// UpdateTradeHandler handles PUT /trades/:id
func (s *SupabaseTradeService) UpdateTradeHandler(c *fiber.Ctx) error {
	tradeID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid trade ID",
		})
	}

	var req models.TradeUpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Get user ID from context (set by auth middleware)
	userID, err := s.getUserIDFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Authentication required",
		})
	}

	trade, err := s.UpdateTrade(c.Context(), userID, tradeID, req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(trade)
}

// DeleteTradeHandler handles DELETE /trades/:id
func (s *SupabaseTradeService) DeleteTradeHandler(c *fiber.Ctx) error {
	tradeID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid trade ID",
		})
	}

	// Get user ID from context (set by auth middleware)
	userID, err := s.getUserIDFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Authentication required",
		})
	}

	err = s.DeleteTrade(c.Context(), userID, tradeID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}

// CloseTrade handles closing a trade (placeholder implementation)
func (s *SupabaseTradeService) CloseTrade(c *fiber.Ctx) error {
	tradeID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid trade ID",
		})
	}

	// Get user ID from context (set by auth middleware)
	userID, err := s.getUserIDFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Authentication required",
		})
	}

	// For now, just update the trade status to closed
	req := models.TradeUpdateRequest{
		Status: models.TradeClosed,
	}

	trade, err := s.UpdateTrade(c.Context(), userID, tradeID, req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(trade)
}

// GetTradingSummary handles getting trading summary analytics (placeholder implementation)
func (s *SupabaseTradeService) GetTradingSummary(c *fiber.Ctx) error {
	// Get user ID from context (set by auth middleware)
	userID, err := s.getUserIDFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Authentication required",
		})
	}

	trades, err := s.GetUserTrades(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	// Calculate basic summary
	totalTrades := len(trades)
	var totalPnL float64
	profitableTrades := 0

	for _, trade := range trades {
		if trade.PnL != nil {
			totalPnL += *trade.PnL
			if *trade.PnL > 0 {
				profitableTrades++
			}
		}
	}

	winRate := float64(0)
	if totalTrades > 0 {
		winRate = float64(profitableTrades) / float64(totalTrades) * 100
	}

	summary := fiber.Map{
		"total_trades":      totalTrades,
		"profitable_trades": profitableTrades,
		"total_pnl":         totalPnL,
		"win_rate":          winRate,
	}

	return c.JSON(summary)
}

// GetPerformanceMetrics handles getting performance metrics (placeholder implementation)
func (s *SupabaseTradeService) GetPerformanceMetrics(c *fiber.Ctx) error {
	// Get user ID from context (set by auth middleware)
	userID, err := s.getUserIDFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Authentication required",
		})
	}

	trades, err := s.GetUserTrades(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	// Calculate basic performance metrics
	totalTrades := len(trades)
	var totalPnL, maxDrawdown, maxProfit float64
	profitableTrades := 0

	for _, trade := range trades {
		if trade.PnL != nil {
			pnl := *trade.PnL
			totalPnL += pnl
			if pnl > 0 {
				profitableTrades++
				if pnl > maxProfit {
					maxProfit = pnl
				}
			} else if pnl < maxDrawdown {
				maxDrawdown = pnl
			}
		}
	}

	avgPnL := float64(0)
	if totalTrades > 0 {
		avgPnL = totalPnL / float64(totalTrades)
	}

	metrics := fiber.Map{
		"total_trades":      totalTrades,
		"profitable_trades": profitableTrades,
		"total_pnl":         totalPnL,
		"average_pnl":       avgPnL,
		"max_profit":        maxProfit,
		"max_drawdown":      maxDrawdown,
	}

	return c.JSON(metrics)
}
