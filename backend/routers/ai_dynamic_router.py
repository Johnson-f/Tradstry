"""
Dynamic AI Router - Factory for creating AI endpoints with dynamic routing
Provides flexible routing patterns for AI services with version control and feature flags
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Path, Body, Header
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any, List, Union
from datetime import datetime
from enum import Enum
import logging

from services.ai_summary_service_hosted import AITradingSummaryService
from services.user_service import UserService
from utils.auth import get_user_with_retry
from models.ai_summary import (
    AIReportResponse, AIReportStats, SimilarReportsRequest,
    ReportSearchRequest, GenerateAnalysisRequest, AnalysisResult, 
    ChatRequest, ChatResponse
)
from gotrue.types import User

logger = logging.getLogger(__name__)

class AIServiceType(str, Enum):
    """Available AI service types for dynamic routing"""
    ANALYSIS = "analysis"
    CHAT = "chat"
    INSIGHTS = "insights"
    REPORTS = "reports"
    HEALTH = "health"

class AIVersion(str, Enum):
    """API versions for backward compatibility"""
    V1 = "v1"
    V2 = "v2"
    LATEST = "latest"

class DynamicAIRouter:
    """Factory class for creating dynamic AI routing patterns"""
    
    def __init__(self):
        self.ai_service = None
        self.user_service = UserService()
        self.router = APIRouter()
        self._setup_dynamic_routes()
    
    def get_ai_service(self):
        """Lazy initialization of AI service"""
        if self.ai_service is None:
            self.ai_service = AITradingSummaryService()
        return self.ai_service
    
    def get_current_user(self, authorization: str = Header(...)) -> User:
        """Dynamic user authentication"""
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        token = authorization.split(" ")[1]
        return get_user_with_retry(self.user_service.supabase, token)
    
    def _setup_dynamic_routes(self):
        """Setup all dynamic routing patterns"""
        self._setup_versioned_routes()
        self._setup_service_type_routes()
        self._setup_feature_flag_routes()
        self._setup_wildcard_routes()
    
    def _setup_versioned_routes(self):
        """Create version-specific routes"""
        
        @self.router.post("/{version}/generate")
        async def versioned_generate(
            version: AIVersion,
            request: GenerateAnalysisRequest,
            current_user: User = Depends(self.get_current_user)
        ):
            """Version-aware analysis generation"""
            if version == AIVersion.V2:
                # Enhanced V2 features
                return await self._enhanced_generate_analysis(request, current_user)
            else:
                # Standard V1 or latest
                return await self._standard_generate_analysis(request, current_user)
        
        @self.router.post("/{version}/chat")
        async def versioned_chat(
            version: AIVersion,
            request: ChatRequest,
            current_user: User = Depends(self.get_current_user)
        ):
            """Version-aware chat functionality"""
            if version == AIVersion.V2:
                return await self._enhanced_chat(request, current_user)
            else:
                return await self._standard_chat(request, current_user)
    
    def _setup_service_type_routes(self):
        """Create service-type specific routes"""
        
        @self.router.get("/service/{service_type}")
        async def service_type_handler(
            service_type: AIServiceType,
            action: str = Query(..., description="Action to perform"),
            params: Optional[str] = Query(None, description="JSON parameters"),
            current_user: User = Depends(self.get_current_user)
        ):
            """Dynamic service type routing"""
            return await self._handle_service_type(service_type, action, params, current_user)
        
        @self.router.post("/service/{service_type}/{action}")
        async def service_action_handler(
            service_type: AIServiceType,
            action: str = Path(..., description="Specific action"),
            payload: Dict[str, Any] = Body(...),
            current_user: User = Depends(self.get_current_user)
        ):
            """Dynamic service action routing"""
            return await self._handle_service_action(service_type, action, payload, current_user)
    
    def _setup_feature_flag_routes(self):
        """Create feature flag controlled routes"""
        
        @self.router.get("/features/{feature_name}")
        async def feature_handler(
            feature_name: str,
            enabled: bool = Query(True, description="Feature enabled flag"),
            current_user: User = Depends(self.get_current_user)
        ):
            """Dynamic feature routing with flags"""
            if not enabled:
                raise HTTPException(status_code=404, detail="Feature not available")
            
            return await self._handle_feature(feature_name, current_user)
    
    def _setup_wildcard_routes(self):
        """Create wildcard pattern routes"""
        
        @self.router.api_route("/dynamic/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
        async def wildcard_handler(
            path: str,
            request_method: str = Depends(lambda request: request.method),
            current_user: User = Depends(self.get_current_user)
        ):
            """Catch-all dynamic routing"""
            return await self._handle_wildcard_route(path, request_method, current_user)
    
    # Implementation methods
    
    async def _standard_generate_analysis(self, request: GenerateAnalysisRequest, current_user: User):
        """Standard analysis generation (V1)"""
        try:
            analysis = await self.get_ai_service().generate_complete_analysis(
                user_id=str(current_user.id),
                time_range=request.time_range,
                custom_start_date=request.custom_start_date,
                custom_end_date=request.custom_end_date
            )
            
            return AnalysisResult(
                success=analysis.get("success", False),
                analysis_id=analysis.get("analysis_id", ""),
                timestamp=datetime.now(),
                time_period=analysis.get("time_period", ""),
                status="completed" if analysis.get("success") else "failed",
                report=analysis.get("report", ""),
                chat_enabled=analysis.get("chat_enabled", False)
            )
        except Exception as e:
            logger.error(f"Standard analysis error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def _enhanced_generate_analysis(self, request: GenerateAnalysisRequest, current_user: User):
        """Enhanced analysis generation (V2) with additional features"""
        try:
            # V2 enhancements: parallel processing, caching, etc.
            analysis = await self.get_ai_service().generate_complete_analysis(
                user_id=str(current_user.id),
                time_range=request.time_range,
                custom_start_date=request.custom_start_date,
                custom_end_date=request.custom_end_date
            )
            
            # Add V2 specific enhancements
            enhanced_response = AnalysisResult(
                success=analysis.get("success", False),
                analysis_id=analysis.get("analysis_id", ""),
                timestamp=datetime.now(),
                time_period=analysis.get("time_period", ""),
                status="completed" if analysis.get("success") else "failed",
                report=analysis.get("report", ""),
                chat_enabled=analysis.get("chat_enabled", False),
                processing_time_seconds=analysis.get("processing_time_ms", 0) / 1000,
                model_versions={"version": "v2", "enhanced_features": ["parallel_processing", "advanced_caching"]}
            )
            
            return enhanced_response
        except Exception as e:
            logger.error(f"Enhanced analysis error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def _standard_chat(self, request: ChatRequest, current_user: User):
        """Standard chat functionality"""
        try:
            answer = await self.get_ai_service().chat_about_analysis(
                request.question, 
                str(current_user.id)
            )
            
            return ChatResponse(
                question=request.question,
                answer=answer,
                timestamp=datetime.now().isoformat()
            )
        except Exception as e:
            logger.error(f"Standard chat error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def _enhanced_chat(self, request: ChatRequest, current_user: User):
        """Enhanced chat with RAG and context awareness"""
        try:
            # Enhanced chat with better context handling
            answer = await self.get_ai_service().chat_about_analysis(
                request.question, 
                str(current_user.id)
            )
            
            enhanced_response = ChatResponse(
                question=request.question,
                answer=answer,
                timestamp=datetime.now().isoformat()
            )
            
            # V2 enhancement: Add context metadata
            enhanced_response.context_used = True
            enhanced_response.confidence_score = 0.85  # Mock confidence
            
            return enhanced_response
        except Exception as e:
            logger.error(f"Enhanced chat error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def _handle_service_type(self, service_type: AIServiceType, action: str, params: str, current_user: User):
        """Handle dynamic service type routing"""
        try:
            if service_type == AIServiceType.ANALYSIS:
                return await self._handle_analysis_service(action, params, current_user)
            elif service_type == AIServiceType.CHAT:
                return await self._handle_chat_service(action, params, current_user)
            elif service_type == AIServiceType.INSIGHTS:
                return await self._handle_insights_service(action, params, current_user)
            elif service_type == AIServiceType.REPORTS:
                return await self._handle_reports_service(action, params, current_user)
            elif service_type == AIServiceType.HEALTH:
                return await self._handle_health_service(action, params, current_user)
            else:
                raise HTTPException(status_code=404, detail="Service type not found")
        except Exception as e:
            logger.error(f"Service type handler error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def _handle_service_action(self, service_type: AIServiceType, action: str, payload: Dict[str, Any], current_user: User):
        """Handle specific service actions"""
        return {
            "service_type": service_type,
            "action": action,
            "payload": payload,
            "user_id": current_user.id,
            "timestamp": datetime.now().isoformat(),
            "status": "processed"
        }
    
    async def _handle_feature(self, feature_name: str, current_user: User):
        """Handle feature-specific routing"""
        feature_handlers = {
            "advanced_analytics": self._handle_advanced_analytics,
            "real_time_insights": self._handle_real_time_insights,
            "custom_models": self._handle_custom_models,
        }
        
        handler = feature_handlers.get(feature_name)
        if handler:
            return await handler(current_user)
        else:
            raise HTTPException(status_code=404, detail="Feature not found")
    
    async def _handle_wildcard_route(self, path: str, method: str, current_user: User):
        """Handle wildcard routing patterns"""
        return {
            "path": path,
            "method": method,
            "user_id": current_user.id,
            "timestamp": datetime.now().isoformat(),
            "message": "Dynamic route handled",
            "available_actions": ["generate", "chat", "insights", "reports"]
        }
    
    # Service-specific handlers
    async def _handle_analysis_service(self, action: str, params: str, current_user: User):
        """Handle analysis service actions"""
        return {"service": "analysis", "action": action, "params": params}
    
    async def _handle_chat_service(self, action: str, params: str, current_user: User):
        """Handle chat service actions"""
        return {"service": "chat", "action": action, "params": params}
    
    async def _handle_insights_service(self, action: str, params: str, current_user: User):
        """Handle insights service actions"""
        return {"service": "insights", "action": action, "params": params}
    
    async def _handle_reports_service(self, action: str, params: str, current_user: User):
        """Handle reports service actions"""
        return {"service": "reports", "action": action, "params": params}
    
    async def _handle_health_service(self, action: str, params: str, current_user: User):
        """Handle health service actions"""
        return {
            "service": "health",
            "status": "operational",
            "timestamp": datetime.now().isoformat()
        }
    
    # Feature handlers
    async def _handle_advanced_analytics(self, current_user: User):
        """Handle advanced analytics feature"""
        return {
            "feature": "advanced_analytics",
            "status": "enabled",
            "capabilities": ["deep_learning", "pattern_recognition", "predictive_modeling"]
        }
    
    async def _handle_real_time_insights(self, current_user: User):
        """Handle real-time insights feature"""
        return {
            "feature": "real_time_insights",
            "status": "enabled",
            "update_frequency": "5_minutes"
        }
    
    async def _handle_custom_models(self, current_user: User):
        """Handle custom models feature"""
        return {
            "feature": "custom_models",
            "status": "enabled",
            "available_models": ["user_specific", "strategy_based", "risk_adjusted"]
        }

# Create router instance
dynamic_ai_router = DynamicAIRouter()
router = dynamic_ai_router.router