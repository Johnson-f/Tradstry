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
                    # Extract exchange information if available
                    exchange_info = earnings.get('exchange', {})
                    
                    await self.db_service.execute_function(
                        "upsert_earnings_data",
                        p_symbol=symbol,
                        p_fiscal_year=earnings.get('fiscal_year'),
                        p_fiscal_quarter=earnings.get('fiscal_quarter'),
                        p_reported_date=earnings.get('reported_date'),
                        p_data_provider=earnings.get('provider', 'unknown'),
                        
                        # Exchange parameters for automatic exchange handling
                        p_exchange_code=exchange_info.get('code') or earnings.get('exchange_code'),
                        p_exchange_name=exchange_info.get('name') or earnings.get('exchange_name'),
                        p_exchange_country=exchange_info.get('country') or earnings.get('country'),
                        p_exchange_timezone=exchange_info.get('timezone') or earnings.get('timezone'),
                        
                        # Earnings parameters matching SQL function signature
                        p_report_type=earnings.get('report_type', 'quarterly'),
                        p_eps=earnings.get('eps') or earnings.get('reported_eps'),
                        p_eps_estimated=earnings.get('eps_estimated') or earnings.get('estimated_eps'),
                        p_eps_surprise=earnings.get('eps_surprise') or earnings.get('surprise'),
                        p_eps_surprise_percent=earnings.get('eps_surprise_percent') or earnings.get('surprise_percentage'),
                        p_revenue=earnings.get('revenue'),
                        p_revenue_estimated=earnings.get('revenue_estimated'),
                        p_revenue_surprise=earnings.get('revenue_surprise'),
                        p_revenue_surprise_percent=earnings.get('revenue_surprise_percent'),
                        p_net_income=earnings.get('net_income'),
                        p_gross_profit=earnings.get('gross_profit'),
                        p_operating_income=earnings.get('operating_income'),
                        p_ebitda=earnings.get('ebitda'),
                        p_operating_margin=earnings.get('operating_margin'),
                        p_net_margin=earnings.get('net_margin'),
                        p_year_over_year_eps_growth=earnings.get('year_over_year_eps_growth'),
                        p_year_over_year_revenue_growth=earnings.get('year_over_year_revenue_growth'),
                        p_guidance=earnings.get('guidance'),
                        p_next_year_eps_guidance=earnings.get('next_year_eps_guidance'),
                        p_next_year_revenue_guidance=earnings.get('next_year_revenue_guidance'),
                        p_conference_call_date=earnings.get('conference_call_date'),
                        p_transcript_url=earnings.get('transcript_url'),
                        p_audio_url=earnings.get('audio_url'),
                        p_eps_beat_miss_met=earnings.get('eps_beat_miss_met'),
                        p_revenue_beat_miss_met=earnings.get('revenue_beat_miss_met')
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
                    # Extract exchange information if available
                    exchange_info = event.get('exchange', {})
                    
                    await self.db_service.execute_function(
                        "upsert_earnings_calendar",
                        p_symbol=event.get('symbol'),
                        p_data_provider=event.get('provider', 'unknown'),
                        p_earnings_date=event.get('earnings_date') or event.get('report_date'),
                        p_fiscal_year=event.get('fiscal_year'),
                        p_fiscal_quarter=event.get('fiscal_quarter'),
                        
                        # Exchange parameters for automatic exchange handling
                        p_exchange_code=exchange_info.get('code') or event.get('exchange_code'),
                        p_exchange_name=exchange_info.get('name') or event.get('exchange_name'),
                        p_exchange_country=exchange_info.get('country') or event.get('country'),
                        p_exchange_timezone=exchange_info.get('timezone') or event.get('timezone'),
                        
                        # Calendar parameters matching SQL function signature
                        p_time_of_day=event.get('time_of_day'),
                        p_eps=event.get('eps'),
                        p_eps_estimated=event.get('eps_estimated') or event.get('estimate'),
                        p_eps_surprise=event.get('eps_surprise'),
                        p_eps_surprise_percent=event.get('eps_surprise_percent'),
                        p_revenue=event.get('revenue'),
                        p_revenue_estimated=event.get('revenue_estimated'),
                        p_revenue_surprise=event.get('revenue_surprise'),
                        p_revenue_surprise_percent=event.get('revenue_surprise_percent'),
                        p_fiscal_date_ending=event.get('fiscal_date_ending'),
                        p_market_cap_at_time=event.get('market_cap_at_time'),
                        p_sector=event.get('sector'),
                        p_industry=event.get('industry'),
                        p_conference_call_date=event.get('conference_call_date'),
                        p_conference_call_time=event.get('conference_call_time'),
                        p_webcast_url=event.get('webcast_url'),
                        p_transcript_available=event.get('transcript_available', False),
                        p_status=event.get('status', 'scheduled'),
                        p_last_updated=event.get('last_updated'),
                        p_update_source=event.get('update_source')
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
                        # Extract exchange information if available
                        exchange_info = transcript.get('exchange', {})
                        
                        # Store main transcript
                        transcript_id = await self.db_service.execute_function(
                            "upsert_earnings_transcripts",
                            p_symbol=symbol,
                            p_earnings_date=transcript.get('earnings_date') or transcript.get('report_date'),
                            p_fiscal_quarter=transcript.get('fiscal_quarter'),
                            p_fiscal_year=transcript.get('fiscal_year'),
                            p_full_transcript=transcript.get('full_transcript') or transcript.get('transcript'),
                            p_data_provider=transcript.get('provider', 'unknown'),
                            
                            # Exchange parameters for automatic exchange handling
                            p_exchange_code=exchange_info.get('code') or transcript.get('exchange_code'),
                            p_exchange_name=exchange_info.get('name') or transcript.get('exchange_name'),
                            p_exchange_country=exchange_info.get('country') or transcript.get('country'),
                            p_exchange_timezone=exchange_info.get('timezone') or transcript.get('timezone'),
                            
                            # Transcript parameters matching SQL function signature
                            p_transcript_title=transcript.get('transcript_title'),
                            p_transcript_length=transcript.get('transcript_length'),
                            p_transcript_language=transcript.get('transcript_language', 'en'),
                            p_conference_call_date=transcript.get('conference_call_date'),
                            p_conference_call_duration=transcript.get('conference_call_duration'),
                            p_audio_recording_url=transcript.get('audio_recording_url'),
                            p_presentation_url=transcript.get('presentation_url'),
                            p_reported_eps=transcript.get('reported_eps'),
                            p_reported_revenue=transcript.get('reported_revenue'),
                            p_guidance_eps=transcript.get('guidance_eps'),
                            p_guidance_revenue=transcript.get('guidance_revenue'),
                            p_overall_sentiment=transcript.get('overall_sentiment'),
                            p_confidence_score=transcript.get('confidence_score'),
                            p_key_themes=transcript.get('key_themes'),
                            p_risk_factors=transcript.get('risk_factors'),
                            p_transcript_quality=transcript.get('transcript_quality', 'complete')
                        )
                        
                        # Store participants if available
                        participants = transcript.get('participants', [])
                        for participant in participants:
                            try:
                                await self.db_service.execute_function(
                                    "upsert_transcript_participants",
                                    p_transcript_id=transcript_id,
                                    p_participant_name=participant.get('name'),
                                    p_participant_title=participant.get('title'),
                                    p_participant_company=participant.get('company'),
                                    p_participant_type=participant.get('type'),
                                    p_speaking_time=participant.get('speaking_time'),
                                    p_question_count=participant.get('question_count', 0)
                                )
                            except Exception as e:
                                logger.error(f"Failed to store participant {participant.get('name')}: {e}")
                        
                        success_count += 1
                    except Exception as e:
                        logger.error(f"Failed to store transcript for {symbol}: {e}")
                    
                    total_records += 1
            
            logger.info(f"Stored {success_count}/{total_records} transcript records")
            return success_count == total_records
        except Exception as e:
            logger.error(f"Error storing transcripts: {e}")
            return False
