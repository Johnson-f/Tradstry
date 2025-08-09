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

### Supported Analytics
- **Stock Analytics**: Win rate, average gain/loss, risk/reward ratio, trade expectancy, net P&L
- **Options Analytics**: Win rate, average gain/loss, risk/reward ratio, trade expectancy, net P&L
- **Portfolio Analytics**: Combined metrics for both stocks and options

### Date Range Filtering
All analytics endpoints support the following query parameters:
- `period_type`: `7d`, `30d`, `90d`, `1y`, `all_time`, `custom`
- `custom_start_date`: ISO datetime for custom periods
- `custom_end_date`: ISO datetime for custom periods

### Example Usage
```bash
# Get 30-day stock win rate
GET /api/analytics/stocks/win-rate?period_type=30d

# Get custom date range portfolio analytics
GET /api/analytics/portfolio?period_type=custom&custom_start_date=2024-01-01T00:00:00&custom_end_date=2024-03-31T23:59:59
```

For detailed API usage examples, see `API_USAGE.md`.

## Development

- Use Python 3.8+
- Follow PEP 8 style guide
- Write tests for new features
- Document all endpoints and functions
