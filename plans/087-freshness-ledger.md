# Plan 087: Freshness ledger — one report answering "how far behind upstream are we?"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 11 table).
>
> **Drift check (run first)**:
> `git diff --stat 27755f4..HEAD -- tools/pipeline-v2/src/commands/audit tools/pipeline-v2/src/commands/plan/source-refresh.ts tools/pipeline-v2/src/commands/check/route-speed-availability.ts tools/pipeline-v2/src/lib packages/sources/src/registry tools/pipeline-v2/test knowledge/wiki/engineering`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (additive command + artifact; only string edits to existing code)
- **Depends on**: `plans/084-retire-month-anchors-doctrine.md` (vocabulary),
  `plans/086-demonth-release-identity.md` (hard — the ledger reads
  `publishedAt`/`coverage` from `export-summary.json`)
- **Category**: dx
- **Planned at**: commit `27755f4`, 2026-07-12

## Why this matters

The operator's direction (ADR-0022) reduces the whole monthly-release
apparatus to one operational question: **are we up to date, and if not, by how
much, per source?** Today that question is unanswerable without archaeology:
production served a March-2026 label well into July; the only freshness
machinery is a single-source binary (`check route-speed-availability` →
`shouldRebuild` for route speeds) plus a worker-side variant that, until plan
085, compared against a hand-pinned env var. Nothing reports per-source lag
across the ~18 ingested sources, and nothing compares upstream-available vs
locally-ingested vs actually-published. This plan adds `audit freshness`: one
command, one artifact, one table — per source: latest upstream, latest
ingested, latest published, and the lag between them. It is the replacement
the retired month anchors were standing in for.

## Current state

