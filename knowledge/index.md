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

- [[wiki/engineering/package_structure|Repo package structure]] — TypeScript-only monorepo layout, package boundaries, wiki relocation, and Python/PostGIS/VPS escalation rules.
- [[wiki/engineering/data_model|Data model]] — D1/SQLite serving model, local artifacts, and migration path to PostGIS.
- [[wiki/engineering/etl_plan|ETL plan]] — Ingestion order, transformation rules, and QA.
- [[wiki/engineering/llm_wiki_rag|LLM wiki + RAG layer]] — How the persistent wiki and cited answer layer should work.
- [[wiki/engineering/cli_commands|CLI commands]] — TypeScript `/pipeline` command targets for source probes, ingest, analytics builds, exports, and wiki linting.
- [[wiki/engineering/testing_standards|Testing standards]] — Bun-first tests, TDD loop, Zod contracts, optimized pre-push hooks, and Cloudflare Worker production harnesses.
- [[wiki/engineering/source_linting|Source linting]] — Required checks before source-backed claims.

## Analysis pages

- [[wiki/analysis/hotspot_detection|Hotspot detection]] — How to identify slow segments and persistent bottlenecks.
- [[wiki/analysis/route_score|Route score]] — Transparent route ranking formula.
- [[wiki/analysis/ace_impact_evaluation|ACE impact evaluation]] — Before/after and event-study design.
- [[wiki/analysis/memo_generation|Memo generation]] — Route-improvement brief format.

## Templates

- [[wiki/templates/dataset_page_template|Dataset page template]]
- [[wiki/templates/analysis_page_template|Analysis page template]]
- [[wiki/templates/route_brief_template|Route brief template]]

## Immediate open issues

1. Run schema probes for every Socrata dataset in `raw/source_manifest.yaml`.
2. Confirm exact field names for current bus routes/stops, schedules, ACE datasets, and bus lanes.
3. Decide whether to start with the M1 route, a Manhattan pilot, or the Comptroller/worst-route subset.
4. Decide how much realtime Bus Time data to collect; realtime collection is useful but not required for MVP.
5. Keep the MVP TypeScript-only unless a documented requirement forces Python/PostGIS/VPS escalation.
