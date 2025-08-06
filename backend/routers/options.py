from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime
from models.options import OptionCreate, OptionUpdate, OptionInDB
from services.option_service import OptionService
from services.user_service import UserService

# Initialize services
option_service = OptionService()
user_service = UserService()

def get_current_user(authorization: str = Header(...)) -> Dict[str, Any]:
    """Dependency to get current user from Supabase JWT"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ")[1]
    user = user_service.supabase.auth.get_user(token)
    if not user or not user.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"id": user.user.id, "email": user.user.email}

router = APIRouter(prefix="/options", tags=["options"])



@router.post("/", response_model=OptionInDB, status_code=status.HTTP_201_CREATED)
async def create_option(option: OptionCreate, current_user: dict = Depends(UserService().get_current_user)):
    """
    Create a new options trade.
    """
    return await option_service.create(option, str(current_user.id))

@router.get("/", response_model=List[OptionInDB])
async def get_options(
    status: Optional[Literal['open', 'closed']] = None,
    symbol: Optional[str] = None,
    strategy_type: Optional[str] = None,
    option_type: Optional[Literal['Call', 'Put']] = None,
    expiration_date: Optional[datetime] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all options trades with optional filtering.
    """
    if status == 'open':
        return await option_service.get_open_positions(str(current_user.id))
    elif status == 'closed':
        return await option_service.get_closed_positions(str(current_user.id))
    elif symbol:
        return await option_service.get_positions_by_symbol(symbol, str(current_user.id))
    elif strategy_type:
        return await option_service.get_positions_by_strategy(strategy_type, str(current_user.id))
    elif option_type:
        return await option_service.get_positions_by_option_type(option_type, str(current_user.id))
    elif expiration_date:
        return await option_service.get_positions_by_expiration(
            expiration_date.isoformat(), 
            str(current_user.id)
        )
    elif start_date and end_date:
        return await option_service.get_positions_by_date_range(
            start_date.isoformat(), 
            end_date.isoformat(),
            str(current_user.id)
        )
    else:
        return await option_service.get_all(str(current_user.id))

@router.get("/{option_id}", response_model=OptionInDB)
async def get_option(option_id: int, current_user: dict = Depends(UserService().get_current_user)):
    """
    Get a specific options trade by ID.
    """
    option = await option_service.get_by_id(option_id, str(current_user.id))
    if not option:
        raise HTTPException(status_code=404, detail="Options trade not found")
    return option

@router.put("/{option_id}", response_model=OptionInDB)
async def update_option(
    option_id: int, 
    option_update: OptionUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """
    Update an options trade.
    """
    updated_option = await option_service.update(option_id, option_update, str(current_user.id))
    if not updated_option:
        raise HTTPException(status_code=404, detail="Options trade not found")
    return updated_option

@router.delete("/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_option(option_id: int, current_user: dict = Depends(UserService().get_current_user)):
    """
    Delete an options trade.
    """
    success = await option_service.delete(option_id, str(current_user.id))
    if not success:
        raise HTTPException(status_code=404, detail="Options trade not found")
    return None
