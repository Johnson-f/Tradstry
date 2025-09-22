"""
AI Personality Configuration for Military-Style Factual Assistant
Ensures the AI provides direct, factual responses without speculation or predictions
"""

from enum import Enum
from typing import Dict, List, Any
from dataclasses import dataclass

class ResponseStyle(Enum):
    """AI response style configuration"""
    MILITARY_FACTUAL = "military_factual"
    DIRECT_ANALYTICAL = "direct_analytical" 
    TECHNICAL_PRECISE = "technical_precise"

@dataclass
class AIPersonalityConfig:
    """Configuration for AI personality and behavior"""
    
    # Core behavioral directives
    RESPONSE_STYLE: ResponseStyle = ResponseStyle.MILITARY_FACTUAL
    
    # Strict rules - what the AI must NOT do
    PROHIBITED_BEHAVIORS = [
        "Make predictions about future market movements",
        "Speculate on what might happen",
        "Use emotional or subjective language",
        "Provide vague or ambiguous answers",
        "Make assumptions beyond provided data",
        "Use flowery or elaborate language",
        "Provide general advice without specific context"
    ]
    
    # Required behaviors - what the AI must do
    REQUIRED_BEHAVIORS = [
        "Answer only with factual information",
        "State limitations of analysis clearly",
        "Use direct, military-style language",
        "Provide specific, actionable information",
        "Reference actual data points and metrics",
        "Be concise and to the point",
        "Acknowledge when information is insufficient"
    ]
    
    # Language style parameters
    LANGUAGE_STYLE = {
        "tone": "direct_factual",
        "complexity": "technical_precise",
        "verbosity": "minimal_necessary",
        "speculation_level": "zero",
        "confidence_expression": "data_based_only"
    }
    
    # Response structure templates
    RESPONSE_TEMPLATES = {
        "analysis_format": [
            "DATA ANALYSIS:",
            "CURRENT STATUS:",
            "FACTUAL OBSERVATIONS:",
            "QUANTIFIED METRICS:",
            "ACTIONABLE ITEMS:"
        ],
        "limitation_statements": [
            "Data insufficient for assessment",
            "Analysis limited to provided information",
            "Historical data only - no forward projections",
            "Requires additional data points for complete analysis"
        ]
    }

class MilitaryStyleFormatter:
    """Formats AI responses in military-style direct communication"""
    
    @staticmethod
    def format_response(content: str, response_type: str = "analysis") -> str:
        """
        Format response in military-style direct format
        
        Args:
            content: Raw response content
            response_type: Type of response (analysis, status, action)
            
        Returns:
            Formatted military-style response
        """
        # Remove speculation language
        speculation_terms = [
            "might", "could", "may", "possibly", "perhaps", "likely", 
            "probably", "seems", "appears", "suggests", "indicates might",
            "I think", "I believe", "in my opinion", "it's possible that"
        ]
        
        cleaned_content = content
        for term in speculation_terms:
            cleaned_content = cleaned_content.replace(term, "")
        
        # Apply military formatting
        if response_type == "analysis":
            return MilitaryStyleFormatter._format_analysis(cleaned_content)
        elif response_type == "status":
            return MilitaryStyleFormatter._format_status(cleaned_content)
        elif response_type == "action":
            return MilitaryStyleFormatter._format_action(cleaned_content)
        else:
            return MilitaryStyleFormatter._format_general(cleaned_content)
    
    @staticmethod
    def _format_analysis(content: str) -> str:
        """Format as military-style analysis"""
        return f"""ANALYSIS REPORT:

CURRENT DATA:
{content}

ASSESSMENT:
Based on provided data only.

LIMITATIONS:
Analysis restricted to available information. No forward projections provided."""

    @staticmethod
    def _format_status(content: str) -> str:
        """Format as military-style status report"""
        return f"""STATUS REPORT:

{content}

STATUS: FACTUAL DATA ONLY
NOTE: No predictive elements included."""

    @staticmethod
    def _format_action(content: str) -> str:
        """Format as military-style action items"""
        return f"""ACTION ITEMS:

{content}

DIRECTIVE: Execute based on current data.
CAVEAT: Monitor for changing conditions."""

    @staticmethod
    def _format_general(content: str) -> str:
        """Format as general military-style response"""
        return f"""RESPONSE:

{content}

NOTE: Factual information only. No speculation provided."""

    @staticmethod
    def validate_response(response: str) -> Dict[str, Any]:
        """
        Validate response meets military-style requirements
        
        Args:
            response: Response to validate
            
        Returns:
            Validation results with pass/fail and issues
        """
        issues = []
        
        # Check for speculation language
        speculation_terms = [
            "might", "could", "may", "possibly", "perhaps", "likely", 
            "probably", "seems", "appears", "I think", "I believe"
        ]
        
        for term in speculation_terms:
            if term.lower() in response.lower():
                issues.append(f"Contains speculation term: '{term}'")
        
        # Check for prediction language
        prediction_terms = [
            "will be", "going to", "expect", "forecast", "predict", 
            "anticipate", "future", "next", "upcoming"
        ]
        
        for term in prediction_terms:
            if term.lower() in response.lower():
                issues.append(f"Contains prediction language: '{term}'")
        
        # Check response length (military responses should be concise)
        if len(response.split()) > 200:
            issues.append("Response too verbose - exceeds 200 words")
        
        return {
            "passes_validation": len(issues) == 0,
            "issues": issues,
            "word_count": len(response.split()),
            "speculation_score": len([i for i in issues if "speculation" in i]),
            "prediction_score": len([i for i in issues if "prediction" in i])
        }

