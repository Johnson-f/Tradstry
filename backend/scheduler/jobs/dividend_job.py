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
        """Fetch dividend data for given symbols."""
        try:
            logger.info(f"Fetching dividend data for {len(symbols)} symbols")
            dividend_data = {}
            
            for symbol in symbols:
                try:
                    data = await self.orchestrator.get_dividend_data(symbol)
                    if data:
                        dividend_data[symbol] = data
                    await asyncio.sleep(0.5)
                except Exception as e:
                    logger.error(f"Failed to fetch dividends for {symbol}: {e}")
                    continue
            
            return dividend_data
        except Exception as e:
            logger.error(f"Error fetching dividend data: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store dividend data using database upsert function."""
        if not data:
            return True
        
        try:
            success_count = 0
            total_records = 0
            
            for symbol, dividends in data.items():
                if not isinstance(dividends, list):
                    continue
                
                for dividend in dividends:
                    try:
                        # Extract exchange information if available
                        exchange_info = dividend.get('exchange', {})
                        
                        await self.db_service.execute_function(
                            "upsert_dividend_data",
                            p_symbol=symbol,
                            p_data_provider=dividend.get('provider', 'unknown'),
                            p_ex_dividend_date=dividend.get('ex_dividend_date'),
                            p_dividend_amount=dividend.get('dividend_amount') or dividend.get('amount'),
                            
                            # Exchange parameters for automatic exchange handling
                            p_exchange_code=exchange_info.get('code') or dividend.get('exchange_code'),
                            p_exchange_name=exchange_info.get('name') or dividend.get('exchange_name'),
                            p_exchange_country=exchange_info.get('country') or dividend.get('country'),
                            p_exchange_timezone=exchange_info.get('timezone') or dividend.get('timezone'),
                            
                            # Dividend parameters matching SQL function signature
                            p_declaration_date=dividend.get('declaration_date'),
                            p_record_date=dividend.get('record_date'),
                            p_payment_date=dividend.get('payment_date'),
                            p_dividend_type=dividend.get('dividend_type') or dividend.get('type', 'regular'),
                            p_currency=dividend.get('currency', 'USD'),
                            p_frequency=dividend.get('frequency'),
                            p_dividend_status=dividend.get('dividend_status', 'active'),
                            p_dividend_yield=dividend.get('dividend_yield'),
                            p_payout_ratio=dividend.get('payout_ratio'),
                            p_consecutive_years=dividend.get('consecutive_years'),
                            p_qualified_dividend=dividend.get('qualified_dividend', True),
                            p_tax_rate=dividend.get('tax_rate'),
                            p_fiscal_year=dividend.get('fiscal_year'),
                            p_fiscal_quarter=dividend.get('fiscal_quarter')
                        )
                        success_count += 1
                    except Exception as e:
                        logger.error(f"Failed to store dividend for {symbol}: {e}")
                    
                    total_records += 1
            
            logger.info(f"Stored {success_count}/{total_records} dividend records")
            return success_count == total_records
        except Exception as e:
            logger.error(f"Error storing dividend data: {e}")
            return False
