import os
from typing import Optional
from pydantic_settings import BaseSettings

class AISettings(BaseSettings):
    """Configuration settings for AI services."""

    # Hugging Face API Configuration
    HUGGINGFACEHUB_API_TOKEN: Optional[str] = None

    # Default models
    DEFAULT_LLM_MODEL: str = "mistralai/Mistral-7B-Instruct-v0.1"
    DEFAULT_EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Model parameters
    LLM_MAX_LENGTH: int = 2048
    LLM_TEMPERATURE: float = 0.7

    # Embedding parameter
    EMBEDDING_DIMENSION: int = 384
    SIMILARITY_THRESHOLD: float = 0.7

    # Processing limits
    MAX_CONTEXT_MESSAGES: int = 10
    MAX_INSIGHTS_PER_REQUEST: int = 5

    # Cache settings
    ENABLE_MODEL_CACHING: bool = True
    CACHE_TTL_SECONDS: int = 3600

    class Config:
        env_file = ".env"
        case_sensitive = True

def get_ai_settings() -> AISettings:
    """Get AI configuration settings."""
    return AISettings()

# Validate Hugging Face API token on import
def validate_huggingface_token() -> bool:
    """Validate that Hugging Face API token is available."""
    settings = get_ai_settings()
    token = settings.HUGGINGFACEHUB_API_TOKEN or os.getenv("HUGGINGFACEHUB_API_TOKEN")

    if not token:
        print("Warning: HUGGINGFACEHUB_API_TOKEN not found in environment variables.")
        print("Please set your Hugging Face API token to use hosted models.")
        return False

    return True
