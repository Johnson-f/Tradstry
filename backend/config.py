from pydantic_settings import BaseSettings
from pydantic import ConfigDict, Field
from functools import lru_cache
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Tradistry Backend"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

    # Supabase Configuration
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # JWT Configuration
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Render Redis Configuration (optimized for Render's Key Value service)
    REDIS_URL: str = ""  # rediss://red-d384sfmr433s73f8qj1g:4EApg4kJgXtM2ixmbrYPGYsnT6LUcc4Q@virginia-keyvalue.render.com:6379
    REDIS_HOST: str = ""  # virginia-keyvalue.render.com
    REDIS_PORT: int = 6379  # Default Redis port on Render
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""  # 4EApg4kJgXtM2ixmbrYPGYsnT6LUcc4Q
    REDIS_USERNAME: str = ""  # red-d384sfmr433s73f8qj1g
    REDIS_SSL: bool = True  # Render Redis uses SSL (rediss://)
    REDIS_SSL_CERT_REQS: str = "required"  # SSL verification required for Render
    REDIS_DECODE_RESPONSES: bool = True
    REDIS_RETRY_ON_TIMEOUT: bool = True
    REDIS_HEALTH_CHECK_INTERVAL: int = 30
    REDIS_CONNECTION_POOL_MAX_SIZE: int = 20  # Lower for Render to avoid connection limits
    REDIS_SOCKET_TIMEOUT: int = 10
    REDIS_SOCKET_CONNECT_TIMEOUT: int = 15
    REDIS_TTL_DEFAULT: int = 3600  # 1 hour default TTL
    REDIS_KEY_PREFIX: str = "tradistry"

    model_config = ConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="allow",
        validate_default=True
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()