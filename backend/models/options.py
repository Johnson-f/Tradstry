from pydantic import BaseModel, Field, validator, ConfigDict
from datetime import datetime
from typing import Optional, Literal

class OptionBase(BaseModel):
    symbol: str
    strategy_type: str
    trade_direction: Literal['Bullish', 'Bearish', 'Neutral']
    number_of_contracts: int = Field(..., gt=0)
    option_type: Literal['Call', 'Put']
    strike_price: float = Field(..., gt=0)
    expiration_date: datetime
    entry_price: float = Field(..., gt=0)
    exit_price: Optional[float] = None
    total_premium: float = Field(..., ge=0)
    commissions: float = Field(..., ge=0)
    implied_volatility: float = Field(..., ge=0, le=1000)  # IV as percentage (e.g., 25.5 for 25.5%)
    entry_date: datetime
    exit_date: Optional[datetime] = None
    status: Optional[Literal['open', 'closed']] = 'open'

class OptionCreate(OptionBase):
    pass

class OptionUpdate(BaseModel):
    exit_price: Optional[float] = None
    exit_date: Optional[datetime] = None
    status: Optional[Literal['open', 'closed']] = None

class OptionInDB(OptionBase):
    id: int
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)