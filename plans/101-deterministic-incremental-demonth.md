# Plan 101: Deterministic incremental publication and final de-month cleanup

## Status

- **State**: TODO
- **Priority**: P2
- **Effort**: L-XL
- **Depends on**: Plans 098-100 active with a successful rollback drill
- **Audit base**: `origin/main@ecf556a79e23b4b9374d08210a380754756f357b`
- **Suggested branch**: `codex/101-deterministic-incremental-demonth`

## Outcome

Make identical inputs produce identical candidate payloads and hashes, rebuild
only products whose semantic inputs changed, and upload only absent immutable
blobs. Remove the final release-month selectors, mutable artifact aliases,
legacy “latest” readers, silent fixed dates, and frozen month-identity
compatibility paths after their data is converted or proven unused.

A no-data-change publication performs zero content PUTs and creates no
candidate/release activation. A one-period source change rebuilds/uploads only
the dependency-affected objects. Any history chunking must win a measured
Cloudflare cost plus local-build/upload model without materially worsening
request reads or latency.

## Doctrine boundary

This plan removes **month as release identity**, not month as data:

| Legal | Forbidden |
|---|---|
| a source partition such as route speed for `2026-04` | `--month 2026-04` meaning “publish this release” |
| a monthly observation/chart coordinate | `BASELINE_MONTH` selecting production behavior |
| month columns and partition directories under a logical dataset | export/release roots whose top-level identity is a month |
| explicit bounded backfill/repair ranges | a silent default to March 2026 or “current year minus one” |
| source timestamps/capture provenance | wall-clock build timestamps inside reusable canonical payloads |

Candidate/export roots use Plan 098's content-derived `candidateId`; public
`releaseId` does not exist until a successful pointer activation (first
established by Plan 098 and subsequently orchestrated by Plan 100).

## Verified current cost and determinism boundary

- `tools/pipeline-v2/src/commands/publish/r2-artifacts.ts:17` recursively
  publishes broad `map`, `studio`, and `source-availability` prefixes.
- Its skip at `:357-366` accepts equal size when remote ETag is empty, so it can
  report an unproved skip. ETag is not a SHA-256 contract.
- It validates hash-bearing filenames at `:331-342`, a useful base for a
  closed immutable blob store.
- `tools/pipeline-v2/src/commands/studio/route-speed-histories.ts:116` stamps
  wall time, while `:178-197` reuses any decodable existing artifact without
  checking source window/hash/builder version. This is both nondeterministic
  and a stale-cache risk.
- Route speed history, spines, hourly profiles, D1/map/studio release builders,
  and many route bodies stamp `generatedAt` or publication identity into stable
  keys. Stable-key helpers live in `packages/analytics/src/artifacts/index.ts`
  and `packages/domain/src/studio/route-dossier.ts`.
- At audit time, ignored local `studio/` artifacts were roughly 635 MB; route
  speed histories were about 321.5 MB across 385 routes, spines about 104.2 MB,
  and individual histories were generally bounded (largest observed about
  3 MB). These are observations, not frozen thresholds; implementation must
  remeasure from the candidate it optimizes.
- `tests/harness/month-doctrine.test.ts:500-525` scans TypeScript production
  roots plus one Wrangler file, but not shell, workflows, example/test JSONC,
  or pipeline scripts.
- `tests/harness/month-doctrine-allowlist.ts:33-47` retains two permanent
  frozen-artifact exceptions. `export/d1-inputs.ts:418-561` can implicitly
  discover legacy timeline/detector artifacts, and frozen detector data still
  reaches public response code through `packages/domain/src/studio/snapshots.ts`,
  `route-insights.ts`, and Studio read handlers.

## Scope

### In scope

- Canonical serialization and typed semantic input fingerprints.
- Dependency-aware builder cache and deterministic candidate assembly.
- Closed manifest upload, immutable object reuse, byte/request/cost reporting.
- Measured route-history storage experiment with an explicit accept/reject gate.
- Retirement/conversion of stable aliases and frozen runtime compatibility.
- Removal of release-month CLI/config/path concepts and broader doctrine tests.
- Final removal of Plan 098's no-pointer legacy resolver and old shell command.
- Reference-aware D1 candidate and R2 blob retention/garbage collection with
  dry-run, grace period, pinning, and separate destructive approval.

