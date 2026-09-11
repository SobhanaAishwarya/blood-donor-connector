"""Application configuration.

All values come from environment variables (loaded from a local `.env` file
when present) so the same code runs unchanged in development and production.
"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent          # .../backend
PROJECT_ROOT = BASE_DIR.parent                       # repo root
CONFIG_DIR = BASE_DIR / "config"

load_dotenv(PROJECT_ROOT / ".env")


def _load_json(name: str) -> dict:
    with open(CONFIG_DIR / name, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _normalise_db_url(raw: str) -> str:
    """Resolve a relative sqlite path against the project root so the DB file
    always lands in the same place regardless of the working directory."""
    prefix = "sqlite:///"
    if raw.startswith(prefix):
        rel = raw[len(prefix):]
        if not os.path.isabs(rel):
            return prefix + str((PROJECT_ROOT / rel).resolve())
    return raw


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-not-for-production")

    SQLALCHEMY_DATABASE_URI = _normalise_db_url(
        os.getenv("DATABASE_URL", "sqlite:///database/blood_connector.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    JWT_EXPIRES_DAYS = int(os.getenv("JWT_EXPIRES_DAYS", "7"))

    RING_TIMEOUT_MINUTES = int(os.getenv("RING_TIMEOUT_MINUTES", "15"))
    MAX_DONORS_PER_RING = int(os.getenv("MAX_DONORS_PER_RING", "5"))

    # Donation intervals (days) enforced by the eligibility engine.
    DONATION_INTERVAL_DAYS = {"male": 90, "female": 120, "other": 90}

    MAP_PROVIDER = os.getenv("MAP_PROVIDER", "")
    MAP_TILE_URL = os.getenv("MAP_TILE_URL", "")

    # If true (default), the app seeds the demo dataset automatically on
    # first boot when the database is empty - keeps free/ephemeral hosting
    # deployments working without a manual seed step. Never touches a
    # database that already has users.
    AUTO_SEED_DEMO_DATA = os.getenv("AUTO_SEED_DEMO_DATA", "true").lower() in (
        "1", "true", "yes", "on"
    )

    # Static config data
    BLOOD_COMPATIBILITY = _load_json("blood_compatibility.json")
    RINGS = _load_json("rings.json")["rings"]
    CITY_COORDS = _load_json("city_coords.json")["cities"]

    FRONTEND_DIR = PROJECT_ROOT / "frontend"

    @classmethod
    def public_dict(cls) -> dict:
        """Config safe to expose to the browser via /api/config."""
        return {
            "ring_timeout_minutes": cls.RING_TIMEOUT_MINUTES,
            "max_donors_per_ring": cls.MAX_DONORS_PER_RING,
            "rings": cls.RINGS,
            "blood_groups": cls.BLOOD_COMPATIBILITY["groups"],
            "donation_interval_days": cls.DONATION_INTERVAL_DAYS,
            "map_provider": cls.MAP_PROVIDER,
            "map_tile_url": cls.MAP_TILE_URL,
            "city_coords": cls.CITY_COORDS,
        }
