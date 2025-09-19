"""
AI Chat Service
Handles AI chat operations using Data Access Layer
Decoupled from direct database operations
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
from models.ai_chat import (
    AIChatMessageCreate, AIChatMessageUpdate, AIChatMessageResponse,
    AIChatSessionResponse, AIChatUpsertResponse, ChatDeleteResponse,
    MessageType, SourceType
)
from .dal.ai_chat_dal import AIChatDAL
import logging
import uuid

class AIChatService:
    """
    Service for handling AI chat operations.
    Manages chat sessions, messages, and AI interactions.
    Focus on business logic, data access through DAL.
    """

    def __init__(self, dal: Optional[AIChatDAL] = None):
        self.dal = dal or AIChatDAL()
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
    async def create_message(self, message_data: AIChatMessageCreate, access_token: str) -> AIChatUpsertResponse:
        """
        Create a new chat message.
        
        Args:
            message_data: Chat message data
            access_token: User authentication token
            
        Returns:
            AIChatUpsertResponse: Created message response
        """
        try:
            self.logger.info("Creating new chat message", extra={
                "session_id": message_data.session_id,
                "message_type": message_data.message_type.value,
                "content_length": len(message_data.content) if message_data.content else 0
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Validate message data
            self._validate_message_data(message_data)
            
            # Create message through DAL
            result_data = await self.dal.create_message(message_data, user_id, access_token)
            
            if not result_data:
                raise Exception("Failed to create message - no data returned")
            
            # Convert to response model
            response = self._convert_to_upsert_response(result_data)
            
            self.logger.info("Chat message created successfully", extra={
                "message_id": response.id,
                "session_id": response.session_id,
                "user_id": user_id
            })
            
            return response
            
        except Exception as e:
            self.logger.error(f"Error creating chat message: {str(e)}")
            raise Exception(f"Error creating chat message: {str(e)}")

    async def update_message(self, message_id: str, message_data: AIChatMessageUpdate, access_token: str) -> AIChatUpsertResponse:
        """
        Update an existing chat message.
        
        Args:
            message_id: Message ID to update
            message_data: Update data
            access_token: User authentication token
            
        Returns:
            AIChatUpsertResponse: Updated message response
        """
        try:
            self.logger.info("Updating chat message", extra={
                "message_id": message_id,
                "has_content": bool(message_data.content),
                "has_feedback": message_data.feedback_score is not None
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Update message through DAL
            result_data = await self.dal.update_message(message_id, message_data, user_id, access_token)
            
            if not result_data:
                raise Exception("Failed to update message - message not found or no access")
            
            # Convert to response model
            response = self._convert_to_upsert_response(result_data)
            
            self.logger.info("Chat message updated successfully", extra={
                "message_id": message_id,
                "user_id": user_id
            })
            
            return response
            
        except Exception as e:
            self.logger.error(f"Error updating chat message {message_id}: {str(e)}")
            raise Exception(f"Error updating chat message: {str(e)}")

    async def get_session_messages(self, session_id: str, access_token: str, limit: Optional[int] = None) -> List[AIChatMessageResponse]:
        """
        Get messages for a chat session (alias for get_chat_history for backward compatibility).
        
        Args:
            session_id: Chat session ID
            access_token: User authentication token
            limit: Optional limit on number of messages
            
        Returns:
            List[AIChatMessageResponse]: Chat messages
        """
        return await self.get_chat_history(session_id, access_token, limit)

    async def get_chat_history(self, session_id: str, access_token: str, limit: Optional[int] = None) -> List[AIChatMessageResponse]:
        """
        Get chat history for a session.
        
        Args:
            session_id: Chat session ID
            access_token: User authentication token
            limit: Optional limit on number of messages
            
        Returns:
            List[AIChatMessageResponse]: Chat messages
        """
        try:
            self.logger.info("Retrieving chat history", extra={
                "session_id": session_id,
                "limit": limit
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Get chat history through DAL
            history_data = await self.dal.get_chat_history(session_id, user_id, access_token, limit)
            
            # Convert to response models
            messages = [self._convert_to_message_response(data) for data in history_data]
            
            self.logger.info("Chat history retrieved successfully", extra={
                "session_id": session_id,
                "message_count": len(messages),
                "user_id": user_id
            })
            
            return messages
            
        except Exception as e:
            self.logger.error(f"Error retrieving chat history for session {session_id}: {str(e)}")
            raise Exception(f"Error retrieving chat history: {str(e)}")

    async def get_session_list(self, access_token: str, limit: Optional[int] = None) -> List[AIChatSessionResponse]:
        """
        Get list of chat sessions for a user.
        
        Args:
            access_token: User authentication token
            limit: Optional limit on number of sessions
            
        Returns:
            List[AIChatSessionResponse]: Chat sessions
        """
        try:
            self.logger.info("Retrieving chat sessions", extra={
                "limit": limit
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Get sessions through DAL
            sessions_data = await self.dal.get_session_list(user_id, access_token, limit)
            
            # Convert to response models
            sessions = [self._convert_to_session_response(data) for data in sessions_data]
            
            self.logger.info("Chat sessions retrieved successfully", extra={
                "session_count": len(sessions),
                "user_id": user_id
            })
            
            return sessions
            
        except Exception as e:
            self.logger.error(f"Error retrieving chat sessions: {str(e)}")
            raise Exception(f"Error retrieving chat sessions: {str(e)}")

    async def get_sessions(self, access_token: str, limit: Optional[int] = None, offset: Optional[int] = None) -> List[AIChatSessionResponse]:
        """
        Get chat sessions for the user (alias for get_session_list for router compatibility).
        
        Args:
            access_token: User authentication token
            limit: Optional limit on number of sessions
            offset: Optional offset for pagination (currently not used but kept for compatibility)
            
        Returns:
            List[AIChatSessionResponse]: Chat sessions
        """
        return await self.get_session_list(access_token, limit)

    async def get_messages(self, access_token: str, session_id: Optional[str] = None, 
                          message_id: Optional[str] = None, message_type: Optional[str] = None, 
                          role: Optional[str] = None, search_query: Optional[str] = None,
                          limit: int = 50, offset: int = 0, order_by: str = "created_at", 
                          order_direction: str = "ASC") -> List[AIChatMessageResponse]:
        """
        Get chat messages with filtering and pagination.
        
        Args:
            access_token: User authentication token
            session_id: Optional session ID filter
            message_id: Optional specific message ID
            message_type: Optional message type filter
            role: Optional role filter (maps to message_type)
            search_query: Optional text search query
            limit: Maximum number of messages to return
            offset: Number of messages to skip
            order_by: Field to order by
            order_direction: ASC or DESC
            
        Returns:
            List[AIChatMessageResponse]: Chat messages
        """
        try:
            self.logger.info("Retrieving chat messages", extra={
                "session_id": session_id,
                "message_type": message_type,
                "role": role,
                "search_query": search_query,
                "limit": limit,
                "offset": offset
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Get messages through DAL
            messages_data = await self.dal.get_messages(
                user_id, access_token, session_id, message_id, message_type, 
                role, search_query, limit, offset, order_by, order_direction
            )
            
            # Convert to response models
            messages = [self._convert_to_message_response(data) for data in messages_data]
            
            self.logger.info("Chat messages retrieved successfully", extra={
                "message_count": len(messages),
                "user_id": user_id
            })
            
            return messages
            
        except Exception as e:
            self.logger.error(f"Error retrieving chat messages: {str(e)}")
            raise Exception(f"Error retrieving chat messages: {str(e)}")

    async def search_messages(self, access_token: str, query: str, session_id: Optional[str] = None, 
                             limit: int = 20, similarity_threshold: float = 0.7) -> List[AIChatMessageResponse]:
        """
        Search chat messages using vector similarity.
        
        Args:
            access_token: User authentication token
            query: Search query
            session_id: Optional session ID filter
            limit: Maximum number of messages to return
            similarity_threshold: Minimum similarity score
            
        Returns:
            List[AIChatMessageResponse]: Matching chat messages with similarity scores
        """
        try:
            self.logger.info("Searching chat messages", extra={
                "query": query,
                "session_id": session_id,
                "limit": limit,
                "similarity_threshold": similarity_threshold
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Search messages through DAL
            messages_data = await self.dal.search_messages(
                user_id, access_token, query, session_id, limit, similarity_threshold
            )
            
            # Convert to response models
            messages = [self._convert_to_message_response(data) for data in messages_data]
            
            self.logger.info("Chat messages search completed", extra={
                "query": query,
                "message_count": len(messages),
                "user_id": user_id
            })
            
            return messages
            
        except Exception as e:
            self.logger.error(f"Error searching chat messages: {str(e)}")
            raise Exception(f"Error searching chat messages: {str(e)}")

    async def delete_session(self, session_id: str, access_token: str) -> ChatDeleteResponse:
        """
        Delete a chat session and all its messages.
        
        Args:
            session_id: Session ID to delete
            access_token: User authentication token
            
        Returns:
            ChatDeleteResponse: Deletion result
        """
        try:
            self.logger.info("Deleting chat session", extra={
                "session_id": session_id
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Delete session through DAL
            success = await self.dal.delete_session(session_id, user_id, access_token)
            
            if success:
                self.logger.info("Chat session deleted successfully", extra={
                    "session_id": session_id,
                    "user_id": user_id
                })
                return ChatDeleteResponse(
                    success=True,
                    message="Chat session deleted successfully"
                )
            else:
                raise Exception("Failed to delete session")
                
        except Exception as e:
            self.logger.error(f"Error deleting chat session {session_id}: {str(e)}")
            return ChatDeleteResponse(
                success=False,
                message=f"Error deleting chat session: {str(e)}"
            )

    async def delete_message(self, message_id: str, access_token: str) -> ChatDeleteResponse:
        """
        Delete a specific chat message.
        
        Args:
            message_id: Message ID to delete
            access_token: User authentication token
            
        Returns:
            ChatDeleteResponse: Deletion result
        """
        try:
            self.logger.info("Deleting chat message", extra={
                "message_id": message_id
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Delete message through DAL
            success = await self.dal.delete_message(message_id, user_id, access_token)
            
            if success:
                self.logger.info("Chat message deleted successfully", extra={
                    "message_id": message_id,
                    "user_id": user_id
                })
                return ChatDeleteResponse(
                    success=True,
                    message="Chat message deleted successfully"
                )
            else:
                raise Exception("Failed to delete message")
                
        except Exception as e:
            self.logger.error(f"Error deleting chat message {message_id}: {str(e)}")
            return ChatDeleteResponse(
                success=False,
                message=f"Error deleting chat message: {str(e)}"
            )

    def _validate_message_data(self, message_data: AIChatMessageCreate):
        """Validate message data before processing."""
        if not message_data.content or not message_data.content.strip():
            raise ValueError("Message content cannot be empty")
        
        if not message_data.session_id:
            raise ValueError("Session ID is required")
        
        if not message_data.message_type:
            raise ValueError("Message type is required")

    def _convert_to_upsert_response(self, data: Dict[str, Any]) -> AIChatUpsertResponse:
        """Convert database result to AIChatUpsertResponse."""
        return AIChatUpsertResponse(
            id=data.get('id'),
            user_id=data.get('user_id'),
            session_id=data.get('session_id'),
            message_type=MessageType(data.get('message_type', 'user')),
            content=data.get('content', ''),
            context_data=data.get('context_data', {}),
            model_used=data.get('model_used'),
            processing_time_ms=data.get('processing_time_ms'),
            confidence_score=data.get('confidence_score'),
            similarity_score=data.get('similarity_score'),
            source_type=SourceType(data.get('source_type', 'user')),
            usage_count=data.get('usage_count', 1),
            last_used_at=datetime.fromisoformat(data['last_used_at']) if data.get('last_used_at') else None,
            created_at=datetime.fromisoformat(data['created_at']) if data.get('created_at') else datetime.utcnow(),
            operation_type=data.get('operation_type', 'create')
        )

    def _convert_to_message_response(self, data: Dict[str, Any]) -> AIChatMessageResponse:
        """Convert database result to AIChatMessageResponse."""
        return AIChatMessageResponse(
            id=data.get('id'),
            user_id=data.get('user_id'),
            session_id=data.get('session_id'),
            message_type=MessageType(data.get('message_type', 'user')),
            content=data.get('content', ''),
            context_data=data.get('context_data', {}),
            model_used=data.get('model_used'),
            processing_time_ms=data.get('processing_time_ms'),
            confidence_score=data.get('confidence_score'),
            similarity_score=data.get('similarity_score'),
            source_type=SourceType(data.get('source_type', 'user')),
            usage_count=data.get('usage_count', 1),
            last_used_at=datetime.fromisoformat(data['last_used_at']) if data.get('last_used_at') else None,
            created_at=datetime.fromisoformat(data['created_at']) if data.get('created_at') else datetime.utcnow(),
            updated_at=datetime.fromisoformat(data['updated_at']) if data.get('updated_at') else None
        )

    def _convert_to_session_response(self, data: Dict[str, Any]) -> AIChatSessionResponse:
        """Convert database result to AIChatSessionResponse."""
        return AIChatSessionResponse(
            session_id=data.get('session_id'),
            message_count=data.get('message_count', 0),
            first_message=data.get('first_message', ''),
            last_message=data.get('last_message', ''),
            first_message_at=datetime.fromisoformat(data['first_message_at']) if data.get('first_message_at') else datetime.utcnow(),
            last_message_at=datetime.fromisoformat(data['last_message_at']) if data.get('last_message_at') else datetime.utcnow(),
            total_usage_count=data.get('total_usage_count', 0)
        )
