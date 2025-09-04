#!/usr/bin/env python3
"""
Test file for fetching aggregated stock quotes from all symbols in CSV files.
Uses data aggregation to get the best data from multiple providers.
"""

import sys
import csv
import asyncio
import logging
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
load_dotenv()

# Set up logging
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


def get_all_symbols() -> List[str]:
    """Get all unique symbols from both CSV files."""
    scripts_dir = Path(__file__).parent
    
    # Load symbols from both CSV files
    dow30_file = scripts_dir / "dow30_2025-09-04.csv"
    sp500_file = scripts_dir / "sp500_union_unique_2025-09-04.csv"
    
    all_symbols = []
    
    if dow30_file.exists():
        dow30_symbols = load_symbols_from_csv(dow30_file)
        logger.info(f"Loaded {len(dow30_symbols)} symbols from Dow 30")
        all_symbols.extend(dow30_symbols)
    
    if sp500_file.exists():
        sp500_symbols = load_symbols_from_csv(sp500_file)
        logger.info(f"Loaded {len(sp500_symbols)} symbols from S&P 500")
        all_symbols.extend(sp500_symbols)
    
    # Remove duplicates while preserving order
    unique_symbols = []
    seen = set()
    for symbol in all_symbols:
        if symbol not in seen:
            unique_symbols.append(symbol)
            seen.add(symbol)
    
    logger.info(f"Total unique symbols: {len(unique_symbols)}")
    return unique_symbols


async def fetch_aggregated_quotes_batch(symbols: List[str], batch_size: int = 50) -> Dict[str, Any]:
    """
    Fetch aggregated stock quotes in batches using the data aggregator.
    
    Args:
        symbols: List of stock symbols to fetch
        batch_size: Number of symbols to process per batch
        
    Returns:
        Dictionary mapping symbols to quote data
    """
    try:
        # Import components
        from market_data.brain import MarketDataBrain
        from scheduler.new_architecture.jobs.data_aggregator import DataAggregator
        
        # Initialize components
        market_data_brain = MarketDataBrain()
        data_aggregator = DataAggregator(market_data_brain)
        
        logger.info(f"🔄 Starting aggregated quote fetch for {len(symbols)} symbols")
        logger.info(f"📦 Processing in batches of {batch_size}")
        
        all_quotes = {}
        already_fetched = set()  # Track symbols already successfully fetched
        
        # Process symbols in batches
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (len(symbols) + batch_size - 1) // batch_size
            
            # Filter out symbols already successfully fetched
            remaining_batch = [symbol for symbol in batch if symbol not in already_fetched]
            
            if not remaining_batch:
                logger.info(f"📊 Batch {batch_num}/{total_batches}: All symbols already fetched, skipping")
                continue
            
            logger.info(f"📊 Processing batch {batch_num}/{total_batches}: {len(remaining_batch)} symbols")
            logger.info(f"🎯 Symbols: {', '.join(remaining_batch[:5])}{'...' if len(remaining_batch) > 5 else ''}")
            
            if len(remaining_batch) < len(batch):
                skipped_count = len(batch) - len(remaining_batch)
                logger.info(f"⏭️ Skipped {skipped_count} already fetched symbols")
            
            try:
                # Use aggregator to get quotes with multiple provider fallback
                batch_quotes = {}
                for symbol in remaining_batch:
                    try:
                        result = await market_data_brain.get_quote(symbol)
                        if result.success and result.data:
                            batch_quotes[symbol] = result.data
                            already_fetched.add(symbol)  # Mark as successfully fetched
                            logger.debug(f"✅ Got quote for {symbol}")
                        else:
                            logger.warning(f"⚠️ No quote data for {symbol}")
                    except Exception as e:
                        logger.warning(f"❌ Error fetching {symbol}: {e}")
                        continue
                
                all_quotes.update(batch_quotes)
                logger.info(f"✅ Batch {batch_num} completed: {len(batch_quotes)}/{len(remaining_batch)} successful")
                
                # Small delay between batches to avoid rate limiting
                if i + batch_size < len(symbols):
                    await asyncio.sleep(1)
                    
            except Exception as e:
                logger.error(f"❌ Error processing batch {batch_num}: {e}")
                continue
        
        logger.info(f"🎉 Aggregated fetch completed: {len(all_quotes)}/{len(symbols)} quotes retrieved")
        return all_quotes
        
    except Exception as e:
        logger.error(f"💥 Error in aggregated quote fetch: {e}")
        return {}


