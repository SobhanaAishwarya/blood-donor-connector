"""Donor profile, availability, search, and donor-facing request feed."""
from __future__ import annotations

from flask import Blueprint, g

from backend.extensions import db
from backend.models import BloodRequest, Donor, Match, User
from backend.routes._helpers import (
    current_donor,
    json_body,
    paginate,
    pagination,
    query_bool,
    query_float,
)
from backend.services.compatibility import compatible_donor_groups, recipients_for_donor
from backend.services.eligibility_service import compute as compute_eligibility
from backend.services.eligibility_service import eligible_filter
from backend.services.geo import haversine_km, resolve_coords
from backend.utils.errors import NotFoundError, ValidationError
from backend.utils.responses import ok
from backend.utils.security import optional_auth, roles_required, token_required
from backend.utils.validation import Validator

donors_bp = Blueprint("donors", __name__, url_prefix="/api/donors")


# --------------------------------------------------------------------------- #
# Own profile
# --------------------------------------------------------------------------- #
@donors_bp.get("/me")
@token_required
def get_me():
    donor = current_donor()
    elig = compute_eligibility(donor)
    return ok({"donor": donor.to_dict(eligibility=elig, reveal_contact=True),
               "eligibility": elig})


@donors_bp.put("/me")
@token_required
def update_me():
    donor = current_donor(create_if_missing=True)
    body = json_body()
    v = Validator(body)

    blood_group = v.blood_group("blood_group", required=False)
    gender = v.gender("gender", required=False)
    city = v.string("city", required=False, max_len=120)
    locality = v.string("locality", required=False, max_len=120)
    last_donation_date = v.past_or_today_date("last_donation_date", required=False)
    v.raise_if_errors()

    if blood_group is not None:
        donor.blood_group = blood_group
    if gender is not None:
        donor.gender = gender
    if "available" in body:
        donor.available = bool(body["available"])

    location_changed = False
    if city is not None:
        donor.city = city
        location_changed = True
    if locality is not None:
        donor.locality = locality
        location_changed = True
    if "last_donation_date" in body and body["last_donation_date"] in ("", None):
        donor.last_donation_date = None
    elif last_donation_date is not None:
        donor.last_donation_date = last_donation_date

    # keep explicit coords if the client sent them, else derive from city
    lat, lng = query_body_coords(body)
    if lat is not None and lng is not None:
        donor.latitude, donor.longitude = lat, lng
    elif location_changed or donor.latitude is None:
        donor.latitude, donor.longitude = resolve_coords(donor.city, donor.locality)

    donor.recompute_profile_complete()
    db.session.commit()

    elig = compute_eligibility(donor)
    return ok({"donor": donor.to_dict(eligibility=elig, reveal_contact=True),
               "eligibility": elig})


def query_body_coords(body):
    try:
        return float(body["latitude"]), float(body["longitude"])
    except (KeyError, TypeError, ValueError):
        return None, None


@donors_bp.patch("/me/availability")
@token_required
def set_availability():
    donor = current_donor()
    body = json_body()
    if "available" not in body:
        raise ValidationError({"available": "Send { available: true | false }."})
    donor.available = bool(body["available"])
    db.session.commit()
    return ok({"available": donor.available})


@donors_bp.get("/me/stats")
@token_required
def my_stats():
    donor = current_donor()
    elig = compute_eligibility(donor)
    helped = (
        db.session.query(Match)
        .filter(Match.donor_id == donor.id, Match.response == "accepted")
        .count()
    )
    return ok({
        "eligibility": elig,
        "donations_completed": donor.verified_donation_count,
        "requests_helped": helped,
        "available": donor.available,
        "profile_complete": donor.profile_complete,
    })


@donors_bp.get("/me/donations")
@token_required
def my_donations():
    donor = current_donor()
    return ok({"donations": [d.to_dict() for d in donor.donations]})


