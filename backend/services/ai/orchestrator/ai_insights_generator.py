from typing import Dict, Any, Optional, List
import logging
import json
from datetime import datetime, timedelta

from services.ai.ai_insights_service import AIInsightsService
from services.ai.ai_reports_service import AIReportsService
from models.ai_insights import AIInsightCreate, InsightType, InsightPriority
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)


class AIInsightsGenerator:
    """
    Handles AI insights generation including pattern recognition, risk analysis,
    and trading opportunities. Extracts actionable insights from trading data.
    """

    def __init__(self, llm_handler, auth_validator):
        self.llm_handler = llm_handler
        self.auth_validator = auth_validator
        self.insights_service = AIInsightsService()
        self.reports_service = AIReportsService()
        
        logger.info("AI Insights Generator initialized")

    async def generate_insights(self, user: Dict[str, Any], insight_types: List[InsightType],
                              time_range: str = "30d", min_confidence: float = 0.7) -> List[Dict[str, Any]]:
        """
        Generate AI insights based on trading data analysis.

        Args:
            user: User object with authentication information
            insight_types: Types of insights to generate
            time_range: Time range for analysis
            min_confidence: Minimum confidence threshold

        Returns:
            List of generated insights
        """
        user_id = self.auth_validator.extract_user_id(user)
        
        try:
            logger.info(f"Generating insights for user {user_id}", extra={
                "user_id": user_id,
                "insight_types": [it.value for it in insight_types],
                "time_range": time_range,
                "min_confidence": min_confidence
            })
            
            generated_insights = []

            # Validate authentication before proceeding
            if not self.auth_validator.validate_user_object(user):
                raise Exception("Invalid or expired authentication")

            # Check if LLM is available before proceeding
            if not self.llm_handler.is_available():
                raise Exception("LLM is not available. Please check your OPENROUTER_API_KEY and try again.")

            # Get trading context for analysis
            try:
                access_token = self.auth_validator.extract_access_token(user)
                trading_context = await self.reports_service.get_trading_context(
                    access_token, time_range
                )
                logger.debug("Trading context retrieved for insights", extra={
                    "user_id": user_id,
                    "context_keys": list(trading_context.keys()) if trading_context else []
                })
            except Exception as e:
                logger.error(f"Error getting trading context for insights: {str(e)}")
                trading_context = {"message": "No trading data available"}

            for insight_type in insight_types:
                try:
                    logger.debug(f"Generating {insight_type.value} insight", extra={
                        "user_id": user_id,
                        "insight_type": insight_type.value
                    })
                    
                    prompt_input = {
                        "trading_data": json.dumps(trading_context, indent=2),
                        "insight_type": insight_type.value
                    }

                    chain = self.llm_handler.trading_prompts["insight"] | self.llm_handler.llm | StrOutputParser()
                    insight_content = self.llm_handler.safe_chain_invoke(chain, prompt_input)
                    
                    # Extract content from AIMessage if needed
                    if hasattr(insight_content, 'content'):
                        insight_content = insight_content.content

                    # Extract actionable items from insight
                    actions = self._extract_actions_from_insight(insight_content)

                    # Determine priority based on insight type
                    priority = self._determine_insight_priority(insight_type, trading_context)

                    # Create insight record
                    insight_data = AIInsightCreate(
                        insight_type=insight_type,
                        title=f"{insight_type.value.title()} Analysis - {datetime.now().strftime('%Y-%m-%d')}",
                        description=insight_content,
                        data_source=trading_context,
                        confidence_score=min_confidence + 0.1,
                        priority=priority,
                        actionable=bool(actions),
                        actions=actions,
                        tags=[insight_type.value, "ai-generated", time_range],
                        valid_until=datetime.now() + timedelta(days=7),
                        model_used=self.llm_handler.model_manager.current_llm_model
                    )

                    # Save insight to database
                    try:
                        saved_insight = await self.insights_service.create_insight(insight_data, access_token)
                        generated_insights.append(saved_insight)
                        logger.info(f"Successfully generated {insight_type.value} insight", extra={
                            "user_id": user_id,
                            "insight_id": saved_insight.get("id") if isinstance(saved_insight, dict) else getattr(saved_insight, "id", None),
                            "priority": priority.value,
                            "actionable": bool(actions)
                        })
                    except Exception as e:
                        logger.error(f"Error saving insight: {str(e)}")
                        generated_insights.append({
                            "type": insight_type.value,
                            "content": insight_content,
                            "actions": actions,
                            "priority": priority.value
                        })
                        continue

                except Exception as e:
                    logger.error(f"Error generating {insight_type.value} insight: {str(e)}")
                    continue

            logger.info(f"Generated {len(generated_insights)} insights for user {user_id}")
            return generated_insights

        except Exception as e:
            logger.error(f"Error generating insights: {str(e)}", extra={
                "user_id": user_id,
                "error_type": type(e).__name__
            })
            raise Exception(f"Failed to generate insights: {str(e)}")

    def _extract_actions_from_insight(self, insight_content: str) -> Optional[Dict[str, Any]]:
        """Extract actionable items from insight content."""
        try:
            if not insight_content or not isinstance(insight_content, str):
                return None

            actions = {}
            content_lower = insight_content.lower()

            if 'reduce risk' in content_lower:
                actions['risk_management'] = 'Consider reducing position sizes'

            if 'increase' in content_lower and 'profit' in content_lower:
                actions['profit_optimization'] = 'Look for profit-taking opportunities'

            if 'pattern' in content_lower:
                actions['pattern_recognition'] = 'Monitor identified trading patterns'

            if 'stop loss' in content_lower:
                actions['risk_control'] = 'Review stop loss strategies'

            if 'diversif' in content_lower:
                actions['portfolio_management'] = 'Consider portfolio diversification'

            if 'entry' in content_lower and ('point' in content_lower or 'level' in content_lower):
                actions['entry_strategy'] = 'Analyze entry points and levels'

            if 'exit' in content_lower and ('strategy' in content_lower or 'point' in content_lower):
                actions['exit_strategy'] = 'Review exit strategies and timing'

            if 'volume' in content_lower and 'analysis' in content_lower:
                actions['volume_analysis'] = 'Monitor volume patterns and trends'

            if 'market' in content_lower and ('condition' in content_lower or 'trend' in content_lower):
                actions['market_analysis'] = 'Assess current market conditions'

            return actions if actions else None
            
        except Exception as e:
            logger.error(f"Error extracting actions from insight: {str(e)}")
            return None

    def _determine_insight_priority(self, insight_type: InsightType, trading_context: Dict[str, Any]) -> InsightPriority:
        """Determine insight priority based on type and trading context."""
        try:
            # Base priority on insight type
            if insight_type == InsightType.RISK:
                base_priority = InsightPriority.HIGH
            elif insight_type == InsightType.OPPORTUNITY:
                base_priority = InsightPriority.MEDIUM
            elif insight_type == InsightType.ALERT:
                base_priority = InsightPriority.CRITICAL
            else:
                base_priority = InsightPriority.MEDIUM

            # Adjust priority based on trading context
            analytics = trading_context.get('analytics', {})
            
            # If there are significant losses, increase priority for risk insights
            if analytics.get('total_pnl', 0) < -1000 and insight_type == InsightType.RISK:
                return InsightPriority.CRITICAL
            
            # If there are many recent trades, opportunity insights become more relevant
            if analytics.get('total_trades', 0) > 10 and insight_type == InsightType.OPPORTUNITY:
                return InsightPriority.HIGH
            
            return base_priority
            
        except Exception as e:
            logger.error(f"Error determining insight priority: {str(e)}")
            return InsightPriority.MEDIUM

    async def generate_risk_insights(self, user: Dict[str, Any], 
                                   time_range: str = "7d") -> Dict[str, Any]:
        """
        Generate specific risk analysis insights.
        
        Args:
            user: User object with authentication information
            time_range: Time range for risk analysis
            
        Returns:
            Dictionary containing risk insights and recommendations
        """
        user_id = self.auth_validator.extract_user_id(user)
        
        try:
            logger.info(f"Generating risk insights for user {user_id}", extra={
                "user_id": user_id,
                "time_range": time_range
            })

            risk_insights = await self.generate_insights(
                user, [InsightType.RISK], time_range, min_confidence=0.8
            )

            # Analyze risk patterns
            risk_analysis = await self._analyze_risk_patterns(user, time_range)

            return {
                "insights": risk_insights,
                "risk_analysis": risk_analysis,
                "time_range": time_range,
                "generated_at": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Error generating risk insights: {str(e)}", extra={
                "user_id": user_id,
                "error_type": type(e).__name__
            })
            raise Exception(f"Failed to generate risk insights: {str(e)}")

    async def _analyze_risk_patterns(self, user: Dict[str, Any], time_range: str) -> Dict[str, Any]:
        """Analyze risk patterns in trading data."""
        try:
            access_token = self.auth_validator.extract_access_token(user)
            trading_context = await self.reports_service.get_trading_context(
                access_token, time_range
            )

            analytics = trading_context.get('analytics', {})
            
            risk_factors = []
            risk_score = 0

            # Analyze win rate
            win_rate = analytics.get('win_rate', 0)
            if win_rate < 0.4:
                risk_factors.append("Low win rate indicates potential strategy issues")
                risk_score += 20

            # Analyze drawdown
            max_drawdown = analytics.get('max_drawdown', 0)
            if abs(max_drawdown) > 1000:
                risk_factors.append("High maximum drawdown detected")
                risk_score += 30

            # Analyze position sizing
            avg_position_size = analytics.get('avg_position_size', 0)
            if avg_position_size > 10000:
                risk_factors.append("Large average position sizes may indicate overexposure")
                risk_score += 15

            # Analyze trading frequency
            total_trades = analytics.get('total_trades', 0)
            if total_trades > 50:  # Assuming this is for a week
                risk_factors.append("High trading frequency may lead to overtrading")
                risk_score += 10

            return {
                "risk_score": min(risk_score, 100),  # Cap at 100
                "risk_level": self._categorize_risk_level(risk_score),
                "risk_factors": risk_factors,
                "recommendations": self._generate_risk_recommendations(risk_score, risk_factors)
            }

        except Exception as e:
            logger.error(f"Error analyzing risk patterns: {str(e)}")
            return {
                "risk_score": 50,
                "risk_level": "moderate",
                "risk_factors": ["Unable to analyze risk patterns"],
                "recommendations": ["Review trading strategy and risk management"]
            }

    def _categorize_risk_level(self, risk_score: int) -> str:
        """Categorize risk level based on score."""
        if risk_score >= 70:
            return "high"
        elif risk_score >= 40:
            return "moderate"
        else:
            return "low"

    def _generate_risk_recommendations(self, risk_score: int, risk_factors: List[str]) -> List[str]:
        """Generate risk management recommendations."""
        recommendations = []

        if risk_score >= 70:
            recommendations.extend([
                "Consider reducing position sizes immediately",
                "Implement stricter stop-loss orders",
                "Review and adjust trading strategy",
                "Consider taking a break from trading to reassess"
            ])
        elif risk_score >= 40:
            recommendations.extend([
                "Monitor risk exposure more closely",
                "Consider diversifying trading strategies",
                "Review position sizing rules",
                "Implement better risk-reward ratios"
            ])
        else:
            recommendations.extend([
                "Maintain current risk management practices",
                "Continue monitoring for changes",
                "Consider gradual position size increases if appropriate"
            ])

        return recommendations

    async def get_insights(self, user: Dict[str, Any], 
                         insight_type: Optional[str] = None,
                         limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Retrieve generated insights for a user.
        
        Args:
            user: User object with authentication information
            insight_type: Optional filter by insight type
            limit: Maximum number of insights to return
            offset: Offset for pagination
            
        Returns:
            List of insight dictionaries
        """
        user_id = self.auth_validator.extract_user_id(user)
        
        try:
            logger.info(f"Retrieving insights for user {user_id}", extra={
                "user_id": user_id,
                "insight_type": insight_type,
                "limit": limit,
                "offset": offset
            })

            # Validate authentication
            if not self.auth_validator.validate_user_object(user):
                raise Exception("Invalid or expired authentication")

            access_token = self.auth_validator.extract_access_token(user)
            insights = await self.insights_service.get_insights(
                access_token, insight_type, limit, offset
            )
            
            logger.info(f"Retrieved {len(insights)} insights for user {user_id}")
            return insights

        except Exception as e:
            logger.error(f"Error retrieving insights: {str(e)}", extra={
                "user_id": user_id,
                "error_type": type(e).__name__
            })
            raise Exception(f"Failed to retrieve insights: {str(e)}")

    def get_generator_status(self) -> Dict[str, Any]:
        """Get current status of the insights generator."""
        return {
            "llm_available": self.llm_handler.is_available(),
            "insights_service_available": bool(self.insights_service),
            "reports_service_available": bool(self.reports_service),
            "current_model": self.llm_handler.model_manager.current_llm_model,
            "supported_insight_types": [it.value for it in InsightType],
            "ready_for_generation": self.llm_handler.is_available() and bool(self.insights_service)
        }