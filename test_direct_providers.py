#!/usr/bin/env python3
"""
Direct test of news providers with real API keys.
This script tests individual providers directly to verify they work.
"""

import asyncio
import logging
import sys
import os
from pathlib import Path

# Add backend directory to Python path
backend_dir = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_dir))

from market_data.providers.newsapi import NewsAPIProvider
from market_data.providers.gnews import GNewsProvider
from market_data.providers.currents_api import CurrentsAPIProvider
from market_data.providers.mediastack import MediaStackProvider
from market_data.providers.newsapi_ai import NewsAPIAIProvider

async def test_provider(provider_class, provider_name, api_key_env):
    """Test a single news provider."""
    logger = logging.getLogger(__name__)
    
    api_key = os.getenv(api_key_env)
    if not api_key:
        logger.warning(f"⚠️  {provider_name}: No API key found for {api_key_env}")
        return None
    
    try:
        # Initialize provider
        provider = provider_class(api_key)
        logger.info(f"🔧 {provider_name}: Initialized successfully")
        
        # Test symbol-specific news
        logger.info(f"📊 {provider_name}: Testing symbol news for AAPL...")
        symbol_news = await provider.get_news("AAPL", limit=5)
        
        if symbol_news:
            logger.info(f"✅ {provider_name}: Retrieved {len(symbol_news)} articles for AAPL")
            # Show first article
            first_article = symbol_news[0]
            logger.info(f"   📰 Sample: {first_article.title[:60]}...")
            logger.info(f"   🔗 Source: {first_article.source}")
            logger.info(f"   📅 Published: {first_article.published_date or first_article.published_at}")
        else:
            logger.warning(f"⚠️  {provider_name}: No symbol news returned")
        
        # Test general news
        logger.info(f"🌐 {provider_name}: Testing general news...")
        general_news = await provider.get_general_news(limit=3)
        
        if general_news:
            logger.info(f"✅ {provider_name}: Retrieved {len(general_news)} general articles")
            # Show first article
            first_article = general_news[0]
            logger.info(f"   📰 Sample: {first_article.title[:60]}...")
        else:
            logger.warning(f"⚠️  {provider_name}: No general news returned")
        
        return {
            'provider': provider_name,
            'symbol_news_count': len(symbol_news) if symbol_news else 0,
            'general_news_count': len(general_news) if general_news else 0,
            'total_articles': (len(symbol_news) if symbol_news else 0) + (len(general_news) if general_news else 0)
        }
        
    except Exception as e:
        logger.error(f"❌ {provider_name}: Error - {e}")
        return None

async def test_all_providers():
    """Test all news providers."""
    
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    logger = logging.getLogger(__name__)
    logger.info("🚀 Starting direct provider tests")
    
    # Provider configurations
    providers_to_test = [
        (NewsAPIProvider, "NewsAPI.org", "NEWSAPI_KEY"),
        (GNewsProvider, "GNews", "GNEWS_API_KEY"),
        (CurrentsAPIProvider, "CurrentsAPI", "CURRENTS_API_KEY"),
        (MediaStackProvider, "MediaStack", "MEDIASTACK_API_KEY"),
        (NewsAPIAIProvider, "NewsAPI.ai", "NEWSAPI_AI_KEY")
    ]
    
    results = []
    
    for provider_class, provider_name, api_key_env in providers_to_test:
        logger.info(f"\n{'='*50}")
        logger.info(f"Testing {provider_name}")
        logger.info(f"{'='*50}")
        
        result = await test_provider(provider_class, provider_name, api_key_env)
        if result:
            results.append(result)
        
        # Small delay between providers
        await asyncio.sleep(1)
    
    # Summary
    logger.info(f"\n{'='*50}")
    logger.info("📊 TEST SUMMARY")
    logger.info(f"{'='*50}")
    
    if results:
        total_articles = sum(r['total_articles'] for r in results)
        working_providers = len(results)
        
        logger.info(f"✅ Working providers: {working_providers}/{len(providers_to_test)}")
        logger.info(f"📰 Total articles retrieved: {total_articles}")
        
        for result in results:
            logger.info(f"   • {result['provider']}: {result['total_articles']} articles")
            logger.info(f"     - Symbol news: {result['symbol_news_count']}")
            logger.info(f"     - General news: {result['general_news_count']}")
    else:
        logger.warning("⚠️  No providers worked. Please check your API keys:")
        for _, provider_name, api_key_env in providers_to_test:
            logger.warning(f"   - {api_key_env} (for {provider_name})")
    
    logger.info("\n💡 To set API keys, add them to your environment:")
    logger.info("   export NEWSAPI_KEY='your_key_here'")
    logger.info("   export GNEWS_API_KEY='your_key_here'")
    logger.info("   # etc...")
    
    logger.info("\n🎉 Direct provider test completed!")

if __name__ == "__main__":
    asyncio.run(test_all_providers())
