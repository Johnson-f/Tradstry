"""
Earnings data database service.
Handles database operations specifically for earnings data.
"""

import logging
from typing import List, Dict
from supabase import Client
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class EarningsDataDB:
    """Database service for earnings data operations."""
    
    def __init__(self, supabase_client: Client = None):
        """Initialize with Supabase client."""
        self.supabase = supabase_client or get_supabase_admin_client()
    
    async def upsert_earnings_data(self, earnings_data: List[Dict]) -> bool:
        """Store earnings data in database using upsert function."""
        try:
            for earning in earnings_data:
                params = {
                    'p_symbol': earning.get('symbol'),
                    'p_fiscal_period': earning.get('fiscal_period'),
                    'p_fiscal_year': earning.get('fiscal_year'),
                    'p_report_date': earning.get('report_date'),
                    'p_eps_actual': earning.get('eps_actual'),
                    'p_eps_estimate': earning.get('eps_estimate'),
                    'p_revenue_actual': earning.get('revenue_actual'),
                    'p_revenue_estimate': earning.get('revenue_estimate'),
                    'p_data_provider': earning.get('provider', 'market_data_brain')
                }
                
                response = self.supabase.rpc('upsert_earnings_data', params).execute()
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting earnings data for {earning.get('symbol')}: {response.error}")
                    return False
            
            logger.info(f"Successfully stored {len(earnings_data)} earnings records")
            return True
            
        except Exception as e:
            logger.error(f"Error storing earnings data: {e}")
            return False
    
    async def get_earnings_data(self, symbols: List[str]) -> List[Dict]:
        """Get earnings data for given symbols."""
        try:
            response = self.supabase.table('earnings_data')\
                .select('*')\
                .in_('symbol', symbols)\
                .execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching earnings data: {e}")
            return []
    
    async def close(self):
        """Close database connections."""
        try:
            logger.info("Earnings data DB service closed")
        except Exception as e:
            logger.error(f"Error closing earnings data DB service: {e}")
