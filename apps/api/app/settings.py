from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]
API_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    api_title: str = "Vocalendar API"
    api_env: str = "local"
    api_cors_origins: str = "http://localhost:5175,http://127.0.0.1:5175"
    web_app_url: str = "http://127.0.0.1:5175/"
    database_url: str = (
        "postgresql+psycopg://vocalendar:vocalendar@localhost:5432/vocalendar"
    )
    github_client_id: str = ""
    github_client_secret: str = ""
    github_oauth_redirect_uri: str = "http://localhost:8000/auth/github/callback"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_oauth_redirect_uri: str = "http://localhost:8000/integrations/google/callback"
    jwt_secret: str = "replace-this-in-production"
    jwt_algorithm: str = "HS256"
    token_encryption_secret: str = "replace-this-in-production"

    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", API_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.api_cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url.startswith("postgres://"):
            return self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace(
                "postgresql://", "postgresql+psycopg://", 1
            )
        if self.database_url.startswith("sqlite:///"):
            db_path_value = self.database_url.removeprefix("sqlite:///")
            if not db_path_value:
                return self.database_url
            if db_path_value == ":memory:":
                return self.database_url
            db_path = Path(db_path_value)
            if db_path.is_absolute():
                return self.database_url
            absolute_path = (ROOT_DIR / db_path).resolve().as_posix()
            return f"sqlite:///{absolute_path}"
        return self.database_url

    @property
    def github_oauth_configured(self) -> bool:
        return bool(self.github_client_id.strip())

    @property
    def google_oauth_configured(self) -> bool:
        return bool(self.google_client_id.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
