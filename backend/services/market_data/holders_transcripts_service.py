# backend/services/market_data/holders_transcripts_service.py

from typing import Optional, List, Dict, Any
from datetime import date, datetime
from .base_service import BaseMarketDataService
from models.market_data import (
    # Holders Models
    HolderData,
    InstitutionalHolder,
    MutualFundHolder,
    InsiderTransaction,
    InsiderPurchasesSummary,
    InsiderRoster,
    HolderStatistics,
    HolderSearchResult,
    HolderParticipant,
    # Earnings Transcripts Models
    EarningsTranscript,
    EarningsTranscriptMetadata,
    TranscriptStatistics,
    TranscriptSearchResult,
    TranscriptParticipant,
    TranscriptQuarter,
    # Request Models
    HoldersRequest,
    InsiderTransactionsRequest,
    HoldersSearchRequest,
    HoldersPaginatedRequest,
    TranscriptsRequest,
    TranscriptSearchRequest,
    TranscriptsByDateRequest,
    TranscriptsPaginatedRequest,
)

class HoldersTranscriptsService(BaseMarketDataService):
    """Service for holders and earnings transcripts operations."""

    # =====================================================
    # INSTITUTIONAL HOLDERS METHODS
    # =====================================================

    async def get_institutional_holders(
        self, 
        symbol: str,
        date_reported: Optional[datetime] = None,
        limit: int = 50,
        access_token: str = None
    ) -> List[InstitutionalHolder]:
        """Get institutional holders for a symbol."""
        async def operation(client):
            response = client.rpc(
                'get_institutional_holders',
                {
                    'p_symbol': symbol.upper(),
                    'p_date_reported': date_reported.isoformat() if date_reported else None,
                    'p_limit': limit
                }
            ).execute()
            
            return [InstitutionalHolder(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_mutualfund_holders(
        self, 
        symbol: str,
        date_reported: Optional[datetime] = None,
        limit: int = 50,
        access_token: str = None
    ) -> List[MutualFundHolder]:
        """Get mutual fund holders for a symbol."""
        async def operation(client):
            response = client.rpc(
                'get_mutualfund_holders',
                {
                    'p_symbol': symbol.upper(),
                    'p_date_reported': date_reported.isoformat() if date_reported else None,
                    'p_limit': limit
                }
            ).execute()
            
            return [MutualFundHolder(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # INSIDER TRANSACTIONS METHODS
    # =====================================================

    async def get_insider_transactions(
        self, 
        symbol: str,
        transaction_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
        access_token: str = None
    ) -> List[InsiderTransaction]:
        """Get insider transactions for a symbol."""
        async def operation(client):
            response = client.rpc(
                'get_insider_transactions',
                {
                    'p_symbol': symbol.upper(),
                    'p_transaction_type': transaction_type,
                    'p_start_date': start_date.isoformat() if start_date else None,
                    'p_end_date': end_date.isoformat() if end_date else None,
                    'p_limit': limit
                }
            ).execute()
            
            return [InsiderTransaction(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_insider_purchases_summary(
        self, 
        symbol: str,
        summary_period: Optional[str] = None,
        access_token: str = None
    ) -> List[InsiderPurchasesSummary]:
        """Get insider purchases summary for a symbol."""
        async def operation(client):
            response = client.rpc(
                'get_insider_purchases_summary',
                {
                    'p_symbol': symbol.upper(),
                    'p_summary_period': summary_period
                }
            ).execute()
            
            return [InsiderPurchasesSummary(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_insider_roster(
        self, 
        symbol: str,
        limit: int = 100,
        access_token: str = None
    ) -> List[InsiderRoster]:
        """Get insider roster for a symbol."""
        async def operation(client):
            response = client.rpc(
                'get_insider_roster',
                {
                    'p_symbol': symbol.upper(),
                    'p_limit': limit
                }
            ).execute()
            
            return [InsiderRoster(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # HOLDERS COMBINED METHODS
    # =====================================================

    async def get_all_holders(
        self, 
        symbol: str,
        holder_type: Optional[str] = None,
        limit: int = 100,
        access_token: str = None
    ) -> List[HolderData]:
        """Get all holder types for a symbol."""
        async def operation(client):
            response = client.rpc(
                'get_all_holders',
                {
                    'p_symbol': symbol.upper(),
                    'p_holder_type': holder_type,
                    'p_limit': limit
                }
            ).execute()
            
            return [HolderData(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_top_institutional_holders(
        self, 
        order_by: str = 'shares',
        limit: int = 50,
        access_token: str = None
    ) -> List[InstitutionalHolder]:
        """Get top institutional holders across all symbols."""
        async def operation(client):
            response = client.rpc(
                'get_top_institutional_holders',
                {
                    'p_order_by': order_by,
                    'p_limit': limit
                }
            ).execute()
            
            return [InstitutionalHolder(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_recent_insider_transactions(
        self, 
        transaction_type: Optional[str] = None,
        days_back: int = 30,
        limit: int = 100,
        access_token: str = None
    ) -> List[InsiderTransaction]:
        """Get recent insider transactions across all symbols."""
        async def operation(client):
            response = client.rpc(
                'get_recent_insider_transactions',
                {
                    'p_transaction_type': transaction_type,
                    'p_days_back': days_back,
                    'p_limit': limit
                }
            ).execute()
            
            return [InsiderTransaction(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_holder_statistics(
        self, 
        symbol: str,
        access_token: str = None
    ) -> List[HolderStatistics]:
        """Get holder statistics for a symbol."""
        async def operation(client):
            response = client.rpc(
                'get_holder_statistics',
                {
                    'p_symbol': symbol.upper()
                }
            ).execute()
            
            return [HolderStatistics(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def search_holders_by_name(
        self, 
        name_pattern: str,
        holder_type: Optional[str] = None,
        limit: int = 50,
        access_token: str = None
    ) -> List[HolderSearchResult]:
        """Search holders by name pattern."""
        async def operation(client):
            response = client.rpc(
                'search_holders_by_name',
                {
                    'p_name_pattern': name_pattern,
                    'p_holder_type': holder_type,
                    'p_limit': limit
                }
            ).execute()
            
            return [HolderSearchResult(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_holders_paginated(
        self, 
        symbol: Optional[str] = None,
        holder_type: Optional[str] = None,
        offset: int = 0,
        limit: int = 50,
        sort_column: str = 'shares',
        sort_direction: str = 'DESC',
        access_token: str = None
    ) -> List[HolderData]:
        """Get paginated holders with flexible sorting."""
        async def operation(client):
            response = client.rpc(
                'get_holders_paginated',
                {
                    'p_symbol': symbol.upper() if symbol else None,
                    'p_holder_type': holder_type,
                    'p_offset': offset,
                    'p_limit': limit,
                    'p_sort_column': sort_column,
                    'p_sort_direction': sort_direction
                }
            ).execute()
            
            return [HolderData(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # EARNINGS TRANSCRIPTS METHODS
    # =====================================================

    async def get_earnings_transcripts(
        self, 
        symbol: str,
        limit: int = 10,
        access_token: str = None
    ) -> List[EarningsTranscript]:
        """Get earnings transcripts for a symbol."""
        async def operation(client):
            response = client.rpc(
                'get_earnings_transcripts',
                {
                    'p_symbol': symbol.upper(),
                    'p_limit': limit
                }
            ).execute()
            
            return [EarningsTranscript(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_earnings_transcript_by_period(
        self, 
        symbol: str,
        year: int,
        quarter: str,
        access_token: str = None
    ) -> Optional[EarningsTranscript]:
        """Get specific earnings transcript by period."""
        async def operation(client):
            response = client.rpc(
                'get_earnings_transcript_by_period',
                {
                    'p_symbol': symbol.upper(),
                    'p_year': year,
                    'p_quarter': quarter.upper()
                }
            ).execute()
            
            if response.data and len(response.data) > 0:
                return EarningsTranscript(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    async def get_latest_earnings_transcript(
        self, 
        symbol: str,
        access_token: str = None
    ) -> Optional[EarningsTranscript]:
        """Get latest earnings transcript for a symbol."""
        async def operation(client):
            response = client.rpc(
                'get_latest_earnings_transcript',
                {
                    'p_symbol': symbol.upper()
                }
            ).execute()
            
            if response.data and len(response.data) > 0:
                return EarningsTranscript(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    async def get_recent_earnings_transcripts(
        self, 
        days_back: int = 90,
        limit: int = 50,
        access_token: str = None
    ) -> List[EarningsTranscriptMetadata]:
        """Get recent earnings transcripts across all symbols."""
        async def operation(client):
            response = client.rpc(
                'get_recent_earnings_transcripts',
                {
                    'p_days_back': days_back,
                    'p_limit': limit
                }
            ).execute()
            
            return [EarningsTranscriptMetadata(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def search_earnings_transcripts(
        self, 
        search_text: str,
        symbol: Optional[str] = None,
        limit: int = 20,
        access_token: str = None
    ) -> List[TranscriptSearchResult]:
        """Search transcripts by text content."""
        async def operation(client):
            response = client.rpc(
                'search_earnings_transcripts',
                {
                    'p_search_text': search_text,
                    'p_symbol': symbol.upper() if symbol else None,
                    'p_limit': limit
                }
            ).execute()
            
            return [TranscriptSearchResult(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_transcripts_by_participant(
        self, 
        participant_name: str,
        symbol: Optional[str] = None,
        limit: int = 20,
        access_token: str = None
    ) -> List[EarningsTranscriptMetadata]:
        """Get transcripts by participant."""
        async def operation(client):
            response = client.rpc(
                'get_transcripts_by_participant',
                {
                    'p_participant_name': participant_name,
                    'p_symbol': symbol.upper() if symbol else None,
                    'p_limit': limit
                }
            ).execute()
            
            return [EarningsTranscriptMetadata(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_transcripts_by_date_range(
        self, 
        start_date: datetime,
        end_date: datetime,
        symbol: Optional[str] = None,
        limit: int = 100,
        access_token: str = None
    ) -> List[EarningsTranscriptMetadata]:
        """Get transcripts by date range."""
        async def operation(client):
            response = client.rpc(
                'get_transcripts_by_date_range',
                {
                    'p_start_date': start_date.isoformat(),
                    'p_end_date': end_date.isoformat(),
                    'p_symbol': symbol.upper() if symbol else None,
                    'p_limit': limit
                }
            ).execute()
            
            return [EarningsTranscriptMetadata(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_transcripts_by_year(
        self, 
        year: int,
        symbol: Optional[str] = None,
        limit: int = 100,
        access_token: str = None
    ) -> List[EarningsTranscriptMetadata]:
        """Get transcripts by year."""
        async def operation(client):
            response = client.rpc(
                'get_transcripts_by_year',
                {
                    'p_year': year,
                    'p_symbol': symbol.upper() if symbol else None,
                    'p_limit': limit
                }
            ).execute()
            
            return [EarningsTranscriptMetadata(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_transcript_statistics(
        self, 
        symbol: str,
        access_token: str = None
    ) -> Optional[TranscriptStatistics]:
        """Get transcript statistics for a symbol."""
        async def operation(client):
            response = client.rpc(
                'get_transcript_statistics',
                {
                    'p_symbol': symbol.upper()
                }
            ).execute()
            
            if response.data and len(response.data) > 0:
                return TranscriptStatistics(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    async def get_transcript_metadata(
        self, 
        symbol: Optional[str] = None,
        limit: int = 50,
        access_token: str = None
    ) -> List[EarningsTranscriptMetadata]:
        """Get transcript metadata without full text."""
        async def operation(client):
            response = client.rpc(
                'get_transcript_metadata',
                {
                    'p_symbol': symbol.upper() if symbol else None,
                    'p_limit': limit
                }
            ).execute()
            
            return [EarningsTranscriptMetadata(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_transcripts_paginated(
        self, 
        symbol: Optional[str] = None,
        year: Optional[int] = None,
        quarter: Optional[str] = None,
        offset: int = 0,
        limit: int = 20,
        sort_column: str = 'date',
        sort_direction: str = 'DESC',
        access_token: str = None
    ) -> List[EarningsTranscriptMetadata]:
        """Get paginated transcripts with flexible sorting."""
        async def operation(client):
            response = client.rpc(
                'get_transcripts_paginated',
                {
                    'p_symbol': symbol.upper() if symbol else None,
                    'p_year': year,
                    'p_quarter': quarter.upper() if quarter else None,
                    'p_offset': offset,
                    'p_limit': limit,
                    'p_sort_column': sort_column,
                    'p_sort_direction': sort_direction
                }
            ).execute()
            
            return [EarningsTranscriptMetadata(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_unique_participants(
        self, 
        symbol: Optional[str] = None,
        limit: int = 100,
        access_token: str = None
    ) -> List[TranscriptParticipant]:
        """Get unique participants across transcripts."""
        async def operation(client):
            response = client.rpc(
                'get_unique_participants',
                {
                    'p_symbol': symbol.upper() if symbol else None,
                    'p_limit': limit
                }
            ).execute()
            
            return [TranscriptParticipant(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_transcript_count_by_quarter(
        self, 
        symbol: Optional[str] = None,
        access_token: str = None
    ) -> List[TranscriptQuarter]:
        """Get transcript count by quarter."""
        async def operation(client):
            response = client.rpc(
                'get_transcript_count_by_quarter',
                {
                    'p_symbol': symbol.upper() if symbol else None
                }
            ).execute()
            
            return [TranscriptQuarter(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)
