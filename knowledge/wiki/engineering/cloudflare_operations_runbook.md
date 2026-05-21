---
title: Cloudflare Operations Runbook
type: engineering
status: active
last_updated: 2026-05-21
owner: codex
source_count: 0
tags: [cloudflare, worker, d1, r2, operations, gtfs-rt]
---

# Cloudflare Operations Runbook

## Purpose

This runbook turns the local March 2026 v1 serving release into a deployed Cloudflare app and keeps current GTFS-RT capture running after deploy.

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
| `BASELINE_MONTH` | var | `2026-03` for the current v1 release. |
| `LAST_BUILT_SPEED_MONTH` | var | `2026-03` until a newer complete public speed month is promoted. |
| `GTFS_RT_SAMPLES_PER_CRON` | var | `2` for two samples per one-minute cron. |
| `GTFS_RT_SAMPLE_SECONDS` | var | `30` for strict 30-second GTFS-RT cadence. |

## Wrangler Config Block

After resource creation, add the real identifiers to `apps/web/wrangler.jsonc`. The same shape is
available in `apps/web/wrangler.production.example.jsonc`:

```jsonc
"vars": {
  "BASELINE_MONTH": "2026-03",
  "LAST_BUILT_SPEED_MONTH": "2026-03",
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

## One-Time Release Publish

Build and verify local serving outputs first:

```bash
bun run check:pipeline-v1 -- --year 2026 --month 3
bun run export:d1 -- --year 2026 --month 3
bun run verify:d1 -- --year 2026 --month 3
```

Dry-run the publish commands:

```bash
bun run publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts
```

Publish only after reviewing the generated D1 and R2 commands:

```bash
bun run publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts --execute
```

This is not a cron job. Run it when promoting a baseline month or a corrected release artifact set.

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
artifacts, or promote a new baseline month. Use [[#One-Time Release Publish]] for reviewed serving
data releases.

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
curl -fsS 'https://<worker-host>/api/v1/status?month=2026-03'
curl -fsS 'https://<worker-host>/api/v1/routes?month=2026-03&limit=5'
curl -fsS 'https://<worker-host>/api/v1/map/manifest?month=2026-03'
```

Expected behavior:

- `/api/v1/status` reports `baselineMonth = 2026-03`.
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

Dry-run the mirror:

```bash
bun run pull:gtfs-rt-r2-run -- --r2 bus-priority-gtfs-rt-raw --run-id gtfs-rt-prod-2026-06-01 --manifest-list data/ops/gtfs-rt-manifests.txt
```

Execute the mirror:

```bash
bun run pull:gtfs-rt-r2-run -- --r2 bus-priority-gtfs-rt-raw --run-id gtfs-rt-prod-2026-06-01 --manifest-list data/ops/gtfs-rt-manifests.txt --execute
```

Use plain `bunx wrangler` for R2 object transfers. In this environment, forcing Wrangler through
`bunx --bun wrangler` produced zero-byte payloads for larger R2 transfers.

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

If that artifact says `shouldRebuild = true`, run the baseline promotion pipeline for the new complete public speed month:

```bash
bun run plan:source-refresh -- --start-year 2026 --end-year 2026 --year <YYYY> --month <M> --last-built-year 2026 --last-built-month 3 --min-speed-routes 300
bun run finalize:pipeline-v1 -- --year <YYYY> --month <M> --run-id <matching-gtfs-rt-run-id>
bun run check:pipeline-v1 -- --year <YYYY> --month <M>
bun run publish:serving-release -- --month <YYYY-MM> --d1 bus-priority-serving --r2 bus-priority-artifacts
```

Only run the final publish with `--execute` after QA passes and the new month is approved.

After promotion, update `BASELINE_MONTH` and `LAST_BUILT_SPEED_MONTH` in Worker vars and redeploy.

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
