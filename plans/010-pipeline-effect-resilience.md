# Plan 010: Consolidate pipeline retry, timeout, and concurrency plumbing on Effect core

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 58dfaeb..HEAD -- tools/pipeline-v2/src/lib/ tools/pipeline-v2/src/commands/backfill/route-ridership-trends.ts tools/pipeline-v2/src/commands/docs/tier2/_shared.ts tools/pipeline-v2/src/commands/docs/tier2/_discovery-extraction.ts tools/pipeline-v2/src/commands/pipeline/finalize.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/006 (ADR-0019 must record "adopt Effect core in tools/pipeline-v2"; the spike PASS gate does NOT apply here — that gate is only for the worker)
- **Category**: tech-debt
- **Planned at**: commit `58dfaeb`, 2026-06-13

## Why this matters

`tools/pipeline-v2` hand-rolls the same resilience machinery in multiple places: three separate `mapWithConcurrency` implementations, an LLM retry loop with **no backoff** (immediate hammering on rate limits), and an HTTP-download retry loop with fixed-delay sleeps. Fixes to one copy don't propagate, and there is no shared vocabulary for "retry with exponential backoff under a timeout". Effect core gives these primitives (`Effect.retry` + `Schedule.exponential`, `Effect.timeout`, `Effect.forEach` with `concurrency`) battle-tested, and the pipeline is the one place in this repo where Effect's footprint costs nothing: it is a local-only CLI tool, never bundled for the browser or worker. The adoption is deliberately **boundary-shaped**: Effect lives inside `lib/`, exposed through Promise-returning function signatures, so the ~300 command files do not change shape.

## Current state

- `tools/pipeline-v2/package.json` — deps include `@liche/core` (CLI/command framework — commands are liche commands; do NOT disturb), `@earendil-works/pi-ai` (LLM provider harness), `zod`. Scripts: `"typecheck": "tsc -p tsconfig.json --noEmit --pretty false"`, `"test": "bun test ./test --timeout 5000"`.
- **Three `mapWithConcurrency` definitions** (manual cursor + worker-pool loops, functionally identical):
  - `tools/pipeline-v2/src/commands/docs/tier2/_shared.ts:2890` — `export async function mapWithConcurrency<T, R>(...)`; imported by `_ocr-candidates.ts`, `_ocr-render.ts`, `_tesseract-ocr.ts` (multiple call sites each).
  - `tools/pipeline-v2/src/commands/docs/tier2/_discovery-extraction.ts:1007` — private clone.
  - `tools/pipeline-v2/src/commands/backfill/route-ridership-trends.ts:117-136` — private clone:

    ```ts
    async function mapWithConcurrency<T, U>(
      values: T[], concurrency: number, mapper: (value: T) => Promise<U>,
    ): Promise<U[]> {
      const output: U[] = [];
      let cursor = 0;
      async function worker(): Promise<void> {
        while (cursor < values.length) {
          const index = cursor;
          cursor += 1;
          const value = values[index];
          if (value !== undefined) output[index] = await mapper(value);
        }
      }
      await Promise.all(
        Array.from({ length: Math.max(1, Math.min(concurrency, values.length)) }, () => worker()),
      );
      return output;
    }
    ```

