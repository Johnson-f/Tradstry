from typing import List, Optional, Literal
from datetime import datetime
from supabase import Client
from database import get_supabase
from models.options import OptionCreate, OptionUpdate, OptionInDB
from .base_database_service import BaseDatabaseService

class OptionService(BaseDatabaseService[OptionInDB, OptionCreate, OptionUpdate]):
    """
    Service for handling options trading operations.
    """
    def __init__(self, supabase: Client = None):
        super().__init__("options", OptionInDB, supabase or get_supabase())
    
    async def get_open_positions(self, user_id: str) -> List[OptionInDB]:
        """Get all open options positions for a user."""
        return await self.query({"status": {"operator": "eq", "value": "open"}}, user_id)
    
    async def get_closed_positions(self, user_id: str) -> List[OptionInDB]:
        """Get all closed options positions for a user."""
        return await self.query({"status": {"operator": "eq", "value": "closed"}}, user_id)
    
    async def get_positions_by_symbol(self, symbol: str, user_id: str) -> List[OptionInDB]:
        """Get all options positions for a specific underlying symbol."""
        return await self.query({"symbol": {"operator": "eq", "value": symbol.upper()}}, user_id)
    
    async def get_positions_by_expiration(
        self, 
        expiration_date: str, 
        user_id: str
    ) -> List[OptionInDB]:
        """Get all options positions expiring on a specific date."""
        return await self.query({"expiration_date": {"operator": "eq", "value": expiration_date}}, user_id)
    
    async def get_positions_by_strategy(
        self, 
        strategy_type: str, 
        user_id: str
    ) -> List[OptionInDB]:
        """Get all options positions for a specific strategy type."""
        return await self.query({"strategy_type": {"operator": "eq", "value": strategy_type}}, user_id)
    
    async def get_positions_by_option_type(
        self, 
        option_type: Literal['Call', 'Put'], 
        user_id: str
    ) -> List[OptionInDB]:
        """Get all Call or Put options positions."""
        return await self.query({"option_type": {"operator": "eq", "value": option_type}}, user_id)
    
    async def get_positions_by_date_range(
        self, 
        start_date: str, 
        end_date: str, 
        user_id: str
    ) -> List[OptionInDB]:
        """Get all options positions within a date range."""
        return await self.query({
            "entry_date": {"operator": "gte", "value": start_date},
            "entry_date": {"operator": "lte", "value": end_date}
        }, user_id)