### Out of scope

- Changing source grain, fabricating gaps, or merging dataset coverage ranges.
- Replacing full D1 candidate snapshots merely to save a few megabytes.
- Automatic publication or weakening rollback retention.
- Compression/chunking based on intuition rather than measured end-to-end cost.

## Execution preflight and verification cadence

Execute from a fresh branch descended from the audit base; the audit checkout
is stale and is not an implementation base. Preserve unrelated worktree
changes, then run:

```sh
git merge-base --is-ancestor ecf556a79e23b4b9374d08210a380754756f357b HEAD
git diff --name-only ecf556a79e23b4b9374d08210a380754756f357b..HEAD -- packages/domain packages/analytics packages/db packages/studio-api tools/pipeline-v2 apps/web scripts .github knowledge tests
```

If ancestry fails, STOP and rebase/replan. Re-open every cited anchor changed
since the audit base and amend the plan for behavior, cost, or ownership drift.
After each numbered step run `git diff --check`, the smallest affected-package
typecheck, and the focused gate below.

| After steps | Minimum focused gate |
|---|---|
| 1-2 | reproducible baseline receipt and canonical payload/fingerprint tests |
| 3-4 | two-clock/two-order cache and closed-upload/version-corruption tests |
| 5-6 | route-history cost/latency parity and D1 candidate-isolation benchmarks |
| 7-9 | frozen-path conversion/removal and month-doctrine positive/negative fixtures |
| 10 | GC graph, generation-fence, retiring/tombstone race, and retained-release parity tests |
| 11 | no-change and one-partition end-to-end incremental receipts plus full checks |

## Implementation

### 1. Establish a reproducible cost and dependency baseline

Add `audit publication-cost` (or extend the existing Cloudflare cost plan) to
measure a representative active candidate and a synthetic one-period update:

- files/bytes by artifact family and top contributors;
- wall/CPU time by builder and cache hit/miss;
- healthy no-op and one-period end-to-end elapsed time, executable-stage time,
  approval wait, operator-active interaction time, command/approval touches,
  resumes, and remedial interventions;
- source reads and local database queries;
- R2 HEAD/GET/PUT counts and bytes;
- D1 candidate rows/bytes/statements;
- Worker R2/D1 subrequests and controlled cold/warm latency per endpoint;
- projected monthly Cloudflare operations/storage/egress using the checked rate
  snapshot, with assumptions and request-volume scenarios visible.

Capture current monolithic route history, optional archive/open design, and
full D1 candidate snapshot as distinct scenarios. Record machine/hardware,
fixture/candidate IDs, sample counts, percentiles, and confidence bounds.
Do not make a production representation decision from one warm request.

Define budgets before implementation:

- no-change: zero content PUTs/bytes and zero candidate/release/pointer writes;
- one-period update: no unchanged content blob is PUT;
- operator path: a healthy no-op is one invocation with no approval or remedial
  command; a healthy one-period publication is one preparation invocation plus
  the single protected approval/CI continuation and no other manual resume or
  repair action;
- read path: no additional R2 GET for normal artifacts;
- route-history experiment only: at most one additional R2 GET, no Worker
  subrequest-limit risk, and controlled p95 no greater than both 1.05× baseline
  and baseline + 25 ms;
- adopt chunking only when modeled 12-month total cost is lower **and** updated
  route-history upload bytes fall at least 75% on representative updates.

Freeze numeric candidate-ready elapsed and operator-active-time budgets from
the measured baseline before implementation. A representation or incremental
design that saves Cloudflare operations while exceeding either operational
budget is rejected unless a reviewed receipt explains why the baseline itself
was unsafe or invalid.

If the experiment misses any read/cost threshold, keep one immutable per-route
history blob and accept its update bytes. The plan succeeds with a documented
“do not chunk” result.

### 2. Define canonical payloads and semantic provenance

Add one shared canonical JSON/byte serializer for publishable artifacts:

- schema-ordered or recursively key-sorted objects;
- explicitly sorted arrays when domain order is a set/map, preserved order when
  order is semantic;
- stable number/null/text encoding and exactly one trailing newline;
- no local absolute paths, process IDs, locale/timezone output, random IDs, or
  wall-clock build/publication timestamps;
- strict schemas and golden-byte fixtures.

Separate three timestamp classes:

1. source observation/capture/effective timestamps: semantic payload data;
2. deterministic derivation metadata: source IDs/hashes, coverage, builder
   version, algorithm/schema ID;
3. operation/build/stage/activation timestamps: receipt/release envelopes only.

Do not blindly delete `generatedAt`: classify each occurrence. Preserve it if
it is source evidence; move it to a receipt if it is merely “when this command
ran.” Worker response assembly may inject Plan 098 release identity, but
immutable reusable bodies never embed activation time.

Every artifact builder declares a typed `InputFingerprint` including all
semantic source hashes/snapshot IDs, exact query window/route universe,
dependent artifact hashes, schema/algorithm version, and relevant config. Its
output record contains logical ID, fingerprint, canonical SHA-256, bytes, and
physical key. Fingerprint/hash collisions with different canonical metadata
fail.

### 3. Replace “valid file exists” with dependency-aware caching

Refactor route history, spine, hourly, dossier, capability, map, release, and
D1-input builders to use one cache protocol:

1. compute the complete semantic input fingerprint before expensive transform;
2. find a prior output record by logical ID + fingerprint;
3. verify cached bytes still hash/decode to the recorded schema;
4. reuse exact bytes/hash/key when valid;
5. otherwise rebuild atomically and write the new record.

A decodable file with a different/missing fingerprint is a miss. Builder or
schema version changes are deliberate cache invalidations. Partial temp files
are never hits. Parallel builders use bounded concurrency and atomic rename or
equivalent safe finalization.

Build a dependency DAG from source partitions to artifacts so one changed
route/month invalidates that route's derived history/spine/hourly/dossier and
the aggregate manifests that reference their new hashes, not unrelated routes
or source families. A citywide aggregate may correctly change; the receipt
must explain why.

Run every deterministic builder twice with the same inputs but different
injected clocks, temp roots, locale/timezone, and enumeration order. Candidate
manifest bytes, blob key set, and every reused output byte must match.

### 4. Make immutable upload equality trustworthy and closed-world

`publish r2-artifacts` must accept only Plan 098 candidate manifest entries,
never recurse over a directory. Standardize physical keys such as
`blobs/sha256/<prefix>/<sha256>.<extension>` and verify local bytes match both
the key and manifest before any remote request.

