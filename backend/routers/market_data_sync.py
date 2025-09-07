"""Market Data Sync Router - Unified endpoint for synchronizing earnings and fundamental data.
Designed for Supabase Edge Functions and cron job automation.
"""

from fastapi import APIRouter, HTTPException, Header
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field
import logging
from enum import Enum
from supabase import Client

from database import get_supabase, get_supabase_admin_client
from auth_service import AuthService
from config import get_settings
from services.data_sync_service import DataSyncService

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/sync", tags=["Market Data Sync"])


# Enums for operation types
class SyncOperation(str, Enum):
    SINGLE_SYMBOL = "single_symbol"
    MULTIPLE_SYMBOLS = "multiple_symbols"
    MISSING_DATA = "missing_data"
    HEALTH_CHECK = "health_check"
    STATUS_CHECK = "status_check"
    VALIDATE_SYMBOL = "validate_symbol"
    SUPPORTED_SYMBOLS = "supported_symbols"
    SUMMARY_STATS = "summary_stats"

# Unified Request Model
class MarketDataSyncRequest(BaseModel):
    """Unified request model for all market data sync operations"""
    operation: SyncOperation = Field(..., description="Type of sync operation to perform")
    
    # For symbol operations
    symbol: Optional[str] = Field(None, description="Single stock symbol (for single_symbol, validate_symbol)", example="AAPL")
    symbols: Optional[List[str]] = Field(None, description="List of stock symbols (for multiple_symbols, status_check)", example=["AAPL", "MSFT"])
    
    # Optional parameters
    force_refresh: bool = Field(False, description="Force refresh even if data exists")
    max_symbols: int = Field(50, description="Maximum symbols to process (safety limit)")
    
    # For cron job identification
    job_id: Optional[str] = Field(None, description="Optional job identifier for tracking")
    
    class Config:
        use_enum_values = True

# Unified Response Model
class MarketDataSyncResponse(BaseModel):
    """Unified response model for all operations"""
    success: bool
    operation: str
    message: str
    data: Dict[str, Any]
    job_id: Optional[str] = None
    timestamp: str
    execution_time_ms: Optional[int] = None


# JWT dependency function  
async def get_current_user_token(authorization: str = Header(None)):
    """Extract JWT token from Authorization header"""
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ")[1]
    return None

# Service factory function
def get_data_sync_service(token: str = None) -> DataSyncService:
    """Get DataSyncService instance with optional JWT token"""
    return DataSyncService(access_token=token)


