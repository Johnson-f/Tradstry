"""
Scheduler Factory - Creates scheduler jobs with enhanced tracking capabilities.
Provides a centralized way to instantiate jobs with proper tracking components.
"""

import logging
from typing import Optional, Dict, Any

from scheduler.database_service import SchedulerDatabaseService
from scheduler.data_fetch_tracker import DataFetchTracker
from scheduler.enhanced_provider_manager import EnhancedProviderManager
from market_data.brain import MarketDataBrain

# Import all job classes
from scheduler.jobs.company_info_job import CompanyInfoJob
from scheduler.jobs.stock_quotes_job import StockQuotesJob
from scheduler.jobs.earnings_job import EarningsJob
from scheduler.jobs.dividend_job import DividendJob
from scheduler.jobs.fundamentals_job import FundamentalsJob
from scheduler.jobs.historical_prices_job import HistoricalPricesJob
from scheduler.jobs.news_job import NewsJob
from scheduler.jobs.options_chain_job import OptionsChainJob
from scheduler.jobs.economic_job import EconomicJob

logger = logging.getLogger(__name__)


class SchedulerFactory:
    """
    Factory class for creating scheduler jobs with enhanced tracking capabilities.
    Manages the lifecycle of tracking components and ensures proper initialization.
    """

    def __init__(
        self,
        database_service: SchedulerDatabaseService,
        market_data_brain: MarketDataBrain,
        enable_enhanced_tracking: bool = True
    ):
        """
        Initialize the scheduler factory.
        
        Args:
            database_service: Database service for job operations
            market_data_brain: Market data orchestrator
            enable_enhanced_tracking: Whether to enable enhanced tracking features
        """
        self.db_service = database_service
        self.brain = market_data_brain
        self.enable_enhanced_tracking = enable_enhanced_tracking
        
        # Initialize tracking components if enabled
        self.data_tracker: Optional[DataFetchTracker] = None
        self.provider_manager: Optional[EnhancedProviderManager] = None
        
        if enable_enhanced_tracking:
            self._initialize_tracking_components()

    async def _initialize_tracking_components(self):
        """Initialize the tracking components"""
        try:
            self.data_tracker = DataFetchTracker(self.db_service)
            await self.data_tracker.initialize()
            
            self.provider_manager = EnhancedProviderManager(
                market_data_brain=self.brain,
                data_tracker=self.data_tracker
            )
            
            logger.info("Enhanced tracking components initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize tracking components: {e}")
            self.enable_enhanced_tracking = False

    def create_company_info_job(self) -> CompanyInfoJob:
        """Create a CompanyInfoJob with tracking capabilities"""
        return CompanyInfoJob(
            database_service=self.db_service,
            market_data_orchestrator=self.brain,
            data_tracker=self.data_tracker,
            provider_manager=self.provider_manager
        )

    def create_stock_quotes_job(self) -> StockQuotesJob:
        """Create a StockQuotesJob with tracking capabilities"""
        return StockQuotesJob(
            database_service=self.db_service,
            market_data_orchestrator=self.brain,
            data_tracker=self.data_tracker,
            provider_manager=self.provider_manager
        )

    def create_earnings_job(self) -> EarningsJob:
        """Create an EarningsJob with tracking capabilities"""
        return EarningsJob(
            database_service=self.db_service,
            market_data_orchestrator=self.brain,
            data_tracker=self.data_tracker,
            provider_manager=self.provider_manager
        )

    def create_dividend_job(self) -> DividendJob:
        """Create a DividendJob with tracking capabilities"""
        return DividendJob(
            database_service=self.db_service,
            market_data_orchestrator=self.brain,
            data_tracker=self.data_tracker,
            provider_manager=self.provider_manager
        )

    def create_fundamentals_job(self) -> FundamentalsJob:
        """Create a FundamentalsJob with tracking capabilities"""
        return FundamentalsJob(
            database_service=self.db_service,
            market_data_orchestrator=self.brain,
            data_tracker=self.data_tracker,
            provider_manager=self.provider_manager
        )

    def create_historical_prices_job(self) -> HistoricalPricesJob:
        """Create a HistoricalPricesJob with tracking capabilities"""
        return HistoricalPricesJob(
            database_service=self.db_service,
            market_data_orchestrator=self.brain,
            data_tracker=self.data_tracker,
            provider_manager=self.provider_manager
        )

    def create_news_job(self) -> NewsJob:
        """Create a NewsJob with tracking capabilities"""
        return NewsJob(
            database_service=self.db_service,
            market_data_orchestrator=self.brain,
            data_tracker=self.data_tracker,
            provider_manager=self.provider_manager
        )

    def create_options_chain_job(self) -> OptionsChainJob:
        """Create an OptionsChainJob with tracking capabilities"""
        return OptionsChainJob(
            database_service=self.db_service,
            market_data_orchestrator=self.brain,
            data_tracker=self.data_tracker,
            provider_manager=self.provider_manager
        )

    def create_economic_job(self) -> EconomicJob:
        """Create an EconomicJob with tracking capabilities"""
        return EconomicJob(
            database_service=self.db_service,
            market_data_orchestrator=self.brain,
            data_tracker=self.data_tracker,
            provider_manager=self.provider_manager
        )

    def get_all_jobs(self) -> Dict[str, Any]:
        """Get all available job instances"""
        return {
            'company_info': self.create_company_info_job(),
            'stock_quotes': self.create_stock_quotes_job(),
            'earnings': self.create_earnings_job(),
            'dividends': self.create_dividend_job(),
            'fundamentals': self.create_fundamentals_job(),
            'historical_prices': self.create_historical_prices_job(),
            'news': self.create_news_job(),
            'options_chain': self.create_options_chain_job(),
            'economic': self.create_economic_job()
        }

    async def get_tracking_statistics(self) -> Dict[str, Any]:
        """Get comprehensive tracking statistics"""
        if not self.enable_enhanced_tracking or not self.provider_manager:
            return {"tracking_enabled": False}
        
        return await self.provider_manager.get_fetch_statistics()

    async def force_retry_failed_data(self, data_type_name: str) -> Dict[str, Any]:
        """Force retry all failed symbols for a specific data type"""
        if not self.enable_enhanced_tracking or not self.provider_manager:
            return {"error": "Enhanced tracking not enabled"}
        
        # Map string names to DataType enums
        from scheduler.data_fetch_tracker import DataType
        data_type_mapping = {
            'stock_quotes': DataType.STOCK_QUOTES,
            'company_info': DataType.COMPANY_INFO,
            'historical_prices': DataType.HISTORICAL_PRICES,
            'options_chain': DataType.OPTIONS_CHAIN,
            'earnings': DataType.EARNINGS,
            'dividends': DataType.DIVIDENDS,
            'fundamentals': DataType.FUNDAMENTALS,
            'news': DataType.NEWS,
            'economic_events': DataType.ECONOMIC_EVENTS
        }
        
        if data_type_name not in data_type_mapping:
            return {"error": f"Unknown data type: {data_type_name}"}
        
        data_type = data_type_mapping[data_type_name]
        return await self.provider_manager.force_retry_failed_symbols(data_type)

    async def cleanup_old_tracking_data(self, days_to_keep: int = 30) -> int:
        """Clean up old tracking data"""
        if not self.enable_enhanced_tracking or not self.data_tracker:
            return 0
        
        return await self.data_tracker.cleanup_old_records(days_to_keep)

    def is_tracking_enabled(self) -> bool:
        """Check if enhanced tracking is enabled"""
        return self.enable_enhanced_tracking and self.data_tracker is not None

    async def close(self):
        """Clean up resources"""
        if self.brain:
            await self.brain.close()
        
        logger.info("SchedulerFactory closed successfully")
