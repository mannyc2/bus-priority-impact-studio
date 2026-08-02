# Plan 100: One publish command and a scheduled freshness alarm

## Status

- **State**: TODO
- **Priority**: P1
- **Effort**: S-M
- **Depends on**: steps 1-4 and 6: Plan 098 active; step 5 (the alarm) has no
  dependency beyond the existing advisory freshness command and may land first
- **Original audit base**: `origin/main@ecf556a79e23b4b9374d08210a380754756f357b`
  (2026-07-22). Re-verify cited anchors against current main.
- **Suggested branch**: `codex/100-publication-control-plane`

## Descope provenance (2026-08-02)

Rewritten to its kernel under the revised gen-17 operator decisions in
`plans/README.md`; the original text is in this file's git history. Cut: the
access-controlled preview Worker and separate remote parity environment,
hash-chained receipt lineage, operator-active-time accounting, and the CAS'd
operational report store with a D1 current-signal catalog.

Reconciliation against fetched `origin/main@e0c00aaf` changed one proposed
cut: Plan 098 already built and battle-proved protected-main environment
approval, zero-traffic Worker staging/exact-version proof, CAS activation,
post-activation smoke/rollback, and content-addressed durable receipts. Those
are retained and generalized. Local preparation still defaults to read-only
dry-run; remote execution is a pinned protected-main continuation over the
exact candidate and preparation-receipt hash, not an independent CLI-only
activation path.

## Outcome

One typed state machine owns publication end to end over Plan 098's primitives:
validate the candidate, apply forward migrations through the single wrapper,
upload absent blobs, stage candidate D1, verify, activate last (one CAS
pointer write), smoke production, and roll the pointer back on failed smoke —
with a plain durable receipt and safe resume. A semantic no-change run is an
explicit no-op: zero content PUTs, no release, no pointer movement. A
scheduled workflow runs the advisory freshness ledger and maintains one
deduplicated GitHub issue; it can never publish.

## Re-verified current boundary (2026-08-02)

- `.github/workflows/plan098-production-activation.yml` is a completed,
  hard-coded one-off drill, not a reusable publisher. It already proves the
  protected production environment, exact candidate pins, authenticated
  operator deployment, durable evidence upload, and operator cleanup.
- `.github/workflows/ci.yml` already stages the public Worker at zero traffic,
  proves the exact version, promotes it, smokes ordinary traffic, and retains
  rollback evidence. Plan 100 wraps these proven stages instead of replacing
  them with a weaker transport.
- `tools/pipeline-v2/scripts/run-plan098-production-drill.ts` is deliberately
  pinned to Candidate A/B and generation 4. General publication must reuse its
  operator primitives and receipt invariants without replaying that drill.
- `scripts/publish-serving-release.sh` is a disabled month-selected legacy
  path with direct remote SQL examples; it is not production machinery.

## Implementation

### 1. The command and its receipt

Add `publish serving-release` under
`tools/pipeline-v2/src/commands/publish/serving-release/` with an injectable
orchestrator and ordered stages:

```text
created → candidate_validated → migrations_applied → blobs_uploaded
  → d1_staged → candidate_verified → activated → production_smoke_passed
  → complete
```

Terminal alternatives: `no_op`, `rolled_back`, `failed_before_activation`.
The two-part `[group, name]` path is intentional (the CLI registry accepts
exactly that); model prepare/run/rollback as a strict `--action` option.
Default is dry-run (read-only resolution, stage plan, local workerd parity,
and cost preview). A preparation action writes the immutable candidate-ready
receipt. The protected-main workflow alone accepts that exact candidate ID,
manifest hash, receipt hash, expected release, and pointer generation and
performs remote writes after environment approval.

The receipt is one schema-validated JSON document: operation ID, repo SHA,
candidate manifest key/hash, explicit account/database/bucket identities,
observed active release + pointer generation, per-stage start/end/result and
R2/D1 counts and bytes, error class on failure. Written locally and, during
the protected continuation, copied to one content-addressed operations R2 key
using Plan 098's receipt convention. No hash chaining, credentials, session
data, or operator-time bookkeeping. Run child processes with argument arrays
and captured, redacted output.

### 2. Content-safe resume

`--resume <operationId>` strict-decodes the receipt and re-verifies candidate
manifest hash, Cloudflare resource identities, pointer ID/generation,
migration head, and completed R2 object hashes / D1 counts before continuing.
Any drift refuses resume and requires a new operation. Verified writes never
repeat. If activation committed but the response or receipt write was lost,
resume matches Plan 098's operation-keyed pointer-transition event and
continues at production smoke; a pointer advance without that exact event is
a competing stale CAS and fails.

### 3. Semantic no-op before writes

