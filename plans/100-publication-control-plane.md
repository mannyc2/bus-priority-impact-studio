# Plan 100: Resumable publication control plane and drift alarms

## Status

- **State**: TODO
- **Priority**: P1
- **Effort**: L
- **Depends on**: Plan 098 activated; Plan 099 implementation complete with a
  built immutable candidate manifest and signed `activation_ready` receipt
- **Audit base**: `origin/main@ecf556a79e23b4b9374d08210a380754756f357b`
- **Suggested branch**: `codex/100-publication-control-plane`

## Outcome

Replace the shell/checklist publication path with one typed, resumable state
machine that validates an immutable candidate, applies forward migrations,
stages R2 and D1, proves candidate HTTP parity, pauses for reviewed approval,
activates last, smokes production, and rolls back the pointer on failure.

Every stage writes a schema-validated durable receipt. A no-data-change run is
an explicit no-op: it uploads no content blobs, creates no release, and does
not move the active pointer. A daily workflow detects freshness drift and
opens/updates one deduplicated GitHub issue; it never publishes data.

The first successful run may activate Plan 099's full-history candidate. That
single production receipt jointly completes Plan 099's activation criterion
and Plan 100's first end-to-end proof; there is no circular requirement that
Plan 099 already be active before this control plane exists.

## Operating boundary

The ignored local corpus is not available in normal CI:
`.gitignore:22-27` excludes raw data, artifacts, exports, and local databases.
ADR-0017 also requires deliberate publication rather than heavy Worker cron
jobs. Therefore the control plane has two execution profiles under one command:

```text
operator/local: validate → migrate → upload → stage D1 → verify → preview parity
                                      │
                                      ▼ immutable candidateId + receipt hash
approved CI:       re-verify remote state → CAS activate → smoke → finalize
```

The same state machine and receipt drive both profiles. CI does not rebuild or
silently substitute local data. GitHub environment approval authorizes only
the pinned candidate/receipt and the recorded rollback target.

## Verified current boundary

- `scripts/publish-serving-release.sh:5-17` exposes `--month` and manually
  sequences generated schema, seed, R2, and registration.
- `tools/pipeline-v2/test/publish-serving-release-order.test.ts` locks the
  unsafe D1-before-R2 sequence rather than a resumable state machine.
- `.github/workflows/ci.yml:71-147` mixes Worker deployment with direct 0032,
  0034, and Plan 095 SQL execution; it does not perform general release parity.
- `knowledge/wiki/engineering/cloudflare_operations_runbook.md:69-98` is a
  one-time command checklist, while `:209-234` correctly says a code deploy
  does not publish D1/R2 data.
- `tools/pipeline-v2/src/commands/publish/r2-artifacts.ts:498-520` already
  reports upload counts/bytes and is a useful stage primitive.
- There is no scheduled freshness workflow; current CI triggers are
  push/pull-request/manual only.

## Binding decisions

1. Publication remains reviewed and operator-triggered. Daily automation only
   detects, reports, and alerts.
2. One command owns all state transitions; individual low-level commands may
   remain for development but cannot activate production independently.
3. Forward production schema changes use Plan 098's Wrangler migration stream
   only. No aggregate `schema.sql`, direct migration-file execution, or ledger
   edits are permitted.
4. Activation is Plan 098's CAS pointer operation and is always the last
   production mutation before smoke. Routine rollback flips that pointer only.
5. No-data-change means no new release. Do not add `--force-release` in this
   plan; a future need requires a separate reviewed design and audit trail.
6. Candidate preview may select a staged candidate only in a separately bound
   preview Worker. Dynamic production APIs reject candidate/release overrides;
   Plan 098's membership-checked, release-qualified immutable artifact URL is
   the only read-only exception for active/retained-public releases.

## Execution preflight and verification cadence

Execute from a fresh branch descended from the audit base; the audit checkout
is stale and is not an implementation base. Preserve unrelated worktree
changes, then run:

```sh
git merge-base --is-ancestor ecf556a79e23b4b9374d08210a380754756f357b HEAD
git diff --name-only ecf556a79e23b4b9374d08210a380754756f357b..HEAD -- packages/db packages/domain packages/studio-api tools/pipeline-v2 apps/web scripts .github knowledge tests
```

If ancestry fails, STOP and rebase/replan. Re-open every cited anchor changed
since the audit base and amend the plan for behavioral, CLI, workflow, or
migration-contract drift. After each numbered step run `git diff --check`, the
smallest affected-package typecheck, and the focused gate below.

