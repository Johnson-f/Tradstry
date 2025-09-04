"""
Stock quotes cron job - fetches real-time stock price data.
"""

import logging
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor
from ..jobs.db_services.stock_quotes_db import StockQuotesDB

logger = logging.getLogger(__name__)


class StockQuotesCron:
    """Cron job for fetching stock quotes data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        # Initialize components
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.stock_quotes_db = StockQuotesDB()
        self.job_name = "stock_quotes"
    
    async def execute(self, symbols: Optional[List[str]] = None) -> bool:
        """
        Execute stock quotes data fetching and processing.
        Updates prices for existing symbols in the database.
        
        Args:
            symbols: List of stock symbols to fetch. If None, gets symbols from database.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job - updating existing database symbols")
            
            # Get symbols from database if none provided
            if not symbols:
                symbols = await self._get_database_symbols()
            
            if not symbols:
                logger.warning("No symbols found in database to update")
                return False
            
            logger.info(f"Updating stock quotes for {len(symbols)} existing symbols: {symbols[:5]}{'...' if len(symbols) > 5 else ''}")
            
            # Fetch data in batches for efficiency
            quotes_data = await self._fetch_quotes_in_batches(symbols, batch_size=25)
            
            if not quotes_data:
                logger.error("❌ Failed to fetch any stock quotes")
                return False
            
            # Process and store data - pass the quotes data directly
            success = await self.data_processor.process_stock_quotes(quotes_data)
            
            if success:
                execution_time = (datetime.now() - start_time).total_seconds()
                success_rate = len(quotes_data) / len(symbols) * 100
                logger.info(f"✅ {self.job_name} completed successfully in {execution_time:.2f}s")
                logger.info(f"📊 Updated {len(quotes_data)}/{len(symbols)} symbols ({success_rate:.1f}% success rate)")
                return True
            else:
                logger.error(f"❌ {self.job_name} processing failed")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in {self.job_name} cron job: {e}")
            return False
    
    async def _get_database_symbols(self) -> List[str]:
        """Get symbols that exist in the database and need price updates."""
        try:
            # Get symbols that haven't been updated in the last 10 minutes
            symbols = await self.stock_quotes_db.get_symbols_needing_update(max_age_minutes=10)
            
            if not symbols:
                # Fallback: get all symbols in database
                logger.info("No symbols needing update, getting all database symbols")
                symbols = await self.stock_quotes_db.get_all_symbols()
            
            return symbols
            
        except Exception as e:
            logger.error(f"Error getting database symbols: {e}")
            return []
    
    async def _fetch_quotes_in_batches(self, symbols: List[str], batch_size: int = 25) -> Dict[str, Any]:
        """Fetch quotes in batches to avoid rate limiting and improve efficiency."""
        quotes_data = {}
        total_batches = (len(symbols) + batch_size - 1) // batch_size
        
        logger.info(f"📦 Processing {len(symbols)} symbols in {total_batches} batches of {batch_size}")
        
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            
            logger.info(f"🔄 Processing batch {batch_num}/{total_batches}: {len(batch)} symbols")
            
            # Process batch with concurrent requests
            batch_tasks = []
            for symbol in batch:
                batch_tasks.append(self._fetch_single_quote(symbol))
            
            # Execute batch concurrently
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            # Process results
            batch_success = 0
            for symbol, result in zip(batch, batch_results):
                if isinstance(result, Exception):
                    logger.warning(f"⚠️ Error fetching {symbol}: {result}")
                elif result:
                    quotes_data[symbol] = result
                    batch_success += 1
            
            logger.info(f"✅ Batch {batch_num} completed: {batch_success}/{len(batch)} successful")
            
            # Small delay between batches to avoid overwhelming providers
            if i + batch_size < len(symbols):
                await asyncio.sleep(0.5)
        
        logger.info(f"🎉 Total quotes fetched: {len(quotes_data)}/{len(symbols)} ({len(quotes_data)/len(symbols)*100:.1f}%)")
        return quotes_data
    
    async def _fetch_single_quote(self, symbol: str) -> Optional[Any]:
        """Fetch a single quote with error handling."""
        try:
            result = await self.market_data_brain.get_quote(symbol)
            if result.success and result.data:
                return result.data
            else:
                logger.debug(f"No data for {symbol}")
                return None
        except Exception as e:
            logger.warning(f"Error fetching {symbol}: {e}")
            return None
    
    def _get_default_symbols(self) -> List[str]:
        """Get fallback symbols if database is empty."""
        return [
            # Major indices components
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "NFLX",
            "SPY", "QQQ", "IWM", "DIA",  # ETFs
            # Additional popular stocks
            "BRK.B", "JPM", "JNJ", "V", "PG", "UNH", "HD", "MA", "BAC", "XOM"
        ]
