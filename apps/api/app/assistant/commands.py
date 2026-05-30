from pydantic import BaseModel, Field


class AssistantCommandRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class AssistantCommandResponse(BaseModel):
    action: str
    confidence: float = Field(ge=0, le=1)
    text: str
    parameters: dict[str, str] = Field(default_factory=dict)


def parse_assistant_command(text: str) -> AssistantCommandResponse:
    return AssistantCommandResponse(
        action="unknown",
        confidence=0,
        text=text,
    )
