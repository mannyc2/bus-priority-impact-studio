# Plan 109: Delete the dead feature/detector/identity subtrees in packages/* (~7.7K LOC)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Every deletion step begins with a grep gate — if the gate shows an
> importer the plan says should not exist, STOP. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done,
> update the status row in `plans/README.md` (Generation 20 table).
>
> **Drift check (run first)**: `git diff --stat 292d2bd0..HEAD -- packages/analytics/src packages/analytics/test packages/domain/src packages/domain/test packages/db/src packages/db/test packages/studio-api/src tests/harness/month-doctrine.test.ts`
> On any in-scope mismatch with the "Current state" excerpts, STOP.
> `packages/domain` has in-flight gen-19 changes (`src/studio/interventions.ts`,
> `src/studio/public-intervention-*`, `package.json`) — those files are OUT of
> scope here and their presence in the diff is expected.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (many small edits to barrels/manifests; every one is typecheck-caught)
- **Depends on**: none hard; plan 111 depends on THIS plan's step 8 landing first
- **Category**: tech-debt
- **Planned at**: commit `292d2bd0`, 2026-08-01 (dirty tree)
- **Rebaselined 2026-08-01 (advisor)**: execute against main@`90dd5282`
  (PRs #114-#117 merged — the formerly in-flight gen-19 work is now
  committed). Verified against `git diff 292d2bd0..90dd5282`: every deletion
  and edit target in this plan is byte-identical, with ONE exception —
  `packages/domain/package.json` gained 10 export lines for the new
  `public-intervention-*` modules; those lines are OUT of scope, leave them
  (this plan only REMOVES the `./documents`, `./studio/identity`, and
  `./studio/field-provenance` entries). The five files that appear in the
  broad drift diff (`data-products/registry.ts` +1 import,
  `studio/public-intervention-episode-audit.ts`,
  `studio/public-intervention-episodes.ts`, its test,
  `studio-api/src/artifact-resolver.ts` +16) are merged gen-19 additions,
  all outside this plan's targets — expected, not drift. Run the drift check
  against `90dd5282`, not `292d2bd0`.

## Why this matters

`packages/` carries ~7.7K LOC of code from three abandoned generations: the
Tier-2 intervention-records synthesis policy (moved to the separate mta-wiki
repo in 2026-06), the pre-generation-7 detector primitives (the detector
implementations were deleted by plan 061; the scoring/baseline machinery they
sat on survived), and an accounts/auth/alerts surface that was designed
(ADR-0008) but never wired to any HTTP route. All of it typechecks on every
run, several self-referential tests create false coverage confidence, and the
dead exports misrepresent the packages' real API surface.

