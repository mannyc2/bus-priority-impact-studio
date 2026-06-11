"""Typed accessors for the raw source captures under ``data/raw/``.

Most raw families share one envelope — ``{schemaVersion, sourceId, isoMonth,
query, rows: [...]}`` — so a single data-driven registry covers them all. Each
``Family`` records its directory, filename template(s), partition style, and the
metadata ``sourceId`` (used by :mod:`bp_corpus.catalog` to resolve column
schemas). Loaders return either the raw envelope, the rows, or a DataFrame;
pandas is imported lazily so dict-shaped consumers pay nothing for it.

Families with irregular shapes (per-route ``route-slices``, the census
``equity`` table, ``noaa-weather`` CSVs, the ``gtfs-rt`` tree, ``lion-centerline``
geometry) are intentionally *not* wrapped here — see
:func:`bp_corpus.catalog.families` for how to reach them.
"""

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any

from ._paths import raw_root

if TYPE_CHECKING:
    import duckdb
    import pandas as pd

_MONTH_RE = re.compile(r"\d{4}-\d{2}")


@dataclass(frozen=True)
class Family:
    dir: str
    partition: str  # "month" | "single"
    # Exactly one of `file`/`source_id` (no kinds) or `kinds`/`source_ids` (kinds).
    file: str | None = None
    source_id: str | None = None
    kinds: dict[str, str] | None = None
    source_ids: dict[str, str] | None = None
    default_kind: str | None = None


# Registry of the regular `{...rows}` raw families. Filename templates use
# `{month}` for the ISO `YYYY-MM` partition key. Verified against the on-disk
# corpus 2026-05-30.
_FAMILIES: dict[str, Family] = {
    "311": Family(
        dir="311",
        partition="month",
        kinds={
            "current": "311-current-{month}.json",
            "historical": "311-historical-{month}.json",
        },
        source_ids={
            "current": "nyc_311_service_requests_current",
            "historical": "nyc_311_service_requests_historical",
        },
        default_kind="current",
    ),
    "dot-permits": Family(
        dir="dot-permits",
        partition="month",
        kinds={
            "construction": "dot-construction-permits-{month}.json",
            "opening": "dot-opening-permits-{month}.json",
        },
        source_ids={
            "construction": "nyc_dot_street_construction_permits",
            "opening": "nyc_dot_street_opening_permits",
        },
        default_kind="construction",
    ),
    "dot-traffic-volumes": Family(
        dir="dot-traffic-volumes",
        partition="month",
        file="dot-traffic-volumes-{month}.json",
        source_id="nyc_dot_traffic_volume_counts",
    ),
    "nypd-collisions": Family(
        dir="nypd-collisions",
        partition="month",
        file="nypd-collisions-{month}.json",
        source_id="nypd_motor_vehicle_collisions",
    ),
    "parking-violations": Family(
        dir="parking-violations",
        partition="month",
        file="parking-violations-{month}.json",
        source_id="nyc_parking_violations_fy2023",
    ),
    "reliability": Family(
        dir="reliability",
        partition="month",
        file="bus-wait-assessment-{month}.json",
        source_id="bus_wait_assessment",
    ),
    "express-bus-capacity": Family(
        dir="express-bus-capacity",
        partition="single",
        file="express-bus-capacity-2023-04-2023-09.json",
        source_id="mta_express_bus_capacity_2023",
    ),
    "network-routes": Family(
        dir="network",
        partition="single",
        file="current_bus_routes.json",
        source_id="current_bus_routes",
    ),
    "network-stops": Family(
        dir="network",
        partition="single",
        file="current_bus_stops.json",
        source_id="current_bus_stops",
    ),
}


def families() -> list[str]:
    """Sorted names of the raw families this module can load."""
    return sorted(_FAMILIES)


def spec(family: str) -> Family:
    """The (frozen) registry entry for a family. Public read accessor."""
    return _family(family)


def _family(name: str) -> Family:
    try:
        return _FAMILIES[name]
    except KeyError:
        raise KeyError(
            f"unknown raw family {name!r}. known families: {families()}"
        ) from None


def _resolve(fam: Family, kind: str | None) -> tuple[str | None, str]:
    """Return (resolved_kind, filename_template) for a family + requested kind."""
    if fam.kinds is not None:
        k = kind if kind is not None else fam.default_kind
        if k not in fam.kinds:
            raise KeyError(
                f"unknown kind {kind!r}; valid kinds: {sorted(fam.kinds)}"
            )
        return k, fam.kinds[k]
    if kind is not None:
        raise ValueError(f"family has no kinds; drop kind={kind!r}")
    assert fam.file is not None
    return None, fam.file


