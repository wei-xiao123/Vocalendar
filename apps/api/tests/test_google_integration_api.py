from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.calendar.google import get_valid_google_access_token
from app.calendar.service import sync_user_calendar
from app.crypto import encrypt_text
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


def test_google_callback_redirects_back_to_frontend_when_sync_fails(
    monkeypatch,
) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.commit()

    monkeypatch.setattr("app.routes.integrations.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", integration_settings)
    monkeypatch.setattr("app.routes.integrations.get_settings", integration_settings)
    monkeypatch.setattr(
        "app.routes.integrations.exchange_google_code",
        lambda *_, **__: {
            "access_token": "google-access-token",
            "refresh_token": "google-refresh-token",
            "expires_in": 3600,
            "scope": "scope-a scope-b",
        },
    )
    monkeypatch.setattr(
        "app.routes.integrations.sync_user_calendar",
        lambda *_, **__: (_ for _ in ()).throw(TypeError("naive datetime")),
    )

    client = TestClient(app)
    token = create_access_token("1", integration_settings())
    start_response = client.post(
        "/integrations/google/start",
        params={"redirect_to": "http://localhost:5175/"},
        headers={"Authorization": f"Bearer {token}"},
    )
    authorization_url = start_response.json()["authorization_url"]
    state = parse_qs(urlparse(authorization_url).query)["state"][0]

    response = client.get(
        "/integrations/google/callback",
        params={"code": "oauth-code", "state": state},
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == (
        "http://localhost:5175/?google_connected=0&google_error=sync_failed"
    )


def test_google_access_token_accepts_naive_expiry_from_sqlite() -> None:
    settings = integration_settings()
    connection = CalendarConnection(
        user_id=1,
        provider="google",
        calendar_id="primary",
        access_token=encrypt_text("google-access-token", settings),
        token_expires_at=datetime.now(UTC)
        .replace(tzinfo=None)
        + timedelta(hours=1),
    )

    assert get_valid_google_access_token(connection, settings) == "google-access-token"


def test_google_event_creation_uses_default_reminders(monkeypatch) -> None:
    from app.calendar.google import create_google_event

    captured_request = {}
    settings = integration_settings()
    connection = CalendarConnection(
        user_id=1,
        provider="google",
        calendar_id="primary",
        access_token=encrypt_text("google-access-token", settings),
        token_expires_at=datetime.now(UTC) + timedelta(hours=1),
    )

    def fake_request(method, url, **kwargs):
        captured_request["method"] = method
        captured_request["url"] = url
        captured_request["json"] = kwargs["json"]

        class FakeResponse:
            status_code = 201

            @staticmethod
            def json():
                return {
                    "id": "google-event-1",
                    "summary": "闹钟",
                    "status": "confirmed",
                    "start": {"dateTime": "2026-05-31T12:29:00Z"},
                    "end": {"dateTime": "2026-05-31T12:30:00Z"},
                    "updated": "2026-05-31T12:00:00Z",
                }

        return FakeResponse()

    monkeypatch.setattr("app.calendar.google.httpx.request", fake_request)

    create_google_event(
        connection,
        title="闹钟",
        starts_at=datetime(2026, 5, 31, 20, 29),
        ends_at=datetime(2026, 5, 31, 20, 30),
        settings=settings,
    )

    assert captured_request["method"] == "POST"
    assert captured_request["json"]["summary"] == "闹钟"
    assert captured_request["json"]["start"] == {
        "dateTime": "2026-05-31T20:29:00",
        "timeZone": "Asia/Shanghai",
    }
    assert captured_request["json"]["end"] == {
        "dateTime": "2026-05-31T20:30:00",
        "timeZone": "Asia/Shanghai",
    }
    assert captured_request["json"]["reminders"] == {"useDefault": True}


def test_google_event_creation_keeps_local_afternoon_time(monkeypatch) -> None:
    from app.calendar.google import create_google_event

    captured_request = {}
    settings = integration_settings()
    connection = CalendarConnection(
        user_id=1,
        provider="google",
        calendar_id="primary",
        access_token=encrypt_text("google-access-token", settings),
        token_expires_at=datetime.now(UTC) + timedelta(hours=1),
    )

    def fake_request(method, url, **kwargs):
        captured_request["json"] = kwargs["json"]

        class FakeResponse:
            status_code = 201

            @staticmethod
            def json():
                return {
                    "id": "google-event-1",
                    "summary": "开会",
                    "status": "confirmed",
                    "start": {
                        "dateTime": "2026-06-01T15:00:00+08:00",
                        "timeZone": "Asia/Shanghai",
                    },
                    "end": {
                        "dateTime": "2026-06-01T15:01:00+08:00",
                        "timeZone": "Asia/Shanghai",
                    },
                    "updated": "2026-05-31T12:00:00Z",
                }

        return FakeResponse()

    monkeypatch.setattr("app.calendar.google.httpx.request", fake_request)

    create_google_event(
        connection,
        title="开会",
        starts_at=datetime(2026, 6, 1, 15, 0),
        ends_at=datetime(2026, 6, 1, 15, 1),
        settings=settings,
    )

    assert captured_request["json"]["start"] == {
        "dateTime": "2026-06-01T15:00:00",
        "timeZone": "Asia/Shanghai",
    }
    assert captured_request["json"]["end"] == {
        "dateTime": "2026-06-01T15:01:00",
        "timeZone": "Asia/Shanghai",
    }


def test_google_sync_preserves_local_timezone_time(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    settings = integration_settings()
    with TestingSessionLocal() as session:
        session.add(User(username="octocat", is_guest=False))
        session.add(
            CalendarConnection(
                user_id=1,
                provider="google",
                calendar_id="primary",
                access_token=encrypt_text("google-access-token", settings),
                token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.commit()

    monkeypatch.setattr("app.calendar.google.get_settings", lambda: settings)

    def fake_request(method, url, **kwargs):
        class FakeResponse:
            status_code = 200

            @staticmethod
            def json():
                return {
                    "items": [
                        {
                            "id": "google-event-1",
                            "summary": "开会",
                            "status": "confirmed",
                            "start": {
                                "dateTime": "2026-06-01T15:00:00+08:00",
                                "timeZone": "Asia/Shanghai",
                            },
                            "end": {
                                "dateTime": "2026-06-01T15:01:00+08:00",
                                "timeZone": "Asia/Shanghai",
                            },
                            "updated": "2026-05-31T12:00:00Z",
                        }
                    ],
                    "nextSyncToken": "sync-token",
                }

        return FakeResponse()

    monkeypatch.setattr("app.calendar.google.httpx.request", fake_request)

    with TestingSessionLocal() as session:
        sync_user_calendar(session, 1)
        event = session.scalars(select(Event)).one()

    assert event.starts_at == datetime(2026, 6, 1, 15, 0)
    assert event.ends_at == datetime(2026, 6, 1, 15, 1)
