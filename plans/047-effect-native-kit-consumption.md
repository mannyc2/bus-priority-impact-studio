# Plan 047: Finish the Effect migration — consume nyc-transit-kit natively in the Effect zone (ADR-0021)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: confirm plan 045 Order 1 landed (root
> `package.json` pins `@nyc-transit-kit/*` at `0.2.0`) and
> `git -C /mnt/models/dev/nyc-transit-kit log --oneline -3` still shows the
> 0.2.0 line (`a1586b3` or additive successors). Compare the "Current
> state" excerpts below against the live files before editing; mismatch =
> re-verify the premise, not force the step.

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED (rewires the shared SODA3 client under ~21 ingest/check/
  backfill commands; fixture tests are the net)
- **Depends on**: plan 045 Order 1 (0.2.0 pins — `queryAllRows` exists only
  at 0.2.0). Supersedes 045's original compat-based pagination/token swaps.
- **Category**: migration / doctrine
- **Planned at**: 2026-07-05, kit at `a1586b3` (0.2.0)

## Why this matters

The Effect migration is otherwise done: plan 040 put all 99 pipeline
commands on `effect/unstable/cli`, plans 041-044 made Effect Schema the
only schema library (ADR-0020), and plans 015/019/027 built the pipeline
runtime (ADR-0019: `Context.Service`, `Layer`, `ManagedRuntime` at command
boundaries, tagged errors). One incoherence remains: the Effect zone talks
to nyc-transit-kit — itself Effect-native — through the kit's PROMISE
facade. Today a single SODA3 page fetch crosses the runtime boundary three
times: the bus's Effect retry (`PipelineHttpService`) is run as a Promise
inside a wrapped fetch (`runPipelineHttpPromise`), which is handed to
compat, which builds a FRESH kit `Layer` per call and `Effect.runPromise`s
the kit's own Effect (`compat/internal/runtime.ts` `runSoda3Effect`).

Going native in the Effect zone gets: the kit's tagged error families
end-to-end instead of thrown compat errors, named spans
(`Effect.fn("Soda3.queryRows")`) inside pipeline traces, one layer built
per client instead of per call, and deletion of the fetch-adapter
contortions in `lib/soda3.ts`. compat remains exactly where it is designed
for: Promise-style consumers outside the Effect runtime (the studio-api
worker — Effect-on-worker was spiked, measured, and BLOCKED by plan 026
when `test:worker` regressed 3.07s → 8.71s). ADR-0021 records that
boundary so it stops being re-litigated.

## Current state

Verified 2026-07-05 (bus repo working tree; kit `a1586b3`).

**Kit native surface at 0.2.0** (`@nyc-transit-kit/soda3/client`):
- `Soda3ClientConfig` (`Context.Service`) with `soda3ConfigLayer(options)`
  (`appToken`/`retryTimes`/`retryDelayMs`/`timeoutMs`; `retryTimes: 0`
  default), `soda3FetchLayer(fetch?)` (builds the Effect `HttpClient` from
  a `FetchImplementation`), `soda3Layer(options)` merging both.
- `FetchImplementation = (input: string | URL | Request, init?) =>
  Promise<Response>` — the bus's `SocrataFetch` is directly assignable.
- Native `Effect.fn` operations requiring `Soda3ClientConfig |
  HttpClient.HttpClient`: `queryRows`, `queryAllRows` (auto-pagination),
  `countRows`, `exportResponse`, `catalogSearch`, `fetchDatasetMetadata`;
  tagged errors importable from `@nyc-transit-kit/soda3/errors`.
- The kit accepts ANY provided `HttpClient.HttpClient` — the bus may
  provide its own layer instead of `soda3FetchLayer`.

