"""FRED (Federal Reserve Economic Data) API Provider Implementation"""

import aiohttp
import asyncio
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, date, timedelta
from decimal import Decimal
import logging
from ..base import (
    MarketDataProvider, 
    EconomicEvent,
    StockQuote, 
    HistoricalPrice, 
    OptionQuote, 
    CompanyInfo
)

logger = logging.getLogger(__name__)


class EconomicIndicator:
    """Economic indicator data model for FRED"""
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class FREDProvider(MarketDataProvider):
    """FRED (Federal Reserve Economic Data) API implementation"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "FRED")
        self.base_url = "https://api.stlouisfed.org/fred"
        self.rate_limit_per_minute = 120  # FRED allows 120 requests per minute
        
        # Common economic indicators mapping
        self.economic_indicators = {
            'GDP': 'GDPC1',           # Real GDP
            'UNEMPLOYMENT': 'UNRATE', # Unemployment Rate
            'INFLATION': 'CPIAUCSL',  # Consumer Price Index
            'INTEREST_RATE': 'FEDFUNDS', # Federal Funds Rate
            'RETAIL_SALES': 'RSAFS',  # Retail Sales
            'HOUSING_STARTS': 'HOUST', # Housing Starts
            'INDUSTRIAL_PRODUCTION': 'INDPRO', # Industrial Production Index
            'CONSUMER_CONFIDENCE': 'UMCSENT', # Consumer Sentiment
        }
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any]) -> Optional[Dict]:
        """Make API request to FRED"""
        params['api_key'] = self.api_key
        params['file_type'] = 'json'
        
        url = f"{self.base_url}/{endpoint}"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if 'error_code' in data:
                            error_msg = data.get('error_message', 'Unknown FRED API error')
                            self._log_error(f"FRED API Error: {error_msg}")
                            return None
                        return data
                    else:
                        self._log_error(f"FRED API Request Failed: Status {response.status}")
                        return None
        except Exception as e:
            self._log_error(f"FRED API Request Exception: {str(e)}")
            return None
    
    async def get_economic_events(self, from_date: Optional[date] = None, to_date: Optional[date] = None) -> List[EconomicEvent]:
        """
        Get economic events from FRED by fetching recent data updates for key economic indicators
        This creates events based on actual data releases with values
        """
        try:
            # Default to last 90 days if no dates provided (FRED data has reporting delays)
            if not from_date:
                from_date = date.today() - timedelta(days=90)
            if not to_date:
                to_date = date.today()
            
            events = []
            
            # Create events from recent economic indicator updates
            for indicator_name, series_id in self.economic_indicators.items():
                try:
                    # Get recent observations for this series (expand date range for better coverage)
                    extended_start = from_date - timedelta(days=60)  # Look back further for data
                    params = {
                        'series_id': series_id,
                        'observation_start': extended_start.strftime('%Y-%m-%d'),
                        'observation_end': to_date.strftime('%Y-%m-%d'),
                        'limit': 10,
                        'sort_order': 'desc'
                    }
                    
                    data = await self._make_request('series/observations', params)
                    if not data or 'observations' not in data:
                        continue
                    
                    observations = data['observations']
                    if not observations:
                        continue
                    
                    # Get series metadata for better event details
                    series_params = {'series_id': series_id}
                    series_data = await self._make_request('series', series_params)
                    series_info = series_data.get('seriess', [{}])[0] if series_data else {}
                    
                    # Create events for recent observations
                    for obs in observations:
                        if obs.get('value') == '.':
                            continue  # Skip missing values
                        
                        try:
                            obs_date = datetime.strptime(obs['date'], '%Y-%m-%d').date()
                            
                            # Include recent data even if slightly outside range to ensure we get events
                            # This accounts for FRED's reporting delays
                            cutoff_date = from_date - timedelta(days=30)
                            if obs_date < cutoff_date or obs_date > to_date:
                                continue
                            
                            event = EconomicEvent(
                                event_id=f"fred_{series_id}_{obs['date']}",
                                country='US',
                                event_name=f"{series_info.get('title', indicator_name)} Release",
                                event_period=obs['date'],
                                actual=float(obs['value']) if obs['value'] != '.' else None,
                                previous=None,  # We could fetch previous value if needed
                                forecast=None,  # FRED doesn't provide forecasts
                                unit=series_info.get('units', None),
                                importance=3 if indicator_name in ['GDP', 'UNEMPLOYMENT', 'INFLATION'] else 2,
                                timestamp=datetime.combine(obs_date, datetime.min.time()),
                                last_update=datetime.now(),
                                description=f"FRED {indicator_name} data release: {obs['value']} {series_info.get('units', '')}",
                                url=f"https://fred.stlouisfed.org/series/{series_id}",
                                provider='FRED',
                                category='Economic Indicator',
                                frequency=series_info.get('frequency', 'Unknown'),
                                source='Federal Reserve Bank of St. Louis'
                            )
                            events.append(event)
                            
                        except (ValueError, KeyError) as e:
                            self._log_error(f"Error processing observation for {series_id}: {str(e)}")
                            continue
                    
                    # Small delay to respect rate limits
                    await asyncio.sleep(0.1)
                    
                except Exception as e:
                    self._log_error(f"Error fetching data for {indicator_name} ({series_id}): {str(e)}")
                    continue
            
            # Also get recent releases for additional context
            try:
                release_params = {
                    'realtime_start': from_date.strftime('%Y-%m-%d'),
                    'realtime_end': to_date.strftime('%Y-%m-%d'),
                    'limit': 20,
                    'order_by': 'release_date',
                    'sort_order': 'desc'
                }
                
                release_data = await self._make_request('releases', release_params)
                if release_data and 'releases' in release_data:
                    for release in release_data['releases'][:10]:  # Limit to 10 releases
                        try:
                            release_date = datetime.strptime(release.get('realtime_start', date.today().isoformat()), '%Y-%m-%d')
                            
                            event = EconomicEvent(
                                event_id=f"fred_release_{release.get('id', 'unknown')}",
                                country='US',
                                event_name=f"FRED Release: {release.get('name', 'Unknown')}",
                                event_period=release.get('realtime_start', ''),
                                actual=None,
                                previous=None,
                                forecast=None,
                                unit=None,
                                importance=1,  # Lower importance for general releases
                                timestamp=release_date,
                                last_update=datetime.now(),
                                description=f"FRED Data Release: {release.get('name', 'Unknown')}",
                                url=release.get('link', None),
                                provider='FRED',
                                category='Data Release',
                                frequency='Various'
                            )
                            events.append(event)
                            
                        except Exception as e:
                            self._log_error(f"Error processing FRED release: {str(e)}")
                            continue
            
            except Exception as e:
                self._log_error(f"Error fetching FRED releases: {str(e)}")
            
            # Sort events by timestamp (most recent first)
            events.sort(key=lambda x: x.timestamp, reverse=True)
            
            self._log_info(f"Retrieved {len(events)} economic events from FRED")
            return events
            
        except Exception as e:
            self._log_error(f"Error fetching FRED economic events: {str(e)}")
            return []
    
    async def get_economic_indicators(self) -> List[EconomicIndicator]:
        """Get economic indicators data from FRED"""
        try:
            indicators = []
            
            # Fetch data for each common economic indicator
            for indicator_name, series_id in self.economic_indicators.items():
                try:
                    # Get the latest observation for this series
                    params = {
                        'series_id': series_id,
                        'limit': 1,
                        'sort_order': 'desc'
                    }
                    
                    data = await self._make_request('series/observations', params)
                    if not data or 'observations' not in data:
                        continue
                    
                    observations = data['observations']
                    if not observations:
                        continue
                    
                    latest = observations[0]
                    if latest.get('value') == '.':  # FRED uses '.' for missing values
                        continue
                    
                    # Get series metadata
                    series_params = {'series_id': series_id}
                    series_data = await self._make_request('series', series_params)
                    series_info = series_data.get('seriess', [{}])[0] if series_data else {}
                    
                    indicator = EconomicIndicator(
                        indicator_code=series_id,
                        indicator_name=series_info.get('title', indicator_name),
                        country='US',
                        value=float(latest['value']) if latest['value'] != '.' else None,
                        period_date=datetime.strptime(latest['date'], '%Y-%m-%d').date(),
                        unit=series_info.get('units', None),
                        frequency=series_info.get('frequency', None),
                        last_updated=datetime.now(),
                        source_agency='Federal Reserve Bank of St. Louis',
                        provider='FRED',
                        importance_level=2,  # Default medium importance
                        status='final'
                    )
                    indicators.append(indicator)
                    
                except Exception as e:
                    self._log_error(f"Error fetching FRED indicator {indicator_name}: {str(e)}")
                    continue
            
            self._log_info(f"Retrieved {len(indicators)} economic indicators from FRED")
            return indicators
            
        except Exception as e:
            self._log_error(f"Error fetching FRED economic indicators: {str(e)}")
            return []
    
    async def get_economic_data(self, series_id: str, **kwargs) -> Dict[str, Any]:
        """Get specific economic data series from FRED"""
        try:
            params = {
                'series_id': series_id,
                'limit': kwargs.get('limit', 100),
                'sort_order': kwargs.get('sort_order', 'desc')
            }
            
            # Add date filters if provided
            if 'start_date' in kwargs:
                params['observation_start'] = kwargs['start_date'].strftime('%Y-%m-%d')
            if 'end_date' in kwargs:
                params['observation_end'] = kwargs['end_date'].strftime('%Y-%m-%d')
            
            data = await self._make_request('series/observations', params)
            if not data:
                return {}
            
            return {
                'series_id': series_id,
                'data': data.get('observations', []),
                'provider': 'FRED'
            }
            
        except Exception as e:
            self._log_error(f"Error fetching FRED economic data for {series_id}: {str(e)}")
            return {}
    
    async def search_series(self, search_text: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search for economic data series in FRED"""
        try:
            params = {
                'search_text': search_text,
                'limit': limit,
                'order_by': 'popularity',
                'sort_order': 'desc'
            }
            
            data = await self._make_request('series/search', params)
            if not data or 'seriess' not in data:
                return []
            
            return data['seriess']
            
        except Exception as e:
            self._log_error(f"Error searching FRED series: {str(e)}")
            return []
    
    # Required abstract methods (not applicable for FRED but need to be implemented)
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """FRED doesn't provide stock quotes"""
        self._log_info("FRED: Stock quotes not available")
        return None
    
    async def get_historical(self, symbol: str, start_date: Optional[date] = None, 
                           end_date: Optional[date] = None, interval: str = "daily") -> List[HistoricalPrice]:
        """FRED doesn't provide stock historical data"""
        self._log_info("FRED: Stock historical data not available")
        return []
    
    async def get_options_chain(self, symbol: str, expiration_date: Optional[date] = None) -> List[OptionQuote]:
        """FRED doesn't provide options data"""
        self._log_info("FRED: Options data not available")
        return []
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """FRED doesn't provide company information"""
        self._log_info("FRED: Company information not available")
        return None
    
    async def get_earnings_calendar(self, start_date: Optional[date] = None, 
                                  end_date: Optional[date] = None) -> List:
        """FRED doesn't provide earnings calendar"""
        self._log_info("FRED: Earnings calendar not available")
        return []
    
    async def get_earnings_transcript(self, symbol: str, year: int, quarter: int) -> Optional[str]:
        """FRED doesn't provide earnings transcripts"""
        self._log_info("FRED: Earnings transcripts not available")
        return None
    
    def _log_info(self, message: str):
        """Log info message"""
        logger.info(f"FRED: {message}")
    
    def _log_error(self, message: str):
        """Log error message"""
        logger.error(f"FRED: {message}")
