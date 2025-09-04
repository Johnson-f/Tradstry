"""
Celery application configuration for Tradistry scheduler.
"""

import os
from celery import Celery
from celery.schedules import crontab
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure we have a Redis URL
redis_url = os.getenv('REDIS_URL')
if not redis_url:
    print("⚠️  REDIS_URL not found in environment. Using default: redis://localhost:6379/0")
    redis_url = 'redis://localhost:6379/0'
else:
    print(f"✅ Using Redis URL: {redis_url[:20]}...")

# Create Celery app
celery_app = Celery(
    'tradistry_scheduler',
    broker=redis_url,
    backend=redis_url,
    include=['scheduler.tasks']
)

# Celery configuration
celery_app.conf.update(
    # Task settings
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    
    # Worker settings
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    
    # Result backend settings
    result_expires=3600,  # 1 hour
    result_backend_transport_options={
        'master_name': 'mymaster',
        'retry_on_timeout': True,
    },
    
    # Queue routing
    task_routes={
        'scheduler.tasks.fetch_stock_quotes': {'queue': 'market_hours'},
        'scheduler.tasks.fetch_options_chain': {'queue': 'market_hours'},
        'scheduler.tasks.fetch_historical_prices': {'queue': 'daily'},
        'scheduler.tasks.fetch_fundamental_data': {'queue': 'daily'},
        'scheduler.tasks.fetch_dividend_data': {'queue': 'daily'},
        'scheduler.tasks.fetch_earnings_data': {'queue': 'periodic'},
        'scheduler.tasks.fetch_news_data': {'queue': 'periodic'},
        'scheduler.tasks.health_check': {'queue': 'default'},
    },
    
    # Beat schedule - periodic tasks
    beat_schedule={
        'fetch-stock-quotes': {
            'task': 'scheduler.tasks.fetch_stock_quotes',
            'schedule': crontab(minute='*/10'),  # Every 10 minutes
            'options': {'queue': 'market_hours'}
        },
        'fetch-options-chain': {
            'task': 'scheduler.tasks.fetch_options_chain',
            'schedule': crontab(minute='*/15'),  # Every 15 minutes
            'options': {'queue': 'market_hours'}
        },
        'fetch-historical-prices': {
            'task': 'scheduler.tasks.fetch_historical_prices',
            'schedule': crontab(hour=17, minute=30),  # Daily at 5:30 PM EST
            'options': {'queue': 'daily'}
        },
        'fetch-fundamental-data': {
            'task': 'scheduler.tasks.fetch_fundamental_data',
            'schedule': crontab(hour=18, minute=0),  # Daily at 6:00 PM EST
            'options': {'queue': 'daily'}
        },
        'fetch-dividend-data': {
            'task': 'scheduler.tasks.fetch_dividend_data',
            'schedule': crontab(hour=19, minute=0),  # Daily at 7:00 PM EST
            'options': {'queue': 'daily'}
        },
        'fetch-earnings-data': {
            'task': 'scheduler.tasks.fetch_earnings_data',
            'schedule': crontab(minute=0, hour='*/6'),  # Every 6 hours
            'options': {'queue': 'periodic'}
        },
        'fetch-news-data': {
            'task': 'scheduler.tasks.fetch_news_data',
            'schedule': crontab(minute='*/30'),  # Every 30 minutes
            'options': {'queue': 'periodic'}
        },
        'health-check': {
            'task': 'scheduler.tasks.health_check',
            'schedule': crontab(minute='*/10'),  # Every 10 minutes
            'options': {'queue': 'default'}
        },
    },
)

# Auto-discover tasks
celery_app.autodiscover_tasks()

if __name__ == '__main__':
    celery_app.start()
