from datetime import UTC, datetime, timedelta

import jwt

from app.settings import Settings, get_settings


def create_access_token(
    subject: str,
    settings: Settings | None = None,
    expires_delta: timedelta = timedelta(hours=12),
) -> str:
    resolved_settings = settings or get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(
        payload,
        resolved_settings.jwt_secret,
        algorithm=resolved_settings.jwt_algorithm,
    )


def decode_access_token(token: str, settings: Settings | None = None) -> str:
    resolved_settings = settings or get_settings()
    try:
        payload = jwt.decode(
            token,
            resolved_settings.jwt_secret,
            algorithms=[resolved_settings.jwt_algorithm],
        )
    except jwt.InvalidTokenError as exc:
        raise ValueError("Invalid access token") from exc

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise ValueError("Invalid access token subject")
    return subject
