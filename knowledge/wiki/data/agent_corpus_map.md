---
title: Agent corpus map (codemode sandbox)
type: data
status: active
last_updated: 2026-05-30
owner: codex
tags: [agent, sandbox, codemode, findings]
---

# Agent corpus map

> This page is loaded **verbatim** into the findings-propose agent's system prompt
> when codemode is enabled. Keep it concise (target <4 KB) and concrete. If you
> add a new bp_corpus module or change an API, update this page in the same PR.

The findings-propose agent runs inside a Docker sandbox with the corpus mounted
read-only. The agent has two tools — `bash(command)` and `python(code)` — and a
helper library `bp_corpus` available at `import bp_corpus`. Outputs (stdout) are
captured per call and the agent decides what to do next.

## Sandbox layout

| Path                       | Mount | Purpose |
|----------------------------|-------|---------|
| `/work/data/artifacts/`    | ro    | Pipeline outputs: findings, route slices, briefs |
| `/work/data/raw/`          | ro    | Source captures: 311, permits, GTFS-RT, collisions, parking |
| `/work/data/local/`        | ro    | SQLite analytics DB (`local-pipeline.sqlite`) |
| `/work/knowledge/`         | ro    | This wiki, including raw metadata under `raw/metadata/` |
| `/work/agent-corpus-lib/`  | ro    | `bp_corpus` source (added to `PYTHONPATH`) |
| `/tmp`                     | rw, tmpfs, 64 MB | Scratch space; cleared after the call |

Network is disabled. The rootfs is read-only. CPU and memory are capped per call.

## bp_corpus API (the typed entry points)

All functions are read-only and idempotent. Months use ISO format `YYYY-MM`.

```python
from bp_corpus import routes, signals, findings

routes.ids(month)                          # -> list[str], sorted route IDs for the month

signals.features(month)                    # -> list[dict], all route-month-window rows
signals.features_df(month)                 # -> pandas.DataFrame of the same
signals.for_route(route_id, month)         # -> list[dict], one route's windows

findings.review_packets(month)             # -> list[dict], in reviewRank order
findings.promoted_findings(month)          # -> list[dict], post-review approved
findings.context_appendix(month, route_id) # -> dict (or [] if route_id omitted)
findings.detector_specs()                  # -> dict, the detector spec registry
```

## Key JSON shapes (top-level keys)

`signal-features.json` row (one per route × month × window):
```
routeId, month, window, direction, routeWeightedAverageSpeedMph,
speedObservationCount, hotspotCount, maxHotspotScore, ridershipExposure,
permitTouchedEventCount, contextTouchedEventCount, contextHighConfidenceTouchCount,
contextEventCounts[], uncertainty{}
```

`review-packets.json` packet:
```
packetId, reviewRank, candidate{detectorId, scopeId, routeId, claimText, ...},
detectorSpec{...}, evidence{primary[], context[], counterEvidence[], caveats[]},
priority{score, ...}
```

`promoted-findings.json` finding:
```
promotedFindingId, detectorId, routeId, category, severity, confidence,
claimText, approvedClaimStrength, reviewer, reviewRationale, sourceCandidate{...}
```

`context-appendix.json` route entry:
```
routeId, currentTrafficSpeed{...}, trafficVolume{...}, equity{...}, weatherReliability{...}
```

## Example tool sequences

**1. Rank routes by hotspot count for a month**
```python
python:
import pandas as pd
from bp_corpus import signals
df = signals.features_df("2026-03")
all_day = df[df.window == "all_day"].nlargest(20, "hotspotCount")
print(all_day[["routeId", "hotspotCount", "routeWeightedAverageSpeedMph"]].to_string(index=False))
```

**2. Find routes with high 311 context but no promoted finding yet**
```python
python:
from bp_corpus import signals, findings
month = "2026-03"
promoted_routes = {f["routeId"] for f in findings.promoted_findings(month)}
high311 = [
    f for f in signals.features(month)
    if f["window"] == "all_day" and f["contextHighConfidenceTouchCount"] > 200
]
gap = [f for f in high311 if f["routeId"] not in promoted_routes]
print(len(gap), "candidate routes without a promoted finding")
for f in gap[:10]:
    print(f["routeId"], f["contextHighConfidenceTouchCount"])
```

**3. Inspect raw 311 records for one route (bash + jq)**
```bash
bash:
# Listing first — see what's there before slurping
ls /work/data/raw/311/ | head
# Then jq into a specific cluster
jq '.[0:3]' /work/data/raw/311/<filename>.ndjson | head -50
```

**4. Read a specific review packet's claim and evidence**
```python
python:
from bp_corpus import findings
packets = findings.review_packets("2026-03")
p = next(p for p in packets if p["candidate"]["routeId"] == "Q17")
print(p["candidate"]["claimText"])
print("primary evidence:", len(p["evidence"]["primary"]))
```

**5. Check a route's context appendix**
```python
python:
from bp_corpus import findings
appendix = findings.context_appendix("2026-03", "BX38")
print({k: type(v).__name__ for k, v in appendix.items()})
```

## What's deliberately excluded

- `/work/data/working/` and `/work/data/exports/`, `/work/data/fixtures/` — not mounted. Working state is volatile; exports are pipeline outputs not meant for agent reasoning.
- `/work/data/artifacts/docs/` — 6.1 GB of OCRed policy documents. Not blocked by mounting, but reading large files burns the per-call output cap fast; if you need a document, target by id, not by directory scan.
- Anything outside the listed roots — including the host filesystem — is invisible. There is no fallback.

## Determinism rules (load-bearing for evidence_refs)

When you cite a `code_execution` evidence ref, validators **re-run your code** and
check that stdout hashes to the same value. To stay deterministic:

- Do not call `time.time()`, `datetime.now()`, `random.*`, or any system-clock or
  randomness API in cited code.
- Do not write to `/tmp` if subsequent reads in the same script depend on it.
- Sort before slicing: `sorted(...)` before `[:10]` — dict iteration order is
  insertion-stable but DataFrame ops may not be.
- If you need the date, pass it as a literal in the code, not via `today()`.
