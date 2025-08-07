from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from services.analytics_service import AnalyticsService
from services.user_service import UserService

# Initialize services
analytics_service = AnalyticsService()
user_service = UserService()

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/stocks/win-rate", response_model=float)
async def get_stock_win_rate(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the win rate for stock trades.
    Returns the win rate as a percentage (0-100).
    """
    return await analytics_service.get_stock_win_rate(current_user["id"])

@router.get("/stocks/average-gain", response_model=float)
async def get_stock_average_gain(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the average gain for winning stock trades.
    Returns the average gain in the account's currency.
    """
    return await analytics_service.get_stock_average_gain(current_user["id"])

@router.get("/stocks/average-loss", response_model=float)
async def get_stock_average_loss(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the average loss for losing stock trades.
    Returns the average loss as a positive number in the account's currency.
    """
    return await analytics_service.get_stock_average_loss(current_user["id"])

@router.get("/stocks/risk-reward-ratio", response_model=float)
async def get_stock_risk_reward_ratio(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the risk/reward ratio for stock trades.
    Returns a ratio where values < 1.0 indicate a favorable risk/reward profile.
    """
    return await analytics_service.get_stock_risk_reward_ratio(current_user["id"])

@router.get("/stocks/trade-expectancy", response_model=float)
async def get_stock_trade_expectancy(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the trade expectancy for stock trades.
    Returns the expected value per trade in the account's currency.
    """
    return await analytics_service.get_stock_trade_expectancy(current_user["id"])

@router.get("/stocks/net-pnl", response_model=float)
async def get_stock_net_pnl(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the net profit/loss for all stock trades.
    Returns the total P&L in the account's currency.
    """
    return await analytics_service.get_stock_net_pnl(current_user["id"])

@router.get("/options/win-rate", response_model=float)
async def get_option_win_rate(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the win rate for option trades.
    Returns the win rate as a percentage (0-100).
    """
    return await analytics_service.get_option_win_rate(current_user["id"])

@router.get("/options/average-gain", response_model=float)
async def get_option_average_gain(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the average gain for winning option trades.
    Returns the average gain in the account's currency.
    """
    return await analytics_service.get_option_average_gain(current_user["id"])

@router.get("/options/average-loss", response_model=float)
async def get_option_average_loss(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the average loss for losing option trades.
    Returns the average loss as a positive number in the account's currency.
    """
    return await analytics_service.get_option_average_loss(current_user["id"])

@router.get("/options/risk-reward-ratio", response_model=float)
async def get_option_risk_reward_ratio(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the risk/reward ratio for option trades.
    Returns a ratio where values < 1.0 indicate a favorable risk/reward profile.
    """
    return await analytics_service.get_option_risk_reward_ratio(current_user["id"])

@router.get("/options/trade-expectancy", response_model=float)
async def get_option_trade_expectancy(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the trade expectancy for option trades.
    Returns the expected value per trade in the account's currency.
    """
    return await analytics_service.get_option_trade_expectancy(current_user["id"])

@router.get("/options/net-pnl", response_model=float)
async def get_option_net_pnl(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get the net profit/loss for all option trades.
    Returns the total P&L in the account's currency.
    """
    return await analytics_service.get_option_net_pnl(current_user["id"])

@router.get("/portfolio", response_model=Dict[str, Any])
async def get_portfolio_analytics(current_user: dict = Depends(user_service.get_current_user)):
    """
    Get comprehensive analytics for the user's entire portfolio.
    Returns a detailed object with metrics for both stocks and options.
    """
    return await analytics_service.get_portfolio_analytics(current_user["id"])
