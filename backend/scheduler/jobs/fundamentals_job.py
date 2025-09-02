"""
Fundamental data fetching job.
Fetches financial ratios and fundamental metrics.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class FundamentalsJob(BaseMarketDataJob):
    """Job for fetching and storing fundamental data."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch fundamental data for given symbols."""
        try:
            logger.info(f"Fetching fundamentals for {len(symbols)} symbols")
            
            fundamentals_data = {}
            
            for symbol in symbols:
                try:
                    data = await self.orchestrator.get_fundamentals(symbol)
                    if data:
                        fundamentals_data[symbol] = data
                    
                    await asyncio.sleep(1)
                    
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
            
            for symbol, fundamentals in data.items():
                try:
                    # Extract exchange information if available
                    exchange_info = fundamentals.get('exchange', {})
                    
                    await self.db_service.execute_function(
                        "upsert_fundamental_data",
                        p_symbol=symbol,
                        p_fiscal_year=fundamentals.get('fiscal_year'),
                        p_fiscal_quarter=fundamentals.get('fiscal_quarter'),
                        p_data_provider=fundamentals.get('provider', 'unknown'),
                        
                        # Exchange parameters for automatic exchange handling
                        p_exchange_code=exchange_info.get('code') or fundamentals.get('exchange_code'),
                        p_exchange_name=exchange_info.get('name') or fundamentals.get('exchange_name'),
                        p_exchange_country=exchange_info.get('country') or fundamentals.get('country'),
                        p_exchange_timezone=exchange_info.get('timezone') or fundamentals.get('timezone'),
                        
                        # Fundamental parameters matching SQL function signature
                        p_sector=fundamentals.get('sector'),
                        p_pe_ratio=fundamentals.get('pe_ratio'),
                        p_pb_ratio=fundamentals.get('pb_ratio') or fundamentals.get('price_to_book'),
                        p_ps_ratio=fundamentals.get('ps_ratio') or fundamentals.get('price_to_sales'),
                        p_pegr_ratio=fundamentals.get('pegr_ratio') or fundamentals.get('peg_ratio'),
                        p_dividend_yield=fundamentals.get('dividend_yield'),
                        p_roe=fundamentals.get('roe'),
                        p_roa=fundamentals.get('roa'),
                        p_roic=fundamentals.get('roic'),
                        p_gross_margin=fundamentals.get('gross_margin'),
                        p_operating_margin=fundamentals.get('operating_margin'),
                        p_net_margin=fundamentals.get('net_margin'),
                        p_ebitda_margin=fundamentals.get('ebitda_margin'),
                        p_current_ratio=fundamentals.get('current_ratio'),
                        p_quick_ratio=fundamentals.get('quick_ratio'),
                        p_debt_to_equity=fundamentals.get('debt_to_equity'),
                        p_debt_to_assets=fundamentals.get('debt_to_assets'),
                        p_interest_coverage=fundamentals.get('interest_coverage'),
                        p_asset_turnover=fundamentals.get('asset_turnover'),
                        p_inventory_turnover=fundamentals.get('inventory_turnover'),
                        p_receivables_turnover=fundamentals.get('receivables_turnover'),
                        p_payables_turnover=fundamentals.get('payables_turnover'),
                        p_revenue_growth=fundamentals.get('revenue_growth') or fundamentals.get('quarterly_revenue_growth'),
                        p_earnings_growth=fundamentals.get('earnings_growth') or fundamentals.get('quarterly_earnings_growth'),
                        p_book_value_growth=fundamentals.get('book_value_growth'),
                        p_dividend_growth=fundamentals.get('dividend_growth'),
                        p_eps=fundamentals.get('eps') or fundamentals.get('diluted_eps_ttm'),
                        p_book_value_per_share=fundamentals.get('book_value_per_share'),
                        p_revenue_per_share=fundamentals.get('revenue_per_share'),
                        p_cash_flow_per_share=fundamentals.get('cash_flow_per_share'),
                        p_dividend_per_share=fundamentals.get('dividend_per_share'),
                        p_market_cap=fundamentals.get('market_cap'),
                        p_enterprise_value=fundamentals.get('enterprise_value'),
                        p_beta=fundamentals.get('beta'),
                        p_shares_outstanding=fundamentals.get('shares_outstanding'),
                        p_period_end_date=fundamentals.get('period_end_date'),
                        p_report_type=fundamentals.get('report_type', 'quarterly')
                    )
                    success_count += 1
                    
                except Exception as e:
                    logger.error(f"Failed to store fundamentals for {symbol}: {e}")
            
            logger.info(f"Stored {success_count}/{len(data)} fundamental records")
            return success_count == len(data)
            
        except Exception as e:
            logger.error(f"Error storing fundamentals: {e}")
            return False
