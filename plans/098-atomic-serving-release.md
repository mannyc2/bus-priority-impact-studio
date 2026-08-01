# Plan 098: Atomic serving releases with immutable artifacts

## Status

- **State**: IN PROGRESS — implementation and local A→B→A→B proof complete;
  protected production activation pending
- **Priority**: P1
- **Effort**: XL
- **Depends on**: Plans 084-087 and 095; either Plan 097 production completion,
  or its signed atomic-batch-limit STOP receipt and an operator decision to
  perform catch-up through this pointer architecture
- **Audit base**: `origin/main@ecf556a79e23b4b9374d08210a380754756f357b`
- **Suggested branch**: `codex/098-atomic-serving-release`

## Implementation checkpoint (2026-08-01)

The additive implementation is complete on the suggested branch. It includes
the exhaustive D1 ownership boundary, strict content-derived candidate and
activation-derived release contracts, the checksum-pinned `d1-v2` migration
lineage, candidate-scoped generated projections, split current-signal tables,
one request-local pointer resolver, release-qualified immutable artifact reads,
fail-closed decode telemetry, and the authenticated production operator. The
exact Plan 106 public candidate is carried as a deterministic checked input;
candidate A mirrors all 3,002 Plan 097 artifacts and candidate B overlays the
189 public Plan 106 objects.

Disposable legacy→v2 migration replay and local A→B→A→B activation/rollback
passed with stale-CAS, operation-collision, terminal-immutability,
candidate-isolation, and protected-sentinel checks. Repository verification
passed: 985 unit, 445 web, and 35 Worker tests, typecheck, style, architecture,
knowledge, web release/bundle budgets, and migration checksum validation.

Production remains unchanged at this checkpoint. Merge deploys the additive
migration and dual-capable reader only after re-verifying the exact signed Plan
097 preflight receipt and protected-table fingerprints. The separate protected
`Plan 098 production activation` workflow then stages A and B, performs the
generation 0→1→2→3→4 drill, verifies cross-surface HTTP evidence and unchanged
live/current fingerprints, and leaves B active. This plan becomes `DONE` only
after those durable remote receipts are downloaded and independently checked.

The first merged expand attempt failed closed before operator deployment or any
production mutation because Plan 097's one-time signing secrets had correctly
been retired during its cleanup. The follow-up does not recreate retired key
material: it verifies the exact signed receipt digest plus the embedded signer
key ID and independently recorded SPKI fingerprint, then performs the same
schema/ledger/fingerprint comparisons. This keeps the preserved attestation as
the trust anchor without introducing a new signer.

The second merged expand attempt (`ci-cd` run `30718152077`) deployed only the
isolated authenticated operator, then received a terminal HTTP 409 from the
pinned preflight before applying the v2 migration or deploying/promoting a
reader. The convergence loop discarded that safe diagnostic body, and Wrangler
cleanup failed because it probed KV namespaces outside the token's deliberately
narrow scope. The diagnostic follow-up preserves the response and attempt/HTTP
metadata, retries only deployment-propagation failures, and deletes the
temporary service through Cloudflare's service endpoint without broadening the
credential. Production serving and the release pointer remain unchanged.

## Outcome

Make one explicit release pointer select every reviewed D1 projection and R2
artifact used by a request. A candidate is fully staged and verified while the
current release remains untouched; activation is one compare-and-swap pointer
transaction; rollback is the same pointer operation in reverse.

The design must preserve mutable auth, user, and current-signal rows in the
existing D1. It versions only generated serving projections. It removes
“latest passing batch,” “latest map timestamp,” and mutable stable R2 keys as
independent production selectors.

If Plan 097's compacted activation cannot meet D1's transactional limits, this
plan is the safe continuation rather than a dependency deadlock: first mirror
the still-active production cut into candidate A, establish the pointer, then
publish the freshness-derived catch-up as candidate B through the new path.

## Binding model

Keep build identity separate from publication identity:

```text
source partitions + builder versions + canonical payload hashes
                         │
                         ▼
          immutable candidateId (content-derived)
                         │ stage/verify
                         ▼
     releaseId + publishedAt/activatedAt (activation event)
                         │
                         ▼
             singleton active-release pointer
```

- `candidateId` is derived from canonical semantic inputs and output hashes.
  It can exist without being public.
- `releaseId` and `publishedAt` are created only for a successful activation.
  `builtAt`, `stagedAt`, and `activatedAt` are distinct fields.
- A request resolves the pointer once and carries `{releaseId, candidateId}`
  through every D1 and R2 read. It cannot mix generations if activation occurs
  mid-request.
- Month remains valid inside dataset coverage, observations, and storage
  partitions. None of those selects the active release.
- A byte-identical/semantically identical candidate is not a new release.

## Verified current boundary

| Concern | Current implementation | Required replacement |
|---|---|---|
| Studio release | `packages/db/src/d1/queries/studio-route-index.ts:564-581` chooses latest passing `route_batch_status`; `packages/studio-api/src/studio/read-handlers.ts:376-405` derives release identity from it | Resolve the singleton pointer and candidate once. |
| Map release | `packages/db/src/d1/queries/map-release-catalog.ts:105-151` chooses latest verified map row by `published_at` | Candidate map metadata must belong to the pointed release; no timestamp election. |
| D1 staging | `packages/db/src/d1/seed/build-seed-sql.ts:727-795` deletes global and month rows before inserting replacements | Candidate-scoped rows coexist with active/previous candidates. |
| R2 routing | Stable keys come from `packages/domain/src/studio/route-dossier.ts:21-23` and `packages/analytics/src/artifacts/index.ts:61-115`; direct reads are spread through `read-handlers.ts:695-925,1640-1978` | One logical-artifact resolver maps candidate metadata to immutable physical keys. |
| Release construction | `tools/pipeline-v2/src/commands/map/release.ts:94-265` propagates one identity but mints `publishedAt` at build time; only the final map manifest is content-addressed | Build a content-derived candidate; mint publication identity at activation. |
| Caching | `packages/studio-api/src/public-api.ts:752-789` already treats hash-addressed passthrough objects as immutable | Extend the proven pattern to every published object. |
| Test assumptions | `apps/web/test/worker/public-routes.worker.test.ts:50-52,135-159,579-589` permits route/exact/map release IDs to differ | All release-bearing public surfaces must agree. |

`map_release_catalog` is useful immutable metadata, but its current “newest
timestamp wins” query is not activation and cannot reactivate an older cut.
Likewise, `route_batch_status` is a build result, not a release pointer.

## Scope and non-goals

### In scope

- Candidate/release/coverage/artifact contracts in `packages/domain`.
- A new, clean D1 migration stream for forward production changes.
- Candidate catalog, dataset/artifact metadata, active pointer, and generated
  release-scoped v2 serving projections.
- Candidate-aware D1 export/seed generation without destructive replacement.
- One request-local resolver for all D1/R2 reads.
- Immutable artifact keys, stage validation, CAS activation, retention, and
  pointer-only rollback.
- Expand/switch/contract rollout with a temporary observable fallback.

### Not in scope

- Moving auth/session/user state out of D1.
- Versioning real-time/current-signal appendices as reviewed releases.
- Historical discovery/backfill and freshness deadlines (Plan 099).
- The final resumable operator command/workflows (Plan 100).
- Full determinism, upload/build optimization, or vestige removal (Plan 101).

## Execution preflight and verification cadence

Execute from a fresh branch descended from the audit base; the audit checkout
is stale and is not an implementation base. Preserve unrelated worktree
changes, then run:

```sh
git merge-base --is-ancestor ecf556a79e23b4b9374d08210a380754756f357b HEAD
git diff --name-only ecf556a79e23b4b9374d08210a380754756f357b..HEAD -- packages/domain packages/db packages/studio-api tools/pipeline-v2 apps/web scripts .github knowledge tests
```