| After steps | Minimum focused gate |
|---|---|
| 1-2 | state-transition, receipt-chain, resume, redaction, and dry-run tests |
| 3-4 | semantic no-op plus v2 checksum/preflight/migration-wrapper tests |
| 5-7 | closed R2/D1 staging, preview parity, CAS activation, and rollback fault injection |
| 8-9 | workflow capability/trigger harness and deduplicated issue/report-CAS tests |
| 10 | command-registry examples, architecture, knowledge, and prepush checks |

## Implementation

### 1. Define the state machine and receipt first

Add a command family under
`tools/pipeline-v2/src/commands/publish/serving-release/` with an injectable
orchestrator and strict Effect Schema contracts. Required ordered states:

```text
created
  → candidate_validated
  → migration_preflight_passed
  → active_compared
  → migrations_applied
  → blobs_uploaded
  → d1_staged
  → candidate_verified
  → preview_parity_passed
  → awaiting_approval
  → activated
  → production_smoke_passed
  → complete
```

Terminal alternatives are `no_op`, `rolled_back`, and `failed_before_activation`.
A receipt contains:

- operation ID and receipt schema/command version;
- repo SHA and candidate manifest key/hash/content-derived ID;
- explicit account, database name/id, bucket, Worker environment, preview URL;
- active release/pointer generation observed at start;
- migration stream/table and applied/pending names;
- each stage's started/completed time, attempt count, result, metrics, and
  immutable evidence references;
- end-to-end elapsed time, executable-stage time, approval-wait time,
  foreground operator-active time derived from CLI/workflow interaction
  windows, and counts/reason codes for starts, approved continuations, resumes,
  overrides, rollback actions, and remedial interventions;
- D1 statement/row counts, R2 request/byte counts, HTTP checks/request IDs;
- candidate semantic fingerprint, release/rollback IDs, CAS generations;
- error class/retryability and redacted diagnostic summary;
- receipt hash and previous receipt hash for an append-only chain.

Never include tokens, cookies, environment dumps, personal rows, or signed
URLs. Validate/redact subprocess output before persistence. When an operator
time component cannot be observed reliably, record it as unknown with the
measurement method; never infer active time from total elapsed time.

After every successful transition, write the canonical receipt to an immutable
operations R2 key and record its key/hash in the candidate/operation D1 row.
Upload it as a GitHub artifact when running in Actions. A local file under
ignored `data/` is only a resumable cache, never the authoritative receipt.

### 2. Make resume and retry content-safe

The command accepts a candidate manifest plus optional `--resume <operationId>`
and `--through <stage>`. On resume it downloads and strict-decodes the durable
receipt, then re-verifies:

- candidate manifest hash and semantic fingerprint;
- repo/command compatibility;
- explicit Cloudflare resource identities;
- current pointer ID/generation;
- Plan 098 pointer-transition event for this operation/idempotency ID;
- completed R2 object hashes and D1 candidate counts/hashes;
- migration head and preview code version.

If an input or remote fact that a completed stage depended on changed, refuse
resume and require a new operation. Idempotent retries do not repeat verified
PUTs, seed rows, migrations, or activation. Failure injection after every
transition must prove this behavior. In particular, if activation committed
but the HTTP response or next receipt write was lost, resume must match the
operation-keyed transition's full candidate/from/to/generation/manifest tuple,
adopt its recorded result, and continue at production smoke. A pointer advance
without that exact event is a competing stale CAS and fails.

Run child processes with argument arrays and captured/redacted output; do not
interpolate shell strings. `--dry-run` performs read-only resolution, cost
preview, stage plan, and receipt validation without remote writes.

### 3. Enforce semantic no-op before writes

Plan 098 candidate metadata and Plan 099 dataset/source receipts produce a
semantic **input** fingerprint over every source snapshot/hash, coverage/gap,
route universe, relevant config, builder/algorithm/schema version, and
exact-identity input/projection. It excludes operation clocks, provenance-only
commit IDs, serialized seed bytes, and other output-envelope volatility.
Compare it with the active candidate before migration/data writes.

If equal:

- emit a durable `no_op` receipt referencing the active release;
- perform zero content-blob PUTs and zero serving-row writes;
- do not mint a release ID or update the pointer;
- report read/check costs separately from upload bytes.

