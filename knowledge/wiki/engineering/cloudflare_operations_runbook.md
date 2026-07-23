---
title: Cloudflare Operations Runbook
type: engineering
status: active
last_updated: 2026-07-23
owner: codex
source_count: 0
tags: [cloudflare, worker, d1, r2, operations, gtfs-rt]
---

# Cloudflare Operations Runbook

## Purpose

This runbook publishes coordinated D1, Studio, and map releases to the deployed Cloudflare app and
keeps current GTFS-RT capture running after deploy.

The repo intentionally does not commit fake Cloudflare IDs. Add real IDs only after the resources exist.

## Resource Model

Required production resources:

| Binding | Type | Suggested resource name | Purpose |
|---|---|---|---|
| `DB` | D1 | `bus-priority-serving` | Compact serving projections loaded from `data/exports/d1/<month>/`. |
| `ARTIFACTS` | R2 | `bus-priority-artifacts` | Release artifacts: briefs, map manifests, GeoJSON, evaluations, source availability, audit files. |
| `GTFS_RT_RAW` | R2 | `bus-priority-gtfs-rt-raw` | Worker-written GTFS-RT protobuf snapshots and JSON manifests. |

Required production vars/secrets:

| Name | Kind | Value |
|---|---|---|
| `MTA_BUS_TIME_API_KEY` | secret | MTA Bus Time key from the local `.env`. |
| `GTFS_RT_SAMPLES_PER_CRON` | var | `2` for two samples per one-minute cron. |
| `GTFS_RT_SAMPLE_SECONDS` | var | `30` for strict 30-second GTFS-RT cadence. |

## Wrangler Config Block

After resource creation, add the real identifiers to `apps/web/wrangler.jsonc`. The same shape is
available in `apps/web/wrangler.production.example.jsonc`:

```jsonc
"vars": {
  "GTFS_RT_SAMPLES_PER_CRON": "2",
  "GTFS_RT_SAMPLE_SECONDS": "30"
},
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "bus-priority-serving",
    "database_id": "<real-d1-database-id>"
  }
],
"r2_buckets": [
  {
    "binding": "ARTIFACTS",
    "bucket_name": "bus-priority-artifacts"
  },
  {
    "binding": "GTFS_RT_RAW",
    "bucket_name": "bus-priority-gtfs-rt-raw"
  }
]
```

Keep this block out of source control until the project is ready to commit environment-specific deployment config. If committed, use only real non-secret resource IDs; never commit `MTA_BUS_TIME_API_KEY`.

## Plan 097 bounded recovery

This is the only eligible path for the Generation 17 catch-up against the populated production D1.
The legacy serving-release script is disabled during Plan 097 because it replays aggregate schema
and cannot preserve the migration ledger or prove one atomic serving cut.

The recovery uses three separate, gitignored Wrangler configs copied from the tracked examples:

| Phase | Tracked template | Binding rule |
|---|---|---|
| signed preflight | `apps/web/wrangler.plan097-preflight.example.jsonc` | Production D1 is read-only; both R2 bindings are isolated Plan 097 buckets. |
| disposable proof | `apps/web/wrangler.plan097-proof.example.jsonc` | Disposable D1 and proof R2 only; no production route or resource binding. |
| authorized activation | `apps/web/wrangler.plan097-activation.example.jsonc` | Exact production D1/R2 plus immutable preflight source bucket; deploy only after the fresh token gate. |

Copy each required template to the same name without `.example`, fill only the explicit placeholders,
and keep the copy untracked. Before each deploy, inspect the rendered config and stop if the proof
config contains `bus-priority-serving`, the production D1 ID, or the exact production artifacts
bucket name. None of the operation Workers receives a custom production route. Every template keeps
the intentional `workers.dev` endpoint but sets `preview_urls: false`; Cloudflare otherwise defaults
preview availability to `workers_dev`, creating an unreviewed version URL. See the
[Workers preview-URL configuration](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/).

