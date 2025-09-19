"""
Dynamic Prompt Registry - Loads prompts from external sources, no hardcoded content.
"""

import json
import logging
import os
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from langchain_core.prompts import PromptTemplate

logger = logging.getLogger(__name__)


class PromptType(str, Enum):
    DAILY_REPORT = "daily_report"
    CHAT = "chat"
    INSIGHT = "insight"
    RISK_ANALYSIS = "risk_analysis"
    PERFORMANCE_SUMMARY = "performance_summary"
    MARKET_ANALYSIS = "market_analysis"


class PromptVersion(str, Enum):
    V1_BASELINE = "v1_baseline"
    V2_ENHANCED = "v2_enhanced"
    V3_FEW_SHOT = "v3_few_shot"
    V4_OPTIMIZED = "v4_optimized"


@dataclass
class FewShotExample:
    input_data: Dict[str, Any]
    expected_output: str
    description: str
    quality_score: float = 1.0
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class PromptMetadata:
    version: PromptVersion
    created_at: datetime
    description: str
    usage_count: int = 0
    success_rate: float = 0.0
    avg_processing_time: float = 0.0
    tags: List[str] = field(default_factory=list)


@dataclass
class PromptConfig:
    template: str
    input_variables: List[str]
    few_shot_examples: List[FewShotExample] = field(default_factory=list)
    metadata: PromptMetadata = None
    active: bool = True


