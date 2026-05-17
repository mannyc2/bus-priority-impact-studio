# Log

Append-only chronological log. Use the prefix format `## [YYYY-MM-DD] type | title`.

## [2026-04-26] seed | Initial LLM wiki scaffold

Created Codex-ready wiki seed for Bus Priority Impact Studio. Added project, data, engineering, analysis, template pages, source registry, source manifest, and starter scripts.

Next required action: validate source metadata and schemas with Socrata/API probes before implementation.

## [2026-04-26] research | Managed services options

Added [[wiki/project/managed_services_options|Managed services options]] decision memo covering Cloudflare, Neon, Supabase, Turso, Railway, Render, Fly.io, and a VPS baseline. Recommendation: keep heavy analytics local, serve the public MVP on Cloudflare Pages/Workers/D1/R2, and reserve Neon Postgres/PostGIS for dynamic geospatial upgrades.
## [2026-04-26] architecture | TypeScript package structure and wiki relocation

Added `wiki/engineering/package_structure.md`, moved the prior LLM wiki under repo-level `knowledge/`, added root `CLAUDE.md` and `AGENTS.md`, and updated engineering docs to use a TypeScript-only MVP with Cloudflare Workers/D1/R2 and local pipeline jobs instead of Python/FastAPI/Postgres.

## [2026-04-27] architecture | Bun-first repo basics, Zod contracts, and test harnesses

Converted the repo blueprint from pnpm-first to Bun-first, added strict TypeScript and Biome configs, scaffolded Zod v4 domain/source/DB contracts, added Bun unit tests, added a Cloudflare Worker runtime test harness, added optimized pre-push hooks, and documented the testing/TDD standards in [[wiki/engineering/testing_standards|Testing standards]].

## [2026-04-27] architecture | Explicit package barrel exports

Added a package barrel export rule: package root `src/index.ts` files must use explicit named re-exports, keep type-only exports as `export type`, and avoid wildcard or namespace re-exports so public APIs stay small and tree-shaking remains predictable.

## [2026-04-27] architecture | Test placement standard

Standardized test placement outside production `src/` trees. Package and pipeline unit tests live in sibling `test/` directories, Worker runtime tests live under `apps/web/test/`, and only cross-cutting architecture harnesses live in root `tests/`.

## [2026-04-27] data | Full source probe completed

Implemented the TypeScript/Bun source manifest probe and validated all 30 manifest sources. Probe result: 30 active, 0 blocked, 0 skipped. Generated Socrata metadata, columns, row counts, HTTP metadata for web/PDF/GTFS sources, and redacted Bus Time GTFS-RT probe outputs under `knowledge/raw/metadata/`. Updated the source registry and data wiki pages with confirmed field names, row counts, and update timestamps.

## [2026-04-27] data | M1 route slice ingestion

Added a fixture-backed Socrata row-query client and `bun run ingest:m1` pipeline command. The first live slice fetched M1 March 2026 data: 2,003 segment-speed rows, 6 active route-shape rows, 134 current stop rows, and 15 timepoint stops. Raw and normalized outputs are local/generated under ignored `data/raw/route-slices/` and `data/working/route-slices/`.

## [2026-04-27] analysis | M1 hotspot scoring

Added deterministic segment hotspot scoring in `packages/analytics` and a fixture-backed `bun run hotspots:m1` pipeline command. The first live artifact for M1 March 2026 scored 2,003 segment-speed observations across 13 timepoint segments, wrote ignored artifacts under `data/artifacts/route-slices/m1-2026-03/`, and identified two top-scoring segments at score 47: southbound `5 AV/E 72 ST` to `5 AV/W 41 ST`, and northbound `4 AV/E 10 ST` to `MADISON AV/E 28 ST`.

## [2026-04-27] analysis | Ridership-weighted M1 hotspots

Extended `ingest:m1` to fetch grouped MTA Bus Hourly Ridership for the route/month and write normalized route/day/hour ridership under ignored `data/working/route-slices/`. Extended hotspot scoring with rider-impact ranking using route-level hourly ridership exposure. The M1 March 2026 slice has 168 ridership windows and 207,870 route-month riders; the top rider-impact segment is northbound `MADISON AV/E 28 ST` to `MADISON AV/E 58 ST` with speed-only score 43 and rider-impact score 63.

## [2026-04-27] architecture | Web folder structure and Claude Code skills

Added project-scoped Claude Code React best-practices and composition-patterns skills under `.claude/skills/`. Introduced the `apps/web/src/` structure with components, pages, fixtures, lib, and worker directories. Added architecture checks for web boundaries and centralized type usage.

## [2026-04-27] analysis | M1 route scorecard artifact

Added a fixture-backed `bun run route-score:m1` pipeline command that reads the current M1 hotspot summary artifact and writes a validated route scorecard artifact. The first generated M1 March 2026 scorecard uses route-weighted speed 6.7409 mph and 10 hotspot rows to produce route score 16 at `data/artifacts/route-slices/m1-2026-03/route-scorecard.json`.

## [2026-04-27] analysis | M1 route brief input artifact

Added a fixture-backed `bun run route-brief:m1` pipeline command that combines the M1 route scorecard and hotspot summary into deterministic memo inputs with metrics, top segment rows, source citations, and caveats. The first generated payload is `data/artifacts/route-slices/m1-2026-03/route-brief-input.json` with five top segments and no generated prose.

## [2026-04-27] analysis | M1 artifact manifest

Added a fixture-backed `bun run artifacts:m1` pipeline command that writes `data/artifacts/route-slices/m1-2026-03/artifact-manifest.json` with artifact keys, byte sizes, content types, and SHA-256 hashes for `summary.json`, `hotspots.json`, `route-scorecard.json`, and `route-brief-input.json`.

## [2026-04-27] data | ACE route ingestion and M1 overlay

Added normalized ACE/ABLE route implementation parsing, fixture-backed `bun run ingest:ace-routes`, and fixture-backed `bun run interventions:m1`. The live ACE route ingest fetched 81 rows from `ki2b-sg5y` with 60 ACE rows and 21 ABLE rows. The M1 March 2026 overlay found 0 route-level ACE/ABLE matches, writes `data/artifacts/route-slices/m1-2026-03/intervention-overlay.json`, and is now included in route brief inputs and the artifact manifest.

## [2026-04-27] data | NYC DOT bus-lane ingestion and M1 overlay

Added normalized NYC DOT bus-lane parsing, fixture-backed `bun run ingest:bus-lanes`, and fixture-backed `bun run bus-lanes:m1`. The live bus-lane ingest fetched 4,068 rows from `ycrg-ses3`, including 1,304 Manhattan rows. The M1 March 2026 bus-lane proximity overlay found 228 candidate bus-lane rows across 19 matched streets, writes `data/artifacts/route-slices/m1-2026-03/bus-lane-overlay.json`, and is now included in route brief inputs and the artifact manifest.

## [2026-04-27] data | M1 schedule ingestion and planned-time comparison

Added normalized MTA Bus Schedules timepoint parsing, fixture-backed `bun run ingest:m1-schedules`, and fixture-backed `bun run schedules:m1`. The live M1 schedule ingest fetched 35,566 timepoint rows from `4fnn-qsea` across Saturday, Sunday, and Weekday service. The M1 March 2026 schedule comparison derived 14 scheduled timepoint pairs, matched all 10 hotspot pairs, writes `data/artifacts/route-slices/m1-2026-03/schedule-comparison.json`, and is now included in route brief inputs and the artifact manifest.

