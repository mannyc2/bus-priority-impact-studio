# Plan 030: Restore Snapshot 2.0 in production by fixing the loose-load/strict-compose gap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ce3baca..HEAD -- packages/studio-api/src/studio/read-handlers.ts packages/studio-api/test/api-facade.test.ts packages/db/src/d1/queries/snapshot-coverage.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the production snapshot endpoint; the restored v1 contract must not regress)
- **Depends on**: none (plan 031 touches the same file — execute 030 BEFORE 031, or rebase 031 on 030's result)
- **Category**: bug
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

Production `GET /api/v1/studio/snapshot` currently returns the v1 payload with
`quality.confidence: "low"` and the caveat *"Snapshot 2.0 manifest failed
contract validation and is temporarily omitted."* on **every request** (stable,
not flapping — verified 3/3 requests on 2026-07-04). PR #58 restored the 200 by
making the optional `v2` block non-fatal, but the underlying failure still fires
each time: Snapshot 2.0 (the all-route addressability/coverage manifest) is
never served, and every snapshot response is permanently degraded to
low-confidence. The failure class is a **loose-load / strict-compose gap**: an
R2 artifact is validated with bare `z.string()` month fields at load time, then
those strings are injected into a schema requiring `^\d{4}-\d{2}$` at compose
time. The repo's own regression test models exactly this poison
(`historyWindow.startMonth: "not-a-month"`). This plan closes the gap so a bad
artifact degrades one manifest entry instead of deleting all of v2, makes the
failure diagnosable from the response and logs, and hands the operator the
exact production probes and re-publish step to heal the stale data.

## Current state

### The verified diagnosis (do not re-derive; all items checked 2026-07-04 against production)

1. Production `GET /api/v1/studio/routes?schema=2` returns HTTP 200 (813 KB,
   381 routes) — so `buildStudioRouteIndex2Response`'s `.parse` succeeds in
   production, and every `historyCoverage.startMonth/endMonth` in production is
   clean ISO (`2025-01`…`2026-03`, verified by scanning the payload).
2. Production `GET /api/v1/studio/routes/sections` returns 200 with
   `evidence_ready: partial` and 12 rows — so the R2 route-evidence index loads
   AND parses in production (`StudioRouteEvidenceIndexSchema` enforces
   `int().nonnegative()` coverage counts, so evidence-derived numbers cannot be
   NaN).
3. `packages/db/src/d1/queries/shared.ts` defines
   `IsoMonthSchema = z.string().regex(/^\d{4}-\d{2}$/)` — exactly as strict as
   the domain regex — and since PR #57 the snapshot reads D1 coverage rows
   through the tolerant `listPublicSnapshotSourceMonthCoverage` (per-row
   safeParse; malformed rows are skipped and counted). D1 coverage rows
   therefore **cannot** fail the v2 compose anymore.
4. A full local simulation of the v2 composition — production route index +
   the regenerated `data/exports/d1/2026-03/seed.sql` coverage rows (216 rows,
   all ISO) + the local `data/artifacts/studio/v2/detectors/model-artifacts.json`
   (Jun 11, ISO months) + the local wiki evidence index — **passes**
   `StudioSnapshot2Schema`. So the production failure comes from production
   state that differs from the local artifacts: the prime suspect is the
   production R2 object `studio/v2/detectors/model-artifacts.json` (its months
   are the only compose-exposed fields validated as bare strings at load), with
   a residual possibility of a D1-level error in the coverage read.
5. The two failure branches log **distinct** messages (see excerpts below), so
   one look at Cloudflare dashboard → Workers Logs settles which branch fires.
   Local `wrangler tail` auth is NOT available; use the dashboard.

### Files

- `packages/studio-api/src/studio/read-handlers.ts` — all snapshot assembly.
  - `ModelArtifactServingProjectionSchema` (lines 199–235): the loose loader schema.
  - `loadModelArtifactServingProjection` (lines 842–858): R2 load, `safeParse → null`.
  - `buildSnapshot2` (lines 2565–2722): composes v2; injects model months into
    the strict projection-ref schema at lines 2666–2675.
  - `buildStudioSnapshotResponseUnchecked` (lines 2724–2827): the two failure
    branches.
