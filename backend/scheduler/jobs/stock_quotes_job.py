"""
Stock quotes data fetching job.
Fetches real-time stock price data and stores using upsert functions.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class StockQuotesJob(BaseMarketDataJob):
    """Job for fetching and storing real-time stock quotes."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        """Initialize with database service and market data orchestrator."""
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Fetch real-time stock quotes for given symbols.
        
        Args:
            symbols: List of stock symbols to fetch quotes for
            
        Returns:
            Dictionary containing quote data for all symbols
        """
        try:
            logger.info(f"Fetching stock quotes for {len(symbols)} symbols")
            
            quotes_data = {}
            
            # Process symbols in batches to respect API rate limits
            symbol_batches = self._batch_symbols(symbols, batch_size=10)
            
            for batch in symbol_batches:
                try:
                    # Use the market data orchestrator to fetch quotes
                    batch_data = await self.orchestrator.get_stock_quotes(batch)
                    quotes_data.update(batch_data)
                    
                    # Small delay between batches to avoid rate limiting
                    await asyncio.sleep(1)
                    
                except Exception as e:
                    logger.error(f"Failed to fetch quotes for batch {batch}: {e}")
                    continue
            
            logger.info(f"Successfully fetched quotes for {len(quotes_data)} symbols")
            return quotes_data
            
        except Exception as e:
            logger.error(f"Error fetching stock quotes: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """
        Store stock quotes data using database upsert function.
        
        Args:
            data: Dictionary containing quote data by symbol
            
        Returns:
            True if all data stored successfully, False otherwise
        """
        if not data:
            return True
        
        try:
            success_count = 0
            total_count = len(data)
            
            for symbol, quote_data in data.items():
                try:
                    # Call the PostgreSQL upsert function
                    await self.db_service.execute_function(
                        "upsert_stock_quote",
                        p_symbol=symbol,
                        p_exchange_id=quote_data.get('exchange_id'),
                        p_price=quote_data.get('price'),
                        p_change_amount=quote_data.get('change_amount'),
                        p_change_percent=quote_data.get('change_percent'),
                        p_volume=quote_data.get('volume'),
                        p_open_price=quote_data.get('open_price'),
                        p_high_price=quote_data.get('high_price'),
                        p_low_price=quote_data.get('low_price'),
                        p_previous_close=quote_data.get('previous_close'),
                        p_quote_timestamp=quote_data.get('timestamp', datetime.now()),
                        p_data_provider=quote_data.get('provider', 'unknown')
                    )
                    success_count += 1
                    
                except Exception as e:
                    logger.error(f"Failed to store quote for {symbol}: {e}")
                    continue
            
            logger.info(f"Stored {success_count}/{total_count} stock quotes successfully")
            return success_count == total_count
            
        except Exception as e:
            logger.error(f"Error storing stock quotes: {e}")
            return False
