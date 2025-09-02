"""
Fiscal.AI API Provider Implementation

This module provides an asynchronous interface to the Fiscal.AI financial data API.
It includes comprehensive error handling, rate limiting, and data normalization.
"""

import aiohttp
import asyncio
import logging
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal, InvalidOperation
import json

from ..base import (
    MarketDataProvider,
    StockQuote,
    HistoricalPrice,
    CompanyInfo,
    EconomicEvent
)

# Configure logger
logger = logging.getLogger(__name__)

class FiscalAIProvider(MarketDataProvider):
    """
    Fiscal.AI API implementation with enhanced features and error handling.

    This provider supports:
    - Company profiles and financials
    - Stock prices with real-time/delayed data
    - Corporate actions and events
    - Financial ratios and KPIs
    - SEC filings and earnings transcripts
    - AI-powered financial analysis
    """

    def __init__(self, api_key: str, base_url: str = "https://api.fiscal.ai"):
        """
        Initialize the Fiscal.AI provider

        Args:
            api_key: Your Fiscal.AI API key
            base_url: API base URL (can be customized for different environments)
        """
        super().__init__(api_key, "FiscalAI")
        self.base_url = base_url.rstrip('/')
        self.session = None
        self.rate_limit_delay = 0.1  # 100ms between requests
        self._last_request_time = 0

    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession(
            headers={
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json',
                'User-Agent': 'FiscalAI-Python-Client/1.0'
            },
            timeout=aiohttp.ClientTimeout(total=30)
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
            self.session = None

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
                return Decimal(clean_value) if clean_value and clean_value != '-' else default
            return Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            return default

    def _safe_int(self, value: Any, default: int = 0) -> int:
        """Safely convert value to int"""
        try:
            return int(float(value)) if value is not None else default
        except (ValueError, TypeError):
            return default

    def _safe_float(self, value: Any, default: float = 0.0) -> float:
        """Safely convert value to float"""
        try:
            return float(value) if value is not None else default
        except (ValueError, TypeError):
            return default

    async def _rate_limit(self):
        """Implement rate limiting"""
        current_time = asyncio.get_event_loop().time()
        time_since_last = current_time - self._last_request_time
        if time_since_last < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - time_since_last)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _make_request(
        self,
        endpoint: str,
        method: str = "GET",
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        retries: int = 3,
        backoff_factor: float = 0.5
    ) -> Optional[Union[Dict, List]]:
        """
        Make an API request to Fiscal.AI with retries and rate limiting

        Args:
            endpoint: API endpoint (without base URL)
            method: HTTP method (GET, POST, etc.)
            params: Query parameters
            data: Request body data
            retries: Number of retry attempts
            backoff_factor: Backoff factor for retries

        Returns:
            Parsed JSON response or None if request failed
        """
        if not self.session:
            async with self:
                return await self._make_request(endpoint, method, params, data, retries, backoff_factor)

        await self._rate_limit()

        # Build URL
        url = f"{self.base_url}/{endpoint.lstrip('/')}"

        request_kwargs = {
            'params': params or {},
            'json': data if data else None
        }

        last_error = None
        for attempt in range(retries):
            try:
                async with self.session.request(method, url, **request_kwargs) as response:
                    if response.status == 200:
                        return await response.json()
                    elif response.status == 401:
                        self._log_error("Authentication Failed", "Invalid API key")
                        return None
                    elif response.status == 429:
                        # Rate limited, wait longer
                        retry_after = int(response.headers.get('Retry-After', 60))
                        logger.warning(f"Rate limited. Waiting {retry_after} seconds...")
                        await asyncio.sleep(retry_after)
                        continue
                    elif response.status == 404:
                        self._log_error("Not Found", f"Endpoint not found: {endpoint}")
                        return None
                    else:
                        error_text = await response.text()
                        self._log_error(
                            f"API Request Failed (HTTP {response.status})",
                            f"URL: {url}, Response: {error_text}"
                        )
                        last_error = Exception(f"HTTP {response.status}: {error_text}")

            except aiohttp.ClientError as e:
                last_error = e
                self._log_error("HTTP Client Error", str(e))

            # Exponential backoff
            if attempt < retries - 1:
                wait_time = backoff_factor * (2 ** attempt)
                logger.warning(f"Retry {attempt + 1}/{retries} after {wait_time:.2f}s...")
                await asyncio.sleep(wait_time)

        # All retries failed
        if last_error:
            self._log_error("Request Failed", f"All {retries} attempts failed: {str(last_error)}")
        return None

    async def search_companies(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Search for companies by name or symbol

        Args:
            query: Search query (company name or symbol)
            limit: Maximum number of results

        Returns:
            List of company search results
        """
        if not query or not isinstance(query, str):
            self._log_error("Invalid Input", f"Invalid query: {query}")
            return []

        try:
            data = await self._make_request(
                "companies/search",
                params={"q": query.strip(), "limit": limit}
            )
            return data if isinstance(data, list) else []
        except Exception as e:
            self._log_error("Company Search Error", f"Failed to search companies: {str(e)}")
            return []

    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get comprehensive company information"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None
        
        symbol = symbol.upper().strip()

        try:
            # Try multiple endpoints for company data
            profile_data = await self._make_request(f"companies/{symbol}/profile")
            metrics_data = await self._make_request(f"companies/{symbol}/metrics")
            
            if not profile_data:
                return None

            # Merge data from different endpoints
            combined_data = {**profile_data}
            if metrics_data:
                combined_data.update(metrics_data)

            return CompanyInfo(
                symbol=symbol,
                company_name=combined_data.get('name', combined_data.get('companyName', '')),
                description=combined_data.get('description', combined_data.get('businessSummary', '')),
                sector=combined_data.get('sector', ''),
                industry=combined_data.get('industry', ''),
                exchange=combined_data.get('exchange', combined_data.get('exchangeSymbol', '')),
                website=combined_data.get('website', ''),
                ceo=combined_data.get('ceo', combined_data.get('officers', [{}])[0].get('name', '') if combined_data.get('officers') else ''),
                employees=self._safe_int(combined_data.get('employees', combined_data.get('fullTimeEmployees', 0))),
                country=combined_data.get('country', combined_data.get('countryName', '')),
                state=combined_data.get('state', ''),
                city=combined_data.get('city', ''),
                zip_code=combined_data.get('zipCode', ''),
                phone=combined_data.get('phone', ''),
                address=combined_data.get('address', ''),
                market_cap=self._safe_decimal(combined_data.get('marketCap', 0)),
                pe_ratio=self._safe_decimal(combined_data.get('peRatio', combined_data.get('trailingPE', 0))),
                beta=self._safe_decimal(combined_data.get('beta', 0)),
                dividend_yield=self._safe_decimal(combined_data.get('dividendYield', 0)),
                dividend_per_share=self._safe_decimal(combined_data.get('dividendPerShare', 0)),
                payout_ratio=self._safe_decimal(combined_data.get('payoutRatio', 0)),
                revenue_per_share_ttm=self._safe_decimal(combined_data.get('revenuePerShareTTM', 0)),
                profit_margin=self._safe_decimal(combined_data.get('profitMargin', 0)),
                roe=self._safe_decimal(combined_data.get('returnOnEquity', 0)),
                roa=self._safe_decimal(combined_data.get('returnOnAssets', 0)),
                recommendation_mean=self._safe_decimal(combined_data.get('recommendationMean', 0)),
                recommendation_key=combined_data.get('recommendationKey', ''),
                updated_at=datetime.now(timezone.utc),
                provider=self.name
            )

        except Exception as e:
            self._log_error("get_company_info", f"Failed to fetch company info for {symbol}: {str(e)}")
            return None

    async def get_current_quote(self, symbol: str) -> Optional[StockQuote]:
        """Get current stock quote with real-time or delayed data"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return None

        symbol = symbol.upper().strip()

        try:
            data = await self._make_request(f"quotes/{symbol}")
            
            if not data:
                return None

            return StockQuote(
                symbol=symbol,
                price=self._safe_decimal(data.get('price', data.get('lastPrice', 0))),
                change=self._safe_decimal(data.get('change', 0)),
                change_percent=self._safe_decimal(data.get('changePercent', 0)),
                volume=self._safe_int(data.get('volume', 0)),
                avg_volume=self._safe_int(data.get('avgVolume', 0)),
                market_cap=self._safe_decimal(data.get('marketCap', 0)),
                pe_ratio=self._safe_decimal(data.get('peRatio', 0)),
                week_52_high=self._safe_decimal(data.get('week52High', 0)),
                week_52_low=self._safe_decimal(data.get('week52Low', 0)),
                day_high=self._safe_decimal(data.get('dayHigh', 0)),
                day_low=self._safe_decimal(data.get('dayLow', 0)),
                open=self._safe_decimal(data.get('open', 0)),
                previous_close=self._safe_decimal(data.get('previousClose', 0)),
                timestamp=datetime.now(timezone.utc),
                source="FiscalAI"
            )

        except Exception as e:
            self._log_error("get_current_quote", f"Failed to fetch quote for {symbol}: {str(e)}")
            return None

    async def get_fundamentals(
        self,
        symbol: str,
        period: str = "annual",
        limit: int = 4
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Get comprehensive fundamental data"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return {}

        symbol = symbol.upper().strip()

        try:
            # Fetch different financial statements
            income_stmt = await self._make_request(
                f"companies/{symbol}/financials/income-statement",
                params={"period": period, "limit": limit}
            )
            balance_sheet = await self._make_request(
                f"companies/{symbol}/financials/balance-sheet",
                params={"period": period, "limit": limit}
            )
            cash_flow = await self._make_request(
                f"companies/{symbol}/financials/cash-flow",
                params={"period": period, "limit": limit}
            )
            ratios = await self._make_request(
                f"companies/{symbol}/ratios",
                params={"period": period, "limit": limit}
            )

            return {
                'income_statement': income_stmt if isinstance(income_stmt, list) else [],
                'balance_sheet': balance_sheet if isinstance(balance_sheet, list) else [],
                'cash_flow': cash_flow if isinstance(cash_flow, list) else [],
                'ratios': ratios if isinstance(ratios, list) else []
            }

        except Exception as e:
            self._log_error("Fundamentals Error", f"Failed to fetch fundamentals for {symbol}: {str(e)}")
            return {}

    async def get_historical(
        self,
        symbol: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        interval: str = "1d"
    ) -> List[HistoricalPrice]:
        """Get historical price data with flexible intervals"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []

        symbol = symbol.upper().strip()
        end_date = end_date or date.today()
        start_date = start_date or (end_date - timedelta(days=365))

        try:
            params = {
                "from": start_date.strftime('%Y-%m-%d'),
                "to": end_date.strftime('%Y-%m-%d'),
                "interval": interval
            }

            data = await self._make_request(f"companies/{symbol}/historical", params=params)

            if not data or not isinstance(data, list):
                return []

            results = []
            for item in data:
                try:
                    # Handle different date formats
                    date_str = item.get('date', item.get('timestamp', ''))
                    if 'T' in date_str:
                        date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00')).date()
                    else:
                        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
                    
                    results.append(HistoricalPrice(
                        date=date_obj,
                        open=self._safe_decimal(item.get('open')),
                        high=self._safe_decimal(item.get('high')),
                        low=self._safe_decimal(item.get('low')),
                        close=self._safe_decimal(item.get('close')),
                        volume=self._safe_int(item.get('volume')),
                        adj_close=self._safe_decimal(item.get('adjClose', item.get('close'))),
                        symbol=symbol,
                        source="FiscalAI"
                    ))
                except Exception as e:
                    self._log_error("Data Processing", f"Error processing historical data item: {str(e)}")
                    continue

            return sorted(results, key=lambda x: x.date)

        except Exception as e:
            self._log_error("Historical Data Error", f"Failed to fetch historical data for {symbol}: {str(e)}")
            return []

    async def get_earnings_transcripts(
        self,
        symbol: str,
        limit: int = 4
    ) -> List[Dict[str, Any]]:
        """Get earnings call transcripts with AI analysis"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []

        symbol = symbol.upper().strip()

        try:
            data = await self._make_request(
                f"companies/{symbol}/earnings/transcripts",
                params={"limit": limit}
            )
            return data if isinstance(data, list) else []
        except Exception as e:
            self._log_error("Earnings Transcripts Error", f"Failed to fetch transcripts for {symbol}: {str(e)}")
            return []

    async def get_sec_filings(
        self,
        symbol: str,
        form_type: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get SEC filings for a company"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []

        symbol = symbol.upper().strip()

        try:
            params = {"limit": limit}
            if form_type:
                params["form"] = form_type

            data = await self._make_request(f"companies/{symbol}/filings", params=params)
            return data if isinstance(data, list) else []
        except Exception as e:
            self._log_error("SEC Filings Error", f"Failed to fetch filings for {symbol}: {str(e)}")
            return []

    async def get_corporate_actions(
        self,
        symbol: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """Get corporate actions (splits, dividends, etc.)"""
        if not symbol or not isinstance(symbol, str):
            self._log_error("Invalid Input", f"Invalid symbol: {symbol}")
            return []

        symbol = symbol.upper().strip()
        end_date = end_date or date.today()
        start_date = start_date or (end_date - timedelta(days=365))

        try:
            params = {
                "from": start_date.strftime('%Y-%m-%d'),
                "to": end_date.strftime('%Y-%m-%d')
            }

            data = await self._make_request(f"companies/{symbol}/actions", params=params)
            return data if isinstance(data, list) else []
        except Exception as e:
            self._log_error("Corporate Actions Error", f"Failed to fetch actions for {symbol}: {str(e)}")
            return []

    async def ai_query(
        self,
        symbol: str,
        question: str,
        context: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Use AI to answer questions about a company"""
        if not symbol or not question:
            self._log_error("Invalid Input", "Symbol and question are required")
            return None

        symbol = symbol.upper().strip()

        try:
            data = {
                "symbol": symbol,
                "question": question.strip()
            }
            if context:
                data["context"] = context

            response = await self._make_request(
                "ai/query",
                method="POST",
                data=data
            )
            return response
        except Exception as e:
            self._log_error("AI Query Error", f"Failed to process AI query for {symbol}: {str(e)}")
            return None

    async def get_market_status(self) -> Optional[Dict[str, Any]]:
        """Get current market status"""
        try:
            data = await self._make_request("market/status")
            return data
        except Exception as e:
            self._log_error("Market Status Error", f"Failed to fetch market status: {str(e)}")
            return None

    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """Get current stock quote"""
        return await self.get_current_quote(symbol)
    
    async def get_earnings_calendar(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get earnings calendar events"""
        try:
            end_date = end_date or date.today() + timedelta(days=30)
            start_date = start_date or date.today()
            
            params = {
                "from": start_date.strftime('%Y-%m-%d'),
                "to": end_date.strftime('%Y-%m-%d'),
                "limit": limit
            }
            
            data = await self._make_request("earnings/calendar", params=params)
            return data if isinstance(data, list) else []
        except Exception as e:
            self._log_error("Earnings Calendar Error", f"Failed to fetch earnings calendar: {str(e)}")
            return []
    
    async def get_earnings_transcript(
        self,
        symbol: str,
        year: Optional[int] = None,
        quarter: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        """Get earnings call transcript"""
        if not symbol:
            return None
            
        try:
            params = {}
            if year:
                params['year'] = year
            if quarter:
                params['quarter'] = quarter
                
            data = await self._make_request(f"companies/{symbol.upper()}/earnings/transcripts", params=params)
            return data if isinstance(data, dict) else None
        except Exception as e:
            self._log_error("Earnings Transcript Error", f"Failed to fetch transcript for {symbol}: {str(e)}")
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
        try:
            end_date = end_date or date.today() + timedelta(days=30)
            start_date = start_date or date.today() - timedelta(days=30)
            
            params = {
                "from": start_date.strftime('%Y-%m-%d'),
                "to": end_date.strftime('%Y-%m-%d'),
                "limit": limit
            }
            
            if countries:
                params['countries'] = ','.join(countries)
            if importance:
                params['importance'] = importance
                
            data = await self._make_request("economic/events", params=params)
            
            if not data or not isinstance(data, list):
                return []
                
            events = []
            for item in data:
                try:
                    event_date = datetime.strptime(item['date'], '%Y-%m-%d %H:%M:%S') if 'date' in item else datetime.now(timezone.utc)
                    if event_date.tzinfo is None:
                        event_date = event_date.replace(tzinfo=timezone.utc)
                        
                    events.append(EconomicEvent(
                        event=item.get('event', ''),
                        country=item.get('country', ''),
                        currency=item.get('currency', ''),
                        date=event_date,
                        importance=item.get('importance', 0),
                        actual=self._safe_decimal(item.get('actual')),
                        previous=self._safe_decimal(item.get('previous')),
                        forecast=self._safe_decimal(item.get('forecast')),
                        unit=item.get('unit', ''),
                        source="FiscalAI"
                    ))
                except Exception as e:
                    self._log_error("Event Processing", f"Error processing economic event: {e}")
                    continue
                    
            return events
            
        except Exception as e:
            self._log_error("Economic Events Error", f"Failed to fetch economic events: {str(e)}")
            return []
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """Get options chain data"""
        if not symbol:
            return []
            
        try:
            params = {}
            if expiration:
                params['expiration'] = expiration.strftime('%Y-%m-%d')
                
            data = await self._make_request(f"companies/{symbol.upper()}/options", params=params)
            return data if isinstance(data, list) else []
        except Exception as e:
            self._log_error("Options Chain Error", f"Failed to fetch options for {symbol}: {str(e)}")
            return []

    async def close(self):
        """Clean up resources"""
        if self.session:
            await self.session.close()
            self.session = None