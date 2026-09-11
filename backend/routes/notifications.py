"""In-app notification centre."""
from __future__ import annotations

from flask import Blueprint, g

from backend.extensions import db
from backend.models import Notification
from backend.routes._helpers import paginate, pagination, query_bool
from backend.utils.errors import NotFoundError
from backend.utils.responses import ok
from backend.utils.security import token_required

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@notifications_bp.get("")
@token_required
def list_notifications():
    page, per_page = pagination()
    q = Notification.query.filter_by(user_id=g.current_user.id)
    if query_bool("unread"):
        q = q.filter_by(is_read=False)
    q = q.order_by(Notification.created_at.desc())
    items, meta = paginate(q, page, per_page)
    unread = Notification.query.filter_by(
        user_id=g.current_user.id, is_read=False
    ).count()
    meta["unread_count"] = unread
    return ok({"notifications": [n.to_dict() for n in items]}, meta=meta)


@notifications_bp.patch("/<int:note_id>/read")
@token_required
def mark_read(note_id: int):
    note = db.session.get(Notification, note_id)
    if note is None or note.user_id != g.current_user.id:
        raise NotFoundError("Notification not found.")
    note.is_read = True
    db.session.commit()
    return ok({"notification": note.to_dict()})


@notifications_bp.post("/read-all")
@token_required
def mark_all_read():
    Notification.query.filter_by(user_id=g.current_user.id, is_read=False).update(
        {"is_read": True}
    )
    db.session.commit()
    return ok({"message": "All caught up."})
