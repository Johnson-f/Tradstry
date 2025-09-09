from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from enum import Enum

class TradeNoteType(str, Enum):
    STOCK = 'stock'
    OPTION = 'option'

class TradePhase(str, Enum):
    PLANNING = 'planning'
    EXECUTION = 'execution'
    REFLECTION = 'reflection'

class TradeNoteBase(BaseModel):
    trade_id: int
    trade_type: TradeNoteType
    title: str = Field(..., max_length=255)
    content: str
    tags: Optional[List[str]] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    phase: Optional[TradePhase] = None
    image_id: Optional[int] = None

class TradeNoteCreate(TradeNoteBase):
    pass

class TradeNoteUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    phase: Optional[TradePhase] = None
    image_id: Optional[int] = None

class TradeNoteInDB(TradeNoteBase):
    id: int
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    trade_symbol: Optional[str] = None  # Symbol of the associated trade

    class Config:
        from_attributes = True
