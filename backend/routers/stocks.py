from fastapi import APIRouter, Depends, HTTPException, status, Header
from typing import List, Optional, Dict, Any
from datetime import datetime
from models.stocks import StockCreate, StockUpdate, StockInDB
from services.stock_service import StockService
from services.user_service import UserService

# Initialize services
stock_service = StockService()
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

router = APIRouter(prefix="/stocks", tags=["stocks"])

# Initialize services
stock_service = StockService()

@router.post("/", response_model=StockInDB, status_code=status.HTTP_201_CREATED)
async def create_stock(stock: StockCreate, current_user: dict = Depends(UserService().get_current_user)):
    """
    Create a new stock trade.
    """
    return await stock_service.create(stock, str(current_user.id))

@router.get("/", response_model=List[StockInDB])
async def get_stocks(
    status: Optional[str] = None,
    symbol: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all stock trades with optional filtering.
    """
    if status == 'open':
        return await stock_service.get_open_positions(str(current_user.id))
    elif status == 'closed':
        return await stock_service.get_closed_positions(str(current_user.id))
    elif symbol:
        return await stock_service.get_positions_by_symbol(symbol, str(current_user.id))
    elif start_date and end_date:
        return await stock_service.get_positions_by_date_range(
            start_date.isoformat(), 
            end_date.isoformat(),
            str(current_user.id)
        )
    else:
        return await stock_service.get_all(str(current_user.id))

@router.get("/{stock_id}", response_model=StockInDB)
async def get_stock(stock_id: int, current_user: dict = Depends(UserService().get_current_user)):
    """
    Get a specific stock trade by ID.
    """
    stock = await stock_service.get_by_id(stock_id, str(current_user.id))
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
    updated_stock = await stock_service.update(stock_id, stock_update, str(current_user.id))
    if not updated_stock:
        raise HTTPException(status_code=404, detail="Stock trade not found")
    return updated_stock

@router.delete("/{stock_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stock(stock_id: int, current_user: dict = Depends(UserService().get_current_user)):
    """
    Delete a stock trade.
    """
    success = await stock_service.delete(stock_id, str(current_user.id))
    if not success:
        raise HTTPException(status_code=404, detail="Stock trade not found")
    return None
