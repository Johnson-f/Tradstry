"""
News data fetching job.
Fetches financial news and market updates.
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain
from scheduler.data_fetch_tracker import DataType, DataFetchTracker
from scheduler.enhanced_provider_manager import EnhancedProviderManager, FetchStrategy


logger = logging.getLogger(__name__)


class NewsDataJob(BaseMarketDataJob):
    """Job for fetching and storing financial news."""
    
    def __init__(
        self, 
        database_service, 
        market_data_orchestrator: MarketDataBrain,
        data_tracker: DataFetchTracker = None,
        provider_manager: EnhancedProviderManager = None
    ):
        """Initialize with database service and market data orchestrator."""
        super().__init__(database_service, data_tracker, provider_manager)
        self.orchestrator = market_data_orchestrator
    
    def _get_data_type(self) -> DataType:
        """Get the data type for this job."""
        return DataType.NEWS
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch news data for given symbols and general market news with provider fallback."""
        try:
            logger.info(f"Fetching news for {len(symbols)} symbols")
            
            # Use enhanced tracking with fallback chain if available
            if self.enable_enhanced_tracking:
                logger.info("Using enhanced tracking with fallback chain strategy")
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=symbols,
                    fetch_method='get_news',
                    strategy=FetchStrategy.FALLBACK_CHAIN
                )
            
            # Fallback to original implementation with enhanced provider fallback
            logger.info("Using basic fetch with provider fallback")
            news_data = {}
            
            # Fetch symbol-specific news with provider fallback
            for symbol in symbols:
                try:
                    merged_news = await self._fetch_with_provider_fallback(symbol)
                    if merged_news:
                        news_data[symbol] = merged_news
                        logger.info(f"Successfully fetched news for {symbol}")
                    else:
                        logger.warning(f"No valid news data returned for {symbol}")
                    
                    await asyncio.sleep(0.1)  # Rate limiting
                    
                except Exception as e:
                    logger.error(f"Failed to fetch news for {symbol}: {e}")
                    continue
            
            # Fetch general market news with provider fallback
            try:
                general_news = await self._fetch_general_news_with_fallback()
                if general_news:
                    news_data["general_market_news"] = general_news
                    logger.info("Successfully fetched general market news")
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
            valid_symbols = 0
            
            for symbol, fetch_result in data.items():
                try:
                    # Extract news data from FetchResult
                    if not fetch_result.success or not fetch_result.data:
                        logger.warning(f"No valid news data for {symbol}")
                        continue
                    
                    valid_symbols += 1
                    news_list = fetch_result.data
                    provider = fetch_result.provider
                    
                    # Handle both list and single object responses
                    if not isinstance(news_list, list):
                        news_list = [news_list] if news_list else []
                    
                    # Helper function to safely convert values
                    def safe_convert(value, convert_func, default=None):
                        if value is None or value == '':
                            return default
                        try:
                            return convert_func(value)
                        except (ValueError, TypeError):
                            return default
                    
                    for article in news_list:
                        try:
                            total_records += 1
                            
                            await self.db_service.execute_function(
                                "upsert_news_article",
                                p_title=getattr(article, 'title', None) or getattr(article, 'headline', None),
                                p_published_at=getattr(article, 'published_at', None) or getattr(article, 'published_date', None),
                                p_data_provider=provider,
                                
                                # Content parameters matching SQL function signature
                                p_summary=getattr(article, 'summary', None),
                                p_content=getattr(article, 'content', None),
                                p_url=getattr(article, 'url', None),
                                p_source=getattr(article, 'source', None),
                                p_author=getattr(article, 'author', None),
                                p_category=getattr(article, 'category', None),
                                
                                # Sentiment and analysis parameters
                                p_sentiment=safe_convert(getattr(article, 'sentiment', None) or getattr(article, 'sentiment_score', None), float),
                                p_relevance_score=safe_convert(getattr(article, 'relevance_score', None), float),
                                p_sentiment_confidence=safe_convert(getattr(article, 'sentiment_confidence', None), float),
                                
                                # Content metadata parameters
                                p_language=getattr(article, 'language', 'en'),
                                p_word_count=safe_convert(getattr(article, 'word_count', None), int),
                                p_image_url=getattr(article, 'image_url', None),
                                p_tags=getattr(article, 'tags', None)
                            )
                            success_count += 1
                            
                        except Exception as e:
                            logger.error(f"Failed to store news article for {symbol}: {e}")
                            logger.error(f"Article title: {getattr(article, 'title', 'No title') if 'article' in locals() else 'No data'}")
                    
                    logger.info(f"✅ Successfully stored {len(news_list)} news articles for {symbol}")
                    logger.info(f"   Provider: {provider}")
                    
                except Exception as e:
                    logger.error(f"Failed to process news data for {symbol}: {e}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{total_records} news articles stored successfully from {valid_symbols} symbols")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == total_records
            
        except Exception as e:
            logger.error(f"Error storing news: {e}")
            return False
    
    async def _fetch_with_provider_fallback(self, symbol: str) -> Optional[Any]:
        """Fetch news data from multiple providers for comprehensive coverage."""
        try:
            # Quick validation for obviously invalid symbols
            if not symbol or len(symbol) > 10 or not symbol.replace('.', '').isalnum():
                logger.warning(f"Invalid symbol format: {symbol}")
                return None
                
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for news data aggregation")
                return None
            
            logger.info(f"Starting news data aggregation for {symbol} across {len(available_providers)} providers")
            
            # Initialize merged news data
            all_news_articles = []
            provider_contributions = {}
            
            # Query ALL available providers to get comprehensive news data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for {symbol} news")
                        news_data = await provider.get_news(symbol)
                        
                        if news_data and len(news_data) > 0:
                            provider_contributions[provider_name] = len(news_data)
                            
                            # Add provider info to each article
                            for article in news_data:
                                if hasattr(article, 'provider'):
                                    article.provider = provider_name
                                else:
                                    setattr(article, 'provider', provider_name)
                            
                            all_news_articles.extend(news_data)
                            logger.info(f"{provider_name} contributed {len(news_data)} news articles")
                        else:
                            logger.debug(f"No news data from {provider_name} for {symbol}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for {symbol} news: {e}")
                    continue
            
            if not all_news_articles:
                logger.warning(f"No providers returned valid news data for {symbol}")
                return None
            
            # Remove duplicates based on title and URL, keeping the most complete article
            unique_articles = {}
            for article in all_news_articles:
                title = getattr(article, 'title', None) or getattr(article, 'headline', None)
                url = getattr(article, 'url', None)
                
                # Create unique key based on title or URL
                key = None
                if url:
                    key = url
                elif title:
                    key = title.lower().strip()
                
                if key:
                    if key not in unique_articles:
                        unique_articles[key] = article
                    else:
                        # Keep the article with more complete data (non-null fields)
                        existing_article = unique_articles[key]
                        new_article = article
                        
                        # Count non-null fields in both articles
                        existing_fields = sum(1 for field in ['title', 'summary', 'content', 'author', 'category', 'sentiment'] 
                                            if getattr(existing_article, field, None) is not None)
                        new_fields = sum(1 for field in ['title', 'summary', 'content', 'author', 'category', 'sentiment'] 
                                       if getattr(new_article, field, None) is not None)
                        
                        if new_fields > existing_fields:
                            unique_articles[key] = new_article
            
            final_articles = list(unique_articles.values())
            
            # Sort by published date (most recent first)
            final_articles.sort(key=lambda x: getattr(x, 'published_at', '') or getattr(x, 'published_date', ''), reverse=True)
            
            # Create result with all contributing providers listed
            contributing_providers = [p for p, count in provider_contributions.items() if count > 0]
            provider_string = f"{'+'.join(contributing_providers)}"
            
            from market_data.brain import FetchResult
            comprehensive_result = FetchResult(
                data=final_articles,
                provider=provider_string,
                success=True
            )
            
            logger.info(f"News aggregation for {symbol}: {len(final_articles)} unique articles from {len(contributing_providers)} providers")
            logger.info(f"Provider contributions: {provider_contributions}")
            
            return comprehensive_result
            
        except Exception as e:
            logger.error(f"Error in news data aggregation for {symbol}: {e}")
            return None
    
    async def _fetch_general_news_with_fallback(self) -> Optional[Any]:
        """Fetch general market news from multiple providers for comprehensive coverage."""
        try:
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for general news data aggregation")
                return None
            
            logger.info(f"Starting general news aggregation across {len(available_providers)} providers")
            
            # Initialize merged news data
            all_news_articles = []
            provider_contributions = {}
            
            # Query ALL available providers to get comprehensive general news
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for general market news")
                        news_data = await provider.get_general_news()
                        
                        if news_data and len(news_data) > 0:
                            provider_contributions[provider_name] = len(news_data)
                            
                            # Add provider info to each article
                            for article in news_data:
                                if hasattr(article, 'provider'):
                                    article.provider = provider_name
                                else:
                                    setattr(article, 'provider', provider_name)
                            
                            all_news_articles.extend(news_data)
                            logger.info(f"{provider_name} contributed {len(news_data)} general news articles")
                        else:
                            logger.debug(f"No general news data from {provider_name}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for general news: {e}")
                    continue
            
            if not all_news_articles:
                logger.warning("No providers returned valid general news data")
                return None
            
            # Remove duplicates based on title and URL
            unique_articles = {}
            for article in all_news_articles:
                title = getattr(article, 'title', None) or getattr(article, 'headline', None)
                url = getattr(article, 'url', None)
                
                # Create unique key based on title or URL
                key = None
                if url:
                    key = url
                elif title:
                    key = title.lower().strip()
                
                if key and key not in unique_articles:
                    unique_articles[key] = article
            
            final_articles = list(unique_articles.values())
            
            # Sort by published date (most recent first)
            final_articles.sort(key=lambda x: getattr(x, 'published_at', '') or getattr(x, 'published_date', ''), reverse=True)
            
            # Create result with all contributing providers listed
            contributing_providers = [p for p, count in provider_contributions.items() if count > 0]
            provider_string = f"{'+'.join(contributing_providers)}"
            
            from market_data.brain import FetchResult
            comprehensive_result = FetchResult(
                data=final_articles,
                provider=provider_string,
                success=True
            )
            
            logger.info(f"General news aggregation: {len(final_articles)} unique articles from {len(contributing_providers)} providers")
            logger.info(f"Provider contributions: {provider_contributions}")
            
            return comprehensive_result
            
        except Exception as e:
            logger.error(f"Error in general news data aggregation: {e}")
            return None
