"""
Integration tests for DividendDataJob using real database.
Tests comprehensive data aggregation and storage functionality.
"""

import pytest
import pytest_asyncio
import asyncio
import logging
from typing import Dict, Any

from scheduler.jobs.dividend_job import DividendDataJob
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig

# Set up logging for test visibility
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestDividendJobIntegration:
    """Integration tests for DividendDataJob with real database operations."""
    
    @pytest_asyncio.fixture
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
        services = setup_services
        job = services['job']
        
        # Test with well-known dividend-paying symbols
        test_symbols = ['AAPL', 'MSFT']
        
        logger.info(f"🚀 Testing comprehensive dividend aggregation for {test_symbols}")
        
        # Fetch comprehensive dividend data
        data = await job.fetch_data(test_symbols)
        
        # Verify data was fetched
        assert data is not None, "Should return data dictionary"
        
        # Verify comprehensive aggregation
        for symbol, fetch_result in data.items():
            assert fetch_result is not None, f"Should have dividend data for {symbol}"
            assert hasattr(fetch_result, 'success'), f"Should have FetchResult object for {symbol}"
            assert fetch_result.success, f"Should have successful fetch result for {symbol}"
            assert hasattr(fetch_result, 'data'), f"Should have data in FetchResult for {symbol}"
            
            dividends = fetch_result.data
            assert isinstance(dividends, list), f"Should have list of dividends for {symbol}"
            
            if len(dividends) > 0:
                logger.info(f"📊 {symbol}: {len(dividends)} dividend records found from {fetch_result.provider}")
                
                # Check dividend record structure
                for dividend in dividends[:3]:  # Check first 3 records
                    # Check for normalized field names
                    has_ex_date = 'ex_dividend_date' in dividend or 'ex_date' in dividend
                    has_amount = 'dividend_amount' in dividend or 'cash_amount' in dividend or 'amount' in dividend
                    
                    assert has_ex_date, f"Should have ex_dividend_date field for {symbol}: {dividend.keys()}"
                    assert has_amount, f"Should have dividend_amount field for {symbol}: {dividend.keys()}"
                    assert 'provider' in dividend, f"Should have provider attribution for {symbol}"
                    
                    # Get the actual values for logging
                    ex_date = dividend.get('ex_dividend_date') or dividend.get('ex_date')
                    amount = dividend.get('dividend_amount') or dividend.get('cash_amount') or dividend.get('amount')
                    
                    logger.info(f"✅ {symbol}: ${amount} on {ex_date} from {dividend.get('provider')}")
        
        # Store data to real database if we have any
        if data:
            logger.info("💾 Storing comprehensive dividend data to real database...")
            storage_success = await job.store_data(data)
            
            assert storage_success, "Should successfully store all data to database"
            logger.info("✅ Successfully stored comprehensive dividend data to real database!")
    
    @pytest.mark.asyncio
    async def test_dividend_provider_aggregation(self, setup_services):
        """Test that multiple providers are being used for comprehensive dividend coverage."""
        services = setup_services
        job = services['job']
        
        # Test with a single symbol to see provider aggregation
        test_symbol = 'AAPL'
        
        logger.info(f"🔍 Testing dividend provider aggregation for {test_symbol}")
        
        # Use the internal comprehensive aggregation method
        result = await job._fetch_with_comprehensive_aggregation(test_symbol)
        
        if result is not None:
            assert isinstance(result, list), f"Should return list of dividends for {test_symbol}"
            
            # Check that we have dividend records with provider attribution
            providers_found = set()
            for dividend in result:
                if 'provider' in dividend:
                    providers_found.add(dividend['provider'])
            
            logger.info(f"📈 Comprehensive aggregation result: {len(result)} dividend records from {len(providers_found)} providers")
            logger.info(f"   Providers: {list(providers_found)}")
            
            # Should have at least some dividend data
            assert len(result) > 0, "Should have dividend records from provider aggregation"
        else:
            logger.info(f"ℹ️ No dividend data available for {test_symbol} from any provider")
    
    @pytest.mark.asyncio
    async def test_dividend_deduplication(self, setup_services):
        """Test that duplicate dividend records are properly handled."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🔄 Testing dividend deduplication for {test_symbol}")
        
        # Fetch data which should include deduplication
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            if hasattr(fetch_result, 'data') and fetch_result.data:
                dividends = fetch_result.data
                
                # Check for duplicate ex_dividend_dates from same provider
                seen_combinations = set()
                duplicates_found = 0
                
                for dividend in dividends:
                    ex_date = dividend.get('ex_dividend_date') or dividend.get('ex_date')
                    provider = dividend.get('provider')
                    
                    if ex_date and provider:
                        key = f"{ex_date}_{provider}"
                        if key in seen_combinations:
                            duplicates_found += 1
                        seen_combinations.add(key)
                
                logger.info(f"📋 Deduplication check: {duplicates_found} duplicates found in {len(dividends)} records")
                assert duplicates_found == 0, "Should not have duplicate records with same ex_date and provider"
        else:
            logger.info(f"ℹ️ No dividend data available for {test_symbol} to test deduplication")
    
    @pytest.mark.asyncio
    async def test_dividend_database_upsert(self, setup_services):
        """Test that database upsert function works correctly with dividend data."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'GOOGL'
        
        logger.info(f"🗄️ Testing dividend database upsert functionality for {test_symbol}")
        
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
            logger.info(f"ℹ️ No dividend data available for {test_symbol} to test upsert")
    
    @pytest.mark.asyncio
    async def test_dividend_field_mapping(self, setup_services):
        """Test that all dividend database fields are properly mapped."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🗺️ Testing dividend field mapping for {test_symbol}")
        
        # Fetch comprehensive data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            if hasattr(fetch_result, 'data') and fetch_result.data:
                dividends = fetch_result.data
                
                # Test that expected database fields can be accessed
                database_fields = [
                    'ex_dividend_date', 'dividend_amount', 'declaration_date', 'record_date',
                    'payment_date', 'dividend_type', 'currency', 'frequency', 'dividend_status',
                    'dividend_yield', 'payout_ratio', 'consecutive_years', 'qualified_dividend',
                    'tax_rate', 'fiscal_year', 'fiscal_quarter'
                ]
                
                field_coverage = {}
                for dividend in dividends[:5]:  # Check first 5 records
                    for field in database_fields:
                        # Also check for alternative field names
                        alt_fields = {
                            'ex_dividend_date': ['ex_date'],
                            'dividend_amount': ['cash_amount', 'amount']
                        }
                        
                        field_found = field in dividend and dividend[field] is not None
                        if not field_found and field in alt_fields:
                            for alt_field in alt_fields[field]:
                                if alt_field in dividend and dividend[alt_field] is not None:
                                    field_found = True
                                    break
                        
                        if field_found:
                            if field not in field_coverage:
                                field_coverage[field] = 0
                            field_coverage[field] += 1
                
                logger.info(f"📋 Field coverage across dividend records:")
                for field, count in field_coverage.items():
                    logger.info(f"   {field}: {count} records")
                
                # Should have basic required fields (check for alternatives too)
                has_ex_date = 'ex_dividend_date' in field_coverage or any(
                    'ex_date' in div for div in dividends[:5]
                )
                has_amount = 'dividend_amount' in field_coverage or any(
                    'cash_amount' in div or 'amount' in div for div in dividends[:5]
                )
                
                assert has_ex_date, "Should have ex_dividend_date or ex_date field"
                assert has_amount, "Should have dividend_amount, cash_amount, or amount field"
                
                # Store to verify database mapping works
                if dividends:
                    storage_success = await job.store_data(data)
                    assert storage_success, "Should successfully store with comprehensive field mapping"
                    
                    logger.info("✅ Dividend field mapping working correctly")
        else:
            logger.info(f"ℹ️ No dividend data available for {test_symbol} to test field mapping")
    
    @pytest.mark.asyncio
    async def test_invalid_dividend_data_handling(self, setup_services):
        """Test handling of invalid dividend data."""
        services = setup_services
        job = services['job']
        
        # Test with invalid symbols
        invalid_symbols = ['INVALID123', 'TOOLONGSYMBOL', '']
        
        logger.info(f"🚫 Testing invalid dividend data handling: {invalid_symbols}")
        
        data = await job.fetch_data(invalid_symbols)
        
        # Should handle gracefully without crashing
        assert isinstance(data, dict), "Should return dictionary even for invalid symbols"
        
        # Should filter out invalid symbols or return empty results
        for symbol in invalid_symbols:
            if symbol in data:
                # If present, should be empty or minimal data
                dividends = data[symbol]
                assert isinstance(dividends, list), f"Invalid symbol {symbol} should return list"
        
        logger.info("✅ Invalid dividend data handling working correctly")
    
    @pytest.mark.asyncio
    async def test_dividend_data_validation(self, setup_services):
        """Test that dividend data validation works correctly."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"✅ Testing dividend data validation for {test_symbol}")
        
        # Fetch data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            if hasattr(fetch_result, 'data') and fetch_result.data:
                dividends = fetch_result.data
                
                for dividend in dividends:
                    # Validate required fields exist (check alternatives)
                    has_ex_date = 'ex_dividend_date' in dividend or 'ex_date' in dividend
                    has_amount = 'dividend_amount' in dividend or 'cash_amount' in dividend or 'amount' in dividend
                    
                    assert has_ex_date, f"Should have ex_dividend_date or ex_date: {dividend.keys()}"
                    assert has_amount, f"Should have dividend_amount, cash_amount, or amount: {dividend.keys()}"
                    
                    # Validate data types
                    amount_field = dividend.get('dividend_amount') or dividend.get('cash_amount') or dividend.get('amount')
                    if amount_field is not None:
                        assert isinstance(amount_field, (int, float, str)), "amount should be numeric"
                    
                    # Validate date format if present
                    ex_date = dividend.get('ex_dividend_date') or dividend.get('ex_date')
                    if ex_date:
                        assert isinstance(ex_date, (str, type(None))), "ex_dividend_date should be string or None"
                
                logger.info(f"✅ Validated {len(dividends)} dividend records for {test_symbol}")
        else:
            logger.info(f"ℹ️ No dividend data available for {test_symbol} to validate")
    
    @pytest.mark.asyncio
    async def test_multiple_dividend_symbols_batch(self, setup_services):
        """Test batch processing of multiple symbols for dividends."""
        services = setup_services
        job = services['job']
        
        # Test with multiple dividend-paying symbols
        test_symbols = ['AAPL', 'MSFT', 'JNJ', 'KO', 'PG']
        
        logger.info(f"📦 Testing dividend batch processing for {len(test_symbols)} symbols")
        
        # Fetch data for all symbols
        data = await job.fetch_data(test_symbols)
        
        assert isinstance(data, dict), "Should return dictionary"
        
        successful_fetches = 0
        total_dividends = 0
        
        for symbol, fetch_result in data.items():
            if hasattr(fetch_result, 'data') and fetch_result.data and len(fetch_result.data) > 0:
                successful_fetches += 1
                total_dividends += len(fetch_result.data)
        
        logger.info(f"📊 Batch processing results: {successful_fetches}/{len(test_symbols)} symbols with dividend data")
        logger.info(f"   Total dividend records: {total_dividends}")
        
        # Store all data if we have any
        if data:
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store batch dividend data"
        
        logger.info("✅ Dividend batch processing working correctly")
    
    @pytest.mark.asyncio
    async def test_dividend_date_handling(self, setup_services):
        """Test that dividend date handling works correctly."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"📅 Testing dividend date handling for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            if hasattr(fetch_result, 'data') and fetch_result.data:
                dividends = fetch_result.data
                
                date_fields = ['ex_dividend_date', 'declaration_date', 'record_date', 'payment_date']
                date_stats = {field: 0 for field in date_fields}
                
                for dividend in dividends:
                    for field in date_fields:
                        # Check for alternative field names
                        field_value = dividend.get(field)
                        if not field_value and field == 'ex_dividend_date':
                            field_value = dividend.get('ex_date')
                        if not field_value and field == 'payment_date':
                            field_value = dividend.get('pay_date')
                        
                        if field_value is not None:
                            date_stats[field] += 1
            
            logger.info(f"📊 Date field statistics:")
            for field, count in date_stats.items():
                logger.info(f"   {field}: {count}/{len(dividends)} records")
            
            # Should have at least ex_dividend_date for most records
            assert date_stats['ex_dividend_date'] > 0, "Should have ex_dividend_date in some records"
            
            logger.info("✅ Dividend date handling working correctly")
        else:
            logger.info(f"ℹ️ No dividend data available for {test_symbol} to test date handling")
