"""Blood requests: create, track, match, confirm, cancel."""
from __future__ import annotations

from datetime import date

from flask import Blueprint, g

from backend.extensions import db
from backend.models import BloodRequest, Donation, Donor, Match
from backend.routes._helpers import json_body, paginate, pagination, query_bool
from backend.services import matching_service as matcher
from backend.services import notification_service as notif
from backend.services.compatibility import compatible_donor_groups
from backend.services.eligibility_service import compute as compute_eligibility
from backend.services.geo import haversine_km, resolve_coords
from backend.utils.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from backend.utils.responses import created, ok
from backend.utils.security import roles_required, token_required
from backend.utils.validation import Validator
from backend.utils.clock import utcnow

requests_bp = Blueprint("requests", __name__, url_prefix="/api/requests")

_URGENCIES = ("critical", "urgent", "normal")


def _match_summary(req: BloodRequest) -> dict:
    return {
        "contacted": len(req.matches),
        "accepted": sum(1 for m in req.matches if m.response == "accepted"),
        "pending": sum(1 for m in req.matches if m.response == "pending"),
    }


def _load_request(request_id: int) -> BloodRequest:
    req = db.session.get(BloodRequest, request_id)
    if req is None:
        raise NotFoundError("Blood request not found.")
    return req


def _can_view(req: BloodRequest) -> tuple[bool, bool]:
    """Returns (can_view, is_owner_or_admin)."""
    user = g.current_user
    if user.role == "admin" or user.id == req.requester_id:
        return True, True
    if user.donor and any(m.donor_id == user.donor.id for m in req.matches):
        return True, False
    return False, False


# --------------------------------------------------------------------------- #
# Create
# --------------------------------------------------------------------------- #
@requests_bp.post("")
@token_required
def create_request():
    # Any signed-in account can raise a request - a donor might need blood
    # themselves one day too. Role only governs the donor-matching machinery,
    # not who is allowed to ask for help.
    body = json_body()
    v = Validator(body)
    blood_group = v.blood_group("blood_group")
    units = v.integer("units", minimum=1, maximum=20, default=1)
    hospital = v.string("hospital", min_len=2, max_len=160)
    city = v.string("city", min_len=2, max_len=120)
    location = v.string("location", required=False, max_len=200)
    urgency = v.choice("urgency", _URGENCIES, default="urgent")
    required_by = v.future_datetime("required_by", required=False)
    message = v.string("additional_message", required=False, max_len=500)
    v.raise_if_errors()

    dup = (
        BloodRequest.query.filter_by(
            requester_id=g.current_user.id, blood_group=blood_group
        )
        .filter(BloodRequest.status.in_(("searching", "matched")))
        .first()
    )
    if dup:
        raise ConflictError(
            "You already have an active request for this blood group "
            f"(request #{dup.id}). Fulfil or cancel it first."
        )

    lat, lng = resolve_coords(city, location)
    if body.get("latitude") and body.get("longitude"):
        try:
            lat, lng = float(body["latitude"]), float(body["longitude"])
        except (TypeError, ValueError):
            pass

    req = BloodRequest(
        requester_id=g.current_user.id,
        blood_group=blood_group,
        units=units,
        hospital=hospital,
        city=city,
        location=location,
        latitude=lat,
        longitude=lng,
        urgency=urgency,
        status="searching",
        additional_message=message,
        required_by=required_by,
        created_at=utcnow(),
    )
    db.session.add(req)
    db.session.flush()

    matcher.start_matching(req)
    db.session.commit()

    return created({
        "request": req.to_dict(),
        "ring_state": matcher.ring_state(req),
        "matches": [m.to_dict_for_requester() for m in req.matches],
        "match_summary": _match_summary(req),
    })


