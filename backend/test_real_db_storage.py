#!/usr/bin/env python3
"""
Test real data fetching and database storage end-to-end.
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

async def test_end_to_end_storage():
    """Test complete data flow from fetch to database storage."""
    try:
        logger.info("🚀 Starting end-to-end database storage test...")
        
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
        logger.info("🔧 Initializing components...")
        config = MarketDataConfig()
        market_data_brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        data_processor = DataProcessor(db_service, market_data_brain)
        
        logger.info("✅ Components initialized")
        
        # Test symbols
        test_symbols = ["AAPL", "MSFT"]
        
        logger.info("📊 Testing Stock Quotes with Database Storage...")
        stock_cron = StockQuotesCron(market_data_brain, data_processor)
        
        start_time = datetime.now()
        result = await stock_cron.execute(test_symbols)
        duration = (datetime.now() - start_time).total_seconds()
        
        if result:
            logger.info(f"✅ Stock quotes stored successfully in {duration:.2f}s")
        else:
            logger.error(f"❌ Stock quotes storage failed after {duration:.2f}s")
        
        logger.info("🏢 Testing Company Info with Database Storage...")
        company_cron = CompanyInfoCron(market_data_brain, data_processor)
        
        start_time = datetime.now()
        result = await company_cron.execute(["AAPL"])
        duration = (datetime.now() - start_time).total_seconds()
        
        if result:
            logger.info(f"✅ Company info stored successfully in {duration:.2f}s")
        else:
            logger.error(f"❌ Company info storage failed after {duration:.2f}s")
        
        # Clean up connections
        await market_data_brain.close()
        await db_service.close()
        
        logger.info("🎉 End-to-end database storage test completed!")
        
    except Exception as e:
        logger.error(f"❌ Error during end-to-end test: {e}")
        import traceback
        traceback.print_exc()

async def test_data_validation():
    """Test data validation and transformation."""
    try:
        logger.info("🔍 Testing data validation...")
        
        sys.path.insert(0, '/Users/johnsonnifemi/Production-code/backend')
        
        from scheduler.new_architecture.jobs.data_validator import DataValidator
        
        # Test stock quote validation
        valid_quote = {
            'symbol': 'AAPL',
            'price': 150.25,
            'volume': 1000000,
            'change': 2.5
        }
        
        invalid_quote = {
            'symbol': 'AAPL',
            'price': -10,  # Invalid negative price
            'volume': 'invalid'  # Invalid volume
        }
        
        logger.info(f"Valid quote validation: {DataValidator.validate_stock_quote_data(valid_quote)}")
        logger.info(f"Invalid quote validation: {DataValidator.validate_stock_quote_data(invalid_quote)}")
        
        # Test company info validation
        valid_company = {
            'symbol': 'AAPL',
            'name': 'Apple Inc.',
            'sector': 'Technology'
        }
        
        invalid_company = {
            'symbol': 'AAPL'
            # Missing name and sector
        }
        
        logger.info(f"Valid company validation: {DataValidator.validate_company_info_data(valid_company)}")
        logger.info(f"Invalid company validation: {DataValidator.validate_company_info_data(invalid_company)}")
        
        logger.info("✅ Data validation tests completed")
        
    except Exception as e:
        logger.error(f"❌ Data validation test error: {e}")
        import traceback
        traceback.print_exc()

async def main():
    """Main test function."""
    logger.info("🎯 Real Database Storage Test")
    logger.info("=" * 50)
    
    # Test 1: Data validation
    logger.info("\n📋 TEST 1: Data Validation")
    logger.info("-" * 30)
    await test_data_validation()
    
    # Test 2: End-to-end storage
    logger.info("\n📋 TEST 2: End-to-End Database Storage")
    logger.info("-" * 30)
    await test_end_to_end_storage()
    
    logger.info("\n🏁 All database storage tests completed!")

if __name__ == "__main__":
    asyncio.run(main())
