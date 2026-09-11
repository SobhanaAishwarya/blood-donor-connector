"""Match responses - the reveal-on-accept privacy workflow lives here."""
from __future__ import annotations

from flask import Blueprint, g

from backend.models import Match
from backend.services import matching_service as matcher
from backend.utils.errors import ConflictError, ForbiddenError, NotFoundError
from backend.utils.responses import ok
from backend.utils.security import token_required
from backend.extensions import db

matches_bp = Blueprint("matches", __name__, url_prefix="/api/matches")


def _load_owned_match(match_id: int) -> Match:
    match = db.session.get(Match, match_id)
    if match is None:
        raise NotFoundError("Match not found.")
    donor = g.current_user.donor
    if donor is None or match.donor_id != donor.id:
        raise ForbiddenError("This request was not sent to you.")
    return match


@matches_bp.get("/<int:match_id>")
@token_required
def get_match(match_id: int):
    match = db.session.get(Match, match_id)
    if match is None:
        raise NotFoundError("Match not found.")
    user = g.current_user
    if user.role == "admin":
        return ok({"match": match.to_dict_for_requester()})
    if user.donor and match.donor_id == user.donor.id:
        return ok({"match": match.to_dict_for_donor()})
    if user.id == match.request.requester_id:
        return ok({"match": match.to_dict_for_requester()})
    raise ForbiddenError("You do not have access to this match.")


@matches_bp.post("/<int:match_id>/accept")
@token_required
def accept(match_id: int):
    match = _load_owned_match(match_id)
    if match.response == "accepted":
        return ok({"match": match.to_dict_for_donor(), "already": True})
    if match.response != "pending":
        raise ConflictError("This request is no longer awaiting your response.")
    if match.request.status not in ("searching", "matched"):
        raise ConflictError("This request is already closed.")

    matcher.accept_match(match)
    return ok({
        "match": match.to_dict_for_donor(),
        "message": "Your response has been sent.",
    })


@matches_bp.post("/<int:match_id>/decline")
@token_required
def decline(match_id: int):
    match = _load_owned_match(match_id)
    if match.response not in ("pending",):
        raise ConflictError("You have already responded to this request.")
    matcher.decline_match(match)
    return ok({"match": match.to_dict_for_donor()})
