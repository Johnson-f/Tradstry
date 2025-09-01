"""Financial Modeling Prep API Provider Implementation"""

import aiohttp
import asyncio
from typing import Dict, List, Optional, Any, Union, Tuple
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal, InvalidOperation
import logging

from ..base import MarketDataProvider, StockQuote, HistoricalPrice, CompanyInfo, EconomicEvent

# Configure logger
logger = logging.getLogger(__name__)

# FMP API intervals
class Interval:
    MIN_1 = "1min"
    MIN_5 = "5min"
    MIN_15 = "15min"
    MIN_30 = "30min"
    HOUR_1 = "1hour"
    HOUR_4 = "4hour"
    DAILY = "1day"
    WEEKLY = "1week"
    MONTHLY = "1month"


class FMPProvider(MarketDataProvider):
    """Financial Modeling Prep API implementation with enhanced features and error handling"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "FMP")
        self.base_url = "https://financialmodelingprep.com/api/v3"
        self.rate_limit_per_day = 250  # FMP free tier limit: 250 calls/day
    
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
    
    def _standardize_interval(self, interval: str) -> str:
        """Convert interval to FMP format"""
        interval_map = {
            "1min": "1min",
            "5min": "5min",
            "15min": "15min",
            "30min": "30min",
            "1h": "1hour",
            "1hour": "1hour",
            "4h": "4hour",
            "4hour": "4hour",
            "1d": "1day",
            "daily": "1day",
            "1w": "1week",
            "weekly": "1week",
            "1m": "1month",
            "monthly": "1month"
        }
        return interval_map.get(interval.lower(), "1day")
    
    async def _make_request(
        self, 
        endpoint: str, 
        params: Optional[Dict[str, Any]] = None,
        version: str = "v3"
    ) -> Any:
        """
        Make API request to FMP with retries and rate limiting
        
        Args:
            endpoint: API endpoint (without version)
            params: Query parameters
            version: API version (v3, v4, etc.)
            
        Returns:
            Parsed JSON response or None if request failed
        """
        if params is None:
            params = {}
            
        params['apikey'] = self.api_key
        url = f"{self.base_url}/{version}/{endpoint.lstrip('/')}"
        
        # Implement rate limiting
        if self.last_request_time is not None:
            elapsed = (datetime.now() - self.last_request_time).total_seconds()
            min_interval = 86400.0 / (self.rate_limit_per_day or 1)
            if elapsed < min_interval:
                await asyncio.sleep(min_interval - elapsed)
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    self.last_request_time = datetime.now()
                    
                    if response.status == 200:
                        data = await response.json()
                        
                        # Handle error responses
                        if isinstance(data, dict):
                            if 'Error Message' in data:
                                self._log_error("API Error", data['Error Message'])
                                return None
                            if 'error' in data:
                                self._log_error("API Error", data['error'])
                                return None
                        
                        return data
                    
                    # Handle rate limiting
                    elif response.status == 429:
                        retry_after = int(response.headers.get('Retry-After', '60'))
                        logger.warning(f"Rate limited. Waiting {retry_after} seconds...")
                        await asyncio.sleep(retry_after)
                        return await self._make_request(endpoint, params, version)
                    
                    else:
                        error_text = await response.text()
                        self._log_error("API Request Failed", 
                                      f"Status: {response.status}, URL: {url}, Response: {error_text}")
                        return None
                        
        except aiohttp.ClientError as e:
            self._log_error("HTTP Client Error", str(e))
            return None
        except Exception as e:
            self._log_error("Request Failed", str(e))
            return None
    
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """
        Get current quote for a symbol
        
        Args:
            symbol: Stock symbol to get quote for
            
        Returns:
            StockQuote object if successful, None otherwise
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        try:
            # Try the detailed quote endpoint first
            data = await self._make_request(f"quote/{symbol.upper()}")
            
            if not data or not isinstance(data, list) or not data[0]:
                # Fallback to quote-short if detailed quote fails
                data = await self._make_request(f"quote-short/{symbol.upper()}")
                if not data or not isinstance(data, list) or not data[0]:
                    return None
                
                # Handle short quote format
                quote = data[0]
                return StockQuote(
                    symbol=quote.get('symbol', symbol.upper()),
                    price=self._safe_decimal(quote.get('price')),
                    change=self._safe_decimal(quote.get('change', 0)),
                    change_percent=self._safe_decimal(quote.get('changesPercentage', 0)),
                    timestamp=datetime.now(timezone.utc)
                )
            
            # Handle detailed quote format
            quote = data[0]
            return StockQuote(
                symbol=quote.get('symbol', symbol.upper()),
                price=self._safe_decimal(quote.get('price')),
                open_price=self._safe_decimal(quote.get('open')),
                high_price=self._safe_decimal(quote.get('dayHigh')),
                low_price=self._safe_decimal(quote.get('dayLow')),
                previous_close=self._safe_decimal(quote.get('previousClose')),
                change=self._safe_decimal(quote.get('change', 0)),
                change_percent=self._safe_decimal(quote.get('changesPercentage', 0)),
                volume=self._safe_int(quote.get('volume', 0)),
                avg_volume=self._safe_int(quote.get('avgVolume', 0)),
                market_cap=self._safe_decimal(quote.get('marketCap')),
                pe_ratio=self._safe_decimal(quote.get('pe')),
                timestamp=datetime.now(timezone.utc),
                provider=self.name
            )
        except Exception as e:
            self._log_error("get_quote", e)
            return None
    
    async def get_historical(
        self, 
        symbol: str, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        interval: str = "1d"
    ) -> List[HistoricalPrice]:
        """
        Get historical price data for a symbol
        
        Args:
            symbol: Stock symbol to get historical data for
            start_date: Start date for historical data (default: 1 year ago)
            end_date: End date for historical data (default: today)
            interval: Data interval (1min, 5min, 15min, 30min, 1hour, 4hour, 1day, 1week, 1month)
            
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
            
            # Validate date range
            if start_date > end_date:
                start_date, end_date = end_date, start_date  # Swap if dates are reversed
                
            # Limit date range to 15 years (FMP free tier limit)
            max_days = 365 * 15
            if (end_date - start_date).days > max_days:
                start_date = end_date - timedelta(days=max_days)
                logger.warning(f"Date range too large, limiting to {max_days} days")
            
            # Standardize interval and get appropriate endpoint
            interval = self._standardize_interval(interval)
            
            # Build API request URL based on interval
            if interval == "1day":
                # Daily data endpoint
                endpoint = f"historical-price-full/{symbol.upper()}"
                params = {
                    'from': start_date.strftime('%Y-%m-%d'),
                    'to': end_date.strftime('%Y-%m-%d'),
                    'serietype': 'line'  # Use 'line' for adjusted close prices
                }
            else:
                # Intraday data endpoint
                endpoint = f"historical-chart/{interval}/{symbol.upper()}"
                params = {
                    'from': start_date.strftime('%Y-%m-%d'),
                    'to': end_date.strftime('%Y-%m-%d')
                }
            
            # Make the API request
            data = await self._make_request(endpoint, params=params)
            
            # Handle empty or invalid response
            if not data or not isinstance(data, (list, dict)):
                return []
            
            # Extract historical data from response
            historical_data = data.get('historical', []) if isinstance(data, dict) else data
            
            # Process and validate each data point
            results = []
            for item in historical_data:
                try:
                    # Parse date with timezone awareness
                    date_str = item.get('date', '')
                    if not date_str:
                        continue
                        
                    # Handle different date formats
                    try:
                        if 'T' in date_str:
                            price_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                        else:
                            price_date = datetime.strptime(date_str, '%Y-%m-%d')
                            
                        # Ensure timezone awareness
                        if price_date.tzinfo is None:
                            price_date = price_date.replace(tzinfo=timezone.utc)
                        
                        # Create HistoricalPrice object
                        results.append(HistoricalPrice(
                            date=price_date,
                            open=self._safe_decimal(item.get('open')),
                            high=self._safe_decimal(item.get('high')),
                            low=self._safe_decimal(item.get('low')),
                            close=self._safe_decimal(item.get('close')),
                            adjusted_close=self._safe_decimal(item.get('adjClose')),
                            volume=self._safe_int(item.get('volume', 0)),
                            symbol=symbol.upper(),
                            source="FMP"
                        ))
                    except (ValueError, KeyError) as e:
                        self._log_error("Data Parsing", f"Error parsing historical data point: {e}")
                        continue
                        
                except Exception as e:
                    self._log_error("Data Processing", f"Unexpected error processing historical data: {e}")
                    continue
            
            # Sort by date ascending
            results.sort(key=lambda x: x.date)
            
            # Log successful data retrieval
            if results:
                logger.info(f"Retrieved {len(results)} historical data points for {symbol} "
                          f"from {start_date} to {end_date}")
            
            return results
            
        except Exception as e:
            self._log_error("Historical Data Error", f"Failed to fetch historical data for {symbol}: {str(e)}")
            return []
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """
        Get company information and profile
        
        Args:
            symbol: Stock symbol to get company info for
            
        Returns:
            CompanyInfo object if successful, None otherwise
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        try:
            # Get company profile
            profile_data = await self._make_request(f"profile/{symbol.upper()}")
            if not profile_data or not isinstance(profile_data, list) or not profile_data[0]:
                return None
                
            profile = profile_data[0]
            
            # Get additional company metrics
            metrics_data = await self._make_request(f"key-metrics-ttm/{symbol.upper()}?limit=1")
            metrics = metrics_data[0] if metrics_data and isinstance(metrics_data, list) else {}
            
            # Get company ratings
            rating_data = await self._make_request(f"rating/{symbol.upper()}")
            rating = rating_data[0] if rating_data and isinstance(rating_data, list) else {}
            
            return CompanyInfo(
                symbol=symbol.upper(),
                company_name=profile.get('companyName', ''),
                description=profile.get('description', ''),
                sector=profile.get('sector', ''),
                industry=profile.get('industry', ''),
                exchange=profile.get('exchange', ''),
                website=profile.get('website', ''),
                ceo=profile.get('ceo', ''),
                employees=profile.get('fullTimeEmployees', 0),
                country=profile.get('country', ''),
                state=profile.get('state', ''),
                city=profile.get('city', ''),
                zip_code=profile.get('zip', ''),
                phone=profile.get('phone', ''),
                address=profile.get('address', ''),
                market_cap=self._safe_decimal(profile.get('mktCap')),
                pe_ratio=self._safe_decimal(profile.get('pe')),
                beta=self._safe_decimal(profile.get('beta')),
                dividend_yield=self._safe_decimal(profile.get('lastDiv')),
                dividend_per_share=self._safe_decimal(metrics.get('dividendYieldTTM')),
                payout_ratio=self._safe_decimal(metrics.get('payoutRatioTTM')),
                revenue_per_share_ttm=self._safe_decimal(metrics.get('revenuePerShareTTM')),
                profit_margin=self._safe_decimal(metrics.get('netProfitMarginTTM')),
                roe=self._safe_decimal(metrics.get('roeTTM')),
                roa=self._safe_decimal(metrics.get('roaTTM')),
                recommendation_mean=self._safe_decimal(rating.get('ratingRecommendationMean')),
                recommendation_key=rating.get('ratingRecommendation', ''),
                updated_at=datetime.now(timezone.utc),
                provider=self.name
            )
            
        except Exception as e:
            self._log_error("Company Info Error", f"Failed to fetch company info for {symbol}: {str(e)}")
            return None
    
    async def get_fundamentals(
        self, 
        symbol: str, 
        period: str = "annual", 
        limit: int = 4
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get fundamental data (income statements, balance sheets, cash flow)
        
        Args:
            symbol: Stock symbol
            period: 'annual' or 'quarterly'
            limit: Number of periods to return
            
        Returns:
            Dictionary containing 'income', 'balance_sheet', 'cash_flow', and 'metrics' data
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return {}
            
        if period not in ["annual", "quarterly"]:
            period = "annual"
            
        try:
            # Fetch all fundamental data in parallel
            income_stmt, balance_sheet, cash_flow, metrics = await asyncio.gather(
                self._make_request(f"income-statement/{symbol.upper()}?period={period}&limit={limit}"),
                self._make_request(f"balance-sheet-statement/{symbol.upper()}?period={period}&limit={limit}"),
                self._make_request(f"cash-flow-statement/{symbol.upper()}?period={period}&limit={limit}"),
                self._make_request(f"key-metrics/{symbol.upper()}?period={period}&limit={limit}")
            )
            
            # Process and validate data
            return {
                'income': income_stmt if isinstance(income_stmt, list) else [],
                'balance_sheet': balance_sheet if isinstance(balance_sheet, list) else [],
                'cash_flow': cash_flow if isinstance(cash_flow, list) else [],
                'metrics': metrics if isinstance(metrics, list) else []
            }
            
        except Exception as e:
            self._log_error("Fundamentals Error", f"Failed to fetch fundamentals for {symbol}: {str(e)}")
            return {}
    
    async def get_earnings(
        self, 
        symbol: str,
        limit: int = 4,
        include_upcoming: bool = True
    ) -> Dict[str, Any]:
        """
        Get historical and upcoming earnings data
        
        Args:
            symbol: Stock symbol
            limit: Number of historical earnings to return
            include_upcoming: Whether to include upcoming earnings
            
        Returns:
            Dictionary with 'historical' and 'upcoming' earnings data
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return {'historical': [], 'upcoming': []}
            
        try:
            # Fetch historical earnings - Fixed endpoint
            historical = await self._make_request(
                f"historical/earning_calendar/{symbol.upper()}?limit={limit}"
            )
            
            # Fetch upcoming earnings if requested - Fixed endpoint
            upcoming = []
            if include_upcoming:
                # Get upcoming earnings for next 3 months
                end_date = date.today() + timedelta(days=90)
                start_date = date.today()
                upcoming_data = await self._make_request(
                    f"earning_calendar?from={start_date.strftime('%Y-%m-%d')}&to={end_date.strftime('%Y-%m-%d')}"
                )
                
                # Filter for the specific symbol
                if isinstance(upcoming_data, list):
                    upcoming = [
                        {
                            'date': datetime.strptime(er['date'], '%Y-%m-%d').date() if 'date' in er else None,
                            'fiscal_quarter': f"Q{er.get('quarter')} {er.get('year')}" if all(k in er for k in ['quarter', 'year']) else None,
                            'eps_estimate': self._safe_decimal(er.get('epsEstimated')),
                            'revenue_estimate': self._safe_decimal(er.get('revenueEstimated')),
                            'time': er.get('time')
                        }
                        for er in upcoming_data
                        if er.get('symbol', '').upper() == symbol.upper() and er.get('date')
                    ]
            
            # Process historical earnings
            processed_historical = []
            if isinstance(historical, list):
                for er in historical:
                    if not isinstance(er, dict):
                        continue
                    
                    processed_historical.append({
                        'date': datetime.strptime(er['date'], '%Y-%m-%d').date() if 'date' in er else None,
                        'fiscal_quarter': f"Q{er.get('quarter')} {er.get('year')}" 
                                        if all(k in er for k in ['quarter', 'year']) else None,
                        'eps': self._safe_decimal(er.get('eps')),
                        'eps_estimated': self._safe_decimal(er.get('epsEstimated')),
                        'eps_surprise': self._safe_decimal(er.get('epsSurprise')),
                        'eps_surprise_percentage': self._safe_decimal(er.get('epsSurprisePercentage')),
                        'revenue': self._safe_decimal(er.get('revenue')),
                        'revenue_estimated': self._safe_decimal(er.get('revenueEstimated')),
                        'revenue_surprise': self._safe_decimal(er.get('revenueSurprise')),
                        'revenue_surprise_percentage': self._safe_decimal(er.get('revenueSurprisePercentage')),
                        'filing_date': datetime.strptime(er['fiscalDateEnding'], '%Y-%m-%d').date() 
                                      if 'fiscalDateEnding' in er and er['fiscalDateEnding'] else None
                    })
            
            return {
                'historical': processed_historical,
                'upcoming': upcoming
            }
            
        except Exception as e:
            self._log_error("Earnings Error", f"Failed to fetch earnings for {symbol}: {str(e)}")
            return {'historical': [], 'upcoming': []}
    
    async def get_intraday(
        self, 
        symbol: str, 
        interval: str = "5min"
    ) -> Optional[List[HistoricalPrice]]:
        """
        Get intraday price data
        
        Args:
            symbol: Stock symbol
            interval: Data interval (1min, 5min, 15min, 30min, 1hour, 4hour)
            
        Returns:
            List of HistoricalPrice objects or None if failed
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
            
        # Map intervals to FMP format
        interval_map = {
            "1min": "1min",
            "5min": "5min",
            "15min": "15min",
            "30min": "30min",
            "1h": "1hour",
            "1hour": "1hour",
            "4h": "4hour",
            "4hour": "4hour"
        }
        
        fmp_interval = interval_map.get(interval.lower(), "5min")
        
        try:
            # Get intraday data
            endpoint = f"historical-chart/{fmp_interval}/{symbol.upper()}"
            data = await self._make_request(endpoint)
            
            if not data or not isinstance(data, list):
                return None
                
            # Process and validate data points
            results = []
            for item in data:
                try:
                    if not isinstance(item, dict):
                        continue
                        
                    # Parse timestamp
                    date_str = item.get('date')
                    if not date_str:
                        continue
                        
                    try:
                        if 'T' in date_str:
                            price_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                        else:
                            price_date = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
                            
                        # Ensure timezone awareness
                        if price_date.tzinfo is None:
                            price_date = price_date.replace(tzinfo=timezone.utc)
                            
                        results.append(HistoricalPrice(
                            date=price_date,
                            open=self._safe_decimal(item.get('open')),
                            high=self._safe_decimal(item.get('high')),
                            low=self._safe_decimal(item.get('low')),
                            close=self._safe_decimal(item.get('close')),
                            volume=self._safe_int(item.get('volume', 0)),
                            symbol=symbol.upper(),
                            source="FMP"
                        ))
                    except (ValueError, TypeError) as e:
                        self._log_error("Date Parsing", f"Error parsing date {date_str}: {e}")
                        continue
                        
                except Exception as e:
                    self._log_error("Data Processing", f"Error processing intraday data: {e}")
                    continue
            
            # Sort by date ascending
            results.sort(key=lambda x: x.date)
            
            if results:
                logger.info(f"Retrieved {len(results)} intraday data points for {symbol} "
                          f"with {fmp_interval} interval")
                
            return results
            
        except Exception as e:
            self._log_error("Intraday Error", f"Failed to fetch intraday data for {symbol}: {str(e)}")
            return None
    
    async def get_economic_events(
        self,
        countries: Optional[List[str]] = None,
        importance: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 50
    ) -> List[EconomicEvent]:
        """
        Get economic calendar events
        
        Args:
            countries: List of country codes to filter by (e.g., ['US', 'CN'])
            importance: Filter by importance level (1-3, where 3 is highest)
            start_date: Start date for events
            end_date: End date for events
            limit: Maximum number of events to return
            
        Returns:
            List of EconomicEvent objects
        """
        try:
            # Set default date range if not provided
            end_date = end_date or date.today()
            start_date = start_date or (end_date - timedelta(days=30))
            
            # Build query parameters
            params = {
                'from': start_date.strftime('%Y-%m-%d'),
                'to': end_date.strftime('%Y-%m-%d'),
                'limit': min(limit, 1000)  # FMP API limit
            }
            
            # Add optional filters
            if countries and isinstance(countries, list):
                params['country'] = ','.join([c.upper() for c in countries])
                
            if importance and 1 <= importance <= 3:
                params['importance'] = importance
            
            # Fetch economic calendar data
            data = await self._make_request("economic_calendar", params=params, version="v3")
            
            if not data or not isinstance(data, list):
                return []
            
            # Process and validate events
            events = []
            for item in data:
                try:
                    if not isinstance(item, dict):
                        continue
                        
                    # Parse event date
                    event_date = None
                    date_str = item.get('date')
                    if date_str:
                        try:
                            event_date = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
                            if event_date.tzinfo is None:
                                event_date = event_date.replace(tzinfo=timezone.utc)
                        except (ValueError, TypeError):
                            event_date = datetime.now(timezone.utc)
                    
                    # Create EconomicEvent object
                    event = EconomicEvent(
                        event=item.get('event', ''),
                        country=item.get('country', ''),
                        currency=item.get('currency', ''),
                        date=event_date or datetime.now(timezone.utc),
                        importance=item.get('importance', 0),
                        actual=self._safe_decimal(item.get('actual')),
                        previous=self._safe_decimal(item.get('previous')),
                        forecast=self._safe_decimal(item.get('forecast')),
                        unit=item.get('unit', ''),
                        source="FMP"
                    )
                    events.append(event)
                    
                    # Stop if we've reached the limit
                    if len(events) >= limit:
                        break
                        
                except Exception as e:
                    self._log_error("Event Processing", f"Error processing economic event: {e}")
                    continue
            
            # Sort by date descending (newest first)
            events.sort(key=lambda x: x.date, reverse=True)
            
            if events:
                logger.info(f"Retrieved {len(events)} economic events from {start_date} to {end_date}")
                
            return events
            
        except Exception as e:
            self._log_error("Economic Events Error", f"Failed to fetch economic events: {str(e)}")
            return []
        # End of FMPProvider class
    
    
    async def get_dividends(
        self, 
        symbol: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get historical dividends
        
        Args:
            symbol: Stock symbol
            limit: Maximum number of dividends to return
            
        Returns:
            List of dividend records
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        try:
            data = await self._make_request(f"historical-price-full/stock_dividend/{symbol.upper()}")
            
            if not data or not isinstance(data, dict) or 'historical' not in data:
                return []
                
            dividends = data['historical']
            
            # Process and validate dividend records
            processed_dividends = []
            for div in dividends[:limit]:
                try:
                    if not isinstance(div, dict):
                        continue
                        
                    processed_dividends.append({
                        'date': datetime.strptime(div['date'], '%Y-%m-%d').date() if 'date' in div else None,
                        'declaration_date': datetime.strptime(div['declarationDate'], '%Y-%m-%d').date() 
                                         if 'declarationDate' in div and div['declarationDate'] else None,
                        'record_date': datetime.strptime(div['recordDate'], '%Y-%m-%d').date() 
                                     if 'recordDate' in div and div['recordDate'] else None,
                        'payment_date': datetime.strptime(div['paymentDate'], '%Y-%m-%d').date() 
                                     if 'paymentDate' in div and div['paymentDate'] else None,
                        'amount': self._safe_decimal(div.get('dividend')),
                        'adjusted_amount': self._safe_decimal(div.get('adjustedDividend')),
                        'label': div.get('label', ''),
                        'symbol': symbol.upper()
                    })
                    
                except Exception as e:
                    self._log_error("Dividend Processing", f"Error processing dividend record: {e}")
                    continue
            
            # Sort by date descending (newest first)
            processed_dividends.sort(key=lambda x: x['date'] if x['date'] else date.min, reverse=True)
            
            if processed_dividends:
                logger.info(f"Retrieved {len(processed_dividends)} dividend records for {symbol}")
                
            return processed_dividends
            
        except Exception as e:
            self._log_error("Dividends Error", f"Failed to fetch dividends for {symbol}: {str(e)}")
            return []




    async def get_news(
        self, 
        symbol: Optional[str] = None, 
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get stock news
        
        Args:
            symbol: Optional stock symbol to filter news
            limit: Maximum number of news items to return
            
        Returns:
            List of news articles
        """
        try:
            params = {'limit': min(limit, 50)}  # API limit
            
            if symbol and isinstance(symbol, str):
                params['tickers'] = symbol.upper()
            
            data = await self._make_request("stock_news", params=params)
            
            if not data or not isinstance(data, list):
                return []
            
            # Process and validate news items
            news_items = []
            for item in data[:limit]:
                try:
                    if not isinstance(item, dict):
                        continue
                        
                    # Parse published date
                    pub_date = None
                    if 'publishedDate' in item and item['publishedDate']:
                        try:
                            pub_date = datetime.strptime(item['publishedDate'], '%Y-%m-%dT%H:%M:%S.%f%z')
                        except (ValueError, TypeError):
                            pub_date = datetime.now(timezone.utc)
                    
                    news_items.append({
                        'title': item.get('title', ''),
                        'content': item.get('text', ''),
                        'url': item.get('url', ''),
                        'source': item.get('site', ''),
                        'published_date': pub_date or datetime.now(timezone.utc),
                        'image_url': item.get('image', ''),
                        'related_symbols': item.get('related', '').split(',') if 'related' in item else [],
                        'provider': self.name
                    })
                    
                except Exception as e:
                    self._log_error("News Processing", f"Error processing news item: {e}")
                    continue
            
            if news_items:
                logger.info(f"Retrieved {len(news_items)} news items for {symbol or 'all symbols'}")
                
            return news_items
            
        except Exception as e:
            self._log_error("News Error", f"Failed to fetch news: {str(e)}")
            return []


    async def get_earnings_calendar(self, from_date: str = None, to_date: str = None) -> Dict[str, Any]:
        """Get earnings calendar for specified date range
    
        Args:
            from_date: Start date in YYYY-MM-DD format (optional)
            to_date: End date in YYYY-MM-DD format (optional)
    
        Returns:
            Dict containing earnings calendar data
        """
        params = {}
        if from_date:
            params["from"] = from_date
        if to_date:
            params["to"] = to_date
    
        return await self._make_request("earning_calendar", params)

    async def get_earnings_transcript(self, symbol: str, year: int, quarter: int) -> Dict[str, Any]:
        """Get earnings call transcript for a specific company and quarter
    
        Args:
            symbol: Stock symbol (e.g., 'AAPL')
            year: Year of the earnings call
            quarter: Quarter number (1, 2, 3, or 4)
    
        Returns:
            Dict containing earnings transcript data
        """
        url = f"{self.base_url}/v3/earning_call_transcript/{symbol}"
        params = {
            "apikey": self.api_key,
            "year": year,
            "quarter": quarter
        }
    
        return await self._make_request(url, params)    

    async def get_economic_data(self, indicator: str = None, from_date: str = None, to_date: str = None) -> Dict[str, Any]:
        """Get economic calendar data for specified time period
    
        Args:
            indicator: Specific economic indicator name (optional)
            from_date: Start date in YYYY-MM-DD format (optional)
            to_date: End date in YYYY-MM-DD format (optional, max 3 months from from_date)
    
        Returns:
            Dict containing economic calendar data
    
        Note:
            Maximum time interval between from_date and to_date is 3 months
        """
        params = {}
        if from_date:
            params["from"] = from_date
        if to_date:
            params["to"] = to_date
        if indicator:
            params["name"] = indicator
    
        return await self._make_request("economic_calendar", params)
    
    async def get_earnings_surprises(
        self, 
        symbol: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get earnings surprises for a symbol
        
        Args:
            symbol: Stock symbol
            limit: Number of earnings surprises to return
            
        Returns:
            List of earnings surprise records
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        try:
            data = await self._make_request(f"earnings-surprises/{symbol.upper()}?limit={limit}")
            
            if not data or not isinstance(data, list):
                return []
                
            # Process and validate earnings surprises
            surprises = []
            for item in data:
                try:
                    if not isinstance(item, dict):
                        continue
                        
                    surprises.append({
                        'date': datetime.strptime(item['date'], '%Y-%m-%d').date() if 'date' in item else None,
                        'symbol': item.get('symbol', symbol.upper()),
                        'actual_earnings_per_share': self._safe_decimal(item.get('actualEarningsPerShare')),
                        'estimated_earnings_per_share': self._safe_decimal(item.get('estimatedEarningsPerShare')),
                        'earnings_surprise': self._safe_decimal(item.get('earningsSurprise')),
                        'earnings_surprise_percentage': self._safe_decimal(item.get('earningsSurprisePercentage')),
                    })
                    
                except Exception as e:
                    self._log_error("Earnings Surprise Processing", f"Error processing earnings surprise: {e}")
                    continue
            
            if surprises:
                logger.info(f"Retrieved {len(surprises)} earnings surprises for {symbol}")
                
            return surprises
            
        except Exception as e:
            self._log_error("Earnings Surprises Error", f"Failed to fetch earnings surprises for {symbol}: {str(e)}")
            return []

    async def get_stock_splits(
        self, 
        symbol: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get historical stock splits for a symbol
        
        Args:
            symbol: Stock symbol
            limit: Maximum number of splits to return
            
        Returns:
            List of stock split records
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        try:
            data = await self._make_request(f"historical-price-full/stock_split/{symbol.upper()}")
            
            if not data or not isinstance(data, dict) or 'historical' not in data:
                return []
                
            splits = data['historical']
            
            # Process and validate split records
            processed_splits = []
            for split in splits[:limit]:
                try:
                    if not isinstance(split, dict):
                        continue
                        
                    processed_splits.append({
                        'date': datetime.strptime(split['date'], '%Y-%m-%d').date() if 'date' in split else None,
                        'label': split.get('label', ''),
                        'symbol': symbol.upper(),
                        'numerator': self._safe_decimal(split.get('numerator')),
                        'denominator': self._safe_decimal(split.get('denominator')),
                    })
                    
                except Exception as e:
                    self._log_error("Stock Split Processing", f"Error processing stock split record: {e}")
                    continue
            
            # Sort by date descending (newest first)
            processed_splits.sort(key=lambda x: x['date'] if x['date'] else date.min, reverse=True)
            
            if processed_splits:
                logger.info(f"Retrieved {len(processed_splits)} stock split records for {symbol}")
                
            return processed_splits
            
        except Exception as e:
            self._log_error("Stock Splits Error", f"Failed to fetch stock splits for {symbol}: {str(e)}")
            return []

    async def get_ipo_calendar(
        self, 
        from_date: Optional[str] = None, 
        to_date: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get IPO calendar for specified date range
        
        Args:
            from_date: Start date in YYYY-MM-DD format (optional)
            to_date: End date in YYYY-MM-DD format (optional)
            limit: Maximum number of IPOs to return
            
        Returns:
            List of IPO records
        """
        try:
            params = {}
            if from_date:
                params["from"] = from_date
            if to_date:
                params["to"] = to_date
                
            data = await self._make_request("ipo_calendar", params)
            
            if not data or not isinstance(data, list):
                return []
                
            # Process and validate IPO records
            ipos = []
            for item in data[:limit]:
                try:
                    if not isinstance(item, dict):
                        continue
                        
                    ipos.append({
                        'date': datetime.strptime(item['date'], '%Y-%m-%d').date() if 'date' in item else None,
                        'company': item.get('company', ''),
                        'symbol': item.get('symbol', ''),
                        'exchange': item.get('exchange', ''),
                        'actions': item.get('actions', ''),
                        'shares': self._safe_int(item.get('shares')),
                        'price_range_low': self._safe_decimal(item.get('priceRangeLow')),
                        'price_range_high': self._safe_decimal(item.get('priceRangeHigh')),
                        'market_cap': self._safe_decimal(item.get('marketCap')),
                    })
                    
                except Exception as e:
                    self._log_error("IPO Processing", f"Error processing IPO record: {e}")
                    continue
            
            if ipos:
                logger.info(f"Retrieved {len(ipos)} IPO records")
                
            return ipos
            
        except Exception as e:
            self._log_error("IPO Calendar Error", f"Failed to fetch IPO calendar: {str(e)}")
            return []

    async def get_analyst_estimates(
        self, 
        symbol: str,
        period: str = "annual",
        limit: int = 4
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get analyst estimates for a symbol
        
        Args:
            symbol: Stock symbol
            period: 'annual' or 'quarterly'
            limit: Number of periods to return
            
        Returns:
            Dictionary containing analyst estimates data
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return {'estimates': []}
            
        if period not in ["annual", "quarterly"]:
            period = "annual"
            
        try:
            data = await self._make_request(f"analyst-estimates/{symbol.upper()}?period={period}&limit={limit}")
            
            if not data or not isinstance(data, list):
                return {'estimates': []}
                
            # Process and validate analyst estimates
            estimates = []
            for item in data:
                try:
                    if not isinstance(item, dict):
                        continue
                        
                    estimates.append({
                        'date': datetime.strptime(item['date'], '%Y-%m-%d').date() if 'date' in item else None,
                        'symbol': item.get('symbol', symbol.upper()),
                        'estimated_revenue_low': self._safe_decimal(item.get('estimatedRevenueLow')),
                        'estimated_revenue_high': self._safe_decimal(item.get('estimatedRevenueHigh')),
                        'estimated_revenue_avg': self._safe_decimal(item.get('estimatedRevenueAvg')),
                        'estimated_ebitda_low': self._safe_decimal(item.get('estimatedEbitdaLow')),
                        'estimated_ebitda_high': self._safe_decimal(item.get('estimatedEbitdaHigh')),
                        'estimated_ebitda_avg': self._safe_decimal(item.get('estimatedEbitdaAvg')),
                        'estimated_ebit_low': self._safe_decimal(item.get('estimatedEbitLow')),
                        'estimated_ebit_high': self._safe_decimal(item.get('estimatedEbitHigh')),
                        'estimated_ebit_avg': self._safe_decimal(item.get('estimatedEbitAvg')),
                        'estimated_net_income_low': self._safe_decimal(item.get('estimatedNetIncomeLow')),
                        'estimated_net_income_high': self._safe_decimal(item.get('estimatedNetIncomeHigh')),
                        'estimated_net_income_avg': self._safe_decimal(item.get('estimatedNetIncomeAvg')),
                        'estimated_sga_expense_low': self._safe_decimal(item.get('estimatedSgaExpenseLow')),
                        'estimated_sga_expense_high': self._safe_decimal(item.get('estimatedSgaExpenseHigh')),
                        'estimated_sga_expense_avg': self._safe_decimal(item.get('estimatedSgaExpenseAvg')),
                        'estimated_eps_avg': self._safe_decimal(item.get('estimatedEpsAvg')),
                        'estimated_eps_high': self._safe_decimal(item.get('estimatedEpsHigh')),
                        'estimated_eps_low': self._safe_decimal(item.get('estimatedEpsLow')),
                        'number_analyst_estimated_revenue': self._safe_int(item.get('numberAnalystEstimatedRevenue')),
                        'number_analysts_estimated_eps': self._safe_int(item.get('numberAnalystsEstimatedEps')),
                    })
                    
                except Exception as e:
                    self._log_error("Analyst Estimates Processing", f"Error processing analyst estimate: {e}")
                    continue
            
            if estimates:
                logger.info(f"Retrieved {len(estimates)} analyst estimates for {symbol}")
                
            return {'estimates': estimates}
            
        except Exception as e:
            self._log_error("Analyst Estimates Error", f"Failed to fetch analyst estimates for {symbol}: {str(e)}")
            return {'estimates': []}
    
    
    async def get_economic_events(
        self,
        countries: Optional[List[str]] = None,
        importance: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 50
    ) -> List[EconomicEvent]:
        """
        Get economic calendar events
        
        Args:
            countries: List of country codes to filter by (e.g., ['US', 'CN'])
            importance: Filter by importance level (1-3, where 3 is highest)
            start_date: Start date for events
            end_date: End date for events
            limit: Maximum number of events to return
            
        Returns:
            List of EconomicEvent objects
        """
        try:
            # Set default date range if not provided
            end_date = end_date or date.today()
            start_date = start_date or (end_date - timedelta(days=30))
            
            # Build query parameters
            params = {
                'from': start_date.strftime('%Y-%m-%d'),
                'to': end_date.strftime('%Y-%m-%d'),
                'limit': min(limit, 1000)  # FMP API limit
            }
            
            # Add optional filters
            if countries and isinstance(countries, list):
                params['country'] = ','.join([c.upper() for c in countries])
                
            if importance and 1 <= importance <= 3:
                params['importance'] = importance
            
            # Fetch economic calendar data
            data = await self._make_request("economic_calendar", params=params, version="v3")
            
            if not data or not isinstance(data, list):
                return []
            
            # Process and validate events
            events = []
            for item in data:
                try:
                    if not isinstance(item, dict):
                        continue
                        
                    # Parse event date
                    event_date = None
                    date_str = item.get('date')
                    if date_str:
                        try:
                            event_date = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
                            if event_date.tzinfo is None:
                                event_date = event_date.replace(tzinfo=timezone.utc)
                        except (ValueError, TypeError):
                            event_date = datetime.now(timezone.utc)
                    
                    # Create EconomicEvent object
                    event = EconomicEvent(
                        event=item.get('event', ''),
                        country=item.get('country', ''),
                        currency=item.get('currency', ''),
                        date=event_date or datetime.now(timezone.utc),
                        importance=item.get('importance', 0),
                        actual=self._safe_decimal(item.get('actual')),
                        previous=self._safe_decimal(item.get('previous')),
                        forecast=self._safe_decimal(item.get('forecast')),
                        unit=item.get('unit', ''),
                        source="FMP"
                    )
                    events.append(event)
                    
                    # Stop if we've reached the limit
                    if len(events) >= limit:
                        break
                        
                except Exception as e:
                    self._log_error("Event Processing", f"Error processing economic event: {e}")
                    continue
            
            # Sort by date descending (newest first)
            events.sort(key=lambda x: x.date, reverse=True)
            
            if events:
                logger.info(f"Retrieved {len(events)} economic events from {start_date} to {end_date}")
                
            return events
            
        except Exception as e:
            self._log_error("Economic Events Error", f"Failed to fetch economic events: {str(e)}")
            return []
    