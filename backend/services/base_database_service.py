from typing import Any, Dict, List, Optional, TypeVar, Generic, Type
from supabase import Client
from database import get_supabase
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal

T = TypeVar('T', bound=BaseModel)
T_CREATE = TypeVar('T_CREATE', bound=BaseModel)
T_UPDATE = TypeVar('T_UPDATE', bound=BaseModel)

class BaseDatabaseService(Generic[T, T_CREATE, T_UPDATE]):
    """
    Base service class for database operations.
    Generic types:
    - T: The Pydantic model for the database table
    - T_CREATE: The Pydantic model for creating new records
    - T_UPDATE: The Pydantic model for updating records
    """
    def __init__(self, table_name: str, model: Type[T], supabase: Client = None):
        self.table_name = table_name
        self.model = model
        self.supabase = supabase or get_supabase()
    
    def get_authenticated_client(self, access_token: str = None) -> Client:
        """Get a Supabase client with authentication token"""
        if access_token:
            # Create a new client instance
            from database import get_supabase
            client = get_supabase()
            
            try:
                # Remove any "Bearer " prefix if present
                clean_token = access_token.replace("Bearer ", "") if access_token.startswith("Bearer ") else access_token
                
                # Validate the token format (basic check)
                if not clean_token or len(clean_token.split('.')) != 3:
                    raise ValueError(f"Invalid JWT token format: {clean_token[:20]}...")
                
                # Set the JWT token in the postgrest client for RLS
                client.postgrest.auth(clean_token)
                
                print(f"DEBUG: Auth token set for RLS: {clean_token[:20]}...")
                return client
                
            except Exception as e:
                print(f"ERROR: Failed to set auth token: {e}")
                print(f"ERROR: Token format: {access_token[:50]}...")
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
    
    async def get_all(self, user_id: str, access_token: str = None) -> List[T]:
        """Get all records for a user."""
        client = self.get_authenticated_client(access_token)
        
        # Debug logging
        print(f"DEBUG: Getting all records for user_id: {user_id}")
        print(f"DEBUG: Table: {self.table_name}")
        print(f"DEBUG: Has access token: {access_token is not None}")
        
        try:
            # First, verify the user_id is being used in the query
            query = client.table(self.table_name).select("*")
            
            # Add user_id filter to ensure RLS works correctly
            query = query.eq("user_id", user_id)
            
            # Execute the query
            response = query.execute()
            
            # Debug logging
            print(f"DEBUG: Query executed successfully")
            print(f"DEBUG: Found {len(response.data) if response.data else 0} records")
            
            if response.data:
                print(f"DEBUG: First record user_id: {response.data[0].get('user_id')}")
                print(f"DEBUG: First record: {response.data[0]}")
            
            return [self.model(**item) for item in response.data] if response.data else []
            
        except Exception as e:
            print(f"ERROR in get_all: {str(e)}")
            raise
    
    async def get_by_id(self, id: int, user_id: str, access_token: str = None) -> Optional[T]:
        """Get a single record by ID for a specific user."""
        client = self.get_authenticated_client(access_token)
        response = (client.table(self.table_name)
                   .select("*")
                   .eq("id", id)
                   .eq("user_id", user_id)
                   .execute())
        return self.model(**response.data[0]) if response.data and len(response.data) > 0 else None
    
    async def create(self, data: T_CREATE, user_id: str, access_token: str = None) -> T:
        """Create a new record."""
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
        
        # Get authenticated client
        client = self.get_authenticated_client(access_token)
        
        # Debug: Print the data being sent
        print(f"DEBUG: Inserting into {self.table_name} with data: {data_dict}")
        print(f"DEBUG: User ID being inserted: {data_dict.get('user_id')}")
        print(f"DEBUG: User ID type: {type(data_dict.get('user_id'))}")
        print(f"DEBUG: Has access token: {access_token is not None}")
        
        # Add extra debug to verify RLS context
        if access_token:
            try:
                # Test if auth context is working by calling a function that returns auth.uid()
                test_response = client.rpc('auth_uid').execute()
                print(f"DEBUG: Database sees user ID as: {test_response.data}")
            except Exception as e:
                print(f"DEBUG: Could not verify auth context: {e}")
        
        response = client.table(self.table_name).insert(data_dict).execute()
        return self.model(**response.data[0]) if response.data and len(response.data) > 0 else None
    
    async def update(self, id: int, data: T_UPDATE, user_id: str, access_token: str = None) -> Optional[T]:
        """Update an existing record."""
        data_dict = data.dict(exclude_unset=True)
        # Convert datetime objects and other non-JSON serializable types
        data_dict = self._convert_for_json(data_dict)
        
        client = self.get_authenticated_client(access_token)
        response = (client.table(self.table_name)
                   .update(data_dict)
                   .eq("id", id)
                   .eq("user_id", user_id)
                   .execute())
        return self.model(**response.data[0]) if response.data and len(response.data) > 0 else None
    
    async def delete(self, id: int, user_id: str, access_token: str = None) -> bool:
        """Delete a record by ID for a specific user."""
        client = self.get_authenticated_client(access_token)
        response = (client.table(self.table_name)
                   .delete()
                   .eq("id", id)
                   .eq("user_id", user_id)
                   .execute())
        return len(response.data) > 0 if response.data else False
    
    async def query(self, query: Dict[str, Any], user_id: str, access_token: str = None) -> List[T]:
        """
        Execute a custom query on the table for a specific user.
        Example query: {"column": "status", "operator": "eq", "value": "open"}
        """
        client = self.get_authenticated_client(access_token)
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