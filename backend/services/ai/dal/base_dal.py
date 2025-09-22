"""
Base Data Access Layer (DAL) for AI Services
Provides common database operations and authentication handling
"""

from typing import Dict, Any, Optional, List
from abc import ABC, abstractmethod
from supabase import Client
from database import get_supabase
from auth_service import AuthService
import logging

class BaseDAL(ABC):
    """
    Base Data Access Layer providing common database operations
    """
    
    def __init__(self, supabase: Optional[Client] = None):
        self.supabase = supabase or get_supabase()
        self.auth_service = AuthService(self.supabase)
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
    async def get_authenticated_user_id(self, access_token: str) -> str:
        """
        Extract and validate user_id from access_token.
        
        Args:
            access_token: User authentication token
            
        Returns:
            str: User ID
            
        Raises:
            Exception: If authentication fails or token is invalid
        """
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            return user_response.user.id
            
        except Exception as e:
            self.logger.error(f"Authentication failed: {str(e)}")
            raise Exception(f"Authentication failed: {str(e)}")
    
    async def call_sql_function(self, function_name: str, params: Dict[str, Any], access_token: str, max_retries: int = 3) -> Any:
        """
        Execute SQL function with authentication, logging, and retry logic.
        
        Args:
            function_name: Name of the SQL function to call
            params: Parameters to pass to the function
            access_token: User authentication token
            max_retries: Maximum number of retry attempts for transient errors
            
        Returns:
            Any: Function result
            
        Raises:
            Exception: If database operation fails after all retries
        """
        import asyncio
        
        for attempt in range(max_retries + 1):
            try:
                self.logger.debug(f"Calling SQL function: {function_name} (attempt {attempt + 1})", extra={
                    "function_name": function_name,
                    "param_count": len(params),
                    "has_access_token": bool(access_token),
                    "attempt": attempt + 1,
                    "max_retries": max_retries
                })
                
                result = await self.auth_service.safe_rpc_call(function_name, params, access_token)
                
                self.logger.debug(f"SQL function {function_name} completed successfully", extra={
                    "function_name": function_name,
                    "result_type": type(result).__name__,
                    "has_data": hasattr(result, 'data') and bool(result.data),
                    "attempt": attempt + 1
                })
                
                return result
                
            except Exception as e:
                error_msg = str(e)
                is_transient_error = any(phrase in error_msg.lower() for phrase in [
                    'ssl', 'handshake', 'timeout', 'connection', 'network', 'temporary', 'unavailable'
                ])
                
                if attempt < max_retries and is_transient_error:
                    # Wait with exponential backoff for transient errors
                    wait_time = (2 ** attempt) * 0.5  # 0.5s, 1s, 2s
                    self.logger.warning(f"Transient database error for {function_name} (attempt {attempt + 1}/{max_retries + 1}): {error_msg}. Retrying in {wait_time}s...", extra={
                        "function_name": function_name,
                        "attempt": attempt + 1,
                        "max_retries": max_retries,
                        "wait_time": wait_time,
                        "error_type": "transient",
                        "error_message": error_msg
                    })
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    # Log error and re-raise (either non-transient or max retries reached)
                    if is_transient_error:
                        self.logger.error(f"Database operation failed for {function_name} after {max_retries + 1} attempts: {error_msg}", extra={
                            "function_name": function_name,
                            "total_attempts": attempt + 1,
                            "error_type": "transient_exhausted"
                        })
                    else:
                        self.logger.error(f"Database operation failed for {function_name}: {error_msg}", extra={
                            "function_name": function_name,
                            "attempt": attempt + 1,
                            "error_type": "non_transient"
                        })
                    raise Exception(f"Database operation failed: {error_msg}")
        
        # This should never be reached, but added for completeness
        raise Exception(f"Database operation failed: Maximum retries exceeded")
    
    def extract_response_data(self, response: Any) -> List[Dict[str, Any]]:
        """
        Extract data from Supabase response object.
        
        Args:
            response: Supabase response object
            
        Returns:
            List[Dict[str, Any]]: Extracted data as list of dictionaries
        """
        try:
            if not response:
                return []
                
            if hasattr(response, 'data') and response.data is not None:
                data = response.data
                if isinstance(data, list):
                    return data
                else:
                    return [data]
            elif isinstance(response, list):
                return response
            else:
                return [response] if response else []
                
        except Exception as e:
            self.logger.error(f"Error extracting response data: {str(e)}")
            return []
    
    def extract_single_response(self, response: Any) -> Optional[Dict[str, Any]]:
        """
        Extract single item from Supabase response.
        
        Args:
            response: Supabase response object
            
        Returns:
            Optional[Dict[str, Any]]: Single data item or None
        """
        data_list = self.extract_response_data(response)
        return data_list[0] if data_list else None
