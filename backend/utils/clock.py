"""Time helpers.

We store *naive* UTC datetimes so comparisons stay simple and portable across
SQLite and PostgreSQL. `utcnow()` replaces the deprecated `datetime.utcnow()`.
"""
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
