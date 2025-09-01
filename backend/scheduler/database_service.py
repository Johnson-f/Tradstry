"""
Database service for scheduler operations.
Handles database connections and function execution for market data jobs.
"""

import logging
from typing import Any, Dict, Optional
from supabase import Client
from datetime import datetime


logger = logging.getLogger(__name__)


class SchedulerDatabaseService:
    """Simplified database service for scheduler operations."""
    
    def __init__(self, supabase_client: Client):
        """Initialize with Supabase client."""
        self.supabase = supabase_client
    
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
            # Filter out None values
            params = {k: v for k, v in kwargs.items() if v is not None}
            
            # Execute the function
            response = self.supabase.rpc(function_name, params).execute()
            
            if response.data:
                return response.data
            
            return None
            
        except Exception as e:
            logger.error(f"Error executing function {function_name}: {e}")
            return None
    
    async def get_tracked_symbols(self) -> list[str]:
        """
        Get list of symbols that should be tracked.
        This could come from user portfolios, watchlists, or a default list.
        """
        try:
            # For now, return a default list
            # In production, this could query user portfolios or watchlists
            default_symbols = [
                "AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "NFLX", 
                "BABA", "CRM", "ADBE", "PYPL", "INTC", "AMD", "ORCL", "CSCO",
                "IBM", "UBER", "LYFT", "SNAP", "TWTR", "ROKU", "ZOOM", "DOCU",
                "SHOP", "SQ", "SPOT", "PINS", "DKNG", "PLTR"
            ]
            return default_symbols
            
        except Exception as e:
            logger.error(f"Error getting tracked symbols: {e}")
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
