from typing import Dict, Any, Optional
from supabase import Client
from database import get_supabase

class AnalyticsService:
    """
    Service for handling trading analytics operations.
    This service provides methods to call SQL functions for various trading metrics.
    """
    def __init__(self, supabase: Client = None):
        self.supabase = supabase or get_supabase()
    
    async def _call_sql_function(self, function_name: str, params: Dict[str, Any]) -> Any:
        """Helper method to call a SQL function with the given parameters."""
        try:
            # Use rpc to call the SQL function
            result = self.supabase.rpc(function_name, params).execute()
            
            # Check if result.data exists and handle both single values and arrays
            if result.data is not None:
                # If it's a list/array, get the first element
                if isinstance(result.data, list):
                    if len(result.data) > 0:
                        # If the first element is a dict, get the value
                        if isinstance(result.data[0], dict):
                            return result.data[0].get(next(iter(result.data[0].keys())))
                        else:
                            # If it's a direct value in the list
                            return result.data[0]
                # If it's a direct value (float, int, etc.)
                else:
                    return result.data
            
            return None
        except Exception as e:
            print(f"Error calling SQL function {function_name}: {str(e)}")
            return None
    
    # Stock Analytics Methods
    async def get_stock_win_rate(self, user_id: str) -> float:
        """Get the win rate for stock trades."""
        result = await self._call_sql_function("stock_win_rate", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    async def get_stock_average_gain(self, user_id: str) -> float:
        """Get the average gain for winning stock trades."""
        result = await self._call_sql_function("stock_average_gain", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    async def get_stock_average_loss(self, user_id: str) -> float:
        """Get the average loss for losing stock trades."""
        result = await self._call_sql_function("stock_average_loss", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    async def get_stock_risk_reward_ratio(self, user_id: str) -> float:
        """Get the risk/reward ratio for stock trades."""
        result = await self._call_sql_function("stock_risk_reward_ratio", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    async def get_stock_trade_expectancy(self, user_id: str) -> float:
        """Get the trade expectancy for stock trades."""
        result = await self._call_sql_function("stock_trade_expectancy", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    async def get_stock_net_pnl(self, user_id: str) -> float:
        """Get the net profit/loss for all stock trades."""
        result = await self._call_sql_function("stock_net_pnl", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    # Option Analytics Methods
    async def get_option_win_rate(self, user_id: str) -> float:
        """Get the win rate for option trades."""
        result = await self._call_sql_function("option_win_rate", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    async def get_option_average_gain(self, user_id: str) -> float:
        """Get the average gain for winning option trades."""
        result = await self._call_sql_function("option_average_gain", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    async def get_option_average_loss(self, user_id: str) -> float:
        """Get the average loss for losing option trades."""
        result = await self._call_sql_function("option_average_loss", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    async def get_option_risk_reward_ratio(self, user_id: str) -> float:
        """Get the risk/reward ratio for option trades."""
        result = await self._call_sql_function("option_risk_reward_ratio", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    async def get_option_trade_expectancy(self, user_id: str) -> float:
        """Get the trade expectancy for option trades."""
        result = await self._call_sql_function("option_trade_expectancy", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    async def get_option_net_pnl(self, user_id: str) -> float:
        """Get the net profit/loss for all option trades."""
        result = await self._call_sql_function("option_net_pnl", {"user_id": user_id})
        return float(result) if result is not None else 0.0
    
    # Combined Analytics Methods
    async def get_portfolio_analytics(self, user_id: str) -> Dict[str, Any]:
        """Get a comprehensive set of analytics for the user's portfolio."""
        return {
            "stocks": {
                "win_rate": await self.get_stock_win_rate(user_id),
                "average_gain": await self.get_stock_average_gain(user_id),
                "average_loss": await self.get_stock_average_loss(user_id),
                "risk_reward_ratio": await self.get_stock_risk_reward_ratio(user_id),
                "trade_expectancy": await self.get_stock_trade_expectancy(user_id),
                "net_pnl": await self.get_stock_net_pnl(user_id)
            },
            "options": {
                "win_rate": await self.get_option_win_rate(user_id),
                "average_gain": await self.get_option_average_gain(user_id),
                "average_loss": await self.get_option_average_loss(user_id),
                "risk_reward_ratio": await self.get_option_risk_reward_ratio(user_id),
                "trade_expectancy": await self.get_option_trade_expectancy(user_id),
                "net_pnl": await self.get_option_net_pnl(user_id)
            }
        }