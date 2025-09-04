"""
Celery tasks for market data fetching.
Wraps existing scheduler jobs to work with Celery's distributed task queue.
"""

import asyncio
import os
import sys
from datetime import datetime, time
from typing import Dict, Any
from pathlib import Path
from celery import Task
from celery.utils.log import get_task_logger
import pytz

# Add the backend directory to Python path for proper imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Import Celery app first
from scheduler.celery_app import celery_app

# Import job classes
from scheduler.jobs.stock_quotes_job import StockQuotesJob
from scheduler.jobs.options_chain_job import OptionsChainJob
from scheduler.jobs.historical_prices_job import HistoricalPricesJob
from scheduler.jobs.company_info_job import CompanyInfoJob
from scheduler.jobs.fundamentals_job import FundamentalsJob
from scheduler.jobs.dividend_job import DividendDataJob
from scheduler.jobs.earnings_job import EarningsDataJob, EarningsCalendarJob, EarningsTranscriptsJob
from scheduler.jobs.news_job import NewsDataJob
from scheduler.jobs.economic_job import EconomicEventsJob, EconomicIndicatorsJob
from scheduler.config import SchedulerConfig

logger = get_task_logger(__name__)


class MarketHoursTask(Task):
    """Base task that checks market hours before execution."""
    
    def is_market_hours(self) -> bool:
        """Check if current time is within market hours."""
        ny_tz = pytz.timezone(SchedulerConfig.MARKET_TIMEZONE)
        now = datetime.now(ny_tz).time()
        
        return (SchedulerConfig.MARKET_OPEN <= now <= SchedulerConfig.MARKET_CLOSE and
                datetime.now(ny_tz).weekday() < 5)  # Monday = 0, Friday = 4
    
    def apply_async(self, *args, **kwargs):
        """Override to add market hours check for market-hours-only tasks."""
        if hasattr(self, 'market_hours_only') and self.market_hours_only:
            if not self.is_market_hours():
                logger.info(f"Skipping {self.name} - outside market hours")
                return None
        
        return super().apply_async(*args, **kwargs)


def run_async_job(job_class, *args, **kwargs):
    """Helper to run async job classes in Celery tasks."""
    try:
        # Import dependencies here to avoid circular imports
        from scheduler.database_service import SchedulerDatabaseService
        from market_data.brain import MarketDataBrain
        from scheduler.data_fetch_tracker import DataFetchTracker
        from scheduler.enhanced_provider_manager import EnhancedProviderManager
        
        # Initialize dependencies
        db_service = SchedulerDatabaseService()
        market_data_orchestrator = MarketDataBrain()
        data_tracker = DataFetchTracker(db_service)
        provider_manager = EnhancedProviderManager(market_data_orchestrator, data_tracker)
        
        # Create job instance with dependencies
        if job_class.__name__ == 'StockQuotesJob':
            job = job_class(
                database_service=db_service,
                market_data_orchestrator=market_data_orchestrator,
                data_tracker=data_tracker,
                provider_manager=provider_manager
            )
        else:
            # For other jobs that might have different constructors
            try:
                job = job_class(
                    database_service=db_service,
                    data_tracker=data_tracker,
                    provider_manager=provider_manager
                )
            except TypeError:
                # Fallback for jobs with no-arg constructors
                job = job_class()
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(job.execute())
            return {"status": "success", "result": result}
        finally:
            loop.close()
            
    except Exception as e:
        logger.error(f"Error in {job_class.__name__}: {str(e)}")
        return {"status": "error", "error": str(e)}


# Market Hours Tasks
@celery_app.task(bind=True, base=MarketHoursTask, name="scheduler.tasks.fetch_stock_quotes")
def fetch_stock_quotes(self):
    """Fetch real-time stock quotes during market hours."""
    self.market_hours_only = True
    
    if not self.is_market_hours():
        logger.info("Skipping stock quotes - outside market hours")
        return {"status": "skipped", "reason": "outside_market_hours"}
    
    logger.info("Starting stock quotes fetch")
    return run_async_job(StockQuotesJob)


