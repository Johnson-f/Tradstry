from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from typing import Optional, List, Dict, Any
from datetime import datetime
from services.user_service import UserService
from utils.auth import get_user_with_token_retry
from services.ai.ai_reports_service import AIReportsService
from services.ai.orchestrator import AIOrchestrator
from models.ai_reports import (
    AIReportCreate, AIReportUpdate, AIReportResponse, 
    AIReportGenerateRequest, DeleteResponse
)

router = APIRouter(prefix="/ai/reports", tags=["AI Reports"])

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
    user = get_user_with_token_retry(user_service.supabase, token)
    user["access_token"] = f"Bearer {token}"
    return user

@router.post("/", response_model=dict)
async def create_report(
    report_data: AIReportCreate,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Create a new AI report."""
    try:
        service = AIReportsService()
        result = await service.create_report(report_data, current_user["access_token"])
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/", response_model=List[AIReportResponse])
async def get_reports(
    report_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_range_start: Optional[datetime] = Query(None),
    date_range_end: Optional[datetime] = Query(None),
    search_query: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    order_by: str = Query("created_at"),
    order_direction: str = Query("DESC"),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Get AI reports with filtering and pagination."""
    try:
        service = AIReportsService()
        # Convert string parameters to enums if provided
        from models.ai_reports import ReportType, ReportStatus
        report_type_enum = ReportType(report_type) if report_type else None
        status_enum = ReportStatus(status) if status else None
        
        reports = await service.get_reports(
            current_user["access_token"], 
            report_type=report_type_enum,
            status=status_enum,
            date_from=date_range_start, 
            date_to=date_range_end,
            limit=limit
        )
        return reports
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{report_id}", response_model=AIReportResponse)
async def get_report(
    report_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Get a specific AI report by ID."""
    try:
        service = AIReportsService()
        report = await service.get_report_by_id(report_id, current_user["access_token"])
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{report_id}", response_model=dict)
async def update_report(
    report_id: str,
    report_data: AIReportUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Update an existing AI report."""
    try:
        service = AIReportsService()
        result = await service.update_report(report_id, report_data, current_user["access_token"])
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{report_id}", response_model=DeleteResponse)
async def delete_report(
    report_id: str,
    soft_delete: bool = Query(False),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Delete an AI report."""
    try:
        service = AIReportsService()
        result = await service.delete_report(report_id, current_user["access_token"], soft_delete)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate", response_model=dict)
async def generate_report(
    request: AIReportGenerateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Generate a new AI report using the AI orchestrator."""
    try:
        orchestrator = AIOrchestrator()
        result = await orchestrator.generate_daily_report(
            user=current_user,
            time_range=request.time_range,
            custom_start_date=request.custom_start_date,
            custom_end_date=request.custom_end_date
        )
        return {
            "success": True, 
            "message": "Report generated successfully",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/context/trading", response_model=dict)
async def get_trading_context(
    time_range: str = Query("30d"),
    custom_start_date: Optional[datetime] = Query(None),
    custom_end_date: Optional[datetime] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Get comprehensive trading context for AI processing."""
    try:
        service = AIReportsService()
        context = await service.get_trading_context(
            current_user["access_token"], time_range, custom_start_date, custom_end_date
        )
        return {"success": True, "data": context}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
