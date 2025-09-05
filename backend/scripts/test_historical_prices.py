"""
Test script for fetching historical price data from multiple providers.
Fetches OHLCV data for stocks from CSV files and stores in database.
"""

import asyncio
import logging
import csv
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from decimal import Decimal
import yfinance as yf
import pandas as pd

# Add the parent directory to the path to import modules
import sys
sys.path.append(str(Path(__file__).parent.parent))

from market_data.brain import MarketDataBrain
from scheduler.new_architecture.jobs.db_services.historical_prices_db import HistoricalPricesDB

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


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
    seen_symbols = set()
    
    try:
        with open(csv_file_path, 'r', encoding='utf-8') as file:
            csv_reader = csv.reader(file)
            
            for row_num, row in enumerate(csv_reader, 1):
                if not row:  # Skip empty rows
                    continue
                
                # Handle different CSV formats
                for cell in row:
                    cell = cell.strip()
                    if cell and cell.upper() not in seen_symbols:
                        # Basic symbol validation
                        if len(cell) <= 10 and cell.replace('.', '').replace('-', '').isalnum():
                            symbols.append(cell.upper())
                            seen_symbols.add(cell.upper())
                            break  # Take first valid symbol from row
                        
    except Exception as e:
        logger.error(f"Error reading CSV file {csv_file_path}: {e}")
    
    return symbols


