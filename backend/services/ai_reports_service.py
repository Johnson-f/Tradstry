from typing import Dict, Any, Optional, List
from supabase import Client
from database import get_supabase
from datetime import datetime
from auth_service import AuthService
from services.analytics_service import AnalyticsService
from services.trade_notes_service import TradeNotesService
from models.ai_reports import (
    AIReportCreate, AIReportUpdate, AIReportInDB, AIReportResponse,
    AIReportUpsertResponse, DeleteResponse, ReportType, ReportStatus
)
import json
import uuid

class AIReportsService:
    """
    Service for handling AI reports operations.
    Integrates with existing analytics and follows established patterns.
    """
    
    def __init__(self, supabase: Optional[Client] = None):
        self.supabase = supabase or get_supabase()
        self.auth_service = AuthService(self.supabase)
        self.analytics_service = AnalyticsService(self.supabase)
        self.trade_notes_service = TradeNotesService(self.supabase)

    async def _call_sql_function(self, function_name: str, params: Dict[str, Any], access_token: str) -> Any:
        """Helper method to call SQL functions with authentication."""
        try:
            return await self.auth_service.safe_rpc_call(function_name, params, access_token)
        except Exception as e:
            raise Exception(f"Database operation failed: {str(e)}")

    async def create_report(self, report_data: AIReportCreate, access_token: str) -> AIReportUpsertResponse:
        """Create a new AI report."""
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            
            # Get user from token
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            user_id = user_response.user.id

            # Prepare parameters for SQL function
            params = {
                'p_user_id': user_id,
                'p_report_type': report_data.report_type.value,
                'p_title': report_data.title,
                'p_content': report_data.content,
                'p_insights': json.dumps(report_data.insights) if report_data.insights else None,
                'p_recommendations': json.dumps(report_data.recommendations) if report_data.recommendations else None,
                'p_metrics': json.dumps(report_data.metrics) if report_data.metrics else None,
                'p_date_range_start': report_data.date_range_start.isoformat() if report_data.date_range_start else None,
                'p_date_range_end': report_data.date_range_end.isoformat() if report_data.date_range_end else None,
                'p_model_used': report_data.model_used,
                'p_confidence_score': report_data.confidence_score,
                'p_status': report_data.status.value
            }

            # Call the upsert function
            result = await self._call_sql_function('upsert_ai_report', params, access_token)
            
            if result.data and len(result.data) > 0:
                data = result.data[0]
                return AIReportUpsertResponse(
                    id=data['id'],
                    user_id=data['user_id'],
                    report_type=ReportType(data['report_type']),
                    title=data['title'],
                    content=data['content'],
                    insights=json.loads(data['insights']) if data['insights'] else None,
                    recommendations=json.loads(data['recommendations']) if data['recommendations'] else None,
                    metrics=json.loads(data['metrics']) if data['metrics'] else None,
                    date_range_start=datetime.fromisoformat(data['date_range_start']) if data['date_range_start'] else None,
                    date_range_end=datetime.fromisoformat(data['date_range_end']) if data['date_range_end'] else None,
                    model_used=data['model_used'],
                    processing_time_ms=data['processing_time_ms'],
                    confidence_score=data['confidence_score'],
                    status=ReportStatus(data['status']),
                    created_at=datetime.fromisoformat(data['created_at']),
                    updated_at=datetime.fromisoformat(data['updated_at']),
                    operation_type=data['operation_type']
                )
            else:
                raise Exception("Failed to create report")

        except Exception as e:
            raise Exception(f"Error creating AI report: {str(e)}")

    async def update_report(self, report_id: str, report_data: AIReportUpdate, access_token: str) -> AIReportUpsertResponse:
        """Update an existing AI report."""
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
                'p_report_id': report_id,
                'p_report_type': report_data.report_type.value if report_data.report_type else None,
                'p_title': report_data.title,
                'p_content': report_data.content,
                'p_insights': json.dumps(report_data.insights) if report_data.insights else None,
                'p_recommendations': json.dumps(report_data.recommendations) if report_data.recommendations else None,
                'p_metrics': json.dumps(report_data.metrics) if report_data.metrics else None,
                'p_date_range_start': report_data.date_range_start.isoformat() if report_data.date_range_start else None,
                'p_date_range_end': report_data.date_range_end.isoformat() if report_data.date_range_end else None,
                'p_model_used': report_data.model_used,
                'p_confidence_score': report_data.confidence_score,
                'p_status': report_data.status.value if report_data.status else None
            }

            # Call the upsert function with report_id
            result = await self._call_sql_function('upsert_ai_report', params, access_token)
            
            if result.data and len(result.data) > 0:
                data = result.data[0]
                return AIReportUpsertResponse(
                    id=data['id'],
                    user_id=data['user_id'],
                    report_type=ReportType(data['report_type']),
                    title=data['title'],
                    content=data['content'],
                    insights=json.loads(data['insights']) if data['insights'] else None,
                    recommendations=json.loads(data['recommendations']) if data['recommendations'] else None,
                    metrics=json.loads(data['metrics']) if data['metrics'] else None,
                    date_range_start=datetime.fromisoformat(data['date_range_start']) if data['date_range_start'] else None,
                    date_range_end=datetime.fromisoformat(data['date_range_end']) if data['date_range_end'] else None,
                    model_used=data['model_used'],
                    processing_time_ms=data['processing_time_ms'],
                    confidence_score=data['confidence_score'],
                    status=ReportStatus(data['status']),
                    created_at=datetime.fromisoformat(data['created_at']),
                    updated_at=datetime.fromisoformat(data['updated_at']),
                    operation_type=data['operation_type']
                )
            else:
                raise Exception("Failed to update report")

        except Exception as e:
            raise Exception(f"Error updating AI report: {str(e)}")

    async def get_reports(
        self,
        access_token: str,
        report_id: Optional[str] = None,
        report_type: Optional[str] = None,
        status: Optional[str] = None,
        date_range_start: Optional[datetime] = None,
        date_range_end: Optional[datetime] = None,
        search_query: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        order_by: str = "created_at",
        order_direction: str = "DESC"
    ) -> List[AIReportResponse]:
        """Get AI reports with filtering and pagination."""
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
                'p_report_id': report_id,
                'p_report_type': report_type,
                'p_status': status,
                'p_date_range_start': date_range_start.date() if date_range_start else None,
                'p_date_range_end': date_range_end.date() if date_range_end else None,
                'p_search_query': search_query,
                'p_limit': limit,
                'p_offset': offset,
                'p_order_by': order_by,
                'p_order_direction': order_direction
            }

            # Call the get function
            result = await self._call_sql_function('get_ai_reports', params, access_token)
            
            reports = []
            if result.data:
                for data in result.data:
                    reports.append(AIReportResponse(
                        id=data['id'],
                        user_id=data['user_id'],
                        report_type=ReportType(data['report_type']),
                        title=data['title'],
                        content=data['content'],
                        content_preview=data.get('content_preview'),
                        insights=json.loads(data['insights']) if data['insights'] else None,
                        recommendations=json.loads(data['recommendations']) if data['recommendations'] else None,
                        metrics=json.loads(data['metrics']) if data['metrics'] else None,
                        date_range_start=datetime.fromisoformat(data['date_range_start']) if data['date_range_start'] else None,
                        date_range_end=datetime.fromisoformat(data['date_range_end']) if data['date_range_end'] else None,
                        model_used=data['model_used'],
                        processing_time_ms=data['processing_time_ms'],
                        confidence_score=data['confidence_score'],
                        status=ReportStatus(data['status']),
                        created_at=datetime.fromisoformat(data['created_at']),
                        updated_at=datetime.fromisoformat(data['updated_at'])
                    ))
            
            return reports

        except Exception as e:
            raise Exception(f"Error retrieving AI reports: {str(e)}")

    async def delete_report(self, report_id: str, access_token: str, soft_delete: bool = False) -> DeleteResponse:
        """Delete an AI report."""
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
                'p_report_id': report_id,
                'p_soft_delete': soft_delete
            }

            # Call the delete function
            result = await self._call_sql_function('delete_ai_report', params, access_token)
            
            if result.data and len(result.data) > 0:
                data = result.data[0]
                return DeleteResponse(
                    id=data['id'],
                    title=data['title'],
                    report_type=ReportType(data['report_type']),
                    deleted_at=datetime.fromisoformat(data['deleted_at']),
                    operation_type=data['operation_type']
                )
            else:
                raise Exception("Failed to delete report")

        except Exception as e:
            raise Exception(f"Error deleting AI report: {str(e)}")

    async def get_trading_context(self, access_token: str, time_range: str = "30d", 
                                custom_start_date: Optional[datetime] = None,
                                custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Get comprehensive trading context for AI processing."""
        try:
            # Get analytics data using existing service
            analytics_data = await self.analytics_service.get_daily_ai_summary(
                time_range, 
                custom_start_date.date() if custom_start_date else None,
                custom_end_date.date() if custom_end_date else None
            )
            
            # Get tracking data using existing service
            tracking_data = await self.trade_notes_service.get_tracking_summary(
                access_token,
                time_range=time_range,
                custom_start_date=custom_start_date.date() if custom_start_date else None,
                custom_end_date=custom_end_date.date() if custom_end_date else None
            )
            
            return {
                "analytics": analytics_data,
                "tracking": tracking_data,
                "timestamp": datetime.now().isoformat(),
                "time_range": time_range
            }

        except Exception as e:
            raise Exception(f"Error getting trading context: {str(e)}")
