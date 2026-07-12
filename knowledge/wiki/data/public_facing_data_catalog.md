---
title: Public-Facing Data Catalog
type: data
status: active
last_updated: 2026-07-05
owner: codex
source_count: 8
tags: [public-data, api, frontend, studio, data-catalog, design-handoff]
---

# Public-Facing Data Catalog

## Why this matters

This page is the canonical catalog of data the Studio can expose to public users, API consumers,
agents, and frontend design work. It is intentionally broader than the endpoints currently served
by `/api/v1/studio/*`.

Use this page before API design or page refactors to answer:

- What user-facing facts exist?
- What grain do they have?
- Are they currently served, merely serving-ready, pipeline-only, source-available, or a source gap?
- Which labels, caveats, and empty states are required so the UI does not overclaim?

Endpoint docs describe the current contract. This catalog describes the product data universe.

## Availability states

| State | Meaning | UI/API rule |
|---|---|---|
| `served_now` | The field or resource is available through the current Worker API, generated Studio projection, OpenAPI, or public docs payload. | Safe to design against, while preserving caveats and quality fields. |
| `serving_ready` | The data exists in D1, R2, or generated artifacts, but is not exposed everywhere it could be. | Good candidate for a new endpoint, projection field, docs example, or deferred panel. |
| `pipeline_available` | Local pipeline jobs produce the data, but it has not been promoted into public serving storage. | Needs release/projection work before product pages depend on it. |
| `source_available` | A public source exists and is registered or known, but ingest/modeling/coverage-ledger work is pending. | Mention only as roadmap/backlog, not as a current product claim. |
| `source_gap` | The product needs the data, but no adequate public source is currently available. | Render unavailable sections or substitute honest proxy views. |
| `not_public` | Raw, private, internal, or operational data that should not be exposed directly. | Expose only derived public artifacts, if any. |

## Public contract rules

- Public clients depend on Studio resources, not storage keys. Do not expose private R2 keys such as
  `studio/v1/routes/...` as product URLs.
- Public response shapes live in `packages/domain` Effect Schema contracts and generated OpenAPI.
- The Worker is a read/write BFF over D1 and R2; it must not run heavy analytics, source probes, or
  local pipeline code in request handlers.
- Missing evidence should be represented as a typed unavailable state with `quality`, caveats, null
  fields, or an omitted panel. Do not patch missing evidence with fixture/sample data.
- A field is not public-facing merely because it exists in `data/` or `knowledge/`. It becomes
  public-facing only after it is turned into a Studio contract, docs payload, artifact proxy,
  public brief/finding, or explicit designer-facing empty state.

## Catalog

### Route Identity And Catalog

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| Route IDs, labels, SBS flag, corridor name, slug | route | `served_now` | D1 route/readiness rows and Studio route projections | `/api/v1/studio/routes`, `/search`, route detail, compare, briefs, findings | Safe for route cards, badges, breadcrumbs, autocomplete, and URL identity. |
| Public route set and route coverage | release, route | `served_now` | Studio release projection plus audit output | Route list, docs facts, coverage audits | Keep catalog route count distinct from public Studio route count when blocked routes are excluded. |
| Borough/context label | route | `served_now` but partly heuristic | Route projection builder | Cards, search filters, page metadata | Do not use as authoritative borough geometry unless a borough-boundary join is added. |
| Endpoint labels, route miles, stop counts | route | `served_now` with geometry caveats | Current MTA route shapes and stops, route projection | Route detail header, map previews, docs examples | Endpoint labels are shape endpoints, not every possible branch terminal. |

