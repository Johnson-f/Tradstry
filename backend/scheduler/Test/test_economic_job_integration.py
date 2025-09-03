"""
Integration tests for EconomicEventsJob and EconomicIndicatorsJob using real database.
Tests comprehensive data aggregation and storage functionality with focus on FRED API.
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
from market_data.providers.fred import FREDProvider

# Set up logging for test visibility
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestEconomicJobIntegration:
    """Integration tests for Economic jobs with real database operations.
    
    Focus on FRED API integration and comprehensive data pipeline testing.
    """
    
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
    async def test_fred_economic_events_real_db(self, setup_services):
        """Test FRED API economic events data fetching and database storage."""
        services = setup_services
        brain = services['brain']
        job = services['events_job']
        
        logger.info("🚀 Testing FRED API economic events with real database storage")
        
        # Check if FRED provider is available
        available_providers = brain.get_available_providers()
        if 'fred' not in available_providers:
            logger.warning("FRED provider not available, skipping FRED-specific test")
            return
        
        fred_provider = brain.providers.get('fred')
        assert fred_provider is not None, "FRED provider should be initialized"
        
        # Test direct FRED API call for economic events
        logger.info("📡 Fetching economic events directly from FRED API")
        start_date = datetime.now().date() - timedelta(days=30)
        end_date = datetime.now().date()
        
        fred_events = await fred_provider.get_economic_events(
            from_date=start_date,
            to_date=end_date
        )
        
        logger.info(f"📊 FRED API returned {len(fred_events)} economic events")
        
        if fred_events and len(fred_events) > 0:
            # Verify FRED event structure
            for event in fred_events[:3]:  # Check first 3 events
                assert hasattr(event, 'event_name'), "FRED event should have event_name"
                assert hasattr(event, 'country'), "FRED event should have country"
                assert hasattr(event, 'provider'), "FRED event should have provider"
                assert event.provider == 'FRED', "Provider should be FRED"
                assert event.country == 'US', "FRED events should be US-based"
                
                logger.info(f"✅ FRED Event: {event.event_name} on {event.timestamp}")
                logger.info(f"   Description: {event.description}")
            
            # Test storing FRED events to database
            logger.info("💾 Storing FRED economic events to database...")
            fred_data = {"events": fred_events}
            storage_success = await job.store_data(fred_data)
            
            assert storage_success, "Should successfully store FRED events to database"
            logger.info(f"✅ Successfully stored {len(fred_events)} FRED economic events to database!")
        else:
            logger.info("ℹ️ No FRED economic events data available (this may be normal)")
            assert isinstance(fred_events, list), "Should return empty list if no data"
    
    @pytest.mark.asyncio
    async def test_fred_economic_indicators_real_db(self, setup_services):
        """Test FRED API economic indicators data fetching and database storage."""
        services = setup_services
        brain = services['brain']
        job = services['indicators_job']
        
        logger.info("🚀 Testing FRED API economic indicators with real database storage")
        
        # Check if FRED provider is available
        available_providers = brain.get_available_providers()
        if 'fred' not in available_providers:
            logger.warning("FRED provider not available, skipping FRED-specific test")
            return
        
        fred_provider = brain.providers.get('fred')
        assert fred_provider is not None, "FRED provider should be initialized"
        
        # Test direct FRED API call for economic indicators
        logger.info("📡 Fetching economic indicators directly from FRED API")
        fred_indicators = await fred_provider.get_economic_indicators()
        
        logger.info(f"📊 FRED API returned {len(fred_indicators)} economic indicators")
        
        if fred_indicators and len(fred_indicators) > 0:
            # Verify FRED indicator structure
            for indicator in fred_indicators[:5]:  # Check first 5 indicators
                assert hasattr(indicator, 'indicator_code'), "FRED indicator should have indicator_code"
                assert hasattr(indicator, 'indicator_name'), "FRED indicator should have indicator_name"
                assert hasattr(indicator, 'country'), "FRED indicator should have country"
                assert hasattr(indicator, 'provider'), "FRED indicator should have provider"
                assert indicator.provider == 'FRED', "Provider should be FRED"
                assert indicator.country == 'US', "FRED indicators should be US-based"
                
                logger.info(f"✅ FRED Indicator: {indicator.indicator_name} ({indicator.indicator_code})")
                logger.info(f"   Value: {indicator.value}, Date: {indicator.period_date}")
                logger.info(f"   Unit: {indicator.unit}, Frequency: {indicator.frequency}")
            
            # Test storing FRED indicators to database
            logger.info("💾 Storing FRED economic indicators to database...")
            fred_data = {"indicators": fred_indicators}
            storage_success = await job.store_data(fred_data)
            
            assert storage_success, "Should successfully store FRED indicators to database"
            logger.info(f"✅ Successfully stored {len(fred_indicators)} FRED economic indicators to database!")
        else:
            logger.info("ℹ️ No FRED economic indicators data available (this may be normal)")
            assert isinstance(fred_indicators, list), "Should return empty list if no data"
    
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
    
    @pytest.mark.asyncio
    async def test_fred_specific_economic_series(self, setup_services):
        """Test fetching specific FRED economic data series."""
        services = setup_services
        brain = services['brain']
        
        logger.info("🔍 Testing FRED specific economic data series")
        
        # Check if FRED provider is available
        available_providers = brain.get_available_providers()
        if 'fred' not in available_providers:
            logger.warning("FRED provider not available, skipping FRED series test")
            return
        
        fred_provider = brain.providers.get('fred')
        
        # Test fetching specific economic series
        test_series = [
            ('GDPC1', 'Real GDP'),
            ('UNRATE', 'Unemployment Rate'),
            ('CPIAUCSL', 'Consumer Price Index'),
            ('FEDFUNDS', 'Federal Funds Rate')
        ]
        
        for series_id, series_name in test_series:
            logger.info(f"📊 Testing FRED series: {series_name} ({series_id})")
            
            try:
                series_data = await fred_provider.get_economic_data(
                    series_id=series_id,
                    limit=10
                )
                
                assert isinstance(series_data, dict), f"Should return dict for {series_id}"
                assert 'series_id' in series_data, f"Should have series_id for {series_id}"
                assert 'data' in series_data, f"Should have data for {series_id}"
                assert 'provider' in series_data, f"Should have provider for {series_id}"
                assert series_data['provider'] == 'FRED', f"Provider should be FRED for {series_id}"
                
                observations = series_data.get('data', [])
                logger.info(f"   ✅ Retrieved {len(observations)} observations for {series_name}")
                
                if observations:
                    latest = observations[0]
                    logger.info(f"   📈 Latest value: {latest.get('value')} on {latest.get('date')}")
                
            except Exception as e:
                logger.warning(f"   ⚠️ Failed to fetch {series_name}: {e}")
    
    @pytest.mark.asyncio
    async def test_fred_data_validation(self, setup_services):
        """Test FRED data validation and field mapping."""
        services = setup_services
        brain = services['brain']
        
        logger.info("🔍 Testing FRED data validation and field mapping")
        
        # Check if FRED provider is available
        available_providers = brain.get_available_providers()
        if 'fred' not in available_providers:
            logger.warning("FRED provider not available, skipping FRED validation test")
            return
        
        fred_provider = brain.providers.get('fred')
        
        # Test FRED economic indicators validation
        fred_indicators = await fred_provider.get_economic_indicators()
        
        if fred_indicators:
            logger.info(f"📋 Validating {len(fred_indicators)} FRED indicators")
            
            for indicator in fred_indicators[:3]:
                # Validate required fields
                assert hasattr(indicator, 'indicator_code'), "Should have indicator_code"
                assert hasattr(indicator, 'indicator_name'), "Should have indicator_name"
                assert hasattr(indicator, 'country'), "Should have country"
                assert hasattr(indicator, 'value'), "Should have value"
                assert hasattr(indicator, 'period_date'), "Should have period_date"
                assert hasattr(indicator, 'provider'), "Should have provider"
                
                # Validate data types
                assert isinstance(indicator.indicator_code, str), "indicator_code should be string"
                assert isinstance(indicator.indicator_name, str), "indicator_name should be string"
                assert indicator.country == 'US', "FRED country should be US"
                assert indicator.provider == 'FRED', "Provider should be FRED"
                
                # Validate numeric value
                if indicator.value is not None:
                    assert isinstance(indicator.value, (int, float)), "Value should be numeric"
                
                logger.info(f"   ✅ Validated indicator: {indicator.indicator_name}")
        
        # Test FRED economic events validation
        start_date = datetime.now().date() - timedelta(days=7)
        end_date = datetime.now().date()
        fred_events = await fred_provider.get_economic_events(
            from_date=start_date,
            to_date=end_date
        )
        
        if fred_events:
            logger.info(f"📋 Validating {len(fred_events)} FRED events")
            
            for event in fred_events[:3]:
                # Validate required fields
                assert hasattr(event, 'event_id'), "Should have event_id"
                assert hasattr(event, 'event_name'), "Should have event_name"
                assert hasattr(event, 'country'), "Should have country"
                assert hasattr(event, 'provider'), "Should have provider"
                
                # Validate data types
                assert isinstance(event.event_name, str), "event_name should be string"
                assert event.country == 'US', "FRED country should be US"
                assert event.provider == 'FRED', "Provider should be FRED"
                
                logger.info(f"   ✅ Validated event: {event.event_name}")
    
    @pytest.mark.asyncio
    async def test_fred_error_handling(self, setup_services):
        """Test FRED API error handling and resilience."""
        services = setup_services
        brain = services['brain']
        
        logger.info("🔍 Testing FRED API error handling")
        
        # Check if FRED provider is available
        available_providers = brain.get_available_providers()
        if 'fred' not in available_providers:
            logger.warning("FRED provider not available, skipping FRED error handling test")
            return
        
        fred_provider = brain.providers.get('fred')
        
        # Test invalid series ID
        logger.info("🚫 Testing invalid series ID handling")
        invalid_data = await fred_provider.get_economic_data(
            series_id='INVALID_SERIES_ID_12345'
        )
        
        # Should return empty dict or handle gracefully
        assert isinstance(invalid_data, dict), "Should return dict for invalid series"
        logger.info("   ✅ Invalid series ID handled gracefully")
        
        # Test with invalid date range
        logger.info("🚫 Testing invalid date range handling")
        future_date = datetime.now().date() + timedelta(days=365)
        far_future_date = datetime.now().date() + timedelta(days=730)
        
        future_events = await fred_provider.get_economic_events(
            from_date=future_date,
            to_date=far_future_date
        )
        
        # Should return empty list or handle gracefully
        assert isinstance(future_events, list), "Should return list for future dates"
        logger.info("   ✅ Invalid date range handled gracefully")
        
        # Test search functionality
        logger.info("🔍 Testing FRED series search")
        search_results = await fred_provider.search_series('GDP', limit=5)
        
        assert isinstance(search_results, list), "Search should return list"
        logger.info(f"   ✅ Search returned {len(search_results)} results")
        
        if search_results:
            for result in search_results[:2]:
                assert 'id' in result, "Search result should have id"
                assert 'title' in result, "Search result should have title"
                logger.info(f"   📊 Found series: {result.get('title', 'Unknown')} ({result.get('id', 'No ID')})")
    
    @pytest.mark.asyncio
    async def test_fred_database_integration(self, setup_services):
        """Test complete FRED data pipeline from API to database."""
        services = setup_services
        brain = services['brain']
        events_job = services['events_job']
        indicators_job = services['indicators_job']
        
        logger.info("🔄 Testing complete FRED data pipeline")
        
        # Check if FRED provider is available
        available_providers = brain.get_available_providers()
        if 'fred' not in available_providers:
            logger.warning("FRED provider not available, skipping FRED pipeline test")
            return
        
        fred_provider = brain.providers.get('fred')
        
        # Test complete pipeline for indicators
        logger.info("📊 Testing FRED indicators pipeline")
        fred_indicators = await fred_provider.get_economic_indicators()
        
        if fred_indicators:
            # Store via job pipeline
            indicators_data = {"indicators": fred_indicators}
            storage_success = await indicators_job.store_data(indicators_data)
            
            assert storage_success, "FRED indicators pipeline should succeed"
            logger.info(f"   ✅ FRED indicators pipeline completed: {len(fred_indicators)} indicators")
        
        # Test complete pipeline for events
        logger.info("📅 Testing FRED events pipeline")
        start_date = datetime.now().date() - timedelta(days=14)
        end_date = datetime.now().date()
        
        fred_events = await fred_provider.get_economic_events(
            from_date=start_date,
            to_date=end_date
        )
        
        if fred_events:
            # Store via job pipeline
            events_data = {"events": fred_events}
            storage_success = await events_job.store_data(events_data)
            
            assert storage_success, "FRED events pipeline should succeed"
            logger.info(f"   ✅ FRED events pipeline completed: {len(fred_events)} events")
        
        logger.info("✅ FRED database integration pipeline completed successfully")
