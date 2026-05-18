---
title: Serving Storage Split Plan
type: engineering
status: active
last_updated: 2026-05-18
owner: codex
source_count: 5
tags: [cloudflare, d1, r2, api, serving, projections, agents]
---

# Serving Storage Split Plan

## Purpose

The Studio API should be **resource-first**, not R2-first or D1-first. Public clients, website
loaders, generated docs, CLI commands, and coding agents depend on REST resources under
`/api/v1/studio/*`. Cloudflare storage products remain private implementation details behind the
Worker.

This page defines the target split:

- **D1 is the control plane**: compact relational state, indexes, manifests, current status, mutable
  draft state, job state, idempotency, and small queryable summaries.
- **R2 is the artifact plane**: immutable release documents, large nested payloads, maps, evidence
  bundles, exported brief bodies, raw-ish captures, and generated files.
- **The Worker owns resource semantics**: URL parsing, auth/feature gates, Zod validation, cache
  policy, observability, and mapping REST resources to D1 rows and R2 objects.

## Cloudflare Guidance

Cloudflare's storage selection guide maps object/blob storage to **R2** for user-facing web assets,
images, machine-learning and training datasets, analytics datasets, log and event data. It maps
lightweight SQL to **D1** for relational data such as user profiles, product listings, orders, and
customer data. The same guide points to **Durable Objects** for collaboration, global coordination,
real-time state, and strong per-object consistency; and **Queues** for background work.

Cloudflare describes R2 as S3-compatible object storage with no egress fees, strong consistency, and
high durability. It is a good fit for unstructured data that is frequently served over the internet.
Cloudflare describes D1 as a managed serverless SQLite database with Worker/API access, schema
management, import/export, query insights, and use cases that need relational storage or ad-hoc SQL.

Project interpretation:

- Use R2 when the payload is file-like, nested, immutable, large, or fetched by complete key.
- Use D1 when the payload is row-like, queryable, mutable, indexed, or part of workflow state.
- Use Durable Objects only if draft editing, publish locks, or collaboration need single-writer
  coordination that D1 plus idempotency keys cannot handle cleanly.
- Use Queues when agent-triggered work should continue outside the request/response path.

## Core Rule

```text
If the API needs WHERE route = ? AND month = ?, use D1.
If the API needs fetch this complete versioned object, use R2.
```

This is not a blanket rule that all page-shaped JSON must live in R2. A page-shaped projection
belongs in R2 only when it behaves like a release document: generated once, fetched whole, nested,
cacheable, immutable for the release, and expensive or awkward to assemble on every request.

## Data Placement

| Data | Target store | Notes |
|---|---|---|
| Route catalog, slugs, labels, boroughs, route type | D1 | Canonical queryable index for all active routes. |
| Route list cards, search fields, filter facets | D1 first | Can also emit an R2 list projection for cache, but D1 is the source for all-route coverage. |
| Route scorecard summaries by month | D1 | Compact monthly serving rows. |
| Route/month trends and comparison ranks | D1 | Queryable by route/month/window. |
| Observed reliability summary rows | D1 | Includes March recovered observed release and May current appendix rows. |
| Current observed signal summary | D1-derived response | Worker should aggregate latest non-baseline observed month from D1. |
| Segment hotspot summary rows | D1 | Good for tables, ranks, filters, and agent mid-layer queries. |
| Segment time-series windows | D1 if compact; R2 if dense | Monthly route/segment medians can be rows; dense arrays or chart-ready payloads can be R2. |
| Treatment state by route/segment/date | D1 | Agents need filtered lookup semantics. |
| Source snapshot and provenance metadata | D1 | Queryable audit trail. |
| Artifact manifest rows: key, hash, byte size, content type, release id | D1 | D1 points to R2 without storing object bodies. |
| Full route detail release documents | R2 when release-static | Generated from D1/R2 by `build:studio-release`, validated by domain schemas. |
| Finding detail and reasoning trails | R2 document plus D1 index | The list/search metadata is D1; full reasoning/evidence payload can be R2. |
| Published brief body JSON/Markdown/HTML/PDF | R2 | File-like published artifacts. |
| Brief gallery metadata | D1 first | R2 projection acceptable as generated cache, but all published briefs need D1 discoverability. |
| Brief evidence graph, citation payloads, export manifests | R2 plus D1 refs | R2 holds large bodies; D1 stores refs/search metadata. |
| Map GeoJSON, route-segment payloads, PMTiles | R2 | Large static artifacts, immutable under release/hash keys. |
| Static evaluation payloads | R2 plus D1 summary rows | Full JSON artifacts in R2; summary/index rows in D1. |
| GTFS-RT protobuf captures and manifests | Dedicated R2 raw bucket | Raw capture is never served directly through Studio resources. |
| Raw Parquet/CSV recovery inputs | Local generated data, optional private R2 | Not public serving data. |
| Draft brief metadata, status, title/dek | D1 | Mutable product state. |
| Draft claims, evidence refs, caveat refs, review comments | D1 | Patchable and queryable; enforce idempotency. |
| Async job status and idempotency keys | D1, with Queue/DO later if needed | Agents retry; writes must not duplicate drafts or publishes. |
| Large generated draft bodies, diffs, publish candidates | R2 plus D1 status rows | Keep mutable workflow state in D1 and large candidates in R2. |

