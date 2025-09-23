"""
AI Reports Service
Handles AI reports operations using Data Access Layer
Decoupled from direct database operations
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
from models.ai_reports import (
    AIReportCreate, AIReportUpdate, AIReportInDB, AIReportResponse,
    AIReportUpsertResponse, DeleteResponse, ReportType, ReportStatus
)
from .dal.ai_reports_dal import AIReportsDAL
from services.analytics_service import AnalyticsService
from services.trade_notes_service import TradeNotesService
import asyncio
import logging
import uuid

class AIReportsService:
    """
    Service for handling AI reports operations.
    Integrates with existing analytics and follows established patterns.
    Focus on business logic, data access through DAL.
    """

    def __init__(self, dal: Optional[AIReportsDAL] = None, 
                 analytics_service: Optional[AnalyticsService] = None,
                 trade_notes_service: Optional[TradeNotesService] = None):
        self.dal = dal or AIReportsDAL()
        self.analytics_service = analytics_service or AnalyticsService()
        self.trade_notes_service = trade_notes_service or TradeNotesService()
        
        # Set up structured logging
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        self.logger.info("AIReportsService initialized successfully")

    async def create_report(self, report_data: AIReportCreate, access_token: str) -> AIReportUpsertResponse:
        """
        Create a new AI report.
        
        Args:
            report_data: Report data
            access_token: User authentication token
            
        Returns:
            AIReportUpsertResponse: Created report response
        """
        try:
            self.logger.info("Creating new AI report", extra={
                "report_type": report_data.report_type.value,
                "report_date": report_data.report_date.isoformat() if report_data.report_date else None,
                "title_length": len(report_data.title) if report_data.title else 0,
                "symbols_count": len(report_data.symbols_analyzed) if report_data.symbols_analyzed else 0
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Validate report data
            self._validate_report_data(report_data)
            
            # Create report through DAL
            result_data = await self.dal.create_report(report_data, user_id, access_token)
            
            if not result_data:
                raise Exception("Failed to create report - no data returned")
            
            # Convert to response model
            response = self._convert_to_upsert_response(result_data)
            
            self.logger.info("AI report created successfully", extra={
                "report_id": response.id,
                "report_type": response.report_type.value,
                "user_id": user_id
            })
            
            return response
            
        except Exception as e:
            self.logger.error(f"Error creating AI report: {str(e)}")
            raise Exception(f"Error creating AI report: {str(e)}")

    async def update_report(self, report_id: str, report_data: AIReportUpdate, access_token: str) -> AIReportUpsertResponse:
        """
        Update an existing AI report.
        
        Args:
            report_id: Report ID to update
            report_data: Update data
            access_token: User authentication token
            
        Returns:
            AIReportUpsertResponse: Updated report response
        """
        try:
            self.logger.info("Updating AI report", extra={
                "report_id": report_id,
                "has_content": bool(report_data.content),
                "status": report_data.status.value if report_data.status else None
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Update report through DAL
            result_data = await self.dal.update_report(report_id, report_data, user_id, access_token)
            
            if not result_data:
                raise Exception("Failed to update report - report not found or no access")
            
            # Convert to response model
            response = self._convert_to_upsert_response(result_data)
            
            self.logger.info("AI report updated successfully", extra={
                "report_id": report_id,
                "user_id": user_id
            })
            
            return response
            
        except Exception as e:
            self.logger.error(f"Error updating AI report {report_id}: {str(e)}")
            raise Exception(f"Error updating AI report: {str(e)}")

    async def get_reports(self, access_token: str, report_type: Optional[ReportType] = None,
                         status: Optional[ReportStatus] = None,
                         date_from: Optional[datetime] = None,
                         date_to: Optional[datetime] = None,
                         limit: int = 50) -> List[AIReportResponse]:
        """
        Get AI reports for a user with optional filtering.
        
        Args:
            access_token: User authentication token
            report_type: Optional report type filter
            status: Optional status filter
            date_from: Optional start date filter
            date_to: Optional end date filter
            limit: Limit on number of results
            
        Returns:
            List[AIReportResponse]: Reports
        """
        try:
            self.logger.info("Retrieving AI reports", extra={
                "report_type": report_type.value if report_type else None,
                "status": status.value if status else None,
                "date_from": date_from.isoformat() if date_from else None,
                "date_to": date_to.isoformat() if date_to else None,
                "limit": limit
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Get reports through DAL
            reports_data = await self.dal.get_reports(user_id, access_token, report_type, status, date_from, date_to, limit)
            
            # Convert to response models
            reports = [self._convert_to_report_response(data) for data in reports_data]
            
            self.logger.info("AI reports retrieved successfully", extra={
                "report_count": len(reports),
                "user_id": user_id
            })
            
            return reports
            
        except Exception as e:
            self.logger.error(f"Error retrieving AI reports: {str(e)}")
            raise Exception(f"Error retrieving AI reports: {str(e)}")

    async def get_report_by_id(self, report_id: str, access_token: str) -> Optional[AIReportResponse]:
        """
        Get a specific AI report by ID.
        
        Args:
            report_id: Report ID
            access_token: User authentication token
            
        Returns:
            Optional[AIReportResponse]: Report or None
        """
        try:
            self.logger.info("Retrieving AI report by ID", extra={
                "report_id": report_id
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Get report through DAL
            report_data = await self.dal.get_report_by_id(report_id, user_id, access_token)
            
            if not report_data:
                self.logger.warning("AI report not found", extra={
                    "report_id": report_id,
                    "user_id": user_id
                })
                return None
            
            # Convert to response model
            report = self._convert_to_report_response(report_data)
            
            self.logger.info("AI report retrieved successfully", extra={
                "report_id": report_id,
                "user_id": user_id
            })
            
            return report
            
        except Exception as e:
            self.logger.error(f"Error retrieving AI report {report_id}: {str(e)}")
            raise Exception(f"Error retrieving AI report: {str(e)}")

    async def delete_report(self, report_id: str, access_token: str) -> DeleteResponse:
        """
        Delete an AI report.
        
        Args:
            report_id: Report ID to delete
            access_token: User authentication token
            
        Returns:
            DeleteResponse: Deletion result
        """
        try:
            self.logger.info("Deleting AI report", extra={
                "report_id": report_id
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Delete report through DAL
            success = await self.dal.delete_report(report_id, user_id, access_token)
            
            if success:
                self.logger.info("AI report deleted successfully", extra={
                    "report_id": report_id,
                    "user_id": user_id
                })
                return DeleteResponse(
                    success=True,
                    message="Report deleted successfully"
                )
            else:
                raise Exception("Failed to delete report")
                
        except Exception as e:
            self.logger.error(f"Error deleting AI report {report_id}: {str(e)}")
            return DeleteResponse(
                success=False,
                message=f"Error deleting report: {str(e)}"
            )

    async def get_trading_context(self, access_token: str, time_range: str = "30d", custom_start_date: Optional[datetime] = None, custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Get trading context for AI processing.
        Combines data from multiple sources for comprehensive analysis.
        
        Args:
            access_token: User authentication token
            time_range: Time range for the analysis ('30d', '7d', 'all_time', etc.)
            custom_start_date: Optional custom start date
            custom_end_date: Optional custom end date
            
        Returns:
            Dict[str, Any]: Trading context data
        """
        try:
            self.logger.info("Getting trading context for AI processing", extra={
                "time_range": time_range,
                "custom_start_date": custom_start_date.isoformat() if custom_start_date else None,
                "custom_end_date": custom_end_date.isoformat() if custom_end_date else None
            })
            
            # Get user ID through DAL
            user_id = await self.dal.get_authenticated_user_id(access_token)
            
            # Get data from multiple sources in parallel
            # Use the provided time_range or convert custom dates
            summary_time_range = time_range
            if custom_start_date and custom_end_date:
                summary_time_range = 'custom'
            
            tasks = [
                self.dal.get_daily_ai_summary(user_id, access_token, summary_time_range, custom_start_date, custom_end_date),
                self._get_embeddings_based_trading_context(user_id, access_token, time_range, custom_start_date, custom_end_date)
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            daily_summary = results[0] if not isinstance(results[0], Exception) else {}
            embeddings_context = results[1] if not isinstance(results[1], Exception) else []
            
            context = {
                "daily_summary": daily_summary,
                "embeddings_context": embeddings_context,
                "trade_notes": embeddings_context,  # For backward compatibility
                "user_id": user_id,
                "time_range": time_range,
                "custom_start_date": custom_start_date.isoformat() if custom_start_date else None,
                "custom_end_date": custom_end_date.isoformat() if custom_end_date else None,
                "generated_at": datetime.utcnow().isoformat()
            }
            
            self.logger.info("Trading context retrieved successfully", extra={
                "context_keys": list(context.keys()),
                "embeddings_context_count": len(embeddings_context),
                "user_id": user_id
            })
            
            return context
            
        except Exception as e:
            self.logger.error(f"Error getting trading context: {str(e)}")
            raise Exception(f"Error getting trading context: {str(e)}")

    async def _get_embeddings_based_trading_context(self, user_id: str, access_token: str, time_range: str, 
                                                   custom_start_date: Optional[datetime] = None, 
                                                   custom_end_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Get enhanced trading context using embeddings."""
        try:
            # Check embeddings exist
            stats = await self.dal.get_trade_embeddings_stats(user_id, access_token)
            if not stats or stats.get('total_embeddings', 0) == 0:
                return await self.dal.get_trading_context(user_id, access_token)
            
            # Get from multiple sources
            all_context = []
            for source in ['stocks', 'options', 'trade_notes', 'notes']:
                embeddings = await self.dal.get_trade_embeddings_by_source(source, user_id, access_token)
                for emb in embeddings[:3]:  # Top 3 per source
                    all_context.append({
                        'content': emb.get('content_text', ''),
                        'symbol': emb.get('symbol'),
                        'trade_date': emb.get('trade_date'),
                        'source_table': source,
                        'metadata': emb.get('metadata', {}),
                        'relevance_score': emb.get('relevance_score', 0.0)
                    })
            
            return all_context[:15]
            
        except Exception as e:
            self.logger.warning(f"Embeddings failed: {str(e)}")
            return await self.dal.get_trading_context(user_id, access_token)

    def _validate_report_data(self, report_data: AIReportCreate):
        """Validate report data before processing."""
        if not report_data.title or not report_data.title.strip():
            raise ValueError("Report title cannot be empty")
        
        if not report_data.content or not report_data.content.strip():
            raise ValueError("Report content cannot be empty")
        
        if not report_data.report_type:
            raise ValueError("Report type is required")

    def _convert_to_upsert_response(self, data: Dict[str, Any]) -> AIReportUpsertResponse:
        """Convert database result to AIReportUpsertResponse."""
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
        
        return AIReportUpsertResponse(
            id=str(data.get('id')),
            user_id=str(data.get('user_id')),
            report_type=ReportType(data.get('report_type', 'daily')),
            title=data.get('title', ''),
            content=data.get('content', ''),
            insights=parse_json_field(data.get('insights')),
            recommendations=parse_json_field(data.get('recommendations')),
            metrics=parse_json_field(data.get('metrics')),
            date_range_start=data.get('date_range_start'),
            date_range_end=data.get('date_range_end'),
            model_used=data.get('model_used'),
            processing_time_ms=data.get('processing_time_ms'),
            confidence_score=data.get('confidence_score'),
            status=ReportStatus(data.get('status', 'completed')),
            created_at=data.get('created_at'),
            updated_at=data.get('updated_at'),
            operation_type=data.get('operation_type', 'created')
        )

    def _convert_to_report_response(self, data: Dict[str, Any]) -> AIReportResponse:
        """Convert database result to AIReportResponse."""
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
        
        return AIReportResponse(
            id=str(data.get('id')),
            user_id=str(data.get('user_id')),
            report_type=ReportType(data.get('report_type', 'daily')),
            title=data.get('title', ''),
            content=data.get('content', ''),
            insights=parse_json_field(data.get('insights')),
            recommendations=parse_json_field(data.get('recommendations')),
            metrics=parse_json_field(data.get('metrics')),
            report_date=data.get('report_date'),
            period_start=data.get('date_range_start'),
            period_end=data.get('date_range_end'), 
            date_range_start=data.get('date_range_start'),
            date_range_end=data.get('date_range_end'),
            symbols_analyzed=data.get('symbols_analyzed'),
            total_trades=data.get('total_trades'),
            total_pnl=data.get('total_pnl'),
            win_rate=data.get('win_rate'),
            generation_time_ms=data.get('processing_time_ms'),
            metadata=parse_json_field(data.get('metrics')),
            model_used=data.get('model_used'),
            confidence_score=data.get('confidence_score'),
            status=ReportStatus(data.get('status', 'completed')),
            processing_time_ms=data.get('processing_time_ms'),
            created_at=data.get('created_at'),
            updated_at=data.get('updated_at'),
            content_preview=data.get('content', '')[:200] if data.get('content') else None
        )