## [2026-04-27] data | ACE violation monthly summary

Added grouped ACE violation summary parsing and fixture-backed `bun run ingest:ace-violations`. The live March 2026 ingest grouped `kh8p-hcbm` by route, violation type, and violation status, producing 736 grouped rows across 58 routes and 32,954 violations. The M1 March 2026 intervention overlay now includes ACE violation counts and reports 0 M1 grouped violation rows for the month.

## [2026-04-27] analysis | M1 ridership profile artifact

Added fixture-backed `bun run ridership-profile:m1` to summarize route-level hourly ridership, transfers, peak ridership windows, and slow crowded windows by joining ridership windows to timepoint speed observations. The artifact is included in route brief inputs and the artifact manifest so memo inputs can distinguish high-ridership periods from segment-level hotspots.

## [2026-04-27] analysis | M1 speed profile artifact

Added fixture-backed `bun run speed-profile:m1` to aggregate segment-speed observations by direction, direction/daypart, and slowest day/hour windows. The artifact is included in route brief inputs and the artifact manifest so downstream memos can describe directional and time-of-day patterns without reading raw observations.

## [2026-04-27] data | Multi-route batch pipeline

Added `bun run build:routes` to refresh shared intervention sources once, then run the full route/month artifact chain for each requested route. The orchestration keeps existing M1-compatible commands but makes the pipeline usable for arbitrary route lists such as `M1,M2` without duplicating builder code.

## [2026-04-27] analysis | Route comparison artifact

Added `bun run compare:routes` to read a route batch summary plus each route's brief input and write a ranked route comparison artifact. The comparison includes route scores, speed, ridership, schedule-match rate, ACE violation totals, bus-lane overlay counts, peak ridership windows, and slowest day/hour windows.

## [2026-04-27] data | D1 seed export

Added compact D1 serving table contracts for route artifacts, brief summaries, comparison ranks, route catalog rows, and route/month coverage rows. Added `bun run export:d1` to read generated batch artifacts and write `schema.sql`, `seed.sql`, and an export summary under `data/exports/d1/<month>/`.

## [2026-04-27] data | Typed D1 repository layer

Added thin typed D1 repository helpers in `packages/db` for route brief summaries, route artifact metadata, and route comparison ranks. This intentionally avoided a full ORM while the serving schema was still moving, but gave Worker code explicit query functions and Zod-validated row mapping.

## [2026-04-27] data | Systemwide route catalog and coverage

Added `bun run ingest:route-catalog` to fetch all active current MTA bus routes and stops into a normalized route catalog. The live current catalog has 381 active routes, 1,640 route-shape rows, 23,048 stop rows, and 4,877 timepoint stops. Added `bun run ingest:route-coverage` to fetch all-route monthly segment-speed and schedule coverage; the March 2026 coverage artifact has 375 routes, including 353 with segment-speed data and 375 with schedule timepoint data. The D1 export now emits 381 route catalog rows and 375 route/month coverage rows.

## [2026-04-27] data | Route readiness backend layer

Added `bun run route-readiness` to join the all-route catalog with monthly speed/schedule coverage and produce a build-planning read model under `data/artifacts/route-batches/<month>/route-readiness.json`. The March 2026 readiness artifact has 381 routes, including 350 build-eligible route/months, 28 missing speed inputs, and 3 missing geometry inputs. The D1 serving schema/export now includes a `route_readiness` table with 381 seed rows, and `packages/db` exposes typed repository helpers for listing all readiness rows or build-eligible routes.

## [2026-04-27] data | Route build-plan backend layer

Added `bun run route-build-plan` to rank build-eligible, not-yet-built routes for the next offline batch from route readiness plus the existing batch summary. The March 2026 build plan has 381 rows: 20 selected routes at the default limit, 2 already built routes, 328 eligible backlog routes, and 31 blocked routes. The D1 schema/export now includes a `route_build_plan` serving table with 381 seed rows, and `packages/db` exposes typed reads for the full plan and selected candidates. Ingestion tests now write to fixture-specific output directories so they do not delete live `data/working/network` artifacts during verification.

## [2026-04-27] data | Planned route graph execution

Added planned-route batch execution, now represented by `bun run build:routes -- --planned`, to consume build-plan state, build selected route slices, merge them into the existing batch summary instead of replacing previous built routes, refresh route comparison, refresh the build plan, and regenerate the D1 seed. The first live March 2026 planned build used `--limit 5` and added `M57`, `M42`, `M31`, `BX2`, and `M50` to the existing M1/M2 batch. The batch now has 7 built routes, 63 artifact metadata rows in the D1 export, and 7 route comparison rows. The refreshed planner now marks 7 routes as already built and selects the next 20 candidates starting with `M125`, `BX35`, `M8`, `BX32`, and `M106`.

## [2026-04-27] data | Route batch audit and serving status

Added `bun run route-batch-audit` to validate generated route batch artifacts against each route's artifact manifest. The audit checks required artifact presence, file existence, byte lengths, SHA-256 hashes, route IDs, and analysis months, then writes `route-batch-audit.json`. The March 2026 live audit passes with 7 built routes, 63 verified artifacts, 823,794 total artifact bytes, and 0 issues. The D1 schema/export now includes a `route_batch_status` row, and `packages/db` exposes `getRouteBatchStatus` for Worker/backend reads.

## [2026-04-27] data | D1 seed verification

Added `bun run verify:d1` to regenerate the D1 export, execute the generated `seed.sql` in an in-memory SQLite database, compare loaded table counts against `export-summary.json`, and exercise typed `packages/db` repository reads. The live March 2026 verification passes with 381 route catalog rows, 375 route coverage rows, 381 readiness rows, 381 build-plan rows, 7 route scorecards, 63 artifact rows, 7 brief summaries, 7 comparison ranks, and 1 batch status row. The verification artifact is written to `data/exports/d1/2026-03/verify-summary.json`.

## [2026-04-27] data | Scheduled reliability and intervention-history layers

Added `bun run route-reliability-baseline` to compute scheduled headway baselines for built route batches. The March 2026 batch has 7 route rows and 186,322 scheduled headway interval samples, with source-readiness flags for observed headways, bunching, wait-time reliability, and cancellation proxies that still require GTFS-RT history. Added `route_reliability_baseline` to the D1 serving export and typed repository checks.

Added `bun run route-intervention-history` to summarize ACE implementation dates, monthly ACE violation counts, matched bus-lane open-date coverage, and missing signal-priority/lane-upgrade/enforcement-activation source gaps. The current March 2026 batch has 5 ACE-matched routes, 4 active ACE routes, and bus-lane matches with open dates on all 7 built routes.

## [2026-04-27] data | ACS equity context ingest

Added `bun run ingest:equity-context` and Census ACS normalization in `packages/sources`. The live ACS 2024 ingest fetched 2,327 NYC tract rows with 8,483,844 total population, 3,334,088 occupied housing units, and 1,844,706 no-vehicle households. This creates the tract-level demographics and low-car household layer needed before route catchment joins; job access still needs LEHD/LODES or a travel-time model.

## [2026-04-27] data | Multi-month route trend backend layer

Added `bun run ingest:route-trends` to build route/month trend inputs from public MTA speed and ridership sources over a configurable month range. Added `route_month_trend` to the compact D1 serving schema/export and typed repository helpers for route trend reads. The live March 2026 trend run covers 7 built routes across January 2025 through March 2026, producing 105 speed trend rows. Historical ridership trend aggregation was too slow as a single Socrata grouped query, so the live artifact marks ridership trends as skipped for this run and leaves ridership backfill to a chunked route/month job.

