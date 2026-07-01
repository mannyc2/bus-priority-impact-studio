# Plan 026: Worker on Effect HttpApi — spike ADR, then migrate the 18-endpoint surface

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> Supersedes plan 009 (keep 009 for its migration mechanics — the adapter
> and parity-test patterns there are still the playbook; this plan replaces
> its scope, gate, and sequencing). The operator explicitly authorized
> worker-side Effect on 2026-07-01, waiving 009's missing-ADR block **on the
> condition that the spike below is run and recorded first** — consent
> unblocks the work, it does not skip the measurement.

## Status

- **Priority**: P2
- **Effort**: L (spike M + migration M)
- **Risk**: MED
- **Depends on**: plan 019; plan 024 recommended first (don't migrate
  endpoints that are about to change backing); coordinate with plan 020 if
  concurrent (it touches the same read path)
- **Category**: migration
- **Planned at**: 2026-07-01

## Why this matters

The hand-rolled HTTP layer (`contracts/registry.ts`, hand-assembled
`contracts/openapi.ts`, regex routing, `public-api.ts` parallel route
system) still exists — but the cutover shrank its surface to **18 routes**,
which changes the economics: the migration 009 priced at 61 routes +
Durable Objects + auth flows is now a small, low-drama port with big
deletions behind it (~2 kLOC of plumbing) and one structural win: the
OpenAPI document becomes *derived* instead of hand-maintained.

That derived document also dissolves plan 007's blocker: `openapi-typescript`
failed on zod-derived nested `$defs`; `OpenApi.fromApi` output is
generator-friendly, so typed client generation (007's goal) lands here as a
step instead of a separate blocked plan.

Effect stays out of the browser: the guard is a grep and the bundle budget,
both already in CI shape. The worker has no equivalent budget; the spike
sets one.

## Current state

- 18 route specs in `packages/studio-api/src/contracts/registry.ts` (system,
  observability, public reads, studio reads). Plan 008's central
  auth/cache/idempotency gate is live in `api.ts`. Plan 012 hardened error
  envelopes and artifact keys.
- `effect@4.0.0-beta.92` + `@effect/platform-bun` are already in the root
  catalog (pipeline runtime, ADR-0019). The worker would need
  `@effect/platform` proper; check the catalog first.
- Reference material: the vendored Effect source at `.repos/effect`
  (matching beta.92) and the effect-ts skill at
  `/home/cjpher/.codex/skills/effect-ts/` (SKILL.md + guides for layers,
  error-handling, schema, retries, testing, observability). **HttpApi module
  names moved across platform betas — trust the installed source, not
  memory.**
- Browser guard: `rg "from \"effect\"|from \"@effect/" apps/web/src` must
  stay empty (worker entry excepted); entry budget 145 KB gz.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| API tests | `bun --filter @bp/studio-api test` | pass |
| Worker tests (workerd) | `bun --filter @bp/web test:worker` | pass |
| Web build + budget | `bun --filter @bp/web build` | exit 0 |
| Browser Effect guard | `rg 'from "effect"|from "@effect/' apps/web/src --glob '!worker/**'` | no matches |
| Worker bundle size | inspect wrangler/vite build output chunk sizes | recorded |

## Scope

**In scope**:

- `docs/decisions/0020-effect-httpapi-worker.md` (the spike ADR)
- `packages/studio-api/src/effect-api/**` (new), `api.ts` cutover,
  eventual deletion of `contracts/{openapi,routing,path-builder}.ts`,
  `client/fetch.ts`, and the `public-api.ts` parallel router
- `apps/web/scripts/generate-api-types.ts` → derived OpenAPI, typed client
  types for `apps/web/src/studio/api-client.ts`

**Out of scope**:

- Effect in any browser-reachable module.
- Rewriting business logic in `read-handlers.ts` — adapters only, per 009.
- `packages/domain` stays zod (ADR-0019); Effect Schema appears only at
  HTTP endpoint definitions, with parity tests.

## Steps

### Step 1: Spike + ADR-0020

Build the one-endpoint skeleton (`GET /api/health`) from 009 step 1 on the
current platform beta. Measure: worker bundle delta under the real
wrangler/vite build, cold-start behavior in `test:worker`, and confirm the
browser guard. Record in ADR-0020: measured footprint, a PASS threshold
(suggested: worker bundle delta ≤ 300 KB raw and no test:worker latency
regression), the exact package versions, and the decision. If FAIL, mark
this plan BLOCKED with numbers and stop — the operator's consent covers
proceeding on a PASS, not on a shrug.

**Verify**: ADR-0020 committed with numbers; all gates green with the
health endpoint live on Effect.

### Step 2: Middleware parity

Port plan 008's enforcement (auth scopes, idempotency, cache policy,
Server-Timing, `{error:{code,message}}` envelope) as HttpApi middleware,
reusing `studio/auth.ts` resolution as-is. Port 008's enforcement tests to
run against the Effect handler.

**Verify**: ported enforcement tests pass against Effect-served endpoints.

### Step 3: Migrate the families, parity-tested

Follow 009 step 3 mechanics (adapter pattern, per-family response parity
tests, zod↔Effect Schema fixture parity), over the real post-cutover
families: schema/system → observability → public reads → studio reads.
No Durable Objects, no auth cookie flows, no brief drafts — they're gone.
Flip each family, keep every gate green per family.

**Verify (per family)**: parity tests + full API/worker suites green.

### Step 4: Derive OpenAPI + generate the typed client

Serve the derived document at `/api/openapi.json`; regenerate types via
`generate-api-types` against it; repoint `api-client.ts` response types to
the generated types where they diverge. Every contract diff between the
hand-assembled and derived docs goes in the commit message.

**Verify**: codegen exits 0; `bun --filter @bp/web typecheck` passes;
freshness/contract tests green. This closes plan 007's goal — update its
README row to SUPERSEDED-BY-026.

### Step 5: Delete the legacy plumbing

When all families are on Effect: delete `contracts/openapi.ts`,
`contracts/routing.ts`, `contracts/path-builder.ts`, `client/fetch.ts`;
fold `public-api.ts` routes in and delete it; shrink `registry.ts` to
whatever still needs it (target: nothing). Record LOC delta.

**Verify**: full gate (API tests, worker tests, web build+budget, browser
guard, style) green; grep shows no orphaned references.

## Test plan

Per-family parity + schema parity + ported enforcement tests are the safety
net (009's test plan applies verbatim); full pre-merge gate at the end.

## Done criteria

- [ ] ADR-0020 recorded with measured PASS.
- [ ] All 18 endpoints served via HttpApi; legacy plumbing deleted.
- [ ] `/api/openapi.json` derived; typed client generated; plan 007 closed.
- [ ] Browser guard clean; entry budget unchanged or better.
- [ ] `plans/README.md` rows updated (this plan, 007, 009).

## STOP conditions

- Spike FAIL against the ADR threshold.
- Any parity test needs business-logic changes to pass.
- Worker cold-start or latency regressions in `test:worker`.
- The platform beta's HttpApi API surface differs so much from 009's sketch
  that the adapter pattern doesn't hold — report with specifics before
  inventing a new pattern.

## Maintenance notes

- After landing, new endpoints are declared once in the HttpApi definition;
  OpenAPI and client types follow. Keep the zod↔Effect Schema parity tests
  as the drift alarm (ADR-0019 keeps domain on zod).
- Pin the platform version in the catalog; upgrade deliberately with the
  parity suite as the gate.
