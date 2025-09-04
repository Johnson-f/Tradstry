"""
Data processor for transforming and storing market data.
This is part of the new architecture where cron jobs fetch raw data from market_data
and send it here for transformation and database storage.
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
import asyncio

from scheduler.database_service import SchedulerDatabaseService

logger = logging.getLogger(__name__)


class DataProcessor:
    """
    Processes raw market data from cron jobs and stores it in the database.
    
    New Architecture Role:
    1. Receives raw data from cron scheduler
    2. Transforms data to match database schema
    3. Stores data using database upsert functions
    4. Handles errors and logging
    """
    
    def __init__(self, database_service: SchedulerDatabaseService):
        """Initialize with database service."""
        self.db_service = database_service
    
    async def process_stock_quotes(self, quotes_data: Dict[str, Any]) -> bool:
        """
        Process and store stock quotes data.
        
        Args:
            quotes_data: Dictionary mapping symbols to StockQuote objects
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Processing {len(quotes_data)} stock quotes")
            
            # Transform data for database storage
            processed_quotes = []
            for symbol, quote_data in quotes_data.items():
                if hasattr(quote_data, 'model_dump'):
                    # Pydantic model
                    quote_dict = quote_data.model_dump()
                else:
                    # Already a dictionary
                    quote_dict = quote_data
                
                # Ensure required fields are present
                quote_dict['symbol'] = symbol
                quote_dict['timestamp'] = quote_dict.get('timestamp', datetime.now().isoformat())
                
                processed_quotes.append(quote_dict)
            
            # Store in database using upsert function
            success = await self.db_service.upsert_stock_quotes(processed_quotes)
            
            if success:
                logger.info(f"Successfully stored {len(processed_quotes)} stock quotes")
            else:
                logger.error(f"Failed to store stock quotes")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing stock quotes: {e}")
            return False
    
    async def process_options_chain(self, options_data: Dict[str, List[Any]]) -> bool:
        """
        Process and store options chain data.
        
        Args:
            options_data: Dictionary mapping symbols to lists of OptionQuote objects
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Processing options chain data for {len(options_data)} symbols")
            
            # Transform data for database storage
            processed_options = []
            for symbol, options_list in options_data.items():
                for option_data in options_list:
                    if hasattr(option_data, 'model_dump'):
                        option_dict = option_data.model_dump()
                    else:
                        option_dict = option_data
                    
                    # Ensure required fields
                    option_dict['underlying_symbol'] = symbol
                    option_dict['timestamp'] = option_dict.get('timestamp', datetime.now().isoformat())
                    
                    processed_options.append(option_dict)
            
            # Store in database
            success = await self.db_service.upsert_options_data(processed_options)
            
            if success:
                logger.info(f"Successfully stored {len(processed_options)} options contracts")
            else:
                logger.error(f"Failed to store options data")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing options chain: {e}")
            return False
    
    async def process_historical_prices(self, historical_data: Dict[str, List[Any]]) -> bool:
        """
        Process and store historical price data.
        
        Args:
            historical_data: Dictionary mapping symbols to lists of HistoricalPrice objects
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Processing historical data for {len(historical_data)} symbols")
            
            # Transform data for database storage
            processed_prices = []
            for symbol, prices_list in historical_data.items():
                for price_data in prices_list:
                    if hasattr(price_data, 'model_dump'):
                        price_dict = price_data.model_dump()
                    else:
                        price_dict = price_data
                    
                    # Ensure required fields
                    price_dict['symbol'] = symbol
                    
                    processed_prices.append(price_dict)
            
            # Store in database
            success = await self.db_service.upsert_historical_prices(processed_prices)
            
            if success:
                logger.info(f"Successfully stored {len(processed_prices)} historical price records")
            else:
                logger.error(f"Failed to store historical prices")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing historical prices: {e}")
            return False
    
    async def process_company_info(self, company_data: Dict[str, Any]) -> bool:
        """
        Process and store company information data.
        
        Args:
            company_data: Dictionary mapping symbols to CompanyInfo objects
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Processing company info for {len(company_data)} symbols")
            
            # Transform data for database storage
            processed_companies = []
            for symbol, info_data in company_data.items():
                if hasattr(info_data, 'model_dump'):
                    info_dict = info_data.model_dump()
                else:
                    info_dict = info_data
                
                # Ensure required fields
                info_dict['symbol'] = symbol
                info_dict['updated_at'] = datetime.now().isoformat()
                
                processed_companies.append(info_dict)
            
            # Store in database
            success = await self.db_service.upsert_company_info(processed_companies)
            
            if success:
                logger.info(f"Successfully stored company info for {len(processed_companies)} symbols")
            else:
                logger.error(f"Failed to store company info")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing company info: {e}")
            return False
    
    async def process_fundamental_data(self, fundamental_data: Dict[str, Any]) -> bool:
        """
        Process and store fundamental data.
        
        Args:
            fundamental_data: Dictionary mapping symbols to fundamental data objects
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Processing fundamental data for {len(fundamental_data)} symbols")
            
            # Transform data for database storage
            processed_fundamentals = []
            for symbol, fund_data in fundamental_data.items():
                if hasattr(fund_data, 'model_dump'):
                    fund_dict = fund_data.model_dump()
                else:
                    fund_dict = fund_data
                
                # Ensure required fields
                fund_dict['symbol'] = symbol
                fund_dict['updated_at'] = datetime.now().isoformat()
                
                processed_fundamentals.append(fund_dict)
            
            # Store in database
            success = await self.db_service.upsert_fundamental_data(processed_fundamentals)
            
            if success:
                logger.info(f"Successfully stored fundamental data for {len(processed_fundamentals)} symbols")
            else:
                logger.error(f"Failed to store fundamental data")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing fundamental data: {e}")
            return False
    
    async def process_dividend_data(self, dividend_data: Dict[str, List[Any]]) -> bool:
        """
        Process and store dividend data.
        
        Args:
            dividend_data: Dictionary mapping symbols to lists of dividend records
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Processing dividend data for {len(dividend_data)} symbols")
            
            # Transform data for database storage
            processed_dividends = []
            for symbol, dividends_list in dividend_data.items():
                for dividend in dividends_list:
                    if hasattr(dividend, 'model_dump'):
                        div_dict = dividend.model_dump()
                    else:
                        div_dict = dividend
                    
                    # Ensure required fields
                    div_dict['symbol'] = symbol
                    
                    processed_dividends.append(div_dict)
            
            # Store in database
            success = await self.db_service.upsert_dividend_data(processed_dividends)
            
            if success:
                logger.info(f"Successfully stored {len(processed_dividends)} dividend records")
            else:
                logger.error(f"Failed to store dividend data")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing dividend data: {e}")
            return False
    
    async def process_earnings_data(self, earnings_data: Dict[str, Any]) -> bool:
        """
        Process and store earnings data.
        
        Args:
            earnings_data: Dictionary mapping symbols to earnings data
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Processing earnings data for {len(earnings_data)} symbols")
            
            # Transform data for database storage
            processed_earnings = []
            for symbol, earn_data in earnings_data.items():
                if isinstance(earn_data, list):
                    # Multiple earnings records
                    for earning in earn_data:
                        if hasattr(earning, 'model_dump'):
                            earn_dict = earning.model_dump()
                        else:
                            earn_dict = earning
                        
                        earn_dict['symbol'] = symbol
                        processed_earnings.append(earn_dict)
                else:
                    # Single earnings record
                    if hasattr(earn_data, 'model_dump'):
                        earn_dict = earn_data.model_dump()
                    else:
                        earn_dict = earn_data
                    
                    earn_dict['symbol'] = symbol
                    processed_earnings.append(earn_dict)
            
            # Store in database
            success = await self.db_service.upsert_earnings_data(processed_earnings)
            
            if success:
                logger.info(f"Successfully stored {len(processed_earnings)} earnings records")
            else:
                logger.error(f"Failed to store earnings data")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing earnings data: {e}")
            return False
    
    async def process_earnings_calendar(self, calendar_data: List[Any]) -> bool:
        """
        Process and store earnings calendar data.
        
        Args:
            calendar_data: List of earnings calendar events
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Processing {len(calendar_data)} earnings calendar events")
            
            # Transform data for database storage
            processed_events = []
            for event in calendar_data:
                if hasattr(event, 'model_dump'):
                    event_dict = event.model_dump()
                else:
                    event_dict = event
                
                processed_events.append(event_dict)
            
            # Store in database
            success = await self.db_service.upsert_earnings_calendar(processed_events)
            
            if success:
                logger.info(f"Successfully stored {len(processed_events)} earnings calendar events")
            else:
                logger.error(f"Failed to store earnings calendar")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing earnings calendar: {e}")
            return False
    
    async def process_news_data(self, news_data: Dict[str, Any]) -> bool:
        """
        Process and store news data.
        
        Args:
            news_data: Dictionary containing general and symbol-specific news
            
        Returns:
            True if successful, False otherwise
        """
        try:
            general_news = news_data.get('general', [])
            symbol_news = news_data.get('symbol_specific', {})
            
            total_articles = len(general_news) + sum(len(articles) for articles in symbol_news.values())
            logger.info(f"Processing {total_articles} news articles")
            
            # Transform data for database storage
            processed_articles = []
            
            # Process general news
            for article in general_news:
                if hasattr(article, 'model_dump'):
                    article_dict = article.model_dump()
                else:
                    article_dict = article
                
                article_dict['category'] = 'general'
                processed_articles.append(article_dict)
            
            # Process symbol-specific news
            for symbol, articles in symbol_news.items():
                for article in articles:
                    if hasattr(article, 'model_dump'):
                        article_dict = article.model_dump()
                    else:
                        article_dict = article
                    
                    article_dict['category'] = 'symbol_specific'
                    article_dict['related_symbol'] = symbol
                    processed_articles.append(article_dict)
            
            # Store in database
            success = await self.db_service.upsert_news_data(processed_articles)
            
            if success:
                logger.info(f"Successfully stored {len(processed_articles)} news articles")
            else:
                logger.error(f"Failed to store news data")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing news data: {e}")
            return False
    
    async def process_economic_events(self, events_data: List[Any]) -> bool:
        """
        Process and store economic events data.
        
        Args:
            events_data: List of economic events
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Processing {len(events_data)} economic events")
            
            # Transform data for database storage
            processed_events = []
            for event in events_data:
                if hasattr(event, 'model_dump'):
                    event_dict = event.model_dump()
                else:
                    event_dict = event
                
                processed_events.append(event_dict)
            
            # Store in database
            success = await self.db_service.upsert_economic_events(processed_events)
            
            if success:
                logger.info(f"Successfully stored {len(processed_events)} economic events")
            else:
                logger.error(f"Failed to store economic events")
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing economic events: {e}")
            return False
    
    # Batch processing methods
    
    async def process_batch_data(self, data_type: str, batch_data: Any) -> bool:
        """
        Process a batch of data based on its type.
        
        Args:
            data_type: Type of data to process
            batch_data: The data to process
            
        Returns:
            True if successful, False otherwise
        """
        processors = {
            'stock_quotes': self.process_stock_quotes,
            'options_chain': self.process_options_chain,
            'historical_prices': self.process_historical_prices,
            'company_info': self.process_company_info,
            'fundamental_data': self.process_fundamental_data,
            'dividend_data': self.process_dividend_data,
            'earnings_data': self.process_earnings_data,
            'earnings_calendar': self.process_earnings_calendar,
            'news_data': self.process_news_data,
            'economic_events': self.process_economic_events,
        }
        
        processor = processors.get(data_type)
        if not processor:
            logger.error(f"No processor found for data type: {data_type}")
            return False
        
        try:
            return await processor(batch_data)
        except Exception as e:
            logger.error(f"Error processing batch data for {data_type}: {e}")
            return False
    
    async def process_multiple_batches(self, batches: List[Dict[str, Any]]) -> Dict[str, bool]:
        """
        Process multiple batches concurrently.
        
        Args:
            batches: List of dictionaries with 'type' and 'data' keys
            
        Returns:
            Dictionary mapping batch types to success status
        """
        tasks = []
        batch_types = []
        
        for batch in batches:
            data_type = batch.get('type')
            data = batch.get('data')
            
            if data_type and data:
                tasks.append(self.process_batch_data(data_type, data))
                batch_types.append(data_type)
        
        if not tasks:
            logger.warning("No valid batches to process")
            return {}
        
        # Execute all tasks concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Map results to batch types
        batch_results = {}
        for i, result in enumerate(results):
            batch_type = batch_types[i]
            if isinstance(result, Exception):
                logger.error(f"Batch processing failed for {batch_type}: {result}")
                batch_results[batch_type] = False
            else:
                batch_results[batch_type] = result
        
        return batch_results
