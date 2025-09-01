"""
Earnings data fetching jobs.
Handles earnings data, calendar, and transcripts.
"""

import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime, timedelta

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain


logger = logging.getLogger(__name__)


class EarningsDataJob(BaseMarketDataJob):
    """Job for fetching and storing earnings data."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch earnings data for given symbols."""
        try:
            logger.info(f"Fetching earnings data for {len(symbols)} symbols")
            earnings_data = {}
            
            for symbol in symbols:
                try:
                    data = await self.orchestrator.get_earnings_data(symbol)
                    if data:
                        earnings_data[symbol] = data
                    await asyncio.sleep(1)
                except Exception as e:
                    logger.error(f"Failed to fetch earnings for {symbol}: {e}")
                    continue
            
            return earnings_data
        except Exception as e:
            logger.error(f"Error fetching earnings data: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store earnings data using database upsert function."""
        if not data:
            return True
        
        try:
            success_count = 0
            
            for symbol, earnings in data.items():
                try:
                    await self.db_service.execute_function(
                        "upsert_earnings_data",
                        p_symbol=symbol,
                        p_fiscal_date_ending=earnings.get('fiscal_date_ending'),
                        p_reported_date=earnings.get('reported_date'),
                        p_reported_eps=earnings.get('reported_eps'),
                        p_estimated_eps=earnings.get('estimated_eps'),
                        p_surprise=earnings.get('surprise'),
                        p_surprise_percentage=earnings.get('surprise_percentage'),
                        p_data_provider=earnings.get('provider', 'unknown')
                    )
                    success_count += 1
                except Exception as e:
                    logger.error(f"Failed to store earnings for {symbol}: {e}")
            
            logger.info(f"Stored {success_count}/{len(data)} earnings records")
            return success_count == len(data)
        except Exception as e:
            logger.error(f"Error storing earnings data: {e}")
            return False


class EarningsCalendarJob(BaseMarketDataJob):
    """Job for fetching and storing earnings calendar."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch earnings calendar data."""
        try:
            logger.info("Fetching earnings calendar")
            
            # Get upcoming earnings for next 30 days
            end_date = datetime.now().date() + timedelta(days=30)
            calendar_data = await self.orchestrator.get_earnings_calendar(
                start_date=datetime.now().date(),
                end_date=end_date
            )
            
            return {"calendar": calendar_data}
        except Exception as e:
            logger.error(f"Error fetching earnings calendar: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store earnings calendar using database upsert function."""
        calendar_data = data.get("calendar", [])
        if not calendar_data:
            return True
        
        try:
            success_count = 0
            
            for event in calendar_data:
                try:
                    await self.db_service.execute_function(
                        "upsert_earnings_calendar",
                        p_symbol=event.get('symbol'),
                        p_company_name=event.get('company_name'),
                        p_report_date=event.get('report_date'),
                        p_fiscal_date_ending=event.get('fiscal_date_ending'),
                        p_estimate=event.get('estimate'),
                        p_currency=event.get('currency'),
                        p_data_provider=event.get('provider', 'unknown')
                    )
                    success_count += 1
                except Exception as e:
                    logger.error(f"Failed to store earnings calendar event: {e}")
            
            logger.info(f"Stored {success_count}/{len(calendar_data)} calendar events")
            return success_count == len(calendar_data)
        except Exception as e:
            logger.error(f"Error storing earnings calendar: {e}")
            return False


class EarningsTranscriptsJob(BaseMarketDataJob):
    """Job for fetching and storing earnings call transcripts."""
    
    def __init__(self, database_service, market_data_orchestrator: MarketDataBrain):
        super().__init__(database_service)
        self.orchestrator = market_data_orchestrator
    
    async def fetch_data(self, symbols: List[str]) -> Dict[str, Any]:
        """Fetch earnings transcripts for given symbols."""
        try:
            logger.info(f"Fetching earnings transcripts for {len(symbols)} symbols")
            transcripts_data = {}
            
            for symbol in symbols:
                try:
                    transcripts = await self.orchestrator.get_earnings_transcripts(symbol)
                    if transcripts:
                        transcripts_data[symbol] = transcripts
                    await asyncio.sleep(2)  # Longer delay for transcript data
                except Exception as e:
                    logger.error(f"Failed to fetch transcripts for {symbol}: {e}")
                    continue
            
            return transcripts_data
        except Exception as e:
            logger.error(f"Error fetching transcripts: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store earnings transcripts using database upsert function."""
        if not data:
            return True
        
        try:
            success_count = 0
            total_records = 0
            
            for symbol, transcripts in data.items():
                if not isinstance(transcripts, list):
                    continue
                
                for transcript in transcripts:
                    try:
                        await self.db_service.execute_function(
                            "upsert_earnings_transcript",
                            p_symbol=symbol,
                            p_fiscal_date_ending=transcript.get('fiscal_date_ending'),
                            p_report_date=transcript.get('report_date'),
                            p_transcript_text=transcript.get('transcript'),
                            p_data_provider=transcript.get('provider', 'unknown')
                        )
                        success_count += 1
                    except Exception as e:
                        logger.error(f"Failed to store transcript for {symbol}: {e}")
                    
                    total_records += 1
            
            logger.info(f"Stored {success_count}/{total_records} transcript records")
            return success_count == total_records
        except Exception as e:
            logger.error(f"Error storing transcripts: {e}")
            return False
