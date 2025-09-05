"""
Test script for fetching fundamental data from 2020-2025 for all stocks in CSV files.
Fetches comprehensive fundamental data using MarketDataBrain with provider fallback.
"""

import asyncio
import csv
import logging
import sys
from datetime import datetime
from typing import Dict, List, Any
from pathlib import Path

# Add the parent directory to the path to import modules
sys.path.append(str(Path(__file__).parent.parent))

from market_data.brain import MarketDataBrain
from scheduler.new_architecture.jobs.db_services.fundamental_data_db import FundamentalDataDB

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger(__name__)


def load_symbols_from_csv(csv_file_path: Path) -> List[str]:
    """Load stock symbols from CSV file."""
    symbols = []
    seen_symbols = set()  # Track symbols to prevent duplicates within the same file
    
    try:
        with open(csv_file_path, 'r', encoding='utf-8') as file:
            csv_reader = csv.reader(file)
            for row in csv_reader:
                # Skip empty rows, comments, and headers
                if (not row or 
                    row[0].startswith('#') or 
                    row[0].lower() in ['symbol', 'dow jones stocks', 'dow jones stocks '] or
                    any('dow jones' in cell.lower() for cell in row if cell)):
                    continue
                
                # Extract symbol - handle different CSV formats
                symbol = None
                if len(row) >= 2:
                    # Format: "Company Name,SYMBOL" (Dow 30)
                    symbol = row[1].strip().upper()  # Normalize to uppercase
                elif len(row) == 1:
                    # Format: "SYMBOL" only
                    symbol = row[0].strip().upper()  # Normalize to uppercase
                
                # For S&P 500 CSV which has "Symbol,Company" format
                if csv_file_path.name.startswith('sp500') and len(row) >= 2:
                    symbol = row[0].strip().upper()  # First column is symbol for S&P 500, normalize to uppercase
                
                # Only add valid, unique symbols
                if (symbol and 
                    symbol not in ['SYMBOL', 'COMPANY'] and 
                    symbol not in seen_symbols and
                    len(symbol) <= 10 and  # Basic validation - stock symbols shouldn't be too long
                    symbol.replace('.', '').replace('-', '').isalnum()):  # Allow dots and hyphens in symbols
                    
                    symbols.append(symbol)
                    seen_symbols.add(symbol)
    
    except Exception as e:
        logger.error(f"Error reading CSV file {csv_file_path}: {e}")
    
    return symbols


def parse_csv_symbols() -> List[str]:
    """Parse all CSV files and return unique symbols."""
    script_dir = Path(__file__).parent
    csv_files = list(script_dir.glob("*.csv"))
    
    if not csv_files:
        logger.warning("No CSV files found in the scripts directory")
        return []
    
    logger.info(f"Found {len(csv_files)} CSV files: {[f.name for f in csv_files]}")
    
    all_symbols = []
    unique_symbols = []
    seen = set()
    
    for csv_file in csv_files:
        logger.info(f"📄 Processing {csv_file.name}...")
        symbols = load_symbols_from_csv(csv_file)
        all_symbols.extend(symbols)
        logger.info(f"   Found {len(symbols)} symbols in {csv_file.name}")
    
    # Remove duplicates while preserving order
    for symbol in all_symbols:
        if symbol not in seen:
            unique_symbols.append(symbol)
            seen.add(symbol)
    
    logger.info(f"Total unique symbols: {len(unique_symbols)}")
    return unique_symbols


