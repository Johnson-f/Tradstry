"""
Base job class for market data fetching operations.
Provides common functionality for all data fetching jobs.
"""

import logging
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import datetime
import asyncio

from scheduler.database_service import SchedulerDatabaseService


logger = logging.getLogger(__name__)


class BaseMarketDataJob(ABC):
    """
    Abstract base class for market data fetching jobs.
    Provides common functionality and interface for all data types.
    """
    
    def __init__(self, database_service: SchedulerDatabaseService):
        """Initialize the job with database service."""
        self.db_service = database_service
        self.job_name = self.__class__.__name__
        
    @abstractmethod
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Fetch data from external API for given symbols.
        
        Args:
            symbols: List of stock symbols to fetch data for
            
        Returns:
            Dictionary containing fetched data
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
    
    async def execute(self, symbols: Optional[List[str]] = None) -> bool:
        """
        Execute the complete job: fetch and store data.
        
        Args:
            symbols: Optional list of symbols. If None, uses default symbols.
            
        Returns:
            True if job completed successfully, False otherwise
        """
        start_time = datetime.now()
        
        try:
            # Use default symbols if none provided
            if symbols is None:
                symbols = await self._get_default_symbols()
            
            if not symbols:
                logger.warning(f"{self.job_name}: No symbols to process")
                return True
            
            logger.info(f"{self.job_name}: Starting job for {len(symbols)} symbols")
            
            # Fetch data from external API
            data = await self.fetch_data(symbols)
            
            if not data:
                logger.warning(f"{self.job_name}: No data fetched")
                return False
            
            # Store data in database
            success = await self.store_data(data)
            
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
    
    async def _get_default_symbols(self) -> List[str]:
        """
        Get default symbols to process.
        Can be overridden by subclasses for specific symbol requirements.
        """
        return await self.db_service.get_tracked_symbols()
    
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
