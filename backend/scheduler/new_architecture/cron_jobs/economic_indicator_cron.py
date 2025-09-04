"""
Economic indicator cron job - fetches economic indicators and metrics.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor

logger = logging.getLogger(__name__)


class EconomicIndicatorCron:
    """Cron job for fetching economic indicator data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize economic indicator cron job."""
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.job_name = "economic_indicator"
    
    async def execute(self, indicators: Optional[List[str]] = None, countries: Optional[List[str]] = None) -> bool:
        """
        Execute economic indicator data fetching and processing.
        
        Args:
            indicators: List of economic indicators to fetch. If None, uses default indicators.
            countries: List of country codes. If None, uses default countries.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job")
            
            # Use default indicators if none provided
            if not indicators:
                indicators = self._get_default_indicators()
            
            # Use default countries if none provided
            if not countries:
                countries = self._get_default_countries()
            
            logger.info(f"Fetching {len(indicators)} economic indicators for {len(countries)} countries")
            
            # Fetch data from market_data providers
            fetch_result = await self.market_data_brain.get_economic_indicators(indicators, countries)
            
            if not fetch_result.success:
                logger.error(f"❌ Failed to fetch economic indicators: {fetch_result.error}")
                return False
            
            # Process and store data
            raw_data = {
                "data_type": "economic_indicator",
                "data": fetch_result.data,
                "provider": fetch_result.provider,
                "timestamp": start_time.isoformat(),
                "indicators": indicators,
                "countries": countries
            }
            
            success = await self.data_processor.process_economic_indicators(raw_data)
            
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
    
    def _get_default_indicators(self) -> List[str]:
        """Get default list of economic indicators."""
        return [
            "GDP",              # Gross Domestic Product
            "INFLATION",        # Inflation Rate
            "UNEMPLOYMENT",     # Unemployment Rate
            "INTEREST_RATE",    # Central Bank Interest Rate
            "CPI",              # Consumer Price Index
            "PPI",              # Producer Price Index
            "RETAIL_SALES",     # Retail Sales
            "INDUSTRIAL_PROD",  # Industrial Production
            "HOUSING_STARTS",   # Housing Starts
            "TRADE_BALANCE",    # Trade Balance
            "CONSUMER_CONF",    # Consumer Confidence
            "PMI_MANUF",        # PMI Manufacturing
            "PMI_SERVICES"      # PMI Services
        ]
    
    def _get_default_countries(self) -> List[str]:
        """Get default list of country codes."""
        return ["US", "EU", "GB", "JP", "CN", "CA", "AU"]
