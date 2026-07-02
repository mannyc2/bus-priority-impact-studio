# Plan 008: Enforce the contract registry's auth, cache, and idempotency metadata centrally in the API dispatcher

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 58dfaeb..HEAD -- packages/studio-api/src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `58dfaeb`, 2026-06-13

### Completion note - 2026-07-01

Completed against the hard-cutover Studio API. The private authoring/session
surfaces that motivated the original auth memoization steps were deleted before
this plan ran, so the live registry now contains public routes with
`noIdempotency`. The dispatcher now resolves the matched route spec centrally,
fails closed for any future `session` route or missing required
`Idempotency-Key`, and applies declared cache policies to registry-backed
responses without overwriting handler-set cache headers. Tests cover route-spec
lookup, public cache headers, private no-store RUM responses, and preserving the
artifact handler's immutable cache policy.

## Why this matters

`packages/studio-api/src/contracts/registry.ts` declares, for each of 61 routes, an auth requirement (`public` / `optional-session` / `session` + scopes), a cache policy, and an idempotency policy. **None of this is enforced by the dispatcher** — `src/api.ts` is a hand-ordered cascade that never reads a route spec. Auth/scope checks live inside individual handler families; cache headers for studio reads are not set anywhere (`grep -n "Cache-Control" src/studio/read-handlers.ts` → no matches, despite every read route declaring `publicStudioCache`); the `Idempotency-Key` requirement is enforced for brief-draft mutations only (`src/studio/brief-drafts.ts:1825`). The failure mode is silent: a new mutation route added to the registry with `scopes: ["write:briefs"]` ships with **no** access control unless its handler remembers to check. Centralizing enforcement turns the registry from documentation into the actual security boundary — and it is the prerequisite reshaping for any later framework swap (plan 009), because handlers stop owning cross-cutting concerns.

## Current state

- `packages/studio-api/src/api.ts:13-90` — the dispatcher. Sequential cascade: method check (via `allowedApiMethodsForPath`) → `handleAuthRoutes` → `handleObservabilityRoutes` → `handleIdentitySurfaceRoutes` → `handleSchemaRoutes` → brief-draft regexes (dynamic import) → `handleStudioReadRequest` → `handlePublicApiRoutes` → 404. No route spec is consulted.
- `packages/studio-api/src/contracts/route-spec.ts` — the `RouteSpec` type: `auth: RouteAuth`, `cache: RouteCachePolicy`, `idempotency: IdempotencyPolicy` (full type shown in that file; `RouteAuth` is `{kind:"public"} | {kind:"optional-session"} | {kind:"session"; scopes: readonly string[]}`).
- `packages/studio-api/src/contracts/routing.ts` — already compiles each registry path to a regex (`compileRoutePath`, `:param` → `[^/]+`, trailing `*` wildcard) but only exposes `isApiPath`, `isStudioApiPath`, `studioRouteTemplate`, `allowedApiMethodsForPath`. There is no "give me the matched `RouteSpec` for this method+path" helper. The compiled arrays `studioRouteTemplates` / `apiRoutes` drop the spec, keeping only `{method, path, regex}`.
- `packages/studio-api/src/contracts/cache-policy.ts` — `publicStudioCache = { kind: "public", maxAgeSeconds: 60, staleWhileRevalidateSeconds: 86_400 }`, `privateNoStore`, `noStore`.
- `packages/studio-api/src/contracts/idempotency.ts` — `requiredMutationIdempotency = { kind: "required", header: "Idempotency-Key", ... }`.
- `packages/studio-api/src/studio/auth.ts` — session resolution. `hasStudioScope(operator, scope)` at ~line 82 (`return operator.scopes.includes(scope)`); resolution does a DB lookup (D1) of the hashed session token. Brief-draft handlers call their own `requireStudioOperator(request, env, scope, ...)`.
- `packages/studio-api/src/http/json.ts` — `jsonResponse` sets only Content-Type; `noContentResponse` sets `Cache-Control: no-store`.
- `packages/studio-api/src/public-api.ts` — does NOT use the registry (hand-checked paths); only `/api/v1/artifacts/*` sets a Cache-Control header (`public-api.ts:565`, `public, max-age=31536000, immutable`).
- Tests live in `packages/studio-api/test/` (e.g. `test/api-facade.test.ts`); run with `bun --filter @bp/studio-api test`. Worker-runtime smoke tests: `bun run test:worker` (Vitest workers pool, from repo root).
- Convention: handlers return `Response | null` (null = "not mine, keep cascading"); error envelope is `{ error: { code, message } }` via `src/http/errors.ts` `errorResponse(status, message, code)`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Typecheck | `bun --filter @bp/studio-api typecheck` | exit 0 |
| Package tests | `bun --filter @bp/studio-api test` | all pass |
| Worker smoke tests | `bun run test:worker` (repo root) | all pass |
| Web build (consumer sanity) | `bun --filter @bp/web build` | exit 0 |
| Style | `bun run check:style` | exit 0 |

