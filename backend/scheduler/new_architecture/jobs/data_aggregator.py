"""
Multi-provider data aggregator for maximizing data coverage and quality.
This module handles fetching from multiple providers and intelligently combining results.
"""

import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import asyncio

from market_data.brain import MarketDataBrain, FetchResult

logger = logging.getLogger(__name__)


class DataAggregator:
    """
    Aggregates data from multiple providers to ensure maximum coverage and quality.
    """
    
    def __init__(self, market_data_brain: MarketDataBrain):
        """Initialize the data aggregator."""
        self.market_data_brain = market_data_brain
        
        # Define critical fields for each data type
        self.critical_fields = {
            "stock_quotes": ["price", "volume", "change"],
            "company_info": ["name", "sector", "market_cap"],
            "dividends": ["amount", "ex_date", "pay_date"],
            "earnings": ["eps_actual", "eps_estimate", "date"],
            "fundamentals": ["revenue", "net_income", "total_assets"],
            "historical_prices": ["open", "high", "low", "close", "volume"]
        }
    
    async def aggregate_stock_quotes(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Aggregate stock quotes from multiple providers for maximum coverage.
        
        Args:
            symbols: List of stock symbols to fetch
            
        Returns:
            Aggregated data with maximum field coverage
        """
        try:
            logger.info(f"Aggregating stock quotes for {len(symbols)} symbols from multiple providers")
            
            # Fetch quotes for each symbol (MarketDataBrain uses get_quote for single symbols)
            primary_data = {}
            for symbol in symbols:
                result = await self.market_data_brain.get_quote(symbol)
                if result.success:
                    primary_data[symbol] = result.data
            
            primary_result = type('FetchResult', (), {
                'success': len(primary_data) > 0,
                'data': primary_data,
                'provider': 'aggregated'
            })()
            
            if not primary_result.success:
                logger.warning(f"Primary provider failed for stock quotes: {primary_result.error}")
                return {"success": False, "data": {}, "coverage": 0}
            
            aggregated_data = primary_result.data.copy()
            coverage_stats = self._calculate_coverage(aggregated_data, "stock_quotes")
            
            logger.info(f"Primary provider coverage: {coverage_stats['coverage_percentage']:.1f}%")
            
            # If coverage is below threshold, supplement with additional providers
            if coverage_stats['coverage_percentage'] < 95.0:
                logger.info("Coverage below 95%, fetching from additional providers...")
                supplemented_data = await self._supplement_missing_data(
                    aggregated_data, symbols, "stock_quotes"
                )
                aggregated_data.update(supplemented_data)
                
                # Recalculate coverage
                coverage_stats = self._calculate_coverage(aggregated_data, "stock_quotes")
                logger.info(f"Final coverage after aggregation: {coverage_stats['coverage_percentage']:.1f}%")
            
            return {
                "success": True,
                "data": aggregated_data,
                "coverage": coverage_stats['coverage_percentage'],
                "missing_fields": coverage_stats['missing_fields'],
                "provider_sources": self._track_provider_sources(aggregated_data)
            }
            
        except Exception as e:
            logger.error(f"Error in stock quotes aggregation: {e}")
            return {"success": False, "data": {}, "coverage": 0}
    
    async def aggregate_company_info(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Aggregate company information from multiple providers.
        
        Args:
            symbols: List of stock symbols to fetch
            
        Returns:
            Aggregated company information with maximum coverage
        """
        try:
            logger.info(f"Aggregating company info for {len(symbols)} symbols")
            
            # Fetch from multiple providers concurrently for company info
            providers = self.market_data_brain.get_available_providers()
            
            # Fetch company info for each symbol
            primary_data = {}
            for symbol in symbols:
                result = await self.market_data_brain.get_company_info(symbol)
                if result.success:
                    primary_data[symbol] = result.data
            
            primary_result = type('FetchResult', (), {
                'success': len(primary_data) > 0,
                'data': primary_data,
                'provider': 'aggregated'
            })()
            
            if not primary_result.success:
                logger.warning(f"Primary provider failed for company info: {primary_result.error}")
                return {"success": False, "data": {}, "coverage": 0}
            
            aggregated_data = primary_result.data.copy()
            
            # For company info, we want comprehensive data, so fetch from multiple providers
            supplemental_tasks = []
            for provider in providers[1:3]:  # Use top 2 additional providers
                task = self._fetch_company_info_from_provider(symbols, provider)
                supplemental_tasks.append(task)
            
            if supplemental_tasks:
                supplemental_results = await asyncio.gather(*supplemental_tasks, return_exceptions=True)
                
                # Merge supplemental data
                for result in supplemental_results:
                    if isinstance(result, dict) and result.get('success'):
                        aggregated_data = self._merge_company_data(aggregated_data, result['data'])
            
            coverage_stats = self._calculate_coverage(aggregated_data, "company_info")
            
            return {
                "success": True,
                "data": aggregated_data,
                "coverage": coverage_stats['coverage_percentage'],
                "missing_fields": coverage_stats['missing_fields'],
                "provider_sources": self._track_provider_sources(aggregated_data)
            }
            
        except Exception as e:
            logger.error(f"Error in company info aggregation: {e}")
            return {"success": False, "data": {}, "coverage": 0}
    
    async def aggregate_fundamentals(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Aggregate fundamental data from multiple providers.
        
        Args:
            symbols: List of stock symbols to fetch
            
        Returns:
            Aggregated fundamental data with maximum coverage
        """
        try:
            logger.info(f"Aggregating fundamental data for {len(symbols)} symbols")
            
            # Fetch fundamental data for each symbol
            primary_data = {}
            for symbol in symbols:
                result = await self.market_data_brain.get_fundamentals(symbol)
                if result.success:
                    primary_data[symbol] = result.data
            
            primary_result = type('FetchResult', (), {
                'success': len(primary_data) > 0,
                'data': primary_data,
                'provider': 'aggregated'
            })()
            
            if not primary_result.success:
                logger.warning(f"Primary provider failed for fundamentals: {primary_result.error}")
                return {"success": False, "data": {}, "coverage": 0}
            
            aggregated_data = primary_result.data.copy()
            
            # Always supplement fundamentals from additional providers for completeness
            supplemented_data = await self._supplement_missing_data(
                aggregated_data, symbols, "fundamentals"
            )
            aggregated_data.update(supplemented_data)
            
            coverage_stats = self._calculate_coverage(aggregated_data, "fundamentals")
            
            return {
                "success": True,
                "data": aggregated_data,
                "coverage": coverage_stats['coverage_percentage'],
                "missing_fields": coverage_stats['missing_fields'],
                "provider_sources": self._track_provider_sources(aggregated_data)
            }
            
        except Exception as e:
            logger.error(f"Error in fundamentals aggregation: {e}")
            return {"success": False, "data": {}, "coverage": 0}
    
    def _calculate_coverage(self, data: Dict[str, Any], data_type: str) -> Dict[str, Any]:
        """Calculate data coverage percentage and identify missing fields."""
        if not data:
            return {"coverage_percentage": 0.0, "missing_fields": []}
        
        critical_fields = self.critical_fields.get(data_type, [])
        if not critical_fields:
            return {"coverage_percentage": 100.0, "missing_fields": []}
        
        total_symbols = len(data)
        total_possible_fields = total_symbols * len(critical_fields)
        present_fields = 0
        missing_fields = []
        
        for symbol, symbol_data in data.items():
            if not symbol_data:
                missing_fields.extend([f"{symbol}.{field}" for field in critical_fields])
                continue
                
            for field in critical_fields:
                if hasattr(symbol_data, field) and getattr(symbol_data, field) is not None:
                    present_fields += 1
                elif isinstance(symbol_data, dict) and symbol_data.get(field) is not None:
                    present_fields += 1
                else:
                    missing_fields.append(f"{symbol}.{field}")
        
        coverage_percentage = (present_fields / total_possible_fields) * 100 if total_possible_fields > 0 else 0
        
        return {
            "coverage_percentage": coverage_percentage,
            "missing_fields": missing_fields,
            "present_fields": present_fields,
            "total_possible_fields": total_possible_fields
        }
    
    async def _supplement_missing_data(self, existing_data: Dict[str, Any], symbols: List[str], data_type: str) -> Dict[str, Any]:
        """Supplement missing data from additional providers."""
        try:
            # Get symbols that need supplementation
            symbols_needing_data = []
            for symbol in symbols:
                if symbol not in existing_data or not existing_data[symbol]:
                    symbols_needing_data.append(symbol)
            
            if not symbols_needing_data:
                return {}
            
            logger.info(f"Supplementing data for {len(symbols_needing_data)} symbols")
            
            # Try secondary providers
            supplemental_data = {}
            
            if data_type == "stock_quotes":
                # Try alternative method or provider for stock quotes
                fallback_result = await self.market_data_brain.get_stock_quotes(symbols_needing_data)
                if fallback_result.success:
                    supplemental_data.update(fallback_result.data)
            
            elif data_type == "company_info":
                # For company info, try different provider endpoints
                fallback_result = await self.market_data_brain.get_company_info(symbols_needing_data)
                if fallback_result.success:
                    supplemental_data.update(fallback_result.data)
            
            elif data_type == "fundamentals":
                # Fundamentals often need multiple sources
                fallback_result = await self.market_data_brain.get_fundamentals(symbols_needing_data)
                if fallback_result.success:
                    supplemental_data.update(fallback_result.data)
            
            return supplemental_data
            
        except Exception as e:
            logger.error(f"Error supplementing missing data: {e}")
            return {}
    
    async def _fetch_company_info_from_provider(self, symbols: List[str], provider: str) -> Dict[str, Any]:
        """Fetch company info from a specific provider."""
        try:
            # This would use provider-specific methods if available
            result = await self.market_data_brain.get_company_info(symbols)
            return {"success": result.success, "data": result.data, "provider": provider}
        except Exception as e:
            logger.error(f"Error fetching from provider {provider}: {e}")
            return {"success": False, "data": {}}
    
    def _merge_company_data(self, primary_data: Dict[str, Any], supplemental_data: Dict[str, Any]) -> Dict[str, Any]:
        """Merge company data from multiple providers, filling gaps."""
        merged_data = primary_data.copy()
        
        for symbol, supp_info in supplemental_data.items():
            if symbol not in merged_data or not merged_data[symbol]:
                merged_data[symbol] = supp_info
            else:
                # Merge fields, keeping existing data but filling gaps
                primary_info = merged_data[symbol]
                
                # Fill missing fields from supplemental data
                if hasattr(primary_info, '__dict__'):
                    for attr_name in dir(supp_info):
                        if not attr_name.startswith('_'):
                            primary_value = getattr(primary_info, attr_name, None)
                            if primary_value is None:
                                supp_value = getattr(supp_info, attr_name, None)
                                if supp_value is not None:
                                    setattr(primary_info, attr_name, supp_value)
                elif isinstance(primary_info, dict) and isinstance(supp_info, dict):
                    for key, value in supp_info.items():
                        if key not in primary_info or primary_info[key] is None:
                            primary_info[key] = value
        
        return merged_data
    
    def _track_provider_sources(self, data: Dict[str, Any]) -> Dict[str, List[str]]:
        """Track which providers contributed to each symbol's data."""
        # This would be enhanced to track actual provider sources
        # For now, return placeholder tracking
        provider_sources = {}
        for symbol in data.keys():
            provider_sources[symbol] = ["primary_provider"]  # Would track actual sources
        return provider_sources
