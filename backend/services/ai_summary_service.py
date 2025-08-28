"""
AI Summary Service - Multi-Model Trading Analysis Pipeline
Processes daily trading data through 3-stage AI analysis using Hugging Face Inference API:
1. Data Analyzer - Transforms raw JSON into structured insights
2. Insight Generator - Generates psychological and strategic insights  
3. Report Writer - Creates actionable trading reports
"""

import json
import asyncio
import aiohttp
import os
from typing import Dict, List, Optional, Any
from datetime import datetime, date
from dataclasses import dataclass
from enum import Enum
import logging

import asyncpg
from langchain.llms import HuggingFaceHub
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from llama_index.core import Document, VectorStoreIndex

from ..config.database import get_database_connection


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
    max_tokens: int = 512
    temperature: float = 0.7


class AIModelManager:
    """Manages the different AI models for the trading analysis pipeline"""
    
    def __init__(self):
        self.models = {}
        self.tokenizers = {}
        self.pipelines = {}
        self._initialize_models()
    
    def _initialize_models(self):
        """Initialize all AI models for the pipeline"""
        
        # Model configurations
        model_configs = {
            ModelType.DATA_ANALYZER: ModelConfig(
                name="Data Analyzer",
                model_id="microsoft/CodeBERT-base",
                purpose="Transform raw JSON trading data into structured insights",
                temperature=0.3  # Lower temperature for analytical precision
            ),
            ModelType.INSIGHT_GENERATOR: ModelConfig(
                name="Insight Generator", 
                model_id="mistralai/Mistral-7B-Instruct-v0.1",
                purpose="Generate psychological and strategic trading insights",
                temperature=0.6
            ),
            ModelType.REPORT_WRITER: ModelConfig(
                name="Report Writer",
                model_id="meta-llama/Llama-3.1-8B-Instruct", 
                purpose="Create clear, actionable trading reports",
                temperature=0.7
            ),
            ModelType.CHAT_ASSISTANT: ModelConfig(
                name="Chat Assistant",
                model_id="meta-llama/Llama-3.1-8B-Instruct",
                purpose="Handle conversational interactions about trading data",
                temperature=0.8
            )
        }
        
        # Initialize each model
        for model_type, config in model_configs.items():
            try:
                self._load_model(model_type, config)
            except Exception as e:
                print(f"Warning: Failed to load {config.name}: {e}")
    
    def _load_model(self, model_type: ModelType, config: ModelConfig):
        """Load a specific model and create pipeline"""
        
        # Load tokenizer and model
        tokenizer = AutoTokenizer.from_pretrained(config.model_id)
        model = AutoModelForCausalLM.from_pretrained(
            config.model_id,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            device_map="auto" if torch.cuda.is_available() else None
        )
        
        # Create text generation pipeline
        text_pipeline = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
            max_new_tokens=config.max_tokens,
            temperature=config.temperature,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )
        
        # Create LangChain pipeline
        llm = HuggingFacePipeline(pipeline=text_pipeline)
        
        # Store components
        self.models[model_type] = model
        self.tokenizers[model_type] = tokenizer
        self.pipelines[model_type] = llm
    
    def get_pipeline(self, model_type: ModelType) -> HuggingFacePipeline:
        """Get LangChain pipeline for specific model type"""
        return self.pipelines.get(model_type)


class DataAnalyzer:
    """Model 1: Transforms raw JSON trading data into structured insights"""
    
    def __init__(self, model_manager: AIModelManager):
        self.llm = model_manager.get_pipeline(ModelType.DATA_ANALYZER)
        self.prompt_template = PromptTemplate(
            input_variables=["trading_data"],
            template="""
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
        )
        self.chain = LLMChain(llm=self.llm, prompt=self.prompt_template)
    
    async def analyze(self, trading_data: Dict[str, Any]) -> str:
        """Analyze raw trading data and return structured insights"""
        try:
            # Format data for analysis
            formatted_data = json.dumps(trading_data, indent=2, default=str)
            
            # Generate analysis
            result = await self.chain.arun(trading_data=formatted_data)
            return result
            
        except Exception as e:
            return f"Analysis Error: {str(e)}"


class InsightGenerator:
    """Model 2: Generates psychological and strategic insights from data analysis"""
    
    def __init__(self, model_manager: AIModelManager):
        self.llm = model_manager.get_pipeline(ModelType.INSIGHT_GENERATOR)
        self.prompt_template = PromptTemplate(
            input_variables=["data_analysis"],
            template="""
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
        )
        self.chain = LLMChain(llm=self.llm, prompt=self.prompt_template)
    
    async def generate_insights(self, data_analysis: str) -> str:
        """Generate psychological and strategic insights from data analysis"""
        try:
            result = await self.chain.arun(data_analysis=data_analysis)
            return result
            
        except Exception as e:
            return f"Insight Generation Error: {str(e)}"


