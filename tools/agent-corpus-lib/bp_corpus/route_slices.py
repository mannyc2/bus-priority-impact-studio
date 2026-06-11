"""Per-route source slices under ``data/raw/route-slices/<route>-<month>/``.

Each route-month directory holds five captures — segment speeds, hourly
ridership, the schedule, and the route/stop network rows — all sharing the
``{...rows}`` envelope. These are the most direct per-route evidence the
findings agent reasons over (segment speeds especially).

Route directories are lowercased on disk (``b100-2026-03``); callers may pass
route IDs in any case (``B100``) to match the rest of bp_corpus. Only the
``2026-03`` month is ingested today; loaders raise a clear error otherwise.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any

from ._paths import raw_root

if TYPE_CHECKING:
    import pandas as pd

DEFAULT_MONTH = "2026-03"

# Logical slice name -> on-disk filename. The embedded years are capture
# vintages, not the data month; treat them as opaque.
_SLICES: dict[str, str] = {
    "segment_speeds": "bus_segment_speeds_2025.json",
    "hourly_ridership": "bus_hourly_ridership_2025.json",
    "schedules": "bus_schedules_2026.json",
    "routes": "current_bus_routes.json",
    "stops": "current_bus_stops.json",
}


def slices() -> list[str]:
    """The logical slice names available per route."""
    return sorted(_SLICES)


def _route_dir(route_id: str, month: str) -> Path:
    return raw_root() / "route-slices" / f"{route_id.lower()}-{month}"


def ids(month: str = DEFAULT_MONTH) -> list[str]:
    """Sorted, upper-cased route IDs that have a slice directory for the month."""
    base = raw_root() / "route-slices"
    suffix = f"-{month}"
    return sorted(
        p.name[: -len(suffix)].upper()
        for p in base.glob(f"*{suffix}")
        if p.is_dir() and p.name.endswith(suffix)
    )


def path(route_id: str, slice_name: str, month: str = DEFAULT_MONTH) -> Path:
    """Resolve the on-disk path for one slice of one route (no existence check)."""
    if slice_name not in _SLICES:
        raise KeyError(f"unknown slice {slice_name!r}; valid: {slices()}")
    return _route_dir(route_id, month) / _SLICES[slice_name]


@lru_cache(maxsize=64)
def _read(path_str: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(Path(path_str).read_text())
    return data


def load(route_id: str, slice_name: str, month: str = DEFAULT_MONTH) -> dict[str, Any]:
    """The full envelope for one slice of one route."""
    p = path(route_id, slice_name, month)
    if not p.exists():
        raise FileNotFoundError(
            f"no slice at {p}. routes with slices for {month}: {len(ids(month))} "
            f"(e.g. {ids(month)[:5]})"
        )
    return _read(str(p))


def rows(route_id: str, slice_name: str, month: str = DEFAULT_MONTH) -> list[dict[str, Any]]:
    """Just the rows for one slice of one route."""
    return list(load(route_id, slice_name, month).get("rows", []))


def rows_df(route_id: str, slice_name: str, month: str = DEFAULT_MONTH) -> "pd.DataFrame":
    """One route slice's rows as a pandas DataFrame. Pandas imported lazily."""
    import pandas as pd

    return pd.DataFrame(rows(route_id, slice_name, month))
