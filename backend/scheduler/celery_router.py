"""
FastAPI router for Celery task management.
Provides REST endpoints for managing distributed tasks and workers.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import logging

from .celery_service import celery_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scheduler/celery", tags=["celery"])


class TaskTriggerRequest(BaseModel):
    """Request model for triggering tasks."""
    job_name: str
    priority: Optional[int] = None
    queue: Optional[str] = None


class TaskStatusResponse(BaseModel):
    """Response model for task status."""
    task_id: str
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    date_done: Optional[str] = None


@router.get("/status", summary="Get Celery system status")
async def get_celery_status() -> Dict[str, Any]:
    """Get overall status of Celery workers and system."""
    try:
        status = celery_service.get_worker_status()
        return {
            "status": "success",
            "data": status,
            "message": "Celery status retrieved successfully"
        }
    except Exception as e:
        logger.error(f"Error getting Celery status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workers", summary="Get worker information")
async def get_workers() -> Dict[str, Any]:
    """Get detailed information about active workers."""
    try:
        status = celery_service.get_worker_status()
        return {
            "status": "success",
            "workers": status.get("workers", {}),
            "message": "Worker information retrieved successfully"
        }
    except Exception as e:
        logger.error(f"Error getting worker info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks/scheduled", summary="Get scheduled tasks")
async def get_scheduled_tasks() -> Dict[str, Any]:
    """Get information about scheduled and active tasks."""
    try:
        tasks = celery_service.get_scheduled_tasks()
        return {
            "status": "success",
            "data": tasks,
            "message": "Scheduled tasks retrieved successfully"
        }
    except Exception as e:
        logger.error(f"Error getting scheduled tasks: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tasks/trigger", summary="Trigger a job manually")
async def trigger_job(request: TaskTriggerRequest) -> Dict[str, Any]:
    """Manually trigger a specific job."""
    try:
        result = celery_service.trigger_job(request.job_name)
        
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return {
            "status": "success",
            "data": result,
            "message": f"Job '{request.job_name}' triggered successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering job {request.job_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks/{task_id}/status", summary="Get task status")
async def get_task_status(task_id: str) -> TaskStatusResponse:
    """Get status of a specific task by ID."""
    try:
        status = celery_service.get_task_status(task_id)
        return TaskStatusResponse(**status)
    except Exception as e:
        logger.error(f"Error getting task status for {task_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/queues/{queue_name}/length", summary="Get queue length")
async def get_queue_length(queue_name: str = "default") -> Dict[str, Any]:
    """Get the current length of a specific queue."""
    try:
        result = celery_service.get_queue_length(queue_name)
        return {
            "status": "success",
            "data": result,
            "message": f"Queue length for '{queue_name}' retrieved successfully"
        }
    except Exception as e:
        logger.error(f"Error getting queue length for {queue_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", summary="Celery health check")
async def health_check() -> Dict[str, Any]:
    """Perform a health check on the Celery system."""
    try:
        health = celery_service.health_check()
        
        if health.get("status") == "unhealthy":
            raise HTTPException(status_code=503, detail=health)
        
        return {
            "status": "success",
            "data": health,
            "message": "Celery system is healthy"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/available", summary="Get available jobs")
async def get_available_jobs() -> Dict[str, Any]:
    """Get list of available jobs that can be triggered."""
    jobs = {
        "market_hours": [
            "stock_quotes",
            "options_chain"
        ],
        "daily": [
            "historical_prices",
            "fundamental_data",
            "dividend_data",
            "earnings_transcripts",
            "economic_indicators"
        ],
        "periodic": [
            "earnings_data",
            "earnings_calendar", 
            "news_data",
            "economic_events"
        ],
        "weekly": [
            "company_info"
        ]
    }
    
    return {
        "status": "success",
        "data": {
            "jobs_by_category": jobs,
            "all_jobs": [job for category in jobs.values() for job in category],
            "total_jobs": sum(len(category) for category in jobs.values())
        },
        "message": "Available jobs retrieved successfully"
    }


# Legacy compatibility endpoints (redirect to Celery)
@router.post("/jobs/{job_name}/run", summary="Run job (legacy compatibility)")
async def run_job_legacy(job_name: str) -> Dict[str, Any]:
    """Legacy endpoint for running jobs - redirects to Celery."""
    request = TaskTriggerRequest(job_name=job_name)
    return await trigger_job(request)


@router.post("/jobs/{job_name}/pause", summary="Pause job (not implemented)")
async def pause_job_legacy(job_name: str) -> Dict[str, Any]:
    """Legacy endpoint for pausing jobs - not implemented in Celery."""
    return {
        "status": "not_implemented",
        "message": "Job pausing not available with Celery Beat. Use worker scaling instead.",
        "job_name": job_name,
        "alternatives": [
            "Scale down workers: celery -A scheduler.celery_app worker --concurrency=0",
            "Stop specific queues: celery -A scheduler.celery_app control cancel consumer queue_name"
        ]
    }


@router.post("/jobs/{job_name}/resume", summary="Resume job (not implemented)")
async def resume_job_legacy(job_name: str) -> Dict[str, Any]:
    """Legacy endpoint for resuming jobs - not implemented in Celery."""
    return {
        "status": "not_implemented",
        "message": "Job resuming not available with Celery Beat. Use worker scaling instead.",
        "job_name": job_name,
        "alternatives": [
            "Scale up workers: celery -A scheduler.celery_app worker --concurrency=4",
            "Add queue consumers: celery -A scheduler.celery_app control add_consumer queue_name"
        ]
    }
