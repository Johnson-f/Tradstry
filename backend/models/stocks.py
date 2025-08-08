from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, Literal

class StockBase(BaseModel):
    symbol: str
    trade_type: Literal['BUY', 'SELL']
    order_type: Literal['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT']
    entry_price: float = Field(..., gt=0)
    exit_price: Optional[float] = None
    stop_loss: float = Field(..., gt=0)
    commissions: float = Field(0.00, ge=0)
    number_shares: float = Field(..., gt=0)
    take_profit: Optional[float] = None
    entry_date: datetime
    exit_date: Optional[datetime] = None

class StockCreate(StockBase):
    pass

class StockUpdate(BaseModel):
    exit_price: Optional[float] = None
    exit_date: Optional[datetime] = None

class StockInDB(StockBase):
    id: int
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# If you want to keep the additional fields, create separate models for them
class StockExtended(StockBase):
    # Fields that exist in database
    id: int
    user_id: str
    created_at: datetime
    updated_at: datetime
    
    # Additional fields (you'll need to add these to your database)
    notes: Optional[str] = None
    tags: Optional[list[str]] = None
    risk_reward_ratio: Optional[float] = None
    profit_loss: Optional[float] = None
    profit_loss_percentage: Optional[float] = None
    status: Optional[Literal['open', 'closed']] = 'open'
    sector: Optional[str] = None
    exchange: Optional[str] = None

class StockCreateExtended(StockBase):
    # Additional fields for creation
    notes: Optional[str] = None
    tags: Optional[list[str]] = None
    risk_reward_ratio: Optional[float] = None
    profit_loss: Optional[float] = None
    profit_loss_percentage: Optional[float] = None
    status: Optional[Literal['open', 'closed']] = 'open'
    sector: Optional[str] = None
    exchange: Optional[str] = None

class StockUpdateExtended(BaseModel):
    exit_price: Optional[float] = None
    exit_date: Optional[datetime] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[Literal['open', 'closed']] = None
    risk_reward_ratio: Optional[float] = None
    profit_loss: Optional[float] = None
    profit_loss_percentage: Optional[float] = None
    sector: Optional[str] = None
    exchange: Optional[str] = None