"""
News data fetching job.
Fetches financial news and market updates.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime, timedelta

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class NewsDataJob(BaseMarketDataJob):
    """Job for fetching and storing financial news."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch news data for given symbols and general market news."""
        try:
            logger.info(f"Fetching news for {len(symbols)} symbols")
            news_data = {}
            
            # Fetch symbol-specific news
            for symbol in symbols:
                try:
                    symbol_news = await self.orchestrator.get_news(symbol)
                    if symbol_news:
                        news_data[symbol] = symbol_news
                    await asyncio.sleep(0.5)
                except Exception as e:
                    logger.error(f"Failed to fetch news for {symbol}: {e}")
                    continue
            
            # Fetch general market news
            try:
                general_news = await self.orchestrator.get_general_news()
                if general_news:
                    news_data["MARKET"] = general_news
            except Exception as e:
                logger.error(f"Failed to fetch general news: {e}")
            
            return news_data
        except Exception as e:
            logger.error(f"Error fetching news: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store news data using database upsert function."""
        if not data:
            return True
        
        try:
            success_count = 0
            total_records = 0
            
            for symbol, news_list in data.items():
                if not isinstance(news_list, list):
                    continue
                
                for article in news_list:
                    try:
                        await self.db_service.execute_function(
                            "upsert_news_data",
                            p_symbol=symbol if symbol != "MARKET" else None,
                            p_headline=article.get('headline'),
                            p_summary=article.get('summary'),
                            p_source=article.get('source'),
                            p_published_date=article.get('published_date'),
                            p_url=article.get('url'),
                            p_sentiment_score=article.get('sentiment_score'),
                            p_data_provider=article.get('provider', 'unknown')
                        )
                        success_count += 1
                    except Exception as e:
                        logger.error(f"Failed to store news article: {e}")
                    
                    total_records += 1
            
            logger.info(f"Stored {success_count}/{total_records} news articles")
            return success_count == total_records
        except Exception as e:
            logger.error(f"Error storing news: {e}")
            return False
