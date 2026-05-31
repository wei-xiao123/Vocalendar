from datetime import date, datetime, timedelta

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
        "message": "找到 0 个日程。",
        "events": [],
    }

    with TestingSessionLocal() as session:
        assert session.scalars(select(Event)).all() == []


def test_assistant_list_command_returns_current_user_events(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.add(User(username="other", is_guest=False))
        session.flush()
        session.add_all(
            [
                Event(
                    user_id=1,
                    title="产品评审",
                    starts_at=datetime(2026, 6, 1, 9, 30),
                ),
                Event(
                    user_id=2,
                    title="其他用户日程",
                    starts_at=datetime(2026, 6, 1, 10, 30),
                ),
            ]
        )
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "列出提醒"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "list_events",
        "confidence": 0.8,
        "text": "列出提醒",
        "parameters": {},
        "message": "找到 1 个日程。",
        "events": [
            {
                "id": 1,
                "title": "产品评审",
                "starts_at": "2026-06-01T09:30:00",
                "status": "scheduled",
            }
        ],
    }


def test_assistant_list_command_filters_day_after_tomorrow(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    today = date.today()
    target_datetime = datetime.combine(today + timedelta(days=2), datetime.min.time())
    other_datetime = datetime.combine(today + timedelta(days=1), datetime.min.time())
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.flush()
        session.add_all(
            [
                Event(
                    user_id=1,
                    title="后天会议",
                    starts_at=target_datetime.replace(hour=9, minute=30),
                ),
                Event(
                    user_id=1,
                    title="明天会议",
                    starts_at=other_datetime.replace(hour=9, minute=30),
                ),
            ]
        )
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "看看后天日程"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "list_events",
        "confidence": 0.8,
        "text": "看看后天日程",
        "parameters": {"range": "day_after_tomorrow"},
        "message": "找到 1 个日程。",
        "events": [
            {
                "id": 1,
                "title": "后天会议",
                "starts_at": target_datetime.replace(hour=9, minute=30).isoformat(),
                "status": "scheduled",
            }
        ],
    }


def test_assistant_list_command_filters_next_week_weekday(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    today = date.today()
    current_weekday = today.weekday()
    target_date = today + timedelta(days=(7 - current_weekday) + 2)
    other_date = target_date - timedelta(days=1)
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.flush()
        session.add_all(
            [
                Event(
                    user_id=1,
                    title="下周三会议",
                    starts_at=datetime.combine(
                        target_date,
                        datetime.min.time(),
                    ).replace(
                        hour=9,
                        minute=30,
                    ),
                ),
                Event(
                    user_id=1,
                    title="其他日程",
                    starts_at=datetime.combine(other_date, datetime.min.time()).replace(
                        hour=9,
                        minute=30,
                    ),
                ),
            ]
        )
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "下周三有哪些日程"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "list_events",
        "confidence": 0.8,
        "text": "下周三有哪些日程",
        "parameters": {"target_date": target_date.isoformat()},
        "message": "找到 1 个日程。",
        "events": [
            {
                "id": 1,
                "title": "下周三会议",
                "starts_at": datetime.combine(
                    target_date,
                    datetime.min.time(),
                ).replace(hour=9, minute=30).isoformat(),
                "status": "scheduled",
            }
        ],
    }


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
            "ends_at": "2026-06-01T09:31:00",
            "status": "scheduled",
            "source_text": "添加提醒 2026-06-01 09:30 产品评审",
        },
    }

    with TestingSessionLocal() as session:
        event = session.scalars(select(Event)).one()
        assert event.user_id == 1
        assert event.title == "产品评审"


def test_assistant_add_command_creates_event_with_reminder_time(monkeypatch) -> None:
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
        json={"text": "添加提醒 2026-06-01 09:30 提前15分钟提醒我产品评审"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "add_event",
        "confidence": 0.85,
        "text": "添加提醒 2026-06-01 09:30 提前15分钟提醒我产品评审",
        "parameters": {
            "starts_at": "2026-06-01T09:30:00",
            "reminder_at": "2026-06-01T09:15:00",
            "title": "产品评审",
        },
        "message": "已创建日程。",
        "event": {
            "id": 1,
            "title": "产品评审",
            "starts_at": "2026-06-01T09:30:00",
            "ends_at": "2026-06-01T09:31:00",
            "reminder_at": "2026-06-01T09:15:00",
            "status": "scheduled",
            "source_text": "添加提醒 2026-06-01 09:30 提前15分钟提醒我产品评审",
        },
    }

    with TestingSessionLocal() as session:
        event = session.scalars(select(Event)).one()
        assert event.reminder_at == datetime(2026, 6, 1, 9, 15)


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


def test_assistant_delete_command_deletes_current_user_event(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.add(User(username="other", is_guest=False))
        session.flush()
        session.add_all(
            [
                Event(
                    user_id=1,
                    title="产品评审",
                    starts_at=datetime(2026, 6, 1, 9, 30),
                ),
                Event(
                    user_id=2,
                    title="产品评审",
                    starts_at=datetime(2026, 6, 1, 10, 30),
                ),
            ]
        )
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "删除提醒 产品评审"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "delete_event",
        "confidence": 0.85,
        "text": "删除提醒 产品评审",
        "parameters": {"title": "产品评审"},
        "message": "已删除日程。",
        "event": {
            "id": 1,
            "title": "产品评审",
            "starts_at": "2026-06-01T09:30:00",
            "status": "scheduled",
        },
    }

    with TestingSessionLocal() as session:
        events = session.scalars(select(Event).order_by(Event.user_id.asc())).all()
        assert [(event.user_id, event.title) for event in events] == [
            (2, "产品评审")
        ]


