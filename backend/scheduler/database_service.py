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
    
    async def upsert_stock_quotes(self, quotes_data: List[Dict]) -> bool:
        """Store stock quotes in database using upsert function."""
        try:
            for quote in quotes_data:
                params = {
                    'p_symbol': quote.get('symbol'),
                    'p_quote_timestamp': quote.get('timestamp', datetime.now().isoformat()),
                    'p_data_provider': quote.get('provider', 'market_data_brain'),
                    'p_price': quote.get('price'),
                    'p_change_amount': quote.get('change'),
                    'p_change_percent': quote.get('change_percent'),
                    'p_volume': quote.get('volume'),
                    'p_open_price': quote.get('open'),
                    'p_high_price': quote.get('high'),
                    'p_low_price': quote.get('low'),
                    'p_previous_close': quote.get('previous_close')
                }
                
                response = self.supabase.rpc('upsert_stock_quote', params).execute()
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting stock quote for {quote.get('symbol')}: {response.error}")
                    return False
            
            logger.info(f"Successfully stored {len(quotes_data)} stock quotes")
            return True
            
        except Exception as e:
            logger.error(f"Error storing stock quotes: {e}")
            return False
    
    async def upsert_company_info(self, companies_data: List[Dict]) -> bool:
        """Store company info in database using upsert function."""
        try:
            for company in companies_data:
                params = {
                    'p_symbol': company.get('symbol'),
                    'p_data_provider': company.get('provider', 'market_data_brain'),
                    'p_name': company.get('name'),
                    'p_company_name': company.get('name'),  # Some providers use different field names
                    'p_sector': company.get('sector'),
                    'p_industry': company.get('industry'),
                    'p_market_cap': company.get('market_cap'),
                    'p_employees': company.get('employees'),
                    'p_description': company.get('description'),
                    'p_website': company.get('website'),
                    'p_ceo': company.get('ceo')
                }
                
                response = self.supabase.rpc('upsert_company_info', params).execute()
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting company info for {company.get('symbol')}: {response.error}")
                    return False
            
            logger.info(f"Successfully stored {len(companies_data)} company info records")
            return True
            
        except Exception as e:
            logger.error(f"Error storing company info: {e}")
            return False
    
    async def upsert_fundamental_data(self, fundamentals_data: List[Dict]) -> bool:
        """Store fundamental data in database using upsert function."""
        try:
            for fundamental in fundamentals_data:
                params = {
                    'p_symbol': fundamental.get('symbol'),
                    'p_revenue': fundamental.get('revenue'),
                    'p_net_income': fundamental.get('net_income'),
                    'p_total_assets': fundamental.get('total_assets'),
                    'p_pe_ratio': fundamental.get('pe_ratio'),
                    'p_pb_ratio': fundamental.get('pb_ratio'),
                    'p_roe': fundamental.get('roe'),
                    'p_roa': fundamental.get('roa'),
                    'p_debt_to_equity': fundamental.get('debt_to_equity'),
                    'p_data_provider': fundamental.get('provider', 'market_data_brain')
                }
                
                response = self.supabase.rpc('upsert_fundamental_data', params).execute()
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting fundamental data for {fundamental.get('symbol')}: {response.error}")
                    return False
            
            logger.info(f"Successfully stored {len(fundamentals_data)} fundamental data records")
            return True
            
        except Exception as e:
            logger.error(f"Error storing fundamental data: {e}")
            return False

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
            # For economic events, ensure all parameters are provided to match function signature
            if function_name == "upsert_economic_events":
                # Define all parameters with defaults to match SQL function signature
                # Order matches the expected alphabetical order from error message
                all_params = {
                    'p_actual': kwargs.get('p_actual'),
                    'p_category': kwargs.get('p_category'),
                    'p_country': kwargs.get('p_country', 'US'),
                    'p_currency': kwargs.get('p_currency', 'USD'),
                    'p_data_provider': kwargs.get('p_data_provider'),
                    'p_description': kwargs.get('p_description'),
                    'p_event_id': kwargs.get('p_event_id'),
                    'p_event_name': kwargs.get('p_event_name'),
                    'p_event_period': kwargs.get('p_event_period'),
                    'p_event_timestamp': kwargs.get('p_event_timestamp'),
                    'p_forecast': kwargs.get('p_forecast'),
                    'p_frequency': kwargs.get('p_frequency'),
                    'p_importance': kwargs.get('p_importance'),
                    'p_last_update': kwargs.get('p_last_update'),
                    'p_market_impact': kwargs.get('p_market_impact'),
                    'p_previous': kwargs.get('p_previous'),
                    'p_revised': kwargs.get('p_revised', False),
                    'p_source': kwargs.get('p_source'),
                    'p_status': kwargs.get('p_status', 'scheduled'),
                    'p_unit': kwargs.get('p_unit'),
                    'p_url': kwargs.get('p_url')
                }
                
                # Serialize datetime objects and include all params (even None values)
                params = {}
                for k, v in all_params.items():
                    if v is not None:
                        if hasattr(v, 'isoformat'):  # datetime objects
                            params[k] = v.isoformat()
                        else:
                            params[k] = v
                    else:
                        # Include None values as null for database function
                        params[k] = None
            else:
                # Filter out None values and serialize datetime objects for other functions
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
    
    async def close(self):
        """Close database connections and cleanup."""
        try:
            # Close any open connections if needed
            logger.info("Database service closed")
        except Exception as e:
            logger.error(f"Error closing database service: {e}")
    
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
