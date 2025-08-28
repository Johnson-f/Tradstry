"""
AI Configuration for Hosted Trading Summary System
Manages Hugging Face Inference API settings and model fallback configurations
"""

import os
from typing import Dict, Any, List
from enum import Enum


class ModelType(Enum):
    DATA_ANALYZER = "data_analyzer"
    INSIGHT_GENERATOR = "insight_generator"
    REPORT_WRITER = "report_writer"
    CHAT_ASSISTANT = "chat_assistant"


class AIConfig:
    """Configuration manager for hosted AI models via Hugging Face Inference API"""
    
    def __init__(self):
        # API Configuration
        self.api_token = os.getenv("HUGGINGFACE_API_TOKEN")
        self.api_base_url = "https://api-inference.huggingface.co/models"
        
        # Model fallback configurations with priorities
        self.model_fallbacks = {
            ModelType.DATA_ANALYZER: [
                {"model_id": "microsoft/CodeBERT-base", "priority": 1, "description": "Numerical data analysis"},
                {"model_id": "microsoft/DialoGPT-large", "priority": 2, "description": "Structured data processing"},
                {"model_id": "meta-llama/Llama-3.2-3B-Instruct", "priority": 3, "description": "Analytical capabilities"}
            ],
            ModelType.INSIGHT_GENERATOR: [
                {"model_id": "mistralai/Mistral-7B-Instruct-v0.1", "priority": 1, "description": "Data insights"},
                {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "priority": 2, "description": "Pattern recognition"},
                {"model_id": "microsoft/DialoGPT-large", "priority": 3, "description": "Data connections"}
            ],
            ModelType.REPORT_WRITER: [
                {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "priority": 1, "description": "Clear writing"},
                {"model_id": "mistralai/Mistral-7B-Instruct-v0.1", "priority": 2, "description": "Report generation"},
                {"model_id": "microsoft/DialoGPT-large", "priority": 3, "description": "Conversational tone"}
            ],
            ModelType.CHAT_ASSISTANT: [
                {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "priority": 1, "description": "Context chat"},
                {"model_id": "mistralai/Mistral-7B-Instruct-v0.1", "priority": 2, "description": "Context maintenance"},
                {"model_id": "microsoft/DialoGPT-large", "priority": 3, "description": "Conversations"}
            ]
        }
        
        # Generation parameters by model type
        self.generation_params = {
            ModelType.DATA_ANALYZER: {
                "max_new_tokens": int(os.getenv("AI_DATA_ANALYZER_MAX_TOKENS", "800")),
                "temperature": float(os.getenv("AI_DATA_ANALYZER_TEMPERATURE", "0.3")),
                "do_sample": True,
                "return_full_text": False
            },
            ModelType.INSIGHT_GENERATOR: {
                "max_new_tokens": int(os.getenv("AI_INSIGHT_GENERATOR_MAX_TOKENS", "800")),
                "temperature": float(os.getenv("AI_INSIGHT_GENERATOR_TEMPERATURE", "0.7")),
                "do_sample": True,
                "return_full_text": False
            },
            ModelType.REPORT_WRITER: {
                "max_new_tokens": int(os.getenv("AI_REPORT_WRITER_MAX_TOKENS", "1000")),
                "temperature": float(os.getenv("AI_REPORT_WRITER_TEMPERATURE", "0.7")),
                "do_sample": True,
                "return_full_text": False
            },
            ModelType.CHAT_ASSISTANT: {
                "max_new_tokens": int(os.getenv("AI_CHAT_ASSISTANT_MAX_TOKENS", "400")),
                "temperature": float(os.getenv("AI_CHAT_ASSISTANT_TEMPERATURE", "0.8")),
                "do_sample": True,
                "return_full_text": False
            }
        }
        
        # API request settings
        self.request_config = {
            "timeout": int(os.getenv("AI_REQUEST_TIMEOUT", "60")),
            "max_retries": int(os.getenv("AI_MAX_RETRIES", "3")),
            "retry_delay": int(os.getenv("AI_RETRY_DELAY", "20")),
            "max_concurrent_requests": int(os.getenv("AI_MAX_CONCURRENT", "3"))
        }
        
        # Model loading wait times (for 503 responses)
        self.model_loading_config = {
            "initial_wait": int(os.getenv("AI_INITIAL_WAIT", "20")),
            "max_wait_attempts": int(os.getenv("AI_MAX_WAIT_ATTEMPTS", "3")),
            "backoff_multiplier": float(os.getenv("AI_BACKOFF_MULTIPLIER", "1.5"))
        }
    
    def get_model_fallbacks(self, model_type: ModelType) -> List[Dict[str, Any]]:
        """Get ordered list of model fallbacks for a specific type"""
        return sorted(self.model_fallbacks[model_type], key=lambda x: x["priority"])
    
    def get_primary_model(self, model_type: ModelType) -> str:
        """Get the primary (highest priority) model for a type"""
        fallbacks = self.get_model_fallbacks(model_type)
        return fallbacks[0]["model_id"] if fallbacks else ""
    
    def get_generation_params(self, model_type: ModelType) -> Dict[str, Any]:
        """Get generation parameters for specific model type"""
        return self.generation_params[model_type].copy()
    
    def get_request_config(self) -> Dict[str, Any]:
        """Get API request configuration"""
        return self.request_config.copy()
    
    def get_model_loading_config(self) -> Dict[str, Any]:
        """Get model loading configuration"""
        return self.model_loading_config.copy()
    
    def validate_config(self) -> bool:
        """Validate that required configuration is present"""
        if not self.api_token:
            raise ValueError("HUGGINGFACE_API_TOKEN environment variable is required")
        return True


# Global configuration instance
ai_config = AIConfig()
