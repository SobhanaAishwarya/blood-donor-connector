"""Blood-group compatibility - rules live in config/blood_compatibility.json."""
from __future__ import annotations

from backend.config import Config

_RULES = Config.BLOOD_COMPATIBILITY
ALL_GROUPS = tuple(_RULES["groups"])
_RECEIVE_FROM = _RULES["recipient_can_receive_from"]

# Inverse map: which recipient groups can a donor of group X help?
_DONATE_TO = {g: [] for g in ALL_GROUPS}
for _recipient, _donors in _RECEIVE_FROM.items():
    for _d in _donors:
        _DONATE_TO[_d].append(_recipient)


def compatible_donor_groups(recipient_group: str) -> list[str]:
    """Donor blood groups whose RBCs are safe for `recipient_group`."""
    return list(_RECEIVE_FROM.get(recipient_group, []))


def can_donate_to(donor_group: str, recipient_group: str) -> bool:
    return donor_group in _RECEIVE_FROM.get(recipient_group, [])


def recipients_for_donor(donor_group: str) -> list[str]:
    return list(_DONATE_TO.get(donor_group, []))


def compatibility_matrix() -> dict:
    """Full matrix for the admin/reference UI."""
    return {
        "groups": list(ALL_GROUPS),
        "recipient_can_receive_from": _RECEIVE_FROM,
        "donor_can_give_to": _DONATE_TO,
    }
