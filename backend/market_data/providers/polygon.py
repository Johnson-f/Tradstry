"""
Polygon.io API Provider Implementation

This module provides an asynchronous interface to the Polygon.io stock market data API.
It includes comprehensive error handling, rate limiting, and data normalization.
"""

import aiohttp
import asyncio
import logging
from typing import Dict, List, Optional, Any, Union, Tuple
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal, InvalidOperation

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

# API Rate Limits (requests per minute)
POLYGON_RATE_LIMITS = {
    'free': 5,          # Free tier: 5 requests per minute
    'basic': 50,        # Basic tier: 50 requests per minute
    'pro': 200,         # Pro tier: 200 requests per minute
    'enterprise': 1000  # Enterprise tier: 1000 requests per minute
}

# Default rate limit (free tier)
DEFAULT_RATE_LIMIT = POLYGON_RATE_LIMITS['free']

class Interval:
    """Standardized interval constants"""
    MIN_1 = "1min"
    MIN_5 = "5min"
    MIN_15 = "15min"
    MIN_30 = "30min"
    HOUR_1 = "1hour"
    HOUR_4 = "4hour"
    DAILY = "1day"
    WEEKLY = "1week"
    MONTHLY = "1month"


class PolygonProvider(MarketDataProvider):
    """
    Polygon.io API implementation with enhanced features and error handling.
    
    This provider supports:
    - Real-time and historical stock data
    - Options data
    - Company fundamentals
    - Market news and events
    - Comprehensive error handling and rate limiting
    """
    
    def __init__(self, api_key: str, rate_limit_tier: str = 'free'):
        """
        Initialize the Polygon.io provider
        
        Args:
            api_key: Your Polygon.io API key
            rate_limit_tier: API rate limit tier ('free', 'basic', 'pro', 'enterprise')
        """
        super().__init__(api_key, "Polygon")
        self.base_url = "https://api.polygon.io"
        self.rate_limit = POLYGON_RATE_LIMITS.get(rate_limit_tier.lower(), DEFAULT_RATE_LIMIT)
        self.rate_limit_semaphore = asyncio.Semaphore(self.rate_limit)
        self.last_request_time = None
        self.request_count = 0
        self.rate_limit_reset = None
    
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
    
    def _map_interval(self, interval: str) -> Tuple[str, int]:
        """
        Map standard interval to Polygon's timespan and multiplier
        
        Args:
            interval: Standard interval string (e.g., '1min', '1h', '1d')
            
        Returns:
            Tuple of (timespan, multiplier)
        """
        interval_mapping = {
            # Minutes
            '1min': ('minute', 1),
            '5min': ('minute', 5),
            '15min': ('minute', 15),
            '30min': ('minute', 30),
            # Hours
            '1h': ('hour', 1),
            '1hour': ('hour', 1),
            '4h': ('hour', 4),
            '4hour': ('hour', 4),
            # Days
            '1d': ('day', 1),
            'daily': ('day', 1),
            # Weeks
            '1w': ('week', 1),
            'weekly': ('week', 1),
            # Months
            '1m': ('month', 1),
            'monthly': ('month', 1),
            # Quarters
            '1q': ('quarter', 1),
            'quarterly': ('quarter', 1),
            # Years
            '1y': ('year', 1),
            'yearly': ('year', 1)
        }
        return interval_mapping.get(interval.lower(), ('day', 1))
    
    async def _make_request(
        self, 
        endpoint: str, 
        params: Optional[Dict[str, Any]] = None,
        version: str = 'v3',
        retries: int = 3,
        backoff_factor: float = 0.5
    ) -> Optional[Union[Dict, List]]:
        """
        Make an API request to Polygon.io with retries and rate limiting
        
        Args:
            endpoint: API endpoint (without version prefix)
            params: Query parameters
            version: API version (v1, v2, v3, etc.)
            retries: Number of retry attempts
            backoff_factor: Backoff factor for retries
            
        Returns:
            Parsed JSON response or None if request failed
        """
        if params is None:
            params = {}
            
        # Add API key to params
        params['apiKey'] = self.api_key
        
        # Build URL
        url = f"{self.base_url}/{version.lstrip('/')}/{endpoint.lstrip('/')}"
        
        # Implement rate limiting
        async with self.rate_limit_semaphore:
            # Check if we need to wait for rate limit reset
            if self.rate_limit_reset and datetime.now(timezone.utc) < self.rate_limit_reset:
                wait_time = (self.rate_limit_reset - datetime.now(timezone.utc)).total_seconds()
                if wait_time > 0:
                    logger.warning(f"Rate limit reached. Waiting {wait_time:.2f} seconds...")
                    await asyncio.sleep(wait_time)
            
            # Make the request with retries
            last_error = None
            for attempt in range(retries):
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(url, params=params) as response:
                            # Update rate limit tracking
                            self.last_request_time = datetime.now(timezone.utc)
                            self.request_count += 1
                            
                            # Handle rate limit headers if present
                            if 'X-RateLimit-Requests-Remaining' in response.headers:
                                remaining = int(response.headers['X-RateLimit-Requests-Remaining'])
                                if remaining <= 0 and 'X-RateLimit-Reset' in response.headers:
                                    reset_ts = int(response.headers['X-RateLimit-Reset'])
                                    self.rate_limit_reset = datetime.fromtimestamp(reset_ts / 1000, tz=timezone.utc)
                                    wait_time = (self.rate_limit_reset - self.last_request_time).total_seconds()
                                    if wait_time > 0:
                                        await asyncio.sleep(wait_time)
                                        continue
                            
                            # Handle response
                            if response.status == 200:
                                data = await response.json()
                                if isinstance(data, dict) and data.get('status') == 'ERROR':
                                    error_msg = data.get('error', 'Unknown error')
                                    self._log_error("API Error", error_msg)
                                    last_error = Exception(f"Polygon API Error: {error_msg}")
                                    continue
                                return data
                            
                            # Handle rate limiting (429)
                            elif response.status == 429:
                                retry_after = int(response.headers.get('Retry-After', '60'))
                                logger.warning(f"Rate limited. Waiting {retry_after} seconds...")
                                await asyncio.sleep(retry_after)
                                continue
                            
                            # Handle other errors
                            else:
                                error_text = await response.text()
                                self._log_error(
                                    f"API Request Failed (HTTP {response.status})", 
                                    f"URL: {url}, Response: {error_text}"
                                )
                                last_error = Exception(f"HTTP {response.status}: {error_text}")
                                
                except aiohttp.ClientError as e:
                    last_error = e
                    self._log_error("HTTP Client Error", str(e))
                
                # Exponential backoff
                if attempt < retries - 1:
                    wait_time = backoff_factor * (2 ** attempt)
                    logger.warning(f"Retry {attempt + 1}/{retries} after {wait_time:.2f}s...")
                    await asyncio.sleep(wait_time)
            
            # All retries failed
            if last_error:
                self._log_error("Request Failed", f"All {retries} attempts failed: {str(last_error)}")
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
            # Try to get the most recent trade first (most accurate price)
            last_trade_data = await self._make_request(f"v2/last/trade/{symbol}")
            
            # Get previous close for change calculations
            prev_close_data = await self._make_request(f"v2/aggs/ticker/{symbol}/prev")
            
            # Get snapshot data for additional market data
            snapshot_data = await self._make_request(f"v2/snapshot/locale/us/markets/stocks/tickers/{symbol}")
            
            # Extract data with fallbacks
            last_price = None
            prev_close = None
            volume = None
            open_price = None
            high = None
            low = None
            
            # 1. Try to get last trade price
            if last_trade_data and 'results' in last_trade_data and last_trade_data['results']:
                last_trade = last_trade_data['results']
                if 'p' in last_trade:
                    last_price = self._safe_decimal(last_trade['p'])
            
            # 2. Try to get data from snapshot if last trade not available
            if snapshot_data and 'ticker' in snapshot_data and 'day' in snapshot_data['ticker']:
                day_data = snapshot_data['ticker']['day']
                if last_price is None and 'c' in day_data:
                    last_price = self._safe_decimal(day_data['c'])
                if 'v' in day_data:
                    volume = self._safe_int(day_data['v'])
                if 'o' in day_data:
                    open_price = self._safe_decimal(day_data['o'])
                if 'h' in day_data:
                    high = self._safe_decimal(day_data['h'])
                if 'l' in day_data:
                    low = self._safe_decimal(day_data['l'])
            
            # 3. Fallback to previous close if no current price
            if last_price is None and prev_close_data and 'results' in prev_close_data and prev_close_data['results']:
                last_price = self._safe_decimal(prev_close_data['results'][0]['c'])
            
            # 4. If still no price, try the last quote endpoint
            if last_price is None:
                quote_data = await self._make_request(f"v3/quotes/{symbol}")
                if quote_data and 'results' in quote_data and quote_data['results']:
                    quote = quote_data['results'][0]
                    last_price = self._safe_decimal(quote.get('p'))
            
            # 5. Get previous close for change calculations
            if prev_close_data and 'results' in prev_close_data and prev_close_data['results']:
                prev_close = self._safe_decimal(prev_close_data['results'][0]['c'])
            
            # If we still don't have a price, give up
            if last_price is None:
                self._log_error("Data Unavailable", f"Could not retrieve price data for {symbol}")
                return None
            
            # Calculate change and change percent
            change = None
            change_percent = None
            
            if prev_close is not None and prev_close != 0:
                change = last_price - prev_close
                change_percent = (change / prev_close) * 100
            
            # Get timestamp (use current time as fallback)
            timestamp = datetime.now(timezone.utc)
            if last_trade_data and 'results' in last_trade_data and last_trade_data['results']:
                try:
                    ts = last_trade_data['results'].get('t')
                    if ts:
                        timestamp = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
                except (ValueError, TypeError):
                    pass
            
            # Get additional market data if available
            market_cap = None
            pe_ratio = None
            
            if snapshot_data and 'ticker' in snapshot_data and 'ticker' in snapshot_data['ticker']:
                ticker_data = snapshot_data['ticker']
                if 'market_cap' in ticker_data:
                    market_cap = self._safe_decimal(ticker_data['market_cap'])
                if 'pe' in ticker_data and ticker_data['pe'] is not None:
                    pe_ratio = self._safe_decimal(ticker_data['pe'])
            
            return StockQuote(
                symbol=symbol,
                price=last_price,
                change=change if change is not None else Decimal('0'),
                change_percent=change_percent if change_percent is not None else Decimal('0'),
                volume=volume if volume is not None else 0,
                open=open_price,
                high=high,
                low=low,
                previous_close=prev_close,
                market_cap=market_cap,
                pe_ratio=pe_ratio,
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
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        symbol = symbol.upper().strip()
        
        # Set default date range if not provided
        end_date = end_date or date.today()
        start_date = start_date or (end_date - timedelta(days=365))  # Default to 1 year
        
        # Validate dates
        if start_date > end_date:
            self._log_error("Invalid Date Range", f"Start date {start_date} is after end date {end_date}")
            return []
        
        # Limit the maximum date range based on interval to prevent excessive data
        max_days = 365 * 5  # 5 years max for daily data
        if interval in ['1min', '5min', '15min', '30min']:
            max_days = 7  # 1 week max for minute data
        elif interval in ['1h', '4h']:
            max_days = 30  # 1 month max for hourly data
        
        if (end_date - start_date).days > max_days:
            start_date = end_date - timedelta(days=max_days)
            self._log_error("Date Range Adjusted", 
                          f"Date range exceeds maximum of {max_days} days. Adjusted to {start_date} - {end_date}")
        
        # Map interval to Polygon's timespan and multiplier
        timespan, multiplier = self._map_interval(interval)
        
        # Adjust multiplier for certain intervals
        if interval == '60min':
            multiplier = 1
        
        try:
            all_prices = []
            current_start = start_date
            
            # Paginate requests if needed (Polygon has a limit of 50000 per request)
            while current_start <= end_date and len(all_prices) < limit:
                # Calculate batch end date (max 1 year per request for minute data)
                batch_end = min(
                    current_start + timedelta(days=365 if timespan == 'minute' else 365*5),
                    end_date
                )
                
                # Build endpoint
                endpoint = (
                    f"v2/aggs/ticker/{symbol}/range/"
                    f"{multiplier}/{timespan}/"
                    f"{current_start.strftime('%Y-%m-%d')}/"
                    f"{batch_end.strftime('%Y-%m-%d')}"
                )
                
                # Prepare parameters
                params = {
                    'adjusted': 'true' if adjusted else 'false',
                    'sort': sort,
                    'limit': min(50000, limit - len(all_prices)),  # Polygon max is 50000
                }
                
                # Make the request
                data = await self._make_request(endpoint, params)
                
                if not data or 'results' not in data or not data['results']:
                    break
                
                # Process the batch of results
                batch_prices = []
                for bar in data['results']:
                    try:
                        timestamp_ms = bar.get('t')
                        if not timestamp_ms:
                            continue
                            
                        price_date = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
                        
                        batch_prices.append(HistoricalPrice(
                            symbol=symbol,
                            date=price_date,
                            open=self._safe_decimal(bar.get('o')),
                            high=self._safe_decimal(bar.get('h')),
                            low=self._safe_decimal(bar.get('l')),
                            close=self._safe_decimal(bar.get('c')),
                            volume=self._safe_int(bar.get('v', 0)),
                            transactions=self._safe_int(bar.get('n', 0)),
                            vwap=self._safe_decimal(bar.get('vw')),  # Volume weighted average price
                            provider=self.name
                        ))
                    except (ValueError, TypeError, KeyError) as e:
                        self._log_error("Data Parsing", f"Error processing price bar: {str(e)}")
                        continue
                
                # Add to results and check if we've reached the limit
                all_prices.extend(batch_prices)
                if len(all_prices) >= limit:
                    all_prices = all_prices[:limit]
                    break
                
                # Move to next batch
                if batch_end >= end_date:
                    break
                    
                current_start = batch_end + timedelta(days=1)
            
            # Sort by date (ascending) if not already sorted
            if sort == 'asc':
                all_prices.sort(key=lambda x: x.date)
            else:
                all_prices.sort(key=lambda x: x.date, reverse=True)
            
            return all_prices
            
        except Exception as e:
            self._log_error("get_historical", f"Failed to fetch historical data for {symbol}: {str(e)}")
            return []
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """
        Get comprehensive company information
        
        Args:
            symbol: Stock symbol to get company info for
            
        Returns:
            CompanyInfo object if successful, None otherwise
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            # Get basic company information
            ticker_data = await self._make_request(f"v3/reference/tickers/{symbol}")
            
            # Get additional company details if available
            details_data = await self._make_request(f"v1/meta/symbols/{symbol}/company")
            
            # Get financial metrics if available
            metrics_data = await self._make_request(f"vX/reference/financials?ticker={symbol}&limit=1")
            
            # Get company logo if available
            logo_data = await self._make_request(f"v1/meta/symbols/{symbol}/logo")
            
            # Extract basic information
            info = {}
            if ticker_data and 'results' in ticker_data and ticker_data['results']:
                info.update(ticker_data['results'])
            
            # Extract additional details
            if details_data and isinstance(details_data, dict):
                info.update(details_data)
            
            # Extract financial metrics
            metrics = {}
            if metrics_data and 'results' in metrics_data and metrics_data['results']:
                metrics = metrics_data['results'][0]
            
            # Process address
            address = info.get('address', {})
            headquarters = (
                f"{address.get('address1', '')}, "
                f"{address.get('city', '')}, "
                f"{address.get('state', '')} "
                f"{address.get('postal_code', '')}"
            ).replace(' ,', ',').replace('  ', ' ').strip(' ,')
            
            # Process market cap (convert to integer if it's a string with M/B/T)
            market_cap = info.get('market_cap')
            if isinstance(market_cap, str):
                try:
                    if market_cap.endswith('M'):
                        market_cap = float(market_cap[:-1]) * 1_000_000
                    elif market_cap.endswith('B'):
                        market_cap = float(market_cap[:-1]) * 1_000_000_000
                    elif market_cap.endswith('T'):
                        market_cap = float(market_cap[:-1]) * 1_000_000_000_000
                    market_cap = int(market_cap)
                except (ValueError, TypeError):
                    market_cap = None
            
            # Extract key executives (for CEO)
            ceo = None
            if 'executives' in info and isinstance(info['executives'], list):
                for exec_info in info['executives']:
                    if exec_info.get('title', '').lower() == 'ceo':
                        ceo = exec_info.get('name')
                        break
            
            # Extract founding year if available
            founded = None
            if 'founding_date' in info:
                try:
                    founded = datetime.strptime(info['founding_date'], '%Y-%m-%d').year
                except (ValueError, TypeError):
                    pass
            
            # Create and return the CompanyInfo object
            return CompanyInfo(
                symbol=symbol,
                name=info.get('name', ''),
                exchange=info.get('primary_exchange', info.get('exchange', '')),
                sector=info.get('sector', info.get('industry', '')),
                industry=info.get('industry', info.get('sic_description', '')),
                market_cap=market_cap,
                employees=self._safe_int(info.get('total_employees')),
                description=info.get('description', '').strip(),
                website=info.get('homepage_url', info.get('website', '')),
                ceo=ceo,
                headquarters=headquarters,
                country=address.get('country', ''),
                phone=info.get('phone_number', ''),
                tags=info.get('tags', []),
                logo_url=logo_data.get('url', '') if logo_data and isinstance(logo_data, dict) else None,
                ipo_date=info.get('list_date'),
                currency=info.get('currency_name', 'USD'),
                
                # Financial metrics
                pe_ratio=self._safe_decimal(metrics.get('pe_ratio')),
                peg_ratio=self._safe_decimal(metrics.get('peg_ratio')),
                eps=self._safe_decimal(metrics.get('eps')),
                dividend_yield=self._safe_decimal(metrics.get('dividend_yield')),
                beta=self._safe_decimal(metrics.get('beta')),
                
                # Additional details
                is_etf=info.get('type', '').lower() == 'etf',
                is_adr=info.get('is_adr', False),
                is_fund=info.get('is_fund', False),
                
                # Timestamp
                updated_at=datetime.now(timezone.utc).isoformat(),
                
                # Provider info
                provider=self.name
            )
            
        except Exception as e:
            self._log_error("get_company_info", f"Failed to fetch company info for {symbol}: {str(e)}")
            return None
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[Union[date, str]] = None,
        option_type: Optional[str] = None,
        strike_price: Optional[Union[float, int]] = None,
        limit: int = 1000,
        include_all_expirations: bool = False
    ) -> List[OptionQuote]:
        """
        Get options chain for a symbol with comprehensive filtering
        
        Args:
            symbol: The underlying stock symbol
            expiration: Expiration date (date object or 'YYYY-MM-DD' string). 
                      If None, returns all expirations
            option_type: Filter by option type ('call' or 'put')
            strike_price: Filter by strike price
            limit: Maximum number of options to return (1-1000)
            include_all_expirations: If True, includes all expirations (overrides expiration param)
            
        Returns:
            List of OptionQuote objects, empty list if no data or error
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        symbol = symbol.upper().strip()
        
        # Validate and format expiration date if provided
        expiration_date = None
        if expiration and not include_all_expirations:
            if isinstance(expiration, str):
                try:
                    expiration_date = datetime.strptime(expiration, '%Y-%m-%d').date()
                except ValueError:
                    self._log_error("Invalid Date Format", "Expiration date must be in YYYY-MM-DD format")
                    return []
            elif isinstance(expiration, date):
                expiration_date = expiration
            else:
                self._log_error("Invalid Date Type", "Expiration must be a date object or YYYY-MM-DD string")
                return []
        
        # Validate option type
        if option_type and option_type.lower() not in ['call', 'put']:
            self._log_error("Invalid Option Type", "Option type must be 'call' or 'put'")
            return []
            
        # Ensure limit is within bounds
        limit = max(1, min(1000, limit))
        
        try:
            all_options = []
            next_url = None
            
            # Initial request
            params = {
                'underlying_ticker': symbol,
                'limit': min(1000, limit),  # Polygon max is 1000 per request
                'sort': 'expiration_date',
                'order': 'asc'
            }
            
            # Add filters
            if expiration_date and not include_all_expirations:
                params['expiration_date'] = expiration_date.strftime('%Y-%m-%d')
                
            if option_type:
                params['contract_type'] = option_type.lower()
                
            if strike_price is not None:
                params['strike_price'] = str(strike_price)
            
            # Make initial request
            data = await self._make_request("v3/reference/options/contracts", params)
            
            if not data or 'results' not in data or not data['results']:
                return []
                
            # Process initial batch
            all_options.extend(self._process_options_data(data['results']))
            
            # Handle pagination if needed
            while len(all_options) < limit and 'next_url' in data:
                next_url = data['next_url']
                if not next_url:
                    break
                    
                # Extract the cursor for the next page
                cursor = next_url.split('cursor=')[1] if 'cursor=' in next_url else None
                if not cursor:
                    break
                    
                # Make next page request
                data = await self._make_request(
                    "v3/reference/options/contracts",
                    {'cursor': cursor, 'limit': min(1000, limit - len(all_options))}
                )
                
                if not data or 'results' not in data or not data['results']:
                    break
                    
                all_options.extend(self._process_options_data(data['results']))
            
            # Apply limit and return
            return all_options[:limit]
            
        except Exception as e:
            self._log_error("get_options_chain", f"Failed to fetch options chain for {symbol}: {str(e)}")
            return []
    
    def _process_options_data(self, contracts: List[Dict[str, Any]]) -> List[OptionQuote]:
        """
        Process raw options contract data into OptionQuote objects
        
        Args:
            contracts: List of raw contract data from Polygon API
            
        Returns:
            List of processed OptionQuote objects
        """
        options = []
        for contract in contracts:
            try:
                if not isinstance(contract, dict):
                    continue
                    
                # Extract basic contract info
                contract_type = contract.get('contract_type', '').lower()
                if contract_type not in ['call', 'put']:
                    continue
                
                # Parse expiration date
                expiration_date = None
                exp_date_str = contract.get('expiration_date')
                if exp_date_str:
                    try:
                        expiration_date = datetime.strptime(exp_date_str, '%Y-%m-%d').date()
                    except (ValueError, TypeError):
                        pass
                
                # Extract strike price
                strike_price = self._safe_decimal(contract.get('strike_price'))
                
                # Create the option quote
                option = OptionQuote(
                    symbol=contract.get('ticker', ''),
                    underlying_symbol=contract.get('underlying_ticker', ''),
                    option_type=contract_type,
                    expiration_date=expiration_date,
                    strike_price=strike_price,
                    
                    # Quote data
                    last_price=self._safe_decimal(contract.get('last_trade', {}).get('p')),
                    bid=self._safe_decimal(contract.get('bid')),
                    ask=self._safe_decimal(contract.get('ask')),
                    open_interest=self._safe_int(contract.get('open_interest')),
                    volume=self._safe_int(contract.get('volume')),
                    
                    # Greeks
                    delta=self._safe_decimal(contract.get('greeks', {}).get('delta')),
                    gamma=self._safe_decimal(contract.get('greeks', {}).get('gamma')),
                    theta=self._safe_decimal(contract.get('greeks', {}).get('theta')),
                    vega=self._safe_decimal(contract.get('greeks', {}).get('vega')),
                    rho=self._safe_decimal(contract.get('greeks', {}).get('rho')),
                    implied_volatility=self._safe_decimal(contract.get('implied_volatility')),
                    
                    # Additional contract details
                    exercise_style=contract.get('exercise_style', 'american'),
                    shares_per_contract=self._safe_int(contract.get('shares_per_contract', 100)),
                    
                    # Timestamps
                    last_trade_timestamp=contract.get('last_trade', {}).get('t'),
                    last_quote_timestamp=contract.get('last_quote', {}).get('t'),
                    
                    # Provider info
                    provider=self.name
                )
                
                options.append(option)
                
            except Exception as e:
                self._log_error("process_options_data", f"Error processing option contract: {str(e)}")
                continue
                
        return options
        
    async def get_market_status(self) -> Dict[str, Any]:
        """
        Get current market status (open/closed, holidays, etc.)
        
        Returns:
            Dictionary with market status information
        """
        try:
            # Get market status
            status_data = await self._make_request("v1/marketstatus/now")
            
            if not status_data or 'market' not in status_data:
                return {
                    'is_open': False,
                    'status': 'unknown',
                    'provider': self.name,
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
            
            market = status_data['market']
            
            return {
                'is_open': market.get('isOpen', False),
                'status': 'open' if market.get('isOpen') else 'closed',
                'exchange': market.get('exchange', ''),
                'currency': market.get('currency', 'USD'),
                'server_time': market.get('serverTime'),
                'next_market_open': market.get('nextMarketOpen'),
                'next_market_close': market.get('nextMarketClose'),
                'extended_hours_status': market.get('extendedHoursStatus'),
                'holidays': status_data.get('holidays', []),
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
            
    async def get_news(
        self, 
        symbol: Optional[str] = None,
        limit: int = 10,
        published_after: Optional[Union[date, str]] = None,
        published_before: Optional[Union[date, str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get market news and company-specific news
        
        Args:
            symbol: Stock symbol to get news for (optional)
            limit: Maximum number of news items to return (1-1000)
            published_after: Only return news published after this date
            published_before: Only return news published before this date
            
        Returns:
            List of news articles with metadata
        """
        try:
            # Validate and format parameters
            params = {}
            
            if symbol:
                params['ticker'] = symbol.upper().strip()
                
            # Set limit (Polygon allows 1-1000)
            params['limit'] = max(1, min(1000, limit))
            
            # Format date filters
            if published_after:
                if isinstance(published_after, date):
                    params['published_utc.gte'] = published_after.strftime('%Y-%m-%d')
                elif isinstance(published_after, str):
                    try:
                        # Try to parse and reformat the date string
                        dt = datetime.strptime(published_after, '%Y-%m-%d')
                        params['published_utc.gte'] = dt.strftime('%Y-%m-%d')
                    except ValueError:
                        self._log_error("Invalid Date Format", "published_after must be in YYYY-MM-DD format")
            
            if published_before:
                if isinstance(published_before, date):
                    params['published_utc.lte'] = published_before.strftime('%Y-%m-%d')
                elif isinstance(published_before, str):
                    try:
                        dt = datetime.strptime(published_before, '%Y-%m-%d')
                        params['published_utc.lte'] = dt.strftime('%Y-%m-%d')
                    except ValueError:
                        self._log_error("Invalid Date Format", "published_before must be in YYYY-MM-DD format")
            
            # Make the request
            data = await self._make_request("v2/reference/news", params)
            
            if not data or 'results' not in data or not data['results']:
                return []
            
            # Process and standardize the news articles
            articles = []
            for article in data['results']:
                try:
                    # Parse published timestamp
                    published_ts = None
                    if article.get('published_utc'):
                        try:
                            published_ts = datetime.strptime(
                                article['published_utc'], 
                                '%Y-%m-%dT%H:%M:%SZ'
                            ).replace(tzinfo=timezone.utc)
                        except (ValueError, TypeError):
                            published_ts = None
                    
                    # Standardize the article data
                    standardized = {
                        'id': article.get('id', ''),
                        'title': article.get('title', '').strip(),
                        'author': article.get('author', '').strip(),
                        'publisher': article.get('publisher', {}).get('name', ''),
                        'published': published_ts.isoformat() if published_ts else None,
                        'updated': article.get('updated_utc'),
                        'article_url': article.get('article_url', ''),
                        'tickers': [t.upper() for t in article.get('tickers', []) if t],
                        'keywords': [k.lower() for k in article.get('keywords', []) if k],
                        'image_url': article.get('image_url'),
                        'description': article.get('description', '').strip(),
                        'content': article.get('content', '').strip(),
                        'provider': self.name
                    }
                    
                    # Clean up any empty strings or None values
                    standardized = {k: v for k, v in standardized.items() if v is not None and v != ''}
                    
                    articles.append(standardized)
                    
                except Exception as e:
                    self._log_error("process_news_article", f"Error processing news article: {str(e)}")
                    continue
            
            return articles
            
        except Exception as e:
            self._log_error("get_news", f"Failed to fetch news: {str(e)}")
            return []
    
    async def get_dividends(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get dividend data"""
        data = await self._make_request(f"v3/reference/dividends", {'ticker': symbol})
        
        if not data or 'results' not in data:
            return None
        
        return data['results']
    
    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental financials"""
        data = await self._make_request(f"vX/reference/financials", {
            'ticker': symbol,
            'limit': 1
        })
        
        if not data or 'results' not in data or not data['results']:
            return None
        
        financials = data['results'][0].get('financials', {})
        
        return {
            'symbol': symbol,
            'provider': self.name,
            'eps': financials.get('income_statement', {}).get('diluted_earnings_per_share', {}).get('value'),
            'revenue': financials.get('income_statement', {}).get('revenues', {}).get('value'),
            'gross_profit': financials.get('income_statement', {}).get('gross_profit', {}).get('value'),
            'operating_income': financials.get('income_statement', {}).get('operating_income', {}).get('value'),
            'net_income': financials.get('income_statement', {}).get('net_income_loss', {}).get('value'),
            'total_assets': financials.get('balance_sheet', {}).get('assets', {}).get('value'),
            'total_liabilities': financials.get('balance_sheet', {}).get('liabilities', {}).get('value'),
            'shareholders_equity': financials.get('balance_sheet', {}).get('equity', {}).get('value'),
            'operating_cash_flow': financials.get('cash_flow_statement', {}).get('net_cash_flow_from_operating_activities', {}).get('value')
        }
