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
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
        symbol = symbol.upper().strip()
        try:
            last_trade_endpoint = f"last/trade/{symbol}"
            prev_close_endpoint = f"aggs/ticker/{symbol}/prev"
            snapshot_endpoint = f"snapshot/locale/us/markets/stocks/tickers/{symbol}"
            quotes_endpoint = f"quotes/{symbol}"

            last_trade_data = await self._make_request(last_trade_endpoint, version='v2')
            prev_close_data = await self._make_request(prev_close_endpoint, version='v2')
            snapshot_data = await self._make_request(snapshot_endpoint, version='v2')

            last_price = None
            prev_close = None
            volume = None
            open_price = None
            high = None
            low = None

            if last_trade_data and 'results' in last_trade_data and last_trade_data['results']:
                last_trade = last_trade_data['results']
                if 'p' in last_trade:
                    last_price = self._safe_decimal(last_trade['p'])

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

            if last_price is None and prev_close_data and 'results' in prev_close_data and prev_close_data['results']:
                last_price = self._safe_decimal(prev_close_data['results'][0]['c'])

            if last_price is None:
                quote_data = await self._make_request(quotes_endpoint)
                if quote_data and 'results' in quote_data and quote_data['results']:
                    quote = quote_data['results'][0]
                    last_price = self._safe_decimal(quote.get('p'))

            if prev_close_data and 'results' in prev_close_data and prev_close_data['results']:
                prev_close = self._safe_decimal(prev_close_data['results'][0]['c'])

            if last_price is None:
                self._log_error("Data Unavailable", f"Could not retrieve price data for {symbol}")
                return None

            change = None
            change_percent = None

            if prev_close is not None and prev_close != 0:
                change = last_price - prev_close
                change_percent = (change / prev_close) * 100

            timestamp = datetime.now(timezone.utc)
            if last_trade_data and 'results' in last_trade_data and last_trade_data['results']:
                try:
                    ts = last_trade_data['results'].get('t')
                    if ts:
                        timestamp = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
                except (ValueError, TypeError):
                    pass

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
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
        symbol = symbol.upper().strip()
        end_date = end_date or date.today()
        start_date = start_date or (end_date - timedelta(days=365))
        if start_date > end_date:
            self._log_error("Invalid Date Range", f"Start date {start_date} is after end date {end_date}")
            return []
        max_days = 365 * 5
        if interval in ['1min', '5min', '15min', '30min']:
            max_days = 7
        elif interval in ['1h', '4h']:
            max_days = 30
        if (end_date - start_date).days > max_days:
            start_date = end_date - timedelta(days=max_days)
            self._log_error("Date Range Adjusted", 
                          f"Date range exceeds maximum of {max_days} days. Adjusted to {start_date} - {end_date}")
        timespan, multiplier = self._map_interval(interval)
        if interval == '60min':
            multiplier = 1
        try:
            all_prices = []
            current_start = start_date
            while current_start <= end_date and len(all_prices) < limit:
                batch_end = min(
                    current_start + timedelta(days=365 if timespan == 'minute' else 365*5),
                    end_date
                )
                endpoint = (
                    f"aggs/ticker/{symbol}/range/"
                    f"{multiplier}/{timespan}/"
                    f"{current_start.strftime('%Y-%m-%d')}/"
                    f"{batch_end.strftime('%Y-%m-%d')}"
                )
                params = {
                    'adjusted': 'true' if adjusted else 'false',
                    'sort': sort,
                    'limit': min(50000, limit - len(all_prices)),
                }
                data = await self._make_request(endpoint, params)
                if not data or 'results' not in data or not data['results']:
                    break
                for item in data['results']:
                    try:
                        date_obj = datetime.fromtimestamp(item['t'] / 1000).date()
                        open_price = self._safe_decimal(item.get('o'))
                        high_price = self._safe_decimal(item.get('h'))
                        low_price = self._safe_decimal(item.get('l'))
                        close_price = self._safe_decimal(item.get('c'))
                        volume = self._safe_int(item.get('v'))
                        all_prices.append(HistoricalPrice(
                            date=date_obj,
                            open=open_price,
                            high=high_price,
                            low=low_price,
                            close=close_price,
                            volume=volume,
                            provider=self.name
                        ))
                    except Exception as e:
                        self._log_error("get_historical", f"Error parsing historical data item: {str(e)}")
                        continue
                current_start = batch_end + timedelta(days=1)
            return all_prices
        except Exception as e:
            self._log_error("get_historical", f"Failed to fetch historical data for {symbol}: {str(e)}")
            return []

    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
        symbol = symbol.upper().strip()
        try:
            ticker_details_endpoint = f"reference/tickers/{symbol}"
            company_endpoint = f"meta/symbols/{symbol}/company"
            financials_endpoint = f"vX/reference/financials"
            logo_endpoint = f"meta/symbols/{symbol}/logo"

            ticker_data = await self._make_request(ticker_details_endpoint)
            details_data = await self._make_request(company_endpoint)
            metrics_data = await self._make_request(financials_endpoint, {'ticker': symbol, 'limit': 1})
            logo_data = await self._make_request(logo_endpoint)

            info = {}
            if ticker_data and 'results' in ticker_data and ticker_data['results']:
                info.update(ticker_data['results'])
            if details_data and isinstance(details_data, dict):
                info.update(details_data)
            metrics = {}
            if metrics_data and 'results' in metrics_data and metrics_data['results']:
                metrics = metrics_data['results'][0]
            address = info.get('address', {})
            headquarters = (
                f"{address.get('address1', '')}, "
                f"{address.get('city', '')}, "
                f"{address.get('state', '')} "
                f"{address.get('postal_code', '')}"
            ).replace(' ,', ',').replace('  ', ' ').strip(' ,')
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
            ceo = None
            if 'executives' in info and isinstance(info['executives'], list):
                for exec_info in info['executives']:
                    if exec_info.get('title', '').lower() == 'ceo':
                        ceo = exec_info.get('name')
                        break
            founded = None
            if 'founding_date' in info:
                try:
                    founded = datetime.strptime(info['founding_date'], '%Y-%m-%d').year
                except (ValueError, TypeError):
                    pass
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
                pe_ratio=self._safe_decimal(metrics.get('pe_ratio')),
                peg_ratio=self._safe_decimal(metrics.get('peg_ratio')),
                eps=self._safe_decimal(metrics.get('eps')),
                dividend_yield=self._safe_decimal(metrics.get('dividend_yield')),
                beta=self._safe_decimal(metrics.get('beta')),
                is_etf=info.get('type', '').lower() == 'etf',
                is_adr=info.get('is_adr', False),
                is_fund=info.get('is_fund', False),
                updated_at=datetime.now(timezone.utc).isoformat(),
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
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
        symbol = symbol.upper().strip()
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
        if option_type and option_type.lower() not in ['call', 'put']:
            self._log_error("Invalid Option Type", "Option type must be 'call' or 'put'")
            return []
        limit = max(1, min(1000, limit))
        try:
            all_options = []
            next_url = None
            params = {
                'underlying_ticker': symbol,
                'limit': min(1000, limit),
                'sort': 'expiration_date',
                'order': 'asc'
            }
            if expiration_date and not include_all_expirations:
                params['expiration_date'] = expiration_date.strftime('%Y-%m-%d')
            if option_type:
                params['contract_type'] = option_type.lower()
            if strike_price is not None:
                params['strike_price'] = str(strike_price)
            data = await self._make_request("reference/options/contracts", params)
            if not data or 'results' not in data or not data['results']:
                return []
            all_options.extend(self._process_options_data(data['results']))
            while len(all_options) < limit and 'next_url' in data:
                next_url = data['next_url']
                if not next_url:
                    break
                cursor = next_url.split('cursor=')[1] if 'cursor=' in next_url else None
                if not cursor:
                    break
                data = await self._make_request(
                    "reference/options/contracts",
                    {'cursor': cursor, 'limit': min(1000, limit - len(all_options))}
                )
                if not data or 'results' not in data or not data['results']:
                    break
                all_options.extend(self._process_options_data(data['results']))
            return all_options[:limit]
        except Exception as e:
            self._log_error("get_options_chain", f"Failed to fetch options chain for {symbol}: {str(e)}")
            return []

    async def get_market_status(self) -> Dict[str, Any]:
        try:
            status_data = await self._make_request("marketstatus/now", version='v1')
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
        try:
            params = {}
            if symbol:
                params['ticker'] = symbol.upper().strip()
            params['limit'] = max(1, min(1000, limit))
            if published_after:
                if isinstance(published_after, date):
                    params['published_utc.gte'] = published_after.strftime('%Y-%m-%d')
                elif isinstance(published_after, str):
                    try:
                        params['published_utc.gte'] = datetime.strptime(published_after, '%Y-%m-%d').strftime('%Y-%m-%d')
                    except ValueError:
                        pass
            if published_before:
                if isinstance(published_before, date):
                    params['published_utc.lte'] = published_before.strftime('%Y-%m-%d')
                elif isinstance(published_before, str):
                    try:
                        params['published_utc.lte'] = datetime.strptime(published_before, '%Y-%m-%d').strftime('%Y-%m-%d')
                    except ValueError:
                        pass
            data = await self._make_request("reference/news", params)
            if not data or 'results' not in data or not data['results']:
                return []
            return data['results']
        except Exception as e:
            self._log_error("get_news", f"Failed to fetch news: {str(e)}")
            return []

    async def get_dividends(self, symbol: str):
        try:
            endpoint = f"reference/dividends"
            params = {'ticker': symbol.upper()}
            data = await self._make_request(endpoint, params)
            if not data or 'results' not in data or not data['results']:
                return []
            return data['results']
        except Exception as e:
            self._log_error("get_dividends", f"Failed to fetch dividends for {symbol}: {str(e)}")
            return []

    async def get_splits(self, symbol: str):
        try:
            endpoint = f"reference/splits"
            params = {'ticker': symbol.upper()}
            data = await self._make_request(endpoint, params)
            if not data or 'results' not in data or not data['results']:
                return []
            return data['results']
        except Exception as e:
            self._log_error("get_splits", f"Failed to fetch splits for {symbol}: {str(e)}")
            return []

    async def get_market_holidays(self):
        try:
            endpoint = f"marketstatus/upcoming"
            data = await self._make_request(endpoint)
            if not data or 'markets' not in data:
                return []
            return data['markets']
        except Exception as e:
            self._log_error("get_market_holidays", f"Failed to fetch market holidays: {str(e)}")
            return []

    async def get_earnings_calendar(
        self, 
        ticker: Optional[str] = None,
        date: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        importance: Optional[int] = None,
        fiscal_year: Optional[int] = None,
        fiscal_period: Optional[str] = None,
        limit: int = 100,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Get earnings calendar data from Polygon.io
        
        Args:
            ticker: Stock symbol to filter by
            date: Specific date (YYYY-MM-DD format)
            date_from: Start date for range query
            date_to: End date for range query
            importance: Importance level (0-5)
            fiscal_year: Fiscal year filter
            fiscal_period: Fiscal period (Q1, Q2, Q3, Q4, H1, H2, FY)
            limit: Maximum number of results (default 100, max 50000)
        
        Returns:
            Dictionary containing earnings data
        """
        endpoint = "/benzinga/v1/earnings"
        params = {}
        
        if ticker:
            params['ticker'] = ticker
        if date:
            params['date'] = date
        if date_from:
            params['date.gte'] = date_from
        if date_to:
            params['date.lte'] = date_to
        if importance is not None:
            params['importance'] = importance
        if fiscal_year:
            params['fiscal_year'] = fiscal_year
        if fiscal_period:
            params['fiscal_period'] = fiscal_period
        if limit:
            params['limit'] = limit
        
        try:
            data = await self._make_request(endpoint, params)
            self.logger.info(f"Retrieved earnings calendar data for {ticker or 'all tickers'}")
            return data
        except Exception as e:
            self.logger.error(f"Failed to get earnings calendar: {e}")
            raise
    
    async def get_earnings_transcript(
        self, 
        ticker: str,
        quarter: Optional[int] = None,
        year: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Get earnings call transcript data
        Note: This endpoint may not be available in all Polygon.io plans
        
        Args:
            ticker: Stock symbol
            quarter: Quarter (1-4)
            year: Year
            
        Returns:
            Dictionary containing transcript data or error message
        """
        # Note: Polygon.io doesn't have a direct earnings transcript endpoint
        # This would typically require a premium data provider or custom implementation
        self.logger.warning("Earnings transcripts not directly available via Polygon.io API")
        
        return {
            "status": "not_available",
            "message": "Earnings transcripts are not directly available through Polygon.io API",
            "ticker": ticker,
            "quarter": quarter,
            "year": year,
            "suggestion": "Consider using alternative data sources for earnings call transcripts"
        }
    
    async def get_economic_data(
        self,
        indicator: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = 100,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Get economic data/indicators
        Note: Polygon.io primarily focuses on market data, not economic indicators
        
        Args:
            indicator: Economic indicator name
            date_from: Start date
            date_to: End date
            limit: Maximum results
            
        Returns:
            Dictionary with economic data or reference to alternative sources
        """
        # Polygon.io doesn't have dedicated economic data endpoints
        # They focus on market data (stocks, options, forex, crypto)
        
        self.logger.warning("Economic indicators not available via Polygon.io")
        
        return {
            "status": "not_available",
            "message": "Economic data indicators are not available through Polygon.io API",
            "indicator": indicator,
            "suggestion": "Consider using FRED API, Alpha Vantage, or other economic data providers",
            "available_data": [
                "Stock market data",
                "Options data", 
                "Forex data",
                "Cryptocurrency data",
                "Market indices",
                "Company financials"
            ]
        }
    
    async def get_economic_events(
        self,
        date: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        importance: Optional[str] = None,
        country: Optional[str] = None,
        limit: int = 100,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Get economic events calendar
        Note: Polygon.io doesn't provide economic events calendar
        
        Args:
            date: Specific date
            date_from: Start date
            date_to: End date
            importance: Event importance level
            country: Country filter
            limit: Maximum results
            
        Returns:
            Dictionary with events data or alternative suggestions
        """
        # Polygon.io focuses on market data, not economic events calendar
        
        self.logger.warning("Economic events calendar not available via Polygon.io")
        
        return {
            "status": "not_available",
            "message": "Economic events calendar is not available through Polygon.io API",
            "date": date,
            "suggestion": "Consider using economic calendar APIs from:",
            "alternatives": [
                "Trading Economics API",
                "Alpha Vantage Economic Data",
                "FRED API (Federal Reserve Economic Data)",
                "Forex Factory Calendar",
                "Investing.com Economic Calendar API"
            ],
            "polygon_alternatives": {
                "earnings_calendar": "Available via /benzinga/v1/earnings",
                "market_holidays": "Available via /v1/marketstatus/upcoming",
                "stock_splits": "Available via /v3/reference/splits",
                "dividends": "Available via /v3/reference/dividends"
            }
        }

    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental financials"""
        endpoint = f"vX/reference/financials"
        params = {'ticker': symbol, 'limit': 1}
        data = await self._make_request(endpoint, params)
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
