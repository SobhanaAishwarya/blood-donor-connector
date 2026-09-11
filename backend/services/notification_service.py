"""Notification service.

For the college / demo build we persist notifications in the database instead
of wiring real SMS/e-mail. Swapping in Twilio / SES later means implementing
`_dispatch()` - nothing else changes.
"""
from __future__ import annotations

from backend.extensions import db
from backend.models.notification import Notification


def notify(user_id: int, *, title: str, message: str, type: str = "system",
           link: str | None = None, commit: bool = True) -> Notification:
    note = Notification(
        user_id=user_id, title=title, message=message, type=type, link=link
    )
    db.session.add(note)
    if commit:
        db.session.commit()
    _dispatch(note)
    return note


def notify_many(user_ids, **kwargs) -> list[Notification]:
    kwargs.setdefault("commit", False)
    notes = [notify(uid, **kwargs) for uid in user_ids]
    db.session.commit()
    return notes


def _dispatch(note: Notification) -> None:
    """Hook for a real transport. No-op in demo mode."""
    # e.g. sms_client.send(note.user.phone, note.message)
    return None


# --- ready-made messages ---------------------------------------------------
def request_broadcast(donor_user_id: int, request, distance_km: float):
    return dict(
        user_id=donor_user_id,
        title="New blood request nearby",
        message=(
            f"{request.blood_group} blood is needed "
            f"{distance_km:.1f} km away in {request.city}."
        ),
        type="request",
        link=f"/dashboard.html#request-{request.id}",
    )


def request_accepted(requester_user_id: int, request):
    return dict(
        user_id=requester_user_id,
        title="A donor accepted your request",
        message=(
            f"Good news - a donor has accepted your {request.blood_group} "
            f"request. Their contact details are now available."
        ),
        type="accept",
        link=f"/request.html?id={request.id}",
    )


def request_fulfilled(user_id: int, request):
    return dict(
        user_id=user_id,
        title="Request fulfilled",
        message=(
            f"The {request.blood_group} request in {request.city} has been "
            f"successfully fulfilled. Thank you."
        ),
        type="fulfilled",
        link=f"/request.html?id={request.id}",
    )


def eligibility_restored(user_id: int):
    return dict(
        user_id=user_id,
        title="You can donate again",
        message="Your waiting period is over - you're eligible to donate.",
        type="eligibility",
        link="/dashboard.html",
    )
