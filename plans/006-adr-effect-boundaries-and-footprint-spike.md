# Plan 006: Decide Effect adoption boundaries in ADR-0019, backed by a measured bundle-footprint spike

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 58dfaeb..HEAD -- docs/decisions/ apps/web/wrangler.jsonc tools/pipeline-v2/src/checks/check-web-performance.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `58dfaeb`, 2026-06-13

## Why this matters

The maintainer wants to adopt the Effect TS stack to cut complexity. An advisor audit (2026-06-13) found the payoff is real in two places (worker-side HTTP plumbing, pipeline resilience) and **blocked or worthless in three others** (browser client, domain schema bodies, SQL layer). Per `CLAUDE.md`, toolchain decisions of this size must be recorded as an ADR under `docs/decisions/`. This plan writes ADR-0019 and grounds its one open number — the gzipped cost of Effect in a workerd bundle — with a disposable measurement spike instead of guesswork. Plans 009 and 010 are gated on this ADR's verdict.

## Current state

- `docs/decisions/` contains ADRs 0001–0018 (0005/0006 are absent; that is pre-existing). Next number is **0019**. `docs/decisions/0001-bun-zod-testing-toolchain.md` records Zod v4 as the runtime-contract library — ADR-0019 partially supersedes it for the worker HTTP boundary only, and must say so explicitly.
- Effect is not currently a dependency anywhere: `grep -rn '"effect"' package.json packages/*/package.json tools/*/package.json apps/*/package.json` returns nothing.
- The web client budget is nearly exhausted. `tools/pipeline-v2/src/checks/check-web-performance.ts:11-19`:

  ```ts
  const budgets = {
    mainAppChunkGzipBytes: 325 * 1024,
    initialJsGzipBytes: 168 * 1024,
    initialCssGzipBytes: 32 * 1024,
    maxSingleLazyChunkGzipBytes: 104 * 1024,
  } as const;
  ```

  The last build artifact `data/artifacts/web-audits/latest/performance-budget.json` (2026-06-12) reports `initialJsGzipBytes: 171973` against a budget of `172032` — **59 bytes of headroom**. Any plan that adds runtime bytes to the initial client bundle fails the build (`apps/web/package.json` → `"build": "vite build && bun run check:bundle-budget"`).
