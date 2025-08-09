from typing import Dict, Any, Optional
from supabase import Client
from database import get_supabase
from datetime import datetime

class AnalyticsService:
    """
    Service for handling trading analytics operations.
    This service provides methods to call SQL functions for various trading metrics with date range filtering.
    """
    def __init__(self, supabase: Optional[Client] = None):
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

    def _build_date_params(self,
                          user_id: str,
                          period_type: str = 'all_time',
                          custom_start_date: Optional[datetime] = None,
                          custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Helper method to build parameters for date range filtering."""
        params = {
            "user_id": user_id,
            "period_type": period_type
        }

        if period_type == 'custom':
            if custom_start_date:
                params["custom_start_date"] = custom_start_date.isoformat() if isinstance(custom_start_date, datetime) else custom_start_date
            if custom_end_date:
                params["custom_end_date"] = custom_end_date.isoformat() if isinstance(custom_end_date, datetime) else custom_end_date

        return params

    # Stock Analytics Methods
    async def get_stock_win_rate(self,
                               user_id: str,
                               period_type: str = 'all_time',
                               custom_start_date: Optional[datetime] = None,
                               custom_end_date: Optional[datetime] = None) -> float:
        """Get the win rate for stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("stock_win_rate", params)
        return float(result) if result is not None else 0.0

    async def get_stock_average_gain(self,
                                   user_id: str,
                                   period_type: str = 'all_time',
                                   custom_start_date: Optional[datetime] = None,
                                   custom_end_date: Optional[datetime] = None) -> float:
        """Get the average gain for winning stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("stock_average_gain", params)
        return float(result) if result is not None else 0.0

    async def get_stock_average_loss(self,
                                   user_id: str,
                                   period_type: str = 'all_time',
                                   custom_start_date: Optional[datetime] = None,
                                   custom_end_date: Optional[datetime] = None) -> float:
        """Get the average loss for losing stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("stock_average_loss", params)
        return float(result) if result is not None else 0.0

    async def get_stock_risk_reward_ratio(self,
                                        user_id: str,
                                        period_type: str = 'all_time',
                                        custom_start_date: Optional[datetime] = None,
                                        custom_end_date: Optional[datetime] = None) -> float:
        """Get the risk/reward ratio for stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("stock_risk_reward_ratio", params)
        return float(result) if result is not None else 0.0

    async def get_stock_trade_expectancy(self,
                                       user_id: str,
                                       period_type: str = 'all_time',
                                       custom_start_date: Optional[datetime] = None,
                                       custom_end_date: Optional[datetime] = None) -> float:
        """Get the trade expectancy for stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("stock_trade_expectancy", params)
        return float(result) if result is not None else 0.0

    async def get_stock_net_pnl(self,
                              user_id: str,
                              period_type: str = 'all_time',
                              custom_start_date: Optional[datetime] = None,
                              custom_end_date: Optional[datetime] = None) -> float:
        """Get the net profit/loss for all stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("stock_net_pnl", params)
        return float(result) if result is not None else 0.0

    # Option Analytics Methods
    async def get_option_win_rate(self,
                                user_id: str,
                                period_type: str = 'all_time',
                                custom_start_date: Optional[datetime] = None,
                                custom_end_date: Optional[datetime] = None) -> float:
        """Get the win rate for option trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("option_win_rate", params)
        return float(result) if result is not None else 0.0

    async def get_option_average_gain(self,
                                    user_id: str,
                                    period_type: str = 'all_time',
                                    custom_start_date: Optional[datetime] = None,
                                    custom_end_date: Optional[datetime] = None) -> float:
        """Get the average gain for winning option trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("option_average_gain", params)
        return float(result) if result is not None else 0.0

    async def get_option_average_loss(self,
                                    user_id: str,
                                    period_type: str = 'all_time',
                                    custom_start_date: Optional[datetime] = None,
                                    custom_end_date: Optional[datetime] = None) -> float:
        """Get the average loss for losing option trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("option_average_loss", params)
        return float(result) if result is not None else 0.0

    async def get_option_risk_reward_ratio(self,
                                         user_id: str,
                                         period_type: str = 'all_time',
                                         custom_start_date: Optional[datetime] = None,
                                         custom_end_date: Optional[datetime] = None) -> float:
        """Get the risk/reward ratio for option trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("option_risk_reward_ratio", params)
        return float(result) if result is not None else 0.0

    async def get_option_trade_expectancy(self,
                                        user_id: str,
                                        period_type: str = 'all_time',
                                        custom_start_date: Optional[datetime] = None,
                                        custom_end_date: Optional[datetime] = None) -> float:
        """Get the trade expectancy for option trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("option_trade_expectancy", params)
        return float(result) if result is not None else 0.0

    async def get_option_net_pnl(self,
                               user_id: str,
                               period_type: str = 'all_time',
                               custom_start_date: Optional[datetime] = None,
                               custom_end_date: Optional[datetime] = None) -> float:
        """Get the net profit/loss for all option trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("option_net_pnl", params)
        return float(result) if result is not None else 0.0

    # Combined Analytics Methods
    async def get_portfolio_analytics(self,
                                    user_id: str,
                                    period_type: str = 'all_time',
                                    custom_start_date: Optional[datetime] = None,
                                    custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Get a comprehensive set of analytics for the user's portfolio with optional date range filtering."""
        return {
            "stocks": {
                "win_rate": await self.get_stock_win_rate(user_id, period_type, custom_start_date, custom_end_date),
                "average_gain": await self.get_stock_average_gain(user_id, period_type, custom_start_date, custom_end_date),
                "average_loss": await self.get_stock_average_loss(user_id, period_type, custom_start_date, custom_end_date),
                "risk_reward_ratio": await self.get_stock_risk_reward_ratio(user_id, period_type, custom_start_date, custom_end_date),
                "trade_expectancy": await self.get_stock_trade_expectancy(user_id, period_type, custom_start_date, custom_end_date),
                "net_pnl": await self.get_stock_net_pnl(user_id, period_type, custom_start_date, custom_end_date)
            },
            "options": {
                "win_rate": await self.get_option_win_rate(user_id, period_type, custom_start_date, custom_end_date),
                "average_gain": await self.get_option_average_gain(user_id, period_type, custom_start_date, custom_end_date),
                "average_loss": await self.get_option_average_loss(user_id, period_type, custom_start_date, custom_end_date),
                "risk_reward_ratio": await self.get_option_risk_reward_ratio(user_id, period_type, custom_start_date, custom_end_date),
                "trade_expectancy": await self.get_option_trade_expectancy(user_id, period_type, custom_start_date, custom_end_date),
                "net_pnl": await self.get_option_net_pnl(user_id, period_type, custom_start_date, custom_end_date)
            },
            "period_info": {
                "period_type": period_type,
                "custom_start_date": custom_start_date.isoformat() if custom_start_date else None,
                "custom_end_date": custom_end_date.isoformat() if custom_end_date else None
            }
        }