def load_symbols_from_csv(csv_file_path: Path) -> List[str]:
    """Load stock symbols from CSV file."""
    symbols = []
    seen_symbols = set()  # Track symbols to prevent duplicates within the same file
    
    try:
        with open(csv_file_path, 'r', encoding='utf-8') as file:
            csv_reader = csv.reader(file)
            for row in csv_reader:
                # Skip empty rows, comments, and headers
                if (not row or 
                    row[0].startswith('#') or 
                    row[0].lower() in ['symbol', 'dow jones stocks', 'dow jones stocks '] or
                    any('dow jones' in cell.lower() for cell in row if cell)):
                    continue
                
                # Extract symbol - handle different CSV formats
                symbol = None
                if len(row) >= 2:
                    # Format: "Company Name,SYMBOL" (Dow 30)
                    symbol = row[1].strip().upper()  # Normalize to uppercase
                elif len(row) == 1:
                    # Format: "SYMBOL" only
                    symbol = row[0].strip().upper()  # Normalize to uppercase
                
                # For S&P 500 CSV which has "Symbol,Company" format
                if csv_file_path.name.startswith('sp500') and len(row) >= 2:
                    symbol = row[0].strip().upper()  # First column is symbol for S&P 500, normalize to uppercase
                
                # Only add valid, unique symbols
                if (symbol and 
                    symbol not in ['SYMBOL', 'COMPANY'] and 
                    symbol not in seen_symbols and
                    len(symbol) <= 10 and  # Basic validation - stock symbols shouldn't be too long
                    symbol.replace('.', '').replace('-', '').isalnum()):  # Allow dots and hyphens in symbols
                    
                    symbols.append(symbol)
                    seen_symbols.add(symbol)
    
    except Exception as e:
        logger.error(f"Error reading CSV file {csv_file_path}: {e}")
    
    return symbols


def generate_year_quarter_combinations() -> List[tuple]:
    """Generate all year-quarter combinations from 2020 to 2025."""
    combinations = []
    current_year = datetime.now().year
    current_quarter = (datetime.now().month - 1) // 3 + 1
    
    for year in range(2020, 2026):  # 2020 to 2025
        for quarter in range(1, 5):  # Q1, Q2, Q3, Q4
            # Don't fetch future quarters
            if year == current_year and quarter > current_quarter:
                break
            if year > current_year:
                break
            combinations.append((year, quarter))
    
    logger.info(f"Generated {len(combinations)} year-quarter combinations from 2020 to current")
    return combinations


# Global provider blacklist to prevent retrying failed providers
PROVIDER_BLACKLIST = set()

async def fetch_fundamental_data_from_all_providers(brain: MarketDataBrain, symbol: str) -> Dict[str, Any]:
    """Fetch fundamental data from ALL available providers and combine for maximum coverage."""
    try:
        # List of providers that support fundamentals
        fundamental_providers = [
            'finnhub', 'polygon', 'twelve_data', 
            'alpha_vantage', 'tiingo', 'fiscal'
        ]
        
        combined_data = {}
        successful_providers = []
        
        logger.info(f"📊 Fetching fundamental data for {symbol} from ALL providers...")
        
        # Fetch from each provider individually
        for provider_name in fundamental_providers:
            try:
                if provider_name not in brain.providers:
                    continue
                
                # Skip providers in global blacklist
                if provider_name in PROVIDER_BLACKLIST:
                    logger.info(f"🚫 Skipping blacklisted provider: {provider_name}")
                    continue
                    
                if brain._is_provider_rate_limited(provider_name):
                    logger.info(f"⏳ Skipping rate-limited provider: {provider_name}")
                    continue
                
                provider = brain.providers[provider_name]
                logger.info(f"🔍 Trying provider: {provider_name}")
                
                # Call get_fundamentals directly on the provider
                provider_data = await provider.get_fundamentals(symbol)
                
                if provider_data and isinstance(provider_data, dict):
                    logger.info(f"✅ Got data from {provider_name}: {len(provider_data)} fields")
                    
                    # Merge data, giving priority to non-null values
                    for key, value in provider_data.items():
                        if value is not None and value != '' and str(value).lower() != 'n/a':
                            if key not in combined_data or combined_data[key] is None:
                                combined_data[key] = value
                            elif isinstance(value, (int, float)) and value != 0:
                                # Prefer non-zero numeric values
                                combined_data[key] = value
                    
                    successful_providers.append(provider_name)
                else:
                    logger.warning(f"⚠️ No data from {provider_name}")
                    
            except Exception as e:
                error_str = str(e).lower()
                logger.warning(f"❌ Error with provider {provider_name}: {e}")
                
                # Check for subscription/access errors and blacklist provider globally
                if any(keyword in error_str for keyword in [
                    "subscription", "upgrade", "pro plan", "premium", 
                    "legacy endpoint", "not supported", "pricing", "contact us"
                ]):
                    PROVIDER_BLACKLIST.add(provider_name)
                    brain._mark_provider_rate_limited(provider_name)
                    logger.info(f"🚫 Blacklisting {provider_name} globally due to subscription requirements")
                    continue
                
                # Mark provider as rate limited for rate limit errors
                if any(keyword in error_str for keyword in ["429", "rate limit", "403"]):
                    brain._mark_provider_rate_limited(provider_name)
                    logger.info(f"⏳ Marking {provider_name} as rate-limited temporarily")
                continue
        
        if combined_data:
            combined_data['data_providers'] = ','.join(successful_providers)
            logger.info(f"🎯 Combined data from {len(successful_providers)} providers: {successful_providers}")
            logger.info(f"📈 Total fields collected: {len(combined_data)}")
        else:
            logger.warning(f"⚠️ No fundamental data available for {symbol} from any provider")
        
        return combined_data
        
    except Exception as e:
        logger.error(f"💥 Error fetching multi-provider fundamental data for {symbol}: {e}")
        return {}


