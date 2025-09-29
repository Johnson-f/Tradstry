from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from config import get_settings, Settings
from database import get_supabase
from supabase import Client
from routers import analytics, setups_router, notes_router, images, trade_notes_router, market_data_router
from routers import ai_reports, ai_chat, ai_insights, symbol_cache_health
from routers.stocks import router as stocks_router
from routers.options import router as options_router
from services.redis_client import init_redis, close_redis, get_redis_health
from services.cache_service import get_cache_stats
from services.market_data.startup_handler import register_symbol_cache_lifecycle
import logging

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

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
app.include_router(trade_notes_router, prefix=get_settings().API_PREFIX)
app.include_router(market_data_router, prefix=get_settings().API_PREFIX)

# AI routers
app.include_router(ai_reports.router, prefix=get_settings().API_PREFIX)
app.include_router(ai_chat.router, prefix=get_settings().API_PREFIX)
app.include_router(ai_insights.router, prefix=get_settings().API_PREFIX)

# Symbol Cache Health router
app.include_router(symbol_cache_health.router, prefix=get_settings().API_PREFIX)

@app.on_event("startup")
async def startup_event():
    """Initialize services on app startup."""
    try:
        # Initialize Redis connection
        await init_redis()
        logger.info("Redis initialized successfully")
        
        logger.info("FastAPI app started successfully")
    except Exception as e:
        logger.error(f"Failed to start app services: {e}")

# Register Symbol Registry Cache lifecycle
register_symbol_cache_lifecycle(app)

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up services on app shutdown."""
    try:
        # Close Redis connections
        await close_redis()
        logger.info("Redis connections closed successfully")
        
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

# Redis health check endpoint
@app.get(f"{get_settings().API_PREFIX}/health/redis")
async def redis_health_check():
    """Check Redis connection health and get basic stats."""
    redis_health = await get_redis_health()
    return redis_health

# Cache statistics endpoint
@app.get(f"{get_settings().API_PREFIX}/health/cache")
async def cache_stats():
    """Get comprehensive cache statistics."""
    cache_stats = await get_cache_stats()
    return cache_stats

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
