from fastapi import APIRouter, Header

from app.assistant import (
    AssistantCommandRequest,
    AssistantCommandResponse,
    parse_assistant_command,
)
from app.db import SessionLocal
from app.routes.auth import _extract_bearer_token, _get_user_from_access_token

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/commands", response_model=AssistantCommandResponse)
def parse_command(
    payload: AssistantCommandRequest,
    authorization: str | None = Header(default=None),
) -> AssistantCommandResponse:
    token = _extract_bearer_token(authorization)
    session = SessionLocal()
    try:
        _get_user_from_access_token(session, token)
        return parse_assistant_command(payload.text)
    finally:
        session.close()
