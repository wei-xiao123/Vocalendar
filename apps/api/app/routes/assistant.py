from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Header
from sqlalchemy import select

from app.assistant import (
    AssistantCommandRequest,
    AssistantCommandResponse,
    AssistantEventResult,
    parse_assistant_command,
)
from app.calendar import (
    CalendarIntegrationError,
    create_user_event,
    delete_user_event,
    sync_user_calendar,
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

    try:
        event = create_user_event(
            session,
            user_id=user_id,
            title=title,
            starts_at=starts_at,
            reminder_at=reminder_at,
            source_text=parsed_command.text,
        )
    except CalendarIntegrationError as exc:
        parsed_command.message = str(exc)
        return parsed_command

    parsed_command.message = "已创建日程。"
    parsed_command.event = _to_assistant_event_result(event)
    return parsed_command


def _list_events_from_command(
    session,
    user_id: int,
    parsed_command: AssistantCommandResponse,
) -> AssistantCommandResponse:
    try:
        sync_user_calendar(session, user_id)
    except CalendarIntegrationError as exc:
        parsed_command.message = str(exc)
        return parsed_command

    statement = select(Event).where(Event.user_id == user_id)
    range_bounds = _get_range_bounds(parsed_command.parameters)
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
    try:
        sync_user_calendar(session, user_id)
    except CalendarIntegrationError as exc:
        parsed_command.message = str(exc)
        return parsed_command

    title = parsed_command.parameters.get("title")
    if not title:
        parsed_command.message = "缺少要删除的日程标题。"
        return parsed_command

    statement = select(Event).where(Event.user_id == user_id)
    range_bounds = _get_range_bounds(parsed_command.parameters)
    if range_bounds is not None:
        starts_from, starts_to = range_bounds
        statement = statement.where(Event.starts_at >= starts_from)
        statement = statement.where(Event.starts_at <= starts_to)
    statement = statement.order_by(Event.starts_at.asc(), Event.id.asc())
    events = _filter_delete_candidates(session.scalars(statement).all(), title)
    if not events:
        parsed_command.message = "未找到匹配日程。"
        return parsed_command
    if len(events) > 1:
        parsed_command.message = "找到多个匹配日程，请补充更具体的时间。"
        parsed_command.events = [_to_assistant_event_result(event) for event in events]
        return parsed_command

    event = events[0]
    parsed_command.event = _to_assistant_event_result(event)
    try:
        delete_user_event(session, user_id=user_id, event=event)
    except CalendarIntegrationError as exc:
        parsed_command.message = str(exc)
        return parsed_command
    parsed_command.message = "已删除日程。"
    return parsed_command


def _filter_delete_candidates(events: list[Event], title: str) -> list[Event]:
    normalized_title = _normalize_match_text(title)
    if not normalized_title:
        return []

    exact_matches = [
        event
        for event in events
        if _normalize_match_text(event.title) == normalized_title
    ]
    if exact_matches:
        return exact_matches

    aliases = _get_delete_title_aliases(normalized_title)
    return [
        event
        for event in events
        if _event_matches_any_title_alias(event, aliases)
    ]


def _event_matches_any_title_alias(event: Event, aliases: set[str]) -> bool:
    searchable_text = _normalize_match_text(
        " ".join(part for part in (event.title, event.source_text) if part),
    )
    return any(alias and alias in searchable_text for alias in aliases)


def _get_delete_title_aliases(normalized_title: str) -> set[str]:
    aliases = {normalized_title}
    if normalized_title in {"闹钟", "闹铃", "响铃"}:
        aliases.update({"闹钟", "闹铃", "响铃"})
    return aliases


def _normalize_match_text(value: str) -> str:
    return "".join(value.split()).lower()


def _get_range_bounds(
    parameters: dict[str, str],
) -> tuple[datetime, datetime] | None:
    target_date_value = parameters.get("target_date")
    if target_date_value:
        try:
            target_date = date.fromisoformat(target_date_value)
        except ValueError:
            return None
        return (
            datetime.combine(target_date, time.min),
            datetime.combine(target_date, time.max),
        )

    range_value = parameters.get("range")
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
