"""
Earnings transcript cron job - fetches earnings call transcripts and summaries.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor

logger = logging.getLogger(__name__)


class EarningsTranscriptCron:
    """Cron job for fetching earnings transcript data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize earnings transcript cron job."""
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.job_name = "earnings_transcript"
    
    async def execute(self, symbols: Optional[List[str]] = None, days_back: Optional[int] = None) -> bool:
        """
        Execute earnings transcript data fetching and processing.
        
        Args:
            symbols: List of stock symbols to fetch. If None, uses recent earnings.
            days_back: Number of days back to fetch transcripts for. Default is 7 days.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job")
            
            # Default to 7 days back
            if not days_back:
                days_back = 7
            
            # Use default symbols if none provided
            if not symbols:
                symbols = self._get_recent_earnings_symbols(days_back)
            
            logger.info(f"Fetching earnings transcripts for {len(symbols)} symbols from last {days_back} days")
            
            # Fetch data from market_data providers
            fetch_result = await self.market_data_brain.get_earnings_transcripts(symbols, days_back)
            
            if not fetch_result.success:
                logger.error(f"❌ Failed to fetch earnings transcripts: {fetch_result.error}")
                return False
            
            # Process and store data
            raw_data = {
                "data_type": "earnings_transcript",
                "data": fetch_result.data,
                "provider": fetch_result.provider,
                "timestamp": start_time.isoformat(),
                "days_back": days_back
            }
            
            success = await self.data_processor.process_earnings_transcripts(raw_data)
            
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
    
    def _get_recent_earnings_symbols(self, days_back: int) -> List[str]:
        """Get symbols that had earnings in the recent period."""
        # This would typically query the earnings calendar or database
        # For now, return major symbols that frequently have earnings
        return [
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "NFLX",
            "JPM", "BAC", "WFC", "C", "GS", "MS",  # Banks (quarterly earnings)
            "JNJ", "PFE", "MRK", "ABT", "UNH"     # Healthcare
        ]
