from datetime import datetime

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

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
        event = Event(
            user_id=user.id,
            title=payload.title,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            reminder_at=payload.reminder_at,
            source_text=payload.source_text,
        )
        session.add(event)
        session.commit()
        session.refresh(event)
        return _to_event_response(event)
    finally:
        session.close()