def kinds(family: str) -> list[str]:
    """Sorted sub-kinds for a family (e.g. 311 -> current/historical), or []."""
    fam = _family(family)
    return sorted(fam.kinds) if fam.kinds is not None else []


def source_id(family: str, kind: str | None = None) -> str | None:
    """The metadata sourceId backing a family+kind (for catalog.schema)."""
    fam = _family(family)
    if fam.source_ids is not None:
        k, _ = _resolve(fam, kind)
        return fam.source_ids[k] if k is not None else None
    return fam.source_id


def months(family: str, kind: str | None = None) -> list[str]:
    """Sorted ISO months on disk for a month-partitioned family (else [])."""
    fam = _family(family)
    if fam.partition != "month":
        return []
    _, template = _resolve(fam, kind)
    prefix, _, suffix = template.partition("{month}")
    out: list[str] = []
    for p in (raw_root() / fam.dir).glob(template.replace("{month}", "*")):
        name = p.name
        stem = name[len(prefix): len(name) - len(suffix)] if suffix else name[len(prefix):]
        if _MONTH_RE.fullmatch(stem):
            out.append(stem)
    return sorted(out)


def path(family: str, month: str | None = None, kind: str | None = None) -> Path:
    """Resolve the on-disk path for a family capture (no existence check)."""
    fam = _family(family)
    _, template = _resolve(fam, kind)
    if fam.partition == "single":
        return raw_root() / fam.dir / template
    if month is None:
        raise ValueError(
            f"{family} is month-partitioned; pass month='YYYY-MM'. "
            f"available: {months(family, kind)}"
        )
    return raw_root() / fam.dir / template.replace("{month}", month)


@lru_cache(maxsize=32)
def _read(path_str: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(Path(path_str).read_text())
    return data


def load(family: str, month: str | None = None, kind: str | None = None) -> dict[str, Any]:
    """The full capture envelope (metadata + rows) for a family."""
    p = path(family, month, kind)
    if not p.exists():
        fam = _family(family)
        avail = months(family, kind) if fam.partition == "month" else "(single-file)"
        raise FileNotFoundError(
            f"no raw capture at {p}. available months for {family}: {avail}"
        )
    return _read(str(p))


def meta(family: str, month: str | None = None, kind: str | None = None) -> dict[str, Any]:
    """Envelope minus ``rows`` — provenance, query filters, fetchedAt. Cheap."""
    return {k: v for k, v in load(family, month, kind).items() if k != "rows"}


def rows(
    family: str, month: str | None = None, kind: str | None = None
) -> list[dict[str, Any]]:
    """Just the rows for a family capture."""
    return list(load(family, month, kind).get("rows", []))


def rows_df(family: str, month: str | None = None, kind: str | None = None) -> "pd.DataFrame":
    """Rows as a pandas DataFrame. Pandas imported lazily.

    Materializes every row — for the 150 MB+ families (parking, lion, 311) prefer
    :func:`duck`, which pushes filters/aggregations down instead.
    """
    import pandas as pd

    return pd.DataFrame(rows(family, month, kind))


def duck(
    family: str, month: str | None = None, kind: str | None = None
) -> "duckdb.DuckDBPyConnection":
    """A DuckDB connection with the family's rows exposed as the view ``rows``.

    Query with ``con.sql("SELECT ... FROM rows ...")``. DuckDB pushes filters and
    aggregations down, so for the big families (parking 158k rows/month, 311, the
    lion geometry) this returns a small result without building a full DataFrame.
    Note it still buffers the source object while parsing (~2-3x the file size in
    RAM); the largest captures sit close to the sandbox memory cap, so aggregate
    rather than ``SELECT *``. DuckDB is imported lazily (present in the sandbox
    image; install the ``dev`` extra to use it standalone).
    """
    import duckdb

    p = path(family, month, kind)
    if not p.exists():
        fam = _family(family)
        avail = months(family, kind) if fam.partition == "month" else "(single-file)"
        raise FileNotFoundError(
            f"no raw capture at {p}. available months for {family}: {avail}"
        )
    # rows is a LIST<STRUCT> under the top-level object; unnest(recursive)
    # flattens the struct fields into columns. maximum_object_size must exceed
    # the file, which read_json reads as a single object.
    max_object = p.stat().st_size * 2 + 64 * 1024 * 1024
    path_lit = str(p).replace("'", "''")
    con = duckdb.connect()
    con.execute(
        "CREATE VIEW rows AS SELECT unnest(rows, recursive := true) "
        f"FROM read_json('{path_lit}', maximum_object_size={max_object})"
    )
    return con
