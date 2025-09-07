#!/usr/bin/env python3
"""
Simple test script for the yfinance service functionality.
This tests the core data fetching without database dependencies.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from market_data.yfinance_service import YFinanceService
    print("✅ Successfully imported YFinanceService")
except ImportError as e:
    print(f"❌ Failed to import YFinanceService: {e}")
    sys.exit(1)

def test_yfinance_service():
    """Test the yfinance service functionality"""
    
    print("\n🧪 Testing YFinance Service")
    print("=" * 50)
    
    service = YFinanceService()
    test_symbol = "AAPL"
    
    # Test 1: Symbol validation
    print(f"\n1. Testing symbol validation for {test_symbol}...")
    try:
        is_valid = service.validate_symbol(test_symbol)
        print(f"   Result: {'✅ Valid' if is_valid else '❌ Invalid'}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test 2: Fetch earnings data
    print(f"\n2. Testing earnings data fetch for {test_symbol}...")
    try:
        earnings_data = service.fetch_earnings_data(test_symbol)
        if earnings_data:
            print(f"   ✅ Success: Fetched {len(earnings_data)} earnings records")
            
            # Show sample data
            if len(earnings_data) > 0:
                sample = earnings_data[0]
                print(f"   📊 Sample record:")
                print(f"      Symbol: {sample.symbol}")
                print(f"      Fiscal Year: {sample.fiscal_year}")
                print(f"      Fiscal Quarter: {sample.fiscal_quarter}")
                print(f"      Revenue: {sample.revenue}")
                print(f"      Net Income: {sample.net_income}")
        else:
            print("   ⚠️  No earnings data found")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test 3: Fetch fundamental data
    print(f"\n3. Testing fundamental data fetch for {test_symbol}...")
    try:
        fundamental_data = service.fetch_fundamental_data(test_symbol)
        if fundamental_data:
            print(f"   ✅ Success: Fetched fundamental data")
            print(f"   📊 Sample metrics:")
            print(f"      Symbol: {fundamental_data.symbol}")
            print(f"      Sector: {fundamental_data.sector}")
            print(f"      PE Ratio: {fundamental_data.pe_ratio}")
            print(f"      Market Cap: {fundamental_data.market_cap}")
            print(f"      Beta: {fundamental_data.beta}")
        else:
            print("   ⚠️  No fundamental data found")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test 4: Test multiple symbols
    print(f"\n4. Testing multiple symbols...")
    test_symbols = ["MSFT", "GOOGL", "INVALID_SYMBOL"]
    
    for symbol in test_symbols:
        try:
            is_valid = service.validate_symbol(symbol)
            print(f"   {symbol}: {'✅ Valid' if is_valid else '❌ Invalid'}")
        except Exception as e:
            print(f"   {symbol}: ❌ Error - {e}")

if __name__ == "__main__":
    test_yfinance_service()
    print(f"\n🎉 Test completed!")
    print("\nNext steps:")
    print("1. Resolve pip dependency conflicts in requirements.txt")
    print("2. Set up database connection")
    print("3. Test full FastAPI integration")
    print("4. Use the API endpoints to sync data")
