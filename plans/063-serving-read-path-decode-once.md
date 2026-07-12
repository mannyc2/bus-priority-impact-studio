# Plan 063: Studio read path — decode once at the edge, compose totally, dispatch from the registry

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4c1afe7..HEAD -- packages/studio-api packages/db/src/d1/queries apps/web/test/worker`
> Gen-6 plan 052 landed DURING planning (verified 2026-07-06): the
> `/api/v1/studio/methods` DISPATCH endpoint is already deleted
> (read-handlers.ts is now 2,966 LOC), but the snapshot builder STILL
> loads `methods.json` (:2740) and lists it in `projections` (:2783) —
> so the methods row in the degrade table below remains real. If a later
> change also removes the snapshot's methods load, drop that row and its
> tests. Any OTHER excerpt mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (coordinate with gen-6 plan 052 per drift check)
- **Category**: tech-debt (local defenses / broad fallbacks / weak invariants)
- **Planned at**: commit `4c1afe7`, 2026-07-06

## Why this matters

The studio Worker read path accreted defense layers during the July-2026
1101 incident: the snapshot handler now **re-validates its own composed
output on every request** and re-parses a v1-only variant when that
fails; projection loads are all-or-nothing (a malformed `docs.json` 502s
the whole snapshot while v2 and evidence degrade gracefully — asymmetric);
row-level null-defaulting (`row.summary?.x ?? row.readiness?.x ?? 0`) is
repeated at 15+ sites instead of once at the D1 edge; and the dispatcher
re-states every path that `contracts/registry.ts` already declares. The
result is 2,971 LOC in one file where the failure behavior is the sum of
five overlapping mechanisms nobody can predict. This plan replaces the
layers with one rule: **decode/normalize once at the D1/R2 edge, compose
with total functions, one envelope at the top** — in plain TypeScript
(Effect runtime is banned in the Worker per plan 026's measured block).
Target: read-handlers ≤ 2,200 LOC with strictly more predictable behavior.

## Current state

All excerpts verified 2026-07-06.

### File inventory

- `packages/studio-api/src/studio/read-handlers.ts` — 2,966 LOC (post
  gen-6 052), 9 endpoint families, hand-matched dispatch at ~2850-2966.
- `packages/studio-api/src/studio/projections.ts` — R2 projection loader +
  `studioJsonResponse` (ETag/cache headers at :55-69).
- `packages/studio-api/src/contracts/registry.ts` — ~20 route specs
  (path/method/auth/cache) consumed by `http/routing.ts` (`findRouteSpec`)
  for POLICY only, not dispatch.
- `packages/studio-api/src/api.ts` — top-level try/catch envelope
  (:118-126) logging `{requestId, method, path, error}` and returning
  `errorResponse(500, "Internal error.", "INTERNAL")`. This stays.
- `packages/db/src/d1/queries/route-equity-contexts.ts` — carries the one
  verified crash-shaped bug (below).

### Layer 1 to delete: per-request self-validation + re-parse fallback

`read-handlers.ts:2816-2839` — the handler safeParses ITS OWN composed
object, and on failure strips v2 and parses AGAIN:

```ts
const parsedSnapshot = StudioSnapshotResponseSchema.safeParse(
  snapshot2 === undefined ? baseSnapshot : { ...baseSnapshot, v2: snapshot2 },
);
if (!parsedSnapshot.success) {
  if (snapshot2 !== undefined) {
    console.error("Studio Snapshot 2.0 contract validation failed; serving v1 snapshot only.", ...);
    const fallbackSnapshot = StudioSnapshotResponseSchema.safeParse({ ...baseSnapshot, ... });
    if (fallbackSnapshot.success) return studioJsonResponse(fallbackSnapshot.data, env);
  }
  return snapshotContractFailureResponse({ issues: parsedSnapshot.error.issues });
}
```

The inputs to `baseSnapshot` are already schema-validated (every
projection passes `loadStudioProjection`'s safeParse; D1 rows pass their
own decode). Composing validated inputs with total functions cannot
produce contract-invalid output — validating the output per-request is
machinery diagnosing the composer. The same file also parses the routes
response it just built at :2864 (`StudioRoutesResponseSchema.parse({...})`
inside the `/routes` handler) — same disease.

### Layer 2 to fix: all-or-nothing loads, asymmetric tolerance

`read-handlers.ts:2737-2747`:

```ts
const [routesResult, methods, docs, routeEvidenceIndex, modelProjection] = await Promise.all([
  buildStudioRoutesResponse(env),
  loadStudioProjection(env, "methods.json", StudioMethodsResponseSchema),
  loadStudioProjection(env, "docs.json", StudioDocsResponseSchema),
  loadStudioRouteEvidenceIndex(env),
  loadModelArtifactServingProjection(env),
]);
if (!routesResult.ok) return routesResult.response;
if (methods instanceof Response) return methods;
if (docs instanceof Response) return docs;
```

A broken `docs.json` fails the entire snapshot, while snapshot2 assembly
failure (:2769-2772) and evidence/model failures degrade with a caveat.
`loadStudioProjection` (projections.ts:71-109) returns
`Response | SchemaOutput<TSchema>` — an untagged union callers probe with
`instanceof Response` (a Response-typed error channel is itself a weak
invariant, but its shape is pervasive; this plan only normalizes the
DEGRADE POLICY, not the loader's return type).

### Layer 3 to fix: per-site null-defaulting instead of one edge decode

`read-handlers.ts:571-616` (three of 15+ sites):

```ts
function routeSpeedMphForIndexRow(row: StudioRouteIndexSourceRow): number {
  return Number((row.summary?.averageSpeedMph ?? row.readiness?.averageSpeedMph ?? 0).toFixed(1));
}
function routeLaneCoverageForIndexRow(row: StudioRouteIndexSourceRow): number {
  const stopCount = row.readiness?.stopCount ?? row.stopCount;
  ...
}
```

Plus stringly re-mapping at `sourceMonthStatus` (:2435-2447, any unknown
string → `"source_absent"`) and two `as` casts hiding weak returns:
`:510` (`as StudioRouteIndex2Row["borough"]`) and `:383`
(`state: state as string`).

### Layer 4 to fix: dispatch duplicating the registry

`read-handlers.ts:2850-2971` hand-matches every path
(`if (url.pathname === "/api/v1/studio/routes")`,
`url.pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)$/)`, …) that
`contracts/registry.ts` already declares and `http/routing.ts`'s
`findRouteSpec` already matches for cache/auth policy. Adding an endpoint
requires two edits that can drift.

### Rider bug (packages/db)

`route-equity-contexts.ts` maps `rows[0]` without a guard in one query
path and casts the enum at :65
(`row.assignment_geography as RouteEquityContext["assignmentGeography"]`).
The sibling `route-batch-status.ts:98` shows the repo's safe pattern
(`const row = rows[0] ?? null; if (row === null) return null;`). Apply
that pattern and replace the cast with a literal-union narrowing helper.

### Duplicated constants

`ARTIFACT_NOT_AVAILABLE_MESSAGE` / `SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE`
are declared in `read-handlers.ts:102-103`, `projections.ts:21-22`, and
`public-api.ts:25`. Move to ONE module (`src/http/messages.ts`), import
everywhere.

### Test net

`packages/studio-api/test/api-facade.test.ts` is the regression net (it
contains the #58 poisoned-model-month test at ~:2736 and FakeR2Object
fixtures). Worker smoke tests live in `apps/web/test/worker/`. Baseline
timings: `bun run test:worker` ≈ 5s (post-046 log records 5.10s).

## Target design (the rules, not a rewrite spec)

1. **One decode per input, at the edge.** D1 row → domain shape happens in
   exactly one mapper per row type (e.g.
   `normalizeStudioRouteIndexSourceRow`), producing a type with NO
   optional display fields: `summary ?? readiness ?? 0` fallbacks execute
   once there. Downstream card/index/detail builders take the normalized
   type and contain zero `??` on those fields. `sourceMonthStatus` becomes
   a literal-union decode at the D1 query row mapper, not a re-map in the
   handler.
2. **Total composition; assert contracts in tests, not per request.**
   Delete the self-safeParse + v1-refallback block and the `/routes`
   self-parse; the compose functions return the schema's TypeScript type
   directly. Contract conformance is enforced by api-facade tests that
   decode responses with the same schemas (add where missing).
3. **A declared degrade policy instead of accidental asymmetry.** One
   table in code, near the snapshot builder:
   routes → REQUIRED (fail the endpoint, as today); methods, docs →
   TOLERATED (serve `datasets: []` / empty sections + a quality caveat,
   counts 0); evidence index, model projection → TOLERATED (omit + caveat,
   as today); snapshot2 assembly → TOLERATED (omit v2 + caveat, as today).
   Each tolerated failure logs via the existing console.error pattern.
   This CHANGES behavior for methods/docs failures (was: 502) — that is
   deliberate and gets tests.
4. **Registry-driven dispatch.** Give each spec in
   `contracts/registry.ts` a stable `routeId` (they exist) and build a
   `Record<routeId, handler>` map in read-handlers. Reuse the existing
   `findRouteSpec` matcher for path→spec resolution and param extraction
   so the pattern lives once; `handleStudioReadRequest` becomes
   match → look up handler → invoke. Unknown path → the existing 404.
   Add a completeness test: every studio-tagged registry spec has a
   handler and vice versa.
5. **The envelope stays.** `api.ts:118-126` remains the only catch-all.
   No new try/catch below it; delete inner ones made redundant by the
   degrade table (keep the snapshot2 assembly catch, re-expressed through
   the policy table).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| studio-api typecheck | `bun --filter @bp/studio-api typecheck` | exit 0 |
| studio-api tests | `bun --filter @bp/studio-api test` | all pass |
| db typecheck+tests | `bun --filter @bp/db typecheck && bun --filter @bp/db test` | exit 0 / all pass |
| Worker tests | `bun run test:worker` | all pass; wall time within 1.5× of your pre-change baseline run |
| Web tests | `bun run test:web` | all pass |
| Architecture | `bun run check:web-architecture` | all pass |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope**:
- `packages/studio-api/src/studio/read-handlers.ts` (the bulk)
- `packages/studio-api/src/studio/projections.ts` (constants import only)
- `packages/studio-api/src/http/messages.ts` (create)
- `packages/studio-api/src/public-api.ts` (constants import only)
- `packages/studio-api/src/contracts/registry.ts` + `src/http/routing.ts`
  (only if dispatch needs a param-extraction helper exported)
- `packages/db/src/d1/queries/route-equity-contexts.ts` (rider bug)
- `packages/studio-api/test/**` (update + new degrade/completeness tests)
- `plans/README.md` (status row), `knowledge/log.md` (one entry)

**Out of scope** (do NOT touch):
- `apps/web/src/**` — gen-6 territory; the client needs no change (degrade
  shapes are already legal per the response schemas).
- `public-api.ts` endpoint logic/legacy surface (constants import only).
- The methods ENDPOINT deletion — gen-6 plan 052 owns it.
- Any Effect import — the Worker stays plain TypeScript (plan 026 block).
- Schema definitions in `packages/domain` (plans 066/067 own schema work;
  this plan consumes them as-is).

## Git workflow

- Branch: `codex/063-serving-decode-once`
- Commit per step (5-6 commits), short imperative subjects.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Constants + rider bug (small, independent)

Create `src/http/messages.ts` with the two message constants; repoint the
three declaring files. Fix `route-equity-contexts.ts`: guard `rows[0]`
with the `?? null` pattern from `route-batch-status.ts:98`; add
`function assignmentGeography(value: string): RouteEquityContext["assignmentGeography"]`
that narrows against the literal union and throws a descriptive Error on
mismatch (the api.ts envelope handles it) instead of the silent cast.

**Verify**: db + studio-api typechecks; `bun --filter @bp/db test` all
pass; `rg -n "ARTIFACT_NOT_AVAILABLE_MESSAGE =" packages/studio-api/src`
→ exactly one declaration.

### Step 2: Edge normalization of index rows

Introduce the normalized row type + single mapper for
`StudioRouteIndexSourceRow` (place next to where the rows are loaded).
Move every `summary?.x ?? readiness?.x ?? d` fallback into it; convert
`routeSpeedMphForIndexRow`/`routeLaneCoverageForIndexRow`/
`routeReliabilityLabelForIndexRow`/`routeDiagnosisForIndexRow`/
`routeFlagsForIndexRow` (:567-617) and the other consumers to the
normalized type. Fold `sourceMonthStatus` (:2435-2447) into the D1 row
mapper as a literal-union decode; delete the `:510` and `:383` casts by
typing the producing functions.

**Verify**: `bun --filter @bp/studio-api test` all pass (behavior
identical — this step is pure factoring);
`rg -c '\?\? 0' packages/studio-api/src/studio/read-handlers.ts` count
strictly lower than before (record both numbers in the commit message).

### Step 3: Snapshot degrade policy + delete self-validation

Implement the degrade table from Target design §3; replace :2737-2848
accordingly; delete the self-safeParse/re-parse block (§2) and the
`/routes` handler self-parse at :2864. Keep
`snapshotContractFailureResponse` only for the routes-REQUIRED failure
path if api-facade tests pin its shape; otherwise use the standard
errorResponse.

**Verify**: `bun --filter @bp/studio-api test` — expect failures ONLY in
tests that pinned the old 502-on-docs/methods behavior and the
poisoned-model-month test's exact caveat text; update those tests to the
declared policy (each updated test cites the policy table in a comment).
All others must pass unchanged. Then all pass.

### Step 4: Registry-driven dispatch

Build the handler map + completeness test (Target design §4). Preserve
the exact response for unknown paths
(`errorResponse(404, "Studio API endpoint was not found.")`).

**Verify**: studio-api tests + `bun run test:worker` all pass; new
completeness test fails if a spec/handler is added on one side only
(prove by temporarily commenting one map entry, observing the failure,
restoring).

### Step 5: Full gate + record

Run the whole command table including `test:web`,
`check:web-architecture`, style. Record wall-time for `test:worker` vs
your Step-0 baseline. `wc -l read-handlers.ts` ≤ 2,200. Log entry +
README row.

**Verify**: all green; LOC target met (if the honest result lands above
2,200 but below 2,400 with all behavior gates green, record the number
and proceed — do not pad; below 2,400 is acceptable, above it is a STOP).

## Test plan

- Update: api-facade tests pinning 502-on-docs/methods → new degrade
  assertions (200 + empty datasets/sections + caveat string).
- New: degrade-matrix test — for each row of the policy table, poison that
  one projection in FakeR2Object and assert the declared outcome (model
  after the existing poisoned-model-month test at api-facade.test.ts
  ~:2736).
- New: dispatch completeness test (registry ↔ handler bijection).
- New (if absent): response-contract tests decoding `/snapshot` and
  `/routes` happy-path responses with the domain schemas — this replaces
  the deleted per-request self-validation.
- Rider: db test for equity-contexts empty-rows → null, and invalid
  geography string → thrown descriptive error.

## Done criteria

- [ ] `rg -n "safeParse" packages/studio-api/src/studio/read-handlers.ts`
      shows no self-validation of composed responses (projection-load
      safeParse in projections.ts remains)
- [ ] Degrade policy table exists in code; poisoning docs.json yields 200
      + caveat (test proves it)
- [ ] Dispatch reads from the registry; completeness test exists
- [ ] `wc -l` read-handlers.ts ≤ 2,200 (hard ceiling 2,400 per Step 5)
- [ ] Message constants declared exactly once
- [ ] equity-contexts guard + typed narrowing landed with tests
- [ ] Full command table green; `test:worker` within 1.5× baseline
- [ ] `knowledge/log.md` entry; `plans/README.md` row updated
- [ ] `git status` clean outside in-scope paths

## STOP conditions

Stop and report back (do not improvise) if:

- The methods/docs degrade decision turns out to be load-bearing for the
  web client (a web test fails on the degraded shape) — the policy table
  needs an operator call, not an improvised client patch.
- `test:worker` wall time exceeds 1.5× your recorded baseline after Step 4
  (dispatch indirection must be free; regression echoes the plan-026
  block).
- Gen-6 plan 052 landed mid-execution and read-handlers conflicts exceed
  mechanical rebasing (methods endpoint gone = fine, adapt; structural
  collision = STOP).
- read-handlers.ts cannot get under 2,400 LOC without behavior changes
  beyond the declared policy.

## Maintenance notes

- Gen-6 plan 052 deletes the methods endpoint AND its snapshot projection
  contribution — after both land, the degrade table's methods row and the
  `counts.methods` field become dead; whoever lands second deletes them
  (note this in that PR).
- The untagged `Response | T` loader return is left as-is deliberately;
  if it ever gets refactored, do it as a mechanical
  `{ok:true,value}|{ok:false,response}` sweep in one PR.
- Plan 066 migrates this file's shim schema imports to native Effect
  Schema decode — it depends on this plan landing first (same file).
- Reviewer should scrutinize: the degrade-policy table (it is the new
  behavior contract) and the dispatch completeness test.
