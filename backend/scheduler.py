from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# Example cron job functions
async def daily_maintenance():
    """Run daily maintenance tasks"""
    logger.info("Running daily maintenance tasks...")
    # Add your daily maintenance logic here
    # e.g., cleanup old data, update cache, etc.
    print("Daily maintenance completed at", datetime.now())

async def hourly_data_sync():
    """Sync data every hour"""
    logger.info("Running hourly data sync...")
    # Add your data sync logic here
    # e.g., sync with external APIs, update analytics, etc.
    print("Hourly data sync completed at", datetime.now())

async def weekly_report():
    """Generate weekly report"""
    logger.info("Generating weekly report...")
    # Add your report generation logic here
    print("Weekly report generated at", datetime.now())

def setup_scheduler():
    """Setup and configure the scheduler with cron jobs"""

    # Add cron jobs
    # Daily maintenance at 2 AM every day
    scheduler.add_job(
        daily_maintenance,
        CronTrigger(hour=2, minute=0),
        id="daily_maintenance",
        name="Daily Maintenance",
        max_instances=1
    )

    # Hourly data sync at minute 0 of every hour
    scheduler.add_job(
        hourly_data_sync,
        CronTrigger(minute=0),
        id="hourly_data_sync",
        name="Hourly Data Sync",
        max_instances=1
    )

    # Weekly report every Monday at 9 AM
    scheduler.add_job(
        weekly_report,
        CronTrigger(day_of_week=0, hour=9, minute=0),
        id="weekly_report",
        name="Weekly Report",
        max_instances=1
    )

    logger.info("Scheduler configured with cron jobs")

def start_scheduler():
    """Start the scheduler"""
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started")

def stop_scheduler():
    """Stop the scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")

# Optional: Function to add custom jobs programmatically
def add_cron_job(func, cron_expression, job_id, job_name):
    """Add a custom cron job"""
    scheduler.add_job(
        func,
        CronTrigger.from_crontab(cron_expression),
        id=job_id,
        name=job_name,
        max_instances=1
    )
    logger.info(f"Added custom job: {job_name}")

# Optional: Function to remove jobs
def remove_job(job_id):
    """Remove a job by ID"""
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Removed job: {job_id}")
    else:
        logger.warning(f"Job not found: {job_id}")
