"""Typed API errors + a single place that turns them into JSON."""
from __future__ import annotations

from flask import jsonify


class ApiError(Exception):
    """Base class for all errors that should surface as clean JSON."""

    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, status_code: int | None = None,
                 code: str | None = None, errors: dict | None = None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code
        self.errors = errors or {}

    def to_response(self):
        payload = {"success": False, "error": self.message, "code": self.code}
        if self.errors:
            payload["errors"] = self.errors
        return jsonify(payload), self.status_code


class ValidationError(ApiError):
    status_code = 422
    code = "validation_error"

    def __init__(self, errors: dict, message: str = "Please correct the highlighted fields."):
        super().__init__(message, errors=errors)


class AuthError(ApiError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(ApiError):
    status_code = 403
    code = "forbidden"


class NotFoundError(ApiError):
    status_code = 404
    code = "not_found"


class ConflictError(ApiError):
    status_code = 409
    code = "conflict"


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def _handle_api_error(err: ApiError):
        return err.to_response()

    @app.errorhandler(404)
    def _handle_404(_err):
        return jsonify({"success": False, "error": "Resource not found",
                        "code": "not_found"}), 404

    @app.errorhandler(405)
    def _handle_405(_err):
        return jsonify({"success": False, "error": "Method not allowed",
                        "code": "method_not_allowed"}), 405

    @app.errorhandler(500)
    def _handle_500(err):  # pragma: no cover - safety net
        app.logger.exception("Unhandled error: %s", err)
        return jsonify({"success": False, "error": "Something went wrong on our end.",
                        "code": "server_error"}), 500
