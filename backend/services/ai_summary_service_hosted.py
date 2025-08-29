"""
AI Summary Service - Hosted Models with Fallback System
Uses Hugging Face Inference API with multiple model fallbacks per stage
"""

import json
import asyncio
import aiohttp
import os
import re
from typing import Dict, List, Optional, Any
from datetime import datetime, date
from dataclasses import dataclass
from enum import Enum
import logging

from database import get_database_connection
from models.ai_summary import AIReportCreate
from services.embedding_service import EmbeddingService
from market_data.orchestrator import MarketDataOrchestrator

logger = logging.getLogger(__name__)


class ModelType(Enum):
    DATA_ANALYZER = "data_analyzer"
    INSIGHT_GENERATOR = "insight_generator"
    REPORT_WRITER = "report_writer"
    CHAT_ASSISTANT = "chat_assistant"


@dataclass
class ModelConfig:
    name: str
    model_id: str
    purpose: str
    priority: int  # Lower number = higher priority


class HuggingFaceInferenceClient:
    """Client for Hugging Face Inference API with fallback system"""

    def __init__(self, api_token: str):
        self.api_token = api_token
        self.base_url = "https://api-inference.huggingface.co/models"
        self.session = None

        # Model configurations with fallback priorities
        self.model_configs = {
            ModelType.DATA_ANALYZER: [
                ModelConfig("CodeBERT", "microsoft/CodeBERT-base", "Numerical data analysis", 1),
                ModelConfig("DialoGPT-Large", "microsoft/DialoGPT-large", "Structured data processing", 2),
                ModelConfig("Llama-3.2-3B", "meta-llama/Llama-3.2-3B-Instruct", "Analytical capabilities", 3)
            ],
            ModelType.INSIGHT_GENERATOR: [
                ModelConfig("Mistral-7B", "mistralai/Mistral-7B-Instruct-v0.1", "Data insights", 1),
                ModelConfig("Llama-3.1-8B", "meta-llama/Llama-3.1-8B-Instruct", "Pattern recognition", 2),
                ModelConfig("DialoGPT-Large", "microsoft/DialoGPT-large", "Data connections", 3)
            ],
            ModelType.REPORT_WRITER: [
                ModelConfig("Llama-3.1-8B", "meta-llama/Llama-3.1-8B-Instruct", "Clear writing", 1),
                ModelConfig("Mistral-7B", "mistralai/Mistral-7B-Instruct-v0.1", "Report generation", 2),
                ModelConfig("DialoGPT-Large", "microsoft/DialoGPT-large", "Conversational tone", 3)
            ],
            ModelType.CHAT_ASSISTANT: [
                ModelConfig("Llama-3.1-8B", "meta-llama/Llama-3.1-8B-Instruct", "Context chat", 1),
                ModelConfig("Mistral-7B", "mistralai/Mistral-7B-Instruct-v0.1", "Context maintenance", 2),
                ModelConfig("DialoGPT-Large", "microsoft/DialoGPT-large", "Conversations", 3)
            ]
        }

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def generate_text(self, model_type: ModelType, prompt: str, max_tokens: int = 512) -> str:
        """Generate text with fallback system"""

        models = sorted(self.model_configs[model_type], key=lambda x: x.priority)

        for model_config in models:
            try:
                result = await self._call_model(model_config.model_id, prompt, max_tokens)
                if result:
                    logger.info(f"Successfully used {model_config.name} for {model_type.value}")
                    return result
            except Exception as e:
                logger.warning(f"Failed to use {model_config.name}: {str(e)}")
                continue

        raise Exception(f"All models failed for {model_type.value}")

    async def _call_model(self, model_id: str, prompt: str, max_tokens: int) -> str:
        """Call specific Hugging Face model"""

        url = f"{self.base_url}/{model_id}"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }

        payload = {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": max_tokens,
                "temperature": 0.7,
                "do_sample": True,
                "return_full_text": False
            }
        }

        async with self.session.post(url, headers=headers, json=payload) as response:
            if response.status == 200:
                result = await response.json()
                if isinstance(result, list) and len(result) > 0:
                    return result[0].get("generated_text", "").strip()
                elif isinstance(result, dict):
                    return result.get("generated_text", "").strip()
            elif response.status == 503:
                # Model loading
                await asyncio.sleep(20)
                raise Exception("Model loading, retrying...")
            else:
                error_text = await response.text()
                raise Exception(f"API error {response.status}: {error_text}")

        return ""


