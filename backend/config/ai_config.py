import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import ConfigDict

class AISettings(BaseSettings):
    """Configuration settings for AI services."""

    # Use Pydantic v2 style configuration
    model_config = ConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra='allow'  # This allows extra fields
    )

    # Hugging Face API Configuration
    HUGGINGFACEHUB_API_TOKEN: Optional[str] = None

    # Default models
    DEFAULT_LLM_MODEL: str = "mistralai/Mistral-7B-Instruct-v0.1"
    DEFAULT_EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    
    # Available hosted models from Hugging Face
    AVAILABLE_LLM_MODELS: dict = {
        "mistral_7b": "mistralai/Mistral-7B-Instruct-v0.1",
        "mistral_7b_v0_2": "mistralai/Mistral-7B-Instruct-v0.2",
        "mistral_7b_v0_3": "mistralai/Mistral-7B-Instruct-v0.3",
        "llama2_7b": "meta-llama/Llama-2-7b-chat-hf",
        "llama2_13b": "meta-llama/Llama-2-13b-chat-hf",
        "code_llama_7b": "codellama/CodeLlama-7b-Instruct-hf",
        "code_llama_13b": "codellama/CodeLlama-13b-Instruct-hf",
        "phi3_mini": "microsoft/Phi-3-mini-4k-instruct",
        "phi3_small": "microsoft/Phi-3-small-8k-instruct",
        "gemma_2b": "google/gemma-2b-it",
        "gemma_7b": "google/gemma-7b-it",
        "zephyr_7b": "HuggingFaceH4/zephyr-7b-beta",
        "openchat_7b": "openchat/openchat-3.5-0106",
        "neural_chat_7b": "Intel/neural-chat-7b-v3-3",
        "starling_7b": "Nexusflow/Starling-LM-7B-beta"
    }
    
    AVAILABLE_EMBEDDING_MODELS: dict = {
        "all_minilm_l6_v2": "sentence-transformers/all-MiniLM-L6-v2",
        "all_minilm_l12_v2": "sentence-transformers/all-MiniLM-L12-v2",
        "all_mpnet_base_v2": "sentence-transformers/all-mpnet-base-v2",
        "all_distilroberta_v1": "sentence-transformers/all-distilroberta-v1",
        "multi_qa_minilm_l6": "sentence-transformers/multi-qa-MiniLM-L6-cos-v1",
        "multi_qa_mpnet_base": "sentence-transformers/multi-qa-mpnet-base-dot-v1",
        "paraphrase_minilm_l6": "sentence-transformers/paraphrase-MiniLM-L6-v2",
        "paraphrase_mpnet_base": "sentence-transformers/paraphrase-mpnet-base-v2",
        "e5_small_v2": "intfloat/e5-small-v2",
        "e5_base_v2": "intfloat/e5-base-v2",
        "e5_large_v2": "intfloat/e5-large-v2",
        "bge_small_en": "BAAI/bge-small-en-v1.5",
        "bge_base_en": "BAAI/bge-base-en-v1.5",
        "bge_large_en": "BAAI/bge-large-en-v1.5"
    }
    
    # Financial/Trading specific models
    FINANCIAL_MODELS: dict = {
        "finbert": "ProsusAI/finbert",
        "finbert_sentiment": "ahmedrachid/FinancialBERT-Sentiment-Analysis",
        "financial_roberta": "nlpaueb/sec-bert-base",
        "esg_bert": "climatebert/distilroberta-base-climate-f",
        "trading_bert": "ElKulako/cryptobert"
    }

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

def get_ai_settings() -> AISettings:
    """Get AI configuration settings."""
    return AISettings()

def get_available_llm_models() -> dict:
    """Get all available LLM models."""
    settings = get_ai_settings()
    return settings.AVAILABLE_LLM_MODELS

def get_available_embedding_models() -> dict:
    """Get all available embedding models."""
    settings = get_ai_settings()
    return settings.AVAILABLE_EMBEDDING_MODELS

def get_financial_models() -> dict:
    """Get financial/trading specific models."""
    settings = get_ai_settings()
    return settings.FINANCIAL_MODELS

def get_model_by_key(model_type: str, model_key: str) -> Optional[str]:
    """
    Get model path by key and type.
    
    Args:
        model_type: Type of model ('llm', 'embedding', 'financial')
        model_key: Key identifier for the model
        
    Returns:
        Model path string or None if not found
    """
    settings = get_ai_settings()
    
    model_maps = {
        'llm': settings.AVAILABLE_LLM_MODELS,
        'embedding': settings.AVAILABLE_EMBEDDING_MODELS,
        'financial': settings.FINANCIAL_MODELS
    }
    
    model_map = model_maps.get(model_type)
    if not model_map:
        return None
        
    return model_map.get(model_key)

def validate_model_availability(model_path: str) -> bool:
    """
    Validate if a model is available in our configuration.
    
    Args:
        model_path: Full model path (e.g., 'mistralai/Mistral-7B-Instruct-v0.1')
        
    Returns:
        True if model is available, False otherwise
    """
    settings = get_ai_settings()
    
    all_models = {
        **settings.AVAILABLE_LLM_MODELS,
        **settings.AVAILABLE_EMBEDDING_MODELS,
        **settings.FINANCIAL_MODELS
    }
    
    return model_path in all_models.values()

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
