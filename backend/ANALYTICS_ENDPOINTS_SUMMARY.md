# Analytics Endpoints Summary

This document provides a comprehensive overview of all analytics endpoints available in the Tradistry backend, including the newly added functions.

## Overview

The analytics system now provides comprehensive trading performance metrics with support for:
- **Date Range Filtering**: 7d, 30d, 90d, 1y, YTD, all_time, custom
- **Multiple Asset Types**: Stocks, Options, and Combined Portfolio
- **Advanced Metrics**: Profit factors, hold times, biggest winners/losers
- **Special Analytics**: Daily P&L breakdowns, ticker summaries

## Stock Analytics Endpoints

### Core Metrics
- `GET /api/analytics/stocks/win-rate` - Win rate percentage
- `GET /api/analytics/stocks/average-gain` - Average gain for winning trades
- `GET /api/analytics/stocks/average-loss` - Average loss for losing trades
- `GET /api/analytics/stocks/risk-reward-ratio` - Risk to reward ratio
- `GET /api/analytics/stocks/trade-expectancy` - Expected value per trade
- `GET /api/analytics/stocks/net-pnl` - Net profit/loss

### Advanced Metrics (NEW)
- `GET /api/analytics/stocks/profit-factor` - Profit factor (gross profit / gross loss)
- `GET /api/analytics/stocks/avg-hold-time-winners` - Average hold time for winning trades
- `GET /api/analytics/stocks/avg-hold-time-losers` - Average hold time for losing trades
- `GET /api/analytics/stocks/biggest-winner` - Biggest winning trade profit
- `GET /api/analytics/stocks/biggest-loser` - Biggest losing trade loss

### Convenience Endpoints
- `GET /api/analytics/stocks/summary/{period_type}` - All stock metrics in one call

## Options Analytics Endpoints

### Core Metrics
- `GET /api/analytics/options/win-rate` - Win rate percentage
- `GET /api/analytics/options/average-gain` - Average gain for winning trades
- `GET /api/analytics/options/average-loss` - Average loss for losing trades
- `GET /api/analytics/options/risk-reward-ratio` - Risk to reward ratio
- `GET /api/analytics/options/trade-expectancy` - Expected value per trade
- `GET /api/analytics/options/net-pnl` - Net profit/loss

### Advanced Metrics (NEW)
- `GET /api/analytics/options/profit-factor` - Profit factor for options
- `GET /api/analytics/options/avg-hold-time-winners` - Average hold time for winning option trades
- `GET /api/analytics/options/avg-hold-time-losers` - Average hold time for losing option trades
- `GET /api/analytics/options/biggest-winner` - Biggest winning option trade profit
- `GET /api/analytics/options/biggest-loser` - Biggest losing option trade loss

### Convenience Endpoints
- `GET /api/analytics/options/summary/{period_type}` - All option metrics in one call

## Portfolio Analytics Endpoints

### Separate Analytics
- `GET /api/analytics/portfolio` - Detailed metrics for stocks and options separately

### Combined Analytics (NEW)
- `GET /api/analytics/portfolio/combined` - Analytics across all trades (stocks + options together)
- `GET /api/analytics/portfolio/combined/summary/{period_type}` - All combined metrics in one call

## Special Analytics Endpoints (NEW)

### Daily Performance
- `GET /api/analytics/daily-pnl-trades` - Daily P&L and trade count breakdown

### Ticker Analysis
- `GET /api/analytics/ticker-profit-summary` - Performance breakdown by individual symbols

## Database Functions Connected

### Stock Functions (05_Stocks_function/)
- `get_stock_profit_factor` → `/api/analytics/stocks/profit-factor`
- `get_avg_hold_time_winners` → `/api/analytics/stocks/avg-hold-time-winners`
- `get_avg_hold_time_losers` → `/api/analytics/stocks/avg-hold-time-losers`
- `get_biggest_winner` → `/api/analytics/stocks/biggest-winner`
- `get_biggest_loser` → `/api/analytics/stocks/biggest-loser`

### Options Functions (06_Options_function/)
- `get_options_profit_factor` → `/api/analytics/options/profit-factor`
- `get_options_avg_hold_time_winners` → `/api/analytics/options/avg-hold-time-winners`
- `get_options_avg_hold_time_losers` → `/api/analytics/options/avg-hold-time-losers`
- `get_options_biggest_winner` → `/api/analytics/options/biggest-winner`
- `get_options_biggest_loser` → `/api/analytics/options/biggest-loser`

