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
        # Remove version from URL construction since base_url already includes v3
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
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
                        retry_after = int(response.headers.get('X-RateLimit-Reset', 60))
                        logger.warning(f"Rate limited. Retry after {retry_after} seconds")
                        raise Exception(f"Rate limit exceeded. Retry after {retry_after} seconds")
                    
                    else:
                        error_text = await response.text()
                        
                        # Check for subscription/legacy endpoint errors - fail immediately
                        if any(keyword in error_text.lower() for keyword in [
                            'legacy endpoint', 'subscription', 'upgrade', 'premium', 
                            'no longer supported', 'contact us', 'pricing'
                        ]):
                            raise Exception(f"Subscription required: {error_text}")
                        
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
            # Get company profile using current API endpoint
            profile_data = await self._make_request(f"profile/{symbol.upper()}")
            if not profile_data or not isinstance(profile_data, list) or not profile_data[0]:
                return None
                
            profile = profile_data[0]
            
            # Get additional company metrics using current API endpoint
            metrics_data = await self._make_request(f"key-metrics-ttm/{symbol.upper()}?limit=1")
            metrics = metrics_data[0] if metrics_data and isinstance(metrics_data, list) else {}
            
            # Get company ratings using current API endpoint
            rating_data = await self._make_request(f"rating/{symbol.upper()}")
            rating = rating_data[0] if rating_data and isinstance(rating_data, list) else {}
            
            return CompanyInfo(
                symbol=symbol.upper(),
                name=profile.get('companyName', ''),
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
                pb_ratio=self._safe_decimal(metrics.get('pbRatioTTM')),
                beta=self._safe_decimal(profile.get('beta')),
                dividend_yield=self._safe_decimal(profile.get('lastDiv')),
                dividend_per_share=self._safe_decimal(metrics.get('dividendYieldTTM')),
                payout_ratio=self._safe_decimal(metrics.get('payoutRatioTTM')),
                revenue_per_share_ttm=self._safe_decimal(metrics.get('revenuePerShareTTM')),
                revenue=self._safe_decimal(metrics.get('revenueTTM')),
                net_income=self._safe_decimal(metrics.get('netIncomeTTM')),
                profit_margin=self._safe_decimal(metrics.get('netProfitMarginTTM')),
                roe=self._safe_decimal(metrics.get('roeTTM')),
                roa=self._safe_decimal(metrics.get('roaTTM')),
                ipo_date=profile.get('ipoDate'),
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
            # Fetch historical earnings
            historical = await self._make_request(
                f"historical/earning_calendar/{symbol.upper()}?limit={limit}"
            )
            
            # Fetch upcoming earnings if requested
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
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Get options chain data for a symbol.
        Note: FMP free tier has limited options data access.
        
        Args:
            symbol: Stock symbol
            expiration: Optional expiration date filter
            
        Returns:
            List of options contracts
        """
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []
            
        try:
            # FMP options endpoint (may require premium subscription)
            endpoint = f"options/{symbol.upper()}"
            params = {}
            
            if expiration:
                params['expiration'] = expiration.strftime('%Y-%m-%d')
            
            data = await self._make_request(endpoint, params=params)
            
            if not data or not isinstance(data, list):
                logger.warning(f"No options data available for {symbol} (may require FMP premium)")
                return []
            
            # Process options data
            options = []
            for option in data:
                if not isinstance(option, dict):
                    continue
                    
                try:
                    options.append({
                        'symbol': option.get('symbol', ''),
                        'strike': self._safe_decimal(option.get('strike')),
                        'expiration': option.get('expiration'),
                        'option_type': option.get('type', '').lower(),
                        'bid': self._safe_decimal(option.get('bid')),
                        'ask': self._safe_decimal(option.get('ask')),
                        'last_price': self._safe_decimal(option.get('lastPrice')),
                        'volume': self._safe_int(option.get('volume')),
                        'open_interest': self._safe_int(option.get('openInterest')),
                        'implied_volatility': self._safe_decimal(option.get('impliedVolatility')),
                        'delta': self._safe_decimal(option.get('delta')),
                        'gamma': self._safe_decimal(option.get('gamma')),
                        'theta': self._safe_decimal(option.get('theta')),
                        'vega': self._safe_decimal(option.get('vega')),
                        'rho': self._safe_decimal(option.get('rho')),
                        'provider': self.name
                    })
                except Exception as e:
                    self._log_error("Option Processing", f"Error processing option: {e}")
                    continue
            
            return options
            
        except Exception as e:
            self._log_error("Options Chain Error", f"Failed to fetch options chain for {symbol}: {str(e)}")
            return []

    async def get_earnings_calendar(
        self,
        symbol: Optional[str] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """Get earnings calendar data"""
        try:
            params = {}
            if symbol:
                params['symbol'] = symbol
            if from_date:
                params['from'] = from_date.strftime('%Y-%m-%d')
            if to_date:
                params['to'] = to_date.strftime('%Y-%m-%d')
            
            response = await self._make_request('earning_calendar', params)
            return response if response else []
            
        except Exception as e:
            self._log_error("Earnings Calendar Error", f"Failed to fetch earnings calendar: {str(e)}")
            return []

    async def get_earnings_transcript(
        self,
        symbol: str,
        year: int,
        quarter: int
    ) -> Optional[Dict[str, Any]]:
        """Get earnings call transcript"""
        try:
            params = {
                'symbol': symbol,
                'year': year,
                'quarter': quarter
            }
            
            response = await self._make_request('earning_call_transcript', params)
            return response[0] if response else None
            
        except Exception as e:
            self._log_error("Earnings Transcript Error", f"Failed to fetch transcript for {symbol} Q{quarter} {year}: {str(e)}")
            return None

    async def get_economic_events(
        self,
        countries: Optional[List[str]] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """Get economic events/calendar"""
        try:
            params = {}
            if countries:
                params['country'] = ','.join(countries)
            if from_date:
                params['from'] = from_date.strftime('%Y-%m-%d')
            if to_date:
                params['to'] = to_date.strftime('%Y-%m-%d')
            
            response = await self._make_request('economic_calendar', params)
            return response if response else []
            
        except Exception as e:
            self._log_error("Economic Events Error", f"Failed to fetch economic events: {str(e)}")
            return []
