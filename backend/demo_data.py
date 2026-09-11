"""Demo dataset builders - pure data/DB logic, no app-factory import.

Kept separate from `seed.py` (the CLI entry point) so `backend/app.py` can
call `seed_if_empty()` at boot without a circular import. This is what makes
the app "work immediately after setup" on a fresh, empty database (e.g. a
freshly-provisioned host with an ephemeral disk).
"""
from __future__ import annotations

from datetime import date, timedelta

from backend.extensions import db
from backend.models import BloodRequest, Donation, Donor, Match, Notification, User
from backend.services import matching_service as matcher
from backend.services import notification_service as notif
from backend.utils.clock import utcnow
from backend.utils.security import hash_password

PASSWORD = "Passw0rd!"


def _today() -> date:
    return date.today()


# Visakhapatnam city centre - donors are scattered around it at real distances.
VZG = (17.6868, 83.2185)


def _at(dlat_km: float, dlng_km: float) -> tuple[float, float]:
    """Offset from the Vizag centre by a rough number of kilometres."""
    return (
        round(VZG[0] + dlat_km / 111.0, 6),
        round(VZG[1] + dlng_km / 105.8, 6),
    )


def _days_ago(n: int) -> date:
    return _today() - timedelta(days=n)


# --------------------------------------------------------------------------- #
# Donor blueprints
#   (name, local, gender, group, locality, (dlat_km, dlng_km),
#    last_donation_offset_days | None, available, history_count)
#
# Layout goal: a dense, mostly-eligible core within ~4 km of the centre so the
# critical O+ request fills Ring 1, plus a spread of donors further out and a
# few deliberately-ineligible / unavailable donors to exercise every state.
# --------------------------------------------------------------------------- #
DONORS = [
    # --- dense eligible core (<= ~4 km) --------------------------------------
    ("Aishwarya Menon",  "aishwarya", "female", "O+",  "MVP Colony",       (1.2, -0.8), 190, True, 2),
    ("Arjun Nair",       "arjun",     "male",   "O+",  "Siripuram",        (0.4, 0.5),  160, True, 1),
    ("Sneha Patil",      "sneha",     "female", "O+",  "Chinna Waltair",   (0.9, -0.3), 210, True, 2),
    ("Sasi Prakash",     "sasi",      "male",   "O+",  "Kancharapalem",    (-2.1, 0.2), 140, True, 0),
    ("Pooja Hegde",      "pooja",     "female", "O+",  "Resapuvanipalem",  (-1.8, -1.1),200, True, 1),
    ("Rahul Deshpande",  "rahul.d",   "male",   "A+",  "Seethammadhara",   (-1.6, 1.1), 150, True, 1),
    ("Karthik Iyer",     "karthik",   "male",   "A+",  "Lawsons Bay",      (1.4, 0.9),  180, True, 3),
    ("Ritu Verma",       "ritu",      "female", "A+",  "Marripalem",       (-3.1, -0.7),260, True, 2),
    ("Manoj Kumar",      "manoj",     "male",   "B+",  "NAD Junction",     (-3.6, -1.2),150, True, 1),
    ("Divya Krishnan",   "divya",     "female", "A-",  "Asilmetta",        (0.9, 0.2),  300, False, 3),
    ("Meghana Reddy",    "meghana",   "female", "O-",  "Dwaraka Nagar",    (0.6, 1.6),  40,  True, 1),
    ("Vikram Singh",     "vikram",    "male",   "O-",  "Jagadamba Centre", (-0.7, 0.3), 130, True, 2),
    ("Nandini Rao",      "nandini",   "female", "B-",  "Dabagardens",      (0.2, 0.9),  200, True, 1),
    # --- mid ring (~5-10 km) ---------------------------------------------------
    ("Sandeep Varma",    "sandeep",   "male",   "B+",  "Gajuwaka",         (-8.5, -3.0),120, True, 2),
    ("Priyanka Sahu",    "priyanka",  "female", "AB+", "Madhurawada",      (7.4, 2.3),  260, True, 1),
    ("Ganesh Babu",      "ganesh",    "male",   "O+",  "Simhachalam",      (-7.2, 1.2), 30,  True, 0),
    ("Rohit Chowdary",   "rohit",     "male",   "O-",  "Yendada",          (6.0, 2.7),  115, False, 2),
    ("Swathi Menon",     "swathi",    "female", "A+",  "Gopalapatnam",     (-6.4, -2.0),275, True, 2),
    ("Imran Sheikh",     "imran",     "male",   "A-",  "Old Gajuwaka",     (-9.4, -2.6),99,  True, 0),
    ("Harika Rao",       "harika",    "female", "O-",  "Kommadi",          (9.6, 2.9),  200, True, 3),
    ("Lakshmi Prasad",   "lakshmi",   "female", "AB+", "Isukathota",       (2.6, 1.7),  320, True, 1),
    # --- outer ring (10-20 km) ----------------------------------------------
    ("Bhavana Das",      "bhavana",   "female", "B+",  "Kurmannapalem",    (-12.4, -3.6),240, True, 1),
    ("Naveen Reddy",     "naveen",    "male",   "AB+", "Pedagantyada",     (-13.0, -4.2),140, True, 2),
    ("Anjali Gupta",     "anjali",    "female", "O+",  "Bheemili Road",    (12.5, 4.2), 150, True, 1),
    ("Faisal Khan",      "faisal",    "male",   "AB-", "Pendurthi",        (-14.0, 1.8),130, True, 0),
    ("Deepak Malhotra",  "deepak",    "male",   "O-",  "Anandapuram",      (14.5, 3.6), 92,  True, 2),
    # --- other cities ------------------------------------------------------
    ("Sarita Joshi",     "sarita",    "female", "O+",  "Benz Circle",      (0, 0),      210, True, 3),
    ("Ravi Teja",        "raviteja",  "male",   "A+",  "Gachibowli",       (0, 0),      130, True, 1),
]

