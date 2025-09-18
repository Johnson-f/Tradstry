"""
AI Insights Service
Handles AI insights operations using Data Access Layer
Decoupled from direct database operations
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
from models.ai_insights import (
    AIInsightCreate, AIInsightUpdate, AIInsightResponse,
    AIInsightUpsertResponse, InsightDeleteResponse, InsightExpireResponse,
    InsightType, InsightPriority, PriorityInsightsResponse, ActionableInsightsResponse
)
from .dal.ai_insights_dal import AIInsightsDAL
import logging
import uuid

class AIInsightsService:
    """
    Service for handling AI insights operations.
    Manages insight generation, retrieval, and lifecycle.
    Focus on business logic, data access through DAL.
    """

    def __init__(self, dal: Optional[AIInsightsDAL] = None):
        self.dal = dal or AIInsightsDAL()
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")

    async def create_insight(self, insight_data: AIInsightCreate, access_token: str) -> AIInsightUpsertResponse:
        """
        Create a new AI insight.
        
        Args:
            insight_data: Insight data
            access_token: User authentication token
            
        Returns:
            AIInsightUpsertResponse: Created insight response
        """
        try:
            self.logger.info("Creating new AI insight", extra={
                "insight_type": insight_data.insight_type.value,
                "priority": insight_data.priority.value,
                "title_length": len(insight_data.title) if insight_data.title else 0,
                "actionable": insight_data.actionable
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Validate insight data
            self._validate_insight_data(insight_data)
            
            # Create insight through DAL
            result_data = await self.dal.create_insight(insight_data, user_id, access_token)
            
            if not result_data:
                raise Exception("Failed to create insight - no data returned")
            
            # Convert to response model
            response = self._convert_to_upsert_response(result_data)
            
            self.logger.info("AI insight created successfully", extra={
                "insight_id": response.id,
                "insight_type": response.insight_type.value,
                "user_id": user_id
            })
            
            return response
            
        except Exception as e:
            self.logger.error(f"Error creating AI insight: {str(e)}")
            raise Exception(f"Error creating AI insight: {str(e)}")

    async def update_insight(self, insight_id: str, insight_data: AIInsightUpdate, access_token: str) -> AIInsightUpsertResponse:
        """
        Update an existing AI insight.
        
        Args:
            insight_id: Insight ID to update
            insight_data: Update data
            access_token: User authentication token
            
        Returns:
            AIInsightUpsertResponse: Updated insight response
        """
        try:
            self.logger.info("Updating AI insight", extra={
                "insight_id": insight_id,
                "has_description": bool(insight_data.description),
                "priority": insight_data.priority.value if insight_data.priority else None
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Update insight through DAL
            result_data = await self.dal.update_insight(insight_id, insight_data, user_id, access_token)
            
            if not result_data:
                raise Exception("Failed to update insight - insight not found or no access")
            
            # Convert to response model
            response = self._convert_to_upsert_response(result_data)
            
            self.logger.info("AI insight updated successfully", extra={
                "insight_id": insight_id,
                "user_id": user_id
            })
            
            return response
            
        except Exception as e:
            self.logger.error(f"Error updating AI insight {insight_id}: {str(e)}")
            raise Exception(f"Error updating AI insight: {str(e)}")

    async def get_insights(self, access_token: str, insight_id: Optional[str] = None, 
                          insight_type: Optional[str] = None, priority: Optional[str] = None, 
                          actionable: Optional[bool] = None, tags: Optional[List[str]] = None,
                          search_query: Optional[str] = None, limit: int = 50, offset: int = 0,
                          order_by: str = "created_at", order_direction: str = "DESC") -> List[AIInsightResponse]:
        """
        Get AI insights for a user with optional filtering.
        
        Args:
            access_token: User authentication token
            insight_id: Optional specific insight ID
            insight_type: Optional insight type filter (string)
            priority: Optional priority filter (string)
            actionable: Filter for actionable insights
            tags: Optional tags filter
            search_query: Optional search query
            limit: Limit on number of results
            offset: Offset for pagination
            order_by: Field to order by
            order_direction: Order direction (ASC/DESC)
            
        Returns:
            List[AIInsightResponse]: Insights
        """
        try:
            self.logger.info("Retrieving AI insights", extra={
                "insight_id": insight_id,
                "insight_type": insight_type,
                "priority": priority,
                "actionable": actionable,
                "has_search_query": bool(search_query),
                "limit": limit,
                "offset": offset
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Convert string parameters to enum types for DAL
            insight_type_enum = None
            if insight_type:
                try:
                    insight_type_enum = InsightType(insight_type)
                except ValueError:
                    self.logger.warning(f"Invalid insight_type: {insight_type}")
            
            priority_enum = None
            if priority:
                try:
                    priority_enum = InsightPriority(priority)
                except ValueError:
                    self.logger.warning(f"Invalid priority: {priority}")
            
            # Handle search query case
            if search_query:
                insights_data = await self.dal.search_insights(user_id, search_query, access_token, limit)
            else:
                # Get insights through DAL with filtering
                insights_data = await self.dal.get_insights(
                    user_id, access_token, insight_type_enum, priority_enum, 
                    actionable or False, limit
                )
            
            # Convert to response models
            insights = [self._convert_to_insight_response(data) for data in insights_data]
            
            # Apply additional filtering if needed
            if insight_id:
                insights = [insight for insight in insights if insight.id == insight_id]
            
            if tags:
                insights = [insight for insight in insights if any(tag in insight.tags for tag in tags)]
            
            self.logger.info("AI insights retrieved successfully", extra={
                "insight_count": len(insights),
                "user_id": user_id
            })
            
            return insights
            
        except Exception as e:
            self.logger.error(f"Error retrieving AI insights: {str(e)}")
            raise Exception(f"Error retrieving AI insights: {str(e)}")

    async def get_priority_insights(self, access_token: str, limit: int = 10) -> List[PriorityInsightsResponse]:
        """
        Get high-priority insights for a user.
        
        Args:
            access_token: User authentication token
            limit: Limit on number of results
            
        Returns:
            List[PriorityInsightsResponse]: List of priority insights
        """
        try:
            self.logger.info("Retrieving priority insights", extra={
                "limit": limit
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Get priority insights through DAL
            insights_data = await self.dal.get_priority_insights(user_id, access_token, 'high', limit)
            
            # Convert to response models
            insights = [self._convert_to_priority_response(data) for data in insights_data]
            
            self.logger.info("Priority insights retrieved successfully", extra={
                "insight_count": len(insights),
                "user_id": user_id
            })
            
            return insights
            
        except Exception as e:
            self.logger.error(f"Error retrieving priority insights: {str(e)}")
            raise Exception(f"Error retrieving priority insights: {str(e)}")

    async def get_actionable_insights(self, access_token: str, limit: int = 20) -> List[ActionableInsightsResponse]:
        """
        Get actionable insights for a user.
        
        Args:
            access_token: User authentication token
            limit: Limit on number of results
            
        Returns:
            List[ActionableInsightsResponse]: List of actionable insights
        """
        try:
            self.logger.info("Retrieving actionable insights", extra={
                "limit": limit
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Get actionable insights through DAL
            insights_data = await self.dal.get_actionable_insights(user_id, access_token, limit)
            
            # Convert to response models
            insights = [self._convert_to_actionable_response(data) for data in insights_data]
            
            self.logger.info("Actionable insights retrieved successfully", extra={
                "insight_count": len(insights),
                "user_id": user_id
            })
            
            return insights
            
        except Exception as e:
            self.logger.error(f"Error retrieving actionable insights: {str(e)}")
            raise Exception(f"Error retrieving actionable insights: {str(e)}")

    async def delete_insight(self, insight_id: str, access_token: str) -> InsightDeleteResponse:
        """
        Delete an AI insight.
        
        Args:
            insight_id: Insight ID to delete
            access_token: User authentication token
            
        Returns:
            InsightDeleteResponse: Deletion result
        """
        try:
            self.logger.info("Deleting AI insight", extra={
                "insight_id": insight_id
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Delete insight through DAL
            success = await self.dal.delete_insight(insight_id, user_id, access_token)
            
            if success:
                self.logger.info("AI insight deleted successfully", extra={
                    "insight_id": insight_id,
                    "user_id": user_id
                })
                return InsightDeleteResponse(
                    success=True,
                    message="Insight deleted successfully"
                )
            else:
                raise Exception("Failed to delete insight")
                
        except Exception as e:
            self.logger.error(f"Error deleting AI insight {insight_id}: {str(e)}")
            return InsightDeleteResponse(
                success=False,
                message=f"Error deleting insight: {str(e)}"
            )

    async def expire_insight(self, insight_id: str, access_token: str) -> InsightExpireResponse:
        """
        Mark an insight as expired.
        
        Args:
            insight_id: Insight ID to expire
            access_token: User authentication token
            
        Returns:
            InsightExpireResponse: Expiration result
        """
        try:
            self.logger.info("Expiring AI insight", extra={
                "insight_id": insight_id
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Expire insight through DAL
            success = await self.dal.expire_insight(insight_id, user_id, access_token)
            
            if success:
                self.logger.info("AI insight expired successfully", extra={
                    "insight_id": insight_id,
                    "user_id": user_id
                })
                return InsightExpireResponse(
                    success=True,
                    message="Insight expired successfully"
                )
            else:
                raise Exception("Failed to expire insight")
                
        except Exception as e:
            self.logger.error(f"Error expiring AI insight {insight_id}: {str(e)}")
            return InsightExpireResponse(
                success=False,
                message=f"Error expiring insight: {str(e)}"
            )

    async def search_insights(self, access_token: str, query: str, insight_type: Optional[str] = None, limit: int = 20, similarity_threshold: float = 0.7) -> List[AIInsightResponse]:
        """
        Search insights by content.
        
        Args:
            access_token: User authentication token
            query: Search query
            insight_type: Optional insight type filter
            limit: Limit on number of results
            similarity_threshold: Minimum similarity threshold
            
        Returns:
            List[AIInsightResponse]: Search results
        """
        try:
            self.logger.info("Searching AI insights", extra={
                "query_length": len(query),
                "insight_type": insight_type,
                "limit": limit,
                "similarity_threshold": similarity_threshold
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Search insights through DAL
            results_data = await self.dal.search_insights(user_id, query, access_token, limit)
            
            # Convert to response models
            results = [self._convert_to_insight_response(data) for data in results_data]
            
            # Apply insight type filtering if specified
            if insight_type:
                try:
                    insight_type_enum = InsightType(insight_type)
                    results = [r for r in results if r.insight_type == insight_type_enum]
                except ValueError:
                    self.logger.warning(f"Invalid insight_type filter: {insight_type}")
            
            # Apply similarity threshold filtering if similarity_score is available
            if results and hasattr(results[0], 'similarity_score') and results[0].similarity_score is not None:
                results = [r for r in results if r.similarity_score and r.similarity_score >= similarity_threshold]
            
            self.logger.info("AI insights search completed", extra={
                "result_count": len(results),
                "user_id": user_id
            })
            
            return results
            
        except Exception as e:
            self.logger.error(f"Error searching AI insights: {str(e)}")
            raise Exception(f"Error searching AI insights: {str(e)}")

    def _validate_insight_data(self, insight_data: AIInsightCreate):
        """Validate insight data before processing."""
        if not insight_data.title or not insight_data.title.strip():
            raise ValueError("Insight title cannot be empty")
        
        if not insight_data.description or not insight_data.description.strip():
            raise ValueError("Insight description cannot be empty")
        
        if not insight_data.insight_type:
            raise ValueError("Insight type is required")
        
        if not insight_data.priority:
            raise ValueError("Insight priority is required")

    def _convert_to_upsert_response(self, data: Dict[str, Any]) -> AIInsightUpsertResponse:
        """Convert database result to AIInsightUpsertResponse."""
        import json
        
        # Helper function to parse JSON strings
        def parse_json_field(field_value):
            if field_value is None:
                return None
            if isinstance(field_value, str):
                try:
                    return json.loads(field_value)
                except (json.JSONDecodeError, TypeError):
                    return None
            return field_value
        
        return AIInsightUpsertResponse(
            id=str(data.get('id')),
            user_id=str(data.get('user_id')),
            insight_type=InsightType(data.get('insight_type', 'risk')),
            title=data.get('title', ''),
            description=data.get('description', ''),
            data_source=parse_json_field(data.get('data_source')),
            confidence_score=data.get('confidence_score'),
            priority=InsightPriority(data.get('priority', 'medium')),
            actionable=data.get('actionable', False),
            actions=parse_json_field(data.get('actions')),
            tags=data.get('tags', []) if isinstance(data.get('tags'), list) else [],
            valid_until=data.get('valid_until'),
            model_used=data.get('model_used'),
            created_at=data.get('created_at'),
            updated_at=data.get('updated_at'),
            operation_type=data.get('operation_type', 'created')
        )

    def _convert_to_insight_response(self, data: Dict[str, Any]) -> AIInsightResponse:
        """Convert database result to AIInsightResponse."""
        import json
        
        # Helper function to parse JSON strings
        def parse_json_field(field_value):
            if field_value is None:
                return None
            if isinstance(field_value, str):
                try:
                    return json.loads(field_value)
                except (json.JSONDecodeError, TypeError):
                    return None
            return field_value
        
        # Check if insight has expired
        valid_until = data.get('valid_until')
        is_expired = False
        if valid_until:
            try:
                valid_until_dt = datetime.fromisoformat(valid_until) if isinstance(valid_until, str) else valid_until
                is_expired = valid_until_dt < datetime.utcnow()
            except:
                is_expired = False
        
        return AIInsightResponse(
            id=str(data.get('id', '')),
            user_id=str(data.get('user_id', '')),
            insight_type=InsightType(data.get('insight_type', 'risk')),
            title=data.get('title', ''),
            description=data.get('description', ''),
            data_source=parse_json_field(data.get('data_source')),
            confidence_score=data.get('confidence_score'),
            priority=InsightPriority(data.get('priority', 'medium')),
            actionable=data.get('actionable', False),
            actions=parse_json_field(data.get('actions')),
            tags=data.get('tags', []) if isinstance(data.get('tags'), list) else [],
            valid_until=data.get('valid_until'),
            model_used=data.get('model_used'),
            created_at=data.get('created_at'),
            updated_at=data.get('updated_at'),
            description_preview=data.get('description', '')[:200] if data.get('description') else None,
            is_expired=is_expired,
            similarity_score=data.get('similarity_score')
        )

    def _convert_to_priority_response(self, data: Dict[str, Any]) -> PriorityInsightsResponse:
        """Convert database result to PriorityInsightsResponse."""
        import json
        
        # Helper function to parse JSON strings
        def parse_json_field(field_value):
            if field_value is None:
                return None
            if isinstance(field_value, str):
                try:
                    return json.loads(field_value)
                except (json.JSONDecodeError, TypeError):
                    return None
            return field_value
        
        # Check if insight has expired
        valid_until = data.get('valid_until')
        is_expired = False
        if valid_until:
            try:
                valid_until_dt = datetime.fromisoformat(valid_until) if isinstance(valid_until, str) else valid_until
                is_expired = valid_until_dt < datetime.utcnow()
            except:
                is_expired = False
        
        return PriorityInsightsResponse(
            id=str(data.get('id', '')),
            insight_type=InsightType(data.get('insight_type', 'risk')),
            title=data.get('title', ''),
            description_preview=data.get('description', '')[:200] if data.get('description') else '',
            priority=InsightPriority(data.get('priority', 'medium')),
            actionable=data.get('actionable', False),
            actions=parse_json_field(data.get('actions')),
            valid_until=data.get('valid_until'),
            is_expired=is_expired,
            created_at=data.get('created_at')
        )

    def _convert_to_actionable_response(self, data: Dict[str, Any]) -> ActionableInsightsResponse:
        """Convert database result to ActionableInsightsResponse."""
        import json
        
        # Helper function to parse JSON strings
        def parse_json_field(field_value):
            if field_value is None:
                return {}
            if isinstance(field_value, str):
                try:
                    return json.loads(field_value)
                except (json.JSONDecodeError, TypeError):
                    return {}
            return field_value if isinstance(field_value, dict) else {}
        
        return ActionableInsightsResponse(
            id=str(data.get('id', '')),
            insight_type=InsightType(data.get('insight_type', 'risk')),
            title=data.get('title', ''),
            description_preview=data.get('description', '')[:200] if data.get('description') else '',
            priority=InsightPriority(data.get('priority', 'medium')),
            actions=parse_json_field(data.get('actions')),
            tags=data.get('tags', []) if isinstance(data.get('tags'), list) else [],
            confidence_score=data.get('confidence_score'),
            valid_until=data.get('valid_until'),
            created_at=data.get('created_at')
        )