class DataAnalyzer:
    """Model 1: Transforms raw JSON trading data into structured insights. TODO: Tweak the prompt template"""

    def __init__(self, hf_client: HuggingFaceInferenceClient):
        self.hf_client = hf_client
        self.prompt_template = """
You are a quantitative trading analyst. Analyze the following trading data and extract key insights.
TRADING DATA:
{trading_data}

ANALYSIS FRAMEWORK:
1. Performance Metrics Analysis
2. Risk Management Assessment
3. Trading Behavior Patterns
4. Asset Class Performance
5. Timing and Frequency Analysis

Provide structured analysis in this format:

PERFORMANCE ANALYSIS:
- Win Rate: [percentage] ([interpretation])
- Profit Factor: [value] ([interpretation])
- Trade Expectancy: [value] ([interpretation])
- Risk-Reward Ratio: [value] ([interpretation])

RISK ASSESSMENT:
- Position Sizing: [analysis]
- Risk Per Trade: [analysis]
- Drawdown Patterns: [analysis]

BEHAVIORAL PATTERNS:
- Hold Time Analysis: [analysis]
- Trading Frequency: [analysis]
- Directional Bias: [analysis]

ASSET PERFORMANCE:
- Top Performing Symbols: [analysis]
- Underperforming Assets: [analysis]

TIMING PATTERNS:
- Best Trading Times: [analysis]
- Frequency Distribution: [analysis]

Focus on numerical insights and statistical patterns. Be precise and analytical.
"""

    async def analyze(self, trading_data: Dict[str, Any]) -> str:
        """Analyze raw trading data and return structured insights"""
        try:
            formatted_data = json.dumps(trading_data, indent=2, default=str)
            prompt = self.prompt_template.format(trading_data=formatted_data)

            result = await self.hf_client.generate_text(
                ModelType.DATA_ANALYZER,
                prompt,
                max_tokens=800
            )
            return result

        except Exception as e:
            return f"Analysis Error: {str(e)}"


class InsightGenerator:
    """Model 2: Generates psychological and strategic insights from data analysis"""

    def __init__(self, hf_client: HuggingFaceInferenceClient):
        self.hf_client = hf_client
        self.prompt_template = """
You are an experienced trading psychologist and strategy consultant. Based on the following data analysis, generate deep insights about the trader's psychology, behavior, and strategy effectiveness.

DATA ANALYSIS:
{data_analysis}

INSIGHT FRAMEWORK:
1. Trading Psychology Assessment
2. Strategy Effectiveness Analysis
3. Behavioral Pattern Recognition
4. Risk Management Evaluation
5. Performance Optimization Opportunities

Generate insights in this format:

PSYCHOLOGICAL INSIGHTS:
- Fear/Greed Patterns: [detailed analysis]
- Decision-Making Biases: [specific biases identified]
- Emotional Trading Indicators: [behavioral evidence]
- Confidence Levels: [assessment based on position sizing/hold times]

STRATEGY INSIGHTS:
- Strategy Effectiveness: [overall assessment]
- Market Timing Ability: [analysis of entry/exit patterns]
- Asset Selection Skills: [symbol performance analysis]
- Directional Bias Impact: [bullish vs bearish performance]

BEHAVIORAL PATTERNS:
- Consistency Issues: [specific inconsistencies identified]
- Discipline Assessment: [rule-following analysis]
- Learning Curve: [improvement/deterioration patterns]
- Stress Indicators: [signs of pressure in trading]

OPTIMIZATION OPPORTUNITIES:
- Immediate Improvements: [quick wins identified]
- Strategic Adjustments: [longer-term changes needed]
- Skill Development Areas: [specific areas to focus on]
- System Refinements: [process improvements]

Focus on actionable psychological and strategic insights. Connect data patterns to human behavior and trading psychology.
"""

    async def generate_insights(self, data_analysis: str) -> str:
        """Generate psychological and strategic insights from data analysis"""
        try:
            prompt = self.prompt_template.format(data_analysis=data_analysis)

            result = await self.hf_client.generate_text(
                ModelType.INSIGHT_GENERATOR,
                prompt,
                max_tokens=800
            )
            return result

        except Exception as e:
            return f"Insight Generation Error: {str(e)}"


