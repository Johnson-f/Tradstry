# Tradistry Backend

This is the FastAPI backend for the Tradistry application, providing API endpoints for the frontend to interact with the Supabase database.

## Setup Instructions

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Environment Variables**
   Create a `.env` file in the backend directory with the following variables:
   ```
   # Supabase
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_anon_key
   
   # JWT
   JWT_SECRET_KEY=your_jwt_secret_key
   ```

3. **Running the Server**
   ```bash
   uvicorn main:app --reload
   ```
   The API will be available at `http://localhost:8000`

## Project Structure

- `main.py` - Main FastAPI application setup and configuration
- `config.py` - Application configuration and settings
- `database.py` - Supabase client setup and database utilities
- `models/` - Database models and schemas
- `routers/` - API route definitions

## API Documentation

Once the server is running, you can access:
- Interactive API docs: `http://localhost:8000/docs`
- Alternative API docs: `http://localhost:8000/redoc`

## Analytics Features

The API now supports comprehensive analytics with date range filtering:

### Stock Analytics
- **Core Metrics**: Win rate, average gain/loss, risk/reward ratio, trade expectancy, net P&L
- **Advanced Metrics**: Profit factor, average hold times (winners/losers), biggest winner/loser trades
- **Date Range Filtering**: 7d, 30d, 90d, 1y, YTD, all_time, custom

### Options Analytics
- **Core Metrics**: Win rate, average gain/loss, risk/reward ratio, trade expectancy, net P&L
- **Advanced Metrics**: Profit factor, average hold times (winners/losers), biggest winner/loser trades
- **Date Range Filtering**: Same period options as stocks

### Portfolio Analytics
- **Separate Analytics**: Detailed metrics for stocks and options separately
- **Combined Analytics**: Metrics calculated across all trades regardless of type
- **Special Analytics**: Daily P&L breakdown, ticker profit summaries

### Date Range Filtering
All analytics endpoints support the following query parameters:
- `period_type`: `7d`, `30d`, `90d`, `1y`, `all_time`, `custom`
- `custom_start_date`: ISO datetime for custom periods
- `custom_end_date`: ISO datetime for custom periods

### Example Usage
```bash
# Get 30-day stock profit factor
GET /api/analytics/stocks/profit-factor?period_type=30d

# Get combined portfolio analytics for custom date range
GET /api/analytics/portfolio/combined?period_type=custom&custom_start_date=2024-01-01T00:00:00&custom_end_date=2024-03-31T23:59:59

# Get daily P&L breakdown for last 7 days
GET /api/analytics/daily-pnl-trades?period_type=7d
```

### New Analytics Endpoints

#### Stock Analytics
- `/api/analytics/stocks/profit-factor` - Profit factor (gross profit / gross loss)
- `/api/analytics/stocks/avg-hold-time-winners` - Average hold time for winning trades
- `/api/analytics/stocks/avg-hold-time-losers` - Average hold time for losing trades
- `/api/analytics/stocks/biggest-winner` - Biggest winning trade profit
- `/api/analytics/stocks/biggest-loser` - Biggest losing trade loss

#### Options Analytics
- `/api/analytics/options/profit-factor` - Profit factor for options
- `/api/analytics/options/avg-hold-time-winners` - Average hold time for winning option trades
- `/api/analytics/options/avg-hold-time-losers` - Average hold time for losing option trades
- `/api/analytics/options/biggest-winner` - Biggest winning option trade profit
- `/api/analytics/options/biggest-loser` - Biggest losing option trade loss

#### Combined Portfolio Analytics
- `/api/analytics/portfolio/combined` - Analytics across all trades (stocks + options)
- `/api/analytics/daily-pnl-trades` - Daily P&L and trade count breakdown
- `/api/analytics/ticker-profit-summary` - Performance breakdown by individual symbols

#### Convenience Endpoints
- `/api/analytics/stocks/summary/{period_type}` - All stock metrics in one call
- `/api/analytics/options/summary/{period_type}` - All option metrics in one call
- `/api/analytics/portfolio/combined/summary/{period_type}` - All combined metrics in one call

For detailed API usage examples, see `API_USAGE.md`.

## Development

- Use Python 3.8+
- Follow PEP 8 style guide
- Write tests for new features
- Document all endpoints and functions
