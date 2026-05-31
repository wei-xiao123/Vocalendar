from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.crypto import decrypt_text, encrypt_text
from app.models import CalendarConnection
from app.settings import Settings, get_settings

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3"


class GoogleCalendarError(Exception):
    pass


class GoogleCalendarSyncResetRequired(GoogleCalendarError):
    pass


@dataclass
class GoogleCalendarEvent:
    event_id: str
    status: str
    summary: str
    starts_at: datetime
    ends_at: datetime | None
    updated_at: datetime | None


@dataclass
class GoogleCalendarSyncResult:
    events: list[GoogleCalendarEvent]
    next_sync_token: str | None


def build_google_oauth_url(
    client_id: str,
    redirect_uri: str,
    state: str,
) -> str:
    return str(
        httpx.URL(
            "https://accounts.google.com/o/oauth2/v2/auth",
            params={
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly",
                "access_type": "offline",
                "include_granted_scopes": "true",
                "prompt": "consent",
                "state": state,
            },
        )
    )


def exchange_google_code(
    *,
    code: str,
    settings: Settings | None = None,
) -> dict[str, Any]:
    resolved_settings = settings or get_settings()
    response = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": resolved_settings.google_client_id,
            "client_secret": resolved_settings.google_client_secret,
            "redirect_uri": resolved_settings.google_oauth_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if response.status_code != 200:
        raise GoogleCalendarError("Google token exchange failed")
    return response.json()


def refresh_google_access_token(
    connection: CalendarConnection,
    settings: Settings | None = None,
) -> None:
    resolved_settings = settings or get_settings()
    if not connection.refresh_token:
        raise GoogleCalendarError("Google refresh token missing")

    response = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": resolved_settings.google_client_id,
            "client_secret": resolved_settings.google_client_secret,
            "refresh_token": decrypt_text(connection.refresh_token, resolved_settings),
            "grant_type": "refresh_token",
        },
        timeout=10,
    )
    if response.status_code != 200:
        raise GoogleCalendarError("Google token refresh failed")

    payload = response.json()
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise GoogleCalendarError("Google token refresh failed")

    expires_in = int(payload.get("expires_in", 3600))
    connection.access_token = encrypt_text(access_token, resolved_settings)
    connection.token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)
    if payload.get("refresh_token"):
        connection.refresh_token = encrypt_text(
            str(payload["refresh_token"]),
            resolved_settings,
        )


def upsert_google_connection_tokens(
    connection: CalendarConnection,
    token_payload: dict[str, Any],
    settings: Settings | None = None,
) -> None:
    resolved_settings = settings or get_settings()
    access_token = token_payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise GoogleCalendarError("Google token payload missing access token")

    refresh_token = token_payload.get("refresh_token")
    expires_in = int(token_payload.get("expires_in", 3600))
    scope_value = token_payload.get("scope")

    connection.access_token = encrypt_text(access_token, resolved_settings)
    if isinstance(refresh_token, str) and refresh_token:
        connection.refresh_token = encrypt_text(refresh_token, resolved_settings)
    connection.token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)
    if isinstance(scope_value, str) and scope_value:
        connection.scopes = scope_value


def get_valid_google_access_token(
    connection: CalendarConnection,
    settings: Settings | None = None,
) -> str:
    resolved_settings = settings or get_settings()
    expires_at = _to_utc_datetime(connection.token_expires_at)
    if (
        connection.access_token
        and expires_at is not None
        and expires_at > datetime.now(UTC) + timedelta(minutes=1)
    ):
        return decrypt_text(connection.access_token, resolved_settings)

    refresh_google_access_token(connection, resolved_settings)
    if not connection.access_token:
        raise GoogleCalendarError("Google access token unavailable")
    return decrypt_text(connection.access_token, resolved_settings)


def _authorized_request(
    method: str,
    path: str,
    *,
    connection: CalendarConnection,
    params: dict[str, Any] | None = None,
    json: dict[str, Any] | None = None,
    settings: Settings | None = None,
) -> httpx.Response:
    access_token = get_valid_google_access_token(connection, settings)
    return httpx.request(
        method,
        f"{GOOGLE_CALENDAR_API_BASE_URL}{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params,
        json=json,
        timeout=10,
    )


