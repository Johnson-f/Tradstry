"""
Market Data Integration Service

This service integrates the market data fetching system with your existing
database upsert functions. Use this as your main interface for fetching
and storing market data.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import date, datetime, timedelta

from .market_data import MarketDataOrchestrator, MarketDataConfig
from .market_data.examples import MarketDataService
from .database import get_supabase
from .base_database_service import BaseDatabaseService

logger = logging.getLogger(__name__)


class IntegratedMarketDataService(MarketDataService):
    """
    Enhanced market data service that integrates directly with your database.
    
    This service extends the basic MarketDataService to provide direct
    database integration using your existing upsert patterns.
    """
    
    def __init__(self, config: MarketDataConfig = None, supabase_client=None):
        """Initialize with database connection"""
        super().__init__(config)
        self.supabase = supabase_client or get_supabase()
    
    async def fetch_and_upsert_stock_quote(self, symbol: str, user_id: str = None) -> Dict[str, Any]:
        """
        Fetch stock quote and directly upsert to database.
        
        Args:
            symbol: Stock symbol to fetch
            user_id: Optional user ID for user-specific data
            
        Returns:
            Result dictionary with success status and metadata
        """
        try:
            # Fetch the quote data
            quote_result = await self.fetch_and_store_quote(symbol)
            
            if not quote_result['success']:
                return quote_result
            
            # Prepare data for database upsert
            quote_data = quote_result['data']
            
            # Add user_id if provided
            if user_id:
                quote_data['user_id'] = user_id
            
            # Upsert to stocks table (adjust table name as needed)
            result = self.supabase.table('stocks').upsert(quote_data).execute()
            
            return {
                'success': True,
                'provider': quote_result['provider'],
                'symbol': symbol,
                'price': quote_data['price'],
                'database_result': 'upserted',
                'records_affected': len(result.data) if result.data else 1
            }
            
        except Exception as e:
            logger.error(f"Error upserting stock quote for {symbol}: {e}")
            return {
                'success': False,
                'error': str(e),
                'symbol': symbol
            }
    
    async def fetch_and_upsert_historical_data(
        self, 
        symbol: str, 
        days_back: int = 30,
        interval: str = "1d",
        user_id: str = None
    ) -> Dict[str, Any]:
        """
        Fetch historical data and directly upsert to database.
        
        Args:
            symbol: Stock symbol to fetch
            days_back: Number of days of historical data
            interval: Time interval
            user_id: Optional user ID for user-specific data
            
        Returns:
            Result dictionary with success status and metadata
        """
        try:
            # Fetch the historical data
            historical_result = await self.fetch_and_store_historical(symbol, days_back, interval)
            
            if not historical_result['success']:
                return historical_result
            
            # Prepare data for database upsert
            historical_data = historical_result['data']
            
            # Add user_id to each record if provided
            if user_id:
                for record in historical_data:
                    record['user_id'] = user_id
            
            # Batch upsert to historical_prices table (adjust table name as needed)
            result = self.supabase.table('historical_prices').upsert(historical_data).execute()
            
            return {
                'success': True,
                'provider': historical_result['provider'],
                'symbol': symbol,
                'interval': interval,
                'records_count': len(historical_data),
                'database_result': 'upserted',
                'records_affected': len(result.data) if result.data else len(historical_data)
            }
            
        except Exception as e:
            logger.error(f"Error upserting historical data for {symbol}: {e}")
            return {
                'success': False,
                'error': str(e),
                'symbol': symbol
            }
    
    async def fetch_and_upsert_options_data(
        self, 
        symbol: str, 
        expiration: date = None,
        user_id: str = None
    ) -> Dict[str, Any]:
        """
        Fetch options data and directly upsert to database.
        
        Args:
            symbol: Stock symbol to fetch options for
            expiration: Optional expiration date filter
            user_id: Optional user ID for user-specific data
            
        Returns:
            Result dictionary with success status and metadata
        """
        try:
            # Fetch the options data
            options_result = await self.fetch_and_store_options(symbol, expiration)
            
            if not options_result['success']:
                return options_result
            
            # Prepare data for database upsert
            options_data = options_result['data']
            
            # Add user_id to each record if provided
            if user_id:
                for record in options_data:
                    record['user_id'] = user_id
            
            # Batch upsert to options table (adjust table name as needed)
            result = self.supabase.table('options').upsert(options_data).execute()
            
            return {
                'success': True,
                'provider': options_result['provider'],
                'symbol': symbol,
                'contracts_count': len(options_data),
                'database_result': 'upserted',
                'records_affected': len(result.data) if result.data else len(options_data)
            }
            
        except Exception as e:
            logger.error(f"Error upserting options data for {symbol}: {e}")
            return {
                'success': False,
                'error': str(e),
                'symbol': symbol
            }
    
    async def batch_update_portfolio_quotes(
        self, 
        symbols: List[str], 
        user_id: str = None
    ) -> Dict[str, Any]:
        """
        Batch update quotes for a portfolio of symbols.
        
        Args:
            symbols: List of stock symbols
            user_id: Optional user ID for user-specific data
            
        Returns:
            Summary of batch update results
        """
        results = {
            'success_count': 0,
            'error_count': 0,
            'total_symbols': len(symbols),
            'details': {},
            'providers_used': set(),
            'errors': []
        }
        
        # Fetch all quotes concurrently
        quote_results = await self.batch_fetch_quotes(symbols)
        
        # Process each result
        for symbol, quote_result in quote_results.items():
            try:
                if quote_result['success']:
                    # Prepare for database upsert
                    quote_data = quote_result['data']
                    if user_id:
                        quote_data['user_id'] = user_id
                    
                    # Upsert to database
                    db_result = self.supabase.table('stocks').upsert(quote_data).execute()
                    
                    results['success_count'] += 1
                    results['providers_used'].add(quote_result['provider'])
                    results['details'][symbol] = {
                        'success': True,
                        'price': quote_data['price'],
                        'provider': quote_result['provider']
                    }
                else:
                    results['error_count'] += 1
                    results['errors'].append(f"{symbol}: {quote_result['error']}")
                    results['details'][symbol] = {
                        'success': False,
                        'error': quote_result['error']
                    }
                    
            except Exception as e:
                results['error_count'] += 1
                error_msg = f"{symbol}: Database error - {str(e)}"
                results['errors'].append(error_msg)
                results['details'][symbol] = {
                    'success': False,
                    'error': str(e)
                }
                logger.error(f"Database error for {symbol}: {e}")
        
        # Convert set to list for JSON serialization
        results['providers_used'] = list(results['providers_used'])
        
        return results
    
    async def update_watchlist_data(
        self, 
        watchlist_symbols: List[str], 
        user_id: str,
        include_historical: bool = False,
        historical_days: int = 30
    ) -> Dict[str, Any]:
        """
        Update all data for a user's watchlist.
        
        Args:
            watchlist_symbols: List of symbols in watchlist
            user_id: User ID
            include_historical: Whether to fetch historical data
            historical_days: Days of historical data to fetch
            
        Returns:
            Comprehensive update results
        """
        results = {
            'user_id': user_id,
            'total_symbols': len(watchlist_symbols),
            'quotes_updated': 0,
            'historical_updated': 0,
            'errors': [],
            'providers_used': set(),
            'start_time': datetime.now().isoformat(),
            'details': {}
        }
        
        # Update quotes for all symbols
        quote_results = await self.batch_update_portfolio_quotes(watchlist_symbols, user_id)
        results['quotes_updated'] = quote_results['success_count']
        results['providers_used'].update(quote_results['providers_used'])
        results['errors'].extend(quote_results['errors'])
        
        # Update historical data if requested
        if include_historical:
            for symbol in watchlist_symbols:
                try:
                    historical_result = await self.fetch_and_upsert_historical_data(
                        symbol, historical_days, "1d", user_id
                    )
                    
                    if historical_result['success']:
                        results['historical_updated'] += 1
                        results['providers_used'].add(historical_result['provider'])
                        results['details'][f"{symbol}_historical"] = {
                            'success': True,
                            'records': historical_result['records_count'],
                            'provider': historical_result['provider']
                        }
                    else:
                        results['errors'].append(f"{symbol} historical: {historical_result['error']}")
                        
                except Exception as e:
                    error_msg = f"{symbol} historical: {str(e)}"
                    results['errors'].append(error_msg)
                    logger.error(f"Historical data error for {symbol}: {e}")
        
        results['end_time'] = datetime.now().isoformat()
        results['providers_used'] = list(results['providers_used'])
        
        return results
    
    def get_system_status(self) -> Dict[str, Any]:
        """
        Get comprehensive system status.
        
        Returns:
            System status including providers, database, and cache
        """
        return {
            'providers': self.orchestrator.get_provider_status(),
            'available_providers': self.orchestrator.get_available_providers(),
            'cache_enabled': self.config.enable_caching,
            'cache_ttl': self.config.cache_ttl_seconds,
            'database_connected': self.supabase is not None,
            'timestamp': datetime.now().isoformat()
        }


# Convenience functions for easy integration

async def update_stock_quote(symbol: str, user_id: str = None) -> Dict[str, Any]:
    """
    Convenience function to update a single stock quote.
    
    Args:
        symbol: Stock symbol
        user_id: Optional user ID
        
    Returns:
        Update result
    """
    service = IntegratedMarketDataService()
    return await service.fetch_and_upsert_stock_quote(symbol, user_id)


async def update_portfolio_quotes(symbols: List[str], user_id: str = None) -> Dict[str, Any]:
    """
    Convenience function to update multiple stock quotes.
    
    Args:
        symbols: List of stock symbols
        user_id: Optional user ID
        
    Returns:
        Batch update results
    """
    service = IntegratedMarketDataService()
    return await service.batch_update_portfolio_quotes(symbols, user_id)


async def update_historical_data(
    symbol: str, 
    days_back: int = 30, 
    user_id: str = None
) -> Dict[str, Any]:
    """
    Convenience function to update historical data for a symbol.
    
    Args:
        symbol: Stock symbol
        days_back: Number of days of historical data
        user_id: Optional user ID
        
    Returns:
        Update result
    """
    service = IntegratedMarketDataService()
    return await service.fetch_and_upsert_historical_data(symbol, days_back, "1d", user_id)


# Example usage
async def example_integration():
    """Example of how to use the integrated service"""
    
    # Initialize the service
    service = IntegratedMarketDataService()
    
    # Update a single stock quote
    result = await service.fetch_and_upsert_stock_quote("AAPL", user_id="user123")
    print(f"Quote update: {result}")
    
    # Batch update portfolio
    portfolio = ["AAPL", "GOOGL", "MSFT", "TSLA"]
    batch_result = await service.batch_update_portfolio_quotes(portfolio, user_id="user123")
    print(f"Portfolio update: {batch_result['success_count']}/{batch_result['total_symbols']} successful")
    
    # Update watchlist with historical data
    watchlist_result = await service.update_watchlist_data(
        portfolio, 
        user_id="user123", 
        include_historical=True,
        historical_days=7
    )
    print(f"Watchlist update: {watchlist_result}")
    
    # Check system status
    status = service.get_system_status()
    print(f"System status: {status}")


if __name__ == "__main__":
    asyncio.run(example_integration())
