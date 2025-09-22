"""
AI Orchestrator Service - Compatibility Layer

This module provides a compatibility layer that redirects to the new modular
"""

import logging
from typing import Dict, Any, Optional, AsyncGenerator
import asyncio
from datetime import datetime

# Import orchestrator components
from .orchestrator.ai_orchestrator import AIOrchestrator
from .ai_personality_config import AI_PERSONALITY, MILITARY_FORMATTER, MILITARY_PROMPT_BUILDER
from .ai_response_validator import military_validator, ValidationSeverity

logger = logging.getLogger(__name__)

class AIOrchestrator:
    """
    MILITARY-STYLE AI ORCHESTRATOR SERVICE
    
    Provides factual, direct, military-precision AI responses with zero speculation.
    Enforces strict validation to prevent predictions and ensure data-driven answers only.
    
    Key Features:
    - Military-style response formatting
    - Zero speculation/prediction enforcement  
    - Real-time response validation
    - Factual data analysis only
    - Direct, precise communication
    """

    def __init__(self):
        logger.info("🎖️  Initializing Military-Style AI Orchestrator Service")
        logger.info("📋 Mission: Factual analysis only - zero speculation authorized")
        
        # Initialize military AI orchestrator
        from .military_ai_orchestrator import MilitaryAIOrchestrator
        self._military_orchestrator = MilitaryAIOrchestrator()
        
        logger.info("✅ Military AI Orchestrator Service operational")

    # ==========================================
    # MILITARY AI METHODS - FACTUAL ANALYSIS ONLY
    # All responses validated for zero speculation
    # ==========================================

    async def generate_daily_report(self, user: Dict[str, Any], time_range: str = "1d",
                                  custom_start_date: Optional[datetime] = None,
                                  custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Generate military-style factual daily trading report - no predictions."""
        return await self._military_orchestrator.generate_daily_report(
            user, time_range, custom_start_date, custom_end_date
        )

    async def process_chat_message(self, user: Dict[str, Any], session_id: Optional[str],
                                 user_message: str, context_limit: int = 10) -> Dict[str, Any]:
        """Process chat message with military-style factual response - direct answers only."""
        return await self._military_orchestrator.process_chat_message(
            user, session_id, user_message, context_limit
        )

    async def process_chat_message_stream(self, user: Dict[str, Any], session_id: Optional[str],
                                        user_message: str, context_limit: int = 10) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream military-style factual chat response with real-time validation."""
        async for chunk in self._military_orchestrator.process_chat_message_stream(
            user, session_id, user_message, context_limit
        ):
            yield chunk

    async def generate_insights(self, user: Dict[str, Any], insight_types: List[str],
                              time_range: str = "7d", min_confidence: float = 0.7) -> List[Dict[str, Any]]:
        """Generate factual trading insights - historical data analysis only."""
        return await self._military_orchestrator.generate_insights(
            user, insight_types, time_range, min_confidence
        )

    async def get_health_status(self) -> Dict[str, Any]:
        """Get military AI system health status including validation metrics."""
        return await self._military_orchestrator.get_health_status()

    # Military AI System Properties  
    @property
    def stable_models(self):
        """Available models for military AI system."""
        return getattr(self._military_orchestrator.base_orchestrator.model_manager, 'stable_models', [])

    @property 
    def current_llm_model(self):
        """Current model in use by military AI system."""
        return getattr(self._military_orchestrator.base_orchestrator.model_manager, 'current_llm_model', 'openai/gpt-4o-mini')
    
    def enable_military_mode(self, enabled: bool = True):
        """Enable or disable military-style response mode."""
        return self._military_orchestrator.enable_military_mode(enabled)
    
    def get_military_stats(self) -> Dict[str, Any]:
        """Get military response statistics and validation metrics."""
        return self._military_orchestrator.get_military_stats()

# ==========================================
# END OF COMPATIBILITY LAYER
# The original 2013-line monolithic implementation
# has been moved to ai_orchestrator_service_legacy.py
# and replaced with this modular system.
# ==========================================