Protect the exact `__operations/plan097` path on each Worker host with a Cloudflare Access Service
Auth policy for the dedicated one-time service token. The CLI keeps the service-token client ID and
secret only in its operator environment and sends the standard Access headers. The Worker validates
the resulting `Cf-Access-Jwt-Assertion` signature through the team JWKS, exact issuer, exact
application audience, RS256 algorithm, and service-token `common_name`; the client secret is not a
Worker binding. Fill `PLAN097_ACCESS_TEAM_DOMAIN`, `PLAN097_ACCESS_AUD`, and
`PLAN097_ACCESS_SERVICE_TOKEN_ID` in each gitignored config. Cloudflare documents both the
[service-token request headers](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
and the requirement for a Worker origin to
[validate the Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
Prove that a request without Access returns 401/403 and that the Worker rejects a missing, wrong-
issuer, wrong-audience, or wrong-service-token JWT. The bootstrap/execution tokens and Ed25519
signing material are Wrangler secrets, never vars or command arguments.

### Recovery reader predeploy and cache drain

The tracked production config enables `PLAN097_RECOVERY_ENABLED` and pins
`PLAN097_PREVIOUS_RELEASE_ID=pub_20260605T183601689Z`. With that release still active, the resolver
continues to read the existing stable objects while every public API response becomes `no-store`;
the operation route remains absent because production has no operation bindings. Before approving
the protected production-environment deployment, re-run the anonymous release-aware checker and
stop if the active release differs from that pin.

Deploy the pushed commit through the protected GitHub `production` environment before the signed
preflight. Record the Worker version, deployment instant, old-release safe-body hashes, anonymous
recovery-namespace 404, and `Cache-Control: no-store` for every checker endpoint. Cloudflare treats
`no-store` as a cache bypass, but responses emitted before this deploy carried up to 86,400 seconds
of `stale-while-revalidate`; see the
[Workers cache configuration](https://developers.cloudflare.com/workers/cache/configuration/).
Do not activate the candidate until either:

1. 86,400 seconds have elapsed since every endpoint first proved `no-store`, with the checker
   repeated after the drain; or
2. an authoritative cache purge for every affected key has been executed and recorded.

No purge is assumed by this runbook. The signed preflight must use the post-drain responses. This
predeploy is a protected production-Worker gate, but it does not authorize the later serving-data,
schema, or artifact mutation token.

The production workflow refuses to start from split Worker traffic, captures the one stable prior
version, and records the postdeploy version before verification. Its strict Plan 097 checker binds
the pinned release, safe-body hashes, `no-store` headers, exact-route count, anonymous operation
namespace 404, deployed Git SHA, and workflow run to
`plan097-reader-deploy.receipt.json`. The pre/post deployment JSON and receipt are covered by the
adjacent SHA-256 file and uploaded as the `plan097-reader-predeploy-<git-sha>` Actions artifact. If
any postdeploy D1 audit or HTTP check fails, the workflow rolls the Worker back to the captured
version and uploads the rollback deployment state; that failed run does not start the cache-drain
clock.

### Closed command configuration

The exact reviewed command shapes resolve paths and endpoints from these environment variables. A
local value is only a locator/cache; the signed preflight, restore package, and operation receipts
under the immutable R2 prefix are authoritative.

| Name | Use |
|---|---|
| `PLAN097_CANDIDATE_DIR` | Directory containing `plan097-activation-bundle.json` and `plan097-artifact-manifest.json`. |
| `PLAN097_ARTIFACT_ROOT` | Verified candidate artifact root. |
| `PLAN097_RECOVERY_ENDPOINT` | Signed-preflight or authorized-production operation URL, according to phase. |
| `PLAN097_PUBLIC_BASE_URL` | Existing public production URL used by the release-aware checker. |
| `PLAN097_PROOF_ENDPOINT` | Disposable operation URL. |
| `PLAN097_PROOF_BASE_URL` | Disposable public API URL; it must not route to production. |
| `PLAN097_PREFLIGHT_PUBLIC_KEY` | Trusted Ed25519 public key file used for independent receipt verification. |
| `PLAN097_PREFLIGHT_RECEIPT_SHA256` | Exact signed preflight hash returned by `dry-run`. |
| `PLAN097_RESTORE_BUNDLE_SHA256` | Exact selective restore hash returned by `dry-run`. |
| `PLAN097_PROOF_SUMMARY_KEY`, `PLAN097_PROOF_SUMMARY_SHA256`, `PLAN097_PROOF_SUMMARY_BYTES` | Exact durable proof-summary reference returned by `prove`. |
| `PLAN097_SERVICE_TOKEN_ID`, `PLAN097_SERVICE_TOKEN_SECRET` | Dedicated Cloudflare Access credentials kept only in the operator environment; the Worker validates the resulting JWT. |
| `PLAN097_BOOTSTRAP_TOKEN` | Isolated preflight-bucket seed token; it is not the production mutation token. |
| `PLAN097_EXECUTION_TOKEN` | Proof token in the disposable phase, then a newly issued production token only after approval. |

The command validates `--candidate` against the bundle release and `--operation` against the bundle
operation ID. It rejects a proof unless `--proof-env plan097-proof` is present. Explicit path options
remain available for fixture/debug runs, but an approval packet uses only the shapes below.

### Signed read-only preflight

First confirm the release-aware checker is already deployed and the pushed repo SHA matches the
candidate. Configure the preflight Worker with `PLAN097_SEED_MODE=true`, production D1, isolated
Plan 097 R2, and no production artifact binding. The closed `seed-bundle` action accepts only the
allowlisted activation hash and its self-declared manifest; it cannot accept SQL, a physical key, a
bucket, or a database selector.

Set the preflight signing key ID/private/public material with `wrangler secret put` against the
gitignored preflight config. Set its Worker-side `PLAN097_EXECUTION_TOKEN` secret to the same random
value held locally as `PLAN097_BOOTSTRAP_TOKEN`; this token can seed only the allowlisted isolated
preflight bucket and is not the later production token. Keep the Access client ID/secret only in the
local operator environment. Deploy the preflight Worker only after its Access application/policy is
active and the unauthenticated/JWT-negative checks pass, then run exactly:

```sh
bun --filter @bp/pipeline-v2 cli -- publish recovery --action dry-run --candidate <candidate-id>
```

The result must include the signed preflight receipt SHA/key fingerprint, selective snapshot and
restore hashes, exact schema/migration-ledger fingerprint, public HTTP baseline, cost preview, and
measured read/R2 receipt metrics. Persist its redacted attestation on the pushed branch. Stop if the
active release is unknown, the Studio/map/exact election disagrees, 0033 is partial, any other
schema object drifts, a protected fingerprint is missing, or the candidate is not newer.

### Disposable A-to-B-to-A proof

Apply canonical migrations normally to the empty disposable D1; never run them against production.
The proof config binds that D1, proof artifact/runtime buckets, and the immutable preflight bucket as
`PLAN097_PROOF_BUNDLES`. Its D1 ID and every bucket name must differ from production.

The proof command mirrors the signed bundle, seeds proof-only stable aliases with the same verified
candidate bytes, applies the exact selective restore batch once to initialize serving state A, and
then runs failed-B, B, and restored-A. Protected fingerprints are captured in the disposable D1
before each exact batch and must be byte-identical after it; production identity/session rows are
never copied. Each A surface is strict-checked, B must pass candidate dossier/map/exact-route checks,
and restored A must match its own complete HTTP baseline.

Run exactly:

```sh
bun --filter @bp/pipeline-v2 cli -- publish recovery --action prove --operation <operation-id> --proof-env plan097-proof
```

Stop if either exact batch exceeds 30 seconds, any statement result fails unexpectedly, injected
failure changes A, candidate Studio/map/exact elections differ, protected fingerprints change, an
R2 object is non-identical at an existing key, or restored HTTP evidence differs from the proof
baseline. Keep every immutable proof receipt and measured D1/R2/duration metric.
The command also writes a canonical `proof-summary` receipt whose receipt-set hash and aggregate
usage cover every strict-decoded Worker response without requiring one Worker invocation to read
thousands of per-object receipts.

### Fresh production approval packet

Do not deploy the activation config, set its execution token, stage production artifacts, reconcile
0033, or mutate production D1 until one compact packet contains:

1. pushed repo SHA and immutable candidate/bundle/manifest identities, counts, bytes, and freshness matrix;
2. signed preflight key fingerprint, receipt/snapshot/restore hashes, exact resource IDs, schema envelope, migration ledger, and HTTP baseline;
3. estimated D1/R2 usage and the proof's actual rows read/written, request counts, bytes, and durations;
4. failed-B, B, and restored-A election/fingerprint/HTTP receipts with both exact batches under 30 seconds;
5. the exact activation, resume, and rollback commands below plus the STOP behavior;
6. confirmation that the compatibility reader is deployed, anonymous recovery keys remain denied, the legacy workflow cannot mutate recovery data, and no audited input drifted.

Ask for a fresh production mutation token only after all six items exist. The campaign authorization
that created Plan 097 is not that token.

### Authorized activation and contingency

After fresh approval, configure the activation Worker from the exact signed hashes and resource IDs,
set a newly issued `PLAN097_EXECUTION_TOKEN`, re-run the baseline check, and run exactly:

```sh
bun --filter @bp/pipeline-v2 cli -- publish recovery --action activate --operation <operation-id> --receipt-sha256 <sha256>
```

The command mirrors the preflight/restore package, applies eligible 0033 recovery only after the
signed audit, stages and verifies immutable candidate bodies, finalizes the manifest, verifies the
old public release, and submits one D1 activation batch with `route_batch_status` last. It then runs
the candidate HTTP checker. An interrupted pre-activation staging pass may be retried idempotently:

```sh
bun --filter @bp/pipeline-v2 cli -- publish recovery --action resume --operation <operation-id>
```

If candidate smoke fails, the command immediately applies the atomic selective restore and compares
the restored public API with the signed production baseline. That ends Plan 097 as
`rolled_back`/STOP; do not reactivate. The explicit operator contingency command is:

```sh
bun --filter @bp/pipeline-v2 cli -- publish recovery --action rollback --operation <operation-id> --receipt-sha256 <sha256>
```

On success, leave the freshness-derived candidate active, persist the canonical completion receipt,
disable the one-time operation route/bindings, and record its immutable key/hash in Plan 097. Never
use this recovery path for a later artifact/schema cutover; Plan 098's pointer must be active first.

## One-Time Release Publish

This legacy section is retained for historical/disposable empty-database workflows. Do not use it
against the populated production database while Plan 097 or any successor control-plane recovery is
in force; use [[#Plan 097 bounded recovery]].

Build one coordinated local D1, Studio, and map release first. `--month` selects the covered data
partition; it is not the release identity. The orchestrator captures one canonical publication
timestamp and threads its `releaseId` and `publishedAt` through every output. Each dataset records
its own coverage window, and every `coverage.end` must equal the selected partition.

```bash
bun run pipeline map release --year 2026 --month 3 --context-source <reviewed-borough-boundary.csv>
bun run check:publish-completeness -- --month 2026-03
```

Before any remote mutation, inspect the D1 export summary, Studio release payload, map manifest,
and map catalog registration. Their `releaseId` and `publishedAt` must match exactly; their coverage
windows must be valid and end at `2026-03`. The publish script validates these local outputs but
does not build or repair them.

Dry-run the publish commands:

```bash
bun run publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts
```

Publish only after reviewing the generated D1 and R2 commands:

```bash
bun run publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts --execute
```

This is not a cron job. Run it when publishing a reviewed release or corrected artifact set.

## Route intervention inventory export and publish

The Plan 091 inventory is generated locally and served as ordinary Studio R2 objects. It does not
need an inventory-specific Worker endpoint, D1 migration, uploader, or bucket binding.

First run the vocabulary preflight. Use the same strict inputs for the real export:

```bash
bun run pipeline -- studio export-route-intervention-inventory \
  --release-artifact <studio-release.json> \
  --intervention-corpus <studio-intervention-corpus.json> \
  --route-evidence-index <route-evidence-v2-index.json> \
  --wiki-occurrences <operational-occurrence-import-v5.json> \
  --mta-wiki-root <mta-wiki-checkout> \
  --artifact-root data/artifacts \
  --check-vocabulary

bun run pipeline -- studio export-route-intervention-inventory \
  --release-artifact <studio-release.json> \
  --intervention-corpus <studio-intervention-corpus.json> \
  --route-evidence-index <route-evidence-v2-index.json> \
  --wiki-occurrences <operational-occurrence-import-v5.json> \
  --mta-wiki-root <mta-wiki-checkout> \
  --artifact-root data/artifacts \
  --db data/local/pipeline.sqlite
```

`--db` is optional. If it is omitted, local-registry lineage is reported unavailable and affected
coverage is partial rather than silently empty. The required Studio release, reviewed corpus,
route-evidence-v2 bundles, and occurrence-v5 import must decode strictly. The exporter derives the
Wiki named release and manifest SHA from the route-evidence index, then verifies the rc25 treatment
components, semantic contract, route scopes, and scope reconciliation under `--mta-wiki-root`
against that same manifest. It accepts no month, release-ID, Wiki-release, manifest-SHA, or
publication-time override.

Before publishing, inspect:

- every route-index key, byte size, and 64-hex SHA against the exact promoted bundle bytes;
- `coverageState`, especially `partial` and `checked_no_positive_evidence` routes;
- reconciliation for unexplained treatment/occurrence loss or exact-route failures;
- producer `unresolved` semantics as explicit source gaps, never `other_documented`;
- the 128 KiB route-bundle, 320 KiB route-index, and 2 MiB facet-index gates.

Per-file atomic promotion preserves unrelated files under `studio/v2/routes` and
`studio/v2/interventions`. Never delete or replace either shared directory to recover from a failed
run.

### Materialize route intervention observations

After the Plan 091 route inventory is verified, materialize the Plan 090 route observation bundles
and compact index locally:

```bash
bun run pipeline -- studio export-intervention-observations --db data/local/pipeline.sqlite --inventory-index data/artifacts/studio/v2/interventions/route-inventory-index.json --release-artifact data/artifacts/studio/v1/release.json --artifact-root data/artifacts
```

The database must contain the required `local_route_month_trend` table and columns. The inventory
index and every referenced Plan 091 bundle must strictly decode and pass release, coverage, key, and
hash checks. `data/artifacts/studio/v1/release.json` must strictly decode as a post-Plan-086
`StudioReleasePayload`; the command inherits its `releaseId` and `publishedAt` and accepts no
identity override.

A missing or invalid prerequisite is a failed local build, not an instruction to fabricate a
release. Rebuild route trends through the documented ingest/backfill workflow, rebuild the exact
Plan 091 inventory from its pinned source artifacts, or regenerate the coordinated Studio release,
then rerun the observation export. Never hand-author inventory bundles, hashes, release metadata,
or coverage to unblock publication.

Review the returned admitted/rejected anchor counts and series status counts, verify that rejected
anchors do not appear in either artifact family, and inspect the generated keys:

```text
studio/v2/routes/<exact-route-slug>/intervention-observations.json
studio/v2/interventions/observation-index.json
```

These files share the existing `studio` prefix, so the normal recursive local seed and generic R2
publisher include them. No observation-specific endpoint, migration, uploader, or bucket binding is
needed. See [[wiki/engineering/intervention_evidence_relevance|Intervention Evidence Relevance]]
for the evidence and claim-language boundaries.

For local Worker testing, seed the complete Studio tree recursively:

```bash
bun run seed:local-studio-r2
```

For remote publication, the generic publisher already walks the full `studio` prefix recursively.
Dry-run it as part of release review; the month selects the coordinated release partition rather
than inventory identity:

```bash
bun run pipeline publish r2-artifacts \
  --month <coverage-end-YYYY-MM> \
  --bucket bus-priority-artifacts \
  --dry-run
```

Use the normal reviewed `publish:serving-release --execute` flow for the actual coordinated remote
mutation.

If a new consumer literal is unmapped, stop the publish, run `--check-vocabulary`, and add an
explicit reviewed disposition plus fixture; never add a catch-all. A producer `unresolved` record
stays visible as a source gap/partial route until a new immutable mta-wiki release reviews it. If an
exact-route projection fails, correct the authoritative route identity or producer
route-treatment scope and reimport route evidence plus occurrences from the same new release/hash.
Do not repair either case with prose matching, route-family matching, project fan-out, or edits to
generated bundles.

## Automated GitHub Actions Deploy

`.github/workflows/ci.yml` runs the knowledge check, type check, architecture check, test suite, and
web release gates for pull requests and pushes. On pushes to `main`, a successful verify job
triggers the production deploy job:

```bash
bun --filter @bp/web build
bun --filter @bp/web deploy
```

Configure this GitHub Actions secret before relying on automated deploys:

| Name | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Scoped token allowed to deploy this Worker through Wrangler. |

The workflow skips the Cloudflare deploy step, with a GitHub Actions notice, until
`CLOUDFLARE_API_TOKEN` exists. The Cloudflare account ID and bindings come from the committed
`apps/web/wrangler.jsonc` production config.

Keep `MTA_BUS_TIME_API_KEY` as a Cloudflare Worker secret, not a GitHub Actions secret, unless a
future workflow intentionally rotates deployed Worker secrets. The CI/CD workflow deploys code and
the committed Wrangler binding config only; it does not publish D1 seed SQL, upload R2 release
artifacts, or register a new release. Use [[#One-Time Release Publish]] for reviewed serving-data
releases.

## Worker Deploy

Set the secret:

```bash
bunx --bun wrangler secret put MTA_BUS_TIME_API_KEY --cwd apps/web
```

Deploy:

```bash
bun --filter @bp/web build
bun --filter @bp/web deploy
```

When deploying with the Cloudflare Vite plugin, verify that the generated deploy config preserves
the D1/R2 bindings. If `apps/web/dist/bus_priority_impact_studio/wrangler.json` has empty
`d1_databases`, `r2_buckets`, or `vars`, deploy directly from the source config instead:

```bash
CLOUDFLARE_ACCOUNT_ID=7aa7065a7e971d97435b3f22098d78b0 bunx wrangler deploy --config wrangler.jsonc
```

Verify the API against deployed D1/R2:

```bash
curl -fsS 'https://<worker-host>/api/v1/status'
curl -fsS 'https://<worker-host>/api/v1/routes?limit=5'
curl -fsS 'https://<worker-host>/api/v1/map/manifest'
```

Expected behavior:

- `/api/v1/status` reports the latest passing release's `releaseId`, `publishedAt`, and coverage.
- Recovered March GTFS-RT is labeled `third_party_recovered`.
- Map manifest returns R2-backed artifact API paths.
- API responses do not claim official historical GTFS-RT backfill.

The frontend is served from the root Worker URL:

```text
https://bus-priority-impact-studio.c20carroll.workers.dev/
```

URLs under `/api/v1/artifacts/*` are raw data/artifact endpoints, not frontend pages.

## Scheduled GTFS-RT Capture Verification

The Worker cron runs once per minute. With `GTFS_RT_SAMPLES_PER_CRON=2` and `GTFS_RT_SAMPLE_SECONDS=30`, each invocation should write two vehicle-position protobuf snapshots and two JSON manifests to `GTFS_RT_RAW`.

Expected object key shape:

```text
gtfs-rt/vehicle_positions/YYYY-MM-DD/YYYY-MM-DDTHHMMSSmmmZ.pb
gtfs-rt/vehicle_positions/YYYY-MM-DD/YYYY-MM-DDTHHMMSSmmmZ.json
```

The current Worker stamp strips punctuation from `Date.toISOString()`, so milliseconds are included.
For example, noon UTC becomes `2026-05-17T120000000Z`.

Wrangler can fetch exact object keys but does not provide an object-listing command in this version. Build the manifest object-key list from the Cloudflare dashboard, an R2 inventory/export, or a small admin-only listing tool if one is added later.

The first production smoke proof is complete as of 2026-05-17: the deployed cron wrote
vehicle-position objects under `gtfs-rt/vehicle_positions/2026-05-17/`, two manifests and paired
protobufs were mirrored locally, and `ingest:gtfs-rt-snapshots` parsed 3,612 vehicle-position rows
with 0 parse errors. That proves the deployed bindings and handoff path. It does not prove a
production-length reliability window by itself.

Use this proof ladder after each deploy or capture-config change:

| Proof | How to verify | Passing evidence |
|---|---|---|
| Binding proof | Confirm deployed Worker config or Cloudflare dashboard bindings. | `DB`, `ARTIFACTS`, `GTFS_RT_RAW`, cron, and cadence vars are present; `MTA_BUS_TIME_API_KEY` is a secret. |
| Write proof | Inspect the raw R2 bucket after at least one cron interval. | Paired `.json` and `.pb` objects exist under the expected date prefix. |
| Cadence proof | Review a contiguous manifest sample. | Timestamps show two captures per minute, roughly 30 seconds apart. |
| Integrity proof | Mirror manifests and protobufs locally. | Manifest `objectKey`, `byteLength`, and `sha256` match the paired protobuf object. |
| Parse proof | Run the local handoff commands. | `import:gtfs-rt-r2-manifests` and `ingest:gtfs-rt-snapshots` complete with nonzero vehicle positions and 0 parse errors. |
| Reliability proof | Process a 4-hour-or-longer window. | `build:observed-headways`, `route-observed-reliability`, and `gtfs-rt:preflight` pass default thresholds. |

## Raw GTFS-RT Retention And Cost Guardrail

Keep the raw GTFS-RT bucket on Standard storage and expire Worker-written raw snapshots after 21 days:

```bash
CLOUDFLARE_ACCOUNT_ID=7aa7065a7e971d97435b3f22098d78b0 bunx wrangler r2 bucket lifecycle add bus-priority-gtfs-rt-raw expire-gtfs-rt-after-21-days gtfs-rt/ --expire-days 21 --force
CLOUDFLARE_ACCOUNT_ID=7aa7065a7e971d97435b3f22098d78b0 bunx wrangler r2 bucket lifecycle list bus-priority-gtfs-rt-raw
```

This matters because strict 30-second collection writes about 2,880 protobuf snapshots per day.
Using the observed local average of roughly 146 KB per protobuf, a full 30-day month is about 12.6
GB. A 21-day expiration keeps retained raw GTFS-RT closer to 8.8 GB before manifests, under the 10
GB-month R2 Standard free storage allowance. Monthly analysis still needs a mirrored/imported run
before expiration if the raw public/self-collected evidence is part of a promoted observed release.

## R2-To-Pipeline Handoff

Create a reviewed manifest key file. For a smoke proof, include a few contiguous manifest keys. For
a production-length proof, use a contiguous 4-hour-or-longer window; 24 hours is preferred when the
run will become a current realtime appendix.

```text
data/ops/gtfs-rt-manifests.txt
```

Each non-comment line should be one manifest key:

```text
gtfs-rt/vehicle_positions/2026-06-01/2026-06-01T000000000Z.json
gtfs-rt/vehicle_positions/2026-06-01/2026-06-01T000030000Z.json
```

Dry-run the mirror. This command uses the R2 S3-compatible API through Bun and is concurrent by
default, so it can handle production-length windows without one Wrangler process per object:

```bash
bun run pull:gtfs-rt-r2-run -- --r2 bus-priority-gtfs-rt-raw --run-id gtfs-rt-prod-2026-06-01 --manifest-list data/ops/gtfs-rt-manifests.txt
```

Execute the mirror:

```bash
bun run pull:gtfs-rt-r2-run -- --r2 bus-priority-gtfs-rt-raw --run-id gtfs-rt-prod-2026-06-01 --manifest-list data/ops/gtfs-rt-manifests.txt --concurrency 24 --execute
```

Required environment: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.

Then run the printed import command and normal pipeline handoff:

```bash
bun run import:gtfs-rt-r2-manifests -- --run-id gtfs-rt-prod-2026-06-01 --manifest-root data/raw/r2-mirror/gtfs-rt-prod-2026-06-01/gtfs-rt/vehicle_positions --raw-root data/raw/r2-mirror/gtfs-rt-prod-2026-06-01
bun run ingest:gtfs-rt-snapshots -- --run-id gtfs-rt-prod-2026-06-01
bun run build:observed-headways -- --run-id gtfs-rt-prod-2026-06-01
bun run route-observed-reliability -- --run-id gtfs-rt-prod-2026-06-01 --year 2026 --month 6
bun run gtfs-rt:preflight -- --run-id gtfs-rt-prod-2026-06-01 --year 2026 --month 6
```

For a production-length proof, also write run-status artifacts before and after parsing:

```bash
bun run gtfs-rt:run-status -- --run-id gtfs-rt-prod-2026-06-01
bun run gtfs-rt:preflight -- --run-id gtfs-rt-prod-2026-06-01 --year 2026 --month 6 --min-gtfs-rt-collection-hours 4 --max-gtfs-rt-sample-seconds 60 --min-gtfs-rt-vehicle-position-snapshot-share 0.8
```

Default preflight thresholds are intentionally modest for appendix readiness: at least 4 collection
hours, max 60-second sample cadence, at least 80% successful vehicle-position snapshot coverage,
and at least 30 observed headway samples. A full observed monthly promotion should use stricter
month-aligned QA through `check:pipeline-v1` and `audit:pipeline-v1`.

## Monthly Public-Source Watcher

The scheduled Worker writes a compact route-speed availability artifact to `ARTIFACTS`:

```text
source-availability/route-speed-availability-worker.json
```

If that artifact says `shouldRebuild = true`, build a release from the new complete public-speed
partition:

```bash
bun run plan:source-refresh -- --start-year 2026 --end-year 2026 --year <YYYY> --month <M> --last-built-year 2026 --last-built-month 3 --min-speed-routes 300
bun run finalize:pipeline-v1 -- --year <YYYY> --month <M> --run-id <matching-gtfs-rt-run-id>
bun run check:pipeline-v1 -- --year <YYYY> --month <M>
bun run pipeline map release --year <YYYY> --month <M> --context-source <reviewed-borough-boundary.csv>
bun run publish:serving-release -- --month <YYYY-MM> --d1 bus-priority-serving --r2 bus-priority-artifacts
```

Only run the final publish with `--execute` after QA passes and the new month is approved.

After publication, confirm `/api/v1/status` reports the new `releaseId`, `publishedAt`, and coverage
window. Data publication does not require a Worker month variable or a code redeploy.

## Completion Evidence

The deployed serving and capture path is smoke-proven when all of these are true:

1. `apps/web/wrangler.jsonc` or deployment environment contains real `DB`, `ARTIFACTS`, and `GTFS_RT_RAW` bindings.
2. `MTA_BUS_TIME_API_KEY` is set as a Worker secret.
3. `publish:serving-release --execute` has loaded D1 and uploaded R2 artifacts.
4. Deployed `/api/v1/status`, `/api/v1/routes`, and `/api/v1/map/manifest` return real production payloads.
5. Scheduled capture writes GTFS-RT protobuf and manifest objects to `GTFS_RT_RAW`.
6. `pull:gtfs-rt-r2-run --execute` mirrors a real deployed capture run.
7. `import:gtfs-rt-r2-manifests` plus `ingest:gtfs-rt-snapshots` succeeds for that run with nonzero parsed vehicle positions.
8. A monthly speed watcher artifact exists and its rebuild decision has been reviewed.
9. `GTFS_RT_RAW` has the `expire-gtfs-rt-after-21-days` lifecycle rule enabled for `gtfs-rt/`.

The realtime processing path is production-length proven only after a contiguous 4-hour-or-longer
deployed run also passes `build:observed-headways`, `route-observed-reliability`, and
`gtfs-rt:preflight`. A captured month becomes a full observed release only after the same month has
complete public speed coverage and strict `check:pipeline-v1` plus `audit:pipeline-v1` pass.