Compare the candidate's `semanticInputFingerprint` (Plan 098) against the
active candidate before any migration or data write. Equal → durable `no_op`
receipt referencing the active release, zero content-blob PUTs, zero serving
rows, no release ID, no pointer write. If fingerprints match but regenerated
bytes differ, still take the no-op branch and record the determinism defect
for Plan 101. A timestamp, reordered JSON, or rerun alone cannot defeat
no-op detection.

### 4. One migration path

Apply forward schema changes only via
`bun --filter @bp/db db:migrate:d1:v2:remote` (Plan 098's pinned wrapper),
after validating the local stream against
`packages/db/migrations/d1-v2/checksums.json`. Keep the repository harness
that scans TypeScript, shell, and workflow files and forbids remote
`d1 execute` of migration or aggregate `schema.sql` paths — it is one cheap
test and it blocks the exact 095/097-era hazards.

### 5. The scheduled freshness alarm

Add `.github/workflows/data-freshness.yml` on a daily UTC schedule plus
manual dispatch. It runs Plan 099's read-only advisory ledger. Healthy closes
the one bot-owned issue if open; behind/unknown opens or updates one
deduplicated issue keyed by a stable marker, containing the per-dataset lag
table and the exact local catch-up command. Least-privilege permissions
(`contents: read`, scoped `issues: write`), pinned third-party actions. The
workflow has no serving credentials: it cannot stage, publish, migrate, or
touch the pointer. It must not create one issue per day or close a
human-authored issue.

### 6. Generalize the protected-main continuation and rewrite the runbook

`scripts/publish-serving-release.sh` becomes a thin error pointing at the new
command (Plan 101 deletes it). Generalize the proven Plan 098 workflow so it
checks out protected main, reconstructs no unpinned local corpus, strictly
verifies the candidate-ready receipt, stages and proves the Worker, applies
only required forward migrations, uploads/stages/verifies, then CAS activates,
smokes, and records a content-addressed receipt. Rewrite the runbook around:
build candidate → dry-run/local parity → prepare receipt → dispatch the
protected workflow with exact pins → approve → smoke/receipt. Rollback is the
same protected workflow/action with exact current release and generation.

```sh
bun --filter @bp/pipeline-v2 cli -- publish serving-release \
  --action prepare --candidate-manifest <path> \
  --expected-current <release-id> --expected-generation <generation>

gh workflow run publication.yml --ref main \
  -f candidate_id=<candidate-id> -f manifest_sha256=<sha256> \
  -f receipt_sha256=<sha256> -f expected_current=<release-id> \
  -f expected_generation=<generation> -f action=run
```

Remove month-selected examples and remote schema/seed checklists.

## Tests

Replace `tools/pipeline-v2/test/publish-serving-release-order.test.ts` with
state-machine tests proving:

- activation is last and requires all prior stage results;
- failure after every stage is resumable without repeating verified writes;
- changed candidate/resource/pointer/migration state refuses resume;
- dry-run performs no remote mutations;
- semantic equality is `no_op`: zero blob PUT bytes, zero release/pointer
  writes;
- post-activation smoke failure performs exactly one CAS rollback and stops;
- receipts contain no credentials or personal data.

Workflow harness tests: the schedule can run only the read-only ledger and
the bot-owned issue API; no workflow or shell executes migration/schema SQL
remotely; one drift marker maps to one issue.

## Acceptance criteria

- [ ] One state machine owns validation, migrations, staging, verification,
      activation (last, CAS), smoke, receipt, resume, and rollback across the
      local prepare and protected-main continuation profiles.
- [ ] A plain durable receipt binds candidate, resources, stage evidence, and
      pointer generations; resume refuses drift and never repeats verified
      writes.
- [ ] A semantic no-change run uploads zero content bytes, writes no serving
      rows, creates no release, and does not move the pointer.
- [ ] Production schema changes flow only through the v2 wrapper; the harness
      scan forbids remote SQL bypasses.
- [ ] The scheduled alarm maintains exactly one deduplicated issue and has no
      publish capability.
- [ ] The shell script is a deprecation error and the runbook matches the
      real command sequence.

## Verification

```sh
bun --filter @bp/pipeline-v2 test
bun --filter @bp/db test
bun run test:worker
bun --filter @bp/db db:migrate:d1:v2:local
bun run check:types
bun run check:architecture
```

Use fixture/fake Cloudflare drivers for fault injection. Remote activation
and rollback results count only when an authorized operator run produces
their receipts.

## STOP conditions

Stop if a no-op would create a release; activation is not the last mutation
or not CAS; protected-main pins/environment approval or Plan 098's staged
Worker proof would be weakened; a scheduled event can publish or mutate
serving state; resume would ignore changed state; rollback touches data beyond
the pointer; or receipts would contain credentials or personal data.
