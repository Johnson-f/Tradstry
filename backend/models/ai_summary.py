"""
AI Summary Models - Pydantic models for AI summary system
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime, date
from enum import Enum
from uuid import UUID


class TimeRange(str, Enum):
    SEVEN_DAYS = "7d"
    THIRTY_DAYS = "30d"
    NINETY_DAYS = "90d"
    ONE_YEAR = "1y"
    YEAR_TO_DATE = "ytd"
    ALL_TIME = "all_time"
    CUSTOM = "custom"


class AnalysisStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ModelType(str, Enum):
    DATA_ANALYZER = "data_analyzer"
    INSIGHT_GENERATOR = "insight_generator"
    REPORT_WRITER = "report_writer"
    CHAT_ASSISTANT = "chat_assistant"


# Request Models
class GenerateAnalysisRequest(BaseModel):
    time_range: TimeRange = Field(default=TimeRange.THIRTY_DAYS)
    custom_start_date: Optional[date] = None
    custom_end_date: Optional[date] = None
    include_raw_data: bool = Field(default=False)
    
    class Config:
        use_enum_values = True


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    context_id: Optional[str] = None


class QuickInsightsRequest(BaseModel):
    time_range: TimeRange = Field(default=TimeRange.SEVEN_DAYS)
    
    class Config:
        use_enum_values = True


# Response Models
class PerformanceSummary(BaseModel):
    win_rate: float = Field(..., ge=0, le=100)
    profit_factor: float = Field(..., ge=0)
    trade_expectancy: float
    total_trades: int = Field(..., ge=0)
    net_pnl: float


class RiskAssessment(BaseModel):
    risk_reward_ratio: float = Field(..., ge=0)
    avg_hold_time_hours: float = Field(..., ge=0)
    position_consistency: float = Field(..., ge=0, le=1)
    max_drawdown: Optional[float] = None


class BehavioralFlags(BaseModel):
    longest_winning_streak: int = Field(..., ge=0)
    longest_losing_streak: int = Field(..., ge=0)
    directional_bias: str = Field(..., regex="^(bullish_bias|bearish_bias|balanced|unknown)$")
    emotional_trading_score: Optional[float] = Field(None, ge=0, le=1)


class TopSymbol(BaseModel):
    symbol: str
    total_pnl: float
    ranking_type: str
    trade_count: Optional[int] = None
    win_rate: Optional[float] = None


class QuickInsights(BaseModel):
    performance_summary: PerformanceSummary
    risk_assessment: RiskAssessment
    behavioral_flags: BehavioralFlags
    top_symbols: List[TopSymbol]
    time_period: str


class ModelStatus(BaseModel):
    loaded: bool
    ready: bool
    model_name: Optional[str] = None
    last_used: Optional[datetime] = None


class AIServiceStatus(BaseModel):
    service_status: str = Field(..., regex="^(operational|degraded|error|maintenance)$")
    models: Dict[str, ModelStatus]
    chat_enabled: bool
    timestamp: datetime


class AnalysisResult(BaseModel):
    success: bool
    analysis_id: str
    timestamp: datetime
    time_period: str
    status: AnalysisStatus
    
    # Analysis outputs
    report: Optional[str] = None
    data_analysis: Optional[str] = None
    insights: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None
    
    # Metadata
    processing_time_seconds: Optional[float] = None
    model_versions: Optional[Dict[str, str]] = None
    chat_enabled: bool = False
    
    # Error handling
    error: Optional[str] = None
    error_details: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    question: str
    answer: str
    timestamp: datetime
    context_id: Optional[str] = None
    confidence_score: Optional[float] = Field(None, ge=0, le=1)


class QuickInsightsResponse(BaseModel):
    success: bool
    insights: QuickInsights
    timestamp: datetime
    cache_hit: bool = False


# Database Models
class AnalysisHistory(BaseModel):
    id: str
    user_id: str
    time_range: str
    custom_start_date: Optional[date] = None
    custom_end_date: Optional[date] = None
    status: AnalysisStatus
    created_at: datetime
    completed_at: Optional[datetime] = None
    report_text: Optional[str] = None
    insights_text: Optional[str] = None
    raw_data_json: Optional[Dict[str, Any]] = None
    processing_time_seconds: Optional[float] = None
    error_message: Optional[str] = None


class ChatHistory(BaseModel):
    id: str
    user_id: str
    analysis_id: str
    question: str
    answer: str
    timestamp: datetime
    confidence_score: Optional[float] = None


# Configuration Models
class ModelConfig(BaseModel):
    model_id: str
    purpose: str
    max_tokens: int = 512
    temperature: float = 0.7
    use_quantization: bool = True
    cache_enabled: bool = True


class AISystemConfig(BaseModel):
    model_size: str = Field(..., regex="^(small|medium|large)$")
    use_gpu: bool = True
    gpu_memory_fraction: float = Field(0.8, ge=0.1, le=1.0)
    enable_model_cache: bool = True
    cache_dir: str = "./model_cache"
    models: Dict[str, ModelConfig]


# Validation Models
class ValidationResult(BaseModel):
    is_valid: bool
    errors: List[str] = []
    warnings: List[str] = []


# Analytics Models for tracking
class UsageMetrics(BaseModel):
    total_analyses: int = 0
    total_chat_interactions: int = 0
    avg_processing_time: float = 0.0
    success_rate: float = 0.0
    most_common_time_range: Optional[str] = None
    peak_usage_hours: List[int] = []


class ModelPerformance(BaseModel):
    model_type: ModelType
    avg_response_time: float
    success_rate: float
    total_requests: int
    last_24h_requests: int
    error_rate: float


# Vector Storage Models
class AIReportCreate(BaseModel):
    """Model for creating AI report in vector database"""
    user_id: UUID
    time_period: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    report_title: str
    executive_summary: str
    full_report: str
    data_analysis: str
    insights: str
    win_rate: Optional[float] = None
    profit_factor: Optional[float] = None
    trade_expectancy: Optional[float] = None
    total_trades: Optional[int] = None
    net_pnl: Optional[float] = None
    tags: Optional[List[str]] = None
    model_versions: Optional[Dict[str, Any]] = None
    processing_time_ms: Optional[int] = None


class AIReportResponse(BaseModel):
    """Model for AI report from vector database"""
    id: UUID
    time_period: str
    start_date: Optional[date]
    end_date: Optional[date]
    generated_at: datetime
    report_title: str
    executive_summary: str
    full_report: Optional[str] = None  # Only included in detailed view
    data_analysis: Optional[str] = None  # Only included in detailed view
    insights: Optional[str] = None  # Only included in detailed view
    win_rate: Optional[float]
    profit_factor: Optional[float]
    trade_expectancy: Optional[float]
    total_trades: Optional[int]
    net_pnl: Optional[float]
    tags: Optional[List[str]]
    model_versions: Optional[Dict[str, Any]] = None
    processing_time_ms: Optional[int]
    similarity_score: Optional[float] = None  # For similarity search results


class AIReportStats(BaseModel):
    """Model for AI report statistics"""
    total_reports: int
    avg_win_rate: Optional[float]
    avg_profit_factor: Optional[float]
    avg_processing_time_ms: Optional[int]
    most_common_tags: Optional[List[str]]
    best_performing_period: Optional[str]
    reports_this_month: int
    improvement_trend: str  # 'improving', 'declining', 'stable', 'insufficient_data'


class SimilarReportsRequest(BaseModel):
    """Request model for finding similar reports"""
    query_text: str
    similarity_threshold: float = Field(default=0.8, ge=0.0, le=1.0)
    limit: int = Field(default=10, ge=1, le=50)
    search_type: str = Field(default="report", pattern="^(report|summary)$")


class ReportSearchRequest(BaseModel):
    """Request model for searching reports"""
    time_period: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    tags: Optional[List[str]] = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    order_by: str = Field(default="generated_at", pattern="^(generated_at|win_rate|net_pnl)$")
    order_direction: str = Field(default="DESC", pattern="^(ASC|DESC)$")


# Export all models
__all__ = [
    "TimeRange",
    "AnalysisStatus", 
    "ModelType",
    "GenerateAnalysisRequest",
    "ChatRequest",
    "QuickInsightsRequest",
    "PerformanceSummary",
    "RiskAssessment",
    "BehavioralFlags",
    "TopSymbol",
    "QuickInsights",
    "ModelStatus",
    "AIServiceStatus",
    "AnalysisResult",
    "ChatResponse",
    "QuickInsightsResponse",
    "AnalysisHistory",
    "ChatHistory",
    "ModelConfig",
    "AISystemConfig",
    "ValidationResult",
    "UsageMetrics",
    "ModelPerformance",
    "AIReportCreate",
    "AIReportResponse", 
    "AIReportStats",
    "SimilarReportsRequest",
    "ReportSearchRequest"
]
