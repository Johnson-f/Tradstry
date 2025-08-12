from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from models.setups import (
    SetupCreate, SetupUpdate, SetupInDB, TradeSetupCreate, 
    TradeSetupInDB, SetupAnalytics, TradeBySetup, SetupSummary, SetupCategory
)
from services.setup_service import SetupService
from services.user_service import UserService
from database import get_supabase

router = APIRouter(prefix="/setups", tags=["setups"])

# Initialize services
setup_service = SetupService()
user_service = UserService()

# Security scheme
oauth2_scheme = HTTPBearer(auto_error=False)

def get_current_user_and_token(authorization: str = Depends(oauth2_scheme)) -> tuple[dict, str]:
    """Get current user and access token from authorization header."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required"
        )
    
    token = authorization.credentials
    user = user_service.get_current_user_from_token(token)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    return user, token

def get_current_user(authorization: str = Depends(oauth2_scheme)) -> dict:
    """Get current user from authorization header."""
    user, _ = get_current_user_and_token(authorization)
    return user

@router.post("/", response_model=SetupInDB, status_code=status.HTTP_201_CREATED)
async def create_setup(
    setup: SetupCreate,
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Create a new setup."""
    user, token = user_and_token
    
    try:
        created_setup = await setup_service.create_setup(setup, user["id"], token)
        return created_setup
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create setup: {str(e)}"
        )

@router.get("/", response_model=List[SetupInDB])
async def get_setups(
    category: Optional[SetupCategory] = Query(None, description="Filter by setup category"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Get all setups for the current user with optional filtering."""
    user, token = user_and_token
    
    try:
        setups = await setup_service.get_setups(
            user["id"], 
            token, 
            category=category, 
            is_active=is_active
        )
        return setups
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve setups: {str(e)}"
        )

@router.get("/{setup_id}", response_model=SetupInDB)
async def get_setup(
    setup_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific setup by ID."""
    try:
        # Get setups and filter by ID
        setups = await setup_service.get_setups(current_user["id"], None)
        setup = next((s for s in setups if s.id == setup_id), None)
        
        if not setup:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Setup not found"
            )
        
        return setup
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve setup: {str(e)}"
        )

@router.put("/{setup_id}", response_model=SetupInDB)
async def update_setup(
    setup_id: int,
    setup_update: SetupUpdate,
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Update an existing setup."""
    user, token = user_and_token
    
    try:
        # Use the base service update method
        updated_setup = await setup_service.update(setup_id, setup_update, user["id"], token)
        
        if not updated_setup:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Setup not found"
            )
        
        return updated_setup
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update setup: {str(e)}"
        )

@router.delete("/{setup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_setup(
    setup_id: int,
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Delete a setup."""
    user, token = user_and_token
    
    try:
        # Use the base service delete method
        deleted = await setup_service.delete(setup_id, user["id"], token)
        
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Setup not found"
            )
        
        return None
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete setup: {str(e)}"
        )

@router.post("/trades", response_model=int, status_code=status.HTTP_201_CREATED)
async def add_trade_to_setup(
    trade_setup: TradeSetupCreate,
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Add a trade (stock or option) to a setup."""
    user, token = user_and_token
    
    try:
        result = await setup_service.add_trade_to_setup(trade_setup, user["id"], token)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add trade to setup: {str(e)}"
        )

@router.delete("/trades/{trade_type}/{trade_id}/{setup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_trade_from_setup(
    trade_type: str,
    trade_id: int,
    setup_id: int,
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Remove a trade from a setup."""
    user, token = user_and_token
    
    if trade_type not in ["stock", "option"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="trade_type must be 'stock' or 'option'"
        )
    
    try:
        result = await setup_service.remove_trade_from_setup(
            trade_type, trade_id, setup_id, user["id"], token
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Trade not found in setup or access denied"
            )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove trade from setup: {str(e)}"
        )

@router.get("/{setup_id}/trades", response_model=List[TradeBySetup])
async def get_setup_trades(
    setup_id: int,
    status: Optional[str] = Query(None, description="Filter by trade status (open/closed)"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of trades to return"),
    offset: int = Query(0, ge=0, description="Number of trades to skip"),
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Get all trades associated with a specific setup."""
    user, token = user_and_token
    
    try:
        trades = await setup_service.get_trades_by_setup(
            setup_id, user["id"], token, status, limit, offset
        )
        return trades
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve setup trades: {str(e)}"
        )

@router.get("/{setup_id}/analytics", response_model=SetupAnalytics)
async def get_setup_analytics(
    setup_id: int,
    start_date: Optional[str] = Query(None, description="Start date for analytics (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date for analytics (ISO format)"),
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Get analytics for a specific setup."""
    user, token = user_and_token
    
    try:
        analytics = await setup_service.get_setup_analytics(
            setup_id, user["id"], token, start_date, end_date
        )
        return analytics
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve setup analytics: {str(e)}"
        )

@router.get("/summary/all", response_model=List[SetupSummary])
async def get_setup_summaries(
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Get summary information for all setups of the current user."""
    user, token = user_and_token
    
    try:
        summaries = await setup_service.get_setup_summaries(user["id"], token)
        return summaries
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve setup summaries: {str(e)}"
        )

@router.post("/stocks/{stock_id}/setups/{setup_id}", response_model=int, status_code=status.HTTP_201_CREATED)
async def add_setup_to_stock(
    stock_id: int,
    setup_id: int,
    confidence_rating: Optional[int] = Query(None, ge=1, le=5, description="Confidence rating 1-5"),
    notes: Optional[str] = Query(None, description="Additional notes"),
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Add a setup to an existing stock trade."""
    user, token = user_and_token
    
    try:
        result = await setup_service.add_setup_to_stock(
            stock_id, setup_id, user["id"], token, confidence_rating, notes
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add setup to stock: {str(e)}"
        )

@router.post("/options/{option_id}/setups/{setup_id}", response_model=int, status_code=status.HTTP_201_CREATED)
async def add_setup_to_option(
    option_id: int,
    setup_id: int,
    confidence_rating: Optional[int] = Query(None, ge=1, le=5, description="Confidence rating 1-5"),
    notes: Optional[str] = Query(None, description="Additional notes"),
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Add a setup to an existing option trade."""
    user, token = user_and_token
    
    try:
        result = await setup_service.add_setup_to_option(
            option_id, setup_id, user["id"], token, confidence_rating, notes
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add setup to option: {str(e)}"
        )

@router.get("/stocks/{stock_id}/setups", response_model=List[Dict[str, Any]])
async def get_setups_for_stock(
    stock_id: int,
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Get all setups associated with a specific stock trade."""
    user, token = user_and_token
    
    try:
        setups = await setup_service.get_setups_for_stock(stock_id, user["id"], token)
        return setups
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve setups for stock: {str(e)}"
        )

@router.get("/options/{option_id}/setups", response_model=List[Dict[str, Any]])
async def get_setups_for_option(
    option_id: int,
    user_and_token: tuple = Depends(get_current_user_and_token)
):
    """Get all setups associated with a specific option trade."""
    user, token = user_and_token
    
    try:
        setups = await setup_service.get_setups_for_option(option_id, user["id"], token)
        return setups
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve setups for option: {str(e)}"
        )