# Plan 097: Safe production catch-up without migration forgery

## Status

- **State**: IN PROGRESS
- **Priority**: P0
- **Effort**: M-L
- **Depends on**: Plans 085-087 and 095 (DONE); Plan 096 is unrelated
- **Audit base**: `origin/main@ecf556a79e23b4b9374d08210a380754756f357b`
- **Suggested branch**: `codex/097-safe-production-catch-up`

## Outcome

Publish one current, complete serving cut without falsifying D1 migration
history, replacing the production database, losing live user state, or
regressing the exact route-index v3 recovery. The target comes from verified
source freshness and completeness, never a hand-selected “release month.”

This is a bounded recovery for the current architecture. It first deploys a
release-addressed recovery manifest reader, stages immutable R2 bodies, then
commits all generated D1 serving changes as one tested transactional batch. It
preserves a selective serving-data rollback and records every mutation. It
does **not** create the general candidate catalog/pointer architecture; Plan
098 must replace the recovery indirection before another contract cutover.
The approved sequence permits this one bounded bootstrap exception because the
current production architecture has no pointer: a same-schema data catch-up
may use one proven atomic D1 activation batch and one proven selective restore
batch. It is not permission for a later artifact/schema cutover. If any public
artifact/schema contract must change, if either batch cannot be proved, or if
the bounded conditions below cannot be met, stop here and move catch-up into
Plan 098. After Plan 098 establishes the pointer, every activation and routine
rollback must use it.

The successful production end state is the freshness-derived candidate still
active. The required rollback exercise is the exact A→B→A disposable-remote
proof performed before production authorization. Production rollback is a
contingency only: if post-activation smoke fails, restore the old cut, record a
`rolled_back` STOP receipt, do not reactivate in this recovery, and do not mark
Plan 097 DONE.

## Binding decisions

1. A month may identify a source partition or chart coordinate. It must not
   identify the release, select production, or define a global baseline.
2. Preserve the existing production D1. It contains mutable identity,
   session, role, alert, saved-search, comment, and current-signal state that a
   generated seed cannot reconstruct.
3. Never insert guessed rows into `d1_migrations`. Never infer migration
   completion from table names alone. Never run generated `schema.sql` against
   populated production.
4. The one emergency schema exception is an audited, idempotent recovery of
   the exact `0033_map_release_catalog.sql` shape when production proves that
   this is the only missing serving object. Record the legacy ledger mismatch
   but leave it untouched.
5. A new release must carry its own exact-route identity registration. The
   Plan 095 receipt is evidence for its pinned release only.
6. Never overwrite stable R2 aliases while they are still read by the active
   release. Candidate bodies are immutable/release-addressed and become
   discoverable only when the D1 release changes.
7. All generated serving-row replacement, exact registration, map registration,
   and the new `route_batch_status` activation row commit in one proven D1
   batch. A multi-command best effort is not safe enough.
8. Remote mutations need a fresh operator execution token after the candidate,
   pre-audit, rollback snapshot, cost preview, and commands are available for
   review. Approval of this plan is not approval to mutate Cloudflare.

## Verified failure boundary

| Surface | Current evidence | Consequence |
|---|---|---|
| Remote schema path | `scripts/publish-serving-release.sh:173-184` executes exported `schema.sql`; `tools/pipeline-v2/src/commands/export/d1-migrations.ts:5-11` concatenates migrations beginning with non-idempotent `0000_tense_jane_foster.sql` | The normal command is unsafe for a populated, ledger-divergent D1. |
| Ledger divergence | `.github/workflows/ci.yml:71-147` directly executes the 0032/0034 migration files and Plan 095 recovery while 0033 is not in that path | Schema and `d1_migrations` cannot be reconciled by invented ledger rows. |
| Shared mutable D1 | `packages/db/src/d1/schema.ts:674-790` defines identity/session/role/alert/search/comment tables; ADR-0008 assigns auth to D1 | A shadow binding swap or routine Time Travel rollback can discard concurrent writes. |
| Release resolution | `packages/db/src/d1/queries/studio-route-index.ts:564-581` derives the active Studio release from the latest passing `route_batch_status` | Inserting that row is an activation event even though no explicit pointer exists. |
| Exact identity | `packages/studio-api/src/studio/read-handlers.ts:420-481` requires a matching `exact_route_identity_release`; only `tools/pipeline-v2/src/lib/route-index-v3-recovery.ts` currently emits one | A fresh seed without fresh exact registration makes schema-v3/detail/history return 503. |
| Publication order | `scripts/publish-serving-release.sh:173-213` mutates D1 before uploading R2 and registers the map last | A failed upload can expose D1 rows whose artifacts do not exist. |
| Mutable artifact aliases | `packages/domain/src/studio/route-dossier.ts:21-23`, `packages/analytics/src/artifacts/index.ts:61-115`, and `read-handlers.ts:695-925,1640-1978` construct/read stable R2 keys | Uploading candidate bytes “first” to those keys would expose them to the old D1 release; R2-first is safe only with release-addressed keys and a predeployed resolver. |
| D1 batch feasibility | The ignored local 2026-05 export observed during this audit is 5,619,870 bytes and 19,739 semicolon-terminated statements | It cannot be submitted unchanged under D1's 1,000-query/invocation and 30-second batch limits; recovery needs measured set-based compaction or must defer to Plan 098. |
| Completeness | `tools/pipeline-v2/src/checks/check-publish-completeness.ts` does not strict-decode every dossier, history, hourly, and capability body | File presence is insufficient evidence for a safe catch-up. |

