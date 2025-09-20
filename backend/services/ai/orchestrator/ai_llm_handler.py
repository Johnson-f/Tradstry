from typing import Dict, Any, Optional
import logging
import traceback
import time
import os
import json

# LangChain imports - Updated to use OpenRouter via OpenAI SDK
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)


class AILLMHandler:
    """
    Handles LLM initialization, chain management, and prompt processing.
    Manages OpenRouter integration, error handling, and fallback logic.
    """

    def __init__(self, model_manager):
        self.model_manager = model_manager
        self._llm = None
        self._llm_initialized = False
        self._conversation_history = []  # Simple list to track conversation
        
        # Legacy prompts for fallback (when prompt service is unavailable)
        self.trading_prompts = self._initialize_legacy_prompts()
        
        logger.info("AI LLM Handler initialized")

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
            for model in self.model_manager.stable_models:
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
                            streaming=True,  # Enable streaming for better UX
                            default_headers={
                                "HTTP-Referer": os.getenv("OPENROUTER_HTTP_REFERER", ""),
                                "X-Title": os.getenv("OPENROUTER_X_TITLE", ""),
                            }
                        )

                        # Test the model with a very simple prompt
                        test_response = llm.invoke("Hello, can you respond with 'Test successful'?")
                        if test_response and len(str(test_response.content).strip()) > 0:
                            self.model_manager.current_llm_model = model_config["model"]
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

    def is_available(self) -> bool:
        """Check if LLM is available for use."""
        return self.llm is not None

    def reinitialize_llm(self) -> bool:
        """Force reinitialization of the LLM."""
        try:
            logger.info("Reinitializing LLM...")
            self._llm = None
            self._llm_initialized = False
            
            # Try to initialize
            new_llm = self.llm
            success = new_llm is not None
            
            if success:
                logger.info("LLM reinitialization successful")
            else:
                logger.error("LLM reinitialization failed")
                
            return success
            
        except Exception as e:
            logger.error(f"Error reinitializing LLM: {str(e)}")
            return False

    def safe_chain_invoke(self, chain, input_data):
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
                        
                        # Extract string content from AIMessage if needed
                        if hasattr(result, 'content'):
                            result = result.content
                        
                        # Parse output manually if needed
                        if hasattr(chain, 'steps') and len(chain.steps) > 2:
                            output_parser = chain.steps[2]
                            if hasattr(output_parser, 'parse'):
                                result = output_parser.parse(result)
                        
                        return result
                    else:
                        # Fallback to chain invoke
                        result = chain.invoke(input_data)
                        
                        # Extract string content from AIMessage if needed
                        if hasattr(result, 'content'):
                            result = result.content
                        
                        return result
                        
                except (StopIteration, RuntimeError, ConnectionError) as e:
                    logger.warning(f"Chain invoke attempt {attempt + 1} failed: {str(e)}")
                    
                    if attempt < max_retries - 1:
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                        
                        # Try to reinitialize LLM on StopIteration
                        if isinstance(e, StopIteration):
                            logger.info("Reinitializing LLM due to StopIteration")
                            self.reinitialize_llm()
                        continue
                    else:
                        raise e

            # If all retries failed, try manual prompt formatting
            logger.warning("All chain invocation attempts failed, trying manual approach")
            return self.manual_llm_invoke(input_data)
                        
        except Exception as e:
            logger.error(f"All LLM invocation methods failed: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return self.get_fallback_response(input_data)

    def manual_llm_invoke(self, input_data: Dict[str, Any]) -> str:
        """Manual LLM invocation as last resort."""
        try:
            if not self.llm:
                raise Exception("LLM not available")
                
            prompt_text = self.format_prompt_manually(input_data)
            
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

    def get_fallback_response(self, input_data: Dict[str, Any]) -> str:
        """Generate a fallback response when all LLM methods fail."""
        if 'question' in input_data:
            return "I'm experiencing technical difficulties processing your question. Please try again in a moment, or rephrase your question for better results."
        elif 'insight_type' in input_data:
            return f"Unable to generate {input_data.get('insight_type', 'general')} insights at this time due to technical issues. Please try again later."
        elif 'date_range' in input_data:
            return "I'm unable to generate the trading report right now due to technical difficulties. Please try again later or contact support."
        else:
            return "I'm experiencing technical difficulties. Please try again or contact support if the issue persists."

    def format_prompt_manually(self, input_data: Dict[str, Any]) -> str:
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

    def _initialize_legacy_prompts(self) -> Dict[str, PromptTemplate]:
        """Initialize legacy trading prompts as fallback when prompt service unavailable."""
        logger.info("Initializing legacy prompt templates as fallback")

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

    async def stream_llm_response(self, formatted_prompt: str):
        """Stream response from LLM token by token with fallback support."""
        try:
            if self.llm is None:
                yield {
                    "type": "error",
                    "message": "LLM not available"
                }
                return
            
            # Try streaming first
            try:
                stream_started = False
                async for chunk in self.llm.astream(formatted_prompt):
                    stream_started = True
                    if hasattr(chunk, 'content') and chunk.content:
                        yield {
                            "type": "token",
                            "content": chunk.content
                        }
                        
                yield {
                    "type": "done",
                    "message": "Streaming response complete"
                }
                
            except Exception as stream_error:
                logger.warning(f"Streaming failed, attempting fallback to non-streaming: {str(stream_error)}")
                
                # If streaming fails, fall back to regular invoke
                try:
                    response = self.llm.invoke(formatted_prompt)
                    response_content = response.content if hasattr(response, 'content') else str(response)
                    
                    # Yield the complete response as a single token
                    yield {
                        "type": "token",
                        "content": response_content
                    }
                    
                    yield {
                        "type": "done",
                        "message": "Response complete (fallback mode)"
                    }
                    
                except Exception as fallback_error:
                    logger.error(f"Both streaming and fallback failed: {str(fallback_error)}")
                    yield {
                        "type": "error",
                        "message": f"Both streaming and fallback failed: {str(fallback_error)}"
                    }
                    
        except Exception as e:
            logger.error(f"Critical error in LLM streaming: {str(e)}")
            yield {
                "type": "error", 
                "message": f"Critical streaming error: {str(e)}"
            }

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
                "timestamp": time.time()
            })

            # Keep only last 10 messages to avoid memory issues
            if len(self._conversation_history) > 10:
                self._conversation_history = self._conversation_history[-10:]

        except Exception as e:
            logger.error(f"Error adding to conversation history: {str(e)}")

    def get_conversation_history(self) -> list:
        """Get current conversation history."""
        return self._conversation_history.copy()

    def get_llm_status(self) -> dict:
        """Get current LLM status and information."""
        return {
            "llm_available": self.llm is not None,
            "llm_initialized": self._llm_initialized,
            "current_model": self.model_manager.current_llm_model,
            "conversation_history_length": len(self._conversation_history),
            "can_reinitialize": True
        }