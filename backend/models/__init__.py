"""SQLAlchemy models for Blood Donor Connector.

Import order matters only for relationship resolution; importing this package
brings every model into scope so `db.create_all()` sees the full schema.
"""
from backend.extensions import db
from backend.models.user import User
from backend.models.donor import Donor
from backend.models.blood_request import BloodRequest
from backend.models.match import Match
from backend.models.donation import Donation
from backend.models.notification import Notification

__all__ = [
    "db",
    "User",
    "Donor",
    "BloodRequest",
    "Match",
    "Donation",
    "Notification",
]
