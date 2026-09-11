"""Admin dashboard: aggregate stats, charts, moderation."""
from __future__ import annotations

from collections import Counter

from flask import Blueprint

from backend.extensions import db
from backend.models import BloodRequest, Donation, Donor, Match, User
from backend.routes._helpers import paginate, pagination
from backend.services.eligibility_service import compute as compute_eligibility
from backend.services.eligibility_service import eligible_filter
from backend.utils.errors import NotFoundError
from backend.utils.responses import ok
from backend.utils.security import roles_required

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.get("/dashboard")
@roles_required("admin")
def dashboard():
    total_donors = db.session.query(Donor).count()
    eligible_donors = (
        db.session.query(Donor).filter(eligible_filter()).count()
    )
    available_donors = (
        db.session.query(Donor).filter(Donor.available.is_(True)).count()
    )
    unavailable_donors = total_donors - available_donors

    reqs = BloodRequest.query.all()
    by_status = Counter(r.status for r in reqs)
    by_group = Counter(r.blood_group for r in reqs)
    by_city = Counter(r.city for r in reqs)
    by_urgency = Counter(r.urgency for r in reqs)

    active = by_status.get("searching", 0) + by_status.get("matched", 0)

    recent_matches = (
        Match.query.order_by(Match.contacted_at.desc()).limit(12).all()
    )

    return ok({
        "totals": {
            "donors": total_donors,
            "eligible_donors": eligible_donors,
            "available_donors": available_donors,
            "unavailable_donors": unavailable_donors,
            "users": db.session.query(User).count(),
            "requests": len(reqs),
            "active_requests": active,
            "fulfilled_requests": by_status.get("fulfilled", 0),
            "pending_requests": by_status.get("searching", 0),
            "flagged_requests": by_status.get("flagged", 0),
            "donations": db.session.query(Donation).count(),
        },
        "charts": {
            "requests_by_group": _as_series(by_group),
            "requests_by_city": _as_series(by_city, top=6),
            "requests_by_status": _as_series(by_status),
            "requests_by_urgency": _as_series(by_urgency),
            "donor_availability": [
                {"label": "Available", "value": available_donors},
                {"label": "Unavailable", "value": unavailable_donors},
            ],
            "donor_eligibility": [
                {"label": "Eligible now", "value": eligible_donors},
                {"label": "Resting", "value": total_donors - eligible_donors},
            ],
        },
        "matching_activity": [
            {
                "request_id": m.request_id,
                "donor_anon": m.donor.anon_id,
                "ring": m.ring,
                "distance_km": round(m.distance, 1),
                "response": m.response,
                "contacted_at": m.contacted_at.isoformat() + "Z",
            }
            for m in recent_matches
        ],
    })


def _as_series(counter: Counter, top: int | None = None):
    items = counter.most_common(top) if top else sorted(counter.items())
    return [{"label": str(k), "value": v} for k, v in items]


@admin_bp.get("/donors")
@roles_required("admin")
def donors():
    page, per_page = pagination()
    q = Donor.query.join(User, Donor.user_id == User.id).order_by(Donor.id.desc())
    items, meta = paginate(q, page, per_page)
    return ok(
        {"donors": [d.to_dict(eligibility=compute_eligibility(d), reveal_contact=True)
                    for d in items]},
        meta=meta,
    )


@admin_bp.get("/requests")
@roles_required("admin")
def requests_list():
    page, per_page = pagination()
    q = BloodRequest.query.order_by(BloodRequest.created_at.desc())
    items, meta = paginate(q, page, per_page)
    return ok({
        "requests": [
            {
                **r.to_dict(include_requester_contact=True),
                "match_summary": {
                    "contacted": len(r.matches),
                    "accepted": sum(1 for m in r.matches if m.response == "accepted"),
                },
            }
            for r in items
        ]
    }, meta=meta)


@admin_bp.get("/donations")
@roles_required("admin")
def donations():
    page, per_page = pagination()
    q = Donation.query.order_by(Donation.created_at.desc())
    items, meta = paginate(q, page, per_page)
    return ok({
        "donations": [
            {**d.to_dict(), "donor_anon": d.donor.anon_id if d.donor else None}
            for d in items
        ]
    }, meta=meta)


@admin_bp.patch("/requests/<int:request_id>/flag")
@roles_required("admin")
def flag_request(request_id: int):
    from flask import request as flask_request

    req = db.session.get(BloodRequest, request_id)
    if req is None:
        raise NotFoundError("Request not found.")
    flagged = bool((flask_request.get_json(silent=True) or {}).get("flagged", True))
    req.status = "flagged" if flagged else "searching"
    db.session.commit()
    return ok({"request": req.to_dict()})


@admin_bp.delete("/users/<int:user_id>")
@roles_required("admin")
def delete_user(user_id: int):
    user = db.session.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    if user.role == "admin":
        from backend.utils.errors import ForbiddenError

        raise ForbiddenError("Admin accounts cannot be removed here.")
    db.session.delete(user)
    db.session.commit()
    return ok({"message": "User removed."})
