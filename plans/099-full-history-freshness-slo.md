# Plan 099: Full dataset history and a one-period freshness SLO

## Status

- **State**: TODO
- **Priority**: P1
- **Effort**: XL
- **Depends on**: Plan 098; Plans 084 and 087
- **Audit base**: `origin/main@ecf556a79e23b4b9374d08210a380754756f357b`
- **Suggested branch**: `codex/099-full-history-freshness-slo`

## Outcome

Discover, ingest, publish, and expose the full trustworthy history available
for each logical dataset without clipping all sources to one intersection.
Detect upstream completeness every day, require critical published data to be
no more than one complete source period behind, and require a newly complete
partition to be reviewed and activated within seven calendar days.

The freshness ledger becomes a strict operational contract rather than an
advisory month comparison. It reports upstream availability, local ingestion,
candidate staging, and active publication separately for every dataset and
for route-level gaps where applicable.

## Binding SLO

For every critical logical dataset:

- the detector runs at least once per UTC calendar day;
- `current`: active publication includes the latest complete upstream period;
- `within_slo`: active publication is exactly one complete source period
  behind and the seven-day deadline has not expired;
- `breach`: active publication is more than one complete source period behind,
  or a detected complete partition has remained unpublished for more than
  seven calendar days;
- `unknown`: any missing critical upstream/ingested/published comparison, stale
  probe, or undecodable receipt; strict audit fails;
- detection creates a reviewed publication candidate/alert. It never
  automatically publishes.

Use the source's real cadence. Calendar-month arithmetic applies only to
monthly datasets. Daily, snapshot, and realtime products use typed duration,
snapshot-age, or service-date rules. Prefer a source-provided completion time.
Otherwise the registry must define a defensible scheduled completion boundary,
and the deadline begins at the earlier of that boundary and the first daily
observation that proves completeness. If neither can be established, freshness
is `unknown`; a missed detector run cannot reset or extend the seven-day clock.

No waiver changes data, status, candidate admission, or activation readiness.
A critical incident acknowledgement may be explicit, bounded to one dataset/
partition, name the owner/reason/expiry, and be retained in the audit receipt,
but it remains `breach`/`unknown`. It can annotate an operational incident; it
can never admit a coverage/history regression or turn `unknown` into
`current`.

## Verified current boundary

| Concern | Current evidence | Required correction |
|---|---|---|
| Model grain | `tools/pipeline-v2/src/lib/freshness-ledger.ts:40-137` models source descriptors, while `knowledge/raw/source_manifest.yaml` splits historical/current IDs for speed and ridership | Coalesce source captures into stable logical datasets with source-specific partitions. |
| Status thresholds | `freshness-ledger.ts:206-216` calls lag 1-3 “recent” and only >3 stale | Enforce zero/current, one/within-SLO, >1/breach. |
| Strictness | `tools/pipeline-v2/src/commands/audit/freshness.ts:226-235` fails verified stale only; existing tests allow unknown critical sources | Unknown critical is a failing operational state. |
| Published coverage | `freshness-ledger.ts:239-273` maps sources to one D1/map coverage end; `packages/domain/src/studio/shared.ts` exposes only `{start,end}` | Read active candidate coverage by logical dataset, including gaps/grain. |
| History discovery | `tools/pipeline-v2/src/commands/check/route-speed-availability.ts:69-117` defaults to current year minus one; `export/d1-inputs.ts:48` fixes history start at `2023-04` | Probe earliest trustworthy availability and persist verified bounds. |
| Backfill | `backfill/socrata-range.ts` omits core speed/ridership/wait data; several ingest/build commands operate on one explicit/default month | Add resumable source-specific range ingestion with partition receipts. |
| Public truth | `packages/studio-api/src/public-api.ts:88` and route resolver derive one speed/batch window; `/api/v1/status` has no per-dataset matrix | Serve the active candidate's dataset coverage and route gaps. |
| Freshness docs | `knowledge/wiki/engineering/freshness_ledger.md:39-99` describes advisory unknown and the three-period grace | Replace docs and tests with the binding SLO. |

Some descriptors currently use no upstream/ingested probe, including GTFS-RT,
ACE routes, and DOT lane inputs. A critical dataset cannot ship under the new
contract until it has a real probe and completeness rule or is explicitly
reclassified noncritical with an ADR-backed rationale.

## Scope

### In scope

