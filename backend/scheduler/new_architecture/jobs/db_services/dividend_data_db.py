"""
Dividend data database service.
Handles database operations specifically for dividend data.
"""

import logging
from typing import List, Dict
from supabase import Client
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class DividendDataDB:
    """Database service for dividend data operations."""
    
    def __init__(self, supabase_client: Client = None):
        """Initialize with Supabase client."""
        self.supabase = supabase_client or get_supabase_admin_client()
    
    async def upsert_dividend_data(self, dividends_data: List[Dict]) -> bool:
        """Store dividend data in database using upsert function."""
        try:
            for dividend in dividends_data:
                params = {
                    'p_symbol': dividend.get('symbol'),
                    'p_ex_date': dividend.get('ex_date'),
                    'p_payment_date': dividend.get('payment_date'),
                    'p_record_date': dividend.get('record_date'),
                    'p_declaration_date': dividend.get('declaration_date'),
                    'p_amount': dividend.get('amount'),
                    'p_frequency': dividend.get('frequency'),
                    'p_data_provider': dividend.get('provider', 'market_data_brain')
                }
                
                response = self.supabase.rpc('upsert_dividend_data', params).execute()
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting dividend data for {dividend.get('symbol')}: {response.error}")
                    return False
            
            logger.info(f"Successfully stored {len(dividends_data)} dividend records")
            return True
            
        except Exception as e:
            logger.error(f"Error storing dividend data: {e}")
            return False
    
    async def get_dividend_data(self, symbols: List[str]) -> List[Dict]:
        """Get dividend data for given symbols."""
        try:
            response = self.supabase.table('dividend_data')\
                .select('*')\
                .in_('symbol', symbols)\
                .execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching dividend data: {e}")
            return []
    
    async def close(self):
        """Close database connections."""
        try:
            logger.info("Dividend data DB service closed")
        except Exception as e:
            logger.error(f"Error closing dividend data DB service: {e}")
