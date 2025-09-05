"""
Historical prices database service.
Handles database operations specifically for historical price data.
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime, date
from supabase import Client
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class HistoricalPricesDB:
    """Database service for historical price data operations."""
    
    def __init__(self, supabase_client: Client = None):
        """Initialize with Supabase client."""
        self.supabase = supabase_client or get_supabase_admin_client()
    
    async def upsert_historical_prices(self, price_data: List[Dict]) -> bool:
        """Store historical price data in database using upsert."""
        try:
            if not price_data:
                logger.warning("No historical price data to store")
                return False
            
            # Process each price record
            for price_record in price_data:
                # Prepare data for database insertion
                db_record = {
                    'symbol': price_record.get('symbol'),
                    'date': price_record.get('date'),
                    'open': float(price_record.get('open')) if price_record.get('open') is not None else None,
                    'high': float(price_record.get('high')) if price_record.get('high') is not None else None,
                    'low': float(price_record.get('low')) if price_record.get('low') is not None else None,
                    'close': float(price_record.get('close')) if price_record.get('close') is not None else None,
                    'volume': int(price_record.get('volume')) if price_record.get('volume') is not None else None,
                    'adjusted_close': float(price_record.get('adjusted_close')) if price_record.get('adjusted_close') is not None else None,
                    'dividend': float(price_record.get('dividend', 0.0)),
                    'split_ratio': float(price_record.get('split_ratio', 1.0)),
                    'data_provider': price_record.get('data_provider', 'yahoo_finance'),
                    'exchange_id': price_record.get('exchange_id'),
                    'updated_at': datetime.now().isoformat()
                }
                
                # Remove None values to avoid database issues
                db_record = {k: v for k, v in db_record.items() if v is not None}
                
                # Upsert using conflict resolution on symbol, date, data_provider
                response = self.supabase.table('historical_prices').upsert(
                    db_record,
                    on_conflict='symbol,date,data_provider'
                ).execute()
                
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting historical price for {price_record.get('symbol')}: {response.error}")
                    return False
            
            logger.info(f"Successfully stored {len(price_data)} historical price records")
            return True
            
        except Exception as e:
            logger.error(f"Error storing historical price data: {e}")
            return False
    
    async def get_historical_prices(self, symbol: str, start_date: Optional[date] = None, 
                                  end_date: Optional[date] = None, 
                                  data_provider: Optional[str] = None) -> List[Dict]:
        """Get historical price data for a symbol within date range."""
        try:
            query = self.supabase.table('historical_prices').select('*').eq('symbol', symbol)
            
            if start_date:
                query = query.gte('date', start_date.isoformat())
            
            if end_date:
                query = query.lte('date', end_date.isoformat())
            
            if data_provider:
                query = query.eq('data_provider', data_provider)
            
            # Order by date descending
            query = query.order('date', desc=True)
            
            response = query.execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching historical prices for {symbol}: {e}")
            return []
    
    async def get_latest_price_date(self, symbol: str, data_provider: Optional[str] = None) -> Optional[date]:
        """Get the latest date for which we have price data for a symbol."""
        try:
            query = self.supabase.table('historical_prices').select('date').eq('symbol', symbol)
            
            if data_provider:
                query = query.eq('data_provider', data_provider)
            
            response = query.order('date', desc=True).limit(1).execute()
            
            if response.data and len(response.data) > 0:
                return datetime.fromisoformat(response.data[0]['date']).date()
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting latest price date for {symbol}: {e}")
            return None
    
    async def get_symbols_needing_update(self, days_behind: int = 1) -> List[str]:
        """Get symbols that need historical price updates (haven't been updated recently)."""
        try:
            from datetime import timedelta
            cutoff_date = (datetime.now().date() - timedelta(days=days_behind)).isoformat()
            
            # Get symbols that either have no data or haven't been updated recently
            response = self.supabase.table('historical_prices')\
                .select('symbol')\
                .lt('date', cutoff_date)\
                .execute()
            
            symbols_behind = list(set(row['symbol'] for row in response.data)) if response.data else []
            
            # Also get all symbols from stock quotes table that might not have historical data yet
            stock_quotes_response = self.supabase.table('stock_quotes')\
                .select('symbol')\
                .execute()
            
            all_symbols = list(set(row['symbol'] for row in stock_quotes_response.data)) if stock_quotes_response.data else []
            
            # Get symbols with no historical data
            historical_symbols_response = self.supabase.table('historical_prices')\
                .select('symbol')\
                .execute()
            
            historical_symbols = list(set(row['symbol'] for row in historical_symbols_response.data)) if historical_symbols_response.data else []
            
            symbols_without_data = [symbol for symbol in all_symbols if symbol not in historical_symbols]
            
            # Combine both lists
            symbols_needing_update = list(set(symbols_behind + symbols_without_data))
            
            logger.info(f"Found {len(symbols_needing_update)} symbols needing historical price updates")
            return symbols_needing_update
            
        except Exception as e:
            logger.error(f"Error getting symbols needing update: {e}")
            return []
    
    async def get_all_symbols(self) -> List[str]:
        """Get all unique symbols that have historical price data."""
        try:
            response = self.supabase.table('historical_prices')\
                .select('symbol')\
                .execute()
            
            if response.data:
                symbols = list(set(row['symbol'] for row in response.data))
                logger.info(f"Found {len(symbols)} symbols with historical price data")
                return symbols
            else:
                logger.warning("No symbols found with historical price data")
                return []
                
        except Exception as e:
            logger.error(f"Error fetching symbols with historical data: {e}")
            return []
    
    async def delete_historical_prices(self, symbol: str, data_provider: Optional[str] = None) -> bool:
        """Delete historical price data for a symbol (admin function)."""
        try:
            query = self.supabase.table('historical_prices').delete().eq('symbol', symbol)
            
            if data_provider:
                query = query.eq('data_provider', data_provider)
            
            response = query.execute()
            
            if hasattr(response, 'error') and response.error:
                logger.error(f"Error deleting historical prices for {symbol}: {response.error}")
                return False
            
            logger.info(f"Successfully deleted historical prices for {symbol}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting historical prices for {symbol}: {e}")
            return False
    
    async def close(self):
        """Close database connections."""
        try:
            logger.info("Historical prices DB service closed")
        except Exception as e:
            logger.error(f"Error closing historical prices DB service: {e}")
