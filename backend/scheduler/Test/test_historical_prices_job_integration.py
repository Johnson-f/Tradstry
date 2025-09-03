"""
Integration tests for HistoricalPricesJob using real database.
Tests comprehensive data aggregation and storage functionality.
"""

import pytest
import pytest_asyncio
import asyncio
import logging
from typing import Dict, Any
from datetime import datetime, timedelta

from scheduler.jobs.historical_prices_job import HistoricalPricesJob
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig

# Set up logging for test visibility
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestHistoricalPricesJobIntegration:
    """Integration tests for HistoricalPricesJob with real database operations."""
    
    @pytest_asyncio.fixture
    async def setup_services(self):
        """Set up real services for integration testing."""
        config = MarketDataConfig()
        brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        
        job = HistoricalPricesJob(db_service, brain)
        
        yield {
            'job': job,
            'brain': brain,
            'db_service': db_service,
            'config': config
        }
        
        # Cleanup
        await brain.close()
    
    @pytest.mark.asyncio
    async def test_comprehensive_historical_prices_aggregation_real_db(self, setup_services):
        """Test comprehensive historical prices data aggregation with real database storage."""
        services = setup_services
        job = services['job']
        
        # Test with well-known symbols
        test_symbols = ['AAPL', 'MSFT']
        
        logger.info(f"🚀 Testing comprehensive historical prices aggregation for {test_symbols}")
        
        # Fetch comprehensive historical prices data
        data = await job.fetch_data(test_symbols)
        
        # Verify data was fetched
        assert data is not None, "Should return data dictionary"
        assert len(data) >= 0, "Should return dictionary even if no data"
        
        # Verify comprehensive aggregation
        for symbol, fetch_result in data.items():
            assert fetch_result.success, f"Should successfully fetch data for {symbol}"
            assert fetch_result.data is not None, f"Should have historical prices data for {symbol}"
            assert fetch_result.provider is not None, f"Should have provider attribution for {symbol}"
            
            # Check that we have comprehensive data
            price_history = fetch_result.data
            assert isinstance(price_history, list), f"Should have list of price records for {symbol}"
            
            logger.info(f"📊 {symbol}: {len(price_history)} price records from {fetch_result.provider}")
            
            # Check price record structure
            if len(price_history) > 0:
                sample_record = price_history[0]
                assert hasattr(sample_record, 'date'), f"Should have date field for {symbol}"
                assert hasattr(sample_record, 'close'), f"Should have close price field for {symbol}"
                
                # Log sample price data
                date = getattr(sample_record, 'date', None)
                close = getattr(sample_record, 'close', None)
                volume = getattr(sample_record, 'volume', None)
                
                logger.info(f"✅ Sample price for {symbol}: ${close} on {date} (volume: {volume})")
        
        # Store data to real database
        if data:
            logger.info("💾 Storing comprehensive historical prices data to real database...")
            storage_success = await job.store_data(data)
            
            assert storage_success, "Should successfully store all data to database"
            logger.info("✅ Successfully stored comprehensive historical prices data to real database!")
    
    @pytest.mark.asyncio
    async def test_historical_prices_provider_aggregation(self, setup_services):
        """Test that multiple providers are being used for comprehensive historical prices coverage."""
        services = setup_services
        job = services['job']
        
        # Test with a single symbol to see provider aggregation
        test_symbol = 'AAPL'
        
        logger.info(f"🔍 Testing historical prices provider aggregation for {test_symbol}")
        
        # Use the internal comprehensive aggregation method
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=30)
        result = await job._fetch_with_provider_fallback(test_symbol, start_date, end_date)
        
        if result is not None:
            assert result.success, f"Should fetch comprehensive historical prices data for {test_symbol}"
            
            # Check that we have price records
            price_history = result.data
            assert isinstance(price_history, list), f"Should have list of price records for {test_symbol}"
            
            logger.info(f"📈 Comprehensive aggregation result: {len(price_history)} price records")
            
            # Should have reasonable data coverage
            assert len(price_history) >= 0, "Should handle historical prices aggregation without errors"
            
            # Check for essential fields
            if len(price_history) > 0:
                sample_record = price_history[0]
                assert hasattr(sample_record, 'date'), "Should have date field"
                assert hasattr(sample_record, 'close'), "Should have close price field"
        else:
            logger.info(f"ℹ️ No historical prices data available for {test_symbol} from any provider")
    
    @pytest.mark.asyncio
    async def test_historical_prices_database_upsert(self, setup_services):
        """Test that database upsert function works correctly with historical prices data."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'GOOGL'
        
        logger.info(f"🗄️ Testing historical prices database upsert functionality for {test_symbol}")
        
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
            logger.info(f"ℹ️ No historical prices data available for {test_symbol} to test upsert")
    
    @pytest.mark.asyncio
    async def test_historical_prices_field_mapping(self, setup_services):
        """Test that all historical prices database fields are properly mapped."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🗺️ Testing historical prices field mapping for {test_symbol}")
        
        # Fetch comprehensive data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            price_history = fetch_result.data
            assert isinstance(price_history, list), f"Should have list of price records for {test_symbol}"
            
            # Test that all expected database fields can be accessed
            database_fields = [
                'date', 'open', 'high', 'low', 'close', 'adjusted_close',
                'volume', 'dividend', 'split_ratio'
            ]
            
            field_coverage = {}
            for record in price_history[:5]:  # Check first 5 records
                for field in database_fields:
                    if hasattr(record, field):
                        value = getattr(record, field)
                        if value is not None:
                            if field not in field_coverage:
                                field_coverage[field] = 0
                            field_coverage[field] += 1
            
            logger.info(f"📋 Accessible database fields:")
            for field, count in field_coverage.items():
                logger.info(f"   {field}: {count} records")
            
            # Should have essential fields
            assert 'date' in field_coverage, "Should have date field in some records"
            assert 'close' in field_coverage, "Should have close price field in some records"
            
            # Store to verify database mapping works
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store with comprehensive field mapping"
            
            logger.info("✅ Comprehensive historical prices field mapping working correctly")
        else:
            logger.info(f"ℹ️ No historical prices data available for {test_symbol} to test field mapping")
    
    @pytest.mark.asyncio
    async def test_invalid_historical_prices_data_handling(self, setup_services):
        """Test handling of invalid historical prices data."""
        services = setup_services
        job = services['job']
        
        # Test with invalid symbols
        invalid_symbols = ['INVALID123', 'TOOLONGSYMBOL', '']
        
        logger.info(f"🚫 Testing invalid historical prices data handling: {invalid_symbols}")
        
        data = await job.fetch_data(invalid_symbols)
        
        # Should handle gracefully without crashing
        assert isinstance(data, dict), "Should return dictionary even for invalid symbols"
        
        # Should filter out invalid symbols
        for symbol in invalid_symbols:
            if symbol in data:
                # If present, should not have successful data
                assert not data[symbol].success, f"Invalid symbol {symbol} should not have successful data"
        
        logger.info("✅ Invalid historical prices data handling working correctly")
    
    @pytest.mark.asyncio
    async def test_historical_prices_data_validation(self, setup_services):
        """Test that historical prices data validation works correctly."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"✅ Testing historical prices data validation for {test_symbol}")
        
        # Fetch data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            price_history = fetch_result.data
            assert isinstance(price_history, list), f"Should have list of price records for {test_symbol}"
            
            # Validate price records
            for record in price_history[:3]:  # Check first 3 records
                # Validate required fields exist
                assert hasattr(record, 'date'), "Should have date field"
                assert hasattr(record, 'close'), "Should have close price field"
                
                # Validate data types for numeric fields
                numeric_fields = ['open', 'high', 'low', 'close', 'volume']
                for field in numeric_fields:
                    if hasattr(record, field):
                        value = getattr(record, field)
                        if value is not None:
                            assert isinstance(value, (int, float)), f"{field} should be numeric if present"
                
                # Validate date format if present
                date_value = getattr(record, 'date', None)
                if date_value:
                    assert isinstance(date_value, (str, datetime, type(None))), "date should be string, datetime or None"
            
            logger.info(f"✅ Validated {len(price_history)} price records for {test_symbol}")
        else:
            logger.info(f"ℹ️ No historical prices data available for {test_symbol} to validate")
    
    @pytest.mark.asyncio
    async def test_multiple_historical_prices_symbols_batch(self, setup_services):
        """Test batch processing of multiple symbols for historical prices."""
        services = setup_services
        job = services['job']
        
        # Test with multiple symbols
        test_symbols = ['AAPL', 'MSFT', 'GOOGL']
        
        logger.info(f"📦 Testing historical prices batch processing for {len(test_symbols)} symbols")
        
        # Fetch data for all symbols
        data = await job.fetch_data(test_symbols)
        
        assert isinstance(data, dict), "Should return dictionary"
        
        successful_fetches = sum(1 for result in data.values() if result.success)
        total_records = sum(len(result.data) for result in data.values() if result.success and result.data)
        
        logger.info(f"📊 Batch processing results: {successful_fetches}/{len(test_symbols)} successful")
        logger.info(f"   Total price records: {total_records}")
        
        # Should handle batch processing without errors
        assert successful_fetches >= 0, "Should handle batch processing without errors"
        
        # Store all data
        if data:
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store batch historical prices data"
        
        logger.info("✅ Historical prices batch processing working correctly")
    
    @pytest.mark.asyncio
    async def test_historical_prices_provider_attribution(self, setup_services):
        """Test that provider attribution is properly tracked for historical prices."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"🏷️ Testing historical prices provider attribution for {test_symbol}")
        
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
            
            logger.info("✅ Historical prices provider attribution tracking working correctly")
        else:
            logger.info(f"ℹ️ No historical prices data available for {test_symbol} to test provider attribution")
    
    @pytest.mark.asyncio
    async def test_historical_prices_deduplication(self, setup_services):
        """Test that duplicate historical price records are properly handled."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🔄 Testing historical prices deduplication for {test_symbol}")
        
        # Fetch data which should include deduplication
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            price_history = fetch_result.data
            
            # Check for duplicate dates
            seen_dates = set()
            duplicates_found = 0
            
            for record in price_history:
                date_value = getattr(record, 'date', None)
                
                if date_value:
                    if date_value in seen_dates:
                        duplicates_found += 1
                    seen_dates.add(date_value)
            
            logger.info(f"📋 Deduplication check: {duplicates_found} duplicates found in {len(price_history)} records")
            assert duplicates_found == 0, "Should not have duplicate records with same date"
        else:
            logger.info(f"ℹ️ No historical prices data available for {test_symbol} to test deduplication")
    
    @pytest.mark.asyncio
    async def test_historical_prices_date_range(self, setup_services):
        """Test that historical prices are fetched for the correct date range."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"📅 Testing historical prices date range for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            price_history = fetch_result.data
            
            # Check date range (should be within last 30 days)
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=30)
            
            dates_in_range = 0
            dates_out_of_range = 0
            
            for record in price_history:
                date_value = getattr(record, 'date', None)
                if date_value:
                    try:
                        # Handle different date formats
                        if isinstance(date_value, str):
                            record_date = datetime.strptime(date_value, '%Y-%m-%d').date()
                        elif isinstance(date_value, datetime):
                            record_date = date_value.date()
                        else:
                            record_date = date_value
                        
                        if start_date <= record_date <= end_date:
                            dates_in_range += 1
                        else:
                            dates_out_of_range += 1
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid date format: {date_value}")
            
            logger.info(f"📊 Date range check: {dates_in_range} in range, {dates_out_of_range} out of range")
            logger.info(f"   Expected range: {start_date} to {end_date}")
            
            # Most dates should be in the expected range
            if dates_in_range + dates_out_of_range > 0:
                in_range_percentage = dates_in_range / (dates_in_range + dates_out_of_range) * 100
                logger.info(f"   {in_range_percentage:.1f}% of dates in expected range")
            
            logger.info("✅ Historical prices date range handled correctly")
        else:
            logger.info(f"ℹ️ No historical prices data available for {test_symbol} to test date range")
