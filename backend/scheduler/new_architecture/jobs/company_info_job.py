"""
Company information data processing job.
Processes and stores company profile and basic information data.
Note: In the new architecture, data fetching is handled by CronDataScheduler.
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime

from .base_job import BaseMarketDataJob
from ...database_service import SchedulerDatabaseService

logger = logging.getLogger(__name__)


class CompanyInfoJob(BaseMarketDataJob):
    """Job for processing and storing company information."""
    
    def __init__(self, db_service: SchedulerDatabaseService):
        """Initialize the company info job."""
        super().__init__(db_service)
        self.job_name = "company_info"
    
    async def process_data(self, raw_data: Dict[str, Any]) -> bool:
        """
        Process and store company information data.
        
        Args:
            raw_data: Raw company info data from market_data providers
            
        Returns:
            bool: True if processing was successful
        """
        try:
            if not raw_data or 'data' not in raw_data:
                logger.warning("No company info data to process")
                return False
            
            company_data = raw_data['data']
            symbols = list(company_data.keys())
            
            logger.info(f"Processing company info for {len(symbols)} symbols")
            
            success_count = 0
            
            for symbol, info in company_data.items():
                try:
                    if not info:
                        logger.warning(f"No company info data for {symbol}")
                        continue
                    
                    # Transform data for database storage
                    params = self._transform_company_data(symbol, info)
                    
                    # Execute the upsert function
                    result = await self.db_service.execute_function("upsert_company_info", **params)
                    
                    if result is not None:
                        success_count += 1
                        logger.info(f"✅ Successfully stored company info for {symbol}")
                    else:
                        logger.error(f"❌ Failed to store company info for {symbol}")
                        
                except Exception as e:
                    logger.error(f"Error processing company info for {symbol}: {e}")
                    continue
            
            logger.info(f"Company info processing completed: {success_count}/{len(symbols)} successful")
            return success_count > 0
            
        except Exception as e:
            logger.error(f"Error in company info processing: {e}")
            return False
    
    def _transform_company_data(self, symbol: str, info: Any) -> Dict[str, Any]:
        """Transform company info data for database storage."""
        
        def safe_convert(value, convert_type):
            """Safely convert value to specified type."""
            if value is None or value == '':
                return None
            try:
                return convert_type(value)
            except (ValueError, TypeError):
                return None
        
        return {
            "p_symbol": symbol.upper(),
            "p_company_name": getattr(info, 'name', None),
            "p_sector": getattr(info, 'sector', None),
            "p_industry": getattr(info, 'industry', None),
            "p_market_cap": safe_convert(getattr(info, 'market_cap', None), int),
            "p_employees": safe_convert(getattr(info, 'employees', None), int),
            "p_revenue": safe_convert(getattr(info, 'revenue', None), int),
            "p_net_income": safe_convert(getattr(info, 'net_income', None), int),
            "p_pe_ratio": safe_convert(getattr(info, 'pe_ratio', None), float),
            "p_pb_ratio": safe_convert(getattr(info, 'pb_ratio', None), float),
            "p_dividend_yield": safe_convert(getattr(info, 'dividend_yield', None), float),
            "p_description": getattr(info, 'description', None),
            "p_website": getattr(info, 'website', None),
            "p_ceo": getattr(info, 'ceo', None),
            "p_headquarters": getattr(info, 'headquarters', None),
            "p_founded": getattr(info, 'founded', None),
            "p_phone": getattr(info, 'phone', None),
            "p_email": getattr(info, 'email', None),
            "p_ipo_date": getattr(info, 'ipo_date', None),
            "p_currency": getattr(info, 'currency', None) or 'USD',
            "p_fiscal_year_end": getattr(info, 'fiscal_year_end', None)
        }
