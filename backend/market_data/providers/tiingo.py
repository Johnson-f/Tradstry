"""
Tiingo API Provider Implementation

This module provides an asynchronous interface to the Tiingo API for financial market data.
It includes comprehensive error handling, rate limiting, and data normalization.
"""

import asyncio
import aiohttp
from typing import Dict, List, Optional, Any, Union, Tuple
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal, InvalidOperation
import logging
import json
import time
from functools import wraps
from typing import Callable, TypeVar

from ..base import (
    MarketDataProvider,
    StockQuote,
    HistoricalPrice,
    OptionQuote,
    CompanyInfo,
    Interval
)

# Type variable for generic function type
F = TypeVar('F', bound=Callable[..., Any])

def log_request_response(logger: logging.Logger) -> Callable[[F], F]:
    """Decorator to log API request and response details"""
    def decorator(func: F) -> F:
        @wraps(func)
        async def wrapper(self: 'TiingoProvider', *args: Any, **kwargs: Any) -> Any:
            # Generate a unique request ID
            request_id = f"{int(time.time() * 1000)}-{id(self) & 0xFFFF:04x}"
            
            # Log request
            func_name = func.__name__
            logger.debug(
                f"[Req {request_id}] {func_name} - Args: {args}, Kwargs: {kwargs}",
                extra={'request_id': request_id}
            )
            
            try:
                # Execute the function
                start_time = time.monotonic()
                result = await func(self, *args, **kwargs)
                elapsed = (time.monotonic() - start_time) * 1000  # ms
                
                # Log successful response
                result_str = str(result)[:500] + '...' if len(str(result)) > 500 else str(result)
                logger.debug(
                    f"[Resp {request_id}] {func_name} - Success in {elapsed:.2f}ms - Result: {result_str}",
                    extra={
                        'request_id': request_id,
                        'elapsed_ms': elapsed,
                        'success': True
                    }
                )
                
                return result
                
            except Exception as e:
                # Log error
                elapsed = (time.monotonic() - start_time) * 1000  # ms
                logger.error(
                    f"[Resp {request_id}] {func_name} - Failed in {elapsed:.2f}ms - Error: {str(e)}",
                    exc_info=True,
                    extra={
                        'request_id': request_id,
                        'elapsed_ms': elapsed,
                        'success': False,
                        'error': str(e)
                    }
                )
                raise
                
        return wrapper
    return decorator

# Rate limits (requests per minute)
TIINGO_RATE_LIMITS = {
    'free': 300,     # Free tier: 300 requests per minute
    'core': 1000,    # Core tier: 1000 requests per minute
    'pro': 5000,     # Pro tier: 5000 requests per minute
    'enterprise': 20000  # Enterprise tier: 20,000 requests per minute
}

DEFAULT_RATE_LIMIT = 300  # Default to free tier rate limit

# Standard intervals mapping
INTERVAL_MAP = {
    Interval.MIN_1: '1min',
    Interval.MIN_5: '5min',
    Interval.MIN_15: '15min',
    Interval.MIN_30: '30min',
    Interval.HOUR_1: '1hour',
    Interval.HOUR_4: '4hour',
    Interval.DAILY: '1day',
    Interval.WEEKLY: '1week',
    Interval.MONTHLY: '1month'
}