CITY_OVERRIDE = {
    "sarita": ("Vijayawada", (16.5062, 80.6480)),
    "raviteja": ("Hyderabad", (17.3850, 78.4867)),
}


def build_users_and_donors() -> dict[str, User]:
    users: dict[str, User] = {}

    admin = User(name="Site Admin", email="admin@blooddonor.test",
                 phone="9000000001", password_hash=hash_password(PASSWORD),
                 role="admin")
    db.session.add(admin)
    users["admin"] = admin

    for local, name, phone in [
        ("requester", "Priya Nair", "9000000010"),
        ("kiran", "Kiran Rao", "9000000011"),
    ]:
        u = User(name=name, email=f"{local}@blooddonor.test", phone=phone,
                 password_hash=hash_password(PASSWORD), role="requester")
        db.session.add(u)
        users[local] = u

    for i, row in enumerate(DONORS, start=1):
        name, local, gender, group, locality, (dla, dln), last_off, avail, hist = row
        u = User(name=name, email=f"{local}@blooddonor.test",
                 phone=f"90000{100 + i:04d}", password_hash=hash_password(PASSWORD),
                 role="donor")
        db.session.add(u)
        db.session.flush()

        if local in CITY_OVERRIDE:
            city, (lat, lng) = CITY_OVERRIDE[local]
        else:
            city = "Visakhapatnam"
            lat, lng = _at(dla, dln)

        donor = Donor(
            user_id=u.id,
            blood_group=group,
            gender=gender,
            city=city,
            locality=locality,
            latitude=lat,
            longitude=lng,
            available=avail,
            last_donation_date=_days_ago(last_off) if last_off is not None else None,
            verified_donation_count=hist,
        )
        donor.recompute_profile_complete()
        db.session.add(donor)
        users[local] = u
        users["_donor_" + local] = donor

    db.session.commit()
    return users