### Performance And Speed

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| Observed average speed | route-month, segment-month/hour | `served_now` | MTA bus route segment speeds, D1 summaries, route-slice artifacts | Route cards, route detail KPI, compare, segments, docs | Label as observed speed, not weighted speed unless weighting is explicit. |
| Scheduled comparison speed | route-slice, segment-window | `served_now` for public routes | Bus schedules plus route-slice schedule comparisons | Route cards delta, segment rows, rider-delay evidence | Scope is observed timepoint-pair route slices. Do not imply full stop-to-stop service truth. |
| Observed-vs-scheduled delta | route, segment | `served_now` | Derived from observed speed and scheduled comparison | Route list, route detail, compare, brief claims | Use careful color semantics because positive/negative can read as good/bad policy judgment. |
| Speed trend sparkline/month labels | route-month series | `served_now` | `route_month_trend` and Studio projections | Route cards, route detail, compare | If month labels are absent from a compact UI, keep detailed source rows available in docs/evidence. |
| Speed percentile and peer universe | route-month | `served_now` | Generated public-route speed distribution | Route detail KPI, cohort endpoint, methods | Always show peer universe and direction; this is descriptive, not causal. |
| Slow segments and hourly slow-share bins | timepoint segment, hour | `served_now` | Route-slice segment-speed artifacts | Route detail, ladder, route segment endpoint, brief evidence | Segment universe is observed MTA timepoint-to-timepoint segments, not every stop pair. |
| Long-history route-level speed context | route-month | `source_available` | MTA Bus Speeds beginning 2015 | Future trend panels, context methods | Ingest and modeling pending; use as end-to-end context, not segment truth. |

### Reliability

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| Observed headway reliability, bunching, long gaps, excess wait | route-month/run | `served_now` | `route_observed_reliability_summary`, GTFS-RT collection/recovery artifacts | Route detail `observedReliability`, `/api/v1/status`, briefs | Preserve provenance labels such as `third_party_recovered` and `official_self_collected`. |
| Current observed signal | release appendix | `served_now` | Latest non-baseline observed reliability rows | `/api/v1/status`, docs/status UI | Current signal is not the same as the baseline observed release month. |
| Scheduled reliability baseline | route-month | `serving_ready` or `pipeline_available` depending on route | Scheduled timepoint/headway baseline rows | Potential route reliability tab, methods, caveats | Label as scheduled baseline only until observed GTFS-RT supports the claim. |
| Bus Wait Assessment | route-month | `source_available` with local ingest path | MTA Bus Wait Assessment | Future reliability cross-checks | Needs full public-serving modeling before page claims depend on it. |
| Customer journey metrics and service delivered | route/month/period | `source_available` | MTA performance-spine datasets | Future reliability/supply context | Ingest and coverage-ledger promotion pending. |

### Ridership And Rider Impact

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| Monthly route ridership and average calendar-day riders | route-month | `served_now` | MTA Bus Hourly Ridership monthly totals | Route cards, autocomplete, route detail, compare | Label as average calendar-day boardings when derived from monthly total divided by month days. |
| Hourly route boardings | route-hour, weekday average | `served_now` | MTA Bus Hourly Ridership | Riders tab, brief evidence, docs examples | Safe for "Boardings by hour." Not stop-level boardings. |
| Route-slice passenger-delay exposure | segment-window/hour | `served_now` with denominator caveat | Observed-vs-scheduled delta multiplied by route/hour ridership | Segment endpoint, Riders tab, compare, briefs | Label as route-slice delay exposure or rider-hours of delay. Do not call it stop or segment boardings. |
| Stop-level boardings | stop/day | `source_gap` | FOIL/APC or future Bus OD release needed | Future top-stops panel | Current public catalog has no adequate local/SBS stop-level boarding source. |
| Segment-level boardings or passenger loads | segment/day or stop-pair | `source_gap` | APC or equivalent needed | Future passenger-load maps and segment rankings | Keep `stopBoardings` and `segmentBoardings` null with unavailable reason codes. |
| Express max-load-point capacity | express route/window | `pipeline_available` context only | MTA Express Bus Capacity | Optional express-route analysis | Does not unblock local/SBS stop boardings or M15-style segment loads. |