class ReportWriter:
    """Model 3: Creates user-friendly, actionable trading reports"""

    def __init__(self, hf_client: HuggingFaceInferenceClient):
        self.hf_client = hf_client
        self.prompt_template = """
You are an experienced trading mentor writing a personalized report for a trader. Transform the following insights into a clear, encouraging, and actionable report.

INSIGHTS:
{insights}

TIME PERIOD: {time_period}

Create a comprehensive trading report with this structure:

# Trading Performance Report - {time_period}

## 🎯 Executive Summary
[2-3 sentences summarizing overall performance and key takeaways]

## 💪 What You're Doing Well
[Highlight 3-4 specific strengths with supporting data]
- Strength 1: [specific achievement with numbers]
- Strength 2: [specific achievement with numbers]
- Strength 3: [specific achievement with numbers]

## 🔍 Key Areas for Improvement
[Identify 2-3 critical areas needing attention]
- Area 1: [specific issue with impact analysis]
- Area 2: [specific issue with impact analysis]
- Area 3: [specific issue with impact analysis]

## 📋 Specific Action Steps
[Provide 4-6 concrete, actionable recommendations]
1. **Immediate Actions (This Week)**
   - Action 1: [specific step with timeline]
   - Action 2: [specific step with timeline]

2. **Short-term Improvements (Next 2-4 weeks)**
   - Action 3: [specific step with expected outcome]
   - Action 4: [specific step with expected outcome]

3. **Long-term Development (Next 1-3 months)**
   - Action 5: [strategic improvement with measurement]
   - Action 6: [strategic improvement with measurement]

## 🎯 Next Week's Focus
[3 specific priorities for the coming week]
- Priority 1: [clear objective with success metric]
- Priority 2: [clear objective with success metric]
- Priority 3: [clear objective with success metric]

## 📊 Key Metrics to Track
[4-5 specific metrics to monitor progress]
- Metric 1: [current value → target value]
- Metric 2: [current value → target value]
- Metric 3: [current value → target value]

## 💡 Final Thoughts
[Encouraging conclusion with motivation and confidence building]

Write in a supportive, mentor-like tone. Be specific with numbers and actionable with recommendations. Focus on building confidence while addressing areas for improvement.
"""

    async def write_report(self, insights: str, time_period: str) -> str:
        """Generate user-friendly trading report from insights"""
        try:
            prompt = self.prompt_template.format(insights=insights, time_period=time_period)

            result = await self.hf_client.generate_text(
                ModelType.REPORT_WRITER,
                prompt,
                max_tokens=1000
            )
            return result

        except Exception as e:
            return f"Report Generation Error: {str(e)}"


