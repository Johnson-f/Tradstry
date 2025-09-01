"""Data Formatting Service

This service formats raw market data from the Brain into database-ready dictionaries
for use with your PostgreSQL upsert functions.
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

from .brain import MarketDataBrain, FetchResult
from .base import StockQuote, HistoricalPrice, OptionQuote, CompanyInfo

logger = logging.getLogger(__name__)


class DataFormattingService:
    """
    Service to format Brain data into database-ready dictionaries.

    This service takes FetchResult objects from the Brain and converts them
    into the exact format expected by your PostgreSQL upsert functions.
    """

    def __init__(self, brain: Optional[MarketDataBrain] = None):
        """
        Initialize the formatting service.

        Args:
            brain: Optional MarketDataBrain instance. If None, create one.
        """
        self.brain = brain or MarketDataBrain()

    async def format_quote_data(self, symbol: str) -> Dict[str, Any]:
        """
        Fetch and format quote data for database storage.

        Args:
            symbol: Stock symbol to fetch

        Returns:
            Dictionary with formatted data ready for upsert_stock_quote()
        """
        result = await self.brain.get_quote(symbol)

        if not result.success:
            return {
                'success': False,
                'error': result.error,
                'provider': result.provider,
                'symbol': symbol
            }

        quote: StockQuote = result.data

        return {
            'success': True,
            'provider': result.provider,
            'symbol': quote.symbol,
            'data': {
                'symbol': quote.symbol,
                'price': float(quote.price),
                'change': float(quote.change),
                'change_percent': float(quote.change_percent),
                'volume': quote.volume,
                'open': float(quote.open) if quote.open else None,
                'high': float(quote.high) if quote.high else None,
                'low': float(quote.low) if quote.low else None,
                'previous_close': float(quote.previous_close) if quote.previous_close else None,
                'timestamp': quote.timestamp.isoformat(),
                'provider': quote.provider,
                'created_at': datetime.now().isoformat()
            }
        }

    async def format_historical_data(
        self,
        symbol: str,
        days_back: int = 30,
        interval: str = "1d"
    ) -> Dict[str, Any]:
        """
        Fetch and format historical data for database storage.

        Args:
            symbol: Stock symbol
            days_back: Number of days of historical data
            interval: Time interval

        Returns:
            Dictionary with formatted historical data ready for upsert_historical_price()
        """
        from datetime import date, timedelta

        end_date = date.today()
        start_date = end_date - timedelta(days=days_back)

        result = await self.brain.get_historical(symbol, start_date, end_date, interval)

        if not result.success:
            return {
                'success': False,
                'error': result.error,
                'provider': result.provider,
                'symbol': symbol
            }

        historical_data: List[HistoricalPrice] = result.data

        return {
            'success': True,
            'provider': result.provider,
            'count': len(historical_data),
            'data': [
                {
                    'symbol': price.symbol,
                    'date': price.date.isoformat(),
                    'open': float(price.open),
                    'high': float(price.high),
                    'low': float(price.low),
                    'close': float(price.close),
                    'volume': price.volume,
                    'adjusted_close': float(price.adjusted_close) if price.adjusted_close else None,
                    'dividend': float(price.dividend) if price.dividend else None,
                    'split': float(price.split) if price.split else None,
                    'provider': price.provider,
                    'interval': interval,
                    'created_at': datetime.now().isoformat()
                }
                for price in historical_data
            ]
        }

    async def format_options_data(
        self,
        symbol: str,
        expiration: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Fetch and format options data for database storage.

        Args:
            symbol: Stock symbol
            expiration: Optional expiration date filter

        Returns:
            Dictionary with formatted options data ready for upsert_options_chain()
        """
        from datetime import date

        exp_date = date.fromisoformat(expiration) if expiration else None
        result = await self.brain.get_options_chain(symbol, exp_date)

        if not result.success:
            return {
                'success': False,
                'error': result.error,
                'provider': result.provider,
                'symbol': symbol
            }

        options_data: List[OptionQuote] = result.data

        return {
            'success': True,
            'provider': result.provider,
            'count': len(options_data),
            'data': [
                {
                    'symbol': option.symbol,
                    'underlying_symbol': option.underlying_symbol,
                    'strike': float(option.strike),
                    'expiration': option.expiration.isoformat(),
                    'option_type': option.option_type,
                    'bid': float(option.bid) if option.bid else None,
                    'ask': float(option.ask) if option.ask else None,
                    'last_price': float(option.last_price) if option.last_price else None,
                    'volume': option.volume,
                    'open_interest': option.open_interest,
                    'implied_volatility': float(option.implied_volatility) if option.implied_volatility else None,
                    'delta': float(option.delta) if option.delta else None,
                    'gamma': float(option.gamma) if option.gamma else None,
                    'theta': float(option.theta) if option.theta else None,
                    'vega': float(option.vega) if option.vega else None,
                    'timestamp': option.timestamp.isoformat(),
                    'provider': option.provider,
                    'created_at': datetime.now().isoformat()
                }
                for option in options_data
            ]
        }

    async def format_company_info(self, symbol: str) -> Dict[str, Any]:
        """
        Fetch and format company information for database storage.

        Args:
            symbol: Stock symbol

        Returns:
            Dictionary with formatted company data ready for upsert_company_info()
        """
        result = await self.brain.get_company_info(symbol)

        if not result.success:
            return {
                'success': False,
                'error': result.error,
                'provider': result.provider,
                'symbol': symbol
            }

        company: CompanyInfo = result.data

        return {
            'success': True,
            'provider': result.provider,
            'data': {
                'symbol': company.symbol,
                'name': company.name,
                'exchange': company.exchange,
                'sector': company.sector,
                'industry': company.industry,
                'market_cap': company.market_cap,
                'employees': company.employees,
                'description': company.description,
                'website': company.website,
                'ceo': company.ceo,
                'headquarters': company.headquarters,
                'founded': company.founded,
                'provider': company.provider,
                'created_at': datetime.now().isoformat()
            }
        }

    async def format_fundamentals(self, symbol: str) -> Dict[str, Any]:
        """
        Fetch and format fundamental data for database storage.

        Args:
            symbol: Stock symbol

        Returns:
            Dictionary with formatted fundamentals data ready for upsert_fundamental_data()
        """
        result = await self.brain.get_fundamentals(symbol)

        if not result.success:
            return {
                'success': False,
                'error': result.error,
                'provider': result.provider,
                'symbol': symbol
            }

        fundamentals = result.data

        return {
            'success': True,
            'provider': result.provider,
            'data': {
                'symbol': symbol,
                'market_cap': fundamentals.get('market_cap'),
                'pe_ratio': fundamentals.get('pe_ratio'),
                'pb_ratio': fundamentals.get('pb_ratio'),
                'roe': fundamentals.get('roe'),
                'debt_to_equity': fundamentals.get('debt_to_equity'),
                'revenue': fundamentals.get('revenue'),
                'net_income': fundamentals.get('net_income'),
                'eps': fundamentals.get('eps'),
                'dividend_yield': fundamentals.get('dividend_yield'),
                'beta': fundamentals.get('beta'),
                'provider': result.provider,
                'created_at': datetime.now().isoformat()
            }
        }

    async def batch_format_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Format quotes for multiple symbols concurrently.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbols to formatted quote data
        """
        tasks = {symbol: self.format_quote_data(symbol) for symbol in symbols}
        results = await asyncio.gather(*tasks.values())
        return dict(zip(tasks.keys(), results))

    def format_for_upsert_functions(self, data: Dict[str, Any], data_type: str) -> Dict[str, Any]:
        """
        Format data specifically for PostgreSQL upsert functions.

        Args:
            data: Formatted data dictionary
            data_type: Type of data ('quote', 'historical', 'options', 'company')

        Returns:
            Dictionary with exact parameter names for upsert functions
        """
        if not data.get('success', False):
            return data

        if data_type == 'quote':
            quote_data = data['data']
            return {
                'p_symbol': quote_data['symbol'],
                'p_exchange_id': 1,  # Default exchange
                'p_price': quote_data['price'],
                'p_change_amount': quote_data['change'],
                'p_change_percent': quote_data['change_percent'],
                'p_volume': quote_data['volume'],
                'p_open_price': quote_data['open'],
                'p_high_price': quote_data['high'],
                'p_low_price': quote_data['low'],
                'p_previous_close': quote_data['previous_close'],
                'p_quote_timestamp': quote_data['timestamp'],
                'p_data_provider': quote_data['provider']
            }

        elif data_type == 'historical':
            # Returns list of dictionaries for batch upsert
            return [
                {
                    'p_symbol': record['symbol'],
                    'p_exchange_id': 1,
                    'p_date': record['date'],
                    'p_open': record['open'],
                    'p_high': record['high'],
                    'p_low': record['low'],
                    'p_close': record['close'],
                    'p_volume': record['volume'],
                    'p_adjusted_close': record['adjusted_close'],
                    'p_dividend': record['dividend'] or 0,
                    'p_split_ratio': record['split'] or 1.0,
                    'p_data_provider': record['provider']
                }
                for record in data['data']
            ]

        elif data_type == 'company':
            company_data = data['data']
            return {
                'p_symbol': company_data['symbol'],
                'p_name': company_data['name'],
                'p_exchange': company_data['exchange'],
                'p_sector': company_data['sector'],
                'p_industry': company_data['industry'],
                'p_market_cap': company_data['market_cap'],
                'p_employees': company_data['employees'],
                'p_description': company_data['description'],
                'p_website': company_data['website'],
                'p_ceo': company_data['ceo'],
                'p_headquarters': company_data['headquarters'],
                'p_founded': company_data['founded'],
                'p_data_provider': company_data['provider']
            }

        return data

    async def get_formatted_data_summary(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Get a summary of formatted data for multiple symbols.

        Args:
            symbols: List of symbols to process

        Returns:
            Summary of all data types for the symbols
        """
        summary = {
            'symbols_processed': len(symbols),
            'quotes_success': 0,
            'historical_success': 0,
            'company_info_success': 0,
            'errors': 0,
            'providers_used': set()
        }

        for symbol in symbols:
            # Get quote data
            quote_result = await self.format_quote_data(symbol)
            if quote_result.get('success'):
                summary['quotes_success'] += 1
                summary['providers_used'].add(quote_result['provider'])
            else:
                summary['errors'] += 1

            # Get historical data
            hist_result = await self.format_historical_data(symbol, days_back=7)
            if hist_result.get('success'):
                summary['historical_success'] += 1
            else:
                summary['errors'] += 1

            # Get company info
            company_result = await self.format_company_info(symbol)
            if company_result.get('success'):
                summary['company_info_success'] += 1
            else:
                summary['errors'] += 1

        summary['providers_used'] = list(summary['providers_used'])
        return summary
