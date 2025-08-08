from fastapi import APIRouter, Depends, HTTPException, status, Header
from typing import List, Optional, Dict, Any
from datetime import datetime
from models.stocks import StockCreate, StockUpdate, StockInDB
from services.stock_service import StockService
from services.user_service import UserService
from utils.auth import get_user_with_retry, get_user_with_token_retry

# Initialize services
stock_service = StockService()
user_service = UserService()

def get_current_user_with_token(authorization: str = Header(...)) -> Dict[str, Any]:
    """Dependency to get current user from Supabase JWT with token"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ")[1]
    return get_user_with_token_retry(user_service.supabase, token)

def get_current_user(authorization: str = Header(...)) -> Dict[str, Any]:
    """Dependency to get current user from Supabase JWT"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ")[1]
    return get_user_with_retry(user_service.supabase, token)

router = APIRouter(prefix="/stocks", tags=["stocks"])

@router.post("/", response_model=StockInDB, status_code=status.HTTP_201_CREATED)
async def create_stock(stock: StockCreate, current_user: dict = Depends(get_current_user_with_token)):
    """
    Create a new stock trade.
    """
    return await stock_service.create(stock, str(current_user["id"]), current_user["access_token"])

@router.get("/", response_model=List[StockInDB])
async def get_stocks(
    status: Optional[str] = None,
    symbol: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user_with_token)  # Use the version that includes token
):
    """
    Get all stock trades with optional filtering.
    """
    user_id = str(current_user["id"])
    access_token = current_user.get("access_token")  # Get token from user object
    
    # Debug logging
    print(f"DEBUG: Fetching trades for user_id: {user_id}")
    print(f"DEBUG: Has access token: {access_token is not None}")
    
    if status == 'open':
        trades = await stock_service.get_open_positions(user_id, access_token)
    elif status == 'closed':
        trades = await stock_service.get_closed_positions(user_id, access_token)
    elif symbol:
        trades = await stock_service.get_positions_by_symbol(symbol, user_id, access_token)
    elif start_date and end_date:
        trades = await stock_service.get_positions_by_date_range(
            start_date.isoformat(),
            end_date.isoformat(),
            user_id,
            access_token
        )
    else:
        trades = await stock_service.get_all(user_id, access_token)
    
    # Debug logging
    print(f"DEBUG: Found {len(trades) if trades else 0} trades")
    if trades:
        print(f"DEBUG: First trade: {trades[0]}")
    
    return trades or []

@router.get("/{stock_id}", response_model=StockInDB)
async def get_stock(stock_id: int, current_user: dict = Depends(get_current_user)):
    """
    Get a specific stock trade by ID.
    """
    stock = await stock_service.get_by_id(stock_id, str(current_user["id"]))
    if not stock:
        raise HTTPException(status_code=404, detail="Stock trade not found")
    return stock

@router.put("/{stock_id}", response_model=StockInDB)
async def update_stock(
    stock_id: int,
    stock_update: StockUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update a stock trade.
    """
    updated_stock = await stock_service.update(stock_id, stock_update, str(current_user["id"]))
    if not updated_stock:
        raise HTTPException(status_code=404, detail="Stock trade not found")
    return updated_stock

@router.delete("/{stock_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stock(stock_id: int, current_user: dict = Depends(get_current_user)):
    """
    Delete a stock trade.
    """
    success = await stock_service.delete(stock_id, str(current_user["id"]))
    if not success:
        raise HTTPException(status_code=404, detail="Stock trade not found")
    return None