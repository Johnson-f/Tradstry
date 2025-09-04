"""
Economic data fetching jobs.
Handles economic events and indicators.
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from scheduler.jobs.base_job import BaseMarketDataJob
from scheduler.data_fetch_tracker import DataType, DataFetchTracker
from market_data.brain import MarketDataBrain
from scheduler.enhanced_provider_manager import EnhancedProviderManager, FetchStrategy


logger = logging.getLogger(__name__)


class EconomicEventsJob(BaseMarketDataJob):
    """Job for fetching and storing economic events."""
    
    def __init__(
        self, 
        database_service, 
        market_data_orchestrator: MarketDataBrain,
        data_tracker: DataFetchTracker = None,
        provider_manager: EnhancedProviderManager = None
    ):
        """Initialize with database service and market data orchestrator."""
        super().__init__(database_service, data_tracker, provider_manager)
        self.orchestrator = market_data_orchestrator
    
    def _get_data_type(self) -> DataType:
        """Get the data type for this job."""
        return DataType.ECONOMIC_EVENTS
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch economic events data with provider fallback."""
        try:
            logger.info("Fetching economic events")
            
            # Use enhanced tracking with fallback chain if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fallback chain strategy")
                # For events data, we use a special approach since it's date-based, not symbol-based
                end_date = datetime.now().date() + timedelta(days=30)
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=["EVENTS"],  # Special symbol for events data
                    fetch_method='get_economic_events',
                    strategy=FetchStrategy.FALLBACK_CHAIN,
                    start_date=datetime.now().date(),
                    end_date=end_date
                )
            
            # Fallback to original implementation with enhanced provider fallback
            logger.info("Using basic fetch with provider fallback")
            
            # Get events for next 30 days
            end_date = datetime.now().date() + timedelta(days=30)
            events_data = await self._fetch_events_with_fallback(
                start_date=datetime.now().date(),
                end_date=end_date
            )
            
            return {"events": events_data if events_data is not None else []}
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
            valid_data_count = 0
            
            for event in events_data:
                # Handle both FetchResult objects and direct data
                if hasattr(event, 'success') and hasattr(event, 'data'):
                    # This is a FetchResult object
                    if not event.success or not event.data:
                        logger.warning(f"No valid event data in result")
                        continue
                    valid_data_count += 1
                    event_data = event.data
                    provider = event.provider
                else:
                    # This is direct event data
                    valid_data_count += 1
                    event_data = event
                    provider = getattr(event, 'provider', 'unknown')
                    
                try:
                    # Helper function to safely convert values
                    def safe_convert(value, convert_func, default=None):
                        if value is None or value == '' or value == 0:
                            return default
                        try:
                            return convert_func(value)
                        except (ValueError, TypeError):
                            return default
                    
                    # Helper function to convert importance string to integer
                    def convert_importance(importance_value):
                        if importance_value is None:
                            return None
                        if isinstance(importance_value, int):
                            return importance_value
                        if isinstance(importance_value, str):
                            importance_map = {
                                'low': 1, 'medium': 2, 'high': 3,
                                'Low': 1, 'Medium': 2, 'High': 3,
                                'LOW': 1, 'MEDIUM': 2, 'HIGH': 3
                            }
                            return importance_map.get(importance_value, None)
                        return None
                    
                    # Generate unique event ID if not present
                    event_name = getattr(event_data, 'event_name', None) or getattr(event_data, 'name', None)
                    # Use 'timestamp' field from EconomicEvent model, not 'event_timestamp'
                    event_timestamp = getattr(event_data, 'timestamp', None) or getattr(event_data, 'event_timestamp', None) or getattr(event_data, 'datetime', None)
                    event_id = getattr(event_data, 'event_id', None) or f"{event_name}_{event_timestamp}"
                    
                    # Call database function matching exact signature from 06_economic_events_upsert.sql
                    result = await self.db_service.execute_function(
                        "upsert_economic_events",
                        # Required parameters (lines 5-9 in SQL function)
                        p_event_id=event_id,
                        p_country=getattr(event_data, 'country', 'US'),
                        p_event_name=event_name,
                        p_data_provider=provider,
                        p_event_timestamp=event_timestamp,
                        # Optional parameters with defaults (lines 10-25 in SQL function)
                        p_event_period=getattr(event_data, 'event_period', None),
                        p_actual=safe_convert(getattr(event_data, 'actual', None), float),
                        p_previous=safe_convert(getattr(event_data, 'previous', None), float),
                        p_forecast=safe_convert(getattr(event_data, 'forecast', None), float),
                        p_unit=getattr(event_data, 'unit', None),
                        p_importance=convert_importance(getattr(event_data, 'importance', None)),
                        p_last_update=getattr(event_data, 'last_update', None),
                        p_description=getattr(event_data, 'description', None),
                        p_url=getattr(event_data, 'url', None),
                        p_category=getattr(event_data, 'category', None),
                        p_frequency=getattr(event_data, 'frequency', None),
                        p_source=getattr(event_data, 'source', None),
                        p_currency=getattr(event_data, 'currency', 'USD'),
                        p_market_impact=getattr(event_data, 'market_impact', None),
                        p_status=getattr(event_data, 'status', 'scheduled'),
                        p_revised=getattr(event_data, 'revised', False)
                    )
                    
                    if result is not None:
                        success_count += 1
                        logger.info(f"✅ Successfully stored economic event: {event_name} (ID: {result})")
                        logger.info(f"   Provider: {provider}")
                        logger.info(f"   Date: {event_timestamp}")
                    else:
                        logger.error(f"❌ Failed to store economic event: {event_name} - function returned None")
                    
                except Exception as e:
                    logger.error(f"Failed to store economic event: {e}")
                    logger.error(f"Event data: {getattr(event_data, 'event_name', 'No name') if 'event_data' in locals() else 'No data'}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{valid_data_count} economic events stored successfully")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == valid_data_count
        except Exception as e:
            logger.error(f"Error storing comprehensive economic events data: {e}")
            return False
    
    async def _fetch_events_with_fallback(self, start_date, end_date) -> Optional[Any]:
        """Fetch economic events data from multiple providers for comprehensive coverage."""
        try:
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for economic events data aggregation")
                return None
            
            logger.info(f"Fetching economic events from {len(available_providers)} providers")
            
            all_events = []
            provider_contributions = {}
            
            # Query ALL available providers to get comprehensive events data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for economic events")
                        
                        # Handle different provider method signatures
                        try:
                            # Try with date parameters first (FMP, Fiscal, etc.)
                            events_data = await provider.get_economic_events(
                                from_date=start_date, 
                                to_date=end_date
                            )
                        except TypeError:
                            try:
                                # Try with no parameters (Finnhub, TwelveData, etc.)
                                events_data = await provider.get_economic_events()
                            except Exception as fallback_e:
                                logger.warning(f"Provider {provider_name} failed with both signatures: {fallback_e}")
                                continue
                        
                        if events_data and len(events_data) > 0:
                            provider_contributions[provider_name] = len(events_data)
                            
                            # Add provider info to each event
                            for event in events_data:
                                if hasattr(event, 'provider'):
                                    event.provider = provider_name
                                else:
                                    setattr(event, 'provider', provider_name)
                            
                            all_events.extend(events_data)
                            logger.info(f"{provider_name} contributed {len(events_data)} economic events")
                        else:
                            logger.debug(f"No economic events from {provider_name}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for economic events: {e}")
                    continue
            
            if not all_events:
                logger.warning("No providers returned valid economic events data")
                return []
            
            # Remove duplicates based on event name and date
            unique_events = {}
            for event in all_events:
                event_name = getattr(event, 'event_name', None) or getattr(event, 'name', None)
                event_date = getattr(event, 'event_timestamp', None) or getattr(event, 'datetime', None)
                
                if event_name and event_date:
                    key = f"{event_name}_{event_date}"
                    if key not in unique_events:
                        unique_events[key] = event
            
            final_events = list(unique_events.values())
            
            logger.info(f"Economic events aggregation: {len(final_events)} unique events from {len(provider_contributions)} providers")
            logger.info(f"Provider contributions: {provider_contributions}")
            
            return final_events
            
        except Exception as e:
            logger.error(f"Error in economic events data aggregation: {e}")
            return None