## Page-Shaped Projections

Page-shaped projections belong in R2 only when they are **release documents**, not when they are
open-ended query results.

Good R2 release documents:

- `studio/v1/routes/{slug}/index.json` with route identity, KPIs, diagnosis, caveats, related
  findings, chart refs, and top segments.
- `studio/v1/routes/{slug}/ladder.json` when the ladder is a fixed monthly route artifact.
- `studio/v1/findings/{findingId}/index.json` with reasoning trail and evidence refs.
- `studio/v1/briefs/{briefId}/index.json` with published brief shell and claim/evidence refs.
- `studio/v1/methods.json` and `studio/v1/docs.json` when generated from versioned contracts.

Better D1-backed resources:

- `GET /api/v1/studio/routes?search=&borough=&limit=`.
- `GET /api/v1/studio/routes/{id}/segments?from=&to=&grain=`.
- `GET /api/v1/studio/data/violations?route=&segment=&from=&to=`.
- `GET /api/v1/studio/data/treatments?route=&asOf=`.
- `POST/PATCH/DELETE /api/v1/studio/briefs/*`.
- Any endpoint whose shape depends primarily on query params, pagination, current draft state, or
  agent retry semantics.

## Target Endpoint Backing

| Endpoint | Target backing | Migration note |
|---|---|---|
| `GET /api/v1/studio/routes` | D1 route/search index | Must cover all 381 catalog routes, not the current curated R2 slice. |
| `GET /api/v1/studio/search` | D1 index plus optional R2 docs index | Search all routes/briefs/findings; no object keys in responses. |
| `GET /api/v1/studio/routes/:routeId` | R2 release document generated for every public route | Include observed reliability fields sourced from D1. |
| `GET /api/v1/studio/routes/:routeId/ladder` | R2 release document or D1+R2 hybrid | Fixed monthly ladder can stay R2; queryable segment windows should be D1. |
| `GET /api/v1/studio/routes/:routeId/segments?from&to&grain` | D1 mid-layer rows | New agent-facing derived projection, no raw GTFS-RT rows. |
| `GET /api/v1/studio/data/violations` | D1 mid-layer rows | Route/segment/date filters. |
| `GET /api/v1/studio/data/treatments` | D1 mid-layer rows | Treatment-state-by-period. |
| `GET /api/v1/studio/data/cohorts` | R2 release document plus D1 route refs | Cohort definitions are release-stable, but route lookup is D1. |
| `GET /api/v1/studio/data/evidence` | D1 evidence index plus R2 payload refs | Search metadata in D1, detailed evidence bundles in R2. |
| `GET /api/v1/studio/findings` | D1 finding index or full R2 list projection generated from D1 | Must be all published findings, not a fixed demo subset. |
| `GET /api/v1/studio/findings/:id` | R2 release document | Reasoning trail and evidence refs. |
| `GET /api/v1/studio/briefs` | D1 brief metadata index | Gallery/list filters should not depend on a hand-picked R2 list. |
| `GET /api/v1/studio/briefs/:id` | D1 state + R2 published/draft body | Published body in R2; state/version/status in D1. |
| `GET /api/v1/studio/briefs/:id/evidence` | D1 evidence search + R2 evidence bundle | Split contract from full brief response. |
| `GET /api/v1/studio/briefs/:id/history` | D1 versions + R2 diff/body snapshots | Split contract from full brief response. |
| Write-side brief endpoints | D1 control rows + R2 large bodies | Feature-flag until auth/storage decisions are settled. |
| `GET /api/v1/status` | D1 release status plus latest appendix aggregation | Add current observed signal for May appendix-style rows. |
| `GET /api/v1/artifacts/*` | R2 controlled proxy | Keep for artifacts, not as the Studio product contract. |

