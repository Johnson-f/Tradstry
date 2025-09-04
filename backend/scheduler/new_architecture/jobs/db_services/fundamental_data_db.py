"""
Fundamental data database service.
Handles database operations specifically for fundamental data.
"""

import logging
from typing import List, Dict
from supabase import Client
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class FundamentalDataDB:
    """Database service for fundamental data operations."""
    
    def __init__(self, supabase_client: Client = None):
        """Initialize with Supabase client."""
        self.supabase = supabase_client or get_supabase_admin_client()
    
    async def upsert_fundamental_data(self, fundamentals_data: List[Dict]) -> bool:
        """Store fundamental data in database using upsert function."""
        try:
            for fundamental in fundamentals_data:
                params = {
                    'p_symbol': fundamental.get('symbol'),
                    'p_revenue': fundamental.get('revenue'),
                    'p_net_income': fundamental.get('net_income'),
                    'p_total_assets': fundamental.get('total_assets'),
                    'p_pe_ratio': fundamental.get('pe_ratio'),
                    'p_pb_ratio': fundamental.get('pb_ratio'),
                    'p_roe': fundamental.get('roe'),
                    'p_roa': fundamental.get('roa'),
                    'p_debt_to_equity': fundamental.get('debt_to_equity'),
                    'p_data_provider': fundamental.get('provider', 'market_data_brain')
                }
                
                response = self.supabase.rpc('upsert_fundamental_data', params).execute()
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting fundamental data for {fundamental.get('symbol')}: {response.error}")
                    return False
            
            logger.info(f"Successfully stored {len(fundamentals_data)} fundamental data records")
            return True
            
        except Exception as e:
            logger.error(f"Error storing fundamental data: {e}")
            return False
    
    async def get_fundamental_data(self, symbols: List[str]) -> List[Dict]:
        """Get fundamental data for given symbols."""
        try:
            response = self.supabase.table('fundamental_data')\
                .select('*')\
                .in_('symbol', symbols)\
                .execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching fundamental data: {e}")
            return []
    
    async def close(self):
        """Close database connections."""
        try:
            logger.info("Fundamental data DB service closed")
        except Exception as e:
            logger.error(f"Error closing fundamental data DB service: {e}")
