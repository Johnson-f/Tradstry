"""
FastAPI router for scheduler management endpoints.
Provides API endpoints to control and monitor the market data scheduler.
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
import logging

from scheduler.market_data_scheduler import get_scheduler_service


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scheduler", tags=["scheduler"])


@router.get("/status")
async def get_scheduler_status() -> Dict[str, Any]:
    """Get the current status of the market data scheduler."""
    scheduler_service = get_scheduler_service()
    if not scheduler_service:
        raise HTTPException(status_code=503, detail="Scheduler service not available")
    
    return scheduler_service.get_scheduler_status()


@router.get("/jobs")
async def get_job_configs() -> Dict[str, Dict[str, Any]]:
    """Get configuration details for all scheduled jobs."""
    scheduler_service = get_scheduler_service()
    if not scheduler_service:
        raise HTTPException(status_code=503, detail="Scheduler service not available")
    
    return scheduler_service.get_job_configs()


@router.post("/jobs/{job_name}/run")
async def run_job_manually(
    job_name: str,
    symbols: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Manually trigger a specific job to run immediately."""
    scheduler_service = get_scheduler_service()
    if not scheduler_service:
        raise HTTPException(status_code=503, detail="Scheduler service not available")
    
    if job_name not in scheduler_service.jobs:
        raise HTTPException(status_code=404, detail=f"Job '{job_name}' not found")
    
    try:
        success = await scheduler_service.run_job_manually(job_name, symbols)
        return {
            "job_name": job_name,
            "success": success,
            "message": f"Job '{job_name}' executed {'successfully' if success else 'with errors'}"
        }
    except Exception as e:
        logger.error(f"Error running job {job_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to run job: {str(e)}")


@router.post("/jobs/{job_name}/pause")
async def pause_job(job_name: str) -> Dict[str, str]:
    """Pause a specific scheduled job."""
    scheduler_service = get_scheduler_service()
    if not scheduler_service:
        raise HTTPException(status_code=503, detail="Scheduler service not available")
    
    try:
        await scheduler_service.pause_job(job_name)
        return {"message": f"Job '{job_name}' paused successfully"}
    except Exception as e:
        logger.error(f"Error pausing job {job_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to pause job: {str(e)}")


@router.post("/jobs/{job_name}/resume")
async def resume_job(job_name: str) -> Dict[str, str]:
    """Resume a paused job."""
    scheduler_service = get_scheduler_service()
    if not scheduler_service:
        raise HTTPException(status_code=503, detail="Scheduler service not available")
    
    try:
        await scheduler_service.resume_job(job_name)
        return {"message": f"Job '{job_name}' resumed successfully"}
    except Exception as e:
        logger.error(f"Error resuming job {job_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to resume job: {str(e)}")


@router.get("/market-hours")
async def check_market_hours() -> Dict[str, Any]:
    """Check if current time is within market hours."""
    scheduler_service = get_scheduler_service()
    if not scheduler_service:
        raise HTTPException(status_code=503, detail="Scheduler service not available")
    
    is_market_hours = scheduler_service.scheduler.is_market_hours()
    
    return {
        "is_market_hours": is_market_hours,
        "market_open": "09:30 EST",
        "market_close": "16:00 EST",
        "timezone": "America/New_York"
    }
