# Plan 039: Deprecate the raw-JSON snapshot layer (stop duplicate writes + operator deletion runbook)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ce3baca..HEAD -- tools/pipeline-v2/src/lib/socrata-monthly-ingest.ts tools/pipeline-v2/src/lib/source-snapshots.ts tools/pipeline-v2/src/commands/ingest knowledge/wiki/engineering/package_structure.md data/README.md`
> On drift, compare "Current state" excerpts against live code; mismatch = STOP.
>
> **You never delete data.** The executor's deliverables are code changes +
> a generated deletion script. Running that script is operator-only.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (removing snapshot writes changes ingest outputs; gated by
  plan 038's verdicts and fixture tests)
- **Depends on**: plans/038-raw-snapshot-coverage-gate.md (its
  `deletion-manifest-*.json` must exist and be non-trivial)
- **Category**: tech-debt
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

Every Socrata monthly ingest writes its rows twice: normalized into the
canonical 170 GB SQLite, then verbatim as a raw JSON snapshot under
`data/raw/`. That layer has grown to ~182 GB / hundreds of thousands of
files, repeatedly filling the disk (91% full today). Once plan 038 proves a
family is fully represented in SQLite, the duplicate write is pure waste and
the accumulated files are reclaimable. This plan (1) stops the duplicate
writes for verified families, (2) turns plan 038's manifest into an
operator-run deletion script, and (3) updates the data-directory doctrine so
the layer doesn't regrow.

Re-fetchability matters to the tradeoff: the raw layer's residual value was
"re-normalize without re-fetching". The sources are public APIs (Socrata,
MTA, DOT); a month can be re-pulled by the same ingest command (they are
idempotent per month: `replaceRows` replaces that month's rows). The
operator has accepted that trade; do not re-litigate it, but the STOP
conditions protect the families where it is false.

## Current state

Verified 2026-07-04 at commit `ce3baca`; re-verify the excerpts.

**The duplicate write** — `tools/pipeline-v2/src/lib/socrata-monthly-ingest.ts:95-107`:

```ts
await config.replaceRows({ local: inputs.local, isoMonth: monthKey, rows });
await writeRawSourceSnapshot({
  path: rawPath,
  sourceId,
  extra: { isoMonth: monthKey },
  fetchedAt,
  query: { grain: config.queryGrain, month: monthKey },
  rows: rawRows,
});
return { rawPath, isoMonth: monthKey, rowCount: rows.length, ... };
```

`SocrataMonthlyIngestConfig` carries `rawDir`/`rawFilePrefix` and the result
type exposes `rawPath` (`socrata-monthly-ingest.ts:26-34`). Direct callers
of `writeRawSourceSnapshot` besides this lib (15 files under
`commands/ingest/`, verified list in plan 038's "Current state").

**Direct raw readers** (block families from write-removal AND deletion):
`commands/studio/release.ts`, `commands/studio/route-treatment-summary.ts`,
`commands/pull/gtfs-rt-r2-run.ts`, `commands/collect/gtfs-rt.ts`,
`commands/audit/data-product-completeness.ts`,
`packages/analytics/src/data-products/registry.ts` (manifest path templates).

**Known orphan for the runbook** (not raw, but same reclaim motion):
`data/artifacts/docs` — 51 GB; its producer (Tier 2 docs pipeline) was
deleted 2026-07-03 (`7f5c3d9`); repo-wide the only reference is inside the
plan-037 deletion set (verified 2026-07-04).

**Doctrine to update**:
`knowledge/wiki/engineering/package_structure.md` § "Local data directory
contract" currently blesses `data/raw/` as "Durable source snapshots …
standard gitignored home for raw artifacts we may need to re-import or audit
later", and `data/README.md` says "Full source downloads belong here". Both
need the post-deprecation contract.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Coverage gate artifact | `ls data/artifacts/raw-deprecation/deletion-manifest-*.json` | at least one file |
| Re-run gate | `bun --filter @bp/pipeline-v2 cli -- audit raw-snapshot-coverage` | exit 0 |
| Typecheck pipeline | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| One fixture-backed ingest | `bun --filter @bp/pipeline-v2 test -- ingest` (or the ingest tests' actual filter; check `tools/pipeline-v2/test/commands/ingest/`) | all pass |
| Knowledge check | `bun run check:knowledge` | exit 0 |

## Scope

**In scope**:
- `tools/pipeline-v2/src/lib/socrata-monthly-ingest.ts` (remove the
  snapshot write + `rawPath` plumbing)
- `tools/pipeline-v2/src/lib/source-snapshots.ts` (delete if it ends with
  zero callers; keep if constrained families still call it)
- `commands/ingest/*.ts` — ONLY the `writeRawSourceSnapshot` call sites for
  families verdicted `INGESTED` in the manifest, and their result-shape
  fallout
- Their tests under `tools/pipeline-v2/test/`
- New generated script `scripts/reclaim-raw-json.sh` (generator code lives
  in the plan-038 lib or a small `commands/export/raw-deletion-script.ts`;
  pick the simpler and say which in your report)
- `knowledge/wiki/engineering/package_structure.md` (data contract section),
  `data/README.md`, `knowledge/log.md` (one entry)

**Out of scope**:
- Families verdicted `PARTIAL`, `RAW-ONLY`, `OPAQUE`, or `CONSTRAINED` —
  their writes stay; their files stay.
- `commands/collect/gtfs-rt.ts` / `pull/gtfs-rt-r2-run.ts` capture paths —
  raw GTFS-RT protobuf capture is canonical capture, not duplication.
- Re-architecting ingest (no new abstraction; you are deleting a write).
- Running the deletion script. Never. Operator-only.
- `data/ops/` ledgers.

## Git workflow

- Branch: `plan/039-json-layer-deprecation`; no push unless asked.

## Steps

### Step 1: Re-verify the gate and freeze the family list

Run `bun --filter @bp/pipeline-v2 cli -- audit raw-snapshot-coverage`. Read
the newest `deletion-manifest-*.json`. Record in your working notes the
family list with verdict `INGESTED` — call it F. Live-re-verify the direct
reader list:

```bash
rg -ln "data/raw" tools/pipeline-v2/src packages --glob '!node_modules'
```

Every hit must be either (a) an ingest command for its own family, (b) a
known constrained reader (list in Current state), or (c) plan-038's own
lib. A new unexplained reader = STOP.

**Verify**: F is non-empty and every family in F has zero non-ingest readers.

### Step 2: Remove the duplicate write from the shared monthly-ingest lib

In `socrata-monthly-ingest.ts`:
- Delete the `writeRawSourceSnapshot` call and the `rawPath` computation
  (`lines 73-75, 100-107` in the current file).
- Remove `rawDir`/`rawFilePrefix`/`snapshotPath` from the config/input types
  and `rawPath` from the result type; fix all `defineSocrataMonthlyIngest`
  call sites (they are ingest commands for monthly Socrata families) and
  their tests. If a command's summary output printed `rawPath`, print the
  `isoMonth` + `rowCount` only.

EXCEPTION: if any `defineSocrataMonthlyIngest` caller's family is NOT in F,
do not convert that caller — instead keep an explicit opt-in: add
`rawSnapshot: { dir, filePrefix } | undefined` to the config, default
undefined, and set it ONLY for non-F families. If all monthly-ingest
families are in F, skip the option entirely (simplest code wins).

**Verify**: `bun --filter @bp/pipeline-v2 typecheck` → exit 0; ingest
fixture tests pass; `rg -n "rawPath" tools/pipeline-v2/src/lib/socrata-monthly-ingest.ts` → empty (or only inside the opt-in branch).

### Step 3: Remove per-command snapshot writes for F families

For each of the 15 direct `writeRawSourceSnapshot` callers under
`commands/ingest/`: if its family ∈ F, delete the call + now-unused
imports/locals; if not, leave it. Then check
`rg -l "writeRawSourceSnapshot" tools/pipeline-v2/src` — if only
`source-snapshots.ts` remains, delete that file too and its import in the
Effect filesystem service coverage note (ADR-0019 mentions raw source
snapshot writes among `PipelineFileSystemService` consumers — no ADR edit
needed; it is historical).

**Verify**: typecheck + `bun --filter @bp/pipeline-v2 test` all pass.

### Step 4: Generate the operator deletion runbook

Write the generator that turns the newest `deletion-manifest-*.json` into
`scripts/reclaim-raw-json.sh`:
- Header comment: generated date, manifest filename, total bytes, and
  "OPERATOR-RUN ONLY — review before executing".
- One `rm -rf -- '<path>'` per manifest entry, each preceded by a comment
  line with family + bytes + evidence one-liner.
- Append the independently-verified orphan:
  `data/artifacts/docs` (51 GB) with its evidence comment.
- End with `df -h /mnt/models` so the operator sees the result.
- The script must `set -euo pipefail` and REFUSE to run if
  `data/local/pipeline.sqlite` is smaller than 100 GB (sanity tripwire that
  the canonical store is present):
  `[ "$(stat -c%s data/local/pipeline.sqlite)" -gt 100000000000 ] || { echo "canonical sqlite missing/small; abort"; exit 1; }`

Do NOT execute it. Chmod +x is fine.

**Verify**: `bash -n scripts/reclaim-raw-json.sh` → exit 0 (syntax only);
script contains one rm line per manifest entry (`grep -c "rm -rf" ...`
equals manifest length + 1 for the docs orphan).

### Step 5: Update the doctrine

- `knowledge/wiki/engineering/package_structure.md` § "Local data directory
  contract": rewrite the `data/raw/` row to: durable home ONLY for
  non-re-fetchable captures (GTFS-RT protobuf capture runs, third-party
  handoffs, bulk archives pending classification); monthly Socrata source
  rows live canonically in `data/local/pipeline.sqlite`; re-pull via the
  ingest commands is the recovery path. Add a line dating the change and
  pointing at plans 038/039.
- `data/README.md`: same contract in two sentences.
- `knowledge/log.md`: one dated entry (match existing format): raw JSON
  snapshot layer deprecated for SQLite-verified families; deletion runbook
  generated; operator executes reclaim.

**Verify**: `bun run check:knowledge` → exit 0.

### Step 6: Full gate

**Verify**:
- `bun --filter @bp/pipeline-v2 typecheck` && `bun --filter @bp/pipeline-v2 test` → green
- `bun run test:unit` → all pass
- `bun run check:web-architecture` → all pass
- `find data/raw -newer package.json -type f | head` → empty (you wrote no
  raw files); `git status` shows only in-scope changes
- Report to the operator: family list F, expected reclaim bytes (sum from
  manifest + 51 GB docs orphan), and the runbook path.

## Test plan

- Update existing ingest fixture tests to assert NO raw file is written
  (assert on the temp dir contents after a fixture ingest run — model on the
  current ingest tests' fixture setup under `tools/pipeline-v2/test/`).
- New unit test for the runbook generator: manifest fixture → script text
  contains expected rm lines, tripwire, and no paths outside `data/`.
- Keep one test exercising the opt-in raw write if step 2's exception path
  was used.

## Done criteria

- [ ] `rg -l "writeRawSourceSnapshot" tools/pipeline-v2/src/commands/ingest` returns only non-F families (or nothing)
- [ ] Monthly ingest result types no longer expose `rawPath` (or only via the explicit opt-in)
- [ ] `scripts/reclaim-raw-json.sh` exists, passes `bash -n`, contains the sqlite tripwire, and was NOT executed (`df` unchanged; `du -sh data/raw` unchanged)
- [ ] Wiki data contract + data/README + knowledge/log updated; `check:knowledge` green
- [ ] All pipeline tests + `test:unit` + `check:web-architecture` green
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 038's manifest is missing, empty, or every family is `PARTIAL`/worse
  — there is nothing safe to deprecate; report the coverage gaps instead.
- Step 1 finds a `data/raw` reader not in the known list.
- An ingest fixture test fails because the test itself asserted on the raw
  snapshot as its oracle — rewrite that test to assert on SQLite rows
  instead; if the SQLite rows are NOT equivalent evidence (normalization is
  lossy for that family), that family must leave F; report it.
- You are tempted to run the reclaim script "just on one small family" — no.
- `studio release` or `route-treatment-summary` turn out to read a file
  inside an F family (step 1 missed it) — remove that family from F, report.

## Maintenance notes

- Operator: after running `scripts/reclaim-raw-json.sh`, re-run
  `audit raw-snapshot-coverage` — every reclaimed family should now report
  raw bytes ≈ 0 and verdict INGESTED (sqlite side unchanged). Keep the
  manifest + script in git history as the audit trail.
- Future ingests for F families write only to SQLite; if a new source needs
  a raw capture (protobuf, PDFs), it must justify a `data/raw/<family>/`
  entry in the wiki data contract.
- Plan 040 rewrites these commands' CLI wrappers; the handler bodies edited
  here are orthogonal (040 touches the `defineCommand` shell).
- The `socrata-partitioned/` 142 GB is classifiable via its per-run
  partition manifests and year-bearing sourceId dir names (see plan 038's
  layout note) — the single biggest remaining prize; the operator can order
  the follow-up deletion wave once 038's report verdicts its datasets.
- Known accumulation gap (deliberately NOT fixed here — named follow-up):
  partitioned chunk downloads are skip-if-exists
  (`lib/http-file-download.ts:147-156`), so re-running a backfill with a
  narrower date range strands the out-of-range chunks forever; nothing
  prunes them. If the operator wants it fixed, a small `--prune` option on
  `ingest socrata-partitioned-csv-snapshot` (delete chunks outside the
  requested range, opt-in) is the shape.
- Deferred HIGH-risk follow-up (do not fold in): re-pointing
  `commands/studio/_release-geometry.ts:741-742` (and
  `route-treatment-summary.ts:34-35`) from the `data/raw/network/*.json`
  snapshots to SQLite (`local_gtfs_static_route` + `local_route_shape_geom`
  + `local_gtfs_static_stop`) would free the `network/` family and possibly
  `route-slices/`, but it rebuilds release-time geometry and must prove
  byte-parity of published artifacts. That is its own plan if the operator
  wants it; until then those families stay CONSTRAINED.