## [2026-04-27] data | Chunked ridership trend backfill

Added `bun run backfill:route-ridership-trends` to fill route/month ridership trend gaps incrementally from MTA Bus Hourly Ridership. The job reads the existing route trend artifact, queries one route/month aggregate at a time with configurable limit and concurrency, merges ridership and transfers into `route_month_trend` rows, and writes a backfill summary artifact. Bounded live backfill chunks for January 2025 through March 2026 completed all 105 route-month rows for the current 7-route trend window; D1 export and verification load the enriched trend rows.

## [2026-04-27] data | Route equity context serving layer

Added `bun run route-equity-context` to build route-level ACS context rows from the all-route catalog and ACS 2024 tract context. The first live March 2026 artifact writes 381 route rows, assigns 358 routes to county-level ACS proxy context from route ID borough prefixes, and marks 23 route IDs unassigned. Added `route_equity_context` to the D1 serving schema/export plus typed repository reads; D1 verification now loads 381 route equity rows alongside reliability and trend tables.

## [2026-04-27] engineering | Pipeline architecture cleanup

Consolidated the pipeline command wrappers behind `tools/pipeline/src/cli.ts` and reorganized pipeline internals into `checks/`, `jobs/{build,export,ingest,sources}/`, and `lib/`. Shared path/date/route-key/JSON helpers now live under `tools/pipeline/src/lib/`, and package scripts dispatch through the CLI registry while preserving the existing command names.

Moved source probe adapter logic into `@bp/sources/probes`, leaving pipeline source jobs responsible for command orchestration and artifact writes only. Added `SocrataClient` plus source registry lookup helpers in `@bp/sources`, then updated source-backed ingest jobs to use the package APIs instead of repeating manifest filtering and Socrata fetch wiring.

Recorded ADR 0002: Postgres through Hyperdrive is the planned canonical operational/analytics database once the project outgrows compact serving projections, Drizzle is the planned typed database layer, and D1 remains appropriate as an optional generated public serving projection. Product-queryable data should move to relational columns or child tables; JSON should be limited to source payloads, provenance, debug metadata, audit details, and selected-row attachments.

## [2026-04-27] engineering | MapLibre public map stack

Recorded ADR 0003 and replaced the Leaflet route fixture map with MapLibre GL JS. The app now renders route lines, hit areas, stops, labels, and D-grade hotspot markers as GeoJSON-backed MapLibre layers, with PMTiles protocol registration in place for future R2/static vector tile artifacts. Map rendering stays in `apps/web`; heavy geospatial construction and tile/artifact generation remain pipeline responsibilities.

Absorbed the useful map-strategy reference material into the main repo: shared route-segment GeoJSON artifact schemas in `packages/domain`, a `knowledge/wiki/engineering/map_strategy.md` page, the `nyc_borough_boundaries` source entry, and NYC map bounds in the MapLibre component. The remaining reference scaffold/design files are intentionally not needed.

Ran `bun run sources:probe` after adding `nyc_borough_boundaries`. The 2026-04-27 probe checked 32 sources, found 29 active, 0 blocked, and skipped 3 Bus Time GTFS-RT feeds because no local API key was configured. `gthc-hcne` is active with 5 borough rows, 5 columns, and rows updated at 2026-03-09T20:59:41Z.

## [2026-04-27] architecture | Drizzle schema split and D1 guardrails

Reviewed the uploaded `architecture-cleanup-drizzle-plan` branch ZIP directly. Updated the data model, package structure, ETL plan, and managed-services memo with a source-backed Drizzle adoption plan: separate D1 serving and future Postgres canonical schemas, keep D1 small and replaceable, move product-queryable JSON into child tables, retain heavy historical backfill in local Bun pipeline jobs, and add ADR 0004 for D1/Postgres/Drizzle guardrails.

## [2026-04-28] engineering | Drizzle D1 schema and relational serving cleanup

Implemented the first Drizzle adoption pass in `packages/db`: added D1 and future-Postgres Drizzle configs, D1 schema tables, generated D1 migration SQL, and Drizzle-Zod validation schemas. The D1 serving export now writes child tables for product-queryable arrays/objects instead of JSON text columns, including route citations, brief windows, catalog types/directions, readiness missing inputs, source statuses, reliability gap windows, and batch audit details. Repository APIs remain stable for the app while reading from the new relational child rows.

Removed the duplicate hand-written D1 table SQL layer. D1 DDL now comes from generated Drizzle migration files under `packages/db/migrations/d1`, while the pipeline export writes seed DML only and copies schema SQL from the migration journal for local verification. Added Wrangler migration scripts for local and remote D1 application through `packages/db/wrangler.d1.jsonc`.

Started the `@bp/db` package split into explicit `@bp/db/d1`, `@bp/db/pg`, and `@bp/db/shared` subpath surfaces. Moved D1 and PG schemas into those surfaces, added a D1 Drizzle client factory, and migrated the route scorecard read path from raw SQL strings to Drizzle query builders over a Drizzle D1 database.

Migrated the first simple serving repositories to Drizzle query builders: route artifacts, comparison ranks, and route month trends. Added a `@bp/db/d1/bun-sqlite` helper so local export verification and package tests can exercise Drizzle-backed reads against Bun SQLite without making `tools/pipeline` depend directly on Drizzle internals.

Hard-cut the remaining D1 serving reads to Drizzle. All route serving query modules now live under `packages/db/src/d1/queries`, D1 seed SQL literal helpers live under `packages/db/src/d1/seed`, and the legacy `D1DatabaseLike` prepared-statement compatibility layer was removed. The pipeline D1 verifier now exercises the same Drizzle/Bun SQLite database adapter used by package tests.

Drafted the local pipeline DB cutover plan. The plan adds `@bp/db/local` as a SQLite/Drizzle canonical local build database, keeps D1 as a disposable serving projection, and orders the migration around deleting DB-shaped JSON handoffs, shrinking `export-d1.ts`, and making pipeline jobs fetch/transform/upsert instead of read/parse/rewrite JSON tables.

## [2026-05-16] planning | Data Pipeline v1 scope reset

Promoted GTFS-RT observed reliability/bunching, before/after intervention evaluation, corridor grouping, and full route/corridor brief artifacts into Data Pipeline v1 scope. Added [[wiki/engineering/data_pipeline_v1_completion_plan|Data Pipeline v1 completion plan]] with a current-state audit, prompt-to-artifact checklist, definition of done, phased execution plan, data contracts, QA gates, and risk register. Updated the wiki index, Codex roadmap, and ETL plan to point future work at the full-network v1 finish line instead of the older M1-only prototype roadmap.

Started GTFS-RT collection for Data Pipeline v1. Added local SQLite tables for collection runs and raw feed snapshot metadata, plus `collect:gtfs-rt` for bounded MTA Bus Time GTFS-RT raw snapshot capture. Raw protobuf bodies stay under `data/raw/gtfs-rt/`; local DB rows store feed type, sample index, source id, fetch time, HTTP status, byte length, SHA-256, raw path, redacted URL, and error text. Added fixture-backed tests for successful collection, API-key redaction, and HTTP failure recording. GTFS-RT protobuf parsing, vehicle-position normalization, observed stop events, and headway/bunching metrics remain open v1 work.

