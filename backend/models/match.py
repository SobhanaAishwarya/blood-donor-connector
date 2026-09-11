"""Match - a single (request, donor) contact attempt within a ring."""

from backend.extensions import db
from backend.utils.clock import utcnow

MATCH_RESPONSES = ("pending", "accepted", "declined", "expired")


class Match(db.Model):
    __tablename__ = "matches"
    __table_args__ = (
        db.UniqueConstraint("request_id", "donor_id", name="uq_match_request_donor"),
        db.Index("ix_match_request", "request_id"),
        db.Index("ix_match_donor", "donor_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(
        db.Integer, db.ForeignKey("blood_requests.id"), nullable=False
    )
    donor_id = db.Column(db.Integer, db.ForeignKey("donors.id"), nullable=False)

    ring = db.Column(db.Integer, nullable=False, default=1)
    distance = db.Column(db.Float, nullable=False, default=0.0)  # km

    contacted_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    response = db.Column(db.String(10), nullable=False, default="pending")
    accepted_at = db.Column(db.DateTime, nullable=True)

    request = db.relationship("BloodRequest", back_populates="matches")
    donor = db.relationship("Donor", back_populates="matches")

    # ------------------------------------------------------------------
    def to_dict_for_requester(self) -> dict:
        """Privacy-first view: anonymous until the donor accepts."""
        revealed = self.response == "accepted"
        return {
            "id": self.id,
            "request_id": self.request_id,
            "ring": self.ring,
            "distance_km": round(self.distance, 1),
            "response": self.response,
            "contacted_at": self.contacted_at.isoformat() + "Z",
            "accepted_at": self.accepted_at.isoformat() + "Z"
            if self.accepted_at
            else None,
            "donor": self.donor.to_dict(reveal_contact=revealed),
        }

    def to_dict_for_donor(self) -> dict:
        """What the contacted donor sees about the request."""
        revealed = self.response == "accepted"
        return {
            "id": self.id,
            "ring": self.ring,
            "distance_km": round(self.distance, 1),
            "response": self.response,
            "contacted_at": self.contacted_at.isoformat() + "Z",
            "request": self.request.to_dict(include_requester_contact=revealed),
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Match r{self.request_id} d{self.donor_id} ring{self.ring} {self.response}>"
