import hashlib
import hmac
import secrets

from app.core.config import get_settings


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    settings = get_settings()

    return hmac.new(
        settings.app_secret_key.encode(),
        token.encode(),
        hashlib.sha256,
    ).hexdigest()
