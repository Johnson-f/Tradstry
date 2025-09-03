"""
NewsAPI.org provider for financial news data.
Documentation: https://newsapi.org/docs
"""

import logging
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import aiohttp
from decimal import Decimal

from ..base import MarketDataProvider, NewsArticle, MarketDataType

logger = logging.getLogger(__name__)


class NewsAPIProvider(MarketDataProvider):
    """NewsAPI.org provider for financial news."""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "newsapi")
        self.base_url = "https://newsapi.org/v2"
        self.rate_limit_delay = 0.1  # 100ms between requests
        
    def get_supported_data_types(self) -> List[MarketDataType]:
        """Return supported data types."""
        return [MarketDataType.NEWS]
    
    # Abstract method implementations (not supported by this provider)
    async def get_quote(self, symbol: str):
        """Not supported by NewsAPI."""
        return None
    
    async def get_historical(self, symbol: str, start_date=None, end_date=None, interval="1d", **kwargs):
        """Not supported by NewsAPI."""
        return []
    
    async def get_options_chain(self, symbol: str, expiration=None, **kwargs):
        """Not supported by NewsAPI."""
        return []
    
    async def get_company_info(self, symbol: str):
        """Not supported by NewsAPI."""
        return None
    
    async def get_economic_events(self, countries=None, importance=None, start_date=None, end_date=None, limit=50):
        """Not supported by NewsAPI."""
        return []
    
    async def get_earnings_calendar(self, symbol=None, start_date=None, end_date=None, limit=10):
        """Not supported by NewsAPI."""
        return []
    
    async def get_earnings_transcript(self, symbol: str, year: int, quarter: int):
        """Not supported by NewsAPI."""
        return None
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any]) -> Optional[Dict]:
        """Make API request with error handling."""
        if not self.api_key:
            logger.warning("NewsAPI key not configured")
            return None
            
        url = f"{self.base_url}/{endpoint}"
        params['apiKey'] = self.api_key
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get('status') == 'ok':
                            return data
                        else:
                            logger.error(f"NewsAPI error: {data.get('message', 'Unknown error')}")
                            return None
                    elif response.status == 429:
                        logger.warning("NewsAPI rate limit exceeded")
                        return None
                    else:
                        logger.error(f"NewsAPI request failed: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"NewsAPI request error: {e}")
            return None
    
    async def get_news(self, symbol: str, limit: int = 50) -> List[NewsArticle]:
        """Get news for a specific symbol."""
        try:
            # Search for news related to the symbol
            params = {
                'q': f'"{symbol}" OR "{symbol.replace(".", " ")}" stock OR shares',
                'language': 'en',
                'sortBy': 'publishedAt',
                'pageSize': min(limit, 100),  # NewsAPI max is 100
                'domains': 'reuters.com,bloomberg.com,cnbc.com,marketwatch.com,yahoo.com,wsj.com,ft.com'
            }
            
            data = await self._make_request('everything', params)
            if not data or 'articles' not in data:
                return []
            
            articles = []
            for article_data in data['articles']:
                try:
                    article = self._parse_article(article_data, symbol)
                    if article:
                        articles.append(article)
                except Exception as e:
                    logger.error(f"Error parsing NewsAPI article: {e}")
                    continue
            
            logger.info(f"NewsAPI: Retrieved {len(articles)} articles for {symbol}")
            return articles
            
        except Exception as e:
            logger.error(f"Error fetching news from NewsAPI for {symbol}: {e}")
            return []
    
    async def get_general_news(self, limit: int = 50) -> List[NewsArticle]:
        """Get general financial/business news."""
        try:
            params = {
                'category': 'business',
                'language': 'en',
                'sortBy': 'publishedAt',
                'pageSize': min(limit, 100),
                'country': 'us'
            }
            
            data = await self._make_request('top-headlines', params)
            if not data or 'articles' not in data:
                return []
            
            articles = []
            for article_data in data['articles']:
                try:
                    article = self._parse_article(article_data)
                    if article:
                        articles.append(article)
                except Exception as e:
                    logger.error(f"Error parsing NewsAPI general article: {e}")
                    continue
            
            logger.info(f"NewsAPI: Retrieved {len(articles)} general news articles")
            return articles
            
        except Exception as e:
            logger.error(f"Error fetching general news from NewsAPI: {e}")
            return []
    
    def _parse_article(self, article_data: Dict, symbol: str = None) -> Optional[NewsArticle]:
        """Parse article data into NewsArticle object."""
        try:
            title = article_data.get('title')
            if not title or title == '[Removed]':
                return None
            
            # Parse published date
            published_date = None
            if article_data.get('publishedAt'):
                try:
                    published_date = datetime.fromisoformat(
                        article_data['publishedAt'].replace('Z', '+00:00')
                    )
                except:
                    pass
            
            # Extract content
            content = article_data.get('content') or article_data.get('description')
            if content and content.endswith('[+'):
                # Remove truncation indicator
                content = content.rsplit('[+', 1)[0].strip()
            
            related_symbols = [symbol] if symbol else []
            
            return NewsArticle(
                title=title,
                content=content,
                summary=article_data.get('description'),
                url=article_data.get('url'),
                source=article_data.get('source', {}).get('name'),
                author=article_data.get('author'),
                published_date=published_date,
                published_at=published_date,
                image_url=article_data.get('urlToImage'),
                related_symbols=related_symbols,
                provider=self.name,
                language='en',
                category='business'
            )
            
        except Exception as e:
            logger.error(f"Error parsing NewsAPI article: {e}")
            return None
