"""Donation - a verified, completed donation event that feeds donor history."""

from backend.extensions import db
from backend.utils.clock import utcnow


class Donation(db.Model):
    __tablename__ = "donations"

    id = db.Column(db.Integer, primary_key=True)
    donor_id = db.Column(
        db.Integer, db.ForeignKey("donors.id"), nullable=False, index=True
    )
    request_id = db.Column(
        db.Integer, db.ForeignKey("blood_requests.id"), nullable=True
    )
    confirmed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    donation_date = db.Column(db.Date, nullable=False)
    verified = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    donor = db.relationship("Donor", back_populates="donations")
    request = db.relationship("BloodRequest", back_populates="donation")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "donor_id": self.donor_id,
            "request_id": self.request_id,
            "donation_date": self.donation_date.isoformat(),
            "verified": self.verified,
            "blood_group": self.request.blood_group if self.request else None,
            "city": self.request.city if self.request else None,
            "hospital": self.request.hospital if self.request else None,
            "created_at": self.created_at.isoformat() + "Z",
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Donation d{self.donor_id} {self.donation_date}>"