def build_history(users: dict[str, User]) -> None:
    """Back-fill a few verified donations so donor timelines aren't empty."""
    admin = users["admin"]
    plan = {
        "aishwarya": [("O+", "KGH", 210), ("O+", "Red Cross Camp", 470)],
        "rahul.d":   [("A+", "Apollo Hospitals", 165)],
        "karthik":   [("A+", "Seven Hills Hospital", 190), ("A+", "NTR Camp", 380),
                      ("A+", "KGH", 620)],
        "harika":    [("O-", "Care Hospitals", 210), ("O-", "Red Cross Camp", 430),
                      ("O-", "KGH", 700)],
        "sneha":     [("O+", "VIMS", 220), ("O+", "Lions Blood Bank", 460)],
    }
    for local, rows in plan.items():
        donor = users["_donor_" + local]
        for group, hosp, days in rows:
            d = Donation(donor_id=donor.id, request_id=None,
                         confirmed_by=admin.id, donation_date=_days_ago(days),
                         verified=True)
            db.session.add(d)
    db.session.commit()


def _expand_until_pending(req: BloodRequest, max_tries: int = 4):
    """Push the request outward ring by ring until at least one donor is
    contacted, so scripted 'accept' scenarios are reliable."""
    for _ in range(max_tries):
        if any(m.response == "pending" for m in req.matches):
            return next(m for m in req.matches if m.response == "pending")
        matcher.simulate_timeout(req)
        matcher.maybe_advance(req)
    return next((m for m in req.matches if m.response == "pending"), None)


def build_requests(users: dict[str, User]) -> None:
    priya = users["requester"]
    kiran = users["kiran"]

    # 1) CRITICAL - just created, Ring 1 actively searching (fills with 5)
    r_crit = BloodRequest(
        requester_id=priya.id, blood_group="O+", units=2,
        hospital="KGH (King George Hospital)", city="Visakhapatnam",
        location="Maharani Peta", latitude=_at(0.2, 0.1)[0],
        longitude=_at(0.2, 0.1)[1], urgency="critical", status="searching",
        additional_message="Patient in ICU after a road accident. Please help urgently.",
        required_by=utcnow() + timedelta(hours=3),
    )
    db.session.add(r_crit)
    db.session.flush()
    matcher.start_matching(r_crit)

    # 2) URGENT - already expanded to Ring 2 (no one accepted in Ring 1)
    r_urgent = BloodRequest(
        requester_id=kiran.id, blood_group="A+", units=1,
        hospital="Apollo Hospitals, Arilova", city="Visakhapatnam",
        location="Arilova", latitude=_at(3.0, 2.2)[0], longitude=_at(3.0, 2.2)[1],
        urgency="urgent", status="searching",
        additional_message="Scheduled surgery tomorrow morning.",
        created_at=utcnow() - timedelta(minutes=40),
    )
    db.session.add(r_urgent)
    db.session.flush()
    matcher.start_matching(r_urgent)
    matcher.simulate_timeout(r_urgent)
    matcher.maybe_advance(r_urgent)

    # 3) NORMAL - searching, low pressure
    r_normal = BloodRequest(
        requester_id=priya.id, blood_group="B+", units=1,
        hospital="Seven Hills Hospital, Rockdale", city="Visakhapatnam",
        location="Rockdale Layout", latitude=_at(1.1, 0.6)[0],
        longitude=_at(1.1, 0.6)[1], urgency="normal", status="searching",
        additional_message="Thalassemia patient - monthly transfusion.",
        created_at=utcnow() - timedelta(hours=2),
    )
    db.session.add(r_normal)
    db.session.flush()
    matcher.start_matching(r_normal)

    # 4) MATCHED - a donor has accepted, requester yet to confirm
    r_matched = BloodRequest(
        requester_id=kiran.id, blood_group="O-", units=1,
        hospital="Care Hospitals, Ram Nagar", city="Visakhapatnam",
        location="Ram Nagar", latitude=_at(0.2, 0.3)[0], longitude=_at(0.2, 0.3)[1],
        urgency="urgent", status="searching",
        created_at=utcnow() - timedelta(minutes=18),
    )
    db.session.add(r_matched)
    db.session.flush()
    matcher.start_matching(r_matched)
    pending = _expand_until_pending(r_matched)
    if pending:
        matcher.accept_match(pending)

    # 5) FULFILLED - full loop completed, feeds donor history + impact stats
    r_done = BloodRequest(
        requester_id=priya.id, blood_group="A+", units=1,
        hospital="Visakha Institute of Medical Sciences", city="Visakhapatnam",
        location="Hanumanthawaka", latitude=_at(2.0, 1.0)[0],
        longitude=_at(2.0, 1.0)[1], urgency="urgent", status="searching",
        created_at=utcnow() - timedelta(days=6),
    )
    db.session.add(r_done)
    db.session.flush()
    matcher.start_matching(r_done)
    acc = _expand_until_pending(r_done)
    if acc:
        matcher.accept_match(acc)
        donor = db.session.get(Donor, acc.donor_id)
        donation = Donation(donor_id=donor.id, request_id=r_done.id,
                            confirmed_by=priya.id,
                            donation_date=_days_ago(5), verified=True)
        db.session.add(donation)
        donor.last_donation_date = _days_ago(5)
        donor.verified_donation_count += 1
        r_done.status = "fulfilled"
        for m in r_done.matches:
            if m.response == "pending":
                m.response = "expired"

    # 6) Cross-city request with a thin donor pool (shows ring expansion)
    r_city = BloodRequest(
        requester_id=kiran.id, blood_group="AB-", units=2,
        hospital="Government General Hospital, Vijayawada", city="Vijayawada",
        location="Governorpet", latitude=16.5100, longitude=80.6300,
        urgency="urgent", status="searching",
        created_at=utcnow() - timedelta(minutes=8),
    )
    db.session.add(r_city)
    db.session.flush()
    matcher.start_matching(r_city)

    db.session.commit()


