from typing import List, Optional, Dict, Any
from uuid import UUID
from supabase import Client
from database import get_supabase
from models.images import (
    ImageCreate, ImageUpdate, ImageInDB, ImageUpsertResponse,
    ImageDeleteResponse, BulkImageDeleteResponse
)

class ImagesService:
    """Service for handling images operations using SQL functions."""
    
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
    
    # ==================== UPSERT OPERATIONS ====================
    
    async def upsert_image(
        self,
        note_id: Optional[UUID],
        filename: str,
        original_filename: str,
        file_path: str,
        file_size: int,
        mime_type: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
        alt_text: Optional[str] = None,
        caption: Optional[str] = None,
        user_id: Optional[UUID] = None,
        access_token: str = None
    ) -> ImageUpsertResponse:
        """Create or update an image using the upsert_image SQL function."""
        client = self._get_client_with_token(access_token)
        
        # Build params dict with all required parameters
        # Note: p_note_id is required by the function, so we pass it even if None
        params = {
            'p_note_id': str(note_id) if note_id else None,
            'p_filename': filename,
            'p_original_filename': original_filename,
            'p_file_path': file_path,
            'p_file_size': file_size,
            'p_mime_type': mime_type
        }
        
        # Add optional parameters only if they have values
        if width is not None:
            params['p_width'] = width
        if height is not None:
            params['p_height'] = height
        if alt_text is not None:
            params['p_alt_text'] = alt_text
        if caption is not None:
            params['p_caption'] = caption
        if user_id is not None:
            params['p_user_id'] = str(user_id)
        
        try:
            response = client.rpc('upsert_image', params).execute()
            if response.data and len(response.data) > 0:
                return ImageUpsertResponse(**response.data[0])
            raise Exception("No data returned from upsert_image")
        except Exception as e:
            print(f"Error upserting image: {str(e)}")
            raise
    
    # ==================== SELECT OPERATIONS ====================
    
    async def get_images(
        self,
        access_token: str = None
    ) -> List[ImageInDB]:
        """Get all images for the current user using the select_images SQL function."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.rpc('select_images').execute()
            return [ImageInDB(**image) for image in response.data]
        except Exception as e:
            print(f"Error getting images: {str(e)}")
            raise
    
    async def get_image_by_id(
        self,
        image_id: UUID,
        access_token: str = None
    ) -> Optional[ImageInDB]:
        """Get a specific image by ID using the get_image_by_id SQL function."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.rpc('get_image_by_id', {'p_image_id': str(image_id)}).execute()
            if response.data and len(response.data) > 0:
                return ImageInDB(**response.data[0])
            return None
        except Exception as e:
            print(f"Error getting image by ID: {str(e)}")
            raise
    
    async def get_images_by_note(
        self,
        note_id: UUID,
        access_token: str = None
    ) -> List[ImageInDB]:
        """Get all images for a specific note using the get_images_by_note SQL function."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.rpc('get_images_by_note', {'p_note_id': str(note_id)}).execute()
            return [ImageInDB(**image) for image in response.data]
        except Exception as e:
            print(f"Error getting images by note: {str(e)}")
            raise
    
    async def get_images_paginated(
        self,
        limit: int = 20,
        offset: int = 0,
        access_token: str = None
    ) -> List[ImageInDB]:
        """Get images with pagination using the get_images_paginated SQL function."""
        client = self._get_client_with_token(access_token)
        
        params = {
            'p_limit': limit,
            'p_offset': offset
        }
        
        try:
            response = client.rpc('get_images_paginated', params).execute()
            return [ImageInDB(**image) for image in response.data]
        except Exception as e:
            print(f"Error getting paginated images: {str(e)}")
            raise
    
    async def search_images(
        self,
        search_term: str,
        access_token: str = None
    ) -> List[ImageInDB]:
        """Search images by filename, alt text, or caption using the search_images SQL function."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.rpc('search_images', {'p_search_term': search_term}).execute()
            return [ImageInDB(**image) for image in response.data]
        except Exception as e:
            print(f"Error searching images: {str(e)}")
            raise
    
    # ==================== DELETE OPERATIONS ====================
    
    async def delete_image(
        self,
        image_id: UUID,
        access_token: str = None
    ) -> ImageDeleteResponse:
        """Delete a single image using the delete_image SQL function."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.rpc('delete_image', {'p_id': str(image_id)}).execute()
            if response.data:
                result = response.data
                if result.get('success'):
                    deleted_record = result.get('deleted_record')
                    return ImageDeleteResponse(
                        success=True,
                        deleted_record=ImageInDB(**deleted_record) if deleted_record else None
                    )
                else:
                    return ImageDeleteResponse(
                        success=False,
                        error=result.get('error', 'Unknown error')
                    )
            raise Exception("No data returned from delete_image")
        except Exception as e:
            print(f"Error deleting image: {str(e)}")
            raise
    
    async def delete_images_by_note(
        self,
        note_id: UUID,
        access_token: str = None
    ) -> BulkImageDeleteResponse:
        """Delete all images for a note using the delete_images_by_note SQL function."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.rpc('delete_images_by_note', {'p_note_id': str(note_id)}).execute()
            if response.data:
                result = response.data
                if result.get('success'):
                    deleted_records = result.get('deleted_records', [])
                    return BulkImageDeleteResponse(
                        success=True,
                        deleted_count=result.get('deleted_count', 0),
                        deleted_records=[ImageInDB(**record) for record in deleted_records]
                    )
                else:
                    return BulkImageDeleteResponse(
                        success=False,
                        deleted_count=0,
                        error=result.get('error', 'Unknown error')
                    )
            raise Exception("No data returned from delete_images_by_note")
        except Exception as e:
            print(f"Error deleting images by note: {str(e)}")
            raise
    
    # ==================== STORAGE OPERATIONS ====================
    
    async def upload_image_to_storage(
        self,
        file_content: bytes,
        file_path: str,
        content_type: str,
        access_token: str = None
    ) -> Dict[str, Any]:
        """Upload image to Supabase Storage notebook bucket."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.storage.from_('notebook').upload(
                path=file_path,
                file=file_content,
                file_options={
                    'content-type': content_type,
                    'cache-control': '3600',
                    'upsert': 'true'
                }
            )
            return {'success': True, 'data': response}
        except Exception as e:
            print(f"Error uploading image to storage: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    async def delete_image_from_storage(
        self,
        file_path: str,
        access_token: str = None
    ) -> Dict[str, Any]:
        """Delete image from Supabase Storage notebook bucket."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.storage.from_('notebook').remove([file_path])
            return {'success': True, 'data': response}
        except Exception as e:
            print(f"Error deleting image from storage: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    async def get_image_url(
        self,
        file_path: str,
        expires_in: int = 3600,
        access_token: str = None
    ) -> Optional[str]:
        """Get signed URL for image from Supabase Storage."""
        client = self._get_client_with_token(access_token)
        
        try:
            response = client.storage.from_('notebook').create_signed_url(
                path=file_path,
                expires_in=expires_in
            )
            print(f"Supabase signed URL response: {response}")  # Debug log
            
            # Supabase Python client returns different key formats
            if response:
                # Try different possible response formats
                signed_url = (
                    response.get('signedURL') or 
                    response.get('signed_url') or 
                    response.get('url') or
                    response
                )
                print(f"Extracted signed URL: {signed_url}")  # Debug log
                return signed_url
            return None
        except Exception as e:
            print(f"Error getting image URL: {str(e)}")
            return None
