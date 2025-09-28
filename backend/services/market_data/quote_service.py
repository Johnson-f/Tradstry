# backend/services/market_data/quote_service.py

from typing import Optional, List, Dict, Any
from datetime import date, datetime, timezone
from decimal import Decimal
import httpx
import asyncio
from .base_service import BaseMarketDataService
from models.market_data import (
    StockQuote, StockQuoteWithPrices, StockQuoteRequest, QuoteRequest, QuoteResponse, QuoteResult
)

class QuoteService(BaseMarketDataService):
    """Service for stock quote and metric operations."""

    async def get_stock_quotes(
        self, 
        request: StockQuoteRequest, 
        access_token: str = None
    ) -> Optional[StockQuote]:
        """Get stock quote metadata from database (no prices)."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_quote_date': request.quote_date.isoformat() if request.quote_date else date.today().isoformat(),
                'p_data_provider': request.data_provider
            }
            response = client.rpc('get_stock_quotes', params).execute()
            if response.data and len(response.data) > 0:
                return StockQuote(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    async def get_stock_quotes_with_prices(
        self, 
        symbol: str, 
        access_token: str = None
    ) -> Optional[StockQuoteWithPrices]:
        """
        Get stock quote with real-time prices. 
        Flow: Check database → If not exists, fetch from API & store → Return with prices
        """
        symbol = symbol.upper().strip()
        print(f"Fetching stock quote with prices for: {symbol}")
        
        # Step 1: Check if symbol exists in database
        existing_quote = await self._check_symbol_in_database(symbol, access_token)
        
        # Step 2: If symbol doesn't exist, fetch from API and store
        if not existing_quote:
            print(f"Symbol {symbol} not found in database. Fetching from API...")
            api_data = await self._fetch_from_finance_query_api(symbol)
            
            if api_data:
                # Store symbol in database
                stored_quote = await self._store_symbol_in_database(symbol, api_data, access_token)
                if stored_quote:
                    existing_quote = stored_quote
                    print(f"Successfully stored {symbol} in database")
                else:
                    print(f"Failed to store {symbol} in database")
            else:
                print(f"No data found for {symbol} from API")
                return None
        
        # Step 3: Get real-time prices and combine with database data
        if existing_quote:
            api_data = await self._fetch_from_finance_query_api(symbol)
            if api_data:
                return self._combine_database_and_api_data(existing_quote, api_data)
            else:
                # Return database data without prices if API fails
                return StockQuoteWithPrices(
                    symbol=existing_quote.symbol,
                    quote_date=existing_quote.quote_date,
                    quote_timestamp=existing_quote.quote_timestamp,
                    data_provider=existing_quote.data_provider,
                    exchange_id=existing_quote.exchange_id
                )
        
        return None

    async def _check_symbol_in_database(
        self, 
        symbol: str, 
        access_token: str = None
    ) -> Optional[StockQuote]:
        """Check if symbol exists in stock_quotes table."""
        async def operation(client):
            # Check if symbol exists (get most recent entry)
            response = client.table('stock_quotes').select('*').eq('symbol', symbol).order('quote_timestamp', desc=True).limit(1).execute()
            
            if response.data and len(response.data) > 0:
                data = response.data[0]
                return StockQuote(
                    symbol=data['symbol'],
                    quote_date=data.get('quote_timestamp', datetime.now()).date(),
                    quote_timestamp=data.get('quote_timestamp'),
                    data_provider=data.get('data_provider'),
                    exchange_id=data.get('exchange_id')
                )
            return None
        
        return await self._execute_with_retry(operation, access_token)

    async def _fetch_from_finance_query_api(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetch real-time data from finance-query API."""
        if not symbol:
            return None

        try:
            api_url = f"https://finance-query.onrender.com/v1/simple-quotes"
            params = {"symbols": symbol}
            
            print(f"Fetching real-time data for {symbol} from finance-query API")
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(api_url, params=params)
                
                if response.status_code != 200:
                    print(f"API request failed for {symbol}: {response.status_code}")
                    return None
                
                data = response.json()
                
                if not data or not isinstance(data, list) or len(data) == 0:
                    print(f"No data returned for {symbol}")
                    return None
                
                # Return the first (and should be only) result
                return data[0] if isinstance(data[0], dict) else None
                
        except httpx.RequestError as e:
            print(f"HTTP request error for {symbol}: {e}")
            return None
        except Exception as e:
            print(f"Unexpected error fetching data for {symbol}: {e}")
            return None

    async def _store_symbol_in_database(
        self, 
        symbol: str, 
        api_data: Dict[str, Any], 
        access_token: str = None
    ) -> Optional[StockQuote]:
        """Store new symbol in stock_quotes table."""
        async def operation(client):
            try:
                current_time = datetime.now(timezone.utc)
                
                # Prepare data for insertion
                quote_data = {
                    "symbol": symbol.upper(),
                    "quote_timestamp": current_time.isoformat(),
                    "data_provider": "finance_query",
                    "exchange_id": None  # Would need additional logic to determine exchange
                }
                
                # Insert into database
                response = client.table('stock_quotes').insert(quote_data).execute()
                
                if response.data and len(response.data) > 0:
                    data = response.data[0]
                    return StockQuote(
                        symbol=data['symbol'],
                        quote_date=current_time.date(),
                        quote_timestamp=current_time,
                        data_provider=data.get('data_provider'),
                        exchange_id=data.get('exchange_id')
                    )
                return None
                
            except Exception as e:
                print(f"Error storing {symbol} in database: {e}")
                return None
        
        return await self._execute_with_retry(operation, access_token)

    def _combine_database_and_api_data(
        self, 
        db_quote: StockQuote, 
        api_data: Dict[str, Any]
    ) -> StockQuoteWithPrices:
        """Combine database metadata with real-time API data."""
        return StockQuoteWithPrices(
            # Database metadata
            symbol=db_quote.symbol,
            quote_date=db_quote.quote_date,
            quote_timestamp=db_quote.quote_timestamp,
            data_provider=db_quote.data_provider,
            exchange_id=db_quote.exchange_id,
            # Real-time API data
            name=api_data.get('name'),
            price=self._safe_decimal(api_data.get('price')),
            after_hours_price=self._safe_decimal(api_data.get('afterHoursPrice')),
            change=self._safe_decimal(api_data.get('change')),
            percent_change=api_data.get('percentChange'),
            logo=api_data.get('logo')
        )

    def _safe_decimal(self, value: Any) -> Optional[Decimal]:
        """Safely convert string/number to Decimal."""
        if value is None:
            return None
        try:
            if isinstance(value, str):
                cleaned_value = value.replace('%', '').replace('$', '').replace(',', '').strip()
                if cleaned_value == '' or cleaned_value == '-':
                    return None
                return Decimal(cleaned_value)
            return Decimal(str(value))
        except (ValueError, TypeError):
            return None

    async def get_quotes(
        self, 
        request: QuoteRequest, 
        access_token: str = None
    ) -> QuoteResponse:
        """Get stock quotes from database instead of external API."""
        async def operation(client):
            symbols_array = [s.upper() for s in request.symbols]
            params = {'p_symbols': symbols_array}
            response = client.rpc('get_company_info_by_symbols', params).execute()
            
            results = []
            if response.data:
                for item in response.data:
                    if 'yield' in item:
                        item['yield_'] = item.pop('yield')
                    
                    result = QuoteResult(
                        symbol=item.get('symbol', ''),
                        name=item.get('name') or item.get('company_name') or item.get('symbol', ''),
                        price=float(item.get('price', 0) or 0),
                        change=float(item.get('change', 0) or 0),
                        changePercent=float(item.get('percent_change', 0) or 0),
                        dayHigh=float(item.get('high', 0) or 0),
                        dayLow=float(item.get('low', 0) or 0),
                        volume=int(item.get('volume', 0) or 0),
                        marketCap=item.get('market_cap'),
                        logo=item.get('logo')
                    )
                    results.append(result)
            
            found_symbols = {r.symbol.upper() for r in results}
            for symbol in request.symbols:
                if symbol.upper() not in found_symbols:
                    result = QuoteResult(
                        symbol=symbol,
                        name=symbol,
                        price=0.0,
                        change=0.0,
                        changePercent=0.0,
                        dayHigh=0.0,
                        dayLow=0.0,
                        volume=0
                    )
                    results.append(result)
            
            return QuoteResponse(quotes=results)
        
        return await self._execute_with_retry(operation, access_token)
