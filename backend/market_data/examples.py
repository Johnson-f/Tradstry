"""
Example usage of the Market Data Orchestrator system.

This file demonstrates how to use the market data fetching system
with automatic provider fallback and integration with database upsert functions.
"""

import asyncio
from datetime import date, datetime, timedelta
from typing import List, Dict, Any

from .orchestrator import MarketDataOrchestrator, FetchResult
from .config import MarketDataConfig
from .base import StockQuote, HistoricalPrice, OptionQuote, CompanyInfo


class MarketDataService:
    """
    Service class that integrates market data fetching with database operations.
    
    This is the main class you'll use in your application to fetch market data
    and save it to your database using your existing upsert functions.
    """
    
    def __init__(self, config: MarketDataConfig = None):
        """Initialize the service with market data orchestrator"""
        self.orchestrator = MarketDataOrchestrator(config)
    
    async def fetch_economic_events(
        self,
        countries: Optional[List[str]] = None,
        importance: Optional[int] = None,
        days_ahead: int = 7,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Fetch economic events and return them in a database-ready format.
        
        Args:
            countries: List of country codes to filter by (e.g., ['US', 'EU', 'GB'])
            importance: Filter by importance (1=Low, 2=Medium, 3=High)
            days_ahead: Number of days in the future to fetch events for
            limit: Maximum number of events to return
            
        Returns:
            List of economic events in database-ready format
        """
        from datetime import date, timedelta
        
        # Calculate date range
        today = date.today()
        end_date = today + timedelta(days=days_ahead)
        
        # Fetch economic events
        result = await self.orchestrator.get_economic_events(
            countries=countries,
            importance=importance,
            start_date=today,
            end_date=end_date,
            limit=limit
        )
        
        if not result.success:
            self._log_error("fetch_economic_events", result.error)
            return []
            
        # Convert to database-ready format
        events = []
        for event in result.data:
            events.append({
                'event_id': event.event_id,
                'country': event.country,
                'event_name': event.event_name,
                'event_period': event.event_period,
                'actual': str(event.actual) if event.actual is not None else None,
                'previous': str(event.previous) if event.previous is not None else None,
                'forecast': str(event.forecast) if event.forecast is not None else None,
                'unit': event.unit,
                'importance': event.importance,
                'event_time': event.timestamp,
                'last_updated': event.last_update or datetime.utcnow(),
                'description': event.description,
                'url': event.url,
                'provider': event.provider
            })
            
        return events
        
    async def fetch_and_store_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Fetch current quote and prepare for database storage.
        
        Args:
            symbol: Stock symbol to fetch
            
        Returns:
            Dictionary ready for database upsert
        """
        result = await self.orchestrator.get_quote(symbol)
        
        if not result.success:
            return {
                'success': False,
                'error': result.error,
                'provider': result.provider
            }
        
        quote: StockQuote = result.data
        
        # Convert to format suitable for your database upsert function
        return {
            'success': True,
            'provider': result.provider,
            'data': {
                'symbol': quote.symbol,
                'price': float(quote.price),
                'change': float(quote.change),
                'change_percent': float(quote.change_percent),
                'volume': quote.volume,
                'open': float(quote.open) if quote.open else None,
                'high': float(quote.high) if quote.high else None,
                'low': float(quote.low) if quote.low else None,
                'previous_close': float(quote.previous_close) if quote.previous_close else None,
                'timestamp': quote.timestamp.isoformat(),
                'provider': quote.provider,
                'created_at': datetime.now().isoformat()
            }
        }
    
    async def fetch_and_store_historical(
        self, 
        symbol: str, 
        days_back: int = 30,
        interval: str = "1d"
    ) -> Dict[str, Any]:
        """
        Fetch historical data and prepare for database storage.
        
        Args:
            symbol: Stock symbol to fetch
            days_back: Number of days of historical data
            interval: Time interval (1d, 1h, 5min, etc.)
            
        Returns:
            Dictionary with historical data ready for database upsert
        """
        end_date = date.today()
        start_date = end_date - timedelta(days=days_back)
        
        result = await self.orchestrator.get_historical(
            symbol, start_date, end_date, interval
        )
        
        if not result.success:
            return {
                'success': False,
                'error': result.error,
                'provider': result.provider
            }
        
        historical_data: List[HistoricalPrice] = result.data
        
        # Convert to format suitable for your database upsert function
        return {
            'success': True,
            'provider': result.provider,
            'count': len(historical_data),
            'data': [
                {
                    'symbol': price.symbol,
                    'date': price.date.isoformat(),
                    'open': float(price.open),
                    'high': float(price.high),
                    'low': float(price.low),
                    'close': float(price.close),
                    'volume': price.volume,
                    'adjusted_close': float(price.adjusted_close) if price.adjusted_close else None,
                    'dividend': float(price.dividend) if price.dividend else None,
                    'split': float(price.split) if price.split else None,
                    'provider': price.provider,
                    'interval': interval,
                    'created_at': datetime.now().isoformat()
                }
                for price in historical_data
            ]
        }
    
    async def fetch_and_store_options(
        self, 
        symbol: str, 
        expiration: date = None
    ) -> Dict[str, Any]:
        """
        Fetch options chain and prepare for database storage.
        
        Args:
            symbol: Stock symbol to fetch options for
            expiration: Optional expiration date filter
            
        Returns:
            Dictionary with options data ready for database upsert
        """
        result = await self.orchestrator.get_options_chain(symbol, expiration)
        
        if not result.success:
            return {
                'success': False,
                'error': result.error,
                'provider': result.provider
            }
        
        options_data: List[OptionQuote] = result.data
        
        # Convert to format suitable for your database upsert function
        return {
            'success': True,
            'provider': result.provider,
            'count': len(options_data),
            'data': [
                {
                    'symbol': option.symbol,
                    'underlying_symbol': option.underlying_symbol,
                    'strike': float(option.strike),
                    'expiration': option.expiration.isoformat(),
                    'option_type': option.option_type,
                    'bid': float(option.bid) if option.bid else None,
                    'ask': float(option.ask) if option.ask else None,
                    'last_price': float(option.last_price) if option.last_price else None,
                    'volume': option.volume,
                    'open_interest': option.open_interest,
                    'implied_volatility': float(option.implied_volatility) if option.implied_volatility else None,
                    'delta': float(option.delta) if option.delta else None,
                    'gamma': float(option.gamma) if option.gamma else None,
                    'theta': float(option.theta) if option.theta else None,
                    'vega': float(option.vega) if option.vega else None,
                    'timestamp': option.timestamp.isoformat(),
                    'provider': option.provider,
                    'created_at': datetime.now().isoformat()
                }
                for option in options_data
            ]
        }
    
    async def fetch_and_store_company_info(self, symbol: str) -> Dict[str, Any]:
        """
        Fetch company information and prepare for database storage.
        
        Args:
            symbol: Stock symbol to fetch company info for
            
        Returns:
            Dictionary with company data ready for database upsert
        """
        result = await self.orchestrator.get_company_info(symbol)
        
        if not result.success:
            return {
                'success': False,
                'error': result.error,
                'provider': result.provider
            }
        
        company: CompanyInfo = result.data
        
        return {
            'success': True,
            'provider': result.provider,
            'data': {
                'symbol': company.symbol,
                'name': company.name,
                'exchange': company.exchange,
                'sector': company.sector,
                'industry': company.industry,
                'market_cap': company.market_cap,
                'employees': company.employees,
                'description': company.description,
                'website': company.website,
                'ceo': company.ceo,
                'headquarters': company.headquarters,
                'founded': company.founded,
                'provider': company.provider,
                'created_at': datetime.now().isoformat()
            }
        }
    
    async def batch_fetch_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Fetch quotes for multiple symbols concurrently.
        
        Args:
            symbols: List of stock symbols
            
        Returns:
            Dictionary mapping symbols to quote data
        """
        results = await self.orchestrator.get_multiple_quotes(symbols)
        
        processed_results = {}
        for symbol, result in results.items():
            if result.success:
                quote: StockQuote = result.data
                processed_results[symbol] = {
                    'success': True,
                    'provider': result.provider,
                    'data': {
                        'symbol': quote.symbol,
                        'price': float(quote.price),
                        'change': float(quote.change),
                        'change_percent': float(quote.change_percent),
                        'volume': quote.volume,
                        'timestamp': quote.timestamp.isoformat(),
                        'provider': quote.provider
                    }
                }
            else:
                processed_results[symbol] = {
                    'success': False,
                    'error': result.error,
                    'provider': result.provider
                }
        
        return processed_results


# Example usage functions

async def example_basic_usage():
    """Basic usage example"""
    print("=== Basic Market Data Fetching Example ===")
    
    # Initialize the service
    service = MarketDataService()
    
    # Fetch a single quote
    quote_result = await service.fetch_and_store_quote("AAPL")
    print(f"Quote Result: {quote_result}")
    
    # Fetch historical data
    historical_result = await service.fetch_and_store_historical("AAPL", days_back=7)
    print(f"Historical Result: {historical_result['success']}, Count: {historical_result.get('count', 0)}")
    
    # Fetch company info
    company_result = await service.fetch_and_store_company_info("AAPL")
    print(f"Company Result: {company_result}")


async def example_batch_processing():
    """Batch processing example"""
    print("\n=== Batch Processing Example ===")
    
    service = MarketDataService()
    
    # Fetch quotes for multiple symbols
    symbols = ["AAPL", "GOOGL", "MSFT", "TSLA", "AMZN"]
    batch_results = await service.batch_fetch_quotes(symbols)
    
    for symbol, result in batch_results.items():
        if result['success']:
            price = result['data']['price']
            provider = result['provider']
            print(f"{symbol}: ${price:.2f} (from {provider})")
        else:
            print(f"{symbol}: Failed - {result['error']}")


async def example_options_data():
    """Options data example"""
    print("\n=== Options Data Example ===")
    
    service = MarketDataService()
    
    # Fetch options chain
    options_result = await service.fetch_and_store_options("AAPL")
    
    if options_result['success']:
        print(f"Found {options_result['count']} options contracts")
        print(f"Provider: {options_result['provider']}")
        
        # Show first few options
        for i, option in enumerate(options_result['data'][:3]):
            print(f"Option {i+1}: {option['option_type'].upper()} ${option['strike']} exp {option['expiration']}")
    else:
        print(f"Options fetch failed: {options_result['error']}")


async def example_integration_with_database():
    """Example showing integration with database upsert functions"""
    print("\n=== Database Integration Example ===")
    
    service = MarketDataService()
    
    # This is how you would integrate with your existing database upsert functions
    symbol = "AAPL"
    
    # 1. Fetch the data
    quote_result = await service.fetch_and_store_quote(symbol)
    
    if quote_result['success']:
        # 2. Use your existing upsert function
        # Example: await your_stock_upsert_function(quote_result['data'])
        print(f"Ready to upsert quote data: {quote_result['data']}")
        
        # For historical data
        historical_result = await service.fetch_and_store_historical(symbol, days_back=5)
        if historical_result['success']:
            # Example: await your_historical_upsert_function(historical_result['data'])
            print(f"Ready to upsert {len(historical_result['data'])} historical records")
    
    # Show provider status
    status = service.orchestrator.get_provider_status()
    print(f"Provider Status: {status}")


async def example_error_handling():
    """Example showing error handling and fallback"""
    print("\n=== Error Handling Example ===")
    
    service = MarketDataService()
    
    # Try to fetch data for an invalid symbol
    result = await service.fetch_and_store_quote("INVALID_SYMBOL")
    
    if not result['success']:
        print(f"Failed to fetch data: {result['error']}")
        print(f"Last attempted provider: {result['provider']}")
    
    # Show available providers
    available = service.orchestrator.get_available_providers()
    print(f"Available providers: {available}")


async def main():
    """Run all examples"""
    await example_basic_usage()
    await example_batch_processing()
    await example_options_data()
    await example_integration_with_database()
    await example_error_handling()


if __name__ == "__main__":
    # Run the examples
    asyncio.run(main())
