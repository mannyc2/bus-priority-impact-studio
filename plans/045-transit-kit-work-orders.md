# Plan 045: nyc-transit-kit generic upgrades (cross-repo work order) + bus-repo adoption

> **Executor instructions**: This plan has two halves. Orders 2-3 execute in
> the SEPARATE repo `/mnt/models/dev/nyc-transit-kit` under THAT repo's own
> rules — read its `AGENTS.md`, `README.md`, `SPEC.md`, and `plans/README.md`
> before touching anything there, and follow its conventions over this
> plan's phrasing wherever they conflict. Orders 1 and 4 (adoption) execute
> in this repo. Publishing new kit versions to npm is OPERATOR-RUN — you
> prepare, the operator publishes. Run every verification command; on any
> STOP condition, stop and report. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git -C /mnt/models/dev/nyc-transit-kit log --oneline -5` and compare against the kit facts below (0.2.0 surface, compression directive, Effect pin). The operator actively develops the kit — moderate drift is EXPECTED; re-verify each order's premise before implementing it, and skip any order the kit has since implemented.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (additive kit features + drop-in bus-repo swaps)
- **Depends on**: none (plan 039 has landed, so the original
  ingest-conflict note is moot). Plan 047 depends on this plan's Order 1
  and owns the soda3/token call-site rework.
- **Category**: direction / migration
- **Planned at**: commit `ce3baca` (bus repo), 2026-07-04
- **Revised**: 2026-07-05 against kit 0.2.0 (kit commit `a1586b3`) — see
  revision note

## Revision note (2026-07-05)

The kit published 0.1.4 and then 0.2.0 (both on npm) the day after this
plan was written. 0.2.0 is a breaking surface-compression release (kit
plans 047-056; import moves tabulated in kit `docs/getting-started.md`
§"Migrating 0.1.x To 0.2.0") executed under an ACTIVE maintainer directive
with per-package sLOC budgets. Order mapping from the 2026-07-04 original:

- old Order 1(a) auto-pagination → SHIPPED by the kit (kit plan 042,
  `queryAllRows`/`queryAllSoda3Rows`); bus swap folded into new Order 1.
- old Order 1(b) CSV streaming → new Order 2, re-scoped to a generic byte
  stream (the bus parses downloaded files, not Response bodies).
- old Order 2 download helper → new Order 3; the "mta bun:file seam"
  pointer was stale (removed by kit plan 052) — the in-kit precedent is
  now CLI `atomicWrite`, which lacks resume.
- old Order 3 compat token helper → DROPPED (kit half): compat is 2x over
  its sLOC budget, kit plan 054 just deleted compat conveniences, and the
  per-call `appToken` option + CLI env convention + docs already exist.
  Bus half folded into new Order 1.
- old Order 4 → split: the pin bump plus a newly-required studio-api
  import fix are new Order 1 (ungated — 0.2.0 is published); adoption of
  the new kit features is new Order 4.

Same-day amendment (operator direction): compat is at most a transitional
surface for this plan — the Effect zone must consume the kit natively.
Plan 047 now owns the pagination/token call-site rework (Effect-native,
not compat), so Order 1 here slims to the pin bump + studio-api fix, and
Order 4's future adoption consumes the Effect-native forms per ADR-0021
(plan 047).

## Why this matters

A 2026-07-04 audit of both repos found the bus repo's kit adoption is
already correct — **no significant duplication remains** (the June plan-014
"replace duplicated source clients" premise is resolved; plan 029 adopted
kit 0.1.3 across sources/pipeline). After the kit's 0.2.0, what remains are
**two** genuinely generic capabilities the bus repo hand-rolls today that
belong in the kit — streaming CSV record decode and resumable byte-range
downloads — plus adoption wins 0.2.0 already unlocked (auto-pagination,
per-call app token), whose call-site rework lands Effect-natively via
plan 047. Shipping the two in the kit and swapping the bus repo onto all
of it (this plan + 047) deletes ~300 LOC of local plumbing and makes the
kit a stronger standalone product — which is itself an operator goal
(portfolio piece).

Explicitly NOT in scope, recorded so nobody re-audits: migrating the bus
repo's 18 source adapters into the kit (they are bus-specific
normalization, not generic transit clients — audit verdict), the geoclient/
census clients (non-transit), catalog-search ranking heuristics
(MTA-centric), and monthly-ingest orchestration (app-specific `replaceRows`
coupling; document as a pattern, don't productize).

## Current state

**Kit** (`/mnt/models/dev/nyc-transit-kit`, published as
`@nyc-transit-kit/{contracts,soda3,mta,nyc-dot,nyc-open-data,compat,fixtures,cli}@0.2.0`
— all eight on npm):
- Effect-native core; Effect pin still `4.0.0-beta.92` (same family as the
  bus repo). Effect Schema throughout; Promise facade in `compat`
  (`facadeStyle: "promise-over-effect"`).
- 0.2.0 compressed the public surface 44 → ~29 subpaths (kit plans
  047-056). Consumer import moves are in kit `docs/getting-started.md`
  §"Migrating 0.1.x To 0.2.0".
- **Compression directive is ACTIVE** (kit `plans/README.md`): per-package
  sLOC budgets as forcing functions, and "file count = API surface" — every
  non-internal src file must be a subpath export + api-reference section +
  downstream-strict import + often a compat wrapper. `soda3` (~700-800 vs
  budget 450-650) and `compat` (~230 vs 80-150) are already over budget.
  New kit surface is expensive by design; write tight and expect budget
  push-back.
- Already ships (relevant here): `queryAllRows` (`soda3/query`,
  auto-pagination, array-accumulating, default pageSize 1,000, optional
  `maxRows` that THROWS when exceeded) + compat `queryAllSoda3Rows`;
  `countRows`; `fetchDatasetMetadata`; shared retry/timeout policy engine
  (`soda3/transport`); `exportResponse` (byte-range capable, returns a
  `Response`); per-call `Soda3CompatOptions.appToken`; CLI reads
  `SOCRATA_APP_TOKEN` itself (`cli/src/runtime.ts:32`, documented — kit
  plan 010); CLI `atomicWrite` (`cli/src/files.ts`) streams a `Response` to
  disk with atomic rename + backup/rollback but has NO resume.
- Still missing (verified at `a1586b3`): CSV record streaming (no row/CSV
  decode anywhere in `soda3`; its `transport.ts` stream hits are
  `toWebResponse`), and any library-level download-to-file. Note:
  `mta/gtfs-static.ts` no longer does file I/O — the pre-052 "bun:file
  seam" this plan originally pointed at is GONE; the kit's only file I/O
  now lives in the CLI package.

**Bus repo hand-rolls the remaining candidates** (verified file:line):
1. **CSV streaming**: `tools/pipeline-v2/src/lib/streaming-csv.ts` (80
   LOC) — async-generator CSV record reader over DOWNLOADED FILES
   (`readCsvRecords(path)` at line 44 streams `Bun.file(path)`), not
   Response bodies. Known quirk: it splits on newlines BEFORE
   quote-parsing, so embedded newlines inside quoted fields are
   mishandled.
2. **Resumable download**: `tools/pipeline-v2/src/lib/http-file-download.ts`
   (194 LOC) — Range-header resume, atomic rename on success, bounded
   retries, progress callback.
3. **Plumbing obsoleted by 0.2.0**: the while-loop pagination in
   `lib/soda3.ts:216-239` (`createSoda3SourceClient`, default pageSize
   5,000 — `defaultPageSize` at line 6) and `lib/socrata-token.ts` (34 LOC
   fetch-wrapper injecting `X-App-Token`). Call-site rework owned by plan
   047 (Effect-native).

**Adoption sites on 0.2.0** (each verified against the kit migration
table):
- Survive unchanged: `packages/sources/src/gtfs-realtime/decoder.ts`
  (`decodeGtfsRealtimeBytes` from `mta/gtfs-realtime`),
  `packages/sources/src/probes/socrata-probe.ts` and `lib/soda3.ts`
  (`querySoda3Rows` from `compat/soda3`),
  `commands/sources/soda3-range-probe.ts` (`exportSoda3Response`).
- **BREAKS on pin bump**: `packages/studio-api/src/source-refresh.ts:1`
  imports `isSoda3ClientError` from `@nyc-transit-kit/compat/soda3`; 0.2.0
  narrowed error re-exports to the compat root and `compat/errors` (kit
  plan 054). One-line import fix — but this is the public serving path and
  was missing from this plan's original inventory.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Kit full gate (tests + typecheck + more) | (in kit repo) `bun run check` | exit 0 |
| Kit focused loop | (in kit repo) `bun test <path>` | all pass |
| Bus pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Bus pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Bus studio-api tests | `bun --filter @bp/studio-api test` | all pass |
| Bus unit tests | `bun run test:unit` | all pass |

## Scope

**In scope**:
- Bus repo now (Order 1): catalog pin bump 0.1.3 → 0.2.0 and the
  studio-api import fix. (The pagination/token call-site rework moved to
  plan 047, which consumes the kit natively.)
- Kit repo (Orders 2-3): a streaming CSV record decoder and a resumable
  download helper (module placement per the kit's own layering doctrine —
  the kit decides, not this plan); their tests and docs; filed as numbered
  kit plans; version bump prep.
- Bus repo after that kit release (Order 4):
  `tools/pipeline-v2/src/lib/{streaming-csv.ts,http-file-download.ts}` and
  their import sites + tests; catalog pin bump.

**Out of scope**:
- Everything in the "explicitly NOT in scope" list above.
- An app-token env helper in kit compat — REJECTED this revision (see
  revision note): the convention already exists in the kit and a ~30-LOC
  helper + subpath + docs + test to save consumers one `process.env` line
  does not clear the compression directive's bar.
- Kit CLI package, contracts redesign, any breaking change to published
  kit APIs.
- npm publish (operator).
- Bus-repo `packages/sources` adapters (the studio-api import fix is a
  sanctioned exception — `packages/studio-api` is not a source adapter).

## Git workflow

- Kit repo: the kit is plan-driven — file Orders 2-3 as numbered kit plans
  (057+, slotting after the compression program) in its `plans/README.md`
  and follow its branch style (`improve/NNN-slug`); its doctrine wins on
  placement and budgets.
- Bus repo: branch `plan/045-kit-adoption`; no push unless asked.

## Steps

### Order 1 (bus): adopt published kit 0.2.0 — ungated, may run first

0.2.0 is already on npm; this order waits on nothing kit-side.

1. Bump the six `@nyc-transit-kit/*` catalog pins in root `package.json`
   from `0.1.3` to `0.2.0`; `bun install`.
2. Fix the one known 0.2.0 break: in
   `packages/studio-api/src/source-refresh.ts:1` import
   `isSoda3ClientError` from `@nyc-transit-kit/compat/errors` (or the
   compat root) instead of `compat/soda3`; `querySoda3Rows` stays on
   `compat/soda3`.
3. The pagination and token call-site swaps originally staged here moved
   to plan 047, which rewrites the same lines Effect-natively (a compat
   swap first would be a second transitional shape for the same code).
   Nothing else in this order touches `tools/pipeline-v2` source.

**Verify**: `bun --filter @bp/pipeline-v2 test`,
`bun --filter @bp/studio-api test`, then `bun run test:unit` — the pin
bump alone must not change behavior; fixture tests are the byte-behavior
oracle (STOP condition below).

### Order 2 (kit): streaming CSV record decode

Premise re-check: `rg -ln "csv|Csv" /mnt/models/dev/nyc-transit-kit/packages/*/src` —
if the kit has grown a CSV decoder since `a1586b3`, skip to Order 3.
(Auto-pagination needs no kit work — `queryAllRows` shipped in 0.2.0.)

Add a CSV record decoder over a GENERIC byte stream (Effect
`Stream<Uint8Array>` or `ReadableStream<Uint8Array>`), not over `Response`
only: the bus parses downloaded FILES (`streaming-csv.ts:44`), so a
Response-body-only decoder would not replace it. Expose an Effect-native
form plus a Promise/async-generator form through `compat` (matching its
`facadeStyle`). Implement CORRECT quote handling including embedded
newlines inside quoted fields — the bus parser mishandles those (splits on
newline first); record this as an intentional semantic difference, guarded
by fixture tests, not behavior to preserve. Port the other tricky cases
(quote escaping, CRLF, trailing partial line) from the bus's
`streaming-csv.ts`. Respect the sLOC budget pressure on `soda3` — keep it
one tight module; where it lives is the kit's call.

**Verify**: kit `bun run check` green.

### Order 3 (kit): resumable download-to-file helper

Premise re-check first (as above). The kit today: CLI `atomicWrite`
(`cli/src/files.ts`) streams a `Response` to disk with atomic rename +
backup/rollback but NO resume; `mta` no longer does any file I/O (do not
hunt for the old bun:file seam — kit plan 052 removed it); library
packages are platform-neutral. The layering question is the kit's to
answer — present these options in the kit plan you file:

(a) a platform-neutral resume CORE in the library (Range computation over
`exportResponse` + a resumed byte stream; consumers own file writes), with
the CLI's `atomicWrite` growing resume on top; (b) a deliberately
platform-gated (Bun) file helper; (c) reject — the bus keeps its local
module (record the verdict here). Port the SEMANTICS (not the code) from
the bus's `http-file-download.ts:40-95`: resume from an existing partial
file via Range, atomic rename on completion, bounded retries. The progress
callback is bus-specific — fine to leave to a thin bus wrapper. Tests:
resume-from-partial and atomic-rename with an injected fetch (kit
convention).

**Verify**: kit `bun run check` green.

### Order 4 (kit release, then bus adoption of the new features)

1. Prepare the kit release per its `release.config.json` conventions (next
   version per kit policy — additive minor, so likely 0.3.0); hand to the
   operator to publish. STOP here until the operator confirms the publish.
2. Bus repo: bump the six `@nyc-transit-kit/*` catalog pins to the new
   version; `bun install`.
3. Swap, one module at a time, keeping tests green after each:
   - `lib/streaming-csv.ts` → kit CSV decoder; delete the local module if
     fully covered, else keep a thin documented wrapper.
   - `lib/http-file-download.ts` call sites → kit download helper (per the
     Order-3 verdict); progress logging into `data/ops` ledgers likely
     survives as a thin local wrapper — note it.

   Consume the Effect-native forms directly in the pipeline (ADR-0021,
   plan 047); the compat async-generator forms are for edge consumers
   only.

**Verify**: `bun --filter @bp/pipeline-v2 test` + `bun run test:unit`
green; `rg -l "streaming-csv|http-file-download|socrata-token" tools/pipeline-v2/src` → only surviving thin wrappers (or empty); net LOC change in the PR description.

## Test plan

- Kit: CSV decode edge cases (quote escaping, CRLF, trailing partial line,
  embedded newline in a quoted field — the intentional divergence),
  resume-from-partial, atomic rename. (Pagination-termination tests
  already exist — kit plan 042.)
- Bus: existing pipeline fixture tests are the adoption oracle; studio-api
  tests cover the import fix; no new bus tests unless a thin wrapper
  survives (then one test on the wrapper).

## Done criteria

- [ ] Order 1: bus pins at 0.2.0, studio-api import fixed; pipeline +
      studio-api + unit tests green (pagination/token rework tracked in
      plan 047)
- [ ] Kit ships streaming CSV decode + resumable download (or an order was
      skipped/rejected with evidence per kit doctrine), kit
      `bun run check` green
- [ ] Operator published the follow-up kit version; bus pins bumped; the
      two remaining lib modules deleted or reduced to documented thin
      wrappers
- [ ] `bun --filter @bp/pipeline-v2 test` + `bun run test:unit` green
- [ ] `plans/README.md` status row updated (note kit versions in the row)

## STOP conditions

- The kit's AGENTS.md/SPEC.md/plans-README doctrine (including sLOC
  budgets) forbids or reshapes an order — the kit's doctrine wins; report
  the conflict (or budget rejection) rather than forcing this plan's
  shape.
- Operator publish doesn't happen — stop after Order 3 with the kit branch
  ready; Order 4 must not run against a local `file:` pin. (Order 1 is NOT
  gated — 0.2.0 is already published.)
- An adoption swap changes ingest byte-behavior (fixture test diff) — the
  kit helper semantics differ from the local one; report the diff, keep
  the local module.
- The 0.2.0 bump surfaces breaks beyond the studio-api import — the
  migration audit above missed something; report before patching around
  it.
- You find yourself editing `packages/sources` adapters — out of scope.

## Maintenance notes

- Bus repo remains the kit's most demanding consumer; future "should this
  be in the kit?" questions get the same test used here: generic for any
  SODA3/transit consumer → kit; bus-specific normalization/orchestration →
  stays local (this plan's rejected list is the precedent).
- **Feed bus consumer evidence into the kit's "deeper cuts" sign-off**
  (kit `plans/README.md`): cut #5 (compat root-only exports) would break
  every bus `compat/soda3` import (5 sites); cuts #1 (SoQL window helpers)
  and #2 (CLI range-probe) do NOT affect the bus (it builds SoQL text
  locally and uses library `exportSoda3Response`, not the CLI). The kit
  records these cuts as lacking downstream-consumer evidence — the bus
  repo is that evidence.
- The kit is Effect-Schema-native; after plan 044 the bus repo is too —
  future adapter simplification (consuming kit row types directly in
  `packages/sources`) is a deferred follow-up, noted in plan 044.
- Reviewer (kit side): APIs added here must not import bus-repo concepts
  (no "route", no "month ingest") — that is the generic/specific line.
