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

### Get Stock Win Rate

```http
GET /api/analytics/stocks/win-rate
```

**Query Parameters:**
- `period_type` (optional): `7d` | `30d` | `90d` | `1y` | `all_time` | `custom`
- `custom_start_date` (optional): ISO datetime string
- `custom_end_date` (optional): ISO datetime string

**Examples:**

```bash
# Get all-time win rate (default)
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/stocks/win-rate"

# Get 30-day win rate
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/stocks/win-rate?period_type=30d"

# Get custom date range win rate
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/stocks/win-rate?period_type=custom&custom_start_date=2024-01-01T00:00:00&custom_end_date=2024-03-31T23:59:59"
```

### Get Stock Average Gain

```http
GET /api/analytics/stocks/average-gain
```

**Examples:**

```bash
# Get 7-day average gain
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/stocks/average-gain?period_type=7d"
```

### Get Stock Average Loss

```http
GET /api/analytics/stocks/average-loss
```

### Get Stock Risk/Reward Ratio

```http
GET /api/analytics/stocks/risk-reward-ratio
```

### Get Stock Trade Expectancy

```http
GET /api/analytics/stocks/trade-expectancy
```

### Get Stock Net P&L

```http
GET /api/analytics/stocks/net-pnl
```

## Options Analytics Endpoints

All options endpoints follow the same pattern as stock endpoints:

- `/api/analytics/options/win-rate`
- `/api/analytics/options/average-gain`
- `/api/analytics/options/average-loss`
- `/api/analytics/options/risk-reward-ratio`
- `/api/analytics/options/trade-expectancy`
- `/api/analytics/options/net-pnl`

## Portfolio Analytics

### Get Complete Portfolio Analytics

```http
GET /api/analytics/portfolio
```

Returns comprehensive analytics for both stocks and options.

**Example:**

```bash
# Get 1-year portfolio analytics
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/analytics/portfolio?period_type=1y"
```

**Response:**

```json
{
  "stocks": {
    "win_rate": 65.5,
    "average_gain": 150.25,
    "average_loss": 85.50,
    "risk_reward_ratio": 0.57,
    "trade_expectancy": 12.75,
    "net_pnl": 2450.80
  },
  "options": {
    "win_rate": 58.3,
    "average_gain": 220.40,
    "average_loss": 180.15,
    "risk_reward_ratio": 0.82,
    "trade_expectancy": 8.90,
    "net_pnl": 1890.45
  },
  "period_info": {
    "period_type": "1y",
    "custom_start_date": null,
    "custom_end_date": null
  }
}
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
  const [winRate, netPnl, expectancy] = await Promise.all([
    fetch('/api/analytics/stocks/win-rate?period_type=30d'),
    fetch('/api/analytics/stocks/net-pnl?period_type=30d'),
    fetch('/api/analytics/stocks/trade-expectancy?period_type=30d')
  ]).then(responses => Promise.all(responses.map(r => r.json())));

  return { winRate, netPnl, expectancy };
};
```

### Performance Comparison

```javascript
// Compare performance across different periods
const getPerformanceComparison = async () => {
  const periods = ['7d', '30d', '90d', '1y'];
  
  const results = await Promise.all(
    periods.map(async (period) => {
      const portfolio = await fetch(`/api/analytics/portfolio?period_type=${period}`)
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
    `/api/analytics/portfolio?period_type=custom&custom_start_date=${start}&custom_end_date=${end}`
  ).then(r => r.json());
};
```
