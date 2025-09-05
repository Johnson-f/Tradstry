"""
Earnings calendar database service.
Handles database operations specifically for earnings calendar data.
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime, date
from supabase import Client
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class EarningsCalendarDB:
    """Database service for earnings calendar operations."""
    
    def __init__(self, supabase_client: Client = None):
        """Initialize with Supabase client."""
        self.supabase = supabase_client or get_supabase_admin_client()
    
    async def upsert_earnings_calendar(self, earnings_data: List[Dict]) -> bool:
        """Store earnings calendar data in database using upsert function."""
        try:
            success_count = 0
            for earnings in earnings_data:
                params = {
                    'p_symbol': earnings.get('symbol'),
                    'p_data_provider': earnings.get('provider', 'market_data_brain'),
                    'p_earnings_date': earnings.get('date'),
                    'p_fiscal_year': earnings.get('fiscal_year'),
                    'p_fiscal_quarter': earnings.get('fiscal_quarter'),
                    
                    # Optional parameters
                    'p_time_of_day': earnings.get('time'),
                    'p_eps': earnings.get('eps'),
                    'p_eps_estimated': earnings.get('eps_estimated'),
                    'p_revenue': earnings.get('revenue'),
                    'p_revenue_estimated': earnings.get('revenue_estimated'),
                    'p_fiscal_date_ending': earnings.get('fiscal_date_ending'),
                    'p_status': earnings.get('status', 'scheduled'),
                    'p_last_updated': datetime.now().isoformat(),
                    'p_update_source': 'earnings_calendar_cron'
                }
                
                response = self.supabase.rpc('upsert_earnings_calendar', params).execute()
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting earnings calendar for {earnings.get('symbol')}: {response.error}")
                else:
                    success_count += 1
            
            logger.info(f"Successfully stored {success_count}/{len(earnings_data)} earnings calendar entries")
            return success_count > 0
            
        except Exception as e:
            logger.error(f"Error storing earnings calendar data: {e}")
            return False
    
    async def get_all_symbols(self) -> List[str]:
        """Get all distinct symbols currently in the database."""
        try:
            # Get symbols from stock_quotes table (most comprehensive)
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
    
    async def get_symbols_with_upcoming_earnings(self, days_ahead: int = 30) -> List[str]:
        """Get symbols that have earnings scheduled in the next N days."""
        try:
            from datetime import datetime, timedelta
            end_date = (datetime.now() + timedelta(days=days_ahead)).date()
            
            response = self.supabase.table('earnings_calendar')\
                .select('symbol')\
                .gte('earnings_date', datetime.now().date().isoformat())\
                .lte('earnings_date', end_date.isoformat())\
                .execute()
            
            if response.data:
                symbols = list(set(row['symbol'] for row in response.data))
                logger.info(f"Found {len(symbols)} symbols with upcoming earnings in next {days_ahead} days")
                return symbols
            else:
                logger.info(f"No symbols found with upcoming earnings in next {days_ahead} days")
                return []
                
        except Exception as e:
            logger.warning(f"Error getting symbols with upcoming earnings: {e}")
            return []
    
    async def get_latest_earnings_calendar(self, symbols: List[str]) -> List[Dict]:
        """Get latest earnings calendar entries for given symbols."""
        try:
            response = self.supabase.table('earnings_calendar')\
                .select('*')\
                .in_('symbol', symbols)\
                .order('earnings_date', desc=False)\
                .execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching latest earnings calendar: {e}")
            return []
    
    async def get_symbols_needing_earnings_update(self, max_age_days: int = 7) -> List[str]:
        """Get symbols that haven't had their earnings calendar updated recently."""
        try:
            from datetime import datetime, timedelta
            cutoff_time = datetime.now() - timedelta(days=max_age_days)
            cutoff_iso = cutoff_time.isoformat()
            
            # Get symbols that either have no earnings data or old earnings data
            response = self.supabase.rpc('get_symbols_needing_earnings_update', {
                'cutoff_timestamp': cutoff_iso
            }).execute()
            
            if response.data:
                symbols = [row['symbol'] for row in response.data]
                logger.info(f"Found {len(symbols)} symbols needing earnings update (older than {max_age_days} days)")
                return symbols
            else:
                # Fallback: get all symbols if stored procedure doesn't exist
                logger.info("Using fallback method to get all symbols for earnings update")
                return await self.get_all_symbols()
                
        except Exception as e:
            logger.warning(f"Error getting symbols needing earnings update: {e}, falling back to all symbols")
            return await self.get_all_symbols()
    
    async def delete_old_earnings_data(self, days_old: int = 365) -> bool:
        """Delete earnings calendar data older than specified days."""
        try:
            from datetime import datetime, timedelta
            cutoff_date = (datetime.now() - timedelta(days=days_old)).date()
            
            response = self.supabase.table('earnings_calendar')\
                .delete()\
                .lt('earnings_date', cutoff_date.isoformat())\
                .execute()
            
            deleted_count = len(response.data) if response.data else 0
            logger.info(f"Deleted {deleted_count} old earnings calendar entries (older than {days_old} days)")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting old earnings data: {e}")
            return False
    
    async def get_earnings_stats(self) -> Dict:
        """Get statistics about earnings calendar data."""
        try:
            # Get total count
            total_response = self.supabase.table('earnings_calendar')\
                .select('id', count='exact')\
                .execute()
            
            # Get upcoming count
            upcoming_response = self.supabase.table('earnings_calendar')\
                .select('id', count='exact')\
                .gte('earnings_date', datetime.now().date().isoformat())\
                .execute()
            
            # Get unique symbols count
            symbols_response = self.supabase.table('earnings_calendar')\
                .select('symbol')\
                .execute()
            
            unique_symbols = len(set(row['symbol'] for row in symbols_response.data)) if symbols_response.data else 0
            
            stats = {
                'total_entries': total_response.count if hasattr(total_response, 'count') else 0,
                'upcoming_earnings': upcoming_response.count if hasattr(upcoming_response, 'count') else 0,
                'unique_symbols': unique_symbols,
                'last_updated': datetime.now().isoformat()
            }
            
            logger.info(f"Earnings calendar stats: {stats}")
            return stats
            
        except Exception as e:
            logger.error(f"Error getting earnings stats: {e}")
            return {}
    
    async def close(self):
        """Close database connections."""
        try:
            logger.info("Earnings calendar DB service closed")
        except Exception as e:
            logger.error(f"Error closing earnings calendar DB service: {e}")
