from secrets import token_urlsafe
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.responses import RedirectResponse

from app.db import SessionLocal
from app.models import User
from app.settings import get_settings
from app.tokens import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


class GuestUserResponse(BaseModel):
    id: int
    is_guest: bool
    username: str | None = None
    display_name: str | None = None


class AuthUserResponse(BaseModel):
    id: int
    is_guest: bool
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    email: str | None = None


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUserResponse


def _create_guest_user(session: Session) -> User:
    user = User(
        username=None,
        display_name="Guest User",
        avatar_url=None,
        email=None,
        is_guest=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/guest", response_model=GuestUserResponse)
def create_guest_session() -> GuestUserResponse:
    session = SessionLocal()
    try:
        user = _create_guest_user(session)
        return GuestUserResponse(
            id=user.id,
            is_guest=user.is_guest,
            username=user.username,
            display_name=user.display_name,
        )
    finally:
        session.close()


def _build_github_oauth_url(client_id: str, redirect_uri: str, state: str) -> str:
    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": "read:user user:email",
            "state": state,
        }
    )
    return f"https://github.com/login/oauth/authorize?{query}"


@router.get("/github/start")
def start_github_oauth() -> RedirectResponse:
    settings = get_settings()
    if not settings.github_oauth_configured:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured")

    state = token_urlsafe(24)
    return RedirectResponse(
        _build_github_oauth_url(
            client_id=settings.github_client_id,
            redirect_uri=settings.github_oauth_redirect_uri,
            state=state,
        )
    )


def _exchange_github_code(
    client_id: str,
    client_secret: str,
    redirect_uri: str,
    code: str,
) -> str:
    response = httpx.post(
        "https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        },
        timeout=10,
    )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="GitHub token exchange failed")

    access_token = response.json().get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="GitHub token exchange failed")
    return access_token


def _fetch_github_user(github_access_token: str) -> dict[str, object]:
    response = httpx.get(
        "https://api.github.com/user",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {github_access_token}",
        },
        timeout=10,
    )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="GitHub user lookup failed")

    user_payload = response.json()
    if not user_payload.get("id"):
        raise HTTPException(status_code=502, detail="GitHub user lookup failed")
    return user_payload


def _upsert_github_user(session: Session, github_user: dict[str, object]) -> User:
    github_id = str(github_user["id"])
    user = session.query(User).filter(User.github_id == github_id).one_or_none()
    if user is None:
        user = User(github_id=github_id)
        session.add(user)

    user.username = str(github_user["login"]) if github_user.get("login") else None
    user.display_name = str(github_user["name"]) if github_user.get("name") else None
    user.avatar_url = (
        str(github_user["avatar_url"]) if github_user.get("avatar_url") else None
    )
    user.email = str(github_user["email"]) if github_user.get("email") else None
    user.is_guest = False
    session.commit()
    session.refresh(user)
    return user


@router.get("/github/callback", response_model=AuthTokenResponse)
def handle_github_oauth_callback(code: str) -> AuthTokenResponse:
    settings = get_settings()
    if not settings.github_oauth_configured or not settings.github_client_secret:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured")

    github_access_token = _exchange_github_code(
        client_id=settings.github_client_id,
        client_secret=settings.github_client_secret,
        redirect_uri=settings.github_oauth_redirect_uri,
        code=code,
    )
    github_user = _fetch_github_user(github_access_token)

    session = SessionLocal()
    try:
        user = _upsert_github_user(session, github_user)
        return AuthTokenResponse(
            access_token=create_access_token(str(user.id), settings),
            user=AuthUserResponse(
                id=user.id,
                is_guest=user.is_guest,
                username=user.username,
                display_name=user.display_name,
                avatar_url=user.avatar_url,
                email=user.email,
            ),
        )
    finally:
        session.close()
