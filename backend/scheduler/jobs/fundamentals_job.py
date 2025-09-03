"""
Fundamental data fetching job.
Fetches financial ratios and fundamental metrics.
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


class FundamentalsJob(BaseMarketDataJob):
    """Job for fetching and storing fundamental data."""
    
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
        return DataType.FUNDAMENTALS
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch fundamental data for given symbols with provider fallback."""
        try:
            logger.info(f"Fetching fundamentals for {len(symbols)} symbols")
            
            # Use enhanced tracking with fallback chain if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fallback chain strategy")
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=symbols,
                    fetch_method='get_fundamentals',
                    strategy=FetchStrategy.FALLBACK_CHAIN
                )
            
            # Fallback to original implementation with enhanced field-level fallback
            logger.info("Using basic fetch with field-level provider fallback")
            fundamentals_data = {}
            
            for symbol in symbols:
                try:
                    # Get fundamentals with field-level fallback
                    merged_fundamentals = await self._fetch_with_field_fallback(symbol)
                    if merged_fundamentals:
                        fundamentals_data[symbol] = merged_fundamentals
                        logger.info(f"Successfully fetched fundamentals for {symbol}")
                    else:
                        logger.warning(f"No valid fundamental data returned for {symbol}")
                    
                    await asyncio.sleep(0.1)  # Rate limiting
                    
                except Exception as e:
                    logger.error(f"Failed to fetch fundamentals for {symbol}: {e}")
                    continue
            
            return fundamentals_data
            
        except Exception as e:
            logger.error(f"Error fetching fundamentals: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store fundamental data using database upsert function."""
        if not data:
            return True
        
        try:
            success_count = 0
            valid_data_count = 0
            
            for symbol, fetch_result in data.items():
                try:
                    # Extract fundamentals data from FetchResult
                    if not fetch_result.success or not fetch_result.data:
                        logger.warning(f"No valid fundamental data for {symbol}")
                        continue
                    
                    valid_data_count += 1
                    fundamentals = fetch_result.data
                    provider = fetch_result.provider
                    
                    # Helper function to safely convert values
                    def safe_convert(value, convert_func, default=None):
                        if value is None or value == '' or value == 0:
                            return default
                        try:
                            return convert_func(value)
                        except (ValueError, TypeError):
                            return default
                    
                    # Extract exchange information if available
                    exchange_info = getattr(fundamentals, 'exchange', {}) if hasattr(fundamentals, 'exchange') else {}
                    
                    await self.db_service.execute_function(
                        "upsert_fundamental_data",
                        p_symbol=symbol,
                        p_fiscal_year=getattr(fundamentals, 'fiscal_year', None),
                        p_fiscal_quarter=getattr(fundamentals, 'fiscal_quarter', None),
                        p_data_provider=provider,
                        
                        # Exchange parameters for automatic exchange handling
                        p_exchange_code=exchange_info.get('code') or getattr(fundamentals, 'exchange_code', None),
                        p_exchange_name=exchange_info.get('name') or getattr(fundamentals, 'exchange_name', None),
                        p_exchange_country=exchange_info.get('country') or getattr(fundamentals, 'country', None),
                        p_exchange_timezone=exchange_info.get('timezone') or getattr(fundamentals, 'timezone', None),
                        
                        # Fundamental parameters matching SQL function signature
                        p_sector=getattr(fundamentals, 'sector', None),
                        p_pe_ratio=safe_convert(getattr(fundamentals, 'pe_ratio', None), float),
                        p_pb_ratio=safe_convert(getattr(fundamentals, 'pb_ratio', None) or getattr(fundamentals, 'price_to_book', None), float),
                        p_ps_ratio=safe_convert(getattr(fundamentals, 'ps_ratio', None) or getattr(fundamentals, 'price_to_sales', None), float),
                        p_pegr_ratio=safe_convert(getattr(fundamentals, 'pegr_ratio', None) or getattr(fundamentals, 'peg_ratio', None), float),
                        p_dividend_yield=safe_convert(getattr(fundamentals, 'dividend_yield', None), float),
                        p_roe=safe_convert(getattr(fundamentals, 'roe', None), float),
                        p_roa=safe_convert(getattr(fundamentals, 'roa', None), float),
                        p_roic=safe_convert(getattr(fundamentals, 'roic', None), float),
                        p_gross_margin=safe_convert(getattr(fundamentals, 'gross_margin', None), float),
                        p_operating_margin=safe_convert(getattr(fundamentals, 'operating_margin', None), float),
                        p_net_margin=safe_convert(getattr(fundamentals, 'net_margin', None), float),
                        p_ebitda_margin=safe_convert(getattr(fundamentals, 'ebitda_margin', None), float),
                        p_current_ratio=safe_convert(getattr(fundamentals, 'current_ratio', None), float),
                        p_quick_ratio=safe_convert(getattr(fundamentals, 'quick_ratio', None), float),
                        p_debt_to_equity=safe_convert(getattr(fundamentals, 'debt_to_equity', None), float),
                        p_debt_to_assets=safe_convert(getattr(fundamentals, 'debt_to_assets', None), float),
                        p_interest_coverage=safe_convert(getattr(fundamentals, 'interest_coverage', None), float),
                        p_asset_turnover=safe_convert(getattr(fundamentals, 'asset_turnover', None), float),
                        p_inventory_turnover=safe_convert(getattr(fundamentals, 'inventory_turnover', None), float),
                        p_receivables_turnover=safe_convert(getattr(fundamentals, 'receivables_turnover', None), float),
                        p_payables_turnover=safe_convert(getattr(fundamentals, 'payables_turnover', None), float),
                        p_revenue_growth=safe_convert(getattr(fundamentals, 'revenue_growth', None) or getattr(fundamentals, 'quarterly_revenue_growth', None), float),
                        p_earnings_growth=safe_convert(getattr(fundamentals, 'earnings_growth', None) or getattr(fundamentals, 'quarterly_earnings_growth', None), float),
                        p_book_value_growth=safe_convert(getattr(fundamentals, 'book_value_growth', None), float),
                        p_dividend_growth=safe_convert(getattr(fundamentals, 'dividend_growth', None), float),
                        p_eps=safe_convert(getattr(fundamentals, 'eps', None) or getattr(fundamentals, 'diluted_eps_ttm', None), float),
                        p_book_value_per_share=safe_convert(getattr(fundamentals, 'book_value_per_share', None), float),
                        p_revenue_per_share=safe_convert(getattr(fundamentals, 'revenue_per_share', None), float),
                        p_cash_flow_per_share=safe_convert(getattr(fundamentals, 'cash_flow_per_share', None), float),
                        p_dividend_per_share=safe_convert(getattr(fundamentals, 'dividend_per_share', None), float),
                        p_market_cap=safe_convert(getattr(fundamentals, 'market_cap', None), int),
                        p_enterprise_value=safe_convert(getattr(fundamentals, 'enterprise_value', None), int),
                        p_beta=safe_convert(getattr(fundamentals, 'beta', None), float),
                        p_shares_outstanding=safe_convert(getattr(fundamentals, 'shares_outstanding', None), int),
                        p_period_end_date=getattr(fundamentals, 'period_end_date', None),
                        p_report_type=getattr(fundamentals, 'report_type', 'quarterly')
                    )
                    success_count += 1
                    logger.info(f"✅ Successfully stored fundamentals for {symbol}")
                    logger.info(f"   Provider: {provider}")
                    
                except Exception as e:
                    logger.error(f"Failed to store fundamentals for {symbol}: {e}")
                    logger.error(f"Fundamentals data: {getattr(fundamentals, 'sector', 'No sector') if 'fundamentals' in locals() else 'No data'}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{valid_data_count} fundamental records stored successfully")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == valid_data_count
            
        except Exception as e:
            logger.error(f"Error storing fundamentals: {e}")
            return False
    
    async def _fetch_with_field_fallback(self, symbol: str) -> Optional[Any]:
        """Fetch fundamental data by merging fields from ALL providers for comprehensive coverage."""
        try:
            # Quick validation for obviously invalid symbols
            if not symbol or len(symbol) > 10 or not symbol.replace('.', '').isalnum():
                logger.warning(f"Invalid symbol format: {symbol}")
                return None
                
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for fundamental data aggregation")
                return None
            
            logger.info(f"Starting comprehensive fundamental data aggregation for {symbol} across {len(available_providers)} providers")
            
            # Initialize merged fundamentals object with all possible fields
            merged_fundamentals = {}
            provider_contributions = {}
            
            # Query ALL available providers to get comprehensive fundamental data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for {symbol} fundamentals")
                        fundamentals_data = await provider.get_fundamentals(symbol)
                        
                        if fundamentals_data is not None:
                            provider_contributions[provider_name] = 0
                            
                            # Define all fundamental fields we want to merge
                            fundamental_fields = [
                                'fiscal_year', 'fiscal_quarter', 'sector', 'pe_ratio', 'pb_ratio', 'price_to_book',
                                'ps_ratio', 'price_to_sales', 'pegr_ratio', 'peg_ratio', 'dividend_yield',
                                'roe', 'roa', 'roic', 'gross_margin', 'operating_margin', 'net_margin', 'ebitda_margin',
                                'current_ratio', 'quick_ratio', 'debt_to_equity', 'debt_to_assets', 'interest_coverage',
                                'asset_turnover', 'inventory_turnover', 'receivables_turnover', 'payables_turnover',
                                'revenue_growth', 'quarterly_revenue_growth', 'earnings_growth', 'quarterly_earnings_growth',
                                'book_value_growth', 'dividend_growth', 'eps', 'diluted_eps_ttm', 'book_value_per_share',
                                'revenue_per_share', 'cash_flow_per_share', 'dividend_per_share', 'market_cap',
                                'enterprise_value', 'beta', 'shares_outstanding', 'period_end_date', 'report_type',
                                'exchange', 'exchange_code', 'exchange_name', 'country', 'timezone'
                            ]
                            
                            # Merge fields from this provider
                            for field in fundamental_fields:
                                provider_value = getattr(fundamentals_data, field, None)
                                if provider_value is not None and provider_value != '' and provider_value != 0:
                                    if field not in merged_fundamentals or merged_fundamentals[field] is None:
                                        merged_fundamentals[field] = provider_value
                                        provider_contributions[provider_name] += 1
                                        logger.debug(f"  {field}: {provider_value} (from {provider_name})")
                            
                            logger.info(f"{provider_name} contributed {provider_contributions[provider_name]} fundamental fields")
                        else:
                            logger.debug(f"No fundamental data from {provider_name} for {symbol}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for {symbol} fundamentals: {e}")
                    continue
            
            if not merged_fundamentals:
                logger.warning(f"No providers returned valid fundamental data for {symbol}")
                return None
            
            # Create result with all contributing providers listed
            contributing_providers = [p for p, count in provider_contributions.items() if count > 0]
            provider_string = f"{'+'.join(contributing_providers)}"
            
            # Create a simple object to hold the merged data
            class MergedFundamentals:
                def __init__(self, data_dict):
                    for key, value in data_dict.items():
                        setattr(self, key, value)
            
            merged_obj = MergedFundamentals(merged_fundamentals)
            
            from market_data.brain import FetchResult
            comprehensive_result = FetchResult(
                data=merged_obj,
                provider=provider_string,
                success=True
            )
            
            total_fields = len([v for v in merged_fundamentals.values() if v is not None])
            logger.info(f"Fundamental aggregation for {symbol}: {total_fields} fields from {len(contributing_providers)} providers")
            logger.info(f"Provider contributions: {provider_contributions}")
            
            return comprehensive_result
            
        except Exception as e:
            logger.error(f"Error in comprehensive fundamental data aggregation for {symbol}: {e}")
            return None
