from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "T2 Quiz Rooms API"
    app_env: str = "development"
    debug: bool = False
    app_secret_key: str
    api_v1_prefix: str = "/api/v1"

    database_url: str
    database_pool_size: int = 10
    database_max_overflow: int = 20
    sql_echo: bool = False

    redis_url: str

    cors_origins: list[str] = []

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
