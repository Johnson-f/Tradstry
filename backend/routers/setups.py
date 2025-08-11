from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from uuid import UUID
from fastapi.security import HTTPAuthorizationCredentials

from models.setups import (
    SetupCreate, SetupInDB, SetupUpdate,
    TradeSetupCreate, TradeSetupInDB, TradeSetupUpdate
)
from services.setup_service import SetupService, TradeSetupService
from services.user_service import UserService

# Create UserService instance and define get_current_user function
user_service = UserService()

async def get_current_user(credentials: HTTPAuthorizationCredentials = None) -> dict:
    """Standalone function wrapper for UserService.get_current_user"""
    return await user_service.get_current_user(credentials)

router = APIRouter(prefix="/api/setups", tags=["setups"])

# Setup Routes
@router.post("/", response_model=SetupInDB, status_code=status.HTTP_201_CREATED)
async def create_setup(
    setup: SetupCreate,
    current_user: dict = Depends(get_current_user),
    setup_service: SetupService = Depends(SetupService)
):
    """Create a new trading setup."""
    return await setup_service.create(setup.dict(), current_user["id"])

@router.get("/", response_model=List[SetupInDB])
async def get_setups(
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
    setup_service: SetupService = Depends(SetupService)
):
    """Get all trading setups, optionally filtered by category and active status."""
    if category and is_active is not None:
        return await setup_service.query(
            {
                "category": {"operator": "eq", "value": category},
                "is_active": {"operator": "eq", "value": is_active}
            },
            current_user["id"]
        )
    elif category:
        return await setup_service.get_setups_by_category(category, current_user["id"])
    elif is_active is not None:
        return await setup_service.get_active_setups(current_user["id"])
    return await setup_service.query({}, current_user["id"])

@router.get("/{setup_id}", response_model=SetupInDB)
async def get_setup(
    setup_id: int,
    current_user: dict = Depends(get_current_user),
    setup_service: SetupService = Depends(SetupService)
):
    """Get a specific trading setup by ID."""
    setup = await setup_service.get(setup_id, current_user["id"])
    if not setup:
        raise HTTPException(status_code=404, detail="Setup not found")
    return setup

@router.put("/{setup_id}", response_model=SetupInDB)
async def update_setup(
    setup_id: int,
    setup_update: SetupUpdate,
    current_user: dict = Depends(get_current_user),
    setup_service: SetupService = Depends(SetupService)
):
    """Update a trading setup."""
    updated = await setup_service.update(setup_id, setup_update.dict(exclude_unset=True), current_user["id"])
    if not updated:
        raise HTTPException(status_code=404, detail="Setup not found")
    return updated

@router.delete("/{setup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_setup(
    setup_id: int,
    current_user: dict = Depends(get_current_user),
    setup_service: SetupService = Depends(SetupService)
):
    """Delete a trading setup."""
    success = await setup_service.delete(setup_id, current_user["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Setup not found")
    return None

# Trade Setup Routes
@router.post("/trades", response_model=TradeSetupInDB, status_code=status.HTTP_201_CREATED)
async def create_trade_setup(
    trade_setup: TradeSetupCreate,
    current_user: dict = Depends(get_current_user),
    trade_setup_service: TradeSetupService = Depends(TradeSetupService)
):
    """Associate a trade with a setup."""
    return await trade_setup_service.create(trade_setup.dict(), current_user["id"])

@router.get("/trades/{trade_setup_id}", response_model=TradeSetupInDB)
async def get_trade_setup(
    trade_setup_id: int,
    current_user: dict = Depends(get_current_user),
    trade_setup_service: TradeSetupService = Depends(TradeSetupService)
):
    """Get a specific trade-setup association."""
    trade_setup = await trade_setup_service.get(trade_setup_id, current_user["id"])
    if not trade_setup:
        raise HTTPException(status_code=404, detail="Trade setup not found")
    return trade_setup

@router.get("/{setup_id}/trades", response_model=List[TradeSetupInDB])
async def get_trades_for_setup(
    setup_id: int,
    current_user: dict = Depends(get_current_user),
    setup_service: SetupService = Depends(SetupService)
):
    """Get all trades associated with a specific setup."""
    return await setup_service.get_trades_for_setup(setup_id, current_user["id"])

@router.put("/trades/{trade_setup_id}", response_model=TradeSetupInDB)
async def update_trade_setup(
    trade_setup_id: int,
    trade_setup_update: TradeSetupUpdate,
    current_user: dict = Depends(get_current_user),
    trade_setup_service: TradeSetupService = Depends(TradeSetupService)
):
    """Update a trade-setup association."""
    updated = await trade_setup_service.update(
        trade_setup_id, 
        trade_setup_update.dict(exclude_unset=True), 
        current_user["id"]
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Trade setup not found")
    return updated

@router.delete("/trades/{trade_setup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trade_setup(
    trade_setup_id: int,
    current_user: dict = Depends(get_current_user),
    trade_setup_service: TradeSetupService = Depends(TradeSetupService)
):
    """Remove a trade from a setup."""
    success = await trade_setup_service.delete(trade_setup_id, current_user["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Trade setup not found")
    return None

# Analytics Routes
@router.get("/{setup_id}/analytics")
async def get_setup_analytics(
    setup_id: int,
    current_user: dict = Depends(get_current_user),
    trade_setup_service: TradeSetupService = Depends(TradeSetupService)
):
    """Get analytics for a specific setup."""
    return await trade_setup_service.get_analytics(setup_id, current_user["id"])

@router.get("/trades/grouped-by-setup")
async def get_trades_grouped_by_setup(
    current_user: dict = Depends(get_current_user),
    trade_setup_service: TradeSetupService = Depends(TradeSetupService)
):
    """Get all trades grouped by setup."""
    return await trade_setup_service.get_trades_grouped_by_setup(current_user["id"])