- Logical dataset registry, cadence/completeness rules, and provenance.
- Earliest/latest upstream discovery and gap-aware local/published coverage.
- Source-specific idempotent backfill adapters and durable partition receipts
  for every public logical dataset with trustworthy upstream history; critical
  status controls the freshness SLO, not whether history is inventoried.
- Freshness-ledger v2, strict CLI exit behavior, candidate admission gate, and
  machine-readable report for Plan 100's daily workflow.
- Candidate manifest, status API, route capability, and UI coverage matrix.
- Removal of active fixed history starts and March 2026 defaults after their
  replacement paths are proven.

### Out of scope

- Automatic publication or Worker-side heavy ingestion.
- Treating all source histories as if they begin/end together.
- Interpolating/fabricating unavailable periods or hiding route-level gaps.
- The resumable remote publish command and scheduled GitHub wiring (Plan 100).
- Final release-selector/legacy artifact cleanup (Plan 101).

## Execution preflight and verification cadence

Execute from a fresh branch descended from the audit base; the audit checkout
is stale and is not an implementation base. Preserve unrelated worktree
changes, then run:

```sh
git merge-base --is-ancestor ecf556a79e23b4b9374d08210a380754756f357b HEAD
git diff --name-only ecf556a79e23b4b9374d08210a380754756f357b..HEAD -- packages/domain packages/sources packages/db packages/analytics packages/studio-api tools/pipeline-v2 apps/web knowledge tests
```

If ancestry fails, STOP and rebase/replan. Re-open every cited anchor changed
since the audit base and amend the plan for behavior, package ownership, or
source-contract drift. After each numbered step, run `git diff --check`, the
smallest affected-package typecheck, and the focused gate below.

| After steps | Minimum focused gate |
|---|---|
| 1-3 | domain registry schemas, upstream probe fixtures, and DB coverage-repository tests |
| 4 | restart/idempotency/hash tests for each source-family backfill adapter |
| 5-6 | SLO state table, strict exit codes, no-waiver regression gate, and readiness receipt tests |
| 7-8 | status/route/UI Worker tests and active-vs-candidate performance receipt |
| 9-10 | fixed-date ratchet, architecture boundaries, knowledge and runbook checks |

## Implementation

### 1. Define the closed logical-dataset registry

Put pure dataset IDs, cadence/coverage/status schemas, registry descriptor
types, and public response types in `packages/domain`. Put source-ID mapping,
upstream network clients, availability/completeness probes, and source-ingest
adapters in `packages/sources`, which may import those domain contracts. Put
D1 active-candidate/published-coverage repositories in `packages/db`. The
pipeline owns the executable registry composition and local-ingestion receipt/
database adapters, and composes `domain` + `sources` + `db`; neither
`packages/domain` nor `packages/sources` may import local pipeline storage or
published D1 repositories. Define one registry entry per product the app
claims to serve. Each entry includes:

- stable `datasetId` and human label;
- contributing historical/current source IDs from
  `knowledge/raw/source_manifest.yaml`;
- criticality and owning public features/endpoints;
- period type/grain, timezone, publication cadence, and maximum probe age;
- exact partition-completeness rule (not “a file exists”);
- source-provided or defensible scheduled completion-time rule;
- IDs for its earliest/latest upstream probe implementation;
- IDs for its pipeline-owned ingested-coverage reader and DB-owned published-
  candidate coverage repository;
- expected route/member universe where gaps are meaningful;
- retention/provenance requirements and explicit unavailable semantics.

At minimum, coalesce historical/current source families for route speed and
ridership. Inventory schedules, waits/headways, realtime/current signals,
route identity, interventions, geometry/map, equity, and each public route
artifact rather than assuming this minimum list is exhaustive.

A harness test must prove every source used by a candidate, every active
candidate dataset entry, every source-coverage row, and every public feature's
declared dependency maps to exactly one logical dataset. Unknown and duplicate
ownership fail.

### 2. Separate immutable publication coverage from daily freshness observation

Extend Plan 098's immutable candidate dataset entries with gap-aware published
coverage/provenance. Add a separate append-only operational freshness report
schema for daily upstream/local/active comparison:

```ts
type DatasetFreshness = {
  datasetId: string;
  grain: "month" | "day" | "snapshot" | "realtime";
  available: CoverageSet;
  ingested: CoverageSet;
  published: CoverageSet;
  latestCompletePartition: string | null;
  upstreamCompleteAt: string | null;
  firstObservedCompleteAt: string | null;
  lagPeriods: number | null;
  deadlineAt: string | null;
  status: "current" | "within_slo" | "breach" | "unknown" | "unavailable";
  reasonCodes: ReadonlyArray<string>;
};
```

