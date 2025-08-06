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
        super().__init__("stocks", StockInDB, supabase or get_supabase())
    
    async def get_open_positions(self, user_id: str) -> List[StockInDB]:
        """Get all open stock positions for a user."""
        return await self.query({"status": {"operator": "eq", "value": "open"}}, user_id)
    
    async def get_closed_positions(self, user_id: str) -> List[StockInDB]:
        """Get all closed stock positions for a user."""
        return await self.query({"status": {"operator": "eq", "value": "closed"}}, user_id)
    
    async def get_positions_by_symbol(self, symbol: str, user_id: str) -> List[StockInDB]:
        """Get all positions for a specific stock symbol."""
        return await self.query({"symbol": {"operator": "eq", "value": symbol.upper()}}, user_id)
    
    async def get_positions_by_date_range(self, 
                                       start_date: str, 
                                       end_date: str, 
                                       user_id: str) -> List[StockInDB]:
        """Get all positions within a date range."""
        return await self.query({
            "entry_date": {"operator": "gte", "value": start_date},
            "entry_date": {"operator": "lte", "value": end_date}
        }, user_id)
