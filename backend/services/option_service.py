from typing import List, Optional, Literal
from datetime import datetime
import logging
from supabase import Client
from database import get_supabase
from models.options import OptionCreate, OptionUpdate, OptionInDB
from .base_database_service import BaseDatabaseService

# Set up logging
logger = logging.getLogger(__name__)

class OptionService(BaseDatabaseService[OptionInDB, OptionCreate, OptionUpdate]):
    """
    Service for handling options trading operations.
    """
    def __init__(self, supabase: Client = None):
        super().__init__("options", OptionInDB, supabase or get_supabase())
        self.model_class = OptionInDB  # Add this line to ensure it's set
    
    def _serialize_for_database(self, data: dict) -> dict:
        """
        Convert datetime objects to ISO format strings for JSON serialization.
        """
        serialized_data = data.copy()
        
        # List of fields that might contain datetime objects
        datetime_fields = ['expiration_date', 'entry_date', 'exit_date', 'created_at', 'updated_at']
        
        for field in datetime_fields:
            if field in serialized_data and isinstance(serialized_data[field], datetime):
                # Convert to ISO format string
                serialized_data[field] = serialized_data[field].isoformat()
        
        return serialized_data
    
    async def create(self, option: OptionCreate, user_id: str, access_token: str) -> OptionInDB:
        """
        Create a new option with proper user_id handling and RLS authentication.
        """
        logger.info(f"Creating option for user_id: {user_id}")
        
        # Validate user_id is a UUID
        import uuid
        try:
            uuid.UUID(user_id)
        except ValueError:
            logger.error(f"Invalid UUID format for user_id: {user_id}")
            raise ValueError(f"Invalid user ID format: {user_id}")
        
        # Convert OptionCreate to dict with JSON serialization
        # Use model_dump() for Pydantic v2 or dict() for Pydantic v1
        try:
            # Pydantic v2
            option_data = option.model_dump()
        except AttributeError:
            # Pydantic v1
            option_data = option.dict()
        
        # Add user_id
        option_data['user_id'] = user_id
        
        logger.info(f"Option data to insert: {option_data}")
        
        # Serialize datetime objects for JSON
        serialized_data = self._serialize_for_database(option_data)
        
        logger.info(f"Serialized option data: {serialized_data}")
        
        # Define the operation to execute
        async def operation():
            # Create a new Supabase client for this operation with the access token
            from supabase import create_client, Client as SupabaseClient
            from dotenv import load_dotenv
            import os
            
            load_dotenv()
            
            # Get Supabase URL and key from environment variables
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_KEY")
            
            if not supabase_url or not supabase_key:
                raise ValueError("Missing Supabase URL or key in environment variables")
            
            # Create a new client with the access token
            client: SupabaseClient = create_client(supabase_url, supabase_key)
            
            # Set the access token for RLS
            client.auth.set_session(access_token, "")
            
            # Perform the insert
            response = client.table(self.table_name).insert(serialized_data).execute()
            
            if response.data:
                # Convert response to OptionInDB
                return self.model_class(**response.data[0])
            else:
                raise Exception("No data returned from insert operation")
        
        # Execute with retry
        try:
            return await self._execute_with_retry(operation, user_id)
        except Exception as e:
            logger.error(f"Failed to create option: {str(e)}")
            logger.error(f"Option data: {option_data}")
            raise
    
    async def get_open_positions(self, user_id: str, access_token: str) -> List[OptionInDB]:
        """Get all open options positions for a user."""
        return await self.get_all_authenticated(user_id, access_token, {"status": "open"})
    
    async def get_closed_positions(self, user_id: str, access_token: str) -> List[OptionInDB]:
        """Get all closed options positions for a user."""
        return await self.get_all_authenticated(user_id, access_token, {"status": "closed"})
    
    async def get_positions_by_symbol(self, symbol: str, user_id: str, access_token: str) -> List[OptionInDB]:
        """Get all options positions for a specific underlying symbol."""
        return await self.get_all_authenticated(user_id, access_token, {"symbol": symbol.upper()})
    
    async def get_positions_by_expiration(
        self, 
        expiration_date: str, 
        user_id: str,
        access_token: str
    ) -> List[OptionInDB]:
        """Get all options positions expiring on a specific date."""
        return await self.get_all_authenticated(user_id, access_token, {"expiration_date": expiration_date})
    
    async def get_positions_by_strategy(
        self, 
        strategy_type: str, 
        user_id: str,
        access_token: str
    ) -> List[OptionInDB]:
        """Get all options positions for a specific strategy type."""
        return await self.get_all_authenticated(user_id, access_token, {"strategy_type": strategy_type})
    
    async def get_positions_by_option_type(
        self, 
        option_type: Literal['Call', 'Put'], 
        user_id: str,
        access_token: str
    ) -> List[OptionInDB]:
        """Get all Call or Put options positions."""
        return await self.get_all_authenticated(user_id, access_token, {"option_type": option_type})
    
    async def get_positions_by_date_range(
        self, 
        start_date: str, 
        end_date: str, 
        user_id: str,
        access_token: str
    ) -> List[OptionInDB]:
        """Get all options positions within a date range."""
        # Note: You'll need to implement date range filtering in get_all_authenticated
        # or create a separate method for this complex query
        return await self.get_all_authenticated(user_id, access_token, {
            "entry_date": {"gte": start_date, "lte": end_date}
        })
    
    async def get_all_authenticated(self, user_id: str, access_token: str, filters: dict = None) -> List[OptionInDB]:
        """
        Get all options for a user with RLS authentication and optional filters.
        """
        logger.info(f"Getting all options for user_id: {user_id}")
        
        # Validate user_id is a UUID
        import uuid
        try:
            uuid.UUID(user_id)
        except ValueError:
            logger.error(f"Invalid UUID format for user_id: {user_id}")
            raise ValueError(f"Invalid user ID format: {user_id}")
        
        # Define the operation to execute
        async def operation():
            # Create a new Supabase client for this operation with the access token
            from supabase import create_client, Client as SupabaseClient
            from dotenv import load_dotenv
            import os
            
            load_dotenv()
            
            # Get Supabase URL and key from environment variables
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_KEY")
            
            if not supabase_url or not supabase_key:
                raise ValueError("Missing Supabase URL or key in environment variables")
            
            # Create a new client with the access token
            client: SupabaseClient = create_client(supabase_url, supabase_key)
            
            # Set the access token for RLS
            client.auth.set_session(access_token, "")
            
            # Build the query
            query = client.table(self.table_name).select("*")
            
            # Apply filters if provided
            if filters:
                for key, value in filters.items():
                    if isinstance(value, dict):
                        # Handle complex filters like date ranges
                        if "gte" in value:
                            query = query.gte(key, value["gte"])
                        if "lte" in value:
                            query = query.lte(key, value["lte"])
                        if "gt" in value:
                            query = query.gt(key, value["gt"])
                        if "lt" in value:
                            query = query.lt(key, value["lt"])
                        if "eq" in value:
                            query = query.eq(key, value["eq"])
                    else:
                        # Simple equality filter
                        query = query.eq(key, value)
            
            # Execute the query
            response = query.execute()
            
            if response.data:
                # Convert each item to OptionInDB
                return [self.model_class(**item) for item in response.data]
            else:
                return []
        
        # Execute with retry
        try:
            return await self._execute_with_retry(operation, user_id)
        except Exception as e:
            logger.error(f"Failed to get options: {str(e)}")
            raise