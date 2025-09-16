from typing import Dict, Any, Optional, List
import asyncio
import logging
import traceback
from datetime import datetime, timedelta
import json
import uuid
import time
import os

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

# LangChain imports - Updated to use OpenRouter via OpenAI SDK
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

# Local imports
from services.ai_embedding_service import AIEmbeddingService
from services.ai_reports_service import AIReportsService
from services.ai_chat_service import AIChatService
from services.ai_insights_service import AIInsightsService
from models.ai_reports import ReportType, AIReportCreate
from models.ai_chat import (
    AIChatMessageCreate, AIChatSessionCreate, MessageType, SourceType,
    AIChatMessageResponse  
)
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

        # Model management with stable models
        self.stable_models = self._get_stable_models()
        self.current_llm_model = self._get_default_stable_model()
        self.current_embedding_model = self.ai_settings.DEFAULT_EMBEDDING_MODEL
        self.available_models = self._load_available_models()

        # LangChain setup - Updated to avoid deprecated classes
        self._llm = None
        self._llm_initialized = False
        self._conversation_history = []  # Simple list to track conversation

        # LlamaIndex setup
        self._vector_store = None
        self._index = None

        # Trading-specific prompts
        self.trading_prompts = self._initialize_trading_prompts()

    def _get_stable_models(self) -> List[Dict[str, str]]:
        """Get list of free models available on OpenRouter, organized by tier."""
        return [
            # Tier 1: HIGH PERFORMANCE - Latest and most capable free models
            {"name": "GPT-OSS 120B", "model": "openai/gpt-oss-120b", "tier": 1, "provider": "OpenAI"},
            {"name": "DeepSeek Coder", "model": "deepseek/deepseek-coder", "tier": 1, "provider": "DeepSeek"},
            {"name": "DeepSeek Chat", "model": "deepseek/deepseek-chat", "tier": 1, "provider": "DeepSeek"},
            {"name": "Kimi Dev 72B", "model": "moonshotai/kimi-dev-72b", "tier": 1, "provider": "MoonshotAI"},
            {"name": "DeepSeek R1", "model": "deepseek/deepseek-r1", "tier": 1, "provider": "DeepSeek"},

            # Tier 2: BALANCED PERFORMANCE - Good performance and reliability
            {"name": "GPT-OSS 20B", "model": "openai/gpt-oss-20b", "tier": 2, "provider": "OpenAI"},
            {"name": "GLM 4.5 Air", "model": "z-ai/glm-4.5-air", "tier": 2, "provider": "Z-AI"},
            {"name": "Qwen3 Coder", "model": "qwen/qwen3-coder", "tier": 2, "provider": "Qwen"},
            {"name": "Kimi K2", "model": "moonshotai/kimi-k2", "tier": 2, "provider": "MoonshotAI"},
            {"name": "Hunyuan A13B", "model": "tencent/hunyuan-a13b-instruct", "tier": 2, "provider": "Tencent"},
            {"name": "Mistral Small 3.2 24B", "model": "mistralai/mistral-small-3.2-24b-instruct", "tier": 2, "provider": "Mistral"},
            {"name": "Devstral Small 2505", "model": "mistralai/devstral-small-2505", "tier": 2, "provider": "Mistral"},
            {"name": "Llama 3.3 8B", "model": "meta-llama/llama-3.3-8b-instruct", "tier": 2, "provider": "Meta"},
            {"name": "Sarvam M", "model": "sarvamai/sarvam-m", "tier": 2, "provider": "SarvamAI"},

            # Tier 3: SPECIALIZED - Coder and reasoning models
            {"name": "DeepSeek R1T2 Chimera", "model": "tngtech/deepseek-r1t2-chimera", "tier": 3, "provider": "TNG Tech"},
            {"name": "DeepSeek R1 0528 Qwen3 8B", "model": "deepseek/deepseek-r1-0528-qwen3-8b", "tier": 3, "provider": "DeepSeek"},
            {"name": "DeepSeek R1T Chimera", "model": "tngtech/deepseek-r1t-chimera", "tier": 3, "provider": "TNG Tech"},
            {"name": "Dolphin Mistral 24B Venice", "model": "cognitivecomputations/dolphin-mistral-24b-venice-edition", "tier": 3, "provider": "Cognitive Computations"},

            # Tier 4: QWEN SERIES - Various sizes for different use cases
            {"name": "Qwen3 235B A22B", "model": "qwen/qwen3-235b-a22b", "tier": 4, "provider": "Qwen"},
            {"name": "Qwen3 30B A3B", "model": "qwen/qwen3-30b-a3b", "tier": 4, "provider": "Qwen"},
            {"name": "Qwen3 14B", "model": "qwen/qwen3-14b", "tier": 4, "provider": "Qwen"},
            {"name": "Qwen3 8B", "model": "qwen/qwen3-8b", "tier": 4, "provider": "Qwen"},
            {"name": "Qwen3 4B", "model": "qwen/qwen3-4b", "tier": 4, "provider": "Qwen"}
        ]

    def _get_default_stable_model(self) -> str:
        """Get the most stable default model for OpenRouter."""
        # Start with tier 1 models (most stable and reliable)
        tier_1_models = [model for model in self.stable_models if model["tier"] == 1]
        if tier_1_models:
            return tier_1_models[0]["model"]
        
        # Fallback to any available model
        return self.stable_models[0]["model"] if self.stable_models else "openai/gpt-4o-mini"

    def _check_model_task_compatibility(self, repo_id: str, task: str = "text-generation") -> bool:
        """
        Check if a model supports the specified task on FREE PLAN.
        
        Args:
            repo_id: Hugging Face model repository ID
            task: Task type to check
            
        Returns:
            True if compatible, False otherwise
        """
        try:
            # Models known to work with text-generation on free plan
            free_plan_compatible = {
                "openai-community/gpt2",
                "openai-community/gpt2-medium", 
                "openai-community/gpt2-large",
                "distilbert/distilgpt2",
                "EleutherAI/gpt-neo-125m",
                "EleutherAI/gpt-neo-1.3B",
                "EleutherAI/gpt-neo-2.7B",
                "bigscience/bloom-560m",
                "bigscience/bloom-1b1",
                "facebook/opt-350m",
                "facebook/opt-1.3b",
                "facebook/opt-2.7b",
                "EleutherAI/pythia-410m",
                "EleutherAI/pythia-1.4b",
                "TinyLlama/TinyLlama-1.1B-intermediate-step-1431k-3T",
                "Salesforce/codegen-350M-mono",
                "Salesforce/codegen-2B-mono",
                "EleutherAI/gpt-j-6b",
                "facebook/opt-125m"
            }
            
            return repo_id in free_plan_compatible
            
        except Exception as e:
            logger.error(f"Error checking model compatibility: {str(e)}")
            return False

    def _load_available_models(self) -> Dict[str, Dict[str, str]]:
        """Load all available models from configuration."""
        try:
            stable_llm_models = {model["name"]: model["model"] for model in self.stable_models}
            
            return {
                'llm': {**get_available_llm_models(), **stable_llm_models},
                'embedding': get_available_embedding_models(),
                'financial': get_financial_models(),
                'stable_llm': stable_llm_models
            }
        except Exception as e:
            logger.error(f"Error loading available models: {str(e)}")
            return {'llm': {}, 'embedding': {}, 'financial': {}, 'stable_llm': {}}

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

    def _initialize_llm_with_fallback(self) -> Optional[ChatOpenAI]:
        """Initialize LLM with automatic fallback to OpenRouter compatible models."""
        try:
            # Get OpenRouter API key from environment
            openrouter_api_key = os.getenv('OPENROUTER_API_KEY')
            if not openrouter_api_key:
                logger.error("OPENROUTER_API_KEY is not set in environment variables")
                return None

            # Try models in order of stability (tier 1 -> 4), optimized for OpenRouter
            models_by_tier = {}
            for model in self.stable_models:
                tier = model["tier"]
                if tier not in models_by_tier:
                    models_by_tier[tier] = []
                models_by_tier[tier].append(model)

            # Try each tier in order
            for tier in sorted(models_by_tier.keys()):
                for model_config in models_by_tier[tier]:
                    try:
                        logger.info(f"Attempting to initialize model: {model_config['model']} (Tier {tier})")

                        # OpenRouter optimized configuration
                        llm = ChatOpenAI(
                            model=model_config["model"],
                            api_key=openrouter_api_key,
                            base_url="https://openrouter.ai/api/v1",
                            temperature=0.7,
                            max_tokens=4096,
                            streaming=False,  # Set to True if you want streaming
                            default_headers={
                                "HTTP-Referer": os.getenv("OPENROUTER_HTTP_REFERER", ""),
                                "X-Title": os.getenv("OPENROUTER_X_TITLE", ""),
                            }
                        )

                        # Test the model with a very simple prompt
                        test_response = llm.invoke("Hello, can you respond with 'Test successful'?")
                        if test_response and len(str(test_response.content).strip()) > 0:
                            self.current_llm_model = model_config["model"]
                            logger.info(f"Successfully initialized OpenRouter LLM: {model_config['model']}")
                            return llm

                    except Exception as e:
                        logger.warning(f"Failed to initialize {model_config['model']}: {str(e)}")
                        continue

            logger.error("All OpenRouter compatible models failed to initialize")
            return None

        except Exception as e:
            logger.error(f"Error in _initialize_llm_with_fallback: {str(e)}")
            return None

    def select_model(self, model_type: str, model_key: str) -> bool:
        """
        Select a specific model for use.

        Args:
            model_type: Type of model ('llm', 'embedding', 'financial', 'stable_llm')
            model_key: Key identifier for the model

        Returns:
            True if model was successfully selected, False otherwise
        """
        try:
            if model_type == 'stable_llm':
                # Handle stable model selection
                stable_model = next((m for m in self.stable_models if m["name"] == model_key), None)
                if stable_model:
                    self.current_llm_model = stable_model["model"]
                    self._llm = None  # Reset to force reinitialization
                    self._llm_initialized = False
                    logger.info(f"Switched to stable LLM model: {stable_model['model']}")
                    return True
                else:
                    logger.warning(f"Stable model '{model_key}' not found")
                    return False

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
                self._llm_initialized = False
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
            "current_models": {
                "llm": self.current_llm_model,
                "embedding": self.current_embedding_model
            },
            "available_models": self.available_models,
            "stable_models": self.stable_models,
            "model_validation": self.validate_current_models(),
            "llm_initialized": self._llm_initialized
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

        # Test LLM initialization
        try:
            validation_status['llm_functional'] = self.llm is not None
        except Exception as e:
            logger.error(f"Error testing LLM functionality: {str(e)}")
            validation_status['llm_functional'] = False

        # Log validation results
        for model_type, is_valid in validation_status.items():
            if not is_valid:
                current_model = getattr(self, f'current_{model_type}_model', 'unknown')
                logger.warning(f"Current {model_type} model is not valid: {current_model}")

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
        if model_type == 'llm':
            # Use stable models as fallbacks, prioritizing by tier
            for model in sorted(self.stable_models, key=lambda x: x["tier"]):
                if model["model"] != current_model:
                    logger.info(f"Using fallback LLM model: {model['model']} (Tier {model['tier']})")
                    return model["model"]
        
        # Original fallback logic for other model types
        fallback_options = {
            'llm': [
                'microsoft/DialoGPT-medium',
                'google/flan-t5-base', 
                'microsoft/DialoGPT-small'
            ],
            'embedding': [
                'sentence-transformers/all-MiniLM-L6-v2',
                'BAAI/bge-small-en-v1.5',
                'intfloat/e5-small-v2'
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
        """Lazy load the LLM with enhanced error handling and fallback logic."""
        if self._llm is None or not self._llm_initialized:
            try:
                self._llm = self._initialize_llm_with_fallback()
                self._llm_initialized = self._llm is not None
                
                if self._llm is None:
                    logger.error("Failed to initialize any LLM model")
                    return None
                    
            except Exception as e:
                logger.error(f"Failed to initialize LLM: {str(e)}")
                logger.error(f"Traceback: {traceback.format_exc()}")
                self._llm = None
                self._llm_initialized = False
                return None

        return self._llm

    def _safe_chain_invoke(self, chain, input_data):
        """Safely invoke a LangChain chain, handling StopIteration and other exceptions."""
        try:
            # Enhanced error handling for chain invocation
            max_retries = 3
            retry_delay = 1.0
            
            for attempt in range(max_retries):
                try:
                    # Try direct LLM invocation first to isolate the issue
                    if hasattr(chain, 'steps') and len(chain.steps) >= 2:
                        prompt_template = chain.steps[0]
                        llm = chain.steps[1]
                        
                        # Format prompt manually
                        formatted_prompt = prompt_template.format(**input_data)
                        
                        # Call LLM directly with timeout
                        result = llm.invoke(formatted_prompt)
                        
                        # Parse output manually if needed
                        if hasattr(chain, 'steps') and len(chain.steps) > 2:
                            output_parser = chain.steps[2]
                            if hasattr(output_parser, 'parse'):
                                result = output_parser.parse(result)
                        
                        return result
                    else:
                        # Fallback to chain invoke
                        result = chain.invoke(input_data)
                        return result
                        
                except (StopIteration, RuntimeError, ConnectionError) as e:
                    logger.warning(f"Chain invoke attempt {attempt + 1} failed: {str(e)}")
                    
                    if attempt < max_retries - 1:
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                        
                        # Try to reinitialize LLM on StopIteration
                        if isinstance(e, StopIteration):
                            logger.info("Reinitializing LLM due to StopIteration")
                            self._llm = None
                            self._llm_initialized = False
                            
                            # Force reinitialization
                            new_llm = self.llm
                            if new_llm is None:
                                continue
                        continue
                    else:
                        raise e

            # If all retries failed, try manual prompt formatting
            logger.warning("All chain invocation attempts failed, trying manual approach")
            return self._manual_llm_invoke(input_data)
                        
        except Exception as e:
            logger.error(f"All LLM invocation methods failed: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return self._get_fallback_response(input_data)

    def _manual_llm_invoke(self, input_data: Dict[str, Any]) -> str:
        """Manual LLM invocation as last resort."""
        try:
            if not self.llm:
                raise Exception("LLM not available")
                
            prompt_text = self._format_prompt_manually(input_data)
            
            # Try direct invoke with the current LLM
            raw_result = self.llm.invoke(prompt_text)
            
            # Clean up the result
            if isinstance(raw_result, str):
                return raw_result.strip()
            elif hasattr(raw_result, 'content'):
                return raw_result.content.strip()
            else:
                return str(raw_result).strip()
                
        except Exception as e:
            logger.error(f"Manual LLM invoke failed: {str(e)}")
            raise

    def _get_fallback_response(self, input_data: Dict[str, Any]) -> str:
        """Generate a fallback response when all LLM methods fail."""
        if 'question' in input_data:
            return "I'm experiencing technical difficulties processing your question. Please try again in a moment, or rephrase your question for better results."
        elif 'insight_type' in input_data:
            return f"Unable to generate {input_data.get('insight_type', 'general')} insights at this time due to technical issues. Please try again later."
        elif 'date_range' in input_data:
            return "I'm unable to generate the trading report right now due to technical difficulties. Please try again later or contact support."
        else:
            return "I'm experiencing technical difficulties. Please try again or contact support if the issue persists."

    def _format_prompt_manually(self, input_data: Dict[str, Any]) -> str:
        """Manually format prompt as fallback when chain fails."""
        try:
            if 'question' in input_data:
                # Chat prompt
                return f"""You are a knowledgeable trading assistant.

Context: {input_data.get('context', 'No context available')}

Previous conversation: {input_data.get('chat_history', 'No previous conversation')}

User question: {input_data['question']}

Please provide a helpful response."""

            elif 'trading_data' in input_data and 'insight_type' in input_data:
                # Insight prompt
                return f"""You are a trading pattern recognition expert. Analyze the trading data to identify {input_data['insight_type']} insights.

Trading Data: {input_data['trading_data']}

Provide specific, actionable insights with confidence scores."""

            elif 'trading_data' in input_data and 'date_range' in input_data:
                # Report prompt
                return f"""You are an expert trading analyst. Generate a comprehensive trading report.

Trading Data: {input_data['trading_data']}
Date Range: {input_data['date_range']}

Provide:
1. Performance Summary
2. Key Insights  
3. Risk Analysis
4. Recommendations
5. Market Observations"""

            else:
                return f"Please analyze the following data: {json.dumps(input_data, indent=2)}"
                
        except Exception as e:
            logger.error(f"Error formatting prompt manually: {str(e)}")
            return "Please provide analysis on the given data."

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
                raise Exception("LLM is not available. Please check your OPENROUTER_API_KEY and try again.")

            # Get trading context data with error handling
            try:
                trading_context = await self.reports_service.get_trading_context(
                    user["access_token"], time_range, custom_start_date, custom_end_date
                )
            except Exception as e:
                logger.warning(f"Error getting trading context, using fallback: {str(e)}")
                trading_context = {"message": "No trading data available", "analytics": {}}

            # Generate report using enhanced chain approach
            try:
                chain = self.trading_prompts["daily_report"] | self.llm | StrOutputParser()

                report_content = self._safe_chain_invoke(chain, {
                    "trading_data": json.dumps(trading_context, indent=2),
                    "date_range": f"{custom_start_date or 'N/A'} to {custom_end_date or 'N/A'}"
                })
                    
            except Exception as llm_error:
                logger.error(f"LLM generation failed: {str(llm_error)}")
                report_content = self._get_fallback_response({
                    "trading_data": trading_context,
                    "date_range": f"{custom_start_date or 'N/A'} to {custom_end_date or 'N/A'}"
                })

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
                raise Exception("LLM is not available. Please check your OPENROUTER_API_KEY and try again.")

            # Handle session creation if session_id is None
            if not session_id:
                logger.info("Creating new chat session...")
                try:
                    session_id = str(uuid.uuid4())
                    logger.info(f"Created new session with ID: {session_id}")
                except Exception as e:
                    logger.error(f"Error creating new session: {str(e)}")
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

            # Prepare prompt for AI response
            prompt_input = {
                "context": json.dumps(trading_context, indent=2),
                "question": user_message,
                "chat_history": history_text
            }

            # Generate AI response using enhanced chain approach
            try:
                chain = self.trading_prompts["chat"] | self.llm | StrOutputParser()
                ai_response = self._safe_chain_invoke(chain, prompt_input)
                    
            except Exception as llm_error:
                logger.error(f"LLM chat generation failed: {str(llm_error)}")
                ai_response = self._get_fallback_response({"question": user_message})

            # Calculate processing time
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

            # Generate embedding for AI response (with fallback)
            try:
                # Extract content from AIMessage if needed
                response_content = ai_response.content if hasattr(ai_response, 'content') else str(ai_response)
                ai_embedding = self.embedding_service.generate_embedding(response_content)
            except Exception as e:
                logger.error(f"Error generating AI embedding: {str(e)}")
                ai_embedding = None

            # Save AI response (with graceful failure)
            try:
                ai_msg_data = AIChatMessageCreate(
                    session_id=session_id,
                    message_type=MessageType.AI_RESPONSE,
                    content=response_content,
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
                saved_response = {
                    "content": response_content,
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
                raise Exception("LLM is not available. Please check your OPENROUTER_API_KEY and try again.")

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
                    prompt_input = {
                        "trading_data": json.dumps(trading_context, indent=2),
                        "insight_type": insight_type.value
                    }

                    chain = self.trading_prompts["insight"] | self.llm | StrOutputParser()
                    insight_content = self._safe_chain_invoke(chain, prompt_input)
                    
                    # Extract content from AIMessage if needed
                    if hasattr(insight_content, 'content'):
                        insight_content = insight_content.content

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
                        confidence_score=min_confidence + 0.1,
                        priority=priority,
                        actionable=bool(actions),
                        actions=actions,
                        tags=[insight_type.value, "ai-generated", time_range],
                        valid_until=datetime.now() + timedelta(days=7),
                        model_used=self.current_llm_model
                    )

                    # Save insight to database
                    try:
                        saved_insight = await self.insights_service.create_insight(insight_data, user["access_token"])
                        generated_insights.append(saved_insight)
                    except Exception as e:
                        logger.error(f"Error saving insight: {str(e)}")
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

        return insights[:5], recommendations[:5]

    def _format_chat_history(self, chat_history: List) -> str:
        """Format chat history for context in prompts."""
        if not chat_history:
            return "No previous conversation."

        try:
            formatted = []
            for msg in chat_history[-5:]:  # Last 5 messages
                try:
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
                        continue

                    if content:
                        formatted.append(f"{role}: {content[:200]}...")
                except Exception as msg_error:
                    logger.warning(f"Error processing chat history message: {str(msg_error)}")
                    continue

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

    def switch_to_stable_model(self, tier: int = 1) -> bool:
        """
        Switch to a stable model from the specified tier.
        
        Args:
            tier: Model tier (1-4, where 1 is most stable)
            
        Returns:
            True if successfully switched, False otherwise
        """
        try:
            tier_models = [model for model in self.stable_models if model["tier"] == tier]
            
            if not tier_models:
                logger.warning(f"No models available in tier {tier}")
                return False
            
            for model_config in tier_models:
                try:
                    self.current_llm_model = model_config["model"]
                    self._llm = None  # Reset to force reinitialization
                    self._llm_initialized = False
                    
                    # Test the new model
                    if self.llm is not None:
                        logger.info(f"Successfully switched to stable model: {model_config['model']}")
                        return True
                        
                except Exception as e:
                    logger.warning(f"Failed to switch to {model_config['model']}: {str(e)}")
                    continue
            
            logger.error(f"All tier {tier} models failed to initialize")
            return False
            
        except Exception as e:
            logger.error(f"Error switching to stable model: {str(e)}")
            return False

    def auto_recover_model(self) -> bool:
        """
        Automatically recover by trying stable models in order.
        
        Returns:
            True if recovery successful, False otherwise
        """
        logger.info("Attempting automatic model recovery...")
        
        # Try each tier in order
        for tier in range(1, 5):
            if self.switch_to_stable_model(tier):
                logger.info(f"Recovery successful with tier {tier} model: {self.current_llm_model}")
                return True
                
        logger.error("Auto-recovery failed - no stable models available")
        return False

    def get_stable_models_info(self) -> Dict[str, Any]:
        """Get information about stable models organized by tier."""
        try:
            models_by_tier = {}
            for model in self.stable_models:
                tier = model["tier"]
                if tier not in models_by_tier:
                    models_by_tier[tier] = []
                models_by_tier[tier].append({
                    "name": model["name"],
                    "model": model["model"],
                    "current": model["model"] == self.current_llm_model
                })
            
            return {
                "current_model": self.current_llm_model,
                "models_by_tier": models_by_tier,
                "total_stable_models": len(self.stable_models),
                "llm_status": "initialized" if self._llm_initialized else "not_initialized"
            }
            
        except Exception as e:
            logger.error(f"Error getting stable models info: {str(e)}")
            return {"error": str(e)}

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
                "llm_initialized": self._llm_initialized,
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
                },
                "stable_models_info": self.get_stable_models_info()
            }

            return status
        except Exception as e:
            logger.error(f"Error getting health status: {str(e)}")
            return {
                "timestamp": datetime.now().isoformat(),
                "status": "error",
                "error": str(e)
            }