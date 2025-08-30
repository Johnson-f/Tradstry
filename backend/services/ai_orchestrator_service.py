from typing import Dict, Any, Optional, List
import asyncio
import logging
import traceback
from datetime import datetime, timedelta
import json
import uuid

# LangChain imports - Updated to use non-deprecated classes
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_huggingface import HuggingFaceEndpoint

# Local imports
from services.ai_embedding_service import AIEmbeddingService
from services.ai_reports_service import AIReportsService
from services.ai_chat_service import AIChatService
from services.ai_insights_service import AIInsightsService
from models.ai_reports import ReportType, AIReportCreate
from models.ai_chat import AIChatMessageCreate, AIChatSessionCreate, MessageType, SourceType
from models.ai_insights import AIInsightCreate, InsightType, InsightPriority
from config.ai_config import (
    get_ai_settings,
    get_available_llm_models,
    get_available_embedding_models,
    get_financial_models,
    get_model_by_key,
    validate_model_availability
)

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

        # Model management
        self.current_llm_model = self.ai_settings.DEFAULT_LLM_MODEL
        self.current_embedding_model = self.ai_settings.DEFAULT_EMBEDDING_MODEL
        self.available_models = self._load_available_models()

        # LangChain setup - Updated to avoid deprecated classes
        self._llm = None
        self._conversation_history = []  # Simple list to track conversation

        # LlamaIndex setup
        self._vector_store = None
        self._index = None

        # Trading-specific prompts
        self.trading_prompts = self._initialize_trading_prompts()

    def _load_available_models(self) -> Dict[str, Dict[str, str]]:
        """Load all available models from configuration."""
        try:
            return {
                'llm': get_available_llm_models(),
                'embedding': get_available_embedding_models(),
                'financial': get_financial_models()
            }
        except Exception as e:
            logger.error(f"Error loading available models: {str(e)}")
            return {'llm': {}, 'embedding': {}, 'financial': {}}

    def _validate_token(self, access_token: str) -> bool:
        """Validate access token format and structure."""
        try:
            # Handle None or empty token
            if not access_token:
                logger.warning("Token validation failed: Empty or None token")
                return False

            # Ensure token is a string, not bytes
            if isinstance(access_token, bytes):
                try:
                    access_token = access_token.decode('utf-8')
                except UnicodeDecodeError as e:
                    logger.error(f"Error decoding token from bytes: Invalid UTF-8 sequence: {str(e)}")
                    return False

            # Remove Bearer prefix if present
            token = access_token.replace("Bearer ", "").strip()

            # Basic token validation - should be a valid JWT-like string
            if not token or len(token) < 20:
                logger.warning("Token validation failed: Token too short or empty")
                return False

            # Check for valid JWT characters (base64url + dots)
            import string
            valid_chars = string.ascii_letters + string.digits + '-_.'
            if not all(c in valid_chars for c in token):
                logger.warning("Token validation failed: Contains invalid characters for JWT")
                return False

            # Validate JWT structure before decoding
            parts = token.split('.')
            if len(parts) != 3:
                logger.warning(f"Token validation failed: Invalid JWT structure - expected 3 parts, got {len(parts)}")
                return False

            # Validate each part can be base64 decoded
            import base64
            try:
                # Check header and payload parts (not signature)
                for i, part in enumerate(parts[:2]):
                    if not part:  # Empty part
                        logger.warning(f"Token validation failed: Empty JWT part {i}")
                        return False

                    # Add proper padding
                    padded_part = part + '=' * (4 - len(part) % 4)
                    base64.urlsafe_b64decode(padded_part)

                return True
            except Exception as decode_error:
                logger.warning(f"Token validation failed: Base64 decoding error in JWT part: {str(decode_error)}")
                return False

        except Exception as e:
            logger.error(f"Unexpected error validating token: {str(e)}")
            return False

    def select_model(self, model_type: str, model_key: str) -> bool:
        """
        Select a specific model for use.

        Args:
            model_type: Type of model ('llm', 'embedding', 'financial')
            model_key: Key identifier for the model

        Returns:
            True if model was successfully selected, False otherwise
        """
        try:
            model_path = get_model_by_key(model_type, model_key)
            if not model_path:
                logger.warning(f"Model key '{model_key}' not found for type '{model_type}'")
                return False

            if not validate_model_availability(model_path):
                logger.warning(f"Model '{model_path}' is not available in configuration")
                return False

            if model_type == 'llm':
                self.current_llm_model = model_path
                # Reset LLM to force reinitialization with new model
                self._llm = None
                logger.info(f"Switched to LLM model: {model_path}")
            elif model_type == 'embedding':
                self.current_embedding_model = model_path
                logger.info(f"Switched to embedding model: {model_path}")

            return True

        except Exception as e:
            logger.error(f"Error selecting model {model_key}: {str(e)}")
            return False

    def get_model_info(self, model_type: str = None) -> Dict[str, Any]:
        """
        Get information about current and available models.

        Args:
            model_type: Optional filter for specific model type

        Returns:
            Dictionary containing model information
        """
        info = {
            'current_llm': self.current_llm_model,
            'current_embedding': self.current_embedding_model,
            'available_models': self.available_models
        }

        if model_type:
            info['available_models'] = {model_type: self.available_models.get(model_type, {})}

        return info

    def validate_current_models(self) -> Dict[str, bool]:
        """
        Validate that current models are available and working.

        Returns:
            Dictionary with validation status for each model type
        """
        validation_status = {}

        try:
            # Validate LLM model
            validation_status['llm'] = validate_model_availability(self.current_llm_model)
        except Exception as e:
            logger.error(f"Error validating LLM model: {str(e)}")
            validation_status['llm'] = False

        try:
            # Validate embedding model
            validation_status['embedding'] = validate_model_availability(self.current_embedding_model)
        except Exception as e:
            logger.error(f"Error validating embedding model: {str(e)}")
            validation_status['embedding'] = False

        # Log validation results
        for model_type, is_valid in validation_status.items():
            if not is_valid:
                logger.warning(f"Current {model_type} model is not valid: {getattr(self, f'current_{model_type}_model')}")

        return validation_status

    def get_fallback_model(self, model_type: str, current_model: str) -> Optional[str]:
        """
        Get a fallback model when the current model is unavailable.

        Args:
            model_type: Type of model ('llm', 'embedding')
            current_model: Current model that's failing

        Returns:
            Fallback model path or None if no fallback available
        """
        fallback_options = {
            'llm': [
                'mistralai/Mistral-7B-Instruct-v0.1',  # Most stable
                'microsoft/Phi-3-mini-4k-instruct',    # Fast and efficient
                'google/gemma-2b-it'                   # Good performance
            ],
            'embedding': [
                'sentence-transformers/all-MiniLM-L6-v2',  # Most stable
                'BAAI/bge-small-en-v1.5',                  # Good performance
                'intfloat/e5-small-v2'                      # Versatile
            ]
        }

        fallbacks = fallback_options.get(model_type, [])

        # Return first available fallback that's different from current
        for fallback in fallbacks:
            if fallback != current_model and validate_model_availability(fallback):
                logger.info(f"Using fallback {model_type} model: {fallback}")
                return fallback

        return None

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
                # Check if API token exists
                if not hasattr(self.ai_settings, 'HUGGINGFACEHUB_API_TOKEN') or not self.ai_settings.HUGGINGFACEHUB_API_TOKEN:
                    logger.error("HUGGINGFACEHUB_API_TOKEN is not set in environment variables")
                    return None

                # Validate current model before initialization
                if not validate_model_availability(self.current_llm_model):
                    logger.warning(f"Current LLM model '{self.current_llm_model}' is not available, trying fallback")
                    fallback_model = self.get_fallback_model('llm', self.current_llm_model)
                    if fallback_model:
                        self.current_llm_model = fallback_model
                        logger.info(f"Using fallback LLM model: {fallback_model}")
                    else:
                        logger.error(f"No available LLM model found. Current: {self.current_llm_model}")
                        return None

                # Fixed initialization - parameters as explicit arguments
                self._llm = HuggingFaceEndpoint(
                    repo_id=self.current_llm_model,
                    temperature=self.ai_settings.LLM_TEMPERATURE,
                    huggingfacehub_api_token=self.ai_settings.HUGGINGFACEHUB_API_TOKEN,
                    task="text-generation",
                    max_new_tokens=self.ai_settings.LLM_MAX_LENGTH,
                    do_sample=True,
                    return_full_text=False
                )
                logger.info(f"Initialized Hugging Face hosted LLM: {self.current_llm_model}")

            except Exception as e:
                logger.error(f"Failed to initialize LLM '{self.current_llm_model}': {str(e)}")
                logger.error(f"Traceback: {traceback.format_exc()}")
                return None

        return self._llm

    async def generate_daily_report(self, user: Dict[str, Any], time_range: str = "1d",
                                  custom_start_date: Optional[datetime] = None,
                                  custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Generate a comprehensive daily trading report using AI analysis.

        Args:
            user: User object with authentication information
            time_range: Time range for the report
            custom_start_date: Custom start date if time_range is 'custom'
            custom_end_date: Custom end date if time_range is 'custom'

        Returns:
            Dictionary containing the generated report and metadata
        """
        try:
            start_time = datetime.now()

            # Validate token before proceeding
            if not self._validate_token(user.get("access_token", "")):
                raise Exception("Invalid or expired authentication token")

            # Check if LLM is available before proceeding
            if self.llm is None:
                raise Exception("LLM is not available. Check your HUGGINGFACEHUB_API_TOKEN and model configuration.")

            # Get trading context data with error handling
            try:
                trading_context = await self.reports_service.get_trading_context(
                    user["access_token"], time_range, custom_start_date, custom_end_date
                )
            except Exception as e:
                logger.warning(f"Error getting trading context, using fallback: {str(e)}")
                trading_context = {"message": "No trading data available", "analytics": {}}

            # Generate report using updated LangChain pattern
            try:
                # Create a simple chain using the new pattern
                chain = self.trading_prompts["daily_report"] | self.llm | StrOutputParser()

                report_content = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: chain.invoke({
                        "trading_data": json.dumps(trading_context, indent=2),
                        "date_range": f"{custom_start_date or 'N/A'} to {custom_end_date or 'N/A'}"
                    })
                )
            except Exception as llm_error:
                logger.error(f"LLM generation failed: {str(llm_error)}")
                raise Exception(f"Failed to generate report content: {str(llm_error)}")

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
                metrics=trading_context.get('analytics', {}),
                date_range_start=custom_start_date,
                date_range_end=custom_end_date,
                model_used=self.current_llm_model,
                confidence_score=0.85
            )

            # Save report to database
            try:
                saved_report = await self.reports_service.create_report(report_data, user["access_token"])
            except Exception as e:
                logger.error(f"Error saving report: {str(e)}")
                # Return generated content even if saving fails
                saved_report = {
                    "content": report_content,
                    "title": report_data.title,
                    "insights": insights,
                    "recommendations": recommendations
                }

            return {
                "report": saved_report,
                "processing_time_ms": processing_time,
                "trading_context": trading_context
            }

        except Exception as e:
            logger.error(f"Error generating daily report: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise Exception(f"Failed to generate daily report: {str(e)}")

    async def process_chat_message(self, user: Dict[str, Any], session_id: str,
                                 user_message: str, context_limit: int = 10) -> Dict[str, Any]:
        """
        Process a chat message with context from trading data and conversation history.

        Args:
            user: User object with authentication information
            session_id: Chat session identifier
            user_message: User's message
            context_limit: Number of previous messages to include as context

        Returns:
            Dictionary containing AI response and metadata
        """
        try:
            logger.info(f"Processing chat message: {user_message[:100]}...")
            start_time = datetime.now()

            # Validate token before proceeding
            if not self._validate_token(user.get("access_token", "")):
                raise Exception("Invalid or expired authentication token")

            # Check if LLM is available before proceeding
            if self.llm is None:
                raise Exception("LLM is not available. Check your HUGGINGFACEHUB_API_TOKEN and model configuration.")

            # Handle session creation if session_id is None
            if not session_id:
                logger.info("Creating new chat session...")
                try:
                    # For now, we'll create a simple session ID
                    session_id = str(uuid.uuid4())
                    logger.info(f"Created new session with ID: {session_id}")
                except Exception as e:
                    logger.error(f"Error creating new session: {str(e)}")
                    # Fallback to a simple session ID
                    session_id = f"session_{int(datetime.now().timestamp())}"
                    logger.info(f"Using fallback session ID: {session_id}")

            # Get recent chat history for context (with fallback handling)
            try:
                chat_history = await self.chat_service.get_session_messages(
                    session_id, user["access_token"], limit=context_limit
                )
            except Exception as e:
                logger.error(f"Error getting chat history: {str(e)}")
                chat_history = []

            # Format chat history
            history_text = self._format_chat_history(chat_history)

            # Get relevant trading context using vector search (with fallback)
            try:
                trading_context = await self._get_relevant_trading_context(
                    user["access_token"], user_message
                )
            except Exception as e:
                logger.error(f"Error getting trading context: {str(e)}")
                trading_context = {"message": "Trading context unavailable"}

            # Generate embedding for the user message (with fallback)
            try:
                user_embedding = self.embedding_service.generate_embedding(user_message)
            except Exception as e:
                logger.error(f"Error generating user embedding: {str(e)}")
                user_embedding = None

            # Save user message (with graceful failure)
            try:
                user_msg_data = AIChatMessageCreate(
                    session_id=session_id,
                    message_type=MessageType.USER_QUESTION,
                    content=user_message,
                    context_data={"embedding": user_embedding if user_embedding else []},
                    source_type=SourceType.EXTERNAL_AI
                )

                await self.chat_service.create_message(user_msg_data, user["access_token"])
            except Exception as e:
                logger.error(f"Error saving user message: {str(e)}")
                # Continue processing even if saving fails

            # Prepare prompt for AI response
            prompt_input = {
                "context": json.dumps(trading_context, indent=2),
                "question": user_message,
                "chat_history": history_text
            }

            # Generate AI response using updated LangChain pattern
            try:
                # Create a simple chain using the new pattern
                chain = self.trading_prompts["chat"] | self.llm | StrOutputParser()

                ai_response = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: chain.invoke(prompt_input)
                )
            except Exception as llm_error:
                logger.error(f"LLM chat generation failed: {str(llm_error)}")
                ai_response = "I'm sorry, I'm having trouble processing your request right now. Please try again later."

            # Calculate processing time
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

            # Generate embedding for AI response (with fallback)
            try:
                ai_embedding = self.embedding_service.generate_embedding(ai_response)
            except Exception as e:
                logger.error(f"Error generating AI embedding: {str(e)}")
                ai_embedding = None

            # Save AI response (with graceful failure)
            try:
                ai_msg_data = AIChatMessageCreate(
                    session_id=session_id,
                    message_type=MessageType.AI_RESPONSE,
                    content=ai_response,
                    context_data={
                        "embedding": ai_embedding if ai_embedding else [],
                        "context_used": trading_context,
                        "processing_time_ms": processing_time
                    },
                    model_used=self.current_llm_model,
                    confidence_score=0.8,
                    source_type=SourceType.EXTERNAL_AI
                )

                saved_response = await self.chat_service.create_message(ai_msg_data, user["access_token"])
            except Exception as e:
                logger.error(f"Error saving AI response: {str(e)}")
                # Create a simple response object if saving fails
                saved_response = {
                    "content": ai_response,
                    "processing_time_ms": processing_time,
                    "model_used": self.current_llm_model,
                    "session_id": session_id
                }

            return {
                "session_id": session_id,
                "response": saved_response,
                "processing_time_ms": processing_time,
                "context_used": trading_context
            }

        except Exception as e:
            logger.error(f"Error processing chat message: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise Exception(f"Failed to process chat message: {str(e)}")

    async def generate_insights(self, user: Dict[str, Any], insight_types: List[InsightType],
                              time_range: str = "30d", min_confidence: float = 0.7) -> List[Dict[str, Any]]:
        """
        Generate AI insights based on trading data analysis.

        Args:
            user: User object with authentication information
            insight_types: Types of insights to generate
            time_range: Time range for analysis
            min_confidence: Minimum confidence threshold

        Returns:
            List of generated insights
        """
        try:
            generated_insights = []

            # Validate token before proceeding
            if not self._validate_token(user.get("access_token", "")):
                raise Exception("Invalid or expired authentication token")

            # Check if LLM is available before proceeding
            if self.llm is None:
                raise Exception("LLM is not available. Check your HUGGINGFACEHUB_API_TOKEN and model configuration.")

            # Get trading context for analysis
            try:
                trading_context = await self.reports_service.get_trading_context(
                    user["access_token"], time_range
                )
            except Exception as e:
                logger.error(f"Error getting trading context for insights: {str(e)}")
                trading_context = {"message": "No trading data available"}

            for insight_type in insight_types:
                try:
                    # Generate insight using AI with updated LangChain pattern
                    prompt_input = {
                        "trading_data": json.dumps(trading_context, indent=2),
                        "insight_type": insight_type.value
                    }

                    # Create a simple chain using the new pattern
                    chain = self.trading_prompts["insight"] | self.llm | StrOutputParser()

                    insight_content = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: chain.invoke(prompt_input)
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
                        model_used=self.current_llm_model
                    )

                    # Save insight to database
                    try:
                        saved_insight = await self.insights_service.create_insight(insight_data, user["access_token"])
                        generated_insights.append(saved_insight)
                    except Exception as e:
                        logger.error(f"Error saving insight: {str(e)}")
                        # Add to results even if saving fails
                        generated_insights.append({
                            "type": insight_type.value,
                            "content": insight_content,
                            "actions": actions,
                            "priority": priority.value
                        })
                        continue

                except Exception as e:
                    logger.error(f"Error generating {insight_type.value} insight: {str(e)}")
                    continue

            return generated_insights

        except Exception as e:
            logger.error(f"Error generating insights: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise Exception(f"Failed to generate insights: {str(e)}")

    def _extract_insights_and_recommendations(self, report_content: str) -> tuple:
        """Extract structured insights and recommendations from report content."""
        insights = []
        recommendations = []

        try:
            if not report_content or not isinstance(report_content, str):
                return insights, recommendations

            lines = report_content.split('\n')
            current_section = None

            for line in lines:
                line = line.strip()
                if not line:
                    continue

                # Section detection
                if any(keyword in line.lower() for keyword in ['insight', 'pattern', 'observation']):
                    current_section = 'insights'
                elif any(keyword in line.lower() for keyword in ['recommend', 'suggest', 'should', 'consider']):
                    current_section = 'recommendations'
                elif line and current_section == 'insights' and not line.startswith('#'):
                    insights.append(line)
                elif line and current_section == 'recommendations' and not line.startswith('#'):
                    recommendations.append(line)

        except Exception as e:
            logger.error(f"Error extracting insights and recommendations: {str(e)}")

        return insights[:5], recommendations[:5]  # Limit to top 5 each

    def _format_chat_history(self, chat_history: List) -> str:
        """Format chat history for context in prompts."""
        if not chat_history:
            return "No previous conversation."

        try:
            formatted = []
            for msg in chat_history[-5:]:  # Last 5 messages
                # Handle both object and dict formats
                if hasattr(msg, 'message_type') and hasattr(msg, 'content'):
                    role = "User" if msg.message_type == MessageType.USER_QUESTION else "Assistant"
                    content = msg.content
                elif isinstance(msg, dict):
                    msg_type = msg.get('message_type')
                    if isinstance(msg_type, str):
                        role = "User" if msg_type == "user_question" else "Assistant"
                    elif msg_type and hasattr(msg_type, 'value'):
                        role = "User" if msg_type.value == "user_question" else "Assistant"
                    else:
                        role = "User" if msg_type == MessageType.USER_QUESTION else "Assistant"
                    content = msg.get('content', '')
                else:
                    continue  # Skip malformed messages

                if content:
                    formatted.append(f"{role}: {content[:200]}...")  # Truncate long messages

            return "\n".join(formatted) if formatted else "No previous conversation."

        except Exception as e:
            logger.error(f"Error formatting chat history: {str(e)}")
            return "Error retrieving conversation history."

    async def _get_relevant_trading_context(self, access_token: str, query: str) -> Dict[str, Any]:
        """Get relevant trading context based on the query using vector search."""
        try:
            # Generate embedding for the query (with fallback)
            try:
                query_embedding = self.embedding_service.generate_embedding(query)
            except Exception as e:
                logger.error(f"Error generating query embedding: {str(e)}")
                query_embedding = None

            # Search for relevant chat messages and insights (with fallback)
            try:
                relevant_messages = await self.chat_service.search_messages(
                    access_token, query, None, 3, 0.6
                )
            except Exception as e:
                logger.error(f"Error searching messages: {str(e)}")
                relevant_messages = []

            try:
                relevant_insights = await self.insights_service.search_insights(
                    access_token, query, None, 3, 0.6
                )
            except Exception as e:
                logger.error(f"Error searching insights: {str(e)}")
                relevant_insights = []

            # Get recent trading context (with fallback)
            try:
                trading_context = await self.reports_service.get_trading_context(
                    access_token, time_range="7d"
                )
            except Exception as e:
                logger.error(f"Error getting recent trading context: {str(e)}")
                trading_context = {"message": "Recent trading data unavailable"}

            # Safe attribute access for messages and insights
            relevant_message_contents = []
            for msg in relevant_messages:
                try:
                    if hasattr(msg, 'content'):
                        relevant_message_contents.append(msg.content)
                    elif isinstance(msg, dict) and 'content' in msg:
                        relevant_message_contents.append(msg['content'])
                except Exception as e:
                    logger.error(f"Error processing message content: {str(e)}")
                    continue

            relevant_insight_descriptions = []
            for insight in relevant_insights:
                try:
                    if hasattr(insight, 'description'):
                        relevant_insight_descriptions.append(insight.description)
                    elif isinstance(insight, dict) and 'description' in insight:
                        relevant_insight_descriptions.append(insight['description'])
                except Exception as e:
                    logger.error(f"Error processing insight description: {str(e)}")
                    continue

            return {
                "recent_trading": trading_context,
                "relevant_messages": relevant_message_contents,
                "relevant_insights": relevant_insight_descriptions
            }

        except Exception as e:
            logger.error(f"Error getting relevant context: {str(e)}")
            return {"message": "Context retrieval failed"}

    def _extract_actions_from_insight(self, insight_content: str) -> Optional[Dict[str, Any]]:
        """Extract actionable items from insight content."""
        try:
            if not insight_content or not isinstance(insight_content, str):
                return None

            # Simple action extraction - in production, use more sophisticated NLP
            actions = {}

            content_lower = insight_content.lower()

            if 'reduce risk' in content_lower:
                actions['risk_management'] = 'Consider reducing position sizes'

            if 'increase' in content_lower and 'profit' in content_lower:
                actions['profit_optimization'] = 'Look for profit-taking opportunities'

            if 'pattern' in content_lower:
                actions['pattern_recognition'] = 'Monitor identified trading patterns'

            if 'stop loss' in content_lower:
                actions['risk_control'] = 'Review stop loss strategies'

            if 'diversif' in content_lower:
                actions['portfolio_management'] = 'Consider portfolio diversification'

            return actions if actions else None
        except Exception as e:
            logger.error(f"Error extracting actions from insight: {str(e)}")
            return None

    def _determine_insight_priority(self, insight_type: InsightType, trading_context: Dict[str, Any]) -> InsightPriority:
        """Determine insight priority based on type and trading context."""
        try:
            # Simple priority logic - can be enhanced with more sophisticated rules
            if insight_type == InsightType.RISK:
                return InsightPriority.HIGH
            elif insight_type == InsightType.OPPORTUNITY:
                return InsightPriority.MEDIUM
            elif insight_type == InsightType.ALERT:
                return InsightPriority.CRITICAL
            else:
                return InsightPriority.MEDIUM
        except Exception as e:
            logger.error(f"Error determining insight priority: {str(e)}")
            return InsightPriority.MEDIUM

    def clear_conversation_history(self):
        """Clear the conversation history."""
        self._conversation_history = []
        logger.info("Conversation history cleared")

    def add_to_conversation_history(self, message: str, role: str = "user"):
        """Add a message to conversation history."""
        try:
            self._conversation_history.append({
                "role": role,
                "content": message,
                "timestamp": datetime.now()
            })

            # Keep only last 10 messages to avoid memory issues
            if len(self._conversation_history) > 10:
                self._conversation_history = self._conversation_history[-10:]

        except Exception as e:
            logger.error(f"Error adding to conversation history: {str(e)}")

    def get_health_status(self) -> Dict[str, Any]:
        """Get health status of the AI orchestrator."""
        try:
            status = {
                "timestamp": datetime.now().isoformat(),
                "llm_available": self.llm is not None,
                "current_models": {
                    "llm": self.current_llm_model,
                    "embedding": self.current_embedding_model
                },
                "model_validation": self.validate_current_models(),
                "services_status": {
                    "embedding_service": bool(self.embedding_service),
                    "reports_service": bool(self.reports_service),
                    "chat_service": bool(self.chat_service),
                    "insights_service": bool(self.insights_service)
                }
            }

            return status
        except Exception as e:
            logger.error(f"Error getting health status: {str(e)}")
            return {
                "timestamp": datetime.now().isoformat(),
                "status": "error",
                "error": str(e)
            }
