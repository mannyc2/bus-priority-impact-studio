# Plan 038: Build the raw→SQLite coverage gate (deletion prerequisite for the JSON layer)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ce3baca..HEAD -- tools/pipeline-v2/src/commands/audit tools/pipeline-v2/src/lib/source-snapshots.ts tools/pipeline-v2/src/lib/socrata-monthly-ingest.ts`
> On drift, compare "Current state" excerpts against live code; mismatch = STOP.
>
> **This plan deletes NOTHING.** It builds the evidence a deletion needs.
> You must never run `rm` against anything under `data/`.

## Status

- **Priority**: P1 (the disk is 91% full; this gates the ~180 GB reclaim)
- **Effort**: M
- **Risk**: LOW (new read-only command + artifact; no behavior changes)
- **Depends on**: none (037 recommended first, unrelated files)
- **Category**: tech-debt / correctness
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

`data/` holds 409 GB on a 1.8 TB disk that sits at 91% full, and 386,793
JSON files. The dominant duplication: every Socrata monthly ingest writes
its rows into the canonical local SQLite (`data/local/pipeline.sqlite`,
170 GB) **and** dumps the same fetched rows as a raw JSON snapshot under
`data/raw/` (182 GB total; `socrata-partitioned/` alone is 142 GB). The
operator wants the raw JSON layer deprecated — but only after proving the
SQLite side actually holds everything. This plan builds that proof as a
pipeline command that emits a machine-readable coverage report and a
deletion manifest. Plan 039 consumes the manifest; the operator runs the
actual deletion.

## Current state

Verified 2026-07-04 at commit `ce3baca`.

**The duplicate-on-write mechanism** —
`tools/pipeline-v2/src/lib/socrata-monthly-ingest.ts:95-107`: after
`config.replaceRows(...)` writes normalized rows into SQLite, the same
function calls `writeRawSourceSnapshot({ path: rawPath, ..., rows: rawRows })`
unconditionally. `writeRawSourceSnapshot`
(`tools/pipeline-v2/src/lib/source-snapshots.ts:13-23`) writes
`{schemaVersion, sourceId, isoMonth, fetchedAt, query, rows}` as JSON.
Snapshot filenames follow `${rawFilePrefix}-${YYYY-MM}.json`
(`socrata-monthly-ingest.ts:73-75`).

**Ingest commands that write raw snapshots** (15 verified callers of
`writeRawSourceSnapshot` under `commands/ingest/`): 311-service-requests,
bus-lanes, nypd-collisions, parking-violations, dot-traffic-volumes,
dot-street-permits, ace-routes, ace-violations, express-bus-capacity,
bus-customer-journey-metrics, route-catalog, dot-traffic-speeds,
lion-centerline, plus `lib/socrata-monthly-ingest.ts` used by more.

**data/raw layout and sizes** (du, 2026-07-04):

