---
title: Managed Services Options
type: project
status: active
last_updated: 2026-04-26
owner: codex
source_count: 27
tags: [infrastructure, hosting, managed-services, cloudflare, vps, cost]
---

# Managed Services Options


## Architecture update — package-structure review

A later engineering decision narrows the MVP implementation to a TypeScript-only monorepo. Historical alternatives in this memo, such as Python, GeoPandas, local Postgres/PostGIS, or a separate Pages + Workers split, are escalation options only. The concrete MVP package structure uses Cloudflare Workers Static Assets + Worker API, D1, R2, and local TypeScript pipeline jobs. See [[wiki/engineering/package_structure|Repo Package Structure]].

## Why this matters

Bus Priority Impact Studio has two very different workloads:

1. **Heavy deterministic analytics** — schema probes, historical backfills, route/stop geometry construction, geospatial joins, hotspot scoring, ACE/bus-lane before/after analysis, and memo artifact generation.
2. **Public serving** — mostly read-heavy route scorecards, maps, source cards, generated briefs, and lightweight search over a public wiki/docs corpus.

Those should not be hosted the same way. The cheapest credible MVP should make the expensive analytics reproducible and mostly offline, then publish small serving tables/artifacts to cheap managed infrastructure. This keeps the project portable and prevents the hosted application database from becoming an accidental analytics warehouse.

## What we know

### Project facts

- [Fact] The MVP can begin with one route or borough, especially an M1 route demo, then expand to Manhattan or a 20-route pilot. See [[wiki/project/mvp]].
- [Fact] Core P0/P1 data work is deterministic: source registry validation, Socrata metadata probes, segment-speed ingestion, route/stop geospatial ingestion, route-segment geometry construction, scorecards, hotspot maps, route briefs, ACE overlays, and bus-lane overlays. See [[wiki/engineering/etl_plan]].
- [Fact] The existing engineering direction assumes Postgres/PostGIS as a useful canonical analytics model, but the project does not yet require hosted Postgres for public serving. See [[wiki/engineering/data_model]].
- [Inference] The first public app can serve precomputed scorecards, PMTiles/GeoJSON/TopoJSON artifacts, charts, and route briefs without running dynamic geospatial SQL in production.

### Provider facts verified on 2026-04-26

- [Fact — S1] Cloudflare Workers Free includes 100,000 requests/day and 10 ms CPU time per invocation. Workers Standard includes 10 million requests/month and 30 million CPU-ms/month with a $5/month subscription, then usage-based overages. Cron Trigger and Queue Consumer invocations can run up to 15 minutes of CPU time.
- [Fact — S2] Cloudflare Pages Free allows 500 builds/month, 1 build at a time, 20-minute build timeout, 20,000 files/site, and 25 MiB max single asset. Larger files should go to R2.
- [Fact — S3/S4] Cloudflare D1 Free includes 5 million rows read/day, 100,000 rows written/day, and 5 GB total storage, but D1's limits page also says max database size is 500 MB on Free and 10 GB on Workers Paid. Treat the 500 MB per-database free limit as the operational guardrail.
- [Fact — S5] Cloudflare R2 Standard storage includes 10 GB-month free, 1 million Class A operations/month free, 10 million Class B operations/month free, and free egress from R2.
- [Fact — S6/S7] Cloudflare Vectorize lists 30 million queried vector dimensions/month and 5 million stored vector dimensions on Workers Free; current limits include 1,536 dimensions/vector, 10,000,000 vectors/index, and topK limits of 50 with values/metadata.
- [Fact — S8] Cloudflare Queues have 128 KB message size, 100-message max batch size, 25 GB per-queue backlog, 15-minute consumer wall-clock duration, and a Free-plan message retention fixed at 24 hours.
- [Fact — S9] Cloudflare Cron Triggers execute in UTC; trigger changes can take up to 15 minutes to propagate.
- [Fact — S10] Neon Free includes 100 projects, 100 CU-hours/month per project, 0.5 GB storage/project, scale-to-zero after 5 minutes idle, 5 GB public network transfer, and up to 2 CU / 8 GB RAM. Neon Launch is usage-based with no monthly minimum; compute is $0.106/CU-hour and storage is $0.35/GB-month.
- [Fact — S10/S11/S12] Neon supports a Postgres extensions library including PostGIS and pgvector.
- [Fact — S13/S14/S15] Supabase Free provides two free projects, 500 MB database/project, 5 GB egress, 1 GB file storage, 500,000 Edge Function invocations, and 50,000 MAU. Pro has a fixed subscription fee and usage quotas; the monthly invoice docs refer to a $25 Pro subscription fee and $10 compute credits. Supabase supports PostGIS and pgvector.
- [Fact — S16/S17/S18] Turso Free includes 100 databases, 5 GB storage, 500 million rows read/month, 10 million rows written/month, 3 GB monthly syncs, and 1-day PITR. Turso native vector search exists without an extension. Turso billing counts row scans, so full scans and complex joins can burn rows read.
- [Fact — S19/S20] Railway Hobby is $5 minimum usage with $5 monthly usage credits; Railway Free/Trial has small resource limits, and cron jobs are Free Trial only. Railway Postgres templates are unmanaged, and default templates do not include extensions; PostGIS/pgvector templates exist in the marketplace.
- [Fact — S21/S22] Render offers free static sites, free web services, and free Render Postgres, but free web services spin down after 15 minutes idle, take about one minute to spin up, and lose local filesystem changes. Free Render Postgres is fixed at 1 GB and expires 30 days after creation. Render paid web services start at $7/month and paid Postgres starts at $6/month for Basic-256mb; cron jobs start at $1/month.
- [Fact — S23/S24] Fly.io is usage-based. Managed Postgres starts at $38/month plus $0.28/provisioned GB-month and supports pgvector and PostGIS. Fly Postgres unmanaged is explicitly not a managed database service and is not supported like Managed Postgres.
- [Fact — S25/S26] A plain DigitalOcean Basic Droplet starts at $4/month for 512 MiB RAM, 1 vCPU, 10 GiB SSD, and 500 GiB transfer; additional outbound transfer is $0.01/GiB.

