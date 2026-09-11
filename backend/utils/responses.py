"""Helpers for consistent JSON envelopes: {success, data} / {success, error}."""
from __future__ import annotations

from flask import jsonify


def ok(data=None, *, status: int = 200, meta: dict | None = None):
    payload = {"success": True, "data": data if data is not None else {}}
    if meta:
        payload["meta"] = meta
    return jsonify(payload), status


def created(data=None, meta: dict | None = None):
    return ok(data, status=201, meta=meta)
