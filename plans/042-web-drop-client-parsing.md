# Plan 042: Drop client-side response parsing — remove zod from the browser bundle

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ce3baca..HEAD -- apps/web/src/studio/api-client.ts apps/web/src/studio/api-contract.ts apps/web/package.json`
> Gen-4 plans 030-035 legitimately land before this plan and may touch the
> client error handling; on drift, re-read the live files and adapt the
> mechanical steps to the same end state (no runtime schema parsing). If the
> DESIGN has changed (e.g. someone added more client-side parsing), STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (removes a client-side contract tripwire; accepted trade —
  see "Why")
- **Depends on**: gen-4 plans 030-035 DONE (they own the serving contract
  and the web route pages this code feeds)
- **Category**: perf / tech-debt / migration
- **Planned at**: commit `ce3baca`, 2026-07-04

## Execution note — 2026-07-05

Completed. `apps/web/src/studio/api-client.ts` now treats Worker/API JSON as
typed data after HTTP success instead of running production zod `safeParse` in
the browser. `StudioApiError` remains for HTTP failures; `StudioApiContractError`
was removed. `apps/web/src/studio/api-contract.ts` is type-only, and the
route-scorecard fixture no longer imports domain schema values from production
`src`.

Bundle measurement:

- Before: entry `124.2 KB` gzip; total JS `314.3 KB` gzip.
- After: entry `124.1 KB` gzip; total JS `288.4 KB` gzip.

Verification passed:

- `bun --filter @bp/web typecheck`
- `bun --filter @bp/web build`
- `bun run test:web` (114 pass)
- `bun run test:worker` (19 pass, 4.97s)
- `bun run check:web-architecture` (19 pass)
- `bunx biome check --write` on the touched Plan 042 files (no fixes)

## Why this matters

Every Studio API response is zod-`safeParse`d in the browser
(`apps/web/src/studio/api-client.ts`), including a ~1.19 MB evidence payload
parsed on the main thread. That costs: zod plus the full domain response
schemas ship in the initial JS bundle; big payloads pay a main-thread parse
tax; and the schemas exist in the client purely to re-check what the worker
just composed. The gen-2 audit already earmarked "drop client-side zod
parsing" as a follow-up once server-side validation existed — plans 030/031
landed strict-compose + the error envelope on the server, so the tripwire is
now redundant with the server's own contract enforcement.

The trade is explicit and operator-accepted: a serving-contract bug now
shows up as wrong UI data or a runtime TypeError instead of a clean
`StudioApiContractError`. The server-side compose validation plus the
api-facade test suite is the detection layer. In exchange the browser drops
zod and every response schema from the bundle (bundle budget: 145 KB gz
entry / 390 KB total; entry was 118.5 KB on 2026-07-01 — record the actual
delta in the PR).

This plan also unblocks plan 043: after it, `apps/web` imports domain
TYPES only, so migrating domain's schema VALUES to Effect Schema cannot
touch the browser bundle ("Effect stays out of the browser" remains true by
construction).

## Current state

Verified 2026-07-04 at commit `ce3baca`.

**`apps/web/src/studio/api-client.ts`** (293 lines) — the only zod importer
in `apps/web`:
- `loadStudioJson<TSchema extends z.ZodType>(path, schema, options)` fetches,
  then `schema.safeParse(await response.json())`, throwing
  `StudioApiContractError(path, parsed.error)` on mismatch (lines 92-115);
  `loadNullableStudioJson` same + 404→null (lines 117-144).
- Nine `fetchStudio*` functions pass response schemas imported from
  `./api-contract.js` (e.g. `StudioRouteDetailResponseSchema`) and from
  `@bp/domain/maps` (`MapManifestResponseSchema`,
  `MapRouteSegmentFeatureCollectionSchema`).
- Two locally-defined zod schemas: `MapContextCollectionSchema` (lines
  212-221) and `NetworkMapFeatureCollectionSchema` (lines 230-258), with
  `NetworkMapFeatureCollection` / `NetworkMapFeature` exported as
  `z.output` types (lines 260-261).
- `StudioApiError` (HTTP errors, lines 39-61) is unrelated to parsing and
  STAYS.

**`apps/web/src/studio/api-contract.ts`** (108 lines) — a pure re-export
barrel over `@bp/domain/studio/*`: exports schema VALUES
(`StudioRoutesResponseSchema`, ...) and TYPES (`StudioRouteDetailResponse`,
...). After plan 036 removed the dead JsonSchema block, everything left
re-exports from domain.

**Who consumes what**: route/page modules import the `fetchStudio*`
functions and the TYPES; component code does not call `safeParse` itself
(the client module is the single parse chokepoint). Verify during step 1:
`rg -n "safeParse|\.parse\(" apps/web/src --glob '!node_modules'` — expect
hits only in `api-client.ts`.

**Bundle context**: `bun --filter @bp/web build` runs
`scripts/check-bundle-budget.ts` (145 KB gz entry / 390 KB total). zod ships
in the entry today via the api-client import chain.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck web | `bun --filter @bp/web typecheck` | exit 0 |
| Web build + budget | `bun --filter @bp/web build` | exit 0; budget report prints |
| Shared web tests | `bun run test:web` | all pass |
| Worker tests | `bun run test:worker` | all pass |
| Architecture harness | `bun run check:web-architecture` | all pass |

## Scope

**In scope**:
- `apps/web/src/studio/api-client.ts`
- `apps/web/src/studio/api-contract.ts` (convert to type-only re-exports)
- `apps/web/package.json` (remove `"zod": "catalog:"`), `bun.lock` via
  `bun install`
- Any `apps/web/src` file that imported `StudioApiContractError` or a
  schema VALUE from `api-contract.ts` (step 1 enumerates; expected: a
  handful of type-import line changes at most)

**Out of scope**:
- The worker (`apps/web/src/worker/**`) and `packages/studio-api` — server
  behavior unchanged.
- `packages/domain` (043 migrates it; this plan must leave domain able to
  keep exporting the same TYPE names).
- Any UI/visual change; any route loader logic beyond swapping the fetch
  helper's generics.
- The root catalog `zod` entry (plan 044 removes it when the LAST consumer
  is gone).

## Git workflow

- Branch: `plan/042-web-drop-client-parsing`; no push unless asked.

## Steps

### Step 1: Enumerate the blast radius and record the before-numbers

```bash
rg -n "safeParse|\.parse\(" apps/web/src --glob '!node_modules'        # expect: api-client.ts only
rg -ln "StudioApiContractError" apps/web/src                            # error-boundary/catch sites
rg -n "from \"./api-contract|from '\./api-contract" apps/web/src -l     # consumers of the barrel
bun --filter @bp/web build 2>&1 | tail -20                              # record current entry/total gz bytes
```

Record the bundle numbers in the PR notes. If parse sites exist OUTSIDE
api-client.ts, STOP (the chokepoint assumption broke).

### Step 2: Convert the fetch helpers to typed-not-validated

In `api-client.ts`:
1. Replace the schema-parameterized helpers with type-parameterized ones:
   ```ts
   async function loadStudioJson<T>(path: string, options: StudioQueryOptions = {}): Promise<T> {
     const response = await fetch(path, { ...same as today... });
     if (!response.ok) throw await apiError(response, path);
     return (await response.json()) as T;
   }
   ```
   and the nullable variant identically (+ the existing 404→null branch).
2. Each `fetchStudio*` function passes its response TYPE:
   `loadStudioJson<StudioRoutesResponse>(studioPath("studio.routes"), options)`
   — the type names already exist in `api-contract.ts`'s type re-exports.
3. Delete the two local zod schemas; keep their exported types as plain
   type declarations (`NetworkMapFeatureCollection`,
   `NetworkMapFeature`, and a minimal `MapContextCollection` type matching
   the deleted schema shape — copy the field structure from the deleted
   schema so the compile-time contract is unchanged).
4. Delete `StudioApiContractError` and its import sites: at each catch/
   instanceof site found in step 1, remove the branch (the remaining
   `StudioApiError` branch and the generic error path stay). Keep
   `StudioApiError` untouched.
5. Remove the `import * as z from "zod"` and the schema imports from
   `@bp/domain/maps` / `./api-contract.js`; import the map response TYPES
   instead (`import type { MapManifestResponse, ... } from "@bp/domain/maps"`
   — check the actual exported type names in `packages/domain/src/maps/`
   and use those).

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 3: Make `api-contract.ts` type-only

Convert every remaining schema VALUE re-export to its TYPE counterpart
(most types are already re-exported alongside; delete the value lines,
keep/add the `export type` lines). End state:
`rg -n "export \{" apps/web/src/studio/api-contract.ts` shows no non-type
value exports (the file may keep small value exports that are NOT schemas,
e.g. `emptyStudioRouteEvidenceBundle` — check its consumers; if used by UI
code it stays, and note that plan 043 must keep exporting it from domain).

**Verify**: `bun --filter @bp/web typecheck` → exit 0;
`rg -l "from \"zod\"|from 'zod'" apps/web/src` → empty.

### Step 4: Evict zod from the package and measure

Remove `"zod": "catalog:"` from `apps/web/package.json`; `bun install`;
`bun --filter @bp/web build`; record the new entry/total gz bytes next to
the step-1 numbers.

**Verify**: build exits 0; bundle budget passes; entry gz is SMALLER than
step-1's number (any growth = STOP); `rg zod apps/web/package.json` → empty.

### Step 5: Full gate

**Verify**: `bun run test:web`, `bun run test:worker`,
`bun run check:web-architecture` → all green. `git status` → only in-scope
files.

## Test plan

- Existing `apps/web/test/shared` + route-scorecard tests (run via
  `test:web`) cover the fetch helpers' consumers; they must pass unchanged
  (if any test asserted `StudioApiContractError`, update it to the new
  behavior: malformed payload now surfaces at the point of use, so the test
  should instead assert the server-side contract via the worker tests —
  list any such test edits in the PR notes).
- New test: `apps/web/test/shared/api-client.test.ts` (or extend the
  existing shared test file if one covers api-client): `loadStudioJson`
  throws `StudioApiError` with `code`/`status` on a non-OK response, and the
  nullable variant returns null on 404. (These behaviors exist today and
  must survive the rewrite.)

## Done criteria

- [x] `rg -l "zod" apps/web/src apps/web/package.json` → empty
- [x] `rg -n "safeParse" apps/web/src` → empty; `StudioApiContractError` no longer exists
- [x] Entry bundle gz decreased vs the recorded step-1 baseline (124.2 KB → 124.1 KB)
- [x] `bun --filter @bp/web build` (budget), `test:web`, `test:worker`, `check:web-architecture` all green
- [x] `apps/web/src/studio/api-contract.ts` exports types only
- [x] `plans/README.md` status row updated

## STOP conditions

- Step 1 finds parse sites outside `api-client.ts`, or a component that
  passes SCHEMAS around as values.
- A value export of `api-contract.ts` (schema) is consumed somewhere you
  cannot convert to a type without behavior change (e.g. runtime `.parse`
  in a loader you didn't know about).
- Bundle entry size does not shrink after step 4.
- Gen-4 plans are not all DONE in `plans/README.md` — sequencing violation;
  report instead of proceeding.

## Maintenance notes

- Contract-drift detection now lives server-side only (strict compose +
  api-facade tests + the plan-031 envelope). If drift bugs start appearing
  in the field, the correct re-add is a DEV-ONLY parse behind
  `import.meta.env.DEV`, not a production dependency.
- Plan 043 (domain → Effect Schema) relies on this plan: after it, web
  imports domain types only, so domain's schema-library choice cannot leak
  into the browser bundle. The boundary test to keep honest:
  `rg 'from "effect"' apps/web/src` must stay empty (gen-3 shared
  constraint).
- Reviewer: confirm no `as any` crept in — the casts should be `as T` at
  exactly two helper return sites.
