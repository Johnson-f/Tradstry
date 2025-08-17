from pydantic import BaseModel, Field, model_validator
from datetime import datetime
from typing import Optional, List
from enum import Enum

class PeriodType(str, Enum):
    """Enumeration for supported period types."""
    SEVEN_DAYS = "7d"
    THIRTY_DAYS = "30d"
    NINETY_DAYS = "90d"
    ONE_YEAR = "1y"
    ALL_TIME = "all_time"
    CUSTOM = "custom"

class DateRangeFilter(BaseModel):
    """Model for date range filtering parameters."""
    period_type: PeriodType = Field(default=PeriodType.ALL_TIME, description="The predefined period type")
    custom_start_date: Optional[datetime] = Field(default=None, description="Custom start date (required when period_type is 'custom')")
    custom_end_date: Optional[datetime] = Field(default=None, description="Custom end date (optional when period_type is 'custom')")

    @model_validator(mode='after')
    def validate_custom_dates(self):
        """Validate custom date requirements and constraints."""
        period_type = self.period_type
        custom_start_date = self.custom_start_date
        custom_end_date = self.custom_end_date

        # Validate custom start date is required for custom period
        if period_type == PeriodType.CUSTOM and custom_start_date is None:
            raise ValueError("custom_start_date is required when period_type is 'custom'")

        # Validate start date is not in future
        if custom_start_date is not None and custom_start_date > datetime.now():
            raise ValueError("custom_start_date cannot be in the future")

        # Validate date order
        if custom_start_date is not None and custom_end_date is not None:
            if custom_end_date <= custom_start_date:
                raise ValueError("custom_end_date must be after custom_start_date")

        return self

class StockAnalytics(BaseModel):
    """Model for stock trading analytics."""
    win_rate: float = Field(description="Win rate as a percentage (0-100)")
    average_gain: float = Field(description="Average gain for winning trades")
    average_loss: float = Field(description="Average loss for losing trades (as positive number)")
    risk_reward_ratio: float = Field(description="Risk to reward ratio")
    trade_expectancy: float = Field(description="Expected value per trade")
    net_pnl: float = Field(description="Net profit/loss")
    profit_factor: float = Field(description="Profit factor (gross profit / gross loss)")
    avg_hold_time_winners: float = Field(description="Average hold time for winning trades in days")
    avg_hold_time_losers: float = Field(description="Average hold time for losing trades in days")
    biggest_winner: float = Field(description="Biggest winning trade profit")
    biggest_loser: float = Field(description="Biggest losing trade loss (as positive number)")
    average_position_size: float = Field(description="Average position size (entry_price * number_shares)")
    average_risk_per_trade: float = Field(description="Average risk amount per trade")
    loss_rate: float = Field(description="Loss rate as a percentage (0-100)")

class OptionAnalytics(BaseModel):
    """Model for option trading analytics."""
    win_rate: float = Field(description="Win rate as a percentage (0-100)")
    average_gain: float = Field(description="Average gain for winning trades")
    average_loss: float = Field(description="Average loss for losing trades (as positive number)")
    risk_reward_ratio: float = Field(description="Risk to reward ratio")
    trade_expectancy: float = Field(description="Expected value per trade")
    net_pnl: float = Field(description="Net profit/loss")
    profit_factor: float = Field(description="Profit factor (gross profit / gross loss)")
    avg_hold_time_winners: float = Field(description="Average hold time for winning trades in days")
    avg_hold_time_losers: float = Field(description="Average hold time for losing trades in days")
    biggest_winner: float = Field(description="Biggest winning trade profit")
    biggest_loser: float = Field(description="Biggest losing trade loss (as positive number)")
    average_position_size: float = Field(description="Average position size (premium * number_contracts * 100)")
    average_risk_per_trade: float = Field(description="Average risk amount per trade")
    loss_rate: float = Field(description="Loss rate as a percentage (0-100)")

class PeriodInfo(BaseModel):
    """Model for period information."""
    period_type: str = Field(description="The period type used for the analysis")
    custom_start_date: Optional[str] = Field(default=None, description="Custom start date in ISO format")
    custom_end_date: Optional[str] = Field(default=None, description="Custom end date in ISO format")

