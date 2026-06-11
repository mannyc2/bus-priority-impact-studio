---
name: corpus-navigation
description: How to slice the Bus Priority Impact Studio data corpus from inside the bp-sandbox container using Bun TypeScript, analytics imports, bash, and deterministic code_execution refs.
---

# Corpus Navigation

The findings-propose agent runs inside a Docker sandbox with the corpus mounted
read-only. Use `ts_exec(code)` for analysis and `bash_exec(code)` for small file
navigation. Network is disabled. The root filesystem is read-only.

## Sandbox Layout

| Path | Mount | Purpose |
|---|---|---|
| `/work/data/artifacts/` | ro | Pipeline outputs: findings, route slices, briefs |
| `/work/data/raw/` | ro | Source captures: 311, permits, GTFS-RT, collisions, parking |
| `/work/data/local/` | ro | SQLite analytics DB (`local-pipeline.sqlite`) |
| `/work/knowledge/` | ro | Wiki and raw metadata |
| `/work/repo/packages/analytics/` | ro | Deterministic analytics kernel |
| `/work/repo/packages/domain/` | ro | Domain schemas and evidence contracts |
| `/tmp` | rw, tmpfs, 64 MB | Scratch space for one call |

`ts_exec` can import the package entry points:

```ts
import { listAnalyticsDetectors } from "@bp/analytics/registry";
import { summarizeScoreVector } from "@bp/analytics/calibration";
```

## Common JSON Files

```ts
const month = "2026-03";
const signalFeatures = await Bun.file(
  `/work/data/artifacts/findings/${month}/signal-features.json`,
).json();
const reviewPackets = await Bun.file(
  `/work/data/artifacts/findings/${month}/review-packets.json`,
).json();
const promotedFindings = await Bun.file(
  `/work/data/artifacts/findings/${month}/promoted-findings.json`,
).json();
```

## Example Tool Sequences

Rank all-day routes by hotspot count:

```ts
const month = "2026-03";
const artifact = await Bun.file(`/work/data/artifacts/findings/${month}/signal-features.json`).json();
const rows = artifact.features ?? artifact.rows ?? [];
const ranked = rows
  .filter((row) => row.window === "all_day")
  .sort((a, b) => (b.hotspotCount ?? 0) - (a.hotspotCount ?? 0))
  .slice(0, 20)
  .map((row) => ({
    routeId: row.routeId,
    hotspotCount: row.hotspotCount,
    speedMph: row.routeWeightedAverageSpeedMph,
  }));
console.log(JSON.stringify(ranked, null, 2));
```

Inspect the analytics registry:

```ts
import { listAnalyticsDetectors } from "@bp/analytics/registry";

console.log(JSON.stringify(
  listAnalyticsDetectors().map((detector) => ({
    detectorId: detector.detectorId,
    claimTier: detector.claimTier,
    scope: detector.scope.kind,
  })),
  null,
  2,
));
```

Use bash for small previews:

```bash
find /work/data/artifacts/findings/2026-03 -maxdepth 1 -type f | sort
jq '.summary // keys' /work/data/artifacts/findings/2026-03/review-packets.json
```

## Determinism Rules

Validators re-run cited `code_execution` refs and compare stdout hashes. When
you cite code:

- Use `language: "typescript"` unless the cited ref is a tiny deterministic bash
  slice.
- Do not call `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()`,
  `crypto.getRandomValues()`, `performance.now()`, or process clock APIs.
- Sort before slicing.
- If a date matters, write it as a literal.
- Do not cite code that reads `/work/.ralph` or any temp scratch file created by
  a prior tool call.
- Print exactly the cited scalar or a compact JSON object with keys that match
  `metricClaims[].variable`.