- `packages/domain/src/studio/snapshots.ts` — `StudioSnapshot2ProjectionRefSchema`
  (lines 52–74; months regex `^\d{4}-\d{2}$`), `StudioSnapshot2Schema` (126–160),
  `StudioSourceMonthStateSchema` (95–110). **Do not change this file** — the
  public contract is correct; the fix is load-time strictness + degradation.
- `packages/studio-api/test/api-facade.test.ts` — the #58 regression test
  `"serves the v1 Studio snapshot when Snapshot 2.0 contract validation fails"`
  (line ~2736) poisons the model artifact with
  `historyWindow: { startMonth: "not-a-month", endMonth: "2026-03" }`.

### Key excerpts (as of `ce3baca`)

`read-handlers.ts:205-211` — the loose month fields in the loader schema:

```ts
    historyWindow: z
      .object({
        startMonth: z.string(),
        endMonth: z.string(),
      })
      .strict(),
```

`read-handlers.ts:2666-2675` — those strings meeting the strict compose schema:

```ts
      months:
        input.modelProjection === null
          ? {
              start: input.routeIndex.baselineMonth,
              end: input.routeIndex.baselineMonth,
            }
          : {
              start: input.modelProjection.historyWindow.startMonth,
              end: input.modelProjection.historyWindow.endMonth,
            },
```

`read-handlers.ts:2744-2759` — failure branch A (assembly throw):

```ts
    try {
      const publicSourceMonthCoverage = await listPublicSnapshotSourceMonthCoverage(
        createD1ServingDb(env.DB),
      );
      snapshot2 = buildSnapshot2({ ... });
    } catch (error) {
      snapshot2BuildFailure = error;
      console.error("Studio Snapshot 2.0 assembly failed; serving v1 snapshot only.", { error });
    }
```

`read-handlers.ts:2807-2818` — failure branch B (compose contract failure):

```ts
  if (!parsedSnapshot.success) {
    if (snapshot2 !== undefined) {
      console.error("Studio Snapshot 2.0 contract validation failed; serving v1 snapshot only.", {
        issues: parsedSnapshot.error.issues,
      });
      const fallbackSnapshot = StudioSnapshotResponseSchema.safeParse({
        ...baseSnapshot,
        quality: snapshotQualityWithCaveat(routesResult.quality, SNAPSHOT_2_OMITTED_CAVEAT),
      });
```

### Conventions that apply

- Zod v4; validate at boundaries; `.strict()` contracts (see
  `knowledge/wiki/engineering/testing_standards.md`). Tolerant reads follow the
  PR #57 pattern: per-item `safeParse`, skip + count + `console.error` with
  structured fields — exemplar: `listPublicSnapshotSourceMonthCoverage` in
  `packages/db/src/d1/queries/snapshot-coverage.ts:213-235`.
- Tests use the fake-env pattern in `packages/studio-api/test/api-facade.test.ts`
  (`createStudioProjectionEnv`, `FakeR2Object`, `createSparseStudioRouteDb`).
- Small diffs; no new abstractions beyond what the steps name (CLAUDE.md).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Studio API tests | `bun --filter @bp/studio-api test` | exit 0, all pass |
| Studio API types | `bun --filter @bp/studio-api typecheck` | exit 0 |
| Worker harness | `bun run test:worker` | exit 0 |
| Domain tests (contract untouched proof) | `bun --filter @bp/domain test` | exit 0 |
| Style | `bun run check:style` | exit 0 |

Do NOT run repo-wide `bun run check:types` (known OOM at default heap).

## Scope

**In scope** (the only files you should modify):

- `packages/studio-api/src/studio/read-handlers.ts`
- `packages/studio-api/test/api-facade.test.ts`

**Out of scope** (do NOT touch, even though they look related):

