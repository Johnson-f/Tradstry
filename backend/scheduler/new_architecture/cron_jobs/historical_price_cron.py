"""
Historical price cron job - fetches historical stock price data for database symbols.
Runs every trading day at 5:00 PM Eastern Time.
"""

import logging
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, date

from market_data.providers.yahoo_finance import YahooFinanceProvider
from ..jobs.db_services.historical_prices_db import HistoricalPricesDB

logger = logging.getLogger(__name__)


class HistoricalPriceCron:
    """Cron job for fetching historical price data for database symbols."""

    def __init__(self):
        """Initialize historical price cron job."""
        self.yahoo_provider = YahooFinanceProvider()
        self.historical_prices_db = HistoricalPricesDB()
        self.job_name = "historical_price"

    async def execute(self, symbols: Optional[List[str]] = None, days_back: int = 1) -> bool:
        """
        Execute historical price data fetching and processing.
        Fetches symbols from database and updates their historical prices.

        Args:
            symbols: Optional list of stock symbols to process. If None, fetches from database.
            days_back: Number of days of historical data to fetch (default: 1 for daily updates).

        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job - updating historical prices for database symbols")

            # Get symbols from database if none provided
            if not symbols:
                symbols = await self._get_database_symbols()

            if not symbols:
                logger.warning("No symbols found in database to update historical prices")
                return False

            logger.info(f"📊 Processing {len(symbols)} database symbols for historical price updates")

            # Calculate date range for historical data
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=days_back)

            logger.info(f"📅 Fetching historical data from {start_date} to {end_date} ({days_back} days)")

            # Fetch and store historical data for each symbol
            success_count = 0
            total_processed = 0

            # Process symbols in batches to avoid rate limits
            batch_size = 10
            for i in range(0, len(symbols), batch_size):
                batch = symbols[i:i + batch_size]
                batch_num = (i // batch_size) + 1

                logger.info(f"🔄 Processing batch {batch_num}: {len(batch)} symbols")

                # Process batch concurrently
                batch_tasks = []
                for symbol in batch:
                    batch_tasks.append(self._fetch_and_store_symbol_data(symbol, start_date, end_date))

                # Execute batch concurrently
                batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

                # Count successful operations
                batch_success = 0
                for symbol, result in zip(batch, batch_results):
                    total_processed += 1
                    if isinstance(result, Exception):
                        logger.warning(f"⚠️ Error processing {symbol}: {result}")
                    elif result:
                        batch_success += 1
                        success_count += 1

                logger.info(f"✅ Batch {batch_num} completed: {batch_success}/{len(batch)} symbols successful")

                # Small delay between batches to respect rate limits
                if i + batch_size < len(symbols):
                    await asyncio.sleep(1.0)

            # Log final results
            execution_time = (datetime.now() - start_time).total_seconds()
            success_rate = (success_count / total_processed * 100) if total_processed > 0 else 0

            logger.info(f"✅ {self.job_name} completed successfully in {execution_time:.2f}s")
            logger.info(f"📊 Processed {total_processed} symbols, {success_count} successful ({success_rate:.1f}% success rate)")

            return success_count > 0  # Return True if at least one symbol was processed successfully

        except Exception as e:
            logger.error(f"❌ Error in {self.job_name} cron job: {e}")
            return False

    async def _get_database_symbols(self) -> List[str]:
        """Get symbols from the database that need historical price updates."""
        try:
            # Get symbols that need updates (haven't been updated in the last 2 days)
            symbols = await self.historical_prices_db.get_symbols_needing_update(days_behind=2)

            if not symbols:
                logger.info("No symbols need updates, getting all database symbols")
                symbols = await self.historical_prices_db.get_all_symbols()

            return symbols

        except Exception as e:
            logger.error(f"Error getting database symbols: {e}")
            return []

    async def _fetch_and_store_symbol_data(self, symbol: str, start_date: date, end_date: date) -> bool:
        """Fetch historical data for a symbol and store it in the database."""
        try:
            # Fetch historical data using Yahoo Finance
            historical_data = await self.yahoo_provider.get_historical(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
                interval="1d"
            )

            if not historical_data:
                logger.debug(f"No historical data fetched for {symbol}")
                return False

            # Convert HistoricalPrice objects to dictionaries for database storage
            price_records = []
            for price in historical_data:
                price_records.append({
                    'symbol': price.symbol,
                    'date': price.date.isoformat(),
                    'open': float(price.open) if price.open else None,
                    'high': float(price.high) if price.high else None,
                    'low': float(price.low) if price.low else None,
                    'close': float(price.close) if price.close else None,
                    'volume': int(price.volume) if price.volume else None,
                    'adjusted_close': float(price.adjusted_close) if price.adjusted_close else None,
                    'data_provider': price.provider.lower().replace(' ', '_')
                })

            # Store data in database
            success = await self.historical_prices_db.upsert_historical_prices(price_records)

            if success:
                logger.debug(f"✅ Stored {len(price_records)} historical records for {symbol}")
                return True
            else:
                logger.warning(f"❌ Failed to store historical data for {symbol}")
                return False

        except Exception as e:
            logger.warning(f"Error processing {symbol}: {e}")
            return False

    async def close(self):
        """Close database connections."""
        try:
            await self.historical_prices_db.close()
            logger.info("Historical price cron job closed")
        except Exception as e:
            logger.error(f"Error closing historical price cron job: {e}")