class ReportWriter:
    """Model 3: Creates user-friendly, actionable trading reports"""
    
    def __init__(self, model_manager: AIModelManager):
        self.llm = model_manager.get_pipeline(ModelType.REPORT_WRITER)
        self.prompt_template = PromptTemplate(
            input_variables=["insights", "time_period"],
            template="""
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
        )
        self.chain = LLMChain(llm=self.llm, prompt=self.prompt_template)
    
    async def write_report(self, insights: str, time_period: str) -> str:
        """Generate user-friendly trading report from insights"""
        try:
            result = await self.chain.arun(insights=insights, time_period=time_period)
            return result
            
        except Exception as e:
            return f"Report Generation Error: {str(e)}"


class ChatAssistant:
    """Conversational AI for follow-up questions about trading data"""
    
    def __init__(self, model_manager: AIModelManager):
        self.llm = model_manager.get_pipeline(ModelType.CHAT_ASSISTANT)
        self.context_index = None
        self.conversation_history = []
    
    def initialize_context(self, trading_data: Dict[str, Any], analysis: str, insights: str, report: str):
        """Initialize conversation context with trading analysis"""
        
        # Create documents for context
        documents = [
            Document(text=f"Trading Data: {json.dumps(trading_data, default=str)}"),
            Document(text=f"Data Analysis: {analysis}"),
            Document(text=f"Insights: {insights}"),
            Document(text=f"Report: {report}")
        ]
        
        # Create vector index for context retrieval
        self.context_index = VectorStoreIndex.from_documents(documents)
    
    async def chat(self, user_question: str) -> str:
        """Handle conversational questions about trading data"""
        
        if not self.context_index:
            return "Please generate a trading report first to enable chat functionality."
        
        try:
            # Retrieve relevant context
            query_engine = self.context_index.as_query_engine()
            context = query_engine.query(user_question)
            
            # Create chat prompt
            prompt = f"""
You are a helpful trading assistant. Answer the user's question based on their trading data and analysis.

CONTEXT: {context}

CONVERSATION HISTORY:
{self._format_history()}

USER QUESTION: {user_question}

Provide a helpful, specific answer based on the trading data. Be conversational but informative.
"""
            
            # Generate response
            response = await self.llm.agenerate([prompt])
            answer = response.generations[0][0].text
            
            # Update conversation history
            self.conversation_history.append({"user": user_question, "assistant": answer})
            
            return answer
            
        except Exception as e:
            return f"Chat Error: {str(e)}"
    
    def _format_history(self) -> str:
        """Format conversation history for context"""
        if not self.conversation_history:
            return "No previous conversation."
        
        formatted = []
        for exchange in self.conversation_history[-3:]:  # Last 3 exchanges
            formatted.append(f"User: {exchange['user']}")
            formatted.append(f"Assistant: {exchange['assistant']}")
        
        return "\n".join(formatted)


class AITradingSummaryService:
    """Main service orchestrating the AI trading analysis pipeline"""
    
    def __init__(self):
        self.model_manager = AIModelManager()
        self.data_analyzer = DataAnalyzer(self.model_manager)
        self.insight_generator = InsightGenerator(self.model_manager)
        self.report_writer = ReportWriter(self.model_manager)
        self.chat_assistant = ChatAssistant(self.model_manager)
    
    async def get_trading_data(self, user_id: str, time_range: str = 'all_time', 
                              custom_start_date: Optional[date] = None,
                              custom_end_date: Optional[date] = None) -> Dict[str, Any]:
        """Fetch trading data from database using the daily AI summary function"""
        
        try:
            conn = await get_database_connection()
            
            # Call the daily AI summary function
            query = """
            SELECT get_daily_ai_summary($1, $2, $3) as summary_data
            """
            
            result = await conn.fetchrow(
                query, 
                time_range, 
                custom_start_date, 
                custom_end_date
            )
            
            await conn.close()
            
            if result and result['summary_data']:
                return json.loads(result['summary_data'])
            else:
                return {"error": "No trading data found"}
                
        except Exception as e:
            return {"error": f"Database error: {str(e)}"}
    
    async def generate_complete_analysis(self, user_id: str, time_range: str = '30d',
                                       custom_start_date: Optional[date] = None,
                                       custom_end_date: Optional[date] = None) -> Dict[str, Any]:
        """Generate complete AI analysis pipeline"""
        
        try:
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
            
            # Step 5: Initialize chat context
            self.chat_assistant.initialize_context(trading_data, data_analysis, insights, report)
            
            return {
                "success": True,
                "timestamp": datetime.now().isoformat(),
                "time_period": time_period_display,
                "raw_data": trading_data,
                "data_analysis": data_analysis,
                "insights": insights,
                "report": report,
                "chat_enabled": True
            }
            
        except Exception as e:
            return {"error": f"Analysis pipeline error: {str(e)}"}
    
    async def chat_about_analysis(self, user_question: str) -> str:
        """Handle chat questions about the analysis"""
        return await self.chat_assistant.chat(user_question)
    
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


# Example usage and testing
async def main():
    """Example usage of the AI Trading Summary Service"""
    
    service = AITradingSummaryService()
    
    # Generate complete analysis
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
        
        # Example chat interaction
        chat_response = await service.chat_about_analysis(
            "What's my biggest weakness as a trader?"
        )
        print(f"\nChat Response: {chat_response}")
    else:
        print(f"Analysis failed: {analysis.get('error')}")


if __name__ == "__main__":
    asyncio.run(main())
