from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from config import get_settings, Settings
from database import get_supabase
from supabase import Client
from routers import stocks_router, options_router, analytics, setups_router, notes_router, images
from scheduler.market_data_scheduler import MarketDataSchedulerService, set_scheduler_service
from scheduler.scheduler_router import router as scheduler_router
from scheduler.celery_router import router as celery_router
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title=get_settings().PROJECT_NAME,
    version=get_settings().VERSION,
    openapi_url=f"{get_settings().API_PREFIX}/openapi.json",
    docs_url=f"{get_settings().API_PREFIX}/docs",
    redoc_url=f"{get_settings().API_PREFIX}/redoc"
)

# Include routers
app.include_router(stocks_router, prefix=get_settings().API_PREFIX)
app.include_router(options_router, prefix=get_settings().API_PREFIX)
app.include_router(analytics.router, prefix=get_settings().API_PREFIX)
app.include_router(setups_router, prefix=get_settings().API_PREFIX)
app.include_router(notes_router, prefix=get_settings().API_PREFIX)
app.include_router(images.router, prefix=get_settings().API_PREFIX)
app.include_router(scheduler_router, prefix=get_settings().API_PREFIX)
app.include_router(celery_router, prefix=get_settings().API_PREFIX)

@app.on_event("startup")
async def startup_event():
    """Initialize services on app startup."""
    try:
        # APScheduler disabled - now using Celery + Redis for scheduling
        # Initialize database service for API endpoints only
        db_service = SchedulerDatabaseService()  # Uses admin client by default
        orchestrator = MarketDataBrain()
        
        # Create scheduler service for API endpoints (without starting jobs)
        scheduler_service = MarketDataSchedulerService(db_service, orchestrator)
        set_scheduler_service(scheduler_service)
        
        # Note: Jobs are now handled by Celery workers
        # Start Celery services with: ./scripts/start_celery.sh
        
        logger.info("FastAPI app started successfully (APScheduler disabled, using Celery)")
    except Exception as e:
        logger.error(f"Failed to start app services: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up services on app shutdown."""
    try:
        # No scheduler to stop - Celery runs independently
        logger.info("FastAPI app shutdown complete")
    except Exception as e:
        logger.error(f"Error during app shutdown: {e}")

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{get_settings().API_PREFIX}/auth/token")

# Root endpoint
@app.get("/")
async def root():
    return {"message": "Welcome to Tradistry API"}

# Health check endpoint
@app.get(f"{get_settings().API_PREFIX}/health")
async def health_check():
    return {"status": "healthy", "version": get_settings().VERSION}

# Example protected route
@app.get(f"{get_settings().API_PREFIX}/protected")
async def protected_route(
    token: str = Depends(oauth2_scheme),
    supabase: Client = Depends(get_supabase)
):
    try:
        # Here you would verify the token and get user info
        # For now, just return a success message
        return {"message": "Access granted to protected route"}
    except Exception as e:
        logger.error(f"Error in protected route: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
