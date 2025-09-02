"""
Scheduler configuration for market data fetching jobs.
Defines schedules for different data types based on market requirements.
"""

from dataclasses import dataclass
from typing import Dict, List
from datetime import time


@dataclass
class JobConfig:
    """Configuration for a scheduled job."""
    name: str
    interval_seconds: int
    market_hours_only: bool = True
    description: str = ""


class SchedulerConfig:
    """Central configuration for all market data scheduling."""
    
    # Market hours (EST/EDT)
    MARKET_OPEN = time(9, 30)  # 9:30 AM
    MARKET_CLOSE = time(16, 0)  # 4:00 PM
    
    # Job configurations for each data type
    JOBS: Dict[str, JobConfig] = {
        # Real-time data (during market hours)
        "stock_quotes": JobConfig(
            name="Stock Quotes",
            interval_seconds=60,  # Every minute
            market_hours_only=True,
            description="Real-time stock price quotes"
        ),
        
        "options_chain": JobConfig(
            name="Options Chain",
            interval_seconds=300,  # Every 5 minutes
            market_hours_only=True,
            description="Options chain data for tracked symbols"
        ),
        
        # Daily data (after market close)
        "historical_prices": JobConfig(
            name="Historical Prices",
            interval_seconds=86400,  # Daily
            market_hours_only=False,
            description="End-of-day historical price data"
        ),
        
        "company_info": JobConfig(
            name="Company Information",
            interval_seconds=604800,  # Weekly
            market_hours_only=False,
            description="Company profile and basic information"
        ),
        
        "fundamental_data": JobConfig(
            name="Fundamental Data",
            interval_seconds=86400,  # Daily
            market_hours_only=False,
            description="Financial ratios and fundamental metrics"
        ),
        
        "dividend_data": JobConfig(
            name="Dividend Data",
            interval_seconds=86400,  # Daily
            market_hours_only=False,
            description="Dividend announcements and payments"
        ),
        
        "earnings_data": JobConfig(
            name="Earnings Data",
            interval_seconds=21600,  # Every 6 hours
            market_hours_only=False,
            description="Quarterly earnings reports"
        ),
        
        "earnings_calendar": JobConfig(
            name="Earnings Calendar",
            interval_seconds=43200,  # Every 12 hours
            market_hours_only=False,
            description="Upcoming earnings announcements"
        ),
        
        "earnings_transcripts": JobConfig(
            name="Earnings Transcripts",
            interval_seconds=86400,  # Daily
            market_hours_only=False,
            description="Earnings call transcripts"
        ),
        
        "news_data": JobConfig(
            name="News Data",
            interval_seconds=1800,  # Every 30 minutes
            market_hours_only=False,
            description="Financial news and market updates"
        ),
        
        "economic_events": JobConfig(
            name="Economic Events",
            interval_seconds=43200,  # Every 12 hours
            market_hours_only=False,
            description="Economic calendar events"
        ),
        
        "economic_indicators": JobConfig(
            name="Economic Indicators",
            interval_seconds=86400,  # Daily
            market_hours_only=False,
            description="Economic indicators and data releases"
        )
    }
    
    # Note: Symbols are now dynamically fetched from database
    # via DatabaseService.get_tracked_symbols() method
    
    # Timezone for market hours
    MARKET_TIMEZONE = "America/New_York"
    
    @classmethod
    def get_job_config(cls, job_name: str) -> JobConfig:
        """Get configuration for a specific job."""
        if job_name not in cls.JOBS:
            raise ValueError(f"Unknown job: {job_name}")
        return cls.JOBS[job_name]
    
    @classmethod
    def get_all_jobs(cls) -> Dict[str, JobConfig]:
        """Get all job configurations."""
        return cls.JOBS.copy()
