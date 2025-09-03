#!/usr/bin/env python3
"""
Test script for the news job to fetch real data from providers and save to database.
"""

import asyncio
import logging
import sys
import os
from pathlib import Path

# Add backend directory to Python path
backend_dir = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_dir))

from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig
from scheduler.jobs.news_job import NewsDataJob

# Mock database service for testing
class MockDatabaseService:
    """Mock database service for testing purposes."""
    
    def __init__(self):
        self.stored_articles = []
    
    async def execute_function(self, function_name: str, **kwargs):
        """Mock database function execution."""
        if function_name == "upsert_news_article":
            article_data = {
                'title': kwargs.get('p_title'),
                'published_at': kwargs.get('p_published_at'),
                'provider': kwargs.get('p_data_provider'),
                'summary': kwargs.get('p_summary'),
                'content': kwargs.get('p_content'),
                'url': kwargs.get('p_url'),
                'source': kwargs.get('p_source'),
                'author': kwargs.get('p_author'),
                'category': kwargs.get('p_category'),
                'sentiment': kwargs.get('p_sentiment'),
                'relevance_score': kwargs.get('p_relevance_score'),
                'language': kwargs.get('p_language'),
                'word_count': kwargs.get('p_word_count')
            }
            self.stored_articles.append(article_data)
            logging.info(f"📝 Stored article: {article_data['title'][:50]}...")
            return True
        return True
    
    def get_stored_count(self):
        """Get count of stored articles."""
        return len(self.stored_articles)
    
    def get_providers_used(self):
        """Get list of providers that provided data."""
        providers = set()
        for article in self.stored_articles:
            if article['provider']:
                # Handle combined providers (e.g., "newsapi+gnews")
                for provider in article['provider'].split('+'):
                    providers.add(provider.strip())
        return list(providers)


async def test_news_job():
    """Test the news job with real providers."""
    
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    logger = logging.getLogger(__name__)
    logger.info("🚀 Starting news job test")
    
    # Set some test API keys if not already set
    test_keys = {
        'NEWSAPI_KEY': 'test_newsapi_key',
        'GNEWS_API_KEY': 'test_gnews_key',
        'CURRENTS_API_KEY': 'test_currents_key',
        'MEDIASTACK_API_KEY': 'test_mediastack_key',
        'NEWSAPI_AI_KEY': 'test_newsapi_ai_key'
    }
    
    for key, value in test_keys.items():
        if not os.getenv(key):
            os.environ[key] = value
            logger.info(f"🔑 Set test API key for {key}")
    
    try:
        # Initialize market data brain
        config = MarketDataConfig.from_env()
        brain = MarketDataBrain(config)
        
        # Check which providers are available
        available_providers = brain.get_available_providers()
        logger.info(f"📡 Available providers: {available_providers}")
        
        # Show which news providers are initialized
        news_providers = [name for name in brain.providers.keys() if name in ['newsapi', 'newsapi_ai', 'currents_api', 'mediastack', 'gnews']]
        logger.info(f"📰 News providers initialized: {news_providers}")
        
        if not news_providers:
            logger.warning("⚠️  No news providers available. Testing with existing providers that may have limited news support.")
            logger.info("💡 To use the new news providers, set these API keys:")
            logger.info("   - NEWSAPI_KEY (for newsapi.org)")
            logger.info("   - NEWSAPI_AI_KEY (for newsapi.ai)") 
            logger.info("   - CURRENTS_API_KEY (for currentsapi.services)")
            logger.info("   - MEDIASTACK_API_KEY (for mediastack.com)")
            logger.info("   - GNEWS_API_KEY (for gnews.io)")
        
        if not available_providers:
            logger.error("❌ No providers available at all")
            return
        
        # Initialize mock database service
        db_service = MockDatabaseService()
        
        # Initialize news job
        news_job = NewsDataJob(
            database_service=db_service,
            market_data_orchestrator=brain
        )
        
        # Test symbols - popular stocks for news
        test_symbols = ["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL"]
        logger.info(f"📊 Testing with symbols: {test_symbols}")
        
        # Fetch news data
        logger.info("🔍 Fetching news data...")
        news_data = await news_job.fetch_data(test_symbols)
        
        if not news_data:
            logger.error("❌ No news data fetched")
            return
        
        logger.info(f"✅ Fetched news data for {len(news_data)} symbols/categories")
        
        # Store the data
        logger.info("💾 Storing news data to database...")
        success = await news_job.store_data(news_data)
        
        if success:
            logger.info("✅ News data stored successfully")
        else:
            logger.warning("⚠️  Some issues occurred during storage")
        
        # Print summary
        stored_count = db_service.get_stored_count()
        providers_used = db_service.get_providers_used()
        
        logger.info("📈 TEST SUMMARY:")
        logger.info(f"   • Articles stored: {stored_count}")
        logger.info(f"   • Providers used: {providers_used}")
        logger.info(f"   • Symbols processed: {len(news_data)}")
        
        # Show sample articles
        if db_service.stored_articles:
            logger.info("📰 Sample articles:")
            for i, article in enumerate(db_service.stored_articles[:3]):
                logger.info(f"   {i+1}. {article['title'][:60]}...")
                logger.info(f"      Provider: {article['provider']}")
                logger.info(f"      Source: {article['source']}")
        
        logger.info("🎉 News job test completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Error during news job test: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Clean up
        await brain.close()


if __name__ == "__main__":
    asyncio.run(test_news_job())