This branch occurs after read-only migration/schema preflight but before any
pending migration is applied. Schema maintenance that must run without a data
change is a separately reviewed migration operation, not a disguised publish.

A build timestamp, receipt timestamp, reordered JSON object, or rerun alone
cannot defeat no-op detection. Any mismatch in semantic inputs proceeds as a
new candidate and is itemized in the receipt. Plan 101 makes all lower-level
builders byte-deterministic and minimizes the changed object set. Until then,
if the semantic input fingerprint matches but regenerated physical hashes do
not, still take the no-op branch and record a determinism defect for Plan 101;
do not publish operation-only byte churn.

### 4. Verify and apply migrations through one path

Resolve the immutable D1 database name/id and require Plan 098's exact v2
lineage: `packages/db/migrations/d1-v2/`,
`packages/db/wrangler.d1-v2.jsonc`, and `bp_d1_migrations_v2`. Before invoking
Wrangler, validate the complete local stream against
`packages/db/migrations/d1-v2/checksums.json` and the checksum manifest recorded
by the first-v2-apply receipt; fail on any missing, modified, reordered, or
extra file. Wrangler's list proves applied names/times only, so compare that
name sequence with the validated local stream and fail on unknown or out-of-
order ledger rows or a preflight schema mismatch.

Only after active comparison establishes a non-no-op candidate, and when
pending forward migrations are compatible with the deployed expand reader,
invoke `bun --filter @bp/db db:migrate:d1:v2:remote`; that wrapper pins the v2
config/database and runs the Wrangler list/apply flow. Then repeat checksum,
applied-name, and schema checks. Local tests use
`bun --filter @bp/db db:migrate:d1:v2:local`. The orchestrator must not assemble
a config-free `wrangler d1 migrations` invocation.

The orchestrator must not execute SQL from `packages/db/migrations/**` via
`d1 execute`; must not execute exported `schema.sql`; and must never alter a
migration ledger. Add a repository harness that scans TypeScript, shell, and
workflow files for those remote paths. Keep the bounded Plan 097 recovery as
historical evidence, not an available steady-state subcommand.

Code/data ordering is explicit:

1. deploy expand-compatible Worker code through normal CI;
2. apply additive migration through the publication command;
3. stage/verify candidate;
4. activate only after preview parity;
5. contract old readers only in a later code deploy after rollback retention.

### 5. Stage immutable R2 and candidate-scoped D1

Use Plan 098 manifest entries as a closed upload set; do not recursively upload
all `studio/` or `map/`. For each physical key, verify hash-shaped identity and
expected bytes, HEAD/GET existing objects safely, PUT only absent blobs, and
GET/hash-verify new uploads. Never overwrite or delete a physical object.

Then stage candidate-scoped D1 rows and metadata without touching the active
candidate or live/current tables. Compare actual counts/hashes to the manifest
and run all readiness checks. A failed/partial stage remains invisible and
resumable. Record real R2 Class A/B operation counts, bytes, D1 rows read/
written, elapsed time, and the repository's current Cloudflare rate snapshot.

### 6. Prove candidate parity over HTTP before approval

Deploy or address a nonproduction preview Worker with the same code version,
D1, and R2, but a configuration-injected candidate ID. Candidate selection is
not a query/header accepted by production. Protect preview with Cloudflare
Access or an equivalent short-lived service credential, disable public/indexed
discovery and shared-cache leakage, and redact that credential from all
receipts/logs. Anonymous preview access is a failed parity environment.

Run an HTTP-only parity suite covering:

- strict `/api/v1/status` and Plan 099 dataset coverage/freshness;
- schema-v3 route list, rich/sparse/B44/B44+ details;
- dossier, History, speed history, hourly, timeline, interventions/evidence;
- map manifest and representative geometry hash;
- auth-required endpoint behavior without recording identity data;
- current-signal behavior remaining independent of the candidate;
- release consistency: preview response envelope names the candidate preview
  identity consistently while production remains on the old release.

Classify failures as code contract, missing/corrupt artifact, D1 projection,
coverage/SLO, auth/environment, or transient network. Do not turn decode/
JSON/R2 exceptions into nullable data; log structured error code, logical
artifact ID, candidate ID, and request ID without sensitive payloads.