Added GTFS-RT protobuf parsing and raw-snapshot ingestion. `@bp/sources` now uses `gtfs-realtime-bindings` to decode GTFS-RT FeedMessage bytes into normalized vehicle-position, trip-update, stop-time-update, and alert records with route-id normalization for MTA-prefixed route IDs. Added local parsed GTFS-RT tables plus `ingest:gtfs-rt-snapshots -- --run-id <run_id>` to parse collected raw snapshots, persist entity rows, store parsed snapshot counts, and record malformed protobufs as `parse_error`. Observed stop-event inference and headway/bunching metrics remain open.

Added run-scoped observed headway construction. `build:observed-headways -- --run-id <run_id>` reads parsed GTFS-RT vehicle positions, collapses duplicate observations from the same vehicle at the same route/direction/stop, stores observed stop events in `local_observed_vehicle_stop_event`, and stores successive-vehicle headway samples in `local_observed_headway_sample`. This creates the substrate for observed reliability; route/month summaries, bunching, long-gap, wait-time reliability, and confidence gates remain open.

Added route/month observed reliability summaries. `route-observed-reliability -- --run-id <run_id> --year YYYY --month M` reads observed headway samples, joins scheduled reliability baselines, and writes `local_route_observed_reliability_summary` rows for every built route in the month. The summary includes observed average/median/p90/max headway, bunching share, long-gap share, expected wait, scheduled wait comparison, sample count, stop/direction coverage, and explicit `insufficient_gtfs_rt_samples` status when a route lacks enough observed samples. It also updates reliability source statuses for observed headways, bunching, and wait reliability while preserving scheduled-headway statuses.

Exported observed reliability summaries into the D1 serving contract. Added `route_observed_reliability_summary`, seed/export projection, verification table-count checks, and typed repository readback through `listRouteObservedReliabilitySummaries`. The D1 migration only creates the new observed reliability table; the legacy `route_artifact` table remains declared in schema for migration compatibility but is still not used by export/readback.

Started intervention evaluation for Data Pipeline v1. Added `route-intervention-evaluation -- --year YYYY --month M`, local tables `local_intervention_event` and `local_route_intervention_comparison`, and D1 serving tables `intervention_event` and `route_intervention_comparison`. The first implementation produces descriptive ACE/ABLE before/after route comparisons from monthly route trends, records pre/post windows, sample counts, speed and ridership deltas, explicit evaluation levels, future/insufficient-data statuses, and non-causal caveats. D1 export/verification now covers these rows, and route post-build runs the intervention evaluation step.

Started corridor modeling for Data Pipeline v1. Added `corridor-model -- --year YYYY --month M`, local corridor tables, D1 corridor serving tables, typed `listCorridorSummaries` readback, export/verification row-count checks, and route post-build integration. The first corridor model assigns every public-visible route to a deterministic primary-street corridor or explicit unassigned placeholder, then summarizes route count, ridership, speed, hotspot count, observed reliability coverage, and intervention comparison coverage at the corridor/month level.

Started final brief body generation for Data Pipeline v1. Added `brief-artifacts -- --year YYYY --month M` to render public-visible route and corridor briefs as JSON, Markdown, and HTML under `data/artifacts/briefs/`. Local and D1 artifact metadata now record artifact keys, content types, byte lengths, and SHA-256 hashes for route and corridor brief bodies. Route post-build now runs corridor modeling, brief generation, artifact audit, then D1 export, and `verify:d1` exercises typed route/corridor artifact readback. Running the current March 2026 local DB produced 350 route briefs, 209 corridor briefs, 1,677 total body artifacts, and a passing route-batch audit; D1 verification still shows 0 observed reliability and 0 intervention comparison rows in that local export, so the production data run remains open.

Added the Data Pipeline v1 QA gate. `check:pipeline-v1 -- --year YYYY --month M` now verifies local route coverage, build eligibility, route-batch audit status, route/corridor brief artifact completeness, observed reliability summaries and source statuses, intervention events/comparisons and caveats, corridor membership, and D1 export readback. Fixture-backed tests cover both a complete tiny network and an incomplete network. The current March 2026 local DB fails this gate as expected on missing observed reliability and intervention comparison rows, preserving the remaining v1 work as explicit issue codes.

Ran the March 2026 v1 catch-up data chain against the local DB. Full-network speed trend ingestion produced 5,171 route/month speed trend rows, and chunked ridership backfill filled ridership coverage for all 5,171 rows. `route-observed-reliability` produced 381 reliability status rows, all marked `insufficient_gtfs_rt_samples` with 0 observed headway samples because no Bus Time API key or collected GTFS-RT run is available in this environment. `route-intervention-evaluation` produced 79 ACE/ABLE events and 79 route comparisons, including 22 evaluated speed before/after comparisons and 21 evaluated comparisons with ridership deltas. Regenerated corridor summaries and route/corridor brief bodies, then `route-batch-audit`, `verify:d1`, and `check:pipeline-v1` all passed for March 2026. The gate now reports observed-vs-insufficient reliability counts, total observed headway samples, and speed/ridership trend coverage so the missing GTFS-RT sample coverage remains visible even when the structural v1 gate is green.

Tightened `check:pipeline-v1` so strict v1 QA fails when observed reliability rows exist but no route has observed GTFS-RT sample coverage. The March 2026 local DB now fails strict mode on `observed_reliability_no_observed_routes` and `observed_reliability_sample_coverage_insufficient`; `--allow-insufficient-gtfs-rt` remains available for structural DB/export/artifact verification when no Bus Time key or GTFS-RT collection run is available.

Added `finalize:pipeline-v1` as the executable v1 finalization runbook for an existing full-network route build. The command refreshes route speed trends, backfills ridership trends in chunks, builds observed reliability from a GTFS-RT run id or explicit insufficient-sample structural mode, then runs intervention evaluation, corridor modeling, brief artifact generation, route-batch audit, D1 verification, and the v1 QA gate. Tests cover strict observed-GTFS-RT finalization, required run-id validation, and explicit structural fallback.

Expanded strict `check:pipeline-v1` GTFS-RT provenance checks. Observed reliability rows now have to trace back to completed GTFS-RT collection run rows, successful feed snapshots, parsed vehicle-position snapshots, and persisted observed headway sample rows. Added fixture coverage for a false-positive observed summary that lacks backing collection/headway rows.

Expanded intervention-side v1 QA. `check:pipeline-v1` now fails when route/month trend rows are missing, speed or ridership trend coverage is absent, ACE/ABLE comparisons exist without any evaluated before/after rows, or evaluated comparisons have no ridership deltas. Added fixture coverage for missing trend coverage.

Started the local pipeline DB cutover. Added `@bp/db/local` with a Bun SQLite Drizzle client, generated local migrations, Drizzle's Bun SQLite migration runner, and route-network repositories for catalog, month coverage, readiness, and build-plan rows. The route catalog and month coverage ingests now upsert local DB rows, while readiness and build-plan builds read from local DB and write their computed rows back to it. Existing JSON artifacts remain as compatibility/debug outputs for this first slice.

Hard-cut the first route-network handoffs to local DB. D1 export, D1 verification, route batch audit, and graph-based planned route execution now read route catalog, route coverage, readiness, and build-plan state from `@bp/db/local` instead of `route-catalog.json`, `route-month-coverage-*.json`, `route-readiness.json`, or `route-build-plan.json`. The readiness and build-plan builders now persist local DB rows only, leaving JSON files for source/debug artifacts rather than required pipeline state.

## [2026-04-29] engineering | Crash-safe network build and SQLite fixes