## Evaluation criteria

1. **Minimum monthly cost** — can the public demo stay near $0? What is the first paid cliff?
2. **Operational simplicity** — no server patching, no database backups to manage, no accidental 24/7 warehouse cost.
3. **Portability** — repo boundaries should let us move from D1/Turso/Neon/VPS without rewriting analytics.
4. **Separation of compute and serving** — heavy analysis should not run in the public request path.
5. **Geospatial support** — PostGIS is useful for development/analysis, but not automatically required in production serving.
6. **Search support** — document/wiki search should start cheap and auditable; vector search should be optional.
7. **Runtime limits** — batch jobs must not silently fail because of serverless CPU/build/queue limits.
8. **Cost predictability** — avoid row-scan surprises, object-operation surprises, and always-on compute unless needed.

## Candidate architectures

### Architecture A — local batch + Cloudflare public serving

**Use for cheapest credible MVP.**

- Local developer machine: Bun-run TypeScript pipeline jobs, with DuckDB/Turf added only when a concrete transform needs them.
- Build artifacts: route scorecards, segment hotspot tables, map tiles/GeoJSON/PMTiles, route briefs, source manifest, document search index.
- Cloudflare Workers Static Assets: React/Vite frontend plus thin Worker API.
- Cloudflare D1: small serving database for route metadata, scores, source cards, and precomputed queryable tables.
- Cloudflare R2: larger artifacts such as PMTiles, GeoJSON, Parquet extracts, generated route briefs, and static search indexes.
- Search: client-side/static MiniSearch/FlexSearch/Lunr index first; optional D1 FTS or Vectorize later.

[Inference] This is the best starting architecture because it matches the product's read-heavy public workload, avoids hosted warehouse costs, and keeps the hard geospatial work local and reproducible.

### Architecture B — local batch + Cloudflare frontend + Neon Postgres/PostGIS serving

**Use when dynamic geospatial queries become necessary.**

- Same local batch pipeline.
- Cloudflare Workers Static Assets + Worker API for frontend/API.
- Neon Postgres/PostGIS for dynamic map queries, spatial indexes, and/or pgvector if the document corpus outgrows static search.
- R2 remains the artifact store.

[Inference] This is the best flexible upgrade because Neon supports PostGIS/pgvector, has a useful Free plan for intermittent demos, and paid plans have no monthly minimum. It is more portable than D1 for geospatial SQL, but introduces DB operational/cost monitoring.

### Architecture C — Turso serving DB + static artifacts

**Use if we want a SQLite-first serving layer with cheap row quotas and native vector search.**

