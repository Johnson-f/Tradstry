"""API-Ninjas motivational quotes provider implementation"""

import aiohttp
import asyncio
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any, Union
from decimal import Decimal
import logging
from ..base import (
    MarketDataProvider, 
    StockQuote, 
    HistoricalPrice, 
    OptionQuote, 
    CompanyInfo,
    EconomicEvent, 
    EarningsCalendar,
    EarningsCallTranscript,
    MotivationalQuote
)

logger = logging.getLogger(__name__)

class APINinjasProvider(MarketDataProvider):
    """
    API-Ninjas motivational quotes provider implementation.
    Documentation: https://api-ninjas.com/api/quotes
    """
    
    BASE_URL = "https://api.api-ninjas.com/v1"
    
    # Available quote categories based on API-Ninjas documentation
    AVAILABLE_CATEGORIES = [
        'age', 'alone', 'amazing', 'anger', 'architecture', 'art', 'attitude', 'beauty',
        'best', 'birthday', 'business', 'car', 'change', 'communications', 'computers',
        'cool', 'courage', 'dad', 'dating', 'death', 'design', 'dreams', 'education',
        'environmental', 'equality', 'experience', 'failure', 'faith', 'family', 'famous',
        'fear', 'fitness', 'food', 'forgiveness', 'freedom', 'friendship', 'funny', 'future',
        'god', 'good', 'government', 'graduation', 'great', 'happiness', 'health', 'history',
        'home', 'hope', 'humor', 'imagination', 'inspirational', 'intelligence', 'jealousy',
        'knowledge', 'leadership', 'learning', 'legal', 'life', 'love', 'marriage', 'medical',
        'men', 'mom', 'money', 'morning', 'movies', 'success', 'travel'
    ]
    
    def __init__(self, api_key: str):
        """
        Initialize API-Ninjas provider.
        
        Args:
            api_key: Your API-Ninjas API key
        """
        super().__init__(api_key=api_key, name="api-ninjas")
        self.base_url = self.BASE_URL
        self.rate_limit_per_minute = 200  # Free tier limit
        self.session = None
        
    async def _ensure_session(self) -> None:
        """Ensure we have an active aiohttp session"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                headers={"X-Api-Key": self.api_key}
            )
            
    async def close(self) -> None:
        """Close the client session"""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None
            
    async def __aenter__(self):
        await self._ensure_session()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
        
    async def _make_request(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Any:
        """
        Make a request to the API-Ninjas API
        
        Args:
            endpoint: API endpoint (without base URL)
            params: Query parameters
            
        Returns:
            Parsed JSON response or None if request failed
        """
        if params is None:
            params = {}
            
        try:
            await self._ensure_session()
            url = f"{self.base_url}/{endpoint.lstrip('/')}"
            
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    return await response.json()
                elif response.status == 429:
                    retry_after = int(response.headers.get('Retry-After', '60'))
                    self._log_error("Rate limit exceeded", 
                                  f"Waiting {retry_after} seconds")
                    await asyncio.sleep(retry_after)
                    return await self._make_request(endpoint, params)
                else:
                    error_text = await response.text()
                    self._log_error(f"API Error {response.status}", error_text)
                    return None
                    
        except Exception as e:
            self._log_error("Request failed", str(e))
            return None

    async def get_motivational_quote(
        self, 
        category: Optional[str] = None, 
        limit: int = 1
    ) -> Optional[List[MotivationalQuote]]:
        """
        Get motivational quotes from API-Ninjas
        
        Args:
            category: Optional category to filter quotes (see AVAILABLE_CATEGORIES)
            limit: Number of quotes to return (1-100, default: 1)
            
        Returns:
            List of MotivationalQuote objects or None if request failed
        """
        params = {}
        
        if category and category.lower() in [c.lower() for c in self.AVAILABLE_CATEGORIES]:
            params['category'] = category.lower()
        elif category:
            self._log_error("Invalid category", f"Category '{category}' not available. Use get_available_categories() to see valid options.")
            return None
            
        if 1 <= limit <= 100:
            params['limit'] = limit
        else:
            self._log_error("Invalid limit", "Limit must be between 1 and 100")
            return None
            
        data = await self._make_request("quotes", params)
        
        if not data or not isinstance(data, list):
            return None
            
        try:
            quotes = []
            for quote_data in data:
                quote = MotivationalQuote(
                    quote=quote_data.get('quote', ''),
                    author=quote_data.get('author', 'Unknown'),
                    category=quote_data.get('category', 'general')
                )
                quotes.append(quote)
            
            return quotes
            
        except Exception as e:
            self._log_error("Failed to parse quotes", str(e))
            return None

    async def get_random_quote(self) -> Optional[MotivationalQuote]:
        """
        Get a single random motivational quote
        
        Returns:
            MotivationalQuote object or None if request failed
        """
        quotes = await self.get_motivational_quote(limit=1)
        return quotes[0] if quotes else None

    async def get_quotes_by_category(self, category: str, limit: int = 10) -> Optional[List[MotivationalQuote]]:
        """
        Get multiple quotes from a specific category
        
        Args:
            category: Category name (see AVAILABLE_CATEGORIES)
            limit: Number of quotes to return (1-100)
            
        Returns:
            List of MotivationalQuote objects or None if request failed
        """
        return await self.get_motivational_quote(category=category, limit=limit)

    def get_available_categories(self) -> List[str]:
        """
        Get list of available quote categories
        
        Returns:
            List of available category names
        """
        return self.AVAILABLE_CATEGORIES.copy()

    async def search_quotes_by_author(self, author_keyword: str, limit: int = 10) -> Optional[List[MotivationalQuote]]:
        """
        Search for quotes by getting multiple random quotes and filtering by author
        Note: This is not efficient but API-Ninjas doesn't support direct author search
        
        Args:
            author_keyword: Keyword to search in author names (case-insensitive)
            limit: Maximum number of matching quotes to return
            
        Returns:
            List of MotivationalQuote objects matching the author keyword
        """
        # Get a larger batch to increase chances of finding matching authors
        all_quotes = await self.get_motivational_quote(limit=100)
        
        if not all_quotes:
            return None
            
        matching_quotes = []
        author_keyword_lower = author_keyword.lower()
        
        for quote in all_quotes:
            if author_keyword_lower in quote.author.lower():
                matching_quotes.append(quote)
                if len(matching_quotes) >= limit:
                    break
                    
        return matching_quotes if matching_quotes else None

    # Required abstract methods from MarketDataProvider - return None/empty for non-applicable methods
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """Stock quotes not supported - use get_motivational_quote() instead"""
        self._log_info("Stock quotes not supported. Use get_motivational_quote() for inspirational quotes.")
        return None

    async def get_earnings_calendar(
        self,
        symbol: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 50
    ) -> List[EarningsCalendar]:
        """Get earnings calendar events - not supported by API-Ninjas"""
        self._log_info(f"Earnings calendar not supported for {symbol}")
        return []
        
    async def get_earnings_transcript(
        self,
        symbol: str,
        year: int,
        quarter: int
    ) -> Optional[EarningsCallTranscript]:
        """Earnings transcripts not supported by API-Ninjas"""
        self._log_info(f"Earnings transcripts not supported for {symbol}")
        return None
        
    async def get_historical(
        self, 
        symbol: str, 
        start_date: date, 
        end_date: date,
        interval: str = "1d"
    ) -> Optional[List[HistoricalPrice]]:
        """Get historical prices - not supported by API-Ninjas"""
        self._log_info(f"Historical data not supported for {symbol}")
        return None
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> Optional[List[OptionQuote]]:
        """Get options chain - not supported by API-Ninjas"""
        self._log_info(f"Options chain not supported for {symbol}")
        return None
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get company information - not supported by API-Ninjas"""
        self._log_info(f"Company info not supported for {symbol}")
        return None
    
    async def get_economic_events(
        self,
        countries: Optional[List[str]] = None,
        importance: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 50
    ) -> List[EconomicEvent]:
        """Get economic calendar events - not supported by API-Ninjas"""
        self._log_info("Economic events not supported")
        return []
        
    async def get_news(
        self, 
        symbol: Optional[str] = None, 
        limit: int = 10
    ) -> Optional[List[Dict[str, Any]]]:
        """Get news - not supported by API-Ninjas"""
        self._log_info(f"News not supported for {symbol}")
        return None
    
    async def get_economic_data(
        self, 
        indicator: str
    ) -> Any:
        """Get economic data - not supported by API-Ninjas"""
        self._log_info(f"Economic data not supported for indicator {indicator}")
        return None

    def _parse_decimal(self, value: Any) -> Optional[Decimal]:
        """Helper to safely parse decimal values"""
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (ValueError, TypeError):
            return None