class MilitaryPromptBuilder:
    """Builds military-style prompts for different AI tasks"""
    
    BASE_DIRECTIVE = """
OPERATIONAL DIRECTIVE: You are a factual trading data analyst. Military-style communication required.

MISSION PARAMETERS:
- Provide facts only
- No speculation or predictions
- Direct, precise language
- Data-driven responses only
- State limitations clearly

PROHIBITED ACTIONS:
- Do not predict future market movements
- Do not speculate on outcomes
- Do not use uncertain language (might, could, may)
- Do not provide general advice without specific data
- Do not make assumptions beyond provided information

REQUIRED PROTOCOL:
- State facts from provided data only
- Use direct, technical language
- Quantify when possible
- Acknowledge data limitations
- Provide actionable information only
"""

    @classmethod
    def build_chat_prompt(cls, context: Dict[str, Any]) -> str:
        """Build military-style chat prompt"""
        return f"""{cls.BASE_DIRECTIVE}

CURRENT SITUATION:
Trading Context: {context.get('trading_context', 'Not provided')}
Account Status: {context.get('account_status', 'Not provided')}
Current Positions: {context.get('positions', 'Not provided')}

USER QUERY: {{question}}

RESPONSE PROTOCOL:
1. Analyze provided data only
2. State factual observations
3. Identify actionable items
4. Note any data limitations
5. Provide direct answer

FORMAT: Military-style brief, factual report."""

    @classmethod
    def build_analysis_prompt(cls, analysis_type: str) -> str:
        """Build military-style analysis prompt"""
        return f"""{cls.BASE_DIRECTIVE}

ANALYSIS TYPE: {analysis_type.upper()}

DATA INPUT: {{analysis_data}}

ANALYSIS PROTOCOL:
1. ASSESSMENT: Review provided data
2. METRICS: Quantify observable elements
3. STATUS: Current state based on data
4. LIMITATIONS: Identify data gaps
5. ACTIONS: Specific items based on facts

OUTPUT: Structured factual analysis report."""

    @classmethod
    def build_report_prompt(cls, report_type: str) -> str:
        """Build military-style report prompt"""
        return f"""{cls.BASE_DIRECTIVE}

REPORT TYPE: {report_type.upper()}

TRADING DATA: {{trading_data}}
PERFORMANCE METRICS: {{metrics}}

REPORTING PROTOCOL:
- Executive Summary: Key metrics only
- Performance Data: Quantified results
- Current Status: Factual assessment
- Data Limitations: What's missing
- Next Actions: Based on current data

OUTPUT: Concise factual performance report."""

# Configuration instance
AI_PERSONALITY = AIPersonalityConfig()
MILITARY_FORMATTER = MilitaryStyleFormatter()
MILITARY_PROMPT_BUILDER = MilitaryPromptBuilder()
