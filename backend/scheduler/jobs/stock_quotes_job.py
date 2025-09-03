"""
Stock quotes data fetching job.
Fetches real-time stock price data and stores using upsert functions.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain
from scheduler.data_fetch_tracker import DataType, DataFetchTracker
from scheduler.enhanced_provider_manager import EnhancedProviderManager, FetchStrategy


logger = logging.getLogger(__name__)


class StockQuotesJob(BaseMarketDataJob):
    """Job for fetching and storing real-time stock quotes."""
    
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
        return DataType.STOCK_QUOTES
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Fetch real-time stock quotes for given symbols with provider fallback.
        
        Args:
            symbols: List of stock symbols to fetch quotes for
            
        Returns:
            Dictionary containing quote data for all symbols
        """
        try:
            logger.info(f"Fetching stock quotes for {len(symbols)} symbols")
            
            # Use enhanced tracking if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fastest-first strategy")
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=symbols,
                    fetch_method='get_multiple_quotes',
                    strategy=FetchStrategy.FASTEST_FIRST  # Quotes benefit from speed
                )
            
            # Fallback to original implementation with enhanced provider fallback
            logger.info("Using basic fetch with provider fallback")
            quotes_data = {}
            
            for symbol in symbols:
                try:
                    # Get quotes with provider fallback for better reliability
                    merged_quote = await self._fetch_with_provider_fallback(symbol)
                    if merged_quote:
                        quotes_data[symbol] = merged_quote
                        logger.info(f"Successfully fetched quote for {symbol}")
                    else:
                        logger.warning(f"No valid quote data returned for {symbol}")
                    
                    await asyncio.sleep(0.01)  # Minimal delay for rate limiting
                    
                except Exception as e:
                    logger.error(f"Failed to fetch quote for {symbol}: {e}")
                    continue
            
            logger.info(f"Successfully fetched quotes for {len(quotes_data)} symbols")
            return quotes_data
            
        except Exception as e:
            logger.error(f"Error fetching stock quotes: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """
        Store stock quotes data using database upsert function.
        
        Args:
            data: Dictionary containing quote data by symbol
            
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
                            logger.warning(f"❌ No valid quote data for {symbol} from {getattr(fetch_result, 'provider', 'unknown')}")
                            continue
                        
                        quote_data = fetch_result.data
                        provider_info = fetch_result.provider
                    else:
                        # This is raw quote data (backward compatibility)
                        quote_data = fetch_result
                        provider_info = "legacy"
                    
                    if not quote_data:
                        logger.warning(f"❌ Empty quote data for {symbol}")
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
                    
                    # Extract and safely convert quote fields
                    price = safe_float(getattr(quote_data, 'price', None), 'price')
                    change = safe_float(getattr(quote_data, 'change', None), 'change')
                    change_percent = safe_float(getattr(quote_data, 'change_percent', None), 'change_percent')
                    volume = safe_int(getattr(quote_data, 'volume', None), 'volume')
                    
                    # Validate required fields
                    if price is None:
                        logger.warning(f"❌ Missing required price for {symbol}")
                        continue
                    
                    # Call the PostgreSQL upsert function with safe conversions
                    await self.db_service.execute_function(
                        "upsert_stock_quote",
                        p_symbol=symbol,
                        p_quote_timestamp=getattr(quote_data, 'timestamp', datetime.now()),
                        p_data_provider=provider_info,
                        
                        # Exchange parameters (may be None)
                        p_exchange_code=getattr(quote_data, 'exchange_code', None),
                        p_exchange_name=getattr(quote_data, 'exchange_name', None),
                        p_exchange_country=getattr(quote_data, 'exchange_country', None),
                        p_exchange_timezone=getattr(quote_data, 'exchange_timezone', None),
                        
                        # Quote parameters with safe conversions
                        p_price=price,
                        p_change_amount=change,
                        p_change_percent=change_percent,
                        p_volume=volume,
                        p_open_price=safe_float(getattr(quote_data, 'open', None), 'open'),
                        p_high_price=safe_float(getattr(quote_data, 'high', None), 'high'),
                        p_low_price=safe_float(getattr(quote_data, 'low', None), 'low'),
                        p_previous_close=safe_float(getattr(quote_data, 'previous_close', None), 'previous_close')
                    )
                    
                    success_count += 1
                    total_records += 1
                    logger.info(f"✅ Stored quote for {symbol} from {provider_info} (${price})")
                    
                except Exception as e:
                    logger.error(f"❌ Failed to store quote for {symbol}: {e}")
                    total_records += 1
                    continue
            
            logger.info(f"📊 Storage Summary: {success_count}/{total_records} stock quotes stored successfully from {valid_symbols} symbols")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == total_records
            
        except Exception as e:
            logger.error(f"Error storing stock quotes: {e}")
            return False
    
    async def _fetch_with_provider_fallback(self, symbol: str) -> Optional[Any]:
        """Fetch stock quote data from multiple providers for comprehensive coverage."""
        try:
            # Quick validation for obviously invalid symbols
            if not symbol or len(symbol) > 10 or not symbol.replace('.', '').replace('-', '').isalnum():
                logger.warning(f"Invalid symbol format: {symbol}")
                return None
                
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for stock quote aggregation")
                return None
            
            logger.info(f"Starting stock quote aggregation for {symbol} across {len(available_providers)} providers")
            
            # Initialize merged quote data
            all_quotes = []
            provider_contributions = {}
            
            # Query ALL available providers to get comprehensive quote data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for {symbol} quote")
                        quote_data = await provider.get_quote(symbol)
                        
                        if quote_data and hasattr(quote_data, 'price') and quote_data.price is not None:
                            provider_contributions[provider_name] = 1
                            
                            # Add provider info to quote
                            if hasattr(quote_data, 'provider'):
                                quote_data.provider = provider_name
                            else:
                                setattr(quote_data, 'provider', provider_name)
                            
                            all_quotes.append(quote_data)
                            logger.info(f"{provider_name} contributed quote for {symbol}: ${quote_data.price}")
                        else:
                            logger.debug(f"No valid quote data from {provider_name} for {symbol}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.01)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for {symbol} quote: {e}")
                    continue
            
            if not all_quotes:
                logger.warning(f"No providers returned valid quote data for {symbol}")
                return None
            
            # Merge quotes using field-level fallback for most complete data
            merged_quote = await self._merge_quote_fields(symbol, all_quotes)
            if not merged_quote:
                logger.warning(f"Failed to merge quote data for {symbol}")
                return None
            
            # Create result with all contributing providers listed
            contributing_providers = [p for p, count in provider_contributions.items() if count > 0]
            provider_string = f"{'+'.join(contributing_providers)}"
            
            from market_data.brain import FetchResult
            comprehensive_result = FetchResult(
                data=merged_quote,
                provider=provider_string,
                success=True
            )
            
            logger.info(f"Quote aggregation for {symbol}: merged data from {len(contributing_providers)} providers")
            logger.info(f"Provider contributions: {provider_contributions}")
            
            return comprehensive_result
            
        except Exception as e:
            logger.error(f"Error in stock quote aggregation for {symbol}: {e}")
            return None
    
    async def _merge_quote_fields(self, symbol: str, quotes: List[Any]) -> Optional[Any]:
        """Merge quote fields from multiple providers for most complete data."""
        try:
            if not quotes:
                return None
            
            logger.info(f"Merging {len(quotes)} quotes for {symbol}")
            
            # Start with the first quote as base
            merged_quote = quotes[0]
            
            # Field priority: prefer non-null values, then most recent timestamp
            quote_fields = [
                'price', 'change', 'change_percent', 'volume',
                'open', 'high', 'low', 'previous_close',
                'timestamp', 'exchange_code', 'exchange_name',
                'exchange_country', 'exchange_timezone'
            ]
            
            # Track which provider contributed each field
            field_sources = {}
            
            for field in quote_fields:
                best_value = getattr(merged_quote, field, None)
                best_provider = getattr(merged_quote, 'provider', 'unknown')
                
                # Check all quotes for better values for this field
                for quote in quotes:
                    current_value = getattr(quote, field, None)
                    current_provider = getattr(quote, 'provider', 'unknown')
                    
                    # Prefer non-null values
                    if current_value is not None and best_value is None:
                        best_value = current_value
                        best_provider = current_provider
                    elif current_value is not None and best_value is not None:
                        # For price-related fields, prefer more recent data
                        if field in ['price', 'change', 'change_percent', 'volume']:
                            current_timestamp = getattr(quote, 'timestamp', None)
                            best_timestamp = getattr(merged_quote, 'timestamp', None)
                            
                            if current_timestamp and best_timestamp:
                                if current_timestamp > best_timestamp:
                                    best_value = current_value
                                    best_provider = current_provider
                            elif current_timestamp and not best_timestamp:
                                best_value = current_value
                                best_provider = current_provider
                
                # Set the best value found
                if hasattr(merged_quote, field):
                    setattr(merged_quote, field, best_value)
                else:
                    # Create the attribute if it doesn't exist
                    setattr(merged_quote, field, best_value)
                
                if best_value is not None:
                    field_sources[field] = best_provider
            
            # Log field sources for debugging
            logger.debug(f"Field sources for {symbol}: {field_sources}")
            
            # Validate merged quote has essential fields
            if not hasattr(merged_quote, 'price') or merged_quote.price is None:
                logger.warning(f"Merged quote for {symbol} missing essential price field")
                return None
            
            logger.info(f"Successfully merged quote for {symbol} with price ${merged_quote.price}")
            return merged_quote
            
        except Exception as e:
            logger.error(f"Error merging quote fields for {symbol}: {e}")
            return None
