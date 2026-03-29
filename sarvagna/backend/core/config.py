from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    SECRET_KEY: str
    ENVIRONMENT: str = "development"
    DATABASE_URL: str
    REDIS_URL: str
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    GROQ_API_KEY: str
    GEMINI_API_KEY: str
    APIFY_API_KEY: str
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text"


@lru_cache
def get_settings() -> Settings:
    return Settings()