Added `bun run build:network` as a crash-safe, resumable replacement for `build:planned-routes`. The runner checkpoints batch progress to local DB (`local_route_batch_status`, `local_route_batch_built_route`, `local_route_batch_issue`) and a JSON summary after every route. Resume skips already-built routes on restart. Deleted all M1-specific pipeline commands and generalized into route-agnostic code. Added `build:network` to root `package.json`.

Fixed three SQLite issues that blocked full-network builds: (1) duplicate bus-lane segment IDs from Socrata source data — added deduplication in `replaceBusLanes`. (2) SQLite bind-parameter limit exceeded by large inserts — added centralized `batchInsert` helper in `@bp/db/local/client.ts` that chunks inserts in batches of 500 rows, applied to bus lanes, segment speeds, ridership, schedules, stops, and census tracts. (3) `SQLITE_BUSY` database locking from concurrent connections — added `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000` to `openLocalPipelineDb`.

Fixed type errors in Codex-generated pipeline files where `parseBuildArgs` functions annotated return types as `Required<ArgsType>` but actually returned `createMonthContext(args)` which adds `isoMonth`. Removed explicit return type annotations to let TypeScript infer correctly. Added `"running"` to the D1 batch status schema enum.

## [2026-04-29] data | First full-network build — March 2026

Completed the first successful all-routes monthly build. `build:network -- --year 2026 --month 3` built 381/381 routes with zero issues. The local pipeline DB is 1.6 GB with 3,429 route artifacts. Key table counts: 381 route scorecards, 381 brief summaries, 350 comparison ranks, 381 reliability baselines, 381 build-plan rows.

D1 export and verification passed: 381 route catalog rows, 3,429 artifact rows, 381 scorecards, 350 comparison ranks, 381 batch built-route rows, batch status `pass`. Seed SQL is 3 MB / 12,632 lines. Route month trends and equity context are empty for this run (require separate backfill steps).

## [2026-04-29] analysis | Methodology validation

Added `knowledge/wiki/analysis/methodology_validation.md` with a code-level audit of all six per-route analysis components. Updated `hotspot_detection.md` and `route_score.md` to reflect the actual implemented formulas. Key findings: hotspot detection math is correct but uses route-level ridership as a segment proxy; route score is a functional two-factor heuristic (speed + hotspot count) vs the planned five-factor model; bus lane matching is Manhattan-only due to a hardcoded filter; schedule comparison and speed/ridership profiles are correct. Updated `knowledge/index.md` open issues to reflect current state.

## [2026-04-29] engineering | Remove JSON artifact file writes — hard cutover to local DB

Removed all JSON artifact file writes from the route build pipeline. The pipeline previously wrote 9 JSON files per route to `data/artifacts/route-slices/` (51 MB for 381 routes). Nothing in the production pipeline read them back — the local SQLite DB was already the source of truth for all downstream consumers including D1 export.

Deleted files:
- `tools/pipeline/src/lib/artifacts.ts` — `writeRouteSliceArtifact`, `fileDigest`, path helpers
- `tools/pipeline/src/jobs/build/route-artifact-manifest.ts` — read JSON files to compute hashes, stored in `local_route_artifact`
- `packages/db/src/d1/queries/route-artifacts.ts` — D1 artifact query layer

Removed tables:
- `local_route_artifact` from local schema and repositories
- `route_artifact` from D1 schema, seed generation, and serving queries

Simplified:
- `route-batch-audit.ts` rewritten from 227 to 78 lines — no longer reads files from disk, queries built routes from DB only
- `route-core-artifacts.ts`, `route-profiles.ts`, `route-secondary-artifacts.ts` — removed all `writeRouteSliceArtifact` calls and file path return values
- `route-slice-pipeline.ts` — removed artifact manifest step and `artifactCount` from result type
- D1 export pipeline — removed `routeArtifacts` from inputs, `artifactRowCount` from output, `route_artifact` from verification
- `routeCount` in D1 seed now derived from scorecard count instead of batch status

Moved `routeSliceKey` helper from deleted `artifacts.ts` to `tools/pipeline/src/lib/route-job.ts`.

Net result: ~4,190 lines removed across 71 files. All 42 pipeline tests and 19 db tests pass. Types clean.

## [2026-05-17] engineering | GTFS-RT v1 preflight diagnostic

Added `gtfs-rt:preflight` to diagnose the observed-reliability layer before strict v1 finalization. The command reports `MTA_BUS_TIME_API_KEY` presence, selected collection run status, successful vehicle-position snapshots, parsed vehicle-position rows, observed headway samples, route/month observed reliability rows, source-status coverage, route sample coverage, issue codes, and next-step recommendations. It exits nonzero when the observed layer is not strict-v1 ready but still prints JSON diagnostics. Added fixture-backed tests for an empty local DB blocker state and a complete collected/parsed/headway/reliability state. Updated the CLI command reference and v1 completion plan.

## [2026-05-17] engineering | Bus-lane intervention source-gap coverage

Expanded `route-intervention-evaluation` so public routes with matched NYC DOT bus-lane geometry now get explicit `nyc_dot_bus_lanes` source-gap comparison rows when the pipeline lacks route-level bus-lane implementation dates for before/after evaluation. The March 2026 local run now has 251 intervention events/comparisons: 79 ACE/ABLE rows and 172 bus-lane source-gap rows. `check:pipeline-v1` now fails if a public route with matched bus-lane geometry lacks a bus-lane intervention comparison row, and reports bus-lane matched/comparison/source-gap counts. After refreshing corridor summaries, brief artifacts, route-batch audit, and D1 export, structural `check:pipeline-v1 -- --allow-insufficient-gtfs-rt` passes with 251 intervention comparison rows; strict mode still correctly fails only on missing observed GTFS-RT samples.

## [2026-05-17] engineering | Source freshness gate for v1 QA

Expanded `check:pipeline-v1` to require fresh local source probe metadata for the v1 source set before treating a pipeline run as publishable. The gate now checks 10 required source captures under `knowledge/raw/metadata` by default, reports fresh/missing/stale/inactive counts, supports `--max-source-probe-age-days`, and allows tests to point at fixture metadata with `--source-metadata-dir`. Fixture coverage now includes complete source metadata plus missing, stale, and inactive probe captures. This closes the source-freshness QA gap while leaving the hard v1 blocker unchanged: strict completion still requires real observed GTFS-RT headway samples from a Bus Time collection run.

## [2026-05-17] engineering | GTFS-RT coverage confidence gate

Tightened strict `check:pipeline-v1` so observed reliability must cover a meaningful share of public routes, not merely one route with samples. The gate now defaults to a 90% observed-route coverage requirement, supports `--min-observed-route-share` and `--min-observed-route-count`, reports observed-route share and required observed rows, and fails if any row marked `observed` is below its own per-route sample threshold. `finalize:pipeline-v1` now forwards those observed coverage options into the v1 QA gate. Fixture coverage now includes insufficient observed-route coverage and below-threshold observed rows. The March 2026 local DB still fails strict mode because it has 381 insufficient GTFS-RT rows and 0 observed headway samples.

## [2026-05-17] engineering | Corridor assignment quality gate

Expanded `check:pipeline-v1` corridor QA beyond existence checks. The gate now reports assigned, ambiguous, and unassigned corridor route-member counts plus ambiguity/unassigned shares, defaults to allowing at most 15% ambiguous assignments and 2% unassigned placeholders, and supports `--max-corridor-ambiguous-route-share` and `--max-corridor-unassigned-route-share`. Fixture coverage now fails deliberately ambiguous and unassigned corridor assignments. The current March 2026 structural run remains green with 322 assigned, 28 ambiguous, and 0 unassigned corridor route members.