@router.post("/execute", response_model=MarketDataSyncResponse)
async def execute_market_data_sync(
    request: MarketDataSyncRequest,
    authorization: str = Header(None)
):
    """
    Unified endpoint for all market data synchronization operations.
    
    **Operations supported:**
    - `single_symbol`: Sync data for one symbol (requires `symbol`)
    - `multiple_symbols`: Sync data for multiple symbols (requires `symbols`)
    - `missing_data`: Sync only missing data (optional `symbols`)
    - `health_check`: Check service health
    - `status_check`: Get sync status (optional `symbols`)
    - `validate_symbol`: Validate a symbol (requires `symbol`)
    - `supported_symbols`: Get list of supported symbols
    - `summary_stats`: Get database statistics
    
    **For Supabase Edge Functions & Cron Jobs:**
    ```json
    {
        "operation": "missing_data",
        "job_id": "daily-sync-001"
    }
    ```
    """
    from datetime import datetime
    import time
    
    start_time = time.time()
    timestamp = datetime.now().isoformat()
    token = None
    
    # Extract token if provided
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    
    try:
        logger.info(f"Executing {request.operation} operation (job_id: {request.job_id})")
        
        service = get_data_sync_service(token)
        result_data = {}
        message = ""
        success = True
        
        # Dispatch based on operation type
        if request.operation == SyncOperation.SINGLE_SYMBOL:
            if not request.symbol:
                raise HTTPException(status_code=400, detail="Symbol is required for single_symbol operation")
            
            result = await service.sync_single_symbol(request.symbol)
            success = result.get("success", False)
            message = f"{'Successfully' if success else 'Failed to'} sync symbol {request.symbol}"
            result_data = result
            
        elif request.operation == SyncOperation.MULTIPLE_SYMBOLS:
            if not request.symbols:
                raise HTTPException(status_code=400, detail="Symbols list is required for multiple_symbols operation")
            
            if len(request.symbols) > request.max_symbols:
                raise HTTPException(
                    status_code=400,
                    detail=f"Too many symbols ({len(request.symbols)}). Maximum allowed: {request.max_symbols}"
                )
            
            result = await service.sync_multiple_symbols(request.symbols)
            success = result.get("successful_syncs", 0) > 0 or result.get("total_symbols", 0) == 0
            message = f"Processed {len(request.symbols)} symbols: {result.get('successful_syncs', 0)} successful, {result.get('failed_syncs', 0)} failed"
            result_data = result
            
        elif request.operation == SyncOperation.MISSING_DATA:
            result = await service.sync_missing_data(request.symbols)
            success = result.get("successful_syncs", 0) > 0 or result.get("total_symbols", 0) == 0
            message = f"Missing data sync: {result.get('successful_syncs', 0)} successful, {result.get('failed_syncs', 0)} failed"
            result_data = result
            
        elif request.operation == SyncOperation.HEALTH_CHECK:
            result = await service.health_check()
            success = result.get("status") == "healthy"
            message = f"Service is {result.get('status', 'unknown')}"
            result_data = result
            
        elif request.operation == SyncOperation.STATUS_CHECK:
            result = await service.get_sync_status(request.symbols)
            success = "error" not in result
            message = "Status check completed"
            result_data = result
            
        elif request.operation == SyncOperation.VALIDATE_SYMBOL:
            if not request.symbol:
                raise HTTPException(status_code=400, detail="Symbol is required for validate_symbol operation")
            
            is_valid = service.yfinance_service.validate_symbol(request.symbol)
            success = True
            message = f"Symbol {request.symbol} is {'valid' if is_valid else 'invalid'}"
            result_data = {
                "symbol": request.symbol.upper(),
                "is_valid": is_valid
            }
            
        elif request.operation == SyncOperation.SUPPORTED_SYMBOLS:
            symbols = service.get_supported_symbols()
            success = True
            message = f"Retrieved {len(symbols)} supported symbols"
            result_data = {
                "supported_symbols": symbols,
                "count": len(symbols)
            }
            
        elif request.operation == SyncOperation.SUMMARY_STATS:
            # Get summary statistics using Supabase
            supabase_client = service.supabase_client
            
            # Get earnings data stats
            earnings_response = supabase_client.table('earnings_data')\
                .select('symbol, fiscal_year, data_provider', count='exact')\
                .execute()
            
            earnings_symbols = set()
            earnings_years = []
            yfinance_earnings = 0
            
            for record in earnings_response.data:
                earnings_symbols.add(record['symbol'])
                if record['fiscal_year']:
                    earnings_years.append(record['fiscal_year'])
                if record['data_provider'] == 'yfinance':
                    yfinance_earnings += 1
            
            # Get fundamental data stats
            fundamental_response = supabase_client.table('fundamental_data')\
                .select('symbol, fiscal_year, data_provider', count='exact')\
                .execute()
            
            fundamental_symbols = set()
            fundamental_years = []
            yfinance_fundamental = 0
            
            for record in fundamental_response.data:
                fundamental_symbols.add(record['symbol'])
                if record['fiscal_year']:
                    fundamental_years.append(record['fiscal_year'])
                if record['data_provider'] == 'yfinance':
                    yfinance_fundamental += 1
            
            success = True
            message = "Summary statistics retrieved"
            result_data = {
                "earnings_data": {
                    "total_records": earnings_response.count or 0,
                    "unique_symbols": len(earnings_symbols),
                    "earliest_year": min(earnings_years) if earnings_years else None,
                    "latest_year": max(earnings_years) if earnings_years else None,
                    "yfinance_records": yfinance_earnings
                },
                "fundamental_data": {
                    "total_records": fundamental_response.count or 0,
                    "unique_symbols": len(fundamental_symbols),
                    "earliest_year": min(fundamental_years) if fundamental_years else None,
                    "latest_year": max(fundamental_years) if fundamental_years else None,
                    "yfinance_records": yfinance_fundamental
                }
            }
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown operation: {request.operation}")
        
        # Calculate execution time
        execution_time_ms = int((time.time() - start_time) * 1000)
        
        logger.info(f"Operation {request.operation} completed in {execution_time_ms}ms (success: {success})")
        
        return MarketDataSyncResponse(
            success=success,
            operation=request.operation,
            message=message,
            data=result_data,
            job_id=request.job_id,
            timestamp=timestamp,
            execution_time_ms=execution_time_ms
        )
        
    except HTTPException:
        raise
    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Error in {request.operation} operation: {e}")
        
        return MarketDataSyncResponse(
            success=False,
            operation=request.operation,
            message=f"Operation failed: {str(e)}",
            data={"error": str(e)},
            job_id=request.job_id,
            timestamp=timestamp,
            execution_time_ms=execution_time_ms
        )