Maintain a D1/operations object-verification ledger written only after the
first upload is GET/hash-verified. Record the R2 object's opaque per-upload
`version`, size, expected content hash, and stored checksum when available.
The S3 driver's current `{size, etag}` stat is insufficient; add a narrow
verifier using the R2 Worker binding (or another officially supported surface)
that returns `R2Object.version` and checksums. Cloudflare documents `version`
as unique to a specific upload in the
[R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
Load the live object-verification catalog once and set-difference its verified
physical-key set from the closed candidate manifest before per-object R2 I/O.
A prior release receipt is provenance, not reuse authority. A catalog
intersection may bypass per-object HEAD/GET only when its row exactly matches
bucket/namespace, key, SHA-256, bytes, recorded R2 version/checksum, and
`verified` state; the content namespace is mechanically write-once; publisher
credentials cannot overwrite or delete content keys; GC is the sole deleter;
and GC, candidate-reference writes, and catalog generation share the Step 10
fence. Bind the catalog generation to the candidate-ready receipt and recompute
or fail if it changes. `retiring`, tombstoned, missing, incomplete, or stale
rows never use the fast path.

Until those invariants are mechanically proven, and whenever a ledger row is
absent/stale or selected for integrity reconciliation, retain the remote
version/size and GET/hash path below. Add a scheduled or operator-run integrity
reconciliation that quarantines catalog/R2 drift rather than silently trusting
the catalog.

For an existing key:

- an exact live verified-catalog match under the enforced invariants above is
  reusable without a per-object remote request;
- otherwise, exact verified-ledger hash/bytes **and the same remotely observed
  object version/size** are reusable without downloading the body;
- absent ledger, unavailable/different version, or size mismatch requires
  GET/hash verification and records an overwrite/corruption diagnostic;
- mismatched bytes are corruption and block the candidate;
- ETag, multipart ETag, missing ETag, Last-Modified, and custom metadata alone
  are never content equality.

PUT only absent verified blobs. Use conditional creation if supported by the
chosen driver; never overwrite a content key. Report planned/actual
reused/uploaded/verified objects and bytes by family. Receipt/operation objects
are counted separately from content blob PUTs.

Delete the unsafe equal-size/empty-ETag shortcut and test it explicitly.

### 5. Decide route-history representation by measurement

Benchmark at least:

1. current one-blob-per-route complete history;
2. one immutable closed-history archive plus one open/current-period-group blob
   per route, composed by the Worker;
3. any simpler index/range-read design already supported by the runtime.

Do not create one R2 read per historical year. If option 2 passes every gate,
the artifact manifest lists ordered pieces and the Worker performs at most two
R2 reads, strict-decodes each piece, rejects overlap/order/gaps, and returns
the exact existing public payload. Closing a period group is an explicit
deterministic transition; old archives are immutable and reusable.

If monolithic wins the 12-month request-weighted cost/latency model, retain it.
In either outcome, serve the full Plan 099 dataset range and preserve route-
level missing-period truth; optimization cannot truncate history.

### 6. Keep D1 full-candidate replacement unless evidence beats isolation

Plan 098's candidate-scoped D1 snapshot is small relative to artifacts and
gives simple validation/rollback. Measure it, but retain full candidate
insertion when it is within the declared D1 cost/time budget. Do not introduce
row-level cross-candidate deduplication that complicates atomic isolation for
negligible savings.

Optimize deterministic seed generation, identical-row build reuse, prepared
batches, and reporting first. Any proposal to share physical rows across
candidates requires a separate design proving referential integrity, garbage
collection, rollback, and query latency; it is not implicit in this plan.

### 7. Convert or retire the two frozen artifact paths

Before deleting compatibility, trace producers and every production consumer
of the legacy route-timeline and detector artifacts admitted by
`tests/harness/month-doctrine-allowlist.ts`.

For each:

- if production use is zero, delete producer, implicit recursive discovery,
  decoder, fixtures, and allowlist entry together;
- if nonzero, write a one-time offline converter into a strict candidate-aware,
  content-addressed schema; compare exact semantic/public response parity on
  representative and full fixtures; publish the converted body through the
  candidate manifest; then delete the old decoder/discovery path.

Do not retain dual runtime decoding indefinitely. Do not use a tracked marker
inside ignored `data/` as the ratchet; tracked tests/contracts and active
candidate manifests are the authority. `readLocalD1Inputs` must require an
explicit candidate artifact reference and cannot recursively discover a
frozen release-month file.

### 8. Remove every remaining release-identity vestige

After a successful Plan 098 A→B→A→B activation/rollback drill, one subsequent
production deploy cycle with an initialized pointer and zero fallback
telemetry, and a deployment inventory proving no production environment
remains in no-pointer bootstrap state:

- delete batch-derived/latest-map release resolution and the no-pointer legacy
  fallback from DB/Studio API;
- delete direct stable R2 key constants/reads after all callers use the
  artifact locator;
- remove `--month` from publication/release activation commands and
  `scripts/publish-serving-release.sh`; keep it on explicit source partition
  ingest/backfill/build commands;
- key local candidate/export roots by `candidateId`, with source-period
  subdirectories only where useful;
- remove `BASELINE_MONTH` and `LAST_BUILT_SPEED_MONTH` from production example,
  test Wrangler config, workflow, scripts, and runbook;
- remove silent `2026-03`, `2023-04`, and relative-year defaults after Plan 099
  supplies explicit registry/discovery inputs;
- remove both permanent allowlist entries once their compatibility code is gone;
- remove the deprecated shell wrapper after all callers use Plan 100.

Search docs/runbooks for operational instructions, but preserve historical
ADRs/plans as history and legitimate source-month examples.

### 9. Expand the month-doctrine ratchet semantically

Extend `tests/harness/month-doctrine.test.ts` to scan relevant:

- `.ts`/`.tsx` production and pipeline files;
- `.sh` scripts;
- `.jsonc` production/example/test Wrangler/config files;
- `.yml`/`.yaml` workflows;
- current operations runbooks and command examples.

Rules must distinguish identifiers/flags/config/path grammar that select a
release from legal data-grain terms. Add positive and negative fixture tests:

- reject `--month` on `publish serving-release`, `BASELINE_MONTH`, a
  month-rooted release export, “latest March release,” and a new silent default;
- allow `--month` on `ingest route-segment-speeds`, ISO month schema, monthly
  chart series, dataset coverage, and a source partition path;
- reject unowned/permanent compatibility allowlist entries and stale entries;
- require each temporary exception to name owner, exact fingerprint, removal
  plan, and expiry.

Keep the scan narrow enough that historical plans/ADRs and ordinary English do
not create noise that encourages broad exclusions.

### 10. Bound candidate and blob retention safely

Add Plan 100 action `publish serving-release --action gc`, with dry-run as the
default. Build a closed reference graph from release rows,
the active pointer, transition/rollback receipts, pinned operation receipts,
candidate manifests, artifact entries, and the object-verification ledger.
Extend CLI registry tests to prove the existing two-part path discovers
`publish serving-release`, accepts the strict `gc` action/options, and keeps
the run/rollback examples valid; do not introduce an unsupported third path
segment.

The initial conservative policy retains:

- the active release/candidate and immediate rollback predecessor;
- at least the newest two releases even if transition history is unusual;
- every manually/compliance-pinned release or candidate;
- every candidate referenced by an incomplete/failed operation still inside
  its investigation window;
- unreferenced candidates/blobs for at least 90 days after the final reference
  disappears.

Make the counts/grace configurable only in tracked operations policy, never an
ad hoc CLI shortening. A dry-run reports candidate rows/bytes and R2 blobs/
bytes by reason, projected savings, and exact hashes/keys. It refuses unknown
manifest versions, missing receipts, incomplete reference traversal, a pointer
generation change, or any proposed active/previous/pinned deletion.

An explicitly approved execution re-runs the graph and enters one D1
transaction fenced by the expected pointer generation. That transaction
rechecks active/previous/pin/in-flight references, atomically changes eligible
candidates from `ready`/`rejected` to `retiring`, records persistent candidate
tombstones plus the exact eligible blob/version set, and deletes only their
candidate-scoped projection rows. Activation/rollback/pin/operation-reference
triggers must reject a `retiring` or tombstoned candidate. Candidate staging
and GC share the same reference-write fence so a new blob reference cannot
race an object marked for deletion. Keep tombstones/deletion-ledger rows after
projection cleanup; “not found” must never make a retired candidate eligible
for resurrection.

Only after that transaction commits may the executor delete an immutable R2
blob, and only when the recorded reference count is zero across every retained
candidate/receipt, the grace period passed, and a pre-delete HEAD matches the
recorded verified object version/size. A pointer-generation change or any
reference-write fence conflict aborts before D1 or R2 deletion. Partial R2
failure leaves durable tombstones and a retryable exact object set; it never
reactivates a candidate. Write a durable deletion receipt before and after each
bounded batch. Never use a prefix-recursive delete, wildcard target, lifecycle
rule that bypasses the graph, or deletion inferred from a local ignored tree.
Report what is reconstructible and how before the operator grants the
destructive token.

Fault-injection/interleaving tests change the active pointer between plan and
transaction, attempt activation/rollback or a late pin/reference immediately
before and after the `retiring` transition, omit a manifest, fail midway
through bounded R2 deletion, and corrupt an object version. Each race must
either preserve the reference and abort all deletion or commit the tombstone
and reject the new reference; it may never delete an activatable candidate.
A retained release must pass complete HTTP parity after D1 and R2 GC.

### 11. Prove incremental behavior end to end

Create canonical scenarios from pinned fixtures:

1. **same inputs, different environment/clock/order**: identical fingerprints,
   bytes, candidate manifest, and blob keys;
2. **no data change**: all builders hit verified cache, zero content PUTs/bytes,
   the fenced verified-catalog intersection performs zero per-object
   HEAD/GET/PUT, Plan 100 records no-op, no candidate/release/pointer write, and
   the frozen elapsed/operator-touch budgets pass;
3. **one route/month change**: only dependency-affected route/aggregate outputs
   and manifest change; unrelated blob hashes/keys remain exact;
4. **one citywide source partition change**: all legitimately dependent outputs
   may change, but no independent family is rebuilt/uploaded;
5. **builder/schema version change**: declared dependents invalidate even if
   old bodies decode;
6. **corrupt cache/R2 object, same-size overwrite/version change, or empty
   ETag**: never skip; fail or rebuild/reupload according to immutable-key safety;
7. **full-history response**: optimized and prior payloads are contract-equal,
   coverage/gaps identical, and measured request budget passes;
8. **catalog/GC race**: stale, retiring, tombstoned, changed-generation, and
   out-of-band-drift cases never use the zero-HEAD fast path and fail or verify
   according to the fenced ledger contract.

Store benchmark/determinism receipts with candidate evidence. Do not commit
large generated data.

## Acceptance criteria

- [ ] Canonical payloads exclude operation volatility while preserving source
      timestamps/provenance; two-clock/two-order builds are byte-identical.
- [ ] Every builder cache hit is justified by a complete semantic input
      fingerprint and verified output hash, never mere decodability/existence.
- [ ] Candidate upload is closed-world and content-addressed; no-change performs
      zero per-object HEAD/GET/PUT, zero content bytes, and no release activation
      once the write-once/catalog/GC invariants are proven.
- [ ] A changed partition rebuilds/uploads exactly its dependency closure and
      reports why each changed aggregate changed.
- [ ] ETag/empty ETag/size alone cannot authorize reuse; corrupt immutable
      objects block publication.
- [ ] Route-history chunking is adopted only if it passes upload, 12-month cost,
      R2-read, subrequest, and latency gates; otherwise monolithic is retained.
- [ ] Full per-dataset history and gap truth remain unchanged by optimization.
- [ ] Frozen artifact compatibility is converted or removed, both permanent
      allowlist entries are gone, and runtime dual decoding is gone.
- [ ] Candidate/blob storage is bounded by a reference-aware, 90-day-grace,
      dry-run-first GC; active, previous, pinned, unknown, and in-flight state
      is mechanically undeletable and execution has a separate receipt/token.
- [ ] Publication selectors/config/paths are candidate/release based while
      legitimate source-month grain remains supported and tested.
- [ ] The ratchet covers operational TypeScript, shell, JSONC, workflow, and
      runbook surfaces without scanning historical prose indiscriminately.
- [ ] Healthy no-op and one-period runs meet the frozen end-to-end and
      operator-touch budgets; receipts expose every approval, resume, rollback,
      and remedial intervention separately from machine time.

## Verification

```sh
bun --filter @bp/domain test
bun --filter @bp/analytics test
bun --filter @bp/db test
bun --filter @bp/pipeline-v2 test
bun --filter @bp/studio-api test
bun run test:web
bun run test:worker
bun run check:types
bun run check:style
bun run check:architecture
bun run check:knowledge
bun run check:prepush
```

Run the deterministic and cost benchmarks from a pinned candidate at least
twice and attach their machine-readable receipts. Production performance/cost
claims require actual Cloudflare metrics after an authorized activation.

## STOP conditions

Stop if an artifact's semantic inputs cannot be fingerprinted; canonicalization
would discard source evidence; cache reuse cannot be hash-proven; a supposedly
immutable key can be overwritten; incremental logic can serve mixed candidates;
history optimization truncates/gap-fills data or exceeds any request/cost gate;
month cleanup would remove legitimate source grain; frozen compatibility has
unknown production use; a fallback is still needed for rollback; or savings
depend on weakening atomic activation, exact identity, decoding, provenance,
freshness, or public response contracts.
