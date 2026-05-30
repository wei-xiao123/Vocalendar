from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.main import app
from app.models import User
from app.settings import Settings
from app.tokens import create_access_token


def build_test_session() -> sessionmaker[Session]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    return TestingSessionLocal


def auth_settings() -> Settings:
    return Settings(jwt_secret="test-secret-with-at-least-thirty-two-bytes")


def test_current_user_requires_bearer_token() -> None:
    client = TestClient(app)

    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_current_user_rejects_invalid_token(monkeypatch) -> None:
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    client = TestClient(app)

    response = client.get("/auth/me", headers={"Authorization": "Bearer invalid"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid access token"}


def test_current_user_rejects_missing_user(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    monkeypatch.setattr("app.routes.auth.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("999", auth_settings())
    client = TestClient(app)

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid access token"}


def test_current_user_returns_authenticated_user(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(
            User(
                username="octocat",
                display_name="The Octocat",
                avatar_url="https://github.com/images/error/octocat_happy.gif",
                email="octocat@example.com",
                is_guest=False,
            )
        )
        session.commit()

    monkeypatch.setattr("app.routes.auth.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {
        "id": 1,
        "is_guest": False,
        "username": "octocat",
        "display_name": "The Octocat",
        "avatar_url": "https://github.com/images/error/octocat_happy.gif",
        "email": "octocat@example.com",
    }
