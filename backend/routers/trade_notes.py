from fastapi import APIRouter, Depends, HTTPException, status, Header, Query
from typing import List, Optional, Dict, Any
from uuid import UUID
from models.trade_notes import (
    TradeNoteCreate, TradeNoteUpdate, TradeNoteInDB,
    TradeNoteType, TradePhase
)
from services.trade_notes_service import TradeNotesService
from services.user_service import UserService
from utils.auth import get_user_with_token_retry

# Initialize services
trade_notes_service = TradeNotesService()
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
    return get_user_with_token_retry(user_service.supabase, token)

router = APIRouter(prefix="/trade-notes", tags=["trade-notes"])

@router.post("/", response_model=Dict[str, Any])
async def create_trade_note(note: TradeNoteCreate, current_user: dict = Depends(get_current_user)):
    return await trade_notes_service.upsert_trade_note(note, access_token=current_user.get("access_token"))

@router.get("/", response_model=List[TradeNoteInDB])
async def get_trade_notes(
    note_id: Optional[int] = Query(None),
    trade_id: Optional[int] = Query(None),
    trade_type: Optional[TradeNoteType] = Query(None),
    tags: Optional[List[str]] = Query(None),
    phase: Optional[TradePhase] = Query(None),
    rating: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    return await trade_notes_service.select_trade_notes(
        note_id=note_id,
        trade_id=trade_id,
        trade_type=trade_type,
        tags=tags,
        phase=phase,
        rating=rating,
        access_token=current_user.get("access_token")
    )

@router.put("/{note_id}", response_model=Dict[str, Any])
async def update_trade_note(note_id: int, note: TradeNoteUpdate, current_user: dict = Depends(get_current_user)):
    # This is not a true upsert, the DB function handles it.
    # We pass the note_id to the existing upsert function.
    # A bit of a hack, but it works with the given SQL functions.
    existing_notes = await trade_notes_service.select_trade_notes(note_id=note_id, access_token=current_user.get("access_token"))
    if not existing_notes:
        raise HTTPException(status_code=404, detail="Note not found")

    existing_note = existing_notes[0]

    update_data = note.dict(exclude_unset=True)

    # Create a TradeNoteCreate model from existing and updated data
    create_model_data = existing_note.dict()
    create_model_data.update(update_data)

    create_model = TradeNoteCreate(**create_model_data)

    return await trade_notes_service.upsert_trade_note(create_model, note_id=note_id, access_token=current_user.get("access_token"))

@router.delete("/{note_id}", response_model=Dict[str, Any])
async def delete_trade_note(note_id: int, current_user: dict = Depends(get_current_user)):
    return await trade_notes_service.delete_trade_note(note_id, access_token=current_user.get("access_token"))
