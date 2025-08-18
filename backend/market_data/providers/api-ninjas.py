"""API-Ninjas market data provider implementation"""

import aiohttp
import asyncio
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any, Union
from decimal import Decimal
import logging
from ..base import (
    MarketDataProvider,
    StockQuote,
    HistoricalPrice,
    EarningsCalendar,
    EarningsCallTranscript
)

logger = logging.getLogger(__name__)

class APINinjasProvider(MarketDataProvider):
    """
    API-Ninjas market data provider implementation.
    Documentation: https://api-ninjas.com/api
    """
    
    BASE_URL = "https://api.api-ninjas.com/v1"
    
    def __init__(self, api_key: str):
        """
        Initialize API-Ninjas provider.
        
        Args:
            api_key: Your API-Ninjas API key
        """
        super().__init__(api_key=api_key, name="api-ninjas")
        self.base_url = self.BASE_URL
        self.rate_limit_per_minute = 200  # Free tier limit
        self.session = None
        
    async def _ensure_session(self) -> None:
        """Ensure we have an active aiohttp session"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                headers={"X-Api-Key": self.api_key}
            )
            
    async def close(self) -> None:
        """Close the client session"""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None
            
    async def __aenter__(self):
        await self._ensure_session()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
        
    async def _make_request(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Any:
        """
        Make a request to the API-Ninjas API
        
        Args:
            endpoint: API endpoint (without base URL)
            params: Query parameters
            
        Returns:
            Parsed JSON response or None if request failed
        """
        if params is None:
            params = {}
            
        try:
            await self._ensure_session()
            url = f"{self.base_url}/{endpoint.lstrip('/')}"
            
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    return await response.json()
                elif response.status == 429:
                    retry_after = int(response.headers.get('Retry-After', '60'))
                    self._log_error("Rate limit exceeded", 
                                  f"Waiting {retry_after} seconds")
                    await asyncio.sleep(retry_after)
                    return await self._make_request(endpoint, params)
                else:
                    error_text = await response.text()
                    self._log_error(f"API Error {response.status}", error_text)
                    return None
                    
        except Exception as e:
            self._log_error("Request failed", str(e))
            return None
            
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """
        Get a motivational quote.
        
        Note: The symbol parameter is kept for compatibility but not used,
        as the quotes API doesn't support filtering by symbol.
        """
        data = await self._make_request("quotes")
        
        if not data or not isinstance(data, list) or len(data) == 0:
            return None
            
        try:
            quote_data = data[0]  # Get the first quote
            
            # For compatibility with StockQuote model, we'll map the quote data
            # to the available fields in a creative way
            quote_text = quote_data.get('quote', '')
            author = quote_data.get('author', 'Unknown')
            
            # Use the quote text length as a proxy for 'price'
            # and author name length as 'volume' for the stock quote model
            quote_length = len(quote_text)
            
            return StockQuote(
                symbol=author.replace(' ', '.')[:5].upper() or 'QUOTE',
                price=Decimal(quote_length),
                change=Decimal(0),  # Not applicable for quotes
                change_percent=Decimal(0),  # Not applicable for quotes
                volume=len(author),  # Author name length as volume
                open=Decimal(quote_length),  # Same as price for simplicity
                high=Decimal(quote_length),  # Same as price for simplicity
                low=Decimal(quote_length),   # Same as price for simplicity
                previous_close=Decimal(quote_length),  # Same as price for simplicity
                timestamp=datetime.utcnow(),
                provider=self.name,
                # Store the actual quote data in the metadata field
                metadata={
                    'quote': quote_text,
                    'author': author,
                    'category': quote_data.get('category', '')
                }
            )
        except Exception as e:
            self._log_error("Failed to parse quote", str(e))
            return None
            
    async def get_earnings_calendar(
        self,
        symbol: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 10
    ) -> List[EarningsCalendar]:
        """
        Get earnings calendar data
        
        Args:
            symbol: Stock symbol to filter by
            start_date: Start date for the calendar
            end_date: End date for the calendar
            limit: Maximum number of results to return
            
        Returns:
            List of EarningsCalendar objects
        """
        params = {}
        if symbol:
            params['ticker'] = symbol
        if start_date:
            params['from'] = start_date.isoformat()
        if end_date:
            params['to'] = end_date.isoformat()
            
        data = await self._make_request("earningscalendar", params=params)
        
        if not data or not isinstance(data, list):
            return []
            
        try:
            results = []
            for item in data[:limit]:
                # Parse date
                report_date = datetime.strptime(
                    item['date'], 
                    '%Y-%m-%d'
                ).date() if 'date' in item else None
                
                # Parse fiscal date ending
                fiscal_date = None
                if 'fiscal_date_ending' in item:
                    try:
                        fiscal_date = datetime.strptime(
                            item['fiscal_date_ending'],
                            '%Y-%m-%d'
                        ).date()
                    except (ValueError, TypeError):
                        pass
                        
                # Parse EPS and revenue values
                eps = self._parse_decimal(item.get('eps'))
                eps_estimated = self._parse_decimal(item.get('eps_estimated'))
                revenue = self._parse_decimal(item.get('revenue'))
                revenue_estimated = self._parse_decimal(item.get('revenue_estimated'))
                
                # Parse fiscal year and quarter
                fiscal_year = None
                fiscal_quarter = None
                if 'quarter' in item and item['quarter']:
                    try:
                        # Format is usually "Q1 2023"
                        q, y = item['quarter'].split()
                        fiscal_quarter = int(q[1:])  # Remove 'Q' prefix
                        fiscal_year = int(y)
                    except (ValueError, AttributeError, IndexError):
                        pass
                
                if report_date:  # Only include items with valid dates
                    results.append(EarningsCalendar(
                        symbol=item.get('ticker', ''),
                        date=report_date,
                        time=item.get('time'),  # 'amc', 'bmo', 'dmh'
                        eps=eps,
                        eps_estimated=eps_estimated,
                        revenue=revenue,
                        revenue_estimated=revenue_estimated,
                        fiscal_date_ending=fiscal_date,
                        fiscal_year=fiscal_year,
                        fiscal_quarter=fiscal_quarter,
                        provider=self.name
                    ))
            return results
            
        except Exception as e:
            self._log_error("Failed to parse earnings calendar", str(e))
            return []
            
    async def get_earnings_transcript(
        self,
        symbol: str,
        year: int,
        quarter: int
    ) -> Optional[EarningsCallTranscript]:
        """
        Get earnings call transcript for a specific quarter
        
        Args:
            symbol: Stock symbol
            year: Fiscal year
            quarter: Fiscal quarter (1-4)
            
        Returns:
            EarningsCallTranscript if found, None otherwise
        """
        # First get the list of available transcripts
        transcripts = await self._make_request(
            "earningstranscript",
            params={
                'ticker': symbol,
                'year': year,
                'quarter': quarter
            }
        )
        
        if not transcripts or not isinstance(transcripts, list) or len(transcripts) == 0:
            return None
            
        try:
            # Get the most recent transcript
            transcript_data = transcripts[0]
            
            # Parse participants if available
            participants = []
            if 'participants' in transcript_data and isinstance(transcript_data['participants'], list):
                for p in transcript_data['participants']:
                    if isinstance(p, dict) and 'name' in p:
                        participants.append({
                            'name': p['name'],
                            'role': p.get('role', ''),
                            'company': p.get('company', '')
                        })
            
            # Parse the transcript date
            transcript_date = datetime.strptime(
                transcript_data['date'],
                '%Y-%m-%d'
            ).date()
            
            return EarningsCallTranscript(
                symbol=symbol,
                date=transcript_date,
                quarter=f"Q{quarter} {year}",
                year=year,
                transcript=transcript_data.get('transcript', ''),
                participants=participants,
                provider=self.name
            )
            
        except Exception as e:
            self._log_error("Failed to parse earnings transcript", str(e))
            return None
            
    def _parse_decimal(self, value: Any) -> Optional[Decimal]:
        """Helper to safely parse decimal values"""
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (ValueError, TypeError):
            return None

# Example usage:
# async def main():
#     api_key = "YOUR_API_KEY"
#     async with APINinjasProvider(api_key) as provider:
#         # Get earnings calendar
#         calendar = await provider.get_earnings_calendar(
#             symbol="AAPL",
#             start_date=date(2023, 1, 1),
#             end_date=date(2023, 12, 31)
#         )
#         for event in calendar:
#             print(f"{event.symbol}: {event.date} - EPS: {event.eps_estimated} (est)")

#         # Get earnings transcript
#         transcript = await provider.get_earnings_transcript("AAPL", 2023, 1)
#         if transcript:
#             print(f"Transcript for {transcript.symbol} Q1 2023:")
#             print(transcript.transcript[:500] + "...")

# if __name__ == "__main__":
#     import asyncio
#     asyncio.run(main())