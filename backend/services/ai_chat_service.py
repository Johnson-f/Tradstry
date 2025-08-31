from typing import Dict, Any, Optional, List
from supabase import Client
from database import get_supabase
from datetime import datetime
from auth_service import AuthService
from models.ai_chat import (
    AIChatMessageCreate, AIChatMessageUpdate, AIChatMessageResponse,
    AIChatSessionResponse, AIChatUpsertResponse, ChatDeleteResponse,
    MessageType, SourceType  # Added SourceType import
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

            # Prepare parameters for SQL function - matching upsert_ai_chat_history
            params = {
                'p_user_id': user_id,
                'p_session_id': message_data.session_id,
                'p_message_type': message_data.message_type.value,
                'p_content': message_data.content,
                'p_question_embedding': None,  # Add embeddings if available
                'p_answer_embedding': None,    # Add embeddings if available
                'p_context_data': message_data.context_data,  # JSONB data
                'p_model_used': message_data.model_used,
                'p_processing_time_ms': None,  # Add if available in message_data
                'p_confidence_score': message_data.confidence_score,
                'p_similarity_score': message_data.similarity_score,
                'p_source_type': message_data.source_type.value,
                'p_usage_count': 1,
                'p_message_id': None  # None for new message
            }

            # Call the correct function name
            result = await self._call_sql_function('upsert_ai_chat_history', params, access_token)

            if result.data and len(result.data) > 0:
                data = result.data[0]
                return AIChatUpsertResponse(
                    id=data['id'],
                    user_id=data['user_id'],
                    session_id=data['session_id'],
                    message_type=MessageType(data['message_type']),
                    content=data['content'],
                    context_data=data['context_data'],  # Fixed: correct field name
                    model_used=data['model_used'],
                    processing_time_ms=data['processing_time_ms'],
                    confidence_score=data['confidence_score'],
                    similarity_score=data['similarity_score'],  # Fixed: added required field
                    source_type=SourceType(data['source_type']),  # Fixed: added required field
                    usage_count=data['usage_count'],  # Fixed: added required field
                    last_used_at=datetime.fromisoformat(data['last_used_at']),  # Fixed: correct field name
                    created_at=datetime.fromisoformat(data['created_at']),
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

            # Prepare parameters for SQL function - matching upsert_ai_chat_history
            params = {
                'p_user_id': user_id,
                'p_session_id': None,  # Will be updated from existing record
                'p_message_type': message_data.message_type.value if message_data.message_type else None,
                'p_content': message_data.content,
                'p_question_embedding': None,
                'p_answer_embedding': None,
                'p_context_data': message_data.context_data,  # Fixed: correct field name
                'p_model_used': message_data.model_used,
                'p_processing_time_ms': None,  # Add if available
                'p_confidence_score': message_data.confidence_score,
                'p_similarity_score': message_data.similarity_score,  # Fixed: use correct field
                'p_source_type': message_data.source_type.value if message_data.source_type else 'external_ai',
                'p_usage_count': None,
                'p_message_id': message_id  # Provided for update
            }

            # Call the upsert function with message_id
            result = await self._call_sql_function('upsert_ai_chat_history', params, access_token)

            if result.data and len(result.data) > 0:
                data = result.data[0]
                return AIChatUpsertResponse(
                    id=data['id'],
                    user_id=data['user_id'],
                    session_id=data['session_id'],
                    message_type=MessageType(data['message_type']),
                    content=data['content'],
                    context_data=data['context_data'],  # Fixed: correct field name
                    model_used=data['model_used'],
                    processing_time_ms=data['processing_time_ms'],
                    confidence_score=data['confidence_score'],
                    similarity_score=data['similarity_score'],  # Fixed: added required field
                    source_type=SourceType(data['source_type']),  # Fixed: added required field
                    usage_count=data['usage_count'],  # Fixed: added required field
                    last_used_at=datetime.fromisoformat(data['last_used_at']),  # Fixed: correct field name
                    created_at=datetime.fromisoformat(data['created_at']),
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

            # Build query manually since we don't have a get_ai_chat_messages function
            query = self.supabase.table('ai_chat_history').select('*').eq('user_id', user_id)

            if session_id:
                query = query.eq('session_id', session_id)
            if message_id:
                query = query.eq('id', message_id)
            if message_type:
                query = query.eq('message_type', message_type)

            query = query.order(order_by, desc=(order_direction.upper() == 'DESC'))
            query = query.limit(limit).offset(offset)

            result = query.execute()

            messages = []
            if result.data:
                for data in result.data:
                    # Handle missing fields with defaults
                    last_used_at = data.get('last_used_at') or data['created_at']
                    similarity_score = data.get('similarity_score', 0.0)
                    source_type = data.get('source_type', 'external_ai')
                    usage_count = data.get('usage_count', 1)

                    messages.append(AIChatMessageResponse(
                        id=data['id'],
                        user_id=data['user_id'],
                        session_id=data['session_id'],
                        message_type=MessageType(data['message_type']),
                        content=data['content'],
                        content_preview=data['content'][:100] + '...' if len(data['content']) > 100 else data['content'],
                        context_data=data.get('context_data'),  # Fixed: correct field name
                        model_used=data.get('model_used'),
                        processing_time_ms=data.get('processing_time_ms'),
                        confidence_score=data.get('confidence_score'),
                        similarity_score=similarity_score,  # Fixed: added required field
                        source_type=SourceType(source_type),  # Fixed: added required field
                        usage_count=usage_count,  # Fixed: added required field
                        last_used_at=datetime.fromisoformat(last_used_at),  # Fixed: correct field name
                        created_at=datetime.fromisoformat(data['created_at'])
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

            # Call the existing SQL function
            params = {
                'p_user_id': user_id,
                'p_session_id': session_id,
                'p_limit': limit
            }

            result = await self._call_sql_function('get_ai_chat_session_messages', params, access_token)

            messages = []
            if result.data:
                for data in result.data:
                    # Handle missing fields with defaults
                    last_used_at = data.get('last_used_at') or data['created_at']
                    similarity_score = data.get('similarity_score', 0.0)
                    source_type = data.get('source_type', 'external_ai')
                    usage_count = data.get('usage_count', 1)

                    messages.append(AIChatMessageResponse(
                        id=data['id'],
                        user_id=data['user_id'],
                        session_id=data['session_id'],
                        message_type=MessageType(data['message_type']),
                        content=data['content'],
                        content_preview=data.get('content_preview'),
                        context_data=data.get('context_data'),  # Fixed: correct field name
                        model_used=data.get('model_used'),
                        processing_time_ms=data.get('processing_time_ms'),
                        confidence_score=data.get('confidence_score'),
                        similarity_score=similarity_score,  # Fixed: added required field
                        source_type=SourceType(source_type),  # Fixed: added required field
                        usage_count=usage_count,  # Fixed: added required field
                        last_used_at=datetime.fromisoformat(last_used_at),  # Fixed: correct field name
                        created_at=datetime.fromisoformat(data['created_at'])
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

            # Build sessions query manually
            result = self.supabase.table('ai_chat_history').select(
                'session_id, message_type, content, created_at'
            ).eq('user_id', user_id).order('created_at', desc=True).execute()

            # Group by session_id and build session summaries
            sessions_dict = {}
            if result.data:
                for row in result.data:
                    session_id = row['session_id']
                    if session_id not in sessions_dict:
                        sessions_dict[session_id] = {
                            'session_id': session_id,
                            'message_count': 0,
                            'first_message': None,
                            'last_message': None,
                            'first_message_at': row['created_at'],
                            'last_message_at': row['created_at'],
                            'total_usage_count': 0
                        }

                    sessions_dict[session_id]['message_count'] += 1
                    sessions_dict[session_id]['last_message_at'] = row['created_at']
                    sessions_dict[session_id]['last_message'] = row['content'][:100]

                    if not sessions_dict[session_id]['first_message']:
                        sessions_dict[session_id]['first_message'] = row['content'][:100]

            sessions = []
            for session_data in list(sessions_dict.values())[:limit]:
                sessions.append(AIChatSessionResponse(
                    session_id=session_data['session_id'],
                    message_count=session_data['message_count'],
                    first_message=session_data['first_message'] or "No messages",
                    last_message=session_data['last_message'] or "No messages",
                    first_message_at=datetime.fromisoformat(session_data['first_message_at']),
                    last_message_at=datetime.fromisoformat(session_data['last_message_at']),
                    total_usage_count=session_data['total_usage_count']
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

            # Get message details before deletion
            message_result = self.supabase.table('ai_chat_history').select(
                'id, session_id, message_type, content'
            ).eq('id', message_id).eq('user_id', user_id).execute()

            if not message_result.data:
                raise Exception("Message not found or access denied")

            message_data = message_result.data[0]

            # Delete the message
            delete_result = self.supabase.table('ai_chat_history').delete().eq(
                'id', message_id
            ).eq('user_id', user_id).execute()

            if delete_result.data:
                return ChatDeleteResponse(
                    id=message_data['id'],
                    session_id=message_data['session_id'],
                    message_type=MessageType(message_data['message_type']),
                    content_preview=message_data['content'][:100],
                    deleted_at=datetime.now(),
                    operation_type='deleted'
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

            # Count messages before deletion
            count_result = self.supabase.table('ai_chat_history').select(
                'id', count='exact'
            ).eq('session_id', session_id).eq('user_id', user_id).execute()

            messages_count = count_result.count or 0

            # Delete all messages in the session
            delete_result = self.supabase.table('ai_chat_history').delete().eq(
                'session_id', session_id
            ).eq('user_id', user_id).execute()

            return {
                "session_id": session_id,
                "messages_deleted": messages_count,
                "deleted_at": datetime.now()
            }

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

            # Call the search function (assuming this exists and works)
            result = await self._call_sql_function('search_ai_chat_messages', params, access_token)

            messages = []
            if result.data:
                for data in result.data:
                    # Handle missing fields with defensive defaults
                    last_used_at = data.get('last_used_at') or data.get('created_at')
                    similarity_score = data.get('similarity_score', 0.0)
                    source_type = data.get('source_type', 'external_ai')
                    usage_count = data.get('usage_count', 1)

                    messages.append(AIChatMessageResponse(
                        id=data['id'],
                        user_id=data['user_id'],
                        session_id=data['session_id'],
                        message_type=MessageType(data['message_type']),
                        content=data['content'],
                        content_preview=data.get('content_preview'),
                        context_data=data.get('context_data'),  # Fixed: correct field name
                        model_used=data.get('model_used'),
                        processing_time_ms=data.get('processing_time_ms'),
                        confidence_score=data.get('confidence_score'),
                        similarity_score=similarity_score,  # Fixed: always provide this
                        source_type=SourceType(source_type),  # Fixed: always provide this
                        usage_count=usage_count,  # Fixed: always provide this
                        last_used_at=datetime.fromisoformat(last_used_at) if last_used_at else datetime.now(),  # Fixed: always provide this
                        created_at=datetime.fromisoformat(data['created_at'])
                    ))

            return messages

        except Exception as e:
            raise Exception(f"Error searching chat messages: {str(e)}")

    async def increment_message_usage(self, message_id: str, access_token: str) -> Dict[str, Any]:
        """Increment usage count for a reused message."""
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

            # Call the increment function
            result = await self._call_sql_function('increment_chat_usage', params, access_token)

            if result.data and len(result.data) > 0:
                data = result.data[0]
                return {
                    "id": data['id'],
                    "usage_count": data['usage_count'],
                    "last_used_at": data['last_used_at']
                }
            else:
                raise Exception("Failed to increment usage")

        except Exception as e:
            raise Exception(f"Error incrementing message usage: {str(e)}")