class PromptRegistry:
    """Dynamic prompt registry - loads from environment, JSON files, or database."""
    
    def __init__(self):
        self.prompts: Dict[str, Dict[str, PromptConfig]] = {}
        self._load_all_prompts()
        logger.info(f"Loaded {self._count_prompts()} prompts dynamically")
    
    def _load_all_prompts(self):
        """Load prompts from all sources."""
        self._load_from_env()
        self._load_from_json()
        if not self.prompts:
            self._create_minimal_defaults()
    
    def _load_from_env(self):
        """Load from PROMPT_* environment variables."""
        for key, value in os.environ.items():
            if key.startswith('PROMPT_'):
                parts = key.lower().replace('prompt_', '').split('_')
                if len(parts) >= 2:
                    prompt_type = getattr(PromptType, parts[0].upper(), None)
                    version = getattr(PromptVersion, f"V{parts[-1].upper()}", None)
                    if prompt_type and version:
                        self._add_env_prompt(prompt_type, version, value)
    
    def _load_from_json(self):
        """Load from JSON files in config/prompts/."""
        config_dir = os.path.join(os.path.dirname(__file__), "prompts")
        if os.path.exists(config_dir):
            for filename in os.listdir(config_dir):
                if filename.endswith('.json'):
                    self._load_json_file(os.path.join(config_dir, filename))
    
    def _add_env_prompt(self, prompt_type, version, value):
        """Add prompt from environment variable."""
        if prompt_type not in self.prompts:
            self.prompts[prompt_type] = {}
        
        import re
        input_vars = re.findall(r'\{(\w+)\}', value)
        
        self.prompts[prompt_type][version] = PromptConfig(
            template=value,
            input_variables=input_vars,
            metadata=PromptMetadata(version=version, created_at=datetime.now(), description="Env prompt")
        )
    
    def _load_json_file(self, filepath):
        """Load prompts from single JSON file."""
        try:
            with open(filepath, 'r') as f:
                config = json.load(f)
                self._process_json_config(config)
                logger.info(f"Loaded prompts from {filepath}")
        except Exception as e:
            logger.error(f"Error loading {filepath}: {e}")
    
    def _process_json_config(self, config):
        """Process JSON configuration and load prompts."""
        for prompt_type_name, versions in config.items():
            # Convert string to enum
            prompt_type = self._get_prompt_type_from_name(prompt_type_name)
            if not prompt_type:
                logger.warning(f"Unknown prompt type: {prompt_type_name}")
                continue
                
            if prompt_type not in self.prompts:
                self.prompts[prompt_type] = {}
            
            for version_name, version_config in versions.items():
                version = self._get_prompt_version_from_name(version_name)
                if not version:
                    logger.warning(f"Unknown version: {version_name}")
                    continue
                
                # Create few-shot examples
                examples = []
                for example_data in version_config.get('few_shot_examples', []):
                    examples.append(FewShotExample(
                        input_data=example_data.get('input_data', {}),
                        expected_output=example_data.get('expected_output', ''),
                        description=example_data.get('description', ''),
                        quality_score=example_data.get('quality_score', 1.0)
                    ))
                
                # Create metadata
                metadata_config = version_config.get('metadata', {})
                metadata = PromptMetadata(
                    version=version,
                    created_at=datetime.now(),
                    description=metadata_config.get('description', ''),
                    tags=metadata_config.get('tags', [])
                )
                
                # Create prompt config
                self.prompts[prompt_type][version] = PromptConfig(
                    template=version_config.get('template', ''),
                    input_variables=version_config.get('input_variables', []),
                    few_shot_examples=examples,
                    metadata=metadata
                )
    
    def _get_prompt_type_from_name(self, name):
        """Convert string to PromptType enum."""
        name_mapping = {
            'daily_report': PromptType.DAILY_REPORT,
            'chat': PromptType.CHAT,
            'insight': PromptType.INSIGHT,
            'risk_analysis': PromptType.RISK_ANALYSIS,
            'performance_summary': PromptType.PERFORMANCE_SUMMARY,
            'market_analysis': PromptType.MARKET_ANALYSIS
        }
        return name_mapping.get(name)
    
    def _get_prompt_version_from_name(self, name):
        """Convert string to PromptVersion enum."""
        name_mapping = {
            'v1_baseline': PromptVersion.V1_BASELINE,
            'v2_enhanced': PromptVersion.V2_ENHANCED,
            'v3_few_shot': PromptVersion.V3_FEW_SHOT,
            'v4_optimized': PromptVersion.V4_OPTIMIZED
        }
        return name_mapping.get(name)
    
    def _create_minimal_defaults(self):
        """Fallback minimal prompts."""
        defaults = {
            PromptType.DAILY_REPORT: "Analyze trading data: {trading_data}",
            PromptType.CHAT: "Answer: {question} with context: {context}"
        }
        
        for ptype, template in defaults.items():
            import re
            vars = re.findall(r'\{(\w+)\}', template)
            self.prompts[ptype] = {
                PromptVersion.V1_BASELINE: PromptConfig(
                    template=template,
                    input_variables=vars,
                    metadata=PromptMetadata(version=PromptVersion.V1_BASELINE, created_at=datetime.now(), description="Default")
                )
            }
    
    def _count_prompts(self):
        """Count total prompts."""
        return sum(len(versions) for versions in self.prompts.values())
    
    def get_prompt(self, prompt_type: PromptType, version: PromptVersion = None) -> Optional[PromptTemplate]:
        """Get dynamic prompt template with few-shot examples integrated."""
        if prompt_type not in self.prompts:
            logger.warning(f"Prompt type {prompt_type} not found")
            return None
        
        versions = self.prompts[prompt_type]
        if not versions:
            return None
            
        # Use specified version or latest available
        config = versions.get(version) if version else list(versions.values())[-1]
        
        # Build template with few-shot examples if available
        if config.few_shot_examples:
            return self._build_few_shot_template(config)
        else:
            return PromptTemplate(
                input_variables=config.input_variables,
                template=config.template
            )
    
    def _build_few_shot_template(self, config: PromptConfig) -> PromptTemplate:
        """Build a template with few-shot examples integrated."""
        try:
            template = config.template
            input_vars = list(config.input_variables)
            
            # Add example placeholders to input variables if not already present
            for i, example in enumerate(config.few_shot_examples, 1):
                example_key = f"example_{i}"
                if example_key not in input_vars:
                    input_vars.append(example_key)
            
            return PromptTemplate(
                input_variables=input_vars,
                template=template
            )
            
        except Exception as e:
            logger.error(f"Error building few-shot template: {str(e)}")
            # Fallback to basic template
            return PromptTemplate(
                input_variables=config.input_variables,
                template=config.template
            )
    
    def get_few_shot_examples(self, prompt_type: PromptType, limit: int = None) -> List[FewShotExample]:
        """Get few-shot examples."""
        if prompt_type not in self.prompts:
            return []
        
        examples = []
        for config in self.prompts[prompt_type].values():
            examples.extend(config.few_shot_examples)
        
        examples.sort(key=lambda x: x.quality_score, reverse=True)
        return examples[:limit] if limit else examples
    
    def update_performance(self, prompt_type: PromptType, version: PromptVersion, success: bool, time_ms: float):
        """Update performance metrics."""
        if prompt_type in self.prompts and version in self.prompts[prompt_type]:
            metadata = self.prompts[prompt_type][version].metadata
            if metadata:
                metadata.usage_count += 1
                # Update success rate using exponential moving average
                alpha = 0.1
                metadata.success_rate = (1-alpha) * metadata.success_rate + alpha * (1 if success else 0)
                # Update processing time
                if metadata.avg_processing_time == 0:
                    metadata.avg_processing_time = time_ms
                else:
                    metadata.avg_processing_time = (1-alpha) * metadata.avg_processing_time + alpha * time_ms
    
    def update_prompt_performance(self, prompt_type: PromptType, version: PromptVersion, success: bool, processing_time: float):
        """Update performance metrics (alias for compatibility)."""
        return self.update_performance(prompt_type, version, success, processing_time)
    
    def get_prompt_stats(self) -> Dict[str, Any]:
        """Get registry statistics."""
        return {
            "total_prompts": self._count_prompts(),
            "prompt_types": list(self.prompts.keys()),
            "total_versions": sum(len(v) for v in self.prompts.values())
        }


# Global instance
_prompt_registry = None

def get_prompt_registry() -> PromptRegistry:
    """Get global registry instance."""
    global _prompt_registry
    if _prompt_registry is None:
        _prompt_registry = PromptRegistry()
    return _prompt_registry

def get_prompt(prompt_type: PromptType, version: PromptVersion = None) -> Optional[PromptTemplate]:
    """Get prompt from global registry."""
    return get_prompt_registry().get_prompt(prompt_type, version)