class ChatAssistant:
    """Conversational AI for follow-up questions about trading data"""

    def __init__(self, hf_client: HuggingFaceInferenceClient):
        self.hf_client = hf_client
        self.conversation_history = []
        self.context_data = {}

    def initialize_context(self, trading_data: Dict[str, Any], analysis: str, insights: str, report: str):
        """Initialize conversation context with trading analysis"""
        self.context_data = {
            "trading_data": trading_data,
            "analysis": analysis,
            "insights": insights,
            "report": report
        }

    async def chat(self, user_question: str, user_id: str) -> str:
        """
        Handle chat questions about the analysis using a RAG approach.
        1. Generate an embedding for the user's question.
        2. Search for similar reports and past Q&A from the database.
        3. Construct a context-rich prompt with the retrieved information.
        4. Call the LLM to generate a synthesized answer.
        """
        if not self.context_data:
            return "Please generate a report first to enable chat about your personal trading analysis."

        async with EmbeddingService() as embedding_service:
            question_embedding = await embedding_service.generate_embedding(user_question)

        if not question_embedding:
            logger.warning("Could not generate embedding for the question. Using fallback.")
            return await self._fallback_to_external_ai(user_question)

        # Retrieve relevant context from the database
        retrieved_context = await self._retrieve_rag_context(user_id, question_embedding)

        # Fallback if no context is found
        if not retrieved_context:
            logger.info("No specific context found in DB. Using general context fallback.")
            return await self._fallback_to_external_ai(user_question)

        # Construct a RAG prompt
        history = self._format_history()
        prompt = f"""You are a helpful trading assistant. Answer the user's question based on the following retrieved context from their trading history and our previous conversation.

RETRIEVED CONTEXT:
{retrieved_context}

CONVERSATION HISTORY:
{history}

USER QUESTION: {user_question}

Synthesize an answer from the provided context. If the context does not contain the answer, state that you don't have enough information from the user's history to answer. Do not make up information.
"""

        response = await self.hf_client.generate_text(
            ModelType.CHAT_ASSISTANT,
            prompt,
            max_tokens=400
        )

        # Update conversation history
        self.conversation_history.append({"user": user_question, "assistant": response})

        # Asynchronously save the new Q&A pair for future reference
        # asyncio.create_task(self._save_qa_pair(user_id, user_question, response, question_embedding))

        return response

    async def _retrieve_rag_context(self, user_id: str, question_embedding: list) -> str:
        """Retrieve context from reports and past Q&A using vector search."""
        try:
            supabase = await get_database_connection()

            # Search for similar reports
            reports_result = await supabase.rpc('search_similar_ai_reports', {
                'p_user_id': user_id,
                'p_query_embedding': question_embedding,
                'p_similarity_threshold': 0.75,
                'p_match_count': 2,
                'p_search_type': 'summary'
            }).execute()

            # Search for similar past questions
            qa_result = await supabase.rpc('search_similar_chat_qa', {
                'p_user_id': user_id,
                'p_query_embedding': question_embedding,
                'p_similarity_threshold': 0.85,
                'p_match_count': 2
            }).execute()

            context_parts = []
            if reports_result.data:
                for report in reports_result.data:
                    context_parts.append(f"From a report titled '{report.get('report_title')}': {report.get('executive_summary')}")

            if qa_result.data:
                for qa in qa_result.data:
                    context_parts.append(f"Previously, you asked '{qa.get('question')}' and the answer was: {qa.get('answer')}")

            return "\n\n".join(context_parts) if context_parts else ""
        except Exception as e:
            logger.error(f"Failed to retrieve RAG context: {e}")
            return ""

    async def _fallback_to_external_ai(self, user_question: str) -> str:
        """Fallback method to call external AI when no similar questions found"""
        context_summary = self._create_context_summary()
        history = self._format_history()

        prompt = f"""
You are a helpful trading assistant. Answer the user's question based on their trading data and analysis.

TRADING CONTEXT:
{context_summary}

CONVERSATION HISTORY:
{history}

USER QUESTION: {user_question}

Provide a helpful, specific answer based on the trading data. Be conversational but informative. Keep responses concise and actionable.
"""

        response = await self.hf_client.generate_text(
            ModelType.CHAT_ASSISTANT,
            prompt,
            max_tokens=400
        )

        # Update conversation history
        self.conversation_history.append({"user": user_question, "assistant": response})

        return response

    async def _enhance_with_context(self, user_question: str, cached_answer: str) -> str:
        """Enhance a cached answer with current context for slightly different questions"""
        context_summary = self._create_context_summary()

        prompt = f"""
You have a similar but not identical question. Enhance this cached answer with current context:

CACHED ANSWER: {cached_answer}

CURRENT QUESTION: {user_question}

CURRENT CONTEXT: {context_summary}

Provide an enhanced answer that addresses the current question while building on the cached answer.
"""

        enhanced_response = await self.hf_client.generate_text(
            ModelType.CHAT_ASSISTANT,
            prompt,
            max_tokens=300
        )

        return enhanced_response

    async def _save_qa_pair(self, user_id: str, question: str, answer: str, question_embedding: list) -> None:
        """Save a new Q&A pair to the vector database"""
        try:
            # Generate embedding for the answer
            answer_embedding = await self.hf_client.embedding_service.generate_embedding(answer)

            if answer_embedding:
                supabase = await get_database_connection()

                # Get current model being used
                current_model = self.hf_client.model_configs[ModelType.CHAT_ASSISTANT][0].model_name

                # Save Q&A pair using Supabase RPC
                result = supabase.rpc('upsert_chat_qa', {
                    'p_user_id': user_id,
                    'p_question': question,
                    'p_answer': answer,
                    'p_question_embedding': question_embedding,
                    'p_answer_embedding': answer_embedding,
                    'p_source_type': 'external_ai',
                    'p_model_used': current_model
                }).execute()

                logger.info(f"Saved Q&A pair for user {user_id}")

        except Exception as e:
            logger.error(f"Failed to save Q&A pair: {str(e)}")

    async def _update_qa_usage(self, qa_id: str) -> None:
        """Update usage count for a Q&A pair"""
        try:
            supabase = await get_database_connection()
            supabase.table('chat_qa').update({
                'usage_count': 'usage_count + 1',
                'last_used_at': 'NOW()'
            }).eq('id', qa_id).execute()
        except Exception as e:
            logger.warning(f"Failed to update Q&A usage: {str(e)}")

    def _create_context_summary(self) -> str:
        """Create a summary of the trading context"""
        if not self.context_data:
            return "No context available."

        # Extract key metrics for context
        trading_data = self.context_data.get("trading_data", {})
        core_metrics = trading_data.get("core_performance_metrics", {})

        summary = f"""
Win Rate: {core_metrics.get('win_rate_percentage', 'N/A')}%\nProfit Factor: {core_metrics.get('profit_factor', 'N/A')}
Trade Expectancy: {core_metrics.get('trade_expectancy', 'N/A')}
Analysis: {self.context_data.get('analysis', 'N/A')[:200]}...
Key Insights: {self.context_data.get('insights', 'N/A')[:200]}...
"""
        return summary

    def _format_history(self) -> str:
        """Format conversation history for context"""
        if not self.conversation_history:
            return "No previous conversation."

        formatted = []
        for exchange in self.conversation_history[-3:]:
            formatted.append(f"User: {exchange['user']}")
            formatted.append(f"Assistant: {exchange['assistant']}")

        return "\n".join(formatted)


