"""
Historical price cron job - fetches historical stock price data.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor

logger = logging.getLogger(__name__)


class HistoricalPriceCron:
    """Cron job for fetching historical price data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize historical price cron job."""
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.job_name = "historical_price"
    
    async def execute(self, symbols: Optional[List[str]] = None, period: Optional[str] = None) -> bool:
        """
        Execute historical price data fetching and processing.
        
        Args:
            symbols: List of stock symbols to fetch. If None, uses default symbols.
            period: Time period for historical data ('1d', '1w', '1m', '3m', '1y'). Default is '1d'.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job")
            
            # Use default symbols if none provided
            if not symbols:
                symbols = self._get_default_symbols()
            
            # Default to daily data
            if not period:
                period = "1d"
            
            logger.info(f"Fetching {period} historical price data for {len(symbols)} symbols")
            
            # Calculate date range based on period
            end_date = datetime.now().date()
            start_date = self._calculate_start_date(end_date, period)
            
            # Fetch data from market_data providers
            fetch_result = await self.market_data_brain.get_historical_prices(
                symbols, start_date, end_date, interval="1d"
            )
            
            if not fetch_result.success:
                logger.error(f"❌ Failed to fetch historical prices: {fetch_result.error}")
                return False
            
            # Process and store data
            raw_data = {
                "data_type": "historical_price",
                "data": fetch_result.data,
                "provider": fetch_result.provider,
                "timestamp": start_time.isoformat(),
                "period": period,
                "date_range": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat()
                }
            }
            
            success = await self.data_processor.process_historical_prices(raw_data)
            
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
        """Get default list of symbols for historical data."""
        return [
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "NFLX",
            "SPY", "QQQ", "IWM", "DIA",  # Major ETFs
            "BRK.B", "JPM", "JNJ", "V", "PG", "UNH", "HD", "MA", "BAC", "XOM"
        ]
    
    def _calculate_start_date(self, end_date: datetime.date, period: str) -> datetime.date:
        """Calculate start date based on period."""
        period_map = {
            "1d": 1,      # 1 day
            "1w": 7,      # 1 week
            "1m": 30,     # 1 month
            "3m": 90,     # 3 months
            "6m": 180,    # 6 months
            "1y": 365,    # 1 year
            "2y": 730,    # 2 years
            "5y": 1825    # 5 years
        }
        
        days_back = period_map.get(period, 1)
        return end_date - timedelta(days=days_back)
