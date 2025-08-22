from fastapi import APIRouter, Depends, HTTPException, status, Header, Query
from typing import List, Optional, Dict, Any
from uuid import UUID
from models.notes import (
    NoteCreate, NoteUpdate, NoteInDB, NoteUpsertResponse,
    FolderInDB, DeleteResponse, RestoreNoteRequest,
    TagCreate, TagUpdate, TagInDB, TagNoteRequest, UntagNoteRequest,
    TemplateCreate, TemplateUpdate, TemplateInDB
)
from services.notes_service import NotesService
from services.user_service import UserService
from utils.auth import get_user_with_retry, get_user_with_token_retry

# Initialize services
notes_service = NotesService()
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

router = APIRouter(prefix="/notes", tags=["notes"])

# ==================== FOLDERS ====================

@router.get("/folders", response_model=List[FolderInDB])
async def get_folders(
    search_term: Optional[str] = Query(None),
    is_system: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    sort_by: str = Query('name', regex='^(name|slug|created_at|updated_at)$'),
    sort_order: str = Query('ASC', regex='^(ASC|DESC)$'),
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get folders with optional filtering and sorting.
    
    - **search_term**: Search in folder name and description
    - **is_system**: Filter by system folders (true) or user folders (false)
    - **limit**: Number of folders to return (max 1000)
    - **offset**: Number of folders to skip
    - **sort_by**: Field to sort by (name, slug, created_at, updated_at)
    - **sort_order**: Sort order (ASC or DESC)
    """
    return await notes_service.get_folders(
        search_term=search_term,
        is_system=is_system,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
        access_token=current_user.get("access_token")
    )

# ==================== NOTES ====================

@router.post("/", response_model=NoteUpsertResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    note: NoteCreate,
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Create a new note.
    """
    return await notes_service.upsert_note(
        folder_id=note.folder_id,
        title=note.title,
        content=note.content,
        is_pinned=note.is_pinned,
        is_favorite=note.is_favorite,
        is_archived=note.is_archived,
        metadata=note.metadata,
        access_token=current_user.get("access_token")
    )

@router.put("/{note_id}", response_model=NoteUpsertResponse)
async def update_note(
    note_id: UUID,
    note: NoteUpdate,
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Update an existing note.
    """
    # Build update params from provided fields only
    update_params = {}
    if note.folder_id is not None:
        update_params['folder_id'] = note.folder_id
    if note.title is not None:
        update_params['title'] = note.title
    if note.content is not None:
        update_params['content'] = note.content
    if note.is_pinned is not None:
        update_params['is_pinned'] = note.is_pinned
    if note.is_favorite is not None:
        update_params['is_favorite'] = note.is_favorite
    if note.is_archived is not None:
        update_params['is_archived'] = note.is_archived
    if note.metadata is not None:
        update_params['metadata'] = note.metadata
    
    # Get current note to preserve existing values
    notes = await notes_service.get_notes(
        note_id=note_id,
        access_token=current_user.get("access_token")
    )
    
    if not notes:
        raise HTTPException(status_code=404, detail="Note not found")
    
    current_note = notes[0]
    
    return await notes_service.upsert_note(
        folder_id=update_params.get('folder_id', current_note.folder_id),
        title=update_params.get('title', current_note.title),
        content=update_params.get('content', current_note.content),
        is_pinned=update_params.get('is_pinned', current_note.is_pinned),
        is_favorite=update_params.get('is_favorite', current_note.is_favorite),
        is_archived=update_params.get('is_archived', current_note.is_archived),
        metadata=update_params.get('metadata', current_note.metadata),
        note_id=note_id,
        access_token=current_user.get("access_token")
    )

@router.get("/", response_model=List[NoteInDB])
async def get_notes(
    note_id: Optional[UUID] = Query(None),
    folder_slug: Optional[str] = Query(None),
    search_term: Optional[str] = Query(None),
    is_favorite: Optional[bool] = Query(None),
    is_pinned: Optional[bool] = Query(None),
    is_archived: bool = Query(False),
    include_deleted: bool = Query(False),
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    sort_by: str = Query('updated_at', regex='^(title|created_at|updated_at|is_pinned|is_favorite)$'),
    sort_order: str = Query('DESC', regex='^(ASC|DESC)$'),
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get notes with optional filtering and sorting.
    
    - **note_id**: Get a specific note by ID
    - **folder_slug**: Filter by folder slug
    - **search_term**: Search in note title and content
    - **is_favorite**: Filter by favorite status
    - **is_pinned**: Filter by pinned status
    - **is_archived**: Filter by archived status (default: false)
    - **include_deleted**: Include deleted notes (default: false)
    - **limit**: Number of notes to return (max 1000)
    - **offset**: Number of notes to skip
    - **sort_by**: Field to sort by
    - **sort_order**: Sort order (ASC or DESC)
    """
    return await notes_service.get_notes(
        note_id=note_id,
        folder_slug=folder_slug,
        search_term=search_term,
        is_favorite=is_favorite,
        is_pinned=is_pinned,
        is_archived=is_archived,
        include_deleted=include_deleted,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
        access_token=current_user.get("access_token")
    )

@router.get("/{note_id}", response_model=NoteInDB)
async def get_note(
    note_id: UUID,
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get a specific note by ID.
    """
    notes = await notes_service.get_notes(
        note_id=note_id,
        access_token=current_user.get("access_token")
    )
    
    if not notes:
        raise HTTPException(status_code=404, detail="Note not found")
    
    return notes[0]

@router.delete("/{note_id}", response_model=DeleteResponse)
async def delete_note(
    note_id: UUID,
    permanent: bool = Query(False),
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Delete a note.
    
    - **permanent**: If true, permanently delete the note (only works if note is in trash)
    - If false, move the note to trash (soft delete)
    """
    if permanent:
        return await notes_service.permanent_delete_note(
            note_id=note_id,
            access_token=current_user.get("access_token")
        )
    else:
        return await notes_service.delete_note(
            note_id=note_id,
            access_token=current_user.get("access_token")
        )

@router.post("/folders/{folder_id}/restore", response_model=DeleteResponse)
async def restore_note(
    folder_id: UUID,
    request: RestoreNoteRequest,
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Restore a note from trash.
    """
    return await notes_service.restore_note(
        note_id=request.note_id,
        target_folder_slug='notes',  # Default to 'notes' folder
        access_token=current_user.get("access_token")
    )

# ==================== TAGS ====================

@router.get("/tags/all", response_model=List[TagInDB])
async def get_tags_with_counts(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all tags with note counts.
    """
    tags = notes_service.get_tags_with_counts(
        access_token=current_user.get("access_token")
    )
    return [TagInDB(**tag) for tag in tags]

@router.get("/tags/search", response_model=List[TagInDB])
async def search_tags(
    search_term: str = Query(..., description="Search term for tags"),
    limit: int = Query(10, description="Maximum number of results"),
    current_user: dict = Depends(get_current_user)
):
    """
    Search tags by name.
    """
    tags = notes_service.search_tags(
        search_term=search_term,
        limit=limit,
        access_token=current_user.get("access_token")
    )
    return [TagInDB(**tag) for tag in tags]

@router.post("/tags/{tag_id}/rename", response_model=Dict[str, Any])
async def rename_tag(
    tag_id: UUID,
    new_name: str = Query(..., description="New name for the tag"),
    current_user: dict = Depends(get_current_user)
):
    """
    Rename a tag.
    """
    result = notes_service.rename_tag(
        tag_id=str(tag_id),
        new_name=new_name,
        access_token=current_user.get("access_token")
    )
    return result

@router.delete("/tags/{tag_id}", response_model=Dict[str, Any])
async def delete_tag(
    tag_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a tag.
    """
    result = notes_service.delete_tag(
        tag_id=str(tag_id),
        access_token=current_user.get("access_token")
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to delete tag"))
    return result

@router.post("/tags/tag-note")
async def tag_note(
    request: TagNoteRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Add a tag to a note.
    """
    success = notes_service.tag_note(
        note_id=str(request.note_id),
        tag_name=request.tag_name,
        tag_color=request.tag_color,
        access_token=current_user.get("access_token")
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to tag note")
    return {"success": True}

@router.delete("/tags/untag-note")
async def untag_note(
    request: UntagNoteRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Remove a tag from a note.
    """
    success = notes_service.untag_note(
        note_id=str(request.note_id),
        tag_id=str(request.tag_id),
        access_token=current_user.get("access_token")
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to untag note")
    return {"success": True}

@router.get("/tags/{tag_id}/notes", response_model=List[NoteInDB])
async def get_notes_by_tag(
    tag_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all notes with a specific tag.
    """
    notes = notes_service.get_notes_by_tag(
        tag_id=str(tag_id),
        access_token=current_user.get("access_token")
    )
    return [NoteInDB(**note) for note in notes]

@router.get("/notes/{note_id}/tags", response_model=List[TagInDB])
async def get_note_tags(
    note_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all tags for a specific note.
    """
    tags = notes_service.get_note_tags(
        note_id=str(note_id),
        access_token=current_user.get("access_token")
    )
    return [TagInDB(**tag) for tag in tags]

@router.post("/tags/get-or-create", response_model=TagInDB)
async def get_or_create_tag(
    name: str = Query(..., description="Tag name"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get or create a tag.
    """
    tag = notes_service.get_or_create_tag(
        name=name,
        user_id=current_user.get("id"),
        access_token=current_user.get("access_token")
    )
    if not tag:
        raise HTTPException(status_code=400, detail="Failed to get or create tag")
    return TagInDB(**tag)

# ==================== TEMPLATES ====================

@router.get("/templates", response_model=List[TemplateInDB])
async def get_templates(
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get all templates (user's + system templates).
    """
    templates = notes_service.get_templates(
        access_token=current_user.get("access_token")
    )
    return [TemplateInDB(**template) for template in templates]

@router.get("/templates/{template_id}", response_model=TemplateInDB)
async def get_template(
    template_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a single template by ID.
    """
    template = notes_service.get_template(
        template_id=str(template_id),
        access_token=current_user.get("access_token")
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateInDB(**template)

@router.post("/templates", response_model=Dict[str, Any])
async def create_template(
    template: TemplateCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new template.
    """
    template_id = notes_service.create_template(
        name=template.name,
        description=template.description,
        content=template.content,
        access_token=current_user.get("access_token")
    )
    if not template_id:
        raise HTTPException(status_code=400, detail="Failed to create template")
    return {"id": template_id, "success": True}

@router.put("/templates/{template_id}", response_model=Dict[str, Any])
async def update_template(
    template_id: UUID,
    template: TemplateUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update a template.
    """
    success = notes_service.update_template(
        template_id=str(template_id),
        name=template.name,
        description=template.description,
        content=template.content,
        access_token=current_user.get("access_token")
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update template")
    return {"success": True}

@router.delete("/templates/{template_id}", response_model=Dict[str, Any])
async def delete_template(
    template_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a template.
    """
    success = notes_service.delete_template(
        template_id=str(template_id),
        access_token=current_user.get("access_token")
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete template")
    return {"success": True}

# ==================== FAVORITES ====================

@router.post("/notes/{note_id}/favorite", response_model=Dict[str, Any])
async def toggle_note_favorite(
    note_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Toggle favorite status of a note.
    """
    new_status = notes_service.toggle_note_favorite(
        note_id=str(note_id),
        access_token=current_user.get("access_token")
    )
    if new_status is None:
        raise HTTPException(status_code=400, detail="Failed to toggle favorite")
    return {"is_favorite": new_status}

@router.get("/favorites", response_model=List[NoteInDB])
async def get_favorite_notes(
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get all favorite notes for the current user.
    """
    return await notes_service.get_notes(
        is_favorite=True,
        include_deleted=False,
        sort_by='updated_at',
        sort_order='DESC',
        access_token=current_user.get("access_token")
    )

@router.get("/trash", response_model=List[NoteInDB])
async def get_trash_notes(
    current_user: dict = Depends(get_current_user_with_token)
):
    """
    Get all deleted notes (trash) for the current user.
    """
    return await notes_service.get_notes(
        include_deleted=True,
        is_deleted=True,
        sort_by='updated_at',
        sort_order='DESC',
        access_token=current_user.get("access_token")
    )

# ==================== TRASH OPERATIONS ====================

@router.post("/notes/{note_id}/trash", response_model=Dict[str, Any])
async def move_note_to_trash(
    note_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Move a note to trash.
    """
    success = notes_service.move_note_to_trash(
        note_id=str(note_id),
        access_token=current_user.get("access_token")
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to move note to trash")
    return {"success": True}

@router.post("/notes/{note_id}/restore-from-trash", response_model=Dict[str, Any])
async def restore_note_from_trash(
    note_id: UUID,
    target_folder_id: Optional[UUID] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Restore a note from trash.
    """
    success = notes_service.restore_note_from_trash(
        note_id=str(note_id),
        target_folder_id=str(target_folder_id) if target_folder_id else None,
        access_token=current_user.get("access_token")
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to restore note from trash")
    return {"success": True}

# ==================== FOLDER OPERATIONS ====================

@router.get("/folders/slug/{folder_slug}", response_model=FolderInDB)
async def get_folder_by_slug(
    folder_slug: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a folder by its slug.
    """
    folder = notes_service.get_folder_by_slug(
        folder_slug=folder_slug,
        access_token=current_user.get("access_token")
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return FolderInDB(**folder)

# ==================== ADMIN OPERATIONS ====================

@router.post("/admin/folders/system", response_model=Dict[str, Any])
async def create_system_folder(
    folder_name: str = Query(..., description="Name of the system folder"),
    folder_slug: str = Query(..., description="Unique slug for the system folder"),
    folder_description: Optional[str] = Query(None, description="Description of the system folder"),
    current_user: dict = Depends(get_current_user)
):
    """
    Create a system folder (admin only).
    """
    # Check if user is admin (you may need to add this check based on your user model)
    folder_id = notes_service.create_system_folder(
        folder_name=folder_name,
        folder_slug=folder_slug,
        folder_description=folder_description,
        access_token=current_user.get("access_token")
    )
    if not folder_id:
        raise HTTPException(status_code=400, detail="Failed to create system folder")
    return {"id": folder_id, "success": True}

@router.post("/admin/templates/system", response_model=Dict[str, Any])
async def create_system_template(
    name: str = Query(..., description="Name of the system template"),
    description: str = Query(..., description="Description of the system template"),
    content: Optional[Dict[str, Any]] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a system template (admin only).
    """
    # Check if user is admin (you may need to add this check based on your user model)
    template_id = notes_service.create_system_template(
        name=name,
        description=description,
        content=content,
        access_token=current_user.get("access_token")
    )
    if not template_id:
        raise HTTPException(status_code=400, detail="Failed to create system template")
    return {"id": template_id, "success": True}
