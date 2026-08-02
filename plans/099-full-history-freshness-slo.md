# Plan 099: Full dataset history and honest per-dataset coverage

## Status

- **State**: TODO
- **Priority**: P2
- **Effort**: M-L
- **Depends on**: registry/backfill steps (1-3): none; serving/UI steps (4-6):
  Plan 098 active — expanded history reaches production through a normal
  098/100 publish
- **Original audit base**: `origin/main@ecf556a79e23b4b9374d08210a380754756f357b`
  (2026-07-22). Cited anchors were verified then; re-verify each against
  current main before relying on it.
- **Suggested branch**: `codex/099-full-history-coverage`

## Descope provenance (2026-08-02)

Rewritten to its kernel under the revised gen-17 operator decisions in
`plans/README.md`; the original XL text is in this file's git history. Cut:
the binding daily SLO state machine (current/within_slo/breach/unknown,
seven-day deadline clocks, first-observed-complete timestamps), incident
acknowledgements, the append-only operational freshness store with a D1
CAS'd current-signal catalog, criticality-reclassification ADRs, the
domain/sources/db registry re-architecture, and the formal benchmark-gated
activation harness. Nothing consumes a binding SLO here: one operator plus an
advisory ledger plus Plan 100's scheduled alarm produces the same behavior at
a fraction of the machinery.

## Outcome

Each public logical dataset serves its full trustworthy upstream history — no
global intersection clips one source to another's window — and every public
surface states per-dataset coverage honestly, including gaps. An advisory
freshness comparison (upstream available vs locally ingested vs published)
runs from one read-only CLI with stable exit codes and feeds Plan 100's
scheduled alarm. Detection never publishes.

## Re-verified anchors (fetched `origin/main@e0c00aaf`, 2026-08-02)

- `tools/pipeline-v2/src/lib/freshness-ledger.ts` still models source
  descriptors while `knowledge/raw/source_manifest.yaml` splits
  historical/current IDs for speed and ridership — coalesce into logical
  datasets.
- `tools/pipeline-v2/src/commands/check/route-speed-availability.ts` still
  derives a default year range; `export/d1-inputs.ts:48` fixes
  the start at `2023-04`; `backfill/socrata-range.ts` omits core
  speed/ridership/wait data.
- `packages/domain/src/studio/shared.ts:32` exposes only one `{start,end}`
  coverage window; route History already renders ridership beyond speed
  coverage — reuse `packages/domain/src/studio/route-capability.ts` and
  `apps/web/src/components/route/coverage-matrix.ts`.

## Implementation

### 1. Minimal logical-dataset registry

One registry entry per public logical dataset, owned by the pipeline (domain
types only where serving already needs them; no package re-architecture).
Coalesce historical/current source families for route speed and ridership at
minimum, and inventory the remaining public products (schedules, waits,
route identity, interventions, geometry/map, equity) rather than assuming two
is exhaustive. Each entry: stable `datasetId`, contributing source IDs from
`source_manifest.yaml`, grain/cadence, earliest trustworthy availability
(probed, or an evidenced policy floor with reason — never a silent constant),
a partition-completeness rule, and the public surfaces it feeds. A harness
test proves every source a candidate uses maps to exactly one dataset.

### 2. Resumable full-history backfill

For each dataset with trustworthy upstream history, a range adapter that:
enumerates source partitions from verified earliest to latest complete;
compares against local partition receipts; captures missing partitions to
immutable snapshots; validates schema/counts/hashes; writes each receipt
atomically; resumes by hash and never counts a partial file. Bounded
concurrency and source rate limits. Unit tests use fixtures; live network
runs are explicit operator steps. A rerun over complete inputs skips network
and writes byte-identical rows. Do not infer a complete month from one route
or one Socrata page.

### 3. Advisory freshness ledger v2

Extend `buildFreshnessLedger` from source-level to logical datasets and
compare three stages: upstream latest complete → locally ingested →
published (active candidate coverage). Report per-dataset lag and gaps with
statuses `current | behind(n) | unknown | unavailable` and stable exit codes
for Plan 100's cron. `unknown` prints loudly but is advisory — no deadline
clocks, no breach contract. The command is read-only.

### 4. Serve honest per-dataset coverage

Candidate dataset entries (Plan 098 manifest) carry per-dataset coverage and
missing intervals. Extend the status API, route capability, and the
coverage-matrix UI so differing ranges are stated honestly (speed through X ≠
ridership through Y; a middle gap is never concealed by a start/end pair).
`CoverageWindowSchema` remains as a compatibility summary labeled as the
primary route-speed dataset only. No operational source URLs or internal
paths in public payloads.

### 5. Size sanity before activating expanded history

Before the first expanded-history activation, record the largest route-history
payload sizes and one local latency spot-check into the candidate receipt. If
the largest payloads grow past low-single-digit MB, decide explicitly —
accept, trim fields, or reopen chunking on Plan 101's terms — before
activating. No formal p95 gate harness; the decision and numbers go in the
receipt.

### 6. Replace fixed history starts

Replace the step-2 anchors' silent defaults (`2023-04`,
current-year-minus-one, and the equivalents in
`lib/local-db-aggregates/source-coverage.ts` and `audit/source-coverage.ts`)
with registry floors. Explicit period flags remain valid for scoped
repair/backfill.

## Tests

- Historical/current source IDs coalesce into one gap-aware logical dataset;
  a missing middle partition prevents a continuous coverage claim.
- Backfill restart skips verified partitions and reproduces exact rows/hashes;
  a partial file is never treated as complete.
- Speed-through-April and ridership-through-March remain different in the
  candidate, status API, route response, and UI.
- Ledger exit codes are stable across current/behind/unknown fixtures.
- No fabricated or interpolated periods anywhere.

Primary suites: `tools/pipeline-v2/test/commands/audit/freshness.test.ts`,
`tools/pipeline-v2/test/commands/backfill/*.test.ts`,
`packages/domain/test/studio-route-capability.test.ts`,
`apps/web/test/worker/public-routes.worker.test.ts`.

## Acceptance criteria

- [ ] Every public dataset's full trustworthy history is backfilled through
      resumable, hash-receipted adapters, or has an evidenced unavailable
      boundary; no global intersection truncates any dataset.
- [ ] Per-dataset coverage and gaps are served and rendered honestly.
- [ ] The advisory ledger compares all three stages, exits stably, and is
      consumable by Plan 100's scheduled alarm.
- [ ] Fixed `2023-04` and current-year-minus-one defaults are replaced by
      registry floors; explicit partition selectors remain legal.
- [ ] The size sanity check is recorded before the first expanded-history
      activation.

## Verification

```sh
bun --filter @bp/pipeline-v2 test
bun --filter @bp/domain test
bun run test:worker
bun run check:types
bun run check:knowledge
```

Network probes/backfills are separately authorized operator steps; fixture
tests must not masquerade as upstream proof.

## STOP conditions

Stop if history bounds would be guessed; upstream terms or rate limits
prohibit the backfill; a partition is partial or cannot be reproduced; a
route-level gap would be hidden; a public contract would present one
dataset's end as another's; or implementation would fabricate/interpolate
missing periods or reintroduce month as release identity.
