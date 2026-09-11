"""Authentication helpers: password hashing, JWT issue/verify, route guards."""
from __future__ import annotations

import functools
from datetime import datetime, timedelta, timezone

import jwt
from flask import current_app, g, request
from werkzeug.security import check_password_hash, generate_password_hash

from backend.utils.errors import AuthError, ForbiddenError
from backend.extensions import db

_ALGO = "HS256"


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #
def hash_password(raw: str) -> str:
    return generate_password_hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return check_password_hash(hashed, raw)


# --------------------------------------------------------------------------- #
# JSON Web Tokens
# --------------------------------------------------------------------------- #
def create_token(user) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "name": user.name,
        "iat": now,
        "exp": now + timedelta(days=current_app.config["JWT_EXPIRES_DAYS"]),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm=_ALGO)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token, current_app.config["SECRET_KEY"], algorithms=[_ALGO]
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Your session has expired. Please sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Invalid authentication token.") from exc


# --------------------------------------------------------------------------- #
# Request guards
# --------------------------------------------------------------------------- #
def _load_user_from_request():
    from backend.models import User  # local import avoids cycle

    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise AuthError("Authentication required.")
    payload = decode_token(header[7:].strip())
    try:
        user = db.session.get(User, int(payload.get("sub")))
    except (TypeError, ValueError):
        user = None
    if user is None:
        raise AuthError("Account no longer exists.")
    return user


def token_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        g.current_user = _load_user_from_request()
        return fn(*args, **kwargs)

    return wrapper


def roles_required(*roles):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            g.current_user = _load_user_from_request()
            if g.current_user.role not in roles:
                raise ForbiddenError(
                    "You do not have permission to perform this action."
                )
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def optional_auth(fn):
    """Populate g.current_user when a valid token is present, else None."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            g.current_user = _load_user_from_request()
        except AuthError:
            g.current_user = None
        return fn(*args, **kwargs)

    return wrapper