class AITradingSummaryService:
    """Main service orchestrating the AI trading analysis pipeline"""

    def __init__(self):
        self.api_token = os.getenv("HUGGINGFACE_API_TOKEN")
        if not self.api_token:
            raise ValueError("HUGGINGFACE_API_TOKEN environment variable is required")

        self.hf_client = None
        self.data_analyzer = None
        self.insight_generator = None
        self.report_writer = None
        self.chat_assistant = None
        self.market_data_orchestrator = None

    async def _initialize_clients(self):
        """Initialize HF client and AI components"""
        if not self.hf_client:
            self.hf_client = HuggingFaceInferenceClient(self.api_token)
            self.data_analyzer = DataAnalyzer(self.hf_client)
            self.insight_generator = InsightGenerator(self.hf_client)
            self.report_writer = ReportWriter(self.hf_client)
            self.chat_assistant = ChatAssistant(self.hf_client)
            self.market_data_orchestrator = MarketDataOrchestrator()

    async def get_trading_data(self, user_id: str, time_range: str = 'all_time',
                              custom_start_date: Optional[date] = None,
                              custom_end_date: Optional[date] = None) -> Dict[str, Any]:
        """Fetch trading data from database using the daily AI summary function"""

        try:
            supabase = await get_database_connection()

            result = supabase.rpc('get_daily_ai_summary', {
                'p_time_range': time_range,
                'p_custom_start_date': custom_start_date,
                'p_custom_end_date': custom_end_date
            }).execute()

            if result.data:
                return result.data
            else:
                return {"error": "No trading data found"}

        except Exception as e:
            return {"error": f"Database error: {str(e)}"}

    async def generate_complete_analysis(self, user_id: str, time_range: str = '30d',
                                       custom_start_date: Optional[date] = None,
                                       custom_end_date: Optional[date] = None) -> Dict[str, Any]:
        """Generate complete AI analysis pipeline"""

        try:
            await self._initialize_clients()

            async with self.hf_client:
                # Step 1: Get trading data
                trading_data = await self.get_trading_data(
                    user_id, time_range, custom_start_date, custom_end_date
                )

                if "error" in trading_data:
                    return {"error": trading_data["error"]}

                # Step 2: Data Analysis (Model 1)
                data_analysis = await self.data_analyzer.analyze(trading_data)

                # Step 3: Insight Generation (Model 2)
                insights = await self.insight_generator.generate_insights(data_analysis)

                # Step 4: Report Writing (Model 3)
                time_period_display = self._format_time_period(time_range, custom_start_date, custom_end_date)
                report = await self.report_writer.write_report(insights, time_period_display)

                # Step 5: Store report in vector database
                report_id = await self._store_report_in_database(
                    user_id, time_range, custom_start_date, custom_end_date,
                    time_period_display, trading_data, data_analysis, insights, report
                )

                # Step 6: Initialize chat context
                self.chat_assistant.initialize_context(trading_data, data_analysis, insights, report)

                return {
                    "success": True,
                    "timestamp": datetime.now().isoformat(),
                    "time_period": time_period_display,
                    "raw_data": trading_data,
                    "data_analysis": data_analysis,
                    "insights": insights,
                    "report": report,
                    "chat_enabled": True,
                    "report_id": report_id
                }

        except Exception as e:
            return {"error": f"Analysis pipeline error: {str(e)}"}

    async def chat_about_analysis(self, user_question: str, user_id: str = None) -> str:
        """
        Handle chat questions intelligently.
        Routes questions to personal analysis, market data, or provides guidance.
        """
        await self._initialize_clients()

        # Intent 1: Market Data Question (looks for a ticker)
        ticker_match = re.search(r'\$?([A-Z]{1,5})\b', user_question)
        if ticker_match:
            ticker = ticker_match.group(1)
            try:
                async with self.hf_client:
                    # Fetch market data
                    tasks = {
                        "info": self.market_data_orchestrator.get_company_info(ticker),
                        "quote": self.market_data_orchestrator.get_quote(ticker),
                        "news": self.market_data_orchestrator.get_news(ticker, limit=5)
                    }
                    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

                    data_map = dict(zip(tasks.keys(), results))

                    # Process results
                    info_data = data_map['info'].data if hasattr(data_map['info'], 'data') else 'Not available'
                    quote_data = data_map['quote'].data if hasattr(data_map['quote'], 'data') else 'Not available'
                    news_data = data_map['news'].data if hasattr(data_map['news'], 'data') else 'Not available'

                    # Build a comprehensive context string
                    market_context = f"Here is the latest data for {ticker}:\n"
                    market_context += f"Company Info: {info_data}\n"
                    market_context += f"Latest Quote: {quote_data}\n"
                    if news_data:
                        news_str = '\n'.join([f"- {n.headline}" for n in news_data])
                        market_context += f"Recent News:\n{news_str}"

                    prompt = f"""
You are a financial analyst AI. Based on the following real-time market data, answer the user's question.

                    MARKET DATA:
                    {market_context}

                    USER QUESTION: {user_question}

                    Provide a direct and informative answer.
                    """

                    answer = await self.hf_client.generate_text(ModelType.CHAT_ASSISTANT, prompt, max_tokens=500)
                    return answer

            except Exception as e:
                logger.error(f"Error fetching market data for {ticker}: {str(e)}")
                return "I had trouble fetching the latest market data for that ticker. Please try again later."

        # Intent 2: Personal Trading Question (context exists)
        if self.chat_assistant and self.chat_assistant.context_data:
            return await self.chat_assistant.chat(user_question, user_id)

        # Intent 3: No context, no ticker -> Guidance
        else:
            return "I can answer questions about your personal trading analysis or provide information on specific stock tickers (e.g., $AAPL). To ask about your trading, please generate a report first."

    async def _store_report_in_database(self, user_id: str, time_range: str,
                                       custom_start_date: Optional[date], custom_end_date: Optional[date],
                                       time_period_display: str, trading_data: Dict[str, Any],
                                       data_analysis: str, insights: str, report: str) -> Optional[str]:
        """Store AI report in vector database with embeddings"""

        try:
            # Extract metrics from trading data
            core_metrics = trading_data.get("core_performance_metrics", {})

            # Generate report title
            report_title = f"Trading Performance Report - {time_period_display}"

            # Extract executive summary from report (first section after title)
            executive_summary = self._extract_executive_summary(report)

            # Generate tags based on performance
            tags = self._generate_report_tags(core_metrics, time_range)

            # Create report data for embedding
            report_data = {
                "report_title": report_title,
                "executive_summary": executive_summary,
                "full_report": report,
                "data_analysis": data_analysis,
                "insights": insights,
                "win_rate": core_metrics.get("win_rate_percentage"),
                "profit_factor": core_metrics.get("profit_factor"),
                "trade_expectancy": core_metrics.get("trade_expectancy"),
                "total_trades": core_metrics.get("total_trades"),
                "net_pnl": core_metrics.get("net_pnl")
            }

            # Generate embeddings
            async with EmbeddingService() as embedding_service:
                embeddings = await embedding_service.generate_report_embeddings(report_data)

            # Store in database
            supabase = await get_database_connection()

            result = supabase.rpc('upsert_ai_report', {
                'p_user_id': user_id,
                'p_time_range': time_range,
                'p_custom_start_date': custom_start_date,
                'p_custom_end_date': custom_end_date,
                'p_report_title': report_title,
                'p_executive_summary': executive_summary,
                'p_report': report,
                'p_data_analysis': data_analysis,
                'p_insights': insights,
                'p_win_rate': core_metrics.get("win_rate_percentage"),
                'p_profit_factor': core_metrics.get("profit_factor"),
                'p_trade_expectancy': core_metrics.get("trade_expectancy"),
                'p_total_trades': core_metrics.get("total_trades"),
                'p_net_pnl': core_metrics.get("net_pnl"),
                'p_report_embedding': embeddings.get("report_embedding"),
                'p_summary_embedding': embeddings.get("summary_embedding"),
                'p_tags': tags,
                'p_model_versions': {"data_analyzer": "fallback_used", "insight_generator": "fallback_used", "report_writer": "fallback_used"},
                'p_processing_time_ms': None
            }).execute()

            if result.data and len(result.data) > 0 and result.data[0].get("report_id"):
                report_id = result.data[0]["report_id"]
                logger.info(f"Stored AI report with ID: {report_id}")
                return str(report_id)
            else:
                logger.error("Failed to store AI report")
                return None

        except Exception as e:
            logger.error(f"Error storing report in database: {str(e)}")
            return None

    def _extract_executive_summary(self, report: str) -> str:
        """Extract executive summary from report"""
        try:
            # Look for executive summary section
            lines = report.split('\n')
            summary_started = False
            summary_lines = []

            for line in lines:
                if '## 🎯 Executive Summary' in line or '## Executive Summary' in line:
                    summary_started = True
                    continue
                elif summary_started and line.startswith('## '):
                    break
                elif summary_started and line.strip():
                    summary_lines.append(line.strip())

            if summary_lines:
                return ' '.join(summary_lines)
            else:
                # Fallback: take first paragraph after title
                for line in lines:
                    if line.strip() and not line.startswith('#') and len(line.strip()) > 50:
                        return line.strip()[:500]

            return "AI-generated trading performance analysis"

        except Exception:
            return "AI-generated trading performance analysis"

    def _generate_report_tags(self, metrics: Dict[str, Any], time_range: str) -> List[str]:
        """Generate tags based on performance metrics"""
        tags = [time_range]

        try:
            win_rate = metrics.get("win_rate_percentage", 0)
            profit_factor = metrics.get("profit_factor", 0)
            net_pnl = metrics.get("net_pnl", 0)

            # Performance tags
            if win_rate >= 70:
                tags.append("high_win_rate")
            elif win_rate >= 50:
                tags.append("moderate_win_rate")
            else:
                tags.append("low_win_rate")

            if profit_factor >= 2.0:
                tags.append("excellent_profit_factor")
            elif profit_factor >= 1.5:
                tags.append("good_profit_factor")
            elif profit_factor >= 1.0:
                tags.append("break_even")
            else:
                tags.append("losing_period")

            if net_pnl > 0:
                tags.append("profitable")
            else:
                tags.append("unprofitable")

            # Volume tags
            total_trades = metrics.get("total_trades", 0)
            if total_trades >= 50:
                tags.append("high_volume")
            elif total_trades >= 20:
                tags.append("moderate_volume")
            else:
                tags.append("low_volume")

        except Exception:
            pass

        return tags

    def _format_time_period(self, time_range: str, start_date: Optional[date], end_date: Optional[date]) -> str:
        """Format time period for display"""
        if time_range == 'custom' and start_date and end_date:
            return f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}"
        elif time_range == '7d':
            return "Last 7 Days"
        elif time_range == '30d':
            return "Last 30 Days"
        elif time_range == '90d':
            return "Last 90 Days"
        elif time_range == '1y':
            return "Last Year"
        elif time_range == 'ytd':
            return "Year to Date"
        else:
            return "All Time"


# Example usage
async def main():
    """Example usage of the AI Trading Summary Service"""

    service = AITradingSummaryService()

    analysis = await service.generate_complete_analysis(
        user_id="test_user",
        time_range="30d"
    )

    if analysis.get("success"):
        print("=== AI TRADING ANALYSIS COMPLETE ===")
        print(f"Time Period: {analysis['time_period']}")
        print(f"Generated: {analysis['timestamp']}")
        print("\n" + "="*50)
        print(analysis['report'])
        print("="*50)

        chat_response = await service.chat_about_analysis(
            "What's my biggest weakness as a trader?"
        )
        print(f"\nChat Response: {chat_response}")
    else:
        print(f"Analysis failed: {analysis.get('error')}")


if __name__ == "__main__":
    asyncio.run(main())