Only `preview_parity_passed` may transition to `awaiting_approval`. Generate
and stage a final candidate-bound Plan 099 readiness report and include its ID/
hash in the activation intent; the CAS-triggered release row adopts it as the
initial status evidence, so production does not become spuriously `unknown`
between activation and the next daily run. Print a
compact approval packet: candidate diff, freshness matrix, artifacts/bytes,
costs, migration result, preview evidence, old release, rollback target, and
exact activation command.

The local preparation command owns this non-mutating transition: after the
readiness report, activation intent, and approval packet are durably written,
it records the `awaiting_approval` receipt and stops. This state means evidence
is ready for review, not that approval was granted. The protected workflow is
the only actor that may consume that exact receipt after environment approval.

### 7. Activate under an approved GitHub environment

Add a dedicated manual workflow such as
`.github/workflows/publish-serving-release.yml` that accepts only candidate ID,
operation ID, and receipt hash. It downloads nothing from an untrusted branch,
checks out the audited main SHA recorded by the receipt, authenticates through
the protected production environment, downloads/re-verifies the remote
receipt and candidate, and resumes at `awaiting_approval`.

The workflow re-runs remote readiness and pointer-generation checks, mints the
activation-time `releaseId`/`publishedAt`, then performs Plan 098's CAS pointer
update. It runs the production HTTP suite immediately.

If smoke fails after activation, the already-authorized contingency performs
one CAS rollback to the recorded previous release and smokes that release. The
workflow ends failed/`rolled_back` and leaves the candidate for diagnosis; it
does not reseed, overwrite R2, invoke Time Travel, or retry activation blindly.

Never trigger this workflow from a schedule, push, or pull request. A normal
Worker code deploy remains separate and cannot publish data.

### 8. Replace one-off CI recovery with durable parity

After the generic path has successfully activated and rolled back a candidate:

- remove direct 0032/0034/Plan 095 SQL execution from `.github/workflows/ci.yml`;
- retain a read-only post-code-deploy production parity check that validates
  the current pointer and cross-surface contracts;
- retain local Worker/D1 migration and exact-identity tests;
- fail if a code deploy requires a pending incompatible D1 migration;
- require production-completion claims to cite operation, activation,
  migration, candidate, smoke, and (if used) rollback receipt hashes.

The old `scripts/publish-serving-release.sh` becomes a thin deprecation error
pointing to the typed command, then is removed in Plan 101 after all runbooks
and callers migrate.

### 9. Add the daily drift alarm without auto-publication

Add `.github/workflows/data-freshness.yml` on a daily UTC schedule plus manual
dispatch. It runs Plan 099's read-only detector/audit, stores canonical report
and probe receipts, and compares detector-run age, dataset lag, seven-day
deadlines, unknown-critical states, and active candidate integrity.

After strict validation, the workflow may perform one narrowly scoped
operational-metadata write: append the report to the operations R2 namespace
and update Plan 099's current-signal latest-report catalog. That makes public
status current without changing any dataset artifact, candidate row, release,
or active pointer. The catalog update compare-and-swaps the prior report ID and
refuses a report bound to a stale active release. This exception is not data
publication and gets its own receipt/least-privilege credentials.

Healthy closes the one bot-owned issue if open. Attention/breach/unknown opens
or updates one deduplicated issue keyed by a stable marker, with a dataset
table, first-detected/deadline, active release, report artifact, and exact local
candidate-preparation command. It must not create one issue per day, expose
secrets, download the full corpus, stage data, invoke activation, or close a
human-authored issue with a coincidentally similar title.

Use least-privilege GitHub permissions (`contents: read`, scoped
`issues: write`, artifact actions as required), a Cloudflare token limited to
the operational report objects/catalog rather than serving publication where
the platform permits, and pinned third-party actions.
Alert delivery to Slack/email is outside scope; GitHub issue is the agreed
default and can be extended later.

### 10. Rewrite the runbook around receipts

Document prerequisites, local/CI split, dry-run, stage/resume, approval packet,
activation, automatic contingency rollback, manual pointer rollback, drift
issue triage, receipt verification, retention/GC handoff, and credential
boundaries. Remove month-selected examples and remote schema/seed checklists.

Provide exact commands, for example:

```sh
bun --filter @bp/pipeline-v2 cli -- publish serving-release \
  --action run --candidate-manifest <immutable-path> \
  --through awaiting_approval

bun --filter @bp/pipeline-v2 cli -- publish serving-release \
  --action run --resume <operation-id>

bun --filter @bp/pipeline-v2 cli -- publish serving-release \
  --action rollback --to <release-id> --expected-current <release-id> \
  --expected-generation <generation>
```

