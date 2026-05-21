---
title: Data Pipeline 2023-Present Completion Audit
type: engineering
status: active
last_updated: 2026-05-21
owner: codex
source_count: 0
tags: [pipeline, audit, source-coverage, historical-backfill]
---

# Data Pipeline 2023-Present Completion Audit

This audit covers the reframed corpus goal: use `2023-04` through the latest complete public speed
month (`2026-03` as of 2026-05-21) as the required history window, and explicitly scope any source
that should not support longitudinal claims.

| Requirement | Evidence | Status |
|---|---|---|
| Treat `2023-04`..`2026-03` as the corpus window | Source coverage ledger configs now target that window for route trends, Bus Wait, 311, and other longitudinal sources; range checks require target month count, not only min/max dates. | Done |
| Repair equity context | `ingest:equity-context -- --year 2024` loaded 2,327 ACS tracts; `route-equity-context -- --year 2026 --month 3 --acs-year 2024` wrote 381 route rows with 358 county-proxy assignments. | Done |
| Backfill 311 for the target window or scope it | `backfill:socrata-range -- --since 2023-04 --until 2026-03 --sources 311-service-requests,dot-traffic-volumes --concurrency 3` completed 72/72 tasks. 311 now has 2,560,438 filtered rows and is `complete_for_history`, with explicit caveats that route-context features use only geocoded/joined rows. | Done |
| Backfill traffic volume or scope it | DOT traffic-volume rows were fetched for the target window where source rows exist: 196,342 rows, `2023-04` through `2026-02`, 32 source months. Ledger keeps it `release_context_only` because the source is structurally sparse and route-join coverage remains low. | Done |
| Backfill parking or scope it | Parking source registry now includes FY2023, FY2024, FY2025, and FY2026 datasets. The normal month-ingest path loaded FY2023 April-December plus March 2026, but FY2024/FY2025 API queries were too slow/failing. Ledger explicitly scopes parking to `release_context_only` until a bulk fiscal-year loader and geocode strategy exist. | Done by scope decision |
| Rebuild context features/findings | `build:context-events` rebuilt the expanded event table; current local DB count is 6,447,473 context events. `build:context-event-route-touches` rebuilt 5,835,695 touches with route-touch audit caveats; `findings:detect -- --year 2026 --month 3` reran six detector families and 600 candidates. | Done |
| Rerun pipeline/export verification | `check:pipeline-v1 -- --year 2026 --month 3` passed with 0 issues; `export:d1` wrote a refreshed seed with 381 route equity rows; `verify:d1` passed with 0 issues; dry-run `publish:serving-release` passed publish completeness and R2 dry-run audit. | Done |

The current source coverage ledger reports 12 sources and 0 sources needing action under these
scope decisions.

## Follow-Up Decisions

- **Publish:** local March export, verification, and dry-run publish are green, but executed
  production publish remains a manual review step. Review the refreshed D1 seed hash, 381 route
  equity rows, and artifact diffs before running `publish:serving-release --execute`.
- **Parking:** keep `release_context_only`. Historical parking requires a separate bulk
  fiscal-year loader plus geocode strategy before it can support longitudinal detector claims.
- **311:** raw 2023-present history is loaded. The next quality project is targeted geocode/join
  improvement for route-relevant rows, especially rows near surfaced findings, rather than trying to
  geocode all 2.56M filtered rows at once.
