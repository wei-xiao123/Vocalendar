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


def test_assistant_commands_requires_bearer_token() -> None:
    client = TestClient(app)

    response = client.post("/assistant/commands", json={"text": "查看今天提醒"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_assistant_commands_returns_parse_result_without_writing_events(
    monkeypatch,
) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "查看今天提醒"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "list_events",
        "confidence": 0.8,
        "text": "查看今天提醒",
        "parameters": {"range": "today"},
    }

    with TestingSessionLocal() as session:
        assert session.scalars(select(Event)).all() == []


def test_assistant_add_command_creates_event(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "添加提醒 2026-06-01 09:30 产品评审"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "add_event",
        "confidence": 0.85,
        "text": "添加提醒 2026-06-01 09:30 产品评审",
        "parameters": {
            "starts_at": "2026-06-01T09:30:00",
            "title": "产品评审",
        },
        "message": "已创建日程。",
        "event": {
            "id": 1,
            "title": "产品评审",
            "starts_at": "2026-06-01T09:30:00",
            "status": "scheduled",
            "source_text": "添加提醒 2026-06-01 09:30 产品评审",
        },
    }

    with TestingSessionLocal() as session:
        event = session.scalars(select(Event)).one()
        assert event.user_id == 1
        assert event.title == "产品评审"


def test_assistant_add_command_requires_title_and_start(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "添加提醒 产品评审"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "add_event",
        "confidence": 0.85,
        "text": "添加提醒 产品评审",
        "parameters": {"title": "产品评审"},
        "message": "缺少日程标题或开始时间。",
    }

    with TestingSessionLocal() as session:
        assert session.scalars(select(Event)).all() == []
