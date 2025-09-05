"""
Fundamental data cron job - fetches financial statements and fundamental metrics.
Runs weekly to update fundamental data for all symbols in the database.
"""

import logging
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from decimal import Decimal

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor
from ..jobs.db_services.fundamental_data_db import FundamentalDataDB
from ..jobs.db_services.stock_quotes_db import StockQuotesDB

logger = logging.getLogger(__name__)

# Global provider blacklist to skip subscription-required providers
PROVIDER_BLACKLIST = set()


def convert_decimals_to_numbers(data: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively convert Decimal objects to appropriate numeric types."""
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            result[key] = convert_decimals_to_numbers(value)
        return result
    elif isinstance(data, list):
        return [convert_decimals_to_numbers(item) for item in data]
    elif isinstance(data, Decimal):
        # Convert specific fields to int for BIGINT database columns
        if key in ['market_cap', 'enterprise_value', 'shares_outstanding', 'fiscal_year', 'fiscal_quarter']:
            return int(value)
        else:
            return float(value)
    else:
        return data


class FundamentalDataCron:
    """Cron job for fetching fundamental data weekly."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize fundamental data cron job."""
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.fundamental_data_db = FundamentalDataDB()
        self.stock_quotes_db = StockQuotesDB()
        self.job_name = "fundamental_data"
    
    async def execute(self, symbols: Optional[List[str]] = None) -> bool:
        """
        Execute fundamental data fetching and processing.
        Fetches symbols from database and updates fundamental data weekly.
        
        Args:
            symbols: List of stock symbols to fetch. If None, gets symbols from database.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job - weekly fundamental data update")
            
            # Get symbols from database if none provided
            if not symbols:
                symbols = await self._get_database_symbols()
            
            if not symbols:
                logger.warning("No symbols found in database to update")
                return False
            
            logger.info(f"Updating fundamental data for {len(symbols)} database symbols: {symbols[:5]}{'...' if len(symbols) > 5 else ''}")
            
            # Generate quarters for current and previous year
            quarters = self._generate_recent_quarters()
            logger.info(f"Fetching data for {len(quarters)} quarters: {quarters}")
            
            # Fetch fundamental data in batches
            fundamentals_data = await self._fetch_fundamentals_in_batches(symbols, quarters, batch_size=10)
            
            if not fundamentals_data:
                logger.error("❌ Failed to fetch any fundamental data")
                return False
            
            # Store data in database
            success = await self._store_fundamentals_in_database(fundamentals_data)
            
            if success:
                execution_time = (datetime.now() - start_time).total_seconds()
                total_records = sum(len(data) for data in fundamentals_data.values())
                logger.info(f"✅ {self.job_name} completed successfully in {execution_time:.2f}s")
                logger.info(f"📊 Updated fundamental data for {len(fundamentals_data)}/{len(symbols)} symbols")
                logger.info(f"📈 Total records processed: {total_records}")
                return True
            else:
                logger.error(f"❌ {self.job_name} database storage failed")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in {self.job_name} cron job: {e}")
            return False
    
    async def _get_database_symbols(self) -> List[str]:
        """Get symbols from database that need fundamental data updates."""
        try:
            # Get all symbols from stock quotes table (these are actively tracked symbols)
            symbols = await self.stock_quotes_db.get_all_symbols()
            
            if not symbols:
                logger.warning("No symbols found in database, using fallback symbols")
                symbols = self._get_fallback_symbols()
            
            logger.info(f"Found {len(symbols)} symbols in database for fundamental data update")
            return symbols
            
        except Exception as e:
            logger.error(f"Error getting database symbols: {e}")
            return self._get_fallback_symbols()
    
    def _get_fallback_symbols(self) -> List[str]:
        """Get fallback symbols if database query fails."""
        return [
            # Major tech stocks
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "NFLX",
            # Financial sector
            "JPM", "BAC", "WFC", "GS", "MS",
            # Healthcare
            "JNJ", "PFE", "UNH", "ABBV",
            # Consumer goods
            "PG", "KO", "PEP", "WMT",
            # Industrial
            "GE", "BA", "CAT", "MMM",
            # Energy
            "XOM", "CVX", "COP"
        ]
    
    def _generate_recent_quarters(self) -> List[tuple]:
        """Generate recent quarters for fundamental data fetching."""
        quarters = []
        current_year = datetime.now().year
        
        # Get current and previous year quarters
        for year in [current_year - 1, current_year]:
            for quarter in [1, 2, 3, 4]:
                quarters.append((year, quarter))
        
        return quarters
    
    async def _fetch_fundamentals_in_batches(self, symbols: List[str], quarters: List[tuple], batch_size: int = 10) -> Dict[str, List[Dict]]:
        """Fetch fundamental data in batches to avoid rate limiting."""
        fundamentals_data = {}
        total_batches = (len(symbols) + batch_size - 1) // batch_size
        
        logger.info(f"📦 Processing {len(symbols)} symbols in {total_batches} batches of {batch_size}")
        
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            
            logger.info(f"🔄 Processing batch {batch_num}/{total_batches}: {len(batch)} symbols")
            
            # Process batch with concurrent requests
            batch_tasks = []
            for symbol in batch:
                batch_tasks.append(self._fetch_fundamental_data_for_symbol(symbol, quarters))
            
            # Execute batch concurrently
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            # Process results
            batch_success = 0
            for symbol, result in zip(batch, batch_results):
                if isinstance(result, Exception):
                    logger.warning(f"⚠️ Error fetching {symbol}: {result}")
                elif result:
                    fundamentals_data[symbol] = result
                    batch_success += 1
            
            logger.info(f"✅ Batch {batch_num} completed: {batch_success}/{len(batch)} successful")
            
            # Delay between batches to respect rate limits
            if i + batch_size < len(symbols):
                await asyncio.sleep(2.0)
        
        logger.info(f"🎉 Total symbols with fundamental data: {len(fundamentals_data)}/{len(symbols)} ({len(fundamentals_data)/len(symbols)*100:.1f}%)")
        return fundamentals_data
    
    async def _fetch_fundamental_data_for_symbol(self, symbol: str, quarters: List[tuple]) -> List[Dict]:
        """Fetch fundamental data for a single symbol across multiple quarters."""
        symbol_data = []
        
        for year, quarter in quarters:
            try:
                # Fetch data from all available providers and combine
                combined_data = await self._fetch_fundamental_data_from_all_providers(symbol)
                
                if combined_data:
                    # Add quarter and year information
                    combined_data['fiscal_year'] = year
                    combined_data['fiscal_quarter'] = quarter
                    combined_data['symbol'] = symbol
                    
                    # Convert decimals for database storage
                    combined_data = convert_decimals_to_numbers(combined_data)
                    
                    symbol_data.append(combined_data)
                    
            except Exception as e:
                logger.warning(f"Error fetching {symbol} Q{quarter} {year}: {e}")
                continue
        
        if symbol_data:
            logger.info(f"✅ Got fundamental data for {symbol} - {len(symbol_data)} quarterly records")
        
        return symbol_data
    
    async def _fetch_fundamental_data_from_all_providers(self, symbol: str) -> Dict[str, Any]:
        """Fetch fundamental data from all available providers and combine results."""
        global PROVIDER_BLACKLIST
        
        # Available providers for fundamental data
        fundamental_providers = ['finnhub', 'polygon', 'twelve_data', 'alpha_vantage', 'tiingo', 'fiscal']
        
        combined_data = {}
        successful_providers = []
        
        for provider_name in fundamental_providers:
            try:
                if provider_name in PROVIDER_BLACKLIST:
                    continue
                
                # Get provider instance
                provider = getattr(self.market_data_brain, f'{provider_name}_provider', None)
                if not provider:
                    continue
                
                # Fetch data from provider
                provider_data = await provider.get_fundamentals(symbol)
                
                if provider_data and isinstance(provider_data, dict):
                    # Merge non-null data, prioritizing non-zero values
                    for key, value in provider_data.items():
                        if value is not None and value != 0 and value != "":
                            if key not in combined_data or combined_data[key] is None or combined_data[key] == 0:
                                combined_data[key] = value
                    
                    successful_providers.append(provider_name)
                    
            except Exception as e:
                error_msg = str(e).lower()
                
                # Check for subscription errors
                subscription_error = any(phrase in error_msg for phrase in [
                    'subscription', 'pro plan', 'upgrade', 'premium', 'legacy endpoint',
                    'not authorized', 'forbidden', 'access denied', 'requires subscription'
                ])
                
                if subscription_error:
                    logger.warning(f"Provider {provider_name} requires subscription - blacklisting")
                    PROVIDER_BLACKLIST.add(provider_name)
                    # Mark provider as rate limited to avoid retries
                    self.market_data_brain._mark_provider_rate_limited(provider_name)
                else:
                    logger.debug(f"Error fetching from {provider_name} for {symbol}: {e}")
        
        if successful_providers:
            logger.info(f"🎯 Combined data from {len(successful_providers)} providers: {successful_providers}")
            logger.info(f"📈 Total fields collected: {len(combined_data)}")
        
        return combined_data
    
    async def _store_fundamentals_in_database(self, fundamentals_data: Dict[str, List[Dict]]) -> bool:
        """Store fundamental data in database."""
        try:
            # Flatten data for database storage
            all_records = []
            for symbol, records in fundamentals_data.items():
                all_records.extend(records)
            
            if not all_records:
                logger.warning("No fundamental data to store")
                return False
            
            # Store using database service
            success = await self.fundamental_data_db.upsert_fundamental_data(all_records)
            
            if success:
                logger.info(f"✅ Successfully stored {len(all_records)} fundamental data records")
            else:
                logger.error("❌ Failed to store fundamental data in database")
            
            return success
            
        except Exception as e:
            logger.error(f"Error storing fundamental data: {e}")
            return False