def test_assistant_delete_command_deletes_colloquial_alarm(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.flush()
        session.add(
            Event(
                user_id=1,
                title="闹钟",
                starts_at=datetime(2026, 5, 31, 20, 29),
            )
        )
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "把刚刚那个闹钟日程给删掉"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "delete_event",
        "confidence": 0.85,
        "text": "把刚刚那个闹钟日程给删掉",
        "parameters": {"title": "闹钟"},
        "message": "已删除日程。",
        "event": {
            "id": 1,
            "title": "闹钟",
            "starts_at": "2026-05-31T20:29:00",
            "status": "scheduled",
        },
    }

    with TestingSessionLocal() as session:
        assert session.scalars(select(Event)).all() == []


def test_assistant_delete_command_filters_by_range(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    today = date.today()
    today_datetime = datetime.combine(today, datetime.min.time()).replace(
        hour=9,
        minute=30,
    )
    tomorrow_datetime = datetime.combine(
        today + timedelta(days=1),
        datetime.min.time(),
    ).replace(hour=9, minute=30)
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.flush()
        session.add_all(
            [
                Event(
                    user_id=1,
                    title="产品评审",
                    starts_at=today_datetime,
                ),
                Event(
                    user_id=1,
                    title="产品评审",
                    starts_at=tomorrow_datetime,
                ),
            ]
        )
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "删除明天的产品评审提醒"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "delete_event",
        "confidence": 0.85,
        "text": "删除明天的产品评审提醒",
        "parameters": {
            "range": "tomorrow",
            "title": "产品评审",
        },
        "message": "已删除日程。",
        "event": {
            "id": 2,
            "title": "产品评审",
            "starts_at": tomorrow_datetime.isoformat(),
            "status": "scheduled",
        },
    }

    with TestingSessionLocal() as session:
        events = session.scalars(select(Event)).all()
        assert [(event.title, event.starts_at) for event in events] == [
            ("产品评审", today_datetime)
        ]


def test_assistant_delete_command_filters_by_next_week_weekday(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    today = date.today()
    current_weekday = today.weekday()
    target_date = today + timedelta(days=(7 - current_weekday) + 2)
    other_date = target_date - timedelta(days=1)
    target_datetime = datetime.combine(target_date, datetime.min.time()).replace(
        hour=9,
        minute=30,
    )
    other_datetime = datetime.combine(other_date, datetime.min.time()).replace(
        hour=9,
        minute=30,
    )
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.flush()
        session.add_all(
            [
                Event(
                    user_id=1,
                    title="产品评审",
                    starts_at=other_datetime,
                ),
                Event(
                    user_id=1,
                    title="产品评审",
                    starts_at=target_datetime,
                ),
            ]
        )
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "删除下周三的产品评审提醒"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "delete_event",
        "confidence": 0.85,
        "text": "删除下周三的产品评审提醒",
        "parameters": {
            "target_date": target_date.isoformat(),
            "title": "产品评审",
        },
        "message": "已删除日程。",
        "event": {
            "id": 2,
            "title": "产品评审",
            "starts_at": target_datetime.isoformat(),
            "status": "scheduled",
        },
    }

    with TestingSessionLocal() as session:
        events = session.scalars(select(Event)).all()
        assert [(event.title, event.starts_at) for event in events] == [
            ("产品评审", other_datetime)
        ]


def test_assistant_delete_command_returns_candidates_for_ambiguous_title(
    monkeypatch,
) -> None:
    TestingSessionLocal = build_test_session()
    first_datetime = datetime(2026, 6, 1, 9, 30)
    second_datetime = datetime(2026, 6, 1, 14, 30)
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.flush()
        session.add_all(
            [
                Event(
                    user_id=1,
                    title="产品评审",
                    starts_at=first_datetime,
                ),
                Event(
                    user_id=1,
                    title="产品评审",
                    starts_at=second_datetime,
                ),
            ]
        )
        session.commit()

    monkeypatch.setattr("app.routes.assistant.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", auth_settings)
    token = create_access_token("1", auth_settings())
    client = TestClient(app)

    response = client.post(
        "/assistant/commands",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "删除提醒 产品评审"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "delete_event",
        "confidence": 0.85,
        "text": "删除提醒 产品评审",
        "parameters": {"title": "产品评审"},
        "message": "找到多个匹配日程，请补充更具体的时间。",
        "events": [
            {
                "id": 1,
                "title": "产品评审",
                "starts_at": first_datetime.isoformat(),
                "status": "scheduled",
            },
            {
                "id": 2,
                "title": "产品评审",
                "starts_at": second_datetime.isoformat(),
                "status": "scheduled",
            },
        ],
    }

    with TestingSessionLocal() as session:
        events = session.scalars(select(Event).order_by(Event.starts_at.asc())).all()
        assert [event.starts_at for event in events] == [
            first_datetime,
            second_datetime,
        ]


def test_assistant_delete_command_reports_missing_event(monkeypatch) -> None:
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
        json={"text": "删除提醒 产品评审"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "delete_event",
        "confidence": 0.85,
        "text": "删除提醒 产品评审",
        "parameters": {"title": "产品评审"},
        "message": "未找到匹配日程。",
    }
