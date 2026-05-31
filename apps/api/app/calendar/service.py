from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calendar.google import (
    GoogleCalendarError,
    GoogleCalendarSyncResetRequired,
    create_google_event,
    delete_google_event,
    list_google_events,
)
from app.models import CalendarConnection, Event
from app.settings import get_settings

DEFAULT_EVENT_DURATION = timedelta(minutes=1)


class CalendarIntegrationError(Exception):
    pass


class CalendarNotConnectedError(CalendarIntegrationError):
    pass


class CalendarConflictError(CalendarIntegrationError):
    pass


def get_google_connection(session: Session, user_id: int) -> CalendarConnection | None:
    return session.scalar(
        select(CalendarConnection).where(
            CalendarConnection.user_id == user_id,
            CalendarConnection.provider == "google",
        )
    )


def get_google_connection_status(session: Session, user_id: int) -> dict[str, object]:
    connection = get_google_connection(session, user_id)
    if connection is None:
        return {"connected": False, "provider": "google"}

    return {
        "connected": True,
        "provider": "google",
        "calendar_id": connection.calendar_id,
        "last_synced_at": connection.last_synced_at,
        "sync_error": None,
    }


def sync_user_calendar(session: Session, user_id: int) -> None:
    connection = get_google_connection(session, user_id)
    if connection is None:
        return

    try:
        full_sync = connection.sync_cursor_reset_required or not connection.sync_token
        sync_result = list_google_events(connection, full_sync=full_sync)
    except GoogleCalendarSyncResetRequired:
        connection.sync_token = None
        connection.sync_cursor_reset_required = False
        session.commit()
        sync_result = list_google_events(connection, full_sync=True)
    except GoogleCalendarError as exc:
        raise CalendarIntegrationError(str(exc)) from exc

    external_ids_seen: set[str] = set()
    for remote_event in sync_result.events:
        external_ids_seen.add(remote_event.event_id)
        local_event = session.scalar(
            select(Event).where(
                Event.user_id == user_id,
                Event.external_provider == "google",
                Event.external_event_id == remote_event.event_id,
            )
        )
        if remote_event.status == "cancelled":
            if local_event is not None:
                session.delete(local_event)
            continue

        if local_event is None:
            local_event = Event(
                user_id=user_id,
                title=remote_event.summary,
                starts_at=_to_naive_datetime(remote_event.starts_at),
                ends_at=_to_naive_datetime(remote_event.ends_at),
                status=remote_event.status,
                external_provider="google",
                external_calendar_id=connection.calendar_id,
                external_event_id=remote_event.event_id,
                sync_state="synced",
                last_synced_at=datetime.now(UTC),
                external_updated_at=remote_event.updated_at,
            )
            session.add(local_event)
        else:
            local_event.title = remote_event.summary
            local_event.starts_at = _to_naive_datetime(remote_event.starts_at)
            local_event.ends_at = _to_naive_datetime(remote_event.ends_at)
            local_event.status = remote_event.status
            local_event.sync_state = "synced"
            local_event.sync_error = None
            local_event.last_synced_at = datetime.now(UTC)
            local_event.external_updated_at = remote_event.updated_at

    connection.sync_token = sync_result.next_sync_token or connection.sync_token
    connection.sync_cursor_reset_required = False
    connection.last_synced_at = datetime.now(UTC)
    session.commit()


def create_user_event(
    session: Session,
    *,
    user_id: int,
    title: str,
    starts_at: datetime,
    ends_at: datetime | None = None,
    reminder_at: datetime | None = None,
    source_text: str | None = None,
) -> Event:
    connection = get_google_connection(session, user_id)
    resolved_ends_at = _resolve_event_end_time(starts_at, ends_at)
    event = Event(
        user_id=user_id,
        title=title,
        starts_at=starts_at,
        ends_at=resolved_ends_at,
        reminder_at=reminder_at,
        source_text=source_text,
    )
    session.add(event)
    session.flush()

    if connection is not None:
        try:
            remote_event = create_google_event(
                connection,
                title=title,
                starts_at=starts_at,
                ends_at=resolved_ends_at,
            )
        except GoogleCalendarError as exc:
            event.sync_state = "sync_failed"
            event.sync_error = str(exc)
        else:
            event.external_provider = "google"
            event.external_calendar_id = connection.calendar_id
            event.external_event_id = remote_event.event_id
            event.status = remote_event.status
            event.sync_state = "synced"
            event.sync_error = None
            event.last_synced_at = datetime.now(UTC)
            event.external_updated_at = remote_event.updated_at
    else:
        event.sync_state = "local_only"

    session.commit()
    session.refresh(event)
    return event


def delete_user_event(
    session: Session,
    *,
    user_id: int,
    event: Event,
) -> None:
    if event.user_id != user_id:
        raise CalendarConflictError("Event not found")

    connection = get_google_connection(session, user_id)
    if event.external_provider == "google" and event.external_event_id:
        if connection is None:
            raise CalendarNotConnectedError("Google Calendar is not connected")
        try:
            delete_google_event(connection, event_id=event.external_event_id)
        except GoogleCalendarError as exc:
            raise CalendarIntegrationError(str(exc)) from exc

    session.delete(event)
    session.commit()


def _to_naive_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    settings = get_settings()
    try:
        time_zone = ZoneInfo(settings.calendar_time_zone)
    except ZoneInfoNotFoundError:
        time_zone = UTC
    return value.astimezone(time_zone).replace(tzinfo=None)


def _resolve_event_end_time(
    starts_at: datetime,
    ends_at: datetime | None,
) -> datetime:
    if ends_at is not None and ends_at > starts_at:
        return ends_at
    return starts_at + DEFAULT_EVENT_DURATION
