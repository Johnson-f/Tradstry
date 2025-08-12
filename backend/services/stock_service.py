from typing import List, Optional
from supabase import Client
from database import get_supabase
from models.stocks import StockCreate, StockUpdate, StockInDB
from .base_database_service import BaseDatabaseService

class StockService(BaseDatabaseService[StockInDB, StockCreate, StockUpdate]):
    """
    Service for handling stock trading operations.
    """
    def __init__(self, supabase: Client = None):
        self._supabase_client = supabase
        self._initialized = False
    
    def _ensure_initialized(self):
        """Lazy initialization of the service."""
        if not self._initialized:
            supabase_client = self._supabase_client or get_supabase()
            super().__init__("stocks", StockInDB, supabase_client)
            self._initialized = True
    
    async def get_open_positions(self, user_id: str, access_token: str = None) -> List[StockInDB]:
        """Get all open stock positions for a user."""
        self._ensure_initialized()
        return await self.query(
            {"status": {"operator": "eq", "value": "open"}},
            user_id,
            access_token
        )
    
    async def get_closed_positions(self, user_id: str, access_token: str = None) -> List[StockInDB]:
        """Get all closed stock positions for a user."""
        self._ensure_initialized()
        return await self.query(
            {"status": {"operator": "eq", "value": "closed"}}, 
            user_id,
            access_token
        )
    
    async def get_positions_by_symbol(self, symbol: str, user_id: str, access_token: str = None) -> List[StockInDB]:
        """Get all positions for a specific stock symbol."""
        self._ensure_initialized()
        return await self.query(
            {"symbol": {"operator": "eq", "value": symbol.upper()}}, 
            user_id,
            access_token
        )
    
    async def get_positions_by_date_range(self, 
                                       start_date: str, 
                                       end_date: str, 
                                       user_id: str,
                                       access_token: str = None) -> List[StockInDB]:
        """Get all positions within a date range."""
        self._ensure_initialized()
        return await self.query(
            {
                "entry_date": {"operator": "gte", "value": start_date},
                "entry_date": {"operator": "lte", "value": end_date}
            }, 
            user_id,
            access_token
        )

    # Override any other methods from BaseDatabaseService that might be called
    async def create(self, data: StockCreate, user_id: str, access_token: str = None) -> StockInDB:
        self._ensure_initialized()
        return await super().create(data, user_id, access_token)
    
    async def get_by_id(self, item_id: str, user_id: str, access_token: str = None) -> Optional[StockInDB]:
        self._ensure_initialized()
        return await super().get_by_id(item_id, user_id, access_token)
    
    async def update(self, item_id: str, data: StockUpdate, user_id: str, access_token: str = None) -> Optional[StockInDB]:
        self._ensure_initialized()
        return await super().update(item_id, data, user_id, access_token)
    
    async def delete(self, item_id: str, user_id: str, access_token: str = None) -> bool:
        self._ensure_initialized()
        return await super().delete(item_id, user_id, access_token)
    
    async def get_all(self, user_id: str, access_token: str = None) -> List[StockInDB]:
        self._ensure_initialized()
        return await super().get_all(user_id, access_token)
    
    async def query(self, filters: dict, user_id: str, access_token: str = None) -> List[StockInDB]:
        self._ensure_initialized()
        return await super().query(filters, user_id, access_token)