async def fetch_fundamental_data_for_symbol(brain: MarketDataBrain, symbol: str, quarters: List[tuple]) -> List[Dict]:
    """Fetch fundamental data for a symbol across multiple quarters using ALL providers."""
    try:
        logger.info(f"📊 Fetching comprehensive fundamental data for {symbol}...")
        
        # Fetch fundamental data from all available providers
        combined_data = await fetch_fundamental_data_from_all_providers(brain, symbol)
        
        if not combined_data:
            logger.warning(f"⚠️ No fundamental data available for {symbol}")
            return []
        
        # Create records for each quarter using the combined fundamental data
        records = []
        for year, quarter in quarters:
            record = {
                'symbol': symbol,
                'fiscal_year': year,
                'fiscal_quarter': quarter,
                **combined_data  # Spread the combined fundamental data
            }
            records.append(record)
        
        provider_count = len(combined_data.get('data_providers', '').split(',')) if combined_data.get('data_providers') else 0
        logger.info(f"✅ Got comprehensive fundamental data for {symbol} from {provider_count} providers - created {len(records)} quarterly records")
        return records
        
    except Exception as e:
        logger.error(f"💥 Error fetching fundamental data for {symbol}: {e}")
        return []


async def fetch_fundamental_data_batch(symbols: List[str], year_quarters: List[tuple], batch_size: int = 10) -> Dict[str, Any]:
    """
    Fetch fundamental data in batches for multiple years and quarters.
    
    Args:
        symbols: List of stock symbols to fetch
        year_quarters: List of (year, quarter) tuples
        batch_size: Number of symbols to process per batch
        
    Returns:
        Dictionary mapping symbols to fundamental data
    """
    try:
        # Initialize components
        market_data_brain = MarketDataBrain()
        
        logger.info(f"🔄 Starting fundamental data fetch for {len(symbols)} symbols")
        logger.info(f"📅 Fetching data for {len(year_quarters)} year-quarter combinations")
        logger.info(f"📦 Processing in batches of {batch_size}")
        
        all_fundamentals = {}
        already_fetched = set()  # Track symbol-year-quarter combinations already fetched
        
        # Process symbols in batches
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (len(symbols) + batch_size - 1) // batch_size
            
            logger.info(f"📊 Processing batch {batch_num}/{total_batches}: {len(batch)} symbols")
            logger.info(f"🎯 Symbols: {', '.join(batch[:3])}{'...' if len(batch) > 3 else ''}")
            
            try:
                # For each symbol in the batch, fetch fundamental data once
                for symbol in batch:
                    fetch_key = f"{symbol}_fundamentals"
                    
                    # Skip if already fetched
                    if fetch_key in already_fetched:
                        continue
                    
                    try:
                        # Fetch fundamental data for the symbol across all quarters
                        symbol_data = await fetch_fundamental_data_for_symbol(market_data_brain, symbol, year_quarters)
                        
                        if symbol_data:
                            all_fundamentals[symbol] = symbol_data
                            already_fetched.add(fetch_key)
                            logger.info(f"✅ Got fundamental data for {symbol} - created {len(symbol_data)} quarterly records")
                        else:
                            logger.debug(f"⚠️ No fundamental data for {symbol}")
                            
                    except Exception as e:
                        logger.warning(f"❌ Error fetching {symbol}: {e}")
                        continue
                
                logger.info(f"✅ Batch {batch_num} completed")
                
                # Delay between batches to avoid overwhelming providers
                if i + batch_size < len(symbols):
                    await asyncio.sleep(2)  # Longer delay for fundamental data
                    
            except Exception as e:
                logger.error(f"❌ Error processing batch {batch_num}: {e}")
                continue
        
        total_records = sum(len(records) for records in all_fundamentals.values())
        logger.info(f"🎉 Fundamental data fetch completed: {total_records} total records for {len(all_fundamentals)} symbols")
        return all_fundamentals
        
    except Exception as e:
        logger.error(f"💥 Error in fundamental data fetch: {e}")
        return {}


