from pydantic import BaseModel, Field, model_validator
from datetime import datetime
from typing import Optional
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

class OptionAnalytics(BaseModel):
    """Model for option trading analytics."""
    win_rate: float = Field(description="Win rate as a percentage (0-100)")
    average_gain: float = Field(description="Average gain for winning trades")
    average_loss: float = Field(description="Average loss for losing trades (as positive number)")
    risk_reward_ratio: float = Field(description="Risk to reward ratio")
    trade_expectancy: float = Field(description="Expected value per trade")
    net_pnl: float = Field(description="Net profit/loss")

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