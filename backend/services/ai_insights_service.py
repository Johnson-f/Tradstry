from typing import Dict, Any, Optional, List
from supabase import Client
from database import get_supabase
from datetime import datetime
from auth_service import AuthService
from models.ai_insights import (
    AIInsightCreate, AIInsightUpdate, AIInsightResponse,
    AIInsightUpsertResponse, InsightDeleteResponse, InsightExpireResponse,
    InsightType, InsightPriority, PriorityInsightsResponse, ActionableInsightsResponse
)
import json
import uuid

class AIInsightsService:
    """
    Service for handling AI insights operations.
    Manages insight generation, retrieval, and lifecycle.
    """

    def __init__(self, supabase: Optional[Client] = None):
        self.supabase = supabase or get_supabase()
        self.auth_service = AuthService(self.supabase)

    async def _get_authenticated_user_id(self, access_token: str) -> str:
        """
        Helper method to extract and validate user_id from access_token.
        
        This method:
        1. Validates the access token
        2. Extracts the authenticated user
        3. Returns the user_id
        
        Raises:
            Exception: If authentication fails or token is invalid
        """
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            return user_response.user.id
            
        except Exception as e:
            raise Exception(f"Authentication failed: {str(e)}")

    async def _call_sql_function(self, function_name: str, params: Dict[str, Any], access_token: str) -> Any:
        """Helper method to call SQL functions with authentication."""
        try:
            return await self.auth_service.safe_rpc_call(function_name, params, access_token)
        except Exception as e:
            raise Exception(f"Database operation failed: {str(e)}")

    async def create_insight(self, insight_data: AIInsightCreate, access_token: str) -> AIInsightUpsertResponse:
        """Create a new AI insight."""
        try:
            # Get authenticated user_id
            user_id = await self._get_authenticated_user_id(access_token)
            
            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_insight_type': insight_data.insight_type.value,
                'p_title': insight_data.title,
                'p_description': insight_data.description,
                'p_data_source': json.dumps(insight_data.data_source) if insight_data.data_source else None,
                'p_confidence_score': insight_data.confidence_score,
                'p_priority': insight_data.priority.value,
                'p_actionable': insight_data.actionable,
                'p_actions': json.dumps(insight_data.actions) if insight_data.actions else None,
                'p_tags': insight_data.tags,
                'p_valid_until': insight_data.valid_until.isoformat() if insight_data.valid_until else None,
                'p_model_used': insight_data.model_used
            }

            # Call the upsert function
            result = await self._call_sql_function('upsert_ai_insights', params, access_token)

            if result.data and len(result.data) > 0:
                data = result.data[0]
                return AIInsightUpsertResponse(
                    id=data['id'],
                    user_id=data['user_id'],
                    insight_type=InsightType(data['insight_type']),
                    title=data['title'],
                    description=data['description'],
                    data_source=json.loads(data['data_source']) if data['data_source'] else None,
                    confidence_score=data['confidence_score'],
                    priority=InsightPriority(data['priority']),
                    actionable=data['actionable'],
                    actions=json.loads(data['actions']) if data['actions'] else None,
                    tags=data['tags'],
                    valid_until=datetime.fromisoformat(data['valid_until']) if data['valid_until'] else None,
                    model_used=data['model_used'],
                    created_at=datetime.fromisoformat(data['created_at']),
                    updated_at=datetime.fromisoformat(data['updated_at']),
                    operation_type=data['operation_type']
                )
            else:
                raise Exception("Failed to create insight")

        except Exception as e:
            raise Exception(f"Error creating AI insight: {str(e)}")

    async def update_insight(self, insight_id: str, insight_data: AIInsightUpdate, access_token: str) -> AIInsightUpsertResponse:
        """Update an existing AI insight."""
        try:
            # Get authenticated user_id
            user_id = await self._get_authenticated_user_id(access_token)
            
            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_insight_id': insight_id,
                'p_insight_type': insight_data.insight_type.value if insight_data.insight_type else None,
                'p_title': insight_data.title,
                'p_description': insight_data.description,
                'p_data_source': json.dumps(insight_data.data_source) if insight_data.data_source else None,
                'p_confidence_score': insight_data.confidence_score,
                'p_priority': insight_data.priority.value if insight_data.priority else None,
                'p_actionable': insight_data.actionable,
                'p_actions': json.dumps(insight_data.actions) if insight_data.actions else None,
                'p_tags': insight_data.tags,
                'p_valid_until': insight_data.valid_until.isoformat() if insight_data.valid_until else None,
                'p_model_used': insight_data.model_used
            }

            # Call the upsert function with insight_id
            result = await self._call_sql_function('upsert_ai_insights', params, access_token)

            if result.data and len(result.data) > 0:
                data = result.data[0]
                return AIInsightUpsertResponse(
                    id=data['id'],
                    user_id=data['user_id'],
                    insight_type=InsightType(data['insight_type']),
                    title=data['title'],
                    description=data['description'],
                    data_source=json.loads(data['data_source']) if data['data_source'] else None,
                    confidence_score=data['confidence_score'],
                    priority=InsightPriority(data['priority']),
                    actionable=data['actionable'],
                    actions=json.loads(data['actions']) if data['actions'] else None,
                    tags=data['tags'],
                    valid_until=datetime.fromisoformat(data['valid_until']) if data['valid_until'] else None,
                    model_used=data['model_used'],
                    created_at=datetime.fromisoformat(data['created_at']),
                    updated_at=datetime.fromisoformat(data['updated_at']),
                    operation_type=data['operation_type']
                )
            else:
                raise Exception("Failed to update insight")

        except Exception as e:
            raise Exception(f"Error updating AI insight: {str(e)}")

    async def get_insights(
        self,
        access_token: str,
        insight_id: Optional[str] = None,
        insight_type: Optional[str] = None,
        priority: Optional[str] = None,
        actionable: Optional[bool] = None,
        tags: Optional[List[str]] = None,
        search_query: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        order_by: str = "created_at",
        order_direction: str = "DESC"
    ) -> List[AIInsightResponse]:
        """Get AI insights with filtering and pagination."""
        try:
            # Get authenticated user_id
            user_id = await self._get_authenticated_user_id(access_token)
            
            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_insight_id': insight_id,
                'p_insight_type': insight_type,
                'p_priority': priority,
                'p_actionable': actionable,
                'p_tags': tags,
                'p_search_query': search_query,
                'p_limit': limit,
                'p_offset': offset,
                'p_order_by': order_by,
                'p_order_direction': order_direction
            }

            # Call the get function
            result = await self._call_sql_function('get_ai_insights', params, access_token)

            insights = []
            if result.data:
                for data in result.data:
                    insights.append(AIInsightResponse(
                        id=data['id'],
                        user_id=data['user_id'],
                        insight_type=InsightType(data['insight_type']),
                        title=data['title'],
                        description=data['description'],
                        description_preview=data.get('description_preview'),
                        data_source=json.loads(data['data_source']) if data['data_source'] else None,
                        confidence_score=data['confidence_score'],
                        priority=InsightPriority(data['priority']),
                        actionable=data['actionable'],
                        actions=json.loads(data['actions']) if data['actions'] else None,
                        tags=data['tags'],
                        valid_until=datetime.fromisoformat(data['valid_until']) if data['valid_until'] else None,
                        model_used=data['model_used'],
                        created_at=datetime.fromisoformat(data['created_at']),
                        updated_at=datetime.fromisoformat(data['updated_at']),
                        is_expired=data.get('is_expired', False),
                        similarity_score=data.get('similarity_score')
                    ))

            return insights

        except Exception as e:
            raise Exception(f"Error retrieving AI insights: {str(e)}")

    async def get_priority_insights(self, access_token: str, limit: int = 10) -> List[PriorityInsightsResponse]:
        """Get high-priority insights."""
        try:
            # Get authenticated user_id
            user_id = await self._get_authenticated_user_id(access_token)
            
            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_limit': limit
            }

            # Call the priority insights function
            result = await self._call_sql_function('get_priority_ai_insights', params, access_token)

            insights = []
            if result.data:
                for data in result.data:
                    insights.append(PriorityInsightsResponse(
                        id=data['id'],
                        insight_type=InsightType(data['insight_type']),
                        title=data['title'],
                        description_preview=data['description_preview'],
                        priority=InsightPriority(data['priority']),
                        actionable=data['actionable'],
                        actions=json.loads(data['actions']) if data['actions'] else None,
                        valid_until=datetime.fromisoformat(data['valid_until']) if data['valid_until'] else None,
                        is_expired=data.get('is_expired', False),
                        created_at=datetime.fromisoformat(data['created_at'])
                    ))

            return insights

        except Exception as e:
            raise Exception(f"Error retrieving priority insights: {str(e)}")

    async def get_actionable_insights(self, access_token: str, limit: int = 20) -> List[ActionableInsightsResponse]:
        """Get actionable insights."""
        try:
            # Get authenticated user_id
            user_id = await self._get_authenticated_user_id(access_token)
            
            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_limit': limit
            }

            # Call the actionable insights function
            result = await self._call_sql_function('get_actionable_ai_insights', params, access_token)

            insights = []
            if result.data:
                for data in result.data:
                    insights.append(ActionableInsightsResponse(
                        id=data['id'],
                        insight_type=InsightType(data['insight_type']),
                        title=data['title'],
                        description_preview=data['description_preview'],
                        priority=InsightPriority(data['priority']),
                        actions=json.loads(data['actions']),
                        tags=data['tags'],
                        confidence_score=data['confidence_score'],
                        valid_until=datetime.fromisoformat(data['valid_until']) if data['valid_until'] else None,
                        created_at=datetime.fromisoformat(data['created_at'])
                    ))

            return insights

        except Exception as e:
            raise Exception(f"Error retrieving actionable insights: {str(e)}")

    async def delete_insight(self, insight_id: str, access_token: str, soft_delete: bool = False) -> InsightDeleteResponse:
        """Delete an AI insight."""
        try:
            # Get authenticated user_id
            user_id = await self._get_authenticated_user_id(access_token)
            
            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_insight_id': insight_id,
                'p_soft_delete': soft_delete
            }

            # Call the delete function
            result = await self._call_sql_function('delete_ai_insight', params, access_token)

            if result.data and len(result.data) > 0:
                data = result.data[0]
                return InsightDeleteResponse(
                    id=data['id'],
                    title=data['title'],
                    insight_type=InsightType(data['insight_type']),
                    priority=InsightPriority(data['priority']),
                    deleted_at=datetime.fromisoformat(data['deleted_at']),
                    operation_type=data['operation_type']
                )
            else:
                raise Exception("Failed to delete insight")

        except Exception as e:
            raise Exception(f"Error deleting AI insight: {str(e)}")

    async def expire_insight(self, insight_id: str, access_token: str) -> InsightExpireResponse:
        """Expire an AI insight."""
        try:
            # Get authenticated user_id
            user_id = await self._get_authenticated_user_id(access_token)
            
            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_insight_id': insight_id
            }

            # Call the expire function
            result = await self._call_sql_function('expire_ai_insight', params, access_token)

            if result.data and len(result.data) > 0:
                data = result.data[0]
                return InsightExpireResponse(
                    id=data['id'],
                    title=data['title'],
                    valid_until=datetime.fromisoformat(data['valid_until']) if data['valid_until'] else None,
                    expired_at=datetime.fromisoformat(data['expired_at'])
                )
            else:
                raise Exception("Failed to expire insight")

        except Exception as e:
            raise Exception(f"Error expiring AI insight: {str(e)}")

    async def search_insights(
        self,
        access_token: str,
        query: str,
        insight_type: Optional[str] = None,
        limit: int = 20,
        similarity_threshold: float = 0.7
    ) -> List[AIInsightResponse]:
        """Search insights using vector similarity."""
        try:
            # Get authenticated user_id
            user_id = await self._get_authenticated_user_id(access_token)
            
            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_query': query,
                'p_insight_type': insight_type,
                'p_limit': limit,
                'p_similarity_threshold': similarity_threshold
            }

            # Call the search function
            result = await self._call_sql_function('search_ai_insights', params, access_token)

            insights = []
            if result.data:
                for data in result.data:
                    insights.append(AIInsightResponse(
                        id=data['id'],
                        user_id=data['user_id'],
                        insight_type=InsightType(data['insight_type']),
                        title=data['title'],
                        description=data['description'],
                        description_preview=data.get('description_preview'),
                        data_source=json.loads(data['data_source']) if data['data_source'] else None,
                        confidence_score=data['confidence_score'],
                        priority=InsightPriority(data['priority']),
                        actionable=data['actionable'],
                        actions=json.loads(data['actions']) if data['actions'] else None,
                        tags=data['tags'],
                        valid_until=datetime.fromisoformat(data['valid_until']) if data['valid_until'] else None,
                        model_used=data['model_used'],
                        created_at=datetime.fromisoformat(data['created_at']),
                        updated_at=datetime.fromisoformat(data['updated_at']),
                        is_expired=data.get('is_expired', False),
                        similarity_score=data.get('similarity_score')
                    ))

            return insights

        except Exception as e:
            raise Exception(f"Error searching AI insights: {str(e)}")
