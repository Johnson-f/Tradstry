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
                    await self.db_service.execute_function(
                        "upsert_fundamental_data",
                        p_symbol=symbol,
                        p_market_cap=fundamentals.get('market_cap'),
                        p_pe_ratio=fundamentals.get('pe_ratio'),
                        p_peg_ratio=fundamentals.get('peg_ratio'),
                        p_price_to_book=fundamentals.get('price_to_book'),
                        p_price_to_sales=fundamentals.get('price_to_sales'),
                        p_enterprise_value=fundamentals.get('enterprise_value'),
                        p_ebitda=fundamentals.get('ebitda'),
                        p_revenue_ttm=fundamentals.get('revenue_ttm'),
                        p_gross_profit_ttm=fundamentals.get('gross_profit_ttm'),
                        p_diluted_eps_ttm=fundamentals.get('diluted_eps_ttm'),
                        p_quarterly_earnings_growth=fundamentals.get('quarterly_earnings_growth'),
                        p_quarterly_revenue_growth=fundamentals.get('quarterly_revenue_growth'),
                        p_analyst_target_price=fundamentals.get('analyst_target_price'),
                        p_trailing_pe=fundamentals.get('trailing_pe'),
                        p_forward_pe=fundamentals.get('forward_pe'),
                        p_price_to_earnings_growth=fundamentals.get('price_to_earnings_growth'),
                        p_enterprise_to_revenue=fundamentals.get('enterprise_to_revenue'),
                        p_enterprise_to_ebitda=fundamentals.get('enterprise_to_ebitda'),
                        p_data_provider=fundamentals.get('provider', 'unknown')
                    )
                    success_count += 1
                    
                except Exception as e:
                    logger.error(f"Failed to store fundamentals for {symbol}: {e}")
            
            logger.info(f"Stored {success_count}/{len(data)} fundamental records")
            return success_count == len(data)
            
        except Exception as e:
            logger.error(f"Error storing fundamentals: {e}")
            return False