If ancestry fails, STOP and rebase/replan. Re-open every cited anchor changed
since the audit base and amend the plan for behavioral or ownership drift.
After each numbered step, run `git diff --check`, the smallest affected-package
typecheck, and the focused gate below rather than batching verification at the
end.

| After steps | Minimum focused gate |
|---|---|
| 1-2 | table-ownership and candidate/release contract tests |
| 3-4 | legacy+v2 bootstrap, checksum-manifest, catalog, null-bootstrap CAS, and stale-CAS tests |
| 5-6 | candidate isolation, current-signal sentinels, and one-request resolver tests |
| 7 | closed artifact-manifest, staged-key denial, and immutable upload tests |
| 8 | A→B→A→B Worker parity drill plus architecture and knowledge checks |

## Implementation

### 1. Classify every D1 table before designing the migration

Add a checked manifest under `packages/db/src/d1/serving-table-ownership.ts`
that assigns every exported D1 table an explicit current owner:

- `generated_candidate`: all rows produced by `buildD1SeedSql`;
- `current_signal`: appendices updated independently of reviewed publication;
- `live_write`: auth, session, role, alert, saved search, comment, draft/review;
- `static_reference` or `legacy_retired`, with an explicit rationale.
- `mixed_legacy_requires_split`: temporary only for tables written by both the
  full reviewed seed and `buildD1AppendixSeedSql`.

Architecture tests compare this manifest with schema exports and with every
`DELETE`/`INSERT` target produced by both seed builders. An unclassified table
or generated seed target classified as live/current is a hard failure. The
current shared `route_observed_reliability_summary` and
`route_month_source_status` paths are expected mixed-legacy findings, not
permission to version current signals. Preserve the Plan 097 protected-table
sentinels in all migration/isolation tests.

Do not add `release_id` to live-write/current-signal tables. Do not use a
whole-database snapshot, binding swap, or Time Travel for release rollback.

### 2. Add strict candidate and release contracts

In `packages/domain/src/studio/shared.ts` and focused modules, add versioned
Effect Schema contracts equivalent to:

```ts
type ServingCandidateManifestV1 = {
  schemaVersion: 1;
  candidateId: string; // digest of canonical semantic content below
  semanticInputFingerprint: string;
  sourceCommit: string; // provenance envelope, excluded from candidateId
  builderVersions: ReadonlyArray<{ name: string; version: string }>;
  datasets: ReadonlyArray<{
    datasetId: string;
    grain: "month" | "day" | "snapshot" | "realtime";
    coverage: { start: string | null; end: string };
    sourceSnapshotIds: ReadonlyArray<string>;
  }>;
  artifacts: ReadonlyArray<{
    logicalId: string;
    key: string; // immutable hash-bearing physical key
    sha256: string;
    bytes: number;
    mediaType: string;
    schemaId: string;
  }>;
  d1: {
    projectionSchema: string;
    projectionSha256: string; // canonical candidate-neutral logical rows
    rowCounts: Record<string, number>;
  };
  exactIdentity: { projectionSha256: string; routeCount: number };
};

type ServingReleaseV1 = {
  releaseId: string;
  candidateId: string;
  publishedAt: string;
  activatedAt: string;
};
```

Derive `candidateId` from the canonical semantic payload **without** its own ID
or the provenance-only `sourceCommit` field. Semantic code changes are carried
by explicit builder/schema/algorithm versions and changed output hashes; an
unrelated docs-only commit cannot create a new candidate. The full envelope
still records the commit and has its own receipt/manifest byte hash. The D1
projection digest is computed over candidate-neutral logical
rows, not serialized seed SQL containing `candidateId`; this avoids a hash
cycle. Serialized seed/package hashes are operation evidence outside candidate
identity. The canonical candidate payload excludes wall-clock build/stage times
and local paths. Sort every map/set-derived array. Validate unique logical IDs,
unique dataset IDs, hash-shaped keys, nonnegative byte/count fields, coverage
order, and no conflicting physical metadata for a hash.

