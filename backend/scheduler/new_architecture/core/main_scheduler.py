"""
Main scheduler service that coordinates the new architecture.
This service manages both the cron scheduler and the data processing pipeline.
"""

import logging
from typing import Optional
import asyncio

from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig
from ..cron_jobs.cron_scheduler import CronDataScheduler
from ..jobs.data_processor import DataProcessor
from ...database_service import SchedulerDatabaseService
from ...config import SchedulerConfig

logger = logging.getLogger(__name__)


class MainSchedulerService:
    """
    Main scheduler service that coordinates the new architecture.
    
    Architecture Components:
    1. CronDataScheduler - Fetches data from market_data at intervals
    2. DataProcessor - Transforms and stores data in database
    3. MarketDataBrain - Provides data from multiple providers
    """
    
    def __init__(self, market_data_config: Optional[MarketDataConfig] = None):
        """Initialize the main scheduler service."""
        self.market_data_config = market_data_config or MarketDataConfig.from_env()
        
        # Initialize core components
        self.market_data_brain = MarketDataBrain(self.market_data_config)
        self.database_service = SchedulerDatabaseService()
        self.data_processor = DataProcessor(self.database_service)
        
        # Initialize cron scheduler
        self.cron_scheduler = CronDataScheduler(
            market_data_brain=self.market_data_brain,
            database_service=self.database_service
        )
        
        self._is_running = False
    
    async def start(self):
        """Start the main scheduler service."""
        if self._is_running:
            logger.warning("Main scheduler service is already running")
            return
        
        try:
            logger.info("Starting main scheduler service...")
            
            # Initialize market data brain
            await self.market_data_brain.initialize()
            logger.info("Market data brain initialized")
            
            # Start cron scheduler
            await self.cron_scheduler.start()
            logger.info("Cron scheduler started")
            
            self._is_running = True
            logger.info("✅ Main scheduler service started successfully")
            
            # Log system status
            await self._log_system_status()
            
        except Exception as e:
            logger.error(f"Failed to start main scheduler service: {e}")
            await self.stop()  # Cleanup on failure
            raise
    
    async def stop(self):
        """Stop the main scheduler service."""
        if not self._is_running:
            return
        
        try:
            logger.info("Stopping main scheduler service...")
            
            # Stop cron scheduler
            await self.cron_scheduler.stop()
            logger.info("Cron scheduler stopped")
            
            # Close market data brain
            await self.market_data_brain.close()
            logger.info("Market data brain closed")
            
            self._is_running = False
            logger.info("✅ Main scheduler service stopped successfully")
            
        except Exception as e:
            logger.error(f"Error stopping main scheduler service: {e}")
    
    async def _log_system_status(self):
        """Log the current system status."""
        try:
            # Get provider status
            provider_status = self.market_data_brain.get_provider_status()
            enabled_providers = [name for name, enabled in provider_status.items() if enabled]
            
            logger.info(f"📊 System Status:")
            logger.info(f"   Enabled providers: {len(enabled_providers)} ({', '.join(enabled_providers)})")
            logger.info(f"   Cron scheduler running: {self.cron_scheduler.is_running()}")
            
            # Get job status
            jobs_status = self.cron_scheduler.get_all_jobs_status()
            logger.info(f"   Scheduled jobs: {len(jobs_status)}")
            
            for job in jobs_status[:5]:  # Show first 5 jobs
                logger.info(f"     - {job['name']}: Next run at {job['next_run_time']}")
            
            if len(jobs_status) > 5:
                logger.info(f"     ... and {len(jobs_status) - 5} more jobs")
            
            # Get tracked symbols count
            try:
                symbols = await self.database_service.get_tracked_symbols()
                logger.info(f"   Tracked symbols: {len(symbols)}")
            except Exception as e:
                logger.warning(f"Could not get tracked symbols count: {e}")
            
        except Exception as e:
            logger.error(f"Error logging system status: {e}")
    
    # Manual trigger methods for testing
    
    async def trigger_job_manually(self, job_name: str) -> bool:
        """
        Manually trigger a specific job for testing purposes.
        
        Args:
            job_name: Name of the job to trigger
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Manually triggering job: {job_name}")
            
            # Get the job method from cron scheduler
            job_method = self.cron_scheduler._get_job_method(job_name)
            
            if not job_method:
                logger.error(f"Job method not found: {job_name}")
                return False
            
            # Execute the job
            await job_method()
            logger.info(f"Successfully triggered job: {job_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error triggering job {job_name}: {e}")
            return False
    
    async def process_data_manually(self, data_type: str, raw_data: dict) -> bool:
        """
        Manually process data for testing purposes.
        
        Args:
            data_type: Type of data to process
            raw_data: Raw data to process
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Manually processing {data_type} data")
            
            success = await self.data_processor.process_batch_data(data_type, raw_data)
            
            if success:
                logger.info(f"Successfully processed {data_type} data")
            else:
                logger.error(f"Failed to process {data_type} data")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing {data_type} data: {e}")
            return False
    
    # Status and monitoring methods
    
    def is_running(self) -> bool:
        """Check if the main scheduler service is running."""
        return self._is_running
    
    def get_system_status(self) -> dict:
        """Get comprehensive system status."""
        return {
            "main_service_running": self._is_running,
            "cron_scheduler_running": self.cron_scheduler.is_running(),
            "provider_status": self.market_data_brain.get_provider_status(),
            "available_providers": self.market_data_brain.get_available_providers(),
            "scheduled_jobs": self.cron_scheduler.get_all_jobs_status()
        }
    
    async def health_check(self) -> dict:
        """Perform a comprehensive health check."""
        health_status = {
            "status": "healthy",
            "components": {},
            "issues": []
        }
        
        try:
            # Check main service
            health_status["components"]["main_service"] = {
                "status": "healthy" if self._is_running else "stopped",
                "running": self._is_running
            }
            
            # Check cron scheduler
            cron_running = self.cron_scheduler.is_running()
            health_status["components"]["cron_scheduler"] = {
                "status": "healthy" if cron_running else "stopped",
                "running": cron_running,
                "jobs_count": len(self.cron_scheduler.get_all_jobs_status())
            }
            
            # Check market data brain
            provider_status = self.market_data_brain.get_provider_status()
            enabled_count = sum(1 for enabled in provider_status.values() if enabled)
            health_status["components"]["market_data_brain"] = {
                "status": "healthy" if enabled_count > 0 else "degraded",
                "enabled_providers": enabled_count,
                "total_providers": len(provider_status)
            }
            
            # Check database connectivity
            try:
                symbols = await self.database_service.get_tracked_symbols()
                health_status["components"]["database"] = {
                    "status": "healthy",
                    "tracked_symbols": len(symbols)
                }
            except Exception as e:
                health_status["components"]["database"] = {
                    "status": "unhealthy",
                    "error": str(e)
                }
                health_status["issues"].append(f"Database connectivity issue: {e}")
            
            # Determine overall status
            component_statuses = [comp["status"] for comp in health_status["components"].values()]
            if "unhealthy" in component_statuses:
                health_status["status"] = "unhealthy"
            elif "degraded" in component_statuses:
                health_status["status"] = "degraded"
            
        except Exception as e:
            health_status["status"] = "unhealthy"
            health_status["issues"].append(f"Health check error: {e}")
        
        return health_status
    
    # Context manager support
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.stop()


# Convenience function for creating and starting the service
async def create_and_start_scheduler(market_data_config: Optional[MarketDataConfig] = None) -> MainSchedulerService:
    """
    Create and start the main scheduler service.
    
    Args:
        market_data_config: Optional market data configuration
        
    Returns:
        Started MainSchedulerService instance
    """
    service = MainSchedulerService(market_data_config)
    await service.start()
    return service
