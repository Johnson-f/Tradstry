"""
Data Synchronization Service - Main orchestration service for market data syncing.
Coordinates yfinance data fetching, database operations, and background tasks.
"""

from typing import List, Dict, Any, Optional
import asyncio
import logging
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from supabase import Client

from database import get_supabase, get_supabase_admin_client
from auth_service import AuthService
from config import get_settings
from services.market_data_service import MarketDataService
from market_data.yfinance_service import YFinanceService

logger = logging.getLogger(__name__)
settings = get_settings()


class DataSyncService:
    """Main service for orchestrating market data synchronization"""
    
    def __init__(self, access_token: str = None):
        self.market_data_service = MarketDataService(access_token)
        self.yfinance_service = YFinanceService()
        self.auth_service = AuthService()
        self.access_token = access_token
        self.supabase_client = get_supabase_admin_client()  # Use admin client for service operations
        self.max_workers = 5  # Limit concurrent requests to yfinance
        self.rate_limit_delay = 1.0  # Seconds between requests
        
    async def sync_single_symbol(self, symbol: str) -> Dict[str, Any]:
        """
        Synchronize data for a single symbol.
        
        Args:
            symbol: Stock symbol to sync
            
        Returns:
            Dictionary with sync results
        """
        try:
            logger.info(f"Starting sync for symbol: {symbol}")
            
            # Validate symbol first
            if not self.yfinance_service.validate_symbol(symbol):
                return {
                    "symbol": symbol,
                    "success": False,
                    "error": f"Invalid symbol: {symbol}",
                    "earnings_processed": 0,
                    "fundamental_processed": False
                }
            
            # Perform synchronization
            result = await self.market_data_service.sync_symbol_data(symbol)
            result["success"] = len(result["errors"]) == 0
            
            logger.info(f"Completed sync for {symbol}: {result['earnings_processed']} earnings records, "
                       f"fundamental: {result['fundamental_processed']}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error syncing symbol {symbol}: {e}")
            return {
                "symbol": symbol,
                "success": False,
                "error": str(e),
                "earnings_processed": 0,
                "fundamental_processed": False
            }
    
    async def sync_multiple_symbols(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Synchronize data for multiple symbols with rate limiting and error handling.
        
        Args:
            symbols: List of stock symbols to sync
            
        Returns:
            Dictionary with comprehensive sync results
        """
            
        results = {
            "total_symbols": len(symbols),
            "successful_syncs": 0,
            "failed_syncs": 0,
            "total_earnings_records": 0,
            "total_fundamental_records": 0,
            "symbol_results": [],
            "errors": [],
            "sync_duration": None,
            "started_at": datetime.now().isoformat()
        }
        
        start_time = datetime.now()
        
        try:
            logger.info(f"Starting bulk sync for {len(symbols)} symbols")
            
            # Process symbols with rate limiting
            for i, symbol in enumerate(symbols):
                try:
                    # Add delay between requests to respect rate limits
                    if i > 0:
                        await asyncio.sleep(self.rate_limit_delay)
                    
                    result = await self.sync_single_symbol(symbol)
                    results["symbol_results"].append(result)
                    
                    if result["success"]:
                        results["successful_syncs"] += 1
                        results["total_earnings_records"] += result["earnings_processed"]
                        if result["fundamental_processed"]:
                            results["total_fundamental_records"] += 1
                    else:
                        results["failed_syncs"] += 1
                        if "error" in result:
                            results["errors"].append(f"{symbol}: {result['error']}")
                    
                    # Log progress every 10 symbols
                    if (i + 1) % 10 == 0:
                        logger.info(f"Progress: {i + 1}/{len(symbols)} symbols processed")
                        
                except Exception as e:
                    logger.error(f"Error processing symbol {symbol}: {e}")
                    results["failed_syncs"] += 1
                    results["errors"].append(f"{symbol}: {str(e)}")
                    results["symbol_results"].append({
                        "symbol": symbol,
                        "success": False,
                        "error": str(e),
                        "earnings_processed": 0,
                        "fundamental_processed": False
                    })
            
            end_time = datetime.now()
            results["sync_duration"] = str(end_time - start_time)
            results["completed_at"] = end_time.isoformat()
            
            logger.info(f"Bulk sync completed: {results['successful_syncs']}/{results['total_symbols']} successful, "
                       f"Duration: {results['sync_duration']}")
            
        except Exception as e:
            logger.error(f"Error in bulk sync operation: {e}")
            results["errors"].append(f"Bulk sync error: {str(e)}")
        
        return results
    
    async def sync_missing_data(self, symbols: List[str] = None) -> Dict[str, Any]:
        """
        Synchronize only missing data for specified symbols or all symbols.
        
        Args:
            symbols: List of symbols to check (optional, will check all if None)
            
        Returns:
            Dictionary with sync results
        """
        try:
            logger.info("Starting missing data sync")
            
            # Get symbols with missing data
            missing_earnings = await self.market_data_service.get_missing_earnings_data(symbols)
            missing_fundamentals = set(await self.market_data_service.get_missing_fundamental_data(symbols))
            
            # Combine all symbols that need updates
            symbols_to_sync = list(set(list(missing_earnings.keys()) + list(missing_fundamentals)))
            
            if not symbols_to_sync:
                logger.info("No missing data found")
                return {
                    "total_symbols": 0,
                    "successful_syncs": 0,
                    "failed_syncs": 0,
                    "message": "No missing data found",
                    "symbol_results": []
                }
            
            logger.info(f"Found {len(symbols_to_sync)} symbols with missing data")
            
            # Sync the symbols with missing data
            return await self.sync_multiple_symbols(symbols_to_sync)
            
        except Exception as e:
            logger.error(f"Error in missing data sync: {e}")
            return {
                "error": str(e),
                "total_symbols": 0,
                "successful_syncs": 0,
                "failed_syncs": 1
            }
    
    async def get_sync_status(self, symbols: List[str] = None) -> Dict[str, Any]:
        """
        Get the current synchronization status for symbols.
        
        Args:
            symbols: List of symbols to check (optional)
            
        Returns:
            Dictionary with status information
        """
        try:
            missing_earnings = await self.market_data_service.get_missing_earnings_data(symbols)
            missing_fundamentals = await self.market_data_service.get_missing_fundamental_data(symbols)
            
            status = {
                "total_symbols_checked": len(symbols) if symbols else "all",
                "symbols_missing_earnings": len(missing_earnings),
                "symbols_missing_fundamentals": len(missing_fundamentals),
                "missing_earnings_detail": missing_earnings,
                "missing_fundamentals_list": missing_fundamentals,
                "last_checked": datetime.now().isoformat()
            }
            
            return status
            
        except Exception as e:
            logger.error(f"Error getting sync status: {e}")
            return {"error": str(e)}
    
    def get_supported_symbols(self) -> List[str]:
        """
        Get list of commonly supported symbols for reference.
        This is a helper method for users to know what symbols are typically available.
        """
        # Common large-cap symbols that are well-supported by yfinance
        return [
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "BRK-B",
            "JNJ", "V", "WMT", "JPM", "PG", "UNH", "DIS", "HD", "MA", "PFE",
            "BAC", "ABBV", "CRM", "KO", "ADBE", "PEP", "TMO", "COST", "AVGO",
            "DHR", "ABT", "ACN", "VZ", "CMCSA", "LLY", "NKE", "MCD", "CVX"
        ]
    
    async def health_check(self) -> Dict[str, Any]:
        """
        Perform a health check of the data sync service.
        
        Returns:
            Dictionary with health status
        """
        health_status = {
            "service_name": "DataSyncService",
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "yfinance_connection": False,
            "database_connection": False,
            "errors": []
        }
        
        try:
            # Test yfinance connection with a simple symbol
            test_symbol = "AAPL"
            if self.yfinance_service.validate_symbol(test_symbol):
                health_status["yfinance_connection"] = True
            else:
                health_status["errors"].append("Failed to validate test symbol with yfinance")
            
            # Test Supabase connection
            try:
                # Simple query to test Supabase connection
                response = self.supabase_client.table('earnings_data').select('id', count='exact').limit(1).execute()
                if response is not None:
                    health_status["database_connection"] = True
                else:
                    health_status["errors"].append("Supabase query returned unexpected result")
            except Exception as e:
                health_status["errors"].append(f"Supabase connection error: {e}")
            
            # Update overall status
            if health_status["errors"]:
                health_status["status"] = "unhealthy"
            
        except Exception as e:
            health_status["status"] = "unhealthy"
            health_status["errors"].append(f"Health check error: {e}")
        
        return health_status