class TiingoProvider(MarketDataProvider):
    """
    Tiingo API implementation with enhanced features and error handling.
    
    This provider supports:
    - Real-time and historical stock data
    - IEX data for US equities
    - Comprehensive error handling and rate limiting
    - Automatic retries with exponential backoff
    """
    
    def __init__(
        self, 
        api_key: str, 
        rate_limit_tier: str = 'free',
        logger: Optional[logging.Logger] = None,
        log_level: int = logging.INFO,
        log_requests: bool = True
    ) -> None:
        super().__init__(api_key, "Tiingo")
        self.log_requests = log_requests
        self.base_url = "https://api.tiingo.com"
        self.rate_limit = TIINGO_RATE_LIMITS.get(rate_limit_tier.lower(), DEFAULT_RATE_LIMIT)
        self.rate_limit_semaphore = asyncio.Semaphore(self.rate_limit // 60)  # Convert to requests per second
        self.last_request_time = None
        self.request_count = 0
        self.rate_limit_reset = None
        self.session = None
        self._session_lock = asyncio.Lock()
        
        # Configure logger
        self.logger = logger or logging.getLogger(__name__)
        self.logger.setLevel(log_level)
        
        # Add console handler if no handlers are configured
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s - ' 
                'request_id=%(request_id)s elapsed_ms=%(elapsed_ms).2f success=%(success)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            
        # Log provider initialization
        self.logger.info(
            f"Initialized Tiingo provider with rate limit: {self.rate_limit} requests/min",
            extra={'request_id': 'init', 'elapsed_ms': 0, 'success': True}
        )
        
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
    
    @log_request_response(logging.getLogger(__name__ + '.request'))
    async def _make_request(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        method: str = 'GET',
        retries: int = 3,
        backoff_factor: float = 0.5
    ) -> Optional[Dict]:
        """
        Make an API request to Tiingo with retries and rate limiting
        
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
            
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Token {self.api_key}'
        }
        
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        # Prepare request context for logging
        request_ctx = {
            'url': url,
            'method': method,
            'endpoint': endpoint,
            'params': {k: v for k, v in params.items() if k != 'token'},  # Don't log API key
            'attempt': 0,
            'retries': retries
        }
        
        async with self.rate_limit_semaphore:
            for attempt in range(retries + 1):
                request_ctx['attempt'] = attempt + 1
                
                try:
                    await self._ensure_session()
                    
                    # Rate limiting
                    current_time = asyncio.get_event_loop().time()
                    if self.last_request_time is not None:
                        time_since_last = current_time - self.last_request_time
                        min_interval = 60.0 / self.rate_limit
                        if time_since_last < min_interval:
                            delay = min_interval - time_since_last
                            if self.log_requests:
                                self.logger.debug(
                                    f"Rate limiting - waiting {delay:.2f}s",
                                    extra=request_ctx
                                )
                            await asyncio.sleep(delay)
                    
                    # Log request if enabled
                    if self.log_requests:
                        self.logger.debug(
                            f"Making {method} request to {endpoint}",
                            extra=request_ctx
                        )
                    
                    # Make the request
                    start_time = time.monotonic()
                    try:
                        async with self.session.request(
                            method=method,
                            url=url,
                            params=params,
                            headers=headers,
                            timeout=aiohttp.ClientTimeout(total=30)
                        ) as response:
                            self.last_request_time = asyncio.get_event_loop().time()
                            
                            # Log response
                            response_time = (time.monotonic() - start_time) * 1000  # ms
                            response_ctx = {
                                **request_ctx,
                                'status': response.status,
                                'elapsed_ms': response_time,
                                'retry_after': None
                            }
                            
                            # Handle rate limiting
                            if response.status == 429:  # Too Many Requests
                                retry_after = float(response.headers.get('Retry-After', 60))
                                response_ctx['retry_after'] = retry_after
                                
                                if self.log_requests:
                                    # Add request_id to response_ctx if missing
                                    if 'request_id' not in response_ctx:
                                        response_ctx['request_id'] = f"tiingo_{int(time.time())}"
                                    self.logger.warning(
                                        f"Rate limited - retrying after {retry_after}s",
                                        extra=response_ctx
                                    )
                                    
                                await asyncio.sleep(retry_after)
                                continue
                                
                            # Handle successful response
                            if 200 <= response.status < 300:
                                data = await response.json()
                                
                                if self.log_requests:
                                    response_ctx['success'] = True
                                    self.logger.debug(
                                        f"Request successful in {response_time:.2f}ms",
                                        extra=response_ctx
                                    )
                                    
                                return data
                                
                            # Handle error responses
                            error_text = await response.text()
                            error_ctx = {
                                **response_ctx,
                                'error': error_text,
                                'success': False
                            }
                            
                            self._log_error(
                                f"API Request Failed ({response.status})",
                                Exception(error_text)
                            )
                            
                            # If server error, retry with backoff
                            if response.status >= 500 and attempt < retries:
                                backoff = backoff_factor * (2 ** attempt)
                                error_ctx['backoff'] = backoff
                                
                                if self.log_requests:
                                    self.logger.warning(
                                        f"Server error - retrying in {backoff:.2f}s",
                                        extra=error_ctx
                                    )
                                    
                                await asyncio.sleep(backoff)
                                continue
                                
                            return None
                            
                    except (aiohttp.ClientError, asyncio.TimeoutError, RuntimeError) as e:
                        error_ctx = {
                            'request_id': request_ctx.get('request_id', 'unknown'),
                            'error': str(e),
                            'success': False,
                            'exception_type': type(e).__name__,
                            'elapsed_ms': 0.0
                        }
                        error_ctx.update(request_ctx)
                        
                        self._log_error("Network Error", e)
                        
                        if attempt == retries:
                            if self.log_requests:
                                self.logger.error(
                                    f"Max retries ({retries}) exceeded",
                                    extra=error_ctx,
                                    exc_info=True
                                )
                            return None
                        
                        # Exponential backoff
                        backoff = backoff_factor * (2 ** attempt)
                        error_ctx['backoff'] = backoff
                        
                        if self.log_requests:
                            self.logger.warning(
                                f"Network error - retrying in {backoff:.2f}s",
                                extra=error_ctx
                            )
                            
                        await asyncio.sleep(backoff)
                    
                except Exception as e:
                    self._log_error("Unexpected Error", e)
                    if self.log_requests:
                        # Ensure request_id is in context
                        error_context = {
                            'request_id': request_ctx.get('request_id', 'unknown'),
                            'error': str(e),
                            'success': False,
                            'exception_type': type(e).__name__,
                            'elapsed_ms': 0.0
                        }
                        error_context.update(request_ctx)
                        
                        self.logger.error(
                            "Unexpected error in _make_request",
                            extra=error_context,
                            exc_info=True
                        )
                    return None
        
        return None
    
    def _safe_decimal(self, value: Any, default: Decimal = Decimal('0')) -> Decimal:
        """Safely convert value to Decimal"""
        if value is None:
            return default
        try:
            if isinstance(value, (int, float, Decimal, str)):
                return Decimal(str(value))
            return default
        except (InvalidOperation, TypeError, ValueError):
            return default
            
    def _safe_int(self, value: Any, default: int = 0) -> int:
        """Safely convert value to int"""
        try:
            return int(float(value)) if value is not None else default
        except (ValueError, TypeError):
            return default
            
    def _parse_datetime(self, dt_str: str) -> datetime:
        """Parse datetime string from Tiingo API"""
        try:
            # Handle both '2023-01-01T00:00:00.000Z' and '2023-01-01' formats
            if 'T' in dt_str:
                if dt_str.endswith('Z'):
                    return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
                return datetime.fromisoformat(dt_str)
            return datetime.strptime(dt_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            return datetime.now(timezone.utc)
    
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """
        Get current quote for a symbol with fallback to EOD data if real-time is unavailable
        
        Args:
            symbol: Stock symbol to get quote for
            
        Returns:
            StockQuote object if successful, None otherwise
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        symbol = symbol.upper().strip()
        
        try:
            # Try to get real-time IEX data first
            iex_data = await self._make_request(f"iex/{symbol}")
            if iex_data and isinstance(iex_data, list) and len(iex_data) > 0:
                iex = iex_data[0]
                last_price = self._safe_decimal(iex.get('last'))
                prev_close = self._safe_decimal(iex.get('prevClose'))
                change = last_price - prev_close
                change_pct = (change / prev_close * 100) if prev_close != Decimal('0') else Decimal('0')
                
                return StockQuote(
                    symbol=symbol,
                    price=last_price,
                    change=change,
                    change_percent=change_pct,
                    volume=self._safe_int(iex.get('volume')),
                    open=self._safe_decimal(iex.get('open')),
                    high=self._safe_decimal(iex.get('high')),
                    low=self._safe_decimal(iex.get('low')),
                    previous_close=prev_close,
                    timestamp=self._parse_datetime(iex.get('timestamp', '')),
                    provider=self.name
                )
            
            # Fallback to EOD data if IEX data is not available
            eod_data = await self._make_request(f"tiingo/daily/{symbol}/prices")
            if not eod_data or not isinstance(eod_data, list) or not eod_data:
                self._log_error("Data Not Found", f"No data available for symbol: {symbol}")
                return None
                
            latest = eod_data[0]
            close_price = self._safe_decimal(latest.get('close'))
            
            return StockQuote(
                symbol=symbol,
                price=close_price,
                change=Decimal('0'),  # No intraday change available
                change_percent=Decimal('0'),
                volume=self._safe_int(latest.get('volume')),
                open=self._safe_decimal(latest.get('open')),
                high=self._safe_decimal(latest.get('high')),
                low=self._safe_decimal(latest.get('low')),
                previous_close=close_price,
                timestamp=self._parse_datetime(latest.get('date', '')),
                provider=self.name
            )
            
        except Exception as e:
            self._log_error("get_quote", f"Failed to fetch quote for {symbol}: {str(e)}")
            return None
    
    def _validate_historical_params(self, symbol: str, start_date: date, end_date: date, interval: str) -> Optional[Dict[str, Any]]:
        """Validate and prepare parameters for historical data request"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Validation Error", "Symbol must be a non-empty string")
            return None
        
        symbol = symbol.upper().strip()
    
        # Validate dates
        if not isinstance(start_date, date) or not isinstance(end_date, date):
            self._log_error("Validation Error", "start_date and end_date must be date objects")
            return None
        
        if start_date > end_date:
            self._log_error("Validation Error", "start_date cannot be after end_date")
            return None
        
        # Fix: Map intervals correctly
        # In your _validate_historical_params method, fix the interval mapping:
        interval_mapping = {
            Interval.DAILY: "daily",
            Interval.WEEKLY: "weekly", 
            Interval.MONTHLY: "monthly",
            Interval.YEARLY: "annually",
            "1d": "daily",
            "1w": "weekly", 
            "1M": "monthly",
            "1y": "annually"
        }
    
        freq = interval_mapping.get(interval)
        if not freq:
            valid_keys = list(interval_mapping.keys())
            self._log_error("Validation Error", f"Invalid interval: {interval}. Must be one of: {', '.join(str(k) for k in valid_keys)}")
            return None
        
        return {
            'symbol': symbol,
            'start_date': start_date,
            'end_date': end_date,
            'freq': freq
        }
        
    async def get_historical(
        self, 
        symbol: str, 
        start_date: date, 
        end_date: date,
        interval: str = "1d",
        max_results: int = 1000,
        sort: str = "asc"
    ) -> Optional[List[HistoricalPrice]]:
        """
        Get historical prices for a symbol with pagination and validation
        
        Args:
            symbol: Stock symbol to get historical data for
            start_date: Start date for historical data
            end_date: End date for historical data
            interval: Time interval ('1d' for daily, '1w' for weekly, '1M' for monthly, '1y' for annually)
            max_results: Maximum number of results to return (1-10000)
            sort: Sort order ('asc' for oldest first, 'desc' for newest first)
            
        Returns:
            List of HistoricalPrice objects if successful, None otherwise
        """
        # Validate and prepare parameters
        params = self._validate_historical_params(symbol, start_date, end_date, interval)
        if not params:
            return None
            
        # Clamp max_results to API limits
        max_results = max(1, min(10000, max_results))
        
        try:
            all_prices = []
            current_start = params['start_date']
            
            # Tiingo has a limit of 1000 records per request
            while len(all_prices) < max_results and current_start <= params['end_date']:
                # Calculate end date for this batch
                batch_end = min(
                    params['end_date'],
                    current_start + timedelta(days=365)  # 1 year at a time to avoid timeout
                )
                
                # Prepare request parameters
                request_params = {
                    'startDate': current_start.isoformat(),
                    'endDate': batch_end.isoformat(),
                    'format': 'json',
                    'resampleFreq': interval,
                    'sort': sort,
                    'limit': min(1000, max_results - len(all_prices))
                }
                
                # Make the API request
                data = await self._make_request(
                    f"tiingo/daily/{params['symbol']}/prices",
                    params=request_params
                )
                
                if not data or not isinstance(data, list):
                    break
                    
                # Process the batch
                batch_prices = []
                for item in data:
                    try:
                        price_date = self._parse_datetime(item.get('date', '')).date()
                        
                        # Skip if we've reached our max results
                        if len(all_prices) + len(batch_prices) >= max_results:
                            break
                            
                        batch_prices.append(HistoricalPrice(
                            symbol=params['symbol'],
                            date=price_date,
                            open=self._safe_decimal(item.get('open')),
                            high=self._safe_decimal(item.get('high')),
                            low=self._safe_decimal(item.get('low')),
                            close=self._safe_decimal(item.get('close')),
                            volume=self._safe_int(item.get('volume')),
                            adjusted_close=self._safe_decimal(item.get('adjClose', item.get('close'))),
                            provider=self.name
                        ))
                    except Exception as e:
                        self._log_error("Data Parsing Error", f"Failed to parse price data: {str(e)}")
                        continue
                
                # Add batch to results
                all_prices.extend(batch_prices)
                
                # Stop if we've reached our max results or end date
                if len(all_prices) >= max_results or batch_end >= params['end_date']:
                    break
                    
                # Set up for next batch
                current_start = batch_end + timedelta(days=1)
                
                # Small delay between batches to avoid rate limiting
                await asyncio.sleep(0.5)
            
            # Sort final results based on requested order
            all_prices.sort(key=lambda x: x.date, reverse=(sort.lower() == 'desc'))
            
            # Ensure we don't exceed max_results after sorting
            return all_prices[:max_results]
            
        except Exception as e:
            self._log_error("get_historical", f"Failed to fetch historical data for {symbol}: {str(e)}")
            return None
    
    async def get_intraday(
        self, 
        symbol: str, 
        interval: str = "5min"
    ) -> Optional[List[HistoricalPrice]]:
        """Get intraday prices from IEX"""
        # Map intervals to Tiingo resample frequencies
        freq_map = {
            "1min": "1min",
            "5min": "5min",
            "15min": "15min",
            "30min": "30min",
            "60min": "1hour",
            "1h": "1hour"
        }
        
        freq = freq_map.get(interval, "5min")
        
        params = {
            'resampleFreq': freq,
            'columns': 'open,high,low,close,volume'
        }
        
        data = await self._make_request(f"iex/{symbol}/prices", params)
        
        if not data or not isinstance(data, list):
            return None
        
        try:
            prices = []
            for bar in data:
                price_datetime = datetime.fromisoformat(bar['date'].replace('Z', '+00:00'))
                
                prices.append(HistoricalPrice(
                    symbol=symbol,
                    date=price_datetime.date(),
                    open=Decimal(str(bar['open'])),
                    high=Decimal(str(bar['high'])),
                    low=Decimal(str(bar['low'])),
                    close=Decimal(str(bar['close'])),
                    volume=int(bar.get('volume', 0)),
                    provider=self.name
                ))
            
            return prices
        except Exception as e:
            self._log_error("get_intraday", e)
            return None
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get company metadata"""
        data = await self._make_request(f"tiingo/daily/{symbol}")
        
        if not data:
            return None
        
        try:
            company_name = data.get('name', symbol)  # Fallback to symbol if no name

            return CompanyInfo(
                symbol=symbol,
                name=company_name,
                company_name=company_name,
                exchange=data.get('exchangeCode'),
                sector=None,  # Not provided by Tiingo
                industry=None,  # Not provided by Tiingo
                market_cap=None,  # Not provided in metadata
                employees=None,  # Not provided
                description=data.get('description'),
                website=None,  # Not provided
                ceo=None,  # Not provided
                headquarters=None,  # Not provided
                founded=data.get('startDate'),
                provider=self.name
            )
        except Exception as e:
            self._log_error("get_company_info", e)
            return None
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> Optional[List[OptionQuote]]:
        """Tiingo doesn't provide options data in free tier"""
        self._log_info(f"Options chain not available on Tiingo free tier")
        return None
    
    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental statements"""
        # Get daily metrics
        daily_data = await self._make_request(f"tiingo/fundamentals/{symbol}/daily")
        
        # Get statements
        statements_data = await self._make_request(f"tiingo/fundamentals/{symbol}/statements")
        
        if not daily_data and not statements_data:
            return None
        
        try:
            fundamentals = {
                'symbol': symbol,
                'provider': self.name
            }
            
            if daily_data:
                fundamentals.update({
                    'pe_ratio': daily_data.get('peRatio'),
                    'market_cap': daily_data.get('marketCap'),
                    'enterprise_value': daily_data.get('enterpriseVal')
                })
            
            if statements_data and isinstance(statements_data, list) and len(statements_data) > 0:
                latest = statements_data[0]
                fundamentals.update({
                    'revenue': latest.get('revenue'),
                    'gross_profit': latest.get('grossProfit'),
                    'operating_income': latest.get('opIncome'),
                    'net_income': latest.get('netIncome'),
                    'eps': latest.get('eps'),
                    'total_assets': latest.get('totalAssets'),
                    'total_liabilities': latest.get('totalLiabilities'),
                    'shareholders_equity': latest.get('shareholderEquity'),
                    'operating_cash_flow': latest.get('opCashflow')
                })
            
            return fundamentals
        except Exception as e:
            self._log_error("get_fundamentals", e)
            return None
    
  
    
    async def get_economic_data(self, indicator: str) -> Optional[Dict[str, Any]]:
        """Tiingo doesn't provide economic data in standard tier"""
        self._log_info(f"Economic data not available on Tiingo standard tier")
        return None

    async def get_earnings_calendar(self, from_date: str = None, to_date: str = None) -> Dict[str, Any]:
        """Get earnings calendar - NOTE: Tiingo does not have a dedicated earnings calendar endpoint
    
    This method will return an empty result or error since Tiingo doesn't provide
    earnings calendar data. Consider using news API to get earnings-related news instead.
    
    Args:
        from_date: Start date in YYYY-MM-DD format (not used)
        to_date: End date in YYYY-MM-DD format (not used)
    
    Returns:
        Dict indicating this feature is not available
    """
        return {
            "error": "Earnings calendar not available in Tiingo API",
            "message": "Tiingo does not provide earnings calendar data. Consider using news API for earnings-related information.",
            "available_alternatives": ["get_news", "get_fundamentals"]
        }

    async def get_earnings_transcript(self, symbol: str, year: int, quarter: int) -> Dict[str, Any]:
        """Get earnings call transcript - NOTE: Tiingo does not provide earnings transcripts
    
    This method will return an empty result since Tiingo doesn't provide
    earnings transcript data. Consider using news API for earnings-related news.
    
    Args:
        symbol: Stock symbol (e.g., 'AAPL')
        year: Year of the earnings call (not used)
        quarter: Quarter number (not used)
    
    Returns:
        Dict indicating this feature is not available
    """
        return {
            "error": "Earnings transcripts not available in Tiingo API",
            "message": f"Tiingo does not provide earnings transcripts for {symbol}. Consider using news API for earnings-related information.",
            "symbol": symbol,
            "available_alternatives": ["get_news", "get_fundamentals"]
        }
    
    async def get_economic_events(self, from_date: str = None, to_date: str = None) -> Dict[str, Any]:
        """Get economic events/calendar - NOTE: Tiingo does not have economic calendar
    
    This method will return an empty result since Tiingo doesn't provide
    economic calendar data. Consider using news API for economic news.
    
    Args:
        from_date: Start date in YYYY-MM-DD format (not used)
        to_date: End date in YYYY-MM-DD format (not used)
    
    Returns:
        Dict indicating this feature is not available
    """
        return {
            "error": "Economic events calendar not available in Tiingo API",
            "message": "Tiingo does not provide economic calendar data. Consider using news API for economic news.",
            "available_alternatives": ["get_news"]
        }

    async def get_news(self, symbol: str = None, limit: int = 100, sources: str = None, 
                   tags: str = None, start_date: str = None, end_date: str = None) -> Dict[str, Any]:
        """Get financial news from Tiingo's news API"""
    
        # Check if news API is available (it often requires premium access)
        try:
            # Correct endpoint - remove the extra "tiingo/" part
            url = f"tiingo/news"  # Not f"{self.base_url}/tiingo/news"
            params = {"token": self.api_key}
    
            if symbol:
                params["tickers"] = symbol
            if sources:
                params["sources"] = sources
            if tags:
                params["tags"] = tags
            if start_date:
                params["startDate"] = start_date
            if end_date:
                params["endDate"] = end_date
            if limit:
                params["limit"] = limit
    
            return await self._make_request(url, params)
        
        except Exception as e:
            if "404" in str(e) or "Not Found" in str(e):
                return {
                    "error": "News API not available",
                    "message": "Tiingo News API may require premium access or special permissions.",
                    "symbol": symbol,
                    "available_alternatives": ["Use a different news provider"]
            }
        else:
            raise e
    