def convert_decimal_to_float(obj):
    """Convert Decimal objects to appropriate numeric types for database storage."""
    from decimal import Decimal
    
    # Fields that should be integers (BIGINT in database)
    BIGINT_FIELDS = {
        'market_cap', 'enterprise_value', 'shares_outstanding',
        'fiscal_year', 'fiscal_quarter'
    }
    
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        converted = {}
        for key, value in obj.items():
            if key in BIGINT_FIELDS and value is not None:
                # Convert to int for BIGINT fields
                try:
                    if isinstance(value, (str, float, Decimal)):
                        converted[key] = int(float(str(value)))
                    else:
                        converted[key] = int(value)
                except (ValueError, TypeError):
                    converted[key] = None
            else:
                converted[key] = convert_decimal_to_float(value)
        return converted
    elif isinstance(obj, list):
        return [convert_decimal_to_float(item) for item in obj]
    else:
        return obj


async def store_fundamentals_in_database(fundamentals_data: Dict[str, List[Dict]]) -> bool:
    """Store fundamental data in database."""
    try:
        fundamental_db = FundamentalDataDB()
        
        # Flatten the data structure for database storage
        all_records = []
        for symbol, records in fundamentals_data.items():
            all_records.extend(records)
        
        if not all_records:
            logger.warning("No fundamental data to store")
            return False
        
        # Convert Decimal objects to float to avoid JSON serialization errors
        logger.info(f"💾 Converting and storing {len(all_records)} fundamental data records in database...")
        converted_records = convert_decimal_to_float(all_records)
        
        # Store in database using the updated upsert function
        success = await fundamental_db.upsert_fundamental_data(converted_records)
        
        if success:
            logger.info("✅ All fundamental data stored successfully in database")
        else:
            logger.error("❌ Failed to store fundamental data in database")
        
        return success
        
    except Exception as e:
        logger.error(f"💥 Error storing fundamental data: {e}")
        return False


