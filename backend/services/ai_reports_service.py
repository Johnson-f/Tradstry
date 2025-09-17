from typing import Dict, Any, Optional, List
from supabase import Client
from database import get_supabase
from datetime import datetime
from auth_service import AuthService
from services.analytics_service import AnalyticsService
from services.trade_notes_service import TradeNotesService
import asyncio
import logging
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
        
        # Set up structured logging
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        self.logger.info("AIReportsService initialized successfully")

    async def _call_sql_function(self, function_name: str, params: Dict[str, Any], access_token: str) -> Any:
        """Helper method to call SQL functions with authentication."""
        try:
            self.logger.debug(f"Calling SQL function: {function_name}", extra={
                "function_name": function_name,
                "param_count": len(params),
                "has_access_token": bool(access_token)
            })
            
            result = await self.auth_service.safe_rpc_call(function_name, params, access_token)
            
            self.logger.debug(f"SQL function {function_name} completed successfully", extra={
                "function_name": function_name,
                "result_type": type(result).__name__,
                "has_data": hasattr(result, 'data') and bool(result.data)
            })
            
            return result
        except Exception as e:
            self.logger.error(f"Database operation failed for {function_name}", extra={
                "function_name": function_name,
                "error_type": type(e).__name__,
                "error_message": str(e),
                "param_count": len(params)
            })
            raise Exception(f"Database operation failed: {str(e)}")

    async def create_report(self, report_data: AIReportCreate, access_token: str) -> AIReportUpsertResponse:
        """Create a new AI report."""
        self.logger.info("Creating new AI report", extra={
            "report_type": report_data.report_type.value,
            "title": report_data.title,
            "model_used": report_data.model_used,
            "status": report_data.status.value,
            "has_date_range": bool(report_data.date_range_start or report_data.date_range_end)
        })
        
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)

            # Get user from token
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                self.logger.error("Authentication failed: Invalid token provided")
                raise Exception("Invalid authentication token")

            user_id = user_response.user.id
            self.logger.debug(f"Authenticated user for report creation", extra={
                "user_id": user_id,
                "report_type": report_data.report_type.value
            })

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
                self.logger.info("AI report created successfully", extra={
                    "report_id": data['id'],
                    "user_id": user_id,
                    "report_type": report_data.report_type.value,
                    "operation_type": data.get('operation_type', 'create')
                })
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
                self.logger.error("Report creation failed: No data returned from database", extra={
                    "user_id": user_id,
                    "report_type": report_data.report_type.value
                })
                raise Exception("Failed to create report")

        except Exception as e:
            self.logger.error("Error creating AI report", extra={
                "error_type": type(e).__name__,
                "error_message": str(e),
                "report_type": report_data.report_type.value,
                "title": report_data.title
            })
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
        self.logger.info("Retrieving AI reports", extra={
            "report_id": report_id,
            "report_type": report_type,
            "status": status,
            "has_search_query": bool(search_query),
            "limit": limit,
            "offset": offset,
            "order_by": order_by,
            "order_direction": order_direction,
            "has_date_filter": bool(date_range_start or date_range_end)
        })
        
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
                self.logger.debug(f"Retrieved {len(result.data)} reports from database", extra={
                    "user_id": user_id,
                    "result_count": len(result.data),
                    "limit": limit,
                    "offset": offset
                })
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

            self.logger.info("AI reports retrieval completed", extra={
                "user_id": user_id,
                "reports_returned": len(reports),
                "limit": limit,
                "offset": offset,
                "has_filters": bool(report_id or report_type or status or search_query)
            })
            return reports

        except Exception as e:
            self.logger.error("Error retrieving AI reports", extra={
                "error_type": type(e).__name__,
                "error_message": str(e),
                "limit": limit,
                "offset": offset,
                "filters": {
                    "report_id": report_id,
                    "report_type": report_type,
                    "status": status,
                    "search_query": bool(search_query)
                }
            })
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
        self.logger.info("Getting trading context for AI processing", extra={
            "time_range": time_range,
            "has_custom_start": custom_start_date is not None,
            "has_custom_end": custom_end_date is not None,
            "custom_start_date": custom_start_date.isoformat() if custom_start_date else None,
            "custom_end_date": custom_end_date.isoformat() if custom_end_date else None
        })
        
        try:
            # Run independent I/O operations in parallel using asyncio.gather
            # This improves performance by executing both API calls concurrently
            self.logger.debug("Starting parallel data retrieval for trading context", extra={
                "operations": ["analytics_service.get_daily_ai_summary", "trade_notes_service.get_tracking_summary"],
                "time_range": time_range
            })
            
            start_time = datetime.now()
            
            analytics_data, tracking_data = await asyncio.gather(
                # Get analytics data using existing service
                self.analytics_service.get_daily_ai_summary(
                    access_token,
                    time_range,
                    custom_start_date.date() if custom_start_date else None,
                    custom_end_date.date() if custom_end_date else None
                ),
                # Get tracking data using existing service
                self.trade_notes_service.get_tracking_summary(
                    access_token,
                    time_range=time_range,
                    custom_start_date=custom_start_date.date() if custom_start_date else None,
                    custom_end_date=custom_end_date.date() if custom_end_date else None
                )
            )
            
            end_time = datetime.now()
            processing_time_ms = (end_time - start_time).total_seconds() * 1000
            
            self.logger.info("Trading context retrieved successfully", extra={
                "time_range": time_range,
                "processing_time_ms": round(processing_time_ms, 2),
                "has_analytics_data": analytics_data is not None,
                "has_tracking_data": tracking_data is not None,
                "analytics_data_type": type(analytics_data).__name__ if analytics_data else None,
                "tracking_data_type": type(tracking_data).__name__ if tracking_data else None
            })

            return {
                "analytics": analytics_data,
                "tracking": tracking_data,
                "timestamp": datetime.now().isoformat(),
                "time_range": time_range
            }

        except Exception as e:
            self.logger.error("Error getting trading context", extra={
                "error_type": type(e).__name__,
                "error_message": str(e),
                "time_range": time_range,
                "has_custom_dates": bool(custom_start_date or custom_end_date)
            })
            raise Exception(f"Error getting trading context: {str(e)}")
