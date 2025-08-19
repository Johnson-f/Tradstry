"""Base classes and enums for market data providers"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Union
from enum import Enum
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, Field
import logging

logger = logging.getLogger(__name__)


class MarketDataType(Enum):
    """Types of market data available"""
    QUOTE = "quote"
    HISTORICAL = "historical"
    INTRADAY = "intraday"
    OPTIONS = "options"
    OPTIONS_CHAIN = "options_chain"
    FUNDAMENTALS = "fundamentals"
    EARNINGS = "earnings"
    DIVIDENDS = "dividends"
    NEWS = "news"
    COMPANY_INFO = "company_info"
    TECHNICAL_INDICATORS = "technical_indicators"
    ECONOMIC_DATA = "economic_data"

class Interval(Enum):
    """Time intervals for historical and intraday data"""
    MIN_1 = "1min"
    MIN_5 = "5min"
    MIN_15 = "15min"
    MIN_30 = "30min"
    HOUR_1 = "1h"
    HOUR_4 = "4h"
    DAILY = "1d"
    WEEKLY = "1w"
    MONTHLY = "1m"

class StockQuote(BaseModel):
    """Standard stock quote data model"""
    symbol: str
    price: Decimal
    change: Decimal
    change_percent: Decimal
    volume: int
    open: Optional[Decimal] = None
    high: Optional[Decimal] = None
    low: Optional[Decimal] = None
    previous_close: Optional[Decimal] = None
    timestamp: datetime
    provider: str

    class Config:
        json_encoders = {
            Decimal: lambda v: float(v),
            datetime: lambda v: v.isoformat()
        }


class HistoricalPrice(BaseModel):
    """Historical price data model"""
    symbol: str
    date: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    adjusted_close: Optional[Decimal] = None
    dividend: Optional[Decimal] = None
    split: Optional[Decimal] = None
    provider: str

    class Config:
        json_encoders = {
            Decimal: lambda v: float(v),
            date: lambda v: v.isoformat()
        }


class OptionQuote(BaseModel):
    """Option quote data model"""
    symbol: str
    underlying_symbol: str
    strike: Decimal
    expiration: date
    option_type: str  # 'call' or 'put'
    bid: Optional[Decimal] = None
    ask: Optional[Decimal] = None
    last_price: Optional[Decimal] = None
    volume: Optional[int] = None
    open_interest: Optional[int] = None
    implied_volatility: Optional[Decimal] = None
    delta: Optional[Decimal] = None
    gamma: Optional[Decimal] = None
    theta: Optional[Decimal] = None
    vega: Optional[Decimal] = None
    timestamp: datetime
    provider: str

    class Config:
        json_encoders = {
            Decimal: lambda v: float(v),
            date: lambda v: v.isoformat(),
            datetime: lambda v: v.isoformat()
        }


class CompanyInfo(BaseModel):
    """Company information data model"""
    symbol: str
    name: str
    company_name: str
    exchange: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    market_cap: Optional[int] = None
    employees: Optional[int] = None
    description: Optional[str] = None
    website: Optional[str] = None
    ceo: Optional[str] = None
    headquarters: Optional[str] = None
    founded: Optional[str] = None
    provider: str

    class Config:
        json_encoders = {
            Decimal: lambda v: float(v)
        }


class EconomicEvent(BaseModel):
    """Economic event data model"""
    event_id: str
    country: str
    event_name: str
    event_period: str
    actual: Optional[Union[Decimal, str]] = None
    previous: Optional[Union[Decimal, str]] = None
    forecast: Optional[Union[Decimal, str]] = None
    unit: Optional[str] = None
    importance: int = Field(ge=1, le=3)  # 1=Low, 2=Medium, 3=High
    timestamp: datetime
    last_update: Optional[datetime] = None
    description: Optional[str] = None
    url: Optional[str] = None
    provider: str

    class Config:
        json_encoders = {
            Decimal: lambda v: float(v) if v is not None else None,
            datetime: lambda v: v.isoformat(),
            date: lambda v: v.isoformat()
        }


class EarningsCalendar(BaseModel):
    """Earnings calendar data model"""
    symbol: str
    date: date
    time: Optional[str] = None  # 'amc' (after market close), 'bmo' (before market open), 'dmh' (during market hours)
    eps: Optional[Decimal] = None
    eps_estimated: Optional[Decimal] = None
    revenue: Optional[Decimal] = None
    revenue_estimated: Optional[Decimal] = None
    fiscal_date_ending: Optional[date] = None
    fiscal_year: Optional[int] = None
    fiscal_quarter: Optional[int] = None
    provider: str

    class Config:
        json_encoders = {
            Decimal: lambda v: float(v) if v is not None else None,
            date: lambda v: v.isoformat()
        }


class EarningsCallTranscript(BaseModel):
    """Earnings call transcript data model"""
    symbol: str
    date: date
    quarter: str  # e.g., "Q1 2023"
    year: int
    transcript: str
    participants: List[Dict[str, str]] = []  # List of participants with name and role
    provider: str

    class Config:
        json_encoders = {
            date: lambda v: v.isoformat()
        }


class MarketDataProvider(ABC):
    """Abstract base class for market data providers"""

    def __init__(self, api_key: str, name: str):
        self.api_key = api_key
        self.name = name
        self.base_url = ""
        self.rate_limit_per_minute = 60
        self.last_request_time = None

    @abstractmethod
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """Get current quote for a symbol"""
        pass

    @abstractmethod
    async def get_historical(
        self,
        symbol: str,
        start_date: date,
        end_date: date,
        interval: str = "1d"
    ) -> Optional[List[HistoricalPrice]]:
        """Get historical prices for a symbol"""
        pass

    @abstractmethod
    async def get_options_chain(
        self,
        symbol: str,
        expiration: Optional[date] = None
    ) -> Optional[List[OptionQuote]]:
        """Get options chain for a symbol"""
        pass

    @abstractmethod
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get company information"""
        pass

    async def get_intraday(
        self,
        symbol: str,
        interval: str = "5min"
    ) -> Optional[List[HistoricalPrice]]:
        """Get intraday prices for a symbol"""
        return None

    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental data for a symbol"""
        return None

    async def get_earnings(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get earnings data for a symbol"""
        return None

    async def get_dividends(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get dividend data for a symbol"""
        return None

    @abstractmethod
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
            countries: List of country codes (e.g., ['US', 'EU', 'GB'])
            importance: Filter by importance (1=Low, 2=Medium, 3=High)
            start_date: Start date for events
            end_date: End date for events
            limit: Maximum number of events to return

        Returns:
            List of EconomicEvent objects
        """
        pass

    @abstractmethod
    async def get_news(
        self,
        symbol: Optional[str] = None,
        limit: int = 10
    ) -> Optional[List[Dict[str, Any]]]:
        """Get news for a symbol or general market"""
        pass

    async def get_technical_indicators(
        self,
        symbol: str,
        indicator: str,
        interval: str = "daily"
    ) -> Optional[Dict[str, Any]]:
        """Get technical indicators for a symbol"""
        return None

    @abstractmethod
    async def get_economic_data(
        self,
        indicator: str
    ) -> Any:
        """Get economic data"""
        pass

    @abstractmethod
    async def get_earnings_calendar(
        self,
        symbol: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 10
    ) -> List[EarningsCalendar]:
        """
        Get earnings calendar data

        Args:
            symbol: Stock symbol to filter by
            start_date: Start date for the calendar
            end_date: End date for the calendar
            limit: Maximum number of results to return

        Returns:
            List of EarningsCalendar objects
        """
        pass

    @abstractmethod
    async def get_earnings_transcript(
        self,
        symbol: str,
        year: int,
        quarter: int
    ) -> Optional[EarningsCallTranscript]:
        """
        Get earnings call transcript for a specific quarter

        Args:
            symbol: Stock symbol
            year: Fiscal year
            quarter: Fiscal quarter (1-4)

        Returns:
            EarningsCallTranscript if found, None otherwise
        """
        pass

    def _standardize_interval(self, interval: str) -> str:
        """Standardize interval format across providers"""
        interval_map = {
            "1min": "1min",
            "5min": "5min",
            "15min": "15min",
            "30min": "30min",
            "60min": "60min",
            "1h": "60min",
            "1d": "daily",
            "daily": "daily",
            "1w": "weekly",
            "weekly": "weekly",
            "1m": "monthly",
            "monthly": "monthly"
        }
        return interval_map.get(interval.lower(), interval)

    def _log_error(self, method: str, error: Exception):
        """Log errors with provider context"""
        logger.error(f"{self.name} - {method}: {str(error)}")

    def _log_info(self, message: str):
        """Log info with provider context"""
        logger.info(f"{self.name}: {message}")
