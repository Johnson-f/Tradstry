from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, List, Literal, Dict, Any

# Define the category enum to match the database
SetupCategory = Literal['Breakout', 'Pullback', 'Reversal', 'Continuation', 'Range', 'Other']

class SetupBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    category: SetupCategory
    is_active: bool = True
    tags: List[str] = Field(default_factory=list)
    setup_conditions: Dict[str, Any] = Field(default_factory=dict)

class SetupCreate(SetupBase):
    pass

class SetupUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    category: Optional[SetupCategory] = None
    is_active: Optional[bool] = None
    tags: Optional[List[str]] = None
    setup_conditions: Optional[Dict[str, Any]] = None

class SetupInDB(SetupBase):
    id: int
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TradeSetupBase(BaseModel):
    setup_id: int
    stock_id: Optional[int] = None
    option_id: Optional[int] = None
    confidence_rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None

    @validator('stock_id', 'option_id')
    def check_trade_type(cls, v, values, **kwargs):
        if 'stock_id' in values and 'option_id' in values and values['stock_id'] is not None and values['option_id'] is not None:
            raise ValueError("Only one of stock_id or option_id can be set")
        if 'stock_id' not in values and 'option_id' not in values:
            raise ValueError("Either stock_id or option_id must be set")
        return v

class TradeSetupCreate(TradeSetupBase):
    pass

class TradeSetupUpdate(BaseModel):
    confidence_rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None

class TradeSetupInDB(TradeSetupBase):
    id: int
    user_id: str
    created_at: datetime

    class Config:
        from_attributes = True