The report binds its observation ID/time, registry version, detector version,
target candidate ID, optional release ID, dataset-coverage hash, and all
underlying upstream/partition receipt hashes. A preactivation readiness report
targets a candidate with `releaseId = null`; Plan 100's CAS may reference that
exact report in the new release row as its initial freshness evidence. Daily
reports bind the active release explicitly and supersede the initial report.
This is current operational metadata, not a reviewed data release: store it
append-only in the operations namespace with a small D1 current-signal
catalog/latest pointer, separate from candidate-scoped serving tables. Plan
100's daily workflow may append and select a verified report; it may not change
candidate data or the release pointer.

The sketch's strings are illustrative: implement `CoverageSet` and partition
IDs as a grain-discriminated union (`IsoMonth`, service date, immutable
snapshot ID + observed time, or realtime interval), with cadence-specific
comparison rather than lexical generic-string math. `CoverageSet` carries
start/end **and** missing intervals/partitions so a full range cannot conceal
holes. Use compact interval encoding in public responses;
retain exact partition receipts in a durable operations index, not only the
operator's ignored local tree. For route-grain products, separately record the
expected route universe, routes with complete coverage, and missing
route/partition pairs.

The old `CoverageWindowSchema` remains temporarily as a named compatibility
summary for the primary route-speed dataset only. It must be derived from the
active candidate and labeled `primaryDatasetId`; no repository or UI may use
it to describe ridership, schedules, maps, or other products. Add a deprecation
test and remove it only in a separately versioned public API change.

### 3. Build authoritative availability/completeness probes

For each critical dataset, implement fixture-backed probes that return:

- earliest trustworthy period/snapshot;
- latest upstream period and latest **complete** period;
- source-provided completion timestamp when available;
- partition row/member counts and integrity evidence;
- explicit unavailable/unknown reasons with probe timestamp.

Do not use current wall time as proof that a source partition exists. Do not
infer a complete month from one route or one Socrata page. Paginated sources
must prove cursor/exhaustion and stable snapshot identity. Static snapshots
must verify content hashes and source version. Realtime sources use collection
coverage and maximum-age rules rather than pretending to have monthly grain.

Persist the daily report even when nothing changes. This provides the
first-observed completion time, a detector-run audit trail, and evidence that
the daily SLO itself is being met. Calculate `deadlineAt` from the earlier
authoritative/scheduled completion boundary; never grant seven fresh days
merely because detection was late.

### 4. Implement resumable full-history ingestion

Replace broad hard-coded starts with source-specific discovery and operator-
reviewed policy floors only where the source cannot expose earlier trustworthy
data. A floor must live in the registry with reason/evidence; never hide it as
`DEFAULT_HISTORY_START_MONTH`.

Add range adapters for every public logical dataset with trustworthy upstream
history, prioritizing current gaps such as route speeds, ridership, and
waits/headways. A noncritical dataset may have a looser freshness policy, but
it does not get to retain an arbitrary recent-only window. If a source truly
offers no history, record the evidence and explicit unavailable boundary
rather than silently skipping it. Each adapter:

1. enumerates source partitions from verified earliest to latest complete;
2. compares them with strict local partition receipts;
3. captures missing partitions to immutable source snapshots;
4. validates schema, pagination, counts, route/member coverage, and hash;
5. writes a receipt atomically after the partition is complete;
6. resumes by hash and never treats a partial file as complete;
7. runs derived transforms only after all required source partitions validate.

Use bounded concurrency, retry/backoff, request and byte accounting, and source
rate limits. Live network integration is an explicit operator step; unit tests
use fixtures. A rerun over complete inputs must skip network/writes and produce
byte-identical canonical rows.

### 5. Make freshness ledger v2 compare all three stages

Replace the source-level global lookup in `buildFreshnessLedger` with the
logical registry, durable local-partition receipt index, and Plan 098 active
candidate. Calculate:

```text
upstream available/complete → locally ingested → candidate staged → active published
```

Report gaps at each edge. A publication cannot be “current” merely because
local ingestion is current. Conversely, an upstream unavailable range is not
a local failure and must be reported as unavailable with evidence.

SLO evaluation rules are deterministic and injected-clock tested:

