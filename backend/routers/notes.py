import logging
from fastapi import APIRouter, Depends, HTTPException, status, Body, Query, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional, Dict, Any
from uuid import UUID

# Configure logging
logger = logging.getLogger(__name__)

from models.notes import (
    FolderCreate, FolderUpdate, FolderInDB,
    NoteCreate, NoteUpdate, NoteInDB, NoteWithRelations,
    TagCreate, TagInDB, TemplateInDB, TemplateCreate, TemplateUpdate
)
from services.notes_service import NotesService
from services.user_service import UserService

user_service = UserService()

# Dependency to get current user
get_current_user = user_service.get_current_user

router = APIRouter(prefix="/api/notes", tags=["notes"])
template_router = APIRouter(prefix="/templates", tags=["templates"])
notes_service = NotesService()

# Folder Endpoints
@router.post(
    "/folders/", 
    response_model=FolderInDB, 
    status_code=status.HTTP_201_CREATED,
    summary="Create a new system folder",
    description="Create a new system folder. Only system folders can be created through the API."
)
async def create_folder(
    folder: FolderCreate, 
    user: dict = Depends(get_current_user)
):
    try:
        # Only allow admins to create system folders
        if not user.get("is_admin", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can create system folders"
            )
            
        if not folder.is_system:
            folder.is_system = True  # Force is_system to True for API-created folders
            
        return await notes_service.create_folder(folder, user["sub"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get(
    "/folders/{folder_id}", 
    response_model=FolderInDB,
    summary="Get folder by ID",
    description="Get a folder by its ID"
)
async def get_folder(
    folder_id: UUID, 
    user: dict = Depends(get_current_user)
):
    folder = await notes_service.get_folder(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder

@router.get(
    "/folders/slug/{slug}",
    response_model=FolderInDB,
    summary="Get folder by slug",
    description="Get a folder by its slug"
)
async def get_folder_by_slug(
    slug: str,
    user: dict = Depends(get_current_user)
):
    folder = await notes_service.get_folder_by_slug(slug)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder

@router.get(
    "/folders/", 
    response_model=List[FolderInDB],
    summary="List folders",
    description="List all folders with optional filtering and sorting"
)
async def list_folders(
    search: Optional[str] = None,
    is_system: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
    sort_by: str = 'name',
    sort_order: str = 'ASC',
    user: dict = Depends(get_current_user)
):
    try:
        return await notes_service.list_folders(
            search=search,
            is_system=is_system,
            limit=min(limit, 1000),  # Enforce a reasonable limit
            offset=max(offset, 0),
            sort_by=sort_by,
            sort_order=sort_order
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# Note: Folder updates and deletions are not allowed as per database design
# All folder modifications should be done through database migrations

@router.get(
    "/notes/",
    response_model=List[NoteWithRelations],
    summary="List notes",
    description="List notes with filtering, sorting, and pagination options."
)
async def list_notes(
    folder_id: Optional[UUID] = None,
    search: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    is_pinned: Optional[bool] = None,
    is_archived: bool = False,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
    sort_by: str = 'updated_at',
    sort_order: str = 'DESC',
    user: dict = Depends(get_current_user)
):
    try:
        return await notes_service.list_notes(
            user_id=user["sub"],
            folder_id=folder_id,
            search=search,
            is_favorite=is_favorite,
            is_pinned=is_pinned,
            is_archived=is_archived,
            include_deleted=include_deleted,
            limit=min(limit, 100),  # Cap limit at 100 for performance
            offset=offset,
            sort_by=sort_by,
            sort_order=sort_order
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# Template Endpoints

@template_router.post("", response_model=TemplateInDB, status_code=201)
async def create_template(
    template: TemplateCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new template
    """
    try:
        return await notes_service.create_template(template, str(current_user.id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating template: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@template_router.get("", response_model=List[TemplateInDB])
async def list_templates(
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    List all templates available to the user
    """
    try:
        return await notes_service.list_templates(search=search)
    except Exception as e:
        logger.error(f"Error listing templates: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@template_router.get("/{template_id}", response_model=TemplateInDB)
async def get_template(
    template_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a template by ID
    """
    try:
        template = await notes_service.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        return template
    except Exception as e:
        logger.error(f"Error getting template: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@template_router.put("/{template_id}", response_model=TemplateInDB)
async def update_template(
    template_id: UUID,
    template: TemplateUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update a template
    """
    try:
        updated = await notes_service.update_template(
            template_id=template_id,
            template=template,
            user_id=str(current_user.id)
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Template not found or access denied")
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating template: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@template_router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a template
    """
    try:
        success = await notes_service.delete_template(
            template_id=template_id,
            user_id=str(current_user.id)
        )
        if not success:
            raise HTTPException(
                status_code=404,
                detail="Template not found, already deleted, or access denied"
            )
        return Response(status_code=204)
    except Exception as e:
        logger.error(f"Error deleting template: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Include the template router under /api/notes
router.include_router(template_router)

# Note Endpoints
@router.post(
    "/notes/", 
    response_model=NoteWithRelations, 
    status_code=status.HTTP_201_CREATED,
    summary="Create a new note",
    description="Create a new note in the specified folder"
)
async def create_note(note: NoteCreate, user: dict = Depends(get_current_user)):
    try:
        return await notes_service.create_note(note, user["sub"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating note: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get(
    "/notes/{note_id}", 
    response_model=NoteWithRelations,
    summary="Get a note by ID",
    description="Retrieve a specific note with its folder, tags, and template relations."
)
async def get_note(note_id: UUID, user: dict = Depends(get_current_user)):
    note = await notes_service.get_note(note_id, user["sub"])
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note

@router.put(
    "/notes/{note_id}", 
    response_model=NoteWithRelations,
    summary="Update a note",
    description="Update an existing note's properties"
)
async def update_note(
    note_id: UUID, 
    note: NoteUpdate, 
    user: dict = Depends(get_current_user)
):
    try:
        updated_note = await notes_service.update_note(note_id, note, user["sub"])
        if not updated_note:
            raise HTTPException(status_code=404, detail="Note not found or access denied")
        return updated_note
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating note: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/notes/{note_id}/favorite", 
            response_model=bool,
            summary="Toggle favorite status",
            description="Toggle the favorite status of a note")
async def toggle_favorite_note(
    note_id: UUID,
    user: dict = Depends(get_current_user)
):
    try:
        return await notes_service.toggle_note_favorite(note_id, user["sub"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error toggling favorite: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/notes/{note_id}", 
              status_code=status.HTTP_204_NO_CONTENT,
              summary="Delete a note",
              description="Soft delete (move to trash) or permanently delete a note")
async def delete_note(
    note_id: UUID, 
    permanent: bool = False,
    user: dict = Depends(get_current_user)
):
    try:
        success = await notes_service.delete_note(note_id, user["sub"], permanent)
        if not success:
            raise HTTPException(status_code=404, detail="Note not found or access denied")
    except Exception as e:
        logger.error(f"Error deleting note: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Tag Endpoints
@router.get(
    "/tags/", 
    response_model=List[TagInDB],
    summary="List all tags",
    description="List all tags for the current user, optionally filtered by search term."
)
async def list_tags(
    search: Optional[str] = None, 
    user: dict = Depends(get_current_user)
):
    return await notes_service.list_tags(user["sub"], search)

@router.get(
    "/notes/{note_id}/tags", 
    response_model=List[TagInDB],
    summary="Get tags for a note",
    description="Get all tags associated with a specific note."
)
async def get_note_tags(
    note_id: UUID, 
    user: dict = Depends(get_current_user)
):
    tags = await notes_service.get_note_tags(note_id, user["sub"])
    if tags is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return tags

@router.post(
    "/notes/{note_id}/tags",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Add tags to a note",
    description="Add one or more tags to a note. Creates tags that don't exist."
)
async def add_note_tags(
    note_id: UUID,
    tags: List[str],
    user: dict = Depends(get_current_user)
):
    # Get existing note to verify it exists and belongs to user
    note = await notes_service.get_note(note_id, user["sub"])
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Get current tags and merge with new ones
    current_tags = [tag.name for tag in note.tags]
    updated_tags = list(set(current_tags + tags))
    
    # Update note with merged tags
    await notes_service._set_note_tags(note_id, updated_tags, user["sub"])
    return None

@router.delete(
    "/notes/{note_id}/tags/{tag_name}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a tag from a note",
    description="Remove a specific tag from a note."
)
async def remove_note_tag(
    note_id: UUID,
    tag_name: str,
    user: dict = Depends(get_current_user)
):
    # Get existing note to verify it exists and belongs to user
    note = await notes_service.get_note(note_id, user["sub"])
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Filter out the tag to be removed
    updated_tags = [tag.name for tag in note.tags if tag.name != tag_name]
    
    # If no change, tag wasn't on the note
    if len(updated_tags) == len(note.tags):
        raise HTTPException(status_code=404, detail="Tag not found on note")
    
    # Update note with filtered tags
    await notes_service._set_note_tags(note_id, updated_tags, user["sub"])
    return None
