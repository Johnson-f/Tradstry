from typing import Dict, Any, Optional, List
from supabase import Client
from database import get_supabase
from datetime import datetime, date
from models.trade_notes import TradeNoteCreate, TradeNoteUpdate, TradeNoteInDB, TradeNoteType, TradePhase
from .base_database_service import BaseDatabaseService
from auth_service import AuthService

class TradeNotesService:
    """Service for handling trade notes operations using SQL functions."""

    def __init__(self, supabase: Client = None):
        self._supabase_client = supabase or get_supabase()
        self.auth_service = AuthService(self._supabase_client)

    async def _call_sql_function(self, function_name: str, params: Dict[str, Any], access_token: str = None):
        """Helper method to call SQL functions with proper authentication."""
        if access_token:
            return await self.auth_service.safe_rpc_call(function_name, params, access_token)
        else:
            return self._supabase_client.rpc(function_name, params).execute()

    async def upsert_trade_note(self, note: TradeNoteCreate, note_id: Optional[int] = None, access_token: str = None) -> Dict[str, Any]:
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
            response = await self._call_sql_function('upsert_trade_note', params, access_token)
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
        params = {
            'p_note_id': note_id,
            'p_trade_id': trade_id,
            'p_trade_type': trade_type.value if trade_type else None,
            'p_tags': tags,
            'p_phase': phase.value if phase else None,
            'p_rating': rating
        }
        try:
            response = await self._call_sql_function('select_trade_notes', params, access_token)

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
        params = {'p_note_id': note_id}

        try:
            response = await self._call_sql_function('delete_trade_note', params, access_token)

            # Handle the response similar to select_trade_notes
            if not response.data:
                return {"success": False, "message": "No response from database"}

            result = response.data

            # If it's a list, get the first item
            if isinstance(result, list):
                result = result[0] if len(result) > 0 else {}

            # Check if the response indicates success
            if not isinstance(result, dict):
                return {"success": False, "message": "Unexpected response format"}

            # Return the result as-is since it already contains the proper structure
            return result

        except APIError as e:
            print(f"APIError deleting trade note: {str(e)}")

            # Check if this is the "fake error" from postgrest
            if hasattr(e, 'args') and e.args:
                error_data = e.args[0]
                if isinstance(error_data, dict) and error_data.get('success'):
                    # This is actually a successful response wrapped as an error
                    return error_data
            raise
        except Exception as e:
            print(f"Error deleting trade note: {str(e)}")
            raise

    async def get_tracking_summary(self, access_token: str = None, time_range: str = "7d",
                                 custom_start_date=None, custom_end_date=None) -> Dict[str, Any]:
        """Get a summary of tracking data for trading context."""

        try:
            # Get recent trade notes for context based on time range
            recent_notes = await self.select_trade_notes(access_token=access_token)

            # Filter notes by date range if custom dates are provided
            if custom_start_date and custom_end_date:
                filtered_notes = []
                for note in recent_notes:
                    # Assuming notes have created_at field - adjust field name as needed
                    note_date = getattr(note, 'created_at', None) or getattr(note, 'updated_at', None)
                    if note_date:
                        if hasattr(note_date, 'date'):
                            note_date = note_date.date()
                        if custom_start_date <= note_date <= custom_end_date:
                            filtered_notes.append(note)
                recent_notes = filtered_notes

            # Create a summary based on recent notes
            summary = {
                "total_notes": len(recent_notes),
                "recent_notes": recent_notes[:5] if recent_notes else [],  # Last 5 notes
                "note_types": {},
                "phases": {},
                "ratings": {},
                "time_range": time_range,
                "date_filter": {
                    "start_date": custom_start_date.isoformat() if custom_start_date else None,
                    "end_date": custom_end_date.isoformat() if custom_end_date else None
                }
            }

            # Analyze note patterns
            for note in recent_notes:
                # Count note types
                note_type = note.trade_type.value if note.trade_type else "unknown"
                summary["note_types"][note_type] = summary["note_types"].get(note_type, 0) + 1

                # Count phases
                if note.phase:
                    phase = note.phase.value
                    summary["phases"][phase] = summary["phases"].get(phase, 0) + 1

                # Count ratings
                if note.rating:
                    rating_key = f"rating_{note.rating}"
                    summary["ratings"][rating_key] = summary["ratings"].get(rating_key, 0) + 1

            return summary

        except Exception as e:
            print(f"Error getting tracking summary: {str(e)}")
            return {
                "total_notes": 0,
                "recent_notes": [],
                "note_types": {},
                "phases": {},
                "ratings": {},
                "time_range": time_range,
                "error": str(e)
            }
