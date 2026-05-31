import jwt

from app.settings import Settings, get_settings


def create_oauth_state(
    payload: dict[str, object],
    settings: Settings | None = None,
) -> str:
    resolved_settings = settings or get_settings()
    return jwt.encode(
        {
            **payload,
            "kind": "oauth_state",
        },
        resolved_settings.jwt_secret,
        algorithm=resolved_settings.jwt_algorithm,
    )


def decode_oauth_state(
    state: str,
    settings: Settings | None = None,
) -> dict[str, object]:
    resolved_settings = settings or get_settings()
    try:
        payload = jwt.decode(
            state,
            resolved_settings.jwt_secret,
            algorithms=[resolved_settings.jwt_algorithm],
        )
    except jwt.InvalidTokenError as exc:
        raise ValueError("Invalid OAuth state") from exc

    if payload.get("kind") != "oauth_state":
        raise ValueError("Invalid OAuth state")
    return payload