# --------------------------------------------------------------------------- #
# List
# --------------------------------------------------------------------------- #
@requests_bp.get("")
@token_required
def list_requests():
    user = g.current_user
    from flask import request as flask_request

    scope = flask_request.args.get("scope")
    page, per_page = pagination()

    if scope == "open" or (user.role == "donor" and scope in (None, "open")):
        donor = user.donor
        q = BloodRequest.query.filter(BloodRequest.status == "searching")
        if donor and donor.blood_group:
            wanted = [
                rg for rg in _all_recipient_groups()
                if donor.blood_group in compatible_donor_groups(rg)
            ]
            q = q.filter(BloodRequest.blood_group.in_(wanted))
        q = q.filter(BloodRequest.requester_id != user.id).order_by(
            BloodRequest.created_at.desc()
        )
        items, meta = paginate(q, page, per_page)
        out = []
        for req in items:
            d = req.to_dict()
            if donor:
                dist = haversine_km(
                    req.latitude, req.longitude, donor.latitude, donor.longitude
                )
                d["distance_km"] = None if dist == float("inf") else round(dist, 1)
            out.append(d)
        return ok({"requests": out}, meta=meta)

    if user.role == "admin" and scope == "all":
        q = BloodRequest.query.order_by(BloodRequest.created_at.desc())
    else:
        q = BloodRequest.query.filter_by(requester_id=user.id).order_by(
            BloodRequest.created_at.desc()
        )
    items, meta = paginate(q, page, per_page)
    return ok(
        {"requests": [{**r.to_dict(), "match_summary": _match_summary(r),
                       "ring_state": matcher.ring_state(r)} for r in items]},
        meta=meta,
    )


def _all_recipient_groups():
    from backend.services.compatibility import ALL_GROUPS

    return ALL_GROUPS


# --------------------------------------------------------------------------- #
# Detail
# --------------------------------------------------------------------------- #
@requests_bp.get("/<int:request_id>")
@token_required
def get_request(request_id: int):
    req = _load_request(request_id)
    can_view, privileged = _can_view(req)
    if not can_view:
        raise ForbiddenError("You do not have access to this request.")

    if privileged and req.status == "searching":
        matcher.maybe_advance(req)
        db.session.refresh(req)

    payload = {
        "request": req.to_dict(include_requester_contact=privileged),
        "ring_state": matcher.ring_state(req),
        "match_summary": _match_summary(req),
        "privileged": privileged,
    }
    if privileged:
        payload["matches"] = [m.to_dict_for_requester() for m in req.matches]
    else:
        mine = next(
            (m for m in req.matches if m.donor_id == g.current_user.donor.id), None
        )
        payload["my_match"] = mine.to_dict_for_donor() if mine else None
    return ok(payload)


# --------------------------------------------------------------------------- #
# Matching controls
# --------------------------------------------------------------------------- #
@requests_bp.post("/<int:request_id>/match")
@token_required
def run_match(request_id: int):
    req = _load_request(request_id)
    _, privileged = _can_view(req)
    if not privileged:
        raise ForbiddenError("Only the requester can control matching.")
    if req.status != "searching":
        raise ConflictError(f"Request is '{req.status}', not searching.")

    advance = matcher.maybe_advance(req)
    new = matcher.run_ring(req, req.current_ring)
    db.session.refresh(req)
    return ok({
        "advanced": advance,
        "new_contacts": len(new),
        "ring_state": matcher.ring_state(req),
        "matches": [m.to_dict_for_requester() for m in req.matches],
    })


@requests_bp.post("/<int:request_id>/simulate-timeout")
@token_required
def simulate_timeout(request_id: int):
    """Demo affordance: fast-forward past the current ring's wait."""
    req = _load_request(request_id)
    _, privileged = _can_view(req)
    if not privileged:
        raise ForbiddenError("Only the requester can control matching.")
    if req.status != "searching":
        raise ConflictError(f"Request is '{req.status}', not searching.")

    matcher.simulate_timeout(req)
    advance = matcher.maybe_advance(req)
    db.session.refresh(req)
    return ok({
        "advanced": advance,
        "ring_state": matcher.ring_state(req),
        "matches": [m.to_dict_for_requester() for m in req.matches],
    })


