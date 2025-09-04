#!/usr/bin/env python3
"""
Test cron jobs with real market data providers.
"""

import asyncio
import logging
import sys
import os
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_real_data_fetching():
    """Test cron jobs with real market data providers."""
    try:
        logger.info("🚀 Starting real data fetching test...")
        
        # Add backend to path
        sys.path.insert(0, '/Users/johnsonnifemi/Production-code/backend')
        
        # Import components
        from scheduler.new_architecture.cron_jobs.stock_quotes_cron import StockQuotesCron
        from scheduler.new_architecture.cron_jobs.company_info_cron import CompanyInfoCron
        from market_data.brain import MarketDataBrain
        from market_data.config import MarketDataConfig
        from scheduler.new_architecture.jobs.data_processor import DataProcessor
        from scheduler.database_service import SchedulerDatabaseService
        
        logger.info("✅ Imports successful")
        
        # Initialize real components
        logger.info("🔧 Initializing real market data components...")
        
        # Create market data config
        config = MarketDataConfig()
        
        # Check if we have API keys configured
        logger.info("🔑 Checking API configuration...")
        
        # Initialize MarketDataBrain with real providers
        market_data_brain = MarketDataBrain(config)
        
        # Initialize database service
        db_service = SchedulerDatabaseService()
        
        # Initialize data processor with aggregation
        data_processor = DataProcessor(db_service, market_data_brain)
        
        logger.info("✅ Components initialized successfully")
        
        # Test symbols
        test_symbols = ["AAPL", "MSFT"]
        
        logger.info("📊 Testing Stock Quotes with real data...")
        stock_cron = StockQuotesCron(market_data_brain, data_processor)
        
        start_time = datetime.now()
        result = await stock_cron.execute(test_symbols)
        duration = (datetime.now() - start_time).total_seconds()
        
        logger.info(f"Stock quotes result: {'✅ Success' if result else '❌ Failed'} ({duration:.2f}s)")
        
        if result:
            logger.info("🎯 Multi-provider aggregation worked!")
        else:
            logger.warning("⚠️ Stock quotes failed - check API keys or provider availability")
        
        logger.info("🏢 Testing Company Info with real data...")
        company_cron = CompanyInfoCron(market_data_brain, data_processor)
        
        start_time = datetime.now()
        result = await company_cron.execute(["AAPL"])
        duration = (datetime.now() - start_time).total_seconds()
        
        logger.info(f"Company info result: {'✅ Success' if result else '❌ Failed'} ({duration:.2f}s)")
        
        if result:
            logger.info("🎯 Company data aggregation worked!")
        else:
            logger.warning("⚠️ Company info failed - check API keys or provider availability")
        
        logger.info("🎉 Real data testing completed!")
        
    except ImportError as e:
        logger.error(f"❌ Import error: {e}")
        logger.info("💡 Make sure all dependencies are installed")
    except Exception as e:
        logger.error(f"❌ Error during real data test: {e}")
        import traceback
        traceback.print_exc()
        
        # Provide troubleshooting info
        logger.info("\n🔧 Troubleshooting:")
        logger.info("1. Check if API keys are set in environment variables")
        logger.info("2. Verify market_data providers are configured")
        logger.info("3. Ensure database connection is working")
        logger.info("4. Check if market is open (for real-time data)")

async def test_aggregation_coverage():
    """Test the multi-provider aggregation system."""
    try:
        logger.info("🔄 Testing multi-provider data aggregation...")
        
        sys.path.insert(0, '/Users/johnsonnifemi/Production-code/backend')
        
        from scheduler.new_architecture.jobs.data_aggregator import DataAggregator
        from market_data.brain import MarketDataBrain
        from market_data.config import MarketDataConfig
        
        # Initialize components
        config = MarketDataConfig()
        market_data_brain = MarketDataBrain(config)
        aggregator = DataAggregator(market_data_brain)
        
        # Test aggregation for stock quotes
        logger.info("📊 Testing stock quotes aggregation...")
        result = await aggregator.aggregate_stock_quotes(["AAPL"])
        
        if result['success']:
            coverage = result['coverage']
            logger.info(f"✅ Aggregation successful - Coverage: {coverage:.1f}%")
            
            if result['missing_fields']:
                logger.info(f"⚠️ Missing fields: {len(result['missing_fields'])}")
            else:
                logger.info("🎯 Complete data coverage achieved!")
        else:
            logger.warning("❌ Aggregation failed")
        
        # Test company info aggregation
        logger.info("🏢 Testing company info aggregation...")
        result = await aggregator.aggregate_company_info(["AAPL"])
        
        if result['success']:
            coverage = result['coverage']
            logger.info(f"✅ Company aggregation successful - Coverage: {coverage:.1f}%")
        else:
            logger.warning("❌ Company aggregation failed")
            
    except Exception as e:
        logger.error(f"❌ Aggregation test error: {e}")
        import traceback
        traceback.print_exc()

async def main():
    """Main test function."""
    logger.info("🎯 Real Data Fetching Test")
    logger.info("=" * 50)
    
    # Test 1: Basic real data fetching
    logger.info("\n📋 TEST 1: Real Data Fetching")
    logger.info("-" * 30)
    await test_real_data_fetching()
    
    # Test 2: Multi-provider aggregation
    logger.info("\n📋 TEST 2: Multi-Provider Aggregation")
    logger.info("-" * 30)
    await test_aggregation_coverage()
    
    logger.info("\n🏁 All tests completed!")

if __name__ == "__main__":
    asyncio.run(main())
