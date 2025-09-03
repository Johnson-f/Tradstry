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
from scheduler.data_fetch_tracker import DataType, DataFetchTracker
from scheduler.enhanced_provider_manager import EnhancedProviderManager, FetchStrategy


logger = logging.getLogger(__name__)


class StockQuotesJob(BaseMarketDataJob):
    """Job for fetching and storing real-time stock quotes."""
    
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
        return DataType.STOCK_QUOTES
    
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
            
            # Use enhanced tracking if available
            if self.enable_enhanced_tracking:
                return await self.fetch_data_with_enhanced_tracking(
                    symbols=symbols,
                    fetch_method='get_multiple_quotes',
                    strategy=FetchStrategy.FASTEST_FIRST  # Quotes benefit from speed
                )
            
            # Fallback to original implementation
            quotes_data = {}
            
            # Fetch quotes using the orchestrator
            quotes = await self.orchestrator.get_multiple_quotes(symbols)
            quotes_data.update(quotes)
            
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
            
            for symbol, fetch_result in data.items():
                try:
                    # Extract quote data from FetchResult
                    if not fetch_result.success or not fetch_result.data:
                        logger.warning(f"No valid data for {symbol}")
                        continue
                    
                    quote_data = fetch_result.data
                    
                    # StockQuote is a Pydantic model, access attributes directly
                    # Call the PostgreSQL upsert function
                    await self.db_service.execute_function(
                        "upsert_stock_quote",
                        p_symbol=symbol,
                        p_quote_timestamp=quote_data.timestamp,
                        p_data_provider=fetch_result.provider,
                        
                        # Exchange parameters (may be None)
                        p_exchange_code=None,
                        p_exchange_name=None,
                        p_exchange_country=None,
                        p_exchange_timezone=None,
                        
                        # Quote parameters matching SQL function signature
                        p_price=float(quote_data.price),
                        p_change_amount=float(quote_data.change),
                        p_change_percent=float(quote_data.change_percent),
                        p_volume=quote_data.volume,
                        p_open_price=float(quote_data.open) if quote_data.open else None,
                        p_high_price=float(quote_data.high) if quote_data.high else None,
                        p_low_price=float(quote_data.low) if quote_data.low else None,
                        p_previous_close=float(quote_data.previous_close) if quote_data.previous_close else None
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
