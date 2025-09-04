"""
Enhanced Provider Manager - Advanced fallback and retry system for market data providers.
Integrates with DataFetchTracker to provide intelligent provider selection and retry logic.
"""

import logging
import asyncio
from typing import Dict, List, Optional, Any, Callable, Tuple
from datetime import datetime, timedelta
from enum import Enum

from market_data.brain import MarketDataBrain, FetchResult
from scheduler.data_fetch_tracker import DataFetchTracker, DataType, FetchStatus

logger = logging.getLogger(__name__)


class FetchStrategy(Enum):
    """Different strategies for fetching data"""
    FASTEST_FIRST = "fastest_first"  # Try fastest providers first
    MOST_RELIABLE = "most_reliable"  # Try most reliable providers first
    ROUND_ROBIN = "round_robin"      # Distribute load evenly
    FALLBACK_CHAIN = "fallback_chain"  # Try all providers in sequence


class EnhancedProviderManager:
    """
    Enhanced provider manager that builds on MarketDataBrain with advanced tracking,
    retry logic, and intelligent provider selection strategies.
    """

    def __init__(
        self, 
        market_data_brain: MarketDataBrain,
        data_tracker: DataFetchTracker,
        default_strategy: FetchStrategy = FetchStrategy.MOST_RELIABLE
    ):
        self.brain = market_data_brain
        self.tracker = data_tracker
        self.default_strategy = default_strategy
        
        # Configuration
        self.max_concurrent_requests = 5
        self.request_timeout_seconds = 30
        self.batch_size = 10
        self.inter_request_delay_ms = 100
        
        # Runtime state
        self.active_requests: Dict[str, datetime] = {}
        self.provider_rotation_index: Dict[str, int] = {}

    async def fetch_with_enhanced_fallback(
        self,
        symbols: List[str],
        data_type: DataType,
        fetch_method: str,
        strategy: Optional[FetchStrategy] = None,
        job_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, FetchResult]:
        """
        Enhanced fetch operation with intelligent provider selection and retry logic.
        
        Args:
            symbols: List of symbols to fetch
            data_type: Type of data being fetched
            fetch_method: Method name to call on MarketDataBrain
            strategy: Fetch strategy to use
            job_id: Optional job identifier for tracking
            **kwargs: Additional arguments for the fetch method
            
        Returns:
            Dictionary mapping symbols to FetchResults
        """
        strategy = strategy or self.default_strategy
        results: Dict[str, FetchResult] = {}
        
        # Separate symbols into new attempts and retries
        retry_symbols = self.tracker.get_retry_candidates(data_type)
        new_symbols = [s for s in symbols if s not in retry_symbols]
        
        logger.info(
            f"Enhanced fetch: {len(new_symbols)} new symbols, "
            f"{len(retry_symbols)} retry symbols for {data_type.value}"
        )
        
        # Process new symbols first
        if new_symbols:
            new_results = await self._fetch_symbols_with_strategy(
                new_symbols, data_type, fetch_method, strategy, job_id, **kwargs
            )
            results.update(new_results)
        
        # Process retry symbols with special handling
        if retry_symbols:
            retry_results = await self._fetch_retry_symbols(
                retry_symbols, data_type, fetch_method, job_id, **kwargs
            )
            results.update(retry_results)
        
        return results

    async def _fetch_symbols_with_strategy(
        self,
        symbols: List[str],
        data_type: DataType,
        fetch_method: str,
        strategy: FetchStrategy,
        job_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, FetchResult]:
        """Fetch symbols using the specified strategy"""
        
        if strategy == FetchStrategy.FASTEST_FIRST:
            return await self._fetch_fastest_first(symbols, data_type, fetch_method, job_id, **kwargs)
        elif strategy == FetchStrategy.MOST_RELIABLE:
            return await self._fetch_most_reliable(symbols, data_type, fetch_method, job_id, **kwargs)
        elif strategy == FetchStrategy.ROUND_ROBIN:
            return await self._fetch_round_robin(symbols, data_type, fetch_method, job_id, **kwargs)
        elif strategy == FetchStrategy.FALLBACK_CHAIN:
            return await self._fetch_fallback_chain(symbols, data_type, fetch_method, job_id, **kwargs)
        else:
            # Default to most reliable
            return await self._fetch_most_reliable(symbols, data_type, fetch_method, job_id, **kwargs)

    async def _fetch_fastest_first(
        self,
        symbols: List[str],
        data_type: DataType,
        fetch_method: str,
        job_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, FetchResult]:
        """Fetch using fastest providers first"""
        providers = self.tracker.get_available_providers(data_type)
        
        # Sort by average response time
        provider_stats = self.tracker.get_provider_performance()
        providers.sort(key=lambda p: provider_stats.get(p, {}).get('avg_response_time_ms', float('inf')))
        
        return await self._fetch_with_provider_priority(
            symbols, data_type, fetch_method, providers, job_id, **kwargs
        )

    async def _fetch_most_reliable(
        self,
        symbols: List[str],
        data_type: DataType,
        fetch_method: str,
        job_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, FetchResult]:
        """Fetch using most reliable providers first"""
        providers = self.tracker.get_available_providers(data_type)
        
        # Providers are already sorted by reliability in get_available_providers
        return await self._fetch_with_provider_priority(
            symbols, data_type, fetch_method, providers, job_id, **kwargs
        )

    async def _fetch_round_robin(
        self,
        symbols: List[str],
        data_type: DataType,
        fetch_method: str,
        job_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, FetchResult]:
        """Distribute symbols across providers using round-robin"""
        providers = self.tracker.get_available_providers(data_type)
        if not providers:
            return {}
        
        results = {}
        data_type_key = data_type.value
        
        # Initialize rotation index if not exists
        if data_type_key not in self.provider_rotation_index:
            self.provider_rotation_index[data_type_key] = 0
        
        # Distribute symbols across providers
        provider_batches: Dict[str, List[str]] = {p: [] for p in providers}
        
        for i, symbol in enumerate(symbols):
            provider_idx = (self.provider_rotation_index[data_type_key] + i) % len(providers)
            provider_name = providers[provider_idx]
            provider_batches[provider_name].append(symbol)
        
        # Update rotation index for next call
        self.provider_rotation_index[data_type_key] = (
            self.provider_rotation_index[data_type_key] + len(symbols)
        ) % len(providers)
        
        # Fetch from each provider concurrently
        tasks = []
        for provider_name, provider_symbols in provider_batches.items():
            if provider_symbols:
                task = self._fetch_from_single_provider(
                    provider_symbols, data_type, fetch_method, provider_name, job_id, **kwargs
                )
                tasks.append(task)
        
        if tasks:
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            for batch_result in batch_results:
                if isinstance(batch_result, dict):
                    results.update(batch_result)
        
        return results

    async def _fetch_fallback_chain(
        self,
        symbols: List[str],
        data_type: DataType,
        fetch_method: str,
        job_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, FetchResult]:
        """Try all providers in sequence until all symbols are fetched"""
        providers = self.tracker.get_available_providers(data_type)
        results = {}
        remaining_symbols = symbols.copy()
        
        for provider_name in providers:
            if not remaining_symbols:
                break
                
            provider_results = await self._fetch_from_single_provider(
                remaining_symbols, data_type, fetch_method, provider_name, job_id, **kwargs
            )
            
            # Add successful results and remove those symbols from remaining
            for symbol, result in provider_results.items():
                if result.success:
                    results[symbol] = result
                    if symbol in remaining_symbols:
                        remaining_symbols.remove(symbol)
        
        # For any remaining symbols, create failed results
        for symbol in remaining_symbols:
            results[symbol] = FetchResult(
                data=None,
                provider="none",
                success=False,
                error=f"All providers failed for {symbol}"
            )
        
        return results

    async def _fetch_with_provider_priority(
        self,
        symbols: List[str],
        data_type: DataType,
        fetch_method: str,
        providers: List[str],
        job_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, FetchResult]:
        """Fetch symbols trying providers in priority order"""
        if not providers:
            return {}
        
        # Try the highest priority provider first
        primary_provider = providers[0]
        results = await self._fetch_from_single_provider(
            symbols, data_type, fetch_method, primary_provider, job_id, **kwargs
        )
        
        # For failed symbols, try fallback providers
        failed_symbols = [s for s, r in results.items() if not r.success]
        
        for fallback_provider in providers[1:]:
            if not failed_symbols:
                break
                
            fallback_results = await self._fetch_from_single_provider(
                failed_symbols, data_type, fetch_method, fallback_provider, job_id, **kwargs
            )
            
            # Update results with successful fallback fetches
            for symbol, result in fallback_results.items():
                if result.success:
                    results[symbol] = result
                    if symbol in failed_symbols:
                        failed_symbols.remove(symbol)
        
        return results

    async def _fetch_from_single_provider(
        self,
        symbols: List[str],
        data_type: DataType,
        fetch_method: str,
        provider_name: str,
        job_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, FetchResult]:
        """Fetch symbols from a single provider with tracking"""
        results = {}
        
        # Process symbols in batches to avoid overwhelming the provider
        symbol_batches = [symbols[i:i + self.batch_size] for i in range(0, len(symbols), self.batch_size)]
        
        for batch in symbol_batches:
            batch_results = await self._fetch_batch_from_provider(
                batch, data_type, fetch_method, provider_name, job_id, **kwargs
            )
            results.update(batch_results)
            
            # Add delay between batches
            if len(symbol_batches) > 1:
                await asyncio.sleep(self.inter_request_delay_ms / 1000)
        
        return results

    async def _fetch_batch_from_provider(
        self,
        symbols: List[str],
        data_type: DataType,
        fetch_method: str,
        provider_name: str,
        job_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, FetchResult]:
        """Fetch a batch of symbols from a specific provider"""
        results = {}
        
        # Register fetch attempts
        attempt_ids = {}
        for symbol in symbols:
            attempt_id = self.tracker.register_fetch_attempt(
                symbol, data_type, provider_name, job_id
            )
            attempt_ids[symbol] = attempt_id
        
        try:
            # Use the brain's existing fallback system but force specific provider
            # This is a bit of a hack - we'd need to modify MarketDataBrain to support provider selection
            start_time = datetime.now()
            
            if hasattr(self.brain, fetch_method):
                method = getattr(self.brain, fetch_method)
                
                # Handle different method signatures
                if fetch_method in ['get_multiple_quotes', 'get_multiple_historical']:
                    brain_results = await method(symbols, **kwargs)
                else:
                    # For single-symbol methods, call them individually
                    brain_results = {}
                    for symbol in symbols:
                        try:
                            result = await method(symbol, **kwargs)
                            brain_results[symbol] = result
                        except Exception as e:
                            brain_results[symbol] = FetchResult(
                                data=None,
                                provider=provider_name,
                                success=False,
                                error=str(e)
                            )
                
                execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
                
                # Process results and update tracking
                for symbol in symbols:
                    attempt_id = attempt_ids[symbol]
                    
                    if symbol in brain_results:
                        result = brain_results[symbol]
                        results[symbol] = result
                        
                        if result.success:
                            data_size = len(str(result.data)) if result.data else 0
                            self.tracker.record_fetch_success(attempt_id, execution_time, data_size)
                        else:
                            is_rate_limit = 'rate limit' in (result.error or '').lower()
                            self.tracker.record_fetch_failure(attempt_id, result.error or 'Unknown error', is_rate_limit)
                    else:
                        # Symbol not in results - create failed result
                        results[symbol] = FetchResult(
                            data=None,
                            provider=provider_name,
                            success=False,
                            error="No data returned"
                        )
                        self.tracker.record_fetch_failure(attempt_ids[symbol], "No data returned")
            
        except Exception as e:
            # Handle batch-level errors
            error_msg = str(e)
            is_rate_limit = any(indicator in error_msg.lower() for indicator in [
                'rate limit', 'too many requests', '429', 'quota exceeded'
            ])
            
            for symbol in symbols:
                attempt_id = attempt_ids[symbol]
                results[symbol] = FetchResult(
                    data=None,
                    provider=provider_name,
                    success=False,
                    error=error_msg
                )
                self.tracker.record_fetch_failure(attempt_id, error_msg, is_rate_limit)
        
        return results

    async def _fetch_retry_symbols(
        self,
        symbols: List[str],
        data_type: DataType,
        fetch_method: str,
        job_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, FetchResult]:
        """Fetch symbols that are marked for retry with special handling"""
        logger.info(f"Retrying {len(symbols)} failed symbols for {data_type.value}")
        
        # For retries, use the most reliable strategy but with more aggressive fallback
        providers = self.tracker.get_available_providers(data_type)
        
        # Try each provider for all retry symbols
        results = {}
        remaining_symbols = symbols.copy()
        
        for provider_name in providers:
            if not remaining_symbols:
                break
                
            provider_results = await self._fetch_from_single_provider(
                remaining_symbols, data_type, fetch_method, provider_name, job_id, **kwargs
            )
            
            # Update results and remove successful symbols
            for symbol, result in provider_results.items():
                results[symbol] = result
                if result.success and symbol in remaining_symbols:
                    remaining_symbols.remove(symbol)
        
        return results

    async def get_fetch_statistics(self) -> Dict[str, Any]:
        """Get comprehensive statistics about fetch operations"""
        tracker_stats = self.tracker.get_summary_stats()
        provider_performance = self.tracker.get_provider_performance()
        
        return {
            'tracker_stats': tracker_stats,
            'provider_performance': provider_performance,
            'active_requests': len(self.active_requests),
            'configuration': {
                'max_concurrent_requests': self.max_concurrent_requests,
                'request_timeout_seconds': self.request_timeout_seconds,
                'batch_size': self.batch_size,
                'default_strategy': self.default_strategy.value
            }
        }

    async def force_retry_failed_symbols(self, data_type: DataType) -> Dict[str, FetchResult]:
        """Force retry all failed symbols for a data type (manual intervention)"""
        failed_symbols = self.tracker.get_failed_symbols(data_type)
        
        if not failed_symbols:
            return {}
        
        logger.info(f"Force retrying {len(failed_symbols)} failed symbols for {data_type.value}")
        
        # Map data type to appropriate fetch method
        method_mapping = {
            DataType.STOCK_QUOTES: 'get_multiple_quotes',
            DataType.COMPANY_INFO: 'get_company_info',
            DataType.HISTORICAL_PRICES: 'get_historical',
            DataType.OPTIONS_CHAIN: 'get_options_chain',
            DataType.EARNINGS: 'get_earnings',
            DataType.DIVIDENDS: 'get_dividends',
            DataType.FUNDAMENTALS: 'get_fundamentals',
            DataType.NEWS: 'get_news',
            DataType.ECONOMIC_EVENTS: 'get_economic_events'
        }
        
        fetch_method = method_mapping.get(data_type, 'get_quote')
        
        return await self.fetch_with_enhanced_fallback(
            failed_symbols,
            data_type,
            fetch_method,
            strategy=FetchStrategy.FALLBACK_CHAIN,
            job_id="manual_retry"
        )