def create_google_event(
    connection: CalendarConnection,
    *,
    title: str,
    starts_at: datetime,
    ends_at: datetime | None,
    settings: Settings | None = None,
) -> GoogleCalendarEvent:
    response = _authorized_request(
        "POST",
        f"/calendars/{connection.calendar_id}/events",
        connection=connection,
        json={
            "summary": title,
            "start": {"dateTime": _to_google_datetime(starts_at)},
            "end": {"dateTime": _to_google_datetime(ends_at or starts_at)},
            "reminders": {"useDefault": True},
        },
        settings=settings,
    )
    if response.status_code not in {200, 201}:
        raise GoogleCalendarError("Google event creation failed")
    return _parse_google_event(response.json())


def delete_google_event(
    connection: CalendarConnection,
    *,
    event_id: str,
    settings: Settings | None = None,
) -> None:
    response = _authorized_request(
        "DELETE",
        f"/calendars/{connection.calendar_id}/events/{event_id}",
        connection=connection,
        settings=settings,
    )
    if response.status_code not in {200, 204, 410, 404}:
        raise GoogleCalendarError("Google event deletion failed")


def list_google_events(
    connection: CalendarConnection,
    *,
    full_sync: bool,
    settings: Settings | None = None,
) -> GoogleCalendarSyncResult:
    params: dict[str, Any] = {
        "singleEvents": "true",
        "showDeleted": "true",
        "maxResults": "2500",
    }
    if full_sync:
        params["timeMin"] = (
            datetime.now(UTC)
            .replace(hour=0, minute=0, second=0, microsecond=0)
            .isoformat()
        )
    elif connection.sync_token:
        params["syncToken"] = connection.sync_token

    events: list[GoogleCalendarEvent] = []
    page_token: str | None = None
    next_sync_token: str | None = None

    while True:
        if page_token:
            params["pageToken"] = page_token
        elif "pageToken" in params:
            params.pop("pageToken")

        response = _authorized_request(
            "GET",
            f"/calendars/{connection.calendar_id}/events",
            connection=connection,
            params=params,
            settings=settings,
        )
        if response.status_code == 410:
            raise GoogleCalendarSyncResetRequired("Google sync token expired")
        if response.status_code != 200:
            raise GoogleCalendarError("Google event listing failed")

        payload = response.json()
        for item in payload.get("items", []):
            parsed = _parse_google_event(item)
            if parsed is not None:
                events.append(parsed)
        page_token = payload.get("nextPageToken")
        next_sync_token = payload.get("nextSyncToken", next_sync_token)
        if not page_token:
            break

    return GoogleCalendarSyncResult(events=events, next_sync_token=next_sync_token)


def _parse_google_event(payload: dict[str, Any]) -> GoogleCalendarEvent | None:
    event_id = payload.get("id")
    summary = payload.get("summary") or "Untitled event"
    status = payload.get("status") or "confirmed"
    start_payload = payload.get("start") or {}
    end_payload = payload.get("end") or {}
    starts_at = _parse_google_datetime(start_payload)
    if starts_at is None:
        return None

    return GoogleCalendarEvent(
        event_id=str(event_id),
        status=str(status),
        summary=str(summary),
        starts_at=starts_at,
        ends_at=_parse_google_datetime(end_payload),
        updated_at=_parse_google_updated_at(payload.get("updated")),
    )


def _parse_google_updated_at(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _parse_google_datetime(payload: dict[str, Any]) -> datetime | None:
    if payload.get("dateTime"):
        return datetime.fromisoformat(str(payload["dateTime"]).replace("Z", "+00:00"))
    if payload.get("date"):
        return datetime.fromisoformat(f"{payload['date']}T00:00:00+00:00")
    return None


def _to_google_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC).isoformat()
    return value.astimezone(UTC).isoformat()


def _to_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
