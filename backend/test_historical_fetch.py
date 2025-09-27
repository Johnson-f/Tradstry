#!/usr/bin/env python3
"""
Test script to demonstrate historical data fetching from finance-query API
"""

import asyncio
from services.market_data.cache_service import CacheService


async def main():
    """Test the historical data fetching functionality."""
    
    # Initialize the cache service
    cache_service = CacheService()
    
    print("🚀 Starting efficient historical data fetch test...")
    print("=" * 60)
    
    try:
        # Test 1: Fetch data for specific user-requested symbols (most common use case)
        print("\n📊 Test 1: Fetching data for specific symbols requested by user")
        print("-" * 60)
        
        requested_symbols = ["AAPL", "GOOGL", "MSFT", "TSLA", "NVDA"]  # User requested symbols
        result = await cache_service.fetch_historical_data_for_symbols(
            symbols=requested_symbols,
            range_param="1d",      # 1 day of data
            interval="5m",         # 5-minute intervals
            access_token=None
        )
        
        # Display results
        print(f"✅ Success: {result['success']}")
        print(f"📝 Message: {result['message']}")
        print(f"🎯 Requested Symbols: {result['requested_symbols']}")
        print(f"🎯 Total Symbols: {result['total_symbols']}")
        print(f"✅ Processed Successfully: {result['processed_symbols']}")
        print(f"❌ Failed Symbols: {result['failed_symbols']}")
        print(f"📈 Total Data Points Fetched: {result['fetched_data_points']}")
        print(f"📅 Range: {result['range']}")
        print(f"⏰ Interval: {result['interval']}")
        
        if result['failed_symbol_list']:
            print(f"\n❌ Failed Symbols:")
            for symbol in result['failed_symbol_list']:
                print(f"   - {symbol}")
        
        # Show first few successful symbols with data count
        print(f"\n✅ Successfully Fetched Data:")
        for symbol, data in result['data'].items():
            if 'error' not in data:
                print(f"   - {symbol}: {data.get('data_points_fetched', 0)} data points")
        
        print("\n" + "=" * 60)
        
        # Test 2: Fetch data for a single symbol (simplest use case)
        print("\n📊 Test 2: Fetching data for a single symbol")
        print("-" * 60)
        
        single_symbol = "AAPL"
        single_result = await cache_service.fetch_single_symbol_data(
            symbol=single_symbol,
            range_param="1d",
            interval="5m",
            access_token=None
        )
        
        if single_result:
            print(f"✅ Successfully fetched data for {single_symbol}")
            print(f"📈 Data Points: {single_result.get('data_points_fetched', 0)}")
            print(f"📅 Period Type: {single_result.get('period_type', 'N/A')}")
            print(f"🏢 Data Provider: {single_result.get('data_provider', 'N/A')}")
            
            if single_result.get('raw_data'):
                raw_data = single_result['raw_data']
                print(f"📊 Raw Data Points Count: {raw_data.data_points_count}")
                print(f"🕐 Latest Timestamp: {raw_data.latest_timestamp}")
        else:
            print(f"❌ Failed to fetch data for {single_symbol}")
        
        print("\n" + "=" * 60)
        
        # Test 3: Test getting summary for a specific symbol
        print("\n📊 Test 3: Getting historical data summary")
        print("-" * 60)
        
        summary = await cache_service.get_symbol_historical_summary(
            symbol=single_symbol,
            period_type="5m",
            access_token=None
        )
        
        if summary:
            print(f"📊 Summary for {summary['symbol']}:")
            print(f"   - Period Type: {summary['period_type']}")
            print(f"   - Total Data Points: {summary['total_data_points']}")
            print(f"   - Date Range (days): {summary['date_range_days']}")
            print(f"   - Earliest Timestamp: {summary['earliest_timestamp']}")
            print(f"   - Latest Timestamp: {summary['latest_timestamp']}")
            print(f"   - Data Provider: {summary['data_provider']}")
        else:
            print(f"❌ No summary data found for {single_symbol}")
        
        print("\n🎉 All tests completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    print("🔧 Efficient Historical Data Fetcher Test Script")
    print("=" * 60)
    print("This script tests the demand-driven historical data fetching functionality")
    print("that only fetches data for symbols requested by users from the frontend.")
    print("Data source: https://finance-query.onrender.com/v1/historical")
    print("=" * 60)
    
    # Run the async main function
    asyncio.run(main())
