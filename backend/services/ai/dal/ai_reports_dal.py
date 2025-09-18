"""
Data Access Layer for AI Reports operations
Handles all database interactions for reports management
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
from .base_dal import BaseDAL
from models.ai_reports import AIReportCreate, AIReportUpdate, ReportType, ReportStatus

class AIReportsDAL(BaseDAL):
    """
    Data Access Layer for AI Reports operations
    """
    
    async def create_report(self, report_data: AIReportCreate, user_id: str, access_token: str) -> Dict[str, Any]:
        """
        Create a new AI report in the database.
        
        Args:
            report_data: Report data
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            Dict[str, Any]: Created report data
        """
        params = {
            'p_user_id': user_id,
            'p_report_type': report_data.report_type.value,
            'p_title': report_data.title,
            'p_content': report_data.content,
            'p_content_embedding': None,  # Will be handled separately if needed
            'p_insights': report_data.insights,
            'p_recommendations': report_data.recommendations,
            'p_metrics': report_data.metrics,
            'p_date_range_start': report_data.date_range_start.date().isoformat() if report_data.date_range_start else None,
            'p_date_range_end': report_data.date_range_end.date().isoformat() if report_data.date_range_end else None,
            'p_model_used': report_data.model_used,
            'p_processing_time_ms': report_data.generation_time_ms,
            'p_confidence_score': report_data.confidence_score,
            'p_status': report_data.status.value if report_data.status else 'completed',
            'p_report_id': None  # For new reports
        }
        
        response = await self.call_sql_function('upsert_ai_report', params, access_token)
        return self.extract_single_response(response)
    
    async def update_report(self, report_id: str, update_data: AIReportUpdate, user_id: str, access_token: str) -> Dict[str, Any]:
        """
        Update an existing AI report.
        
        Args:
            report_id: Report ID to update
            update_data: Update data
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            Dict[str, Any]: Updated report data
        """
        params = {
            'p_user_id': user_id,
            'p_report_type': update_data.report_type.value if update_data.report_type else 'custom',
            'p_title': update_data.title or 'Updated Report',
            'p_content': update_data.content or '',
            'p_content_embedding': None,
            'p_insights': update_data.insights,
            'p_recommendations': update_data.recommendations,
            'p_metrics': update_data.metrics,
            'p_date_range_start': update_data.date_range_start.date().isoformat() if update_data.date_range_start else None,
            'p_date_range_end': update_data.date_range_end.date().isoformat() if update_data.date_range_end else None,
            'p_model_used': update_data.model_used,
            'p_processing_time_ms': update_data.generation_time_ms,
            'p_confidence_score': update_data.confidence_score,
            'p_status': update_data.status.value if update_data.status else 'completed',
            'p_report_id': report_id  # For updates
        }
        
        response = await self.call_sql_function('upsert_ai_report', params, access_token)
        return self.extract_single_response(response)
    
    async def get_reports(self, user_id: str, access_token: str, report_type: Optional[ReportType] = None,
                         status: Optional[ReportStatus] = None, 
                         date_from: Optional[datetime] = None,
                         date_to: Optional[datetime] = None,
                         limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get AI reports for a user with optional filtering.
        
        Args:
            user_id: User ID
            access_token: User authentication token
            report_type: Optional report type filter
            status: Optional status filter
            date_from: Optional start date filter
            date_to: Optional end date filter
            limit: Limit on number of results
            
        Returns:
            List[Dict[str, Any]]: Reports data
        """
        params = {
            'p_user_id': user_id,
            'p_report_id': None,
            'p_report_type': report_type.value if report_type else None,
            'p_status': status.value if status else None,
            'p_date_range_start': date_from.date().isoformat() if date_from else None,
            'p_date_range_end': date_to.date().isoformat() if date_to else None,
            'p_search_query': None,
            'p_similarity_threshold': 0.8,
            'p_limit': limit,
            'p_offset': 0,
            'p_order_by': 'created_at',
            'p_order_direction': 'DESC'
        }
        
        response = await self.call_sql_function('get_ai_reports', params, access_token)
        return self.extract_response_data(response)
    
    async def get_report_by_id(self, report_id: str, user_id: str, access_token: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific AI report by ID.
        
        Args:
            report_id: Report ID
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            Optional[Dict[str, Any]]: Report data or None
        """
        params = {
            'p_user_id': user_id,
            'p_report_id': report_id
        }
        
        response = await self.call_sql_function('get_ai_report_by_id', params, access_token)
        return self.extract_single_response(response)
    
    async def delete_report(self, report_id: str, user_id: str, access_token: str) -> bool:
        """
        Delete an AI report.
        
        Args:
            report_id: Report ID to delete
            user_id: User ID
            access_token: User authentication token
            
        Returns:
            bool: True if deletion was successful
        """
        params = {
            'p_user_id': user_id,
            'p_report_id': report_id
        }
        
        try:
            response = await self.call_sql_function('delete_ai_report', params, access_token)
            return True
        except Exception as e:
            self.logger.error(f"Failed to delete report {report_id}: {str(e)}")
            return False
    
    async def get_daily_ai_summary(self, user_id: str, access_token: str, time_range: str = 'all_time', custom_start_date: Optional[datetime] = None, custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Get daily AI summary data for report generation.
        
        Args:
            user_id: User ID
            access_token: User authentication token
            time_range: Time range for the summary ('all_time', 'today', 'week', 'month', etc.)
            custom_start_date: Optional custom start date
            custom_end_date: Optional custom end date
            
        Returns:
            Dict[str, Any]: Daily summary data
        """
        params = {
            'p_time_range': time_range,
            'p_custom_start_date': custom_start_date.date().isoformat() if custom_start_date else None,
            'p_custom_end_date': custom_end_date.date().isoformat() if custom_end_date else None
        }
        
        response = await self.call_sql_function('get_daily_ai_summary', params, access_token)
        return self.extract_single_response(response) or {}
    
    async def get_trading_context(self, user_id: str, access_token: str, note_id: Optional[int] = None, trade_id: Optional[int] = None, trade_type: Optional[str] = None, tags: Optional[List[str]] = None, phase: Optional[str] = None, rating: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get trading context data for AI analysis.
        
        Args:
            user_id: User ID
            access_token: User authentication token
            note_id: Filter by specific note ID (optional)
            trade_id: Filter by specific trade ID (optional)
            trade_type: Filter by trade type ('stock' or 'option') (optional)
            tags: Filter by tags (optional)
            phase: Filter by trade phase (optional)
            rating: Filter by rating (optional)
            
        Returns:
            List[Dict[str, Any]]: Trading context data
        """
        params = {
            'p_note_id': note_id,
            'p_trade_id': trade_id,
            'p_trade_type': trade_type,
            'p_tags': tags,
            'p_phase': phase,
            'p_rating': rating
        }
        
        response = await self.call_sql_function('select_trade_notes', params, access_token)
        # The function returns JSONB, so we need to extract the data from the response
        result = self.extract_single_response(response)
        if result and isinstance(result, dict) and 'data' in result:
            return result['data'] if isinstance(result['data'], list) else []
        return []
