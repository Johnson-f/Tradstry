from fastapi import APIRouter, Depends, HTTPException, status, Header, Query, UploadFile, File, Form
from typing import List, Optional, Dict, Any
from uuid import UUID
import uuid
import os
from models.images import (
    ImageCreate, ImageUpdate, ImageInDB, ImageUpsertResponse,
    ImageDeleteResponse, BulkImageDeleteResponse,
    ImageSearchRequest, ImagePaginationRequest
)
from services.images_service import ImagesService
from services.user_service import UserService
from utils.auth import get_user_with_retry, get_user_with_token_retry

# Initialize services
images_service = ImagesService()
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
    return get_user_with_token_retry(user_service.supabase, token)

def get_current_user(authorization: str = Header(...)) -> Dict[str, Any]:
    """Dependency to get current user from Supabase JWT"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ")[1]
    return get_user_with_retry(user_service.supabase, token)

router = APIRouter(prefix="/images", tags=["images"])

# ==================== UPLOAD OPERATIONS ====================

@router.post("/upload", response_model=ImageUpsertResponse, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    note_id: Optional[str] = Form(None),
    alt_text: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Upload an image file to storage and create database record.
    
    - **file**: Image file to upload
    - **note_id**: Optional UUID of the note to associate with
    - **alt_text**: Optional alt text for accessibility
    - **caption**: Optional caption for the image
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Generate unique filename
    file_extension = os.path.splitext(file.filename)[1] if file.filename else '.jpg'
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    user_id = current_user.get("id")
    file_path = f"{user_id}/{unique_filename}"
    
    try:
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        # Upload to storage
        storage_result = await images_service.upload_image_to_storage(
            file_content=file_content,
            file_path=file_path,
            content_type=file.content_type,
            access_token=current_user.get("access_token")
        )
        
        if not storage_result.get('success'):
            raise HTTPException(status_code=500, detail=f"Failed to upload to storage: {storage_result.get('error')}")
        
        # Create database record
        return await images_service.upsert_image(
            note_id=UUID(note_id) if note_id else None,
            filename=unique_filename,
            original_filename=file.filename or unique_filename,
            file_path=file_path,
            file_size=file_size,
            mime_type=file.content_type,
            alt_text=alt_text,
            caption=caption,
            access_token=current_user.get("access_token")
        )
        
    except Exception as e:
        # Clean up storage if database operation fails
        await images_service.delete_image_from_storage(
            file_path=file_path,
            access_token=current_user.get("access_token")
        )
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")

# ==================== RETRIEVE OPERATIONS ====================

@router.get("/", response_model=List[ImageInDB])
async def get_images(
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get all images for the current user.
    """
    return await images_service.get_images(
        access_token=current_user.get("access_token")
    )

