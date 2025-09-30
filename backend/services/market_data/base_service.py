# backend/services/market_data/base_service.py

# For handling authentication for the market_data 

from supabase import Client
from database import get_supabase
from auth_service import AuthService

class BaseMarketDataService:
    """
    A base service class providing common Supabase client handling and
    operation execution logic with token refresh/retry mechanisms.
    """
    def __init__(self, supabase: Client = None):
        self.supabase = supabase or get_supabase()
        self.auth_service = AuthService(self.supabase)

    async def get_authenticated_client(self, access_token: str = None) -> Client:
        """Get a Supabase client with authentication token."""
        if access_token:
            try:
                return await self.auth_service.get_authenticated_client(access_token)
            except Exception as e:
                print(f"ERROR: Failed to get authenticated client: {e}")
                raise e
        return self.supabase

    async def _execute_with_retry(self, operation, access_token: str = None):
        """Execute database operation with automatic token refresh retry."""
        try:
            # Pass the authenticated client to the operation
            client = await self.get_authenticated_client(access_token)
            return await operation(client)
        except Exception as e:
            if ("JWT expired" in str(e) or "401" in str(e)) and access_token:
                print("JWT expired during operation, retrying...")
                refreshed_client = await self.get_authenticated_client(access_token)
                return await operation(refreshed_client)
            else:
                raise e