### Geometry, Maps, And Spatial Context

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| Current bus route shapes and stops | route, stop, shape | `served_now` | MTA Current Bus Routes and Stops | Route detail, ladder previews, map artifacts, endpoint labels | Safe for current route geometry, with branch/shape caveats. |
| Route-slice segment geometry | timepoint segment | `served_now` | Generated route-shape/timepoint slices | Route segment endpoint, ladder, map previews | Surface `segmentGeometrySource` and `segmentGeometryMethod` for reviewer inspection. |
| Map GeoJSON and manifests | release artifact | `served_now` | R2 map artifacts and manifest endpoint | Map panels, artifact proxy, visual audit | Keep large geometry in R2/artifacts, not page-shaped D1 rows. |
| PMTiles or richer map bundles | release artifact | `serving_ready` or future | R2 artifact plane | Future map-heavy views | Treat as product artifacts, not raw object-store paths. |
| NYC LION street links | street segment | `pipeline_available` context | Local route-LION joins | Future context detectors and joins | Public UI should see derived context/evidence, not raw join scaffolding. |

### Treatments, Interventions, And Evaluations

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| ACE/ABLE route coverage and implementation dates | route, month/date | `served_now` | MTA ACE route source and generated treatment state | Route flags, treatments endpoint, intervention timeline, briefs | Route-level coverage is real; per-segment enforcement geography is not yet available. |
| ACE violations | route-month, record-level source | `served_now` for route-month coverage, partial for segment | ACE violation source and generated projection | `/api/v1/studio/data/violations`, evidence catalog | Segment counts remain null until geographic attribution exists. |
| DOT bus-lane overlap | route, segment | `served_now` with method caveat | NYC DOT bus-lane geometry joined to MTA route shape | Route cards, segment rows, treatment cards, treatments endpoint | Label as route-shape overlap, not audited regulatory lane mileage. |
| DOT lane type, hours, days | route, segment | `served_now` where matched | Matched DOT bus-lane records | Treatment tooltips, methods, route detail | Missing values should stay unavailable, not inferred. |
| TSP status | route, segment | `served_now` from dated snapshot | Captured NYC DOT 2017 TSP status source | Segment glyphs, treatments endpoint | Dated source. `candidate` and route-level-only matches need visible caveats. |
| Curated intervention registry | route, event/treatment | `served_now` | Manual Tier 2 intervention artifacts and Studio projections | `/data/interventions`, route timelines, findings, briefs | Preserve layer semantics: milestone, component, planned/proposed, evaluation. |
| Before/after or peer-adjusted evaluations | route/intervention/window | `served_now` where generated, methodology-limited | Evaluation artifacts and intervention projections | Intervention cards, briefs, methods | Describe as descriptive or peer-adjusted, not causal proof unless a stricter method exists. |
| Current authoritative TSP feed/intersection geometry | route/intersection | `source_gap` | Unknown/current source needed | Future TSP map layer | Do not convert 2017 snapshot into a current installed claim. |

### Street, Weather, Equity, And Disruption Context

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| 311 bus-relevant complaints | event, route touch | `pipeline_available` context | NYC 311 current/historical datasets and route-touch joins | Future findings, context appendices, source-gap detectors | Use as context/caveat unless detector rules promote it. |
| Parking violations | violation, route touch | `pipeline_available` context | NYC parking violation sources and geocoding | Future blocked-lane/stop context | Public counts need join-quality disclosure. |
| DOT permits and street openings | permit, route touch | `pipeline_available` context | NYC DOT permits/openings | Future construction disruption caveats | Must be date-windowed before explaining a speed dip. |
| Traffic speeds and volumes | street link/window | `source_available` or partial context | NYC DOT traffic speed/volume sources | Future congestion context | Need route/street matching and freshness labels. |
| Collisions | event, route touch | `pipeline_available` context | NYPD collisions | Future safety/disruption context | Avoid implying operational causality from nearby crashes. |
| Weather | station/day/hour | `pipeline_available` context | NOAA GHCN-Daily weather observations | Reliability split/caveats, methods appendix | Label as station/weather context, not route-specific weather measurement. |
| Equity/demographic context | tract/route context | `serving_ready` or `pipeline_available` | Census ACS tract data | Future equity layer, methods/data page | Use aggregated context with clear geographic method. |
| Service alerts/planned changes | alert entity/window | `source_available` and collection-dependent | Bus Time GTFS-RT alerts and MTA alert docs | Future disruption filters and caveats | Historical alerts require collection; live feeds are not historical tables. |

