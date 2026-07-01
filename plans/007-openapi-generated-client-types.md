# Plan 007: Generate Studio API client types from the served OpenAPI document and retire hand-maintained type plumbing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 58dfaeb..HEAD -- packages/studio-api/src/contracts/ apps/web/src/studio/ apps/web/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (independent of the Effect decision; survives plan 009 because only the OpenAPI *producer* changes there)
- **Category**: dx
- **Planned at**: commit `58dfaeb`, 2026-06-13

### Blocked note - 2026-07-01

Blocked at Step 2. `openapi-typescript@7.13.0` can load the served
`studioOpenApiDocument`, but fails while bundling response schemas because the
current zod-derived JSON Schemas contain nested local `$ref`s to `$defs` that
are not resolvable from their embedded OpenAPI locations. Example failures
include unresolved refs under `/api/v1/status`, `/api/v1/routes`,
`/api/v1/map/manifest`, and `/api/v1/hotspots`, such as
`#/paths/~1api~1v1~1status/get/responses/200/content/application~1json/schema/$defs/bp.api_data_quality.v1/properties/releaseLayer`.
Per the STOP condition, do not add a generated client until the OpenAPI
document is bundled or emitted with resolver-safe schema references.

## Why this matters

The repo already maintains a real OpenAPI document (`studioOpenApiDocument`, assembled from zod-derived JSON Schemas and served at `/api/openapi.json`), yet none of its type information reaches the frontend at compile time: `apps/web/src/studio/api-client.ts` (~820 lines) hand-pairs every route with its zod schema, and `packages/studio-api/src/client/fetch.ts` returns `Promise<unknown>`. Generating TypeScript types from the OpenAPI document gives the "free typed client" the maintainer wants — with **zero runtime bytes added** (generated types erase at compile time), which matters because the initial-JS budget has 59 bytes of headroom. It also creates a drift alarm: if a handler's response schema changes, the generated types change, and call sites that no longer match fail typecheck.

## Current state

