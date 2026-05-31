"""Discovery surface over the whole raw corpus.

The agent should never have to ``ls`` its way around. :func:`families` returns a
single manifest of every raw source — the regular families wrapped by
:mod:`bp_corpus.raw`, the per-route ``route_slices``, and the irregular
browse-only families — each with its on-disk path, the accessor to use, and the
metadata ``sourceId`` to look its schema up by. :func:`schema` and
:func:`metadata` read the immutable Socrata captures under
``knowledge/raw/metadata/`` so the agent can learn a dataset's columns and
provenance without slurping a multi-hundred-MB capture file.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from . import raw
from ._paths import metadata_root

# One-line orientation per wrapped raw family.
_NOTES: dict[str, str] = {
    "311": "NYC 311 service requests, filtered to mobility complaint types. kind=current (2020+) or historical (pre-2020).",
    "dot-permits": "NYC DOT street work permits. kind=construction or opening.",
    "dot-traffic-volumes": "DOT automated traffic volume counts by segment-hour.",
    "nypd-collisions": "NYPD motor-vehicle collisions (injuries, killed, location).",
    "parking-violations": "Parking violations issued (summons-level). Largest family — filter, don't slurp.",
    "reliability": "MTA bus wait-assessment by route-period (scheduled vs observed headways).",
    "express-bus-capacity": "Express-bus APC load percentages (single multi-month capture, 2023-04..09).",
    "network-routes": "Current bus route rows (shape, bundle, direction).",
    "network-stops": "Current bus stop rows (per route-direction).",
}


def _accessor(name: str, partition: str, ks: list[str]) -> str:
    arg = "month" if partition == "month" else ""
    kind = ", kind=..." if ks else ""
    inner = ", ".join(p for p in (repr(name), arg) if p)
    return f"raw.rows({inner}{kind})"


# data/raw subdirectories deliberately not surfaced to the agent — operational
# state, not analysis evidence. The completeness test treats these as accounted
# for; anything else new under data/raw/ must be wrapped or added to _BROWSE.
_EXCLUDED_DIRS: frozenset[str] = frozenset({"r2-mirror"})


# Irregular families not wrapped by `raw` — reach them as noted. Each family name
# equals its data/raw/ subdirectory name.
_BROWSE: list[dict[str, Any]] = [
    {
        "family": "route-slices",
        "tier": "raw",
        "partition": "by-route",
        "path": "data/raw/route-slices/<route>-2026-03/",
        "accessor": "route_slices.rows(route_id, slice_name, month='2026-03')",
        "sourceIds": {
            "segment_speeds": "bus_segment_speeds_2025",
            "hourly_ridership": "bus_hourly_ridership_2025",
            "schedules": "bus_schedules_2026",
            "routes": "current_bus_routes",
            "stops": "current_bus_stops",
        },
        "note": "Per-route segment speeds, hourly ridership, schedule, network rows. 381 routes, month 2026-03. The most direct per-route evidence.",
    },
    {
        "family": "equity",
        "tier": "raw",
        "partition": "single",
        "path": "data/raw/equity/acs5-profile-nyc-tracts-2024.json",
        "accessor": "json.load(open(path)) — rows live under 'rawTable' (header row + value rows), not 'rows'",
        "sourceId": "census_acs5_profile_tracts",
        "note": "ACS 5-year census-tract profile (2024). Already pre-joined per route in findings.context_appendix(...).",
    },
    {
        "family": "noaa-weather",
        "tier": "raw",
        "partition": "by-station",
        "path": "data/raw/noaa-weather/<station>.csv",
        "accessor": "CSV per GHCND station (USW00014732 / 094728 / 094789) — read with pandas or csv",
        "note": "Daily NYC-area weather. Already summarized per route in context_appendix.weatherReliability.",
    },
    {
        "family": "gtfs-rt",
        "tier": "raw",
        "partition": "by-date",
        "path": "data/raw/gtfs-rt/2026-05-17/",
        "accessor": "browse the date tree with bash/jq",
        "note": "GTFS-realtime vehicle positions / trip updates / alerts snapshots. One capture day.",
    },
    {
        "family": "lion-centerline",
        "tier": "raw",
        "partition": "single",
        "path": "data/raw/lion-centerline/lion-centerline-2026-05-19.json",
        "accessor": "{...rows} envelope but 122k geometry rows — filter with jq; do NOT load whole into memory",
        "note": "NYC LION street centerline geometry, used for route<->street joins. Large.",
    },
    {
        "family": "third-party",
        "tier": "raw",
        "partition": "misc",
        "path": "data/raw/third-party/",
        "accessor": "browse directly with bash/jq",
        "note": "Third-party reference captures (BusObservatory).",
    },
]


def families() -> list[dict[str, Any]]:
    """Manifest of every raw source: path, accessor to use, and metadata sourceId."""
    out: list[dict[str, Any]] = []
    for name in raw.families():
        fam = raw.spec(name)
        ks = raw.kinds(name)
        entry: dict[str, Any] = {
            "family": name,
            "tier": "raw",
            "partition": fam.partition,
            "path": f"data/raw/{fam.dir}",
            "accessor": _accessor(name, fam.partition, ks),
            "note": _NOTES.get(name, ""),
        }
        if ks:
            entry["kinds"] = ks
        if fam.source_ids is not None:
            entry["sourceIds"] = dict(fam.source_ids)
        elif fam.source_id is not None:
            entry["sourceId"] = fam.source_id
        out.append(entry)
    out.extend(_BROWSE)
    return out


@lru_cache(maxsize=64)
def _read_json(path_str: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(Path(path_str).read_text())
    return data


def _columns_for(source_id: str) -> list[dict[str, Any]]:
    md = metadata_root()
    direct = md / f"{source_id}_columns.json"
    if direct.exists():
        cols: list[dict[str, Any]] = _read_json(str(direct)).get("columns", [])
        return cols
    desc = md / f"{source_id}.json"
    if desc.exists():
        dataset_id = _read_json(str(desc)).get("socrata", {}).get("datasetId")
        if dataset_id:
            via = md / f"{dataset_id}_columns.json"
            if via.exists():
                via_cols: list[dict[str, Any]] = _read_json(str(via)).get("columns", [])
                return via_cols
    return []


def schema(source_id: str) -> list[dict[str, Any]]:
    """Column schema for a source: name, fieldName, dataType, description.

    Accepts either the friendly sourceId (``nyc_311_service_requests_current``)
    or the raw Socrata dataset id (``erm2-nwe9``). Returns [] when no captured
    schema exists (e.g. non-Socrata sources like parking or census).
    """
    return [
        {
            "name": c.get("name"),
            "fieldName": c.get("fieldName"),
            "dataType": c.get("dataTypeName"),
            "description": (c.get("description") or "").strip(),
        }
        for c in _columns_for(source_id)
    ]


def metadata(source_id: str) -> dict[str, Any]:
    """Provenance card for a source (url, dataset id, row count, freshness)."""
    desc = metadata_root() / f"{source_id}.json"
    if not desc.exists():
        return {}
    d = _read_json(str(desc))
    s = d.get("socrata", {})
    return {
        "sourceId": d.get("sourceId"),
        "sourceType": d.get("sourceType"),
        "url": d.get("url"),
        "datasetId": s.get("datasetId"),
        "name": s.get("name"),
        "description": (s.get("description") or "").strip()[:800],
        "columnCount": s.get("columnCount"),
        "rowCount": s.get("rowCount"),
        "rowsUpdatedAtIso": s.get("rowsUpdatedAtIso"),
    }


def source_ids() -> list[str]:
    """Sorted source descriptors available under knowledge/raw/metadata/."""
    return sorted(
        p.stem
        for p in metadata_root().glob("*.json")
        if not p.stem.endswith("_columns")
    )
