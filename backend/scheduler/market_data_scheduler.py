"""
Main market data scheduler service.
Orchestrates all market data fetching jobs and manages their lifecycle.
"""

import logging
from typing import Dict, List, Optional, Any
import asyncio

from scheduler.base_scheduler import MarketDataScheduler
from scheduler.config import SchedulerConfig
from scheduler.jobs.stock_quotes_job import StockQuotesJob
from scheduler.jobs.historical_prices_job import HistoricalPricesJob
from scheduler.jobs.options_chain_job import OptionsChainJob
from scheduler.jobs.company_info_job import CompanyInfoJob
from scheduler.jobs.fundamentals_job import FundamentalsJob
from scheduler.jobs.earnings_job import EarningsDataJob, EarningsCalendarJob, EarningsTranscriptsJob
from scheduler.jobs.news_job import NewsDataJob
from scheduler.jobs.economic_job import EconomicEventsJob, EconomicIndicatorsJob
from scheduler.jobs.dividend_job import DividendDataJob

from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class MarketDataSchedulerService:
    """
    Main service for managing all market data fetching jobs.
    Coordinates between the scheduler and individual job implementations.
    """
    
    def __init__(self, database_service: SchedulerDatabaseService, market_data_orchestrator: MarketDataBrain):
        """Initialize the scheduler service with dependencies."""
        self.db_service = database_service
        self.orchestrator = market_data_orchestrator
        self.scheduler = MarketDataScheduler()
        self.jobs: Dict[str, Any] = {}
        
        # Initialize all job instances
        self._initialize_jobs()
    
    def _initialize_jobs(self):
        """Initialize all market data job instances."""
        self.jobs = {
            "stock_quotes": StockQuotesJob(self.db_service, self.orchestrator),
            "historical_prices": HistoricalPricesJob(self.db_service, self.orchestrator),
            "options_chain": OptionsChainJob(self.db_service, self.orchestrator),
            "company_info": CompanyInfoJob(self.db_service, self.orchestrator),
            "fundamental_data": FundamentalsJob(self.db_service, self.orchestrator),
            "earnings_data": EarningsDataJob(self.db_service, self.orchestrator),
            "earnings_calendar": EarningsCalendarJob(self.db_service, self.orchestrator),
            "earnings_transcripts": EarningsTranscriptsJob(self.db_service, self.orchestrator),
            "news_data": NewsDataJob(self.db_service, self.orchestrator),
            "economic_events": EconomicEventsJob(self.db_service, self.orchestrator),
            "economic_indicators": EconomicIndicatorsJob(self.db_service, self.orchestrator),
            "dividend_data": DividendDataJob(self.db_service, self.orchestrator)
        }
    
    async def start_all_jobs(self):
        """Start the scheduler and register all market data jobs."""
        try:
            logger.info("Starting market data scheduler service")
            
            # Register all jobs with their configurations
            for job_name, job_instance in self.jobs.items():
                job_config = SchedulerConfig.get_job_config(job_name)
                
                # Create wrapper function for the job
                async def job_wrapper(job=job_instance):
                    return await job.execute()
                
                # Add job to scheduler
                self.scheduler.add_job(job_name, job_wrapper, job_config)
            
            # Start the scheduler
            await self.scheduler.start()
            
            logger.info("All market data jobs scheduled successfully")
            
        except Exception as e:
            logger.error(f"Failed to start market data scheduler: {e}")
            raise
    
    async def stop_all_jobs(self):
        """Stop the scheduler and all jobs."""
        try:
            await self.scheduler.stop()
            logger.info("Market data scheduler service stopped")
        except Exception as e:
            logger.error(f"Error stopping scheduler service: {e}")
    
    async def run_job_manually(self, job_name: str, symbols: Optional[List[str]] = None) -> bool:
        """
        Manually execute a specific job outside of its schedule.
        
        Args:
            job_name: Name of the job to run
            symbols: Optional list of symbols to process
            
        Returns:
            True if job completed successfully
        """
        if job_name not in self.jobs:
            logger.error(f"Unknown job: {job_name}")
            return False
        
        try:
            logger.info(f"Manually executing job: {job_name}")
            job_instance = self.jobs[job_name]
            return await job_instance.execute(symbols)
        except Exception as e:
            logger.error(f"Failed to manually run job {job_name}: {e}")
            return False
    
    def get_scheduler_status(self) -> Dict[str, Any]:
        """Get comprehensive status of the scheduler and all jobs."""
        return {
            "scheduler_running": self.scheduler.is_running,
            "market_hours": self.scheduler.is_market_hours(),
            "jobs": self.scheduler.get_all_jobs_status(),
            "total_jobs": len(self.jobs)
        }
    
    def get_job_configs(self) -> Dict[str, Dict[str, Any]]:
        """Get configuration details for all jobs."""
        configs = {}
        for job_name in self.jobs.keys():
            config = SchedulerConfig.get_job_config(job_name)
            configs[job_name] = {
                "name": config.name,
                "interval_seconds": config.interval_seconds,
                "market_hours_only": config.market_hours_only,
                "description": config.description
            }
        return configs
    
    async def pause_job(self, job_name: str):
        """Pause a specific job."""
        try:
            self.scheduler.scheduler.pause_job(job_name)
            logger.info(f"Paused job: {job_name}")
        except Exception as e:
            logger.error(f"Failed to pause job {job_name}: {e}")
    
    async def resume_job(self, job_name: str):
        """Resume a paused job."""
        try:
            self.scheduler.scheduler.resume_job(job_name)
            logger.info(f"Resumed job: {job_name}")
        except Exception as e:
            logger.error(f"Failed to resume job {job_name}: {e}")


# Global scheduler instance (will be initialized in main.py)
scheduler_service: Optional[MarketDataSchedulerService] = None


def get_scheduler_service() -> Optional[MarketDataSchedulerService]:
    """Get the global scheduler service instance."""
    return scheduler_service


def set_scheduler_service(service: MarketDataSchedulerService):
    """Set the global scheduler service instance."""
    global scheduler_service
    scheduler_service = service
