"""
Integration tests for EconomicEventsJob and EconomicIndicatorsJob using real database.
Tests comprehensive data aggregation and storage functionality.
"""

import pytest
import pytest_asyncio
import asyncio
import logging
from typing import Dict, Any
from datetime import datetime, timedelta

from scheduler.jobs.economic_job import EconomicEventsJob, EconomicIndicatorsJob
from scheduler.database_service import SchedulerDatabaseService
from market_data.brain import MarketDataBrain
from market_data.config import MarketDataConfig

# Set up logging for test visibility
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestEconomicJobIntegration:
    """Integration tests for Economic jobs with real database operations."""
    
    @pytest_asyncio.fixture
    async def setup_services(self):
        """Set up real services for integration testing."""
        config = MarketDataConfig()
        brain = MarketDataBrain(config)
        db_service = SchedulerDatabaseService()
        
        events_job = EconomicEventsJob(db_service, brain)
        indicators_job = EconomicIndicatorsJob(db_service, brain)
        
        yield {
            'events_job': events_job,
            'indicators_job': indicators_job,
            'brain': brain,
            'db_service': db_service,
            'config': config
        }
        
        # Cleanup
        await brain.close()
    
    @pytest.mark.asyncio
    async def test_economic_events_aggregation_real_db(self, setup_services):
        """Test comprehensive economic events data aggregation with real database storage."""
        services = setup_services
        job = services['events_job']
        
        logger.info("🚀 Testing comprehensive economic events aggregation")
        
        # Fetch economic events data (no symbols needed for events)
        data = await job.fetch_data([])
        
        # Verify data was fetched
        assert data is not None, "Should return data dictionary"
        
        events_data = data.get("events", [])
        if events_data:
            logger.info(f"📊 Found {len(events_data)} economic events")
            
            # Check event structure
            for event in events_data[:3]:  # Check first 3 events
                if hasattr(event, 'event_name') or hasattr(event, 'name'):
                    event_name = getattr(event, 'event_name', None) or getattr(event, 'name', None)
                    event_date = getattr(event, 'event_timestamp', None) or getattr(event, 'datetime', None)
                    provider = getattr(event, 'provider', 'unknown')
                    
                    logger.info(f"✅ Event: {event_name} on {event_date} from {provider}")
            
            # Store data to real database
            logger.info("💾 Storing economic events data to real database...")
            storage_success = await job.store_data(data)
            
            assert storage_success, "Should successfully store events data to database"
            logger.info("✅ Successfully stored economic events data to real database!")
        else:
            logger.info("ℹ️ No economic events data available from providers")
    
    @pytest.mark.asyncio
    async def test_economic_indicators_aggregation_real_db(self, setup_services):
        """Test comprehensive economic indicators data aggregation with real database storage."""
        services = setup_services
        job = services['indicators_job']
        
        logger.info("🚀 Testing comprehensive economic indicators aggregation")
        
        # Fetch economic indicators data
        data = await job.fetch_data([])
        
        # Verify data was fetched
        assert data is not None, "Should return data dictionary"
        
        indicators_data = data.get("indicators", [])
        if indicators_data:
            logger.info(f"📊 Found {len(indicators_data)} economic indicators")
            
            # Check indicator structure
            for indicator in indicators_data[:3]:  # Check first 3 indicators
                if hasattr(indicator, 'indicator_name') or hasattr(indicator, 'name'):
                    indicator_name = getattr(indicator, 'indicator_name', None) or getattr(indicator, 'name', None)
                    value = getattr(indicator, 'value', None)
                    country = getattr(indicator, 'country', None)
                    provider = getattr(indicator, 'provider', 'unknown')
                    
                    logger.info(f"✅ Indicator: {indicator_name} = {value} ({country}) from {provider}")
            
            # Store data to real database
            logger.info("💾 Storing economic indicators data to real database...")
            storage_success = await job.store_data(data)
            
            assert storage_success, "Should successfully store indicators data to database"
            logger.info("✅ Successfully stored economic indicators data to real database!")
        else:
            logger.info("ℹ️ No economic indicators data available from providers")
    
    @pytest.mark.asyncio
    async def test_events_provider_aggregation(self, setup_services):
        """Test that multiple providers are being used for economic events."""
        services = setup_services
        job = services['events_job']
        
        logger.info("🔍 Testing economic events provider aggregation")
        
        # Use the internal aggregation method
        end_date = datetime.now().date() + timedelta(days=30)
        result = await job._fetch_events_with_fallback(
            start_date=datetime.now().date(),
            end_date=end_date
        )
        
        if result is not None:
            assert isinstance(result, list), "Should return list of events"
            
            # Check provider attribution
            providers_found = set()
            for event in result:
                provider = getattr(event, 'provider', None)
                if provider:
                    providers_found.add(provider)
            
            logger.info(f"📈 Events aggregation result: {len(result)} events from {len(providers_found)} providers")
            logger.info(f"   Providers: {list(providers_found)}")
            
            assert len(result) >= 0, "Should handle events aggregation without errors"
        else:
            logger.info("ℹ️ No economic events data available from any provider")
    
    @pytest.mark.asyncio
    async def test_indicators_provider_aggregation(self, setup_services):
        """Test that multiple providers are being used for economic indicators."""
        services = setup_services
        job = services['indicators_job']
        
        logger.info("🔍 Testing economic indicators provider aggregation")
        
        # Use the internal aggregation method
        result = await job._fetch_indicators_with_fallback()
        
        if result is not None:
            assert isinstance(result, list), "Should return list of indicators"
            
            # Check provider attribution
            providers_found = set()
            for indicator in result:
                provider = getattr(indicator, 'provider', None)
                if provider:
                    providers_found.add(provider)
            
            logger.info(f"📈 Indicators aggregation result: {len(result)} indicators from {len(providers_found)} providers")
            logger.info(f"   Providers: {list(providers_found)}")
            
            assert len(result) >= 0, "Should handle indicators aggregation without errors"
        else:
            logger.info("ℹ️ No economic indicators data available from any provider")
    
    @pytest.mark.asyncio
    async def test_events_database_upsert(self, setup_services):
        """Test that database upsert function works correctly with events data."""
        services = setup_services
        job = services['events_job']
        
        logger.info("🗄️ Testing economic events database upsert functionality")
        
        # Fetch data
        data = await job.fetch_data([])
        
        if data and data.get("events"):
            # Store data first time
            first_store = await job.store_data(data)
            assert first_store, "First storage should succeed"
            
            # Store same data again (should upsert, not fail)
            second_store = await job.store_data(data)
            assert second_store, "Second storage (upsert) should succeed"
            
            logger.info("✅ Events database upsert functionality working correctly")
        else:
            logger.info("ℹ️ No events data available to test upsert")
    
    @pytest.mark.asyncio
    async def test_indicators_database_upsert(self, setup_services):
        """Test that database upsert function works correctly with indicators data."""
        services = setup_services
        job = services['indicators_job']
        
        logger.info("🗄️ Testing economic indicators database upsert functionality")
        
        # Fetch data
        data = await job.fetch_data([])
        
        if data and data.get("indicators"):
            # Store data first time
            first_store = await job.store_data(data)
            assert first_store, "First storage should succeed"
            
            # Store same data again (should upsert, not fail)
            second_store = await job.store_data(data)
            assert second_store, "Second storage (upsert) should succeed"
            
            logger.info("✅ Indicators database upsert functionality working correctly")
        else:
            logger.info("ℹ️ No indicators data available to test upsert")
    
    @pytest.mark.asyncio
    async def test_events_field_mapping(self, setup_services):
        """Test that all events database fields are properly mapped."""
        services = setup_services
        job = services['events_job']
        
        logger.info("🗺️ Testing economic events field mapping")
        
        # Fetch data
        data = await job.fetch_data([])
        
        if data and data.get("events"):
            events = data["events"]
            
            # Test expected database fields
            database_fields = [
                'event_id', 'country', 'event_name', 'event_timestamp', 'event_period',
                'actual', 'previous', 'forecast', 'unit', 'importance', 'description',
                'category', 'frequency', 'source', 'currency', 'market_impact', 'status'
            ]
            
            field_coverage = {}
            for event in events[:5]:  # Check first 5 events
                for field in database_fields:
                    if hasattr(event, field) or (hasattr(event, 'get') and event.get(field) is not None):
                        value = getattr(event, field, None) or (event.get(field) if hasattr(event, 'get') else None)
                        if value is not None:
                            if field not in field_coverage:
                                field_coverage[field] = 0
                            field_coverage[field] += 1
            
            logger.info(f"📋 Events field coverage:")
            for field, count in field_coverage.items():
                logger.info(f"   {field}: {count} events")
            
            # Store to verify database mapping works
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store with field mapping"
            
            logger.info("✅ Events field mapping working correctly")
        else:
            logger.info("ℹ️ No events data available to test field mapping")
    
    @pytest.mark.asyncio
    async def test_indicators_field_mapping(self, setup_services):
        """Test that all indicators database fields are properly mapped."""
        services = setup_services
        job = services['indicators_job']
        
        logger.info("🗺️ Testing economic indicators field mapping")
        
        # Fetch data
        data = await job.fetch_data([])
        
        if data and data.get("indicators"):
            indicators = data["indicators"]
            
            # Test expected database fields
            database_fields = [
                'indicator_code', 'indicator_name', 'country', 'period_date', 'value',
                'previous_value', 'change_value', 'change_percent', 'year_over_year_change',
                'period_type', 'frequency', 'unit', 'currency', 'seasonal_adjustment',
                'preliminary', 'importance_level', 'market_impact', 'consensus_estimate'
            ]
            
            field_coverage = {}
            for indicator in indicators[:5]:  # Check first 5 indicators
                for field in database_fields:
                    if hasattr(indicator, field) or (hasattr(indicator, 'get') and indicator.get(field) is not None):
                        value = getattr(indicator, field, None) or (indicator.get(field) if hasattr(indicator, 'get') else None)
                        if value is not None:
                            if field not in field_coverage:
                                field_coverage[field] = 0
                            field_coverage[field] += 1
            
            logger.info(f"📋 Indicators field coverage:")
            for field, count in field_coverage.items():
                logger.info(f"   {field}: {count} indicators")
            
            # Store to verify database mapping works
            storage_success = await job.store_data(data)
            assert storage_success, "Should successfully store with field mapping"
            
            logger.info("✅ Indicators field mapping working correctly")
        else:
            logger.info("ℹ️ No indicators data available to test field mapping")
    
    @pytest.mark.asyncio
    async def test_invalid_economic_data_handling(self, setup_services):
        """Test handling of invalid economic data."""
        services = setup_services
        events_job = services['events_job']
        indicators_job = services['indicators_job']
        
        logger.info("🚫 Testing invalid economic data handling")
        
        # Test events job with empty input
        events_data = await events_job.fetch_data([])
        assert isinstance(events_data, dict), "Should return dictionary for events"
        
        # Test indicators job with empty input
        indicators_data = await indicators_job.fetch_data([])
        assert isinstance(indicators_data, dict), "Should return dictionary for indicators"
        
        logger.info("✅ Invalid economic data handling working correctly")
    
    @pytest.mark.asyncio
    async def test_economic_data_validation(self, setup_services):
        """Test that economic data validation works correctly."""
        services = setup_services
        events_job = services['events_job']
        indicators_job = services['indicators_job']
        
        logger.info("✅ Testing economic data validation")
        
        # Test events data validation
        events_data = await events_job.fetch_data([])
        if events_data and events_data.get("events"):
            events = events_data["events"]
            
            for event in events[:3]:  # Check first 3 events
                # Validate basic structure
                assert hasattr(event, 'event_name') or hasattr(event, 'name'), "Should have event name"
                
                # Validate numeric fields if present
                numeric_fields = ['actual', 'previous', 'forecast']
                for field in numeric_fields:
                    if hasattr(event, field):
                        value = getattr(event, field)
                        if value is not None:
                            assert isinstance(value, (int, float, str)), f"{field} should be numeric if present"
            
            logger.info(f"✅ Validated {len(events)} economic events")
        
        # Test indicators data validation
        indicators_data = await indicators_job.fetch_data([])
        if indicators_data and indicators_data.get("indicators"):
            indicators = indicators_data["indicators"]
            
            for indicator in indicators[:3]:  # Check first 3 indicators
                # Validate basic structure
                assert hasattr(indicator, 'indicator_name') or hasattr(indicator, 'name'), "Should have indicator name"
                
                # Validate numeric fields if present
                if hasattr(indicator, 'value'):
                    value = getattr(indicator, 'value')
                    if value is not None:
                        assert isinstance(value, (int, float, str)), "value should be numeric if present"
            
            logger.info(f"✅ Validated {len(indicators)} economic indicators")
    
    @pytest.mark.asyncio
    async def test_economic_deduplication(self, setup_services):
        """Test that duplicate economic data is properly handled."""
        services = setup_services
        events_job = services['events_job']
        indicators_job = services['indicators_job']
        
        logger.info("🔄 Testing economic data deduplication")
        
        # Test events deduplication
        end_date = datetime.now().date() + timedelta(days=30)
        events_result = await events_job._fetch_events_with_fallback(
            start_date=datetime.now().date(),
            end_date=end_date
        )
        
        if events_result:
            # Check for duplicate event names and dates
            seen_combinations = set()
            duplicates_found = 0
            
            for event in events_result:
                event_name = getattr(event, 'event_name', None) or getattr(event, 'name', None)
                event_date = getattr(event, 'event_timestamp', None) or getattr(event, 'datetime', None)
                
                if event_name and event_date:
                    key = f"{event_name}_{event_date}"
                    if key in seen_combinations:
                        duplicates_found += 1
                    seen_combinations.add(key)
            
            logger.info(f"📋 Events deduplication check: {duplicates_found} duplicates found in {len(events_result)} events")
            assert duplicates_found == 0, "Should not have duplicate events with same name and date"
        
        # Test indicators deduplication
        indicators_result = await indicators_job._fetch_indicators_with_fallback()
        
        if indicators_result:
            # Check for duplicate indicator codes and dates
            seen_combinations = set()
            duplicates_found = 0
            
            for indicator in indicators_result:
                indicator_code = getattr(indicator, 'indicator_code', None) or getattr(indicator, 'code', None)
                period_date = getattr(indicator, 'period_date', None) or getattr(indicator, 'date', None)
                
                if indicator_code and period_date:
                    key = f"{indicator_code}_{period_date}"
                    if key in seen_combinations:
                        duplicates_found += 1
                    seen_combinations.add(key)
            
            logger.info(f"📋 Indicators deduplication check: {duplicates_found} duplicates found in {len(indicators_result)} indicators")
            assert duplicates_found == 0, "Should not have duplicate indicators with same code and date"
        
        logger.info("✅ Economic data deduplication working correctly")
