from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.main import app
from app.settings import Settings


def auth_settings() -> Settings:
    return Settings(jwt_secret="test-secret-with-at-least-thirty-two-bytes")


def test_create_guest_session_persists_guest_user(monkeypatch) -> None:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    monkeypatch.setattr("app.routes.auth.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)

    client = TestClient(app)

    response = client.post("/auth/guest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["token_type"] == "bearer"
    assert payload["access_token"]
    assert payload["user"] == {
        "id": 1,
        "is_guest": True,
        "username": None,
        "display_name": "Guest User",
        "avatar_url": None,
        "email": None,
    }
