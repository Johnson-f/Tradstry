"""
Dividend data fetching job.
Fetches dividend announcements and payment data.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class DividendDataJob(BaseMarketDataJob):
    """Job for fetching and storing dividend data."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch comprehensive dividend data from all providers for given symbols."""
        try:
            logger.info(f"Fetching comprehensive dividend data for {len(symbols)} symbols")
            dividend_data = {}
            
            for symbol in symbols:
                try:
                    # Use comprehensive aggregation approach
                    result = await self._fetch_with_comprehensive_aggregation(symbol)
                    if result:
                        dividend_data[symbol] = result
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
            
            # Get all available providers
            available_providers = self.orchestrator.config.get_enabled_providers()
            if not available_providers:
                logger.warning("No providers available for dividend data")
                return None
            
            logger.info(f"Aggregating dividend data for {symbol} from {len(available_providers)} providers")
            
            all_dividends = []
            successful_providers = []
            
            # Query ALL providers and collect their dividend data
            for provider_name in available_providers:
                try:
                    provider = self.orchestrator.providers.get(provider_name)
                    if not provider or not hasattr(provider, 'get_dividend_data'):
                        continue
                    
                    logger.debug(f"Fetching dividend data for {symbol} from {provider_name}")
                    provider_dividends = await provider.get_dividend_data(symbol)
                    
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
                    
                    # Small delay between providers to respect rate limits
                    await asyncio.sleep(0.1)
                    
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
            
            # Helper function to safely convert values
            def safe_convert(value, convert_func, default=None):
                if value is None or value == '' or value == 0:
                    return default
                try:
                    return convert_func(value)
                except (ValueError, TypeError):
                    return default
            
            for symbol, dividends in data.items():
                if not isinstance(dividends, list):
                    logger.warning(f"Invalid dividend data format for {symbol}: expected list")
                    continue
                
                logger.info(f"Storing {len(dividends)} dividend records for {symbol}")
                
                for dividend in dividends:
                    try:
                        total_records += 1
                        
                        # Validate required fields
                        if not dividend.get('ex_dividend_date') or not dividend.get('dividend_amount'):
                            logger.warning(f"Missing required fields for {symbol} dividend: {dividend}")
                            continue
                        
                        # Extract exchange information - handle both string and dict formats
                        exchange_info = dividend.get('exchange', {})
                        if isinstance(exchange_info, str):
                            exchange_code = exchange_info
                            exchange_name = exchange_info
                            exchange_country = dividend.get('country')
                            exchange_timezone = None
                        else:
                            exchange_code = exchange_info.get('code') or dividend.get('exchange_code')
                            exchange_name = exchange_info.get('name') or dividend.get('exchange_name')
                            exchange_country = exchange_info.get('country') or dividend.get('country')
                            exchange_timezone = exchange_info.get('timezone') or dividend.get('timezone')
                        
                        # Prepare comprehensive parameters matching your upsert function exactly
                        params = {
                            # Required parameters
                            "p_symbol": symbol,
                            "p_data_provider": dividend.get('provider', 'unknown'),
                            "p_ex_dividend_date": dividend.get('ex_dividend_date'),
                            "p_dividend_amount": safe_convert(
                                dividend.get('dividend_amount') or dividend.get('amount'), 
                                float
                            ),
                            
                            # Exchange parameters for automatic exchange handling
                            "p_exchange_code": exchange_code,
                            "p_exchange_name": exchange_name,
                            "p_exchange_country": exchange_country,
                            "p_exchange_timezone": exchange_timezone,
                            
                            # Comprehensive dividend parameters matching SQL function signature
                            "p_declaration_date": dividend.get('declaration_date'),
                            "p_record_date": dividend.get('record_date'),
                            "p_payment_date": dividend.get('payment_date'),
                            "p_dividend_type": dividend.get('dividend_type') or dividend.get('type', 'regular'),
                            "p_currency": dividend.get('currency', 'USD'),
                            "p_frequency": dividend.get('frequency'),
                            "p_dividend_status": dividend.get('dividend_status', 'active'),
                            "p_dividend_yield": safe_convert(dividend.get('dividend_yield'), float),
                            "p_payout_ratio": safe_convert(dividend.get('payout_ratio'), float),
                            "p_consecutive_years": safe_convert(dividend.get('consecutive_years'), int),
                            "p_qualified_dividend": dividend.get('qualified_dividend', True),
                            "p_tax_rate": safe_convert(dividend.get('tax_rate'), float),
                            "p_fiscal_year": safe_convert(dividend.get('fiscal_year'), int),
                            "p_fiscal_quarter": safe_convert(dividend.get('fiscal_quarter'), int)
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
                        result = await self.db_service.execute_function("upsert_dividend_data", **params)
                        
                        if result is not None:
                            success_count += 1
                            logger.debug(f"✅ Stored dividend for {symbol} (ID: {result}) from {dividend.get('provider')}")
                        else:
                            logger.error(f"❌ Failed to store dividend for {symbol}: function returned None")
                        
                    except Exception as e:
                        logger.error(f"Failed to store dividend for {symbol}: {e}")
                        logger.error(f"Dividend data: {dividend}")
            
            logger.info(f"📊 Dividend Storage Summary: {success_count}/{total_records} records stored successfully")
            
            # Return True if we successfully stored all records
            return success_count > 0 and success_count == total_records
            
        except Exception as e:
            logger.error(f"Error storing comprehensive dividend data: {e}")
            return False
