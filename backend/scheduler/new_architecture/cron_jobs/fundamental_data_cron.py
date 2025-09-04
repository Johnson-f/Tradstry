"""
Fundamental data cron job - fetches financial statements and fundamental metrics.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from market_data.brain import MarketDataBrain
from ..jobs.data_processor import DataProcessor

logger = logging.getLogger(__name__)


class FundamentalDataCron:
    """Cron job for fetching fundamental data."""
    
    def __init__(self, market_data_brain: MarketDataBrain, data_processor: DataProcessor):
        """Initialize fundamental data cron job."""
        self.market_data_brain = market_data_brain
        self.data_processor = data_processor
        self.job_name = "fundamental_data"
    
    async def execute(self, symbols: Optional[List[str]] = None, statement_types: Optional[List[str]] = None) -> bool:
        """
        Execute fundamental data fetching and processing.
        
        Args:
            symbols: List of stock symbols to fetch. If None, uses default symbols.
            statement_types: Types of financial statements. If None, uses all types.
            
        Returns:
            bool: True if execution was successful
        """
        try:
            start_time = datetime.now()
            logger.info(f"🔄 Starting {self.job_name} cron job")
            
            # Use default symbols if none provided
            if not symbols:
                symbols = self._get_default_symbols()
            
            # Use default statement types if none provided
            if not statement_types:
                statement_types = self._get_default_statement_types()
            
            logger.info(f"Fetching fundamental data for {len(symbols)} symbols, {len(statement_types)} statement types")
            
            # Fetch data from market_data providers
            fetch_result = await self.market_data_brain.get_fundamentals(symbols, statement_types)
            
            if not fetch_result.success:
                logger.error(f"❌ Failed to fetch fundamental data: {fetch_result.error}")
                return False
            
            # Process and store data
            raw_data = {
                "data_type": "fundamental_data",
                "data": fetch_result.data,
                "provider": fetch_result.provider,
                "timestamp": start_time.isoformat(),
                "statement_types": statement_types
            }
            
            success = await self.data_processor.process_fundamentals(raw_data)
            
            if success:
                execution_time = (datetime.now() - start_time).total_seconds()
                logger.info(f"✅ {self.job_name} completed successfully in {execution_time:.2f}s")
                return True
            else:
                logger.error(f"❌ {self.job_name} processing failed")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in {self.job_name} cron job: {e}")
            return False
    
    def _get_default_symbols(self) -> List[str]:
        """Get default list of symbols for fundamental data."""
        return [
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "NFLX",
            "BRK.B", "JPM", "JNJ", "V", "PG", "UNH", "HD", "MA", "BAC", "XOM"
        ]
    
    def _get_default_statement_types(self) -> List[str]:
        """Get default list of financial statement types."""
        return [
            "income_statement",     # Profit & Loss
            "balance_sheet",        # Assets, Liabilities, Equity
            "cash_flow",           # Cash Flow Statement
            "key_metrics",         # Financial Ratios and Metrics
            "financial_ratios"     # P/E, P/B, ROE, etc.
        ]
