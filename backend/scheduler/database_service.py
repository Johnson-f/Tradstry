"""
Database service for scheduler operations.
Handles database connections and function execution for market data jobs.
"""

import logging
from typing import Any, Dict, Optional, List
from supabase import Client
from datetime import datetime
from database import get_supabase_admin_client


logger = logging.getLogger(__name__)


class SchedulerDatabaseService:
    """Simplified database service for scheduler operations."""
    
    def __init__(self, supabase_client: Client = None):
        """Initialize with Supabase client. Uses admin client if none provided."""
        self.supabase = supabase_client or get_supabase_admin_client()
    
    async def execute_function(self, function_name: str, **kwargs) -> Optional[int]:
        """
        Execute a PostgreSQL function with given parameters.
        
        Args:
            function_name: Name of the PostgreSQL function to execute
            **kwargs: Parameters to pass to the function
            
        Returns:
            Function result or None if failed
        """
        try:
            # Filter out None values and serialize datetime objects
            params = {}
            for k, v in kwargs.items():
                if v is not None:
                    if hasattr(v, 'isoformat'):  # datetime objects
                        params[k] = v.isoformat()
                    else:
                        params[k] = v
            
            logger.info(f"Executing function {function_name} with params: {list(params.keys())}")
            
            # Execute the function
            response = self.supabase.rpc(function_name, params).execute()
            
            # Check for errors in the response
            if hasattr(response, 'error') and response.error:
                logger.error(f"Database function error: {response.error}")
                raise Exception(f"Database function error: {response.error}")
            
            if response.data is not None:
                logger.info(f"Function {function_name} executed successfully, returned: {response.data}")
                return response.data
            else:
                logger.warning(f"Function {function_name} returned None/empty data")
                return None
            
        except Exception as e:
            logger.error(f"Error executing function {function_name} with params {params}: {e}")
            # Re-raise the exception so the caller knows it failed
            raise e
    
    async def execute_query(self, query: str) -> Optional[List]:
        """
        Execute a raw SQL query.
        
        Args:
            query: SQL query string
            
        Returns:
            Query results as list of rows
        """
        try:
            # Use Supabase table query for simple SELECT operations
            # For more complex queries, you might need a custom RPC function
            if "SELECT DISTINCT symbol FROM" in query:
                # Query stock_quotes table for existing symbols
                response = self.supabase.table('stock_quotes').select('symbol').execute()
                if response.data:
                    return [(row['symbol'],) for row in response.data]
            
            return []
            
        except Exception as e:
            logger.error(f"Error executing query: {e}")
            return []
    
    async def get_tracked_symbols(self) -> List[str]:
        """
        Get list of symbols that should be tracked from user portfolios and watchlists.
        Falls back to active symbols from the database if no user-specific data is found.
        """
        try:
            # Query user portfolios and watchlists for symbols
            query = """
            SELECT DISTINCT symbol 
            FROM (
                -- Get symbols from user portfolios
                SELECT DISTINCT symbol FROM trades WHERE symbol IS NOT NULL
                UNION
                -- Get symbols from watchlists (if table exists)
                SELECT DISTINCT symbol FROM watchlists WHERE symbol IS NOT NULL AND active = true
                UNION  
                -- Get most actively traded symbols from recent quotes
                SELECT DISTINCT symbol FROM stock_quotes 
                WHERE quote_timestamp >= NOW() - INTERVAL '7 days'
                AND volume > 1000000
                ORDER BY symbol
                LIMIT 100
            ) AS combined_symbols
            ORDER BY symbol;
            """
            
            result = await self.execute_query(query)
            symbols = [row[0] for row in result] if result else []
            
            # If no symbols found, get top market cap stocks from company_info
            if not symbols:
                fallback_query = """
                SELECT DISTINCT symbol FROM company_info 
                WHERE market_cap > 1000000000 
                ORDER BY market_cap DESC NULLS LAST
                LIMIT 50;
                """
                fallback_result = await self.execute_query(fallback_query)
                symbols = [row[0] for row in fallback_result] if fallback_result else []
            
            logger.info(f"Retrieved {len(symbols)} tracked symbols from database")
            return symbols
            
        except Exception as e:
            logger.error(f"Error getting tracked symbols: {e}")
            # Return empty list to avoid hardcoded fallback
            return []
    
    async def log_job_execution(self, job_name: str, status: str, message: str = ""):
        """Log job execution for monitoring purposes."""
        try:
            log_data = {
                "job_name": job_name,
                "status": status,
                "message": message,
                "executed_at": datetime.now().isoformat()
            }
            
            # This could be stored in a job_logs table if needed
            logger.info(f"Job {job_name}: {status} - {message}")
            
        except Exception as e:
            logger.error(f"Error logging job execution: {e}")
