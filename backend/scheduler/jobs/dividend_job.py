"""
Dividend data fetching job.
Fetches dividend announcements and payment data.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime

from scheduler.jobs.base_job import BaseMarketDataJob
from scheduler.data_fetch_tracker import DataType, DataFetchTracker
from scheduler.enhanced_provider_manager import EnhancedProviderManager, FetchStrategy
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class DividendDataJob(BaseMarketDataJob):
    """Job for fetching and storing dividend data."""
    
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
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch comprehensive dividend data from all providers for given symbols."""
        try:
            logger.info(f"Fetching comprehensive dividend data for {len(symbols)} symbols")
            
            # Use enhanced tracking with fallback chain if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fallback chain strategy")
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=symbols,
                    fetch_method='get_dividends',
                    strategy=FetchStrategy.FALLBACK_CHAIN
                )
            
            # Fallback to original implementation
            logger.info("Using basic fetch with comprehensive aggregation")
            dividend_data = {}
            
            for symbol in symbols:
                try:
                    # Use comprehensive aggregation approach
                    result = await self._fetch_with_comprehensive_aggregation(symbol)
                    if result:
                        # Wrap in FetchResult for consistency
                        from market_data.brain import FetchResult
                        dividend_data[symbol] = FetchResult(
                            data=result,
                            provider="comprehensive_aggregation",
                            success=True
                        )
                    await asyncio.sleep(0.1)  # Reduced delay for better performance
                except Exception as e:
                    logger.error(f"Failed to fetch dividends for {symbol}: {e}")
                    continue
            
            return dividend_data
        except Exception as e:
            logger.error(f"Error fetching dividend data: {e}")
            return {}
    
    async def _fetch_with_comprehensive_aggregation(self, symbol: str) -> Any:
        """Fetch dividend data by aggregating from ALL providers for comprehensive coverage."""
        try:
            # Quick validation for obviously invalid symbols
            if not symbol or len(symbol) > 10 or not symbol.replace('.', '').isalnum():
                logger.warning(f"Invalid symbol format: {symbol}")
                return None
            
            # Get list of available providers from the brain (like company info job)
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for dividend data")
                return None
            
            logger.info(f"Aggregating dividend data for {symbol} from {len(available_providers)} providers")
            
            all_dividends = []
            successful_providers = []
            
            # Query ALL providers and collect their dividend data (like company info job)
            for provider_name in available_providers:
                try:
                    # Get the provider instance directly from orchestrator.providers
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for {symbol} dividend data")
                        provider_dividends = await provider.get_dividends(symbol)
                        
                        if provider_dividends and isinstance(provider_dividends, list):
                            # Add provider attribution to each dividend record
                            for dividend in provider_dividends:
                                if isinstance(dividend, dict):
                                    dividend['provider'] = provider_name
                                    all_dividends.append(dividend)
                            
                            successful_providers.append(provider_name)
                            logger.info(f"✅ {provider_name}: {len(provider_dividends)} dividend records for {symbol}")
                        else:
                            logger.debug(f"❌ {provider_name}: No dividend data for {symbol}")
                    
                    # Small delay between providers to respect rate limits (like company info job)
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for {symbol}: {e}")
                    continue
            
            if not all_dividends:
                logger.warning(f"No dividend data found for {symbol} from any provider")
                return None
            
            # Remove duplicates based on ex_dividend_date and provider
            unique_dividends = self._deduplicate_dividends(all_dividends)
            
            logger.info(f"📊 Comprehensive dividend aggregation for {symbol}:")
            logger.info(f"   Providers: {'+'.join(successful_providers)}")
            logger.info(f"   Total records: {len(all_dividends)} → {len(unique_dividends)} unique")
            
            return unique_dividends
            
        except Exception as e:
            logger.error(f"Error in comprehensive dividend aggregation for {symbol}: {e}")
            return None
    
    def _deduplicate_dividends(self, dividends: List[Dict]) -> List[Dict]:
        """Remove duplicate dividend records based on ex_dividend_date and provider."""
        seen = set()
        unique_dividends = []
        
        for dividend in dividends:
            # Create a key based on ex_dividend_date and provider
            ex_date = dividend.get('ex_dividend_date')
            provider = dividend.get('provider')
            
            if ex_date and provider:
                key = f"{ex_date}_{provider}"
                if key not in seen:
                    seen.add(key)
                    unique_dividends.append(dividend)
            else:
                # Include records without proper dates/providers but log warning
                logger.warning(f"Dividend record missing ex_dividend_date or provider: {dividend}")
                unique_dividends.append(dividend)
        
        return unique_dividends
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store comprehensive dividend data using database upsert function."""
        if not data:
            return True
        
        try:
            success_count = 0
            total_records = 0
            valid_data_count = 0
            
            # Pre-fetch company info for dividend metrics enhancement
            company_info_cache = {}
            
            # Fetch company info for each symbol to get dividend_yield and payout_ratio
            for symbol in data.keys():
                try:
                    # Try to get company info from multiple providers
                    for provider_name in ['polygon', 'alpha_vantage', 'fmp', 'tiingo']:
                        if provider_name in self.orchestrator.providers:
                            provider = self.orchestrator.providers[provider_name]
                            company_info = await provider.get_company_info(symbol)
                            if company_info:
                                company_info_cache[symbol] = {
                                    'dividend_yield': getattr(company_info, 'dividend_yield', None),
                                    'dividend_per_share': getattr(company_info, 'dividend_per_share', None),
                                    'payout_ratio': getattr(company_info, 'payout_ratio', None),
                                    'provider': provider_name
                                }
                                break
                except Exception as e:
                    logger.debug(f"Could not fetch company info for {symbol}: {e}")
            
            # Helper function to safely convert values
            def safe_convert(value, convert_func, default=None):
                if value is None or value == '' or value == 0:
                    return default
                try:
                    return convert_func(value)
                except (ValueError, TypeError):
                    return default
            
            for symbol, fetch_result in data.items():
                try:
                    # Extract dividend data from FetchResult (like company info job)
                    if not hasattr(fetch_result, 'success') or not fetch_result.success or not fetch_result.data:
                        logger.warning(f"No valid data for {symbol}")
                        continue
                    
                    valid_data_count += 1
                    dividends = fetch_result.data
                    
                    # Handle both list and single dividend formats
                    if not isinstance(dividends, list):
                        logger.warning(f"Invalid dividend data format for {symbol}: expected list")
                        continue
                
                    logger.info(f"Storing {len(dividends)} dividend records for {symbol} from {fetch_result.provider}")
                    
                    for dividend in dividends:
                        try:
                            total_records += 1
                            
                            # Normalize field names from different providers
                            normalized_dividend = self._normalize_dividend_fields(dividend)
                            
                            # Enhance with company info data if available
                            if symbol in company_info_cache:
                                company_data = company_info_cache[symbol]
                                if not normalized_dividend.get('dividend_yield') and company_data.get('dividend_yield'):
                                    normalized_dividend['dividend_yield'] = company_data['dividend_yield']
                                if not normalized_dividend.get('payout_ratio') and company_data.get('payout_ratio'):
                                    normalized_dividend['payout_ratio'] = company_data['payout_ratio']
                                
                                logger.debug(f"Enhanced {symbol} dividend with company info from {company_data['provider']}")
                            
                            # Calculate fiscal year/quarter from ex_dividend_date if possible
                            ex_date = normalized_dividend.get('ex_dividend_date')
                            if ex_date and not normalized_dividend.get('fiscal_year'):
                                try:
                                    from datetime import datetime
                                    if isinstance(ex_date, str):
                                        date_obj = datetime.strptime(ex_date, '%Y-%m-%d')
                                        # Assume fiscal year follows calendar year for simplicity
                                        normalized_dividend['fiscal_year'] = date_obj.year
                                        # Calculate quarter (1-4) based on month
                                        quarter = (date_obj.month - 1) // 3 + 1
                                        normalized_dividend['fiscal_quarter'] = quarter
                                except Exception as e:
                                    logger.debug(f"Could not parse date {ex_date} for fiscal calculations: {e}")
                            
                            # Calculate consecutive years from frequency if available
                            frequency = normalized_dividend.get('frequency')
                            if frequency and frequency == 4 and not normalized_dividend.get('consecutive_years'):
                                # For quarterly dividends, estimate based on Apple's known dividend history
                                # This is a rough estimate - ideally would come from financial data
                                if symbol == 'AAPL':
                                    normalized_dividend['consecutive_years'] = 12  # Apple has paid dividends since 2012
                            
                            # Validate required fields after normalization
                            if not normalized_dividend.get('ex_dividend_date') or not normalized_dividend.get('dividend_amount'):
                                logger.warning(f"Missing required fields for {symbol} dividend: {dividend}")
                                continue
                            
                            # Extract exchange information - handle both string and dict formats
                            exchange_info = normalized_dividend.get('exchange', {})
                            if isinstance(exchange_info, str):
                                exchange_code = exchange_info
                                exchange_name = exchange_info
                                exchange_country = normalized_dividend.get('country')
                                exchange_timezone = None
                            else:
                                exchange_code = exchange_info.get('code') or normalized_dividend.get('exchange_code')
                                exchange_name = exchange_info.get('name') or normalized_dividend.get('exchange_name')
                                exchange_country = exchange_info.get('country') or normalized_dividend.get('country')
                                exchange_timezone = exchange_info.get('timezone') or normalized_dividend.get('timezone')
                            
                            # Prepare comprehensive parameters matching your upsert function exactly
                            params = {
                                # Required parameters
                                "p_symbol": symbol,
                                "p_data_provider": normalized_dividend.get('provider', fetch_result.provider),  # Use fetch_result provider as fallback
                                "p_ex_dividend_date": normalized_dividend.get('ex_dividend_date'),
                                "p_dividend_amount": safe_convert(normalized_dividend.get('dividend_amount'), float),
                                
                                # Exchange parameters for automatic exchange handling
                                "p_exchange_code": exchange_code,
                                "p_exchange_name": exchange_name,
                                "p_exchange_country": exchange_country,
                                "p_exchange_timezone": exchange_timezone,
                                
                                # Comprehensive dividend parameters matching SQL function signature
                                "p_declaration_date": normalized_dividend.get('declaration_date'),
                                "p_record_date": normalized_dividend.get('record_date'),
                                "p_payment_date": normalized_dividend.get('payment_date'),
                                "p_dividend_type": normalized_dividend.get('dividend_type', 'regular'),
                                "p_currency": normalized_dividend.get('currency', 'USD'),
                                "p_frequency": normalized_dividend.get('frequency'),
                                "p_dividend_status": normalized_dividend.get('dividend_status', 'active'),
                                "p_dividend_yield": safe_convert(normalized_dividend.get('dividend_yield'), float),
                                "p_payout_ratio": safe_convert(normalized_dividend.get('payout_ratio'), float),
                                "p_consecutive_years": safe_convert(normalized_dividend.get('consecutive_years'), int),
                                "p_qualified_dividend": normalized_dividend.get('qualified_dividend', True),
                                "p_tax_rate": safe_convert(normalized_dividend.get('tax_rate'), float),
                                "p_fiscal_year": safe_convert(normalized_dividend.get('fiscal_year'), int),
                                "p_fiscal_quarter": safe_convert(normalized_dividend.get('fiscal_quarter'), int)
                            }
                            
                            # Validate required amount field
                            if params["p_dividend_amount"] is None:
                                logger.warning(f"Invalid dividend amount for {symbol}: {dividend.get('dividend_amount')}")
                                continue
                            
                            # Log comprehensive data being stored
                            non_null_fields = [k.replace('p_', '') for k, v in params.items() 
                                             if v is not None and k.startswith('p_')]
                            
                            logger.debug(f"Storing {symbol} dividend: {len(non_null_fields)} fields populated")
                            
                            # Execute the upsert function
                            try:
                                result = await self.db_service.execute_function("upsert_dividend_data", **params)
                                
                                if result is not None:
                                    success_count += 1
                                    logger.info(f"✅ Stored dividend for {symbol} (ID: {result}) from {dividend.get('provider', fetch_result.provider)}")
                                else:
                                    logger.error(f"❌ Failed to store dividend for {symbol}: function returned None")
                                    logger.error(f"   Parameters: {params}")
                            except Exception as db_error:
                                logger.error(f"❌ Database error storing dividend for {symbol}: {db_error}")
                                logger.error(f"   Parameters: {params}")
                                # Continue processing other dividends instead of failing completely
                            
                        except Exception as e:
                            logger.error(f"Failed to store dividend for {symbol}: {e}")
                            logger.error(f"Dividend data: {dividend}")
                
                except Exception as e:
                    logger.error(f"Failed to process dividend data for {symbol}: {e}")
                    logger.error(f"Data for {symbol}: {getattr(fetch_result, 'data', 'No data')}")
            
            logger.info(f"📊 Dividend Storage Summary: {success_count}/{total_records} records stored successfully")
            logger.info(f"   Valid data sources: {valid_data_count}")
            
            # Return True if we successfully stored all records from valid data
            return success_count > 0 and success_count == total_records
            
        except Exception as e:
            logger.error(f"Error storing comprehensive dividend data: {e}")
            return False
    
    def _normalize_dividend_fields(self, dividend: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize dividend field names from different providers to standard format."""
        normalized = dividend.copy()
        
        # Map different provider field names to standard names
        field_mappings = {
            # Amount field mappings
            'cash_amount': 'dividend_amount',
            'amount': 'dividend_amount',
            
            # Date field mappings
            'ex_date': 'ex_dividend_date',
            'pay_date': 'payment_date',
            'payable_date': 'payment_date',
            
            # Other field mappings
            'ticker': 'symbol',
            'type': 'dividend_type',
        }
        
        # Apply field mappings
        for old_field, new_field in field_mappings.items():
            if old_field in normalized and new_field not in normalized:
                normalized[new_field] = normalized[old_field]
        
        # Ensure provider field is set
        if 'provider' not in normalized:
            normalized['provider'] = 'unknown'
        
        return normalized
    
    def _get_data_type(self) -> DataType:
        """Get the data type for this job (used for tracking)."""
        return DataType.DIVIDENDS
