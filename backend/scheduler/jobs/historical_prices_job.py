"""
Historical prices data fetching job.
Fetches end-of-day historical price data and stores using upsert functions.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime, timedelta

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class HistoricalPricesJob(BaseMarketDataJob):
    """Job for fetching and storing historical price data."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        """Initialize with database service and market data orchestrator."""
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Fetch historical price data for given symbols.
        
        Args:
            symbols: List of stock symbols to fetch historical data for
            
        Returns:
            Dictionary containing historical price data for all symbols
        """
        try:
            logger.info(f"Fetching historical prices for {len(symbols)} symbols")
            
            historical_data = {}
            
            # Get data for the last 30 days
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=30)
            
            # Process symbols in batches
            symbol_batches = self._batch_symbols(symbols, batch_size=5)
            
            for batch in symbol_batches:
                try:
                    batch_data = await self.orchestrator.get_historical_prices(
                        batch, start_date, end_date
                    )
                    historical_data.update(batch_data)
                    
                    # Delay between batches for rate limiting
                    await asyncio.sleep(2)
                    
                except Exception as e:
                    logger.error(f"Failed to fetch historical data for batch {batch}: {e}")
                    continue
            
            logger.info(f"Successfully fetched historical data for {len(historical_data)} symbols")
            return historical_data
            
        except Exception as e:
            logger.error(f"Error fetching historical prices: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """
        Store historical price data using database upsert function.
        
        Args:
            data: Dictionary containing historical price data by symbol
            
        Returns:
            True if all data stored successfully, False otherwise
        """
        if not data:
            return True
        
        try:
            success_count = 0
            total_records = 0
            
            for symbol, price_history in data.items():
                if not isinstance(price_history, list):
                    continue
                
                for price_record in price_history:
                    try:
                        # Extract exchange information if available
                        exchange_info = price_record.get('exchange', {})
                        
                        await self.db_service.execute_function(
                            "upsert_historical_price",
                            p_symbol=symbol,
                            p_date=price_record.get('date'),
                            p_data_provider=price_record.get('provider', 'unknown'),
                            
                            # Exchange parameters for automatic exchange handling
                            p_exchange_code=exchange_info.get('code') or price_record.get('exchange_code'),
                            p_exchange_name=exchange_info.get('name') or price_record.get('exchange_name'),
                            p_exchange_country=exchange_info.get('country') or price_record.get('country'),
                            p_exchange_timezone=exchange_info.get('timezone') or price_record.get('timezone'),
                            
                            # Price parameters matching SQL function signature
                            p_open=price_record.get('open'),
                            p_high=price_record.get('high'),
                            p_low=price_record.get('low'),
                            p_close=price_record.get('close'),
                            p_adjusted_close=price_record.get('adjusted_close'),
                            p_volume=price_record.get('volume'),
                            p_dividend=price_record.get('dividend'),
                            p_split_ratio=price_record.get('split_ratio') or price_record.get('split_coefficient')
                        )
                        success_count += 1
                        
                    except Exception as e:
                        logger.error(f"Failed to store historical price for {symbol}: {e}")
                    
                    total_records += 1
            
            logger.info(f"Stored {success_count}/{total_records} historical price records")
            return success_count == total_records
            
        except Exception as e:
            logger.error(f"Error storing historical prices: {e}")
            return False