- Local batch exports SQLite/libSQL-compatible tables.
- Turso serves scorecards, search tables, and maybe vector search.
- R2 or another object store serves larger map artifacts.

[Inference] Turso is attractive for cheap read-heavy serving and native vector search, but it is not a PostGIS replacement. Keep geospatial joins offline.

### Architecture D — Render/Railway/Fly app hosting or plain VPS

**Use only when the app needs a real container/runtime.**

- FastAPI/Node API with Python dependencies and possibly self-managed Postgres/PostGIS.
- Render/Railway/Fly provide deploy workflows but introduce paid compute and/or unmanaged database tradeoffs.
- Plain VPS gives the lowest flat monthly host cost but shifts patching, backups, monitoring, firewalling, and recovery to us.

[Inference] This is not needed for the MVP unless we decide the public app must run long Python jobs, live collectors, or dynamic geospatial processing.

## Option comparison

| Provider/product | Free tier as of 2026-04-26 | Cheapest paid starting point | Major limits / gotchas | Strengths | Weaknesses | Fit for this project |
|---|---:|---:|---|---|---|---|
| Cloudflare Pages | 500 builds/month; 1 concurrent build; 20-minute build timeout; 20,000 files/site; 25 MiB max asset [S2] | Paid Cloudflare site plans; Workers Standard if using Functions heavily | Pages Functions count toward Workers quota; large assets need R2 [S2] | Excellent free static hosting, CDN, custom domains | Not a batch runner; build timeout too short for heavy ETL | **Excellent** for frontend |
| Cloudflare Workers | 100,000 requests/day free; 10 ms CPU/invocation [S1] | Workers Standard $5/month; 10M requests/month + 30M CPU-ms/month included [S1] | 5-minute CPU max per invocation; 15-minute CPU max for Cron/Queue consumers [S1] | Cheap API edge layer; good with D1/R2/KV | Not suitable for geospatial ETL or long Python analytics | **Excellent** as thin API |
| Cloudflare D1 | 5M rows read/day, 100k rows written/day, 5 GB account storage; operationally max 500 MB per free database [S3/S4] | Workers Paid D1 includes 25B rows read/month, 50M rows written/month, first 5 GB; max DB 10 GB [S3/S4] | SQLite, no PostGIS; row-scan pricing/quotas; 30s query duration from limits page [S4] | Serverless SQL, easy Cloudflare integration, good for precomputed small tables | Not an analytics warehouse; not a geospatial database | **Best serving DB for cheapest MVP** |
| Cloudflare R2 | 10 GB-month storage, 1M Class A ops, 10M Class B ops, free egress [S5] | $0.015/GB-month Standard; $4.50/M Class A; $0.36/M Class B [S5] | Operation costs can surprise if tiny files are read very often | Cheap artifact/object store; free egress | Not a query engine | **Excellent** for tiles/artifacts/docs |
| Cloudflare Cron + Queues | Cron via Workers; Queues Free retention fixed at 24h; queue limits include 128 KB messages, 25 GB backlog, 15-minute consumer duration [S8/S9] | Included in Workers paid/free with usage; Standard Worker $5/month if needed [S1] | Cron changes can take up to 15 minutes; UTC only; queue consumers still serverless-limited [S8/S9] | Useful for lightweight refresh pings, metadata checks, small async tasks | Not a replacement for batch ETL | **Use sparingly** |
| Cloudflare Vectorize | 30M queried vector dimensions/month and 5M stored dimensions; 1536 max dims/vector, 10M vectors/index [S6/S7] | Workers paid includes higher allocation; overage $0.01/M queried dims and $0.05/100M stored dims [S6] | Verify account availability before relying on it; topK/metadata limits | Cheap vector search if available; integrated with Workers | Less portable than static search or pgvector; not needed at first | **Optional P1/P2** |
| Neon Postgres | 100 CU-hours/month per project; 0.5 GB/project; scale-to-zero after 5 min idle; 5 GB transfer [S10] | Launch usage-based; $0.106/CU-hour and $0.35/GB-month; no monthly minimum [S10] | Free storage small; paid Free quotas do not carry over; monitor CU-hours [S10] | Real Postgres with PostGIS/pgvector; portable SQL; scales to zero | Costs if always-on or data grows; not free warehouse | **Best PostGIS upgrade** |
| Supabase | 2 free projects; 500 MB DB/project; 5 GB egress; 1 GB storage; 500k Edge Function invocations [S13] | Pro subscription fee is documented as $25/month; paid plans include quotas and $10 compute credits [S14] | Dedicated Postgres per project; each project increases compute costs; org-based billing [S13/S14] | Postgres, PostGIS, pgvector, auth/storage bundled | More product surface than needed; higher paid floor than Neon/D1 | **Good, but not cheapest** |
| Turso | 100 DBs, 5 GB storage, 500M rows read/month, 10M rows written/month [S16] | Developer $4.99/month [S16] | Billing counts row scans; joins/full scans can be expensive or blocked [S17] | Cheap SQLite/libSQL; native vector search [S18]; good portable serving DB | No PostGIS; geospatial joins must stay offline | **Good alternate serving/search DB** |
| Railway | Free trial with $5 credits; free plan has small resource limits; Hobby has $5 minimum usage with $5 credits [S19/S20] | Hobby $5/month minimum usage [S20] | Cron jobs Free Trial only on Free; Postgres templates are unmanaged and extension templates are marketplace options [S19/S20] | Easy containers, cron, databases, deployment | Less “managed DB” than it looks; not near-free after trial | **Use if container runtime needed** |
| Render | Free static sites, web services, Postgres, KV; free web spins down after 15 min; free Postgres 1 GB and expires after 30 days [S21/S22] | Web service Starter $7/month; Postgres Basic-256mb $6/month; cron jobs from $1/month [S22] | Free web cold start; ephemeral FS; free Postgres expiry; no production use on free [S21] | Simple app deploy; good demos; managed Postgres paid option | Free DB not durable; costs stack quickly | **Okay for demo API, not recommended core** |
| Fly.io | No current general free allowance for new users beyond trial/legacy; usage-based machines [S23] | Tiny/self-managed app costs vary by machine; Managed Postgres starts $38/month + storage [S24] | Managed Postgres paid floor high; unmanaged Postgres unsupported as managed service [S24] | Strong app platform; PostGIS/pgvector in Managed Postgres | Too expensive for MVP managed Postgres; self-managed DB ops burden | **Later app/VPS-adjacent option** |
| Plain VPS baseline: DigitalOcean Droplet | No meaningful free always-on tier in this baseline | $4/month: 512 MiB RAM, 1 vCPU, 10 GiB SSD, 500 GiB transfer [S25] | Self-managed OS, security, backups, Postgres, TLS, monitoring; $0.01/GiB extra outbound [S26] | Cheapest flat root access; can run Python/PostGIS/cron | Ops burden and reliability risk | **Only if concrete trigger appears** |

