import re
from datetime import datetime

from pydantic import BaseModel, Field

ADD_COMMAND_PREFIXES = (
    "添加提醒",
    "新增提醒",
    "创建提醒",
    "提醒我",
    "帮我添加提醒",
)
DATETIME_PATTERN = re.compile(
    r"(?P<datetime>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)"
)


class AssistantCommandRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class AssistantCommandResponse(BaseModel):
    action: str
    confidence: float = Field(ge=0, le=1)
    text: str
    parameters: dict[str, str] = Field(default_factory=dict)


def parse_assistant_command(text: str) -> AssistantCommandResponse:
    normalized_text = text.strip()
    add_payload = _strip_add_command_prefix(normalized_text)
    if add_payload is not None:
        return _parse_add_command(normalized_text, add_payload)

    return AssistantCommandResponse(
        action="unknown",
        confidence=0,
        text=normalized_text,
    )


def _strip_add_command_prefix(text: str) -> str | None:
    for prefix in ADD_COMMAND_PREFIXES:
        if text.startswith(prefix):
            return text.removeprefix(prefix).strip(" ：:")
    return None


def _parse_add_command(original_text: str, payload: str) -> AssistantCommandResponse:
    parameters: dict[str, str] = {}
    remaining_title = payload

    datetime_match = DATETIME_PATTERN.search(payload)
    if datetime_match is not None:
        starts_at = _normalize_datetime(datetime_match.group("datetime"))
        if starts_at is not None:
            parameters["starts_at"] = starts_at
            remaining_title = (
                payload[: datetime_match.start()] + payload[datetime_match.end() :]
            ).strip(" ，,：:")

    if remaining_title:
        parameters["title"] = remaining_title

    return AssistantCommandResponse(
        action="add_event",
        confidence=0.85 if parameters else 0.6,
        text=original_text,
        parameters=parameters,
    )


def _normalize_datetime(value: str) -> str | None:
    try:
        parsed = datetime.fromisoformat(value.replace(" ", "T"))
    except ValueError:
        return None
    return parsed.isoformat()
