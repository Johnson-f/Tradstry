"""Market Data Brain - Central Orchestrator with automatic provider fallback"""

import asyncio
import logging
from typing import Dict, List, Optional, Any, Union, Type
from datetime import datetime, date, timedelta
from decimal import Decimal
from enum import Enum

from .base import (
    MarketDataProvider,
    MarketDataType,
    StockQuote,
    HistoricalPrice,
    OptionQuote,
    CompanyInfo,
    EconomicEvent,
    EarningsCalendar,
    EarningsCallTranscript,
    DividendRecord,
    NewsArticle,
    EarningsSurprise,
    StockSplit,
    IPOCalendar,
    AnalystEstimates,
    MarketHoliday,
    TechnicalIndicator,
    ForexQuote,
    CryptoQuote,
    MarketIndex,
    ExchangeInfo,
    MarketConditions,
    TiingoFundamentalData,
    Logo,
    ExchangeRate,
    CurrencyConversion,
    MarketMover,
    SimplePrice,
    EodPrice,
    SupportedSymbol,
    ForexPair,
    Cryptocurrency,
    MarketStatus
)
from .config import MarketDataConfig
from .providers import (
    AlphaVantageProvider,
    FinnhubProvider,
    PolygonProvider,
    TwelveDataProvider,
    FMPProvider,
    TiingoProvider,
    APINinjasProvider,
    FiscalAIProvider,
    FREDProvider,
    NewsAPIProvider,
    NewsAPIAIProvider,
    CurrentsAPIProvider,
    MediaStackProvider,
    GNewsProvider
)

logger = logging.getLogger(__name__)


class FetchResult:
    """Result container for fetch operations"""
    def __init__(self, data: Any, provider: str, success: bool = True, error: Optional[str] = None):
        self.data = data
        self.provider = provider
        self.success = success
        self.error = error
        self.timestamp = datetime.now()


