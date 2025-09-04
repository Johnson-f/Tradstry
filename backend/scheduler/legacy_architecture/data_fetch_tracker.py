"""
Data Fetch Tracker - Persistent tracking system for market data fetching operations.
Tracks fetch attempts, successes, failures, and provider performance across scheduler jobs.
"""

import logging
import asyncio
from typing import Dict, List, Optional, Any, Set
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass, field
from collections import defaultdict
import json

from scheduler.database_service import SchedulerDatabaseService

logger = logging.getLogger(__name__)


class FetchStatus(Enum):
    """Status of a data fetch attempt"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"
    SKIPPED = "skipped"


class DataType(Enum):
    """Types of market data that can be fetched"""
    STOCK_QUOTES = "stock_quotes"
    COMPANY_INFO = "company_info"
    HISTORICAL_PRICES = "historical_prices"
    OPTIONS_CHAIN = "options_chain"
    EARNINGS = "earnings"
    DIVIDENDS = "dividends"
    FUNDAMENTALS = "fundamentals"
    NEWS = "news"
    ECONOMIC_EVENTS = "economic_events"


@dataclass
class FetchAttempt:
    """Record of a single fetch attempt"""
    symbol: str
    data_type: DataType
    provider: str
    status: FetchStatus
    timestamp: datetime
    error_message: Optional[str] = None
    retry_count: int = 0
    execution_time_ms: Optional[int] = None
    data_size: Optional[int] = None
    job_id: Optional[str] = None


@dataclass
class ProviderStats:
    """Statistics for a provider's performance"""
    name: str
    total_attempts: int = 0
    successful_attempts: int = 0
    failed_attempts: int = 0
    avg_response_time_ms: float = 0.0
    last_success: Optional[datetime] = None
    last_failure: Optional[datetime] = None
    consecutive_failures: int = 0
    rate_limited_until: Optional[datetime] = None
    supported_data_types: Set[DataType] = field(default_factory=set)