class EconomicIndicatorsJob(BaseMarketDataJob):
    """Job for fetching and storing economic indicators."""
    
    def __init__(
        self, 
        database_service, 
        market_data_orchestrator: MarketDataBrain,
        data_tracker: DataFetchTracker = None,
        provider_manager: EnhancedProviderManager = None
    ):
        """Initialize with database service and market data orchestrator."""
        super().__init__(database_service, data_tracker, provider_manager)
        self.orchestrator = market_data_orchestrator
    
    def _get_data_type(self) -> DataType:
        """Get the data type for this job."""
        return DataType.ECONOMIC_INDICATORS
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch economic indicators data with provider fallback."""
        try:
            logger.info("Fetching economic indicators")
            
            # Use enhanced tracking with fallback chain if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fallback chain strategy")
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=["INDICATORS"],  # Special symbol for indicators data
                    fetch_method='get_economic_indicators',
                    strategy=FetchStrategy.FALLBACK_CHAIN
                )
            
            # Fallback to original implementation with enhanced provider fallback
            logger.info("Using basic fetch with provider fallback")
            indicators_data = await self._fetch_indicators_with_fallback()
            
            return {"indicators": indicators_data if indicators_data is not None else []}
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
            valid_data_count = 0
            
            for indicator in indicators_data:
                # Handle both FetchResult objects and direct data
                if hasattr(indicator, 'success') and hasattr(indicator, 'data'):
                    # This is a FetchResult object
                    if not indicator.success or not indicator.data:
                        logger.warning(f"No valid indicator data in result")
                        continue
                    valid_data_count += 1
                    indicator_data = indicator.data
                    provider = indicator.provider
                else:
                    # This is direct indicator data
                    valid_data_count += 1
                    indicator_data = indicator
                    provider = getattr(indicator, 'provider', 'unknown')
                    
                try:
                    # Helper function to safely convert values
                    def safe_convert(value, convert_func, default=None):
                        if value is None or value == '' or value == 0:
                            return default
                        try:
                            return convert_func(value)
                        except (ValueError, TypeError):
                            return default
                    
                    # Helper function to convert importance string to integer
                    def convert_importance(importance_value):
                        if importance_value is None:
                            return None
                        if isinstance(importance_value, int):
                            return importance_value
                        if isinstance(importance_value, str):
                            importance_map = {
                                'low': 1, 'medium': 2, 'high': 3,
                                'Low': 1, 'Medium': 2, 'High': 3,
                                'LOW': 1, 'MEDIUM': 2, 'HIGH': 3
                            }
                            return importance_map.get(importance_value, None)
                        return None
                    
                    # Extract indicator details
                    indicator_code = getattr(indicator_data, 'indicator_code', None) or getattr(indicator_data, 'code', None)
                    indicator_name = getattr(indicator_data, 'indicator_name', None) or getattr(indicator_data, 'name', None)
                    period_date = getattr(indicator_data, 'period_date', None) or getattr(indicator_data, 'date', None)
                    
                    result = await self.db_service.execute_function(
                        "upsert_economic_indicators",
                        p_indicator_code=indicator_code,
                        p_indicator_name=indicator_name,
                        p_country=getattr(indicator_data, 'country', None),
                        p_period_date=period_date,
                        p_data_provider=provider,
                        
                        # Indicator parameters matching SQL function signature
                        p_value=safe_convert(getattr(indicator_data, 'value', None), float),
                        p_previous_value=safe_convert(getattr(indicator_data, 'previous_value', None), float),
                        p_change_value=safe_convert(getattr(indicator_data, 'change_value', None), float),
                        p_change_percent=safe_convert(getattr(indicator_data, 'change_percent', None), float),
                        p_year_over_year_change=safe_convert(getattr(indicator_data, 'year_over_year_change', None), float),
                        p_period_type=getattr(indicator_data, 'period_type', None),
                        p_frequency=getattr(indicator_data, 'frequency', None),
                        p_unit=getattr(indicator_data, 'unit', None),
                        p_currency=getattr(indicator_data, 'currency', 'USD'),
                        p_seasonal_adjustment=getattr(indicator_data, 'seasonal_adjustment', True),
                        p_preliminary=getattr(indicator_data, 'preliminary', False),
                        p_importance_level=convert_importance(getattr(indicator_data, 'importance_level', None)),
                        p_market_impact=getattr(indicator_data, 'market_impact', None),
                        p_consensus_estimate=safe_convert(getattr(indicator_data, 'consensus_estimate', None), float),
                        p_surprise=safe_convert(getattr(indicator_data, 'surprise', None), float),
                        p_release_date=getattr(indicator_data, 'release_date', None),
                        p_next_release_date=getattr(indicator_data, 'next_release_date', None),
                        p_source_agency=getattr(indicator_data, 'source_agency', None),
                        p_status=getattr(indicator_data, 'status', 'final'),
                        p_last_revised=getattr(indicator_data, 'last_revised', None),
                        p_revision_count=safe_convert(getattr(indicator_data, 'revision_count', None), int, 0)
                    )
                    
                    if result is not None:
                        success_count += 1
                        logger.info(f"✅ Successfully stored economic indicator: {indicator_name} (ID: {result})")
                        logger.info(f"   Provider: {provider}")
                        logger.info(f"   Code: {indicator_code}, Date: {period_date}")
                    else:
                        logger.error(f"❌ Failed to store economic indicator: {indicator_name} - function returned None")
                    
                except Exception as e:
                    logger.error(f"Failed to store economic indicator: {e}")
                    logger.error(f"Indicator data: {getattr(indicator_data, 'indicator_name', 'No name') if 'indicator_data' in locals() else 'No data'}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{valid_data_count} economic indicators stored successfully")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == valid_data_count
        except Exception as e:
            logger.error(f"Error storing economic indicators: {e}")
            return False
    
    async def _fetch_indicators_with_fallback(self) -> Optional[Any]:
        """Fetch economic indicators data from multiple providers for comprehensive coverage."""
        try:
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for economic indicators data aggregation")
                return None
            
            logger.info(f"Fetching economic indicators from {len(available_providers)} providers")
            
            all_indicators = []
            provider_contributions = {}
            
            # Query ALL available providers to get comprehensive indicators data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for economic indicators")
                        
                        # Check if provider has the method
                        if not hasattr(provider, 'get_economic_indicators'):
                            logger.debug(f"Provider {provider_name} does not have get_economic_indicators method")
                            continue
                            
                        indicators_data = await provider.get_economic_indicators()
                        
                        if indicators_data and len(indicators_data) > 0:
                            provider_contributions[provider_name] = len(indicators_data)
                            
                            # Add provider info to each indicator
                            for indicator in indicators_data:
                                if hasattr(indicator, 'provider'):
                                    indicator.provider = provider_name
                                else:
                                    setattr(indicator, 'provider', provider_name)
                            
                            all_indicators.extend(indicators_data)
                            logger.info(f"{provider_name} contributed {len(indicators_data)} economic indicators")
                        else:
                            logger.debug(f"No economic indicators from {provider_name}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for economic indicators: {e}")
                    continue
            
            if not all_indicators:
                logger.warning("No providers returned valid economic indicators data")
                return []
            
            # Remove duplicates based on indicator code and period date
            unique_indicators = {}
            for indicator in all_indicators:
                indicator_code = getattr(indicator, 'indicator_code', None) or getattr(indicator, 'code', None)
                period_date = getattr(indicator, 'period_date', None) or getattr(indicator, 'date', None)
                
                if indicator_code and period_date:
                    key = f"{indicator_code}_{period_date}"
                    if key not in unique_indicators:
                        unique_indicators[key] = indicator
                    else:
                        # Keep the one with more complete data (prefer non-preliminary)
                        existing_preliminary = getattr(unique_indicators[key], 'preliminary', True)
                        new_preliminary = getattr(indicator, 'preliminary', True)
                        if existing_preliminary and not new_preliminary:
                            unique_indicators[key] = indicator
            
            final_indicators = list(unique_indicators.values())
            
            logger.info(f"Economic indicators aggregation: {len(final_indicators)} unique indicators from {len(provider_contributions)} providers")
            logger.info(f"Provider contributions: {provider_contributions}")
            
            return final_indicators
            
        except Exception as e:
            logger.error(f"Error in economic indicators data aggregation: {e}")
            return None