Do NOT run repo-wide `bun run check:types` — it OOMs; use the scoped typecheck.

## Scope

**In scope**:
- `packages/studio-api/src/contracts/routing.ts` — add `findRouteSpec(method, pathname): StudioApiRoute | null`
- `packages/studio-api/src/api.ts` — central enforcement
- `packages/studio-api/src/studio/auth.ts` — per-request identity memoization (step 3)
- `packages/studio-api/src/studio/brief-drafts.ts` — ONLY to remove now-redundant `Idempotency-Key`-presence check if step 4 makes it dead (keep the replay/dedupe machinery)
- `packages/studio-api/test/` — new tests
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `packages/studio-api/src/contracts/registry.ts` route entries — if you find a route whose declared auth looks wrong (e.g. a mutation marked `public`), STOP and report; do not "fix" the declaration yourself
- `src/public-api.ts` internals and its hand-rolled routing (it is not registry-backed; unifying it is plan 009's business)
- Handler business logic in `brief-drafts.ts` / `read-handlers.ts` beyond the single redundancy removal above — in particular, LEAVE the in-handler scope checks in place (defense in depth during the transition)
- `apps/web` client code

## Git workflow

- Branch: `advisor/003-registry-enforcement`
- Commit per step; sentence-case imperative messages (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Expose spec lookup from the routing module

In `contracts/routing.ts`, keep the spec alongside the compiled regex (extend `CompiledRoute` with `spec: StudioApiRoute` or map in parallel) and export:

```ts
export function findRouteSpec(method: string, pathname: string): StudioApiRoute | null;
```

Match on `route.method === method && route.regex.test(pathname)`. Preserve the existing sort (non-wildcard first, longer paths first) so the most specific spec wins. Re-export through `contracts/index.ts` (and `http/routing.ts` re-exports if needed by `api.ts`'s import path).

**Verify**: `bun --filter @bp/studio-api typecheck` → exit 0. Add a unit test now (see Test plan, case 1) and run `bun --filter @bp/studio-api test` → passes.

### Step 2: Central auth gate in the dispatcher

In `api.ts`, after the 405 check and **before** the handler cascade, resolve the spec: `const spec = findRouteSpec(request.method, url.pathname)`. When `spec !== null` and `spec.auth.kind === "session"`:

- Resolve identity via the existing resolver in `studio/auth.ts` (use whatever function `requireStudioOperator` builds on — read `studio/auth.ts` first and reuse its exported resolution path; do not duplicate token-hash logic).
- No valid session → `errorResponse(401, "Authentication is required.", "UNAUTHENTICATED")`.
- Valid session but a scope in `spec.auth.scopes` is missing from `operator.scopes` → `errorResponse(403, "Missing required scope.", "FORBIDDEN")`.

Routes with `spec === null` (e.g. public-api paths, which are not in the registry) and `public`/`optional-session` specs pass through unchanged. Auth routes themselves are declared `public`/`optional-session` in the registry, so the gate does not interfere with sign-in.

**Verify**: `bun --filter @bp/studio-api test` → existing facade tests still pass; new tests (cases 2–4) pass.

### Step 3: Memoize identity resolution per request

The central gate adds a second session lookup on routes whose handlers also resolve identity (D1 hit per request). In `studio/auth.ts`, memoize resolution with a module-level `WeakMap<Request, Promise<ResolvedIdentity | null>>` keyed on the `Request` object, inside the existing resolution function so both the gate and handlers share one lookup. (Workers create a fresh `Request` per fetch; the WeakMap cannot leak across requests.)

**Verify**: new test (case 5) — a counting-stub env records exactly one session DB query for a session-authed route that both the gate and the handler authenticate. `bun --filter @bp/studio-api test` → passes.

### Step 4: Centralize the Idempotency-Key requirement

In the same dispatcher gate: if `spec.idempotency.kind === "required"` and `request.headers.get(spec.idempotency.header)` is empty/absent → `errorResponse(400, "Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED")`. Then check `brief-drafts.ts:1825-1827` — its local presence check becomes unreachable for registry-matched routes; remove **only** the presence check if all its call paths are registry-matched (verify by finding every caller), otherwise leave it. Keep all replay/dedupe machinery (`brief-drafts.ts:1832+`) untouched.

**Verify**: new test (case 6) passes; `bun --filter @bp/studio-api test` all green.

### Step 5: Apply declared cache policies on the way out

After a handler in the cascade returns a non-null `Response` for a registry-matched route, if the response has **no** `Cache-Control` header, set it from `spec.cache`:

- `public` → `public, max-age=60, stale-while-revalidate=86400` (build from the numbers in the spec, don't hardcode)
- `private-no-store` → `private, no-store`
- `no-store` → `no-store`

Never overwrite an existing header (artifacts route sets `immutable` itself). Apply only on status < 500. Implementation note: `Response` objects from handlers may be immutable-ish; use `new Response(resp.body, resp)` + `headers.set` if direct mutation throws.

**Verify**: new tests (cases 7–8) pass. `bun run test:worker` → all pass (this exercises the real workerd response path). `bun --filter @bp/web build` → exit 0.

## Test plan

In `packages/studio-api/test/` (model structure after `test/api-facade.test.ts` — it already constructs requests against the facade with stub envs):

1. `findRouteSpec` matches `GET /api/v1/studio/routes` to its spec; returns null for an unknown path; most-specific wins for overlapping templates.
2. Session-scoped route without a session cookie → 401 envelope `{error:{code:"UNAUTHENTICATED"}}`.
3. Session-scoped route with a valid session lacking the scope → 403 `FORBIDDEN`.
4. Public route (e.g. `system.health`) with no session → 200 (gate is a no-op).
5. Exactly one session DB lookup per request (memoization).
6. Registry-declared idempotent mutation without `Idempotency-Key` → 400 `IDEMPOTENCY_KEY_REQUIRED` *before* reaching the handler (stub handler not invoked).
7. Studio read response gains `Cache-Control: public, max-age=60, stale-while-revalidate=86400`.
8. A handler-set `Cache-Control` is not overwritten.

Verification: `bun --filter @bp/studio-api test` → all pass including 8 new tests; `bun run test:worker` → all pass.

## Done criteria

- [x] `bun --filter @bp/studio-api typecheck` exits 0
- [x] `bun --filter @bp/studio-api test` exits 0 with registry lookup/cache
      tests present
- [x] `bun run test:worker` exits 0
- [x] `bun --filter @bp/web build` exits 0
- [x] `grep -n "findRouteSpec" packages/studio-api/src/api.ts` shows the gate wired
- [x] Hard-cutover removed the old in-handler private scope checks before this
      plan ran; the live registry has no `session` routes.
- [x] No out-of-scope runtime code modified for this live-scope implementation.
- [x] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any registry entry's declared auth contradicts what its handler enforces today (e.g. handler requires a scope but the spec says `public`, or vice versa). The central gate would *change live behavior* for that route — list the mismatches and wait for a human call.
- A worker smoke test fails on response-header mutation (immutable Response in workerd) after the `new Response(body, resp)` fallback.
- `studio/auth.ts`'s resolution path turns out not to be shared by brief-draft handlers (i.e. they have a second, divergent resolver) — memoization placement is then wrong; report.
- Step 4's caller analysis finds a brief-draft mutation path NOT matched by any registry spec (the central check would not protect it; removing the local check would lose coverage).

## Maintenance notes

- After this lands, **the registry is load-bearing**: a route added without a spec gets no central auth/cache/idempotency treatment and falls to `spec === null` passthrough. Reviewers of future endpoint PRs must check the registry entry first.
- The in-handler scope checks are now redundant but kept deliberately; plan 009 (Effect HttpApi middleware) is the point where they're removed wholesale. If 009 is rejected, schedule a separate cleanup.
- The public cache policy (60s/86400s SWR) appearing on studio reads is a **behavior change at the CDN/browser layer** — watch for stale-read reports on the authoring surfaces after deploy; `optional-session` overlay reads (drafts) are declared `privateNoStore` in the registry, which this plan now actually enforces (previously they shipped with no header at all).
