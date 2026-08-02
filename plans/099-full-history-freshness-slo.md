# Plan 099: Full dataset history and honest per-dataset coverage

## Status

- **State**: DONE (2026-08-02)
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

## Re-verified anchors (fetched `origin/main@bee86124`, 2026-08-02)

- `tools/pipeline-v2/src/lib/freshness-ledger.ts:40-59` still models source
  descriptors while `knowledge/raw/source_manifest.yaml` splits
  historical/current IDs for speed and ridership — coalesce into logical
  datasets.
- `tools/pipeline-v2/src/commands/check/route-speed-availability.ts` still
  derives a default year range at line 71; `export/d1-inputs.ts:48` fixes
  the start at `2023-04`; `backfill/socrata-range.ts:16-23` omits core
  speed/ridership/wait data. The repeated fixed floor also remains at
  `lib/local-db-aggregates/source-coverage.ts:107-242`.
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

- [x] Every public dataset's full trustworthy history is backfilled through
      resumable, hash-receipted adapters, or has an evidenced unavailable
      boundary; no global intersection truncates any dataset.
- [x] Per-dataset coverage and gaps are served and rendered honestly.
- [x] The advisory ledger compares all three stages, exits stably, and is
      consumable by Plan 100's scheduled alarm.
- [x] Fixed `2023-04` and current-year-minus-one defaults are replaced by
      registry floors; explicit partition selectors remain legal.
- [x] The size sanity check is recorded before the first expanded-history
      activation.

## Completion evidence (2026-08-02)

The authorized live backfill captured 79 ridership partitions from 2020-01
through 2026-07 (33,663 rows) and 138 wait/reliability partitions from
2015-01 through 2026-06 (168,723 rows). An exact rerun skipped all 217
hash-verified partitions and reproduced summary SHA-256
`73c7807ed9077550618fc6811157d88464eed439da783f9ff4cc6cb171607d00`;
no zero-row partition or hidden gap was accepted.

Protected publication run `30768988711` activated candidate
`67ae1b14fd57687ecb4c640b40bde7d8267b0f5ff13aad030d40fa5491dcd3d5`
with manifest SHA-256
`4de1cd01f9d0715cfcd23a0532e8b932bbf61c04b0d4ae67f7ea995b9e41de6e`
at generation 6, release `pub_20260802T215956764Z`. Its durable completion
receipt SHA-256 is
`95eadb116e4ee9ca85d3a76f14abdfb9530623fafbb42af59b0d70a782c49617`;
the independently downloaded state bytes hash to
`6687059ccda59fdaf42c51ce2271a3dccc80cb8bf982cfd0b45556011e4cfa7c`.
The pre-activation size receipt accepted a 41,112-byte largest route-history
payload and a 7.352 ms local spot check. Public status and B44 history now
show wait/reliability 2015-01..2026-06, ridership 2020-01..2026-07, and speed
2023-04..2026-06 with the real 2026-04..2026-05 gap explicit.

Semantic no-op run `30769204796` left generation 6 unchanged and recorded
durable completion receipt SHA-256
`87a5eb1f2130cc6041e5bc26d94d5479759053675e56a43cd576deb288d351a9`.
Freshness-alarm run `30769269308` consumed the active candidate catalog,
updated marker-owned issue #154, and uploaded report SHA-256
`6986fd5988f5ad8b97354f69cec49549d933a9fee7d4d34ba9eacfa22ba250b7`.

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
