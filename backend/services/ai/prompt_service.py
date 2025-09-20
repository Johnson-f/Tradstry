"""
Advanced Prompt Management Service for Tradistry AI System

This service provides dynamic prompt composition, A/B testing capabilities,
and performance tracking for the prompt registry system.
"""

import json
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from enum import Enum

from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

from config.prompt_registry import (
    PromptRegistry, PromptType, PromptVersion, FewShotExample, 
    get_prompt_registry
)

logger = logging.getLogger(__name__)


class PromptStrategy(str, Enum):
    """Strategies for prompt selection and composition."""
    LATEST_VERSION = "latest_version"
    BEST_PERFORMANCE = "best_performance"
    A_B_TEST = "a_b_test"
    ADAPTIVE = "adaptive"


@dataclass
class PromptExecutionResult:
    """Result of prompt execution with metadata."""
    content: str
    prompt_type: PromptType
    version_used: PromptVersion
    processing_time_ms: float
    success: bool
    error_message: Optional[str] = None
    confidence_score: float = 0.0
    metadata: Dict[str, Any] = None


class PromptService:
    """
    Service for managing prompt execution, composition, and optimization.
    
    Features:
    - Dynamic prompt selection based on performance metrics
    - A/B testing framework for prompt optimization
    - Context-aware prompt composition
    - Performance tracking and analytics
    """
    
    def __init__(self):
        self.registry = get_prompt_registry()
        self.execution_history: List[PromptExecutionResult] = []
        self._a_b_test_assignments: Dict[str, PromptVersion] = {}
        logger.info("Prompt service initialized with advanced composition capabilities")
    
    async def execute_prompt(
        self,
        prompt_type: PromptType,
        input_data: Dict[str, Any],
        llm,
        strategy: PromptStrategy = PromptStrategy.BEST_PERFORMANCE,
        user_id: Optional[str] = None
    ) -> PromptExecutionResult:
        """
        Execute a prompt with advanced selection strategy.
        
        Args:
            prompt_type: Type of prompt to execute
            input_data: Data to fill prompt template
            llm: Language model to use for generation
            strategy: Strategy for prompt selection
            user_id: User identifier for A/B testing
            
        Returns:
            PromptExecutionResult with content and metadata
        """
        start_time = datetime.now()
        
        try:
            # Select prompt version based on strategy
            version = self._select_prompt_version(prompt_type, strategy, user_id)
            if not version:
                raise Exception(f"No suitable version found for {prompt_type}")
            
            # Get prompt template
            prompt_template = self.registry.get_prompt(prompt_type, version)
            if not prompt_template:
                raise Exception(f"Failed to get prompt template for {prompt_type} {version}")
            
            # Enhance input data with dynamic context
            enhanced_input = await self._enhance_input_data(prompt_type, input_data)
            
            # Execute prompt
            chain = prompt_template | llm | StrOutputParser()
            result = chain.invoke(enhanced_input)
            
            # Extract content from result
            content = result.content if hasattr(result, 'content') else str(result)
            
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            
            # Create execution result
            execution_result = PromptExecutionResult(
                content=content,
                prompt_type=prompt_type,
                version_used=version,
                processing_time_ms=processing_time,
                success=True,
                confidence_score=self._calculate_confidence_score(content, prompt_type),
                metadata={
                    "input_variables": list(enhanced_input.keys()),
                    "template_length": len(prompt_template.template),
                    "strategy_used": strategy,
                    "user_id": user_id
                }
            )
            
            # Update performance metrics
            self.registry.update_prompt_performance(
                prompt_type, version, True, processing_time
            )
            
            # Store execution history
            self.execution_history.append(execution_result)
            
            logger.info(f"Prompt executed successfully: {prompt_type} {version} ({processing_time:.2f}ms)")
            return execution_result
            
        except Exception as e:
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            
            execution_result = PromptExecutionResult(
                content="",
                prompt_type=prompt_type,
                version_used=version if 'version' in locals() else PromptVersion.V1_BASELINE,
                processing_time_ms=processing_time,
                success=False,
                error_message=str(e)
            )
            
            # Update performance metrics for failure
            if 'version' in locals():
                self.registry.update_prompt_performance(
                    prompt_type, version, False, processing_time
                )
            
            logger.error(f"Prompt execution failed: {prompt_type} - {str(e)}")
            return execution_result
    
    async def execute_prompt_stream(
        self,
        prompt_type: PromptType,
        input_data: Dict[str, Any],
        llm,
        strategy: PromptStrategy = PromptStrategy.BEST_PERFORMANCE,
        user_id: Optional[str] = None
    ):
        """
        Execute a prompt with streaming response support.
        
        Args:
            prompt_type: Type of prompt to execute
            input_data: Data to fill prompt template
            llm: Language model to use for generation
            strategy: Strategy for prompt selection
            user_id: User identifier for A/B testing
            
        Yields:
            Stream of token chunks as they're generated
        """
        start_time = datetime.now()
        full_response = ""
        
        try:
            # Select prompt version based on strategy
            version = self._select_prompt_version(prompt_type, strategy, user_id)
            if not version:
                yield {
                    "type": "error",
                    "message": f"No suitable version found for {prompt_type}"
                }
                return
            
            # Get prompt template
            prompt_template = self.registry.get_prompt(prompt_type, version)
            if not prompt_template:
                yield {
                    "type": "error", 
                    "message": f"Failed to get prompt template for {prompt_type} {version}"
                }
                return
            
            # Enhance input data with dynamic context
            enhanced_input = await self._enhance_input_data(prompt_type, input_data)
            
            # Format the prompt
            formatted_prompt = prompt_template.format(**enhanced_input)
            
            # Stream response from LLM
            async for chunk in llm.astream(formatted_prompt):
                if hasattr(chunk, 'content') and chunk.content:
                    full_response += chunk.content
                    yield {
                        "type": "token",
                        "content": chunk.content
                    }
            
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            
            # Update performance metrics for success
            self.registry.update_prompt_performance(
                prompt_type, version, True, processing_time
            )
            
            # Create execution result for history
            execution_result = PromptExecutionResult(
                content=full_response,
                prompt_type=prompt_type,
                version_used=version,
                processing_time_ms=processing_time,
                success=True,
                confidence_score=self._calculate_confidence_score(full_response, prompt_type),
                metadata={
                    "input_variables": list(enhanced_input.keys()),
                    "template_length": len(prompt_template.template),
                    "strategy_used": strategy,
                    "user_id": user_id,
                    "streaming": True
                }
            )
            
            # Store execution history
            self.execution_history.append(execution_result)
            
            # Yield completion signal
            yield {
                "type": "done",
                "message": "Streaming complete",
                "metadata": {
                    "version_used": version.value,
                    "processing_time_ms": processing_time,
                    "confidence_score": execution_result.confidence_score
                }
            }
            
            logger.info(f"Streaming prompt executed successfully: {prompt_type} {version} ({processing_time:.2f}ms)")
            
        except Exception as e:
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            
            # Update performance metrics for failure
            if 'version' in locals():
                self.registry.update_prompt_performance(
                    prompt_type, version, False, processing_time
                )
            
            logger.error(f"Streaming prompt execution failed: {prompt_type} - {str(e)}")
            yield {
                "type": "error",
                "message": f"Streaming execution failed: {str(e)}"
            }
    
    def _select_prompt_version(
        self,
        prompt_type: PromptType,
        strategy: PromptStrategy,
        user_id: Optional[str] = None
    ) -> Optional[PromptVersion]:
        """Select prompt version based on strategy."""
        
        if prompt_type not in self.registry.prompts:
            return None
        
        versions = self.registry.prompts[prompt_type]
        active_versions = {v: c for v, c in versions.items() if c.active}
        
        if not active_versions:
            return None
        
        if strategy == PromptStrategy.LATEST_VERSION:
            return max(active_versions.keys(), key=lambda x: x.value)
        
        elif strategy == PromptStrategy.BEST_PERFORMANCE:
            return self._get_best_performing_version(active_versions)
        
        elif strategy == PromptStrategy.A_B_TEST and user_id:
            return self._get_a_b_test_version(prompt_type, user_id, active_versions)
        
        elif strategy == PromptStrategy.ADAPTIVE:
            return self._get_adaptive_version(active_versions)
        
        # Fallback to latest version
        return max(active_versions.keys(), key=lambda x: x.value)
    
    def _get_best_performing_version(self, versions: Dict[PromptVersion, Any]) -> PromptVersion:
        """Get the best performing version based on success rate and processing time."""
        best_version = None
        best_score = -1.0
        
        for version, config in versions.items():
            if config.metadata and config.metadata.usage_count > 0:
                # Composite score: success rate weighted by usage, penalized by processing time
                usage_weight = min(config.metadata.usage_count / 10.0, 1.0)
                time_penalty = max(0, (config.metadata.avg_processing_time - 1000) / 5000)  # Penalty after 1 second
                score = (config.metadata.success_rate * usage_weight) - time_penalty
                
                if score > best_score:
                    best_score = score
                    best_version = version
        
        return best_version or max(versions.keys(), key=lambda x: x.value)
    
    def _get_a_b_test_version(
        self,
        prompt_type: PromptType,
        user_id: str,
        versions: Dict[PromptVersion, Any]
    ) -> PromptVersion:
        """Get version for A/B testing with consistent user assignment."""
        test_key = f"{user_id}_{prompt_type}"
        
        if test_key not in self._a_b_test_assignments:
            # Assign user to a version based on hash for consistency
            available_versions = list(versions.keys())
            if len(available_versions) >= 2:
                # Use simple hash-based assignment
                hash_value = hash(test_key) % len(available_versions)
                self._a_b_test_assignments[test_key] = available_versions[hash_value]
            else:
                self._a_b_test_assignments[test_key] = available_versions[0]
        
        return self._a_b_test_assignments[test_key]
    
    def _get_adaptive_version(self, versions: Dict[PromptVersion, Any]) -> PromptVersion:
        """Get version using adaptive selection based on recent performance."""
        # Weight recent performance more heavily
        recent_cutoff = datetime.now() - timedelta(hours=24)
        recent_executions = [
            result for result in self.execution_history[-100:]  # Last 100 executions
            if result.processing_time_ms > 0  # Valid executions
        ]
        
        if not recent_executions:
            return max(versions.keys(), key=lambda x: x.value)
        
        # Calculate adaptive scores
        version_scores = {}
        for version in versions.keys():
            recent_version_results = [
                r for r in recent_executions if r.version_used == version
            ]
            
            if recent_version_results:
                success_rate = sum(1 for r in recent_version_results if r.success) / len(recent_version_results)
                avg_time = sum(r.processing_time_ms for r in recent_version_results) / len(recent_version_results)
                avg_confidence = sum(r.confidence_score for r in recent_version_results) / len(recent_version_results)
                
                # Adaptive score combines multiple factors
                version_scores[version] = (success_rate * 0.4) + (avg_confidence * 0.4) + (max(0, 1 - avg_time/5000) * 0.2)
            else:
                version_scores[version] = 0.5  # Neutral score for untested versions
        
        return max(version_scores, key=version_scores.get)
    
    async def _enhance_input_data(self, prompt_type: PromptType, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Enhance input data with dynamic context and few-shot examples."""
        enhanced_data = input_data.copy()
        
        # Add few-shot examples if template expects them
        examples = self.registry.get_few_shot_examples(prompt_type, limit=2)
        for i, example in enumerate(examples, 1):
            enhanced_data[f"example_{i}"] = example.expected_output
        
        # Add contextual enhancements based on prompt type
        if prompt_type == PromptType.DAILY_REPORT:
            enhanced_data = await self._enhance_daily_report_context(enhanced_data)
        elif prompt_type == PromptType.CHAT:
            enhanced_data = await self._enhance_chat_context(enhanced_data)
        elif prompt_type == PromptType.INSIGHT:
            enhanced_data = await self._enhance_insight_context(enhanced_data)
        
        return enhanced_data
    
    async def _enhance_daily_report_context(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Add contextual information for daily reports."""
        enhanced = data.copy()
        
        # Add market context indicators
        enhanced["market_session"] = self._get_market_session()
        enhanced["volatility_context"] = self._get_volatility_context()
        
        # Add performance benchmarks if trading data available
        if "trading_data" in enhanced:
            enhanced["benchmark_comparison"] = self._calculate_benchmark_comparison(enhanced["trading_data"])
        
        return enhanced
    
    async def _enhance_chat_context(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Add contextual information for chat responses."""
        enhanced = data.copy()
        
        # Add conversational context
        enhanced["time_of_day"] = datetime.now().strftime("%H:%M")
        enhanced["user_sentiment"] = self._analyze_user_sentiment(data.get("question", ""))
        
        return enhanced
    
    async def _enhance_insight_context(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Add contextual information for insight generation."""
        enhanced = data.copy()
        
        # Add statistical context
        enhanced["sample_size_guidance"] = self._get_sample_size_guidance(data.get("trading_data", {}))
        enhanced["statistical_significance"] = self._calculate_statistical_significance(data.get("trading_data", {}))
        
        return enhanced
    
    def _get_market_session(self) -> str:
        """Get current market session context."""
        current_hour = datetime.now().hour
        if 9 <= current_hour < 16:
            return "market_open"
        elif 16 <= current_hour < 20:
            return "after_hours"
        else:
            return "pre_market"
    
    def _get_volatility_context(self) -> str:
        """Get general volatility context (placeholder for real implementation)."""
        return "moderate"  # In real implementation, this would fetch VIX or calculate rolling volatility
    
    def _calculate_benchmark_comparison(self, trading_data: Any) -> Dict[str, Any]:
        """Calculate benchmark comparison metrics (placeholder)."""
        return {
            "vs_spy": "outperforming",
            "vs_sector": "inline",
            "risk_adjusted": "strong"
        }
    
    def _analyze_user_sentiment(self, question: str) -> str:
        """Analyze user sentiment from question text."""
        negative_words = ["discouraged", "worried", "frustrated", "losing", "bad", "terrible", "awful"]
        positive_words = ["excited", "happy", "great", "excellent", "good", "profitable", "winning"]
        
        question_lower = question.lower()
        negative_count = sum(1 for word in negative_words if word in question_lower)
        positive_count = sum(1 for word in positive_words if word in question_lower)
        
        if negative_count > positive_count:
            return "negative"
        elif positive_count > negative_count:
            return "positive"
        else:
            return "neutral"
    
    def _get_sample_size_guidance(self, trading_data: Any) -> str:
        """Provide guidance on statistical sample size."""
        # This is a placeholder - real implementation would analyze actual trade counts
        return "sufficient for analysis"
    
    def _calculate_statistical_significance(self, trading_data: Any) -> float:
        """Calculate statistical significance of patterns (placeholder)."""
        return 0.85  # Placeholder confidence level
    
    def _calculate_confidence_score(self, content: str, prompt_type: PromptType) -> float:
        """Calculate confidence score based on content quality indicators."""
        if not content:
            return 0.0
        
        # Basic quality indicators
        score = 0.5  # Base score
        
        # Length indicators
        if len(content) > 100:
            score += 0.1
        if len(content) > 500:
            score += 0.1
        
        # Structure indicators for different prompt types
        if prompt_type == PromptType.DAILY_REPORT:
            if "Performance Summary" in content or "📊" in content:
                score += 0.1
            if "Actionable Recommendations" in content or "🚀" in content:
                score += 0.1
            if "$" in content:  # Contains financial figures
                score += 0.1
        
        elif prompt_type == PromptType.INSIGHT:
            if "Confidence Score" in content or "confidence" in content.lower():
                score += 0.15
            if "%" in content:  # Contains percentages
                score += 0.1
        
        elif prompt_type == PromptType.CHAT:
            if len(content.split('.')) > 2:  # Multiple sentences
                score += 0.1
            if "?" in content or "!" in content:  # Engagement indicators
                score += 0.05
        
        return min(score, 1.0)  # Cap at 1.0
    
    def get_execution_analytics(self, hours_back: int = 24) -> Dict[str, Any]:
        """Get analytics on prompt execution performance."""
        cutoff_time = datetime.now() - timedelta(hours=hours_back)
        recent_executions = [
            result for result in self.execution_history
            if result.processing_time_ms > 0  # Valid timestamp
        ][-100:]  # Last 100 executions as proxy for time-based filtering
        
        if not recent_executions:
            return {"message": "No recent executions found"}
        
        # Calculate metrics
        total_executions = len(recent_executions)
        successful_executions = sum(1 for r in recent_executions if r.success)
        avg_processing_time = sum(r.processing_time_ms for r in recent_executions) / total_executions
        avg_confidence = sum(r.confidence_score for r in recent_executions) / total_executions
        
        # Group by prompt type
        by_prompt_type = {}
        for result in recent_executions:
            if result.prompt_type not in by_prompt_type:
                by_prompt_type[result.prompt_type] = []
            by_prompt_type[result.prompt_type].append(result)
        
        prompt_type_stats = {}
        for prompt_type, results in by_prompt_type.items():
            prompt_type_stats[prompt_type] = {
                "count": len(results),
                "success_rate": sum(1 for r in results if r.success) / len(results),
                "avg_processing_time": sum(r.processing_time_ms for r in results) / len(results),
                "avg_confidence": sum(r.confidence_score for r in results) / len(results)
            }
        
        return {
            "total_executions": total_executions,
            "success_rate": successful_executions / total_executions,
            "avg_processing_time_ms": avg_processing_time,
            "avg_confidence_score": avg_confidence,
            "by_prompt_type": prompt_type_stats,
            "time_window_hours": hours_back
        }
    
    def create_few_shot_example_from_execution(
        self,
        execution_result: PromptExecutionResult,
        input_data: Dict[str, Any],
        description: str,
        quality_score: float = 0.8
    ) -> FewShotExample:
        """Create a few-shot example from successful execution."""
        if not execution_result.success:
            raise ValueError("Cannot create example from failed execution")
        
        return FewShotExample(
            input_data=input_data,
            expected_output=execution_result.content,
            description=description,
            quality_score=quality_score,
            created_at=datetime.now()
        )
    
    async def optimize_prompts(self) -> Dict[str, Any]:
        """Run optimization analysis on current prompts."""
        optimization_results = {
            "recommendations": [],
            "performance_summary": {},
            "suggested_improvements": []
        }
        
        # Analyze recent performance
        analytics = self.get_execution_analytics(hours_back=168)  # 1 week
        
        for prompt_type, stats in analytics.get("by_prompt_type", {}).items():
            if stats["success_rate"] < 0.85:
                optimization_results["recommendations"].append({
                    "prompt_type": prompt_type,
                    "issue": "Low success rate",
                    "current_rate": stats["success_rate"],
                    "suggestion": "Review few-shot examples and consider adding more high-quality examples"
                })
            
            if stats["avg_processing_time"] > 3000:  # 3 seconds
                optimization_results["recommendations"].append({
                    "prompt_type": prompt_type,
                    "issue": "High processing time",
                    "current_time": stats["avg_processing_time"],
                    "suggestion": "Optimize prompt length and complexity"
                })
            
            if stats["avg_confidence"] < 0.7:
                optimization_results["recommendations"].append({
                    "prompt_type": prompt_type,
                    "issue": "Low confidence scores",
                    "current_confidence": stats["avg_confidence"],
                    "suggestion": "Improve prompt clarity and add more specific guidance"
                })
        
        optimization_results["performance_summary"] = analytics
        
        return optimization_results


# Global service instance
_prompt_service = None

def get_prompt_service() -> PromptService:
    """Get the global prompt service instance."""
    global _prompt_service
    if _prompt_service is None:
        _prompt_service = PromptService()
    return _prompt_service
