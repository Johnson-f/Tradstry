from pydantic import BaseModel, Field, model_validator
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum

class InsightType(str, Enum):
    """Enumeration for AI insight types."""
    PATTERN = "pattern"
    RISK = "risk"
    OPPORTUNITY = "opportunity"
    PERFORMANCE = "performance"
    RECOMMENDATION = "recommendation"
    ALERT = "alert"

class InsightPriority(str, Enum):
    """Enumeration for insight priority levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class AIInsightBase(BaseModel):
    """Base model for AI insights."""
    insight_type: InsightType = Field(description="Type of insight")
    title: str = Field(max_length=255, description="Title of the insight")
    description: str = Field(description="Detailed description of the insight")
    data_source: Optional[Dict[str, Any]] = Field(default=None, description="What data this insight is based on")
    confidence_score: Optional[float] = Field(default=None, ge=0, le=1, description="AI confidence in the insight")
    priority: InsightPriority = Field(default=InsightPriority.MEDIUM, description="Priority level")
    actionable: bool = Field(default=True, description="Whether this insight has actionable recommendations")
    actions: Optional[Dict[str, Any]] = Field(default=None, description="Suggested actions based on this insight")
    tags: Optional[List[str]] = Field(default=None, description="Categorization tags")
    valid_until: Optional[datetime] = Field(default=None, description="When this insight expires")
    model_used: Optional[str] = Field(default=None, max_length=100, description="AI model that generated this insight")

class AIInsightCreate(AIInsightBase):
    """Model for creating AI insights."""
    pass

class AIInsightUpdate(BaseModel):
    """Model for updating AI insights."""
    insight_type: Optional[InsightType] = None
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    data_source: Optional[Dict[str, Any]] = None
    confidence_score: Optional[float] = Field(default=None, ge=0, le=1)
    priority: Optional[InsightPriority] = None
    actionable: Optional[bool] = None
    actions: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    valid_until: Optional[datetime] = None
    model_used: Optional[str] = Field(default=None, max_length=100)

class AIInsightInDB(AIInsightBase):
    """Model for AI insights as stored in database."""
    id: str = Field(description="Unique identifier for the insight")
    user_id: str = Field(description="User who owns this insight")
    created_at: Optional[datetime] = Field(default=None, description="When the insight was created")
    updated_at: Optional[datetime] = Field(default=None, description="When the insight was last updated")

class AIInsightResponse(AIInsightInDB):
    """Model for AI insight API responses."""
    description_preview: Optional[str] = Field(default=None, description="Preview of description (first 200 chars)")
    is_expired: bool = Field(description="Whether the insight has expired")
    similarity_score: Optional[float] = Field(default=None, description="Similarity score when using vector search")

class AIInsightGenerateRequest(BaseModel):
    """Request model for generating AI insights."""
    insight_types: Optional[List[InsightType]] = Field(default=None, description="Types of insights to generate")
    time_range: str = Field(default="30d", description="Time range for analysis")
    custom_start_date: Optional[datetime] = Field(default=None, description="Custom start date")
    custom_end_date: Optional[datetime] = Field(default=None, description="Custom end date")
    include_tracking_data: bool = Field(default=True, description="Include trade notes data")
    min_confidence: float = Field(default=0.7, ge=0, le=1, description="Minimum confidence threshold")
    model_preference: Optional[str] = Field(default=None, description="Preferred AI model")

    @model_validator(mode='after')
    def validate_custom_dates(self):
        """Validate custom date requirements."""
        if self.time_range == "custom" and self.custom_start_date is None:
            raise ValueError("custom_start_date is required when time_range is 'custom'")
        
        if self.custom_start_date and self.custom_end_date:
            if self.custom_end_date <= self.custom_start_date:
                raise ValueError("custom_end_date must be after custom_start_date")
        
        return self

class AIInsightUpsertResponse(BaseModel):
    """Response model for upsert operations."""
    id: str
    user_id: str
    insight_type: InsightType
    title: str
    description: str
    data_source: Optional[Dict[str, Any]]
    confidence_score: Optional[float]
    priority: InsightPriority
    actionable: bool
    actions: Optional[Dict[str, Any]]
    tags: Optional[List[str]]
    valid_until: Optional[datetime]
    model_used: Optional[str]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    operation_type: str = Field(description="'created' or 'updated'")

class AIInsightListResponse(BaseModel):
    """Response model for listing AI insights."""
    insights: List[AIInsightResponse]
    total_count: int
    page: int
    page_size: int
    has_next: bool

class PriorityInsightsResponse(BaseModel):
    """Response model for priority insights."""
    id: str
    insight_type: InsightType
    title: str
    description_preview: str
    priority: InsightPriority
    actionable: bool
    actions: Optional[Dict[str, Any]]
    valid_until: Optional[datetime]
    is_expired: bool
    created_at: datetime

class ActionableInsightsResponse(BaseModel):
    """Response model for actionable insights."""
    id: str
    insight_type: InsightType
    title: str
    description_preview: str
    priority: InsightPriority
    actions: Dict[str, Any]
    tags: Optional[List[str]]
    confidence_score: Optional[float]
    valid_until: Optional[datetime]
    created_at: datetime

class InsightDeleteResponse(BaseModel):
    """Response model for insight deletion operations."""
    id: str
    title: str
    insight_type: InsightType
    priority: InsightPriority
    deleted_at: datetime
    operation_type: str = Field(description="'soft_deleted' or 'permanently_deleted'")

class InsightExpireResponse(BaseModel):
    """Response model for insight expiration operations."""
    id: str
    title: str
    valid_until: Optional[datetime]
    expired_at: datetime
