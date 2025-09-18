"""
Data Access Layer (DAL) for AI Services
Provides abstraction between AI business logic and database operations
"""

from .base_dal import BaseDAL
from .ai_chat_dal import AIChatDAL
from .ai_insights_dal import AIInsightsDAL
from .ai_reports_dal import AIReportsDAL

__all__ = [
    'BaseDAL',
    'AIChatDAL', 
    'AIInsightsDAL',
    'AIReportsDAL'
]