### Combined Functions (07_Combined_functions/)
- `get_combined_profit_factor` → `/api/analytics/portfolio/combined` (profit_factor field)
- `get_combined_avg_hold_time_winners` → `/api/analytics/portfolio/combined` (avg_hold_time_winners field)
- `get_combined_avg_hold_time_losers` → `/api/analytics/portfolio/combined` (avg_hold_time_losers field)
- `get_combined_biggest_winner` → `/api/analytics/portfolio/combined` (biggest_winner field)
- `get_combined_biggest_loser` → `/api/analytics/portfolio/combined` (biggest_loser field)
- `get_combined_win_rate` → `/api/analytics/portfolio/combined` (win_rate field)
- `get_combined_average_gain` → `/api/analytics/portfolio/combined` (average_gain field)
- `get_combined_average_loss` → `/api/analytics/portfolio/combined` (average_loss field)
- `get_combined_risk_reward_ratio` → `/api/analytics/portfolio/combined` (risk_reward_ratio field)
- `get_combined_trade_expectancy` → `/api/analytics/portfolio/combined` (trade_expectancy field)

### Special Functions
- `get_daily_pnl_trades` → `/api/analytics/daily-pnl-trades`
- `get_ticker_profit_summary` → `/api/analytics/ticker-profit-summary`

## Query Parameters

All endpoints support the following query parameters:

### Date Range Filtering
- `period_type` (optional): `7d` | `30d` | `90d` | `1y` | `all_time` | `custom`
- `custom_start_date` (optional): ISO datetime string (required when period_type is 'custom')
- `custom_end_date` (optional): ISO datetime string

### Authentication
- `Authorization: Bearer <jwt_token>` header required for all endpoints

## Response Models

### StockAnalytics
```json
{
  "win_rate": 65.5,
  "average_gain": 150.25,
  "average_loss": 85.50,
  "risk_reward_ratio": 0.57,
  "trade_expectancy": 12.75,
  "net_pnl": 2450.80,
  "profit_factor": 1.76,
  "avg_hold_time_winners": 3.2,
  "avg_hold_time_losers": 1.8,
  "biggest_winner": 450.00,
  "biggest_loser": 200.00
}
```

### OptionAnalytics
```json
{
  "win_rate": 58.3,
  "average_gain": 220.40,
  "average_loss": 180.15,
  "risk_reward_ratio": 0.82,
  "trade_expectancy": 8.90,
  "net_pnl": 1890.45,
  "profit_factor": 1.22,
  "avg_hold_time_winners": 2.1,
  "avg_hold_time_losers": 1.5,
  "biggest_winner": 650.00,
  "biggest_loser": 350.00
}
```

### CombinedAnalytics
```json
{
  "win_rate": 62.1,
  "average_gain": 185.30,
  "average_loss": 132.80,
  "risk_reward_ratio": 0.72,
  "trade_expectancy": 15.25,
  "net_pnl": 3250.60,
  "profit_factor": 1.40,
  "avg_hold_time_winners": 3.5,
  "avg_hold_time_losers": 2.1,
  "biggest_winner": 850.00,
  "biggest_loser": 420.00
}
```

### DailyPnLTrade
```json
[
  {
    "trade_date": "2024-03-15",
    "total_pnl": 125.50,
    "total_trades": 3,
    "stock_trades": 2,
    "option_trades": 1
  }
]
```

### TickerProfitSummary
```json
[
  {
    "symbol": "AAPL",
    "total_trades": 15,
    "winning_trades": 10,
    "losing_trades": 5,
    "win_rate": 66.7,
    "total_profit": 1250.00,
    "total_loss": 450.00,
    "net_pnl": 800.00,
    "avg_profit": 125.00,
    "avg_loss": 90.00
  }
]
```

## Usage Examples

### Get 30-day stock profit factor
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/stocks/profit-factor?period_type=30d"
```

### Get combined portfolio analytics for custom date range
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/portfolio/combined?period_type=custom&custom_start_date=2024-01-01T00:00:00&custom_end_date=2024-03-31T23:59:59"
```

### Get daily P&L breakdown for last 7 days
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/daily-pnl-trades?period_type=7d"
```

### Get comprehensive stock summary for last 30 days
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/stocks/summary/30d"
```

## Testing

Use the provided test script to verify database function connectivity:

```bash
cd backend
python test_analytics.py
```

This will test all the new analytics functions and verify they're properly connected to the database.

## Notes

- All functions use RLS (Row Level Security) for user data isolation
- Date filtering is applied at the database level for performance
- Functions handle edge cases (no trades, all wins, etc.) gracefully
- All monetary values are returned in the account's base currency
- Hold times are returned in days as decimal values 