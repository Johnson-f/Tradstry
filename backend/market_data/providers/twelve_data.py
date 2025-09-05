"""
TwelveData API Provider Implementation (Updated 2025)

This module provides an asynchronous interface to the TwelveData API for financial market data.
It includes comprehensive error handling, rate limiting, and data normalization.
All endpoints have been verified against the current TwelveData API documentation.
"""

import asyncio
import aiohttp
import time
from typing import Dict, List, Optional, Any, Union, Tuple
from datetime import datetime, date, timedelta, timezone
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
    EconomicEvent
)

# Configure logger
logger = logging.getLogger(__name__)

# Rate limits (requests per minute based on plan)
TWELVEDATA_RATE_LIMITS = {
    'free': 8,          # Free tier: 8 requests per minute
    'basic': 54,        # Basic tier: 54 requests per minute  
    'grow': 300,        # Grow tier: 300 requests per minute
    'pro': 800,         # Pro tier: 800 requests per minute
    'enterprise': 1200  # Enterprise tier: 1200 requests per minute
}

DEFAULT_RATE_LIMIT = 8  # Default to free tier rate limit

# Standard intervals mapping (matches TwelveData exactly)
INTERVAL_MAP = {
    '1min': '1min',
    '5min': '5min', 
    '15min': '15min',
    '30min': '30min',
    '45min': '45min',
    '1h': '1h',
    '1hour': '1h',
    '2h': '2h',
    '4h': '4h',
    '1d': '1day',
    '1day': '1day',
    'daily': '1day',
    '1w': '1week',
    '1week': '1week',
    'weekly': '1week',
    '1m': '1month',
    '1month': '1month',
    'monthly': '1month'
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
    - Company profiles and fundamentals
    - Comprehensive error handling and rate limiting
    - Automatic retries with exponential backoff
    
    Updated for 2025 API endpoints and structure.
    """
    
    def __init__(self, api_key: str, rate_limit_tier: str = 'free', base_url: str = 'https://api.twelvedata.com'):
        """
        Initialize the TwelveData provider
        
        Args:
            api_key: Your TwelveData API key
            rate_limit_tier: API rate limit tier ('free', 'basic', 'grow', 'pro', 'enterprise')
            base_url: Base URL for the API (default: https://api.twelvedata.com)
        """
        super().__init__(api_key, "TwelveData")
        self.base_url = base_url
        self.rate_limit = TWELVEDATA_RATE_LIMITS.get(rate_limit_tier.lower(), DEFAULT_RATE_LIMIT)
        self.session = None
        self.rate_limit_semaphore = asyncio.Semaphore(self.rate_limit)
        self.last_request_time = 0
        self.min_request_interval = 60.0 / self.rate_limit  # Convert to seconds between requests
        self.request_count = 0

    def _safe_decimal(self, value: Any, default: Decimal = Decimal('0')) -> Decimal:
        """Safely convert value to Decimal"""
        if value is None:
            return default
        try:
            if isinstance(value, (int, float, Decimal)):
                return Decimal(str(value))
            if isinstance(value, str):
                # Remove any non-numeric characters except decimal point and minus
                clean_value = ''.join(c for c in value if c.isdigit() or c in '.-')
                return Decimal(clean_value) if clean_value else default
            return Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            return default
            
    def _safe_int(self, value: Any, default: int = 0) -> int:
        """Safely convert value to int"""
        try:
            return int(float(value)) if value is not None else default
        except (ValueError, TypeError):
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
            
        # Add API key to params (lowercase 'apikey' for TwelveData)
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
                        self.request_count += 1
                        
                        # Handle rate limiting
                        if response.status == 429:
                            retry_after = int(response.headers.get('X-RateLimit-Reset', 60))
                            logger.warning(f"Rate limited. Retry after {retry_after} seconds")
                            raise Exception(f"Rate limit exceeded. Retry after {retry_after} seconds")
                            
                        # Handle other HTTP errors
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
                                if error_code in ['429', 429]:  # Rate limited
                                    raise Exception(f"Rate limit exceeded: {error_msg}")
                                
                                # Handle subscription/access errors - fail immediately
                                if any(keyword in error_msg.lower() for keyword in [
                                    'pro plan', 'ultra plan', 'enterprise plan', 'upgrade', 
                                    'subscription', 'premium', 'exclusively', 'pricing'
                                ]):
                                    raise Exception(f"Subscription required: {error_msg}")
                                
                                last_error = Exception(f"API Error {error_code}: {error_msg}")
                                self._log_error("API Error", str(last_error))
                                raise last_error
                                
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
                logger.warning(f"Retry {attempt + 1}/{retries} after {backoff:.2f}s...")
                await asyncio.sleep(backoff)
        
        # If we get here, all retries failed
        self._log_error(
            "MaxRetriesExceeded",
            f"Failed after {retries + 1} attempts. Last error: {str(last_error)}"
        )
        return None
    
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """
        Get current quote for a symbol using TwelveData's quote endpoint
        
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
            # Use TwelveData's quote endpoint
            data = await self._make_request("quote", {
                'symbol': symbol,
                'interval': '1day',
                'outputsize': 1
            })
            
            if not data or not isinstance(data, dict):
                self._log_error("No Data", f"No data returned for symbol {symbol}")
                return None
                
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
                
            # Parse timestamp
            timestamp = datetime.now(timezone.utc)
            if 'datetime' in data:
                try:
                    timestamp = datetime.fromisoformat(data['datetime'].replace('Z', '+00:00'))
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
                market_cap=None,  # Not available in quote endpoint
                pe_ratio=None,    # Not available in quote endpoint
                timestamp=timestamp,
                provider=self.name
            )
            
        except Exception as e:
            self._log_error("get_quote", f"Failed to fetch quote for {symbol}: {str(e)}")
            return None
    
    async def get_historical(
        self, 
        symbol: str, 
        start_date: Optional[date] = None, 
        end_date: Optional[date] = None,
        interval: str = "1day",
        limit: int = 5000,
        **kwargs
    ) -> List[HistoricalPrice]:
        """
        Get historical price data for a symbol using TwelveData's time_series endpoint
        
        Args:
            symbol: Stock symbol
            start_date: Start date (default: 1 year ago)
            end_date: End date (default: today)
            interval: Data interval (default: 1day)
            limit: Maximum number of records (default: 5000)
            **kwargs: Additional parameters
            
        Returns:
            List of HistoricalPrice objects
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        symbol = symbol.upper().strip()
        
        # Set default dates if not provided
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=365)
        
        if start_date > end_date:
            self._log_error("Invalid Date Range", f"Start date {start_date} is after end date {end_date}")
            return []
        
        # Map interval to TwelveData format
        interval_str = INTERVAL_MAP.get(interval.lower(), interval)
        
        try:
            params = {
                'symbol': symbol,
                'interval': interval_str,
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d'),
                'outputsize': min(5000, limit),
                'order': 'asc'  # Get oldest to newest
            }
            
            # Make the request to time_series endpoint
            data = await self._make_request("time_series", params)
            
            if not data or 'values' not in data:
                self._log_error("get_historical", f"No data returned for {symbol} from {start_date} to {end_date}")
                return []
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return []
            
            # Process the historical prices
            prices = []
            for item in data['values']:
                try:
                    # Parse datetime
                    datetime_str = item.get('datetime', '')
                    if not datetime_str:
                        continue
                        
                    # Handle different datetime formats
                    if 'T' in datetime_str:
                        # ISO format with time
                        if datetime_str.endswith('Z'):
                            timestamp = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
                        else:
                            timestamp = datetime.fromisoformat(datetime_str)
                    else:
                        # Date only format
                        timestamp = datetime.strptime(datetime_str, '%Y-%m-%d')
                    
                    price = HistoricalPrice(
                        symbol=symbol,
                        date=timestamp.date(),
                        open=self._safe_decimal(item.get('open')),
                        high=self._safe_decimal(item.get('high')),
                        low=self._safe_decimal(item.get('low')),
                        close=self._safe_decimal(item.get('close')),
                        volume=self._safe_int(item.get('volume', 0)),
                        provider=self.name
                    )
                    prices.append(price)
                    
                except (KeyError, ValueError, InvalidOperation) as e:
                    logger.warning(f"Invalid price data, skipping: {str(e)}")
                    continue
            
            # Sort by date and return
            prices.sort(key=lambda x: x.date)
            return prices
            
        except Exception as e:
            self._log_error("get_historical", f"Failed to fetch historical data for {symbol}: {str(e)}")
            return []
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """
        Get company information using TwelveData's profile endpoint
        
        Args:
            symbol: Stock symbol
        
        Returns:
            CompanyInfo object if successful, None otherwise
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            # Use profile endpoint
            data = await self._make_request('profile', {'symbol': symbol})
            
            if not data or not isinstance(data, dict):
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            # Build address string
            address_parts = []
            if data.get('address'):
                address_parts.append(data['address'])
            if data.get('city'):
                address_parts.append(data['city'])
            if data.get('state'):
                address_parts.append(data['state'])
            
            headquarters = ", ".join(address_parts)
            
            return CompanyInfo(
                symbol=symbol,
                name=data.get('name', ''),
                exchange=data.get('exchange', ''),
                sector=data.get('sector', ''),
                industry=data.get('industry', ''),
                employees=self._safe_int(data.get('employees')),
                website=data.get('website', ''),
                description=data.get('description', ''),
                ceo=data.get('CEO', ''),
                headquarters=headquarters,
                country=data.get('country', ''),
                phone=data.get('phone', ''),
                tags=[],  # Not available in profile
                logo_url=None,  # Requires separate logo endpoint
                ipo_date=None,  # Not available in profile
                currency='USD',  # Default
                pe_ratio=None,  # Requires statistics endpoint
                peg_ratio=None,
                eps=None,
                dividend_yield=None,
                beta=None,
                is_etf=data.get('type', '').upper() == 'ETF',
                is_adr=False,  # Not available
                is_fund=data.get('type', '').upper() in ['ETF', 'FUND'],
                updated_at=datetime.now(timezone.utc).isoformat(),
                provider=self.name
            )
            
        except Exception as e:
            self._log_error("get_company_info", f"Failed to fetch company info for {symbol}: {str(e)}")
            return None

    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental statistics using TwelveData's statistics endpoint"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            data = await self._make_request("statistics", {'symbol': symbol})
            
            if not data or 'statistics' not in data:
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            stats = data['statistics']
            
            return {
                'symbol': symbol,
                'provider': self.name,
                'pe_ratio': stats.get('valuations_metrics', {}).get('trailing_pe'),
                'peg_ratio': stats.get('valuations_metrics', {}).get('peg_ratio'),
                'dividend_yield': stats.get('dividends_and_splits', {}).get('forward_annual_dividend_yield'),
                'eps': stats.get('financials', {}).get('income_statement', {}).get('diluted_eps_ttm'),
                'revenue': stats.get('financials', {}).get('income_statement', {}).get('revenue_ttm'),
                'profit_margin': stats.get('financials', {}).get('profit_margin'),
                'operating_margin': stats.get('financials', {}).get('operating_margin'),
                'return_on_assets': stats.get('financials', {}).get('return_on_assets_ttm'),
                'return_on_equity': stats.get('financials', {}).get('return_on_equity_ttm'),
                'beta': stats.get('stock_price_summary', {}).get('beta'),
                '52_week_high': stats.get('stock_price_summary', {}).get('fifty_two_week_high'),
                '52_week_low': stats.get('stock_price_summary', {}).get('fifty_two_week_low'),
                'avg_volume': stats.get('stock_statistics', {}).get('avg_10_volume'),
                'shares_outstanding': stats.get('stock_statistics', {}).get('shares_outstanding'),
                'market_cap': stats.get('valuations_metrics', {}).get('market_capitalization')
            }
            
        except Exception as e:
            self._log_error("get_fundamentals", f"Failed to fetch fundamentals for {symbol}: {str(e)}")
            return None

    async def get_earnings(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get earnings data using TwelveData's earnings endpoint"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            data = await self._make_request("earnings", {'symbol': symbol})
            
            if not data or 'earnings' not in data:
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return data['earnings']
            
        except Exception as e:
            self._log_error("get_earnings", f"Failed to fetch earnings for {symbol}: {str(e)}")
            return None
    
    async def get_dividends(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get dividend data using TwelveData's dividends endpoint"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            data = await self._make_request("dividends", {'symbol': symbol})
            
            if not data or 'dividends' not in data:
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return data['dividends']
            
        except Exception as e:
            self._log_error("get_dividends", f"Failed to fetch dividends for {symbol}: {str(e)}")
            return None

    async def get_splits(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get stock splits using TwelveData's splits endpoint"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            data = await self._make_request("splits", {'symbol': symbol})
            
            if not data or 'splits' not in data:
                return None
            
            # Check for errors  
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return data['splits']
            
        except Exception as e:
            self._log_error("get_splits", f"Failed to fetch splits for {symbol}: {str(e)}")
            return None

    async def get_earnings_calendar(
        self, 
        symbol: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Get earnings calendar data using TwelveData's earnings_calendar endpoint
        
        Args:
            symbol: Stock symbol (optional, if None returns all earnings)
            start_date: Start date in YYYY-MM-DD format
            end_date: End date in YYYY-MM-DD format
            **kwargs: Additional parameters
        
        Returns:
            List of earnings calendar events
        """
        try:
            params = {}
            
            # If symbol is provided, get specific symbol earnings
            if symbol:
                params['symbol'] = symbol.upper()
                data = await self._make_request('earnings', params)
                
                if data and data.get('status') != 'error' and 'earnings' in data:
                    return data['earnings']
            else:
                # Get earnings calendar for date range
                if start_date:
                    params['start_date'] = start_date
                if end_date:
                    params['end_date'] = end_date
                
                data = await self._make_request('earnings_calendar', params)
                
                if data and data.get('status') != 'error' and 'earnings' in data:
                    # Flatten the calendar structure
                    earnings_list = []
                    earnings_data = data['earnings']
                    
                    for date, events in earnings_data.items():
                        if isinstance(events, list):
                            for event in events:
                                event['date'] = date
                                earnings_list.append(event)
                        elif isinstance(events, dict):
                            events['date'] = date
                            earnings_list.append(events)
                    
                    return earnings_list
            
            return []
            
        except Exception as e:
            self._log_error("get_earnings_calendar", f"Failed to fetch earnings calendar: {str(e)}")
            return []

    async def get_technical_indicators(
        self, 
        symbol: str, 
        indicator: str, 
        interval: str = '1day',
        time_period: int = 14,
        series_type: str = 'close',
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Get technical indicators data using TwelveData's technical indicator endpoints
        
        Args:
            symbol: Stock symbol
            indicator: Technical indicator name (e.g., 'rsi', 'sma', 'ema')
            interval: Data interval (default: 1day)
            time_period: Time period for the indicator (default: 14)
            series_type: The price type to use (default: 'close')
            **kwargs: Additional parameters
            
        Returns:
            List of indicator data points
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        symbol = symbol.upper().strip()
        
        try:
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
                self._log_error("Invalid Indicator", f"Unsupported indicator: {indicator}")
                return []
            
            # Map interval to TwelveData format
            interval_str = INTERVAL_MAP.get(interval.lower(), interval)
            
            params = {
                'symbol': symbol,
                'interval': interval_str,
                'time_period': time_period,
                'series_type': series_type,
                **kwargs
            }
            
            data = await self._make_request(td_indicator, params)
            
            if not data or 'values' not in data:
                self._log_error("get_technical_indicators", 
                               f"No data returned for {indicator} on {symbol}")
                return []
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return []
            
            # Process the response into a standardized format
            result = []
            for item in data.get('values', []):
                try:
                    # Parse the date
                    date_str = item.get('datetime', '')
                    if not date_str:
                        continue
                        
                    # Get the indicator value (handle different response formats)
                    value = item.get(indicator.lower()) or item.get('value')
                    if value is None:
                        # For complex indicators like MACD, get the main value
                        if indicator.lower() == 'macd':
                            value = item.get('macd')
                        elif indicator.lower() == 'bbands':
                            value = item.get('middle_band')
                        elif indicator.lower() == 'stoch':
                            value = item.get('slow_k')
                    
                    if value is None:
                        continue
                        
                    # Add to results
                    result.append({
                        'date': date_str,
                        'value': float(value),
                        'symbol': symbol,
                        'indicator': indicator
                    })
                except (ValueError, TypeError) as e:
                    logger.warning(f"Error processing indicator data: {str(e)}")
                    continue
            
            return result
            
        except Exception as e:
            self._log_error("get_technical_indicators", f"Failed to fetch technical indicators: {str(e)}")
            return []

    async def get_logo(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get company logo using TwelveData's logo endpoint"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            data = await self._make_request("logo", {'symbol': symbol})
            
            if not data or not isinstance(data, dict):
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return {
                'symbol': symbol,
                'url': data.get('url'),
                'logo_base': data.get('logo_base'),
                'logo_quote': data.get('logo_quote'),
                'provider': self.name
            }
            
        except Exception as e:
            self._log_error("get_logo", f"Failed to fetch logo for {symbol}: {str(e)}")
            return None

    async def get_income_statement(self, symbol: str, period: str = 'annual') -> Optional[Dict[str, Any]]:
        """Get income statement using TwelveData's income_statement endpoint"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            params = {
                'symbol': symbol,
                'period': period
            }
            
            data = await self._make_request("income_statement", params)
            
            if not data or 'income_statement' not in data:
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return {
                'symbol': symbol,
                'period': period,
                'income_statement': data['income_statement'],
                'meta': data.get('meta', {}),
                'provider': self.name
            }
            
        except Exception as e:
            self._log_error("get_income_statement", f"Failed to fetch income statement for {symbol}: {str(e)}")
            return None

    async def get_balance_sheet(self, symbol: str, period: str = 'annual') -> Optional[Dict[str, Any]]:
        """Get balance sheet using TwelveData's balance_sheet endpoint"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            params = {
                'symbol': symbol,
                'period': period
            }
            
            data = await self._make_request("balance_sheet", params)
            
            if not data or 'balance_sheet' not in data:
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return {
                'symbol': symbol,
                'period': period,
                'balance_sheet': data['balance_sheet'],
                'meta': data.get('meta', {}),
                'provider': self.name
            }
            
        except Exception as e:
            self._log_error("get_balance_sheet", f"Failed to fetch balance sheet for {symbol}: {str(e)}")
            return None

    async def get_cash_flow(self, symbol: str, period: str = 'annual') -> Optional[Dict[str, Any]]:
        """Get cash flow statement using TwelveData's cash_flow endpoint"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            params = {
                'symbol': symbol,
                'period': period
            }
            
            data = await self._make_request("cash_flow", params)
            
            if not data or 'cash_flow' not in data:
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return {
                'symbol': symbol,
                'period': period,
                'cash_flow': data['cash_flow'],
                'meta': data.get('meta', {}),
                'provider': self.name
            }
            
        except Exception as e:
            self._log_error("get_cash_flow", f"Failed to fetch cash flow for {symbol}: {str(e)}")
            return None

    async def get_market_status(self) -> Dict[str, Any]:
        """Get market status using TwelveData's market_state endpoint"""
        try:
            data = await self._make_request("market_state")
            
            if not data or not isinstance(data, list):
                return {
                    'is_open': False,
                    'status': 'unknown',
                    'provider': self.name,
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
            
            # Find major US exchanges
            major_exchanges = ['NYSE', 'NASDAQ', 'NYSEAMERICAN']
            market_open = False
            market_info = {}
            
            for exchange in data:
                if exchange.get('name') in major_exchanges:
                    market_open = exchange.get('is_market_open', False)
                    market_info = exchange
                    break
            
            return {
                'is_open': market_open,
                'status': 'open' if market_open else 'closed',
                'exchange_info': market_info,
                'all_exchanges': data,
                'provider': self.name,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            self._log_error("get_market_status", f"Failed to get market status: {str(e)}")
            return {
                'is_open': False,
                'status': 'error',
                'error': str(e),
                'provider': self.name,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }

    async def search_symbols(self, query: str, outputsize: int = 30) -> List[Dict[str, Any]]:
        """Search for symbols using TwelveData's symbol_search endpoint"""
        if not query or not isinstance(query, str):
            self._log_error("Invalid Input", f"Invalid query: {query}")
            return []
        
        try:
            params = {
                'symbol': query.upper().strip(),
                'outputsize': min(120, outputsize)  # TwelveData max is 120
            }
            
            data = await self._make_request("symbol_search", params)
            
            if not data or 'data' not in data:
                return []
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return []
            
            return data['data']
            
        except Exception as e:
            self._log_error("search_symbols", f"Failed to search symbols: {str(e)}")
            return []

    async def get_exchange_rate(self, from_currency: str, to_currency: str) -> Optional[Dict[str, Any]]:
        """Get exchange rate using TwelveData's exchange_rate endpoint"""
        if not from_currency or not to_currency:
            self._log_error("Invalid Input", "Both currencies are required")
            return None
        
        try:
            symbol = f"{from_currency.upper()}/{to_currency.upper()}"
            
            data = await self._make_request("exchange_rate", {'symbol': symbol})
            
            if not data or not isinstance(data, dict):
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return {
                'symbol': symbol,
                'rate': self._safe_decimal(data.get('rate')),
                'timestamp': data.get('timestamp'),
                'provider': self.name
            }
            
        except Exception as e:
            self._log_error("get_exchange_rate", f"Failed to get exchange rate: {str(e)}")
            return None

    async def get_currency_conversion(self, from_currency: str, to_currency: str, amount: float) -> Optional[Dict[str, Any]]:
        """Get currency conversion using TwelveData's currency_conversion endpoint"""
        if not from_currency or not to_currency or amount is None:
            self._log_error("Invalid Input", "All parameters are required")
            return None
        
        try:
            symbol = f"{from_currency.upper()}/{to_currency.upper()}"
            
            params = {
                'symbol': symbol,
                'amount': amount
            }
            
            data = await self._make_request("currency_conversion", params)
            
            if not data or not isinstance(data, dict):
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return {
                'symbol': symbol,
                'rate': self._safe_decimal(data.get('rate')),
                'amount': self._safe_decimal(data.get('amount')),
                'timestamp': data.get('timestamp'),
                'provider': self.name
            }
            
        except Exception as e:
            self._log_error("get_currency_conversion", f"Failed to get currency conversion: {str(e)}")
            return None

    async def get_market_movers(self, market: str = 'stocks', direction: str = 'gainers', outputsize: int = 30) -> List[Dict[str, Any]]:
        """Get top market movers using TwelveData's market_movers endpoint"""
        try:
            params = {
                'market': market,
                'direction': direction,
                'outputsize': min(50, outputsize),  # TwelveData max is 50
                'country': 'USA'  # Focus on US market by default
            }
            
            data = await self._make_request("market_movers", params)
            
            if not data or 'values' not in data:
                return []
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return []
            
            return data['values']
            
        except Exception as e:
            self._log_error("get_market_movers", f"Failed to get market movers: {str(e)}")
            return []

    async def get_price(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get simple price using TwelveData's price endpoint"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            data = await self._make_request("price", {'symbol': symbol})
            
            if not data or 'price' not in data:
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return {
                'symbol': symbol,
                'price': self._safe_decimal(data.get('price')),
                'provider': self.name
            }
            
        except Exception as e:
            self._log_error("get_price", f"Failed to get price for {symbol}: {str(e)}")
            return None

    async def get_eod(self, symbol: str, date: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get end of day price using TwelveData's eod endpoint"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            params = {'symbol': symbol}
            if date:
                params['date'] = date
                
            data = await self._make_request("eod", params)
            
            if not data or not isinstance(data, dict):
                return None
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return None
            
            return {
                'symbol': data.get('symbol', symbol),
                'exchange': data.get('exchange'),
                'currency': data.get('currency'),
                'datetime': data.get('datetime'),
                'close': self._safe_decimal(data.get('close')),
                'provider': self.name
            }
            
        except Exception as e:
            self._log_error("get_eod", f"Failed to get EOD for {symbol}: {str(e)}")
            return None

    # Methods that are not directly supported by TwelveData
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> Optional[List[OptionQuote]]:
        """
        Options data is not available via TwelveData
        TwelveData focuses on stocks, forex, crypto, and ETFs
        """
        self._log_error("Not Supported", "Options data is not available through TwelveData API")
        
        return []

    async def get_news(self, symbol: Optional[str] = None, **kwargs) -> List[Dict[str, Any]]:
        """
        News data is not available via TwelveData's main API
        TwelveData focuses on market data, not news
        """
        self._log_error("Not Supported", "News data is not available through TwelveData API")
        
        return []

    async def get_economic_data(self, function: str, **kwargs) -> Dict[str, Any]:
        """
        Economic data indicators are not available via TwelveData
        TwelveData focuses on market data (stocks, forex, crypto, ETFs)
        """
        self._log_error("Not Supported", "Economic data indicators are not available through TwelveData API")
        
        return {
            "status": "not_available",
            "message": "Economic data indicators are not available through TwelveData API",
            "function": function,
            "provider": self.name,
            "suggestion": "Consider using FRED API, Alpha Vantage, or other economic data providers",
            "available_data_types": [
                "Stock market data (Real-time & Historical)",
                "Forex data", 
                "Cryptocurrency data",
                "ETF data",
                "Technical indicators",
                "Company fundamentals",
                "Financial statements"
            ]
        }
    
    async def get_economic_events(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Economic events calendar is not available via TwelveData
        """
        self._log_error("Not Supported", "Economic events calendar is not available through TwelveData API")
        
        return []

    async def get_earnings_transcript(self, symbol: str, year: str, quarter: str) -> Dict[str, Any]:
        """
        Earnings transcripts are not available via TwelveData
        But we can return earnings data for the specified period
        """
        try:
            # Get earnings data instead of transcript
            earnings_data = await self.get_earnings(symbol)
            
            if not earnings_data:
                return {
                    'symbol': symbol,
                    'year': year,
                    'quarter': quarter,
                    'transcript': '',
                    'error': 'No earnings data available',
                    'provider': self.name
                }
            
            # Find earnings for the specific quarter
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
                    'note': 'TwelveData provides earnings data but not full transcripts',
                    'provider': self.name
                }
            else:
                return {
                    'symbol': symbol,
                    'year': year,
                    'quarter': quarter,
                    'transcript': '',
                    'error': f'No earnings data found for Q{quarter} {year}',
                    'provider': self.name
                }
            
        except Exception as e:
            self._log_error("get_earnings_transcript", f"Error fetching earnings transcript: {str(e)}")
            return {
                'symbol': symbol,
                'year': year,
                'quarter': quarter,
                'transcript': '',
                'error': str(e),
                'provider': self.name
            }

    # Utility methods for batch operations
    async def batch_quotes(self, symbols: List[str]) -> Dict[str, Optional[StockQuote]]:
        """Get quotes for multiple symbols efficiently"""
        results = {}
        
        # Process in batches to respect rate limits  
        batch_size = min(5, self.rate_limit // 4)  # Conservative batch size
        
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            
            # Process batch concurrently
            tasks = [self.get_quote(symbol) for symbol in batch]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Store results
            for symbol, result in zip(batch, batch_results):
                if isinstance(result, Exception):
                    logger.warning(f"Error fetching quote for {symbol}: {str(result)}")
                    results[symbol] = None
                else:
                    results[symbol] = result
            
            # Rate limit pause between batches
            if i + batch_size < len(symbols):
                await asyncio.sleep(self.min_request_interval)
        
        return results

    async def get_supported_symbols(self, **kwargs) -> List[Dict[str, Any]]:
        """Get list of supported symbols using TwelveData's stocks endpoint"""
        try:
            params = {
                'country': kwargs.get('country', 'United States'),
                'format': 'JSON'
            }
            
            data = await self._make_request("stocks", params)
            
            if not data or 'data' not in data:
                return []
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return []
            
            return data['data']
            
        except Exception as e:
            self._log_error("get_supported_symbols", f"Failed to get supported symbols: {str(e)}")
            return []

    async def get_forex_pairs(self) -> List[Dict[str, Any]]:
        """Get list of supported forex pairs"""
        try:
            data = await self._make_request("forex_pairs")
            
            if not data or 'data' not in data:
                return []
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return []
            
            return data['data']
            
        except Exception as e:
            self._log_error("get_forex_pairs", f"Failed to get forex pairs: {str(e)}")
            return []

    async def get_cryptocurrencies(self) -> List[Dict[str, Any]]:
        """Get list of supported cryptocurrencies"""
        try:
            data = await self._make_request("cryptocurrencies")
            
            if not data or 'data' not in data:
                return []
            
            # Check for errors
            if data.get('status') == 'error':
                self._log_error("API Error", data.get('message', 'Unknown error'))
                return []
            
            return data['data']
            
        except Exception as e:
            self._log_error("get_cryptocurrencies", f"Failed to get cryptocurrencies: {str(e)}")
            return []