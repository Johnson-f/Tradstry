"""
Data Access Layer for AI Chat operations
Handles all database interactions for chat sessions and messages
"""

from typing import Dict, Any, Optional, List
from .base_dal import BaseDAL
from models.ai_chat import AIChatMessageCreate, AIChatMessageUpdate
import uuid

class AIChatDAL(BaseDAL):
    """
    Data Access Layer for AI Chat operations
    """
    
    async def create_message(self, message_data: AIChatMessageCreate, user_id: str, access_token: str) -> Dict[str, Any]:
        """
        Create a new chat message in the database.
        
        Args:
            message_data: Chat message data
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            Dict[str, Any]: Created message data
        """
        params = {
            'p_user_id': user_id,
            'p_session_id': message_data.session_id,
            'p_message_type': message_data.message_type.value,
            'p_content': message_data.content,
            'p_question_embedding': None,  # Can be added later
            'p_answer_embedding': None,    # Can be added later
            'p_context_data': message_data.context_data or {},
            'p_model_used': getattr(message_data, 'model_used', None),
            'p_processing_time_ms': getattr(message_data, 'response_time_ms', None),
            'p_confidence_score': getattr(message_data, 'feedback_score', None),
            'p_similarity_score': None,  # Can be added later for vector similarity
            'p_source_type': message_data.source_type.value if hasattr(message_data, 'source_type') and message_data.source_type else 'external_ai',
            'p_usage_count': 1,  # Default for new messages
            'p_message_id': None  # None for new messages, UUID for updates
        }
        
        response = await self.call_sql_function('upsert_ai_chat_history', params, access_token)
        return self.extract_single_response(response)
    
    async def update_message(self, message_id: str, update_data: AIChatMessageUpdate, user_id: str, access_token: str) -> Dict[str, Any]:
        """
        Update an existing chat message.
        
        Args:
            message_id: Message ID to update
            update_data: Update data
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            Dict[str, Any]: Updated message data
        """
        params = {
            'p_user_id': user_id,
            'p_session_id': getattr(update_data, 'session_id', None),  # Required for update
            'p_message_type': getattr(update_data, 'message_type').value if hasattr(update_data, 'message_type') and update_data.message_type else 'user_question',
            'p_content': getattr(update_data, 'content', None),
            'p_question_embedding': None,  # Can be updated later
            'p_answer_embedding': None,    # Can be updated later
            'p_context_data': getattr(update_data, 'context_data', None),
            'p_model_used': getattr(update_data, 'model_used', None),
            'p_processing_time_ms': getattr(update_data, 'response_time_ms', None),
            'p_confidence_score': getattr(update_data, 'feedback_score', None),
            'p_similarity_score': None,  # Can be updated later
            'p_source_type': 'external_ai',  # Default for updates
            'p_usage_count': None,  # Keep existing value
            'p_message_id': message_id  # This indicates an update operation
        }
        
        response = await self.call_sql_function('upsert_ai_chat_history', params, access_token)
        return self.extract_single_response(response)
    
    async def get_chat_history(self, session_id: str, user_id: str, access_token: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get chat history for a session.
        
        Args:
            session_id: Chat session ID
            user_id: User ID
            access_token: User authentication token
            limit: Optional limit on number of messages
            
        Returns:
            List[Dict[str, Any]]: Chat messages
        """
        params = {
            'p_user_id': user_id,
            'p_session_id': session_id,
            'p_limit': limit or 100
        }
        
        response = await self.call_sql_function('get_ai_chat_session_messages', params, access_token)
        return self.extract_response_data(response)
    
    async def get_session_list(self, user_id: str, access_token: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get list of chat sessions for a user.
        
        Args:
            user_id: User ID
            access_token: User authentication token
            limit: Optional limit on number of sessions
            
        Returns:
            List[Dict[str, Any]]: Chat sessions
        """
        params = {
            'p_user_id': user_id,
            'p_limit': limit or 20,
            'p_offset': 0
        }
        
        response = await self.call_sql_function('get_ai_chat_sessions', params, access_token)
        return self.extract_response_data(response)
    
    async def delete_session(self, session_id: str, user_id: str, access_token: str) -> bool:
        """
        Delete a chat session and all its messages.
        
        Args:
            session_id: Session ID to delete
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            bool: True if deletion was successful
        """
        params = {
            'p_user_id': user_id,
            'p_session_id': session_id
        }
        
        try:
            response = await self.call_sql_function('delete_chat_session', params, access_token)
            return True
        except Exception as e:
            self.logger.error(f"Failed to delete chat session {session_id}: {str(e)}")
            return False
    
    async def delete_message(self, message_id: str, user_id: str, access_token: str) -> bool:
        """
        Delete a specific chat message.
        
        Args:
            message_id: Message ID to delete
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            bool: True if deletion was successful
        """
        params = {
            'p_user_id': user_id,
            'p_message_id': message_id
        }
        
        try:
            response = await self.call_sql_function('delete_ai_chat_message', params, access_token)
            return True
        except Exception as e:
            self.logger.error(f"Failed to delete chat message {message_id}: {str(e)}")
            return False
