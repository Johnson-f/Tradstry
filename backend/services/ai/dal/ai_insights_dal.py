"""
Data Access Layer for AI Insights operations
Handles all database interactions for insights management
"""

from typing import Dict, Any, Optional, List
from .base_dal import BaseDAL
from models.ai_insights import AIInsightCreate, AIInsightUpdate, InsightType, InsightPriority

class AIInsightsDAL(BaseDAL):
    """
    Data Access Layer for AI Insights operations
    """
    
    async def create_insight(self, insight_data: AIInsightCreate, user_id: str, access_token: str) -> Dict[str, Any]:
        """
        Create a new AI insight in the database.
        
        Args:
            insight_data: Insight data
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            Dict[str, Any]: Created insight data
        """
        params = {
            'p_user_id': user_id,
            'p_insight_type': insight_data.insight_type.value,
            'p_priority': insight_data.priority.value,
            'p_title': insight_data.title,
            'p_content': insight_data.description,
            'p_symbols': getattr(insight_data, 'symbols', []) or [],
            'p_confidence_score': insight_data.confidence_score,
            'p_actionable': insight_data.actionable,
            'p_target_date': getattr(insight_data, 'target_date', None).isoformat() if getattr(insight_data, 'target_date', None) else None,
            'p_expires_at': getattr(insight_data, 'expires_at', None).isoformat() if getattr(insight_data, 'expires_at', None) else None,
            'p_metadata': getattr(insight_data, 'metadata', {}) or {},
            'p_tags': insight_data.tags or []
        }
        
        response = await self.call_sql_function('upsert_ai_insight', params, access_token)
        return self.extract_single_response(response)
    
    async def update_insight(self, insight_id: str, update_data: AIInsightUpdate, user_id: str, access_token: str) -> Dict[str, Any]:
        """
        Update an existing AI insight.
        
        Args:
            insight_id: Insight ID to update
            update_data: Update data
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            Dict[str, Any]: Updated insight data
        """
        params = {
            'p_user_id': user_id,
            'p_insight_id': insight_id,
            'p_title': update_data.title,
            'p_content': update_data.description,
            'p_priority': update_data.priority.value if update_data.priority else None,
            'p_confidence_score': update_data.confidence_score,
            'p_actionable': update_data.actionable,
            'p_target_date': getattr(update_data, 'target_date', None).isoformat() if getattr(update_data, 'target_date', None) else None,
            'p_expires_at': getattr(update_data, 'expires_at', None).isoformat() if getattr(update_data, 'expires_at', None) else None,
            'p_metadata': getattr(update_data, 'metadata', None),
            'p_tags': update_data.tags
        }
        
        response = await self.call_sql_function('update_ai_insight', params, access_token)
        return self.extract_single_response(response)
    
    async def get_insights(self, user_id: str, access_token: str, insight_type: Optional[InsightType] = None, 
                          priority: Optional[InsightPriority] = None, 
                          actionable_only: bool = False, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get AI insights for a user with optional filtering.
        
        Args:
            user_id: User ID
            access_token: User authentication token
            insight_type: Optional insight type filter
            priority: Optional priority filter
            actionable_only: Filter for actionable insights only
            limit: Limit on number of results
            
        Returns:
            List[Dict[str, Any]]: Insights data
        """
        params = {
            'p_user_id': user_id,
            'p_insight_id': None,
            'p_insight_type': insight_type.value if insight_type else None,
            'p_priority': priority.value if priority else None,
            'p_actionable': actionable_only,
            'p_include_expired': False,
            'p_tags': None,
            'p_search_query': None,
            'p_limit': limit,
            'p_offset': 0,
            'p_order_by': 'created_at',
            'p_order_direction': 'DESC',
            'p_similarity_threshold': None
        }
        
        response = await self.call_sql_function('get_ai_insights', params, access_token)
        return self.extract_response_data(response)
    
    async def get_priority_insights(self, user_id: str, access_token: str, priority: str = 'high', limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get high-priority insights for a user.
        
        Args:
            user_id: User ID
            access_token: User authentication token
            priority: Priority level to filter by
            limit: Limit on number of results
            
        Returns:
            List[Dict[str, Any]]: Priority insights data
        """
        params = {
            'p_user_id': user_id,
            'p_priority': priority,
            'p_limit': limit
        }
        
        response = await self.call_sql_function('get_priority_ai_insights', params, access_token)
        return self.extract_response_data(response)
    
    async def get_actionable_insights(self, user_id: str, access_token: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get actionable insights for a user.
        
        Args:
            user_id: User ID
            access_token: User authentication token
            limit: Limit on number of results
            
        Returns:
            List[Dict[str, Any]]: Actionable insights data
        """
        params = {
            'p_user_id': user_id,
            'p_limit': limit
        }
        
        response = await self.call_sql_function('get_actionable_ai_insights', params, access_token)
        return self.extract_response_data(response)
    
    async def delete_insight(self, insight_id: str, user_id: str, access_token: str) -> bool:
        """
        Delete an AI insight.
        
        Args:
            insight_id: Insight ID to delete
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            bool: True if deletion was successful
        """
        params = {
            'p_user_id': user_id,
            'p_insight_id': insight_id
        }
        
        try:
            response = await self.call_sql_function('delete_ai_insight', params, access_token)
            return True
        except Exception as e:
            self.logger.error(f"Failed to delete insight {insight_id}: {str(e)}")
            return False
    
    async def expire_insight(self, insight_id: str, user_id: str, access_token: str) -> bool:
        """
        Mark an insight as expired.
        
        Args:
            insight_id: Insight ID to expire
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            bool: True if expiration was successful
        """
        params = {
            'p_user_id': user_id,
            'p_insight_id': insight_id
        }
        
        try:
            response = await self.call_sql_function('expire_ai_insight', params, access_token)
            return True
        except Exception as e:
            self.logger.error(f"Failed to expire insight {insight_id}: {str(e)}")
            return False
    
    async def search_insights(self, user_id: str, query: str, access_token: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search insights by content.
        
        Args:
            user_id: User ID
            query: Search query
            access_token: User authentication token
            limit: Limit on number of results
            
        Returns:
            List[Dict[str, Any]]: Search results
        """
        params = {
            'p_user_id': user_id,
            'p_query': query,
            'p_limit': limit
        }
        
        response = await self.call_sql_function('search_ai_insights', params, access_token)
        return self.extract_response_data(response)