### Findings

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| Finding cards | finding, route | `served_now` | Promoted findings first, then detector review-queue candidates | `/api/v1/studio/findings`, findings feed, search | Distinguish reviewed/promoted findings from review candidates. |
| Finding detail and reasoning trail | finding | `served_now` | R2 finding/evidence artifacts and Studio schemas | `/findings/:id`, brief seeds | Use observed behavior, treatment inventory, expectation, gap, conclusion shape. |
| Evidence links and review provenance | evidence/finding | `served_now` for current finding set | Detector artifacts, promoted-finding artifacts, evidence catalog | Finding detail, evidence drawers | Keep candidate, detector, decision, packet, reviewer, and hash refs when present. |
| Source-gap findings | route/source family | `pipeline_available` or planned | Coverage audit rows and detector outputs | Future findings feed and methods | Good product surface when evidence is missing, but must be clearly labeled. |
| Gold-set/reviewer expansion | finding corpus | `pipeline_available` roadmap | Review decisions and calibration artifacts | Future confidence/review UX | Do not overstate candidate findings as approved claims. |

### Briefs And Authoring

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| Brief gallery cards and generated route briefs | route/brief | `served_now` | Studio brief projections, route brief artifacts | `/briefs`, search, route CTAs | Most public-route briefs are generated, not editorially reviewed. Show status. |
| Brief body, KPIs, claims, caveats | brief | `served_now` | R2 release brief or D1 draft read path | `/briefs/:id`, docs examples, agents | Generated prose is acceptable only with provenance and validation. |
| Brief evidence graph/search | brief/evidence | `served_now` | Split evidence projections or D1 draft evidence search | `/briefs/:id/evidence`, composer, catalog resolver | Evidence IDs and source refs should be stable and resolvable. |
| Brief history and review context | brief/version | `served_now` for available generated/D1 history | Split history projection and D1 history events | `/briefs/:id/history`, review page | Generated release history is not the same as human editorial history. |
| Draft brief workflow | authenticated draft | `served_now` for API capability | D1 draft/claim/history/job tables and R2 publish candidates | Composer, reviewer flows, BYO-agent API | Requires actor/session scopes; public release promotion remains deliberate. |
| Publish candidates and exports | draft/release artifact | `served_now` for candidate export | D1 state plus R2 candidate payload | Operator workflow, future admin UI | A publish candidate does not mutate the public release by itself. |

### Evidence Catalog, Methods, Docs, And Sources

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| Evidence catalog entries | evidence/caveat | `served_now` | Generated release evidence catalog | `/api/v1/studio/data/evidence`, resolver endpoint, docs | Entries need stable IDs, source refs, and artifact href/hash where applicable. |
| Methods datasets and metric definitions | dataset/method | `served_now` | Generated methods projection and release/source ledger | `/methods`, `/api/v1/studio/methods` | Keep dataset grain, cadence, caveats, and row/source-ref counts distinct. |
| Docs endpoint metadata and examples | endpoint | `served_now` | `packages/domain` schemas, OpenAPI, generated docs projection | `/docs`, `/api/v1/studio/docs`, `/api/openapi.json` | OpenAPI is generated from runtime schemas; it is not the source of truth. |
| Source registry and source credits | source | `served_now` in docs/methods, broader in wiki | Source registry, coverage ledger, generated docs sources | Data & Credits page, methods, evidence rows | Public source cards should point to official/public URLs where available. |
| Changelog/release facts | release | `served_now` in docs payload | Studio release payload and release audits | Docs, methods, status page | Record baseline month, current signal month, route/brief/finding counts, and caveats. |

### Account, Alerts, And Authenticated User State

