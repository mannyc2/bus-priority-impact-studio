# Wiki Index

Read this file first. It is the navigation layer for the LLM wiki.

Reader's map: [analytics-primer.html](../analytics-primer.html) is the visual walkthrough of the analytics architecture.

> **Generation 4 status (2026-07-04).** The current product is a public NYC bus route-evidence
> website backed by compact D1 serving tables, R2 route artifacts, and the standalone mta-wiki
> evidence backend. `tools/pipeline-v2` remains the canonical local CLI for source ingestion,
> analytics materialization, D1/R2 export, and verification. The in-repo document-processing
> command tree was retired in plan 024; do not revive it here. Plans 030-035 restored Snapshot 2.0
> degradation, added Worker error envelopes/request IDs, removed fabricated route-card metrics, and
> repaired the public route shell/home scanability against the July design source.

> **Design and evidence authority.** Public page design authority is
> `knowledge/raw/design-handoffs/bus-priority-impact-studio-2026-07-04/`. Document-derived route
> facts come from mta-wiki release artifacts and must render with citations. Public pages should not
> fabricate dates, metrics, impacts, or coverage claims.

## Architecture decisions (ADRs)

ADRs live in `docs/decisions/` (not under `knowledge/wiki/`). Notable: 0007
adopts spatialite as a loadable SQLite extension in the local pipeline only,
for route ⇄ LION corridor joins; 0011, 0012, 0014, 0015, and 0016 are superseded
history after the generation-3 hard cutover and plan 024 cleanup; 0017 retires
the broad "monthly release" slogan in favor of a multi-year, mixed-freshness model: historical
corpus, baseline month, current signal, source-capture snapshot, serving projection, and deliberate
publication gate; public surfaces should use multi-year route/corridor evidence by default where
source coverage supports it;
0018 records the detector calibration/readiness loop: reviewed gold labels, suppress-leakage
evaluation, deterministic gates, and readiness buckets must separate detector signals from public
page eligibility; 0019 records the Effect runtime boundary for pipeline code; 0020 records Effect
Schema as the only first-party runtime schema layer and supersedes the Zod clause of ADR 0001; 0021
records native `nyc-transit-kit` consumption in the Effect zone, with compat limited to Promise-edge
packages such as Studio API.

## Project pages

- [[wiki/project/overview|Project overview]] — Product thesis, goals, and non-goals.
- [[wiki/project/business_problem|Business problem]] — Why bus priority / reliability intervention ranking is the right MTA-shaped problem.
- [[wiki/project/opportunity_data_map|Opportunity data map]] — Business-opportunity-to-data map for route/corridor diagnostics, intervention evaluation, TSP source gaps, detector priorities, and Snapshot 2.0 serving implications.
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
- [[wiki/data/tsp_data_acquisition|Transit Signal Priority data acquisition]] — Source-gap doctrine, public evidence leads, candidate corridors, FOIL record classes, and safe product claims for TSP.
- [[wiki/data/service_alerts_and_planned_changes|Service alerts and planned changes]] — Disruption/context filters.
- [[wiki/data/policy_docs_corpus|Policy/docs corpus]] — Board materials, open-data plans, press releases, MTA blog posts, and LLM-assisted candidate extraction.
- [[wiki/data/agent_corpus_map|Agent corpus map]] (retired) — Historical codemode sandbox layout for deleted agent-corpus research tooling.

## Engineering pages

