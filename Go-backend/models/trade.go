package models

import (
	"time"
)

// TradeType represents the type of trade (buy/sell)
type TradeType string

const (
	TradeBuy  TradeType = "buy"
	TradeSell TradeType = "sell"
)

// TradeStatus represents the status of a trade
type TradeStatus string

const (
	TradeOpen   TradeStatus = "open"
	TradeClosed TradeStatus = "closed"
)

// Trade represents a trading transaction
type Trade struct {
	ID          int64       `json:"id" db:"id"`
	UserID      int64       `json:"user_id" db:"user_id"`
	Symbol      string      `json:"symbol" db:"symbol"`
	Type        TradeType   `json:"type" db:"type"`
	Status      TradeStatus `json:"status" db:"status"`
	Quantity    float64     `json:"quantity" db:"quantity"`
	EntryPrice  float64     `json:"entry_price" db:"entry_price"`
	ExitPrice   *float64    `json:"exit_price,omitempty" db:"exit_price"`
	StopLoss    *float64    `json:"stop_loss,omitempty" db:"stop_loss"`
	TakeProfit  *float64    `json:"take_profit,omitempty" db:"take_profit"`
	PnL         *float64    `json:"pnl,omitempty" db:"pnl"`
	Notes       string      `json:"notes" db:"notes"`
	EntryDate   time.Time   `json:"entry_date" db:"entry_date"`
	ExitDate    *time.Time  `json:"exit_date,omitempty" db:"exit_date"`
	CreatedAt   time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at" db:"updated_at"`
}

// TradeCreateRequest represents the request payload for creating a trade
type TradeCreateRequest struct {
	Symbol     string    `json:"symbol" validate:"required"`
	Type       TradeType `json:"type" validate:"required,oneof=buy sell"`
	Quantity   float64   `json:"quantity" validate:"required,gt=0"`
	EntryPrice float64   `json:"entry_price" validate:"required,gt=0"`
	StopLoss   *float64  `json:"stop_loss" validate:"omitempty,gt=0"`
	TakeProfit *float64  `json:"take_profit" validate:"omitempty,gt=0"`
	Notes      string    `json:"notes"`
	EntryDate  time.Time `json:"entry_date" validate:"required"`
}

// TradeUpdateRequest represents the request payload for updating a trade
type TradeUpdateRequest struct {
	ExitPrice  *float64   `json:"exit_price" validate:"omitempty,gt=0"`
	StopLoss   *float64   `json:"stop_loss" validate:"omitempty,gt=0"`
	TakeProfit *float64   `json:"take_profit" validate:"omitempty,gt=0"`
	Notes      string     `json:"notes"`
	ExitDate   *time.Time `json:"exit_date"`
	Status     TradeStatus `json:"status" validate:"omitempty,oneof=open closed"`
}
