"""Route registry.

The canonical route list for a month is derived from the signal-features
artifact — every route the pipeline analyzed appears there. There is no
separate routes manifest.
"""

import json
from functools import lru_cache

from ._paths import findings_month


@lru_cache(maxsize=8)
def ids(month: str) -> list[str]:
    """Sorted list of route IDs that appear in the month's signal features."""
    path = findings_month(month) / "signal-features.json"
    data = json.loads(path.read_text())
    return sorted({f["routeId"] for f in data["features"] if f.get("routeId")})