Keep the existing top-level `ReleaseIdentitySchema` as a public compatibility
projection during rollout. Worker response assembly injects the pointed
release identity; immutable bodies must not claim a build timestamp is their
publication time. Plan 099 adds richer available/ingested/published fields to
the dataset entries without changing the pointer model.

### 3. Establish a truthful forward migration lineage

The legacy production ledger is divergent after direct 0032/0034 recovery and
cannot be repaired by guessing. Retain `packages/db/migrations/d1/` only as
the clean-bootstrap history. Freeze the forward stream as
`packages/db/migrations/d1-v2/`, its dedicated config as
`packages/db/wrangler.d1-v2.jsonc`, and its migration table as
`bp_d1_migrations_v2`. Do not silently repoint the legacy bootstrap config;
tests need both streams and production commands must name the v2 config
explicitly.

The v2 `0000` migration may create **only new Plan 098 tables/indexes**. It
must not replay, rename, or mark old migrations as applied. A preflight compares
the signed Plan 097 read-only preflight schema/live-surface receipt and exact
production fingerprints before first application. If Plan 097 could not
capture that receipt because production read access itself was unavailable,
Plan 098 must produce the equivalent signed read-only receipt as its first
remote action; no migration design or application may proceed without it.
Local bootstrap tests apply legacy migrations to an empty DB,
then the v2 stream; production applies only the v2 stream. Document this
one-time lineage boundary in a new ADR and the D1 README.

Keep the existing `migrations-drizzle/d1` snapshot cache as the full-schema
Drizzle source of truth; this is not a second application ledger. Update
`packages/db/package.json`, `snapshot-coverage.test.ts`, Worker migration setup,
and D1 tests so generation still proves the complete schema while live tests
apply legacy then v2 SQL. Add explicit `db:migrate:d1:v2:local/remote` scripts
using `--config wrangler.d1-v2.jsonc` (package scripts run from
`packages/db`), and make the legacy remote script fail with migration
guidance after the cutover so an operator cannot accidentally replay 0000-0034.

Add a tracked `packages/db/migrations/d1-v2/checksums.json` mapping every
relative migration filename to SHA-256, plus a test/command that refuses a
missing, modified, reordered, or extra applied migration. Wrangler's ledger
proves applied names/times only; it does **not** prove historical file bytes.
The first successful v2 apply receipt binds the checksum manifest, and an
applied file is immutable—any correction is a new migration.

