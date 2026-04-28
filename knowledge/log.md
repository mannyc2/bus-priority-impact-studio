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

## [2026-04-27] data | Planned route batch execution

Added `bun run build:planned-routes` to consume `route-build-plan.json`, build selected route slices, merge them into the existing batch summary instead of replacing previous built routes, refresh route comparison, refresh the build plan, and regenerate the D1 seed. The first live March 2026 planned build used `--limit 5` and added `M57`, `M42`, `M31`, `BX2`, and `M50` to the existing M1/M2 batch. The batch now has 7 built routes, 63 artifact metadata rows in the D1 export, and 7 route comparison rows. The refreshed planner now marks 7 routes as already built and selects the next 20 candidates starting with `M125`, `BX35`, `M8`, `BX32`, and `M106`.

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
