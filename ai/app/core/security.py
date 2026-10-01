import hmac

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

from app.core.config import settings

_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(key: str | None = Depends(_header)) -> None:
    """Service-to-service auth. Disabled when SERVICE_API_KEY is unset (local dev)."""
    if not settings.service_api_key:
        return
    if not key or not hmac.compare_digest(key, settings.service_api_key):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing API key")
