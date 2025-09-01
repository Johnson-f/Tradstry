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
            
            for symbol, info in data.items():
                try:
                    await self.db_service.execute_function(
                        "upsert_company_info",
                        p_symbol=symbol,
                        p_company_name=info.get('name'),
                        p_description=info.get('description'),
                        p_sector=info.get('sector'),
                        p_industry=info.get('industry'),
                        p_market_cap=info.get('market_cap'),
                        p_employees=info.get('employees'),
                        p_headquarters=info.get('headquarters'),
                        p_founded_year=info.get('founded'),
                        p_website=info.get('website'),
                        p_data_provider=info.get('provider', 'unknown')
                    )
                    success_count += 1
                    
                except Exception as e:
                    logger.error(f"Failed to store company info for {symbol}: {e}")
            
            logger.info(f"Stored {success_count}/{len(data)} company info records")
            return success_count == len(data)
            
        except Exception as e:
            logger.error(f"Error storing company info: {e}")
            return False
