from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

class FolderBase(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    is_system: bool = False

class FolderCreate(FolderBase):
    pass

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class FolderInDB(FolderBase):
    id: UUID
    user_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    total_count: Optional[int] = None
    
    class Config:
        from_attributes = True

class NoteBase(BaseModel):
    folder_id: UUID
    title: str = "Untitled Note"
    content: Dict[str, Any] = Field(default_factory=dict)
    is_pinned: bool = False
    is_favorite: bool = False
    is_archived: bool = False
    metadata: Optional[Dict[str, Any]] = None

class NoteCreate(NoteBase):
    pass

class NoteUpdate(BaseModel):
    folder_id: Optional[UUID] = None
    title: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    is_pinned: Optional[bool] = None
    is_favorite: Optional[bool] = None
    is_archived: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None

class NoteInDB(NoteBase):
    id: UUID
    user_id: Optional[UUID] = None
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    version: int = 1
    content_preview: Optional[str] = None
    total_count: Optional[int] = None
    
    class Config:
        from_attributes = True

class NoteUpsertResponse(BaseModel):
    note_id: UUID
    was_created: bool

class DeleteResponse(BaseModel):
    success: bool
    message: str

class RestoreNoteRequest(BaseModel):
    """Request model for restoring a note"""
    note_id: UUID

# ==================== TAGS ====================

class TagBase(BaseModel):
    """Base tag model"""
    name: str
    color: Optional[str] = '#6B7280'

class TagCreate(TagBase):
    """Create tag model"""
    pass

class TagUpdate(BaseModel):
    """Update tag model"""
    name: Optional[str] = None
    color: Optional[str] = None

class TagInDB(TagBase):
    """Tag database representation"""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    note_count: Optional[int] = 0

    class Config:
        from_attributes = True

class TagNoteRequest(BaseModel):
    """Request to tag/untag a note"""
    note_id: UUID
    tag_name: str
    tag_color: Optional[str] = None

class UntagNoteRequest(BaseModel):
    """Request to remove tag from note"""
    note_id: UUID
    tag_id: UUID

# ==================== TEMPLATES ====================

class TemplateBase(BaseModel):
    """Base template model"""
    name: str
    description: Optional[str] = None
    content: Dict[str, Any] = {"root": {"children": []}}

class TemplateCreate(TemplateBase):
    """Create template model"""
    pass

class TemplateUpdate(BaseModel):
    """Update template model"""
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[Dict[str, Any]] = None

class TemplateInDB(TemplateBase):
    """Template database representation"""
    id: UUID
    user_id: Optional[UUID] = None
    is_system: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
