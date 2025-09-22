"""
Advanced Prompt Management Service for Tradistry AI System

This service provides dynamic prompt composition, A/B testing capabilities,
and performance tracking for the prompt registry system.
"""

import json
import logging
import asyncio
import hashlib
import os
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
    Includes LLM-powered confidence scoring for enhanced quality control.
    
    Features:
    - Dynamic prompt selection based on performance metrics
    - A/B testing framework for prompt optimization
    - Context-aware prompt composition
    - Performance tracking and analytics
    """
    
    def __init__(self):
        self.registry = get_prompt_registry()
        self.execution_history: List[PromptExecutionResult] = []
        self.user_assignments: Dict[str, PromptVersion] = {}  # For A/B testing
        self.confidence_cache: Dict[str, float] = {}  # Cache for LLM confidence scores
        self.llm_confidence_enabled = os.getenv('LLM_CONFIDENCE_SCORING_ENABLED', 'true').lower() == 'true'
        self.confidence_cache_size = int(os.getenv('LLM_CONFIDENCE_CACHE_SIZE', '1000'))
        
        logger.info("Advanced Prompt Service initialized with LLM-powered confidence scoring and advanced composition capabilities")
    
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
                confidence_score=await self._calculate_confidence_score(content, prompt_type, enhanced_input, llm),
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
                confidence_score=await self._calculate_confidence_score(full_response, prompt_type, enhanced_input, llm),
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
        # Get up to 5 examples to handle templates that might expect example_1, example_2, example_3, etc.
        examples = self.registry.get_few_shot_examples(prompt_type, limit=5)
        
        # Always add placeholders for example_1, example_2, example_3 to prevent KeyError
        for i in range(1, 4):  # example_1, example_2, example_3
            if i <= len(examples):
                enhanced_data[f"example_{i}"] = examples[i-1].expected_output
            else:
                # Add default placeholder if not enough examples available
                enhanced_data[f"example_{i}"] = f"[Example {i} not available - using contextual guidance instead]"
        
        # Add default values for common template variables to prevent KeyErrors
        template_defaults = {
            # Chat template variables
            'account_status': enhanced_data.get('account_status', 'Account information not available'),
            'recent_performance': enhanced_data.get('recent_performance', 'Performance data not available'), 
            'current_positions': enhanced_data.get('current_positions', 'Position data not available'),
            'market_environment': enhanced_data.get('market_environment', 'Market data not available'),
            'chat_history': enhanced_data.get('chat_history', 'No previous conversation'),
            'question': enhanced_data.get('question', enhanced_data.get('user_message', 'No specific question provided')),
            
            # Daily report template variables
            'trading_data': enhanced_data.get('trading_data', 'Trading data not available'),
            'market_context': enhanced_data.get('market_context', 'Market context not available'),
            
            # General variables
            'context': enhanced_data.get('context', 'Context not available'),
            'user_message': enhanced_data.get('user_message', enhanced_data.get('question', 'No message provided'))
        }
        
        # Only add defaults for missing keys to avoid overwriting existing data
        for key, default_value in template_defaults.items():
            if key not in enhanced_data:
                enhanced_data[key] = default_value
        
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
    
    async def _calculate_confidence_score(self, content: str, prompt_type: PromptType, 
                                        input_data: Dict[str, Any] = None, 
                                        llm = None) -> float:
        """Calculate confidence score using LLM self-evaluation with heuristic fallback."""
        if not content:
            return 0.0
        
        # Try LLM-powered confidence scoring first
        if self.llm_confidence_enabled and llm is not None:
            try:
                llm_score = await self._llm_confidence_evaluation(content, prompt_type, input_data, llm)
                if llm_score is not None:
                    logger.debug(f"LLM confidence score: {llm_score} for {prompt_type.value}")
                    return llm_score
            except Exception as e:
                logger.warning(f"LLM confidence scoring failed, falling back to heuristics: {str(e)}")
        
        # Fallback to heuristic scoring
        return self._heuristic_confidence_score(content, prompt_type)
    
    async def _llm_confidence_evaluation(self, content: str, prompt_type: PromptType, 
                                       input_data: Dict[str, Any], llm) -> Optional[float]:
        """Use LLM to evaluate its own response quality and confidence."""
        try:
            # Create cache key to avoid redundant evaluations
            cache_key = hashlib.md5(f"{content[:200]}{prompt_type.value}".encode()).hexdigest()
            if cache_key in self.confidence_cache:
                return self.confidence_cache[cache_key]
            
            # Get appropriate evaluation prompt
            evaluation_prompt = self._get_confidence_evaluation_prompt(prompt_type)
            
            # Prepare context for evaluation
            context_info = ""
            if input_data:
                # Include relevant context without overwhelming the evaluator
                context_items = []
                for key, value in input_data.items():
                    if key in ['question', 'trading_data', 'date_range', 'insight_type']:
                        context_items.append(f"{key}: {str(value)[:200]}..." if len(str(value)) > 200 else f"{key}: {value}")
                context_info = "\n".join(context_items)
            
            # Format the evaluation prompt
            evaluation_input = {
                "response_content": content,
                "context_information": context_info or "No specific context provided",
                "response_type": prompt_type.value.replace('_', ' ').title()
            }
            
            # Execute evaluation (quick, lightweight call)
            evaluation_result = llm.invoke(evaluation_prompt.format(**evaluation_input))
            
            # Extract confidence score from LLM response
            confidence_score = self._extract_confidence_score(evaluation_result.content if hasattr(evaluation_result, 'content') else str(evaluation_result))
            
            # Cache the result
            if confidence_score is not None:
                self.confidence_cache[cache_key] = confidence_score
                # Limit cache size
                if len(self.confidence_cache) > self.confidence_cache_size:
                    # Remove oldest entries (simple FIFO)
                    oldest_keys = list(self.confidence_cache.keys())[:100]
                    for key in oldest_keys:
                        del self.confidence_cache[key]
            
            return confidence_score
            
        except Exception as e:
            logger.error(f"Error in LLM confidence evaluation: {str(e)}")
            return None
    
    def _get_confidence_evaluation_prompt(self, prompt_type: PromptType) -> PromptTemplate:
        """Get specialized confidence evaluation prompt for each response type."""
        
        base_template = """You are an expert AI response evaluator. Your task is to assess the quality and confidence of an AI-generated response.

