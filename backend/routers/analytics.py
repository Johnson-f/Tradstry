from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Dict, Any, Optional
from datetime import datetime
from services.analytics_service import AnalyticsService
from services.user_service import UserService
from models.analytics import (
    PeriodType,
    StockAnalytics,
    OptionAnalytics,
    PortfolioAnalytics
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
        net_pnl=await analytics_service.get_stock_net_pnl(user_id, period_type.value)
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
        net_pnl=await analytics_service.get_option_net_pnl(user_id, period_type.value)
    )
