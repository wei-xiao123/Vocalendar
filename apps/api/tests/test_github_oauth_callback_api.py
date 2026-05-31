import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.main import app
from app.models import User
from app.settings import Settings


class FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, object]) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, object]:
        return self._payload


def build_test_session() -> sessionmaker[Session]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    return TestingSessionLocal


def oauth_settings() -> Settings:
    return Settings(
        github_client_id="github-client-id",
        github_client_secret="github-client-secret",
        github_oauth_redirect_uri="http://localhost:8000/auth/github/callback",
        jwt_secret="test-secret-with-at-least-thirty-two-bytes",
    )


def test_github_oauth_callback_requires_complete_config(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.routes.auth.get_settings",
        lambda: Settings(
            github_client_id="github-client-id",
            github_client_secret="",
        ),
    )

    client = TestClient(app)

    response = client.get("/auth/github/callback?code=oauth-code")

    assert response.status_code == 503
    assert response.json() == {"detail": "GitHub OAuth is not configured"}


def test_github_oauth_callback_surfaces_exchange_error_detail(monkeypatch) -> None:
    monkeypatch.setattr("app.routes.auth.get_settings", oauth_settings)
    monkeypatch.setattr(
        "app.routes.auth.httpx.post",
        lambda *_, **__: FakeResponse(
            200,
            {
                "error": "bad_verification_code",
                "error_description": "The code passed is incorrect or expired.",
            },
        ),
    )

    client = TestClient(app)

    response = client.get("/auth/github/callback?code=oauth-code")

    assert response.status_code == 502
    assert response.json() == {
        "detail": (
            "GitHub token exchange failed: "
            "The code passed is incorrect or expired."
        )
    }


def test_github_oauth_callback_redirects_error_back_to_frontend(monkeypatch) -> None:
    monkeypatch.setattr("app.routes.auth.get_settings", oauth_settings)
    monkeypatch.setattr(
        "app.routes.auth.httpx.post",
        lambda *_, **__: FakeResponse(
            200,
            {
                "error": "bad_verification_code",
                "error_description": "The code passed is incorrect or expired.",
            },
        ),
    )

    client = TestClient(app)
    start_response = client.get(
        "/auth/github/start",
        params={"redirect_to": "http://127.0.0.1:5175/"},
        follow_redirects=False,
    )
    state = start_response.headers["location"].split("state=")[1].split("&")[0]

    response = client.get(
        "/auth/github/callback",
        params={"code": "oauth-code", "state": state},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == (
        "http://127.0.0.1:5175/?auth_error=github_login_failed"
    )


def test_github_oauth_callback_creates_user_and_returns_token(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    monkeypatch.setattr("app.routes.auth.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", oauth_settings)
    monkeypatch.setattr(
        "app.routes.auth.httpx.post",
        lambda *_, **__: FakeResponse(200, {"access_token": "github-token"}),
    )
    monkeypatch.setattr(
        "app.routes.auth.httpx.get",
        lambda *_, **__: FakeResponse(
            200,
            {
                "id": 12345,
                "login": "octocat",
                "name": "The Octocat",
                "avatar_url": "https://github.com/images/error/octocat_happy.gif",
                "email": "octocat@example.com",
            },
        ),
    )

    client = TestClient(app)

    response = client.get("/auth/github/callback?code=oauth-code")

    assert response.status_code == 200
    payload = response.json()
    assert payload["token_type"] == "bearer"
    assert payload["user"] == {
        "id": 1,
        "is_guest": False,
        "username": "octocat",
        "display_name": "The Octocat",
        "avatar_url": "https://github.com/images/error/octocat_happy.gif",
        "email": "octocat@example.com",
    }
    decoded_token = jwt.decode(
        payload["access_token"],
        "test-secret-with-at-least-thirty-two-bytes",
        algorithms=["HS256"],
    )
    assert decoded_token["sub"] == "1"

    with TestingSessionLocal() as session:
        users = session.scalars(select(User)).all()
        assert len(users) == 1
        assert users[0].github_id == "12345"


def test_github_oauth_callback_updates_existing_user(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    with TestingSessionLocal() as session:
        session.add(User(github_id="12345", username="old-name", is_guest=False))
        session.commit()

    monkeypatch.setattr("app.routes.auth.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", oauth_settings)
    monkeypatch.setattr(
        "app.routes.auth.httpx.post",
        lambda *_, **__: FakeResponse(200, {"access_token": "github-token"}),
    )
    monkeypatch.setattr(
        "app.routes.auth.httpx.get",
        lambda *_, **__: FakeResponse(
            200,
            {
                "id": 12345,
                "login": "new-name",
                "name": "New Name",
                "avatar_url": None,
                "email": None,
            },
        ),
    )

    client = TestClient(app)

    response = client.get("/auth/github/callback?code=oauth-code")

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "new-name"
    with TestingSessionLocal() as session:
        users = session.scalars(select(User)).all()
        assert len(users) == 1
        assert users[0].username == "new-name"
        assert users[0].display_name == "New Name"


def test_github_oauth_callback_redirects_back_to_frontend(monkeypatch) -> None:
    TestingSessionLocal = build_test_session()
    monkeypatch.setattr("app.routes.auth.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routes.auth.get_settings", oauth_settings)
    monkeypatch.setattr(
        "app.routes.auth.httpx.post",
        lambda *_, **__: FakeResponse(200, {"access_token": "github-token"}),
    )
    monkeypatch.setattr(
        "app.routes.auth.httpx.get",
        lambda *_, **__: FakeResponse(
            200,
            {
                "id": 12345,
                "login": "octocat",
                "name": "The Octocat",
                "avatar_url": "https://github.com/images/error/octocat_happy.gif",
                "email": "octocat@example.com",
            },
        ),
    )

    client = TestClient(app)
    start_response = client.get(
        "/auth/github/start",
        params={"redirect_to": "http://localhost:5175/"},
        follow_redirects=False,
    )
    state = start_response.headers["location"].split("state=")[1].split("&")[0]

    response = client.get(
        "/auth/github/callback",
        params={"code": "oauth-code", "state": state},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"].startswith(
        "http://localhost:5175/?auth_access_token="
    )


def test_github_oauth_callback_redirects_provider_error_back_to_frontend(
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.routes.auth.get_settings", oauth_settings)

    client = TestClient(app)
    start_response = client.get(
        "/auth/github/start",
        params={"redirect_to": "http://127.0.0.1:5175/"},
        follow_redirects=False,
    )
    state = start_response.headers["location"].split("state=")[1].split("&")[0]

    response = client.get(
        "/auth/github/callback",
        params={
            "state": state,
            "error": "access_denied",
            "error_description": "The user denied access.",
        },
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == (
        "http://127.0.0.1:5175/?auth_error=github_login_failed"
        "&auth_provider_error=access_denied"
        "&auth_error_description=The+user+denied+access."
    )