- **LLM retry loop**, `tools/pipeline-v2/src/lib/llm.ts:185-233`: `for (let attempt = 1; attempt <= options.maxAttempts; ...)` with an `AbortController` + `setTimeout(options.timeoutMs)` per attempt, **no delay between attempts**, last error rethrown. Note the deliberate behaviors to preserve: provider errors propagated verbatim (`LLM provider error: ${result.errorMessage}`, comment at lines 204-207), the empty-text guidance error (lines 215-220), timeout message format `LLM request timed out after ${ms}ms for ${model.id}.`, and the returned `{ text, attempts }` (attempt count is part of the contract).
- **HTTP download retry loop**, `tools/pipeline-v2/src/lib/http-file-download.ts:164-196`: attempts = `retryCount + 1`, tmp-file per attempt, `progress?.({kind:"download_attempt_failed", ...})` callback between attempts, fixed `sleep(input.retryDelayMs ?? 1_000)`, rethrows last error. The tmp-file rename-on-success and `rm` cleanup are atomicity behaviors to preserve exactly.
- **Sequential orchestration without stage visibility**, `tools/pipeline-v2/src/commands/pipeline/finalize.ts:96-…`: `runPipelineFinalize` awaits ~10 stage functions in sequence (`runRouteTrendsIngest`, looped `runBackfillRouteRidershipTrends`, observed-headways, …). A throw anywhere aborts the month with no record of which stages completed.
- Tests live in `tools/pipeline-v2/test/`; fixture-backed, no live network in `bun test`.
- Repo rule (`CLAUDE.md`): pipeline changes verify with `bun --filter @bp/pipeline-v2 test` **and one fixture-backed command**.
- Style: Biome; no `p-limit`-style deps exist — don't add any besides `effect`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Fixture command | `bun run pipeline -- --help` then pick a check command, e.g. `bun run tools/pipeline-v2/src/checks/check-loc.ts` | exit 0 |
| Style | `bun run check:style` | exit 0 |

Do NOT run repo-wide `bun run check:types` (OOMs); scoped typecheck only.

## Scope

**In scope**:
- root `package.json` — add `effect` to the catalog; `tools/pipeline-v2/package.json` — add `"effect": "catalog:"`
- `tools/pipeline-v2/src/lib/resilience.ts` (create)
- `tools/pipeline-v2/src/lib/concurrency.ts` (create)
- `tools/pipeline-v2/src/lib/llm.ts` — retry loop only
- `tools/pipeline-v2/src/lib/http-file-download.ts` — retry loop only
- `tools/pipeline-v2/src/commands/backfill/route-ridership-trends.ts`, `tools/pipeline-v2/src/commands/docs/tier2/_discovery-extraction.ts`, `tools/pipeline-v2/src/commands/docs/tier2/_shared.ts` — replace local `mapWithConcurrency` definitions with imports
- `tools/pipeline-v2/src/commands/pipeline/finalize.ts` — stage ledger wrapper (step 4)
- `tools/pipeline-v2/test/` — new unit tests
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `@liche/core` command definitions, middleware, or `cli.ts` — Effect is NOT replacing the command framework
- `@earendil-works/pi-ai` internals and its own retry behavior — the `llm.ts` loop wraps it; only that outer loop changes
- `packages/sources/src/clients/socrata.ts` retry options — downstream consumers pass `retryCount/retryDelayMs` through `lib/soda3.ts`; unifying that is a follow-up, not this plan
- Any detector/parser/business logic in `commands/` beyond the mechanical import swaps listed above
- Continue-on-error semantics for finalize — step 4 improves *visibility*, it must NOT change all-or-nothing behavior

## Git workflow

