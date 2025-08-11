from typing import List, Optional, Dict, Any, Union
from supabase import Client
from database import get_supabase
from models.setups import (
    SetupCreate, SetupInDB, SetupUpdate,
    TradeSetupCreate, TradeSetupInDB, TradeSetupUpdate
)
from .base_database_service import BaseDatabaseService

class SetupService(BaseDatabaseService[SetupInDB, SetupCreate, SetupUpdate]):
    """
    Service for handling trading setup operations.
    """
    def __init__(self, supabase=None):  # ✅ Removed Client type annotation
        super().__init__("setups", SetupInDB, supabase or get_supabase())
        self.trade_setup_service = TradeSetupService(supabase)
    
    async def get_setups_by_category(self, category: str, user_id: str, access_token: str = None) -> List[SetupInDB]:
        """Get all setups for a specific category."""
        return await self.query(
            {"category": {"operator": "eq", "value": category}},
            user_id,
            access_token
        )
    
    async def get_active_setups(self, user_id: str, access_token: str = None) -> List[SetupInDB]:
        """Get all active setups."""
        return await self.query(
            {"is_active": {"operator": "eq", "value": True}},
            user_id,
            access_token
        )
    
    async def get_trades_for_setup(self, setup_id: int, user_id: str, access_token: str = None) -> List[TradeSetupInDB]:
        """Get all trades associated with a specific setup."""
        return await self.trade_setup_service.query(
            {"setup_id": {"operator": "eq", "value": setup_id}},
            user_id,
            access_token
        )


class TradeSetupService(BaseDatabaseService[TradeSetupInDB, TradeSetupCreate, TradeSetupUpdate]):
    """
    Service for handling trade-setup relationship operations.
    """
    def __init__(self, supabase=None):  # ✅ Removed Client type annotation
        super().__init__("trade_setups", TradeSetupInDB, supabase or get_supabase())
    
    async def get_trades_by_stock(self, stock_id: int, user_id: str, access_token: str = None) -> List[TradeSetupInDB]:
        """Get all trade setups for a specific stock."""
        return await self.query(
            {"stock_id": {"operator": "eq", "value": stock_id}},
            user_id,
            access_token
        )
    
    async def get_trades_by_option(self, option_id: int, user_id: str, access_token: str = None) -> List[TradeSetupInDB]:
        """Get all trade setups for a specific option."""
        return await self.query(
            {"option_id": {"operator": "eq", "value": option_id}},
            user_id,
            access_token
        )
    
    async def get_analytics(self, setup_id: int, user_id: str, access_token: str = None) -> Dict[str, Any]:
        """Get analytics for a specific setup."""
        # This would call the get_setup_analytics database function
        client = await self.get_authenticated_client(access_token)
        result = client.rpc('get_setup_analytics', {'setup_id': setup_id}).execute()
        return result.data[0] if result.data else {}
    
    async def get_trades_grouped_by_setup(self, user_id: str, access_token: str = None) -> Dict[int, List[TradeSetupInDB]]:
        """Get all trades grouped by setup."""
        # This would call the get_trades_by_setup database function
        client = await self.get_authenticated_client(access_token)
        result = client.rpc('get_trades_by_setup', {'user_id_param': user_id}).execute()
        
        # Group trades by setup_id
        trades_by_setup = {}
        for trade in result.data:
            setup_id = trade.pop('setup_id')
            if setup_id not in trades_by_setup:
                trades_by_setup[setup_id] = []
            trades_by_setup[setup_id].append(TradeSetupInDB(**trade))
        
        return trades_by_setup