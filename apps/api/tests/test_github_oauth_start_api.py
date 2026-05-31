from urllib.parse import parse_qs, urlparse

import jwt
from fastapi.testclient import TestClient

from app.main import app
from app.settings import Settings


def test_github_oauth_start_requires_client_id(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.routes.auth.get_settings",
        lambda: Settings(_env_file=None, github_client_id=""),
    )

    client = TestClient(app)

    response = client.get("/auth/github/start")

    assert response.status_code == 503
    assert response.json() == {"detail": "GitHub OAuth is not configured"}


def test_github_oauth_start_redirects_to_github_authorize(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.routes.auth.get_settings",
        lambda: Settings(
            _env_file=None,
            github_client_id="github-client-id",
            github_oauth_redirect_uri="http://localhost:8000/auth/github/callback",
            jwt_secret="test-secret-with-at-least-thirty-two-bytes",
        ),
    )
    monkeypatch.setattr("app.routes.auth.token_urlsafe", lambda _: "fixed-state")

    client = TestClient(app)

    response = client.get("/auth/github/start", follow_redirects=False)

    assert response.status_code == 302
    location = response.headers["location"]
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "github.com"
    assert parsed.path == "/login/oauth/authorize"
    assert query["client_id"] == ["github-client-id"]
    assert query["redirect_uri"] == ["http://localhost:8000/auth/github/callback"]
    assert query["scope"] == ["read:user user:email"]
    state_payload = jwt.decode(
        query["state"][0],
        "test-secret-with-at-least-thirty-two-bytes",
        algorithms=["HS256"],
    )
    assert state_payload["csrf"] == "fixed-state"
    assert state_payload["redirect_to"] == "http://127.0.0.1:5175/"


def test_github_oauth_start_accepts_frontend_redirect(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.routes.auth.get_settings",
        lambda: Settings(
            github_client_id="github-client-id",
            github_oauth_redirect_uri="http://localhost:8000/auth/github/callback",
            jwt_secret="test-secret-with-at-least-thirty-two-bytes",
        ),
    )
    monkeypatch.setattr("app.routes.auth.token_urlsafe", lambda _: "fixed-state")

    client = TestClient(app)

    response = client.get(
        "/auth/github/start",
        params={"redirect_to": "http://localhost:5175/"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    location = response.headers["location"]
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert query["client_id"] == ["github-client-id"]
    assert query["state"][0] != "fixed-state"


def test_github_oauth_start_rejects_unknown_frontend_redirect(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.routes.auth.get_settings",
        lambda: Settings(
            github_client_id="github-client-id",
            github_oauth_redirect_uri="http://localhost:8000/auth/github/callback",
            jwt_secret="test-secret-with-at-least-thirty-two-bytes",
        ),
    )
    monkeypatch.setattr("app.routes.auth.token_urlsafe", lambda _: "fixed-state")

    client = TestClient(app)

    response = client.get(
        "/auth/github/start",
        params={"redirect_to": "https://example.com/"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    location = response.headers["location"]
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    state_payload = jwt.decode(
        query["state"][0],
        "test-secret-with-at-least-thirty-two-bytes",
        algorithms=["HS256"],
    )
    assert state_payload["redirect_to"] == "http://127.0.0.1:5175/"