- `packages/studio-api/src/contracts/openapi.ts:725` — `export const studioOpenApiDocument = {...}` — hand-assembled OpenAPI 3.1 doc; operations carry real request/response JSON Schemas imported from `@bp/domain/json-schema` (which derives them via zod 4's native `z.toJSONSchema`, see `packages/domain/src/schema-registry.ts:30`).
- `packages/studio-api/src/schema-routes.ts` — serves the doc: `if (url.pathname === "/api/openapi.json") return json(studioOpenApiDocument);`
- `packages/studio-api/src/contracts/registry.ts` — 61 route specs; the `responses?:` field of `RouteSpec` is populated **zero** times (`grep -c "responses:" registry.ts` → 0). The OpenAPI doc, not the registry, is the only machine-readable source of response shapes.
- `apps/web/src/studio/api-client.ts:147-170` — the consumption pattern (repeated for ~30 wrapper functions):

  ```ts
  async function loadStudioJson<TSchema extends z.ZodType>(
    path: string, schema: TSchema, options: StudioQueryOptions = {},
  ): Promise<z.output<TSchema>> {
    const response = await fetch(path, { credentials: "same-origin", ... });
    if (!response.ok) throw await apiError(response, path);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new StudioApiContractError(path, parsed.error);
    return parsed.data;
  }
  ```

- `apps/web/src/studio/api-contract.ts` — re-exports zod schemas (values) and ~100 types from `@bp/domain`; this file plus its schema imports form the `api-contract` chunk: **31,178 bytes gzipped, marked `"initial": true`** in `data/artifacts/web-audits/latest/performance-budget.json`.
- `apps/web/package.json` scripts: `"build": "vite build && bun run check:bundle-budget"`, `"typecheck": "tsc -p tsconfig.json --noEmit --pretty false"`.
- Repo conventions: Biome formatting (`bun run check:style`), Bun catalog for shared dep versions in root `package.json` `workspaces.catalog`.

**What this plan does NOT do**: it does not remove the runtime `safeParse` validation. Client-side response validation is the only contract enforcement that exists today (the server does not validate responses). Removing it — and harvesting the ~31 KB gz bundle win — is deliberately deferred until server-side enforcement exists (see plans 008/009 and Maintenance notes).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Generate types | `bun run --cwd apps/web generate:api-types` (created in step 2) | exit 0, file emitted |
| Typecheck web | `bun --filter @bp/web typecheck` | exit 0 |
| Typecheck studio-api | `bun --filter @bp/studio-api typecheck` | exit 0 |
| Web unit tests | `bun run test:web` (repo root) | all pass |
| Web build + budget | `bun --filter @bp/web build` | exit 0, budget check passes |
| Style | `bun run check:style` | exit 0 |

Do NOT run repo-wide `bun run check:types` — it OOMs at the default node heap; use the scoped typechecks above.

## Scope

**In scope**:
- `apps/web/package.json` — add `openapi-typescript` devDependency (via catalog entry in root `package.json`) and a `generate:api-types` script
- `apps/web/scripts/generate-api-types.ts` (create)
- `apps/web/src/studio/api-types.gen.ts` (generated output, committed)
- `apps/web/src/studio/api-client.ts` — bind wrapper return types to generated types (type-level only)
- `tests/harness/` or `apps/web/test/shared/` — freshness test (step 4)
- `packages/studio-api/src/contracts/openapi.ts` — ONLY if step 3 reveals an operation consumed by the web app that is missing a response schema; add the missing operation entry following the existing `jsonResponse(description, schema)` pattern in that file
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- The runtime fetch/validate behavior of `api-client.ts` — `safeParse` stays; this plan is type-level
- `packages/domain` schema definitions
- `packages/studio-api/src/client/fetch.ts` — unused by the web app; leave it (its retirement belongs to plan 009)
- Route files under `apps/web/src/routes/` — eager imports there are perf-sensitive (initial-JS budget); nothing in this plan requires touching them

## Git workflow

- Branch: `advisor/002-openapi-client-types`
- Commit per step; sentence-case imperative messages (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the codegen dependency

Add `"openapi-typescript": "^7"` to the root `package.json` `workspaces.catalog`, then in `apps/web/package.json` add devDependency `"openapi-typescript": "catalog:"`. Run `bun install`.

**Verify**: `bun install` → exit 0; `bun pm ls --cwd apps/web 2>/dev/null | grep openapi-typescript` (or check `bun.lock`) shows it resolved.

### Step 2: Write the generation script

Create `apps/web/scripts/generate-api-types.ts`:

- Import `studioOpenApiDocument` from `@bp/studio-api/contracts/openapi.js` (check `packages/studio-api/package.json` `exports` first; if the subpath isn't exported, import from the package root or add nothing — instead serialize via a relative import as the existing check scripts do, e.g. how `apps/web/scripts/check-bundle-budget.ts` reaches into the repo).
- Call `openapi-typescript`'s programmatic API (`import openapiTS, { astToString } from "openapi-typescript"`) on the document object.
- Write the result to `apps/web/src/studio/api-types.gen.ts` with a `// Generated by scripts/generate-api-types.ts — do not edit.` header.

Add to `apps/web/package.json` scripts: `"generate:api-types": "bun scripts/generate-api-types.ts"`.

**Verify**: `bun run --cwd apps/web generate:api-types` → exit 0; `head -5 apps/web/src/studio/api-types.gen.ts` shows the header and `export interface paths {`.

### Step 3: Bind wrapper return types to generated types

In `apps/web/src/studio/api-client.ts`, for each exported wrapper (e.g. `fetchStudioRoutes`, `fetchStudioRouteIndex2`, the brief/finding/search fetchers), add a compile-time assertion that the zod-derived return type matches the generated OpenAPI type for that path+method. Pattern (define one helper in the file):

```ts
import type { paths } from "./api-types.gen.js";

type ApiJson<P extends keyof paths, M extends keyof paths[P]> = /* index into
  responses -> 200 -> content -> "application/json" */;

// compile-time drift alarm, zero runtime cost:
type _AssertRoutes = Expect<Mutual<Awaited<ReturnType<typeof fetchStudioRoutes>>,
  ApiJson<"/api/v1/studio/routes", "get">>>;
```

where `Expect`/`Mutual` are the usual `A extends B ? B extends A ? true : never : never` two-way-assignability helpers defined locally. Add assertions for every wrapper whose path+method exists in the generated `paths`. Where a wrapper's operation is **missing** from the OpenAPI doc, add the operation to `packages/studio-api/src/contracts/openapi.ts` following its existing `jsonResponse(description, schema)` pattern (the JSON schema to reference already exists in `@bp/domain/json-schema` — that is where `api-contract.ts` gets the zod schema from), regenerate, then assert.

Expect friction: zod `.optional()` vs OpenAPI `required` arrays, `null` vs absent. Where the assertion fails, the *schemas themselves disagree* — fix the OpenAPI operation entry (or report via STOP if the disagreement is in `@bp/domain`).

**Verify**: `bun --filter @bp/web typecheck` → exit 0. `bun --filter @bp/studio-api typecheck` → exit 0 (if openapi.ts was touched).

### Step 4: Freshness guard

Add a test (model after the existing harness style in `tests/harness/production-boundaries.test.ts`, which runs via `bun run check:architecture` / `bun test tests/harness/...`) that regenerates the types in-memory and diffs against the committed `api-types.gen.ts`, failing with the message `Run: bun run --cwd apps/web generate:api-types` on mismatch. Place it so `bun run test:web` or the harness suite picks it up — `apps/web/test/shared/api-types-freshness.test.ts` is consistent with the `test:web` glob (`bun test apps/web/test/route-scorecards apps/web/test/shared`).

**Verify**: `bun run test:web` → all pass. Then mutate one character in `api-types.gen.ts`, re-run → that test fails; revert the mutation.

### Step 5: Full gate

**Verify**: `bun --filter @bp/web build` → exit 0 and the bundle-budget check passes (this plan adds only types; `initialJsGzipBytes` must be unchanged from `data/artifacts/web-audits/latest/performance-budget.json` within noise). `bun run check:style` → exit 0.

## Test plan

- `apps/web/test/shared/api-types-freshness.test.ts` (new): committed generated file matches regeneration (case: in sync → pass; mutated → fail).
- The type assertions in step 3 are themselves the contract tests — they have no runtime, but `typecheck` is the gate.
- Existing suites must stay green: `bun run test:web`, `bun --filter @bp/studio-api test`.

## Done criteria

- [ ] `apps/web/src/studio/api-types.gen.ts` exists, is committed, and regenerating produces zero diff
- [ ] Every exported fetcher in `api-client.ts` has a compile-time assertion against `paths`, or a code comment naming the missing operation + a STOP report
- [ ] `bun --filter @bp/web typecheck` and `bun --filter @bp/studio-api typecheck` exit 0
- [ ] `bun run test:web` passes including the freshness test
- [ ] `bun --filter @bp/web build` passes with `initialJsGzipBytes` unchanged
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `openapi-typescript` cannot parse `studioOpenApiDocument` (the doc is hand-assembled; a structural error in it is a finding to report, not to patch around silently).
- A step-3 assertion failure traces to a wrong schema in `packages/domain` (out of scope — report which schema and which direction the mismatch goes).
- More than ~5 operations consumed by the web app are missing from the OpenAPI doc — that's a bigger doc-coverage gap than this plan budgeted; report the list.
- The bundle budget check regresses at step 5 — types should be free; a regression means something was imported as a value. Find it or report.

## Maintenance notes

- **Deferred follow-up (deliberate)**: once server-side response validation exists (plan 008 adds dev/test response checks; plan 009 makes them structural), the client's runtime `safeParse` and the schema re-export layer in `api-contract.ts` can be dropped in favor of the generated types + a ~2 KB typed fetch wrapper. That harvests most of the 31 KB gz `api-contract` initial chunk — the single largest available initial-JS win. Do not do it before server-side validation lands: today the client parse is the only contract enforcement in the system.
- If plan 009 (Effect HttpApi) lands, the OpenAPI document becomes derived instead of hand-assembled; only `generate-api-types.ts`'s import site changes. The generated-types consumers are unaffected.
- Reviewers: scrutinize step-3 assertion helpers for accidental `any` (an `any` makes every assertion vacuously pass).
