from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field
from enum import Enum

class SetupCategory(str, Enum):
    """Enumeration for setup categories."""
    BREAKOUT = "Breakout"
    PULLBACK = "Pullback"
    REVERSAL = "Reversal"
    CONTINUATION = "Continuation"
    RANGE = "Range"
    OTHER = "Other"

class SetupBase(BaseModel):
    """Base model for setups."""
    name: str = Field(..., max_length=100, description="Setup name")
    description: Optional[str] = Field(None, description="Setup description")
    category: SetupCategory = Field(..., description="Setup category")
    is_active: bool = Field(True, description="Whether the setup is active")
    tags: List[str] = Field(default_factory=list, description="Setup tags")
    setup_conditions: dict = Field(default_factory=dict, description="Setup conditions as JSON")

class SetupCreate(SetupBase):
    """Model for creating a new setup."""
    pass

class SetupUpdate(BaseModel):
    """Model for updating an existing setup."""
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    category: Optional[SetupCategory] = None
    is_active: Optional[bool] = None
    tags: Optional[List[str]] = None
    setup_conditions: Optional[dict] = None

class SetupInDB(SetupBase):
    """Model for setup data from database."""
    id: int
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TradeSetupBase(BaseModel):
    """Base model for trade-setup associations."""
    confidence_rating: Optional[int] = Field(None, ge=1, le=5, description="Confidence rating 1-5")
    notes: Optional[str] = Field(None, description="Additional notes")

class TradeSetupCreate(TradeSetupBase):
    """Model for creating a trade-setup association."""
    stock_id: Optional[int] = Field(None, description="Stock ID (mutually exclusive with option_id)")
    option_id: Optional[int] = Field(None, description="Option ID (mutually exclusive with stock_id)")
    setup_id: int = Field(..., description="Setup ID")

    @classmethod
    def validate_mutual_exclusivity(cls, values):
        """Validate that only one of stock_id or option_id is provided."""
        stock_id = values.get('stock_id')
        option_id = values.get('option_id')
        
        if stock_id is not None and option_id is not None:
            raise ValueError("Cannot specify both stock_id and option_id")
        if stock_id is None and option_id is None:
            raise ValueError("Must specify either stock_id or option_id")
        
        return values

class TradeSetupInDB(TradeSetupBase):
    """Model for trade-setup association data from database."""
    id: int
    stock_id: Optional[int]
    option_id: Optional[int]
    setup_id: int
    user_id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class SetupWithTrades(SetupInDB):
    """Model for setup with associated trades."""
    trades: List[TradeSetupInDB] = Field(default_factory=list)

class SetupAnalytics(BaseModel):
    """Model for setup analytics."""
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_profit_loss: float
    avg_profit: float
    avg_loss: float
    profit_factor: float
    max_drawdown: float
    avg_holding_period: Optional[str]  # ISO duration string
    avg_confidence_rating: float
    trade_type_distribution: dict
    symbol_distribution: dict

class TradeBySetup(BaseModel):
    """Model for trades associated with a setup."""
    trade_id: int
    trade_type: str  # 'stock' or 'option'
    symbol: str
    entry_date: datetime
    exit_date: Optional[datetime]
    entry_price: float
    exit_price: Optional[float]
    profit_loss: Optional[float]
    return_pct: Optional[float]
    status: str  # 'open' or 'closed'
    confidence_rating: Optional[int]
    notes: Optional[str]

class SetupSummary(BaseModel):
    """Model for setup summary information."""
    id: int
    name: str
    category: SetupCategory
    is_active: bool
    total_trades: int
    stock_trades: int
    option_trades: int
    closed_trades: int
    winning_trades: int
    losing_trades: int
    avg_profit_loss: float
    avg_win_pct: float
    avg_loss_pct: float
    largest_win: float
    largest_loss: float
    avg_confidence: float
    created_at: datetime 