- **Existing single-source freshness logic** (the pattern to generalize):
  `tools/pipeline-v2/src/commands/check/route-speed-availability.ts` — probes
  Socrata for the latest *complete* speed month (completeness = min route
  count), returns `releaseDecision { latestCompleteMonth, status,
  shouldRebuild }`. Consumed by
  `tools/pipeline-v2/src/commands/plan/source-refresh.ts` (verified excerpts):
  - `source-refresh.ts:58-63` — `latestCompleteMonth` vs `lastBuiltMonth` →
    watcher status `ready_to_rebuild | blocked | idle`;
  - `source-refresh.ts:15-22` — job ids `"gtfs_rt_collector" |
    "route_speed_monthly_watcher"` (artifact contract — do NOT rename ids);
  - month-doctrine strings to clean here: `:76-77` ("Run observed monthly
    promotion checks only after…"), `:91-92` ("…promote to an observed
    monthly release only when same-month GTFS-RT evidence exists."), `:96`
    ("Keep the current build as the latest public-source release."), `:178`
    (command summary "…and monthly speed data").
  - It already writes an artifact:
    `sourceRefreshPlanArtifactPath(root) = <root>/source-refresh/plan.json`
    (:33-35) — follow this artifact-path idiom for the ledger.
- **Source inventory**: `packages/sources/src/registry` exports the Socrata
  source manifests (`SocrataManifestSource` — imported by source-refresh.ts:4).
  Each manifest identifies the upstream dataset; the soda3 client
  (`tools/pipeline-v2/src/lib/soda3.ts`, `SocrataFetch` type) is the transport
  used for probes and supports injected fetchers for tests.
- **Ingested state**: the local SQLite corpus (`data/local/pipeline.sqlite`)
  holds per-source month-grain rows; helpers live under
  `tools/pipeline-v2/src/lib/local-db-aggregates/`. A `max(month)`-per-source
  query is the "latest ingested" signal. (Discover exact table names per
  source from the ingest command for that source or the aggregates lib —
  record the mapping in the ledger source descriptors, Step 1.)
- **Published state** (post-086): `data/exports/d1/<month>/export-summary.json`
  carries `publishedAt` + `coverage { start, end }`; the latest export summary
  = latest published serving cut. Map releases:
  `data/artifacts/map/<month>/manifest.json` carries `publishedAt` +
  `coverage` (amended plan 079).
- **Freshness thresholds already in the codebase** (reuse, do not invent new
  vocabulary): capability freshness `current | recent | stale | unknown` with
  a 3-month "recent" window (`packages/domain/src/studio/route-capability.ts:41-50`);
  the data-product registry has `staleAfterDays`
  (`packages/analytics/src/data-products/registry.ts:80-82`).
- **Command + test conventions**: commands are `defineCommand` descriptors
  with `Schema.Struct` input/output (see `source-refresh.ts:176-250` — a
  complete exemplar including typed output schema); audit-command fixture
  tests live at `tools/pipeline-v2/test/commands/audit/` (model on
  `data-product-completeness.test.ts`'s fixture style: temp dirs + injected
  fetchers, no network).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Tests | `bun --filter @bp/pipeline-v2 test` | pass (incl. new ledger tests) |
| Run against fixtures | the new test does this; a live run is operator-only (network) | — |
| Knowledge lint | `bun run check:knowledge` | exit 0 |
| Full gate (final) | `bun run check:prepush` | exit 0 |

## Scope

**In scope** (the only files you should modify/create):
- `tools/pipeline-v2/src/commands/audit/freshness.ts` (create)
- a small lib if needed: `tools/pipeline-v2/src/lib/freshness-ledger.ts` (create)
- `tools/pipeline-v2/src/commands/plan/source-refresh.ts` (string cleanup only)
- `tools/pipeline-v2/test/commands/audit/freshness.test.ts` (create)
- `knowledge/wiki/engineering/freshness_ledger.md` (create),
  `knowledge/wiki/engineering/cli_commands.md` (add the command entry),
  `knowledge/wiki/engineering/data_pipeline_operationalization_status.md`
  (replace plan 084's dated staleness addendum with the ledger pointer),
  `knowledge/log.md` (append)

**Out of scope** (do NOT touch):
- The Worker/serving path — the status endpoint's coverage reporting landed in
  plan 085; the ledger is an offline operator tool (per ADR-0017's surviving
  rule: the Worker stays lightweight).
- `check/route-speed-availability.ts` internals — consume it, don't refactor it.
- Any new UI surface — no pages, no tabs (standing operator direction).
- `data/**` writes outside `data/artifacts/audits/` (the ledger artifact
  location) — and never delete anything.
- Renaming the `source-refresh` job ids or artifact path (contract).

## Git workflow

- Branch: `advisor/087-freshness-ledger`.
- Commit per step; imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Source descriptors

In `lib/freshness-ledger.ts`, define the ledger's source descriptor list:
for each tracked source — `sourceId`, `grain` (`month` | `snapshot` |
`realtime`), how to read **upstream latest** (Socrata max-month/`:updated_at`
probe via the soda3 client with an injectable `SocrataFetch`; for the
route-speed source, reuse `runRouteSpeedAvailability`'s result instead of a
second probe), how to read **ingested latest** (SQLite `max(month)`/max date
query per source table — enumerate from the sources registry + ingest
commands; where a source has no local table yet, mark `ingested: null`), and
how to read **published latest** (from the newest
`data/exports/d1/*/export-summary.json` by `publishedAt`, plus the newest map
manifest for map-only families). Start with the sources the product actually
serves (route segment speeds, route trends/ridership, BWA, GTFS-RT window,
ACE, lane/treatment sources); a source may be listed with
`upstreamProbe: "none"` → its upstream column reports `unknown` (never
guess).

**Verify**: `bun --filter @bp/pipeline-v2 typecheck` → exit 0.

### Step 2: The `audit freshness` command

`commands/audit/freshness.ts` (`path: ["audit", "freshness"]`): for each
descriptor produce a row `{ sourceId, grain, upstreamLatest: IsoMonth|IsoDate|null,
ingestedLatest, publishedCoverageEnd, ingestLagMonths: number|null,
publishLagMonths: number|null, status }` where `status` reuses the capability
vocabulary: `current` (no lag), `recent` (≤3 months behind upstream), `stale`
(>3), `unknown` (no probe). Compute lags with the same month arithmetic as
`freshnessForDataAsOf` (`packages/domain/src/studio/route-capability.ts:61-64`
shows the parse idiom). Write
`data/artifacts/audits/freshness-ledger.json` `{ checkedAt, publishedAt?,
rows }` (artifact-path override flag like source-refresh's `--output`), print
an aligned console table sorted worst-first, and set a nonzero-exit `--strict`
flag when any serving-critical source is `stale` (default off — reporting
tool first, gate later). Typed output schema per the source-refresh exemplar.

**Verify**: `bun --filter @bp/pipeline-v2 test` (the Step 4 test drives this) and the command registers — the CLI completeness test that pins command discovery must pass unmodified except for the expected-count bump if it asserts an exact registry size.

### Step 3: source-refresh string cleanup

Rewrite the four month-doctrine strings listed in Current state
(`:76-77`, `:91-92`, `:96`, `:178`) without monthly-release framing — e.g.
"Run observed-reliability promotion checks only after the collected realtime
window has matching public speed coverage."; "Regenerate D1/static exports
and publish a release only when same-window GTFS-RT evidence exists.";
"Keep the current build as the latest published release."; summary: "Write
the production source-refresh plan for GTFS-RT and public speed data." Do not
change ids, statuses, or the artifact shape. Remove the corresponding entries
from the plan-088 month-doctrine allowlist if 086 left any for this file.

**Verify**: `rg -in 'monthly release|monthly promotion' tools/pipeline-v2/src/commands/plan/source-refresh.ts` → 0; `bun --filter @bp/pipeline-v2 test` → pass.

### Step 4: Fixture test

`test/commands/audit/freshness.test.ts`, modeled on
`data-product-completeness.test.ts` fixtures: temp artifact root with (a) a
fake `export-summary.json` carrying `publishedAt` + `coverage`, (b) an
injected Socrata fetcher returning a newer upstream month for one source and
an equal month for another, (c) a temp SQLite (or injected ingested-latest
resolver — prefer injecting a resolver function over requiring a real DB
file, matching how source-refresh injects `fetcher`). Assert: per-row lag
math (0 → `current`; 2 months → `recent`; 4 → `stale`; no probe → `unknown`),
worst-first ordering, artifact written and schema-valid, `--strict` exit
behavior both ways.

**Verify**: `bun --filter @bp/pipeline-v2 test` → all pass including the new file.

### Step 5: Docs — the runbook page

1. Create `knowledge/wiki/engineering/freshness_ledger.md`: what the ledger
   is (ADR-0022's replacement for month anchors), how to run it, how to read
   the table, the cadence ("run after each ingest wave and before each
   publish; the publish runbook links here"), and the row semantics.
2. `cli_commands.md`: add the `audit freshness` entry.
3. `data_pipeline_operationalization_status.md`: replace plan 084's dated
   staleness addendum with: current published coverage (from the last
   export-summary), plus "run `audit freshness` for the live lag table."
4. Append `knowledge/log.md` entry.

**Verify**: `bun run check:knowledge` → exit 0; `rg -n 'audit freshness' knowledge/wiki/engineering/cli_commands.md` → ≥ 1.

## Test plan

- New: `test/commands/audit/freshness.test.ts` (cases in Step 4 — lag math,
  ordering, artifact write, strict exit, unknown-probe honesty).
- Updated: none expected beyond a possible command-registry count test.
- Verification: `bun --filter @bp/pipeline-v2 test` all green; final
  `bun run check:prepush` exit 0.

## Done criteria

- [ ] `bun --filter @bp/pipeline-v2 test` passes with the new freshness tests
- [ ] The command exists: `rg -n '\["audit", "freshness"\]' tools/pipeline-v2/src/commands/audit/freshness.ts` → 1 hit
- [ ] Ledger artifact schema includes per-row `upstreamLatest`, `ingestedLatest`, `publishedCoverageEnd`, both lags, `status` (test asserts)
- [ ] A source without a probe reports `unknown` — grep the test for the case
- [ ] `rg -in 'monthly release|monthly promotion' tools/pipeline-v2/src/commands/plan/source-refresh.ts` → 0 hits
- [ ] `knowledge/wiki/engineering/freshness_ledger.md` exists; `cli_commands.md` lists the command; `bun run check:knowledge` exit 0
- [ ] `bun run check:prepush` exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 086 has not landed (no `publishedAt`/`coverage` in export summaries) —
  the ledger must not parse month-keyed directory names as a fallback
  identity; that would re-encode the concept this generation removes.
- A source's "latest ingested" cannot be determined from an existing table or
  a cheap query — list it as `ingested: null` and note it; if MOST sources end
  up null, stop (the descriptor mapping assumption failed).
- The Socrata metadata probe for any source requires authentication or
  >1 request per source — report instead of hammering.
- You find yourself adding the ledger to the Worker or a web page.

## Maintenance notes

- The ledger is advisory in v1 (`--strict` off by default). Once the operator
  trusts it, wiring `--strict` into the publish runbook (not CI) is the
  natural next step.
- When new sources are ingested, adding a ledger descriptor should become
  part of the ingest-command checklist — note added to the runbook page.
- The worker-side `/api/v1/status` coverage (plan 085) and this ledger answer
  different questions (what is served vs how far behind we are); resist
  merging them into one endpoint — the Worker must not probe upstream.
- Reviewer focus: the descriptor table's ingested-latest queries (per-source
  correctness) and that no probe fabricates an upstream month when metadata
  is missing.