class MarketDataBrain:
    """
    The Brain of the market data system - orchestrates data fetching across multiple providers with automatic fallback.

    This class manages multiple market data providers and automatically falls back
    to alternative providers when one fails or doesn't have the requested data.
    """

    def __init__(self, config: Optional[MarketDataConfig] = None):
        """
        Initialize the Brain with configuration.

        Args:
            config: MarketDataConfig object or None (will use env vars)
        """
        self.config = config or MarketDataConfig.from_env()
        self.providers: Dict[str, MarketDataProvider] = {}
        self.rate_limited_providers: Dict[str, datetime] = {}  # Track rate-limited providers
        self._initialize_providers()
        self.cache: Dict[str, FetchResult] = {}
        self.cache_ttl = self.config.cache_ttl_seconds

    async def initialize(self):
        """Initialize the brain (for compatibility with test scripts)"""
        # Brain is already initialized in __init__, this is just for compatibility
        pass

    async def close(self):
        """Close all provider connections"""
        for provider in self.providers.values():
            if hasattr(provider, 'close'):
                try:
                    await provider.close()
                except Exception as e:
                    logger.warning(f"Error closing provider {provider.name}: {e}")

    def _is_provider_rate_limited(self, provider_name: str) -> bool:
        """Check if a provider is currently rate limited"""
        if provider_name in self.rate_limited_providers:
            rate_limit_time = self.rate_limited_providers[provider_name]
            # Re-enable provider after 1 hour
            if (datetime.now() - rate_limit_time).total_seconds() > 3600:
                del self.rate_limited_providers[provider_name]
                logger.info(f"Brain re-enabled rate-limited provider: {provider_name}")
                return False
            return True
        return False

    def _mark_provider_rate_limited(self, provider_name: str):
        """Mark a provider as rate limited"""
        self.rate_limited_providers[provider_name] = datetime.now()
        logger.warning(f"Brain marked provider as rate limited: {provider_name}")

    def _initialize_providers(self):
        """Initialize all enabled providers"""
        provider_classes = {
            'alpha_vantage': AlphaVantageProvider,
            'finnhub': FinnhubProvider,
            'polygon': PolygonProvider,
            'twelve_data': TwelveDataProvider,
            'fmp': FMPProvider,
            'tiingo': TiingoProvider,
            'api_ninjas': APINinjasProvider,
            'fiscal': FiscalAIProvider,
            'fred': FREDProvider,
            'newsapi': NewsAPIProvider,
            'newsapi_ai': NewsAPIAIProvider,
            'currents_api': CurrentsAPIProvider,
            'mediastack': MediaStackProvider,
            'gnews': GNewsProvider
        }

        for provider_name, provider_class in provider_classes.items():
            provider_config = getattr(self.config, provider_name)
            if provider_config.enabled and provider_config.api_key:
                try:
                    self.providers[provider_name] = provider_class(provider_config.api_key)
                    logger.info(f"Brain initialized {provider_name} provider")
                except Exception as e:
                    logger.error(f"Brain failed to initialize {provider_name}: {e}")

    def _get_cache_key(self, data_type: str, **kwargs) -> str:
        """Generate cache key for a request"""
        params = "_".join(f"{k}={v}" for k, v in sorted(kwargs.items()))
        return f"{data_type}_{params}"

    def _is_cache_valid(self, result: FetchResult) -> bool:
        """Check if cached result is still valid"""
        if not self.config.enable_caching:
            return False

        age = (datetime.now() - result.timestamp).total_seconds()
        return age < self.cache_ttl

    async def _try_provider(
        self,
        provider: MarketDataProvider,
        method_name: str,
        **kwargs
    ) -> Optional[Any]:
        """Try to fetch data from a single provider"""
        try:
            method = getattr(provider, method_name)
            result = await method(**kwargs)
            if result is not None:
                logger.info(f"Brain successfully fetched {method_name} from {provider.name}")
            return result
        except Exception as e:
            error_msg = str(e).lower()

            # Check for rate limit indicators
            if any(indicator in error_msg for indicator in [
                'rate limit', 'too many requests', '429', 'quota exceeded',
                'api key limit', 'daily limit exceeded', '25 requests per day'
            ]):
                self._mark_provider_rate_limited(provider.name.lower())
                logger.warning(f"Brain detected rate limit from {provider.name}: {e}")

            logger.error(f"Brain error fetching {method_name} from {provider.name}: {e}")
            return None

    async def _fetch_with_fallback(
        self,
        method_name: str,
        data_type: str,
        **kwargs
    ) -> FetchResult:
        """
        Fetch data with automatic provider fallback.

        Args:
            method_name: Name of the method to call on providers
            data_type: Type of data being fetched (for caching)
            **kwargs: Arguments to pass to the method

        Returns:
            FetchResult with data or error information
        """
        # Check cache first
        cache_key = self._get_cache_key(data_type, **kwargs)
        if cache_key in self.cache:
            cached_result = self.cache[cache_key]
            if self._is_cache_valid(cached_result):
                logger.info(f"Brain returning cached {data_type} data")
                return cached_result

        # Get enabled providers sorted by priority, excluding rate-limited ones
        enabled_providers = self.config.get_enabled_providers()
        available_providers = [
            provider for provider in enabled_providers
            if provider in self.providers and not self._is_provider_rate_limited(provider)
        ]

        if not available_providers:
            # If no providers available, try rate-limited ones as last resort
            rate_limited_available = [
                provider for provider in enabled_providers
                if provider in self.providers and self._is_provider_rate_limited(provider)
            ]

            if rate_limited_available:
                logger.warning("Brain using rate-limited providers as last resort")
                available_providers = rate_limited_available
            else:
                return FetchResult(
                    data=None,
                    provider="none",
                    success=False,
                    error="No providers available (all rate limited or disabled)"
                )

        logger.info(f"Brain trying providers in order: {available_providers}")

        # Try each available provider in priority order
        for provider_name in available_providers:
            provider = self.providers[provider_name]
            result = await self._try_provider(provider, method_name, **kwargs)

            if result is not None:
                fetch_result = FetchResult(
                    data=result,
                    provider=provider_name,
                    success=True
                )

                # Cache successful result
                if self.config.enable_caching:
                    self.cache[cache_key] = fetch_result

                return fetch_result

        # All providers failed
        rate_limited_count = len([p for p in enabled_providers if self._is_provider_rate_limited(p)])
        return FetchResult(
            data=None,
            provider="none",
            success=False,
            error=f"All providers failed to fetch {data_type}. {rate_limited_count} providers rate limited."
        )

    # Main public methods for each data type

    async def get_quote(self, symbol: str) -> FetchResult:
        """
        Get current quote for a symbol with automatic fallback.

        Args:
            symbol: Stock symbol

        Returns:
            FetchResult containing StockQuote or error
        """
        return await self._fetch_with_fallback(
            method_name="get_quote",
            data_type="quote",
            symbol=symbol
        )

    async def get_historical(
        self,
        symbol: str,
        start_date: date,
        end_date: date,
        interval: str = "1d"
    ) -> FetchResult:
        """
        Get historical prices with automatic fallback.

        Args:
            symbol: Stock symbol
            start_date: Start date for historical data
            end_date: End date for historical data
            interval: Time interval (1min, 5min, 1d, etc.)

        Returns:
            FetchResult containing List[HistoricalPrice] or error
        """
        return await self._fetch_with_fallback(
            method_name="get_historical",
            data_type="historical",
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            interval=interval
        )

    async def get_options_chain(
        self,
        symbol: str,
        expiration: Optional[date] = None
    ) -> FetchResult:
        """
        Get options chain with automatic fallback.

        Args:
            symbol: Stock symbol
            expiration: Optional expiration date filter

        Returns:
            FetchResult containing List[OptionQuote] or error
        """
        return await self._fetch_with_fallback(
            method_name="get_options_chain",
            data_type="options_chain",
            symbol=symbol,
            expiration=expiration
        )

    async def get_company_info(self, symbol: str) -> FetchResult:
        """
        Get company information with automatic fallback.

        Args:
            symbol: Stock symbol

        Returns:
            FetchResult containing CompanyInfo or error
        """
        return await self._fetch_with_fallback(
            method_name="get_company_info",
            data_type="company_info",
            symbol=symbol
        )

    async def get_fundamentals(self, symbol: str) -> FetchResult:
        """
        Get fundamental data with automatic fallback.

        Args:
            symbol: Stock symbol

        Returns:
            FetchResult containing fundamental metrics dict or error
        """
        return await self._fetch_with_fallback(
            method_name="get_fundamentals",
            data_type="fundamentals",
            symbol=symbol
        )

    async def get_earnings(self, symbol: str) -> FetchResult:
        """
        Get earnings data with automatic fallback.

        Args:
            symbol: Stock symbol

        Returns:
            FetchResult containing earnings data list or error
        """
        return await self._fetch_with_fallback(
            method_name="get_earnings",
            data_type="earnings",
            symbol=symbol
        )

    async def get_dividends(self, symbol: str) -> FetchResult:
        """
        Get dividend data with automatic fallback.

        Args:
            symbol: Stock symbol

        Returns:
            FetchResult containing dividend data list or error
        """
        return await self._fetch_with_fallback(
            method_name="get_dividends",
            data_type="dividends",
            symbol=symbol
        )

    async def get_news(
        self,
        symbol: Optional[str] = None,
        limit: int = 10,
        **kwargs
    ) -> FetchResult:
        """
        Get news for a symbol or general market

        Args:
            symbol: Optional stock symbol to filter news
            limit: Maximum number of news items to return
            **kwargs: Additional provider-specific arguments

        Returns:
            FetchResult containing list of news items
        """
        return await self._fetch_with_fallback(
            method_name="get_news",
            data_type="news",
            symbol=symbol,
            limit=limit,
            **kwargs
        )

    async def get_economic_events(
        self,
        countries: Optional[List[str]] = None,
        importance: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 50,
        **kwargs
    ) -> FetchResult:
        """
        Get economic calendar events

        Args:
            countries: List of country codes (e.g., ['US', 'EU', 'GB'])
            importance: Filter by importance (1=Low, 2=Medium, 3=High)
            start_date: Start date for events
            end_date: End date for events
            limit: Maximum number of events to return
            **kwargs: Additional provider-specific arguments

        Returns:
            FetchResult containing list of EconomicEvent objects
        """
        # Set default date range if not provided
        today = date.today()
        if not start_date:
            start_date = today
        if not end_date:
            end_date = today + timedelta(days=30)  # Default to next 30 days

        return await self._fetch_with_fallback(
            method_name="get_economic_events",
            data_type="economic_events",
            countries=countries,
            importance=importance,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            **kwargs
        )

    async def get_intraday(
        self,
        symbol: str,
        interval: str = "5min"
    ) -> FetchResult:
        """
        Get intraday prices with automatic fallback.

        Args:
            symbol: Stock symbol
            interval: Time interval (1min, 5min, 15min, etc.)

        Returns:
            FetchResult containing List[HistoricalPrice] or error
        """
        return await self._fetch_with_fallback(
            method_name="get_intraday",
            data_type="intraday",
            symbol=symbol,
            interval=interval
        )

    async def get_technical_indicators(
        self,
        symbol: str,
        indicator: str,
        interval: str = "daily"
    ) -> FetchResult:
        """
        Get technical indicators with automatic fallback.

        Args:
            symbol: Stock symbol
            indicator: Indicator name (sma, ema, macd, rsi, etc.)
            interval: Time interval

        Returns:
            FetchResult containing indicator data or error
        """
        return await self._fetch_with_fallback(
            method_name="get_technical_indicators",
            data_type="technical_indicators",
            symbol=symbol,
            indicator=indicator,
            interval=interval
        )

    async def get_economic_data(self, indicator: str) -> FetchResult:
        """
        Get economic data with automatic fallback.

        Args:
            indicator: Economic indicator name

        Returns:
            FetchResult containing economic data or error
        """
        return await self._fetch_with_fallback(
            method_name="get_economic_data",
            data_type="economic_data",
            indicator=indicator
        )

    async def get_earnings_calendar(
        self,
        symbol: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 10
    ) -> FetchResult:
        """
        Get earnings calendar data with automatic fallback.

        Args:
            symbol: Optional stock symbol to filter by
            start_date: Start date for the calendar
            end_date: End date for the calendar
            limit: Maximum number of results to return

        Returns:
            FetchResult containing List[EarningsCalendar] or error
        """
        # Set default date range if not provided
        today = date.today()
        if not start_date:
            start_date = today
        if not end_date:
            end_date = today + timedelta(days=30)  # Default to next 30 days

        return await self._fetch_with_fallback(
            method_name="get_earnings_calendar",
            data_type="earnings_calendar",
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            limit=limit
        )

    async def get_earnings_transcript(
        self,
        symbol: str,
        year: int,
        quarter: int
    ) -> FetchResult:
        """
        Get earnings call transcript with automatic fallback.

        Args:
            symbol: Stock symbol
            year: Fiscal year
            quarter: Fiscal quarter (1-4)

        Returns:
            FetchResult containing EarningsCallTranscript or error
        """
        return await self._fetch_with_fallback(
            method_name="get_earnings_transcript",
            data_type="earnings_transcript",
            symbol=symbol,
            year=year,
            quarter=quarter
        )

    async def get_market_status(self, **kwargs) -> FetchResult:
        """
        Get current market status with automatic fallback.

        Args:
            **kwargs: Additional provider-specific arguments

        Returns:
            FetchResult containing MarketStatus or error
        """
        return await self._fetch_with_fallback(
            method_name="get_market_status",
            data_type="market_status",
            **kwargs
        )

    # Batch operations

    async def get_multiple_quotes(self, symbols: List[str]) -> Dict[str, FetchResult]:
        """
        Get quotes for multiple symbols concurrently.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbols to FetchResults
        """
        tasks = {symbol: self.get_quote(symbol) for symbol in symbols}
        results = await asyncio.gather(*tasks.values())
        return dict(zip(tasks.keys(), results))

    async def get_multiple_historical(
        self,
        symbols: List[str],
        start_date: date,
        end_date: date,
        interval: str = "1d"
    ) -> Dict[str, FetchResult]:
        """
        Get historical data for multiple symbols concurrently.

        Args:
            symbols: List of stock symbols
            start_date: Start date for historical data
            end_date: End date for historical data
            interval: Time interval

        Returns:
            Dictionary mapping symbols to FetchResults
        """
        tasks = {
            symbol: self.get_historical(symbol, start_date, end_date, interval)
            for symbol in symbols
        }
        results = await asyncio.gather(*tasks.values())
        return dict(zip(tasks.keys(), results))

    # Utility methods

    def clear_cache(self):
        """Clear all cached data"""
        self.cache.clear()
        logger.info("Brain cache cleared")

    def get_available_providers(self) -> List[str]:
        """Get list of currently available providers"""
        return list(self.providers.keys())

    def get_provider_status(self) -> Dict[str, bool]:
        """Get status of all configured providers"""
        status = {}
        for name in ['alpha_vantage', 'finnhub', 'polygon', 'twelve_data', 'fmp', 'tiingo', 'api_ninjas', 'fiscal']:
            config = getattr(self.config, name)
            status[name] = config.enabled and config.api_key is not None
        return status