class YahooFinanceProvider:
    """Yahoo Finance provider for historical price data."""
    
    def __init__(self):
        self.provider_name = "yahoo_finance"
    
    async def get_historical_prices(self, symbol: str, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        """Fetch historical price data from Yahoo Finance."""
        try:
            # Create ticker object
            ticker = yf.Ticker(symbol)
            
            # Fetch historical data
            hist_data = ticker.history(
                start=start_date,
                end=end_date,
                interval='1d',
                auto_adjust=False,  # Get raw prices
                prepost=False
            )
            
            if hist_data.empty:
                logger.warning(f"No historical data found for {symbol}")
                return []
            
            # Convert to list of dictionaries
            price_records = []
            for date_index, row in hist_data.iterrows():
                # Handle timezone-aware datetime
                if hasattr(date_index, 'date'):
                    record_date = date_index.date()
                else:
                    record_date = date_index
                
                price_record = {
                    'symbol': symbol,
                    'date': record_date.isoformat(),
                    'open': float(row['Open']) if pd.notna(row['Open']) else None,
                    'high': float(row['High']) if pd.notna(row['High']) else None,
                    'low': float(row['Low']) if pd.notna(row['Low']) else None,
                    'close': float(row['Close']) if pd.notna(row['Close']) else None,
                    'volume': int(row['Volume']) if pd.notna(row['Volume']) else None,
                    'adjusted_close': float(row['Adj Close']) if pd.notna(row['Adj Close']) else None,
                    'dividend': 0.0,  # Yahoo Finance dividends are separate
                    'split_ratio': 1.0,  # Yahoo Finance splits are separate
                    'data_provider': self.provider_name
                }
                
                price_records.append(price_record)
            
            logger.info(f"✅ Fetched {len(price_records)} price records for {symbol}")
            return price_records
            
        except Exception as e:
            logger.error(f"Error fetching historical data for {symbol}: {e}")
            return []


async def fetch_historical_prices_from_providers(symbol: str, start_date: date, end_date: date) -> List[Dict[str, Any]]:
    """Fetch historical prices from multiple providers and combine results."""
    all_price_data = []
    
    # Yahoo Finance provider
    yahoo_provider = YahooFinanceProvider()
    yahoo_data = await yahoo_provider.get_historical_prices(symbol, start_date, end_date)
    all_price_data.extend(yahoo_data)
    
    # TODO: Add other providers (MarketDataBrain providers)
    # For now, we'll focus on Yahoo Finance as it's reliable for historical data
    
    return all_price_data


async def fetch_historical_prices_batch(symbols: List[str], start_date: date, end_date: date, batch_size: int = 10) -> Dict[str, List[Dict]]:
    """Fetch historical prices in batches to avoid rate limiting."""
    historical_data = {}
    total_batches = (len(symbols) + batch_size - 1) // batch_size
    
    logger.info(f"📦 Processing {len(symbols)} symbols in {total_batches} batches of {batch_size}")
    
    for i in range(0, len(symbols), batch_size):
        batch = symbols[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        
        logger.info(f"🔄 Processing batch {batch_num}/{total_batches}: {len(batch)} symbols")
        
        # Process batch with concurrent requests
        batch_tasks = []
        for symbol in batch:
            batch_tasks.append(fetch_historical_prices_for_symbol(symbol, start_date, end_date))
        
        # Execute batch concurrently
        batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
        
        # Process results
        batch_success = 0
        for symbol, result in zip(batch, batch_results):
            if isinstance(result, Exception):
                logger.warning(f"⚠️ Error fetching {symbol}: {result}")
            elif result:
                historical_data[symbol] = result
                batch_success += 1
        
        logger.info(f"✅ Batch {batch_num} completed: {batch_success}/{len(batch)} successful")
        
        # Small delay between batches to be respectful to APIs
        if i + batch_size < len(symbols):
            await asyncio.sleep(1.0)
    
    logger.info(f"🎉 Total symbols with historical data: {len(historical_data)}/{len(symbols)} ({len(historical_data)/len(symbols)*100:.1f}%)")
    return historical_data


async def fetch_historical_prices_for_symbol(symbol: str, start_date: date, end_date: date) -> List[Dict[str, Any]]:
    """Fetch historical prices for a single symbol."""
    try:
        price_data = await fetch_historical_prices_from_providers(symbol, start_date, end_date)
        
        if price_data:
            logger.info(f"✅ Got {len(price_data)} price records for {symbol}")
        else:
            logger.warning(f"⚠️ No price data found for {symbol}")
        
        return price_data
        
    except Exception as e:
        logger.error(f"Error fetching historical prices for {symbol}: {e}")
        return []


async def store_historical_prices_in_database(historical_data: Dict[str, List[Dict]]) -> bool:
    """Store historical price data in database."""
    try:
        historical_prices_db = HistoricalPricesDB()
        
        # Flatten data for database storage
        all_records = []
        for symbol, records in historical_data.items():
            all_records.extend(records)
        
        if not all_records:
            logger.warning("No historical price data to store")
            return False
        
        # Store in database
        success = await historical_prices_db.upsert_historical_prices(all_records)
        
        if success:
            logger.info(f"✅ Successfully stored {len(all_records)} historical price records")
        else:
            logger.error("❌ Failed to store historical price data")
        
        return success
        
    except Exception as e:
        logger.error(f"Error storing historical price data: {e}")
        return False


def print_test_summary(symbols: List[str], historical_data: Dict[str, List[Dict]], success: bool):
    """Print a summary of the test results."""
    total_records = sum(len(data) for data in historical_data.values())
    
    print(f"\n{'='*60}")
    print(f"📊 HISTORICAL PRICES TEST SUMMARY")
    print(f"{'='*60}")
    print(f"Total symbols requested: {len(symbols)}")
    print(f"Symbols with data: {len(historical_data)}")
    print(f"Total price records: {total_records}")
    print(f"Success rate: {len(historical_data)/len(symbols)*100:.1f}%")
    print(f"Database storage: {'✅ Success' if success else '❌ Failed'}")
    print(f"{'='*60}")
    
    # Log the same information
    logger.info(f"📊 TEST SUMMARY")
    logger.info(f"Total symbols requested: {len(symbols)}")
    logger.info(f"Symbols with data: {len(historical_data)}")
    logger.info(f"Total price records: {total_records}")
    logger.info(f"Success rate: {len(historical_data)/len(symbols)*100:.1f}%")
    logger.info(f"Database storage: {'✅ Success' if success else '❌ Failed'}")


async def main():
    """Main function to run the historical prices test."""
    print("📈 Historical Prices Test")
    print("=" * 50)
    print("1. Quick test (3 symbols, last 30 days)")
    print("2. Medium test (10 symbols, last 90 days)")
    print("3. Full test (all CSV symbols, last 1 year)")
    print("4. Custom date range test")
    print("5. Show symbol count only")
    print("6. Exit")
    print("=" * 50)
    
    choice = input("Choose option (1-6): ").strip()
    
    if choice == "1":
        # Quick test with 3 symbols, last 30 days
        symbols = ["AAPL", "MSFT", "GOOGL"]
        end_date = date.today()
        start_date = end_date - timedelta(days=30)
        
        print(f"\n🚀 Running quick test with {len(symbols)} symbols...")
        print(f"📅 Date range: {start_date} to {end_date}")
        
        # Fetch historical data
        historical_data = await fetch_historical_prices_batch(symbols, start_date, end_date, batch_size=3)
        
        # Store in database
        if historical_data:
            success = await store_historical_prices_in_database(historical_data)
            print_test_summary(symbols, historical_data, success)
        else:
            print("❌ No historical price data retrieved")
            
    elif choice == "2":
        # Medium test with 10 symbols, last 90 days
        all_symbols = parse_csv_symbols()
        symbols = all_symbols[:10] if len(all_symbols) >= 10 else all_symbols
        end_date = date.today()
        start_date = end_date - timedelta(days=90)
        
        print(f"\n🚀 Running medium test with {len(symbols)} symbols...")
        print(f"📅 Date range: {start_date} to {end_date}")
        
        # Fetch historical data
        historical_data = await fetch_historical_prices_batch(symbols, start_date, end_date, batch_size=5)
        
        # Store in database
        if historical_data:
            success = await store_historical_prices_in_database(historical_data)
            print_test_summary(symbols, historical_data, success)
        else:
            print("❌ No historical price data retrieved")
            
    elif choice == "3":
        # Full test with all CSV symbols, last 1 year
        symbols = parse_csv_symbols()
        end_date = date.today()
        start_date = end_date - timedelta(days=365)
        
        print(f"\n🚀 Running full test with {len(symbols)} symbols...")
        print(f"📅 Date range: {start_date} to {end_date}")
        print(f"📊 Total potential records: ~{len(symbols) * 252} (assuming 252 trading days)")
        
        # Fetch historical data
        historical_data = await fetch_historical_prices_batch(symbols, start_date, end_date, batch_size=10)
        
        # Store in database
        if historical_data:
            success = await store_historical_prices_in_database(historical_data)
            print_test_summary(symbols, historical_data, success)
        else:
            print("❌ No historical price data retrieved")
            
    elif choice == "4":
        # Custom date range test
        symbols = parse_csv_symbols()
        
        try:
            start_input = input("Enter start date (YYYY-MM-DD): ").strip()
            end_input = input("Enter end date (YYYY-MM-DD): ").strip()
            
            start_date = datetime.strptime(start_input, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_input, "%Y-%m-%d").date()
            
            if start_date >= end_date:
                print("❌ Start date must be before end date")
                return
                
        except ValueError:
            print("❌ Invalid date format. Use YYYY-MM-DD")
            return
        
        print(f"\n🚀 Running custom test with {len(symbols)} symbols...")
        print(f"📅 Date range: {start_date} to {end_date}")
        
        # Fetch historical data
        historical_data = await fetch_historical_prices_batch(symbols, start_date, end_date, batch_size=10)
        
        # Store in database
        if historical_data:
            success = await store_historical_prices_in_database(historical_data)
            print_test_summary(symbols, historical_data, success)
        else:
            print("❌ No historical price data retrieved")
            
    elif choice == "5":
        # Show symbol count only
        symbols = parse_csv_symbols()
        print(f"\n📈 Total symbols in CSV files: {len(symbols)}")
        print(f"📅 Estimated records for 1 year: ~{len(symbols) * 252}")
        
    elif choice == "6":
        print("👋 Goodbye!")
        return
        
    else:
        print("❌ Invalid choice. Please select 1-6.")
        await main()  # Recursive call for invalid input


if __name__ == "__main__":
    asyncio.run(main())
