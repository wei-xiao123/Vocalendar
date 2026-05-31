from datetime import datetime

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.calendar import (
    CalendarConflictError,
    CalendarIntegrationError,
    create_user_event,
    delete_user_event,
    sync_user_calendar,
)
from app.db import SessionLocal
from app.models import Event
from app.routes.auth import (
    _extract_bearer_token,
    _get_user_from_access_token,
)

router = APIRouter(prefix="/events", tags=["events"])


class EventCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    starts_at: datetime
    ends_at: datetime | None = None
    reminder_at: datetime | None = None
    source_text: str | None = None


class EventResponse(BaseModel):
    id: int
    user_id: int
    title: str
    starts_at: datetime
    ends_at: datetime | None
    reminder_at: datetime | None
    status: str
    source_text: str | None
    sync_state: str
    sync_error: str | None


def _to_event_response(event: Event) -> EventResponse:
    return EventResponse(
        id=event.id,
        user_id=event.user_id,
        title=event.title,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        reminder_at=event.reminder_at,
        status=event.status,
        source_text=event.source_text,
        sync_state=event.sync_state,
        sync_error=event.sync_error,
    )


@router.post("", response_model=EventResponse)
def create_event(
    payload: EventCreateRequest,
    authorization: str | None = Header(default=None),
) -> EventResponse:
    token = _extract_bearer_token(authorization)
    session = SessionLocal()
    try:
        user = _get_user_from_access_token(session, token)
        event = create_user_event(
            session,
            user_id=user.id,
            title=payload.title,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            reminder_at=payload.reminder_at,
            source_text=payload.source_text,
        )
        return _to_event_response(event)
    except CalendarIntegrationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        session.close()


@router.get("", response_model=list[EventResponse])
def list_events(
    authorization: str | None = Header(default=None),
    starts_from: datetime | None = None,
    starts_to: datetime | None = None,
) -> list[EventResponse]:
    token = _extract_bearer_token(authorization)
    session = SessionLocal()
    try:
        user = _get_user_from_access_token(session, token)
        sync_user_calendar(session, user.id)
        statement = select(Event).where(Event.user_id == user.id)
        if starts_from is not None:
            statement = statement.where(Event.starts_at >= starts_from)
        if starts_to is not None:
            statement = statement.where(Event.starts_at <= starts_to)
        statement = statement.order_by(Event.starts_at.asc(), Event.id.asc())
        return [_to_event_response(event) for event in session.scalars(statement)]
    except CalendarIntegrationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        session.close()


@router.delete("/{event_id}", status_code=204)
def delete_event(
    event_id: int,
    authorization: str | None = Header(default=None),
) -> Response:
    token = _extract_bearer_token(authorization)
    session = SessionLocal()
    try:
        user = _get_user_from_access_token(session, token)
        event = session.get(Event, event_id)
        if event is None or event.user_id != user.id:
            raise HTTPException(status_code=404, detail="Event not found")
        delete_user_event(session, user_id=user.id, event=event)
        return Response(status_code=204)
    except CalendarConflictError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CalendarIntegrationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        session.close()
