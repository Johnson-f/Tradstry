from typing import Dict, Any, Optional, List
import logging
from config.ai_config import (
    get_ai_settings,
    get_available_llm_models,
    get_available_embedding_models,
    get_financial_models,
    get_model_by_key,
    validate_model_availability
)

logger = logging.getLogger(__name__)


class AIModelManager:
    """
    Manages AI model selection, validation, and fallback logic for the orchestrator.
    Handles stable model definitions, model switching, and health checks.
    """

    def __init__(self):
        self.ai_settings = get_ai_settings()
        self.stable_models = self._get_stable_models()
        self.current_llm_model = self._get_default_stable_model()
        self.current_embedding_model = self.ai_settings.DEFAULT_EMBEDDING_MODEL
        self.available_models = self._load_available_models()
        
        logger.info("AI Model Manager initialized", extra={
            "default_llm_model": self.current_llm_model,
            "default_embedding_model": self.current_embedding_model,
            "total_stable_models": len(self.stable_models)
        })

    def _get_stable_models(self) -> List[Dict[str, str]]:
        """Get list of free models available on OpenRouter, organized by provider and tier."""
        return [
            # X-AI Provider - Tier 1: HIGH PERFORMANCE
            {"name": "Grok 4 Fast", "model": "x-ai/grok-4-fast:free", "tier": 1, "provider": "X-AI"},

            # NVIDIA Provider - Tier 1: HIGH PERFORMANCE  
            {"name": "Nemotron Nano 9B V2", "model": "nvidia/nemotron-nano-9b-v2:free", "tier": 1, "provider": "NVIDIA"},

            # Qwen Provider - Tier 1: SPECIALIZED CODING
            {"name": "Qwen3 Coder", "model": "qwen/qwen3-coder:free", "tier": 1, "provider": "Qwen"},
            {"name": "Qwen3 235B A22B", "model": "qwen/qwen3-235b-a22b:free", "tier": 1, "provider": "Qwen"},

            # Cognitive Computations Provider - Tier 2: SPECIALIZED
            {"name": "Dolphin Mistral 24B Venice", "model": "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", "tier": 2, "provider": "Cognitive Computations"},

            # Microsoft Provider - Tier 2: REASONING
            {"name": "MAI DS R1", "model": "microsoft/mai-ds-r1:free", "tier": 2, "provider": "Microsoft"}
        ]

    def _get_default_stable_model(self) -> str:
        """Get the most stable default model for OpenRouter."""
        # Start with tier 1 models (most stable and reliable)
        tier_1_models = [model for model in self.stable_models if model["tier"] == 1]
        if tier_1_models:
            return tier_1_models[0]["model"]
        
        # Fallback to any available model
        return self.stable_models[0]["model"] if self.stable_models else "x-ai/grok-4-fast:free"

    def _check_model_task_compatibility(self, repo_id: str, task: str = "text-generation") -> bool:
        """
        Check if a model supports the specified task on FREE PLAN.
        
        Args:
            repo_id: Model repository ID (OpenRouter format)
            task: Task type to check
            
        Returns:
            True if compatible, False otherwise
        """
        try:
            # Models known to work with text-generation on free plan (OpenRouter format)
            free_plan_compatible = {
                # New stable models
                "x-ai/grok-4-fast:free",
                "nvidia/nemotron-nano-9b-v2:free",
                "qwen/qwen3-coder:free",
                "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
                "qwen/qwen3-235b-a22b:free",
                "microsoft/mai-ds-r1:free",
                
                # Legacy compatibility models
                "openai-community/gpt2",
                "openai-community/gpt2-medium", 
                "openai-community/gpt2-large",
                "distilbert/distilgpt2",
                "EleutherAI/gpt-neo-125m",
                "EleutherAI/gpt-neo-1.3B",
                "EleutherAI/gpt-neo-2.7B",
                "bigscience/bloom-560m",
                "bigscience/bloom-1b1",
                "facebook/opt-350m",
                "facebook/opt-1.3b",
                "facebook/opt-2.7b",
                "EleutherAI/pythia-410m",
                "EleutherAI/pythia-1.4b",
                "TinyLlama/TinyLlama-1.1B-intermediate-step-1431k-3T",
                "Salesforce/codegen-350M-mono",
                "Salesforce/codegen-2B-mono",
                "EleutherAI/gpt-j-6b",
                "facebook/opt-125m"
            }
            
            return repo_id in free_plan_compatible
            
        except Exception as e:
            logger.error(f"Error checking model compatibility: {str(e)}")
            return False

    def _load_available_models(self) -> Dict[str, Dict[str, str]]:
        """Load all available models from configuration."""
        try:
            stable_llm_models = {model["name"]: model["model"] for model in self.stable_models}
            
            return {
                'llm': {**get_available_llm_models(), **stable_llm_models},
                'embedding': get_available_embedding_models(),
                'financial': get_financial_models(),
                'stable_llm': stable_llm_models
            }
        except Exception as e:
            logger.error(f"Error loading available models: {str(e)}")
            return {'llm': {}, 'embedding': {}, 'financial': {}, 'stable_llm': {}}

    def select_model(self, model_type: str, model_key: str) -> bool:
        """
        Select a specific model for use.

        Args:
            model_type: Type of model ('llm', 'embedding', 'financial', 'stable_llm')
            model_key: Key identifier for the model

        Returns:
            True if model was successfully selected, False otherwise
        """
        try:
            logger.info(f"Attempting to select model: {model_key} (type: {model_type})")
            
            if model_type == 'stable_llm':
                # Handle stable model selection
                stable_model = next((m for m in self.stable_models if m["name"] == model_key), None)
                if stable_model:
                    self.current_llm_model = stable_model["model"]
                    logger.info(f"Switched to stable LLM model: {stable_model['model']}")
                    return True
                else:
                    logger.warning(f"Stable model '{model_key}' not found")
                    return False

            model_path = get_model_by_key(model_type, model_key)
            if not model_path:
                logger.warning(f"Model key '{model_key}' not found for type '{model_type}'")
                return False

            if not validate_model_availability(model_path):
                logger.warning(f"Model '{model_path}' is not available in configuration")
                return False

            if model_type == 'llm':
                self.current_llm_model = model_path
                logger.info(f"Switched to LLM model: {model_path}")
            elif model_type == 'embedding':
                self.current_embedding_model = model_path
                logger.info(f"Switched to embedding model: {model_path}")

            return True

        except Exception as e:
            logger.error(f"Error selecting model {model_key}: {str(e)}")
            return False

    def get_model_info(self, model_type: str = None) -> Dict[str, Any]:
        """
        Get information about current and available models.

        Args:
            model_type: Optional filter for specific model type

        Returns:
            Dictionary containing model information
        """
        info = {
            "current_models": {
                "llm": self.current_llm_model,
                "embedding": self.current_embedding_model
            },
            "available_models": self.available_models,
            "stable_models": self.stable_models,
            "model_validation": self.validate_current_models()
        }

        if model_type:
            info['available_models'] = {model_type: self.available_models.get(model_type, {})}

        return info

    def validate_current_models(self) -> Dict[str, bool]:
        """
        Validate that current models are available and working.

        Returns:
            Dictionary with validation status for each model type
        """
        validation_status = {}

        try:
            # Validate LLM model
            validation_status['llm'] = validate_model_availability(self.current_llm_model)
        except Exception as e:
            logger.error(f"Error validating LLM model: {str(e)}")
            validation_status['llm'] = False

        try:
            # Validate embedding model
            validation_status['embedding'] = validate_model_availability(self.current_embedding_model)
        except Exception as e:
            logger.error(f"Error validating embedding model: {str(e)}")
            validation_status['embedding'] = False

        # Log validation results
        for model_type, is_valid in validation_status.items():
            if not is_valid:
                current_model = getattr(self, f'current_{model_type}_model', 'unknown')
                logger.warning(f"Current {model_type} model is not valid: {current_model}")

        return validation_status

    def get_fallback_model(self, model_type: str, current_model: str) -> Optional[str]:
        """
        Get a fallback model when the current model is unavailable.

        Args:
            model_type: Type of model ('llm', 'embedding')
            current_model: Current model that's failing

        Returns:
            Fallback model path or None if no fallback available
        """
        if model_type == 'llm':
            # Use stable models as fallbacks, prioritizing by tier
            for model in sorted(self.stable_models, key=lambda x: x["tier"]):
                if model["model"] != current_model:
                    logger.info(f"Using fallback LLM model: {model['model']} (Tier {model['tier']})")
                    return model["model"]
        
        # Original fallback logic for other model types
        fallback_options = {
            'llm': [
                'nvidia/nemotron-nano-9b-v2:free',
                'qwen/qwen3-coder:free',
                'microsoft/mai-ds-r1:free'
            ],
            'embedding': [
                'sentence-transformers/all-MiniLM-L6-v2',
                'BAAI/bge-small-en-v1.5',
                'intfloat/e5-small-v2'
            ]
        }

        fallbacks = fallback_options.get(model_type, [])

        # Return first available fallback that's different from current
        for fallback in fallbacks:
            if fallback != current_model and validate_model_availability(fallback):
                logger.info(f"Using fallback {model_type} model: {fallback}")
                return fallback

        return None

    def switch_to_stable_model(self, tier: int = 1) -> bool:
        """
        Switch to a stable model from the specified tier.
        
        Args:
            tier: Model tier (1-2, where 1 is most stable)
            
        Returns:
            True if successfully switched, False otherwise
        """
        try:
            tier_models = [model for model in self.stable_models if model["tier"] == tier]
            
            if not tier_models:
                logger.warning(f"No models available in tier {tier}")
                return False
            
            for model_config in tier_models:
                try:
                    old_model = self.current_llm_model
                    self.current_llm_model = model_config["model"]
                    
                    logger.info(f"Switched from {old_model} to stable model: {model_config['model']} (Tier {tier})")
                    return True
                        
                except Exception as e:
                    logger.warning(f"Failed to switch to {model_config['model']}: {str(e)}")
                    continue
            
            logger.error(f"All tier {tier} models failed to initialize")
            return False
            
        except Exception as e:
            logger.error(f"Error switching to stable model: {str(e)}")
            return False

    def auto_recover_model(self) -> bool:
        """
        Automatically recover by trying stable models in order.
        
        Returns:
            True if recovery successful, False otherwise
        """
        logger.info("Attempting automatic model recovery...")
        
        # Try each tier in order (1-2)
        for tier in range(1, 3):
            if self.switch_to_stable_model(tier):
                logger.info(f"Recovery successful with tier {tier} model: {self.current_llm_model}")
                return True
                
        logger.error("Auto-recovery failed - no stable models available")
        return False

    def get_stable_models_info(self) -> Dict[str, Any]:
        """Get information about stable models organized by tier."""
        try:
            models_by_tier = {}
            for model in self.stable_models:
                tier = model["tier"]
                if tier not in models_by_tier:
                    models_by_tier[tier] = []
                models_by_tier[tier].append({
                    "name": model["name"],
                    "model": model["model"],
                    "provider": model["provider"],
                    "current": model["model"] == self.current_llm_model
                })
            
            return {
                "current_llm_model": self.current_llm_model,
                "current_embedding_model": self.current_embedding_model,
                "models_by_tier": models_by_tier,
                "total_stable_models": len(self.stable_models)
            }
            
        except Exception as e:
            logger.error(f"Error getting stable models info: {str(e)}")
            return {"error": str(e)}