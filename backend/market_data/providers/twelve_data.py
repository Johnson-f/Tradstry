"""TwelveData API Provider Implementation"""

import aiohttp
from typing import Dict, List, Optional, Any
from datetime import datetime, date
from decimal import Decimal
from ..base import (
    MarketDataProvider, 
    StockQuote, 
    HistoricalPrice, 
    OptionQuote, 
    CompanyInfo
)


class TwelveDataProvider(MarketDataProvider):
    """TwelveData API implementation"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "TwelveData")
        self.base_url = "https://api.twelvedata.com"
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any] = None) -> Optional[Dict]:
        """Make API request to TwelveData"""
        if params is None:
            params = {}
        params['apikey'] = self.api_key
        
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.base_url}/{endpoint}"
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get('status') == 'error':
                            self._log_error("API Request", Exception(data.get('message', 'Unknown error')))
                            return None
                        return data
                    else:
                        self._log_error("API Request", Exception(f"HTTP {response.status}"))
                        return None
        except Exception as e:
            self._log_error("_make_request", e)
            return None
    
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """Get current quote for a symbol"""
        data = await self._make_request("quote", {'symbol': symbol})
        
        if not data:
            return None
        
        try:
            return StockQuote(
                symbol=symbol,
                price=Decimal(str(data['close'])),
                change=Decimal(str(data['change'])),
                change_percent=Decimal(str(data['percent_change'])),
                volume=int(data.get('volume', 0)),
                open=Decimal(str(data['open'])),
                high=Decimal(str(data['high'])),
                low=Decimal(str(data['low'])),
                previous_close=Decimal(str(data['previous_close'])),
                timestamp=datetime.fromisoformat(data['datetime']),
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
        # Map interval to TwelveData format
        interval_map = {
            "1min": "1min",
            "5min": "5min",
            "15min": "15min",
            "30min": "30min",
            "60min": "1h",
            "1d": "1day",
            "daily": "1day",
            "1w": "1week",
            "weekly": "1week",
            "1m": "1month",
            "monthly": "1month"
        }
        
        td_interval = interval_map.get(interval, "1day")
        
        params = {
            'symbol': symbol,
            'interval': td_interval,
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
            'outputsize': 5000
        }
        
        data = await self._make_request("time_series", params)
        
        if not data or 'values' not in data:
            return None
        
        try:
            prices = []
            for bar in data['values']:
                price_date = datetime.fromisoformat(bar['datetime']).date()
                
                prices.append(HistoricalPrice(
                    symbol=symbol,
                    date=price_date,
                    open=Decimal(str(bar['open'])),
                    high=Decimal(str(bar['high'])),
                    low=Decimal(str(bar['low'])),
                    close=Decimal(str(bar['close'])),
                    volume=int(bar.get('volume', 0)),
                    provider=self.name
                ))
            
            return sorted(prices, key=lambda x: x.date)
        except Exception as e:
            self._log_error("get_historical", e)
            return None
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get company information"""
        data = await self._make_request("profile", {'symbol': symbol})
        
        if not data:
            return None
        
        try:
            return CompanyInfo(
                symbol=symbol,
                name=data.get('name', ''),
                exchange=data.get('exchange'),
                sector=data.get('sector'),
                industry=data.get('industry'),
                market_cap=int(data.get('market_cap', 0)) if data.get('market_cap') else None,
                employees=int(data.get('employees', 0)) if data.get('employees') else None,
                description=data.get('description'),
                website=data.get('website'),
                ceo=data.get('ceo'),
                headquarters=f"{data.get('address', '')}, {data.get('city', '')}, {data.get('state', '')} {data.get('zip', '')}".strip(', '),
                founded=None,  # Not provided
                provider=self.name
            )
        except Exception as e:
            self._log_error("get_company_info", e)
            return None
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> Optional[List[OptionQuote]]:
        """Get options chain for a symbol"""
        params = {'symbol': symbol}
        
        if expiration:
            params['expiration_date'] = expiration.strftime('%Y-%m-%d')
        
        data = await self._make_request("options/chain", params)
        
        if not data or 'calls' not in data:
            return None
        
        try:
            options = []
            
            # Process calls
            for contract in data.get('calls', []):
                options.append(OptionQuote(
                    symbol=contract.get('contract_name', ''),
                    underlying_symbol=symbol,
                    strike=Decimal(str(contract['strike'])),
                    expiration=datetime.strptime(contract['expiration_date'], '%Y-%m-%d').date(),
                    option_type='call',
                    bid=Decimal(str(contract.get('bid', 0))),
                    ask=Decimal(str(contract.get('ask', 0))),
                    last_price=Decimal(str(contract.get('last', 0))),
                    volume=contract.get('volume', 0),
                    open_interest=contract.get('open_interest', 0),
                    implied_volatility=Decimal(str(contract.get('implied_volatility', 0))),
                    timestamp=datetime.now(),
                    provider=self.name
                ))
            
            # Process puts
            for contract in data.get('puts', []):
                options.append(OptionQuote(
                    symbol=contract.get('contract_name', ''),
                    underlying_symbol=symbol,
                    strike=Decimal(str(contract['strike'])),
                    expiration=datetime.strptime(contract['expiration_date'], '%Y-%m-%d').date(),
                    option_type='put',
                    bid=Decimal(str(contract.get('bid', 0))),
                    ask=Decimal(str(contract.get('ask', 0))),
                    last_price=Decimal(str(contract.get('last', 0))),
                    volume=contract.get('volume', 0),
                    open_interest=contract.get('open_interest', 0),
                    implied_volatility=Decimal(str(contract.get('implied_volatility', 0))),
                    timestamp=datetime.now(),
                    provider=self.name
                ))
            
            return options
        except Exception as e:
            self._log_error("get_options_chain", e)
            return None
    
    async def get_earnings(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get earnings data"""
        data = await self._make_request("earnings", {'symbol': symbol})
        
        if not data or 'earnings' not in data:
            return None
        
        return data['earnings']
    
    async def get_dividends(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get dividend data"""
        data = await self._make_request("dividends", {'symbol': symbol})
        
        if not data or 'dividends' not in data:
            return None
        
        return data['dividends']
    
    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental statistics"""
        data = await self._make_request("statistics", {'symbol': symbol})
        
        if not data or 'statistics' not in data:
            return None
        
        stats = data['statistics']
        
        return {
            'symbol': symbol,
            'provider': self.name,
            'pe_ratio': stats.get('valuations_metrics', {}).get('pe_ratio'),
            'peg_ratio': stats.get('valuations_metrics', {}).get('peg_ratio'),
            'dividend_yield': stats.get('stock_dividends', {}).get('forward_annual_dividend_yield'),
            'eps': stats.get('financials', {}).get('ttm_eps'),
            'revenue': stats.get('financials', {}).get('ttm_revenue'),
            'profit_margin': stats.get('financials', {}).get('profit_margin'),
            'operating_margin': stats.get('financials', {}).get('operating_margin'),
            'return_on_assets': stats.get('financials', {}).get('return_on_assets'),
            'return_on_equity': stats.get('financials', {}).get('return_on_equity'),
            'beta': stats.get('stock_statistics', {}).get('beta'),
            '52_week_high': stats.get('stock_statistics', {}).get('52_week_high'),
            '52_week_low': stats.get('stock_statistics', {}).get('52_week_low'),
            'avg_volume': stats.get('stock_statistics', {}).get('avg_volume'),
            'shares_outstanding': stats.get('stock_statistics', {}).get('shares_outstanding')
        }
    
    async def get_technical_indicators(
        self, 
        symbol: str, 
        indicator: str,
        interval: str = "1day"
    ) -> Optional[Dict[str, Any]]:
        """Get technical indicators"""
        # Map indicator names
        indicator_map = {
            'sma': 'sma',
            'ema': 'ema',
            'macd': 'macd',
            'rsi': 'rsi',
            'bbands': 'bbands',
            'stoch': 'stoch',
            'adx': 'adx',
            'cci': 'cci',
            'obv': 'obv',
            'atr': 'atr',
            'willr': 'willr',
            'mfi': 'mfi'
        }
        
        td_indicator = indicator_map.get(indicator.lower())
        if not td_indicator:
            return None
        
        params = {
            'symbol': symbol,
            'interval': interval
        }
        
        # Add default parameters based on indicator
        if td_indicator in ['sma', 'ema']:
            params['time_period'] = 20
        elif td_indicator == 'bbands':
            params['time_period'] = 20
            params['sd'] = 2
        elif td_indicator == 'rsi':
            params['time_period'] = 14
        
        data = await self._make_request(td_indicator, params)
        return data
