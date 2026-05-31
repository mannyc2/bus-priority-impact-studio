"""A generated, self-describing reference for the bp_corpus API + corpus shapes.

Built by introspection so it never drifts from the code. Inline it into the
findings agent's system prompt — the CodeAct / Cloudflare-Codemode pattern of
handing the model the typed API surface up front, so it writes correct code
instead of guessing module names (`import context`) or column names
(`issuedate`). Regenerate, never hand-edit.
"""

import inspect
from typing import Any

from . import catalog, findings, raw, route_slices, routes, signals

_MODULES: tuple[Any, ...] = (routes, signals, findings, raw, route_slices, catalog)


def _signatures(mod: Any) -> list[str]:
    out: list[str] = []
    modname = mod.__name__.split(".")[-1]
    for name in sorted(dir(mod)):
        if name.startswith("_"):
            continue
        obj = getattr(mod, name)
        if not callable(obj) or inspect.isclass(obj):
            continue
        if getattr(obj, "__module__", None) != mod.__name__:
            continue  # skip names imported from other modules
        try:
            sig = str(inspect.signature(obj))
        except (ValueError, TypeError):
            sig = "(...)"
        doc = (inspect.getdoc(obj) or "").strip().split("\n")[0]
        out.append(f"- `{modname}.{name}{sig}` — {doc}")
    return out


def api_reference() -> str:
    """The full bp_corpus surface as markdown: signatures, raw families, columns."""
    lines: list[str] = [
        "# bp_corpus API (generated — this is the COMPLETE surface; do not guess names)",
        "",
        "Import what you need: `from bp_corpus import routes, signals, findings, raw, route_slices, catalog`",
        "There is NO `context` module — per-route context is `findings.context_appendix(month, route_id)`.",
        "All functions are read-only and idempotent. Months are ISO `YYYY-MM`.",
        "",
    ]
    for mod in _MODULES:
        lines.append(f"## {mod.__name__.split('.')[-1]}")
        lines.extend(_signatures(mod))
        lines.append("")

    lines.append("## Raw families and their columns (`raw.*`)")
    lines.append(
        "Row values are STRINGS (Socrata) — cast with int()/float() before arithmetic or "
        "numeric formatting, and guard non-numeric sentinels (e.g. 'N')."
    )
    for fam in raw.families():
        kinds: list[str | None] = list(raw.kinds(fam)) or [None]
        for kind in kinds:
            sid = raw.source_id(fam, kind)
            cols = [c["fieldName"] for c in catalog.schema(sid)] if sid else []
            label = fam + (f" kind={kind}" if kind else "")
            lines.append(f"- **{label}** [{sid}]: {', '.join(cols) if cols else '(no captured schema — inspect rows)'}")
    lines.append("")

    rs = next((e for e in catalog.families() if e["family"] == "route-slices"), None)
    if rs and rs.get("sourceIds"):
        lines.append("## route_slices columns (per-route, `route_slices.rows(route, slice, month)`)")
        for slc, sid in rs["sourceIds"].items():
            cols = [c["fieldName"] for c in catalog.schema(sid)]
            lines.append(f"- **{slc}** [{sid}]: {', '.join(cols) if cols else '(inspect rows)'}")
        lines.append("")

    browse = [e for e in catalog.families() if e["family"] not in raw.families() and e["family"] != "route-slices"]
    if browse:
        lines.append("## Browse-only raw (not wrapped — reach as noted, or see catalog.families())")
        for e in browse:
            lines.append(f"- **{e['family']}** — {e['accessor']}")

    return "\n".join(lines)
