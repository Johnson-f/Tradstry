"""
Stock quotes cron job - fetches real-time stock price data.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor

logger = logging.getLogger(__name__)


class StockQuotesCron:
    """Cron job for fetching stock quotes data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize stock quotes cron job."""
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.job_name = "stock_quotes"
    
    async def execute(self, symbols: Optional[List[str]] = None) -> bool:
        """
        Execute stock quotes data fetching and processing.
        
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
            
            logger.info(f"Fetching stock quotes for {len(symbols)} symbols: {symbols[:5]}{'...' if len(symbols) > 5 else ''}")
            
            # Fetch data from market_data providers
            fetch_result = await self.market_data_brain.get_stock_quotes(symbols)
            
            if not fetch_result.success:
                logger.error(f"❌ Failed to fetch stock quotes: {fetch_result.error}")
                return False
            
            # Process and store data
            raw_data = {
                "data_type": "stock_quotes",
                "data": fetch_result.data,
                "provider": fetch_result.provider,
                "timestamp": start_time.isoformat()
            }
            
            success = await self.data_processor.process_stock_quotes(raw_data)
            
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
        """Get default list of symbols to fetch."""
        return [
            # Major indices components
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "NFLX",
            "SPY", "QQQ", "IWM", "DIA",  # ETFs
            # Additional popular stocks
            "BRK.B", "JPM", "JNJ", "V", "PG", "UNH", "HD", "MA", "BAC", "XOM"
        ]
