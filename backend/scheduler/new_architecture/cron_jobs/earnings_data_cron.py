"""
Earnings data cron job - fetches earnings data from all providers via MarketDataBrain.
Runs every trading day at 7:00 PM Eastern Time.
"""

import logging
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor
from ..jobs.db_services.earnings_data_db import EarningsDataDB
from ..jobs.db_services.stock_quotes_db import StockQuotesDB

logger = logging.getLogger(__name__)


class EarningsDataCron:
    """Cron job for fetching earnings data from all providers via MarketDataBrain."""

    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize earnings data cron job with MarketDataBrain."""
        # Initialize components
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.earnings_data_db = EarningsDataDB()
        self.stock_quotes_db = StockQuotesDB()
        self.job_name = "earnings_data"

    async def execute(self, symbols: Optional[List[str]] = None) -> bool:
        """
        Execute earnings data fetching and processing.
        Fetches symbols from database and updates their earnings data.

        Args:
            symbols: Optional list of stock symbols to process. If None, fetches from database.

        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job - updating earnings data for database symbols")

            # Get symbols from database if none provided
            if not symbols:
                symbols = await self._get_database_symbols()

            if not symbols:
                logger.warning("No symbols found in database to update earnings data")
                return False

            logger.info(f"📊 Processing {len(symbols)} database symbols for earnings data updates")

            # Fetch earnings data in batches for efficiency
            earnings_data = await self._fetch_earnings_in_batches(symbols, batch_size=10)

            if not earnings_data:
                logger.info("No earnings data found from any providers - this is normal for many stocks")
                # Return success since we processed the symbols without errors
                execution_time = (datetime.now() - start_time).total_seconds()
                logger.info(f"✅ {self.job_name} completed successfully in {execution_time:.2f}s")
                logger.info(f"📊 Processed {len(symbols)} symbols - no earnings data available")
                return True

            # Process and store data using data processor
            raw_data = {
                "data_type": "earnings_data",
                "data": earnings_data,
                "timestamp": start_time.isoformat(),
                "symbols_processed": len(symbols),
                "records_fetched": len(earnings_data)
            }

            success = await self.data_processor.process_earnings_data(raw_data)

            if success:
                execution_time = (datetime.now() - start_time).total_seconds()
                success_rate = len(earnings_data) / len(symbols) * 100
                logger.info(f"✅ {self.job_name} completed successfully in {execution_time:.2f}s")
                logger.info(f"📊 Processed {len(earnings_data)}/{len(symbols)} symbols ({success_rate:.1f}% success rate)")
                return True
            else:
                logger.error(f"❌ {self.job_name} processing failed")
                return False

        except Exception as e:
            logger.error(f"❌ Error in {self.job_name} cron job: {e}")
            return False

    async def _get_database_symbols(self) -> List[str]:
        """Get symbols from the database."""
        try:
            # Get symbols that need earnings updates
            symbols = await self.stock_quotes_db.get_all_symbols()

            if not symbols:
                logger.warning("No symbols found in stock_quotes table")
                return []

            return symbols

        except Exception as e:
            logger.error(f"Error getting database symbols: {e}")
            return []

    async def _fetch_earnings_in_batches(self, symbols: List[str], batch_size: int = 10) -> Dict[str, Any]:
        """Fetch earnings data in batches to avoid rate limiting and improve efficiency."""
        earnings_data = {}
        total_batches = (len(symbols) + batch_size - 1) // batch_size

        logger.info(f"📦 Processing {len(symbols)} symbols in {total_batches} batches of {batch_size}")

        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            batch_num = (i // batch_size) + 1

            logger.info(f"🔄 Processing batch {batch_num}/{total_batches}: {len(batch)} symbols")

            # Process batch with concurrent requests
            batch_tasks = []
            for symbol in batch:
                batch_tasks.append(self._fetch_single_earnings(symbol))

            # Execute batch concurrently
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

            # Process results
            batch_success = 0
            for symbol, result in zip(batch, batch_results):
                if isinstance(result, Exception):
                    logger.warning(f"⚠️ Error fetching earnings for {symbol}: {result}")
                elif result:
                    earnings_data[symbol] = result
                    batch_success += 1

            logger.info(f"✅ Batch {batch_num} completed: {batch_success}/{len(batch)} successful")

            # Small delay between batches to avoid overwhelming providers
            if i + batch_size < len(symbols):
                await asyncio.sleep(1.0)

        logger.info(f"🎉 Total earnings data fetched: {len(earnings_data)}/{len(symbols)} ({len(earnings_data)/len(symbols)*100:.1f}%)")
        return earnings_data

    async def _fetch_single_earnings(self, symbol: str) -> Optional[Any]:
        """Fetch earnings data for a single symbol with error handling."""
        try:
            # Temporarily disable Finnhub for earnings data due to HTML error responses
            original_providers = self.market_data_brain.providers.copy()
            
            # Remove Finnhub from available providers for this request
            if 'finnhub' in self.market_data_brain.providers:
                del self.market_data_brain.providers['finnhub']
                logger.info(f"Temporarily disabled Finnhub provider for earnings data")
            
            result = await self.market_data_brain.get_earnings_calendar(symbol)
            
            # Restore original providers
            self.market_data_brain.providers = original_providers
            
            if result.success and result.data:
                return result.data
            else:
                logger.debug(f"No earnings data for {symbol}")
                return None
        except Exception as e:
            logger.warning(f"Error fetching earnings for {symbol}: {e}")
            return None

    async def close(self):
        """Close database connections."""
        try:
            await self.earnings_data_db.close()
            await self.stock_quotes_db.close()
            logger.info("Earnings data cron job closed")
        except Exception as e:
            logger.error(f"Error closing earnings data cron job: {e}")
