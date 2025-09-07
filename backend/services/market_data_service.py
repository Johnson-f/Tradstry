"""
Market Data Service for managing earnings and fundamental data.
Handles Supabase database operations, JWT authentication, and integration with yfinance.
"""

from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, date
import logging
from decimal import Decimal
from supabase import Client

from database import get_supabase, get_supabase_admin_client
from auth_service import AuthService
from config import get_settings
from market_data.yfinance_service import YFinanceService, EarningsData, FundamentalData

logger = logging.getLogger(__name__)
settings = get_settings()


class MarketDataService:
    """Service for managing market data operations with Supabase and JWT authentication"""
    
    def __init__(self, access_token: str = None):
        self.yfinance_service = YFinanceService()
        self.auth_service = AuthService()
        self.access_token = access_token
        self.supabase_client = get_supabase_admin_client()  # Use admin client for service operations
    
    async def _get_authenticated_client(self) -> Client:
        """Get authenticated Supabase client using JWT token"""
        if not self.access_token:
            raise Exception("Access token required for authenticated operations")
        return await self.auth_service.get_authenticated_client(self.access_token)
    
    async def get_missing_earnings_data(self, symbols: List[str] = None) -> Dict[str, List[Tuple[int, int]]]:
        """
        Check for missing earnings data in the database.
        
        Args:
            symbols: List of symbols to check. If None, checks all symbols in database.
            
        Returns:
            Dict mapping symbol to list of missing (fiscal_year, fiscal_quarter) tuples
        """
        try:
            client = await self._get_authenticated_client() if self.access_token else self.supabase_client
            
            if symbols is None:
                # Get all unique symbols from the database
                response = client.table('earnings_data').select('symbol').execute()
                symbols = list(set([row['symbol'] for row in response.data]))
            
            missing_data = {}
            
            for symbol in symbols:
                # Get existing earnings data for this symbol
                response = client.table('earnings_data')\
                    .select('fiscal_year, fiscal_quarter, data_provider')\
                    .eq('symbol', symbol.upper())\
                    .eq('data_provider', 'yfinance')\
                    .order('fiscal_year', desc=True)\
                    .order('fiscal_quarter', desc=True)\
                    .execute()
                
                existing_periods = set((row['fiscal_year'], row['fiscal_quarter']) for row in response.data)
                
                # Define expected periods (last 5 years, 4 quarters each)
                current_year = datetime.now().year
                expected_periods = set()
                for year in range(current_year - 4, current_year + 1):
                    for quarter in range(1, 5):
                        expected_periods.add((year, quarter))
                
                # Find missing periods
                missing_periods = expected_periods - existing_periods
                if missing_periods:
                    missing_data[symbol] = sorted(list(missing_periods))
                    
            logger.info(f"Found missing earnings data for {len(missing_data)} symbols")
            return missing_data
            
        except Exception as e:
            logger.error(f"Error checking for missing earnings data: {e}")
            return {}
    
    async def get_missing_fundamental_data(self, symbols: List[str] = None) -> List[str]:
        """
        Check for missing fundamental data in the database.
        
        Args:
            symbols: List of symbols to check. If None, checks all symbols in database.
            
        Returns:
            List of symbols missing fundamental data
        """
        try:
            client = await self._get_authenticated_client() if self.access_token else self.supabase_client
            
            if symbols is None:
                # Get all unique symbols from the database
                response = client.table('earnings_data').select('symbol').execute()
                symbols = list(set([row['symbol'] for row in response.data]))
            
            missing_symbols = []
            current_year = datetime.now().year
            
            for symbol in symbols:
                # Check if we have recent fundamental data
                response = client.table('fundamental_data')\
                    .select('id', count='exact')\
                    .eq('symbol', symbol.upper())\
                    .eq('data_provider', 'yfinance')\
                    .gte('fiscal_year', current_year - 1)\
                    .execute()
                
                if response.count == 0:
                    missing_symbols.append(symbol)
            
            logger.info(f"Found {len(missing_symbols)} symbols missing fundamental data")
            return missing_symbols
            
        except Exception as e:
            logger.error(f"Error checking for missing fundamental data: {e}")
            return []
    
    async def upsert_earnings_data(self, earnings_data: List[EarningsData]) -> int:
        """
        Insert or update earnings data in the database.
        
        Args:
            earnings_data: List of EarningsData objects to upsert
            
        Returns:
            Number of records processed
        """
        try:
            client = await self._get_authenticated_client() if self.access_token else self.supabase_client
            processed_count = 0
            
            for earnings in earnings_data:
                # Prepare data for upsert
                earnings_record = {
                    "symbol": earnings.symbol,
                    "fiscal_year": earnings.fiscal_year,
                    "fiscal_quarter": earnings.fiscal_quarter,
                    "reported_date": earnings.reported_date.isoformat() if earnings.reported_date else None,
                    "eps": float(earnings.eps) if earnings.eps is not None else None,
                    "eps_estimated": float(earnings.eps_estimated) if earnings.eps_estimated is not None else None,
                    "revenue": float(earnings.revenue) if earnings.revenue is not None else None,
                    "revenue_estimated": float(earnings.revenue_estimated) if earnings.revenue_estimated is not None else None,
                    "net_income": float(earnings.net_income) if earnings.net_income is not None else None,
                    "gross_profit": float(earnings.gross_profit) if earnings.gross_profit is not None else None,
                    "operating_income": float(earnings.operating_income) if earnings.operating_income is not None else None,
                    "ebitda": float(earnings.ebitda) if earnings.ebitda is not None else None,
                    "data_provider": earnings.data_provider,
                    "updated_at": datetime.now().isoformat()
                }
                
                # Use Supabase upsert operation
                response = client.table('earnings_data')\
                    .upsert(earnings_record, 
                           on_conflict='symbol,fiscal_year,fiscal_quarter,data_provider')\
                    .execute()
                
                processed_count += 1
            
            logger.info(f"Successfully processed {processed_count} earnings records")
            return processed_count
            
        except Exception as e:
            logger.error(f"Error upserting earnings data: {e}")
            raise
    
    async def upsert_fundamental_data(self, fundamental_data: FundamentalData) -> bool:
        """
        Insert or update fundamental data in the database.
        
        Args:
            fundamental_data: FundamentalData object to upsert
            
        Returns:
            True if successful, False otherwise
        """
        try:
            client = await self._get_authenticated_client() if self.access_token else self.supabase_client
            
            # Prepare data for upsert
            fundamental_record = {
                "symbol": fundamental_data.symbol,
                "fiscal_year": fundamental_data.fiscal_year,
                "fiscal_quarter": fundamental_data.fiscal_quarter,
                "sector": fundamental_data.sector,
                "pe_ratio": float(fundamental_data.pe_ratio) if fundamental_data.pe_ratio is not None else None,
                "pb_ratio": float(fundamental_data.pb_ratio) if fundamental_data.pb_ratio is not None else None,
                "ps_ratio": float(fundamental_data.ps_ratio) if fundamental_data.ps_ratio is not None else None,
                "dividend_yield": float(fundamental_data.dividend_yield) if fundamental_data.dividend_yield is not None else None,
                "roe": float(fundamental_data.roe) if fundamental_data.roe is not None else None,
                "roa": float(fundamental_data.roa) if fundamental_data.roa is not None else None,
                "gross_margin": float(fundamental_data.gross_margin) if fundamental_data.gross_margin is not None else None,
                "operating_margin": float(fundamental_data.operating_margin) if fundamental_data.operating_margin is not None else None,
                "net_margin": float(fundamental_data.net_margin) if fundamental_data.net_margin is not None else None,
                "current_ratio": float(fundamental_data.current_ratio) if fundamental_data.current_ratio is not None else None,
                "debt_to_equity": float(fundamental_data.debt_to_equity) if fundamental_data.debt_to_equity is not None else None,
                "eps": float(fundamental_data.eps) if fundamental_data.eps is not None else None,
                "book_value_per_share": float(fundamental_data.book_value_per_share) if fundamental_data.book_value_per_share is not None else None,
                "market_cap": float(fundamental_data.market_cap) if fundamental_data.market_cap is not None else None,
                "beta": float(fundamental_data.beta) if fundamental_data.beta is not None else None,
                "shares_outstanding": float(fundamental_data.shares_outstanding) if fundamental_data.shares_outstanding is not None else None,
                "data_provider": fundamental_data.data_provider,
                "updated_at": datetime.now().isoformat()
            }
            
            # Use Supabase upsert operation
            response = client.table('fundamental_data')\
                .upsert(fundamental_record, 
                       on_conflict='symbol,fiscal_year,fiscal_quarter,data_provider')\
                .execute()
            
            logger.info(f"Successfully processed fundamental data for {fundamental_data.symbol}")
            return True
            
        except Exception as e:
            logger.error(f"Error upserting fundamental data for {fundamental_data.symbol}: {e}")
            return False
    
    async def sync_symbol_data(self, symbol: str) -> Dict[str, Any]:
        """
        Synchronize all data (earnings + fundamental) for a specific symbol.
        
        Args:
            symbol: Stock symbol to sync
            
        Returns:
            Dictionary with sync results
        """
        results = {
            "symbol": symbol.upper(),
            "earnings_processed": 0,
            "fundamental_processed": False,
            "errors": []
        }
        
        try:
            # Sync earnings data
            earnings_data = self.yfinance_service.fetch_earnings_data(symbol)
            if earnings_data:
                results["earnings_processed"] = await self.upsert_earnings_data(earnings_data)
            
            # Sync fundamental data
            fundamental_data = self.yfinance_service.fetch_fundamental_data(symbol)
            if fundamental_data:
                results["fundamental_processed"] = await self.upsert_fundamental_data(fundamental_data)
            
        except Exception as e:
            error_msg = f"Error syncing data for {symbol}: {e}"
            logger.error(error_msg)
            results["errors"].append(error_msg)
        
        return results
    
    async def bulk_sync_missing_data(self, symbols: List[str] = None) -> Dict[str, Any]:
        """
        Bulk synchronization of missing data for multiple symbols.
        
        Args:
            symbols: List of symbols to sync. If None, syncs all symbols with missing data.
            
        Returns:
            Dictionary with bulk sync results
        """
        results = {
            "total_symbols": 0,
            "successful_syncs": 0,
            "failed_syncs": 0,
            "earnings_records_added": 0,
            "fundamental_records_added": 0,
            "errors": []
        }
        
        try:
            if symbols is None:
                # Get symbols with missing data
                missing_earnings = await self.get_missing_earnings_data()
                missing_fundamentals = set(await self.get_missing_fundamental_data())
                symbols = list(set(list(missing_earnings.keys()) + list(missing_fundamentals)))
            
            results["total_symbols"] = len(symbols)
            
            for symbol in symbols:
                try:
                    sync_result = await self.sync_symbol_data(symbol)
                    
                    if sync_result["errors"]:
                        results["failed_syncs"] += 1
                        results["errors"].extend(sync_result["errors"])
                    else:
                        results["successful_syncs"] += 1
                    
                    results["earnings_records_added"] += sync_result["earnings_processed"]
                    if sync_result["fundamental_processed"]:
                        results["fundamental_records_added"] += 1
                        
                except Exception as e:
                    results["failed_syncs"] += 1
                    error_msg = f"Failed to sync {symbol}: {e}"
                    logger.error(error_msg)
                    results["errors"].append(error_msg)
            
            logger.info(f"Bulk sync completed: {results['successful_syncs']}/{results['total_symbols']} successful")
            
        except Exception as e:
            error_msg = f"Error in bulk sync operation: {e}"
            logger.error(error_msg)
            results["errors"].append(error_msg)
        
        return results
