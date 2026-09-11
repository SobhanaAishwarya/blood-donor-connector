"""Blueprint registry - one import point for the app factory."""
from backend.routes.admin import admin_bp
from backend.routes.auth import auth_bp
from backend.routes.donors import donors_bp
from backend.routes.matches import matches_bp
from backend.routes.meta import meta_bp
from backend.routes.notifications import notifications_bp
from backend.routes.requests import requests_bp

ALL_BLUEPRINTS = (
    meta_bp,
    auth_bp,
    donors_bp,
    requests_bp,
    matches_bp,
    notifications_bp,
    admin_bp,
)


def register_blueprints(app):
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)
