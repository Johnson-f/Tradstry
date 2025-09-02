#!/usr/bin/env python3
"""
Test script to manually trigger scheduler jobs for testing purposes.
This script allows you to run individual jobs or all jobs immediately.
"""

import asyncio
import sys
import os
import logging
from typing import List, Optional, Any
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scheduler.market_data_scheduler import MarketDataScheduler
from scheduler.config import SchedulerConfig
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain

class MockDatabaseService:
    """Mock database service for testing without Supabase"""
    
    async def get_tracked_symbols(self) -> List[str]:
        """Return test symbols"""
        return ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"]
    
    async def execute_function(self, function_name: str, **kwargs) -> Any:
        """Mock function execution"""
        logger.info(f"Mock: Executing {function_name} with {len(kwargs)} parameters")
        return True
    
    async def log_job_execution(self, job_name: str, status: str, message: str = ""):
        """Mock job logging"""
        logger.info(f"Mock: Job {job_name} - {status}: {message}")
        return True

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class SchedulerTester:
    """Test runner for scheduler jobs"""
    
    def __init__(self):
        self.scheduler = None
        self.brain = None
        self.db_service = None
    
    async def setup(self):
        """Initialize scheduler components"""
        try:
            # Initialize database service (requires Supabase client)
            from supabase import create_client
            import os
            
            # Get Supabase credentials from environment
            # Use service role key for scheduler operations to bypass RLS
            supabase_url = os.getenv('SUPABASE_URL')
            supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')
            
            if not supabase_url or not supabase_key:
                logger.warning("⚠️ Supabase credentials not found. Using mock database service.")
                self.db_service = MockDatabaseService()
            else:
                supabase_client = create_client(supabase_url, supabase_key)
                self.db_service = SchedulerDatabaseService(supabase_client)
            
            # Initialize market data brain
            self.brain = MarketDataBrain()
            await self.brain.initialize()
            
            # Initialize scheduler service
            from scheduler.market_data_scheduler import MarketDataSchedulerService
            self.scheduler = MarketDataSchedulerService(
                database_service=self.db_service,
                market_data_orchestrator=self.brain
            )
            
            logger.info("✅ Scheduler components initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize scheduler: {e}")
            raise
    
    async def cleanup(self):
        """Clean up resources"""
        try:
            if self.brain:
                await self.brain.close()
            if self.scheduler and hasattr(self.scheduler, 'shutdown'):
                await self.scheduler.shutdown()
            logger.info("✅ Cleanup completed")
        except Exception as e:
            logger.error(f"❌ Cleanup error: {e}")
    
    async def run_job(self, job_name: str) -> bool:
        """Run a specific job manually"""
        try:
            logger.info(f"🚀 Starting job: {job_name}")
            
            # Get symbols to process
            symbols = await self.db_service.get_tracked_symbols()
            if not symbols:
                logger.warning("⚠️ No symbols found in database. Using fallback symbols.")
                symbols = ["AAPL", "GOOGL", "MSFT"]  # Fallback for testing
            
            logger.info(f"📊 Processing {len(symbols)} symbols: {symbols[:5]}{'...' if len(symbols) > 5 else ''}")
            
            # Get job instance from scheduler
            job_instance = self.scheduler.jobs.get(job_name)
            
            if not job_instance:
                logger.error(f"❌ Job '{job_name}' not found. Available jobs: {list(self.scheduler.jobs.keys())}")
                return False
            
            # Run the job using execute method
            success = await job_instance.execute(symbols)
            
            if success:
                logger.info(f"✅ Job '{job_name}' completed successfully")
            else:
                logger.error(f"❌ Job '{job_name}' failed")
            
            return success
            
        except Exception as e:
            logger.error(f"❌ Error running job '{job_name}': {e}")
            return False
    
    async def run_all_jobs(self) -> dict:
        """Run all available jobs"""
        results = {}
        
        # Get all job names from config
        job_names = list(SchedulerConfig.JOBS.keys())
        
        logger.info(f"🚀 Running {len(job_names)} jobs...")
        
        for job_name in job_names:
            logger.info(f"\n{'='*50}")
            logger.info(f"Running: {job_name}")
            logger.info(f"{'='*50}")
            
            success = await self.run_job(job_name)
            results[job_name] = success
            
            # Small delay between jobs
            await asyncio.sleep(2)
        
        return results
    
    def print_results(self, results: dict):
        """Print job execution results"""
        logger.info(f"\n{'='*60}")
        logger.info("📋 JOB EXECUTION SUMMARY")
        logger.info(f"{'='*60}")
        
        successful = 0
        failed = 0
        
        for job_name, success in results.items():
            status = "✅ SUCCESS" if success else "❌ FAILED"
            logger.info(f"{job_name:<25} {status}")
            
            if success:
                successful += 1
            else:
                failed += 1
        
        logger.info(f"{'='*60}")
        logger.info(f"Total: {len(results)} | Successful: {successful} | Failed: {failed}")
        logger.info(f"{'='*60}")

async def main():
    """Main test function"""
    tester = SchedulerTester()
    
    try:
        # Setup
        await tester.setup()
        
        # Check command line arguments
        if len(sys.argv) > 1:
            job_name = sys.argv[1]
            logger.info(f"🎯 Running specific job: {job_name}")
            success = await tester.run_job(job_name)
            if success:
                logger.info(f"✅ Job '{job_name}' completed successfully")
            else:
                logger.error(f"❌ Job '{job_name}' failed")
        else:
            # Run all jobs
            logger.info("🎯 Running all scheduler jobs")
            results = await tester.run_all_jobs()
            tester.print_results(results)
    
    except KeyboardInterrupt:
        logger.info("⏹️ Test interrupted by user")
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
    finally:
        await tester.cleanup()

if __name__ == "__main__":
    print("""
🧪 SCHEDULER TEST RUNNER
========================

Usage:
  python test_scheduler.py                    # Run all jobs
  python test_scheduler.py stock_quotes       # Run specific job
  python test_scheduler.py company_info       # Run specific job

Available jobs:
  - stock_quotes
  - historical_prices  
  - options_chain
  - company_info
  - fundamental_data
  - earnings_data
  - earnings_calendar
  - earnings_transcripts
  - news_data
  - economic_events
  - economic_indicators
  - dividend_data

""")
    
    asyncio.run(main())
