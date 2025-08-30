from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from typing import Optional, List, Dict, Any
from datetime import datetime
from services.user_service import UserService
from utils.auth import get_user_with_token_retry
from services.ai_insights_service import AIInsightsService
from services.ai_orchestrator_service import AIOrchestrator
from models.ai_insights import (
    AIInsightCreate, AIInsightUpdate, AIInsightResponse,
    AIInsightGenerateRequest, InsightDeleteResponse, InsightExpireResponse,
    PriorityInsightsResponse, ActionableInsightsResponse, InsightType
)

router = APIRouter(prefix="/ai/insights", tags=["AI Insights"])

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
async def create_insight(
    insight_data: AIInsightCreate,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Create a new AI insight."""
    try:
        service = AIInsightsService()
        result = await service.create_insight(insight_data, current_user["access_token"])
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/", response_model=List[AIInsightResponse])
async def get_insights(
    insight_type: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    actionable: Optional[bool] = Query(None),
    tags: Optional[List[str]] = Query(None),
    search_query: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    order_by: str = Query("created_at"),
    order_direction: str = Query("DESC"),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Get AI insights with filtering and pagination."""
    try:
        service = AIInsightsService()
        insights = await service.get_insights(
            current_user["access_token"], None, insight_type, priority, actionable, tags,
            search_query, limit, offset, order_by, order_direction
        )
        return insights
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/priority", response_model=List[PriorityInsightsResponse])
async def get_priority_insights(
    limit: int = Query(10, ge=1, le=20),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Get high-priority insights."""
    try:
        service = AIInsightsService()
        insights = await service.get_priority_insights(current_user["access_token"], limit)
        return insights
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/actionable", response_model=List[ActionableInsightsResponse])
async def get_actionable_insights(
    limit: int = Query(20, ge=1, le=50),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Get actionable insights."""
    try:
        service = AIInsightsService()
        insights = await service.get_actionable_insights(current_user["access_token"], limit)
        return insights
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{insight_id}", response_model=AIInsightResponse)
async def get_insight(
    insight_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Get a specific AI insight by ID."""
    try:
        service = AIInsightsService()
        insights = await service.get_insights(current_user["access_token"], insight_id=insight_id, limit=1)
        if not insights:
            raise HTTPException(status_code=404, detail="Insight not found")
        return insights[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{insight_id}", response_model=dict)
async def update_insight(
    insight_id: str,
    insight_data: AIInsightUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Update an existing AI insight."""
    try:
        service = AIInsightsService()
        result = await service.update_insight(insight_id, insight_data, current_user["access_token"])
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{insight_id}", response_model=InsightDeleteResponse)
async def delete_insight(
    insight_id: str,
    soft_delete: bool = Query(False),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Delete an AI insight."""
    try:
        service = AIInsightsService()
        result = await service.delete_insight(insight_id, current_user["access_token"], soft_delete)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{insight_id}/expire", response_model=InsightExpireResponse)
async def expire_insight(
    insight_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Expire an AI insight."""
    try:
        service = AIInsightsService()
        result = await service.expire_insight(insight_id, current_user["access_token"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate", response_model=dict)
async def generate_insights(
    request: AIInsightGenerateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Generate AI insights using the AI orchestrator."""
    try:
        orchestrator = AIOrchestrator()
        
        # Use all insight types if none specified
        insight_types = request.insight_types or [
            InsightType.PATTERN, InsightType.RISK, InsightType.OPPORTUNITY,
            InsightType.PERFORMANCE, InsightType.RECOMMENDATION
        ]
        
        result = await orchestrator.generate_insights(
            access_token=current_user["access_token"],
            insight_types=insight_types,
            time_range=request.time_range,
            min_confidence=request.min_confidence
        )
        
        return {
            "success": True,
            "message": f"Generated {len(result)} insights",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search", response_model=List[AIInsightResponse])
async def search_insights(
    query: str = Query(..., description="Search query"),
    insight_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=50),
    similarity_threshold: float = Query(0.7, ge=0.0, le=1.0),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Search insights using vector similarity."""
    try:
        service = AIInsightsService()
        insights = await service.search_insights(
            current_user["access_token"], query, insight_type, limit, similarity_threshold
        )
        return insights
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
