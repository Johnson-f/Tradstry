from typing import Dict, Any, Optional, List
import logging
import json
import uuid
from datetime import datetime

from services.ai.ai_chat_service import AIChatService
from services.ai.ai_embedding_service import AIEmbeddingService
from services.ai.prompt_service import PromptService, PromptStrategy
from config.prompt_registry import PromptType
from models.ai_chat import (
    AIChatMessageCreate, AIChatSessionCreate, MessageType, SourceType,
    AIChatMessageResponse  
)
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)


class AIChatProcessor:
    """
    Handles AI chat message processing, session management, and context integration.
    Processes user messages, generates AI responses, and manages conversation history.
    """

    def __init__(self, llm_handler, auth_validator, context_manager=None, prompt_service=None):
        self.llm_handler = llm_handler
        self.auth_validator = auth_validator
        self.context_manager = context_manager
        self.chat_service = AIChatService()
        self.embedding_service = AIEmbeddingService()
        
        # Initialize advanced prompt management
        try:
            logger.info("Initializing advanced prompt management for chat...")
            self.prompt_service = prompt_service or PromptService()
            self.prompt_enabled = True
            logger.info("Advanced prompt system initialized for chat")
        except Exception as e:
            logger.error(f"Chat prompt system initialization failed: {str(e)}")
            self.prompt_service = None
            self.prompt_enabled = False
            logger.info("Continuing with legacy prompt system for chat")
        
        logger.info("AI Chat Processor initialized")

    async def process_chat_message(self, user: Dict[str, Any], session_id: str,
                                 user_message: str, context_limit: int = 10) -> Dict[str, Any]:
        """
        Process a chat message with enhanced context from trading data and conversation history.

        Args:
            user: User object with authentication information
            session_id: Chat session identifier
            user_message: User's message
            context_limit: Number of previous messages to include as context

        Returns:
            Dictionary containing AI response and metadata
        """
        user_id = self.auth_validator.extract_user_id(user)
        
        try:
            logger.info(f"Processing chat message for user {user_id}", extra={
                "user_id": user_id,
                "session_id": session_id,
                "message_preview": user_message[:100],
                "message_length": len(user_message),
                "context_limit": context_limit,
                "prompt_enabled": self.prompt_enabled
            })
            
            start_time = datetime.now()

            # Validate authentication before proceeding
            if not self.auth_validator.validate_user_object(user):
                raise Exception("Invalid or expired authentication")

            # Check if LLM is available before proceeding
            if not self.llm_handler.is_available():
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
                access_token = self.auth_validator.extract_access_token(user)
                chat_history = await self.chat_service.get_session_messages(
                    session_id, access_token, limit=context_limit
                )
            except Exception as e:
                logger.error(f"Error getting chat history: {str(e)}")
                chat_history = []

            # Format chat history
            history_text = self._format_chat_history(chat_history)

            # Get relevant trading context using context manager or fallback
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

                await self.chat_service.create_message(user_msg_data, access_token)
            except Exception as e:
                logger.error(f"Error saving user message: {str(e)}")

            # Generate AI response using advanced prompt service or fallback
            if self.prompt_enabled and self.prompt_service:
                logger.info("Using advanced prompt service for chat response", extra={
                    "user_id": user_id,
                    "session_id": session_id,
                    "prompt_type": PromptType.CHAT
                })
                
                try:
                    # Use advanced prompt service with few-shot learning
                    input_data = {
                        "context": json.dumps(trading_context, indent=2),
                        "question": user_message,
                        "chat_history": history_text
                    }
                    
                    execution_result = await self.prompt_service.execute_prompt(
                        prompt_type=PromptType.CHAT,
                        input_data=input_data,
                        llm=self.llm_handler.llm,
                        strategy=PromptStrategy.BEST_PERFORMANCE,
                        user_id=user_id
                    )
                    
                    if execution_result.success:
                        ai_response = execution_result.content
                        logger.info("Advanced chat prompt execution successful", extra={
                            "user_id": user_id,
                            "session_id": session_id,
                            "version_used": execution_result.version_used,
                            "confidence_score": execution_result.confidence_score
                        })
                    else:
                        raise Exception(f"Chat prompt execution failed: {execution_result.error_message}")
                        
                except Exception as prompt_error:
                    logger.error(f"Advanced chat prompt failed, falling back to legacy: {str(prompt_error)}", extra={
                        "user_id": user_id,
                        "session_id": session_id,
                        "error_type": type(prompt_error).__name__
                    })
                    # Fallback to legacy approach
                    ai_response = await self._generate_chat_legacy(trading_context, user_message, history_text)
            else:
                logger.info("Using legacy chat prompt system", extra={
                    "user_id": user_id,
                    "session_id": session_id,
                    "reason": "prompt_service_unavailable"
                })
                ai_response = await self._generate_chat_legacy(trading_context, user_message, history_text)

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
                    model_used=self.llm_handler.model_manager.current_llm_model,
                    confidence_score=0.8,
                    source_type=SourceType.EXTERNAL_AI
                )

                saved_response = await self.chat_service.create_message(ai_msg_data, access_token)
            except Exception as e:
                logger.error(f"Error saving AI response: {str(e)}")
                saved_response = {
                    "content": response_content,
                    "processing_time_ms": processing_time,
                    "model_used": self.llm_handler.model_manager.current_llm_model,
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
            raise Exception(f"Failed to process chat message: {str(e)}")

    async def _generate_chat_legacy(self, trading_context: Dict[str, Any], 
                                  user_message: str, history_text: str) -> str:
        """Generate chat response using legacy prompt system as fallback."""
        try:
            prompt_input = {
                "context": json.dumps(trading_context, indent=2),
                "question": user_message,
                "chat_history": history_text
            }
            
            chain = self.llm_handler.trading_prompts["chat"] | self.llm_handler.llm | StrOutputParser()
            ai_response = self.llm_handler.safe_chain_invoke(chain, prompt_input)
            
            return ai_response
                
        except Exception as llm_error:
            logger.error(f"Legacy chat LLM generation failed: {str(llm_error)}")
            return self.llm_handler.get_fallback_response({"question": user_message})

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

    async def _get_fallback_trading_context(self, access_token: str, query: str) -> Dict[str, Any]:
        """Fallback context retrieval when context manager is unavailable."""
        try:
            logger.info("Using fallback context retrieval for chat")
            
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
                "note": "Using basic context retrieval - full context manager unavailable"
            }
            
        except Exception as e:
            logger.error(f"Error in fallback context retrieval: {str(e)}")
            return {
                "mode": "minimal",
                "message": "All context retrieval methods failed", 
                "error": str(e)
            }

    async def get_chat_sessions(self, user: Dict[str, Any], 
                              limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Retrieve chat sessions for a user.
        
        Args:
            user: User object with authentication information
            limit: Maximum number of sessions to return
            offset: Offset for pagination
            
        Returns:
            List of session dictionaries
        """
        user_id = self.auth_validator.extract_user_id(user)
        
        try:
            logger.info(f"Retrieving chat sessions for user {user_id}", extra={
                "user_id": user_id,
                "limit": limit,
                "offset": offset
            })

            # Validate authentication
            if not self.auth_validator.validate_user_object(user):
                raise Exception("Invalid or expired authentication")

            access_token = self.auth_validator.extract_access_token(user)
            sessions = await self.chat_service.get_sessions(access_token, limit, offset)
            
            logger.info(f"Retrieved {len(sessions)} chat sessions for user {user_id}")
            return sessions

        except Exception as e:
            logger.error(f"Error retrieving chat sessions: {str(e)}", extra={
                "user_id": user_id,
                "error_type": type(e).__name__
            })
            raise Exception(f"Failed to retrieve chat sessions: {str(e)}")

    async def get_session_messages(self, user: Dict[str, Any], session_id: str,
                                 limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Retrieve messages for a specific chat session.
        
        Args:
            user: User object with authentication information
            session_id: Chat session identifier
            limit: Maximum number of messages to return
            offset: Offset for pagination
            
        Returns:
            List of message dictionaries
        """
        user_id = self.auth_validator.extract_user_id(user)
        
        try:
            logger.info(f"Retrieving messages for session {session_id}", extra={
                "user_id": user_id,
                "session_id": session_id,
                "limit": limit,
                "offset": offset
            })

            # Validate authentication
            if not self.auth_validator.validate_user_object(user):
                raise Exception("Invalid or expired authentication")

            access_token = self.auth_validator.extract_access_token(user)
            messages = await self.chat_service.get_session_messages(
                session_id, access_token, limit, offset
            )
            
            logger.info(f"Retrieved {len(messages)} messages for session {session_id}")
            return messages

        except Exception as e:
            logger.error(f"Error retrieving session messages: {str(e)}", extra={
                "user_id": user_id,
                "session_id": session_id,
                "error_type": type(e).__name__
            })
            raise Exception(f"Failed to retrieve session messages: {str(e)}")

    async def search_messages(self, user: Dict[str, Any], query: str,
                            session_id: Optional[str] = None,
                            limit: int = 10, min_similarity: float = 0.7) -> List[Dict[str, Any]]:
        """
        Search messages using vector similarity.
        
        Args:
            user: User object with authentication information
            query: Search query
            session_id: Optional session filter
            limit: Maximum number of results
            min_similarity: Minimum similarity threshold
            
        Returns:
            List of matching message dictionaries
        """
        user_id = self.auth_validator.extract_user_id(user)
        
        try:
            logger.info(f"Searching messages for user {user_id}", extra={
                "user_id": user_id,
                "query": query[:100],
                "session_id": session_id,
                "limit": limit,
                "min_similarity": min_similarity
            })

            # Validate authentication
            if not self.auth_validator.validate_user_object(user):
                raise Exception("Invalid or expired authentication")

            access_token = self.auth_validator.extract_access_token(user)
            messages = await self.chat_service.search_messages(
                access_token, query, session_id, limit, min_similarity
            )
            
            logger.info(f"Found {len(messages)} matching messages for user {user_id}")
            return messages

        except Exception as e:
            logger.error(f"Error searching messages: {str(e)}", extra={
                "user_id": user_id,
                "error_type": type(e).__name__
            })
            raise Exception(f"Failed to search messages: {str(e)}")

    def get_processor_status(self) -> Dict[str, Any]:
        """Get current status of the chat processor."""
        return {
            "llm_available": self.llm_handler.is_available(),
            "prompt_service_enabled": self.prompt_enabled,
            "chat_service_available": bool(self.chat_service),
            "embedding_service_available": bool(self.embedding_service),
            "context_manager_available": bool(self.context_manager),
            "current_model": self.llm_handler.model_manager.current_llm_model,
            "ready_for_processing": self.llm_handler.is_available() and bool(self.chat_service)
        }