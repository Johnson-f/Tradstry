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

    # OpenRouter API Configuration
    OPENROUTER_API_KEY: Optional[str] = None

    # Default models
    DEFAULT_LLM_MODEL: str = "openai/gpt-oss-120b"
    DEFAULT_EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    
    # Available hosted models from OpenRouter (Free Tier)
    AVAILABLE_LLM_MODELS: dict = {
        # High Performance Models
        "gpt_oss_120b": "openai/gpt-oss-120b",
        "deepseek_coder": "deepseek/deepseek-coder",
        "deepseek_chat": "deepseek/deepseek-chat",
        "kimi_dev_72b": "moonshotai/kimi-dev-72b",
        "deepseek_r1": "deepseek/deepseek-r1",

        # Balanced Performance Models
        "gpt_oss_20b": "openai/gpt-oss-20b",
        "glm_4_5_air": "z-ai/glm-4.5-air",
        "qwen3_coder": "qwen/qwen3-coder",
        "kimi_k2": "moonshotai/kimi-k2",
        "hunyuan_a13b": "tencent/hunyuan-a13b-instruct",
        "mistral_small_3_2_24b": "mistralai/mistral-small-3.2-24b-instruct",
        "devstral_small_2505": "mistralai/devstral-small-2505",
        "llama_3_3_8b": "meta-llama/llama-3.3-8b-instruct",
        "sarvam_m": "sarvamai/sarvam-m",

        # Specialized Models
        "deepseek_r1t2_chimera": "tngtech/deepseek-r1t2-chimera",
        "deepseek_r1_0528_qwen3_8b": "deepseek/deepseek-r1-0528-qwen3-8b",
        "deepseek_r1t_chimera": "tngtech/deepseek-r1t-chimera",
        "dolphin_mistral_24b_venice": "cognitivecomputations/dolphin-mistral-24b-venice-edition",

        # Qwen Series Models
        "qwen3_235b_a22b": "qwen/qwen3-235b-a22b",
        "qwen3_30b_a3b": "qwen/qwen3-30b-a3b",
        "qwen3_14b": "qwen/qwen3-14b",
        "qwen3_8b": "qwen/qwen3-8b",
        "qwen3_4b": "qwen/qwen3-4b"
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

# Validate OpenRouter API token on import
def validate_openrouter_token() -> bool:
    """Validate that OpenRouter API token is available."""
    settings = get_ai_settings()
    token = settings.OPENROUTER_API_KEY or os.getenv("OPENROUTER_API_KEY")

    if not token:
        print("Warning: OPENROUTER_API_KEY not found in environment variables.")
        print("Please set your OpenRouter API token to use hosted models.")
        return False

    return True
