"""
Stock quotes database service.
Handles database operations specifically for stock quotes data.
"""

import logging
from typing import List, Dict
from datetime import datetime
from supabase import Client
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class StockQuotesDB:
    """Database service for stock quotes operations."""
    
    def __init__(self, supabase_client: Client = None):
        """Initialize with Supabase client."""
        self.supabase = supabase_client or get_supabase_admin_client()
    
    async def upsert_stock_quotes(self, quotes_data: List[Dict]) -> bool:
        """Store stock quotes in database using upsert function."""
        try:
            for quote in quotes_data:
                params = {
                    'p_symbol': quote.get('symbol'),
                    'p_quote_timestamp': quote.get('timestamp', datetime.now().isoformat()),
                    'p_data_provider': quote.get('provider', 'market_data_brain'),
                    'p_price': quote.get('price'),
                    'p_change_amount': quote.get('change'),
                    'p_change_percent': quote.get('change_percent'),
                    'p_volume': quote.get('volume'),
                    'p_open_price': quote.get('open'),
                    'p_high_price': quote.get('high'),
                    'p_low_price': quote.get('low'),
                    'p_previous_close': quote.get('previous_close')
                }
                
                response = self.supabase.rpc('upsert_stock_quote', params).execute()
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting stock quote for {quote.get('symbol')}: {response.error}")
                    return False
            
            logger.info(f"Successfully stored {len(quotes_data)} stock quotes")
            return True
            
        except Exception as e:
            logger.error(f"Error storing stock quotes: {e}")
            return False
    
    async def get_latest_quotes(self, symbols: List[str]) -> List[Dict]:
        """Get latest quotes for given symbols."""
        try:
            response = self.supabase.table('stock_quotes')\
                .select('*')\
                .in_('symbol', symbols)\
                .order('quote_timestamp', desc=True)\
                .execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching latest quotes: {e}")
            return []
    
    async def close(self):
        """Close database connections."""
        try:
            logger.info("Stock quotes DB service closed")
        except Exception as e:
            logger.error(f"Error closing stock quotes DB service: {e}")
