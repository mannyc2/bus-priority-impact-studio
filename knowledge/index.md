# Wiki Index

Read this file first. It is the navigation layer for the LLM wiki.

Reader's map: [analytics-primer.html](../analytics-primer.html) is the visual walkthrough of the analytics architecture.

Every page under `knowledge/wiki/` must have exactly one entry below — `check:knowledge`
fails on an unindexed page or on a link that does not resolve.

> **Generation 20 status (2026-08-01).** The current product is a public NYC bus route-evidence
> website backed by compact D1 serving tables, R2 route artifacts, and the standalone mta-wiki
> evidence backend. `tools/pipeline-v2` remains the canonical local CLI for source ingestion,
> analytics materialization, D1/R2 export, and verification. Generation 20 is an aggressive
> LOC cleanup: retired-program wiki pages, closed plan bodies, and superseded receipts were
> deleted from the working tree and live in git history. Current execution status for every
> open plan is in `plans/README.md`; its standing-rejections appendix is the "do not re-audit"
> surface.

> **Design and evidence authority.** Public page design authority is the operator's 2026-07-06
> UI/UX critique, recorded in [[wiki/engineering/studio_design_pass_status|Studio design-pass status]];
> it supersedes the July-4 design export. Document-derived route facts come from mta-wiki release
> artifacts and must render with citations. Public pages should not fabricate dates, metrics,
> impacts, or coverage claims. User-facing wording is governed by
> [[wiki/engineering/ui_copy_doctrine|UI copy doctrine]].

## Architecture decisions (ADRs)

ADRs live in `docs/decisions/` (not under `knowledge/wiki/`). Notable: 0007
adopts spatialite as a loadable SQLite extension in the local pipeline only,
for route ⇄ LION corridor joins; 0011, 0012, 0014, 0015, and 0016 are superseded
history after the generation-3 hard cutover and plan 024 cleanup; 0017 records the earlier move
away from a broad "monthly release" slogan, with its deliberate-publication and snapshot-evidence
rules still active while its baseline-month and release-month anchors are superseded by 0022;
0018 records the detector calibration/readiness loop: reviewed gold labels, suppress-leakage
evaluation, deterministic gates, and readiness buckets must separate detector signals from public
page eligibility; 0019 records the Effect runtime boundary for pipeline code; 0020 records Effect
Schema as the only first-party runtime schema layer and supersedes the Zod clause of ADR 0001; 0021
records native `nyc-transit-kit` consumption in the Effect zone, with compat limited to Promise-edge
packages such as Studio API; 0022 establishes publication-event release identity, per-dataset
coverage windows, multi-year source history, and an upstream-relative freshness ledger.

## Project pages

- [[wiki/project/overview|Project overview]] — Product thesis, goals, and non-goals.
- [[wiki/project/business_problem|Business problem]] — Why bus priority / reliability intervention ranking is the right MTA-shaped problem.
- [[wiki/project/mvp|MVP]] — First build scope, P0/P1 features, demo route selection.
- [[wiki/project/ai_interaction_model|AI interaction model]] — Product doctrine for non-chat LLM surfaces, analyst-in-the-loop mechanics, visual conventions, and deterministic boundaries.
- [[wiki/project/metrics|Metrics]] — Speed, travel time, ridership weighting, bunching, reliability, intervention scoring.
- [[wiki/project/managed_services_options|Managed services options]] — Managed-service/VPS decision memo for cheap MVP hosting, serving databases, search, and migration path.

## Data pages

- [[wiki/data/source_registry|Source registry]] — Master list of datasets, APIs, docs, endpoints, and priorities.
- [[wiki/data/public_facing_data_catalog|Public-facing data catalog]] — Canonical catalog of what the Studio may expose to public users and API consumers, and on what terms.
- [[wiki/data/mta_open_data_program|MTA Open Data Program]] — Context for why this project aligns with MTA Data & Analytics.
- [[wiki/data/mta_developer_resources|MTA Developer Resources]] — GTFS static, realtime feeds, Bus Time APIs, and terms.
- [[wiki/data/mta_bus_route_segment_speeds|MTA Bus Route Segment Speeds]] — Core speed/travel-time dataset.
- [[wiki/data/mta_bus_geospatial|MTA Bus Routes and Stops]] — Route shapes and stop geometry.
- [[wiki/data/mta_bus_ridership|MTA Bus Hourly Ridership]] — Rider-impact weighting.
- [[wiki/data/mta_bus_stop_boardings|MTA Bus Stop-Level Boardings]] — Source-gap page for stop-level boardings behind the Riders-tab top-stops surface and any passenger-load claim.
- [[wiki/data/mta_bus_schedules_and_gtfs|MTA Bus Schedules and GTFS]] — Schedule, timepoints, and planned service baseline.
- [[wiki/data/mta_bus_time_realtime|MTA Bus Time Realtime]] — Optional collection of vehicle positions/trip updates/headways.
- [[wiki/data/ace_enforcement|ACE routes and violations]] — Intervention history and enforcement outcomes.
- [[wiki/data/nyc_dot_bus_lanes|NYC DOT bus lanes]] — Street-level bus-lane presence.
- [[wiki/data/tsp_data_acquisition|Transit Signal Priority data acquisition]] — Source-gap doctrine, public evidence leads, candidate corridors, FOIL record classes, and safe product claims for TSP.
- [[wiki/data/intervention_source_coverage|Intervention source coverage]] — Which intervention classes have public source coverage, and where the corpus is thin.
- [[wiki/data/service_alerts_and_planned_changes|Service alerts and planned changes]] — Disruption/context filters.
- [[wiki/data/policy_docs_corpus|Policy/docs corpus]] — Board materials, open-data plans, press releases, MTA blog posts, and LLM-assisted candidate extraction.
- [[wiki/data/census_acs_equity|Census ACS equity context]] — Tract-level ACS 5-year indicators backing route-catchment equity context.