### Source-audit reconciliation (2026-07-22)

The implementation-base audit found additional release-safety surfaces that
are binding on this plan:

- Direct R2 reads also exist in `packages/studio-api/src/public-api.ts` and
  `packages/studio-api/src/studio/projections.ts`, not only
  `studio/read-handlers.ts`. The resolver/architecture gate must inventory all
  three files and permit direct reads only in the central resolver, the
  verified map loader, and the protected recovery-bundle loader.
- The anonymous `/api/v1/artifacts/*` route currently admits generically safe
  keys, including `operations/plan097/**`. Both recovery manifest and blob
  namespaces must be denied, including encoded forms, before staging begins.
- Existing Studio/map/artifact cache policies include stale-while-revalidate
  windows. Before production activation, the disposable and production
  runbooks must prove a release-safe cache-key transition or a bounded
  no-store/purge/drain procedure; a pointer/resolver flip alone is not enough.
- Map catalog election must equal the active Studio release. Independent
  newest-map/latest-batch results are a STOP even when each row is valid.
- Candidate manifests must inventory aliases explicitly. Missing candidate
  logical IDs and corrupt manifests fail closed; they cannot reuse legacy
  "try another stable key" absence semantics.
- The push-on-main CI path must be unable to run direct recovery/migration SQL
  or any Plan 097 data mutation before the protected transport is eligible.
  Code deploy and separately authorized recovery remain distinct gates.
- Canonical migration replay plus PRAGMA results, not the Drizzle mirror alone,
  define the production schema envelope. The canonical stream contains
  historical alter/drop drift that the current mirror does not fully express.
- The current full seed deletes `route_scorecard_citation` without a matching
  input projection, and it writes `route_batch_status` before built-route/issue
  children. Recovery must preserve or strictly rebuild citations and must emit
  the activation status as the absolute final statement; otherwise STOP.
- D1 compaction must respect the 100-bound-parameter limit as well as statement
  bytes, query count, and the 30-second whole-batch deadline. A set-based
  renderer that cannot prove all four limits takes the signed STOP handoff to
  Plan 098.
- Candidate artifact bytes cannot appear in the production bucket before the
  fresh mutation token. The protected recovery Worker must therefore support
  an allowlisted staged-object action: the CLI streams a logical ID and bytes
  already bound by the signed operation bundle, the Worker verifies the
  declared hash/length/media type, derives the content-addressed key itself,
  and performs GET/hash/no-op-or-PUT/GET/hash. It never accepts a caller-chosen
  bucket or physical key. Manifest bytes are staged only after every member is
  verified, through the same action and with identical-write-only semantics.

