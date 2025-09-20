"""
AI Orchestrator Service - Compatibility Layer

This module provides a compatibility layer that redirects to the new modular
AI orchestrator system. The original monolithic implementation has been
refactored into smaller, more manageable modules located in the orchestrator/ directory.

For new implementations, import directly from the orchestrator module:
    from services.ai.orchestrator import AIOrchestrator

This compatibility layer ensures zero-downtime deployment during the transition.

Migration completed: 2025-01-20
Modular system: services/ai/orchestrator/
"""

import logging
from typing import Dict, Any, Optional, List, AsyncGenerator
from datetime import datetime

# Import the new modular orchestrator
from .orchestrator import AIOrchestrator as ModularAIOrchestrator

logger = logging.getLogger(__name__)

class AIOrchestrator:
    """
    COMPATIBILITY LAYER for the AI Orchestrator Service.
    
    This class provides backward compatibility by wrapping the new modular
    AI orchestrator system. All method calls are forwarded to the modular implementation.
    
    The original monolithic implementation has been refactored into specialized modules:
    - Model Management (ai_model_manager.py)
    - Authentication (ai_auth_validator.py) 
    - LLM Handling (ai_llm_handler.py)
    - Report Generation (ai_report_generator.py)
    - Chat Processing (ai_chat_processor.py)
    - Stream Handling (ai_stream_handler.py)
    - Insights Generation (ai_insights_generator.py)
    - Context Management (ai_context_manager.py)
    - Content Processing (ai_content_processor.py)
    - Health Monitoring (ai_health_monitor.py)
    """

    def __init__(self):
        logger.info("Initializing AI Orchestrator (compatibility layer) -> modular system")
        
        # Initialize the new modular orchestrator
        self._modular_orchestrator = ModularAIOrchestrator()
        
        logger.info("AI Orchestrator compatibility layer initialized successfully")

    # ==========================================
    # COMPATIBILITY LAYER METHODS
    # All methods forward calls to the modular orchestrator
    # ==========================================

    async def generate_daily_report(self, user: Dict[str, Any], time_range: str = "1d",
                                  custom_start_date: Optional[datetime] = None,
                                  custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Generate a comprehensive daily trading report."""
        return await self._modular_orchestrator.generate_daily_report(
            user, time_range, custom_start_date, custom_end_date
        )

    async def process_chat_message(self, user: Dict[str, Any], session_id: Optional[str],
                                 user_message: str, context_limit: int = 10) -> Dict[str, Any]:
        """Process a chat message and return AI response."""
        return await self._modular_orchestrator.process_chat_message(
            user, session_id, user_message, context_limit
        )

    async def process_chat_message_stream(self, user: Dict[str, Any], session_id: Optional[str],
                                        user_message: str, context_limit: int = 10) -> AsyncGenerator[Dict[str, Any], None]:
        """Process a chat message and stream the AI response."""
        async for chunk in self._modular_orchestrator.process_chat_message_stream(
            user, session_id, user_message, context_limit
        ):
            yield chunk

    async def generate_insights(self, user: Dict[str, Any], insight_types: List[str],
                              time_range: str = "7d", min_confidence: float = 0.7) -> List[Dict[str, Any]]:
        """Generate AI insights for trading patterns and opportunities."""
        return await self._modular_orchestrator.generate_insights(
            user, insight_types, time_range, min_confidence
        )

    async def get_health_status(self) -> Dict[str, Any]:
        """Get comprehensive health status of all AI orchestrator components."""
        return await self._modular_orchestrator.get_health_status()

    # Legacy compatibility properties - deprecated but maintained for backward compatibility  
    @property
    def stable_models(self):
        """Legacy property for backward compatibility."""
        return getattr(self._modular_orchestrator.model_manager, 'stable_models', [])

    @property 
    def current_llm_model(self):
        """Legacy property for backward compatibility."""
        return getattr(self._modular_orchestrator.model_manager, 'current_llm_model', 'openai/gpt-4o-mini')

# ==========================================
# END OF COMPATIBILITY LAYER
# The original 2013-line monolithic implementation
# has been moved to ai_orchestrator_service_legacy.py
# and replaced with this modular system.
# ==========================================
