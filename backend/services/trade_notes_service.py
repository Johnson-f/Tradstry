from typing import List, Optional, Dict, Any
from uuid import UUID
from supabase import Client
from database import get_supabase
from models.trade_notes import TradeNoteCreate, TradeNoteUpdate, TradeNoteInDB, TradeNoteType, TradePhase
from .base_database_service import BaseDatabaseService

class TradeNotesService:
    """Service for handling trade notes operations using SQL functions."""

    def __init__(self, supabase: Client = None):
        self._supabase_client = supabase or get_supabase()

    def _get_client_with_token(self, access_token: str = None) -> Client:
        if access_token:
            client = get_supabase()
            client.auth.set_session(access_token, "")
            return client
        return self._supabase_client

    async def upsert_trade_note(self, note: TradeNoteCreate, note_id: Optional[int] = None, access_token: str = None) -> Dict[str, Any]:
        client = self._get_client_with_token(access_token)
        params = {
            'p_trade_id': note.trade_id,
            'p_trade_type': note.trade_type.value,
            'p_title': note.title,
            'p_content': note.content,
            'p_note_id': note_id,
            'p_tags': note.tags,
            'p_rating': note.rating,
            'p_phase': note.phase.value if note.phase else None,
            'p_image_id': note.image_id
        }
        try:
            response = client.rpc('upsert_trade_note', params).execute()
            if response.data:
                if isinstance(response.data, list):
                    return response.data[0] if len(response.data) > 0 else None
                return response.data  # Assuming it's a dict
            return None
        except Exception as e:
            print(f"Error upserting trade note: {str(e)}")
            raise

    async def select_trade_notes(
        self,
        note_id: Optional[int] = None,
        trade_id: Optional[int] = None,
        trade_type: Optional[TradeNoteType] = None,
        tags: Optional[List[str]] = None,
        phase: Optional[TradePhase] = None,
        rating: Optional[int] = None,
        access_token: str = None
    ) -> List[TradeNoteInDB]:
        client = self._get_client_with_token(access_token)
        params = {
            'p_note_id': note_id,
            'p_trade_id': trade_id,
            'p_trade_type': trade_type.value if trade_type else None,
            'p_tags': tags,
            'p_phase': phase.value if phase else None,
            'p_rating': rating
        }
        try:
            response = client.rpc('select_trade_notes', params).execute()

            # The RPC function returns a JSONB object directly, not wrapped in an array
            if not response.data:
                return []

            # response.data should be the JSONB object returned by the SQL function
            result = response.data
            
            if not isinstance(result, dict):
                print(f"Unexpected response format - expected dict, got: {type(result)}")
                return []

            if not result.get('success', False):
                error_msg = result.get('message', 'Unknown error from RPC function')
                print(f"RPC function returned error: {error_msg}")
                return []

            # Extract the notes data from the response
            notes_data = result.get('data', [])
            if not notes_data:
                return []

            # Convert each note dict to TradeNoteInDB model
            notes = []
            for note_dict in notes_data:
                # Add trade_symbol field if it doesn't exist (for backward compatibility)
                if 'trade_symbol' not in note_dict:
                    note_dict['trade_symbol'] = None
                notes.append(TradeNoteInDB(**note_dict))
            
            return notes

        except Exception as e:
            print(f"Error selecting trade notes: {str(e)}")
            raise

    async def delete_trade_note(self, note_id: int, access_token: str = None) -> Dict[str, Any]:
        client = self._get_client_with_token(access_token)
        params = {'p_note_id': note_id}
        try:
            response = client.rpc('delete_trade_note', params).execute()
            if response.data:
                if isinstance(response.data, list):
                    return response.data[0] if len(response.data) > 0 else None
                return response.data  # Assuming it's a dict
            return None
        except Exception as e:
            print(f"Error deleting trade note: {str(e)}")
            raise
