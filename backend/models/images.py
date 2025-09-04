from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

class ImageBase(BaseModel):
    note_id: Optional[UUID] = None
    filename: str
    original_filename: str
    file_path: str
    file_size: int
    mime_type: str
    width: Optional[int] = None
    height: Optional[int] = None
    alt_text: Optional[str] = None
    caption: Optional[str] = None

class ImageCreate(ImageBase):
    pass

class ImageUpdate(BaseModel):
    note_id: Optional[UUID] = None
    filename: Optional[str] = None
    original_filename: Optional[str] = None
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    alt_text: Optional[str] = None
    caption: Optional[str] = None

class ImageInDB(ImageBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class ImageUpsertResponse(BaseModel):
    id: UUID
    user_id: UUID
    note_id: Optional[UUID]
    filename: str
    original_filename: str
    file_path: str
    file_size: int
    mime_type: str
    width: Optional[int]
    height: Optional[int]
    alt_text: Optional[str]
    caption: Optional[str]
    created_at: datetime
    updated_at: datetime

class ImageDeleteResponse(BaseModel):
    success: bool
    deleted_record: Optional[ImageInDB] = None
    error: Optional[str] = None

class BulkImageDeleteResponse(BaseModel):
    success: bool
    deleted_count: int
    deleted_records: List[ImageInDB] = []
    error: Optional[str] = None

class ImageSearchRequest(BaseModel):
    search_term: str
    limit: Optional[int] = 50
    offset: Optional[int] = 0

class ImagePaginationRequest(BaseModel):
    limit: Optional[int] = 20
    offset: Optional[int] = 0
