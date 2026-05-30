from secrets import token_urlsafe
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.responses import RedirectResponse

from app.db import SessionLocal
from app.models import User
from app.settings import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


class GuestUserResponse(BaseModel):
    id: int
    is_guest: bool
    username: str | None = None
    display_name: str | None = None


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
