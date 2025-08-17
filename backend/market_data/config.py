"""Configuration management for market data providers"""

from typing import Dict, Optional, List
from pydantic import BaseModel, Field
from enum import Enum
import os
from dotenv import load_dotenv

load_dotenv()


class ProviderPriority(Enum):
    """Provider priority levels"""
    HIGH = 1
    MEDIUM = 2
    LOW = 3


class ProviderConfig(BaseModel):
    """Configuration for a single provider"""
    enabled: bool = True
    api_key: Optional[str] = None
    priority: ProviderPriority = ProviderPriority.MEDIUM
    rate_limit_per_minute: int = 60
    timeout_seconds: int = 30
    max_retries: int = 3
    
    class Config:
        use_enum_values = True


class MarketDataConfig(BaseModel):
    """Configuration for all market data providers"""
    alpha_vantage: ProviderConfig = Field(default_factory=lambda: ProviderConfig(
        api_key=os.getenv("ALPHA_VANTAGE_API_KEY"),
        priority=ProviderPriority.HIGH,
        rate_limit_per_minute=5  # Free tier: 5 requests per minute
    ))
    
    finnhub: ProviderConfig = Field(default_factory=lambda: ProviderConfig(
        api_key=os.getenv("FINNHUB_API_KEY"),
        priority=ProviderPriority.HIGH,
        rate_limit_per_minute=60  # Free tier: 60 requests per minute
    ))
    
    polygon: ProviderConfig = Field(default_factory=lambda: ProviderConfig(
        api_key=os.getenv("POLYGON_API_KEY"),
        priority=ProviderPriority.HIGH,
        rate_limit_per_minute=5  # Free tier: 5 requests per minute
    ))
    
    twelve_data: ProviderConfig = Field(default_factory=lambda: ProviderConfig(
        api_key=os.getenv("TWELVE_DATA_API_KEY"),
        priority=ProviderPriority.MEDIUM,
        rate_limit_per_minute=8  # Free tier: 800 requests per day
    ))
    
    fmp: ProviderConfig = Field(default_factory=lambda: ProviderConfig(
        api_key=os.getenv("FMP_API_KEY"),
        priority=ProviderPriority.MEDIUM,
        rate_limit_per_minute=5  # Free tier: 250 requests per day
    ))
    
    tiingo: ProviderConfig = Field(default_factory=lambda: ProviderConfig(
        api_key=os.getenv("TIINGO_API_KEY"),
        priority=ProviderPriority.LOW,
        rate_limit_per_minute=60  # Free tier: varies
    ))
    
    # Global settings
    enable_caching: bool = True
    cache_ttl_seconds: int = 300  # 5 minutes
    enable_fallback: bool = True
    fallback_on_error: bool = True
    log_level: str = "INFO"
    
    @classmethod
    def from_env(cls) -> "MarketDataConfig":
        """Create config from environment variables"""
        return cls()
    
    def get_enabled_providers(self) -> List[str]:
        """Get list of enabled providers sorted by priority"""
        providers = []
        for name, config in self.dict().items():
            if isinstance(config, dict) and config.get('enabled') and config.get('api_key'):
                providers.append((name, config['priority']))
        
        # Sort by priority (lower number = higher priority)
        providers.sort(key=lambda x: x[1])
        return [name for name, _ in providers]
    
    def validate_provider(self, provider_name: str) -> bool:
        """Check if provider is properly configured"""
        config = getattr(self, provider_name, None)
        if config:
            return config.enabled and config.api_key is not None
        return False
