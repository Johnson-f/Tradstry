from pydantic import BaseModel, Field, model_validator
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum

class ReportType(str, Enum):
    """Enumeration for AI report types."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEAR_TO_DATE = "year-to-date"
    YEARLY = "yearly"
    CUSTOM = "custom"

class ReportStatus(str, Enum):
    """Enumeration for AI report status."""
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class AIReportBase(BaseModel):
    """Base model for AI reports."""
    report_type: ReportType = Field(description="Type of the AI report")
    title: str = Field(max_length=255, description="Title of the report")
    content: str = Field(description="Main content of the report")
    insights: Optional[Dict[str, Any]] = Field(default=None, description="Structured insights data")
    recommendations: Optional[Dict[str, Any]] = Field(default=None, description="AI-generated recommendations")
    metrics: Optional[Dict[str, Any]] = Field(default=None, description="Key metrics calculated for this report")
    date_range_start: Optional[datetime] = Field(default=None, description="Start date for the report period")
    date_range_end: Optional[datetime] = Field(default=None, description="End date for the report period")
    model_used: Optional[str] = Field(default=None, max_length=100, description="AI model that generated this report")
    confidence_score: Optional[float] = Field(default=None, ge=0, le=1, description="AI confidence in the analysis")
    status: ReportStatus = Field(default=ReportStatus.COMPLETED, description="Report generation status")

class AIReportCreate(AIReportBase):
    """Model for creating AI reports."""
    pass

class AIReportUpdate(BaseModel):
    """Model for updating AI reports."""
    report_type: Optional[ReportType] = None
    title: Optional[str] = Field(default=None, max_length=255)
    content: Optional[str] = None
    insights: Optional[Dict[str, Any]] = None
    recommendations: Optional[Dict[str, Any]] = None
    metrics: Optional[Dict[str, Any]] = None
    date_range_start: Optional[datetime] = None
    date_range_end: Optional[datetime] = None
    model_used: Optional[str] = Field(default=None, max_length=100)
    confidence_score: Optional[float] = Field(default=None, ge=0, le=1)
    status: Optional[ReportStatus] = None

class AIReportInDB(AIReportBase):
    """Model for AI reports as stored in database."""
    id: str = Field(description="Unique identifier for the report")
    user_id: str = Field(description="User who owns this report")
    processing_time_ms: Optional[int] = Field(default=None, description="Time taken to generate the report")
    created_at: datetime = Field(description="When the report was created")
    updated_at: datetime = Field(description="When the report was last updated")

class AIReportResponse(AIReportInDB):
    """Model for AI report API responses."""
    content_preview: Optional[str] = Field(default=None, description="Preview of the content (first 200 chars)")

class AIReportUpsertResponse(BaseModel):
    """Response model for upsert operations."""
    id: str
    user_id: str
    report_type: ReportType
    title: str
    content: str
    insights: Optional[Dict[str, Any]]
    recommendations: Optional[Dict[str, Any]]
    metrics: Optional[Dict[str, Any]]
    date_range_start: Optional[datetime]
    date_range_end: Optional[datetime]
    model_used: Optional[str]
    processing_time_ms: Optional[int]
    confidence_score: Optional[float]
    status: ReportStatus
    created_at: datetime
    updated_at: datetime
    operation_type: str = Field(description="'created' or 'updated'")

class AIReportGenerateRequest(BaseModel):
    """Request model for generating AI reports."""
    report_type: ReportType = Field(description="Type of report to generate")
    time_range: str = Field(default="30d", description="Time range for analysis (7d, 30d, 90d, 1y, ytd, custom, all_time)")
    custom_start_date: Optional[datetime] = Field(default=None, description="Custom start date for analysis")
    custom_end_date: Optional[datetime] = Field(default=None, description="Custom end date for analysis")
    model_preference: Optional[str] = Field(default=None, description="Preferred AI model to use")
    include_tracking_data: bool = Field(default=True, description="Whether to include trade notes and tracking data")

    @model_validator(mode='after')
    def validate_custom_dates(self):
        """Validate custom date requirements."""
        if self.time_range == "custom" and self.custom_start_date is None:
            raise ValueError("custom_start_date is required when time_range is 'custom'")
        
        if self.custom_start_date and self.custom_end_date:
            if self.custom_end_date <= self.custom_start_date:
                raise ValueError("custom_end_date must be after custom_start_date")
        
        return self

class AIReportListResponse(BaseModel):
    """Response model for listing AI reports."""
    reports: List[AIReportResponse]
    total_count: int
    page: int
    page_size: int
    has_next: bool

class DeleteResponse(BaseModel):
    """Response model for delete operations."""
    id: str
    title: str
    report_type: ReportType
    deleted_at: datetime
    operation_type: str = Field(description="'soft_deleted' or 'permanently_deleted'")