# --------------------------------------------------------------------------- #
# Confirmation
# --------------------------------------------------------------------------- #
@requests_bp.post("/<int:request_id>/confirm")
@token_required
def confirm_request(request_id: int):
    req = _load_request(request_id)
    if g.current_user.role != "admin" and g.current_user.id != req.requester_id:
        raise ForbiddenError("Only the requester can confirm this request.")

    body = json_body()
    fulfilled = bool(body.get("fulfilled", True))

    match = None
    if body.get("match_id"):
        match = db.session.get(Match, body["match_id"])
    elif body.get("donor_id"):
        match = next(
            (m for m in req.matches if m.donor_id == body["donor_id"]), None
        )
    else:
        accepted = [m for m in req.matches if m.response == "accepted"]
        match = accepted[0] if len(accepted) == 1 else None

    if match is None or match.request_id != req.id:
        raise ValidationError({"match_id": "Choose which donor responded."})

    if not fulfilled:
        match.response = "declined"
        if req.status == "matched":
            req.status = "searching"
            req.ring_started_at = utcnow()
        db.session.commit()
        matcher.run_ring(req, req.current_ring)
        db.session.refresh(req)
        return ok({
            "request": req.to_dict(),
            "ring_state": matcher.ring_state(req),
            "message": "Marked as not fulfilled - search resumed.",
        })

    donor = db.session.get(Donor, match.donor_id)
    today = date.today()

    donation = Donation(
        donor_id=donor.id,
        request_id=req.id,
        confirmed_by=g.current_user.id,
        donation_date=today,
        verified=True,
    )
    db.session.add(donation)

    donor.last_donation_date = today
    donor.verified_donation_count += 1

    req.status = "fulfilled"
    for m in req.matches:
        if m.response == "pending":
            m.response = "expired"

    elig = compute_eligibility(donor, today)
    notif.notify(
        donor.user_id,
        title="Donation confirmed - thank you",
        message=(
            f"Your {req.blood_group} donation for the request in {req.city} "
            f"is verified. You're now on a {elig['interval_days']}-day rest; "
            f"eligible again on {elig['next_eligible_date']}."
        ),
        type="fulfilled",
        commit=False,
    )
    notif.notify(
        req.requester_id,
        **{k: v for k, v in notif.request_fulfilled(req.requester_id, req).items()
           if k != "user_id"},
        commit=False,
    )
    db.session.commit()

    return ok({
        "request": req.to_dict(),
        "donation": donation.to_dict(),
        "donor_eligibility": elig,
        "ring_state": matcher.ring_state(req),
        "message": "Request fulfilled. Thank you to everyone who helped.",
    })


# --------------------------------------------------------------------------- #
# Cancel / flag
# --------------------------------------------------------------------------- #
@requests_bp.patch("/<int:request_id>")
@token_required
def update_request(request_id: int):
    req = _load_request(request_id)
    body = json_body()
    action = body.get("action")

    if action == "cancel":
        if g.current_user.role != "admin" and g.current_user.id != req.requester_id:
            raise ForbiddenError("Only the requester can cancel this request.")
        if req.status == "fulfilled":
            raise ConflictError("A fulfilled request cannot be cancelled.")
        req.status = "cancelled"
        for m in req.matches:
            if m.response == "pending":
                m.response = "expired"
        db.session.commit()
        return ok({"request": req.to_dict()})

    if action in ("flag", "unflag"):
        if g.current_user.role != "admin":
            raise ForbiddenError("Admins only.")
        req.status = "flagged" if action == "flag" else "searching"
        db.session.commit()
        return ok({"request": req.to_dict()})

    raise ValidationError({"action": "Unknown action. Use cancel | flag | unflag."})
