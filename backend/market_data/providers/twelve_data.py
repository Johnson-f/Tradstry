"""
TwelveData API Provider Implementation

This module provides an asynchronous interface to the TwelveData API for financial market data.
It includes comprehensive error handling, rate limiting, and data normalization.
"""

import asyncio
import aiohttp
import time
from typing import Dict, List, Optional, Any, Union, Tuple
from datetime import datetime, date, timedelta
from decimal import Decimal, InvalidOperation
from dataclasses import dataclass, field
from enum import Enum
import logging

from ..base import (
    MarketDataProvider, 
    StockQuote, 
    HistoricalPrice, 
    OptionQuote, 
    CompanyInfo,
    Interval
)

# Rate limits (requests per second)
TWELVEDATA_RATE_LIMITS = {
    'free': 8,      # Free tier: 8 requests per second
    'basic': 12,    # Basic tier: 12 requests per second
    'pro': 60,      # Pro tier: 60 requests per second
    'enterprise': 120  # Enterprise tier: 120 requests per second
}

DEFAULT_RATE_LIMIT = 8  # Default to free tier rate limit

# Standard intervals mapping
INTERVAL_MAP = {
    Interval.MIN_1: '1min',
    Interval.MIN_5: '5min',
    Interval.MIN_15: '15min',
    Interval.MIN_30: '30min',
    Interval.HOUR_1: '1h',
    Interval.HOUR_4: '4h',
    Interval.DAILY: '1day',
    Interval.WEEKLY: '1week',
    Interval.MONTHLY: '1month'
}

# Error messages
ERROR_MESSAGES = {
    'api_key_missing': 'API key is required',
    'invalid_symbol': 'Invalid symbol format',
    'invalid_date_range': 'End date must be after start date',
    'request_failed': 'API request failed',
    'rate_limit': 'Rate limit exceeded',
    'invalid_response': 'Invalid API response'
}


