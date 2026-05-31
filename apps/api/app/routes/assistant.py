from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Header
from sqlalchemy import select

from app.assistant import (
    AssistantCommandRequest,
    AssistantCommandResponse,
    AssistantEventResult,
    parse_assistant_command,
)
from app.db import SessionLocal
from app.models import Event
from app.routes.auth import _extract_bearer_token, _get_user_from_access_token

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post(
    "/commands",
    response_model=AssistantCommandResponse,
    response_model_exclude_none=True,
)
def parse_command(
    payload: AssistantCommandRequest,
    authorization: str | None = Header(default=None),
) -> AssistantCommandResponse:
    token = _extract_bearer_token(authorization)
    session = SessionLocal()
    try:
        user = _get_user_from_access_token(session, token)
        parsed_command = parse_assistant_command(payload.text)
        if parsed_command.action == "add_event":
            return _create_event_from_command(session, user.id, parsed_command)
        if parsed_command.action == "list_events":
            return _list_events_from_command(session, user.id, parsed_command)
        if parsed_command.action == "delete_event":
            return _delete_event_from_command(session, user.id, parsed_command)
        return parsed_command
    finally:
        session.close()


def _create_event_from_command(
    session,
    user_id: int,
    parsed_command: AssistantCommandResponse,
) -> AssistantCommandResponse:
    title = parsed_command.parameters.get("title")
    starts_at = _parse_starts_at(parsed_command.parameters.get("starts_at"))
    reminder_at = _parse_starts_at(parsed_command.parameters.get("reminder_at"))
    if not title or starts_at is None:
        parsed_command.message = "缺少日程标题或开始时间。"
        return parsed_command

    event = Event(
        user_id=user_id,
        title=title,
        starts_at=starts_at,
        reminder_at=reminder_at,
        source_text=parsed_command.text,
    )
    session.add(event)
    session.commit()
    session.refresh(event)

    parsed_command.message = "已创建日程。"
    parsed_command.event = _to_assistant_event_result(event)
    return parsed_command


def _list_events_from_command(
    session,
    user_id: int,
    parsed_command: AssistantCommandResponse,
) -> AssistantCommandResponse:
    statement = select(Event).where(Event.user_id == user_id)
    range_bounds = _get_range_bounds(parsed_command.parameters.get("range"))
    if range_bounds is not None:
        starts_from, starts_to = range_bounds
        statement = statement.where(Event.starts_at >= starts_from)
        statement = statement.where(Event.starts_at <= starts_to)
    statement = statement.order_by(Event.starts_at.asc(), Event.id.asc())

    events = [_to_assistant_event_result(event) for event in session.scalars(statement)]
    parsed_command.message = f"找到 {len(events)} 个日程。"
    parsed_command.events = events
    return parsed_command


def _delete_event_from_command(
    session,
    user_id: int,
    parsed_command: AssistantCommandResponse,
) -> AssistantCommandResponse:
    title = parsed_command.parameters.get("title")
    if not title:
        parsed_command.message = "缺少要删除的日程标题。"
        return parsed_command

    statement = select(Event).where(Event.user_id == user_id, Event.title == title)
    range_bounds = _get_range_bounds(parsed_command.parameters.get("range"))
    if range_bounds is not None:
        starts_from, starts_to = range_bounds
        statement = statement.where(Event.starts_at >= starts_from)
        statement = statement.where(Event.starts_at <= starts_to)
    statement = statement.order_by(Event.starts_at.asc(), Event.id.asc())
    event = session.scalars(statement).first()
    if event is None:
        parsed_command.message = "未找到匹配日程。"
        return parsed_command

    parsed_command.event = _to_assistant_event_result(event)
    session.delete(event)
    session.commit()
    parsed_command.message = "已删除日程。"
    return parsed_command


def _get_range_bounds(range_value: str | None) -> tuple[datetime, datetime] | None:
    today = date.today()
    if range_value == "today":
        target_date = today
    elif range_value == "tomorrow":
        target_date = today + timedelta(days=1)
    elif range_value == "day_after_tomorrow":
        target_date = today + timedelta(days=2)
    else:
        return None

    return (
        datetime.combine(target_date, time.min),
        datetime.combine(target_date, time.max),
    )


def _parse_starts_at(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _to_assistant_event_result(event: Event) -> AssistantEventResult:
    return AssistantEventResult(
        id=event.id,
        title=event.title,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        reminder_at=event.reminder_at,
        status=event.status,
        source_text=event.source_text,
    )