class PortfolioAnalytics(BaseModel):
    """Model for comprehensive portfolio analytics."""
    stocks: StockAnalytics = Field(description="Stock trading analytics")
    options: OptionAnalytics = Field(description="Option trading analytics")
    period_info: PeriodInfo = Field(description="Information about the analysis period")

class CombinedAnalytics(BaseModel):
    """Model for combined portfolio analytics (stocks + options together)."""
    win_rate: float = Field(description="Combined win rate as a percentage (0-100)")
    average_gain: float = Field(description="Combined average gain for winning trades")
    average_loss: float = Field(description="Combined average loss for losing trades (as positive number)")
    risk_reward_ratio: float = Field(description="Combined risk to reward ratio")
    trade_expectancy: float = Field(description="Combined expected value per trade")
    net_pnl: float = Field(description="Combined net profit/loss")
    profit_factor: float = Field(description="Combined profit factor (gross profit / gross loss)")
    avg_hold_time_winners: float = Field(description="Combined average hold time for winning trades in days")
    avg_hold_time_losers: float = Field(description="Combined average hold time for losing trades in days")
    biggest_winner: float = Field(description="Combined biggest winning trade profit")
    biggest_loser: float = Field(description="Combined biggest losing trade loss (as positive number)")
    average_position_size: float = Field(description="Combined average position size")
    average_risk_per_trade: float = Field(description="Combined average risk amount per trade")
    loss_rate: float = Field(description="Combined loss rate as a percentage (0-100)")

class DailyPnLTrade(BaseModel):
    """Model for daily P&L and trade count data."""
    trade_date: str = Field(description="Trade date in YYYY-MM-DD format")
    total_pnl: float = Field(description="Total P&L for the day")
    total_trades: int = Field(description="Total number of trades for the day")
    stock_trades: int = Field(description="Number of stock trades for the day")
    option_trades: int = Field(description="Number of option trades for the day")

class TickerProfitSummary(BaseModel):
    """Model for ticker profit summary data."""
    symbol: str = Field(description="Stock or option symbol")
    total_profit: float = Field(description="Total profit from trades")
    stock_trades: int = Field(description="Number of stock trades")
    option_trades: int = Field(description="Number of option trades")
    total_trades: int = Field(description="Total number of trades")

class WeeklyTradingMetrics(BaseModel):
    """Model for weekly trading metrics."""
    week_start_date: str = Field(description="Start date of the week (YYYY-MM-DD)")
    week_end_date: str = Field(description="End date of the week (YYYY-MM-DD)")
    total_trades: int = Field(description="Total number of trades for the week")
    profitable_trades: int = Field(description="Number of profitable trades")
    unprofitable_trades: int = Field(description="Number of unprofitable trades")
    win_rate: float = Field(description="Win rate as a percentage (0-100)")
    net_pnl: float = Field(description="Net profit/loss for the week")
    profit_factor: float = Field(description="Profit factor (gross profit / gross loss)")
    max_drawdown: float = Field(description="Maximum drawdown during the week")
    expectancy_per_trade: float = Field(description="Average profit per trade")

class MonthlyTradingMetrics(BaseModel):
    """Model for monthly trading metrics."""
    month_start_date: str = Field(description="Start date of the month (YYYY-MM-DD)")
    month_end_date: str = Field(description="End date of the month (YYYY-MM-DD)")
    total_trades: int = Field(description="Total number of trades for the month")
    profitable_trades: int = Field(description="Number of profitable trades")
    unprofitable_trades: int = Field(description="Number of unprofitable trades")
    win_rate: float = Field(description="Win rate as a percentage (0-100)")
    net_pnl: float = Field(description="Net profit/loss for the month")
    profit_factor: float = Field(description="Profit factor (gross profit / gross loss)")
    max_drawdown: float = Field(description="Maximum drawdown during the month")
    expectancy_per_trade: float = Field(description="Average profit per trade")

class AnalyticsQuery(BaseModel):
    """Model for analytics query parameters."""
    period_type: Optional[PeriodType] = Field(default=PeriodType.ALL_TIME, description="Period type for analysis")
    custom_start_date: Optional[datetime] = Field(default=None, description="Start date for custom period")
    custom_end_date: Optional[datetime] = Field(default=None, description="End date for custom period")

    class Config:
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }