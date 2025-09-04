"""
Cron-based scheduler that fetches data from market_data module at specified intervals.
This is the new architecture where cron jobs fetch data directly from market_data
and then send it to scheduler/jobs for transformation and storage.
"""

import logging
import asyncio
from datetime import datetime, time
from typing import Dict, List, Optional, Any
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.executors.asyncio import AsyncIOExecutor

from market_data.brain import MarketDataBrain, FetchResult
from ..jobs.data_processor import DataProcessor
from ...database_service import SchedulerDatabaseService
from ...config import SchedulerConfig, JobConfig

logger = logging.getLogger(__name__)


class CronDataScheduler:
    """
    Cron-based scheduler that fetches data from market_data at specified intervals
    and sends it to data processors for transformation and storage.
    
    New Architecture:
    1. Cron jobs fetch data directly from market_data module
    2. Raw data is sent to scheduler/jobs processors
    3. Processors transform and store data in database
    """
    
    def __init__(self, market_data_brain: MarketDataBrain, database_service: SchedulerDatabaseService):
        """Initialize the cron scheduler with market data brain and database service."""
        self.market_data_brain = market_data_brain
        self.database_service = database_service
        self.data_processor = DataProcessor(database_service)
        
        # Configure APScheduler
        jobstores = {'default': MemoryJobStore()}
        executors = {'default': AsyncIOExecutor()}
        job_defaults = {
            'coalesce': False,
            'max_instances': 1,
            'misfire_grace_time': 30
        }
        
        self.scheduler = AsyncIOScheduler(
            jobstores=jobstores,
            executors=executors,
            job_defaults=job_defaults,
            timezone=pytz.timezone(SchedulerConfig.MARKET_TIMEZONE)
        )
        
        self._is_running = False
        self._job_registry: Dict[str, JobConfig] = {}
    
    async def start(self):
        """Start the cron scheduler and register all jobs."""
        if self._is_running:
            logger.warning("Cron scheduler is already running")
            return
        
        try:
            # Register all cron jobs
            await self._register_cron_jobs()
            
            # Start the scheduler
            self.scheduler.start()
            self._is_running = True
            
            logger.info("Cron data scheduler started successfully")
            
            # Log scheduled jobs
            for job in self.scheduler.get_jobs():
                logger.info(f"Scheduled cron job: {job.id} - Next run: {job.next_run_time}")
                
        except Exception as e:
            logger.error(f"Failed to start cron scheduler: {e}")
            raise
    
    async def stop(self):
        """Stop the cron scheduler."""
        if not self._is_running:
            return
        
        try:
            self.scheduler.shutdown(wait=True)
            self._is_running = False
            logger.info("Cron data scheduler stopped")
        except Exception as e:
            logger.error(f"Error stopping cron scheduler: {e}")
    
    async def _register_cron_jobs(self):
        """Register all cron jobs based on configuration."""
        jobs_config = SchedulerConfig.get_all_jobs()
        
        for job_name, job_config in jobs_config.items():
            await self._register_job(job_name, job_config)
    
    async def _register_job(self, job_name: str, job_config: JobConfig):
        """Register a single cron job."""
        try:
            # Create the appropriate trigger
            if job_config.market_hours_only:
                # Market hours only - use cron trigger
                trigger = CronTrigger(
                    hour=f"{SchedulerConfig.MARKET_OPEN.hour}-{SchedulerConfig.MARKET_CLOSE.hour-1}",
                    minute=f"*/{job_config.interval_seconds//60}" if job_config.interval_seconds >= 60 else "*",
                    second=f"*/{job_config.interval_seconds}" if job_config.interval_seconds < 60 else "0",
                    day_of_week="mon-fri",
                    timezone=SchedulerConfig.MARKET_TIMEZONE
                )
            else:
                # 24/7 jobs - use interval trigger
                trigger = IntervalTrigger(
                    seconds=job_config.interval_seconds,
                    timezone=SchedulerConfig.MARKET_TIMEZONE
                )
            
            # Map job names to their corresponding cron methods
            job_method = self._get_job_method(job_name)
            
            if job_method:
                self.scheduler.add_job(
                    func=job_method,
                    trigger=trigger,
                    id=f"cron_{job_name}",
                    name=job_config.name,
                    replace_existing=True,
                    max_instances=1
                )
                
                self._job_registry[job_name] = job_config
                logger.info(f"Registered cron job: {job_name} ({job_config.name})")
            else:
                logger.warning(f"No method found for job: {job_name}")
                
        except Exception as e:
            logger.error(f"Failed to register cron job {job_name}: {e}")
    
    def _get_job_method(self, job_name: str):
        """Get the corresponding method for a job name."""
        job_methods = {
            "stock_quotes": self._fetch_stock_quotes,
            "options_chain": self._fetch_options_chain,
            "historical_prices": self._fetch_historical_prices,
            "company_info": self._fetch_company_info,
            "fundamental_data": self._fetch_fundamental_data,
            "dividend_data": self._fetch_dividend_data,
            "earnings_data": self._fetch_earnings_data,
            "earnings_calendar": self._fetch_earnings_calendar,
            "news_data": self._fetch_news_data,
            "economic_events": self._fetch_economic_events,
        }
        return job_methods.get(job_name)
    
    async def _get_tracked_symbols(self) -> List[str]:
        """Get list of symbols to track from database."""
        try:
            return await self.database_service.get_tracked_symbols()
        except Exception as e:
            logger.error(f"Failed to get tracked symbols: {e}")
            return []
    
    # Cron job methods that fetch data from market_data and send to processors
    
    async def _fetch_stock_quotes(self):
        """Cron job to fetch stock quotes."""
        job_name = "stock_quotes"
        logger.info(f"Starting cron job: {job_name}")
        
        try:
            symbols = await self._get_tracked_symbols()
            if not symbols:
                logger.warning(f"{job_name}: No symbols to process")
                return
            
            # Fetch data from market_data
            results = await self.market_data_brain.get_multiple_quotes(symbols)
            
            # Process successful results
            successful_data = {
                symbol: result.data for symbol, result in results.items()
                if result.success and result.data
            }
            
            if successful_data:
                # Send to data processor for transformation and storage
                await self.data_processor.process_stock_quotes(successful_data)
                logger.info(f"{job_name}: Processed {len(successful_data)} quotes")
            else:
                logger.warning(f"{job_name}: No successful data to process")
                
        except Exception as e:
            logger.error(f"Cron job {job_name} failed: {e}")
    
    async def _fetch_options_chain(self):
        """Cron job to fetch options chain data."""
        job_name = "options_chain"
        logger.info(f"Starting cron job: {job_name}")
        
        try:
            symbols = await self._get_tracked_symbols()
            if not symbols:
                logger.warning(f"{job_name}: No symbols to process")
                return
            
            # Fetch options data for each symbol
            all_options_data = {}
            for symbol in symbols:
                result = await self.market_data_brain.get_options_chain(symbol)
                if result.success and result.data:
                    all_options_data[symbol] = result.data
            
            if all_options_data:
                # Send to data processor
                await self.data_processor.process_options_chain(all_options_data)
                logger.info(f"{job_name}: Processed options for {len(all_options_data)} symbols")
            else:
                logger.warning(f"{job_name}: No successful data to process")
                
        except Exception as e:
            logger.error(f"Cron job {job_name} failed: {e}")
    
    async def _fetch_historical_prices(self):
        """Cron job to fetch historical prices."""
        job_name = "historical_prices"
        logger.info(f"Starting cron job: {job_name}")
        
        try:
            symbols = await self._get_tracked_symbols()
            if not symbols:
                logger.warning(f"{job_name}: No symbols to process")
                return
            
            # Get date range (last 30 days)
            from datetime import date, timedelta
            end_date = date.today()
            start_date = end_date - timedelta(days=30)
            
            # Fetch historical data for each symbol
            all_historical_data = {}
            for symbol in symbols:
                result = await self.market_data_brain.get_historical(symbol, start_date, end_date)
                if result.success and result.data:
                    all_historical_data[symbol] = result.data
            
            if all_historical_data:
                # Send to data processor
                await self.data_processor.process_historical_prices(all_historical_data)
                logger.info(f"{job_name}: Processed historical data for {len(all_historical_data)} symbols")
            else:
                logger.warning(f"{job_name}: No successful data to process")
                
        except Exception as e:
            logger.error(f"Cron job {job_name} failed: {e}")
    
    async def _fetch_company_info(self):
        """Cron job to fetch company information."""
        job_name = "company_info"
        logger.info(f"Starting cron job: {job_name}")
        
        try:
            symbols = await self._get_tracked_symbols()
            if not symbols:
                logger.warning(f"{job_name}: No symbols to process")
                return
            
            # Fetch company info for each symbol
            all_company_data = {}
            for symbol in symbols:
                result = await self.market_data_brain.get_company_info(symbol)
                if result.success and result.data:
                    all_company_data[symbol] = result.data
            
            if all_company_data:
                # Send to data processor
                await self.data_processor.process_company_info(all_company_data)
                logger.info(f"{job_name}: Processed company info for {len(all_company_data)} symbols")
            else:
                logger.warning(f"{job_name}: No successful data to process")
                
        except Exception as e:
            logger.error(f"Cron job {job_name} failed: {e}")
    
    async def _fetch_fundamental_data(self):
        """Cron job to fetch fundamental data."""
        job_name = "fundamental_data"
        logger.info(f"Starting cron job: {job_name}")
        
        try:
            symbols = await self._get_tracked_symbols()
            if not symbols:
                logger.warning(f"{job_name}: No symbols to process")
                return
            
            # Fetch fundamental data for each symbol
            all_fundamental_data = {}
            for symbol in symbols:
                result = await self.market_data_brain.get_fundamentals(symbol)
                if result.success and result.data:
                    all_fundamental_data[symbol] = result.data
            
            if all_fundamental_data:
                # Send to data processor
                await self.data_processor.process_fundamental_data(all_fundamental_data)
                logger.info(f"{job_name}: Processed fundamental data for {len(all_fundamental_data)} symbols")
            else:
                logger.warning(f"{job_name}: No successful data to process")
                
        except Exception as e:
            logger.error(f"Cron job {job_name} failed: {e}")
    
    async def _fetch_dividend_data(self):
        """Cron job to fetch dividend data."""
        job_name = "dividend_data"
        logger.info(f"Starting cron job: {job_name}")
        
        try:
            symbols = await self._get_tracked_symbols()
            if not symbols:
                logger.warning(f"{job_name}: No symbols to process")
                return
            
            # Fetch dividend data for each symbol
            all_dividend_data = {}
            for symbol in symbols:
                result = await self.market_data_brain.get_dividends(symbol)
                if result.success and result.data:
                    all_dividend_data[symbol] = result.data
            
            if all_dividend_data:
                # Send to data processor
                await self.data_processor.process_dividend_data(all_dividend_data)
                logger.info(f"{job_name}: Processed dividend data for {len(all_dividend_data)} symbols")
            else:
                logger.warning(f"{job_name}: No successful data to process")
                
        except Exception as e:
            logger.error(f"Cron job {job_name} failed: {e}")
    
    async def _fetch_earnings_data(self):
        """Cron job to fetch earnings data."""
        job_name = "earnings_data"
        logger.info(f"Starting cron job: {job_name}")
        
        try:
            symbols = await self._get_tracked_symbols()
            if not symbols:
                logger.warning(f"{job_name}: No symbols to process")
                return
            
            # Fetch earnings data for each symbol
            all_earnings_data = {}
            for symbol in symbols:
                result = await self.market_data_brain.get_earnings(symbol)
                if result.success and result.data:
                    all_earnings_data[symbol] = result.data
            
            if all_earnings_data:
                # Send to data processor
                await self.data_processor.process_earnings_data(all_earnings_data)
                logger.info(f"{job_name}: Processed earnings data for {len(all_earnings_data)} symbols")
            else:
                logger.warning(f"{job_name}: No successful data to process")
                
        except Exception as e:
            logger.error(f"Cron job {job_name} failed: {e}")
    
    async def _fetch_earnings_calendar(self):
        """Cron job to fetch earnings calendar."""
        job_name = "earnings_calendar"
        logger.info(f"Starting cron job: {job_name}")
        
        try:
            # Fetch earnings calendar (not symbol-specific)
            result = await self.market_data_brain.get_earnings_calendar()
            
            if result.success and result.data:
                # Send to data processor
                await self.data_processor.process_earnings_calendar(result.data)
                logger.info(f"{job_name}: Processed earnings calendar with {len(result.data)} events")
            else:
                logger.warning(f"{job_name}: No successful data to process")
                
        except Exception as e:
            logger.error(f"Cron job {job_name} failed: {e}")
    
    async def _fetch_news_data(self):
        """Cron job to fetch news data."""
        job_name = "news_data"
        logger.info(f"Starting cron job: {job_name}")
        
        try:
            symbols = await self._get_tracked_symbols()
            
            # Fetch general market news
            general_news_result = await self.market_data_brain.get_news(limit=50)
            
            # Fetch symbol-specific news
            symbol_news_data = {}
            for symbol in symbols[:10]:  # Limit to first 10 symbols to avoid rate limits
                result = await self.market_data_brain.get_news(symbol=symbol, limit=10)
                if result.success and result.data:
                    symbol_news_data[symbol] = result.data
            
            # Combine all news data
            all_news_data = {
                'general': general_news_result.data if general_news_result.success else [],
                'symbol_specific': symbol_news_data
            }
            
            if all_news_data['general'] or all_news_data['symbol_specific']:
                # Send to data processor
                await self.data_processor.process_news_data(all_news_data)
                logger.info(f"{job_name}: Processed news data")
            else:
                logger.warning(f"{job_name}: No successful data to process")
                
        except Exception as e:
            logger.error(f"Cron job {job_name} failed: {e}")
    
    async def _fetch_economic_events(self):
        """Cron job to fetch economic events."""
        job_name = "economic_events"
        logger.info(f"Starting cron job: {job_name}")
        
        try:
            # Fetch economic events (not symbol-specific)
            result = await self.market_data_brain.get_economic_events(
                countries=['US', 'EU', 'GB'],
                importance=3,  # High importance only
                limit=100
            )
            
            if result.success and result.data:
                # Send to data processor
                await self.data_processor.process_economic_events(result.data)
                logger.info(f"{job_name}: Processed {len(result.data)} economic events")
            else:
                logger.warning(f"{job_name}: No successful data to process")
                
        except Exception as e:
            logger.error(f"Cron job {job_name} failed: {e}")
    
    # Utility methods
    
    def is_running(self) -> bool:
        """Check if scheduler is running."""
        return self._is_running
    
    def get_job_status(self, job_id: str) -> Optional[Dict]:
        """Get status of a specific job."""
        job = self.scheduler.get_job(job_id)
        if not job:
            return None
        
        return {
            "id": job.id,
            "name": job.name,
            "next_run_time": job.next_run_time,
            "trigger": str(job.trigger),
            "pending": job.pending
        }
    
    def get_all_jobs_status(self) -> List[Dict]:
        """Get status for all scheduled jobs."""
        return [
            {
                "id": job.id,
                "name": job.name,
                "next_run_time": job.next_run_time,
                "trigger": str(job.trigger),
                "pending": job.pending
            }
            for job in self.scheduler.get_jobs()
        ]
