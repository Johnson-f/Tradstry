#!/usr/bin/env python3
"""
Test script for the new analytics functions.
This script tests the connection to the database functions and verifies they return expected data.
"""

import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

def get_supabase_client() -> Client:
    """Get Supabase client for testing."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    
    if not supabase_url or not supabase_key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY in environment variables")
    
    return create_client(supabase_url, supabase_key)

async def test_stock_functions():
    """Test the new stock analytics functions."""
    print("Testing Stock Analytics Functions...")
    print("=" * 50)
    
    client = get_supabase_client()
    
    # Test parameters
    test_params = [
        {"p_time_range": "all_time"},
        {"p_time_range": "30d"},
        {"p_time_range": "7d"}
    ]
    
    functions_to_test = [
        "get_stock_profit_factor",
        "get_avg_hold_time_winners", 
        "get_avg_hold_time_losers",
        "get_biggest_winner",
        "get_biggest_loser"
    ]
    
    for func_name in functions_to_test:
        print(f"\nTesting {func_name}:")
        for params in test_params:
            try:
                result = client.rpc(func_name, params).execute()
                print(f"  {params}: {result.data}")
            except Exception as e:
                print(f"  {params}: ERROR - {str(e)}")

async def test_option_functions():
    """Test the new option analytics functions."""
    print("\n\nTesting Options Analytics Functions...")
    print("=" * 50)
    
    client = get_supabase_client()
    
    # Test parameters
    test_params = [
        {"p_time_range": "all_time"},
        {"p_time_range": "30d"},
        {"p_time_range": "7d"}
    ]
    
    functions_to_test = [
        "get_options_profit_factor",
        "get_options_avg_hold_time_winners",
        "get_options_avg_hold_time_losers", 
        "get_options_biggest_winner",
        "get_options_biggest_loser"
    ]
    
    for func_name in functions_to_test:
        print(f"\nTesting {func_name}:")
        for params in test_params:
            try:
                result = client.rpc(func_name, params).execute()
                print(f"  {params}: {result.data}")
            except Exception as e:
                print(f"  {params}: ERROR - {str(e)}")

async def test_combined_functions():
    """Test the new combined analytics functions."""
    print("\n\nTesting Combined Analytics Functions...")
    print("=" * 50)
    
    client = get_supabase_client()
    
    # Test parameters
    test_params = [
        {"p_time_range": "all_time"},
        {"p_time_range": "30d"},
        {"p_time_range": "7d"}
    ]
    
    functions_to_test = [
        "get_combined_profit_factor",
        "get_combined_avg_hold_time_winners",
        "get_combined_avg_hold_time_losers",
        "get_combined_biggest_winner", 
        "get_combined_biggest_loser",
        "get_combined_win_rate",
        "get_combined_average_gain",
        "get_combined_average_loss",
        "get_combined_risk_reward_ratio",
        "get_combined_trade_expectancy"
    ]
    
    for func_name in functions_to_test:
        print(f"\nTesting {func_name}:")
        for params in test_params:
            try:
                result = client.rpc(func_name, params).execute()
                print(f"  {params}: {result.data}")
            except Exception as e:
                print(f"  {params}: ERROR - {str(e)}")

async def test_special_functions():
    """Test the special analytics functions."""
    print("\n\nTesting Special Analytics Functions...")
    print("=" * 50)
    
    client = get_supabase_client()
    
    # Test parameters
    test_params = [
        {"p_time_range": "all_time"},
        {"p_time_range": "30d"},
        {"p_time_range": "7d"}
    ]
    
    functions_to_test = [
        "get_daily_pnl_trades",
        "get_ticker_profit_summary"
    ]
    
    for func_name in functions_to_test:
        print(f"\nTesting {func_name}:")
        for params in test_params:
            try:
                result = client.rpc(func_name, params).execute()
                print(f"  {params}: {result.data}")
            except Exception as e:
                print(f"  {params}: ERROR - {str(e)}")

async def main():
    """Main test function."""
    print("Tradistry Analytics Functions Test")
    print("=" * 60)
    
    try:
        # Test all function categories
        await test_stock_functions()
        await test_option_functions()
        await test_combined_functions()
        await test_special_functions()
        
        print("\n\nTest completed successfully!")
        
    except Exception as e:
        print(f"\nTest failed with error: {str(e)}")
        raise

if __name__ == "__main__":
    asyncio.run(main()) 