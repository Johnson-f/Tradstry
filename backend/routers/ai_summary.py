"""
AI Summary Router - FastAPI endpoints for AI trading analysis
Provides endpoints for generating AI-powered trading insights and reports
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import date, datetime
import asyncio

from ..services.ai_summary_service_hosted import AITradingSummaryService
from ..services.auth_service import get_current_user
from ..models.user import User
from ..models.ai_summary import (
    AIReportResponse, AIReportStats, SimilarReportsRequest, 
    ReportSearchRequest
)

router = APIRouter(prefix="/ai-summary", tags=["AI Summary"])

# Global service instance
ai_service = AITradingSummaryService()

# Request/Response Models
class AnalysisRequest(BaseModel):
    time_range: str = Field(default="30d", description="Time range: 7d, 30d, 90d, 1y, ytd, all_time, custom")
    custom_start_date: Optional[date] = Field(default=None, description="Start date for custom range")
    custom_end_date: Optional[date] = Field(default=None, description="End date for custom range")

class ChatRequest(BaseModel):
    question: str = Field(..., description="User question about their trading data")

class AnalysisResponse(BaseModel):
    success: bool
    timestamp: str
    time_period: str
    report: str
    chat_enabled: bool
    error: Optional[str] = None

class ChatResponse(BaseModel):
    question: str
    answer: str
    timestamp: str

class QuickInsightsResponse(BaseModel):
    success: bool
    insights: Dict[str, Any]
    timestamp: str


@router.post("/generate", response_model=AnalysisResponse)
async def generate_ai_analysis(
    request: AnalysisRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Generate complete AI trading analysis report
    
    This endpoint processes the user's trading data through a 3-stage AI pipeline:
    1. Data Analyzer - Transforms raw data into structured insights
    2. Insight Generator - Generates psychological and strategic insights
    3. Report Writer - Creates actionable trading report
    """
    try:
        # Validate time range
        valid_ranges = ['7d', '30d', '90d', '1y', 'ytd', 'all_time', 'custom']
        if request.time_range not in valid_ranges:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid time_range. Must be one of: {', '.join(valid_ranges)}"
            )
        
        # Validate custom date range
        if request.time_range == 'custom':
            if not request.custom_start_date or not request.custom_end_date:
                raise HTTPException(
                    status_code=400,
                    detail="custom_start_date and custom_end_date required when time_range is 'custom'"
                )
            if request.custom_start_date > request.custom_end_date:
                raise HTTPException(
                    status_code=400,
                    detail="custom_start_date must be before custom_end_date"
                )
        
        # Generate analysis
        analysis = await ai_service.generate_complete_analysis(
            user_id=str(current_user.id),
            time_range=request.time_range,
            custom_start_date=request.custom_start_date,
            custom_end_date=request.custom_end_date
        )
        
        if not analysis.get("success"):
            raise HTTPException(
                status_code=500,
                detail=analysis.get("error", "Analysis generation failed")
            )
        
        return AnalysisResponse(
            success=True,
            timestamp=analysis["timestamp"],
            time_period=analysis["time_period"],
            report=analysis["report"],
            chat_enabled=analysis["chat_enabled"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(
    request: ChatRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Chat with AI about your trading analysis
    
    Ask follow-up questions about your trading data, performance, or get
    specific advice based on your generated analysis report.
    """
    try:
        if not request.question.strip():
            raise HTTPException(
                status_code=400,
                detail="Question cannot be empty"
            )
        
        # Get chat response
        answer = await ai_service.chat_about_analysis(request.question)
        
        if answer.startswith("Please generate"):
            raise HTTPException(
                status_code=400,
                detail="No analysis context available. Please generate an analysis report first."
            )
        
        return ChatResponse(
            question=request.question,
            answer=answer,
            timestamp=datetime.now().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Chat error: {str(e)}"
        )


@router.get("/quick-insights", response_model=QuickInsightsResponse)
async def get_quick_insights(
    time_range: str = "7d",
    current_user: User = Depends(get_current_user)
):
    """
    Get quick trading insights without full report generation
    
    Returns key metrics and brief insights for dashboard display.
    Faster than full analysis - good for overview widgets.
    """
    try:
        # Get raw trading data
        trading_data = await ai_service.get_trading_data(
            user_id=str(current_user.id),
            time_range=time_range
        )
        
        if "error" in trading_data:
            raise HTTPException(
                status_code=404,
                detail=trading_data["error"]
            )
        
        # Extract key insights from raw data
        core_metrics = trading_data.get("core_performance_metrics", {})
        behavior_metrics = trading_data.get("trading_behavior_metrics", {})
        streak_analysis = trading_data.get("streak_analysis", {})
        
        quick_insights = {
            "performance_summary": {
                "win_rate": core_metrics.get("win_rate_percentage", 0),
                "profit_factor": core_metrics.get("profit_factor", 0),
                "trade_expectancy": core_metrics.get("trade_expectancy", 0),
                "total_trades": _extract_total_trades(trading_data)
            },
            "risk_assessment": {
                "risk_reward_ratio": core_metrics.get("risk_reward_ratio", 0),
                "avg_hold_time_hours": behavior_metrics.get("average_trade_duration_hours", 0),
                "position_consistency": behavior_metrics.get("trade_size_consistency", 0)
            },
            "behavioral_flags": {
                "longest_winning_streak": streak_analysis.get("longest_winning_streak", 0),
                "longest_losing_streak": streak_analysis.get("longest_losing_streak", 0),
                "directional_bias": _analyze_directional_bias(trading_data)
            },
            "top_symbols": _extract_top_symbols(trading_data),
            "time_period": ai_service._format_time_period(time_range, None, None)
        }
        
        return QuickInsightsResponse(
            success=True,
            insights=quick_insights,
            timestamp=datetime.now().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Quick insights error: {str(e)}"
        )


@router.get("/status")
async def get_ai_status(current_user: User = Depends(get_current_user)):
    """
    Get AI service status and model information
    
    Returns information about loaded models and system status.
    """
    try:
        model_status = {}
        
        # Check each model type
        from ..services.ai_summary_service import ModelType
        for model_type in ModelType:
            pipeline = ai_service.model_manager.get_pipeline(model_type)
            model_status[model_type.value] = {
                "loaded": pipeline is not None,
                "ready": pipeline is not None
            }
        
        return {
            "service_status": "operational",
            "models": model_status,
            "chat_enabled": ai_service.chat_assistant.context_index is not None,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "service_status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


@router.delete("/chat/reset")
async def reset_chat_context(current_user: User = Depends(get_current_user)):
    """
    Reset chat conversation context
    
    Clears the chat history and context. User will need to generate
    a new analysis to re-enable chat functionality.
    """
    try:
        ai_service.chat_assistant.conversation_history = []
        ai_service.chat_assistant.context_index = None
        
        return {
            "success": True,
            "message": "Chat context reset successfully",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Reset error: {str(e)}"
        )


# Vector Database Endpoints
@router.get("/reports", response_model=List[AIReportResponse])
async def get_user_reports(
    request: ReportSearchRequest = Depends(),
    current_user: User = Depends(get_current_user)
):
    """Get user's AI reports with filtering and pagination"""
    try:
        from ..config.database import get_database_connection
        
        conn = await get_database_connection()
        
        results = await conn.fetch("""
            SELECT * FROM get_ai_reports($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """, 
            current_user.id,
            request.time_period,
            request.start_date,
            request.end_date,
            request.tags,
            request.limit,
            request.offset,
            request.order_by,
            request.order_direction
        )
        
        await conn.close()
        
        reports = []
        for row in results:
            reports.append(AIReportResponse(
                id=row['id'],
                time_period=row['time_period'],
                start_date=row['start_date'],
                end_date=row['end_date'],
                generated_at=row['generated_at'],
                report_title=row['report_title'],
                executive_summary=row['executive_summary'],
                win_rate=row['win_rate'],
                profit_factor=row['profit_factor'],
                trade_expectancy=row['trade_expectancy'],
                total_trades=row['total_trades'],
                net_pnl=row['net_pnl'],
                tags=row['tags'],
                processing_time_ms=row['processing_time_ms']
            ))
        
        return reports
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving reports: {str(e)}")


@router.get("/reports/{report_id}", response_model=AIReportResponse)
async def get_report_by_id(
    report_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get full AI report by ID"""
    try:
        from ..config.database import get_database_connection
        
        conn = await get_database_connection()
        
        result = await conn.fetchrow("""
            SELECT * FROM get_ai_report_by_id($1, $2)
        """, current_user.id, report_id)
        
        await conn.close()
        
        if not result:
            raise HTTPException(status_code=404, detail="Report not found")
        
        return AIReportResponse(
            id=result['id'],
            time_period=result['time_period'],
            start_date=result['start_date'],
            end_date=result['end_date'],
            generated_at=result['generated_at'],
            report_title=result['report_title'],
            executive_summary=result['executive_summary'],
            full_report=result['full_report'],
            data_analysis=result['data_analysis'],
            insights=result['insights'],
            win_rate=result['win_rate'],
            profit_factor=result['profit_factor'],
            trade_expectancy=result['trade_expectancy'],
            total_trades=result['total_trades'],
            net_pnl=result['net_pnl'],
            tags=result['tags'],
            model_versions=result['model_versions'],
            processing_time_ms=result['processing_time_ms']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving report: {str(e)}")


@router.post("/reports/search-similar", response_model=List[AIReportResponse])
async def search_similar_reports(
    request: SimilarReportsRequest,
    current_user: User = Depends(get_current_user)
):
    """Find similar reports using vector similarity search"""
    try:
        from ..services.embedding_service import EmbeddingService
        from ..config.database import get_database_connection
        
        # Generate embedding for query text
        async with EmbeddingService() as embedding_service:
            query_embedding = await embedding_service.generate_embedding(request.query_text)
        
        if not query_embedding:
            raise HTTPException(status_code=400, detail="Could not generate embedding for query")
        
        conn = await get_database_connection()
        
        results = await conn.fetch("""
            SELECT * FROM search_similar_ai_reports($1, $2::vector, $3, $4, $5)
        """, 
            current_user.id,
            query_embedding,
            request.similarity_threshold,
            request.limit,
            request.search_type
        )
        
        await conn.close()
        
        reports = []
        for row in results:
            reports.append(AIReportResponse(
                id=row['id'],
                time_period=row['time_period'],
                start_date=row['start_date'],
                end_date=row['end_date'],
                generated_at=row['generated_at'],
                report_title=row['report_title'],
                executive_summary=row['executive_summary'],
                win_rate=row['win_rate'],
                profit_factor=row['profit_factor'],
                net_pnl=row['net_pnl'],
                tags=row['tags'],
                similarity_score=row['similarity_score']
            ))
        
        return reports
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching similar reports: {str(e)}")


@router.get("/reports/stats", response_model=AIReportStats)
async def get_report_statistics(
    days_back: int = 30,
    current_user: User = Depends(get_current_user)
):
    """Get AI report statistics for dashboard"""
    try:
        from ..config.database import get_database_connection
        
        conn = await get_database_connection()
        
        result = await conn.fetchrow("""
            SELECT * FROM get_ai_report_stats($1, $2)
        """, current_user.id, days_back)
        
        await conn.close()
        
        if not result:
            # Return empty stats if no data
            return AIReportStats(
                total_reports=0,
                avg_win_rate=None,
                avg_profit_factor=None,
                avg_processing_time_ms=None,
                most_common_tags=None,
                best_performing_period=None,
                reports_this_month=0,
                improvement_trend="insufficient_data"
            )
        
        return AIReportStats(
            total_reports=result['total_reports'],
            avg_win_rate=result['avg_win_rate'],
            avg_profit_factor=result['avg_profit_factor'],
            avg_processing_time_ms=result['avg_processing_time_ms'],
            most_common_tags=result['most_common_tags'],
            best_performing_period=result['best_performing_period'],
            reports_this_month=result['reports_this_month'],
            improvement_trend=result['improvement_trend']
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving report statistics: {str(e)}")


# Helper functions
def _extract_total_trades(trading_data: Dict[str, Any]) -> int:
    """Extract total number of trades from trading data"""
    try:
        directional_perf = trading_data.get("directional_performance", {})
        bullish_perf = directional_perf.get("bullish_performance", {})
        bearish_perf = directional_perf.get("bearish_performance", {})
        
        bullish_trades = bullish_perf.get("total_trades", 0) if bullish_perf else 0
        bearish_trades = bearish_perf.get("total_trades", 0) if bearish_perf else 0
        
        return bullish_trades + bearish_trades
    except:
        return 0


def _analyze_directional_bias(trading_data: Dict[str, Any]) -> str:
    """Analyze if trader has directional bias"""
    try:
        directional_perf = trading_data.get("directional_performance", {})
        bullish_win_rate = directional_perf.get("bullish_win_rate", 0)
        bearish_win_rate = directional_perf.get("bearish_win_rate", 0)
        
        if bullish_win_rate > bearish_win_rate + 10:
            return "bullish_bias"
        elif bearish_win_rate > bullish_win_rate + 10:
            return "bearish_bias"
        else:
            return "balanced"
    except:
        return "unknown"


def _extract_top_symbols(trading_data: Dict[str, Any]) -> list:
    """Extract top performing symbols"""
    try:
        symbols_data = trading_data.get("top_symbols_performance", [])
        if not symbols_data:
            return []
        
        # Filter for most profitable symbols
        profitable_symbols = [
            s for s in symbols_data 
            if s.get("ranking_type") == "Most Profitable"
        ]
        
        return profitable_symbols[:5]  # Top 5
    except:
        return []


# Background task for model warming
async def warm_up_models():
    """Warm up AI models in the background"""
    try:
        # This could be called on startup to pre-load models
        pass
    except Exception as e:
        print(f"Model warm-up error: {e}")


# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check for AI summary service"""
    return {
        "status": "healthy",
        "service": "ai_summary",
        "timestamp": datetime.now().isoformat()
    }