## Engineering pages

- [[wiki/engineering/package_structure|Repo package structure]] — TypeScript-only monorepo layout, package boundaries, Effect Schema type discipline, Drizzle adoption boundaries, wiki relocation, and Python/PostGIS/VPS escalation rules.
- [[wiki/engineering/analytics_architecture|Analytics architecture]] — Pure `packages/analytics` detector kernel architecture, feature contracts, registry doctrine, FeatureResolver runner seam, and migration plan.
- [[wiki/engineering/intervention_evidence_relevance|Intervention evidence relevance]] — Four-lane event/relevance/observation/study contract, value-blind ACE bindings, trusted registry admission, and deterministic route observation artifacts.
- [[wiki/engineering/route_treatment_summary_materializer_plan|Route intervention inventory operations]] — Operational doctrine for the route intervention inventory (keeps the historical materializer filename for stable wiki links).
- [[wiki/engineering/analytics_backfill_runbook|Analytics backfill runbook]] — Monitoring, restart, resume, and verification plan for local analytics corpus backfills.
- [[wiki/engineering/data_model|Data model]] — D1/SQLite serving model, Drizzle schema split, JSON cleanup plan, local artifacts, and migration path to Postgres/Hyperdrive.
- [[wiki/engineering/etl_plan|ETL plan]] — Ingestion order, Drizzle/D1 migration workflow, local backfill rules, transformation rules, and QA.
- [[wiki/engineering/sources_adapter_cutover_plan|Sources adapter cutover plan]] — Completed hard cutover of `@bp/sources` to a focused internal source adapter SDK: SODA3-only Socrata clients, no root export, explicit pipeline/app boundary gates.
- [[wiki/engineering/drizzle_query_modernization_plan|Drizzle query modernization plan]] — Completed Drizzle 1.0 RC upgrade path, validation policy, table/query/relation rules, and raw-SQL exception boundaries.
- [[wiki/engineering/drizzle_modernization_completion_audit|Drizzle modernization completion audit]] — Prompt-to-artifact completion audit for the Drizzle RC upgrade, D1 prepare elimination, migration safety, and verification gates.
- [[wiki/engineering/pipeline_raw_prepare_audit|Pipeline raw prepare audit]] — Audit of the remaining `tools/pipeline-v2` local SQLite prepares, with spatial, bulk-ingest, and Drizzle-candidate classifications.
- [[wiki/engineering/freshness_ledger|Freshness ledger]] — The operator-facing, upstream-relative replacement for calendar-month release anchors.
- [[wiki/engineering/cloudflare_operations_runbook|Cloudflare operations runbook]] — Production D1/R2 bindings, serving publish, Worker deploy, scheduled GTFS-RT capture verification, and R2-to-pipeline handoff.
- [[wiki/engineering/web_api_endpoint_architecture|Web API endpoint architecture]] — Website-facing Worker API plan for route cards, profiles, hotspots, compare, map manifests, and completeness-aware status.
- [[wiki/engineering/studio-api-refactor|Studio API hard-cutover refactor]] — Canonical plan to replace the broad `@bp/studio-api` root export with explicit contracts/client/server subpaths, generated route/OpenAPI ownership, and no legacy compatibility path.
- [[wiki/engineering/charting_library_evaluation|Charting library evaluation]] — Rendering decision record: comparison table, migration path, and prototype sequence for the chart layer.
- [[wiki/engineering/studio_design_pass_status|Studio design-pass status]] — Current design authority (the 2026-07-06 operator critique) and historical design-source status.
- [[wiki/engineering/ui_copy_doctrine|UI copy doctrine]] — What user-facing Studio copy may say: user vocabulary, not pipeline/projection/contract prose.
- [[wiki/engineering/map_strategy|Map strategy]] — MapLibre, GeoJSON/PMTiles artifacts, NYC scope, and map package responsibilities.
- [[wiki/engineering/generated_cli_distribution_plan|Generated CLI and distribution plan]] — Runtime schema/codegen pipeline, compiled Bun CLI binary release manifest, package-manager wrappers, guard rails, and rollback.
- [[wiki/engineering/cli_commands|CLI commands]] — TypeScript `tools/pipeline-v2` command targets for source probes, ingest, analytics builds, exports, and wiki linting.
- [[wiki/engineering/testing_standards|Testing standards]] — Bun-first tests, TDD loop, Effect Schema contracts, optimized pre-push hooks, and Cloudflare Worker production harnesses.

## Templates

- [[wiki/templates/dataset_page_template|Dataset page template]]
- [[wiki/templates/analysis_page_template|Analysis page template]]

## Immediate open issues

1. Reduce remaining bus-lane source gaps where public dates can be recovered, and get external
   transit-domain review before any causal claim language.
2. Keep the MVP TypeScript-only and D1 as a compact serving projection unless a documented
   requirement forces Python/PostGIS/VPS or Postgres/Hyperdrive escalation.
3. Work the open plan rows in `plans/README.md`; production D1 migrations and deploys
   remain operator-run steps.
