"""
Celery service management for market data scheduler.
Provides integration between FastAPI and Celery workers.
"""

import asyncio
from typing import Dict, Any, List, Optional
from celery.result import AsyncResult
from celery import states
from datetime import datetime
import logging

from .celery_app import get_celery_app
from .config import SchedulerConfig

logger = logging.getLogger(__name__)


class CeleryService:
    """Service for managing Celery tasks and workers."""
    
    def __init__(self):
        self.celery_app = get_celery_app()
    
    def get_worker_status(self) -> Dict[str, Any]:
        """Get status of all Celery workers."""
        try:
            inspect = self.celery_app.control.inspect()
            
            # Get active workers
            active_workers = inspect.active()
            registered_tasks = inspect.registered()
            worker_stats = inspect.stats()
            
            return {
                "workers": {
                    "active": list(active_workers.keys()) if active_workers else [],
                    "count": len(active_workers) if active_workers else 0,
                    "stats": worker_stats or {},
                },
                "tasks": {
                    "registered": registered_tasks or {},
                },
                "queues": ["default", "market_hours", "daily", "periodic"],
                "status": "healthy" if active_workers else "no_workers"
            }
        except Exception as e:
            logger.error(f"Error getting worker status: {e}")
            return {
                "workers": {"active": [], "count": 0, "stats": {}},
                "tasks": {"registered": {}},
                "queues": [],
                "status": "error",
                "error": str(e)
            }
    
    def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """Get status of a specific task."""
        try:
            result = AsyncResult(task_id, app=self.celery_app)
            
            return {
                "task_id": task_id,
                "status": result.status,
                "result": result.result if result.ready() else None,
                "traceback": result.traceback if result.failed() else None,
                "date_done": result.date_done.isoformat() if result.date_done else None,
            }
        except Exception as e:
            logger.error(f"Error getting task status for {task_id}: {e}")
            return {
                "task_id": task_id,
                "status": "ERROR",
                "error": str(e)
            }
    
    def trigger_job(self, job_name: str) -> Dict[str, Any]:
        """Manually trigger a job."""
        try:
            # Map job names to task names
            task_mapping = {
                "stock_quotes": "scheduler.tasks.fetch_stock_quotes",
                "options_chain": "scheduler.tasks.fetch_options_chain",
                "historical_prices": "scheduler.tasks.fetch_historical_prices",
                "company_info": "scheduler.tasks.fetch_company_info",
                "fundamental_data": "scheduler.tasks.fetch_fundamental_data",
                "dividend_data": "scheduler.tasks.fetch_dividend_data",
                "earnings_data": "scheduler.tasks.fetch_earnings_data",
                "earnings_calendar": "scheduler.tasks.fetch_earnings_calendar",
                "earnings_transcripts": "scheduler.tasks.fetch_earnings_transcripts",
                "news_data": "scheduler.tasks.fetch_news_data",
                "economic_events": "scheduler.tasks.fetch_economic_events",
                "economic_indicators": "scheduler.tasks.fetch_economic_indicators",
            }
            
            if job_name not in task_mapping:
                return {
                    "status": "error",
                    "error": f"Unknown job: {job_name}",
                    "available_jobs": list(task_mapping.keys())
                }
            
            task_name = task_mapping[job_name]
            result = self.celery_app.send_task(task_name)
            
            return {
                "status": "triggered",
                "job_name": job_name,
                "task_id": result.id,
                "task_name": task_name
            }
            
        except Exception as e:
            logger.error(f"Error triggering job {job_name}: {e}")
            return {
                "status": "error",
                "job_name": job_name,
                "error": str(e)
            }
    
    def get_scheduled_tasks(self) -> Dict[str, Any]:
        """Get information about scheduled tasks."""
        try:
            inspect = self.celery_app.control.inspect()
            scheduled = inspect.scheduled()
            active = inspect.active()
            
            return {
                "scheduled": scheduled or {},
                "active": active or {},
                "beat_schedule": {
                    name: {
                        "task": config["task"],
                        "schedule": str(config["schedule"]),
                        "options": config.get("options", {})
                    }
                    for name, config in self.celery_app.conf.beat_schedule.items()
                }
            }
        except Exception as e:
            logger.error(f"Error getting scheduled tasks: {e}")
            return {
                "scheduled": {},
                "active": {},
                "beat_schedule": {},
                "error": str(e)
            }
    
    def pause_job(self, job_name: str) -> Dict[str, Any]:
        """Pause a scheduled job (requires custom implementation)."""
        # Note: Celery Beat doesn't have built-in pause/resume for individual jobs
        # This would require a custom scheduler or database-backed beat schedule
        return {
            "status": "not_implemented",
            "message": "Job pausing requires custom scheduler implementation",
            "job_name": job_name
        }
    
    def resume_job(self, job_name: str) -> Dict[str, Any]:
        """Resume a paused job (requires custom implementation)."""
        return {
            "status": "not_implemented", 
            "message": "Job resuming requires custom scheduler implementation",
            "job_name": job_name
        }
    
    def get_queue_length(self, queue_name: str = "default") -> Dict[str, Any]:
        """Get the length of a specific queue."""
        try:
            inspect = self.celery_app.control.inspect()
            
            # Get queue lengths (this requires Redis inspection)
            from redis import Redis
            import os
            
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            
            # Handle Redis Cloud SSL connections - use non-SSL for compatibility
            if redis_url.startswith("rediss://"):
                redis_url = redis_url.replace("rediss://", "redis://")
            
            redis_client = Redis.from_url(redis_url)
            
            queue_key = f"celery"  # Default Celery queue key
            if queue_name != "default":
                queue_key = f"{queue_name}"
            
            length = redis_client.llen(queue_key)
            
            return {
                "queue": queue_name,
                "length": length,
                "status": "success"
            }
            
        except Exception as e:
            logger.error(f"Error getting queue length for {queue_name}: {e}")
            return {
                "queue": queue_name,
                "length": 0,
                "status": "error",
                "error": str(e)
            }
    
    def health_check(self) -> Dict[str, Any]:
        """Perform a health check on the Celery system."""
        try:
            # Send a simple health check task
            result = self.celery_app.send_task("scheduler.tasks.health_check")
            
            # Wait for result with timeout
            try:
                health_result = result.get(timeout=10)
                return {
                    "status": "healthy",
                    "celery_status": "connected",
                    "task_result": health_result,
                    "timestamp": datetime.utcnow().isoformat()
                }
            except Exception as e:
                return {
                    "status": "unhealthy",
                    "celery_status": "timeout",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                }
                
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {
                "status": "unhealthy",
                "celery_status": "disconnected",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }


# Global service instance
celery_service = CeleryService()
