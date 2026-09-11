"""Geo helpers - distance maths and a no-API-key coordinate resolver.

For the demo we don't call a geocoding API. When only a city/locality is
known we anchor to the city centre (from config) and add a small, *stable*
pseudo-random offset derived from the locality string, so the same address
always lands on the same spot on the visual map.
"""
from __future__ import annotations

import hashlib
import math

from backend.config import Config

_EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    """Great-circle distance between two lat/lng points, in kilometres."""
    if None in (lat1, lng1, lat2, lng2):
        return float("inf")
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _stable_offset(seed: str, spread_km: float = 9.0) -> tuple[float, float]:
    """Deterministic (dlat, dlng) offset in degrees for a given seed string."""
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    # two independent [0,1) fractions
    fx = int.from_bytes(digest[0:4], "big") / 0xFFFFFFFF
    fy = int.from_bytes(digest[4:8], "big") / 0xFFFFFFFF
    # convert km spread to degrees (~111 km per degree lat)
    deg = spread_km / 111.0
    return (fx - 0.5) * 2 * deg, (fy - 0.5) * 2 * deg


def resolve_coords(city: str | None, locality: str | None = None,
                   spread_km: float = 4.0) -> tuple[float | None, float | None]:
    """Best-effort coordinates for a city (+ optional locality)."""
    if not city:
        return None, None
    centre = Config.CITY_COORDS.get(city.strip())
    if centre is None:
        # case-insensitive fallback
        for name, coords in Config.CITY_COORDS.items():
            if name.lower() == city.strip().lower():
                centre = coords
                break
    if centre is None:
        return None, None
    seed = f"{city.strip().lower()}::{(locality or '').strip().lower()}"
    dlat, dlng = _stable_offset(seed, spread_km)
    return round(centre["lat"] + dlat, 6), round(centre["lng"] + dlng, 6)


def ring_for_distance(distance_km: float) -> int | None:
    for band in Config.RINGS:
        if band["min_km"] <= distance_km < band["max_km"]:
            return band["ring"]
    return None


def radius_for_ring(ring: int) -> float:
    for band in Config.RINGS:
        if band["ring"] == ring:
            return band["max_km"]
    return Config.RINGS[-1]["max_km"]
