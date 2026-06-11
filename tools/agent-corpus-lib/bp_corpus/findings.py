"""Findings-side artifacts: review packets (queue), promoted findings (post-review),
context appendix, detector specs.
"""

import json
from functools import lru_cache

from ._paths import artifacts, findings_month


@lru_cache(maxsize=16)
def _load(month: str, name: str) -> dict:
    return json.loads((findings_month(month) / f"{name}.json").read_text())


def review_packets(month: str) -> list[dict]:
    """All review-queue packets for the month, in review-rank order."""
    return _load(month, "review-packets")["packets"]


def promoted_findings(month: str) -> list[dict]:
    """All promoted findings for the month."""
    return _load(month, "promoted-findings")["findings"]


def context_appendix(month: str, route_id: str | None = None):
    """Per-route context appendix (current traffic, equity, weather).

    With route_id, returns that route's appendix or {} if absent.
    Without, returns the full list of route appendices.
    """
    routes = _load(month, "context-appendix")["routes"]
    if route_id is None:
        return routes
    for r in routes:
        if r.get("routeId") == route_id:
            return r
    return {}


@lru_cache(maxsize=1)
def detector_specs() -> dict:
    """The (month-independent) detector spec registry."""
    return json.loads((artifacts() / "findings" / "detector-specs.json").read_text())
