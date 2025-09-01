# Market Data Scheduler

Automated periodic fetching system for market data using APScheduler within FastAPI.

## Overview

The scheduler system automatically fetches market data from various providers and stores it in the database using PostgreSQL upsert functions. It runs as part of the FastAPI application lifecycle.

## Architecture

```
scheduler/
├── __init__.py
├── config.py                 # Job configurations and schedules
├── base_scheduler.py         # Core APScheduler wrapper
├── market_data_scheduler.py  # Main scheduler service
├── database_service.py       # Database operations for jobs
├── scheduler_router.py       # FastAPI endpoints for control
└── jobs/                     # Individual job implementations
    ├── __init__.py
    ├── base_job.py          # Abstract base class
    ├── stock_quotes_job.py  # Real-time quotes
    ├── historical_prices_job.py
    ├── options_chain_job.py
    ├── company_info_job.py
    ├── fundamentals_job.py
    ├── earnings_job.py
    ├── news_job.py
    ├── economic_job.py
    └── dividend_job.py
```

## Scheduled Jobs

| Job | Frequency | Market Hours Only | Description |
|-----|-----------|-------------------|-------------|
| Stock Quotes | 1 minute | Yes | Real-time price data |
| Options Chain | 5 minutes | Yes | Options pricing |
| Historical Prices | Daily | No | End-of-day prices |
| Company Info | Weekly | No | Company profiles |
| Fundamentals | Daily | No | Financial ratios |
| Earnings Data | 6 hours | No | Quarterly reports |
| Earnings Calendar | 12 hours | No | Upcoming earnings |
| Earnings Transcripts | Daily | No | Call transcripts |
| News | 30 minutes | No | Financial news |
| Economic Events | 12 hours | No | Economic calendar |
| Economic Indicators | Daily | No | Economic data |
| Dividend Data | Daily | No | Dividend info |

## API Endpoints

- `GET /api/scheduler/status` - Get scheduler status
- `GET /api/scheduler/jobs` - Get all job configurations
- `POST /api/scheduler/jobs/{job_name}/run` - Manually trigger job
- `POST /api/scheduler/jobs/{job_name}/pause` - Pause job
- `POST /api/scheduler/jobs/{job_name}/resume` - Resume job
- `GET /api/scheduler/market-hours` - Check market hours

## Usage

The scheduler starts automatically with the FastAPI application and requires no manual intervention. Jobs run according to their configured schedules and respect market hours where applicable.

## Database Integration

Each job uses the corresponding PostgreSQL upsert function from the `Database/12_market_data/02_Upsert/` directory to store data safely without conflicts.
