# Plan 009: Migrate the studio-api HTTP plumbing to @effect/platform HttpApi (worker-side only)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 58dfaeb..HEAD -- packages/studio-api/src/ apps/web/src/worker/`
> This plan was written against `58dfaeb` but REQUIRES plans 006 and 008 to
> have landed first, so drift in `api.ts`/`contracts/` from plan 008 is
> expected — re-read those files before starting. Drift anywhere else is a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/006 (ADR-0019 spike verdict must be PASS), plans/008 (centralized enforcement must be landed), plans/007 recommended (typed-client codegen survives this migration)
- **Category**: migration
- **Planned at**: commit `58dfaeb`, 2026-06-13
- **Blocked**: 2026-07-01. The required worker-side ADR/spike PASS does not
  exist. The live ADR is `docs/decisions/0019-effect-runtime-for-pipeline.md`,
  and it accepts Effect for pipeline command runtime/service boundaries only.
  Per this plan's Step 0 and STOP conditions, do not add `@effect/platform`
  HttpApi to the Worker until a new worker-specific ADR or spike records an
  explicit PASS.

## Block note

The hard cutover also invalidated much of this plan's original scope: the
brief-draft authoring routes, auth flows, Durable Object authoring path, and
61-route registry are gone or greatly reduced. Plan 008 now provides the live
registry-based cache/auth/idempotency enforcement, and Plan 012 hardens the
serving error/key boundary without adding Worker-side Effect.

To revive this plan, first write a new Worker/API ADR or spike that:

- measures the current Effect 4 beta `HttpApi` worker bundle footprint under
  workerd/Vite;
- proves no browser-reachable `apps/web/src` code imports `effect` or
  `@effect/*`;
- re-scopes the migration to the post-cutover route registry and current
  public-only API surface;
- records an explicit PASS threshold and verification commands.

## Why this matters

`packages/studio-api` carries ~2.4k LOC of hand-rolled HTTP machinery: a 61-entry route registry, a regex router, a 746-line hand-assembled OpenAPI document, a path builder, response envelopes, and an untyped client. Every new endpoint is wired in four places, and the OpenAPI doc drifts from reality because nothing derives it. `@effect/platform`'s `HttpApi` collapses this: one declarative API definition yields the router, the OpenAPI document, request/response boundary validation (which the current stack lacks entirely — handlers can ship responses that violate their declared schema), and a derived typed client. This is the maintainer's explicitly requested direction ("use the entire effect stack… with http api we get free openapi client generation"), scoped to where the audit found it viable: **the worker only**. Effect must not reach the browser bundle (59 bytes of initial-JS headroom) — the client keeps consuming generated OpenAPI types (plan 007).

## Current state