@router.get("/{image_id}", response_model=ImageInDB)
async def get_image(
    image_id: UUID,
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get a specific image by ID.
    """
    image = await images_service.get_image_by_id(
        image_id=image_id,
        access_token=current_user.get("access_token")
    )
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return image

@router.get("/note/{note_id}", response_model=List[ImageInDB])
async def get_images_by_note(
    note_id: UUID,
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get all images for a specific note.
    """
    return await images_service.get_images_by_note(
        note_id=note_id,
        access_token=current_user.get("access_token")
    )

@router.get("/paginated/list", response_model=List[ImageInDB])
async def get_images_paginated(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get images with pagination.
    
    - **limit**: Number of images to return (max 100)
    - **offset**: Number of images to skip
    """
    return await images_service.get_images_paginated(
        limit=limit,
        offset=offset,
        access_token=current_user.get("access_token")
    )

@router.get("/search/query", response_model=List[ImageInDB])
async def search_images(
    search_term: str = Query(..., description="Search term for images"),
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Search images by filename, alt text, or caption.
    """
    return await images_service.search_images(
        search_term=search_term,
        access_token=current_user.get("access_token")
    )

# ==================== UPDATE OPERATIONS ====================

@router.put("/{image_id}", response_model=ImageUpsertResponse)
async def update_image(
    image_id: UUID,
    image: ImageUpdate,
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Update image metadata (not the file itself).
    """
    # Get current image to preserve existing values
    current_image = await images_service.get_image_by_id(
        image_id=image_id,
        access_token=current_user.get("access_token")
    )
    
    if not current_image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Build update params from provided fields only
    return await images_service.upsert_image(
        note_id=image.note_id if image.note_id is not None else current_image.note_id,
        filename=image.filename or current_image.filename,
        original_filename=image.original_filename or current_image.original_filename,
        file_path=image.file_path or current_image.file_path,
        file_size=image.file_size or current_image.file_size,
        mime_type=image.mime_type or current_image.mime_type,
        width=image.width if image.width is not None else current_image.width,
        height=image.height if image.height is not None else current_image.height,
        alt_text=image.alt_text if image.alt_text is not None else current_image.alt_text,
        caption=image.caption if image.caption is not None else current_image.caption,
        access_token=current_user.get("access_token")
    )

# ==================== DELETE OPERATIONS ====================

@router.delete("/{image_id}", response_model=ImageDeleteResponse)
async def delete_image(
    image_id: UUID,
    delete_from_storage: bool = Query(True, description="Also delete from storage"),
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Delete an image.
    
    - **delete_from_storage**: If true, also delete the file from storage
    """
    # Get image info before deletion for storage cleanup
    image = await images_service.get_image_by_id(
        image_id=image_id,
        access_token=current_user.get("access_token")
    )
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Delete from database
    result = await images_service.delete_image(
        image_id=image_id,
        access_token=current_user.get("access_token")
    )
    
    # Delete from storage if requested and database deletion was successful
    if delete_from_storage and result.success:
        storage_result = await images_service.delete_image_from_storage(
            file_path=image.file_path,
            access_token=current_user.get("access_token")
        )
        if not storage_result.get('success'):
            print(f"Warning: Failed to delete image from storage: {storage_result.get('error')}")
    
    return result

@router.delete("/note/{note_id}/all", response_model=BulkImageDeleteResponse)
async def delete_images_by_note(
    note_id: UUID,
    delete_from_storage: bool = Query(True, description="Also delete from storage"),
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Delete all images for a specific note.
    
    - **delete_from_storage**: If true, also delete files from storage
    """
    # Get images before deletion for storage cleanup
    images = await images_service.get_images_by_note(
        note_id=note_id,
        access_token=current_user.get("access_token")
    )
    
    # Delete from database
    result = await images_service.delete_images_by_note(
        note_id=note_id,
        access_token=current_user.get("access_token")
    )
    
    # Delete from storage if requested and database deletion was successful
    if delete_from_storage and result.success and images:
        for image in images:
            storage_result = await images_service.delete_image_from_storage(
                file_path=image.file_path,
                access_token=current_user.get("access_token")
            )
            if not storage_result.get('success'):
                print(f"Warning: Failed to delete image from storage: {storage_result.get('error')}")
    
    return result

# ==================== STORAGE OPERATIONS ====================

@router.get("/{image_id}/url")
async def get_image_url(
    image_id: UUID,
    expires_in: int = Query(3600, description="URL expiration time in seconds"),
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get a signed URL for accessing an image.
    
    - **expires_in**: URL expiration time in seconds (default: 1 hour)
    """
    # Get image to verify ownership and get file path
    image = await images_service.get_image_by_id(
        image_id=image_id,
        access_token=current_user.get("access_token")
    )
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Get signed URL
    signed_url = await images_service.get_image_url(
        file_path=image.file_path,
        expires_in=expires_in,
        access_token=current_user.get("access_token")
    )
    
    if not signed_url:
        raise HTTPException(status_code=500, detail="Failed to generate image URL")
    
    return {"url": signed_url, "expires_in": expires_in}

@router.post("/{image_id}/replace", response_model=ImageUpsertResponse)
async def replace_image_file(
    image_id: UUID,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Replace an existing image file while keeping the same database record.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Get existing image
    existing_image = await images_service.get_image_by_id(
        image_id=image_id,
        access_token=current_user.get("access_token")
    )
    
    if not existing_image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    try:
        # Read new file content
        file_content = await file.read()
        file_size = len(file_content)
        
        # Upload new file (this will overwrite the existing file due to upsert: true)
        storage_result = await images_service.upload_image_to_storage(
            file_content=file_content,
            file_path=existing_image.file_path,
            content_type=file.content_type,
            access_token=current_user.get("access_token")
        )
        
        if not storage_result.get('success'):
            raise HTTPException(status_code=500, detail=f"Failed to upload to storage: {storage_result.get('error')}")
        
        # Update database record with new file info
        return await images_service.upsert_image(
            note_id=existing_image.note_id,
            filename=existing_image.filename,
            original_filename=file.filename or existing_image.original_filename,
            file_path=existing_image.file_path,
            file_size=file_size,
            mime_type=file.content_type,
            width=existing_image.width,
            height=existing_image.height,
            alt_text=existing_image.alt_text,
            caption=existing_image.caption,
            access_token=current_user.get("access_token")
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to replace image: {str(e)}")
