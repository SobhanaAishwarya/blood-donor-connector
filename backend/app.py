"""Application factory + dev entry point.

Run from the project root:
    python run.py
or
    python -m backend.app
"""
from __future__ import annotations

import os
import sys

# Allow `python backend/app.py` as well as module execution.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from flask import Flask, abort, jsonify, send_from_directory  # noqa: E402
from flask_cors import CORS  # noqa: E402

from backend.config import Config  # noqa: E402
from backend.extensions import db  # noqa: E402
from backend.utils.errors import register_error_handlers  # noqa: E402


def create_app(config_object: type = Config, *, auto_seed: bool | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config_object)

    db.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Models must be imported before create_all so metadata is populated.
    from backend import models  # noqa: F401
    from backend.routes import register_blueprints

    register_blueprints(app)
    register_error_handlers(app)

    with app.app_context():
        _ensure_db_dir(app)
        db.create_all()

        should_seed = app.config["AUTO_SEED_DEMO_DATA"] if auto_seed is None else auto_seed
        if should_seed:
            from backend.demo_data import seed_if_empty

            if seed_if_empty():
                app.logger.info("Empty database detected - seeded the demo dataset.")

    _register_frontend(app)
    return app


def _ensure_db_dir(app: Flask) -> None:
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    prefix = "sqlite:///"
    if uri.startswith(prefix):
        path = uri[len(prefix):]
        os.makedirs(os.path.dirname(path), exist_ok=True)


def _register_frontend(app: Flask) -> None:
    frontend_dir = str(Config.FRONTEND_DIR)

    @app.get("/")
    def _index():
        return send_from_directory(frontend_dir, "index.html")

    @app.get("/<path:path>")
    def _frontend(path: str):
        if path.startswith("api/"):
            abort(404)
        if os.path.isfile(os.path.join(frontend_dir, path)):
            return send_from_directory(frontend_dir, path)
        pretty = f"{path}.html"
        if os.path.isfile(os.path.join(frontend_dir, pretty)):
            return send_from_directory(frontend_dir, pretty)
        abort(404)

    @app.get("/api")
    def _api_root():
        return jsonify({
            "success": True,
            "data": {"service": "Blood Donor Connector API", "docs": "/api/health"},
        })


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_ENV", "development") != "production"
    app.run(host="0.0.0.0", port=port, debug=debug)
