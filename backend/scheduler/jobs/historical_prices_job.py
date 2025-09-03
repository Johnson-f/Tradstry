"""
Historical prices data fetching job.
Fetches end-of-day historical price data and stores using upsert functions.
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain
from scheduler.data_fetch_tracker import DataType, DataFetchTracker
from scheduler.enhanced_provider_manager import EnhancedProviderManager, FetchStrategy


logger = logging.getLogger(__name__)


class HistoricalPricesJob(BaseMarketDataJob):
    """Job for fetching and storing historical price data."""
    
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
        return DataType.HISTORICAL_PRICES
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Fetch historical price data for given symbols with provider fallback.
        
        Args:
            symbols: List of stock symbols to fetch historical data for
            
        Returns:
            Dictionary containing historical price data for all symbols
        """
        try:
            logger.info(f"Fetching historical prices for {len(symbols)} symbols")
            
            # Get data for the last 30 days
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=30)
            
            # Use enhanced tracking with fallback chain if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fallback chain strategy")
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=symbols,
                    fetch_method='get_historical_prices',
                    strategy=FetchStrategy.FALLBACK_CHAIN,
                    start_date=start_date,
                    end_date=end_date
                )
            
            # Fallback to original implementation with enhanced provider fallback
            logger.info("Using basic fetch with provider fallback")
            historical_data = {}
            
            for symbol in symbols:
                try:
                    # Get historical prices with provider fallback
                    merged_prices = await self._fetch_with_provider_fallback(symbol, start_date, end_date)
                    if merged_prices:
                        historical_data[symbol] = merged_prices
                        logger.info(f"Successfully fetched historical data for {symbol}")
                    else:
                        logger.warning(f"No valid historical data returned for {symbol}")
                    
                    await asyncio.sleep(0.1)  # Rate limiting
                    
                except Exception as e:
                    logger.error(f"Failed to fetch historical prices for {symbol}: {e}")
                    continue
            
            logger.info(f"Successfully fetched historical data for {len(historical_data)} symbols")
            return historical_data
            
        except Exception as e:
            logger.error(f"Error fetching historical prices: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """
        Store historical price data using database upsert function.
        
        Args:
            data: Dictionary containing historical price data by symbol
            
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
                    # Extract price history from FetchResult
                    if not fetch_result.success or not fetch_result.data:
                        logger.warning(f"No valid historical price data for {symbol}")
                        continue
                    
                    valid_symbols += 1
                    price_history = fetch_result.data
                    provider = fetch_result.provider
                    
                    # Handle both list and single object responses
                    if not isinstance(price_history, list):
                        price_history = [price_history] if price_history else []
                    
                    # Helper function to safely convert values
                    def safe_convert(value, convert_func, default=None):
                        if value is None or value == '' or value == 0:
                            return default
                        try:
                            return convert_func(value)
                        except (ValueError, TypeError):
                            return default
                    
                    for price_record in price_history:
                        try:
                            total_records += 1
                            
                            # Extract exchange information if available
                            exchange_info = getattr(price_record, 'exchange', {}) if hasattr(price_record, 'exchange') else {}
                            
                            await self.db_service.execute_function(
                                "upsert_historical_price",
                                p_symbol=symbol,
                                p_date=getattr(price_record, 'date', None),
                                p_data_provider=provider,
                                
                                # Exchange parameters for automatic exchange handling
                                p_exchange_code=exchange_info.get('code') or getattr(price_record, 'exchange_code', None),
                                p_exchange_name=exchange_info.get('name') or getattr(price_record, 'exchange_name', None),
                                p_exchange_country=exchange_info.get('country') or getattr(price_record, 'country', None),
                                p_exchange_timezone=exchange_info.get('timezone') or getattr(price_record, 'timezone', None),
                                
                                # Price parameters matching SQL function signature
                                p_open=safe_convert(getattr(price_record, 'open', None), float),
                                p_high=safe_convert(getattr(price_record, 'high', None), float),
                                p_low=safe_convert(getattr(price_record, 'low', None), float),
                                p_close=safe_convert(getattr(price_record, 'close', None), float),
                                p_adjusted_close=safe_convert(getattr(price_record, 'adjusted_close', None), float),
                                p_volume=safe_convert(getattr(price_record, 'volume', None), int),
                                p_dividend=safe_convert(getattr(price_record, 'dividend', None), float),
                                p_split_ratio=safe_convert(getattr(price_record, 'split_ratio', None) or getattr(price_record, 'split_coefficient', None), float)
                            )
                            success_count += 1
                            
                        except Exception as e:
                            logger.error(f"Failed to store historical price record for {symbol}: {e}")
                            logger.error(f"Price record date: {getattr(price_record, 'date', 'No date') if 'price_record' in locals() else 'No data'}")
                    
                    logger.info(f"✅ Successfully stored {len(price_history)} price records for {symbol}")
                    logger.info(f"   Provider: {provider}")
                    
                except Exception as e:
                    logger.error(f"Failed to process historical data for {symbol}: {e}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{total_records} historical price records stored successfully from {valid_symbols} symbols")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == total_records
            
        except Exception as e:
            logger.error(f"Error storing historical prices: {e}")
            return False
    
    async def _fetch_with_provider_fallback(self, symbol: str, start_date, end_date) -> Optional[Any]:
        """Fetch historical price data from multiple providers for comprehensive coverage."""
        try:
            # Quick validation for obviously invalid symbols
            if not symbol or len(symbol) > 10 or not symbol.replace('.', '').isalnum():
                logger.warning(f"Invalid symbol format: {symbol}")
                return None
                
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for historical price data aggregation")
                return None
            
            logger.info(f"Starting historical price data aggregation for {symbol} across {len(available_providers)} providers")
            
            # Initialize merged price data
            all_price_data = []
            provider_contributions = {}
            
            # Query ALL available providers to get comprehensive historical data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for {symbol} historical prices")
                        price_data = await provider.get_historical_prices([symbol], start_date, end_date)
                        
                        # Extract data for this symbol
                        symbol_data = price_data.get(symbol, []) if isinstance(price_data, dict) else []
                        
                        if symbol_data and len(symbol_data) > 0:
                            provider_contributions[provider_name] = len(symbol_data)
                            
                            # Add provider info to each price record
                            for price_record in symbol_data:
                                if hasattr(price_record, 'provider'):
                                    price_record.provider = provider_name
                                else:
                                    setattr(price_record, 'provider', provider_name)
                            
                            all_price_data.extend(symbol_data)
                            logger.info(f"{provider_name} contributed {len(symbol_data)} price records")
                        else:
                            logger.debug(f"No historical price data from {provider_name} for {symbol}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for {symbol} historical prices: {e}")
                    continue
            
            if not all_price_data:
                logger.warning(f"No providers returned valid historical price data for {symbol}")
                return None
            
            # Remove duplicates based on date, keeping the most complete record
            unique_prices = {}
            for price_record in all_price_data:
                date_key = getattr(price_record, 'date', None)
                if date_key:
                    if date_key not in unique_prices:
                        unique_prices[date_key] = price_record
                    else:
                        # Keep the record with more complete data (non-null values)
                        existing_record = unique_prices[date_key]
                        new_record = price_record
                        
                        # Count non-null fields in both records
                        existing_fields = sum(1 for field in ['open', 'high', 'low', 'close', 'volume', 'adjusted_close'] 
                                            if getattr(existing_record, field, None) is not None)
                        new_fields = sum(1 for field in ['open', 'high', 'low', 'close', 'volume', 'adjusted_close'] 
                                       if getattr(new_record, field, None) is not None)
                        
                        if new_fields > existing_fields:
                            unique_prices[date_key] = new_record
            
            final_prices = list(unique_prices.values())
            
            # Sort by date (most recent first)
            final_prices.sort(key=lambda x: getattr(x, 'date', ''), reverse=True)
            
            # Create result with all contributing providers listed
            contributing_providers = [p for p, count in provider_contributions.items() if count > 0]
            provider_string = f"{'+'.join(contributing_providers)}"
            
            from market_data.brain import FetchResult
            comprehensive_result = FetchResult(
                data=final_prices,
                provider=provider_string,
                success=True
            )
            
            logger.info(f"Historical price aggregation for {symbol}: {len(final_prices)} unique price records from {len(contributing_providers)} providers")
            logger.info(f"Provider contributions: {provider_contributions}")
            
            return comprehensive_result
            
        except Exception as e:
            logger.error(f"Error in historical price data aggregation for {symbol}: {e}")
            return None
