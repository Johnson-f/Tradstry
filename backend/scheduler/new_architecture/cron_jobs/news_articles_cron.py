"""
News articles cron job - fetches financial news and market-related articles.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor

logger = logging.getLogger(__name__)


class NewsArticlesCron:
    """Cron job for fetching news articles data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize news articles cron job."""
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.job_name = "news_articles"
    
    async def execute(self, symbols: Optional[List[str]] = None, categories: Optional[List[str]] = None) -> bool:
        """
        Execute news articles data fetching and processing.
        
        Args:
            symbols: List of stock symbols to fetch news for. If None, uses general market news.
            categories: List of news categories. If None, uses default categories.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job")
            
            # Use default categories if none provided
            if not categories:
                categories = self._get_default_categories()
            
            # Use default symbols if none provided (for company-specific news)
            if not symbols:
                symbols = self._get_default_symbols()
            
            logger.info(f"Fetching news for {len(symbols)} symbols and {len(categories)} categories")
            
            # Fetch general market news
            general_news_result = await self.market_data_brain.get_market_news(categories)
            
            # Fetch company-specific news
            company_news_result = await self.market_data_brain.get_company_news(symbols)
            
            # Combine results
            combined_data = {}
            if general_news_result.success:
                combined_data["general_news"] = general_news_result.data
            if company_news_result.success:
                combined_data["company_news"] = company_news_result.data
            
            if not combined_data:
                logger.error("❌ Failed to fetch any news data")
                return False
            
            # Process and store data
            raw_data = {
                "data_type": "news_articles",
                "data": combined_data,
                "provider": general_news_result.provider if general_news_result.success else company_news_result.provider,
                "timestamp": start_time.isoformat(),
                "categories": categories,
                "symbols": symbols
            }
            
            success = await self.data_processor.process_news_articles(raw_data)
            
            if success:
                execution_time = (datetime.now() - start_time).total_seconds()
                logger.info(f"✅ {self.job_name} completed successfully in {execution_time:.2f}s")
                return True
            else:
                logger.error(f"❌ {self.job_name} processing failed")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in {self.job_name} cron job: {e}")
            return False
    
    def _get_default_categories(self) -> List[str]:
        """Get default list of news categories."""
        return [
            "market_news",
            "earnings",
            "mergers_acquisitions",
            "ipo",
            "economic_policy",
            "federal_reserve",
            "cryptocurrency",
            "commodities",
            "technology",
            "healthcare"
        ]
    
    def _get_default_symbols(self) -> List[str]:
        """Get default list of symbols for company news."""
        return [
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "NFLX",
            "JPM", "BAC", "BRK.B", "JNJ", "V", "PG", "UNH", "HD", "MA", "XOM"
        ]