## [2026-05-17] engineering | D1 export contract summaries

Expanded the D1 export contract so `export:d1` writes `export-summary.json` with schema/seed paths, byte lengths, SHA-256 hashes, and all generated row counts, while `verify:d1` writes `verify-summary.json` with expected-vs-loaded table counts and typed repository readback counts. Fixture-backed export and verification tests now assert the summary files. Running March 2026 `verify:d1` regenerated current summaries with 381 observed reliability rows, 251 intervention comparisons, 1,050 route artifact rows, 627 corridor artifact rows, and a 5.7 MB D1 seed file hash.

## [2026-05-17] engineering | Static brief artifact manifest

Expanded `route-batch-audit` so the static artifact audit now writes `data/artifacts/briefs/<month>/manifest.json` with every route/corridor brief artifact key, owner, content type, byte length, SHA-256 hash, totals, and audit issues. `check:pipeline-v1` now exposes the manifest path in its audit result. Fixture tests cover passing manifests and failing manifests with hash/byte-length issues. The current March 2026 structural run writes a 1,677-artifact manifest for 350 public route briefs and 209 corridor briefs.

## [2026-05-17] engineering | GTFS-RT collection quality gate

Tightened strict `check:pipeline-v1` so observed GTFS-RT reliability now requires collection-window evidence, not just reliability rows. The gate now checks the observed run's completed collection duration, sample cadence, requested `vehicle_positions` feed, and successful vehicle-position snapshot coverage for the configured collection window. `finalize:pipeline-v1` forwards the same GTFS-RT QA threshold options. Fixture coverage now catches a too-short collection window and too-sparse cadence while preserving structural `--allow-insufficient-gtfs-rt` mode for environments without a Bus Time API key.

## [2026-05-17] engineering | GTFS-RT preflight collection QA

Expanded `gtfs-rt:preflight` to diagnose the same realtime collection quality requirements enforced by strict `check:pipeline-v1`: minimum collection window, maximum sample cadence, requested `vehicle_positions`, and successful vehicle-position snapshot coverage. The preflight JSON now reports those thresholds, collection-window counts, and a `hasCollectionWindow` readiness flag so the run can fail early before finalization.

## [2026-05-17] engineering | Brief GTFS-RT collection windows

Expanded generated route briefs so observed reliability JSON/Markdown carries the GTFS-RT collection window behind the sample metrics: run ID, start/end timestamps, requested and elapsed duration, sample cadence, requested feed types, snapshot counts, and successful vehicle-position snapshot count. Fixture coverage now verifies the collection-window payload in route brief artifacts.

## [2026-05-17] engineering | GTFS-RT smoke collection and brief JSON contract audit

Saved the Bus Time API credential in ignored local env files for the main repo and active Codex worktrees, with restrictive file permissions; the key is not committed and preflight reports only presence. Added `--run-id` support to `collect:gtfs-rt` so smoke and production collections can use stable run IDs from the CLI. A one-snapshot vehicle-position smoke run collected and ingested successfully, parsing 1,290 vehicle positions; strict preflight still correctly fails that run because the collection window is only a smoke test, not a v1 reliability window.

Expanded `route-batch-audit` beyond file byte/hash checks so route and corridor `brief.json` bodies are validated as contracts: artifact kind, month, owner ID, route observed reliability presence, observed reliability sample/status consistency, collection-window presence when a collection run exists, and corridor observed-reliability route-count metrics. Fixture coverage now catches a route brief that silently omits `observedReliability`.

## [2026-05-17] engineering | GTFS-RT analysis-month alignment

Hardened observed reliability so live GTFS-RT data cannot accidentally satisfy an older analysis month. `route-observed-reliability` now filters observed headway samples to the requested month before computing route summaries. Strict `check:pipeline-v1` and `gtfs-rt:preflight` now reject observed reliability whose collection run, successful vehicle-position snapshot fetches, or observed headway sample timestamps fall outside the analysis month. Fixture coverage catches out-of-month GTFS-RT provenance runs.

Confirmed the month split in local source coverage: April and May 2026 coverage probes currently have schedule rows but 0 speed routes, while March 2026 remains the complete public-source build month. Started a production-length May 2026 vehicle-position collection under run ID `gtfs-rt-v1-20260517T022348Z`; that run can advance the May observed layer but cannot honestly complete the March v1 gate.

Decoupled `route-observed-reliability` from monthly brief summaries for early realtime runs. When route/corridor briefs for a month are not built yet, observed reliability now falls back to the route catalog so a fresh GTFS-RT collection can still produce route/month observed and insufficient-sample rows before the full monthly brief layer exists.

Completed the production-length May 2026 GTFS-RT vehicle-position run `gtfs-rt-v1-20260517T022348Z`: 480/480 snapshots succeeded with 0 failures. Ingest parsed 480 snapshots into 358,875 vehicle-position rows. `build:observed-headways` produced 90,136 observed stop events and 73,702 headway samples. `route-observed-reliability -- --year 2026 --month 5 --run-id gtfs-rt-v1-20260517T022348Z` produced 381 route rows, with 229 observed routes, 152 insufficient-sample routes, and 72,782 route-summary headway samples. `gtfs-rt:preflight` now passes strict observed-layer readiness for May 2026.

Fixed the GTFS-RT collection-window QA edge case exposed by the full May run. A requested 4-hour collection at 30-second cadence records 480 samples but only 479 elapsed intervals between the first and last sample, so strict QA now counts the final sample interval toward the effective collection window, capped at the requested duration. Added fixture coverage for this exact case in `gtfs-rt-preflight`.

Re-ran March 2026 v1 checks after repairing generated local route-batch rows from the existing March network summary. `route-batch-audit -- --year 2026 --month 3` passes with 381 routes and 1,677 brief artifacts. `check:pipeline-v1 -- --year 2026 --month 3 --allow-insufficient-gtfs-rt` passes structurally. Strict March still correctly fails only on missing March GTFS-RT observed reliability: no observed routes, insufficient observed-route coverage, and 0 March headway samples. The v1 product decision remains whether to ship March structural evidence with a May observed appendix or wait for public speed coverage in a later month.

Added `audit:pipeline-v1` as a prompt-to-artifact completion audit command. The command runs the public structural and strict v1 gates, runs GTFS-RT preflight for a realtime month/run, summarizes public and realtime source coverage, and writes `data/artifacts/pipeline-v1/audit-<public-month>-<realtime-month>.json` with pass/partial/blocked checklist rows. The current March 2026 public-source + May 2026 realtime audit writes `audit-2026-03-2026-05.json` and is correctly blocked overall because the strict single-month v1 gate still fails and May has 0 speed routes.

## [2026-05-17] engineering | Isolated clean-rebuild smoke path

Fixed a clean-rebuild reproducibility gap where `build:network -- --db ...` still refreshed shared ACE and bus-lane sources into the default local DB. Shared refresh now passes the selected DB path through `ingestAceRoutes`, `ingestAceViolationSummary`, and `ingestBusLanes`, with fixture coverage.

Added `--artifact-root` and `--export-root` support across network build, route/corridor brief generation, route-batch audit, D1 export/verification, strict v1 check, v1 finalization, and `audit:pipeline-v1`. This lets clean rebuild proofs use an isolated DB plus isolated generated outputs instead of overwriting canonical `data/artifacts` and `data/exports` files.

