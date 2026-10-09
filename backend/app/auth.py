
import os
import hmac
import hashlib
import secrets
import base64
import time

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.database import get_db

SECRET_KEY = os.getenv("SCAMGUARD_SECRET_KEY", "")
if len(SECRET_KEY) < 32:
    # Lokal development üçün müvəqqəti açar.
    # Production-da mütləq environment variable təyin et.
    SECRET_KEY = ""

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, 600_000
    )
    return (
        "pbkdf2_sha256$600000$"
        + base64.urlsafe_b64encode(salt).decode()
        + "$"
        + base64.urlsafe_b64encode(digest).decode()
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False

        salt = base64.urlsafe_b64decode(salt_b64.encode())
        expected = base64.urlsafe_b64decode(digest_b64.encode())
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            int(iterations),
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int) -> str:
    if not SECRET_KEY:
        raise RuntimeError(
            "SCAMGUARD_SECRET_KEY environment variable təyin edilməyib."
        )

    expires = int(time.time()) + 60 * 60 * 8
    nonce = secrets.token_urlsafe(12)
    payload = f"{user_id}:{expires}:{nonce}".encode()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")

    signature = hmac.new(
        SECRET_KEY.encode(), encoded.encode(), hashlib.sha256
    ).digest()
    signature_encoded = (
        base64.urlsafe_b64encode(signature).decode().rstrip("=")
    )
    return f"{encoded}.{signature_encoded}"


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Giriş tələb olunur.")

    if not SECRET_KEY:
        raise HTTPException(status_code=500, detail="Server konfiqurasiyası tamamlanmayıb.")

    try:
        encoded, supplied_signature = credentials.credentials.split(".", 1)
        expected_signature = hmac.new(
            SECRET_KEY.encode(), encoded.encode(), hashlib.sha256
        ).digest()
        expected_encoded = (
            base64.urlsafe_b64encode(expected_signature).decode().rstrip("=")
        )

        if not hmac.compare_digest(supplied_signature, expected_encoded):
            raise ValueError("Invalid signature")

        padded = encoded + "=" * (-len(encoded) % 4)
        user_id_text, expiry_text, _nonce = (
            base64.urlsafe_b64decode(padded.encode()).decode().split(":", 2)
        )

        if int(expiry_text) < int(time.time()):
            raise HTTPException(status_code=401, detail="Sessiyanın vaxtı bitib.")

        user_id = int(user_id_text)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token yanlışdır.")

    with get_db() as db:
        user = db.execute(
            "SELECT id, email, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

    if user is None:
        raise HTTPException(status_code=401, detail="İstifadəçi tapılmadı.")

    return dict(user)