The production D1 is therefore **not** disposable serving-only state. D1 Time
Travel remains disaster recovery because an in-place restore rewinds unrelated
live writes. Cloudflare documents sequential migration names in
`d1_migrations`, customizable future migration streams, and in-place Time
Travel behavior in [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
and [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## Scope

### In scope

- Deterministic pre/post audits of production serving schema and data.
- An exact, idempotent recovery for the 0033 table/index only.
- General per-release exact-route registration and completeness checks.
- A selective snapshot/restore of every table the generated serving seed can
  delete or replace.
- A recovery-only release artifact manifest/resolver and immutable candidate
  R2 keys so the active release never sees staged bytes.
- A bounded transactional D1 data-batch driver with exact remote integration
  proof and an atomic selective restore batch.
- One freshness-derived local rebuild, candidate replay, remote publication,
  generalized HTTP smoke, rollback exercise, and durable completion receipt.

### Out of scope

- Replacing production D1, copying live-write tables, or freezing user writes.
- Treating Time Travel as normal release rollback.
- The general candidate catalog, explicit pointer, and steady-state artifact
  addressing/control plane; Plan 098 owns them.
- Historical backfill and final freshness SLO semantics; Plan 099 owns them.
- Automatic publication. Catch-up remains reviewed and operator-triggered.

## Execution preflight and verification cadence

Execute from a fresh branch descended from the audit base; the audit checkout
itself is stale and is not an implementation base. Before editing, preserve
unrelated worktree changes, run:

```sh
git merge-base --is-ancestor ecf556a79e23b4b9374d08210a380754756f357b HEAD
git diff --name-only ecf556a79e23b4b9374d08210a380754756f357b..HEAD -- packages/db packages/domain packages/studio-api tools/pipeline-v2 apps/web scripts .github knowledge tests
```

If the ancestry check fails, STOP and rebase/replan. Re-open every cited
anchor changed since the audit base; amend this plan before implementation if
behavior, ownership, or Cloudflare contracts drifted. After each numbered
step, run `git diff --check` plus the smallest affected-package typecheck and
the focused gate below; do not defer all verification to the end.

| After steps | Minimum focused gate |
|---|---|
| 1-2 | recovery-contract and exact-route registration tests; DB/pipeline typecheck |
| 3-4 | artifact-resolver Worker tests and 0033 schema-reconciliation fixtures |
| 5-6 | selective-restore/current-signal tests and production-sized disposable D1 batch proof |
| 7 | dry-run/prove receipt validation, then separately authorized production execution |
| 8-9 | generalized HTTP smoke, receipt validation, architecture and knowledge checks |

## Implementation

### 1. Freeze the recovery contract before touching Cloudflare

Add a tracked recovery package under `packages/db/recovery/plan097/` and
strict Effect Schema contracts for:

- the pre/post D1 audit;
- the selective serving snapshot and restore SQL;
- the 0033 reconciliation decision;
- candidate exact-route registration;
- recovery artifact manifest/object inventory;
- transactional activation and selective-restore batch hashes/results;
- pre-mutation production HTTP baseline, mutation, post-activation, and
  post-rollback comparison receipts.

The audit must query `sqlite_master`, `PRAGMA table_info`, `PRAGMA index_list`,
`PRAGMA index_info`, the entire `d1_migrations` name set, release metadata,
and row counts/hashes. Checking only whether a table exists is forbidden.
Capture and hash a canonical schema snapshot containing sorted
`sqlite_master.type/name/tbl_name/sql`, every declared PRAGMA result, and the
migration ledger. A schema-only Wrangler export may be attached as
supplementary human-diff evidence only during an approved operational window;
it never replaces these checks and is never accepted as replay input.
Every receipt includes repo SHA, command version, D1 database name/id, R2
bucket, candidate release identity, inputs, counts, byte lengths, SHA-256s,
timestamps, and stage outcome; it excludes credentials and raw personal data.

Before the disposable transaction proof in Step 6, run the read-only D1 audit
and production HTTP baseline and persist a signed `plan097-preflight` receipt.
This happens even when the later batch proof STOPs, so Plan 098 can consume an
exact production schema/live-surface fingerprint instead of depending on a
receipt that only a successful Plan 097 execution could create. Immediately
before any eventual production mutation, repeat the audit/baseline and require
an exact match or an explicitly declared expected candidate difference.
The pre-authorization canonical receipt is stored in the isolated proof
environment's immutable operations bucket, and its SHA-256/signature/key are
committed and pushed as a redacted attestation. This is the durable authority
before production approval; a gitignored local copy is only a cache. After
authorization, the exact same bytes are mirrored to the production operations
prefix through the protected staged-object action. No production R2 write is
hidden inside the read-only preflight.

Add a harness assertion that rejects any Plan 097 command containing:

- `INSERT`/`UPDATE`/`DELETE` against `d1_migrations`;
- remote execution of generated `schema.sql`;
- remote application of `0000`-`0034` as an aggregate;
- a production database or bucket inferred only from a mutable binding name.

### 2. Make exact identity part of every candidate

Refactor the deterministic projection/hash logic from
`tools/pipeline-v2/src/lib/route-index-v3-recovery.ts` into a reusable builder.
Wire `tools/pipeline-v2/src/commands/map/release.ts` and the D1 export summary
to emit a collision-guarded registration for the candidate `releaseId`,
`publishedAt`, coverage, source hashes, catalog hash, projection hash, and
exact route/type/trip-type counts.

An identical retry is a no-op. Reusing a release ID with any metadata or hash
difference fails. `check-publish-completeness.ts` must require and strict-decode
this registration and prove that the route catalog replay produces the same
exact projection. Do not synthesize the 14 unresolved legacy routes, alias
`B44` and `B44+`, or copy the Plan 095 release row.

Add:

- `packages/db/test/exact-route-identity-registration.test.ts`;
- candidate-generation cases in
  `tools/pipeline-v2/test/commands/map/release.test.ts`;
- missing/mismatched registration cases in
  `tools/pipeline-v2/test/checks/publish-completeness.test.ts`.

### 3. Predeploy a release-addressed recovery artifact resolver

Add a strict recovery manifest at a deterministic, write-once key such as
`operations/plan097/releases/<releaseId>/artifact-manifest.json`. It maps every
logical dossier, capability, speed-history, spine, hourly, timeline, evidence,
snapshot, and other direct Studio read to an immutable physical key, SHA-256,
byte count, media type, and schema ID. The release ID is unique, and a second
PUT is allowed only when the existing manifest bytes/hash are identical.
Recovery bodies use the fixed content-addressed grammar
`operations/plan097/blobs/sha256/<prefix>/<sha256>.<extension>`; the manifest,
not a release-named duplicate body, binds them to this recovery release.

Before publication, deploy a compatibility reader that:

1. resolves the current release exactly as production does today;
2. loads/caches the recovery manifest for that release;
3. resolves every R2 read through its logical entry and verifies metadata;
4. falls back to today's stable key **only** when the active release equals the
   pre-audit pinned previous release and no recovery manifest exists;
5. fails closed for a new/candidate release with a missing, invalid, or
   incomplete manifest and emits structured release/logical-ID telemetry.

The resolver inventory includes every direct read in `public-api.ts`,
`studio/projections.ts`, and `studio/read-handlers.ts`. Alias candidates are
declared logical entries in the manifest rather than inferred from a missing
object. Add an architecture test that rejects unregistered direct
`ARTIFACTS.get()` calls.

Update every direct R2 load in `packages/studio-api` in the same change; a
half-migrated reader is forbidden. The map endpoint retains its verified map
catalog/manifest path, but its candidate registration joins the same D1
activation batch below. Production request input cannot select a release.

Candidate builders write those immutable content-addressed objects; they do
not overwrite the old stable aliases. Test the old release
before/after staging and prove response bytes are unchanged. Test a candidate
manifest with missing/corrupt entries and prove it cannot silently fall back.
The anonymous `/api/v1/artifacts/*` passthrough must deny the recovery
namespace and any staged physical key; only the internal resolver may fetch a
manifest member after that release becomes active. Add a leaked-key test that
returns 404/403 before activation and succeeds only through the active
release's logical artifact URL afterward. Direct bucket access stays private.
Before activation, also prove the selected cache transition prevents a prior
stable response from surviving under the candidate's release-safe cache key;
record purge/no-store/drain evidence and the applicable cache headers in the
disposable and production HTTP receipts.
Plan 098 replaces this recovery manifest lookup with its canonical D1-backed
candidate artifact locator; Plan 101 deletes the stable fallback.

For production, "write" above means render and hash the local candidate
inventory before authorization, then stream its bytes through the protected
operation after authorization. The Worker accepts no arbitrary object key:
each logical ID/hash must be present in the signed operation bundle, and the
physical key is derived from that hash. An already-present object is accepted
only after a full GET/hash match; an existing mismatch is a STOP and is never
overwritten.

### 4. Build an exact schema reconciliation, not a baseline fiction

Create `packages/db/recovery/plan097/0033_map_release_catalog_idempotent.sql`
from the tracked 0033 definition. It may contain only `CREATE TABLE IF NOT
EXISTS` and `CREATE UNIQUE INDEX IF NOT EXISTS` for `map_release_catalog`.
Before it is eligible, the pre-audit must establish one of these states:

1. table and index absent, with all other required serving objects exact;
2. table and index already byte-for-byte structurally equivalent, so no-op.

Any partial table, wrong column/nullability/index, unexplained migration gap,
or other schema drift is a STOP. Applying the recovery SQL does not mark 0033
as migrated. Record that debt for Plan 098's new migration lineage.

Add fixture-backed tests for absent, exact, partial, wrong-index, and unexpected
drift states. Apply all canonical migrations normally to an empty Worker-harness
D1 first, then prove the idempotent recovery is a no-op there.

### 5. Produce a selective, live-write-safe rollback

Derive the serving-owned table list from the delete/replace statements in
`packages/db/src/d1/seed/build-seed-sql.ts:727-795` **and** enumerate every
activation-batch mutation outside that builder. The latter includes the
candidate `exact_route_identity_release` and newest-by-`published_at`
`map_release_catalog` rows. Assert in a harness test that every mutation target
is classified. Snapshot replaced rows, their ordered canonical hashes, schema
fingerprints, and the exact pre-cut map/exact election. Generate deterministic
restore statements that remove the failed candidate map/exact rows, restore
replaced rows, and put the former `route_batch_status` activation rows last
inside one atomic restore batch. After rollback, both Studio and map “latest”
queries must elect the old release.

The recovery renderer must also prove that every deleted
`route_scorecard_citation` row is either reproduced from a strict candidate
input or preserved byte-identically. The current seed's zero citation insert
count is not eligible for production. Candidate `route_batch_status` is
rendered only after all built-route and issue children and is the absolute last
activation statement.

Explicitly exclude and assert untouched:

- `identity`, `identity_session`, `studio_actor_role`;
- `alert`, `saved_search`, `public_comment`;
- `route_observed_reliability_summary`, which is wholly owned by
  `buildD1AppendixSeedSql` during this recovery;
- `route_month_source_status` rows whose `source_scope = 'reliability'` and
  `source_id` is one of `observedHeadways`, `bunching`, or
  `waitTimeReliability`, also owned by that appendix;
- `d1_migrations` and Cloudflare internals.

The unmodified full seed currently deletes the whole target month from both
tables, so merely omitting them from rollback is unsafe. The recovery renderer
must remove all full-seed mutations for observed reliability summaries and
replace the route-month-source-status delete/insert with a predicate/filter
that preserves the three appendix-owned reliability sources. Snapshot those
protected rows and require their ordered bytes/hash to be identical before and
after activation **and** selective rollback. Plan 098 then performs the
permanent reviewed/current table split.

No stable R2 key is overwritten, so pointer/release rollback naturally reads
the untouched old aliases. Candidate immutable objects may remain unreachable.
The primary rollback is the selective serving restore batch. Time Travel is
recorded as a last-resort bookmark and requires a write freeze plus separate
operator authorization.

### 6. Derive and replay one complete candidate locally

Use the freshness ledger and upstream availability probes to select the latest
complete partition for every critical dataset. The candidate may expose
different dataset ranges; it must not clip them to a global intersection.
If the current v1 release contract cannot express those ranges, record the
full matrix in the recovery receipt and use only the route-speed range as its
explicit compatibility summary. Plan 099 replaces that compatibility field.

Build with one immutable release identity across D1 export, Studio artifacts,
dossiers, exact-route registration, map manifest, and receipt. Strict-decode
**every** publishable dossier, route capability, speed history, hourly profile,
timeline, map manifest, and D1 seed summary. Replay canonical migrations,
the exact ordered activation batch—seed rows, exact registration, map
registration, and `route_batch_status` last—into a fresh local D1 and run the
Worker harness against the candidate R2 manifest.

No release occurs if a critical dataset is unknown/incomplete, the candidate
is older than production, any body has an empty-state placeholder caused by
missing publish data, or local schema-v3/detail/history/map reads fail.

Implement exactly one recovery transport: an operator-only Worker operation at
`apps/web/src/worker/operations/plan097-recovery.ts` using the production D1
binding's `D1Database.batch()`, invoked only by
`tools/pipeline-v2/src/commands/publish/recovery.ts`. The CLI uses the existing
two-part registry path `publish recovery` and strict actions `dry-run`,
`prove`, `activate`, `resume`, and `rollback`. The protected operation accepts
only an allowlisted operation ID plus receipt/bundle hashes; it downloads and
strict-decodes the immutable R2 bundle and never accepts arbitrary SQL, object
keys, database names, or release selectors from a request. Require service
authentication/Cloudflare Access, a dedicated one-time operations binding,
and structured statements/parameters rather than shell SQL interpolation.
Disable the operation route/binding after the recovery closes.

The production bundle need not pre-exist in production R2. Before activation,
the same operation exposes only two additional closed actions: stage one
manifest-declared content body and finalize the manifest after all members
verify. The request carries the operation ID, logical ID, declared hash, and
body bytes; the Worker resolves those fields against the signed bundle and
derives the R2 key. It rejects unknown logical IDs, duplicate logical mappings,
caller-supplied physical keys/buckets, hash or length drift, and a manifest
finalization with any missing member. Disposable proof exercises these exact
actions in the isolated proof bucket.

Cloudflare documents that binding batches are transactions and roll back on a
failed statement in the
[D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).
The current row-at-a-time seed is ineligible. Add a recovery-only set-based
renderer that enforces the current-signal exclusions above, groups remaining
rows into deterministic multi-row INSERT/UPSERT statements below D1's 100 KB
statement limit, keeps total statements below the account's
query-per-invocation limit and every statement at or below D1's bound-parameter
limit, and preserves exact per-table count/hash checks.
Do not concatenate unsanitized values or weaken the existing SQL escaping.

Prove the exact production-sized compacted activation and restore bundles
through that same Worker operation against an explicitly named disposable
remote D1 with failure injection before requesting production approval. The
proof environment must have no route or binding to production. Capture
original/compacted statement count, bytes, duration, rows, and documented
limits from
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/). If either
bundle cannot commit atomically inside the 30-second whole-batch limit, STOP
and execute Plan 098 before catch-up; do not fall back to sequential
`d1 execute` or pretend 19,739 statements are one supported transaction.

### 7. Execute the reviewed in-place recovery

Do not authorize this execution until the release-aware checker in Step 8 is
implemented. Before any production Worker deploy or serving schema, data, or
artifact mutation, run it against the active production release and persist
its strict-decoded baseline receipt under the immutable operations prefix.
The baseline is evidence, not permission to ignore a pre-existing failure: if
the active release cannot be identified or any protected live-write/schema
fingerprint cannot be captured, STOP before mutation.

After an operator reviews the immutable candidate and grants the execution
token, use only the recovery CLI/Worker transport and explicit resource names.
The runbook must provide these exact command shapes:

```sh
bun --filter @bp/pipeline-v2 cli -- publish recovery --action dry-run --candidate <candidate-id>
bun --filter @bp/pipeline-v2 cli -- publish recovery --action prove --operation <operation-id> --proof-env plan097-proof
bun --filter @bp/pipeline-v2 cli -- publish recovery --action activate --operation <operation-id> --receipt-sha256 <sha256>
bun --filter @bp/pipeline-v2 cli -- publish recovery --action resume --operation <operation-id>
bun --filter @bp/pipeline-v2 cli -- publish recovery --action rollback --operation <operation-id> --receipt-sha256 <sha256>
```

The state machine uses this order:

1. revalidate the signed preflight production HTTP baseline against the active
   release, recording endpoint
   result, schema/contract ID, safe public-body hash, release/coverage fields,
   request ID, and Cloudflare Ray when supplied; then confirm `wrangler d1
   info`, capture a Time Travel bookmark, and run the read-only pre-audit;
2. build and verify the atomic selective D1 rollback package;
3. apply only the eligible idempotent 0033 recovery SQL, if needed, then
   repeat the schema audit;
4. stream every signed-bundle member through the protected staged-object
   action, finalize the write-once recovery manifest only after all members
   verify, and prove the active old release still returns identical bytes;
5. submit **one** transactional D1 activation batch containing all candidate
   serving-row replacement, its exact-route registry row, its verified map
   catalog row, and `route_batch_status` as the final statement;
6. require every batch statement result to succeed and verify the resulting
   D1 bookmark/state before considering activation complete;
7. run post-audit and production smoke.

Before step 4, prove anonymous recovery-namespace denial in the deployed
reader. Before step 5, prove the map release selected for the candidate equals
the Studio release and that the legacy push-on-main workflow has no recovery
mutation capability.

Do not use the legacy shell command for production data mutation; it cannot
prove the transactional/release-addressed contract. A failure before step 5
leaves only unreachable immutable objects. A failed activation batch commits
nothing. A failed post-activation smoke triggers the atomic selective restore
batch immediately; the old activation rows are last inside that batch, then
the old-release smoke repeats. That contingency ends Plan 097 as
`rolled_back`/STOP; on the successful path no production rollback is performed
and the freshness-derived candidate remains active.

### 8. Generalize production verification

Replace the Plan-095-only smoke with a release-aware checker covering:

- `/api/v1/status` and strict release/coverage decoding;
- schema-v3 route index and exact expected count;
- rich, sparse, `B44`, and `B44+` detail;
- non-null dossier, History, speed history, hourly profile, and timeline;
- map manifest plus representative geometry SHA-256;
- target coverage in each applicable dataset;
- absence of legacy empty-state strings;
- unchanged existence and schema fingerprints of protected live-write tables.

Record request IDs and Cloudflare rays when supplied, but never cookies,
tokens, emails, session rows, or response bodies containing user state.

The checker has baseline, post-activation, and post-rollback modes. It compares
unchanged surfaces against the baseline and evaluates explicitly declared
candidate changes against expected values. The disposable A→B→A proof compares
rollback with its proof-environment baseline. If the production contingency
rollback is used, it must restore the production baseline release contracts
and safe public-body hashes. The checker never persists authenticated or
user-specific bodies.

### 9. Close the recovery honestly

Store the canonical receipt under the immutable operations R2 prefix and its
hash/key in a `## Completion receipt` section appended to this plan file when
the plan is actually complete. A local ignored file is only a cache. Record
actual D1 rows read/written, R2 HEAD/GET/PUT requests and bytes, duration, cost
estimate vs actual, candidate/previous release IDs, rollback package hashes,
and every baseline/post-activation/post-rollback comparison result.

Mark Plan 097 DONE only after the disposable A→B→A rollback proof and the
freshness-derived candidate's production smoke both pass. If production
contingency rollback ran, retain the signed evidence but leave the plan
non-DONE for the Plan 098 continuation. Add
an explicit gate to the runbook: no later artifact-contract/schema cutover may
use the recovery path; Plan 098 must land and activate first.

## Implementation checkpoint (2026-07-23; not completion evidence)

The pushed Generation 17 branch now contains the local recovery contract,
release-aware reader/checker, exact 0033 reconciliation, selective restore,
compacted atomic batches, protected Worker transport, measured per-operation
receipts, closed proof bootstrap, proof-only stable aliases, exact CLI command
shapes, isolated Wrangler templates, durable proof-summary receipt, and
terminal completion-receipt implementation. Worker-harness coverage exercises
signed preflight, failed activation atomicity, B election, selective A restore,
protected fingerprints, proof summary, successful completion, and rollback.

The immutable local candidate remains
`pub_20260723T030155231Z` (`2023-04` through `2026-05`), with activation bundle
SHA-256
`ce3f84ffb9072dc99ee84125dc1d4911a7e37979c6ecb897bfd131fed8068ad7`,
artifact-manifest SHA-256
`163495fead214c35f42fa3183b224ca1ea20431eed28447e2e9129021d5611e9`,
1,837 strict-verified immutable bodies totaling 253,918,871 bytes, and 121
compacted activation statements representing 24,996 rows. Its exact route
universe is 375; the schedule-backed Studio selection is 348 routes, with 315
complete and 33 explicitly excluded under the candidate policy.

A read-only anonymous production check identified active release
`pub_20260605T183601689Z`, exact route count 375, and one pre-existing legacy
map-manifest 503. That local observation is not the required signed/durable
preflight and is not production authorization.

The continuation audit found and repaired a predeploy gap before it could
reach Cloudflare: the tracked production Worker config had not enabled the
recovery resolver or pinned the previous release, so a D1 activation would
have continued reading old stable aliases. The branch now enables the resolver
for `pub_20260605T183601689Z`, requires `no-store` on every successful checker
response, makes the disposable proof exercise the resolver, disables operation
preview URLs, and validates the Cloudflare Access JWT signature, issuer,
audience, RS256 algorithm, and service-token identity. A fresh anonymous check
at `2026-07-23T04:37:19Z` still elected the pinned release and observed the
pre-existing map-catalog 503. None of these production-config changes has been
deployed at that checkpoint. The protected reader predeploy and its
86,400-second prior-cache drain (or an evidenced authoritative purge) are now
explicit gates before the signed preflight. The protected workflow now
captures the prior and deployed Worker versions, writes a strict hash-covered
reader receipt, uploads it as a GitHub Actions artifact, and automatically
restores the captured stable version if any postdeploy D1 audit or HTTP proof
fails.

The later remote gates remain deliberately open. The local Wrangler login is
expired and the Cloudflare service/bootstrap/signing/proof credentials remain
unavailable locally. The protected GitHub environment supplied only the
credential needed for the separately approved reader deployment recorded
below. No signed D1 preflight, disposable remote proof, serving-data/artifact
mutation, or canonical completion receipt has been fabricated. Plan 097
remains **IN PROGRESS**, all acceptance boxes remain unchecked, and the fresh
production mutation token has not been requested.

### Failed-closed protected reader predeploy (2026-07-23; not completion evidence)

PR #101 head `4c937a3fa7afa86625b9e81678ccb0d67f535be1` merged to
`main` as `14fb1472ea210bb66ace7bbe3348ee7202ee35ec`. GitHub Actions
run 332 (`29998095226`) passed the verify job, pre/post read-only D1 audits,
the Worker build/deploy, and the existing Plan 095 production smoke. The
strict Plan 097 reader proof then failed because
`/api/v1/status?plan097=829f626b-9b98-493d-8f65-97e5b67d9f12` did not return
the required `Cache-Control: no-store`; it still exposed
`public, max-age=60, stale-while-revalidate=86400`.

The workflow had moved production from stable Worker version
`f2067a1d-6c4f-4e00-abd4-43fea7469f4e` in deployment
`845cb0c0-ad27-438d-9ad0-3d22062edf89` to attempted version
`aef011c3-0e48-4c35-92f7-3516a2259afe` in deployment
`affeec34-1e5d-4ce6-b6c8-6ad20b82c77c`. Its automatic failure path then
created deployment `f5082ef1-800b-4298-8c4f-4acc22f6a8a0`, restoring
`f2067a1d-6c4f-4e00-abd4-43fea7469f4e` to 100% with message
`Plan 097 reader predeploy verification failed`.

The pre/post Actions artifact is ID `8559859695`, archive SHA-256
`c005242d4e6233bde737940b5cd5affb34f29427b40ae786caa33d5f95f8bfb1`;
the rollback artifact is ID `8559861095`, archive SHA-256
`389227348728a504cc4ad688e07451f290dcddd5bdbfe45a157764f1662f4977`.
Both expire 2026-10-21. The strict checker failed before it could serialize
`plan097-reader-deploy.receipt.json` or its adjacent SHA-256 file, so these
are deployment-attempt and rollback evidence, not a successful reader receipt,
signed preflight, or completion receipt.

No production serving-data, serving-schema, or candidate-artifact mutation
occurred; only the Worker deployment and automatic Worker rollback ran.
No endpoint first proved `no-store`, no authoritative purge was recorded, and
the 86,400-second cache-drain clock did not start. The signed preflight,
disposable A→B→A proof, fresh production mutation token, and candidate
activation remain outstanding. Plan 097 remains **IN PROGRESS**, all acceptance
boxes remain unchecked, and Plan 098 remains TODO.

The follow-up reader gate now emits the Cloudflare version-metadata ID on every
response, records version/cache/Ray/age evidence, keeps failed attempts in a
separate strict receipt, disables public preview URLs and entrypoint caching,
and changes the protected workflow to upload → prior 100%/candidate 0% →
exact-version override proof → candidate 100% → ordinary-traffic proof.
The initial state must still be one prior version at 100%. Production runs are
serialized and non-superseding; a pre-mutation attempt marker makes ambiguous
staging failures and cancellation cleanup restore that captured version.
Durable success decode requires every endpoint and namespace observation to
match the top-level Worker version. Persisted Wrangler control-plane evidence
is a strict personal-data-free allowlist, and both attempt and rollback
artifacts have adjacent hash manifests. The staged projection must prove
exactly prior@100%/candidate@0%, rollback capture must prove prior@100%, and
bounded remote/proof/cleanup step timeouts sit within a larger job timeout
reserve. Rollback state is still captured and hashed when the rollback client
or exact-state validation fails. This follow-up was deployed only after its
exact pushed SHA received the fresh protected-reader approval; that approval
did not authorize any D1/R2 application-data mutation.

### Successful protected reader predeploy and cache drain (2026-07-23; not completion evidence)

PR #102 head `33f5f59db2db984c1b77d423566eeef2cd61b2ca` passed
pull-request run 333 (`30001107751`) with its production job skipped. After a
fresh approval bound to that exact head, GitHub merged it to `main` as
`b25542b0a735636e7051be8fb70893499671366f`. Protected push run 334
(`30028518714`) then passed verification and the complete reader-deploy job.

The run captured prior deployment
`f5082ef1-800b-4298-8c4f-4acc22f6a8a0` with Worker version
`f2067a1d-6c4f-4e00-abd4-43fea7469f4e` at 100%. It created staged deployment
`b96f5693-852f-44e5-acfa-0998bc1a1c62` with that prior version at 100% and
candidate `8c117bac-3813-4cfc-9d19-c94c4987a165` at 0%. The exact-version
override receipt at `2026-07-23T17:15:52.705Z` passed before promotion.
Deployment `b588e193-aab3-42d4-8f8f-017cf4052adb` then placed only the
candidate at 100%, and the ordinary-traffic receipt passed at
`2026-07-23T17:16:05.839Z`. Every recorded response, including the anonymous
operation-namespace 404 and known baseline map-manifest 503, came from that
exact Worker version. All 14 successful public endpoints returned
`Cache-Control: no-store`; the active release remained
`pub_20260605T183601689Z` with 375 exact routes.

The postdeploy read-only D1 parity audit and Plan 095 production smoke passed.
Rollback remained skipped. No production D1/R2 application data, serving
schema, release pointer, immutable candidate body, or recovery manifest was
mutated. A separate anonymous check at `2026-07-23T17:18:16Z` reconfirmed
status 200, `no-store`, release `pub_20260605T183601689Z`, Worker version
`8c117bac-3813-4cfc-9d19-c94c4987a165`, and operation-namespace 404.

Actions artifact `8572360112`,
`plan097-reader-predeploy-b25542b0a735636e7051be8fb70893499671366f`,
expires `2026-10-21T17:13:47Z`. Its downloaded archive independently hashes
to `56410e4a85f8228c17367e5463ef6eeee294549413d553f9943b594da4b3b7d5`,
matching GitHub's artifact digest. The adjacent manifest verified every member:

- ordinary receipt:
  `d1491c88ed93df8ed646a8c81ea7f37f64737b6b5537fb3727713179f8cef8d1`;
- staged receipt:
  `7732f180b4de624f983d499d38c4ea84f5a69919c205503fbd5282f5a9e3dcfc`;
- post deployment:
  `b968ea7cb0fdbb2554cff6341612ae152334c866c1f19cf4f40e2298fd3890f7`;
- pre deployment:
  `a49cb883f54d2edade6ef6d3c69b99a1f256306fa380f7e3d20186f8043b7047`;
- staged deployment:
  `d8139baa2f9bb369c296f892041184bdbe9e90be3d98f1686139cbf8acf6dadf`;
- allowlisted version projection:
  `6df769ae5814ddb4ef2b4b30c0a4518f49d2c4deefe4cd6329e3ad52f2f667f9`.

No authoritative purge was requested or executed. The conservative drain
starts at the ordinary-traffic proof instant and completes no earlier than
`2026-07-24T17:16:05.839Z`. The signed read-only preflight and disposable
proof remain prohibited until a post-drain checker repeats this exact
release/version/cache posture. This reader success is not the signed
preflight, disposable proof, production mutation token, candidate activation,
or Plan 097 completion receipt. Plan 097 remains **IN PROGRESS** and Plan 098
remains TODO.

## Acceptance criteria

- [ ] The production database is preserved; protected live-write/current-signal
      tables are neither seeded nor restored by Plan 097.
- [ ] Production schema is audited by exact columns/indexes and the legacy
      migration ledger is recorded but never altered.
- [ ] Generated aggregate `schema.sql` and canonical migrations 0000-0034 are
      never executed against populated production.
- [ ] The only allowed schema recovery is a tested, idempotent exact 0033
      table/index reconciliation after a fail-closed pre-audit.
- [ ] Every candidate carries a collision-guarded exact-route registry row and
      schema-v3 never reuses or fabricates Plan 095 identity.
- [ ] Every artifact strict-decodes, uses an immutable recovery-manifest key,
      and is uploaded/hash-verified without changing old stable aliases; the
      active old release is byte-identical throughout staging.
- [ ] Candidate serving rows, exact/map registrations, and activation commit in
      one remotely proven D1 transaction; injected failure commits nothing.
- [ ] Every remote mutation uses the single protected `publish recovery`
      CLI/Worker path; the operation accepts hashes/IDs rather than arbitrary
      SQL, and its production access is disabled after closure.
- [ ] The exact production-sized disposable A→B→A proof shows atomic selective
      rollback restores only generated serving tables and the old release
      passes smoke without R2 restoration or rewinding user state; production
      uses that rollback only as a failed-smoke contingency.
- [ ] Production serves the freshness-derived candidate, including non-null
      dossier and map data, with truthful dataset-specific evidence in receipt.
- [ ] The durable receipt reports actual mutations, bytes, costs, hashes, and
      HTTP evidence without secrets or personal data.
- [ ] A durable production HTTP baseline exists before the first remote
      mutation and post-activation compares against it. If production
      contingency rollback runs, its receipt also compares against that
      baseline; the required disposable A→B→A proof compares against its own
      proof-environment baseline.
- [ ] The signed read-only preflight schema/live-surface receipt exists even on
      the atomic-limit STOP branch and is consumable by Plan 098.

## Verification

```sh
bun test packages/db/test/map-release-catalog.test.ts packages/db/test/exact-route-identity-registration.test.ts
bun test tools/pipeline-v2/test/lib/serving-release-recovery.test.ts tools/pipeline-v2/test/commands/map/release.test.ts tools/pipeline-v2/test/checks/publish-completeness.test.ts tools/pipeline-v2/test/publish-serving-release-order.test.ts --timeout 5000
bun run test:worker
bun run check:types
bun run check:style
bun run check:architecture
bun run check:knowledge
```

Do not fabricate remote results when credentials are unavailable. Record the
credential boundary and leave the plan TODO until an authorized operator run
produces the remote receipts.

## STOP conditions

Stop before mutation if production differs from the exact audited schema
envelope; the durable pre-mutation HTTP baseline cannot identify the active
release or fingerprint every protected surface; the signed read-only preflight
receipt was not persisted before disposable proof; 0033 is partial rather than
absent/exact; the rollback snapshot is
incomplete; any protected/live-write table appears in seed or restore SQL;
the candidate lacks exact identity; `B44`/`B44+` collapse; any critical source
is unknown/incomplete; any R2 body fails hash verification; the old release
changes during R2 staging; the exact activation/restore bundle cannot fit and
pass a disposable-remote transactional proof; or the requested procedure
requires sequential seed execution, stable-key overwrite, ledger surgery,
aggregate schema execution, a shadow D1, Time Travel without a write freeze,
fabricated data, relaxed decoding, or automatic publication.
