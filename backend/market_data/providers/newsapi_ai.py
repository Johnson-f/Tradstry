"""
NewsAPI.ai provider for financial news data.
Documentation: https://www.newsapi.ai/documentation
"""

import logging
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import aiohttp
from decimal import Decimal

from ..base import MarketDataProvider, NewsArticle, MarketDataType

logger = logging.getLogger(__name__)


class NewsAPIAIProvider(MarketDataProvider):
    """NewsAPI.ai provider for financial news."""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "newsapi_ai")
        self.base_url = "https://newsapi.ai/api/v1"
        self.rate_limit_delay = 0.2  # 200ms between requests
        
    def get_supported_data_types(self) -> List[MarketDataType]:
        """Return supported data types."""
        return [MarketDataType.NEWS]
    
    # Abstract method implementations (not supported by this provider)
    async def get_quote(self, symbol: str):
        """Not supported by NewsAPI.ai."""
        return None
    
    async def get_historical(self, symbol: str, start_date=None, end_date=None, interval="1d", **kwargs):
        """Not supported by NewsAPI.ai."""
        return []
    
    async def get_options_chain(self, symbol: str, expiration=None, **kwargs):
        """Not supported by NewsAPI.ai."""
        return []
    
    async def get_company_info(self, symbol: str):
        """Not supported by NewsAPI.ai."""
        return None
    
    async def get_economic_events(self, countries=None, importance=None, start_date=None, end_date=None, limit=50):
        """Not supported by NewsAPI.ai."""
        return []
    
    async def get_earnings_calendar(self, symbol=None, start_date=None, end_date=None, limit=10):
        """Not supported by NewsAPI.ai."""
        return []
    
    async def get_earnings_transcript(self, symbol: str, year: int, quarter: int):
        """Not supported by NewsAPI.ai."""
        return None
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any]) -> Optional[Dict]:
        """Make API request with error handling."""
        if not self.api_key:
            logger.warning("NewsAPI.ai key not configured")
            return None
            
        url = f"{self.base_url}/{endpoint}"
        params['apiKey'] = self.api_key
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data
                    elif response.status == 429:
                        logger.warning("NewsAPI.ai rate limit exceeded")
                        return None
                    else:
                        logger.error(f"NewsAPI.ai request failed: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"NewsAPI.ai request error: {e}")
            return None
    
    async def get_news(self, symbol: str, limit: int = 50) -> List[NewsArticle]:
        """Get news for a specific symbol."""
        try:
            # Search for articles related to the symbol
            params = {
                'action': 'getArticles',
                'keyword': f'"{symbol}" stock OR "{symbol}" shares OR "{symbol}" company',
                'articlesPage': 1,
                'articlesCount': min(limit, 100),
                'articlesSortBy': 'date',
                'articlesArticleBodyLen': 300,
                'resultType': 'articles',
                'lang': 'eng',
                'sourceLocationUri': 'http://en.wikipedia.org/wiki/United_States'
            }
            
            data = await self._make_request('article/getArticles', params)
            if not data or 'articles' not in data:
                return []
            
            articles = []
            for article_data in data['articles']['results']:
                try:
                    article = self._parse_article(article_data, symbol)
                    if article:
                        articles.append(article)
                except Exception as e:
                    logger.error(f"Error parsing NewsAPI.ai article: {e}")
                    continue
            
            logger.info(f"NewsAPI.ai: Retrieved {len(articles)} articles for {symbol}")
            return articles
            
        except Exception as e:
            logger.error(f"Error fetching news from NewsAPI.ai for {symbol}: {e}")
            return []
    
    async def get_general_news(self, limit: int = 50) -> List[NewsArticle]:
        """Get general financial/business news."""
        try:
            params = {
                'action': 'getArticles',
                'categoryUri': 'news/Business',
                'articlesPage': 1,
                'articlesCount': min(limit, 100),
                'articlesSortBy': 'date',
                'articlesArticleBodyLen': 300,
                'resultType': 'articles',
                'lang': 'eng',
                'sourceLocationUri': 'http://en.wikipedia.org/wiki/United_States'
            }
            
            data = await self._make_request('article/getArticles', params)
            if not data or 'articles' not in data:
                return []
            
            articles = []
            for article_data in data['articles']['results']:
                try:
                    article = self._parse_article(article_data)
                    if article:
                        articles.append(article)
                except Exception as e:
                    logger.error(f"Error parsing NewsAPI.ai general article: {e}")
                    continue
            
            logger.info(f"NewsAPI.ai: Retrieved {len(articles)} general news articles")
            return articles
            
        except Exception as e:
            logger.error(f"Error fetching general news from NewsAPI.ai: {e}")
            return []
    
    def _parse_article(self, article_data: Dict, symbol: str = None) -> Optional[NewsArticle]:
        """Parse article data into NewsArticle object."""
        try:
            title = article_data.get('title')
            if not title:
                return None
            
            # Parse published date
            published_date = None
            if article_data.get('dateTime'):
                try:
                    published_date = datetime.fromisoformat(
                        article_data['dateTime'].replace('Z', '+00:00')
                    )
                except:
                    pass
            
            # Extract content and summary
            content = article_data.get('body')
            summary = article_data.get('summary')
            
            # Get source information
            source_info = article_data.get('source', {})
            source_name = source_info.get('title') or source_info.get('uri')
            
            # Extract sentiment if available
            sentiment = None
            sentiment_confidence = None
            if 'sentiment' in article_data:
                sentiment = article_data['sentiment']
                sentiment_confidence = article_data.get('sentimentConfidence')
            
            # Get relevance score if available
            relevance_score = article_data.get('relevance')
            
            related_symbols = [symbol] if symbol else []
            
            return NewsArticle(
                title=title,
                content=content,
                summary=summary,
                url=article_data.get('url'),
                source=source_name,
                author=article_data.get('authors', [{}])[0].get('name') if article_data.get('authors') else None,
                published_date=published_date,
                published_at=published_date,
                image_url=article_data.get('image'),
                related_symbols=related_symbols,
                provider=self.name,
                language=article_data.get('lang', 'en'),
                category='business',
                sentiment=sentiment,
                sentiment_confidence=sentiment_confidence,
                relevance_score=relevance_score,
                word_count=len(content.split()) if content else None
            )
            
        except Exception as e:
            logger.error(f"Error parsing NewsAPI.ai article: {e}")
            return None
