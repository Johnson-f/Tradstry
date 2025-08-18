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
    
    def __init__(self, api_key: str, rate_limit_tier: str = 'free'):
        """
        Initialize the TwelveData provider
        
        Args:
            api_key: Your TwelveData API key
            rate_limit_tier: API rate limit tier ('free', 'basic', 'pro', 'enterprise')
        """
        super().__init__(api_key, "TwelveData")
        self.base_url = "https://api.twelvedata.com"
        self.rate_limit = TWELVEDATA_RATE_LIMITS.get(rate_limit_tier.lower(), DEFAULT_RATE_LIMIT)
        self.rate_limit_semaphore = asyncio.Semaphore(self.rate_limit)
        self.last_request_time = None
        self.request_count = 0
        self.rate_limit_reset = None
        self.session = None
        self._session_lock = asyncio.Lock()
        
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
        if params is None:
            params = {}
            
        # Add API key to params
        params['apikey'] = self.api_key
        
        # Ensure session exists
        await self._ensure_session()
        
        url = f"{self.base_url}/{endpoint}"
        last_error = None
        
        for attempt in range(retries + 1):
            try:
                # Apply rate limiting
                async with self.rate_limit_semaphore:
                    current_time = time.monotonic()
                    
                    # Respect rate limits
                    if self.last_request_time is not None:
                        time_since_last = current_time - self.last_request_time
                        min_interval = 1.0 / self.rate_limit
                        
                        if time_since_last < min_interval:
                            await asyncio.sleep(min_interval - time_since_last)
                    
                    # Make the request
                    async with self.session.request(
                        method=method,
                        url=url,
                        params=params,
                        timeout=aiohttp.ClientTimeout(total=30)
                    ) as response:
                        # Update rate limit tracking
                        self.last_request_time = time.monotonic()
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
        start_date: Optional[date] = None, 
        end_date: Optional[date] = None,
        interval: str = "1d",
        limit: int = 5000,
        adjusted: bool = True,
        sort: str = "asc"
    ) -> List[HistoricalPrice]:
        """
        Get historical price data for a symbol
        
        Args:
            symbol: Stock symbol to get historical data for
            start_date: Start date for historical data (default: 1 year ago)
            end_date: End date for historical data (default: today)
            interval: Time interval for data points (e.g., '1min', '1h', '1d', '1w', '1m')
            limit: Maximum number of data points to return (1-50000)
            adjusted: Whether to return adjusted data for corporate actions
            sort: Sort order ('asc' or 'desc')
            
        Returns:
            List of HistoricalPrice objects, empty list if no data or error
        """
        # Validate inputs
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        symbol = symbol.upper().strip()
        
        # Set default date range if not provided
        end_date = end_date or datetime.utcnow().date()
        start_date = start_date or (end_date - timedelta(days=365))
        
        # Validate date range
        if start_date > end_date:
            self._log_error("Invalid Date Range", "Start date must be before end date")
            return []
            
        # Validate and map interval
        td_interval = INTERVAL_MAP.get(interval.lower(), '1day')
        
        # Validate sort order
        sort = sort.lower()
        if sort not in ('asc', 'desc'):
            sort = 'asc'
            
        # Validate limit
        limit = max(1, min(50000, limit))  # Clamp between 1 and 50000
        
        all_prices = []
        total_processed = 0
        
        try:
            while total_processed < limit:
                # Prepare request parameters
                params = {
                    'symbol': symbol,
                    'interval': td_interval,
                    'start_date': start_date.strftime('%Y-%m-%d %H:%M:%S'),
                    'end_date': end_date.strftime('%Y-%m-%d %H:%M:%S'),
                    'outputsize': min(5000, limit - total_processed),  # Max 5000 per request
                    'timezone': 'UTC',
                    'order': sort,
                    'adjusted': 'true' if adjusted else 'false'
                }
                
                # Make the request
                data = await self._make_request("time_series", params)
                
                if not data or 'values' not in data or not data['values']:
                    break
                    
                # Process the batch of prices
                batch_prices = []
                for item in data['values']:
                    try:
                        # Parse timestamp, handling both with and without timezone
                        datetime_str = item['datetime'].rstrip('Z')
                        if 'T' in datetime_str:
                            timestamp = datetime.fromisoformat(datetime_str)
                        else:
                            # Handle date-only format
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
                
                # Add the batch to our results
                all_prices.extend(batch_prices)
                total_processed += len(batch_prices)
                
                # Check if we've reached the limit or if there are no more results
                if len(batch_prices) < 5000 or total_processed >= limit:
                    break
                    
                # Update start_date for the next batch (use last timestamp + 1 second)
                if batch_prices:
                    last_timestamp = batch_prices[-1].date
                    if sort == 'asc':
                        start_date = last_timestamp + timedelta(seconds=1)
                    else:
                        end_date = last_timestamp - timedelta(seconds=1)
                
                # Respect rate limits between batches
                await asyncio.sleep(1.0 / self.rate_limit)
            
            # Sort the final results if needed (in case of multiple batches)
            if sort == 'asc':
                all_prices.sort(key=lambda x: x.date)
            else:
                all_prices.sort(key=lambda x: x.date, reverse=True)
            
            # Apply limit and return
            return all_prices[:limit]
            
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
    
    async def get_technical_indicators(
        self, 
        symbol: str, 
        indicator: str,
        interval: str = "1day"
    ) -> Optional[Dict[str, Any]]:
        """Get technical indicators"""
        # Map indicator names
        indicator_map = {
            'sma': 'sma',
            'ema': 'ema',
            'macd': 'macd',
            'rsi': 'rsi',
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
            return None
        
        params = {
            'symbol': symbol,
            'interval': interval
        }
        
        # Add default parameters based on indicator
        if td_indicator in ['sma', 'ema']:
            params['time_period'] = 20
        elif td_indicator == 'bbands':
            params['time_period'] = 20
            params['sd'] = 2
        elif td_indicator == 'rsi':
            params['time_period'] = 14
        
        data = await self._make_request(td_indicator, params)
        return data