- [[wiki/engineering/package_structure|Repo package structure]] — TypeScript-only monorepo layout, package boundaries, Effect Schema type discipline, Drizzle adoption boundaries, wiki relocation, and Python/PostGIS/VPS escalation rules.
- [[wiki/engineering/domain_contract_package_refactor_plan|Domain contract package refactor plan]] — Audit-backed plan to split `@bp/domain` into explicit contract subpaths, shrink the root barrel, move JSON Schema/OpenAPI generation out of core schema imports, and add package-shape gates.
- [[wiki/engineering/ambitious_analytics_workstreams|Ambitious analytics workstreams]] — Ranked high-value analytics/serving/corpus work packages with copy-ready prompts for one or more Codex sessions.
- [[wiki/engineering/analytics_architecture|Analytics architecture]] — Pure `packages/analytics` detector kernel architecture, feature contracts, registry doctrine, FeatureResolver runner seam, and migration plan.
- [[wiki/engineering/analytics_100x_plan|100x analytics plan]] — Declarative panel specs, dataframe-backed model artifacts, detector model dependencies, evaluation loss, and serving projection doctrine for the next analytics leap.
- [[wiki/engineering/applied_research_architecture|Applied research architecture]] — Historical plan for retired `packages/applied-research`; survivor pure builders now belong in `@bp/analytics`, with pipeline-local SQLite aggregation in `tools/pipeline-v2`.
- [[wiki/engineering/applied_research_detector_authoring|Applied research and detector authoring]] — Historical placement guide; use it as context only after the hard cutover, not as package ownership doctrine.
- [[wiki/engineering/sources_adapter_cutover_plan|Sources adapter cutover plan]] — Hard-cutover decision for turning `@bp/sources` into a focused internal source adapter SDK, with SODA3-only Socrata clients, no root export, no SODA2 compatibility path, and explicit pipeline/app boundary gates.
- [[wiki/engineering/curb_pulse_natural_experiment_plan|Curb pulse natural experiment plan]] — Applied-research workbench plan for segment/daypart travel-time pulses, event-window overlaps, mechanism corroboration, placebo checks, and falsifiable curb-management case studies.
- [[wiki/engineering/analytics_corpus_profile|Analytics corpus profile]] — Release snapshot versus historical detector-window doctrine, corpus readiness, and Ralph input policy.
- [[wiki/engineering/detector_corpus_grain_audit_plan|Detector corpus grain audit plan]] — Plan to make detector inputs use the rich local analytical corpus and detector-native grains instead of a single coarse route-month substrate.
- [[wiki/engineering/analytics_detector_calibration|Analytics detector calibration]] — Baseline windows, seasonality rules, minimum-history gates, and score-vector path for detector calibration.
- [[wiki/engineering/detector_evaluation_harness_plan|Detector evaluation harness plan]] — Release-cycle plan for detector quality scoring, negative/near-miss sets, false-positive roots, novelty, elegance, and Ralph evaluation gates.
- [[wiki/engineering/customer_journey_shortfall_detector_plan|Customer journey shortfall detector plan]] — Plan for the first detector over MTA CJTP (`local_bus_customer_journey_metric`): release-month output with all-months persistence gating, wait-vs-in-vehicle shortfall decomposition, the CJTP-is-a-percentage-not-minutes correction, and applied-research seam placement.
- [[wiki/engineering/analytics_backfill_runbook|Analytics backfill runbook]] — Monitoring, restart, resume, and verification plan for local analytics corpus backfills.
- [[wiki/engineering/data_model|Data model]] — D1/SQLite serving model, Drizzle schema split, JSON cleanup plan, local artifacts, and migration path to Postgres/Hyperdrive.
- [[wiki/engineering/mta_wiki_rc22_consumer|MTA Wiki manifest-v4 / occurrence-v2 consumer boundary]] — Explicit release/version discrimination, canonical phase/physical audit pins, rc22 quarantine, corrected rc23 replay, and immutable approval/publication gates.
- [[wiki/engineering/etl_plan|ETL plan]] — Ingestion order, Drizzle/D1 migration workflow, local backfill rules, transformation rules, and QA.
- [[wiki/engineering/local_pipeline_db_cutover|Local pipeline DB cutover plan]] — Plan to replace DB-shaped JSON handoffs with `@bp/db/local` SQLite/Drizzle tables and shrink `tools/pipeline`.
- [[wiki/engineering/drizzle_query_modernization_plan|Drizzle query modernization plan]] — Drizzle 1.0 RC upgrade path, `drizzle-orm/zod` validation policy, table/query/relation rules, and raw-SQL exception boundaries.
- [[wiki/engineering/drizzle_modernization_completion_audit|Drizzle modernization completion audit]] — Prompt-to-artifact completion audit for the Drizzle RC upgrade, D1 prepare elimination, migration safety, pipeline raw prepare audit, and verification gates.
- [[wiki/engineering/pipeline_raw_prepare_audit|Pipeline raw prepare audit]] — Separate audit of the remaining 35 `tools/pipeline-v2` local SQLite prepares, with spatial, bulk-ingest, and Drizzle-candidate classifications.
- [[wiki/engineering/local_db_usage_audit|Local database usage audit]] — Current-state audit of how the local SQLite DB is used (acquisition, read/write split, Drizzle vs raw `bun:sqlite` styles) and the roles of Drizzle and drizzle-zod, with ranked improvement opportunities (notably: drizzle-zod is unused; test/runtime migration drift).
- [[wiki/engineering/analytics_local_db_first_principles_plan|Analytics / Local DB first-principles plan]] — Ownership model for `@bp/db`, `@bp/applied-research/local-db`, `@bp/applied-research`, `@bp/analytics`, pipeline orchestration, data-product completeness, validation gates, and serving boundaries.
- [[wiki/engineering/data_pipeline_v1_completion_plan|Data Pipeline v1 completion plan]] — Historical v1 finish-line plan for GTFS-RT reliability, intervention evaluation, corridors, exports, and QA gates.
- [[wiki/engineering/data_infrastructure_v1_finish_plan|Data Infrastructure v1 finish plan]] — Remaining recovered GTFS-RT integration, D1/R2 publish, scheduling, and website unfixture gates.
- [[wiki/engineering/data_pipeline_finish_plan_v2|Data Pipeline Finish Plan v2]] — Current plan for source coverage, historical corpus completion, context features, manual PC rebuilds, and lightweight Worker refresh operations.
- [[wiki/engineering/data_pipeline_finish_plan_v2_completion_audit|Data Pipeline Finish Plan v2 completion audit]] — Evidence checklist for the active finish-plan goal and the remaining deployed R2 GTFS-RT handoff proof.
- [[wiki/engineering/data_pipeline_2023_present_completion_audit|Data Pipeline 2023-present completion audit]] — Evidence checklist for the reframed 2023-04 through latest-complete-speed-month corpus.
- [[wiki/engineering/cloudflare_operations_runbook|Cloudflare operations runbook]] — Production D1/R2 bindings, serving publish, Worker deploy, scheduled GTFS-RT capture verification, and R2-to-pipeline handoff.
- [[wiki/engineering/web_api_endpoint_architecture|Web API endpoint architecture]] — Website-facing Worker API plan for route cards, profiles, hotspots, compare, map manifests, and completeness-aware status.
- [[wiki/engineering/studio-api-refactor|Studio API hard-cutover refactor]] — Canonical plan to replace the broad `@bp/studio-api` root export with explicit contracts/client/server subpaths, generated route/OpenAPI ownership, and no legacy compatibility path.
- [[wiki/engineering/serving_storage_split_plan|Serving storage split plan]] — Resource-first D1/R2 storage split, page-shaped projection rules, endpoint backing targets, and migration phases.
- [[wiki/engineering/website_data_support_audit|Website data support audit]] — Current frontend/Worker data paths, mocked-vs-real status, Studio projection coverage gaps, and immediate support queue.
- [[wiki/engineering/website_data_expansion_plan|Website data expansion plan]] — Superseded Snapshot 2.0 data-expansion plan; current route evidence uses mta-wiki artifacts and generation-3 route pages.
- [[wiki/engineering/website_surface_data_plan|Website surface data plan]] — Surface-first data contract for `/routes`, route detail tabs, compare, shared route metrics, D1/R2 read models, and phased implementation.
- [[wiki/engineering/route_treatment_summary_materializer_plan|Route treatment summary materializer plan]] — Historical treatment materializer plan; current document evidence dependencies point at mta-wiki artifacts.
- [[wiki/engineering/serving_snapshot_2_surface_manifest|Serving Snapshot 2.0 surface manifest]] — Page/tab-shaped serving manifest for Snapshot 2.0: route sections, route detail tabs, compare, evidence/data notes, D1/R2 grains, empty states, and the non-public opportunity-lab lane.
- [[wiki/engineering/serving_snapshot_2_full_route_baseline|Serving Snapshot 2.0 full-route baseline]] — Minimum all-route support contract: 381 route index, partial route pages, surface flags, D1/R2 split, and acceptance gates before richer 2.0 pages.
- [[wiki/engineering/serving_snapshot_2_visualization_and_multiyear|Serving Snapshot 2.0 visualization & multi-year expansion]] — Multi-year speed panels + signal-month coverage, the case-study figure catalog (curb-pulse arc), `series_ready`/`case_ready` support levels, and the prototype sequence.
- [[wiki/engineering/charting_library_evaluation|Charting library evaluation]] — Post-Recharts rendering decision: own a D3-primitive layer for argument figures, uPlot/Canvas for dense views, maplibre for spatial; comparison table, migration path, and first prototypes.
- [[wiki/engineering/studio_design_pass_status|Studio design-pass status]] — Current design-source pointer, July 2026 design export audit priorities, and historical May tarbell implementation status.
- [[wiki/engineering/web_app_support_plan|Web app support plan]] — Superseded web support plan; current public pages follow the generation-3 route-evidence scope.
- [[wiki/engineering/agent_author_api|Agent-Author API]] — Superseded write-side authoring spec; retained as history only.
- [[wiki/engineering/agent_first_contributor_leaderboard|Agent-first contributor leaderboard]] — Plan for agent-submitted transit issue artifacts, review states, scoring ledger, leaderboard snapshots, and dogfood walkthrough.
- [[wiki/engineering/web_observability_performance_seo_plan|Web observability, performance, and SEO plan]] — Lighthouse route matrix, Core Web Vitals/RUM posture, SEO crawlability checks, Worker timing, and release gates.
- [[wiki/engineering/web_ssr_tanstack_start_migration_plan|Web SSR (TanStack Start) migration sketch]] — Why SSR (collapse the browser→Worker data waterfall on content pages), one-worker vs. two-worker (site + API) topology with the site worker reading D1 directly, per-route SSR boundary, same-origin cookie constraint, phasing, and verification. Draft, not yet an ADR.
- [[wiki/engineering/website_hard_cutover_plan|Website hard cutover plan]] — Canonical route-first website IA, design reference mapping, schema-first API plan, and CLI/docs direction.
- [[wiki/engineering/generated_cli_distribution_plan|Generated CLI and distribution plan]] — Cloudflare-style runtime schema/codegen pipeline, compiled Bun CLI binary release manifest, package-manager wrappers, guard rails, and rollback.
- [[wiki/engineering/map_strategy|Map strategy]] — MapLibre, GeoJSON/PMTiles artifacts, NYC scope, and map package responsibilities.
- [[wiki/engineering/llm_wiki_rag|LLM wiki + RAG layer]] — How the persistent wiki and cited answer layer should work.
- [[wiki/engineering/tier_2_document_corpus_pipeline|Document corpus pipeline]] — Superseded in-repo document-pipeline plan; current document evidence lives in mta-wiki.
- [[wiki/engineering/tier2_structured_extraction_harness_plan|Structured extraction harness plan]] — Superseded in-repo extraction plan; retained as history only.
- [[wiki/engineering/agentic_tier2_extraction_harness_goal|Agentic extraction harness goal]] — Superseded in-repo extraction goal; retained as history only.
- [[wiki/engineering/tier2_extraction_target_spec|Extraction target spec]] — Superseded in-repo extraction target; retained as history only.
- [[wiki/engineering/tier2_machine_verifiable_feature_harness_plan|Machine-verifiable feature harness plan]] — Superseded in-repo proof-layer plan; retained as history only.
- [[wiki/engineering/tier2_agentic_self_healing_architecture|Agentic extraction self-healing architecture]] — Superseded in-repo retry architecture; retained as history only.
- [[wiki/engineering/tier2_processing_status_and_resume|Document processing status and resume runbook]] — Superseded in-repo runbook; retained as history only.
- [[wiki/engineering/tier2_extraction_best_practices|Document extraction best practices]] — Superseded in-repo extraction notes; retained as history only.
- [[wiki/engineering/document_derived_surfaces_v1|Document-derived surfaces v1]] — Superseded storage contract; current source-grounded document facts come from mta-wiki.
- [[wiki/engineering/tier2_operational_date_extraction_review|Operational-date assertions build and review]] — Superseded in-repo operational-date review; current backend is mta-wiki.
- [[wiki/engineering/tier2_operational_date_extraction_audit_handoff|Operational-date extraction audit handoff]] — Superseded historical handoff.
- [[wiki/engineering/cli_commands|CLI commands]] — TypeScript `/pipeline` command targets for source probes, ingest, analytics builds, exports, and wiki linting.
- [[wiki/engineering/testing_standards|Testing standards]] — Bun-first tests, TDD loop, Effect Schema contracts, optimized pre-push hooks, and Cloudflare Worker production harnesses.
- [[wiki/engineering/source_linting|Source linting]] — Required checks before source-backed claims.
- [[wiki/engineering/data_pipeline_operationalization_status|Data pipeline operationalization status]] — March release decision, R2 mirror validation, 311 coverage start, and parking scope.

## Templates

- [[wiki/templates/dataset_page_template|Dataset page template]]
- [[wiki/templates/analysis_page_template|Analysis page template]]

## Immediate open issues

1. Reduce remaining bus-lane source gaps where public dates can be recovered, and get external
   transit-domain review before any causal claim language.
2. Keep the MVP TypeScript-only and D1 as a compact serving projection unless a documented
   requirement forces Python/PostGIS/VPS or Postgres/Hyperdrive escalation.
3. Continue generation-5 execution from `plans/README.md`; production D1 migrations and deploys
   remain operator-run steps.
