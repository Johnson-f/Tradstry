"""
Military-Style AI Orchestrator
Wraps the standard AI orchestrator with military-style response validation and formatting
Ensures all AI responses are factual, direct, and contain zero speculation
"""

import logging
import json
from typing import Dict, Any, Optional, List, AsyncGenerator
from datetime import datetime

from .orchestrator.ai_orchestrator import AIOrchestrator
from .ai_personality_config import AI_PERSONALITY, MILITARY_FORMATTER, MILITARY_PROMPT_BUILDER
from .ai_response_validator import military_validator, ValidationResult, ValidationSeverity

logger = logging.getLogger(__name__)

class MilitaryAIOrchestrator:
    """
    Military-style AI orchestrator that enforces factual, direct responses
    with zero speculation or prediction capabilities
    """
    
    def __init__(self):
        """Initialize military AI orchestrator with validation and RAG integration"""
        logger.info("🎖️  Initializing Military-Style AI Orchestrator")
        logger.info("📋 Mission Parameters: Factual analysis only, zero speculation authorized")
        
        # Initialize base orchestrator
        self.base_orchestrator = AIOrchestrator()
        
        # Initialize RAG integration for contextual factual data
        try:
            from .rag_vector_service import RAGVectorService
            from .rag_retriever_service import RAGRetrieverService
            from .military_rag_integration import MilitaryRAGIntegration
            from database import get_supabase
            
            supabase_client = get_supabase()
            vector_service = RAGVectorService(supabase_client)
            retriever_service = RAGRetrieverService(supabase_client)
            
            self.rag_integration = MilitaryRAGIntegration(vector_service, retriever_service)
            self.rag_enabled = True
            logger.info("🔗 Military RAG integration enabled - contextual factual data available")
            
        except Exception as e:
            logger.warning(f"⚠️  RAG integration failed - operating without context: {str(e)}")
            self.rag_integration = None
            self.rag_enabled = False
        
        # Military configuration
        self.military_mode_enabled = True
        self.validation_enabled = True
        self.auto_correct_enabled = True
        
        # Response statistics
        self.response_stats = {
            "total_responses": 0,
            "validation_failures": 0,
            "auto_corrections": 0,
            "military_compliance_rate": 0.0,
            "rag_context_used": 0,
            "context_filtered": 0
        }
        
        logger.info("✅ Military AI Orchestrator operational - ready for factual analysis")

    async def generate_daily_report(
        self, 
        user: Dict[str, Any], 
        time_range: str = "1d",
        custom_start_date: Optional[datetime] = None,
        custom_end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Generate military-style factual daily trading report
        No predictions or speculation - data analysis only
        """
        logger.info("📊 Generating military-style daily report - factual analysis only")
        
        try:
            # Get base report
            base_result = await self.base_orchestrator.generate_daily_report(
                user, time_range, custom_start_date, custom_end_date
            )
            
            # Apply military formatting and validation
            if self.military_mode_enabled and base_result.get("success"):
                military_result = await self._apply_military_processing(
                    base_result, "daily_report", user
                )
                return military_result
            
            return base_result
            
        except Exception as e:
            logger.error(f"❌ Military daily report generation failed: {str(e)}")
            return {
                "success": False,
                "error": "Report generation failed - insufficient data for analysis",
                "military_status": "DATA_INSUFFICIENT"
            }

    async def process_chat_message(
        self, 
        user: Dict[str, Any], 
        session_id: Optional[str],
        user_message: str, 
        context_limit: int = 10
    ) -> Dict[str, Any]:
        """
        Process chat message with military-style factual response
        Direct answers only - no speculation permitted
        """
        logger.info(f"💬 Processing chat message - military protocol activated")
        logger.info(f"📝 Query: {user_message[:100]}...")
        
        try:
            # Check if user is asking for predictions (prohibited)
            if self._contains_prediction_request(user_message):
                return {
                    "success": True,
                    "response": self._generate_prediction_refusal(user_message),
                    "military_status": "PREDICTION_REQUEST_DENIED",
                    "confidence_score": 1.0
                }
            
            # Get military-compliant RAG context if available
            military_context = None
            if self.rag_enabled and self.rag_integration:
                try:
                    user_token = user.get("access_token")
                    if user_token:
                        military_context = await self.rag_integration.get_military_context(
                            user_token=user_token,
                            query=user_message,
                            max_context_items=3
                        )
                        if military_context.get('total_items', 0) > 0:
                            self.response_stats["rag_context_used"] += 1
                            logger.info(f"🔗 Retrieved {military_context['total_items']} factual context items")
                except Exception as e:
                    logger.warning(f"⚠️  RAG context retrieval failed: {str(e)}")
                    military_context = None
            
            # Get base response (with context if available)
            base_result = await self.base_orchestrator.process_chat_message(
                user, session_id, user_message, context_limit
            )
            
            # Apply military processing with context
            if self.military_mode_enabled and base_result.get("success"):
                military_result = await self._apply_military_processing(
                    base_result, "chat", user, user_message, military_context
                )
                return military_result
            
            return base_result
            
        except Exception as e:
            logger.error(f"❌ Military chat processing failed: {str(e)}")
            return {
                "success": False,
                "error": "Unable to process query - insufficient context data",
                "military_status": "PROCESSING_FAILED"
            }

    async def process_chat_message_stream(
        self, 
        user: Dict[str, Any], 
        session_id: Optional[str],
        user_message: str, 
        context_limit: int = 10
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream military-style factual chat response
        Real-time validation to prevent speculation
        """
        logger.info("🔄 Streaming military-style chat response")
        
        try:
            # Check for prediction requests
            if self._contains_prediction_request(user_message):
                yield {
                    "type": "military_response",
                    "content": self._generate_prediction_refusal(user_message),
                    "military_status": "PREDICTION_REQUEST_DENIED",
                    "final": True
                }
                return
            
            # Stream base response with real-time validation
            accumulated_response = ""
            
            async for chunk in self.base_orchestrator.process_chat_message_stream(
                user, session_id, user_message, context_limit
            ):
                if chunk.get("type") == "content":
                    # Accumulate content for validation
                    content = chunk.get("content", "")
                    accumulated_response += content
                    
                    # Real-time validation check
                    if self.validation_enabled:
                        quick_validation = self._quick_validate_chunk(content)
                        if not quick_validation["passes"]:
                            logger.warning(f"⚠️  Real-time validation issue: {quick_validation['issue']}")
                            # Filter out problematic content
                            content = self._filter_problematic_content(content)
                    
                    yield {
                        "type": "content",
                        "content": content,
                        "military_validated": True
                    }
                
                elif chunk.get("type") == "final":
                    # Final validation and formatting
                    if self.military_mode_enabled:
                        final_validation = await self._validate_final_response(
                            accumulated_response, "chat"
                        )
                        
                        yield {
                            "type": "final",
                            "military_validation": final_validation,
                            "military_status": "FACTUAL_ANALYSIS_COMPLETE"
                        }
                    else:
                        yield chunk
                else:
                    yield chunk
                    
        except Exception as e:
            logger.error(f"❌ Military streaming failed: {str(e)}")
            yield {
                "type": "error",
                "error": "Stream processing failed - reverting to standard response",
                "military_status": "STREAM_FAILED"
            }

    async def generate_insights(
        self, 
        user: Dict[str, Any], 
        insight_types: List[str],
        time_range: str = "7d", 
        min_confidence: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Generate factual trading insights - no predictions
        Historical data analysis only
        """
        logger.info("🔍 Generating military-style factual insights")
        
        try:
            # Get base insights
            base_insights = await self.base_orchestrator.generate_insights(
                user, insight_types, time_range, min_confidence
            )
            
            # Filter and validate insights for military compliance
            military_insights = []
            
            for insight in base_insights:
                # Validate insight content
                insight_text = insight.get("content", "")
                validation = military_validator.validate_response(insight_text, "insight")
                
                if validation.passes_validation:
                    # Format as military-style insight
                    military_insight = {
                        **insight,
                        "content": MILITARY_FORMATTER.format_response(insight_text, "analysis"),
                        "military_validated": True,
                        "confidence_score": min(insight.get("confidence_score", 0.7), 0.9),  # Cap confidence
                        "insight_type": "FACTUAL_ANALYSIS"
                    }
                    military_insights.append(military_insight)
                else:
                    logger.warning(f"⚠️  Insight failed military validation: {validation.issues}")
                    # Create factual alternative
                    factual_insight = {
                        **insight,
                        "content": "FACTUAL DATA ANALYSIS: Insufficient data for definitive insight generation.",
                        "military_validated": False,
                        "validation_issues": len(validation.issues),
                        "insight_type": "DATA_INSUFFICIENT"
                    }
                    military_insights.append(factual_insight)
            
            logger.info(f"✅ Generated {len(military_insights)} military-compliant insights")
            return military_insights
            
        except Exception as e:
            logger.error(f"❌ Military insight generation failed: {str(e)}")
            return [{
                "content": "INSIGHT GENERATION FAILED: Insufficient data for analysis",
                "confidence_score": 0.0,
                "insight_type": "ERROR",
                "military_status": "GENERATION_FAILED"
            }]

    async def _apply_military_processing(
        self, 
        base_result: Dict[str, Any], 
        response_type: str,
        user: Dict[str, Any],
        user_message: str = None,
        military_context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Apply military-style processing to base AI response"""
        
        try:
            # Extract response content
            response_content = self._extract_response_content(base_result, response_type)
            
            if not response_content:
                return {
                    **base_result,
                    "military_status": "NO_CONTENT_TO_PROCESS"
                }
            
            # Validate response
            validation_result = military_validator.validate_response(response_content, response_type)
            
            # Update statistics
            self._update_response_stats(validation_result)
            
            if validation_result.passes_validation:
                # Format as military-style response
                military_content = MILITARY_FORMATTER.format_response(response_content, response_type)
                
                # Add context information if available
                final_response = military_content
                if military_context and military_context.get('total_items', 0) > 0:
                    context_summary = military_context.get('context_summary', '')
                    final_response = f"{military_content}\n\nCONTEXTUAL INTELLIGENCE:\n{context_summary}"
                
                return {
                    **base_result,
                    "response": final_response,
                    "military_validated": True,
                    "military_score": validation_result.overall_score,
                    "military_status": "FACTUAL_ANALYSIS_COMPLETE",
                    "context_used": military_context is not None,
                    "context_items": military_context.get('total_items', 0) if military_context else 0
                }
            else:
                # Handle validation failure
                if self.auto_correct_enabled and validation_result.cleaned_response:
                    # Use cleaned response
                    military_content = MILITARY_FORMATTER.format_response(
                        validation_result.cleaned_response, response_type
                    )
                    
                    return {
                        **base_result,
                        "response": military_content,
                        "military_validated": True,
                        "military_score": validation_result.overall_score,
                        "military_status": "AUTO_CORRECTED",
                        "validation_issues": len(validation_result.issues)
                    }
                else:
                    # Generate factual fallback
                    fallback_response = self._generate_factual_fallback(response_type, user_message)
                    
                    return {
                        **base_result,
                        "response": fallback_response,
                        "military_validated": False,
                        "military_score": 0.0,
                        "military_status": "VALIDATION_FAILED_FALLBACK_PROVIDED",
                        "validation_issues": len(validation_result.issues)
                    }
            
        except Exception as e:
            logger.error(f"❌ Military processing failed: {str(e)}")
            return {
                **base_result,
                "military_status": "PROCESSING_ERROR",
                "error": "Military validation system error"
            }

    def _contains_prediction_request(self, message: str) -> bool:
        """Check if user is asking for predictions (prohibited)"""
        prediction_keywords = [
            "what will", "will it", "going to", "predict", "forecast", 
            "what do you think will", "where is", "headed", "next week",
            "next month", "future", "tomorrow", "later today"
        ]
        
        message_lower = message.lower()
        return any(keyword in message_lower for keyword in prediction_keywords)

    def _generate_prediction_refusal(self, user_message: str) -> str:
        """Generate military-style refusal for prediction requests"""
        return """OPERATIONAL RESPONSE:

REQUEST TYPE: Prediction/Forecast inquiry
STATUS: REQUEST DENIED

EXPLANATION:
This system provides factual data analysis only. Predictions and forecasts are not authorized.

AVAILABLE CAPABILITIES:
- Historical performance analysis
- Current position status assessment  
- Risk metrics calculation
- Technical indicator interpretation
- Trade execution analysis

DIRECTIVE:
Please rephrase your query to request factual analysis of existing data.

END RESPONSE"""

    def _extract_response_content(self, base_result: Dict[str, Any], response_type: str) -> str:
        """Extract content from base AI response"""
        if response_type == "chat":
            return base_result.get("response", "")
        elif response_type == "daily_report":
            return base_result.get("report", {}).get("content", "")
        else:
            return base_result.get("content", "")

    def _quick_validate_chunk(self, content_chunk: str) -> Dict[str, Any]:
        """Quick validation for streaming content chunks"""
        # Check for immediate red flags
        prediction_words = ["will", "going to", "predict", "forecast"]
        speculation_words = ["might", "could", "possibly", "perhaps"]
        
        content_lower = content_chunk.lower()
        
        for word in prediction_words:
            if word in content_lower:
                return {"passes": False, "issue": f"Prediction language detected: {word}"}
        
        for word in speculation_words:
            if word in content_lower:
                return {"passes": False, "issue": f"Speculation language detected: {word}"}
        
        return {"passes": True, "issue": None}

    def _filter_problematic_content(self, content: str) -> str:
        """Filter out problematic content in real-time"""
        # Replace problematic phrases
        filtered = content.replace("will", "").replace("might", "").replace("could", "")
        return filtered.strip()

    def _generate_factual_fallback(self, response_type: str, user_message: str = None) -> str:
        """Generate factual fallback response when validation fails"""
        if response_type == "chat":
            return """OPERATIONAL RESPONSE:

STATUS: Analysis request received
ASSESSMENT: Insufficient data for comprehensive factual analysis

AVAILABLE ACTIONS:
1. Provide specific trade data for analysis
2. Request historical performance metrics
3. Submit position data for risk assessment

LIMITATION: Response generation failed military validation standards.

REQUEST: Please provide specific data points for factual analysis.

END RESPONSE"""
        
        elif response_type == "daily_report":
            return """DAILY OPERATIONAL REPORT

STATUS: Report generation attempted
RESULT: Insufficient data for comprehensive factual assessment

DATA REQUIREMENTS:
- Trade execution data
- Position information  
- Account metrics
- Performance statistics

RECOMMENDATION: Provide complete trading data for factual analysis.

END REPORT"""
        
        else:
            return "FACTUAL ANALYSIS: Insufficient data for assessment. Please provide specific metrics for analysis."

    async def _validate_final_response(self, response: str, response_type: str) -> Dict[str, Any]:
        """Perform final validation on complete response"""
        validation_result = military_validator.validate_response(response, response_type)
        
        return {
            "passes_validation": validation_result.passes_validation,
            "overall_score": validation_result.overall_score,
            "issue_count": len(validation_result.issues),
            "critical_issues": len([i for i in validation_result.issues if i.severity == ValidationSeverity.CRITICAL]),
            "military_compliant": validation_result.passes_validation
        }

    def _update_response_stats(self, validation_result: ValidationResult):
        """Update response statistics"""
        self.response_stats["total_responses"] += 1
        
        if not validation_result.passes_validation:
            self.response_stats["validation_failures"] += 1
        
        if validation_result.cleaned_response:
            self.response_stats["auto_corrections"] += 1
        
        # Calculate compliance rate
        total = self.response_stats["total_responses"]
        failures = self.response_stats["validation_failures"]
        self.response_stats["military_compliance_rate"] = ((total - failures) / total) * 100 if total > 0 else 0.0

    async def get_health_status(self) -> Dict[str, Any]:
        """Get military AI system health status"""
        base_health = await self.base_orchestrator.get_health_status()
        
        military_health = {
            **base_health,
            "military_mode": {
                "enabled": self.military_mode_enabled,
                "validation_enabled": self.validation_enabled,
                "auto_correct_enabled": self.auto_correct_enabled,
                "compliance_rate": self.response_stats["military_compliance_rate"],
                "total_responses": self.response_stats["total_responses"],
                "validation_failures": self.response_stats["validation_failures"],
                "auto_corrections": self.response_stats["auto_corrections"]
            },
            "military_status": "OPERATIONAL" if self.military_mode_enabled else "DISABLED"
        }
        
        return military_health

    def enable_military_mode(self, enabled: bool = True):
        """Enable or disable military mode"""
        self.military_mode_enabled = enabled
        logger.info(f"🎖️  Military mode {'ACTIVATED' if enabled else 'DEACTIVATED'}")

    def get_military_stats(self) -> Dict[str, Any]:
        """Get military response statistics"""
        return {
            **self.response_stats,
            "validator_stats": military_validator.get_validation_stats()
        }
