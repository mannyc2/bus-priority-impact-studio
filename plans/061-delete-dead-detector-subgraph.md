# Plan 061: Delete the dead detector/calibration subgraph in packages/analytics

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4c1afe7..HEAD -- packages/analytics tools/pipeline-v2/src packages/studio-api/src`
> This plan was written on a dirty tree (gen-6 plan 048 execution was
> uncommitted), so compare the "Current state" excerpts against the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: tech-debt (dead code)
- **Planned at**: commit `4c1afe7`, 2026-07-06
- **Operator decision**: deletion explicitly authorized 2026-07-06
  ("Delete now") after the liveness trace below was presented.

## Why this matters

`packages/analytics` carries ~13,100 LOC of detector, calibration-policy,
registry, and corpus code that nothing in the live pipeline or serving path
invokes. It is the residue of the 2026-06 detector-calibration program
(ADR-0018): the Tier 2 pipeline that ran these detectors was deleted in
plan 024, and the route-page "insights" that mention detectors are served
from a **static Phase-B readiness artifact** — no code in this subgraph
executes to produce them. Every audit, typecheck, and schema migration pays
for this code; deleting it is the single biggest LOC reduction available
and shrinks the surface of the later Effect Schema migration (plan 066).
The story the code tells is preserved by git history, ADR-0018, and the
readiness artifacts under `data/artifacts/analytics-detector-readiness/`.

## Current state

Liveness was traced import-by-import on 2026-07-06. The live pipeline
imports ONLY these analytics subpaths (verified via
`rg 'from "@bp/analytics' tools/pipeline-v2/src packages apps`):
`/hotspots`, `/public-route-visibility`, `/route-score`, `/features`,
`/feature-history`, `/interventions`, `/data-products`, `/artifacts`,
`/evaluation`, `/baselines` (via internal chains), `/core` (via internal
chains). **Nothing outside `packages/analytics` imports** `/findings`
(there is no such subpath — findings is only reachable via the root
barrel), the root barrel `"."`, `/registry`, `/calibration`, `/detectors`,
or `/corpus`.

The one root-barrel "importer" is a string assertion that the barrel is
NOT used — `tools/pipeline-v2/test/commands/route/brief-model.test.ts:33-34`:

```ts
expect(source).not.toContain('from "@bp/analytics"');
expect(source).not.toContain('from "@bp/analytics/');
```

(That test asserts specific pipeline files avoid the barrel; it keeps
passing after this plan and must not be edited.)

### Deletion set (all inside `packages/analytics/src/`)

| Path | LOC | What it is |
|------|-----|------------|
| `findings/` (whole dir) | 8,531 | 20+ detector implementations (observed-reliability, degradation-trend, schedule-mismatch, treatment-scope-*, …) |
| `registry/` (whole dir) | 1,623 | detector metadata registry, promotion gates, specs |
| `calibration/` (except `gold-set.ts`) | ~2,400 | detector-policy.ts (1,181), detector-lifecycle, ewt-route-month-score-vectors |
| `detectors/` (whole dir) | 237 | re-export barrel over `findings/` (see excerpt below) |
| `corpus/` (whole dir) | 260 | zero importers anywhere |
| `lattice-deduction.ts` | 111 | exported only from the root barrel; only internal consumer is `findings/lattice-opportunity.ts` (also deleted) |
| `index.ts` (root barrel) | 307 | re-exports the above; zero live importers |

`packages/analytics/src/detectors/index.ts:1-10` (pure re-export shim over
findings — confirms detectors/ dies with findings/):

```ts
export type {
  BunchingHotspotsDetectorInput,
  ...
} from "../findings/bunching-hotspots.js";
export {
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS,
  detectBunchingHotspots,
} from "../findings/bunching-hotspots.js";
```

### The one carve-out: `calibration/gold-set.ts`

`packages/analytics/src/evaluation/scorecard.ts:1` has the ONLY live
import from calibration:

```ts
import type { GoldSetEvaluation } from "../calibration/gold-set.js";
```

`gold-set.ts` is a small self-contained module (2 types + 1 pure function
`evaluateGoldSet`, ~40 LOC, no imports). It MOVES to
`src/evaluation/gold-set.ts`; it is not deleted.

### Keep list (do not touch except where a step says so)

`artifacts/`, `baselines/`, `concentration.ts`, `core/`, `data-products/`,
`evaluation/`, `feature-history/`, `features/`, `hotspots.ts`,
`interventions/`, `public-route-visibility.ts`, `route-score.ts`.
Note: `core/` and `baselines/` are live transitively (features/ and
evaluation/ import them); `core/detector.ts`, `core/evidence.ts`,
`core/coverage.ts` import `@bp/domain/findings` — that domain module
STAYS (this plan does not touch `packages/domain`).

### package.json exports to remove

`packages/analytics/package.json` currently exports (among live ones):

```json
".": "./src/index.ts",
"./calibration": "./src/calibration/index.ts",
"./corpus": "./src/corpus/index.ts",
"./detectors": "./src/detectors/index.ts",
"./registry": "./src/registry/index.ts",
```

All five lines are removed. All other export lines stay.

### Tests that reference the deletion set

- `packages/analytics/test/architecture.test.ts:20` imports
  `DEFAULT_DELAY_CONCENTRATION_THRESHOLDS` from `@bp/analytics/detectors` —
  this import (and any assertions using it) must be removed from the test;
  the rest of the file tests live `baselines`/`core` exports and stays.
- Per-detector test files (e.g. `degradation-trend.test.ts`,
  `intervention-event-study.test.ts`, `permit-correlated-slowdown.test.ts`,
  `service-request-context.test.ts`, `customer-journey-shortfall.test.ts`,
  `delay-concentration.test.ts`, `intervention-gap.test.ts`,
  `headway-detectors.test.ts`, `registry.test.ts`, `calibration.test.ts`,
  `corpus-profile.test.ts`, `detector-lifecycle-record.test.ts`,
  `detector-runner.test.ts`, and similar) — delete each test file whose
  subject module is deleted. Identify them mechanically in Step 4.
- If `calibration.test.ts` covers `evaluateGoldSet`, extract that coverage
  into `packages/analytics/test/gold-set.test.ts` (pointing at the new
  `evaluation/gold-set.ts` location) instead of deleting it.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Analytics typecheck | `bun --filter @bp/analytics typecheck` | exit 0 |
| Analytics tests | `bun --filter @bp/analytics test` | all pass |
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Repo unit tests | `bun run test:unit` | all pass |
| Style | `bun run check:style` | exit 0 (scope: touched files) |
| Reachability gate | `rg -l "@bp/analytics/(registry\|calibration\|corpus\|detectors)" --glob '!packages/analytics/**'` | no matches |
| Barrel gate | `rg -l 'from "@bp/analytics"' packages tools apps --glob '!**/node_modules/**'` | only `brief-model.test.ts` (the NOT-toContain assertion) |

Do NOT run root `bun run check:types` — it OOMs at default heap; use the
per-package typechecks above.

## Scope

**In scope** (the only files you may modify or delete):
- `packages/analytics/src/{findings,registry,detectors,corpus}/` — delete
- `packages/analytics/src/calibration/` — delete after moving `gold-set.ts`
- `packages/analytics/src/lattice-deduction.ts`, `src/index.ts` — delete
- `packages/analytics/src/evaluation/gold-set.ts` — create (moved file)
- `packages/analytics/src/evaluation/scorecard.ts` — one import path edit
- `packages/analytics/src/evaluation/index.ts` — re-export gold-set if the
  barrel pattern requires it (match how scorecard is exported)
- `packages/analytics/package.json` — remove 5 export lines
- `packages/analytics/test/**` — delete/edit per Step 4
- `knowledge/log.md` — one dated entry
- `plans/README.md` — status row

**Out of scope** (do NOT touch):
- `packages/domain/**` — `domain/findings` stays live via analytics `core/`
  (a later shrink of domain/findings is a named follow-up, not this plan)
- `tools/pipeline-v2/**` (including `brief-model.test.ts`)
- `data/artifacts/**` — readiness artifacts are the preserved record
- `docs/decisions/0018-*.md` — history, not doctrine to edit

## Git workflow

- Branch: `codex/061-delete-dead-detector-subgraph`
- Commit style: short imperative subject, matching repo history (e.g.
  "Delete dead detector/calibration subgraph from analytics").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Prove the deletion set is unreachable (no edits yet)

Run the two gate commands from the table. Also run:
`rg -n 'from "\.\./(findings|registry|calibration|detectors|corpus)' packages/analytics/src --glob '!src/{findings,registry,calibration,detectors,corpus}/**'`
Expected: the ONLY hit outside the deletion set is
`evaluation/scorecard.ts:1` (gold-set). Any other hit is a STOP condition.

**Verify**: commands above → outputs exactly as stated.

### Step 2: Move the carve-out

`git mv packages/analytics/src/calibration/gold-set.ts packages/analytics/src/evaluation/gold-set.ts`
and change `evaluation/scorecard.ts:1` to
`import type { GoldSetEvaluation } from "./gold-set.js";`.
If `evaluation/index.ts` is a barrel, add
`export * from "./gold-set.js";` only if other evaluation modules are
exported that way — match the file's existing pattern.

**Verify**: `bun --filter @bp/analytics typecheck` → exit 0.

### Step 3: Delete the subgraph

`git rm -r` the six deletion-set paths listed in Current state, including
what is left of `src/calibration/`, and `src/index.ts`. Remove the five
export lines from `packages/analytics/package.json`.

**Verify**: `bun --filter @bp/analytics typecheck` → exit 0.
`bun --filter @bp/pipeline-v2 typecheck` → exit 0.

### Step 4: Sweep the tests

For every file in `packages/analytics/test/`, check its imports:
`rg -l '@bp/analytics/(registry|calibration|detectors|corpus)|from "\.\./src/(findings|registry|calibration|detectors|corpus)|@bp/analytics"' packages/analytics/test`
Delete matching test files, EXCEPT: (a) `architecture.test.ts` — edit to
drop only the `@bp/analytics/detectors` import and its assertions;
(b) gold-set coverage — extract to `test/gold-set.test.ts` per Current
state before deleting `calibration.test.ts`.

**Verify**: `bun --filter @bp/analytics test` → all pass, zero failures.

### Step 5: Full gate + record

Run `bun run test:unit`, both grep gates from the commands table, and
`bun run check:style` (append `--write` on touched files only if needed).
Add a dated `knowledge/log.md` entry (match the existing entry format:
`## [2026-MM-DD] engineering | <title>` + a short paragraph with the LOC
delta and the gold-set carve-out). Update the plan status row.

**Verify**: all commands exit 0; `git status` shows only in-scope paths.

## Test plan

No new behavior — deletions plus one moved pure module. The safety net is:
existing analytics tests for KEPT modules (evaluation, features,
feature-history, interventions, data-products, baselines, core, hotspots)
all pass unchanged; `test:unit` passes repo-wide; the new
`test/gold-set.test.ts` (moved coverage) passes. If `evaluateGoldSet` had
no direct test in `calibration.test.ts`, write a 20-line one: TP/FP/TN/FN
counting on a 4-expectation fixture, plus the unexpected-flagged-scope
false-positive case (see the loop at the end of `evaluateGoldSet`).

## Done criteria

- [ ] `packages/analytics/src/{findings,registry,calibration,detectors,corpus}` and `src/{index.ts,lattice-deduction.ts}` do not exist
- [ ] `src/evaluation/gold-set.ts` exists; scorecard imports it locally
- [ ] `bun --filter @bp/analytics typecheck` and `test` exit 0
- [ ] `bun --filter @bp/pipeline-v2 typecheck` exits 0
- [ ] `bun run test:unit` exits 0
- [ ] Both grep gates return the expected (empty / assertion-only) results
- [ ] `packages/analytics/package.json` no longer exports `.`, `./calibration`, `./corpus`, `./detectors`, `./registry`
- [ ] `knowledge/log.md` entry added; `plans/README.md` row updated
- [ ] No files outside the in-scope list are modified (`git status`)

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds ANY importer of the deletion set other than
  `evaluation/scorecard.ts` (gold-set) and analytics' own tests.
- A pipeline-v2 or studio-api typecheck failure traces to a deleted
  analytics symbol (means the liveness trace missed a consumer).
- `brief-model.test.ts` fails (its not-toContain assertions are supposed
  to be unaffected; a failure means something unexpected changed).
- You find yourself wanting to edit `packages/domain` — that is plan
  066/067 territory.

## Maintenance notes

- **domain/findings follow-up**: `packages/domain/src/findings/index.ts`
  (1,818 LOC) stays because `analytics/core/{detector,evidence,coverage}.ts`
  and `features/route-month.ts` import it. After this plan, a follow-up can
  measure which of its schemas are still referenced and shrink it — do that
  inside plan 067's domain migration, not before.
- The detector-readiness serving manifest under
  `data/artifacts/studio/v2/detectors/` is a static artifact; regenerating
  it is no longer possible after this deletion. That is accepted: the
  operator decision records readiness as a frozen Phase-B snapshot. If a
  future product decision needs live detectors, restore from git history
  (`git log -- packages/analytics/src/findings`) rather than re-writing.
- Reviewer should scrutinize: the package.json exports diff (exact five
  lines), and that no `evaluation/` file other than scorecard gained edits.
