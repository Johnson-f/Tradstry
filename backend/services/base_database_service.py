from typing import Any, Dict, List, Optional, TypeVar, Generic, Type
from supabase import Client
from database import get_supabase
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal
from auth_service import AuthService

T = TypeVar('T', bound=BaseModel)
T_CREATE = TypeVar('T_CREATE', bound=BaseModel)
T_UPDATE = TypeVar('T_UPDATE', bound=BaseModel)

class BaseDatabaseService(Generic[T, T_CREATE, T_UPDATE]):
    """
    Base service class for database operations with automatic token refresh.
    """
    def __init__(self, table_name: str, model: Type[T], supabase: Client = None):
        self.table_name = table_name
        self.model = model
        self.supabase = supabase or get_supabase()
        self.auth_service = AuthService(self.supabase)
    
    async def get_authenticated_client(self, access_token: str = None) -> Client:
        """Get a Supabase client with authentication token and auto-refresh"""
        if access_token:
            try:
                return await self.auth_service.get_authenticated_client(access_token)
            except Exception as e:
                print(f"ERROR: Failed to get authenticated client: {e}")
                raise e
        return self.supabase
    
    def _convert_for_json(self, data_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Convert non-JSON serializable objects to JSON serializable format."""
        converted_dict = {}
        for key, value in data_dict.items():
            if isinstance(value, datetime):
                converted_dict[key] = value.isoformat()
            elif isinstance(value, Decimal):
                converted_dict[key] = float(value)
            elif value is None:
                converted_dict[key] = None
            else:
                converted_dict[key] = value
        return converted_dict
    
    async def _execute_with_retry(self, operation, access_token: str = None):
        """Execute database operation with automatic token refresh retry"""
        try:
            return await operation()  # Added await here
        except Exception as e:
            if ("JWT expired" in str(e) or "401" in str(e)) and access_token:
                print("JWT expired during operation, refreshing and retrying...")
                # Get fresh authenticated client and retry
                client = await self.get_authenticated_client(access_token)
                return await operation(client)  # Added await here
            else:
                raise e
    
    async def get_all(self, user_id: str, access_token: str = None) -> List[T]:
        """Get all records for a user with automatic token refresh."""
        print(f"DEBUG: Getting all records for user_id: {user_id}")
        print(f"DEBUG: Table: {self.table_name}")
        
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            query = client.table(self.table_name).select("*").eq("user_id", user_id)
            response = query.execute()
            
            print(f"DEBUG: Found {len(response.data) if response.data else 0} records")
            return [self.model(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)
    
    async def get_by_id(self, id: int, user_id: str, access_token: str = None) -> Optional[T]:
        """Get a single record by ID for a specific user with automatic token refresh."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            response = (client.table(self.table_name)
                       .select("*")
                       .eq("id", id)
                       .eq("user_id", user_id)
                       .execute())
            return self.model(**response.data[0]) if response.data and len(response.data) > 0 else None
        
        return await self._execute_with_retry(operation, access_token)
    
    async def create(self, data: T_CREATE, user_id: str, access_token: str = None) -> T:
        """Create a new record with automatic token refresh."""
        data_dict = data.dict()
        data_dict["user_id"] = user_id
        
        # For stocks table, filter out fields that don't exist in the database
        if self.table_name == "stocks":
            allowed_fields = {
                'user_id', 'symbol', 'trade_type', 'order_type', 'entry_price', 
                'exit_price', 'stop_loss', 'commissions', 'number_shares', 
                'take_profit', 'entry_date', 'exit_date'
            }
            data_dict = {k: v for k, v in data_dict.items() if k in allowed_fields}
        
        # Convert datetime objects and other non-JSON serializable types
        data_dict = self._convert_for_json(data_dict)
        
        print(f"DEBUG: Inserting into {self.table_name} with data: {data_dict}")
        
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            response = client.table(self.table_name).insert(data_dict).execute()
            return self.model(**response.data[0]) if response.data and len(response.data) > 0 else None
        
        return await self._execute_with_retry(operation, access_token)
    
    async def update(self, id: int, data: T_UPDATE, user_id: str, access_token: str = None) -> Optional[T]:
        """Update an existing record with automatic token refresh."""
        data_dict = data.dict(exclude_unset=True)
        data_dict = self._convert_for_json(data_dict)
        
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            response = (client.table(self.table_name)
                       .update(data_dict)
                       .eq("id", id)
                       .eq("user_id", user_id)
                       .execute())
            return self.model(**response.data[0]) if response.data and len(response.data) > 0 else None
        
        return await self._execute_with_retry(operation, access_token)
    
    async def delete(self, id: int, user_id: str, access_token: str = None) -> bool:
        """Delete a record by ID for a specific user with automatic token refresh."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            response = (client.table(self.table_name)
                       .delete()
                       .eq("id", id)
                       .eq("user_id", user_id)
                       .execute())
            return len(response.data) > 0 if response.data else False
        
        return await self._execute_with_retry(operation, access_token)
    
    async def query(self, query: Dict[str, Any], user_id: str, access_token: str = None) -> List[T]:
        """Execute a custom query with automatic token refresh."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            query_builder = client.table(self.table_name).select("*").eq("user_id", user_id)
            
            for key, value in query.items():
                if isinstance(value, dict) and 'operator' in value and 'value' in value:
                    operator = value['operator']
                    val = value['value']
                    if operator == 'eq':
                        query_builder = query_builder.eq(key, val)
                    elif operator == 'neq':
                        query_builder = query_builder.neq(key, val)
                    elif operator == 'gt':
                        query_builder = query_builder.gt(key, val)
                    elif operator == 'lt':
                        query_builder = query_builder.lt(key, val)
                    elif operator == 'gte':
                        query_builder = query_builder.gte(key, val)
                    elif operator == 'lte':
                        query_builder = query_builder.lte(key, val)
                    elif operator == 'like':
                        query_builder = query_builder.like(key, f"%{val}%")
                    elif operator == 'in':
                        query_builder = query_builder.in_(key, val)
                else:
                    query_builder = query_builder.eq(key, value)
            
            response = query_builder.execute()
            return [self.model(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)