async def run_full_test():
    """Run comprehensive fundamental data test."""
    try:
        logger.info("🚀 Starting comprehensive fundamental data test")
        logger.info("=" * 60)
        
        # Get all symbols from CSV files
        symbols = get_all_symbols()
        
        if not symbols:
            logger.error("❌ No symbols found in CSV files")
            return False
        
        # Generate year-quarter combinations
        year_quarters = generate_year_quarter_combinations()
        
        logger.info(f"📋 Will fetch fundamental data for {len(symbols)} symbols")
        logger.info(f"📅 Across {len(year_quarters)} year-quarter periods")
        
        # Ask user for batch size preference
        print(f"\n📊 Found {len(symbols)} symbols to fetch fundamental data for")
        print("Choose batch size:")
        print("1. Small batches (5 symbols) - Slower but more reliable")
        print("2. Medium batches (10 symbols) - Balanced")
        print("3. Large batches (20 symbols) - Faster but may hit rate limits")
        print("4. Test with first 5 symbols only")
        
        choice = input("Enter choice (1-4): ").strip()
        
        if choice == "1":
            batch_size = 5
        elif choice == "2":
            batch_size = 10
        elif choice == "3":
            batch_size = 20
        elif choice == "4":
            symbols = symbols[:5]
            batch_size = 5
            logger.info(f"🧪 Test mode: Using first 5 symbols: {symbols}")
        else:
            batch_size = 10
            logger.info("Using default batch size: 10")
        
        # Fetch fundamental data
        fundamentals_data = await fetch_fundamental_data_batch(symbols, year_quarters, batch_size)
        
        if not fundamentals_data:
            logger.error("❌ No fundamental data retrieved")
            return False
        
        # Store in database
        storage_success = await store_fundamentals_in_database(fundamentals_data)
        
        # Summary
        logger.info("=" * 60)
        logger.info("📊 TEST SUMMARY")
        total_records = sum(len(records) for records in fundamentals_data.values())
        logger.info(f"Total symbols requested: {len(symbols)}")
        logger.info(f"Symbols with data: {len(fundamentals_data)}")
        logger.info(f"Total fundamental records: {total_records}")
        logger.info(f"Success rate: {len(fundamentals_data)/len(symbols)*100:.1f}%")
        logger.info(f"Database storage: {'✅ Success' if storage_success else '❌ Failed'}")
        
        if fundamentals_data:
            logger.info("\n🎯 Sample fundamental data retrieved:")
            for symbol, records in list(fundamentals_data.items())[:3]:
                logger.info(f"  {symbol}: {len(records)} records ({records[0]['fiscal_year']}Q{records[0]['fiscal_quarter']} - {records[-1]['fiscal_year']}Q{records[-1]['fiscal_quarter']})")
        
        return storage_success
        
    except Exception as e:
        logger.error(f"💥 Error in full test: {e}")
        import traceback
        traceback.print_exc()
        return False


async def run_quick_test():
    """Run a quick test with just a few symbols and recent quarters."""
    test_symbols = ["AAPL", "MSFT", "GOOGL"]
    test_quarters = [(2024, 1), (2024, 2), (2024, 3)]  # Recent quarters only
    
    logger.info(f"🧪 Quick test with {len(test_symbols)} symbols: {test_symbols}")
    logger.info(f"📅 For quarters: {test_quarters}")
    
    fundamentals_data = await fetch_fundamental_data_batch(test_symbols, test_quarters, batch_size=3)
    
    if fundamentals_data:
        storage_success = await store_fundamentals_in_database(fundamentals_data)
        total_records = sum(len(records) for records in fundamentals_data.values())
        logger.info(f"✅ Quick test completed: {total_records} records for {len(fundamentals_data)} symbols, storage: {'✅' if storage_success else '❌'}")
        return storage_success
    else:
        logger.error("❌ Quick test failed: No fundamental data retrieved")
        return False


