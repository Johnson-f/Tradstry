"""
Base job class for market data fetching operations.
Provides common functionality for all data fetching jobs with enhanced tracking and fallback.
"""

import logging
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import datetime
import asyncio

from scheduler.database_service import SchedulerDatabaseService
from scheduler.data_fetch_tracker import DataFetchTracker, DataType
from scheduler.enhanced_provider_manager import EnhancedProviderManager, FetchStrategy


logger = logging.getLogger(__name__)


class BaseMarketDataJob(ABC):
    """
    Abstract base class for market data fetching jobs.
    Provides common functionality and interface for all data types with enhanced tracking.
    """
    
    def __init__(
        self, 
        database_service: SchedulerDatabaseService,
        data_tracker: Optional[DataFetchTracker] = None,
        provider_manager: Optional[EnhancedProviderManager] = None
    ):
        """Initialize the job with database service and optional tracking components."""
        self.db_service = database_service
        self.job_name = self.__class__.__name__
        self.data_tracker = data_tracker
        self.provider_manager = provider_manager
        self.enable_enhanced_tracking = data_tracker is not None and provider_manager is not None
        
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
        Execute the complete job: fetch and store data with enhanced tracking.
        
        Args:
            symbols: Optional list of symbols. If None, uses default symbols.
            
        Returns:
            True if job completed successfully, False otherwise
        """
        start_time = datetime.now()
        job_id = f"{self.job_name}_{int(start_time.timestamp())}"
        
        try:
            # Use default symbols if none provided
            if symbols is None:
                symbols = await self._get_default_symbols()
            
            if not symbols:
                logger.warning(f"{self.job_name}: No symbols to process")
                return True
            
            logger.info(f"{self.job_name}: Starting job for {len(symbols)} symbols")
            
            # Check for retry candidates if enhanced tracking is enabled
            if self.enable_enhanced_tracking:
                data_type = self._get_data_type()
                retry_symbols = self.data_tracker.get_retry_candidates(data_type)
                if retry_symbols:
                    logger.info(f"{self.job_name}: Found {len(retry_symbols)} symbols ready for retry")
                    # Add retry symbols to the processing list
                    symbols = list(set(symbols + retry_symbols))
            
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
    
    @abstractmethod
    def _get_data_type(self) -> DataType:
        """
        Get the data type for this job (used for tracking).
        Must be implemented by subclasses.
        
        Returns:
            DataType enum value for this job
        """
        pass
    
    async def fetch_data_with_enhanced_tracking(
        self,
        symbols: List[str],
        fetch_method: str,
        strategy: FetchStrategy = FetchStrategy.MOST_RELIABLE,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Enhanced fetch method that uses the provider manager and tracking system.
        
        Args:
            symbols: List of symbols to fetch
            fetch_method: Method name to call on MarketDataBrain
            strategy: Fetch strategy to use
            **kwargs: Additional arguments for the fetch method
            
        Returns:
            Dictionary containing fetched data
        """
        if not self.enable_enhanced_tracking:
            # Fall back to regular fetch_data method
            return await self.fetch_data(symbols)
        
        data_type = self._get_data_type()
        job_id = f"{self.job_name}_{int(datetime.now().timestamp())}"
        
        results = await self.provider_manager.fetch_with_enhanced_fallback(
            symbols=symbols,
            data_type=data_type,
            fetch_method=fetch_method,
            strategy=strategy,
            job_id=job_id,
            **kwargs
        )
        
        return results
    
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