Verified the new path with a one-route clean-DB smoke: catalog and coverage ingested into `data/local/pipeline-clean-smoke.sqlite`; `build:network -- --limit 1 --artifact-root data/artifacts/pipeline-clean-smoke --export-root data/exports/pipeline-clean-smoke` built M57; isolated `route-batch-audit` passed with 6 artifacts; isolated `verify:d1` passed from `data/exports/pipeline-clean-smoke/d1/2026-03/`. This proves the isolated rebuild shape, but the full-network clean rebuild remains open.

## [2026-05-17] engineering | Full-network clean rebuild proof

Completed the full isolated March 2026 clean rebuild from an empty local DB. The run ingested route catalog and March route coverage into `data/local/pipeline-clean-full.sqlite`, then `build:network -- --year 2026 --month 3 --db data/local/pipeline-clean-full.sqlite --no-resume --artifact-root data/artifacts/pipeline-clean-full --export-root data/exports/pipeline-clean-full` built 381/381 routes with 0 failed routes. `finalize:pipeline-v1 -- --allow-insufficient-gtfs-rt` on the same isolated DB/root set passed the v1 structural checker, produced 5,171 speed/ridership trend rows, 381 insufficient GTFS-RT reliability rows, 413 intervention comparisons with 22 evaluated, 209 corridors, 1,677 audited route/corridor brief artifacts, and a verified D1 export.

Extended `audit:pipeline-v1` with `--clean-db`, `--clean-artifact-root`, and `--clean-export-root` so the generated audit can record clean-rebuild evidence instead of carrying a stale missing-proof item. The current March public-source + May realtime audit remains blocked overall, but now marks the reproducible full-network public-source pipeline as pass. The remaining blockers are the strict single-month mismatch: March has public speed coverage but no March observed GTFS-RT samples, while May has observed GTFS-RT reliability but 0 public speed routes.

## [2026-05-17] engineering | Observed reliability window evidence in route briefs

Expanded route brief artifacts beyond route/month observed reliability summaries. `brief-artifacts` now derives top observed long-gap windows and top observed bunching windows from persisted GTFS-RT headway samples, grouped by NYC local weekday/hour, direction, and stop. Route brief JSON and Markdown include sample counts, median/p90/max observed headways, bunching and long-gap shares, expected wait, and excess wait for those windows when samples exist. `route-batch-audit` now validates that route brief JSON carries the observed reliability window contract when observed reliability rows exist.

Regenerated canonical March and isolated `pipeline-clean-full` March brief artifacts so the local static outputs match the new contract. Both route-batch audits passed with 1,677 artifacts and 0 issues; both D1 verifications passed; both structural `check:pipeline-v1 -- --allow-insufficient-gtfs-rt` runs passed. The March public-source + May realtime audit remains blocked only on the known strict single-month source-alignment problem.

## [2026-05-17] engineering | Peer-adjusted intervention comparisons

Expanded ACE/ABLE intervention evaluation beyond raw descriptive before/after rows. Evaluated intervention comparisons now select public peer routes with sufficient trend coverage, matched on pre-period speed and ridership, and persist peer comparison route IDs, peer speed/ridership deltas, and adjusted speed/ridership deltas in local SQLite and D1 serving tables. Route brief JSON/Markdown now carries the adjusted deltas, and strict `check:pipeline-v1` fails when evaluated intervention rows lack peer-adjusted speed deltas. Dated bus-lane before/after evaluation remains open because the current bus-lane source-gap rows still lack route-level implementation dates.

## [2026-05-17] engineering | Segment-backed corridor assignments

Expanded `corridor-model` so public route membership prefers hotspot-segment street evidence before falling back to stop-name majority. `local_corridor_route_member` and D1 `corridor_route_member` now store `matched_segment_count` and `segment_evidence_score`; corridor brief JSON exposes those fields; strict `check:pipeline-v1` fails if no corridor membership has segment evidence. Regenerated canonical and `pipeline-clean-full` March artifacts: 350 public route memberships, 193 corridors, 1,186 corridor hotspots, 579 corridor brief artifacts, and 1,629 audited route/corridor artifacts. Both D1 verifications and both structural v1 checks passed. At this point the remaining corridor gap was shape-based review, which was closed later the same day.

## [2026-05-17] engineering | Corridor intervention context

Added local and D1 `corridor_intervention_context` tables so route-level intervention comparison rows are matched back to corridor members rather than only counted in corridor summaries. `corridor-model` now writes ranked context rows with route, event, program, implementation month, evaluation level, raw/adjusted speed and ridership deltas, comparison route count, and caveat. D1 seed export, verification, repository readback, corridor brief JSON/Markdown, and strict `check:pipeline-v1` now cover the context rows. Regenerated March artifacts and exports: canonical March has 251 corridor intervention context rows; isolated `pipeline-clean-full` has 413. Both route-batch audits, D1 verifications, structural v1 checks, and the March public + May realtime audit ran successfully; the audit remains blocked only on the strict single-month public/realtime source alignment and dated bus-lane before/after evaluation/domain review.

## [2026-05-17] engineering | Corridor shape review

Added `corridor-shape-review`, a post-build/finalize artifact that checks every public corridor route membership against GTFS route-shape geometry. The review matches corridor hotspot segment evidence back to segment-speed endpoint coordinates, computes endpoint-to-shape distances, and writes `data/artifacts/route-batches/{month}/corridor-shape-review.json` with pass/warning/missing statuses. Strict `check:pipeline-v1` now fails if the shape-review artifact is missing, stale, incomplete, or has non-passing segment-backed route assignments. Regenerated canonical and `pipeline-clean-full` March artifacts: both have 350/350 shape-reviewed public route memberships passing, 0 warnings, max endpoint distance 74.38m, and p95 endpoint distance 18.63m. The March public + May realtime audit now marks corridor grouping and corridor briefs as pass; remaining blockers are strict single-month public/realtime source alignment plus dated bus-lane before/after evaluation/domain review.

## [2026-05-17] engineering | Dated bus-lane intervention comparisons

Expanded `route-intervention-evaluation` to parse NYC DOT bus-lane `open_dates` values, including multi-date rows and month/year fallbacks. Public routes with matched bus-lane geometry now receive route-level `nyc_dot_bus_lanes` dated comparisons from the latest parseable matched opening month, while matched segments without parseable dates still get explicit source-gap rows. Canonical March now has 360 intervention comparisons: 79 ACE/ABLE rows and 281 bus-lane rows, including 166 dated bus-lane rows, 58 evaluated peer-adjusted bus-lane rows, and 115 bus-lane source-gap rows. Clean-full March now has 584 intervention comparisons, 326 dated bus-lane rows, and 176 source-gap rows. Regenerated corridor context, brief artifacts, route-batch audits, D1 exports, D1 verifications, structural v1 checks, and the March public + May realtime audit; structural checks pass and the audit remains blocked only on strict single-month source alignment plus remaining bus-lane source gaps/external methodology review.

## [2026-05-17] engineering | Detailed evaluation artifact manifests

Added `evaluation-artifacts`, a static artifact build for detailed observed reliability, route intervention, and corridor intervention payloads under `data/artifacts/evaluations/{month}/`. The generated `manifest.json` records artifact keys, content types, byte lengths, SHA-256 hashes, and row counts. `route-post-build` and `finalize:pipeline-v1` now run the job before brief artifact generation, and `check:pipeline-v1` verifies the manifest and payload contracts against local DB row counts. Regenerated canonical March evaluation artifacts with 381 observed reliability rows, 360 route intervention comparisons, and 360 corridor intervention context rows; regenerated clean-full artifacts with 381, 584, and 584 rows respectively. Added fixture tests for valid manifests, tampered payload detection, expected row-count mismatches, post-build sequencing, and v1 audit evidence. The remaining static artifact contract gap is map payload manifests.

