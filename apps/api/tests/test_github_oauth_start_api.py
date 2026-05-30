from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.main import app
from app.settings import Settings


def test_github_oauth_start_requires_client_id(monkeypatch) -> None:
    monkeypatch.setattr("app.routes.auth.get_settings", lambda: Settings())

    client = TestClient(app)

    response = client.get("/auth/github/start")

    assert response.status_code == 503
    assert response.json() == {"detail": "GitHub OAuth is not configured"}


def test_github_oauth_start_redirects_to_github_authorize(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.routes.auth.get_settings",
        lambda: Settings(
            github_client_id="github-client-id",
            github_oauth_redirect_uri="http://localhost:8000/auth/github/callback",
        ),
    )
    monkeypatch.setattr("app.routes.auth.token_urlsafe", lambda _: "fixed-state")

    client = TestClient(app)

    response = client.get("/auth/github/start", follow_redirects=False)

    assert response.status_code == 307
    location = response.headers["location"]
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "github.com"
    assert parsed.path == "/login/oauth/authorize"
    assert query == {
        "client_id": ["github-client-id"],
        "redirect_uri": ["http://localhost:8000/auth/github/callback"],
        "scope": ["read:user user:email"],
        "state": ["fixed-state"],
    }