class TwelveDataProvider(MarketDataProvider):
    """
    TwelveData API implementation with enhanced features and error handling.
    
    This provider supports:
    - Real-time and historical stock data
    - Technical indicators
    - Comprehensive error handling and rate limiting
    - Automatic retries with exponential backoff
    """
    
    # Class attributes
    name = 'twelvedata'
    
    def __init__(self, api_key: str, base_url: str = 'https://api.twelvedata.com'):
        self.api_key = api_key
        self.base_url = base_url
        self.session = None
        self.rate_limit_semaphore = asyncio.Semaphore(8)  # Limit concurrent requests
        self.last_request_time = 0  # Timestamp of last API request
        self.min_request_interval = 1.2  # Minimum seconds between requests

    def _safe_decimal(self, value, default=None):
        """Safely convert value to Decimal, returning default if conversion fails"""
        if value is None:
            return default
        try:
            from decimal import Decimal
            return Decimal(str(value))
        except (TypeError, ValueError):
            return default
            
    def _log_warning(self, method: str, message: str) -> None:
        """Log a warning message"""
        logging.warning(f"{self.name} - {method}: {message}")
        
    def _safe_int(self, value, default=0):
        """Safely convert value to int, returning default if conversion fails"""
        if value is None:
            return default
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return default

    async def __aenter__(self):
        await self._ensure_session()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
        
    async def _ensure_session(self) -> None:
        """Ensure a client session is available"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30),
                connector=aiohttp.TCPConnector(limit=100)
            )
            
    async def close(self) -> None:
        """Close the client session"""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None
    
    async def _make_request(
        self, 
        endpoint: str, 
        params: Optional[Dict[str, Any]] = None,
        method: str = 'GET',
        retries: int = 3,
        backoff_factor: float = 0.5
    ) -> Optional[Dict]:
        """
        Make an API request to TwelveData with retries and rate limiting
        
        Args:
            endpoint: API endpoint (without base URL)
            params: Query parameters
            method: HTTP method (GET, POST, etc.)
            retries: Number of retry attempts
            backoff_factor: Backoff factor for retries
            
        Returns:
            Parsed JSON response or None if request failed
        """
        if not self.api_key:
            raise ValueError("API key is required")
            
        if params is None:
            params = {}
            
        # Add API key to params
        params['apikey'] = self.api_key
        
        # Rate limiting
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        if time_since_last < self.min_request_interval:
            await asyncio.sleep(self.min_request_interval - time_since_last)
        
        url = f"{self.base_url}/{endpoint}"
        await self._ensure_session()
        
        last_error = None
        
        for attempt in range(retries + 1):
            try:
                async with self.rate_limit_semaphore:
                    async with self.session.get(url, params=params) as response:
                        self.last_request_time = time.time()
                        response.raise_for_status()
                        return await response.json()
                        
                        self.request_count += 1
                        
                        # Handle rate limiting
                        if response.status == 429:  # Too Many Requests
                            retry_after = float(response.headers.get('Retry-After', 1.0))
                            self._log_warning(
                                "RateLimit",
                                f"Rate limited. Waiting {retry_after} seconds before retry."
                            )
                            await asyncio.sleep(retry_after)
                            continue
                            
                        # Handle other errors
                        if response.status != 200:
                            error_text = await response.text()
                            self._log_error(
                                "API Error",
                                f"HTTP {response.status}: {error_text}"
                            )
                            last_error = Exception(f"HTTP {response.status}: {error_text}")
                            continue
                            
                        # Parse response
                        try:
                            data = await response.json()
                            
                            # Check for API-level errors
                            if isinstance(data, dict) and data.get('status') == 'error':
                                error_msg = data.get('message', 'Unknown error')
                                error_code = data.get('code', 'unknown')
                                
                                # Handle specific error codes
                                if error_code == '429':  # Rate limited
                                    retry_after = float(response.headers.get('Retry-After', 5.0))
                                    self._log_warning(
                                        "RateLimit",
                                        f"API rate limited: {error_msg}. Waiting {retry_after} seconds."
                                    )
                                    await asyncio.sleep(retry_after)
                                    continue
                                
                                last_error = Exception(f"API Error {error_code}: {error_msg}")
                                self._log_error("API Error", str(last_error))
                                continue
                                
                            return data
                            
                        except (ValueError, TypeError) as e:
                            last_error = Exception(f"Failed to parse JSON response: {str(e)}")
                            self._log_error("Parse Error", str(last_error))
                            continue
                            
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                last_error = e
                self._log_error("Request Error", str(e))
                
            # Calculate backoff time
            if attempt < retries:
                backoff = backoff_factor * (2 ** attempt)
                self._log_warning(
                    "Retry",
                    f"Attempt {attempt + 1} failed. Retrying in {backoff:.2f}s..."
                )
                await asyncio.sleep(backoff)
        
        # If we get here, all retries failed
        self._log_error(
            "MaxRetriesExceeded",
            f"Failed after {retries + 1} attempts. Last error: {str(last_error)}"
        )
        return None
    
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """
        Get current quote for a symbol with comprehensive error handling and fallbacks
        
        Args:
            symbol: Stock symbol to get quote for (case-insensitive)
            
        Returns:
            StockQuote object if successful, None otherwise
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            # Try to get the most comprehensive quote data
            data = await self._make_request("quote", {
                'symbol': symbol,
                'interval': '1day',
                'timezone': 'UTC',
                'previous_close': 'true',
                'outputsize': 1
            })
            
            if not data or not isinstance(data, dict):
                self._log_error("No Data", f"No data returned for symbol {symbol}")
                return None
                
            # Handle different response formats
            if 'values' in data and isinstance(data['values'], list) and data['values']:
                # Response from time_series endpoint
                quote = data['values'][0]
                meta = data.get('meta', {})
                
                timestamp = datetime.utcnow()
                if 'datetime' in quote:
                    try:
                        timestamp = datetime.fromisoformat(quote['datetime'].rstrip('Z'))
                    except (ValueError, TypeError):
                        pass
                        
                return StockQuote(
                    symbol=symbol,
                    price=self._safe_decimal(quote.get('close')),
                    change=self._safe_decimal(quote.get('change')),
                    change_percent=self._safe_decimal(quote.get('percent_change')),
                    volume=self._safe_int(quote.get('volume')),
                    open=self._safe_decimal(quote.get('open')),
                    high=self._safe_decimal(quote.get('high')),
                    low=self._safe_decimal(quote.get('low')),
                    previous_close=self._safe_decimal(quote.get('previous_close')),
                    timestamp=timestamp,
                    provider=self.name
                )
                
            elif 'close' in data:
                # Response from quote endpoint
                timestamp = datetime.utcnow()
                if 'datetime' in data:
                    try:
                        timestamp = datetime.fromisoformat(data['datetime'].rstrip('Z'))
                    except (ValueError, TypeError):
                        pass
                        
                return StockQuote(
                    symbol=symbol,
                    price=self._safe_decimal(data.get('close')),
                    change=self._safe_decimal(data.get('change')),
                    change_percent=self._safe_decimal(data.get('percent_change')),
                    volume=self._safe_int(data.get('volume')),
                    open=self._safe_decimal(data.get('open')),
                    high=self._safe_decimal(data.get('high')),
                    low=self._safe_decimal(data.get('low')),
                    previous_close=self._safe_decimal(data.get('previous_close')),
                    timestamp=timestamp,
                    provider=self.name
                )
                
            self._log_error("Invalid Response", f"Unexpected response format for symbol {symbol}")
            return None
            
        except Exception as e:
            self._log_error("get_quote", f"Failed to fetch quote for {symbol}: {str(e)}")
            return None
    
    async def get_historical(
        self, 
        symbol: str, 
        start_date: Union[str, date, datetime],
        end_date: Union[str, date, datetime],
        interval: Union[Interval, str] = Interval.DAILY,
        **kwargs
    ) -> List[HistoricalPrice]:
        """
        Get historical price data for a symbol
        
        Args:
            symbol: Stock symbol
            start_date: Start date (YYYY-MM-DD or date/datetime object)
            end_date: End date (YYYY-MM-DD or date/datetime object)
            interval: Data interval (default: daily). Can be Interval enum or string like '1d', '1h', etc.
            **kwargs: Additional parameters
            
        Returns:
            List of HistoricalPrice objects
        """
        try:
            # Convert dates to string if needed
            if isinstance(start_date, (date, datetime)):
                start_date = start_date.strftime('%Y-%m-%d')
            if isinstance(end_date, (date, datetime)):
                end_date = end_date.strftime('%Y-%m-%d')
            
            # Handle interval - accept both enum and string
            interval_str = interval.value if isinstance(interval, Interval) else str(interval)
                
            params = {
                'symbol': symbol.upper(),
                'interval': interval_str,
                'start_date': start_date,
                'end_date': end_date,
                'outputsize': kwargs.get('outputsize', 1000),
                'timezone': 'America/New_York',
                'order': 'asc'  # Get oldest to newest
            }
            
            # Make the request
            data = await self._make_request("time_series", params)
            
            if not data or 'values' not in data:
                self._log_warning("get_historical", f"No data returned for {symbol} from {start_date} to {end_date}")
                return []
            
            # Process the batch of prices
            batch_prices = []
            for item in data['values']:
                try:
                    # Parse timestamp, handling both with and without timezone
                    datetime_str = item.get('datetime', '').rstrip('Z')
                    if not datetime_str:
                        continue
                        
                    # Handle different datetime formats
                    if 'T' in datetime_str:
                        if '+' in datetime_str or 'Z' in datetime_str:
                            timestamp = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
                        else:
                            timestamp = datetime.strptime(datetime_str, '%Y-%m-%dT%H:%M:%S')
                    elif ' ' in datetime_str:
                        timestamp = datetime.strptime(datetime_str, '%Y-%m-%d %H:%M:%S')
                    else:
                        timestamp = datetime.strptime(datetime_str, '%Y-%m-%d')
                    
                    price = HistoricalPrice(
                        symbol=symbol,
                        date=timestamp,
                        open=self._safe_decimal(item.get('open')),
                        high=self._safe_decimal(item.get('high')),
                        low=self._safe_decimal(item.get('low')),
                        close=self._safe_decimal(item.get('close')),
                        volume=self._safe_int(item.get('volume', 0)),
                        adjusted_close=self._safe_decimal(item.get('close')),  # Use close if adjusted not available
                        provider=self.name
                    )
                    batch_prices.append(price)
                    
                except (KeyError, ValueError, InvalidOperation) as e:
                    self._log_warning("Invalid Price Data", f"Skipping invalid price data: {str(e)}")
                    continue
            
            # Sort the final results if needed (in case of multiple batches)
            batch_prices.sort(key=lambda x: x.date)
            
            # Apply limit and return
            return batch_prices[:kwargs.get('limit', 1000)]
            
        except Exception as e:
            self._log_error("get_historical", f"Failed to fetch historical data for {symbol}: {str(e)}")
            return []
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> Optional[List[OptionQuote]]:
        """Get options chain for a symbol"""
        params = {'symbol': symbol}
        
        if expiration:
            params['expiration_date'] = expiration.strftime('%Y-%m-%d')
        
        data = await self._make_request("options/chain", params)
        
        if not data or 'calls' not in data:
            return None
        
        try:
            options = []
            
            # Process calls
            for contract in data.get('calls', []):
                options.append(OptionQuote(
                    symbol=contract.get('contract_name', ''),
                    underlying_symbol=symbol,
                    strike=Decimal(str(contract['strike'])),
                    expiration=datetime.strptime(contract['expiration_date'], '%Y-%m-%d').date(),
                    option_type='call',
                    bid=Decimal(str(contract.get('bid', 0))),
                    ask=Decimal(str(contract.get('ask', 0))),
                    last_price=Decimal(str(contract.get('last', 0))),
                    volume=contract.get('volume', 0),
                    open_interest=contract.get('open_interest', 0),
                    implied_volatility=Decimal(str(contract.get('implied_volatility', 0))),
                    timestamp=datetime.now(),
                    provider=self.name
                ))
            
            # Process puts
            for contract in data.get('puts', []):
                options.append(OptionQuote(
                    symbol=contract.get('contract_name', ''),
                    underlying_symbol=symbol,
                    strike=Decimal(str(contract['strike'])),
                    expiration=datetime.strptime(contract['expiration_date'], '%Y-%m-%d').date(),
                    option_type='put',
                    bid=Decimal(str(contract.get('bid', 0))),
                    ask=Decimal(str(contract.get('ask', 0))),
                    last_price=Decimal(str(contract.get('last', 0))),
                    volume=contract.get('volume', 0),
                    open_interest=contract.get('open_interest', 0),
                    implied_volatility=Decimal(str(contract.get('implied_volatility', 0))),
                    timestamp=datetime.now(),
                    provider=self.name
                ))
            
            return options
        except Exception as e:
            self._log_error("get_options_chain", e)
            return None
    
    async def get_earnings(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get earnings data"""
        data = await self._make_request("earnings", {'symbol': symbol})
        
        if not data or 'earnings' not in data:
            return None
        
        return data['earnings']
    
    async def get_dividends(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get dividend data"""
        data = await self._make_request("dividends", {'symbol': symbol})
        
        if not data or 'dividends' not in data:
            return None
        
        return data['dividends']
    
    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental statistics"""
        data = await self._make_request("statistics", {'symbol': symbol})
        
        if not data or 'statistics' not in data:
            return None
        
        stats = data['statistics']
        
        return {
            'symbol': symbol,
            'provider': self.name,
            'pe_ratio': stats.get('valuations_metrics', {}).get('pe_ratio'),
            'peg_ratio': stats.get('valuations_metrics', {}).get('peg_ratio'),
            'dividend_yield': stats.get('stock_dividends', {}).get('forward_annual_dividend_yield'),
            'eps': stats.get('financials', {}).get('ttm_eps'),
            'revenue': stats.get('financials', {}).get('ttm_revenue'),
            'profit_margin': stats.get('financials', {}).get('profit_margin'),
            'operating_margin': stats.get('financials', {}).get('operating_margin'),
            'return_on_assets': stats.get('financials', {}).get('return_on_assets'),
            'return_on_equity': stats.get('financials', {}).get('return_on_equity'),
            'beta': stats.get('stock_statistics', {}).get('beta'),
            '52_week_high': stats.get('stock_statistics', {}).get('52_week_high'),
            '52_week_low': stats.get('stock_statistics', {}).get('52_week_low'),
            'avg_volume': stats.get('stock_statistics', {}).get('avg_volume'),
            'shares_outstanding': stats.get('stock_statistics', {}).get('shares_outstanding')
        }
        
    async def get_company_info(self, symbol: str) -> Dict[str, Any]:
        """
        Get company information using Twelve Data profile endpoint
        
        Args:
            symbol: Stock symbol
        
        Returns:
            Dictionary containing company profile data
        """
        try:
            params = {'symbol': symbol.upper()}
            data = await self._make_request('profile', params)
            
            # Check for errors
            if data.get('error') or data.get('status') == 'error':
                logging.warning(f"Company info error for {symbol}: {data.get('message', 'Unknown error')}")
                return {}
            
            # Transform data to standardized format
            company_info = {
                'symbol': symbol.upper(),
                'name': data.get('name', ''),
                'exchange': data.get('exchange', ''),
                'sector': data.get('sector', ''),
                'industry': data.get('industry', ''),
                'employees': data.get('employees'),
                'website': data.get('website', ''),
                'description': data.get('description', ''),
                'ceo': data.get('CEO', ''),
                'address': data.get('address', ''),
                'city': data.get('city', ''),
                'state': data.get('state', ''),
                'country': data.get('country', ''),
                'phone': data.get('phone', ''),
                'type': data.get('type', '')
            }
            
            return company_info
            
        except Exception as e:
            logging.error(f"Error fetching company info for {symbol}: {str(e)}")
            return {}
    
    async def get_earnings_calendar(self, symbol: str = None, horizon: str = "3month") -> List[Dict[str, Any]]:
        """
        Get earnings calendar data using Twelve Data earnings_calendar endpoint
        
        Args:
            symbol: Stock symbol (optional, if None returns all earnings)
            horizon: Time horizon - "3month", "6month", "1year"
        
        Returns:
            List of earnings calendar events
        """
        try:
            # Calculate date range based on horizon
            end_date = datetime.now()
            if horizon == "3month":
                start_date = end_date - timedelta(days=90)
            elif horizon == "6month":
                start_date = end_date - timedelta(days=180)
            elif horizon == "1year":
                start_date = end_date - timedelta(days=365)
            else:
                start_date = end_date - timedelta(days=90)  # default to 3 months
            
            params = {
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d')
            }
            
            # Add symbol filter if provided
            if symbol:
                # For specific symbol, use earnings endpoint instead
                params = {'symbol': symbol.upper()}
                data = await self._make_request('earnings', params)
                
                if data.get('error') or data.get('status') == 'error':
                    logging.warning(f"Earnings data error for {symbol}: {data.get('message', 'Unknown error')}")
                    return []
                
                # Transform single symbol earnings data
                earnings_data = data.get('earnings', [])
                standardized_data = []
                
                for event in earnings_data:
                    standardized_event = {
                        'symbol': symbol.upper(),
                        'date': event.get('date', ''),
                        'time': event.get('time', ''),
                        'epsEstimate': event.get('eps_estimate'),
                        'epsActual': event.get('eps_actual'),
                        'difference': event.get('difference'),
                        'surprise_prc': event.get('surprise_prc')
                    }
                    standardized_data.append(standardized_event)
                
                return standardized_data
            else:
                # Get earnings calendar for all symbols
                data = await self._make_request('earnings_calendar', params)
                
                if data.get('error'):
                    logging.warning(f"Earnings calendar error: {data.get('message', 'Unknown error')}")
                    return []
                
                # Transform calendar data
                earnings_data = data.get('earnings', {})
                standardized_data = []
                
                for date, events in earnings_data.items():
                    if isinstance(events, dict):
                        events = [events]  # Single event
                    elif isinstance(events, list):
                        pass  # Multiple events
                    else:
                        continue
                    
                    for event in events:
                        standardized_event = {
                            'symbol': event.get('symbol', ''),
                            'date': date,
                            'time': event.get('time', ''),
                            'epsEstimate': event.get('eps_estimate'),
                            'epsActual': event.get('eps_actual'),
                            'difference': event.get('difference'),
                            'surprise_prc': event.get('surprise_prc')
                        }
                        standardized_data.append(standardized_event)
                
                return standardized_data
            
        except Exception as e:
            logging.error(f"Error fetching earnings calendar: {str(e)}")
            return []
    
    async def get_earnings_transcript(self, symbol: str, year: str, quarter: str) -> Dict[str, Any]:
        """
        Get earnings transcript data - Note: Twelve Data doesn't provide transcript text,
        but we can return earnings data for the specified period
        
        Args:
            symbol: Stock symbol
            year: Year (e.g., "2024")
            quarter: Quarter (1, 2, 3, or 4)
        
        Returns:
            Dictionary containing available earnings data (not full transcript)
        """
        try:
            params = {
                'symbol': symbol.upper(),
                'start_date': f'{year}-01-01',
                'end_date': f'{year}-12-31'
            }
            
            data = await self._make_request('earnings', params)
            
            if data.get('error') or data.get('status') == 'error':
                logging.warning(f"Earnings transcript error for {symbol}: {data.get('message', 'Unknown error')}")
                return {
                    'symbol': symbol,
                    'year': year,
                    'quarter': quarter,
                    'transcript': '',
                    'error': 'Twelve Data does not provide full earnings transcripts'
                }
            
            # Find earnings for the specific quarter
            earnings_data = data.get('earnings', [])
            target_earning = None
            
            for earning in earnings_data:
                earning_date = earning.get('date', '')
                if earning_date:
                    try:
                        earning_datetime = datetime.strptime(earning_date, '%Y-%m-%d')
                        earning_quarter = ((earning_datetime.month - 1) // 3) + 1
                        
                        if str(earning_quarter) == quarter and str(earning_datetime.year) == year:
                            target_earning = earning
                            break
                    except ValueError:
                        continue
            
            if target_earning:
                return {
                    'symbol': symbol,
                    'year': year,
                    'quarter': quarter,
                    'date': target_earning.get('date', ''),
                    'time': target_earning.get('time', ''),
                    'eps_estimate': target_earning.get('eps_estimate'),
                    'eps_actual': target_earning.get('eps_actual'),
                    'difference': target_earning.get('difference'),
                    'surprise_prc': target_earning.get('surprise_prc'),
                    'transcript': '',
                    'note': 'Twelve Data provides earnings data but not full transcripts'
                }
            else:
                return {
                    'symbol': symbol,
                    'year': year,
                    'quarter': quarter,
                    'transcript': '',
                    'error': f'No earnings data found for Q{quarter} {year}'
                }
            
        except Exception as e:
            logging.error(f"Error fetching earnings transcript: {str(e)}")
            return {
                'symbol': symbol,
                'year': year,
                'quarter': quarter,
                'transcript': '',
                'error': str(e)
            }
    
    async def get_economic_data(self, function: str, **kwargs) -> Dict[str, Any]:
        """
        Get economic data - Note: Twelve Data focuses on market data,
        limited economic indicators available
        
        Args:
            function: Economic function/indicator name
            **kwargs: Additional parameters
        
        Returns:
            Dictionary containing economic data
        """
        try:
            # Twelve Data doesn't have a comprehensive economic data endpoint
            # But they have some economic-related data through market data
            
            # Map common economic functions to available endpoints
            function_mapping = {
                'GDP': 'GDP',
                'INFLATION': 'CPI',
                'UNEMPLOYMENT': 'UNEMPLOYMENT_RATE',
                'INTEREST_RATE': 'FEDERAL_FUNDS_RATE'
            }
            
            mapped_function = function_mapping.get(function.upper(), function)
            
            # Try to get economic indicator as a symbol (if available)
            params = {
                'symbol': mapped_function,
                'interval': kwargs.get('interval', '1month'),
                'outputsize': kwargs.get('outputsize', 12)
            }
            
            data = await self._make_request("time_series", params)
            
            if data.get('error') or data.get('status') == 'error':
                logging.warning(f"Economic data not available for {function}: Limited economic data in Twelve Data")
                return {
                    'function': function,
                    'data': [],
                    'error': 'Twelve Data primarily provides market data, limited economic indicators'
                }
            
            # Transform time series data
            values = data.get('values', [])
            economic_data = []
            
            for value in values:
                economic_point = {
                    'date': value.get('datetime', ''),
                    'value': float(value.get('close', 0)) if value.get('close') else None,
                    'indicator': function
                }
                economic_data.append(economic_point)
            
            return {
                'function': function,
                'data': economic_data,
                'meta': data.get('meta', {})
            }
            
        except Exception as e:
            logging.error(f"Error fetching economic data: {str(e)}")
            return {
                'function': function,
                'data': [],
                'error': str(e)
            }
    
    async def get_economic_events(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Get economic events - Note: Twelve Data doesn't provide economic calendar,
        return empty list with explanation
        
        Args:
            **kwargs: Parameters for economic events
        
        Returns:
            List of economic events (empty for Twelve Data)
        """
        try:
            # Twelve Data doesn't provide economic calendar/events
            logging.warning("Twelve Data does not provide economic events/calendar data")
            return []
            
        except Exception as e:
            logging.error(f"Error fetching economic events: {str(e)}")
            return []
    
    async def get_news(self, symbol: str = None, **kwargs) -> List[Dict[str, Any]]:
        """
        Get news data - Note: Twelve Data doesn't provide news endpoint in their main API,
        but we can simulate with company info or return empty
        
        Args:
            symbol: Stock symbol (optional)
            **kwargs: Additional parameters like category, limit, etc.
        
        Returns:
            List of news articles (limited/simulated for Twelve Data)
        """
        try:
            # Twelve Data doesn't have a dedicated news endpoint
            # We could potentially integrate with their other data or return empty
            
            logging.warning("Twelve Data does not provide news data through their API")
            
            # Return empty news list with explanation
            return []
            
        except Exception as e:
            logging.error(f"Error fetching news: {str(e)}")
            return []

    async def get_technical_indicators(
        self, 
        symbol: str, 
        indicator: str, 
        interval: Union[Interval, str] = Interval.DAILY,
        time_period: int = 14,
        series_type: str = 'close',
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Get technical indicators data
        
        Args:
            symbol: Stock symbol
            indicator: Technical indicator name (e.g., 'rsi', 'sma', 'ema')
            interval: Data interval (default: daily). Can be Interval enum or string like '1d', '1h', etc.
            time_period: Time period for the indicator (default: 14)
            series_type: The price type to use (default: 'close')
            **kwargs: Additional parameters
            
        Returns:
            List of indicator data points with 'date' and 'value' keys
        """
        try:
            # Handle interval - accept both enum and string
            interval_str = interval.value if isinstance(interval, Interval) else str(interval)
            
            # Map indicator names to TwelveData's format
            indicator_map = {
                'rsi': 'rsi',
                'sma': 'sma',
                'ema': 'ema',
                'macd': 'macd',
                'bbands': 'bbands',
                'stoch': 'stoch',
                'adx': 'adx',
                'cci': 'cci',
                'obv': 'obv',
                'atr': 'atr',
                'willr': 'willr',
                'mfi': 'mfi'
            }
            
            td_indicator = indicator_map.get(indicator.lower())
            if not td_indicator:
                self._log_warning("get_technical_indicators", f"Unsupported indicator: {indicator}")
                return []
            
            params = {
                'symbol': symbol.upper(),
                'interval': interval_str,
                'time_period': time_period,
                'series_type': series_type,
                **kwargs
            }
            
            # Add default parameters based on indicator
            if td_indicator in ['sma', 'ema']:
                params['time_period'] = time_period
            elif td_indicator == 'bbands':
                params['time_period'] = time_period
                params['sd'] = kwargs.get('sd', 2)
            elif td_indicator == 'rsi':
                params['time_period'] = time_period
            
            data = await self._make_request(td_indicator, params)
            
            if not data or 'values' not in data:
                self._log_warning("get_technical_indicators", 
                               f"No data returned for {indicator} on {symbol}")
                return []
            
            # Process the response into a standardized format
            result = []
            for item in data.get('values', []):
                try:
                    # Parse the date
                    date_str = item.get('datetime', '').rstrip('Z')
                    if not date_str:
                        continue
                        
                    # Get the indicator value (handle different response formats)
                    value = item.get(indicator.lower()) or item.get('value')
                    if value is None:
                        continue
                        
                    # Add to results
                    result.append({
                        'date': date_str,
                        'value': float(value)
                    })
                except (ValueError, TypeError) as e:
                    self._log_warning("get_technical_indicators", 
                                   f"Error processing indicator data: {str(e)}")
                    continue
            
            return result
            
        except Exception as e:
            logging.error(f"Error fetching technical indicators: {str(e)}")
            return []
