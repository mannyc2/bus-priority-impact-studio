# Plan 101: Deterministic artifacts, verified skip, and the de-month vestige sweep

## Status

- **State**: IN PROGRESS — steps 1-2 implemented and locally verified on
  `codex/101-deterministic-demonth`; production upload evidence awaits the
  reviewed June/July catch-up, while steps 3-5 remain last in the sequence
- **Priority**: P1 for steps 1-2 (land with or before Plan 098's stage B so
  the first pointer-published candidate is byte-deterministic); P2 for the
  rest
- **Effort**: M
- **Depends on**: steps 1-2: none (pure builder/uploader changes); steps 3-5:
  Plan 098 activated in production
- **Original audit base**: `origin/main@ecf556a79e23b4b9374d08210a380754756f357b`
  (2026-07-22). Re-verify cited anchors against current main.
- **Suggested branch**: `codex/101-deterministic-demonth`

## Descope provenance (2026-08-02)

Rewritten to its kernel under the revised gen-17 operator decisions in
`plans/README.md`; the original text is in this file's git history. Cut: the
dependency-DAG builder cache with per-builder typed fingerprints (full local
rebuild is cheap; verified hash-skip at upload is the dedup mechanism), the
route-history chunking experiment (decision recorded: monolithic per-route
blobs stay; reopen only if Plan 099 backfill pushes the largest payloads past
low-single-digit MB), the fenced GC with tombstones/generation fences/90-day
machinery (at ~0.7 GB per full release delta, storage is cents; manual
pruning if ever needed, always retaining active + previous + pinned), the
verified-catalog zero-HEAD fast path, and semantic ratchet grammar across all
file types.

## Outcome

Identical inputs produce identical candidate payloads and hashes; uploads
skip exactly the blobs whose verified SHA-256 already exists; a no-data-change
rebuild performs zero content PUTs; and the final month-as-release-identity
vestiges are gone. Month remains legal as source grain, observation
coordinate, and partition directory (ADR-0022).

## Re-verified anchors (fetched `origin/main@e0c00aaf`, 2026-08-02)

- `tools/pipeline-v2/src/commands/studio/route-speed-histories.ts:100-206`
  stamped the batch clock into each route payload and reused any decodable
  existing artifact. Step 1 now rebuilds canonical route bodies while keeping
  the command clock only in the batch receipt.
- `tools/pipeline-v2/src/commands/publish/r2-artifacts.ts` still implemented
  the pre-pointer recursive, month-selected uploader on main. Step 2 replaces
  it with strict candidate-manifest enumeration and GET/SHA-256 equality;
  ETag and size are not reuse evidence.
- Stable-key helpers live in `packages/analytics/src/artifacts/index.ts` and
  `packages/domain/src/studio/route-dossier.ts`.
- `tests/harness/month-doctrine.test.ts:500-525` scans TypeScript roots plus
  one Wrangler file; `tests/harness/month-doctrine-allowlist.ts:33-47` retains
  two permanent frozen-artifact exceptions reached through
  `export/d1-inputs.ts:418-561` implicit discovery and
  `packages/domain/src/studio/snapshots.ts` / `route-insights.ts`.

Plan 098 was already complete when this reconciliation began, so the dirty
tree's instruction to fold steps 1-2 into its stage B is historical, not a
reason to replay production. These changes instead gate the next normal
pointer publication.

## Implementation

### 1. Canonical payloads and timestamp classification

Add one shared canonical serializer for publishable artifacts: schema-ordered
or recursively key-sorted objects, explicitly sorted arrays where domain
order is a set, stable number/text encoding, one trailing newline, and no
local paths, process IDs, locale/timezone output, random IDs, or wall-clock
build timestamps. Classify every `generatedAt`/identity field rather than
blanket-deleting: source observation/capture timestamps are semantic payload
data and stay; "when this command ran" moves to the receipt; release identity
is injected by Worker response assembly (Plan 098 step 7), never embedded in
reusable bodies. Delete the decodable-file reuse at
`route-speed-histories.ts:178-197`: reuse is legal only on a recorded
fingerprint + verified output hash.

Prove it with one determinism test: run the publishable builder set twice
with different injected clocks, temp roots, and enumeration order; the
candidate manifest, blob key set, and every output byte must match.

