from supabase import create_client, Client
from .config import get_settings

settings = get_settings()

class SupabaseClient:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SupabaseClient, cls).__new__(cls)
            cls._instance.client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return cls._instance
    
    @property
    def client(self) -> Client:
        return self._instance.client

def get_supabase() -> Client:
    """
    Dependency function to get Supabase client.
    Use this in your FastAPI route dependencies.
    """
    return SupabaseClient().client
