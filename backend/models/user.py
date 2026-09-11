"""User account model - one row per person, regardless of role."""

from backend.extensions import db
from backend.utils.clock import utcnow

VALID_ROLES = ("donor", "requester", "admin")


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(20), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="requester")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    donor = db.relationship(
        "Donor",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    requests = db.relationship(
        "BloodRequest",
        back_populates="requester",
        cascade="all, delete-orphan",
    )
    notifications = db.relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="Notification.created_at.desc()",
    )

    # ------------------------------------------------------------------
    def to_dict(self, include_contact: bool = True) -> dict:
        """Public representation. `password_hash` is never included."""
        data = {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "created_at": self.created_at.isoformat() + "Z",
        }
        if include_contact:
            data["email"] = self.email
            data["phone"] = self.phone
        return data

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<User {self.id} {self.email} ({self.role})>"
