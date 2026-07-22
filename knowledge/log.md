# Log

Append-only chronological log. Use the prefix format `## [YYYY-MM-DD] type | title`.

## [2026-07-19] engineering | Plan 085 de-months the public serving contract

Completed Plan 085. Release-bearing Studio and public API responses now resolve the latest passing
published D1 batch and carry one canonical `releaseId` / `publishedAt` / `coverage` triple. Public
release selection no longer accepts `?month=` or Worker month pins; the historical route-scorecard
query uses `?asOfMonth=` as evidence grain. Capability and dossier producers use the same identity,
and served capability freshness is recomputed at request time.

Verification passed: root typecheck; architecture, design, and month-doctrine gates; 827 unit tests;
284 web tests; 22 Worker tests; the web production build and bundle budgets; knowledge validation;
and the focused publish-completeness/compatibility fixture gate (9 tests). The checked-in March
serving artifacts retain the previous payload schema and must be regenerated with the Plan 086 D1,
Studio, and map release cutover before this reader contract is deployed; code merge is safe because
Plan 086 follows immediately.

## [2026-07-06] design | MTA visual language cutover

Gen-6 plan 048 retires the warm "tarbell" surface ladder for the MTA signage
palette: cool near-white surfaces, true-white cards, ink `#101418`, MTA Blue
`#0039a6` accent, and a black signage nav bar. Touches `global.css` tokens,
`MAP_COLORS`, and the shell header. The operator's 2026-07-06 critique is the
new design authority, superseding the July-4 warm/editorial tokens.

## [2026-07-05] engineering | Plan 045 Order 1 and Plan 047 native kit migration land

Completed the bus-repo half of Plan 045 Order 1 by bumping
`@nyc-transit-kit/{compat,contracts,mta,nyc-dot,nyc-open-data,soda3}` catalog pins to `0.2.0`,
rerunning `bun install`, and moving the Studio API `isSoda3ClientError` import to
`@nyc-transit-kit/compat/errors` while leaving its Promise-shaped SODA3 query helper on
`@nyc-transit-kit/compat/soda3`.

Completed Plan 047 by switching Effect-zone SODA3 query/export code in `tools/pipeline-v2/src` and
`packages/sources/src` to native `@nyc-transit-kit/soda3` Effects/layers. Pipeline retry, timeout,
app-token, and typed error metadata now wrap the native toolkit HTTP layer with toolkit retries
disabled at that boundary. The local CSV/download helpers remain bus-repo owned until Plan 045
Orders 2-4 publish the follow-up kit features.

Added ADR 0021 and a production-boundary harness gate: `tools/pipeline-v2` and `packages/sources`
source/manifests may not import or depend on `@nyc-transit-kit/compat`; compat remains sanctioned
only at Promise edges such as `packages/studio-api` while the Plan 026 Worker Effect regression is
blocked.

Verification passed: `bun install`; `bun run check:web-architecture` (21 pass);
`bun --filter @bp/pipeline-v2 test` (203 pass); `bun --filter @bp/studio-api test` (52 pass);
`bun run test:unit` (667 pass); `bun --filter @bp/pipeline-v2 typecheck`;
`bun --filter @bp/sources typecheck`; and `bun --filter @bp/studio-api typecheck`. The compat scan
now finds only the root catalog and `packages/studio-api`.

## [2026-07-05] engineering | Plan 044 closes zod eviction with ADR-0020

Completed the Plan 044 closeout after the source, analytics, studio-api, and pipeline schema leaves
were migrated off direct Zod imports. First-party app/package/tool/script/test code now has a
permanent boundary guard in `tests/harness/production-boundaries.test.ts` rejecting module
specifiers equal to `zod` or starting with `zod/`.

Added ADR 0020, making Effect Schema the only first-party runtime schema layer and explicitly
superseding the Zod runtime-contract clause of ADR 0001. Updated the live package-structure and
testing standards pages to direct boundary contracts through Effect Schema, keep the browser
schema-free at runtime, and keep `@bp/db` schema-library-free with Drizzle-derived row types plus
focused boundary validation.

Verification passed: `bun run check:types`, `bun run check:web-architecture` (20 pass), `bun run
check:knowledge`, `bun run test:unit` (663 pass), `bun run test:web` (114 pass), and `bun run
test:worker` (19 pass). The zod hygiene gates are empty/zero (`rg` import scan, package-manifest
scan, `grep -c '"zod@' bun.lock`), `bun pm why zod` reports no matching lockfile packages, and `git
diff --check` is clean. A temporary `tests/harness/zod-guard-probe.ts` with `import "zod";` made
`check:web-architecture` fail with the expected file-specific guard message, then the probe was
deleted and the architecture check passed again.

## [2026-07-04] engineering | Generation 4 hardening and public route repairs land

Completed plans 030-035. Backend hardening restored Snapshot 2.0 to
parse-loose/compose-strict behavior, added per-request API request IDs and JSON error envelopes,
logged projection/evidence validation issues without exposing them to clients, and degraded malformed
route evidence/model projections instead of taking Worker 1101-style crashes. The serving route-card
contract is now honest-or-absent: fabricated scheduled speeds, synthetic sparks, invented miles,
placeholder interventions, and fake rider burden/trends were removed from sparse route cards, with
route-list percentiles derived only from served route rows.

Frontend repair completed the July design slice without reviving deleted gen-3 surfaces: route pages
now use one scroller with slim sticky section nav, a compact public header, verdict lede, ranked
insight list, Slow segments before Route map, honest null-state charts/maps/KPIs, and mobile-readable
segment rows. The home page now uses "Read the full story" featured CTAs, hero free-text search that
lands in the directory filter, a header-rail directory filter, mobile directory summary rows,
accessible borough filter chips, and no dead `RouteHeader`/`RouteIdentity`/`DotGlyph` component
family.

Verification passed: `bun --filter @bp/domain typecheck`; `bun --filter @bp/domain test`;
`bun --filter @bp/studio-api typecheck`; `bun --filter @bp/studio-api test`;
`bun --filter @bp/web typecheck`; `bun run test:web`; `bun run test:worker`;
`bun --filter @bp/web build`; `bun run check:style`. Dev-server smoke on
`http://127.0.0.1:5173/` and `/routes/m15-sbs` returned 200. Browser screenshots were not captured
because this workspace has no Playwright or headless browser binary installed. Operator-only follow-up
from plan 030 remains production log/R2/D1 probes and any artifact re-publish/deploy decision.

## [2026-07-04] ui | July design export becomes current frontend audit source

Imported the July 4 design export into
`knowledge/raw/design-handoffs/bus-priority-impact-studio-2026-07-04/` and updated
`knowledge/wiki/engineering/studio_design_pass_status.md` so future frontend work no longer treats
the May tarbell pass as current acceptance. The repo-local source capture is now recorded as the
current design source for audit/planning, with priorities ordered around shell/header, route detail,
routes home/search, secondary public surfaces, and authoring/review. Added the status page to
`knowledge/index.md` so agents find the design-source pointer before writing frontend cleanup plans.

## [2026-07-03] engineering | nyc-transit-kit 0.1.3 cutover lands in bus repo

Completed Plan 029 in branch `codex/029-adopt-nyc-transit-kit`. `npm view` reported
`@nyc-transit-kit/{compat,contracts,mta,nyc-dot,nyc-open-data,soda3}` latest as `0.1.3`, and the
root catalog now pins all six packages to `0.1.3`. `bun pm why effect` shows a single resolved
`effect@4.0.0-beta.92`, including the toolkit packages, so the previous downstream
`exactOptionalPropertyTypes` blocker from the `0.1.2` package source is gone.

The cutover deletes the local generic Socrata client subpaths and the local GTFS Realtime vendor
wrapper. Generic SODA3 query/export calls and GTFS Realtime protobuf decoding now come from
`nyc-transit-kit`; `@bp/sources` keeps only Bus Priority manifest parsing, normalizers, probes,
lightweight metadata URL helpers, and source DTO contracts. `tools/pipeline-v2` intentionally keeps
the rich catalog-search helper local because the installed toolkit catalog API still lacks the
posting-frequency, time-period, granularity, agency/owner, column, and result-size fields used by
`sources catalog-search`. The final tracked diff is 62 files changed, 827 insertions, and 1,054
deletions.

Verification run: `bun install`; `bun pm why effect`; `bun --filter @bp/sources typecheck`;
`bun --filter @bp/pipeline-v2 typecheck`; `bun --filter @bp/studio-api typecheck`;
`bun --filter @bp/sources test`; `bun --filter @bp/pipeline-v2 test --timeout 5000`;
`bun --filter @bp/studio-api test`; `bun test tools/pipeline-v2/test/lib/socrata-monthly-ingest.test.ts --timeout 5000`;
`bun test packages/sources/test/gtfs-rt.test.ts --timeout 5000`;
`bun test tools/pipeline-v2/test/commands/sources/soda3-range-probe.test.ts tools/pipeline-v2/test/commands/sources/catalog-search.test.ts --timeout 5000`;
`bun test packages/studio-api/test/source-refresh.test.ts --timeout 5000`;
`bun run check:web-architecture`; `bun --filter @bp/web build`. The first full pipeline test run
failed only because the ignored sandbox fixture `data/artifacts/findings/detector-specs.json` was
absent in the clean worktree; after copying the documented local fixture into place, the rerun
passed 384 tests.

## [2026-07-03] engineering | nyc-transit-kit 0.1.2 pin prepared, adoption waits on release

Prepared upstream `nyc-transit-kit` branch `codex/029-effect-beta-92` and draft PR
<https://github.com/mannyc2/nyc-transit-kit/pull/4> to bump the kit to `0.1.2` and align
`effect`, `@effect/platform-bun`, and the `@effect/platform-node-shared` override to
`4.0.0-beta.92`. The kit checks are green: `bun run check` exits 0, and
`bun run check:release-local` exits 0 from `/tmp/nyc-transit-kit-029-release` after `/mnt/models`
ran out of room for the ~95 MB CLI binary artifact.

The release plan still gates npm publication as irreversible trusted publishing through
`release.yml`; `npm view @nyc-transit-kit/soda3@0.1.2 version` currently returns 404 while latest
remains `0.1.1`. Plan 029 downstream adoption in this repo is therefore blocked until the operator
approves and publishes `@nyc-transit-kit/*@0.1.2`; do not add local file/link dependencies to fake
the release.

## [2026-07-03] engineering | MTA-wiki importer pins releases and consumes route anchors

Extended `studio import-mta-wiki-route-evidence` so the bus repo can consume a named mta-wiki
release via `--wiki-release <id>` instead of requiring a live `data/canonical` checkout. When a
release contains `route_anchors.jsonl`, route matching now uses exact GTFS route ids from the anchor
file and treats the old route-alias heuristic as the no-anchor fallback. Unsupported relation
endpoints such as `claim_*` and `entity_*` are no longer counted as ambiguous route omissions.

Verified against `/mnt/models/dev/mta-wiki` release `v1-rc5` using the local generated Bus
`routes.json`: the importer exits 0 with `routeCount: 12`, `matchedBusRouteCount: 10`,
`unmatchedWikiRouteCount: 308`, `citationCount: 1792`, and
`omittedAmbiguousRecordCount: 0`. The two unmatched served routes are the honest
`no_wiki_coverage` M14A+/M14D+ anchor rows. Checks run: focused
`bun test tools/pipeline-v2/test/studio-mta-wiki-route-evidence.test.ts --timeout 5000`,
`bun --filter @bp/pipeline-v2 typecheck`, and `bun --filter @bp/pipeline-v2 test --timeout 5000`
(after copying the ignored sandbox fixture `data/artifacts/findings/detector-specs.json` into the
clean worktree).

## [2026-06-12] engineering | Route map gains real shoreline context and stop ticks

Follow-up to the frontend regression slice: the bare route polyline now sits on real geography.
Added `map context`, a pipeline-v2 command that parses the captured NYC borough-boundary bulk
CSV (WKT multipolygons), Douglas-Peucker-simplifies the shoreline to ~40m tolerance, drops
sub-0.1km2 islands, and emits `map/context/nyc-boroughs.min.geojson` (5 boroughs, 33 rings,
~65KB). `RouteGeoMap` renders it as a water-gradient background with land polygons under the
route, projected through the same equirectangular transform, plus intermediate timepoint stop
ticks with cleaned cross-street labels. The context fetch is progressive enhancement — a 404
falls back to the plain route rendering. Everything drawn is real data: GTFS street geometry,
observed segment speeds, NYC Open Data shoreline, timepoint coordinates. Local dev serving needs
the context artifact seeded once via `scripts/seed-local-studio-r2.sh ... data/artifacts/map/context`.

Verified with `bun --filter @bp/pipeline-v2 test` (493 pass), the real `map context` command run
(byte-identical artifact), `bun test apps/web/test` (88 pass), `bun --filter @bp/web build`
(budget ok), and headless screenshots of M15-SBS (Manhattan/East River) and B46-SBS (Brooklyn/
Jamaica Bay) map tabs.

## [2026-06-12] engineering | Frontend regression fixes from user design review

The user reviewed the dossier-redesign frontend (PRs #12–#32) and rejected several of its
patterns. This slice applies the punch list. Deleted every visible "data as of" freshness chip
(the `DataAsOf` component and the shell nav "data current to" line are gone; the underlying
dossier clocks are untouched). The route header KPI strip now leads with real numbers — observed
mph, 6-month trend %, excess wait minutes, daily riders, bus-lane coverage % — instead of the
judged words Condition/Observed/Treated; peer framing moved to the sub-line.

/routes now has one "Routes needing attention" block in the discovery-section layout
(needs_attention, worsening_fast, treatment_gaps; data_coverage is no longer rendered publicly)
plus a clean "All routes" index sorted by riders with em-dashes for unpublished values, fixing
the all-zeros alphabetical list. The route Overview was rebuilt: prose summary sentence, the
"Story" chart renamed to a real "Speed history" frame, fake hardcoded insight micro-figures and
the badge-soup verdict bar deleted. The homepage now ends after the "every route" index — the
how-to-use cards and the fabricated colophon (fake analysts, stats, contact) are deleted.
Findings cards hide "x/100 detector score" strings via `publicMetric` and drop the fabricated
ConfidenceBar; real quantities still render.

The Map tab is now an actual geographic map: `RouteGeoMap` draws the precomputed
`map/route-segments/{routeId}/{month}/all-day.geojson` artifacts (real street LineStrings,
speed-banded colors, termini, slowest-stretch callout gated to genuinely slow segments) as plain
SVG — no map library, bundle stays at 482.6/485 KB gz. The client reaches it through the
existing `/api/v1/map/manifest` + `/api/v1/artifacts/:key` endpoints; local dev R2 was seeded
with `scripts/seed-local-studio-r2.sh ... data/artifacts/map/<dir>`. Overview's map card uses a
compact variant of the same component, replacing the 150×22 `CorridorMapMini` strip.

Verified with `bun test apps/web/test` (88 pass), `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build` (budget ok), `bunx biome check` on changed files, and headless
browser screenshots of /, /routes, /routes/m15-sbs (Overview + Map tabs), and /findings.
Follow-ups the user has asked for but not in this slice: Where & when redesign, finding-detail
and brief-detail pages, a citywide map page.

## [2026-06-12] engineering | Condition KPI leads with peer framing

Aligned the judged KPI strip with the route-detail redesign contract: the Condition tile now leads
with peer-relative framing when a speed peer percentile is available, while the raw mph value moves
to supporting copy. Added a server-rendered shared test that asserts the peer percentile appears
before the mph value. Trimmed adjacent route-detail copy in reliability, where/when, and rider
impact summaries so the production build stays under the unchanged 485 KB gz total-JS budget.

Also reviewed `nyc_dot_bus_priority_document_pdf_fordham_rd_inwood_cb11_jun2023` from the
full-corpus source review workspace. The local ignored reviewed-record seed now has 47
reviewed-record sources and 52 valid records. This source contributes two conservative Bx12 records:
an implemented Bx12 SBS ABLE record with the November 18, 2022 implementation date, January 17,
2023 summons start, Fordham Road ticket/speed observations, and operating-hour caveats; and a
Fordham Road/Inwood alternatives-under-study planning record from the June 5, 2023 CB11
presentation. The planning record cites Alternative A offset bus lanes and the studied eastbound
and two-way busway concepts without treating CB11 as final selection or implementation proof, limits
route assignment to Bx12 SBS until route-shape review supports wider fanout, and caveats
cross-section/map/traffic-analysis details before block-level publication.

Regenerated the local ignored source receipt closure audit with the current v2 flags. It now
reports 291 queue sources, 52 valid reviewed records, 47 reviewed-record sources, 4 disposition
receipts, 49 closed sources, 242 open sources, and 0 conflicts; public promotion remains blocked on
full source closure.

Verified with `bunx biome check apps/web/src/components/route/RouteJudgedKpiStrip.tsx
apps/web/src/components/route/ReliabilitySection.tsx
apps/web/src/components/route/reliability-summary.ts
apps/web/src/components/route/where-when-summary.ts
apps/web/src/components/route/rider-impact-summary.ts
apps/web/test/shared/route-judged-kpi-strip.test.ts
apps/web/test/shared/where-when-summary.test.ts
apps/web/test/shared/rider-impact-summary.test.ts
apps/web/test/shared/reliability-summary.test.ts knowledge/log.md`, `bun test
apps/web/test/shared/route-judged-kpi-strip.test.ts
apps/web/test/shared/where-when-summary.test.ts
apps/web/test/shared/rider-impact-summary.test.ts
apps/web/test/shared/reliability-summary.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `bun run check:types`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:knowledge`,
and `git diff --check`.

## [2026-06-12] engineering | Coverage summaries omit zero ready counts

Tightened route capability coverage summaries so sparse manifests no longer start with `0 ready`.
Rows with insufficient or not-applicable evidence now summarize only the states actually present,
while checked-clean, partial, building, blocked, and not-applicable counts keep their existing
ordering. Trimmed adjacent route-detail evidence labels (`Speed`, `Geometry`, `Findings`, `unknown`,
shorter empty-state copy) so the production bundle stays under the unchanged 485 KB gz total-JS
budget.

Also reviewed `nyc_dot_bus_priority_document_pdf_brt_south_brooklyn_b82_may2017` from the
full-corpus source review workspace. The local ignored reviewed-record seed now has 46
reviewed-record sources and 50 valid records. This source contributes one conservative proposed B82
Southern Brooklyn SBS design record for the May 9, 2017 deck, covering the planned SBS feature
package, bus-lane typologies, signal priority, off-board fare collection, all-door boarding,
Glenwood Road reroute, pedestrian/safety/intersection work, and the source-stated 2018 launch
schedule. The record caveats that the source is planning evidence rather than implementation proof,
that program benefit statements are not observed B82 impacts, and that map-derived lane/route
geometry needs later visual review before block-level publication.

Regenerated the local ignored source receipt closure audit with the current v2 flags. It now
reports 291 queue sources, 50 valid reviewed records, 46 reviewed-record sources, 4 disposition
receipts, 48 closed sources, 243 open sources, and 0 conflicts; public promotion remains blocked on
full source closure.

Verified with `bunx biome check apps/web/src/components/route/coverage-matrix.ts
apps/web/src/components/route/DataNotesSection.tsx apps/web/test/shared/coverage-matrix.test.ts
apps/web/test/shared/data-notes-section.test.ts`, `bun test
apps/web/test/shared/coverage-matrix.test.ts apps/web/test/shared/data-notes-section.test.ts
--timeout 5000`, `bun --filter @bp/web typecheck`, `bun --filter @bp/web build`, `bun run
check:types`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:knowledge`,
and `git diff --check`.

## [2026-06-12] engineering | Evidence header summarizes hidden notices

Made the Evidence tab's own section header summarize manifest-hidden section notices, not just
public insight rows. The visible Evidence badge already counted hidden reliability/treatment
notices; the page body now mirrors that contract with a compact warning badge even when there are no
native insight rows. Added a server-rendered route evidence test for the zero-insight, one-hidden
notice case, and kept the production bundle under the unchanged 485 KB gz total-JS cap by rendering
the header badges inline.

Also reviewed `nyc_dot_bus_priority_document_pdf_fordham_rd_inwood_cb6_jun2023` from the
full-corpus source review workspace. The local ignored reviewed-record seed now has 45
reviewed-record sources and 49 valid records. This source contributes two conservative Bx12 records:
an implemented Bx12 SBS ABLE record with the November 18, 2022 implementation date, 60-day warning
period, Fordham Road ticket/speed observations, and operating-hour caveats; and a proposed Fordham
Road/Inwood Alternative A offset-bus-lane planning record from the June 22, 2023 CB6 presentation.
The design record treats the eastbound and two-way Fordham Road busway concepts as studied
alternatives rather than selected interventions, includes the source-stated CB6 curb-space context,
limits route assignment to Bx12 SBS until route-shape review supports wider fanout, and caveats
map-derived geometry before block-level publication.

Regenerated the local ignored source receipt closure audit with the current v2 flags. It now
reports 291 queue sources, 49 valid reviewed records, 45 reviewed-record sources, 4 disposition
receipts, 47 closed sources, 244 open sources, and 0 conflicts; public promotion remains blocked on
full source closure.

Verified with `bunx biome check apps/web/src/components/route/DataNotesSection.tsx
apps/web/test/shared/data-notes-section.test.ts`, `bun test
apps/web/test/shared/data-notes-section.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build`, `bun run check:types`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, and `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Evidence badge severity reflects hidden notices

Tightened the route-section registry so Evidence tab badges preserve detector counts and now lift
low-severity Evidence badges to medium when manifest-hidden section notices are folded into
Evidence. This keeps a hidden reliability/treatment notice from looking like a low-priority
Evidence-only signal. Trimmed three tab-question tooltips (`Where does it hurt?`, `What was
tried?`, `What can I cite?`) so the unchanged production bundle cap still passes at 485.0 KB gz
total JS.

Also reviewed `nyc_dot_bus_priority_document_pdf_fordham_rd_inwood_cb7_jun2023` from the
full-corpus source review workspace. The local ignored reviewed-record seed now has 44
reviewed-record sources and 47 valid records. This source contributes two conservative Bx12 records:
an implemented Bx12 SBS ABLE record with the November 18, 2022 implementation date, 60-day warning
period, Fordham Road ticket/speed observations, and operating-hour caveats; and a proposed Fordham
Road/Inwood Alternative A offset-bus-lane planning record from the June 1, 2023 CB7 presentation.
The design record treats the eastbound and two-way Fordham Road busway concepts as studied
alternatives rather than selected interventions, limits route assignment to Bx12 SBS until
route-shape review supports wider fanout, and caveats map-derived geometry before block-level
publication.

Regenerated the local ignored source receipt closure audit with the current v2 flags. It now
reports 291 queue sources, 47 valid reviewed records, 44 reviewed-record sources, 4 disposition
receipts, 46 closed sources, 245 open sources, and 0 conflicts; public promotion remains blocked on
full source closure.

Verified with `bunx biome check apps/web/src/components/route/section-registry.ts
apps/web/test/shared/section-registry.test.ts apps/web/test/shared/route-detail-shell.test.ts`,
`bun test apps/web/test/shared/section-registry.test.ts
apps/web/test/shared/route-detail-shell.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build`, `bun run check:types`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, and `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:knowledge`,
and `git diff --check`.

## [2026-06-12] engineering | Overview empty state distinguishes checked-clean evidence

Tightened the route Overview zero-insight state so it only says "Checked clean" when the capability
manifest actually contains checked-clean surfaces. Routes with no Overview insight cards but no
clean manifest surfaces now say no flags surfaced yet and point to Evidence readiness instead of
overclaiming a clean check. Trimmed adjacent route-detail and coverage labels (`depth unknown`,
`Schedule`, `no rank`, `none`, shorter chart source text) to keep the unchanged web bundle cap
passing at 485.0 KB gz total JS.

Also reviewed `nyc_dot_select_bus_service_pdf_2013_11_sbs_nostrand_flyer` from the full-corpus
source review workspace. The local ignored reviewed-record seed now has 43 reviewed-record sources
and 45 valid records. This source contributes one conservative implemented B44 Nostrand/Rogers SBS
launch record with the November 17, 2013 effective date, bus lanes, off-board fare collection,
all-door boarding, northbound Rogers Avenue reroute, station streetscape work, truck loading
windows, and the source-stated 40,000-rider context. The record caveats that the flyer's
"faster/more reliable" language is not measured impact evidence, that B49 appears only as local
service context, and that bus-lane hours/geometry and construction timeline details need later
publication review.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 45
valid reviewed records, 43 reviewed-record sources, 4 disposition receipts, 45 closed sources, 246
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bunx biome check apps/web/src/components/route/coverage-matrix.ts
apps/web/src/components/route/OverviewSection.tsx
apps/web/src/components/route/RouteJudgedKpiStrip.tsx
apps/web/test/shared/coverage-matrix.test.ts knowledge/log.md`, `bun test
apps/web/test/shared/coverage-matrix.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Route header surfaces dossier archetype

Promoted the route dossier archetype into the first-screen route header context. `RouteHeader` now
accepts a compact `contextLabel`, and the route-detail page computes it from the dossier/capability
archetype so flagship, calibrated, and setup-state context is visible before the tabs. Added a
server-rendered header test to lock the context label and metric-strip slot together. Trimmed two
route-detail action labels so the unchanged web bundle cap still passes at 485.0 KB gz total JS.

Also reviewed `nyc_dot_bus_priority_document_pdf_2015_04_29_brt_woodhaven_dw3_discussionmaterials`
from the full-corpus source review workspace. The local ignored reviewed-record seed now has 42
reviewed-record sources and 44 valid records. This source contributes one conservative proposed
Q52/Q53 Woodhaven/Cross Bay Boulevard Workshop #3 design-alternatives record covering left-turn
controls near 101 Avenue, 103 Avenue, Rockaway Boulevard, and 107 Avenue plus Van Wicklen Road
stop-location, pedestrian-crossing, and greenstreet options. The record treats the pages as
proposed design evidence only and requires source-page visual/geometry review before stop-level,
safety-impact, or block-level publication.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 44
valid reviewed records, 42 reviewed-record sources, 4 disposition receipts, 44 closed sources, 247
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bunx biome check apps/web/src/components/route/RouteHeader.tsx
apps/web/src/studio/pages/route-detail.tsx apps/web/test/shared/route-header.test.ts
knowledge/log.md`, `bun test apps/web/test/shared/route-header.test.ts --timeout 5000`, `bun
--filter @bp/web typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Where & when floats dossier worst segment

Made the Where & when tab actually surface the dossier's persistent-worst segment in the featured
segment rail. The segment ordering helper still keeps detector-targeted rows ahead of generic
fallback rows, but the caller now prepends the matching `dossier.worstSegment.segmentId` when it is
present in the active direction filter, so the persistence badge is not stranded off-screen.
Trimmed the low-value off-row note counter and chart subtitles to keep the production build under
the unchanged bundle cap at 484.9 KB gz total JS.

Also reviewed `nyc_dot_bus_priority_document_pdf_2015_04_23_brt_woodhaven_dw2_discussionmaterials`
from the full-corpus source review workspace. The local ignored reviewed-record seed now has 41
reviewed-record sources and 43 valid records. This source contributes one conservative proposed
Q52/Q53 Woodhaven/Cross Bay Boulevard Workshop #2 design record for the 67th Drive to 73rd Avenue
area, covering bus-only lanes, left-turn controls, a proposed 68 Road eastbound traffic-direction
reversal, new two-way operation near Cooper Avenue and Trotting Course Lane, and side-lane parking.
The record treats the pages as proposed design evidence only and requires visual review before
publishing block-level reversal or two-way-operation geometry.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 43
valid reviewed records, 41 reviewed-record sources, 4 disposition receipts, 43 closed sources, 248
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bunx biome check apps/web/src/components/route/SlowSegments.tsx
apps/web/test/shared/where-when-segment-order.test.ts knowledge/log.md`, `bun test
apps/web/test/shared/where-when-segment-order.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Where & when badges persistent worst segments

Promoted the route dossier's persistent-worst segment signal into the Where & when tab. Featured
segment cards now show a compact persistence badge when their segment ID matches
`dossier.worstSegment.segmentId`, while unrelated segments stay unbadged. The helper is pure and
covered for matched and unmatched segment IDs. Trimmed nearby Where & when labels so the unchanged
web bundle budget still passes at 485.0 KB gz total JS.

Also reviewed `nyc_dot_bus_priority_document_pdf_2014_11_brt_utica_workshopsummary` from the
full-corpus source review workspace. The local ignored reviewed-record seed now has 40
reviewed-record sources and 42 valid records. This source contributes one conservative in-progress
B46/Utica Avenue SBS planning record for the November 13, 2014 workshop-summary cover page. It
keeps canonical treatments empty, records only the SBS planning/workshop context, and caveats that
the extracted page does not identify specific proposed treatments, implementation dates, community
feedback, or measured B46 impacts.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 42
valid reviewed records, 40 reviewed-record sources, 4 disposition receipts, 42 closed sources, 249
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bunx biome check apps/web/src/components/route/SlowSegments.tsx
apps/web/src/components/route/where-when-summary.ts
apps/web/test/shared/where-when-summary.test.ts knowledge/log.md`, `bun test
apps/web/test/shared/where-when-summary.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Map tab summarizes focus segment

Turned the Map tab's third stat from a route artifact count into a detector-aligned focus-segment
summary. The new shared helper reports the highlighted segment speed, extent, rounded rider-hours
exposure, and overlapping bus priority treatments; when detector map signals do not match a segment,
it reports an unmatched map signal, and when there are no map signals it reports a clear no-flag
state. Added focused helper coverage for matched, unmatched, and clear states so the Map tab follows
the same detector-prioritized highlight contract as the Overview mini-map.

Also reviewed `nyc_dot_bus_priority_document_pdf_2015_04_30_brt_woodhaven_dw4_discussionmaterials`
from the full-corpus source review workspace. The local ignored reviewed-record seed now has 39
reviewed-record sources and 41 valid records. This source contributes one conservative proposed
Q52/Q53 SBS Rockaway Peninsula stop-consolidation record from the April 30, 2015 Public Design
Workshop #4 materials, covering the potential 15 Road or 16 Road consolidation in Broad Channel,
the proposal to consolidate the last southbound stop to Beach 67 Street, and the source legend's
proposed limited-stop discontinuation context. The record treats the page as workshop/proposed
design evidence only: no implementation date, no completion proof, no measured impact metric, and
no stop-level publication without source-page visual review.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 41
valid reviewed records, 39 reviewed-record sources, 4 disposition receipts, 41 closed sources, 250
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bunx biome check apps/web/src/components/route/RouteMapSection.tsx
apps/web/test/shared/route-map-highlight.test.ts knowledge/log.md`, `bun test
apps/web/test/shared/route-map-highlight.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Overview mini-map follows detector segment focus

Aligned the route-detail verdict mini-map with the Map tab by reusing the detector-prioritized
route-map highlight. When a map-placement insight targets a segment, the Overview mini-map now
outlines that detector-targeted segment before falling back to the legacy flagged/top-impact
segment. Added a render-level test so the Overview card proves it outlines the targeted segment,
not just the pure helper result. The production build remains under the existing bundle cap at
485.0 KB gz total JS against the 485 KB budget.

Also reviewed `nyc_dot_bus_priority_document_pdf_2015_04_01_brt_woodhaven_newsletter_1_spring2015`
from the full-corpus source review workspace. The local ignored reviewed-record seed now has 38
reviewed-record sources and 40 valid records. This source contributes one conservative proposed
Q52/Q53 SBS draft-design record for Woodhaven and Cross Bay Boulevards, covering Woodhaven
main-road bus lanes, Cross Bay offset bus lanes, median SBS stations with real-time arrival
information, calmed service roads, left-turn bays, safer medians/crosswalks, and consistent
roadway design. The record treats the Spring 2015 newsletter as draft design evidence only: no
implementation date, no completion proof, no measured Q52/Q53 impact, and no block-level geometry
without visual review.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 40
valid reviewed records, 38 reviewed-record sources, 4 disposition receipts, 40 closed sources, 251
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bunx biome check apps/web/src/components/route/OverviewSection.tsx
apps/web/test/shared/route-map-highlight.test.ts`, `bun test
apps/web/test/shared/route-map-highlight.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Evidence tab carries hidden-section notices

Tightened the route-detail section registry handoff by rolling manifest-hidden section notices into
the visible Evidence tab badge. Existing Evidence detector badges are preserved and incremented, so
users get one compact notice count for both native Evidence signals and section context routed
there because a tab is hidden. The tab badge accessibility label now says `notice` instead of
`flag`, and the hidden-section table uses shorter tab labels to keep the Data Notes surface compact.

Also reviewed `nyc_dot_bus_priority_document_pdf_brt_woodhaven_crossbay_blvd_sept_flyer` from the
full-corpus source review workspace. The local ignored reviewed-record seed now has 37
reviewed-record sources and 39 valid records. This source contributes one conservative in-progress
Q52/Q53 SBS record for Woodhaven Boulevard from Union Turnpike to 81st Road, covering curbside
bus-only lanes, pedestrian refuge/median work, a left-turn restriction, U-turn bay access at 81st
Road, and the source-stated three general traffic lanes in each direction. The record omits an
effective date because the flyer says only `mid-September`, treats the source as construction and
design evidence rather than completion or measured impact proof, and requires visual review before
block-level geometry publication.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 39
valid reviewed records, 37 reviewed-record sources, 4 disposition receipts, 39 closed sources, 252
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bunx biome check apps/web/src/components/route/section-registry.ts
apps/web/src/components/route/RouteDetailShell.tsx
apps/web/src/components/route/DataNotesSection.tsx
apps/web/test/shared/section-registry.test.ts
apps/web/test/shared/route-detail-shell.test.ts knowledge/log.md`, `bun test
apps/web/test/shared/section-registry.test.ts apps/web/test/shared/route-detail-shell.test.ts
--timeout 5000`, `bun --filter @bp/web typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Treatment tab speed fallback uses dossier current

Kept the route-detail treatment/history tab on the dossier clock by making its no-history speed
badge prefer `dossier.speed.current` before falling back to the legacy route projection. This
matches the Overview verdict contract while leaving the historical chart path unchanged when
monthly dossier speed history is available. Trimmed the treatment tab's empty-state copy and removed
the dated-history header legend so the route-detail chunk stays under the existing web total-JS
budget; the production build now reports 484.969 KB gz total JS against the 485 KB cap.

Also reviewed `nyc_dot_bus_priority_document_pdf_bx6_spring_newsletter_2017` from the full-corpus
source review workspace. The local ignored reviewed-record seed now has 36 reviewed-record sources
and 38 valid records. This source contributes one conservative proposed BX6 SBS record for the
Spring 2017 161st/163rd Street/Hunts Point newsletter, covering the eastbound bus-only tunnel/bus
lane, off-board fare collection, all-door boarding, real-time passenger information, boarding
islands, pedestrian improvements, signal retiming, and related curb-management changes. The review
treats the newsletter as planned/in-progress design evidence rather than proof of final Summer 2017
implementation or measured Bx6 impact, and requires visual review before geometry publication.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 38
valid reviewed records, 36 reviewed-record sources, 4 disposition receipts, 38 closed sources, 253
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bunx biome check apps/web/src/components/route/TreatmentsHistorySection.tsx`, `bun
test apps/web/test/shared/treatments-history.test.ts
apps/web/test/shared/route-verdict-derived.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Overview verdict uses dossier clock

Closed the route-detail two-clocks issue called out in the design brief by making the Overview
summary, story badge, and footer speed badge read from the route dossier speed current/dataAsOf
when present. The route projection now appears only as the explicit fallback when a dossier current
speed is unavailable. The derived verdict helper returns the speed, peer rank, data clock, and lead
sentence together so the Overview prose and badges stay on the same measurement clock.

Trimmed nearby route-detail labels and folded the verdict helpers to keep the existing web total-JS
bundle budget intact. The production build now reports 484.952 KB gz of total JS against the 485 KB
cap without raising the budget.

Also reviewed `nyc_dot_bus_priority_document_pdf_brt_south_brooklyn_b82_cb11_apr2017` from the
full-corpus source review workspace. The local ignored reviewed-record seed now has 35
reviewed-record sources and 37 valid records. This source contributes one conservative proposed
B82 South Brooklyn SBS design record for bus lanes, off-board fare collection, all-door boarding,
transit signal priority, pedestrian improvements, rerouting, SBS station amenities, real-time
passenger information, a Cropsey/Bay 37 bus-pedestrian island, a proposed Avenue K stop, targeted
loading zones, and side-street metered parking. The review treats the April 2017 CB11 deck as
proposed design/next-steps evidence rather than proof of final 2018 implementation, keeps generic
SBS program results as context rather than B82-specific impact proof, and requires visual review
before geometry publication.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 37
valid reviewed records, 35 reviewed-record sources, 4 disposition receipts, 37 closed sources, 254
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bunx biome check
apps/web/src/components/route/route-derived.ts
apps/web/src/components/route/RouteJudgedKpiStrip.tsx
apps/web/src/components/route/OverviewSection.tsx
apps/web/test/shared/route-verdict-derived.test.ts`, `bun test
apps/web/test/shared/route-verdict-derived.test.ts
apps/web/test/shared/route-detail-shell.test.ts apps/web/test/shared/section-registry.test.ts
--timeout 5000`, `bun --filter @bp/web typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, and `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Honest-empty tabs show registry state

Advanced the route-detail §8.1 / §4.3 section-registry contract by carrying honest-empty state onto
the visible tab chrome. Tabs that still render an honest-empty section now show compact
`Checked`/`Building`/`Thin`/`Blocked` badges, while manifest-hidden sections remain absent from the
tab bar and continue routing their context through Evidence. The visible-rich, checked-clean, and
sparse route shapes now have shell-level coverage so the tab contract is tested where users see it.

Trimmed the honest-empty section body copy so the added tab badges stay under the existing web
total-JS bundle budget without raising the cap.

Also reviewed `nyc_dot_bus_priority_document_pdf_201110_brt_34th_cac5` from the full-corpus source
review workspace. The local ignored reviewed-record seed now has 34 reviewed-record sources and 36
valid records. This source contributes two conservative M34/M34A records: a planned November 13,
2011 SBS/fare-prepayment/camera-enforcement startup record, and a proposed 2012 34th Street
street-design record for bus lanes, bus bulbs, pedestrian space, signal timing, right-turn bays,
and loading-zone changes. The records keep the deck's M15 statistics as comparison context, treat
the 2012 design material as planned/proposed evidence rather than completion or impact proof, and
require visual review before block-level geometry publication.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 36
valid reviewed records, 34 reviewed-record sources, 4 disposition receipts, 36 closed sources, 255
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bun test apps/web/test/shared/section-registry.test.ts
apps/web/test/shared/route-detail-shell.test.ts --timeout 5000`, `bunx biome check
apps/web/src/components/route/RouteDetailShell.tsx
apps/web/src/components/route/section-registry.ts
apps/web/src/components/route/HonestEmptySection.tsx apps/web/test/shared/section-registry.test.ts
apps/web/test/shared/route-detail-shell.test.ts knowledge/log.md`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Evidence tab counts registry-routed signals

Advanced the route-detail §8.1 / §4.3 evidence handoff by making the Evidence tab header count
route insight signals and call out signals carried there because their natural section is hidden by
the manifest-driven section registry. The row-level behavior is unchanged: navigable signals still
link to their tabs, hidden-section signals remain covered in Evidence, and source gaps stay native
Evidence rows. Data Notes copy was trimmed slightly so the existing web total-JS bundle budget
continues to pass.

Also reviewed `nyc_dot_bus_priority_document_pdf_brt_south_brooklyn_b82_cb18_jun2017` from the
full-corpus source review workspace. The local ignored reviewed-record seed now has 33
reviewed-record sources and 34 valid records. This source contributes one conservative proposed B82
South Brooklyn SBS street-design record for bus lanes, rerouting, pedestrian/safety work,
intersection redesigns, and SBS stop amenities. The record keeps the source-stated 2018 launch as
planned evidence, treats 29% signal-delay and 21% bus-stop delay values as existing-condition
context rather than impact results, limits assigned route scope to B82, and requires visual review
before block-level bus-lane or alignment geometry publication.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 34
valid reviewed records, 33 reviewed-record sources, 4 disposition receipts, 35 closed sources, 256
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bun test apps/web/test/shared/route-evidence-index.test.ts
apps/web/test/shared/section-registry.test.ts --timeout 5000`, `bunx biome check
apps/web/src/components/route/DataNotesSection.tsx
apps/web/src/components/route/route-insight-card.ts
apps/web/test/shared/route-evidence-index.test.ts`, `bun --filter @bp/web typecheck`, `bun
--filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Reliability and rider tabs share signal ordering

Advanced the route-detail §5.2 signal handoff for the Reliability and Riders tabs. Their
section-level insight rows now use the shared severity/month/detector/scope ordering contract, so
the visible cards align with the tab badges, Overview verdict, and Evidence index. Reliability now
recognizes `bunching_hotspots` alongside the observed/headway reliability detectors; Riders now
recognizes `rider_weighted_excess_wait` alongside customer-journey shortfall. Route-detail copy was
trimmed slightly so the existing web total-JS bundle budget stays intact.

Also reviewed `nyc_dot_bus_priority_document_pdf_2011_brt_34th_cb6_slides` from the full-corpus
source review workspace. The local ignored reviewed-record seed now has 32 reviewed-record sources
and 33 valid records. This source contributes two conservative M34/M34A records: an implemented
November 13, 2011 fare-prepayment/SBS rename record, and a proposed 2012 34th Street street-design
record for bus lanes, bus bulbs, pedestrian space, signal timing, turn bays, and loading zones.
The review explicitly keeps M15 fare-prepayment percentages as comparison context, treats the 2012
street-design material as planned/modelled evidence rather than completion or impact proof, and
requires visual review before block-level geometry publication.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 33
valid reviewed records, 32 reviewed-record sources, 4 disposition receipts, 34 closed sources, 257
open sources, and 0 conflicts; public promotion remains blocked on full source closure.

Verified with `bun test apps/web/test/shared/reliability-summary.test.ts
apps/web/test/shared/rider-impact-summary.test.ts apps/web/test/shared/route-insight-placement.test.ts
--timeout 5000`, `bunx biome check apps/web/src/components/route/ReliabilitySection.tsx
apps/web/src/components/route/RidersSection.tsx apps/web/src/components/route/reliability-summary.ts
apps/web/src/components/route/rider-impact-summary.ts apps/web/test/shared/reliability-summary.test.ts
apps/web/test/shared/rider-impact-summary.test.ts`, `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/source-receipt-closure-audit-summary.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`,
`bun --filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`,
`bun run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Map tab follows detector-targeted segments

Advanced the route-detail §5.2 / §6.1 map handoff by making the Map tab reuse the shared
map-segment insight placement contract. Detector-targeted map signals now choose the highlighted
corridor segment before the generic flagged fallback, while the section header counts map signals
with the same badge posture used elsewhere in the route dossier. The implementation keeps the map
surface small and trimmed copy so `bun --filter @bp/web build` remains under the existing total-JS
bundle budget.

Also reviewed `nyc_dot_select_bus_service_pdf_201201_brt_34th_project_analysis_report` from the
full-corpus source review workspace as a proposed M34/M34A 34th Street SBS build-package record.
The local ignored reviewed-record seed now has 31 sources and 31 records. The record cites the
January 2012 project-analysis report cover, M34/M34A route/service context, project goals,
executive-summary project elements, cross-section, neighborhood-character project description,
construction/noise page, and LOS/signal-timing appendix. It assigns canonical `bus_lane`,
`bus_bulb`, `off_board_fare_collection`, `pedestrian_improvement`, `signal_retiming`, and
`transit_signal_priority` treatments, with custom details for offset bus lanes, SBS station
amenities, turn bays, curbside loading zones, and signage.

The source review stays conservative: it treats the report as proposed/project-analysis evidence,
not completion or impact proof; preserves Fall 2011 off-board fare collection and the M16-to-M34A
rename as context; limits assigned routes to M34/M34A; and caveats the 2008 bus-lane speed figures
as baseline context rather than results of the 2012 build package. Regenerated the local ignored
source receipt closure audit. It now reports 291 queue sources, 31 valid reviewed records, 31
reviewed-record sources, 4 disposition receipts, 33 closed sources, 258 open sources, and 0
conflicts; public promotion remains blocked on full source closure.

Verified with `bunx biome check apps/web/src/components/route/RouteMapSection.tsx
apps/web/test/shared/route-map-highlight.test.ts`, `bun test
apps/web/test/shared/route-map-highlight.test.ts
apps/web/test/shared/route-insight-placement.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bun run check:types`, `bun
run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Treatments tab shows timeline signals

Advanced the route-detail §4.3 / §5.2 treatment handoff by letting the Treatments & history
section count timeline-placement route insights in its header. The new helper reuses the shared
`routeInsightPlacements` ordering, so treatment and timeline detector signals follow the same
severity/month/scope sort used by the rest of the route dossier. To keep the existing web bundle
budget intact, the section exposes a compact signal badge and leaves full insight text in the
Overview/Evidence surfaces.

Also reviewed `nyc_dot_bus_priority_document_pdf_brt_woodhaven_after_fall2018` from the
full-corpus source review workspace as an implemented Q52/Q53 Woodhaven / Cross Bay Boulevard SBS
launch-and-results record. The local ignored reviewed-record seed now has 30 sources and 30
records. The record cites the Fall 2018 progress report cover, executive summary, route page,
implementation timeline, ridership, service metrics, customer satisfaction, safety results, and
final results pages. It assigns canonical `bus_lane`, `off_board_fare_collection`,
`pedestrian_improvement`, and `signal_retiming` treatments, with custom details for median SBS
stations, branded SBS service, Q52 Beach 54 St extension, Rockaways/Broad Channel stop
consolidation, new SBS stops, widened medians/refuges, turn restrictions, and traffic calming.

The record keeps the source conservative: it uses `complete` status as of the Fall 2018 report,
assigns route scope only to Q52/Q53, treats citywide SBS routes on the context map as non-assigned,
records source-stated ridership/travel-time/reliability/survey/safety results as descriptive
before/after evidence rather than causal proof, and does not infer a new TSP treatment from this
source alone. Regenerated the local ignored source receipt closure audit. It now reports 291 queue
sources, 30 valid reviewed records, 30 reviewed-record sources, 4 disposition receipts, 32 closed
sources, 259 open sources, and 0 conflicts; public promotion remains blocked on full source
closure.

Verified with `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`,
`bun --filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`, `bunx biome check
apps/web/src/components/route/TreatmentsHistorySection.tsx
apps/web/test/shared/treatments-history.test.ts`, `bun test
apps/web/test/shared/treatments-history.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `bun run check:types`, `bun run check:knowledge`, and
`git diff --check`.

## [2026-06-12] engineering | Where-and-when floats detector-targeted segments

Advanced the route-detail §5.2 detector-shaped ordering contract by making the Where & when
section prioritize detector-targeted map/segment insights ahead of the generic slowest-segment
fallback rows. The section still shows the fallback top rows, but the merged visible set is now
de-duplicated with insight-targeted segments first, so promoted segment evidence can reach the
featured cards instead of being appended after the generic top five.

Also closed `nyc_dot_bus_priority_document_pdf_lower_montauk_final_report_jan2018` from the
full-corpus source review workspace with a `no_actionable_bus_priority_intervention` disposition.
Direct review of the Lower Montauk Branch Rail Study pages found a passenger-rail reactivation
feasibility study, not a bus-priority intervention source. The source mentions bus routes such as
Q11/Q21/Q23/Q52/Q53/BM5/QM12/QM15/QM42 only as station-access or transit-connectivity context for
potential rail stations, while the recommendations concern rail mode, station siting,
ADA/platform requirements, freight accommodation, capital costs, funding, and permitting.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 29
valid reviewed records, 4 disposition receipts, 31 closed sources, 260 open sources, and 0
conflicts; public promotion remains blocked on full source closure. The broader Tier 2
structured-data inventory still reports the older published-inventory next action because it scans
published artifacts rather than this ignored manual-review seed.

Verified with `bunx biome check apps/web/src/components/route/SlowSegments.tsx
apps/web/test/shared/where-when-segment-order.test.ts`, `bun test
apps/web/test/shared/where-when-segment-order.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `bun run check:types`, `bun run check:knowledge`, `git
diff --check`, `jq empty
data/artifacts/docs/agentic-runs-20260604/source-disposition-receipts-full-authority-qv1-qv10-v1/source-disposition-receipts.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, and `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Overview verdict uses top route signals

Advanced the route-detail §4.2 / §5 verdict handoff by making the Overview "What stands out"
cards select the top three public route insights across all placements, instead of only insights
pre-labeled for the old Overview slot. Map, chart, and timeline placements still feed their
section-specific affordances, but the first-screen verdict now leads with the strongest
route-specific detector signals by the existing severity/month/detector/scope ordering.

Also reviewed `nyc_dot_bus_priority_document_pdf_webster_ave_e174_st_e176_st_may2019` from the
full-corpus source review workspace as a proposed Bx41 Webster Avenue E 176 St-E 174 St gap-fill
package. The local ignored reviewed-record seed now has 29 sources and 29 records. The record cites
the May 7, 2019 CB5 Municipal Services Committee Bus Forward deck, the Better Buses project
selection rationale, 2013-2017 injury table, Bx41 SBS southbound speed table, traffic-share
methodology, proposal diagrams, bus-lane gap pages, traffic-flow signage page, and summary page.
It assigns canonical `bus_lane` and `pedestrian_improvement` treatments, with custom treatment
details for Qwik Kurb right-turn channelization, turn controls, painted curb extensions, Park
Avenue Cross Bronx access signage, and the proposed signal-timing investigation.

The record keeps the source conservative: it uses `proposed` status as of `2019-05-07`, assigns
scope only to Bx41/Bx41 SBS, treats the June 2013 Bx41 SBS launch as background rather than the
2019 package effective date, and caveats the speed/injury/traffic-share tables as proposal context
rather than post-implementation impact. Regenerated the local ignored source receipt closure audit.
It now reports 291 queue sources, 29 valid reviewed records, 29 reviewed-record sources, 30 closed
sources, 261 open sources, and 0 conflicts; public promotion remains blocked on full source
closure. The broader Tier 2 structured-data inventory still reports the older published-inventory
next action because it scans published artifacts rather than this ignored manual-review seed.

Verified with `bunx biome check
apps/web/src/components/route/OverviewSection.tsx
apps/web/src/components/route/route-insight-placement.ts
apps/web/test/shared/route-insight-placement.test.ts
apps/web/test/shared/route-insight-card.test.ts
apps/web/test/shared/route-evidence-index.test.ts`, `bun test
apps/web/test/shared/route-insight-placement.test.ts
apps/web/test/shared/route-insight-card.test.ts
apps/web/test/shared/route-evidence-index.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `bun run check:types`, `bun run check:knowledge`,
`git diff --check`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, and
`bun --filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Route detail shell render tests cover contrast dossiers

Advanced the route-detail §8.1 registry handoff by adding server-render coverage for the actual
`RouteDetailShell` tab chrome, not just the pure registry selector. The new shared test renders the
rich, checked-clean, and sparse contrast route manifests through the shell and asserts that the tab
strip visibly diverges: flagship routes show Reliability and Treatments & history, clean routes
hide not-applicable treatments, and sparse routes withhold insufficient-data Reliability while
keeping Treatments & history as an honest-empty section. It also locks visible-tab detector badges
and the question-shaped tab titles used by the §4.3 dossier contract.

Also reviewed `nyc_dot_bus_priority_document_pdf_webster_cross_bronx_cb5_may2019` from the
full-corpus source review workspace as a proposed Bx41 Webster Avenue / Cross Bronx Expressway
gap-fill package. The local ignored reviewed-record seed now has 28 sources and 28 records. The
record cites the May 22, 2019 CB5 Better Buses deck, the Webster Avenue E 176 St-E 174 St priority
project rationale, 2013-2017 safety table, Bx41 SBS southbound speed table, traffic-share
methodology, proposal diagrams, and summary pages. It assigns canonical `bus_lane` and
`pedestrian_improvement` treatments, with custom treatment details for Qwik Kurb right-turn
channelization, turn controls, painted curb extensions, Park Avenue Cross Bronx access signage, and
the proposed signal-timing investigation.

The record keeps the source conservative: it uses `proposed` status as of `2019-05-22`, assigns
scope only to Bx41/Bx41 SBS, treats the June 2013 Bx41 SBS launch as background rather than the
2019 package effective date, and caveats the speed/injury tables as proposal context rather than
post-implementation impact. Regenerated the local ignored source receipt closure audit. It now
reports 291 queue sources, 28 valid reviewed records, 28 reviewed-record sources, 29 closed
sources, 262 open sources, and 0 conflicts; public promotion remains blocked on full source
closure. The broader Tier 2 structured-data inventory still reports the older published-inventory
next action because it scans published artifacts rather than this ignored manual-review seed.

Verified with `bunx biome check apps/web/test/shared/route-detail-shell.test.ts
apps/web/test/shared/section-registry.test.ts`, `bun test
apps/web/test/shared/route-detail-shell.test.ts apps/web/test/shared/section-registry.test.ts
--timeout 5000`, `bun --filter @bp/web typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit --queue-path ...`, and `bun
--filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Route evidence removes fake dataset cite counts

Continued the route evidence dossier follow-up after PR #10 merged by aligning the Evidence tab's
dataset list with the documented source-ref contract. `DataNotesSection` no longer renders
hardcoded `cited Nx` counts for source-family rows; the dataset table now omits that unsupported
count column instead of implying a per-dataset citation graph. Added
`coverageLatestSurfaceDataAsOf()` so route-detail headers can fall back to named manifest surface
freshness when a route has capability coverage but no full dossier object. Treatments & history now
uses the treatment surface clock as its final fallback.

Also reviewed `nyc_dot_bus_priority_document_pdf_2014_03_20_brt_webste_cb5` from the
full-corpus source review workspace as an implemented Bx41 Webster Avenue SBS launch/results
record. The source documents the June 30, 2013 Bx41 SBS launch replacing Bx41 Limited, 4 miles / 8
lane-miles of Webster Avenue bus lanes, off-board fare collection equipment, pedestrian/turn-control
roadway changes, planned Summer 2014 TSP, Phase 2 station/capital work, and preliminary
source-stated before/after Bx41 travel-time results from November 2012 to November 2013. The local
ignored reviewed-record seed now has 27 sources and 27 records.

The new record caveats that the results are preliminary agency before/after measurements, not causal
proof; page 18 ridership values are chart-estimated; TSP and Phase 2 capital/station work are future
or estimated milestones in this March 2014 source; station geometry is map/OCR-derived; and Bx12,
Bx36, and Bx40/42 are context routes rather than assigned intervention routes. Regenerated the
local ignored source receipt closure audit. It now reports 291 queue sources, 27 valid reviewed
records, 27 reviewed-record sources, 28 closed sources, 263 open sources, and 0 conflicts; public
promotion remains blocked on full source closure. The broader Tier 2 structured-data inventory still
reports the older published-inventory next action because it scans published artifacts rather than
this ignored manual-review seed.

Verified with `bunx biome check
apps/web/src/components/route/DataNotesSection.tsx
apps/web/src/components/route/TreatmentsHistorySection.tsx
apps/web/src/components/route/RouteJudgedKpiStrip.tsx
apps/web/src/components/route/coverage-matrix.ts apps/web/test/shared/coverage-matrix.test.ts`,
`bun test apps/web/test/shared/coverage-matrix.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `bun run check:types`, `bun run check:knowledge`, `git
diff --check`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Surface manifest freshness in route evidence

Advanced the route-detail §7.4 freshness doctrine by adding a shared coverage helper for the
latest `dataAsOf` across manifest surfaces. Overview and Evidence/Data notes now fall back to that
manifest freshness when a route has capability coverage but no full dossier summary, so
manifest-light routes no longer show unknown freshness in the first-screen verdict or evidence
header. The coverage helper is covered in the shared matrix tests.

Also reviewed `nyc_dot_bus_priority_document_pdf_2012_05_webster_cac2_summary` from the
full-corpus source review workspace as a proposed/planning Bx41 Webster Avenue SBS CAC #2 summary
record. The local ignored reviewed-record seed now has 26 sources and 26 records. The record cites
the May 2, 2012 meeting summary, CAC discussion of Webster Avenue safety/congestion/parking
issues, future-development context, curbside/offset/median SBS running-way alternatives, workshop
tradeoffs, and the rider-preference exercise where the medium 5-minute walk / 5-minute wait /
20-minute bus-trip scenario received 8 votes on Sheet A.

The record stores no launch date because this source is a meeting-summary planning artifact, not a
selected design or implementation result. It uses a `planning` status as of `2012-05-02`, assigns
scope only to Bx41, treats Bx12 as prior SBS context, and caveats the conceptual bus-lane
alternatives and workshop preference votes as planning inputs rather than measured route impacts.
Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 26
valid reviewed records, 26 reviewed-record sources, 27 closed sources, 264 open sources, and 0
conflicts; public promotion remains blocked on full source closure. The broader Tier 2
structured-data inventory still reports the older published-inventory next action because it scans
published artifacts rather than this ignored manual-review seed.

Verified with `bunx biome check
apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/DataNotesSection.tsx
apps/web/src/components/route/coverage-matrix.ts apps/web/test/shared/coverage-matrix.test.ts`,
`bun test apps/web/test/shared/coverage-matrix.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `bun run check:types`, `bun run check:knowledge`, `git
diff --check`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Overview shows manifest coverage

Advanced the route-detail §4 / §8.1 registry handoff by making the Overview header summarize the
route capability manifest instead of using static readiness copy. The summary now counts ready,
checked-clean, partial, building, insufficient-data, blocked, and not-applicable surfaces, so a
route with non-ready manifest states no longer looks empty from the first screen. Overview checked
clean handling now uses the same ordered coverage rows as the Evidence matrix, and treatment
insight CTAs now point at `Treatments & history` to match the redesigned tab label. Nearby route
overview copy was tightened to keep the production bundle inside the existing budget.

Also reviewed `nyc_dot_bus_priority_document_pdf_201205_brt_webster_cac` from the full-corpus
source review workspace as a proposed/planning Bx41 Webster Avenue SBS design-ideas record. The
local ignored reviewed-record seed now has 25 sources and 25 records. The record cites the May 2,
2012 CAC #2 deck, the Bx41-based proposed Webster Avenue corridor, 5.3 miles of corridor length,
125,000 nearby residents, 74% car-free households, 63% transit commute share, 22,000 daily Bx41
riders, Bx41 LTD travel-time variability of 37-57 minutes, stopped-time and delay breakdown
signals, Fordham Road pedestrian/boarding pressure, parking observations, the Spring 2012 active
design-ideas phase, the May 16, 2012 open house, Summer 2012 analysis, and Fall 2012 draft
corridor-plan target.

The record stores no launch date because this source does not give a preferred design,
implementation date, or post-implementation result. It uses `planning` statuses as of
`2012-05-02` and `2012-05-16`, assigns scope only to Bx41, treats Bx12 and M15 references as prior
SBS examples or feature context, and caveats the OCR-derived corridor map summary for visual
review before publication. Regenerated the local ignored source receipt closure audit. It now
reports 291 queue sources, 25 valid reviewed records, 25 reviewed-record sources, 26 closed
sources, 265 open sources, and 0 conflicts; public promotion remains blocked on full source
closure. The broader Tier 2 structured-data inventory still reports the older published-inventory
next action because it scans published artifacts rather than this ignored manual-review seed.

Verified with `bunx biome check
apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/coverage-matrix.ts
apps/web/src/components/route/route-insight-card.ts apps/web/test/shared/coverage-matrix.test.ts
apps/web/test/shared/route-insight-card.test.ts`, `bun test
apps/web/test/shared/coverage-matrix.test.ts apps/web/test/shared/route-insight-card.test.ts
--timeout 5000`, `bun --filter @bp/web typecheck`, `bun --filter @bp/web build`, `bun run
check:types`, `bun run check:knowledge`, `git diff --check`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Route tabs expose section questions

Advanced the route-detail §4.3 / §8.1 registry handoff by carrying each tab's
question-shaped contract into the shared tab shell. Compact tab labels remain unchanged, but
route-detail tabs now expose their registry question through the native tab title, and the tab
badge screen-reader label was tightened from "flagged insights" to "flags" to keep the existing
bundle budget green.

Also reviewed `nyc_dot_bus_priority_document_pdf_2012_02_06_brt_webster_cac1` from the
full-corpus source review workspace as an initial proposed/planning Bx41 Webster Avenue SBS
record. The local ignored reviewed-record seed now has 24 sources and 24 records. The record cites
the February 6, 2012 CAC #1 deck, the proposed Webster Avenue SBS corridor based on Bx41, 5.3
miles of corridor length, 125,000 nearby residents, 74% car-free households, 61% transit commute
share, 22,000 daily Bx41 riders, pre-design one-way travel time of 37-57 minutes, bus-delay hot
spots, and winter/spring 2012 planning next steps.

The record stores no launch date because this source does not give a preferred design,
implementation date, or post-implementation result. It uses a `planning` status as of
`2012-02-06`, assigns scope only to Bx41, treats Bx12/M15/M34/M34A/B44/S79 as context or prior SBS
examples, and caveats map-derived endpoints/delay locations for visual review. Regenerated the
local ignored source receipt closure audit. It now reports 291 queue sources, 24 valid reviewed
records, 24 reviewed-record sources, 25 closed sources, 266 open sources, and 0 conflicts; public
promotion remains blocked on full source closure. The broader Tier 2 structured-data inventory
still reports the older published-inventory next action because it scans published artifacts rather
than this ignored manual-review seed.

Verified with `bunx biome check
apps/web/src/components/route/RouteDetailShell.tsx apps/web/src/components/route/section-registry.ts
apps/web/test/shared/section-registry.test.ts`, `bun test
apps/web/test/shared/section-registry.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build`, `bun run check:types`, `bun run check:knowledge`, `git diff
--check`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Map section shows manifest freshness

Advanced the route-detail §4 / §7.4 map-surface cutover by adding the shared `DataAsOf` marker to
the Map section header. The section now reads its freshness clock from the route capability
manifest's `map`, `geometry`, or `routeGeometry` surfaces, with a dossier-level fallback when the
manifest lacks a map-specific clock. Nearby map microcopy was tightened so the route-detail lazy
chunk stays within the existing bundle budget.

Also reviewed `nyc_dot_bus_priority_document_pdf_2014_08_25_brt_websteravenue_progressreport`
from the full-corpus source review workspace as an implemented Bx41 Webster Avenue SBS progress
record. The local ignored reviewed-record seed now has 23 sources and 23 records. The record cites
the August 2014 progress report, the June 30, 2013 Bx41 SBS launch, 8 miles of Webster Avenue bus
lanes from E 165 Street to E Gun Hill Road, off-board fare collection, fare inspection, branding
and customer information, pedestrian refuges/medians, signal timing changes, and source-reported
travel-time/delay/ridership results.

The record stores `effectiveDate: 2013-06-30` with `datePrecision: day`. It separately caveats
that TSP and enhanced bus-bulb capital construction were future or in-design items in the August
2014 source, and that the speed, delay, satisfaction, and ridership metrics are source-reported
before/after results rather than a controlled causal estimate. Regenerated the local ignored source
receipt closure audit. It now reports 291 queue sources, 23 valid reviewed records, 23
reviewed-record sources, 24 closed sources, 267 open sources, and 0 conflicts; public promotion
remains blocked on full source closure. The broader Tier 2 structured-data inventory still reports
the older published-inventory next action because it scans published artifacts rather than this
ignored manual-review seed.

Verified with `bunx biome check apps/web/src/components/route/RouteMapSection.tsx`, `bun
--filter @bp/web typecheck`, `bun --filter @bp/web build`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Treatments section shows dossier freshness

Advanced the route-detail §4.1 / §7.4 freshness cutover by adding the shared `DataAsOf` marker to
the Treatments & history header. The section now reads from `dossier.treatmentPosture.dataAsOf`
with a page-level dossier fallback, keeps the evaluated-comparison count badge, and trims nearby
copy so the route-detail lazy chunk stays within the existing bundle budget.

Also reviewed `nyc_dot_select_bus_service_pdf_2012_09_webster_sbs_cac3` from the full-corpus
source review workspace as a proposed Bx41 Webster Avenue SBS planning record. The local ignored
reviewed-record seed now has 22 sources and 22 records. The record cites the September 27, 2012
CAC #3 deck, Bx41 LTD to Bx41 SBS conversion, 4 miles of offset bus lanes, bus bulb/station
planning, off-board fare collection, TSP, pedestrian safety improvements, half-mile SBS stop
spacing, and the 2013-2014 final-design/implementation horizon.

The record stores `effectiveDate: 2013` with `datePrecision: year` because this source gives an
implementation horizon rather than an exact launch month/day. It separately caveats that the deck
is a planning source without measured post-implementation impact, and treats non-Bx41 route
mentions in the review pack as context rather than assigned intervention scope. Regenerated the
local ignored source receipt closure audit. It now reports 291 queue sources, 22 valid reviewed
records, 22 reviewed-record sources, 23 closed sources, 268 open sources, and 0 conflicts; public
promotion remains blocked on full source closure. The broader Tier 2 structured-data inventory
still reports the older published-inventory next action because it scans published artifacts rather
than this ignored manual-review seed.

Verified with `bunx biome check
apps/web/src/components/route/TreatmentsHistorySection.tsx apps/web/test/shared/treatments-history.test.ts`,
`bun test apps/web/test/shared/treatments-history.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `bun run check:types`, `bun run check:knowledge`, `git
diff --check`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Judged KPI clicks fall back to Evidence

Advanced the route-detail §4.1 / §8.1 handoff by routing judged KPI header clicks through the
section registry's canonical navigation fallback. If a KPI's owning section is manifest-hidden,
the header now sends the reader to Evidence instead of becoming a dead click target; visible and
honest-empty sections still open their owning tabs. The existing registry test covers the hidden
section fallback to Evidence for sparse and not-applicable route shapes.

Also reviewed `nyc_dot_select_bus_service_pdf_2013_02_sbs_webster_bx_cb1` from the full-corpus
source review workspace as a proposed Bx41 Webster Avenue SBS plan record. The local ignored
reviewed-record seed now has 21 sources and 21 records. The record cites the February 11, 2013 CB1
deck, Bx41 LTD to Bx41 SBS conversion, 4 miles of offset bus lanes, off-board fare collection,
TSP/traffic signal coordination, pedestrian improvements, station/bus-bulb planning, Hub stop
changes, half-mile SBS stop spacing, and the end-of-June 2013 service-start plan.

The record stores `effectiveDate: 2013-06` with `datePrecision: month` because this source gives a
June/end-of-month launch plan rather than the exact launch day. It separately caveats the 2014-2015
bus-bulb/capital construction phase, treats Bx12/M15/M34/S79/B44/M60/Bx15/Bx55/LGA references as
context or related service-plan mentions rather than assigned intervention routes, and flags
map-derived station geometry for visual review. Regenerated the local ignored source receipt
closure audit. It now reports 291 queue sources, 21 valid reviewed records, 21 reviewed-record
sources, 22 closed sources, 269 open sources, and 0 conflicts; public promotion remains blocked on
full source closure. The broader Tier 2 structured-data inventory still reports the older
published-inventory next action because it scans published artifacts rather than this ignored
manual-review seed.

Verified with `bunx biome check
apps/web/src/components/route/section-registry.ts apps/web/src/components/route/RouteJudgedKpiStrip.tsx
apps/web/test/shared/section-registry.test.ts`, `bun test
apps/web/test/shared/section-registry.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build`, `bun run check:types`, `bun run check:knowledge`, `git diff
--check`, `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Hidden route sections preserve badge evidence

Advanced the route-detail §8.1 registry handoff by keeping detector badge metadata on hidden
sections. If an insight targets a manifest-hidden tab, the tab still stays hidden, but Evidence's
"Sections not shown" row now preserves the badge count/severity so the detector signal is not lost.
The contrast-route registry test now asserts that sparse-route reliability can stay out of the tab
strip while carrying its hidden high-severity badge into Evidence.

Also reviewed `nyc_dot_bus_priority_document_pdf_2014_04_10_brt_webster_cb7` from the full-corpus
source review workspace as an implemented Bx41 Webster Avenue SBS progress record. The local
ignored reviewed-record seed now has 20 sources and 20 records. The record cites the April 10, 2014
CB7 deck, the June 30, 2013 Bx41 SBS launch, Webster Avenue bus lanes from E 165 St to E Gun Hill
Road, 4 miles / 8 lane-miles, NYPD lane enforcement, signal timing at E Fordham Rd, CB7 pedestrian
islands/medians, and preliminary official travel-time/ridership tables.

The record stores `effectiveDate: 2013-06-30` with `datePrecision: day`; TSP and Phase 2
bus-bulb/capital construction remain caveated as future or estimated timeline items in this source,
and Bx12/M15/B44 are treated as context or examples rather than assigned routes. Regenerated the
local ignored source receipt closure audit. It now reports 291 queue sources, 20 valid reviewed
records, 20 reviewed-record sources, 21 closed sources, 270 open sources, and 0 conflicts; public
promotion remains blocked on full source closure. The broader Tier 2 structured-data inventory
command still reports the older published-inventory next action because it scans published
artifacts rather than this ignored manual-review seed.

Verified with `bunx biome check
apps/web/src/components/route/section-registry.ts apps/web/src/components/route/DataNotesSection.tsx
apps/web/test/shared/section-registry.test.ts`, `bun test
apps/web/test/shared/section-registry.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build`, `bun run check:types`, `bun run check:knowledge`, `git diff --check`,
`jq empty data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Route section CTAs respect hidden manifest tabs

Advanced the route-detail §8.1 registry handoff by centralizing section navigation fallback in the
registry. Header KPI clicks already ignored hidden tabs; now Overview insight CTAs and Evidence
index rows use the same policy. Visible and honest-empty sections remain navigable, while hidden
section targets either fall back to Evidence from Overview or stay labeled as covered in Evidence
inside the Evidence tab. The route-detail page passes the canonical registry into Overview and
Evidence instead of letting those sections recompute their own tab policy.

Also reviewed `nyc_dot_bus_priority_document_pdf_2014_03_06_brt_webster_cb6` from the full-corpus
source review workspace as an implemented Bx41 Webster Avenue SBS progress record. The local
ignored reviewed-record seed now has 19 sources and 19 records. The record cites the March 6, 2014
CB6 deck, the June 30, 2013 Bx41 SBS launch, Webster Avenue bus lanes from E 165 St to E Gun Hill
Road, 4 miles / 8 lane-miles, NYPD lane enforcement, signal timing at E Fordham Rd, pedestrian
islands/medians, and preliminary official travel-time/ridership tables.

The record stores `effectiveDate: 2013-06-30` with `datePrecision: day`; TSP and Phase 2
bus-bulb/capital construction remain caveated as future or estimated timeline items in this source,
and Bx12/M15/B44 are treated as context or examples rather than assigned routes. Regenerated the
local ignored source receipt closure audit. It now reports 291 queue sources, 19 valid reviewed
records, 19 reviewed-record sources, 20 closed sources, 271 open sources, and 0 conflicts; public
promotion remains blocked on full source closure. The broader Tier 2 structured-data inventory
command still reports the older published-inventory next action because it scans published
artifacts rather than this ignored manual-review seed.

Verified with `bunx biome check
apps/web/src/components/route/section-registry.ts apps/web/src/components/route/OverviewSection.tsx
apps/web/src/components/route/DataNotesSection.tsx apps/web/src/studio/pages/route-detail.tsx
apps/web/test/shared/section-registry.test.ts`, `bun test
apps/web/test/shared/section-registry.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build`, `bun run check:types`, `bun run check:knowledge`, `git diff --check`,
`jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Tier 2 Bx41 Webster CB4 plan source closes one more source

Reviewed `nyc_dot_select_bus_service_pdf_2013_02_sbs_webster_bx_cb4` from the full-corpus source
review workspace as a proposed Bx41 Webster Avenue SBS plan record. The local ignored
reviewed-record seed now has 18 sources and 18 records. The record cites the February 6, 2013 CB4
deck, Bx41 LTD to Bx41 SBS conversion, 4 miles of offset bus lanes, off-board fare collection, TSP,
bus-bulb station plans, pedestrian safety improvements, red bus-lane paint, fare-machine and stop
changes, and the Webster Avenue corridor termini.

The record stores `effectiveDate: 2013-06` with `datePrecision: month` because this source gives a
summer/end-of-June 2013 service-start window rather than an exact launch day. It also caveats the
2014-2015 bus-bulb/capital phase separately from the June 2013 service and roadway launch. Bx12,
M15, M34/M34A, S79, B44, M60, Bx15, and Bx35 remain context, service-plan, or station-impact
mentions rather than assigned intervention routes. Regenerated the local ignored source receipt
closure audit. It now reports 291 queue sources, 18 valid reviewed records, 18 reviewed-record
sources, 19 closed sources, 272 open sources, and 0 conflicts; public promotion remains blocked on
full source closure. The broader Tier 2 structured-data inventory command still reports the older
published-inventory next action because it scans published artifacts rather than this ignored
manual-review seed.

Verified with `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Tier 2 Bx41 Webster CAC4 plan source closes one more source

Reviewed `nyc_dot_select_bus_service_pdf_2012_11_sbs_webster_cac4` from the full-corpus source
review workspace as a proposed Bx41 Webster Avenue SBS plan record. The local ignored
reviewed-record seed now has 17 sources and 17 records. The record cites the November 29, 2012 CAC
#4 deck, Bx41 LTD to Bx41 SBS conversion, 4 miles of offset bus lanes with bus bulb stations,
off-board fare collection, TSP, pedestrian safety improvements, half-mile SBS stop spacing, the
Webster Avenue corridor termini, and the 2013/2014 implementation horizon.

The record stores `effectiveDate: 2013` with `datePrecision: year` because this source gives a
2013/2014 planning horizon rather than the later exact launch date. Bx15/Bx55/Bx34/Bx12/M60 and the
LaGuardia SBS references remain caveated as context, and station-location/northern-routing options
are not treated as final geometry from this deck alone. Regenerated the local ignored source receipt
closure audit. It now reports 291 queue sources, 17 valid reviewed records, 17 reviewed-record
sources, 18 closed sources, 273 open sources, and 0 conflicts; public promotion remains blocked on
full source closure. The broader Tier 2 structured-data inventory command still reports the older
published-inventory next action because it scans published artifacts rather than this ignored
manual-review seed.

Verified with `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and `bun --filter
@bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Evidence names hidden sections with route-detail questions

Advanced the route-detail §4.3 / §8.1 handoff by letting the section registry carry question-shaped
copy for the hidden Evidence rows that need it now. "Sections not shown" now renders withheld
Reliability and Treatments entries as section label plus dossier question, so Evidence can explain
what claim is absent instead of only naming the UI tab. The registry test now locks those hidden
questions to the checked-clean and sparse contrast routes.

To keep the strict route-detail bundle guard green, compare continues to use label-only local tabs
and the Evidence data-source labels were tightened without changing the source coverage model.

Verified with `bunx biome check apps/web/src/components/route/section-registry.ts
apps/web/src/components/route/DataNotesSection.tsx apps/web/src/studio/pages/compare.tsx
apps/web/test/shared/section-registry.test.ts`, `bun test
apps/web/test/shared/section-registry.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
and `bun --filter @bp/web build`.

## [2026-06-12] engineering | Tier 2 Bx41 Webster CB4 progress source closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_2014_03_05_brt_webster_cb4` from the full-corpus source
review workspace as an implemented Bx41 Webster Avenue SBS record with preliminary post-launch
results. The local ignored reviewed-record seed now has 16 sources and 16 records. The record cites
the March 5, 2014 CB4 presentation, the June 30, 2013 Bx41 SBS launch, Webster Avenue bus lanes
from E 165 Street to E Gun Hill Road, NYPD lane enforcement, optimized signal timing, pedestrian
safety changes, repaving, and preliminary travel-time/ridership tables.

The record stores `effectiveDate: 2013-06-30` with `datePrecision: day`; TSP and Phase 2 bus-bulb
work remain caveated as future/estimated in this source, and Bx12/Bx35 are treated as context rather
than assigned routes. Regenerated the local ignored source receipt closure audit. It now reports 291
queue sources, 16 valid reviewed records, 16 reviewed-record sources, 17 closed sources, 274 open
sources, and 0 conflicts; public promotion remains blocked on full source closure. The broader Tier
2 structured-data inventory command still reports the older published-inventory next action because
it scans published artifacts rather than this ignored manual-review seed.

Verified with `jq empty
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`,
`bun run pipeline docs tier2 source-receipt-audit ...`, and `bun run pipeline audit
tier2-structured-data --json`.

## [2026-06-12] engineering | Route detail tabs use one manifest registry

Advanced frontend §8.1 by moving the route-detail tab metadata and manifest presentation policy
into the pure section registry. The route detail page now asks `routeSectionRegistry()` for the
per-tab presentations, visible tabs, and hidden sections in one pass; the Evidence tab consumes
the same hidden-section list for "Sections not shown" instead of recomputing it locally. The
contrast-route tests now assert the visible tab sets for rich, checked-clean, and sparse route
shapes, plus hidden-section reasons and detector badge attachment.

To keep the strict route-detail bundle budget green, compare keeps its tiny static tab subset
locally and imports only erased registry types, and decorative arrow icons were removed from
route-detail/Evidence actions whose text labels are already explicit.

Verified with `bunx biome check apps/web/src/components/route/section-registry.ts
apps/web/src/components/route/RouteDetailShell.tsx apps/web/src/components/route/DataNotesSection.tsx
apps/web/src/components/route/OverviewSection.tsx
apps/web/src/components/route/route-insight-card.ts
apps/web/src/components/route/route-insight-placement.ts apps/web/src/studio/pages/route-detail.tsx
apps/web/src/studio/pages/compare.tsx apps/web/test/shared/section-registry.test.ts`, `bun test
apps/web/test/shared/section-registry.test.ts apps/web/test/shared/route-insight-card.test.ts
apps/web/test/shared/route-insight-placement.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, and `bun --filter @bp/web build`.

## [2026-06-12] engineering | Tier 2 Bx41 Webster 2014 progress source closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_2014_03_11_brt_webster_cb3` from the full-corpus source
review workspace as an implemented Bx41 Webster Avenue SBS record with preliminary post-launch
results. The local ignored reviewed-record seed now has 15 sources and 15 records. The record cites
the March 11, 2014 CB3 deck, the June 30, 2013 Bx41 SBS launch, 4 miles / 8 lane-miles of Webster
Avenue bus lanes, NYPD lane enforcement, optimized signal timing, pedestrian safety islands, Phase 2
bus-bulb design pages, and preliminary official travel-time/ridership tables.

The record stores `effectiveDate: 2013-06-30` with `datePrecision: day` and keeps TSP plus Phase 2
capital work caveated as future/estimated in this source. Regenerated the local ignored source
receipt closure audit. It now reports 291 queue sources, 15 valid reviewed records, 3 disposition
receipts, 16 closed sources, 275 open sources, and 0 conflicts; public promotion remains blocked on
full source closure. The broader Tier 2 structured-data inventory command still reports the older
published-inventory next action because it scans published artifacts rather than this ignored
manual-review seed.

Verified with `jq empty` on the reviewed-record artifact, `bun run pipeline docs tier2
source-receipt-audit ...`, and `bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Overview insight cards can feed briefs

Advanced the route-detail §5.4 citation/corpus-palette loop. Overview insight cards now include a
route-scoped send-to-brief action next to their tab jump, so readiness-gated detector claims can
move directly into the brief composer without changing detector output or the Studio API contract.
To stay within the strict route-detail bundle budget, the decorative micro-figure keeps its typed
kind but no longer ships a separate per-kind label string.

Verified with `bunx biome check apps/web/src/components/route/OverviewSection.tsx
apps/web/src/components/route/route-insight-card.ts
apps/web/test/shared/route-insight-card.test.ts`, `bun test
apps/web/test/shared/route-insight-card.test.ts
apps/web/test/shared/route-insight-placement.test.ts
apps/web/test/shared/route-evidence-index.test.ts --timeout 5000`, `bun --filter @bp/web
typecheck`, `bun --filter @bp/web build`, `bun run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Tier 2 Bx41 Webster CB3 source review closes one more source

Reviewed `nyc_dot_select_bus_service_pdf_2013_02_sbs_webster_bx_cb3` from the full-corpus source
review workspace as a proposed Bx41 Webster Avenue SBS June 2013 service/implementation-plan
record. The local ignored reviewed-record seed now has 14 sources and 14 records. The new record
cites the February 12, 2013 CB3 presentation, the Bx41 LTD to Bx41 SBS service plan, 4 miles of
offset bus lanes, off-board fare collection, all-door boarding, TSP, bus bulb stations, pedestrian
improvements, turn-bay/signal-time changes, and the implementation timeline that places lane
markings and red bus-lane paint in late March-May with start of service at the end of June.

Because the source gives a month but not an exact day, the record stores `effectiveDate: 2013-06`
with `datePrecision: month` and carries the pre-implementation caveat explicitly. Regenerated the
local ignored source receipt closure audit. It now reports 291 queue sources, 14 valid reviewed
records, 3 disposition receipts, 15 closed sources, 276 open sources, and 0 conflicts; public
promotion remains blocked on full source closure. The broader Tier 2 structured-data inventory
command still reports the older global source-closure next action because it scans the published
artifact inventory rather than this ignored manual-review seed.

Verified with `jq empty` on the reviewed-record artifact, `bun run pipeline docs tier2
source-receipt-audit ...`, and `bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Evidence tab gains an insight citation index

Advanced the route-detail §4.3/§5.4 Evidence tab by adding a pure `routeEvidenceIndexRows`
projection over the existing public `StudioRouteInsight` contract. The Evidence tab now starts with
an index of route findings sorted by severity/month/detector/scope, showing detector label,
freshness, safe caveats, cited-ref totals, finding/source ref counts, tab jump targets, and a
route-scoped send-to-brief action. Source-gap rows remain in Evidence even when they have no public
refs attached.

This is a frontend-only dossier affordance: it does not change the Studio API contract, add new
detector output, or promote blocked detector feature families.

Verified with `bunx biome check apps/web/src/components/route/route-insight-card.ts
apps/web/src/components/route/DataNotesSection.tsx
apps/web/src/components/route/route-insight-placement.ts apps/web/src/studio/pages/route-detail.tsx
apps/web/test/shared/route-evidence-index.test.ts`, `bun test
apps/web/test/shared/route-evidence-index.test.ts
apps/web/test/shared/route-insight-card.test.ts
apps/web/test/shared/route-insight-placement.test.ts apps/web/test/shared/coverage-matrix.test.ts
apps/web/test/shared/section-registry.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build`, `bun run check:knowledge`, and `git diff --check`.

## [2026-06-12] engineering | Tier 2 Bx12 Fordham/Inwood CAB source review closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_fordham_rd_inwood_cab_may2023` from the full-corpus
source review workspace as a proposed Bx12 SBS Fordham Road/Inwood offset bus-lane plan. The local
ignored reviewed-record seed now has 13 sources and 13 records. The new record cites the May 31,
2023 Community Advisory Board presentation, selected Alternative A offset bus-lane design, 24/7 bus
lane operation, curb/loading access changes, fall 2023 planned implementation, and ABLE camera
enforcement context. Studied busway alternatives remain caveated as alternatives, not selected
interventions.

Because the source states planned fall 2023 implementation rather than post-implementation proof,
the record stores `effectiveDate: 2023` with `datePrecision: year`. Regenerated the local ignored
source receipt closure audit. It now reports 291 queue sources, 13 valid reviewed records, 3
disposition receipts, 14 closed sources, 277 open sources, and 0 conflicts; public promotion remains
blocked on full source closure. The broader Tier 2 structured-data inventory command still reports
the older global source-closure next action because it scans the published artifact inventory rather
than this ignored manual-review seed.

Verified with `jq empty` on the reviewed-record artifact, `bun run pipeline docs tier2
source-receipt-audit ...`, and `bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Evidence tab promotes checked-clean surfaces

Advanced the route-detail §5.3 negative-space contract in the Evidence tab. The capability coverage
matrix now exposes a pure `checkedCleanCoverageChips` projection, and the Evidence "What we
checked" block renders compact checked-clean chips with the surface label and data-as-of month
before the full coverage table. This makes clean no-hit surfaces visible without changing detector
logic, promoting blocked detector families, or inventing coverage for legacy route responses.

Added focused coverage-matrix tests for checked-clean chip labels, data clocks, depth labels, and
legacy empty-state behavior.

Verified with `bunx biome check --write apps/web/src/components/route/coverage-matrix.ts
apps/web/src/components/route/DataNotesSection.tsx
apps/web/test/shared/coverage-matrix.test.ts`, `bun test
apps/web/test/shared/coverage-matrix.test.ts apps/web/test/shared/section-registry.test.ts
--timeout 5000`, `bun --filter @bp/web typecheck`, and `bun --filter @bp/web build`.

## [2026-06-12] engineering | Tier 2 Bx41 Webster CB6 source review closes one more source

Reviewed `nyc_dot_select_bus_service_pdf_2013_03_sbs_webster_bx_cb6` from the full-corpus source
review workspace as a proposed Bx41 Webster Avenue SBS 2013 service/implementation-plan record. The
local ignored reviewed-record seed now has 12 sources and 12 records. The new record cites the
March 7, 2013 CB6 presentation, Bx41 LTD to Bx41 SBS service plan, 4 miles of offset bus lanes,
off-board fare collection, all-door boarding, TSP, bus bulbs, pedestrian improvements, turn
bays/signal-time changes, and the project timeline that places bus lanes/priority treatments before
summer 2013 start of service while separating 2014-2015 capital work.

Because the source gives a season rather than an exact month/day, the record stores
`effectiveDate: 2013` with `datePrecision: year` and carries the summer-2013 detail as a caveat.
Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 12
valid reviewed records, 3 disposition receipts, 13 closed sources, 278 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. The broader Tier 2 structured-data
inventory command still reports the older global source-closure next action because it scans the
published artifact inventory rather than this ignored manual-review seed.

Verified with `jq empty` on the reviewed-record artifact, `bun run pipeline docs tier2
source-receipt-audit ...`, and `bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Overview insight cards get typed micro-figures

Advanced the route-detail §5.1 insight-card system without changing detector output. Added a
pure `routeInsightCardSpec` helper that classifies existing `StudioRouteInsight` rows into tab
targets, evidence labels, and compact micro-figure kinds: segment strips, trend cues, timeline
ticks, or coverage chips. The Overview verdict cards now use that spec for detector labels,
deep-link copy, citation-count chips, and a fixed-height visual cue that makes ranked insights
scannable before opening a tab.

This keeps the public route dossier contract as the source of truth, leaves the blocked detector
feature families untouched, and gives the current insight payload the card shape called for by the
frontend dossier plan.

Verified with `bunx biome check --write apps/web/src/components/route/route-insight-card.ts
apps/web/src/components/route/OverviewSection.tsx apps/web/test/shared/route-insight-card.test.ts`,
`bun test apps/web/test/shared/route-insight-card.test.ts
apps/web/test/shared/route-insight-placement.test.ts --timeout 5000`,
`bun --filter @bp/web typecheck`, `bunx biome check
apps/web/src/components/route/route-insight-card.ts
apps/web/src/components/route/OverviewSection.tsx apps/web/test/shared/route-insight-card.test.ts`,
and `bun --filter @bp/web build`.

## [2026-06-12] engineering | Tier 2 Bx41 Webster CB7 source review closes one more source

Reviewed `nyc_dot_select_bus_service_pdf_2013_03_sbs_webster_bx_cb7` from the full-corpus source
review workspace as a proposed Bx41 Webster Avenue SBS 2013 service/implementation-plan record. The
local ignored reviewed-record seed now has 11 sources and 11 records. The new record cites the
March 14, 2013 CB7 presentation, the Bx41 LTD to Bx41 SBS service plan, 4 miles of offset bus
lanes, off-board fare collection, all-door boarding, TSP, bus bulbs, pedestrian improvements, turn
bays/signal-time changes, and the project timeline that places bus lanes/priority treatments in
spring 2013 and start of service in summer 2013.

Because the source gives a season rather than an exact month/day, the record stores
`effectiveDate: 2013` with `datePrecision: year` and carries the summer-2013 detail as a caveat.
Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 11
valid reviewed records, 3 disposition receipts, 12 closed sources, 279 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. The broader Tier 2 structured-data
inventory command still reports the older global source-closure next action because it scans the
published artifact inventory rather than this ignored manual-review seed.

Verified with `jq empty` on the reviewed-record artifact, `bun run pipeline docs tier2
source-receipt-audit ...`, and `bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Route pages show dossier depth archetypes

Advanced the manifest-adaptive route-detail work from §8.3 by deriving a route dossier archetype
from the capability manifest and dossier series depth. Routes now classify as `flagship`,
`standard`, `sparse`, or `legacy` based on complete evidence surfaces and multi-year depth, and the
route page exposes that classification in both the Overview verdict card and the Evidence summary.

This makes the page more honest about how much route-level support is available without changing
the underlying serving contract or touching blocked detector feature families. Sparse and legacy
routes no longer visually imply the same dossier completeness as broad multi-year routes.

Verified with `bunx biome check --write apps/web/src/components/route/route-archetype.ts
apps/web/src/components/route/OverviewSection.tsx
apps/web/src/components/route/DataNotesSection.tsx apps/web/test/shared/route-archetype.test.ts`
and `bun test apps/web/test/shared/route-archetype.test.ts --timeout 5000`.

## [2026-06-12] engineering | Tier 2 Bx41 Webster CB5 source review closes one more source

Reviewed `nyc_dot_select_bus_service_pdf_2013_03_sbs_webster_bx_cb5` from the full-corpus source
review workspace as a proposed Bx41 Webster Avenue SBS June 2013 service/implementation-plan record.
The local ignored reviewed-record seed now has 10 sources and 10 records. The new record cites the
March 21, 2013 CB5 presentation, the Bx41 Webster/Melrose route scope, 4 miles of offset bus lanes,
off-board fare collection, all-door boarding, TSP, pedestrian improvements, bus bulbs, queue jump,
turn bays, half-mile SBS stop spacing, and June start-of-service implementation steps.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 10
valid reviewed records, 3 disposition receipts, 11 closed sources, 280 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. The broader Tier 2 structured-data
inventory command still reports the older global source-closure next action because it scans the
published artifact inventory rather than this ignored manual-review seed.

Verified with `jq empty` on the reviewed-record artifact, `bun run pipeline docs tier2
source-receipt-audit ...`, and `bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Route tabs badge their flagged insights

Advanced the route-detail §4.3 tab strip so detector-shaped public insights now badge the tab that
explains them. Shared `routeTabForInsight` routes map, reliability, rider-impact, treatment, and
source-gap insights to the dossier tabs; `routeTabBadges` counts visible insights per tab and keeps
the strongest severity for the badge color. The overview insight cards now use the same router as
the shell, so "View details" links and the manifest-filtered tab badges stay aligned.

The shell renders compact `Badge` counts on visible tabs only, capped at `9+`, without changing the
section registry or promoting the blocked detector feature families. This keeps the current public
insight contract as the source of truth while making the registry-backed page easier to scan.

Verified with `bunx biome check apps/web/src/components/route/RouteDetailShell.tsx
apps/web/src/components/route/OverviewSection.tsx
apps/web/src/components/route/route-insight-placement.ts apps/web/src/studio/pages/route-detail.tsx
apps/web/test/shared/route-insight-placement.test.ts`, `bun test
apps/web/test/shared/route-insight-placement.test.ts apps/web/test/shared/section-registry.test.ts
--timeout 5000`, `bun --filter @bp/web typecheck`, and `bun --filter @bp/web build`.

## [2026-06-12] engineering | Tier 2 M34/M16 34th Street AA source review closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_34thstreet_aa_final` from the full-corpus source review
workspace as a proposed M34/M16 34th Street BRT Locally Preferred Alternative record. The local
ignored reviewed-record seed now has 9 sources and 9 records. The new record cites the February 2010
Alternatives Analysis Screening Report, limits the intervention route assignment to the M34/M16
east-west local service, and preserves the BRT transitway, off-board fare collection, all-door
boarding, TSP, station-siting, pedestrian-space, and preliminary-design/environmental-review evidence.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 9
valid reviewed records, 3 disposition receipts, 10 closed sources, 281 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. The broader Tier 2 structured-data
inventory command still reports the older global source-closure next action because it scans the
published artifact inventory rather than this ignored manual-review seed.

Verified with `jq empty` on the reviewed-record artifact, `bun run pipeline docs tier2
source-receipt-audit ...`, and `bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Riders tab becomes a burden dossier

Advanced the route-detail Riders tab toward the §4.3 dossier question, "Who bears it?" The header
Riders KPI now uses the same rider-impact summary as the tab, pairing daily riders with
rider-hours lost per weekday and the ridership surface's data-as-of clock. The tab now leads with a
question-shaped section header, separates current rider-hour burden from monthly ridership history,
shows route trend and top-segment share evidence, and adds rider/customer-journey insight rows when
public detector context is attached.

Added `rider-impact-summary` as the pure label/null-handling helper so daily-rider, burden,
history, top-segment, and rider-insight wording stays out of React layout code. Focused tests cover
dossier-backed ridership history, current-projection fallback wording, and rider-impact insight
filtering without promoting blocked detector fixes.

Verified with `bunx biome check --write apps/web/src/components/route/RidersSection.tsx
apps/web/src/components/route/RouteJudgedKpiStrip.tsx
apps/web/src/components/route/rider-impact-summary.ts
apps/web/test/shared/rider-impact-summary.test.ts`, `bun test
apps/web/test/shared/rider-impact-summary.test.ts apps/web/test/shared/section-registry.test.ts
--timeout 5000`, `bun --filter @bp/web typecheck`, and `bun --filter @bp/web build`.

## [2026-06-12] engineering | Tier 2 Q52/Q53 Woodhaven source review closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_brt_woodhaven_may2016` from the full-corpus source
review workspace as a proposed Q52/Q53 Woodhaven / Cross Bay SBS 2017 plan record. The local
ignored reviewed-record seed now has 8 sources and 8 records. The new record cites the May 10,
2016 CAC presentation, Q52/Q53 corridor and ridership context, the 2017 SBS implementation plan,
bus-lane/TSP/fare-payment/all-door-boarding components, 2015 bus-lane evidence, simulation travel
time context, and design-update caveats around median stations and later capital work.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 8
valid reviewed records, 3 disposition receipts, 9 closed sources, 282 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. The broader Tier 2 structured-data
inventory command still reports the older global source-closure next action because it scans the
published artifact inventory rather than this ignored manual-review seed.

Verified with `jq empty` on the reviewed-record artifact, `bun run pipeline docs tier2
source-receipt-audit ...`, and `bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Reliability tab becomes evidence-backed

Advanced the route-detail Reliability tab toward the §4.3 dossier-backed question, "Can riders
count on it?" The header KPI no longer claims an official reliability grade just because the
surface is available. It now reports building, low-sample, or observed evidence states from the
capability manifest and observed reliability row, with data-as-of metadata and sample coverage.

The tab now shows evidence state, sample coverage, bunching share, long-gap share, headway
distribution, reliability-specific insight rows, and provenance/caveat copy. Missing or insufficient
observed rows remain explicit manifest-gated empty states instead of blank or overclaimed sections.
Added a shared `reliability-summary` helper and focused tests for building, observed, low-sample,
and reliability-insight filtering cases.

Verified with `bunx biome check apps/web/src/components/route/ReliabilitySection.tsx
apps/web/src/components/route/RouteJudgedKpiStrip.tsx
apps/web/src/components/route/reliability-summary.ts
apps/web/test/shared/reliability-summary.test.ts`, `bun test
apps/web/test/shared/reliability-summary.test.ts apps/web/test/shared/section-registry.test.ts
--timeout 5000`, `bun --filter @bp/web typecheck`, and `bun --filter @bp/web build`.

## [2026-06-12] engineering | Tier 2 B46 Utica CB18 source review closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_brt_uticaave_cb18_transportation_committee_2016` from
the full-corpus source review workspace as a proposed B46 Utica Avenue SBS launch and capital-plan
record. The local ignored reviewed-record seed now has 7 sources and 7 records. The new record cites
the February 17, 2016 CB18 presentation, the B46 SBS route and CB18 stop context, 2014-2015 bus-lane
and TSP improvements, 2016 fare-machine and red-lane launch prep, 2017-2018 bus bulb and pedestrian
capital plans, and the Avenue H stop relocation/short-turn context.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 7
valid reviewed records, 3 disposition receipts, 8 closed sources, 283 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. The broader Tier 2 structured-data
inventory command still reports the older global source-closure next action because it scans the
published artifact inventory rather than this ignored manual-review seed.

Verified with `jq empty` on the reviewed-record artifact, `bun run pipeline docs tier2
source-receipt-audit ...`, and `bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Tier 2 M15 CB11 source review closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_2010_06_09_brt_1st2nd_cb11` from the full-corpus
source review workspace as a proposed First Avenue/Second Avenue M15 SBS launch-plan record. The
local ignored reviewed-record seed now has 6 sources and 6 records. The record cites the June 9,
2010 CB11 presentation, the M15 SBS route map from South Ferry to 125th Street, the 2010 feature
table for off-board fare collection and improved bus lanes, the 2010 bus-lane implementation plan,
selected CB11 station-siting pages, construction sequencing, and the October 2010 launch summary.
It preserves caveats that the source is pre-launch, Transit Signal Priority and bus bulbs are
2011-2012 features in this presentation, and selected station pages are not a full block-by-block
treatment assignment.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 6
valid reviewed records, 3 disposition receipts, 7 closed sources, 284 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. Verified with `jq empty` on the reviewed
record artifact, `bun run pipeline docs tier2 source-receipt-audit ...`, and
`bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Where and when uses dossier speed summary

Advanced the route-detail Where & when tab toward the §4.3 dossier-backed shape. The section now
derives its subtitle, data-as-of badge, current speed, peer framing, 6-month movement, history
window, and worst-segment copy from the route dossier when available, with current-projection
fallbacks for sparse or legacy routes. The helper keeps formatting and null handling out of the
React component, and the route-detail page passes the dossier summary into the slow-segments view.

Added focused coverage for a rich dossier case and a no-dossier fallback. Verified with
`bunx biome check --write apps/web/src/components/route/SlowSegments.tsx
apps/web/src/components/route/where-when-summary.ts apps/web/src/studio/pages/route-detail.tsx
apps/web/test/shared/where-when-summary.test.ts`, `bun test
apps/web/test/shared/where-when-summary.test.ts apps/web/test/shared/section-registry.test.ts
--timeout 5000`, `bun --filter @bp/web typecheck`, and `bun --filter @bp/web build`.

## [2026-06-12] engineering | Tier 2 M15 CB8 March source review closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_2010_03_11_brt_1st2nd_cb8` from the full-corpus
source review workspace as a proposed First Avenue/Second Avenue M15 SBS Phase 1 schedule and
treatment record. The local ignored reviewed-record seed now has 5 sources and 5 records. The new
record cites the March 11, 2010 CB8 presentation, the First Avenue/Second Avenue M15 corridor from
South Ferry to 125th Street, the 2010 SBS feature table for off-board fare collection and improved
bus lanes, the 2010 schedule showing October Phase 1 SBS service beginning, and selected CB8 station
siting pages, while preserving caveats that the source is pre-launch, month-level, and not a full
block-by-block assignment.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 5
valid reviewed records, 3 disposition receipts, 6 closed sources, 285 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. Verified with `jq empty` on the reviewed
record artifact, `bun run pipeline docs tier2 source-receipt-audit ...`, and
`bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Treatments history tab becomes dossier-backed

Consolidated the route-detail Treatments & history tab into the §4.3 redesign shape. The tab now
shows treatment posture stats, family-grouped treatment inventory, source-labeled document refs,
dated intervention history, dossier-backed speed history, and comparison cards only when a promoted
route record carries a peer-adjusted comparison window. This replaces the old split between the
treatment inventory and timeline sections without reviving the blocked detector feature fixes.

Added helper coverage for promoted comparison card formatting and source-row de-duplication.
Verified with `bun test apps/web/test/shared/treatments-history.test.ts
apps/web/test/shared/section-registry.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
targeted `bunx biome check --write ...`, and `bun --filter @bp/web build`.

## [2026-06-12] engineering | Evidence shows manifest coverage matrix

Advanced the route-detail Evidence tab from dataset notes into the §5.3/§8.1 manifest-backed
"what we checked" matrix. Evidence now lists each published capability surface with state, depth,
reason, and data-as-of metadata, so ready, checked-clean, insufficient, blocked, and legacy/no-manifest
routes all have explicit public language instead of relying only on hidden-tab notes. Added a focused
coverage-matrix helper and tests for ordering, labels, depth summaries, and legacy fallback behavior.

Verified with `bun test apps/web/test/shared/coverage-matrix.test.ts
apps/web/test/shared/section-registry.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
targeted `bunx biome check ...`, `bun --filter @bp/web build`, and `git diff --check`.

## [2026-06-12] engineering | Tier 2 M15 CAC4 source review closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_2010_04_29_brt_1st2nd_cac4` from the full-corpus
source review workspace as a proposed M15 First Avenue/Second Avenue SBS launch record. The local
ignored reviewed-record seed now has 4 sources and 4 records. The CAC4 record cites the April 29,
2010 presentation, the source-announced October 10, 2010 M15 SBS start, the 10+ miles of bus/bike
facilities, the First Avenue/Second Avenue corridor/ridership context, and station-siting changes
at Water/Wall, Grand/Allen, First/28th, and First/42nd, while preserving caveats that this is
pre-launch evidence, deterministic corridor validation still needs review, and the station maps are
not a full block-by-block treatment assignment.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 4
valid reviewed records, 3 disposition receipts, 5 closed sources, 286 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. Verified with `jq empty` on the reviewed
record artifact, `bun run pipeline docs tier2 source-receipt-audit ...`, and
`bun run pipeline audit tier2-structured-data --json`.

## [2026-06-12] engineering | Overview becomes a dossier verdict slice

Advanced the route-detail redesign from tab availability into the §4.2 Overview shape. Overview
now leads with a route verdict, up to three severity-ranked insight cards, a dossier-backed story
strip, a mini-map link into the Map tab, and a "what we checked" path into Evidence. The corridor
profile and hour-of-day diagnostic chart moved out of Overview and into Where & when, matching the
question-shaped tab split.

Verified with `bun test apps/web/test/shared/route-insight-placement.test.ts
apps/web/test/shared/section-registry.test.ts --timeout 5000`, `bun --filter @bp/web typecheck`,
and `bun --filter @bp/web build`.

## [2026-06-12] engineering | Tier 2 M15 First/Second Avenue source review closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_2010_02_25_brt_1st2nd_cb8` from the full-corpus
source review packs as a proposed M15 SBS corridor record for First Avenue/Second Avenue Phase 1.
The local ignored reviewed-record seed now has 3 sources and 3 records. The M15 record cites the
official February 25, 2010 CB8 presentation title/date, the 2010 milestone schedule, and the
corridor map legend for offset/curb bus lanes, SBS station locations, and protected/shared bike
path street designs, while preserving caveats that the reviewed page text does not itself print
M15, the start date is only October/November 2010, and the map extraction does not assign treatment
types to exact segments.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 3
valid reviewed records, 3 disposition receipts, 4 closed sources, 287 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. Verified with `jq empty` on the reviewed
record artifact, `bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and
`bun --filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] engineering | Route detail registry exposes map and reliability tabs

Advanced the route evidence dossier to registry-driven presentation for the next route-detail
redesign slice. The route section registry now includes explicit Map and Reliability tabs, hides
reliability when the manifest says the surface is still building or insufficient, and carries
hidden-section state/reason/data-as-of metadata into the Evidence notes instead of rendering blank
or unsupported tabs. The route-detail page now renders a map-first geography section and an observed
wait-reliability section when the manifest supports them, while compare keeps the existing supported
subset until map/reliability compare sections exist.

Verified with `bun test apps/web/test/shared/section-registry.test.ts --timeout 5000`,
`bun --filter @bp/web typecheck`, `bun --filter @bp/web build`, targeted
`bunx biome check --max-diagnostics=80 ...`, and `git diff --check`.

## [2026-06-12] engineering | Tier 2 Kings Highway source review closes one more source

Reviewed `nyc_dot_bus_priority_document_pdf_brt_kings_highway_aug2018` from the full-corpus source
review packs as a corridor-level proposed Kings Highway curbside-change record. The local ignored
reviewed-record seed now has 2 sources and 2 records, with Kings Highway carrying bus-lane,
turn-bay, taxi-stand-relocation, truck-loading-zone, parking-meter, and parking-impact evidence
while preserving caveats that the reviewed pages do not state bus route IDs, implementation date,
measured bus-speed impact, or block-level treatment locations.

Regenerated the local ignored source receipt closure audit. It now reports 291 queue sources, 2
valid reviewed records, 3 disposition receipts, 3 closed sources, 288 open sources, and 0 conflicts;
public promotion remains blocked on full source closure. Verified with `jq empty` on the reviewed
record artifact, `bun --filter @bp/pipeline-v2 cli -- docs tier2 source-receipt-audit ...`, and
`bun --filter @bp/pipeline-v2 cli -- audit tier2-structured-data --json`.

## [2026-06-12] docs | Multi-year public contract clarified

Captured the maintainer clarification that the product should stop centering the idea of monthly
publishing. ADR 0017 now states that default public surfaces should be shaped around multi-year
route/corridor evidence wherever source coverage supports it, with a baseline month serving only as
review/provenance anchor. Updated the corpus overview, frontend serving goal, hard-cutover dossier,
and wiki index to describe publication as promotion of a reviewed serving projection rather than
shipping one monthly dataset as the product.

## [2026-06-12] engineering | Web route loaders made signal-aware and cache-tuned

Closed the current web app support-plan gap for route loader behavior. Studio API read helpers now
accept optional abort signals, and high-traffic TanStack Router loaders pass
`abortController.signal` through route, search, compare, finding, brief, evidence, history, edit,
review, and annotate requests. Static serving pages use a 5-minute stale window, editorial brief
pages use 60 seconds, and mutable authoring/review pages use 30 seconds.

The new-brief loader now starts its seed brief plus optional route/finding context fetches in
parallel instead of serializing them. The live authoring UI already writes through the D1 draft
create/edit/review/publish-candidate/retract APIs, while brief evidence/history are split routes
and route/chart-heavy UI stays lazy-loaded under the current payload contract. Verified with
`bun --filter @bp/web typecheck` and `bun run check:web-release`.

## [2026-06-12] engineering | Studio coverage audit aligned with D1 route addressability

Updated `audit studio-coverage` so the public `/api/v1/studio/routes` contract is gated by D1 route
addressability instead of the older curated `studio/v1` projection list. The audit now reports
`d1RouteAddressabilityShare: 1` for March 2026 and returns `warn`, not `fail`, when only legacy
curated route-detail projection depth is missing. Mandatory serving-contract inputs, route brief
inputs, segment evidence metadata, evidence catalog integrity, generated-artifact presentation
rules, and detector finding refs remain fail gates.

Verified with `bun --filter @bp/pipeline-v2 test studio-coverage` and
`bun --filter @bp/pipeline-v2 cli -- audit studio-coverage --year 2026 --month 3 --json`.

## [2026-06-12] engineering | Loaded 311 corpus and Worker refresh readiness closed

Marked the 311 geocode/join item complete for the loaded current and historical corpora. The
operational status records zero unattempted 311 rows after the targeted monthly slices: current 311
has 2,504,843 geocoded records and 16,291 misses, while historical 311 has 37,707 geocoded records
and 1,597 misses. Current and historical route-touch tables are materialized.

Also reverified the small Worker refresh model: cron captures GTFS-RT protobuf/manifests plus
compact health to R2/D1, the daily route-speed watcher writes publication artifacts, and
`shouldRebuild=true` stays a manual PC rebuild/publish handoff. Verified with
`bun --filter @bp/studio-api test source-refresh`.

## [2026-06-12] engineering | Serving publish completeness reverified after timeline materialization

Closed the stale local March 2026 publish-completeness regression without rerunning the production
mutation. The route-timeline serving projection builder now materializes each timeline copy-plan
artifact into the local R2 artifact root while writing the projection JSON/SQL/Markdown outputs, so
the D1 seed's `studio/v2/routes/{route}/timeline.json` artifact refs resolve locally.

Regenerated the March 2026 route-timeline serving projection from the existing bundle index and
reverified that B46, B82, BX41, and M15 timeline artifact hashes/byte counts match the D1 seed.
`bun run check:publish-completeness -- --month 2026-03` now reports zero missing refs, and a dry-run
`bun run publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2
bus-priority-artifacts` completed without mutating production. The earlier production
`publish:serving-release --execute` remains recorded in the operational status page.

## [2026-06-12] engineering | Mixed-freshness labels surfaced in route data notes

Closed the frontend copy gap for ADR 0017 release-layer labels. Added a route data-quality label
helper in `apps/web/src/components/route/data-quality-labels.ts` that maps the Studio quality
contract to `Baseline Release`, `Current Signal`, `Pending Publication`, and `Observed Release`,
plus human-readable completeness labels. `DataNotesSection` now shows the release layer with a
short provenance description instead of only confidence/completeness, and
`apps/web/test/shared/data-quality-labels.test.ts` locks the public labels against snake_case enum
leaks. Verified with `bun test apps/web/test/shared/data-quality-labels.test.ts --timeout 5000`
and `bun --filter @bp/web typecheck`.

## [2026-06-12] engineering | Studio docs endpoint metadata generated from OpenAPI contract

Closed the immediate-open-issue slice for `/docs` API metadata drift. `GET /api/v1/studio/docs`
now preserves the generated docs prose/quality projection from R2 but replaces stale endpoint rows
with endpoint metadata derived from `studioOpenApiDocument.paths`, the same package-level contract
served by `GET /api/openapi.json`. The Studio snapshot manifest uses the same generated endpoint
count, so `/api/v1/studio/snapshot` can no longer report stale docs endpoint inventory from
`studio/v1/docs.json`.

Added coverage in `packages/studio-api/test/api-facade.test.ts` and
`packages/studio-api/test/http-routing.test.ts` to prove docs sections remain projection-backed
while endpoint rows and snapshot counts follow the OpenAPI contract. Verified with
`bun --filter @bp/studio-api test`, `bun --filter @bp/studio-api typecheck`, and
`bun --filter @bp/web typecheck`. Also reverified the already-implemented web release gate with
`bun run check:web-release` before marking immediate issue 6 done in `knowledge/index.md`.

## [2026-06-12] engineering | Tier 2 reviewed-record seed closes Utica source

Added the first schema-valid full-corpus reviewed intervention record seed at
`data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json`.
The record closes `nyc_dot_select_bus_service_pdf_utica_ave_b46_sbs_open_house` as a proposed
Utica Avenue B46 SBS bus-lane, left-turn-bay, and local-stop design record, while preserving the
review caveat that the pack did not resolve route links and that B46 comes from the source context
rather than a parsed route field. The artifact is explicitly `publicPromotionStatus: not_ready`.

Updated the source-disposition decisions so Utica is `reviewed_records_authored`, the bus-lane
enforcement brochure remains `supporting_context_only`, and the Flatbush Avenue September 2025
source stays `needs_more_source_review` because the current extraction captured only a page-3
Background divider and needs later-page recapture/manual review. Regenerated source-disposition
receipts and the full-corpus source receipt closure audit. The closure audit now has 291 queue
sources, 1 valid reviewed record, 3 disposition receipts, 2 closed sources, 289 open sources, and 0
conflicts.

Reran `audit tier2-structured-data` and `audit data-product-completeness`. The structured inventory
now scans 2,152 artifacts and reports only the source-closure gate as the next Tier 2 action. Data
product completeness still reports 84 complete, 1 partial, 3 missing, 1 blocked, and 5
downstream-blocked products; the Tier 2 extraction product is partial for `2/291` closed sources,
289 open sources, and the still-missing full-corpus publishable intervention projection.

## [2026-06-12] engineering | Full-corpus Tier 2 source review packs generated

Generated a bounded all-source review-pack batch at
`data/artifacts/docs/agentic-runs-20260604/source-review-packs-full-authority-qv1-qv10-v1/all-source-review-packs.json`
with Markdown and summary siblings. The batch covers all 291 source queue rows: 288
record-candidate review packs, 3 source-disposition review packs, 277 high-priority sources, and
175 exact mta-wiki aligned sources carrying 2,279 supplementary mta-wiki candidate records. The
packs are complete authoring handoffs, not source receipts or reviewed intervention facts.

Updated the Tier 2 structured-data inventory to classify `bp.tier2_source_review_pack_batch.v1` as
`source_review_packs` validated staging and to scan `source-review-packs` artifacts. The inventory
now warns that source review packs must not be treated as reviewed or publishable intervention
facts, and the refreshed inventory has 2,151 scanned artifacts. The remaining full-corpus blockers
are unchanged: 290 open sources, missing reviewed `bp.document_intervention_record.v1` records, and
missing full-corpus publishable intervention projection.

## [2026-06-12] engineering | Tier 2 source disposition receipts added

Added `docs tier2 source-disposition-receipts`, which normalizes explicit source-review decisions
from source review packs into audit-readable `bp.tier2_source_disposition_receipts.v1` artifacts.
The command validates source ids against the reviewed pack batch, carries reviewer/rationale/evidence
refs, and keeps source dispositions separate from reviewed intervention facts: only
`supporting_context_only`, `no_actionable_bus_priority_intervention`, and `suppressed` close a
source without records, while `needs_more_source_review` remains non-closing.

Generated the first receipt batch at
`data/artifacts/docs/agentic-runs-20260604/source-disposition-receipts-full-authority-qv1-qv10-v1/source-disposition-receipts.json`
from three source-disposition-only packs. It produced 3 receipts, with 1 closing disposition
(`nyc_dot_bus_priority_document_pdf_buslane_enforcement_brochure` as supporting context only) and 2
non-closing receipts for sources that still need more review. The artifact remains
`publicPromotionStatus: not_ready`.

The full-corpus source receipt closure audit now has 291 queue sources, 3 disposition receipts, 0
invalid disposition receipts, 1 closed source, 290 open sources, and 0 conflicts. Structured-data
inventory now scans and classifies `source_disposition_receipts` as validated staging, with an
explicit warning that these receipts close source accounting only and must not be treated as
reviewed or publishable intervention facts.

After rerunning `audit tier2-structured-data` and `audit data-product-completeness`, the structured
inventory has 2,145 artifacts. Data-product completeness remains 84 complete, 1 partial, 3 missing,
1 blocked, and 5 downstream-blocked; the Tier 2 full-corpus extraction product is still partial for
`1/291` sources closed, 290 open sources, missing full-corpus reviewed records, and missing
full-corpus publishable interventions.

## [2026-06-12] engineering | mta-wiki source alignment joined to Tier 2 queue

Refreshed the mta-wiki Tier 2 bridge from `/mnt/models/dev/mta-wiki` into
`data/artifacts/docs/mta-wiki-tier2-bridge/mta-wiki-intervention-review-queue.json` and Markdown.
The current canonical corpus is larger than the first bridge: 269 sources, 234 routes, 191
projects, 1,177 events, 1,339 treatment components, 4,203 relations, 2,707 intervention candidate
records, and 263 review groups. Of those groups, 215 have route links and 48 still need route
resolution. The bridge remains `publicPromotionStatus: not_ready`.

Added `docs tier2 mta-wiki-source-alignment`, which aligns the refreshed mta-wiki review groups to
the full qv1-qv10 Tier 2 source disposition queue by exact normalized source keys only. The new
artifact at `data/artifacts/docs/mta-wiki-tier2-bridge/mta-wiki-source-alignment.json` aligns 175
of 291 queue sources, leaves 116 queue sources unaligned, leaves 88 mta-wiki review groups
unaligned, and brings 2,279 mta-wiki candidate records plus 13,878 evidence refs into the review
context lane. This is authoring context only: it does not close source receipts, create
`bp.document_intervention_record.v1` rows, or permit public promotion.

The Tier 2 structured-data inventory now recognizes `mta_wiki_source_alignment` as discovery-only
and scans `mta-wiki-source-alignment` artifacts. After rerunning audits, structured-data inventory
has 2,142 artifacts, while data-product completeness remains 84 complete, 1 partial, 3 missing, 1
blocked, and 5 downstream-blocked. The remaining Tier 2 blockers are still source receipt closure
for 291/291 open sources, missing full-corpus reviewed records, and missing full-corpus publishable
interventions.

Updated `docs tier2 source-review-pack` so source-scoped authoring packs can optionally consume the
mta-wiki alignment artifact. Regenerated the existing full-corpus review handoffs with that context:
the top-25 high-priority record-candidate packs now include mta-wiki context for 12 sources and 173
candidate records, while the 3 source-disposition-only packs have no mta-wiki matches. These pack
fields are review hints only and remain blocked by blank receipt templates until reviewed records or
explicit source dispositions are written.

## [2026-06-11] engineering | Tier 2 source receipt closure gate materialized

Added `docs tier2 source-receipt-audit`, a deterministic closure audit over the full Tier 2 source
queue, reviewed `bp.document_intervention_record.v1` artifacts, and source-disposition receipt
artifacts. A source now closes only through a schema-valid reviewed record or a closing non-record
disposition such as `supporting_context_only` or `no_actionable_bus_priority_intervention`;
`reviewed_records_authored` without a valid record remains open, and record/disposition conflicts
are counted separately.

Generated the first full-corpus closure audit at
`data/artifacts/docs/agentic-runs-20260604/source-receipt-closure-full-authority-qv1-qv10-v1/source-receipt-closure-audit.json`.
The current state is explicit: 291 queue sources, 0 closed, 291 open, 0 conflicts, closure status
`partial`, and `publicPromotionStatus: not_ready`. The Markdown and summary siblings were generated
in the same directory.

The structured-data inventory now recognizes `source_receipt_closure_audit` as validated staging,
scans `source-receipt-closure` artifacts, and reports the next action to close all 291 sources
before promotion. Data-product completeness now includes
`source_receipt_closure_full_corpus` in `tier2_structured_intervention_extraction_full_corpus`; the
product remains partial for the concrete blockers `0/291` sources closed, 291 open sources, missing
full-corpus reviewed records, and missing publishable interventions.

## [2026-06-11] engineering | Full-corpus Tier 2 source disposition queue generated

Added `docs tier2 source-disposition-queue`, a deterministic source-level review queue over the
full qv1-qv10 materialized research views. The queue writes JSON, Markdown, and summary artifacts
and keeps every source at `reviewReceiptStatus: needs_review_receipt` plus
`publicPromotionStatus: not_ready`, so it can drive source dispositions without becoming a public
fact layer.

Generated the first full-corpus queue at
`data/artifacts/docs/agentic-runs-20260604/source-disposition-queue-full-authority-qv1-qv10-v1/source-disposition-queue.json`.
It covers 291 sources, 236 unique route ids, 288 record-candidate review lanes, 3 source-disposition
review lanes, 277 high-priority sources, 34 wide-route-fanout sources, and 291 missing review
receipts. The structured-data inventory now recognizes this as `source_disposition_queue`
validated staging, and data-product completeness requires it before considering the full-corpus
Tier 2 structured extraction lane complete.

After rerunning audits, Tier 2 structured extraction remains partial for the real blockers only:
`reviewed_intervention_records_full_corpus` and `publishable_interventions_full_corpus` are still
missing. The queue is the handoff substrate for writing those records or explicit source
dispositions; it is not itself publishable intervention evidence.

Added `docs tier2 source-review-pack`, which turns selected queue rows into source-scoped authoring
packs by joining the queue to materialized detector feature rows, unresolved vocab review items,
route evidence bundle context, sample surfaces, and a blank receipt template. Generated the first
review batches under
`data/artifacts/docs/agentic-runs-20260604/source-review-packs-full-authority-qv1-qv10-v1/`:
the top 25 high-priority record-candidate sources and all 3 source-disposition-only sources. These
packs are still `publicPromotionStatus: not_ready`; they are the next handoff for authoring
reviewed records or explicit source dispositions, not reviewed records themselves.

## [2026-06-11] engineering | Release closure unblocked, research gates materialized

Cut over the remaining release-closure blockers into concrete applied-research artifacts and warning
gates. `customer_journey_shortfall` now writes source-as-of rows into the release-month DB partition
while preserving the source month in scope ids, so March release gates see the March findings
partition without pretending the upstream customer-journey source is March-grained.

Added the long-history `segment-daypart-panel`, forecast validation gates, causal validation gates,
and causal screening products: pulse candidate set, pulse event overlap, event effect contrast,
mechanism corroboration, event-family effect panel, and event-family response-drift study. The
March artifacts are all internal/research-grade and keep limitations explicit; causal and
event-family gates warn rather than promoting public causal language.

After rebuilding March 2026 artifacts, data-product completeness is 84 complete, 1 partial, 3
missing, and 1 upstream-blocked, with `planned_blocked` at 0. Detector closure is now 24 units: 4
ready, 20 partial, 0 blocked, 0 unmaterialized. Remaining work is no longer builder absence:
finish Tier 2 full-corpus reviewed/publishable intervention extraction, resolve historical GTFS
static/service-baseline gaps, and graduate detector-specific score-vector or shadow-audit warnings
for the remaining partial detector families. The richer Tier 2 workspace at
`/mnt/models/dev/mta-wiki` may be useful for the full-corpus extraction pass.

## [2026-06-11] engineering | mta-wiki Tier 2 bridge queued for review

Added an honest bridge from `/mnt/models/dev/mta-wiki` canonical JSONL into Bus Studio Tier 2
review inputs. The new `docs tier2 mta-wiki-bridge` command writes
`data/artifacts/docs/mta-wiki-tier2-bridge/mta-wiki-intervention-review-queue.json` and Markdown,
grouping mta-wiki project/event/treatment rows by source with route hints and evidence previews.
The artifact is explicitly `publicPromotionStatus: not_ready`: mta-wiki canonical rows are
source-stated and unreviewed for the Bus Studio publishable-intervention contract, so they can feed
manual review but cannot stand in for `bp.document_intervention_record.v1` records.

Registered the bridge as a `mta_wiki_canonical_bridge` discovery-only check in the Tier 2 structured
inventory and data-product completeness manifest. The March bridge currently has 2,068 candidate
records, 187 review groups, 151 groups with route links, and 36 groups that still need route
resolution. After rerunning March 2026 completeness, the bridge check passes; Tier 2 remains partial
only because `reviewed_intervention_records_full_corpus` and
`publishable_interventions_full_corpus` are still missing.

## [2026-06-11] engineering | Detector readiness now evaluates policy windows

Fixed the analytics detector-readiness audit so detector status is based on each detector's
policy-relevant release/baseline windows, not every month in the requested historical audit range.
The full surface coverage still records the upstream caveat: March 2026 `gtfs_schedule_runtime`
coverage has 36 expected months, 27 present months, and 9 thin early-2023 months.

After rebuilding the March 2026 readiness audit, all 21 detector policies are ready: 21 ready,
0 partial, 0 blocked, and 0 policy-pending. Detector closure moved from 4 ready / 20 partial to
5 ready / 19 partial; the remaining partials are now driven by Tier 2 full-corpus review gaps,
detector-specific corpus-grain shadow-audit warnings, and research-validation warning gates rather
than stale readiness-policy partials.

## [2026-06-11] engineering | Full-corpus Tier 2 materialized views wired into audits

Regenerated the Tier 2 vocab consumer index and materialized research views from the full-authority
qv1-qv10 canonical surface application instead of the smaller qv8-qv10 repair tail. The new
materialized view artifact covers 78,605 surfaces, 93,893 detector feature rows, 236 route evidence
bundles, 291 source coverage rows, and 13,225 unresolved review items.

Extended the structured-data inventory and data-product completeness manifest with a separate
`materialized_research_views` layer and a guarded
`full_corpus_materialized_research_views` check. This check is allowed to pass only for full-corpus
scale qv1-qv10 materializations, and it remains explicitly non-public: the artifact is review
substrate, not reviewed or publishable intervention facts. After rerunning the audits,
`tier2_structured_intervention_extraction_full_corpus` is still partial only because
`reviewed_intervention_records_full_corpus` and `publishable_interventions_full_corpus` are missing.

## [2026-06-11] analysis | Batch 2 reviews: post-fix stop-hour top-100s + peer re-review

Ran the top-priority review batch over the artifacts the two feature fixes produced. Register now
totals 1,047 reviewed labels. Headway: all 100 post-fix top-100 cells labeled adversarially — 37
new primary_finding + 34 route_context; primary survival 37/40 (the 3 batch-1 primaries sit at
ranks ~200-250 among qualitatively identical cells; rank<=100 documented as a capacity choice, not
a quality bar); 12/35 suppress leakage remains from hour-scale feed-gap artifacts where EWT
severity saturates — named fix is a CoV/max-gap sanity gate. Bunching: 87 new labels; primaries
2/2 (S54 N rank 1, new Q31 S school-dismissal canonical rank 29); the post-fix top-100 is
duplicate-dominated, not artifact-dominated — 78/100 cells are non-canonical members of 14 stop
pockets, so the canonical-cell dedupe gate (next slice) would collapse it to ~22 independent
identities. Peer re-review: against honest class-based peers the four locals' deficits shrank from
the system-pool's 2.85-3.6 mph to 1.0-1.5 mph; M57 and BX2 upgraded route_context→primary_finding
(stable >=1 mph deficits 36/36 months), M31/M42 honestly kept at route_context, M34+/M34A+
upgraded needs_more_evidence→route_context (real 2.8-3.0 mph deficits but a citywide class-only
pool). All combined-gold evaluations: batch-1 labels untouched; suppress leakage 0/16 (peer),
batch-1 suppress cells stay out of the headway top-100 (worst rank 670). The publishable core grew
from ~70 to ~110 label-backed public finding candidates.

## [2026-06-11] engineering | Label-backed fixes: stop-hour sufficiency ranking + real speed-peer groups

Implemented the two highest-leverage feature fixes named by the calibration sweep, verified against
the untouched reviewed-gold sets. (1) Stop-hour ranking: `observationSufficiencySignal()` in
headway-common blends each cell's sample count (vs the existing high-confidence thresholds) and
schedule-implied coverage share into detectorScore for headway_reliability_ewt and
bunching_hotspots — no emission gate added, no floors/caps touched, high-limit candidate counts
unchanged. Score saturation is gone (unique max 91.83). Bunching: the S54 label-backed primary now
ranks 1; suppress-labeled top-100 leakage fell 14→5 (arrival-coverage artifacts 10→1; the remaining
4 are duplicate-pocket leaks owned by the future stop-pocket dedupe gate). Headway: suppress
leakage in the top-100 fell 2→0 and the three label-backed primaries improved 593/1131/1310 →
216/201/248 but remain outside the top-100 — the cells above them are unreviewed well-observed
LoS-F cells that meet the gold's own criteria, so the curve was not overfit to force three labels
in; recorded as the honest residual. (2) multi_month_speed_peer: root cause of the fallback-pool
pathology was a wiring gap — `buildMultiMonthSpeedPeerRoutesFromHistory` hardcoded
`peerGroupMethod: "system"`. New class-based peer construction (SBS/express/local × borough, min
group size 10 with an honest fallback chain) plus claim wording that names the method actually
used. March rerun: 6 emitted (M50/M8 fall below the floor against honest same-class medians),
zero system-only candidates, SBS routes now compared within a 19-route SBS pool with deficits
nearly unchanged (3.08→3.02 mph) — the signal was real, the framing wasn't. Suppress leakage held
0/16; the 6 survivors are flagged for label upgrade in the next review batch.

## [2026-06-11] analysis | Full detector calibration sweep: 13 reviewed-gold sets, S4.1 serving gate, Phase 5 floor

Completed the backend-goal-finish-detectors plan in one sweep. Every machinery_built and
internal_only detector now has reviewed gold on the March 2026 inventory (register total: 860
labels across 18 detectors). S4.1 landed: `SERVING_BLOCKED_DETECTOR_IDS` in `@bp/domain`
structurally blocks persistent_speed_hotspot (superseded), intervention_event_study
(candidate-causal), positive_deviance, and rider_weighted_excess_wait from route-insight serving
even if a manifest carries them in a public bucket, with a test tying the blocklist to the
calibration register dispositions. Phase 5 floor: S5.1-S5.3 pure helpers were already tested;
`evidence-packet-completeness-2026-03.json` now materializes S5.3 over the real runs (mature share
1.0 for every candidate-bearing family; source_gap 0 by its data-quality waiver).

Promotable now (label-backed public_finding_candidate buckets): observed_reliability 22,
intervention_underperformance 4 (M57, M42, M34+, M104), delay_concentration 4, degradation_trend 1
(Q103), headway_reliability_ewt 3 (all cap-suppressed in production — see below), bunching_hotspots
1 (S54 N), plus the previously calibrated treatment-scope/speed-pace/customer-journey sets. Context
family held its invariant: permit_correlated_slowdown and service_request_context leak 0 into
findings; route_context ceilings of 7 and 10.

The sweep's negative findings are the valuable part, all recorded as readiness gates / feature
fixes, never threshold edits: (1) stop_direction_hour detectors are not promotable — headway/
bunching score-saturate so the production top-100 is an arbitrary thin-sample slice while
well-sampled real pockets sit cap-suppressed, and fractional GTFS-RT coverage fabricates gap/EWT
artifacts (headway leakage 2/23, bunching 14/46); (2) travel_time_variability's metric is
constructively broken — percentiles over 3-10 hourly aggregate sums whose row-count mix explains
16/18 emitted cells (leakage 16/44); fix is a trip-level feature rebuild; (3) schedule_mismatch has
no verifiable schedule baseline (15-151 min scheduled vs 175-650 min observed is physically
impossible) — all 24 reviewed emitted capped at needs_more_evidence, below even the expected
route_context ceiling; (4) multi_month_speed_peer silently used the system-wide fallback peer group
for every candidate while claiming "matched peer median" — zero primaries until peer construction
or claim wording is fixed; (5) degradation_trend's main failure is step breaks scored as trends
(route-version provenance missing from the history grain); (6) permit/311 context detectors share
the route-LION fanout failure (Manhattan grid permits/complaints counted against many routes;
permit suppress leakage 13/29, 311 12/28); (7) observed_reliability's cap hides 120 qualifying
routes with a Queens/express skew. source_gap agreement audit: zero overclaims vs the S2.4
materialization artifact; failure mode is under-reporting (silent on 14 route holes in 2 grains).
intervention_event_study confirmed structurally incapable of public buckets; its internal bar
(suppress leakage 6/19 from gate-failed panels still emitting) is explicitly not yet met.

## [2026-06-11] analysis | delay_concentration reviewed gold: 4/4 primary survival, 0/16 suppress leakage

Completed the ADR-0018 loop for `delay_concentration` on the March 2026 inventory. `findings
run-detector` gained `--rows-output`, which persists every candidate/evidence/coverage row (the run
artifact keeps only samples) so review queues can be built from a real run. The stratified queue
selected 23 rows: all 7 emitted candidates, 8 borough-spread clean controls, and 8 skipped
controls. Reviewed labels (batch `2026-06-11-march-initial-23`, adversarial depth on emitted rows):
4 `primary_finding` (B6, Q17, Q27, B17), 1 `route_context` (B44+), 1 `needs_more_evidence` (Q44+,
whose "6 of 8 segments" readout is near-tautological at the 8-segment route minimum), 1
`reviewer_only` (Q43, near-threshold score with delay at the 61st percentile), and 16 `suppress`.
Evaluation: reviewed-primary survival 4/4, suppress leakage 0/16, unreviewed emitted 0. Readiness:
4 `public_finding_candidate`, 1 `route_context`, 2 `review_queue`, 16 `suppressed`, with 75 skipped
coverage rows accounted separately. Review confirmed the absolute-delay floor correctly holds back
every high-Gini/low-delay route (Q88 at the 99.6th Gini percentile but 30k min delay), and that
"6 of N" readouts degrade near the segment minimum — kept as readiness gates, no thresholds or caps
changed. The calibration register now carries the 23 labels and suppress-side root-cause tags.

## [2026-06-11] engineering | Track B delay concentration calibration machinery

Added the first ADR-0018 calibration machinery for `delay_concentration` on the route-segment-month
grain: a deterministic review-queue builder, reviewed-gold/evaluation/readiness projection, focused
fixture tests, and the calibration NOTE/register updates. The existing March 2026 no-write inventory
covers 353 routes, 4,140 segment rows, and 470,462 speed observations; it emits 7 candidates with
271 clean no-hit routes and 75 skipped routes. The high-limit `--candidate-limit 20000` probe emits
the same 7 candidates, so the first review risk is not cap suppression. Main calibration risks to
label are low eligible segment count, segment-count sensitivity, single-segment dominance, segment
length/mix or stale-row uncertainty, and the hard caveat that concentration is descriptive rather
than causal or actionable by itself. Public promotion remains blocked on reviewed labels and zero
suppress leakage.

## [2026-06-11] infra | Track B Phase 0-2 checkpoint after resolver seam hardening

After the S1.1 follow-up seam hardening, re-checked the rest of
`backend-goal-finish-detectors.md` Phases 0-2 before moving into new detector calibration work.
S1.2 is already closed in the current tree: `treatment-event-panel.ts` gets the
`intervention_event_study` detector id through the `@bp/domain` allowlist, and
`production-boundaries.test.ts` scans real `tools/pipeline-v2/src` import specifiers so prose
strings and sandbox symlink commands do not mask direct `@bp/analytics` imports. The current
Phase 2 state is also no longer the stale mid-plan state: S2.1 `isTerminal` and S2.3
spatial-confidence/lane-type field fixes have current calibration log entries, S2.2 cap accounting
and S2.4 materialization coverage are logged, and S2.5 `deferred_not_in_scope` is in the domain/db
coverage vocabulary plus run-artifact summary accounting. Verification today:
`bun test tests/harness/production-boundaries.test.ts --timeout 5000` (15 pass / 0 fail);
`bun --filter @bp/pipeline-v2 test commands/build/treatment-event-panel` (474 pass / 0 fail; package
runner executed the full suite); `bun --filter @bp/analytics test` (179 pass / 0 fail);
`bun --filter @bp/analytics typecheck`; `bun --filter @bp/domain typecheck`;
`bun --filter @bp/domain test` (74 pass / 0 fail).

## [2026-06-11] infra | Track B S1.1 detector-run seam now uses the resolver path end to end

Follow-up hardening on S1.1 after the first resolver-support slice: `runRegistryDetectorStudy`
no longer accepts caller-supplied `featureContracts`, and the kernel `FeatureResolver` wrapper for
already-built detector inputs now lives in `detector-input-assembly.ts`, where contract
satisfaction is derived from the registered resolver/local-row/quality-carried support path. The
pipeline `findings run-detector` command now calls `runRegistryDetectorStudyFromResolverPath`,
which assembles inputs and runs the detector without re-passing a separate satisfaction map. Added
a regression proving the assembly-backed run path emits the same resolver-derived contracts and
model dependency audit. Verification: `bun --filter @bp/applied-research test detector-study
feature-resolver-support` (381 pass / 0 fail; package runner executed the full suite);
`bun --filter @bp/pipeline-v2 test commands/findings/run-detector` (474 pass / 0 fail; package
runner executed the full suite).

## [2026-06-11] infra | Track B S2.2 run artifacts expose detector cap accounting

Extended the shared S2.2 cap-policy discipline from review queues into registry detector run
artifacts. Every run artifact now carries a `capAccounting` block with cap mode, production cap,
run cap, qualifying candidate count, capped-out count, and capped-out distribution by borough prefix
and route. Global caps use the shared score-rank helper; persistent speed uses per-route cap
accounting. Synthetic verification covers the known observed-reliability 100-vs-220 no-write probe:
220 qualifying route candidates under a high run cap, 100 within the production cap, 120 capped out
and visible by borough/route in the artifact. Source-gap and delay-concentration remain explicitly
`not_capped` until their detector thresholds expose candidate-limit policies.

## [2026-06-11] infra | Track B S1.1 readiness now derives from detector input resolvers

Closed the current-base version of `backend-goal-finish-detectors.md` S1.1 on
`codex/track-b-resolver-readiness`: deleted the standalone
`detector-runs/feature-resolver-support.ts` satisfaction map and moved support accounting into
`detector-input-assembly.ts`, where resolver support is derived from registered artifact resolvers,
local-row loaders, and the two quality-carried feature-quality grains. The pipeline `findings
run-detector` path now passes assembly-produced `featureContracts` into `runRegistryDetectorStudy`
instead of letting detector execution recompute readiness from a separate map; direct test callers
retain the same fallback contract calculation. Added an assembly guard test proving every kernel
feature contract has a supported resolver path or an explicit quality-carried status. Verification:
`bun --filter @bp/applied-research typecheck`; `bun --filter @bp/pipeline-v2 typecheck`;
`bun --filter @bp/applied-research test feature-resolver-support detector-study
detector-run-artifact` (377 pass / 0 fail); `bun --filter @bp/pipeline-v2 test
commands/findings/run-detector` (474 pass / 0 fail).

## [2026-06-11] analysis | A3 311 curb-friction agreement artifact closes the evidence loop

Closed master-plan §3 A3 verification with a real 52-row hand-check artifact at
`data/artifacts/context-events/311-curb-friction-taxonomy-agreement.json` (ignored data artifact;
force-add when packaging the A3 evidence bundle). The packet covers recent current 311 rows:
51 from March 2026 and one February 2026 no-geocode row included to exercise the non-evaluable
join path. Validation resolved all 52 rows back to raw current 311 captures, matched the
deterministic complaint taxonomy, and checked segment-route join confidence against fanout
thresholds. Result: 52/52 category agreement (100%); 42/42 evaluable join-confidence agreement
(100%); 10 joins were not evaluable because the row had no `physical_id` or no local route-LION
match. Disagreement types: none observed in this sample. Rule verdict: no taxonomy or
join-confidence rule tweaks needed before the A3 PR; keep low/fanout-heavy joins as weak
associational context.

## [2026-06-10] engineering | Track A1: native segment-speed cell grain preserved, route-month proven as a projection

Master-plan §3 A1. Audit premise was partially stale: `local_route_segment_speed` already held
native grain (17.47M rows, 385 routes, 2023-04→2026-03); the real losses were (a) the adapter's
`hasUsableTimepointSegment` filter silently dropping source rows lacking next-timepoint metadata
(12 routes affected — Q7/Q19/Q37/Q47/Q60/Q63/Q64/Q66/Q74/Q100/Q104/Q109, 148 route-months), and
(b) `local_route_month_trend` speeds coming from an independent server-side Socrata aggregation.
Landed: `local_route_segment_speed_cell` (nullable timepoint metadata, keyed
route_id×month×cell_rank — the plan's natural cell key is NOT unique in the source: verified
duplicate rows with identical geometry but different trip counts, likely service-pattern
variants), unfiltered `normalizeSegmentSpeedCellRows`, the `ingest route-segment-speeds` command
now writes both tables from one fetch, and `build route-month-speed-golden-diff` projects
route-month speed aggregates from cells (count/sum/`Math.round(avg*1e4)/1e4`) and byte-compares
against the trend table. Backfill: 17.27M rows seeded from the legacy table for route-months whose
counts already matched (proof nothing was dropped), 148 route-months re-fetched live; final
17,494,571 cells, ~5 GB. Golden diff on the real DB: 12,075/12,075 rows byte-identical, 0
mismatches. Artifacts: `data/artifacts/a1-segment-speed-cell-probe.json` (live Q60 2025-03 probe:
Socrata 2,681 rows = local cells; legacy filter drops 197) and
`data/artifacts/route-month-speed-golden-diff.json`. Follow-up landed same
slice: `ingest route-trends` now derives its speed aggregates from the local cell table instead of
a second Socrata server-side aggregation (ridership fetch unchanged), reporting
`monthsWithoutCellSpeedCoverage` for window months with no cell rows — verified byte-identical
against the production trend table on a temp DB (180/180 route-months across 5 routes, full
history).

## [2026-06-10] engineering | Frontend §8.1 registry + §4.1/§4.3 structural redesign land on the cutover floor

First consumers of the C1–C4 contract. §8.1: `apps/web/src/components/route/section-registry.ts`
maps each route-detail tab to its backing capability surfaces; the manifest now decides
render / honest-empty (`HonestEmptySection`, the §8.2 four-state vocabulary with `checked_clean`
styled affirmatively) / hidden (`not_applicable`); null capability keeps a render-everything
fallback; three-contrast-route policy tests in `test/shared/section-registry.test.ts`. §4.1:
`RouteJudgedKpiStrip` replaces the raw metric strip on the detail header — Condition with peer
framing (dossier `peerPercentile`), 6-month Trend with sparkline (`movement6mPct`, previously
unconsumed), Reliability as an honest-building column off the capability surface, Riders movement,
Treatment posture — each KPI carries its own `dataAsOf` and clicks through to its tab. §4.3: tabs
are question-shaped — Where & when / Treatments & history (absorbs Interventions + Timeline, whose
cross-link banner was deleted) / Evidence (absorbs Data notes); compare follows the same tab
structure but keeps the raw strip. Deliberately deferred to the design-handoff cycle (§4.4): the
§4.2 verdict Overview, story strip, mini-map, Map tab (§6.1), and any Reliability tab until the
surface leaves `building`.

## [2026-06-10] engineering | Hard-cutover C4: one freshness vocabulary; generatedAt leaves the render paths

Executed `docs/research/hard-cutover-dossier-contract.md` §3-C4, completing the cutover plan
(C0–C4 all landed 2026-06-10). One shared `DataAsOf` component (`apps/web/src/components/DataAsOf.tsx`)
renders `dataAsOf` + a freshness dot wherever a data block declares its clock; freshness comes from
a single domain helper `freshnessForDataAsOf` (`route-capability.ts`, unit-tested), which the C1
manifest builder in @bp/applied-research now also uses — pipeline and UI cannot diverge on the
current/recent/stale/unknown vocabulary. Replaced render paths: route DataNotes (generatedAt
fallback removed; honest "unknown" freshness instead), compare DataNotes ("Generated" row →
Freshness row from the dossier), routes-home rankings line. `grep -rn generatedAt apps/web/src`
shows no user-facing render hits — the remaining references are the brief publish-candidate export
panel (artifact metadata, explicitly kept per the plan) and a code comment. Visual QA in a live
browser was NOT performed this slice (would need local R2 re-seeded with the v2 artifacts);
contract coverage is via tests + build.

## [2026-06-10] engineering | Hard-cutover C3: network surfaces de-monthed; env months stop shaping public responses

Executed `docs/research/hard-cutover-dossier-contract.md` §3-C3. All studio public read paths now
resolve their months through one internal resolver (`resolveServingMonths` in read-handlers →
`findLatestStudioServingMonth` + new `findLatestSpeedTrendMonth` in @bp/db); `BASELINE_MONTH` /
`LAST_BUILT_SPEED_MONTH` were removed from the `StudioReadEnv` Pick entirely, so the read layer
cannot read them (grep-verifiable). Index2/sections responses keep `baselineMonth` as resolver-fed
provenance and add a user-facing `dataAsOf`; search/compare/findings responses declare
`dataAsOf` (nullable, defaulted for older projections); the snapshot diagnostics months are now
data-derived. `public-api.ts`'s explicit `?month` query param contract is intentionally out of
scope (month is caller-chosen there, not env-shaped).

§16-D3 movement baseline: route cards (`StudioRoute`) and every section row now carry
`movement6mPct` + `context12mPct` (% speed change vs exactly 6/12 months before the latest speed
month), computed in the @bp/db index grouping for D1-backed reads and in `_release-routes.ts`
(`routeSpeedMovementPct`) for release-built cards; Tier 2 evidence-ready rows carry honest nulls
(bundles have no route-month trend). `routes-home` shows "Data as of {dataAsOf}". UI consumption
of the movement fields lands with the §4 redesign; D4 (ladder deletion) was noted but is not this
slice — ladder is de-monthed, not deleted.

## [2026-06-10] engineering | Hard-cutover C2: route detail becomes the de-monthed evidence dossier

Executed `docs/research/hard-cutover-dossier-contract.md` §3-C2. `StudioRouteDetailResponse` is now
schemaVersion 2: identity + segments + the embedded per-route `capability` row (C1 manifest) +
a pipeline-built `dossier` summary — 36-month speed/ridership sparkline vectors with current value,
6-month movement, and cross-route peer percentile; worst segment with consecutive-month persistence
(derived from the per-route speed-history artifacts); treatment posture with latest intervention
events; per-block `dataAsOf`. One Tier-1 fetch renders the page: the route detail loader dropped its
separate `/history` fetch (the `/history` endpoint survives for compare), and a 60 KB-gzip payload
budget is asserted in a studio-api test (real worst case ~5.3 KB gz).

Pattern mirrors C1: pure builder `packages/applied-research/.../build-route-dossier-summary.ts`
(peer percentiles computed across the row set) → joined in `export d1`
(`tools/pipeline-v2/.../export/route-dossier-summaries.ts`) → written to
`studio/v2/routes/{slug}/dossier.json` (381 routes regenerated from the local DB) → Worker embeds it
plus the capability row in `read-handlers.ts`. `env.BASELINE_MONTH` is gone from the detail path:
the partial D1 fallback resolves its month internally via the new
`findLatestStudioServingMonth` (@bp/db, max route_brief_summary month). The 12 local rich
`routes/{slug}/index.json` projections were migrated in place to v2; `buildStudioRouteProjection`
emits v2 with null capability/dossier (Worker joins at read time). Index/ladder/history/sections
still read env months — that is C3. apps/web sections (Overview/Riders/Timeline/DataNotes) consume
`data.dossier` series via new `dossier*` helpers in `route-derived.ts`; DataNotes now shows
`dataAsOf` ("latest input month") instead of leading with `generatedAt` (full sweep is C4).

## [2026-06-10] engineering | Hard-cutover C1: route_capability_manifest replaces supportLevel/surfaceFlags

Executed `docs/research/hard-cutover-dossier-contract.md` §3-C1. Deleted the orphaned per-route
`supportLevel` (4-tier enum) + `surfaceFlags` (19-surface struct, ~13 dead constants) that were
computed in the Worker, and replaced them with a pipeline-built `route_capability_manifest`: per
surface a 7-state machine (`ready/partial/building/insufficient_data/checked_clean/not_applicable/
blocked`) + reason + depth (months, grains) + `dataAsOf` + freshness. Eight KPI-aligned surfaces
(`condition`, `trend`, `speedHistory`, `reliability`, `ridership`, `treatment`, `scheduleBaseline`,
`detectorFindings`) keyed as a string map so S2.4 + Tier 2 coverage plug in later with no reshape.

Pattern mirrors the detector readiness manifest: pure builder
`packages/applied-research/src/evaluation/build-route-capability-manifest.ts` → built during
`export d1` from `readLocalD1Inputs` (`tools/pipeline-v2/.../export/route-capability-manifest.ts`)
→ written to `studio/v2/routes/route-capability-manifest.json` → Worker reads it by key
(`@bp/domain` `RouteCapabilityManifestForIndexSchema`, `.passthrough()`) and joins per-route in
`read-handlers.ts`. The route-level `overallState` rollup maps exactly onto the legacy support
tiers, so `summaryReady/artifactReady/evidenceReady` snapshot counts re-derive without the enum.
Committed fixture: 381 routes (159 with detector coverage → 36 `ready` + 123 `checked_clean`;
reliability honestly `building` for all until Track B calibrates it). Reliability/ridership go
`blocked` from `route_month_source_status`; speed/schedule have no source there. `env.BASELINE_MONTH`
still shapes the index list (C3), but per-surface freshness now has its own clock.

## [2026-06-10] calibration | S2.3 feature-field audit (spatialConfidence + lane-type typed field)

Two honest-field fixes, both DB-verified behavior-neutral.

Part 1 — spatialConfidence inert gate. The segment_daypart resolver hard-coded `spatialConfidence: 1`
(rows are pre-joined to GTFS timepoint stop pairs, so there is no real spatial-join confidence), which
made speed_pace_hotspot's `minSpatialConfidence` gate and the readiness `geometry_unconfirmed`
promotion blocker inert — claiming a verification that never happened. Marked unsupported: resolver
now emits `spatialConfidence: null`; removed the detector skip gate + `minSpatialConfidence` threshold
+ the readiness promotion blocker + `spatialConfidence` from the segment_daypart contract
requiredFields. DB eval: speed-pace survival 26/27, suppress leak 0, emitted 1,134 — identical to S2.1
(the gate never fired at 1.0, so removal is neutral).

Part 2 — bus-lane vs Enhanced-Bus-Stop split as a typed field. Lane type was re-derived gate-side by
two inconsistent string-parsers (resolver exact-match on `nyc_dot_bus_lane_type:` refs; mismatch
detector substring + an incomplete exclusion list). Added typed `laneTypes` to
`RouteSegmentTreatmentSummaryFeature` (+ materializer row + contract requiredFields) and one shared
authority `isEnhancedBusStopOnlyLaneTypes()` in `@bp/analytics/features`; resolver gate and mismatch
detector now both call it. The feature builder prefers the materializer's typed field and falls back to
parsing `nyc_dot_bus_lane_type:` sourceRefs for artifacts materialized before the field existed (so no
regeneration needed; forward+backward compatible). DB verify: gap 30 candidates unchanged; mismatch
EBS classification diverged on 0 / 4,134 segments → identical detector output; reviewed-gold eval
(primary 6/6 survive, suppress 0/9 emitted) preserved. Verify: analytics 179/0, applied-research
360/0, domain 68/0, pipeline-v2 461/0, typecheck clean, biome clean, `git diff --check` clean.

(Investigation note: a `git stash`/`git checkout HEAD` baseline run misleadingly showed mismatch 69 vs
28 — that 69 was the older *committed* detector, before the working tree's uncommitted
worsening-history gates; the in-detector diverge=0 instrumentation proved my change neutral.)

## [2026-06-10] calibration | S2.1 terminal/layover flag as a feature field + speed-pace gate

Promoted terminal suppression from readiness-only into the speed_pace_hotspot detector gate. Added
`isTerminal` to `SegmentDaypartFeature` + `RouteSegmentMonthFeature` (`@bp/analytics/features`) and to
the `segment_daypart` / `route_segment_month` contract `requiredFields`; derived it in
`segment-daypart-speed.ts` from `stop_order` vs the per-(route, month, direction) max
(`stopOrder <= 1 || stopOrder >= max`, matching the established `segment-month-panel.ts` rule);
`speed-pace-hotspot.ts` `skipReason` now returns `terminal_or_layover` for terminal segments. Updated
fixtures (feature-contracts, r3-detectors +terminal gate test, speed-pace-score-vectors,
detector-study, pipeline-v2 run-detector) to realistic multi-segment shapes so the tested slow segment
is interior.

DB eval (470,462 2026-03 rows → resolver → detector → review-queue → reviewed-gold eval against the v2
labels): **reviewed primary survival 26/27 (held); suppress leakage 1 → 0** — the `QM11:E:1`
express-terminal leak the v2 NOTE flagged ("detector still has no terminal flag to gate on") is now
`skipped_failed_join`/`emitted=false`. Emitted 1,396 → 1,134; the one dropped primary (`M103:S:24`
midday) is the pre-existing per-route-cap tail-clip, not a terminal-gate regression. All 27 primaries
are interior (closest `B46:S:48` vs dir-max 50). Record:
`data/artifacts/detector-calibration-speed-pace-v3-terminal-gate/` (evaluation.json + summary.json +
NOTE.md). Verify: analytics 180/0, applied-research 360/0, pipeline-v2 461/0, typecheck clean, biome
clean, `git diff --check` clean. Unblocks delay_concentration (S2.1 prerequisite now met).

## [2026-06-10] infra | S5.4 official_context evidence-role split

Built Phase 5 S5.4 — split agency-record evidence out of the generic `context` evidence role. Added
`"official_context"` to `FindingEvidenceRoleSchema` (`@bp/domain` findings) with a description noting
it's the agency-record evidence the publication wording depends on (matters most for the Wave 3
intervention family). Threaded a distinct `officialContext` partition through both `.strict()` packet
objects (`FindingReviewPacket.evidence` + `.evidenceObjects`) and the packet builder `roleGroups` /
`evidenceObjects` in `@bp/applied-research/review-packets/artifacts.ts`. Updated the domain schema
fixture (two literal packet objects) and extended the treatment-scope packet test to assert an
`official_context` link lands in `officialContext`, not `context`. Generic associational `context`
stays a separate bucket; existing emitters are unchanged (no re-calibration). Verify: domain 68/0,
applied-research 360/0, typecheck domain/applied-research/studio-api clean, biome clean,
`git diff --check` clean. Phase 5 (S5.1–S5.4) complete.

## [2026-06-10] infra | S5.2 confidence decomposition (component fields, single published label)

Built Phase 5 S5.2 — `buildConfidenceDecomposition` + `summarizeConfidenceComponentCompleteness` in
`@bp/applied-research/evaluation` (`confidence-decomposition.ts`). Decomposes confidence into the seven
independent component axes (`source_sufficiency`, `join_confidence`, `temporal_alignment`,
`metric_stability`, `peer_context`, `counterfactual_strength`, `review_readiness`): a family supplies
the components it can support and omits the rest (recorded `null`). These are review-packet fields; the
collapse to a single coarse `publishedLabel` (insufficient/low/medium/high from the mean of present
components) keeps the public surface single-valued. The evaluator summary reports per-component
populate-share + mean component completeness as the maturity signal. Pure; clamps 0..1; non-finite
treated as absent. 4 fixture tests. Verify: applied-research 360/0, typecheck clean, biome clean,
`git diff --check` clean. Remaining in the plan: Phase 5 S5.4 (official_context evidence-role split);
Phase 2 S2.1/S2.3 stay DB-eval-gated.

## [2026-06-10] infra | S5.1 decomposed review-priority scoring (severity != confidence)

Built Phase 5 S5.1 — `buildReviewPriorityScore` + `compareByReviewPriority` in
`@bp/applied-research/evaluation`. Splits the single review-queue sort key into review-packet fields:
`severityScore` (severity map), `evidenceScore` (source/sample sufficiency = the confidence axis),
`specificityScore` (scope narrowness), `persistenceScore` (multi-period support), and a weighted
`reviewPriorityScore` (default weights severity .4 / evidence .25 / specificity .2 / persistence .15).
Severity and confidence are independent inputs — a high-severity/low-evidence candidate sorts
differently from a low-severity/high-evidence one — and the comparator tie-breaks on the decomposed
fields so queue order is explainable, not a single opaque score. Public UI keeps the simple
severity/confidence pair; these are reviewer fields. Pure + fixture-tested
(`test/review-priority-score.test.ts`, 3 tests: decomposition, severity≠confidence reordering,
clamping/weight validation). Verify: applied-research 356/0 + typecheck clean; git diff --check clean.
Remaining Phase 5: S5.2 (confidence decomposition component fields), S5.4 (official_context
evidence-role split).

## [2026-06-10] infra | S5.3 evidence-packet completeness eval metric

Built Phase 5 S5.3 — `buildEvidencePacketCompleteness` in `@bp/applied-research/evaluation`. Reports,
per detector family + overall, the share of emitted candidates carrying primary / counter-evidence /
missing-evidence links, a `matureShare` (primary + counter-evidence), and a `bareHitCount`
(primary-only, no counter and no missing-evidence section — "just a hit, not mature"). Thresholds are
reported in the artifact, **not enforced silently** — the metric surfaces packet quality; promotion
gating stays in the reviewed-gold/readiness layer. Pure + fixture-tested
(`test/evidence-packet-completeness.test.ts`, 2 tests incl. empty-input no-divide-by-zero). Verify:
applied-research 353/0 + typecheck clean; git diff --check clean. Remaining Phase 5: S5.1
(severity≠confidence scoring decomposition), S5.2 (confidence decomposition fields), S5.4
(official_context evidence-role split).

## [2026-06-10] infra | S2.4 feature-grain materialization coverage

Built Phase 2 S2.4 (per feature-grain × release-month materialization coverage — distinct from the
existing R2-surface `analytics-materialization-coverage`). Added
`buildFeatureGrainMaterializationCoverage` in `@bp/applied-research/evaluation`: per grain,
{scopesMaterialized, fleetUniverse, coverageShare, status} where **an unknown denominator can never
read as `complete`** (capped at `partial`) so a sparse grain cannot masquerade as fully covered. Pure
+ fixture-tested (`test/feature-grain-materialization-coverage.test.ts`). Generated the real 2026-03
artifact at `data/artifacts/materialization-coverage/feature-grain-materialization-coverage-2026-03.json`
(+ NOTE) from this session's no-write `featureCount`s and the ~381-route source_gap fleet: 8 grains,
1 complete (route_reliability_month 381/381), 7 partial (3 route-scoped ~0.96; 5 with unenumerated
universes capped at partial, incl. stop_direction_hour 650,264 — its fleet-readiness claims must cite
this gap). This is the precondition for honest stop-hour fleet-readiness and the agreement-audit
baseline for the source_gap coverage authority (S4.3). Verify: applied-research 351/0 + typecheck
clean; git diff --check clean. Follow-up: a DB-counting pipeline-v2 command + per-grain fleet-universe
enumeration. Remaining Phase 2: S2.1 + S2.3 (both gated on the DB-backed detector eval). Remaining:
Phase 5 S5.1-S5.4.

## [2026-06-10] infra | S4.3 consolidated calibration register — Phase 4 complete

Built Phase 4 S4.3 (consolidated calibration register), which closes Phase 4 (S4.1–S4.4 all done).
Added `buildDetectorCalibrationRegister` in `@bp/applied-research/evaluation` — one queryable record
per detector id+version: calibration disposition (machinery_built / internal_only / coverage_authority
/ inventory_blocked / superseded / deferred / pending), gold/NOTE artifact paths, reviewed-label
count, and false-positive root-cause tags. Pure + fixture-tested
(`test/detector-calibration-register.test.ts`). Generated the real register at
`data/artifacts/detector-calibration-register.json` (+ NOTE) from the registry + existing
`detector-calibration-*` dirs **without hand-editing them**: 21 detectors, 0 pending —
machinery_built 15, internal_only 2 (positive_deviance, intervention_event_study), coverage_authority
1 (source_gap), inventory_blocked 1 (rider_weighted), superseded 1 (persistent_speed_hotspot),
deferred 1 (delay_concentration); retirementStatus active 18 / deprecated 1 / experimental 2.
`reviewedLabelCount` is 0 until human review populates the gold sets (the schema carries them).
Verify: applied-research 349/0; git diff --check clean. **Phase 4 governance complete.** Remaining:
Phase 2 S2.1/S2.3/S2.4, Phase 5 S5.1–S5.4.

## [2026-06-10] infra | S4.4 score-vector novelty stats (Spearman + spread)

Added Phase 4 S4.4 pure helpers to `packages/analytics/src/calibration/score-vectors.ts`:
`spearmanRankCorrelation` (average-rank ties; null on <2 points or zero variance),
`scoreSpreadStats` (min/max/range/mean/median/stdDev/p25/p75/iqr), and `detectorScoreNovelty` —
for each peer, the Spearman rank correlation + flagged-set Jaccard over shared scopes, yielding
`maxAbsRankCorrelation` and `noveltyScore = 1 - max|rho|` (1.0 = no comparable peer / fully novel
ranking). This answers the ideal-doc/audit ask for rank-correlation novelty stats: a detector that
re-ranks scopes the way an existing one does is redundant; low correlation = new information. Exported
from `@bp/analytics/calibration`; focused unit tests in `test/score-vector-novelty.test.ts` (4 tests,
monotonic/reversed/ties/degenerate + redundant-vs-independent peer + disjoint-peer cases). Verify:
analytics 179/0 + typecheck clean; applied-research 347/0; git diff --check clean. Remaining Phase 4:
S4.3 (consolidated calibration register).

## [2026-06-10] decision | S4.2 lifecycle records + persistent_speed_hotspot supersession executed

Built Phase 4 S4.2 (lifecycle records) and executed the OD-2 supersession the maintainer approved
("persistent_speed_hotspot: supersede; execute via S4.2; no calibration machinery"). Added pure
record builders to `packages/analytics/src/calibration/detector-lifecycle.ts`:
`buildDetectorLifecycleRecord` (event kinds introduced/version_change/demoted/superseded/retired;
validates successor-id rules) + `buildDetectorLifecycleLog`, exported from `@bp/analytics/calibration`,
fixture-tested in `detector-lifecycle-record.test.ts` (3 tests). Executed the supersession:
(1) flipped `persistent_speed_hotspot` registry `retirementStatus` `active`→`deprecated` (superseded
by `speed_pace_hotspot` + `delay_concentration`); (2) persisted the machine-readable record at
`data/artifacts/detector-lifecycle/detector-lifecycle-log.json` (+ NOTE); (3) updated the catalog
Current Set + Maintenance Rule (`knowledge/wiki/analysis/detector_catalog.md`) to require a lifecycle
record on every retirementStatus change. Verify: analytics 175/0 + typecheck clean; applied-research
347/0; `bun run check:knowledge` passes; git diff --check clean. Follow-up: a dedicated fixture-backed
pipeline-v2 `findings lifecycle` command (this artifact was written via the pure builder). Remaining
Phase 4: S4.3 (consolidated calibration register), S4.4 (score-vector novelty stats).

## [2026-06-10] infra | S4.1 serving readiness gate enforced + tested

Closed today's named OPEN serving gap (Phase 4 S4.1). `buildRouteInsightsFromDetectorReadiness` in
`@bp/domain/studio/route-insights.ts` now filters both public and route-context refs through the
exported `STUDIO_ROUTE_INSIGHT_DETECTOR_IDS` allowlist before building insights — previously the
allowlist was exported but **unenforced** (unknown ids were only excluded implicitly via the
copy-map). Combined with the manifest schema (which already enum-constrains `bucket` to
`public_finding_candidate`/`route_context`), an uncalibrated/unknown detector id that lands in a
public bucket is now structurally excluded from public surfaces. Added S4.1 tests in
`packages/domain/test/studio-route-insights.test.ts`: (1) the allowlist is a subset of the
`@bp/domain` `KNOWN_DETECTOR_IDS` registry; (2) a synthetic violation (a fabricated uncalibrated
detector id in a public bucket) produces NO insight while an allowlisted detector still surfaces, and
every surfaced id is on the allowlist. Verify: `@bp/domain` test 68/0 + typecheck clean; `@bp/web`
typecheck clean; production-boundaries harness 15/0. S4.2 (lifecycle records, incl. the
persistent_speed_hotspot supersession), S4.3 (register), S4.4 (novelty stats) remain.

## [2026-06-10] infra | S2.5 deferred_not_in_scope coverage state

Added the missing silence state to the coverage vocabulary (Phase 2 S2.5). `FindingCoverageOutcomeSchema`
in `@bp/domain/findings` gains `deferred_not_in_scope` — a scope the detector intentionally does not
apply to (e.g. EWT on a low-frequency route), kept distinct from `clean_no_hit` (detector applied,
found nothing) so intentionally-not-applicable scopes stop blending into clean no-hits. Additive: no
exhaustive switch on the outcome enum exists (the one `switch(outcome)` is on upload results, not
coverage), so all consumers count by string equality. Made the state observable in the run-artifact
`outputSummary` (`deferredNotInScopeCount`, so silent gaps cannot hide) and added an S2.5 test in
`detector-run-artifact.test.ts`. Verify: domain + analytics + applied-research + studio-api typecheck
clean; analytics 172/0; applied-research 347/0. Detectors emitting the state for specific
not-applicable scopes is the follow-up (per-detector, label-backed).

## [2026-06-10] evaluation | Source gap disposition (Wave 4 #15, coverage authority — no machinery)

Recorded the ADR-0018 disposition for `source_gap` under
`data/artifacts/detector-calibration-source-gap/NOTE.md`. Family adaptation = **coverage authority**:
`source_gap` emits a deterministic data-quality state per scope (admission gates on other detectors'
claims), so per the plan it has **no gold-set precision frame** and **no review-queue/reviewed-gold
machinery was built** (would misrepresent deterministic coverage states as a reviewable finding
population — same disposition shape as `rider_weighted_excess_wait`). Inventory: 381 emitted = 381
qualifying (exhaustive, no cap suppression); for March 2026 all 381 are `tsp_current_inventory_missing`
— the true, documented systemic TSP-inventory absence (Missing-Spaces "defer" decision), not false
positives. Calibration path = (1) agreement audit vs the S2.4 materialization artifact — **blocked on
S2.4 (Phase 2, not yet built)**; (2) wire its states as admission inputs to other detectors' readiness
(ideal-doc family-1). **This closes the per-detector disposition for all 15 product-facing detectors**
(11 with calibration machinery this session + the prior 4; source_gap + rider_weighted by coverage/
internal disposition; persistent_speed_hotspot dropped per Open Decision 2; delay_concentration the
only build still pending, gated on S2.1).

## [2026-06-10] evaluation | 311 service-request context slice (Wave 4 #14, associational context)

Built the ADR-0018 machinery for `service_request_context` (route grain, category context, standard
5-bucket vocab) under `data/artifacts/detector-calibration-service-request-context/`. Same
associational-context adaptation as permit (`primary_finding` rare by design; eval lens is leakage
INTO findings via `findingsLeakageCount`). Inventory: 380 routes, **27 emitted, 27 qualifying → no cap
suppression** (323 clean, 30 skipped); Manhattan-heavy. Review-queue stratifies `high_route_fanout`,
`low_match_weight`, and `thin_high_confidence_touches` (read from the `serviceRequestContext` in
coverage/evidence); tags cover the complaint-type allowlist, reporting bias, temporal misalignment,
and `not_a_causal_attribution`; borough-spread = fairness lens. Uses the S2.2 cap-policy helper.
Fixture-tested. applied-research 346/0. Wave 4 now 3 of 4 done (positive_deviance + permit + 311);
`source_gap` remains (coverage-authority adaptation), `rider_weighted` internal-only documented.

## [2026-06-10] evaluation | Permit-correlated slowdown slice (Wave 4 #13, associational context)

Built the ADR-0018 machinery for `permit_correlated_slowdown` (route grain, category context, standard
5-bucket vocab) under `data/artifacts/detector-calibration-permit-correlated-slowdown/`. Family
adaptation (associational context): `primary_finding` rare by design, so the eval lens is leakage INTO
findings (`findingsLeakageCount`, should stay ~0), not primary survival. Inventory: 380 routes, **28
emitted, 28 qualifying → no cap suppression** (322 clean, 30 skipped); Manhattan-heavy. Review-queue
stratifies the association risks — `high_route_fanout` (route-LION fanout, weak/non-specific) and
`low_match_weight` (weak permit-to-route join), read from the counter-evidence `permitContext`; tags
cover temporal misalignment, unrelated work type, and `not_a_causal_attribution`. Uses the S2.2
cap-policy helper. Fixture-tested. applied-research 344/0. Wave 4: positive_deviance + permit done;
service_request_context + source_gap remain (rider_weighted internal-only documented).

## [2026-06-10] evaluation | Intervention event study slice (Wave 3 #12, candidate-causal internal-only)

Built the ADR-0018 machinery for `intervention_event_study` under
`data/artifacts/detector-calibration-intervention-event-study/` — **completes Wave 3**. Family
adaptation (candidate-causal): internal/methodology-review-only vocabulary
(`methodology_review_candidate` / `associational_context` / `needs_more_evidence` / `suppress`); the
readiness projection structurally cannot reach a public bucket (review_queue + suppressed only) and
the eval carries `publicLeakageCount: 0` — effect language never reaches a public surface without
human methodology approval. Inventory: 100 emitted at the cap, **236 qualifying → 136 cap-suppressed
(57.6%)** (real cap bias), borough-diverse; 505 skipped. Review-queue stratifies the methodology
gates (`gate_pass`, `pretrend_or_placebo_risk`, `method_divergence`) read from the evidence/coverage
`gateSummary`, plus rank-based cap-suppressed + borough controls; `emittedByGateStatus` summary; uses
the S2.2 cap-policy helper. Calibration = labeling panel quality, not effect truth. Fixture-tested.
applied-research 342/0. **Wave 3 complete (underperformance + gap + event_study).**

## [2026-06-10] evaluation | Intervention gap calibration slice (Wave 3 #11)

Built the ADR-0018 machinery for `intervention_gap` (route grain, standard 5-bucket vocab) under
`data/artifacts/detector-calibration-intervention-gap/`. Inventory: 381 routes, **8 emitted, 8
qualifying → no cap suppression** (342 clean, 31 skipped); borough-spread emitted set. The claim is a
scope-review candidate only as honest as the treatment inventory, so the queue forces the weaker
`thin_source_gap` evidence class into review (vs `absent`), records `emittedByEvidenceStatus`, and
samples borough-spread controls as the pain-threshold fairness lens. Calibration tags make the
"missing date ≠ no intervention" honesty explicit (`not_proof_of_absence`,
`future_or_undated_treatment_possible`, `treatment_inventory_incomplete`). Uses the S2.2 cap-policy
helper. Fixture-tested. applied-research 340/0. Wave 3 now has 2 of 3 (underperformance + gap);
`intervention_event_study` (causal, readiness caps at review_queue) remains.

## [2026-06-10] evaluation | Intervention underperformance calibration slice (Wave 3 #10)

Built the ADR-0018 machinery for `intervention_underperformance` (route grain, standard 5-bucket
vocab) under `data/artifacts/detector-calibration-intervention-underperformance/` — first of the
Wave 3 intervention family (highest claim risk). Inventory: 381 routes, **28 emitted, 28 qualifying →
no cap suppression** (166 clean, 187 skipped); Manhattan-heavy. The deltas are descriptive
peer-adjusted comparisons, not causal estimates, so the queue stratifies `thin_comparison_peers`
(< 3 comparison routes) and `thin_treatment_evidence` (zero/undated treatment source refs —
"missing date ≠ no intervention"); calibration tags include route-change/window confound,
positive-comparisons-present, and the explicit "not a causal impact" label. Reviewers expected to land
most labels at route_context. Uses the S2.2 cap-policy helper. Fixture-tested. applied-research 338/0.

## [2026-06-10] evaluation | Multi-month speed peer calibration slice (Wave 2 #6)

Built the ADR-0018 machinery for `multi_month_speed_peer` (route grain, standard 5-bucket vocab)
under `data/artifacts/detector-calibration-multi-month-speed-peer/`. Inventory: 367 routes,
**8 emitted, 8 qualifying at the high limit → no cap suppression** (337 clean, 22 skipped);
Manhattan-heavy emitted set. Dominant risk is peer-group transparency for the rankings surface, so
the queue stratifies `fallback_peers` (non-strong peer method) and `thin_months` (< 6 supported
months) alongside the standard strata; `hasStrongPeerGroup` derived from emitted peer-group methods;
uses the S2.2 cap-policy helper. Calibration tags cover reciprocal-metric (mph vs pace) artifacts,
seasonal/service-pattern confounds, and the "matched peers are not a causal control" caveat.
Full-census review of the 8 recommended. Fixture-tested. applied-research 336/0. This completes
Wave 2 calibration coverage except the supersession-decision `persistent_speed_hotspot` (dropped, Open
Decision 2) and `delay_concentration` (Wave 1, deferred to S2.1).

## [2026-06-10] evaluation | Degradation trend calibration slice (Wave 2 #5)

Built the ADR-0018 machinery for `degradation_trend` (route_metric_history grain, route/segment
scope, standard 5-bucket vocab) under `data/artifacts/detector-calibration-degradation-trend/`.
Inventory: 367 scopes, **6 emitted, 6 qualifying at the high limit → no cap suppression** (only 6 of
348 supported scopes clear robust-z ≥ 3 + positive slope; 341 clean, 20 skipped). Dominant review
risk is history confidence (thin history / short prior baseline / route-version breaks / seasonality),
not the cap — recommend a full-census review of the 6 plus stratified controls. Review-queue strata:
top_score, near_threshold, thin_history, short_baseline, segment_scope, borough_spread,
cap_suppressed_control (rank-based, empty this month), clean/skipped controls; uses the S2.2
cap-policy helper. Fixture-tested review-queue + reviewed-gold. applied-research 334/0.

## [2026-06-10] note | S2.1 (terminal flag) attempted, deferred with findings

Attempted Phase 2 S2.1 (terminal/layover flag as a feature field). Found it is not a clean
single-slice change: the kernel `RouteSegmentMonthFeature` type is not actually consumed by the
delay_concentration/persistent_speed detector path (those use divergent input shapes built in
`feature-resolvers/detector-family-features.ts` + `treatment-detector-inputs.ts`), and the
gate-promotion half's required verification is the DB-backed speed-pace 26/27 eval, which is blocked
on the same full-output review-queue-writer gap noted across the reliability slices. The terminal
heuristic today lives in `evaluation/speed-pace-review-queue.ts` (`terminalPosition` parses stop
sequence from `segmentId`). Deferred rather than ship an unverified change to a calibrated detector;
needs its own slice once the full-output eval writer exists. Proceeded with verifiable Wave 2 work
instead (degradation_trend).

## [2026-06-10] infra | S1.1 seam closure — hand-rolled satisfaction map deleted

Completed Phase 1 (the seam is now fully closed). Deleted the hand-rolled
`featureContractSupportReason()` grain→prose switch in
`packages/applied-research/src/detector-runs/detector-study.ts` (≈110 lines, 18 cases). Satisfaction
now derives from a single source of truth keyed by the kernel contract's `resolverId`:
`detector-runs/feature-resolver-support.ts` records which resolvers the applied-research layer
implements (artifact resolvers in detector-input-assembly + local-db loaders) and the two
quality-carried grains (`embedded.feature_quality.v1`=feed_health, `sqlite.source_coverage.v1`=
source_coverage). `detectorStudyFeatureContractSatisfaction` consults it via `featureResolverSupport`.
A new guard test (`feature-resolver-support.test.ts`) asserts every kernel `listFeatureContracts()`
resolverId is covered (no declared grain falls through to `unsupported`), so a future grain cannot
ship reporting `resolved` without a resolver registered here — the drift the prose switch invited.
Per-grain **statuses unchanged** (the existing detector-study/run-artifact/run-detector tests assert
status only; no golden fixture pinned the prose reasons, which are now uniform/derived). Removed 15
now-unused grain-constant imports. applied-research **332 pass / 0 fail**, pipeline-v2 **461 / 0**,
typecheck clean. (The `runResolvedDetectorStudy` fake-resolver indirection that carries pre-assembled
branch input through the runner port remains — fully collapsing it is the larger A2/A3 work, not
required to delete the satisfaction map.)

## [2026-06-10] infra | Phase 0 + S1.2 seam closure (verification floor + pipeline-v2 boundary)

Closed Phase 0 and Phase 1 S1.2 from `backend-goal-finish-detectors.md`.

- **S0.1**: the 5 cwd-dependent pipeline-v2 boundary tests (`brief/map/evaluation artifacts`,
  `check/route-speed-availability`, `studio/route-speed-histories`) read command-source paths
  relative to cwd, so they failed under `bun --filter` (package cwd) and passed only from repo root.
  Wrapped each path in `fromRepoRoot()` (the existing cwd-independent helper in
  `tools/pipeline-v2/src/lib/paths.ts`, already used by the passing express-bus-capacity test).
  `bun --filter @bp/pipeline-v2 test` now **461 pass / 0 fail** (was 456/5); the 5 also pass from
  repo root.
- **S0.2**: fixed the stale verification default — CLAUDE.md said `bun --filter @bp/pipeline test`
  (no such package; only `@bp/pipeline-v2` exists) → `@bp/pipeline-v2`. Also fixed the one-line
  `knowledge/AGENTS.md` "Pipeline package" claim. Root scripts + the `pipeline` alias already used
  `@bp/pipeline-v2`. The wiki `cli_commands.md` v1-command rewrite is separately-tracked doc-debt
  and `log.md` is the historical record — both left as-is.
- **S1.2**: closed the last direct kernel import from pipeline-v2
  (`commands/build/treatment-event-panel.ts` imported `INTERVENTION_EVENT_STUDY_DETECTOR_ID` from
  `@bp/analytics/detectors`). Repointed to source the id from the `@bp/domain` `KNOWN_DETECTOR_IDS`
  allowlist (compile-error if the id is ever dropped; zero new API). Extended
  `tests/harness/production-boundaries.test.ts` with a test that scans `tools/pipeline-v2/src` for
  `@bp/analytics` import statements (codemode prose strings + the packages/analytics symlink are not
  imports and are intentionally allowed). Demonstrated red on a planted import, green after removal.

Remaining Phase 1: **S1.1** (delete the hand-rolled `featureContractSupportReason` prose switch +
thin fake resolver in `detector-study.ts`; derive grain satisfaction from the real resolver wiring
through the kernel runner port). Sized but deferred to its own slice: the kernel `FEATURE_CONTRACTS`
resolverIds do not line up 1:1 with applied-research `FEATURE_RESOLVERS`, and static
`detectorStudyFeatureContractSatisfaction` tests assert specific per-grain statuses with no rows — so
it needs care to preserve the golden run-artifact invariant.

## [2026-06-10] decision | Three open decisions resolved (GTFS-RT archival, supersession, KPIs)

Maintainer resolved three plan-blocking decisions, recorded inline in the plan docs:

1. **Master-plan OD-1 (continuous GTFS-RT collection): deferred — rely on the archival source.**
   The Bus Observatory `busobservatory-lake` S3 archive captures the feed (March 2026 verified
   complete: 32 Parquet files, 3.59 GB, `full_month_candidate`), so the "every deferred month is
   unrecoverable" urgency no longer holds. A8 is effectively answered; remaining work is row-level
   QA + a `third_party_recovered` importer. Priority goes to finishing the other tracks.
2. **Finish-detectors OD-2 (`persistent_speed_hotspot`): supersede.** Execute via the S4.2
   lifecycle-record slice; no calibration machinery will be built for it.
3. **Frontend O3 (header KPI set): approved as specified** (Condition / Trend / Reliability /
   Riders / Treatment posture). Hard-cutover slice C2 (dossier schema) is unblocked.

## [2026-06-10] infra | S2.2 shared cap-policy helper extracted

Added `packages/applied-research/src/evaluation/cap-policy.ts` (Phase 2 S2.2 from
`backend-goal-finish-detectors.md`): the three primitives every per-detector review-queue had been
re-deriving — `boroughPrefix()`, `rankByDetectorScore()` (detector-scope identity → 1-based rank for
rank-based cap-suppression detection), and a generic `roundRobinByBorough<T>()` for borough-spread
control sampling. Unit-tested in `test/cap-policy.test.ts`. Refactored the three new Wave-2/Wave-4
review-queues (`travel_time_variability`, `schedule_mismatch`, `positive_deviance`) to import these
instead of copying them. Detector-specific qualification predicates stay per-detector. The prior
shipped slices (`headway_reliability_ewt`, `bunching_hotspots`, `observed_reliability`) still carry
local copies — migrating them is a follow-up. The full run-artifact cap-accounting half of S2.2
(capped-out distribution recorded in every no-write run artifact, validated against the
observed_reliability 100-vs-220 probe) is still pending.

## [2026-06-10] evaluation | Positive deviance slice (Wave 4 inverted, internal-only)

Built the ADR-0018 machinery for `positive_deviance` under
`data/artifacts/detector-calibration-positive-deviance/` with the **Wave 4 family adaptation**:
inverted, internal-only vocabulary (`learning_candidate` / `watchlist` / `reviewer_only` /
`suppress`=false-deviant). The readiness projection structurally cannot reach a public bucket
(`review_queue` + `suppressed` only) and the evaluation carries a `publicLeakageCount: 0` invariant.
Inventory: 365 scopes, 48 emitted, 48 qualifying at the high limit → **no cap suppression**; 317
skipped (insufficient peers/periods/reciprocal-warning gates). Dominant review risk is peer
construction, not the cap. Fixture-tested review-queue + reviewed-gold.

## [2026-06-10] evaluation | Schedule mismatch calibration slice (Wave 2 #8)

Built the ADR-0018 machinery for `schedule_mismatch` (route-direction-daypart) under
`data/artifacts/detector-calibration-schedule-mismatch/`. Inventory: 2,537 cells, 100 emitted under
the default cap, **2,434 qualifying at the high limit → 2,334 cap-suppressed (95.9%)** — the most
cap-biased reliability detector so far; the top-100 sample is saturated at score 100 and
Brooklyn-skewed while the qualifying population spans every borough (Queens-heavy, 709). The queue
forces a `padding_review` stratum so the rarer `schedule_padding_review` reason class is reviewed
alongside `schedule_too_tight`; cap suppression is computed directly from coverage
(scheduled+observed+trips). Per the plan, expect readiness to cap at `route_context` until
route-version rules strengthen — a valid calibration outcome. Fixture-tested.

## [2026-06-10] evaluation | Travel-time variability calibration slice (Wave 2 #7)

Built the ADR-0018 machinery for `travel_time_variability` (route-direction-daypart) under
`data/artifacts/detector-calibration-travel-time-variability/`. Inventory: 2,537 cells, 100 emitted,
**144 qualifying at the high limit → 44 cap-suppressed (30.6%)**; top sample skews Brooklyn/Bronx
while the qualifying population is borough-diverse and Queens-heavy. Buffer index `(P95-P50)/P50`;
cap suppression computed directly from coverage. Strata include `incident_outlier_suspect` (extreme
buffer index = likely one-off incident inflating P95) and `service_pattern_caveat`. Fixture-tested.

## [2026-06-10] planning | Hard-cutover execution plan + planning-doc hierarchy

Added `docs/research/hard-cutover-dossier-contract.md`: the slice-level execution plan (C0–C4) for
the frontend goal's §16-D1 hard cutover — de-monthing the public contract per ADR 0017
(capability manifest → dossier response → de-monthed network surfaces → freshness doctrine), with
an explicit boundary of what monthly keying survives (source grains, release-keyed detector
output, publication gates). Its §0 records the planning-document hierarchy for the first time:
ADR 0017/0018 doctrine → `master-plan-product-questions.md` umbrella (Tracks A–G) → Track B =
`backend-goal-finish-detectors.md`, Tracks E/F consumer side = `frontend-goal-data-serving.md`.
Marked `backend-goal-seam-calibration.md` superseded (banner added): Phase A landed, Phase B
absorbed into finish-detectors Phase 3 waves. Ordering correction recorded: next Wave 1 detector
is `delay_concentration`, not the Wave 2 detectors.

## [2026-06-10] evaluation | Rider-weighted excess wait is coverage-blocked (inventory only)

Ran the ADR-0018 no-write inventory for `rider_weighted_excess_wait` (March 2026) under
`data/artifacts/detector-calibration-rider-weighted-excess-wait/`. The detector is **blocked on
ridership-proxy coverage**: of 650,264 stop-direction-hour cells only 50.6% carry a ridership proxy
and only 176 (0.027%) clear the combined EWT-quality + ridership-quality + boardings skip gates.
Emission is degenerate — 7 candidates, all on Q17, Saturday, hour 19. A high-limit probe
(`--candidate-limit 20000`) also emitted exactly 7, so there is **no cap suppression**; the binding
gate is the top-decile weighted-rider-minutes cutoff over a tiny evaluable set, plus ridership
starvation.

Per ADR-0018, no reviewed-gold/review-queue machinery was added (no real population/false-positive
class to label). Recommended state: hold at `needs_more_evidence` until APC/ridership-proxy coverage
improves; do not lower `minWeightedExcessWaitRiderMinutes`/`topPercentile`/ridership-quality gates to
manufacture a queue. Revisit after the base EWT detector is calibrated (rider-weighting is downstream
of EWT and inherits its coverage).

## [2026-06-10] evaluation | Bunching hotspots calibration inventory

Started the ADR-0018 loop for `bunching_hotspots` (March 2026) under
`data/artifacts/detector-calibration-bunching-hotspots/`. Stop-direction-hour grain: 650,264 cells,
14,628 ready, 100 emitted under the default cap, 646,333 skipped. A high-limit probe found 3,048
cells qualify, so the top-100 cap suppresses 2,948 (96.7%). Emitted top-100 over-represents Staten
Island (~48%) while the SI express family (SIM, 682 cells) and the Bronx (BX, 92) are absent/near
absent at the cap. Recorded as a finding, not fixed (no cap/threshold changes).

Added deterministic, fixture-tested applied-research machinery: `buildBunchingHotspotsReviewQueue()`
(strata incl. a dedicated `gap_dominant` class so the long-gap reason is reviewed alongside bunching,
plus cap-suppressed/borough-spread controls; cap suppression via score rank vs the production cap) and
reviewed-gold/evaluation/readiness builders with stop-direction-hour identity and both reason classes
in the calibration vocabulary. Inventory + machinery only; full-output queue writer still pending.

## [2026-06-10] evaluation | Headway reliability EWT calibration inventory

Started the ADR-0018 loop for `headway_reliability_ewt` (the next reliability-family slice after
`observed_reliability`) with a March 2026 no-write inventory under
`data/artifacts/detector-calibration-headway-reliability-ewt/`. The detector scores
stop-direction-hour cells: 650,264 cells, 14,628 ready, 100 emitted under the default cap, 648,506
skipped (mostly insufficient headways).

A high-limit cap probe (`--candidate-limit 20000`) found 1,698 cells qualify above the emission
threshold, so the default top-100 cap suppresses 1,598 (94.1%). The detector score saturates at 100
and is sorted by score only, so the cap fills with an input-order tie-break: **all 100 emitted
candidates are Brooklyn local routes**, while the 1,598 cap-suppressed cells span every other borough
(Queens 606, SI/SIM 291, Manhattan 118, Bronx/BXM 177, express families). Recorded as a finding, not
fixed in this slice (no cap/threshold changes).

Added deterministic, fixture-tested applied-research machinery:
`buildHeadwayReliabilityEwtReviewQueue()` (strata incl. cap-suppressed/borough-spread controls; cap
suppression derived from score rank vs the production cap because non-emitted coverage rows lack the
computed EWT/LoS metrics) and reviewed-gold/evaluation/readiness builders with stop-direction-hour
identity. Inventory + machinery only; not public-ready until the queue is stratified, labels reviewed,
and suppress leakage is zero. Full-output queue writer still pending (same gap as `observed_reliability`).

## [2026-06-09] evaluation | Observed reliability review queue stratification

Added a deterministic `buildObservedReliabilityReviewQueue()` builder in
`@bp/applied-research/evaluation` for ADR-0018 review-queue construction. The queue enriches
candidate/evidence/coverage rows into support-risk and control strata: top score, near threshold, low
GTFS-RT samples, weak scheduled-baseline support, weak BWA support, BWA conflict, borough spread,
cap-suppressed controls, clean controls, and skipped controls.

Ran a high-limit no-write cap probe for March 2026:
`observed_reliability` emitted 220 candidates with `--candidateLimit 1000` versus 100 under the
default cap, with the same 381 coverage rows and 39 skipped rows. This confirms the default top-100
cap suppresses 120 threshold-qualifying route-month rows; final reviewer queue generation should use
the full output and preserve cap-suppressed controls by borough/route-prefix spread.

## [2026-06-09] evaluation | Observed reliability calibration inventory

Started the ADR-0018 loop for `observed_reliability` with a March 2026 no-write run under
`data/artifacts/detector-calibration-observed-reliability/`. The detector resolved 381 route-month
features, emitted 100 candidates under the default cap, produced 381 coverage rows, and skipped 39
rows. This is inventory only; the sampled run artifact does not prove cap fairness or public
readiness.

Added deterministic applied-research scaffolding for observed-reliability reviewed-gold labels,
suppress-leakage/primary-survival evaluation, and readiness projection buckets. The next slice should
build the full stratified review queue, label emitted/skipped/clean-control strata, and require zero
suppress leakage before any serving promotion.

## [2026-06-09] engineering | Analytics detector runner seam

Started Phase A of the backend detector-completion plan by making the analytics kernel runnable
through an explicit `FeatureResolver` port instead of only through ad hoc registry dispatch. The pure
`@bp/analytics/core` runner now accepts a detector, run context, and resolver, then returns the
detector output plus structured per-feature-grain satisfaction data.

Moved the detector-study grain satisfaction mapping out of `run-artifact.ts` and into the
applied-research resolver layer, so registry run artifacts keep the same emitted contract while
deriving `featureContracts` from resolver data instead of a hand-written artifact prose map. Added a
small applied-research detector catalog seam and a `pipeline-v2` boundary test so pipeline commands
do not import `@bp/analytics/registry` directly for detector studies.

## [2026-06-08] engineering | speed_pace_hotspot reviewed-gold calibration (v1)

Ran the ADR-0018 calibration loop for `speed_pace_hotspot` (2026-03). Built reusable infra in
`@bp/applied-research/evaluation`: `speed-pace-review-queue.ts` (enrich + stratify a no-write run into
a reviewer-ready queue) and `speed-pace-reviewed-gold.ts` (gold builder, evaluator, promotion gates,
readiness projection), reusing the shared `detector-readiness-projection` identity/bucket helpers.
Tests in `packages/applied-research/test/speed-pace-reviewed-gold.test.ts` (6 pass).

No-write run: 13,928 segment-daypart features, 100 emitted candidates (== the 100 cap), 144 skipped
(only `segment_too_short` 33 + `insufficient_speed_observations` 111; the traversal, spatial, and
baseline gates were inert — `spatialConfidence == 1.0` everywhere). Key finding: the `candidateLimit`
cap is a **biased sampler** — 2,014 segment-dayparts clear the slowness floor but are dropped by the
top-100, skewing emission to Manhattan trunk corridors (78/100 Manhattan locals) and hiding most
outer-borough slow segments (suppressed-by-cap by route-id prefix: Brooklyn `B` 748 / Bronx `BX` 253 /
Queens `Q` 316 / Staten Island `S` 68, with only 15/1/1/1 emitted respectively).

First agent-reviewed gold batch: 66 stratified labels (27 primary / 11 route_context / 9
reviewer_only / 2 needs_more / 17 suppress). Eval: 0 suppress leakage, 25/27 reviewed primaries
emitted, **2 reviewed primaries + 11 reviewer-emittable scopes dropped by the cap** (recall loss).
Readiness: **14** public-finding candidates (after terminal/low-obs/baseline/geometry gates + physical
**node-pair** dedupe), 18 route_context, 79 review_queue, 17 suppressed. The dedupe keys on the
directed stop pair `fromStop:toStop` (not `segmentId`, which embeds route/dir/order), so the 11
stop-pairs emitted under multiple routes (M101/M102/M103 share Lex/Madison blocks) collapse to one
canonical public candidate each. Terminal suppression currently lives only in the readiness projection
because `SegmentDaypartFeature` has no terminal flag (feature/resolver gap). Artifacts + audit/eval
notes under `data/artifacts/detector-calibration-speed-pace-v1/`.

Then **implemented the cap fix** (v2): replaced the global top-100 cap in
`packages/analytics/src/findings/speed-pace-hotspot.ts` with a per-route cap (`candidateLimitPerRoute`
= 12, mirroring `persistent_speed_hotspot`) plus a `maxSegmentLengthFeet` = 15000 gate
(`segment_too_long`) for express/highway segments where pace-vs-free-flow can't localize. Slowness
floor and other gates unchanged. Before/after on the v1 gold labels: emitted **100 → 1,396**,
Manhattan share **78% → 24%** (Brooklyn 15→462, Bronx 1→198, Queens 1→255, SI 1→56), both cap-dropped
reviewed primaries recovered (reviewed primary survival 25/27 → 26/27). Honest costs: 1 reviewed
primary clipped (`M103:S:24`, an over-represented trunk route now capped at 12) and 1 suppress leak
(`QM11` express **terminal** — under the length gate and un-gateable without a terminal flag; caught
by readiness). Length gate cuts only ~65 of ~2,149 qualifying segments (top ~3% by length). Focused
analytics tests added in `r3-detectors.test.ts`. v2 artifacts + before/after under
`data/artifacts/detector-calibration-speed-pace-v2/`.

Fixed a live-dangerous CLI footgun: `findings run-detector` used `z.coerce.boolean()` for `--writeDb`,
so `--writeDb false` coerced to `true` and wrote the DB (a route-filtered write clobbers the month's
full citywide findings via `replaceFindingsForMonth` — which happened once during this work and was
restored). Replaced with a strict `writeDbFlagSchema` (only explicit `true`/`1`/boolean true enables);
covered by a focused parser test.

## [2026-06-08] engineering | Detector calibration readiness ADR

Added `docs/decisions/0018-detector-calibration-readiness-loop.md` to make the treatment-scope and
CJTP detector loop an accepted architecture decision. The ADR requires no-write detector
inventories, stratified review queues, stable reviewed-gold labels, suppress-leakage/primary-survival
evaluation, label-backed deterministic gates, and readiness projections before detector output can
influence product surfaces. It also clarifies package ownership: `@bp/analytics` owns deterministic
detectors, `@bp/applied-research` owns review/eval/readiness artifacts, and public serving reads only
promoted projections.

## [2026-06-07] engineering | Treatment-scope terminal gate calibration

Tightened the treatment-scope detector terminal gate. `treatment_scope_gap` and
`treatment_scope_mismatch` now suppress first/last direction segments as `terminal_or_layover`
coverage rows instead of allowing long or daypart-contrasty route-end segments to become treatment
scope candidates. Focused analytics tests cover the stricter first-segment behavior.

Reran both detectors for March 2026 with canonical model artifacts and `writeDb=false`, writing
isolated outputs under `data/artifacts/detector-calibration-terminal-gate/`. Candidate counts fell
from 54 to 44 for `treatment_scope_gap` and from 69 to 46 for `treatment_scope_mismatch`; all six
reviewed primary treatment-scope findings still survive. Remaining reviewed survivors are narrow:
gap keeps three route-context caveat rows, while mismatch keeps two reviewer-only
`not_false_positive` rows. The note at
`data/artifacts/detector-calibration-terminal-gate/NOTE.md` records the run/eval summary and next
detector work.

## [2026-06-07] engineering | Treatment-scope reviewed-gold calibration

Converted the 50-packet adversarial treatment-scope review set into reusable package-owned gold
labels. `@bp/applied-research/evaluation` now builds a `treatment_scope_reviewed_gold` artifact from
`decisions.json` plus `packets-index.json` and evaluates regenerated detector candidates by stable
`detectorId + scopeId` identity instead of candidate row order or regenerated candidate ids.

Implemented the remaining route/source evidence gate for `treatment_scope_gap`: route-level
positive treatment evidence now requires usable segment bus-lane support, Enhanced Bus Stop-only
geometry is not counted as bus-lane support for gap route eligibility, and explicit
`local_intervention_event:bus-lane-source-gap:<route>` refs block absence/scope-gap claims. The
other treatment-scope gates remain covered in tests: physical node-pair dedupe, mismatch historical
stability, gap join-state split, and terminal suppression.

Reran March 2026 with `writeDb=false`. `treatment_scope_gap` fell from 44 post-terminal candidates
to 30; `treatment_scope_mismatch` stayed at 46. The reviewed-gold evaluation reports 50 labels, 8
reviewed packets still emitted, 42 dropped, 6/6 reviewed primary findings surviving, and 0/9
suppress labels still emitted. All reviewed false-positive classes except `not_false_positive` now
drop to zero emitted examples. Details and commands are in
`data/artifacts/detector-calibration-reviewed-gold/NOTE.md`.

## [2026-06-07] engineering | Treatment-scope expanded gold review

Expanded the treatment-scope reviewed gold set from 50 to 118 March 2026 labels by triaging the 68
current emitted candidates that were still unreviewed after the reviewed-gold calibration. The second
batch has light labels for every candidate and adversarial checks for 42 high-risk rows, preserving
batch provenance (`original_50` vs `second_expansion_68`) and review depth in the reusable gold
artifact/evaluator.

Implemented one scoped deterministic fix from the expansion: `treatment_scope_mismatch` no longer
counts Enhanced Bus Stop-only refs as bus-lane mismatch evidence. The after-fix March rerun with
`writeDb=false` reports `treatment_scope_gap` at 30 candidates and `treatment_scope_mismatch` at 45
candidates. The combined 118-label eval reports 12/12 reviewed primary labels surviving, 0
unreviewed emitted candidates, and 13/23 suppress labels still leaking; the remaining leakage is
mostly short-history or improving-but-still-slow mismatch candidates that need a better
history-confidence gate rather than a brittle single-threshold rule. Details are in
`data/artifacts/detector-calibration-expanded-gold/NOTE.md`.

## [2026-06-07] engineering | Treatment-scope mismatch history gates

Used the 118-label expanded treatment-scope gold set to calibrate `treatment_scope_mismatch` without
expanding labels again. The remaining 13 suppress leaks were all `speed_not_actually_bad` mismatch
rows where the segment was slow but not historically worsening. Added short-history,
historical-worsening, improving/stable, and physical-sibling spillover gates so slow absolute speed
alone no longer emits a mismatch candidate.

After the March 2026 `writeDb=false` rerun, `treatment_scope_gap` stayed at 30 candidates and
`treatment_scope_mismatch` fell from 45 to 28. The combined 118-label eval reports 12/12 reviewed
primary labels surviving, 0/23 suppress labels still emitted, and 0 unreviewed emitted candidates.
Remaining non-primary emissions are context/reviewer/needs-more-evidence rows, so treatment-scope is
still review/route-context ready rather than automatic public-finding ready. Details are in
`data/artifacts/detector-calibration-history-gates/NOTE.md`.

## [2026-06-07] engineering | Treatment-scope readiness projection

Added a deterministic treatment-scope readiness projection over the locked 118-label gold set. The
projection separates current detector output into `public_finding_candidate`, `route_context`,
`review_queue`, and `suppressed` buckets using reviewed labels plus current geometry/source state.
For March 2026 it reports 12 public-finding candidates, 27 route-context rows, 19 review-queue rows,
and 60 suppressed rows. This is a promotion/readiness layer rather than another treatment-scope
heuristic pass; the gold labels are unchanged.

Audited the mismatch history threshold without changing the default. A sweep over
`minWorseningDeltaMph` values 0, -0.1, -0.25, and -0.5 shows that the current 0 mph threshold keeps
12/12 reviewed primaries alive with 0/23 suppress leakage, while stricter thresholds immediately
drop primary survival to 10/12, 8/12, and 7/12. Production out-of-sample detector runs for 2026-02
and 2026-04 are dependency-blocked because treatment/model artifacts currently exist only for
2026-03; a clearly labeled synthetic smoke remapped March static treatment geometry onto 2026-01 and
2026-02 speed/history rows and produced nonzero candidate counts for shape checking only. Details
are in `data/artifacts/detector-readiness-treatment-scope/NOTE.md`.

## [2026-06-07] engineering | Customer journey readiness queue

Applied the treatment-scope readiness/eval pattern to `customer_journey_shortfall` as the next
detector family. The audit confirms its claim grain is route/month/period/trip-type over MTA CJTP:
poor customer journey-time performance for the resolved source snapshot, with wait-side vs
in-vehicle-side evidence carried as interpretation rather than causal truth.

Added a small reusable readiness helper for stable `detectorId + scopeId` identity and shared
readiness bucket counts, while leaving detector-specific label schemas in their owning modules.
Also fixed a concrete detector bug: `minHistoryMonths` was declared but not enforced, so adjacent-
month or same-month-prior-year persistence could promote rows with too little valid history. The
detector now requires valid history support and does not count low-exposure/invalid rows toward
history.

The March global no-write run resolves CJTP `asOfMonth=2026-04`, loads 25,041 features and 351 route
rollups, and emits 100 capped candidates with 697 coverage rows after the gate. An uncapped smoke
with `candidateLimit=1000` emits 136 candidates. The first gold-set review queue is stratified to 70
rows: 41 emitted candidates, 19 skipped controls, and 10 borderline clean-no-hit controls. No public
readiness is claimed because there are no reviewed CJTP labels yet. Details are in
`data/artifacts/detector-readiness-customer-journey/NOTE.md`.

## [2026-06-07] engineering | Customer journey reviewed gold calibration

Built the first reviewed gold set for `customer_journey_shortfall` from the 70-row CJTP review
queue. The label set has 16 primary findings, 33 route-context rows, 1 reviewer-only row, 3
needs-more-evidence rows, and 17 suppress rows, with 41 adversarial reviews and 29 light reviews.
The package-owned CJTP evaluator uses stable `detectorId + scopeId` identity and reports primary
survival, suppress leakage, context/reviewer leakage, unreviewed emitted candidates, and root-cause
breakdowns.

The first label-backed deterministic fix is a stronger exposure floor: default `minCustomers` is now
2,500. Before the gate, the 70-label eval had 16/16 primary survival but 5/17 suppress labels still
emitted, all sparse-denominator rows. After the gate, the March 2026 no-write rerun still fills the
default 100-candidate cap, the uncapped count drops from 136 to 127, reviewed primary survival stays
16/16, and suppress leakage falls to 0/17. The remaining 65 emitted candidates are unreviewed, so
CJTP is ready for route context/internal review and reviewed public-finding-candidate queues, not
automatic public publication. Details are in
`data/artifacts/detector-calibration-customer-journey-gold-v1/NOTE.md`.

## [2026-06-08] engineering | Customer journey reviewed gold v2 expansion

Expanded CJTP gold labels from 70 to 135 by reviewing the 65 default-cap emitted candidates that
remained unreviewed after the first customer-journey calibration. The second batch was stratified by
score band, route type, borough/route prefix, dominant component, exposure, CJTP band, and repeated
route cohorts. Combined v2 labels now include 33 primary findings, 75 route-context rows, 1
reviewer-only row, 7 needs-more-evidence rows, and 19 suppress rows; the default-cap March 2026
evaluation reports 33/33 primary survival, 2/19 suppress leakage, 65/83 context/reviewer emissions,
and 0 unreviewed emitted candidates.

No new detector gate was added because the only remaining suppress leakage is two near-floor
denominator rows and the current exposure gate is being held fixed. The readiness projection now
separates reviewed suppressed labels from skipped coverage state with explicit
`reviewedSuppressedCount`, `coverageSkippedCount`, and `unreviewedSuppressedCoverageCount` fields,
and CJTP labels distinguish `shouldEmitSignal`, `shouldEmitFindingCandidate`, and
`shouldPromotePrimary`. An uncapped run emits 127 candidates, so the default cap hides 27 lower-score
rows and leaves 24 uncapped emitted candidates beyond v2 labels. Details are in
`data/artifacts/detector-calibration-customer-journey-gold-v2/NOTE.md`.

## [2026-06-07] engineering | Tier 2 extraction target spec added

Added [[wiki/engineering/tier2_extraction_target_spec]] as the concrete product-facing answer to
"what data do we need extracted from Tier 2?" The spec separates document facts from computed
Studio metrics, defines the common `evidenceByField` contract, lists the P0 feature sections for the
vNext harness, and adds the product-question-driven P1 targets that the older harness plan did not
fully encode: cost/value evidence, service-delivery and CJTP-component claims, ridership/demand
trend claims, geographic/equity context, and explicit TSP evidence/source-gap posture. It also maps
accepted observations to downstream route timelines, intervention catalogs, evidence cards,
source-gap findings, cost packets, service-delivery packets, geographic context packets, and route
diagnosis context.

## [2026-06-07] analysis | Product question gap audit incorporated

Updated [[wiki/analysis/product_question_inventory]] and
[[wiki/analysis/product_question_discovery_crosswalk]] from the adversarial product-family gap
audit. Promoted four missing product-question families: `cost_effectiveness`,
`geographic_rollup`, `service_delivery`, and `equity_incidence`. The docs now treat
`expected_baseline` and `measurement_integrity` as cross-cutting substrates rather than standalone
families, and they route enforcement ROI and capital/project prioritization through the new
cost-effectiveness family instead of leaving cost/value hidden inside corridor evaluation.
Follow-up tightening demoted `brief_authoring_workflow` from a product-question family to a product
workflow surface, assigned shared route/area allocation to `geographic_rollup` for
`equity_incidence` reuse, assigned CJTP decomposition ownership to `service_delivery`, explicitly
folded ridership/demand trend into `history_change`, and clarified that `cost_effectiveness`
composes into corridor evaluation, board reporting, and compliance packages.

## [2026-06-07] analysis | Product question discovery crosswalk added

Added [[wiki/analysis/product_question_discovery_crosswalk]] to make missing-family discovery
traceable instead of self-referential. The crosswalk defines a source-doc and built-surface
procedure: declare source set, extract product jobs, classify each as `promote_family`,
`map_existing`, `absorb_subcase`, `defer_adjacent`, or `non_goal`, then update the inventory only
when a family id, user question, mapping, or status changes. It covers product thesis docs,
business-research docs, frontend surface plans, authoring/review architecture, current app surfaces,
and data/research plans. The procedure exposed one missing family, now added to
[[wiki/analysis/product_question_inventory]]: `brief_authoring_workflow`, the non-detector workflow
that turns route/segment/finding/source evidence into edited, reviewed, versioned, and publishable
briefs.

## [2026-06-07] analysis | Product question inventory expanded from business research

Expanded [[wiki/analysis/product_question_inventory]] after checking the two June 2026
business-problem research docs against the existing family list. Added canonical families for
`root_cause_diagnosis`, `corridor_project_evaluation`, `board_reporting_package`, and
`compliance_package`, plus a deferred adjacent `service_change_coordination` family. The doc now
also records research opportunities that should not be split into separate families yet, such as
stop-decision workbenches, enforcement ROI, redesign decision logs, premium-service SLA monitoring,
capital/project prioritization, and real-time operations dashboards.

## [2026-06-07] analysis | Product question inventory user lens added

Revised [[wiki/analysis/product_question_inventory]] with a primary user lens from two June 2026
business-problem research passes. The primary user is now explicitly the route/corridor evidence
author: an agency, consultant, oversight, advocacy, or reporting analyst who must turn fragmented
performance, intervention, timeline, and source-gap signals into a defensible meeting-ready,
board-ready, public-brief, audit, or corridor-evaluation artifact. The doc now distinguishes those
users from dispatchers, consumer trip planners, generic BI users, and enforcement hardware
operators, and it tightens the product relevance rule: a question family matters when it feeds a
defensible explanation, route surface, review packet, brief, scorecard, or source-gap finding.

## [2026-06-07] analysis | Product question inventory added

Added [[wiki/analysis/product_question_inventory]] as the product-facing complement to the detector
catalog. It turns the research and frontend surface-data docs into canonical question families:
route attention, headline condition, rider pain, slow segments, reliability/wait, history/peer
context, schedule/runtime gaps, treatment inventory/gaps/effects, timelines, document claims, source
completeness, evidence readiness, external context, multi-year patterns, and compare/cohort. The doc
explicitly records that the total possible detector universe is open-ended; completeness should be
measured against product question coverage, required data substrates, claim posture, and current
detector/applied-research/serving support.

## [2026-06-07] analysis | Detector catalog added

Added [[wiki/analysis/detector_catalog]] as the compact human-readable detector tracker. The
registry remains the source of truth, while the catalog summarizes the current 21 detectors,
similarity clusters, duplicate warnings, feature-grain reuse, model-artifact consumers, missing
spaces, and the checklist to run before adding another detector. This gives auto-research and Codex
sessions a short context surface for deciding whether proposed work is a new detector, a feature or
model artifact, calibration, review-packet enrichment, or a serving projection.

## [2026-06-07] engineering | Customer journey shortfall detector implemented

Implemented `customer_journey_shortfall` as the first detector over
`local_bus_customer_journey_metric` / MTA CJTP. The detector is registered as descriptive, uses a
new pure `customer_journey` feature grain, ranks within month/period/trip-type cohorts, applies
route filters only after cohort scoring, and carries the unit warning that CJTP is a 0..1
performance share rather than minutes. Applied-research now has a generic SQLite-table resolver path
for detector input assembly, a CJTP local DB reader that resolves the latest source month, row-to-
feature transforms, and route-level customer-weighted rollups.

Verification: grounding artifact written to
`data/artifacts/cjtp-grounding/customer-journey-metric-grounding.json` with 25,041 rows,
2023-04..2026-04, 362 routes, and zero nulls on the three metric columns. A March global
`findings run-detector` emitted the CJTP detector against as-of month 2026-04 with 25,041 loaded
features, 351 route rollups, 5 sampled candidates, and 697 coverage rows.

## [2026-06-07] engineering | Tier 2 machine-verifiable feature harness plan

Added [[wiki/engineering/tier2_machine_verifiable_feature_harness_plan|Tier 2 machine-verifiable
feature harness plan]] to make "no row-by-row human review" an explicit Tier 2 design constraint.
The plan turns the existing qv1-qv10 canonical merge, manual vocab application, agentic harness,
self-heal lanes, structured validator, and operational-date proof harness into a compiler-style
promotion architecture: accepted surfaces become feature candidates, vocab maps normalize observed
fields, deterministic feature-family validators emit a proof ledger, and only proof-backed fields
can feed detector evidence, briefs, public timelines, source-gap findings, or causal treatment
inventory. Human input is scoped to policy, vocab aliases, fallback rules, public wording, and small
gold/adversarial fixtures, not corpus-scale row inspection.

Follow-up scope added the operational loop: staged validation errors become structured feedback
packets for bounded LLM retries, while promotion failures downgrade/quarantine rather than asking
the model to argue with the verifier. The page now separates what the LLM submits from what the
runner fills deterministically, calls for feature-family tool schemas and precomputed resolver
handles to avoid late post-processing debt, and defines replay/live/detector-production E2E sample
tests with zero unproven publishable fields as the core gate.

Second follow-up promoted three sufficiency conditions into hard gates: define a strict
`tier2_extraction_contract_vNext`, require queue manifests to declare full-corpus vs repair/backfill
roles, and add adversarial replay fixtures for the known bad collapses (generic lane width, taxi or
all-vehicle speed, all-vehicle travel time, parking/curb criticality, title-as-kind fallback, and
source-stated effects masquerading as project metrics). Updated the qv1-qv10 vocab foundation counts
to the current inventory: 93,893 mapped fields, 21,474 `preserve_raw`, 672 unresolved, 0 missing
projections, and 0 target conflicts.

## [2026-06-07] architecture | Mixed freshness publication doctrine

Added ADR 0017 (`docs/decisions/0017-mixed-freshness-publication-model.md`) to retire "the product
is a monthly release" as product doctrine. The canonical framing is now: a multi-year evidence
system with versioned baselines, current signals, and audited publication gates. The ADR defines
historical corpus, baseline month, current signal, source-capture snapshot, pipeline artifact corpus,
serving projection, and publication/promotion.

Updated the corpus overview and pipeline finish plan to point at the doctrine, and corrected newer
planning text that had used monthly release language too broadly. Monthly cadence remains valid for
monthly source grains, release-keyed detector output, and same-month observed-release promotion
gates; it is no longer the mental model for the whole product or route page freshness.

## [2026-06-07] engineering | Customer journey shortfall detector plan revised

Revised the plan after review. Replaced the "monthly release" output rationale with ADR 0017's
mixed-freshness model: output is keyed on a resolved CJTP `asOfMonth` (latest complete source month
or selected snapshot) for reviewability/stable snapshotting, decision uses the historical panel, and
serving shows multi-year history with current highlights. Flagged that the runner currently keys
reads off the global `releaseMonth`, which would ignore CJTP's fresher 2026-04 data, so the detector
must resolve its own `asOfMonth`. Added a cohort-safe route-filtering constraint:
`loadDetectorStudyLocalDbRows()` pushes `routeId` into the SQL `WHERE`, so a `--routeId` run would
compute the within-cohort percentile on a cohort of one; the resolver must load the whole cohort and
filter after scoring (with a test invariant). Corrected the over-optimistic seam claim — the
assembler dispatches only artifact/model inputs, not generic `sqlite_table` contracts — and chose to
add a generic SQLite resolver registry keyed on `resolverId` rather than another hand-written branch.
Added a route-level rollup goal (worst cohort, customer-weighted CJTP, dominant side, persistence
count, exposed customers) and a reproducible data-grounding SQL block.

## [2026-06-07] engineering | Customer journey shortfall detector plan

Drafted [[wiki/engineering/customer_journey_shortfall_detector_plan|Customer journey shortfall
detector plan]] — the first detector to consume MTA CJTP (`local_bus_customer_journey_metric`, 25,041
rows, 2023-04..2026-04, zero nulls), which no analytics code reads today. It flags routes with poor
customer journey-time performance for the release month and decomposes the shortfall into wait-side
(`additional_bus_stop_time`) vs in-vehicle-side (`additional_travel_time`) so the implicated lever is
visible. Recorded a load-bearing correction: the `customerJourneyTimeMinutes` column is a misnomer —
CJTP is a 0..1 performance share (% of customers within 5 minutes of schedule), not minutes, and
negative additional-time means better than schedule.

Settled the "this month vs all months" scope: output stays release-month because review packets,
coverage, and publication gates need one actionable baseline month at a time, while per-month
emission across 37 months is a ~37x un-actionable flood. The hit is persistence-gated using
all-months history as baseline (release month + trailing-N and/or same-month-prior-year) so a
one-month dip cannot promote. Cross-month "getting worse" is left to `degradation-trend` as a
follow-on (feed CJTP into the metric-history grain), not overloaded onto this detector. Placement
follows the authoring guide: pure rule in `@bp/analytics`, SQLite read + resolver in
`@bp/applied-research`, reuse the existing `local_bus_customer_journey_metrics_history` data product,
thin pipeline command. Status draft; thresholds (exposure floor, percentile, persistence rule) still
to lock before implementation.

## [2026-06-07] engineering | Detector input resolver seam and Socrata monthly factory

Simplified `findings run-detector` by moving detector-specific artifact input assembly out of the
CLI and into `@bp/applied-research/detector-runs`. The new `assembleDetectorStudySourceRows()`
walks detector registry metadata, feature contracts, and model artifacts, then dispatches to shared
resolvers for model artifacts, stop-direction-hour EWT features, route treatment summaries, and
treatment event panels. The CLI now loads local rows, calls the assembler, runs the registry
detector study, and writes the output. Added fixture coverage proving model artifact rows are loaded
through the resolver registry with route filtering.

Added `defineSocrataMonthlyIngest()` as the first bounded factory for the repeated Socrata monthly
ingest shape: source lookup, Soda3 query, fetch, normalize, replace, raw snapshot, and summary.
Converted `ingest bus-wait-assessment` to use the factory and added a fixture-backed helper test.
While smoke-testing the real detector command, made the local month-first index migrations
idempotent with `CREATE INDEX IF NOT EXISTS`; the live route-scoped smoke for B41 then completed
without writing detector rows to SQLite.

## [2026-06-07] engineering | Tier 2 extraction best practices recorded

Added [[wiki/engineering/tier2_extraction_best_practices|Tier 2 extraction best practices]] as the
durable operating memo for future Tier 2 queues and normalization passes. It records the qv1-qv10
lessons from the canonical merge and vocab repair work: qv8-qv10 were a repair subset, not the full
corpus; category-like raw paths were not fully stable across queue waves; event-family missing
projection is now fixed but residual debt remains in metric/entity/narrative vocab; rawText-derived
event-family suggestions stay review-only unless a policy explicitly authorizes fallback
canonicalization; and raw payloads remain immutable with additive canonical projection. The page also
sets future queue/run rules: declare queue role and corpus inventory before launch, run canonical
merge and raw-field graduation before projection, split `missing_projection` from `preserve_raw` and
`unresolved`, and prove key completion with direct projection-index checks before expanding the
corpus.

## [2026-06-07] engineering | Applied research and detector authoring guide

Added [[wiki/engineering/applied_research_detector_authoring]] as the operational guide for new
detectors and new applied-research units. The guide records the current ownership split:
`@bp/analytics` for pure detector/statistical logic, `@bp/applied-research` for corpus-backed
panels/models/evaluation artifacts, `@bp/applied-research/local-db` for explicit local SQLite
research reads, `@bp/db` for storage/table mechanics, and `tools/pipeline-v2` as thin command
orchestration. It includes step-by-step detector and applied-research checklists, common failure
modes, and verification commands.

## [2026-06-07] engineering | Serving-safe model projection and query baselines

Completed Phases 5 and 6 of the analytics/local-db first-principles plan. `evaluate detectors` now
writes the compact `model_artifact_serving_projection` to both the canonical research artifact path
and the publishable `studio/v2/detectors/model-artifacts.json` R2 key. Snapshot 2.0 validates that
safe R2 artifact from the Studio API, exposes a `detector_model_status` projection ref, and adds a
`detector_model_artifact_status` source-month state without importing `@bp/applied-research` or
serving raw model rows.

Added `local_db_hot_query_baselines` in `@bp/applied-research/local-db` plus
`audit local-db-query-baselines`, which records row counts, elapsed milliseconds, EXPLAIN plan
lines, index-use flags, and full-scan warnings for the hot local panel reads. A March 2026 live
read-only smoke run found the local DB had schema-declared month-first indexes missing; applied
`CREATE INDEX IF NOT EXISTS` for `local_route_segment_speed`, `local_route_hourly_ridership`,
`local_route_month_trend`, and `local_route_intervention_comparison`. The rerun reported 10
queries, 9 measured SQL reads, 1 artifact-backed source-gap panel, 0 errors, and 0 full-scan
warnings. The full 2023-04 to 2026-03 baseline also passed with 0 full-scan warnings; the largest
measured reads were segment-daypart (520,825 rows, 20.3s), pulse fingerprint (3,015,641 rows,
16.4s), and segment-month (153,479 rows, 14.8s).

## [2026-06-07] engineering | Model-backed detector input gate

Finished the Phase 4 detector-run contract for the 100x analytics/local-db plan. Registry detector
runs now evaluate declared `modelArtifacts` before dispatch; missing model rows emit an explicit
`skipped_missing_input` coverage row with `reasonCode=missing_model_artifact` instead of rebuilding
ad hoc raw fallbacks. Run artifacts now include `dataProductDependencies` and per-run
`modelDependencies` with status and row counts. `findings run-detector` loads the canonical model
artifacts for segment daypart residuals, route peer residuals, segment speed residuals,
intervention scope fit, reliability exposure, source gaps, and treatment event panels when present.
No live SQLite writes were performed.

## [2026-06-07] engineering | Panel spec and local DB resolver contracts

Completed the Phase 3 analytics/local-db slice for first-class panel specs. `@bp/applied-research`
now exports runtime `PanelSpec`/`PanelManifest` schemas plus `builtInPanelModelSpecsV1()`, a catalog
covering the nine current model artifacts and their required data-product dependencies. The local DB
panel adapters now have manifest-returning `load*PanelV1Resolution()` wrappers for segment-month,
segment-daypart, route-peer residual, reliability-exposure ridership, pulse fingerprint,
decoupling, and treatment-event rows, while preserving the existing bare row loaders for command
compatibility. High-value aggregate SQL outputs parse through focused Zod row schemas before
returning typed panel rows. Verification used in-memory SQLite fixtures only; the live
`data/local/pipeline.sqlite` file was not modified.

## [2026-06-07] engineering | Data-product dependency input resolver

Made data-product `requiredInputs` auditable instead of relying on private classifier aliases. The
applied-research data-product completeness module now exports a required-input resolver, reviewed
product-alias map, and explicit external-ref list. Dependency propagation uses the same resolver,
and the manifest test now fails any required input that is neither a manifest product ID,
`source_manifest:*`, a reviewed alias to existing product IDs, nor an approved external ref. This
keeps product-completeness closure from silently skipping legacy table names or prose artifact
nicknames.

## [2026-06-07] engineering | Read-only local DB audit handles

Tightened the local SQLite safety posture for read-only pipeline work. `audit source-coverage`,
`audit studio-coverage`, and `verify d1` now use `withLocalDb({ readonly: true })`, so they skip
local migrations and open the DB through Bun SQLite's read-only mode while still writing their
JSON/SQL artifacts outside the database. Added command-boundary assertions for those three commands
so audit/verification paths do not drift back to writable handles.

## [2026-06-07] engineering | Data-product completeness artifact schema

Added a package-owned `DataProductCompletenessArtifactSchema` under
`@bp/applied-research/data-products` covering completeness products, checks, coverage buckets,
root causes, downstream blockers, route universes, and summary counts. `audit
data-product-completeness` now parses the full artifact through that schema immediately before
writing `completeness.json`, turning the canonical coverage artifact into a validated publication
boundary rather than a TypeScript-only object shape.

## [2026-06-07] engineering | Narrow coverage audit demotion

Made the route-materialization audit explicit about its narrower scope. The
`analytics_materialization_coverage` artifact now carries `auditScope.role =
"route_surface_materialization_audit"` and points readers to `audit data-product-completeness` for
canonical product gap classes. The CLI summary uses the same wording. Downstream
`detector-corpus-grain` and `detector-closure` now parse the canonical completeness artifact through
`DataProductCompletenessArtifactSchema` when it is present instead of accepting arbitrary JSON.

## [2026-06-07] engineering | Hardened the local SQLite / Drizzle write path

Made the `@bp/db/local` repository helpers correct and faster without changing their public
call sites. Every multi-statement `replace*` helper (~30 across projection, route-network,
route-slice, interventions, corridors, gtfs-rt, findings, corpus-context, observed-reliability,
equity, tier2) now runs inside a single synchronous `db.transaction((tx) => …)` so a crash or
constraint violation mid-replace rolls back instead of leaving canonical build state half-wiped.
The helpers dropped `async` (bun-sqlite is synchronous; callers' existing `await` still works).
Added `insertAll(tx, table, rows)` — a sync, transaction-aware chunked insert — and routed every
multi-row insert through it, closing a latent `too many SQL variables` crash on wide tables.

Added month covering indexes to the 10 projection/serving tables read `WHERE month = ?` whose PK
leads with `routeId`/`corridorId` (scorecard, brief summary, readiness, month coverage, build plan,
reliability baseline, equity context, observed reliability summary, corridor month summary, and
month source status on `(month, source_scope)`). `EXPLAIN QUERY PLAN` confirmed each flipped
`SCAN` → `SEARCH … USING INDEX`. Migration: `migrations-drizzle/local/20260607113608_quick_omega_red`.

Centralized the SQLite pragmas in `applyLocalPragmas()` (exported from `@bp/db/local`), used by
`openLocalPipelineDb`, which also gained a `readonly` open mode and `synchronous = NORMAL` for
faster local bulk writes. Removed the speculative, unused `@bp/db/pg` subpath (schema, config,
export, generate script) per the MVP "no Postgres without a documented requirement" rule.

Decided to **defer** a broad foreign-key + `ON DELETE CASCADE` rollout: the atomicity goal is now
met by transactions, the one cascade that mattered (`finding_candidate` → `finding_evidence_link`)
already exists, the corridor group is incompatible (its replace deletes the whole corridor catalog),
and the rest would require SQLite table-rebuild migrations. FK enforcement remains a future option.

Known pre-existing drift (not touched): the test migration record `packages/db/migrations/local/`
(read by the local repo tests) lags the runtime `migrations-drizzle/local/` journal (37 vs 39); the
new month-index migration lives only in the runtime journal, which is fine because the indexes are
perf-only and tests do not depend on them.

## [2026-06-07] engineering | Reliability exposure panel added to model projection

Built `reliability_exposure_panel_v1` as the first rider-exposure reliability model artifact. The
March 2026 artifact joins stop-direction-hour EWT features with route-hour ridership proxy rows and
writes
`data/artifacts/analytics-models/reliability-exposure-panel-v1/2026-03/bus-observatory-2026-03/reliability-exposure-panel.json`:
650,264 panel rows, 311,924 rows with both rider exposure and computable EWT, 350 routes, 22,800
stops, about 5.53M estimated boardings, and about 252.8M estimated rider-delay minutes. Its
manifest is explicit that route-hour ridership is allocated over stop-direction-hour rows and is not
observed stop-level boardings.

Wired the artifact into detector evaluation and the model-serving projection. `rider_weighted_excess_wait`
now declares `reliability_exposure_panel_v1` as a model dependency; rerunning
`evaluate detectors --year 2026 --month 3 --historyStartMonth 2023-04` produced 20 scorecards,
0 model-backed evaluation-loss blocked detectors, a portfolio gated score of 825.9, and, after the
treatment-event panel addition below, a serving-safe projection with 7 available models, 0 missing
models, and 10 detector consumers.

Follow-up runtime wiring now makes `findings run-detector --detector-id rider_weighted_excess_wait`
prefer `reliability_exposure_panel_v1` when present, with the older stop-hour EWT plus route-hour
ridership resolver kept as fallback. The real March run used
`sourceKind=rider_weighted_excess_wait_from_reliability_exposure_panel_v1`, read 650,264 panel rows,
and emitted 7 review candidates with 650,264 coverage rows.

`source_gap` now has the same model-runtime discipline for treatment/TSP source gaps. The detector
accepts source-gap model rows as optional input, and `findings run-detector --detector-id source_gap`
loads `source_gap_model_v1` when present. The real March run used
`sourceKind=source_gap_from_source_gap_model_v1`, read 381 model rows, and emitted 381
`tsp_current_inventory_missing` review candidates with 381 coverage rows.

`intervention_gap` now consumes the same `source_gap_model_v1` rows directly at runtime. The real
March run used `sourceKind=intervention_gap_from_source_gap_model_v1`, read the 381-route model
surface, and emitted 8 review candidates with 381 coverage rows. The older raw source-gap resolver
path remains only as a model-building fallback when the artifact is absent.

Added `treatment_event_panel_v1` as the seventh model artifact in the 100x analytics track. The
March 2026 artifact at
`data/artifacts/analytics-models/treatment-event-panel-v1/2023-04_to_2026-03/2026-03/treatment-event-panel.json`
contains 741 event-panel rows across 327 routes, 236 supported comparison rows, 236 rows with
effect estimates, and 0 rows eligible for causal language under the current gates. Rerunning
`evaluate detectors --year 2026 --month 3 --historyStartMonth 2023-04` produced a serving-safe
model projection with 7 available models, 0 missing models, and 10 detector consumers.

`intervention_event_study` now declares and consumes `treatment_event_panel_v1` at runtime when the
artifact is present. The real March run used
`sourceKind=intervention_panel_from_treatment_event_panel_v1`, read 741 panel rows, and emitted 100
capped association-screening candidates with 741 coverage rows. The artifact intentionally blocks
causal/effect language until pre-trend, placebo, autocorrelation, method-divergence, and human
review gates are stronger.

Added route-month-speed screening diagnostics to `treatment_event_panel_v1`. The March artifact now
computes gate statuses where public monthly speed history and comparison rows are sufficient, using
longer pre-intervention route history when the persisted comparison window is too short: pre-trend
231 pass / 1 fail / 509 not tested; placebo-in-time 211 pass / 8 fail / 522 not tested;
placebo-in-space 145 pass / 85 fail / 511 not tested; autocorrelation 171 pass / 60 fail / 510 not
tested; method-divergence 224 pass / 12 fail / 505 not tested. The refreshed
`intervention_event_study-run.json` records these `gateStatusCounts` and
`candidateCausalEligibleFeatureCount=102`, while preserving association-pending-review claim
language until human methodology approval.

The treatment-event build now also writes
`data/artifacts/analytics-models/treatment-event-panel-v1/2023-04_to_2026-03/2026-03/candidate-causal-review.json`,
a compact methodology-review projection for those 102 candidate-causal-eligible rows. It spans 93
routes, records event/window/effect/gate fields, and sets `reviewDisposition=needs_methodology_review`
plus `publicClaimAllowed=false` for every row. The projection omits raw model rows and raw artifact
paths.

## [2026-06-07] data | MTA backlog browser-style capture fallback

Added a native `curl` fallback to the Tier 2 document capture transport for GET requests that still
return 403 after the normal project fetch and browser-header Bun fetch. The fallback keeps capture
read-only, uses browser navigation headers, follows redirects, and records the curl effective URL
for manifest bookkeeping.

Reran the MTA missing-source backlog as `mta-backlog-curl-capture-2026-06-07`. The clean capture
downloaded all 10 MTA backlog sources: 8 HTML pages were converted to text artifacts and 2 official
PDFs were stored as `ocr_required`, with 0 remaining failures.

Generated the companion OCR plan at
`data/ops/docs/mta-backlog-curl-capture-20260607/mta-backlog-ocr-plan.json` and local page Markdown
artifacts under `ocr-page-markdown-tesseract-mta-backlog-20260607`. The audit covers both PDFs, 113
pages total, with 113 complete pages, 0 failed/missing pages, 113 tool-call/response artifacts, and
one short page for review.

## [2026-06-07] engineering | Treatment scope gap detector and review artifacts

Added `treatment_scope_gap` as the complement to `treatment_scope_mismatch`: mismatch asks whether
a bus-lane-overlap segment remains slow, while gap asks whether a treated route's slowest eligible
segment appears uncovered or weakly covered by known bus-lane geometry. Added same-segment
historical speed context to mismatch evidence, specialized scope-gap review packet context, capped
route treatment source refs, detector registry/spec/policy rows, local DB feature loading, and
focused tests.

Regenerated March 2026 artifacts. `treatment_scope_gap` emits 95 candidates across 4,140 segment
scopes; `treatment_scope_mismatch` remains 100 capped candidates across 4,134 segment scopes.
Review packets now cover 1,564/1,564 candidates across 20 detector families with 0 missing packets;
generic score vectors cover 1,982,890 scopes with 1,473 flagged. The detector evaluation report now
has 20 scorecards. Both treatment-scope detectors are `watch`: evidence quality and claim
discipline are strong, but human-reviewed precision/usefulness labels are still needed before
promotion.

## [2026-06-07] engineering | Treatment scope mismatch calibration and packet context

Hardened `treatment_scope_mismatch` after auditing the first real packets. The detector now joins
route-segment treatment rows to all-day segment speed, daypart speed profile, same-route current
month rank, network current-month rank, and segment length. The score now uses speed, bus-lane
overlap, and descriptive route/network slowness rank; packets get a structured `reviewContext`
summary with evidence highlights, caution flags, and suggested reviewer checks.

The audit caught a concrete false-positive class: the initial top Q65/Q17/Q12 examples were
16-32 ft timepoint segments whose 0.1-1.3 mph speeds were dominated by tiny-distance/travel-time
math. The detector now applies a 300 ft minimum segment-length gate, matching speed-pace detector
discipline. Those scopes are skipped as `segment_too_short` instead of queued. Final March 2026
artifacts: 4,134 treatment-scope segment rows, 100 capped candidates, 735 clean no-hits, 3,299
skipped rows, 100 complete packets, 300 treatment-scope evidence links, and complete packet
coverage. The generic detector score-vector artifact is rebuilt for all 19 detectors; the
`treatment_scope_mismatch` scorecard now has calibration stability 651 and no
`score_vector_unavailable` flag, but remains `watch` until reviewed labels exist.

## [2026-06-06] engineering | Treatment scope mismatch detector slice

Added `treatment_scope_mismatch`, a segment-scope detector for slow observed segments that overlap
DOT bus-lane geometry. The detector is deliberately cautious: it emits review seeds for scope,
enforcement, and peer-context inspection, not failure claims. The applied-research detector runner
now resolves segment speed summaries against `route_segment_treatment_summary`; the detector is
registered, policy-gated, exported, and covered by analytics, applied-research, and pipeline command
tests.

Real March 2026 runs now persist three treatment-aware detector families:
`intervention_gap` (8 candidates), `intervention_underperformance` (28 candidates), and
`treatment_scope_mismatch` (100 capped segment candidates over 4,134 segment rows). Refreshed review
packets cover 1,469 candidates across 19 candidate-bearing detectors with 0 missing packets; the new
detector has 100 complete packets, 200 evidence links, and 0 packets missing primary evidence,
counter-evidence, or coverage. The detector evaluation now has 19 scorecards and a portfolio gated
score of 831.2. `treatment_scope_mismatch` is `watch` because reviewed labels and score-vector
artifacts are not available yet, while packet completeness, missing-data discipline, novelty, and
claim discipline all score cleanly.

## [2026-06-06] engineering | Treatment-aware detector runner slice

Added detector-native treatment input constructors for `intervention_gap` and
`intervention_underperformance` in `@bp/applied-research`. `findings run-detector` now loads
route-pain rows, route/segment treatment features, TSP/source-gap posture, and intervention
comparison rows for those detector families. March 2026 real runs produced 8 intervention-gap
candidates and 28 intervention-underperformance candidates over the 381-route universe, with
treatment source refs capped in evidence payloads while preserving full source-ref counts.

## [2026-06-06] engineering | Local Tesseract OCR path added

Added `docs tier2 tesseract-ocr` for Tier 2 PDF page text extraction without an OCR LLM. The command
consumes the existing `ocr-plan.json`, writes the same per-page Markdown + compatibility JSON shape
used by downstream extraction, prefers a usable Poppler `pdftotext` text layer, and falls back to
`pdftoppm` + `tesseract` for scanned pages. It emits a Tesseract-specific page audit that can be fed
to `docs tier2 discovery-extract` / `structured-extract`. Date extraction guidance was clarified:
OCR preserves source wording, regular LLM extraction carries raw date/status/family fields, and
`parseOperationalDate()` / `classifyOperationalDate()` remain the only normalization gate.

Added `docs tier2 ocr-similarity` to evaluate the local path against already-OCR'd page Markdown
before changing corpus defaults. The report records token overlap, character 5-gram cosine, and
route/date/number recall per page. A real smoke run over five
`gap-roadmap-docs-2026-05-25` TSP-report pages wrote
`data/ops/docs/ocr-similarity-20260606/gap-roadmap-text-layer-smoke.json`: 3/5 pages compared via
PDF text layer with mean token Jaccard 0.980, mean token recall 0.994, and perfect date/number recall
on compared pages; 2/5 cover/visual pages required the missing local `tesseract` binary and were
reported as local OCR failures.

2026-06-07 follow-up: installed native Tesseract 5.3.4 (`tesseract-ocr`, `tesseract-ocr-eng`,
`tesseract-ocr-osd`) on Ubuntu. A clean forced-Tesseract smoke over the same five pages wrote
`data/ops/docs/ocr-similarity-20260606/gap-roadmap-tesseract-forced-smoke.json`: 5/5 pages completed
with no local OCR failures, but quality was mixed. Dense text pages 3-5 scored high
(`tokenJaccard` 0.990, 0.985, 0.934; route/date/number recall perfect where applicable); cover/
visual pages 1-2 scored zero token overlap and missed route/date/number anchors. Default similarity
roots are now mode-specific so `prefer` and forced-Tesseract runs do not accidentally reuse each
other's page artifacts. The evaluator now emits cost-aware recommendations per page:
`local_ok`, `local_ok_with_review`, `local_failed_needs_triage`, `vision_escalation_candidate`, or
`no_paid_vision_low_value_visual`. Paid vision OCR is escalation-only; short/image-heavy pages that
do not carry enough substantive text should be skipped or manually reviewed instead of retried
through the expensive multimodal path.

2026-06-07 follow-up: added Markdown-normalized plain-text metrics to `docs tier2 ocr-similarity`
so LLM page Markdown can be compared against embedded PDF text without over-penalizing tables,
headings, and list punctuation. A 120-page `gap-roadmap-docs-2026-05-25` sample wrote
`data/ops/docs/ocr-similarity-20260607/gap-roadmap-llm-md-vs-pdf-text-layer-120p.json`: 119/120
pages compared (`118` PDF text-layer, `1` Tesseract fallback, `1` local failure). Raw mean token
recall was `0.840`; Markdown-normalized mean token recall was `0.863`. Raw mean character 5-gram
cosine was `0.756`; Markdown-normalized mean cosine was `0.835`, confirming that Markdown formatting
noise is material but manageable. Recommendation counts were `69 local_ok`, `24 local_ok_with_review`,
`14 vision_escalation_candidate`, `12 no_paid_vision_low_value_visual`, and `1 local_failed_needs_triage`.

2026-06-07 follow-up: improved the local PDF-to-PNG/Tesseract path. `docs tier2 tesseract-ocr` now
checks existing per-page outputs first, tries embedded PDF text next, then renders only fallback
pages into a source-level PNG cache grouped by contiguous page ranges. This keeps the downstream
per-page Markdown contract while avoiding one `pdftoppm` process per page on scanned PDFs.

## [2026-06-06] data | TSP recommended sources indexed

Promoted the June TSP research memo's highest-value public leads into the durable Tier 2 document
seed backlog. `knowledge/raw/tier2_document_backlog.json` now has 81 sources, with 20 new
TSP/source-gap entries covering NYC Administrative Code §19-199.1, Victory/Sustainable Streets,
Hylan, MTA/DOT aggregate press releases, DOT Streets Plan/testimony materials, Connecting to the
Core, Flatbush/M14/Northern/21st Street corridor PDFs, the MTA 2021 annual report, NYCT's 2026 ITSP
solicitation notice, and two dataset dictionaries (`w76s-c5u4`, `wa2y-rh4b`). Generated
`data/ops/docs/tsp-recommended-sources-20260606/` with a recommended-source index, a meeting/TSP
merged backlog, a combined capture manifest, and a Tier 2 source-coverage audit. The merged available
universe is 2,779 sources: 455 captured, 368 OCR-derived, 175 verified/materialized, 29 reviewed, and
19 promoted. The index records stale/unresolved leads separately (legacy Victory standalone PDF,
guessed 2023/2024 Streets Plan PDFs, Bus-Data-NYC, and FOIL-only current TSP inventory).

## [2026-06-06] engineering | Route treatment summary materializer planned

Added `knowledge/wiki/engineering/route_treatment_summary_materializer_plan.md` to define the
deterministic resolver between existing Tier 2 intervention work and public treatment-state read
models. The plan explicitly says this is not a new broad LLM extraction pass: it merges reviewed
Tier 2 interventions, local intervention events/comparison rows, ACE/ABLE, DOT bus-lane
route-shape overlap, dated TSP source-snapshot evidence, and source-gap posture into
`route_treatment_summary`, `route_segment_treatment_summary`, and
`route_treatment_source_gap`. It records the canonical treatment vocabulary, status semantics,
TSP-specific mapping rules, merge strength order, D1/API/UI phases, detector integration, tests, and
acceptance gates. Linked it from the wiki index, Website Surface Data Plan, and Serving Snapshot 2.0
Surface Manifest.

## [2026-06-06] data | Recurring MTA meeting discovery expands the available corpus

Added `docs tier2 discover-meetings` (`tools/pipeline-v2/src/commands/docs/tier2/discover-meetings.ts`
plus pure parser/builder `_discover-meetings.ts` and a fixture test). It walks MTA's recurring
monthly board/committee meeting pages
(`https://www.mta.info/transparency/board-and-committee-meetings/<month>-<year>`, enumerable by
month) and indexes every meeting's assets into the available source backlog: committee/board book
PDFs (`/document/<id>` links with titles) and the meeting's YouTube recording. **Indexing only — no
downloads** (registers URL + metadata), so it sidesteps the disk-full constraint; capture/OCR of the
new docs is a separate, disk-budgeted step. MTA 403s plain fetches; the working bypass is a full
browser header set (`MTA_BROWSER_HEADERS`: Safari UA + `Accept`/`Accept-Language`/`Sec-Fetch-*`/
`Upgrade-Insecure-Requests`), verified for both meeting pages and document PDFs via Bun fetch.

First live run (2021-01 → 2026-06): 61 months with meetings → **2,270 new sources (2,129 PDFs + 141
YouTube recordings)**, 5 dedup hits against the existing backlog. That grows the *available* universe
from 485 → 2,755 and populates the previously-empty media lane (0 → 141 videos). Re-running
`audit tier2-source-coverage` against the merged backlog reframes the funnel honestly: 2,755
available → 445 captured (~16%) → 368 OCR-derived → 175 verified → 19 promoted, with 0 of 141 meeting
videos captured (transcription deferred). Merged backlog + discovery artifact live under
`data/artifacts/docs/mta-meeting-discovery/`. Recorded in
[[wiki/data/tier2_document_corpus|Tier 2 document corpus]].

## [2026-06-06] data | Tier 2 source-asset coverage audit

Added `audit tier2-source-coverage` (`tools/pipeline-v2/src/commands/audit/tier2-source-coverage.ts`
plus pure builder `_tier2-source-coverage.ts` and a fixture test). It is the first source-grain
inventory of the Tier 2 corpus: it joins the *available* universe (the 485-source augmented backlog)
against what we *have* at each stage — captured (445), OCR-derived surfaces (368), verified/
materialized (175), reviewed into intervention records (29), and promoted to publishable (19) — and
writes `data/artifacts/audits/tier2-source-coverage.{json,md}`. The OCR-derived stage is distinct
from the verified layer on purpose: 368 of 386 captured PDFs (95%) have `document-derived-surfaces-v1`
OCR output, with 175 a strict subset promoted to the verified layer, so the real OCR gap is only 18
captured PDFs (not the ~270 captured-not-verified) and 40 sources are not successfully captured
(31 not attempted + 9 failed). Existing audits did not answer this:
`audit tier2-structured-data` indexes extraction *artifacts* and `docs tier2 discovery-coverage`
works at the OCR page-window grain. Two findings the audit surfaces: (1) **Media is an empty lane** —
content types are only pdf/html/json; YouTube/audio/video are now first-class recognized types
(`MEDIA_CONTENT_TYPES`) but zero are ingested, and transcription is intentionally deferred, so the
lane reports as known-but-empty rather than being invisible. (2) **Cross-run sourceId drift** — the
extracted layer (`agentic-runs-20260604`) and the reviewed/promoted layer (`gap-roadmap-docs-2026-05-25`)
come from different runs with disjoint namespaces, so extracted ∩ reviewed = 0 and 7 reviewed + 4
promoted source IDs are not in the available/capture universe at all; a reconciliation block reports
this instead of silently undercounting. Recorded in
[[wiki/data/tier2_document_corpus|Tier 2 document corpus]].

## [2026-06-06] project | Opportunity data map documented

Added `knowledge/wiki/project/opportunity_data_map.md` to capture the June business-problem
research synthesis: the product wedge is route/corridor diagnostics plus bus-priority intervention
evaluation and evidence/narrative packaging, not generic dashboarding. The page records priority
data gaps, strict TSP evidence statuses, detector priorities, the recommended route evidence loop,
and Snapshot 2.0 serving implications. Linked it from the wiki index and the website surface data
plan so future UI/data work starts from the business question rather than raw table availability.

## [2026-06-06] data | TSP acquisition plan documented

Added `knowledge/wiki/data/tsp_data_acquisition.md` from the June TSP research output. The page
records the current conclusion that NYC's authoritative active TSP inventory is a source gap, not a
public dataset; distinguishes historical/corridor evidence, annual aggregate counts, candidates,
and unsafe inference from speed outcomes; lists public evidence leads, candidate corridors, archive
leads, FOIL/agency record classes, and recommended internal entities (`tsp_location`, `tsp_event`,
`tsp_source`, `tsp_effect_estimate`, `tsp_candidate`). Linked the page from the wiki index, source
registry backlog, and opportunity data map.
Updated it with the follow-up deep-research report's more specific aggregate/procurement leads:
MTA's 2021 annual-report count of 626 added intersections and 2,156 TSP-enabled intersections,
NYCT's 2026 intelligent-TSP procurement lead, DOT PMMR/testimony study leads, the explicit
Green-Means-Go post-2017 candidate corridor list, and the warning that 34th Street/Grand Avenue
toolkit language should remain `under_consideration` unless deployment evidence is found.

## [2026-06-06] engineering | Studio coverage audit applied-research cutover

Moved `audit studio-coverage` route brief input and Studio route projection policy into
`@bp/applied-research/evaluation`. Applied-research now owns route brief input completeness checks
for schedule comparisons, ridership exposure, and 24-bin hourly slow-window coverage, plus Studio
route projection checks for DOT bus-lane geometry, trend month labels, route-level ridership
profiles, route-shape geometry, TSP source evidence, public AI note shape/density, route-segment
rider-delay evidence, and route-segment coverage metadata. The pipeline command now keeps local D1
reads, projection list/directory scanning, generated presentation text scanning, report status
assembly, and JSON writes. Added direct applied-research fixture tests and a pipeline boundary guard
against command-local Studio projection validators.

## [2026-06-06] engineering | Tier 2 structured-data audit applied-research cutover

Moved Tier 2 structured artifact layer/trust classification, count extraction, reviewed-record
schema validity checks, summary extraction, research-substrate warnings, inventory summary, best
research/serving artifact ranking, next-action policy, and Markdown rendering into
`@bp/applied-research/evaluation`. The `audit tier2-structured-data` pipeline command now keeps
filesystem scanning, JSON parsing, unreadable-file handling, and output writes. Added direct package
tests for research/serving/discovery classification, schema-validity counts, warning policy,
inventory ranking, next actions, and Markdown output plus a pipeline boundary guard against
command-local domain-schema parsing, count helpers, ranking policy, and Markdown rendering.

## [2026-06-06] engineering | Route brief model planning applied-research cutover

Moved route brief-model route-universe planning, duplicate requested-route handling, unknown-route
issue construction, comparison-rank eligibility, and final serving visibility projection into
`@bp/applied-research/route-briefs`. The pipeline command now consumes the package plan/projection
and keeps local SQLite reads/writes, hotspot projection error capture, route-slice artifact writes,
CLI parsing, and run summary reporting. Added direct package coverage for all-routes/requested-route
planning and route-slice visibility metrics plus a pipeline boundary guard against command-local
route planning and visibility mutation.

## [2026-06-06] engineering | Route timeline D1 and API integration landed

Folded the Tier 2 route-timeline serving projection into the canonical serving path. Added the D1
`route_timeline_index` schema/migration, seed/export plumbing for
`--route-timeline-projection-path`, route-timeline D1 query helpers, loaded-D1 table-count
verification, OpenAPI/registry coverage, and `GET /api/v1/studio/routes/:routeId/timeline`, which
resolves a route slug through D1 and serves the immutable R2 timeline bundle. The Studio route index
now marks the timeline surface available and emits a `route_timeline` projection ref when a
`route_timeline_bundle` artifact is indexed. The March 2026 local export with the B46/B82/BX41/M15
pilot produced 4 `route_timeline_index` rows and 4 `route_timeline_bundle` route-artifact refs.
Export input assembly now also hydrates missing month-scoped source-gap `intervention_event` rows
from source-gap `route_intervention_comparison` rows, while still failing on missing non-source-gap
event refs. That fixes the stale local inventory/comparison mismatch from later-month intervention
runs: the March 2026 export now has 913 intervention events, 741 intervention comparisons, and
`verify d1` passes with 0 issues.

## [2026-06-06] engineering | Route timeline serving projection pilot added

Added `docs tier2 route-timeline-serving-projection`, a deterministic projection from the
route-timeline bundle index into serving-addressable rows. The command emits a compact
`route_timeline_index` schema/seed, `route_artifact` refs named `route_timeline_bundle`, an R2 copy
plan, JSON/Markdown summaries, and SHA-256/byte-length metadata for each timeline bundle. The
B46/B82/BX41/M15 pilot generated 4 timeline-index rows, 4 artifact refs, 3 `timeline_ready` routes,
1 `timeline_sparse` route, 13 default events, 72 total events, 0 validation warnings/errors, and
345,542 bundle bytes. The generated SQL was replayed into an in-memory SQLite database as a serving
projection sanity check.

## [2026-06-06] engineering | Route speed availability applied-research cutover

Moved `check route-speed-availability` month parsing, route normalization, month status
classification, requested-month fallback, rebuild-decision policy, result construction, and artifact
path naming into `@bp/applied-research/evaluation` and `@bp/applied-research/artifacts`. The
pipeline command now keeps source manifest loading, Socrata query/fetch plumbing, CLI validation,
compatibility artifact reads, and JSON writes.

## [2026-06-06] engineering | Evaluation artifacts applied-research cutover

Moved `evaluation artifacts` payload construction, intervention-event filtering, artifact path/key
naming, manifest construction, SHA-256/byte-count metadata, manifest parsing, payload contract
checks, file hash verification, and expected-row-count policy into
`@bp/applied-research/evaluation` and `@bp/applied-research/artifacts`. The pipeline command now
keeps local SQLite row reads, CLI option handling, and JSON file writes. Added fixture coverage for
valid artifact manifests, tampered payload detection, row-count mismatches, and a pipeline boundary
guard against command-local hashing and manifest policy.

## [2026-06-06] engineering | Map artifact manifest applied-research cutover

Moved `map artifacts` path/key naming, JSON/GeoJSON content-type constants, SHA-256 metadata,
artifact-entry construction, manifest construction, manifest parsing, required-artifact checks,
route-segment payload validation, file hash verification, and expected public-route coverage policy
into `@bp/applied-research/artifacts` and `@bp/applied-research/evaluation`. The pipeline command
still owns source snapshot reads, local route/segment/bus-lane row reads, spatial projection, and
JSON file writes. Added direct package tests for valid manifests, tampered files, and missing public
route-segment artifacts, plus a pipeline boundary test against command-local manifest policy.

## [2026-06-06] engineering | Brief artifact renderer applied-research cutover

Moved route/corridor brief artifact key naming, source-reference policy, observed-reliability
window grouping/ranking, JSON/Markdown/HTML rendering, content-type assignment, file byte counts,
and SHA-256 metadata into `@bp/applied-research/route-briefs`. The `brief artifacts` command now
keeps local SQLite row loading, artifact file writes, and route/corridor artifact DB replacement.
Added direct package tests for route/corridor brief files and reliability windows plus a pipeline
boundary test against command-local rendering, hashing, and window ranking.

## [2026-06-06] engineering | Express route analysis applied-research cutover

Moved express bus capacity context aggregation and express load/speed screening policy out of
`tools/pipeline-v2`. `@bp/applied-research/feature-history` now owns normalized capacity row
contracts, route/hour capacity summaries, capacity-window and speed-window aggregation, load/speed
banding thresholds, screening candidate flags, route summaries, analysis artifact validation, and
audit issue construction. `@bp/applied-research/artifacts` owns the express capacity summary,
load/speed context, and audit artifact paths. Pipeline commands now keep normalized artifact
loading, Socrata speed-query fetching, route filtering, CLI options, and JSON writes.

## [2026-06-06] engineering | Route timeline date-ref repair

Added a deterministic `docs tier2 route-timeline-curation-repair` step for route timeline curation
outputs. The repair reads the source curation pack and accepted tool-call output, uses the existing
validator's unambiguous date-resolution suggestions, and backfills omitted `dateAssertionRefs`
without asking the LLM to rewrite dates or timeline events. The B46 ref-first pilot repaired 7
events, added 26 date assertion refs, and reduced validation warnings from 7 to 0 before rebuilding
the frontend-ready timeline bundle. Display dates/layers stayed unchanged; only the date source
changed from implicit backfill to explicit `date_assertion_ref`.
Added `docs tier2 route-timeline-bundle-index` as the deterministic route-level manifest over
timeline bundles. The pilot index for B46, B82, BX41, and M15 has 4 valid bundles, 3
`timeline_ready` routes, 1 `timeline_sparse` route, 13 default events, 72 total events, 0 validation
warnings/errors, and 118,079 source-run LLM tokens recorded from the curation artifacts.

## [2026-06-06] engineering | Parking location helper cutover

Moved deterministic parking-location normalization helpers into `@bp/applied-research/local-db`.
The package now owns parking borough/street normalization, camera and street-code-house location
keys, camera-location parsing, street corridor keys, numeric house-number parsing, and stable match
evidence hashes without importing `@bp/sources`. `tools/pipeline-v2/src/lib/parking-location.ts` is
now a compatibility re-export, and `build parking-violation-matches` imports the package-owned
helpers while retaining geocoder/env setup, raw snapshot file loading, SQL matching, and audit
writes.
The parking violation match audit path convention now lives in `@bp/applied-research/artifacts`.
Parking violation match audit summary SQL and audit artifact shaping also moved into
`@bp/applied-research/local-db`, along with the audit-only location-group count probe, location-key
refresh, camera/address match-group selectors, and match-table clear/insert persistence with match
weighting. LION segment lookup, physical-id route loading, and street-corridor route indexing for
parking matches also moved to the package. The package now owns deterministic street-code-house
match resolution and house-number range policy. Raw parking and LION field hydration transforms now
live in applied-research too; the pipeline command keeps raw snapshot file discovery/JSON loading,
Geoclient setup, run counts, and artifact writes. Camera match request construction and match policy
also moved into applied-research using a plain geocode outcome object, so the command only performs
the injected Geocoder call. The local DB rebuild loop now lives in applied-research too: it clears
matches, scans camera/address groups, calls the injected camera geocoder callback, resolves package
matches, inserts match rows, and returns scanned counts.

## [2026-06-06] engineering | Data-product registry applied-research cutover

Moved the data-product manifest schema, parser, and release manifest from
`tools/pipeline-v2/src/registry` into `@bp/applied-research/data-products`, using `zod` directly
instead of the pipeline CLI framework. The pipeline registry path is now a compatibility re-export,
and audit commands that need the manifest import it from applied-research. The default
data-product completeness artifact path also moved to `@bp/applied-research/artifacts`.
Data-product completeness status, reason, gap-class, dependency root-cause, count, and coverage
summary policy now lives in `@bp/applied-research/data-products`. Data-product route-universe
derivation, latest GTFS run selection, and local SQLite table check evaluation now live in
`@bp/applied-research/local-db`; the pipeline command keeps source-year waiver/artifact and
filesystem-backed checks, delegates score-vector route parsing and JSON artifact semantic reasons
to `@bp/applied-research/data-products`, then delegates product classification.

## [2026-06-06] engineering | Observed headways applied-research cutover

Moved `build observed-headways` derivation and persistence orchestration out of `tools/pipeline-v2`.
`@bp/applied-research/local-db` now owns GTFS-RT vehicle-position stop-event deduplication,
successive-vehicle observed headway construction, and the local observed-headway DB write wrapper.
The pipeline command remains the Bun CLI adapter: it opens the local DB, validates options, delegates
to applied-research, and returns the run counts.

Moved `route observed-reliability` into the same observed-reliability package surface. The
route/month summary builder, month filtering, route grouping, bunching/long-gap thresholds,
expected-wait metrics, source-status rows, and local observed-reliability DB write wrapper now live
in `@bp/applied-research/local-db`. The route command now only adapts CLI flags and local DB context
before delegating to applied-research.

Moved `route reliability-baseline` scheduled-headway baseline construction into
`@bp/applied-research/local-db`. The package now owns timepoint grouping, scheduled headway interval
construction, route-level baseline summaries, long-gap windows, source-status rows, and the local
reliability baseline DB write wrapper. The route command remains the CLI/local DB adapter.

Moved `route readiness` build-readiness scoring into `@bp/applied-research/local-db`. The package
now owns missing-input detection, readiness status classification, scoring, deterministic row
ordering, and the local route-readiness DB write wrapper. The route command remains the CLI/local DB
adapter and output shaper.

Moved `route build-plan` next-batch ranking into `@bp/applied-research/local-db`. The package now
owns priority scoring, candidate ordering, selected/backlog/already-built/blocked classification,
count rollups, and the local route-build-plan DB write wrapper. The route command remains the
CLI/local DB adapter and output shaper.

Moved `route equity-context` county-proxy ACS enrichment into `@bp/applied-research/local-db`. The
package now owns route-prefix county assignment, county-level ACS tract aggregation, route equity row
construction, source-status rows, and the local route-equity DB write wrapper. The route command
remains the CLI/local DB adapter.

Moved `build context-events` source-row normalization into `@bp/applied-research/local-db`. The
package now owns context-event ID construction, parking/collision/permit/traffic/311/ACE event
mapping, ACE monthly route aggregation, and the local context-event DB write wrapper. The build
command remains the CLI/local DB adapter.

Moved `build route-lion-link` spatial route-to-LION matching into `@bp/applied-research/local-db`.
The package now owns route allowlist query construction, buffer conversion, SpatialIndex-backed
route/LION intersection queries, per-route replacement writes, and run counts. The build command
remains the spatial local DB CLI adapter.

Moved `route intervention-evaluation` event-study orchestration into
`@bp/applied-research/local-db`. The package now owns ACE, bus-lane, and document-anchor treatment
event construction, bus-lane open-date parsing, source-gap event handling, peer/descriptive
before-after comparison construction, local route/brief/trend/bus-lane row loading, and local
intervention evaluation DB writes. The pipeline command remains the CLI adapter and document-anchor
artifact loader.

Moved `build lion-geometry-index` LION geometry materialization into
`@bp/applied-research/local-db`. The package now owns GeoJSON feature unwrapping, Spatialite
geometry-column/index helpers, WKT/GeoJSON insertion, skip-rate enforcement, and run counts. The
LION command remains the spatial local DB CLI adapter, and `build route-shape-geometry-index` now
uses the package-owned route-shape geometry helper while retaining source snapshot normalization in
the pipeline.

Moved `export route-speed-history-coverage-index` local coverage-table materialization into
`@bp/applied-research/local-db`. The package now owns the
`local_route_speed_history_coverage` table contract, route-id normalization, release-month row
replacement, count rollups, and null metric defaults. The export command remains responsible for
route speed-history manifest parsing, artifact path resolution, existence checks, and CLI wiring.

Moved the Studio route-speed spine artifact builder out of the pipeline command. The stable
timepoint-node clustering, segment construction, month coverage, validation issues, route slugging,
and source-row contract now live in `@bp/applied-research/feature-history`; the speed-spine artifact
path lives in `@bp/applied-research/artifacts`; and the local `local_route_segment_speed` aggregate
row loader lives in `@bp/applied-research/local-db`. The pipeline commands now open SQLite, resolve
paths, delegate to the package APIs, and write JSON artifacts/manifests. The all-route
speed-spines manifest now also delegates readiness classification to feature-history, manifest path
naming to artifacts, and candidate/catalog route probes to local-db.
Moved the Studio route-speed history artifact builder into the same package-owned surface. Segment
/daypart cell construction, expected-service derivation from schedule stop pairs, speed-history
artifact path naming, and local speed/schedule row loading now live in
`@bp/applied-research/feature-history`, `@bp/applied-research/artifacts`, and
`@bp/applied-research/local-db`; the pipeline command reads the spine artifact, opens SQLite,
delegates to those APIs, and writes JSON.

## [2026-06-06] engineering | Review-packet local DB hard cutover

Moved `findings review-packets` local row selection into `@bp/applied-research/local-db`. The
pipeline command now opens the local SQLite database, reads any existing packet-id artifact, passes
package-owned candidate/evidence/coverage rows into `@bp/applied-research/review-packets`, and
writes the detector specs, review packets, promotion queue, review queue, and coverage artifacts.
Added applied-research coverage for the SQLite row loader and a pipeline boundary test to keep
finding-table SQL and domain schema parsing out of the command.

Extended the same cutover to `findings coverage-audit`: detector coverage artifact construction now
lives under `@bp/applied-research/evaluation`, and local finding summary/top-candidate row loading
lives under `@bp/applied-research/local-db`. The pipeline command now only opens SQLite, delegates
to the package APIs, and writes `detector-coverage-audit.json`.

Moved `audit review-packet-coverage` gate policy into `@bp/applied-research/evaluation`. The
package now owns review-packet coverage status, severity, summary, and gap evaluation; the pipeline
command is reduced to release-month/path resolution, JSON input loading, package delegation, and CLI
output shaping.

Moved `evaluate detectors` artifact path conventions into `@bp/applied-research/artifacts`. The
package now owns the detector-evaluation output/markdown path and the full input artifact path
bundle for review decisions, packets, queues, coverage, score vectors, labels, grain audits, and
readiness. The evaluation command now resolves CLI roots/months, delegates path construction, reads
the JSON inputs, and writes the evaluation JSON/Markdown.

Moved `build context-event-route-touches` route-touch materialization into
`@bp/applied-research/local-db`. The package now owns direct route, LION-link, and parking-location
route-touch SQL plus source/event-kind audit rollups, while `@bp/applied-research/artifacts` owns
the audit path convention. The pipeline command remains the local DB/CLI shell and JSON writer.

Moved `build intervention-panel` into the applied-research causal surface. Local
`local_route_intervention_comparison` row loading now lives in `@bp/applied-research/local-db`, the
associational intervention-panel artifact builder lives in `@bp/applied-research/causal`, and the
artifact path convention lives in `@bp/applied-research/artifacts`. The pipeline command now opens
SQLite, delegates row loading and artifact construction, and writes the JSON.

Added the `@bp/applied-research/feature-history` subpath and moved `build route-hourly-profile` to
it. Local `local_route_hourly_ridership` profile row loading now lives in
`@bp/applied-research/local-db`, compact route-month hourly profile artifact construction lives in
`@bp/applied-research/feature-history`, and the route-hourly profile path convention lives in
`@bp/applied-research/artifacts`.

Moved `build segment-daypart-history` to the same feature-history boundary. Local
`local_route_segment_speed` segment/daypart aggregation now lives in `@bp/applied-research/local-db`,
the compact segment-daypart history artifact builder lives in `@bp/applied-research/feature-history`,
and the segment-daypart history path convention lives in `@bp/applied-research/artifacts`.

Continued the score-vector cutover for `build ewt-score-vectors`: local route-month reliability row
loading and customer-journey ABST enrichment now live under `@bp/applied-research/local-db`, the EWT
study wrapper lives under `@bp/applied-research/score-vectors`, and the artifact path convention
lives under `@bp/applied-research/artifacts`. The pipeline command now only parses flags, opens the
local DB, delegates to applied-research, and writes the EWT score-vector JSON.

Moved `build speed-pace-score-vectors` to the same shell shape. Local segment-speed month discovery
and row loading now live under `@bp/applied-research/local-db`, the score-vector study wrapper lives
under `@bp/applied-research/score-vectors`, and the path convention lives under
`@bp/applied-research/artifacts`. Added package coverage for the local SQLite study path and a
pipeline boundary test to keep segment-speed SQL out of the command.

Moved `build runtime-trend-score-vectors` to the same shell shape. Local observed-runtime,
scheduled-stop, and route-metric history row loading now live under `@bp/applied-research/local-db`,
the runtime/trend score-vector study wrapper lives under `@bp/applied-research/score-vectors`, and
the path convention lives under `@bp/applied-research/artifacts`. Added package coverage for the
local SQLite study path and a pipeline boundary test to keep runtime/schedule/history SQL out of the
command.

Moved `build detector-evaluation-labels` to the same shell shape. Local coverage-label source row
selection now lives under `@bp/applied-research/local-db`, deterministic label-set construction
stays under `@bp/applied-research/evaluation`, and the artifact path convention lives under
`@bp/applied-research/artifacts`. Added package coverage for the local SQLite selector and a
pipeline boundary test to keep coverage-audit SQL out of the command.

Moved `findings repair-persistent-speed-coverage` repair construction and missing-segment row
selection into `@bp/applied-research`. `@bp/applied-research/evaluation` now builds the exact
segment-scope coverage repair rows, `@bp/applied-research/local-db` owns the local
candidate/evidence/coverage selector, and the pipeline command retains only CLI parsing, DB opening,
optional insert transaction, and count reporting.

Moved `audit speed-pace-shadow` and `audit route-month-shadow` to the package-owned detector shadow
audit surface. `@bp/applied-research/evaluation` now builds both shadow-audit artifacts,
`@bp/applied-research/local-db` owns their local coverage/candidate row selectors, and
`@bp/applied-research/artifacts` owns the detector-shadow-audit path conventions. The pipeline
commands now parse flags, open SQLite, delegate to applied-research, and write the JSON artifacts.

Started the `audit detector-corpus-grain` cutover by moving release-month candidate and coverage
count selection out of the command. `@bp/applied-research/local-db` now owns the
`local_finding_candidate` and `local_finding_coverage_audit` count loaders, including missing-reason
rollups and absent-table handling. The pipeline audit builder now receives package-loaded coverage
maps instead of issuing finding-table SQL itself.

Finished the next `audit detector-corpus-grain` hard-cutover slice: `@bp/applied-research/evaluation`
now owns the corpus-grain audit builder, release checks, feature-grain profiles, and markdown
renderer. `tools/pipeline-v2` is reduced to CLI parsing, manifest/completeness/shadow-artifact
loading, local SQLite opening, package delegation, and JSON/Markdown writes for this audit.

Moved `build stop-direction-hour-ewt-features` to the same package shell. GTFS static calendar
expansion, Socrata/timepoint schedule row loading, observed-headway row loading, and SQLite-backed
artifact construction now live in `@bp/applied-research/local-db`; the default artifact path helper
lives in `@bp/applied-research/artifacts`. The pipeline command now parses options, opens SQLite,
delegates to applied-research, and writes the feature artifact.

Moved `build detector-gold-set-evaluation` out of pipeline analytics orchestration. Gold-set
expectation construction, promoted/flagged scope matching, missing-data discovery scope assembly,
and calibration evaluation now live in `@bp/applied-research/evaluation`; the default artifact path
lives in `@bp/applied-research/artifacts`. The pipeline command now only resolves paths, reads the
input artifacts, delegates to applied-research, and writes `gold-set-evaluation.json`.

Moved `audit analytics-corpus-profile` to the same package shell. Local corpus observation SQL row
loading now lives in `@bp/applied-research/local-db`; profile artifact construction and doctrine
live in `@bp/applied-research/evaluation`; path naming lives in
`@bp/applied-research/artifacts`. The pipeline command now parses flags, opens SQLite, delegates,
and writes `profile.json`.

Moved `audit analytics-backfill-coverage` to the same package boundary. Local backfill surface row
loading now lives in `@bp/applied-research/local-db`; coverage audit construction, thresholds, and
next-action logic live in `@bp/applied-research/evaluation`; path naming lives in
`@bp/applied-research/artifacts`. `audit analytics-detector-readiness` now imports that package
surface for its nested backfill coverage artifact instead of reaching into the backfill command.

Moved `audit detector-closure` out of pipeline evaluation orchestration. Analysis dependency
closure construction, planned research-unit dependency policy, status rollups, and Markdown
rendering now live in `@bp/applied-research/evaluation`; closure JSON/Markdown path naming lives in
`@bp/applied-research/artifacts`. The pipeline command now resolves paths, parses the data-product
manifest, reads prerequisite artifacts, delegates to applied-research, and writes JSON/Markdown.

Moved `audit route-schedule-progress` SQLite aggregation out of the pipeline command. Socrata
schedule progress and GTFS static run summaries now live in `@bp/applied-research/local-db`; the
pipeline command now only resolves the local DB path, opens SQLite, delegates to applied-research,
and returns the audit payload.

Moved `findings lattice-review-bundles` preview orchestration out of pipeline. Route input shaping
from review packets and signal features, lattice preview artifact construction, and Markdown/HTML
rendering now live in `@bp/applied-research/review-packets`; the pipeline command resolves paths,
reads artifacts, delegates, and writes JSON/Markdown/HTML.

Moved `audit analytics-detector-readiness` out of pipeline analytics orchestration. Detector
calibration-policy readiness joins, required-surface status rollups, and next-action construction now
live in `@bp/applied-research/evaluation`; direct observed-headway, bus-wait, GTFS schedule,
permit-touch, and 311-touch surface probes now live in `@bp/applied-research/local-db`; readiness
path naming lives in `@bp/applied-research/artifacts`. The pipeline command opens SQLite, builds the
nested backfill coverage through package APIs, delegates readiness construction, and writes JSON.

Tightened `findings repair-persistent-speed-coverage` so the pipeline command no longer imports
`@bp/analytics` directly for the persistent-speed detector id. The repair-specific detector id is
now exposed by `@bp/applied-research/evaluation`, keeping detector constants and repair construction
behind the applied-research package boundary while the command remains the optional local insert
shell.

Moved `audit analytics-materialization-coverage` out of pipeline audit orchestration. Route universe
probing, local route-table coverage checks, route-slice/brief/EWT artifact discovery, score-vector
route extraction, materialization status rollups, and next-action construction now live in
`@bp/applied-research/evaluation`; materialization coverage path naming lives in
`@bp/applied-research/artifacts`. The pipeline command now adapts data-product manifest metadata,
opens SQLite, delegates the audit, and writes JSON.

## [2026-06-06] engineering | Applied-research detector study hard cutover

Moved the `findings run-detector` research implementation out of `tools/pipeline-v2` and into
`@bp/applied-research`. The new `@bp/applied-research/detector-runs` study runner owns
detector-specific feature resolution, analytics-registry dispatch, and registry run-artifact
construction. `@bp/applied-research/local-db` now owns local SQLite row selectors for registry
detector studies, and `@bp/applied-research/artifacts` owns stop-direction-hour EWT feature artifact
loading.

`tools/pipeline-v2/src/commands/findings/run-detector.ts` is now a CLI/I/O shell: it parses flags,
opens the local DB, calls applied-research, optionally replaces local findings rows, and writes the
artifact. Added regression coverage so the command no longer imports `@bp/analytics` detector
functions directly. Updated applied-research/package-structure wiki implementation status to record
the hard cutover.

Continued the same hard cutover for `build detector-score-vectors`: the command now delegates local
coverage/candidate row loading to `@bp/applied-research/local-db`, detector score-vector study
construction to `@bp/applied-research/score-vectors`, and artifact path naming to
`@bp/applied-research/artifacts`. Added applied-research coverage for the study wrapper and local
SQLite row loader, plus a pipeline boundary test that keeps SQL and score-vector artifact assembly
out of the command.

## [2026-06-06] engineering | Domain contract package refactor implemented

Completed the `@bp/domain` contract-package refactor. The root export and root TS path alias are
gone, along with the old `src/index.ts`, `src/schemas.ts`, top-level `document-*.ts`, and top-level
`studio-*.ts` monolith compatibility files. Contracts now live in explicit source areas and package
subpaths for primitives, routes, maps, findings, documents, Studio, JSON Schema, and schema registry,
with nested document and Studio exports for focused consumers.

Moved Studio OpenAPI assembly into `@bp/studio-api/contracts/openapi`, centralized JSON Schema
generation in `@bp/domain/json-schema`, added package-shape tests for the new public surface, and
migrated repo consumers off root and aggregate document/Studio imports. Verification passed for
domain typecheck/test/typechecked tests, repo typecheck, unit/web/Worker tests, and the production
boundary harness. Full repo style still fails on existing app/pipeline formatting and accessibility
debt outside the domain refactor surface.

## [2026-06-06] engineering | Studio API refactor + auth-gating implementation-status audit

Audited both plans against the current branch and recorded status addenda in
[[wiki/engineering/studio-api-refactor|the Studio API hard-cutover plan]] and
`docs/architecture/public-access-auth-gating-plan.md`.

The Studio API refactor's public surface landed (explicit `contracts`/`client`/`server` subpaths, no
root or `./authoring` export, route registry), but the internal decomposition did not:
`studio/brief-drafts.ts` is still 4,202 lines and `studio/read-handlers.ts` 1,284 lines, and the
`server/*` subpaths are re-export shims over the original monoliths. The centralized dispatcher
(Phase 3) was never built — `api.ts` still uses chained handlers and hand-written route regexes.

The auth-gating plan's product/data layer largely shipped (auth taxonomy plus refined operator scopes
in the registry, `bp_guest` guest-draft ownership with claim columns, alerts/saved-searches/public-comments
surfaces, de-gated public readers). But the registry's `auth`/`cache`/`idempotency` fields are
declarative only: no request-path code reads `route.auth`; enforcement is hand-wired in the monoliths
and OpenAPI security is hand-maintained in `packages/domain/src/studio-openapi.ts`. That leaves three
auth sources of truth that can drift (idempotency declares `428` but returns `400`). The shared
keystone for both plans is the metadata-driven dispatcher; it should be the next slice before more
route surface is added.

## [2026-06-06] planning | Website surface data plan added

Added [[wiki/engineering/website_surface_data_plan|Website Surface Data Plan]] as the surface-first
planning layer for Serving Snapshot 2.0. The plan translates the broad public-facing data catalog
into product contracts for `/routes`, route detail tabs, and compare: each surface now has a product
question, primary answer, supporting data, D1/R2 placement, empty-state posture, and implementation
phase. It defines a shared route metric spine, proposes a first-class Reliability tab, expands
`/routes` from one list into multiple ranked tables (Needs Attention, Worsening Fast, Reliability
Watch, Treatment Gaps, Evidence Ready, Sparse / Partial Data, and later sections), and sketches
compare v2 around pair deltas, route history, peer cohorts, dayparts, reliability, treatments, and
evidence readiness. The plan keeps heavy ranking, history, segment persistence, detector coverage,
and evidence linking in pipeline-v2, with D1 as compact query/index storage and R2 as dense artifact
storage.

## [2026-06-06] planning | Domain contract package refactor plan recorded

Added [[wiki/engineering/domain_contract_package_refactor_plan|Domain Contract Package Refactor Plan]]
after auditing an uploaded static review of `packages/domain` against the repo's TypeScript-only,
Bun-first package rules. The plan accepts the contract-package direction and the need for explicit
subpaths, but revises the migration for this repo: no `export *` barrels, source subpath exports
before any `dist`/npm packaging lane, side-effect-free only after schema registry import-order
behavior is explicit, JSON Schema generation moved under a dedicated subpath, Studio OpenAPI
assembly coordinated with `@bp/studio-api/contracts`, and root `@bp/domain` either removed or
shrunk to a tiny primitives-only surface after consumers move.

## [2026-06-05] engineering | Snapshot 2.0 full-route API slice implemented

Implemented the first Serving Snapshot 2.0 addressability slice: domain contracts now cover
`StudioRouteIndex2`, support levels, surface flags, source-month states, projection refs, and the
nested snapshot v2 manifest; D1 reads now start from the full route catalog/readiness/summary/artifact
tables; Studio API reads expose `GET /api/v1/studio/routes?schema=2`, embed `snapshot.v2`, return
partial catalog route details instead of rich-artifact-only 404s, and serve compact
`GET /api/v1/studio/routes/:routeId/history` rows from `route_month_trend`. The web route detail
loader can consume the history endpoint, but sparse/partial semantics are intentionally kept as API
metadata and code comments rather than visible prototype UI states.

Moved the Snapshot 2.0 addressability acceptance gate into
`packages/studio-api/test/api-facade.test.ts` so the route-universe, sparse-route,
search/detail/ladder, and history-coverage invariants run in the normal fixture-backed test suite.

## [2026-06-05] planning | Snapshot 2.0 visualization + multi-year expansion and charting decision

Added two planning pages on top of the Serving Snapshot 2.0 baseline. (1)
[[wiki/engineering/serving_snapshot_2_visualization_and_multiyear|Visualization & multi-year
expansion]] promotes the served speed store from the single `2026-03` baseline to a multi-year
monthly panel (2023→present), defines three new served artifacts (`route_segment_speed_series`
decimated + full-res, `signal_month_coverage_matrix` as an honesty surface, precomputed
`natural_experiment_case` payloads), adds `series_ready`/`case_ready` support levels and surface
flags, and lays out a figure catalog organized around the curb-pulse case-study arc (pulse strip,
event-study CI, the network-vs-segment "flip", robustness forest reusing the dumbbell, episode↔permit
overlay, RD pre-registration) plus operational views (multi-year hour×month heatmap, delay bands,
small multiples). Heavy joins/event-studies stay offline in pipeline-v2; D1/R2 serve precomputed
results only. (2) [[wiki/engineering/charting_library_evaluation|Charting library evaluation]]
recommends owning a thin D3-primitive layer (d3-scale/shape/array + React SVG) for bespoke argument
figures — generalizing the hand-drawn dumbbell already in `CorridorProfile.chart.tsx` over Recharts 3
scale hooks — with uPlot (~20 KB Canvas) for dense multi-year time-series and maplibre for spatial;
visx is down-ranked on maintenance risk (React 19 only in a stalled 4.0 alpha), Recharts becomes an
incremental migration bridge to retire. Decision is exploratory/planning, not yet an ADR.

## [2026-06-05] planning | Serving Snapshot 2.0 historical and detector surfaces clarified

Updated [[wiki/engineering/serving_snapshot_2_full_route_baseline|Serving Snapshot 2.0 full-route baseline]]
so the full-route contract does not imply a route-directory-only product. Snapshot 2.0 should serve
reviewed projections from the multi-year corpus: route history summaries, detector coverage/no-hit
ledgers, detector score-vector refs, promoted findings, route/corridor timelines, evidence bundles,
and source-coverage caveats. Raw detector candidates, raw score vectors, and raw Tier 2 surfaces
remain internal/review material until promotion and publication-wording gates pass.

## [2026-06-05] data | Segment-speed methodology and cadence wording audit

Reviewed the official `MTA_BusRouteSegmentSpeeds_Overview.pdf` attachment for `kufs-yh3x` and updated
the MTA Bus Route Segment Speeds wiki page with BM2/GPS methodology, timepoint and multi-path
caveats, holiday/coarse-estimate cautions, and source-specific release-note context. Clarified that
the project should describe April/May gaps as observed source availability from
`check route-speed-availability`, not as an MTA-published "1-2 month lag" SLA. The 2026-06-05 live
availability artifact still reports March 2026 as the latest complete public speed month and May 2026
as `missing_speed`.

## [2026-06-05] engineering | Tier 2 processing resume runbook recorded

Added [[wiki/engineering/tier2_processing_status_and_resume|Tier 2 processing status and resume runbook]]
as the durable handoff for the current Tier 2 qv8/qv9/qv10 processing state. It records the
canonical merge and raw-field graduation artifact paths, the family-aware vocab synthesis queue
root, completed usable maps (`metricUnit`, `tableKind`, `eventFamily`, `claimKind`), partial and
untouched keys, remaining chunk counts, the Pioneer 429/funds stop condition, the chunk-level
resume contract, tmux resume commands, and the provider/model provenance caveat before using
DeepSeek or any non-current model in the same output root.

## [2026-06-05] engineering | Studio API public import cutover completed

Completed the hard public import cutover for `@bp/studio-api`: the old source barrels
`src/index.ts` and `src/authoring.ts` are deleted, the package has no root export and no
`./authoring` export, `apps/web` Worker imports use only `contracts` and `server/*` subpaths, and
the browser Studio API client now derives Studio paths from `@bp/studio-api/client` instead of
hand-building `/api/v1/studio/*` URLs. The API facade now returns JSON error envelopes for unknown
API routes and registry-backed `405` responses with `Allow` for known paths with the wrong method.
The deeper resource split of `brief-drafts.ts` remains a follow-up refactor, but no legacy public
package entrypoint remains.

## [2026-06-05] engineering | Studio API explicit subpath cutover started

Started the hard-cutover implementation for `@bp/studio-api`. The package export map now removes
the root `.` entry and old `./authoring` entry, replacing them with explicit `./contracts`,
`./client`, and `./server/*` subpaths. `apps/web` Worker imports now use
`@bp/studio-api/contracts` for API path classification and `@bp/studio-api/server/*` for Worker,
scheduled, env, and `BriefAuthorAgent` types. The first contract registry and client shell exist,
and package tests now verify that legacy entrypoints are not importable.

## [2026-06-05] engineering | Sources adapter cutover gates closed

Closed the remaining sources-adapter cutover gates after the Phase 1 hard export/import migration.
`@bp/sources/probes` is split into contracts, HTTP metadata transport, Socrata, realtime, redaction,
and orchestration modules; GTFS Realtime decoding now hides `gtfs-realtime-bindings` behind a
private vendor wrapper and injectable decoder; and the SODA3 client has explicit fixture coverage
for JSON/CSV/GeoJSON exports, app-token headers, range headers, retry, paging, metadata, columns,
and row counts. Added `sources soda3-range-probe`, a dry-run-by-default pipeline command with
`--execute` gated on `SOCRATA_APP_TOKEN`, so provider byte-range behavior can be recorded before
resumable archival backfills rely on it. The full source manifest now parses through the v2 CLI
while still rejecting old `api_json`/`rows_csv` fields. Verification passed for repo-wide
`check:types`, `@bp/sources` tests/typecheck, `@bp/pipeline-v2` and `@bp/studio-api` typechecks,
Studio source-refresh tests, production-boundary tests, the migrated Socrata pipeline slice, the
new range-probe fixture tests, and targeted Biome over touched TypeScript files. Full
`check:style` still has unrelated pre-existing app accessibility/format diagnostics outside this
cutover.

## [2026-06-05] engineering | Sources adapter SODA3-only phase 1 implemented

Implemented the Phase 1 hard cutover from the sources adapter plan. `@bp/sources` no longer has a
root export or broad family exports; Socrata support is SODA3-only through
`/api/v3/views/<dataset_id>/query.json` and `/export.<format>` helpers; the source manifest now
declares `api: soda3`, `default_access`, and SODA3 export backfill metadata instead of SODA2 row
URLs; and `tools/pipeline-v2` callers use focused sources subpaths plus the shared pipeline SODA3
client/token wrapper. The Studio route-speed watcher now uses the SODA3 query endpoint with
`SOCRATA_APP_TOKEN` gating rather than a direct `/resource/...` read. Verification passed for
`@bp/sources` tests/typecheck, the source-refresh Worker-facing tests, the production-boundary
harness, targeted Biome over cutover files, and the migrated pipeline Socrata command slice. The
full repo typecheck is still blocked by unrelated document-research fixture and
`normalize-agentic-payloads.ts` errors.

## [2026-06-05] engineering | Tier 2 raw-field graduation planner added

Added `docs tier2 raw-field-graduation`, a safe additive planner for agentic
`DocumentResearchSurface` outputs. The command preserves `rawPayload` as source wording, inventories
raw fields, classifies category-like fields for LLM-designed vocabulary maps, keeps routes/dates/
values/geography/evidence on deterministic catalog/parser paths, and writes both a full review plan
and compact LLM batch artifact. The qv8+qv9 run over 1,839 artifacts and 16,453 accepted surfaces
found 12 core vocabulary keys, one secondary treatment-family lane, 973 raw fields, and 7,871
distinct graduation values.

## [2026-06-05] engineering | Tier 2 agentic canonical merge artifact added

Added `docs tier2 agentic-canonical-merge`, a deterministic supersession pass for agentic extraction
self-heal plans. The command merges qv8 base, qv9 provider retries, and qv10 validator-feedback
repairs by stable `windowId`: only clean, audit-valid, zero-rejection candidates can enter the
canonical set; later clean retries replace earlier attempts; later failed retries never displace an
earlier clean artifact. The qv8+qv9+qv10 merge produced 1,339 canonical windows from 1,374 unique
windows, 15,925 accepted surfaces, 451 superseded candidate records, and 35 unresolved windows
remaining in retry/source-tool lanes.

## [2026-06-05] engineering | Tier 2 canonical raw-field graduation rerun completed

Extended `docs tier2 raw-field-graduation` to accept `--canonical-merge`, so vocabulary graduation
can read exactly the selected `canonicalArtifacts[].artifactPath` set instead of walking dirty retry
folders. The canonical qv8+qv9+qv10 rerun used 1,339 selected artifacts and 15,925 accepted surfaces,
matching the canonical merge surface-kind counts exactly. It found 956 raw fields, 13 graduation
keys, 22 LLM-vocabulary source fields, and 7,729 distinct graduation values; the canonical LLM batch
artifact was generated with no per-key value omissions.

## [2026-06-05] engineering | Studio API hard-cutover refactor plan recorded

Added [[wiki/engineering/studio-api-refactor|Studio API hard-cutover refactor]] as the canonical
successor to the earlier package-first extraction plan. The new plan makes the cutover explicit:
remove the `@bp/studio-api` root export, remove the old `@bp/studio-api/authoring` export, split
browser-safe `contracts` and `client` from Worker/server-only subpaths, generate route matching and
OpenAPI from one registry, replace duplicated `apps/web` route/client logic, and delete legacy
surfaces after the app and Worker imports are updated. The plan also makes cache, CSRF,
idempotency, JSON error envelopes, import smoke tests, Worker runtime tests, and LOC reduction part
of the completion definition rather than optional cleanup.

## [2026-06-05] engineering | Sources adapter SODA3-only cutover decision recorded

Added [[wiki/engineering/sources_adapter_cutover_plan|Sources Adapter Cutover Plan]] as the Phase 1
decision record for hard-cutting `@bp/sources` into a focused internal source adapter SDK. The plan
locks SODA3 as the only first-class Socrata path: query/export under
`/api/v3/views/<dataset_id>/...`, app-token/header identification, no public SODA2 compatibility
helpers, and no root `@bp/sources` export. A repo inventory found 31 current Socrata manifest
records and no policy reason to preserve SODA2, but it also surfaced concrete cutover blockers:
old `/resource/...` manifest fields, old Socrata client helpers, broad `tools/pipeline-v2` imports,
old URL assertions in tests, and one Studio source-refresh runtime read. Byte-range/resumable export
support remains a project requirement, but official docs reviewed for this decision do not clearly
document byte-range semantics, so the implementation phase must prove it with fixture-backed tests
and an opt-in integration probe before resumable archival backfills rely on it.

## [2026-06-05] engineering | Tier 2 agentic self-healing architecture started

Added [[wiki/engineering/tier2_agentic_self_healing_architecture|Tier 2 Agentic Self-Healing Architecture]]
and the first artifact-producing planner for agentic extraction runs. The runner now has an
explicit lane model for clean, pending/in-progress, worker retry, provider transient retry,
tool-response retry, validator-feedback retry, source-tool enrichment, and quarantine outcomes.
The policy is intentionally bounded: provider and tool-call failures can retry, validator failures
can retry with prior feedback, missing-data/absence claims require source-shell/PDF search evidence,
and unexplained blockers quarantine instead of being silently coerced into passing rows.

## [2026-06-04] planning | Website data expansion plan started

Added [[wiki/engineering/website_data_expansion_plan|Website Data Expansion Plan]] to turn the
"show more data" goal into a Serving Snapshot 2.0 roadmap. The plan assumes Tier 2 is done and the
local corpus is already broadly extracted, so the first priority is not more ingestion; it is richer
audited serving projections and UI surfaces over existing data. Initial lanes are a release-level
snapshot manifest, richer route-detail data (real maps, hour/daypart profiles, direction splits,
headway histograms, context strips), Tier 2 route timelines, an evidence/source catalog, expanded
promoted findings, and later cohort-aware compare views. The plan keeps D1 as compact index/control
plane, R2 as immutable artifact plane, `/api/v1/studio/*` as the public contract, and
observed/reviewed/proxy/unavailable/research-only posture as the gate for every displayed field.

Follow-up clarification: the plan now treats NYC DOT bus lanes as a first-class corpus surface, not
only a fixed route-linked list. The snapshot manifest should count source lane rows, mappable lane
features, route-linked lane features, and unlinked lane features; the website should add
`/api/v1/studio/data/bus-lanes*` resources, an all-bus-lanes map layer, and route-linked
highlighting as a derived view. The current local citywide bus-lane GeoJSON has 3,048 mappable
features, so the first expansion slice can start from existing lane artifacts before new ingestion.

Second clarification: the primary product baseline is the full served MTA bus-route universe. The
website should show every public route with route-level corpus data, not a curated sample, fixed demo
list, or route set defined by bus-lane links. Bus lanes are a supporting layer; route index, search,
detail URLs, and per-route availability states should be driven from the full route universe
projection.

## [2026-06-04] engineering | Agentic authority gate implemented and canary-audited

Implemented the source-statement authority contract in the Tier 2 agentic extraction
harness. `metric_observation`, `claim`, and `causal_claim` rows now receive canonical
`sourceClaimAuthority`, `truthStatus`, and `publicationWordingGate` fields through
deterministic repair from explicit payload authority first, then stable official source
metadata such as `nyc_dot_*` source ids/groups. The audit now blocks source-statement
rows missing those fields and blocks agentic rows that try to self-label as
`deterministic_project_metric`.

Confirmation runs used the patched runner against real prior model outputs: B44/Nostrand
page 24 replay accepted 22/22 drafts with 9/9 source-statement rows labeled
`official_nyc_dot`; BX6 page 9 replay accepted 18/18 with 8/8 source-statement rows
labeled `official_nyc_dot`; Woodhaven page 19 replay accepted 15/15 with 5/5
source-statement rows labeled `official_nyc_dot`. All three audits had 0 blockers, and
manual source checks matched the supported OCR block/line evidence for the key
metrics/claims. A fresh one-window Woodhaven live attempt after the patch produced
`llm_provider_failed` and was audit-blocked, so full-run readiness still depends on
retry queues/provider sharding rather than fire-and-forget execution.

## [2026-06-04] engineering | SSR (TanStack Start) migration sketch for the public web app

Scoped whether to move `apps/web` from its current client-rendered TanStack Router SPA to SSR.
Grounded the decision in the actual stack: the Worker already injects per-route `<head>` SEO at the
edge (`withSpaSeo`/`injectSeoIntoHtml`), so meta-tag SEO is not the reason. The one
architecture-specific benefit is collapsing the browser→Worker `/api/*` data round-trip on content
pages into an in-process D1 read, because the renderer and the database would share the same Worker
— a direct LCP win on `/`, `/findings`, `/briefs`, `/compare`, `/routes/$`. SSR does not shrink the
JS budget and adds render CPU on the request path; map/auth/studio routes stay client-rendered.
Recorded the recommended shape (TanStack Start, per-route opt-in), what the migration touches
(client/server entries, the worker asset/SSR branch split, which loaders move server-side reusing
existing `@bp/db/d1` functions), phasing, and verification in
`knowledge/wiki/engineering/web_ssr_tanstack_start_migration_plan.md`.

Refined the topology after discussion: SSR and worker-count are orthogonal. Leaning toward a
**two-worker split** — a site worker (SSR + assets, D1/R2 **read** only) and an API/data worker
(`/api/*`, cron, `BriefAuthorAgent` DO, AI, read+write). A D1 database binds to multiple Workers, so
the site worker reads D1 **directly** in SSR loaders without losing the LCP win (the win was avoiding
the browser→Worker hop, not API co-location). Keep `/api/*` same-origin (path-route or service
binding) to preserve the `SameSite=Lax` `bp_session` cookie and avoid CORS. Prefer a split-first,
still-SPA phase before adding SSR. Draft only; an ADR follows once a one-route spike proves the LCP
delta and the topology choice.

## [2026-06-04] engineering | Agentic Tier 2 downstream use and field-support contract clarified

Clarified that the agentic Tier 2 corpus is not merely a brief-generation input. Its first-order
use is a reviewable document-evidence layer for detector official context, detector caveats,
counter-evidence, source-gap queues, treatment/date inventories, causal-study windows, gold-label
seeds, review packets, promoted findings, and only then route/corridor briefs. Raw accepted
agentic outputs remain research surfaces; detectors still decide candidate structure from typed
feature corpora, while document surfaces explain, corroborate, contradict, or fill official-source
gaps around those candidates.

Also recorded the `evidenceByField` stability contract. Current keys are
`document-research-draft-v2-dotpath` paths into `DocumentResearchSurfaceDraftV2`, such as
`rawText`, `displayLabel`, and `rawPayload.routeTextRaw`, validated by the deterministic resolver
and materialized into accepted `fieldSupport` rows. Future field-id helpers must either preserve
that path scheme or add an explicit resolver version plus migration; downstream consumers should
read verifier-materialized `fieldSupport`, not rebuild support through ad hoc string parsing.

Follow-up authority audit: a strict, line-backed extraction from official MTA/DOT material should
be treated as authoritative for what the agency source states, even though it is not automatically a
Studio-computed metric or causal conclusion. The current clean agentic canary has 27 deduped
audit-clean NYC DOT windows and 449 accepted surfaces; 98/99 metric observations have exact
verified `rawText` support and 65/67 claim surfaces carry authority-like payload fields. The gap is
canonical authority typing: 0/99 metric observations currently carry the canonical
`metricAuthority`/`truthStatus` fields in the accepted agentic surface, even when source authority
appears as ad hoc `authorityRaw`, and only 20/99 metric observations have separately verified
metric-value field paths. Before full unattended scale, require or deterministically derive
canonical `sourceClaimAuthority`, `truthStatus`, and `publicationWordingGate` fields for
source-stated metrics/effect claims.

## [2026-06-04] engineering | Agentic Tier 2 canary passed controlled-run gate

Expanded the agentic Tier 2 extraction harness from the initial smoke into a broader live canary.
Added explicit live-run controls (`timeoutMs`, `maxAttempts`), provider-failure preservation as
audit-blocked artifacts, and deterministic normalization of empty optional tool/draft notes before
schema parsing. The empty-note fix salvaged otherwise-valid BX6/B82/Fordham-style outputs that had
previously forced repair calls and timeouts.

Current evidence: 27 audit-clean live windows and 449 accepted surfaces across the smoke, main
canary, failed-window rerun, and extra canary, with 0 final rejected drafts, 0 validation issues,
and 0 audit blockers on the clean outputs. The only persistent residual is
`nyc_dot_bus_priority_document_pdf_lower_montauk_final_report_jan2018:218`, a rail-study
station/time table and O&M methodology page with no bus route lookup, which still times out as a
single-window run. Treat the harness as ready for a controlled full run with audit-driven retry
queues and residual review, not as a fire-and-forget unattended run.

## [2026-06-04] engineering | Agentic Tier 2 extraction harness live smoke

Implemented the first runnable agentic Tier 2 extraction loop in `tools/pipeline-v2`.
The batch command builds source-window requests from discovery block indexes, OCR evidence
handles, evidence-backed route lookup text, and prior discovery context marked as hint-only.
The audit command deterministically blocks final validation failures, unsupported route lookup
text, non-canonical route field paths, missing-data claims without search transcripts, unresolved
evidence paths, and unresolved route raw-text paths. The runner also fills missing
`rawPayload.routeTextRaw` from evidence-backed lookup text when the model selected validated route
IDs but omitted the raw field.

Live smoke results: M34/M34A newsletter pages 1-4 produced 58 accepted surfaces with zero blockers;
a cross-source Nostrand/Woodhaven/Flatbush sample produced 56 accepted surfaces with zero blockers.
The combined clean smoke is 7 windows, 114 accepted surfaces, 0 rejected, 0 validation issues, and
0 audit blockers. Before a full run, run a larger 25-50 window canary and decide whether/how to add
document-level route context for pages whose local block text does not name routes.

## [2026-06-04] engineering | Agentic Tier 2 extraction harness goal added

Added [[wiki/engineering/agentic_tier2_extraction_harness_goal|Agentic Tier 2 extraction harness
goal]] after auditing the discovery, structured extraction, intervention-record, research-audit,
derived-surface, operational-date, proof-harness, detector, and brief-validation paths. The new
goal reframes the next pass as a source-scoped investigation harness rather than another broad
prompt: agents get OCR/PDF/source tools for page, line, table, route, metric, and prior-candidate
inspection; the runner records every tool call and hash; outputs are rich document research
surfaces plus a field-support matrix; and deterministic verification gates every research,
detector, brief, source-gap, timeline, and causal use. The core lesson is that prior extracted data
should improve recall as context, but only source/page/block/line/table-cell support can promote a
field into usable downstream data.

## [2026-06-04] engineering | Tier 2 operational-date proof harness

Added `docs tier2 proof-harness`, a dry-run-first LLM proof harness for the causal-anchor-eligible
Tier 2 operational-date rows. It builds one request per candidate from
`document-operational-date-assertions-v1.json`, can attach full source markdown from a page-markdown
manifest/root or a supplied document/corpus context file, and optionally executes a Pioneer forced
tool call.

The proof contract is intentionally strict: a `proven` result must classify the claim type, route
scope, date, treatment, and operational status, and every supporting quote must resolve against the
provided document context. Planned launches, study/design, meetings, post-implementation
observations, vague corridor scope, missing context, and fabricated quotes are rejected or left as
ambiguous/not-found proof results.
The validator also treats candidate date/month mismatch, expected-route mismatch, unsupported
treatment family, lowercase `able`/substring camera-enforcement claims, and rail/subway-only route
scope as invalid proof.

Ran the harness against the current deterministic anchors. A full dry-run over all 240
causal-anchor-eligible rows found source markdown context for all 240. Live proofing was then run
on a 5-candidate smoke batch and a 9-family stratified batch. Revalidated results: smoke `3/5`
valid proven; stratified `4/9` valid proven plus one valid ambiguous stop-consolidation case. The
invalids were useful quality signals: upstream family/date/route problems, vague operational-by
evidence, non-verbatim quotes, and treatment-family mismatches.

Ran the full 240-candidate live proof pass with cached per-candidate request/response/tool-call
artifacts under `document-operational-date-proof-requests-live-full-v1`. The initial live artifact
had 240/240 contexts and zero provider errors; after validator hardening and no-new-LLM cache
revalidation, `document-operational-date-proof-harness-live-full-revalidated-v3.json` accepts 88
valid proven proof rows across 42 distinct interventions, plus 23 valid ambiguous, 3 valid
contradicted, and 2 valid not-found outcomes. The validator now proves from exact resolved spans
only, treats unresolved extra context spans as warnings when core proof is already exact, supports
execute concurrency plus cached response reuse, and rejects ACE/ABLE/camera, signal-timing,
stop-change, and ancillary-label candidates that upstream metadata mislabeled as generic SBS or
bus-lane anchors.

## [2026-06-04] engineering | Tier 2 anchors wired into intervention-event-study input

Regenerated the full-corpus Tier 2 route-resolution and route-review-queue artifacts from the
populated v2 local DB (`data/local/pipeline.sqlite`, route-stop month `2026-03`), removing the stale
blanket `requires_historical_gtfs` validation state. The queue now defaults 1,856 route items to
route-timeline approval, 5,157 to supporting context, and 424 to manual curation.

Added the first detector bridge in `route intervention-evaluation`: it reads
`document-operational-date-assertions-v1.json`, dedupes causal-anchor-eligible rows into per-route
document treatment events, and writes them under source id
`tier2_document_operational_date_assertions` into the same local intervention tables read by
`intervention_event_study`. The bridge only admits direct event-text and single-route source-context
route links; ambiguous/current-corridor-only links remain review-queue material.

Loaded March 2026 into local v2 SQLite through a direct existing-DB open because normal CLI startup
is blocked by a local Drizzle migration-journal replay mismatch. Result: 168 document-anchor
event/comparison rows alongside 78 ACE and 495 bus-lane rows; document-anchor statuses are
`evaluated=3` and `insufficient_pre_data=165`. A direct detector-function check read all 168
document-anchor features as coverage/no-hit rows under current thresholds.

## [2026-06-03] engineering | Tier 2 operational-date assertions audited + hardened to anchor-ready

A 15-agent independent audit scored the first deterministic version 651/1000
(`ship_with_fixes`); applied-research fitness was the weak point (430) because the
artifact was a research substrate, not a causal treatment table. Fixed the verified
defects deterministically and added the adapter layer: `ace`/`able` word-boundary
matcher (false `camera_enforcement` 305→36), negated/disjunctive status guard,
expanded rail-mode/design/observation veto, a recall rescue (operational `familyRaw`
overrides a noisy `eventKind`), `parseOperationalDate` (normalized ISO date +
`implementationMonth` + precision; fixes US-slash dates and rejects non-dates), and
a route-join + cross-source dedup (`interventionId`) + `confidence` + `causalAnchorEligible`
adapter. Result: 1,157 trusted dates, **240 causal-anchor-eligible rows → 109 distinct
interventions** (realized + month-or-finer + route-linked), ~99% precise on re-review.
49 domain + 341 pipeline tests pass; both typecheck clean. Still gated before sqlite:
rebuild local DB → regenerate resolution/review-queue → wire into the detector path.
Deterministic-first per decision; an LLM re-extraction remains the escalation for
date-block provenance + residual `eventKind` mislabels. See
[[wiki/engineering/tier2_operational_date_extraction_review|the review]].

## [2026-06-03] engineering | Tier 2 operational-date assertions built deterministically + reviewed

Implemented the operational-date layer the handoff asked another session to design — deterministically,
no LLM rerun, no re-extraction. `classifyOperationalDate()` in `@bp/domain` derives a source-stated
operational date from the source's own `statusRaw` (operational-state axis) and `eventKind`
(intervention axis), with a `familyRaw`/`subtypeRaw` veto for outreach/meeting/planning/study events
and a digit-required date guard. New `docs tier2 operational-date-assertions` builder emits
`document-operational-date-assertions-v1`; `dateValidationState` in event-route-resolution and the
route-review-queue is now derived from the same classifier instead of blanket `requires_historical_gtfs`.
Ran over the full 8,428-event corpus → 929 trusted operational dates. Extensive pre-sqlite review found
and fixed three precision defects (process/meeting false positives, design/study name leakage,
placeholder dates). See [[wiki/engineering/tier2_operational_date_extraction_review|the review]].
Nothing loaded to sqlite yet — gated on sign-off; resolution/review-queue artifacts await a local-DB
rebuild. Marks [[wiki/engineering/tier2_operational_date_extraction_audit_handoff]] superseded.

## [2026-06-03] engineering | Tier 2 operational-date extraction audit handoff added

Added [[wiki/engineering/tier2_operational_date_extraction_audit_handoff|Tier 2 operational-date
extraction audit handoff]] to turn the current date-validation problem into a concrete audit and
implementation prompt. The handoff reframes historical GTFS as a route/service existence and
exposure validator, not a universal intervention-date validator, and asks the next audit to design
source-backed operational-date assertions for installation, launch, activation, enforcement,
planning, and evaluation dates.

## [2026-06-03] engineering | Tier 2 event route-resolution audit added

Added `docs tier2 event-route-resolution` and registered
`tier2_document_event_route_resolution_v1` as a tracked data product. The deterministic pass
classifies document-derived events into intervention/process/evaluation/context buckets, resolves
route identity with direct route text, source-level single-route context, and a current-GTFS
stop-street gazetteer, and explicitly keeps every event date at
`requires_historical_gtfs`. The first full-corpus run over
`tier2-full-corpus-2026-05-24-pass2` found 8,428 events, 5,020 intervention candidates, and 2,960
route-resolved candidates promotable to route review; date/occurrence validation remains blocked
on historical GTFS archive ingest.

## [2026-06-03] engineering | Tier 2 route review queue added

Added `docs tier2 route-review-queue` and registered `tier2_route_review_queue_v1`. The queue
fans route-resolved document events into one review item per route/event pair with evidence refs,
route-resolution evidence, review tasks, decision options, and priority bands. The first
full-corpus run produced 250 route queues and 7,472 route-specific review items from 2,960 source
event rows; all default to `needs_historical_gtfs_date_validation`, preserving the guardrail that
current GTFS confirms route identity but not historical occurrence dates.

## [2026-06-03] engineering | Tier 2 document-derived surfaces contract added

Added [[wiki/engineering/document_derived_surfaces_v1|Document-derived surfaces v1]] as the
final storage contract for data derived from Tier 2 OCR Markdown and discovery candidates. The
contract separates the evidence substrate, recall substrate, and research substrate; preserves raw
candidate payloads; keeps subway/PATH/LIRR/NJ Transit/Amtrak entities distinct from bus routes;
and requires lifecycle/review gates before serving, causal, or forecasting use.

## [2026-06-03] engineering | Tier 2 normalization workbench loop added

Added `docs tier2 normalization-workbench` to group canonical discovery candidates, persist
breadth-balanced model-review batches, apply only approved deterministic seed rules, and emit
denormalized document surfaces plus unresolved review queues. The first full-corpus dry run covered
155,886 normalized candidate rows, 23,584 groups, 6 approved seed rules, and 38,769 review-queue
rows. A first live `claude-opus-4-5` shard reviewed 28 groups and returned 12 proposed rules plus 3
review questions; those rules remain proposed until reviewed and converted into deterministic
approved rules.

## [2026-06-03] engineering | Tier 2 Opus research audit shards added

Added `docs tier2 research-audit` for deterministic fixture-pack construction and Pioneer/Opus
forced-tool review of Tier 2 discovery outputs. The harness now supports focused `--focus`
shards (`schema`, `gold`, `adversarial`, `causal`) after monolithic all-in-one review proved too
output-heavy. First live `claude-opus-4-5` shard outputs were written under
`data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/` for schema, gold fixtures,
adversarial risks, and causal-study scouting. The shard results converge on document-claimed
metric provenance, proposal/implementation status gates, bus-vs-rail entity mode separation,
table-family refinement, geography/methodology fields, and causal-claim gating.

## [2026-06-02] engineering | Tier 2 discovery final reconciliation and canonical curation

Classified the latest Tier 2 discovery coverage snapshot into 8,848 discovered windows, 79 runnable
failed windows, and 335 blocked windows across 18 OCR-complete sources absent from `ocr-plan.json`.
Added failure and blocked-source reconciliation artifacts under
`tier2-full-corpus-2026-05-24-pass2/`, then added `docs tier2 curate-discovery
--canonical-per-window` so curation can select one canonical extraction per source/page window by
root priority. The canonical curation artifact now has 8,848 extractions, 368 sources, 7 source
groups, and 155,886 normalized candidate rows.

## [2026-06-02] engineering | Tier 2 discovery output audit and final-schema plan

Regenerated broad Tier 2 discovery curation across all non-empty discovery roots and documented the
output audit in [[wiki/engineering/tier2_structured_extraction_harness_plan|Tier 2 Structured
Extraction Harness Plan]]. The current review corpus has 8,657 extraction artifacts from 364
sources, 150,558 normalized candidate rows, nearly universal evidence refs, and seven source groups.
The audit concludes the discovery layer is valuable but recall-heavy: final structured extraction
should first move to block-line evidence refs, expanded typed entities, document-claimed metric
observations, table-cell coordinates, stricter event status/date roles, usefulness-gated context and
review questions, deduped one-window curation, and held-out fixture scorecards before a full final
run.

## [2026-06-02] engineering | Simple geocode updates moved to Drizzle

Moved the simple pipeline geocode update statements for DOT traffic speeds, DOT traffic volumes,
NYPD collisions, DOT street permits, and 311 service requests into local Drizzle repository helpers.
The pipeline raw prepare audit now reports 35 remaining `tools/pipeline-v2` prepares, down from 40.
The remaining geocode prepares are the parking-violation address lookup and null-safe grouped
update, which stay raw pending a more careful grouped-predicate/performance slice.

## [2026-06-02] engineering | Drizzle modernization completion audit

Added [[wiki/engineering/drizzle_modernization_completion_audit|Drizzle modernization completion
audit]] and marked [[wiki/engineering/drizzle_query_modernization_plan|Drizzle query modernization
plan]] complete. The audit maps the original goal to concrete evidence: Drizzle RC pins,
`drizzle-zod` removal, the 164 GB backup, zero app-side D1 direct prepares, a production-boundary
guardrail, the separate pipeline raw prepare audit, clean Drizzle generation, local-only migration
smokes, package tests, Worker tests, typecheck, and web build.

## [2026-06-02] engineering | Pipeline raw prepare audit

Added [[wiki/engineering/pipeline_raw_prepare_audit|Pipeline raw prepare audit]] as the separate
local SQLite follow-up to the D1 Drizzle modernization. The initial audit recorded 40 direct
`bun:sqlite` `.prepare()` calls under `tools/pipeline-v2/src`, zero under
`packages/db/src/local`, and classifies them as spatial/SpatiaLite paths, bulk-ingest hot loops,
parking/geocode matching loops, and realistic Drizzle follow-up candidates. It recommends keeping
app-side D1 at a zero direct-prepare allowlist while modernizing local pipeline prepares only with
fixture-backed performance checks and schema ownership decisions.

## [2026-06-02] engineering | D1 raw prepare modernization

Removed the remaining direct `.prepare()` usage from `packages/db/src/d1/queries`. Identity,
identity surface, and Studio agent query modules now use Drizzle builders; Studio draft queries now
take `D1ServingDb` and execute their legacy helper SQL through Drizzle `sql` rather than direct
`D1Database.prepare()`. The production boundary harness now has a zero-entry D1 prepare allowlist.
Pipeline-local `tools/pipeline-v2` SQLite prepares remain out of scope for this app-side D1 slice.

## [2026-06-02] engineering | Tier 2 discovery retry observability patched

Patched the Tier 2 discovery LLM runner so future cleanup/retry failures persist per-attempt
transport traces in `error.json`: attempt number, started/ended timestamps, latency, HTTP
status/text, response headers, extracted provider request ids, response body shape, raw usage, and
transient retry flag. Discovery failures now distinguish malformed/truncated tool arguments as
`tool_arguments_unparseable` instead of reporting them as a missing tool call, while provider
gateway failures are classified as `provider_http_error`. The active
`tier2-discovery-pioneer-resume-v2` tmux process was not restarted, so this applies to subsequent
cleanup retry passes.

## [2026-06-02] operations | Tier 2 Pioneer discovery concurrency doubled

Stopped `tier2-discovery-pioneer-resume-v1` after it finalized 215 windows with 0 errors. Re-ran
coverage across all discovery roots and wrote `document-discovery-missing-windows-pioneer-resume-v2`
with 7,017 runnable windows remaining. Started tmux session
`tier2-discovery-pioneer-resume-v2` using Pioneer `deepseek-ai/DeepSeek-V4-Flash`,
`--window-concurrency 24`, and `--max-estimated-cost-usd 100`. Initial stability check showed 16
finalized v2 windows, 16 responses, and 0 errors.

## [2026-06-02] operations | Tier 2 Pioneer error observability audited

Audited `document-discovery-pioneer-resume-v2` error observability and wrote
`document-discovery-pioneer-resume-v2-error-observability-audit.json`. At the audit snapshot there
were 43 failed windows: 39 Gateway Timeout responses and 4 malformed/truncated tool-argument
responses. Every failed window had `discovery-request.json`, `block-index.json`,
`discovery-response.json`, and `error.json`, so prompt, source block index, and final provider body
are reproducible. Gaps: no per-attempt retry trace, no separate persisted HTTP status/headers, no
promoted CloudFront request id in `error.json`, misleading missing-tool-call wording for malformed
tool arguments, and no per-window latency timestamps.

## [2026-06-02] operations | Tier 2 discovery backfill switched to Pioneer

Stopped the direct DeepSeek Tier 2 discovery backfill after it finalized 1,105
`document-discovery.json` windows with 0 error artifacts. Re-ran `docs tier2 discovery-coverage`
across the run's discovery roots and wrote a fresh Pioneer resume manifest with 7,232 runnable
remaining windows. Started tmux session `tier2-discovery-pioneer-resume-v1` using Pioneer
`deepseek-ai/DeepSeek-V4-Flash`, `--window-concurrency 12`, and `--max-estimated-cost-usd 100`.
Initial stability check showed 13 finalized Pioneer windows, 13 responses, and 0 errors.

## [2026-06-02] engineering | Pioneer provider capability check added

Added `check:pioneer-provider`, an explicit live provider qualification script that loads
repo-local `.env` keys through `scripts/with-repo-env.sh`, checks the live Pioneer model catalog,
runs a forced structured tool call, and probes OpenAI-compatible cache usage shape. The latest
`deepseek-ai/DeepSeek-V4-Flash` check passed all four checks in about 7 seconds, including a forced
tool call and an observed `prompt_tokens_details.cached_tokens` cache read on a repeated short
prompt. A representative 12-window Tier 2 discovery canary then ran through Pioneer at concurrency
8 and completed 12/12 windows with 0 failures, 0 validation errors, and 0 validation warnings. The
canary produced 113 entities, 52 metrics, 12 events, 8 tables, 26 claims, 18 context signals, and
23 review questions from 125,870 total tokens, with local estimated cost about $0.024. The canary's
full extraction responses did not expose cache-read counters, so cache observability remains
run/model/prompt-shape specific rather than a blocker for Pioneer use.

## [2026-06-02] engineering | Pioneer DeepSeek Flash smoke validated

Verified the repo-local Pioneer setup for Tier 2 discovery extraction. `bun run env:check:llm`
and `scripts/with-repo-env.sh --check-llm` now confirm `PIONEER_API_KEY`,
`OPENROUTER_API_KEY`, and `DEEPSEEK_API_KEY` from gitignored `.env` files, avoiding the
false-negative `printenv` checks that previously made agents think provider keys were missing.
The live Pioneer catalog includes `deepseek-ai/DeepSeek-V4-Flash`; a direct forced-tool smoke
passed, a one-window Tier 2 discovery smoke passed, and a four-window concurrency smoke passed
with zero validation issues. Raw Pioneer responses for this model currently expose only
`prompt_tokens`, `completion_tokens`, `total_tokens`, and `prompt_tokens_details: null`; two
identical sequential cache probes also returned no cache read/write counters. This is scoped to the
OpenAI-compatible DeepSeek Flash path. Anthropic/Opus streaming can expose cache event counters such
as `cache_creation_input_tokens` and `cache_read_input_tokens`, but those events may still omit the
ordinary uncached `input_tokens` needed for exact local cost reconciliation. Treat cache accounting
as provider/model/transport-specific, persist raw usage events where available, and budget
pessimistically when uncached input token counts are absent.

## [2026-06-02] engineering | Tier 2 discovery coverage loop added

Added `docs tier2 discovery-coverage` to audit page/window coverage across OCR Markdown and
discovery extraction roots, classify windows as current, old-schema, failed, missing, OCR-blocked,
or plan-blocked, and write a runnable missing-window manifest. `docs tier2 discovery-extract` now
accepts `--window-manifest` so refactored discovery can target incomplete windows without rerunning
complete ones. The extraction runner also canonicalizes evidence-ref block hashes from the
deterministic block index, allowing models to omit `blockHash` while preserving reproducible
evidence refs. The discovery tool schema strips provider-hostile JSON Schema grammar hints such as
`format` and `propertyNames` before sending tool calls, after Pioneer-hosted providers rejected the
raw schema despite valid project contracts.

## [2026-06-02] engineering | Tier 2 assertion curation completed

Audited the only remaining `other_claim` / generic `assertion` row in the normalized Tier 2
discovery corpus. The row was a 116th Street CB11 June 2025 page-9 ridership statement backed by
daily on-bus ridership bins, October 2024 weekday context, and MTA leave-load data, so it now maps
to `performance_observation` while preserving raw family `assertion`. Regenerated the curation
audit, rules seed, and normalized candidate artifact; unresolved family counts are now 0 entities,
0 metrics, 0 claims, and 0 tables.

## [2026-06-02] engineering | Tier 2 normalized discovery candidate surface added

Extended `docs tier2 curate-discovery` so the curation pass now writes
`document-discovery-normalized-candidates-v1.json` in addition to the audit, Markdown summary, and
manual rules seed. The normalized artifact emits one source-grounded row per raw discovery
candidate, preserving raw labels and payloads while adding canonical family, stable row ID, cluster
key, and evidence refs. The first generated artifact contains 11,368 rows across entities, metrics,
events, tables, claims, context signals, and review questions. This gives the final normalized
extraction schema work a concrete corpus surface rather than relying on the raw LLM windows alone.

## [2026-06-02] engineering | Tier 2 discovery curation audit added

Added `docs tier2 curate-discovery` to audit and curate the raw Tier 2 discovery extraction
vocabulary. The command groups source coverage, validation issues, candidate counts, normalization
families, duplicate pressure, evidence policy, alias seeds, and unresolved review queues. The first
curation pass covers 582 extraction windows across 37 sources and reduces unresolved discovery
families to 0 entities, 0 metrics, 0 tables, and one intentionally generic claim kind
(`assertion`). The structured-extraction harness plan now records the curation command, artifact
names, and normalization decisions for the final schema design.

## [2026-06-02] engineering | Tier 2 document discovery layer started

Added the discovery-first document extraction layer before final normalization. The domain package
now has `bp.document_discovery_extraction_tool_response.v1` and
`bp.document_discovery_extraction.v1` schemas for raw entities, metrics, events, tables, claims,
context signals, review questions, and block/page/line evidence refs. Pipeline-v2 now exposes
`docs tier2 discovery-extract`, which writes resumable per-window block indexes and request
artifacts in dry-run mode and can execute forced-tool extraction with DeepSeek or Pioneer when
`--execute` is used. This deliberately preserves raw candidate vocabulary so the later
normalization layer can be designed from observed candidate distributions.

## [2026-06-01] engineering | Tier 2 structured extraction harness scaffolded

Implemented the first scaffold for the post-OCR Tier 2 structured extraction harness. The domain
package now has `bp.structured_document_extraction_tool_response.v1` and
`bp.structured_document_extraction.v1` schemas for page/window evidence spans, entity mentions,
claims, tables, intervention events, service changes, context signals, review questions, and
validation issues. Pipeline-v2 now exposes `docs tier2 structured-extract`, defaulting to
prepare/resume mode with one-page windows, and supports Pi-harness Pioneer-first / DeepSeek fallback
execution when `--execute` is used. The initial validator checks schema shape, source/page refs,
quote containment, evidence refs, metric value support, metric-authority discipline, and
planned-vs-implemented gates.

## [2026-06-01] planning | Tier 2 structured extraction harness planned

Added [[wiki/engineering/tier2_structured_extraction_harness_plan|Tier 2 Structured Extraction
Harness Plan]] after reviewing old OCR-to-structured artifacts, current domain schemas, manual
intervention candidates, reviewed Phase 3 records, and representative OCR Markdown pages. The plan
defines a page/window forced-tool submission shape for evidence spans, entity mentions, claims,
tables, intervention events, service changes, context signals, review questions, and extraction
audits. It also records validator gates, an extraction-quality scorecard, and implementation slices
for a fixture pack, schemas, validators, pipeline command, evaluation command, synthesis bridge,
coverage audit integration, and full-corpus backfill.

## [2026-06-01] engineering | Tier 2 structured artifact inventory added

Added `audit tier2-structured-data` to inventory historical and current Tier 2 structured document
artifacts. The audit classifies candidate bundles, raw intervention-record tool calls, reviewed
intervention records, staging events, manual candidates, publishable projections, OCR candidate
drafts, LLM traces, and report/provenance files. It identifies the current best research substrate
as the reviewed Phase 3 v3 intervention-record corpus and the best serving projection as
`intervention-publishable-v1.json`, while preserving the full-corpus reviewed-record layer as the
remaining structured-extraction gap.

## [2026-06-01] engineering | Analysis dependency closure audit added

Added `audit detector-closure` as the first dependency-closure control plane for analysis units.
The artifact joins data-product completeness, detector readiness, corpus-grain audit status,
review-packet coverage, and detector-evaluation scorecards into one per-unit closure report. The
schema is generalized beyond detectors to include planned causal, forecasting, and response-drift
units, and intervention/event-study closure now explicitly depends on the Tier 2 structured
intervention extraction layer rather than OCR text coverage alone. Registered planned
applied-research product families remain blocked/planned until their builders and validation gates
exist. The shared applied-research score now includes mechanism corroboration, search preservation,
placebo strength, temporal transportability, and regime sensitivity dimensions.

## [2026-06-01] planning | Event-family response drift scoped

Extended the curb-pulse natural-experiment plan and applied-research architecture with a
portfolio-level study family for historical event/intervention response drift. This is the transit
analogue of an announcement-effect regime shift: the same class of street event, permit, weather
threshold, enforcement action, or agency intervention can change effect sign, magnitude, or marginal
value when the binding constraint changes. The docs now define `event-family-effect-panel` and
`event-family-response-drift-study` / `event-response-drift-study` artifacts, acceptance gates,
context-regime labels, representative-case requirements, and review-gated product language.

## [2026-06-01] planning | Natural-experiment probe requirements added

Extended `knowledge/wiki/engineering/curb_pulse_natural_experiment_plan.md` after synthetic design
probes covering film-production curb occupancy, industrial weather reversals, court-calendar
rideshare pulses, cruise-terminal staging, and commercial loading-dock timing. The plan now includes
hard case-study acceptance gates, source-readiness statuses, a generic external-event-window
interface, an estimand grammar requiring quantified effects and nulls, a narrative template, a
single-primary-visual contract, candidate-library/multiple-testing controls, and fixture guidance
for near misses and false positives. These probes remain synthetic requirements discovery, not
evidence about real routes.

## [2026-06-01] planning | Curb-pulse natural experiment direction

Added `knowledge/wiki/engineering/curb_pulse_natural_experiment_plan.md` as the planning base for
a richer applied-research product direction: segment/daypart travel-time pulses, event-window
overlap, official-intervention exclusion, heterogeneous event effects, 311/boarding/placebo
mechanism checks, and local case-study artifacts. The plan positions this as a deterministic
natural-experiment workbench under `packages/applied-research`, not a route-month detector, not a
transformer training task, and not a public finding source until manual and methodology review gates
exist.

## [2026-06-01] engineering | Lattice review bundle moved out of detector registry

Moved the lattice experiment out of the detector family and into a local analyst workbench. The
analytics registry no longer exposes `lattice_opportunity`, the domain detector/reason-code lists no
longer document lattice finding codes, and the pipeline-v2 command is now
`findings lattice-review-bundles`, writing `lattice-review-bundles.{json,md,html}` review artifacts
instead of finding candidates. The pure powerset-lattice helper remains available for local
experimentation and corpus audit, but the output is not a public detector, causal method, forecast,
or Studio finding source.

## [2026-06-01] pipeline | Lattice opportunity preview artifacts

Added a local-only `findings lattice-opportunities` pipeline-v2 command that reads March finding
review packets and route signal features, runs the experimental `lattice_opportunity` detector,
and writes JSON, Markdown, and static HTML previews under `data/artifacts/findings/{month}/`.
The preview is deliberately not wired into promotion, serving releases, D1, R2, or Studio; it is a
review surface for deciding whether the lattice archetypes are useful enough to tighten.

## [2026-06-01] engineering | Lattice opportunity detector added

Implemented `lattice_opportunity` as the first cross-signal MTA opportunity detector inspired by
Lattice Deduction Transformers. The analytics package now includes a pure powerset-lattice
deduction helper, an experimental route-level detector that narrows speed, reliability,
intervention, curb/enforcement, context, schedule, treatment, and positive-deviance signals into
bespoke opportunity archetypes, and fixture tests for enforcement-gap, context-timed street
management, reliability-dispatch, positive-deviance transfer, clean no-hit, and abstention cases.
The registry now has 19 detectors and the new detector remains associational and review-gated.

## [2026-06-01] engineering | Studio Think / Workers AI generation runner

Implemented the first real Cloudflare Think / Workers AI execution slice for Studio brief
authoring. `apps/web` now carries the Think/Agents/AI SDK/Workers AI provider dependencies, deploy
Wrangler configs bind Workers AI as `AI` and `BriefAuthorAgent` as a Durable Object, and
`POST .../draft/generate` records a queued D1 generation job plus agent run before signaling the
draft-scoped `BriefAuthorAgent` with `ctx.waitUntil`. The agent calls Workers AI through
`workers-ai-provider`, exposes the existing schema-validated `proposeBriefEdit` tool, stores valid
model output as a proposal, and leaves accepted draft content unchanged until human approval. The
Worker harness uses fake `AI` and author-agent bindings so CI stays local; missing production
bindings still return `not_configured`.

## [2026-06-01] engineering | Studio agent proposal-state backend slice

Implemented the proposal approval backend slice for proposal-first Studio authoring agents. Domain
contracts now cover agent run status, proposal status, structured edit operations, repair feedback,
provenance, accepted operation ids, draft version milestones, apply/reject responses, and restore
responses. D1 migrations/query helpers add `studio_brief_agent_run`,
`studio_brief_agent_proposal`, `studio_brief_draft_version`, and D1-backed version snapshots. The
Worker exposes `POST/GET .../draft/agent-runs*`,
`POST .../draft/agent-runs/{runId}/propose-edit`, `GET .../draft/proposals/{proposalId}`,
`POST .../draft/proposals/{proposalId}/apply`, `POST .../draft/proposals/{proposalId}/reject`,
`GET .../draft/versions`, and `POST .../draft/versions/{versionId}/restore`, all operator-scoped
and D1-backed. `propose-edit` validates structured output and leaves accepted content unchanged;
`apply` mutates accepted draft content only after approval, records accepted operation ids, stores a
snapshot, creates a draft-version milestone, and supports selected-operation acceptance. OpenAPI and
client helpers now list the new endpoints; Cloudflare Think/Workers AI execution remains unwired.

## [2026-06-01] planning | Studio agent edit approvals and versions

Added `docs/architecture/studio-agent-edit-approval-versioning.md` to define how AI agent edits
modify brief content. The model is proposal-first: explicit user triggers start scoped agent runs,
the agent writes structured change sets against a known draft version/hash, authors approve all or
selected operations, and approved changes create durable draft-version milestones. This preserves
the canonical undo/redo UX for live editing while adding restoreable versions at approval,
suggestion-acceptance, publish-candidate, and promotion-receipt boundaries. Cloudflare Think remains
the real-time agent runtime; its queue is enough for short async work, while Workflows are deferred
for future long-running post-approval or multi-system recovery flows. Clarified that normal
authoring approval is approval of the agent's proposed end result, not per-tool-call approval. The
first implementation should add an internal run/proposal state machine and a `proposeBriefEdit`
tool that validates structured operations, returns machine-readable repair feedback, and stores
only valid proposals for human approval.

Clarified the Cloudflare Agent state boundary in `docs/architecture/studio-agent-stack.md`: Agent
`setState`/SQLite is useful for live synchronized run UI, current step/progress summaries, and small
reconstructable caches, but D1/R2 remain authoritative for accepted draft content, proposals,
versions, review state, idempotency, publish candidates, and promotion receipts. The default v1
BriefAuthorAgent scope is `workspaceId + briefId`, with client-originated state updates treated as
untrusted UI signals rather than approval/apply commands.

## [2026-06-01] planning | Studio brief authoring UX canon

Added `docs/architecture/studio-brief-authoring-ux.md` as the product UX canon for Studio brief
authoring. The note consolidates the canonical design handoff, AI interaction doctrine, content
graph ADR, review-collaboration model, and current live-tree frontend/backend state. It defines the
authoring thesis: the composer, review surface, triage flow, and public reader are one
document-shaped workflow; evidence appears as real inline/embedded figures; AI works through typed
artifacts marked with `◆`; review pins to prose; undo/redo replaces autosave-history chrome; and
public promotion remains deliberate and offline.

## [2026-06-01] planning | Studio agent stack scoped

Added `docs/architecture/studio-agent-stack.md` to plan the production Studio authoring-agent
stack. The note records the live-tree gap that `draft/generate` still returns `not_configured`,
chooses Cloudflare Think as the production agent runtime, keeps D1/R2 as the source of truth for
draft/public brief state, scopes tools to the same operator permissions as the REST draft API, uses
Think/Sessions for chat memory rather than product state, and defers Cloudflare Codemode until
mid-layer evidence workflows need code-shaped multi-tool orchestration.

## [2026-06-01] planning | Context-event externality reversal archetype

Extended [[wiki/engineering/detector_corpus_grain_audit_plan|Detector Corpus Grain Audit Plan]] with
a generic context-event externality reversal finding archetype. The archetype describes detector
support for short episodic segment/stop performance pulses, misattribution guards against nearby
agency interventions, context-event overlap, network-vs-local sign reversal, mechanism evidence,
placebo/demand checks, and prospective falsification. It explicitly treats this as a multi-detector
packet, not a route-specific factual claim or a single monolithic detector.

## [2026-06-01] engineering | Detector corpus grain phase 0 implemented

Implemented `audit detector-corpus-grain` in pipeline-v2 and updated
[[wiki/engineering/detector_corpus_grain_audit_plan|Detector Corpus Grain Audit Plan]] from a plan
to a Phase 0 audit artifact. The command joins the analytics detector registry, data-product
manifest/completeness status, and local findings candidate/coverage counts, writing
`data/artifacts/detector-corpus-grain/2023-04_to_2026-03/2026-03/grain-audit.{json,md}` for the
March 2026 snapshot. The first run audits all 18 registered detectors, flags 5 detectors using the
high-risk `route_month` screening grain, and shows only 8 detectors currently have release-month
coverage rows, keeping product materialization distinct from detector execution.

## [2026-06-01] planning | Detector corpus grain audit plan

Added [[wiki/engineering/detector_corpus_grain_audit_plan|Detector Corpus Grain Audit Plan]] to
separate healthy detector optimization from lossy feature collapse. The plan makes the local
analytical corpus plus detector-native feature grains the target detector substrate, reclassifies
`RouteMonthSignalFeature` as screening/route-level context rather than the canonical detector
corpus, records current March/May grain-loss evidence from `data/local/pipeline.sqlite` and
findings artifacts, and phases the next work through registry-driven corpus-grain audits,
materialization coverage, v2 findings execution, false-negative shadow audits, and release gates.

## [2026-06-01] architecture | Studio review collaboration and promotion model scoped

Added `docs/architecture/studio-review-collaboration-and-promotion.md` to settle the next backend
slice after ADR 0014/0015. Review collaboration is draft-private D1 state: anchored threads,
replies, suggested edits, resolution, optional reviewer assignment, and review gates live under the
`.../draft/comments*` namespace rather than public `comments[]`. Public promotion remains an
offline pipeline mutation: the Worker validates and exports a self-contained publish candidate,
while `studio promote-publish-candidate` merges it into immutable `studio/v1` projections and
archives private review audit data without exposing it in the public brief response.

## [2026-06-01] architecture | Studio typed brief blocks backend landed

Extended the Studio brief-draft backend with the first ADR 0015 content-graph slice. Domain schemas
now define typed `BriefBlock` variants plus `BriefRef`; D1 has `studio_brief_draft_block`; `@bp/db/d1`
exports insert/update/delete helpers; and the Worker exposes idempotency-keyed
`POST/PATCH/DELETE /api/v1/studio/briefs/{briefId}/draft/blocks*` plus
`POST /api/v1/studio/briefs/{briefId}/draft/refs/resolve` for schema normalization. Operator draft
overlays and publish-candidate export include typed blocks when present. Still open: body markdown
storage, richer corpus-backed ref resolution / Send-to-brief attach, public projection backfill, and
renderer integration.

## [2026-05-31] architecture | Studio brief-draft Worker endpoints implemented

Accepted `docs/decisions/0014-brief-draft-live-write-serving.md` and implemented the backend
foundation for Studio brief-draft authoring without building the authoring UI/UX. The Worker now
routes `/api/v1/studio/briefs/{briefId}/draft*` to D1 draft helpers exported from `@bp/db/d1`,
enforces ADR 0008 operator sessions/scopes, requires `Idempotency-Key` on draft mutations, records
generation jobs without inline LLM inference, and overlays D1 `draftStatus`/`draftPublishedAt` onto
brief reads only for authorized operators in the draft workspace. OpenAPI, in-app docs endpoint
metadata, db/Worker tests, and the agent-author/wiki architecture pages were updated. Cloudflare
Think / Workers AI execution remains a future out-of-band runner; the current generation route
honestly returns `failed` / `not_configured` rather than pretending a runner exists.

## [2026-05-31] planning | Studio brief-draft authoring Worker plan

Added [[wiki/engineering/studio_brief_draft_authoring_worker_plan|Studio Brief-Draft Authoring
Worker Plan]] after live-tree verification of the draft client contract, domain schemas, D1 query
helpers, migrations, Worker auth helpers, OpenAPI surface, and Worker test pattern. The plan keeps
public Studio reads anonymous while treating `/api/v1/studio/briefs/{briefId}/draft*` as an
authenticated AI-backed authoring surface, gates mutations by `write:briefs`, `review:briefs`, and
`publish:briefs`, uses `Idempotency-Key` for draft writes, overlays D1 draft status onto the public
brief response only for authorized operators in the draft workspace, and records generation jobs
without inline LLM inference. Cloudflare Think remains the intended future out-of-band runner, but
the current tree has no Think, Workers AI, Durable Object, Queue, or worker-loader binding wired.

## [2026-05-31] web | Methods page folded into Docs

Retired the standalone `/methods` page and its tabbed, data-driven UI. The genuinely unique
content — the metric definitions and publication caveats — moved to a new prose docs page at
`/docs/methodology` (Resources section, between Data & Credits and Changelog). The dataset and
source content was already covered by `/docs/data-credits`, which now also carries a short
derived-artifacts note and a reciprocal cross-link. `/methods` now `beforeLoad`-redirects to
`/docs/methodology`; the two inbound "methodology" links (routes home, route detail) point at the
new URL directly. Dropped the `fetchStudioMethods` web loader and deleted
`apps/web/src/studio/pages/methods.tsx`. The server endpoint `GET /api/v1/studio/methods` and its
projection/test are left live but are now UI-unused (separate retirement if desired). Updated the
prescriptive `/methods` references in [[wiki/engineering/ui_copy_doctrine|UI copy doctrine]] to
`/docs/methodology`; other historical wiki plan/audit pages still mention `/methods` and can be
swept later — this entry is the record of the cutover.

## [2026-05-31] pipeline | Root checks retargeted to pipeline-v2

Started Workstream 5 drift cleanup by retargeting root check scripts away from deleted
`tools/pipeline/src/checks/*` paths. The production-boundary harness now asserts the canonical
`@bp/pipeline-v2` CLI wrapper and rejects stale root package script references to v1. The lightweight
knowledge and web release checks now live under `tools/pipeline-v2/src/checks/`, while
`check:web-architecture` runs the cross-cutting production-boundary harness directly.

## [2026-05-31] planning | Ambitious analytics workstream prompts

Added [[wiki/engineering/ambitious_analytics_workstreams|Ambitious Analytics Workstreams]] as the
coordination page for six high-value work areas that can proceed while the historical backfill
runs: registry-driven detector operation, Serving Snapshot 2.0, a data-product completeness
registry, detector quality/loss scoring, pipeline-v2/docs drift cleanup, and research-to-detector
hardening. The page includes a 0-1,000 weighted opportunity scoring model, parallelization guidance,
disjoint write-set cautions, copy-ready prompts for separate Codex sessions, and definitions of done.

## [2026-05-31] architecture | Codemode sandbox moved to Bun/TypeScript

Accepted `docs/decisions/0013-bun-typescript-codemode-sandbox.md`, superseding the
Python-only codemode ADR for new work. The active harness tools are now `ts_exec`
and `bash_exec`; `code_execution` refs accept TypeScript or deterministic bash;
the sandbox image carries Bun, `rg`, and `jq` instead of Python/pandas/duckdb; and
the runtime bind-mounts `packages/analytics` plus `packages/domain` read-only so
agent-authored computations use the same deterministic kernel as detector code.

Pioneer/GPT-5.5 is now the default findings codemode provider/model path, configured
by `PIONEER_API_KEY` with `https://api.pioneer.ai/v1` as the default OpenAI-compatible
base URL. The LLM remains an author/prototyper,
not a detector of record: validation re-runs cited TypeScript in a clean sandbox,
and analytics package code remains free of prompt, model, sandbox, filesystem, and
agent-loop dependencies.

## [2026-05-31] analysis | Ideal detector doctrine audit

Audited and revised [[wiki/analysis/ideal_detector_system|Ideal Detector System]] against the
2026-05-30 analytics refactor and ADR 0012. The page now treats `ANALYTICS_DETECTOR_REGISTRY` as
the governing detector object, updates current reality from the stale 8-detector March pass to the
18 registered-detector kernel, and adds explicit critique of the old doctrine: it underweighted
registry lifecycle, claim-tier gates, feature-grain silence, detector retirement, and the
LLM-as-author-but-not-detector boundary.

The revised doctrine now distinguishes `FindingDetectorSpec.allowedClaimStrength` from registry
`claimTier`, updates detector-family status for reliability, schedule, speed/pace, trends,
positive deviance, intervention event panels, and context association, and replaces the old
"first detector maturity slices" backlog with next steps for registry-first runs, fleet-scale
feature materialization coverage, calibration persistence, promotion/demotion hardening,
agent-assisted detector candidates, and evaluation against findings mode.

## [2026-05-31] pipeline | Finish incomplete analytics data runner

Started `data/ops/backfills/finish-incomplete-data-20260531T030000Z/run.sh` in the
`finish-incomplete-data` tmux session. The runner is resumable enough for the current gaps: it
fills the missing May 2025 hourly-ridership month, reruns route intervention comparisons for
2023-04 through 2026-03 using the March 2026 route universe/treatment inventory, builds
GTFS-backed stop-direction-hour EWT artifacts for all eligible March and May observed-headway
routes, resumes the 2025/2024/2023 Socrata route-schedule source staging, and finishes by
refreshing route-schedule, historical backfill, materialization, and corpus-profile audits.

`route intervention-evaluation` now accepts `--route-universe-year` and
`--route-universe-month`, so historical analysis months can use a known complete route/treatment
inventory while evaluating against each month's historical speed and ridership trend rows. This
prevents zero-row historical intervention months caused only by release-snapshot route metadata
being present for March 2026.

## [2026-05-31] planning | Re-audited ADR 0012 after the analytics refactor

Rewrote `docs/decisions/0012-agent-authored-detectors.md` as a registry-first,
agent-assisted detector-authoring plan. The old 0012 draft assumed 8 hand-authored
detectors, scattered detector logic, detached detector specs, no claim-tier metadata,
and a proposed `submit_detector -> {score, flagged, evidence}` shape. The current
analytics kernel has 18 registered detectors, a uniform `AnalyticsDetector<TInput>`
contract, generated detector-spec projections, registry metadata, calibration helpers,
and reviewer/retirement primitives.

The revised plan makes `ANALYTICS_DETECTOR_REGISTRY` canonical and treats Ralph/LLM
work as detector candidate authoring, not detector-of-record execution. Agents may
prototype procedures, draft specs, or open normal TypeScript patches; accepted detector
versions still require pure analytics code, tests, deterministic admission packets,
backtests, review outcomes, and human review. This explicitly reconciles 0012 with
`ideal_detector_system.md`: the LLM may author a frozen procedure, but the harness
computes metric values and review gates decide publication.

The new gates are A0-A8: boundary, contract, determinism/scope, non-degeneracy,
novelty for new detectors, claim-tier/promotion, evidence packet, domination for
improved versions, and lifecycle. Existing helpers are reused (`summarizeScoreVector`,
`flaggedSet`, `jaccardOverlap`, `evaluateGoldSet`, `evaluateRangePrecisionRecall`,
`summarizeReviewerDecisions`, `summarizeDetectorReviewCycle`,
`summarizeFalsePositiveRootCauses`, `recommendDetectorRetirement`,
`summarizeInterventionGates`). Real gaps are called out: Spearman/rank correlation,
score-vector spread statistics, pipeline-owned detector candidate capsules, admission
packet persistence, and backtested domination policy.

`docs/decisions/0011-deep-novel-findings-mode.md` also has a short post-refactor note:
its mechanics are unchanged, but registry feature grains sharpen the non-restatement
gate, and 0011's Ralph loop is the substrate that detector mode forks. Nothing built
yet; both ADRs remain Proposed.

## [2026-05-31] pipeline | GTFS static all-stop schedule staging

Added `ingest gtfs-static`, which parses the six downloaded bus GTFS static ZIPs into local
all-stop schedule tables: routes, trips, stops, calendars, calendar exceptions, and stop_times.
The staged run `20260531T010822Z` loaded 6 bundles, 386 GTFS routes, 13,478 stops, 184,044 trips,
104 services, and 5,946,147 stop_time rows.

Added `audit route-schedule-progress` so schedule backfills are inspectable without hand-written
SQL. The audit now reports that the Socrata 2026 schedule layer has 20,351,999 rows across 375
routes and is entirely timepoint-grain, while the GTFS static layer is the all-stop schedule source
for detector-grade EWT baselines.

The stop-direction-hour EWT artifact builder now has a source selector: `gtfs_static`,
`socrata_route_schedule`, `route_schedule_timepoint`, or `auto`. It prefers GTFS static when
available, falls back through the staged Socrata schedule layer and legacy route-slice timepoints,
and labels the selected source in every artifact. A real M15 May 2026 artifact using GTFS static
produced 440,022 scheduled stop arrivals, 8,727 schedule baseline cells, and 4,279 observed feature
rows at
`data/artifacts/analytics-stop-direction-hour-ewt/2026-05/bus-observatory-2026-05/m15/stop-direction-hour-ewt-features.json`.

Also repaired the noisy pipeline command discovery warnings by restoring the expected findings
exports and adding the missing `agentBriefProposalsDir` path helper.

Verification: focused GTFS static ingest, route-schedule audit, route-schedule ingest, and
stop-direction-hour EWT tests pass. Pipeline CLI help now loads without command-discovery skip
warnings. Full pipeline typecheck remains blocked by existing domain/studio export drift and the
pre-existing Ralph `ralphDir` tool-loop type mismatch.

## [2026-06-02] engineering | Drizzle 1.0 RC modernization

Started the Drizzle query modernization end-to-end pass. Verified the current npm `rc` dist-tags for
`drizzle-orm` and `drizzle-kit` still resolve to `1.0.0-rc.3`, pinned both exact versions in the Bun
catalog, removed `drizzle-zod`, and moved D1 row validation imports to `drizzle-orm/zod`.

Before migration work, backed up local SQLite and Miniflare D1/R2/cache database state to
`/home/cjpher/backups/bus-reliability-tracker/drizzle-modernization-20260602T185845Z`
(81 SQLite/sidecar files, 164 GB).

Drizzle 1.0 RC rejects the old flat `meta/_journal.json` migration layout, while Wrangler D1 still
expects flat SQL files. The repo now keeps flat D1 SQL under `packages/db/migrations/d1` for
Wrangler/export readers and adds `packages/db/migrations-drizzle/{d1,local}` for Drizzle RC
generation and the Bun SQLite migrator. Local generation needed one catch-up migration for
`local_bus_customer_journey_metric`; the generated snapshot also records local Tier 2 tables that
were already present in hand-written migrations. The D1 schema now mirrors the write-side Studio,
identity, alert, saved-search, and public-comment tables from the later D1 migrations. Added an
architecture guardrail blocking new raw D1 `.prepare()` calls outside the current identity/Studio
allowlist.

Verification so far: `bun --filter @bp/db test`, `bun --filter @bp/db typecheck`,
`bun --filter @bp/db db:generate:d1`, `bun --filter @bp/db db:generate:local`,
disposable `BP_LOCAL_DB_PATH=... bun run db:local:migrate`, `bun run db:d1:migrate:local`, and
`bun test tests/harness/production-boundaries.test.ts --timeout 5000` pass locally. Remote D1
migrations were not run.

## [2026-05-31] planning | Drizzle 1.0 RC modernization plan

Added [[wiki/engineering/drizzle_query_modernization_plan|Drizzle Query Modernization Plan]] after
auditing the current raw-SQL clusters and checking current Drizzle registry tags. The plan now
targets an intentional Drizzle 1.0 RC upgrade, removes `drizzle-zod` in favor of
`drizzle-orm/zod`, gates the migration-folder conversion on Wrangler D1 compatibility, mirrors
newer D1 write-side tables into `packages/db/src/d1/schema.ts`, and defines how the repo should use
core query builders, future RQB v2 relations, generated row validation, local repositories, and
raw-SQL exceptions.

## [2026-05-31] analytics | 36-month ABST baseline surface

Added the official MTA Bus Customer Journey-Focused Metrics source (`8mkn-d32t`) as the compact
route-month ABST baseline surface. ABST is schedule-relative and EWT-like, but it is an official
derived aggregate rather than a first-principles GTFS schedule feature. The new ingest command is
`tools/pipeline-v2/src/commands/ingest/bus-customer-journey-metrics.ts`; it stages
`local_bus_customer_journey_metric` and pulled 2023-04..2026-03 into the local corpus: 24,344 rows,
36 months, 356 routes.

The EWT score-vector builder now joins `local_route_observed_reliability_summary` to
`local_bus_customer_journey_metric` and prefers the customer-weighted
`additional_bus_stop_time` value as `mta_abst_customer_journey_metric`, with observed-regularity
excess wait retained only as fallback. It does not replace raw schedule-derived features for
stop-direction-hour EWT, schedule mismatch, headway regularity, or detector audit packets.
Regenerated March 2026 artifact:
11,937 usable route-month rows, 11,591 baseline rows, 346 release routes, 20 release flags, and
score-basis counts of 11,737 ABST rows plus 200 observed fallback rows.

Verification: focused analytics/pipeline tests pass for the pure artifact builder, SQLite-backed
artifact command, and customer-journey ingest command.

## [2026-05-31] analytics | Raw stop-hour EWT feature path

Added the first raw schedule-derived feature path for detector-grade EWT. The pure materializer
builds stop-direction-hour feature rows from raw `local_route_schedule_timepoint` arrivals plus
`local_observed_headway_sample`; the pipeline command is
`tools/pipeline-v2/src/commands/build/stop-direction-hour-ewt-features.ts`.

The feature builder computes scheduled buses/hour and scheduled headway baselines from schedule
timepoints, joins observed headways by route/direction/stop/day type/hour, and emits audit rows
with typed missing-data states such as `baseline_unavailable`, `insufficient_headways`, and
`low_coverage`. Historical artifacts default to `month_day_type_hour` aggregation; daily/live audit
runs can use `service_date_hour`.

Materialized a March 2026 M15 artifact from `bus-observatory-2026-03` at
`data/artifacts/analytics-stop-direction-hour-ewt/2026-03/bus-observatory-2026-03/m15/stop-direction-hour-ewt-features.json`.
That route slice produced 76,369 schedule timepoints, 10,738 observed headway samples, 1,753
schedule baselines, 3,657 feature rows, and explicit missing-data/audit rows. The low ready-cell
count is expected with the current timepoint-only schedule slice and confirms this does not replace
the broader raw schedule corpus.

Verification: focused feature-builder and SQLite-backed artifact tests pass.

## [2026-05-31] pipeline | Incomplete schedule corpus backfill started

Added `ingest route-schedules` as a resumable route-by-route Socrata schedule staging command for
the 2023-2026 MTA Bus Schedules sources. The command writes `local_route_schedule_stop` keyed by
source year and route, skips already staged routes by default, and keeps this high-volume IO inside
`tools/pipeline-v2` rather than `packages/analytics`.

Smoke-ingested 2026 M15: 167,005 rows fetched and 166,693 rows written. The smoke also confirmed
an important source limitation: the Socrata schedule source still appears to be timepoint-grain for
that route (25 distinct stops, all staged rows marked timepoint), so it is useful historical
schedule context but not a substitute for all-stop GTFS `stop_times`.

Started the background backfill runner at
`data/ops/backfills/incomplete-corpus-20260531T010822Z/run.sh`. It downloads the six current bus
GTFS static ZIPs, reruns the corrected intervention-comparison range for 2023-04..2026-03, and
then stages the 2026, 2025, 2024, and 2023 Socrata schedule sources with route-level resume/skip
semantics.

Verification: route-schedule ingest, raw stop-hour EWT feature, and SQLite-backed feature command
tests pass; the background runner passed shell syntax validation and is logging to
`data/ops/backfills/incomplete-corpus-20260531T010822Z/backfill.log`.

## [2026-05-30] analytics | EWT route-month score-vector artifact path

Started the first data-driven EWT calibration artifact path. The pure score-vector builder lives in
`packages/analytics/src/calibration/ewt-route-month-score-vectors.ts`; the pipeline IO wrapper is
`tools/pipeline-v2/src/commands/build/ewt-score-vectors.ts`; and the generated March 2026 artifact
is written to
`data/artifacts/analytics-ewt-score-vectors/2023-04_to_2026-03/2026-03/ewt-route-month-score-vectors.json`.

The run exposed an important corpus distinction: historical observed reliability summaries have
AWT and average observed headway for 36 months, but schedule-based EWT is only populated for the
release month because historical scheduled expected wait is not yet backfilled. The score-vector
therefore uses observed-regularity excess wait (`AWT - mean_observed_headway / 2`) for calibration
and preserves schedule-based EWT where present as evidence. March 2026 output: 13,716 raw rows,
11,937 usable route-month rows, 11,591 pre-release baseline rows, 35 baseline months, 346 release
routes, and 29 release routes above the fleet P90 cutoff.

Verification: the fixture tests for the pure analytics builder and SQLite-backed pipeline command
pass. Full package typecheck remains blocked by existing domain/studio export drift unrelated to
this artifact path.

## [2026-05-30] pipeline | codemode findings agent: Python sandbox + code_execution evidence refs

`findings:agent-propose` gains an opt-in codemode (`--enable-codemode true`) that hands the
model a `python_exec` + `bash_exec` tool pair backed by a read-only Docker sandbox. The agent
slices the corpus by writing code instead of relying on the prompt-sliced `RouteContextDigest`.
Code the agent cites is captured as a new `code_execution` `AgentFindingProposalEvidenceRef`
kind (language, code, stdoutHash, citedValuePath); validation re-executes the code in the same
sandbox and rejects the proposal if `sha256(stdout)` doesn't match the model-declared hash.
That hash check is the deterministic gate this feature exists for — it catches model drift,
non-reproducible scripts, and tampered hashes with the same machinery that catches them at
manual review time.

ADR 0010 (`docs/decisions/0010-python-in-sandbox.md`) gates Python to the sandbox image only.
`apps/web`, `packages/`, and the rest of `tools/` stay TypeScript-only — the boundary is the
Dockerfile and the `tools/agent-corpus-lib/` package (bp_corpus: routes/signals/findings
loaders, bind-mounted into the sandbox at `/work/agent-corpus-lib`). The sandbox image
(`tools/sandbox/Dockerfile`, built via `bun run sandbox:build`) is digest-pinned (python:3.12-slim),
hash-pins its pip deps (pandas + duckdb + pyarrow) via `requirements.txt` with `--require-hashes`,
ships ripgrep + jq, and runs as a non-root user under `--network=none --read-only --cap-drop=ALL`
with `--tmpfs` scratch and ulimit caps applied by `tools/pipeline-v2/src/lib/sandbox.ts`.

Tool loop is built on `@earendil-works/pi-agent-core@^0.78.0` (pi-ai bumped 0.75 → 0.78 in the
same commit; existing call sites unaffected). `_tool_loop.ts` registers `python_exec` and
`bash_exec` as `AgentTool`s with typebox parameter schemas, dispatches through `runAgentLoop`,
and enforces per-run caps (max tool calls, total stdout bytes, walltime) via `afterToolCall`
returning `terminate` hints plus an `AbortController` signal. The trace surfaces on
`RunProposalsResult.toolUseTrace`. `validateProposal` is now async — it pre-executes unique
code refs once per proposal and threads the cache through `ValidatorContext.codeExecutionCache`.

`knowledge/wiki/data/agent_corpus_map.md` is the navigation doc the CLI loads into the system
prompt when codemode is on; it documents the bp_corpus API, mount layout, JSON shapes for the
load-bearing artifacts, five worked example sequences, and the determinism rules that keep
re-execution reproducible.

**Not yet done:** persisting `toolUseTrace` to the validation artifact (would need a schema
migration on `AgentFindingProposalValidationArtifact`); a real-model dry run against the
2026-03 fixture to capture latency/cost numbers. The CLI is wired and dry-runs cleanly with
`bun --filter @bp/pipeline-v2 cli -- findings agent-propose --year 2026 --month 3 --model
"<model-id>" --enable-codemode true`.

Verification: 215 pipeline-v2 tests + 16 domain tests + 10 sandbox wrapper tests pass; image
builds to 464 MB.

## [2026-05-29] pipeline | tools/pipeline-v2 ports complete (89/89) and monoliths split

All 89 port-rated v1 commands now have v2 implementations under
`tools/pipeline-v2/src/commands/**`. Batches A-bottom, A-top, B, C, and D are closed. The
three v1 monoliths split during port: `tier2-docs.ts` (8088 LOC) into 16 sub-commands under
`src/commands/docs/tier2/`; `studio-release.ts` (4385 LOC) into per-phase release files plus a
`studio release` entrypoint; `audit/studio-coverage.ts` (1625 LOC) into `audit/studio-coverage.ts`
with sibling helpers. The `findings:*` namespace stays deferred in v1 per
`[[scope_corpus_before_findings]]`. v2 commands are invoked through
`bun --filter @bp/pipeline-v2 cli -- <namespace> <command> [...flags]`.

As Stage 1→2 cleanup: removed `build:artifacts` from `tools/pipeline/package.json` (the last
remaining script-stale entry from `tools/pipeline-v2/inventory-audit.md`; the other 10 Cluster
A/B entries were already absent in HEAD). Collapsed root `package.json` from 114 scripts to 31
top-level orchestration entries (dev/build/deploy, the CI check matrix, the test matrix, the
`@bp/db` migration entries, `publish:serving-release`, `seed:local-studio-r2`, and a single
`pipeline` alias that proxies to the v2 CLI). The ~83 per-command `bun --filter @bp/pipeline ...`
aliases were removed; the CI workflow (`.github/workflows/ci.yml`) only uses the keepers and
needed no edits. Swept the three Tier 2 wiki files
(`knowledge/wiki/data/tier2_pipeline_completion_audit.md`,
`knowledge/wiki/data/intervention_source_coverage.md`,
`knowledge/wiki/engineering/tier_2_document_corpus_pipeline.md`) so every reference to the
retired v1 commands (`docs:ocr`, `docs:ocr-review`, `docs:validate`, `docs:promote`,
`docs:audit-promoted-source-backing`, `docs:followup-curation-bundle`,
`docs:followup-curation-decisions`, `docs:followup-curation-queue`,
`docs:followup-resolution-audit`, `docs:verify-followup-curation`, `build:artifacts`) sits
under an explicit retirement notice naming the v2 successors and the
`tier2-full-corpus-2026-05-24-pass2` historical artifact set.

**Not done; user-gated:** v1 deletion remains gated on integration testing the
rebuild-trigger workflow (plan → finalize → check → export → verify → publish) end-to-end in
v2 against the March 2026 fixture, and on the Tier 2 docs corpus pipeline
(capture → discover → ocr-plan → ocr → extract → chunk → dedupe → duplicate-decisions →
status → load-staging) end-to-end in v2. Until those two integration smokes pass,
`tools/pipeline/` stays in place and shippable.

Verification: `jq '.scripts | length' package.json` returns 31; `jq '.scripts | length'
tools/pipeline/package.json` returns 93. `grep -rn 'docs:ocr\b\|docs:ocr-review\|docs:validate\|docs:promote\|docs:followup-curation' knowledge/wiki/`
returns only references inside the explicit retirement notices and the historical prose those
notices tag as describing past pipeline state. Root `bun run check:types` carries the
pre-existing v1-side errors from untracked Tier 2/Studio working-tree code; no new errors
are introduced by the script collapse.

## [2026-05-22] engineering | Parking location candidate matching added

Added a dedicated parking location candidate layer to address the low route-join rate without
pretending parking rows are clean address records. The local schema now preserves parking
`street_code1/2/3`, `intersecting_street`, and `match_location_key`; LION now preserves `b5sc`,
`boroughcode`, and house-number ranges. The new `build:parking-violation-matches` job hydrates
those fields from raw snapshots, groups camera/intersection strings and street-code/house-number
locations, writes candidate route matches with match kind/confidence/fanout/weight, and emits
`data/artifacts/context-events/parking-violation-match-audit.json`.

Real March corpus verification: LION and parking raw fields were hydrated locally, then the full
parking match pass scanned 229 camera groups and 174,174 street-code/house groups. It produced
596,527 candidate route rows across 96,760 grouped locations, representing 3,085,310 parking events
and 367 routes. Rebuilt route touches added 30,150,878 `parking_location_match` touches. A corrected
parking verification query shows 3,128,264 joinable parking events, 3,086,633 touched events,
30,180,112 total parking touches, 378 routes, 98.67% touched among joinable events, and 53.65%
touched among all parking events. Parking remains `release_context_only` until candidate fanout and
confidence thresholds are reviewed for detector use.

## [2026-05-21] planning | Data Pipeline Finish Plan v2

Added [[wiki/engineering/data_pipeline_finish_plan_v2|Data Pipeline Finish Plan v2]] as the current
plan of record after the May production cutover and source audit. The plan folds the source coverage
ledger into historical corpus completion, keeps heavy rebuild/finalize/export work manual on this
PC, treats Worker `shouldRebuild` as a rebuild-needed signal rather than an automatic job, and
defers Cloudflare Queues until there is a concrete retry/fanout workload. The immediate tracks are:
stabilize March/May local drift, generate the coverage ledger, backfill route trends through the
latest complete public speed month, repair/exclude equity context, rebuild context features and
findings, split Worker cron behavior, add compact capture/status indexing, and prove a
production-length R2 GTFS-RT handoff before raw retention expires.

Follow-up implementation on the same day added `audit:source-coverage` and generated the March 2026
ledger at `data/artifacts/source-coverage/2026-03/ledger.json`. The real ledger classifies 12
sources: 5 complete for history, 2 requiring backfill (`route_month_trends`,
`bus_wait_assessment`), 3 release-context-only, 1 current-signal-only, and 1 excluded until fixed
(`equity_context`). March/May local drift was also cleared: `map-artifacts --year 2026 --month 3`
wrote 354 map artifacts, strict `check:pipeline-v1 --year 2026 --month 3` passed with 0 issues,
and May `gtfs-rt:preflight --year 2026 --month 5 --run-id gtfs-rt-v1-20260517T103607Z-24h`
passed with 1,143 observed-reliability source-status rows.

Route-trend ingestion now knows about the historical speed/ridership datasets in addition to the
2025+ datasets. A speed-only live backfill first expanded `local_route_month_trend` to 12,075
route-month speed rows covering 2023-04 through 2026-03. Then `backfill:route-ridership-trends`
was made historical-source-aware, chunked by month/route set, resilient to failed source batches,
and progress-reporting. Three live passes filled the remaining ridership coverage, leaving
12,075/12,075 route-month rows with both speed and ridership trends. The regenerated March source
coverage ledger now marks `route_month_trends` `complete_for_history`; strict
`check:pipeline-v1 --year 2026 --month 3` passes with `routeMonthTrendRows=12075`,
`routeMonthTrendSpeedRows=12075`, and `routeMonthTrendRidershipRows=12075`.

Bus Wait Assessment was backfilled across the same historical window, `2023-04` through `2026-03`,
using the existing month-scoped `ingest:bus-wait-assessment` command. The local table now has
46,167 rows across 36 months and 354 distinct routes. The regenerated March source coverage ledger
reports only one source needing action: `equity_context`, classified as `excluded_until_fixed`.
Attempting `ingest:equity-context --year 2024` now receives a Census API "Missing Key" HTML
response in this environment, and no `CENSUS_API_KEY` is configured; keep equity claims excluded
until the Census API key/config issue is fixed.

## [2026-05-20] engineering | Source-gap detector thresholds grounded

Completed the source-gap detector threshold pass: context joins now use a 40% minimum join-rate with a 50-row floor based on March 2026 corpus rates, bus-lane placeholder dates use the observed `2026-03-01T00:00:00.000Z` sentinel, and source lag is driven by `tools/pipeline/src/source-freshness-policy.ts` rather than detector-local policy.
Verification: root `check:types`, `@bp/analytics` tests, pipeline `findings-detect`, knowledge check, and the real March 2026 `findings:detect` run pass. The real corpus now emits 199 source-gap candidates: 115 bus-lane date gaps, 1 context-join failure, 37 insufficient GTFS-RT sample gaps, 31 missing speed gaps, 12 missing scheduled baselines, and 3 missing geometry gaps.

## [2026-05-20] engineering | Persistent speed hotspot detector added

Added the second Finding Coverage v1 detector, `persistent_speed_hotspot`, as a pure analytics pass over existing local route-hotspot outputs. The detector emits segment-scoped `persistent_low_speed` candidates with metric evidence, keeps route-level hit/clean/skipped coverage rows, and is wired into `findings:detect` after `source_gap` with idempotent local replacement per detector/month.
Verification: `bun --filter @bp/analytics test`, `bun --filter @bp/pipeline test test/findings-detect.test.ts`, `bun run check:types`, targeted Biome on touched detector/pipeline files, and the real March 2026 `findings:detect` run pass. The real corpus now emits 100 persistent-speed-hotspot candidates across 70 hit routes, with 280 clean route no-hits and 31 skipped routes lacking speed input.

## [2026-05-20] engineering | Observed reliability detector added

Added the third Finding Coverage v1 detector, `observed_reliability`, as a pure analytics pass over observed GTFS-RT route summaries, scheduled headway baselines, and MTA Bus Wait Assessment corroboration. The detector emits route-scoped `high_long_gap_share` candidates only when observed samples are sufficient, scheduled baselines exist, and wait-assessment evidence is present; otherwise it writes skipped coverage rows instead of silent no-hits.
Verification: `bun --filter @bp/analytics test`, `bun --filter @bp/pipeline test test/findings-detect.test.ts`, `bun run check:types`, targeted Biome on touched detector/pipeline files, and the real March 2026 `findings:detect` run pass. The real corpus now emits 100 observed-reliability candidates, 238 clean route no-hits, and 43 skipped route coverage rows (37 insufficient GTFS-RT sample routes and 6 routes missing Bus Wait Assessment corroboration).

## [2026-05-20] engineering | Intervention gap detector added

Added the fourth Finding Coverage v1 detector, `intervention_gap`, as a pure analytics pass that combines in-memory speed/reliability detector pain scores with local route intervention comparison statuses. The detector emits route-scoped candidates only when pain is high and intervention evidence is absent or limited to a bus-lane source-gap placeholder; routes with dated/evaluated treatment evidence are treated as clean for this detector rather than as untreated gaps.
Verification: `bun --filter @bp/analytics test`, `bun --filter @bp/pipeline test test/findings-detect.test.ts`, `bun run check:types`, targeted Biome on touched detector/pipeline files, and the real March 2026 `findings:detect` run pass. The real corpus now emits 50 intervention-gap candidates, 97 clean route no-hits, and 234 skipped route coverage rows where no speed/reliability pain signal crossed into the detector input.

## [2026-05-20] engineering | Intervention underperformance detector added

Added the fifth Finding Coverage v1 detector, `intervention_underperformance`, as a pure analytics pass over evaluated route intervention comparisons plus current speed/reliability pain signals. The detector emits route-scoped `negative_peer_adjusted_delta` candidates only when an implemented treatment has peer-adjusted before/after evidence with non-positive adjusted speed delta and current pain remains high.
Verification: `bun --filter @bp/analytics test`, `bun --filter @bp/pipeline test test/findings-detect.test.ts`, `bun run check:types`, targeted Biome on touched detector/pipeline files, and the real March 2026 `findings:detect` run pass. The real corpus now emits 13 intervention-underperformance candidates, 32 clean route no-hits, and 336 skipped route coverage rows where evaluated treatment evidence or current pain signals were unavailable.

## [2026-05-20] engineering | Detector coverage audit artifact added

Extended `findings:detect` to write `data/artifacts/findings/<month>/detector-coverage-audit.json` alongside the local SQLite detector rows. The artifact records detector counts, evidence counts, coverage outcome counts, coverage reason counts, candidate reason counts, and top candidates per detector so reviewer/debug workflows can inspect detector coverage without hand-querying SQLite.
Verification: `bun --filter @bp/pipeline test test/findings-detect.test.ts`, `bun run check:types`, targeted Biome on the findings job and test, `bun run check:knowledge`, and the real March 2026 `findings:detect` run pass. The March artifact has five detectors and mirrors the real matrix counts: 199 source-gap, 100 speed-hotspot, 100 observed-reliability, 50 intervention-gap, and 13 intervention-underperformance candidates.

## [2026-05-19] data | Corpus range backfills completed

Branch-tip corpus expansion supersedes the earlier in-flight parking/geocode note below. The local
corpus now covers Bus Observatory recovered reliability from 2023-04 through 2026-05: the
range backfill completed 38/38 months, producing about 102.4M headway samples and 14,478
route/month reliability summary rows. The companion Socrata range backfill for
`nypd-collisions`, `ace-violations`, and `dot-street-permits` completed 111/111 source-month
tasks for 2023-04 through 2026-04.

Branch-tip local SQLite counts from the handoff: 277,606 NYPD collisions, 18,683 ACE summaries,
2,028,951 DOT permit rows, and 412,685 context events. The ACE ingest now skips malformed
upstream route IDs with `skippedMalformedRouteIdCount` instead of weakening the strict
`RouteIdSchema`; this was added after rows such as `Q44?+` broke four monthly ingests.

Parking geocoding finished with a known low hit rate, roughly 50.7%, compared with about 98%
for other geocoded sources. That is a data-quality follow-up, not a blocker for this corpus
substrate. Bus Observatory 2025-01 still has 12 missing archive days, so downstream reliability
for that month should be treated as a partial-month signal.

## [2026-05-19] data | Parking geocode still in flight

Parking geocoding is not complete yet. Background task `bq0nmjpyi` is still running under task #63:
`local_parking_violation` has 186,096 total rows, 71,428 attempted so far, and 13,963 rows with
`physical_id` at the latest status check, roughly 38% through the pass with about 115k rows
remaining.

Earlier task #63 steps are complete: `build:lion-geometry-index`,
`build:route-shape-geometry-index`, `build:route-lion-link`, NYPD collision geocoding, 311
geocoding, and an intermediate `build:context-events` run. The intermediate context table is about
412.7k rows and is not final for parking context.

Still pending before treating parking context as detector-ready:

1. Let `geocode:parking-violations` finish.
2. Rerun `build:context-events` so the completed parking `physical_id` coverage is upserted into
   `local_context_event`.
3. Spot-check final hit rates and joined event counts by `event_kind` before using parking rows in
   detector scoring.

## [2026-05-19] planning | Finding detector architecture audit

Updated [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]]
with the detector architecture audit and implementation plan. The detector should be a local Bun
pipeline subsystem with canonical rows in `local_finding_candidate`,
`local_finding_evidence_link`, and `local_finding_coverage_audit`; Studio finding cards should be
generated only from reviewed or promoted candidates, not treated as the detector contract.

Manual local audit of `data/local/pipeline.sqlite` found the detector storage scaffold already
exists but is empty: 0 finding candidates, 0 evidence links, 0 coverage rows, 412,685 context
events, 3,097 route hotspot rows, 762 observed-reliability rows across March and May, 360
intervention comparisons, 193 corridor summaries, and 283,557 route-to-LION links across 378
routes. The plan now starts with a source-gap detector, then persistent speed hotspots, observed
reliability, intervention gaps, and intervention underperformance. Context-correlated disruption is
deferred until route-to-LION joins and event-density normalization have sampled QA.

Also updated [[wiki/engineering/data_model|Data Model]] to document local finding detector tables,
the D1/R2 serving split for promoted summaries versus detailed evidence bundles, and the immediate
schema hardening needs: strict domain contracts, idempotent replace-by-run writes, detector indexes,
and coverage rows for clean no-hit and skipped states.

## [2026-05-19] planning | Tier 2 document corpus pipeline

Added [[wiki/engineering/tier_2_document_corpus_pipeline|Tier 2 Document Corpus Pipeline]] to
settle how intervention and policy documents should flow into the future findings detector. The
plan borrows the useful shape of `ussumant/llm-wiki-compiler` - raw capture, compilation,
search/lint, and wiki navigation - but keeps detector integration behind typed candidate JSON,
deterministic validation, local SQLite/R2 artifacts, and explicit promotion gates. Tier 2 documents
can enrich findings, seed recall backtests, and create source-gap review tasks, but cannot create
metric claims without deterministic speed/reliability/ridership/evaluation evidence.

Extended the plan with the likely `pi-coding-agent` runtime shape: project-local `.pi/SYSTEM.md`,
skills, prompts, and a `tier2-doc-tools.ts` extension. The extractor role should run with broad
coding tools disabled and only narrow chunk/search/lookup/candidate-write tools enabled. Normal Pi
coding sessions can still use filesystem tools, but reproducible extraction should use schema
writers, path protection, and deterministic validation tools instead of arbitrary `bash` or wiki
edits.

## [2026-05-19] build | Geometry join + geocoding + detector schema landed

Three coupled tracks completed:

1. **Route ⇄ LION corridor join** via spatialite as a loadable SQLite extension
   in the local pipeline. ADR `docs/decisions/0007-spatialite-for-local-geo-joins.md`
   records the decision; Worker / D1 never load spatialite. Added
   `local_lion_segment_geom`, `local_route_shape_geom`, and the flat
   `local_route_lion_link` lookup. Pipeline jobs: `check:spatialite`,
   `build:lion-geometry-index`, `build:route-shape-geometry-index`,
   `build:route-lion-link` (default 25m buffer, tunable via `--buffer-m`).

2. **Address → LION mapping** via `packages/sources/src/nyc-geoclient` with
   address / intersection / search calls, retries, and an opt-in fuzzy
   street-name resolver (`street-normalize.ts`). Lookups flow through the
   shared `local_address_geocode` cache so re-runs are free. Three per-source
   geocode jobs: `geocode:311`, `geocode:nypd-collisions`,
   `geocode:parking-violations`. `physical_id` and `geocode_confidence`
   columns added to those three source tables. Requires
   `NYC_GEOCLIENT_KEY` env var (lat/lng snap + fuzzy fallback work without it).

3. **Detector data model (schema only)**: `local_context_event`,
   `local_finding_candidate`, `local_finding_evidence_link`,
   `local_finding_coverage_audit` tables and matching repository in
   `packages/db/src/local/repositories/findings.ts`. Materializer job
   `build:context-events` projects geocoded 311 / collisions / parking
   violations / DOT permits into the unified event table. No detectors yet —
   detector logic is the next milestone per the corpus-before-findings scope.

Drizzle migration `0022_public_wolfsbane.sql` covers all eight new tables
plus the six ALTER TABLE column adds. Typecheck and all package tests pass.
Spatialite itself is not installed in CI; local dev needs
`libsqlite3-mod-spatialite` (Linux) or `libspatialite` (macOS).

End-to-end run (today):
- LION geometry index: 122,168 / 122,168 segments inserted.
- Route-shape geometry index: 1,637 / 1,640 shapes inserted (3 skipped due
  to empty / malformed coordinate fragments).
- Route ⇄ LION link: 378 routes × 283,557 corridor links at 25m buffer.
- NYPD collision geocode: 6,493 hits / 262 misses (96.1% hit rate, 6,755 rows).
- 311 service-request geocode: 130,213 hits / 16,019 misses (89.1% hit rate,
  146,232 rows; ~80k unique addresses cached).
- Parking-violation geocode: initial 10-row smoke had no hits, but the full
  pass is now running as task `bq0nmjpyi`. Latest in-flight status: 71,428 /
  186,096 attempted, 13,963 rows with `physical_id`, about 115k remaining.
- Context events materialized: an intermediate `build:context-events` run has
  about 412.7k rows. Rerun it after parking geocode finishes so parking
  context rows are fully upserted.

Bug found during run: the per-source `WHERE physical_id IS NULL` batch
selector re-fed miss rows every iteration, so the NYPD job spun forever on
the 262 unmatchable rows. Fixed to `WHERE physical_id IS NULL AND
geocode_confidence IS NULL` in all three geocode jobs.

## [2026-05-19] audit | Brief feature is templated infra without authoring backend

Added gap #9 to [[wiki/engineering/website_data_support_audit|Website Data Support Audit]] to
make explicit that the brief surface — list/detail/evidence/history pages, the
`/api/v1/studio/briefs*` endpoints, and the published R2 artifacts — is a read-only stub built on
top of real D1 route metrics. `brief.summary`, `brief.dek`, `brief.sections[].body`,
`brief.claims[].title`, and `brief.evidence[].detail` are produced by string-interpolating
route-summary metrics into prose templates in `tools/pipeline/src/jobs/build/brief-artifacts.ts`
and the `StudioBrief` builder in `studio-release.ts`. `versions[]` and `comments[]` are
placeholder shapes; `status: "Published"` and `version: "v1"` are build artifacts, not workflow
state.

The plan of record for the missing authoring backend is
[[wiki/engineering/agent_author_api|Agent-Author API]] (status: draft). None of its endpoints
(`POST /studio/briefs`, `PATCH .../claims/:n`, `POST .../validate`, `POST .../review`,
`POST .../publish`, `POST .../retract`) exist in the Worker yet; the corresponding
editorial-state D1 tables (`brief_draft`, `brief_job`, `brief_version`, `brief_claim`,
`brief_evidence_link`, `brief_comment`, `brief_review`, `brief_idempotency`) are not in
`packages/db/src/d1/schema.ts`. The mid-layer data endpoints (`/studio/routes/:slug/segments`,
`/studio/data/violations`) and searchable evidence catalog (`/studio/briefs/:id/evidence?search=…`
returning *findable* evidence across briefs, not the embedded per-brief array) are also
unimplemented.

This is a feature-completeness gap, not a polish task. Captured so future work doesn't mistake
"audit says briefs read fine" for "brief authoring works".

## [2026-05-19] release | S3-API publisher for R2 artifacts

Replaced the wrangler-based R2 upload loop in `scripts/publish-serving-release.sh` (per-call
process startup × 2,355 puts = ~60 minutes) with
`tools/pipeline/src/jobs/publish/publish-r2-artifacts.ts`, which uses Bun's native S3Client
against R2's S3-compatible endpoint. Idempotent via HEAD-then-PUT (skip when remote size+ETag
match the local md5), resumable (re-run picks up where it left off via the same skip gate),
parallel (default concurrency 16), with retry+backoff and an audit JSON at
`data/artifacts/audits/publish-r2-{month}.json`. Wrangler is still used for D1 schema/seed/
appendix execution and the existing completeness pre-flight. Verified end-to-end against
`bus-priority-artifacts`: 2,355/2,355 keys HEAD-match the local artifacts; full pass completes
in ~5 seconds. New env in repo-root `.env`: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_ENDPOINT` (Bun auto-loads from repo root; invoking via `--cwd` would miss this).

## [2026-05-18] planning | Serving storage split and website support audit

Added [[wiki/engineering/serving_storage_split_plan|Serving Storage Split Plan]] to settle the resource-first storage rule: D1 is the control plane for compact relational state, indexes, manifests, mutable drafts, jobs, idempotency, and queryable summaries; R2 is the artifact plane for immutable release documents, large nested payloads, maps, evidence bundles, exports, and raw-ish captures; the Worker owns REST resource semantics.

Added [[wiki/engineering/website_data_support_audit|Website Data Support Audit]] after code inspection of the Studio API client, Worker, release builder, domain schemas, and observed-reliability repositories. The audit records that production frontend loaders already call real `/api/v1/studio/*` endpoints and no longer import sample data; the real gap is that Studio R2 projections cover a curated route/brief/finding slice while D1 contains full-route serving data, observed reliability, and the May 2026 current appendix. The old "unfixture route loaders" task is obsolete; the new queue is to expand Studio coverage, surface observed reliability/current signal data, and split brief evidence/history contracts.

Follow-up note: documented that the current R2 shape does not look over-stored; the sharper risk is under-publishing nested route/corridor brief body artifacts. The March brief manifest and D1 artifact refs point at keys under `briefs/routes/...` and `briefs/corridors/...`, while the current publish glob clearly includes `briefs/$month/*` and may only upload the manifest. The plan now calls for manifest-driven R2 publishing or an artifact-ref-to-upload validation gate.

## [2026-05-18] release | Production cutover with May 2026 observed appendix

Promoted the canonical March 2026 release plus the May 2026 self-collected GTFS-RT observed appendix to production Cloudflare D1/R2.

Pipeline state: ingested the completed 24-hour run `gtfs-rt-v1-20260517T103607Z-24h` (2,880/2,880 snapshots, 3,589,778 vehicle positions, 0 errors), built observed headways for 2026-05 (395,885 stop events, 366,609 headway samples), built `route-observed-reliability --year 2026 --month 5 --run-id gtfs-rt-v1-20260517T103607Z-24h` (381 routes, 300 observed, 81 insufficient, 360,914 headway samples). `gtfs-rt:preflight` for 2026-05 passed with 0 issues. The strict `check:pipeline-v1 --year 2026 --month 3` audit still passes after the run (0 issues, 1,050 route artifacts, 381 observed reliability rows). Combined `audit:pipeline-v1 --public-year 2026 --public-month 3 --realtime-year 2026 --realtime-month 5` produced `audit-2026-03-2026-05.json` with `publicStrictStatus=pass`, `realtimePreflightStatus=pass`, `sameMonthPromotionReady=false` (correct — May has no public speed coverage), and methodology gate preserved at `descriptive_only`.

Mid-session incident: the first two `route-observed-reliability` invocations (default-month and a malformed `--month 2026-05` string) wrote zero-sample rows for `month=2026-03` and `month=2026-NaN`, clobbering the Bus Observatory recovered March data. Restored from `data/working/bus-observatory/2026-03/route-observed-reliability-summary.csv` via `import:bus-observatory-reliability-summary --year 2026 --month 3 --run-id bus-observatory-2026-03`; counts matched the pre-incident baseline (346 observed routes, 2,571,297 samples). The reliability builder ignores its `runId` parameter when deleting rows; future runs for one month against another month's local DB will clobber rows the same way unless `--year/--month` is passed.

Code change: added a single-tables D1 appendix export path so observed-reliability rows can be promoted without re-running the route-batch audit gate. New `buildD1AppendixSeedSql` in `packages/db/src/d1/seed/build-seed-sql.ts` emits scoped `DELETE` + `INSERT` for `route_observed_reliability_summary` (by month) and `route_month_source_status` (by month + `source_scope='reliability'` + `source_id IN ('observedHeadways','bunching','waitTimeReliability')`). New `readLocalD1AppendixInputs` and `writeRouteD1AppendixSeedOutput` in `tools/pipeline/src/jobs/export/` produce a `seed.appendix.sql` (no schema, no summary parity with canonical). `export:d1 --mode appendix --year YYYY --month M` invokes the appendix path and skips `prepareRouteD1Export` (the audit gate). `scripts/publish-serving-release.sh` gained `--appendix-month YYYY-MM` to layer a second `wrangler d1 execute` of `seed.appendix.sql` on top of the canonical publish, plus `--skip-schema` to re-run the script when D1 tables already exist.

Cutover: ran `export:d1 --year 2026 --month 3` (1,050 route artifacts, 6.1 MB seed) and `export:d1 --mode appendix --year 2026 --month 5` (626 KB seed, 381 observed reliability rows, 1,143 source-status rows). The first `publish:serving-release --execute` failed on `schema.sql` because the production D1 already had the tables from a prior publish (`CREATE TABLE` is non-idempotent). Applied `seed.sql` and `seed.appendix.sql` directly via `wrangler d1 execute --remote`: canonical seed wrote 58,089 rows (38,727 changes), appendix wrote 3,048 rows. Remote D1 now has `route_observed_reliability_summary` for `month=2026-03 / run_id=bus-observatory-2026-03 (381 rows)` and `month=2026-05 / run_id=gtfs-rt-v1-20260517T103607Z-24h (381 rows)`. R2 publish of `bus-priority-artifacts` is the slow tail of the operation (briefs, evaluations, map, pipeline-v1 audits including `audit-2026-03-2026-05.json`, source-availability, studio v1 projection).

Next: Worker deploy via `bun run --cwd apps/web deploy` once R2 uploads finish; production smoke against `/api/v1/studio/release` and a route detail to confirm the May observed appendix is reachable; frontend unfixture per surface; methodology review still gates causal claims.

## [2026-05-18] planning | AI interaction model doctrine

Added [[wiki/project/ai_interaction_model|AI Interaction Model]] as the canonical product doctrine
for LLM use in the Studio. The model keeps AI output inside Studio artifacts such as findings,
reasoning trails, route diagnosis strips, segment notes, claim seeds, caveats, reviewer notes, and
brief drafts; rules out global chat, "Ask AI" navigation, chatbot styling, LLM metric generation,
and policy recommendations; and defines the determinism gradient from pure metrics/joins through
strict LLM contracts and bounded composer generation.

Updated the project overview, wiki operating rules, API architecture, agent-author API, LLM/RAG
page, policy docs corpus, and wiki index to point back to this doctrine.

## [2026-05-18] planning | Realtime processing and production capture proof ladder

Updated the data infrastructure finish plan, Cloudflare operations runbook, ETL plan, pipeline v1 plan, and wiki index with an explicit realtime processing plan. The docs now distinguish the completed production smoke proof from the still-needed production-length proof: mirror a contiguous 4-hour-or-longer Worker/R2 GTFS-RT capture run, import manifests, parse protobufs, build observed headways, generate route reliability, and pass `gtfs-rt:preflight`.

Documented the production capture proof ladder: config proof, R2 write proof, 30-second cadence proof, object integrity proof, R2-to-pipeline parse proof, reliability proof, appendix proof, and same-month observed-release promotion proof. The runbook now calls out that R2 object transfers should use plain `bunx wrangler` in this environment and that full observed release promotion still requires same-month public speed coverage plus strict pipeline/audit gates.

## [2026-05-18] data | Pipeline v1 status refreshed and next steps reset

Rechecked the local March 2026 pipeline state. Regenerated the missing canonical `data/artifacts/map/2026-03/manifest.json`, then strict `bun run check:pipeline-v1 -- --year 2026 --month 3` passed with 0 issues: 381 built routes, 350 public routes, 346 observed reliability routes, 2,571,297 route-summary headway samples, 360 intervention comparisons, 193 corridors, 1,629 audited brief artifacts, 354 map artifacts, and D1 verification passing.

Confirmed `gtfs-rt:preflight -- --year 2026 --month 3 --run-id bus-observatory-2026-03` passes for recovered March observed reliability. Reran the observed-release audit with March public and March recovered realtime evidence; it passed with `Observed Release=complete` and `sameMonthPromotionReady=true`, while preserving Bus Observatory / Jacobs Urban Tech Hub `third_party_recovered` provenance and CC BY-NC 4.0 caveats.

Confirmed the official self-collected run `gtfs-rt-v1-20260517T103607Z-24h` completed with 2,880/2,880 successful vehicle-position snapshots and 0 failures. It still needs ingest, observed-headway build, May 2026 route reliability, and preflight before it becomes the official current observed appendix.

Updated the wiki index, Codex roadmap, ETL plan, data pipeline completion plan, and data infrastructure finish plan. The next work is Cloudflare D1/R2 release promotion, Studio projection seeding/unfixture, production GTFS-RT/source watcher operations, processing the completed official 24-hour run, bus-lane date gap reduction, and methodology review before causal claims.

## [2026-05-18] planning | Web app support plan for briefs, composer, and loaders

Added [[wiki/engineering/web_app_support_plan|Web App Support Plan]] to make the next frontend work explicit. The plan keeps TanStack Router's route loaders as the orchestration layer, uses Router SWR caching for read-heavy Studio projections, adds signal-aware fetches, route-specific `staleTime`, narrow `loaderDeps`, and deferred loading for non-critical brief evidence/history and map-heavy payloads.

The plan also splits published brief contracts from evidence/history payloads and phases the composer from projection-seeded local state to a feature-flagged single-user draft API. Draft metadata, claim text, evidence refs, and review comments may be bounded D1 rows; large body snapshots, diffs, and publish candidates belong in R2. Normal page requests must not mutate the public March release projection.

## [2026-05-18] planning | Post-v1 finding coverage and corpus expansion

Added [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]] to make missed-finding risk explicit after Pipeline v1. The plan splits the risk into detector gaps, data gaps, join gaps, threshold gaps, context gaps, and review gaps, then defines a detector matrix, coverage audit, source-gap findings, recall-oriented backtests, and reviewer states.

Updated the source registry with an unprobed expansion backlog for MTA wait assessment, DOT traffic speeds, traffic volume counts, construction/opening permits, NYPD collisions, 311 requests, parking violations, and LION/street-centerline joins. Corrected methodology validation to reflect the current March `third_party_recovered` observed reliability state and the separate May official self-collected appendix path.

## [2026-05-18] planning | LLM processing role for corpus expansion

Extended [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]], [[wiki/engineering/llm_wiki_rag|LLM Wiki + RAG Layer]], and [[wiki/data/policy_docs_corpus|Policy and Documents Corpus]] with the post-v1 LLM processing boundary. LLMs can help as readers, authors, and extractors: they can mine documents for candidate source notes, document claim candidates, entity-link candidates, review questions, and caveats, but deterministic probes, route/street/geospatial validators, metric jobs, and composer validation remain the authority for source promotion and public claims.

## [2026-05-18] design | shadcn Base UI design-system cutover started

Initialized shadcn for `apps/web` with the Base UI backend while preserving TanStack Router. Added Tailwind v4 and shadcn aliases for the web app, mapped shadcn semantic CSS variables to the Claude Design Bus Priority Impact Studio token system, and ported the first reusable primitives from the design tarball: studio mark, route badge, chip, citation, sparkline, hour strip, confidence bar, reviewer chips/stack, and AI attribution strip. The generated shadcn button has been refactored to the custom system's compact civic button variants instead of the default Nova look.

Extended the design-system primitive port with the remaining core `system.jsx` building blocks: before/after bars, map thumbnail, section header, studio footer, tabs, KPI, caveat, search field, direction/treatment glyphs, segment rows, timeline, skeleton/loading states, empty/error states, chart frame, heatmap, hour bars, strength bars, and claim rows/lists.

Converted the legacy app-level `Button`, `Pill`, `RouteBadge`, and skeleton components into compatibility wrappers around the shadcn/custom design-system primitives so existing screens can keep importing their current component names while inheriting the new visual system.

Added the missing `StudioBar` primitive from the design tarball and changed legacy app token exports/CSS variable aliases to resolve to the new warm-paper BPI token set. Updated user-facing page metadata from the old BusPulse name to Bus Priority Impact Studio.

Replaced direct `.bp-pill` filter links in the app shell and hotspot panel with the new `Chip` primitive, then removed now-unused legacy CSS blocks for `.bp-pill`, `.bp-route-badge`, `.bp-btn`, and `.bp-skeleton`.

Renamed the internal map component from `BusPulseMap` to `BusPriorityMap` so code symbols no longer carry the old product name.

Added a TanStack Router `/system` panel that renders the ported design-system primitives inside the app shell. The panel exercises foundations, route badges, chips/citations, search, KPIs, sparklines, before/after bars, confidence, treatment glyphs, segment rows, AI attribution, heatmap/hour charts, claim lists, tabs, caveats, skeletons, timelines, and empty states.

Ported the comment badge and inline comment marker shown in the later design-system HTML but not centralized in `system.jsx`, and added both to `/system`.

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

## [2026-05-17] engineering | Recovered GTFS-RT import path

Added `import:bus-observatory-gtfs-rt`, a TypeScript/Bun pipeline command that imports canonical CSV rows exported from the third-party Bus Observatory Parquet archive into the existing local GTFS-RT collection, snapshot, parsed snapshot, and vehicle-position tables. The command labels the run as `third_party_recovered` through the Bus Observatory source id and returns row-level QA facts such as sample count, route count, vehicle count, min/max timestamp, max timestamp gap, and skipped rows. Added a fixture-backed pipeline test plus `publish:serving-release`, a dry-run-by-default one-shot D1/R2 promotion script, and documented the remaining data-infrastructure finish line: recovered March import/QA, one-shot D1/R2 publish, lightweight cron/watchers only, and website unfixture gates.

## [2026-05-17] engineering | Website API endpoint architecture

Drafted `knowledge/wiki/engineering/web_api_endpoint_architecture.md` for the newer mobile-first website. The plan keeps the Worker as a thin BFF over D1 serving projections and R2 artifacts, maps endpoints to the current map/feed/route/compare/search surfaces, requires domain response schemas with completeness metadata, and preserves the rule that public request handlers do not import source adapters, analytics, pipeline code, or wiki files. The main checkout was monitored until frontend/API edits were quiet for more than five minutes, then the docs-only plan was applied without touching the active frontend work.

## [2026-05-17] engineering | Worker GTFS-RT scheduled capture

Added a lightweight Cloudflare Worker scheduled handler for production GTFS-RT vehicle-position capture and monthly route-speed publication checks. GTFS-RT capture is inert unless the deployed environment has both `GTFS_RT_RAW` and `MTA_BUS_TIME_API_KEY`; the monthly watcher is inert unless `ARTIFACTS` is configured and compares latest complete speed coverage against optional `LAST_BUILT_SPEED_MONTH`. When configured, the Worker writes raw protobuf snapshots, redacted JSON manifests, and a compact route-speed availability artifact to R2. The public request handler still does not import pipeline code, and heavy parsing/finalization remains in the Bun pipeline. The cron entrypoint runs once per minute, so strict 30-second production sampling still needs follow-up queue/scheduler design.

## [2026-05-17] engineering | Full repo check baseline

Ran `bun run check` after source-refresh and QA hardening. Typecheck, Biome style, web architecture, Claude config, package/pipeline/domain/source/db unit tests, web fixture tests, and Cloudflare Worker tests all passed. This confirms the repo code/contract baseline is green while strict Data Pipeline v1 remains blocked by same-month public speed and realtime source alignment.

## [2026-05-17] engineering | GTFS-RT scheduled cadence hardening

Added a batched scheduled GTFS-RT capture helper for the Worker. The existing single-snapshot capture remains available, while production scheduled refresh can now take multiple spaced vehicle-position snapshots within one cron invocation. With `GTFS_RT_SAMPLES_PER_CRON=2` and `GTFS_RT_SAMPLE_SECONDS=30`, the one-minute Cloudflare cron can write two R2 protobuf snapshots per invocation and match the 30-second cadence expected by strict v1 GTFS-RT QA. Updated the Worker harness and v1 completion plan with the cadence configuration.

## [2026-05-17] engineering | Intervention methodology audit gate

Extended `audit:pipeline-v1` with an explicit `interventions.methodologyGate` section. The gate currently records `descriptive_only`, `externalReviewStatus=open`, `causalClaimsAllowed=false`, and the supported evidence levels, so a release audit cannot accidentally treat peer-adjusted before/after comparisons as causal estimates. Updated the v1 plan and methodology validation page to point at this audit field.

## [2026-05-17] engineering | V1 audit objective contract

Extended `audit:pipeline-v1` so the generated JSON includes the full v1 objective and explicit success criteria before the evidence checklist. This makes `data/artifacts/pipeline-v1/audit-*.json` a self-contained prompt-to-artifact contract rather than only a status summary.

## [2026-05-17] docs | Source refresh docs drift cleanup

Updated the web README, v1 completion plan, and roadmap so they reflect the current source-refresh implementation: the Worker scheduled hook can capture GTFS-RT snapshots to R2, can be configured for strict 30-second sampling from a one-minute cron, and includes a monthly route-speed watcher. Remaining production-refresh work is now framed as deployment/configuration, monitoring, R2-to-pipeline handoff, and rebuild triggering when a new complete public speed month appears.

## [2026-05-17] engineering | Worker R2 GTFS-RT import handoff

Added `import:gtfs-rt-r2-manifests`, a Bun pipeline command that reads Worker-written GTFS-RT manifest JSON from a local R2 mirror/export, registers a completed local collection run, and inserts feed snapshot metadata pointing at the mirrored protobuf object files. This gives the production Worker capture path a concrete handoff into the existing `ingest:gtfs-rt-snapshots`, observed-headway, and observed-reliability pipeline without adding heavy parsing to the Worker.

## [2026-05-17] product | V1 release boundary reframed

Reframed Data Pipeline v1 as the latest defensible public-source monthly release plus a labeled realtime observed appendix when available. Same-month public route-speed and collected GTFS-RT alignment is now an observed monthly promotion condition, not a v1 blocker. Updated `audit:pipeline-v1` to emit a `releaseModel` with canonical monthly release, realtime appendix, and promotion readiness, and updated roadmap/docs so March 2026 public evidence plus May 2026 observed GTFS-RT can be assessed without overclaiming source alignment.

## [2026-05-17] product | Completeness-aware v1 layers

Extended the v1 release model from a pass/fail boundary into completeness-aware layers: `Baseline Release`, `Current Signal`, `Pending Publication`, and `Observed Release`. `audit:pipeline-v1` now emits `releaseModel.layers` plus `releaseModel.metricCompleteness` with statuses such as `complete`, `partial_realtime_only`, `partial_public_monthly_only`, `missing_speed`, `missing_realtime`, `insufficient_samples`, and `source_lag_expected`. This lets the pipeline distinguish confident baseline claims, directional current signals, unavailable claims, and expected source lag.

## [2026-05-17] engineering | Bus Observatory GTFS-RT recovery probe

Added `check:bus-observatory-gtfs-rt`, a TypeScript/Bun probe for the third-party Bus Observatory NYC bus GTFS-RT Parquet archive in the public `busobservatory-lake` S3 bucket. The March 2026 live probe found all 31 March-labeled files plus the 2026-04-01 bridge file, 32 files total and 3,591,483,083 bytes, and wrote `data/artifacts/source-availability/bus-observatory-gtfs-rt-2026-03.json` with `candidateLabel = third_party_full_month_candidate_pending_row_level_qa`. `audit:pipeline-v1` now reads that artifact as `releaseModel.thirdPartyRecoveredGtfsRtCandidate`, but keeps `canPromoteObservedRelease=false` until Parquet row-level QA and an import/conversion path pass.

## [2026-05-17] engineering | Bus Observatory recovered reliability loaded

Added `import:bus-observatory-reliability-summary`, a repeatable Bun pipeline command for loading precomputed route-level observed-reliability summaries from the third-party Bus Observatory archive when raw Parquet row import is too large for the local SQLite path. The command fills every current catalog route, skips archive route IDs outside the catalog, and writes reliability source-status rows tied to the recovered run id. Loaded March 2026 from `data/working/bus-observatory/2026-03/route-observed-reliability-summary.csv`: 381 catalog routes, 346 observed, 35 insufficient, 2,571,297 derived samples, and 7 non-catalog archive routes skipped. Regenerated `brief-artifacts`, `route-batch-audit`, `evaluation-artifacts`, `map-artifacts`, `export:d1`, and `verify:d1`; D1 verification passes with `route_observed_reliability_summary = 381` and `route_batch_issue = 0`, and structural `check:pipeline-v1 -- --allow-insufficient-gtfs-rt` passes for March 2026.

## [2026-05-17] engineering | Bus Observatory strict raw-backed recovery

Added `import:bus-observatory-headway-samples`, a chunked recovered-data importer that streams DuckDB-derived Bus Observatory headway samples into `local_observed_headway_sample` and registers compact 30-second snapshot evidence in the GTFS-RT collection/feed/parsed tables. This avoids loading all 81M raw vehicle positions into SQLite while still giving strict GTFS-RT provenance gates completed collection rows, successful vehicle-position snapshots, parsed snapshot rows, parsed vehicle-position evidence rows, and persisted observed headway samples. Generated March 2026 recovered CSVs under ignored `data/working/bus-observatory/2026-03/raw-provenance/`: 89,109 snapshot buckets and 2,612,086 headway samples. Rebuilt route observed reliability from the raw-backed samples, yielding 381 catalog route rows, 346 observed routes, 35 insufficient routes, and 2,571,297 catalog-route samples. Strict `gtfs-rt:preflight -- --year 2026 --month 3 --run-id bus-observatory-2026-03`, `verify:d1`, and strict `check:pipeline-v1 -- --year 2026 --month 3` all pass.

## [2026-05-17] engineering | Release status API and docs refresh

Added `ReleaseStatusResponseSchema`, `releaseStatusResponseJsonSchema`, and Worker endpoint `GET /api/v1/status` over D1 route-batch and observed-reliability serving tables. The endpoint reports the active baseline month, route/artifact/issue counts, observed and insufficient GTFS-RT route counts, sample count, inferred realtime provenance, and completeness caveats; `bus-observatory-*` runs are labeled `third_party_recovered`. Added Worker coverage for the recovered March provenance path and the static-asset SPA fallback. Verified with `bun --filter @bp/web test:worker`, `bun --filter @bp/web typecheck`, `bun --filter @bp/domain typecheck`, `bun run check:style`, and strict `bun run check:pipeline-v1 -- --year 2026 --month 3`. Refreshed data-infrastructure and API docs so they reflect the now-loaded raw-backed March recovery, the dry-run serving publish path, and the remaining remote deployment/frontend unfixture work.

## [2026-05-17] engineering | Route-card API unfixture step

Added `RouteCardSchema`, `RouteListResponseSchema`, `routeListResponseJsonSchema`, and Worker endpoint `GET /api/v1/routes`. The endpoint reads D1 route brief summaries and observed reliability summaries for the selected month, returns compact ranked cards, and labels each card with completeness/confidence metadata. Recovered `bus-observatory-*` reliability rows are surfaced as medium-confidence third-party recovered evidence. Added Worker coverage for observed and insufficient recovered route cards, plus the `GET /api/schema/route-list` schema endpoint.

## [2026-05-17] engineering | Route profile API unfixture step

Added `RouteArtifactRefSchema`, `RouteProfileResponseSchema`, `routeProfileResponseJsonSchema`, and Worker endpoint `GET /api/v1/routes/:routeId/profile`. The endpoint validates route IDs and months, reads one D1 route brief summary, observed reliability summaries, and route artifact metadata, then returns peak/slowest windows, recovered observed-reliability metrics, completeness caveats, and R2 artifact references. Added Worker coverage for the recovered March route profile path and the `GET /api/schema/route-profile` schema endpoint.

## [2026-05-17] engineering | Map manifest and R2 artifact API

Added `MapArtifactEntrySchema`, `MapManifestResponseSchema`, `mapManifestResponseJsonSchema`, Worker endpoint `GET /api/v1/map/manifest`, and R2 proxy endpoint `GET /api/v1/artifacts/*`. The manifest endpoint reads generated `map/<month>/manifest.json` from the `ARTIFACTS` R2 binding, validates metadata, and adds API fetch paths for each artifact. The artifact endpoint streams R2 objects with immutable cache headers and rejects invalid keys. Added Worker coverage for a generated route-segment GeoJSON manifest entry and artifact fetch.

## [2026-05-17] engineering | Hotspot and compare API unfixture step

Added `HotspotCardSchema`, `HotspotListResponseSchema`, `hotspotListResponseJsonSchema`, `RouteCompareResponseSchema`, `routeCompareResponseJsonSchema`, Worker endpoint `GET /api/v1/hotspots`, and Worker endpoint `GET /api/v1/compare`. Hotspots flatten D1 corridor hotspot summaries into ranked monthly cards with baseline-release quality labels. Compare reads D1 route comparison ranks plus observed reliability summaries for two routes, returns route cards, metric deltas, and recovered-realtime provenance caveats. Added Worker coverage for both endpoints and their schema routes.

## [2026-05-17] engineering | API-first frontend loaders

Added `apps/web/src/lib/api-client.ts` and switched the main panel data loaders to call `/api/v1` first for hotspots, route profiles, and compare data, with fixture fallback when the API is unavailable. Route profile params now accept generated route IDs beyond the small fixture list, and default compare routes use real serving IDs (`B46-SBS`, `M15-SBS`). Added loader tests that mock API responses and verify they map into the current panel component data shape. The map canvas still uses fixture geometry; its next unfixture step is reading `/api/v1/map/manifest` and R2 artifact URLs.

## [2026-05-17] engineering | API-backed map route lines

Extended `BusPulseMap` so it keeps fixture geometry for a nonblank first paint, then fetches `/api/v1/map/manifest`, finds the generated `map_route_shapes_geojson` artifact, and replaces the MapLibre route line source with R2-backed generated GeoJSON when available. The generated route-shape properties are normalized into the current map interaction shape (`name`, `grade`, `color`) so route hover/click still works while the rest of the map layers continue to use fixture stops/labels as fallback.

## [2026-05-17] engineering | GTFS-RT R2 mirror helper

Added `pull:gtfs-rt-r2-run`, a dry-run-by-default shell helper for the deployed Worker capture handoff. Given a reviewed manifest object-key list, it mirrors Worker-written GTFS-RT manifests and paired raw protobuf objects from R2 with `bunx --bun wrangler`, then prints the matching `import:gtfs-rt-r2-manifests` command for the local pipeline.

The mirror helper now defaults to `data/raw/r2-mirror/<run-id>/` so a handoff import only sees manifests for the intended production capture run unless an operator deliberately overrides `--output`.

R2 transfers now use plain `bunx wrangler` rather than `bunx --bun wrangler`; in this environment, the Bun-executed Wrangler path successfully created objects but returned zero-byte payloads for larger R2 uploads/downloads.

## [2026-05-17] operations | Cloudflare production runbook

Added `knowledge/wiki/engineering/cloudflare_operations_runbook.md` with the concrete production deployment path: required D1/R2 bindings, Worker vars and secrets, the one-shot March 2026 serving publish, deployed API verification, scheduled GTFS-RT capture proof, R2 manifest mirroring, downstream pipeline import, and monthly speed watcher rebuild steps. The committed Worker config still avoids fake Cloudflare IDs; production completion requires real resources and `publish:serving-release --execute`.

Added `apps/web/wrangler.production.example.jsonc` as a copyable production binding template for `DB`, `ARTIFACTS`, `GTFS_RT_RAW`, baseline-month vars, and strict GTFS-RT capture cadence. The active `wrangler.jsonc` still avoids placeholder resource IDs.

Created production Cloudflare resources in account `7aa7065a7e971d97435b3f22098d78b0`: D1 `bus-priority-serving` (`d9cd87e2-1f77-44eb-b712-e834b23497b0`), R2 `bus-priority-artifacts`, and R2 `bus-priority-gtfs-rt-raw`. Wired those bindings into `apps/web/wrangler.jsonc` and `packages/db/wrangler.d1.jsonc`, uploaded the `MTA_BUS_TIME_API_KEY` Worker secret, applied the March 2026 D1 schema/seed remotely, and uploaded the March 2026 artifact set to remote R2. R2 transfers must use plain `bunx wrangler`; `bunx --bun wrangler` produced zero-byte objects for larger transfers in this environment.

Added the R2 lifecycle rule `expire-gtfs-rt-after-21-days` on `bus-priority-gtfs-rt-raw` for prefix `gtfs-rt/`. This keeps strict 30-second raw GTFS-RT capture inside the expected Workers Paid/R2 free storage envelope while preserving a three-week mirror/import window.

Deployed the Worker directly from `apps/web/wrangler.jsonc` after the Cloudflare Vite redirected deploy config dropped `vars`, `d1_databases`, and `r2_buckets`. The deployed Worker exposes real bindings for `DB`, `ARTIFACTS`, `GTFS_RT_RAW`, `BASELINE_MONTH`, `LAST_BUILT_SPEED_MONTH`, `GTFS_RT_SAMPLES_PER_CRON`, and `GTFS_RT_SAMPLE_SECONDS`. Live checks passed for `/api/v1/status?month=2026-03`, `/api/v1/routes?month=2026-03&limit=3`, `/api/v1/map/manifest?month=2026-03`, and a route-segment artifact stream. The actual frontend is served from the root workers.dev URL; `/api/v1/artifacts/*` URLs are raw artifact endpoints.

Verified scheduled production GTFS-RT capture. The deployed cron wrote vehicle-position manifests and protobuf snapshots into remote R2 under `gtfs-rt/vehicle_positions/2026-05-17/`; a sampled protobuf object was about 230 KB. Mirrored two live production manifests and paired protobufs with `pull:gtfs-rt-r2-run --execute`, imported them with `import:gtfs-rt-r2-manifests`, and parsed them with `ingest:gtfs-rt-snapshots`: 2 snapshots, 3,612 vehicle positions, and 0 parse errors.

## [2026-05-18] engineering | Design system hard cutover pages

Started the website hard cutover to the new Bus Priority Impact Studio design system. The active TanStack Router pages for hotspots (`/`), route profile tabs (`/routes/$routeId`), comparison (`/compare`), weekly digest (`/digest`), system reference (`/system`), and not-found now render through the new `apps/web/src/design-system` primitives and the Base UI-backed shadcn button. Removed the old compatibility primitive wrappers, legacy preview page/components, legacy token module, and unused legacy CSS blocks so the app no longer falls back to the previous visual system.

## [2026-05-18] engineering | Full website hard cutover plan and shell

Replaced the interim design-system cutover with the canonical reference-site information architecture: route search/results, route detail, route ladder, compare, findings feed/detail, briefs gallery/reading/evidence/composer/review/history, methods, docs, system reference, and not-found. Added `knowledge/wiki/engineering/website_hard_cutover_plan.md` to capture the no-legacy-fallback cutover, API surface direction, generated CLI/docs direction, and React/TanStack Router motion posture. Removed the old map/panel/API-client fallback layer from the web app and replaced its stale tests with Studio sample-data contract coverage so unknown routes/briefs/findings fail closed instead of silently rendering M15 defaults.

Updated the TanStack Router integration to match render-optimization guidance: router structural sharing is enabled by default, route wrappers subscribe to individual params/search fields through `select`, and the hard-cutover plan now records those selector/structural-sharing rules for future API-backed pages.

Added `knowledge/wiki/engineering/generated_cli_distribution_plan.md` for the Cloudflare-style CLI/API generation and binary distribution pipeline. The plan makes OpenAPI an output of a runtime TypeScript schema, defines schema linting for verbs/flags/locality/output contracts, ties generated CLI source to `bun build --compile`, and makes `CliReleaseManifest` the single contract for npm optional platform packages, PyPI wheels, Homebrew formulae, future Windows wrappers, archive audits, provenance, and manifest-driven rollback.

## [2026-05-18] engineering | Observability and Studio API next plans

Added `knowledge/wiki/engineering/web_observability_performance_seo_plan.md` for the immediate website observability track: Lighthouse route matrix, SEO crawlability checks, Core Web Vitals/RUM posture, Worker `Server-Timing`, structured API logs, and a release gate that keeps raw RUM out of D1. Rewrote `knowledge/wiki/engineering/web_api_endpoint_architecture.md` around the route-first Studio API: existing `/api/v1` endpoints remain lower-level serving primitives, while `/api/v1/studio/*` becomes the product contract for routes, search, ladder, compare, findings, briefs, methods, docs, and future composition endpoints. Updated the wiki index and hard-cutover plan so these are the immediate next tasks.

Tightened the API migration plan to make the Studio API a true hard cutover: production pages call `/api/v1/studio/*` only, do not keep non-Studio endpoint or sample-data fallback branches, and must remove `studio/sample-data.ts` imports in the same patch that adds each route loader. Existing non-Studio `/api/v1/*` handlers can remain temporarily for compatibility or extracted helper logic, but they are not the frontend contract.

## [2026-05-18] engineering | Studio API loader hard cutover slice

Added the first route-first Studio API contract in `apps/web/src/studio/api-contract.ts`, plus client loaders that call `/api/v1/studio/*` directly. The Worker now serves Studio routes, search, route detail, ladder, compare, findings, briefs, methods, and docs endpoints with contract validation and `Server-Timing: studio` headers.

Production TanStack Router pages now load their page data through the Studio API instead of importing `studio/sample-data.ts`. Missing route/finding/brief records render the designed not-found state from API 404s; there is no sample-data or legacy endpoint fallback branch in the route wrappers. The web architecture check and production-boundary harness now fail production UI imports from `studio/sample-data.ts` and `fixtures/demo-snippets.ts`, while still allowing dev-only gallery examples to use demo snippets.

## [2026-05-18] engineering | Web SEO and performance gates

Added the first enforceable web observability gates: `check:web-release` builds the web app, runs `check:web-seo`, and runs `check:web-performance`. The SEO gate validates the canonical public route matrix, title/description/canonical metadata, hash-stamped assets, and dev-only `/system` noindex behavior. The performance gate enforces built client asset budgets and writes a compact ignored summary artifact to `data/artifacts/web-audits/latest/performance-budget.json`.

The Worker now injects crawlable title/meta/canonical tags into SPA fallback HTML for public deep links and returns `404` plus `X-Robots-Tag: noindex` for `/system` outside local dev. Added a debug-only browser performance reporter that logs route navigation timing, LCP, and CLS in dev or when `localStorage.bpDebugVitals = "1"`. Lighthouse CLI is available through `bunx`; real Lighthouse JSON collection is gated behind `BP_RUN_LIGHTHOUSE=1` plus a Chrome executable/URL so CI can opt into it without making local checks depend on a bundled browser.

Follow-up slice: added `serve:web-smoke`, a local production-build smoke server that serves
`apps/web/dist/client` plus generated `data/artifacts/studio/v1` projections through the same
`/api/v1/studio/*` URLs used by route loaders. `check:web-performance` now enforces Lighthouse
thresholds when `BP_RUN_LIGHTHOUSE=1`: desktop performance 0.95+, accessibility 0.95+, best
practices 0.95+, and SEO 1.00 across the 12-route public matrix. The first real run used Playwright
Chromium from the local browser cache and passed, with SEO 1.00 on every route. Added `robots.txt`,
`llms.txt`, and `sitemap.xml`, fixed the canonical
finding-detail route to `/findings/m15-full-treatment-still-declining`, and darkened shared muted,
warning, success, and Bronx route colors to satisfy Lighthouse contrast checks.

## [2026-05-19] analysis | Detector event-route touch bridge

Added the local-only detector bridge `local_context_event_route_touch` as the canonical cheap answer
to "which events touched which routes during this window?" The bridge is built after
`build:context-events` and `build:route-lion-link` by `build:context-event-route-touches`, stores
direct route-keyed events as `primary` evidence, and stores route-LION-expanded touches as `context`
evidence with `route_fanout` and `match_weight` so detectors do not mistake broad street proximity
for route-specific proof.

Updated the finding-coverage, data-model, and CLI docs to make the provenance rule explicit.

## [2026-05-18] engineering | Studio release artifact hard cutover

Removed the last Worker-runtime Studio seed import. `/api/v1/studio/*` now reads a versioned
`studio/v1/release.json` object from the `ARTIFACTS` R2 binding, validates it with
`StudioReleasePayloadSchema`, and fails closed when the artifact is missing or invalid. The local
Studio seed remains available only for tests and release-artifact generation, while the architecture
check and production-boundary harness now reject `studio/sample-data.ts` imports from production
runtime files, including Worker handlers.

Added `build:studio-release` to write the current `data/artifacts/studio/v1/release.json` artifact
and extended `publish-serving-release.sh` so Studio release artifacts are uploaded with the D1/R2
serving promotion path.

Promoted the Studio API schemas into `packages/domain/src/studio-schemas.ts` and changed
`apps/web/src/studio/api-contract.ts` into a compatibility re-export. `@bp/domain` now exposes
Studio response schemas, the Studio release-payload schema, and JSON Schema exports for docs/OpenAPI
generation.

Added `packages/domain/src/studio-openapi.ts` and Worker endpoint `GET /api/openapi.json`. The
OpenAPI 3.1 document is generated from the package-level Studio JSON Schema exports and covers the
route-first read contracts used by the website and future agent/CLI surfaces.

Updated `GET /api/v1/studio/docs` so its endpoint table is derived from the generated OpenAPI paths
instead of being copied from the Studio release artifact.

Follow-up slice: split the runtime Studio API off the monolithic `studio/v1/release.json` read. The
shared projection builders now live in `packages/domain/src/studio-projections.ts`;
`bun run build:studio-release` writes page-shaped R2 artifacts such as `studio/v1/routes.json`,
`studio/v1/routes/:slug/index.json`, `studio/v1/routes/:slug/ladder.json`, `studio/v1/findings.json`,
and `studio/v1/briefs/:briefId/index.json`; and the Worker serves `/api/v1/studio/*` by validating
those endpoint projections directly. Missing or invalid projections fail closed, with no fallback to
the local seed or legacy v1 handlers.

Clarified the RESTful boundary: `/api/v1/studio/*` resources are the public product API and
`studio/v1/*.json` keys are private R2 storage details. Removed the public `X-Studio-Projection`
header so responses expose `X-Studio-Release` provenance without leaking object paths.

Documented the backend decision as REST over private projections rather than public D1/R2 object
access. The intended serving pipeline is now explicit: build Studio resource projections from D1
serving tables and R2 artifact manifests, publish them under versioned private R2 keys, and have the
Worker validate and serve those projections through `/api/v1/studio/*`. Public object/projection-key
endpoints remain out of bounds for the hard cutover.

Moved Studio projection generation into `@bp/pipeline`. `bun run build:studio-release` now runs the
pipeline `build:studio-release` command, loads the D1 export schema/seed, reads generated
route-slice artifacts, preserves the canonical public M15/Bx12 route/finding/brief slugs, and writes
the same page-shaped `studio/v1/*.json` projection tree consumed by the Worker. Removed the old
web-app sample-data release script from the active build path.

## [2026-05-18] engineering | Agent-Author API commitment

Committed to agents-as-authors as the Year-1 API audience. External coding agents must be able
to compose, edit, validate, and publish route evidence briefs against the same write surface that
backs the web composer. The web composer becomes one client of the API, not its privileged
surface.

Implications, captured in `wiki/engineering/agent_author_api.md`:

- A mid-layer "computed data" tier (per-segment month time series, ACE violation counts,
  treatment-state-by-period, peer cohorts, evidence catalog) is required. Currently the API only
  exposes evidence-shaped data; agents authoring novel claims need finer-grained derived
  projections.
- A write-side brief API is required: create/edit/validate/review/publish/retract endpoints
  mirroring every action available in the composer UI. Server-authoritative strength scoring
  gates publish. Idempotency keys on every write. Async job semantics for the LLM-paced drafting
  step.
- Raw observational data (GTFS-RT samples, D1 row keys, R2 object paths) stays internal.
  Mid-layer endpoints serve derived projections only, with the same `quality` provenance block
  the existing read surface uses.
- User-submitted findings rejected as a typed object; the dogfeed loop runs through briefs.

Verification target: an external agent given only the docs follows the canonical 11-step
walkthrough (find -> read mid-layer data -> POST /briefs -> poll -> attach evidence -> validate
-> review -> publish) and ends with a round-trippable published brief. The internal team runs
the same walkthrough against the same endpoints — that is the dogfeed test.

## [2026-05-20] engineering | Findings review queue artifact

The `findings:detect` job now writes a capped review inbox at
`data/artifacts/findings/<month>/review-queue.json` alongside the detector coverage audit. The queue
keeps the highest-priority candidates across the full detector matrix, records per-detector counts,
preserves route/scope/reason metadata, and attaches evidence refs from detector evidence links so
manual review can start from concrete source artifacts rather than the raw SQLite rows.

The March 2026 local run produced a 50-candidate queue spanning source gaps, persistent speed
hotspots, observed reliability, intervention gaps, and intervention underperformance. The artifact
also records the uncapped detector totals, omitted-by-cap count, evidence-linked candidate count,
priority bands, and review signals. In the latest run, all 462 candidates had evidence refs, 50 were
surfaced for review, and 412 were omitted by the cap. Top-ranked items were severe Q65/Bx15 speed,
reliability, and intervention findings.

Follow-up slice: the review queue now also groups surfaced route-scoped candidates into
`routeGroups` so reviewers can spot multi-detector routes without manually reconciling candidate
rows. The March 2026 local queue surfaced 43 route groups, including 7 multi-detector routes. Q65
ranked first with intervention-gap plus persistent-speed-hotspot signals; Bx15 and Bx5 paired
observed-reliability with intervention-underperformance signals.

Second follow-up slice: the review queue now includes a `summary` block with total and surfaced
priority-band counts, surfaced category counts, route priority-band counts, multi-detector route
count, and critical route-group count. The March 2026 local queue has 462 total candidates
distributed as 50 critical, 151 high, 204 medium, and 57 low; the 50 surfaced review items are all
critical and cover 31 data-quality, 9 observed-reliability, 5 intervention-gap, 3 speed-hotspot, and
2 intervention-underperformance candidates.

Third follow-up slice: the summary now makes cap behavior explicit with omitted priority-band
counts and `capExhaustedPriorityBands`. For March 2026, the 50-item cap covers every critical
candidate and omits the remaining 151 high, 204 medium, and 57 low candidates, so reviewers can see
that the first queue page is complete for critical items but not for lower bands.

Fourth follow-up slice: the review queue now includes a `health` block with machine-readable status
and issue codes for empty queues, omitted critical candidates, missing evidence refs, ungroupable
queues, and lower-priority cap omissions. The March 2026 queue reports `ok` with one informational
`lower_priority_candidates_omitted` issue for the 412 non-critical candidates behind the cap and no
evidence-link warnings.

Fifth follow-up slice: `findings:detect` now accepts a configurable non-negative
`reviewQueueLimit` (`--review-queue-limit` from the CLI) so tests and reviewer workflows can
exercise cap behavior directly. The detector orchestrator fixture now reruns with a zero-item queue
and verifies that omitted critical candidates produce `attention_required` with
`empty_review_queue` and `critical_candidates_omitted` warnings. The default March 2026 run still
uses the 50-item queue and reports `ok`.

Sixth follow-up slice: candidate validation is now agent-native. The review queue includes an
`agentReview` section aimed at Codex/Claude-style reviewers with instructions, a structured
decision schema, route packets for the top route groups, and one validation packet per surfaced
candidate. Each candidate packet carries claim text, scope, priority signals, evidence refs, and
required checks that force agents to validate from evidence rather than detector score alone. The
March 2026 artifact emits 20 route packets and 50 candidate packets.

Dogfood follow-up: an agent review of the first five March candidates showed two avoidable tool
calls: parsing escaped JSON evidence refs with `jq fromjson`, and opening detector source files to
interpret thresholds/field meanings. Candidate packets now include parsed `evidenceObjects` beside
the raw provenance strings plus `detectorGuidance` with default thresholds, key evidence-field
definitions, validation framing, and common follow-ups. The agent instructions now explicitly say to
use `evidenceObjects` first and retain `evidenceRefs` as provenance.

Second dogfood follow-up: the review packet was reframed from "agent validates/promotes candidate"
to "agent audits why the detector emitted this candidate." The `agentReview` mode is now
`agent_detector_audit`, with detector actions (`keep`, `downgrade`, `suppress`, `split`, `enrich`)
instead of publication decisions. Candidate packets now flag derived score fields with
`derivedMetricWarnings` so agents do not treat values like `speedPainScore` or
`reliabilityPainScore` as standalone evidence.

Algorithm improvement from the dogfood review: `intervention_underperformance` now requires a
current speed-derived detector signal for non-positive peer-adjusted speed-delta claims; reliability
signals are context only. This removed the 13 March 2026 underperformance candidates that were
backed by reliability pain plus speed-delta evidence, leaving 30 clean evaluated routes and 351
skipped routes for missing evaluated intervention or speed-signal input.

Feedback-loop follow-up: agent detector-audit output now has a typed results artifact
(`finding_detector_audit_results`) and a pipeline summary command, `findings:audit-feedback`. The
summary artifact rolls up actions by detector, derived-metric issue counts, missing-evidence themes,
and per-detector recommendations so dogfood reviews can feed back into detector thresholds, packet
enrichment, and split/suppress decisions without pretending the agent is approving public findings.

Context-detector follow-up: after the permit geocoding pass, `build:context-event-route-touches`
was rerun and now writes `data/artifacts/context-events/route-touch-audit.json`. The refreshed local
DB has 549,556 route touches: construction permits touch 23,412 joinable events across 378 routes
and opening permits touch 6,885 events across 377 routes. Added the first typed feature-layer slice
via `findings:signal-features`, which writes route/month/all-day signal features with speed, permit
touches, uncertainty counts, provenance refs, and per-feature coverage facts.

Follow-up integration: `findings:detect` now writes the signal-feature artifact as part of the
normal detector run and persists `permit_correlated_slowdown` through the findings tables, coverage
audit, and review queue. Intervention-gap and intervention-underperformance inputs now use
feature-derived route speed/reliability signals rather than consuming prior emitted detector
candidates. The March 2026 run now has six detectors and 599 total candidates: 199 source gaps, 100
speed hotspots, 100 observed-reliability findings, 100 intervention gaps, 0 intervention
underperformance findings, and 100 permit-correlated slowdown findings.

Operations follow-up: GitHub Actions now owns CI/CD for the public Worker. The existing CI workflow
was expanded into a verify-then-deploy pipeline: pull requests and pushes run the knowledge check,
type check, architecture check, tests, and web release gates; pushes to `main` deploy `@bp/web` to
Cloudflare with Wrangler after a successful verify job. The deploy job skips with an Actions notice
until the `CLOUDFLARE_API_TOKEN` GitHub Actions secret is configured. D1/R2 serving-release
promotion remains a separate reviewed publish step.

Pipeline finish planning pass: `knowledge/wiki/engineering/data_pipeline_finish_plan_v2.md` is now
the plan of record. The local March/May drift was repaired: March map artifacts and strict
`check:pipeline-v1` pass locally, and the May official GTFS-RT run
`gtfs-rt-v1-20260517T103607Z-24h` has route observed reliability and preflight source-status rows.
The source coverage ledger command now writes
`data/artifacts/source-coverage/2026-03/ledger.json`; the current ledger classifies 12 active
sources with only `equity_context` still needing action.

Historical corpus follow-up: route monthly speed/ridership trends now ingest the 2023-2024 speed and
ridership Socrata datasets plus the 2025+ datasets, with ridership backfill chunked by route/month
source windows. Local `local_route_month_trend` now covers 12,075 route-month rows from `2023-04`
through `2026-03`, all with speed and ridership trend coverage. Bus Wait Assessment was backfilled
for the same 36-month window, yielding 46,167 rows across 354 routes. Equity context remains
`excluded_until_fixed` because the Census ACS profile API now requires a `CENSUS_API_KEY` in this
environment.

Context/findings refresh: March 2026 context events and touches were rebuilt from the completed
source tables. The local DB now has 2,644,997 context events and 5,835,695 route touches; the route
touch audit records per-source join rates and keeps parking's low touch/geocode coverage explicit.
After rerunning intervention evaluation and `findings:detect`, the detector pass emits six detector
families and 600 candidates: 199 source gaps, 100 persistent speed hotspots, 100 observed
reliability candidates, 100 intervention gaps, 1 intervention underperformance candidate, and 100
permit-correlated slowdown candidates. March strict pipeline QA still passes with 0 issues.

Worker operations follow-up: scheduled refresh is split in code. The every-minute cron captures
GTFS-RT and skips the route-speed watcher, while `17 10 * * *` runs the route-speed availability
watcher. The Worker writes compact refresh health to `source-refresh/latest.json` when the ARTIFACTS
binding is available, including GTFS-RT status/object keys, route-speed status, and the
`shouldRebuild` decision. Heavy rebuilds remain manual Bun jobs on this PC; no Queue is needed yet.

Manual rebuild/export verification: after refreshing March historical trends, context, and findings,
`export:d1 -- --year 2026 --month 3` regenerated the serving export with 12,075 route-month trend
rows, 381 route observed reliability rows, 360 intervention comparisons, 1,050 route artifacts, and
579 corridor artifacts. `verify:d1 -- --year 2026 --month 3` passed with 0 issues and matching
expected-vs-loaded table counts. The dry-run `publish:serving-release -- --month 2026-03 --d1
bus-priority-serving --r2 bus-priority-artifacts` passed local publish completeness, checked 2,034
candidate R2 keys, skipped 1,988 already-present keys, and marked 46 as dry-run uploads with 0
failures.

Completion audit follow-up: added
`knowledge/wiki/engineering/data_pipeline_finish_plan_v2_completion_audit.md` to map the active
finish-plan goal to real evidence. The audit shows the historical, context, Worker-code, and manual
PC rebuild/export pieces are locally verified. The remaining blocker is specifically the deployed
Worker/R2 GTFS-RT handoff proof: mirror a contiguous 4-hour-or-longer Worker-written R2 window,
import manifests, parse protobufs, build observed headways/reliability, and run preflight. The local
official 24-hour run is processed and preflighted, but it does not by itself prove the deployed R2
mirror/import path.

Deployed R2 handoff proof closed: listed `bus-priority-gtfs-rt-raw` through the R2 S3 API and built
a 480-manifest window from `2026-05-17T17:13:54Z` through `2026-05-17T21:14:26Z`. The sequential
Wrangler mirror helper was too slow for this many objects, so the same reviewed manifest list was
mirrored with Bun's S3 client into
`data/raw/r2-mirror/gtfs-rt-r2-prod-20260517T171354Z-4h`: 480 manifests, 480 protobufs, and 0 failed
downloads. `import:gtfs-rt-r2-manifests` registered 480 snapshots over 14,462 seconds;
`ingest:gtfs-rt-snapshots` parsed 480 snapshots with 894,254 vehicle positions and 0 parse errors;
`build:observed-headways` produced 151,356 headway samples; `route-observed-reliability` wrote 381
May route rows with 261 observed routes and 149,376 route-summary samples; and `gtfs-rt:preflight`
passed with 0 issues for run `gtfs-rt-r2-prod-20260517T171354Z-4h`.

2023-present reframing follow-up: the target corpus window is now `2023-04` through the latest
complete public speed month, currently `2026-03`. Census ACS equity ingestion is repaired with
`CENSUS_API_KEY`: `ingest:equity-context -- --year 2024` loaded 2,327 NYC tracts, and
`route-equity-context -- --year 2026 --month 3 --acs-year 2024` wrote 381 route rows with 358
county-proxy assignments. The source coverage ledger now treats 311 and parking as historical
window sources instead of release-only samples, and it requires the target month count rather than
only min/max dates. 311 and DOT traffic-volume raw backfills ran for all 36 target months with
72/72 successful tasks; 311 now has 2,560,438 filtered rows and DOT traffic volumes have 196,342
rows. Parking is partially backfilled: FY2023 April-December plus March 2026 are loaded
(1,574,356 filtered rows, 10 distinct months), but FY2024/FY2025 API queries are slow/failing and
need a separate bulk strategy before this reframed goal can be marked complete. The regenerated
ledger reports two action items: 311 has complete raw history but low geocode/join coverage, and
parking still needs backfill plus a geocode strategy.

2023-present scope decision close-out: parking was explicitly demoted back to `release_context_only`
in the source coverage ledger. The normal month-ingest path can load FY2023/FY2026 parking slices,
but FY2024/FY2025 Socrata queries are too slow/failing for the current pipeline, and historical
parking rows are not detector-ready without a separate bulk loader plus geocode strategy. 311 stays
`complete_for_history` for raw coverage but carries an explicit join-rate caveat: route-context
features use only geocoded/joined rows. After these scope decisions, the regenerated March 2026
source coverage ledger reports 12 sources and 0 sources needing action. Context events were rebuilt;
the current local DB count is 6,447,473 rows. Route touches were rebuilt with the route-touch audit preserving low join rates,
`findings:detect` reran with six detector families and 600 candidates, strict March
`check:pipeline-v1` passed with 0 issues, D1 export/verify passed with 381 route equity rows, and
the dry-run serving publish passed publish completeness plus R2 dry-run audit.

Post-completion checkpoint planning: actual March production publish is still a deliberate manual
decision, not part of the automatic refresh path. Local export, verify, and dry-run publish are
green; execute `publish:serving-release --execute` only after reviewing the refreshed seed hash,
route equity rows, and release artifact diffs. Parking remains a future project: build a bulk
fiscal-year loader and geocode strategy before using it as historical evidence. The next 311 quality
project is to improve geocode/join coverage for the already-loaded 2023-present raw rows, starting
with route-relevant rows near March findings rather than trying to geocode all 2.56M rows blindly.

R2 mirror helper follow-up: `bun run pull:gtfs-rt-r2-run` now routes to a Bun/TypeScript pipeline
command using the R2 S3-compatible API and concurrent downloads instead of the old sequential
Wrangler object loop. The command keeps the same manifest-list workflow and output layout, supports
`--concurrency`, skips already mirrored files, resolves raw protobuf keys from each manifest, and
prints the matching `import:gtfs-rt-r2-manifests` command.

Operationalization checkpoint: the March 2026 serving release remains intentionally deferred rather
than executed in this pass. The local dry-run is green, but production D1/R2 mutation should happen
only as a deliberate release action after a final artifact/seed review. The faster R2 mirror helper
was exercised in real `--execute` mode against the reviewed 480-manifest production-length Worker
capture `gtfs-rt-r2-prod-20260517T171354Z-4h`; all 960 local files were present/skipped and the
helper reported 0 failures. The post-mirror handoff chain was rerun: 480 manifests imported, 480
snapshots parsed, 894,254 vehicle positions, 151,356 observed headway samples, 381 May route
reliability rows, 261 observed routes, and `gtfs-rt:preflight` passed with 0 issues under the
4-hour/40-second/90% snapshot thresholds. A CLI parsing bug discovered by the real `--execute` run
was fixed by making `--execute` use the shared boolean option helper and adding a regression test.

311 quality work started with a targeted date-window capability on `geocode:311`: `--since` and
`--until` now constrain the unattempted queue and order newest rows first. The first operational
slice ran for February 2026 with `--max-rows 1000 --batch-size 250`, yielding 999 physical-id hits,
1 miss, and 588 cache hits. After rebuilding context events and route touches, current 311 context
joinability increased to 106,703 rows, touched current 311 events increased to 70,816, and current
311 route touches increased to 251,732 across 378 routes. Parking stays outside this cycle as the
separate bulk-loader/geocoding project.

Post-checkpoint release path: PR #2 is open as a draft, mergeable, and has a green `verify` CI
check; it remains unmerged because the March 2026 production publish is still deferred to an
explicit release review. A larger February 2026 311 geocode slice ran with
`--max-rows 10000 --batch-size 500`, producing 9,874 hits, 126 misses, and 5,896 cache hits. After
rebuilding context events and route touches, February 2026 has 10,873 geocoded 311 rows and 74,768
unattempted rows; current 311 joinable rows increased to 116,577, touched events to 77,443, and
route touches to 274,003 across 378 routes. Parking remains parked as a separate future bulk-loader
and geocoding project.

Production release follow-up: PR #2 was marked ready and merged to `main` as squash commit
`26a50d7`. Ran `publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2
bus-priority-artifacts --skip-schema --execute`; the publish completed successfully. R2 publish
reported 2,034 candidate keys, 46 uploads, 1,988 skips, and 0 failures. Production smoke checks:
`/api/v1/status` reports baseline month `2026-03`, canonical release status `pass`, 381 routes,
1,629 artifacts, 0 issues, and May 2026 current observed signal from
`gtfs-rt-v1-20260517T103607Z-24h`; `/api/v1/studio/routes?limit=1` returns the D1-backed Studio
route list with 350 public route cards; remote D1 `route_brief_summary` has 381 rows. Continued 311
quality work with a 20,000-row February 2026 slice: 19,654 hits, 346 misses, and 12,358 cache hits.
After rebuilding context events/touches, February 2026 has 30,527 geocoded rows and 54,768
unattempted rows; current 311 joinable rows increased to 136,231, touched events to 90,658, and
route touches to 320,492 across 378 routes.

311 February 2026 target window completed: ran the remaining-window slice with
`geocode:311 -- --since 2026-02-01 --until 2026-03-01 --max-rows 60000 --batch-size 1000`. The job
scanned 54,768 rows, produced 54,292 hits, 476 misses, and used 33,457 cache hits. After rebuilding
context events and route touches, February 2026 has 85,768 filtered rows, 84,819 geocoded rows, 949
geocode misses, and 0 unattempted rows. Current 311 joinable rows increased to 190,523; touched
events increased to 125,101; and route touches increased to 433,267 across 378 routes. This closes
the first targeted monthly 311 improvement window; continue with January 2026 or another
newest-first month next rather than treating the entire 2.52M-row current table as one batch.

311 geocode completion: drained the remaining current-era 311 backlog month-by-month from January
2026 back through April 2023. Every loaded 311 row is now attempted. Final DB counts:
current-era 311 has 2,521,134 filtered rows, 2,504,843 geocoded rows, 16,291 explicit geocode
misses, and 0 unattempted rows; historical 311 has 39,304 rows, 37,707 geocoded rows, 1,597 misses,
and 0 unattempted rows. Rebuilt context events and route touches after the full drain. Current 311
now has 1,601,395 touched events and 5,418,460 route touches across 378 routes; historical 311 has
23,798 touched events and 79,442 route touches across 378 routes. This finishes 311 geocode/join
coverage for the loaded corpus; remaining non-joins are real geocode misses or events away from
the bus route/LION touch network, not unprocessed rows.

Parking completion pass: removed the remote Socrata `ORDER BY summons_number` from
`ingest:parking-violations` because it was the FY2024/FY2025 performance blocker; normalized rows
still sort locally before upsert. Backfilled all missing parking months from 2024-02 through
2026-02 with 25/25 successful tasks, after the earlier FY2023 April-December, 2024-01 smoke, and
2026-03 release month loads. Added date-window and grouped-address support to
`geocode:parking-violations`, plus a low-confidence `--street-only` sweep for truncated parking
locations. Final parking DB state: 5,753,409 filtered rows, 157,304 geocoded rows, 5,596,105
explicit misses, and 0 unattempted rows. Rebuilt context events and route touches; parking now has
4,740 touched events and 29,234 route touches across 341 routes. Keep parking
`release_context_only`: the remaining low join rate comes from source location quality
(camera-style/directional/intersection snippets), not from an unfinished loader.

Parking candidate quality audit: added `audit:parking-candidate-quality` to summarize candidate
fanout, match weights, and detector-review eligibility from `local_parking_violation_match` without
mutating any rows. The real local audit wrote
`data/artifacts/context-events/parking-candidate-quality-audit.json` and kept the source decision at
`keep_release_context_only` with `automaticPromotionAllowed=false`. Current counts: 96,760 matched
grouped locations, 596,527 candidate route rows, 3,085,310 represented events, 367 matched routes,
max candidate fanout 76, P90 candidate count 14, event-weighted P90 candidate count 24. A strict
manual-review subset exists: 54,920 groups and 1,096,073 events meet the high-confidence,
candidate-count <= 3, location-weight >= 0.8 rule. The rest stays weighted release context or
low-confidence release context; parking should not become detector-grade evidence without an
explicit promotion review.

Studio projection coverage fix: changed `build:studio-release` so the full public-route profile is
the default and `--profile demo` is the explicit curated mode. Refreshed the March 2026 D1 export
and verification (`route_brief_summary=381`, `route_readiness=381`, 0 verification issues), rebuilt
Studio projections, and reran `audit:studio-coverage`. The audit now measures route coverage
against public-visible route brief summaries instead of every route catalog row: March has 350
public-visible Studio routes out of 381 catalog rows, 350 route detail artifacts, 8 curated brief
details, and 6 curated finding details. Studio route coverage passes with
`studioRouteCoverageShare=1`.

Studio route-detail parity follow-up: added route artifact references to the Studio release
contract and route detail projection. `build:studio-release` now reads D1 `route_artifact` rows,
filters them to the selected Studio route set, and exposes the matching refs on
`/api/v1/studio/routes/:slug` detail payloads. Refreshed the website data support audit to mark the
route-facing cutover items done: full-public route listing/search, observed reliability, current
observed signal, and route detail artifact refs. The remaining website data support work is now
brief/finding depth, publish completeness, and write-side authoring.

Studio brief/publish support follow-up: split brief evidence and history into dedicated Studio
projection files (`evidence.json` and `history.json`) so those endpoints no longer depend on the
full brief body projection. Publish completeness now collects required keys from brief,
evaluation, and map manifests plus D1 `route_artifact` / `corridor_artifact` rows, and
`publish:r2-artifacts` includes those D1-referenced keys in its upload candidate set. Local March
2026 publish completeness passes with 3 manifests, 1,629 D1 artifact refs, 1,986 unique keys, and
0 missing files.

Studio public brief/finding coverage follow-up: expanded `build:studio-release` so March 2026
Studio briefs now cover every public route with route artifact refs instead of the old curated
8-brief slice. The rebuilt release has 350 briefs, 350 evidence projections, and 350 history
projections; 4 are marked `Published` and 346 are marked `Generated` to keep editorial state honest.
Findings are now a thresholded candidate feed capped by `--finding-limit` (default 50), not a
full-route detector-coverage claim. `audit:studio-coverage` now verifies route and brief coverage
against public `route_brief_summary` rows and reports finding coverage separately; the March audit
passes with `studioRouteCoverageShare=1`, `studioBriefCoverageShare=1`, `findingRouteCount=50`, and
`studioFindingCoverageShare=0.1429`.

All-source evidence integration pass: extended the source coverage ledger into a source evidence
eligibility ledger with allowed evidence roles, detector eligibility, automatic-promotion flags, and
blockers. Extended route-month signal features so every route now carries all normalized context
source counts, match weights, high-confidence touch counts, fanout, and provenance, not just permit
counts. `findings:detect` now attaches that route-month context evidence to detector candidates as
context evidence links while preserving primary metric evidence. Added `audit:evidence-corpus` to
verify the chain from source eligibility to signal features, detector evidence, and review queue.
March 2026 proof passes: 12 source groups, 8 primary-eligible sources, 5 automatic-primary sources,
3 manual-review-primary sources, 4 context/current-signal-only sources, 381 route-month features, 6
context sources, 599 detector candidates, 1,188 evidence links, 2,304 coverage rows, and 0 unlinked
review-queue candidates. The default detector review queue cap is now 200 so public Studio can fill
its 50 finding slots from detector candidates without falling back to route-score generation.
Rebuilt Studio from that 200-candidate detector review queue; public Studio findings remain at 50,
now composed of 2 reviewed/manual findings plus 48 detector-derived review candidates.

Studio finding review-state follow-up: added optional review provenance to the Studio finding
contract and release builder so findings can distinguish `reviewed`, `review_candidate`, and
`generated_candidate` publication states. The March release builder now marks B25/BX41 manual
findings as approved manual reviews, detector-queue findings as review candidates with candidate
and detector IDs, and route-score fallback findings as generated candidates. The findings feed and
finding detail screens display that state directly, keeping the broader detector/evidence corpus
visible without implying detector candidates are approved claims.

Studio coverage audit promotion guardrail: extended `audit:studio-coverage` to count reviewed,
review-candidate, generated-candidate, missing-review, and detector-sourced findings. The audit now
warns if a finding is missing review provenance, if a review candidate is marked approved, if a
reviewed finding lacks approved review state, or if a detector-sourced finding lacks candidate and
detector refs. The real March 2026 audit passes with 50 findings: 2 reviewed, 48 review candidates,
0 generated fallback findings, 0 missing review records, and 48 detector-sourced findings with
candidate/detector refs.

Ideal detector doctrine: added `knowledge/wiki/analysis/ideal_detector_system.md` to define the
north star for detector maturity. The page distinguishes the impossible perfect detector from the
buildable ideal detector, reframes candidates as hypothesis packets, decomposes confidence and
severity, defines evidence roles and claim-strength levels, outlines detector families, and sets
the next implementation targets: detector specs, review packet schema, counter-evidence support,
source-specific context detectors, multi-month/peer detectors, and a gold-set backtest.

Detector maturity implementation slice: added strict detector spec and review-packet contracts,
generated `detector-specs.json` and per-month `review-packets.json` from `findings:detect`, and
introduced `counter_evidence` as an evidence role. `persistent_speed_hotspot` now emits segment-scope
counter-evidence, `service_request_context` adds the first 311-specific context detector with
fanout/match-weight counter-evidence, and `audit:findings-backtest` checks review packets against a
tiny gold set with optional custom expectations. Focused detector/domain/pipeline tests pass, full
TypeScript passes, and touched-file Biome passes; repo-wide Biome remains blocked by pre-existing
unrelated formatting/a11y/import diagnostics.

Detector counter-evidence and peer-history slice: added explicit `counter_evidence` rows to
`observed_reliability`, `intervention_gap`, `intervention_underperformance`, and
`permit_correlated_slowdown`, covering sample support, inventory gaps, peer-comparison limits, and
permit fanout/work-type caveats. Added `multi_month_speed_peer`, a conservative route-level detector
over local route-month speed trends that compares each route with the monthly route-corpus median
and emits broad-peer limitations before promotion. The March 2026 real detector pass now has 8
detector families, 675 candidates, 1,817 evidence links, 3,066 coverage rows, 675 review packets,
and 5 multi-month peer-speed candidates.

## [2026-05-23] engineering | Reviewer promotion queue and matched peer groups

Added strict reviewer promotion contracts in `@bp/domain` and taught `findings:detect` to write
`data/artifacts/findings/<month>/promotion-queue.json` from the review packets. The queue exposes
readiness, recommended next actions, blockers, allowed claim strength, evidence summaries, decision
options, and the expected reviewer response shape before any detector candidate can become a
promoted finding. The real March 2026 proof has 673 promotion candidates: 454 ready for review, 21
needing enrichment, and 198 blocked source-gap/data-quality candidates.

Strengthened `multi_month_speed_peer` from a route-corpus median comparison to matched monthly peer
groups. The detector now chooses route-family/type/geography peers when enough supported routes
exist and records fallback methods per observation. The real March 2026 detector pass now has 8
detector families, 673 candidates, 1,811 evidence links, 3,066 coverage rows, 673 review packets,
and 3 matched peer-speed candidates, all using the strongest `route_family_type_spatial` method.

## [2026-05-24] engineering | Reviewer decisions and promoted-finding artifacts

Added reviewer decision capture and immutable promoted-finding artifacts. `@bp/domain` now has
strict contracts for reviewer decision inputs, validated decision records, review-decision
artifacts, promoted findings, and promoted-finding artifacts. The new `findings:promote` command
reads a reviewer decision file, validates approvals against the promotion queue and review-packet
evidence refs, blocks candidates with promotion blockers, writes `review-decisions.json`, and emits
hash-stamped `promoted-findings.json` records.

Expanded `audit:findings-backtest` from a tiny recall check into the first calibration loop. Gold
expectations can now require "should surface" or "should not surface" outcomes and minimum detector
confidence, and the audit adds detector/confidence calibration buckets from captured reviewer
decisions when a review-decision artifact exists. This still needs a much larger gold set and real
reviewer-decision corpus before confidence labels can be considered calibrated.

## [2026-05-24] engineering | Promoted findings in Studio projections

Wired immutable promoted-finding artifacts into the public Studio release builder. `build:studio-release`
now reads `data/artifacts/findings/<month>/promoted-findings.json` before the detector
`review-queue.json`, publishes route-scoped promoted records as reviewed/approved Studio findings,
and excludes the same route from review-candidate fill so an approved finding replaces its
candidate rather than duplicating it.

The Studio finding review contract now carries promoted-finding, decision, packet, reviewer, and
immutable hash provenance. `audit:studio-coverage` counts promoted findings as detector-backed
outputs and warns if any promoted finding loses candidate/detector refs or its promoted/decision/
packet/hash audit trail. Added fixture coverage proving `findings.json` and finding detail
projections preserve that audit trail.

## [2026-05-24] engineering | 200 manually curated promoted findings

Completed the first 200-finding manual curation pass for the March 2026 release. The curation file
`data/artifacts/findings/2026-03/manual-curation-decisions-200.json` approves 200 candidates with
revised conservative claim text, 600 approved packet evidence refs, no source-gap candidates, no
promotion blockers, and complete packet/counter-evidence/coverage support. The promoted artifact
`data/artifacts/findings/2026-03/promoted-findings.json` now has 200 immutable promoted findings
across observed reliability, persistent speed hotspot, permit context, intervention gap, 311
context, matched peer-speed, and intervention-underperformance detectors.

The curation audit represents every source currently exposed as March route-scoped detector
evidence: route trends, DOT permits, NYPD collisions, ACE summaries, observed reliability, Bus Wait
Assessment, 311, and parking context. DOT traffic volumes, DOT realtime traffic speeds, weather,
and equity context are not in the March detector review packets as per-finding evidence, so they
were not fabricated into approvals; they remain source-coverage/corpus context until detectors add
per-finding features for them. `build:studio-release -- --month 2026-03 --finding-limit 202` now
builds 202 reviewed findings: 2 manual reviewed findings plus the 200 promoted detector findings,
and `audit:studio-coverage` passes with zero review candidates and zero missing detector audit refs.

## [2026-05-24] engineering | Supplemental detector evidence for remaining ledger sources

Added non-primary supplemental evidence links to `findings:detect` for the four ledger sources that
were still corpus-only in March review packets: NOAA weather, route equity context, DOT automated
traffic volumes, and DOT realtime traffic speeds. Weather now attaches as counter-evidence or a
caveat with `weather_context_only` normalization status; equity attaches as prioritization context;
traffic volume attaches as route-adjacent context with `lagMonths`; and realtime traffic speed
attaches as a `current_signal` caveat with month offset from the release. None of these links can
become primary detector evidence by accident.

The read-only March DB check shows 673 route-scoped detector candidates across 302 routes. The new
context would attach weather and equity to all 673 route-scoped candidates, current traffic-speed
context to 198 candidates, and route-joined traffic-volume context to 25 candidates. The latest
route-joined DOT traffic-volume source month is January 2024, while the latest DOT realtime speed
day is 2026-05-18, so both sources stay appendix/context evidence rather than March detector-grade
proof. Focused type checks, touched-file Biome, and the detector orchestrator test pass.

## [2026-05-24] engineering | Studio context appendix for remaining ledger sources

Added `findings:context-appendix`, a standalone March route-level appendix for weather, equity,
route-joined DOT traffic volume, and DOT realtime traffic speed. `build:studio-release` now reads
that appendix and adds public finding reasoning steps for the available route context while
preserving promoted-finding ids, reviewer decisions, packet refs, and immutable hashes.

The rebuilt March Studio release still has 202 reviewed findings and zero review candidates. All
202 findings now include equity and weather reasoning, 3 include traffic-volume context, and 37
include current-traffic appendices. `audit:studio-coverage --year 2026 --month 3` passes with 350
public routes, 350 briefs, 202 reviewed findings, 200 detector-backed promoted findings, zero
findings missing review records, and zero detector findings missing refs. This is public evidence
coverage, not a true weather-normalized or traffic-normalized detector layer yet.

## [2026-05-24] engineering | Route-day weather split for observed reliability

Added the first descriptive weather-normalized evidence layer for observed reliability. The
supplemental context builder now splits `local_observed_headway_sample` rows by weather-impacted
versus reference days using NOAA daily precipitation, snow, wind, and weather flags, then records
sample counts, long-gap shares, expected-wait deltas, support status, and interpretation per route.
The observed-reliability detector path can attach this route-day split as non-primary
counter-evidence or a caveat, and `findings:context-appendix` exposes it for public Studio finding
reasoning.

The real March appendix has 346 routes with weather reliability splits and 339 with sufficient
samples on both sides of the split. The NOAA month summary now counts precipitation-derived rain
days instead of relying only on sparse weather-type flags: March 2026 shows 9 rain days and 2
high-wind days. The rebuilt Studio release still has 202 reviewed findings; all 202 now include an
observed-reliability weather-split reasoning step. This remains descriptive, not causal: it does
not yet control for day-of-week, hour, direction, stop mix, planned service, or incident context.

## [2026-05-24] engineering | Matched-window controls for weather reliability

Strengthened the observed-reliability weather split with matched local window controls. The
appendix now computes the broad weather-day/reference-day comparison and a controlled comparison
using only buckets that have both weather-impacted and reference samples for the same route, local
day-of-week, hour, direction, and stop. Public Studio reasoning now reports the controlled
interpretation and matched-window support instead of relying only on the broad route-day split.

The real March appendix has 303 routes with sufficient matched-window support, 39 insufficient
matched splits, and 4 thin-weather-sample matched splits. Controlled interpretations across the
346 route split rows are: 215 reference-days-worse, 72 weather-conditions-worse, 13 reference-days
still poor, 3 similar, and 43 insufficient. The rebuilt Studio release still has 202 reviewed
findings and all 202 include the weather-split reasoning step. This is a better descriptive
normalization layer, but still not a causal model because it does not control for planned service,
incidents, passenger loads, or exact weather at sample time.

## [2026-05-24] engineering | Planned-service controls for weather reliability

Added planned-service support to the weather reliability split. The appendix now derives scheduled
headway context from `local_route_schedule_timepoint` by route, schedule day type, hour, and stop,
then attaches schedule coverage, scheduled expected wait, controlled observed expected wait, and an
observed-to-scheduled expected-wait ratio to the matched weather-control windows. Studio finding
reasoning now reports whether the planned-service control is available, partial, or missing.

The real March appendix shows why this must remain a caveated control layer: across 346 weather
reliability route rows, planned-service matching is available for 6, partial for 326, and missing
for 14. Among the 202 public findings, 3 have available planned-service controls, 196 partial, and
3 missing. The release still passes `audit:studio-coverage`. Next improvement should either improve
schedule matching from observed direction/stop to GTFS scheduled stop patterns or add
passenger-load/incident controls that do not depend on exact schedule-stop alignment.

## [2026-05-24] engineering | Stronger weather-reliability controls

Strengthened the observed-reliability weather split controls in two ways. Planned-service matching
now tries exact route/day-type/hour/stop schedule windows first, then falls back to route/day-type/
hour schedule context when observed stop IDs do not align with scheduled timepoint stop IDs. The
context also carries passenger-load controls from `local_route_hourly_ridership` at route/day/hour
grain and incident controls from `local_context_event_route_touch` at route/date/hour grain, so
those controls do not depend on exact schedule-stop alignment.

Real March 2026 appendix verification: 346 routes have weather reliability split rows; planned
service, passenger load, and incident controls are each available for 336 rows and missing for 10
rows. Planned-service match methods are 6 exact stop/hour, 326 mixed exact plus route-hour
fallback, 4 route-hour fallback only, and 10 none. The rebuilt Studio release keeps the approved
release posture: 202 findings, all reviewed, zero review candidates, 200 detector-backed promoted
findings, and `audit:studio-coverage --year 2026 --month 3` passes. All 202 public findings carry
the observed-reliability weather split; 199 have available passenger-load and incident controls in
the public reasoning text.

Follow-up verification hardening added those control counts directly to
`finding_context_appendix.summary.weatherReliabilityControls`, and the CLI now prints
`plannedServiceAvailable`, `passengerLoadAvailable`, and `incidentAvailable` counts. Rebuilding the
March appendix reports 336 available for all three controls, with the same schedule-match method
breakdown, and the refreshed Studio release still passes coverage audit.

## [2026-05-24] engineering | Normalized controls in confidence calibration

Started using the normalized observed-reliability controls in `audit:findings-backtest` instead of
leaving them as public reasoning only. Gold-set expectations can now require
`minimumNormalizedControlReadiness`, and the backtest artifact records matched normalized-control
readiness plus control-adjusted confidence for every matched packet. Confidence calibration now
adds `byDetectorConfidenceAndControls`, which buckets candidates by detector, raw confidence,
control-adjusted confidence, normalized control readiness, schedule match method, passenger-load
status, incident status, and controlled-window support.

The calibration is conservative: observed-reliability candidates with strong controls keep their
raw confidence; partial controls can cap high confidence at medium; weak or missing controls
downgrade one confidence step. Rebuilding March review packets and rerunning the backtest produced
100 observed-reliability candidates: 93 strong-control candidates and 7 weak/missing-control
candidates whose adjusted confidence drops from high to medium. The 200 promoted approvals are now
recovered for calibration through immutable promoted-finding signature matching, because direct
review-decision candidate IDs drift after detector reruns. Backtest passes with 2/2 default gold
expectations, 0 control misses, 200 approved calibration matches, and 6 warnings for approved
observed-reliability findings with missing normalized controls.

## [2026-05-24] planning | Agent-first contributor leaderboard

Added [[wiki/engineering/agent_first_contributor_leaderboard|Agent-First Contributor Leaderboard]]
as the plan of record for a contributor leaderboard where Codex/Claude-style agents can submit
typed transit issue artifacts. The plan keeps the product bus-first, distinguishes contributor
issues from internal route-batch audit issues, requires deterministic validation and duplicate
fingerprinting before review, and awards points only through append-only score events after
confirmed usefulness.

The intended dogfood path is agent-first: an external coding agent discovers
`/.well-known/bp-agent.json`, reads OpenAPI contracts, checks route/finding context, validates one
`ContributorIssue` packet, and submits with an idempotency key. Public leaderboard pages are D1
snapshot projections over verified score ledger events, not raw report counts.

## [2026-05-31] engineering | Route-level materialization coverage audit

Added `audit analytics-materialization-coverage` to separate source/staging coverage from actual
derived route artifact coverage. The audit checks the route catalog against concrete month/run
outputs including stop-direction-hour EWT feature artifacts, route-slice inputs, generated route
briefs, EWT route-month score vectors, route summary/scorecard tables, segment speeds, hourly
ridership, and observed reliability summaries.

The first May 2026 run makes the current gap explicit: GTFS static and observed headway support
make 346 routes eligible for detector-grade stop-direction-hour EWT, but only one route artifact
exists so far. The March 2026 run shows a different picture: route-slice inputs, route brief
summary rows, and scorecards cover all 381 catalog routes, while generated briefs, EWT score
vectors, speed, ridership, observed reliability, and stop-direction-hour EWT artifacts still have
route-level gaps. This audit is now the place to catch "we generated a few examples but not the
fleet" before treating a surface as complete.

## [2026-05-31] engineering | Data-product completeness registry

Started Workstream 3 from `knowledge/wiki/engineering/ambitious_analytics_workstreams.md` with a
typed derived-product registry in `tools/pipeline-v2/src/registry/data-products.ts` and a read-only
`audit data-product-completeness` command. The registry is separate from
`knowledge/raw/source_manifest.yaml`: raw source availability no longer implies that local tables,
feature artifacts, score vectors, serving projections, or release manifests are complete.

The first registered slice covers 12 high-value products. Against the March 2026 observed release
candidate, the audit reports 8 complete, 3 partial, and 1 missing product. The remaining blockers
are release schedule timepoint route coverage, EWT score-vector route coverage, generated route
brief coverage, and the top-level map release manifest.

## [2026-05-31] engineering | Bulk CSV schedule-source import path

Added `ingest route-schedules-bulk` as a parallel route-schedule import path for Socrata
`rows.csv` snapshots. It downloads or reuses a full CSV snapshot, has a `--download-only` mode for
source caching without SQLite writes, streams rows into per-route scratch files, sorts each route
with the same deterministic key as the existing JSON route/page ingest, and writes the same
`local_route_schedule_stop` and route ingest status tables.

The first scratch benchmark used 2025 SIM35 rows: the existing JSON route/page path wrote 66,150
rows in 23.85s, while CSV download plus bulk import took 6.08s total. A SQLite `EXCEPT`
comparison found equal row counts and zero row differences between the two scratch outputs. The
path is documented in [[wiki/engineering/analytics_backfill_runbook|Analytics Backfill Runbook]]
and should be validated on a full-year snapshot before replacing the active schedule backfill.

## [2026-06-01] engineering | Detector evaluation negatives and score vectors

Extended the detector evaluation harness with deterministic clean no-hit labels, a stable-hash
holdout split, missing-data scope accounting, generic local-finding score vectors, and all-detector
packet coverage. The new builders are `build detector-evaluation-labels` and
`build detector-score-vectors`; both feed the March 2026 `evaluate detectors` artifact.

The refreshed March packet has 18/18 detector scorecards, 200 confirmed positives, 2,133 derived
confirmed negatives, 451 holdout negatives, 473 near-miss scopes, 451 missing-data scopes, and
8/18 detector families with review packets. The portfolio is no longer positive-only. The remaining
evaluation gap is quality, not shape: derived negatives need reviewer-labeled rejection examples,
and detector-specific historical score vectors are still needed for the families that report
`score_vector_unavailable`.

## [2026-06-01] engineering | Brief markdown rendering & embeddable primitives (ADR 0015)

Scoped the brief markdown-rendering work: brief bodies become markdown and the design's 14 brief
primitives (5 inline, 9 embedded) render *through* that pipeline, replacing three ad-hoc plain-string
prose renderers (reading / composer / review). Decided (with the user) on a markdown + typed-block
hybrid: prose and inline primitives use `react-markdown` + `remark-directive`/`remark-gfm`; embedded
figures carry a `ref` to a Zod-validated `BriefBlock` so figure data stays typed and the markdown stays
thin and safe (allowlist, no raw HTML). The stack is lazy-loaded into the already-split brief chunks to
hold the 168 KB initial-JS budget. Recorded in ADR 0015 and `docs/architecture/brief-markdown-primitives.md`.
Phasing: shared `<BriefProse>` inline tier across all three surfaces, then `BriefBlock` + the embedded
tier, then the authoring write path and AI emission. Open item: confirm whether `/briefs/$briefId`
server-renders in the Worker (the pipeline must run there if so).

## [2026-06-01] engineering | Brief draft body markdown and ref resolver

Landed the backend half of ADR 0015's authoring content graph: draft `bodyMd` is now part of the
domain draft contract, persists in D1 as `studio_brief_draft.body_md`, seeds from the release brief
sections when a draft is first initialized, and overlays onto `GET /studio/briefs/{id}` for
authorized operators only.

The draft resolver now checks local block refs from D1, evidence/source and metric-source refs from
the brief projection, and artifact refs from the route detail projection. Draft validation reports
missing body block refs and directive/block-type mismatches. Public released projections still need
body/blocks backfill and promotion wiring before the public reader can rely on `bodyMd`.

## [2026-06-01] engineering | Draft-only brief creation and review verdicts

Added the next authoring backend slice: `POST /api/v1/studio/briefs` now mints D1 draft-only brief
ids from a route, source brief, or finding seed, returns the draft contract, and lets authorized
operators read that draft through the canonical `GET /studio/briefs/{id}` path without exposing it
to anonymous public reads.

Reviewer workflow now has a separate `POST .../draft/verdict` endpoint for `approve` and
`request_changes`. Verdicts are gated by `review:briefs`, may attach a review comment message, and
move the D1 draft status independently from publish-candidate marking.

## [2026-06-01] engineering | Review threads and publish-candidate audit

Landed the backend collaboration primitives from
`docs/architecture/studio-review-collaboration-and-promotion.md`: `studio_brief_review_comment`
now stores draft-private root threads, replies, anchors, suggestions, and resolution state, and the
Worker exposes `.../draft/comments*` endpoints for anchored comments, change requests, replies,
status changes, and body-markdown suggestion acceptance.

Review state now participates in validation, approval, and publish-candidate marking: open change
requests or suggested edits block approval/publish until resolved or dismissed. Candidate export now
rejects stale blocking validation, works for source-backed and draft-only briefs, includes a private
audit section with validation/content hashes/review summaries, and the promotion command archives
that audit without copying private review threads into public `comments[]`.

## [2026-06-01] engineering | Durable refs, attach, and promotion receipt

Finished the next Studio authoring backend slice: draft refs now persist in
`studio_brief_draft_ref`, round-trip through the draft contract, and are embedded into candidate
exports/public projections alongside `bodyMd` and typed blocks. The Worker exposes
`GET/PUT .../draft/refs` for durable ref lists while preserving `.../draft/refs/resolve` as the
normalizer.

Added `POST .../draft/attach` so Send-to-brief can attach a captured Studio object as a typed block,
persist its refs, and append the matching body-markdown directive. Added
`POST .../draft/promotion-receipt` so the offline promotion command can close the D1 lifecycle by
marking a publish candidate as `published` with candidate id, target public brief id, artifact key,
artifact hash, and promotion timestamp.

## [2026-06-01] engineering | General review-packet generation and packet coverage

Added the registry-backed `findings review-packets` path for March 2026. It rebuilds detector specs
from the analytics registry, packetizes every local finding candidate, preserves existing packet ids
for already-reviewed candidates, regenerates the promotion queue, and emits
`review-packet-coverage.json` so complete, partial, missing, and no-candidate detector states are
tracked explicitly.

The refreshed March packet has 773 candidates and 773 packets across 9 candidate-bearing detector
families, with 0 candidate-to-packet gaps. Seven detector families have complete packets. Two are
partial: `source_gap` is intentionally data-quality-only, and `persistent_speed_hotspot` exposes a
real grain/lineage mismatch because segment candidates are backed by route-level coverage rows.
The detector evaluation harness now consumes the review-packet coverage artifact, so packet-covered
counts no longer treat partial packets as complete.

## [2026-06-05] engineering | Route-month history API slice

Added the first Serving Snapshot 2.0 history slice: `GET /api/v1/studio/routes/:routeId/history`
now returns D1-backed route-month speed/ridership history from `route_month_trend`, with explicit
coverage counts for total points, speed months, and ridership months. This exposes the multi-year
route-level facts already in the serving database while keeping segment-level carpets gated on the
future stable segment spine. Added the contract schema, OpenAPI/route registry entry, web client
helper, and Studio API facade coverage.

## [2026-06-02] engineering | Drizzle draft repository batch and builder pass

Reviewed Drizzle's D1 batch, transaction, dynamic query building, and `sql` template guidance, then
applied the next Studio draft repository modernization slice. Simple idempotency, draft, claim,
block, ref, history, validation, promotion, and review-comment operations now use Drizzle builders
instead of the legacy SQL bridge where practical. Grouped draft-record reads, replacement writes,
and review-comment status writes now use D1 `db.batch()` for sequential batched execution. The
remaining SQL bridge in `studio-brief-drafts.ts` is explicitly named `legacySqlStatement` and kept
for expression-heavy cases such as `coalesce(max(event_seq), 0) + 1`, claim renumbering arithmetic,
and `json_extract` cleanup.

## [2026-06-05] engineering | Studio API package refactor start

Started the package-first Studio API refactor. Added `@bp/studio-api` as the Cloudflare-edge runtime
package that will absorb `/api/*` helpers, Studio projection reads, bounded authoring writes,
source-refresh cron, and `BriefAuthorAgent` exports while keeping `apps/web` as the only deployed
Worker for now. The package starts with HTTP JSON/error helpers, route-template classification,
Server-Timing helpers, and R2 Studio projection loading. Updated the package-structure rules and
production-boundary harness so `@bp/studio-api` may import only `@bp/domain` and `@bp/db`, and must
not import UI, source adapters, analytics, pipeline code, or wiki files.

## [2026-06-05] engineering | Studio API read router extraction

Moved the Studio route classification, shared JSON/error/no-store/Server-Timing helpers, typed R2
projection readers, D1-backed Studio route listing fallback, and projection-backed
`/api/v1/studio/*` read router into `@bp/studio-api`. `apps/web/src/worker/index.ts` now delegates
public Studio reads to `handleStudioReadRequest`, while retaining the brief create/draft/auth/agent
write paths as local callbacks for draft-only and operator-overlaid brief reads. Added package tests
for route classification, projection key construction, and a projection-backed methods response.

## [2026-06-06] engineering | Source coverage audit applied-research cutover

Moved `audit source-coverage` ledger construction out of `tools/pipeline-v2`. The
`@bp/applied-research/local-db` package now owns source coverage policy, SQLite table/column/range
probes, geocode/join summaries, readiness classification, evidence eligibility, and summary rollups.
The source-coverage artifact path convention now lives in `@bp/applied-research/artifacts`, and the
pipeline command is reduced to CLI option parsing, local DB opening, and JSON writes.

## [2026-06-06] engineering | Route shape geometry index applied-research cutover

Moved the normalized route-shape geometry grouping and `local_route_shape_geom` write path out of
`tools/pipeline-v2`. The pipeline command still reads the current-bus-routes snapshot and uses the
source adapter to normalize rows, while `@bp/applied-research/local-db` now owns LineString/
MultiLineString extraction, MultiLineString GeoJSON construction, Spatialite table preparation,
upsert execution, and inserted/skipped run counts.

## [2026-06-06] engineering | Route source reconciliation applied-research cutover

Moved `audit route-source-reconciliation` route-universe reconciliation out of `tools/pipeline-v2`.
`@bp/applied-research/local-db` now owns local route catalog/source-set queries, canonical route
matching, source-year schedule waiver classification, route source classification, alias candidate
construction, eligible-product assignment, and reconciliation artifact assembly. The pipeline
command now opens the local DB, resolves paths, and writes JSON.

## [2026-06-06] engineering | Source month coverage matrix applied-research cutover

Moved the source-month coverage matrix portion of `audit data-product-completeness` into
`@bp/applied-research`. The package now owns local month/source table probes, source-year schedule
ingest rollups, source/derived/upstream status classification, status counts, and matrix artifact
construction. The pipeline command still owns the broader data-product registry audit for now, but
delegates matrix path naming to `@bp/applied-research/artifacts` and matrix construction to
`@bp/applied-research/local-db`.

## [2026-06-06] engineering | Route brief model applied-research cutover

Moved the route brief analytics/model builder out of `tools/pipeline-v2`. The new
`@bp/applied-research/route-briefs` subpath owns route-score brief construction, hotspot
projection, segment-universe assembly, schedule comparisons, ridership/speed profiles,
bus-lane/ACE intervention summaries, visibility adjustment, and comparison-rank rows. The
`route brief-model` pipeline command now retains local DB reads/writes, route-slice artifact writes,
CLI parsing, and run summary reporting. Studio release code now imports route-brief segment universe
types/builders from the package surface instead of the pipeline command.
Follow-up cleanup removed the duplicate `tools/pipeline-v2/src/commands/route/brief-metrics.ts`
implementation; the remaining bus-lane matching consumers now import the package-owned
`busLaneMatches` helper from `@bp/applied-research/route-briefs`.

## [2026-06-06] engineering | Route-speed histories batch manifest cutover

Moved the `studio route-speed-histories` batch manifest policy out of `tools/pipeline-v2`. The
`@bp/applied-research/feature-history` surface now owns the default speed-spine readiness filter,
readiness-list parsing, batch route/manifest contracts, summary rollups, and manifest construction,
while `@bp/applied-research/artifacts` owns the speed-history batch manifest path. The pipeline
command now keeps spine-manifest reading, route selection, existing-artifact probing, per-route
history orchestration, and JSON writes.

## [2026-06-07] engineering | 100x analytics plan

Added `knowledge/wiki/engineering/analytics_100x_plan.md` as the architecture plan for moving from
threshold-heavy detector runs to declarative panel specs, versioned statistical model artifacts,
detector model dependencies, evaluation-loss gates, and serving projections. The plan keeps
`packages/analytics` pure, places dataframe-backed panel/model building in `@bp/applied-research`,
uses SQLite for heavy pre-aggregation, and treats `segment_speed_residuals_v1` as the first
vertical slice to harden before expanding into daypart residuals, peer residuals, intervention
event panels, pulse fingerprints, and decoupling models.

## [2026-06-07] engineering | 100x analytics implementation slice

Added generic `PanelSpec`/`PanelManifest` contracts in `@bp/applied-research/feature-resolvers`,
attached panel manifests to `segment_speed_residuals_v1`, and built the next model artifacts,
`segment_daypart_residuals_v1` and `route_peer_residuals_v1`. The March 2026 residual artifacts now
report 3,102 segment-month release rows, 12,625 segment-daypart release rows, and 348 route-peer
release rows. `evaluate detectors` now includes model artifact diagnostics in the standard
detector-evaluation JSON/Markdown report, showing `segment_speed_residuals_v1` as consumed by
`treatment_scope_mismatch`, `segment_daypart_residuals_v1` as available but not yet wired to a
detector, and `route_peer_residuals_v1` as available for `multi_month_speed_peer`,
`degradation_trend`, and `positive_deviance`.

## [2026-06-07] engineering | Detector model dependency metadata

Added registry-level `modelArtifacts` metadata for residual-backed detectors. The registry now
declares `segment_speed_residuals_v1` for `treatment_scope_mismatch`,
`segment_daypart_residuals_v1` for `speed_pace_hotspot`, and `route_peer_residuals_v1` for
`multi_month_speed_peer`, `degradation_trend`, and `positive_deviance`. Detector evaluation now
derives model artifact consumer lists from the registry instead of hard-coded report strings, and
`detectorVersions[]` includes each detector's declared model artifact dependencies.

## [2026-06-06] engineering | Evidence corpus audit applied-research cutover

Moved `audit evidence-corpus` policy construction out of `tools/pipeline-v2`. The
`@bp/applied-research/evaluation` package now owns the evidence-corpus audit builder that summarizes
source evidence eligibility, route-month signal feature materialization, detector candidate/evidence
/coverage counts, review-queue linkage, gap detection, and pass/warn/fail status. The pipeline
command now resolves artifact paths, reads the prerequisite JSON artifacts, delegates audit
construction, validates the command output shape, and writes the report.

## [2026-06-06] engineering | Data-product completeness check cutover

Moved the source-year route coverage, route artifact coverage, score-vector route coverage,
JSON/file artifact, and artifact-glob evaluators for `audit data-product-completeness` into
`@bp/applied-research/local-db`. The pipeline command now supplies repo/artifact template values,
SQLite handles, generated timestamps, and path display formatting, while applied-research owns the
waiver parsing, source-year status diagnostics, route-id artifact filename variants, score-vector
route coverage, semantic duplicate/month/run checks, JSON artifact semantic validation, staleness
checks, and glob minimum-file coverage. Added direct applied-research tests for those evaluators.

## [2026-06-07] engineering | Intervention scope-fit model artifact

Added `intervention_scope_fit_v1` in `@bp/applied-research` to separate covered, partial-confirmed,
true-uncovered, route-only, geometry-unavailable, source-gap-blocked, and not-applicable treatment
scope states. The March 2026 artifact has 4,486 rows across 359 routes: 1,111 covered, 938 partial
confirmed, 2,085 true uncovered, 345 route-only, and 7 source-gap-blocked rows.

The detector registry now declares `intervention_scope_fit_v1` for `treatment_scope_gap` and
`treatment_scope_mismatch`, and `evaluate detectors` reports it alongside the residual artifacts.
Focused typechecks and tests pass for `@bp/analytics`, `@bp/applied-research`, `@bp/pipeline-v2`,
the scope-fit fixture, detector evaluation fixtures, and registry metadata.

## [2026-06-07] engineering | Source-gap model artifact

Added `source_gap_model_v1` in `@bp/applied-research` to make source gaps and blocked-claim labels
first-class model context. The March 2026 artifact has 381 route rows, all for
`transit_signal_priority` / `current_inventory_missing`, and blocks absence, current-confirmed
route TSP, and intersection-level TSP coverage claims.

The detector registry now declares `source_gap_model_v1` for `source_gap` and `intervention_gap`.
`evaluate detectors` loads the artifact and reports it in the standard model-artifact table with
381 release rows and 381 routes.

## [2026-06-07] engineering | Model-backed evaluation gates and serving projection

Added a `model_backed_evaluation_loss` hard gate to detector evaluation scorecards. For detectors
that declare `modelArtifacts`, reviewed primary positives must survive and reviewed-negative
precision must stay above the current floor. The March 2026 detector evaluation has 0
model-backed evaluation-loss blocked detectors.

`evaluate detectors` now also writes
`data/artifacts/model-artifact-serving-projection/2023-04_to_2026-03/2026-03/model-artifacts.json`,
a serving-safe model summary projection with 5 available models and 8 detector consumers. The
projection intentionally excludes raw model rows, raw `analytics-models/` artifact paths, and
residual scalar fields.

## [2026-06-07] engineering | Analytics/local DB first-principles ownership plan

Added [[wiki/engineering/analytics_local_db_first_principles_plan]] to clarify that the existing
package split is mechanically real but needs stronger accountability boundaries. The plan assigns
storage truth to `@bp/db`, corpus-to-panel extraction to `@bp/applied-research/local-db`, model and
data-product artifacts to `@bp/applied-research`, pure detector/statistical contracts to
`@bp/analytics`, and orchestration/file mutation to `tools/pipeline-v2`.

The plan folds in the current local DB audit recommendations: live migration journals for repo
tests, D1 seed validation, local/D1 drift checks, canonical data-product completeness, focused raw
SQL result validation, query-plan/perf gates, and package-boundary enforcement. Its key distinction
is that helper extraction alone only reduces duplication; mistake prevention requires owned
contracts, manifests, coverage/gap classes, and validation gates.

Follow-up implementation slice: moved local SQLite repository tests onto a shared in-memory helper
that uses the live `migrations-drizzle/local` journal, added a guardrail test against returning to
the stale flat `migrations/local` root, and wired D1 seed preflight validation for key
public-serving rows plus observed-reliability appendix rows. This work does not touch or migrate the
live `data/local/pipeline.sqlite`; it only uses in-memory SQLite test databases.

Added the local/D1 mirrored schema drift test for the serving boundary. It compares shared columns
across local and D1 projection table pairs for physical column name, type, nullability, default
presence, and enum values, while making compact-serving exclusions and D1-derived columns explicit.

## [2026-06-07] engineering | Decoupling quadrants internal-lab artifact

Added `decoupling_quadrants_v1` as a route-level internal-lab pattern-mining artifact for
speed/ridership/reliability splits. The March 2026 build writes
`data/artifacts/analytics-models/decoupling-quadrants-v1/2023-04_to_2026-03/2026-03/decoupling-quadrants.json`
with 367 route rows, 346 speed/ridership-supported rows, 346 reliability-supported rows, and
`publicClaimAllowed=false` for every row.

Historical `excess_wait_minutes` is only populated for the release month in the current observed
reliability table, so the artifact now uses excess-wait deltas when available and deterministically
falls back to observed long-gap-share deltas for historical reliability trend. Current pattern
counts are 271 coupled-or-weak, 37 reliability-worse/speed-stable, 18 speed-better/ridership-down,
15 speed-worse/ridership-resilient, 12 fast-but-unreliable, 11 slow-but-reliable, and 3
speed-worse/reliability-stable-or-better.

Added `pulse_fingerprint_v1` as the companion route-direction hour-of-week pattern artifact. The
March 2026 build writes
`data/artifacts/analytics-models/pulse-fingerprint-v1/2023-04_to_2026-03/2026-03/pulse-fingerprint.json`
with 699 route-direction rows across 353 routes and 404 supported pulse rows. The model compares
release-month hour-of-week speed cells against prior-month medians for the same route-direction
cell, with minimum gates of 12 historical months and 20 release-month trips. Current pattern counts
are 295 flat/weak, 183 worst-hour-of-week, 102 weekend pulses, 97 rush-hour pulses, and 22 off-peak
pulses. The artifact is internal-lab only: every row has `publicClaimAllowed=false` because it
identifies timing fingerprints, not causes.

Regenerated `evaluate detectors` so the serving-safe model projection includes both internal-lab
pattern artifacts. The March 2026
`data/artifacts/model-artifact-serving-projection/2023-04_to_2026-03/2026-03/model-artifacts.json`
now has 9 available models, 0 missing models, and 10 detector consumers. `pulse_fingerprint_v1` and
`decoupling_quadrants_v1` appear with empty `detectorConsumers` lists; the projection still omits raw
model paths, row arrays, and residual scalar fields.

Added a first-class `qualityLab` block to
`data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation.json`. The March
2026 evaluation now exposes reviewed-decision count, reviewer approval share, promoted-finding
yield, false-positive root counts, model-backed detector count, model-backed evaluation-loss blocks,
score-vector availability, and a threshold/rank-stability coverage status. Current values are 200
reviewed decisions, 200 promoted findings, 10 model-backed detectors, 0 model-backed blocked
detectors, 20 score-vector-backed detectors, 0 score-vector-unavailable detectors, and
`thresholdAndRankStabilityStatus=available`. The compact rank-stability check inspects detector
score-vector score distributions without copying raw vectors into the evaluation artifact; the real
run checked 20 detectors, marked 4 as fragile under current top-rank concentration / near-threshold
sensitivity rules, and recorded `maxTopTenShare=1` plus `maxThresholdSensitivityShare=0`.

## [2026-06-07] engineering | Treatment scope-gap consumes scope-fit model

`treatment_scope_gap` now accepts `treatmentScopeFitContext` on segment inputs. The detector uses
that model context before local geometry heuristics, suppressing uncovered-scope claims when
`intervention_scope_fit_v1` says a segment is covered, partial-confirmed, geometry-unavailable, or
source-gap-blocked.

The applied-research resolver attaches `intervention_scope_fit_v1` rows to scope-gap detector
inputs, and `findings run-detector --detector-id treatment_scope_gap` loads the generated
scope-fit artifact. The March 2026 run loaded 4,486 scope-fit rows, attached context to 4,134
segment inputs, and produced the requested 20-candidate capped run artifact.

Follow-up calibration reruns now preserve full candidate summaries when a detector run is invoked
with a higher `candidateLimit`. `treatment_scope_gap` also consumes
`segment_speed_residuals_v1` context and suppresses true-uncovered candidates that are not worse
than modeled expectation on an already chronically slow route. The post-model-gate audit lives at
`data/artifacts/findings/2026-03/treatment-scope-review-set/CALIBRATION-AUDIT-AFTER-MODEL-GATES.md`.
Against the adversarial 50-packet review set, all 6 reviewed primary findings survived, 37 reviewed
packets dropped, no suppress-labeled reviewed packet still emits, and 4 reviewer-only packets remain
as internal calibration debt.

## [2026-06-07] engineering | Context-event payload contract

Added an explicit Zod contract for `local_context_event.payload_json` in
`@bp/applied-research/local-db`. Context-event builders now serialize source-specific payloads
through a single validated helper before `@bp/db/local` upserts them, preserving the mechanical split:
the DB package owns persistence and applied-research owns source semantics. Added focused tests for
valid payload parsing and malformed payload rejection. This continues the Analytics / Local DB
first-principles cleanup without touching the live `data/local/pipeline.sqlite` file.

Added `listRouteCatalogIds()` to `@bp/db/local` as the canonical route-universe ID read, with an
in-memory live-migration-backed repository test. Raw `bun:sqlite` consumers still need incremental
port cleanup, but new code has a package-owned helper instead of repeating the route catalog query.

Added a shared `routeLionLinkFanoutCte()` helper in `@bp/applied-research/local-db` and routed the
context-event route-touch and parking-violation match fanout queries through it. The duplicated
`local_route_lion_link` `physical_id -> route_fanout` aggregate now has one source. Also marked
`local_parking_violation_match`, `local_lion_segment_geom`, and `local_route_shape_geom` as
intentional raw-only tables in the DB schema/README, and moved several read-only pipeline opens
(Studio release/geometry helpers, pipeline-v1 check, treatment-review artifact generation) onto
`openLocalPipelineDb(..., { readonly: true })`.

Expanded the D1 seed preflight from a few public-serving rows to the full rendered seed surface:
route catalog/type/direction, route inventory/readiness/build-plan rows, reliability rows,
interventions, corridor rows, timeline/speed/source coverage, equity, scorecards, brief windows,
rankings, and route-batch rows now validate against their Drizzle insert schemas before SQL is
emitted. Added a route-catalog negative test alongside the existing scorecard and appendix
reliability tests.

Aligned the data-product completeness gap vocabulary with the first-principles coverage plan by
adding explicit `source_absent` support to the manifest lifecycle schema, classifier, coverage
summary buckets, and pipeline command output schema. A focused test now proves source-absent
products remain distinguishable from `available_not_fetched` and still roll up under upstream
blocked coverage.

Centralized the small data-product completeness artifact reader as
`dataProductCompletenessStatusMap()` in `@bp/applied-research/data-products`. Detector corpus-grain
and analysis dependency-closure now consume that shared parser instead of carrying separate local
status/reason extractors, reducing coverage vocabulary drift between downstream audits.

Added explicit data-product refs to analytics detector-readiness surfaces. Backfill surfaces and
direct surfaces now carry `registryProductId`, with
`DETECTOR_READINESS_REGISTRY_PRODUCT_BY_SURFACE` tying policy surface IDs like
`observed_headways`, `gtfs_schedule_runtime`, and context route-touch checks back to
`DATA_PRODUCT_MANIFEST`. The GTFS schedule fallback distinguishes current release timepoints from
the source-year schedule-stop backfill product. Focused readiness/materialization tests now assert
the mapping is registered.

Moved `route-schedules-bulk --only-missing-current-routes` off its local raw
`SELECT DISTINCT route_id FROM local_route_catalog` query and onto the `@bp/db/local`
`listRouteCatalogIds()` helper through `createLocalPipelineDb(sqlite)`, preserving the existing
missing-table error and in-memory ingest behavior.

Closed a product-manifest drift seam in the new panel/model layer. Built-in `PanelSpec`
`requiredProducts` now use canonical `DATA_PRODUCT_MANIFEST` IDs instead of raw table/artifact
nicknames, with new manifest products for `local_intervention_events_release` and
`route_treatment_summary_artifact`. Analytics detector registry entries now expose
`requiredDataProducts` derived from their feature grains, and applied-research tests assert both
panel and detector product refs resolve to registered products. Detector evaluation artifacts now
copy those data-product dependencies into `detectorVersions[]` next to each detector's model
artifacts, so downstream gates can see both dependency classes without re-inferencing them.

Added Phase 7 boundary enforcement and docs for the Analytics / Local DB split. The production
boundary harness now rejects `@bp/analytics` imports of `@bp/db`, `@bp/applied-research`,
filesystem/SQLite, and dataframe runtimes, and public app runtime imports of
`@bp/applied-research`. Package READMEs now spell out `@bp/db` storage truth,
`@bp/applied-research/local-db` corpus-to-panel ownership, data-product completeness ownership, and
analytics purity. `knowledge/wiki/engineering/package_structure.md` now has the review checklist
for expected universe, product/gap state, validation boundary, surface class, package home, and
SQLite safety.

Added the first Phase 6 query-plan guard for hot segment-speed panel reads. The local schema now
declares `local_route_segment_speed_month_route_idx` on `(month, route_id)`, with a matching local
Drizzle migration file, and `@bp/applied-research/local-db` exports the segment-month and
segment-daypart SQL handles so tests can run `EXPLAIN QUERY PLAN` directly. The focused in-memory
test asserts month-range panel reads use an index and do not fall back to a full
`local_route_segment_speed` scan; route-filtered reads are allowed to use the table primary key.

Expanded the Phase 6 query-plan guard to the next model-panel readers: pulse fingerprints,
reliability exposure ridership rows, decoupling route trends, decoupling reliability rows, and the
intervention panel. Added month-first local indexes for `local_route_hourly_ridership`,
`local_route_month_trend`, and `local_route_intervention_comparison`, plus a matching migration
file under `migrations-drizzle/local`. The in-memory planner test now asserts those broad
month/range panel reads use the intended indexes and do not regress to full table scans.

Hardened the data-product completeness manifest against vague route coverage. Historical segment
speed, hourly ridership, and route intervention comparison products now declare concrete route
universes, and the data-product registry test fails any route-bearing or month-bearing coverage
check whose product omits the matching `expectedUniverse.routes` or `expectedUniverse.months`. This
keeps "complete" tied to an explicit searched universe instead of a row-count proxy.

Added JSON validation for finding coverage-audit payloads at the `@bp/db/local` repository boundary.
`insertCoverageAudit`, `replaceFindingsForMonth`, and `replaceFindingRun` now reject malformed
`inputsSeenJson` or `inputsExpectedJson`; the replace paths validate before deleting existing
candidate/coverage rows. This closes the Phase 1 follow-up for coverage-audit JSON payloads without
touching the live SQLite database.

Moved `findings repair-persistent-speed-coverage` off its direct
`local_finding_coverage_audit` `INSERT OR IGNORE` SQL. `@bp/db/local` now exposes
`insertCoverageAuditIgnore`, which preserves duplicate-ignore behavior while applying the same JSON
payload validation as the other findings repository write paths. The command boundary test now
asserts the command imports `@bp/db/local` and does not spell the coverage table insert directly.

## [2026-06-08] engineering | Detector readiness serving manifest

Added a serving-oriented detector readiness manifest builder in `@bp/applied-research`. It consumes
calibrated readiness projections and emits route-addressable summaries with public finding refs,
route-context refs, internal review/suppressed counts, source months, caveats, evidence refs, and
readiness reasons without exposing raw detector candidate or label blobs.

Built the first combined 2026-03 manifest from treatment-scope readiness and CJTP v2 readiness at
`data/artifacts/detector-serving-readiness-manifest/2026-03/route-detector-readiness-manifest.json`.
The manifest covers 159 routes with 45 public finding refs, 102 route-context refs, 27 review-queue
items, and 79 reviewed suppressed items; global skipped coverage counts remain summary-only because
the source readiness projections do not route-address every skipped coverage row.

Wired the manifest into Snapshot 2.0 serving artifacts as one shared R2 object at
`studio/v2/detectors/route-detector-readiness-manifest.json` plus compact per-route
`route_artifact` refs named `detector_readiness_manifest`. The March D1 export stages the safe
manifest under `data/artifacts/studio/v2/detectors/`, emits 159 detector-readiness route refs, and
records `detectorReadinessManifestAvailable` so missing manifests remain non-fatal.

Added a frontend-safe route insight projection over the detector readiness manifest. Route detail
responses now expose polished `insights` objects with product language for customer journey and
treatment-scope patterns while keeping detector ids, readiness buckets, review queue counts,
suppressed counts, raw candidates, and gold/eval terminology out of public copy. The Studio API
enriches route detail responses from the staged Snapshot 2.0 manifest when it is available.

## [2026-06-05] engineering | Studio API authoring runtime extraction

Moved Studio brief create/draft write handlers, draft projection overlay hooks, session/cookie
identity helpers, and the `BriefAuthorAgent` runtime into `@bp/studio-api`. The package root keeps
lightweight HTTP/read/auth helpers, while the Think-backed draft handlers and Durable Object class
live on the focused `@bp/studio-api/authoring` subpath so Bun package tests do not load Worker-only
AI dependencies. `apps/web/src/worker/index.ts` now acts as the adapter for magic-link email/session
issuance, asset/SEO fallback, and Studio API dispatch.

## [2026-06-06] engineering | Detector corpus grain artifact boundary

Continued the applied-research hard cutover for `audit detector-corpus-grain`. Detector-corpus
artifact path naming and detector-specific score-vector artifact discovery now live in
`@bp/applied-research/artifacts`, alongside the existing local candidate/coverage count selectors in
`@bp/applied-research/local-db`. At that slice boundary, `tools/pipeline-v2` still owned the
corpus-grain audit builder, markdown renderer, manifest loading, and file writes.

## [2026-06-01] engineering | Packet coverage gate and persistent-speed coverage repair

Finished the follow-up slice for review-packet coverage. `persistent_speed_hotspot` now emits
segment-scope coverage rows for new runs, and the March local findings table was repaired with 100
exact segment hit rows for its existing candidates. Added `findings coverage-audit` so
`detector-coverage-audit.json` is rebuilt from SQLite instead of stale hand-maintained detector
lists; it now records 773 candidates, 3,680 evidence links, and 17,094 coverage rows, including
13,928 `speed_pace_hotspot` segment/daypart rows.

`findings review-packets` now also regenerates `review-queue.json` from the same packet/promotion
surface, keeping the Studio serving queue aligned with 773 packets and 0 unlinked candidates. Added
`audit review-packet-coverage` as a release gate: March now has 8 complete candidate-bearing
detectors, 1 warning-only partial (`source_gap`, data-quality packets without counter-evidence), and
0 missing packet candidates. Reran `evaluate detectors`; portfolio pre-gate and gated scores are now
854.4, and `speed_pace_hotspot` no longer has the missing-data-scope flag.

## [2026-06-01] engineering | Registry detector execution and route-month shadow audit

Extended `findings run-detector` beyond `speed_pace_hotspot` to run five more registered detector
families through typed feature resolvers: `headway_reliability_ewt`, `bunching_hotspots`,
`schedule_mismatch`, `travel_time_variability`, and `degradation_trend`. The March local findings
surface now has 982 candidates, 4,098 evidence links, and 1,322,549 coverage rows across 14
candidate-bearing detector families.

Refreshed review packets, packet coverage, generic score vectors, evaluation labels, evaluation
scorecards, and the corpus-grain audit. Packet coverage now passes with 982 packets for 982
candidates; `source_gap` has a packet-coverage waiver for absent counter-evidence because it is a
data-quality detector, while still being blocked from service-performance promotion. The generic
score-vector builder now handles million-row coverage arrays without spreading scores onto the
call stack.

Added `audit route-month-shadow`, which compares route-month clean no-hits against richer-grain
detector candidates on the same route. The first March run found 350 route-month clean-no-hit
routes, 112 routes with hidden richer-grain candidates, and 1,142 hidden candidate scopes. The
evaluation harness now reports 18 scorecards, 20,933 derived negatives, 4,185 holdout negatives,
782 near-miss scopes, 1,300,725 missing-data scopes, and a portfolio gated score of 845.2.

## [2026-06-30] engineering | Effect runtime starts in pipeline commands

Accepted ADR 0019 for adopting Effect as the pipeline command runtime/service boundary. The first
slice adds catalog-aligned `effect@4.0.0-beta.92` and `@effect/platform-bun@4.0.0-beta.92`, schema
tagged errors, a scoped local SQLite layer, a ManagedRuntime helper, and a route build-plan service.

`route build-plan` now runs through the Effect workflow and injectable service layer instead of the
old local DB middleware/context variable. Command parsing remains on Liche for now; migrating to
`effect/unstable/cli` is deferred until more command handlers share the Effect runtime pattern.

Extended the same runtime pattern to a shared `RouteLocalDbService` for `route reliability-baseline`,
`route observed-reliability`, `route readiness`, and `route equity-context`. These commands now use
the scoped local SQLite layer, schema-tagged command errors, and injectable Effect workflows while
leaving deterministic route aggregation in `@bp/applied-research/local-db`.

Added `BuildLocalDbService` for compact local build commands. `build context-events`,
`build observed-headways`, `build route-lion-link`, and `build lion-geometry-index` now run through
Effect workflows; the spatial commands request `{ spatial: true }` through the local DB layer instead
of through command middleware.

Completed the route command-family runtime cutover. `route intervention-evaluation` now shares the
route local-DB service, while `route brief-model` moved its route-slice artifact and local projection
workflow into a focused `RouteBriefModelService`. All commands under
`tools/pipeline-v2/src/commands/route/` now enter local DB work through the Effect runtime/layer
boundary instead of `withLocalDb` / `localDbFromCtx`.

Moved the Studio route-data command slice onto the Effect runtime boundary. `studio route-speed-spine`,
`studio route-speed-history`, `studio route-speed-spines`, `studio route-speed-histories`, and
`studio route-treatment-summary` now use the shared `LocalDbCommandService` with schema-tagged command
errors and the scoped local SQLite layer. The existing artifact builders and batch resume semantics
remain unchanged, keeping route histories, timelines, and treatment summaries available for the
simplified public product surface.

Generalized the same local-DB task service for small utility commands. `export
route-speed-history-coverage-index`, `verify d1`, and `check spatialite` now run through
`runLocalDbCommand` and `makeLocalDbCommandLayer`; read-only and spatialite setup are explicit layer
options instead of command middleware side effects.

Moved the remaining build utility commands that own snapshot/artifact/provider work onto the generic
local-DB task service. `build route-shape-geometry-index`, `build context-event-route-touches`, and
`build parking-violation-matches` no longer read SQLite from Liche middleware context; the spatial
builds request spatialite via the Effect local DB layer.

Moved the spatial geocode command family onto the same Effect local-DB task service. `geocode 311`,
`geocode nypd-collisions`, `geocode parking-violations`, `geocode permits`, `geocode
traffic-speeds`, and `geocode traffic-volumes` now open local SQLite/spatialite through
`makeLocalDbCommandLayer` and expose command failures through `PipelineLocalDbCommandError` instead
of relying on Liche middleware context.

Moved the local-DB-backed ingest command slice onto the generic Effect boundary. Route catalog,
coverage, trends, segment speeds, hourly ridership, customer journey metrics, GTFS-RT snapshots,
weather, equity context, bus lanes, ACE sources, DOT traffic/permit sources, LION, NYPD collisions,
parking violations, and 311 now use `runLocalDbCommandBoundary` instead of `withLocalDb` /
`localDbFromCtx`, while keeping their source-specific `run*Ingest` functions directly testable.

Finished the command-tree local DB middleware cutover. Recovered Bus Observatory imports, GTFS-RT
collection/status/preflight, route ridership backfill, map artifacts, corridor modeling, D1 export,
pipeline v1 check/audit/finalize, and Studio/source coverage audits now enter SQLite work through
Effect boundaries. Read-only audits request `{ readonly: true }` on the local DB layer, and a command
boundary test now rejects any reintroduced `withLocalDb` / `localDbFromCtx` references under
`tools/pipeline-v2/src/commands`.

Tightened the local DB boundary after the cutover: deleted the unused Liche local DB middleware
helpers from `tools/pipeline-v2/src/lib/local-db.ts`, moved the remaining command-owned direct
`openLocalPipelineDb` calls in clean-check, Studio release geometry/coverage, and docs Tier 2 shared
helpers through `runLocalDbCommandBoundary`, and extended the boundary test to reject direct local DB
opens from command sources.

Collapsed the older verbose generic local-DB command wiring to `runLocalDbCommandBoundary`.
Geocode, compact Studio route-data commands, D1 verification, spatialite check, route speed-history
coverage export, and small build utility commands no longer manually pair `runLocalDbCommand` with
`makeLocalDbCommandLayer`; dedicated route/build services remain on explicit service-specific
`runPipelineEffect` layers.

## [2026-07-01] engineering | Applied research package hard cutover

Deleted `packages/applied-research` after moving survivor pure builders into `@bp/analytics`
subpaths and local SQLite aggregation into `tools/pipeline-v2/src/lib/local-db-aggregates`.
`tools/pipeline-v2` no longer depends on `@bp/applied-research`; `tsconfig.base.json`, `bun.lock`,
and the production-boundary harness now treat the package as removed.

The simplified architecture is: pure reusable analytics in `packages/analytics`, serving/storage
contracts in `packages/db` and `packages/domain`, and pipeline-local source aggregation, SQLite row
loading, and artifact I/O in `tools/pipeline-v2`. This keeps the Effect runtime/layer work focused
on pipeline commands without preserving the retired research/composer/detector package identity.

## [2026-07-01] engineering | Effect pipeline runtime foundation complete

Completed plan 015 against ADR 0019. Pipeline command families now use Effect runtime boundaries,
schema-tagged errors, scoped local DB layers, D1 replay, and file-system services instead of Liche
local DB context. `PipelineFileSystemService` now returns raw JSON as `unknown` at the service
boundary, with legacy Promise helpers retaining typed overloads for compatibility.

Tightened the last Effect-service file seams found in this pass: route intervention document-anchor
reads and route brief slice writes now go through the Effect-backed JSON/file helper instead of
direct `Bun.file` or `Bun.write`. Plan 015 is marked done; follow-up Effect work should target
source-client consolidation, provider/retry seams, and worker/API enforcement separately.

## [2026-07-01] engineering | nyc-transit-kit consumer cutover blocked

Checked Plan 014 after the Effect runtime migration. The latest published `@nyc-transit-kit/*`
packages are still `0.1.1`, and the SODA3/MTA/compat packages depend on `effect@4.0.0-beta.83`
while this repo now catalogs `effect@4.0.0-beta.92`. Plan 014 is marked blocked until the toolkit
publishes an Effect-aligned release or the repo makes an explicit dependency decision with full
sources, pipeline, Studio API, and Worker build verification.

## [2026-07-01] engineering | Studio API registry enforcement live slice

Completed Plan 008 against the hard-cutover public Studio API. `findRouteSpec` now exposes the
matched registry route, and the dispatcher uses it centrally for fail-closed future `session`
routes, required idempotency-key checks, and declared cache policies. Current live routes are public
with `noIdempotency`, so the behavior change is cache enforcement: health/OpenAPI/map reads now pick
up the public Studio cache policy, RUM receives `private, no-store`, and artifact responses keep
their existing immutable cache header.

Verification: `bun --filter @bp/studio-api typecheck`, `bun --filter @bp/studio-api test`,
`bun run test:worker`, `bun --filter @bp/web build`, `bun run check:web-architecture`, and scoped
Biome on the touched Studio API files all passed.

## [2026-07-01] engineering | OpenAPI generated client types blocked

Checked Plan 007 with `openapi-typescript@7.13.0`. The generator fails on the current
`studioOpenApiDocument` because zod-derived response schemas embed local `$defs` refs that become
unresolvable when nested under OpenAPI path response schemas. The attempted generator/dependency
changes were removed; Plan 007 is marked blocked until the OpenAPI document is emitted with
resolver-safe bundled schemas.

## [2026-07-01] product | Legacy brief fiction removed by hard cutover

Marked Plan 005 complete after verifying the legacy brief evidence/history pages and brief authoring
components were deleted by the hard cutover. The old hardcoded evidence heatmap, version fallbacks,
and fake freshness/status chrome are no longer reachable public surfaces; remaining matching numeric
literals are unrelated tests, demos, fixtures, or route visualization examples.

## [2026-07-01] product | Portfolio front door updated for hard cutover

Marked Plan 011 complete in hard-cutover form. The README now exposes the verified live Worker URL,
analytics primer, detector readiness loop, Tier 2 document-processing status, ADRs, and contributor
instructions. The docs intentionally do not recreate `packages/applied-research`; `knowledge/index.md`
now labels the applied-research wiki pages as historical context after the package deletion.

## [2026-07-01] product | Riders equity context surfaced

Completed Plan 001 on the hard-cutover route-detail stack. `@bp/db` now exposes a per-route D1
equity-context lookup, `@bp/domain` carries the compact route-detail `equityContext` contract, the
Studio API enriches rich and partial route details from `route_equity_context`, and the Riders tab
renders a minimal ACS "Who rides here" strip when enough fields are present.

## [2026-07-01] engineering | Public serving path hardened

Completed Plan 012 in hard-cutover form. The public artifact passthrough now rejects empty,
absolute, backslash, control-character, dot-component, malformed, and repeated URL-decode traversal
keys through exported `isValidArtifactKey` coverage. Public API and Studio read failures now return
generic dependency/artifact messages while preserving keys and binding names in operator logs.

The authoring write endpoints originally named by the plan were already deleted by the product
cutover, so the auth regression coverage now guards the surviving public routes: no cookie and a
garbage `bp_session` both leave `/api/v1/routes?limit=1` and `/api/v1/studio/routes?schema=2`
reachable. Verification passed with `bun --filter @bp/studio-api typecheck`,
`bun --filter @bp/studio-api test`, `bun --filter @bp/web test:worker`, and scoped Biome.

## [2026-07-01] engineering | Effect HttpApi Worker migration blocked

Marked Plan 009 blocked by its own gate. The required Worker-side ADR/spike PASS for
`@effect/platform` HttpApi does not exist; the live ADR 0019 is
`docs/decisions/0019-effect-runtime-for-pipeline.md` and accepts Effect for pipeline command
runtime/service boundaries only. Starting a Worker HttpApi migration now would bypass the recorded
bundle-footprint and workerd-compatibility decision point.

The original Plan 009 scope also predates the hard cutover: authoring, auth, brief-draft, and
Durable Object write surfaces named there are gone, while Plan 008 now provides live registry
enforcement and Plan 012 hardens public serving errors and artifact keys. Reviving Worker HttpApi
should start with a new spike/ADR scoped to the current public API surface.

## [2026-07-01] product | Generation-3 plan set written (plans 019-029)

Recorded the post-pivot planning generation in `plans/` after a full audit (six
parallel repo/mta-wiki/design surveys plus direct verification). Thesis: the
product is a portfolio-grade public route-evidence website; land the uncommitted
hard cutover (019), make mta-wiki the only document-evidence backend and serve
its artifact (020, currently zero consumers), expand the 12-route pilot corpus
(021), converge the route page on the canonical editorial design (022), serve
already-built hourly/DOW/reliability grains (023), delete the 68 kLOC Tier 2
docs command tree and stale doctrine (024), finish supporting pages (025),
migrate the Worker to Effect HttpApi behind a measured spike ADR (026,
supersedes 009 and closes 007), deepen pipeline Effect seams (027), file
cross-repo mta-wiki work orders (028), and align/adopt nyc-transit-kit (029,
supersedes 014). plans/README.md now leads with the generation-3 index and
corrected constraints (bundle budget re-based to 145 KB entry; effect-ts skill
path; live detector-readiness insights path).

## [2026-07-02] product | Plan 021 route corpus verified at 381 routes

Completed Plan 021 against the live/current serving state rather than restarting
the old 12-route artifact. The required drift check still prints `12` for
`data/artifacts/studio/v1/routes.json`, but the current D1 export and live
Studio API are already tier-2 sized: `route_catalog = 381`,
`route_batch_built_route = 381`, `route_batch_issue = 0`, and `route readiness`
reports `381/381` build-eligible routes.

Step 1 measurement: replayed `data/exports/d1/2026-03/schema.sql` plus
`seed.sql` into `/tmp/bp-serving-measure.sqlite` and used SQLite `dbstat` as
the D1 page-byte proxy. Route-linear D1 tables total 27,170 rows / 1,798,144
page bytes, about 71.31 rows and 4,720 bytes per route. Largest route tables:
`route_month_trend` 13,880 rows / 569,344 bytes,
`route_month_source_status` 3,810 / 364,544,
`route_intervention_comparison` 741 / 294,912,
`route_artifact` 1,054 / 180,224, and
`route_reliability_gap_window` 1,845 / 106,496. Local v2 route R2 artifacts:
401 route directories, 1,155 files, 344,089,235 bytes (858,078 bytes/route
directory); wiki evidence artifacts total 5,243,824 bytes.

| Target routes | D1 route rows | D1 page bytes | R2 objects | R2 bytes | Route index payload |
|---:|---:|---:|---:|---:|---:|
| 50 | 3,566 | 235,977 | 144 | 42,903,895 | 80,174 |
| 150 | 10,697 | 707,931 | 432 | 128,711,684 | 240,523 |
| 300 | 21,394 | 1,415,861 | 864 | 257,423,368 | 481,046 |
| 381 current | 27,170 | 1,798,144 | 1,097 projected | 326,927,677 projected | 610,928 live |

Live smoke sizes: `/api/v1/studio/routes` 610,928 bytes,
`/api/v1/studio/routes/m15-sbs` 17,202 bytes,
`/api/v1/studio/routes/m15-sbs/timeline` 310,402 bytes, sparse
`/api/v1/studio/routes/b102` 4,752 bytes, and sparse B102 timeline 321 bytes
with zero timeline events, interventions, metric claims, and citations. No D1
10 GB or route-detail response-size STOP condition is projected at 300 routes
or at the current 381-route release.

Command drift recorded while following the plan: the documented
`route build-plan --max-routes 25 --json` fails on the current CLI with
`Unknown option: --max-routes`; `route build-plan --limit 25 --json` is the
current equivalent and reports 0 selected, 381 already built, 0 blocked, and 0
backlog. The documented bare `bun run check:publish-completeness` now requires
`--month`; `bun run check:publish-completeness -- --month 2026-03` passed with
1 manifest, 1,627 D1 artifact refs, 1,977 keys, and 0 missing.

Homepage discovery now matches the expanded corpus: the home route index uses
the live route count instead of the stale hardcoded 327, renders the full
grouped route directory, adds a route/corridor/borough text filter, and keeps
stable ridership/label/slug ordering through `home-route-index` helper coverage.
Verification passed:
`bun test apps/web/test/shared/home-route-index.test.ts --timeout 5000`,
`bun --filter @bp/web typecheck`,
`bun --filter @bp/pipeline-v2 cli -- route readiness --json`,
`bun --filter @bp/pipeline-v2 cli -- route build-plan --limit 25 --json`,
`bun --filter @bp/pipeline-v2 cli -- verify d1 --year 2026 --month 3 --json`,
and `bun run check:publish-completeness -- --month 2026-03`.

## [2026-07-03] engineering | Plan 024 retires in-repo document pipeline and stale doctrine

Plan 024 deleted the retired `tools/pipeline-v2/src/commands/docs/**` tree and its tests/scripts,
after the current document-evidence dependency moved to mta-wiki artifacts. The analytics data
product registry now supersedes the old docs/Tier2 products with `mta_wiki_route_evidence_release`;
no `packages/analytics` serving infrastructure was deleted.

Dead D1 draft tables were prepared for retirement with
`packages/db/migrations/d1/0029_drop_studio_brief_draft_tables.sql`, dropping
`studio_brief_draft`, `studio_brief_draft_claim`, and `studio_brief_draft_block`. Production D1
application remains an operator step.

Stale doctrine cleanup spot-checked:

| File | Disposition |
| --- | --- |
| `knowledge/wiki/analysis/bus-reliability-detectors-spec.md` | Superseded by `@bp/analytics`, ADR 0018, and engineering calibration/architecture pages. |
| `knowledge/wiki/analysis/publishable_findings_review_2026_03.md` | Superseded by generation-3 public route-evidence scope and mta-wiki evidence artifacts. |
| `knowledge/wiki/analysis/product_question_inventory.md` | Superseded by `plans/README.md` generation-3 product scope and current public page plans. |

LOC census, same exclusions as Plan 024 (`node_modules`, `dist`, `data`, `*.gen.ts`):

| Scope | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Total visible repo LOC | 976,059 | 879,174 | -96,885 |
| `tools` | 150,236 | 60,318 | -89,918 |
| `knowledge` | 295,259 | 290,276 | -4,983 |
| `packages` | 481,086 | 479,073 | -2,013 |
| `docs` | 12,323 | 12,342 | +19 |

Verification passed:

- `bun --filter @bp/analytics typecheck`
- `bun --filter @bp/pipeline-v2 cli -- --help`
- `bun --filter @bp/pipeline-v2 typecheck`
- `bun --filter @bp/pipeline-v2 test --timeout 5000`
- `bun --filter @bp/db typecheck`
- `bun --filter @bp/db test`
- `bun --filter @bp/pipeline-v2 cli -- verify d1 --db /mnt/models/dev/bus-reliability-tracker/data/local/pipeline.sqlite --year 2026 --month 3 --export-root data/working/024-d1-verify --route-evidence-index-path /mnt/models/dev/bus-reliability-tracker/data/artifacts/studio/v2/wiki/index.json --json`

## [2026-07-03] engineering | Plan 027 centralizes pipeline HTTP retry and bounded fan-out

Plan 027 added one Effect-backed pipeline HTTP retry service in
`tools/pipeline-v2/src/effect/http.ts`, with schema-tagged `HttpRequestError`
and `RateLimitError`. The retry service now owns retries for HTTP file
downloads, SODA3 page fetches, and LLM provider calls; the old local
attempt/sleep loops in `lib/http-file-download.ts` and `lib/llm.ts` were
deleted. SODA3 calls keep `@nyc-transit-kit/compat` retry disabled with
`retryTimes: 0` so the pipeline service remains the single retry layer.

Bounded fan-out now uses the shared Effect helper in
`tools/pipeline-v2/src/effect/concurrency.ts`. The first bounded slices are
route segment speeds, route hourly ridership, route schedules, route trends,
map artifacts, and studio release generation. Command adoption is 69 of 98
command files (70.4%) with an Effect boundary or bounded-concurrency seam.

Deliberately left alone:

| Site | Reason |
| --- | --- |
| `tools/pipeline-v2/src/commands/studio/release.ts` paired D1 reads | Small fixed-width local reads; not a rate-limit or unbounded fan-out seam. |
| `tools/pipeline-v2/src/commands/map/artifacts.ts` paired local reads | Two-at-a-time local DB reads feeding one route payload; bounded per-route fan-out now wraps the larger loop. |
| `tools/pipeline-v2/src/commands/ingest/route-coverage.ts` paired reads | Two local source reads only. |
| `tools/pipeline-v2/src/commands/ingest/route-catalog.ts` paired reads/replacements | Fixed route/stop table operations; not an external API concurrency seam. |
| `tools/pipeline-v2/src/commands/ingest/route-schedules-bulk.ts` spool closing | Flushes already-open writers; no useful Effect boundary to add in this slice. |

Verification passed:

- `bun test tools/pipeline-v2/test/effect/http.test.ts --timeout 5000`
- `bun --filter @bp/pipeline-v2 typecheck`
- `bun --filter @bp/pipeline-v2 test --timeout 5000`
- per-package typechecks: `@bp/domain`, `@bp/sources`, `@bp/analytics`,
  `@bp/db`, `@bp/studio-api`, `@bp/web`, and `@bp/pipeline-v2`
- `bun run test:unit`
- `bun run test:web`
- `bun run test:worker`
- `bun run check:web-architecture`
- `bun --filter @bp/web build`
- `bun run check:style`

## [2026-07-04] engineering | Plan 037 deletes agent-research tooling

Deleted the agent-research tooling (`tools/agent-codemode`, `tools/agent-corpus-lib`,
`tools/sandbox`, and the pipeline codemode/sandbox harness) and retired ADRs 0010-0013/0016.
The Studio release AI-notes path (`@earendil-works/pi-ai` plus `openRouterModel`) is unaffected.

## [2026-07-05] engineering | Plan 039 deprecates verified raw JSON writes

Extended the raw snapshot coverage gate beyond top-level families: `socrata-partitioned/<sourceId>`
directories are now audited independently, and date-column proof is allowed only when the date column
is the leading column of a SQLite index. The refreshed coverage artifact
`data/artifacts/raw-deprecation/raw-coverage-2026-07-05.json` proves three reclaimable entries in
`data/artifacts/raw-deprecation/deletion-manifest-2026-07-05.json`: partitioned 2025 hourly
ridership, parking violations, and the small partitioned smoke copy.

Plan 039 removed the duplicate raw JSON write for `ingest parking-violations` and retired the
parking raw-snapshot reader from `build parking-violation-matches`; parking match keys refresh from
`local_parking_violation` instead. `scripts/reclaim-raw-json.sh` was generated as an operator-only
runbook with a canonical SQLite size tripwire and four reviewed reclaim lines: the three manifest
entries plus the orphaned `data/artifacts/docs` directory. The script was syntax-checked but not run.

## [2026-07-05] engineering | Plan 040 moves pipeline CLI off @liche/core

Replaced the `@bp/pipeline-v2` CLI runtime with `effect/unstable/cli` while preserving the existing
command descriptor shell through `tools/pipeline-v2/src/cli/compat.ts`. The new registry imports
command modules without the previous silent skip behavior and has an exact completeness test for the
current 99 live descriptors. `@liche/core` was removed from `tools/pipeline-v2/package.json` and
`bun.lock`; `grep -c liche bun.lock` now returns `0`.

Captured pre-migration help/JSON goldens under `tools/pipeline-v2/test/fixtures/cli-goldens/`.
`--json` remains a universal leaf-command flag and preserves the old command-result JSON shape; the
available-not-fetched backfill script only logs that output and parses downstream artifact files.
`runPipelineEffect` remains intentionally because the compatibility migration did not rewrite 99
handler bodies into native Effect command handlers.

## [2026-07-05] engineering | Plan 041 de-zods packages/db core reads

Removed `zod` from `@bp/db`: the package manifest and lockfile no longer declare it, generated
`src/d1/validation.ts` was deleted, and D1 trusted-read query modules now derive row aliases from
Drizzle select helpers instead of hand-written zod row schemas. SQLite boolean coercion moved to
`queries/shared.ts`; JSON-text readers now use small local narrowers that skip malformed public rows
instead of throwing through zod. D1 seed SQL generation keeps writer-boundary checks with local
validators for the existing seed validation cases.

Deleted the dead `studio-brief-agents` query/test surface and removed the matching `studioBrief*`
tables from the D1 schema. Added live D1 migration
`packages/db/migrations/d1/0030_drop_studio_brief_remnants.sql`; `bun run db:d1:migrate:local`
applied `0029` and `0030` locally.

Plan 041 is not fully closed: migration-tree consolidation hit the formal stop condition. The
current `migrations-drizzle/d1` snapshot is stale versus live `migrations/d1`; a trial
`db:d1:generate` attempted to create already-live `route_speed_history_coverage`,
`route_timeline_index`, and `source_month_coverage` tables while also dropping studio brief tables.
That trial migration was removed. Follow-up should rebuild or retire the stale D1 Drizzle lineage
before trying to enforce one migration tree.

Verification passed: `@bp/db` typecheck/test (50 pass), `@bp/studio-api` typecheck/test (52 pass),
`@bp/pipeline-v2` typecheck, `@bp/web` typecheck, `test:worker` (19 pass, 5.18s), `test:unit`
(672 pass), `check:web-architecture`, `db:local:generate`, `db:local:migrate`,
`db:d1:migrate:local`, and `git diff --check -- packages/db bun.lock`.

Added Plan 046 as the next DB-safety follow-up. Its scope is to reconcile or explicitly document the
D1 Drizzle snapshot lineage so future `db:d1:generate` runs no longer propose creating already-live
D1 tables from stale migration snapshots.

## [2026-07-05] engineering | Plan 046 reconciles D1 Drizzle snapshot lineage

Resolved the Plan 041 migration-generation blocker by adding
`packages/db/migrations-drizzle/d1/20260705171735_plan046_d1_snapshot/` as a snapshot-only catch-up.
Wrangler continues to apply live D1 SQL from `packages/db/migrations/d1`; `migrations-drizzle/d1`
is now documented as Drizzle Kit's D1 snapshot cache rather than an applied migration tree. The
catch-up snapshot records the already-live coverage/timeline/source tables and the removal of dead
`studio_brief_*` tables, while its `migration.sql` is deliberately no-op because live migrations
`0027` through `0030` already own the SQL.

`bun --filter @bp/db db:generate:d1` now reports no schema changes instead of proposing
already-live table creates. Verification passed:
`bun --filter @bp/db db:migrate:d1:local`, `bun --filter @bp/db db:generate:local`,
`bun --filter @bp/db db:migrate:local`, `bun --filter @bp/db test` (50 pass),
`bun run test:worker` (19 pass, 5.10s), `bun run check:web-architecture` (19 pass),
`bun run check:knowledge`, and `git diff --check`.

## [2026-07-05] engineering | Plan 042 drops browser-side zod response parsing

Removed production zod response parsing from the web client. `apps/web/src/studio/api-client.ts`
now returns typed JSON after HTTP success, `StudioApiContractError` is gone, and
`apps/web/src/studio/api-contract.ts` re-exports types only. The route-scorecard fixture no longer
imports domain schema values from production `src`; Worker tests still validate server responses
with domain schemas.

Removed `zod` from `apps/web/package.json` and refreshed `bun.lock`. Bundle measurement improved
from entry `124.2 KB` gzip / total JS `314.3 KB` gzip to entry `124.1 KB` gzip / total JS
`288.4 KB` gzip. Verification passed: `bun --filter @bp/web typecheck`,
`bun --filter @bp/web build`, `bun run test:web` (114 pass), `bun run test:worker` (19 pass,
4.97s), `bun run check:web-architecture` (19 pass), and Biome on the touched Plan 042 files.

## [2026-07-05] engineering | Plan 043 migrates packages/domain to Effect Schema

Pruned the dead `packages/domain/src/documents/{derived-surfaces,discovery,research-surfaces,structured-extraction}`
subtrees, their tests, export-map entries, and the dead `@bp/domain/schema-registry` re-export
subpath. The live domain schemas now import `packages/domain/src/schema-compat.ts`, an Effect
Schema-backed compatibility facade that preserves the domain's existing parse/safeParse/default
strip/strict/passthrough/codec/json-schema surface. `packages/domain` now depends on `effect` and
no longer declares or imports `zod`.

Re-pointed downstream domain parse sites to the migrated schema surface: studio-api public route-id
parsing and projection loading, analytics route-speed availability and intervention repair typing,
MTA/GTFS-RT source adapter `RouteIdCodec` normalization, and the pipeline JSON artifact reader.
The web app remains type-only with respect to domain schema values; no `effect` imports exist under
`apps/web/src`.

Verification passed after final formatting: `bun run check:types`, `bun run test:unit` (662 pass),
`bun run test:web` (114 pass), `bun run test:worker` (19 pass, 6.09s), `bun run
check:web-architecture`, `bun run check:knowledge`, and `git diff --check`. Package-level
verification also passed for domain, analytics, sources, studio-api, pipeline-v2, and web
typecheck. Full `check:style` still fails on the vendored `.agent-sources/effect` checkout; targeted
Biome on Plan 043 touched files exits 0 after safe fixes, with only info-level literal-key
suggestions in the pre-existing analytics repair module.

Plan 044 inherits the remaining zod leaves: sources adapters/probes/core schemas, pipeline CLI/local
aggregate/export helper schemas, analytics feature-history/data-product schemas, and studio-api
route-spec/read-handler local schemas.

## [2026-07-06] design | gen-6 UI cutover complete (plans 048-060)

Plan 060 swept the orphaned component layer left by earlier design passes:
deleted TimelineSection, InterventionTimeline, BeforeAfter, the overlay chart
cluster (Corridor/Hour/TrendOverlay + OverlayChart), Heatmap, Timeline, Rail,
ConfidenceBar, MapThumb, KPI, Cite, the unused hourTag/formatMapHour helpers,
and the unused routeSectionAnchorId export; dev demos were trimmed rather than
kept alive. SectionHeader stays live (DataNotesSection). The
`bun run check:design-doctrine` ratchet is the standing guard against
interpunct chains, kicker eyebrows, and banned phrases; its allowlist now holds
only live-file exceptions (CorridorMap, RouteGeoMap, RouteMapLibre.map
interpuncts; RouteMapSection kicker).

## [2026-07-10] design | 075 study-card comp approved (3 rounds); comp gate + chart rules ratcheted

The operator approved the History-tab study-card design via the new
comp-before-implementation gate: `plans/mockups/075-history-tab/
study-cards-comp.html` went through three same-day review rounds (real
B41/M104/M21 registry events + monthly speeds; CIs illustrative pending plan
074). Outcomes: chart-first cards on the shadcn chart-card anatomy in app
tokens; one consolidated metric per card; check/gate internals behind the
"Method & provenance" SourceNote only; terse copy ("vs controls", "No clear
change", no date lines where the chart carries dates). Plan 075 was rewritten
to carry the approved anatomy as its binding acceptance target plus a new
`BANNED_PHRASES` entry (`no detectable change` prose form); plans/README.md
gen-8/9 notes now bind the comp gate (080/081 comp rounds before
implementation) and the chart rules; durable rules recorded in
wiki/engineering/studio_design_pass_status.md.

## [2026-07-11] engineering | Plan 071 steering-doc truth sweep

Aligned the root README with ADR-0020's Effect Schema-only contract, removed the deleted
`/methods` page from the public SEO path list and sitemap while preserving the serving snapshot's
`methods.json` dependency for plan 063, and prepended a dated status block to the umbrella product
plan so deleted applied-research and authoring surfaces are read as history.

## [2026-07-11] engineering | Plan 062 deletes retired pipeline-v1 QA commands

Deleted roughly 2,550 lines of retired `audit pipeline-v1`, `check pipeline-v1`, and
`pipeline finalize` command code after re-verifying that no live script, publish flow, or command
imports it.
ADR-0017 retired that QA-gate doctrine; `scripts/publish-serving-release.sh` and the `studio release`
command family remain the live publish path. The CLI registry now exposes 96 descriptors and no
empty `pipeline` command group.

## [2026-07-11] engineering | Plan 061 deletes the dead detector subgraph

Deleted the unreachable detector, registry, calibration, corpus, and lattice subgraph from
`packages/analytics`: about 13,600 source lines and 4,400 coupled test lines. Preserved the live,
pure gold-set evaluator by moving it under `evaluation/` with focused coverage; all remaining
analytics consumers now use explicit live subpath exports.

## [2026-07-11] engineering | Plan 064 consolidates compatible ingest workflows

Classified all 22 live ingest runners by reading their bodies. The compatible full-replace
Socrata set was `ace-routes`, `bus-lanes`, and `dot-traffic-speeds`; the compatible monthly set
was `bus-wait-assessment`, `ace-violations`, `nypd-collisions`, `dot-traffic-volumes`, and
`311-service-requests`. These now use shared replace/monthly factories while preserving runner
names, signatures, result shapes, queries, and snapshot metadata. A command-definition helper
centralizes the Effect local-DB boundary; compatible bespoke descriptors adopt it without changing
their runners. Bounded promise concurrency now runs through the managed pipeline Effect runtime.

The remaining runners are intentionally bespoke: Census joins (`equity-context`), dynamic fiscal
or snapshot modes (`parking-violations`, `dot-street-permits`), CSV/cache formats (`noaa-weather`),
multi-source/catalog joins (`route-catalog`, `route-coverage`), multi-month or route-chunked jobs
(`route-hourly-ridership`, `route-segment-speeds`, `route-trends`,
`bus-customer-journey-metrics`), and GTFS/file/protobuf workflows (`gtfs-static`,
`route-schedules`, `route-schedules-bulk`, `gtfs-rt-snapshots`, `lion-centerline`). The plan's
600-line target assumed several of these were ordinary monthly Socrata replacements; live-body
classification disproved that premise. Safe consolidation removed 1,130 and added 666 lines under
`commands/ingest` (net -464), plus the shared helpers and tests. Verification: pipeline typecheck
and all 205 pipeline tests pass; four source-structure tests were updated to recognize the helper.

## [2026-07-11] engineering | Plan 063 decodes Studio inputs once and dispatches from registry

Studio snapshot composition now follows an explicit degrade policy: routes are required, while
methods, docs, route evidence, model status, and Snapshot 2.0 assembly produce legal empty or
omitted contributions with public caveats. The Worker no longer reparses its own `/routes` and
`/snapshot` responses. Route-index display defaults and source-month status decoding happen once
at the D1 edge, and invalid equity assignment geography fails descriptively instead of being cast.

Studio read dispatch now resolves the canonical registry matcher, including route parameters, and
a completeness test enforces the registry/handler bijection. Route-index and route-section read
models moved into focused modules, reducing `read-handlers.ts` from 2,966 baseline lines to 2,217.
Final verification passed: Studio API typecheck and 54 tests, DB typecheck and 52 tests, 22 Worker
tests, 155 web tests, 21 architecture tests, and style. Worker wall time improved from the 5.90s
baseline to 4.47s after the registry dispatch change.

## [2026-07-11] engineering | Plan 065 migrates sources to native Effect Schema

Added the small `@bp/domain/decode` policy surface with strict, strip, preserve, and Result-returning
native Effect decoders; nested parse failures retain their field paths. Migrated every source
adapter, Socrata contract, probe, GTFS-Realtime contract, and manifest member away from the
zod-shaped compatibility shim. Raw upstream rows decode permissively, normalized outputs decode
strictly, and the manifest union now applies one strict policy to every literal-tagged member. A
member-mismatch fixture verifies that errors identify the selected member's missing field.

The sources tree has zero `schema-compat` imports. Final verification passed: domain typecheck,
sources typecheck and 35 tests, pipeline-v2 typecheck, 542 repo unit tests, shim-free and normalized
decode-policy audits, `git diff --check`, and style (exit 0; pre-existing informational diagnostics
remain).

## [2026-07-11] engineering | Plan 066 migrates the remaining schema leaves to native Effect

Replaced the pipeline CLI compatibility-schema surface with native Effect Schema descriptors and
an AST-backed flag introspector, then migrated pipeline library boundaries, analytics contracts,
Studio API reads, and Worker contract tests off `schema-compat`. Strict, strip, and preserve decode
policies remain explicit at each boundary; CLI output schemas remain typing/documentation-only.
Native error formatting now reports real nested paths for MTA-wiki route anchors and intervention
records. Root and `ingest ace-routes` help output are byte-identical to their pre-migration captures.

The leaf gate is empty across pipeline, analytics, Studio API, and web. Final verification passed:
211 pipeline tests, 102 analytics tests, 54 Studio API tests, 22 Worker tests in 6.30 seconds, 155
web tests, 550 repo unit tests, web architecture, CLI help diffs, `git diff --check`, and style.

## [2026-07-11] engineering | Plan 077 restores validated MapLibre rendering

Replaced every MapLibre-facing OKLCH value with a parser-tested sRGB ramp, centralized the base
style and network scales, and added the installed MapLibre style-spec validator as an executable
gate. Both maps now use the documented NYC bounds; the embedded route map uses cooperative
gestures and zero-duration paint transitions under reduced motion.

The loader now removes failed scripts and resets rejected loads, while a shared lifecycle seam
distinguishes fatal pre-load failures from recoverable post-load warnings and removes maps
idempotently. Static fallbacks expose a working retry; degraded route overlays replace dead
checkboxes with an availability note. Chromium acceptance also found and fixed a covered mobile
retry button and a zero-height route map caused by the single-column grid.

Final verification passed: web typecheck, 9 focused tests, all 161 web tests, style, and a
105.6 KB gzip entry / 313.7 KB gzip total bundle. Chrome for Testing 149.0.7827.55 verified
`/map`, B48, and M15-SBS at desktop and 390px, including NYC clamping, page scroll over the
embedded map, reduced motion, and forced vendor-failure recovery.

## [2026-07-11] engineering | Plan 067 removes the domain schema compatibility facade

Migrated the domain registry, primitives, routes, maps, Studio, documents, and findings contracts
to native Effect Schema with real per-type brands, literal-tagged unions, and explicit boundary
decode policies. Removed `schema-compat.ts` and its package export, then added and deliberately
tripped an architecture gate that prevents the compatibility facade or imports from returning.
Pruning the migrated findings surface removed 1,166 unused migrated-format lines while preserving
the dependency closure used by production and tests.

Every served JSON Schema artifact is byte-identical to its pre-migration capture. Final
verification passed: repository typechecking, 553 unit tests, 155 web tests, 22 Worker tests,
architecture gates, `git diff --check`, and style. The production entry remains 105.5 KB gzip and
the full web bundle remains 312.5 KB gzip.

## [2026-07-11] engineering | Plan 078 establishes canonical map segment identity

Added exact route/month/source segment keys and ambiguity-rejecting aliases from current map and
detail records to stable geographic speed-spine segments. Map and Studio producers now publish
explicit current and stable IDs, enforce per-route uniqueness, retain unmatched status, and carry
spine readiness through history artifacts, local coverage, D1, the Studio API, and the web.
MapLibre no longer borrows detail data by array position; segment history joins only through the
stable spine ID and reports unavailable or partial readiness explicitly.

The bounded B41 proof rebuilt 36 months and passed with 16/16 exact map/detail joins, 16/16 stable
detail/history joins, zero ambiguous or duplicate IDs, zero unmapped raw keys, and zero positional
fallbacks. Final verification passed: all package typechecks, 567 unit tests, 164 web tests, 22
Worker tests, 22 architecture tests, focused identity/loader/coverage/API tests, `git diff --check`,
and style. The proof also removed two retired strict-release fields and fixed absolute temporary
output/spine-root resolution discovered by the executable checker.

## [2026-07-11] engineering | Plan 073 serves the reviewed intervention corpus

Published a strict, source-linked projection of all 310 reviewed intervention records through the
existing artifact endpoint and merged it into `/interventions` with exact registry-ID deduplication,
route and treatment badges, documented-history treatment, nullable loading, and source citations.
The immutable input is pinned at SHA-256
`593cb776ffdfb4c95526772757c54ac6bfb60ba2dbe1443f013445e251132d04`;
declared count, strict row validity, and unique record IDs are fail-closed, so no reviewed row may
be silently dropped. Reconciliation is documentation/source-coverage analysis only and never
supplies Plan 074 causal onset dates.

The corrected study-readiness gate found 29 of 62 implemented/in-progress records month-ready. The
live registry reconciliation found 11 matched corpus records (26 event IDs), 543 registry-only
events, three pre-window corpus-only records, and no corpus-only causal candidate. Final verification passed: 219
pipeline tests, 72 domain tests, 165 web tests, root typechecking, 22 architecture boundaries plus
five doctrine checks, style, a 105.7 KB gzip entry / 314.6 KB gzip total build, local R2 serving,
and a headless-Chromium `/interventions` render with corpus rows and citations.

## [2026-07-11] engineering | Temporal anchors reach the explicit study-event approval boundary

Added a manifest-pinned, hash-checked MTA Wiki operational-anchor import and merged only locally
revalidated Wiki rows with implemented events from the two trusted registry sources. The current
clean release narrows 633 Wiki rows to 619 assertions, 3 locally eligible assertions,
and 2 supported Wiki candidates. Preserving distinct local and SBS route identities yields
401 trusted registry candidates and 403 total candidates in
`candidate-set:49af8c8721457fa7532a7345`. Plan 073's documentation corpus is not
a causal-date input; this supersedes the earlier corpus-derived Plan 074 operator-list description.

The canary now also pins and validates the exact three-decision accepted-review snapshot in the
MTA Wiki manifest; the tracker verifies its hash, schema, evidence roles, and one-to-one reviewed
anchor bindings before importing any row.

The set remains `awaiting_approval` with zero approved events. The producer changes are committed at
`d28b64c8`; clean immutable release `v2-operational-anchors-1` was reproduced byte-for-byte from an
independent clean worktree with manifest SHA-256
`b69bd9458a92a817c329cfaa2741ef93dece4d2bbdb4695ea775b09622f5c56c` before import.
Operator receipts now have a tracked, append-only handoff location under
`data/study-event-approvals/`, with an intentionally non-validating example so no template can be
mistaken for approval. Plan 074 remains TODO; the evidence funnel, unresolved-date queue, hashes,
and current approval requirement are recorded in `data/artifacts/studio/v2/studies/temporal-anchor-audit.md`.

## [2026-07-12] engineering | Plan 074 reaches the real-data anchor review stop

Applied the complete candidate-set-bound receipt: 5 exact-route MTA ACE onsets were approved and
398 candidates were conservatively rejected. The strict merge preserved
`candidate-set:49af8c8721457fa7532a7345` and admitted only the five approved events.

The March 2026 segment-study run produced five studies and five route rollups: three gated
estimates, two descriptive comparisons, four honest `no_detectable_change` results, no ineligible
studies, and no lane fallback. No estimate exceeded 0.36 mph in absolute value, so the implausible
effect STOP condition did not fire. All artifacts decode against the native Effect schemas and an
identical rerun reproduced every study, index, and rollup byte-for-byte. Verification passed 287
pipeline tests, root typechecking, and repository style.

`data/artifacts/studio/v2/studies/anchors-report.md` is now the binding operator-review handoff.
Plan 074 remains IN PROGRESS and Plan 075 has not started: the operator must sanity-check published
anchors and explicitly resolve whether the five approved studies satisfy the intended real-data
scope, because the original done criterion expected at least ten and rejected events cannot be
silently readmitted.

## [2026-07-14] research | MTA Wiki v1-rc19 study-candidate audit

Assessed the pinned MTA Wiki v1-rc19 release against the Tracker operational-occurrence and
study-candidate pipeline. The manifest and all 20 declared files were independently rehashed;
the verified manifest SHA-256 is
c5d4563d37815d330b37898774a027fb07563335163fcfccbaeebfc3da81720f. The release produced 135
occurrences, 134 study-eligible occurrences, 172 route projections, and 1 correctly rejected
occurrence. The deterministic before/after audit compares the historical 403-row candidate set
with the corrected 489-row set: 87 identity additions, 1 removal, 12 exact cross-source
deduplications, zero conflict groups, 84 rows in the Queens redesign treatment group, and zero
approved rows.

Plan 083 is rebaselined: its historical 39-ACE statement and 5-of-403 coverage premise are not
current rc19 facts. The new set has 75 spine-blocked additions, while Plan 074's spine,
evidence, confounder, approval, and publication gates remain unchanged. Review exposed and fixed a
narrow consumer merge defect that prevented exact registry/Wiki event deduplication; the fix
retains both provenances and fails closed on ambiguous occurrence matches. The final non-authorizing
Codex/subagent reconciliation records 16 approval recommendations and 473 rejection
recommendations, but creates no receipt and authorizes no study or publication. rc19 uses the
versioned occurrence importer because the legacy anchor importer is v2-only. See
docs/research/mta-wiki-rc19-plan-rebaseline.md and the generated audit artifacts.

## [2026-07-17] engineering | rc22 becomes a strict, quarantined occurrence-v2 consumer

Rebaselined Tracker from merged PR #60 at
`5e656c2450792a23e36b4afc9ca29bdda97a1b5e` and implemented explicit
manifest-v3/occurrence-v1 and manifest-v4/occurrence-v2 profiles. The v4 path
verifies every one of the relationship-integrity bundle's 225 artifacts,
reconstructs its descriptor, verifies the seven-gate enforcement proof and
canonical commitments, enforces the frozen v1 policy and all final matrix
rules/tuples, reconciles transition roles/fingerprints and current/archived
gate sources, and validates graph artifact hashes and row counts. It preserves
phase/physical lineage and rejects unknown
versions, excess fields, unsafe/symlinked paths, duplicate identities, and
byte/hash/summary drift.

The pinned rc22 replay is byte-deterministic: import SHA-256
`fa7f6ca25b4ba2ec435e3ca4397a579ff89f7b97b20c0adb956263129bf857f9`;
candidate SHA-256
`25d1fa96f8796f053c538631fbce19aa3b77fb1435e5b357c50eec2f94bf6129`;
lineage-audit SHA-256
`042bd160b6c57f490547f9808b2683a0a7d2a26ccd8f494d74e61c84d873dfa7`.
All 489 candidate identities are unchanged, but 100 Wiki-bound provenance
bindings require the new `candidate-set-v3:9761a5648df08fbdf6c38bb4`.

The final audit strictly decodes and reconciles the 321-row acquisition
campaign, binds it to rc19 and Tracker candidate identities, and distinguishes
the producer funnel (134/135 eligible occurrences; 172/173 route projections)
from Tracker admission (91 occurrences/100 projections accepted; 44/73
rejected). All 321 queue rows remain registry-only candidates with zero Wiki
bindings and zero approvals.

Promotion remains on hold. The producer declares review-v1 while emitting one
v2-only Flatbush `physical_scope` role. Tracker's exact fingerprint exception
is inspection-only and forces a contract-blocked merge with no approval or
approved events. The 173-row canonical audit resolves current route identity,
marks every historical version missing, and retains the only two exact-scope
route projections as unresolved against Tracker segments. No study, serving
artifact, D1/R2 data, publication, `LATEST`, deployment, or producer repository
was changed. See `docs/research/mta-wiki-rc22-migration-report.md`.

## [2026-07-18] engineering | rc23 closes the review contract and canonical audit boundary

MTA Wiki published immutable `v1-rc23` after quarantining rc22. Across the 246
manifest-addressed artifacts, 245 are byte-identical and only
`operational_occurrence_review_decisions.json` changed. The corrected review-v1
snapshot removes one unsupported Flatbush `physical_scope` top-level binding;
the occurrence-v2 file is unchanged and retains the binding in its dedicated
physical ledger.

Tracker now projects occurrence-v2 into review-v1 only after exact dedicated-
ledger parity and strict canonical proof. The consumer binds both phase and
physical audit manifests to the imported occurrence bytes/SHA/row count,
reconciles physical treatment/relation/corridor roots and bundled
completeness/policy/ledger/contract inputs, and requires hard-mode,
complete-review, and exact-evidence semantics, zero phase/physical-audit
findings, and zero enforceable relationship violations while retaining reviewed
and informational graph findings. Nested,
rogue, stale, and unknown-version evidence still fails closed; rc22 remains an
exact fingerprinted, non-promotable inspection profile.

Two final rc23 imports are byte-identical at SHA-256
`27049c650366c91453f39919d574456eb28d5fab9cb8dce43afc5ceccdf99232`.
Two candidate merges are byte-identical at
`60422e951226b97abe40ae3705469084c5134488e666084284771e1b60ab22b5`,
producing `candidate-set-v3:aba25fe4209247be31d43b66`: 489 candidates,
`awaiting_approval`, null receipt, and zero approved events. Identities do not
change; exactly 100 Wiki-bound provenance rows rebind and 389 registry-only
rows remain unchanged. All 321 excluded bus-lane candidates remain unchanged,
registry-only, unapproved, and unresolved.

The pinned release is ready for a separate operator release-pointer review,
not automatically promoted. After this record was drafted, merging Tracker PR
#61 triggered main-push workflow run `29625533041`; deploy job
`88029151351` successfully built and deployed the Worker. No candidate
approval, study run, study publication, study-data D1/R2 write, or `LATEST`
mutation occurred.

Plan 074 remains IN PROGRESS. Plan 075's UI code exists from PR #59, but the
plan remains IN PROGRESS because its recorded Plan 074 operator-anchor
prerequisite never closed; no rc23 output was activated. Plan 083 remains
TODO. Their control, physical-scope, spine, approval, and publication gates
remain independent. See `docs/research/mta-wiki-rc23-migration-report.md`.

## [2026-07-12] architecture | monthly-baseline doctrine retired by ADR-0022

The monthly-baseline doctrine is retired end to end as governing architecture. ADR-0022 defines a
release as a publication event with `releaseId`, `publishedAt`, and per-dataset coverage windows;
served and analyzed data uses the full available source history, multi-year wherever supported.
Months remain valid only as source grain, time-series coordinates, and ingest/storage partitions.

Plan 084 aligns the doctrine and steering docs while keeping descriptions of still-live mechanics
truthful and dated. Plans 085-087 execute the serving-contract and release-identity cutovers and add
the freshness ledger; the binding generation-9 amendments make plans 079-081 use the same
vocabulary. Upstream-latest, ingested-latest, and published-coverage-end state replaces month
anchors as the project's freshness model.

## [2026-07-19] architecture | month-identity debt frozen behind a shrink-only gate

Plan 088 adds `check:month-doctrine` to the architecture suite. The scanner
distinguishes forbidden month-keyed product identity from legal month grain,
coordinates, coverage windows, ingest partitions, and build selectors. It
covers retired contract tokens, scoped release and analysis-period identities,
serialized release cadence, identity phrases, public month selectors, and
pinned identity-month literals with a comment-aware string lexer.

The initial ratchet records exact file/rule counts for every live violation and
assigns all of them to Plans 079 and 085-087. Unlisted matches, count growth,
stale entries, duplicate pairs, malformed metadata, and premature permanent
exceptions fail the gate. Synthetic tests cover selector variants, scoped
identity rules, legal-grain cases, URI/date exclusions, and ratchet audit
failure modes. No production contract changes are part of this checkpoint.

## [2026-07-19] engineering | Plan 080 network decision explorer complete

Completed the `/map` decision-explorer contract at implementation commit
`926ce17c`. The map now starts neutral; exposes a complete searchable ranked
route list; keeps lens, period, comparison, exact served borough, route slug,
stable segment, and bus-lane visibility in a strict canonical URL; and restores
that state on reload. Route, keyboard, list, and pin focus use constant-size
MapLibre feature-state updates. Selected-route detail and exact matched-spine
segments load lazily against release identity plus the declared artifact key
and SHA, so same-release object rollover, ambiguity, missing evidence, and
integrity failure remain distinct and fail closed.

Desktop and mobile inspectors provide equivalent metrics, ranked segment
evidence, one explicit route-detail action, clear/back behavior, and focus
restoration. Data Notes and copied citations expose publication identity,
coverage, route universe, source posture, exact evidence hashes, mutable-alias
status, and unavailable/join reasons. The change lens remains deferred because
the serving contract does not publish its real endpoint months.

Verification passed: web TypeScript; 92 focused map/API/runtime tests; all 260
web tests; all 22 Worker tests; design-doctrine and production-boundary
harnesses; repository style (existing informational diagnostics only); the web
build at 135.4 KB gzip entry and 388.9 KB gzip total JavaScript; and the
five-route web-performance matrix. Chrome for Testing 149.0.7827.55 exercised
the production MapLibre canvas through an isolated fixture at 1440x900,
1024x768, and 390x844 with keyboard, mouse, uncanceled touch/pointer delivery,
responsive Sheet transfer, URL reload, exact M15+ / `m15-n-14-23` evidence,
forced-unavailable B1, accessibility-tree inspection, bus lanes, and reduced
motion. Headless Chromium omitted its compatibility click after otherwise
uncanceled touch delivery, so the QA driver activated the already hit-tested
DOM target to continue the mobile matrix. No serving release, D1/R2 data,
deployment, or production source snapshot was mutated.

## [2026-07-19] engineering | Plan 081 route-segment evidence explorer complete

Completed the linked route-segment explorer through implementation commit
`aee2b3df`. The Segments tab now owns one canonical URL/search model for
direction, durable spine pin, month, daypart, and exact DOT-lane visibility;
one stable-spine history model supplies the map, ranked list, and fixed-slot
readout. Current geometry and verified route facts join only through the
declared release artifact key, hash, exact source route, and coverage identity.
Missing, mismatched, pattern-review, current-only, no-geometry, and WebGL
failure states remain explicit and usable rather than fabricating a spatial or
historical claim.

The coordinated MapLibre/list/readout surface uses exact Studio IDs for
feature-state hover and pin presentation without replacing geometry. Pointer
selection disambiguates overlapping route lines by the active direction;
keyboard rows, touch, Back/Forward, reload, 36-month history, historical nulls,
and current delay-exposure labels share the same durable state. Published NYC
DOT lanes load only after opt-in. The explorer contains no route-level ACE/TSP
prose, and the Riders/overview/network entry points deep-link to the same
segment contract.

Real-browser QA found and fixed three concrete interaction/layout defects: a
shared map `min-height: 100%` rule collapsed the route canvas hit region, the
top rendered opposite-direction line could win an overlapping hit, and the
mobile SectionCard controls could squeeze the explorer title to zero width. It
also corrected the approved 36-month prompt and removed route-level treatment
provenance from the fixed readout. Chrome for Testing 149.0.7827.55 then passed
the isolated production-runtime matrix at 1440x900, 1024x768, and 390x844:
B41 exact north/south pins plus stable history/gaps/no-data; M15 SBS exact
identity and lazy DOT lanes; BX15 `needs_pattern_review`; forced no-geometry
B42; keyboard, mouse, trusted touch, cooperative page scroll, reduced motion,
200% zoom without horizontal overflow, and the WebGL-disabled SVG fallback.
Screenshots and the receipt remained temporary under `/tmp`.

Verification passed: 44 focused explorer/runtime/card tests; all 283 web tests;
all 22 Worker tests; 22 production-boundary and 5 design-doctrine tests; root
TypeScript; repository style with only pre-existing informational diagnostics;
the web build at 137.6 KB gzip entry and 394.5 KB gzip total JavaScript; and the
five-route web-performance matrix. No serving release, D1/R2 data, deployment,
or production source snapshot was mutated.

## [2026-07-20] engineering | Plan 086 publication identity cutover complete

Pipeline releases now use one canonical `releaseId` / `publishedAt` identity
with dataset-specific coverage windows across the D1 export summary, Studio
release payload, map manifest, and catalog registration. The selected month is
explicit partition grain; pinned March defaults and the remaining release-month
identity vocabulary are gone. A one-millisecond timestamp skew fails the
coordinated map-release path.

The immutable detector-readiness readers accept equal or older snapshots,
preserve their source month, surface an older-data caveat, and reject future
snapshots. The legacy route-timeline reader retains exact-partition semantics.
The month-doctrine ratchet has no Plan 086 retirement entries: only the audited
seven- and three-token frozen-reader exceptions remain alongside Plan 087's
single retiring prose entry. Operations documentation now describes publishing
a release without a Worker redeploy; no `data/**`, deployment, or release
pointer was mutated.

Focused verification passed: 104 domain, 119 analytics, 402 pipeline, and 76
Studio API tests; all four package typechecks; 22 architecture/frozen-reader
tests; CLI help smoke checks; the two fixture-backed publish-completeness cases;
knowledge validation; and all exact Plan 086 zero-hit grep gates.
The comprehensive `check:prepush` gate then passed, including all 284 web and
22 Worker tests.

## [2026-07-20] engineering | Plan 087 freshness ledger complete

Added the offline `audit freshness` operator report for eight serving-source families. The ledger
compares honest upstream probes, local SQLite coverage, and the newest valid D1/map publication by
`publishedAt`; it writes one schema-validated artifact and displays rows worst-first. Shared
`current | recent | stale | unknown` semantics classify the larger ingestion/publication lag, while
`--strict` fails only verified stale serving-critical rows. Unsupported snapshot probes remain
explicitly unknown, and legacy summaries never regain publication identity through directory-name
inference.

The source-refresh copy no longer uses monthly-release language, and the exact Plan 087 retirement
entry was removed from the shrink-only month-doctrine allowlist. The new runbook defines cadence,
row semantics, caveats, and the current local evidence gap: the available legacy 2026-05 D1 summary
lacks post-cutover publication fields and therefore cannot prove current published coverage. No
source data, publication pointer, D1/R2 state, deployment, or production endpoint was mutated.

Verification passed: 4 focused freshness/registry tests, all 404 pipeline-v2 tests, the
pipeline-v2 typecheck, knowledge validation, and the month-doctrine gate. A single comprehensive
repository pre-push pass also passed, including all 284 web and 22 Worker tests.

## [2026-07-20] engineering | Plan 091 exact route intervention inventory complete

Promoted the existing route-treatment materializer into a strict, exact-route
Studio inventory. The public contract preserves source-backed treatments,
distinct occurrences, derived current state, lightweight project references,
source gaps, exact route identity, and stable source lineage in separate lanes.
The CLI fails closed on unreviewed non-Wiki vocabulary, verifies the immutable
MTA Wiki release and companion artifacts, accepts producer-reviewed unresolved
rc25 semantics only as partial source gaps, and writes each artifact atomically
without replacing sibling route artifacts.

The local real-data preflight used Studio release
`pub_20260718T180527000Z`, MTA Wiki `v1-rc25`, and manifest SHA-256
`77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f`.
Vocabulary reconciliation was exact over 188 reviewed non-Wiki literals and
all 2,938 Wiki treatment records. The export produced 375 exact-route bundles,
2,827 facet rows across 338 routes, 2,244 route-projected treatments (1,232
stable treatment IDs), and 583 projected occurrences. Source-treatment
reconciliation closed exactly at 4,590 = 1,980 mapped + 327 explicitly
`other_documented` + 2,283 producer-unresolved. All 375 bundles honestly report
partial coverage while rc25 semantics, route evidence, occurrence projection,
and 172 local-registry source-gap sentinels remain incomplete. Exact Q27, B57,
and B44+ unresolved scopes stayed on their authorized routes and did not fan
out through project membership.

Real canonical sizes required the approved budget amendment: the route index
is 284,236 bytes under a 320 KiB ceiling, the facet index is 1,593,406 bytes
under a 2 MiB ceiling, and the largest route bundle is B44 at 51,504 bytes
under 128 KiB. The route bundles total 4,083,418 bytes. SHA-256 receipts are
`54a2bb6c875ee7da1ed0f706aa518531a76f78f6f032c428dcdd5264b6fb2334`
for the route index,
`7dd60674caa5c59c40f22303b33441126088049b5c7bd9c6d6755d5e246fbe81`
for the facet index, and
`d6bd66665de268fa42ed891b37e39201819ca63fa2bc6df6425e777fa9e4be07`
for reconciliation. Two isolated exports were byte-identical.

Verification passed the 45-test exact-route dependency matrix, 112 domain
tests, 137 analytics tests, all focused materializer/CLI tests, knowledge
validation, and the comprehensive pre-push pass: root TypeScript, repository
style, 22 production-boundary tests, 5 design-doctrine tests, 10 month-doctrine
tests, 876 unit tests, 284 web tests, and 22 Worker tests. The Worker harness
required its normal localhost bind outside the sandbox. No production release,
D1/R2 object, source snapshot, deployment, or mutable release pointer was
changed.

## [2026-07-20] engineering | Plan 090 typed intervention observations complete

Added a closed, value-blind intervention relevance registry and strict
per-route observation bundles without merging event anchors, descriptive
observations, or causal studies. Version 1 admits only trusted, implemented
ACE occurrences from the exact Plan 091 inventory, binds route speed and
monthly riders before reading values, preserves null months and provenance,
and emits explicit unsupported/rejected outcomes for every other event.

The real-data export used the amended Plan 091 inventory and local trend
database. It produced 323 route bundles with 401 admitted event anchors and
168 rejected untrusted rows. Of the admitted events, 78 use the supported ACE
spec and 323 remain explicitly unsupported. Series status reconciled to 71
available, 73 partial, and 12 missing bindings over coverage from 2023-04
through 2026-05. The export reported no separate Plan 090 byte-budget failure.

Verification passed the 45-test exact-route dependency matrix, 142 analytics
tests, 125 domain tests, 432 pipeline tests, command discovery/help, strict
typecheck, repository style, architecture/doctrine checks, knowledge
validation, and the comprehensive 910-test unit suite. No production release,
D1/R2 object, source snapshot, deployment, or mutable release pointer was
changed.

## [2026-07-20] engineering | Plan 092 typed intervention recognition complete

Route Overview and History now consume the exact, nullable Plan 091 inventory
instead of classifying route prose. One exhaustive presentation registry owns
canonical treatment labels, lifecycle ordering, accessible compact codes, and
the nullable operational annotation stem needed by Plan 082. Overview keeps a
bounded keyboard-operable summary; History renders the complete typed
inventory, distinct occurrences, related projects, studies, source gaps, and
honest unavailable/partial/checked-empty states without downloading the global
corpus.

The citywide interventions ledger now consumes the compact facet index and has
bounded URL-backed status, borough, family, exact-route, and text filters.
Unmatched rows remain visible without title parsing. Ledger and History links
carry exact route slugs plus stable record/study targets, preserve B44 and B44+
as separate identities, apply study-over-record precedence, restore copied and
Back/Forward URLs, focus the resolved target, and fall back safely when a
target is absent. Filter result announcements now use correct singular/plural
grammar.

The integrated comprehensive `bun run check` passed, including all 302 web
tests and 22 Worker tests. The final browser-found announcement delta passed 22
focused model/ledger/badge tests, a two-file Biome check, and a production web
build at 138.2 KB gzip for the entry chunk and 399.3 KB gzip total JavaScript.
The explicit Chromium checklist passed at 1440×900 and 390×844: keyboard
overflow open/Escape close returned visible focus; keyboard-activated record
links, study precedence, Back/Forward, and copied URLs focused stable targets;
default navigation used smooth scrolling while reduced motion used `auto`; all
five ledger filters composed without horizontal overflow; and the polite live
region emitted only count changes, ending with “1 intervention record matches
the current filters.”

Browser QA used checked, fixture-only migrations of the available real v1
route projections together with current Plan 091 inventory/facet artifacts,
the reviewed corpus, and the BX28 study artifact because the local v1 route
projection predates the strict publication identity fields. Production schema
validation was not weakened. No release, D1/R2 object, source snapshot,
deployment, or mutable release pointer was changed.

## [2026-07-20] engineering | Plan 093 value-blind intervention relevance expansion complete

Expanded the intervention relevance registry from the ACE-only compatibility
projection into an exhaustive 35-kind matrix: 3 supported kinds, 22 explicitly
blocked kinds with concrete unlock contracts, and 10 kinds marked not relevant
to route-operation observations. ACE, bus-lane, and busway now have distinct
stable specs and bindings over the registered route-month speed and ridership
product. Selection remains fixed before values are read, preserves the
implementation-month ±12 window and null gaps, and never emits deltas, effects,
directions, or causal copy.

Added a separate pure descriptive observation-anchor gate over exact Plan 091
occurrence/treatment pairs. It requires operational lifecycle, day/month date
precision, reviewed usable lineage, admitted scope, and exact route identity;
deduplicates only the exact route/occurrence/treatment key; and reports every
tagged rejection. The existing study-event production gate was not changed.
ACE continues through its legacy trusted-registry compatibility check, while
reviewed bus-lane/busway observations do not inherit that causal-study
allowlist.

The isolated real-data export used Studio release
`pub_20260718T180527000Z`, all 375 strict Plan 091 route inventories, and the
local route-month trend table. It produced 456 events in 323 route bundles:
78 ACE, 375 bus-lane, and 3 busway. Admission reconciled to 456 admitted, 127
rejected (126 unsupported treatment kinds and one untrusted ACE registry
source), and zero exact deduplications. Event resolution was 54 available,
208 partial, and 194 missing; the 912 emitted series were 115 available, 405
partial, and 392 missing over observed coverage from 2023-04 through 2026-05.
The run wrote only to an isolated `/tmp` artifact copy and did not mutate the
checked release or publication state.

Route Overview now recognizes the three stable speed bindings, resolves each
marker through exact occurrence and treatment IDs, and chooses the focal event
by the fixed v1 priority, newest implementation month, and stable ID without
inspecting values. It adds the reviewed “Bus lane starts” and “Busway starts”
annotation stems. Corridor/segment observations are labeled “Route average
speed (context)” and display the scope limitation beside the chart; unsupported,
unavailable, project-only, dangling, and all-null cases retain the ordinary
month-preserving zero-marker fallback.

Verification passed the focused 58-test domain/pipeline compatibility matrix,
the focused 30-test web matrix, analytics/domain/pipeline/web typechecks,
knowledge validation, and the comprehensive `bun run check`, including 334
web tests and 22 Worker tests. The production web build passed at 138.3 KB gzip
for the entry chunk and within the unchanged 400 KB total-JavaScript budget.
No production release, D1/R2 object, source snapshot, deployment, study
approval, or mutable release pointer was changed.

## [2026-07-20] engineering | Plan 074 rc25 engine boundary repairs complete

Closed the two pre-run defects found during the rc22/rc23 audit. Study control
screening now excludes all real candidates within the inclusive ±9-month
window, including rejected and unreviewed rows. Treatment scope now admits
all-route spines only with affirmative ACE registry provenance and requires a
candidate-set- and hash-bound exact occurrence→geometry→current-segment→spine
mapping for bounded treatments. The automatic lane-to-all-route fallback is
retired.

MTA Wiki v1-rc25 produced byte-identical strict imports and byte-identical
database-backed candidate builds. The new authorizable set is
`candidate-set-v3:575ee30a44f2e141e97f6a77`, candidate artifact SHA-256
`b66c0cd70afdf99a0fa2779d9b0574ba328bcc5f49c7d0177eaa029b0bb2c195`,
with 486 candidates, zero approvals, 382 source rejections, zero conflicts,
and 12 exact deduplications. A complete non-authorizing worksheet is tracked.

The sole bounded rc25 occurrence, Flatbush phase 1, now has a pinned exact
binding for B41 and B67. The production overlap helper reproduced exactly two
current source-to-spine pairs per route and no extras. B67 is
`series_ready_with_gaps`; B41 remains `needs_pattern_review`. No receipt,
estimate, public artifact, release pointer, deployment, or publication was
created. Plan 074 remains in progress at the complete 486-decision operator
receipt gate, followed by a real run and fresh anchor review.

## [2026-07-21] engineering | Plan 074 rc25 delegated receipt and deterministic run complete

The owner explicitly delegated the complete rc25 candidate decision set to
three independent, non-overlapping Codex shards: 161 non-bus-lane rows and two
bus-lane shards of 162 and 163 rows. A deterministic preparation step pinned
the candidate, scope-binding, current speed-spine, historical-context, and
shard hashes. A fail-closed reconciler proved exact 486/486 unique coverage,
then wrote a v3 receipt with six ACE approvals and 480 rejections. The strict
production merge accepted the exact receipt and reproduced the approved event
set byte-for-byte.

Every approved event-route pair produced one real study: BX28, M79+, B82+,
BX38, M96, and BX9. The complete run wrote six route rollups, two gated
estimates, four descriptive comparisons, four `no_detectable_change` results,
zero ineligible studies, and zero lane or scope fallbacks. A same-root repeat
reproduced all 13 JSON outputs byte-for-byte, and all six studies, the index,
and six rollups passed the native Effect schemas. No estimate exceeded 0.34
mph in absolute value, so the implausibility STOP did not fire.

Both Flatbush projections remained rejected. B41 failed the current spine gate
and retained installation/opening ambiguity. B67 had exact physical scope and
a ready-with-gaps spine, but September was only installation commencement and
the set retained a competing B67 lane onset dated 2025-10-02. M96 became the
sixth admitted ACE event because its nearby lane row lacks exact bounded-scope
admission; its resulting study is descriptive because the placebo and
congestion-pricing-overlap gates fail.

Verification passed root and pipeline typechecks, architecture checks, 937
unit tests, 334 web tests, 22 Worker tests (outside the localhost-restricted
sandbox), knowledge validation, strict JSON parsing, focused Biome checks on
both new scripts, and deterministic artifact checks. The repository-wide
style command remains red on unrelated existing `analytics-primer.html` and
`apps/web/src/routes/routes/index.tsx` diagnostics; those files were preserved
unchanged. No public artifact, release pointer, D1/R2 object, deployment, or
publication state changed. Plan 074 is stopped only for the fresh anchor
review recorded in `docs/research/reviews/rc25/anchors-report.md`; Plan 075
remains inactive.

## [2026-07-21] engineering | Plan 074 resumes on MTA Wiki rc26 and adds Flatbush B67

Imported manifest-pinned MTA Wiki `v1-rc26` through the strict occurrence-v2
path. Tracker now accepts multiple evidence bindings for one reviewed phase
relation without treating repeated relation IDs as duplicate relations, and
reconciles the producer phase-audit count against unique phase-event plus
event-event candidate-relation records. Regression coverage keeps both paths
fail closed. Repeated imports and database-backed candidate builds were
byte-identical.

The rc26 cut preserves Flatbush occurrence
`occurrence:8c987704152b459014217d44` and proves that September installation
preceded the 2025-10-02 operational opening. Exact deduplication removes only
the two separate B41/B67 registry rows, yielding
`candidate-set-v3:80050ed598f3b2ab0d0a1e99` with 484 candidates, 382 source
rejections, zero conflicts, and 14 exact deduplications. A fail-closed
reconciler proved unchanged admission semantics for 482 surviving decisions,
then freshly rejected B41 for `needs_pattern_review` and approved B67 for
estimator admission. The complete receipt has seven approvals and 477
rejections; strict merge accepted it.

The complete rc26 run produced seven studies and seven route rollups: two
gated estimates, five descriptive comparisons, four
`no_detectable_change` results, zero ineligible studies, and zero scope
fallbacks. B67 uses its exact two-segment bounded scope and reports +0.139 mph
all-day with a [+0.121, +0.156] bootstrap interval, but remains descriptive
because placebo and minimum-sample gates fail. A same-root repeat reproduced
all 15 JSON outputs byte-for-byte. A timeboxed official-source check found no
comparable published B67 post-opening result: NYC DOT confirms the bounded
phase was installed but publishes only broader baselines, hypothetical gains,
or results from other corridors. No publication or deployment state changed;
Plan 074 remains stopped only for the fresh rc26 anchor review in
`docs/research/reviews/rc26/anchors-report.md`, and Plan 075 remains inactive.
Plan 076 is also blocked by its explicit evidence STOP: rc26 has only two
gated estimates, both automated bus-lane enforcement, so no treatment family
reaches the required minimum of three. Revisit it only after another
qualifying gated study lands.

## [2026-07-21] direction | Plan 074 rc26 anchors approved; Plan 075 activated

The operator closed the fresh rc26 anchor gate with the exact token:

> approve Plan 074 rc26 anchors; accept the six historical published-claim TBD cells and the completed B67 negative finding; keep B67 descriptive; approve Plan 075 activation and authorize publication of the rc26 study artifacts.

The six historical published-claim cells remain explicit, reviewed `TBD`
values; no non-comparable aggregate claim is substituted. The completed B67
official-evidence check remains a negative finding, and B67 remains a
descriptive two-segment association rather than a gated, route-wide, or causal
claim. Plan 074 is DONE.

Plan 075 is activated and authorized to publish the exact rc26 cut bound to
`candidate-set-v3:80050ed598f3b2ab0d0a1e99`. Authorization is not completion:
serving artifact regeneration, remote publication, and public verification
remain, and no remote write, deployment, or live publication is claimed by
this decision record. Plan 075 remains IN PROGRESS until those steps are
evidenced. Plan 076 remains blocked on its separate three-gated-study floor.

## [2026-07-21] release | Plan 075 rc26 study artifacts published and verified

After explicit destination-specific authorization, pushed the activation
branch, merged GitHub PR #88 at `d61a3af81745e79460b76d33e2e36d3748913f5a`,
and promoted the exact approved rc26 cut to Cloudflare R2 bucket
`bus-priority-artifacts`. The fail-safe publication order uploaded nine
non-pointer payloads before eight activation objects. Both executions passed
with zero failures.

Cache-busted production reads returned HTTP 200 and the staged SHA-256 digest
for all 17 objects. The public index now contains exactly seven studies: B67,
B82+, BX28, BX38, BX9, M79+, and M96. B67 resolves to the approved event,
remains `descriptive`, reports the +0.13899495728934547 mph all-day
association, and still fails the minimum-sample and placebo-in-time gates.
The B67 History deep link and `/interventions` both returned HTTP 200. This
was a scoped R2 artifact promotion, so the coordinated release intentionally
remains `pub_20260605T183601689Z` with 2023-04 through 2026-03 coverage; no D1
seed or Worker deployment occurred. The exact receipt is
`docs/research/reviews/rc26/publication-report.md`. Plan 075 is DONE. Plan 076
remains independently blocked on its three-gated-study floor.

## [2026-07-21] analysis | Plan 074 May outcome cut awaits approval

Built an isolated 2023-04 through 2026-05 route-speed refresh without
modifying the canonical 181.8 GB SQLite database or any published rc26
artifact. Official availability confirms April and May complete and June
empty. The full scratch build wrote 393/393 speed spines; B60 is
`series_ready_with_gaps`, B68 is `series_ready`, and M57 remains
`needs_pattern_review`.

Added the backward-compatible v4 approval boundary: the source candidate
universe remains distinct from a review cut that binds analysis month, exact
outcome snapshot, all spine receipts, scope, engine, and admission policy.
The resulting non-authorizing cut is
`study-review-cut-v1:5298f37aac8780666c742f7d`. Its complete reconciliation
recommends 9 approvals and 475 rejections; only B60 and B68 differ from rc26.
No receipt or study run exists yet. Plan 076 remains blocked pending explicit
operator approval and the complete freshly bound estimator run. See
`docs/research/plan074-2026-05-review-cut.md`.

## [2026-07-22] analysis | Plan 074 May review cut approved and executed

The operator approved the complete 484-row May cut exactly as reconciled: nine
estimator admissions and 475 rejections. The strict v4 receipt binds
`study-review-cut-v1:5298f37aac8780666c742f7d` and has SHA-256
`13be429629a0eeea241a841ed3a7362ed85fa88b9108fc4b53363bd1570a297c`.
The immutable rc26 candidate universe and v3 receipt remain unchanged and
cannot authorize this analysis-month, outcome, spine, scope, and engine cut.

Focused B60/B68 runs and the complete nine-study run were repeated
byte-identically. B60 is a gated no-detectable-change estimate at -0.0360 mph
(-0.5024%), interval [-0.1098, +0.0462], with 16 treated segments and 135
controls. All gates pass. B68 is descriptive at -0.0087 mph (-0.1116%),
interval [-0.1018, +0.0727], with 12 treated segments and 135 controls; only
its placebo gate fails. M57 remains rejected for `needs_pattern_review`. The
complete index has three gated and six descriptive studies, with zero scope
fallbacks or unexplained ineligible approvals. This result closes Plan 074's
May review cycle without changing any stable rc26 serving object.

## [2026-07-22] direction | Plan 076 spike delivered with zero publishable opportunities

BX38, BX9, and B60 clear Plan 076's three-distinct-event-route ACE floor. Their
signed relative effects are -0.0300%, +2.1014%, and -0.5024%; the prescribed
median transfer is -0.030008758194421996%. The non-public prototype binds the
complete May study index, review inputs, all 393 spine receipts, the May
treatment summary, and the reviewed Plan 073 corpus. Descriptive studies,
including B68, never enter the transfer.

The corpus-bound run scores zero segments. Of 4,153 May source segments, 3,190
are on non-ready spines, 10 lack usable ridership, 135 have affirmative
treatment evidence, and 818 have unknown treatment state. There are zero
spine mismatches or invalid values. Corpus silence, `source_gap`, and
`not_found` remain unknown rather than being manufactured into untreated
evidence. Repeated outputs are byte-identical: prototype SHA-256
`5b9c11080973443deb2ed7ad5610130e21af9e259e2f976f7738007931da5612`
and report SHA-256
`7c520cc8c9ab4cdfd64793231d2f60087381610945654127c14647dbaa8c386a`.

The decision rejects every public opportunity surface until an audited
current segment-level ACE absence inventory and stronger same-family transfer
evidence exist. The comp shows the truthful unavailable state only; no app or
package code changed. Verification passed 466 pipeline tests, 950 root unit
tests, 334 web tests, 22 Worker tests, root typecheck, architecture, knowledge,
focused Biome, and deterministic artifact comparison. Repository-wide style
still reports only the pre-existing `analytics-primer.html` and route-index
diagnostics. Immutable generated approval data is now excluded from Biome,
matching the existing generated-artifact policy rather than changing its
hash-bound bytes.