**Bus call sites on compat** (all four to migrate or doctrine):
1. `tools/pipeline-v2/src/lib/soda3.ts` — `querySoda3Rows` from
   `compat/soda3` (line 2), plus the fetch stack it exists to feed:
   `fetchWithSocrataAppToken` → `fetchWithTimeout` →
   `fetchWithPipelineHttpRetry` (lines 78-118; wraps
   `runPipelineHttpPromise`, classifies 429 → `RateLimitError`, ≥500/
   network → `HttpRequestError`, carries command/operation/url/attempt
   meta) → `adaptSocrataFetch` (lines 120-129 + the
   `normalizeRequestBody`/`requestInitFromRequest` helpers, lines 42-76,
   which exist ONLY to adapt to compat's fetch option). The Promise-shaped
   `PipelineSoda3Client.rows()` (line 27) is consumed by ~21 files
   (19 `commands/ingest/*`, `commands/check/route-speed-availability.ts`,
   `commands/backfill/route-ridership-trends.ts`,
   `lib/socrata-monthly-ingest.ts`).
2. `tools/pipeline-v2/src/commands/sources/soda3-range-probe.ts` —
   compat `exportSoda3Response` + the token fetch-wrapper.
3. `packages/sources/src/probes/socrata-probe.ts` — compat
   `querySoda3Rows`; wrapped by `probes/source-probe.ts` and exported via
   `probes/index.ts`. Sources constraints (harness
   `production-boundaries.test.ts`): no `process.env`, restricted `Bun.`
   — tokens must stay parameters.
4. `packages/studio-api/src/source-refresh.ts` — compat `querySoda3Rows` +
   `isSoda3ClientError`. STAYS on compat (doctrine below).

**Already-native precedent**: `packages/sources/src/gtfs-realtime/decoder.ts`
calls kit `decodeGtfsRealtimeBytes` directly and runs it with
`Effect.runSync` (sources' one direct Effect import). The kit also exports
`decodeGtfsRealtimeBytesSync` — the ceremony can drop.

**Pipeline retry semantics to preserve** (`src/effect/http.ts`, plan 027):
exponential backoff base `retryDelayMs ?? 1_000`, factor 1.5, jittered,
`Schedule.recurs(maxAttempts - 1)`; 429 → `RateLimitError`, other failures
→ `HttpRequestError`; errors carry `{command, operation, url, attempt,
maxAttempts}`; optional `onAttemptFailed` hook.

## Design decisions (recorded defaults — do not re-open without evidence)

- **Retry/timeout/token stay pipeline-owned, kit policy stays off**
  (`retryTimes: 0`). The kit's policy engine cannot carry the pipeline's
  ops meta (command/operation ledger tagging, `onAttemptFailed`).
  Preferred shape: a pipeline-owned `HttpClient` layer (effect
  `unstable/http` FetchHttpClient + retry/timeout middleware reusing the
  `PipelineHttpService` schedule and error mapping) provided UNDER the kit
  services next to `soda3ConfigLayer({ appToken })` — fully native, no
  Promise round-trip per attempt, per-page retries preserved inside
  `queryAllRows` (retry sits below the kit's request execution).
  **Fallback** if `unstable/http` middleware cannot reproduce the
  semantics cleanly: keep the wrapped-fetch stack and inject it via
  `soda3FetchLayer(wrappedFetch)` (`SocrataFetch` is assignable to
  `FetchImplementation`) — still native calls, still one layer per client,
  retry stays fetch-level. Either way the compat import goes.
- **The Promise seam stays at the client edge.** `PipelineSoda3Client`
  keeps its `rows(): Promise` shape so the ~21 consumers are untouched;
  internally it becomes native kit Effects run once through the pipeline
  runtime (ADR-0019: `ManagedRuntime` at boundaries). Kit tagged errors
  map at that seam to the existing `HttpRequestError`/`RateLimitError`
  with meta preserved (`cause` keeps the kit error). Migrating the 21
  command bodies to Effect-typed `rows()` is explicitly NOT this plan.
- **studio-api stays on compat.** Plan 026 is BLOCKED on a measured
  regression; compat is the kit's sanctioned Promise surface for exactly
  this consumer. Revisit only via a new measured spike, not by drift.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Pipeline tests (fixture oracle) | `bun --filter @bp/pipeline-v2 test` | all pass |
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Sources tests (incl. production boundaries) | `bun --filter @bp/sources test` | all pass, harness unmodified |
| Unit tests | `bun run test:unit` | all pass |
| Compat-import gate | `rg -l "@nyc-transit-kit/compat" tools/pipeline-v2/src packages/sources/src` | no output |
| One fixture-backed command | an ingest command against fixtures (executor picks per existing conventions) | matches pre-migration output |

## Scope

**In scope**:
- `tools/pipeline-v2/src/lib/soda3.ts` native rewrite + a
  `pipelineSoda3Layer`-style helper; deletion of the fetch-adapter
  contortions and `lib/socrata-token.ts` (env read moves to pipeline-side
  client construction — env is allowed in pipeline, banned in sources).
- `commands/sources/soda3-range-probe.ts` → native `exportResponse`.
- `packages/sources/src/probes/socrata-probe.ts` → native kit Effects
  internally; exported probe API keeps its current Promise shape; token
  remains a parameter.
- Optional one-liner: `gtfs-realtime/decoder.ts` →
  `decodeGtfsRealtimeBytesSync`.
- ADR-0021 (kit consumption boundary) under `docs/decisions/`; enforce
  with the grep gate above wired into the existing arch-test conventions
  (extend sources' harness test for `packages/sources`; add a minimal
  sibling check in pipeline-v2's test tree if none exists);
  `knowledge/index.md` + `knowledge/log.md` touch per repo rules.
- `plans/README.md` status rows (this plan; note on 045).

**Out of scope**:
- `packages/studio-api` beyond its existing compat usage (plan 026
  BLOCKED); `apps/web`, `packages/db`, `packages/analytics` (deliberately
  non-Effect).
- Kit-repo changes (plan 045 Orders 2-3 own those) and any new kit
  release.
- Migrating the ~21 command bodies to Effect-typed client methods.
- Dissolving `packages/domain` `schema-compat` (Effect-Schema-backed
  already; replacing the zod-idiom facade is churn, not migration —
  ADR-0020 is satisfied).
- Sources adapters consuming kit row types directly (deferred follow-up
  noted in plans 044/045).

## Git workflow

- Branch: `plan/047-effect-native-kit`; no push unless asked.
- Land after (or rebased onto) plan 045 Order 1's pin bump.

## Steps

### Step 1: pipeline-owned kit layer

In `lib/soda3.ts` (or a small sibling module if it reads better), build
the per-source layer: `soda3ConfigLayer({ appToken, retryTimes: 0 })`
merged with the pipeline `HttpClient` layer implementing the preserved
retry/timeout semantics (preferred design above; fall back to
`soda3FetchLayer(wrappedFetch)` on a STOP-worthy middleware fight —
record which shape landed). `appToken` comes from
`process.env.SOCRATA_APP_TOKEN` at construction (pipeline side only).

**Verify**: a focused unit test asserting retry classification parity
(429 → `RateLimitError`, 5xx → retried then `HttpRequestError`, meta
fields intact) passes against the new layer.

### Step 2: native soda3 client

Rewrite `fetchRowsPage`/`createSoda3SourceClient` over native `queryRows`
(single-page `limit`/`offset` path) and `queryAllRows`
(`pageSize: options.pageSize ?? 5_000`; never pass `maxRows` — the kit
throws on exceed, bus behavior is unbounded). One runtime boundary at the
`PipelineSoda3Client` methods; map kit errors to pipeline error types
there. Delete `adaptSocrataFetch`, `fetchWithTimeout`,
`fetchWithPipelineHttpRetry`, `normalizeRequestBody`,
`requestInitFromRequest`, `requestInitWithNormalizedBody`, and
`lib/socrata-token.ts` once unreferenced; keep the SoQL text helpers
(`soda3SoqlQueryText`, `soqlQuote`, `soqlIn`, `soqlYearMonthRange`) — they
are query-building, not transport.

**Verify**: `bun --filter @bp/pipeline-v2 test` green (fixtures are the
byte-behavior oracle); `rg -n "socrata-token|adaptSocrataFetch" tools/pipeline-v2/src`
→ empty.

### Step 3: range probe + sources probe

`soda3-range-probe.ts` → native `exportResponse` through the Step-1
layer. `socrata-probe.ts` → native `queryRows` internally (token stays a
parameter; no env, no new `Bun.`), exported Promise API unchanged.
Optionally swap `decoder.ts` to `decodeGtfsRealtimeBytesSync`.

**Verify**: `bun --filter @bp/sources test` green with harness tests
unmodified; range-probe command runs against its fixture.

### Step 4: doctrine + gates

Write ADR-0021: native kit APIs in the Effect zone
(`tools/pipeline-v2`, `packages/sources` internals); compat only at
Promise edges (today: `packages/studio-api`, per plan 026's measured
BLOCK); future kit capabilities (plan 045 Order 4's CSV streaming /
download) adopt natively in the Effect zone by default. Wire the
compat-import gate into the arch tests; update `knowledge/index.md` +
`knowledge/log.md`; update `plans/README.md` rows (this plan DONE; 045
row note that its compat swaps were superseded here).

**Verify**: compat-import gate returns no output; `bun run test:unit`
green.

## Test plan

- New: retry-parity unit test (Step 1); probe/range-probe fixture runs.
- Existing: pipeline fixture tests are the behavioral oracle for all 21
  consumers (their inputs/outputs must not change); sources harness
  production-boundaries tests must pass UNMODIFIED.
- Gate: compat-import grep empty over `tools/pipeline-v2/src` +
  `packages/sources/src`.

## Done criteria

- [ ] No `@nyc-transit-kit/compat` import outside `packages/studio-api`;
      gate enforced by an arch test
- [ ] `lib/soda3.ts` calls kit Effects natively through one pipeline-owned
      layer; fetch-adapter helpers and `lib/socrata-token.ts` deleted
- [ ] Retry semantics parity demonstrated by test (classification, meta,
      backoff shape)
- [ ] `bun --filter @bp/pipeline-v2 test`, `bun --filter @bp/sources test`,
      `bun run test:unit` green; one fixture-backed ingest command matches
      pre-migration output
- [ ] ADR-0021 committed; knowledge index/log updated; `plans/README.md`
      rows updated

## STOP conditions

- Fixture tests show a byte-behavior diff after a swap — the native path
  differs semantically from compat; report the diff before adapting
  fixtures.
- Neither the HttpClient-middleware design NOR the wrapped-fetch fallback
  reproduces the retry semantics (classification, per-page retries, meta)
  — stop and report; do not weaken the semantics to fit.
- `production-boundaries.test.ts` requires modification — the probe design
  is wrong; rework the probe, not the harness.
- Kit 0.2.x drift changes the native surface used here (`soda3/client`
  exports, error tags) — re-run the drift check and reconcile first.
- You find yourself editing `packages/studio-api` beyond its existing
  imports, or any of `apps/web`/`packages/db`/`packages/analytics` — out
  of scope.

## Maintenance notes

- ADR-0021 is the standing answer to "native or compat?": Effect zone →
  native; Promise edge → compat. New non-Effect consumers (if any) use
  compat without ceremony; new Effect-zone consumers must not add compat
  imports (the arch gate holds the line).
- If plan 026 is ever unblocked (worker on Effect), `source-refresh.ts`
  flips to native under the same rule — that belongs to that plan, not
  this one.
- When plan 045 Orders 2-4 land kit CSV streaming / resumable download,
  their pipeline adoption consumes the Effect-native forms directly (the
  compat async-generator forms exist for edge consumers only).
