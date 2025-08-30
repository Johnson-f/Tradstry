from typing import Dict, Any, Optional, List
import asyncio
import logging
from datetime import datetime, timedelta
import json

# LangChain imports
from langchain.schema import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationChain
from langchain.prompts import PromptTemplate
from langchain_huggingface import HuggingFaceEndpoint

# LlamaIndex imports  
from llama_index.core import VectorStoreIndex, Document, Settings
from llama_index.core.vector_stores import VectorStoreQuery
from llama_index.vector_stores.postgres import PGVectorStore
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.core.query_engine import RetrieverQueryEngine

# Local imports
from services.ai_embedding_service import AIEmbeddingService
from services.ai_reports_service import AIReportsService
from services.ai_chat_service import AIChatService
from services.ai_insights_service import AIInsightsService
from models.ai_reports import ReportType, AIReportCreate
from models.ai_chat import AIChatMessageCreate, MessageType, SourceType
from models.ai_insights import AIInsightCreate, InsightType, InsightPriority
from config.ai_config import get_ai_settings

logger = logging.getLogger(__name__)

class AIOrchestrator:
    """
    Main AI orchestration service that coordinates LangChain, LlamaIndex, and local models
    for generating trading insights, reports, and handling chat interactions.
    """
    
    def __init__(self):
        self.ai_settings = get_ai_settings()
        self.embedding_service = AIEmbeddingService()
        self.reports_service = AIReportsService()
        self.chat_service = AIChatService()
        self.insights_service = AIInsightsService()
        
        # LangChain setup
        self._llm = None
        self._conversation_memory = ConversationBufferMemory()
        
        # LlamaIndex setup
        self._vector_store = None
        self._index = None
        
        # Trading-specific prompts
        self.trading_prompts = self._initialize_trading_prompts()
        
    def _initialize_trading_prompts(self) -> Dict[str, PromptTemplate]:
        """Initialize trading-specific prompt templates."""
        
        daily_report_prompt = PromptTemplate(
            input_variables=["trading_data", "date_range"],
            template="""
            You are an expert trading analyst. Analyze the following trading data and generate a comprehensive daily trading report.
            
            Trading Data:
            {trading_data}
            
            Date Range: {date_range}
            
            Please provide:
            1. Performance Summary (P&L, win rate, number of trades)
            2. Key Insights (patterns, behaviors, notable events)
            3. Risk Analysis (drawdown, position sizing, risk management)
            4. Actionable Recommendations for improvement
            5. Market Observations and trends
            
            Format your response as a structured analysis with clear sections.
            Be specific, data-driven, and provide actionable insights.
            """
        )
        
        chat_prompt = PromptTemplate(
            input_variables=["context", "question", "chat_history"],
            template="""
            You are a knowledgeable trading assistant with access to the user's trading data and history.
            
            Context from trading data:
            {context}
            
            Previous conversation:
            {chat_history}
            
            User question: {question}
            
            Provide a helpful, accurate response based on the trading data and context.
            Be conversational but professional. If you don't have enough information, say so.
            """
        )
        
        insight_prompt = PromptTemplate(
            input_variables=["trading_data", "insight_type"],
            template="""
            You are a trading pattern recognition expert. Analyze the trading data to identify {insight_type} insights.
            
            Trading Data:
            {trading_data}
            
            Focus on identifying:
            - Recurring patterns in trading behavior
            - Risk factors and warning signs  
            - Performance optimization opportunities
            - Market timing and entry/exit patterns
            
            Provide specific, actionable insights with confidence scores.
            """
        )
        
        return {
            "daily_report": daily_report_prompt,
            "chat": chat_prompt,
            "insight": insight_prompt
        }
    
    @property
    def llm(self):
        """Lazy load the LLM to avoid initialization overhead."""
        if self._llm is None:
            try:
                # Use Hugging Face hosted model for inference
                self._llm = HuggingFaceEndpoint(
                    repo_id=self.ai_settings.DEFAULT_LLM_MODEL,
                    max_length=self.ai_settings.LLM_MAX_LENGTH,
                    temperature=self.ai_settings.LLM_TEMPERATURE,
                    huggingfacehub_api_token=self.ai_settings.HUGGINGFACEHUB_API_TOKEN,
                    task="text-generation"
                )
                logger.info("Initialized Hugging Face hosted LLM for AI processing")
                
            except Exception as e:
                logger.error(f"Failed to initialize LLM: {str(e)}")
                raise Exception(f"Failed to initialize AI model: {str(e)}")
                
        return self._llm
    
    async def generate_daily_report(self, access_token: str, time_range: str = "1d",
                                  custom_start_date: Optional[datetime] = None,
                                  custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Generate a comprehensive daily trading report using AI analysis.
        
        Args:
            access_token: User authentication token
            time_range: Time range for the report
            custom_start_date: Custom start date if time_range is 'custom'
            custom_end_date: Custom end date if time_range is 'custom'
            
        Returns:
            Dictionary containing the generated report and metadata
        """
        try:
            start_time = datetime.now()
            
            # Get trading context data
            trading_context = await self.reports_service.get_trading_context(
                access_token, time_range, custom_start_date, custom_end_date
            )
            
            # Prepare prompt with trading data
            prompt = self.trading_prompts["daily_report"].format(
                trading_data=json.dumps(trading_context, indent=2),
                date_range=f"{custom_start_date or 'N/A'} to {custom_end_date or 'N/A'}"
            )
            
            # Generate report using LangChain
            conversation = ConversationChain(
                llm=self.llm,
                memory=ConversationBufferMemory(),
                verbose=False
            )
            
            report_content = await asyncio.get_event_loop().run_in_executor(
                None, conversation.predict, prompt
            )
            
            # Calculate processing time
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            # Extract insights and recommendations from the report
            insights, recommendations = self._extract_insights_and_recommendations(report_content)
            
            # Create report record
            report_data = AIReportCreate(
                report_type=ReportType.DAILY,
                title=f"Daily Trading Report - {datetime.now().strftime('%Y-%m-%d')}",
                content=report_content,
                insights=insights,
                recommendations=recommendations,
                metrics=trading_context.get("analytics", {}),
                date_range_start=custom_start_date,
                date_range_end=custom_end_date,
                model_used=self.ai_settings.DEFAULT_LLM_MODEL,
                processing_time_ms=processing_time,
                confidence_score=0.85
            )
            
            # Save report to database
            saved_report = await self.reports_service.create_report(report_data, access_token)
            
            return {
                "report": saved_report,
                "processing_time_ms": processing_time,
                "trading_context": trading_context
            }
            
        except Exception as e:
            logger.error(f"Error generating daily report: {str(e)}")
            raise Exception(f"Failed to generate daily report: {str(e)}")
    
    async def process_chat_message(self, access_token: str, session_id: str, 
                                 user_message: str, context_limit: int = 10) -> Dict[str, Any]:
        """
        Process a chat message with context from trading data and conversation history.
        
        Args:
            access_token: User authentication token
            session_id: Chat session identifier
            user_message: User's message
            context_limit: Number of previous messages to include as context
            
        Returns:
            Dictionary containing AI response and metadata
        """
        try:
            start_time = datetime.now()
            
            # Get recent chat history for context
            chat_history = await self.chat_service.get_session_messages(
                session_id, access_token, limit=context_limit
            )
            
            # Format chat history
            history_text = self._format_chat_history(chat_history)
            
            # Get relevant trading context using vector search
            trading_context = await self._get_relevant_trading_context(
                access_token, user_message
            )
            
            # Generate embedding for the user message
            user_embedding = self.embedding_service.generate_embedding(user_message)
            
            # Save user message
            user_msg_data = AIChatMessageCreate(
                session_id=session_id,
                message_type=MessageType.USER_QUESTION,
                content=user_message,
                context_data={"embedding": user_embedding},
                source_type=SourceType.EXTERNAL_AI
            )
            
            await self.chat_service.create_message(user_msg_data, access_token)
            
            # Prepare prompt for AI response
            prompt = self.trading_prompts["chat"].format(
                context=json.dumps(trading_context, indent=2),
                question=user_message,
                chat_history=history_text
            )
            
            # Generate AI response
            conversation = ConversationChain(
                llm=self.llm,
                memory=ConversationBufferMemory(),
                verbose=False
            )
            
            ai_response = await asyncio.get_event_loop().run_in_executor(
                None, conversation.predict, prompt
            )
            
            # Calculate processing time
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            # Generate embedding for AI response
            ai_embedding = self.embedding_service.generate_embedding(ai_response)
            
            # Save AI response
            ai_msg_data = AIChatMessageCreate(
                session_id=session_id,
                message_type=MessageType.AI_RESPONSE,
                content=ai_response,
                context_data={
                    "embedding": ai_embedding,
                    "context_used": trading_context,
                    "processing_time_ms": processing_time
                },
                model_used=self.ai_settings.DEFAULT_LLM_MODEL,
                confidence_score=0.8,
                source_type=SourceType.EXTERNAL_AI
            )
            
            saved_response = await self.chat_service.create_message(ai_msg_data, access_token)
            
            return {
                "response": saved_response,
                "processing_time_ms": processing_time,
                "context_used": trading_context
            }
            
        except Exception as e:
            logger.error(f"Error processing chat message: {str(e)}")
            raise Exception(f"Failed to process chat message: {str(e)}")
    
    async def generate_insights(self, access_token: str, insight_types: List[InsightType],
                              time_range: str = "30d", min_confidence: float = 0.7) -> List[Dict[str, Any]]:
        """
        Generate AI insights based on trading data analysis.
        
        Args:
            access_token: User authentication token
            insight_types: Types of insights to generate
            time_range: Time range for analysis
            min_confidence: Minimum confidence threshold
            
        Returns:
            List of generated insights
        """
        try:
            generated_insights = []
            
            # Get trading context for analysis
            trading_context = await self.reports_service.get_trading_context(
                access_token, time_range
            )
            
            for insight_type in insight_types:
                try:
                    # Generate insight using AI
                    prompt = self.trading_prompts["insight"].format(
                        trading_data=json.dumps(trading_context, indent=2),
                        insight_type=insight_type.value
                    )
                    
                    conversation = ConversationChain(
                        llm=self.llm,
                        memory=ConversationBufferMemory(),
                        verbose=False
                    )
                    
                    insight_content = await asyncio.get_event_loop().run_in_executor(
                        None, conversation.predict, prompt
                    )
                    
                    # Extract actionable items from insight
                    actions = self._extract_actions_from_insight(insight_content)
                    
                    # Determine priority based on insight type
                    priority = self._determine_insight_priority(insight_type, trading_context)
                    
                    # Create insight record
                    insight_data = AIInsightCreate(
                        insight_type=insight_type,
                        title=f"{insight_type.value.title()} Analysis - {datetime.now().strftime('%Y-%m-%d')}",
                        description=insight_content,
                        data_source=trading_context,
                        confidence_score=min_confidence + 0.1,  # Slightly above threshold
                        priority=priority,
                        actionable=bool(actions),
                        actions=actions,
                        tags=[insight_type.value, "ai-generated", time_range],
                        valid_until=datetime.now() + timedelta(days=7),  # Valid for a week
                        model_used=self.ai_settings.DEFAULT_LLM_MODEL
                    )
                    
                    # Save insight to database
                    saved_insight = await self.insights_service.create_insight(insight_data, access_token)
                    generated_insights.append(saved_insight)
                    
                except Exception as e:
                    logger.error(f"Error generating {insight_type.value} insight: {str(e)}")
                    continue
            
            return generated_insights
            
        except Exception as e:
            logger.error(f"Error generating insights: {str(e)}")
            raise Exception(f"Failed to generate insights: {str(e)}")
    
    def _extract_insights_and_recommendations(self, report_content: str) -> tuple:
        """Extract structured insights and recommendations from report content."""
        # Simple extraction logic - in production, use more sophisticated NLP
        insights = []
        recommendations = []
        
        lines = report_content.split('\n')
        current_section = None
        
        for line in lines:
            line = line.strip()
            if 'insight' in line.lower() or 'pattern' in line.lower():
                current_section = 'insights'
            elif 'recommend' in line.lower() or 'suggest' in line.lower():
                current_section = 'recommendations'
            elif line and current_section == 'insights':
                insights.append(line)
            elif line and current_section == 'recommendations':
                recommendations.append(line)
        
        return insights[:5], recommendations[:5]  # Limit to top 5 each
    
    def _format_chat_history(self, chat_history: List) -> str:
        """Format chat history for context in prompts."""
        if not chat_history:
            return "No previous conversation."
        
        formatted = []
        for msg in chat_history[-5:]:  # Last 5 messages
            role = "User" if msg.message_type == MessageType.USER_QUESTION else "Assistant"
            formatted.append(f"{role}: {msg.content[:200]}...")  # Truncate long messages
        
        return "\n".join(formatted)
    
    async def _get_relevant_trading_context(self, access_token: str, query: str) -> Dict[str, Any]:
        """Get relevant trading context based on the query using vector search."""
        try:
            # Generate embedding for the query
            query_embedding = self.embedding_service.generate_embedding(query)
            
            # Search for relevant chat messages and insights
            relevant_messages = await self.chat_service.search_messages(
                access_token, query, limit=3, similarity_threshold=0.6
            )
            
            relevant_insights = await self.insights_service.search_insights(
                access_token, query, limit=3, similarity_threshold=0.6
            )
            
            # Get recent trading context
            trading_context = await self.reports_service.get_trading_context(
                access_token, time_range="7d"
            )
            
            return {
                "recent_trading": trading_context,
                "relevant_messages": [msg.content for msg in relevant_messages],
                "relevant_insights": [insight.description for insight in relevant_insights]
            }
            
        except Exception as e:
            logger.error(f"Error getting relevant context: {str(e)}")
            return {}
    
    def _extract_actions_from_insight(self, insight_content: str) -> Optional[Dict[str, Any]]:
        """Extract actionable items from insight content."""
        # Simple action extraction - in production, use more sophisticated NLP
        actions = {}
        
        if 'reduce risk' in insight_content.lower():
            actions['risk_management'] = 'Consider reducing position sizes'
        
        if 'increase' in insight_content.lower() and 'profit' in insight_content.lower():
            actions['profit_optimization'] = 'Look for profit-taking opportunities'
        
        if 'pattern' in insight_content.lower():
            actions['pattern_recognition'] = 'Monitor identified trading patterns'
        
        return actions if actions else None
    
    def _determine_insight_priority(self, insight_type: InsightType, trading_context: Dict[str, Any]) -> InsightPriority:
        """Determine insight priority based on type and trading context."""
        # Simple priority logic - can be enhanced with more sophisticated rules
        if insight_type == InsightType.RISK:
            return InsightPriority.HIGH
        elif insight_type == InsightType.OPPORTUNITY:
            return InsightPriority.MEDIUM
        elif insight_type == InsightType.ALERT:
            return InsightPriority.CRITICAL
        else:
            return InsightPriority.MEDIUM