"""
Company information data fetching job.
Fetches company profile and basic information data.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class CompanyInfoJob(BaseMarketDataJob):
    """Job for fetching and storing company information."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        """Initialize with database service and market data orchestrator."""
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch company information for given symbols."""
        try:
            logger.info(f"Fetching company info for {len(symbols)} symbols")
            
            company_data = {}
            
            for symbol in symbols:
                try:
                    info = await self.orchestrator.get_company_info(symbol)
                    if info:
                        company_data[symbol] = info
                    
                    await asyncio.sleep(0.5)  # Rate limiting
                    
                except Exception as e:
                    logger.error(f"Failed to fetch company info for {symbol}: {e}")
                    continue
            
            return company_data
            
        except Exception as e:
            logger.error(f"Error fetching company info: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store company information using database upsert function."""
        if not data:
            return True
        
        try:
            success_count = 0
            
            for symbol, fetch_result in data.items():
                try:
                    # Extract company info data from FetchResult
                    if not fetch_result.success or not fetch_result.data:
                        logger.warning(f"No valid data for {symbol}")
                        continue
                    
                    info = fetch_result.data
                    
                    # Extract exchange information if available
                    exchange_info = getattr(info, 'exchange', None) or {}
                    
                    await self.db_service.execute_function(
                        "upsert_company_info",
                        p_symbol=symbol,
                        p_data_provider=fetch_result.provider,
                        
                        # Exchange parameters for automatic exchange handling
                        p_exchange_code=exchange_info.get('code') if exchange_info else None,
                        p_exchange_name=exchange_info.get('name') if exchange_info else None,
                        p_exchange_country=exchange_info.get('country') if exchange_info else info.country,
                        p_exchange_timezone=exchange_info.get('timezone') if exchange_info else None,
                        
                        # Company parameters matching SQL function signature
                        p_name=info.name,
                        p_company_name=info.company_name or info.name,
                        p_exchange=info.exchange,
                        p_sector=info.sector,
                        p_industry=info.industry,
                        p_market_cap=int(float(info.market_cap)) if info.market_cap else None,
                        p_employees=info.employees,
                        p_revenue=None,  # Not in base CompanyInfo model
                        p_net_income=None,  # Not in base CompanyInfo model
                        p_pe_ratio=float(info.pe_ratio) if info.pe_ratio else None,
                        p_pb_ratio=None,  # Not in base CompanyInfo model
                        p_dividend_yield=float(info.dividend_yield) if info.dividend_yield else None,
                        p_description=info.description,
                        p_website=info.website,
                        p_ceo=info.ceo,
                        p_headquarters=info.headquarters,
                        p_founded=info.founded,
                        p_phone=info.phone,
                        p_email=None,  # Not in base CompanyInfo model
                        p_ipo_date=None,  # Not in base CompanyInfo model
                        p_currency=None,  # Not in base CompanyInfo model
                        p_fiscal_year_end=None  # Not in base CompanyInfo model
                    )
                    success_count += 1
                    
                except Exception as e:
                    logger.error(f"Failed to store company info for {symbol}: {e}")
            
            logger.info(f"Stored {success_count}/{len(data)} company info records")
            return success_count == len(data)
            
        except Exception as e:
            logger.error(f"Error storing company info: {e}")
            return False