### 2. Verified upload skip

`publish r2-artifacts` accepts only Plan 098 candidate-manifest entries —
never directory recursion. Delete the equal-size/empty-ETag branch and add a
regression test for it. Skip an existing object only on SHA-256 equality:
with Plan 098's hash-bearing physical keys, key existence plus a one-time
GET/hash verification (recorded in the receipt) is equality; mismatched bytes
at an immutable key are corruption and block the candidate. PUT only absent
blobs using R2's atomic `If-None-Match: *` conditional PutObject, then
GET/hash-verify the committed winner; never overwrite a content key. Report
reused/uploaded objects and bytes by artifact family. ETag, multipart ETag,
Last-Modified, and size alone are never content equality.

### 3. De-month vestige sweep (after 098 is active)

- Remove `--month` from publication/activation surfaces; delete the
  deprecated `scripts/publish-serving-release.sh` once the Plan 100 command
  is the documented path. Keep `--month` on explicit source-partition
  ingest/backfill/build commands.
- Remove `BASELINE_MONTH` and `LAST_BUILT_SPEED_MONTH` from example/test
  Wrangler configs, workflows, scripts, and the runbook.
- Remove silent `2026-03` and current-year-minus-one defaults (Plan 099's
  registry floors are the replacement); key local candidate/export roots by
  `candidateId` with source-period subdirectories where useful.

### 4. Retire the legacy resolver and frozen artifact paths

Delete Plan 098's no-pointer legacy resolver after the first successful
activation plus one normal deploy cycle with no fallback telemetry. For the
two frozen-artifact allowlist entries (legacy route-timeline and detector
artifacts): trace production consumers; zero use → delete producer, implicit
recursive discovery, decoder, fixtures, and allowlist entry together;
nonzero use → one-time offline conversion to the candidate-addressed schema
with exact public-response parity, then delete the old path.
`readLocalD1Inputs` stops recursively discovering frozen release-month files
and requires an explicit candidate artifact reference. No indefinite dual
runtime decoding.

### 5. Narrow ratchet extension

Extend `tests/harness/month-doctrine.test.ts` to the operational surfaces
that actually held vestiges: the publish script location, example/test
Wrangler `.jsonc`, and workflow `.yml` files. Positive/negative fixtures:
reject `--month` on `publish serving-release`, `BASELINE_MONTH`, and a new
silent default; allow `--month` on `ingest route-segment-speeds`, ISO month
schemas, monthly chart series, and source partition paths. No semantic
grammar over historical plans/ADRs or ordinary prose.

## Tests

- Two-clock/two-order determinism: byte-identical manifest and blobs.
- No-change rebuild → zero content PUTs (the skip fires everywhere).
- One route/month change → only dependency-affected blobs upload, shown by
  hash diff against the prior manifest (no DAG machinery required).
- Empty-ETag/equal-size never authorizes a skip; a corrupt immutable object
  blocks publication.
- Doctrine fixtures pass/fail exactly as specified in step 5.
- Frozen-path removal: representative fixtures prove the converted-or-deleted
  outcome and the allowlist is empty of permanent entries.

## Acceptance criteria

- [ ] Two-clock/two-order builds of the publishable set are byte-identical;
      source timestamps/provenance are preserved in payloads.
- [ ] Upload skip requires verified SHA-256 equality; the unsafe branch is
      deleted and regression-tested; no-change publishes zero content bytes.
- [ ] A changed partition uploads only its affected blobs, evidenced by
      manifest hash diff.
- [ ] Publication selectors/config/paths are candidate/release based;
      legitimate source-month grain remains supported and tested; the shell
      script, legacy resolver, and both frozen allowlist entries are gone.
- [ ] The ratchet covers the operational surfaces that previously held
      vestiges without scanning historical prose.

## Verification

```sh
bun --filter @bp/analytics test
bun --filter @bp/domain test
bun --filter @bp/pipeline-v2 test
bun run test:worker
bun run check:types
bun run check:architecture
```

Run the determinism test twice from a pinned fixture candidate and attach
both receipts.

## STOP conditions

Stop if canonicalization would discard source evidence; a supposedly
immutable key can be overwritten; the sweep would remove legitimate source
grain; a frozen path has unknown production use; or a fallback is still
needed for rollback.
