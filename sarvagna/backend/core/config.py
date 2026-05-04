from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Sarvagna"
    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    DATABASE_URL: str = ""
    REDIS_URL: str = "redis://localhost:6379"
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_URL: str = ""
    QDRANT_API_KEY: str = ""
    SECRET_KEY: str = "dev_secret_change_in_production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080

    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
