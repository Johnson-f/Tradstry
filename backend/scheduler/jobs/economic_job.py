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
                        "upsert_economic_events",
                        p_event_id=event.get('event_id') or f"{event.get('name')}_{event.get('date')}",
                        p_country=event.get('country'),
                        p_event_name=event.get('event_name') or event.get('name'),
                        p_data_provider=event.get('provider', 'unknown'),
                        p_event_timestamp=event.get('event_timestamp') or event.get('datetime'),
                        
                        # Event parameters matching SQL function signature
                        p_event_period=event.get('event_period'),
                        p_actual=event.get('actual'),
                        p_previous=event.get('previous'),
                        p_forecast=event.get('forecast'),
                        p_unit=event.get('unit'),
                        p_importance=event.get('importance'),
                        p_last_update=event.get('last_update'),
                        p_description=event.get('description'),
                        p_url=event.get('url'),
                        p_category=event.get('category'),
                        p_frequency=event.get('frequency'),
                        p_source=event.get('source'),
                        p_currency=event.get('currency', 'USD'),
                        p_market_impact=event.get('market_impact'),
                        p_status=event.get('status', 'scheduled'),
                        p_revised=event.get('revised', False)
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
                        "upsert_economic_indicators",
                        p_indicator_code=indicator.get('indicator_code') or indicator.get('code'),
                        p_indicator_name=indicator.get('indicator_name') or indicator.get('name'),
                        p_country=indicator.get('country'),
                        p_period_date=indicator.get('period_date') or indicator.get('date'),
                        p_data_provider=indicator.get('provider', 'unknown'),
                        
                        # Indicator parameters matching SQL function signature
                        p_value=indicator.get('value'),
                        p_previous_value=indicator.get('previous_value'),
                        p_change_value=indicator.get('change_value'),
                        p_change_percent=indicator.get('change_percent'),
                        p_year_over_year_change=indicator.get('year_over_year_change'),
                        p_period_type=indicator.get('period_type'),
                        p_frequency=indicator.get('frequency'),
                        p_unit=indicator.get('unit'),
                        p_currency=indicator.get('currency', 'USD'),
                        p_seasonal_adjustment=indicator.get('seasonal_adjustment', True),
                        p_preliminary=indicator.get('preliminary', False),
                        p_importance_level=indicator.get('importance_level'),
                        p_market_impact=indicator.get('market_impact'),
                        p_consensus_estimate=indicator.get('consensus_estimate'),
                        p_surprise=indicator.get('surprise'),
                        p_release_date=indicator.get('release_date'),
                        p_next_release_date=indicator.get('next_release_date'),
                        p_source_agency=indicator.get('source_agency'),
                        p_status=indicator.get('status', 'final'),
                        p_last_revised=indicator.get('last_revised'),
                        p_revision_count=indicator.get('revision_count', 0)
                    )
                    success_count += 1
                except Exception as e:
                    logger.error(f"Failed to store economic indicator: {e}")
            
            logger.info(f"Stored {success_count}/{len(indicators_data)} economic indicators")
            return success_count == len(indicators_data)
        except Exception as e:
            logger.error(f"Error storing economic indicators: {e}")
            return False
