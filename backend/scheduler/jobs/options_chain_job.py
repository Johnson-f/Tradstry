"""
Options chain data fetching job.
Fetches options chain data and stores using upsert functions.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class OptionsChainJob(BaseMarketDataJob):
    """Job for fetching and storing options chain data."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        """Initialize with database service and market data orchestrator."""
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Fetch options chain data for given symbols.
        
        Args:
            symbols: List of stock symbols to fetch options data for
            
        Returns:
            Dictionary containing options chain data for all symbols
        """
        try:
            logger.info(f"Fetching options chain for {len(symbols)} symbols")
            
            options_data = {}
            
            # Process symbols individually for options (more complex data)
            for symbol in symbols:
                try:
                    symbol_options = await self.orchestrator.get_options_chain(symbol)
                    if symbol_options:
                        options_data[symbol] = symbol_options
                    
                    # Delay between symbols for rate limiting
                    await asyncio.sleep(1)
                    
                except Exception as e:
                    logger.error(f"Failed to fetch options for {symbol}: {e}")
                    continue
            
            logger.info(f"Successfully fetched options data for {len(options_data)} symbols")
            return options_data
            
        except Exception as e:
            logger.error(f"Error fetching options chain: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """
        Store options chain data using database upsert function.
        
        Args:
            data: Dictionary containing options data by symbol
            
        Returns:
            True if all data stored successfully, False otherwise
        """
        if not data:
            return True
        
        try:
            success_count = 0
            total_records = 0
            
            for symbol, options_data in data.items():
                if not isinstance(options_data, dict):
                    continue
                
                # Process calls and puts separately
                for option_type in ['calls', 'puts']:
                    options_list = options_data.get(option_type, [])
                    
                    for option in options_list:
                        try:
                            await self.db_service.execute_function(
                                "upsert_options_chain",
                                p_symbol=symbol,
                                p_option_type=option_type.upper(),
                                p_strike_price=option.get('strike'),
                                p_expiration_date=option.get('expiration'),
                                p_bid_price=option.get('bid'),
                                p_ask_price=option.get('ask'),
                                p_last_price=option.get('last_price'),
                                p_volume=option.get('volume'),
                                p_open_interest=option.get('open_interest'),
                                p_implied_volatility=option.get('implied_volatility'),
                                p_delta=option.get('delta'),
                                p_gamma=option.get('gamma'),
                                p_theta=option.get('theta'),
                                p_vega=option.get('vega'),
                                p_rho=option.get('rho'),
                                p_quote_timestamp=option.get('timestamp', datetime.now()),
                                p_data_provider=option.get('provider', 'unknown')
                            )
                            success_count += 1
                            
                        except Exception as e:
                            logger.error(f"Failed to store option for {symbol}: {e}")
                        
                        total_records += 1
            
            logger.info(f"Stored {success_count}/{total_records} options records")
            return success_count == total_records
            
        except Exception as e:
            logger.error(f"Error storing options chain: {e}")
            return False
