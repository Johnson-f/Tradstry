"""
Integration tests for CompanyInfoJob using real database.
Tests comprehensive data aggregation and storage functionality.
"""

import pytest
import pytest_asyncio
import asyncio
import logging
from typing import Dict, Any

from scheduler.jobs.company_info_job import CompanyInfoJob
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig

# Set up logging for test visibility
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestCompanyInfoJobIntegration:
    """Integration tests for CompanyInfoJob with real database operations."""
    
    @pytest_asyncio.fixture
    async def setup_services(self):
        """Set up real services for integration testing."""
        config = MarketDataConfig()
        brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        
        job = CompanyInfoJob(db_service, brain)
        
        yield {
            'job': job,
            'brain': brain,
            'db_service': db_service,
            'config': config
        }
        
        # Cleanup
        await brain.close()
    
    @pytest.mark.asyncio
    async def test_comprehensive_data_aggregation_real_db(self, setup_services):
        """Test comprehensive data aggregation with real database storage."""
        services = setup_services
        job = services['job']
        
        # Test with well-known symbols
        test_symbols = ['AAPL', 'MSFT']
        
        logger.info(f"🚀 Testing comprehensive aggregation for {test_symbols}")
        
        # Fetch comprehensive data
        data = await job.fetch_data(test_symbols)
        
        # Verify data was fetched
        assert data is not None, "Should return data dictionary"
        assert len(data) > 0, "Should fetch data for at least one symbol"
        
        # Verify comprehensive aggregation
        for symbol, fetch_result in data.items():
            assert fetch_result.success, f"Should successfully fetch data for {symbol}"
            assert fetch_result.data is not None, f"Should have company info data for {symbol}"
            assert fetch_result.provider is not None, f"Should have provider attribution for {symbol}"
            
            # Check that we have comprehensive data
            info = fetch_result.data
            populated_fields = [f for f in dir(info) if not f.startswith('_') and getattr(info, f) is not None]
            
            logger.info(f"📊 {symbol}: {len(populated_fields)} fields populated from {fetch_result.provider}")
            
            # Should have basic required fields
            assert hasattr(info, 'name'), f"Should have name field for {symbol}"
            assert hasattr(info, 'sector'), f"Should have sector field for {symbol}"
            
            # Log critical fields that were previously missing
            critical_fields = ['ceo', 'pb_ratio', 'revenue', 'net_income', 'ipo_date']
            found_critical = []
            for field in critical_fields:
                if hasattr(info, field) and getattr(info, field) is not None:
                    found_critical.append(f"{field}={getattr(info, field)}")
            
            if found_critical:
                logger.info(f"✅ Critical fields found for {symbol}: {found_critical}")
        
        # Store data to real database
        logger.info("💾 Storing comprehensive data to real database...")
        storage_success = await job.store_data(data)
        
        assert storage_success, "Should successfully store all data to database"
        logger.info("✅ Successfully stored comprehensive data to real database!")
    
    @pytest.mark.asyncio
    async def test_provider_aggregation_coverage(self, setup_services):
        """Test that multiple providers are being used for comprehensive coverage."""
        services = setup_services
        job = services['job']
        
        # Test with a single symbol to see provider aggregation
        test_symbol = 'AAPL'
        
        logger.info(f"🔍 Testing provider aggregation for {test_symbol}")
        
        # Use the internal comprehensive aggregation method
        result = await job._fetch_with_field_fallback(test_symbol)
        
        assert result is not None, f"Should fetch comprehensive data for {test_symbol}"
        
        # Check that we have comprehensive field coverage
        populated_fields = [f for f in dir(result) if not f.startswith('_') and getattr(result, f) is not None]
        
        logger.info(f"📈 Comprehensive aggregation result: {len(populated_fields)} fields populated")
        
        # Should have significantly more fields than single provider
        assert len(populated_fields) >= 10, "Should have comprehensive field coverage from multiple providers"
        
        # Check for fields that typically come from different providers
        expected_fields = ['name', 'sector', 'market_cap', 'pe_ratio']
        for field in expected_fields:
            assert hasattr(result, field), f"Should have {field} from provider aggregation"
    
    @pytest.mark.asyncio
    async def test_database_upsert_functionality(self, setup_services):
        """Test that database upsert function works correctly with comprehensive data."""
        services = setup_services
        job = services['job']
        db_service = services['db_service']
        
        test_symbol = 'GOOGL'
        
        logger.info(f"🗄️ Testing database upsert functionality for {test_symbol}")
        
        # Fetch data
        data = await job.fetch_data([test_symbol])
        assert data and test_symbol in data, f"Should fetch data for {test_symbol}"
        
        # Store data first time
        first_store = await job.store_data(data)
        assert first_store, "First storage should succeed"
        
        # Store same data again (should upsert, not fail)
        second_store = await job.store_data(data)
        assert second_store, "Second storage (upsert) should succeed"
        
        logger.info("✅ Database upsert functionality working correctly")
    
    @pytest.mark.asyncio
    async def test_invalid_symbol_handling(self, setup_services):
        """Test handling of invalid symbols."""
        services = setup_services
        job = services['job']
        
        # Test with invalid symbols
        invalid_symbols = ['INVALID123', 'TOOLONGSYMBOL', '']
        
        logger.info(f"🚫 Testing invalid symbol handling: {invalid_symbols}")
        
        data = await job.fetch_data(invalid_symbols)
        
        # Should handle gracefully without crashing
        assert isinstance(data, dict), "Should return dictionary even for invalid symbols"
        
        # Should filter out invalid symbols
        for symbol in invalid_symbols:
            if symbol in data:
                # If present, should not have successful data
                assert not data[symbol].success, f"Invalid symbol {symbol} should not have successful data"
        
        logger.info("✅ Invalid symbol handling working correctly")
    
    @pytest.mark.asyncio
    async def test_comprehensive_field_mapping(self, setup_services):
        """Test that all database fields are properly mapped."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🗺️ Testing comprehensive field mapping for {test_symbol}")
        
        # Fetch comprehensive data
        data = await job.fetch_data([test_symbol])
        assert data and test_symbol in data, f"Should fetch data for {test_symbol}"
        
        fetch_result = data[test_symbol]
        assert fetch_result.success, f"Should successfully fetch {test_symbol}"
        
        info = fetch_result.data
        
        # Test that all expected database fields can be accessed
        database_fields = [
            'name', 'company_name', 'sector', 'industry', 'market_cap', 
            'employees', 'revenue', 'net_income', 'pe_ratio', 'pb_ratio',
            'dividend_yield', 'description', 'website', 'ceo', 'headquarters',
            'founded', 'phone', 'email', 'ipo_date', 'currency', 'fiscal_year_end'
        ]
        
        accessible_fields = []
        for field in database_fields:
            if hasattr(info, field):
                value = getattr(info, field)
                if value is not None:
                    accessible_fields.append(field)
        
        logger.info(f"📋 Accessible database fields: {len(accessible_fields)}/{len(database_fields)}")
        logger.info(f"   Fields with data: {accessible_fields}")
        
        # Should have reasonable field coverage
        coverage_percentage = len(accessible_fields) / len(database_fields) * 100
        assert coverage_percentage >= 50, f"Should have at least 50% field coverage, got {coverage_percentage:.1f}%"
        
        # Store to verify database mapping works
        storage_success = await job.store_data(data)
        assert storage_success, "Should successfully store with comprehensive field mapping"
        
        logger.info("✅ Comprehensive field mapping working correctly")
    
    @pytest.mark.asyncio
    async def test_multiple_symbols_batch_processing(self, setup_services):
        """Test batch processing of multiple symbols."""
        services = setup_services
        job = services['job']
        
        # Test with multiple symbols
        test_symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']
        
        logger.info(f"📦 Testing batch processing for {len(test_symbols)} symbols")
        
        # Fetch data for all symbols
        data = await job.fetch_data(test_symbols)
        
        assert isinstance(data, dict), "Should return dictionary"
        
        successful_fetches = sum(1 for result in data.values() if result.success)
        logger.info(f"📊 Batch processing results: {successful_fetches}/{len(test_symbols)} successful")
        
        # Should fetch data for most symbols
        assert successful_fetches >= len(test_symbols) * 0.6, "Should successfully fetch at least 60% of symbols"
        
        # Store all data
        if data:
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store batch data"
        
        logger.info("✅ Batch processing working correctly")
    
    @pytest.mark.asyncio
    async def test_provider_attribution_tracking(self, setup_services):
        """Test that provider attribution is properly tracked."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"🏷️ Testing provider attribution for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        assert data and test_symbol in data, f"Should fetch data for {test_symbol}"
        
        fetch_result = data[test_symbol]
        assert fetch_result.success, f"Should successfully fetch {test_symbol}"
        assert fetch_result.provider is not None, "Should have provider attribution"
        
        # Provider should indicate multiple providers were used
        provider_info = fetch_result.provider
        logger.info(f"🔍 Provider attribution: {provider_info}")
        
        # Should contain multiple provider names joined with '+'
        assert '+' in provider_info or len(provider_info.split()) > 1, "Should indicate multiple providers were aggregated"
        
        logger.info("✅ Provider attribution tracking working correctly")