The two-part `publish serving-release` path is intentional: the current CLI
registry accepts exactly `[group, name]`. Model run/rollback/GC as a strict
`--action` option (or explicitly redesign and test the registry before adding
deeper paths). There must be one implementation/state machine rather than
duplicated shell/workflow logic.

## Tests

Extend `tools/pipeline-v2/test/publish-serving-release-order.test.ts` or replace
it with state-machine tests proving:

- activation is last and requires all prior receipts;
- failure after every stage is resumable and does not repeat verified writes;
- changed candidate/resource/pointer/migration refuses resume;
- dry-run has no remote mutations;
- semantic equality is `no_op`, zero blob PUT bytes, zero release/pointer write;
- incomplete/hash-mismatched R2 or D1 blocks preview/activation;
- successful preview parity plus durable readiness/intent evidence creates the
  exact `awaiting_approval` receipt without activation;
- post-activation smoke failure performs exactly one pointer rollback;
- receipt chain is deterministic apart from typed operation timestamps and
  contains no credential/session/email fixtures;
- elapsed/executable/approval-wait/operator-active durations and every manual
  action count are derived consistently across no-op, success, resume, and
  rollback fixtures; unobservable operator time remains explicitly unknown.

Add workflow/harness tests proving:

- dynamic production endpoints reject candidate/release parameters, while the
  membership-checked immutable artifact URL accepts only active/retained-public
  releases;
- preview override is configuration-only;
- activation workflow is manual/environment-protected and does not rebuild;
- scheduled workflow can run read-only freshness probes plus only the bounded
  operations-R2 append/current-signal-report CAS and bot-owned issue API; it
  cannot run serving candidate, migration, release, or pointer mutations;
- no workflow/shell executes aggregate schema or migration SQL remotely;
- code deploy and data activation remain distinct;
- one drift marker updates one issue and closes only that bot-owned issue.

## Acceptance criteria

- [ ] One typed state machine owns validation, migrations, staging, parity,
      approval pause, activation, smoke, receipt, resume, and rollback.
- [ ] Durable, hash-chained receipts survive local loss and bind exact candidate,
      resources, migrations, stage evidence, costs, and pointer generations.
- [ ] Receipts separate machine execution, approval wait, operator-active time,
      and remedial touch counts so operational cost cannot hide inside one wall
      clock duration.
- [ ] A semantic no-change run uploads zero content bytes, writes no serving
      rows, creates no release, and does not activate.
- [ ] Production schema changes use only the v2 Wrangler migration stream;
      direct/aggregate/ledger paths are mechanically forbidden.
- [ ] Candidate HTTP parity passes before approval; dynamic production request
      input cannot select a candidate/release, and the sole immutable-artifact
      exception cannot expose unpublished state.
- [ ] Local preparation durably transitions `preview_parity_passed` to
      `awaiting_approval` without activating; the protected workflow consumes
      that exact receipt rather than inventing or rebuilding approval state.
- [ ] Approved activation is one CAS pointer write; failed smoke rolls back that
      pointer without touching live/current data or immutable artifacts.
- [ ] Code deployment, local candidate construction, and reviewed data
      activation are separate, explicit workflows.
- [ ] Daily drift detection enforces Plan 099 and maintains one deduplicated
      GitHub issue without publishing.
- [ ] The first full-history activation consumes Plan 099's exact
      `activation_ready` receipt and produces the joint completion receipt;
      neither plan claims production completion before it exists.

## Verification

```sh
bun --filter @bp/pipeline-v2 test
bun --filter @bp/db test
bun --filter @bp/studio-api test
bun run test:worker
bun --filter @bp/db db:migrate:d1:v2:local
bun run check:types
bun run check:style
bun run check:architecture
bun run check:knowledge
bun run check:prepush
```

Use fixture/fake Cloudflare drivers for fault injection. Remote stage,
activation, issue creation, and rollback results count only when an authorized
environment produces their receipts.

## STOP conditions

Stop if the candidate cannot be reproduced from pinned evidence; resume would
ignore changed state; migration history is unexpected; any stage can mutate
the active candidate before approval; preview requires a production HTTP
override; no-op would create a release; activation is not last/CAS; rollback
touches generated rows, R2, live-write data, or Time Travel; a scheduled event
can publish; receipts leak credentials/personal data; or CI would claim a
production completion without verifiable remote receipts.
