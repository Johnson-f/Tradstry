"""
Earnings data database service.
Handles database operations specifically for earnings data with multi-provider support.
"""

import logging
from typing import List, Dict, Optional
from supabase import Client
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class EarningsDataDB:
    """Database service for earnings data operations with multi-provider support."""
    
    def __init__(self, supabase_client: Client = None):
        """Initialize with Supabase client."""
        self.supabase = supabase_client or get_supabase_admin_client()
    
    async def upsert_earnings_data(self, earnings_data: List[Dict]) -> bool:
        try:
            if not earnings_data:
                logger.warning("No earnings data to store")
                return False

            success_count = 0
            for earning in earnings_data:
                try:
                    # Skip status/error messages from providers
                    if isinstance(earning, dict) and (earning.get('status') in ['no_data', 'error'] or earning.get('message')):
                        logger.debug(f"Skipping status message from {earning.get('provider')}: {earning.get('message', 'no message')}")
                        continue
                    
                    # Handle actual earnings data (list format)
                    if isinstance(earning, list):
                        for earnings_record in earning:
                            if self._process_single_earnings_record(earnings_record):
                                success_count += 1
                    # Handle single earnings record
                    elif isinstance(earning, dict):
                        if self._process_single_earnings_record(earning):
                            success_count += 1
                    else:
                        logger.warning(f"Unexpected data type for earnings: {type(earning)}")
                        continue
                    
                except Exception as e:
                    logger.error(f"Error processing individual earnings record: {e}")
                    continue
            
            if success_count > 0:
                logger.info(f"Successfully stored {success_count}/{len(earnings_data)} earnings records")
                return True
            else:
                logger.error("Failed to store any earnings records")
                return False
            
        except Exception as e:
            logger.error(f"Error storing earnings data: {e}")
            return False
        """Process a single earnings record and store it in the database."""
        try:
            # Skip status/error messages from providers
            if earning.get('status') in ['no_data', 'error'] or earning.get('message'):
                logger.debug(f"Skipping status message from {earning.get('provider')}: {earning.get('message', 'no message')}")
                return False
            
            # Debug: Log the raw earning data to see what format we're getting
            logger.info(f"Processing earnings record: {earning}")
            
            # Extract fiscal quarter from fiscal period
            fiscal_period = earning.get('fiscal_period', '')
            fiscal_quarter = None
            fiscal_year = None
            
            if fiscal_period:
                # Handle formats like "Q1_2024", "Q3_2023", etc.
                if '_' in fiscal_period:
                    parts = fiscal_period.split('_')
                    if len(parts) == 2 and parts[0].startswith('Q'):
                        fiscal_quarter = int(parts[0][1:])  # Extract number from Q1, Q2, etc.
                        fiscal_year = int(parts[1])
                elif fiscal_period.startswith('Q') and len(fiscal_period) >= 6:
                    # Handle formats like "Q12024" or "Q1 2024"
                    fiscal_quarter = int(fiscal_period[1])
                    fiscal_year = int(fiscal_period[-4:])
            
            # If fiscal_period is empty or invalid, try to extract from other fields
            if not fiscal_quarter or not fiscal_year:
                # Try to extract from fiscal_year and fiscal_quarter fields if they exist
                fiscal_year = earning.get('fiscal_year')
                fiscal_quarter = earning.get('fiscal_quarter')
                
                if fiscal_year and fiscal_quarter:
                    fiscal_year = int(fiscal_year)
                    fiscal_quarter = int(fiscal_quarter)
                else:
                    logger.warning(f"Could not extract fiscal info from: {earning}")
                    return False
            
            # Skip if we still can't extract fiscal info
            if not fiscal_quarter or not fiscal_year:
                logger.warning(f"Invalid fiscal period format: {fiscal_period} for {earning.get('symbol')}")
                return False
            
            # Map the data to match the database function parameters
            params = {
                'p_symbol': earning.get('symbol'),
                'p_fiscal_year': fiscal_year,
                'p_fiscal_quarter': fiscal_quarter,
                'p_reported_date': earning.get('report_date'),
                'p_data_provider': earning.get('provider', 'unknown'),
                'p_eps': self._safe_float(earning.get('eps_actual')),
                'p_eps_estimated': self._safe_float(earning.get('eps_estimate')),
                'p_revenue': self._safe_bigint(earning.get('revenue_actual')),
                'p_revenue_estimated': self._safe_bigint(earning.get('revenue_estimate'))
            }
            
            response = self.supabase.rpc('upsert_earnings_data', params).execute()
            
            if hasattr(response, 'error') and response.error:
                logger.error(f"Error upserting earnings data for {earning.get('symbol')}: {response.error}")
                return False
            else:
                return True
                
        except Exception as e:
            logger.error(f"Error processing earnings record: {e}")
            return False
    
    def _safe_bigint(self, value) -> Optional[int]:
        """Safely convert value to bigint."""
        if value is None:
            return None
        try:
            if isinstance(value, (int, float)):
                return int(value)
            if isinstance(value, str):
                # Remove any non-numeric characters except minus
                clean_value = ''.join(c for c in value if c.isdigit() or c == '-')
                return int(clean_value) if clean_value else None
            return int(value)
        except (ValueError, TypeError):
            return None
    
    def _safe_float(self, value) -> Optional[float]:
        """Safely convert value to float."""
        if value is None:
            return None
        try:
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, str):
                # Remove any non-numeric characters except decimal point and minus
                clean_value = ''.join(c for c in value if c.isdigit() or c in '.-')
                return float(clean_value) if clean_value else None
            return float(value)
        except (ValueError, TypeError):
            return None
    
    def _extract_fiscal_year(self, fiscal_period: str) -> Optional[int]:
        """Extract fiscal year from fiscal period string."""
        if not fiscal_period:
            return None
        try:
            # Handle formats like "Q1_2024", "Q3_2023", etc.
            if '_' in fiscal_period:
                return int(fiscal_period.split('_')[1])
            # Handle formats like "Q1 2024", "Q3 2023", etc.
            elif ' ' in fiscal_period:
                return int(fiscal_period.split(' ')[1])
            # Try to extract 4-digit year from string
            import re
            year_match = re.search(r'\b(20\d{2})\b', fiscal_period)
            if year_match:
                return int(year_match.group(1))
        except (ValueError, IndexError):
            pass
        return None
    
    async def get_earnings_data(self, symbols: List[str]) -> List[Dict]:
        """Get earnings data for given symbols."""
        try:
            if not symbols:
                logger.warning("No symbols provided for earnings data fetch")
                return []

            response = self.supabase.table('earnings_data')\
                .select('*')\
                .in_('symbol', symbols)\
                .order('report_date', desc=True)\
                .execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching earnings data: {e}")
            return []
    
    async def get_all_symbols(self) -> List[str]:
        """Get all unique symbols from earnings data table."""
        try:
            response = self.supabase.table('earnings_data')\
                .select('symbol')\
                .execute()
            
            if response.data:
                # Extract unique symbols
                symbols = list(set(record['symbol'] for record in response.data if record.get('symbol')))
                return sorted(symbols)
            
            return []
            
        except Exception as e:
            logger.error(f"Error fetching all symbols from earnings data: {e}")
            return []
    
    async def get_symbols_needing_update(self, days_behind: int = 30) -> List[str]:
        """Get symbols that need earnings data updates (haven't been updated recently)."""
        try:
            from datetime import datetime, timedelta
            
            cutoff_date = (datetime.now() - timedelta(days=days_behind)).isoformat()
            
            # Get symbols that haven't been updated recently
            response = self.supabase.table('earnings_data')\
                .select('symbol, updated_at')\
                .lt('updated_at', cutoff_date)\
                .execute()
            
            if response.data:
                symbols = list(set(record['symbol'] for record in response.data if record.get('symbol')))
                return sorted(symbols)
            
            # If no symbols found, return all symbols (first run scenario)
            return await self.get_all_symbols()
            
        except Exception as e:
            logger.error(f"Error fetching symbols needing update: {e}")
            return []
    
    async def get_latest_earnings_by_symbol(self, symbol: str, limit: int = 5) -> List[Dict]:
        """Get latest earnings data for a specific symbol."""
        try:
            response = self.supabase.table('earnings_data')\
                .select('*')\
                .eq('symbol', symbol)\
                .order('report_date', desc=True)\
                .limit(limit)\
                .execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching latest earnings for {symbol}: {e}")
            return []
    
    async def get_provider_statistics(self) -> Dict[str, int]:
        """Get statistics on data providers."""
        try:
            response = self.supabase.table('earnings_data')\
                .select('data_provider')\
                .execute()
            
            if response.data:
                provider_counts = {}
                for record in response.data:
                    provider = record.get('data_provider', 'unknown')
                    provider_counts[provider] = provider_counts.get(provider, 0) + 1
                
                return provider_counts
            
            return {}
            
        except Exception as e:
            logger.error(f"Error fetching provider statistics: {e}")
            return {}
    
    async def close(self):
        """Close database connections."""
        try:
            logger.info("Earnings data DB service closed")
        except Exception as e:
            logger.error(f"Error closing earnings data DB service: {e}")
