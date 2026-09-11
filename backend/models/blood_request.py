"""Blood request - an emergency need raised by a `requester`-role User."""

from backend.extensions import db
from backend.utils.clock import utcnow

URGENCY_LEVELS = ("critical", "urgent", "normal")
REQUEST_STATUSES = ("searching", "matched", "fulfilled", "cancelled", "flagged")


class BloodRequest(db.Model):
    __tablename__ = "blood_requests"

    id = db.Column(db.Integer, primary_key=True)
    requester_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )

    blood_group = db.Column(db.String(3), nullable=False)  # patient's group
    units = db.Column(db.Integer, nullable=False, default=1)

    hospital = db.Column(db.String(160), nullable=False)
    city = db.Column(db.String(120), nullable=False, index=True)
    location = db.Column(db.String(200), nullable=True)  # area / address text
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)

    urgency = db.Column(db.String(10), nullable=False, default="urgent")
    status = db.Column(db.String(12), nullable=False, default="searching", index=True)

    # Ring-based fan-out bookkeeping
    current_ring = db.Column(db.Integer, nullable=False, default=1)
    ring_started_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    additional_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    required_by = db.Column(db.DateTime, nullable=True)

    requester = db.relationship("User", back_populates="requests")
    matches = db.relationship(
        "Match",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="Match.distance.asc()",
    )
    donation = db.relationship(
        "Donation", back_populates="request", uselist=False
    )

    # ------------------------------------------------------------------
    @property
    def is_active(self) -> bool:
        return self.status in ("searching", "matched")

    def to_dict(self, *, include_requester_contact: bool = False) -> dict:
        data = {
            "id": self.id,
            "blood_group": self.blood_group,
            "units": self.units,
            "hospital": self.hospital,
            "city": self.city,
            "location": self.location,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "urgency": self.urgency,
            "status": self.status,
            "current_ring": self.current_ring,
            "ring_started_at": self.ring_started_at.isoformat() + "Z",
            "additional_message": self.additional_message,
            "created_at": self.created_at.isoformat() + "Z",
            "required_by": self.required_by.isoformat() + "Z"
            if self.required_by
            else None,
            "requester_name": self.requester.name if self.requester else None,
        }
        if include_requester_contact and self.requester is not None:
            data["requester_phone"] = self.requester.phone
            data["requester_email"] = self.requester.email
        return data

    def __repr__(self) -> str:  # pragma: no cover
        return f"<BloodRequest {self.id} {self.blood_group} {self.urgency} {self.status}>"
