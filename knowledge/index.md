# Wiki Index

Read this file first. It is the navigation layer for the LLM wiki.

## Architecture decisions (ADRs)

ADRs live in `docs/decisions/` (not under `knowledge/wiki/`). Notable: 0007
adopts spatialite as a loadable SQLite extension in the local pipeline only,
for route ⇄ LION corridor joins.

## Project pages

- [[wiki/project/overview|Project overview]] — Product thesis, goals, and non-goals.
- [[wiki/project/business_problem|Business problem]] — Why bus priority / reliability intervention ranking is the right MTA-shaped problem.
- [[wiki/project/mvp|MVP]] — First build scope, P0/P1 features, demo route selection.
- [[wiki/project/ai_interaction_model|AI interaction model]] — Product doctrine for non-chat LLM surfaces, analyst-in-the-loop mechanics, visual conventions, and deterministic boundaries.
- [[wiki/project/metrics|Metrics]] — Speed, travel time, ridership weighting, bunching, reliability, intervention scoring.
- [[wiki/project/codex_roadmap|Codex roadmap]] — Ordered tasks for Codex implementation.
- [[wiki/project/managed_services_options|Managed services options]] — Managed-service/VPS decision memo for cheap MVP hosting, serving databases, search, and migration path.

## Data pages

- [[wiki/data/source_registry|Source registry]] — Master list of datasets, APIs, docs, endpoints, and priorities.
- [[wiki/data/mta_open_data_program|MTA Open Data Program]] — Context for why this project aligns with MTA Data & Analytics.
- [[wiki/data/mta_developer_resources|MTA Developer Resources]] — GTFS static, realtime feeds, Bus Time APIs, and terms.
- [[wiki/data/mta_bus_route_segment_speeds|MTA Bus Route Segment Speeds]] — Core speed/travel-time dataset.
- [[wiki/data/mta_bus_geospatial|MTA Bus Routes and Stops]] — Route shapes and stop geometry.
- [[wiki/data/mta_bus_ridership|MTA Bus Hourly Ridership]] — Rider-impact weighting.
- [[wiki/data/mta_bus_schedules_and_gtfs|MTA Bus Schedules and GTFS]] — Schedule, timepoints, and planned service baseline.
- [[wiki/data/mta_bus_time_realtime|MTA Bus Time Realtime]] — Optional collection of vehicle positions/trip updates/headways.
- [[wiki/data/ace_enforcement|ACE routes and violations]] — Intervention history and enforcement outcomes.
- [[wiki/data/nyc_dot_bus_lanes|NYC DOT bus lanes]] — Street-level bus-lane presence.
- [[wiki/data/service_alerts_and_planned_changes|Service alerts and planned changes]] — Disruption/context filters.
- [[wiki/data/policy_docs_corpus|Policy/docs corpus]] — Board materials, open-data plans, press releases, MTA blog posts, and LLM-assisted candidate extraction.

## Engineering pages

- [[wiki/engineering/package_structure|Repo package structure]] — TypeScript-only monorepo layout, package boundaries, Drizzle adoption boundaries, wiki relocation, and Python/PostGIS/VPS escalation rules.
- [[wiki/engineering/data_model|Data model]] — D1/SQLite serving model, Drizzle schema split, JSON cleanup plan, local artifacts, and migration path to Postgres/Hyperdrive.
- [[wiki/engineering/etl_plan|ETL plan]] — Ingestion order, Drizzle/D1 migration workflow, local backfill rules, transformation rules, and QA.
- [[wiki/engineering/local_pipeline_db_cutover|Local pipeline DB cutover plan]] — Plan to replace DB-shaped JSON handoffs with `@bp/db/local` SQLite/Drizzle tables and shrink `tools/pipeline`.
- [[wiki/engineering/data_pipeline_v1_completion_plan|Data Pipeline v1 completion plan]] — Approved v1 finish line for GTFS-RT reliability, intervention evaluation, corridors, briefs, exports, and QA gates.
- [[wiki/engineering/data_infrastructure_v1_finish_plan|Data Infrastructure v1 finish plan]] — Remaining recovered GTFS-RT integration, D1/R2 publish, scheduling, and website unfixture gates.
- [[wiki/engineering/cloudflare_operations_runbook|Cloudflare operations runbook]] — Production D1/R2 bindings, serving publish, Worker deploy, scheduled GTFS-RT capture verification, and R2-to-pipeline handoff.
- [[wiki/engineering/web_api_endpoint_architecture|Web API endpoint architecture]] — Website-facing Worker API plan for route cards, profiles, hotspots, compare, map manifests, and completeness-aware status.
- [[wiki/engineering/serving_storage_split_plan|Serving storage split plan]] — Resource-first D1/R2 storage split, page-shaped projection rules, endpoint backing targets, and migration phases.
- [[wiki/engineering/website_data_support_audit|Website data support audit]] — Current frontend/Worker data paths, mocked-vs-real status, Studio projection coverage gaps, and immediate support queue.
- [[wiki/engineering/web_app_support_plan|Web app support plan]] — Briefs, composer workflows, route-loader caching, deferred evidence payloads, and TanStack Router data-loading policy.
- [[wiki/engineering/agent_author_api|Agent-Author API]] — Write-side spec for agents-as-authors, canonical brief-composition walkthrough, mid-layer data endpoints, async job semantics, idempotency, and dogfeed test.
- [[wiki/engineering/web_observability_performance_seo_plan|Web observability, performance, and SEO plan]] — Lighthouse route matrix, Core Web Vitals/RUM posture, SEO crawlability checks, Worker timing, and release gates.
- [[wiki/engineering/website_hard_cutover_plan|Website hard cutover plan]] — Canonical route-first website IA, design reference mapping, schema-first API plan, and CLI/docs direction.
- [[wiki/engineering/generated_cli_distribution_plan|Generated CLI and distribution plan]] — Cloudflare-style runtime schema/codegen pipeline, compiled Bun CLI binary release manifest, package-manager wrappers, guard rails, and rollback.
- [[wiki/engineering/map_strategy|Map strategy]] — MapLibre, GeoJSON/PMTiles artifacts, NYC scope, and map package responsibilities.
- [[wiki/engineering/llm_wiki_rag|LLM wiki + RAG layer]] — How the persistent wiki and cited answer layer should work.
- [[wiki/engineering/tier_2_document_corpus_pipeline|Tier 2 document corpus pipeline]] — Plan for intervention/policy document capture, extraction, validation, and detector integration.
- [[wiki/engineering/cli_commands|CLI commands]] — TypeScript `/pipeline` command targets for source probes, ingest, analytics builds, exports, and wiki linting.
- [[wiki/engineering/testing_standards|Testing standards]] — Bun-first tests, TDD loop, Zod contracts, optimized pre-push hooks, and Cloudflare Worker production harnesses.
- [[wiki/engineering/source_linting|Source linting]] — Required checks before source-backed claims.

