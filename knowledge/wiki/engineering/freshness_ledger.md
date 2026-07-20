---
title: Freshness Ledger
type: engineering
status: active
last_updated: 2026-07-20
owner: codex
source_count: 2
tags: [freshness, operations, pipeline, publication, audit]
---

# Freshness Ledger

## Why this matters

The freshness ledger is the operator-facing replacement for calendar-month release anchors. It
answers one question per served source: how far do local ingestion and published coverage trail the
latest upstream evidence we can verify?

The public Worker reports what is currently served. This offline audit instead compares upstream,
local, and published state without adding live source probes to the request path.

## Running the audit

Run the audit after each ingest wave and before each publication:

```bash
bun run pipeline audit freshness
```

Use an explicit local database or artifact location when needed:

```bash
bun run pipeline audit freshness \
  --db data/local/pipeline.sqlite \
  --artifact-root data/artifacts \
  --output data/artifacts/audits/freshness-ledger.json
```

The default report is advisory. Add `--strict` to exit nonzero when a serving-critical source is
verified as stale:

```bash
bun run pipeline audit freshness --strict
```

Unknown rows do not fail strict mode. They mean the audit lacks an honest comparison, not that the
source is current.

## Reading the report

The command prints a worst-first table and writes
`data/artifacts/audits/freshness-ledger.json`. Each row contains:

| Field | Meaning |
|---|---|
| `sourceId` | Stable source-registry identity. |
| `grain` | Source time grain: `month`, `snapshot`, or `realtime`. |
| `upstreamLatest` | Latest upstream period returned by a cheap, supported probe; otherwise `null`. |
| `ingestedLatest` | Latest period proven by the source's local SQLite table; otherwise `null`. |
| `publishedCoverageEnd` | Coverage end from the newest valid D1 export summary or map manifest. |
| `ingestLagMonths` | Whole-month distance from upstream to local ingestion. |
| `publishLagMonths` | Whole-month distance from upstream to published coverage. |
| `status` | Worst comparison: `current`, `recent`, `stale`, or `unknown`. |
| `servingCritical` | Whether a verified `stale` row participates in `--strict`. |

Status uses the shared capability vocabulary:

- `current`: both computable lags are zero.
- `recent`: the worst computable lag is one to three months.
- `stale`: the worst computable lag is more than three months.
- `unknown`: upstream, ingested, or published state cannot be compared honestly.

Rows are ordered `stale`, `unknown`, `recent`, then `current`, with larger lags first inside a
status. Artifact discovery orders valid summaries by their `publishedAt` value. It never treats a
partition directory name as publication identity.

## Implementation notes

The first descriptor set covers route-segment speeds, route ridership trends, Bus Wait Assessment,
ACE violations, GTFS-RT vehicle positions, ACE route snapshots, NYC DOT bus-lane snapshots, and
mta-wiki treatment evidence. Route-speed availability reuses the existing completeness probe. The
supported Socrata sources use one maximum-value query each. Snapshot sources without a cheap,
truthful upstream or ingestion timestamp deliberately remain `unknown`.

When adding an ingested source, add its freshness descriptor as part of the ingest-command
checklist. Use a stored capture timestamp or source period; do not substitute an implementation
date, filename, partition name, or current wall-clock time.

## Caveats

- `--strict` is an operator gate, not a CI gate and not yet part of the publication command.
- A missing or legacy publication artifact is ignored when it lacks `publishedAt` and `coverage`.
- Lag is classified in calendar months even when a snapshot or realtime value includes a date.
- `unknown` requires investigation before publication; it is not evidence of freshness.

## Open questions

- Which snapshot sources can expose a cheap authoritative upstream-updated timestamp?
- After operators trust the report, should the publication runbook require `--strict` explicitly?

## Sources

- [ADR-0022: Multi-year corpus and freshness ledger](https://github.com/mannyc2/bus-priority-impact-studio/blob/main/docs/decisions/0022-multi-year-corpus-and-freshness-ledger.md) — verified_at: 2026-07-20
- [Shared route capability freshness vocabulary](https://github.com/mannyc2/bus-priority-impact-studio/blob/main/packages/domain/src/studio/route-capability.ts) — verified_at: 2026-07-20
