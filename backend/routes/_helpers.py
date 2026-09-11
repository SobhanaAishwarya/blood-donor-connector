"""Small shared helpers for route modules."""
from __future__ import annotations

from flask import g, request

from backend.models import Donor
from backend.services.eligibility_service import compute as compute_eligibility
from backend.utils.errors import ForbiddenError, NotFoundError


def json_body() -> dict:
    return request.get_json(silent=True) or {}


def pagination():
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    except (TypeError, ValueError):
        per_page = 20
    return page, per_page


def paginate(query, page: int, per_page: int):
    total = query.count()
    items = query.limit(per_page).offset((page - 1) * per_page).all()
    return items, {
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": (total + per_page - 1) // per_page,
    }


def current_donor(create_if_missing: bool = False) -> Donor:
    user = g.current_user
    donor = user.donor
    if donor is None:
        if not create_if_missing:
            raise NotFoundError("No donor profile on this account.")
        donor = Donor(user_id=user.id)
        from backend.extensions import db

        db.session.add(donor)
        db.session.flush()
    return donor


def serialize_me(user):
    data = {"user": user.to_dict()}
    if user.donor is not None:
        donor = user.donor
        elig = compute_eligibility(donor)
        data["donor"] = donor.to_dict(eligibility=elig, reveal_contact=True)
        data["eligibility"] = elig
    return data


def require_owner_or_admin(owner_id: int):
    if g.current_user.role != "admin" and g.current_user.id != owner_id:
        raise ForbiddenError("You can only access your own resources.")


def query_float(name):
    raw = request.args.get(name)
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def query_bool(name, default=None):
    raw = request.args.get(name)
    if raw is None:
        return default
    return str(raw).lower() in ("1", "true", "yes", "on")
