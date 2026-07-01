# Plan 012: Harden the public serving path (artifact-key validation, error hygiene, negative auth tests)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 58dfaeb..HEAD -- packages/studio-api/src/public-api.ts packages/studio-api/src/studio/projections.ts packages/studio-api/test apps/web/test/worker`
> On mismatch with "Current state" excerpts, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (overlap with plan 008 explicitly carved out below)
- **Category**: security / tests
- **Planned at**: commit `58dfaeb`, 2026-06-13
- **Completed**: 2026-07-01 in hard-cutover form.

## Completion note

The hard-cutover deleted the brief-draft authoring/session routes named in
Step 3, and the current registry has no `session`-auth write route left to
exercise. Instead of recreating retired authoring surfaces, this slice now
tests the surviving public reads with no cookie and a garbage `bp_session`
cookie: `/api/v1/routes?limit=1` still returns route data, and
`/api/v1/studio/routes?schema=2` remains contract-valid.

Implemented:

- strict, exported `isValidArtifactKey` validation with malformed and
  repeated URL-decode rejection;
- generic public 5xx messages for missing dependencies and unavailable
  artifacts, with artifact keys and binding names retained only in
  `console.error` operator logs;
- public Worker regression coverage for anonymous/bad-cookie reads;
- Studio API unit/facade coverage for artifact-key rejection and hidden
  artifact-key failures.

Verification passed:

- `bun --filter @bp/studio-api typecheck`
- `bun --filter @bp/studio-api test`
- `bun --filter @bp/web test:worker`
- scoped `bunx biome check --write` on touched serving/test files

## Why this matters

A 2026-06-13 security/correctness audit of the public request path found no
exploitable hole, but three defense-in-depth gaps worth closing before this
project gets reviewer traffic: (1) the R2 artifact passthrough validates
`..` only after a single URL-decode, so double-encoded sequences pass the
check (harmless against R2's opaque keys today, but it breaks the
deny-at-every-layer principle and any future proxy/mirror could re-decode);
(2) several 5xx error messages leak internal artifact key paths and binding
configuration, free reconnaissance; (3) auth has no negative tests — a
copy-paste `requireStudioOperator` on a public read, or a silently
un-gated write, would ship undetected.

## Current state

- `packages/studio-api/src/public-api.ts:541-571` — `buildArtifactResponse`:

  ```ts
  const key = rawKey
    .split("/")
    .map((part) => decodeURIComponent(part))
    .join("/");

  if (key.length === 0 || key.startsWith("/") || key.includes("..")) {
    return errorJson(400, "Artifact key is invalid.");
  }
  ```

  A request for `…/artifacts/studio/v1/%252e%252e/x` decodes once to
  `studio/v1/%2e%2e/x` — no literal `..` — and passes. R2 then treats the
  key as opaque bytes (no traversal today), so impact is LOW; this is
  hardening, not an incident.
- `packages/studio-api/src/studio/projections.ts:84,91,96` — error
  responses include full R2/D1 artifact key paths. Binding-status messages
  ("ARTIFACTS R2 binding is not configured", `public-api.ts:474,543,578`)
  reveal infra layout. Read each call site before editing — some messages
  may be load-bearing for ops dashboards; check whether any test asserts on
  the exact strings.
- Auth: session resolution + scopes in `packages/studio-api/src/studio/auth.ts`
  (`hasStudioScope`, `requireStudioOperator`); session cookie is
  `SameSite=Lax` (~line 53 of the cookie-setting module — locate it). Write
  handlers in `packages/studio-api/src/studio/brief-drafts.ts`.
- Existing tests: `apps/web/test/worker/*.worker.test.ts` (smoke tests for
  public routes; brief-draft write gating has SOME negative tests — read
  `brief-draft.worker.test.ts` first), `packages/studio-api/test/*`
  (`auth-routes.test.ts` covers session resolution, not endpoint gating).
- **Already planned elsewhere — do NOT do here**: enforcement of
  registry-declared scopes/idempotency by the dispatcher is plan 008
  (see plans/README.md). CSRF tokens: deliberately rejected for now —
  `SameSite=Lax` blocks cross-site POST cookie attachment; record nothing.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| API typecheck | `bun --filter @bp/studio-api typecheck` | exit 0 |
| API tests | `bun --filter @bp/studio-api test` | all pass |
| Worker tests | `bun --filter @bp/web test:worker` | all pass |

## Scope

**In scope**:
- `packages/studio-api/src/public-api.ts` (artifact key validation; binding
  error message wording)
- `packages/studio-api/src/studio/projections.ts` (error message wording)
- `packages/studio-api/test/` and `apps/web/test/worker/` (new tests)

