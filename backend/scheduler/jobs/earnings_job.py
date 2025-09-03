"""
Earnings data fetching jobs.
Handles earnings data, calendar, and transcripts.
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


class EarningsDataJob(BaseMarketDataJob):
    """Job for fetching and storing earnings data."""
    
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
        return DataType.EARNINGS
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch earnings data for given symbols with provider fallback."""
        try:
            logger.info(f"Fetching earnings data for {len(symbols)} symbols")
            
            # Use enhanced tracking with fallback chain if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fallback chain strategy")
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=symbols,
                    fetch_method='get_earnings',
                    strategy=FetchStrategy.FALLBACK_CHAIN
                )
            
            # Fallback to original implementation with enhanced field-level fallback
            logger.info("Using basic fetch with field-level provider fallback")
            earnings_data = {}
            
            for symbol in symbols:
                try:
                    # Get earnings data with field-level fallback
                    merged_data = await self._fetch_with_field_fallback(symbol)
                    if merged_data:
                        earnings_data[symbol] = merged_data
                        logger.info(f"Successfully fetched {symbol} with field-level fallback")
                    else:
                        logger.warning(f"No valid data returned for {symbol}")
                    
                    await asyncio.sleep(0.1)  # Reduced for faster tests
                    
                except Exception as e:
                    logger.error(f"Failed to fetch earnings data for {symbol}: {e}")
                    continue
            
            return earnings_data
            
        except Exception as e:
            logger.error(f"Error fetching earnings data: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store earnings data using database upsert function."""
        if not data:
            return True
        
        try:
            success_count = 0
            valid_data_count = 0
            
            for symbol, fetch_result in data.items():
                try:
                    # Extract earnings data from FetchResult
                    if not fetch_result.success or not fetch_result.data:
                        logger.warning(f"No valid data for {symbol}")
                        continue
                    
                    valid_data_count += 1
                    earnings = fetch_result.data
                    
                    logger.info(f"Storing earnings data for {symbol} from {fetch_result.provider}")
                    
                    # Helper function to safely convert values
                    def safe_convert(value, convert_func, default=None):
                        if value is None or value == '' or value == 0:
                            return default
                        try:
                            return convert_func(value)
                        except (ValueError, TypeError):
                            return default
                    
                    # Normalize earnings data from different providers
                    normalized_earnings = self._normalize_earnings_fields(earnings)
                    
                    # Extract exchange information if available
                    exchange_info = getattr(normalized_earnings, 'exchange', {}) if hasattr(normalized_earnings, 'exchange') else {}
                    
                    await self.db_service.execute_function(
                        "upsert_earnings_data",
                        p_symbol=symbol,
                        p_fiscal_year=getattr(normalized_earnings, 'fiscal_year', None),
                        p_fiscal_quarter=getattr(normalized_earnings, 'fiscal_quarter', None),
                        p_reported_date=getattr(normalized_earnings, 'reported_date', None),
                        p_data_provider=fetch_result.provider,
                        
                        # Exchange parameters for automatic exchange handling
                        p_exchange_code=exchange_info.get('code') or getattr(earnings, 'exchange_code', None),
                        p_exchange_name=exchange_info.get('name') or getattr(earnings, 'exchange_name', None),
                        p_exchange_country=exchange_info.get('country') or getattr(earnings, 'country', None),
                        p_exchange_timezone=exchange_info.get('timezone') or getattr(earnings, 'timezone', None),
                        
                        # Earnings parameters matching SQL function signature
                        p_report_type=getattr(normalized_earnings, 'report_type', 'quarterly'),
                        p_eps=safe_convert(getattr(normalized_earnings, 'eps', None) or getattr(normalized_earnings, 'reported_eps', None), float),
                        p_eps_estimated=safe_convert(getattr(normalized_earnings, 'eps_estimated', None) or getattr(normalized_earnings, 'estimated_eps', None), float),
                        p_eps_surprise=safe_convert(getattr(normalized_earnings, 'eps_surprise', None) or getattr(normalized_earnings, 'surprise', None), float),
                        p_eps_surprise_percent=safe_convert(getattr(normalized_earnings, 'eps_surprise_percent', None) or getattr(normalized_earnings, 'surprise_percentage', None), float),
                        p_revenue=safe_convert(getattr(normalized_earnings, 'revenue', None), int),
                        p_revenue_estimated=safe_convert(getattr(normalized_earnings, 'revenue_estimated', None), int),
                        p_revenue_surprise=safe_convert(getattr(normalized_earnings, 'revenue_surprise', None), int),
                        p_revenue_surprise_percent=safe_convert(getattr(normalized_earnings, 'revenue_surprise_percent', None), float),
                        p_net_income=safe_convert(getattr(normalized_earnings, 'net_income', None), int),
                        p_gross_profit=safe_convert(getattr(normalized_earnings, 'gross_profit', None), int),
                        p_operating_income=safe_convert(getattr(normalized_earnings, 'operating_income', None), int),
                        p_ebitda=safe_convert(getattr(normalized_earnings, 'ebitda', None), int),
                        p_operating_margin=safe_convert(getattr(normalized_earnings, 'operating_margin', None), float),
                        p_net_margin=safe_convert(getattr(normalized_earnings, 'net_margin', None), float),
                        p_year_over_year_eps_growth=safe_convert(getattr(normalized_earnings, 'year_over_year_eps_growth', None), float),
                        p_year_over_year_revenue_growth=safe_convert(getattr(normalized_earnings, 'year_over_year_revenue_growth', None), float),
                        p_guidance=getattr(normalized_earnings, 'guidance', None),
                        p_next_year_eps_guidance=safe_convert(getattr(normalized_earnings, 'next_year_eps_guidance', None), float),
                        p_next_year_revenue_guidance=safe_convert(getattr(normalized_earnings, 'next_year_revenue_guidance', None), int),
                        p_conference_call_date=getattr(normalized_earnings, 'conference_call_date', None),
                        p_transcript_url=getattr(normalized_earnings, 'transcript_url', None),
                        p_audio_url=getattr(normalized_earnings, 'audio_url', None),
                        p_eps_beat_miss_met=getattr(normalized_earnings, 'eps_beat_miss_met', None),
                        p_revenue_beat_miss_met=getattr(normalized_earnings, 'revenue_beat_miss_met', None)
                    )
                    
                    success_count += 1
                    logger.info(f"✅ Successfully stored earnings data for {symbol}")
                    logger.info(f"   Provider: {fetch_result.provider}")
                    
                except Exception as e:
                    logger.error(f"Failed to store earnings for {symbol}: {e}")
                    logger.error(f"Data for {symbol}: {getattr(fetch_result, 'data', 'No data')}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{valid_data_count} earnings records stored successfully")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == valid_data_count
        except Exception as e:
            logger.error(f"Error storing comprehensive earnings data: {e}")
            return False
    
    def _normalize_earnings_fields(self, earnings_data) -> Any:
        """Normalize earnings data from different providers and calculate missing required fields."""
        from datetime import datetime
        import copy
        
        # Handle both dict and object formats
        if isinstance(earnings_data, dict):
            # Create a simple object from dict
            class EarningsObject:
                def __init__(self, data_dict):
                    for key, value in data_dict.items():
                        setattr(self, key, value)
            
            normalized = EarningsObject(earnings_data)
        else:
            # Copy the object to avoid modifying original
            normalized = copy.copy(earnings_data)
        
        # Calculate missing fiscal_year and fiscal_quarter from date
        if not hasattr(normalized, 'fiscal_year') or not normalized.fiscal_year:
            date_field = getattr(normalized, 'date', None) or getattr(normalized, 'reported_date', None)
            if date_field:
                try:
                    if isinstance(date_field, str):
                        date_obj = datetime.strptime(date_field, '%Y-%m-%d')
                        normalized.fiscal_year = date_obj.year
                        # Calculate quarter from month
                        quarter = (date_obj.month - 1) // 3 + 1
                        normalized.fiscal_quarter = quarter
                        normalized.reported_date = date_field
                except Exception as e:
                    logger.debug(f"Could not parse date {date_field}: {e}")
        
        # Set default values for missing required fields
        if not hasattr(normalized, 'fiscal_year') or not normalized.fiscal_year:
            # Use current year as fallback
            normalized.fiscal_year = datetime.now().year
        
        if not hasattr(normalized, 'fiscal_quarter') or not normalized.fiscal_quarter:
            # Use current quarter as fallback
            current_quarter = (datetime.now().month - 1) // 3 + 1
            normalized.fiscal_quarter = current_quarter
        
        if not hasattr(normalized, 'reported_date') or not normalized.reported_date:
            # Use current date as fallback
            normalized.reported_date = datetime.now().strftime('%Y-%m-%d')
        
        # Map provider-specific field names to standard names
        field_mappings = {
            # TwelveData mappings
            'eps_estimate': ['eps_estimated', 'estimated_eps'],
            'eps_actual': ['eps', 'reported_eps'],
            'difference': ['eps_surprise'],
            'surprise_prc': ['eps_surprise_percent', 'surprise_percentage'],
            
            # Alpha Vantage mappings
            'reportedEPS': ['eps', 'reported_eps'],
            'estimatedEPS': ['eps_estimated', 'estimated_eps'],
            'surprise': ['eps_surprise'],
            'surprisePercentage': ['eps_surprise_percent'],
        }
        
        # Apply field mappings
        for source_field, target_fields in field_mappings.items():
            if hasattr(normalized, source_field):
                source_value = getattr(normalized, source_field)
                if source_value is not None:
                    for target_field in target_fields:
                        if not hasattr(normalized, target_field) or getattr(normalized, target_field) is None:
                            setattr(normalized, target_field, source_value)
        
        return normalized
    
    def _get_data_type(self) -> DataType:
        """Get the data type for this job (used for tracking)."""
        return DataType.EARNINGS
    
    async def _fetch_with_field_fallback(self, symbol: str) -> Optional[Any]:
        """Fetch earnings data by aggregating data from ALL providers for comprehensive coverage."""
        try:
            # Quick validation for obviously invalid symbols
            if not symbol or len(symbol) > 10 or not symbol.replace('.', '').isalnum():
                logger.warning(f"Invalid symbol format: {symbol}")
                return None
                
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for comprehensive data aggregation")
                return None
            
            logger.info(f"Starting comprehensive earnings data aggregation for {symbol} across {len(available_providers)} providers")
            
            # Comprehensive field mapping for earnings data
            comprehensive_fields = {
                # Basic earnings info
                'fiscal_year': None, 'fiscal_quarter': None, 'reported_date': None, 'report_type': None,
                'eps': None, 'eps_estimated': None, 'eps_surprise': None, 'eps_surprise_percent': None,
                'revenue': None, 'revenue_estimated': None, 'revenue_surprise': None, 'revenue_surprise_percent': None,
                
                # Financial metrics
                'net_income': None, 'gross_profit': None, 'operating_income': None, 'ebitda': None,
                'operating_margin': None, 'net_margin': None, 'year_over_year_eps_growth': None,
                'year_over_year_revenue_growth': None,
                
                # Additional info
                'guidance': None, 'next_year_eps_guidance': None, 'next_year_revenue_guidance': None,
                'conference_call_date': None, 'transcript_url': None, 'audio_url': None,
                'eps_beat_miss_met': None, 'revenue_beat_miss_met': None
            }
            
            # Collect data from ALL providers
            provider_contributions = {}
            base_earnings_data = None
            base_provider = None
            
            # Query ALL available providers to get comprehensive data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for {symbol}")
                        earnings_data = await provider.get_earnings(symbol)
                        
                        if earnings_data is not None:
                            provider_contributions[provider_name] = earnings_data
                            
                            # Use first successful result as base structure
                            if base_earnings_data is None:
                                base_earnings_data = earnings_data
                                base_provider = provider_name
                                logger.info(f"Using {provider_name} as base structure for {symbol}")
                            
                            # Collect all available fields from this provider
                            fields_found = []
                            for field_name in comprehensive_fields:
                                field_value = getattr(earnings_data, field_name, None)
                                if field_value is not None and field_value != '' and field_value != 0:
                                    # Only update if we don't have this field yet (first provider wins for each field)
                                    if comprehensive_fields[field_name] is None:
                                        comprehensive_fields[field_name] = {
                                            'value': field_value,
                                            'provider': provider_name
                                        }
                                        fields_found.append(field_name)
                            
                            if fields_found:
                                logger.info(f"{provider_name} contributed {len(fields_found)} fields: {fields_found[:5]}{'...' if len(fields_found) > 5 else ''}")
                        else:
                            logger.debug(f"No data from {provider_name} for {symbol}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for {symbol}: {e}")
                    continue
            
            if base_earnings_data is None:
                logger.warning(f"No providers returned valid data for {symbol}")
                return None
            
            # Create comprehensive merged result
            enhanced_data = await self._create_comprehensive_earnings_data(
                base_earnings_data, comprehensive_fields, symbol, provider_contributions
            )
            
            # Create result with all contributing providers listed
            contributing_providers = list(provider_contributions.keys())
            provider_string = f"{base_provider}+{'+'.join([p for p in contributing_providers if p != base_provider])}"
            
            from market_data.brain import FetchResult
            comprehensive_result = FetchResult(
                data=enhanced_data,
                provider=provider_string,
                success=True
            )
            
            # Log comprehensive aggregation summary
            populated_fields = [field for field, data in comprehensive_fields.items() if data is not None]
            provider_summary = {}
            for field, data in comprehensive_fields.items():
                if data is not None:
                    provider = data['provider']
                    if provider not in provider_summary:
                        provider_summary[provider] = 0
                    provider_summary[provider] += 1
            
            logger.info(f"Comprehensive aggregation for {symbol}: {len(populated_fields)} fields from {len(contributing_providers)} providers")
            logger.info(f"Provider contributions: {provider_summary}")
            
            return comprehensive_result
            
        except Exception as e:
            logger.error(f"Error in comprehensive earnings data aggregation for {symbol}: {e}")
            return None
    
    async def _create_comprehensive_earnings_data(self, base_data, comprehensive_fields: Dict, symbol: str, provider_contributions: Dict):
        """Create a comprehensive EarningsData object by merging data from all providers."""
        try:
            # Build comprehensive data dictionary
            merged_data = {
                'symbol': symbol,
                'provider': f"comprehensive_aggregation"
            }
            
            # Merge all fields from comprehensive_fields
            for field_name, field_data in comprehensive_fields.items():
                if field_data is not None:
                    merged_data[field_name] = field_data['value']
                    logger.debug(f"Set {field_name} for {symbol} from {field_data['provider']}: {field_data['value']}")
                else:
                    # Try to get from base_data if not found in any provider
                    base_value = getattr(base_data, field_name, None)
                    if base_value is not None:
                        merged_data[field_name] = base_value
            
            # Create new comprehensive earnings data object (assuming similar structure to CompanyInfo)
            enhanced_data = base_data
            for field_name, value in merged_data.items():
                if hasattr(enhanced_data, field_name):
                    setattr(enhanced_data, field_name, value)
            
            logger.info(f"Created comprehensive earnings data for {symbol} with {len([k for k, v in merged_data.items() if v is not None])} populated fields")
            
            return enhanced_data
            
        except Exception as e:
            logger.error(f"Error creating comprehensive earnings data for {symbol}: {e}")
            return base_data


class EarningsCalendarJob(BaseMarketDataJob):
    """Job for fetching and storing earnings calendar."""
    
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
        return DataType.EARNINGS_CALENDAR
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch earnings calendar data with provider fallback."""
        try:
            logger.info("Fetching earnings calendar")
            
            # Use enhanced tracking with fallback chain if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fallback chain strategy")
                # For calendar data, we use a special approach since it's date-based, not symbol-based
                end_date = datetime.now().date() + timedelta(days=30)
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=["CALENDAR"],  # Special symbol for calendar data
                    fetch_method='get_earnings_calendar',
                    strategy=FetchStrategy.FALLBACK_CHAIN,
                    start_date=datetime.now().date(),
                    end_date=end_date
                )
            
            # Fallback to original implementation with enhanced provider fallback
            logger.info("Using basic fetch with provider fallback")
            
            # Get upcoming earnings for next 30 days
            end_date = datetime.now().date() + timedelta(days=30)
            calendar_data = await self._fetch_calendar_with_fallback(
                start_date=datetime.now().date(),
                end_date=end_date
            )
            
            return {"calendar": calendar_data}
        except Exception as e:
            logger.error(f"Error fetching earnings calendar: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store earnings calendar using database upsert function."""
        calendar_data = data.get("calendar", [])
        if not calendar_data:
            return True
        
        try:
            success_count = 0
            valid_data_count = 0
            
            for event in calendar_data:
                # Handle both FetchResult objects and direct data
                if hasattr(event, 'success') and hasattr(event, 'data'):
                    # This is a FetchResult object
                    if not event.success or not event.data:
                        logger.warning(f"No valid calendar data in result")
                        continue
                    valid_data_count += 1
                    event_data = event.data
                    provider = event.provider
                else:
                    # This is direct event data
                    valid_data_count += 1
                    event_data = event
                    provider = event.get('provider', 'unknown')
                try:
                    # Helper function to safely convert values
                    def safe_convert(value, convert_func, default=None):
                        if value is None or value == '' or value == 0:
                            return default
                        try:
                            return convert_func(value)
                        except (ValueError, TypeError):
                            return default
                    
                    # Extract exchange information if available
                    exchange_info = getattr(event_data, 'exchange', {}) if hasattr(event_data, 'exchange') else {}
                    
                    await self.db_service.execute_function(
                        "upsert_earnings_calendar",
                        p_symbol=getattr(event_data, 'symbol', None),
                        p_data_provider=provider,
                        p_earnings_date=getattr(event_data, 'earnings_date', None) or getattr(event_data, 'report_date', None),
                        p_fiscal_year=getattr(event_data, 'fiscal_year', None),
                        p_fiscal_quarter=getattr(event_data, 'fiscal_quarter', None),
                        
                        # Exchange parameters for automatic exchange handling
                        p_exchange_code=exchange_info.get('code') or getattr(event_data, 'exchange_code', None),
                        p_exchange_name=exchange_info.get('name') or getattr(event_data, 'exchange_name', None),
                        p_exchange_country=exchange_info.get('country') or getattr(event_data, 'country', None),
                        p_exchange_timezone=exchange_info.get('timezone') or getattr(event_data, 'timezone', None),
                        
                        # Calendar parameters matching SQL function signature
                        p_time_of_day=getattr(event_data, 'time_of_day', None),
                        p_eps=safe_convert(getattr(event_data, 'eps', None), float),
                        p_eps_estimated=safe_convert(getattr(event_data, 'eps_estimated', None) or getattr(event_data, 'estimate', None), float),
                        p_eps_surprise=safe_convert(getattr(event_data, 'eps_surprise', None), float),
                        p_eps_surprise_percent=safe_convert(getattr(event_data, 'eps_surprise_percent', None), float),
                        p_revenue=safe_convert(getattr(event_data, 'revenue', None), int),
                        p_revenue_estimated=safe_convert(getattr(event_data, 'revenue_estimated', None), int),
                        p_revenue_surprise=safe_convert(getattr(event_data, 'revenue_surprise', None), int),
                        p_revenue_surprise_percent=safe_convert(getattr(event_data, 'revenue_surprise_percent', None), float),
                        p_fiscal_date_ending=getattr(event_data, 'fiscal_date_ending', None),
                        p_market_cap_at_time=safe_convert(getattr(event_data, 'market_cap_at_time', None), int),
                        p_sector=getattr(event_data, 'sector', None),
                        p_industry=getattr(event_data, 'industry', None),
                        p_conference_call_date=getattr(event_data, 'conference_call_date', None),
                        p_conference_call_time=getattr(event_data, 'conference_call_time', None),
                        p_webcast_url=getattr(event_data, 'webcast_url', None),
                        p_transcript_available=getattr(event_data, 'transcript_available', False),
                        p_status=getattr(event_data, 'status', 'scheduled'),
                        p_last_updated=getattr(event_data, 'last_updated', None),
                        p_update_source=getattr(event_data, 'update_source', None)
                    )
                    success_count += 1
                    logger.info(f"✅ Successfully stored calendar event for {getattr(event_data, 'symbol', 'unknown')}")
                    logger.info(f"   Provider: {provider}")
                    
                except Exception as e:
                    logger.error(f"Failed to store earnings calendar event: {e}")
                    logger.error(f"Event data: {getattr(event_data, 'symbol', 'No symbol') if 'event_data' in locals() else 'No data'}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{valid_data_count} calendar events stored successfully")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == valid_data_count
        except Exception as e:
            logger.error(f"Error storing earnings calendar: {e}")
            return False
    
    async def _fetch_calendar_with_fallback(self, start_date, end_date) -> Optional[Any]:
        """Fetch earnings calendar data from multiple providers for comprehensive coverage."""
        try:
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for calendar data aggregation")
                return None
            
            logger.info(f"Fetching earnings calendar from {len(available_providers)} providers")
            
            all_calendar_events = []
            provider_contributions = {}
            
            # Query ALL available providers to get comprehensive calendar data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for calendar data")
                        calendar_data = await provider.get_earnings_calendar(start_date, end_date)
                        
                        if calendar_data and len(calendar_data) > 0:
                            provider_contributions[provider_name] = len(calendar_data)
                            
                            # Add provider info to each event
                            for event in calendar_data:
                                if hasattr(event, 'provider'):
                                    event.provider = provider_name
                                else:
                                    setattr(event, 'provider', provider_name)
                            
                            all_calendar_events.extend(calendar_data)
                            logger.info(f"{provider_name} contributed {len(calendar_data)} calendar events")
                        else:
                            logger.debug(f"No calendar data from {provider_name}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for calendar data: {e}")
                    continue
            
            if not all_calendar_events:
                logger.warning("No providers returned valid calendar data")
                return None
            
            # Remove duplicates based on symbol and date
            unique_events = {}
            for event in all_calendar_events:
                symbol = getattr(event, 'symbol', None)
                earnings_date = getattr(event, 'earnings_date', None) or getattr(event, 'report_date', None)
                
                if symbol and earnings_date:
                    key = f"{symbol}_{earnings_date}"
                    if key not in unique_events:
                        unique_events[key] = event
            
            final_events = list(unique_events.values())
            
            logger.info(f"Calendar aggregation: {len(final_events)} unique events from {len(provider_contributions)} providers")
            logger.info(f"Provider contributions: {provider_contributions}")
            
            return final_events
            
        except Exception as e:
            logger.error(f"Error in calendar data aggregation: {e}")
            return None


class EarningsTranscriptsJob(BaseMarketDataJob):
    """Job for fetching and storing earnings call transcripts."""
    
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
        return DataType.EARNINGS_TRANSCRIPTS
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch earnings transcripts for given symbols with provider fallback."""
        try:
            logger.info(f"Fetching earnings transcripts for {len(symbols)} symbols")
            
            # Use enhanced tracking with fallback chain if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fallback chain strategy")
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=symbols,
                    fetch_method='get_earnings_transcripts',
                    strategy=FetchStrategy.FALLBACK_CHAIN
                )
            
            # Fallback to original implementation with enhanced field-level fallback
            logger.info("Using basic fetch with field-level provider fallback")
            transcripts_data = {}
            
            for symbol in symbols:
                try:
                    # Get transcripts with field-level fallback
                    merged_transcripts = await self._fetch_transcripts_with_fallback(symbol)
                    if merged_transcripts:
                        transcripts_data[symbol] = merged_transcripts
                        logger.info(f"Successfully fetched transcripts for {symbol}")
                    else:
                        logger.warning(f"No valid transcript data returned for {symbol}")
                    
                    await asyncio.sleep(0.2)  # Longer delay for transcript data
                    
                except Exception as e:
                    logger.error(f"Failed to fetch transcripts for {symbol}: {e}")
                    continue
            
            return transcripts_data
        except Exception as e:
            logger.error(f"Error fetching transcripts: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store earnings transcripts using database upsert function."""
        if not data:
            return True
        
        try:
            success_count = 0
            total_records = 0
            
            for symbol, fetch_result in data.items():
                try:
                    # Extract transcripts data from FetchResult
                    if not fetch_result.success or not fetch_result.data:
                        logger.warning(f"No valid transcript data for {symbol}")
                        continue
                    
                    transcripts = fetch_result.data
                    if not isinstance(transcripts, list):
                        transcripts = [transcripts]  # Handle single transcript
                    
                    for transcript in transcripts:
                        try:
                            # Helper function to safely convert values
                            def safe_convert(value, convert_func, default=None):
                                if value is None or value == '' or value == 0:
                                    return default
                                try:
                                    return convert_func(value)
                                except (ValueError, TypeError):
                                    return default
                            
                            # Extract exchange information if available
                            exchange_info = getattr(transcript, 'exchange', {}) if hasattr(transcript, 'exchange') else {}
                            
                            # Store main transcript
                            transcript_id = await self.db_service.execute_function(
                                "upsert_earnings_transcripts",
                                p_symbol=symbol,
                                p_earnings_date=getattr(transcript, 'earnings_date', None) or getattr(transcript, 'report_date', None),
                                p_fiscal_quarter=getattr(transcript, 'fiscal_quarter', None),
                                p_fiscal_year=getattr(transcript, 'fiscal_year', None),
                                p_full_transcript=getattr(transcript, 'full_transcript', None) or getattr(transcript, 'transcript', None),
                                p_data_provider=fetch_result.provider,
                                
                                # Exchange parameters for automatic exchange handling
                                p_exchange_code=exchange_info.get('code') or getattr(transcript, 'exchange_code', None),
                                p_exchange_name=exchange_info.get('name') or getattr(transcript, 'exchange_name', None),
                                p_exchange_country=exchange_info.get('country') or getattr(transcript, 'country', None),
                                p_exchange_timezone=exchange_info.get('timezone') or getattr(transcript, 'timezone', None),
                                
                                # Transcript parameters matching SQL function signature
                                p_transcript_title=getattr(transcript, 'transcript_title', None),
                                p_transcript_length=safe_convert(getattr(transcript, 'transcript_length', None), int),
                                p_transcript_language=getattr(transcript, 'transcript_language', 'en'),
                                p_conference_call_date=getattr(transcript, 'conference_call_date', None),
                                p_conference_call_duration=safe_convert(getattr(transcript, 'conference_call_duration', None), int),
                                p_audio_recording_url=getattr(transcript, 'audio_recording_url', None),
                                p_presentation_url=getattr(transcript, 'presentation_url', None),
                                p_reported_eps=safe_convert(getattr(transcript, 'reported_eps', None), float),
                                p_reported_revenue=safe_convert(getattr(transcript, 'reported_revenue', None), int),
                                p_guidance_eps=safe_convert(getattr(transcript, 'guidance_eps', None), float),
                                p_guidance_revenue=safe_convert(getattr(transcript, 'guidance_revenue', None), int),
                                p_overall_sentiment=getattr(transcript, 'overall_sentiment', None),
                                p_confidence_score=safe_convert(getattr(transcript, 'confidence_score', None), float),
                                p_key_themes=getattr(transcript, 'key_themes', None),
                                p_risk_factors=getattr(transcript, 'risk_factors', None),
                                p_transcript_quality=getattr(transcript, 'transcript_quality', 'complete')
                            )
                            
                            # Store participants if available
                            participants = getattr(transcript, 'participants', [])
                            for participant in participants:
                                try:
                                    await self.db_service.execute_function(
                                        "upsert_transcript_participants",
                                        p_transcript_id=transcript_id,
                                        p_participant_name=getattr(participant, 'name', None),
                                        p_participant_title=getattr(participant, 'title', None),
                                        p_participant_company=getattr(participant, 'company', None),
                                        p_participant_type=getattr(participant, 'type', None),
                                        p_speaking_time=safe_convert(getattr(participant, 'speaking_time', None), int),
                                        p_question_count=safe_convert(getattr(participant, 'question_count', None), int, 0)
                                    )
                                except Exception as e:
                                    logger.error(f"Failed to store participant {getattr(participant, 'name', 'unknown')}: {e}")
                            
                            success_count += 1
                            total_records += 1
                            logger.info(f"✅ Successfully stored transcript for {symbol}")
                            logger.info(f"   Provider: {fetch_result.provider}")
                            
                        except Exception as e:
                            logger.error(f"Failed to store transcript for {symbol}: {e}")
                            logger.error(f"Transcript data: {getattr(transcript, 'transcript_title', 'No title')}")
                            total_records += 1
                        
                except Exception as e:
                    logger.error(f"Failed to process transcripts for {symbol}: {e}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{total_records} transcript records stored successfully")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == total_records
        except Exception as e:
            logger.error(f"Error storing transcripts: {e}")
            return False
    
    async def _fetch_transcripts_with_fallback(self, symbol: str) -> Optional[Any]:
        """Fetch earnings transcripts by aggregating data from ALL providers for comprehensive coverage."""
        try:
            # Quick validation for obviously invalid symbols
            if not symbol or len(symbol) > 10 or not symbol.replace('.', '').isalnum():
                logger.warning(f"Invalid symbol format: {symbol}")
                return None
                
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for transcript data aggregation")
                return None
            
            logger.info(f"Starting comprehensive transcript data aggregation for {symbol} across {len(available_providers)} providers")
            
            all_transcripts = []
            provider_contributions = {}
            
            # Query ALL available providers to get comprehensive transcript data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for {symbol} transcripts")
                        transcript_data = await provider.get_earnings_transcripts(symbol)
                        
                        if transcript_data is not None:
                            # Handle both single transcript and list of transcripts
                            if not isinstance(transcript_data, list):
                                transcript_data = [transcript_data]
                            
                            provider_contributions[provider_name] = len(transcript_data)
                            
                            # Add provider info to each transcript
                            for transcript in transcript_data:
                                if hasattr(transcript, 'provider'):
                                    transcript.provider = provider_name
                                else:
                                    setattr(transcript, 'provider', provider_name)
                            
                            all_transcripts.extend(transcript_data)
                            logger.info(f"{provider_name} contributed {len(transcript_data)} transcripts")
                        else:
                            logger.debug(f"No transcript data from {provider_name} for {symbol}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for {symbol} transcripts: {e}")
                    continue
            
            if not all_transcripts:
                logger.warning(f"No providers returned valid transcript data for {symbol}")
                return None
            
            # Remove duplicates based on earnings date and fiscal quarter
            unique_transcripts = {}
            for transcript in all_transcripts:
                earnings_date = getattr(transcript, 'earnings_date', None) or getattr(transcript, 'report_date', None)
                fiscal_quarter = getattr(transcript, 'fiscal_quarter', None)
                fiscal_year = getattr(transcript, 'fiscal_year', None)
                
                if earnings_date and fiscal_quarter:
                    key = f"{earnings_date}_{fiscal_quarter}_{fiscal_year}"
                    if key not in unique_transcripts:
                        unique_transcripts[key] = transcript
                    else:
                        # Keep the one with more complete data (longer transcript)
                        existing_length = len(getattr(unique_transcripts[key], 'full_transcript', '') or getattr(unique_transcripts[key], 'transcript', ''))
                        new_length = len(getattr(transcript, 'full_transcript', '') or getattr(transcript, 'transcript', ''))
                        if new_length > existing_length:
                            unique_transcripts[key] = transcript
            
            final_transcripts = list(unique_transcripts.values())
            
            # Create result with all contributing providers listed
            contributing_providers = list(provider_contributions.keys())
            provider_string = f"{'+'.join(contributing_providers)}"
            
            from market_data.brain import FetchResult
            comprehensive_result = FetchResult(
                data=final_transcripts,
                provider=provider_string,
                success=True
            )
            
            logger.info(f"Transcript aggregation for {symbol}: {len(final_transcripts)} unique transcripts from {len(contributing_providers)} providers")
            logger.info(f"Provider contributions: {provider_contributions}")
            
            return comprehensive_result
            
        except Exception as e:
            logger.error(f"Error in comprehensive transcript data aggregation for {symbol}: {e}")
            return None
