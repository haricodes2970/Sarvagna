from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    SECRET_KEY: str
    ENVIRONMENT: str = "development"
    DATABASE_URL: str
    REDIS_URL: str
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    REPLICATE_API_KEY: str = ""
    GROQ_API_KEY: str
    GEMINI_API_KEY: str = ""
    APIFY_API_KEY: str = ""
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()