@donors_bp.get("/me/requests")
@token_required
def my_request_feed():
    """Two lists: requests this donor was contacted for, and other open
    requests nearby that match their blood group (informational only)."""
    donor = current_donor()
    contacted = (
        Match.query.filter(Match.donor_id == donor.id)
        .filter(Match.response.in_(("pending", "accepted")))
        .all()
    )
    contacted_request_ids = {m.request_id for m in contacted}

    nearby = []
    if donor.blood_group and compute_eligibility(donor)["eligible"] and donor.available:
        open_requests = (
            BloodRequest.query.filter(BloodRequest.status == "searching")
            .filter(BloodRequest.requester_id != donor.user_id)
            .all()
        )
        for req in open_requests:
            if req.id in contacted_request_ids:
                continue
            if donor.blood_group not in compatible_donor_groups(req.blood_group):
                continue
            dist = haversine_km(
                req.latitude, req.longitude, donor.latitude, donor.longitude
            )
            nearby.append({**req.to_dict(),
                           "distance_km": None if dist == float("inf") else round(dist, 1)})
        nearby.sort(key=lambda r: (r["distance_km"] is None, r["distance_km"] or 0))

    return ok({
        "contacted": [m.to_dict_for_donor() for m in sorted(
            contacted, key=lambda m: m.contacted_at, reverse=True)],
        "nearby": nearby[:12],
    })


# --------------------------------------------------------------------------- #
# Search (privacy-first, eligibility always enforced)
# --------------------------------------------------------------------------- #
@donors_bp.get("/search")
@optional_auth
def search():
    from flask import request as flask_request

    args = flask_request.args
    v = Validator(dict(args))
    blood_group = v.blood_group("blood_group", required=False)
    match_mode = args.get("match", "exact")  # exact | compatible
    city = args.get("city", "").strip() or None
    available = query_bool("available", default=None)
    max_distance = query_float("max_distance")
    lat = query_float("lat")
    lng = query_float("lng")
    v.raise_if_errors()

    q = Donor.query.join(User, Donor.user_id == User.id)

    # Eligibility is NOT an optional filter - ineligible donors are always
    # excluded from search results. This is a core product guarantee.
    q = q.filter(eligible_filter())

    if blood_group:
        if match_mode == "compatible":
            groups = [g for g in compatible_donor_groups(blood_group)]
            q = q.filter(Donor.blood_group.in_(groups))
        else:
            q = q.filter(Donor.blood_group == blood_group)
    if city:
        q = q.filter(db.func.lower(Donor.city) == city.lower())
    if available is True:
        q = q.filter(Donor.available.is_(True))
    elif available is False:
        q = q.filter(Donor.available.is_(False))

    if (lat is None or lng is None) and city:
        lat, lng = resolve_coords(city)

    results = []
    for donor in q.all():
        elig = compute_eligibility(donor)
        dist = None
        if lat is not None and lng is not None:
            d = haversine_km(lat, lng, donor.latitude, donor.longitude)
            dist = None if d == float("inf") else d
            if max_distance is not None and (dist is None or dist > max_distance):
                continue
        results.append(donor.to_dict(eligibility=elig, distance_km=dist))

    results.sort(key=lambda r: (r.get("distance_km") is None, r.get("distance_km") or 0))
    return ok({"donors": results, "count": len(results),
               "eligibility_enforced": True})


# --------------------------------------------------------------------------- #
# Public / admin single donor
# --------------------------------------------------------------------------- #
@donors_bp.get("/<int:donor_id>")
@optional_auth
def get_donor(donor_id: int):
    donor = db.session.get(Donor, donor_id)
    if donor is None:
        raise NotFoundError("Donor not found.")
    elig = compute_eligibility(donor)
    is_admin = g.current_user is not None and g.current_user.role == "admin"
    is_self = g.current_user is not None and g.current_user.id == donor.user_id
    return ok({"donor": donor.to_dict(
        eligibility=elig, reveal_contact=is_admin or is_self)})


@donors_bp.get("")
@roles_required("admin")
def list_donors():
    page, per_page = pagination()
    q = Donor.query.join(User, Donor.user_id == User.id).order_by(Donor.id.desc())
    items, meta = paginate(q, page, per_page)
    return ok(
        {"donors": [d.to_dict(eligibility=compute_eligibility(d), reveal_contact=True)
                    for d in items]},
        meta=meta,
    )
