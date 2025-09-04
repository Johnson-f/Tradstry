"""
Economic events cron job - fetches economic calendar and events data.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor

logger = logging.getLogger(__name__)


class EconomicEventsCron:
    """Cron job for fetching economic events data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize economic events cron job."""
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.job_name = "economic_events"
    
    async def execute(self, date_range: Optional[int] = None, countries: Optional[List[str]] = None) -> bool:
        """
        Execute economic events data fetching and processing.
        
        Args:
            date_range: Number of days ahead to fetch events for. Default is 14 days.
            countries: List of country codes to fetch events for. Default is major economies.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job")
            
            # Default to 14 days ahead
            if not date_range:
                date_range = 14
            
            # Default to major economies
            if not countries:
                countries = self._get_default_countries()
            
            from_date = datetime.now().date()
            to_date = from_date + timedelta(days=date_range)
            
            logger.info(f"Fetching economic events from {from_date} to {to_date} for countries: {countries}")
            
            # Fetch data from market_data providers
            fetch_result = await self.market_data_brain.get_economic_events(from_date, to_date, countries)
            
            if not fetch_result.success:
                logger.error(f"❌ Failed to fetch economic events: {fetch_result.error}")
                return False
            
            # Process and store data
            raw_data = {
                "data_type": "economic_events",
                "data": fetch_result.data,
                "provider": fetch_result.provider,
                "timestamp": start_time.isoformat(),
                "date_range": {"from": from_date.isoformat(), "to": to_date.isoformat()},
                "countries": countries
            }
            
            success = await self.data_processor.process_economic_events(raw_data)
            
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
    
    def _get_default_countries(self) -> List[str]:
        """Get default list of country codes for economic events."""
        return [
            "US",  # United States
            "EU",  # European Union
            "GB",  # United Kingdom
            "JP",  # Japan
            "CN",  # China
            "CA",  # Canada
            "AU",  # Australia
            "CH",  # Switzerland
            "DE",  # Germany
            "FR"   # France
        ]