**Out of scope** (do NOT touch):
- `studio/auth.ts`, cookie attributes, session machinery — behavior is
  correct; this plan only TESTS it.
- Registry/dispatcher enforcement (plan 008's territory).
- Rate limiting, CORS policy changes, any new dependency.
- D1 queries and schemas.

## Git workflow

- Branch: `advisor/012-serving-path-hardening` off `main`.
- Commit per step; short imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Strict artifact key validation

In `buildArtifactResponse`, replace the single post-decode check with a
validation helper (exported for testing, e.g. `isValidArtifactKey(key)`):

- reject empty, leading `/`, any `\\`, any ASCII control char
- reject if ANY path component (split on `/`) is `.` or `..`
- reject if a second `decodeURIComponent` pass would change the key AND the
  re-decoded value contains a `.`/`..` component (catches `%252e` chains;
  implement the double-decode check inside try/catch — malformed escapes →
  reject)
- legit keys (`map/2026-03/manifest.json`, `studio/v2/routes/m15-sbs/dossier.json`)
  must still pass — add them to the tests.

**Verify**: `bun --filter @bp/studio-api test` → all pass including new
validation tests (Step 4 writes them; it's fine to write tests first).

### Step 2: Genericize infrastructure error messages

In `projections.ts:84,91,96` and the binding messages in `public-api.ts`:
client-facing message becomes generic ("Artifact is not available." /
"Service dependency is not configured."); the specific key/binding name
moves to `console.error(...)` at the same site so operators keep the
signal. First grep tests for the current strings
(`grep -rn "binding is not configured" packages apps`) and update any
asserting test to the new copy in the same commit.

**Verify**: `bun --filter @bp/studio-api test && bun --filter @bp/web test:worker`
→ all pass; `grep -rn "artifactKey" packages/studio-api/src/studio/projections.ts`
shows keys only in logging calls, not response bodies.

### Step 3: Negative auth tests

Add to the existing worker test suites (model on
`apps/web/test/worker/brief-draft.worker.test.ts` setup):

1. `GET /api/v1/studio/routes` with NO session cookie → 200 with route data
   (public read stays public).
2. Same request with a garbage `bp_session` cookie → 200 (invalid session
   degrades to anonymous, does not 500 or 401 a public read).
3. One representative write endpoint (brief draft create) with no session →
   401/403 (confirm which one the handler actually returns and assert it).
4. Same write with a valid session lacking the required scope → 403 —
   ONLY if the existing test harness already fabricates scoped sessions
   (check how brief-draft tests build authenticated requests); if it
   doesn't, skip this case and note it.

**Verify**: `bun --filter @bp/web test:worker` → all pass, including ≥3 new
tests.

### Step 4: Validation unit tests

Unit-test `isValidArtifactKey` in `packages/studio-api/test/`: the two legit
keys above pass; reject cases: `..`-component, `%2e%2e` (post-second-decode),
`%252e%252e`, backslash, leading slash, empty, control char, lone `.`
component.

**Verify**: `bun --filter @bp/studio-api test` → all pass.

## Test plan

Covered by Steps 3–4 (that's most of the plan). Plus: run the full
`bun --filter @bp/studio-api test` and `bun --filter @bp/web test:worker`
suites before and after — same pass count plus the new tests.

## Done criteria

- [x] `isValidArtifactKey` exists, is used by `buildArtifactResponse`, unit tests pass
- [x] No client-facing 4xx/5xx body contains an R2 key path or binding name (`grep` checks in Step 2)
- [x] Public-read no-cookie and garbage-cookie regressions pass for the surviving hard-cutover routes
- [x] `bun --filter @bp/studio-api typecheck` exits 0; both test suites pass
- [x] Serving/test edits stayed in the hardening slice; plan docs and `knowledge/log.md` updated
- [x] `plans/README.md` status row updated

## STOP conditions

- A legit production artifact key fails the new validation (check the map
  manifest's `artifactKey` values against your helper before wiring it) —
  report the key shape instead of loosening blindly.
- An ops/monitoring consumer turns out to parse the exact error strings
  (search `knowledge/wiki/engineering/cloudflare_operations_runbook.md` for
  the messages first) — report before changing copy.
- The worker test harness can't fabricate the session states Step 3 needs
  after one honest attempt — deliver Steps 1/2/4 and report the gap.

## Maintenance notes

- Plan 008 (registry-driven enforcement) supersedes the per-handler gating
  this plan tests; the negative tests written here remain valid acceptance
  tests for 008 — note that in 008's PR.
- If artifact serving is ever fronted by another proxy/CDN layer, revisit
  the double-decode assumption — the validator's second-pass check is the
  guard, keep it.
- Reviewer should scrutinize: that Step 2 didn't silently change any
  response *status code*, only message bodies.