- `packages/domain/src/studio/snapshots.ts` — the public contract is correct.
- `packages/db/src/d1/queries/snapshot-coverage.ts` — already tolerant (PR #57).
- `packages/studio-api/src/http/**`, `apps/web/**` — global error handling is
  plan 031.
- Production D1/R2 state — operator-only; see "Operator handoff" below.

## Git workflow

- Branch: `codex/030-snapshot-v2-root-cause` from `origin/main`
  (local `main` may be stale; branch from `origin/main`).
- Commit message style matches history: short imperative subject
  (e.g. `Serve Snapshot 2.0 with degraded model projection`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make the model-projection loader reject non-ISO months at load time

In `packages/studio-api/src/studio/read-handlers.ts`, add a module-level ISO
month schema near the top of the schema definitions (there is no exported
IsoMonth in `@bp/domain/studio`; define it locally):

```ts
const IsoMonthStringSchema = z.string().regex(/^\d{4}-\d{2}$/);
```

Then change `ModelArtifactServingProjectionSchema.historyWindow` (lines
205–211) to use it:

```ts
    historyWindow: z
      .object({
        startMonth: IsoMonthStringSchema,
        endMonth: IsoMonthStringSchema,
      })
      .strict(),
```

Effect: an artifact with malformed months now fails `safeParse` inside
`loadModelArtifactServingProjection` → returns `null` → `buildSnapshot2`
already degrades gracefully (`detector_model_status` projection `status:
"not_built"`, source-month state `derived_not_built`, months fall back to
`baselineMonth`) → **v2 serves**.

**Verify**: `bun --filter @bp/studio-api typecheck` → exit 0.

### Step 2: Log WHY the model projection was rejected

`loadModelArtifactServingProjection` (lines 842–858) currently returns `null`
silently for all three failure modes (missing object, invalid JSON, schema
fail), which made the production incident undiagnosable. Match the PR #57
logging pattern — one `console.error` per distinguishable failure, structured
fields only, never the artifact body:

- invalid JSON → `console.error("Model artifact serving projection is not valid JSON.", { key: STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY })`
- schema fail → `console.error("Model artifact serving projection failed contract validation.", { key: STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY, issues: parsed.error.issues })`
- missing object (`object === null`) stays silent — absence is a legitimate state.

**Verify**: `bun --filter @bp/studio-api typecheck` → exit 0.

### Step 3: Rewrite the #58 regression test to assert graceful degradation

The existing test at `packages/studio-api/test/api-facade.test.ts:2736`
(`"serves the v1 Studio snapshot when Snapshot 2.0 contract validation fails"`)
poisons `historyWindow.startMonth: "not-a-month"` and currently expects
`snapshot.v2` to be `undefined`. After Step 1 that same poison must instead
produce a SERVED v2 with the model projection degraded. Rewrite the test
(keep the same env fixture) to:

```ts
    expect(response.status).toBe(200);
    const snapshot = StudioSnapshotResponseSchema.parse(await response.json());
    expect(snapshot.v2).toBeDefined();
    const modelProjection = snapshot.v2?.projections.find(
      (ref) => ref.id === "detector_model_status",
    );
    expect(modelProjection?.status).toBe("not_built");
    expect(snapshot.quality.caveats).not.toContain(
      "Snapshot 2.0 manifest failed contract validation and is temporarily omitted.",
    );
```

Rename it to `"serves Snapshot 2.0 with a degraded model projection when the model artifact months are malformed"`.

Note: the branch-B fallback code in `buildStudioSnapshotResponseUnchecked`
(lines 2807–2818) **stays** — it is the belt against the next unknown bad
input. After this plan no known data shape can trigger it, so it keeps no
data-driven test; do not delete it and do not try to contrive one.

Also add one NEW test: model artifact is well-formed → v2 serves with
`detector_model_status` status `"available"` (or `"partial"` if you set
`missingModelCount > 0`) and `months` equal to the fixture's
`historyWindow`. Model it structurally on the test you just rewrote.

**Verify**: `bun --filter @bp/studio-api test` → exit 0, including the
rewritten and new tests.

### Step 4: Keep the v1 contract green (the hard requirement)

Run the full relevant gates. The restored v1 snapshot behavior from PR #58
must not change for the OTHER failure branch (assembly throw): the test
`"..."` cases around line 2700–2800 covering 502s and v1 fallbacks must all
still pass unmodified except the one rewritten in Step 3.

**Verify**:
- `bun --filter @bp/studio-api test` → exit 0
- `bun run test:worker` → exit 0
- `bun run check:style` → exit 0

## Test plan

- Rewritten: poisoned model months → 200, `v2` present, `detector_model_status`
  = `not_built`, no v2-omitted caveat (Step 3).
- New: clean model artifact → 200, `v2.projections` carries the artifact's
  ISO months (Step 3).
- Existing (must stay green untouched): snapshot 502 contract-failure cases,
  v1-only serving cases, source-month skip counting cases in
  `packages/db/test/snapshot-coverage.test.ts`.
- Pattern exemplar: the surrounding tests in `api-facade.test.ts` using
  `createStudioProjectionEnv` + `FakeR2Object`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun --filter @bp/studio-api typecheck` exits 0
- [ ] `bun --filter @bp/studio-api test` exits 0
- [ ] `bun run test:worker` exits 0
- [ ] `grep -n 'startMonth: z.string(),' packages/studio-api/src/studio/read-handlers.ts` returns no matches (the loose month fields are gone)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `read-handlers.ts` changed since `ce3baca` and the
  excerpts above no longer match (esp. if plan 031 landed first and moved the
  error handling — then re-locate the same logic before proceeding, and STOP if
  you cannot).
- `bun --filter @bp/studio-api test` fails BEFORE your changes (broken
  baseline).
- Rewriting the Step 3 test reveals the poisoned fixture still yields
  `v2: undefined` after Step 1 — that means a second loose input exists;
  report the Zod issues from the test output instead of patching further.
- You find yourself wanting to edit `packages/domain/src/studio/snapshots.ts`.

## Operator handoff (record in the completion report; do not attempt yourself)

The code fix makes bad artifacts non-fatal, but production heals fully only
when the stale artifact/data is replaced. Hand the operator this checklist:

1. **Read the one log line that settles the diagnosis**: Cloudflare dashboard →
   Workers & Pages → bus-priority-impact-studio → Logs, filter `Snapshot 2.0`.
   - `"…assembly failed…"` → branch A: D1-level failure in
     `source_month_coverage` reads (then also run probe 3).
   - `"…contract validation failed…"` → branch B: the `issues` array names the
     exact failing field (expected: `v2.projections[4].months.*` = the model
     projection).
2. **Inspect the production model artifact**:
   `wrangler r2 object get bus-priority-artifacts/studio/v2/detectors/model-artifacts.json --pipe | head -c 600`
   — check `historyWindow`. Local clean copy:
   `data/artifacts/studio/v2/detectors/model-artifacts.json` (months
   `2023-04`/`2026-03`).
3. **(Branch A only) Inspect production D1**:
   `wrangler d1 execute <prod-db-name> --remote --command "SELECT source_id, month FROM source_month_coverage LIMIT 20"`.
4. **Re-publish current artifacts** (idempotent, content-hash-skipped):
   `bun run pipeline -- publish r2-artifacts --month 2026-03 … --execute`
   (the `studio` prefix in `DEFAULT_PREFIXES` covers
   `studio/v2/detectors/model-artifacts.json`), or the full
   `scripts/publish-serving-release.sh` flow. Production D1 migrations/seeds
   remain operator-run per CLAUDE.md.
5. **Confirm**: `curl -s https://bus-priority-impact-studio.c20carroll.workers.dev/api/v1/studio/snapshot | python3 -c "import json,sys; d=json.load(sys.stdin); print('v2' in d, d['quality']['confidence'])"`
   → expected `True medium` (confidence rises once the caveat is gone; exact
   confidence comes from `routesResult.quality`).

## Maintenance notes

- Any NEW input added to `buildSnapshot2` must be validated as strictly at
  load as the compose schema demands — grep for `z.string()` month fields in
  loader schemas during review.
- Plan 031 (global error envelope) touches the same file's error paths; land
  this first.
- The `.passthrough()` on `ModelArtifactServingProjectionSchema` is
  deliberate (forward-compatible artifact evolution) — do not tighten it to
  `.strict()` here.
- Deferred: per-item safeParse guards inside `buildSnapshot2` for
  sourceMonths/projections (belt-over-belt). Deliberately left out to keep the
  diff small; reconsider only if a THIRD distinct input class ever fires the
  fallback.
