"""
Dividend data cron job - fetches dividend information and history.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor

logger = logging.getLogger(__name__)


class DividendDataCron:
    """Cron job for fetching dividend data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize dividend data cron job."""
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.job_name = "dividend_data"
    
    async def execute(self, symbols: Optional[List[str]] = None) -> bool:
        """
        Execute dividend data fetching and processing.
        
        Args:
            symbols: List of stock symbols to fetch. If None, uses default symbols.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job")
            
            # Use default symbols if none provided
            if not symbols:
                symbols = self._get_default_symbols()
            
            logger.info(f"Fetching dividend data for {len(symbols)} symbols")
            
            # Fetch data from market_data providers
            fetch_result = await self.market_data_brain.get_dividends(symbols)
            
            if not fetch_result.success:
                logger.error(f"❌ Failed to fetch dividend data: {fetch_result.error}")
                return False
            
            # Process and store data
            raw_data = {
                "data_type": "dividend_data",
                "data": fetch_result.data,
                "provider": fetch_result.provider,
                "timestamp": start_time.isoformat()
            }
            
            success = await self.data_processor.process_dividends(raw_data)
            
            if success:
                execution_time = (datetime.now() - start_time).total_seconds()
                logger.info(f"✅ {self.job_name} completed successfully in {execution_time:.2f}s")
                return True
            else:
                logger.error(f"❌ {self.job_name} processing failed")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in {self.job_name} cron job: {e}")
            return False
    
    def _get_default_symbols(self) -> List[str]:
        """Get default list of dividend-paying symbols."""
        return [
            "AAPL", "MSFT", "JNJ", "PG", "KO", "PEP", "WMT", "HD", "VZ", "T",
            "JPM", "BAC", "XOM", "CVX", "IBM", "INTC", "CSCO", "MRK", "ABT", "PFE"
        ]
