"""CLI entry point: reset the database and seed the demo dataset.

    python -m backend.seed          # from the project root
    python backend/seed.py

Everything the demo needs works offline - no external APIs, no paid keys.
Demo credentials are printed at the end (all share one password).

(The actual data-building logic lives in `backend/demo_data.py` so it can
also be called safely at app boot - see `demo_data.seed_if_empty()`.)
"""
from __future__ import annotations

import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from backend.app import create_app  # noqa: E402
from backend.demo_data import PASSWORD, populate  # noqa: E402


def run() -> None:
    app = create_app(auto_seed=False)
    with app.app_context():
        print("Resetting database ...")
        counts = populate(reset=True)
        print(f"Seeded: {counts['donors']} donors, {counts['requests']} requests, "
              f"{counts['matches']} match rows, {counts['donations']} donations.\n")

        print("=" * 64)
        print("DEMO CREDENTIALS  (one password for every account)")
        print(f"    password: {PASSWORD}")
        print("-" * 64)
        print("  Admin      admin@blooddonor.test")
        print("  Requester  requester@blooddonor.test   (Priya Nair)")
        print("  Requester  kiran@blooddonor.test       (Kiran Rao)")
        print("  Donor      aishwarya@blooddonor.test   O+  eligible, available")
        print("  Donor      rahul.d@blooddonor.test     A+  eligible, available")
        print("  Donor      meghana@blooddonor.test     O-  resting (ineligible)")
        print("  Donor      divya@blooddonor.test       A-  unavailable")
        print("  ... plus ~24 more donors - local-part of the email matches the name")
        print("=" * 64)


if __name__ == "__main__":
    run()
