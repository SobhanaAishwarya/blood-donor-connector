"""Shared Flask extension instances (kept separate to avoid import cycles)."""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