Response Type: {response_type}
Original Context: {context_information}

AI Response to Evaluate:
{response_content}

Please evaluate this response on the following criteria:
1. Accuracy and relevance to the context
2. Completeness of the information provided
3. Clarity and coherence of the response
4. Actionability (if applicable)
5. Professional quality

"""
        
        if prompt_type == PromptType.DAILY_REPORT:
            specific_criteria = """For trading reports, also consider:
- Presence of key sections (Performance, Insights, Risk Analysis, Recommendations)
- Use of specific financial data and metrics
- Professional trading terminology
- Actionable trading insights
"""
        elif prompt_type == PromptType.CHAT:
            specific_criteria = """For chat responses, also consider:
- Conversational tone and engagement
- Helpfulness and relevance to user question
- Empathy and understanding of trading context
- Clear and accessible explanations
"""
        elif prompt_type == PromptType.INSIGHT:
            specific_criteria = """For insights, also consider:
- Depth of analysis and pattern recognition
- Statistical significance of observations
- Practical applicability to trading decisions
- Risk awareness and balanced perspective
"""
        else:
            specific_criteria = """Consider the specific requirements and expectations for this type of response.
"""
        
        evaluation_instruction = """Based on your evaluation, provide a confidence score from 1-10 where:
- 1-3: Poor quality, significant issues with accuracy, relevance, or completeness
- 4-6: Adequate quality, meets basic requirements but has room for improvement
- 7-8: Good quality, well-structured and informative with minor areas for enhancement
- 9-10: Excellent quality, comprehensive, accurate, and highly valuable

Respond with ONLY the numerical score (1-10), followed by a brief one-sentence explanation.
Example: "8 - Well-structured response with comprehensive analysis but could include more specific actionable recommendations."
"""
        
        full_template = base_template + specific_criteria + evaluation_instruction
        
        return PromptTemplate(
            input_variables=["response_content", "context_information", "response_type"],
            template=full_template
        )
    
    def _extract_confidence_score(self, evaluation_response: str) -> Optional[float]:
        """Extract numerical confidence score from LLM evaluation response."""
        try:
            # Look for patterns like "8", "7.5", "9 -", etc.
            import re
            
            # First, try to find a number at the start of the response
            score_match = re.search(r'^(\d+(?:\.\d+)?)', evaluation_response.strip())
            if score_match:
                score = float(score_match.group(1))
                # Convert 1-10 scale to 0-1 scale
                return min(max(score / 10.0, 0.0), 1.0)
            
            # Fallback: look for any number in the response
            numbers = re.findall(r'\b(\d+(?:\.\d+)?)\b', evaluation_response)
            if numbers:
                # Take the first number that looks like a score (1-10 range)
                for num_str in numbers:
                    num = float(num_str)
                    if 1 <= num <= 10:
                        return min(max(num / 10.0, 0.0), 1.0)
            
            logger.warning(f"Could not extract confidence score from: {evaluation_response[:100]}")
            return None
            
        except Exception as e:
            logger.error(f"Error extracting confidence score: {str(e)}")
            return None
    
    def _heuristic_confidence_score(self, content: str, prompt_type: PromptType) -> float:
        """Original heuristic-based confidence scoring as fallback."""
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
    
    def get_confidence_scoring_status(self) -> Dict[str, Any]:
        """Get status information about confidence scoring system."""
        return {
            "llm_confidence_enabled": self.llm_confidence_enabled,
            "confidence_cache_size": len(self.confidence_cache),
            "confidence_cache_limit": self.confidence_cache_size,
            "cache_hit_rate": self._calculate_cache_hit_rate(),
            "scoring_mode": "llm_powered" if self.llm_confidence_enabled else "heuristic_only"
        }
    
    def _calculate_cache_hit_rate(self) -> float:
        """Calculate cache hit rate for confidence scoring (simplified)."""
        # This is a simplified calculation - in production you might want more sophisticated tracking
        if len(self.confidence_cache) == 0:
            return 0.0
        return min(len(self.confidence_cache) / max(len(self.execution_history), 1), 1.0)
    
    def toggle_llm_confidence_scoring(self, enabled: bool) -> None:
        """Toggle LLM confidence scoring on/off."""
        self.llm_confidence_enabled = enabled
        logger.info(f"LLM confidence scoring {'enabled' if enabled else 'disabled'}")
    
    def clear_confidence_cache(self) -> int:
        """Clear the confidence scoring cache and return number of entries cleared."""
        cache_size = len(self.confidence_cache)
        self.confidence_cache.clear()
        logger.info(f"Cleared {cache_size} entries from confidence cache")
        return cache_size
    
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
