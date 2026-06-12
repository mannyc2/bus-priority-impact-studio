# 0017 - Mixed freshness publication model

Date: 2026-06-07

## Status

Accepted.

## Context

The project started with useful "monthly release" language because the first credible public
projection was a route-month baseline: one complete public route-speed month, one D1 seed, one R2
artifact package, and one reviewed publish step.

That phrase no longer describes the product well enough. The site should display multi-year route
history from roughly 2023 onward, keep some sources fresh as they change, capture GTFS-RT before it
expires, and download public datasets as new source months appear. At the same time, the public
Worker must not become an analytics runner, and D1/R2 should only serve compact, reviewed
projections.

The old wording also confused two different ideas:

- a source or feature can have a monthly grain;
- the product itself is not limited to one monthly package.

## Decision

Retire "the product is a monthly release" as product doctrine.

The product is a **multi-year evidence system with versioned baselines, current signals, and
audited publication gates**.

Default public surfaces should therefore be shaped around multi-year route/corridor evidence
whenever source coverage supports it. A baseline month is an anchor for review and provenance, not
the intended outer boundary of the user-facing data.

Use these terms consistently:

| Term | Meaning |
|---|---|
| **Historical corpus** | Local source captures, SQLite rows, and artifacts covering the selected history window, currently 2023-04 through the latest complete public speed month where sources support it. Used for trends, baselines, detector calibration, backtests, review packets, and richer route visuals. |
| **Baseline month** | The latest reviewed complete public monthly performance month used as the stable reference for route cards, current-state claims, and release-keyed detector output. |
| **Current signal** | Fresher evidence that may not align with the baseline month, such as a self-collected GTFS-RT window or source-specific appendix. It can appear on the site only with explicit freshness, coverage, and provenance labels. |
| **Source-capture snapshot** | A point-in-time capture of an external source or feed, including metadata, query, fetched time, raw rows/objects, and provenance. It exists because upstream data can change, disappear, or expire. |
| **Pipeline artifact corpus** | Deterministic local derived products: joins, speed-history bundles, route briefs, model artifacts, review packets, coverage reports, and audits. It is the staging ground for what could be published. |
| **Serving projection** | The D1/R2 package the public app reads. D1 stores compact query/index rows; R2 stores immutable larger bundles. The public request path never reads raw corpus or local artifacts. |
| **Publication / promotion** | A reviewed mutation that promotes a serving projection to production D1/R2. It happens after QA and provenance review, not merely because time passed. |

Monthly cadence remains valid where the source or claim grain is monthly:

- route segment speeds;
- route monthly speed/ridership trends;
- Bus Wait Assessment;
- release-month detector output and review capacity;
- same-month observed release promotion gates.

But monthly cadence is **not** the whole product model. Route pages, APIs, and data notes should be
able to describe mixed freshness:

- `baselineMonth`;
- `historyWindowStart` / `historyWindowEnd`;
- `currentSignals`;
- `sourceCoverage`;
- `projectionFreshness`;
- section-level support flags and caveats.

## Operational rules

1. **Worker cron stays lightweight.** It captures GTFS-RT to R2, writes compact manifests/status, and
   checks public source availability. It does not run geospatial joins, historical builds, D1 export,
   or R2 serving publication.
2. **`shouldRebuild` is a signal, not a job.** A newer complete public monthly source should trigger
   reviewed local/GitHub rebuild work, not automatic public mutation.
3. **Publication is deliberate.** `publish:serving-release --execute` remains a reviewed promotion
   step after checks, row counts, provenance labels, and artifact diffs are understood.
4. **Snapshots exist for evidence and reproducibility.** They are not ceremony for a monthly release;
   they preserve source state, normalize upstream changes, make joins auditable, and let Cloudflare
   serve precomputed results cheaply.
5. **The site should not imply one freshness clock.** A route page may simultaneously show a March
   2026 baseline, a 2023-04 to 2026-03 speed-history series, a May/June GTFS-RT current signal, and
   a dated TSP source snapshot. Each layer must carry its own source and coverage state.

## Consequences

- Future docs should avoid saying "the product is a monthly release." Prefer "release-keyed,"
  "baseline-month," "serving projection," or "publication gate" depending on the exact meaning.
- Snapshot 2.0 remains a valid name for the serving manifest only if it is understood as
  addressability, coverage, projection, and freshness state, not as a single-month product.
- Coverage/freshness projections become first-class infrastructure. Route loaders and UI sections
  should eventually read these instead of inferring availability from one release month or probing R2
  route by route.
- Detectors should still emit release-month candidates when that is the actionable review unit, but
  they should use named historical windows for persistence, seasonality, calibration, and
  counter-evidence.
- Current-signal surfaces can update more often than baseline publications, but they cannot use the
  same language as complete baseline releases unless the matching source-month QA gates pass.
