from typing import Optional, Dict, Any
import jwt
from datetime import datetime, timedelta
from supabase import Client
from database import get_supabase
import asyncio

class AuthService:
    def __init__(self, supabase: Client = None):
        self.supabase = supabase or get_supabase()
        self.token_refresh_threshold = 300  # Refresh 5 minutes before expiry
    
    def is_token_expired(self, token: str) -> bool:
        """Check if JWT token is expired or will expire soon"""
        try:
            # Decode without verification to check expiry
            decoded = jwt.decode(token, options={"verify_signature": False})
            exp = decoded.get('exp', 0)
            current_time = datetime.utcnow().timestamp()
            # Return True if token expires within threshold
            return (exp - current_time) < self.token_refresh_threshold
        except Exception as e:
            print(f"Error decoding token: {e}")
            return True
    
    async def refresh_token_if_needed(self, current_token: str) -> str:
        """Refresh token if it's expired or about to expire"""
        if not self.is_token_expired(current_token):
            return current_token
        
        try:
            # Attempt to refresh the session
            refresh_response = self.supabase.auth.refresh_session()
            
            if refresh_response.session and refresh_response.session.access_token:
                print("Token refreshed successfully")
                return refresh_response.session.access_token
            else:
                raise Exception("Failed to refresh token - no new session")
                
        except Exception as e:
            print(f"Token refresh failed: {e}")
            # Token refresh failed - user needs to re-authenticate
            raise Exception("Authentication expired - please log in again")
    
    async def get_authenticated_client(self, access_token: str) -> Client:
        """Get Supabase client with valid authentication"""
        # First, ensure token is valid/refreshed
        valid_token = await self.refresh_token_if_needed(access_token)
        
        # Create authenticated client
        client = get_supabase()
        clean_token = valid_token.replace("Bearer ", "") if valid_token.startswith("Bearer ") else valid_token
        
        try:
            client.postgrest.auth(clean_token)
            return client
        except Exception as e:
            print(f"Failed to authenticate client: {e}")
            raise Exception("Authentication failed")
    
    async def safe_rpc_call(self, function_name: str, params: Dict[str, Any] = None, access_token: str = None):
        """Make RPC call with automatic token refresh on failure"""
        if not access_token:
            raise Exception("Access token required for RPC calls")
        
        client = await self.get_authenticated_client(access_token)
        
        try:
            # First attempt
            return client.rpc(function_name, params or {}).execute()
        except Exception as e:
            if "JWT expired" in str(e) or "401" in str(e):
                print("JWT expired during RPC call, refreshing and retrying...")
                # Force refresh and try once more
                refreshed_token = await self.refresh_token_if_needed(access_token)
                client = await self.get_authenticated_client(refreshed_token)
                return client.rpc(function_name, params or {}).execute()
            else:
                raise e