## Recommended MVP architecture

### Direct answers to the primary questions

1. **Can we do the MVP without any VPS?**  
   Yes. [Inference] The MVP is mostly read-heavy public serving over deterministic precomputed artifacts, so it can be hosted with Cloudflare Workers Static Assets + D1 + R2 while heavy computation stays local.

2. **Best managed-services architecture for the MVP?**  
   Use **Architecture A: local batch + Cloudflare public serving**.

3. **If no, what requirement forces a VPS?**  
   No current P0 requirement forces a VPS. See [[#What Actually Forces a VPS]].

4. **Which database should be the serving database for the MVP?**  
   **Cloudflare D1** for route metadata, source cards, precomputed scorecards, and small queryable tables. Store large geometry/tiles/artifacts in R2 instead of D1.

5. **Should Postgres/PostGIS be hosted from day one?**  
   No. Keep Postgres/PostGIS out of the MVP until a public feature requires dynamic spatial SQL. Use local TypeScript pipeline jobs, DuckDB spatial, and/or Turf for geometry construction and QA before escalating.

6. **Best low-cost path for document/wiki search?**  
   Start with a static generated lexical index, such as MiniSearch/FlexSearch/Lunr JSON, served from Pages/R2. Add D1 FTS tables or Turso if the index grows. Add Vectorize or pgvector only after there is a demonstrated semantic-search need.

7. **What should remain local batch compute?**  
   See [[#What Should Stay Local Even If Hosting Is Managed]].

8. **Cleanest migration path?**  
   Keep the current `tools/pipeline`, `packages/*`, `apps/web`, and `data/artifacts` boundaries so that the serving DB can move from D1 to Neon/PostGIS or a VPS without rewriting analytics.

### Cheapest credible MVP stack

**Local developer machine**

- Bun + TypeScript pipeline commands.
- Optional DuckDB spatial/Turf when route geometry construction needs spatial operations.
- Local scripts generate:
  - `data/artifacts/scorecards/*.json`
  - `data/artifacts/maps/*.pmtiles` or `*.geojson`
  - `data/artifacts/search/wiki_index.json`
  - `data/artifacts/briefs/*.md` / `*.html`
  - `data/artifacts/sqlite/serving.sqlite` for portability
  - D1 migration/load SQL.

**Managed public layer**

- Cloudflare Workers Static Assets for the frontend.
- Worker API endpoints for server-side reads.
- Cloudflare D1 for small serving tables.
- Cloudflare R2 for generated artifacts and larger map/search files.
- Cloudflare Cron only for metadata freshness checks or cache invalidation, not for ETL.
- No VPS.
- No hosted Postgres on day one.

**Suggested serving tables in D1**

- `routes(route_id, short_name, long_name, borough, status)`
- `route_scorecards(route_id, month, score_json, updated_at, artifact_url)`
- `segment_hotspots(route_id, segment_id, month, severity, speed_mph, artifact_url)`
- `source_cards(source_id, title, url, verified_at, dataset_id, status)`
- `briefs(route_id, month, title, summary, artifact_url)`

**Suggested R2 artifacts**

- PMTiles/GeoJSON route/segment geometry.
- Parquet extracts for reproducibility.
- Generated route briefs.
- Search index JSON.
- Raw-ish cached metadata snapshots that are safe to publish.

### More flexible “PostGIS may matter later” stack

Use this when the public UI needs dynamic spatial filters, live bounding-box queries, nearest-route/nearest-stop lookup, or interactive intervention overlays that cannot be precomputed cleanly.

- Cloudflare Workers Static Assets + Worker API remain the frontend/API shell.
- Neon Postgres/PostGIS becomes the serving database.
- R2 remains the artifact store.
- Optional pgvector in Neon if document search should live near relational source metadata.
- Heavy ETL still runs locally or in explicit batch jobs; Neon stores serving-ready tables, not raw warehouse-scale data.

[Inference] Neon is the cleanest PostGIS upgrade because it has PostGIS/pgvector, a real Postgres interface, scale-to-zero, and no monthly minimum on paid plans. Supabase is also technically capable, but its paid plan has a higher fixed-cost shape and bundles features this project does not need at MVP scale. Fly.io Managed Postgres is technically strong but its $38/month base is too high for this portfolio MVP.

### Rough monthly cost estimates

These estimates exclude LLM API usage, domain registration, paid map tiles, and developer-machine costs.

| Scenario | Stack | Expected monthly hosting cost | Notes |
|---|---|---:|---|
| Local-first + mostly free managed MVP | Local ETL + Cloudflare Workers Static Assets/Workers Free + D1 Free + R2 Free | **$0** | Assumes under 100k Worker requests/day, D1 under 500 MB per DB, R2 under 10 GB-month, and static search. |
| Light public demo traffic | Same Cloudflare stack, optionally Workers Standard | **$0–$5** | Pay $5 if Worker CPU/subrequests or comfort with higher included monthly quota matters. |
| Moderate portfolio/demo usage | Cloudflare Workers Standard + D1/R2 within included paid quotas | **$5–$15** | $5 base plus small overages if R2 ops or Worker CPU grow. Keep D1 queries indexed. |
| Flexible PostGIS demo | Cloudflare + Neon Free/Launch | **$0–$25+** | Neon Free may be enough for intermittent demo; Launch has no monthly minimum, but active compute/storage determine real cost. |
| Container/Python API demo | Render/Railway/Fly plus DB | **$7–$50+** | Use only when a real server process is necessary. Render free DB expires; Fly Managed Postgres starts high. |
| Plain VPS | DigitalOcean Basic Droplet + self-managed stack | **$4–$12+** | Cheap fixed cost, but ops/security/backups become part of the project. |

## What Actually Forces a VPS

Use a VPS only when at least one of these concrete triggers appears:

1. **Always-on realtime collection** — e.g. Bus Time polling every 30–60 seconds for weeks, with stateful buffering and retry behavior that is awkward or expensive in serverless.
2. **Long-running public-side compute** — ETL or geospatial jobs cannot be split and routinely exceed Cloudflare's 15-minute Cron/Queue consumer CPU ceiling or Pages' 20-minute build timeout.
3. **Native Python/geospatial runtime in production** — public endpoints must run GeoPandas/Shapely/GEOS/GDAL, not just serve precomputed artifacts.
4. **Self-hosted PostGIS is materially cheaper and acceptable** — data grows beyond D1/Neon-free limits, dynamic spatial SQL is required, and we accept backup/security/monitoring work.
5. **Custom daemons or unsupported extensions** — the project needs OS-level packages, background processes, custom queues, local files, or Postgres extensions not supported by the chosen managed DB.
6. **Predictable flat-cost compute beats managed overages** — row scans, object operations, or serverless CPU costs become harder to control than a small VM.

[Inference] None of these are required for the P0/P1 MVP. Realtime collection is explicitly optional and should be deferred until the static/public-data analysis is already compelling.

## What Should Stay Local Even If Hosting Is Managed

Keep these tasks local/offline even if the public app is fully managed:

- Socrata schema probes and metadata validation.
- Historical backfills.
- Route/stop/timepoint geometry construction.
- Geospatial joins between routes, stops, segments, ACE routes, and NYC DOT bus lanes.
- Hotspot scoring and route scoring.
- ACE before/after analysis and comparison-route selection.
- Data quality checks and source linting.
- Generated route briefs and reproducibility artifacts.
- Embedding generation, if using paid embedding APIs or local models.
- Monthly refresh builds until there is a proven need for scheduled hosted batch.

[Inference] The public app should publish the results of this work, not perform it on request.

## Migration path

### Phase 0 — local-first MVP

- Build the ETL locally.
- Export artifacts to `data/artifacts/` and commit small generated examples when they are intentionally fixture-sized.
- Validate source schemas and update wiki pages.
- Prototype the UI against local JSON/SQLite.
- Keep Postgres/PostGIS out unless a documented requirement forces that escalation.

### Phase 1 — managed/public MVP

- Deploy static UI through Cloudflare Workers Static Assets.
- Add Worker API endpoints.
- Load small serving tables into D1.
- Upload maps, briefs, and search artifacts to R2.
- Add CI task that verifies artifacts exist and D1 migrations are reproducible.
- Keep batch refresh manual/local.

### Phase 2 — managed refresh and better search

- Add lightweight Cloudflare Cron checks for source metadata freshness.
- Add a manual or scheduled artifact publish workflow.
- Choose one search path:
  - static lexical search if corpus remains small;
  - D1 FTS/Turso for hosted lexical/SQLite search;
  - Vectorize/pgvector for semantic search after corpus size and query needs justify it.

### Phase 3 — dynamic geospatial upgrade

- Move serving DB to Neon Postgres/PostGIS when map queries or spatial filters need dynamic SQL.
- Keep R2 for big artifacts.
- Keep D1 as optional edge cache or retire it.
- Add clear migrations from local model tables to Neon.

### Phase 4 — heavier production architecture

- Add explicit batch environment only when local refresh becomes painful.
- Consider Railway/Render/Fly/VPS only for a concrete container/runtime need or always-on collectors.
- Consider a real warehouse only if raw public-data backfills and analytic queries outgrow local TypeScript/DuckDB artifact builds.

## Caveats

- Provider pricing and limits are volatile. All source facts in this memo were verified on **2026-04-26**.
- Cloudflare D1 is a serving database here, not the analytics warehouse. Keep raw and heavy intermediate data local or in object storage.
- D1 documentation presents both total Free storage and per-database limits; use the stricter 500 MB free database size as the practical MVP cap.
- Cloudflare Vectorize looks cheap for small corpora, but semantic search should not be part of the critical path until the document corpus and retrieval evaluation exist.
- Render's free Postgres is not durable enough for this project because it expires after 30 days.
- Railway and Fly can feel like VPS replacements. For this MVP, they are only justified if containerized runtime needs beat Cloudflare/Neon simplicity.
- A plain VPS is cheap, but the cost comparison is misleading unless patching, monitoring, backups, TLS, secrets, and disaster recovery are treated as project work.
- LLM inference, embeddings, domain registration, analytics/monitoring vendors, and map tile providers are not included in the monthly estimates.

## Open questions

1. How large are the final serving tables after schema probes and the first route/borough pilot?
2. Should route geometry be served as PMTiles, GeoJSON, TopoJSON, or vector tiles?
3. Does the MVP need any dynamic spatial query, or can all map layers be precomputed?
4. How large will the policy/docs/wiki corpus be after ingestion?
5. Is lexical search sufficient for the first demo, or does semantic search materially improve the portfolio narrative?
6. Will realtime Bus Time collection be deferred fully, or should the repo include a disabled collector module?
7. Should D1 loads be generated from local SQLite migrations or from a typed TypeScript seed script?
8. Should the public demo display `last_refreshed_at` and `data_freshness_status` on every page?

## Sources

- S1. Cloudflare Workers pricing — https://developers.cloudflare.com/workers/platform/pricing/ — verified_at: 2026-04-26
- S2. Cloudflare Pages limits — https://developers.cloudflare.com/pages/platform/limits/ — verified_at: 2026-04-26
- S3. Cloudflare D1 pricing — https://developers.cloudflare.com/d1/platform/pricing/ — verified_at: 2026-04-26
- S4. Cloudflare D1 limits — https://developers.cloudflare.com/d1/platform/limits/ — verified_at: 2026-04-26
- S5. Cloudflare R2 pricing — https://developers.cloudflare.com/r2/pricing/ — verified_at: 2026-04-26
- S6. Cloudflare Vectorize pricing — https://developers.cloudflare.com/vectorize/platform/pricing/ — verified_at: 2026-04-26
- S7. Cloudflare Vectorize limits — https://developers.cloudflare.com/vectorize/platform/limits/ — verified_at: 2026-04-26
- S8. Cloudflare Queues limits — https://developers.cloudflare.com/queues/platform/limits/ — verified_at: 2026-04-26
- S9. Cloudflare Cron Triggers — https://developers.cloudflare.com/workers/configuration/cron-triggers/ — verified_at: 2026-04-26
- S10. Neon pricing — https://neon.com/pricing — verified_at: 2026-04-26
- S11. Neon PostGIS extension docs — https://neon.com/docs/extensions/postgis — verified_at: 2026-04-26
- S12. Neon pgvector extension docs — https://neon.com/docs/extensions/pgvector — verified_at: 2026-04-26
- S13. Supabase billing docs — https://supabase.com/docs/guides/platform/billing-on-supabase — verified_at: 2026-04-26
- S14. Supabase monthly invoice docs — https://supabase.com/docs/guides/platform/your-monthly-invoice — verified_at: 2026-04-26
- S15. Supabase PostGIS docs — https://supabase.com/docs/guides/database/extensions/postgis — verified_at: 2026-04-26
- S16. Turso pricing — https://turso.tech/pricing — verified_at: 2026-04-26
- S17. Turso usage and billing — https://docs.turso.tech/help/usage-and-billing — verified_at: 2026-04-26
- S18. Turso vector search — https://docs.turso.tech/guides/vector-search — verified_at: 2026-04-26
- S19. Railway pricing — https://railway.com/pricing — verified_at: 2026-04-26
- S20. Railway PostgreSQL docs — https://docs.railway.com/databases/postgresql — verified_at: 2026-04-26
- S21. Render free deploy docs — https://render.com/docs/free — verified_at: 2026-04-26
- S22. Render pricing — https://render.com/pricing — verified_at: 2026-04-26
- S23. Fly.io resource pricing — https://fly.io/docs/about/pricing/ — verified_at: 2026-04-26
- S24. Fly.io Managed Postgres — https://fly.io/docs/mpg/ — verified_at: 2026-04-26
- S25. DigitalOcean Droplet pricing — https://www.digitalocean.com/pricing/droplets — verified_at: 2026-04-26
- S26. DigitalOcean Droplet pricing docs — https://docs.digitalocean.com/products/droplets/details/pricing/ — verified_at: 2026-04-26
- S27. Supabase pgvector docs — https://supabase.com/docs/guides/database/extensions/pgvector — verified_at: 2026-04-26

Recommendation: Cloudflare Workers Static Assets + Worker API + D1 + R2 for the public MVP, with local TypeScript/DuckDB/Turf pipeline jobs precomputing artifacts and Neon Postgres/PostGIS reserved for the first dynamic geospatial upgrade.

Escalate to VPS when: use a VPS only when the project needs always-on collectors or long-running jobs that cannot be split into local batch artifacts or managed Postgres/serverless tasks.
