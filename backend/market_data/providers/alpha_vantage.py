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
        """Alpha Vantage doesn't provide options data in free tier"""
        self._log_info(f"Options chain not available for {symbol} on Alpha Vantage free tier")
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
        Get economic calendar events from Alpha Vantage
        Note: This functionality may not be available in all Alpha Vantage plans
        """
        params = {
            'function': 'ECONOMIC_CALENDAR'
        }
        
        data = await self._make_request(params)
        if not data or 'economic_calendar' not in data:
            self._log_info("Economic calendar not available or no data returned")
            return []
            
        events = data['economic_calendar']
        results = []
        
        for event in events:
            try:
                # Skip if no timestamp
                if 'time' not in event or not event['time']:
                    continue
                
                # Try multiple timestamp formats
                event_time = None
                for fmt in ['%Y-%m-%dT%H:%M:%S.%f%z', '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%d %H:%M:%S']:
                    try:
                        event_time = datetime.strptime(event['time'], fmt)
                        break
                    except ValueError:
                        continue
                
                if not event_time:
                    continue
                
                # Apply date filters
                if start_date and event_time.date() < start_date:
                    continue
                if end_date and event_time.date() > end_date:
                    continue
                    
                # Map importance
                importance_map = {
                    'low': 1, 'Low': 1,
                    'medium': 2, 'Medium': 2, 'med': 2,
                    'high': 3, 'High': 3
                }
                
                event_importance = importance_map.get(event.get('importance', 'low'), 1)
                
                # Apply importance filter
                if importance and event_importance != importance:
                    continue
                    
                # Apply country filter
                if countries and event.get('country') not in countries:
                    continue
                    
                economic_event = EconomicEvent(
                    event_id=event.get('event_id', f"{event.get('event', 'unknown')}_{event_time.isoformat()}"),
                    country=event.get('country', 'Unknown'),
                    event_name=event.get('event', 'Unknown Event'),
                    event_period=event.get('period', ''),
                    actual=event.get('actual'),
                    previous=event.get('previous'),
                    forecast=event.get('estimate'),
                    unit=event.get('unit', ''),
                    importance=event_importance,
                    timestamp=event_time,
                    last_update=datetime.now(),
                    description=event.get('comment', ''),
                    provider=self.name
                )
                
                results.append(economic_event)
                
                if len(results) >= limit:
                    break
                    
            except Exception as e:
                self._log_error("process_economic_event", e)
                continue
                
        return results
        
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
    
    async def get_earnings(
        self, 
        symbol: str,
        horizon: str = 'quarterly',  # 'quarterly' or 'annual'
        include_upcoming: bool = True
    ) -> Dict[str, Any]:
        """
        Get earnings data including historical and upcoming earnings
        
        Args:
            symbol: Stock symbol
            horizon: 'quarterly' or 'annual' earnings
            include_upcoming: Whether to include upcoming earnings if available
            
        Returns:
            Dictionary with 'historical' and 'upcoming' earnings data
        """
        params = {
            'function': 'EARNINGS',
            'symbol': symbol
        }
        
        data = await self._make_request(params)
        if not data:
            return {'historical': [], 'upcoming': []}
        
        result = {'historical': [], 'upcoming': []}
        
        # Process historical earnings
        historical_key = 'quarterlyEarnings' if horizon == 'quarterly' else 'annualEarnings'
        if historical_key in data:
            for earnings in data[historical_key]:
                try:
                    result['historical'].append({
                        'date': earnings.get('reportedDate'),
                        'fiscal_date_ending': earnings.get('fiscalDateEnding'),
                        'reported_eps': self._safe_decimal(earnings.get('reportedEPS')),
                        'estimated_eps': self._safe_decimal(earnings.get('estimatedEPS')),
                        'surprise': self._safe_decimal(earnings.get('surprise')),
                        'surprise_percentage': self._safe_decimal(earnings.get('surprisePercentage')),
                        'period': 'Q' + earnings.get('fiscalDateEnding', '')[-2:] if horizon == 'quarterly' else 'FY',
                        'year': int(earnings.get('fiscalDateEnding', '')[:4]) if earnings.get('fiscalDateEnding') else None
                    })
                except Exception as e:
                    self._log_error(f"process_historical_earnings_{symbol}", e)
                    continue
        
        # Process upcoming earnings if available and requested
        if include_upcoming and 'earnings' in data and 'earningsDate' in data['earnings']:
            try:
                upcoming_dates = data['earnings']['earningsDate']
                if isinstance(upcoming_dates, list):
                    for date_str in upcoming_dates:
                        result['upcoming'].append({
                            'date': date_str,
                            'fiscal_period': data['earnings'].get('fiscalPeriod'),
                            'fiscal_end_date': data['earnings'].get('fiscalEndDate'),
                            'estimate': self._safe_decimal(data['earnings'].get('estimate'))
                        })
            except Exception as e:
                self._log_error(f"process_upcoming_earnings_{symbol}", e)
        
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
            'macd': 'MACD',
            'rsi': 'RSI',
            'bbands': 'BBANDS',
            'stoch': 'STOCH',
            'adx': 'ADX',
            'cci': 'CCI',
            'obv': 'OBV',
            'ad': 'AD'
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
        
        data = await self._make_request(params)
        return data