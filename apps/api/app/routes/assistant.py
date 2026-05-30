from datetime import datetime

from fastapi import APIRouter, Header

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
    if not title or starts_at is None:
        parsed_command.message = "缺少日程标题或开始时间。"
        return parsed_command

    event = Event(
        user_id=user_id,
        title=title,
        starts_at=starts_at,
        source_text=parsed_command.text,
    )
    session.add(event)
    session.commit()
    session.refresh(event)

    parsed_command.message = "已创建日程。"
    parsed_command.event = _to_assistant_event_result(event)
    return parsed_command


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
