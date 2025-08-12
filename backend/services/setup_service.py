from typing import List, Optional, Dict, Any
from supabase import Client
from models.setups import (
    SetupCreate, SetupUpdate, SetupInDB, TradeSetupCreate, 
    TradeSetupInDB, SetupAnalytics, TradeBySetup, SetupSummary, SetupCategory
)
from services.base_database_service import BaseDatabaseService

class SetupService(BaseDatabaseService[SetupInDB, SetupCreate, SetupUpdate]):
    """Service for managing setups and trade-setup associations."""
    
    def __init__(self, supabase: Client = None):
        super().__init__("setups", SetupInDB, supabase)
    
    async def create_setup(self, setup: SetupCreate, user_id: str, access_token: str) -> SetupInDB:
        """Create a new setup."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            # Prepare data for database
            setup_data = {
                "user_id": user_id,
                "name": setup.name,
                "description": setup.description,
                "category": setup.category.value,
                "is_active": setup.is_active,
                "tags": setup.tags,
                "setup_conditions": setup.setup_conditions
            }
            
            # Insert into setups table
            result = client.table("setups").insert(setup_data).execute()
            
            if not result.data:
                raise Exception("Failed to create setup")
            
            # Convert to model
            setup_dict = result.data[0]
            return SetupInDB(
                id=setup_dict["id"],
                user_id=user_id,
                name=setup_dict["name"],
                description=setup_dict["description"],
                category=SetupCategory(setup_dict["category"]),
                is_active=setup_dict["is_active"],
                tags=setup_dict["tags"] or [],
                setup_conditions=setup_dict["setup_conditions"] or {},
                created_at=setup_dict["created_at"],
                updated_at=setup_dict["updated_at"]
            )
        
        return await self._execute_with_retry(operation, access_token)
    
    async def get_setups(self, user_id: str, access_token: str, 
                        category: Optional[SetupCategory] = None,
                        is_active: Optional[bool] = None) -> List[SetupInDB]:
        """Get all setups for a user with optional filtering."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            query = client.table("setups").select("*").eq("user_id", user_id)
            
            if category is not None:
                query = query.eq("category", category.value)
            if is_active is not None:
                query = query.eq("is_active", is_active)
            
            result = query.order("created_at", desc=True).execute()
            
            setups = []
            for setup_dict in result.data:
                setup = SetupInDB(
                    id=setup_dict["id"],
                    user_id=setup_dict["user_id"],
                    name=setup_dict["name"],
                    description=setup_dict["description"],
                    category=SetupCategory(setup_dict["category"]),
                    is_active=setup_dict["is_active"],
                    tags=setup_dict["tags"] or [],
                    setup_conditions=setup_dict["setup_conditions"] or {},
                    created_at=setup_dict["created_at"],
                    updated_at=setup_dict["updated_at"]
                )
                setups.append(setup)
            
            return setups
        
        return await self._execute_with_retry(operation, access_token)
    
    async def add_trade_to_setup(self, trade_setup: TradeSetupCreate, user_id: str, access_token: str) -> int:
        """Add a trade (stock or option) to a setup."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            # Validate mutual exclusivity
            if trade_setup.stock_id is not None and trade_setup.option_id is not None:
                raise ValueError("Cannot specify both stock_id and option_id")
            if trade_setup.stock_id is None and trade_setup.option_id is None:
                raise ValueError("Must specify either stock_id or option_id")
            
            # Call the appropriate database function
            if trade_setup.stock_id is not None:
                result = await client.rpc(
                    "add_stock_to_setup",
                    {
                        "p_user_id": user_id,
                        "p_stock_id": trade_setup.stock_id,
                        "p_setup_id": trade_setup.setup_id,
                        "p_confidence_rating": trade_setup.confidence_rating,
                        "p_notes": trade_setup.notes
                    }
                ).execute()
            else:
                result = await client.rpc(
                    "add_option_to_setup",
                    {
                        "p_user_id": user_id,
                        "p_option_id": trade_setup.option_id,
                        "p_setup_id": trade_setup.setup_id,
                        "p_confidence_rating": trade_setup.confidence_rating,
                        "p_notes": trade_setup.notes
                    }
                ).execute()
            
            if not result.data:
                raise Exception("Failed to add trade to setup")

            # Normalize RPC return shape to an integer id
            return self._extract_scalar_id_from_rpc_result(result, preferred_keys=["add_stock_to_setup", "add_option_to_setup", "id"]) 
            
        return await self._execute_with_retry(operation, access_token)
    
    async def remove_trade_from_setup(self, trade_type: str, trade_id: int, setup_id: int, 
                                    user_id: str, access_token: str) -> bool:
        """Remove a trade from a setup."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            if trade_type == "stock":
                result = await client.rpc(
                    "remove_stock_from_setup",
                    {
                        "p_user_id": user_id,
                        "p_stock_id": trade_id,
                        "p_setup_id": setup_id
                    }
                ).execute()
            elif trade_type == "option":
                result = await client.rpc(
                    "remove_option_from_setup",
                    {
                        "p_user_id": user_id,
                        "p_option_id": trade_id,
                        "p_setup_id": setup_id
                    }
                ).execute()
            else:
                raise ValueError("trade_type must be 'stock' or 'option'")
            
            if not result.data:
                raise Exception("Failed to remove trade from setup")
            
            return result.data
            
        return await self._execute_with_retry(operation, access_token)
    
    async def get_trades_by_setup(self, setup_id: int, user_id: str, access_token: str,
                                status: Optional[str] = None, limit: int = 100, 
                                offset: int = 0) -> List[TradeBySetup]:
        """Get all trades associated with a specific setup."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            result = await client.rpc(
                "get_trades_by_setup",
                {
                    "p_user_id": user_id,
                    "p_setup_id": setup_id,
                    "p_status": status,
                    "p_limit": limit,
                    "p_offset": offset
                }
            ).execute()
            
            if not result.data:
                return []
            
            trades = []
            for trade_dict in result.data:
                trade = TradeBySetup(
                    trade_id=trade_dict["trade_id"],
                    trade_type=trade_dict["trade_type"],
                    symbol=trade_dict["symbol"],
                    entry_date=trade_dict["entry_date"],
                    exit_date=trade_dict["exit_date"],
                    entry_price=trade_dict["entry_price"],
                    exit_price=trade_dict["exit_price"],
                    profit_loss=trade_dict["profit_loss"],
                    return_pct=trade_dict["return_pct"],
                    status=trade_dict["status"],
                    confidence_rating=trade_dict["confidence_rating"],
                    notes=trade_dict["notes"]
                )
                trades.append(trade)
            
            return trades
            
        return await self._execute_with_retry(operation, access_token)
    
    async def get_setup_analytics(self, setup_id: int, user_id: str, access_token: str,
                                start_date: Optional[str] = None, 
                                end_date: Optional[str] = None) -> SetupAnalytics:
        """Get analytics for a specific setup."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            result = await client.rpc(
                "get_setup_analytics",
                {
                    "p_user_id": user_id,
                    "p_setup_id": setup_id,
                    "p_start_date": start_date,
                    "p_end_date": end_date
                }
            ).execute()
            
            if not result.data:
                raise Exception("Failed to get setup analytics")
            
            analytics_dict = result.data[0]
            
            return SetupAnalytics(
                total_trades=analytics_dict["total_trades"],
                winning_trades=analytics_dict["winning_trades"],
                losing_trades=analytics_dict["losing_trades"],
                win_rate=analytics_dict["win_rate"],
                total_profit_loss=analytics_dict["total_profit_loss"],
                avg_profit=analytics_dict["avg_profit"],
                avg_loss=analytics_dict["avg_loss"],
                profit_factor=analytics_dict["profit_factor"],
                max_drawdown=analytics_dict["max_drawdown"],
                avg_holding_period=str(analytics_dict["avg_holding_period"]) if analytics_dict["avg_holding_period"] else None,
                avg_confidence_rating=analytics_dict["avg_confidence_rating"],
                trade_type_distribution=analytics_dict["trade_type_distribution"] or {},
                symbol_distribution=analytics_dict["symbol_distribution"] or {}
            )
            
        return await self._execute_with_retry(operation, access_token)
    
    async def get_setup_summaries(self, user_id: str, access_token: str) -> List[SetupSummary]:
        """Get summary information for all setups of a user."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            # This would need a new database function to be created
            # For now, we'll get basic setup info and calculate summaries
            setups = await self.get_setups(user_id, access_token)
            summaries = []
            
            for setup in setups:
                # Get basic trade counts
                trades = await self.get_trades_by_setup(setup.id, user_id, access_token)
                
                stock_trades = len([t for t in trades if t.trade_type == "stock"])
                option_trades = len([t for t in trades if t.trade_type == "option"])
                closed_trades = len([t for t in trades if t.status == "closed"])
                winning_trades = len([t for t in trades if t.profit_loss and t.profit_loss > 0])
                losing_trades = len([t for t in trades if t.profit_loss and t.profit_loss < 0])
                
                # Calculate averages
                profits = [t.profit_loss for t in trades if t.profit_loss and t.profit_loss > 0]
                losses = [t.profit_loss for t in trades if t.profit_loss and t.profit_loss < 0]
                
                avg_profit_loss = sum([t.profit_loss for t in trades if t.profit_loss]) / len(trades) if trades else 0
                avg_win_pct = sum(profits) / len(profits) if profits else 0
                avg_loss_pct = sum(losses) / len(losses) if losses else 0
                largest_win = max(profits) if profits else 0
                largest_loss = min(losses) if losses else 0
                
                # Get confidence ratings
                confidence_ratings = [t.confidence_rating for t in trades if t.confidence_rating]
                avg_confidence = sum(confidence_ratings) / len(confidence_ratings) if confidence_ratings else 0
                
                summary = SetupSummary(
                    id=setup.id,
                    name=setup.name,
                    category=setup.category,
                    is_active=setup.is_active,
                    total_trades=len(trades),
                    stock_trades=stock_trades,
                    option_trades=option_trades,
                    closed_trades=closed_trades,
                    winning_trades=winning_trades,
                    losing_trades=losing_trades,
                    avg_profit_loss=avg_profit_loss,
                    avg_win_pct=avg_win_pct,
                    avg_loss_pct=avg_loss_pct,
                    largest_win=largest_win,
                    largest_loss=largest_loss,
                    avg_confidence=avg_confidence,
                    created_at=setup.created_at
                )
                summaries.append(summary)
            
            return summaries
            
        return await self._execute_with_retry(operation, access_token)

    async def add_setup_to_stock(self, stock_id: int, setup_id: int, user_id: str, access_token: str, 
                                confidence_rating: Optional[int] = None, notes: Optional[str] = None) -> int:
        """Add a setup to an existing stock trade."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            try:
                result = await client.rpc(
                    "add_setup_to_stock",
                    {
                        "p_user_id": user_id,
                        "p_stock_id": stock_id,
                        "p_setup_id": setup_id,
                        "p_confidence_rating": confidence_rating,
                        "p_notes": notes
                    }
                ).execute()
                
                if not result.data:
                    raise Exception("Failed to add setup to stock - no data returned")

                # Normalize RPC return shape to an integer id
                return self._extract_scalar_id_from_rpc_result(result, preferred_keys=["add_setup_to_stock", "id"]) 
            except Exception as e:
                error_msg = str(e)
                if "Stock not found" in error_msg:
                    raise Exception(f"Stock with ID {stock_id} not found or access denied")
                elif "Setup not found" in error_msg:
                    raise Exception(f"Setup with ID {setup_id} not found or access denied")
                elif "function add_setup_to_stock" in error_msg:
                    raise Exception("Database function not found. Please ensure the setup functions are installed.")
                else:
                    raise Exception(f"Database error: {error_msg}")
            
        return await self._execute_with_retry(operation, access_token)

    async def add_setup_to_option(self, option_id: int, setup_id: int, user_id: str, access_token: str,
                                 confidence_rating: Optional[int] = None, notes: Optional[str] = None) -> int:
        """Add a setup to an existing option trade."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            try:
                result = await client.rpc(
                    "add_setup_to_option",
                    {
                        "p_user_id": user_id,
                        "p_option_id": option_id,
                        "p_setup_id": setup_id,
                        "p_confidence_rating": confidence_rating,
                        "p_notes": notes
                    }
                ).execute()
                
                if not result.data:
                    raise Exception("Failed to add setup to option - no data returned")

                # Normalize RPC return shape to an integer id
                return self._extract_scalar_id_from_rpc_result(result, preferred_keys=["add_setup_to_option", "id"]) 
            except Exception as e:
                error_msg = str(e)
                if "Option not found" in error_msg:
                    raise Exception(f"Option with ID {option_id} not found or access denied")
                elif "Setup not found" in error_msg:
                    raise Exception(f"Setup with ID {setup_id} not found or access denied")
                elif "function add_setup_to_option" in error_msg:
                    raise Exception("Database function not found. Please ensure the setup functions are installed.")
                else:
                    raise Exception(f"Database error: {error_msg}")
            
        return await self._execute_with_retry(operation, access_token)

    @staticmethod
    def _extract_scalar_id_from_rpc_result(result: Any, preferred_keys: Optional[list] = None) -> int:
        """Extract an integer id from a Supabase RPC result regardless of shape.

        Supabase PostgREST may return:
          - a bare integer (e.g., 123)
          - a list with a single integer (e.g., [123])
          - a dict with a key holding the integer (e.g., {"add_setup_to_stock": 123} or {"id": 123})
          - a list with a single dict of the above form ([{"id": 123}])
        """
        data = getattr(result, "data", result)

        # Bare integer
        if isinstance(data, int):
            return data

        # Single-item list
        if isinstance(data, list) and len(data) > 0:
            first_item = data[0]
            if isinstance(first_item, int):
                return first_item
            if isinstance(first_item, dict):
                # Try preferred keys first
                if preferred_keys:
                    for key in preferred_keys:
                        if key in first_item and isinstance(first_item[key], int):
                            return first_item[key]
                # Fallback: first int-like value in dict
                for val in first_item.values():
                    if isinstance(val, int):
                        return val

        # Dict result
        if isinstance(data, dict):
            if preferred_keys:
                for key in preferred_keys:
                    if key in data and isinstance(data[key], int):
                        return data[key]
            for val in data.values():
                if isinstance(val, int):
                    return val

        raise Exception(f"Unexpected RPC return shape, expected integer id but got: {type(data)} -> {data}")

    async def get_setups_for_stock(self, stock_id: int, user_id: str, access_token: str) -> List[Dict[str, Any]]:
        """Get all setups associated with a specific stock trade."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            result = await client.rpc(
                "get_setups_for_stock",
                {
                    "p_user_id": user_id,
                    "p_stock_id": stock_id
                }
            ).execute()
            
            return result.data or []
            
        return await self._execute_with_retry(operation, access_token)

    async def get_setups_for_option(self, option_id: int, user_id: str, access_token: str) -> List[Dict[str, Any]]:
        """Get all setups associated with a specific option trade."""
        async def operation():
            client = await self.get_authenticated_client(access_token)
            
            result = await client.rpc(
                "get_setups_for_option",
                {
                    "p_user_id": user_id,
                    "p_option_id": option_id
                }
            ).execute()
            
            return result.data or []
            
        return await self._execute_with_retry(operation, access_token)