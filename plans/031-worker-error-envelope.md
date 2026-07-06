# Plan 031: Eliminate the Worker-1101 crash class with one API error envelope

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ce3baca..HEAD -- packages/studio-api/src/api.ts packages/studio-api/src/http/errors.ts packages/studio-api/src/studio/read-handlers.ts packages/studio-api/test/`
> Plan 030 intentionally edits `read-handlers.ts` before this plan — that
> drift is expected; re-locate line numbers via the quoted excerpts. Any OTHER
> mismatch with "Current state" is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (additive guard; no success-path behavior change)
- **Depends on**: plans/030-snapshot-v2-root-cause.md (same file; land 030 first)
- **Category**: bug
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

The production incident behind PRs #54–#58 started as a **Cloudflare 1101 HTML
error page** from an unhandled exception in the snapshot endpoint. That class
was fixed for exactly one endpoint. As of `ce3baca` there is still **no
try/catch anywhere in the API dispatch chain** (`apps/web/src/worker/index.ts`
→ `handleStudioFetch` → `handleStudioApiRequest` → handlers), and the serving
path contains 13 throwing `Schema.parse(...)` sites in
`packages/studio-api/src/studio/read-handlers.ts` plus 7 in
`packages/studio-api/src/public-api.ts`, plus un-guarded `env.ARTIFACTS.get()`
calls that reject on R2 transient errors. Any of these throwing returns raw
HTML to API clients (breaking the frontend's JSON error handling in
`apps/web/src/studio/api-client.ts`) and produces no structured log. One
envelope at the dispatch seam removes the whole class. Additionally, the new
`/api/v1/studio/interventions/evidence` endpoint fails all-or-nothing: **one**
malformed per-route R2 bundle 502s the entire interventions page — the
opposite of the tolerant-read pattern PR #57 just established.

## Current state

### Files

- `packages/studio-api/src/api.ts` (110 lines) — `handleStudioApiRequest`, the
  single dispatch seam for every `/api/*` request. No try/catch.
- `packages/studio-api/src/http/errors.ts` — `errorResponse(status, message,
  code?)` producing `{ error: { code, message } }` JSON (the client contract:
  see `StudioApiErrorBody` in `apps/web/src/studio/api-client.ts:20-25`).
- `packages/studio-api/src/studio/read-handlers.ts` —
  `loadCompactInterventionsEvidenceBundle` (lines 2309–2350) and
  `buildStudioInterventionsEvidenceResponse` (lines 2352–2389): the
  all-or-nothing evidence fan-out.
- `packages/studio-api/test/api-facade.test.ts` — endpoint tests with
  `FakeR2Object` / fake env pattern; `packages/studio-api/test/http-routing.test.ts`
  — routing tests.

### Key excerpts (as of `ce3baca`)

`api.ts:96-101` — the dispatch seam to wrap:

```ts
  if (isStudioApiPath(url.pathname)) {
    const response = await withServerTiming("studio", () =>
      handleStudioReadRequest(request, url, env),
    );
    return applyRouteCachePolicy(routeSpec, response);
  }
```

`apps/web/src/worker/index.ts:20-24` — no catch above the seam either:

```ts
    if (isApiPath(url.pathname)) {
      return (
        (await handleStudioFetch(request, env, ctx)) ?? new Response("Not found", { status: 404 })
      );
    }
```

`read-handlers.ts:2366-2378` — the all-or-nothing evidence fan-out:

```ts
  const bundleResults = await Promise.all(
    routeIndexResult.routeIndex.routes
      .filter((route) => routeHasTimelineProjection(route))
      .map((route) =>
        loadCompactInterventionsEvidenceBundle({ ...env, ARTIFACTS: artifacts }, route),
      ),
  );
  const failed = bundleResults.find((result) => !result.ok);
  if (failed !== undefined) return failed;
```

Throwing `.parse` sites (evidence for "Why", not all to be changed):
`read-handlers.ts` lines 151, 758, 991, 1055, 1208, 1238, 1745, 1924, 2043,
2256, 2285, 2382, 2851; `public-api.ts` lines 63, 269, 388, 467, 570, 683.
These STAY as-is — the envelope catches them; per-site rewrites are explicitly
out of scope.

### Conventions that apply

- Error bodies are `{ error: { code, message } }` via `errorResponse` — match
  it exactly; the web client parses this shape.
- Log with `console.error(message, { structuredFields })` — never the raw
  request body or artifact contents; see the exemplars in
  `read-handlers.ts:108-121`.
- Tolerant reads: per-item safeParse, skip + count + one structured log — 
  exemplar `listPublicSnapshotSourceMonthCoverage` in
  `packages/db/src/d1/queries/snapshot-coverage.ts:213-235`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Studio API tests | `bun --filter @bp/studio-api test` | exit 0 |
| Studio API types | `bun --filter @bp/studio-api typecheck` | exit 0 |
| Worker harness | `bun run test:worker` | exit 0 |
| Web build (client unaffected proof) | `bun --filter @bp/web build` | exit 0, budget passes |
| Style | `bun run check:style` | exit 0 |

Do NOT run repo-wide `bun run check:types` (known OOM).

## Scope

**In scope** (the only files you should modify):

- `packages/studio-api/src/api.ts`
- `packages/studio-api/src/http/errors.ts` (only if a helper is needed)
- `packages/studio-api/src/studio/read-handlers.ts` (evidence fan-out + the two issues-logging sites)
- `packages/studio-api/src/studio/projections.ts` (issues-logging site only)
- `packages/studio-api/test/api-facade.test.ts`
- `packages/studio-api/test/http-routing.test.ts` (if routing-level test fits better)

**Out of scope** (do NOT touch):

- The 20 throwing `.parse` sites themselves — the envelope covers them.
- `apps/web/src/worker/index.ts` — the studio-api seam covers all `/api/*`
  paths; SPA/asset serving is separate.
- `packages/studio-api/src/server/scheduled.ts` / cron jobs — different
  failure surface, no user-facing response.
- Response shapes of any endpoint (no domain schema changes).
- Retry logic, pagination, caching.

## Git workflow

- Branch: `codex/031-worker-error-envelope` from `origin/main` (after 030 merges).
- Commit style: short imperative subject (match `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Wrap the API dispatch in one error envelope, with a request id

In `packages/studio-api/src/api.ts`, at the top of `handleStudioApiRequest`
(after the `isApiPath` early return), generate a request id:

```ts
  const requestId = crypto.randomUUID();
```

Then wrap the body from the `allowedMethods` computation down to the final
404 (lines 65–108) in a try/catch. On catch:

```ts
  } catch (error) {
    console.error("Unhandled Studio API error.", {
      requestId,
      method: request.method,
      path: url.pathname,
      error: error instanceof Error ? { name: error.name, message: error.message } : error,
    });
    return errorResponse(500, "Internal error.", "INTERNAL");
  }
```

Finally, set `X-Request-ID: requestId` on EVERY response the function returns
(success and error) — do this at the single exit seam by wrapping the return
value (a small helper that clones headers like `applyRouteCachePolicy` at
`api.ts:45-53` does; mirror that pattern).

Note: `contracts/errors.ts` already declares `requestId?: string` on
`StudioApiErrorEnvelope` — the contract anticipated this field; populating the
error BODY with it is optional and NOT required by this plan (the header +
log correlation is sufficient); if you do populate it, only in the catch
branch above.

Constraints:

- The early `if (!isApiPath(url.pathname)) return null;` stays OUTSIDE the try
  (non-API paths must still return `null` so the SPA layer runs).
- Do not log stack traces to the response body; the body is exactly the
  `errorResponse` envelope.
- `applyRouteCachePolicy` already skips 5xx (`response.status >= 500` guard at
  `api.ts:46`), so the 500 stays uncached — verify this stays true.

**Verify**: `bun --filter @bp/studio-api typecheck` → exit 0.

### Step 2: Add the two regression tests for the envelope

In `packages/studio-api/test/api-facade.test.ts`, add:

1. **R2 rejection test** — build an env whose `ARTIFACTS.get` REJECTS
   (`get: () => Promise.reject(new Error("simulated R2 outage"))`) and request
   `/api/v1/studio/routes?schema=2` (its capability-manifest load calls
   `ARTIFACTS.get` with no try around the promise). Expect:
   - status 500
   - `Content-Type` contains `application/json`
   - body equals `{ error: { code: "INTERNAL", message: "Internal error." } }`
     (or with a `requestId` field if you chose to populate it — assert
     consistently with your Step 1 choice)
   - the response carries a non-empty `X-Request-ID` header
2. **No-cache test** — same request; expect the response has NO
   `Cache-Control` header (5xx skip in `applyRouteCachePolicy`).

Model the fake-env structure on the existing tests around line 2736.
If `/api/v1/studio/routes?schema=2` turns out to tolerate the rejection (i.e.
some caller already catches), pick the `/api/v1/studio/routes/sections`
endpoint instead (it also loads R2 manifests); if both tolerate, STOP and
report which call sites now guard R2 — the test vector assumption is stale.

**Verify**: `bun --filter @bp/studio-api test` → exit 0 including 2 new tests.

### Step 3: Make the interventions evidence fan-out tolerant

In `packages/studio-api/src/studio/read-handlers.ts`:

- Change `loadCompactInterventionsEvidenceBundle` so the two failure returns
  (invalid JSON at ~2322-2331, contract failure at ~2333-2347) return
  `{ ok: true, bundle: null }` AFTER logging `console.error` with
  `{ key, issues? }` (keep the existing messages: "…is not valid JSON." /
  "…failed contract validation.") — i.e. the malformed bundle is skipped, not
  fatal. Delete the now-unused `{ ok: false, response }` arm from its return
  type and the `failed` short-circuit in
  `buildStudioInterventionsEvidenceResponse` (lines 2373–2374).
- `routeCount: bundles.length` already reflects only successful bundles — keep.

The response contract (`StudioInterventionsEvidenceResponseSchema`) does not
change: a skipped bundle simply doesn't appear, exactly like a route with no
timeline artifact today.

Add a test: env with two timeline-backed routes where one bundle is valid and
one is `FakeR2Object("not json")` → expect 200, `routeCount: 1`, one bundle.
There are existing evidence-endpoint tests from PR #55 near the string
`"interventions/evidence"` in `api-facade.test.ts` — extend alongside them and
update any existing test that asserted a 502 for a malformed bundle to expect
the skip behavior instead.

**Verify**: `bun --filter @bp/studio-api test` → exit 0.

### Step 4: Propagate Zod issues in the three issues-less failure logs

Three artifact-failure logs record the key but not WHY validation failed,
which made the Snapshot 2.0 incident harder to debug (contrast with the
correct pattern at `read-handlers.ts:2809-2811`, which logs
`issues: parsedSnapshot.error.issues`):

- `packages/studio-api/src/studio/projections.ts:92-95` —
  `console.error("Studio API projection artifact failed contract validation.", { key })`
  → add `issues: projection.error.issues`.
- `packages/studio-api/src/studio/read-handlers.ts:2238-2248` (route timeline
  bundle) and `:2333-2347` (evidence bundle — you touch this in Step 3
  anyway) → add `issues: parsed.error.issues` to the contract-failure
  `console.error` calls (the JSON-parse failures have no issues; leave them).

Issues go to LOGS ONLY — never into response bodies (the client-facing
envelope stays `{ error: { code, message } }`).

**Verify**: `bun --filter @bp/studio-api typecheck` → exit 0;
`grep -n "issues:" packages/studio-api/src/studio/projections.ts` → 1 match.

### Step 5: Full gates

**Verify**:
- `bun --filter @bp/studio-api test` → exit 0
- `bun run test:worker` → exit 0
- `bun --filter @bp/web build` → exit 0
- `bun run check:style` → exit 0

## Test plan

- New: R2-rejection → 500 JSON envelope (Step 2), 5xx has no Cache-Control
  (Step 2), mixed valid/malformed evidence bundles → 200 with the valid one
  (Step 3).
- Updated: any PR #55 test asserting 502 on malformed evidence bundle.
- Must stay green: all snapshot tests (incl. plan 030's rewritten test), all
  routing tests in `http-routing.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun --filter @bp/studio-api typecheck` exits 0
- [ ] `bun --filter @bp/studio-api test` exits 0 (with the 3 new tests)
- [ ] `bun run test:worker` exits 0
- [ ] `bun --filter @bp/web build` exits 0
- [ ] `grep -n "Unhandled Studio API error" packages/studio-api/src/api.ts` returns 1 match
- [ ] `grep -n "X-Request-ID" packages/studio-api/src/api.ts` returns ≥1 match
- [ ] `grep -n "issues:" packages/studio-api/src/studio/projections.ts` returns 1 match
- [ ] `grep -c "ok: false" packages/studio-api/src/studio/read-handlers.ts` decreased vs. baseline only by the evidence-bundle arms (spot-check the diff)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 030 has not landed AND `read-handlers.ts` lines 2309–2389 don't match
  the excerpts.
- Step 2's rejection vector doesn't produce a throw on either candidate
  endpoint (assumption stale — report, don't hunt for a new vector).
- Adding the try/catch changes any currently-passing test's behavior other
  than the ones this plan names (that means a handler RELIED on throwing —
  report which).
- You find yourself editing any `.parse` call site or a domain schema.

## Maintenance notes

- New endpoints get the envelope for free — but reviewers should still reject
  new `.parse` calls on EXTERNAL (R2/D1/request) data in favor of `safeParse`
  + typed 4xx/5xx; the envelope is a backstop, not a pattern.
- The envelope's 500 log line (`Unhandled Studio API error.`) is the
  production debugging entry point — keep its structured fields stable;
  Workers Logs queries will be written against them.
- Deferred deliberately: per-site safeParse rewrites of the 20 `.parse` calls
  (low value once the envelope exists); scheduled-handler error envelope
  (no user-facing response; revisit if cron failures go unnoticed).
