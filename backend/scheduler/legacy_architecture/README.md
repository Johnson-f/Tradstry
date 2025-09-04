# Legacy Scheduler Architecture

## Overview

This folder contains the original scheduler system files that have been replaced by the new architecture. These files are kept for reference and potential rollback purposes.

## Folder Structure

```
legacy_architecture/
├── base_scheduler.py           # Original APScheduler-based service
├── market_data_scheduler.py    # Market data specific scheduler
├── celery_app.py              # Celery configuration
├── celery_router.py           # Celery routing logic
├── celery_service.py          # Celery service implementation
├── tasks.py                   # Celery tasks
├── data_fetch_tracker.py      # Enhanced tracking system
├── enhanced_provider_manager.py # Provider management
└── jobs/                      # Original job implementations
    ├── base_job.py            # Original base job class
    ├── company_info_job.py    # Company info job (old)
    ├── dividend_job.py        # Dividend data job
    ├── earnings_job.py        # Earnings data job
    ├── economic_job.py        # Economic events job
    ├── fundamentals_job.py    # Fundamentals data job
    ├── historical_prices_job.py # Historical prices job
    ├── news_job.py            # News data job
    ├── options_chain_job.py   # Options chain job
    └── stock_quotes_job.py    # Stock quotes job
```

## Migration Status

**⚠️ DEPRECATED**: This architecture has been replaced by the new architecture in `../new_architecture/`.

### Key Differences

| Legacy | New Architecture |
|--------|------------------|
| Jobs fetch and process data | Separation: CronScheduler fetches, Jobs process |
| Individual job scheduling | Centralized cron scheduling |
| Complex job inheritance | Simplified processing-only jobs |
| Celery-based (optional) | APScheduler-based |
| Enhanced tracking | Built-in MarketDataBrain tracking |

### Migration Path

1. **Stop using legacy imports**:
   ```python
   # Don't use these anymore
   from scheduler.base_scheduler import MarketDataScheduler
   from scheduler.jobs.company_info_job import CompanyInfoJob
   ```

2. **Use new architecture**:
   ```python
   # Use these instead
   from scheduler.new_architecture import MainSchedulerService
   from scheduler.new_architecture import SchedulerFactory
   ```

3. **Update job implementations**: If you have custom jobs, migrate them to the new pattern where they only handle data processing, not fetching.

## Rollback Instructions

If you need to rollback to the legacy system:

1. Copy files back to the main scheduler directory
2. Update imports in your application code
3. Restart your scheduler service

## Cleanup

These files can be safely deleted once you've confirmed the new architecture works correctly in production and you no longer need rollback capability.
