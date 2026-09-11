"""Public metadata: health, client config, compatibility matrix, impact stats."""
from __future__ import annotations

from flask import Blueprint

from backend.config import Config
from backend.extensions import db
from backend.models import BloodRequest, Donation, Donor, User
from backend.services.compatibility import compatibility_matrix
from backend.services.eligibility_service import eligible_filter
from backend.utils.responses import ok

meta_bp = Blueprint("meta", __name__, url_prefix="/api")

# Demo baselines so the public impact counters look alive on a fresh install.
# Clearly-labelled demo data - real activity is added on top.
_DEMO_BASELINE = {
    "donors_registered": 4820,
    "requests_fulfilled": 1163,
    "lives_supported": 3120,
}


@meta_bp.get("/health")
def health():
    return ok({"status": "ok", "service": "blood-donor-connector"})


@meta_bp.get("/config")
def client_config():
    return ok(Config.public_dict())


@meta_bp.get("/compatibility")
def compatibility():
    return ok(compatibility_matrix())


@meta_bp.get("/stats/impact")
def impact():
    donors = db.session.query(Donor).count()
    fulfilled = (
        db.session.query(BloodRequest)
        .filter(BloodRequest.status == "fulfilled")
        .count()
    )
    units = db.session.query(db.func.coalesce(db.func.sum(BloodRequest.units), 0)).filter(
        BloodRequest.status == "fulfilled"
    ).scalar()
    eligible_available = (
        db.session.query(Donor)
        .filter(Donor.available.is_(True))
        .filter(eligible_filter())
        .count()
    )
    return ok({
        "is_demo": True,
        "donors_registered": _DEMO_BASELINE["donors_registered"] + donors,
        "requests_fulfilled": _DEMO_BASELINE["requests_fulfilled"] + fulfilled,
        "lives_supported": _DEMO_BASELINE["lives_supported"] + int(units or 0),
        "eligible_donors_available": eligible_available,
    })
