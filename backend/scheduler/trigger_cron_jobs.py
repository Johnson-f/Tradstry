#!/usr/bin/env python3
"""
Script to trigger cron jobs manually for testing and demonstration.
"""

import asyncio
import logging
import sys
import os

# Add the backend directory to the Python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Simple test without complex imports for now
print("🚀 Testing cron job trigger...")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def trigger_individual_jobs():
    """Trigger individual cron jobs for demonstration."""
    try:
        logger.info("🚀 Initializing components...")
        
        # Initialize components
        config = MarketDataConfig.from_env()
        market_data_brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        data_processor = DataProcessor(db_service, market_data_brain)
        
        # Test symbols
        test_symbols = ["AAPL", "MSFT", "GOOGL"]
        
        logger.info("📊 Testing Stock Quotes Cron Job...")
        stock_cron = StockQuotesCron(market_data_brain, data_processor)
        success = await stock_cron.execute(test_symbols)
        logger.info(f"Stock quotes result: {'✅ Success' if success else '❌ Failed'}")
        
        logger.info("🏢 Testing Company Info Cron Job...")
        company_cron = CompanyInfoCron(market_data_brain, data_processor)
        success = await company_cron.execute(test_symbols)
        logger.info(f"Company info result: {'✅ Success' if success else '❌ Failed'}")
        
        logger.info("💰 Testing Dividend Data Cron Job...")
        dividend_cron = DividendDataCron(market_data_brain, data_processor)
        success = await dividend_cron.execute(["AAPL", "MSFT"])  # Dividend-paying stocks
        logger.info(f"Dividend data result: {'✅ Success' if success else '❌ Failed'}")
        
        logger.info("📅 Testing Earnings Calendar Cron Job...")
        earnings_cron = EarningsCalendarCron(market_data_brain, data_processor)
        success = await earnings_cron.execute(30)  # Next 30 days
        logger.info(f"Earnings calendar result: {'✅ Success' if success else '❌ Failed'}")
        
        logger.info("📰 Testing News Articles Cron Job...")
        news_cron = NewsArticlesCron(market_data_brain, data_processor)
        success = await news_cron.execute(test_symbols)
        logger.info(f"News articles result: {'✅ Success' if success else '❌ Failed'}")
        
        logger.info("🎉 All cron jobs triggered successfully!")
        
    except Exception as e:
        logger.error(f"❌ Error triggering cron jobs: {e}")
        import traceback
        traceback.print_exc()


async def trigger_scheduler_system():
    """Trigger the complete scheduler system."""
    try:
        logger.info("🚀 Starting complete scheduler system...")
        
        # Create and start the complete system
        scheduler = await create_and_start_scheduler_system()
        
        logger.info("✅ Scheduler system started successfully!")
        logger.info("📊 System status:")
        
        # Get system status
        status = scheduler.get_system_status()
        logger.info(f"  - Main service running: {status.get('main_service_running', False)}")
        logger.info(f"  - Cron scheduler running: {status.get('cron_scheduler_running', False)}")
        logger.info(f"  - Available providers: {status.get('available_providers', [])}")
        
        # Manually trigger a few jobs for demonstration
        logger.info("🎯 Manually triggering some jobs...")
        
        jobs_to_trigger = ["stock_quotes", "company_info", "earnings_calendar"]
        for job_name in jobs_to_trigger:
            logger.info(f"Triggering {job_name}...")
            success = await scheduler.trigger_job_manually(job_name)
            logger.info(f"{job_name}: {'✅ Success' if success else '❌ Failed'}")
        
        # Let it run for a short time
        logger.info("⏰ Letting scheduler run for 30 seconds...")
        await asyncio.sleep(30)
        
        # Stop the scheduler
        await scheduler.stop()
        logger.info("🛑 Scheduler stopped")
        
    except Exception as e:
        logger.error(f"❌ Error with scheduler system: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """Main function to run the cron job triggers."""
    logger.info("🎯 Cron Job Trigger Script")
    logger.info("=" * 50)
    
    # Choose which method to use
    method = input("Choose trigger method:\n1. Individual jobs\n2. Complete scheduler system\nEnter choice (1 or 2): ").strip()
    
    if method == "1":
        await trigger_individual_jobs()
    elif method == "2":
        await trigger_scheduler_system()
    else:
        logger.info("Running both methods...")
        logger.info("\n" + "="*50)
        logger.info("METHOD 1: Individual Jobs")
        logger.info("="*50)
        await trigger_individual_jobs()
        
        logger.info("\n" + "="*50)
        logger.info("METHOD 2: Complete System")
        logger.info("="*50)
        await trigger_scheduler_system()


if __name__ == "__main__":
    asyncio.run(main())
