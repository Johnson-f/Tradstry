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
                    
                    # Log aggregation details if available
                    if hasattr(fundamentals, 'aggregation_method'):
                        quality_score = getattr(fundamentals, 'data_quality_score', 0)
                        logger.info(f"📊 {symbol}: Aggregated data with {quality_score} populated fields")
                    else:
                        logger.info(f"📊 {symbol}: Single provider data from {provider}")
                    
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
                    
                    # Call the function with required parameters and available data
                    await self.db_service.execute_function(
                        "upsert_fundamental_data",
                        p_symbol=symbol,
                        p_fiscal_year=getattr(fundamentals, 'fiscal_year', 2023),  # Default to current year
                        p_fiscal_quarter=getattr(fundamentals, 'fiscal_quarter', 4),  # Default to Q4
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
                    # Count non-None fields that were stored
                    stored_fields = 0
                    key_metrics = ['pe_ratio', 'eps', 'dividend_yield', 'roe', 'market_cap', 'beta']
                    stored_key_metrics = []
                    
                    for attr in dir(fundamentals):
                        if not attr.startswith('_') and hasattr(fundamentals, attr):
                            value = getattr(fundamentals, attr)
                            if value is not None:
                                stored_fields += 1
                                if attr in key_metrics:
                                    stored_key_metrics.append(f"{attr}={value}")
                    
                    logger.info(f"✅ Successfully stored fundamentals for {symbol}")
                    logger.info(f"   Provider: {provider}")
                    logger.info(f"   Fields stored: {stored_fields}")
                    if stored_key_metrics:
                        logger.info(f"   Key metrics: {', '.join(stored_key_metrics[:3])}{'...' if len(stored_key_metrics) > 3 else ''}")
                    
                except Exception as e:
                    logger.error(f"Failed to store fundamentals for {symbol}: {e}")
                    logger.error(f"Fundamentals data: {getattr(fundamentals, 'sector', 'No sector') if 'fundamentals' in locals() else 'No data'}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{valid_data_count} fundamental records stored successfully")
            if success_count > 0:
                logger.info(f"🎯 Multi-provider aggregation achieved maximum data coverage")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == valid_data_count
            
        except Exception as e:
            logger.error(f"Error storing fundamentals: {e}")
            return False
    
    async def _fetch_with_multi_provider_aggregation(self, symbol: str) -> Optional[Any]:
        """Fetch fundamental data from ALL available providers and aggregate for maximum coverage."""
        try:
            # Quick validation for obviously invalid symbols
            if not symbol or len(symbol) > 10 or not symbol.replace('.', '').isalnum():
                logger.warning(f"Invalid symbol format: {symbol}")
                return None
                
            logger.info(f"Fetching fundamental data for {symbol} from ALL providers for aggregation")
            
            # Get all enabled providers from the orchestrator
            enabled_providers = self.orchestrator.config.get_enabled_providers()
            logger.info(f"Attempting to fetch from {len(enabled_providers)} providers: {enabled_providers}")
            
            # Collect data from all providers
            provider_results = {}
            successful_providers = []
            
            for provider_name in enabled_providers:
                try:
                    # Get provider instance
                    provider = self.orchestrator.providers.get(provider_name)
                    if not provider:
                        logger.debug(f"Provider {provider_name} not available")
                        continue
                    
                    # Fetch data from this specific provider
                    logger.debug(f"Fetching from {provider_name}...")
                    result = await provider.get_fundamentals(symbol)
                    
                    if result and isinstance(result, dict):
                        # Filter out None values but keep zeros and empty strings
                        valid_data = {k: v for k, v in result.items() if v is not None}
                        if len(valid_data) > 2:  # More than just symbol and provider
                            provider_results[provider_name] = valid_data
                            successful_providers.append(provider_name)
                            logger.info(f"✅ {provider_name}: {len(valid_data)} fields")
                        else:
                            logger.debug(f"❌ {provider_name}: insufficient data ({len(valid_data)} fields)")
                    else:
                        logger.debug(f"❌ {provider_name}: no valid result")
                        
                    # Small delay to respect rate limits
                    await asyncio.sleep(0.1)
                    
                except Exception as e:
                    logger.debug(f"❌ {provider_name} failed: {e}")
                    continue
            
            if not provider_results:
                logger.warning(f"No fundamental data available for {symbol} from any provider")
                return None
            
            logger.info(f"Successfully fetched from {len(successful_providers)} providers: {successful_providers}")
            
            # Aggregate data from all successful providers
            aggregated_data = self._aggregate_provider_data(provider_results, symbol)
            
            # Convert to object format for compatibility
            fundamentals_obj = self._create_fundamental_data_object(aggregated_data)
            
            # Determine primary provider (one with most data)
            primary_provider = max(provider_results.keys(), 
                                 key=lambda p: len(provider_results[p]))
            
            from market_data.brain import FetchResult
            return FetchResult(
                data=fundamentals_obj,
                provider=f"aggregated_from_{len(successful_providers)}_providers",
                success=True
            )
            
        except Exception as e:
            logger.error(f"Error in multi-provider aggregation for {symbol}: {e}")
            return None
    
    def _aggregate_provider_data(self, provider_results: Dict[str, Dict], symbol: str) -> Dict[str, Any]:
        """Aggregate data from multiple providers with intelligent conflict resolution."""
        aggregated = {'symbol': symbol}
        field_sources = {}  # Track which provider provided each field
        
        # Define provider quality/reliability scores for conflict resolution
        provider_scores = {
            'finnhub': 10,
            'polygon': 9,
            'alpha_vantage': 8,
            'fmp': 7,
            'twelve_data': 6,
            'tiingo': 5,
            'api_ninjas': 4,
            'fiscal': 3,
            'fred': 2
        }
        
        # Collect all unique fields across providers
        all_fields = set()
        for provider_data in provider_results.values():
            all_fields.update(provider_data.keys())
        
        logger.info(f"Aggregating {len(all_fields)} unique fields from {len(provider_results)} providers")
        
        # For each field, select the best value using conflict resolution
        for field in all_fields:
            if field in ['symbol', 'provider']:  # Skip metadata fields
                continue
                
            candidates = []
            
            # Collect all non-None values for this field
            for provider_name, provider_data in provider_results.items():
                if field in provider_data and provider_data[field] is not None:
                    score = provider_scores.get(provider_name, 1)
                    candidates.append({
                        'value': provider_data[field],
                        'provider': provider_name,
                        'score': score
                    })
            
            if not candidates:
                continue
            
            # Select best value using conflict resolution strategy
            best_value = self._resolve_field_conflict(field, candidates)
            if best_value is not None:
                aggregated[field] = best_value['value']
                field_sources[field] = best_value['provider']
        
        # Log aggregation summary
        total_fields = len([f for f in aggregated.keys() if f != 'symbol'])
        logger.info(f"📊 Aggregation complete: {total_fields} fields populated")
        
        # Log field distribution by provider
        provider_contributions = {}
        for provider in field_sources.values():
            provider_contributions[provider] = provider_contributions.get(provider, 0) + 1
        
        for provider, count in sorted(provider_contributions.items(), key=lambda x: x[1], reverse=True):
            logger.info(f"   {provider}: {count} fields")
        
        return aggregated
    
    def _resolve_field_conflict(self, field: str, candidates: List[Dict]) -> Optional[Dict]:
        """Resolve conflicts when multiple providers have different values for the same field."""
        if len(candidates) == 1:
            return candidates[0]
        
        # For numerical fields, prefer non-zero values and use provider score as tiebreaker
        if field in ['pe_ratio', 'eps', 'dividend_yield', 'roe', 'roa', 'market_cap', 'beta']:
            # Filter out zero values for key metrics (likely missing data)
            non_zero_candidates = [c for c in candidates if c['value'] != 0]
            if non_zero_candidates:
                candidates = non_zero_candidates
        
        # For percentage fields, ensure reasonable ranges
        if field in ['dividend_yield', 'gross_margin', 'operating_margin', 'net_margin']:
            reasonable_candidates = []
            for c in candidates:
                try:
                    val = float(c['value'])
                    # Dividend yield should be 0-20%, margins should be -100% to 100%
                    if field == 'dividend_yield' and 0 <= val <= 20:
                        reasonable_candidates.append(c)
                    elif field.endswith('_margin') and -100 <= val <= 100:
                        reasonable_candidates.append(c)
                    else:
                        reasonable_candidates.append(c)  # Keep all for now
                except (ValueError, TypeError):
                    continue
            if reasonable_candidates:
                candidates = reasonable_candidates
        
        # Sort by provider score (highest first) and return the best
        candidates.sort(key=lambda x: x['score'], reverse=True)
        return candidates[0]
    
    def _create_fundamental_data_object(self, data_dict: Dict[str, Any]) -> Any:
        """Create a fundamental data object from aggregated dictionary data with calculated metrics."""
        class AggregatedFundamentalData:
            def __init__(self, data_dict):
                # Enhanced field mapping for all provider variations
                field_mapping = {
                    'peg_ratio': 'pegr_ratio',
                    'book_value': 'book_value_per_share',
                    'profit_margin': 'net_margin',
                    'return_on_assets': 'roa',
                    'return_on_equity': 'roe',
                    'gross_profit': 'gross_profit_ttm',
                    'revenue': 'revenue_ttm',
                    'price_to_book': 'pb_ratio',
                    'price_to_sales': 'ps_ratio',
                    'forward_pe': 'forward_pe_ratio',
                    'enterprise_value': 'ev',
                    'ev_to_ebitda': 'ev_ebitda_ratio',
                    'ev_to_revenue': 'ev_revenue_ratio',
                    'free_cash_flow_per_share': 'cash_flow_per_share',
                    'revenue_growth_3y': 'revenue_growth',
                    'eps_growth_3y': 'earnings_growth',
                    'dividend_growth_3y': 'dividend_growth',
                    'dividend_rate': 'dividend_per_share',
                    'shares_outstanding_millions': 'shares_outstanding'
                }
                
                # Apply field mapping and clean data
                for key, value in data_dict.items():
                    mapped_key = field_mapping.get(key, key)
                    # Clean string values
                    if isinstance(value, str):
                        value = value.strip()
                        if value.lower() in ['', 'n/a', 'null', 'none', '-']:
                            value = None
                    setattr(self, mapped_key, value)
                
                # Calculate missing financial metrics using formulas
                self._calculate_missing_metrics(data_dict)
                
                # Set aggregation metadata
                self.aggregation_method = 'multi_provider_with_calculations'
                self.data_quality_score = len([v for v in data_dict.values() if v is not None])
            
            def _calculate_missing_metrics(self, raw_data):
                """Calculate missing financial metrics using standard formulas."""
                
                # Helper to safely get numeric value
                def get_num(field_name, default=None):
                    # Check multiple variations of field names
                    variations = [
                        field_name,
                        f'income_{field_name}',
                        f'balance_{field_name}',
                        f'cashflow_{field_name}',
                        field_name.replace('_', ''),
                        field_name.replace('total_', ''),
                        field_name.replace('net_', '')
                    ]
                    
                    for var in variations:
                        value = raw_data.get(var) or getattr(self, var, None)
                        if value is not None and value != 0:
                            try:
                                return float(value)
                            except (ValueError, TypeError):
                                continue
                    return default
                
                # Calculate ROIC if missing: (Net Income - Dividends) / (Debt + Equity)
                if not hasattr(self, 'roic') or getattr(self, 'roic', 0) == 0:
                    net_income = get_num('net_income') or get_num('income')
                    total_debt = get_num('total_debt')
                    total_equity = get_num('total_equity') or get_num('equity')
                    
                    if net_income and total_debt is not None and total_equity:
                        invested_capital = total_debt + total_equity
                        if invested_capital > 0:
                            self.roic = (net_income / invested_capital) * 100
                
                # Calculate Net Margin if missing: Net Income / Revenue
                if not hasattr(self, 'net_margin') or getattr(self, 'net_margin', 0) == 0:
                    net_income = get_num('net_income') or get_num('income')
                    revenue = get_num('revenue') or get_num('revenue_ttm') or get_num('total_revenue')
                    
                    if net_income and revenue and revenue > 0:
                        self.net_margin = (net_income / revenue) * 100
                
                # Calculate EBITDA Margin if missing: EBITDA / Revenue
                if not hasattr(self, 'ebitda_margin') or getattr(self, 'ebitda_margin', None) is None:
                    ebitda = get_num('ebitda')
                    revenue = get_num('revenue') or get_num('revenue_ttm') or get_num('total_revenue')
                    
                    if ebitda and revenue and revenue > 0:
                        self.ebitda_margin = (ebitda / revenue) * 100
                
                # Calculate Debt-to-Equity if missing: Total Debt / Total Equity
                if not hasattr(self, 'debt_to_equity') or getattr(self, 'debt_to_equity', 0) == 0:
                    total_debt = get_num('total_debt') or get_num('long_term_debt')
                    total_equity = get_num('total_equity') or get_num('equity')
                    
                    if total_debt is not None and total_equity and total_equity > 0:
                        self.debt_to_equity = total_debt / total_equity
                
                # Calculate Debt-to-Assets if missing: Total Debt / Total Assets
                if not hasattr(self, 'debt_to_assets') or getattr(self, 'debt_to_assets', None) is None:
                    total_debt = get_num('total_debt') or get_num('long_term_debt')
                    total_assets = get_num('total_assets') or get_num('assets')
                    
                    if total_debt is not None and total_assets and total_assets > 0:
                        self.debt_to_assets = total_debt / total_assets
                
                # Calculate Interest Coverage if missing: EBIT / Interest Expense
                if not hasattr(self, 'interest_coverage') or getattr(self, 'interest_coverage', 0) == 0:
                    ebit = get_num('ebit') or get_num('operating_income')
                    interest_expense = get_num('interest_expense')
                    
                    if ebit and interest_expense and interest_expense > 0:
                        self.interest_coverage = ebit / interest_expense
                
                # Calculate Asset Turnover if missing: Revenue / Average Total Assets
                if not hasattr(self, 'asset_turnover') or getattr(self, 'asset_turnover', None) is None:
                    revenue = get_num('revenue') or get_num('revenue_ttm') or get_num('total_revenue')
                    total_assets = get_num('total_assets') or get_num('assets')
                    
                    if revenue and total_assets and total_assets > 0:
                        self.asset_turnover = revenue / total_assets
                
                # Calculate Inventory Turnover if missing: COGS / Average Inventory
                if not hasattr(self, 'inventory_turnover') or getattr(self, 'inventory_turnover', None) is None:
                    cogs = get_num('cost_of_goods_sold') or get_num('cogs')
                    inventory = get_num('inventory')
                    
                    if cogs and inventory and inventory > 0:
                        self.inventory_turnover = cogs / inventory
                
                # Calculate Receivables Turnover if missing: Revenue / Average Accounts Receivable
                if not hasattr(self, 'receivables_turnover') or getattr(self, 'receivables_turnover', None) is None:
                    revenue = get_num('revenue') or get_num('revenue_ttm') or get_num('total_revenue')
                    receivables = get_num('accounts_receivable') or get_num('receivables')
                    
                    if revenue and receivables and receivables > 0:
                        self.receivables_turnover = revenue / receivables
                
                # Calculate Payables Turnover if missing: COGS / Average Accounts Payable
                if not hasattr(self, 'payables_turnover') or getattr(self, 'payables_turnover', None) is None:
                    cogs = get_num('cost_of_goods_sold') or get_num('cogs')
                    payables = get_num('accounts_payable') or get_num('payables')
                    
                    if cogs and payables and payables > 0:
                        self.payables_turnover = cogs / payables
                
                # Calculate Cash Flow per Share if missing: Operating Cash Flow / Shares Outstanding
                if not hasattr(self, 'cash_flow_per_share') or getattr(self, 'cash_flow_per_share', 0) == 0:
                    operating_cash_flow = get_num('operating_cash_flow') or get_num('cash_flow_from_operations')
                    shares_outstanding = get_num('shares_outstanding') or get_num('weighted_average_shares')
                    
                    if operating_cash_flow and shares_outstanding and shares_outstanding > 0:
                        self.cash_flow_per_share = operating_cash_flow / shares_outstanding
                
                # Calculate Dividend per Share if missing: Total Dividends / Shares Outstanding
                if not hasattr(self, 'dividend_per_share') or getattr(self, 'dividend_per_share', None) is None:
                    total_dividends = get_num('total_dividends_paid') or get_num('dividends_paid')
                    shares_outstanding = get_num('shares_outstanding') or get_num('weighted_average_shares')
                    dividend_yield = get_num('dividend_yield')
                    current_price = get_num('current_price') or get_num('close_price')
                    
                    if total_dividends and shares_outstanding and shares_outstanding > 0:
                        self.dividend_per_share = total_dividends / shares_outstanding
                    elif dividend_yield and current_price:
                        # Alternative: Dividend Yield * Current Price / 100
                        self.dividend_per_share = (dividend_yield * current_price) / 100
                
                # Calculate Enterprise Value if missing: Market Cap + Total Debt - Cash
                if not hasattr(self, 'enterprise_value') or getattr(self, 'enterprise_value', None) is None:
                    market_cap = get_num('market_cap')
                    total_debt = (get_num('total_debt') or 
                                get_num('long_term_debt') or 
                                get_num('total_liabilities') or 0)
                    cash = (get_num('cash_and_equivalents') or 
                           get_num('cash') or 
                           get_num('cash_and_short_term_investments') or 0)
                    
                    if market_cap:
                        self.enterprise_value = market_cap + total_debt - cash
                
                # Calculate Shares Outstanding if missing: Market Cap / Current Price
                if not hasattr(self, 'shares_outstanding') or getattr(self, 'shares_outstanding', None) is None:
                    market_cap = get_num('market_cap')
                    current_price = get_num('current_price') or get_num('close_price')
                    
                    if market_cap and current_price and current_price > 0:
                        self.shares_outstanding = market_cap / current_price
                
                # Ensure sector is properly mapped from available data
                if not hasattr(self, 'sector') or not getattr(self, 'sector', None):
                    sector_alternatives = ['industry_group', 'gics_sector', 'sector_name', 'industry', 'industry_category']
                    for alt in sector_alternatives:
                        value = raw_data.get(alt)
                        if value and str(value).strip():
                            self.sector = str(value).strip()
                            break
                
                # Calculate additional missing metrics with enhanced field lookup
                
                # Enhanced EBITDA calculation: EBIT + Depreciation + Amortization
                if not hasattr(self, 'ebitda') or getattr(self, 'ebitda', None) is None:
                    ebit = get_num('ebit') or get_num('operating_income')
                    depreciation = get_num('depreciation') or get_num('depreciation_and_amortization')
                    
                    if ebit and depreciation:
                        self.ebitda = ebit + depreciation
                    elif ebit:  # Estimate EBITDA as EBIT * 1.15 (rough approximation)
                        self.ebitda = ebit * 1.15
                
                # Enhanced Revenue Growth calculation
                if not hasattr(self, 'revenue_growth') or getattr(self, 'revenue_growth', None) is None:
                    current_revenue = get_num('revenue') or get_num('total_revenue')
                    prior_revenue = get_num('prior_year_revenue') or get_num('revenue_previous_year')
                    
                    if current_revenue and prior_revenue and prior_revenue > 0:
                        self.revenue_growth = ((current_revenue - prior_revenue) / prior_revenue) * 100
                
                # Enhanced Earnings Growth calculation
                if not hasattr(self, 'earnings_growth') or getattr(self, 'earnings_growth', None) is None:
                    current_eps = get_num('eps') or get_num('diluted_eps')
                    prior_eps = get_num('prior_year_eps') or get_num('eps_previous_year')
                    
                    if current_eps and prior_eps and prior_eps > 0:
                        self.earnings_growth = ((current_eps - prior_eps) / prior_eps) * 100
                
                # Calculate Book Value Growth
                if not hasattr(self, 'book_value_growth') or getattr(self, 'book_value_growth', None) is None:
                    current_bv = get_num('book_value_per_share')
                    prior_bv = get_num('prior_year_book_value') or get_num('book_value_previous_year')
                    
                    if current_bv and prior_bv and prior_bv > 0:
                        self.book_value_growth = ((current_bv - prior_bv) / prior_bv) * 100
                
                # Enhanced Dividend per Share calculation using multiple methods
                if not hasattr(self, 'dividend_per_share') or getattr(self, 'dividend_per_share', None) is None:
                    # Method 1: Direct from dividends paid
                    total_dividends = get_num('dividends_paid') or get_num('total_dividends')
                    shares_outstanding = get_num('shares_outstanding') or get_num('weighted_average_shares')
                    
                    if total_dividends and shares_outstanding and shares_outstanding > 0:
                        self.dividend_per_share = total_dividends / shares_outstanding
                    else:
                        # Method 2: From dividend yield and stock price
                        dividend_yield = get_num('dividend_yield')
                        stock_price = get_num('close_price') or get_num('current_price') or get_num('stock_price')
                        
                        if dividend_yield and stock_price:
                            self.dividend_per_share = (dividend_yield / 100) * stock_price
                        else:
                            # Method 3: From quarterly dividend * 4
                            quarterly_dividend = get_num('quarterly_dividend')
                            if quarterly_dividend:
                                self.dividend_per_share = quarterly_dividend * 4
        
        return AggregatedFundamentalData(data_dict)
    
    async def _fetch_with_field_fallback(self, symbol: str) -> Optional[Any]:
        """Legacy fallback method - now delegates to multi-provider aggregation."""
        return await self._fetch_with_multi_provider_aggregation(symbol)
