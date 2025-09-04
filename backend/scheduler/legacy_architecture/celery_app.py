"""
Celery application configuration for market data scheduler.
Provides distributed task queue functionality with Redis as broker.
"""

import os
import sys
from pathlib import Path
from celery import Celery
from celery.schedules import crontab
from kombu import Queue

# Add the backend directory to Python path for proper imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from scheduler.config import SchedulerConfig

# Create Celery instance
celery_app = Celery("tradistry_scheduler")

# Import tasks after creating celery_app to avoid circular imports
def _import_tasks():
    """Import tasks after celery app is created."""
    try:
        import scheduler.tasks  # This will register all tasks
    except ImportError as e:
        print(f"Warning: Could not import tasks: {e}")

# Defer task imports
celery_app.loader.import_default_modules = lambda: _import_tasks()

# Get Redis URL and handle SSL issues
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
# Use non-SSL connection for Redis Cloud compatibility
if redis_url.startswith("rediss://"):
    redis_url = redis_url.replace("rediss://", "redis://")

# Configuration
celery_app.conf.update(
    # Broker settings (Redis Cloud without SSL for compatibility)
    broker_url=redis_url,
    result_backend=redis_url,
    
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=SchedulerConfig.MARKET_TIMEZONE,
    enable_utc=True,
    
    # Worker settings
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=1000,
    
    # Connection pool settings to reduce Redis connections
    broker_pool_limit=10,
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=3,
    
    # Result backend settings
    result_expires=3600,  # 1 hour
    
    # Task routing
    task_routes={
        "scheduler.tasks.market_hours.*": {"queue": "market_hours"},
        "scheduler.tasks.daily.*": {"queue": "daily"},
        "scheduler.tasks.periodic.*": {"queue": "periodic"},
    },
    
    # Queue definitions
    task_default_queue="default",
    task_queues=(
        Queue("default", routing_key="default"),
        Queue("market_hours", routing_key="market_hours"),
        Queue("daily", routing_key="daily"),
        Queue("periodic", routing_key="periodic"),
    ),
    
    # Beat schedule (cron jobs)
    beat_schedule={
        # Real-time market data (during market hours only)
        "fetch-stock-quotes": {
            "task": "scheduler.tasks.fetch_stock_quotes",
            "schedule": crontab(minute="*"),  # Every minute
            "options": {"queue": "market_hours"},
        },
        
        "fetch-options-chain": {
            "task": "scheduler.tasks.fetch_options_chain", 
            "schedule": crontab(minute="*/5"),  # Every 5 minutes
            "options": {"queue": "market_hours"},
        },
        
        # Daily jobs (after market close)
        "fetch-historical-prices": {
            "task": "scheduler.tasks.fetch_historical_prices",
            "schedule": crontab(hour=17, minute=30),  # 5:30 PM EST
            "options": {"queue": "daily"},
        },
        
        "fetch-fundamental-data": {
            "task": "scheduler.tasks.fetch_fundamental_data",
            "schedule": crontab(hour=18, minute=0),  # 6:00 PM EST
            "options": {"queue": "daily"},
        },
        
        "fetch-dividend-data": {
            "task": "scheduler.tasks.fetch_dividend_data",
            "schedule": crontab(hour=19, minute=0),  # 7:00 PM EST
            "options": {"queue": "daily"},
        },
        
        "fetch-earnings-transcripts": {
            "task": "scheduler.tasks.fetch_earnings_transcripts",
            "schedule": crontab(hour=20, minute=0),  # 8:00 PM EST
            "options": {"queue": "daily"},
        },
        
        "fetch-economic-indicators": {
            "task": "scheduler.tasks.fetch_economic_indicators",
            "schedule": crontab(hour=21, minute=0),  # 9:00 PM EST
            "options": {"queue": "daily"},
        },
        
        # Periodic jobs
        "fetch-earnings-data": {
            "task": "scheduler.tasks.fetch_earnings_data",
            "schedule": crontab(minute=0, hour="*/6"),  # Every 6 hours
            "options": {"queue": "periodic"},
        },
        
        "fetch-earnings-calendar": {
            "task": "scheduler.tasks.fetch_earnings_calendar",
            "schedule": crontab(minute=0, hour="*/12"),  # Every 12 hours
            "options": {"queue": "periodic"},
        },
        
        "fetch-news-data": {
            "task": "scheduler.tasks.fetch_news_data",
            "schedule": crontab(minute="*/30"),  # Every 30 minutes
            "options": {"queue": "periodic"},
        },
        
        "fetch-economic-events": {
            "task": "scheduler.tasks.fetch_economic_events",
            "schedule": crontab(minute=0, hour="*/12"),  # Every 12 hours
            "options": {"queue": "periodic"},
        },
        
        # Weekly jobs
        "fetch-company-info": {
            "task": "scheduler.tasks.fetch_company_info",
            "schedule": crontab(hour=22, minute=0, day_of_week=0),  # Sunday 10 PM
            "options": {"queue": "periodic"},
        },
    },
)

# Remove autodiscover since we're using manual import
# celery_app.autodiscover_tasks(["scheduler"], related_name="tasks")


def get_celery_app() -> Celery:
    """Get the configured Celery application instance."""
    return celery_app
