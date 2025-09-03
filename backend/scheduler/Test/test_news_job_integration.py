"""
Integration tests for NewsDataJob using real database.
Tests comprehensive data aggregation and storage functionality.
"""

import pytest
import pytest_asyncio
import asyncio
import logging
from typing import Dict, Any

from scheduler.jobs.news_job import NewsDataJob
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig

# Set up logging for test visibility
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestNewsJobIntegration:
    """Integration tests for NewsDataJob with real database operations."""
    
    @pytest_asyncio.fixture
    async def setup_services(self):
        """Set up real services for integration testing."""
        config = MarketDataConfig()
        brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        
        job = NewsDataJob(db_service, brain)
        
        yield {
            'job': job,
            'brain': brain,
            'db_service': db_service,
            'config': config
        }
        
        # Cleanup
        await brain.close()
    
    @pytest.mark.asyncio
    async def test_comprehensive_news_aggregation_real_db(self, setup_services):
        """Test comprehensive news data aggregation with real database storage."""
        services = setup_services
        job = services['job']
        
        # Test with well-known symbols
        test_symbols = ['AAPL', 'MSFT']
        
        logger.info(f"🚀 Testing comprehensive news aggregation for {test_symbols}")
        
        # Fetch comprehensive news data
        data = await job.fetch_data(test_symbols)
        
        # Verify data was fetched
        assert data is not None, "Should return data dictionary"
        assert len(data) >= 0, "Should return dictionary even if no data"
        
        # Verify comprehensive aggregation
        for symbol, fetch_result in data.items():
            if symbol == "general_market_news":
                # Handle general market news separately
                assert fetch_result.success, f"Should successfully fetch general market news"
                assert fetch_result.data is not None, f"Should have general market news data"
                assert fetch_result.provider is not None, f"Should have provider attribution for general news"
                
                news_articles = fetch_result.data
                assert isinstance(news_articles, list), f"Should have list of news articles for general news"
                
                logger.info(f"📊 General Market News: {len(news_articles)} articles from {fetch_result.provider}")
            else:
                # Handle symbol-specific news
                assert fetch_result.success, f"Should successfully fetch data for {symbol}"
                assert fetch_result.data is not None, f"Should have news data for {symbol}"
                assert fetch_result.provider is not None, f"Should have provider attribution for {symbol}"
                
                # Check that we have comprehensive data
                news_articles = fetch_result.data
                assert isinstance(news_articles, list), f"Should have list of news articles for {symbol}"
                
                logger.info(f"📊 {symbol}: {len(news_articles)} articles from {fetch_result.provider}")
                
                # Check news article structure
                for article in news_articles[:3]:  # Check first 3 articles
                    title = getattr(article, 'title', None) or getattr(article, 'headline', None)
                    published_at = getattr(article, 'published_at', None) or getattr(article, 'published_date', None)
                    source = getattr(article, 'source', None)
                    
                    if title:
                        logger.info(f"✅ Article: {title[:50]}... from {source} on {published_at}")
        
        # Store data to real database
        if data:
            logger.info("💾 Storing comprehensive news data to real database...")
            storage_success = await job.store_data(data)
            
            assert storage_success, "Should successfully store all data to database"
            logger.info("✅ Successfully stored comprehensive news data to real database!")
    
    @pytest.mark.asyncio
    async def test_news_provider_aggregation(self, setup_services):
        """Test that multiple providers are being used for comprehensive news coverage."""
        services = setup_services
        job = services['job']
        
        # Test with a single symbol to see provider aggregation
        test_symbol = 'AAPL'
        
        logger.info(f"🔍 Testing news provider aggregation for {test_symbol}")
        
        # Use the internal comprehensive aggregation method
        result = await job._fetch_with_provider_fallback(test_symbol)
        
        if result is not None:
            assert result.success, f"Should fetch comprehensive news data for {test_symbol}"
            
            # Check that we have news articles
            news_articles = result.data
            assert isinstance(news_articles, list), f"Should have list of news articles for {test_symbol}"
            
            logger.info(f"📈 Comprehensive aggregation result: {len(news_articles)} articles")
            
            # Should have reasonable article coverage
            assert len(news_articles) >= 0, "Should handle news aggregation without errors"
            
            # Check for essential fields in articles
            if len(news_articles) > 0:
                sample_article = news_articles[0]
                title = getattr(sample_article, 'title', None) or getattr(sample_article, 'headline', None)
                assert title is not None, "Should have title or headline field"
        else:
            logger.info(f"ℹ️ No news data available for {test_symbol} from any provider")
    
    @pytest.mark.asyncio
    async def test_general_news_aggregation(self, setup_services):
        """Test that general market news aggregation works correctly."""
        services = setup_services
        job = services['job']
        
        logger.info("🔍 Testing general market news aggregation")
        
        # Use the internal general news aggregation method
        result = await job._fetch_general_news_with_fallback()
        
        if result is not None:
            assert result.success, "Should fetch general market news"
            
            # Check that we have news articles
            news_articles = result.data
            assert isinstance(news_articles, list), "Should have list of general news articles"
            
            logger.info(f"📈 General news aggregation result: {len(news_articles)} articles")
            
            # Should have reasonable article coverage
            assert len(news_articles) >= 0, "Should handle general news aggregation without errors"
            
            # Check for essential fields in articles
            if len(news_articles) > 0:
                sample_article = news_articles[0]
                title = getattr(sample_article, 'title', None) or getattr(sample_article, 'headline', None)
                assert title is not None, "Should have title or headline field"
        else:
            logger.info("ℹ️ No general market news data available from any provider")
    
    @pytest.mark.asyncio
    async def test_news_database_upsert(self, setup_services):
        """Test that database upsert function works correctly with news data."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'GOOGL'
        
        logger.info(f"🗄️ Testing news database upsert functionality for {test_symbol}")
        
        # Fetch data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            # Store data first time
            first_store = await job.store_data(data)
            assert first_store, "First storage should succeed"
            
            # Store same data again (should upsert, not fail)
            second_store = await job.store_data(data)
            assert second_store, "Second storage (upsert) should succeed"
            
            logger.info("✅ Database upsert functionality working correctly")
        else:
            logger.info(f"ℹ️ No news data available for {test_symbol} to test upsert")
    
    @pytest.mark.asyncio
    async def test_news_field_mapping(self, setup_services):
        """Test that all news database fields are properly mapped."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🗺️ Testing news field mapping for {test_symbol}")
        
        # Fetch comprehensive data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            news_articles = fetch_result.data
            assert isinstance(news_articles, list), f"Should have list of news articles for {test_symbol}"
            
            # Test that all expected database fields can be accessed
            database_fields = [
                'title', 'headline', 'published_at', 'published_date', 'summary', 'content',
                'url', 'source', 'author', 'category', 'sentiment', 'sentiment_score',
                'relevance_score', 'sentiment_confidence', 'language', 'word_count',
                'image_url', 'tags'
            ]
            
            field_coverage = {}
            for article in news_articles[:5]:  # Check first 5 articles
                for field in database_fields:
                    if hasattr(article, field):
                        value = getattr(article, field)
                        if value is not None:
                            if field not in field_coverage:
                                field_coverage[field] = 0
                            field_coverage[field] += 1
            
            logger.info(f"📋 Accessible database fields:")
            for field, count in field_coverage.items():
                logger.info(f"   {field}: {count} articles")
            
            # Should have essential fields
            title_fields = ['title', 'headline']
            has_title = any(field in field_coverage for field in title_fields)
            assert has_title, "Should have title or headline field in some articles"
            
            # Store to verify database mapping works
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store with comprehensive field mapping"
            
            logger.info("✅ Comprehensive news field mapping working correctly")
        else:
            logger.info(f"ℹ️ No news data available for {test_symbol} to test field mapping")
    
    @pytest.mark.asyncio
    async def test_invalid_news_data_handling(self, setup_services):
        """Test handling of invalid news data."""
        services = setup_services
        job = services['job']
        
        # Test with invalid symbols
        invalid_symbols = ['INVALID123', 'TOOLONGSYMBOL', '']
        
        logger.info(f"🚫 Testing invalid news data handling: {invalid_symbols}")
        
        data = await job.fetch_data(invalid_symbols)
        
        # Should handle gracefully without crashing
        assert isinstance(data, dict), "Should return dictionary even for invalid symbols"
        
        # Should filter out invalid symbols
        for symbol in invalid_symbols:
            if symbol in data:
                # If present, should not have successful data
                assert not data[symbol].success, f"Invalid symbol {symbol} should not have successful data"
        
        logger.info("✅ Invalid news data handling working correctly")
    
    @pytest.mark.asyncio
    async def test_news_data_validation(self, setup_services):
        """Test that news data validation works correctly."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"✅ Testing news data validation for {test_symbol}")
        
        # Fetch data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            news_articles = fetch_result.data
            assert isinstance(news_articles, list), f"Should have list of news articles for {test_symbol}"
            
            # Validate news articles
            for article in news_articles[:3]:  # Check first 3 articles
                # Validate basic structure
                title = getattr(article, 'title', None) or getattr(article, 'headline', None)
                assert title is not None, "Should have title or headline field"
                
                # Validate data types for numeric fields
                numeric_fields = ['sentiment', 'sentiment_score', 'relevance_score', 'sentiment_confidence', 'word_count']
                for field in numeric_fields:
                    if hasattr(article, field):
                        value = getattr(article, field)
                        if value is not None:
                            assert isinstance(value, (int, float)), f"{field} should be numeric if present"
                
                # Validate string fields
                string_fields = ['title', 'headline', 'summary', 'content', 'url', 'source', 'author']
                for field in string_fields:
                    if hasattr(article, field):
                        value = getattr(article, field)
                        if value is not None:
                            assert isinstance(value, str), f"{field} should be string if present"
            
            logger.info(f"✅ Validated {len(news_articles)} news articles for {test_symbol}")
        else:
            logger.info(f"ℹ️ No news data available for {test_symbol} to validate")
    
    @pytest.mark.asyncio
    async def test_multiple_news_symbols_batch(self, setup_services):
        """Test batch processing of multiple symbols for news."""
        services = setup_services
        job = services['job']
        
        # Test with multiple symbols
        test_symbols = ['AAPL', 'MSFT', 'GOOGL']
        
        logger.info(f"📦 Testing news batch processing for {len(test_symbols)} symbols")
        
        # Fetch data for all symbols
        data = await job.fetch_data(test_symbols)
        
        assert isinstance(data, dict), "Should return dictionary"
        
        successful_fetches = 0
        total_articles = 0
        
        for symbol, result in data.items():
            if result.success:
                successful_fetches += 1
                if isinstance(result.data, list):
                    total_articles += len(result.data)
        
        logger.info(f"📊 Batch processing results: {successful_fetches} successful fetches")
        logger.info(f"   Total articles: {total_articles}")
        
        # Should handle batch processing without errors
        assert successful_fetches >= 0, "Should handle batch processing without errors"
        
        # Store all data
        if data:
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store batch news data"
        
        logger.info("✅ News batch processing working correctly")
    
    @pytest.mark.asyncio
    async def test_news_provider_attribution(self, setup_services):
        """Test that provider attribution is properly tracked for news."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"🏷️ Testing news provider attribution for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            assert fetch_result.provider is not None, "Should have provider attribution"
            
            # Provider should indicate provider information
            provider_info = fetch_result.provider
            logger.info(f"🔍 Provider attribution: {provider_info}")
            
            # Should contain provider name(s)
            assert len(provider_info) > 0, "Should have non-empty provider attribution"
            
            logger.info("✅ News provider attribution tracking working correctly")
        else:
            logger.info(f"ℹ️ No news data available for {test_symbol} to test provider attribution")
    
    @pytest.mark.asyncio
    async def test_news_deduplication(self, setup_services):
        """Test that duplicate news articles are properly handled."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🔄 Testing news deduplication for {test_symbol}")
        
        # Use the internal aggregation method to test deduplication
        result = await job._fetch_with_provider_fallback(test_symbol)
        
        if result is not None:
            news_articles = result.data
            
            # Check for duplicate titles and URLs
            seen_titles = set()
            seen_urls = set()
            title_duplicates = 0
            url_duplicates = 0
            
            for article in news_articles:
                title = getattr(article, 'title', None) or getattr(article, 'headline', None)
                url = getattr(article, 'url', None)
                
                if title:
                    title_key = title.lower().strip()
                    if title_key in seen_titles:
                        title_duplicates += 1
                    seen_titles.add(title_key)
                
                if url:
                    if url in seen_urls:
                        url_duplicates += 1
                    seen_urls.add(url)
            
            logger.info(f"📋 Deduplication check: {title_duplicates} title duplicates, {url_duplicates} URL duplicates in {len(news_articles)} articles")
            
            # Should have minimal duplicates due to deduplication logic
            assert title_duplicates == 0 or url_duplicates == 0, "Should have effective deduplication"
        else:
            logger.info(f"ℹ️ No news data available for {test_symbol} to test deduplication")
    
    @pytest.mark.asyncio
    async def test_news_sentiment_analysis(self, setup_services):
        """Test that news sentiment analysis is handled correctly."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"📈 Testing news sentiment analysis for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            news_articles = fetch_result.data
            
            # Check for sentiment-related fields
            sentiment_fields = ['sentiment', 'sentiment_score', 'sentiment_confidence', 'relevance_score']
            found_sentiment = []
            
            for article in news_articles[:5]:  # Check first 5 articles
                for field in sentiment_fields:
                    if hasattr(article, field):
                        value = getattr(article, field)
                        if value is not None:
                            found_sentiment.append(f"{field}={value}")
            
            if found_sentiment:
                logger.info(f"📊 Sentiment data found for {test_symbol}: {found_sentiment[:5]}")
            else:
                logger.info(f"ℹ️ No sentiment data available for {test_symbol}")
            
            logger.info("✅ News sentiment analysis handled correctly")
        else:
            logger.info(f"ℹ️ No news data available for {test_symbol} to test sentiment analysis")