Repo conventions that apply: packages use NodeNext-style `.js` import
specifiers; each package's `package.json` `exports` map is asserted by shape
tests (e.g. `packages/domain/test/package-shape.test.ts`), so export-map edits
and their test edits land together. `tests/harness/month-doctrine.test.ts`
holds a hardcoded set of file paths (around lines 78-88) that includes
`packages/domain/src/studio/field-provenance.ts` — deleting that file requires
removing its line from the set in the same commit.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Analytics tests | `bun --filter @bp/analytics test` | exit 0 |
| Domain tests | `bun --filter @bp/domain test` | exit 0 |
| DB tests | `bun --filter @bp/db test` | exit 0 |
| Studio-api tests | `bun --filter @bp/studio-api test` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | exit 0 (consumer of analytics) |
| Worker tests | `bun run test:worker` | exit 0 |
| Types | `bun run check:types` | exit 0 |
| Architecture | `bun run check:architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |

Run the full block after steps 6, 9, and 10; the scoped package test after
every step.

## Scope

**In scope**:
- `packages/analytics/src/{interventions/intervention-records.ts,interventions/index.ts,baselines/,core/,concentration.ts,evaluation/scorecard.ts,evaluation/gold-set.ts,evaluation/index.ts,features/,intervention-evidence/spec.ts,intervention-evidence/index.ts}` and matching tests
- `packages/analytics/package.json` (exports map)
- `packages/domain/src/{documents/index.ts,studio/field-provenance.ts,studio/identity/index.ts,studio/index.ts,findings/index.ts}`, `packages/domain/package.json`, `packages/domain/test/{package-shape.test.ts,schemas.test.ts}`
- `packages/db/src/{d1/queries/identity.ts,d1/queries/identity-surfaces.ts,d1/queries/studio-auth.ts,d1/queries/route-timelines.ts,d1/index.ts,local/repositories/findings.ts,local/repositories/tier2-intervention-staging.ts,local/index.ts,shared/}`, `packages/db/package.json`, matching tests
- `packages/studio-api/src/server/testing/index.ts`, `packages/studio-api/package.json`
- `tests/harness/month-doctrine.test.ts` (one line)
- `knowledge/log.md` (append), `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `packages/analytics/src/interventions/{route-treatment-crosswalk.ts,route-treatment-summary.ts}` — LIVE (imported by pipeline inventory/export commands).
- `packages/analytics/src/data-products/**` — live, and `registry.ts` is dirty with in-flight gen-19 work; plan 111 owns its context-event entries.
- `packages/analytics/src/evaluation/{build-route-capability-manifest.ts,build-route-dossier-summary.ts,map-artifacts.ts,route-speed-availability.ts}` — live.
- ALL `packages/db/src/{d1,local}/schema.ts` TABLE definitions and everything under `packages/db/migrations*/` — the generation-17 D1-ledger decision stands; tables stay even where their query layer dies.
- `packages/db/src/local/repositories/findings.ts` functions `upsertContextEvents` and `listContextEventRouteTouchesForWindow` — live until plan 111.
- `packages/studio-api/src/public-api.ts` endpoints — the v1-endpoint retirement is operator-gated (plan 114).
- In-flight gen-19 files listed in the drift-check note.

## Git workflow

