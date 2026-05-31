# Synthetic Data Inventory

Tracks UI-visible fields in the Studio API that are **not** backed by real observational data. Each row identifies the field, where the synthetic value is produced, the underlying real data we *do* have (or don't), and what would be needed to make it real.

Use this page alongside [[wiki/data/public_facing_data_catalog|Public-Facing Data Catalog]] and
[[wiki/engineering/frontend_data_handoff|Frontend Data Handoff]]. The catalog defines the full
user-facing data universe; this inventory records the narrower set of fields that need honesty
labels, proxy framing, removal, or source promotion.

Update this file whenever:

- A new UI field is wired to a hardcoded constant, template string, or derived-from-thin-air formula.
- A field moves from synthetic to real (delete the row).
- A real data source becomes available that could replace a synthetic field (note it in "blocker").

Convention: a field is **synthetic** if the displayed value cannot be traced back to an observation, derivation from observations, or an external authoritative dataset.

## Remediation decision (2026-05-24)

Synthetic data is not banned from the project, but it must not masquerade as observed evidence, reviewed workflow state, source citations, or deployed API capability. The Studio should use three explicit buckets:

1. **Observed / reviewed** — can be shown as fact when the payload traces to MTA/DOT/NYC/NOAA sources, route-slice artifacts, D1 summary rows, or immutable reviewed-finding artifacts.
2. **Proxy / provisional** — may be shown only with proxy labels and payload caveats. It should not use wording like "scheduled", "route mileage", "published", "reviewed", "AI", "citation", or "weekday median" unless that exact thing is backed by the payload.
3. **Prototype / planned** — can remain in the codebase behind preview/demo framing, but should not appear in the public product as if it is live capability.

Interventions are already being worked on separately. This audit should not churn `packages/domain/src/studio-interventions.ts` or the active intervention pipeline unless a synthetic intervention field is being rendered as source-backed fact. The only intervention-facing requirement here is provenance discipline: dated ACE/ABLE/bus-lane events can remain factual; route-level proxies, dated TSP snapshots, and peer-adjusted causal interpretations need caveats or should wait for the intervention workstream.

### P0: hide or relabel before public demo

These are the highest-risk surfaces because they present unsupported facts or product capabilities:

- Route detail `AIDiagnosisStrip`: the hardcoded M15/Madison treatment narrative and unused component have been removed. Keep it absent until a real route-specific driver model or reviewed static artifact exists.
- Route ladder story rail: the hardcoded Madison Avenue story rail has been replaced with a data-derived narrative computed at render time from the segment payload (top-rider-hours segment + lane-coverage gap pattern). The section is hidden when no signal is present. See the 2026-05-25 ladder audit follow-up for the trigger rules and wording templates.
- Route annotate and brief workflow pages: local claim sketches and local-only composer/review actions have been removed from the public workflow. Route annotate now inspects selected segment evidence and sends users to `/briefs/new?route=...`; `/briefs/new` creates a persisted D1 draft; the composer writes draft metadata, claim text/body, claim add/delete, and evidence refs through the D1 draft API; review validates, requests review, and creates publish candidates through the same write surface. Generated release briefs still fail closed into draft creation before edit/review actions are available.
- Docs pages: fake auth/CLI/rate-limit claims have been removed or relabeled, endpoint rows and response examples now come from OpenAPI/release-derived `GET /api/v1/studio/docs`, and the Data & Credits page is generated from release facts plus the source-coverage ledger.
- Methods page: row counts, periods, schema chips, methods, source-ref counts, and dataset descriptions now come from the Studio release/source ledger. Remaining hardcoded content is editorial: metrics, caveats, qualitative-source cards, and publication rules.
- Routes home: week-over-week speed-decline language and no-op AM/PM filter chips have been removed. The remaining filters are backed by fields on `StudioRoute`; the low-lane-overlap threshold now names DOT bus-lane geometry over current MTA route shape and says it is not audited regulatory lane mileage.
- Compare page: synthetic 24-hour speed claims derived from route sparkline have been removed; it now shows observed route-month speed values. Delay and bus-lane comparison labels now say `Route-slice delay` and `Route-shape lane overlap` / DOT route-shape overlap so they do not read as full-route passenger-delay or regulatory lane mileage.

### P1: replace with existing artifacts

Several "synthetic" fields can be made materially better without new data collection because `route-brief-input.json` already contains richer source-backed artifacts:

- `RouteBriefInputArtifact` in `tools/pipeline/src/jobs/build/studio-release.ts` now reads `scheduleComparisons`, per-segment `hourlySlowWindowBins`, and route-level `ridershipProfile` windows for segment projection and release generation. Route `dailyRiders`, `ridersYoyPct`, and `ridershipSpark` now come from monthly ridership/trend rows: daily boardings use the actual days in the analysis month, YoY is nullable unless the same prior-year month exists, and the rider chart uses monthly ridership history rather than the speed sparkline. Route `sparkMonths` and `ridershipSparkMonths` now expose source month labels from `route_month_trend`. The Riders tab now exposes route-level peak and slow-crowded hourly ridership windows when the route brief input provides them, plus a source-backed `hourlyBoardings` profile for the restored `Boardings by hour` chart. Richer `speedProfile` source row payloads are still pending for route-level speed charts.
- Segment `scheduledMph`, route `scheduledMph`, segment `riderHours`, route `riderHoursLost`, and `GET /api/v1/studio/routes/{routeId}/segments` now use route-slice schedule comparisons and ridership exposure with no observed-speed multiplier fallback. Public Studio routes must have complete schedule/ridership prerequisites; routes without delay-exposure inputs are cut out of the public projection instead of being served with synthetic zeroes.
- Replace synthetic AM/PM filters and compare-hour charts with route/hour evidence. The generated Studio release now builds route `spark` from `route_month_trend` observed monthly speeds, and per-segment `hours` are emitted by the route-brief build as 24 observed slow-window bins. `build:route-briefs` regenerated the audited public March 2026 route inputs, and `audit:studio-coverage` now fails if public route inputs or route-detail projections have missing/legacy segment-hour arrays, missing/incomplete schedule comparisons, missing ridership exposure, invalid route-segment delay-exposure evidence, route-list spark values without aligned source month labels, route-list or route-detail rows without source-backed route-level ridership profiles, or missing route-segment coverage blocker metadata. Remaining hour-chart work is route/rider exposure semantics.
- Replace generic rider exposure charts with `ridershipProfile` windows. Route riders are now explicitly average calendar-day boardings from monthly totals, and the Riders tab can show source-backed route-level hourly ridership windows. `ridershipProfile.hourlyBoardings` carries 24 weekday-average route/hour boarding bins from MTA Bus Hourly Ridership for the restored Tarbell `Boardings by hour` section. `ridershipProfile.topStopBoardings` is now a first-class contract slot for the restored Tarbell `Top stops by daily boardings` section, but its current coverage is `not_available` because no APC/equivalent stop-level boarding source is present. Regenerated route-segment evidence now exposes `coverage.ridershipDenominator = "average_service_day_route_hourly_ridership"`, `coverage.serviceDayRidershipCoverage = "available"`, and `coverage.hourlyRiderDelayCoverage = "available"` when each segment has hourly delay rows. `coverage.stopBoardingsCoverage` and `coverage.segmentBoardingsCoverage` remain `not_available` so clients do not infer stop/segment loads from route/hour ridership. Remaining work is an APC or equivalent source for stop-level and segment-level boardings.
- Replace hardcoded evidence-ref counts, data-note source-ref counts, and static method tables with counts from source refs, evidence rows, route artifacts, and the release source ledger. The Methods page, Data & Credits source tables, and docs endpoint response examples now consume generated release/source data; Methods contract and UI use `sourceRefCount` for source-ref counts, brief-level evidence-ref counts now render as generated evidence refs, and generated evidence rows carry stable `sourceRefId` / `sourceLabel` metadata where the pipeline can identify the backing source. Evidence rows can now also carry optional `sourceHref` values; the release builder attaches known public source URLs for MTA speed/ridership, DOT bus-lane geometry, and positive TSP evidence, and route-slice rider-delay evidence carries the immutable generated route artifact key, artifact API path, and SHA-256 when the route artifact table has it. The browser resolver renders public source URL links, generated artifact links, and explicitly labels rows without URLs as source-ref-only. `build:studio-release` now hard-fails generated briefs with duplicate evidence/caveat IDs, dangling claim evidence/caveat refs, evidence-ref-count mismatches, or non-caveat evidence rows without source metadata, and generated source-ledger guidance uses source-ref wording instead of citation wording.
- DOT bus-lane geometry overlap is now used for segment-level lane status and route-level `laneCoverage`. The release also carries distinct DOT `lane_type`, `hours`, and `days` values from matched lane pieces as `laneTypes`, `laneOperatingHours`, and `laneOperatingDays` on route, segment, route-segment evidence, and treatment records. `GET /api/v1/studio/data/treatments?route=&segment=&asOf=` exposes the same lane/ACE/TSP treatment state with source/method caveats. Keep the 45-meter midpoint/proximity method framed as route-shape overlap, not audited regulatory lane mileage.

### P2: build before claiming as real

These need new modeling or serving support before the current UI language is honest:

**Active P2 status snapshot — 2026-05-25.**

Recently completed or hard-cut over:

- Route/segment shape metadata now exists for generated route-slice segments, and legacy non-Studio
  route-card endpoints fail closed instead of remaining as a parallel read model.
- Segment and route bus-lane values use current MTA route-shape geometry joined to NYC DOT bus-lane
  geometry, with lane type/hour/day source metadata and method caveats.
- Segment hourly slow-window bins, schedule comparisons, and monthly ridership exposure are required
  by `audit:studio-coverage`; missing fallbacks fail release validation instead of becoming zeros.
- Dated TSP source-status ingestion exists from the captured 2017 NYC DOT status source, with
  explicit route/segment match-method metadata and stale-source caveats.
- Descriptive speed percentiles/cohorts and intervention comparison-cohort metadata exist, with
  machine-readable non-causal limitation codes.
- The D1-backed brief workflow exists for deterministic create/edit/evidence/validate/review,
  publish-candidate export/retraction, edit history, scoped Studio actor auth, and hard-cutover
  promotion through `studio:promote-publish-candidate`.
- Release evidence search/resolution exists through the brief evidence endpoints plus
  `GET /api/v1/studio/data/evidence?search=&kind=&route=` and
  `GET /api/v1/studio/data/evidence/{evidenceId}`. `audit:studio-coverage` now rejects unstable
  evidence catalog IDs, missing source refs, and incomplete immutable artifact href/hash metadata.
- Public segment `aiNote` is sparse and optional. It carries only `body`, `source`, and
  `generationMode`; analyst-only fields live in the internal `segment-analyst-notes.json` artifact.
  Live LLM rewriting is opt-in and should be treated as questionable value for public microcopy; the
  default public note is deterministic evidence-bound prose.
- Hosted brief generation now dogfoods Cloudflare Think + OpenRouter/Qwen through the same
  accepted `brief-jobs` contract used by the web and API clients. A local Wrangler run with the
  real OpenRouter key queued, ran, completed, persisted a generated D1 draft, recorded
  `draft.generated` history, and passed server validation. The parser strips harmless model-returned
  helper keys while preserving server-owned evidence/caveat/strength refs.
- Public account identity now exists through D1 identities, magic-link sessions, account/profile
  endpoints, alert/saved-search ownership, public comments, and admin operator-role promotion.
- Route/segment passenger-delay projections now use the full observed MTA timepoint-to-timepoint
  segment universe when regenerated route-slice inputs are available. The release builder backfills
  older top-segment-only inputs from raw route-slice speed/ridership/schedule snapshots, emits
  `segments` for all observed timepoint segments, carries `hourlyPassengerDelay` rows, and reports
  `coverage.ridershipDenominator = "average_service_day_route_hourly_ridership"` with
  `serviceDayRidershipCoverage` and `hourlyRiderDelayCoverage` available. Window filtering accepts
  requested subranges inside generated multi-month segment evidence instead of requiring exact
  single-month equality.

Still open:

- Performance-spine ingestion beyond Wait Assessment. The MTA bundle identified in the gap research
  is now present in `knowledge/raw/source_manifest.yaml`: Customer Journey-Focused Metrics
  (`8mkn-d32t`), long-history Bus Speeds (`cudb-vcni`), Bus Service Delivered (`6qwi-vjde`),
  CBD Bus Speeds/Routes/Geofence (`r6db-kkzj`, `cgzt-smqf`, `srxy-5nxn`, `vaq5-qfkz`), Fare
  Evasion (`uv5h-dfhp`), Daily Ridership and Traffic (`sayj-mze2`), Bus MDBF (`7mt2-y7ip`), Open
  Data Catalog (`f462-ka72`), MTA capital project datasets, CRZ vehicle entries, bridge/tunnel
  crossings, accessibility context, and Service Alerts. Except for Wait Assessment and existing CBD
  speed metadata, these still need full source probes, local ingesters/tables where product-bearing,
  and coverage-ledger/audit rules before public route pages can depend on them.
- Stop-level and segment-level boardings remain unavailable because the current public source set has
  route/hour ridership only, not APC or equivalent boarding counts. This is now a blocker for fully
  populating the restored Tarbell `Top stops by daily boardings` section, and for any
  boarding-weighted segment ranks or stop-to-stop passenger-load claims. It is **not** a blocker for
  the restored `Boardings by hour` chart because that chart is route/hour, not stop/hour. The segment
  contract carries explicit `stopBoardings: null` and `segmentBoardings: null` plus unavailable
  reason codes so clients cannot accidentally imply those counts exist. The 2026-05-25 stop-boarding
  source audit found no public NYC MTA stop-level bus boarding dataset. MTA's internal DRD/APC
  average-day dataset is the primary request path through FOIL, while the planned 2026 Bus
  Origin-Destination Ridership Estimates release should be monitored for stop or stop-pair grain.
  Express Bus Capacity `4tpr-3bvc` is express-route maximum-load-point data only and does not unblock
  M15 SBS or local/SBS stop boardings.
- Current authoritative TSP feed or intersection-level TSP geometry.
- Bus-lane tolerance/domain review and regulatory lane-mile semantics.
- Detector-side causal/control cohorts plus external intervention-methodology review.
- Richer immutable query/chart/source artifact URLs and resolver UI beyond the catalog resolver API.
- Full browser-rendered map/geospatial visual audit; map payload/manifest audits exist, but
  cross-viewport screenshot/pixel validation is still separate.

- True route and segment lengths, endpoint labels, and ladder ordering from GTFS shapes/stops rather than route-name parsing and fixed multipliers. Route length and neutral `endpoints.start` / `endpoints.end` labels are now derived in the generated R2 Studio release from current MTA route-shape and stop snapshots. Route-segment API rows and generated route-detail/ladder `StudioSegment` rows now expose `segmentGeometrySource`, `segmentGeometryMethod`, and the sliced `segmentGeometry` LineString so served segments distinguish MTA route-shape/timepoint slices from unavailable geometry. The ladder selected-segment rail renders a normalized route-shape slice preview plus source/method/vertex metadata for reviewer inspection; remaining work is full segment-universe geometry/ordering parity. Legacy non-Studio D1 route-card endpoints now fail closed instead of staying alive as a parallel Studio read model.
- Per-segment bus-lane overlap and route-level `laneCoverage` are now built from current MTA route-shape geometry joined to DOT bus-lane geometry. Route-detail, route-ladder, search, and annotate treatment glyphs now expose segment/route overlap share, matched DOT lane-piece count, and TSP source + match-method caveats in hover/selected-segment context. The route-detail Interventions cards also expose route-level bus-lane source/method text (NYC DOT bus-lane geometry vs MTA route shape, 45 m midpoint/proximity method), matched DOT lane type/hour/day values, plus TSP source URL/date and route/corridor text-match limitations. `GET /api/v1/studio/data/treatments` now carries structured `methodLimitations` codes for bus-lane tolerance/domain-review and explicit unavailable codes when matched DOT lane type or operating-hour values are absent, plus dated TSP snapshot, current-feed, and intersection-geometry blockers. Remaining work is stronger tolerance/domain review and regulatory lane-mileage semantics.
- Per-segment hourly slow-window bins are now built from route-slice segment-speed observations into `route-brief-input.json`, all public March 2026 route inputs have been regenerated, and `audit:studio-coverage` now rejects missing/legacy segment-hour arrays or missing/incomplete segment schedule comparisons before a Studio release can pass.
- TSP corridor/source ingestion now uses the captured NYC DOT 2017 TSP status snapshot
  with dated-source caveats, and route/segment/treatment payloads carry explicit match-method metadata. Route status
  is a route-label match against the dated status snapshot; segment installed status requires an
  endpoint text match against source street tokens; candidate and non-installed rows remain
  route-level status only. Remaining work is a current authoritative feed or intersection-level
  geometry, not a boolean fallback.
- True route/segment passenger-delay beyond the old monthly top-segment subset: the Studio release now multiplies positive observed-minus-scheduled travel-time delta by average service-day route/hour ridership and hard-fails public route/segment projections that lack schedule or ridership prerequisites. Regenerated route inputs emit the full observed MTA timepoint segment universe, 24-hour slow-window bins, and `hourlyPassengerDelay` rows per segment/window. `GET /api/v1/studio/routes/{routeId}/segments` accepts requested subranges inside the generated evidence window, derives `windowMonthCount`, reports `fullRouteCoverage = true` for the observed-timepoint universe, and marks service-day/hourly coverage available. Remaining caveat: MTA public hourly ridership is still route/hour grain. The contract therefore carries `stopBoardings: null`, `segmentBoardings: null`, and unavailable reason codes for stop-level and segment-level boarding counts until an APC or equivalent source is available.
- Empirical speed percentiles/ranks over a stated peer universe. The Studio release now computes `speedPercentile` from the observed speed distribution over the public route set, includes `speedPercentileContext` payload metadata with rank, route count, metric, direction, and peer-universe label, emits `studio/v1/cohorts.json`, and serves `GET /api/v1/studio/data/cohorts?route=` with the public-route observed-speed distribution plus descriptive nearest-speed peers. The cohort definition now carries `interpretation = "descriptive_peer_context_not_causal_control"`, `detectorSideControlCohortCoverage = "not_available"`, `externalMethodologyReviewStatus = "pending"`, and `methodLimitations` for nearest-speed-only peer selection, non-causal controls, no treatment assignment, and the pending detector-side control cohort. Structured intervention rows now expose the already-computed matched comparison cohort as `route.interventions[].comparisonCohort`, including comparison route IDs, pre/post windows, adjusted speed delta, the literal `comparison_adjusted_not_causal_proof` interpretation, and methodology limitation codes for non-experimental design, pending detector-side controls, pending external methodology review, and overlapping interventions. Remaining work is external methodology review and detector-side causal/control cohorts, not the public descriptive cohort API.
- Generated brief/SEO/demo copy no longer labels Bx12 as a "positive control"; it is descriptive treatment benchmark context until detector-side control-cohort methodology exists.
- Real brief composer/review/comment/version persistence and export endpoints. The first D1-backed draft API now uses the planned canonical read path (`GET /api/v1/studio/briefs/{briefId}`) for mutable drafts and immutable release briefs, supports draft metadata edits, claim add/edit/delete, Cloudflare Think-backed OpenRouter draft generation through `POST /api/v1/studio/briefs/{briefId}/generate` when `OPENROUTER_API_KEY` and the `STUDIO_BRIEF_AUTHOR_AGENT` Durable Object binding are configured, evidence-ref edits, review request, validation, publish-candidate creation, publish-candidate export, and publish-candidate retraction while preserving the original publish timestamp. Draft writes append compact snapshots to `studio_brief_history_event`, and `GET /api/v1/studio/briefs/{briefId}/history` now returns real edit-log version records/diffs for D1 drafts rather than only a source-to-current comparison. `GET /api/v1/studio/briefs/{briefId}/publish-candidate` exports the current candidate as a release-shaped JSON payload with the intended `studio/v1/publish-candidates/{briefId}.json` artifact key. `studio:promote-publish-candidate` validates that export against the current release, does a dry run by default, and with `--execute` rewrites `studio/v1` release projections plus archives the candidate artifact, replacing `sourceBriefId` in place for a hard public cutover instead of keeping a legacy parallel brief. Draft-backed reads and writes now accept identity-session or legacy bearer auth resolved through D1 `identity_session` plus `studio_actor_role`; roles carry workspace ownership plus `read:briefs`, `write:briefs`, `review:briefs`, and `publish:briefs` scopes, and D1 drafts persist `workspace_id` so draft reads/jobs/evidence/history/export fail closed for tokens from another workspace. Draft create/generate/edit/validate/review/publish/retract history records keep the authenticated actor email as the audit identity, and review comments now persist that email plus the D1 identity display name instead of accepting browser-supplied reviewer headers or generic writer labels. The browser now creates D1 drafts from route/finding seeds, polls `GET /api/v1/studio/brief-jobs/{jobId}` for the accepted generation job, displays persisted job status/timestamps/errors plus `generationMode = "deterministic_seed" | "llm_assisted"`, `runner = "inline_worker" | "cloudflare_think"`, `backgroundGenerationStatus = "not_available" | "queued" | "running" | "succeeded" | "failed"`, `llmGenerationStatus`, `llmProvider`, and `llmModel` during creation, regenerates editable drafts through the planned draft API, writes draft metadata/claims/evidence refs through authenticated Studio write requests, validates drafts, requests review, creates publish candidates, exports the current publish-candidate artifact key, and shows a retract-candidate button when the canonical draft read reports `draftStatus = "publish_candidate"` or `"published"`. Brief-generation job state is persisted on the D1 draft row as `job_status`, `job_generation_mode`, `job_llm_status`, `job_llm_provider`, `job_llm_model`, `job_started_at`, `job_completed_at`, and `job_error`; the job endpoint returns those fields plus runner/background status so callers can distinguish deterministic fallback, queued/running Cloudflare Think jobs, completed OpenRouter model-provider calls, and failed LLM attempts. Regeneration source failures now persist `job_status = failed`, `job_error`, and a `draft.generation_failed` history snapshot so agents can poll the accepted job instead of receiving only a transient request error. The 2026-05-25 local dogfood run verified the real Think/OpenRouter/Qwen path end to end: a route-seeded M15 SBS draft moved queued -> running -> succeeded, wrote generated claim bodies, recorded `draft.generated`, and validated with score 100. Route-seeded draft creation now hydrates from the generated route brief automatically, so `POST /api/v1/studio/briefs` with only `routeSlug` persists source-backed claims/evidence instead of creating an evidence-free placeholder claim. Evidence reads filter persisted draft/release evidence through `GET /api/v1/studio/briefs/{briefId}/evidence?search=&kind=`, the browser evidence search fails closed if that server endpoint is unavailable instead of falling back to locally loaded evidence, finding-seeded drafts resolve evidence to the source finding reasoning/caveat instead of placeholder rows, claim create/edit now rejects evidence/caveat IDs that do not resolve against the draft source evidence set, validation still reports any unresolved refs already stored in older drafts, and the generated release evidence catalog is served through `GET /api/v1/studio/data/evidence?search=&kind=&route=` with search over stable `sourceRefId` / `sourceLabel` fields as well as prose. The auth surface now includes `GET /api/v1/studio/auth/me` for operator-role auth and `GET /api/v1/me` for public identity auth; both report `publicAccountAuthStatus = "magic_link"` and `userDirectoryStatus = "d1_identity"` where applicable. Remaining work is broader reviewer/workflow semantics, not basic hosted generation or public account auth.
- Public docs generated from `studioOpenApiDocument` plus the release/source ledger, not hand-authored future-state docs. The docs response now includes release-derived facts, generated source rows with row counts/date ranges/readiness/join-geocode rates/evidence eligibility/source links, and generated JSON response examples for every Studio endpoint.

### P2 plan-vs-implementation audit — 2026-05-25

This is the current answer to "was it planned, and did we implement the plan or invent something else?"

| Deliverable | Planned in docs | Current implementation evidence | Planned vs implementation | Remaining gap before goal completion |
|---|---|---|---|---|
| Route/segment geometry | Planned in [[wiki/project/overview|Project overview]], [[wiki/project/managed_services_options|Managed services options]], [[wiki/engineering/package_structure|Repo package structure]], [[wiki/engineering/website_hard_cutover_plan|Website hard cutover plan]], and [[wiki/engineering/data_pipeline_v1_completion_plan|Data Pipeline v1 completion plan]] as local batch route/stop/shape construction with R2/D1 serving projections. | `tools/pipeline/src/jobs/build/studio-release.ts` reads route-shape and stop snapshots, emits route `miles` and neutral `endpoints.start/end`, uses route geometry for segment/lane evidence, and now emits `segmentGeometrySource`, `segmentGeometryMethod`, and nullable `segmentGeometry` LineString payloads on both `StudioRouteSegmentEvidence` and generated `StudioSegment` rows. The ladder selected-segment rail renders the LineString as a normalized preview with source/method/vertex metadata. | Planned, with a scoped implementation: route-level shape summaries and neutral endpoint labels are real; served route-segment evidence rows and route-detail/ladder segment rows now carry explicit geometry source/method metadata and inspectable route-slice linework rather than only lane-derived hints. | Segment geometry/ordering parity for the full segment universe. |
| Bus-lane overlap | Planned in product/data docs as a DOT bus-lane overlay and in the hard-cutover plan as source-backed projection data, not request-time geospatial work. | `studio-release.ts` emits route `laneCoverage/laneCoverageSource/laneTypes/laneOperatingHours/laneOperatingDays` and segment `lane/laneSource/laneOverlapShare/laneMatchedCount/laneTypes/laneOperatingHours/laneOperatingDays`; `GET /api/v1/studio/data/treatments?route=&segment=&asOf=` exposes those fields with a route-shape-overlap method caveat, structured `lane.methodParameters` (`matchToleranceMeters = 45`, midpoint-to-DOT-polyline distance, matched-shape-piece length-share aggregation), and structured `lane.methodLimitations` for regulatory-mileage, tolerance-review, and unavailable lane-type/hour fields; route-detail/ladder treatment glyphs expose overlap share and matched lane-piece count; route-detail treatment cards expose the route-level DOT lane type/hour/day values; `audit:studio-coverage` rejects missing DOT route/segment lane evidence and missing lane method metadata arrays. | Planned and implemented as a route-shape proximity method with DOT lane type/hour/day source metadata promoted. This is still not a legal lane-mileage inventory. | Domain review of the 45m tolerance and regulatory lane-mileage semantics. |
| Segment hourly bins | Planned as segment-level hotspot/ladder/hour evidence in the route-first API and web support docs. | `RouteBriefInputArtifact.scheduleComparisons` and `hourlySlowWindowBins` flow through `studio-release.ts`; `StudioSegment.hours` exposes 24 observed slow-window bins; `audit:studio-coverage` rejects missing/legacy arrays. `StudioRouteSegmentsResponse.coverage` now separately marks true hourly passenger-delay coverage available when every served segment carries `hourlyPassengerDelay` rows. | Planned and implemented for observed slow-window bins on public generated route-slice segments; true hourly passenger-delay is now a generated segment/window artifact, not inferred from the slow-window bins. | No APC blocker for the current slow-share/hourly-delay UI. APC/equivalent data is needed only for stop/segment boarding counts or boarding-weighted segment load displays. |
| TSP source ingestion | Planned as treatment-state evidence in the intervention/mid-layer API direction, but not as a complete current feed. | `studio-release.ts:tspEvidenceIndex()` ingests the captured NYC DOT 2017 TSP status report and emits `tspStatus/tspSource/tspSourceDate/tspSourceUrl/tspCorridor/tspMatchMethod` on routes and segments. `GET /api/v1/studio/data/treatments?route=&segment=&asOf=` also exposes `tsp.matchMethod` plus structured `tsp.methodLimitations` for dated snapshot, current-feed, intersection-geometry, and unknown-not-absence blockers. Treatment glyph tooltips and the route-detail TSP treatment card now include the match method so segment rows do not collapse route-level-only evidence into segment-level installation proof. `audit:studio-coverage` rejects missing or incoherent TSP match-method metadata on route-detail and route-segment evidence rows. | Planned source discipline, implemented as a dated source snapshot rather than a current intersection inventory. Segment installed status is limited to endpoint text matches against source street tokens; candidate and non-installed statuses are route-level only. | Current authoritative TSP feed or intersection-level geometry; keep `candidate` and `unknown` labels caveated. |
| True route-delay exposure | Planned by the metrics/product docs as ridership-weighted severity and by the support plan as derived serving projections. | `studio-release.ts` computes positive observed-minus-scheduled travel-time delta times average service-day route/hour ridership for segment-hour passenger delay; public routes missing schedule/ridership prerequisites are excluded instead of receiving fallbacks. `buildRouteBriefSegmentUniverse()` emits the full observed MTA timepoint-to-timepoint segment universe, `hourlyPassengerDelay`, explicit `stopBoardings: null` / `segmentBoardings: null`, and service-day denominator metadata. `GET /api/v1/studio/routes/{routeId}/segments` includes machine-readable coverage metadata for observed-timepoint full-route scope, multi-month generated windows when available, service-day/hourly coverage, and explicit unavailable boarding-count reason codes. | Planned and implemented for the observed MTA timepoint segment universe with route/hour ridership denominators. The implementation intentionally does not invent stop/segment boardings. | APC/equivalent data is optional for current UI wording, but required before any stop-to-stop passenger-load, stop boarding, segment boarding, or boarding-weighted public delay claim. |
| Empirical percentiles/cohorts | Planned generally as route ranking/peer context; the exact descriptive cohort endpoint is a scoped implementation decision documented after the API surface stabilized. | `StudioRoute.speedPercentileContext`, `studio/v1/cohorts.json`, and `GET /api/v1/studio/data/cohorts?route=` expose public-route observed-speed rank/distribution and nearest-speed peers with `interpretation`, `detectorSideControlCohortCoverage = "not_available"`, `externalMethodologyReviewStatus = "pending"`, and `methodLimitations` that identify them as descriptive peer context rather than causal controls. Intervention timeline rows now carry `comparisonCohort` from D1 `route_intervention_comparison` rows when a matched comparison set exists, including `methodLimitations` for non-experimental design and pending detector-side/external methodology work. | Mostly planned, implemented conservatively as descriptive public-route cohorts plus intervention matched-comparison metadata. The API explicitly labels comparison-adjusted results as not causal proof. | Detector-side causal/control cohorts and external intervention-methodology review remain separate methodology work. |
| Brief workflow persistence | Explicitly planned in [[wiki/engineering/web_app_support_plan|Web app support plan]] and [[wiki/engineering/agent_author_api|Agent-Author API]]. | D1 draft tables and Worker endpoints support create/read/update draft metadata, add/edit/delete claims, hosted Cloudflare Think/OpenRouter draft generation through `POST /api/v1/studio/briefs/{briefId}/generate`, deterministic fallback seeding, validate, review request, publish candidate, publish-candidate export, retract, evidence search, persisted draft `workspace_id`, D1 identity sessions/operator roles/scopes, public magic-link auth through `/api/v1/auth/magic-link/*`, authenticated profile reads through `/api/v1/me` and `GET /api/v1/studio/auth/me`, accepted generation job polling via `GET /api/v1/studio/brief-jobs/{jobId}`, persisted generation job status/timestamps/error fields, runner/LLM disclosure fields, source-backed evidence/caveat ref validation on claim writes, and append-only edit-log snapshots through canonical `/api/v1/studio/briefs/*` reads/writes. Browser create/edit/review surfaces call those endpoints rather than local workflow state, verify identity/operator role through `/auth/me` or `/api/v1/me`, and keep create/review/publish/export/retract controls disabled until the verified actor has the required D1 scopes. The create surface shows job status/timestamps/errors plus deterministic or `cloudflare_think` runner labels while polling, the editor exposes the planned regenerate action through the draft API and displays the returned persisted generation job status/error, draft-backed canonical reads expose `draftStatus` / `draftPublishedAt`, draft history reads surface `studio_brief_history_event` version records plus snapshot diffs, and the review surface can fetch/display the publish-candidate export artifact key. `studio:promote-publish-candidate` provides the operator-side hard cutover from exported candidate to regenerated local release projections. | Planned API-first implementation with a hard cutover from local-only browser state and arbitrary citation IDs. The hosted LLM path is optional convenience over the same typed REST draft contract; external agent harnesses can ignore it and submit typed mutations. | Broader reviewer/workflow semantics and production operational rollout remain, but basic hosted generation and public account identity are no longer P2 blockers. |
| Generated public docs | Planned in [[wiki/engineering/website_hard_cutover_plan|Website hard cutover plan]] and the web support plan as OpenAPI/contract-generated docs. | `studioOpenApiDocument`, `buildStudioDocsEndpointsFromOpenApi()`, and `GET /api/v1/studio/docs` drive endpoint rows, response examples, release facts, and source ledger rows. | Planned and implemented for the Studio web/API docs. | CLI/distribution metadata generation remains future work; keep docs regenerated after every public contract change. |

### Guardrails

- `tests/harness/production-boundaries.test.ts` now includes Studio presentation guardrails that fail if public Studio UI/SEO code or the public `llms.txt` resource reintroduces removed local-workflow/proxy labels or helpers (`LOCAL SKETCH`, `Local claim sketch`, `not persisted`, `Estimated speed by hour`, `Generate brief`, `Open route brief`, `Start brief`, `RH/day`, `rider-hr/day`, `Delay exposure / day`, `Route cards`, `route cards`, `averageHourlySpeed`, `seedClaim`, `localComments`, etc.); if public docs reintroduce unsupported auth/rate-limit/package-CLI claims (`BPI_API_KEY`, OAuth, rate-limit copy, npm/pipx/brew install snippets); if public UI starts claiming full-route rider-hours/total route delay while the serving projection remains scoped to route-slice delay exposure; if demo fixtures preserve retired rider-hour/per-weekday presentation copy; or if public UI/generated brief copy upgrades descriptive comparison cohorts into unsupported causal/control language such as "positive control" or "control group". It also fails if the retired non-Studio product endpoints (`/api/v1/routes`, `/api/v1/hotspots`, `/api/v1/compare`, and retired schema routes) re-enter the Worker or if their old domain schema exports return. The release-shape portion now lives in `audit:studio-coverage` and fails if any public route input lacks complete segment schedule comparisons, ridership exposure, or 24 observed hourly slow-window bins; any route-list row lacks DOT route-shape lane coverage; any route-detail `segment.hours` array is not 24 values; any route-detail or route-segment API segment lacks route-shape LineString source/method metadata; route-detail / route-segment API rows lack DOT lane-geometry, TSP source-status evidence, or complete delay-exposure evidence; or route-segment API responses omit the explicit route-slice/full-route/hourly/multi-month coverage blocker metadata. The harness also checks that the cohort contracts keep descriptive/non-causal method limitation codes, and that the violations/treatments API contracts keep null ACE violation counts, route-month ACE source identity, route-shape bus-lane method identity, structured bus-lane/TSP method limitation codes, and stale TSP-source caveats. `GET /api/v1/studio/data/violations?route=&segment=&from=&to=` now exists as a route-window ACE evidence surface, but it deliberately returns route-month ACE coverage with null segment counts until per-segment ACE geography/count attribution is real.
- `audit:studio-coverage` now recursively scans generated `studio/v1` JSON artifacts and fails if release outputs reintroduce retired synthetic/proxy presentation phrases such as local workflow labels, route-card wording, daily delay shorthand, unsupported full-route delay claims, or old rider-impact labels. Passing source scans are no longer the only protection; the actual generated release artifacts must also be clean.
- The route-segment API contract and `audit:studio-coverage` now require route-segment coverage metadata to match the generated evidence: observed-timepoint full-route scope when segments are present, `average_service_day_route_hourly_ridership` as the denominator, available service-day/hourly passenger-delay coverage when every segment carries hourly rows, and `multi_month_window` only when the generated segment evidence spans more than one month. `stopBoardingsCoverage` and `segmentBoardingsCoverage` remain `not_available`; generated route-segment API artifacts fail the audit if they drop the explicit stop/segment boarding unavailable reason codes or claim boarding counts from route/hour ridership.
- Each public `StudioRoute` and `StudioSegment` field now has package-level projection metadata in `packages/domain/src/studio-field-provenance.ts` declaring `observed`, `derived`, `proxy`, `template`, or `prototype`, plus source/note text. The production-boundary harness fails if either schema grows a field without matching provenance metadata.
- Generated release briefs and D1 draft seed summaries now say `route-slice delay exposure` instead of the retired rider-delay shorthand. The production-boundary harness scans the release builder and Worker seed copy so generated briefs cannot reintroduce full-route-sounding delay phrases.
- Generated release brief copy now uses evidence-ref wording instead of "cited brief" language. The production-boundary harness scans generated brief and draft seed sources for legacy citation-brief phrasing so route briefs do not imply an unsupported immutable citation artifact model.
- Demo Studio fixtures now use dated TSP snapshot / fixture-window wording instead of retired source-backed-TSP or hardcoded weekday/month median copy; the production-boundary harness guards those fixture phrases so they cannot be copied back into public examples.
- API architecture and hard-cutover docs no longer list route-detail AI diagnosis text, claim seeds, intervention-potential scenarios, AI-ranked route lists, AI-surfaced findings, or positive-control comparisons as active contract fields; those stay absent or descriptive until backed by reviewed artifacts, the D1 brief workflow, or detector-side causal methodology.
- The findings endpoint row in the API architecture now says precomputed finding cards instead of AI/discovery feed cards, and the production-boundary harness guards the contract-planning docs against reviving unsupported AI route/finding fields.
- The web support plan's route-detail loading guidance now names scoped treatment evidence and data caveats instead of route diagnosis, and the same contract-planning guard covers that retired diagnosis wording.
- The old `build:planned-routes` CLI compatibility alias has been removed; planned-route selection now uses the canonical `build:routes -- --planned` command only.
- Legacy M1 root command aliases (`ingest:m1`, `hotspots:m1`, profile/brief/intervention aliases, etc.) have been removed so local docs and scripts use route-agnostic commands with explicit route/month arguments.
- Public Methods, Compare, Docs/OpenAPI, field-provenance, SEO, generated brief, and draft seed text now use `route-slice delay exposure` or plain Studio route language instead of generic rider-delay, rider-impact, or legacy route-list wording.
- Route-detail segment rows now use a visible `Route-slice delay` column label, and the route-detail slowest-segment summary says `route-slice delay exposure`; the boundary harness guards those strings so the page does not fall back to generic delay labels while full-route/hourly passenger-delay coverage is pending.
- The shared KPI/demo evidence marker has been renamed from `Cite` / `citeN` to `EvidenceRefMark` / `evidenceRefN`, and the system demos now use evidence-ref wording instead of citation copy.
- Studio planning docs now describe brief evidence as evidence-ref/source-ref payloads rather than raw citation payloads or citation-count requirements. The production-boundary harness guards the planning docs most likely to revive the old citation-oriented brief contract.
- Demo fixture API descriptions now use `delay-exposure fields` instead of `rider-delay fields`, and fixture treatment/caveat text avoids full-route ACE or control-style phrasing.
- Keep synthetic demo data only when the UI visibly says it is a preview/prototype. Public route, finding, method, and docs pages should default to absence over invented precision. The remaining `studio/sample-data.ts` demo brief copy now uses route-slice delay-exposure wording instead of the retired rider-hour/day framing.

## Slow-segments tab (route detail) — `StudioSegment`

Source: `tools/pipeline/src/jobs/build/studio-release.ts:buildSegments`. Renderer: `apps/web/src/components/SegmentRow.tsx` and the selected-segment note rail in `apps/web/src/studio/pages/route-detail.tsx`.

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `direction` | real | `topSegments[].direction` | — | — |
| `from`, `to` | real | `topSegments[].from / .to` | — | — |
| `speedMph` | real | `weightedAverageSpeedMph` rounded | — | — |
| `scheduledMph` | real for audited public release / observed-timepoint caveat | Uses schedule-comparison travel time and segment distance. The old `speedMph * 1.18` fallback has been removed; the release builder and coverage audit now fail missing schedule evidence. Regenerated route inputs emit schedule comparisons across the full observed MTA timepoint-to-timepoint segment universe. | Schedule-implied speed for stop-to-stop/APC load segments if the product needs that grain | Current value is scoped to observed MTA timepoint pairs, not every stop pair |
| `riderHours` | real for audited public release / denominator caveat | Positive observed-minus-scheduled travel-time delay multiplied by average service-day route/hour ridership; nonpositive delay is `0`. Missing schedule or ridership prerequisites now fail the release instead of silently becoming `0`. Segment evidence carries hourly passenger-delay rows, but stop/segment boardings stay null. | Direct passenger-delay using stop-level or segment-level boarding/load counts only if the UI chooses to show boarding/load semantics | Current UI can use this as route-hour-denominator delay exposure; do not label it as stop/segment boardings |
| `lane` | real for audited public release / geometry-method caveat | `segmentLaneOverlapIndex` slices the route segment from current MTA route-shape + stop snapshots, compares it to normalized NYC DOT bus-lane polylines, and emits `lane`, `laneSource`, `laneOverlapShare`, `laneMatchedCount`, `laneTypes`, `laneOperatingHours`, and `laneOperatingDays`. The rebuilt March 2026 release has 1,691/1,691 route-detail segments and 1,691/1,691 route-segment API rows with `laneSource = "dot_bus_lanes_geometry"` plus lane method metadata arrays; `audit:studio-coverage` now fails missing/legacy lane evidence. | Route-length-weighted lane coverage and domain-reviewed tolerance thresholds | Current method is a length-weighted proximity approximation over visible route-slice/timepoint segments, not a legal lane-mileage measurement |
| `ace` | partial | `routeId.endsWith("+") && route-level aceActiveDuringAnalysisPeriod` — route-level proxy applied to every segment | Per-segment ACE enforcement window | Have ACE route-month coverage; need geographic ACE corridor data to attribute per segment |
| `tspStatus`, `tspSource`, `tspSourceDate`, `tspSourceUrl`, `tspCorridor`, `tspMatchMethod` | real for ingested source snapshot / stale-source caveat | `tspEvidenceIndex` reads the captured NYC DOT 2017 TSP status report text + metadata, maps installed vs candidate route corridors, and emits source-status fields for route-detail segments plus route-segment API rows. `tspMatchMethod` distinguishes route-label matches, segment endpoint text matches, route-level-only status, and unmatched sources; treatment glyph tooltips now render that method. The rebuilt March 2026 release has route statuses: 5 installed, 14 candidate, 331 unknown; segment/API rows: 22 installed, 66 candidate, 1,623 unknown. `audit:studio-coverage` now fails if either segment surface lacks valid TSP source-status and match-method evidence. | Current authoritative TSP route/intersection inventory | The source is a dated snapshot. `candidate` means planned/in-development in the 2017 source, not current installed coverage; installed segment matches are endpoint text matches against source street tokens, not signal/intersection geometry. |
| `hours` | real for audited public release | `segmentHourlySlowWindowBins` groups route-slice segment-speed rows by timepoint segment and hour-of-day, then emits 24 normalized shares of observed windows below the slow-speed threshold. `build:route-briefs` regenerated all public March 2026 route inputs, and `audit:studio-coverage` now verifies 1,691 route-input segment rows plus route-detail projections carry 24-value hour arrays. | — | Keep the audit gate in the release path so future route inputs cannot silently fall back to zero-filled absence |
| `flagged` | real | `slowWindowPercent >= 60` | — | — (definition is ">=60% of observed hours in slow state"; the old top-impact label has been removed) |
| `aiNote` | sparse public evidence note / optional LLM author pass | Public `StudioSegment.aiNote` is now optional and has only `{body, source, generationMode}`. The release builder emits it only for sparse high-signal anomalies: per route, candidates must fall in the worst observed-vs-scheduled speed-gap quartile or show a treatment/exposure mismatch, then the selected notes are capped at 30% of visible segment rows. The public body is one source-backed claim and `source` must name the underlying dataset/window, such as `MTA Bus Speeds + MTA Hourly Ridership · segment-level route slice · Mar 2026`. The former full note shape has moved to `StudioAiAnalystNoteSchema` and is written to a separate internal `segment-analyst-notes.json` artifact keyed by `{routeSlug, segmentId}` so public route projections do not expose `nextChecks`, `blockedClaims`, `caveats`, evidence badges, or headlines. `build:studio-release --segment-note-llm` can rewrite only the sparse public notes through OpenRouter/Qwen; invalid multi-claim or workflow-style outputs are dropped rather than shipped. | Reviewed prompt/model outputs over the full published segment set and analyst-only artifact consumers | LLM authoring is opt-in and bounded by `--segment-note-llm-limit` to avoid accidental large batch spend; public projections should keep notes sparse and source-lined |
| `suggestedSeeds` | removed from public contract | Formerly constant `["Check lane continuity", "Compare scheduled vs observed speed"]`. Route annotate already stopped rendering this field, the public `StudioSegment` contract no longer carries it, and the production boundary harness forbids public Studio UI from reading `suggestedSeeds`. | Per-segment reviewed claim seeds or a rule-based seed contract | Same as `aiNote` |

> Route detail's KPI strip, retired AI Diagnosis Strip, and other tabs are covered in detail under [Route Detail](#route-detail---routesrouteid) in the page-by-page audit below.

> Renderer-side hints (misleading labels) are called out per-page below. Notable known examples already corrected: the old top-impact segment label has been removed from the slow-segments row, the Riders KPI now says "Route-slice delay exposure", the Riders segment ranking now says "Visible route-slice delay segments", and "Severity by hour" has been renamed to "Slow share by hour" now that per-segment observed slow-window bins are emitted.

## Audit cadence

Re-walk this file at the end of any pipeline change that touches `studio-release.ts`, `route-brief-input.json` upstream of it, Worker Studio endpoints, or a page under `apps/web/src/studio/pages/`. This file now covers the public Studio web/API projection, including briefs, findings, methods, and docs. Map artifacts have a separate `audit:map-artifacts` geospatial payload/manifest gate. The web test suite now includes a route-shape slice render audit for `MapThumb` that fails if source linework falls back to the decorative placeholder or loses visible endpoints; remaining map UI work is a full Playwright screenshot/pixel audit over browser-rendered route pages.

---

# Full page-by-page audit (2026-05-24)

The sections below are the first full sweep of every user-visible Studio page. Each section traces rendered fields through the pipeline (`tools/pipeline/src/jobs/build/studio-release.ts` → R2 projections or D1 queries → Worker → page component) and classifies them as **real / partial / synthetic / template / hardcoded**.

## Pages audited

1. [Routes Home](#routes-home---gapi-v1studio-routes) — `/`
2. [Route Detail](#route-detail---routesrouteid) — `/routes/$routeId` (Overview, Slow segments, Ladder preview, Riders, Interventions, Data notes tabs + KPI strip + retired AI Diagnosis Strip)
3. [Route Ladder](#route-ladder---routesrouteidladder) — `/routes/$routeId/ladder`
4. [Route Annotate](#route-annotate---routesrouteidannotate) — `/routes/$routeId/annotate`
5. [Briefs List](#briefs-list---briefs) — `/briefs`
6. [Brief Workflows](#brief-workflows---briefsbriefid-) — `/briefs/$briefId{,/evidence,/edit,/history,/review}`, `/briefs/new`
7. [Findings Feed](#findings-feed---findings) — `/findings`
8. [Finding Detail](#finding-detail---findingsfindingid) — `/findings/$findingId`
9. [Compare](#compare---compare) — `/compare?a=…&b=…`
10. [Search Results](#search-results---search) — `/search`
11. [Methods](#methods---methods) — `/methods`
12. [Docs](#docs---docs) — `/docs`, `/docs/$page`

## Routes Home page (`/`) — `GET /api/v1/studio/routes`

Renderer: `apps/web/src/studio/pages/routes-home.tsx`. The page renders header copy + a search autocomplete + a single list ("Routes needing attention this month") of Studio route rows. Each row draws on `StudioRoute` (shape: `packages/domain/src/studio-schemas.ts:62`).

Routes are served from the R2 projection `studio/v1/routes.json` built by `buildRoute` (`tools/pipeline/src/jobs/build/studio-release.ts`). The Worker no longer has a D1 route-card fallback for `GET /api/v1/studio/routes`, so the route home, search, compare, and route-detail flows share the same release projection. The old non-Studio D1 route-card/profile/hotspot/compare/scorecard endpoints and their route-list/profile/hotspots/compare/scorecard schema endpoints now 404 instead of serving a second product read model. The app-level route-scorecard fixtures and fixture test were deleted with that public endpoint so the retired citation-shaped contract is not kept alive in web tests. `RouteScorecardSchema`, `SourceCitationSchema`, and `routeScorecardJsonSchema` were removed from `@bp/domain`; remaining internal scoring/export code uses package-local structural validation instead of a shared public domain contract. Domain schema descriptions now also avoid route-scorecard wording so generated docs do not imply that retired contract still exists.

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `route.label` (RouteBadge) | real | `readiness.routeShortName.replace("-SBS","")` in the generated Studio release | — | — |
| `route.sbs` (badge style) | real | `routeId.includes("+") \|\| routeShortName.includes("SBS")` in the generated Studio release | — | — |
| `route.corridor` (card line 1) | real | `readiness.routeLongName ?? routeShortName` | — | — |
| `route.corridorFull` (autocomplete) | real | Same as `corridor` | — | — |
| `route.dailyRiders` (autocomplete meta + card `/day`) | partial-real | `Math.round(summary.totalRidership / daysInIsoMonth(summary.month))` — monthly ridership divided by actual calendar days in the analysis month | True average weekday ridership (or actual operating days per month) | Still no weekday/Saturday/Sunday split or service-day denominator |
| `route.aceStatus` (autocomplete meta " - ACE active") | real | `summary.aceActive` from `route_brief_summary` in the release build | — | — |
| `route.speedMph` (card mph value) | real | `summary.averageSpeedMph` falling back to `readiness.averageSpeedMph`, rounded | — | — |
| `route.scheduledMph` (used in `delta`) | real for audited public release / observed-timepoint caveat | Uses route-slice schedule-comparison travel time and segment distance across generated segment evidence. Missing schedule comparisons now fail release generation instead of falling back to `speedMph * 1.18`; regenerated inputs cover the observed MTA timepoint segment universe. | Schedule-implied route speed at stop/load grain if needed | Current value is observed timepoint-pair scoped |
| `delta = speedMph - scheduledMph` (the colored +/- column) | real for audited public release / observed-timepoint caveat | Derived from observed route speed and the no-fallback scheduled speed described above. | A scheduled-vs-observed gap at finer stop/load grain if needed | Same as `scheduledMph` |
| `route.flags` (card line 2, joined by " · ") | partial / contract-scoped | Array of three deterministic strings: ACE active/inactive, DOT bus-lane match/no-match, and TSP snapshot match/candidate/unknown. `StudioRouteFlagSchema` now allows only that generated vocabulary. The old `readiness.readinessStatus` tag and demo-only flags such as "Busway", "Concrete lane", or "Lane partial" have been removed from public route-card payloads. | A curated rider-facing tag set | Flag taxonomy not designed yet |
| `route.laneCoverage`, `route.laneCoverageSource`, `route.laneTypes`, `route.laneOperatingHours`, `route.laneOperatingDays` (used by `no-lane` filter and treatment card) | real for audited public release / geometry-method caveat | Longest in-effect MTA route shape compared to normalized NYC DOT bus-lane geometry; public release rows require `laneCoverageSource = "dot_bus_lanes_geometry"` and lane method metadata arrays, with matched DOT `lane_type`, `hours`, and `days` values where present | Domain-reviewed tolerance thresholds and regulatory lane-mileage semantics | Current value is route-shape proximity overlap, not a regulatory lane-mileage inventory |
| `route.slug` (link target) | real | `routeIdToSlug` deterministic from routeId in the release builder | — | — |
| `route.routeId` (search haystack) | real | From `readiness` row | — | — |
| `route.borough` (search haystack) | partial | `routeBorough` derives borough from the first letter of routeId in the release builder; treats every `B*` route as Brooklyn even though many cross boroughs (e.g. B/Bx interlines, Manhattan-bound B routes). | Authoritative route-to-borough mapping (GTFS shape ∩ borough boundary) | No borough table joined; using prefix heuristic |
| Page subtitle | real / absence-safe | Now says the list is a current-month triage list from the Studio route projection, not a week-over-week decline model | Two consecutive monthly speed snapshots differenced and rider-weighted if change-ranking returns | No week-over-week comparator is exposed in `StudioRoute` |
| Removed filter chips "AM peak" / "PM peak" | removed | No longer rendered until a real route-level peak-period field exists | Per-route AM/PM peak speed indicators | Pipeline has route-level hourly peak/slowest windows in D1 but they are not surfaced in `StudioRoute` |
| Filter chip "All routes" | real | Shows all loaded `StudioRoute` rows | — | — |
| Filter chip "SBS only" | real | Filters on `route.sbs` boolean | — | — |
| Filter chip "Low lane overlap" | real for audited public release / threshold caveat | Filters on DOT route-shape lane overlap `< 30`; label no longer claims literal "No bus lane" | Defended threshold for low lane coverage | Threshold is a product choice, not an official DOT category |
| Recent routes pill | real | `useRecentRoutes()` from `localStorage` — purely client state | — | — |
| Header lede: "Built from public MTA bus speed, ridership, and schedule data; NYC DOT bus lane geometry; and the MTA Automated Camera Enforcement program record." | real / scope caveat | Bus speed and ridership are real D1 sources; route and segment bus-lane values now use DOT line overlap evidence; ACE is a real route-month coverage flag. | Visible source/method metadata for every summarized field | The lede is accurate at source-family level but does not expose route-slice, schedule-comparison, or lane-overlap method scope |

## Renderer-side hints

- **"Routes needing attention this month"** now avoids unsupported week-over-week/change-ranking language. It still needs a route-score/source explainer before users can inspect why the list is ordered.
- **The +/- delta column** (`routes-home.tsx:150-158`) renders with conditional `bp-color-good` (green) or `bp-color-bad` (red), implying observed-vs-scheduled comparison. This is now grounded for public routes with complete route-slice schedule comparisons; routes missing delay-exposure prerequisites are not published rather than receiving a fallback.
- **Peak-period filters** are hidden until a real route-level peak-period field exists. The hourly peak data exists in D1 (`routeBriefPeakWindow`) but is not exposed on `StudioRoute`.
- **Card line-2 flags** (joined by " · ") no longer expose `readinessStatus`; remaining flags are constrained by `StudioRouteFlagSchema` to generated source/method-facing ACE, lane-match, and TSP snapshot-status labels. They still need a curated rider-facing taxonomy.
- **`dailyRiders` "/day"** label is now average calendar-day boardings from monthly ridership, not a weekday-average APC count.
## Route Detail page (`/routes/$routeId` — `apps/web/src/studio/pages/route-detail.tsx`)

Slow-segments tab's `SegmentRow` fields (`scheduledMph`, `lane`, `ace`, `tsp`, `hours`, `flagged`, `aiNote`) are documented in `knowledge/wiki/engineering/synthetic_data_inventory.md` and are **not** re-audited here. `aiNote` is now a structured evidence note; the former string-template note and `suggestedSeeds` remain removed. Source files traced: `apps/web/src/studio/pages/route-detail.tsx`, `apps/web/src/components/InterventionTimeline.tsx`, `packages/domain/src/studio-schemas.ts`, `packages/domain/src/studio-interventions.ts`, `tools/pipeline/src/jobs/build/studio-release.ts` (`buildRoute`, route-shape lane coverage, empirical speed percentile helpers, `buildObservedReliability`).

### Header (page chrome)

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `route.label` (RouteBadge) | real | `routeLabel(readiness)` from GTFS readiness | — | — |
| `route.sbs` | real | `routeId.includes("+") \|\| shortName.includes("SBS")` | — | — |
| `route.corridorFull` (H1) | real | `readiness.routeLongName ?? routeShortName` | — | — |
| `route.borough` | real | `routeBorough(routeId)` lookup | — | — |
| `route.endpoints.start / .end` | real | Generated R2 release reads current MTA route-shape + stop snapshots, picks the longest in-effect shape, and labels endpoints by nearest timepoint stop. The public Studio contract no longer uses `north`/`south` compatibility names. | Direction-aware endpoint labels if the product needs direction-specific copy | Current labels are shape endpoints, not all possible branch terminals |
| `route.miles` | real when geometry summary is present | Generated R2 release uses current MTA `shape_length` for the longest in-effect shape and converts it to miles. | Complete route geometry summary coverage in generated route projections | Routes missing source shape snapshots still fall back to a coarse readiness-derived value |
| `route.stops` | real | `readiness.stopCount` | — | — |
| `peerRoute` (Compare CTA) | real / descriptive | `peerSlug` is now the nearest observed-speed neighbor in the generated public-route speed universe. It is a descriptive comparison route, not a causal/control match. | Matched control cohort when the CTA is used for causal comparison | Current peer is selected by same-month observed speed proximity only |

### KPI strip (`KpiStrip`)

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `weightedAvgSpeed` | partial / label corrected | Set to `speedMph` (= `summary.averageSpeedMph`). The UI now labels it "Observed avg speed" instead of "Weighted avg speed" so it no longer claims ridership weighting. | Ridership-weighted avg across timepoint segments | We have segment exposure and segment speed but `buildRoute` just copies the unweighted route average |
| `speedPercentile` ("Nth percentile of public route speeds") | real / context-required | Empirical percentile of observed route speed among the public route-speed set, computed in the generated Studio release. Ties use average rank and values are clamped to 1–99. `StudioRouteSchema` now requires `speedPercentileContext` with `metric`, `peerUniverse`, `peerUniverseLabel`, `rank`, `routeCount`, and `direction`, so the percentile cannot be served without peer-universe metadata. | — | — |
| `spark` (Spark sparkline) | real when trend rows exist | Generated R2 release uses the latest seven `route_month_trend` observed monthly speed rows at or before the release month, falling back to a single current point when no trend rows exist. | Trend source metadata/month labels in the API payload | `StudioRoute` exposes only numeric spark values, not the months/source rows behind them |
| `route.scheduledMph` (baseline in spark) | partial | Schedule-comparison speed across generated segment evidence. Missing schedule comparisons now fail release generation; the old `speedMph * 1.18` fallback is gone. Regenerated route-slice inputs carry the observed MTA timepoint segment universe; older artifacts can be backfilled from raw route-slice snapshots during Studio release generation. | Schedule-implied speed at any finer stop/load grain the product may need | Current route metric is observed timepoint-pair scope, not APC stop/load scope |
| `dailyRiders` | partial-real | `Math.round(summary.totalRidership / daysInIsoMonth(summary.month))` — average calendar-day boardings from monthly totals | Actual weekday boardings | We have monthly totals; weekday/weekend split not isolated |
| `ridersYoyPct` | real when prior-year trend row exists | Computed from same-route current-month and prior-year `route_month_trend.ridership`; nullable when either month is missing or nonpositive. The regenerated March 2026 public release has YoY for 324/346 routes and renders unavailable for the remaining 22. | — | Missing historical monthly ridership for some routes |
| `riderHoursLost` | partial / denominator caveat | R2 release projection sums positive observed-minus-scheduled delay over generated segment evidence using route/hour ridership denominators. Public copy remains conservatively labeled as route-slice delay exposure rather than generic rider-hours. | Stop/segment passenger loads or APC-derived boardings only for boarding/load-specific UI | Route/hour ridership is not stop-level or segment-level load |
| `laneCoverage`, `laneCoverageSource`, `laneTypes`, `laneOperatingHours`, `laneOperatingDays` | real for audited public release / geometry-method caveat | Generated R2 release picks each route's longest in-effect MTA route shape, compares shape pieces to normalized NYC DOT bus-lane polylines with the same 45m midpoint/proximity method used for segment evidence, and emits percent route-shape overlap plus `laneCoverageSource = "dot_bus_lanes_geometry"` and distinct DOT lane type/hour/day values from matched lane pieces. The rebuilt March 2026 release has 346/346 public routes with DOT lane coverage and lane method metadata arrays. | Domain-reviewed tolerance thresholds and regulatory lane-mileage semantics | This is a route-shape proximity overlap, not a legal inventory of dedicated lane miles or lane operating hours |
| `aceStatus` ("Active" / "None") | real | `summary.aceActive ? "active" : "none"` | — | — |
| `aceSince` ("since YYYY-MM") | real | Earliest `automated_bus_lane_enforcement` intervention month | — | — |

### AI Diagnosis Strip

The hardcoded M15-only diagnosis strip and the unused `AIDiagnosisStrip.tsx` component have been removed. No public route should render the unsupported treatment-stack narrative until a real route-specific driver model or reviewed static artifact exists.

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| M15 treatment-stack narrative | removed | No longer rendered | Treatment-stack snapshot + 14-mo speed delta + a real comparable-route analysis of SBS routes with a defended post-window | No treatment-stack model, no route-specific driver attribution model |

### Overview tab (`RouteOverviewTab`)

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| AI route briefing first sentence | removed from public contract | The former `route.diagnosis` template field was removed from `StudioRoute`, the release builder, search haystack, OpenAPI wording, and sample data. | Real narrative or LLM summary | No LLM/reviewed route diagnosis step |
| AI route briefing second sentence | removed from public contract | Formerly built inline from `segments[0]` and described the highest-impact segment with a daily delay unit. Route detail no longer renders the AI briefing block, and production-boundary tests forbid the old phrases. | Real per-route reviewed or LLM-authored narrative | No LLM/reviewed route diagnosis step |
| AI route briefing closing line ("Treatment coverage is visible below…") | **hardcoded** | Static page copy | — | — |
| Observed speed values chart (`RouteSpeedTrend`) data | real when trend rows exist / scope-labeled | Uses `route.spark`, now backed by `route_month_trend` monthly observed speeds in the generated R2 release, with aligned `route.sparkMonths` ISO month labels. The UI labels these as observed route-month values rather than a causal trend. | Richer source metadata per chart point | Current chart points carry month labels but not separate source artifact/query URLs |
| Speed trend dashed line (scheduled) | partial | `route.scheduledMph` — comparison-backed for audited public route-slice segments; missing schedule evidence fails the release rather than falling back to a multiplier | — | Same as scheduled-mph above |
| "X.X mph now" badge | partial | `weightedAvgSpeed` — see KPI row | — | — |
| Slow-window share by hour (`HourlyExposureBars`) | partial / scope-labeled | `averageHourlySeverity(segments)` averages the 24 observed per-segment slow-window bins for visible route segments. The old `scheduledMph - severity*4.2` synthetic mph transform was removed. True `hourlyPassengerDelay` rows now exist on the route-segment evidence contract, but this chart does not render them yet. | UI wiring to the served hourly passenger-delay rows; APC/stop-load data only if the chart should become boarding-weighted | Current chart is still an unweighted slow-share visualization |
| Treatment status card — Bus lane overlap | real for audited public release / geometry-method caveat | Uses `route.laneCoverage`, `laneCoverageSource`, `laneTypes`, `laneOperatingHours`, and `laneOperatingDays`, now built from DOT bus-lane geometry vs the route shape | — | Same method caveat as KPI `laneCoverage`; UI exposes source, 45m tolerance, and DOT lane type/hour/day values but still does not claim regulatory lane mileage |
| Bus-lane note "Present on the slowest visible segment" / "Gap or partial lane…" | partial | Branches on `segments[0].lane`, which is now DOT geometry-backed for audited public route-detail segments. Treatment glyph hover details expose `laneOverlapShare` and `laneMatchedCount`, but the KPI note still compresses `minimal`/`partial`/`none` into broad treatment copy. | Domain-reviewed route-level bus-lane semantics beyond proximity overlap | Route detail still needs lane type/hour semantics before claiming regulatory lane coverage |
| Treatment status — ACE value/note | real | `aceStatus`, `aceSince` | — | — |
| Treatment status — TSP source status + installed-segment count | real for ingested source snapshot / stale-source caveat | `route.tspStatus` is built from the captured NYC DOT 2017 TSP status report. The card now shows Snapshot match/Candidate/Unknown and counts visible segments whose `tspStatus` is `installed`, rather than treating missing source evidence as "None". | Current authoritative TSP route/intersection inventory | The source is a dated snapshot; `unknown` means no positive evidence in ingested TSP sources, not confirmed absence. |
| Route vitals: Borough | real | — | — | — |
| Route vitals: Length | real when geometry summary is present | `route.miles` from generated R2 route-shape summary or D1 `route_catalog.route_miles` | — | Same as header `miles` |
| Route vitals: Stops | real | — | — | — |
| Route vitals: Type (SBS/Local) | real | — | — | — |
| Route vitals: Reliability ("High attention/Watch list/Lower-risk route") | removed from route-detail vitals / payload contract corrected | This used `routeScore` thresholds 70/40 — a bucketing of the internal score, not an official reliability grade. Route detail no longer renders it as a vital; the generated payload and `StudioRouteReliabilitySchema` now allow only `Studio high-attention band`, `Studio watch band`, or `Studio lower-attention band`; and the production-boundary harness guards against restoring `["Reliability", route.reliability]` or the old grade-like strings. | Official reliability classification or a documented internal definition if a reliability vital returns | Keep route-score bands out of authoritative vitals unless the UI labels them as Studio triage/attention bands with source/method copy |
| Route vitals: Segments count | real | `segments.length` | — | — |

### Ladder preview (in-page Ladder tab)

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `segment.speedMph` per rung | real | per-segment observed | — | — |
| Color thresholds (`<5` bad, `<6.5` warn) | **hardcoded** | constants in renderer | — | UI decision |
| `segment.from` / `segment.to` | real | — | — | — |
| `segment.riderHours` (delay exposure value) | real for audited public release / segment-scope caveat | Positive observed-minus-scheduled delay exposure from the route-slice segment projection — see SegmentRow inventory. Public labels no longer use rider-hour shorthand or add `/day` because hourly/daily rider-delay coverage is not implemented. | Complete route-wide segment contribution | Same as SegmentRow `riderHours` |
| Row count (top 6 of 8 max) | **hardcoded** | `segments.slice(0, 6)` in renderer | — | UI decision |
| "Analyst challenge" sidebar copy | **hardcoded** | Static page copy | — | — |

### Riders tab (`RouteRidersTab`)

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| Daily riders KPI value | partial-real | `formatCompact(route.dailyRiders)` = average calendar-day boardings from monthly totals | Weekday boardings | Same as KPI |
| Daily riders YoY sub | real when prior-year trend row exists | Uses nullable `route.ridersYoyPct`; UI renders "unavailable" when the prior-year same-month ridership comparison is missing | — | Missing historical monthly ridership for some routes |
| Route-slice delay exposure KPI | partial / denominator caveat | `route.riderHoursLost` — positive observed-minus-scheduled delay exposure over generated segment evidence; UI still labels it "Route-slice delay exposure" / "visible route-slice vs scheduled" to avoid overstating the route/hour denominator. The route-segment API coverage metadata now reports observed-timepoint full-route scope and hourly passenger-delay availability when generated rows exist, while still showing stop/segment boardings as unavailable. | Stop/segment passenger loads or APC-derived boardings only if the UI wants boarding/load-specific claims | Same as KPI |
| Highest-impact segment value/sub | partial / scope-labeled | Largest `riderHours` segment — uses route-slice delay exposure for visible segments only; UI says "route-slice measured delay" | Complete route-wide segment contribution | Same as SegmentRow `riderHours` |
| "Monthly boardings" chart (`RouteBoardingsTrend`) | partial-real / scope-labeled | Uses `route.ridershipSpark`, the latest seven `route_month_trend.ridership` rows converted to average calendar-day boardings. The regenerated March 2026 public release has ridership sparks for 346/346 routes. The UI labels the value range with `ridershipSparkMonths`. | Service-day denominators | `StudioRoute` exposes route-month values; weekday/service-day splits are still absent |
| "Top stops by daily boardings" list | source gap / contract-backed empty state | Restored from the Tarbell Riders tab. `route.ridershipProfile.topStopBoardings` now carries `{coverage, sourceId, sourceLabel, window, unavailableReason, stops}`; current generated artifacts emit `coverage: "not_available"` and an empty stop list. | APC/equivalent stop-level boarding source | Current MTA public hourly ridership is route/hour only |
| "Boardings by hour" chart | route/hour real / stop-hour caveat | Restored from the Tarbell Riders tab. `route.ridershipProfile.hourlyBoardings` carries 24 weekday-average route/hour boarding bins from MTA Bus Hourly Ridership. | Stop-hour APC only if the chart is changed from route/hour boardings to stop/hour boardings | Current chart is route-level hourly boardings |
| "Slow share by hour" bars (`HourlyExposureBars`) | partial / scope-labeled | `averageHourlySeverity(segments)` averages observed per-segment slow-window shares when regenerated 24-bin route inputs are present. The chart no longer claims boardings or rider exposure; AM/PM red coloring is still fixed hours 7–9 and 16–19. True hourly passenger-delay rows are now served by the route-segment evidence API but not rendered here. | UI wiring to `hourlyPassengerDelay`; APC/boarding data only if the visualization should show stop/segment loads | Current chart remains slow-window share, not passenger-delay |
| Delay exposure framing alert | partial / scope-labeled | Static explanatory copy with `{route.riderHoursLost}` interpolated; now says the value is from the current visible route-slice projection and removes the fake "other miles combined" comparison | Complete route-wide passenger-delay framing | Same route-slice blocker as KPI |

### Interventions tab (`RouteInterventionsTab`)

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| "Treatment evidence in this release" sub `Geometry and source-snapshot context for ${label}${SBS}` | **template / scope-labeled** | Renderer template; no longer says "What's in place today" because bus-lane overlap is method-scoped and TSP may come from a dated source snapshot | — | UI copy |
| Bus lane `TreatmentDeepCard` status / overlap value | real for audited public release / geometry-method caveat | `route.laneCoverage` is DOT route-shape lane overlap with `laneCoverageSource = "dot_bus_lanes_geometry"` in the public release. The card now also displays source text ("NYC DOT bus-lane geometry compared with MTA route shape"), the 45 m midpoint/proximity method, and matched DOT lane type/hour/day values. | — | Same method caveat as KPI `laneCoverage`; domain review still needed for tolerance thresholds and regulatory lane-mileage semantics |
| Bus lane card line "Visible segments need lane-overlap inspection" / "High route-shape overlap…" | **hardcoded** | Renderer if/else on the threshold (80), now framed as route-shape proximity overlap rather than regulatory coverage | — | UI copy |
| Bus lane card line "Use the segment tab to inspect overlap…" | **hardcoded** | Static copy | — | — |
| Bus lane `gap` ("Not regulatory lane mileage" / "Method still needs lane-hour/type review") | **hardcoded** | Renderer if/else | — | UI copy |
| ACE card status / `since YYYY-MM` | real | `aceStatus` + `aceSince` | — | — |
| ACE card lines 2 and 3 ("Check whether speed improves…", "Violation trend data should be attached…") | **hardcoded** | Static copy | — | — |
| ACE card `gap` text | **hardcoded** | Renderer if/else | — | — |
| TSP card status/source line | real for ingested source snapshot / stale-source caveat | Reads `route.tspStatus`, `route.tspCorridor`, `route.tspSourceDate`, source URL, and `route.tspMatchMethod` from the Studio route payload. The card now surfaces the URL when a positive source match exists and names the exact match method instead of a generic route/corridor text-match label. | Current authoritative TSP route/intersection inventory | Same dated-source caveat as `tspStatus`; no current feed or intersection-level signal geometry has been ingested. |
| TSP card recommendation/gap lines | **hardcoded** | Static copy framed as source caveat / review guidance, including that the dated TSP source is not confirmed absence for unknown routes | — | UI copy |
| `InterventionsSection` timeline (`route.interventions`) — year, title, detail, tone, comparison cohort | real / descriptive-method caveat | `buildStudioInterventionsFromComparisons` consumes structured ACE / bus-lane comparison records, drops `source_gap` events, derives title from `interventionType + program`, detail from `comparisonStatus + adjustedSpeedDeltaMph`, tone from sign of the delta, and now exposes `comparisonCohort` with matched route IDs/windows/deltas plus `methodLimitations` when D1 has comparison routes. UI copy says matched comparison routes are not causal proof. | External methodology review before causal language | Structured source-backed events and matched cohorts are emitted, but the product still must not claim causality from the comparison adjustment alone |
| Coverage limits "Structured timeline" value `N` | real | `route.interventions.length` | — | — |
| Coverage limits "Evidence outside timeline = Excluded" | **hardcoded** | Static copy | — | UI copy |
| Coverage limits "Next source layer = Tier 2" | **hardcoded** | Static copy | — | UI copy |
| "Descriptive until reviewed" alert | **hardcoded** | Static copy | — | — |

### Data notes tab (`RouteDataNotesTab`)

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| "Primary window = Current projection" + `${N} segments…` | partial | `segments.length` is real, the "Current projection" string is hardcoded | — | UI label |
| "Route quality" value | real | `quality.confidence` from `StudioQuality` | — | — |
| Route quality sub (caveats or `completenessStatus`) | real | `quality.caveats.join("; ")` from pipeline | — | — |
| "Last generated" date | real | `data.generatedAt.slice(0,10)` from pipeline | — | — |
| Caveats list (5 items: "Speed is observed bus travel speed", "Speed values are projection-backed", "Treatment attribution needs context", "Delay exposure is scoped to route slices", "Data quality travels with the route") | hardcoded / action removed / scope-labeled | Array literal in the page; only `data.generatedAt`, `quality.confidence`, and `route.label` are interpolated. The titles/bodies/scopes are static, now titled "Route evidence caveats"; the non-functional "Apply to brief" buttons were removed. The delay-exposure caveat explicitly says current evidence is visible hotspot/timepoint route-slice segment-month coverage, not hourly passenger-delay or complete stop-to-stop full-route total. The speed-values caveat now discloses that `route.spark` is computed from route-month trend rows. | Per-route caveats from quality/source provenance | No per-route caveat generation; quality.caveats array exists in the schema but is rendered only in the "Route quality" sub field above |
| Datasets table (5 rows: Bus segment speeds, Ridership and delay exposure, Schedule timepoints, Bus lane geometry, ACE program record) | **hardcoded** | Array literal in the page; only the third column ("X timepoint segments", "X avg daily riders · route-slice delay exposure", "X mph scheduled baseline", "X% route-shape lane overlap", "since X / no active record") is interpolated from `route` / `segments` | Real dataset registry per route | Every route renders the same 5 datasets in the same order |
| Dataset citation-count column | removed | The former hardcoded `cited Nx` counts were removed; evidence-ref counts remain only on generated brief evidence | Real per-dataset source/evidence-ref counts from briefs/findings | No citation tracking |

### Renderer-side hints

Even where data is real, several labels overstate what they show:

- **KPI "Observed avg speed"** — label no longer claims ridership weighting, but the schema field is still named `weightedAvgSpeed` and should be renamed in a future contract cleanup.
- **KPI "Nth percentile of public route speeds"** — value is now empirical over public route speeds, and the route payload requires explicit peer-universe metadata through `speedPercentileContext`.
- **KPI "Bus lane overlap"** — the value is now DOT route-shape proximity overlap, not the old stop-count proxy. Route-level method/source detail is now visible on the Interventions card, but the KPI itself remains compact.
- **Overview "Slow-window share by hour"** — the chart now renders `averageHourlySeverity(segments)` directly instead of converting slow-window share into synthetic mph. It is still an unweighted average over visible segment bins, not route-wide hourly speed or passenger-delay exposure.
- **Riders "Monthly boardings" / "Boardings by hour"** — the monthly chart uses `route.ridershipSpark` from monthly ridership history instead of rescaling the speed sparkline, and the UI labels the source month range from `route.ridershipSparkMonths`. The restored hourly chart uses `route.ridershipProfile.hourlyBoardings` from MTA route/hour ridership. `Top stops by daily boardings` is restored as a contract-backed slot, but remains an unavailable empty state until an APC/equivalent stop-level boarding source exists.
- **Riders "Slow share by hour"** — bars are an average over visible segment slow-window arrays; the red AM/PM peak coloring is hardcoded hour windows 7–9 and 16–19 in the renderer, independent of data.
- **Riders "Year over year"** — now renders a real prior-year same-month ridership delta when available and "unavailable" when the comparison row is missing.
- **Overview "Reliability" route vital** — retired from route detail because the underlying value is a threshold on the internal `routeScore`. Generated payload labels now say `Studio high-attention band`, `Studio watch band`, or `Studio lower-attention band`; if this returns as a visible vital, keep the Studio triage/attention framing and do not present it as an authoritative MTA reliability grade.
- **Demo route reliability labels** — Studio sample data now uses the same Studio attention-band wording as the generated release instead of old hand-authored labels such as "Worst SBS route in Manhattan", "Benchmark route", or "Counter-pattern".
- **Data notes "Datasets in use for this route"** — every route shows the same 5 source-family rows, but the fake citation-count column has been removed.
- **Data notes "Route evidence caveats"** — the title no longer says "Route-specific", but the 4 caveats are page-level constants shared by every route.
- **AI Diagnosis Strip** — removed from route detail until a real route-specific driver model or reviewed static artifact exists.

### Design pass — 2026-05-24

`route-detail.tsx` Overview / Riders / Interventions / Data notes tabs were rebuilt against the tarbell `route-detail-tabs.jsx` design. Net new synthetic surfaces exposed by the rebuild:

| Surface | Status | Detail |
|---|---|---|
| Overview speed-trend event markers ("ACE all-day", "Cong. pricing") | removed | The M15-only marker labels were removed. `RouteSpeedTrend` still supports event overlays, but route detail does not pass any events until the API carries intervention-to-month alignment. |
| Overview speed-trend end-point mph label | real | Now reads `route.weightedAvgSpeed.toFixed(1)` at the last spark point. |
| Overview observed-speed-values subtitle | partial / scope-labeled | Computed from `(scheduledMph - weightedAvgSpeed)`; the old `spark.length`-derived "n-month rolling" span has been removed until month boundaries are exposed. |
| Overview "Peak freq." route vital | **placeholder ("—")** | Tarbell shows e.g. "6–8 min"; we have no per-route schedule headway. Renders an em-dash until a schedule-headway field lands on `StudioRoute`. Replaced "Reliability" + "Segments" vitals (those moved out per design). |
| Overview "Corridor" route vital | real | Uses `route.corridor`. |
| Overview AI route briefing block | removed | Tarbell shows AIDiagnosisStrip above tabs and no AI block inside Overview. The duplicated briefing inside the tab was removed, and the remaining m15-only AIDiagnosisStrip was also removed from route detail. Need: a real per-route driver model or reviewed static artifact before restoring this surface. |
| Riders KPI "Daily boardings" label | real (rename) | Was "Daily riders". Same `route.dailyRiders` source. |
| Riders KPI 3rd cell ("{topSegment.from} alone · X% of route-slice measured delay") | partial / scope-labeled | `topShare = topSegment.riderHours / sum(segments.riderHours) * 100` — the share is computed over **visible top segments only** (the segments returned in route detail), not the full route. Inherits partial route-slice delay exposure. |
| Riders "Monthly boardings" chart | partial-real / scope-labeled | `RouteBoardingsTrend` now plots `ridershipSpark` from per-route monthly ridership history and labels the chart with `ridershipSparkMonths`. Service-day denominators are still absent. |
| Riders "Top segments by rider-hours of delay" panel | substitute / real-data | Replaces the Tarbell "Top stops by daily boardings" surface, which can't be filled from public MTA data (see `knowledge/raw/2026-05-25_stop_level_boardings_audit.md` if filed). Ranks the same top-6 segments as the Slow-segments tab by `riderHours`. A small `method` chip carries the tooltip "Stop-level boardings aren't in public MTA data. Segments + rider-hours of delay are the closest honest substitute." The `topStopBoardings` schema slot stays in the contract so this panel can be re-added unchanged once FOIL returns the MTA NYCT DRD 'average day' APC dataset or Bus OD lands at stop grain. `TopStopBoardingList` was removed (unused) — recreate it from git history when stop data lands. |
| Riders "Boardings by hour" chart | route/hour real / stop-hour caveat | Restored from Tarbell. `route.ridershipProfile.hourlyBoardings` carries 24 weekday-average route/hour bins from MTA Bus Hourly Ridership (`gxb3-akrn`). This is not stop-hour APC data. |
| Riders "Slow share by hour" chart | **removed** | Was a weaker proxy of the same insight as "Boardings by hour" and "Top segments by rider-hours". With both of those now wired and honest, the slow-share-by-hour chart is redundant on this tab. The chart component (`HourlyExposureBars`) is still used on the Overview tab. |
| Riders delay-exposure framing alert | partial / scope-labeled | Now names the visible route-slice projection and removes the fake "other miles combined" comparison. Inherits partial route-slice delay exposure. |
| Interventions Before/After panel (PM-peak speed / Slow-window share / Violations per day) | removed | The M15-only tarbell fixture panel was removed. Every route now shows the source/treatment coverage guidance until a real comparison-window endpoint exists. |
| Interventions Before/After "Overlaps cong. pricing" warn chip + caveat | removed | Removed with the M15-only before/after panel. |
| Data notes "Trend points" header cell | partial / scope-labeled | Replaces the old "Trend window" cell. Value is `${spark.length} values`; sub says observed monthly speed values and labels the source month range from `sparkMonths`, without reviving tarbell's broader trend-window claim. Need: richer `trendWindow.startMonth/endMonth` metadata if the product wants a first-class trend-window object. |
| Data notes "Last refreshed" green dot | partial | Always rendered with `good={true}`; tarbell shows it only when "all datasets current". Need: per-dataset freshness boolean in quality payload. |
| `BeforeAfter` component `width` prop | n/a after removal | The route-detail M15 before/after panel no longer imports `BeforeAfter`; the component remains available elsewhere but is not part of this page's public evidence surface. |

## Route Ladder page — `/routes/$routeId/ladder`

API endpoint: `GET /api/v1/studio/routes/{slug}/ladder`
R2 projection: `routes/{slug}/ladder.json`
Payload type: `StudioRouteLadderResponse` = `{ schemaVersion, generatedAt, route: StudioRoute, segments: StudioSegment[], quality }`.
Builder: `buildStudioRouteLadderProjection` in `packages/domain/src/studio-projections.ts` — a pass-through of `route` plus `routeSegments(release, route.slug)`. No ladder-specific data shaping.

`StudioSegment` fields (speedMph, scheduledMph, lane, ace, tsp, hours, riderHours, flagged, etc.) are documented in the existing inventory and are NOT re-audited here. The table below covers only fields specific to this page: the `StudioRoute` fields the ladder actually renders, the hardcoded narrative blocks, and the client-side derived annotations.

### Ladder-specific fields

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `route.label` | real | `routeLabel(readiness)` in `studio-release.ts:buildRoute` — derived from GTFS route_short_name | — | — |
| `route.sbs` | partial | `readiness.routeId.includes("+") || routeShortName.includes("SBS")` — string heuristic on the route id, not a sourced SBS roster | Authoritative SBS route list (MTA/NYC DOT) | No SBS dataset ingested; heuristic is correct for current MTA naming but is not a sourced classification |
| `route.corridorFull` | real | `readiness.routeLongName ?? routeShortName` — straight from GTFS `route_long_name` | — | — |
| `route.borough` | partial | `routeBorough(readiness.routeId)` — string-prefix lookup (`M`/`Bx`/`B`/`Q`/`S` → borough name) | Borough(s) the shape actually touches | No GIS join of route shape to borough boundaries; some routes cross boroughs (e.g. Q/Bx bridges) and would be mislabeled |
| `route.endpoints.start` | real | Generated R2 release uses the nearest timepoint stop to the primary in-effect shape's first endpoint. | Direction-aware labels if the product needs directional geography | Current label is the selected primary-shape endpoint, not a full branch list |
| `route.endpoints.end` | real | Generated R2 release uses the nearest timepoint stop to the primary in-effect shape's last endpoint. | Direction-aware labels if the product needs directional geography | Current label is the selected primary-shape endpoint, not a full branch list |
| `route.miles` | real when geometry summary is present | Generated R2 release converts the longest in-effect MTA route-shape `shape_length` to miles. | Complete route-shape snapshot coverage in the release build | Routes missing source shape snapshots still fall back to a coarse readiness-derived value |
| `route.stops` | real | `readiness.stopCount` from GTFS | — | — |
| `route.slug` | real | `routeIdToSlug(readiness.routeId)` | — | — |
| `route.direction` (in "Selected segment" rail: `NB`/`SB`/`EB`/`WB`) | partial | `segment.direction` — origin not audited here; see `StudioSegment` (preserved from `topSegments[].direction` upstream) | — | — |
| `topImpactId` ("Top visible delay" badge + analyst-challenge correct answer) | **derived client-side** | `[...segments].sort((a,b) => b.riderHours - a.riderHours)[0].id` — sort by served `riderHours` on the client. Regenerated segment evidence ranks the observed timepoint universe, but route/hour ridership remains the denominator. | Stop/segment boarding-weighted ranking if needed | No APC/equivalent boarding counts |
| Speed-bin coloring (`< 5` red, `< 6.5` warn, else neutral) and legend rows | **hardcoded** | Thresholds 5.0 and 6.5 mph embedded in `route-ladder.tsx` (`bad`/`warn` consts) and again in legend `LegendRow` copy. The legend no longer labels these as service-quality standards; it calls them visual bands. | A defended speed threshold (e.g. from an MTA service standard or empirical distribution) | No thresholding policy defined in the project; numbers are renderer bands |
| Spine coloring (lane = full/partial/none) | inherits geometry-backed `lane` | Maps `segment.lane` to color; the generated public release now derives that value from DOT bus-lane geometry overlap and audits it in both route detail and route-segment API projections. Selected ladder segments now show exact overlap share, matched DOT lane-piece count, and route-shape slice source/method/vertex metadata; the API records also carry matched DOT lane type/hour/day arrays. | Domain-reviewed lane rendering | Ladder still summarizes the lane state visually rather than rendering all lane type/hour values inline |
| Story rail copy | removed | The static M15/Madison story rail and route-specific gating exception were removed on 2026-05-25. | Per-route narrative generated from the actual ladder data or a reviewed static route brief | No per-route narrative generator on the ladder builder, so the UI hard-cuts to no story rail instead of maintaining a demo exception |
| "Mar 2026 · weekday median" label in Selected-segment rail | removed / relabeled | The right rail now says `generated route-slice projection` and does not display a hardcoded month or weekday-median claim. | The actual analysis month and aggregation method | Month/aggregation still are not carried in `StudioRouteLadderResponse`; `release.generatedAt` is the only date available and is not the analysis period |
| "mph weekday avg" label (selected segment) | relabeled | The selected-segment KPI now says `mph observed avg`; backing value remains `segment.speedMph`. | A weekday-vs-weekend split or labeled weekday aggregate if weekday language returns | Pipeline emits a single average speed, not a weekday median |
| Delay-exposure color/tier thresholds (`> 15000` / `> 10000`) in selected-segment KPI | removed | The selected-segment KPI now labels exposure relative to the visible route-slice max (`highest visible segment`, `more than half of visible max`, or `below half of visible max`) and colors only the visible max. | A defended delay-exposure severity threshold or generated quantiles | No quantiles are carried in the ladder payload |
| "top impact" badge | derived / relabeled | `segment.id === topImpactId` — only the single highest-`riderHours` visible segment, now labeled `Top visible delay`. | — | — (inherits `riderHours` partiality and visible-route-slice scope) |
| Analyst challenge result ("✓ Correct" / "Not quite") | derived | Pure client-state comparison of `guessId === topImpactId`; no telemetry, no scoring data | — | — (purely a UI affordance; correctness depends on `riderHours` ranking blocker above) |
| "Open route brief" button | n/a | Navigation only to `/briefs/new?route=`; it no longer implies the selected segment has been persisted into a draft. | — | — |
| "Compare similar segments" + "Open hour-by-hour breakdown" buttons | removed | The disabled design placeholders were removed on 2026-05-25 rather than kept as visible incomplete API affordances. | A peer-segment matching endpoint and a per-segment hour-by-hour view | No similar-segment matching exists; no hour-by-hour endpoint exists |
| `quality` | real | `release.quality` — readiness/coverage metadata from the build job | — | — (not rendered on this page at all, despite being in the payload) |

### Renderer-side hints (labels that overstate the data)

- "Observed speed" column header (line 140): the underlying value is `weightedAverageSpeedMph` for the full analysis window, not a fresh observation; same caveat as on the route detail page.
- "mph observed avg" now avoids weekday-median language; the underlying value is still a single analysis-window average.
- The selected-segment rail no longer displays hardcoded `Mar 2026 · weekday median`; it uses a scope label because the ladder payload does not carry an analysis month or aggregation method.
- The left rail and endpoint banners no longer claim north/south orientation, and the Studio API now uses neutral `endpoints.start` / `endpoints.end` fields.
- "Story" rail: removed on 2026-05-25. Replace only when a per-route narrative field or reviewed route brief artifact exists.
- "Spine = DOT lane overlap" legend AND the per-segment spine coloring now rendered in the body: both present `lane` (full/partial/none) as a sourced classification. The value is now DOT geometry-backed in generated public projections, but the ladder still hides `laneOverlapShare`, `laneMatchedCount`, and tolerance caveats.
- `route.miles` in generated R2 route/detail projections is now a measured MTA shape length when route-shape snapshots cover the route.
- Speed legend bands are now labeled as lowest/middle/upper bands, but the thresholds are still hand-picked in the renderer.
- The misleading "use the time window pill above to compare past months" prompt was removed in the 2026-05-24 design pass — the pill itself is deferred (no historical-months data plumbed to the ladder endpoint).
- "Compare similar segments" / "Open hour-by-hour breakdown" buttons were removed on 2026-05-25 instead of keeping disabled placeholders for endpoints that do not exist.

### Notes on the projection itself

`buildStudioRouteLadderProjection` returns the **same** `route` and `segments` as `buildStudioRouteProjection` — there is no ladder-specific aggregation, ordering, or annotation on the server. Every ladder-only signal (visible top-delay ranking, spine coloring, endpoint orientation, severity bins) is computed in the renderer from the same data the route-detail page receives. This means there is nothing new the ladder API exposes that the segment inventory hasn't already captured; the ladder's remaining synthetic surface is mostly in the **renderer** (hardcoded speed thresholds, no analysis-window field) and in the **`StudioRoute` fields** (`borough`, `sbs`) that the segment inventory previously skipped.

### Design pass — 2026-05-24

The ladder was rebuilt to match the tarbell `ladder.jsx` 7-column horizontal layout (mph number / speed bar with scheduled tick / spine + node / treatment glyphs / segment name / route-slice delay-exposure bar / route-slice delay value) plus endpoint caps and per-segment spine coloring. This is a UI-only change — no pipeline modifications. The rebuild exposed new synthetic surfaces that didn't exist before because the prior renderer didn't visualize the underlying data; record them here so the next pass at `studio-release.ts` or `StudioRouteLadderResponse` knows what to fix.

| Surface | Status | Behavior | Real data needed | Blocker |
|---|---|---|---|---|
| Speed-bar normalization | derived client-side | Speed-bar width now normalizes against the maximum observed/scheduled speed among visible ladder segments, removing the old M15-tuned `MAX_MPH = 9` constant. | Server-provided route/window scale if cross-route visual comparability matters | No precomputed speed scale or quantile is shipped on the ladder payload |
| Delay-exposure bar normalization | derived client-side | Bar width now normalizes against the maximum `riderHours` among visible ladder segments, removing the old M15-tuned `MAX_RH = 20000` constant. | Server-provided route/window scale if cross-route visual comparability matters | No precomputed exposure scale or quantile is shipped on the ladder payload |
| Scheduled-speed tick mark | inherits `scheduledMph` | Tick offset uses the same visible-segment speed scale as the observed-speed bar. Visualizes the segment scheduled comparison carried in the projection. | Real per-timepoint scheduled speed from GTFS `stop_times` for every visible segment | Public Studio routes now require schedule-comparison coverage for visible route-slice segments, but the ladder still does not expose schedule method details inline |
| Per-segment spine coloring (full/partial/none) | inherits `lane` | Each spine segment in the ladder is colored by that segment's DOT geometry-backed `lane` classification; selected segment details now show exact overlap share, matched DOT lane-piece count, and a route-shape slice preview sourced from the generated `segmentGeometry` LineString when available. | Lane type/hour semantics if the DOT lane inventory is expanded | Main `lane` blocker is closed for public route-slice segments; route-level overlap uses the same proximity method and still is not regulatory lane mileage |
| Tier label in right-rail delay-exposure card | derived client-side | The old `top decile route-wide` / `top quartile route-wide` labels were removed. The card now compares the selected segment only to the visible ladder max. | Defended decile/quartile policy or per-route quantile | No quantile precomputed in the projection |
| "Window" time-window pill | **deferred** | Removed in this pass; the misleading "use the time window pill" prompt is also gone. Design includes a 12-month pill with intervention markers | Past-month per-segment speed data wired into `StudioRouteLadderResponse` | Historical months not plumbed through the ladder endpoint; `release.generatedAt` is a single point in time |
| Selected-segment sparkline + "14 days ago → today" axis | **deferred** | Design includes a 14-day trend sparkline above the hour strip; not implemented | Per-segment daily/weekly trend series | No per-segment trend series in the pipeline; only month-aggregate values |
## Route Annotate page (`/routes/$routeId/annotate`)

Source: `apps/web/src/studio/pages/route-annotate.tsx`. Renders `RouteHeaderCompact`, a list of `SegmentRow`s with an inline selected-segment evidence panel, and a right rail that links to D1 draft creation. Scope: only fields introduced by this page (the underlying `StudioSegment` and `StudioRoute` fields are audited in `synthetic_data_inventory.md` and are not re-audited here).

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| Page title `route.corridorFull` + meta `"{borough} · annotating"` | real | `route.borough`, `route.corridorFull` from `StudioRoute` | — | — (the literal word "annotating" is a UI mode label, not data) |
| `D1 DRAFT` badge | hardcoded copy | static JSX | — | — (UI affordance, not data) |
| Section heading "Route-slice delay segments" | hardcoded copy / scoped label | static JSX; underlying list still comes from the served `segments` array ordered by the route-detail projection; the selected-segment metric card also labels the value `Route-slice delay` | — | UI label only |
| Visible-row cap `segments.slice(0, 5)` and "Showing 5 of N timepoint segments" | hardcoded | literal `5` in renderer | — | — (presentation choice; pipeline emits up to 8) |
| Initial `selectedId` (defaults to first `flagged` segment, else first) | derived | uses real `segment.flagged` | — | — (logic, not displayed data) |
| Right-rail title/subtitle | hardcoded workflow copy over real route fields | Renders `"D1 draft workflow"`, route label + `route.corridor`, and says draft creation uses the generated route brief; the visible copy no longer mentions local sketch state | Real associated current draft id/count once `StudioRouteDetailResponse` exposes it | Route detail still does not carry "latest draft for route" metadata |
| Selected segment metric card | real for audited public release / route-slice caveat | Uses selected `StudioSegment` speed, scheduled speed, delay exposure, and lane category | Complete route-wide segment universe and method detail for lane overlap | Same blockers as `StudioSegment` inventory |
| Inline selected-segment evidence panel | partial-real / template | Shows deterministic release-fact strings from selected segment speed-vs-schedule, delay exposure, and DOT lane category. These are not clickable local claim seeds. | Server-ranked per-segment evidence recommendations if this becomes an authoring surface | Current page is inspection plus D1 draft entry only |
| `Create D1 route draft` links | real navigation/write entrypoint | Links to `/briefs/new?route={route.slug}`; that route creates a persisted D1 draft from the generated route brief through `POST /api/v1/studio/briefs` | Inline segment-to-claim write action, if desired later | No selected-segment anchor is carried into the create request |

### Renderer-side hints

- Local claim state, `seedClaim`, `ClaimList`, first-seed ranking, `D1 SEED` labeling, and generated-brief id helpers have been removed from this page.
- Segment facts now expose lane geometry overlap share and matched DOT lane-piece count in selected-segment/treatment context, while still caveating that route-level overlap is not regulatory lane mileage.
- The former pipeline/sample-data `suggestedSeeds` field has been removed from the public `StudioSegment` contract; Route Annotate no longer renders generic seeds.
# Studio Audit — Briefs Gallery (`/briefs`)

**API endpoint:** `GET /api/v1/studio/briefs`
**Renderer:** `apps/web/src/studio/pages/briefs.tsx` → `BriefsGalleryPage`
**Worker handler:** `apps/web/src/worker/index.ts` line ~720 (`loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema)`)
**Projection builder:** `tools/pipeline/src/jobs/build/studio-release.ts` → `buildBrief()` (line 1051) wrapped by `buildStudioBriefsProjection()` in `packages/domain/src/studio-projections.ts:211`
**Payload type:** `StudioBriefsResponse` = `{ briefs: StudioBriefCard[], quality, ... }` where each card = `{ brief: StudioBrief, route: StudioRoute }`

## Big-picture framing

**The brief corpus is not hand-authored AND not analytically derived.** It is **synthesized from a template inside `buildBrief()`** that runs once per route at studio-release time. Every brief object the page renders is constructed in TypeScript code inside the pipeline; there is no `briefs.json` source file, no Markdown corpus, no CMS, no database table of brief content. The pipeline iterates over routes (filtered by readiness/observation gates) and emits one `StudioBrief` per qualifying route by substituting the route's name/speed/lane-coverage numbers into a fixed string template. Only two routes (`m15-sbs`, `bx12-sbs`) get a hand-written title + dek override (the `canonical` block); every other brief has its title/dek auto-generated from the route label.

So on the gallery page: titles, summaries, author lines, and generated dates are still **template/synthetic output**. Release brief status is now a uniform `Generated` provenance label instead of a fake publication state. The UI now labels `brief.evidenceRefCount` as evidence refs because the count follows generated evidence rows with stable source-ref metadata when available, not immutable citation-detail artifacts. Only the route badge metadata (label/sbs/slug) and embedded route metrics are real.

## Fields rendered on the gallery card

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `route.label` (RouteBadge) | real | From D1 `route_brief_summary` via `listRouteBriefSummaries`; passes through `StudioRoute` | n/a | none |
| `route.sbs` (RouteBadge flag) | real | Derived from route metadata in serving DB | n/a | none |
| `brief.status` ("Generated" for release briefs) | generated provenance / hard cutover | `buildBrief()` now emits `"Generated"` for every immutable release brief. D1-backed draft/publish workflow statuses remain separate in the write API. | Real editorial workflow state stored alongside persisted drafts/publish candidates | Browser gallery is still not wired to authenticated D1 workspace reads |
| `brief.title` | template (2 routes) / synthetic (rest) | `canonical?.title ?? \`${route.label} ${route.corridor} reliability brief\`` | Author-written or LLM-drafted title per brief | No brief authoring step in pipeline |
| `brief.summary` | generated / labeled | Release briefs still get a generated metrics summary from `generatedBriefSummary(route)`, but the route-detail `StudioRoute` contract no longer exposes a reusable `diagnosis` field. D1 draft generation now queues Cloudflare Think-backed OpenRouter rewriting when configured; otherwise it records `generationMode = "deterministic_seed"` / `runner = "inline_worker"`. | Reviewed brief-summary authoring and production validation of Think-backed generation | Release briefs still use generated summaries until publish-candidate promotion |
| `brief.authors[]` joined with " - " | generated provenance label | Generated release briefs now use `["Studio release builder"]`, and gallery/reading labels render it as `Provenance` when `brief.status === "Generated"` instead of treating it as a human author byline. D1 draft/publish-candidate reads use `["D1 draft record"]` as the brief-level provenance label, edit-log history versions store the authenticated actor email from the D1 Studio actor token, and review comments expose the stored D1 actor display name while preserving actor email for audit. | Real author attribution | Full public account/user-directory authoring concept remains open |
| `brief.evidenceRefCount` | partial-real | `buildBrief()` now sets this to `evidence.length`; generated briefs currently emit six evidence/caveat rows, generated evidence rows include stable `sourceRefId` / `sourceLabel` values, public `sourceHref` URLs where the backing source URL is known, and generated route-artifact keys/API paths/SHA-256 values where route artifacts are available. The release build fails if the count drifts from the evidence array length. Public gallery/search/reading surfaces label this as evidence refs. The old `citationCount` contract field has been hard-renamed. | Counted citations from immutable evidence artifacts | The count reflects generated evidence rows with source-ref metadata, some source URLs, and generated route artifact refs, not per-claim immutable query/chart payload URLs |
| `brief.generated` | generated release timestamp | Uses the release-level `generatedAt` captured once for the Studio release, not a per-brief publication timestamp. | A real `updatedAt` tied to brief content changes | Release briefs have no persistent identity across builds |
| Link target `/briefs/$briefId` | partial | `id = canonical?.id ?? \`brief-${route.slug}\`` — deterministic per route but not a stable curated id | Stable brief ids | none beyond having real briefs |
| Hero copy ("Generated route-level arguments…") | hardcoded / provenance-labeled | Static JSX in `BriefsGalleryPage`; now says generated evidence rows instead of cited route arguments. Demo fixture summaries also use generated route evidence-ref wording instead of cited-brief wording. | n/a (editorial copy) | none |
| "New brief" CTA | removed | The generic gallery link to `/briefs/new` was removed on 2026-05-25 because unscoped brief creation is not backed by the planned write API. Route/finding-scoped composer links create authenticated D1 drafts through the planned write API. | Route selection flow for unscoped create, if needed | No generic unscoped draft-create flow; route/finding-scoped creation is the supported browser path |
| Read brief link/arrow | hardcoded | Static JSX | n/a | none |

## Renderer-side hints

- **Status badge color hard cutover**: Generated release briefs now render as neutral `Generated` status. Green `Published` remains reserved for real D1-backed published workflow state.
- **"X citations" string**: removed from gallery/search/reading meta; the same count now renders as evidence refs so it does not imply immutable citation-detail artifacts.
- **Author/provenance byline**: generated release cards print `Provenance: Studio release builder`, making the byline provenance explicit instead of implying a human/studio author.
- **Generated timestamp**: every card prints the same release `generatedAt` ISO string. This is intentionally a batch-generated release stamp, not a publication timestamp.
- **No client-side fabrication**: the gallery does not invent or mutate any field; everything misrepresented is misrepresented at the pipeline layer.

## Summary of synthetic field count (gallery card)

Distinct rendered data fields per card: **9** (route badge label, sbs flag, status, title, summary, authors, evidenceRefCount, generated, link id). Of these:
- **real**: 2 (route.label, route.sbs)
- **generated provenance**: 1 (status)
- **partial/generated**: 2 (summary — generated metrics prose local to brief/draft seeding; evidenceRefCount — counts generated evidence rows)
- **template/synthetic**: 3 (title, generated, plus the brief.id used in the link)
- **hardcoded**: 1 (authors)
# Brief workflows audit — `apps/web/src/studio/pages/brief-workflows.tsx`

Audited 2026-05-24. Exports five page components used by these routes:

| Route | Component | Loader payload |
|---|---|---|
| `/briefs/new` | `NewBriefComposerPage` | Loads the generated brief for `?route=` or finding route via `fetchStudioBriefs()` + `fetchStudioBrief(id)`; the no-query path now returns `null` and renders not-found instead of falling back to `m15-madison-corridor` |
| `/briefs/$briefId/edit` | `EditBriefComposerPage` | `fetchStudioBrief(briefId)` → `StudioBriefResponse` |
| `/briefs/$briefId/evidence` | `BriefEvidencePage` | `fetchStudioBriefEvidence(briefId)` → `StudioBriefEvidenceResponse` |
| `/briefs/$briefId/review` | `BriefReviewPage` | `fetchStudioBrief(briefId)` → `StudioBriefResponse` |
| `/briefs/$briefId/history` | `BriefHistoryPage` | `fetchStudioBriefHistory(briefId)` → `StudioBriefHistoryResponse` |

`/briefs/$briefId` itself uses `BriefReadingPage` from a different file (out of scope).

Pipeline source for all brief projections: `tools/pipeline/src/jobs/build/studio-release.ts` → `buildBrief()` (lines 1051–1166) emits the brief; the release-level `versions` array is regenerated each build as a single `v1` entry (lines 1356–1365); `comments` is hardcoded to `[]` (line 1366). Worker handlers at `apps/web/src/worker/index.ts:720-780` just load R2 projections (`briefs/{id}/index.json`, `evidence.json`, `history.json`).

## Brief evidence page (`BriefEvidencePage` — `/briefs/$briefId/evidence`)

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `heading.routeLabel`, `heading.routeSbs`, `heading.title`, `heading.id` | real | From `StudioBrief.title` + linked `StudioRoute` | — | — |
| Header count pills (`Claims`, `Evidence`, `Caveats`) | real | Counts `data.claims`, `data.evidence`, and `data.caveats` from `StudioBriefEvidenceResponse` | — | — |
| Evidence rows | partial-real | Renders each `data.evidence[]` row with `id`, `kind`, `title`, `detail`, optional `sourceRefId` / `sourceLabel` / `sourceHref`, optional generated `sourceArtifactKey` / `sourceArtifactHref` / `sourceArtifactSha256`, and claim refs resolved from `claim.evidenceIds`. The generated release build rejects duplicate evidence IDs, dangling `claim.evidenceIds`, and non-caveat evidence rows without source metadata. The first resolver layer links rows with `sourceHref`, links route artifacts when present, and labels rows without URLs as source-ref-only; generated speed, speed-trend, rider-delay, lane-overlap, and matched TSP source rows now get public source URLs when known, and rider-delay rows can also point to the immutable generated route artifact. | Citation-detail artifacts with URLs/query payloads | Generated evidence rows now carry stable source-ref metadata, public source URLs for major backing datasets, and generated route artifact refs for rider-delay evidence, but still lack per-evidence immutable query/chart artifact URLs |
| Claims using evidence | partial-real | Renders `data.claims[]`, claim body/title, strength, and evidence ids, warning when an evidence id is unresolved | Analyst-authored claim bodies for every generated brief claim | Release claims are still mostly templated titles |
| Caveats | real for payload | Renders `data.caveats[]` with stable `id`, `title`, and `body` fields instead of hardcoded caveat copy. The generated release build rejects duplicate caveat IDs and dangling `claim.caveatIds`. | Richer source-ref/citation anchors per caveat | Caveat ids are stable within the brief/finding contract, but caveats still lack immutable source-ref artifact URLs |
| Source-artifact detail absence panel | explicit absence | Renderer says no hour-by-hour source artifact is attached and does not render a heatmap/computation fixture | A real source-detail artifact with period, method, query, and chart data | `StudioBriefEvidenceResponse` has only claims/evidence/caveats today |

### Renderer-side hints
- The former Madison-specific heatmap, period chips, peak breakdown, computation steps, and caveat fixture are removed. The page now exposes the actual evidence packet and shows absence for missing citation-detail artifacts.

## Brief composer page (`BriefComposerPage` — `/briefs/new`, `/briefs/$briefId/edit`)

`/briefs/new` is a D1 draft creation page: its loader resolves a route/finding seed and the browser calls `POST /api/v1/studio/briefs` to create the persisted draft. The default no-query path fails closed. Generated release briefs on `/edit` also fail closed into D1 draft creation before edit controls are shown.

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `BriefTitleBar` route badge, brief title | real | `route` + `brief.title` from projection | — | — |
| Composer chip (`D1 DRAFT` / `D1 EDIT`) | real workflow framing | Derived from `DraftBriefProvider` mode after the page has loaded a mutable D1 draft-shaped brief response | Richer lifecycle/status labels | The displayed `StudioBrief.status` still compresses draft states to `Draft` / `In review` |
| Header hint (`persisted draft seed` / `writes through Studio draft API`) | real workflow framing | Literal copy naming the D1 write boundary; mutating requests include `Authorization: Bearer {Studio actor token}` and `Idempotency-Key`; draft reads include the same actor bearer token when the id resolves to a mutable D1 draft | Account-backed user/workspace model and autosave timestamps | Current browser auth is scoped operator actor tokens, not public accounts |
| `brief.version` (usually `v1`) | partial-template / real draft/release history | Generated release briefs use hardcoded `"v1"` from `buildBrief()`; D1 drafts carry the stored draft version, each draft write appends an immutable `studio_brief_history_event` snapshot exposed as `draft-1.{eventSeq}` in the history endpoint, and `studio:promote-publish-candidate` writes a promoted release version record from the publish-candidate export | Release version governance tied to deployed R2 promotion/audit records | Local release promotion mints the public version record; remote deploy audit and rollback remain operator workflow |
| Outline `claims[]` (n, title, strength, evidence count, caveat count) | partial-real | Generated release source briefs still begin with templated claims; D1 drafts can now persist added/edited/deleted claims through the browser and canonical read path | LLM- or analyst-authored claims tied to specific evidence with measured confidence | Generated seed claims remain templated until an authoring/generation step replaces them |
| Draft metadata editor | real D1 write | Browser calls `PATCH /api/v1/studio/briefs/{briefId}` for title/dek/summary | Autosave, edit timestamps, and user identity | Current UI is explicit-save and token-authenticated |
| Add D1 claim control | real D1 write | Browser calls `POST /api/v1/studio/briefs/{briefId}/claims`, then reloads the canonical draft read | Rich authoring affordances | Minimal single-title add form |
| D1 claim text/body editor | real D1 write | Browser calls `PATCH /api/v1/studio/briefs/{briefId}/claims/{claimN}` for title/body | Rich text/source anchors and edit history | Plain text fields only |
| Active-claim word count (`claim.body?.split(/\s+/).length ?? claim.title.split(/\s+/).length`) | derived | Renderer derives from the current claim text/body, including persisted D1 edits | — | Generated release seed claims often still have no body |
| Inline evidence-ref count next to claim | partial-real | Renderer shows `claim.evidenceIds.length`; generated claims now attach multiple evidence IDs (`speed`/`rider_delay`/`speed_trend` or `lane_overlap`/`tsp_status`), and resolved evidence rows carry source-ref metadata when generated by the release builder | Richer evidence weighting and source-artifact anchors | Counts are real links within the brief payload, but not yet weighted refs from immutable source artifacts |
| Evidence attached list (`brief.evidence`) | partial-real / D1 write for refs | Pipeline emits generated evidence rows per brief with `sourceRefId` / `sourceLabel`, optional `sourceHref`, and optional route-artifact resolver fields; D1 drafts persist claim `evidenceIds`. Browser attach/detach calls `PATCH /api/v1/studio/briefs/{briefId}/claims/{claimN}` and reloads the canonical draft read. `GET /api/v1/studio/data/evidence?search=&kind=&route=` exposes the release catalog with source-ref metadata and searches `sourceHref` plus artifact refs when present. | A richer analyst-citable evidence library populated from immutable query/chart/source artifacts | Rows are derived from real release metrics/source status and have source-ref ids, public source URLs for key datasets, and some route artifact refs, but still lack per-claim chart artifact URLs / query payloads |
| Evidence kinds shown by glyph (`number` / `chart` / `source` / `caveat`) | partial-real | Generated brief evidence now covers all four kinds: `number`, `chart`, `source`, and `caveat`, with source-ref metadata on release-generated rows. Speed chart evidence uses observed route-month values, and route projections now carry aligned `sparkMonths` / `ridershipSparkMonths` labels. | Artifact-backed charts and caveats | The chart row is a generated value-set summary, not a separately published chart artifact |
| Evidence search query (`pre-seeded from current claim`) | partial-real | Filter input pre-seeded from `claim.title`; the composer now queries `GET /api/v1/studio/briefs/{briefId}/evidence?search=` and fails closed when that server search is unavailable instead of showing local fallback results. The old local `suggestedEvidence` / `otherEvidence` search props have been removed so the inline result groups are derived only from the server response. For D1 drafts, the split evidence endpoint exposes the draft's source evidence/caveat set for search while canonical draft reads still show only attached refs. The public API also supports server-side `?search=&kind=` on the release-level evidence catalog. | A richer analyst-citable evidence library populated from immutable query/chart/source artifacts with source-ref IDs | Backing corpus is richer but still brief-generated rather than a standalone source-ref library |
| Suggested vs. Other split | partial-real | "Suggested" = evidence IDs on the active claim; "Other" = remaining evidence rows from the server-filtered per-brief evidence response. Generated claims now attach multiple evidence rows, so this is no longer a fixed 1-vs-1 split. | Server-ranked evidence recommendations against claim text | Composer UI still partitions the server-filtered response by current claim evidence IDs instead of receiving relevance-ranked recommendation groups |
| Caveat refs panel | partial-real / D1 write for refs | Shows the active claim's resolved caveat refs by stable `ClaimCaveat.id`; the composer queries `GET /api/v1/studio/briefs/{briefId}/evidence?kind=caveat&search=` for the source-backed caveat set, renders canonical caveat ids/bodies, and can attach/detach caveats through `PATCH /api/v1/studio/briefs/{briefId}/claims/{claimN}` with `caveatIds`, then reloads the canonical draft read. Draft evidence reads resolve caveat refs by id instead of array position/title, and the Worker rejects caveat IDs that are not present in the draft's source caveat set. | Real caveat library with source anchors and richer caveat authoring | Caveat refs are referential, but caveats still lack immutable source-ref artifact URLs and dedicated create/edit semantics |
| `EvidenceInspector` Numbers/Charts/Sources/Caveats tab counts | partial-real | Real counts of generated brief evidence rows by kind plus caveats; evidence rows display source-ref labels, source URL resolver links when `sourceHref` exists, generated artifact resolver links when `sourceArtifactHref` exists, and source-ref-only labels otherwise | — | Evidence rows still lack most per-evidence query/chart artifact payloads |
| Claim score panel | partial | Renders `claim.strength` as `/100`, converts it to 5 bars only for the visual control, and colors by score thresholds | A documented claim-strength rubric or real review score | Score generation remains heuristic/template-backed |
| Strength rationale | explicit absence | Shows local evidence attachment count + caveat ref count and says contradiction analysis is not run | LLM critique or rule-based analysis of the claim | No rationale/contradiction generator in pipeline |
| `Open review view` button | navigation only / explicit | Navigates to `/review`; review request itself is now a D1 write button on the review page | Rich workflow transition model | Reviewer assignment/identity remains minimal |

### Renderer-side hints
- The composer now writes through the D1 draft API and no longer carries local-only draft/edit state.
- Claim score display now uses the pipeline's 0–100 scale; the 5-bar control is only a normalized visual.
- Caveat text is no longer matched by array index or title. `ClaimCaveat.id` is now part of the contract, generated briefs use `generated`, finding-seeded drafts preserve the source finding caveat id, and the evidence inspector displays the canonical caveat id.

## Brief review page (`BriefReviewPage` — `/briefs/$briefId/review`)

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `BriefTitleBar` route badge + brief title + `brief.version` | real | From projection | — | — |
| Status chip | real for payload status | Renders `brief.status.toUpperCase()` with tone derived from the response status, instead of always claiming `IN REVIEW` | Richer lifecycle labels when draft/review state is persisted | Release briefs now use generated provenance; published status is reserved for D1 workflow state |
| Hint | partial-real | Shows persisted review comment count from `data.comments`, or says no persisted review comments; no fake "sent 2 days ago" timestamp remains | Real submission/review timestamps | Review-request timestamp is not exposed separately from comment time |
| `ReviewerStack` | partial-real | Derived from persisted response comments; no hardcoded `JL`/`SR`/`CP` reviewer fixture remains. D1 review/publish actions require a Studio actor token with review/publish scope, store the actor email for audit, and show the persisted actor display name for review comments. | Real user/workspace identity with assignment + decisions | Actor-token auth is not a full account model |
| Validate button | real D1 write | Calls `POST /api/v1/studio/briefs/{briefId}/validate` and displays the returned validation score | Rich validation detail UI | Current UI only shows the score badge and write errors |
| Publish candidate button | real D1 write | Calls `POST /api/v1/studio/briefs/{briefId}/publish`; Worker blocks unresolved evidence issues and marks the draft `publish_candidate` | Operator promotion into release artifacts | Publish candidate is a D1 status plus exportable candidate artifact payload; public release cutover is a separate pipeline action |
| Export candidate button | real D1 read/export | Shows after publish-candidate state, stays disabled until `/auth/me` verifies an actor with `write:briefs` + `publish:briefs`, and calls `GET /api/v1/studio/briefs/{briefId}/publish-candidate`; UI displays the returned `studio/v1/publish-candidates/{briefId}.json` artifact key plus candidate id, version, published date, and export date | Production R2 upload/deploy step after local promotion | `studio:promote-publish-candidate` now persists/imports the artifact into local `studio/v1` projections, but remote R2 upload still runs through the serving release publish path |
| Retract candidate button | real D1 write | Shows only when draft-backed canonical reads expose `draftStatus = "publish_candidate"` or `"published"`, stays disabled until `/auth/me` verifies an actor with `write:briefs` + `publish:briefs`, calls `POST /api/v1/studio/briefs/{briefId}/retract`, reloads the canonical draft read, and clears stale publish-candidate export metadata from the UI | Release rollback/promotion UI beyond mutable draft state | Retraction covers mutable draft state; promoted-release rollback is still separate |
| Comment badge count | real for returned comments | Counts unresolved entries in `data.comments`, including persisted D1 review-request comments after canonical reload. Immutable release projections emit `comments: []`. | Real reviewer assignment/comment model in the UI | Reviewer display names come from D1 actor rows and audit email is preserved; assignment/routing is not modeled |
| Change-requested status pill | partial-real / honest absence | Shows `Changes requested by {author}` when a `change-requested` comment exists; the former fake resolve-changes CTA was removed because no resolution endpoint exists | Real workflow action | No backend for resolving review comments |
| Outline with per-claim comment counts | partial-real | Counts response comments for each claim. D1 review-request comments currently map to the first draft claim as a coarse review anchor. | Stable comment anchors for claim/evidence/body ranges | Review API accepts only a message body; reviewer identity comes from the authenticated actor email |
| Active-claim body/title (renderWithHighlight) | partial-real | Renders `claim.body` when present, otherwise `claim.title`; finding-seeded D1 drafts now carry the source finding body, while generated release claims often still have title-only templates | Analyst/LLM-authored claim body for every generated brief claim | Release `buildBrief()` does not yet generate claim bodies |
| Claim evidence review panel | real for referenced evidence | Renders evidence rows by resolving `claim.evidenceIds` against `brief.evidence`; unresolved refs show absence instead of fabricated Madison prose, and source-ref labels display when available | Citation-detail artifacts and anchors | Evidence rows have source-ref ids/labels, but still lack artifact URLs/query payloads |
| Caveat refs panel | partial-real | Shows the count of `claim.caveatIds`; canonical caveat text is resolvable by `ClaimCaveat.id` on the evidence page/inspector | Inline caveat resolution and edit actions in the review panel | Review panel still summarizes counts rather than rendering every caveat body inline |
| Comment thread cards (author, initials, ago, on, body, kind, replies, resolved) | partial-real | Renderer reads persisted `data.comments`; immutable release briefs still have no comments, while D1 draft review requests persist one review comment with the authenticated D1 actor email and display name that canonical draft reads can expose. | Real persisted comments with public user-directory profiles, times, replies, anchors, and resolution actions | Controlled actor-token identity exists; public account profiles, replies, anchors, and resolution actions are not modeled |
| Review request textarea/button | real D1 write / minimal identity | Calls `POST /api/v1/studio/briefs/{briefId}/review` with the saved Studio actor token and typed message; the Worker stores the authenticated actor email plus display name on the persisted comment. | Real reviewer selection, request-change semantics, claim anchors | Actor-token identity only; no public user directory |

### Renderer-side hints
- Review status, hint, and reviewer chips now derive from the payload instead of hardcoded `IN REVIEW` / `sent 2 days ago` / `JL` / `SR` / `CP` fixtures.
- The hardcoded Madison-corridor paragraph has been removed; the claim review pane now renders the actual claim body/title and resolved evidence rows.
- Comment counts and badges read from the response. The review request textarea now persists a D1 review request instead of adding local-only comments.

## Brief history page (`BriefHistoryPage` — `/briefs/$briefId/history`)

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `heading.*` (route, title, version) | real | From `StudioBriefHeadingSchema` projection | — | — |
| Header chip + hint | real for history payload / absence-safe | Renders `HISTORY` / `NO HISTORY` and a count from `data.versions`; no fake `IN REVIEW` state or "last edit 2 hours ago" timestamp remains | Real workflow state + edit timestamp | No workflow lifecycle timestamp in this response |
| `versions[]` list | generated provenance / partial-template | Pipeline emits **one generated entry per release brief** with `v: "v1"`, `date: generated`, `author: "Studio release builder"`, `summary: "Generated from D1/R2 serving projections."`, and real current counts (`claimsCount`, `evidenceRefCount = brief.evidenceRefCount`, `caveatsCount`). D1 draft history uses persisted `studio_brief_history_event` snapshots instead. | Real git/db-backed version history of release edits | Release pipeline rebuilds each generated brief with one provenance record; D1 drafts have the real edit log |
| Selected version state | real / absence-safe | Selects the first returned version when present; empty payloads render an absence panel instead of `v0.4` / `v0.3` fallbacks | — | — |
| Version-diff panel | real when `diffs[]` exists / absence-safe | `StudioBriefHistoryResponse` now always includes `diffs`. Generated release history projections emit `diffs: []`; D1 drafts compute claim diffs from recorded `studio_brief_history_event` snapshots, falling back to source-brief comparison only when there is no prior draft snapshot. The browser copy now describes these as API-provided snapshot diffs instead of claiming every diff is source-to-current. | Multi-version edit snapshots and publish history beyond source-vs-current draft | D1 draft history has append-only snapshots; generated release briefs still have only release-builder provenance unless promoted from a candidate |
| Versions sidebar — `summary` ("Generated from D1/R2 serving projections.") | **template** | Same literal for every brief (release-build constant) | Real change summaries per version | No edit log |
| Versions sidebar — `author` ("Studio release builder") | generated provenance label | First entry of `brief.authors`, now set to a machine-builder label for generated release briefs. D1 draft history uses persisted event actors. | Real author per edit | Full editor identity for generated release briefs remains out of scope |
| Versions sidebar — `claimsCount`/`evidenceRefCount`/`caveatsCount` | partial / relabeled | Real counts from current brief, but identical across the synthetic single-version timeline; `evidenceRefCount` now renders as evidence refs. | Per-version counts | One version exists |
| Selected-version detail card | partial-template | Renders the selected `StudioVersion` summary, date, author, claim/evidence-ref/caveat counts, and points to real diff cards when `diffs[]` targets the selected version. | Per-version persisted edit metadata | Release payload still has one generated version per brief; D1 drafts compare recorded snapshots when prior snapshots exist |
| Open review comments panel | partial-real | Lists unresolved `data.comments` rows returned by the history endpoint; no local comments are invented on the history page | Real comment assignment/resolution model | Release briefs usually return no comments; D1 draft review-request comments can appear with authenticated actor emails |
| `Open in composer` button | real | Tanstack `<Link>` to `/edit` | — | — |

### Renderer-side hints
- Sidebar usually lists exactly one timeline node (`v1`) for generated release briefs because the release builder emits one generated version per brief; the renderer no longer pretends there are comparison versions.
- Claim-by-claim diffs render only from `data.diffs`. D1 drafts can show recorded before/after snapshot diffs, with a source-brief comparison used only when there is no prior draft snapshot; release briefs explicitly show that no diff artifact was returned.

## Cross-cutting notes

- The React workflow pages now use the D1-backed draft API for create, metadata edit, claim add/edit/delete, evidence attach/detach, validation, review request, and publish-candidate actions. Remaining local state is form/input state before explicit save, selected claim UI state, and the write token stored in session storage.
- `StudioComment.replies` is in the Zod schema but the pipeline never emits any; only seen if a fixture is hand-edited.
- `claim.body` (optional in schema) is not populated by generated release `buildBrief()` claims, though finding-seeded D1 drafts now copy the finding body into the persisted draft claim. The review page now renders `claim.body` when present instead of a hardcoded Madison paragraph.
- The `/briefs/new` loader now resolves a route/finding seed, the page creates a persisted D1 draft from that seed, and then navigates to `/briefs/{draftId}/edit`. The unscoped path fails closed, and generated release `/edit`/`/review` views require creating a D1 draft first.
- Templated AI/analyst claims (counted): pipeline emits **2 templated claims per route** in `buildBrief()`; the history page no longer adds Madison diff narratives, the former Review-page Madison paragraph has been removed, and the Evidence page no longer adds a Madison citation-detail fixture. Remaining brief claims are mostly generated template titles until an analyst/LLM claim-authoring step lands.

### Brief surface design pass — 2026-05-24

Rebuilt the full brief surface (Gallery / Reading / Evidence / Composer / Review / History / Annotate) against tarbell `brief-first.jsx`, `brief-lifecycle.jsx`, and `authoring.jsx`. Net new synthetic surfaces / removed surfaces / new fixtures:

| Surface | Status | Detail |
|---|---|---|
| Gallery filter chip counts (`All (N)` / `Published (N)` / `In review (N)` / `Drafts (N)`) | removed | These chips looked like filters and relied on workflow states the release payload does not actually carry. The gallery now shows one generated-release count. |
| Gallery featured "Evidence at a glance" panel | removed | No `featured` field or `featuredBriefId` exists in the response. |
| Gallery first card pinned as "featured" | removed | The gallery now renders all release briefs uniformly instead of promoting `briefs[0]`. |
| Reading view 3-col layout (Contents / article / Evidence-in-view) | layout-only | Pure layout change; no new fields. |
| Reading view "Contents" outline | partial / active-state removed | Numbered from `brief.sections.map((_, i) => i+1)`. No active section is highlighted until scroll-spy or an API/UI state exists. |
| Reading view Meta panel (Provenance or Authors / Generated / Revision / Evidence refs / Caveats) | partial | All 5 rows are real from `brief.authors`/`brief.generated`/`brief.version`/`brief.evidenceRefCount`/`brief.caveats.length`; generated release briefs label the builder row as `Provenance`. The brief contract and UI now say evidence refs instead of citation count. **Removed** tarbell's "Data window" row because `StudioBrief` has no data-window field. |
| Reading view "Brief evidence" right rail | partial | Shows the first 3 entries of `brief.evidence`, labeled as first payload rows rather than section-pinned evidence. |
| Reading view removed surfaces | n/a | Dropped the `outline/claims` mode toggle, the strength-meter slider, the per-claim include/exclude checkboxes, the KPI strip at top of article. None of these exist in tarbell BF_Reading — they were unique to our earlier reading view. |
| Composer `D1 DRAFT` / `D1 EDIT` chip + hint | real workflow framing | Varies by `mode` from `DraftBriefProvider` and names that browser edits write through the Studio draft API. |
| Composer state lifted to `DraftBriefContext` | n/a | Architectural change; no new synthetic surface. Context now owns active claim UI state plus D1 write actions for metadata, claims, and evidence refs. Composer/history labels now render evidence-ref counts instead of citation/cite labels for these generated refs. |
| Review state lifted to `ReviewBriefContext` | n/a | Same — `comments` / `selectedClaimN` / `composerDraft` plus D1 review/validate/publish actions are context-injected. |
| Review change-requested status pill | partial | Renders only when an unresolved `change-requested` comment exists, picks the first one, and no longer looks like a resolve action. ReviewerStack initials now come from response comments, not hardcoded reviewer fixtures. |
| History "A (compare) / B (this)" badges | new | Renderer-only — labels the two highlighted versions in the timeline. No data added. |
| History delta summary | real when `diffs[]` exists / absence-safe | The history page renders the API-provided diff summary and per-claim before/after rows for D1 source-brief drafts. Generated release histories still show no-diff absence text. |
| Evidence page period chips / computation steps / caveat fixture / AM-Mid-PM-Evening breakdown / "Citation [2]" Madison title | removed | The evidence page now renders `claims`, `evidence`, and `caveats` from `StudioBriefEvidenceResponse`; source-artifact detail UI remains an explicit absence panel until a real artifact exists. |
| Annotate page selected-segment outline (2px accent) | n/a | Pure styling — adds `outline outline-2 outline-accent` on the active row, no new data. |
| Annotate page selected-segment evidence pointer triangle | n/a | Pure styling — adds the `-top-[7px]` pseudo-triangle so the popover visually anchors to the selected row. |

`components/brief/HeaderBar.tsx` is landed but currently **unused** — the composer/review/history pages still use their page-local `BriefTitleBar` / `BriefHeadingBar` because the schemas they take (one `StudioBrief`, one `StudioBriefHistoryResponse["heading"]`) have slightly different shapes. Migrating both call sites onto `<BriefHeaderBar>` is a follow-up — leaving for now to keep this pass surgical.

## Findings Feed — `/findings` (`GET /api/v1/studio/findings`)

Served `findings.json` has **50 findings**: 2 hand-authored fixtures (`buildReviewedFinding`, B25 / BX41) and 48 promoted detector outputs (`buildPromotedFinding`). All currently `publicationState=reviewed`, all category `Emerging risk`. `GET /api/v1/studio/findings?routeSlug=` now filters the generated projection by canonical Studio route slug for the agent-author walkthrough; the unplanned `route=` alias fails closed instead of becoming a compatibility shim.

### Header / chrome

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| "AI-analyzed" eyebrow + diamond | removed / relabeled | The header now says `Findings projection`; no AI label remains on the feed. | — | — |
| `{reviewedCount} reviewed · {reviewCandidateCount} review candidates` | real (derived) | Counted client-side from `finding.review.publicationState` | — | — |
| Subtitle copy | **hardcoded** | Static prose | — | — |
| Borough filter chips | real / derived | Derived from the boroughs present in `data.findings`, plus `All`; the synthetic `Queens/Brooklyn` option is gone. | — | — |
| Type filter labels | real / derived | Derived from categories present in `data.findings`, plus `All findings`, so empty category filters are no longer shown. | — | — |
| Type filter counts | real (derived) | Counted from `data.findings` | — | — |
| Sort options | removed | The no-op sort rail was removed on 2026-05-25. | Real sort/ranking signal in the API | No sort field or endpoint ordering contract |
| "How findings work" rail | hardcoded / relabeled | Static prose now describes generated/reviewed signals and review badges, without AI or treatment-stack divergence claims. Empty-state copy uses neutral finding rows rather than overclaiming reviewed-only results. | Richer methodology payload if this becomes source-specific | — |

### Per-finding card

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `route.label`, `route.sbs`, `route.borough`, `route.slug` | real | From `StudioRoute` | — | — |
| `finding.category` badge | **partial** | manual: hand-coded "Emerging risk"; promoted/detector: `detectorCategory()` keyword rule on `reasonCode` | Validated taxonomy | User-facing taxonomy still needs review |
| Severity left-border color | **hardcoded** | Pure category-to-color switch | — | — |
| Review badge label/variant | real (derived) | From `review.publicationState`; labels hardcoded | — | — |
| `finding.title` | **template / partial** | manual: authored; promoted/detector: `${route.label}: ${humanizeReason(reasonCode)}` | LLM-authored titles | No LLM step |
| `finding.body` | **template / partial** | manual: authored; promoted/detector: upstream `candidate.claimText` | Real summary text | Inherited template upstream |
| `finding.metric` | **partial / inconsistent units** | manual: "78.18% long-gap share"; promoted/detector: `${Math.round(detectorScore)}/100` | Canonical per-finding KPI | Manual and detector paths use different scales |
| Confidence display | real enum / relabeled | The fake analog `ConfidenceBar` was removed; cards now show the `finding.confidence` enum as text. | Real calibrated probability | Calibration computed upstream (`addFindingContextAppendix`) but not exposed as a numeric model |
| `finding.confidence` (driving bar) | **partial** | manual: hand-coded "high"; promoted/detector: upstream coarse bucket | Calibrated score | Renderer collapses to 1 bit |
| "Open route" link | real | `route.slug` | — | — |

### Renderer-side hints

- The former "AI-analyzed" eyebrow has been removed.
- The former sort rail has been removed until the API carries a real sort/ranking contract.
- Type filters now derive from categories present in the payload, so empty category filters are no longer shown.
- The fake analog confidence bar has been replaced with the `finding.confidence` enum text.
- Severity border + category badge color are category lookups, not severity.
- Borough filters now derive from payload boroughs.
- Metric column mixes three units across the three production paths.

### Payload waste

`finding.reasoning[]`, `finding.caveat`, `finding.comparableRoutes`, most of `finding.review` ship to the client but are only consumed on the detail page.
# Finding Detail page

**Route**: `/findings/$findingId`
**Component**: `apps/web/src/studio/pages/finding-detail.tsx`
**API endpoint**: `GET /api/v1/studio/findings/{findingId}`
**Worker handler**: `apps/web/src/worker/index.ts` lines 701-718 (loads R2 projection `findings/{id}/index.json` built from `findings.json` index check)
**Pipeline source**: `tools/pipeline/src/jobs/build/studio-release.ts` — `buildReviewedFinding` (hand-written), `buildPromotedFinding`, `buildDetectorFinding`, then `addFindingContextAppendix` decorates reasoning steps.
**Payload type**: `StudioFindingResponse` (`packages/domain/src/studio-schemas.ts:401`)

Findings come from one of three code paths, classified below. The former generated route-score fallback was removed in the hard cutover, and the schema no longer accepts `generated_candidate` / `route_score_fallback` review metadata:

1. **Manual review** (`buildReviewedFinding`) — hard-coded `if (routeId === "B25") { return {...} }` and same for BX41. The narrative prose, citation text, percentages (`78.18%`, `81.36%`), sample counts, and "162 DOT permit touches in March" claims are all string literals in TypeScript. The numbers were apparently derived from a real analysis but are not regenerated from data — they will not update if upstream data changes.
2. **Promoted finding** (`buildPromotedFinding`) — populated from `data/artifacts/findings/{month}/promoted-findings.json` written by the promotion pipeline; carries real `detectorScore`, `claimText`, `approvedEvidenceRefs`, and audit hashes.
3. **Detector review queue** (`buildDetectorFinding`) — populated from `data/artifacts/findings/{month}/review-queue.json`; `claimText` is the detector's own text.

The renderer treats all three identically and now labels the trail as evidence steps, not AI reasoning.

## Field-by-field

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `route.label`, `route.sbs` (RouteBadge) | real | from `StudioRoute` projection | — | — |
| Category chip (`Anomaly` / `Treatment gap` / `Emerging risk`) | partial / hardcoded | manual reviewed findings: hand-set. Detector/promoted: `detectorCategory()` keyword match on `reasonCode` substring. No analytical model behind the label. | A real anomaly/treatment-gap/risk classifier with thresholds + significance test | No detector taxonomy mapped to user-facing categories; classification is a 1-line heuristic |
| Review-state badge (`Review candidate` / `Reviewed`) | real | from `finding.review.publicationState`, which is set per code path; "reviewed" is only assigned by `manual_review` or `promoted_finding` paths | — | — |
| `finding.title` | hardcoded (B25/BX41), real/template (detector/promoted) | manual findings: string literal. Detector/promoted: `\`${label}: ${humanizeReason(reasonCode)}\`` | LLM- or template-driven title from observed signal | — |
| `finding.reasoning.length` shown as "N steps" | real / relabeled | Counts reasoning-step array slots. It no longer claims the count is distinct sources. | — | — |
| `finding.confidence` ("high" / "moderate") shown as "X confidence" | partial / hardcoded | manual reviewed: hardcoded `"high"`. Detector/promoted: passes through detector's own confidence string. No calibration. | Calibrated confidence (probabilistic detector output or reviewer-assigned tier) | No confidence model in pipeline |
| `finding.review.detectorId` (appended to header) | real (when present) | populated from detector artifact / promoted finding; `null` for manual findings | — | — |
| Reasoning step `index` | real | sequential | — | — |
| Reasoning step `title` | hardcoded / template | manual: hand-written ("Persistent reliability", "March speed evidence"). Detector: 2 fixed titles. Appendix steps: 5 fixed titles. | — | — |
| Reasoning step `detail` (the narrative body) | **mixed**: real numbers for B25/BX41 embedded in literal strings; appendix steps are real-data templated; detector path passes through real `claimText` | See per-path code refs | — | Manual findings carry real-looking numbers but in **frozen text** — not derived at build time |
| Reasoning step `source` (source-ref chip e.g. "D1 route_brief_summary + route-slice artifact") | **template / hardcoded** | All sources are hard-coded strings per code path. The UI labels them as `Source ref` chips rather than citation artifacts. Most generated/manual source refs are not resolvable URLs, row ids, or artifact keys; for promoted findings the source string includes `promoted_finding:{id}` and `review_decision:{id}`, which are real ids. | Per-step source-ref IDs resolvable in the UI | No source-ref resolver UI; chips are static text |
| Reasoning step `tone` (dot color) | partial | hand-set for manual; heuristic for others (e.g. `severity === "high" ? "warn" : "accent"`) | — | — |
| `finding.metric` (large colored number in rail) | partial | manual: hand-written literal (`"78.18% long-gap share"`). Detector/promoted: `\`${Math.round(detectorScore)}/100 detector score\``. The displayed metric and category do **not** have to be related. | Per-finding "headline metric" tied to the detector model | Metric is whatever string the path chose |
| Rail subtitle "PM-peak trend over 14 months" | removed / relabeled | The right rail now says `Finding headline metric` because no finding-level timeframe field exists. | Real time-window description tied to the finding | No timeframe field on `StudioFinding` schema |
| `finding.caveat.title` + `body` (warn Alert) | hardcoded | per code path: `"Detector review candidate"`, `"Reviewer-approved detector finding"`, `"Prioritization finding, not causality"` (B25), `"Reliability-led context finding"` (BX41). All string literals. | — | — |
| `finding.comparableRoutes[]` (entire rail section: peer label, "Reversed/Flat/Still declining", delta, detail) | **always synthetic — section is dead** | Every single code path sets `comparableRoutes: []`. The renderer's `ComparableRouteRow` (with `peer.outcome`, `peer.delta`, `peer.detail`) is never reached in production data. Schema accepts the field but pipeline never populates it. | Real peer-route comparison: matched-pair selection, outcome classification (reversed/flat/declining), delta calculation | No peer-comparison job emits per-finding peers; only `route.peerSlug` (single neighbor) exists |
| "Open {route} route" CTA link | real | `route.slug` | — | — |
| "Start brief from this finding" CTA | real | passes `finding.id` query param | — | — |
| "Save to workspace" button | removed | The non-functional visual affordance was removed on 2026-05-25. | Real workspace feature | No workspace feature |

## Renderer-side hints (misleading labels)

- **"AI reasoning trail"** has been relabeled to **"Evidence trail"** because no LLM-authored chain-of-thought exists in the release builder.
- **"{N} sources"** has been relabeled to **"{N} steps"** because it counts `reasoning.length`, not distinct sources.
- **"{confidence} confidence"** label (line 59) is a 1-of-2 enum (`high` | `moderate`) chosen upstream or hardcoded for manual reviewed findings; not a probabilistic confidence.
- **"PM-peak trend over 14 months"** has been removed; the rail uses a neutral finding-metric label until the schema carries a timeframe.
- **Category chip ("ANOMALY", "TREATMENT GAP", "EMERGING RISK")** is a uniform-style high-contrast label, but the underlying classifier is a substring check on `reasonCode` for detector/promoted findings and hand-set for manual findings.
- **"Comparable routes"** rail section header is rendered only when the array is non-empty — but the array is always empty in the current pipeline. The section is effectively dead UI; readers viewing the React source assume it's a real comparison panel.
- **Source-ref chip text** like `"D1 route_brief_summary + route-slice artifact"` looks like a source pointer but is a static string with no resolvable target.

## Truth claims rendered without backing

Several specific quantitative assertions reach the page as hardcoded TypeScript strings in `buildReviewedFinding`. They are not derived at build time; if upstream data changes the page will keep showing the old number:

- B25 — `"13,700 March samples, a 78.18% long-gap share, 17.7054 wait reliability ratio, and 83.5272 excess wait minutes. Across 38 recovered Bus Observatory months, B25 averaged 79.46% long-gap share."` (`studio-release.ts:943`)
- B25 — `"6.47 mph weighted average speed, 1,973 speed observations, 31,203 bus trips, 1,177,096 ridership exposure, and 10 hotspot segments."` (`:951`)
- B25 — `"strongest B25 hotspot ran eastbound from Tillary St/Cadman Plaza East to Fulton St/Bond St at 4.63 mph, with 96.41% of observed windows classified as slow."` (`:959`)
- B25 — `"162 DOT permit touches in March, including 26 permit-record Fulton Street touches across 14 B25-linked physical street segments"` (`:967`)
- BX41 — `"5,848 March samples, an 81.36% long-gap share, 17.3109 wait reliability ratio, and 97.8653 excess wait minutes. Across 38 recovered Bus Observatory months, BX41 averaged 82.37% long-gap share."` (`:1003`)
- BX41 — `"200 DOT permit touches in March. The 62 permit-record Webster Avenue touches span 14 BX41-linked physical street segments, 10 of which are also named WEBSTER AVE in the route-LION bridge."` (`:1027`)
- B25 metric chip — `"78.18% long-gap share"` (literal); BX41 — `"81.36% long-gap share"`. The big colored number top-right is a string constant.

The `comparableRoutes` UI block (peer outcome="reversed" / `+0.4 mph` style deltas, "8 comparable routes" type framing) has fully rendered React with three outcome states (`reversed`/`flat`/`declining`), color coding, and per-peer detail text — but receives an empty array from every code path, so users never see it. The capability is wired but unsourced.
## Compare page — `/compare?a=…&b=…`

API endpoint: `GET /api/v1/studio/compare?a={slug}&b={slug}` (worker handler at `apps/web/src/worker/index.ts:660`). Response type: `StudioCompareResponse` = `{ schemaVersion, generatedAt, routes: [StudioRoute, StudioRoute], deltas: { speedMph, riderHoursLost, laneCoverage }, quality }`. The worker loads the canned `routes.json` projection and feeds two routes (looked up by URL slug, **no peer-similarity selection**) into `buildStudioCompareProjection` (`packages/domain/src/studio-projections.ts:164`), which just packages the two routes and computes three scalar deltas. The Compare page therefore renders only `StudioRoute` fields (plus client-side deltas it recomputes itself); the `deltas` payload is ignored by the renderer. Per task scope, `StudioSegment` fields are not re-audited; this audit covers fields actually rendered on `compare.tsx`.

Field rows below come exclusively from `StudioRouteSchema`. The provenance for each comes from `buildRoute()` in `tools/pipeline/src/jobs/build/studio-release.ts:391` and (for `interventions`) `buildStudioInterventionsFromComparisons` in `packages/domain/src/studio-interventions.ts`.

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| `route.slug` | real | `routeIdToSlug(readiness.routeId)` from readiness table | — | — |
| `route.label` | real | `routeLabel(readiness)` | — | — |
| `route.corridor` / `corridorFull` (used in `RouteSide` and `CoverageBar`) | real | `readiness.routeLongName ?? routeShortName` | — | — |
| `route.borough` (`RouteSide` subhead) | real | `routeBorough(readiness.routeId)` lookup | — | — |
| `route.sbs` (badge variant + " SBS" suffix everywhere) | real | derived from `routeId.includes("+")` or shortName contains "SBS" | — | — |
| `route.miles` (`RouteSide` subhead) | real when geometry summary is present | Generated R2 release uses current MTA route-shape length | Complete route-shape snapshot coverage in the release build | Routes missing source shape snapshots still fall back to a coarse readiness-derived value |
| `route.speedMph` (badge variant tone in `RouteSide`) | real | `summary.averageSpeedMph` rounded | — | — |
| `route.weightedAvgSpeed` (KPI "Observed speed", driver of speed-delta sentence) | partial / label corrected | Set to the same value as `speedMph` (`weightedAvgSpeed: speedMph`) and displayed as observed route speed instead of rider-weighted speed | A true rider-weighted average speed using per-hour or per-segment ridership weights | Pipeline emits only a single route-level speed; per-hour ridership exists but is not used to weight it. The schema field name still overstates the data. |
| `route.dailyRiders` (KPI "Daily riders") | partial-real | `Math.round(summary.totalRidership / daysInIsoMonth(summary.month))` — monthly total divided by actual days in the analysis month | Service-day or weekday-specific ridership | Underlying ridership is monthly aggregate only |
| `route.riderHoursLost` (KPI + headline sentence "route-slice delay exposure") | partial / scoped label | R2 release projection sums positive schedule-comparison delay × route/hour ridership exposure over generated segment evidence; compare keeps the conservative route-slice label instead of a boarding-weighted total-delay label. | Stop/segment passenger loads if needed for boarding-weighted route totals | Current contract keeps stop/segment boardings null |
| `route.laneCoverage`, `route.laneCoverageSource` (KPI, `CoverageBar`, headline "DOT route-shape lane overlap") | real for audited public release / geometry-method caveat | Longest in-effect MTA route shape compared with normalized DOT bus-lane geometry; public release rows require `laneCoverageSource = "dot_bus_lanes_geometry"`; compare now repeats the route-shape/DOT framing in the KPI and summary sentence | Domain-reviewed tolerance thresholds, painted/concrete distinction, lane operating hours, and stronger source/method UI | The value is proximity-based route-shape overlap, not regulatory lane-mileage coverage |
| `route.aceStatus` (KPI "ACE status" cell shown as Active/None) | real | `summary.aceActive ? "active" : "none"` from D1 brief summary | — | — |
| Observed speed values overlay | real when trend rows exist / scope-labeled | Compare now plots each route's `route.spark` directly as observed speed values with `route.sparkMonths` month labels; the old `synth24()` hourly reshape was removed, and the heading/copy avoid implying hourly speed or causal trend evidence. | Richer source metadata per chart point | Chart points carry month labels but not separate source artifact/query URLs |
| `route.interventions[]` (count + vertical timeline cards) | real with method caveat | `buildStudioInterventionsFromComparisons` joins curated intervention events with peer-adjusted before/after speed deltas from D1 (`listRouteInterventionComparisons`). Compare and route-detail timeline rows label matched comparison-route context as peer-adjusted/descriptive before/after and explicitly say it is not causal proof. | External methodology review + detector-side causal cohorts if causal claims are needed | Current public UI is descriptive/non-causal only |
| `intervention.year` | real | `comparison.implementationMonth` | — | — |
| `intervention.title` | partial / template | Templated from `interventionType` + `program` ("X enforcement begins", "Bus lane opening evidence") | Source-cited intervention name | Curated intervention catalog labels are short; OK for now |
| `intervention.detail` | real | Renders peer-adjusted speed delta and comparison-route count for `evaluated`; otherwise explains why ("future_intervention", "insufficient_post_data", etc.) | — | — |
| `intervention.tone` | real | Sign of the adjusted speed delta vs ±0.05 mph threshold | — | — |
| `deltas.speedMph` / `deltas.riderHoursLost` / `deltas.laneCoverage` from response | unused | Computed in `buildStudioCompareProjection` but the renderer recomputes its own arithmetic from `routes[]` (e.g. `b.weightedAvgSpeed - a.weightedAvgSpeed`) | — | The response carries deltas no UI element reads. |

### Renderer-side hints

- **Observed speed values overlay** now avoids hourly and dated monthly-window claims. It still needs x-axis month labels once `StudioRoute.spark` exposes point metadata.
- **"Weighted speed" KPI label**: `weightedAvgSpeed === speedMph` exactly; there is no weighting. The KPI cell, the delta-tone heuristic, and the closing headline sentence ("runs X mph faster") all inherit this overstatement.
- **"Bus-lane overlap" section header**: copy now uses route-shape lane-overlap language. The value is source-backed DOT geometry overlap but still lacks painted-vs-concrete, operating-hours, and deeper method/source affordances.
- **Closing comparative paragraph** (`compare.tsx:100–108`): speed is now labeled as observed speed, delay is scoped as route-slice delay exposure, and lane deltas are DOT route-shape overlap. The sentence template `"…carries more riders…"` still flips to `"comparable"` based only on a strict `b > a` numeric test, with no tolerance threshold.
- **"Documented interventions" count**: real, but counts include `future` and `insufficient_*_data` rows that have no measured outcome — the phrase "documented interventions" is fine, but a user might read it as "evaluated".
- **Swap button + per-side `Link` to `/routes/$routeId`**: pure navigation, not a data field.
- **No peer/similarity selection on this page.** Both routes come from URL `?a=` and `?b=` and are looked up by slug in `routes.json`. The `peerSlug` field on `StudioRoute` is now a generated nearest observed-speed neighbor and `GET /api/v1/studio/data/cohorts?route=` exposes the descriptive speed cohort, but `compare.tsx` still does not use either surface.
## Search Results page (`/search`)

- **Page file**: `apps/web/src/studio/pages/search-results.tsx`
- **API endpoint**: `GET /api/v1/studio/search?q=<query>`
- **Worker handler**: `apps/web/src/worker/index.ts` lines 555-620
- **Response schema**: `StudioSearchResponseSchema` in `packages/domain/src/studio-schemas.ts` lines 342-352
- **Backend mechanism**: substring filtering (case-insensitive `String.includes`) over the three already-built Studio projections (`routes.json`, `findings.json`, `briefs.json`). No index, no scoring, no ranking, no highlighting, no facets.

### Field-by-field audit

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| Header `query` echo (`N results for "..."`) | real / derived | Echoes the trimmed `q` query param verbatim from `url.searchParams.get("q")`; `N` is `routes.length + findings.length + briefs.length` for the served response. | — | Counts remain filter-cardinality, not relevance-ranked totals. |
| Header scope label (`Routes, findings, and briefs`) | hardcoded / accurate | Static JSX label now names only the three result groups that actually exist in `StudioSearchResponse`. | — | — |
| Search input placeholder ("Search route, finding, brief...") | hardcoded / accurate | Static JSX placeholder. It no longer advertises segment or methodology search. | — | — |
| Clear-search control | real navigation | The `X` control links to `/search`, clearing the query instead of resetting the field back to the current `defaultValue`. | — | — |
| Facets / alerting / result-type chips | removed | The facet rail, presentational checkboxes, reset button, `Save as alert` CTA, and Segments/Methods chips were removed because the response has no facet state, alerting, segment results, or method results. | Real facets/alerts would need new response fields and write endpoints. | No `segments`, `methods`, facets, or alerting contract on `StudioSearchResponse`. |
| Routes group `count` (header pill) | partial | `data.routes.length` — count of Studio route rows whose concatenated text fields contain ANY whitespace-split term. Honest as "filter matches", dishonest as "search relevance count" because OR-of-terms inflates matches. | Tokenizer that requires all terms (AND), or a tf/idf or BM25 score with a threshold. | No real index; relevance ranking does not exist. |
| Routes group items | partial | Renders every route returned by the filtered projection, in projection order. There is no hardcoded cap or fake "show all" control. | Relevance-ranked ordering + pagination metadata in the payload. | No scoring in worker; payload has no `total` / `page` fields. |
| Route `label`, `sbs`, `corridorFull`, `borough`, `dailyRiders`, `speedMph` (each row) | real | Pulled straight from `StudioRouteSchema` records sourced from the R2 `routes.json` projection. `speedMph` is observed AVL data. | — | — |
| Route speed color/severity | removed | Search now renders the observed mph value neutrally instead of applying page-local severity thresholds. | Real per-route severity classification if severity coloring returns. | Severity thresholds are not modeled in the domain schema. |
| Route delay-exposure column | partial / scoped | Renders rounded `route.riderHoursLost` under the visible `Route-slice delay` header, with `exposure` as the cell unit, not shorthand delay units. The label remains conservative because the denominator is still route/hour ridership. | Stop/segment passenger loads if this becomes a true boarding-weighted public delay label. | Current passenger-delay contract explicitly leaves stop/segment boardings null. |
| Route treatment glyphs | derived | `TreatmentRow` maps lane coverage with the existing thresholds and uses source-backed ACE/TSP status where present. | A dedicated route-treatment display model if thresholds need policy review. | Lane glyph thresholds are renderer-side. |
| Findings group `count` | partial | `data.findings.length` from the same OR-substring filter over `id + category + title + body + metric + routeSlug`. | Real ranking / dedup. | Same as routes — no index. |
| Finding `title` | real | From the pre-built findings projection (reviewed findings pipeline). | — | — |
| Finding `metric`, `category`, `confidence`, and route badge | real | From the pre-built findings projection and joined Studio route metadata. No direction glyph is shown because `StudioFinding` has no direction field. | — | — |
| Briefs group `count` | partial | `data.briefs.length` from OR-substring filter over `id + title + summary + status + routeSlug + claims[]`. | Real ranking. | Same as above. |
| Brief `status`, `title`, provenance/authors, `evidenceRefCount`, and generated month | real / generated | From `briefs.json` projection. Generated release-builder bylines render as `Provenance`, not human authorship. The page does not fabricate query-aware snippets. | Query-specific snippets if desired. | Worker discards match offsets; no highlight field on `StudioBriefCardSchema` / `StudioFindingCardSchema`. |
| Hit highlight markup (none rendered) | n/a / missing | The UI shows no `<mark>` highlighting on titles, snippets, or metric lines despite this being a search results page. | Matched-term offsets returned by the worker; renderer to wrap them. | Not in the response payload. |
| Per-result relevance score (none rendered) | n/a / missing | No score is shown to users — but there is also no score computed. Order is "as-found-in-projection". | Real relevance score (BM25, vector, or simple tf-idf). | No index. |
| Empty-state bodies ("No route names...", "No findings...", "No briefs...") | hardcoded | Literal copy in `search-results.tsx`; the findings and briefs messages no longer claim reviewed/published/draft states for the release search projection. | — | — |
| Empty-state icon `∅` | hardcoded | Literal in JSX. | — | — |
| `quality` block (not rendered on this page but in payload) | partial | Worker copies the routes-result `quality` (`releaseLayer: "baseline_release"`, `confidence: "medium"`, caveats about D1/R2). The block describes the routes projection only; findings/briefs quality is dropped on the floor. | Per-source quality aggregation in the search response. | Schema only carries one `quality` object. |

### Renderer-side hints

- Hard cutover completed for this page: the StudioHero copy, `SearchField`, Badge facet chips, facet rail, alert CTA, client-only `MatchChips`, hardcoded `DirIndicator dir="NB"`, fake relevance chip, route-result cap, and route-speed severity coloring are gone.
- Results still follow projection order, not search relevance. Counts are honest response cardinalities but inflated by the worker's OR-token substring filtering.
- `RouteBadge`, `EmptyState`, and `TreatmentRow` are renderer-only; the only remaining renderer thresholds are the lane-coverage glyph buckets in `mapLaneCoverage`.
- The `data.query` echo in the hero is unescaped via template literal; XSS-safe under React's default escaping but worth noting if the search field ever switches to dangerouslySetInnerHTML for highlight markup.
## Methods page (`/methods`) — synthetic data audit

Page: `apps/web/src/studio/pages/methods.tsx`
Payload: `StudioMethodsResponse` -> `apps/web/src/worker/index.ts:782` reads `methods.json` from R2.
Projection: `packages/domain/src/studio-projections.ts:279` (`buildStudioMethodsProjection`).
Pipeline source: `tools/pipeline/src/jobs/build/studio-release.ts` builds `docsSources` from the source-coverage ledger plus generated TSP/release-artifact rows, then derives `methods` from those sources.

The wire payload (`StudioMethodDatasetSchema`) now carries `sourceId`, `name`, `publisher`, `grain`, `cadence`, `description`, `rowCount`, `rowLabel`, `period`, `schemaKeys`, `method`, and `sourceRefCount`. Dataset cards and the header source-ref count read those generated fields. The tab-strip stamp reads `data.generatedAt` instead of a hand-authored methodology revision. The remaining static/editorial surfaces on `/methods` are the metrics table, caveats grid, qualitative sources grid, and publication-rule panel.

### Claim inventory

| Claim | Status | What it asserts | What pipeline actually does | Blocker |
|---|---|---|---|---|
| Dataset list | generated | One card per `StudioMethodDataset` emitted by the release build | Derived from `docsSources`, which combines source-coverage ledger entries with generated TSP and release-artifact rows. Missing source display metadata fails the release build instead of silently inventing labels. | — |
| Dataset `publisher`, `grain`, and `cadence` | generated | Attribution and grain/cadence copy per source group | Emitted by the release builder's source display metadata for every ledger/generated source. | Needs periodic review when source configs change |
| Dataset description prose | generated | Detailed narrative per dataset | Emitted in `StudioMethodDataset.description`; no React-side dataset-detail map remains. | — |
| Dataset row count | generated | Row count and row label per source group | Ledger-backed sources use local table row counts; TSP uses parsed route-status rows; generated route-slice artifacts use `routeArtifacts.length`. | Source-ledger configs must cover new source tables before they can appear publicly |
| Dataset period | generated | Date/window string per source group | Ledger-backed sources use local min/max dated rows; generated sources use the captured TSP source date or release month. | — |
| Schema-key chips | generated | Source-specific schema fields | Emitted in `StudioMethodDataset.schemaKeys`; source metadata is mandatory. | Still curated metadata, not introspected from SQL/Zod at build time |
| "Source refs" count per dataset and header "Source refs" stat | generated | Source-reference count metadata per source group | Emitted by the release build as `sourceRefCount` and summed from payload values in React. The old `citeCount` contract field has been hard-renamed. | Counts are source-group metadata, not a per-brief citation graph |
| "method:" label per card | generated | Identifies the pipeline/source method used for that dataset | Emitted in `StudioMethodDataset.method`. | — |
| Header stat: "Datasets" count | real | `datasetCount = data.datasets.length` (`methods.tsx:151`) | Counted from payload | — |
| Header stat: "Source refs" count | generated / relabeled | Sum of per-dataset `sourceRefCount` emitted by the release build | Derived from source-display metadata and release/source rows | Counts are source-group metadata, not a per-brief citation graph |
| Header stat: "Caveats" count | hardcoded | `caveats.length` | `caveats` array is literal in TSX (`methods.tsx:82-103`) | Acceptable as static editorial copy |
| Tab-strip generated stamp | generated | Shows `Methods projection · generated {data.generatedAt}` | `generatedAt` comes from `StudioMethodsResponse` / release payload | It is a release-generation timestamp, not a semantic methodology revision |
| Caveats grid (4 items: "Context is not causality", "Single-month speed release", "Recovered reliability provenance", "Physical overlap varies by source") | hardcoded (editorial) | Methodology caveats | Literal in `methods.tsx:82-103`; not from payload. Content is consistent with known pipeline behaviour | Acceptable as editorial; or move to payload if dynamic |
| Metrics table row: "Observed long-gap share = long-gap samples / observed headway samples" | partial | Used as lead metric for B25 and BX41 reliability findings | Pipeline does compute long-gap signals (`tools/pipeline/src/jobs/build/findings.ts:543`, `1154`); B25 and BX41 are real reviewed routes (`studio-release.ts:55-56,928`). Whether the displayed expression is the exact published formula is not surfaced | Link the metric definition to the actual computed field |
| Metrics row: "Weighted average route speed" | real | Route speed weighted by segment evidence/exposure | `weightedAverageSpeedMph` is computed in `tools/pipeline/src/jobs/build/corridor-model.ts:405` | — (expression text is editorial) |
| Metrics row: "DOT permit route touches" | partial | Context events joined through route ID or LION physical ID | `data/raw/dot-permits` and `lion-centerline` exist; LION join logic exists in pipeline | Verify the join is route-corridor only (caveat already says so) |
| Metrics row: "Ridership exposure" | real | Ridership assigned to segment/route evidence rows | `ridershipExposure` is a real pipeline field (referenced in `synthetic_data_inventory.md:23`) | — |
| Qualitative sources grid (4 items: Project wiki, MTA Bus Observatory archive, MTA Open Data/GTFS, NYC DOT permit/bus-priority) | hardcoded | Lists qualitative source materials | Literal in `methods.tsx:59-80`; not from payload. Bus Observatory archive is real (Bus Observatory check job exists) | Acceptable if labeled as editorial; user can't tell from UI |
| "Publication rule" panel ("A public finding should name the evidence grain it actually verifies...") | hardcoded (editorial) | Editorial publication policy | Literal JSX (`methods.tsx:209-223`) | — |

### Methodology vs reality discrepancies

The dataset-card fabrication risk is closed by the generated payload. Remaining risks are narrower:

1. **Curated source metadata is not schema introspection**
   `schemaKeys`, `method`, `grain`, and `sourceRefCount` are generated from required release-builder metadata, not inferred from SQL table definitions or a citation graph. This is acceptable for public docs, but source configs and display metadata must move together.

2. **Editorial metrics/caveats are still static**
   The metrics table, caveats grid, qualitative-source cards, and publication-rule panel are hand-authored editorial guidance. They are not row-count claims, but they still need review when the pipeline semantics change.

3. **ACE per-segment caveat remains**
   The source ledger can count ACE summary rows, but per-segment ACE attribution is still a route-level proxy until the intervention workstream promotes segment/corridor geography.

### Summary numbers

- Real/generated: dataset list, publisher, grain, cadence, descriptions, row counts, periods, schema-key chips, method labels, source-ref counts, dataset count, source-ref-count header, generated timestamp label, weighted-speed metric, ridership-exposure metric, and long-gap metric definition.
- Hardcoded / editorial: caveats, qualitative sources, publication-rule panel, and most metric explanatory prose.
- Direct contradictions with pipeline reality: no known row-count/citation/schema-card contradictions remain after the source-ledger cutover. ACE segment attribution remains a broader Studio data caveat, not a Methods-card fabrication.
## Docs page (`/docs` and `/docs/$page`)

**Renderer file**: `/mnt/models/dev/bus-reliability-tracker/apps/web/src/studio/pages/docs.tsx`
**Nominal API endpoint**: `GET /api/v1/studio/docs` (served by worker via `loadStudioProjection(env, "docs.json", StudioDocsResponseSchema)`)
**Actual API endpoint used by this page**: `apps/web/src/routes/docs/$page.tsx` now loads `fetchStudioDocs()`, so the rendered endpoint lists and generated overview sections come from the R2 docs projection built from `studioOpenApiDocument`.

### Field inventory

| Field | Status | Pipeline behavior | Real data needed | Blocker |
|---|---|---|---|---|
| Nav groups / TOC (`NAV_GROUPS`, `DOCS_PAGE_ORDER`, `DOCS_PAGE_TITLES`, `DOCS_PAGE_SECTIONS`) | hardcoded | Not pipeline-driven. Defined inline at `docs.tsx:10-52`. | None — this is the doc site IA; acceptable as code. | n/a |
| Overview page prose (`OverviewPage`) | partial | Uses the loaded docs projection for generated release sections and names `/api/openapi.json`; still includes small hand-authored explanatory prose and example error shape. | Full prose generation if docs copy needs to become fully manifest-driven. | Response examples now come from the generated docs payload. |
| Authentication page (`AuthPage`) | accurate / hand-authored | Now states public reads require no bearer token, while draft-backed reads/writes require a D1 Studio actor bearer token plus idempotency key for mutating requests. The page documents actor scopes instead of browser-supplied workspace/reviewer headers. Removed fake `BPI_API_KEY`, public auth scopes, and rate limits. | Real user auth model if/when public writes are exposed. | Current actor tokens are controlled operator credentials, not a public auth product. |
| Quickstart (`QuickstartPage`) | partial / accurate | Uses actual `/api/v1/studio/*` routes, including `routes/{routeId}/segments`; the segment endpoint supports generated windows and exposes coverage metadata for observed-timepoint full-route scope, hourly passenger-delay, and unavailable stop/segment boardings. The write example matches current token/idempotency behavior. | Generated request examples if/when request examples become part of the docs payload. | Response examples are generated on the reference pages; curl snippets are still hand-authored operator prose. |
| CLI Reference (`CliPage`) | accurate / hand-authored | No longer claims npm/pipx/brew CLI exists; documents Bun-first local operator scripts and says CLI packaging is future work. | Real CLI once built. | CLI does not exist. |
| Routes / Findings / Briefs API reference pages | generated endpoints + generated response examples | Endpoint rows are filtered from `StudioDocsResponse.endpoints`, which is generated from `studioOpenApiDocument`. Each endpoint row now carries a `responseExample` string generated from the current release projection or write-response schema. | Request examples for write endpoints, if needed. | Response examples are generated; request examples are still prose/curl snippets. |
| Data & Credits release fact list | generated | `StudioDocsResponse.facts` is generated by `buildStudioDocsProjection()` from the release payload: release month, route/segment coverage, route-artifact refs, finding/brief counts, OpenAPI endpoint count, and source-group count. Renderer and copy-as-markdown consume `data.facts`. | — | — |
| Data & Credits release-summary intro paragraph (`docs.tsx`) | partial | Reads release month from `StudioDocsResponse.facts`; broader corpus-window prose is still editorial. | Full release manifest for named public release windows. | Editorial copy still summarizes the release posture. |
| Primary Release Evidence table | generated | Rows come from `StudioDocsResponse.sources.filter(primaryEvidenceAllowed)`. Coverage strings include generated row counts, periods, month counts, geocode/join rates, readiness status, source links, and readiness caveats. | — | Source eligibility is only as current as the source-coverage ledger config. |
| Context Sources table | generated | Rows come from `StudioDocsResponse.sources.filter(!primaryEvidenceAllowed)`, including context-only, current-signal-only, deferred, blocked, and generated-artifact rows. | — | Source eligibility is only as current as the source-coverage ledger config. |
| Use Rules `Params` table | hardcoded | Inline prose `docs.tsx:951-979`. Editorial content, not data-derived. | None — editorial rules are appropriate as source. | n/a |
| Terms paragraph | hardcoded | Inline `docs.tsx:982-992`. Editorial. | n/a | n/a |
| Changelog v0.2.0 items (`CHANGELOG_V02_ITEMS`), date `2026-05-24`, label "Observed release" | hardcoded / cleaned | Inline `docs.tsx:999-1024,1103`. Date matches today's date in env (`2026-05-24`) — likely set by hand at release time. The former static "200 approved examples" finding count was removed in favor of review-provenance wording. | Pull from a release manifest or git tags. | No release manifest emitted. |
| Changelog v0.1.0 items + date `2026-05-17` + "Initial release" tag | hardcoded | Inline `docs.tsx:1043-1147`. | Same as above. | Same. |
| Copy-as-markdown payload (`buildPageMarkdown`, `buildDataCreditsMarkdown`, `buildChangelogMarkdown`) | partial / generated | Data & Credits markdown includes generated facts and generated source-ledger rows. API-reference markdown includes generated endpoint rows plus generated JSON response examples. Other pages remain prose templates generated client-side from page metadata/sections. | Full markdown mirrors for every prose page. | Some prose remains hand-authored. |

### Pipeline `docs.json`

`tools/pipeline/src/jobs/build/studio-release.ts` builds generated sections, generated source rows, and release method datasets. `buildStudioDocsProjection()` fills `endpoints` from `studioOpenApiDocument`, facts from the release payload, and sources from `release.docsSources`. The React docs route consumes this projection through `fetchStudioDocs()`.

### Renderer-side hints

- Endpoint rows now come from the generated docs projection, not inline `/v1/...` strings.
- Fake public auth, rate-limit, and package-manager CLI claims have been removed or relabeled as future work.
- The Data & Credits numeric facts, source counts, row totals, source periods, geocode/join rates, and readiness bands are generated from the release/source ledger. New source groups must be added to the ledger/display metadata before they can appear publicly.
- Changelog dates and release tags are manually edited; no automation links them to actual release artifacts.
- The "Copy markdown" button now includes generated sections, endpoint rows, response examples, release facts, and source-ledger rows.

## Studio design pass — 2026-05-25 (compare, search-results, methods)

New surfaces introduced or relabeled by the 2026-05-25 tarbell pass on the three previously-untouched pages. Each row is a UI element that is **not** backed by observed data, in addition to the pre-existing synthetic surfaces already catalogued per-page above.

### Compare page (`compare.tsx`)

| Surface | Status | Notes |
|---|---|---|
| `DeltaCell` arrow + tone color | derived | Computed from sign of `delta` against `higherIsBetter`. Real, not synthetic — just noted because it is a new presentational signal. |
| ACE status `sub` line `"since {date}"` | derived | Formatted from `route.aceSince` via `fmtAceSince`. Real where the source has a date; falls back to empty string. |
| Half-strip swap button | non-functional swap | `swap()` navigates `/compare?a=b&b=a`; tarbell intent. Real navigation, no data fabrication. |
| Observed speed values overlay header text | scope-labeled | Caption now says "Observed speed values" and uses route-month labels. The divergence vs tarbell (which shows 24-hour hourly speed) is intentional — no hourly evidence exists in `StudioCompareResponse`. |
| Top-segments side-by-side panel | missing | Tarbell renders top-5 slow segments per route side-by-side. `StudioCompareResponse.routes` is two `StudioRoute` objects with no segment array; rendering would require a second `StudioRouteDetailResponse` fetch per side. Skipped intentionally. |

### Search results page (`search-results.tsx`)

| Surface | Status | Notes |
|---|---|---|
| Result tally `"N results for {query}"` | derived | `routes.length + findings.length + briefs.length`. Real for the three groups, but does not include Segments / Methodology that tarbell shows because the response has no such fields. |
| `"sorted by relevance"` chip | removed | No sort options or backend ordering signal exists in `StudioSearchResponse`, so the label is gone. |
| Facet rail / reset facets / checkboxes | removed | No facet state exists in the API contract. |
| "Save as alert" CTA + caption | removed | No alerting backend exists. |
| `MatchChips` "matches: {token · token}" | removed | No server-side match-highlight signal exists, so the client-side token chips are gone. |
| Search clear `X` | real navigation | Links to `/search` instead of resetting the field back to the active query. |
| `RouteResult` delay-exposure column | derived / scoped | Rounded `route.riderHoursLost`, labeled as `Delay exposure` with scoped route-slice copy instead of daily or rider-hour shorthand. |
| `RouteResult` speed severity color | removed | Observed mph is rendered neutrally; no page-local severity thresholds remain. |
| `RouteResult` TreatmentRow `lane` mapping | derived | `mapLaneCoverage(pct)` thresholds (≥70 yes, ≥25 partial, >0 minimal). Matches the existing Studio route lane glyph thresholds. |
| `FindingResult` `DirIndicator dir="NB"` glyph | removed | `StudioFinding` has no direction field. |
| `FindingResult` right column `{confidence}` | derived | Real — `finding.confidence`. Just a relabel of what tarbell shows as "RH/day". |
| `BriefResult` status chip (`PUBLISHED` / `IN REVIEW` / etc.) | derived | `brief.status.toUpperCase()`. Real. |
| `BriefResult` date column | derived | `fmtBriefDate(brief.generated)` → `"May 2026"`. Real. |
| Segments + Methodology result groups | missing | Tarbell has Segments (`SegmentResult` with severity circle + DirIndicator + Treatments) and Methodology Notes groups. Neither exists in `StudioSearchResponse`. Skipped intentionally. |

### Methods page (`methods.tsx`)

| Surface | Status | Notes |
|---|---|---|
| Glossary tab (7 terms) | hardcoded | `glossary` const in `methods.tsx`. Editorial copy; not pipeline-driven. Terms align with the Studio's vocabulary but are authored, not extracted. |
| `methodologyRevision` tab-strip label | removed / generated | The hand-stamped `"v0.5 of methodology · last revised 2026-05-25"` label is gone. The page now shows the served methods projection `generatedAt` date. |
| Dataset card "Methodology note / Schema / Download CSV" buttons | removed | No methodology-note routes, schema page, or CSV endpoint exists yet. |
| Caveat "Apply to brief" button | removed | No brief-attach workflow exists for caveats yet. |

### Not changed by this pass

- Compare-page delay and lane-overlap labels now carry scoped-method wording (`Route-slice delay` / route-shape DOT overlap); remaining gaps are the upstream full-route passenger-delay and lane-method/domain review items documented above.
- Methods-page editorial metrics/caveats/qualitative-source/publication-rule content remains hand-authored. Unchanged.
- ACE per-segment attribution remains a route-level proxy. Unchanged.


## Public identity & magic-link rollout — 2026-05-25

The previously-fake auth slots are now backed by real D1 tables and routes (ADRs 0008, 0009; migrations `0018_identity_unification.sql`, `0019_identity_user_surfaces.sql`, `0020_drop_legacy_studio_actor.sql`).

| Surface | Status | Notes |
|---|---|---|
| `StudioActorMeResponse.publicAccountAuthStatus` | real | Now `"magic_link"`. Previously hardcoded `"not_available"`. |
| `StudioActorMeResponse.userDirectoryStatus` | real | Now `"d1_identity"`. Previously hardcoded `"not_available"`. |
| `/api/v1/me` (new) | real | Returns `IdentityMeResponse` or `IdentityAnonymousMeResponse`. Cookie + bearer both accepted. |
| `/api/v1/auth/magic-link/{request,consume}` | real | 15 min single-use magic_pending sessions, atomic consume, 30 d session cookie. Dev fallback echoes link when `env.EMAIL` unset and `env.ENVIRONMENT === "development"`. |
| `/api/v1/auth/signout` | real | Revokes the session, clears the cookie. |
| Search-results `Save as alert` button | real | POSTs to `/api/v1/alerts`. Redirects to `/signin?next=…` for anonymous callers. Was logged as a fake button in the earlier design pass. |
| Search-results `Save search` button | real | POSTs to `/api/v1/saved-searches`. New surface, not in prior tarbell pass. |
| Brief reading-view `PublicCommentsThread` | real | GET/POST `/api/v1/briefs/{id}/public-comments`. GET is open; POST requires identity. Mounted only on published briefs. |
| Studio shell `Sign in` chip / `Account` page | real | `useIdentity` hook drives header chip + `/account` page. Sessions list / sign-out-everywhere not yet exposed in UI. |
| `/admin/identities` operator promotion | real | GET listing + POST grant/revoke. Guarded by new `admin:identities` scope. Bootstrap of the first admin role is still a manual D1 insert (no CLI yet). |

### Not yet real

- Account page **session list** and **sign-out-everywhere** button (queries exist via `listSessionsForIdentity` / `revokeAllSessionsForIdentity`, no UI wired yet).
- Account page **display-name edit** form (`updateIdentityDisplayName` query exists, no PATCH `/api/v1/me` endpoint yet).
- Bootstrap CLI for seeding the first `admin:identities` role.
- Public comments **moderation** (admin delete / report flow) — only soft-delete by the author is wired.
- Email delivery is a hard dependency on Cloudflare Email Service in production; the binding must be configured before public sign-in is operational.

## Route detail · slow-segments tab — 2026-05-25 audit

Re-cut `SlowSegmentsSection` to tarbell `RF_RouteDetail` shape (option A). Earlier rich AI surfaces moved off the slow-segments tab; only the short `aiNote.body` is now rendered (inline expand). Tarbell's `RF_RouteDetail` also wants a Before/After ACE all-day card on this tab — we don't have route-level ACE rollout-window metrics on the release projection.

| Surface | Status | Notes |
|---|---|---|
| `SegmentRow` `flag="top"` accent-bg tint | real | Derived from `segments.find(maxRiderHours)`. Matches tarbell's manually-curated `flag: 'top'`. |
| `SegmentRow` ◆ `hasNote` glyph | real / sparse | Set only when the optional public `StudioSegment.aiNote` is present. The release builder caps route-detail notes at 30% of visible segment rows. |
| Inline-expand AI note (prose under row) | real / sparse | Renders the public `segment.aiNote.body` only for rows with a generated source-lined note. Rows without a note are non-clickable. |
| AI note `headline`, `nextChecks`, `blockedClaims`, `primaryEvidence`, `caveats` | **dropped from public route row** | These fields moved to the internal analyst note artifact and `StudioAiAnalystNoteSchema`; public route projections carry only `body`, `source`, and `generationMode`. |
| Direction `FilterChips` | **dropped** | Tarbell shows a passive `All directions` chip and never filters. Restored to a static badge. |
| Pagination "Show 5 more" | **dropped** | Tarbell shows a single `Show all →` link. |
| Inline `InterventionTimeline` (horizontal) | real | Re-uses `route.interventions`. Same data as the Interventions tab. |
| Before/after — ACE all-day rollout card | **stub** | Route-level rollout-window metrics (PM-peak speed, slow-window share, violations/day) are not on `StudioRouteDetailResponse`. Card renders a caveat box explaining the gap. |

## Route ladder page — 2026-05-25 audit

Re-checked `route-ladder.tsx` against `ladder.jsx`. No structural drift; the previously-deferred items are still deferred.

| Surface | Status | Notes |
|---|---|---|
| `TimeWindowPill` (12-month grid with intervention markers) | **deferred** | Right-aligned month selector in the column-headers row. Backing time-series data isn't ingested per month yet. |
| Selected-segment sparkline (14-day speed trend with scheduled baseline) | **deferred** | Right rail metric card currently shows only the big mph + scheduled delta. |
| Right rail secondary buttons (`Compare similar segments`, `Open hour-by-hour breakdown`) | **dropped** | No backing flows. Kept the `Create route draft` primary only. |
| Tip strip at bottom of the ladder | **dropped** | Cosmetic only — the legend already covers the read-this-as-a-ladder framing. |
| Story-flag pulse vs auto-top | derived | Tarbell pulse is a curated `seg.story === "top"` marker; ours pulses the data-driven highest-rider-hours segment. Equivalent intent. |

### Ladder inlined into Route Detail tab — 2026-05-25 follow-up

Standalone `/routes/$routeId/ladder` URL deleted; ladder body now lives in the Ladder tab of the Route Detail page via `LadderTabContent` (`apps/web/src/studio/pages/route-ladder.tsx`). The HTML reference is `knowledge/raw/assets/route-detail-ladder-tab.html`.

| Surface | Status | Notes |
|---|---|---|
| Left rail `Story` section | **derived** (real data, generated prose) | Picks the top-rider-hours segment. Three templates: (a) "only spine break" wording when the top segment is the only one with `lane !== "yes"`; (b) gap-among-many wording when the top segment has a lane gap but isn't the only one; (c) outlier wording when the top segment is `≥1.5×` the next worst by rider-hours. If none match, the section is hidden — no placeholder. |
| `TimeWindowPill` (12-month grid with intervention markers) | **deferred** | Still no per-month time-series. Pill is not rendered. The bottom tip strip was changed from "Click any segment to focus. Use the time window picker to see the route at a past month." to just "Click any segment to focus." so we don't promise a missing control. |
| Selected-segment 14-day sparkline in the right-rail metric card | **deferred** | No per-segment-day data; segments carry only month-level values + a 24-hour severity array. The HTML shows a sparkline; we render nothing (no placeholder). |
| Right-rail `Open hour-by-hour breakdown` (ghost button) | **omitted** | No backing flow; logged in `ui_backlog_for_user.md`. The other two HTML buttons are wired: `Send to brief →` (primary) → `/briefs/new?route={slug}`; `Compare similar segments` (secondary) → `/compare?a={slug}`. |
| Right-rail metric labels | renamed to match HTML | `mph observed avg` → `mph weekday avg`; `Slow share by hour` → `Severity by hour`; `Delay exposure` → `Rider-hours / day`. |
| Right-rail Rider-hours tier label | derived | Threshold-based: `≥15K = "top decile route-wide"`, `≥10K = "top quartile route-wide"`, else `"mid-range"`. Thresholds are absolute, not percentile within this route's segments. |
| Top-segment row eyebrow | renamed | `Top visible delay` → `↑ Top rider-impact` (uppercase accent eyebrow style, matches HTML). |
| Route-shape slice map thumbnail (previous standalone page only) | **dropped** | Not in the HTML reference. The map preview lived on the prior standalone ladder URL; the inline tab follows the tarbell ladder body shape, which has no map. |
