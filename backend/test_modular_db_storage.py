#!/usr/bin/env python3
"""
Test modular database storage with new architecture.
"""

import asyncio
import logging
import sys
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_modular_storage():
    """Test modular database storage architecture."""
    try:
        logger.info("🚀 Starting modular database storage test...")
        
        # Add backend to path
        sys.path.insert(0, '/Users/johnsonnifemi/Production-code/backend')
        
        # Import components
        from scheduler.new_architecture.cron_jobs.stock_quotes_cron import StockQuotesCron
        from scheduler.new_architecture.cron_jobs.company_info_cron import CompanyInfoCron
        from market_data.brain import MarketDataBrain
        from market_data.config import MarketDataConfig
        from scheduler.new_architecture.jobs.data_processor import DataProcessor
        
        logger.info("✅ Imports successful")
        
        # Initialize components with new modular architecture
        logger.info("🔧 Initializing modular components...")
        config = MarketDataConfig()
        market_data_brain = MarketDataBrain(config)
        
        # DataProcessor now uses modular database services
        data_processor = DataProcessor(supabase_client=None, market_data_brain=market_data_brain)
        
        logger.info("✅ Modular components initialized")
        
        # Test symbols
        test_symbols = ["AAPL", "MSFT"]
        
        logger.info("📊 Testing Stock Quotes with Modular DB Service...")
        stock_cron = StockQuotesCron(market_data_brain, data_processor)
        
        start_time = datetime.now()
        result = await stock_cron.execute(test_symbols)
        duration = (datetime.now() - start_time).total_seconds()
        
        if result:
            logger.info(f"✅ Stock quotes stored via modular service in {duration:.2f}s")
        else:
            logger.error(f"❌ Stock quotes storage failed after {duration:.2f}s")
        
        logger.info("🏢 Testing Company Info with Modular DB Service...")
        company_cron = CompanyInfoCron(market_data_brain, data_processor)
        
        start_time = datetime.now()
        result = await company_cron.execute(["AAPL"])
        duration = (datetime.now() - start_time).total_seconds()
        
        if result:
            logger.info(f"✅ Company info stored via modular service in {duration:.2f}s")
        else:
            logger.error(f"❌ Company info storage failed after {duration:.2f}s")
        
        # Clean up connections
        await market_data_brain.close()
        await data_processor.stock_quotes_db.close()
        await data_processor.company_info_db.close()
        await data_processor.fundamental_data_db.close()
        await data_processor.dividend_data_db.close()
        await data_processor.earnings_data_db.close()
        
        logger.info("🎉 Modular database storage test completed!")
        
    except Exception as e:
        logger.error(f"❌ Error during modular test: {e}")
        import traceback
        traceback.print_exc()

async def main():
    """Main test function."""
    logger.info("🎯 Modular Database Storage Test")
    logger.info("=" * 50)
    
    await test_modular_storage()
    
    logger.info("\n🏁 All modular database tests completed!")

if __name__ == "__main__":
    asyncio.run(main())
