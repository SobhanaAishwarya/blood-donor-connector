"""Donor profile - extends a `donor`-role User with medical + location data."""
from __future__ import annotations

from backend.extensions import db
from backend.utils.clock import utcnow


class Donor(db.Model):
    __tablename__ = "donors"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False, index=True
    )

    blood_group = db.Column(db.String(3), nullable=True, index=True)
    gender = db.Column(db.String(10), nullable=True)  # male | female | other

    city = db.Column(db.String(120), nullable=True, index=True)
    locality = db.Column(db.String(120), nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)

    available = db.Column(db.Boolean, nullable=False, default=True)
    last_donation_date = db.Column(db.Date, nullable=True)
    verified_donation_count = db.Column(db.Integer, nullable=False, default=0)

    profile_complete = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    user = db.relationship("User", back_populates="donor")
    matches = db.relationship(
        "Match", back_populates="donor", cascade="all, delete-orphan"
    )
    donations = db.relationship(
        "Donation",
        back_populates="donor",
        cascade="all, delete-orphan",
        order_by="Donation.donation_date.desc()",
    )

    # ------------------------------------------------------------------
    REQUIRED_FIELDS = ("blood_group", "gender", "city")

    def recompute_profile_complete(self) -> None:
        self.profile_complete = all(
            getattr(self, f) not in (None, "") for f in self.REQUIRED_FIELDS
        )

    @property
    def anon_id(self) -> str:
        """Stable, non-identifying handle shown before a donor accepts."""
        return f"BD{1000 + self.id}"

    def to_dict(self, *, eligibility: dict | None = None, reveal_contact: bool = False,
                distance_km: float | None = None) -> dict:
        data = {
            "id": self.id,
            "anon_id": self.anon_id,
            "blood_group": self.blood_group,
            "gender": self.gender,
            "city": self.city,
            "locality": self.locality,
            "available": self.available,
            "last_donation_date": self.last_donation_date.isoformat()
            if self.last_donation_date
            else None,
            "verified_donation_count": self.verified_donation_count,
            "profile_complete": self.profile_complete,
            "latitude": self.latitude,
            "longitude": self.longitude,
        }
        if distance_km is not None:
            data["distance_km"] = round(distance_km, 1)
        if eligibility is not None:
            data["eligibility"] = eligibility
        if reveal_contact and self.user is not None:
            data["name"] = self.user.name
            data["phone"] = self.user.phone
            data["email"] = self.user.email
        return data

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Donor {self.anon_id} {self.blood_group} {self.city}>"