## Analysis pages

- [[wiki/analysis/hotspot_detection|Hotspot detection]] — How to identify slow segments and persistent bottlenecks.
- [[wiki/analysis/route_score|Route score]] — Transparent route ranking formula.
- [[wiki/analysis/ace_impact_evaluation|ACE impact evaluation]] — Before/after and event-study design.
- [[wiki/analysis/memo_generation|Memo generation]] — Route-improvement brief format.
- [[wiki/analysis/methodology_validation|Methodology validation]] — Code-level audit of analysis correctness, limitations, and gaps.
- [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding coverage and corpus expansion]] — Post-v1 plan for missed-finding risk, detector coverage, source-gap findings, and data-corpus expansion.

## Templates

- [[wiki/templates/dataset_page_template|Dataset page template]]
- [[wiki/templates/analysis_page_template|Analysis page template]]
- [[wiki/templates/route_brief_template|Route brief template]]

## Immediate open issues

1. Move realtime production capture from smoke proof to production-length proof: mirror a contiguous
   4-hour-or-longer Worker/R2 capture run, import manifests, parse protobufs, build observed
   headways, generate route reliability, and run `gtfs-rt:preflight`.
2. Surface the completed official 24-hour Bus Time run
   `gtfs-rt-v1-20260517T103607Z-24h` through the public API: D1 has the May 2026 observed appendix,
   but `/api/v1/status` and `/api/v1/studio/*` do not yet expose it as the current observed signal.
3. Keep the scheduled production source refresh small and durable: Worker cron writes GTFS-RT
   protobuf/manifests to R2, the monthly route-speed watcher writes availability artifacts, and
   heavy rebuild/finalize/export stays in the Bun pipeline.
4. Expand the real `/api/v1/studio/*` projection surface beyond the current curated R2 slice:
   frontend loaders already call real Studio endpoints, but Studio routes/briefs/findings do not yet
   cover the full D1-backed serving release.
5. Implement the web app support plan: split brief evidence/history projections from full brief
   bodies, add signal-aware route loaders, route-specific cache policy, deferred non-critical
   evidence/map panels, and a feature-flagged composer draft API.
6. Add web release gates: Lighthouse route matrix, SEO crawlability checks, Worker
   `Server-Timing`, and no-D1 RUM.
7. Generate `/docs` API metadata from the same package-level Studio runtime contracts that serve
   `GET /api/openapi.json`.
8. Keep `Baseline Release`, `Current Signal`, `Pending Publication`, and `Observed Release` labels
   wired through audit artifacts, Studio projections, and frontend-facing briefs. March 2026 is the
   current observed release candidate with `third_party_recovered` provenance; May 2026 is the
   official self-collected current observed appendix until matching public speed rows exist.
9. Reduce remaining bus-lane source gaps where public dates can be recovered, and get external
   transit-domain review of the peer-adjusted ACE/ABLE/bus-lane method before causal claims.
10. Start the post-v1 finding coverage track: emit detector considered/hit/skipped counts, source-gap
    findings, join success metrics, and a Tier 1 corpus probe backlog before claiming that quiet
    routes/corridors have no issues.
11. Add the Tier 2 document corpus pipeline for policy/intervention documents, but keep source
    promotion, entity linking, metric computation, and publish validation deterministic.
12. Route score uses a two-factor formula; incorporate ridership weight, persistence, reliability,
    and intervention gap or demote score behind brief evidence.
13. Keep the MVP TypeScript-only and D1 as a compact serving projection unless a documented
    requirement forces Python/PostGIS/VPS or Postgres/Hyperdrive escalation.
