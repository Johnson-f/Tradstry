from pydantic import BaseModel, Field, model_validator
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum

class MessageType(str, Enum):
    """Enumeration for chat message types."""
    USER_QUESTION = "user_question"
    AI_RESPONSE = "ai_response"

class SourceType(str, Enum):
    """Enumeration for AI response source types."""
    EXTERNAL_AI = "external_ai"
    VECTOR_MATCH = "vector_match"
    CACHED = "cached"

class AIChatMessageBase(BaseModel):
    """Base model for AI chat messages."""
    session_id: str = Field(description="Session ID grouping related messages")
    message_type: MessageType = Field(description="Type of message")
    content: str = Field(description="Message content")
    context_data: Optional[Dict[str, Any]] = Field(default=None, description="Trading data context used for response")
    model_used: Optional[str] = Field(default=None, max_length=100, description="AI model used")
    confidence_score: Optional[float] = Field(default=None, ge=0, le=1, description="AI confidence score")
    similarity_score: Optional[float] = Field(default=None, ge=0, le=1, description="Similarity score when found via search")
    source_type: SourceType = Field(default=SourceType.EXTERNAL_AI, description="Source type of the response")

class AIChatMessageCreate(AIChatMessageBase):
    """Model for creating AI chat messages."""
    pass

class AIChatMessageUpdate(BaseModel):
    """Model for updating AI chat messages."""
    content: Optional[str] = None
    context_data: Optional[Dict[str, Any]] = None
    model_used: Optional[str] = Field(default=None, max_length=100)
    confidence_score: Optional[float] = Field(default=None, ge=0, le=1)
    similarity_score: Optional[float] = Field(default=None, ge=0, le=1)
    source_type: Optional[SourceType] = None

class AIChatMessageInDB(AIChatMessageBase):
    """Model for AI chat messages as stored in database."""
    id: str = Field(description="Unique identifier for the message")
    user_id: str = Field(description="User who owns this message")
    processing_time_ms: Optional[int] = Field(default=None, description="Time taken to process")
    usage_count: int = Field(default=1, description="How many times this Q&A was reused")
    last_used_at: datetime = Field(description="When this message was last used")
    created_at: datetime = Field(description="When the message was created")

class AIChatMessageResponse(AIChatMessageInDB):
    """Model for AI chat message API responses."""
    content_preview: Optional[str] = Field(default=None, description="Preview of content (first 200 chars)")

class AIChatSessionCreate(BaseModel):
    """Model for creating a new chat session."""
    initial_message: str = Field(description="First message to start the session")
    context_data: Optional[Dict[str, Any]] = Field(default=None, description="Initial context data")

class AIChatSessionResponse(BaseModel):
    """Model for chat session information."""
    session_id: str
    message_count: int
    first_message: str
    last_message: str
    first_message_at: datetime
    last_message_at: datetime
    total_usage_count: int

class AIChatMessageRequest(BaseModel):
    """Request model for sending a chat message."""
    message: str = Field(description="User message")
    session_id: Optional[str] = Field(default=None, description="Existing session ID (creates new if not provided)")
    include_trading_context: bool = Field(default=True, description="Whether to include recent trading data")
    time_range: str = Field(default="30d", description="Time range for trading context")
    model_preference: Optional[str] = Field(default=None, description="Preferred AI model")

class AIChatRequest(BaseModel):
    """Request model for AI chat operations."""
    message: str = Field(description="User message")
    session_id: Optional[str] = Field(default=None, description="Existing session ID (creates new if not provided)")
    include_trading_context: bool = Field(default=True, description="Whether to include recent trading data")
    time_range: str = Field(default="30d", description="Time range for trading context")
    model_preference: Optional[str] = Field(default=None, description="Preferred AI model")
    context_limit: Optional[int] = Field(default=10, ge=1, le=50, description="Maximum number of context messages to include")

class AIChatResponse(BaseModel):
    """Response model for chat interactions."""
    session_id: str
    user_message: AIChatMessageResponse
    ai_response: AIChatMessageResponse
    context_used: Optional[Dict[str, Any]] = Field(default=None, description="Context data used for response")

class AIChatHistoryResponse(BaseModel):
    """Response model for chat history."""
    messages: List[AIChatMessageResponse]
    session_info: AIChatSessionResponse
    total_count: int
    page: int
    page_size: int
    has_next: bool

class AIChatSessionListResponse(BaseModel):
    """Response model for listing chat sessions."""
    sessions: List[AIChatSessionResponse]
    total_count: int
    page: int
    page_size: int
    has_next: bool

class AIChatUpsertResponse(BaseModel):
    """Response model for upsert operations."""
    id: str
    user_id: str
    session_id: str
    message_type: MessageType
    content: str
    context_data: Optional[Dict[str, Any]]
    model_used: Optional[str]
    processing_time_ms: Optional[int]
    confidence_score: Optional[float]
    similarity_score: Optional[float]
    source_type: SourceType
    usage_count: int
    last_used_at: datetime
    created_at: datetime
    operation_type: str = Field(description="'created' or 'updated'")

class ChatDeleteResponse(BaseModel):
    """Response model for chat deletion operations."""
    id: str
    session_id: str
    message_type: MessageType
    content_preview: str
    deleted_at: datetime
    operation_type: str

class ChatMessageDeleteResponse(BaseModel):
    """Response model for chat message deletion operations."""
    id: str
    session_id: str
    message_type: MessageType
    content_preview: str
    deleted_at: datetime
    operation_type: str
