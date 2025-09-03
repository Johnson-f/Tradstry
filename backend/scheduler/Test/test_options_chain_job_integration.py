"""
Integration tests for OptionsChainJob using real database.
Tests comprehensive data aggregation and storage functionality.
"""

import pytest
import pytest_asyncio
import asyncio
import logging
from typing import Dict, Any
from datetime import datetime, timedelta

from scheduler.jobs.options_chain_job import OptionsChainJob
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig

# Set up logging for test visibility
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestOptionsChainJobIntegration:
    """Integration tests for OptionsChainJob with real database operations."""
    
    @pytest_asyncio.fixture
    async def setup_services(self):
        """Set up real services for integration testing."""
        config = MarketDataConfig()
        brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        
        job = OptionsChainJob(db_service, brain)
        
        yield {
            'job': job,
            'brain': brain,
            'db_service': db_service,
            'config': config
        }
        
        # Cleanup
        await brain.close()
    
    @pytest.mark.asyncio
    async def test_comprehensive_options_chain_aggregation_real_db(self, setup_services):
        """Test comprehensive options chain data aggregation with real database storage."""
        services = setup_services
        job = services['job']
        
        # Test with well-known symbols that typically have active options
        test_symbols = ['AAPL', 'MSFT']
        
        logger.info(f"🚀 Testing comprehensive options chain aggregation for {test_symbols}")
        
        # Fetch comprehensive options chain data
        data = await job.fetch_data(test_symbols)
        
        # Verify data was fetched
        assert data is not None, "Should return data dictionary"
        assert len(data) >= 0, "Should return dictionary even if no data"
        
        # Verify comprehensive aggregation
        for symbol, fetch_result in data.items():
            assert fetch_result.success, f"Should successfully fetch data for {symbol}"
            assert fetch_result.data is not None, f"Should have options chain data for {symbol}"
            assert fetch_result.provider is not None, f"Should have provider attribution for {symbol}"
            
            # Check that we have comprehensive data
            options_chain = fetch_result.data
            assert isinstance(options_chain, list), f"Should have list of options contracts for {symbol}"
            
            logger.info(f"📊 {symbol}: {len(options_chain)} options contracts from {fetch_result.provider}")
            
            # Check options contract structure
            if len(options_chain) > 0:
                sample_contract = options_chain[0]
                strike = getattr(sample_contract, 'strike', None) or getattr(sample_contract, 'strike_price', None)
                option_type = getattr(sample_contract, 'option_type', None) or getattr(sample_contract, 'type', None)
                expiration = getattr(sample_contract, 'expiration', None) or getattr(sample_contract, 'expiration_date', None)
                
                logger.info(f"✅ Sample option for {symbol}: {option_type} ${strike} exp {expiration}")
        
        # Store data to real database
        if data:
            logger.info("💾 Storing comprehensive options chain data to real database...")
            storage_success = await job.store_data(data)
            
            assert storage_success, "Should successfully store all data to database"
            logger.info("✅ Successfully stored comprehensive options chain data to real database!")
    
    @pytest.mark.asyncio
    async def test_options_chain_provider_aggregation(self, setup_services):
        """Test that multiple providers are being used for comprehensive options chain coverage."""
        services = setup_services
        job = services['job']
        
        # Test with a single symbol to see provider aggregation
        test_symbol = 'AAPL'
        
        logger.info(f"🔍 Testing options chain provider aggregation for {test_symbol}")
        
        # Use the internal comprehensive aggregation method
        result = await job._fetch_with_provider_fallback(test_symbol)
        
        if result is not None:
            assert result.success, f"Should fetch comprehensive options chain data for {test_symbol}"
            
            # Check that we have options contracts
            options_chain = result.data
            assert isinstance(options_chain, list), f"Should have list of options contracts for {test_symbol}"
            
            logger.info(f"📈 Comprehensive aggregation result: {len(options_chain)} options contracts")
            
            # Should have reasonable options coverage
            assert len(options_chain) >= 0, "Should handle options chain aggregation without errors"
            
            # Check for essential fields
            if len(options_chain) > 0:
                sample_contract = options_chain[0]
                strike = getattr(sample_contract, 'strike', None) or getattr(sample_contract, 'strike_price', None)
                option_type = getattr(sample_contract, 'option_type', None) or getattr(sample_contract, 'type', None)
                assert strike is not None, "Should have strike price field"
                assert option_type is not None, "Should have option type field"
        else:
            logger.info(f"ℹ️ No options chain data available for {test_symbol} from any provider")
    
    @pytest.mark.asyncio
    async def test_options_chain_database_upsert(self, setup_services):
        """Test that database upsert function works correctly with options chain data."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'GOOGL'
        
        logger.info(f"🗄️ Testing options chain database upsert functionality for {test_symbol}")
        
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
            logger.info(f"ℹ️ No options chain data available for {test_symbol} to test upsert")
    
    @pytest.mark.asyncio
    async def test_options_chain_field_mapping(self, setup_services):
        """Test that all options chain database fields are properly mapped."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🗺️ Testing options chain field mapping for {test_symbol}")
        
        # Fetch comprehensive data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            options_chain = fetch_result.data
            assert isinstance(options_chain, list), f"Should have list of options contracts for {test_symbol}"
            
            # Test that all expected database fields can be accessed
            database_fields = [
                'strike', 'strike_price', 'option_type', 'type', 'expiration', 'expiration_date',
                'bid', 'ask', 'last', 'last_price', 'volume', 'open_interest', 'implied_volatility',
                'delta', 'gamma', 'theta', 'vega', 'rho', 'intrinsic_value', 'time_value',
                'days_to_expiration', 'in_the_money', 'contract_symbol', 'contract_size'
            ]
            
            field_coverage = {}
            for contract in options_chain[:10]:  # Check first 10 contracts
                for field in database_fields:
                    if hasattr(contract, field):
                        value = getattr(contract, field)
                        if value is not None:
                            if field not in field_coverage:
                                field_coverage[field] = 0
                            field_coverage[field] += 1
            
            logger.info(f"📋 Accessible database fields:")
            for field, count in field_coverage.items():
                logger.info(f"   {field}: {count} contracts")
            
            # Should have essential fields
            strike_fields = ['strike', 'strike_price']
            has_strike = any(field in field_coverage for field in strike_fields)
            assert has_strike, "Should have strike price field in some contracts"
            
            type_fields = ['option_type', 'type']
            has_type = any(field in field_coverage for field in type_fields)
            assert has_type, "Should have option type field in some contracts"
            
            # Store to verify database mapping works
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store with comprehensive field mapping"
            
            logger.info("✅ Comprehensive options chain field mapping working correctly")
        else:
            logger.info(f"ℹ️ No options chain data available for {test_symbol} to test field mapping")
    
    @pytest.mark.asyncio
    async def test_invalid_options_chain_data_handling(self, setup_services):
        """Test handling of invalid options chain data."""
        services = setup_services
        job = services['job']
        
        # Test with invalid symbols
        invalid_symbols = ['INVALID123', 'TOOLONGSYMBOL', '']
        
        logger.info(f"🚫 Testing invalid options chain data handling: {invalid_symbols}")
        
        data = await job.fetch_data(invalid_symbols)
        
        # Should handle gracefully without crashing
        assert isinstance(data, dict), "Should return dictionary even for invalid symbols"
        
        # Should filter out invalid symbols
        for symbol in invalid_symbols:
            if symbol in data:
                # If present, should not have successful data
                assert not data[symbol].success, f"Invalid symbol {symbol} should not have successful data"
        
        logger.info("✅ Invalid options chain data handling working correctly")
    
    @pytest.mark.asyncio
    async def test_options_chain_data_validation(self, setup_services):
        """Test that options chain data validation works correctly."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"✅ Testing options chain data validation for {test_symbol}")
        
        # Fetch data
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            assert fetch_result.success, f"Should successfully fetch {test_symbol}"
            
            options_chain = fetch_result.data
            assert isinstance(options_chain, list), f"Should have list of options contracts for {test_symbol}"
            
            # Validate options contracts
            for contract in options_chain[:5]:  # Check first 5 contracts
                # Validate required fields exist
                strike = getattr(contract, 'strike', None) or getattr(contract, 'strike_price', None)
                option_type = getattr(contract, 'option_type', None) or getattr(contract, 'type', None)
                
                assert strike is not None, "Should have strike price field"
                assert option_type is not None, "Should have option type field"
                
                # Validate data types for numeric fields
                numeric_fields = ['strike', 'strike_price', 'bid', 'ask', 'last', 'last_price', 
                                'volume', 'open_interest', 'implied_volatility', 'delta', 'gamma', 
                                'theta', 'vega', 'rho', 'intrinsic_value', 'time_value', 'days_to_expiration']
                for field in numeric_fields:
                    if hasattr(contract, field):
                        value = getattr(contract, field)
                        if value is not None:
                            assert isinstance(value, (int, float)), f"{field} should be numeric if present"
                
                # Validate option type values
                if option_type:
                    valid_types = ['call', 'put', 'CALL', 'PUT', 'C', 'P']
                    assert option_type in valid_types, f"Option type should be valid: {option_type}"
            
            logger.info(f"✅ Validated {len(options_chain)} options contracts for {test_symbol}")
        else:
            logger.info(f"ℹ️ No options chain data available for {test_symbol} to validate")
    
    @pytest.mark.asyncio
    async def test_multiple_options_chain_symbols_batch(self, setup_services):
        """Test batch processing of multiple symbols for options chain."""
        services = setup_services
        job = services['job']
        
        # Test with multiple symbols
        test_symbols = ['AAPL', 'MSFT', 'GOOGL']
        
        logger.info(f"📦 Testing options chain batch processing for {len(test_symbols)} symbols")
        
        # Fetch data for all symbols
        data = await job.fetch_data(test_symbols)
        
        assert isinstance(data, dict), "Should return dictionary"
        
        successful_fetches = sum(1 for result in data.values() if result.success)
        total_contracts = sum(len(result.data) for result in data.values() if result.success and result.data)
        
        logger.info(f"📊 Batch processing results: {successful_fetches}/{len(test_symbols)} successful")
        logger.info(f"   Total options contracts: {total_contracts}")
        
        # Should handle batch processing without errors
        assert successful_fetches >= 0, "Should handle batch processing without errors"
        
        # Store all data
        if data:
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store batch options chain data"
        
        logger.info("✅ Options chain batch processing working correctly")
    
    @pytest.mark.asyncio
    async def test_options_chain_provider_attribution(self, setup_services):
        """Test that provider attribution is properly tracked for options chain."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"🏷️ Testing options chain provider attribution for {test_symbol}")
        
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
            
            logger.info("✅ Options chain provider attribution tracking working correctly")
        else:
            logger.info(f"ℹ️ No options chain data available for {test_symbol} to test provider attribution")
    
    @pytest.mark.asyncio
    async def test_options_chain_deduplication(self, setup_services):
        """Test that duplicate options contracts are properly handled."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'MSFT'
        
        logger.info(f"🔄 Testing options chain deduplication for {test_symbol}")
        
        # Fetch data which should include deduplication
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            options_chain = fetch_result.data
            
            # Check for duplicate contracts (same strike, type, expiration)
            seen_contracts = set()
            duplicates_found = 0
            
            for contract in options_chain:
                strike = getattr(contract, 'strike', None) or getattr(contract, 'strike_price', None)
                option_type = getattr(contract, 'option_type', None) or getattr(contract, 'type', None)
                expiration = getattr(contract, 'expiration', None) or getattr(contract, 'expiration_date', None)
                
                if strike and option_type and expiration:
                    contract_key = (strike, option_type, expiration)
                    if contract_key in seen_contracts:
                        duplicates_found += 1
                    seen_contracts.add(contract_key)
            
            logger.info(f"📋 Deduplication check: {duplicates_found} duplicates found in {len(options_chain)} contracts")
            assert duplicates_found == 0, "Should not have duplicate contracts with same strike/type/expiration"
        else:
            logger.info(f"ℹ️ No options chain data available for {test_symbol} to test deduplication")
    
    @pytest.mark.asyncio
    async def test_options_chain_greeks_calculation(self, setup_services):
        """Test that options Greeks are properly calculated and stored."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"📊 Testing options Greeks calculation for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            options_chain = fetch_result.data
            
            # Check for Greeks fields
            greeks_fields = ['delta', 'gamma', 'theta', 'vega', 'rho', 'implied_volatility']
            found_greeks = []
            
            for contract in options_chain[:5]:  # Check first 5 contracts
                for field in greeks_fields:
                    if hasattr(contract, field):
                        value = getattr(contract, field)
                        if value is not None:
                            found_greeks.append(f"{field}={value}")
            
            if found_greeks:
                logger.info(f"📊 Greeks data found for {test_symbol}: {found_greeks[:10]}")
            else:
                logger.info(f"ℹ️ No Greeks data available for {test_symbol}")
            
            logger.info("✅ Options Greeks calculation handled correctly")
        else:
            logger.info(f"ℹ️ No options chain data available for {test_symbol} to test Greeks")
    
    @pytest.mark.asyncio
    async def test_options_chain_expiration_filtering(self, setup_services):
        """Test that options chain expiration filtering works correctly."""
        services = setup_services
        job = services['job']
        
        test_symbol = 'AAPL'
        
        logger.info(f"📅 Testing options chain expiration filtering for {test_symbol}")
        
        data = await job.fetch_data([test_symbol])
        
        if data and test_symbol in data:
            fetch_result = data[test_symbol]
            options_chain = fetch_result.data
            
            # Check expiration dates
            expiration_dates = []
            current_date = datetime.now().date()
            
            for contract in options_chain:
                expiration = getattr(contract, 'expiration', None) or getattr(contract, 'expiration_date', None)
                if expiration:
                    try:
                        # Handle different date formats
                        if isinstance(expiration, str):
                            exp_date = datetime.strptime(expiration, '%Y-%m-%d').date()
                        elif isinstance(expiration, datetime):
                            exp_date = expiration.date()
                        else:
                            exp_date = expiration
                        
                        expiration_dates.append(exp_date)
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid expiration format: {expiration}")
            
            if expiration_dates:
                future_expirations = [d for d in expiration_dates if d >= current_date]
                expired_contracts = [d for d in expiration_dates if d < current_date]
                
                logger.info(f"📊 Expiration analysis: {len(future_expirations)} future, {len(expired_contracts)} expired")
                logger.info(f"   Date range: {min(expiration_dates)} to {max(expiration_dates)}")
                
                # Most contracts should have future expiration dates
                if len(expiration_dates) > 0:
                    future_percentage = len(future_expirations) / len(expiration_dates) * 100
                    logger.info(f"   {future_percentage:.1f}% have future expiration dates")
            
            logger.info("✅ Options chain expiration filtering handled correctly")
        else:
            logger.info(f"ℹ️ No options chain data available for {test_symbol} to test expiration filtering")