- Branch: `advisor/005-pipeline-resilience`
- Commit per step; sentence-case imperative messages (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the Effect-backed primitives

Add the `effect` dependency (version from ADR-0019). Create `tools/pipeline-v2/src/lib/resilience.ts`:

```ts
import { Duration, Effect, Schedule } from "effect";

export type RetryOptions = {
  maxAttempts: number;          // total attempts, >= 1
  timeoutMs?: number;           // per-attempt timeout
  backoff?: { initialMs: number; factor?: number; maxMs?: number }; // omitted = no delay
  onAttemptFailed?: (info: { attempt: number; maxAttempts: number; error: unknown }) => void;
};

/** Runs fn with per-attempt timeout and retry. Resolves with the value and the
 *  number of attempts actually used; rejects with the LAST error. */
export function withRetry<T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  options: RetryOptions,
): Promise<{ value: T; attempts: number }>;
```

Implement with `Effect.tryPromise` per attempt (wiring an `AbortController` so the per-attempt `signal` aborts on timeout), `Effect.timeoutFail` for `timeoutMs`, and `Effect.retry` with a `Schedule` composed from `Schedule.recurs(maxAttempts - 1)` and (when `backoff` is set) `Schedule.exponential(Duration.millis(initialMs), factor)` capped via `Schedule.either`/union with a max-delay schedule. Track the attempt counter and invoke `onAttemptFailed` between attempts. Run with `Effect.runPromise`. Timeout rejection must carry a distinguishable error type (`export class RetryTimeoutError extends Error { attempt: number }`) so callers can format their own messages.

Create `tools/pipeline-v2/src/lib/concurrency.ts`:

```ts
import { Effect } from "effect";

export async function mapWithConcurrency<T, U>(
  values: readonly T[], concurrency: number, mapper: (value: T, index: number) => Promise<U>,
): Promise<U[]> {
  return Effect.runPromise(
    Effect.forEach(values, (v, i) => Effect.promise(() => mapper(v, i)), {
      concurrency: Math.max(1, concurrency),
    }),
  );
}
```

Keep the signature compatible with the existing three (the `index` param is additive; existing callers pass 3 args max). Order-preservation is required (Effect.forEach preserves order).

**Verify**: `bun --filter @bp/pipeline-v2 typecheck` → exit 0; new unit tests (Test plan cases 1–5) pass.

### Step 2: Repoint the three concurrency clones

- `commands/docs/tier2/_shared.ts:2890` — delete the local definition, re-export from `../../../lib/concurrency.ts` (`export { mapWithConcurrency } from ...`) so the many `_ocr-*.ts` importers are untouched.
- `commands/docs/tier2/_discovery-extraction.ts:1007` — delete the private clone, import from `lib/concurrency.ts`.
- `commands/backfill/route-ridership-trends.ts:117-136` — same.

One behavioral nuance: the route-ridership clone skips `undefined` array slots (`if (value !== undefined)`) — check its call site; if the input can genuinely contain `undefined`, filter at the call site, don't replicate the quirk in the shared helper.

**Verify**: `grep -rn "async function mapWithConcurrency" tools/pipeline-v2/src` → only `lib/concurrency.ts`. `bun --filter @bp/pipeline-v2 test` → all pass.

### Step 3: Rebase the two retry loops onto withRetry

- `lib/llm.ts:185-233`: replace the `for` loop with `withRetry`, preserving exactly: per-attempt `AbortController` semantics (use the `signal` arg), provider-error and empty-text error messages, the timeout message format (catch `RetryTimeoutError`, rethrow as `new Error(\`LLM request timed out after ${options.timeoutMs}ms for ${model.id}.\`)`), the `{ text, attempts }` return. Add backoff: `{ initialMs: 1_000, factor: 2, maxMs: 30_000 }` — this is the one deliberate behavior change (was: immediate retry); note it in the commit message.
- `lib/http-file-download.ts:164-196`: replace the loop with `withRetry`, keeping: tmp-path-per-attempt naming, `rename` on success, `rm` cleanup on failure (do cleanup inside the attempt's catch before rethrowing so `withRetry` stays generic), the `progress?.({kind:"download_attempt_failed", attempt, maxAttempts, message})` callback via `onAttemptFailed`, and the default 1s delay (`backoff: { initialMs: input.retryDelayMs ?? 1_000, factor: 1 }` — fixed delay preserved; factor 1 = constant).

**Verify**: `bun --filter @bp/pipeline-v2 test` → all pass, including existing llm/download tests (if none exist for these paths, the new tests in the Test plan cover them); `bun --filter @bp/pipeline-v2 typecheck` → exit 0.

### Step 4: Stage ledger for finalize

In `commands/pipeline/finalize.ts`, wrap each sequential stage call in a local helper:

```ts
type StageRecord = { stage: string; status: "ok" | "failed"; durationMs: number };
async function runStage<T>(ledger: StageRecord[], stage: string, fn: () => Promise<T>): Promise<T>
```

On failure: push the failed record, log the ledger so far (which stages completed, durations) via the file's existing logging/progress convention (read how finalize reports progress today and match it), then rethrow — all-or-nothing semantics unchanged. Include the ledger in `PipelineFinalizeResult` if its type can take an additive optional field; otherwise log-only.

**Verify**: new unit test (case 6); `bun --filter @bp/pipeline-v2 test` → all pass.

### Step 5: Full gate

**Verify**: `bun --filter @bp/pipeline-v2 typecheck`, `bun --filter @bp/pipeline-v2 test`, `bun run check:style` → all exit 0. Run one fixture-backed command per repo rule (a `src/checks/*` script like `check-loc.ts` qualifies and touches no network): exit 0.

## Test plan

New file `tools/pipeline-v2/test/resilience.test.ts` (model after an existing test in `tools/pipeline-v2/test/` for structure):

1. `withRetry` succeeds first try → `attempts === 1`, no `onAttemptFailed` calls.
2. Fails twice then succeeds with `maxAttempts: 3` → `attempts === 3`, two `onAttemptFailed` calls with correct attempt numbers.
3. Exhausts attempts → rejects with the LAST error (not the first, not an AggregateError).
4. `timeoutMs` exceeded → per-attempt abort: the `signal` passed to `fn` fires, rejection is `RetryTimeoutError`.
5. Backoff schedule: with `initialMs: 50, factor: 2`, measured gaps between attempt starts are ≥ 50ms then ≥ 100ms (use generous lower bounds only — no flaky upper bounds).
6. `mapWithConcurrency`: order preserved; concurrency cap honored (track max in-flight with a counter); empty input → `[]`; concurrency larger than input works.
7. finalize stage ledger: stub two stages where the second throws → ledger records `ok` + `failed`, error propagates.

Verification: `bun --filter @bp/pipeline-v2 test` → all pass including 7+ new tests.

## Done criteria

- [ ] `grep -rn "async function mapWithConcurrency" tools/pipeline-v2/src` → exactly one definition, in `lib/concurrency.ts`
- [ ] `lib/llm.ts` and `lib/http-file-download.ts` contain no `for (let attempt` loops (`grep -n "attempt <=" tools/pipeline-v2/src/lib` → no matches)
- [ ] `bun --filter @bp/pipeline-v2 typecheck` exits 0
- [ ] `bun --filter @bp/pipeline-v2 test` exits 0 with the new tests present
- [ ] One fixture-backed command ran, exit 0
- [ ] `effect` appears in `tools/pipeline-v2/package.json` only (not in `packages/*` or `apps/*`): `grep -l '"effect"' packages/*/package.json apps/*/package.json` → no matches
- [ ] `bun run check:style` exits 0; no files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- ADR-0019 does not exist or rejects Effect in the pipeline.
- Existing tests depend on the LLM loop's zero-delay retry timing (a test that asserts total elapsed time) — the backoff change would break them; report rather than weakening the backoff.
- `_shared.ts`'s `mapWithConcurrency` turns out to have diverged semantics from the excerpt above (it's at line ~2890 of a 10k-line file — read it first); if it does anything beyond the worker-pool pattern (e.g. error aggregation), report the diff.
- Effect's `runPromise` interacts badly with Bun's test runner or liche's process lifecycle (hung handles after CLI commands complete).
- The finalize result type is consumed somewhere that breaks on an additive field.

## Maintenance notes

- This establishes the Effect-inside/Promise-outside boundary for the pipeline. Future candidates to fold in: the Socrata client's `retryCount/retryDelayMs` pass-through (`lib/soda3.ts` → `@bp/sources/clients/socrata`), and `Effect.acquireRelease` for `lib/local-db.ts`'s `withLocalDb`. Do them only when touched for other reasons.
- The LLM backoff (1s→2s→…, cap 30s) is new behavior under rate-limit storms; if Tier-2 batch runs slow down noticeably, the knob is the `backoff` option at the `llm.ts` call site, not the helper.
- Reviewers: check that no command file imports `effect` directly — the boundary is `lib/`.
