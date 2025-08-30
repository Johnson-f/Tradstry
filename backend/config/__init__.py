# config/__init__.py
from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import Optional

class Settings(BaseSettings):
    """Configuration settings for the application."""

    # Use Pydantic v2 style configuration - EXPLICITLY allow extra fields
    model_config = ConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra='allow'  # EXPLICITLY ALLOW extra fields to prevent validation errors
    )
    
    # Database settings
    DATABASE_URL: Optional[str] = None
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "tradistry"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = ""
    
    # Security
    SECRET_KEY: str = "your-secret-key-here"
    JWT_SECRET_KEY: Optional[str] = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # External APIs
    SUPABASE_URL: Optional[str] = None
    SUPABASE_KEY: Optional[str] = None
    
    # Market Data APIs
    ALPHA_VANTAGE_API_KEY: Optional[str] = None
    FINNHUB_API_KEY: Optional[str] = None
    POLYGON_API_KEY: Optional[str] = None
    TWELVE_DATA_API_KEY: Optional[str] = None
    FMP_API_KEY: Optional[str] = None
    TIINGO_API_KEY: Optional[str] = None
    
    # AI Configuration
    HUGGINGFACEHUB_API_TOKEN: Optional[str] = None
    AI_MODEL_SIZE: str = "medium"
    AI_USE_GPU: bool = True
    AI_GPU_MEMORY_FRACTION: float = 0.8
    AI_MAX_TOKENS: int = 512
    AI_TEMPERATURE: float = 0.7
    AI_ENABLE_CACHE: bool = True
    AI_CACHE_DIR: str = "./model_cache"
    AI_ENABLE_QUANTIZATION: bool = True
    
    # Model defaults
    DEFAULT_LLM_MODEL: str = "mistralai/Mistral-7B-Instruct-v0.1"
    DEFAULT_EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    LLM_MAX_LENGTH: int = 5000
    LLM_TEMPERATURE: float = 0.7
    
    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Application settings
    PROJECT_NAME: str = "Tradistry API"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

def get_settings() -> Settings:
    """Get application settings."""
    return Settings()

# Make them available for import
__all__ = ["Settings", "get_settings"]