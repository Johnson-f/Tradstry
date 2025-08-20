from pydantic import BaseModel, Field, validator, UUID4
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from uuid import UUID

# Folder Models
class FolderBase(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    is_system: bool = False

    @validator('name')
    def name_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Folder name cannot be empty')
        return v.strip()

    @validator('slug')
    def slug_must_be_valid(cls, v):
        if not v or not v.strip():
            raise ValueError('Folder slug cannot be empty')
        # Convert to lowercase and replace spaces with hyphens
        slug = v.lower().strip().replace(' ', '-')
        # Remove any characters that are not alphanumeric or hyphens
        import re
        slug = re.sub(r'[^a-z0-9-]', '', slug)
        return slug

class FolderCreate(FolderBase):
    pass

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None

    @validator('name')
    def name_must_not_be_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Folder name cannot be empty')
        return v.strip() if v else None

    @validator('slug')
    def slug_must_be_valid(cls, v):
        if v is None:
            return None
        if not v.strip():
            raise ValueError('Folder slug cannot be empty')
        # Convert to lowercase and replace spaces with hyphens
        slug = v.lower().strip().replace(' ', '-')
        # Remove any characters that are not alphanumeric or hyphens
        import re
        slug = re.sub(r'[^a-z0-9-]', '', slug)
        return slug

class FolderInDB(FolderBase):
    id: UUID4
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Note Models
class NoteBase(BaseModel):
    title: str
    content: Dict[str, Any]
    folder_id: UUID4
    is_pinned: bool = False
    is_favorite: bool = False
    is_archived: bool = False
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    version: int = 1
    metadata: Optional[Dict[str, Any]] = None
    tags: List[str] = Field(default_factory=list)
    template_id: Optional[UUID4] = None

class NoteCreate(NoteBase):
    pass

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    folder_id: Optional[UUID4] = None
    is_pinned: Optional[bool] = None
    is_favorite: Optional[bool] = None
    is_archived: Optional[bool] = None
    is_deleted: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None

class NoteInDB(NoteBase):
    id: UUID4
    user_id: str
    created_at: datetime
    updated_at: datetime

    @validator('content', pre=True)
    def validate_content(cls, v):
        if not isinstance(v, dict):
            try:
                import json
                if isinstance(v, str):
                    return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                pass
            return {}
        return v

    class Config:
        from_attributes = True

# Tag Models
class TagBase(BaseModel):
    name: str
    color: str

class TagCreate(TagBase):
    pass

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

class TagInDB(TagBase):
    id: UUID4
    user_id: str
    created_at: datetime
    updated_at: datetime
    note_count: Optional[int] = 0

    class Config:
        from_attributes = True

# Template Models
class TemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    content: Dict[str, Any] = Field(default_factory=lambda: {"root": {"children": []}})
    is_system: bool = False

    @validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('Template name cannot be empty')
        return v.strip()

    @validator('content')
    def validate_content(cls, v):
        if not isinstance(v, dict):
            try:
                import json
                if isinstance(v, str):
                    return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                pass
            raise ValueError('Content must be a valid JSON object')
        return v

class TemplateCreate(TemplateBase):
    is_system: Literal[False] = False  # Prevent setting is_system via API

class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    content: Optional[Dict[str, Any]] = None

    @validator('name')
    def validate_name(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Template name cannot be empty')
        return v.strip() if v else None

    @validator('content')
    def validate_content(cls, v):
        if v is not None and not isinstance(v, dict):
            try:
                import json
                if isinstance(v, str):
                    return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                raise ValueError('Content must be a valid JSON object')
        return v

class TemplateInDB(TemplateBase):
    id: UUID4
    user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Response Models
class NoteWithRelations(NoteInDB):
    folder: Optional[FolderInDB] = None
    tags: List[TagInDB] = []
    template: Optional[TemplateInDB] = None

class FolderWithRelations(FolderInDB):
    notes: List[NoteInDB] = []
    subfolders: List['FolderWithRelations'] = []
    parent: Optional['FolderWithRelations'] = None

# Update forward reference
FolderWithRelations.update_forward_refs()