def build_notifications(users: dict[str, User]) -> None:
    aishwarya = users["aishwarya"]
    priya = users["requester"]

    notif.notify(aishwarya.id, title="You can donate again",
                 message="Your waiting period is over - you're eligible to donate.",
                 type="eligibility", link="/dashboard.html", commit=False)
    notif.notify(priya.id, title="Welcome to Blood Donor Connector",
                 message="Create a request and we'll reach the nearest eligible "
                         "donors first - privacy protected.",
                 type="system", link="/request.html", commit=False)
    db.session.commit()


def build_flagship_persona() -> None:
    """Abhi - a two-year veteran of the platform.

    Unlike the rest of the seed data (fabricated to exercise every UI state),
    Abhi tells one continuous, coherent story: a long-time donor with a real
    donation history AND, once, a time he needed blood himself and the
    platform found him a donor too. Built for demoing to people who want to
    see what an established account looks like, not a fresh signup.
    """
    abhi_user = User(
        name="Abhi Reddy", email="abhi@gmail.com", phone="9000009999",
        password_hash=hash_password(PASSWORD), role="donor",
        created_at=utcnow() - timedelta(days=760),
    )
    db.session.add(abhi_user)
    db.session.flush()

    lat, lng = _at(0.3, -0.3)
    abhi_donor = Donor(
        user_id=abhi_user.id, blood_group="O+", gender="male",
        city="Visakhapatnam", locality="Siripuram",
        latitude=lat, longitude=lng, available=True,
        last_donation_date=_days_ago(150),  # eligible again, not mid-rest
        verified_donation_count=0,          # incremented below as real rows are added
    )
    abhi_donor.recompute_profile_complete()
    db.session.add(abhi_donor)
    db.session.commit()

    # ---- six real, verified donations spread across ~2 years ----
    donation_plan = [
        (680, "KGH (King George Hospital)", "O+"),
        (520, "Apollo Hospitals, Health City", "A+"),
        (400, "Seven Hills Hospital, Rockdale", "B+"),
        (300, "Care Hospitals, Ram Nagar", "O+"),
        (210, "Visakha Institute of Medical Sciences", "AB+"),
        (150, "Queens NRI Hospital", "A+"),
    ]
    for i, (days_ago, hospital, group) in enumerate(donation_plan):
        patient = User(
            name=f"Patient {i + 1}", email=f"history.patient{i + 1}@blooddonor.test",
            phone=f"90000{8100 + i}", password_hash=hash_password(PASSWORD),
            role="requester", created_at=utcnow() - timedelta(days=days_ago + 3),
        )
        db.session.add(patient)
        db.session.flush()

        req = BloodRequest(
            requester_id=patient.id, blood_group=group, units=1,
            hospital=hospital, city="Visakhapatnam",
            latitude=lat, longitude=lng, urgency="urgent", status="fulfilled",
            created_at=utcnow() - timedelta(days=days_ago + 3),
        )
        db.session.add(req)
        db.session.flush()

        db.session.add(Match(
            request_id=req.id, donor_id=abhi_donor.id, ring=1,
            distance=round(1.0 + i * 0.4, 1),
            contacted_at=utcnow() - timedelta(days=days_ago + 3),
            response="accepted", accepted_at=utcnow() - timedelta(days=days_ago + 2),
        ))
        db.session.add(Donation(
            donor_id=abhi_donor.id, request_id=req.id, confirmed_by=patient.id,
            donation_date=_days_ago(days_ago), verified=True,
            created_at=utcnow() - timedelta(days=days_ago),
        ))
        abhi_donor.verified_donation_count += 1

    # ---- the one time Abhi needed blood himself, about eight months ago ----
    helper_user = User(
        name="Ravi Kumar", email="ravi.kumar@blooddonor.test", phone="9000008999",
        password_hash=hash_password(PASSWORD), role="donor",
        created_at=utcnow() - timedelta(days=400),
    )
    db.session.add(helper_user)
    db.session.flush()
    h_lat, h_lng = _at(1.6, 1.1)
    helper_donor = Donor(
        user_id=helper_user.id, blood_group="O+", gender="male",
        city="Visakhapatnam", locality="Dwaraka Nagar",
        latitude=h_lat, longitude=h_lng, available=True,
        last_donation_date=_days_ago(240), verified_donation_count=1,
    )
    helper_donor.recompute_profile_complete()
    db.session.add(helper_donor)
    db.session.flush()

    abhi_request = BloodRequest(
        requester_id=abhi_user.id, blood_group="O+", units=1,
        hospital="Care Hospitals, Ram Nagar", city="Visakhapatnam",
        location="Ram Nagar", latitude=lat, longitude=lng,
        urgency="urgent", status="fulfilled",
        additional_message="Needed ahead of a minor surgery.",
        created_at=utcnow() - timedelta(days=245),
    )
    db.session.add(abhi_request)
    db.session.flush()

    db.session.add(Match(
        request_id=abhi_request.id, donor_id=helper_donor.id, ring=1, distance=1.8,
        contacted_at=utcnow() - timedelta(days=245),
        response="accepted", accepted_at=utcnow() - timedelta(days=244, hours=20),
    ))
    db.session.add(Donation(
        donor_id=helper_donor.id, request_id=abhi_request.id, confirmed_by=abhi_user.id,
        donation_date=_days_ago(243), verified=True,
        created_at=utcnow() - timedelta(days=243),
    ))
    db.session.commit()

    notif.notify(abhi_user.id, title="You can donate again",
                 message="Your waiting period is over - you're eligible to donate.",
                 type="eligibility", link="/dashboard.html", commit=False)
    notif.notify(abhi_user.id, title="Thank you for your 6th donation",
                 message="Your generosity has now helped 6 people. You're a "
                         "verified, trusted donor on Blood Donor Connector.",
                 type="fulfilled", link="/dashboard.html", commit=False)
    db.session.commit()


def populate(*, reset: bool = False) -> dict:
    """Build the full demo dataset. Must be called inside an app context.

    `reset=True` drops and recreates every table first (used by the CLI).
    `reset=False` assumes an already-empty schema (used by boot-time
    auto-seeding) and leaves any existing tables/rows alone.
    """
    if reset:
        db.drop_all()
    db.create_all()

    users = build_users_and_donors()
    build_history(users)
    build_flagship_persona()
    build_requests(users)
    build_notifications(users)

    return {
        "donors": Donor.query.count(),
        "requests": BloodRequest.query.count(),
        "matches": Match.query.count(),
        "donations": Donation.query.count(),
    }


def seed_if_empty() -> bool:
    """Boot-time hook: seed the demo dataset only if the database is empty.

    Safe to call on every app start - a host with an ephemeral disk (most
    free tiers) always comes back up with a working demo; a host with a
    persistent disk / real Postgres with real users is left untouched.
    """
    if User.query.count() > 0:
        return False
    populate(reset=False)
    return True