(Re-verify all of this after plan 008's changes.)

- `packages/studio-api/src/api.ts` — dispatcher; after plan 008 it consults `findRouteSpec` for auth/idempotency/cache enforcement, then cascades: auth routes → observability → identity surfaces → schema routes → brief-draft regexes (dynamic `import()` of `./studio/brief-drafts.js` for code-splitting) → `handleStudioReadRequest` → `handlePublicApiRoutes` → 404.
- `packages/studio-api/src/contracts/registry.ts` (~870 LOC) — 61 `RouteSpec`s: `{ id, operationId, method, path, tags, summary, auth, cache, idempotency }`; `params/query/body/responses` zod fields exist on the type but `responses` is never populated.
- `packages/studio-api/src/contracts/openapi.ts` (~746 LOC) — `studioOpenApiDocument` hand-assembled; response schemas come from `@bp/domain/json-schema` (zod 4 `z.toJSONSchema` output, see `packages/domain/src/schema-registry.ts:30`).
- `packages/studio-api/src/client/fetch.ts` (85 LOC) — generic client returning `Promise<unknown>`; **not used by apps/web** (the web app has its own `apps/web/src/studio/api-client.ts`).
- `packages/studio-api/src/public-api.ts` (784 LOC) — parallel route system, hand-checked paths, NOT in the registry.
- Handler shape: `async (request: Request, env: StudioApiEnv, url: URL) => Promise<Response | null>`; env carries Cloudflare bindings (`DB` D1, `ARTIFACTS` R2, `AI`, `BRIEF_AUTHOR_AGENT` Durable Object, secrets).
- Worker entry: `apps/web/src/worker/index.ts` — imports `@bp/studio-api/server/worker` and re-exports the `BriefAuthorAgent` Durable Object class.
- Business logic to preserve byte-for-byte at the response level: `studio/brief-drafts.ts` (4,204 LOC), `studio/read-handlers.ts` (2,906 LOC), `source-refresh.ts`, `identity-surface-routes.ts`, `auth-routes.ts` (Set-Cookie flows).
- Error envelope contract consumed by the web client: `{ error: { code, message } }` (see `apps/web/src/studio/api-client.ts:129-145` `readErrorBody`).
- Domain schemas stay **zod** per ADR-0019 — this plan introduces Effect Schema ONLY for HTTP endpoint definitions, with a parity test against the zod originals.
- Tests: `bun --filter @bp/studio-api test`; workerd-runtime: `bun run test:worker`; web build+budget: `bun --filter @bp/web build`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Typecheck | `bun --filter @bp/studio-api typecheck` | exit 0 |
| Package tests | `bun --filter @bp/studio-api test` | all pass |
| Worker smoke tests | `bun run test:worker` (root) | all pass |
| Web build + bundle budget | `bun --filter @bp/web build` | exit 0, budget passes |
| Initial-JS guard | inspect `data/artifacts/web-audits/latest/performance-budget.json` after `bun run check:web-release` | `initialJsGzipBytes` ≤ previous value |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope**:
- `packages/studio-api/package.json` — add `effect`, `@effect/platform` (versions from ADR-0019; add to root catalog)
- `packages/studio-api/src/effect-api/` (new directory: API definition, middleware, handler adapters)
- `packages/studio-api/src/api.ts` — progressive cutover switch
- `packages/studio-api/src/contracts/{registry,openapi,routing,path-builder}.ts` and `src/client/fetch.ts` — deletion at the END (step 6), only after parity holds
- `packages/studio-api/src/public-api.ts` — fold its routes into the API definition (last family)
- `packages/studio-api/test/` — parity + middleware tests
- `apps/web/scripts/generate-api-types.ts` — repoint to the derived OpenAPI doc (if plan 007 landed)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `apps/web/src/**` client code (except the codegen script above) — Effect must not be imported anywhere reachable from the browser bundle
- `packages/domain` — zod schemas remain canonical for artifacts/pipeline
- Business-logic internals of `brief-drafts.ts` / `read-handlers.ts` — they get *adapted*, not rewritten
- `BriefAuthorAgent` Durable Object implementation

## Git workflow

- Branch: `advisor/004-effect-httpapi`
- Commit per migrated route family; sentence-case imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Gate check

Read `docs/decisions/0019-effect-adoption-boundaries.md`. If the spike verdict is not `PASS`, mark this plan BLOCKED in `plans/README.md` and stop. Record the Effect versions it names and use exactly those.

### Step 1: Stand up the Effect API skeleton behind the existing facade

Add deps. Create `src/effect-api/api.ts` defining an `HttpApi` with ONE endpoint to start — `system.health` (`GET /api/health`) — using Effect Schema for its response (mirror the zod `HealthResponseSchema` from `@bp/domain/routes`). Build a fetch-handler with `HttpApiBuilder` + the platform's web handler adapter (consult the installed package — the module names moved across 0.x platform releases; do not trust memory). In `api.ts`, route `/api/health` to the Effect handler FIRST, leaving the legacy cascade as fallback for everything else.

**Verify**: `bun --filter @bp/studio-api test` green; `bun run test:worker` green (proves Effect runs under workerd); `bun --filter @bp/web build` passes budget AND `grep -rn "from \"effect\"\|from \"@effect/" apps/web/src --include='*.ts' --include='*.tsx'` → no matches.

### Step 2: Re-express the cross-cutting middleware

In `src/effect-api/middleware.ts`, implement as HttpApi middleware/layers, with behavior identical to plan 008's central gate (port its tests):

1. **Auth**: session resolution (reuse `studio/auth.ts` resolution exactly — wrap, don't reimplement token hashing) + scope check from endpoint annotations; 401 `UNAUTHENTICATED` / 403 `FORBIDDEN` in the `{error:{code,message}}` envelope.
2. **Idempotency-Key presence** for annotated mutations; 400 `IDEMPOTENCY_KEY_REQUIRED`.
3. **Cache policy** application on egress (don't overwrite handler-set headers).
4. **Server-Timing**: port `http/timing.ts` semantics (`withServerTiming` family names: `studio`, `studio-draft`).
5. **Error envelope**: map all Effect failures/defects to `{ error: { code, message } }` with correct statuses — the web client's `readErrorBody` depends on this shape.

Carry auth/cache/idempotency metadata via `HttpApiEndpoint` annotations so the API definition replaces the registry as the single declaration point.

**Verify**: port plan 008's 8 enforcement tests to run against the Effect handler for the health endpoint + one stub session endpoint → all pass.

### Step 3: Migrate route families, one commit each

Order (lowest risk first): schema routes → observability → public reads from `read-handlers.ts` → `public-api.ts` routes → identity surfaces → auth routes (Set-Cookie!) → brief-draft mutations (Durable Object + `ExecutionContext` access) last.

For each family:
- Define endpoints with Effect Schema request/response schemas. Translate from the zod originals mechanically; keep names aligned (`StudioRoutesResponse` etc.).
- **Adapter pattern**: each Effect handler unwraps to the existing implementation function, passing `(request, env, url)` — get the raw `Request` and bindings from the platform's request context. Business logic files keep their signatures.
- Add a **parity test** per family: for a fixture request, legacy handler response and Effect handler response match on status, body JSON, and headers (minus `Date`-like noise). Build fixtures from existing tests in `packages/studio-api/test/`.
- Add a **schema parity test**: sample fixture payloads accepted by the zod schema must be accepted by the Effect Schema and vice versa (run both `safeParse` and `Schema.decodeUnknownEither` on shared fixtures).
- Flip that family's paths from the legacy cascade to the Effect handler.

Preserve the dynamic-import code split for brief-drafts (the Effect group for drafts must live in a module loaded via `await import()` on first match, as today at `api.ts:55`).

**Verify after EACH family**: `bun --filter @bp/studio-api test` + `bun run test:worker` green; `bun --filter @bp/web build` budget passes.

### Step 4: Derive the OpenAPI document

Replace `studioOpenApiDocument` with the document derived from the `HttpApi` definition (`OpenApi.fromApi` or the installed equivalent). Serve it at `/api/openapi.json` as today. If plan 007 landed: repoint `apps/web/scripts/generate-api-types.ts` to the derived doc, regenerate, and fix type fallout — generated-type changes ARE the report of contract drift between hand-assembled and derived docs; list every diff in the commit message.

**Verify**: `bun run --cwd apps/web generate:api-types` → exit 0; `bun --filter @bp/web typecheck` → exit 0; freshness test green.

### Step 5: Decommission the legacy plumbing

Only when every family is on Effect: delete `contracts/openapi.ts`, `contracts/routing.ts`, `contracts/path-builder.ts`, `client/fetch.ts`, and shrink `contracts/registry.ts` to whatever (if anything) still imports it — target: nothing; the API definition is the registry. Remove now-dead in-handler scope checks flagged in plan 008's maintenance notes. Update `api.ts` to be a thin mount of the Effect handler + 404.

**Verify**: `grep -rn "studioOpenApiDocument\|buildRoutePath\|findRouteSpec" packages/studio-api/src apps/web/src` → only the new derived-doc export remains; full gate: `bun --filter @bp/studio-api test`, `bun run test:worker`, `bun --filter @bp/web build`, `bun run check:style` all green.

### Step 6: Footprint audit

Run `bun run check:web-release`. Compare `data/artifacts/web-audits/latest/performance-budget.json` `initialJsGzipBytes` to the pre-migration value (171,973 at plan time): must not increase. Check the worker bundle: the wrangler/vite build output chunk sizes (worker-side) may grow by at most the ADR-0019 measured HttpApi footprint + 20%.

**Verify**: numbers recorded in the final commit message.

## Test plan

- Per-family response parity tests (step 3) — the core safety net; model fixtures on `test/api-facade.test.ts`.
- Schema parity tests zod↔Effect Schema on shared fixtures.
- Ported enforcement tests from plan 008 (auth 401/403, idempotency 400, cache headers, no-overwrite).
- Error envelope test: a handler that throws produces `{error:{code,message}}` with status 500, not an Effect stack dump.
- Set-Cookie test for magic-link consume + signout flows.
- All existing suites stay green throughout — never commit a family with a failing parity test.

## Done criteria

- [ ] All 61 registry routes + the public-api routes served by the Effect handler; legacy cascade deleted
- [ ] `/api/openapi.json` is derived, not hand-assembled; `contracts/openapi.ts` deleted
- [ ] `grep -rn "from \"effect\"\|from \"@effect/" apps/web/src` → no matches (worker entry `apps/web/src/worker/` excepted)
- [ ] `bun --filter @bp/studio-api test`, `bun run test:worker`, `bun --filter @bp/web build`, `bun run check:style` all exit 0
- [ ] `initialJsGzipBytes` ≤ pre-migration value
- [ ] Parity tests exist for every migrated family
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- ADR-0019 verdict is FAIL or absent (step 0).
- Plan 008 has not landed (no `findRouteSpec` gate in `api.ts`) — the middleware port in step 2 has no behavioral reference.
- Effect's web-handler adapter cannot access `ExecutionContext`/Durable Object bindings needed by brief-drafts — report before inventing a bridge.
- Any parity test cannot be made to pass without changing business-logic internals (out of scope).
- A zod↔Effect Schema parity failure traces to a semantic gap (e.g. zod `.passthrough()`-style unknown-key tolerance with no Effect equivalent configured) — list affected schemas; this may force scoping decisions a human should make.
- Worker bundle growth exceeds the ADR-measured footprint + 20%, or `bun run test:worker` shows startup/latency regressions.
- A migrated family changes any response observed by `apps/web` (client contract errors in `test:web`).

## Maintenance notes

- After this lands, the HttpApi definition in `src/effect-api/` is the single source of truth for routes, auth, cache, idempotency, and OpenAPI. The parity tests can be deleted one release after cutover.
- The zod↔Effect Schema duplication for HTTP contracts is a permanent cost of keeping `packages/domain` on zod (ADR-0019). The schema parity tests are the drift alarm; keep them.
- If `@effect/platform`'s HttpApi API shifts (it is sub-1.0), pin the version in the catalog and upgrade deliberately with the parity suite as the gate.
- Future endpoints: add to the HttpApi definition; the derived OpenAPI + plan 007 codegen propagates types to the client with no manual wiring.
