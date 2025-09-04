#!/usr/bin/env python3
"""
Simple script to trigger cron jobs for testing.
"""

import asyncio
import logging
import sys
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_cron_trigger():
    """Test triggering cron jobs."""
    try:
        logger.info("🚀 Starting cron job test...")
        
        # Import after path setup
        sys.path.insert(0, '/Users/johnsonnifemi/Production-code/backend')
        
        from scheduler.new_architecture.cron_jobs.stock_quotes_cron import StockQuotesCron
        from scheduler.new_architecture.cron_jobs.company_info_cron import CompanyInfoCron
        from market_data.brain import MarketDataBrain
        from market_data.config import MarketDataConfig
        from scheduler.new_architecture.jobs.data_processor import DataProcessor
        from scheduler.database_service import SchedulerDatabaseService
        
        logger.info("✅ Imports successful")
        
        # Initialize components
        logger.info("🔧 Initializing components...")
        config = MarketDataConfig.from_env()
        market_data_brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        data_processor = DataProcessor(db_service, market_data_brain)
        
        logger.info("📊 Testing Stock Quotes...")
        stock_cron = StockQuotesCron(market_data_brain, data_processor)
        result = await stock_cron.execute(["AAPL", "MSFT"])
        logger.info(f"Stock quotes result: {'✅ Success' if result else '❌ Failed'}")
        
        logger.info("🏢 Testing Company Info...")
        company_cron = CompanyInfoCron(market_data_brain, data_processor)
        result = await company_cron.execute(["AAPL"])
        logger.info(f"Company info result: {'✅ Success' if result else '❌ Failed'}")
        
        logger.info("🎉 Cron job test completed!")
        
    except ImportError as e:
        logger.error(f"❌ Import error: {e}")
        logger.info("💡 Make sure you have the required dependencies installed")
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_cron_trigger())
