"""
Scheduler Factory - Creates and manages the new scheduler architecture.
Provides a centralized way to instantiate the main scheduler service and components.
"""

import logging
from typing import Optional, Dict, Any

from market_data.config import MarketDataConfig
from .main_scheduler import MainSchedulerService

logger = logging.getLogger(__name__)


class SchedulerFactory:
    """
    Factory class for creating and managing the new scheduler architecture.
    Provides easy access to the main scheduler service and its components.
    """

    def __init__(self, market_data_config: Optional[MarketDataConfig] = None):
        """
        Initialize the scheduler factory.
        
        Args:
            market_data_config: Optional market data configuration
        """
        self.market_data_config = market_data_config or MarketDataConfig.from_env()
        self.main_scheduler: Optional[MainSchedulerService] = None

    async def create_main_scheduler(self) -> MainSchedulerService:
        """
        Create and return the main scheduler service.
        
        Returns:
            MainSchedulerService instance
        """
        if self.main_scheduler is None:
            self.main_scheduler = MainSchedulerService(self.market_data_config)
        return self.main_scheduler
    
    async def start_scheduler(self) -> MainSchedulerService:
        """
        Create and start the main scheduler service.
        
        Returns:
            Started MainSchedulerService instance
        """
        scheduler = await self.create_main_scheduler()
        await scheduler.start()
        return scheduler

    async def get_scheduler_status(self) -> Dict[str, Any]:
        """
        Get the status of the scheduler system.
        
        Returns:
            Dictionary containing scheduler status information
        """
        if self.main_scheduler is None:
            return {"status": "not_created", "message": "Scheduler not created yet"}
        
        return self.main_scheduler.get_system_status()
    
    async def health_check(self) -> Dict[str, Any]:
        """
        Perform a comprehensive health check of the scheduler system.
        
        Returns:
            Dictionary containing health check results
        """
        if self.main_scheduler is None:
            return {
                "status": "not_created",
                "message": "Scheduler not created yet",
                "components": {},
                "issues": ["Main scheduler service not initialized"]
            }
        
        return await self.main_scheduler.health_check()
    
    async def trigger_job_manually(self, job_name: str) -> bool:
        """
        Manually trigger a specific job for testing.
        
        Args:
            job_name: Name of the job to trigger
            
        Returns:
            True if successful, False otherwise
        """
        if self.main_scheduler is None:
            logger.error("Cannot trigger job: scheduler not created")
            return False
        
        return await self.main_scheduler.trigger_job_manually(job_name)

    async def get_available_jobs(self) -> Dict[str, Any]:
        """
        Get all available job configurations.
        
        Returns:
            Dictionary containing job configurations
        """
        from scheduler.config import SchedulerConfig
        return SchedulerConfig.get_all_jobs()

    async def stop_scheduler(self) -> bool:
        """
        Stop the main scheduler service.
        
        Returns:
            True if successful, False otherwise
        """
        if self.main_scheduler is None:
            logger.warning("Cannot stop scheduler: not created")
            return True
        
        try:
            await self.main_scheduler.stop()
            return True
        except Exception as e:
            logger.error(f"Error stopping scheduler: {e}")
            return False

    async def close(self):
        """Clean up resources"""
        await self.stop_scheduler()
        self.main_scheduler = None
        logger.info("SchedulerFactory closed successfully")
    
    # Context manager support
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()


# Convenience functions for easy usage
async def create_scheduler_factory(market_data_config: Optional[MarketDataConfig] = None) -> SchedulerFactory:
    """
    Create a new scheduler factory.
    
    Args:
        market_data_config: Optional market data configuration
        
    Returns:
        SchedulerFactory instance
    """
    return SchedulerFactory(market_data_config)


async def create_and_start_scheduler_system(market_data_config: Optional[MarketDataConfig] = None) -> MainSchedulerService:
    """
    Create and start the complete scheduler system.
    
    Args:
        market_data_config: Optional market data configuration
        
    Returns:
        Started MainSchedulerService instance
    """
    factory = SchedulerFactory(market_data_config)
    return await factory.start_scheduler()
