"""Lightweight, dependency-free input validation.

Usage:
    v = Validator(payload)
    name = v.string("name", min_len=2, max_len=120)
    email = v.email("email")
    v.raise_if_errors()
"""
from __future__ import annotations

import re
from datetime import date, datetime

from backend.config import Config
from backend.utils.errors import ValidationError

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^(?:\+?91[\-\s]?|0)?[6-9]\d{9}$")

BLOOD_GROUPS = tuple(Config.BLOOD_COMPATIBILITY["groups"])
GENDERS = ("male", "female", "other")


class Validator:
    def __init__(self, data: dict | None):
        self.data = data if isinstance(data, dict) else {}
        self.errors: dict[str, str] = {}

    # -- primitives -------------------------------------------------------
    def _fail(self, field: str, msg: str):
        self.errors.setdefault(field, msg)
        return None

    def string(self, field, *, required=True, min_len=1, max_len=255, default=None):
        raw = self.data.get(field, default)
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            if required:
                return self._fail(field, "This field is required.")
            return default
        value = str(raw).strip()
        if len(value) < min_len:
            return self._fail(field, f"Must be at least {min_len} characters.")
        if len(value) > max_len:
            return self._fail(field, f"Must be at most {max_len} characters.")
        return value

    def email(self, field="email", *, required=True):
        value = self.string(field, required=required, max_len=255)
        if value is None:
            return None
        value = value.lower()
        if not _EMAIL_RE.match(value):
            return self._fail(field, "Enter a valid email address.")
        return value

    def phone(self, field="phone", *, required=True):
        value = self.string(field, required=required, max_len=20)
        if value is None:
            return None
        compact = re.sub(r"[\s\-]", "", value)
        if not _PHONE_RE.match(compact):
            return self._fail(field, "Enter a valid 10-digit mobile number.")
        return compact

    def choice(self, field, choices, *, required=True, default=None):
        raw = self.data.get(field, default)
        if raw is None or raw == "":
            if required:
                return self._fail(field, "Please choose an option.")
            return default
        value = str(raw).strip()
        if value not in choices:
            return self._fail(field, f"Must be one of: {', '.join(choices)}.")
        return value

    def blood_group(self, field="blood_group", *, required=True):
        return self.choice(field, BLOOD_GROUPS, required=required)

    def gender(self, field="gender", *, required=True):
        return self.choice(field, GENDERS, required=required)

    def integer(self, field, *, required=True, minimum=None, maximum=None, default=None):
        raw = self.data.get(field, default)
        if raw is None or raw == "":
            if required:
                return self._fail(field, "This field is required.")
            return default
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return self._fail(field, "Enter a whole number.")
        if minimum is not None and value < minimum:
            return self._fail(field, f"Must be at least {minimum}.")
        if maximum is not None and value > maximum:
            return self._fail(field, f"Must be at most {maximum}.")
        return value

    def past_or_today_date(self, field, *, required=True):
        raw = self.data.get(field)
        if raw is None or raw == "":
            if required:
                return self._fail(field, "This field is required.")
            return None
        parsed = _parse_date(raw)
        if parsed is None:
            return self._fail(field, "Enter a valid date (YYYY-MM-DD).")
        if parsed > date.today():
            return self._fail(field, "Date cannot be in the future.")
        return parsed

    def future_datetime(self, field, *, required=False):
        raw = self.data.get(field)
        if raw is None or raw == "":
            if required:
                return self._fail(field, "This field is required.")
            return None
        parsed = _parse_datetime(raw)
        if parsed is None:
            return self._fail(field, "Enter a valid date and time.")
        return parsed

    def password(self, field="password", *, required=True):
        raw = self.data.get(field)
        if not raw:
            if required:
                return self._fail(field, "Choose a password.")
            return None
        if len(raw) < 8:
            return self._fail(field, "Use at least 8 characters.")
        if not re.search(r"[A-Za-z]", raw) or not re.search(r"\d", raw):
            return self._fail(field, "Include at least one letter and one number.")
        return raw

    def raise_if_errors(self):
        if self.errors:
            raise ValidationError(self.errors)


def _parse_date(raw):
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(str(raw).strip(), fmt).date()
        except ValueError:
            continue
    return None


def _parse_datetime(raw):
    text = str(raw).strip().replace("Z", "")
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M",
                "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None
