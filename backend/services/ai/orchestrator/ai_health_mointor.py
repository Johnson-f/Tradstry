from typing import Dict, Any, Optional
import logging
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)


class AIHealthMonitor:
    """
    Monitors the health and status of all AI orchestrator components.
    Provides comprehensive health checks, status reporting, and system monitoring.
    """

    def __init__(self):
        logger.info("AI Health Monitor initialized")

    async def get_comprehensive_health_status(self, orchestrator) -> Dict[str, Any]:
        """
        Get comprehensive health status of the entire AI orchestrator system.
        
        Args:
            orchestrator: The main AI orchestrator instance
            
        Returns:
            Dictionary containing detailed health information
        """
        try:
            logger.info("Performing comprehensive health check")
            
            health_status = {
                "timestamp": datetime.now().isoformat(),
                "overall_status": "unknown",
                "components": {},
                "system_metrics": {},
                "errors": [],
                "warnings": []
            }

            # Check each component
            component_checks = await asyncio.gather(
                self._check_model_manager_health(orchestrator.model_manager),
                self._check_auth_validator_health(orchestrator.auth_validator),
                self._check_llm_handler_health(orchestrator.llm_handler),
                self._check_report_generator_health(getattr(orchestrator, 'report_generator', None)),
                self._check_chat_processor_health(getattr(orchestrator, 'chat_processor', None)),
                self._check_stream_handler_health(getattr(orchestrator, 'stream_handler', None)),
                self._check_insights_generator_health(getattr(orchestrator, 'insights_generator', None)),
                self._check_context_manager_health(getattr(orchestrator, 'context_manager', None)),
                self._check_content_processor_health(getattr(orchestrator, 'content_processor', None)),
                return_exceptions=True
            )

            # Process component check results
            component_names = [
                'model_manager', 'auth_validator', 'llm_handler', 'report_generator',
                'chat_processor', 'stream_handler', 'insights_generator', 
                'context_manager', 'content_processor'
            ]

            healthy_components = 0
            total_components = len(component_names)

            for i, (name, check_result) in enumerate(zip(component_names, component_checks)):
                if isinstance(check_result, Exception):
                    health_status["components"][name] = {
                        "status": "error",
                        "error": str(check_result),
                        "available": False
                    }
                    health_status["errors"].append(f"{name}: {str(check_result)}")
                else:
                    health_status["components"][name] = check_result
                    if check_result.get("status") == "healthy":
                        healthy_components += 1
                    elif check_result.get("status") == "warning":
                        health_status["warnings"].append(f"{name}: {check_result.get('message', 'Unknown warning')}")

            # Determine overall status
            health_ratio = healthy_components / total_components
            if health_ratio >= 0.8:
                health_status["overall_status"] = "healthy"
            elif health_ratio >= 0.6:
                health_status["overall_status"] = "degraded"
            else:
                health_status["overall_status"] = "unhealthy"

            # Add system metrics
            health_status["system_metrics"] = {
                "healthy_components": healthy_components,
                "total_components": total_components,
                "health_ratio": health_ratio,
                "error_count": len(health_status["errors"]),
                "warning_count": len(health_status["warnings"])
            }

            logger.info(f"Health check completed - Overall status: {health_status['overall_status']}")
            return health_status

        except Exception as e:
            logger.error(f"Error during comprehensive health check: {str(e)}")
            return {
                "timestamp": datetime.now().isoformat(),
                "overall_status": "error",
                "error": str(e),
                "components": {},
                "system_metrics": {}
            }

    async def _check_model_manager_health(self, model_manager) -> Dict[str, Any]:
        """Check health of model manager component."""
        try:
            if not model_manager:
                return {"status": "error", "message": "Model manager not available", "available": False}

            # Check model validation
            validation_status = model_manager.validate_current_models()
            model_info = model_manager.get_model_info()

            issues = []
            if not validation_status.get('llm', False):
                issues.append("LLM model validation failed")
            if not validation_status.get('embedding', False):
                issues.append("Embedding model validation failed")

            status = "healthy" if not issues else "warning"
            
            return {
                "status": status,
                "available": True,
                "current_llm_model": model_manager.current_llm_model,
                "current_embedding_model": model_manager.current_embedding_model,
                "total_stable_models": len(model_manager.stable_models),
                "validation_status": validation_status,
                "issues": issues
            }

        except Exception as e:
            return {"status": "error", "error": str(e), "available": False}

    async def _check_auth_validator_health(self, auth_validator) -> Dict[str, Any]:
        """Check health of auth validator component."""
        try:
            if not auth_validator:
                return {"status": "error", "message": "Auth validator not available", "available": False}

            # Test token validation with a dummy token structure
            test_token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ"
            
            # This should return False for this test token, but shouldn't crash
            validation_works = isinstance(auth_validator.validate_token(test_token), bool)

            return {
                "status": "healthy" if validation_works else "warning",
                "available": True,
                "token_validation_functional": validation_works,
                "message": "Auth validator operational" if validation_works else "Token validation may have issues"
            }

        except Exception as e:
            return {"status": "error", "error": str(e), "available": False}

    async def _check_llm_handler_health(self, llm_handler) -> Dict[str, Any]:
        """Check health of LLM handler component."""
        try:
            if not llm_handler:
                return {"status": "error", "message": "LLM handler not available", "available": False}

            llm_status = llm_handler.get_llm_status()
            is_available = llm_handler.is_available()

            issues = []
            if not is_available:
                issues.append("LLM is not available")
            if not llm_status.get("llm_initialized", False):
                issues.append("LLM not properly initialized")

            status = "healthy" if not issues else "error"

            return {
                "status": status,
                "available": True,
                "llm_available": is_available,
                "llm_initialized": llm_status.get("llm_initialized", False),
                "current_model": llm_status.get("current_model"),
                "conversation_history_mode": llm_status.get("conversation_history_mode", "persistent_via_chat_service"),
                "issues": issues
            }

        except Exception as e:
            return {"status": "error", "error": str(e), "available": False}

    async def _check_report_generator_health(self, report_generator) -> Dict[str, Any]:
        """Check health of report generator component."""
        try:
            if not report_generator:
                return {"status": "warning", "message": "Report generator not available", "available": False}

            generator_status = report_generator.get_generator_status()
            
            issues = []
            if not generator_status.get("llm_available", False):
                issues.append("LLM not available for reports")
            if not generator_status.get("reports_service_available", False):
                issues.append("Reports service not available")

            ready = generator_status.get("ready_for_generation", False)
            status = "healthy" if ready else "warning"

            return {
                "status": status,
                "available": True,
                "ready_for_generation": ready,
                "llm_available": generator_status.get("llm_available", False),
                "reports_service_available": generator_status.get("reports_service_available", False),
                "prompt_service_enabled": generator_status.get("prompt_service_enabled", False),
                "issues": issues
            }

        except Exception as e:
            return {"status": "error", "error": str(e), "available": False}

    async def _check_chat_processor_health(self, chat_processor) -> Dict[str, Any]:
        """Check health of chat processor component."""
        try:
            if not chat_processor:
                return {"status": "warning", "message": "Chat processor not available", "available": False}

            processor_status = chat_processor.get_processor_status()
            
            issues = []
            if not processor_status.get("llm_available", False):
                issues.append("LLM not available for chat")
            if not processor_status.get("chat_service_available", False):
                issues.append("Chat service not available")

            ready = processor_status.get("ready_for_processing", False)
            status = "healthy" if ready else "warning"

            return {
                "status": status,
                "available": True,
                "ready_for_processing": ready,
                "llm_available": processor_status.get("llm_available", False),
                "chat_service_available": processor_status.get("chat_service_available", False),
                "embedding_service_available": processor_status.get("embedding_service_available", False),
                "context_manager_available": processor_status.get("context_manager_available", False),
                "issues": issues
            }

        except Exception as e:
            return {"status": "error", "error": str(e), "available": False}

    async def _check_stream_handler_health(self, stream_handler) -> Dict[str, Any]:
        """Check health of stream handler component."""
        try:
            if not stream_handler:
                return {"status": "warning", "message": "Stream handler not available", "available": False}

            stream_status = stream_handler.get_stream_status()
            
            issues = []
            if not stream_status.get("llm_available", False):
                issues.append("LLM not available for streaming")
            if not stream_status.get("ready_for_streaming", False):
                issues.append("Not ready for streaming")

            ready = stream_status.get("ready_for_streaming", False)
            status = "healthy" if ready else "warning"

            return {
                "status": status,
                "available": True,
                "ready_for_streaming": ready,
                "streaming_supported": stream_status.get("streaming_supported", False),
                "llm_available": stream_status.get("llm_available", False),
                "chat_service_available": stream_status.get("chat_service_available", False),
                "issues": issues
            }

        except Exception as e:
            return {"status": "error", "error": str(e), "available": False}

    async def _check_insights_generator_health(self, insights_generator) -> Dict[str, Any]:
        """Check health of insights generator component."""
        try:
            if not insights_generator:
                return {"status": "warning", "message": "Insights generator not available", "available": False}

            generator_status = insights_generator.get_generator_status()
            
            issues = []
            if not generator_status.get("llm_available", False):
                issues.append("LLM not available for insights")
            if not generator_status.get("ready_for_generation", False):
                issues.append("Not ready for insights generation")

            ready = generator_status.get("ready_for_generation", False)
            status = "healthy" if ready else "warning"

            return {
                "status": status,
                "available": True,
                "ready_for_generation": ready,
                "llm_available": generator_status.get("llm_available", False),
                "insights_service_available": generator_status.get("insights_service_available", False),
                "supported_insight_types": generator_status.get("supported_insight_types", []),
                "issues": issues
            }

        except Exception as e:
            return {"status": "error", "error": str(e), "available": False}

    async def _check_context_manager_health(self, context_manager) -> Dict[str, Any]:
        """Check health of context manager component."""
        try:
            if not context_manager:
                return {"status": "warning", "message": "Context manager not available", "available": False}

            manager_status = context_manager.get_context_manager_status()
            
            issues = []
            if not manager_status.get("rag_enabled", False):
                issues.append("RAG system not enabled")
            if not manager_status.get("contextual_search_available", False):
                issues.append("Contextual search not available")

            # Context manager can work with fallbacks, so more lenient
            status = "healthy" if manager_status.get("contextual_search_available", False) else "warning"

            return {
                "status": status,
                "available": True,
                "rag_enabled": manager_status.get("rag_enabled", False),
                "rag_service_available": manager_status.get("rag_service_available", False),
                "contextual_search_available": manager_status.get("contextual_search_available", False),
                "supported_context_types": manager_status.get("supported_context_types", []),
                "fallback_services": manager_status.get("fallback_services_available", {}),
                "issues": issues
            }

        except Exception as e:
            return {"status": "error", "error": str(e), "available": False}

    async def _check_content_processor_health(self, content_processor) -> Dict[str, Any]:
        """Check health of content processor component."""
        try:
            if not content_processor:
                return {"status": "warning", "message": "Content processor not available", "available": False}

            processor_status = content_processor.get_processor_status()
            
            # Content processor is utility-based, should always be ready
            ready = processor_status.get("ready", False)
            status = "healthy" if ready else "error"

            return {
                "status": status,
                "available": True,
                "ready": ready,
                "available_functions": len(processor_status.get("available_functions", [])),
                "supported_content_types": processor_status.get("supported_content_types", [])
            }

        except Exception as e:
            return {"status": "error", "error": str(e), "available": False}

    def get_quick_health_status(self, orchestrator) -> Dict[str, Any]:
        """
        Get a quick synchronous health status check.
        
        Args:
            orchestrator: The main AI orchestrator instance
            
        Returns:
            Dictionary containing basic health information
        """
        try:
            quick_status = {
                "timestamp": datetime.now().isoformat(),
                "overall_status": "unknown",
                "core_components": {
                    "model_manager": bool(orchestrator.model_manager),
                    "auth_validator": bool(orchestrator.auth_validator),
                    "llm_handler": bool(orchestrator.llm_handler)
                },
                "llm_available": orchestrator.llm_handler.is_available() if orchestrator.llm_handler else False
            }

            # Basic overall status based on core components
            core_healthy = all(quick_status["core_components"].values()) and quick_status["llm_available"]
            quick_status["overall_status"] = "healthy" if core_healthy else "degraded"

            return quick_status

        except Exception as e:
            logger.error(f"Error during quick health check: {str(e)}")
            return {
                "timestamp": datetime.now().isoformat(),
                "overall_status": "error",
                "error": str(e)
            }

    def get_monitor_status(self) -> Dict[str, Any]:
        """Get current status of the health monitor itself."""
        return {
            "monitor_active": True,
            "last_check": datetime.now().isoformat(),
            "available_checks": [
                "comprehensive_health_status",
                "quick_health_status", 
                "component_health_checks"
            ],
            "supported_components": [
                "model_manager", "auth_validator", "llm_handler",
                "report_generator", "chat_processor", "stream_handler",
                "insights_generator", "context_manager", "content_processor"
            ]
        }