- The worker runs on Cloudflare `workerd` (`apps/web/wrangler.jsonc`), deployed with wrangler. Worker bundle size is constrained by Cloudflare's per-script limit; the largest current worker-side chunk is ~399 KB gzipped.
- Audit facts the ADR must record as rationale (verified against code on 2026-06-13):
  - Schema LOC: zod schema definitions in `packages/domain` are ~7% of the package; the field enumerations are load-bearing and would be the same size in Effect Schema. Migrating `packages/domain` to Effect Schema is LOC-neutral churn across ~65 files.
  - SQL: `packages/db` uses Drizzle with typed schemas, chunked batch inserts, and transactions; `@effect/sql` would wrap, not replace. No value.
  - Pipeline: `tools/pipeline-v2` has three hand-rolled copies of `mapWithConcurrency` (`commands/docs/tier2/_shared.ts:2890`, `commands/docs/tier2/_discovery-extraction.ts:1007`, `commands/backfill/route-ridership-trends.ts:117`) and two independent retry loops without backoff (`lib/llm.ts:186-232`, `lib/http-file-download.ts:167-196`). Effect core fits here; it is a local-only tool with no bundle constraint.
  - HTTP: `packages/studio-api` has ~2.4k LOC of hand-rolled routing/OpenAPI/client plumbing whose metadata (auth scopes, cache policy, idempotency) is declared in `src/contracts/registry.ts` but not enforced by the dispatcher in `src/api.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (spike dir only) | `bun install` (run inside the spike dir) | exit 0 |
| Spike build | `bun build --target=browser --minify` (see step 2) | bundle file emitted |
| Gzip measure | `gzip -c <bundle> \| wc -c` | byte count printed |
| Repo style check | `bun run check:style` | exit 0 |

Do NOT run repo-wide `bun run check:types` — it OOMs at the default node heap. This plan adds no TypeScript to the workspace, so no typecheck is needed.

## Scope

**In scope** (the only files you should create or modify):
- `docs/decisions/0019-effect-adoption-boundaries.md` (create)
- `knowledge/index.md`, `knowledge/log.md` (append the decision per repo rule in `CLAUDE.md`)
- `plans/README.md` (status row)
- A disposable spike directory **outside the workspace globs** — use `/tmp/effect-spike/` so the root `package.json` workspaces (`apps/*`, `packages/*`, `tools/*`) never see it.

**Out of scope** (do NOT touch):
- Any `package.json` inside the repo — Effect must NOT be added as a real dependency in this plan.
- Any source file under `apps/`, `packages/`, `tools/`.
- `docs/decisions/0001-*.md` — superseding is stated in the new ADR, the old file is immutable history.

## Git workflow

- Branch: `advisor/001-effect-adr`
- Commit style: sentence-case imperative one-liners (match `git log`, e.g. "Give the route map real shoreline context and stop ticks").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the measurement spike

In `/tmp/effect-spike/`, create a minimal package:

```jsonc
// /tmp/effect-spike/package.json
{ "name": "effect-spike", "private": true, "type": "module" }
```

`bun add effect @effect/platform` (record the exact resolved versions — they go in the ADR). Then create two entry files:

- `schema-only.ts` — imports only `Schema` from `effect` and decodes one small struct (mirrors what "Effect Schema in the client" would minimally cost):

  ```ts
  import * as Schema from "effect/Schema";
  const S = Schema.Struct({ routeId: Schema.String, speedMph: Schema.Number });
  console.log(Schema.decodeUnknownSync(S)({ routeId: "B46", speedMph: 6.2 }));
  ```

- `httpapi-worker.ts` — a minimal `HttpApi` definition with one GET endpoint plus the builder/router needed to produce a fetch handler (mirrors "Effect HttpApi in the worker"). Use the current `@effect/platform` `HttpApi` / `HttpApiBuilder` / `HttpApiEndpoint` modules; consult the installed package's docs/types, not memory.

**Verify**: both files run under `bun run <file>` → exit 0 (the worker one may just construct the handler and log a key of it).

### Step 2: Measure tree-shaken gzipped size

For each entry:

```sh
bun build /tmp/effect-spike/schema-only.ts --target=browser --minify --outfile=/tmp/effect-spike/out-schema.js
gzip -c /tmp/effect-spike/out-schema.js | wc -c
bun build /tmp/effect-spike/httpapi-worker.ts --target=browser --minify --outfile=/tmp/effect-spike/out-httpapi.js
gzip -c /tmp/effect-spike/out-httpapi.js | wc -c
```

(`--target=browser` approximates workerd: no Node built-ins.) Record both gzipped byte counts.

**Verify**: two numbers recorded; builds exited 0. If `bun build` fails on Node-builtin imports from `@effect/platform`, note which module pulled them in — that itself is a spike finding (record it in the ADR; try `@effect/platform`'s web/fetch variants before giving up).

### Step 3: Write ADR-0019

Create `docs/decisions/0019-effect-adoption-boundaries.md` following the structure of an existing ADR (e.g. `docs/decisions/0001-bun-zod-testing-toolchain.md`: title, `Date:`, `## Decision`, `## Why`, `## Consequences`). The decision content, with the spike numbers filled in:

- **Adopt** Effect core in `tools/pipeline-v2` for retry/timeout/concurrency plumbing (local-only tool, no bundle constraint). → enables plan 010.
- **Adopt conditionally** `@effect/platform` HttpApi for the worker-side HTTP layer in `packages/studio-api`, **only if** the measured `out-httpapi.js` gzipped size is ≤ 120 KB and it builds without Node built-ins. Otherwise record FAIL and the fallback (registry-driven enforcement, plan 008, becomes the end state). → gates plan 009.
- **Reject** Effect Schema as a replacement for zod in `packages/domain`/`packages/sources`: schema field lists are load-bearing, measured overhead ~7%, migration is LOC-neutral churn across ~65 files. Zod v4 (ADR-0001) remains the contract library outside the worker HTTP boundary.
- **Reject** Effect in the browser bundle: initial-JS budget has 59 bytes of headroom (cite `data/artifacts/web-audits/latest/performance-budget.json`); record the measured `out-schema.js` size as the evidence.
- **Reject** `@effect/sql`: Drizzle + `bun:sqlite` already provide typed schemas, chunked batch inserts, and transactions.

Append one-line entries to `knowledge/index.md` and `knowledge/log.md` pointing at the ADR (match the existing entry style in those files).

**Verify**: `bun run check:style` → exit 0. `ls docs/decisions/0019-effect-adoption-boundaries.md` → exists.

### Step 4: Record the gate verdict

At the top of the ADR's Consequences section, write one of:
- `Spike verdict: PASS (httpapi gzip = NN KB ≤ 120 KB)` — plan 009 is unblocked.
- `Spike verdict: FAIL (reason)` — mark plan 009 as BLOCKED in `plans/README.md` with the reason.

Delete `/tmp/effect-spike/`.

**Verify**: `git status` shows only in-scope files modified.

## Test plan

No code tests — this plan produces a decision document and two measurements. The "test" is that both spike builds ran and their byte counts appear verbatim in the ADR.

## Done criteria

- [ ] `docs/decisions/0019-effect-adoption-boundaries.md` exists, contains two measured gzip byte counts and exact Effect package versions
- [ ] ADR states the supersession relationship to ADR-0001 explicitly
- [ ] `knowledge/index.md` and `knowledge/log.md` reference the new ADR
- [ ] No repo `package.json` gained an Effect dependency (`grep -rn '"effect"' --include=package.json apps packages tools` → no matches)
- [ ] `bun run check:style` exits 0
- [ ] `plans/README.md` rows updated for 001 and (if FAIL) 004

## STOP conditions

Stop and report back (do not improvise) if:

- `docs/decisions/0019-*.md` already exists with different content (someone else decided).
- `bun add effect @effect/platform` resolves a major version other than effect 3.x — the audit's assumptions are about Effect 3; report the version found.
- Both spike builds fail even with web/fetch platform variants — report the errors; do not write a PASS/FAIL verdict from guesswork.

## Maintenance notes

- The 120 KB worker gate is conservative (current largest worker chunk ~399 KB gz; Cloudflare's limit applies to the whole script). A reviewer may consciously raise it in the ADR — the point is the number is measured, not assumed.
- If Effect later ships a smaller schema-only entrypoint, the browser rejection may be revisited — re-run step 2 and amend with a new ADR, don't edit 0019.
