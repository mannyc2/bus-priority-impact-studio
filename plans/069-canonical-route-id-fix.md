# Plan 069: Fix the tautological route-universe check in observed-reliability aggregation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cd878f7..HEAD -- tools/pipeline-v2/src/lib/local-db-aggregates/route-observed-reliability.ts tools/pipeline-v2/test`
> If the in-scope file changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/068-verification-baseline.md (for a runnable `check:types` gate)
- **Category**: bug
- **Planned at**: commit `cd878f7`, 2026-07-09

## Why this matters

`canonicalRouteId()` is supposed to reject observed-headway samples whose route
ID is not in the canonical route universe. Its final line is a tautology — both
ternary branches return the same value — so unknown route IDs are never
rejected. Junk or non-canonical IDs flow into `local_route_observed_reliability_summary`,
which feeds the riders-tab reliability numbers on the public site. The fix is
one token; the value is a regression test that pins the intended behavior.

## Current state

- `tools/pipeline-v2/src/lib/local-db-aggregates/route-observed-reliability.ts`
  — observed reliability aggregation (GTFS-RT headway samples → per-route
  monthly summaries). The bug, exactly as it exists today (lines 65-73):

```ts
function canonicalRouteId(value: unknown, routeUniverse: ReadonlySet<string>): string | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : null;
  if (raw === null || raw.length === 0) return null;
  if (routeUniverse.has(raw)) return raw;

  const normalized = normalizeRouteIdText(raw);
  if (normalized === null) return null;
  return routeUniverse.has(normalized) ? normalized : normalized;  // <-- both branches identical
}
```

- The call site (line 119): `const routeId = canonicalRouteId(sample.routeId, routeUniverse);`
  — a `null` return is the mechanism that skips a sample (matching the raw
  string checks above, which already return `null`).
- `normalizeRouteIdText` (lines 58-63) strips zero-padding, e.g. `"M001"` →
  `"M1"`. The intended semantics, evident from the structure: accept the raw ID
  if it is in the universe; otherwise accept the normalized form only if THAT
  is in the universe; otherwise reject.
- Test conventions: bun tests under `tools/pipeline-v2/test/`, run with
  `bun --filter @bp/pipeline-v2 test`. Fixture-backed command tests live under
  `tools/pipeline-v2/test/commands/` (e.g.
  `tools/pipeline-v2/test/commands/export/route-dossier-summaries.test.ts` —
  use its structure as the pattern: tmpdir fixtures, `bun:test`, cleanup in
  `afterAll`). Check first whether a test file for this module already exists:
  `grep -rln "observed-reliability" tools/pipeline-v2/test/`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Typecheck | `bun run check:types` | exit 0 |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope**:
- `tools/pipeline-v2/src/lib/local-db-aggregates/route-observed-reliability.ts`
  (the one-line fix; plus exporting `canonicalRouteId` for testing ONLY if no
  higher-level seam is testable — prefer testing through an exported builder
  that consumes samples, if one exists in this module's exports)
- One new or extended test file under `tools/pipeline-v2/test/`

**Out of scope** (do NOT touch):
- Regenerating or migrating existing rows in `data/local/pipeline.sqlite` or
  published artifacts — data cleanup happens on the next scheduled aggregate
  run, not in this plan.
- `route-intervention-evaluation.ts`, `route-reliability-baseline.ts` — they
  have similar-looking helpers; leave them alone.

## Git workflow

- Branch: `advisor/069-canonical-route-id` off the current branch.
- One commit, e.g. "Observed reliability: reject route IDs outside the canonical universe".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the failing test

Add a test that feeds the aggregation a sample whose route ID normalizes to a
value NOT in the route universe (e.g. universe `{"M1"}`, sample route
`"ZZ9"`), plus a control sample that normalizes INTO the universe (universe
`{"M1"}`, sample route `"M001"`). Assert: the unknown ID produces no summary
row / is excluded; the normalizable one is attributed to `"M1"`. Test through
the module's exported surface (inspect its `export`s first); only export
`canonicalRouteId` directly if nothing exported exercises the path.

**Verify**: `bun --filter @bp/pipeline-v2 test` → the new test FAILS (unknown
ID is currently accepted). Do not proceed if it passes — that means the plan's
premise is wrong (STOP).

### Step 2: Fix the tautology

Change line 72 to:

```ts
  return routeUniverse.has(normalized) ? normalized : null;
```

**Verify**: `bun --filter @bp/pipeline-v2 test` → all pass, including the new
test. `bun run check:types` → exit 0.

## Test plan

- New/extended test file under `tools/pipeline-v2/test/` (co-locate with any
  existing observed-reliability tests) covering: (a) raw ID in universe →
  accepted as-is; (b) zero-padded ID normalizing into universe → accepted as
  normalized; (c) ID whose normalized form is NOT in universe → rejected;
  (d) non-string / empty → rejected.
- Pattern: model after `tools/pipeline-v2/test/commands/export/route-dossier-summaries.test.ts`
  (bun:test structure) or the module's existing test file if one exists.

## Done criteria

- [ ] `grep -n "? normalized : normalized" tools/pipeline-v2/src` returns no matches
- [ ] `bun --filter @bp/pipeline-v2 test` exits 0, including ≥3 new assertions
- [ ] `bun run check:types` exits 0
- [ ] Only the two in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 1's test passes before the fix — the premise is wrong; report what you
  observed instead.
- The exported surface of the module makes the behavior untestable without
  large refactors — report; do not restructure the module.

## Maintenance notes

- After this lands, the next full observed-reliability aggregate run may emit
  slightly different summaries (junk routes drop out). Anyone diffing served
  riders-tab numbers across releases should expect that.
- Reviewer: confirm the fix is exactly one token (`normalized` → `null`) plus
  tests — nothing else in the numeric path should change.
