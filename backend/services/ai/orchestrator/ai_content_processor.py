from typing import Dict, Any, Optional, List
import logging
import json
import re
from datetime import datetime

from models.ai_chat import MessageType

logger = logging.getLogger(__name__)


class AIContentProcessor:
    """
    Handles content processing utilities for AI services.
    Provides text formatting, parsing, and content extraction functions.
    """

    def __init__(self):
        logger.info("AI Content Processor initialized")

    def extract_insights_and_recommendations(self, report_content: str) -> tuple:
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

    def format_chat_history(self, chat_history: List) -> str:
        """Format chat history for context in prompts."""
        if not chat_history:
            return "No previous conversation."

        try:
            formatted = []
            for msg in chat_history[-5:]:  # Last 5 messages
                try:
                    if hasattr(msg, 'message_type') and hasattr(msg, 'content'):
                        role = "User" if msg.message_type == MessageType.USER_QUESTION else "Assistant"
                        content = msg.content
                    elif isinstance(msg, dict):
                        msg_type = msg.get('message_type')
                        if isinstance(msg_type, str):
                            role = "User" if msg_type == "user_question" else "Assistant"
                        elif msg_type and hasattr(msg_type, 'value'):
                            role = "User" if msg_type.value == "user_question" else "Assistant"
                        else:
                            role = "User" if msg_type == MessageType.USER_QUESTION else "Assistant"
                        content = msg.get('content', '')
                    else:
                        continue

                    if content:
                        formatted.append(f"{role}: {content[:200]}...")
                except Exception as msg_error:
                    logger.warning(f"Error processing chat history message: {str(msg_error)}")
                    continue

            return "\n".join(formatted) if formatted else "No previous conversation."

        except Exception as e:
            logger.error(f"Error formatting chat history: {str(e)}")
            return "Error retrieving conversation history."

    def extract_symbols_from_query(self, query: str) -> List[str]:
        """Extract stock symbols from the user's query."""
        try:
            # Common patterns for stock symbols
            patterns = [
                r'\b[A-Z]{1,5}\b',  # 1-5 uppercase letters
                r'\$([A-Z]{1,5})\b',  # $SYMBOL format
                r'\b([A-Z]{1,5})\s+stock\b',  # SYMBOL stock
                r'\b([A-Z]{1,5})\s+shares?\b',  # SYMBOL shares
            ]
            
            symbols = set()
            query_upper = query.upper()
            
            for pattern in patterns:
                matches = re.findall(pattern, query_upper)
                for match in matches:
                    symbol = match if isinstance(match, str) else match[0] if match else ""
                    if len(symbol) >= 1 and len(symbol) <= 5 and symbol.isalpha():
                        symbols.add(symbol)
            
            # Filter out common words that might be mistaken for symbols
            common_words = {'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'USE', 'MAN', 'NEW', 'NOW', 'WAY', 'MAY', 'SAY', 'SEE', 'HIM', 'TWO', 'HOW', 'ITS', 'WHO', 'BOY', 'DID', 'HAS', 'LET', 'PUT', 'TOO', 'OLD', 'ANY', 'SUN', 'SET'}
            symbols = symbols - common_words
            
            return list(symbols)
            
        except Exception as e:
            logger.error(f"Error extracting symbols from query: {str(e)}")
            return []

    def extract_actions_from_insight(self, insight_content: str) -> Optional[Dict[str, Any]]:
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

    def clean_ai_response(self, response: Any) -> str:
        """Clean and standardize AI response content."""
        try:
            # Handle different response types
            if hasattr(response, 'content'):
                content = response.content
            elif isinstance(response, str):
                content = response
            elif isinstance(response, dict) and 'content' in response:
                content = response['content']
            else:
                content = str(response)

            # Clean up the content
            if not isinstance(content, str):
                content = str(content)

            # Remove excessive whitespace and normalize
            content = re.sub(r'\n{3,}', '\n\n', content)  # Max 2 consecutive newlines
            content = re.sub(r' {2,}', ' ', content)  # Max 1 space between words
            content = content.strip()

            return content

        except Exception as e:
            logger.error(f"Error cleaning AI response: {str(e)}")
            return str(response) if response else ""

    def extract_key_phrases(self, text: str, max_phrases: int = 10) -> List[str]:
        """Extract key phrases from text content."""
        try:
            if not text or not isinstance(text, str):
                return []

            # Simple key phrase extraction
            # Remove common words and extract meaningful phrases
            text_lower = text.lower()
            
            # Pattern for potential key phrases (2-4 words)
            phrase_patterns = [
                r'\b(?:trading|market|stock|option|position|profit|loss|risk|strategy|analysis|pattern|trend|volatility|volume)\s+\w+(?:\s+\w+){0,2}\b',
                r'\b\w+(?:\s+\w+){0,2}\s+(?:trading|strategy|analysis|pattern|opportunity|risk|management)\b',
                r'\$[A-Z]{1,5}\s+\w+(?:\s+\w+){0,2}'  # Symbol-related phrases
            ]
            
            phrases = set()
            for pattern in phrase_patterns:
                matches = re.findall(pattern, text_lower)
                phrases.update(matches[:max_phrases//len(phrase_patterns)])

            return list(phrases)[:max_phrases]

        except Exception as e:
            logger.error(f"Error extracting key phrases: {str(e)}")
            return []

    def summarize_content(self, content: str, max_length: int = 200) -> str:
        """Create a summary of content with specified max length."""
        try:
            if not content or not isinstance(content, str):
                return ""

            # If content is already short enough, return as is
            if len(content) <= max_length:
                return content

            # Simple summarization by taking first sentences up to max_length
            sentences = re.split(r'[.!?]+', content)
            summary = ""
            
            for sentence in sentences:
                sentence = sentence.strip()
                if not sentence:
                    continue
                    
                # Check if adding this sentence would exceed max_length
                if len(summary + sentence) <= max_length - 3:  # -3 for "..."
                    summary += sentence + ". "
                else:
                    break

            # If we have content but it's still too long, truncate
            if not summary.strip() and content:
                summary = content[:max_length-3] + "..."
            elif summary and len(summary) < max_length:
                summary = summary.strip()
            else:
                summary = summary[:max_length-3] + "..."

            return summary

        except Exception as e:
            logger.error(f"Error summarizing content: {str(e)}")
            return content[:max_length] if content else ""

    def validate_json_content(self, content: str) -> Dict[str, Any]:
        """Validate and parse JSON content with error handling."""
        try:
            if not content:
                return {}

            # Try to parse as JSON
            parsed = json.loads(content)
            return parsed if isinstance(parsed, dict) else {"content": parsed}

        except json.JSONDecodeError as e:
            logger.warning(f"Invalid JSON content: {str(e)}")
            # Try to extract JSON-like content with regex
            json_pattern = r'\{[^{}]*\}'
            matches = re.findall(json_pattern, content)
            
            for match in matches:
                try:
                    parsed = json.loads(match)
                    return parsed if isinstance(parsed, dict) else {"content": parsed}
                except json.JSONDecodeError:
                    continue
            
            # Return content as a simple dict if no valid JSON found
            return {"content": content}

        except Exception as e:
            logger.error(f"Error validating JSON content: {str(e)}")
            return {"content": content, "error": str(e)}

    def format_trading_data(self, data: Dict[str, Any]) -> str:
        """Format trading data for display or processing."""
        try:
            if not data:
                return "No trading data available"

            formatted_parts = []

            # Format analytics if available
            if 'analytics' in data:
                analytics = data['analytics']
                if analytics:
                    formatted_parts.append("📊 Performance Metrics:")
                    
                    if 'total_pnl' in analytics:
                        pnl = analytics['total_pnl']
                        pnl_str = f"${pnl:,.2f}" if isinstance(pnl, (int, float)) else str(pnl)
                        formatted_parts.append(f"  • P&L: {pnl_str}")
                    
                    if 'win_rate' in analytics:
                        win_rate = analytics['win_rate']
                        if isinstance(win_rate, (int, float)):
                            formatted_parts.append(f"  • Win Rate: {win_rate:.1%}")
                    
                    if 'total_trades' in analytics:
                        trades = analytics['total_trades']
                        formatted_parts.append(f"  • Total Trades: {trades}")

            # Format recent trades if available
            if 'recent_trades' in data and data['recent_trades']:
                formatted_parts.append("\n🔄 Recent Trading Activity:")
                for trade in data['recent_trades'][:3]:  # Show top 3
                    symbol = trade.get('symbol', 'Unknown')
                    pnl = trade.get('pnl', 0)
                    pnl_str = f"${pnl:,.2f}" if isinstance(pnl, (int, float)) else str(pnl)
                    formatted_parts.append(f"  • {symbol}: {pnl_str}")

            # Add summary if available
            if 'message' in data:
                formatted_parts.append(f"\n📝 Summary: {data['message']}")

            return "\n".join(formatted_parts) if formatted_parts else "Trading data available but not formatted"

        except Exception as e:
            logger.error(f"Error formatting trading data: {str(e)}")
            return f"Trading data formatting error: {str(e)}"

    def get_processor_status(self) -> Dict[str, Any]:
        """Get current status of the content processor."""
        return {
            "available_functions": [
                "extract_insights_and_recommendations",
                "format_chat_history", 
                "extract_symbols_from_query",
                "extract_actions_from_insight",
                "clean_ai_response",
                "extract_key_phrases",
                "summarize_content",
                "validate_json_content",
                "format_trading_data"
            ],
            "supported_content_types": [
                "text", "json", "chat_history", "trading_data", "ai_responses"
            ],
            "ready": True
        }