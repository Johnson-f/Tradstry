"""
Economic data fetching jobs.
Handles economic events and indicators.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime, timedelta

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class EconomicEventsJob(BaseMarketDataJob):
    """Job for fetching and storing economic events."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch economic events data."""
        try:
            logger.info("Fetching economic events")
            
            # Get events for next 30 days
            end_date = datetime.now().date() + timedelta(days=30)
            events_data = await self.orchestrator.get_economic_events(
                start_date=datetime.now().date(),
                end_date=end_date
            )
            
            return {"events": events_data}
        except Exception as e:
            logger.error(f"Error fetching economic events: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store economic events using database upsert function."""
        events_data = data.get("events", [])
        if not events_data:
            return True
        
        try:
            success_count = 0
            
            for event in events_data:
                try:
                    await self.db_service.execute_function(
                        "upsert_economic_event",
                        p_event_name=event.get('name'),
                        p_country=event.get('country'),
                        p_currency=event.get('currency'),
                        p_importance=event.get('importance'),
                        p_actual_value=event.get('actual'),
                        p_forecast_value=event.get('forecast'),
                        p_previous_value=event.get('previous'),
                        p_event_date=event.get('date'),
                        p_event_time=event.get('time'),
                        p_data_provider=event.get('provider', 'unknown')
                    )
                    success_count += 1
                except Exception as e:
                    logger.error(f"Failed to store economic event: {e}")
            
            logger.info(f"Stored {success_count}/{len(events_data)} economic events")
            return success_count == len(events_data)
        except Exception as e:
            logger.error(f"Error storing economic events: {e}")
            return False


class EconomicIndicatorsJob(BaseMarketDataJob):
    """Job for fetching and storing economic indicators."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch economic indicators data."""
        try:
            logger.info("Fetching economic indicators")
            indicators_data = await self.orchestrator.get_economic_indicators()
            return {"indicators": indicators_data}
        except Exception as e:
            logger.error(f"Error fetching economic indicators: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store economic indicators using database upsert function."""
        indicators_data = data.get("indicators", [])
        if not indicators_data:
            return True
        
        try:
            success_count = 0
            
            for indicator in indicators_data:
                try:
                    await self.db_service.execute_function(
                        "upsert_economic_indicator",
                        p_indicator_name=indicator.get('name'),
                        p_country=indicator.get('country'),
                        p_frequency=indicator.get('frequency'),
                        p_unit=indicator.get('unit'),
                        p_value=indicator.get('value'),
                        p_date=indicator.get('date'),
                        p_data_provider=indicator.get('provider', 'unknown')
                    )
                    success_count += 1
                except Exception as e:
                    logger.error(f"Failed to store economic indicator: {e}")
            
            logger.info(f"Stored {success_count}/{len(indicators_data)} economic indicators")
            return success_count == len(indicators_data)
        except Exception as e:
            logger.error(f"Error storing economic indicators: {e}")
            return False
