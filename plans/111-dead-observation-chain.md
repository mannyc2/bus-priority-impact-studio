# Plan 111: Delete the dead observation chain — geocode → context-events → parking matches → route-treatment-summary (~4.7K LOC)

> **Executor instructions**: Follow this plan step by step. This is the one
> code-deletion plan with real cross-tree coordination; its gates are not
> optional. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row in `plans/README.md`
> (Generation 20 table).
>
> **Drift check (run first)**: `git diff --stat 292d2bd0..HEAD -- tools/pipeline-v2/src/commands/geocode tools/pipeline-v2/src/commands/build tools/pipeline-v2/src/commands/studio/route-treatment-summary.ts tools/pipeline-v2/src/lib/geocoder.ts tools/pipeline-v2/src/lib/local-db-aggregates packages/analytics/src/data-products packages/db/src/local/repositories/findings.ts packages/sources/src/clients/geoclient`
> This plan REQUIRES the gen-19 branch (`ops/gen18-artifact-publication`) to be
> merged first — it edits `packages/analytics/src/data-products/registry.ts`
> and `tools/pipeline-v2/test/cli/registry.test.ts`, both dirty in that branch.
> If `git status` shows either file modified-uncommitted, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 108 (registry-count baseline) and 109 (step 8) landed; gen-19 branch merged
- **Category**: tech-debt
- **Planned at**: commit `292d2bd0`, 2026-08-01

## Why this matters

A long pipeline — six geocode commands (NYC Geoclient API), context-event
builders, a parking-violation matcher, and the `studio route-treatment-summary`
artifact command — computes local SQLite tables and one artifact that reach no
published manifest, no D1 export, and no served surface. Its terminal consumer
chain is declared only in data-product registry METADATA (strings like
"Studio intervention timeline"), not in code. It is ~4.7K LOC carrying an
external API dependency and its credential surface, and its completeness
accounting is wired so the breakage of deleting it wrong would be silent —
which is why this plan exists as a single coordinated unit instead of five
independent deletions.

Verified chain facts:

- `packages/analytics/src/features/contracts.ts` declared
  `resolverId: "sqlite.local_context_event_route_touch.month.v1"` — a resolver
  that was never implemented or dispatched anywhere (plan 109 step 6 already
  pruned that contract entry).
- `packages/db/src/local/repositories/findings.ts` —
  `listContextEventRouteTouchesForWindow`'s only callers are two test
  assertions (`packages/db/test/local-findings.test.ts:118,182`).
- The `studio route-treatment-summary` COMMAND
  (`tools/pipeline-v2/src/commands/studio/route-treatment-summary.ts`, 325 LOC)
  writes `data/artifacts/studio/v2/route-treatment-summary/` (one stale month,
  2026-03, predating the current release line). The key appears in no publish
  manifest (`src/commands/publish/publish-artifact-keys.ts`), no D1 export
  (`src/commands/export/d1-inputs.ts`), and no serving read
  (`packages/studio-api/src`, `apps/web/src`). The analytics LIBRARY
  `route-treatment-summary.ts` is NOT dead (live via the Plan 091 inventory
  exporter) and is out of scope.
- Data-product registry: `packages/analytics/src/data-products/registry.ts`
  registers `local_context_event_route_touches_history` (producer
  `build context-event-route-touches`) and `route_treatment_summary_artifact`
  (producer `studio route-treatment-summary`, requiredInput
  `local_context_event_route_touches_history`).
- **The silent-failure wiring**: `local_context_event` and
  `local_parking_violation_match` are entries in
  `DATA_PRODUCT_REQUIRED_INPUT_EXTERNAL_REFS`
  (`packages/analytics/src/data-products/completeness.ts:426-455`), so the
  completeness audit resolves them as `external` and will NOT flag their
  absence. Deleting the chain without removing these entries leaves the audit
  green over a hole.
- **The parking write-path mystery, solved** (do not re-investigate): the
  drizzle constant `localParkingViolationMatch`
  (`packages/db/src/local/schema.ts:957`) is orphaned because
  `tools/pipeline-v2/src/lib/local-db-aggregates/parking-violation-matches.ts`
  writes the table via RAW SQL — `sqlite.exec("DELETE FROM local_parking_violation_match")`
  at line 142 and `INSERT INTO local_parking_violation_match` at line 381.
  Deleting the lib removes the only writer. The schema CONSTANT still stays
  (tables outlive code; migrations are untouchable).
- The ingest commands that FEED geocoding (`ingest 311-service-requests`,
  `nypd-collisions`, `dot-street-permits`, `dot-traffic-*`,
  `parking-violations`) independently back the source-coverage ledger
  (`src/lib/local-db-aggregates/source-coverage.ts:182-190`) and STAY.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | exit 0 |
