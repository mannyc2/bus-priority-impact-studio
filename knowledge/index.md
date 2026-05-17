# Wiki Index

Read this file first. It is the navigation layer for the LLM wiki.

## Project pages

- [[wiki/project/overview|Project overview]] — Product thesis, goals, and non-goals.
- [[wiki/project/business_problem|Business problem]] — Why bus priority / reliability intervention ranking is the right MTA-shaped problem.
- [[wiki/project/mvp|MVP]] — First build scope, P0/P1 features, demo route selection.
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
- [[wiki/data/policy_docs_corpus|Policy/docs corpus]] — Board materials, open-data plans, press releases, MTA blog posts.

## Engineering pages

- [[wiki/engineering/package_structure|Repo package structure]] — TypeScript-only monorepo layout, package boundaries, Drizzle adoption boundaries, wiki relocation, and Python/PostGIS/VPS escalation rules.
- [[wiki/engineering/data_model|Data model]] — D1/SQLite serving model, Drizzle schema split, JSON cleanup plan, local artifacts, and migration path to Postgres/Hyperdrive.
- [[wiki/engineering/etl_plan|ETL plan]] — Ingestion order, Drizzle/D1 migration workflow, local backfill rules, transformation rules, and QA.
- [[wiki/engineering/local_pipeline_db_cutover|Local pipeline DB cutover plan]] — Plan to replace DB-shaped JSON handoffs with `@bp/db/local` SQLite/Drizzle tables and shrink `tools/pipeline`.
- [[wiki/engineering/data_pipeline_v1_completion_plan|Data Pipeline v1 completion plan]] — Approved v1 finish line for GTFS-RT reliability, intervention evaluation, corridors, briefs, exports, and QA gates.
- [[wiki/engineering/map_strategy|Map strategy]] — MapLibre, GeoJSON/PMTiles artifacts, NYC scope, and map package responsibilities.
- [[wiki/engineering/llm_wiki_rag|LLM wiki + RAG layer]] — How the persistent wiki and cited answer layer should work.
- [[wiki/engineering/cli_commands|CLI commands]] — TypeScript `/pipeline` command targets for source probes, ingest, analytics builds, exports, and wiki linting.
- [[wiki/engineering/testing_standards|Testing standards]] — Bun-first tests, TDD loop, Zod contracts, optimized pre-push hooks, and Cloudflare Worker production harnesses.
- [[wiki/engineering/source_linting|Source linting]] — Required checks before source-backed claims.

## Analysis pages

- [[wiki/analysis/hotspot_detection|Hotspot detection]] — How to identify slow segments and persistent bottlenecks.
- [[wiki/analysis/route_score|Route score]] — Transparent route ranking formula.
- [[wiki/analysis/ace_impact_evaluation|ACE impact evaluation]] — Before/after and event-study design.
- [[wiki/analysis/memo_generation|Memo generation]] — Route-improvement brief format.
- [[wiki/analysis/methodology_validation|Methodology validation]] — Code-level audit of analysis correctness, limitations, and gaps.

## Templates

- [[wiki/templates/dataset_page_template|Dataset page template]]
- [[wiki/templates/analysis_page_template|Analysis page template]]
- [[wiki/templates/route_brief_template|Route brief template]]

## Immediate open issues

1. Decide whether v1 ships as March structural evidence plus a May observed-reliability appendix, or waits until public speed coverage exists for a later single strict v1 month.
2. March 2026 is structurally complete but has no March realtime samples; May 2026 has a passing observed GTFS-RT layer but no public speed coverage yet.
3. Add detailed observed reliability windows beyond route/month summaries.
4. Add seasonality-aware/matched-comparison intervention evaluation and dated bus-lane before/after analysis where source quality supports them.
5. Add richer segment-based corridor membership, corridor intervention context, map payload manifests, and detailed evaluation manifests.
6. Route score uses a two-factor formula; incorporate ridership weight, persistence, reliability, and intervention gap or demote score behind brief evidence.
7. Keep the MVP TypeScript-only unless a documented requirement forces Python/PostGIS/VPS escalation.
8. Keep D1 as a compact serving projection; promote canonical queryable history to Postgres/Hyperdrive instead of growing D1 into a warehouse.
