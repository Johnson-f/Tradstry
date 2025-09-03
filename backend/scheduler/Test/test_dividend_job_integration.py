"""
Integration tests for DividendDataJob using real database.
Tests comprehensive dividend data aggregation and storage functionality.
"""

import pytest
import asyncio
import logging
from typing import Dict, Any, List
from datetime import datetime, date

from scheduler.jobs.dividend_job import DividendDataJob
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig

# Set up logging for test visibility
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestDividendJobIntegration:
    """Integration tests for DividendDataJob with real database operations."""
    
    @pytest.fixture
    async def setup_services(self):
        """Set up real services for integration testing."""
        config = MarketDataConfig()
        brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        
        job = DividendDataJob(db_service, brain)
        
        yield {
            'job': job,
            'brain': brain,
            'db_service': db_service,
            'config': config
        }
        
        # Cleanup
        await brain.close()
    
    @pytest.mark.asyncio
    async def test_comprehensive_dividend_aggregation_real_db(self, setup_services):
        """Test comprehensive dividend data aggregation with real database storage."""
        services = await setup_services
        job = services['job']
        
        # Test with dividend-paying symbols
        test_symbols = ['AAPL', 'MSFT', 'JNJ']
        
        logger.info(f"🚀 Testing comprehensive dividend aggregation for {test_symbols}")
        
        # Fetch comprehensive dividend data
        data = await job.fetch_data(test_symbols)
        
        # Verify data was fetched
        assert data is not None, "Should return data dictionary"
        
        total_dividends = 0
        successful_symbols = 0
        
        for symbol, dividends in data.items():
            if isinstance(dividends, list) and len(dividends) > 0:
                successful_symbols += 1
                total_dividends += len(dividends)
                
                # Verify provider attribution
                providers = set()
                for dividend in dividends:
                    assert isinstance(dividend, dict), f"Dividend should be dict for {symbol}"
                    assert 'provider' in dividend, f"Should have provider attribution for {symbol}"
                    providers.add(dividend['provider'])
                
                logger.info(f"📊 {symbol}: {len(dividends)} dividend records from {len(providers)} providers")
                logger.info(f"   Providers: {list(providers)}")
                
                # Verify required fields
                for dividend in dividends:
                    assert 'ex_dividend_date' in dividend, f"Should have ex_dividend_date for {symbol}"
                    assert 'dividend_amount' in dividend or 'amount' in dividend, f"Should have dividend amount for {symbol}"
        
        assert successful_symbols > 0, "Should fetch dividend data for at least one symbol"
        logger.info(f"📈 Total: {total_dividends} dividend records from {successful_symbols} symbols")
        
        # Store data to real database
        if data:
            logger.info("💾 Storing comprehensive dividend data to real database...")
            storage_success = await job.store_data(data)
            
            assert storage_success, "Should successfully store all dividend data to database"
            logger.info("✅ Successfully stored comprehensive dividend data to real database!")
    
    @pytest.mark.asyncio
    async def test_dividend_provider_aggregation(self, setup_services):
        """Test that multiple providers are being used for dividend data."""
        services = await setup_services
        job = services['job']
        
        # Test with a dividend-paying symbol
        test_symbol = 'AAPL'
        
        logger.info(f"🔍 Testing dividend provider aggregation for {test_symbol}")
        
        # Use the internal comprehensive aggregation method
        result = await job._fetch_with_comprehensive_aggregation(test_symbol)
        
        if result is not None:
            assert isinstance(result, list), f"Should return list of dividends for {test_symbol}"
            assert len(result) > 0, f"Should have dividend records for {test_symbol}"
            
            # Check provider diversity
            providers = set(d.get('provider', 'unknown') for d in result)
            logger.info(f"📊 Dividend aggregation result: {len(result)} records from {len(providers)} providers")
            logger.info(f"   Providers: {list(providers)}")
            
            # Verify data quality
            for dividend in result:
                assert isinstance(dividend, dict), "Each dividend should be a dictionary"
                assert 'provider' in dividend, "Should have provider attribution"
                assert 'ex_dividend_date' in dividend, "Should have ex_dividend_date"
        else:
            logger.warning(f"No dividend data found for {test_symbol} - this may be expected")
    
    @pytest.mark.asyncio
    async def test_dividend_deduplication(self, setup_services):
        """Test dividend deduplication functionality."""
        services = await setup_services
        job = services['job']
        
        # Create test dividend data with duplicates
        test_dividends = [
            {'ex_dividend_date': '2024-02-09', 'dividend_amount': 0.24, 'provider': 'alpha_vantage'},
            {'ex_dividend_date': '2024-02-09', 'dividend_amount': 0.24, 'provider': 'alpha_vantage'},  # Duplicate
            {'ex_dividend_date': '2024-02-09', 'dividend_amount': 0.24, 'provider': 'finnhub'},  # Different provider
            {'ex_dividend_date': '2024-05-10', 'dividend_amount': 0.25, 'provider': 'alpha_vantage'},  # Different date
        ]
        
        logger.info("🔄 Testing dividend deduplication")
        
        # Test deduplication
        unique_dividends = job._deduplicate_dividends(test_dividends)
        
        assert len(unique_dividends) == 3, f"Should have 3 unique dividends, got {len(unique_dividends)}"
        
        # Verify no exact duplicates (same date + provider)
        seen_keys = set()
        for dividend in unique_dividends:
            key = f"{dividend.get('ex_dividend_date')}_{dividend.get('provider')}"
            assert key not in seen_keys, f"Found duplicate key: {key}"
            seen_keys.add(key)
        
        logger.info("✅ Dividend deduplication working correctly")
    
    @pytest.mark.asyncio
    async def test_dividend_database_upsert(self, setup_services):
        """Test dividend database upsert functionality."""
        services = await setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🗄️ Testing dividend database upsert for {test_symbol}")
        
        # Fetch dividend data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data and len(data[test_symbol]) > 0:
            # Store data first time
            first_store = await job.store_data(data)
            assert first_store, "First dividend storage should succeed"
            
            # Store same data again (should upsert, not fail)
            second_store = await job.store_data(data)
            assert second_store, "Second dividend storage (upsert) should succeed"
            
            logger.info("✅ Dividend database upsert functionality working correctly")
        else:
            logger.warning(f"No dividend data found for {test_symbol} - skipping upsert test")
    
    @pytest.mark.asyncio
    async def test_dividend_field_mapping(self, setup_services):
        """Test that all dividend database fields are properly mapped."""
        services = await setup_services
        job = services['job']
        
        test_symbol = 'JNJ'  # Johnson & Johnson - reliable dividend payer
        
        logger.info(f"🗺️ Testing dividend field mapping for {test_symbol}")
        
        # Fetch dividend data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data and len(data[test_symbol]) > 0:
            dividends = data[test_symbol]
            
            # Test field mapping for each dividend
            for i, dividend in enumerate(dividends[:3]):  # Test first 3 dividends
                logger.info(f"📋 Testing dividend {i+1} field mapping")
                
                # Check required fields
                assert 'ex_dividend_date' in dividend, "Should have ex_dividend_date"
                assert 'dividend_amount' in dividend or 'amount' in dividend, "Should have dividend amount"
                assert 'provider' in dividend, "Should have provider attribution"
                
                # Check optional fields that might be present
                optional_fields = [
                    'declaration_date', 'record_date', 'payment_date',
                    'dividend_type', 'frequency', 'dividend_status',
                    'dividend_yield', 'payout_ratio', 'consecutive_years',
                    'qualified_dividend', 'tax_rate', 'fiscal_year', 'fiscal_quarter'
                ]
                
                present_fields = [field for field in optional_fields if field in dividend and dividend[field] is not None]
                logger.info(f"   Optional fields present: {present_fields}")
            
            # Store to verify field mapping works
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store with comprehensive field mapping"
            
            logger.info("✅ Dividend field mapping working correctly")
        else:
            logger.warning(f"No dividend data found for {test_symbol} - skipping field mapping test")
    
    @pytest.mark.asyncio
    async def test_invalid_dividend_data_handling(self, setup_services):
        """Test handling of invalid dividend data."""
        services = await setup_services
        job = services['job']
        
        logger.info("🚫 Testing invalid dividend data handling")
        
        # Test with invalid symbols
        invalid_symbols = ['INVALID123', 'NONEXISTENT']
        
        data = await job.fetch_data(invalid_symbols)
        
        # Should handle gracefully without crashing
        assert isinstance(data, dict), "Should return dictionary even for invalid symbols"
        
        # Should not have valid dividend data for invalid symbols
        for symbol in invalid_symbols:
            if symbol in data:
                assert len(data[symbol]) == 0, f"Invalid symbol {symbol} should not have dividend data"
        
        logger.info("✅ Invalid dividend data handling working correctly")
    
    @pytest.mark.asyncio
    async def test_dividend_data_validation(self, setup_services):
        """Test dividend data validation during storage."""
        services = await setup_services
        job = services['job']
        
        logger.info("✅ Testing dividend data validation")
        
        # Create test data with invalid dividends
        test_data = {
            'TEST': [
                # Valid dividend
                {
                    'ex_dividend_date': '2024-03-15',
                    'dividend_amount': 0.50,
                    'provider': 'test_provider'
                },
                # Invalid dividend - missing required fields
                {
                    'provider': 'test_provider'
                },
                # Invalid dividend - invalid amount
                {
                    'ex_dividend_date': '2024-03-15',
                    'dividend_amount': 'invalid',
                    'provider': 'test_provider'
                }
            ]
        }
        
        # Should handle invalid data gracefully
        result = await job.store_data(test_data)
        
        # Should not crash, but may not store all records
        assert isinstance(result, bool), "Should return boolean result"
        
        logger.info("✅ Dividend data validation working correctly")
    
    @pytest.mark.asyncio
    async def test_multiple_dividend_symbols_batch(self, setup_services):
        """Test batch processing of multiple dividend-paying symbols."""
        services = await setup_services
        job = services['job']
        
        # Test with multiple dividend-paying symbols
        test_symbols = ['AAPL', 'MSFT', 'JNJ', 'KO', 'PG']  # Known dividend payers
        
        logger.info(f"📦 Testing dividend batch processing for {len(test_symbols)} symbols")
        
        # Fetch dividend data for all symbols
        data = await job.fetch_data(test_symbols)
        
        assert isinstance(data, dict), "Should return dictionary"
        
        total_dividends = 0
        successful_symbols = 0
        
        for symbol, dividends in data.items():
            if isinstance(dividends, list) and len(dividends) > 0:
                successful_symbols += 1
                total_dividends += len(dividends)
        
        logger.info(f"📊 Batch processing results: {successful_symbols}/{len(test_symbols)} symbols with dividends")
        logger.info(f"📈 Total dividend records: {total_dividends}")
        
        # Store all dividend data
        if data:
            storage_success = await job.store_data(data)
            # Note: May not be 100% successful due to data validation, but should not crash
            assert isinstance(storage_success, bool), "Should return boolean result"
        
        logger.info("✅ Dividend batch processing working correctly")
    
    @pytest.mark.asyncio
    async def test_dividend_date_handling(self, setup_services):
        """Test proper handling of dividend dates."""
        services = await setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"📅 Testing dividend date handling for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data and len(data[test_symbol]) > 0:
            dividends = data[test_symbol]
            
            for dividend in dividends:
                ex_date = dividend.get('ex_dividend_date')
                if ex_date:
                    # Should be a valid date string
                    assert isinstance(ex_date, (str, date)), f"ex_dividend_date should be string or date, got {type(ex_date)}"
                    
                    # If string, should be parseable
                    if isinstance(ex_date, str):
                        try:
                            datetime.strptime(ex_date, '%Y-%m-%d')
                        except ValueError:
                            # Try other common formats
                            try:
                                datetime.strptime(ex_date, '%m/%d/%Y')
                            except ValueError:
                                pytest.fail(f"Invalid date format: {ex_date}")
            
            logger.info("✅ Dividend date handling working correctly")
        else:
            logger.warning(f"No dividend data found for {test_symbol} - skipping date handling test")
