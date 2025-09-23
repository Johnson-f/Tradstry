from typing import Dict, Any, Optional, List
import logging
import json
import asyncio
from datetime import datetime, timedelta

from models.ai_reports import ReportType, AIReportCreate
from services.ai.ai_reports_service import AIReportsService
from ..prompt_service import PromptService, PromptStrategy
from config.prompt_registry import PromptType, PromptVersion
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)


class AIReportGenerator:
    """
    Handles AI report generation including daily reports, performance summaries,
    and market analysis. Integrates with advanced prompt service and legacy fallbacks.
    """

    def __init__(self, llm_handler, auth_validator, prompt_service=None):
        self.llm_handler = llm_handler
        self.auth_validator = auth_validator
        self.reports_service = AIReportsService()

        # Initialize advanced prompt management
        try:
            logger.info("Initializing advanced prompt management for reports...")
            self.prompt_service = prompt_service or PromptService()
            self.prompt_enabled = True
            logger.info("Advanced prompt system initialized for reports")
        except Exception as e:
            logger.error(f"Report prompt system initialization failed: {str(e)}")
            self.prompt_service = None
            self.prompt_enabled = False
            logger.info("Continuing with legacy prompt system for reports")

        logger.info("AI Report Generator initialized")

    async def generate_daily_report(self, user: Dict[str, Any], time_range: str = "1d",
                                  custom_start_date: Optional[datetime] = None,
                                  custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Generate a comprehensive daily trading report using enhanced AI analysis with few-shot prompting.

        Args:
            user: User object with authentication information
            time_range: Time range for the report
            custom_start_date: Custom start date if time_range is 'custom'
            custom_end_date: Custom end date if time_range is 'custom'

        Returns:
            Dictionary containing the generated report and metadata
        """
        user_id = self.auth_validator.extract_user_id(user)

        try:
            logger.info(f"Starting daily report generation for user {user_id}", extra={
                "user_id": user_id,
                "time_range": time_range,
                "custom_start_date": custom_start_date,
                "custom_end_date": custom_end_date,
                "prompt_enabled": self.prompt_enabled
            })

            start_time = datetime.now()

            # Validate authentication before proceeding
            if not self.auth_validator.validate_user_object(user):
                raise Exception("Invalid or expired authentication")

            # Check if LLM is available before proceeding
            if not self.llm_handler.is_available():
                raise Exception("LLM is not available. Please check your OPENROUTER_API_KEY and try again.")

            # Get trading context data with error handling
            logger.debug("Fetching trading context data", extra={
                "user_id": user_id,
                "time_range": time_range
            })

            try:
                access_token = self.auth_validator.extract_access_token(user)
                trading_context = await self.reports_service.get_trading_context(
                    access_token, time_range, custom_start_date, custom_end_date
                )
                logger.debug("Trading context retrieved successfully", extra={
                    "user_id": user_id,
                    "context_keys": list(trading_context.keys()) if trading_context else [],
                    "analytics_available": "analytics" in (trading_context or {})
                })
            except Exception as e:
                logger.warning(f"Error getting trading context, using fallback: {str(e)}", extra={
                    "user_id": user_id,
                    "error_type": type(e).__name__
                })
                trading_context = {"message": "No trading data available", "analytics": {}}

            # Generate report using advanced prompt service or fallback
            if self.prompt_enabled and self.prompt_service:
                logger.info("Using advanced prompt service for report generation", extra={
                    "user_id": user_id,
                    "prompt_type": PromptType.DAILY_REPORT
                })

                try:
                    # Use advanced prompt service with few-shot learning
                    # Map trading context to expected prompt variables
                    daily_summary = trading_context.get('daily_summary', {})
                    trade_notes = trading_context.get('trade_notes', [])
                    
                    # Extract account metrics from daily summary
                    account_metrics = {
                        "balance": daily_summary.get('account_balance', 'N/A'),
                        "total_pnl": daily_summary.get('total_pnl', 'N/A'),
                        "win_rate": daily_summary.get('win_rate', 'N/A'),
                        "trade_count": daily_summary.get('trade_count', 'N/A'),
                        "avg_win": daily_summary.get('avg_win', 'N/A'),
                        "avg_loss": daily_summary.get('avg_loss', 'N/A')
                    }
                    
                    # Extract position data from trade notes and daily summary
                    position_data = {
                        "open_positions": daily_summary.get('open_positions', []),
                        "recent_trades": trade_notes[:10] if trade_notes else [],
                        "position_count": len(daily_summary.get('open_positions', [])),
                        "total_exposure": daily_summary.get('total_exposure', 'N/A')
                    }
                    
                    input_data = {
                        "trading_data": json.dumps(trading_context, indent=2),
                        "account_metrics": json.dumps(account_metrics, indent=2),
                        "position_data": json.dumps(position_data, indent=2),
                        "date_range": f"{custom_start_date or 'N/A'} to {custom_end_date or 'N/A'}"
                    }

                    execution_result = await self.prompt_service.execute_prompt(
                        prompt_type=PromptType.DAILY_REPORT,
                        input_data=input_data,
                        llm=self.llm_handler.llm,
                        strategy=PromptStrategy.ADAPTIVE,
                        user_id=user_id
                    )

                    if execution_result.success:
                        report_content = execution_result.content
                        logger.info("Advanced prompt execution successful", extra={
                            "user_id": user_id,
                            "version_used": execution_result.version_used,
                            "processing_time_ms": execution_result.processing_time_ms,
                            "confidence_score": execution_result.confidence_score
                        })
                    else:
                        raise Exception(f"Prompt execution failed: {execution_result.error_message}")

                except Exception as prompt_error:
                    logger.error(f"Advanced prompt service failed, falling back to legacy: {str(prompt_error)}", extra={
                        "user_id": user_id,
                        "error_type": type(prompt_error).__name__
                    })
                    # Fallback to legacy approach
                    report_content = await self._generate_report_legacy(trading_context, custom_start_date, custom_end_date)
            else:
                logger.info("Using legacy prompt system for report generation", extra={
                    "user_id": user_id,
                    "reason": "prompt_service_unavailable"
                })
                report_content = await self._generate_report_legacy(trading_context, custom_start_date, custom_end_date)

            # Calculate processing time
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

            # Ensure report_content is a string (following validation fix from memory)
            if hasattr(report_content, 'content'):
                report_content = report_content.content
            elif not isinstance(report_content, str):
                report_content = str(report_content)

            logger.debug("Report content validated successfully", extra={
                "user_id": user_id,
                "content_length": len(report_content),
                "is_string": isinstance(report_content, str)
            })

            # Extract insights and recommendations from the report
            insights, recommendations = self._extract_insights_and_recommendations(report_content)

            # Create report record
            report_data = AIReportCreate(
                report_type=ReportType.DAILY,
                title=f"Daily Trading Report - {datetime.now().strftime('%Y-%m-%d')}",
                content=report_content,
                insights=insights,
                recommendations=recommendations,
                metrics=trading_context.get('analytics', {}),
                date_range_start=custom_start_date,
                date_range_end=custom_end_date,
                model_used=self.llm_handler.model_manager.current_llm_model,
                confidence_score=0.85
            )

            # Save report to database
            try:
                access_token = self.auth_validator.extract_access_token(user)
                saved_report = await self.reports_service.create_report(report_data, access_token)
                logger.info("Report saved successfully", extra={
                    "user_id": user_id,
                    "report_id": saved_report.get("id") if isinstance(saved_report, dict) else getattr(saved_report, "id", None)
                })
            except Exception as e:
                logger.error(f"Error saving report: {str(e)}")
                # Return generated content even if saving fails
                saved_report = {
                    "content": report_content,
                    "title": report_data.title,
                    "insights": insights,
                    "recommendations": recommendations
                }

            return {
                "report": saved_report,
                "processing_time_ms": processing_time,
                "trading_context": trading_context
            }

        except Exception as e:
            logger.error(f"Error generating daily report: {str(e)}", extra={
                "user_id": user_id,
                "error_type": type(e).__name__
            })
            raise Exception(f"Failed to generate daily report: {str(e)}")

    async def _generate_report_legacy(self, trading_context: Dict[str, Any],
                                    custom_start_date: Optional[datetime] = None,
                                    custom_end_date: Optional[datetime] = None) -> str:
        """Generate report using legacy prompt system as fallback."""
        try:
            chain = self.llm_handler.trading_prompts["daily_report"] | self.llm_handler.llm | StrOutputParser()

            report_content = self.llm_handler.safe_chain_invoke(chain, {
                "trading_data": json.dumps(trading_context, indent=2),
                "date_range": f"{custom_start_date or 'N/A'} to {custom_end_date or 'N/A'}"
            })

            return report_content

        except Exception as llm_error:
            logger.error(f"Legacy LLM generation failed: {str(llm_error)}")
            return self.llm_handler.get_fallback_response({
                "trading_data": trading_context,
                "date_range": f"{custom_start_date or 'N/A'} to {custom_end_date or 'N/A'}"
            })

    def _extract_insights_and_recommendations(self, report_content: str) -> tuple:
        """Extract structured insights and recommendations from report content."""
        insights_list = []
        recommendations_list = []

        try:
            if not report_content or not isinstance(report_content, str):
                return {}, {}

            lines = report_content.split('\n')
            current_section = None

            for line in lines:
                line = line.strip()
                if not line:
                    continue

                # Section detection
                if any(keyword in line.lower() for keyword in ['insight', 'pattern', 'observation']):
                    current_section = 'insights'
                elif any(keyword in line.lower() for keyword in ['recommend', 'suggest', 'should', 'consider']):
                    current_section = 'recommendations'
                elif line and current_section == 'insights' and not line.startswith('#'):
                    insights_list.append(line)
                elif line and current_section == 'recommendations' and not line.startswith('#'):
                    recommendations_list.append(line)

        except Exception as e:
            logger.error(f"Error extracting insights and recommendations: {str(e)}")

        # Convert lists to dictionaries as expected by the Pydantic model
        insights_dict = {
            "items": insights_list[:5],
            "count": len(insights_list[:5]),
            "extracted_at": datetime.now().isoformat()
        }

        recommendations_dict = {
            "items": recommendations_list[:5],
            "count": len(recommendations_list[:5]),
            "extracted_at": datetime.now().isoformat()
        }

        return insights_dict, recommendations_dict

    async def generate_performance_summary(self, user: Dict[str, Any],
                                         time_range: str = "30d") -> Dict[str, Any]:
        """
        Generate a performance summary report for the specified time range.

        Args:
            user: User object with authentication information
            time_range: Time range for analysis

        Returns:
            Dictionary containing the performance summary
        """
        user_id = self.auth_validator.extract_user_id(user)

        try:
            logger.info(f"Generating performance summary for user {user_id}", extra={
                "user_id": user_id,
                "time_range": time_range
            })

            # Validate authentication
            if not self.auth_validator.validate_user_object(user):
                raise Exception("Invalid or expired authentication")

            # Get trading context
            access_token = self.auth_validator.extract_access_token(user)
            trading_context = await self.reports_service.get_trading_context(
                access_token, time_range
            )

            # Generate performance summary using appropriate prompt
            if self.prompt_enabled and self.prompt_service:
                input_data = {
                    "trading_data": json.dumps(trading_context, indent=2),
                    "time_range": time_range
                }

                execution_result = await self.prompt_service.execute_prompt(
                    prompt_type=PromptType.PERFORMANCE_SUMMARY,
                    input_data=input_data,
                    llm=self.llm_handler.llm,
                    strategy=PromptStrategy.BEST_PERFORMANCE,
                    user_id=user_id
                )

                if execution_result.success:
                    summary_content = execution_result.content
                else:
                    raise Exception(f"Performance summary generation failed: {execution_result.error_message}")
            else:
                # Fallback to manual generation
                summary_content = await self._generate_performance_summary_legacy(trading_context, time_range)

            return {
                "summary": summary_content,
                "time_range": time_range,
                "generated_at": datetime.now().isoformat(),
                "model_used": self.llm_handler.model_manager.current_llm_model
            }

        except Exception as e:
            logger.error(f"Error generating performance summary: {str(e)}", extra={
                "user_id": user_id,
                "error_type": type(e).__name__
            })
            raise Exception(f"Failed to generate performance summary: {str(e)}")

    async def _generate_performance_summary_legacy(self, trading_context: Dict[str, Any],
                                                 time_range: str) -> str:
        """Generate performance summary using legacy approach."""
        try:
            # Create a basic performance summary prompt
            prompt_text = f"""
            Analyze the following trading data and provide a comprehensive performance summary for the {time_range} period:

            Trading Data:
            {json.dumps(trading_context, indent=2)}

            Please provide:
            1. Overall Performance Metrics
            2. Profitability Analysis
            3. Risk Assessment
            4. Trading Patterns
            5. Areas for Improvement

            Format as a clear, structured summary with specific metrics and insights.
            """

            response = self.llm_handler.llm.invoke(prompt_text)
            return response.content if hasattr(response, 'content') else str(response)

        except Exception as e:
            logger.error(f"Legacy performance summary generation failed: {str(e)}")
            return f"Performance summary for {time_range}: Unable to generate detailed analysis due to technical issues. Please review your trading metrics manually."

    async def get_reports(self, user: Dict[str, Any],
                         report_type: Optional[str] = None,
                         limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Retrieve generated reports for a user.

        Args:
            user: User object with authentication information
            report_type: Optional filter by report type
            limit: Maximum number of reports to return
            offset: Offset for pagination

        Returns:
            List of report dictionaries
        """
        user_id = self.auth_validator.extract_user_id(user)

        try:
            logger.info(f"Retrieving reports for user {user_id}", extra={
                "user_id": user_id,
                "report_type": report_type,
                "limit": limit,
                "offset": offset
            })

            # Validate authentication
            if not self.auth_validator.validate_user_object(user):
                raise Exception("Invalid or expired authentication")

            access_token = self.auth_validator.extract_access_token(user)
            reports = await self.reports_service.get_reports(
                access_token, report_type, limit, offset
            )

            logger.info(f"Retrieved {len(reports)} reports for user {user_id}")
            return reports

        except Exception as e:
            logger.error(f"Error retrieving reports: {str(e)}", extra={
                "user_id": user_id,
                "error_type": type(e).__name__
            })
            raise Exception(f"Failed to retrieve reports: {str(e)}")

    def get_generator_status(self) -> Dict[str, Any]:
        """Get current status of the report generator."""
        return {
            "llm_available": self.llm_handler.is_available(),
            "prompt_service_enabled": self.prompt_enabled,
            "reports_service_available": bool(self.reports_service),
            "current_model": self.llm_handler.model_manager.current_llm_model,
            "ready_for_generation": self.llm_handler.is_available() and bool(self.reports_service)
        }