| Data | Grain | State | Source of truth | Current and possible surfaces | Notes for design/API |
|---|---|---|---|---|---|
| Studio actor profile and scopes | actor/workspace | `served_now` | D1 identity/operator-role tables | `/api/v1/studio/auth/me`, composer permissions | User-facing but not public-open evidence. Treat as authenticated product state. |
| Public account/session/profile | identity/session | `served_now` outside Studio API | D1 identity/session tables | `/api/v1/me`, account/profile UI | Keep separate from public evidence contracts. |
| Saved alerts/searches/comments | user-owned record | `served_now` where endpoints exist | D1 user tables | Account surfaces, future route follow actions | Document separately when a frontend page relies on them. |
| Admin identity role grants | admin action | `served_now` operationally | D1 role tables | Admin/operator flows | Do not include in public data claims or docs examples for unauthenticated clients. |

## API Design Mapping

Use this mapping when adding or refactoring endpoints:

| If the product needs... | Prefer... | Avoid... |
|---|---|---|
| A stable route/finding/brief page | Page-shaped Studio resource backed by R2 release documents plus D1 indexes where useful | Exposing R2 keys or rebuilding large nested documents on every request |
| Filtered route/segment/treatment/evidence lookup | D1-backed or hybrid `/api/v1/studio/data/*` resource | Hiding query semantics in a page projection only |
| Large geometry, map files, brief exports, evidence bundles | R2 artifact with D1/public refs and controlled proxy when needed | Storing large nested files in D1 |
| Compact route search, brief gallery, finding index | D1 index or generated list projection with full public coverage | Curated demo subsets unless explicitly labeled demo |
| Authenticated draft/review/write state | D1 control rows plus R2 large body snapshots | Unbounded event logs in D1 or public release mutation inside ordinary page requests |
| Methodology, docs, examples, credits | Generated docs/methods projections from the same schemas and release facts | Hand-authored examples that drift from runtime contracts |

## Source gaps that matter to users

These are the most important known public-facing gaps:

- Stop-level boardings and segment-level passenger loads for local/SBS routes.
- Per-segment ACE violation attribution.
- Arbitrary historical treatment-state reconstruction outside generated release windows.
- Current authoritative TSP feed or intersection-level TSP geometry.
- Domain-reviewed bus-lane tolerance and regulatory lane-mile semantics.
- Larger reviewer/gold-set expansion for findings.
- Richer immutable query/chart/source artifact resolver UI.
- Browser-rendered map/geospatial visual audit across desktop and mobile.

## Update triggers

Update this page when:

- A new public Studio field, endpoint, page panel, brief section, finding type, or docs card is
  added.
- A source gap becomes source-available or serving-ready.
- A proxy field becomes observed/reviewed, or an observed field is demoted.
- `packages/domain/src/studio-schemas.ts`, `studio-openapi.ts`, or `studio-release.ts` changes a
  public response shape.
- `knowledge/wiki/engineering/synthetic_data_inventory.md` changes the status of a UI-visible field.

## Sources

This page synthesizes repo-local contracts and wiki pages. Source-level verification remains in the
dataset pages and source registry.

- [[wiki/data/source_registry|Source Registry]]
- [[wiki/engineering/web_api_endpoint_architecture|Web API Endpoint Architecture]]
- [[wiki/engineering/serving_storage_split_plan|Serving Storage Split Plan]]
- [[wiki/engineering/website_data_support_audit|Website Data Support Audit]]
- [[wiki/engineering/website_surface_data_plan|Website Surface Data Plan]]
- [[wiki/engineering/synthetic_data_inventory|Synthetic Data Inventory]]
- [[wiki/project/ai_interaction_model|AI Interaction Model]]
- MTA Open Data Program — https://www.mta.info/open-data — verified_at: 2026-04-26
- MTA Developer Resources — https://www.mta.info/developers — verified_at: 2026-04-26
- NYC Open Data — https://data.cityofnewyork.us — verified_at: 2026-05-25 via source registry entries
- NYC DOT bus lanes source page — https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3 — verified_at: 2026-04-27 via source registry entries