@celery_app.task(bind=True, base=MarketHoursTask, name="scheduler.tasks.fetch_options_chain")
def fetch_options_chain(self):
    """Fetch options chain data during market hours."""
    self.market_hours_only = True
    
    if not self.is_market_hours():
        logger.info("Skipping options chain - outside market hours")
        return {"status": "skipped", "reason": "outside_market_hours"}
    
    logger.info("Starting options chain fetch")
    return run_async_job(OptionsChainJob)


# Daily Tasks
@celery_app.task(name="scheduler.tasks.fetch_historical_prices")
def fetch_historical_prices():
    """Fetch historical price data."""
    logger.info("Starting historical prices fetch")
    return run_async_job(HistoricalPricesJob)


@celery_app.task(name="scheduler.tasks.fetch_fundamental_data")
def fetch_fundamental_data():
    """Fetch fundamental data."""
    logger.info("Starting fundamental data fetch")
    return run_async_job(FundamentalsJob)


@celery_app.task(name="scheduler.tasks.fetch_dividend_data")
def fetch_dividend_data():
    """Fetch dividend data."""
    logger.info("Starting dividend data fetch")
    return run_async_job(DividendDataJob)


@celery_app.task(name="scheduler.tasks.fetch_earnings_transcripts")
def fetch_earnings_transcripts():
    """Fetch earnings transcripts."""
    logger.info("Starting earnings transcripts fetch")
    return run_async_job(EarningsTranscriptsJob)


@celery_app.task(name="scheduler.tasks.fetch_economic_indicators")
def fetch_economic_indicators():
    """Fetch economic indicators."""
    logger.info("Starting economic indicators fetch")
    return run_async_job(EconomicIndicatorsJob)


# Periodic Tasks
@celery_app.task(name="scheduler.tasks.fetch_earnings_data")
def fetch_earnings_data():
    """Fetch earnings data."""
    logger.info("Starting earnings data fetch")
    return run_async_job(EarningsDataJob)


@celery_app.task(name="scheduler.tasks.fetch_earnings_calendar")
def fetch_earnings_calendar():
    """Fetch earnings calendar."""
    logger.info("Starting earnings calendar fetch")
    return run_async_job(EarningsCalendarJob)


@celery_app.task(name="scheduler.tasks.fetch_news_data")
def fetch_news_data():
    """Fetch news data."""
    logger.info("Starting news data fetch")
    return run_async_job(NewsDataJob)


@celery_app.task(name="scheduler.tasks.fetch_economic_events")
def fetch_economic_events():
    """Fetch economic events."""
    logger.info("Starting economic events fetch")
    return run_async_job(EconomicEventsJob)


# Weekly Tasks
@celery_app.task(name="scheduler.tasks.fetch_company_info")
def fetch_company_info():
    """Fetch company information."""
    logger.info("Starting company info fetch")
    return run_async_job(CompanyInfoJob)


# Manual trigger tasks
@celery_app.task(name="scheduler.tasks.run_job_manual")
def run_job_manual(job_name: str) -> Dict[str, Any]:
    """Manually trigger a specific job."""
    logger.info(f"Manually triggering job: {job_name}")
    
    job_mapping = {
        "stock_quotes": StockQuotesJob,
        "options_chain": OptionsChainJob,
        "historical_prices": HistoricalPricesJob,
        "company_info": CompanyInfoJob,
        "fundamental_data": FundamentalsJob,
        "dividend_data": DividendDataJob,
        "earnings_data": EarningsDataJob,
        "news_data": NewsDataJob,
        "economic_events": EconomicEventsJob,
    }
    
    if job_name not in job_mapping:
        return {"status": "error", "error": f"Unknown job: {job_name}"}
    
    return run_async_job(job_mapping[job_name])


# Health check task
@celery_app.task(name="scheduler.tasks.health_check")
def health_check():
    """Health check task for monitoring."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "worker_id": health_check.request.id
    }
