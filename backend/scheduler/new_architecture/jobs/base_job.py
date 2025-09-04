"""
Base job class for market data processing operations.
Provides common functionality for data transformation and storage jobs.
Note: In the new architecture, data fetching is handled by CronDataScheduler.
"""

import logging
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import datetime
import asyncio

from ...database_service import SchedulerDatabaseService
# Legacy imports removed - these are now handled by CronDataScheduler and DataProcessor


logger = logging.getLogger(__name__)


class BaseMarketDataJob(ABC):
    """
    Abstract base class for market data processing jobs.
    In the new architecture, this handles data transformation and storage only.
    Data fetching is handled by CronDataScheduler.
    """
    
    def __init__(
        self,
        db_service: SchedulerDatabaseService
    ):
        """Initialize the job with database service."""
        self.db_service = db_service
        self.job_name = self.__class__.__name__
        
    @abstractmethod
    async def process_data(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process raw data received from cron scheduler.
        
        Args:
            raw_data: Raw data from market_data providers
            
        Returns:
            Dictionary containing processed data ready for storage
        """
        pass
    
    @abstractmethod
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """
        Store fetched data using database upsert functions.
        
        Args:
            data: Data dictionary returned from fetch_data
            
        Returns:
            True if successful, False otherwise
        """
        pass
    
    async def execute(self, raw_data: Dict[str, Any]) -> bool:
        """
        Execute the complete job: process and store data.
        
        Args:
            raw_data: Raw data received from cron scheduler
            
        Returns:
            True if job completed successfully, False otherwise
        """
        start_time = datetime.now()
        job_id = f"{self.job_name}_{int(start_time.timestamp())}"
        
        try:
            if not raw_data:
                logger.warning(f"{self.job_name}: No data to process")
                return True
            
            logger.info(f"{self.job_name}: Starting data processing")
            
            # Process raw data
            processed_data = await self.process_data(raw_data)
            
            if not processed_data:
                logger.warning(f"{self.job_name}: No data after processing")
                return False
            
            # Store processed data in database
            success = await self.store_data(processed_data)
            
            duration = (datetime.now() - start_time).total_seconds()
            
            if success:
                logger.info(f"{self.job_name}: Completed successfully in {duration:.2f}s")
            else:
                logger.error(f"{self.job_name}: Failed to store data after {duration:.2f}s")
            
            return success
            
        except Exception as e:
            duration = (datetime.now() - start_time).total_seconds()
            logger.error(f"{self.job_name}: Failed after {duration:.2f}s - {str(e)}")
            return False
    
    def _get_data_type(self) -> str:
        """
        Get the data type for this job (used for tracking).
        Must be implemented by subclasses.
        
        Returns:
            DataType enum value for this job
        """
        pass
    
    async def validate_data(self, data: Dict[str, Any]) -> bool:
        """
        Validate processed data before storage.
        
        Args:
            data: Processed data to validate
            
        Returns:
            True if data is valid, False otherwise
        """
        # Basic validation - can be overridden by subclasses
        return data is not None and len(data) > 0
    
    async def _transform_for_storage(self, data: Any) -> Dict[str, Any]:
        """
        Transform data for database storage.
        Can be overridden by subclasses for specific transformation requirements.
        """
        if hasattr(data, 'model_dump'):
            return data.model_dump()
        elif isinstance(data, dict):
            return data
        else:
            return {'data': data}
    
    def _batch_symbols(self, symbols: List[str], batch_size: int = 10) -> List[List[str]]:
        """
        Split symbols into batches for API rate limiting.
        
        Args:
            symbols: List of symbols to batch
            batch_size: Maximum symbols per batch
            
        Returns:
            List of symbol batches
        """
        return [symbols[i:i + batch_size] for i in range(0, len(symbols), batch_size)]
    
    async def _execute_with_retry(self, func, *args, max_retries: int = 3, **kwargs):
        """
        Execute a function with retry logic.
        
        Args:
            func: Function to execute
            max_retries: Maximum number of retry attempts
            *args, **kwargs: Arguments to pass to the function
            
        Returns:
            Function result or None if all retries failed
        """
        for attempt in range(max_retries + 1):
            try:
                if asyncio.iscoroutinefunction(func):
                    return await func(*args, **kwargs)
                else:
                    return func(*args, **kwargs)
            except Exception as e:
                if attempt == max_retries:
                    logger.error(f"{self.job_name}: All {max_retries + 1} attempts failed. Last error: {e}")
                    raise
                else:
                    wait_time = 2 ** attempt  # Exponential backoff
                    logger.warning(f"{self.job_name}: Attempt {attempt + 1} failed, retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
