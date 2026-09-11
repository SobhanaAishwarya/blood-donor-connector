"""Donor eligibility engine.

Single source of truth for "can this donor give blood today?". Eligibility is
*computed*, never stored, so it is always current. The rest of the app must go
through here - there is deliberately no way for a user to override it.

Project rule:
    men   -> 90 days between donations
    women -> 120 days between donations
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import or_

from backend.config import Config
from backend.models.donor import Donor

_INTERVALS = Config.DONATION_INTERVAL_DAYS
_DEFAULT_INTERVAL = 90


def interval_for(gender: str | None) -> int:
    return _INTERVALS.get((gender or "").lower(), _DEFAULT_INTERVAL)


def compute(donor: Donor, today: date | None = None) -> dict:
    today = today or date.today()
    interval = interval_for(donor.gender)
    last = donor.last_donation_date

    if last is None:
        return {
            "eligible": True,
            "status": "eligible",
            "interval_days": interval,
            "days_since": None,
            "days_remaining": 0,
            "last_donation_date": None,
            "next_eligible_date": today.isoformat(),
            "progress": 1.0,
            "headline": "Eligible to donate",
            "message": "No donation on record yet - you're good to go.",
        }

    days_since = (today - last).days
    days_remaining = max(0, interval - days_since)
    eligible = days_since >= interval
    next_date = last + timedelta(days=interval)
    progress = 1.0 if interval == 0 else min(1.0, max(0.0, days_since / interval))

    if eligible:
        message = f"Your last donation was {days_since} days ago."
        headline = "Eligible to donate"
        status = "eligible"
    else:
        plural = "day" if days_remaining == 1 else "days"
        message = f"Please wait {days_remaining} more {plural}."
        headline = "Not eligible yet"
        status = "not_eligible"

    return {
        "eligible": eligible,
        "status": status,
        "interval_days": interval,
        "days_since": days_since,
        "days_remaining": days_remaining,
        "last_donation_date": last.isoformat(),
        "next_eligible_date": next_date.isoformat(),
        "progress": round(progress, 3),
        "headline": headline,
        "message": message,
    }


def is_eligible(donor: Donor, today: date | None = None) -> bool:
    return compute(donor, today)["eligible"]


def eligible_filter(today: date | None = None):
    """A SQLAlchemy expression: donors who are eligible *today*.

    Eligible when there is no recorded donation, or the recorded donation is
    older than the gender-specific interval.
    """
    today = today or date.today()
    clauses = [Donor.last_donation_date.is_(None)]
    for gender, interval in _INTERVALS.items():
        cutoff = today - timedelta(days=interval)
        clauses.append(
            (Donor.gender == gender) & (Donor.last_donation_date <= cutoff)
        )
    # donors with an unknown gender fall back to the default interval
    cutoff_default = today - timedelta(days=_DEFAULT_INTERVAL)
    clauses.append(
        Donor.gender.notin_(tuple(_INTERVALS.keys()))
        & (Donor.last_donation_date <= cutoff_default)
    )
    return or_(*clauses)
