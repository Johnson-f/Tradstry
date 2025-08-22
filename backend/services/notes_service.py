from typing import List, Optional, Dict, Any
from uuid import UUID
from supabase import Client
from database import get_supabase
from models.notes import (
    NoteCreate, NoteUpdate, NoteInDB, NoteUpsertResponse,
    FolderCreate, FolderUpdate, FolderInDB,
    DeleteResponse
)

class NotesService:
    """Service for handling notes and folders operations using SQL functions."""
    
    def __init__(self, supabase: Client = None):
        self._supabase_client = supabase or get_supabase()
    
    def _get_client_with_token(self, access_token: str = None) -> Client:
        """Get Supabase client with access token if provided."""
        if access_token:
            client = get_supabase()
            client.auth.set_session(access_token, refresh_token="")
            return client
        return self._supabase_client
    
    def _get_client(self, access_token: str = None) -> Client:
        """Get Supabase client - wrapper for _get_client_with_token for compatibility."""
        return self._get_client_with_token(access_token)
    
    # ==================== FOLDERS ====================
    
    async def get_folders(
        self,
        search_term: Optional[str] = None,
        is_system: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = 'name',
        sort_order: str = 'ASC',
        access_token: str = None
    ) -> List[FolderInDB]:
        """Get folders using the get_folders SQL function."""
        client = self._get_client_with_token(access_token)
        
        params = {
            'search_term': search_term,
            'is_system_param': is_system,
            'limit_rows': limit,
            'offset_rows': offset,
            'sort_by': sort_by,
            'sort_order': sort_order
        }
        
        # Remove None values
        params = {k: v for k, v in params.items() if v is not None}
        
        try:
            response = client.rpc('get_folders', params).execute()
            return [FolderInDB(**folder) for folder in response.data]
        except Exception as e:
            print(f"Error getting folders: {str(e)}")
            raise
    
    # ==================== NOTES ====================
    
    async def upsert_note(
        self,
        folder_id: UUID,
        title: str = 'Untitled Note',
        content: Dict[str, Any] = None,
        is_pinned: bool = False,
        is_favorite: bool = False,
        is_archived: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
        note_id: Optional[UUID] = None,
        access_token: str = None
    ) -> NoteUpsertResponse:
        """Create or update a note using the upsert_note SQL function."""
        client = self._get_client_with_token(access_token)
        
        params = {
            'p_folder_id': str(folder_id),
            'p_title': title,
            'p_content': content or {},
            'p_is_pinned': is_pinned,
            'p_is_favorite': is_favorite,
            'p_is_archived': is_archived,
            'p_metadata': metadata,
            'p_id': str(note_id) if note_id else None
        }
        
        try:
            response = client.rpc('upsert_note', params).execute()
            if response.data and len(response.data) > 0:
                return NoteUpsertResponse(**response.data[0])
            raise Exception("No data returned from upsert_note")
        except Exception as e:
            print(f"Error upserting note: {str(e)}")
            raise
    
    async def get_notes(
        self,
        note_id: Optional[UUID] = None,
        folder_slug: Optional[str] = None,
        search_term: Optional[str] = None,
        is_favorite: Optional[bool] = None,
        is_pinned: Optional[bool] = None,
        is_archived: bool = False,
        is_deleted: Optional[bool] = None,
        include_deleted: bool = False,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = 'updated_at',
        sort_order: str = 'DESC',
        access_token: str = None
    ) -> List[NoteInDB]:
        """Get notes using the get_notes SQL function."""
        client = self._get_client_with_token(access_token)
        
        params = {
            'p_note_id': str(note_id) if note_id else None,
            'p_folder_slug': folder_slug,
            'p_search_term': search_term,
            'p_is_favorite': is_favorite,
            'p_is_pinned': is_pinned,
            'p_is_archived': is_archived,
            'p_is_deleted': is_deleted,
            'p_include_deleted': include_deleted,
            'p_limit': limit,
            'p_offset': offset,
            'p_sort_by': sort_by,
            'p_sort_order': sort_order
        }
        
        # Remove None values
        params = {k: v for k, v in params.items() if v is not None}
        
        try:
            response = client.rpc('get_notes', params).execute()
            return [NoteInDB(**note) for note in response.data]
        except Exception as e:
            print(f"Error getting notes: {str(e)}")
            raise
    
    async def delete_note(
        self,
        note_id: UUID,
        access_token: str = None
    ) -> DeleteResponse:
        """Soft delete a note (move to trash) using the delete_note SQL function."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.rpc('delete_note', {'p_note_id': str(note_id)}).execute()
            if response.data and len(response.data) > 0:
                return DeleteResponse(**response.data[0])
            raise Exception("No data returned from delete_note")
        except Exception as e:
            print(f"Error deleting note: {str(e)}")
            raise
    
    async def permanent_delete_note(
        self,
        note_id: UUID,
        access_token: str = None
    ) -> DeleteResponse:
        """Permanently delete a note from trash using the permanent_delete_note SQL function."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.rpc('permanent_delete_note', {'p_note_id': str(note_id)}).execute()
            if response.data and len(response.data) > 0:
                return DeleteResponse(**response.data[0])
            raise Exception("No data returned from permanent_delete_note")
        except Exception as e:
            print(f"Error permanently deleting note: {str(e)}")
            raise
    
    async def restore_note(
        self,
        note_id: UUID,
        target_folder_slug: str = 'notes',
        access_token: str = None
    ) -> DeleteResponse:
        """Restore a note from trash using the restore_note SQL function."""
        client = self._get_client_with_token(access_token)
        
        params = {
            'p_note_id': str(note_id),
            'p_target_folder_slug': target_folder_slug
        }
        
        try:
            response = client.rpc('restore_note', params).execute()
            if response.data and len(response.data) > 0:
                return DeleteResponse(**response.data[0])
            raise Exception("No data returned from restore_note")
        except Exception as e:
            print(f"Error restoring note: {str(e)}")
            raise
    
    # ==================== TAGS ====================
    
    def get_tags_with_counts(self, access_token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all tags with note counts"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('get_tags_with_counts').execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"Error getting tags with counts: {str(e)}")
            return []
    
    def search_tags(self, search_term: str, limit: int = 10, access_token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search tags by name"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('search_tags', {
                'p_search_term': search_term,
                'p_limit': limit
            }).execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"Error searching tags: {str(e)}")
            return []
    
    def rename_tag(self, tag_id: str, new_name: str, access_token: Optional[str] = None) -> Dict[str, Any]:
        """Rename a tag"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('rename_tag', {
                'p_tag_id': tag_id,
                'p_new_name': new_name
            }).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
            return {'success': False, 'message': 'Failed to rename tag'}
        except Exception as e:
            print(f"Error renaming tag: {str(e)}")
            return {'success': False, 'message': str(e)}
    
    def tag_note(self, note_id: str, tag_name: str, tag_color: Optional[str] = None, access_token: Optional[str] = None) -> bool:
        """Add a tag to a note"""
        try:
            client = self._get_client(access_token)
            params = {
                'p_note_id': note_id,
                'p_tag_name': tag_name
            }
            if tag_color:
                params['p_tag_color'] = tag_color
            response = client.rpc('tag_note', params).execute()
            return True
        except Exception as e:
            print(f"Error tagging note: {str(e)}")
            return False
    
    def untag_note(self, note_id: str, tag_id: str, access_token: Optional[str] = None) -> bool:
        """Remove a tag from a note"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('untag_note', {
                'p_note_id': note_id,
                'p_tag_id': tag_id
            }).execute()
            return True
        except Exception as e:
            print(f"Error untagging note: {str(e)}")
            return False
    
    def delete_tag(self, tag_id: str, access_token: Optional[str] = None) -> Dict[str, Any]:
        """Delete a tag"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('delete_tag', {
                'p_tag_id': tag_id
            }).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
            return {"success": False, "message": "Failed to delete tag"}
        except Exception as e:
            print(f"Error deleting tag: {str(e)}")
            return {"success": False, "message": str(e)}
    
    def get_notes_by_tag(self, tag_id: str, access_token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all notes with a specific tag"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('get_notes_by_tag', {
                'p_tag_id': tag_id
            }).execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"Error getting notes by tag: {str(e)}")
            return []
    
    def get_note_tags(self, note_id: str, access_token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all tags for a specific note"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('get_note_tags', {
                'p_note_id': note_id
            }).execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"Error getting note tags: {str(e)}")
            return []
    
    def get_or_create_tag(self, name: str, user_id: str, access_token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get or create a tag"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('get_or_create_tag', {
                'p_name': name,
                'p_user_id': user_id
            }).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except Exception as e:
            print(f"Error getting or creating tag: {str(e)}")
            return None
    
    # ==================== TEMPLATES ====================
    
    def create_template(self, name: str, description: Optional[str] = None, content: Optional[Dict[str, Any]] = None, access_token: Optional[str] = None) -> Optional[str]:
        """Create a new template"""
        try:
            client = self._get_client(access_token)
            params = {'p_name': name}
            if description:
                params['p_description'] = description
            if content:
                params['p_content'] = content
            response = client.rpc('create_template', params).execute()
            return response.data if response.data else None
        except Exception as e:
            print(f"Error creating template: {str(e)}")
            return None
    
    def update_template(self, template_id: str, name: Optional[str] = None, description: Optional[str] = None, content: Optional[Dict[str, Any]] = None, access_token: Optional[str] = None) -> bool:
        """Update a template"""
        try:
            client = self._get_client(access_token)
            params = {'p_template_id': template_id}
            if name:
                params['p_name'] = name
            if description:
                params['p_description'] = description
            if content:
                params['p_content'] = content
            response = client.rpc('update_template', params).execute()
            return response.data if response.data else False
        except Exception as e:
            print(f"Error updating template: {str(e)}")
            return False
    
    def delete_template(self, template_id: str, access_token: Optional[str] = None) -> bool:
        """Delete a template"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('delete_template', {
                'p_template_id': template_id
            }).execute()
            return response.data if response.data else False
        except Exception as e:
            print(f"Error deleting template: {str(e)}")
            return False
    
    def get_templates(self, access_token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all templates (user's + system templates)"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('get_templates').execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"Error getting templates: {str(e)}")
            return []
    
    def get_template(self, template_id: str, access_token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get a single template by ID"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('get_template', {
                'p_template_id': template_id
            }).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except Exception as e:
            print(f"Error getting template: {str(e)}")
            return None
    
    # ==================== ADDITIONAL NOTE FUNCTIONS ====================
    
    def move_note_to_trash(self, note_id: str, access_token: Optional[str] = None) -> bool:
        """Move a note to trash by calling the soft delete RPC."""
        try:
            client = self._get_client(access_token)
            # Calling delete_note which should perform a soft delete.
            response = client.rpc('delete_note', {'p_note_id': note_id}).execute()
            return True
        except Exception as e:
            print(f"Error moving note to trash: {str(e)}")
            return False
    
    def restore_note_from_trash(self, note_id: str, target_folder_id: Optional[str] = None, access_token: Optional[str] = None) -> bool:
        """Restore a note from trash"""
        try:
            client = self._get_client(access_token)
            params = {'note_id': note_id}
            if target_folder_id:
                params['target_folder_id'] = target_folder_id
            response = client.rpc('restore_note_from_trash', params).execute()
            return True
        except Exception as e:
            print(f"Error restoring note from trash: {str(e)}")
            return False
    
    def toggle_note_favorite(self, note_id: str, access_token: Optional[str] = None) -> Optional[bool]:
        """Toggle favorite status of a note"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('toggle_note_favorite', {'note_id': note_id}).execute()
            return response.data if response.data is not None else None
        except Exception as e:
            print(f"Error toggling note favorite: {str(e)}")
            return None
    
    def get_favorite_notes(self, access_token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all favorite notes for the current user"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('get_favorite_notes').execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"Error getting favorite notes: {str(e)}")
            return []
    
    # ==================== ADDITIONAL FOLDER FUNCTIONS ====================
    
    def create_system_folder(self, folder_name: str, folder_slug: str, folder_description: Optional[str] = None, access_token: Optional[str] = None) -> Optional[str]:
        """Create a system folder (admin only)"""
        try:
            client = self._get_client(access_token)
            params = {
                'folder_name': folder_name,
                'folder_slug': folder_slug
            }
            if folder_description:
                params['folder_description'] = folder_description
            response = client.rpc('create_system_folder', params).execute()
            return response.data if response.data else None
        except Exception as e:
            print(f"Error creating system folder: {str(e)}")
            return None
    
    def get_folder_by_slug(self, folder_slug: str, access_token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get folder by slug"""
        try:
            client = self._get_client(access_token)
            response = client.rpc('get_folder_by_slug', {'folder_slug': folder_slug}).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except Exception as e:
            print(f"Error getting folder by slug: {str(e)}")
            return None
    
    def create_system_template(self, name: str, description: str, content: Optional[Dict[str, Any]] = None, access_token: Optional[str] = None) -> Optional[str]:
        """Create a system template (admin only)"""
        try:
            client = self._get_client(access_token)
            params = {
                'p_name': name,
                'p_description': description
            }
            if content:
                params['p_content'] = content
            response = client.rpc('create_system_template', params).execute()
            return response.data if response.data else None
        except Exception as e:
            print(f"Error creating system template: {str(e)}")
            return None
