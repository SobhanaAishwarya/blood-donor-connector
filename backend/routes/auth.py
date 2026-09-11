"""Authentication: register, login, logout, current user."""
from __future__ import annotations

from flask import Blueprint, g

from backend.extensions import db
from backend.models import Donor, User
from backend.routes._helpers import json_body, serialize_me
from backend.services.geo import resolve_coords
from backend.utils.errors import AuthError, ConflictError
from backend.utils.responses import created, ok
from backend.utils.security import (
    create_token,
    hash_password,
    token_required,
    verify_password,
)
from backend.utils.validation import Validator

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

_SELF_SERVICE_ROLES = ("donor", "requester")


@auth_bp.post("/register")
def register():
    body = json_body()
    v = Validator(body)
    name = v.string("name", min_len=2, max_len=120)
    email = v.email("email")
    phone = v.phone("phone")
    password = v.password("password")
    role = v.choice("role", _SELF_SERVICE_ROLES, required=False, default="requester")

    donor_fields = {}
    if role == "donor":
        # Every donor field is optional at sign-up; the multi-step wizard can
        # fill them now or the dashboard can complete them later.
        donor_fields = {
            "blood_group": v.blood_group("blood_group", required=False),
            "gender": v.gender("gender", required=False),
            "city": v.string("city", required=False, max_len=120),
            "locality": v.string("locality", required=False, max_len=120),
            "last_donation_date": v.past_or_today_date(
                "last_donation_date", required=False
            ),
            "available": bool(body.get("available", True)),
        }
    v.raise_if_errors()

    if User.query.filter_by(email=email).first():
        raise ConflictError("An account with this email already exists.")

    user = User(
        name=name,
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role=role,
    )
    db.session.add(user)
    db.session.flush()

    if role == "donor":
        lat, lng = resolve_coords(
            donor_fields.get("city"), donor_fields.get("locality")
        )
        donor = Donor(
            user_id=user.id,
            blood_group=donor_fields.get("blood_group"),
            gender=donor_fields.get("gender"),
            city=donor_fields.get("city"),
            locality=donor_fields.get("locality"),
            latitude=lat,
            longitude=lng,
            available=donor_fields.get("available", True),
            last_donation_date=donor_fields.get("last_donation_date"),
        )
        donor.recompute_profile_complete()
        db.session.add(donor)

    db.session.commit()

    token = create_token(user)
    return created({"token": token, **serialize_me(user)})


@auth_bp.post("/login")
def login():
    body = json_body()
    v = Validator(body)
    email = v.email("email")
    v.string("password", min_len=1, max_len=200)
    v.raise_if_errors()

    user = User.query.filter_by(email=email).first()
    if user is None or not verify_password(body.get("password", ""), user.password_hash):
        raise AuthError("Incorrect email or password.")

    token = create_token(user)
    return ok({"token": token, **serialize_me(user)})


@auth_bp.post("/logout")
@token_required
def logout():
    # Stateless JWT: the client discards the token. Endpoint exists for symmetry
    # and so a future token-blocklist has a home.
    return ok({"message": "Signed out."})


@auth_bp.get("/me")
@token_required
def me():
    return ok(serialize_me(g.current_user))
