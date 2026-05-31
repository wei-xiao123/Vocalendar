from __future__ import annotations

from datetime import datetime
from urllib.parse import urlencode

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from starlette.responses import RedirectResponse

from app.calendar import (
    CalendarIntegrationError,
    get_google_connection_status,
    sync_user_calendar,
)
from app.calendar.google import (
    GoogleCalendarError,
    build_google_oauth_url,
    exchange_google_code,
    upsert_google_connection_tokens,
)
from app.db import SessionLocal
from app.models import CalendarConnection, Event
from app.oauth_state import create_oauth_state, decode_oauth_state
from app.routes.auth import _extract_bearer_token, _get_user_from_access_token
from app.settings import get_settings

router = APIRouter(prefix="/integrations/google", tags=["integrations"])


class GoogleConnectionStatusResponse(BaseModel):
    connected: bool
    provider: str
    calendar_id: str | None = None
    last_synced_at: datetime | None = None
    sync_error: str | None = None


class AuthorizationUrlResponse(BaseModel):
    authorization_url: str


@router.get("/status", response_model=GoogleConnectionStatusResponse)
def get_google_status(
    authorization: str | None = Header(default=None),
) -> GoogleConnectionStatusResponse:
    token = _extract_bearer_token(authorization)
    session = SessionLocal()
    try:
        user = _get_user_from_access_token(session, token)
        return GoogleConnectionStatusResponse.model_validate(
            get_google_connection_status(session, user.id)
        )
    finally:
        session.close()


@router.post("/start", response_model=AuthorizationUrlResponse)
def start_google_oauth(
    redirect_to: str,
    authorization: str | None = Header(default=None),
) -> AuthorizationUrlResponse:
    settings = get_settings()
    if not settings.google_oauth_configured:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")

    token = _extract_bearer_token(authorization)
    session = SessionLocal()
    try:
        user = _get_user_from_access_token(session, token)
        state = create_oauth_state(
            {
                "provider": "google",
                "user_id": user.id,
                "redirect_to": redirect_to,
            },
            settings,
        )
        return AuthorizationUrlResponse(
            authorization_url=build_google_oauth_url(
                client_id=settings.google_client_id,
                redirect_uri=settings.google_oauth_redirect_uri,
                state=state,
            )
        )
    finally:
        session.close()


@router.get("/callback")
def handle_google_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    settings = get_settings()
    if not settings.google_oauth_configured or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")

    try:
        if state is None:
            raise ValueError
        state_payload = decode_oauth_state(state, settings)
        user_id = int(state_payload["user_id"])
        redirect_to = str(state_payload["redirect_to"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid OAuth state") from None

    if error or not code:
        query = {"google_connected": "0", "google_error": "oauth_failed"}
        separator = "&" if "?" in redirect_to else "?"
        return RedirectResponse(f"{redirect_to}{separator}{urlencode(query)}")

    try:
        token_payload = exchange_google_code(code=code, settings=settings)
    except GoogleCalendarError:
        query = {"google_connected": "0", "google_error": "oauth_failed"}
        separator = "&" if "?" in redirect_to else "?"
        return RedirectResponse(f"{redirect_to}{separator}{urlencode(query)}")

    session = SessionLocal()
    try:
        connection = session.query(CalendarConnection).filter(
            CalendarConnection.user_id == user_id,
            CalendarConnection.provider == "google",
        ).one_or_none()
        if connection is None:
            connection = CalendarConnection(
                user_id=user_id,
                provider="google",
                calendar_id="primary",
            )
            session.add(connection)

        upsert_google_connection_tokens(connection, token_payload, settings)
        connection.sync_token = None
        connection.sync_cursor_reset_required = False
        session.commit()

        try:
            sync_user_calendar(session, user_id)
            query = {"google_connected": "1"}
        except (CalendarIntegrationError, Exception):
            query = {"google_connected": "0", "google_error": "sync_failed"}
    finally:
        session.close()

    separator = "&" if "?" in redirect_to else "?"
    return RedirectResponse(f"{redirect_to}{separator}{urlencode(query)}")


@router.delete("/connection", status_code=204)
def disconnect_google_calendar(
    authorization: str | None = Header(default=None),
) -> None:
    token = _extract_bearer_token(authorization)
    session = SessionLocal()
    try:
        user = _get_user_from_access_token(session, token)
        connection = session.query(CalendarConnection).filter(
            CalendarConnection.user_id == user.id,
            CalendarConnection.provider == "google",
        ).one_or_none()
        if connection is not None:
            session.query(Event).filter(
                Event.user_id == user.id,
                Event.external_provider == "google",
            ).delete()
            session.delete(connection)
            session.commit()
    finally:
        session.close()
