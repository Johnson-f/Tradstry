from typing import Dict, Any, Optional
import logging
import uuid
import json
from datetime import datetime

from services.ai.ai_chat_service import AIChatService
from services.ai.ai_embedding_service import AIEmbeddingService
from services.ai.prompt_service import PromptService, PromptStrategy
from config.prompt_registry import PromptType
from models.ai_chat import (
    AIChatMessageCreate, MessageType, SourceType
)

logger = logging.getLogger(__name__)


class AIStreamHandler:
    """
    Handles streaming AI responses for real-time chat interactions.
    Manages token-by-token response generation and stream error handling.
    """

    def __init__(self, llm_handler, auth_validator, context_manager=None, prompt_service=None):
        self.llm_handler = llm_handler
        self.auth_validator = auth_validator
        self.context_manager = context_manager
        self.chat_service = AIChatService()
        self.embedding_service = AIEmbeddingService()
        
        # Initialize advanced prompt management
        try:
            logger.info("Initializing advanced prompt management for streaming...")
            self.prompt_service = prompt_service or PromptService()
            self.prompt_enabled = True
            logger.info("Advanced prompt system initialized for streaming")
        except Exception as e:
            logger.error(f"Streaming prompt system initialization failed: {str(e)}")
            self.prompt_service = None
            self.prompt_enabled = False
            logger.info("Continuing with legacy prompt system for streaming")
        
        logger.info("AI Stream Handler initialized")

    async def process_chat_message_stream(self, user: Dict[str, Any], session_id: str,
                                        user_message: str, context_limit: int = 10):
        """
        Process a chat message with streaming response support for real-time token generation.

        Args:
            user: User object with authentication information
            session_id: Chat session identifier  
            user_message: User's message
            context_limit: Number of previous messages to include as context

        Yields:
            Stream of response chunks as they're generated
        """
        user_id = self.auth_validator.extract_user_id(user)
        
        try:
            logger.info(f"Processing streaming chat message for user {user_id}", extra={
                "user_id": user_id,
                "session_id": session_id,
                "message_preview": user_message[:100],
                "message_length": len(user_message),
                "context_limit": context_limit,
                "streaming": True
            })
            
            start_time = datetime.now()

            # Validate authentication before proceeding
            if not self.auth_validator.validate_user_object(user):
                yield {"error": "Invalid or expired authentication token"}
                return

            # Check if LLM is available before proceeding
            if not self.llm_handler.is_available():
                yield {"error": "LLM is not available. Please check your OPENROUTER_API_KEY and try again."}
                return

            # Handle session creation if session_id is None
            if not session_id:
                session_id = str(uuid.uuid4())
                logger.info(f"Created new session with ID: {session_id}")

            # Get recent chat history for context
            try:
                access_token = self.auth_validator.extract_access_token(user)
                chat_history = await self.chat_service.get_session_messages(
                    session_id, access_token, limit=context_limit
                )
            except Exception as e:
                logger.error(f"Error getting chat history: {str(e)}")
                chat_history = []

            # Format chat history
            history_text = self._format_chat_history(chat_history)

            # Get relevant trading context using context manager
            try:
                if self.context_manager:
                    trading_context = await self.context_manager.get_relevant_trading_context(
                        access_token, user_message
                    )
                else:
                    trading_context = await self._get_fallback_trading_context(
                        access_token, user_message
                    )
            except Exception as e:
                logger.error(f"Error getting trading context: {str(e)}")
                trading_context = {"message": "Trading context unavailable"}

            # Generate embedding for the user message
            try:
                user_embedding = self.embedding_service.generate_embedding(user_message)
            except Exception as e:
                logger.error(f"Error generating user embedding: {str(e)}")
                user_embedding = None

            # Save user message
            try:
                user_msg_data = AIChatMessageCreate(
                    session_id=session_id,
                    message_type=MessageType.USER_QUESTION,
                    content=user_message,
                    context_data={"embedding": user_embedding if user_embedding else []},
                    source_type=SourceType.EXTERNAL_AI
                )

                await self.chat_service.create_message(user_msg_data, access_token)
            except Exception as e:
                logger.error(f"Error saving user message: {str(e)}")

            # Yield session info first
            yield {
                "type": "session_info",
                "session_id": session_id,
                "status": "processing"
            }

            # Generate streaming AI response
            full_response = ""
            async for chunk in self._generate_streaming_response(
                trading_context, user_message, history_text, user_id, session_id
            ):
                if chunk.get("type") == "error":
                    yield chunk
                    return
                elif chunk.get("type") == "token":
                    full_response += chunk.get("content", "")
                    yield chunk
                elif chunk.get("type") == "done":
                    yield chunk
                    break

            # Calculate processing time
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

            # Generate embedding for AI response
            try:
                ai_embedding = self.embedding_service.generate_embedding(full_response)
            except Exception as e:
                logger.error(f"Error generating AI embedding: {str(e)}")
                ai_embedding = None

            # Save AI response
            try:
                ai_msg_data = AIChatMessageCreate(
                    session_id=session_id,
                    message_type=MessageType.AI_RESPONSE,
                    content=full_response,
                    context_data={
                        "embedding": ai_embedding if ai_embedding else [],
                        "context_used": trading_context,
                        "processing_time_ms": processing_time,
                        "streaming": True
                    },
                    model_used=self.llm_handler.model_manager.current_llm_model,
                    confidence_score=0.8,
                    source_type=SourceType.EXTERNAL_AI
                )

                saved_response = await self.chat_service.create_message(ai_msg_data, access_token)
                
                # Yield final response info
                yield {
                    "type": "response_saved",
                    "session_id": session_id,
                    "message_id": saved_response.get("id") if isinstance(saved_response, dict) else getattr(saved_response, "id", None),
                    "processing_time_ms": processing_time
                }
            except Exception as e:
                logger.error(f"Error saving AI response: {str(e)}")
                yield {
                    "type": "warning", 
                    "message": "Response generated but not saved to history"
                }

        except Exception as e:
            logger.error(f"Error processing streaming chat message: {str(e)}")
            yield {
                "type": "error",
                "message": f"Failed to process chat message: {str(e)}"
            }

    async def _generate_streaming_response(self, trading_context: Dict[str, Any], 
                                         user_message: str, history_text: str,
                                         user_id: str, session_id: str):
        """Generate streaming AI response using advanced prompt service or fallback."""
        try:
            # Use advanced prompt service if available
            if self.prompt_enabled and self.prompt_service:
                logger.info("Using advanced prompt service for streaming chat response", extra={
                    "user_id": user_id,
                    "session_id": session_id,
                    "prompt_type": PromptType.CHAT
                })
                
                try:
                    input_data = {
                        "context": json.dumps(trading_context, indent=2) if trading_context else "{}",
                        "question": user_message,
                        "chat_history": history_text
                    }
                    
                    # Use the streaming prompt service
                    async for chunk in self.prompt_service.execute_prompt_stream(
                        prompt_type=PromptType.CHAT,
                        input_data=input_data,
                        llm=self.llm_handler.llm,
                        strategy=PromptStrategy.BEST_PERFORMANCE,
                        user_id=user_id
                    ):
                        yield chunk
                        if chunk.get("type") == "done":
                            return
                    
                    return
                        
                except Exception as prompt_error:
                    logger.error(f"Advanced streaming prompt failed, falling back to legacy: {str(prompt_error)}")
            
            # Fallback to legacy streaming approach
            logger.info("Using legacy streaming prompt system")
            prompt_input = {
                "context": json.dumps(trading_context, indent=2) if trading_context else "{}",
                "question": user_message,
                "chat_history": history_text
            }
            
            formatted_prompt = self.llm_handler.format_prompt_manually(prompt_input)
            async for chunk in self.llm_handler.stream_llm_response(formatted_prompt):
                yield chunk
                
        except Exception as e:
            logger.error(f"Error generating streaming response: {str(e)}")
            yield {
                "type": "error",
                "message": f"Failed to generate streaming response: {str(e)}"
            }

    def _format_chat_history(self, chat_history: list) -> str:
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

    async def _get_fallback_trading_context(self, access_token: str, query: str) -> Dict[str, Any]:
        """Fallback context retrieval when context manager is unavailable."""
        try:
            logger.info("Using fallback context retrieval for streaming")
            
            # Search for relevant chat messages (if available)
            try:
                relevant_messages = await self.chat_service.search_messages(
                    access_token, query, None, 3, 0.6
                )
                message_contents = []
                for msg in relevant_messages:
                    try:
                        if hasattr(msg, 'content'):
                            message_contents.append(msg.content)
                        elif isinstance(msg, dict) and 'content' in msg:
                            message_contents.append(msg['content'])
                    except Exception as e:
                        logger.error(f"Error processing message content: {str(e)}")
                        continue
            except Exception as e:
                logger.error(f"Error searching messages: {str(e)}")
                message_contents = []
            
            return {
                "mode": "fallback",
                "relevant_messages": message_contents,
                "note": "Using basic context retrieval for streaming"
            }
            
        except Exception as e:
            logger.error(f"Error in fallback context retrieval: {str(e)}")
            return {
                "mode": "minimal",
                "message": "All context retrieval methods failed", 
                "error": str(e)
            }

    async def test_streaming_connection(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """
        Test streaming connection and capabilities.
        
        Args:
            user: User object with authentication information
            
        Returns:
            Dictionary with test results
        """
        user_id = self.auth_validator.extract_user_id(user)
        
        try:
            logger.info(f"Testing streaming connection for user {user_id}")

            # Validate authentication
            if not self.auth_validator.validate_user_object(user):
                return {
                    "success": False,
                    "error": "Invalid or expired authentication"
                }

            # Test LLM availability
            if not self.llm_handler.is_available():
                return {
                    "success": False,
                    "error": "LLM is not available"
                }

            # Test basic streaming response
            test_message = "Hello, this is a test message. Please respond briefly."
            test_session_id = f"test_{int(datetime.now().timestamp())}"
            
            response_chunks = []
            async for chunk in self.process_chat_message_stream(
                user, test_session_id, test_message, context_limit=1
            ):
                response_chunks.append(chunk)
                if chunk.get("type") == "error":
                    return {
                        "success": False,
                        "error": chunk.get("message", "Unknown streaming error")
                    }
                elif chunk.get("type") == "done":
                    break

            return {
                "success": True,
                "chunks_received": len(response_chunks),
                "test_session_id": test_session_id,
                "streaming_functional": True
            }

        except Exception as e:
            logger.error(f"Error testing streaming connection: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    def get_stream_status(self) -> Dict[str, Any]:
        """Get current status of the stream handler."""
        return {
            "llm_available": self.llm_handler.is_available(),
            "prompt_service_enabled": self.prompt_enabled,
            "chat_service_available": bool(self.chat_service),
            "embedding_service_available": bool(self.embedding_service),
            "context_manager_available": bool(self.context_manager),
            "current_model": self.llm_handler.model_manager.current_llm_model,
            "streaming_supported": True,
            "ready_for_streaming": self.llm_handler.is_available() and bool(self.chat_service)
        }