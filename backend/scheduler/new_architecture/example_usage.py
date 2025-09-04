"""
Example usage of the new scheduler architecture.
This demonstrates how to use the redesigned scheduler system.
"""

import asyncio
import logging
from typing import Optional

from scheduler.scheduler_factory import SchedulerFactory, create_and_start_scheduler_system
from scheduler.main_scheduler import MainSchedulerService
from market_data.config import MarketDataConfig

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def example_basic_usage():
    """Basic usage example - start the complete system."""
    logger.info("=== Basic Usage Example ===")
    
    try:
        # Create and start the complete scheduler system
        scheduler = await create_and_start_scheduler_system()
        
        # Let it run for a short time
        logger.info("Scheduler started, running for 30 seconds...")
        await asyncio.sleep(30)
        
        # Check status
        status = scheduler.get_system_status()
        logger.info(f"System status: {status}")
        
        # Stop the scheduler
        await scheduler.stop()
        logger.info("Scheduler stopped")
        
    except Exception as e:
        logger.error(f"Error in basic usage example: {e}")


async def example_factory_pattern():
    """Example using the factory pattern with context manager."""
    logger.info("=== Factory Pattern Example ===")
    
    try:
        # Use factory with context manager for automatic cleanup
        async with SchedulerFactory() as factory:
            # Start the scheduler
            scheduler = await factory.start_scheduler()
            
            # Get system status
            status = await factory.get_scheduler_status()
            logger.info(f"Scheduler status: {status}")
            
            # Perform health check
            health = await factory.health_check()
            logger.info(f"Health check: {health['status']}")
            
            if health['status'] != 'healthy':
                logger.warning("System issues detected:")
                for issue in health.get('issues', []):
                    logger.warning(f"  - {issue}")
            
            # Get available jobs
            jobs = await factory.get_available_jobs()
            logger.info(f"Available jobs: {list(jobs.keys())}")
            
            # Manually trigger a job for testing
            logger.info("Manually triggering company_info job...")
            success = await factory.trigger_job_manually("company_info")
            logger.info(f"Manual trigger result: {success}")
            
            # Let it run briefly
            await asyncio.sleep(10)
            
        # Factory automatically cleans up here
        logger.info("Factory context manager completed cleanup")
        
    except Exception as e:
        logger.error(f"Error in factory pattern example: {e}")


async def example_custom_configuration():
    """Example with custom market data configuration."""
    logger.info("=== Custom Configuration Example ===")
    
    try:
        # Create custom configuration (normally from environment)
        config = MarketDataConfig.from_env()
        
        # Create scheduler with custom config
        scheduler = MainSchedulerService(config)
        await scheduler.start()
        
        # Check which providers are enabled
        status = scheduler.get_system_status()
        providers = status.get('available_providers', [])
        logger.info(f"Enabled providers: {providers}")
        
        # Manually trigger different types of jobs
        test_jobs = ["stock_quotes", "company_info", "news_data"]
        
        for job_name in test_jobs:
            logger.info(f"Testing {job_name} job...")
            success = await scheduler.trigger_job_manually(job_name)
            logger.info(f"{job_name} result: {'✅ Success' if success else '❌ Failed'}")
            
            # Small delay between jobs
            await asyncio.sleep(2)
        
        await scheduler.stop()
        logger.info("Custom configuration example completed")
        
    except Exception as e:
        logger.error(f"Error in custom configuration example: {e}")


async def example_monitoring_and_health():
    """Example demonstrating monitoring and health check features."""
    logger.info("=== Monitoring and Health Example ===")
    
    try:
        scheduler = MainSchedulerService()
        await scheduler.start()
        
        # Comprehensive health check
        health = await scheduler.health_check()
        
        logger.info(f"Overall system health: {health['status']}")
        
        # Check individual components
        for component, details in health.get('components', {}).items():
            status_emoji = "✅" if details['status'] == 'healthy' else "⚠️" if details['status'] == 'degraded' else "❌"
            logger.info(f"{status_emoji} {component}: {details['status']}")
            
            # Log additional details
            for key, value in details.items():
                if key != 'status':
                    logger.info(f"    {key}: {value}")
        
        # Log any issues
        if health.get('issues'):
            logger.warning("System issues detected:")
            for issue in health['issues']:
                logger.warning(f"  - {issue}")
        
        # Get detailed system status
        status = scheduler.get_system_status()
        
        logger.info("Scheduled Jobs:")
        for job in status.get('scheduled_jobs', []):
            logger.info(f"  - {job['name']}: Next run at {job['next_run_time']}")
        
        await scheduler.stop()
        
    except Exception as e:
        logger.error(f"Error in monitoring example: {e}")


async def example_error_handling():
    """Example demonstrating error handling and recovery."""
    logger.info("=== Error Handling Example ===")
    
    try:
        # Create scheduler but don't start it
        scheduler = MainSchedulerService()
        
        # Try to trigger job before starting (should fail gracefully)
        logger.info("Attempting to trigger job on stopped scheduler...")
        success = await scheduler.trigger_job_manually("stock_quotes")
        logger.info(f"Result (should be False): {success}")
        
        # Start the scheduler
        await scheduler.start()
        
        # Try to trigger a non-existent job
        logger.info("Attempting to trigger non-existent job...")
        success = await scheduler.trigger_job_manually("non_existent_job")
        logger.info(f"Result (should be False): {success}")
        
        # Try to trigger a valid job
        logger.info("Attempting to trigger valid job...")
        success = await scheduler.trigger_job_manually("company_info")
        logger.info(f"Result (should be True): {success}")
        
        await scheduler.stop()
        
        # Try to stop again (should be safe)
        logger.info("Attempting to stop already stopped scheduler...")
        await scheduler.stop()
        logger.info("Double stop completed safely")
        
    except Exception as e:
        logger.error(f"Error in error handling example: {e}")


async def run_all_examples():
    """Run all examples in sequence."""
    logger.info("🚀 Starting scheduler architecture examples...")
    
    examples = [
        ("Basic Usage", example_basic_usage),
        ("Factory Pattern", example_factory_pattern),
        ("Custom Configuration", example_custom_configuration),
        ("Monitoring and Health", example_monitoring_and_health),
        ("Error Handling", example_error_handling),
    ]
    
    for name, example_func in examples:
        logger.info(f"\n{'='*50}")
        logger.info(f"Running: {name}")
        logger.info(f"{'='*50}")
        
        try:
            await example_func()
            logger.info(f"✅ {name} completed successfully")
        except Exception as e:
            logger.error(f"❌ {name} failed: {e}")
        
        # Brief pause between examples
        await asyncio.sleep(2)
    
    logger.info("\n🎉 All examples completed!")


if __name__ == "__main__":
    # Run all examples
    asyncio.run(run_all_examples())
