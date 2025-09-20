"""
AI Orchestrator Module

This module provides a modular AI orchestration system for Tradistry.
The main orchestrator coordinates specialized AI services including:

- Model Management: Stable model selection and fallback logic
- Authentication: JWT validation and user context management  
- LLM Handler: Language model initialization and chain management
- Report Generation: Daily reports and performance summaries
- Chat Processing: Message processing with context and history
- Stream Handling: Real-time streaming AI responses
- Insights Generation: Trading pattern recognition and risk analysis
- Context Management: RAG-based document retrieval and vector search
- Content Processing: Text parsing, extraction, and formatting utilities
- Health Monitoring: Component status and system health checks

Main Components:
- AIOrchestrator: Primary coordinator for all AI services
- AIModelManager: Model selection, validation, and fallback management
- AILLMHandler: LLM initialization and prompt processing
- AIReportGenerator: Trading report generation with advanced prompts
- AIChatProcessor: Chat message processing with context integration
- AIStreamHandler: Real-time streaming response management
- AIInsightsGenerator: Trading insights and risk analysis
- AIContextManager: RAG and vector search for enhanced context
- AIContentProcessor: Content parsing and extraction utilities
- AIHealthMonitor: System health monitoring and status reporting

Usage:
    from services.ai.orchestrator import AIOrchestrator
    
    orchestrator = AIOrchestrator()
    
    # Generate reports
    report = await orchestrator.generate_daily_report(user, "7d")
    
    # Process chat
    response = await orchestrator.process_chat_message(user, session_id, message)
    
    # Stream responses
    async for chunk in orchestrator.process_chat_message_stream(user, session_id, message):
        print(chunk)
    
    # Generate insights
    insights = await orchestrator.generate_insights(user, [InsightType.RISK])
    
    # Check health
    status = await orchestrator.get_health_status()
"""

from .ai_orchestrator import AIOrchestrator
from .ai_model_manager import AIModelManager
from .ai_auth_validator import AIAuthValidator
from .ai_llm_handler import AILLMHandler
from .ai_report_generator import AIReportGenerator
from .ai_chat_processor import AIChatProcessor
from .ai_stream_handler import AIStreamHandler
from .ai_insights_generator import AIInsightsGenerator
from .ai_context_manager import AIContextManager
from .ai_content_processor import AIContentProcessor
from .ai_health_mointor import AIHealthMonitor

# Main exports
__all__ = [
    # Primary orchestrator
    "AIOrchestrator",
    
    # Core components
    "AIModelManager",
    "AIAuthValidator",
    "AILLMHandler",
    
    # AI handlers
    "AIReportGenerator",
    "AIChatProcessor", 
    "AIStreamHandler",
    "AIInsightsGenerator",
    
    # Support components
    "AIContextManager",
    "AIContentProcessor",
    "AIHealthMonitor",
]

# Version info
__version__ = "1.0.0"
__description__ = "Modular AI Orchestration System for Tradistry"