from typing import Any, Dict, List, Optional, TypeVar, Generic, Type
from supabase import Client
from database import get_supabase
from pydantic import BaseModel

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
    
    async def get_all(self, user_id: str) -> List[T]:
        """Get all records for a user."""
        response = self.supabase.table(self.table_name).select("*").eq("user_id", user_id).execute()
        return [self.model(**item) for item in response.data] if response.data else []
    
    async def get_by_id(self, id: int, user_id: str) -> Optional[T]:
        """Get a single record by ID for a specific user."""
        response = (self.supabase.table(self.table_name)
                   .select("*")
                   .eq("id", id)
                   .eq("user_id", user_id)
                   .execute())
        return self.model(**response.data[0]) if response.data and len(response.data) > 0 else None
    
    async def create(self, data: T_CREATE, user_id: str) -> T:
        """Create a new record."""
        data_dict = data.dict()
        data_dict["user_id"] = user_id
        response = self.supabase.table(self.table_name).insert(data_dict).execute()
        return self.model(**response.data[0]) if response.data and len(response.data) > 0 else None
    
    async def update(self, id: int, data: T_UPDATE, user_id: str) -> Optional[T]:
        """Update an existing record."""
        data_dict = data.dict(exclude_unset=True)
        response = (self.supabase.table(self.table_name)
                   .update(data_dict)
                   .eq("id", id)
                   .eq("user_id", user_id)
                   .execute())
        return self.model(**response.data[0]) if response.data and len(response.data) > 0 else None
    
    async def delete(self, id: int, user_id: str) -> bool:
        """Delete a record by ID for a specific user."""
        response = (self.supabase.table(self.table_name)
                   .delete()
                   .eq("id", id)
                   .eq("user_id", user_id)
                   .execute())
        return len(response.data) > 0 if response.data else False
    
    async def query(self, query: Dict[str, Any], user_id: str) -> List[T]:
        """
        Execute a custom query on the table for a specific user.
        Example query: {"column": "status", "operator": "eq", "value": "open"}
        """
        query_builder = self.supabase.table(self.table_name).select("*").eq("user_id", user_id)
        
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
