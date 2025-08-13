# Analytics API Usage Guide

This document provides examples of how to use the enhanced analytics endpoints with date range filtering.

## Overview

All analytics endpoints now support optional date range filtering through query parameters:

- `period_type`: Predefined period types (`7d`, `30d`, `90d`, `1y`, `all_time`, `custom`)
- `custom_start_date`: Start date for custom periods (ISO format: `YYYY-MM-DDTHH:MM:SS`)
- `custom_end_date`: End date for custom periods (ISO format: `YYYY-MM-DDTHH:MM:SS`)

## Authentication

All endpoints require Bearer token authentication:

```http
Authorization: Bearer <your_jwt_token>
```

## Stock Analytics Endpoints

### Core Metrics

```http
GET /api/analytics/stocks/win-rate
GET /api/analytics/stocks/average-gain
GET /api/analytics/stocks/average-loss
GET /api/analytics/stocks/risk-reward-ratio
GET /api/analytics/stocks/trade-expectancy
GET /api/analytics/stocks/net-pnl
```

### Advanced Metrics

```http
GET /api/analytics/stocks/profit-factor
GET /api/analytics/stocks/avg-hold-time-winners
GET /api/analytics/stocks/avg-hold-time-losers
GET /api/analytics/stocks/biggest-winner
GET /api/analytics/stocks/biggest-loser
```

**Examples:**

```bash
# Get all-time win rate (default)
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/stocks/win-rate"

# Get 30-day profit factor
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/stocks/profit-factor?period_type=30d"

# Get custom date range biggest winner
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/stocks/biggest-winner?period_type=custom&custom_start_date=2024-01-01T00:00:00&custom_end_date=2024-03-31T23:59:59"
```

## Options Analytics Endpoints

### Core Metrics

```http
GET /api/analytics/options/win-rate
GET /api/analytics/options/average-gain
GET /api/analytics/options/average-loss
GET /api/analytics/options/risk-reward-ratio
GET /api/analytics/options/trade-expectancy
GET /api/analytics/options/net-pnl
```

### Advanced Metrics

```http
GET /api/analytics/options/profit-factor
GET /api/analytics/options/avg-hold-time-winners
GET /api/analytics/options/avg-hold-time-losers
GET /api/analytics/options/biggest-winner
GET /api/analytics/options/biggest-loser
```

## Portfolio Analytics

### Separate Analytics

```http
GET /api/analytics/portfolio
```

Returns comprehensive analytics for both stocks and options separately.

### Combined Analytics

```http
GET /api/analytics/portfolio/combined
```

Returns analytics calculated across all trades regardless of type (stocks + options together).

**Example:**

```bash
# Get 1-year combined portfolio analytics
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/portfolio/combined?period_type=1y"
```