def print_test_summary(symbols, fundamentals_data, success):
    total_records = sum(len(records) for records in fundamentals_data.values())
    logger.info(f"📊 TEST SUMMARY")
    logger.info(f"Total symbols requested: {len(symbols)}")
    logger.info(f"Symbols with data: {len(fundamentals_data)}")
    logger.info(f"Total fundamental records: {total_records}")
    logger.info(f"Success rate: {len(fundamentals_data)/len(symbols)*100:.1f}%")
    logger.info(f"Database storage: {'✅ Success' if success else '❌ Failed'}")


async def main():
    """Main function to run the fundamental data test."""
    print("📊 Fundamental Data Test (2020-2025)")
    print("=" * 50)
    print("1. Quick test (3 symbols, recent quarters)")
    print("2. Full test (all CSV symbols, 2020-2025)")
    print("3. Custom batch size test")
    print("4. Show symbol count only")
    print("5. Exit")
    print("=" * 50)
    
    choice = input("Choose option (1-5): ").strip()
    
    if choice == "1":
        # Quick test with 3 symbols
        symbols = ["AAPL", "MSFT", "GOOGL"]
        quarters = generate_year_quarter_combinations()[-8:]  # Last 8 quarters
        
        print(f"\n🚀 Running quick test with {len(symbols)} symbols and {len(quarters)} quarters...")
        
        # Fetch fundamental data
        fundamentals_data = await fetch_fundamental_data_batch(symbols, quarters, batch_size=3)
        
        # Store in database
        if fundamentals_data:
            success = await store_fundamentals_in_database(fundamentals_data)
            print_test_summary(symbols, fundamentals_data, success)
        else:
            print("❌ No fundamental data retrieved")
            
    elif choice == "2":
        # Full test with all CSV symbols
        symbols = parse_csv_symbols()
        quarters = generate_year_quarter_combinations()  # All quarters from 2020-2025
        
        print(f"\n🚀 Running full CSV fundamental data fetch with {len(symbols)} symbols and {len(quarters)} quarters...")
        print(f"📊 Total potential records: {len(symbols) * len(quarters)}")
        
        # Fetch fundamental data from ALL providers for all CSV symbols
        fundamentals_data = await fetch_fundamental_data_batch(symbols, quarters, batch_size=10)
        
        # Store in database
        if fundamentals_data:
            success = await store_fundamentals_in_database(fundamentals_data)
            print_test_summary(symbols, fundamentals_data, success)
        else:
            print("❌ No fundamental data retrieved")
            
    elif choice == "3":
        # Custom batch size test
        symbols = parse_csv_symbols()
        quarters = generate_year_quarter_combinations()
        
        try:
            batch_size = int(input("Enter batch size (1-50): "))
            if batch_size < 1 or batch_size > 50:
                print("❌ Invalid batch size. Using default of 10.")
                batch_size = 10
        except ValueError:
            print("❌ Invalid input. Using default batch size of 10.")
            batch_size = 10
        
        print(f"\n🚀 Running custom test with {len(symbols)} symbols, batch size {batch_size}...")
        print(f"📊 Total potential records: {len(symbols) * len(quarters)}")
        
        # Fetch fundamental data
        fundamentals_data = await fetch_fundamental_data_batch(symbols, quarters, batch_size=batch_size)
        
        # Store in database
        if fundamentals_data:
            success = await store_fundamentals_in_database(fundamentals_data)
            print_test_summary(symbols, fundamentals_data, success)
        else:
            print("❌ No fundamental data retrieved")
            
    elif choice == "4":
        # Show symbol count only
        symbols = parse_csv_symbols()
        quarters = generate_year_quarter_combinations()
        print(f"\n📈 Total symbols in CSV files: {len(symbols)}")
        print(f"📅 Total quarters (2020-2025): {len(quarters)}")
        print(f"📊 Total potential records: {len(symbols) * len(quarters)}")
        
    elif choice == "5":
        print("👋 Goodbye!")
        return
        
    else:
        print("❌ Invalid choice. Please select 1-5.")
        await main()  # Recursive call for invalid input


if __name__ == "__main__":
    asyncio.run(main())
