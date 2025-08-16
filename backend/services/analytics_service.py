from typing import Dict, Any, Optional, List
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
                # For functions that return multiple rows (like get_daily_pnl_trades), return the full list
                if function_name in ['get_daily_pnl_trades', 'get_ticker_profit_summary']:
                    return result.data if isinstance(result.data, list) else []
                
                # For other analytics functions that return single values
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
            "p_time_range": period_type  # Keep as p_time_range to match SQL function
        }

        # Add custom date parameters when period_type is 'custom'
        if period_type == 'custom':
            if custom_start_date:
                params["p_custom_start_date"] = custom_start_date.date() if isinstance(custom_start_date, datetime) else custom_start_date
            if custom_end_date:
                params["p_custom_end_date"] = custom_end_date.date() if isinstance(custom_end_date, datetime) else custom_end_date

        return params

    def _build_combined_date_params(self,
                                   period_type: str = 'all_time',
                                   custom_start_date: Optional[datetime] = None,
                                   custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Helper method to build parameters for combined functions that use p_time_range."""
        params = {
            "p_time_range": period_type
        }

        if period_type == 'custom':
            if custom_start_date:
                params["p_custom_start_date"] = custom_start_date.isoformat() if isinstance(custom_start_date, datetime) else custom_start_date
            if custom_end_date:
                params["p_custom_end_date"] = custom_end_date.isoformat() if isinstance(custom_end_date, datetime) else custom_end_date

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

    async def get_stock_profit_factor(self,
                                   user_id: str,
                                   period_type: str = 'all_time',
                                   custom_start_date: Optional[datetime] = None,
                                   custom_end_date: Optional[datetime] = None) -> float:
        """Get the profit factor for stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_stock_profit_factor", params)
        return float(result) if result is not None else 0.0

    async def get_stock_avg_hold_time_winners(self,
                                            user_id: str,
                                            period_type: str = 'all_time',
                                            custom_start_date: Optional[datetime] = None,
                                            custom_end_date: Optional[datetime] = None) -> float:
        """Get the average hold time for winning stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_avg_hold_time_winners", params)
        return float(result) if result is not None else 0.0

    async def get_stock_avg_hold_time_losers(self,
                                           user_id: str,
                                           period_type: str = 'all_time',
                                           custom_start_date: Optional[datetime] = None,
                                           custom_end_date: Optional[datetime] = None) -> float:
        """Get the average hold time for losing stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_avg_hold_time_losers", params)
        return float(result) if result is not None else 0.0

    async def get_stock_biggest_winner(self,
                                     user_id: str,
                                     period_type: str = 'all_time',
                                     custom_start_date: Optional[datetime] = None,
                                     custom_end_date: Optional[datetime] = None) -> float:
        """Get the biggest winning trade profit for stocks with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_biggest_winner", params)
        return float(result) if result is not None else 0.0

    async def get_stock_biggest_loser(self,
                                    user_id: str,
                                    period_type: str = 'all_time',
                                    custom_start_date: Optional[datetime] = None,
                                    custom_end_date: Optional[datetime] = None) -> float:
        """Get the biggest losing trade loss for stocks with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_biggest_loser", params)
        return float(result) if result is not None else 0.0

    async def get_stock_average_position_size(self,
                                            user_id: str,
                                            period_type: str = 'all_time',
                                            custom_start_date: Optional[datetime] = None,
                                            custom_end_date: Optional[datetime] = None) -> float:
        """Get the average position size for stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_average_position_size", params)
        return float(result) if result is not None else 0.0

    async def get_stock_average_risk_per_trade(self,
                                             user_id: str,
                                             period_type: str = 'all_time',
                                             custom_start_date: Optional[datetime] = None,
                                             custom_end_date: Optional[datetime] = None) -> float:
        """Get the average risk per trade for stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_average_risk_per_trade", params)
        return float(result) if result is not None else 0.0

    async def get_stock_loss_rate(self,
                                user_id: str,
                                period_type: str = 'all_time',
                                custom_start_date: Optional[datetime] = None,
                                custom_end_date: Optional[datetime] = None) -> float:
        """Get the loss rate for stock trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_stock_loss_rate", params)
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

    async def get_option_profit_factor(self,
                                    user_id: str,
                                    period_type: str = 'all_time',
                                    custom_start_date: Optional[datetime] = None,
                                    custom_end_date: Optional[datetime] = None) -> float:
        """Get the profit factor for option trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_options_profit_factor", params)
        return float(result) if result is not None else 0.0

    async def get_option_avg_hold_time_winners(self,
                                             user_id: str,
                                             period_type: str = 'all_time',
                                             custom_start_date: Optional[datetime] = None,
                                             custom_end_date: Optional[datetime] = None) -> float:
        """Get the average hold time for winning option trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_options_avg_hold_time_winners", params)
        return float(result) if result is not None else 0.0

    async def get_option_avg_hold_time_losers(self,
                                            user_id: str,
                                            period_type: str = 'all_time',
                                            custom_start_date: Optional[datetime] = None,
                                            custom_end_date: Optional[datetime] = None) -> float:
        """Get the average hold time for losing option trades with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_options_avg_hold_time_losers", params)
        return float(result) if result is not None else 0.0

    async def get_option_biggest_winner(self,
                                      user_id: str,
                                      period_type: str = 'all_time',
                                      custom_start_date: Optional[datetime] = None,
                                      custom_end_date: Optional[datetime] = None) -> float:
        """Get the biggest winning trade profit for options with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_options_biggest_winner", params)
        return float(result) if result is not None else 0.0

    async def get_option_biggest_loser(self,
                                     user_id: str,
                                     period_type: str = 'all_time',
                                     custom_start_date: Optional[datetime] = None,
                                     custom_end_date: Optional[datetime] = None) -> float:
        """Get the biggest losing trade loss for options with optional date range filtering."""
        params = self._build_date_params(user_id, period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_options_biggest_loser", params)
        return float(result) if result is not None else 0.0

    # Combined Analytics Methods
    async def get_combined_win_rate(self,
                                  user_id: str,
                                  period_type: str = 'all_time',
                                  custom_start_date: Optional[datetime] = None,
                                  custom_end_date: Optional[datetime] = None) -> float:
        """Get the combined win rate for all trades with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_combined_win_rate", params)
        return float(result) if result is not None else 0.0

    async def get_combined_average_gain(self,
                                      user_id: str,
                                      period_type: str = 'all_time',
                                      custom_start_date: Optional[datetime] = None,
                                      custom_end_date: Optional[datetime] = None) -> float:
        """Get the combined average gain for all winning trades with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_combined_average_gain", params)
        return float(result) if result is not None else 0.0

    async def get_combined_average_loss(self,
                                     user_id: str,
                                     period_type: str = 'all_time',
                                     custom_start_date: Optional[datetime] = None,
                                     custom_end_date: Optional[datetime] = None) -> float:
        """Get the combined average loss for all losing trades with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_combined_average_loss", params)
        return float(result) if result is not None else 0.0

    async def get_combined_risk_reward_ratio(self,
                                           user_id: str,
                                           period_type: str = 'all_time',
                                           custom_start_date: Optional[datetime] = None,
                                           custom_end_date: Optional[datetime] = None) -> float:
        """Get the combined risk/reward ratio for all trades with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_combined_risk_reward_ratio", params)
        return float(result) if result is not None else 0.0

    async def get_combined_trade_expectancy(self,
                                          user_id: str,
                                          period_type: str = 'all_time',
                                          custom_start_date: Optional[datetime] = None,
                                          custom_end_date: Optional[datetime] = None) -> float:
        """Get the combined trade expectancy for all trades with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_combined_trade_expectancy", params)
        return float(result) if result is not None else 0.0

    async def get_combined_profit_factor(self,
                                       user_id: str,
                                       period_type: str = 'all_time',
                                       custom_start_date: Optional[datetime] = None,
                                       custom_end_date: Optional[datetime] = None) -> float:
        """Get the combined profit factor for all trades with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_combined_profit_factor", params)
        return float(result) if result is not None else 0.0

    async def get_combined_avg_hold_time_winners(self,
                                               user_id: str,
                                               period_type: str = 'all_time',
                                               custom_start_date: Optional[datetime] = None,
                                               custom_end_date: Optional[datetime] = None) -> float:
        """Get the combined average hold time for all winning trades with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_combined_avg_hold_time_winners", params)
        return float(result) if result is not None else 0.0

    async def get_combined_avg_hold_time_losers(self,
                                              user_id: str,
                                              period_type: str = 'all_time',
                                              custom_start_date: Optional[datetime] = None,
                                              custom_end_date: Optional[datetime] = None) -> float:
        """Get the combined average hold time for all losing trades with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_combined_avg_hold_time_losers", params)
        return float(result) if result is not None else 0.0

    async def get_combined_biggest_winner(self,
                                        user_id: str,
                                        period_type: str = 'all_time',
                                        custom_start_date: Optional[datetime] = None,
                                        custom_end_date: Optional[datetime] = None) -> float:
        """Get the combined biggest winning trade profit with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_combined_biggest_winner", params)
        return float(result) if result is not None else 0.0

    async def get_combined_biggest_loser(self,
                                       user_id: str,
                                       period_type: str = 'all_time',
                                       custom_start_date: Optional[datetime] = None,
                                       custom_end_date: Optional[datetime] = None) -> float:
        """Get the combined biggest losing trade loss with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        result = await self._call_sql_function("get_combined_biggest_loser", params)
        return float(result) if result is not None else 0.0

    # Special Analytics Methods
    async def get_daily_pnl_trades(self,
                                  user_id: str,
                                  period_type: str = 'all_time',
                                  custom_start_date: Optional[datetime] = None,
                                  custom_end_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Get daily P&L and trade count breakdown with optional date range filtering."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        # Don't add user_id - the function gets user context from RLS/authentication
        result = await self._call_sql_function("get_daily_pnl_trades", params)
        
        # The _call_sql_function already processes the .data, so result is the actual data
        if isinstance(result, list):
            return result
        elif result is None:
            return []
        else:
            # If it's a single item, wrap it in a list
            return [result]

    async def get_ticker_profit_summary(self,
                                      user_id: str,
                                      period_type: str = 'all_time',
                                      custom_start_date: Optional[datetime] = None,
                                      custom_end_date: Optional[datetime] = None,
                                      limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get profit summary by ticker symbol with optional date range filtering and limit."""
        params = self._build_combined_date_params(period_type, custom_start_date, custom_end_date)
        
        # Add limit parameter if provided
        if limit is not None:
            params['p_limit'] = limit
            
        # Don't add user_id - the function gets user context from RLS/authentication
        result = await self._call_sql_function("get_ticker_profit_summary", params)
        
        # The _call_sql_function already processes the .data, so result is the actual data
        if isinstance(result, list):
            return result
        elif result is None:
            return []
        else:
            # If it's a single item, wrap it in a list
            return [result]

    # Portfolio Analytics Methods
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
                "net_pnl": await self.get_stock_net_pnl(user_id, period_type, custom_start_date, custom_end_date),
                "profit_factor": await self.get_stock_profit_factor(user_id, period_type, custom_start_date, custom_end_date),
                "avg_hold_time_winners": await self.get_stock_avg_hold_time_winners(user_id, period_type, custom_start_date, custom_end_date),
                "avg_hold_time_losers": await self.get_stock_avg_hold_time_losers(user_id, period_type, custom_start_date, custom_end_date),
                "biggest_winner": await self.get_stock_biggest_winner(user_id, period_type, custom_start_date, custom_end_date),
                "biggest_loser": await self.get_stock_biggest_loser(user_id, period_type, custom_start_date, custom_end_date)
            },
            "options": {
                "win_rate": await self.get_option_win_rate(user_id, period_type, custom_start_date, custom_end_date),
                "average_gain": await self.get_option_average_gain(user_id, period_type, custom_start_date, custom_end_date),
                "average_loss": await self.get_option_average_loss(user_id, period_type, custom_start_date, custom_end_date),
                "risk_reward_ratio": await self.get_option_risk_reward_ratio(user_id, period_type, custom_start_date, custom_end_date),
                "trade_expectancy": await self.get_option_trade_expectancy(user_id, period_type, custom_start_date, custom_end_date),
                "net_pnl": await self.get_option_net_pnl(user_id, period_type, custom_start_date, custom_end_date),
                "profit_factor": await self.get_option_profit_factor(user_id, period_type, custom_start_date, custom_end_date),
                "avg_hold_time_winners": await self.get_option_avg_hold_time_winners(user_id, period_type, custom_start_date, custom_end_date),
                "avg_hold_time_losers": await self.get_option_avg_hold_time_losers(user_id, period_type, custom_start_date, custom_end_date),
                "biggest_winner": await self.get_option_biggest_winner(user_id, period_type, custom_start_date, custom_end_date),
                "biggest_loser": await self.get_option_biggest_loser(user_id, period_type, custom_start_date, custom_end_date)
            },
            "period_info": {
                "period_type": period_type,
                "custom_start_date": custom_start_date.isoformat() if custom_start_date else None,
                "custom_end_date": custom_end_date.isoformat() if custom_end_date else None
            }
        }

    async def get_combined_portfolio_analytics(self,
                                             user_id: str,
                                             period_type: str = 'all_time',
                                             custom_start_date: Optional[datetime] = None,
                                             custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Get combined portfolio analytics (stocks + options together) with optional date range filtering."""
        return {
            "win_rate": await self.get_combined_win_rate(user_id, period_type, custom_start_date, custom_end_date),
            "average_gain": await self.get_combined_average_gain(user_id, period_type, custom_start_date, custom_end_date),
            "average_loss": await self.get_combined_average_loss(user_id, period_type, custom_start_date, custom_end_date),
            "risk_reward_ratio": await self.get_combined_risk_reward_ratio(user_id, period_type, custom_start_date, custom_end_date),
            "trade_expectancy": await self.get_combined_trade_expectancy(user_id, period_type, custom_start_date, custom_end_date),
            "net_pnl": await self.get_stock_net_pnl(user_id, period_type, custom_start_date, custom_end_date) + 
                      await self.get_option_net_pnl(user_id, period_type, custom_start_date, custom_end_date),
            "profit_factor": await self.get_combined_profit_factor(user_id, period_type, custom_start_date, custom_end_date),
            "avg_hold_time_winners": await self.get_combined_avg_hold_time_winners(user_id, period_type, custom_start_date, custom_end_date),
            "avg_hold_time_losers": await self.get_combined_avg_hold_time_losers(user_id, period_type, custom_start_date, custom_end_date),
            "biggest_winner": await self.get_combined_biggest_winner(user_id, period_type, custom_start_date, custom_end_date),
            "biggest_loser": await self.get_combined_biggest_loser(user_id, period_type, custom_start_date, custom_end_date),
            "period_info": {
                "period_type": period_type,
                "custom_start_date": custom_start_date.isoformat() if custom_start_date else None,
                "custom_end_date": custom_end_date.isoformat() if custom_end_date else None
            }
        }
        
       
    async def get_weekly_trading_metrics(self) -> Dict[str, Any]:
        """Get weekly trading metrics for the current week.
        
        Returns:
            Dict containing weekly trading metrics including total trades, win rate, P&L, etc.
        """
        try:
            # Call the SQL function that returns weekly metrics
            result = self.supabase.rpc("get_weekly_trading_metrics").execute()
            
            if result.data and len(result.data) > 0:
                # Convert date objects to ISO format strings for JSON serialization
                weekly_metrics = result.data[0]
                weekly_metrics["week_start_date"] = weekly_metrics["week_start_date"].isoformat()
                weekly_metrics["week_end_date"] = weekly_metrics["week_end_date"].isoformat()
                return weekly_metrics
            return {}
            
        except Exception as e:
            print(f"Error getting weekly trading metrics: {str(e)}")
            return {}
            
    async def get_monthly_trading_metrics(self) -> Dict[str, Any]:
        """Get monthly trading metrics for the current month.
        
        Returns:
            Dict containing monthly trading metrics including total trades, win rate, P&L, etc.
        """
        try:
            # Call the SQL function that returns monthly metrics
            result = self.supabase.rpc("get_monthly_trading_metrics").execute()
            
            if result.data and len(result.data) > 0:
                # Convert date objects to ISO format strings for JSON serialization
                monthly_metrics = result.data[0]
                monthly_metrics["month_start_date"] = monthly_metrics["month_start_date"].isoformat()
                monthly_metrics["month_end_date"] = monthly_metrics["month_end_date"].isoformat()
                return monthly_metrics
            return {}
            
        except Exception as e:
            print(f"Error getting monthly trading metrics: {str(e)}")
            return {}