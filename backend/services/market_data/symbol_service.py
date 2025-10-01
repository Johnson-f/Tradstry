# backend/services/market_data/symbol_service.py

import os
import httpx
import asyncio
from datetime import datetime
from typing import List
from .base_service import BaseMarketDataService
from database import get_supabase_admin_client
from models.market_data import (
    SymbolCheckResponse, SymbolSaveResponse,
    SymbolSearchRequest, SymbolSearchResult, SymbolSearchResponse
)

class SymbolService(BaseMarketDataService):
    """Service for symbol management and search operations."""

    async def check_symbol_exists(self, symbol: str, access_token: str = None) -> SymbolCheckResponse:
        """Check if a symbol exists in the stock_quotes table."""
        async def operation(client):
            response = client.table('stock_quotes').select('symbol').eq('symbol', symbol).limit(1).execute()
            exists = len(response.data) > 0
            return SymbolCheckResponse(
                exists=exists,
                symbol=symbol,
                message=f"Symbol {symbol} {'found' if exists else 'not found'} in database"
            )
        
        return await self._execute_with_retry(operation, access_token)

    async def save_symbol_to_database(self, symbol: str, access_token: str = None) -> SymbolSaveResponse:
        """Save a symbol to the stock_quotes table for tracking. Real-time prices are fetched via API."""
        # Use admin client directly for this operation (bypasses RLS)
        admin_client = get_supabase_admin_client()
        
        # Check if symbol already exists
        try:
            existing_check = admin_client.table('stock_quotes').select('symbol').eq('symbol', symbol).limit(1).execute()
            
            if len(existing_check.data) > 0:
                return SymbolSaveResponse(
                    success=True,
                    symbol=symbol,
                    message=f'Symbol {symbol} already tracked. Real-time prices available via API.'
                )
        except Exception as e:
            print(f"Error checking symbol existence: {e}")
        
        # Fetch initial quote data (optional, for validation)
        initial_quote_data = None
        try:
            async with httpx.AsyncClient() as http_client:
                quote_response = await http_client.get(
                    f"https://finance-query.onrender.com/v1/quotes?symbols={symbol}",
                    timeout=10.0
                )
                if quote_response.status_code == 200:
                    quote_data = quote_response.json()
                    if isinstance(quote_data, list) and len(quote_data) > 0:
                        initial_quote_data = quote_data[0]
                    elif isinstance(quote_data, dict):
                        initial_quote_data = quote_data.get(symbol)
        except Exception as api_error:
            print(f"Failed to fetch initial quote data for symbol {symbol}: {api_error}")
        
        # Prepare insert data (metadata only, no price data)
        insert_data = {
            'symbol': symbol,
            'quote_timestamp': datetime.now().isoformat(),
            'data_provider': 'finance_query',
        }
        
        print(f"[Symbol Service] Inserting symbol metadata for {symbol}: {insert_data}")
        
        try:
            # Insert using admin client (bypasses RLS)
            response = admin_client.table('stock_quotes').insert(insert_data).execute()
            
            if response.data:
                message = f'Symbol {symbol} successfully tracked. Real-time prices available via API.'
                print(f"[Symbol Service] Successfully saved {symbol} to database")
                return SymbolSaveResponse(success=True, symbol=symbol, message=message)
            else:
                raise Exception("No data returned from insert operation")
        except Exception as e:
            error_msg = f"Failed to save symbol {symbol} to database: {str(e)}"
            print(f"[Symbol Service] ERROR: {error_msg}")
            raise Exception(error_msg)

    async def search_symbols(
        self, 
        request: SymbolSearchRequest, 
        access_token: str = None
    ) -> SymbolSearchResponse:
        """Search for stock symbols using multiple APIs in parallel."""
        
        async def search_finance_query():
            max_retries = 3
            base_delay = 1.0
            for attempt in range(max_retries):
                try:
                    url = "https://finance-query.onrender.com/v1/search"
                    params = {"query": request.query, "yahoo": "true" if request.yahoo else "false"}
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.get(url, params=params)
                        if response.status_code == 429:
                            if attempt < max_retries - 1:
                                delay = base_delay * (2 ** attempt)
                                await asyncio.sleep(delay)
                                continue
                            return []
                        response.raise_for_status()
                        data = response.json()
                        results = []
                        for item in (data if isinstance(data, list) else []):
                            results.append(SymbolSearchResult(
                                symbol=item.get('symbol', ''),
                                name=item.get('name') or item.get('longName') or item.get('symbol', ''),
                                exchange=item.get('exchange', 'Unknown'),
                                type=item.get('quoteType') or item.get('typeDisp') or item.get('type', 'Stock'),
                                currency=item.get('currency'),
                                marketCap=item.get('marketCap'),
                                sector=item.get('sector')
                            ))
                        return results
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        await asyncio.sleep(delay)
                        continue
                    return []
                except Exception:
                    return []
            return []

        async def search_polygon():
            polygon_api_key = os.getenv("POLYGON_API_KEY")
            if not polygon_api_key:
                return []
            max_retries = 3
            base_delay = 1.0
            for attempt in range(max_retries):
                try:
                    url = "https://api.polygon.io/v3/reference/tickers"
                    params = {"search": request.query, "active": "true", "limit": 50, "apikey": polygon_api_key}
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.get(url, params=params)
                        if response.status_code == 429:
                            if attempt < max_retries - 1:
                                delay = base_delay * (2 ** attempt)
                                await asyncio.sleep(delay)
                                continue
                            return []
                        response.raise_for_status()
                        data = response.json()
                        results = []
                        if data.get('results'):
                            for item in data['results']:
                                results.append(SymbolSearchResult(
                                    symbol=item.get('ticker', ''),
                                    name=item.get('name', ''),
                                    exchange=item.get('primary_exchange', 'Unknown'),
                                    type=item.get('type', 'Stock'),
                                    currency=item.get('currency_name', 'USD'),
                                    marketCap=item.get('market_cap'),
                                    sector=None
                                ))
                        return results
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        await asyncio.sleep(delay)
                        continue
                    return []
                except Exception:
                    return []
            return []

        async def search_finnhub():
            finnhub_api_key = os.getenv("FINNHUB_API_KEY")
            if not finnhub_api_key:
                return []
            max_retries = 3
            base_delay = 1.0
            for attempt in range(max_retries):
                try:
                    url = "https://finnhub.io/api/v1/search"
                    params = {"q": request.query, "token": finnhub_api_key}
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.get(url, params=params)
                        if response.status_code == 429:
                            if attempt < max_retries - 1:
                                delay = base_delay * (2 ** attempt)
                                await asyncio.sleep(delay)
                                continue
                            return []
                        response.raise_for_status()
                        data = response.json()
                        results = []
                        if data.get('result'):
                            for item in data['result']:
                                results.append(SymbolSearchResult(
                                    symbol=item.get('symbol', ''),
                                    name=item.get('description', ''),
                                    exchange=item.get('primary', 'Unknown'),
                                    type=item.get('type', 'Stock'),
                                    currency=None, marketCap=None, sector=None
                                ))
                        return results
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        await asyncio.sleep(delay)
                        continue
                    return []
                except Exception:
                    return []
            return []

        async def search_alpha_vantage():
            alpha_vantage_api_key = os.getenv("ALPHA_VANTAGE_API_KEY")
            if not alpha_vantage_api_key:
                return []
            max_retries = 3
            base_delay = 1.0
            for attempt in range(max_retries):
                try:
                    url = "https://www.alphavantage.co/query"
                    params = {"function": "SYMBOL_SEARCH", "keywords": request.query, "apikey": alpha_vantage_api_key}
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.get(url, params=params)
                        if response.status_code == 429:
                            if attempt < max_retries - 1:
                                delay = base_delay * (2 ** attempt)
                                await asyncio.sleep(delay)
                                continue
                            return []
                        response.raise_for_status()
                        data = response.json()
                        results = []
                        if data.get('bestMatches'):
                            for item in data['bestMatches']:
                                results.append(SymbolSearchResult(
                                    symbol=item.get('1. symbol', ''),
                                    name=item.get('2. name', ''),
                                    exchange=item.get('4. region', 'Unknown'),
                                    type=item.get('3. type', 'Stock'),
                                    currency=item.get('8. currency', 'USD'),
                                    marketCap=item.get('6. marketCap'),
                                    sector=None
                                ))
                        return results
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        await asyncio.sleep(delay)
                        continue
                    return []
                except Exception:
                    return []
            return []

        try:
            search_tasks = [search_finance_query(), search_polygon(), search_finnhub(), search_alpha_vantage()]
            search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
            
            all_results = []
            seen_symbols = set()
            for provider_results in search_results:
                if isinstance(provider_results, list):
                    for result in provider_results:
                        symbol_key = result.symbol.upper()
                        if symbol_key not in seen_symbols and result.symbol:
                            seen_symbols.add(symbol_key)
                            all_results.append(result)
            
            query_upper = request.query.upper()
            all_results.sort(key=lambda x: (
                0 if x.symbol.upper() == query_upper else 1,
                1 if query_upper in x.symbol.upper() else 2,
                2 if query_upper in x.name.upper() else 3,
                len(x.symbol)
            ))
            
            limited_results = all_results[:request.limit]
            return SymbolSearchResponse(results=limited_results, total=len(limited_results))
        except Exception as e:
            return SymbolSearchResponse(results=[], total=0)