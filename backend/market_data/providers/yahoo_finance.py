"""Yahoo Finance API Provider Implementation"""

import yfinance as yf
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, date, timedelta
from decimal import Decimal
import asyncio
import logging
from ..base import (
    MarketDataProvider, 
    StockQuote, 
    HistoricalPrice, 
    OptionQuote, 
    CompanyInfo,
    EarningsCalendar,
    EarningsCallTranscript,
    EconomicEvent
)

logger = logging.getLogger(__name__)


class YahooFinanceProvider(MarketDataProvider):
    """Yahoo Finance API implementation using yfinance library"""
    
    def __init__(self, api_key: str = ""):
        # Yahoo Finance doesn't require an API key for basic functionality
        super().__init__(api_key or "yahoo_finance", "YahooFinance")
        self.rate_limit_per_minute = 2000  # Yahoo Finance is quite generous
    
    def _safe_decimal(self, value: Any, default: Decimal = Decimal('0')) -> Decimal:
        """Safely convert value to Decimal"""
        try:
            if value is None or str(value).lower() in ['nan', 'none', '']:
                return default
            return Decimal(str(value))
        except (ValueError, TypeError, AttributeError):
            return default
    
    def _safe_int(self, value: Any, default: int = 0) -> int:
        """Safely convert value to int"""
        try:
            if value is None or str(value).lower() in ['nan', 'none', '']:
                return default
            return int(float(value))
        except (ValueError, TypeError):
            return default
    
    def _safe_float(self, value: Any, default: float = 0.0) -> float:
        """Safely convert value to float"""
        try:
            if value is None or str(value).lower() in ['nan', 'none', '']:
                return default
            return float(value)
        except (ValueError, TypeError):
            return default
    
    def _get_ticker_info(self, ticker) -> Optional[Dict[str, Any]]:
        """Safely get ticker info with error handling"""
        try:
            return ticker.info
        except Exception as e:
            logger.warning(f"Failed to get ticker info: {e}")
            return None
    
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """Get current quote for a symbol"""
        try:
            # Run yfinance in executor to avoid blocking
            ticker = await asyncio.get_event_loop().run_in_executor(
                None, yf.Ticker, symbol
            )
            
            # Get current info with error handling
            info = await asyncio.get_event_loop().run_in_executor(
                None, self._get_ticker_info, ticker
            )
            
            if not info or 'regularMarketPrice' not in info:
                return None
            
            # Calculate change and change percent
            current_price = self._safe_decimal(info.get('regularMarketPrice', 0))
            previous_close = self._safe_decimal(info.get('regularMarketPreviousClose', 0))
            change = current_price - previous_close if previous_close > 0 else Decimal('0')
            change_percent = (change / previous_close * 100) if previous_close > 0 else Decimal('0')
            
            return StockQuote(
                symbol=symbol.upper(),
                price=current_price,
                change=change,
                change_percent=change_percent,
                volume=self._safe_int(info.get('regularMarketVolume', 0)),
                open=self._safe_decimal(info.get('regularMarketOpen')),
                high=self._safe_decimal(info.get('regularMarketDayHigh')),
                low=self._safe_decimal(info.get('regularMarketDayLow')),
                previous_close=previous_close,
                market_cap=self._safe_int(info.get('marketCap')),
                pe_ratio=self._safe_decimal(info.get('trailingPE')),
                timestamp=datetime.now(),
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
        interval: str = "1d",
        **kwargs
    ) -> List[HistoricalPrice]:
        """Get historical prices for a symbol"""
        try:
            ticker = await asyncio.get_event_loop().run_in_executor(
                None, yf.Ticker, symbol
            )
            
            # Set default dates if not provided
            if end_date is None:
                end_date = date.today()
            if start_date is None:
                start_date = end_date - timedelta(days=365)  # Default to 1 year
            
            # Convert interval to yfinance format
            yf_interval = self._convert_interval(interval)
            
            # Get historical data
            hist = await asyncio.get_event_loop().run_in_executor(
                None, 
                lambda: ticker.history(
                    start=start_date, 
                    end=end_date, 
                    interval=yf_interval
                )
            )
            
            if hist.empty:
                return []
            
            historical_prices = []
            for date_idx, row in hist.iterrows():
                historical_prices.append(HistoricalPrice(
                    symbol=symbol.upper(),
                    date=date_idx.date(),
                    open=self._safe_decimal(row['Open']),
                    high=self._safe_decimal(row['High']),
                    low=self._safe_decimal(row['Low']),
                    close=self._safe_decimal(row['Close']),
                    volume=self._safe_int(row['Volume']),
                    adjusted_close=self._safe_decimal(row.get('Adj Close', row['Close'])),
                    provider=self.name
                ))
            
            return historical_prices
            
        except Exception as e:
            self._log_error("get_historical", e)
            return []
    
    def _convert_interval(self, interval: str) -> str:
        """Convert standard interval to yfinance format"""
        interval_map = {
            "1min": "1m",
            "5min": "5m",
            "15min": "15m",
            "30min": "30m",
            "60min": "1h",
            "1h": "1h",
            "1d": "1d",
            "daily": "1d",
            "1w": "1wk",
            "weekly": "1wk",
            "1m": "1mo",
            "monthly": "1mo"
        }
        return interval_map.get(interval.lower(), "1d")
    
    async def get_options_chain(
        self,
        symbol: str,
        expiration: Optional[Union[date, str]] = None,
        **kwargs
    ) -> List[OptionQuote]:
        """Get options chain for a symbol"""
        try:
            ticker = await asyncio.get_event_loop().run_in_executor(
                None, yf.Ticker, symbol
            )
            
            # Get options data
            options_data = await asyncio.get_event_loop().run_in_executor(
                None, lambda: ticker.options
            )
            
            if not options_data:
                return []
            
            # Use first available expiration if none specified
            target_expiration = expiration
            if target_expiration is None:
                target_expiration = options_data[0]
            elif isinstance(target_expiration, date):
                target_expiration = target_expiration.strftime('%Y-%m-%d')
            
            # Get option chain for the expiration
            option_chain = await asyncio.get_event_loop().run_in_executor(
                None, lambda: ticker.option_chain(target_expiration)
            )
            
            options = []
            timestamp = datetime.now()
            
            # Process calls
            if hasattr(option_chain, 'calls') and not option_chain.calls.empty:
                for _, row in option_chain.calls.iterrows():
                    options.append(OptionQuote(
                        symbol=row.get('contractSymbol', ''),
                        underlying_symbol=symbol.upper(),
                        strike=self._safe_decimal(row.get('strike')),
                        expiration=datetime.strptime(target_expiration, '%Y-%m-%d').date(),
                        option_type='call',
                        bid=self._safe_decimal(row.get('bid')),
                        ask=self._safe_decimal(row.get('ask')),
                        last_price=self._safe_decimal(row.get('lastPrice')),
                        volume=self._safe_int(row.get('volume')),
                        open_interest=self._safe_int(row.get('openInterest')),
                        implied_volatility=self._safe_decimal(row.get('impliedVolatility')),
                        timestamp=timestamp,
                        provider=self.name
                    ))
            
            # Process puts
            if hasattr(option_chain, 'puts') and not option_chain.puts.empty:
                for _, row in option_chain.puts.iterrows():
                    options.append(OptionQuote(
                        symbol=row.get('contractSymbol', ''),
                        underlying_symbol=symbol.upper(),
                        strike=self._safe_decimal(row.get('strike')),
                        expiration=datetime.strptime(target_expiration, '%Y-%m-%d').date(),
                        option_type='put',
                        bid=self._safe_decimal(row.get('bid')),
                        ask=self._safe_decimal(row.get('ask')),
                        last_price=self._safe_decimal(row.get('lastPrice')),
                        volume=self._safe_int(row.get('volume')),
                        open_interest=self._safe_int(row.get('openInterest')),
                        implied_volatility=self._safe_decimal(row.get('impliedVolatility')),
                        timestamp=timestamp,
                        provider=self.name
                    ))
            
            return options
            
        except Exception as e:
            self._log_error("get_options_chain", e)
            return []
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get company information"""
        try:
            ticker = await asyncio.get_event_loop().run_in_executor(
                None, yf.Ticker, symbol
            )
            
            info = await asyncio.get_event_loop().run_in_executor(
                None, lambda: ticker.info
            )
            
            if not info:
                return None
            
            return CompanyInfo(
                symbol=symbol.upper(),
                name=info.get('longName', info.get('shortName', '')),
                company_name=info.get('longName'),
                exchange=info.get('exchange'),
                sector=info.get('sector'),
                industry=info.get('industry'),
                market_cap=self._safe_int(info.get('marketCap')),
                employees=self._safe_int(info.get('fullTimeEmployees')),
                description=info.get('longBusinessSummary'),
                website=info.get('website'),
                ceo=info.get('companyOfficers', [{}])[0].get('name') if info.get('companyOfficers') else None,
                headquarters=f"{info.get('city', '')}, {info.get('state', '')}, {info.get('country', '')}".strip(', '),
                country=info.get('country'),
                state=info.get('state'),
                city=info.get('city'),
                phone=info.get('phone'),
                address=info.get('address1'),
                pe_ratio=self._safe_decimal(info.get('trailingPE')),
                pb_ratio=self._safe_decimal(info.get('priceToBook')),
                peg_ratio=self._safe_decimal(info.get('pegRatio')),
                eps=self._safe_decimal(info.get('trailingEps')),
                revenue=self._safe_decimal(info.get('totalRevenue')),
                beta=self._safe_decimal(info.get('beta')),
                dividend_yield=self._safe_decimal(info.get('dividendYield')),
                dividend_per_share=self._safe_decimal(info.get('dividendRate')),
                profit_margin=self._safe_decimal(info.get('profitMargins')),
                roe=self._safe_decimal(info.get('returnOnEquity')),
                roa=self._safe_decimal(info.get('returnOnAssets')),
                recommendation_mean=self._safe_decimal(info.get('recommendationMean')),
                recommendation_key=info.get('recommendationKey'),
                currency=info.get('currency'),
                provider=self.name
            )
            
        except Exception as e:
            self._log_error("get_company_info", e)
            return None
    
    async def get_intraday(
        self,
        symbol: str,
        interval: str = "5min",
        **kwargs
    ) -> Optional[List[HistoricalPrice]]:
        """Get intraday prices for a symbol"""
        try:
            # Use last 5 days for intraday data
            end_date = date.today()
            start_date = end_date - timedelta(days=5)
            
            return await self.get_historical(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
                interval=interval,
                **kwargs
            )
            
        except Exception as e:
            self._log_error("get_intraday", e)
            return None
    
    async def get_earnings_calendar(
        self,
        symbol: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 10
    ) -> List[EarningsCalendar]:
        """Get earnings calendar data"""
        try:
            if not symbol:
                return []  # Yahoo Finance requires a symbol for earnings data
            
            ticker = await asyncio.get_event_loop().run_in_executor(
                None, yf.Ticker, symbol
            )
            
            # Get earnings calendar
            calendar = await asyncio.get_event_loop().run_in_executor(
                None, lambda: ticker.calendar
            )
            
            if calendar is None or calendar.empty:
                return []
            
            earnings_list = []
            for _, row in calendar.iterrows():
                earnings_date = row.name.date() if hasattr(row.name, 'date') else None
                if earnings_date:
                    earnings_list.append(EarningsCalendar(
                        symbol=symbol.upper(),
                        date=earnings_date,
                        eps_estimated=self._safe_decimal(row.get('Earnings Estimate')),
                        revenue_estimated=self._safe_decimal(row.get('Revenue Estimate')),
                        provider=self.name
                    ))
            
            return earnings_list[:limit]
            
        except Exception as e:
            self._log_error("get_earnings_calendar", e)
            return []
    
    async def get_earnings_transcript(
        self,
        symbol: str,
        year: int,
        quarter: int
    ) -> Optional[EarningsCallTranscript]:
        """Get earnings call transcript for a specific quarter"""
        # Yahoo Finance doesn't provide earnings transcripts through yfinance
        # This would require web scraping or a different data source
        return None
    
    async def get_economic_events(
        self,
        countries: Optional[List[str]] = None,
        importance: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 50
    ) -> List[EconomicEvent]:
        """Get economic calendar events"""
        # Yahoo Finance doesn't provide economic calendar events through yfinance
        # This would require a different data source or web scraping
        return []
