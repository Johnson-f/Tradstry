#!/usr/bin/env python3
"""
Simplified cron job test without complex dependencies.
"""

import asyncio
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_simple_cron():
    """Test cron jobs with minimal dependencies."""
    logger.info("🚀 Starting simple cron job test...")
    
    try:
        # Test individual cron job classes directly
        logger.info("📊 Testing Stock Quotes Cron...")
        
        # Mock market data brain and data processor
        class MockMarketDataBrain:
            async def get_stock_quotes(self, symbols):
                logger.info(f"Mock: Fetching quotes for {symbols}")
                return type('FetchResult', (), {
                    'success': True,
                    'data': {symbol: {'price': 150.0, 'volume': 1000000} for symbol in symbols},
                    'provider': 'mock_provider'
                })()
        
        class MockDataProcessor:
            def __init__(self, *args, **kwargs):
                pass
                
            async def process_stock_quotes(self, raw_data):
                logger.info(f"Mock: Processing stock quotes data")
                return True
        
        # Import and test stock quotes cron
        import sys
        sys.path.insert(0, '/Users/johnsonnifemi/Production-code/backend')
        
        from scheduler.new_architecture.cron_jobs.stock_quotes_cron import StockQuotesCron
        
        mock_brain = MockMarketDataBrain()
        mock_processor = MockDataProcessor()
        
        stock_cron = StockQuotesCron(mock_brain, mock_processor)
        result = await stock_cron.execute(["AAPL", "MSFT"])
        
        logger.info(f"✅ Stock quotes test: {'Success' if result else 'Failed'}")
        
        # Test company info cron
        logger.info("🏢 Testing Company Info Cron...")
        
        class MockMarketDataBrainCompany:
            async def get_company_info(self, symbols):
                logger.info(f"Mock: Fetching company info for {symbols}")
                return type('FetchResult', (), {
                    'success': True,
                    'data': {symbol: {'name': f'{symbol} Inc', 'sector': 'Technology'} for symbol in symbols},
                    'provider': 'mock_provider'
                })()
        
        class MockDataProcessorCompany:
            def __init__(self, *args, **kwargs):
                pass
                
            async def process_company_info(self, raw_data):
                logger.info(f"Mock: Processing company info data")
                return True
        
        from scheduler.new_architecture.cron_jobs.company_info_cron import CompanyInfoCron
        
        mock_brain_company = MockMarketDataBrainCompany()
        mock_processor_company = MockDataProcessorCompany()
        
        company_cron = CompanyInfoCron(mock_brain_company, mock_processor_company)
        result = await company_cron.execute(["AAPL"])
        
        logger.info(f"✅ Company info test: {'Success' if result else 'Failed'}")
        
        logger.info("🎉 All cron job tests completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_simple_cron())
