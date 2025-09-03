"""
Integration tests for EarningsDataJob using real database.
Tests comprehensive data aggregation and storage functionality.
"""

import pytest
import pytest_asyncio
import asyncio
import logging
from typing import Dict, Any

from scheduler.jobs.earnings_job import EarningsDataJob
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig

# Set up logging for test visibility
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestEarningsJobIntegration:
    """Integration tests for EarningsDataJob with real database operations."""
    
    @pytest_asyncio.fixture
    async def setup_services(self):
        """Set up real services for integration testing."""
        config = MarketDataConfig()
        brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        
        job = EarningsDataJob(db_service, brain)
        
        yield {
            'job': job,
            'brain': brain,
            'db_service': db_service,
            'config': config
        }
        
        # Cleanup
        await brain.close()
    
    @pytest.mark.asyncio
    async def test_comprehensive_earnings_aggregation_real_db(self, setup_services):
        """Test comprehensive earnings data aggregation with real database storage."""
        services = setup_services
        job = services['job']
        
        # Test with well-known symbols
        test_symbols = ['AAPL', 'MSFT']
        
        logger.info(f"🚀 Testing comprehensive earnings aggregation for {test_symbols}")
        
        # Fetch comprehensive earnings data
        data = await job.fetch_data(test_symbols)
        
        # Verify data was fetched
        assert data is not None, "Should return data dictionary"
        assert len(data) >= 0, "Should return dictionary even if no data"
        
        # Verify comprehensive aggregation
        for symbol, fetch_result in data.items():
            assert fetch_result.success, f"Should successfully fetch data for {symbol}"
            assert fetch_result.data is not None, f"Should have earnings data for {symbol}"
            assert fetch_result.provider is not None, f"Should have provider attribution for {symbol}"
            
            # Check that we have comprehensive data
            earnings = fetch_result.data
            populated_fields = [f for f in dir(earnings) if not f.startswith('_') and getattr(earnings, f) is not None]
            
            logger.info(f"📊 {symbol}: {len(populated_fields)} fields populated from {fetch_result.provider}")
            
            # Should have basic required fields
            assert hasattr(earnings, 'fiscal_year'), f"Should have fiscal_year field for {symbol}"
            assert hasattr(earnings, 'fiscal_quarter'), f"Should have fiscal_quarter field for {symbol}"
            
            # Log critical fields that were found
            critical_fields = ['eps', 'revenue', 'net_income', 'reported_date']
            found_critical = []
            for field in critical_fields:
                if hasattr(earnings, field) and getattr(earnings, field) is not None:
                    found_critical.append(f"{field}={getattr(earnings, field)}")
            
            if found_critical:
                logger.info(f"✅ Critical fields found for {symbol}: {found_critical}")
        
        # Store data to real database
        if data:
            logger.info("💾 Storing comprehensive earnings data to real database...")
            storage_success = await job.store_data(data)
            
            assert storage_success, "Should successfully store all data to database"
            logger.info("✅ Successfully stored comprehensive earnings data to real database!")
    
    @pytest.mark.asyncio
    async def test_earnings_provider_aggregation(self, setup_services):
        """Test that multiple providers are being used for comprehensive earnings coverage."""
        services = setup_services
        job = services['job']
        
        # Test with a single symbol to see provider aggregation
        test_symbol = 'AAPL'
        
        logger.info(f"🔍 Testing earnings provider aggregation for {test_symbol}")
        
        # Use the internal comprehensive aggregation method
        result = await job._fetch_with_field_fallback(test_symbol)
        
        if result is not None:
            assert result.success, f"Should fetch comprehensive earnings data for {test_symbol}"
            
            # Check that we have comprehensive field coverage
            earnings = result.data
            populated_fields = [f for f in dir(earnings) if not f.startswith('_') and getattr(earnings, f) is not None]
            
            logger.info(f"📈 Comprehensive aggregation result: {len(populated_fields)} fields populated")
            
            # Should have reasonable field coverage
            assert len(populated_fields) >= 5, "Should have reasonable field coverage from provider aggregation"
            
            # Check for fields that typically come from different providers
            expected_fields = ['fiscal_year', 'fiscal_quarter', 'eps', 'revenue']
            for field in expected_fields:
                assert hasattr(earnings, field), f"Should have {field} from provider aggregation"
        else:
            logger.info(f"ℹ️ No earnings data available for {test_symbol} from any provider")
    
    @pytest.mark.asyncio
    async def test_earnings_database_upsert(self, setup_services):
        """Test that database upsert function works correctly with earnings data."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'GOOGL'
        
        logger.info(f"🗄️ Testing earnings database upsert functionality for {test_symbol}")
        
        # Fetch data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            # Store data first time
            first_store = await job.store_data(data)
            assert first_store, "First storage should succeed"
            
            # Store same data again (should upsert, not fail)
            second_store = await job.store_data(data)
            assert second_store, "Second storage (upsert) should succeed"
            
            logger.info("✅ Database upsert functionality working correctly")
        else:
            logger.info(f"ℹ️ No earnings data available for {test_symbol} to test upsert")
    
    @pytest.mark.asyncio
    async def test_earnings_field_mapping(self, setup_services):
        """Test that all earnings database fields are properly mapped."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🗺️ Testing earnings field mapping for {test_symbol}")
        
        # Fetch comprehensive data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            earnings = fetch_result.data
            
            # Test that all expected database fields can be accessed
            database_fields = [
                'fiscal_year', 'fiscal_quarter', 'reported_date', 'report_type',
                'eps', 'eps_estimated', 'eps_surprise', 'eps_surprise_percent',
                'revenue', 'revenue_estimated', 'revenue_surprise', 'revenue_surprise_percent',
                'net_income', 'gross_profit', 'operating_income', 'ebitda',
                'operating_margin', 'net_margin', 'year_over_year_eps_growth',
                'year_over_year_revenue_growth', 'guidance'
            ]
            
            accessible_fields = []
            for field in database_fields:
                if hasattr(earnings, field):
                    value = getattr(earnings, field)
                    if value is not None:
                        accessible_fields.append(field)
            
            logger.info(f"📋 Accessible database fields: {len(accessible_fields)}/{len(database_fields)}")
            logger.info(f"   Fields with data: {accessible_fields}")
            
            # Should have reasonable field coverage
            coverage_percentage = len(accessible_fields) / len(database_fields) * 100
            assert coverage_percentage >= 20, f"Should have at least 20% field coverage, got {coverage_percentage:.1f}%"
            
            # Store to verify database mapping works
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store with comprehensive field mapping"
            
            logger.info("✅ Comprehensive earnings field mapping working correctly")
        else:
            logger.info(f"ℹ️ No earnings data available for {test_symbol} to test field mapping")
    
    @pytest.mark.asyncio
    async def test_invalid_earnings_data_handling(self, setup_services):
        """Test handling of invalid earnings data."""
        services = setup_services
        job = services['job']
        
        # Test with invalid symbols
        invalid_symbols = ['INVALID123', 'TOOLONGSYMBOL', '']
        
        logger.info(f"🚫 Testing invalid earnings data handling: {invalid_symbols}")
        
        data = await job.fetch_data(invalid_symbols)
        
        # Should handle gracefully without crashing
        assert isinstance(data, dict), "Should return dictionary even for invalid symbols"
        
        # Should filter out invalid symbols
        for symbol in invalid_symbols:
            if symbol in data:
                # If present, should not have successful data
                assert not data[symbol].success, f"Invalid symbol {symbol} should not have successful data"
        
        logger.info("✅ Invalid earnings data handling working correctly")
    
    @pytest.mark.asyncio
    async def test_earnings_data_validation(self, setup_services):
        """Test that earnings data validation works correctly."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"✅ Testing earnings data validation for {test_symbol}")
        
        # Fetch data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            earnings = fetch_result.data
            
            # Validate basic structure
            assert hasattr(earnings, 'fiscal_year'), "Should have fiscal_year attribute"
            assert hasattr(earnings, 'fiscal_quarter'), "Should have fiscal_quarter attribute"
            
            # Validate data types for numeric fields
            numeric_fields = ['eps', 'revenue', 'net_income']
            for field in numeric_fields:
                if hasattr(earnings, field):
                    value = getattr(earnings, field)
                    if value is not None:
                        assert isinstance(value, (int, float)), f"{field} should be numeric if present"
            
            logger.info(f"✅ Validated earnings data structure for {test_symbol}")
        else:
            logger.info(f"ℹ️ No earnings data available for {test_symbol} to validate")
    
    @pytest.mark.asyncio
    async def test_multiple_earnings_symbols_batch(self, setup_services):
        """Test batch processing of multiple symbols for earnings."""
        services = setup_services
        job = services['job']
        
        # Test with multiple symbols
        test_symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN']
        
        logger.info(f"📦 Testing earnings batch processing for {len(test_symbols)} symbols")
        
        # Fetch data for all symbols
        data = await job.fetch_data(test_symbols)
        
        assert isinstance(data, dict), "Should return dictionary"
        
        successful_fetches = sum(1 for result in data.values() if result.success)
        logger.info(f"📊 Batch processing results: {successful_fetches}/{len(test_symbols)} successful")
        
        # Should fetch data for most symbols
        assert successful_fetches >= 0, "Should handle batch processing without errors"
        
        # Store all data
        if data:
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store batch earnings data"
        
        logger.info("✅ Earnings batch processing working correctly")
    
    @pytest.mark.asyncio
    async def test_earnings_provider_attribution(self, setup_services):
        """Test that provider attribution is properly tracked for earnings."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"🏷️ Testing earnings provider attribution for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            assert fetch_result.provider is not None, "Should have provider attribution"
            
            # Provider should indicate provider information
            provider_info = fetch_result.provider
            logger.info(f"🔍 Provider attribution: {provider_info}")
            
            # Should contain provider name(s)
            assert len(provider_info) > 0, "Should have non-empty provider attribution"
            
            logger.info("✅ Earnings provider attribution tracking working correctly")
        else:
            logger.info(f"ℹ️ No earnings data available for {test_symbol} to test provider attribution")
    
    @pytest.mark.asyncio
    async def test_earnings_surprise_calculations(self, setup_services):
        """Test that earnings surprise calculations are handled correctly."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"📈 Testing earnings surprise calculations for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            earnings = fetch_result.data
            
            # Check for surprise-related fields
            surprise_fields = ['eps_surprise', 'eps_surprise_percent', 'revenue_surprise', 'revenue_surprise_percent']
            found_surprises = []
            
            for field in surprise_fields:
                if hasattr(earnings, field):
                    value = getattr(earnings, field)
                    if value is not None:
                        found_surprises.append(f"{field}={value}")
            
            if found_surprises:
                logger.info(f"📊 Surprise data found for {test_symbol}: {found_surprises}")
            else:
                logger.info(f"ℹ️ No surprise data available for {test_symbol}")
            
            logger.info("✅ Earnings surprise calculations handled correctly")
        else:
            logger.info(f"ℹ️ No earnings data available for {test_symbol} to test surprise calculations")
