"""Ring-based fan-out matching - the core of Blood Donor Connector.

Matching priority (in order):
    1. Blood-group compatibility
    2. Donor eligibility (computed, never bypassable)
    3. Donor availability
    4. Distance (nearest first)
    5. Response status (skip donors already committed elsewhere)

The system never contacts everyone at once. It fills one distance ring with up
to MAX_DONORS_PER_RING of the nearest eligible donors, waits
RING_TIMEOUT_MINUTES for someone to accept, then expands to the next ring.
"""
from __future__ import annotations

from datetime import timedelta

from backend.config import Config
from backend.extensions import db
from backend.models import BloodRequest, Donor, Match, User
from backend.services import notification_service as notif
from backend.services.compatibility import compatible_donor_groups
from backend.services.eligibility_service import eligible_filter
from backend.services.geo import haversine_km, radius_for_ring
from backend.utils.clock import utcnow

MAX_RING = max(b["ring"] for b in Config.RINGS)


# --------------------------------------------------------------------------- #
# Candidate selection
# --------------------------------------------------------------------------- #
def _committed_donor_ids() -> set[int]:
    """Donors who have accepted a match on a still-active request."""
    rows = (
        db.session.query(Match.donor_id)
        .join(BloodRequest, Match.request_id == BloodRequest.id)
        .filter(Match.response == "accepted")
        .filter(BloodRequest.status.in_(("searching", "matched")))
        .all()
    )
    return {r[0] for r in rows}


def candidate_donors(request: BloodRequest, max_radius_km: float,
                     exclude_donor_ids: set[int] | None = None) -> list[tuple[Donor, float]]:
    """Eligible + available + compatible donors within `max_radius_km`,
    nearest first. Pure read - creates nothing."""
    exclude = set(exclude_donor_ids or set())
    exclude |= _committed_donor_ids()

    groups = compatible_donor_groups(request.blood_group)
    if not groups:
        return []

    q = (
        Donor.query.join(User, Donor.user_id == User.id)
        .filter(Donor.blood_group.in_(groups))
        .filter(Donor.available.is_(True))
        .filter(Donor.user_id != request.requester_id)
        .filter(eligible_filter())
    )
    if exclude:
        q = q.filter(Donor.id.notin_(exclude))

    scored: list[tuple[Donor, float]] = []
    for donor in q.all():
        dist = haversine_km(
            request.latitude, request.longitude, donor.latitude, donor.longitude
        )
        if dist <= max_radius_km:
            scored.append((donor, dist))
    scored.sort(key=lambda pair: pair[1])
    return scored


# --------------------------------------------------------------------------- #
# Ring execution
# --------------------------------------------------------------------------- #
def run_ring(request: BloodRequest, ring: int | None = None, *,
             commit: bool = True) -> list[Match]:
    """Contact the nearest still-uncontacted eligible donors for `ring`.

    Idempotent per ring: tops the ring up to MAX_DONORS_PER_RING, never more.
    """
    ring = ring or request.current_ring
    ring = max(1, min(ring, MAX_RING))

    already = {m.donor_id for m in request.matches}
    contacted_in_ring = sum(1 for m in request.matches if m.ring == ring)
    slots = Config.MAX_DONORS_PER_RING - contacted_in_ring
    if slots <= 0:
        return []

    radius = radius_for_ring(ring)
    picks = candidate_donors(request, radius, exclude_donor_ids=already)[:slots]

    created: list[Match] = []
    for donor, dist in picks:
        match = Match(
            request_id=request.id,
            donor_id=donor.id,
            ring=ring,
            distance=round(dist, 2),
            contacted_at=utcnow(),
            response="pending",
        )
        db.session.add(match)
        created.append(match)
        payload = notif.request_broadcast(donor.user_id, request, dist)
        notif.notify(commit=False, **payload)

    if created and commit:
        db.session.commit()
    return created


def start_matching(request: BloodRequest) -> list[Match]:
    """Kick off Ring 1 immediately after a request is created."""
    request.current_ring = 1
    request.ring_started_at = utcnow()
    return run_ring(request, 1)


