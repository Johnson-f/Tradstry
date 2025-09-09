from supabase import create_client, Client
from config import get_settings
from functools import lru_cache
import asyncpg
import os

settings = get_settings()

# Global variable to store the client instance
_supabase_client: Client = None

def get_supabase() -> Client:
    """
    Dependency function to get Supabase client.
    Use this in your FastAPI route dependencies.
    """
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            supabase_url=settings.SUPABASE_URL,
            supabase_key=settings.SUPABASE_KEY
        )
    return _supabase_client

# Alternative approach using lru_cache (also works well)
@lru_cache()
def get_supabase_cached() -> Client:
    """
    Alternative cached version - use this if you prefer
    """
    return create_client(
        supabase_url=settings.SUPABASE_URL,
        supabase_key=settings.SUPABASE_KEY
    )

@lru_cache()
def get_supabase_admin_client():
    """
    Get Supabase client with admin privileges for backend operations.
    Uses service role key for administrative operations.
    """
    return create_client(
        supabase_url=settings.SUPABASE_URL,
        supabase_key=settings.SUPABASE_SERVICE_ROLE_KEY
    )
