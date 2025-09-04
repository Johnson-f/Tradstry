"""
Base scheduler service for managing market data fetching jobs.
Uses APScheduler to run periodic tasks within the FastAPI application.
"""

import logging
from datetime import datetime, time
from typing import Dict, Optional
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.executors.asyncio import AsyncIOExecutor
from typing import List

from scheduler.config import SchedulerConfig, JobConfig


logger = logging.getLogger(__name__)


class MarketDataScheduler:
    """
    Manages periodic market data fetching jobs using APScheduler.
    Handles market hours awareness and job lifecycle management.
    """
    
    def __init__(self):
        """Initialize the scheduler with proper configuration."""
        # Configure job stores and executors
        jobstores = {
            'default': MemoryJobStore()
        }
        executors = {
            'default': AsyncIOExecutor()
        }
        
        job_defaults = {
            'coalesce': False,
            'max_instances': 1,
            'misfire_grace_time': 30
        }
        
        self.scheduler = AsyncIOScheduler(
            jobstores=jobstores,
            executors=executors,
            job_defaults=job_defaults,
            timezone=pytz.timezone(SchedulerConfig.MARKET_TIMEZONE)
        )
        
        self._job_registry: Dict[str, JobConfig] = {}
        self._is_running = False
    
    async def start(self):
        """Start the scheduler and all registered jobs."""
        if self._is_running:
            logger.warning("Scheduler is already running")
            return
        
        try:
            self.scheduler.start()
            self._is_running = True
            logger.info("Market data scheduler started successfully")
            
            # Log scheduled jobs
            for job in self.scheduler.get_jobs():
                logger.info(f"Scheduled job: {job.id} - Next run: {job.next_run_time}")
                
        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")
            raise
    
    async def stop(self):
        """Stop the scheduler and all jobs."""
        if not self._is_running:
            return
        
        try:
            self.scheduler.shutdown(wait=True)
            self._is_running = False
            logger.info("Market data scheduler stopped")
        except Exception as e:
            logger.error(f"Error stopping scheduler: {e}")
    
    def add_job(self, job_id: str, job_func, job_config: JobConfig):
        """
        Add a job to the scheduler with appropriate trigger.
        
        Args:
            job_id: Unique identifier for the job
            job_func: Async function to execute
            job_config: Job configuration settings
        """
        try:
            if job_config.market_hours_only:
                # Create cron trigger for market hours only
                trigger = CronTrigger(
                    hour=f"{SchedulerConfig.MARKET_OPEN.hour}-{SchedulerConfig.MARKET_CLOSE.hour-1}",
                    minute=f"*/{job_config.interval_seconds//60}" if job_config.interval_seconds >= 60 else "*",
                    second=f"*/{job_config.interval_seconds}" if job_config.interval_seconds < 60 else "0",
                    day_of_week="mon-fri",  # Weekdays only
                    timezone=SchedulerConfig.MARKET_TIMEZONE
                )
            else:
                # Use interval trigger for 24/7 jobs
                trigger = IntervalTrigger(
                    seconds=job_config.interval_seconds,
                    timezone=SchedulerConfig.MARKET_TIMEZONE
                )
            
            self.scheduler.add_job(
                func=job_func,
                trigger=trigger,
                id=job_id,
                name=job_config.name,
                replace_existing=True,
                max_instances=1
            )
            
            self._job_registry[job_id] = job_config
            logger.info(f"Added job: {job_id} ({job_config.name}) - Interval: {job_config.interval_seconds}s")
            
        except Exception as e:
            logger.error(f"Failed to add job {job_id}: {e}")
            raise
    
    def remove_job(self, job_id: str):
        """Remove a job from the scheduler."""
        try:
            self.scheduler.remove_job(job_id)
            self._job_registry.pop(job_id, None)
            logger.info(f"Removed job: {job_id}")
        except Exception as e:
            logger.error(f"Failed to remove job {job_id}: {e}")
    
    def is_market_hours(self) -> bool:
        """Check if current time is within market hours."""
        now = datetime.now(pytz.timezone(SchedulerConfig.MARKET_TIMEZONE))
        current_time = now.time()
        current_weekday = now.weekday()  # 0=Monday, 6=Sunday
        
        # Check if it's a weekday (Monday=0 to Friday=4)
        is_weekday = current_weekday < 5
        
        # Check if within market hours
        is_market_time = SchedulerConfig.MARKET_OPEN <= current_time <= SchedulerConfig.MARKET_CLOSE
        
        return is_weekday and is_market_time
    
    def get_job_status(self, job_id: str) -> Optional[Dict]:
        """Get status information for a specific job."""
        job = self.scheduler.get_job(job_id)
        if not job:
            return None
        
        return {
            "id": job.id,
            "name": job.name,
            "next_run_time": job.next_run_time,
            "trigger": str(job.trigger),
            "pending": job.pending
        }
    
    def get_all_jobs_status(self) -> List[Dict]:
        """Get status for all scheduled jobs."""
        return [
            {
                "id": job.id,
                "name": job.name,
                "next_run_time": job.next_run_time,
                "trigger": str(job.trigger),
                "pending": job.pending
            }
            for job in self.scheduler.get_jobs()
        ]
    
    @property
    def is_running(self) -> bool:
        """Check if scheduler is currently running."""
        return self._is_running
