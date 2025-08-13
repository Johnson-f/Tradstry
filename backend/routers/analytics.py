from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Dict, Any, Optional, List
from datetime import datetime
from services.analytics_service import AnalyticsService
from services.user_service import UserService
from models.analytics import (
    PeriodType,
    StockAnalytics,
    OptionAnalytics,
    PortfolioAnalytics,
    CombinedAnalytics,
    DailyPnLTrade,
    TickerProfitSummary
)

# Initialize services
analytics_service = AnalyticsService()
user_service = UserService()

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Helper function to parse date range parameters
def get_date_range_params(
    period_type: Optional[PeriodType] = Query(default=PeriodType.ALL_TIME, description="Period type for analysis"),
    custom_start_date: Optional[datetime] = Query(default=None, description="Start date for custom period (ISO format)"),
    custom_end_date: Optional[datetime] = Query(default=None, description="End date for custom period (ISO format)")
) -> Dict[str, Any]:
    """Helper to extract and validate date range parameters."""

    # Validate custom period requirements
    if period_type == PeriodType.CUSTOM and custom_start_date is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="custom_start_date is required when period_type is 'custom'"
        )

    # Validate date order
    if custom_start_date and custom_end_date and custom_end_date <= custom_start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="custom_end_date must be after custom_start_date"
        )

    # Validate start date is not in future
    if custom_start_date and custom_start_date > datetime.now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="custom_start_date cannot be in the future"
        )

    return {
        "period_type": period_type.value if period_type else "all_time",
        "custom_start_date": custom_start_date,
        "custom_end_date": custom_end_date
    }

