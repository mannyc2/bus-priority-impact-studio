# 0022 - Multi-year corpus and freshness ledger

Date: 2026-07-12

Supersedes: the baseline-month and release-month anchor portions of ADR-0017.

## Status

Accepted.

## Context

ADR-0017 retired "the product is a monthly release" as product doctrine, but retained a
"baseline month" as a first-class review, serving, and release anchor. The detector program that
motivated release-month keying was deleted in plan 061. Production serving still pins
`BASELINE_MONTH=2026-03` in July 2026, while no first-class report says how far that projection
lags each upstream source.

The operator directed on 2026-07-12 that monthly baselines and month-keyed release identity be
removed entirely. The product should serve and analyze the full history each source supports,
identify releases by publication events, and report freshness against current upstream coverage.

## Decision

1. No product, serving, or release identity is a calendar month. A release is a **publication
   event** identified by `releaseId` and `publishedAt` (an ISO datetime), with per-dataset coverage
   windows shaped as `{ start, end, grain }`.
2. Served and analyzed data spans the full available history per source: multi-year whenever the
   source supports it. A single month is never the outer boundary of a user-facing dataset when
   more coverage exists.
3. Freshness is measured against now and against upstream, never against a "release month." For
   each source, the freshness ledger introduced by plan 087 records upstream-latest,
   ingested-latest, and published-coverage-end state. Serving surfaces compute staleness at read
   time.
4. Months remain valid only as source grain, time-series coordinates, and ingest or storage
   partitions. An upstream month, a chart point, or a month-keyed directory/table is a partition or
   coordinate, not a release identity.
5. Reviewed publication gates remain. ADR-0017's operational rules 1-4 continue to govern
   lightweight cron, deliberate publication, and snapshot evidence, but a gate validates coverage
   consistency and provenance rather than month equality.

Use this vocabulary for plans 079-081 and 085-087:

| Retired vocabulary | Replacement |
|---|---|
| `baselineMonth` as identity | `coverage: { start, end }` plus `publishedAt` |
| `canonicalMonthlyRelease` | `release` |
| `releaseMonth` on manifests | `publishedAt` plus `coverage` |
| `releaseLayer: "baseline_release"` | `releaseLayer: "published_release"` |
| `completenessStatus: "partial_public_monthly_only"` | `completenessStatus: "partial_public_speed_only"` |
| "promote a baseline month" | "publish a release" |
| `BASELINE_MONTH` / `LAST_BUILT_SPEED_MONTH` | Deleted; serving derives coverage from D1/R2 |

## Consequences

- Plans 085-087 execute the serving-contract, pipeline-identity, and freshness-ledger code changes.
- ADR-0017's terms **Baseline month** and its monthly-cadence blessing list are retired.
- ADR-0017's terms **Historical corpus**, **Source-capture snapshot**, **Serving projection**, and
  **Publication / promotion** survive unchanged.
- Existing month-keyed runtime mechanics remain documented as current behavior only until their
  owning follow-up plan lands. They are not the target product model.
- Source-specific month partitions and monthly chart axes remain valid when they faithfully reflect
  source grain or time-series coordinates.