def maybe_advance(request: BloodRequest) -> dict:
    """Called on every read of an active request.

    Expands to the next ring when the current ring has timed out (or produced
    no one to contact) and nobody has accepted yet.
    """
    result = {"advanced": False, "from_ring": request.current_ring,
              "to_ring": request.current_ring, "new_matches": 0}

    if request.status != "searching":
        return result

    if any(m.response == "accepted" for m in request.matches):
        return result

    timeout = timedelta(minutes=Config.RING_TIMEOUT_MINUTES)
    elapsed = utcnow() - request.ring_started_at
    pending_in_ring = [
        m for m in request.matches
        if m.ring == request.current_ring and m.response == "pending"
    ]

    timed_out = elapsed >= timeout
    nobody_to_wait_for = not pending_in_ring

    if not (timed_out or nobody_to_wait_for):
        return result

    # try to top up the current ring first (donors may have become eligible)
    topped = run_ring(request, request.current_ring)
    if topped and not timed_out:
        result["new_matches"] = len(topped)
        return result

    if request.current_ring >= MAX_RING:
        return result

    # expire the stale pending contacts, then expand outward
    for m in pending_in_ring:
        m.response = "expired"

    request.current_ring += 1
    request.ring_started_at = utcnow()
    new_matches = run_ring(request, request.current_ring, commit=False)

    db.session.commit()
    result.update(
        advanced=True,
        to_ring=request.current_ring,
        new_matches=len(new_matches),
    )
    return result


def simulate_timeout(request: BloodRequest) -> None:
    """Demo helper: pretend RING_TIMEOUT_MINUTES have already passed."""
    request.ring_started_at = utcnow() - timedelta(
        minutes=Config.RING_TIMEOUT_MINUTES + 1
    )
    db.session.commit()


# --------------------------------------------------------------------------- #
# Responses
# --------------------------------------------------------------------------- #
def accept_match(match: Match) -> Match:
    """Donor accepts. Reveal contact, freeze the request, stand down others."""
    match.response = "accepted"
    match.accepted_at = utcnow()

    request = match.request
    request.status = "matched"

    for other in request.matches:
        if other.id != match.id and other.response == "pending":
            other.response = "expired"

    payload = notif.request_accepted(request.requester_id, request)
    notif.notify(commit=False, **payload)
    db.session.commit()
    return match


def decline_match(match: Match) -> Match:
    match.response = "declined"
    db.session.commit()
    # a decline may free up a ring slot - try to backfill
    if match.request.status == "searching":
        run_ring(match.request, match.request.current_ring)
    return match


# --------------------------------------------------------------------------- #
# UI state
# --------------------------------------------------------------------------- #
def ring_state(request: BloodRequest) -> dict:
    timeout = timedelta(minutes=Config.RING_TIMEOUT_MINUTES)
    elapsed = utcnow() - request.ring_started_at
    time_left = max(0, int((timeout - elapsed).total_seconds()))
    accepted = any(m.response == "accepted" for m in request.matches)

    rings = []
    for band in Config.RINGS:
        r = band["ring"]
        contacts = [m for m in request.matches if m.ring == r]
        if request.status == "fulfilled":
            state = "complete" if contacts else "inactive"
        elif accepted:
            state = "responded" if any(
                m.response == "accepted" for m in contacts
            ) else ("passed" if contacts else "inactive")
        elif r < request.current_ring:
            state = "passed"
        elif r == request.current_ring:
            state = "searching"
        else:
            state = "inactive"
        rings.append({
            "ring": r,
            "label": band["label"],
            "min_km": band["min_km"],
            "max_km": band["max_km"],
            "state": state,
            "contacted": len(contacts),
            "accepted": sum(1 for m in contacts if m.response == "accepted"),
        })

    return {
        "current_ring": request.current_ring,
        "max_ring": MAX_RING,
        "time_left_seconds": time_left,
        "ring_timeout_minutes": Config.RING_TIMEOUT_MINUTES,
        "accepted": accepted,
        "total_contacted": len(request.matches),
        "rings": rings,
    }