- lag 0 => `current`;
- lag 1 and before/equal deadline => `within_slo`;
- lag >1 or after deadline => `breach`;
- missing/stale critical probe/receipt => `unknown` and strict failure;
- no source period by design => `unavailable`, only if registry permits it.

If upstream advances from April to May while production ends March, breach is
immediate even if April's seven-day deadline has not expired: production is
now two complete periods behind. If the deadline expires while lag remains
one, that is also a breach.

Expose stable CLI exit codes for healthy, within-SLO attention, breach,
unknown-critical, and tool failure. Emit canonical JSON plus a concise human
summary. The command is read-only and suitable for Plan 100 scheduling.

### 6. Gate candidate construction and activation

Candidate build must include dataset coverage/provenance from validated local
receipts, not a guessed release month. Candidate readiness fails when:

- a critical input is unknown, stale, partial, or hash-mismatched;
- a claimed continuous interval has a gap;
- a route-level dataset silently drops expected routes;
- candidate coverage regresses from active for any public logical dataset;
- the top-level compatibility window disagrees with route speed;
- `available`, `ingested`, candidate, or published ordering is impossible.

Activation readiness adds the SLO evaluation and all Plan 098 artifact/D1
checks. A source can have older history than another; publish the full verified
range of each and render the difference honestly. Incident acknowledgements
are evidence only and cannot bypass this gate. Plan 099 may finish candidate
construction, backfill, parity, and produce an `activation_ready` receipt on
its own branch; Plan 100 consumes that receipt and performs the first reviewed
activation. Mark Plan 099 DONE only after that joint activation receipt proves
the full-history candidate is active.

### 7. Serve and display the real coverage matrix

Extend `packages/domain/src/routes/index.ts::ReleaseStatusResponseSchema` and
the status API with compact active dataset coverage plus the latest verified
operational freshness report's state, detector time, next deadline, and reason
codes. The Worker reads the active candidate and current-signal report; it never
probes upstream during a request. Immediately after activation it may use only
the readiness report referenced by that release row; a newer daily report must
match the active release. A missing, older-than-one-daily-run, candidate/release-
mismatched, or invalid report renders critical freshness `unknown` rather than
reusing an old “healthy” observation.

Update route responses/capability construction so freshness is relative to
the relevant upstream dataset, not wall-clock time. Reuse and strengthen:

- `packages/domain/src/studio/route-capability.ts`;
- `apps/web/src/components/route/coverage-matrix.ts`;
- route History's existing ability to show ridership beyond speed coverage.

The UI must state dataset-specific ranges and gaps. It must never imply that a
global “through March” applies to every chart. Accessibility labels and text
must distinguish unavailable, locally missing, awaiting publication,
within-SLO, breach, and unknown. Do not expose operational source URLs or
internal paths in the public status payload.

### 8. Gate full-history activation on cost and request performance

Before activating expanded history, benchmark the active release and candidate
over representative short, median, longest, gap-heavy, rich, and sparse routes.
Record response bytes, D1 rows/queries, R2 GETs/bytes, Worker subrequests/CPU,
cold/warm p50/p95 latency, local build time, candidate D1/R2 size, and projected
Cloudflare operations/storage/egress under declared request-volume scenarios.

The candidate must remain inside repository/Worker hard budgets, add no R2 GET
to endpoints whose representation did not change, and keep controlled p95 no
greater than both 1.05× baseline and baseline + 25 ms. It must not truncate,
sample, or intersect history to pass. Optimize indexes, bounded queries,
serialization, and caching first. If a large route-history body still cannot
pass, implement and benchmark the minimal immutable archive + open partition
representation here, with at most one extra R2 GET and exact public payload/
coverage parity; Plan 101 later generalizes and cost-optimizes that mechanism.

A cost/latency failure blocks public activation but not completed source
capture/backfill. Attach the failed benchmark and remediation decision rather
than publishing first and hoping Plan 101 repairs it later.

### 9. Remove active fixed dates only after parity

Audit and replace active defaults in:

- `tools/pipeline-v2/src/lib/local-db-aggregates/source-coverage.ts`;
- `tools/pipeline-v2/src/commands/audit/source-coverage.ts`;
- `tools/pipeline-v2/src/commands/check/route-speed-availability.ts`;
- `tools/pipeline-v2/src/commands/export/d1-inputs.ts`;
- map/studio release and single-period ingest/build commands.

Explicit period flags remain valid for partition-scoped repair/backfill. What
must disappear is a silent March 2026/default-year value or a period used as
release identity. Plan 101 expands the repository ratchet across shell,
workflow, and JSONC operational surfaces and handles frozen artifacts.

