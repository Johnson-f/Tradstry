"""
Finnhub API Provider Implementation

This module provides an optimized implementation of the MarketDataProvider interface
for the Finnhub API with enhanced error handling, rate limiting, and data validation.
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

# Finnhub API intervals
class Interval:
    MIN_1 = "1"
    MIN_5 = "5"
    MIN_15 = "15"
    MIN_30 = "30"
    HOUR_1 = "60"
    DAILY = "D"
    WEEKLY = "W"
    MONTHLY = "M"


class FinnhubProvider(MarketDataProvider):
    """
    Finnhub API implementation with enhanced features and error handling.
    
    Rate Limits (Free Tier):
    - 30 API calls per second
    - 1,000,000 API calls per month
    """
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "Finnhub")
        self.base_url = "https://finnhub.io/api/v1"
        self.rate_limit_per_second = 30  # Finnhub free tier limit
        self.rate_limit_per_month = 1000000
        self._last_request_time = 0
        self._request_count = 0
        self._rate_limit_semaphore = asyncio.Semaphore(self.rate_limit_per_second)
    
    def _safe_decimal(self, value: Any, default: Decimal = Decimal('0')) -> Decimal:
        """Safely convert value to Decimal"""
        if value is None:
            return default
        try:
            if isinstance(value, (int, float, Decimal)):
                return Decimal(str(value))
            if isinstance(value, str):
                # Remove any non-numeric characters except decimal point and minus
                clean_value = ''.join(c for c in value if c.isdigit() or c in '-.')
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
    
    async def _make_request(self, 
                          endpoint: str, 
                          params: Optional[Dict[str, Any]] = None,
                          version: str = "v1"
                         ) -> Optional[Union[Dict, List]]:
        """
        Make an API request to Finnhub with rate limiting and error handling
        
        Args:
            endpoint: API endpoint (e.g., 'quote')
            params: Query parameters
            version: API version (default: v1)
            
        Returns:
            JSON response as dict or list, or None if request fails
        """
        if params is None:
            params = {}
            
        # Add API key to params
        params['token'] = self.api_key
        
        # Rate limiting
        current_time = asyncio.get_event_loop().time()
        time_since_last = current_time - self._last_request_time
        
        # Ensure we don't exceed rate limits
        if time_since_last < (1 / self.rate_limit_per_second):
            await asyncio.sleep((1 / self.rate_limit_per_second) - time_since_last)
        
        async with self._rate_limit_semaphore:
            try:
                self._request_count += 1
                self._last_request_time = asyncio.get_event_loop().time()
                
                url = f"{self.base_url}/{endpoint.lstrip('/')}"
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, params=params, timeout=30) as response:
                        if response.status == 200:
                            return await response.json()
                        elif response.status == 429:
                            retry_after = int(response.headers.get('X-RateLimit-Reset', 60))
                            logger.warning(f"Rate limited. Waiting {retry_after} seconds...")
                            await asyncio.sleep(retry_after)
                            return await self._make_request(endpoint, params, version)
                        else:
                            error_text = await response.text()
                            self._log_error(
                                "API Request", 
                                f"HTTP {response.status} - {error_text}"
                            )
                            return None
                            
            except asyncio.TimeoutError:
                self._log_error("API Timeout", f"Request to {endpoint} timed out")
                return None
                
            except aiohttp.ClientError as e:
                self._log_error("HTTP Client Error", str(e))
                return None
                
            except Exception as e:
                self._log_error("Request Error", f"Unexpected error: {str(e)}")
                return None
    
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """
        Get current quote for a symbol
        
        Args:
            symbol: Stock symbol (e.g., 'AAPL')
            
        Returns:
            StockQuote object with current market data or None if not found
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        try:
            # First try the quote endpoint
            data = await self._make_request("quote", {'symbol': symbol.upper()})
            
            if not data or 'c' not in data:  # 'c' is current price
                # Fallback to last price if full quote fails
                last_price_data = await self._make_request("quote/last", {'symbol': symbol.upper()})
                if not last_price_data or 'last' not in last_price_data:
                    return None
                    
                return StockQuote(
                    symbol=symbol.upper(),
                    price=self._safe_decimal(last_price_data.get('last')),
                    change=Decimal('0'),
                    change_percent=Decimal('0'),
                    volume=0,
                    open_price=Decimal('0'),
                    high_price=Decimal('0'),
                    low_price=Decimal('0'),
                    previous_close=Decimal('0'),
                    timestamp=datetime.now(timezone.utc),
                    provider=self.name
                )
            
            # Parse the full quote
            return StockQuote(
                symbol=symbol.upper(),
                price=self._safe_decimal(data.get('c')),  # Current price
                change=self._safe_decimal(data.get('d')),  # Change
                change_percent=self._safe_decimal(data.get('dp')),  # Percent change
                volume=self._safe_int(data.get('v', 0)),
                open_price=self._safe_decimal(data.get('o')),  # Open price
                high_price=self._safe_decimal(data.get('h')),  # High price
                low_price=self._safe_decimal(data.get('l')),  # Low price
                previous_close=self._safe_decimal(data.get('pc')),  # Previous close
                timestamp=datetime.fromtimestamp(data.get('t', 0), tz=timezone.utc)
                        if data.get('t') else datetime.now(timezone.utc),
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
        interval: str = "1d"
    ) -> List[HistoricalPrice]:
        """
        Get historical prices for a symbol
        
        Args:
            symbol: Stock symbol (e.g., 'AAPL')
            start_date: Start date (default: 1 year ago)
            end_date: End date (default: today)
            interval: Time interval ('1min', '5min', '15min', '30min', '60min', '1d', '1w', '1m')
            
        Returns:
            List of HistoricalPrice objects
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        try:
            # Set default date range if not provided
            end_date = end_date or date.today()
            start_date = start_date or (end_date - timedelta(days=365))
            
            # Convert dates to timestamps with timezone
            start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
            end_dt = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)
            start_timestamp = int(start_dt.timestamp())
            end_timestamp = int(end_dt.timestamp())
            
            # Map interval to Finnhub resolution
            resolution_map = {
                "1min": Interval.MIN_1,
                "5min": Interval.MIN_5,
                "15min": Interval.MIN_15,
                "30min": Interval.MIN_30,
                "60min": Interval.HOUR_1,
                "1d": Interval.DAILY,
                "daily": Interval.DAILY,
                "1w": Interval.WEEKLY,
                "weekly": Interval.WEEKLY,
                "1m": Interval.MONTHLY,
                "monthly": Interval.MONTHLY
            }
            
            resolution = resolution_map.get(interval.lower(), Interval.DAILY)
            
            params = {
                'symbol': symbol.upper(),
                'resolution': resolution,
                'from': start_timestamp,
                'to': end_timestamp
            }
            
            data = await self._make_request("stock/candle", params)
            if not data or data.get('s') != 'ok' or 't' not in data:
                return []
            
            # Process and validate price data
            prices = []
            timestamps = data.get('t', [])
            opens = data.get('o', [])
            highs = data.get('h', [])
            lows = data.get('l', [])
            closes = data.get('c', [])
            volumes = data.get('v', [])
            
            for i in range(min(len(timestamps), len(opens), len(highs), 
                             len(lows), len(closes), len(volumes))):
                try:
                    price_datetime = datetime.fromtimestamp(timestamps[i], tz=timezone.utc)
                    
                    prices.append(HistoricalPrice(
                        symbol=symbol.upper(),
                        date=price_datetime.date(),
                        open=self._safe_decimal(opens[i]),
                        high=self._safe_decimal(highs[i]),
                        low=self._safe_decimal(lows[i]),
                        close=self._safe_decimal(closes[i]),
                        volume=self._safe_int(volumes[i]),
                        provider=self.name
                    ))
                    
                except (IndexError, KeyError, ValueError) as e:
                    self._log_error("Data Processing", f"Error processing price data at index {i}: {e}")
                    continue
            
            # Sort by date ascending
            prices.sort(key=lambda x: x.date)
            
            if prices:
                logger.info(f"Retrieved {len(prices)} historical prices for {symbol} from {start_date} to {end_date}")
                
            return prices
            
        except Exception as e:
            self._log_error("get_historical", f"Failed to fetch historical data for {symbol}: {str(e)}")
            return []
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """
        Get comprehensive company information
        
        Args:
            symbol: Stock symbol (e.g., 'AAPL')
            
        Returns:
            CompanyInfo object with company details or None if not found
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        try:
            # Fetch company profile
            profile_data = await self._make_request("stock/profile2", {'symbol': symbol.upper()})
            
            # Fetch company metrics for additional data
            metrics_data = await self._make_request("stock/metric", {
                'symbol': symbol.upper(),
                'metric': 'all'
            })
            
            if not profile_data:
                return None
                
            # Extract metrics if available
            metrics = metrics_data.get('metric', {}) if metrics_data else {}
            
            # Build company info
            return CompanyInfo(
                symbol=symbol.upper(),
                name=profile_data.get('name', ''),
                description=profile_data.get('description', ''),
                ceo=profile_data.get('ceo', ''),
                sector=profile_data.get('finnhubIndustry', ''),
                industry=profile_data.get('finnhubIndustry', ''),
                employees=self._safe_int(profile_data.get('employees', 0)),
                website=profile_data.get('weburl', ''),
                logo=profile_data.get('logo', ''),
                market_cap=self._safe_decimal(metrics.get('marketCapitalization')),
                pe_ratio=self._safe_decimal(metrics.get('peNormalizedAnnual')),
                dividend_yield=self._safe_decimal(metrics.get('dividendYieldIndicatedAnnual')),
                beta=self._safe_decimal(metrics.get('beta')),
                year_high=self._safe_decimal(metrics.get('52WeekHigh')),
                year_low=self._safe_decimal(metrics.get('52WeekLow')),
                avg_volume=self._safe_int(metrics.get('averageDailyVolume10Day')),
                shares_outstanding=self._safe_int(metrics.get('sharesOutstanding')),
                provider=self.name
            )
            
        except Exception as e:
            self._log_error("get_company_info", f"Failed to fetch company info for {symbol}: {str(e)}")
            self._log_error("get_company_info", e)
            return None
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> Optional[List[OptionQuote]]:
        """Get options chain - Finnhub requires premium for options data"""
        self._log_info(f"Options chain requires premium subscription on Finnhub")
        return None
    
    async def get_news(
        self, 
        symbol: Optional[str] = None, 
        limit: int = 100,
        days: int = 7,
        category: str = 'general'
    ) -> List[Dict[str, Any]]:
        """
        Get news articles for a specific symbol or general market news
        
        Args:
            symbol: Stock symbol (e.g., 'AAPL'). If None, returns general market news.
            limit: Maximum number of news articles to return (1-1000)
            days: Number of days of news to retrieve (1-365, only for company news)
            category: News category for general news ('general', 'forex', 'crypto', 'merger')
            
        Returns:
            List of news articles with details like headline, summary, URL, etc.
        """
        try:
            # Validate inputs
            limit = max(1, min(1000, limit))  # Clamp between 1-1000
            days = max(1, min(365, days))  # Clamp between 1-365
            
            if symbol:
                # Company-specific news
                today = datetime.now(timezone.utc).date()
                from_date = (today - timedelta(days=days)).strftime('%Y-%m-%d')
                to_date = today.strftime('%Y-%m-%d')
                
                params = {
                    'symbol': symbol.upper(),
                    'from': from_date,
                    'to': to_date
                }
                data = await self._make_request("company-news", params)
                
                # Filter out any None or empty items
                if data and isinstance(data, list):
                    data = [item for item in data if item and isinstance(item, dict)]
                    
                    # Sort by date (newest first)
                    data.sort(key=lambda x: x.get('datetime', 0), reverse=True)
            else:
                # General market news
                valid_categories = ['general', 'forex', 'crypto', 'merger']
                if category not in valid_categories:
                    category = 'general'
                    
                data = await self._make_request("news", {'category': category})
            
            if not data or not isinstance(data, list):
                return []
                
            # Standardize the news items
            news_items = []
            for item in data[:limit]:
                try:
                    # Convert timestamp to datetime if it exists
                    if 'datetime' in item and isinstance(item['datetime'], (int, float)):
                        item['datetime'] = datetime.fromtimestamp(item['datetime'], tz=timezone.utc)
                        
                    # Ensure required fields exist
                    item.setdefault('headline', '')
                    item.setdefault('summary', '')
                    item.setdefault('url', '')
                    item.setdefault('source', 'Finnhub')
                    
                    news_items.append(item)
                    
                except Exception as e:
                    self._log_error("News Processing", f"Error processing news item: {str(e)}")
                    continue
            
            return news_items
            
        except Exception as e:
            self._log_error("get_news", f"Failed to fetch news for {symbol or 'market'}: {str(e)}")
            return []

    async def get_earnings_calendar(self, symbol: str = None, horizon: str = "3month") -> List[Dict[str, Any]]:
        """
        Get earnings calendar data from Finnhub
        
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
                'from': start_date.strftime('%Y-%m-%d'),
                'to': end_date.strftime('%Y-%m-%d')
            }
            
            # Add symbol filter if provided
            if symbol:
                params['symbol'] = symbol.upper()
            
            data = await self._make_request('calendar/earnings', params)
            
            # Finnhub returns earnings calendar in 'earningsCalendar' key
            earnings_data = data.get('earningsCalendar', [])
            
            # Transform data to standardized format
            standardized_data = []
            for event in earnings_data:
                standardized_event = {
                    'symbol': event.get('symbol', ''),
                    'date': event.get('date', ''),
                    'hour': event.get('hour', ''),
                    'quarter': event.get('quarter', ''),
                    'year': event.get('year', ''),
                    'epsEstimate': event.get('epsEstimate'),
                    'epsActual': event.get('epsActual'),
                    'revenueEstimate': event.get('revenueEstimate'),
                    'revenueActual': event.get('revenueActual')
                }
                standardized_data.append(standardized_event)
            
            return standardized_data
            
        except Exception as e:
            logging.error(f"Error fetching earnings calendar: {str(e)}")
            return []
    
    async def get_earnings_transcript(self, symbol: str, year: str, quarter: str) -> Dict[str, Any]:
        """
        Get earnings call transcript from Finnhub
        
        Args:
            symbol: Stock symbol
            year: Year (e.g., "2024")
            quarter: Quarter (1, 2, 3, or 4)
        
        Returns:
            Dictionary containing transcript data
        """
        try:
            # First, get the list of available transcripts for the symbol
            params = {'symbol': symbol.upper()}
            transcript_list = await self._make_request('stock/transcripts/list', params)
            
            # Find the specific transcript for the given year and quarter
            transcripts = transcript_list.get('transcripts', [])
            target_transcript_id = None
            
            for transcript in transcripts:
                # Match by year and quarter
                transcript_year = str(transcript.get('year', ''))
                transcript_quarter = str(transcript.get('quarter', ''))
                
                if transcript_year == year and transcript_quarter == quarter:
                    target_transcript_id = transcript.get('id')
                    break
            
            if not target_transcript_id:
                logging.warning(f"No transcript found for {symbol} Q{quarter} {year}")
                return {
                    'symbol': symbol,
                    'year': year,
                    'quarter': quarter,
                    'transcript': '',
                    'error': 'Transcript not found'
                }
            
            # Get the actual transcript content
            transcript_params = {'id': target_transcript_id}
            transcript_data = await self._make_request('stock/transcripts', transcript_params)
            
            return {
                'symbol': symbol,
                'year': year,
                'quarter': quarter,
                'transcript': transcript_data.get('transcript', ''),
                'transcript_id': target_transcript_id
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
    
    async def get_economic_events(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Get economic calendar events from Finnhub
        
        Args:
            **kwargs: Additional parameters like date range, impact level, etc.
        
        Returns:
            List of economic events
        """
        try:
            # Set default date range if not provided
            end_date = kwargs.get('to', datetime.now().strftime('%Y-%m-%d'))
            start_date = kwargs.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
            
            params = {
                'from': start_date,
                'to': end_date
            }
            
            # Add additional filters if provided
            if 'country' in kwargs:
                params['country'] = kwargs['country']
            if 'impact' in kwargs:
                params['impact'] = kwargs['impact']
            
            data = await self._make_request('calendar/economic', params)
            
            # Finnhub returns economic events in 'economicCalendar' key
            economic_events = data.get('economicCalendar', [])
            
            # Transform data to standardized format
            standardized_events = []
            for event in economic_events:
                standardized_event = {
                    'date': event.get('time', ''),
                    'country': event.get('country', ''),
                    'event': event.get('event', ''),
                    'impact': event.get('impact', ''),
                    'estimate': event.get('estimate'),
                    'actual': event.get('actual'),
                    'previous': event.get('prev'),
                    'unit': event.get('unit', ''),
                    'currency': event.get('currency', '')
                }
                standardized_events.append(standardized_event)
            
            return standardized_events
            
        except Exception as e:
            logging.error(f"Error fetching economic events: {str(e)}")
            return []
            
    async def get_earnings(
        self, 
        symbol: str,
        limit: int = 10,
        future: bool = True,
        past: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Get earnings calendar data for a symbol
        
        Args:
            symbol: Stock symbol (e.g., 'AAPL')
            limit: Maximum number of earnings to return (1-100)
            future: Include future earnings dates
            past: Include past earnings dates
            
        Returns:
            List of earnings data points with details like date, EPS estimates, etc.
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        try:
            # Validate inputs
            limit = max(1, min(100, limit))  # Clamp between 1-100
            
            # Get earnings calendar
            data = await self._make_request("stock/earnings", {
                'symbol': symbol.upper()
            })
            
            if not data or not isinstance(data, list):
                return []
                
            # Process and filter earnings data
            earnings = []
            current_date = datetime.now(timezone.utc).date()
            
            for item in data:
                try:
                    if not isinstance(item, dict):
                        continue
                        
                    # Parse date if available
                    if 'date' in item and item['date']:
                        if isinstance(item['date'], (int, float)):
                            # Handle Unix timestamp
                            item['date'] = datetime.fromtimestamp(item['date'], tz=timezone.utc).date()
                        elif isinstance(item['date'], str):
                            # Handle date string (YYYY-MM-DD)
                            try:
                                item['date'] = datetime.strptime(item['date'], '%Y-%m-%d').date()
                            except ValueError:
                                continue
                    
                    # Filter based on date if needed
                    if 'date' in item and isinstance(item['date'], date):
                        is_future = item['date'] > current_date
                        if (future and is_future) or (past and not is_future):
                            # Standardize the earnings data
                            standardized = {
                                'symbol': symbol.upper(),
                                'date': item['date'],
                                'eps_actual': self._safe_decimal(item.get('actual'), Decimal('0')),
                                'eps_estimate': self._safe_decimal(item.get('estimate'), Decimal('0')),
                                'revenue_actual': self._safe_decimal(item.get('revenueActual'), Decimal('0')) * 1000000,  # Convert to actual value
                                'revenue_estimate': self._safe_decimal(item.get('revenueEstimate'), Decimal('0')) * 1000000,  # Convert to actual value
                                'period': item.get('period', ''),
                                'year': item.get('year', 0),
                                'quarter': item.get('quarter', 0),
                                'provider': self.name
                            }
                            earnings.append(standardized)
                            
                except Exception as e:
                    self._log_error("Earnings Processing", f"Error processing earnings data: {str(e)}")
                    continue
            
            # Sort by date (newest first)
            earnings.sort(key=lambda x: x.get('date', date.min), reverse=True)
            
            # Apply limit
            return earnings[:limit]
            
        except Exception as e:
            self._log_error("get_earnings", f"Failed to fetch earnings for {symbol}: {str(e)}")
            return []
    
    async def get_fundamentals(self, symbol: str) -> Dict[str, Any]:
        """
        Get comprehensive fundamental metrics for a symbol
        
        Args:
            symbol: Stock symbol (e.g., 'AAPL')
            
        Returns:
            Dictionary containing various fundamental metrics and ratios.
            Returns empty dict on error or if no data is available.
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return {}
            
        try:
            # Get all available metrics
            data = await self._make_request("stock/metric", {
                'symbol': symbol.upper(),
                'metric': 'all'
            })
            
            if not data or 'metric' not in data:
                return {}
                
            metrics = data.get('metric', {})
            
            # Process and standardize the metrics
            return {
                # Basic Info
                'symbol': symbol.upper(),
                'provider': self.name,
                'name': metrics.get('name', ''),
                'sector': metrics.get('sector', ''),
                'industry': metrics.get('industry', ''),
                
                # Valuation Metrics
                'market_cap': self._safe_decimal(metrics.get('marketCapitalization')),
                'enterprise_value': self._safe_decimal(metrics.get('enterpriseValue')),
                'pe_ratio': self._safe_decimal(metrics.get('peBasicExclExtraTTM')),
                'forward_pe': self._safe_decimal(metrics.get('peExclExtraTTM')),
                'peg_ratio': self._safe_decimal(metrics.get('pegRatio')),
                'price_to_sales': self._safe_decimal(metrics.get('psAnnual')),
                'price_to_book': self._safe_decimal(metrics.get('pbAnnual')),
                'price_to_fcf': self._safe_decimal(metrics.get('pfcfShareAnnual')),
                'ev_to_ebitda': self._safe_decimal(metrics.get('evToEbitda')),
                'ev_to_revenue': self._safe_decimal(metrics.get('evToRevenue')),
                
                # Profitability
                'gross_margin': self._safe_decimal(metrics.get('grossMarginAnnual')),
                'operating_margin': self._safe_decimal(metrics.get('operatingMarginAnnual')),
                'net_margin': self._safe_decimal(metrics.get('netMarginAnnual')),
                'roa': self._safe_decimal(metrics.get('roaRfy')),
                'roe': self._safe_decimal(metrics.get('roeRfy')),
                'roic': self._safe_decimal(metrics.get('roicRfy')),
                
                # Financial Health
                'current_ratio': self._safe_decimal(metrics.get('currentRatioAnnual')),
                'quick_ratio': self._safe_decimal(metrics.get('quickRatioAnnual')),
                'debt_to_equity': self._safe_decimal(metrics.get('ltDebtToEquityAnnual')),
                'interest_coverage': self._safe_decimal(metrics.get('interestCoverage')),
                
                # Growth
                'revenue_growth_3y': self._safe_decimal(metrics.get('revenueGrowth3Y')),
                'eps_growth_3y': self._safe_decimal(metrics.get('epsGrowth3Y')),
                
                # Dividends
                'dividend_yield': self._safe_decimal(metrics.get('dividendYieldIndicatedAnnual')),
                'dividend_rate': self._safe_decimal(metrics.get('dividendRatePerShareAnnual')),
                'payout_ratio': self._safe_decimal(metrics.get('payoutRatioAnnual')),
                'dividend_growth_3y': self._safe_decimal(metrics.get('dividendGrowth3Y')),
                
                # Price Data
                '52_week_high': self._safe_decimal(metrics.get('52WeekHigh')),
                '52_week_low': self._safe_decimal(metrics.get('52WeekLow')),
                '50_day_ma': self._safe_decimal(metrics.get('price50DayMA')),
                '200_day_ma': self._safe_decimal(metrics.get('price200DayMA')),
                
                # Volume
                '10_day_avg_volume': self._safe_decimal(metrics.get('10DayAverageTradingVolume')),
                '3_month_avg_volume': self._safe_decimal(metrics.get('3MonthAverageTradingVolume')),
                
                # Per Share Data
                'eps': self._safe_decimal(metrics.get('epsBasicExclExtraItemsTTM')),
                'revenue_per_share': self._safe_decimal(metrics.get('revenuePerShareTTM')),
                'book_value_per_share': self._safe_decimal(metrics.get('bookValuePerShareQuarterly')),
                'free_cash_flow_per_share': self._safe_decimal(metrics.get('fcfShareAnnual')),
                
                # Risk Metrics
                'beta': self._safe_decimal(metrics.get('beta')),
                'sharpe_ratio': self._safe_decimal(metrics.get('sharpeRatio')),
                'sortino_ratio': self._safe_decimal(metrics.get('sortinoRatio')),
                
                # Timestamp
                'as_of_date': datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            self._log_error("get_fundamentals", f"Failed to fetch fundamentals for {symbol}: {str(e)}")
            return {}
    
    async def get_economic_data(
        self, 
        countries: Optional[List[str]] = None,
        importance: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get economic calendar data with filtering options
        
        Args:
            countries: List of country codes to filter by (e.g., ['US', 'EU', 'CN'])
            importance: Filter by importance level (1-3, where 3 is most important)
            start_date: Start date for filtering (default: 30 days ago)
            end_date: End date for filtering (default: today)
            limit: Maximum number of events to return (1-1000)
            
        Returns:
            List of economic events with details like date, country, event, etc.
        """
        try:
            # Set default date range if not provided
            end_date = end_date or date.today()
            start_date = start_date or (end_date - timedelta(days=30))
            
            # Prepare parameters
            params = {
                'from': start_date.strftime('%Y-%m-%d'),
                'to': end_date.strftime('%Y-%m-%d')
            }
            
            # Add optional filters
            if countries and isinstance(countries, list):
                params['country'] = ','.join([c.upper() for c in countries if isinstance(c, str)])
                
            if importance is not None and 1 <= importance <= 3:
                params['importance'] = importance
                
            # Get economic calendar data
            data = await self._make_request("calendar/economic", params)
            
            if not data or not isinstance(data, list):
                return []
                
            # Process and standardize the economic events
            events = []
            for event in data[:limit]:
                try:
                    # Skip invalid events
                    if not isinstance(event, dict):
                        continue
                        
                    # Parse date if available
                    event_date = None
                    if 'date' in event and event['date']:
                        try:
                            # Handle both timestamp and date string formats
                            if isinstance(event['date'], (int, float)):
                                event_date = datetime.fromtimestamp(event['date'], tz=timezone.utc)
                            elif isinstance(event['date'], str):
                                # Try parsing ISO format
                                try:
                                    event_date = datetime.fromisoformat(event['date'].replace('Z', '+00:00'))
                                except ValueError:
                                    # Fallback to custom format if ISO parsing fails
                                    event_date = datetime.strptime(event['date'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
                        except (ValueError, TypeError) as e:
                            self._log_error("Date Parsing", f"Failed to parse date: {event.get('date')}")
                            continue
                    
                    # Standardize the event data
                    standardized = {
                        'event': event.get('event', ''),
                        'country': event.get('country', ''),
                        'date': event_date.isoformat() if event_date else None,
                        'importance': event.get('importance', 0),
                        'actual': self._safe_decimal(event.get('actual')),
                        'previous': self._safe_decimal(event.get('previous')),
                        'forecast': self._safe_decimal(event.get('forecast')),
                        'unit': event.get('unit', ''),
                        'currency': event.get('currency', ''),
                        'impact': event.get('impact', ''),
                        'provider': self.name
                    }
                    
                    # Add additional fields if available
                    for field in ['time', 'comment', 'figure', 'revised', 'change', 'change_percent']:
                        if field in event:
                            standardized[field] = event[field]
                    
                    events.append(standardized)
                    
                except Exception as e:
                    self._log_error("Event Processing", f"Error processing economic event: {str(e)}")
                    continue
            
            # Sort by date (newest first)
            events.sort(key=lambda x: x.get('date') or '', reverse=True)
            
            # Apply limit
            return events[:limit]
            
        except Exception as e:
            self._log_error("get_economic_data", f"Failed to fetch economic data: {str(e)}")
            return []