async def store_quotes_in_database(quotes_data: Dict[str, Any]) -> bool:
    """
    Store the fetched quotes in the database using StockQuotesDB.
    
    Args:
        quotes_data: Dictionary mapping symbols to quote data
        
    Returns:
        True if successful, False otherwise
    """
    try:
        from scheduler.new_architecture.jobs.data_processor import DataProcessor
        
        logger.info(f"💾 Storing {len(quotes_data)} quotes in database...")
        
        # Initialize data processor
        data_processor = DataProcessor()
        
        # Process and store the quotes
        success = await data_processor.process_stock_quotes(quotes_data)
        
        if success:
            logger.info("✅ All quotes stored successfully in database")
        else:
            logger.error("❌ Failed to store quotes in database")
        
        return success
        
    except Exception as e:
        logger.error(f"💥 Error storing quotes in database: {e}")
        return False


async def run_full_test():
    """Run the complete test: fetch all symbols and store in database."""
    try:
        logger.info("🚀 Starting comprehensive stock quotes test")
        logger.info("=" * 60)
        
        # Get all symbols from CSV files
        symbols = get_all_symbols()
        
        if not symbols:
            logger.error("❌ No symbols found in CSV files")
            return False
        
        logger.info(f"📋 Will fetch quotes for {len(symbols)} symbols")
        
        # Ask user for batch size preference
        print(f"\n📊 Found {len(symbols)} symbols to fetch")
        print("Choose batch size:")
        print("1. Small batches (25 symbols) - Slower but more reliable")
        print("2. Medium batches (50 symbols) - Balanced")
        print("3. Large batches (100 symbols) - Faster but may hit rate limits")
        print("4. Test with first 10 symbols only")
        
        choice = input("Enter choice (1-4): ").strip()
        
        if choice == "1":
            batch_size = 25
        elif choice == "2":
            batch_size = 50
        elif choice == "3":
            batch_size = 100
        elif choice == "4":
            symbols = symbols[:10]
            batch_size = 10
            logger.info(f"🧪 Test mode: Using first 10 symbols: {symbols}")
        else:
            batch_size = 50
            logger.info("Using default batch size: 50")
        
        # Fetch aggregated quotes
        quotes_data = await fetch_aggregated_quotes_batch(symbols, batch_size)
        
        if not quotes_data:
            logger.error("❌ No quotes data retrieved")
            return False
        
        # Store in database
        storage_success = await store_quotes_in_database(quotes_data)
        
        # Summary
        logger.info("=" * 60)
        logger.info("📊 TEST SUMMARY")
        logger.info(f"Total symbols requested: {len(symbols)}")
        logger.info(f"Quotes successfully fetched: {len(quotes_data)}")
        logger.info(f"Success rate: {len(quotes_data)/len(symbols)*100:.1f}%")
        logger.info(f"Database storage: {'✅ Success' if storage_success else '❌ Failed'}")
        
        if quotes_data:
            logger.info("\n🎯 Sample quotes retrieved:")
            for i, (symbol, data) in enumerate(list(quotes_data.items())[:5]):
                if hasattr(data, 'price') or (isinstance(data, dict) and 'price' in data):
                    price = data.price if hasattr(data, 'price') else data.get('price', 'N/A')
                    logger.info(f"  {symbol}: ${price}")
                else:
                    logger.info(f"  {symbol}: {type(data).__name__}")
        
        return storage_success
        
    except Exception as e:
        logger.error(f"💥 Error in full test: {e}")
        import traceback
        traceback.print_exc()
        return False


async def run_quick_test():
    """Run a quick test with just a few symbols."""
    test_symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"]
    
    logger.info(f"🧪 Quick test with {len(test_symbols)} symbols: {test_symbols}")
    
    quotes_data = await fetch_aggregated_quotes_batch(test_symbols, batch_size=5)
    
    if quotes_data:
        storage_success = await store_quotes_in_database(quotes_data)
        logger.info(f"✅ Quick test completed: {len(quotes_data)}/5 quotes, storage: {'✅' if storage_success else '❌'}")
        return storage_success
    else:
        logger.error("❌ Quick test failed: No quotes retrieved")
        return False


def main():
    """Main function with user menu."""
    print("📊 Aggregated Stock Quotes Test")
    print("=" * 50)
    print("1. Quick test (5 symbols)")
    print("2. Full test (all CSV symbols)")
    print("3. Show symbol count only")
    print("4. Exit")
    print("=" * 50)
    
    choice = input("Choose option (1-4): ").strip()
    
    if choice == "1":
        print("\n🧪 Running quick test...")
        success = asyncio.run(run_quick_test())
    elif choice == "2":
        print("\n🚀 Running full test...")
        success = asyncio.run(run_full_test())
    elif choice == "3":
        symbols = get_all_symbols()
        print(f"\n📊 Total symbols available: {len(symbols)}")
        print(f"First 10: {symbols[:10]}")
        return
    elif choice == "4":
        print("👋 Goodbye!")
        return
    else:
        print("❌ Invalid choice!")
        return
    
    if success:
        print("\n🎉 Test completed successfully!")
        print("📊 Check your database to see the stored stock quotes.")
    else:
        print("\n💥 Test failed!")
        print("🔍 Check the logs above for error details.")


if __name__ == "__main__":
    main()
