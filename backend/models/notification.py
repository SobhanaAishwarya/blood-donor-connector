"""Notification - in-app message (SMS/e-mail are simulated for the demo)."""

from backend.extensions import db
from backend.utils.clock import utcnow

NOTIFICATION_TYPES = ("request", "accept", "eligibility", "fulfilled", "system")


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    title = db.Column(db.String(160), nullable=False)
    message = db.Column(db.String(400), nullable=False)
    type = db.Column(db.String(16), nullable=False, default="system")
    link = db.Column(db.String(200), nullable=True)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    user = db.relationship("User", back_populates="notifications")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "type": self.type,
            "link": self.link,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat() + "Z",
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Notification u{self.user_id} {self.type} read={self.is_read}>"