Use only `bun --filter @bp/db db:migrate:d1:v2:local` and
`bun --filter @bp/db db:migrate:d1:v2:remote`; those scripts pin the immutable
database name and package-relative `--config wrangler.d1-v2.jsonc`. Cloudflare
explicitly supports custom migration directories and tables in
[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
No future production workflow may execute a migration file with `d1 execute`.

### 4. Add candidate catalog, release catalog, and CAS pointer

The migration adds normalized tables for:

- immutable candidate header and canonical manifest hash;
- candidate dataset coverage/provenance rows;
- candidate logical artifact → physical object rows;
- candidate D1 projection metadata/counts;
- immutable release activation records;
- a singleton active-release pointer row with nullable pre-bootstrap release
  and monotonically increasing generation;
- operation/receipt references and state needed for stage validation.

Candidate state is `staging | ready | rejected`; it never means public.
Release rows are append-only. The pointer row exists at migration time with
generation zero and no active release; readers treat that state as “no pointer”
and use the bounded legacy path. After bootstrap it stores release ID and
generation and can never return to null.
Implement activation as one exact CAS `UPDATE ... WHERE generation = ? AND
((release_id IS NULL AND ? IS NULL) OR release_id = ?) RETURNING ...` whose
database trigger (or equivalently proven single-statement invariant) validates
candidate readiness, inserts the new immutable release row when absent, and
appends a pointer-transition event keyed by a unique publication operation/
idempotency ID. Bind the expected release twice as needed; plain
`release_id = NULL` is forbidden. Do not put a release insert before a possibly
zero-row update.

Before any retry, query that operation ID. If a committed transition exists
and its candidate, from/to releases, expected/new generations, release ID, and
manifest hash all exactly match, return that recorded result and resume smoke/
receipt finalization without another CAS. A reused operation ID with any
difference is a collision and fails. If no matching committed transition
exists, a zero-row `RETURNING` is a genuine stale-generation failure: no
trigger/event/release row runs, the application fails the operation, and the
pointer is unchanged. Test generation-zero/null bootstrap, ordinary
activation, rollback, response loss after commit, matching retry, mismatched
operation reuse, and competing stale expected release/generation.

Rollback validates the retained target candidate and CAS-updates only the
pointer. It does not delete/reseed rows, restore D1, or modify R2.

### 5. Version all generated serving projections

Create release-scoped v2 equivalents for every table classified
`generated_candidate`, keyed by `candidate_id` plus the table's existing
business key. Prefer new `_v2` tables over altering legacy primary keys so the
expand phase is additive and rollback-safe. Preserve month fields wherever
they are true observation/partition grain.

Split every `mixed_legacy_requires_split` table into a candidate-scoped
reviewed projection and a separately named unversioned current-signal table.
In particular, stop letting the full seed and `buildD1AppendixSeedSql` share
`route_observed_reliability_summary` or `route_month_source_status`. Repository
methods must name which layer they query/compose, and current-signal rows must
survive candidate activation/rollback byte-identically. No mixed-legacy owner
may remain when the pointer switch is enabled.

Refactor `buildD1SeedSql` into:

- a legacy seed retained only for bootstrap/recovery fixtures;
- a candidate seed that inserts/upserts one candidate namespace, never deletes
  another candidate, and ends by validating all declared row counts/hashes;
- a separately owned current-signal appendix path.

Staging candidate B while A is active must leave every A query and all
live/current sentinel rows byte-identical. A partial B must be safely retryable
or removable without touching A. Retain at least the active and immediately
previous candidates; garbage collection requires a separate reviewed command
that refuses any referenced candidate.

### 6. Route every read through one resolved release

Add `resolveActiveServingRelease` in `packages/db` and a request-context type
in `packages/studio-api`. Resolve it once at the public request boundary; pass
the resolved `{release, candidate, datasets, artifacts}` into repositories and
handlers instead of independently querying “latest.”

- D1 repositories require candidate ID and query only v2 rows in that scope.
- The map resolver uses the same candidate, not newest map timestamp.
- Exact-route registry/projection metadata belongs to the same candidate.
- Every R2 read asks a single artifact locator for a logical ID. Direct stable
  key construction in handlers becomes unavailable to production code.
- Dynamic production API request input cannot select a candidate or release. A
  preview override is dependency-injected only in a separately configured,
  access-controlled preview Worker used before activation; it must not expose
  unpublished candidate data to anonymous traffic or shared caches.

The locator metadata should come from the already-resolved D1 context or a
bounded cache; do not add one R2 manifest GET per artifact. Preserve immutable
cache headers/ETags for physical hash-addressed URLs.

Replace the current anonymous physical-key passthrough under
`/api/v1/artifacts/*`. Public artifact URLs must be release-qualified and the
Worker must prove the requested key belongs to an already published release
that is active or retained-public. A staged/ready candidate has no public
release membership, so even a leaked physical hash key returns 404/403; only
the access-controlled preview resolver may read it. Direct R2 bucket access
remains private. Preserve cacheability for active/retained published objects
without making arbitrary bucket keys enumerable.

Those release-qualified immutable artifact URLs are the sole production
release-selection exception. A dynamic response resolves the active pointer
once and emits artifact URLs qualified by that exact release; a later artifact
request may read that active-or-retained-public release even if the pointer
changed in between. It cannot use the URL to invoke D1/detail/status logic or
select staged/rejected/GC-retiring state. Test a pointer flip between manifest
and artifact requests, retained-release cache continuity, staged-key denial,
and denial of release parameters on every dynamic endpoint.

Before switching readers, create a checked production decode-policy inventory
covering Worker/API handlers, serving D1 row decoders, artifact locators, and
browser serving-response decoders. Inventory every parse/decode/hash/identity
failure that currently returns `null`, `continue`, an empty collection, or
“not found,” and classify it as either `absence_allowed` with a schema-backed
rationale or `corrupt_fail_closed`. Missing optional data may remain nullable
only when the contract declares it optional. Invalid JSON, schema, checksum,
candidate/release identity, or required-object failures return a typed error or
candidate rejection and emit structured telemetry containing error code,
endpoint, logical artifact ID, schema ID, candidate ID, release ID, and request
ID—never payloads or personal data. Centralize these paths so an architecture
test rejects unregistered catch/decode-to-null behavior.

During expand/switch, a logged legacy resolver may run **only when no active
pointer exists**. It must emit structured telemetry identifying the endpoint
and logical artifact. It cannot catch arbitrary decode errors and return null.
Once the first pointer is active, fallback is impossible. Plan 101 deletes it.

### 7. Make every R2 body immutable and candidate-addressed

Extend the existing hash-filename validation in
`tools/pipeline-v2/src/commands/publish/r2-artifacts.ts:331-342` to all public
artifact families. A candidate manifest maps stable logical IDs such as
`route/bx38/speed-history` to physical keys containing the canonical body hash.
Never overwrite those keys; a hash collision with different bytes is fatal.

Move publication identity out of reusable body content. Where response shapes
currently include release fields, decode an artifact payload schema and add
the active release envelope in Worker response assembly. Preserve true source
capture timestamps and observation dates. Plan 101 removes remaining build
volatility and adds input-aware incremental regeneration.

Upload all declared objects, GET/hash-verify them, stage all candidate D1 rows,
run candidate parity, and mark the candidate `ready` before activation is
eligible. Missing/hash-mismatched objects keep A active and healthy.

### 8. Roll out expand → stage → switch → contract

1. **Expand**: land v2 migration stream, new tables, dual-capable readers,
   artifact locator, preview override, telemetry, and isolation tests. Deploy
   with no pointer; legacy reads continue.
2. **Stage A (baseline)**: mirror the current public cut into the old artifact
   payload schema under candidate-scoped D1/immutable keys, and prove exact
   preview HTTP parity with legacy production.
3. **Initial switch A**: bootstrap the pointer to A. When the audited legacy
   surfaces already share one release, preserve that existing release ID and
   `publishedAt`; this is pointer adoption, not a no-data-change publication.
   If Plan 097 stopped and legacy surfaces disagree, A is instead an explicit
   reviewed contract-migration release that canonicalizes their envelopes—it
   cannot be mislabeled as an ordinary no-op. Verify every release-bearing
   surface and record which case occurred.
4. **Stage B (real semantic change)**: build the new Plan 098 payload schema
   that removes publication identity from reusable bodies—or, when Plan 097
   stopped, the freshness-derived catch-up. Its changed schema/builder IDs and
   payload hashes make it semantically distinct, not a timestamp-only release.
5. **Switch and rollback drill**: activate B, smoke; CAS-reactivate retained A,
   smoke; then CAS-reactivate B and smoke. A and B both remain retained and all
   live/current sentinels remain byte-identical.
6. **Contract**: disable legacy resolver use once a pointer exists, retain its
   code for one release only, and hand final deletion to Plan 101.

Do not begin another artifact schema cutover between Plan 097 recovery and
this successful switch.

## Tests

Add or extend:

- `packages/domain/test/serving-release-contract.test.ts`: strict candidate,
  release, dataset, artifact, canonical-hash, and timestamp separation.
- `packages/db/test/serving-release-catalog.test.ts`: staged invisibility,
  operation-keyed idempotency after lost response, mismatched-key collision,
  exact zero-row stale-CAS failure/no release event, same-coverage A/B,
  rollback, one pointer.
- `packages/db/test/serving-release-isolation.test.ts`: overlapping candidate
  rows never mix; partial staging leaves A and live/current sentinels intact.
- `packages/db/test/d1-seed-validation.test.ts`: candidate seed has no
  cross-candidate deletes and covers every generated table.
- `packages/studio-api/test/serving-release-resolution.test.ts`: all D1/R2
  reads use one context; production overrides fail; fallback is bounded/logged;
  each registered optional-absence case remains nullable while corrupt JSON,
  schema, checksum, identity, and required-object cases fail closed and log the
  redacted structured fields.
- `apps/web/test/worker/public-routes.worker.test.ts`: status, map, route list,
  detail, dossier, history, hourly, speed history, and timeline share one
  release; pointer flip is coherent; a leaked staged physical key is denied
  while the same key becomes available only through its published release URL.
- `tools/pipeline-v2/test/commands/map/release.test.ts`: deterministic candidate
  manifest and activation-free build.
- `tools/pipeline-v2/test/commands/publish/r2-artifacts.test.ts`: immutable
  keys, missing/corrupt object failure, no overwrite.
- `tests/harness/d1-migration-discipline.test.ts`: clean bootstrap applies
  legacy then v2; production commands use the v2 migrations table and contain
  no ledger writes, aggregate schema, or direct migration-file execution.

Required failure injection: after every R2 and D1 staging phase, active A must
still return 200 and exact bytes; after pointer activation, every surface must
resolve B; rollback must restore A without changing auth/session/current-signal
sentinels.

## Acceptance criteria

- [ ] One canonical pointer selects Studio D1, exact identity, maps, and every
      R2 artifact for a request.
- [ ] Build/stage timestamps and content-derived candidate identity are distinct
      from activation-time `releaseId`/`publishedAt`.
- [ ] Every full-seed-owned D1 row is candidate-scoped; no live-write or current
      signal table is versioned, replaced, or rolled back.
- [ ] Candidate B can be fully staged/retried while A remains byte-identical and
      public; activation is one atomic transaction whose only externally
      visible switch is the CAS pointer update.
- [ ] Every physical R2 body is immutable/hash-addressed and every read uses the
      manifest locator; no production request selects an unpublished candidate.
- [ ] A pointer rollback restores all reviewed surfaces in one step without D1
      reseed, R2 overwrite, Time Travel, or user-write loss.
- [ ] A new truthful v2 migration stream is applied through Wrangler migrations
      only; legacy ledger divergence is documented, not falsified.
- [ ] The first production switch and rollback drill have durable receipts and
      cross-surface HTTP evidence.
- [ ] Every production decode-to-absence path is registered as contract-allowed
      optionality; corrupt or identity-mismatched required data cannot render as
      honest absence and emits redacted structured telemetry.

## Verification

```sh
bun --filter @bp/domain test
bun --filter @bp/db test
bun --filter @bp/studio-api test
bun --filter @bp/pipeline-v2 test
bun run test:worker
bun --filter @bp/db db:generate:d1
bun --filter @bp/db db:migrate:d1:v2:local
bun run check:types
bun run check:style
bun run check:architecture
bun run check:knowledge
```

The migration-generation command must leave no unexplained drift. Production
activation and rollback are separate operator-approved steps; local and CI
tests must not fabricate their results.

## STOP conditions

Stop if any D1 table is unclassified; a generated seed can touch live/current
state; production schema does not match the Plan 097 receipt; the migration
requires editing the legacy ledger; a candidate row/object is mutable; a read
can independently elect “latest”; a request can mix candidates or select an
unpublished one; an unregistered decode/hash/identity failure can become
absence; activation needs reseeding/copying rather than one CAS; the
rollback would use Time Travel or replace D1; or the first switch cannot be
proven against every public artifact-bearing endpoint.