| family dir | size | suspected SQLite counterpart (verify, don't trust) |
|---|---|---|
| socrata-partitioned/ | 142 G | bulk per-dataset partitions (various `local_*` tables) |
| socrata-bulk/ | 19 G | bulk CSV exports |
| route-slices/ | 7.4 G | `local_route_segment_speed` family (route-slice artifacts) |
| parking-violations/ | 6.0 G | `local_parking_violation`(+`_match`) |
| 311/ | 3.8 G | `local_311_service_request` |
| dot-permits/ | 2.9 G | `local_dot_street_permit` |
| gtfs-rt/ | 490 M | `local_gtfs_rt_*` (parsed) — raw protobuf may be canonical capture |
| third-party/ | 484 M | unknown — likely handoff archives, maybe RAW-ONLY |
| nypd-collisions/ | 263 M | `local_nypd_collision` |
| lion-centerline/ | 180 M | `local_lion_segment`(+`_geom`) |
| r2-mirror/ | 112 M | GTFS-RT protobuf backfill mirror (written by `pull/gtfs-rt-r2-run.ts`, read by `import/gtfs-rt-r2-manifests.ts` — ingest-only) |
| dot-traffic-volumes/ | 96 M | `local_dot_traffic_volume_count` |
| network/ | small | route-shape + stop snapshots — READ AT RELEASE TIME (see below); always CONSTRAINED |

`socrata-partitioned/` layout (verified): one dir per sourceId
(`bus_hourly_ridership_2020_2024`, `bus_schedules_2023`, `ridership-2021`,
...) with chunked CSV files, and the ingest command
(`commands/ingest/socrata-partitioned-csv-snapshot.ts`) writes a partition
manifest per run (see its `manifestPath` / `"manifest_written"` handling).
Classify this family via those manifests plus the year ranges embedded in
sourceId names — fall back to `OPAQUE` only for dirs with neither.

The live SQLite (`data/local/pipeline.sqlite`) contains `local_*` tables for
every family above (verified via read-only `sqlite_master` listing: e.g.
`local_311_service_request`, `local_ace_violation_summary`,
`local_bus_customer_journey_metric`, `local_bus_wait_assessment`,
`local_dot_traffic_speed`, `local_gtfs_static_*`, `local_gtfs_rt_*`,
`local_parking_violation`, ...).

**Direct raw readers in live code** (these paths read `data/raw` at
build/release time, not just at ingest — they constrain deletion). Precise
verified sites:
- `commands/studio/_release-geometry.ts:741-742` — `routeGeometryIndex()`
  (and `segmentLaneOverlapIndex()` at ~:821-822) read
  `data/raw/network/current_bus_routes.json` and
  `.../current_bus_stops.json` via `readJsonIfExists<RawSourceSnapshot>`;
  defaults set in `commands/studio/release.ts:87-88`.
- `commands/studio/route-treatment-summary.ts:34-35` — same two network
  snapshot defaults.
- `commands/studio/release.ts:86` — `defaultRouteSliceRawRoot =
  "data/raw/route-slices"` (so `route-slices/`, 7.4 GB, is NOT a free
  orphan despite artifacts having moved to `data/artifacts/route-slices`
  — the command must determine whether that raw root is still actually
  read on the current release path, and verdict accordingly).
- `commands/pull/gtfs-rt-r2-run.ts` + `commands/collect/gtfs-rt.ts`
  (capture writers), `commands/import/gtfs-rt-r2-manifests.ts` (r2-mirror
  ingest reader), `commands/audit/data-product-completeness.ts` (raw
  reliability snapshot probes), and
  `packages/analytics/src/data-products/registry.ts` (path templates in
  the data-product manifest). Plus every `commands/ingest/*` (they write,
  and some re-read their own snapshot).

**Existing coverage evidence to reuse** (verified paths):
`data/artifacts/audits/tier2-source-coverage.json` (485 sources tracked;
445 captured / 9 failed / 31 never attempted as of 2026-07-04),
`data/artifacts/source-month-coverage/2023-04_to_2026-03/coverage-matrix.json`
(per-route-month coverage for segment speeds/schedules), and the
`data/artifacts/audits/data-product-completeness/` artifacts (row counts,
date ranges). Prefer citing these in the report over recomputing.

**Existing machinery to reuse**: `commands/audit/source-coverage.ts`
(coverage-audit command shape), the Effect local-DB boundary — commands must
NOT construct `bun:sqlite` directly; `tests/harness/production-boundaries.test.ts:309-334`
enforces that command modules go through the Effect/database boundary
(`runLocalDbCommandBoundary` / layers under `tools/pipeline-v2/src/effect/`),
with `localDbOptions: { readonly: true }` for read-only audits (see
ADR-0019 and any `commands/audit/*.ts` for the pattern).

**Run-ledger context**: `data/ops/backfills/` and `data/ops/coverage-control/`
hold backfill run state — useful evidence, do not modify.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck pipeline | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Run the new command | `bun --filter @bp/pipeline-v2 cli -- audit raw-snapshot-coverage` | exit 0, artifact written |
| Architecture harness | `bun run check:web-architecture` | all pass |

## Scope

**In scope**:
- New command file `tools/pipeline-v2/src/commands/audit/raw-snapshot-coverage.ts`
- New lib module if needed: `tools/pipeline-v2/src/lib/raw-deprecation.ts`
  (pure classification logic so it is unit-testable)
- New test `tools/pipeline-v2/test/commands/audit/raw-snapshot-coverage.test.ts`
  (+ a small fixture dir under `data/fixtures/raw-deprecation/`)
- Output artifacts under `data/artifacts/raw-deprecation/` (gitignored data
  dir; artifacts are outputs, fine to create)

**Out of scope**:
- Deleting or moving ANYTHING under `data/` (plan 039's operator runbook).
- Changing `socrata-monthly-ingest.ts` or any ingest command behavior
  (plan 039).
- The direct raw readers (`release.ts` etc.) — this plan only RECORDS what
  they read; re-pointing them is plan 039 or excluded families.
- `@liche/core` command style changes (plan 040 migrates the framework; this
  command is written in the CURRENT liche `defineCommand` style so it works
  today — see `commands/audit/source-coverage.ts` as the exemplar).

## Git workflow

- Branch: `plan/038-raw-coverage-gate`; imperative commit messages; no push
  unless the operator asked.

## Steps

### Step 1: Catalogue the raw tree deterministically

In `lib/raw-deprecation.ts`, implement a pure function that, given a listing
of `data/raw/**` (dirs, file names, byte sizes — gathered via the pipeline
filesystem service, NOT raw `Bun.file` in the command; see ADR-0019 note
that raw source snapshot writes/reads go through `PipelineFileSystemService`),
produces per-family entries:

```ts
type RawFamilyReport = {
  family: string;            // top-level dir under data/raw
  bytes: number;
  fileCount: number;
  months: string[];          // YYYY-MM extracted from `${prefix}-${YYYY-MM}.json` names; [] if layout unknown
  layout: "monthly-snapshots" | "partitioned" | "opaque";
};
```

Month extraction must only trust the verified naming convention
(`socrata-monthly-ingest.ts:73-75`); anything else is `layout: "opaque"`.

**Verify**: unit test with a synthetic listing → expected families/months.

### Step 2: Probe SQLite coverage read-only

Add a read-only probe (through the Effect local-DB boundary with
`readonly: true`) that, for each family, checks its mapped `local_*`
table(s):
- table exists in `sqlite_master`;
- if the table has a month-ish column (`month`, `iso_month`, or a date
  column — inspect `PRAGMA table_info` result), collect
  `SELECT DISTINCT <monthCol>` (these tables are month-partitioned and small
  in distinct-month count; do NOT `COUNT(*)` large tables);
- else record `monthGranularity: "none"`.

Start from this mapping table (in code, as data — one entry per family
listed in "Current state"), marking families with no obvious table as
`table: null`.

**Verify**: `bun --filter @bp/pipeline-v2 test` — new unit test passes using
the fixture SQLite under `data/fixtures/` (several exist, e.g. the
`check-pipeline-v1` fixture DB; create a purpose-built tiny fixture if none
fits — keep it under `data/fixtures/raw-deprecation/`).

### Step 3: Record the direct-raw-reader constraint list

Hard-code (as data in `lib/raw-deprecation.ts`, with a comment dating it
2026-07-04) the verified direct-reader list from "Current state". For each
family, the report marks `directReaders: string[]` — any family read by
`commands/studio/release.ts`, `route-treatment-summary.ts`,
`collect/gtfs-rt.ts`, `pull/gtfs-rt-r2-run.ts`, or
`audit/data-product-completeness.ts` outside its own ingest cannot be
verdicted `DELETABLE` regardless of coverage. Add a step in the command that
greps nothing — the list is static data; plan 039 re-verifies it live.

### Step 4: Compose verdicts and write the artifacts

Verdict rules (pure function, unit-tested):
- `INGESTED` — table exists AND (layout is monthly AND every raw month
  appears in the table's distinct months) AND no direct readers.
- `PARTIAL` — table exists but raw months ⊄ table months (report the gap
  list).
- `RAW-ONLY` — no mapped table (e.g. possibly `third-party/`, `r2-mirror/`).
- `OPAQUE` — layout unknown (e.g. `socrata-partitioned/` unless its
  file names carry months); needs operator classification.
- `CONSTRAINED` — coverage fine but direct readers exist (e.g. `gtfs-rt/`).

The command writes:
- `data/artifacts/raw-deprecation/raw-coverage-<YYYY-MM-DD>.json` — the full
  report (families, verdicts, evidence, bytes).
- `data/artifacts/raw-deprecation/deletion-manifest-<YYYY-MM-DD>.json` —
  ONLY the `INGESTED`-verdict entries, each `{path, bytes, family,
  evidence}` — this is plan 039's input.
- A human summary printed to stdout (family, verdict, GB, one-line reason).

Also include in the JSON report (as `orphanedArtifacts`) the two
already-verified orphans so the operator sees the full reclaim picture:
`data/artifacts/docs` (51 GB — its producer, the Tier 2 docs pipeline, was
deleted 2026-07-03; only reference left repo-wide is a SKILL.md inside the
plan-037 deletion set) and the zero-byte DB stubs (plan 036 removes those).

**Verify**: `bun --filter @bp/pipeline-v2 cli -- audit raw-snapshot-coverage`
→ exit 0; both artifacts exist; stdout table lists every family from the
"Current state" table with a verdict.

### Step 5: Full gate

**Verify**:
- `bun --filter @bp/pipeline-v2 typecheck` → exit 0
- `bun --filter @bp/pipeline-v2 test` → all pass (including the new tests)
- `bun run check:web-architecture` → all pass (proves the command respected
  the no-direct-sqlite boundary)
- `git status` → only in-scope files changed; nothing under `data/raw`
  modified (`find data/raw -newer package.json -type f | head` → empty)

## Test plan

- `tools/pipeline-v2/test/commands/audit/raw-snapshot-coverage.test.ts`:
  - month extraction: `bus-lanes-2026-03.json` → `2026-03`; unknown name →
    opaque.
  - verdict matrix: one case per verdict (INGESTED, PARTIAL with gap list,
    RAW-ONLY, OPAQUE, CONSTRAINED).
  - fixture SQLite probe: table with month column, table without, missing
    table.
- Model the test structure on an existing command test under
  `tools/pipeline-v2/test/commands/` (e.g. the route command tests).

## Done criteria

- [ ] `bun --filter @bp/pipeline-v2 cli -- audit raw-snapshot-coverage` exits 0 against the real `data/` and writes both artifacts
- [ ] The JSON report contains every top-level `data/raw/*` family with a verdict and byte count
- [ ] The deletion manifest contains ONLY `INGESTED` families
- [ ] `gtfs-rt` family is verdicted `CONSTRAINED` or stricter (its collectors/readers are live), NOT `INGESTED`
- [ ] All pipeline tests pass; architecture harness passes
- [ ] Nothing under `data/raw` was modified or deleted
- [ ] `plans/README.md` status row updated

## STOP conditions

- The read-only SQLite probe cannot open `data/local/pipeline.sqlite`
  read-only, or any probe query runs longer than ~60s (you picked a
  non-indexed scan — redesign the query; do not let it run).
- You find a family whose ingest command DELETES-then-rewrites SQLite rows
  in a way that means SQLite holds only the latest month (i.e.
  `replaceRows` semantics are global, not per-month) — that inverts the
  coverage logic; report with the file:line before writing verdict code.
- The command cannot be expressed through the Effect local-DB boundary
  without touching `tools/pipeline-v2/src/effect/*` beyond adding a
  read-only probe method — adding one small method there is allowed; a
  redesign of the boundary is not.
- Disk usage grows by more than ~50 MB while running (the report artifacts
  are small; anything bigger means you are duplicating data).

## Maintenance notes

- Plan 039 consumes `deletion-manifest-*.json` and re-verifies the direct
  reader list live before generating the operator's `rm` script.
- After plan 040 (Effect CLI migration), this command gets mechanically
  migrated with the rest — nothing special about it.
- Re-run the command after every future backfill before any raw cleanup; it
  is idempotent and read-only by construction.
- The static direct-reader list (step 3) is the piece most likely to rot;
  plan 039 includes the live re-verification grep.
