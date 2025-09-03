"""
MediaStack provider for financial news data.
Documentation: https://mediastack.com/documentation
"""

import logging
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import aiohttp
from decimal import Decimal

from ..base import MarketDataProvider, NewsArticle, MarketDataType

logger = logging.getLogger(__name__)


class MediaStackProvider(MarketDataProvider):
    """MediaStack provider for financial news."""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "mediastack")
        self.base_url = "http://api.mediastack.com/v1"
        self.rate_limit_delay = 0.2  # 200ms between requests
        
    def get_supported_data_types(self) -> List[MarketDataType]:
        """Return supported data types."""
        return [MarketDataType.NEWS]
    
    # Abstract method implementations (not supported by this provider)
    async def get_quote(self, symbol: str):
        """Not supported by MediaStack."""
        return None
    
    async def get_historical(self, symbol: str, start_date=None, end_date=None, interval="1d", **kwargs):
        """Not supported by MediaStack."""
        return []
    
    async def get_options_chain(self, symbol: str, expiration=None, **kwargs):
        """Not supported by MediaStack."""
        return []
    
    async def get_company_info(self, symbol: str):
        """Not supported by MediaStack."""
        return None
    
    async def get_economic_events(self, countries=None, importance=None, start_date=None, end_date=None, limit=50):
        """Not supported by MediaStack."""
        return []
    
    async def get_earnings_calendar(self, symbol=None, start_date=None, end_date=None, limit=10):
        """Not supported by MediaStack."""
        return []
    
    async def get_earnings_transcript(self, symbol: str, year: int, quarter: int):
        """Not supported by MediaStack."""
        return None
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any]) -> Optional[Dict]:
        """Make API request with error handling."""
        if not self.api_key:
            logger.warning("MediaStack API key not configured")
            return None
            
        url = f"{self.base_url}/{endpoint}"
        params['access_key'] = self.api_key
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if 'error' not in data:
                            return data
                        else:
                            logger.error(f"MediaStack error: {data['error'].get('message', 'Unknown error')}")
                            return None
                    elif response.status == 429:
                        logger.warning("MediaStack rate limit exceeded")
                        return None
                    else:
                        logger.error(f"MediaStack request failed: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"MediaStack request error: {e}")
            return None
    
    async def get_news(self, symbol: str, limit: int = 50) -> List[NewsArticle]:
        """Get news for a specific symbol."""
        try:
            # Search for news related to the symbol
            params = {
                'keywords': f'{symbol},stock,shares,company',
                'languages': 'en',
                'limit': min(limit, 100),  # MediaStack max is 100
                'sort': 'published_desc',
                'categories': 'business'
            }
            
            data = await self._make_request('news', params)
            if not data or 'data' not in data:
                return []
            
            articles = []
            for article_data in data['data']:
                try:
                    article = self._parse_article(article_data, symbol)
                    if article:
                        articles.append(article)
                except Exception as e:
                    logger.error(f"Error parsing MediaStack article: {e}")
                    continue
            
            logger.info(f"MediaStack: Retrieved {len(articles)} articles for {symbol}")
            return articles
            
        except Exception as e:
            logger.error(f"Error fetching news from MediaStack for {symbol}: {e}")
            return []
    
    async def get_general_news(self, limit: int = 50) -> List[NewsArticle]:
        """Get general financial/business news."""
        try:
            params = {
                'categories': 'business',
                'languages': 'en',
                'limit': min(limit, 100),
                'sort': 'published_desc',
                'countries': 'us'
            }
            
            data = await self._make_request('news', params)
            if not data or 'data' not in data:
                return []
            
            articles = []
            for article_data in data['data']:
                try:
                    article = self._parse_article(article_data)
                    if article:
                        articles.append(article)
                except Exception as e:
                    logger.error(f"Error parsing MediaStack general article: {e}")
                    continue
            
            logger.info(f"MediaStack: Retrieved {len(articles)} general news articles")
            return articles
            
        except Exception as e:
            logger.error(f"Error fetching general news from MediaStack: {e}")
            return []
    
    def _parse_article(self, article_data: Dict, symbol: str = None) -> Optional[NewsArticle]:
        """Parse article data into NewsArticle object."""
        try:
            title = article_data.get('title')
            if not title:
                return None
            
            # Parse published date
            published_date = None
            if article_data.get('published_at'):
                try:
                    published_date = datetime.fromisoformat(
                        article_data['published_at'].replace('Z', '+00:00')
                    )
                except:
                    pass
            
            # Extract content and description
            content = article_data.get('description')
            
            related_symbols = [symbol] if symbol else []
            
            return NewsArticle(
                title=title,
                content=content,
                summary=content,  # MediaStack uses description as main content
                url=article_data.get('url'),
                source=article_data.get('source'),
                author=article_data.get('author'),
                published_date=published_date,
                published_at=published_date,
                image_url=article_data.get('image'),
                related_symbols=related_symbols,
                provider=self.name,
                language=article_data.get('language', 'en'),
                category=article_data.get('category', 'business')
            )
            
        except Exception as e:
            logger.error(f"Error parsing MediaStack article: {e}")
            return None
