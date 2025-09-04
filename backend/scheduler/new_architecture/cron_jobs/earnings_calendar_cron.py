"""
Earnings calendar cron job - fetches upcoming earnings announcements.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor

logger = logging.getLogger(__name__)


class EarningsCalendarCron:
    """Cron job for fetching earnings calendar data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize earnings calendar cron job."""
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.job_name = "earnings_calendar"
    
    async def execute(self, date_range: Optional[int] = None) -> bool:
        """
        Execute earnings calendar data fetching and processing.
        
        Args:
            date_range: Number of days ahead to fetch earnings for. Default is 30 days.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job")
            
            # Default to 30 days ahead
            if not date_range:
                date_range = 30
            
            from_date = datetime.now().date()
            to_date = from_date + timedelta(days=date_range)
            
            logger.info(f"Fetching earnings calendar from {from_date} to {to_date}")
            
            # Fetch data from market_data providers
            fetch_result = await self.market_data_brain.get_earnings_calendar(from_date, to_date)
            
            if not fetch_result.success:
                logger.error(f"❌ Failed to fetch earnings calendar: {fetch_result.error}")
                return False
            
            # Process and store data
            raw_data = {
                "data_type": "earnings_calendar",
                "data": fetch_result.data,
                "provider": fetch_result.provider,
                "timestamp": start_time.isoformat(),
                "date_range": {"from": from_date.isoformat(), "to": to_date.isoformat()}
            }
            
            success = await self.data_processor.process_earnings_calendar(raw_data)
            
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