| Analytics tests | `bun --filter @bp/analytics test` | exit 0 |
| DB tests | `bun --filter @bp/db test` | exit 0 |
| Sources tests | `bun --filter @bp/sources test` | exit 0 |
| Completeness audit | `bun run pipeline -- audit data-product-completeness` | exit 0, no missing-table errors |
| Types / arch / style | `bun run check:types && bun run check:architecture && bun run check:style` | exit 0 |

## Scope

**In scope**:
- `tools/pipeline-v2/src/commands/geocode/` (all 6: `311.ts`, `permits.ts`, `nypd-collisions.ts`, `traffic-speeds.ts`, `traffic-volumes.ts`, `parking-violations.ts`)
- `tools/pipeline-v2/src/lib/geocoder.ts`, `tools/pipeline-v2/test/commands/geocode-boundary.test.ts`
- `tools/pipeline-v2/src/commands/build/{context-events.ts,context-event-route-touches.ts,parking-violation-matches.ts}`
- `tools/pipeline-v2/src/lib/local-db-aggregates/{context-events.ts,context-event-route-touches.ts,parking-violation-matches.ts}` (+ `parking-location.ts` ONLY if its gate passes)
- `tools/pipeline-v2/src/lib/local-db-aggregates/index.ts` (barrel prune)
- `tools/pipeline-v2/src/commands/studio/route-treatment-summary.ts` + `tools/pipeline-v2/test/commands/studio/route-treatment-summary.test.ts`
- `tools/pipeline-v2/src/lib/raw-deprecation.ts` (the route-treatment-summary reader entry, ~line 235)
- `tools/pipeline-v2/test/cli/registry.test.ts` (remove 10 command entries; decrement count by 10)
- `packages/analytics/src/data-products/registry.ts` (two product entries) and `completeness.ts` (two external-ref entries)
- `packages/db/src/local/repositories/findings.ts` (`upsertContextEvents`, `listContextEventRouteTouchesForWindow`), `packages/db/src/local/index.ts`, `packages/db/test/local-findings.test.ts`
- `packages/sources/src/clients/geoclient/` + `packages/sources/test/nyc-geoclient.test.ts` + `packages/sources/package.json` export entries (ONLY if the step-5 gate passes)
- `knowledge/log.md` (append), `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `packages/analytics/src/interventions/route-treatment-summary.ts` (the
  LIBRARY — live) and `route-treatment-summary-rows.ts`'s
  `loadRouteInterventionInventoryLocalDbRows` (live via
  `studio export-route-intervention-inventory`; delete only the
  summary-artifact-specific loader if the two are separable — read first).
- ALL ingest commands and `source-coverage.ts`.
- Any `schema.ts` table definition; anything under `migrations*/`.
- Anything under `data/` — the stale `route-treatment-summary/2026-03` artifact
  dir on local disk is untracked operator data; leave it.
- `corridor` commands (live: D1 export → `public-api.ts:846`).

## Git workflow

- Branch: `advisor/111-dead-observation-chain` off landed main AFTER gen-19
  merges. One commit per step. Message style `pipeline-v2: delete <thing>` /
  `packages/analytics: drop <thing>`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Operator confirmation gate

Post (or have the operator confirm in the PR description): "The
`route_treatment_summary_artifact` data product and its
`downstreamConsumers: ["Studio intervention timeline", "route evidence panels",
"data notes"]` registry strings are descriptive metadata for an artifact that
never reached serving; delete the producer chain." Without this recorded
confirmation, STOP. (The registry strings are the one place a reader could
believe this chain feeds production; the code trace says it does not, but the
operator owns the final read.)

### Step 2: Delete the route-treatment-summary command

Gate: `grep -rn "route-treatment-summary" --include="*.ts" packages/studio-api/src apps/web/src tools/pipeline-v2/src/commands/publish tools/pipeline-v2/src/commands/export` → no matches (the analytics-library imports inside `route-intervention-inventory.ts` and the command being deleted do not count and will not appear under these paths).

Delete the command + its test; remove its reader entry from
`raw-deprecation.ts` (~line 235); remove `"route-treatment-summary"` from the
`studio` array in `test/cli/registry.test.ts` and decrement the count by 1.
Then remove the `route_treatment_summary_artifact` product entry from
`packages/analytics/src/data-products/registry.ts`.

**Verify**: `bun --filter @bp/pipeline-v2 test && bun --filter @bp/analytics test` → exit 0.

### Step 3: Delete the context-event layer

Delete `commands/build/{context-events.ts,context-event-route-touches.ts}` and
`lib/local-db-aggregates/{context-events.ts,context-event-route-touches.ts}`;
prune their ~40 symbols from the `local-db-aggregates/index.ts` barrel; remove
`"context-events"` and `"context-event-route-touches"` from the `build` array
in the registry test (count −2). Remove the
`local_context_event_route_touches_history` product entry from
`registry.ts`, and delete `local_context_event` from the
`DATA_PRODUCT_REQUIRED_INPUT_EXTERNAL_REFS` array in `completeness.ts`.
In `packages/db`: delete `upsertContextEvents` and
`listContextEventRouteTouchesForWindow` from
`local/repositories/findings.ts` (their live consumers died in this step),
their `local/index.ts` re-exports, and the remaining context-event cases in
`local-findings.test.ts` (if the file is now empty, delete it).

**Verify**: `bun --filter @bp/pipeline-v2 test && bun --filter @bp/db test && bun --filter @bp/analytics test` → exit 0; `bun run pipeline -- audit data-product-completeness` → exit 0 with no reference to `local_context_event`.

### Step 4: Delete the parking-violation matcher

Delete `lib/local-db-aggregates/parking-violation-matches.ts` and
`commands/build/parking-violation-matches.ts`; prune the barrel; remove
`"parking-violation-matches"` from the `build` array (count −1); delete
`local_parking_violation_match` from the external-refs array in
`completeness.ts`. Then gate `parking-location.ts`:
`grep -rn "parking-location" --include="*.ts" tools packages | grep -v "lib/local-db-aggregates/parking-location.ts"` → if no matches, delete it too; if matches, keep and list them in the PR.

**Verify**: same three suites + completeness audit → exit 0.

### Step 5: Delete the geocode layer

Gate: `grep -rn "geocoder\|geoclient" --include="*.ts" tools/pipeline-v2/src | grep -v "src/commands/geocode/\|src/lib/geocoder.ts"` → no matches.

Delete all six `commands/geocode/*.ts`, `lib/geocoder.ts`, and
`test/commands/geocode-boundary.test.ts`; remove the entire `geocode` group
from the registry test (count −6). Then gate the sources client:
`grep -rn "clients/geoclient\|@bp/sources/geoclient\|normalizeStreetName\|parseHouseAddress\|canonicalBoroughCode" --include="*.ts" apps tools packages | grep -v "packages/sources/src/clients/geoclient\|packages/sources/test"` → if no matches, delete `packages/sources/src/clients/geoclient/` and
`packages/sources/test/nyc-geoclient.test.ts`, and remove the geoclient
entries from `packages/sources/package.json`'s exports map (the
production-boundaries harness at `tests/harness/production-boundaries.test.ts:555-559`
requires every export target to resolve — the export-map edit is mandatory,
not optional). If the gate shows matches, keep the client and record why.

**Verify**: `bun --filter @bp/pipeline-v2 test && bun --filter @bp/sources test && bun run check:architecture` → exit 0.

### Step 6: Full gate + bookkeeping

`bun run check:types && bun run test && bun run check:architecture && bun run check:style && bun run pipeline -- audit data-product-completeness` → all exit 0. Registry test count is exactly 10 lower than its post-108 value. Append a
dated `knowledge/log.md` entry; set this plan's README row DONE.

## Test plan

No new tests; the deleted tests covered only deleted code. The load-bearing
verification is the completeness audit running green AFTER the external-refs
entries are removed — that proves no surviving product declares the deleted
tables as inputs.

## Done criteria

- [ ] All chain files deleted; barrels/manifests pruned; registry test −10
- [ ] `registry.ts` has no `local_context_event_route_touches_history` or `route_treatment_summary_artifact` entries; `completeness.ts` external-refs has no `local_context_event` or `local_parking_violation_match`
- [ ] `bun run test`, `check:types`, `check:architecture`, `check:style` all exit 0
- [ ] `bun run pipeline -- audit data-product-completeness` exits 0
- [ ] No `schema.ts` or `migrations*/` change; `packages/analytics/src/interventions/route-treatment-summary.ts` byte-unchanged
- [ ] Step-1 operator confirmation recorded
- [ ] `plans/README.md` row updated; `knowledge/log.md` entry appended

## STOP conditions

- Step-1 confirmation not obtainable.
- Any gate grep returns an unexpected importer.
- The completeness audit fails or names a deleted table after the edits — the
  registry model has drifted from this plan's excerpts.
- `route-intervention-inventory.ts` or `export-route-intervention-inventory.ts`
  breaks — you cut into the live inventory path; restore and report.
- The sources-geoclient gate is ambiguous (hits in comments only, etc.) —
  keep the client, note it, move on.

## Maintenance notes

- After this plan, `MTA_GEOCLIENT`-style credentials (if any are configured in
  local `.env` files) have no consumer — the operator can retire them.
- The `localParkingViolationMatch` / `localContextEvent*` /
  `local_finding_*` schema constants remain (tables outlive code). If a future
  schema-consolidation migration is ever commissioned, they are the candidates
  — but that requires new local migrations, which is its own decision.
- If a future feature wants context-event joins (311/permits/collisions vs
  routes), git history has the whole chain; the honest restart is a new plan
  with a served consumer named FIRST.
