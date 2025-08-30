from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from typing import Optional, List, Dict, Any
from datetime import datetime
from services.user_service import UserService
from utils.auth import get_user_with_token_retry
from services.ai_chat_service import AIChatService
from services.ai_orchestrator_service import AIOrchestrator
from models.ai_chat import (
    AIChatMessageCreate, AIChatMessageUpdate, AIChatMessageResponse,
    AIChatSessionResponse, ChatMessageDeleteResponse, AIChatRequest
)

router = APIRouter(prefix="/ai/chat", tags=["AI Chat"])

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

@router.post("/messages", response_model=dict)
async def create_message(
    message_data: AIChatMessageCreate,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Create a new chat message."""
    try:
        service = AIChatService()
        result = await service.create_message(message_data, current_user["access_token"])
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/messages", response_model=List[AIChatMessageResponse])
async def get_messages(
    session_id: Optional[str] = Query(None),
    message_type: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    search_query: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    order_by: str = Query("created_at"),
    order_direction: str = Query("ASC"),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Get chat messages with filtering and pagination."""
    try:
        service = AIChatService()
        messages = await service.get_messages(
            current_user["access_token"], session_id, None, message_type, role, search_query,
            limit, offset, order_by, order_direction
        )
        return messages
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions", response_model=List[AIChatSessionResponse])
async def get_sessions(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Get chat sessions for the user."""
    try:
        service = AIChatService()
        sessions = await service.get_sessions(current_user["access_token"], limit, offset)
        return sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions/{session_id}/messages", response_model=List[AIChatMessageResponse])
async def get_session_messages(
    session_id: str,
    limit: int = Query(100, ge=1, le=200),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Get all messages for a specific session."""
    try:
        service = AIChatService()
        messages = await service.get_session_messages(session_id, current_user["access_token"], limit)
        return messages
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat", response_model=dict)
async def chat_with_ai(
    request: AIChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Send a message to AI and get a response."""
    try:
        orchestrator = AIOrchestrator()
        result = await orchestrator.process_chat_message(
            access_token=current_user["access_token"],
            session_id=request.session_id,
            user_message=request.message,
            context_limit=request.context_limit or 10
        )
        return {
            "success": True,
            "message": "Chat processed successfully",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/messages/{message_id}", response_model=dict)
async def update_message(
    message_id: str,
    message_data: AIChatMessageUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Update an existing chat message."""
    try:
        service = AIChatService()
        result = await service.update_message(message_id, message_data, current_user["access_token"])
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/messages/{message_id}", response_model=ChatMessageDeleteResponse)
async def delete_message(
    message_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Delete a chat message."""
    try:
        service = AIChatService()
        result = await service.delete_message(message_id, current_user["access_token"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/sessions/{session_id}", response_model=dict)
async def delete_session(
    session_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Delete an entire chat session."""
    try:
        service = AIChatService()
        result = await service.delete_session(session_id, current_user["access_token"])
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search", response_model=List[AIChatMessageResponse])
async def search_messages(
    query: str = Query(..., description="Search query"),
    session_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=50),
    similarity_threshold: float = Query(0.7, ge=0.0, le=1.0),
    current_user: Dict[str, Any] = Depends(get_current_user_with_token)
):
    """Search chat messages using vector similarity."""
    try:
        service = AIChatService()
        messages = await service.search_messages(
            current_user["access_token"], query, session_id, limit, similarity_threshold
        )
        return messages
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
