"""Alpha Vantage API Provider Implementation - Corrected Version"""

import aiohttp
from typing import Dict, List, Optional, Any
from datetime import datetime, date
from decimal import Decimal
from ..base import (
    MarketDataProvider, 
    StockQuote, 
    HistoricalPrice, 
    OptionQuote, 
    CompanyInfo,
    EconomicEvent
)


class AlphaVantageProvider(MarketDataProvider):
    """Alpha Vantage API implementation"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "AlphaVantage")
        self.base_url = "https://www.alphavantage.co/query"
    
    def _standardize_interval(self, interval: str) -> str:
        """Convert interval to Alpha Vantage format"""
        interval_map = {
            "1min": "1min",
            "5min": "5min", 
            "15min": "15min",
            "30min": "30min",
            "60min": "60min",
            "daily": "daily",
            "weekly": "weekly",
            "monthly": "monthly"
        }
        return interval_map.get(interval.lower(), "daily")
    
    async def _make_request(self, params: Dict[str, Any]) -> Optional[Dict]:
        """Make API request to Alpha Vantage"""
        params['apikey'] = self.api_key
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.base_url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if "Error Message" in data or "Note" in data:
                            error_msg = data.get("Error Message", data.get("Note"))
                            self._log_error("API Request", Exception(error_msg))
                            return None
                        return data
                    else:
                        self._log_error("API Request", Exception(f"HTTP {response.status}"))
                        return None
        except Exception as e:
            self._log_error("_make_request", e)
            return None
    
    def _safe_decimal(self, value: str, default: Decimal = Decimal('0')) -> Decimal:
        """Safely convert string to Decimal"""
        try:
            if not value or value == "None":
                return default
            # Remove % if present
            clean_value = value.rstrip('%') if isinstance(value, str) else str(value)
            return Decimal(clean_value)
        except (ValueError, TypeError, AttributeError):
            return default
    
    def _safe_int(self, value: str, default: int = 0) -> int:
        """Safely convert string to int"""
        try:
            if not value or value == "None":
                return default
            return int(float(value))  # Handle cases like "1.0"
        except (ValueError, TypeError):
            return default
    
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """Get current quote for a symbol"""
        params = {
            'function': 'GLOBAL_QUOTE',
            'symbol': symbol
        }
        
        data = await self._make_request(params)
        if not data or 'Global Quote' not in data:
            return None
        
        try:
            quote_data = data['Global Quote']
            
            # Check if we have valid data
            if not quote_data.get('05. price'):
                return None
            
            return StockQuote(
                symbol=symbol,
                price=self._safe_decimal(quote_data.get('05. price', '0')),
                change=self._safe_decimal(quote_data.get('09. change', '0')),
                change_percent=self._safe_decimal(quote_data.get('10. change percent', '0')),
                volume=self._safe_int(quote_data.get('06. volume', '0')),
                open=self._safe_decimal(quote_data.get('02. open', '0')),
                high=self._safe_decimal(quote_data.get('03. high', '0')),
                low=self._safe_decimal(quote_data.get('04. low', '0')),
                previous_close=self._safe_decimal(quote_data.get('08. previous close', '0')),
                timestamp=datetime.now(),
                provider=self.name
            )
        except Exception as e:
            self._log_error("get_quote", e)
            return None
    
    async def get_historical(
        self, 
        symbol: str, 
        start_date: date, 
        end_date: date,
        interval: str = "1d"
    ) -> Optional[List[HistoricalPrice]]:
        """Get historical prices for a symbol"""
        params = {
            'function': 'TIME_SERIES_DAILY_ADJUSTED',
            'symbol': symbol,
            'outputsize': 'full'
        }
        
        data = await self._make_request(params)
        if not data or 'Time Series (Daily)' not in data:
            return None
        
        try:
            time_series = data['Time Series (Daily)']
            prices = []
            
            for date_str, values in time_series.items():
                try:
                    price_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                    
                    # Skip dates outside our range
                    if not (start_date <= price_date <= end_date):
                        continue
                    
                    prices.append(HistoricalPrice(
                        symbol=symbol,
                        date=price_date,
                        open=self._safe_decimal(values.get('1. open', '0')),
                        high=self._safe_decimal(values.get('2. high', '0')),
                        low=self._safe_decimal(values.get('3. low', '0')),
                        close=self._safe_decimal(values.get('4. close', '0')),
                        volume=self._safe_int(values.get('6. volume', '0')),
                        adjusted_close=self._safe_decimal(values.get('5. adjusted close', '0')),
                        dividend=self._safe_decimal(values.get('7. dividend amount', '0')),
                        split=self._safe_decimal(values.get('8. split coefficient', '1')),
                        provider=self.name
                    ))
                except Exception as e:
                    self._log_error(f"parse_historical_date_{date_str}", e)
                    continue
            
            return sorted(prices, key=lambda x: x.date)
        except Exception as e:
            self._log_error("get_historical", e)
            return None
    
    async def get_intraday(
        self, 
        symbol: str, 
        interval: str = "5min"
    ) -> Optional[List[HistoricalPrice]]:
        """Get intraday prices for a symbol"""
        # Map intervals to Alpha Vantage format
        interval_map = {
            "1min": "1min",
            "5min": "5min",
            "15min": "15min",
            "30min": "30min",
            "60min": "60min"
        }
        
        av_interval = interval_map.get(interval, "5min")
        
        params = {
            'function': 'TIME_SERIES_INTRADAY',
            'symbol': symbol,
            'interval': av_interval,
            'outputsize': 'full'
        }
        
        data = await self._make_request(params)
        if not data:
            return None
        
        try:
            time_series_key = f'Time Series ({av_interval})'
            if time_series_key not in data:
                return None
            
            time_series = data[time_series_key]
            prices = []
            
            for datetime_str, values in time_series.items():
                try:
                    price_datetime = datetime.strptime(datetime_str, '%Y-%m-%d %H:%M:%S')
                    
                    prices.append(HistoricalPrice(
                        symbol=symbol,
                        date=price_datetime.date(),
                        open=self._safe_decimal(values.get('1. open', '0')),
                        high=self._safe_decimal(values.get('2. high', '0')),
                        low=self._safe_decimal(values.get('3. low', '0')),
                        close=self._safe_decimal(values.get('4. close', '0')),
                        volume=self._safe_int(values.get('5. volume', '0')),
                        provider=self.name
                    ))
                except Exception as e:
                    self._log_error(f"parse_intraday_datetime_{datetime_str}", e)
                    continue
            
            return sorted(prices, key=lambda x: x.date, reverse=True)
        except Exception as e:
            self._log_error("get_intraday", e)
            return None
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> Optional[List[OptionQuote]]:
        """Get options chain data - Premium feature"""
        # For premium users, you can implement REALTIME_OPTIONS or HISTORICAL_OPTIONS
        self._log_info(f"Options chain requires Alpha Vantage premium plan for {symbol}")
        return None
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get company information"""
        params = {
            'function': 'OVERVIEW',
            'symbol': symbol
        }
        
        data = await self._make_request(params)
        if not data or 'Symbol' not in data:
            return None
        
        try:
            # Helper function to clean address
            def clean_address(*parts):
                cleaned = [part.strip() for part in parts if part and part.strip() and part.strip() != "None"]
                return ", ".join(cleaned) if cleaned else None
            
            return CompanyInfo(
                symbol=symbol,
                name=data.get('Name', ''),
                exchange=data.get('Exchange'),
                sector=data.get('Sector'),
                industry=data.get('Industry'),
                market_cap=self._safe_int(data.get('MarketCapitalization', '0')) or None,
                employees=self._safe_int(data.get('FullTimeEmployees', '0')) or None,
                description=data.get('Description'),
                website=data.get('OfficialSite'),
                ceo=data.get('CEO'),
                headquarters=clean_address(
                    data.get('Address', ''),
                    data.get('City', ''),
                    data.get('Country', '')
                ),
                founded=data.get('FiscalYearEnd'),
                # Add missing fields from Alpha Vantage OVERVIEW
                pe_ratio=self._safe_decimal(data.get('PERatio', '0')) or None,
                pb_ratio=self._safe_decimal(data.get('PriceToBookRatio', '0')) or None,
                dividend_yield=self._safe_decimal(data.get('DividendYield', '0')) or None,
                revenue=self._safe_int(data.get('RevenueTTM', '0')) or None,
                net_income=self._safe_int(data.get('NetIncomeTTM', '0')) or None,
                provider=self.name
            )
        except Exception as e:
            self._log_error("get_company_info", e)
            return None
    
    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental data"""
        params = {
            'function': 'OVERVIEW',
            'symbol': symbol
        }
        
        data = await self._make_request(params)
        if not data:
            return None
        
        # Extract key fundamental metrics with safe conversion
        fundamentals = {
            'symbol': symbol,
            'provider': self.name,
            'pe_ratio': self._safe_decimal(data.get('PERatio', '0')) or None,
            'peg_ratio': self._safe_decimal(data.get('PEGRatio', '0')) or None,
            'book_value': self._safe_decimal(data.get('BookValue', '0')) or None,
            'dividend_yield': self._safe_decimal(data.get('DividendYield', '0')) or None,
            'eps': self._safe_decimal(data.get('EPS', '0')) or None,
            'revenue_per_share': self._safe_decimal(data.get('RevenuePerShareTTM', '0')) or None,
            'profit_margin': self._safe_decimal(data.get('ProfitMargin', '0')) or None,
            'operating_margin': self._safe_decimal(data.get('OperatingMarginTTM', '0')) or None,
            'return_on_assets': self._safe_decimal(data.get('ReturnOnAssetsTTM', '0')) or None,
            'return_on_equity': self._safe_decimal(data.get('ReturnOnEquityTTM', '0')) or None,
            'revenue': self._safe_decimal(data.get('RevenueTTM', '0')) or None,
            'gross_profit': self._safe_decimal(data.get('GrossProfitTTM', '0')) or None,
            'ebitda': self._safe_decimal(data.get('EBITDA', '0')) or None,
            'beta': self._safe_decimal(data.get('Beta', '0')) or None,
            '52_week_high': self._safe_decimal(data.get('52WeekHigh', '0')) or None,
            '52_week_low': self._safe_decimal(data.get('52WeekLow', '0')) or None,
            '50_day_ma': self._safe_decimal(data.get('50DayMovingAverage', '0')) or None,
            '200_day_ma': self._safe_decimal(data.get('200DayMovingAverage', '0')) or None
        }
        
        return fundamentals
    
    async def get_economic_events(
        self,
        countries: Optional[List[str]] = None,
        importance: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 50
    ) -> List[EconomicEvent]:
        """
        Get economic data using individual economic indicators
        Note: Alpha Vantage doesn't have an ECONOMIC_CALENDAR endpoint
        """
        self._log_info("Alpha Vantage does not provide an economic calendar endpoint")
        self._log_info("Use individual economic indicators like REAL_GDP, INFLATION, UNEMPLOYMENT, etc.")
        return []
    
    async def get_economic_indicator(
        self, 
        indicator: str,
        interval: str = "monthly"
    ) -> Optional[Dict[str, Any]]:
        """
        Get individual economic indicators
        Available indicators: REAL_GDP, REAL_GDP_PER_CAPITA, TREASURY_YIELD, 
        FEDERAL_FUNDS_RATE, CPI, INFLATION, RETAIL_SALES, DURABLES, 
        UNEMPLOYMENT, NONFARM_PAYROLL, etc.
        """
        # Map common indicator names to Alpha Vantage functions
        indicator_map = {
            'gdp': 'REAL_GDP',
            'inflation': 'INFLATION',
            'unemployment': 'UNEMPLOYMENT',
            'fed_funds_rate': 'FEDERAL_FUNDS_RATE',
            'cpi': 'CPI',
            'treasury_yield': 'TREASURY_YIELD',
            'retail_sales': 'RETAIL_SALES',
            'nonfarm_payroll': 'NONFARM_PAYROLL'
        }
        
        function = indicator_map.get(indicator.lower(), indicator.upper())
        
        params = {
            'function': function,
            'interval': interval
        }
        
        data = await self._make_request(params)
        return data
        
    async def get_news(
        self, 
        symbol: Optional[str] = None, 
        limit: int = 10
    ) -> Optional[List[Dict[str, Any]]]:
        """Get news for a symbol or general market"""
        params = {
            'function': 'NEWS_SENTIMENT',
            'limit': min(limit, 1000)  # Alpha Vantage max is 1000
        }
        
        if symbol:
            params['tickers'] = symbol
            
        data = await self._make_request(params)
        if not data or 'feed' not in data:
            return None
            
        return data['feed'][:limit]
    
    async def get_earnings_calendar(self, symbol: str = None, horizon: str = "3month"):
        """Earnings calendar not available in Alpha Vantage"""
        self._log_info("Earnings calendar not available in Alpha Vantage API")
        return []

    async def get_earnings_transcript(self, symbol: str, year: str, quarter: str):
        """Get earnings call transcript"""
        params = {
            'function': 'EARNINGS_CALL_TRANSCRIPT',
            'symbol': symbol,
            'quarter': f"{year}Q{quarter}"
        }
        
        data = await self._make_request(params)
        return data if data else {}

    async def get_economic_data(self, function: str, **kwargs):
        """Generic method for economic data"""
        params = {
            'function': function.upper(),
            **kwargs
        }
        
        data = await self._make_request(params)
        return data if data else {}
    
    async def get_earnings(
        self, 
        symbol: str,
        horizon: str = 'quarterly',  # 'quarterly' or 'annual'
        include_upcoming: bool = True
    ) -> Dict[str, Any]:
        """
        Get basic earnings data from OVERVIEW function
        Note: Alpha Vantage doesn't have a dedicated EARNINGS endpoint
        """
        # Get basic earnings info from OVERVIEW
        overview_data = await self.get_fundamentals(symbol)
        if not overview_data:
            return {'historical': [], 'upcoming': []}
        
        result = {'historical': [], 'upcoming': []}
        
        # Create a basic earnings entry from overview data
        if overview_data.get('eps'):
            basic_earnings = {
                'date': None,  # OVERVIEW doesn't provide reporting dates
                'fiscal_date_ending': None,
                'reported_eps': overview_data.get('eps'),
                'estimated_eps': None,
                'surprise': None,
                'surprise_percentage': None,
                'period': 'TTM',  # Trailing twelve months
                'year': None
            }
            result['historical'].append(basic_earnings)
        
        self._log_info(f"Limited earnings data available for {symbol}. Consider using EARNINGS_CALL_TRANSCRIPT for detailed data.")
        return result
    
    async def get_technical_indicators(
        self, 
        symbol: str, 
        indicator: str,
        interval: str = "daily",
        time_period: int = 20,
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """Get technical indicators"""
        # Map indicator names to Alpha Vantage function names
        indicator_map = {
            'sma': 'SMA',
            'ema': 'EMA',
            'wma': 'WMA',
            'dema': 'DEMA',
            'tema': 'TEMA',
            'trima': 'TRIMA',
            'kama': 'KAMA',
            'mama': 'MAMA',
            'vwap': 'VWAP',
            'macd': 'MACD',
            'macdext': 'MACDEXT',
            'stoch': 'STOCH',
            'stochf': 'STOCHF',
            'rsi': 'RSI',
            'stochrsi': 'STOCHRSI',
            'willr': 'WILLR',
            'adx': 'ADX',
            'adxr': 'ADXR',
            'apo': 'APO',
            'ppo': 'PPO',
            'mom': 'MOM',
            'bop': 'BOP',
            'cci': 'CCI',
            'cmo': 'CMO',
            'roc': 'ROC',
            'rocr': 'ROCR',
            'aroon': 'AROON',
            'aroonosc': 'AROONOSC',
            'mfi': 'MFI',
            'trix': 'TRIX',
            'ultosc': 'ULTOSC',
            'dx': 'DX',
            'minus_di': 'MINUS_DI',
            'plus_di': 'PLUS_DI',
            'minus_dm': 'MINUS_DM',
            'plus_dm': 'PLUS_DM',
            'bbands': 'BBANDS',
            'midpoint': 'MIDPOINT',
            'midprice': 'MIDPRICE',
            'sar': 'SAR',
            'trange': 'TRANGE',
            'atr': 'ATR',
            'natr': 'NATR',
            'ad': 'AD',
            'adosc': 'ADOSC',
            'obv': 'OBV'
        }
        
        av_function = indicator_map.get(indicator.lower())
        if not av_function:
            self._log_error("get_technical_indicators", Exception(f"Unsupported indicator: {indicator}"))
            return None
        
        params = {
            'function': av_function,
            'symbol': symbol,
            'interval': self._standardize_interval(interval),
            'time_period': time_period,
            'series_type': kwargs.get('series_type', 'close')
        }
        
        # Add any additional parameters specific to certain indicators
        if indicator.lower() == 'macd':
            params.update({
                'fastperiod': kwargs.get('fastperiod', 12),
                'slowperiod': kwargs.get('slowperiod', 26),
                'signalperiod': kwargs.get('signalperiod', 9)
            })
        elif indicator.lower() == 'bbands':
            params.update({
                'nbdevup': kwargs.get('nbdevup', 2),
                'nbdevdn': kwargs.get('nbdevdn', 2),
                'matype': kwargs.get('matype', 0)
            })
        elif indicator.lower() == 'stoch':
            params.update({
                'fastkperiod': kwargs.get('fastkperiod', 5),
                'slowkperiod': kwargs.get('slowkperiod', 3),
                'slowdperiod': kwargs.get('slowdperiod', 3),
                'slowkmatype': kwargs.get('slowkmatype', 0),
                'slowdmatype': kwargs.get('slowdmatype', 0)
            })
        
        data = await self._make_request(params)
        return data
    
    async def get_top_gainers_losers(self) -> Optional[Dict[str, Any]]:
        """Get top gainers, losers, and most active tickers"""
        params = {
            'function': 'TOP_GAINERS_LOSERS'
        }
        
        data = await self._make_request(params)
        return data
    
    async def get_insider_transactions(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get insider transactions for a symbol"""
        params = {
            'function': 'INSIDER_TRANSACTIONS',
            'symbol': symbol
        }
        
        data = await self._make_request(params)
        return data