### 10. Document the operating contract

Rewrite the freshness-ledger wiki page and update the source registry,
operations runbook, ADR-0022 cross-reference, and knowledge log. Document:

- each dataset/cadence/completeness owner;
- daily detection and seven-day publication deadline;
- strict unknown behavior and the non-bypassing incident-acknowledgement format;
- reviewed, nonautomatic publication;
- full per-source history and non-intersection policy;
- route-gap semantics and public status vocabulary;
- how Plan 100's deduplicated GitHub issue alert is opened/closed.

## Tests

Required cases include:

- speed upstream April/published March => one-period `within_slo`; after seven
  days => `breach`; upstream May/published March => immediate `breach`;
- a critical upstream probe `unknown` or older than max probe age => strict
  failure, never “recent”;
- historical/current source IDs coalesce into one gap-aware logical dataset;
- speed through April and ridership through March remain different in candidate,
  status API, route response, and UI;
- a missing middle partition prevents a continuous coverage claim;
- backfill restart skips verified partitions and reproduces exact rows/hashes;
- earliest discovery reaches before current-year-minus-one when source allows;
- a lag-zero route capability remains current when wall time moves but upstream
  does not; a lag-one capability still becomes breach when its deadline passes;
- candidate readiness rejects a regressed/partial/unknown critical dataset;
- public status never leaks source credentials/internal object paths.

Primary suites:

```text
tools/pipeline-v2/test/commands/audit/freshness.test.ts
tools/pipeline-v2/test/commands/audit/source-coverage.test.ts
tools/pipeline-v2/test/commands/audit/data-product-completeness.test.ts
tools/pipeline-v2/test/commands/check/route-speed-availability.test.ts
tools/pipeline-v2/test/commands/backfill/*.test.ts
packages/domain/test/serving-release-contract.test.ts
packages/domain/test/studio-route-capability.test.ts
packages/studio-api/test/api-facade.test.ts
apps/web/test/worker/public-routes.worker.test.ts
```

## Acceptance criteria

- [ ] Every public/critical input belongs to one logical dataset with typed
      cadence, completeness, provenance, and availability adapters.
- [ ] Earliest/latest upstream, ingested, candidate, and published coverage is
      recorded per dataset with gaps; no global intersection truncates history.
- [ ] Every public logical dataset's full trustworthy history is backfilled
      through resumable, hash-receipted, source-specific adapters and
      deterministic transforms, or has an evidenced unavailable boundary.
- [ ] Daily audit semantics are exactly zero/current, one/within-SLO, >1 or
      >7 days/breach, and unknown-critical/fail.
- [ ] Candidate admission and activation fail on incomplete, regressed,
      unproven, or internally inconsistent critical coverage.
- [ ] Status API, route capability, and UI expose differing dataset ranges and
      gap/unavailable/awaiting-publication states honestly.
- [ ] Expanded history passes active-vs-candidate Cloudflare cost, response-size,
      subrequest, and p95 gates before activation without truncation/intersection.
- [ ] Plan 100 consumes this plan's signed `activation_ready` receipt, and the
      resulting production activation/smoke receipt is required before Plan
      099 is marked DONE.
- [ ] Active hard-coded 2026-03 and current-year-minus-one history defaults are
      removed; explicit source partition selectors remain legal.
- [ ] Documentation defines deliberate publication and Plan 100's deduplicated
      GitHub alert as the agreed default notification path.

## Verification

```sh
bun --filter @bp/domain test
bun --filter @bp/sources test
bun --filter @bp/analytics test
bun --filter @bp/pipeline-v2 test
bun --filter @bp/studio-api test
bun run test:web
bun run test:worker
bun run check:types
bun run check:style
bun run check:architecture
bun run check:knowledge
```

Network probes/backfills and production publication are separately authorized
operations. Fixture tests must not masquerade as upstream or production proof.

## STOP conditions

Stop if a critical dataset has no defensible completeness probe; history bounds
would be guessed; upstream terms/rate limits prohibit the backfill; a partition
is partial or cannot be reproduced; source families cannot be coalesced without
losing provenance; a route gap would be hidden; public contracts would present
one dataset's end as another's; an incident acknowledgement is unbounded or
changes status/admission; or implementation would
auto-publish, fabricate/interpolate missing data, weaken unknown handling, or
reintroduce month as release identity.
