import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.settings import Settings, get_settings


def _build_fernet(settings: Settings | None = None) -> Fernet:
    resolved_settings = settings or get_settings()
    digest = hashlib.sha256(
        resolved_settings.token_encryption_secret.encode("utf-8")
    ).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_text(value: str, settings: Settings | None = None) -> str:
    return _build_fernet(settings).encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_text(value: str, settings: Settings | None = None) -> str:
    try:
        return _build_fernet(settings).decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Invalid encrypted value") from exc