## [2026-05-17] engineering | Static map artifact manifests

Added `map-artifacts`, a static map payload build under `data/artifacts/map/`. It writes source snapshot metadata, current Local/Limited/SBS route GeoJSON, current timepoint-stop GeoJSON, bus-lane GeoJSON, one all-day route-segment GeoJSON per public route/month, and `data/artifacts/map/{month}/manifest.json` with artifact keys, content types, byte lengths, SHA-256 hashes, feature counts, and route IDs. Route-segment payloads validate through `MapRouteSegmentFeatureCollectionSchema`; `route-post-build`, `finalize:pipeline-v1`, `check:pipeline-v1`, and `audit:pipeline-v1` now include the map artifact contract. Regenerated canonical and clean-full March 2026 map artifacts with 354 artifact rows, 350 route-segment artifacts, 4,134 route-segment features, 39,807 total map features, and 0 map manifest issues in structural v1 QA. Added fixture tests for valid map manifests, tampered hash/feature-count detection, missing route-segment coverage, and v1 QA failure when the map manifest is missing.

## [2026-05-17] engineering | GTFS-RT collection handoff status

Added `gtfs-rt:run-status`, a small handoff command for long Bus Time collection runs. It reports collection status, elapsed time, expected and observed snapshot rows, raw protobuf file counts/bytes, parsed snapshot counts, readiness flags, and exact next commands for ingestion, observed-headway building, observed reliability, and preflight. This supports the current 24-hour May 2026 vehicle-position collection run without relying on ad hoc SQLite queries between agents.

## [2026-05-17] engineering | Active observed-reliability run replacement

Changed route/month observed reliability rebuilds so a new `route-observed-reliability` run replaces prior observed reliability summaries for that analysis month. This prevents stale Bus Time runs, such as earlier smoke or shorter collection windows, from coexisting with the selected production run and double-counting route coverage in briefs, D1 exports, evaluation payloads, or strict v1 QA.

## [2026-05-17] engineering | Observed-reliability stale-run QA gate

Tightened `check:pipeline-v1` so stale observed-reliability rows cannot silently pass. The QA gate now reports duplicate route/month observed reliability rows and multiple active GTFS-RT run IDs for a month, and observed-route coverage is computed from unique public route IDs rather than row count. Added a regression fixture that inserts a stale GTFS-RT reliability row after artifact generation and verifies the gate fails.

## [2026-05-17] docs | V1 pipeline framing cleanup

Refreshed README, pipeline README, roadmap, ETL/CLI, and source-data pages so they describe the actual full-network v1 pipeline instead of the older M1-only prototype. GTFS-RT Bus Time collection is now documented as v1 observed-reliability evidence, M1 commands are marked as compatibility/fixture helpers, route/corridor brief artifacts plus evaluation/map manifests are documented as the current static serving outputs, and the remaining blocker is the strict single-month public/realtime source alignment.

## [2026-05-17] docs | Production source refresh scope

Clarified that Bus Time GTFS-RT is live forward collection, not historical backfill: partial run counts such as `98/2880` mean snapshots fetched since the run started. Updated the v1 completion plan, roadmap, and managed-services memo to include production refresh scope: a deployed GTFS-RT collector that writes raw snapshots and metadata to durable storage, plus a monthly MTA Open Data watcher that distinguishes schedule-only months from months with published route segment speed rows before rerunning the full build/finalize/export verification path.

## [2026-05-17] engineering | Route speed release availability check

Added `check:route-speed-availability`, a fixture-backed pipeline command that queries grouped MTA Bus Route Segment Speeds coverage by route/month, reports the latest complete speed month, marks requested months as `complete`, `insufficient_speed_routes`, or `missing_speed`, and writes `data/artifacts/source-availability/route-speed-availability.json` by default. Live checks on 2026-05-17 reported March 2026 as the latest complete speed month with 353 routes, 472,361 rows, and 7,249,761 bus trips; April and May 2026 both returned `missing_speed`. This makes the monthly-public-source watcher substrate explicit instead of relying on ad hoc Socrata queries.

## [2026-05-17] engineering | Source availability in v1 audit

Extended `audit:pipeline-v1` to read the route-speed availability artifact when present and include it under `sourceAvailability.routeSpeed`. The single-month source availability checklist now cites the latest complete speed month and requested-month status from the watcher artifact alongside local DB coverage counts, so release audits preserve both built-state evidence and upstream-publication evidence.

## [2026-05-17] engineering | GTFS-RT run-status artifact

Extended `gtfs-rt:run-status` so long-running Bus Time collection handoffs write `data/artifacts/gtfs-rt/run-status/<run_id>.json` by default, with `--output` and `--artifact-root` overrides. The artifact includes collection progress, raw snapshot file counts, parse readiness, and exact next commands, making active 24-hour runs easier to resume after thread or agent handoff.

## [2026-05-17] docs | Active GTFS-RT handoff runbook

Added an active handoff runbook for `gtfs-rt-v1-20260517T103607Z-24h` to the Data Pipeline v1 plan. It records the canonical local DB path, artifact root, generated run-status artifact path, polling command, post-completion ingest/build/preflight commands, and the March public + May realtime audit command. The runbook explicitly notes that this remains appendix evidence until public route segment speed rows are published for the same realtime month.

## [2026-05-17] engineering | Source availability rebuild decision

Extended `check:route-speed-availability` with `--last-built-year` and `--last-built-month`. The generated source-availability artifact now includes `releaseDecision`, with `shouldRebuild` set when the latest complete speed month is newer than the last built month. This gives a future monthly watcher an explicit rebuild decision instead of forcing it to interpret latest/requested month fields itself.

## [2026-05-17] docs | Production source cadence acceptance

Confirmed April 2026 route-speed availability with `check:route-speed-availability`: latest complete public speed month remains March 2026; April has 0 route-speed rows; with March as the last built month the release decision is `no_new_complete_month` and `shouldRebuild=false`. Updated the v1 completion plan and pipeline README to make the source cadence explicit: GTFS-RT counts grow because collection is live forward capture, while monthly route-speed data is delayed aggregate data. Added production refresh acceptance criteria for a scheduled GTFS-RT collector plus a monthly public-source watcher.

## [2026-05-17] engineering | Source refresh plan artifact

Added `plan:source-refresh`, a small pipeline command that writes `data/artifacts/source-refresh/plan.json`. The artifact combines the route-speed rebuild decision with explicit GTFS-RT collector and monthly route-speed watcher jobs, statuses, cadence, evidence, and next actions. Live May 2026 output marks the GTFS-RT collector `required` and the monthly watcher `idle` because latest complete route-speed data is still March 2026 and March is already the last built month.

## [2026-05-17] engineering | Source refresh plan in v1 audit

Extended `audit:pipeline-v1` so `sourceAvailability` includes both `routeSpeed` and `refreshPlan`. The single-month source availability checklist now includes source-refresh job statuses such as `gtfs_rt_collector=required` and `route_speed_monthly_watcher=idle`. If public/realtime months align but the source-refresh plan artifact is missing, the checklist row is `partial` with an explicit missing item instead of silently passing.
