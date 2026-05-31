from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.main import app
from app.models import Event, User
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


def test_create_event_requires_bearer_token() -> None:
    client = TestClient(app)

    response = client.post(
        "/events",
        json={
            "title": "Team sync",
            "starts_at": "2026-05-31T09:00:00Z",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_create_event_persists_event_for_current_user(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.commit()

    monkeypatch.setattr("app.routes.events.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/events",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Team sync",
            "starts_at": "2026-05-31T09:00:00Z",
            "ends_at": "2026-05-31T09:30:00Z",
            "reminder_at": "2026-05-31T08:50:00Z",
            "source_text": "明天九点提醒我开会",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": 1,
        "user_id": 1,
        "title": "Team sync",
        "starts_at": "2026-05-31T09:00:00",
        "ends_at": "2026-05-31T09:30:00",
        "reminder_at": "2026-05-31T08:50:00",
        "status": "scheduled",
        "source_text": "明天九点提醒我开会",
        "sync_state": "local_only",
        "sync_error": None,
    }

    with TestingSessionLocal() as session:
        event = session.scalars(select(Event)).one()
        assert event.user_id == 1
        assert event.title == "Team sync"
        assert event.starts_at == datetime(2026, 5, 31, 9, 0)
        assert event.ends_at == datetime(2026, 5, 31, 9, 30)


def test_create_event_defaults_missing_end_time_to_one_minute(
    monkeypatch,
) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.commit()

    monkeypatch.setattr("app.routes.events.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/events",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "闹钟",
            "starts_at": "2026-05-31T20:29:00",
            "source_text": "帮我定一个三分钟后的闹钟。",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["starts_at"] == "2026-05-31T20:29:00"
    assert payload["ends_at"] == "2026-05-31T20:30:00"
    assert payload["sync_state"] == "local_only"

    with TestingSessionLocal() as session:
        event = session.scalars(select(Event)).one()
        assert event.ends_at == event.starts_at + timedelta(minutes=1)