**Response:**

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
  "biggest_loser": 420.00,
  "period_info": {
    "period_type": "1y",
    "custom_start_date": null,
    "custom_end_date": null
  }
}
```

## Special Analytics Endpoints

### Daily P&L and Trades

```http
GET /api/analytics/daily-pnl-trades
```

Returns daily breakdown of portfolio performance.

**Example:**

```bash
# Get daily P&L for last 30 days
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/daily-pnl-trades?period_type=30d"
```

**Response:**

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

### Ticker Profit Summary

```http
GET /api/analytics/ticker-profit-summary
```

Returns performance breakdown by individual symbols.

**Example:**

```bash
# Get ticker summary for all time
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/ticker-profit-summary"
```

**Response:**

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

## Convenience Endpoints

### Stock Summary by Period

```http
GET /api/analytics/stocks/summary/{period_type}
```

**Examples:**

```bash
# Get 30-day stock summary
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/stocks/summary/30d"
```

### Options Summary by Period

```http
GET /api/analytics/options/summary/{period_type}
```

### Combined Portfolio Summary by Period

```http
GET /api/analytics/portfolio/combined/summary/{period_type}
```

## Period Types

| Period Type | Description |
|-------------|-------------|
| `7d` | Last 7 days |
| `30d` | Last 30 days |
| `90d` | Last 90 days |
| `1y` | Last 1 year |
| `all_time` | All historical data (default) |
| `custom` | Custom date range (requires `custom_start_date`) |

## Custom Date Range Rules

When using `period_type=custom`:

1. `custom_start_date` is **required**
2. `custom_end_date` is optional (defaults to current time)
3. Dates must be in ISO format: `YYYY-MM-DDTHH:MM:SS`
4. `custom_start_date` cannot be in the future
5. `custom_end_date` must be after `custom_start_date`

## Error Responses

### 400 Bad Request

```json
{
  "detail": "custom_start_date is required when period_type is 'custom'"
}
```

```json
{
  "detail": "custom_end_date must be after custom_start_date"
}
```

### 401 Unauthorized

```json
{
  "detail": "Could not validate credentials"
}
```

## JavaScript/TypeScript Examples

### Using Fetch API

```javascript
const getStockAnalytics = async (periodType = 'all_time', startDate = null, endDate = null) => {
  const params = new URLSearchParams({ period_type: periodType });
  
  if (periodType === 'custom' && startDate) {
    params.append('custom_start_date', startDate);
    if (endDate) params.append('custom_end_date', endDate);
  }

  const response = await fetch(`/api/analytics/stocks/win-rate?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  return await response.json();
};

// Usage examples
const allTimeWinRate = await getStockAnalytics();
const monthlyWinRate = await getStockAnalytics('30d');
const customWinRate = await getStockAnalytics('custom', '2024-01-01T00:00:00', '2024-03-31T23:59:59');
```

### Using Axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const getPortfolioAnalytics = async (periodType = 'all_time') => {
  const { data } = await api.get('/analytics/portfolio', {
    params: { period_type: periodType }
  });
  return data;
};

const getCombinedAnalytics = async (periodType = 'all_time') => {
  const { data } = await api.get('/analytics/portfolio/combined', {
    params: { period_type: periodType }
  });
  return data;
};
```

## Integration Tips

1. **Default Behavior**: All endpoints default to `all_time` if no parameters are provided
2. **Backward Compatibility**: Existing API calls will continue to work without modification
3. **Performance**: Shorter time periods generally perform better than all-time queries
4. **Caching**: Consider caching results for frequently requested periods
5. **Time Zones**: All dates are handled in UTC on the server side

## Common Use Cases

### Dashboard Widgets

```javascript
// Get key metrics for dashboard cards
const getDashboardMetrics = async () => {
  const [winRate, netPnl, profitFactor] = await Promise.all([
    fetch('/api/analytics/stocks/win-rate?period_type=30d'),
    fetch('/api/analytics/stocks/net-pnl?period_type=30d'),
    fetch('/api/analytics/stocks/profit-factor?period_type=30d')
  ]).then(responses => Promise.all(responses.map(r => r.json())));

  return { winRate, netPnl, profitFactor };
};
```

### Performance Comparison

```javascript
// Compare performance across different periods
const getPerformanceComparison = async () => {
  const periods = ['7d', '30d', '90d', '1y'];
  
  const results = await Promise.all(
    periods.map(async (period) => {
      const portfolio = await fetch(`/api/analytics/portfolio/combined?period_type=${period}`)
        .then(r => r.json());
      return { period, ...portfolio };
    })
  );

  return results;
};
```

### Custom Quarterly Reports

```javascript
// Get quarterly performance data
const getQuarterlyReport = async (year, quarter) => {
  const quarters = {
    1: { start: `${year}-01-01T00:00:00`, end: `${year}-03-31T23:59:59` },
    2: { start: `${year}-04-01T00:00:00`, end: `${year}-06-30T23:59:59` },
    3: { start: `${year}-07-01T00:00:00`, end: `${year}-09-30T23:59:59` },
    4: { start: `${year}-10-01T00:00:00`, end: `${year}-12-31T23:59:59` }
  };

  const { start, end } = quarters[quarter];
  
  return await fetch(
    `/api/analytics/portfolio/combined?period_type=custom&custom_start_date=${start}&custom_end_date=${end}`
  ).then(r => r.json());
};
```

### Advanced Analytics Dashboard

```javascript
// Get comprehensive analytics for advanced dashboard
const getAdvancedAnalytics = async (periodType = '30d') => {
  const [stocks, options, combined, daily, tickers] = await Promise.all([
    fetch(`/api/analytics/stocks/summary/${periodType}`),
    fetch(`/api/analytics/options/summary/${periodType}`),
    fetch(`/api/analytics/portfolio/combined/summary/${periodType}`),
    fetch(`/api/analytics/daily-pnl-trades?period_type=${periodType}`),
    fetch(`/api/analytics/ticker-profit-summary?period_type=${periodType}`)
  ]).then(responses => Promise.all(responses.map(r => r.json())));

  return { stocks, options, combined, daily, tickers };
};
```