class DataFetchTracker:
    """
    Tracks data fetching operations across all scheduler jobs.
    Provides persistent tracking, retry logic, and provider performance monitoring.
    """

    def __init__(self, database_service: SchedulerDatabaseService):
        self.db_service = database_service
        self.fetch_attempts: Dict[str, List[FetchAttempt]] = defaultdict(list)
        self.provider_stats: Dict[str, ProviderStats] = {}
        self.pending_fetches: Dict[str, Set[str]] = defaultdict(set)  # data_type -> symbols
        self.failed_symbols: Dict[str, Dict[str, datetime]] = defaultdict(dict)  # data_type -> symbol -> last_failure
        
        # Configuration
        self.max_retry_attempts = 3
        self.retry_backoff_minutes = [5, 15, 60]  # Progressive backoff
        self.provider_cooldown_minutes = 60
        self.max_consecutive_failures = 5
        
    async def initialize(self):
        """Initialize the tracker and load existing data"""
        try:
            await self._load_provider_stats()
            await self._load_pending_fetches()
            logger.info("DataFetchTracker initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize DataFetchTracker: {e}")

    async def _load_provider_stats(self):
        """Load provider statistics from database"""
        try:
            # This would load from a provider_stats table if it exists
            # For now, initialize with known providers
            known_providers = [
                'alpha_vantage', 'finnhub', 'polygon', 'twelve_data', 
                'fmp', 'tiingo', 'api_ninjas', 'fiscal'
            ]
            
            for provider in known_providers:
                if provider not in self.provider_stats:
                    self.provider_stats[provider] = ProviderStats(name=provider)
                    
        except Exception as e:
            logger.error(f"Error loading provider stats: {e}")

    async def _load_pending_fetches(self):
        """Load pending fetch operations from database"""
        try:
            # This would query a fetch_tracking table for pending operations
            # Implementation depends on your database schema
            pass
        except Exception as e:
            logger.error(f"Error loading pending fetches: {e}")

    def register_fetch_attempt(
        self,
        symbol: str,
        data_type: DataType,
        provider: str,
        job_id: Optional[str] = None
    ) -> str:
        """
        Register a new fetch attempt.
        
        Returns:
            Unique attempt ID for tracking
        """
        attempt = FetchAttempt(
            symbol=symbol,
            data_type=data_type,
            provider=provider,
            status=FetchStatus.IN_PROGRESS,
            timestamp=datetime.now(),
            job_id=job_id
        )
        
        attempt_id = f"{symbol}_{data_type.value}_{provider}_{int(attempt.timestamp.timestamp())}"
        self.fetch_attempts[attempt_id] = [attempt]
        
        # Update provider stats
        if provider not in self.provider_stats:
            self.provider_stats[provider] = ProviderStats(name=provider)
        
        self.provider_stats[provider].total_attempts += 1
        self.provider_stats[provider].supported_data_types.add(data_type)
        
        logger.debug(f"Registered fetch attempt: {attempt_id}")
        return attempt_id

    def record_fetch_success(
        self,
        attempt_id: str,
        execution_time_ms: int,
        data_size: Optional[int] = None
    ):
        """Record a successful fetch operation"""
        if attempt_id not in self.fetch_attempts:
            logger.warning(f"Unknown attempt ID: {attempt_id}")
            return
            
        attempt = self.fetch_attempts[attempt_id][-1]
        attempt.status = FetchStatus.SUCCESS
        attempt.execution_time_ms = execution_time_ms
        attempt.data_size = data_size
        
        # Update provider stats
        provider_stats = self.provider_stats[attempt.provider]
        provider_stats.successful_attempts += 1
        provider_stats.last_success = datetime.now()
        provider_stats.consecutive_failures = 0
        
        # Update average response time
        if provider_stats.successful_attempts > 0:
            total_time = provider_stats.avg_response_time_ms * (provider_stats.successful_attempts - 1)
            provider_stats.avg_response_time_ms = (total_time + execution_time_ms) / provider_stats.successful_attempts
        
        # Remove from failed symbols if it was there
        data_type_key = attempt.data_type.value
        if data_type_key in self.failed_symbols and attempt.symbol in self.failed_symbols[data_type_key]:
            del self.failed_symbols[data_type_key][attempt.symbol]
        
        logger.info(f"Recorded successful fetch: {attempt.symbol} via {attempt.provider}")

    def record_fetch_failure(
        self,
        attempt_id: str,
        error_message: str,
        is_rate_limit: bool = False
    ):
        """Record a failed fetch operation"""
        if attempt_id not in self.fetch_attempts:
            logger.warning(f"Unknown attempt ID: {attempt_id}")
            return
            
        attempt = self.fetch_attempts[attempt_id][-1]
        attempt.status = FetchStatus.FAILED
        attempt.error_message = error_message
        
        # Update provider stats
        provider_stats = self.provider_stats[attempt.provider]
        provider_stats.failed_attempts += 1
        provider_stats.last_failure = datetime.now()
        provider_stats.consecutive_failures += 1
        
        # Handle rate limiting
        if is_rate_limit:
            provider_stats.rate_limited_until = datetime.now() + timedelta(minutes=self.provider_cooldown_minutes)
            logger.warning(f"Provider {attempt.provider} rate limited until {provider_stats.rate_limited_until}")
        
        # Track failed symbol for retry logic
        data_type_key = attempt.data_type.value
        self.failed_symbols[data_type_key][attempt.symbol] = datetime.now()
        
        logger.error(f"Recorded failed fetch: {attempt.symbol} via {attempt.provider} - {error_message}")

    def should_retry_symbol(self, symbol: str, data_type: DataType) -> bool:
        """Check if a symbol should be retried for a specific data type"""
        data_type_key = data_type.value
        
        if data_type_key not in self.failed_symbols:
            return False
            
        if symbol not in self.failed_symbols[data_type_key]:
            return False
            
        last_failure = self.failed_symbols[data_type_key][symbol]
        
        # Get retry count for this symbol/data_type combination
        retry_count = self._get_retry_count(symbol, data_type)
        
        if retry_count >= self.max_retry_attempts:
            return False
            
        # Check if enough time has passed for retry
        backoff_minutes = self.retry_backoff_minutes[min(retry_count, len(self.retry_backoff_minutes) - 1)]
        retry_time = last_failure + timedelta(minutes=backoff_minutes)
        
        return datetime.now() >= retry_time

    def _get_retry_count(self, symbol: str, data_type: DataType) -> int:
        """Get the number of retry attempts for a symbol/data_type combination"""
        count = 0
        for attempts in self.fetch_attempts.values():
            for attempt in attempts:
                if (attempt.symbol == symbol and 
                    attempt.data_type == data_type and 
                    attempt.status == FetchStatus.FAILED):
                    count += 1
        return count

    def get_available_providers(self, data_type: DataType) -> List[str]:
        """
        Get list of available providers for a data type, sorted by reliability.
        Excludes rate-limited and consistently failing providers.
        """
        available = []
        
        for provider_name, stats in self.provider_stats.items():
            # Skip if rate limited
            if (stats.rate_limited_until and 
                datetime.now() < stats.rate_limited_until):
                continue
                
            # Skip if too many consecutive failures
            if stats.consecutive_failures >= self.max_consecutive_failures:
                continue
                
            # Skip if provider doesn't support this data type
            if data_type not in stats.supported_data_types and stats.total_attempts > 0:
                continue
                
            available.append(provider_name)
        
        # Sort by success rate and response time
        def provider_score(provider_name: str) -> float:
            stats = self.provider_stats[provider_name]
            if stats.total_attempts == 0:
                return 0.5  # Neutral score for untested providers
                
            success_rate = stats.successful_attempts / stats.total_attempts
            # Penalize slow providers (normalize response time to 0-1 scale)
            time_penalty = min(stats.avg_response_time_ms / 10000, 1.0)
            return success_rate - (time_penalty * 0.1)
        
        available.sort(key=provider_score, reverse=True)
        return available

    def get_failed_symbols(self, data_type: DataType) -> List[str]:
        """Get list of symbols that failed to fetch for a specific data type"""
        data_type_key = data_type.value
        if data_type_key not in self.failed_symbols:
            return []
        return list(self.failed_symbols[data_type_key].keys())

    def get_retry_candidates(self, data_type: DataType) -> List[str]:
        """Get symbols that are ready for retry"""
        failed_symbols = self.get_failed_symbols(data_type)
        return [symbol for symbol in failed_symbols if self.should_retry_symbol(symbol, data_type)]

    def get_provider_performance(self) -> Dict[str, Dict[str, Any]]:
        """Get performance statistics for all providers"""
        performance = {}
        
        for provider_name, stats in self.provider_stats.items():
            success_rate = 0.0
            if stats.total_attempts > 0:
                success_rate = stats.successful_attempts / stats.total_attempts
                
            performance[provider_name] = {
                'success_rate': success_rate,
                'total_attempts': stats.total_attempts,
                'successful_attempts': stats.successful_attempts,
                'failed_attempts': stats.failed_attempts,
                'avg_response_time_ms': stats.avg_response_time_ms,
                'consecutive_failures': stats.consecutive_failures,
                'rate_limited': stats.rate_limited_until is not None and datetime.now() < stats.rate_limited_until,
                'supported_data_types': [dt.value for dt in stats.supported_data_types]
            }
            
        return performance

    async def cleanup_old_records(self, days_to_keep: int = 30):
        """Clean up old fetch attempt records"""
        cutoff_date = datetime.now() - timedelta(days=days_to_keep)
        
        # Clean up fetch attempts
        to_remove = []
        for attempt_id, attempts in self.fetch_attempts.items():
            if attempts[-1].timestamp < cutoff_date:
                to_remove.append(attempt_id)
        
        for attempt_id in to_remove:
            del self.fetch_attempts[attempt_id]
        
        # Clean up failed symbols
        for data_type_key in list(self.failed_symbols.keys()):
            symbols_to_remove = []
            for symbol, failure_time in self.failed_symbols[data_type_key].items():
                if failure_time < cutoff_date:
                    symbols_to_remove.append(symbol)
            
            for symbol in symbols_to_remove:
                del self.failed_symbols[data_type_key][symbol]
        
        logger.info(f"Cleaned up {len(to_remove)} old fetch records")

    def reset_provider_failures(self, provider_name: str):
        """Reset failure count for a provider (useful for manual intervention)"""
        if provider_name in self.provider_stats:
            self.provider_stats[provider_name].consecutive_failures = 0
            self.provider_stats[provider_name].rate_limited_until = None
            logger.info(f"Reset failure count for provider: {provider_name}")

    def get_summary_stats(self) -> Dict[str, Any]:
        """Get summary statistics for the tracking system"""
        total_attempts = sum(stats.total_attempts for stats in self.provider_stats.values())
        total_successes = sum(stats.successful_attempts for stats in self.provider_stats.values())
        total_failures = sum(stats.failed_attempts for stats in self.provider_stats.values())
        
        overall_success_rate = 0.0
        if total_attempts > 0:
            overall_success_rate = total_successes / total_attempts
        
        active_providers = len([
            p for p in self.provider_stats.values() 
            if p.consecutive_failures < self.max_consecutive_failures
        ])
        
        return {
            'total_attempts': total_attempts,
            'total_successes': total_successes,
            'total_failures': total_failures,
            'overall_success_rate': overall_success_rate,
            'active_providers': active_providers,
            'total_providers': len(self.provider_stats),
            'pending_retries': sum(len(symbols) for symbols in self.failed_symbols.values())
        }