## Migration Plan

### Phase 0: Guard the release pipeline

- Fix or remove the unused `runId` parameter in `replaceRouteObservedReliabilityRows` before the
  next appendix operation, so a bad month/run cannot silently clobber another observed layer.
- Standardize CLI month parsing enough that `--year 2026 --month 5` and `--month 2026-05` are not
  confused across jobs.
- Make D1 schema application idempotent through migrations or a documented `--skip-schema` path.
- Make R2 publishing manifest-driven or artifact-ref-validated, so D1/manifest rows cannot point at
  nested brief, map, evaluation, or Studio artifacts that were skipped by the upload glob.

### Phase 1: Make coverage visible

- Add a generated website data support audit artifact or wiki update for each release.
- Add a release manifest that records D1 route count, Studio projection route count, brief count,
  finding count, observed months, current signal month, and projection object count.
- Add a check that warns when Studio route coverage is a curated subset while D1 has full-route
  data.

### Phase 2: Expand read-side Studio coverage

- Change `build:studio-release` from a default curated route limit to a full public-route build, or
  make curated builds explicit with `--profile demo`.
- Include `route_observed_reliability_summary` in `StudioRoute` or a route-level observed block so
  March recovered reliability and May appendix evidence can surface through `/api/v1/studio/*`.
- Build route detail and ladder projections for every public route with available artifacts.
- Keep Worker behavior fail-closed when required projections are missing or invalid.

### Phase 3: Move queryable Studio resources to D1-backed handlers

- Back `GET /api/v1/studio/routes` and `GET /api/v1/studio/search` with D1 indexes so all routes are
  addressable.
- Add the agent mid-layer read endpoints for segments, violations, treatments, cohorts, and
  evidence. These return derived projections only.
- Keep full nested detail documents in R2 where they are release-static.

### Phase 4: Split brief payloads

- Split `StudioBriefResponse`, `StudioBriefEvidenceResponse`, and `StudioBriefHistoryResponse`.
- Store gallery/list metadata in D1 and published body/export/evidence bundles in R2.
- Keep R2 artifact refs private; expose product URLs and evidence IDs.

### Phase 5: Add write-side state deliberately

- Add feature-flagged D1 tables for draft briefs, claims, caveat/evidence refs, comments, versions,
  jobs, and idempotency keys.
- Write large generated body snapshots, diffs, exports, and publish candidates to R2 with hashes.
- Add Queue or Durable Object coordination only if D1 idempotency plus explicit publish locks are
  insufficient.

## Verification

Each migration slice should run the smallest relevant checks:

- `bun run check:knowledge` for docs-only changes.
- `bun run check:web-architecture` when runtime import/source boundaries change.
- `bun run test:worker` for Worker source changes.
- `bun run build:studio-release` plus a projection manifest diff for release-generation changes.
- `bun run verify:d1 -- --year <YYYY> --month <M>` when D1 export/query inputs change.
- A publish dry-run or release manifest check that proves every D1 artifact key and generated
  manifest object key appears in the intended R2 upload set.

## Sources

- Cloudflare Workers storage product guide — https://developers.cloudflare.com/workers/platform/storage-options/ — verified_at: 2026-05-18
- Cloudflare R2 "How R2 works" — https://developers.cloudflare.com/r2/how-r2-works/ — verified_at: 2026-05-18
- Cloudflare R2 storage classes — https://developers.cloudflare.com/r2/buckets/storage-classes/ — verified_at: 2026-05-18
- Cloudflare D1 overview — https://developers.cloudflare.com/d1/ — verified_at: 2026-05-18
- Cloudflare D1 pricing/rows-read guidance — https://developers.cloudflare.com/d1/platform/pricing/ — verified_at: 2026-05-18
