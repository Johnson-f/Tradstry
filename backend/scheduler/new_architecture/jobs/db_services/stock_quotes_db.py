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
    
    async def get_all_symbols(self) -> List[str]:
        """Get all distinct symbols currently in the database."""
        try:
            response = self.supabase.table('stock_quotes')\
                .select('symbol')\
                .execute()
            
            if response.data:
                # Extract unique symbols
                symbols = list(set(row['symbol'] for row in response.data))
                logger.info(f"Found {len(symbols)} distinct symbols in database")
                return symbols
            else:
                logger.warning("No symbols found in database")
                return []
                
        except Exception as e:
            logger.error(f"Error fetching symbols from database: {e}")
            return []
    
    async def get_symbols_needing_update(self, max_age_minutes: int = 15) -> List[str]:
        """Get symbols that haven't been updated recently."""
        try:
            # Calculate timestamp for max age
            from datetime import datetime, timedelta
            cutoff_time = datetime.now() - timedelta(minutes=max_age_minutes)
            cutoff_iso = cutoff_time.isoformat()
            
            # Get latest quote timestamp for each symbol
            response = self.supabase.rpc('get_symbols_needing_update', {
                'cutoff_timestamp': cutoff_iso
            }).execute()
            
            if response.data:
                symbols = [row['symbol'] for row in response.data]
                logger.info(f"Found {len(symbols)} symbols needing update (older than {max_age_minutes} minutes)")
                return symbols
            else:
                # Fallback: get all symbols if stored procedure doesn't exist
                logger.info("Using fallback method to get all symbols")
                return await self.get_all_symbols()
                
        except Exception as e:
            logger.warning(f"Error getting symbols needing update: {e}, falling back to all symbols")
            return await self.get_all_symbols()
    
    async def close(self):
        """Close database connections."""
        try:
            logger.info("Stock quotes DB service closed")
        except Exception as e:
            logger.error(f"Error closing stock quotes DB service: {e}")
