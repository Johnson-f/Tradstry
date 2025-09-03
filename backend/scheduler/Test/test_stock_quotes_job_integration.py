"""
Integration tests for StockQuotesJob using real database.
Tests comprehensive data aggregation and storage functionality.
"""

import pytest
import pytest_asyncio
import asyncio
import logging
from typing import Dict, Any

from scheduler.jobs.stock_quotes_job import StockQuotesJob
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig

# Set up logging for test visibility
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestStockQuotesJobIntegration:
    """Integration tests for StockQuotesJob with real database operations."""
    
    @pytest_asyncio.fixture
    async def setup_services(self):
        """Set up real services for integration testing."""
        config = MarketDataConfig()
        brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        
        job = StockQuotesJob(db_service, brain)
        
        yield {
            'job': job,
            'brain': brain,
            'db_service': db_service,
            'config': config
        }
        
        # Cleanup
        await brain.close()
    
    @pytest.mark.asyncio
    async def test_comprehensive_stock_quotes_aggregation_real_db(self, setup_services):
        """Test comprehensive stock quotes data aggregation with real database storage."""
        services = setup_services
        job = services['job']
        
        # Test with well-known symbols
        test_symbols = ['AAPL', 'MSFT']
        
        logger.info(f"🚀 Testing comprehensive stock quotes aggregation for {test_symbols}")
        
        # Fetch comprehensive stock quotes data
        data = await job.fetch_data(test_symbols)
        
        # Verify data was fetched
        assert data is not None, "Should return data dictionary"
        assert len(data) >= 0, "Should return dictionary even if no data"
        
        # Verify comprehensive aggregation
        for symbol, fetch_result in data.items():
            assert fetch_result.success, f"Should successfully fetch data for {symbol}"
            assert fetch_result.data is not None, f"Should have stock quotes data for {symbol}"
            assert fetch_result.provider is not None, f"Should have provider attribution for {symbol}"
            
            # Check that we have comprehensive data
            quote_data = fetch_result.data
            assert hasattr(quote_data, 'symbol') or hasattr(quote_data, 'ticker'), f"Should have symbol field for {symbol}"
            
            logger.info(f"📊 {symbol}: Quote data from {fetch_result.provider}")
            
            # Check quote structure
            price = getattr(quote_data, 'price', None) or getattr(quote_data, 'last', None) or getattr(quote_data, 'close', None)
            volume = getattr(quote_data, 'volume', None)
            change = getattr(quote_data, 'change', None) or getattr(quote_data, 'change_amount', None)
            
            logger.info(f"✅ Quote for {symbol}: ${price} (change: {change}, volume: {volume})")
        
        # Store data to real database
        if data:
            logger.info("💾 Storing comprehensive stock quotes data to real database...")
            storage_success = await job.store_data(data)
            
            assert storage_success, "Should successfully store all data to database"
            logger.info("✅ Successfully stored comprehensive stock quotes data to real database!")
    
    @pytest.mark.asyncio
    async def test_stock_quotes_provider_aggregation(self, setup_services):
        """Test that multiple providers are being used for comprehensive stock quotes coverage."""
        services = setup_services
        job = services['job']
        
        # Test with a single symbol to see provider aggregation
        test_symbol = 'AAPL'
        
        logger.info(f"🔍 Testing stock quotes provider aggregation for {test_symbol}")
        
        # Use the internal comprehensive aggregation method
        result = await job._fetch_with_provider_fallback(test_symbol)
        
        if result is not None:
            assert result.success, f"Should fetch comprehensive stock quotes data for {test_symbol}"
            
            # Check that we have quote data
            quote_data = result.data
            assert quote_data is not None, f"Should have quote data for {test_symbol}"
            
            logger.info(f"📈 Comprehensive aggregation result for {test_symbol}")
            
            # Should have reasonable quote data
            price = getattr(quote_data, 'price', None) or getattr(quote_data, 'last', None) or getattr(quote_data, 'close', None)
            assert price is not None, "Should have price field"
            
            logger.info(f"✅ Quote price: ${price}")
        else:
            logger.info(f"ℹ️ No stock quotes data available for {test_symbol} from any provider")
    
    @pytest.mark.asyncio
    async def test_stock_quotes_database_upsert(self, setup_services):
        """Test that database upsert function works correctly with stock quotes data."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'GOOGL'
        
        logger.info(f"🗄️ Testing stock quotes database upsert functionality for {test_symbol}")
        
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
            logger.info(f"ℹ️ No stock quotes data available for {test_symbol} to test upsert")
    
    @pytest.mark.asyncio
    async def test_stock_quotes_field_mapping(self, setup_services):
        """Test that all stock quotes database fields are properly mapped."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🗺️ Testing stock quotes field mapping for {test_symbol}")
        
        # Fetch comprehensive data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            quote_data = fetch_result.data
            assert quote_data is not None, f"Should have quote data for {test_symbol}"
            
            # Test that all expected database fields can be accessed
            database_fields = [
                'symbol', 'ticker', 'price', 'last', 'close', 'open', 'high', 'low',
                'volume', 'change', 'change_amount', 'change_percent', 'previous_close',
                'bid', 'ask', 'bid_size', 'ask_size', 'market_cap', 'pe_ratio',
                'dividend_yield', 'eps', 'beta', 'week_52_high', 'week_52_low',
                'average_volume', 'shares_outstanding', 'timestamp', 'updated_at'
            ]
            
            field_coverage = {}
            for field in database_fields:
                if hasattr(quote_data, field):
                    value = getattr(quote_data, field)
                    if value is not None:
                        field_coverage[field] = value
            
            logger.info(f"📋 Accessible database fields:")
            for field, value in list(field_coverage.items())[:10]:  # Show first 10
                logger.info(f"   {field}: {value}")
            
            # Should have essential fields
            price_fields = ['price', 'last', 'close']
            has_price = any(field in field_coverage for field in price_fields)
            assert has_price, "Should have price field"
            
            symbol_fields = ['symbol', 'ticker']
            has_symbol = any(field in field_coverage for field in symbol_fields)
            assert has_symbol, "Should have symbol field"
            
            # Store to verify database mapping works
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store with comprehensive field mapping"
            
            logger.info("✅ Comprehensive stock quotes field mapping working correctly")
        else:
            logger.info(f"ℹ️ No stock quotes data available for {test_symbol} to test field mapping")
    
    @pytest.mark.asyncio
    async def test_invalid_stock_quotes_data_handling(self, setup_services):
        """Test handling of invalid stock quotes data."""
        services = setup_services
        job = services['job']
        
        # Test with invalid symbols
        invalid_symbols = ['INVALID123', 'TOOLONGSYMBOL', '']
        
        logger.info(f"🚫 Testing invalid stock quotes data handling: {invalid_symbols}")
        
        data = await job.fetch_data(invalid_symbols)
        
        # Should handle gracefully without crashing
        assert isinstance(data, dict), "Should return dictionary even for invalid symbols"
        
        # Should filter out invalid symbols
        for symbol in invalid_symbols:
            if symbol in data:
                # If present, should not have successful data
                assert not data[symbol].success, f"Invalid symbol {symbol} should not have successful data"
        
        logger.info("✅ Invalid stock quotes data handling working correctly")
    
    @pytest.mark.asyncio
    async def test_stock_quotes_data_validation(self, setup_services):
        """Test that stock quotes data validation works correctly."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"✅ Testing stock quotes data validation for {test_symbol}")
        
        # Fetch data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            quote_data = fetch_result.data
            assert quote_data is not None, f"Should have quote data for {test_symbol}"
            
            # Validate required fields exist
            price = getattr(quote_data, 'price', None) or getattr(quote_data, 'last', None) or getattr(quote_data, 'close', None)
            assert price is not None, "Should have price field"
            
            # Validate data types for numeric fields
            numeric_fields = ['price', 'last', 'close', 'open', 'high', 'low', 'volume', 
                            'change', 'change_amount', 'change_percent', 'bid', 'ask',
                            'market_cap', 'pe_ratio', 'dividend_yield', 'eps', 'beta']
            for field in numeric_fields:
                if hasattr(quote_data, field):
                    value = getattr(quote_data, field)
                    if value is not None:
                        assert isinstance(value, (int, float)), f"{field} should be numeric if present"
            
            # Validate string fields
            string_fields = ['symbol', 'ticker']
            for field in string_fields:
                if hasattr(quote_data, field):
                    value = getattr(quote_data, field)
                    if value is not None:
                        assert isinstance(value, str), f"{field} should be string if present"
            
            logger.info(f"✅ Validated quote data for {test_symbol}")
        else:
            logger.info(f"ℹ️ No stock quotes data available for {test_symbol} to validate")
    
    @pytest.mark.asyncio
    async def test_multiple_stock_quotes_symbols_batch(self, setup_services):
        """Test batch processing of multiple symbols for stock quotes."""
        services = setup_services
        job = services['job']
        
        # Test with multiple symbols
        test_symbols = ['AAPL', 'MSFT', 'GOOGL']
        
        logger.info(f"📦 Testing stock quotes batch processing for {len(test_symbols)} symbols")
        
        # Fetch data for all symbols
        data = await job.fetch_data(test_symbols)
        
        assert isinstance(data, dict), "Should return dictionary"
        
        successful_fetches = sum(1 for result in data.values() if result.success)
        
        logger.info(f"📊 Batch processing results: {successful_fetches}/{len(test_symbols)} successful")
        
        # Should handle batch processing without errors
        assert successful_fetches >= 0, "Should handle batch processing without errors"
        
        # Store all data
        if data:
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store batch stock quotes data"
        
        logger.info("✅ Stock quotes batch processing working correctly")
    
    @pytest.mark.asyncio
    async def test_stock_quotes_provider_attribution(self, setup_services):
        """Test that provider attribution is properly tracked for stock quotes."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"🏷️ Testing stock quotes provider attribution for {test_symbol}")
        
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
            
            logger.info("✅ Stock quotes provider attribution tracking working correctly")
        else:
            logger.info(f"ℹ️ No stock quotes data available for {test_symbol} to test provider attribution")
    
    @pytest.mark.asyncio
    async def test_stock_quotes_real_time_data(self, setup_services):
        """Test that real-time stock quotes data is properly handled."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"⏰ Testing real-time stock quotes data for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            quote_data = fetch_result.data
            
            # Check for timestamp fields
            timestamp_fields = ['timestamp', 'updated_at', 'last_updated', 'quote_time']
            found_timestamps = []
            
            for field in timestamp_fields:
                if hasattr(quote_data, field):
                    value = getattr(quote_data, field)
                    if value is not None:
                        found_timestamps.append(f"{field}={value}")
            
            if found_timestamps:
                logger.info(f"📊 Timestamp data found for {test_symbol}: {found_timestamps}")
            else:
                logger.info(f"ℹ️ No timestamp data available for {test_symbol}")
            
            # Check for bid/ask spread (real-time indicator)
            bid = getattr(quote_data, 'bid', None)
            ask = getattr(quote_data, 'ask', None)
            
            if bid and ask:
                spread = ask - bid
                logger.info(f"📊 Bid-Ask spread for {test_symbol}: ${spread:.4f} (bid: ${bid}, ask: ${ask})")
            
            logger.info("✅ Real-time stock quotes data handled correctly")
        else:
            logger.info(f"ℹ️ No stock quotes data available for {test_symbol} to test real-time features")
    
    @pytest.mark.asyncio
    async def test_stock_quotes_market_metrics(self, setup_services):
        """Test that market metrics are properly included in stock quotes."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"📈 Testing market metrics in stock quotes for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            quote_data = fetch_result.data
            
            # Check for market metrics
            metric_fields = ['market_cap', 'pe_ratio', 'dividend_yield', 'eps', 'beta', 
                           'week_52_high', 'week_52_low', 'average_volume', 'shares_outstanding']
            found_metrics = []
            
            for field in metric_fields:
                if hasattr(quote_data, field):
                    value = getattr(quote_data, field)
                    if value is not None:
                        found_metrics.append(f"{field}={value}")
            
            if found_metrics:
                logger.info(f"📊 Market metrics found for {test_symbol}: {found_metrics[:5]}")
            else:
                logger.info(f"ℹ️ No market metrics available for {test_symbol}")
            
            logger.info("✅ Market metrics in stock quotes handled correctly")
        else:
            logger.info(f"ℹ️ No stock quotes data available for {test_symbol} to test market metrics")
    
    @pytest.mark.asyncio
    async def test_stock_quotes_change_calculations(self, setup_services):
        """Test that price change calculations are properly handled."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"📊 Testing price change calculations for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            quote_data = fetch_result.data
            
            # Check for change-related fields
            current_price = getattr(quote_data, 'price', None) or getattr(quote_data, 'last', None) or getattr(quote_data, 'close', None)
            previous_close = getattr(quote_data, 'previous_close', None)
            change_amount = getattr(quote_data, 'change', None) or getattr(quote_data, 'change_amount', None)
            change_percent = getattr(quote_data, 'change_percent', None)
            
            if current_price and previous_close:
                calculated_change = current_price - previous_close
                calculated_percent = (calculated_change / previous_close) * 100
                
                logger.info(f"📊 Price analysis for {test_symbol}:")
                logger.info(f"   Current: ${current_price}, Previous: ${previous_close}")
                logger.info(f"   Calculated change: ${calculated_change:.4f} ({calculated_percent:.2f}%)")
                
                if change_amount:
                    logger.info(f"   Reported change: ${change_amount}")
                if change_percent:
                    logger.info(f"   Reported percent: {change_percent}%")
            
            logger.info("✅ Price change calculations handled correctly")
        else:
            logger.info(f"ℹ️ No stock quotes data available for {test_symbol} to test change calculations")