# Stock Analytics Endpoints
@router.get("/stocks/win-rate", response_model=float)
async def get_stock_win_rate(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the win rate for stock trades with optional date range filtering.
    Returns the win rate as a percentage (0-100).
    """
    return await analytics_service.get_stock_win_rate(
        current_user["id"],
        **date_params
    )

@router.get("/stocks/average-gain", response_model=float)
async def get_stock_average_gain(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the average gain for winning stock trades with optional date range filtering.
    Returns the average gain in the account's currency.
    """
    return await analytics_service.get_stock_average_gain(
        current_user["id"],
        **date_params
    )

@router.get("/stocks/average-loss", response_model=float)
async def get_stock_average_loss(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the average loss for losing stock trades with optional date range filtering.
    Returns the average loss as a positive number in the account's currency.
    """
    return await analytics_service.get_stock_average_loss(
        current_user["id"],
        **date_params
    )

@router.get("/stocks/risk-reward-ratio", response_model=float)
async def get_stock_risk_reward_ratio(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the risk/reward ratio for stock trades with optional date range filtering.
    Returns a ratio where values < 1.0 indicate a favorable risk/reward profile.
    """
    return await analytics_service.get_stock_risk_reward_ratio(
        current_user["id"],
        **date_params
    )

@router.get("/stocks/trade-expectancy", response_model=float)
async def get_stock_trade_expectancy(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the trade expectancy for stock trades with optional date range filtering.
    Returns the expected value per trade in the account's currency.
    """
    return await analytics_service.get_stock_trade_expectancy(
        current_user["id"],
        **date_params
    )

@router.get("/stocks/net-pnl", response_model=float)
async def get_stock_net_pnl(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the net profit/loss for all stock trades with optional date range filtering.
    Returns the total P&L in the account's currency.
    """
    return await analytics_service.get_stock_net_pnl(
        current_user["id"],
        **date_params
    )

@router.get("/stocks/profit-factor", response_model=float)
async def get_stock_profit_factor(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the profit factor for stock trades with optional date range filtering.
    Returns the ratio of gross profit to gross loss.
    """
    return await analytics_service.get_stock_profit_factor(
        current_user["id"],
        **date_params
    )

@router.get("/stocks/avg-hold-time-winners", response_model=float)
async def get_stock_avg_hold_time_winners(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the average hold time for winning stock trades with optional date range filtering.
    Returns the average hold time in days.
    """
    return await analytics_service.get_stock_avg_hold_time_winners(
        current_user["id"],
        **date_params
    )

@router.get("/stocks/avg-hold-time-losers", response_model=float)
async def get_stock_avg_hold_time_losers(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the average hold time for losing stock trades with optional date range filtering.
    Returns the average hold time in days.
    """
    return await analytics_service.get_stock_avg_hold_time_losers(
        current_user["id"],
        **date_params
    )

@router.get("/stocks/biggest-winner", response_model=float)
async def get_stock_biggest_winner(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the biggest winning trade profit for stocks with optional date range filtering.
    Returns the profit amount of the biggest winning trade.
    """
    return await analytics_service.get_stock_biggest_winner(
        current_user["id"],
        **date_params
    )

@router.get("/stocks/biggest-loser", response_model=float)
async def get_stock_biggest_loser(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the biggest losing trade loss for stocks with optional date range filtering.
    Returns the loss amount of the biggest losing trade as a positive number.
    """
    return await analytics_service.get_stock_biggest_loser(
        current_user["id"],
        **date_params
    )

# Options Analytics Endpoints
@router.get("/options/win-rate", response_model=float)
async def get_option_win_rate(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the win rate for option trades with optional date range filtering.
    Returns the win rate as a percentage (0-100).
    """
    return await analytics_service.get_option_win_rate(
        current_user["id"],
        **date_params
    )

@router.get("/options/average-gain", response_model=float)
async def get_option_average_gain(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the average gain for winning option trades with optional date range filtering.
    Returns the average gain in the account's currency.
    """
    return await analytics_service.get_option_average_gain(
        current_user["id"],
        **date_params
    )

@router.get("/options/average-loss", response_model=float)
async def get_option_average_loss(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the average loss for losing option trades with optional date range filtering.
    Returns the average loss as a positive number in the account's currency.
    """
    return await analytics_service.get_option_average_loss(
        current_user["id"],
        **date_params
    )

@router.get("/options/risk-reward-ratio", response_model=float)
async def get_option_risk_reward_ratio(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the risk/reward ratio for option trades with optional date range filtering.
    Returns a ratio where values < 1.0 indicate a favorable risk/reward profile.
    """
    return await analytics_service.get_option_risk_reward_ratio(
        current_user["id"],
        **date_params
    )

@router.get("/options/trade-expectancy", response_model=float)
async def get_option_trade_expectancy(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the trade expectancy for option trades with optional date range filtering.
    Returns the expected value per trade in the account's currency.
    """
    return await analytics_service.get_option_trade_expectancy(
        current_user["id"],
        **date_params
    )

@router.get("/options/net-pnl", response_model=float)
async def get_option_net_pnl(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the net profit/loss for all option trades with optional date range filtering.
    Returns the total P&L in the account's currency.
    """
    return await analytics_service.get_option_net_pnl(
        current_user["id"],
        **date_params
    )

@router.get("/options/profit-factor", response_model=float)
async def get_option_profit_factor(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the profit factor for option trades with optional date range filtering.
    Returns the ratio of gross profit to gross loss.
    """
    return await analytics_service.get_option_profit_factor(
        current_user["id"],
        **date_params
    )

@router.get("/options/avg-hold-time-winners", response_model=float)
async def get_option_avg_hold_time_winners(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the average hold time for winning option trades with optional date range filtering.
    Returns the average hold time in days.
    """
    return await analytics_service.get_option_avg_hold_time_winners(
        current_user["id"],
        **date_params
    )

@router.get("/options/avg-hold-time-losers", response_model=float)
async def get_option_avg_hold_time_losers(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the average hold time for losing option trades with optional date range filtering.
    Returns the average hold time in days.
    """
    return await analytics_service.get_option_avg_hold_time_losers(
        current_user["id"],
        **date_params
    )

@router.get("/options/biggest-winner", response_model=float)
async def get_option_biggest_winner(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the biggest winning trade profit for options with optional date range filtering.
    Returns the profit amount of the biggest winning trade.
    """
    return await analytics_service.get_option_biggest_winner(
        current_user["id"],
        **date_params
    )

@router.get("/options/biggest-loser", response_model=float)
async def get_option_biggest_loser(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get the biggest losing trade loss for options with optional date range filtering.
    Returns the loss amount of the biggest losing trade as a positive number.
    """
    return await analytics_service.get_option_biggest_loser(
        current_user["id"],
        **date_params
    )

# Portfolio Analytics Endpoint
@router.get("/portfolio", response_model=PortfolioAnalytics)
async def get_portfolio_analytics(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get comprehensive analytics for the user's entire portfolio with optional date range filtering.
    Returns detailed metrics for both stocks and options within the specified time period.
    """
    return await analytics_service.get_portfolio_analytics(
        current_user["id"],
        **date_params
    )

# Combined Portfolio Analytics Endpoint
@router.get("/portfolio/combined", response_model=CombinedAnalytics)
async def get_combined_portfolio_analytics(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get combined portfolio analytics (stocks + options together) with optional date range filtering.
    Returns metrics calculated across all trades regardless of type.
    """
    return await analytics_service.get_combined_portfolio_analytics(
        current_user["id"],
        **date_params
    )

# Special Analytics Endpoints
@router.get("/daily-pnl-trades", response_model=List[DailyPnLTrade])
async def get_daily_pnl_trades(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get daily P&L and trade counts with optional date range filtering.
    Returns daily breakdown of portfolio performance.
    """
    return await analytics_service.get_daily_pnl_trades(
        current_user["id"],
        **date_params
    )

@router.get("/ticker-profit-summary", response_model=List[TickerProfitSummary])
async def get_ticker_profit_summary(
    date_params: Dict[str, Any] = Depends(get_date_range_params),
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get profit summary by ticker with optional date range filtering.
    Returns performance breakdown by individual symbols.
    """
    return await analytics_service.get_ticker_profit_summary(
        current_user["id"],
        **date_params
    )

# Convenience endpoints for common periods
@router.get("/stocks/summary/{period_type}", response_model=StockAnalytics)
async def get_stock_summary(
    period_type: PeriodType,
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get a summary of all stock analytics for a specific period.
    Convenience endpoint that returns all stock metrics in one call.
    """
    user_id = current_user["id"]
    return StockAnalytics(
        win_rate=await analytics_service.get_stock_win_rate(user_id, period_type.value),
        average_gain=await analytics_service.get_stock_average_gain(user_id, period_type.value),
        average_loss=await analytics_service.get_stock_average_loss(user_id, period_type.value),
        risk_reward_ratio=await analytics_service.get_stock_risk_reward_ratio(user_id, period_type.value),
        trade_expectancy=await analytics_service.get_stock_trade_expectancy(user_id, period_type.value),
        net_pnl=await analytics_service.get_stock_net_pnl(user_id, period_type.value),
        profit_factor=await analytics_service.get_stock_profit_factor(user_id, period_type.value),
        avg_hold_time_winners=await analytics_service.get_stock_avg_hold_time_winners(user_id, period_type.value),
        avg_hold_time_losers=await analytics_service.get_stock_avg_hold_time_losers(user_id, period_type.value),
        biggest_winner=await analytics_service.get_stock_biggest_winner(user_id, period_type.value),
        biggest_loser=await analytics_service.get_stock_biggest_loser(user_id, period_type.value)
    )

@router.get("/options/summary/{period_type}", response_model=OptionAnalytics)
async def get_option_summary(
    period_type: PeriodType,
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get a summary of all option analytics for a specific period.
    Convenience endpoint that returns all option metrics in one call.
    """
    user_id = current_user["id"]
    return OptionAnalytics(
        win_rate=await analytics_service.get_option_win_rate(user_id, period_type.value),
        average_gain=await analytics_service.get_option_average_gain(user_id, period_type.value),
        average_loss=await analytics_service.get_option_average_loss(user_id, period_type.value),
        risk_reward_ratio=await analytics_service.get_option_risk_reward_ratio(user_id, period_type.value),
        trade_expectancy=await analytics_service.get_option_trade_expectancy(user_id, period_type.value),
        net_pnl=await analytics_service.get_option_net_pnl(user_id, period_type.value),
        profit_factor=await analytics_service.get_option_profit_factor(user_id, period_type.value),
        avg_hold_time_winners=await analytics_service.get_option_avg_hold_time_winners(user_id, period_type.value),
        avg_hold_time_losers=await analytics_service.get_option_avg_hold_time_losers(user_id, period_type.value),
        biggest_winner=await analytics_service.get_option_biggest_winner(user_id, period_type.value),
        biggest_loser=await analytics_service.get_option_biggest_loser(user_id, period_type.value)
    )

@router.get("/portfolio/combined/summary/{period_type}", response_model=CombinedAnalytics)
async def get_combined_portfolio_summary(
    period_type: PeriodType,
    current_user: dict = Depends(user_service.get_current_user)
):
    """
    Get a summary of all combined portfolio analytics for a specific period.
    Convenience endpoint that returns all combined metrics in one call.
    """
    user_id = current_user["id"]
    return await analytics_service.get_combined_portfolio_analytics(user_id, period_type.value)
