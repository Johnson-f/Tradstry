"""
Options chain data fetching job.
Fetches options chain data and stores using upsert functions.
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain
from scheduler.data_fetch_tracker import DataType, DataFetchTracker
from scheduler.enhanced_provider_manager import EnhancedProviderManager, FetchStrategy


logger = logging.getLogger(__name__)


class OptionsChainJob(BaseMarketDataJob):
    """Job for fetching and storing options chain data."""
    
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
        return DataType.OPTIONS_CHAIN
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Fetch options chain data for given symbols with provider fallback.
        
        Args:
            symbols: List of stock symbols to fetch options data for
            
        Returns:
            Dictionary containing options chain data for all symbols
        """
        try:
            logger.info(f"Fetching options chain for {len(symbols)} symbols")
            
            # Use enhanced tracking if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fallback chain strategy")
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=symbols,
                    fetch_method='get_options_chain',
                    strategy=FetchStrategy.FALLBACK_CHAIN  # Options benefit from comprehensive data
                )
            
            # Fallback to original implementation with enhanced provider fallback
            logger.info("Using basic fetch with provider fallback")
            options_data = {}
            
            # Process symbols individually for options (more complex data)
            for symbol in symbols:
                try:
                    # Get options with provider fallback for better coverage
                    merged_options = await self._fetch_with_provider_fallback(symbol)
                    if merged_options:
                        options_data[symbol] = merged_options
                        logger.info(f"Successfully fetched options chain for {symbol}")
                    else:
                        logger.warning(f"No valid options data returned for {symbol}")
                    
                    # Delay between symbols for rate limiting (options are complex data)
                    await asyncio.sleep(0.5)
                    
                except Exception as e:
                    logger.error(f"Failed to fetch options for {symbol}: {e}")
                    continue
            
            logger.info(f"Successfully fetched options data for {len(options_data)} symbols")
            return options_data
            
        except Exception as e:
            logger.error(f"Error fetching options chain: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """
        Store options chain data using database upsert function.
        
        Args:
            data: Dictionary containing options data by symbol
            
        Returns:
            True if all data stored successfully, False otherwise
        """
        if not data:
            return True
        
        try:
            success_count = 0
            total_records = 0
            valid_symbols = 0
            
            for symbol, fetch_result in data.items():
                try:
                    # Handle both FetchResult objects and raw data for backward compatibility
                    if hasattr(fetch_result, 'success') and hasattr(fetch_result, 'data'):
                        # This is a FetchResult object
                        if not fetch_result.success or not fetch_result.data:
                            logger.warning(f"❌ No valid options data for {symbol} from {getattr(fetch_result, 'provider', 'unknown')}")
                            continue
                        
                        options_data = fetch_result.data
                        provider_info = fetch_result.provider
                    else:
                        # This is raw options data (backward compatibility)
                        options_data = fetch_result
                        provider_info = "legacy"
                    
                    if not options_data or not isinstance(options_data, dict):
                        logger.warning(f"❌ Invalid options data format for {symbol}")
                        continue
                    
                    valid_symbols += 1
                    
                    # Safe conversion helper functions
                    def safe_float(value, field_name="unknown"):
                        """Safely convert value to float."""
                        if value is None:
                            return None
                        try:
                            return float(value)
                        except (ValueError, TypeError):
                            logger.warning(f"Invalid {field_name} value for {symbol}: {value}")
                            return None
                    
                    def safe_int(value, field_name="unknown"):
                        """Safely convert value to int."""
                        if value is None:
                            return None
                        try:
                            return int(value)
                        except (ValueError, TypeError):
                            logger.warning(f"Invalid {field_name} value for {symbol}: {value}")
                            return None
                    
                    # Process calls and puts separately
                    for option_type in ['calls', 'puts']:
                        options_list = options_data.get(option_type, [])
                        
                        for option in options_list:
                            try:
                                # Handle both dict and object formats
                                if hasattr(option, '__dict__'):
                                    # This is an object, convert to dict-like access
                                    option_dict = option.__dict__
                                    get_attr = lambda key, default=None: getattr(option, key, default)
                                else:
                                    # This is already a dict
                                    option_dict = option
                                    get_attr = lambda key, default=None: option.get(key, default)
                                
                                # Extract and validate required fields
                                strike = safe_float(get_attr('strike'), 'strike')
                                expiration = get_attr('expiration')
                                
                                if strike is None or not expiration:
                                    logger.warning(f"❌ Missing required fields for {symbol} option: strike={strike}, expiration={expiration}")
                                    total_records += 1
                                    continue
                                
                                # Generate option symbol if not provided
                                option_symbol = get_attr('symbol')
                                if not option_symbol:
                                    exp_str = str(expiration).replace('-', '')
                                    strike_int = int(strike * 1000)
                                    option_symbol = f"{symbol}{exp_str}{option_type[0].upper()}{strike_int:08d}"
                                
                                # Extract exchange information if available
                                exchange_info = get_attr('exchange', {}) or {}
                                
                                await self.db_service.execute_function(
                                    "upsert_options_chain",
                                    p_symbol=option_symbol,
                                    p_underlying_symbol=symbol,
                                    p_expiration=expiration,
                                    p_strike=strike,
                                    p_option_type=option_type,
                                    p_data_provider=provider_info,
                                    
                                    # Exchange parameters with safe extraction
                                    p_exchange_code=exchange_info.get('code') if isinstance(exchange_info, dict) else get_attr('exchange_code'),
                                    p_exchange_name=exchange_info.get('name') if isinstance(exchange_info, dict) else get_attr('exchange_name'),
                                    p_exchange_country=exchange_info.get('country') if isinstance(exchange_info, dict) else get_attr('country'),
                                    p_exchange_timezone=exchange_info.get('timezone') if isinstance(exchange_info, dict) else get_attr('timezone'),
                                    
                                    # Options parameters with safe conversions
                                    p_bid=safe_float(get_attr('bid'), 'bid'),
                                    p_ask=safe_float(get_attr('ask'), 'ask'),
                                    p_last_price=safe_float(get_attr('last_price'), 'last_price'),
                                    p_volume=safe_int(get_attr('volume'), 'volume'),
                                    p_open_interest=safe_int(get_attr('open_interest'), 'open_interest'),
                                    p_implied_volatility=safe_float(get_attr('implied_volatility'), 'implied_volatility'),
                                    p_delta=safe_float(get_attr('delta'), 'delta'),
                                    p_gamma=safe_float(get_attr('gamma'), 'gamma'),
                                    p_theta=safe_float(get_attr('theta'), 'theta'),
                                    p_vega=safe_float(get_attr('vega'), 'vega'),
                                    p_rho=safe_float(get_attr('rho'), 'rho'),
                                    p_intrinsic_value=safe_float(get_attr('intrinsic_value'), 'intrinsic_value'),
                                    p_extrinsic_value=safe_float(get_attr('extrinsic_value'), 'extrinsic_value'),
                                    p_time_value=safe_float(get_attr('time_value'), 'time_value'),
                                    p_quote_timestamp=get_attr('timestamp', datetime.now())
                                )
                                success_count += 1
                                logger.debug(f"✅ Stored {option_type} option for {symbol} strike ${strike} from {provider_info}")
                                
                            except Exception as e:
                                logger.error(f"❌ Failed to store {option_type} option for {symbol}: {e}")
                            
                            total_records += 1
                
                except Exception as e:
                    logger.error(f"❌ Failed to process options data for {symbol}: {e}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{total_records} options records stored successfully from {valid_symbols} symbols")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == total_records
            
        except Exception as e:
            logger.error(f"Error storing options chain: {e}")
            return False
    
    async def _fetch_with_provider_fallback(self, symbol: str) -> Optional[Any]:
        """Fetch options chain data from multiple providers for comprehensive coverage."""
        try:
            # Quick validation for obviously invalid symbols
            if not symbol or len(symbol) > 10 or not symbol.replace('.', '').replace('-', '').isalnum():
                logger.warning(f"Invalid symbol format: {symbol}")
                return None
                
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for options chain aggregation")
                return None
            
            logger.info(f"Starting options chain aggregation for {symbol} across {len(available_providers)} providers")
            
            # Initialize merged options data
            all_options_chains = []
            provider_contributions = {}
            
            # Query ALL available providers to get comprehensive options data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for {symbol} options chain")
                        options_data = await provider.get_options_chain(symbol)
                        
                        if options_data and isinstance(options_data, dict):
                            calls_count = len(options_data.get('calls', []))
                            puts_count = len(options_data.get('puts', []))
                            total_options = calls_count + puts_count
                            
                            if total_options > 0:
                                provider_contributions[provider_name] = total_options
                                
                                # Add provider info to each option
                                for option_type in ['calls', 'puts']:
                                    for option in options_data.get(option_type, []):
                                        if hasattr(option, 'provider'):
                                            option.provider = provider_name
                                        elif isinstance(option, dict):
                                            option['provider'] = provider_name
                                        else:
                                            setattr(option, 'provider', provider_name)
                                
                                all_options_chains.append(options_data)
                                logger.info(f"{provider_name} contributed {total_options} options for {symbol} ({calls_count} calls, {puts_count} puts)")
                            else:
                                logger.debug(f"No options data from {provider_name} for {symbol}")
                        else:
                            logger.debug(f"No valid options data from {provider_name} for {symbol}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.1)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for {symbol} options: {e}")
                    continue
            
            if not all_options_chains:
                logger.warning(f"No providers returned valid options data for {symbol}")
                return None
            
            # Merge options chains using comprehensive aggregation
            merged_options = await self._merge_options_chains(symbol, all_options_chains)
            if not merged_options:
                logger.warning(f"Failed to merge options data for {symbol}")
                return None
            
            # Create result with all contributing providers listed
            contributing_providers = [p for p, count in provider_contributions.items() if count > 0]
            provider_string = f"{'+'.join(contributing_providers)}"
            
            from market_data.brain import FetchResult
            comprehensive_result = FetchResult(
                data=merged_options,
                provider=provider_string,
                success=True
            )
            
            total_merged = len(merged_options.get('calls', [])) + len(merged_options.get('puts', []))
            logger.info(f"Options aggregation for {symbol}: {total_merged} total options from {len(contributing_providers)} providers")
            logger.info(f"Provider contributions: {provider_contributions}")
            
            return comprehensive_result
            
        except Exception as e:
            logger.error(f"Error in options chain aggregation for {symbol}: {e}")
            return None
    
    async def _merge_options_chains(self, symbol: str, options_chains: List[Dict]) -> Optional[Dict]:
        """Merge options chains from multiple providers for comprehensive coverage."""
        try:
            if not options_chains:
                return None
            
            logger.info(f"Merging {len(options_chains)} options chains for {symbol}")
            
            # Initialize merged structure
            merged_options = {'calls': [], 'puts': []}
            
            # Track unique options by strike and expiration to avoid duplicates
            unique_options = {'calls': {}, 'puts': {}}
            
            # Process each provider's options chain
            for chain in options_chains:
                for option_type in ['calls', 'puts']:
                    options_list = chain.get(option_type, [])
                    
                    for option in options_list:
                        try:
                            # Handle both dict and object formats
                            if hasattr(option, '__dict__'):
                                get_attr = lambda key, default=None: getattr(option, key, default)
                            else:
                                get_attr = lambda key, default=None: option.get(key, default)
                            
                            # Create unique key based on strike and expiration
                            strike = get_attr('strike')
                            expiration = get_attr('expiration')
                            
                            if strike is None or not expiration:
                                logger.debug(f"Skipping option with missing strike/expiration: {strike}/{expiration}")
                                continue
                            
                            unique_key = f"{strike}_{expiration}"
                            
                            if unique_key not in unique_options[option_type]:
                                # First occurrence of this strike/expiration
                                unique_options[option_type][unique_key] = option
                            else:
                                # Merge with existing option, preferring non-null values
                                existing_option = unique_options[option_type][unique_key]
                                merged_option = await self._merge_option_fields(existing_option, option)
                                unique_options[option_type][unique_key] = merged_option
                        
                        except Exception as e:
                            logger.warning(f"Error processing option for {symbol}: {e}")
                            continue
            
            # Convert unique options back to lists
            for option_type in ['calls', 'puts']:
                merged_options[option_type] = list(unique_options[option_type].values())
            
            # Sort options by strike price for better organization
            for option_type in ['calls', 'puts']:
                merged_options[option_type].sort(
                    key=lambda x: float(getattr(x, 'strike', 0) if hasattr(x, 'strike') else x.get('strike', 0))
                )
            
            total_calls = len(merged_options['calls'])
            total_puts = len(merged_options['puts'])
            logger.info(f"Successfully merged options for {symbol}: {total_calls} calls, {total_puts} puts")
            
            return merged_options
            
        except Exception as e:
            logger.error(f"Error merging options chains for {symbol}: {e}")
            return None
    
    async def _merge_option_fields(self, option1: Any, option2: Any) -> Any:
        """Merge two option objects, preferring non-null values and more complete data."""
        try:
            # Handle both dict and object formats
            if hasattr(option1, '__dict__'):
                get_attr1 = lambda key, default=None: getattr(option1, key, default)
                set_attr1 = lambda key, value: setattr(option1, key, value)
                merged = option1
            else:
                get_attr1 = lambda key, default=None: option1.get(key, default)
                set_attr1 = lambda key, value: option1.update({key: value})
                merged = option1.copy()
            
            if hasattr(option2, '__dict__'):
                get_attr2 = lambda key, default=None: getattr(option2, key, default)
            else:
                get_attr2 = lambda key, default=None: option2.get(key, default)
            
            # Fields to merge with preference for non-null values
            option_fields = [
                'bid', 'ask', 'last_price', 'volume', 'open_interest',
                'implied_volatility', 'delta', 'gamma', 'theta', 'vega', 'rho',
                'intrinsic_value', 'extrinsic_value', 'time_value', 'timestamp',
                'exchange_code', 'exchange_name', 'exchange_country', 'exchange_timezone'
            ]
            
            for field in option_fields:
                value1 = get_attr1(field)
                value2 = get_attr2(field)
                
                # Prefer non-null values
                if value2 is not None and value1 is None:
                    if hasattr(merged, '__dict__'):
                        setattr(merged, field, value2)
                    else:
                        merged[field] = value2
                elif value2 is not None and value1 is not None:
                    # For timestamp, prefer more recent
                    if field == 'timestamp':
                        try:
                            if value2 > value1:
                                if hasattr(merged, '__dict__'):
                                    setattr(merged, field, value2)
                                else:
                                    merged[field] = value2
                        except (TypeError, ValueError):
                            pass  # Keep original value if comparison fails
            
            return merged
            
        except Exception as e:
            logger.warning(f"Error merging option fields: {e}")
            return option1
