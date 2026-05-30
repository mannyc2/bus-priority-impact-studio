"""Route-month signal features.

Each row describes one (routeId, month, window) tuple — speed, hotspots,
permit and 311 touch counts. Loaders return either raw dicts (for streaming
or dict-shaped access) or a pandas DataFrame (for tabular work).
"""

import json
from functools import lru_cache

from ._paths import findings_month


@lru_cache(maxsize=8)
def _load_raw(month: str) -> list[dict]:
    path = findings_month(month) / "signal-features.json"
    return json.loads(path.read_text())["features"]


def features(month: str) -> list[dict]:
    """All signal-feature rows for the month, as dicts."""
    return list(_load_raw(month))


def features_df(month: str):
    """All signal-feature rows for the month as a pandas DataFrame.

    Scalar columns are typed; nested columns (contextEventCounts,
    permitSources, uncertainty) remain object-dtyped. Pandas is imported
    lazily so consumers that only need dicts pay nothing for it.
    """
    import pandas as pd

    return pd.DataFrame(_load_raw(month))


def for_route(route_id: str, month: str) -> list[dict]:
    """All windows for a single route in a month."""
    return [f for f in _load_raw(month) if f.get("routeId") == route_id]
