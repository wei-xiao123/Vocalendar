from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
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


def seed_events(TestingSessionLocal: sessionmaker[Session]) -> None:
    with TestingSessionLocal() as session:
        session.add_all(
            [
                User(username="octocat", is_guest=False),
                User(username="other", is_guest=False),
            ]
        )
        session.flush()
        session.add_all(
            [
                Event(
                    user_id=1,
                    title="Morning standup",
                    starts_at=datetime(2026, 5, 31, 9, 0),
                ),
                Event(
                    user_id=1,
                    title="Lunch",
                    starts_at=datetime(2026, 5, 31, 12, 0),
                ),
                Event(
                    user_id=2,
                    title="Other user event",
                    starts_at=datetime(2026, 5, 31, 10, 0),
                ),
            ]
        )
        session.commit()


def test_list_events_requires_bearer_token() -> None:
    client = TestClient(app)

    response = client.get("/events")

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_list_events_returns_current_user_events(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    seed_events(TestingSessionLocal)
    monkeypatch.setattr("app.routes.events.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.get("/events", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    titles = [event["title"] for event in response.json()]
    assert titles == ["Morning standup", "Lunch"]


def test_list_events_filters_by_start_range(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    seed_events(TestingSessionLocal)
    monkeypatch.setattr("app.routes.events.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.get(
        "/events",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "starts_from": "2026-05-31T10:00:00",
            "starts_to": "2026-05-31T13:00:00",
        },
    )

    assert response.status_code == 200
    assert [event["title"] for event in response.json()] == ["Lunch"]
