from datetime import datetime
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.main import app
from app.models import CalendarConnection, Event, User
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


def integration_settings() -> Settings:
    return Settings(
        google_client_id="google-client-id",
        google_client_secret="google-client-secret",
        google_oauth_redirect_uri="http://localhost:8000/integrations/google/callback",
        jwt_secret="test-secret-with-at-least-thirty-two-bytes",
        token_encryption_secret="test-secret-with-at-least-thirty-two-bytes",
    )


def test_google_status_requires_bearer_token() -> None:
    client = TestClient(app)

    response = client.get("/integrations/google/status")

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_google_start_returns_authorization_url(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.commit()

    monkeypatch.setattr("app.routes.integrations.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", integration_settings)
    monkeypatch.setattr("app.routes.integrations.get_settings", integration_settings)
    token = create_access_token("1", integration_settings())
    client = TestClient(app)

    response = client.post(
        "/integrations/google/start",
        params={"redirect_to": "http://localhost:5175/"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    authorization_url = response.json()["authorization_url"]
    parsed = urlparse(authorization_url)
    query = parse_qs(parsed.query)
    assert parsed.netloc == "accounts.google.com"
    assert query["client_id"] == ["google-client-id"]
    assert query["redirect_uri"] == [
        "http://localhost:8000/integrations/google/callback"
    ]


def test_google_disconnect_removes_connection(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.flush()
        session.add(
            CalendarConnection(
                user_id=1,
                provider="google",
                calendar_id="primary",
            )
        )
        session.add(
            Event(
                user_id=1,
                title="Mirrored event",
                starts_at=datetime(2026, 6, 1, 9, 0),
                external_provider="google",
                external_event_id="google-event-1",
            )
        )
        session.commit()

    monkeypatch.setattr("app.routes.integrations.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", integration_settings)
    token = create_access_token("1", integration_settings())
    client = TestClient(app)

    response = client.delete(
        "/integrations/google/connection",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 204
    with TestingSessionLocal() as session:
        assert session.scalars(select(CalendarConnection)).all() == []
        assert session.scalars(select(Event)).all() == []
