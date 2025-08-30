from typing import Dict, Any, Optional, List
from supabase import Client
from database import get_supabase
from datetime import datetime
from auth_service import AuthService
from models.ai_chat import (
    AIChatMessageCreate, AIChatMessageUpdate, AIChatMessageResponse,
    AIChatSessionResponse, AIChatUpsertResponse, ChatDeleteResponse,
    MessageType
)
import json
import uuid

class AIChatService:
    """
    Service for handling AI chat operations.
    Manages chat sessions, messages, and AI interactions.
    """
    
    def __init__(self, supabase: Optional[Client] = None):
        self.supabase = supabase or get_supabase()
        self.auth_service = AuthService(self.supabase)

    async def _call_sql_function(self, function_name: str, params: Dict[str, Any], access_token: str) -> Any:
        """Helper method to call SQL functions with authentication."""
        try:
            return await self.auth_service.safe_rpc_call(function_name, params, access_token)
        except Exception as e:
            raise Exception(f"Database operation failed: {str(e)}")

    async def create_message(self, message_data: AIChatMessageCreate, access_token: str) -> AIChatUpsertResponse:
        """Create a new chat message."""
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            user_id = user_response.user.id

            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_session_id': message_data.session_id,
                'p_message_type': message_data.message_type.value,
                'p_content': message_data.content,
                'p_context_data': json.dumps(message_data.context_data) if message_data.context_data else None,
                'p_model_used': message_data.model_used,
                'p_confidence_score': message_data.confidence_score,
                'p_similarity_score': message_data.similarity_score,
                'p_source_type': message_data.source_type.value
            }

            # Call the upsert function
            result = await self._call_sql_function('upsert_ai_chat_message', params, access_token)
            
            if result.data and len(result.data) > 0:
                data = result.data[0]
                return AIChatUpsertResponse(
                    id=data['id'],
                    user_id=data['user_id'],
                    session_id=data['session_id'],
                    message_type=MessageType(data['message_type']),
                    content=data['content'],
                    metadata=json.loads(data['metadata']) if data['metadata'] else None,
                    model_used=data['model_used'],
                    processing_time_ms=data['processing_time_ms'],
                    confidence_score=data['confidence_score'],
                    parent_message_id=data['parent_message_id'],
                    created_at=datetime.fromisoformat(data['created_at']),
                    updated_at=datetime.fromisoformat(data['updated_at']),
                    operation_type=data['operation_type']
                )
            else:
                raise Exception("Failed to create message")

        except Exception as e:
            raise Exception(f"Error creating chat message: {str(e)}")

    async def update_message(self, message_id: str, message_data: AIChatMessageUpdate, access_token: str) -> AIChatUpsertResponse:
        """Update an existing chat message."""
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            user_id = user_response.user.id

            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_message_id': message_id,
                'p_session_id': message_data.session_id,
                'p_message_type': message_data.message_type.value if message_data.message_type else None,
                'p_role': message_data.role.value if message_data.role else None,
                'p_content': message_data.content,
                'p_metadata': json.dumps(message_data.metadata) if message_data.metadata else None,
                'p_model_used': message_data.model_used,
                'p_processing_time_ms': message_data.processing_time_ms,
                'p_confidence_score': message_data.confidence_score,
                'p_parent_message_id': message_data.parent_message_id
            }

            # Call the upsert function with message_id
            result = await self._call_sql_function('upsert_ai_chat_message', params, access_token)
            
            if result.data and len(result.data) > 0:
                data = result.data[0]
                return AIChatUpsertResponse(
                    id=data['id'],
                    user_id=data['user_id'],
                    session_id=data['session_id'],
                    message_type=MessageType(data['message_type']),
                    content=data['content'],
                    metadata=json.loads(data['metadata']) if data['metadata'] else None,
                    model_used=data['model_used'],
                    processing_time_ms=data['processing_time_ms'],
                    confidence_score=data['confidence_score'],
                    parent_message_id=data['parent_message_id'],
                    created_at=datetime.fromisoformat(data['created_at']),
                    updated_at=datetime.fromisoformat(data['updated_at']),
                    operation_type=data['operation_type']
                )
            else:
                raise Exception("Failed to update message")

        except Exception as e:
            raise Exception(f"Error updating chat message: {str(e)}")

    async def get_messages(
        self,
        access_token: str,
        session_id: Optional[str] = None,
        message_id: Optional[str] = None,
        message_type: Optional[str] = None,
        role: Optional[str] = None,
        search_query: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        order_by: str = "created_at",
        order_direction: str = "ASC"
    ) -> List[AIChatMessageResponse]:
        """Get chat messages with filtering and pagination."""
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            user_id = user_response.user.id

            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_session_id': session_id,
                'p_message_id': message_id,
                'p_message_type': message_type,
                'p_role': role,
                'p_search_query': search_query,
                'p_limit': limit,
                'p_offset': offset,
                'p_order_by': order_by,
                'p_order_direction': order_direction
            }

            # Call the get function
            result = await self._call_sql_function('get_ai_chat_messages', params, access_token)
            
            messages = []
            if result.data:
                for data in result.data:
                    messages.append(AIChatMessageResponse(
                        id=data['id'],
                        user_id=data['user_id'],
                        session_id=data['session_id'],
                        message_type=MessageType(data['message_type']),
                            content=data['content'],
                        content_preview=data.get('content_preview'),
                        metadata=json.loads(data['metadata']) if data['metadata'] else None,
                        model_used=data['model_used'],
                        processing_time_ms=data['processing_time_ms'],
                        confidence_score=data['confidence_score'],
                        parent_message_id=data['parent_message_id'],
                        created_at=datetime.fromisoformat(data['created_at']),
                        updated_at=datetime.fromisoformat(data['updated_at']),
                        usage_count=data.get('usage_count', 0)
                    ))
            
            return messages

        except Exception as e:
            raise Exception(f"Error retrieving chat messages: {str(e)}")

    async def get_session_messages(self, session_id: str, access_token: str, limit: int = 100) -> List[AIChatMessageResponse]:
        """Get all messages for a specific session."""
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            user_id = user_response.user.id

            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_session_id': session_id,
                'p_limit': limit
            }

            # Call the get session function
            result = await self._call_sql_function('get_ai_chat_session_messages', params, access_token)
            
            messages = []
            if result.data:
                for data in result.data:
                    messages.append(AIChatMessageResponse(
                        id=data['id'],
                        user_id=data['user_id'],
                        session_id=data['session_id'],
                        message_type=MessageType(data['message_type']),
                            content=data['content'],
                        content_preview=data.get('content_preview'),
                        metadata=json.loads(data['metadata']) if data['metadata'] else None,
                        model_used=data['model_used'],
                        processing_time_ms=data['processing_time_ms'],
                        confidence_score=data['confidence_score'],
                        parent_message_id=data['parent_message_id'],
                        created_at=datetime.fromisoformat(data['created_at']),
                        updated_at=datetime.fromisoformat(data['updated_at']),
                        usage_count=data.get('usage_count', 0)
                    ))
            
            return messages

        except Exception as e:
            raise Exception(f"Error retrieving session messages: {str(e)}")

    async def get_sessions(self, access_token: str, limit: int = 50, offset: int = 0) -> List[AIChatSessionResponse]:
        """Get chat sessions for the user."""
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            user_id = user_response.user.id

            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_limit': limit,
                'p_offset': offset
            }

            # Call the get sessions function
            result = await self._call_sql_function('get_ai_chat_sessions', params, access_token)
            
            sessions = []
            if result.data:
                for data in result.data:
                    sessions.append(AIChatSessionResponse(
                        session_id=data['session_id'],
                        message_count=data['message_count'],
                        first_message_preview=data.get('first_message_preview'),
                        last_message_at=datetime.fromisoformat(data['last_message_at']) if data['last_message_at'] else None,
                        created_at=datetime.fromisoformat(data['created_at'])
                    ))
            
            return sessions

        except Exception as e:
            raise Exception(f"Error retrieving chat sessions: {str(e)}")

    async def delete_message(self, message_id: str, access_token: str) -> ChatDeleteResponse:
        """Delete a chat message."""
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            user_id = user_response.user.id

            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_message_id': message_id
            }

            # Call the delete function
            result = await self._call_sql_function('delete_ai_chat_message', params, access_token)
            
            if result.data and len(result.data) > 0:
                data = result.data[0]
                return ChatDeleteResponse(
                    id=data['id'],
                    session_id=data['session_id'],
                    message_type=MessageType(data['message_type']),
                    content_preview=data['content_preview'],
                    deleted_at=datetime.fromisoformat(data['deleted_at']),
                    operation_type=data['operation_type']
                )
            else:
                raise Exception("Failed to delete message")

        except Exception as e:
            raise Exception(f"Error deleting chat message: {str(e)}")

    async def delete_session(self, session_id: str, access_token: str) -> Dict[str, Any]:
        """Delete an entire chat session."""
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            user_id = user_response.user.id

            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_session_id': session_id
            }

            # Call the delete session function
            result = await self._call_sql_function('delete_ai_chat_session', params, access_token)
            
            if result.data and len(result.data) > 0:
                data = result.data[0]
                return {
                    "session_id": data['session_id'],
                    "messages_deleted": data['messages_deleted'],
                    "deleted_at": datetime.fromisoformat(data['deleted_at'])
                }
            else:
                raise Exception("Failed to delete session")

        except Exception as e:
            raise Exception(f"Error deleting chat session: {str(e)}")

    async def search_messages(
        self,
        access_token: str,
        query: str,
        session_id: Optional[str] = None,
        limit: int = 20,
        similarity_threshold: float = 0.7
    ) -> List[AIChatMessageResponse]:
        """Search chat messages using vector similarity."""
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            user_id = user_response.user.id

            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_query': query,
                'p_session_id': session_id,
                'p_limit': limit,
                'p_similarity_threshold': similarity_threshold
            }

            # Call the search function
            result = await self._call_sql_function('search_ai_chat_messages', params, access_token)
            
            messages = []
            if result.data:
                for data in result.data:
                    messages.append(AIChatMessageResponse(
                        id=data['id'],
                        user_id=data['user_id'],
                        session_id=data['session_id'],
                        message_type=MessageType(data['message_type']),
                            content=data['content'],
                        content_preview=data.get('content_preview'),
                        metadata=json.loads(data['metadata']) if data['metadata'] else None,
                        model_used=data['model_used'],
                        processing_time_ms=data['processing_time_ms'],
                        confidence_score=data['confidence_score'],
                        parent_message_id=data['parent_message_id'],
                        created_at=datetime.fromisoformat(data['created_at']),
                        updated_at=datetime.fromisoformat(data['updated_at']),
                        usage_count=data.get('usage_count', 0),
                        similarity_score=data.get('similarity_score')
                    ))
            
            return messages

        except Exception as e:
            raise Exception(f"Error searching chat messages: {str(e)}")
