"""
Earnings calendar cron job - fetches earnings calendar data daily.
"""

import logging
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor
from ..jobs.db_services.earnings_calendar_db import EarningsCalendarDB

logger = logging.getLogger(__name__)


class EarningsCalendarCron:
    """Cron job for fetching earnings calendar data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        # Initialize components
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.earnings_calendar_db = EarningsCalendarDB()
        self.job_name = "earnings_calendar"
    
    async def execute(self, symbols: Optional[List[str]] = None) -> bool:
        """
        Execute earnings calendar data fetching and processing.
        Fetches stocks from database, then checks which have earnings in next 30 days.
        
        Args:
            symbols: Optional list of stock symbols to filter by. If None, uses database symbols.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job - checking database symbols for next 30 days earnings")
            
            # Get symbols from database if none provided
            if not symbols:
                symbols = await self._get_database_symbols()
            
            if not symbols:
                logger.warning("No symbols found in database to check for earnings")
                return False
            
            logger.info(f"📊 Checking {len(symbols)} database symbols for earnings in next 30 days")
            
            # Calculate 30-day window
            from datetime import timedelta
            from_date = datetime.now().date()
            to_date = from_date + timedelta(days=30)
            
            # Find symbols with earnings in the 30-day window
            symbols_with_earnings = await self._find_symbols_with_earnings(symbols, from_date, to_date)
            
            if not symbols_with_earnings:
                logger.info("📭 No database symbols have earnings scheduled in the next 30 days")
                return True  # This is normal, not an error
            
            logger.info(f"🎯 Found {len(symbols_with_earnings)} symbols with earnings in next 30 days: {symbols_with_earnings[:10]}{'...' if len(symbols_with_earnings) > 10 else ''}")
            
            # Fetch earnings calendar data for these symbols
            earnings_data = await self._fetch_earnings_in_batches(symbols_with_earnings, batch_size=20)
            
            if not earnings_data:
                logger.warning("⚠️ No earnings calendar data fetched despite finding symbols with earnings")
                return False
            
            logger.info(f"📈 Fetched earnings data for {len(earnings_data)} entries")
            
            # Process and store data
            success = await self.data_processor.process_earnings_calendar(earnings_data)
            
            if success:
                execution_time = (datetime.now() - start_time).total_seconds()
                logger.info(f"✅ {self.job_name} completed successfully in {execution_time:.2f}s")
                logger.info(f"📊 Processed earnings for {len(symbols_with_earnings)} symbols ({len(earnings_data)} total entries)")
                return True
            else:
                logger.error(f"❌ {self.job_name} processing failed")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in {self.job_name} cron job: {e}")
    async def _find_symbols_with_earnings(self, symbols: List[str], from_date, to_date) -> List[str]:
        """Find symbols from the database that have earnings scheduled in the date range."""
        symbols_with_earnings = []
        
        logger.info(f"🔍 Checking {len(symbols)} symbols for earnings between {from_date} and {to_date}")
        
        # Process symbols in batches to avoid overwhelming providers
        batch_size = 10
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            
            logger.debug(f"🔄 Checking batch {batch_num}: {len(batch)} symbols")
            
            # Check each symbol in the batch concurrently
            batch_tasks = []
            for symbol in batch:
                batch_tasks.append(self._check_symbol_earnings(symbol, from_date, to_date))
            
            # Execute batch concurrently
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            # Process results
            for symbol, has_earnings in zip(batch, batch_results):
                if isinstance(has_earnings, Exception):
                    logger.warning(f"⚠️ Error checking earnings for {symbol}: {has_earnings}")
                elif has_earnings:
                    symbols_with_earnings.append(symbol)
            
            logger.debug(f"✅ Batch {batch_num} completed: {len([r for r in batch_results if not isinstance(r, Exception) and r])} symbols with earnings")
            
            # Small delay between batches
            if i + batch_size < len(symbols):
                await asyncio.sleep(0.5)
        
        logger.info(f"🎯 Found {len(symbols_with_earnings)}/{len(symbols)} symbols with earnings in the 30-day window")
        return symbols_with_earnings
    
    async def _check_symbol_earnings(self, symbol: str, from_date, to_date) -> bool:
        """Check if a symbol has earnings scheduled in the date range."""
        try:
            # Fetch earnings calendar for this specific symbol
            result = await self.market_data_brain.get_earnings_calendar(symbol)
            
            if result.success and result.data:
                # Check if any earnings fall within our date range
                for earnings in result.data:
                    earnings_date = earnings.get('date')
                    if earnings_date:
                        # Convert to date object if it's a string
                        if isinstance(earnings_date, str):
                            from datetime import datetime
                            earnings_date = datetime.fromisoformat(earnings_date).date()
                        
                        # Check if earnings date is within our window
                        if from_date <= earnings_date <= to_date:
                            logger.debug(f"📅 {symbol} has earnings on {earnings_date}")
                            return True
            
            return False
            
        except Exception as e:
            logger.warning(f"Error checking earnings for {symbol}: {e}")
            return False
    
    async def _get_database_symbols(self) -> List[str]:
        """Get symbols that exist in the database and need earnings calendar updates."""
        try:
            # Get symbols that haven't been updated in the last 7 days
            symbols = await self.earnings_calendar_db.get_symbols_needing_earnings_update(max_age_days=7)
            
            if not symbols:
                # Fallback: get all symbols in database
                logger.info("No symbols needing earnings update, getting all database symbols")
                symbols = await self.earnings_calendar_db.get_all_symbols()
            
            return symbols
            
        except Exception as e:
            logger.error(f"Error getting database symbols: {e}")
            return []
    
    async def _fetch_earnings_in_batches(self, symbols: List[str], batch_size: int = 20) -> List[Dict[str, Any]]:
        """Fetch earnings calendar data in batches to avoid rate limiting."""
        earnings_data = []
        total_batches = (len(symbols) + batch_size - 1) // batch_size
        
        logger.info(f"📦 Processing {len(symbols)} symbols in {total_batches} batches of {batch_size}")
        
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            
            logger.info(f"🔄 Processing batch {batch_num}/{total_batches}: {len(batch)} symbols")
            
            # Process batch with concurrent requests
            batch_tasks = []
            for symbol in batch:
                batch_tasks.append(self._fetch_single_earnings_calendar(symbol))
            
            # Execute batch concurrently
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            # Process results
            batch_success = 0
            for symbol, result in zip(batch, batch_results):
                if isinstance(result, Exception):
                    logger.warning(f"⚠️ Error fetching earnings for {symbol}: {result}")
                elif result and len(result) > 0:
                    earnings_data.extend(result)
                    batch_success += 1
            
            logger.info(f"✅ Batch {batch_num} completed: {batch_success}/{len(batch)} symbols with earnings data")
            
            # Small delay between batches to avoid overwhelming providers
            if i + batch_size < len(symbols):
                await asyncio.sleep(1.0)
        
        logger.info(f"🎉 Total earnings calendar entries fetched: {len(earnings_data)}")
        return earnings_data
    
    async def _fetch_single_earnings_calendar(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Fetch earnings calendar for a single symbol with error handling."""
        try:
            result = await self.market_data_brain.get_earnings_calendar(symbol)
            if result.success and result.data:
                # Add provider information to each earnings entry
                for entry in result.data:
                    entry['provider'] = result.provider or 'market_data_brain'
                return result.data
            else:
                logger.debug(f"No earnings calendar data for {symbol}")
                return []
        except Exception as e:
            logger.warning(f"Error fetching earnings calendar for {symbol}: {e}")
            return []
    
    async def _fetch_earnings_calendar_for_date_range(self, from_date, to_date, symbols_filter: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Fetch earnings calendar data for a specific date range."""
        try:
            # Use market data brain to fetch earnings calendar for date range
            result = await self.market_data_brain.get_earnings_calendar(
                start_date=from_date,
                end_date=to_date,
                symbols=symbols_filter
            )
            
            if result.success and result.data:
                # Add provider information to each earnings entry
                for entry in result.data:
                    entry['provider'] = result.provider or 'market_data_brain'
                
                logger.info(f"✅ Successfully fetched {len(result.data)} earnings calendar entries from {result.provider}")
                return result.data
            else:
                logger.warning(f"⚠️ No earnings calendar data returned from providers")
                return []
                
        except Exception as e:
            logger.error(f"❌ Error fetching earnings calendar for date range {from_date} to {to_date}: {e}")
            return []
    
    def _get_default_symbols(self) -> List[str]:
        """Get fallback symbols if database is empty."""
        return [
            # Major indices components
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "NFLX",
            "SPY", "QQQ", "IWM", "DIA",  # ETFs
            # Additional popular stocks
            "BRK.B", "JPM", "JNJ", "V", "PG", "UNH", "HD", "MA", "BAC", "XOM"
        ]