- Branch: `advisor/109-packages-dead-code` off landed main (no file overlap
  with the gen-19 branch's dirty set except `plans/README.md`).
- One commit per step, message style: `packages/<pkg>: delete <thing>`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Delete the intervention-records policy (2,995 LOC)

Gate: `grep -rn "processInterventionRecordsToolArgs\|dedupeInterventionRecordsByEvidenceOverlap\|repairInterventionRecordsAliases\|mergeRecordCluster\|backfillStatusHistory" --include="*.ts" apps tools packages tests scripts | grep -v "packages/analytics/src/interventions/i" | grep -v "packages/analytics/test/intervention-records.test.ts"` → no matches.

Delete `packages/analytics/src/interventions/intervention-records.ts` and
`packages/analytics/test/intervention-records.test.ts`. In
`packages/analytics/src/interventions/index.ts`, remove ONLY the first two
export blocks — the `export type {...} from "./intervention-records.js";` block
and the `export {...} from "./intervention-records.js";` block. The
route-treatment-crosswalk and route-treatment-summary blocks stay byte-identical.

**Verify**: `grep -c "intervention-records.js" packages/analytics/src/interventions/index.ts` → `0`; `bun --filter @bp/analytics test` → exit 0; `bun --filter @bp/pipeline-v2 test` → exit 0.

### Step 2: Delete the dead `@bp/domain/documents` barrel (158 LOC)

Gate: `grep -rn "@bp/domain/documents\"" --include="*.ts" apps tools packages tests` → no matches (subpath imports like `@bp/domain/documents/candidates` are fine and expected).

Delete `packages/domain/src/documents/index.ts`; remove the `"./documents"`
entry from `packages/domain/package.json` exports; remove the `"./documents"`
line from `packages/domain/test/package-shape.test.ts` (~line 57).

**Verify**: `bun --filter @bp/domain test` → exit 0.

### Step 3: Delete the three dead package-export stubs (~75 LOC)

Gates (each must return no matches): `grep -rn "server/testing" --include="*.ts" apps tools packages tests | grep -v "packages/studio-api/src/server/testing"`;
`grep -rn "@bp/db/shared\|routeBatchStatuses\|routeBuildPlanStatuses\|routeReadinessStatuses\|routeReliabilityStatuses\|sourceStatusScopes" --include="*.ts" apps tools packages tests | grep -v "packages/db/src/shared"`;
`grep -rn "replaceTier2InterventionStagingRows" --include="*.ts" apps tools packages tests | grep -v "packages/db/src/local"`.

Delete `packages/studio-api/src/server/testing/index.ts`,
`packages/db/src/shared/` (both files),
`packages/db/src/local/repositories/tier2-intervention-staging.ts`. Remove the
matching `package.json` export entries (`"./server/testing"` in studio-api,
`"./shared"` in db) and the barrel re-export lines in
`packages/db/src/local/index.ts`. If any package shape test asserts those
export keys, update it in the same commit.

**Verify**: `bun --filter @bp/db test && bun --filter @bp/studio-api test` → exit 0. Note `tests/harness/production-boundaries.test.ts:555-559` requires every `packages/sources` export target to exist — sources is untouched here, but re-run `bun run check:architecture` to be sure nothing else asserts the removed entries.

### Step 4: Delete `field-provenance.ts` (308 LOC) + its harness pin

Gate: `grep -rn "field-provenance\|studioRouteFieldProvenance\|studioSegmentFieldProvenance" --include="*.ts" --include="*.tsx" apps tools packages | grep -v "packages/domain/src/studio/field-provenance.ts" | grep -v "packages/domain/src/studio/index.ts"` → no matches.

Delete `packages/domain/src/studio/field-provenance.ts`; remove its re-export
block from `packages/domain/src/studio/index.ts` (~lines 22-29); remove the
`./studio/field-provenance` entry from `packages/domain/package.json` (and the
package-shape test line if present); remove the line
`"packages/domain/src/studio/field-provenance.ts",` from the hardcoded path set
in `tests/harness/month-doctrine.test.ts` (~line 82).

**Verify**: `bun --filter @bp/domain test` → exit 0; `bun run check:architecture` → exit 0 (this is the step that fails if the harness line was missed).

### Step 5: Delete the v1 half of `intervention-evidence/spec.ts` (~350 LOC)

Gate: `grep -rn "INTERVENTION_EVIDENCE_SPECS\|interventionEvidenceSpecFor\|validateInterventionEvidenceRegistry\|serializeInterventionRelevanceCoverageMatrix\|INTERVENTION_ANALYSIS_DISPOSITIONS_V1" --include="*.ts" apps tools packages tests | grep -v "packages/analytics/src/intervention-evidence\|packages/analytics/test/intervention-evidence-spec.test.ts"` → no matches.

In `packages/analytics/src/intervention-evidence/spec.ts` (726 lines, two
generations of the same registry), delete everything in the
`InterventionEvidence*` family — the six schemas near lines 14-72, the
`INTERVENTION_EVIDENCE_SPECS` registry (~line 334, one seed member),
`INTERVENTION_ANALYSIS_DISPOSITIONS_V1` (~376), the resolvers near lines
560-600 — keeping the entire `TreatmentRelevance*` family
(`treatmentRelevanceFor` and its types are live externally). The two families
share disposition helpers: read before cutting; a helper used by both stays.
Remove the deleted names from `intervention-evidence/index.ts` and delete the
v1 half of `packages/analytics/test/intervention-evidence-spec.test.ts`.

**Verify**: `bun --filter @bp/analytics test && bun --filter @bp/pipeline-v2 test` → exit 0; `grep -rn "treatmentRelevanceFor" --include="*.ts" tools | head -1` → still has hits (the live half survived).

### Step 6: Delete the pre-gen-7 detector primitives + dead feature modules (2,270 LOC)

This is the big combined step (the two clusters share type edges).

6a. Re-home the two live stragglers: `packages/analytics/src/features/stop-direction-hour-ewt.ts:1-2`
imports `headwayIrregularityRates` from `../baselines/headway.js` and `round`
from `../core/numbers.js`. Copy `headwayIrregularityRates` (with any private
helpers it uses inside `headway.ts`) into `stop-direction-hour-ewt.ts` as
non-exported functions, and replace `round(...)` uses with a local helper.
Remove the two imports.

6b. Gate: `grep -rn "analytics/baselines\|analytics/core\|from \"\.\./baselines/\|from \"\.\./core/" --include="*.ts" packages/analytics/src apps tools packages/db packages/domain packages/studio-api tests` → every remaining hit must be inside a file this step deletes (note: `packages/sources/src/**` has its OWN internal `../core/` — those hits are a different package and do not count).

6c. Delete directories/files: `packages/analytics/src/baselines/` (all 9
files), `packages/analytics/src/core/` (all 8 files),
`packages/analytics/src/concentration.ts`,
`packages/analytics/src/evaluation/scorecard.ts`,
`packages/analytics/src/evaluation/gold-set.ts`.

6d. In `packages/analytics/src/features/`, delete exactly these 13 modules:
`context.ts`, `customer-journey.ts`, `feed-health.ts`, `intervention-panel.ts`,
`intervention.ts`, `positive-deviance.ts`, `reliability.ts`,
`rider-weighted-excess-wait.ts`, `route-direction-daypart.ts`,
`route-month.ts`, `segment-month.ts`, `source-coverage.ts`, `treatments.ts`.
KEEP: `contracts.ts`, `index.ts`, `quality.ts`, `segment-daypart.ts`,
`segment-daypart-speed.ts`, `stop-direction-hour.ts`,
`stop-direction-hour-ewt.ts`, `route-metric-history.ts`. Before deleting each
of the 13, gate it: `grep -rn "<basename-without-ext>" --include="*.ts" apps tools packages tests | grep -v packages/analytics` → no matches.

6e. Prune the barrels and manifests: `features/index.ts` and `evaluation/index.ts`
lose the deleted entries; `packages/analytics/package.json` loses the
`./baselines` and `./core` export entries (and any others that now point at
deleted files); prune the `FEATURE_CONTRACTS` array in `features/contracts.ts`
to only the grains that still have modules (the `context_source_month` entry —
whose `resolverId: "sqlite.local_context_event_route_touch.month.v1"` is
declared but implemented nowhere — goes here too).

6f. Delete the 9 dead tests: `packages/analytics/test/{architecture,evaluation,concentration,headway-baselines,runtime-baselines,trend-baselines,context-intervention-gates,gold-set,feature-contracts}.test.ts`.

**Verify**: `bun --filter @bp/analytics test && bun --filter @bp/pipeline-v2 test && bun run check:types` → all exit 0.

### Step 7: Follow-on — delete `@bp/domain/findings` if step 6 freed it (~920 LOC)

Gate: `grep -rn "@bp/domain/findings\|domain/src/findings" --include="*.ts" apps tools packages tests | grep -v "packages/domain/src/findings\|packages/domain/test"` → MUST return no matches. If it returns matches, SKIP this step and record the importers in the PR description.

Delete `packages/domain/src/findings/index.ts`, its `package.json` export
entry, its package-shape test line, and any `schemas.test.ts` cases that only
exercise findings schemas.

**Verify**: `bun --filter @bp/domain test && bun run check:types` → exit 0.

### Step 8: Prune the dead detector half of the local findings repository (~350 LOC)

Gate: `grep -rn "insertFindingCandidate\|insertFindingEvidenceLinks\|insertCoverageAudit\|listCandidatesByRoute\|listEvidenceForCandidate\|replaceFindingsForMonth\|replaceFindingRun" --include="*.ts" apps tools packages tests | grep -v "packages/db/src/local\|packages/db/test/local-findings.test.ts"` → no matches.

In `packages/db/src/local/repositories/findings.ts`, delete those eight
functions and their `local/index.ts` re-exports. KEEP `upsertContextEvents`
and `listContextEventRouteTouchesForWindow` (plan 111 owns their removal).
Trim `packages/db/test/local-findings.test.ts` to the context-event cases.
Do NOT touch any `local_finding_*` table definition in `schema.ts`.

**Verify**: `bun --filter @bp/db test` → exit 0.

### Step 9: Delete the D1 route-timelines query module (263 LOC)

Gate 1: `grep -rn "getRouteTimelineIndex\|listRouteTimelineIndex" --include="*.ts" apps tools packages tests | grep -v "route-timelines"` → no matches.
Gate 2 (confirm the live endpoint doesn't need it): `grep -n "timeline" packages/studio-api/src/studio/read-handlers.ts | head -20` → the `/routes/:routeId/timeline` path serves via artifact loading, with no import from `d1/queries/route-timelines`.

Delete `packages/db/src/d1/queries/route-timelines.ts`,
`packages/db/test/route-timelines.test.ts`, and the two re-export lines in
`packages/db/src/d1/index.ts` (~lines 114-115).

**Verify**: `bun --filter @bp/db test && bun run test:worker` → exit 0.

### Step 10: Delete the unwired identity/auth/alerts surface (~945 LOC)

Gate: `grep -rn "magicLink\|savedSearch\|publicComment\|issueSession\|IdentityMeResponse\|AdminGrantOperatorRequest" --include="*.ts" --include="*.tsx" apps/web/src packages/studio-api/src tools` → no matches (planning-time verified).

Delete `packages/db/src/d1/queries/identity.ts` (342),
`packages/db/src/d1/queries/identity-surfaces.ts` (395),
`packages/db/src/d1/queries/studio-auth.ts` (48),
`packages/domain/src/studio/identity/index.ts` (164). Strip their re-export
lines from `packages/db/src/d1/index.ts` (~lines 26, 32, 43, 128, 129) and
from `packages/domain/src/studio/index.ts`; drop `./studio/identity` from
`packages/domain/package.json` (+ shape test). Leave `packages/db/src/d1/schema.ts`
tables (`studioActor`, `studioActorToken`, identity/session/alert tables) and
ALL migrations untouched — production D1 contains rows in these tables, and
data outlives code by design here. Leave the `route.auth.kind === "session"`
branch in `packages/studio-api/src/api.ts` alone if removing it requires
touching route-registry types; note it in the PR instead.

**Verify**: `bun --filter @bp/db test && bun --filter @bp/domain test && bun --filter @bp/studio-api test && bun run test:worker && bun run check:types` → all exit 0.

### Step 11: Full gate + bookkeeping

`bun run check:types && bun run check:architecture && bun run check:style && bun run test` → all exit 0. Append one dated `knowledge/log.md` entry; set this plan's README row DONE.

## Test plan

No new tests. Deleted tests are all self-referential (they exercised only code
deleted with them — `architecture.test.ts` existed to assert the dead helpers
exist). The regression net is each step's scoped package suite plus the final
full `bun run test`, `check:types` (catches any missed barrel/manifest line),
and `check:architecture` (catches the month-doctrine path-set edit and any
export-map assertion).

## Done criteria

- [ ] Every file named in steps 1-10 deleted or edited as specified
- [ ] `bun run check:types` exits 0
- [ ] `bun run test` exits 0
- [ ] `bun run check:architecture` exits 0 (month-doctrine set edited; no stale export assertions)
- [ ] `grep -rn "intervention-records.js\|@bp/domain/documents\"\|field-provenance\|analytics/baselines\|analytics/core" --include="*.ts" apps tools packages tests | grep -v "packages/sources"` → no matches
- [ ] `packages/analytics/src/interventions/{route-treatment-crosswalk,route-treatment-summary}.ts` are byte-unchanged (`git diff --stat` clean for both)
- [ ] No `schema.ts` table definition or `migrations*/` file modified
- [ ] `plans/README.md` row updated; `knowledge/log.md` entry appended

## STOP conditions

- Any step's gate grep returns an unexpected importer.
- Step 6's re-homing breaks `bun --filter @bp/analytics test` twice after a
  reasonable fix attempt.
- Step 7's gate shows `@bp/domain/findings` still has live importers — skip
  the step and report (do not force it).
- `check:architecture` fails on anything other than the two expected edits
  (month-doctrine path set, export-map assertions).
- You find yourself wanting to edit `packages/analytics/src/data-products/registry.ts`
  — that file is plan 111's scope and is carrying in-flight work; STOP.

## Maintenance notes

- Plan 111 (dead observation chain) deletes `upsertContextEvents` /
  `listContextEventRouteTouchesForWindow` and the data-products registry
  entries; it assumes this plan's step 8 already landed.
- The identity D1 tables remain with no query layer. If an account feature is
  ever revived, regenerate the query layer from `schema.ts` rather than
  resurrecting the deleted files — ADR-0008 remains the design record.
- `packages/studio-api/src/api.ts`'s session-auth branch is now provably dead
  code (no route declares `session` auth); fold its removal into the next
  studio-api change that touches route types.
- Not planned, recorded: the four near-duplicate `schema-decode` helper copies
  (analytics/studio-api/pipeline/web-test) drifted apart and deserve a single
  `@bp/domain` home someday — a refactor, not a deletion; keep it out of
  cleanup PRs.
