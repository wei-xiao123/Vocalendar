from datetime import datetime

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
                    title="Delete me",
                    starts_at=datetime(2026, 5, 31, 9, 0),
                ),
                Event(
                    user_id=2,
                    title="Other user event",
                    starts_at=datetime(2026, 5, 31, 10, 0),
                ),
            ]
        )
        session.commit()


def test_delete_event_requires_bearer_token() -> None:
    client = TestClient(app)

    response = client.delete("/events/1")

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_delete_event_removes_current_user_event(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    seed_events(TestingSessionLocal)
    monkeypatch.setattr("app.routes.events.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.delete(
        "/events/1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 204
    assert response.content == b""
    with TestingSessionLocal() as session:
        events = session.scalars(select(Event)).all()
        assert [event.title for event in events] == ["Other user event"]


def test_delete_event_hides_other_users_event(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    seed_events(TestingSessionLocal)
    monkeypatch.setattr("app.routes.events.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.delete(
        "/events/2",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Event not found"}
    with TestingSessionLocal() as session:
        assert len(session.scalars(select(Event)).all()) == 2
