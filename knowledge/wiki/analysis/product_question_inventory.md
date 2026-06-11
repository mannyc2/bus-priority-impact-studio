---
title: Product Question Inventory
type: analysis
status: active
last_updated: 2026-06-07
owner: codex
source_count: 16
tags: [product-questions, detectors, applied-research, frontend, snapshot-2, findings]
---

# Product Question Inventory

## Purpose

This page is the bridge between product planning and analytics work.

The detector registry answers:

> What runnable detectors do we have?

This inventory answers:

> What product questions should the Studio be able to answer, and which data, applied-research
> panels, detectors, evidence artifacts, or serving projections are responsible for answering them?

Use this page before proposing a new detector or auto-research task. If a proposed detector does not
serve one of the transit-substance question families, it is probably a research experiment,
calibration artifact, workflow mechanism, or internal audit rather than a public detector feature.
Workflow mechanisms can still be product-critical, but they should live in workflow surfaces rather
than in the detector family map.

## Source Docs Consulted

- [[wiki/project/overview|Project Overview]]
- [[wiki/project/business_problem|Business Problem]]
- [[wiki/project/opportunity_data_map|Opportunity Data Map]]
- [[wiki/project/ai_interaction_model|AI Interaction Model]]
- [[wiki/engineering/website_surface_data_plan|Website Surface Data Plan]]
- [[wiki/engineering/serving_snapshot_2_surface_manifest|Serving Snapshot 2.0 Surface Manifest]]
- [[wiki/engineering/website_data_expansion_plan|Website Data Expansion Plan]]
- [[wiki/engineering/serving_snapshot_2_visualization_and_multiyear|Serving Snapshot 2.0 Visualization & Multi-Year Expansion]]
- [[wiki/engineering/route_treatment_summary_materializer_plan|Route Treatment Summary Materializer Plan]]
- [[wiki/engineering/document_derived_surfaces_v1|Document-Derived Surfaces v1]]
- [[wiki/analysis/ideal_detector_system|Ideal Detector System]]
- [[wiki/analysis/detector_catalog|Detector Catalog]]
- [[wiki/analysis/product_question_discovery_crosswalk|Product Question Discovery Crosswalk]]
- User-provided June 2026 business-problem research: NYC-focused opportunity map.
- User-provided June 2026 business-problem research: real public-transit workflow opportunities.
- User-provided June 2026 adversarial product-family gap audit.

## Completeness Model

There is no meaningful way to calculate the total number of unique permissible detectors in the
abstract. Detector space is open-ended because every new source, grain, baseline, treatment family,
or user workflow can create a legitimate new statistical question.

The practical completeness test is different:

1. Define the finite set of product question families the site intends to answer.
2. For each family, list the required data substrate and allowed claim posture.
3. Map current detectors, applied-research panels, serving projections, and evidence artifacts to
   those families.
4. Treat unassigned product questions as gaps.
5. Treat new detector ideas that duplicate an assigned family as calibration, feature, panel, or
   review-packet work unless the user-facing question is materially new.

This gives us an auditable "are we missing product value?" check without pretending there is a
closed universe of all possible detectors.

The procedure for discovering missing families is not this list auditing itself. Use
[[wiki/analysis/product_question_discovery_crosswalk|Product Question Discovery Crosswalk]] to trace:

```text
source docs / built surfaces / business research
  -> extracted product jobs
  -> canonical question families, product workflow surfaces, or shared substrates
  -> promote / absorb / defer / workflow / substrate / non-goal decision
```

If a source produces a repeated user workflow, output artifact, or decision meeting that cannot map
to any family here, that is the signal to add or split a family only when the workflow asks a
transit-substance question. Tool mechanics, composer flows, review flows, and approval/versioning
belong in product workflow surfaces instead.

## Lifecycle

This page is a **durable product contract at the question-family level** and a **living scaffold at
the implementation level**.

Durable:

- canonical question-family ids, such as `rider_pain`, `treatment_inventory`, and
  `intervention_ontology`;
- the user-facing questions each family is responsible for answering;
- the allowed claim posture boundaries;
- the rule that every detector, applied-research panel, route surface, and public evidence artifact
  should map back to a transit-substance product question family when it makes or supports a transit
  claim.

Adjacent but not family:

- product workflow surfaces such as `brief_authoring_workflow`, which describe how evidence is
  captured, edited, reviewed, versioned, or published;
- cross-cutting substrates such as `expected_baseline` and `measurement_integrity`, which describe
  method dimensions that many families must carry.

Living scaffold:

- current detector mappings;
- read-model and endpoint names while Snapshot 2.0 evolves;
- "current implementation" and "gap" notes;
- readiness/status labels as data products mature.

Do not churn the canonical family ids casually; downstream docs, generated coverage matrices, and
auto-research prompts should be able to reference them. If a family becomes wrong, rename or split it
with a short migration note. If only the implementation changed, update the mapping/status rows
without changing the family id.

## Primary User Lens

The primary product user is the **route/corridor evidence author**.

This is not a generic dashboard user and not a rider trying to plan a trip. It is the agency,
consultant, oversight, or advocacy analyst who has to turn fragmented public and operational signals
into a defensible route/corridor explanation for a live workflow:

- post-implementation evaluation of a bus lane, busway, TSP package, ACE/ABLE expansion, redesign, or
  congestion-pricing-adjacent change;
- route underperformance review where staff must separate schedule assumptions, service delivery,
  street conditions, stop friction, enforcement gaps, demand shifts, and source gaps;
- board, committee, community-board, press, audit, or grant/compliance narrative where the question is
  not only "what moved?" but "what can we safely say, cite, and defend?"

The user is successful when they can produce a board-ready or meeting-ready artifact:

```text
route/corridor/project question
  -> observed performance and rider impact
  -> treatment/intervention and timeline context
  -> explanation or counterfactual posture
  -> citations, caveats, and source gaps
  -> exportable brief, scorecard, deck section, or review packet
```

Primary user profiles:

| Profile | Workflow | Product value |
| --- | --- | --- |
| Transit agency performance or service-planning analyst | Diagnose a route, redesign, schedule issue, or recurring reliability problem. | Cuts investigation time and produces a reusable explanation. |
| DOT/MTA bus-priority or corridor planner | Defend whether a bus-priority project worked or deserves advancement. | Produces source-backed, rider-weighted corridor evidence. |
| Transit consultant | Prepare post-implementation studies, redesign reviews, corridor decks, or Title VI/grant appendices. | Turns repeatable public-data analysis into client-ready deliverables. |
| Board/reporting/comms staff | Explain monthly metric movement and respond to oversight or press. | Turns metrics and caveats into consistent narrative packages. |
| Advocate, watchdog, journalist, or public reader | Inspect the evidence behind a public claim. | Gets cited claims, caveats, and source gaps without raw pipeline knowledge. |

Not primary users:

- real-time dispatchers or operations-control staff;
- consumer trip-planning users;
- generic BI users looking for arbitrary chart exploration;
- enforcement hardware operators.

Implications for this inventory:

- A question family is product-relevant only if it can feed a defensible explanation, public route
  surface, review packet, brief, scorecard, or source-gap finding.
- "Interesting chart" is not enough. The output should help someone decide what to cite, what to
  review, what to caveat, or what not to claim.
- Route pages and compare pages are evidence workspaces first. They can be browseable, but their
  deeper job is to supply the evidence author with the right artifacts.
- A family is not fully covered until it has coverage/no-hit/skipped states and a claim posture, not
  merely a plotted metric.

## Research-Derived Family Decisions

The June 2026 business-problem research and adversarial family-gap audit add product questions that
were not explicit enough in the first inventory draft.

Promote these to canonical families now:

| Family | Why it is new |
| --- | --- |
| `root_cause_diagnosis` | Existing families measure pain, schedules, reliability, treatments, context, and source gaps. The research asks for a synthesized answer: which factor best explains observed underperformance? |
| `corridor_project_evaluation` | `intervention_effect` asks whether a known intervention changed performance. The research also asks whether a corridor/project should advance, how to defend it, and how to package before/after or concept evidence. |
| `cost_effectiveness` | Corridor/project evidence that cannot answer whether the benefit justified the cost is incomplete for board, grant, consultant, and capital-prioritization workflows. |
| `geographic_rollup` | Route/corridor pages do not answer the political and planning geography question: what is happening in this community board, council district, neighborhood, or borough? |
| `service_delivery` | "Did the promised service actually run?" is distinct from slow speed, bunching, or schedule/runtime mismatch. It is an upstream accountability question with its own evidence and owner. |
| `equity_incidence` | `rider_pain` answers how many riders are affected, while compliance packaging answers formal Title VI/grant needs. Prioritization and advocacy also need a discovery lens for who bears unaddressed bus pain. |
| `board_reporting_package` | `evidence_readiness` says what can be cited. The research adds the recurring workflow of turning approved metrics and caveats into board, committee, press, audit, or performance narratives. |
| `compliance_package` | Title VI, NTD, grants, and formal evaluation appendices are workflow-shaped deliverables. They reuse route evidence, but the user job is compliance packaging, not discovery. |

Name these as cross-cutting substrates, not product question families:

| Substrate | Why it is not a family |
| --- | --- |
| `expected_baseline` | Many families need "relative to what?" baselines, but this is a shared statistical/method layer for peer, history, schedule, diagnosis, and detector work rather than a separate user workflow. |
| `measurement_integrity` | Many families need "is this real or an artifact?" guards, but feed outages, schedule-version breaks, source lags, route-shape changes, and method changes should be claim-posture columns across artifacts. |

Track this as a product workflow surface, not a canonical question family:

| Workflow surface | Why it is not a family |
| --- | --- |
| `brief_authoring_workflow` | The composer/review/publish flow is how transit evidence becomes an artifact. It does not ask a transit-substance question and should not receive detector mappings. |

Track this as adjacent/deferred, not core Snapshot 2.0 route evidence yet:

| Family | Why it is not core now |
| --- | --- |
| `service_change_coordination` | Disruption/open-street/event/service-change coordination is a strong business problem, but it needs permit/event intake, impacted-stop tasking, flyer/alert generation, and field operations workflows. That is a neighboring product, not a route evidence tab. |

Do not promote these as separate families yet:

| Research opportunity | Current disposition |
| --- | --- |
| Stop-decision workbench | Subcase of `service_change_coordination`, `rider_pain`, and future accessibility/equity work until there is a stop-level product. |
| Enforcement ROI planner | Subcase of `cost_effectiveness`, `corridor_project_evaluation`, and `treatment_inventory`; do not split into an enforcement-only family unless enforcement-specific data rights and decision owners appear. |
| Redesign decision log | Subcase of `timeline_events`, `document_claims`, `service_change_coordination`, and `board_reporting_package`. |
| Premium-service SLA monitor | Subcase of `reliability_wait` and `board_reporting_package` unless express-bus trip-level data becomes a dedicated product. |
| Capital/project prioritization | Subcase of `cost_effectiveness`, `corridor_project_evaluation`, and `compliance_package` until project portfolio data exists. |
| Real-time operations dashboard | Explicit non-goal for this inventory. |

## Surface Inventory

| Surface | User question | Primary answer | Current coverage |
| --- | --- | --- | --- |
| `/routes` discovery | Where should I look next, and why? | Ranked route sections by pain, trend, reliability, treatment gap, evidence readiness, and sparse data. | Partial: route sections exist; several sections still need richer read models. |
| Route header/KPIs | What route am I looking at, and what is the current headline condition? | Route identity, current speed/ridership/reliability/treatment/evidence readiness labels. | Partial: core route summary exists; reliability and evidence readiness are not yet complete. |
| Route overview | What is the route story in one screen? | Current condition plus worst segment, trend, rider impact, treatment posture, and evidence/caveat hooks. | Partial: current route detail exists; stronger v2 overview depends on child surfaces. |
| Route diagnosis workspace | Why did this route underperform, and what should the evidence author investigate first? | Ranked explanatory factors across schedule, service delivery, street context, demand, treatment, and source gaps. | Not built: current data supports pieces but no synthesized diagnosis artifact exists. |
| Area/geographic summary | What is happening with buses in this community board, council district, neighborhood, borough, or custom area? | Area rollups of route/segment pain, reliability, service delivery, treatment coverage, evidence readiness, and caveats. | Not built: route geography exists, but area allocation/read models are not first-class. |
| Slow segments | Where does the route lose the most time, and when? | Segment/daypart hotspots, rider exposure, persistence, and treatment overlap. | Partial: speed/segment detectors exist; route-segment top-k serving projection still needs hardening. |
| Reliability | Do buses arrive predictably? | EWT, bunching, long gaps, headway distributions, sample coverage, and source freshness. | Partial: detectors exist; dedicated route reliability read model is still not built enough for the tab. |
| Service delivery | Did scheduled service actually operate? | Scheduled-vs-operated service, cancellations, no-operator/no-vehicle indicators where available, trip coverage, and accountability caveats. | Partial: schedule, service-delivered, and CJTP inputs exist in pieces; no route service-delivery read model owns the question. |
| Riders | How many riders are affected, and where is delay concentrated? | Daily riders, route-hour exposure, rider-hours lost, and top delay-exposure segments. | Partial: ridership is present; stop-level passenger load remains unavailable. |
| Equity incidence | Which populations or places bear the most unaddressed bus pain? | Rider pain, treatment gaps, and service delivery joined to demographic/low-car/geographic context with caveats. | Partial/data-dependent: route equity context exists as a proxy; tract/catchment-quality incidence is not built. |
| Intervention catalog | What counts as an intervention, what interventions exist, and which ones touch this route? | Public intervention/treatment vocabulary, network inventory, route-specific rows, source refs, and status/date caveats. | Partial: inputs exist, but there is no first-class public intervention catalog/read model yet. |
| Interventions | What priority tools are already in place, and where are the gaps? | Treatment inventory, coverage, source gaps, and evaluation readiness. | Partial: route treatment summary materializer is the next canonical layer. |
| Corridor/project evaluation | Did this corridor/project work, should it advance, and what evidence can defend that claim? | Rider-weighted before/after, peer/counterfactual posture, treatment scope, caveats, and exportable scorecard. | Partial/research-only: event-study pieces exist, but no public corridor case artifact. |
| Cost/value | Was the route, corridor, treatment, or project worth the cost compared with alternatives? | Cost per rider-hour saved, cost per trip/time benefit, operating/capital/enforcement cost context, and uncertainty. | Not built: cost data is not yet a normalized substrate. |
| Timeline | What changed on or near this route, and what happened around those dates? | Reviewed dated official events aligned to route history. | Partial: route-timeline pilot/projection exists; needs wider review and serving rollout. |
| Evidence/data notes | What source coverage and caveats travel with this route? | Surface flags, source coverage, evidence refs, caveats, artifact hashes. | Partial: coverage flags exist; stable route evidence index is not built. |
| Compare | How are these routes different, are they comparable, and what explains the difference? | A/delta/B metrics, peer context, segment contrast, treatment/timeline/evidence deltas. | Partial: v1 scalar compare exists; v2 compare read models remain thin. |
| Brief authoring/review | How does evidence become an edited, reviewed, publishable brief? | Send-to-brief capture, composer content graph, typed blocks/refs, review comments, versioning, validation, and publish candidate export. | Partial: backend pieces exist; UI/content graph wiring is incomplete. |
| Findings/briefs | Which claims can be cited, reviewed, edited, or turned into a brief? | Promoted findings, evidence bundles, source refs, caveats, and brief-ready claim seeds. | Partial: promoted/reviewed finding plumbing exists; route evidence handoff needs unification. |
| Board/reporting package | What changed, why, and what can be safely put in a board, committee, audit, or press narrative? | Approved metric movement, explanatory candidates, caveats, source refs, and narrative/export blocks. | Partial: brief/finding plumbing exists, but no recurring board-report package model. |
| Compliance package | What evidence supports a Title VI, NTD, grant, redesign, or formal evaluation appendix? | Required tables, thresholds, source refs, methodology posture, caveats, and attachment checklist. | Adjacent/deferred: not a current public route tab, but a clear buyer workflow. |
| Disruption/service-change coordination | Which routes/stops are affected by a closure, event, redesign launch, or temporary change, and what rider/field artifacts are needed? | Impacted route/stop list, tasks, flyer/alert drafts, and coordination trail. | Adjacent/deferred: separate workflow beyond current route evidence studio. |
| Opportunity lab | Which route-specific anomalies are interesting but not yet public-contract claims? | Research-only candidates from detectors, Tier 2, and manual review. | Planning: should stay non-public until real candidates justify durable schema. |

## Canonical Question Families

### `route_attention`

User-facing question:

> Which routes deserve attention right now?

Product answer:

- A route can appear in one or more discovery sections with a reason and support level.
- "Needs attention" should combine performance pain, rider exposure, persistence, reliability, and
  source coverage rather than a single scalar.

Primary data:

- `route_kpi_summary`
- `route_section_rank`
- `route_month_history`
- route reliability and rider-impact summaries
- source/surface coverage states

Current implementation:

- Partially served by Snapshot 2.0 route sections.
- Detector inputs include speed, reliability, source gaps, trends, and treatment gaps.

Gap:

- Route sections need richer reliability, evidence readiness, treatment summary, and detector
  no-hit/skip coverage.

### `headline_condition`

User-facing question:

> What is the current condition of this route?

Product answer:

- Current speed, delay exposure, reliability, ridership, support level, and freshness labels.
- The route page must render even when child surfaces are unavailable.

Primary data:

- route identity/catalog rows
- current observed baseline month
- route summary metrics
- `StudioRouteSurfaceFlags`
- caveats and projection refs

Current implementation:

- Basic route index/detail support exists.
- Snapshot 2.0 full-route baseline is designed to separate route existence from rich artifacts.

Gap:

- The headline should stop implying a single freshness model; use the mixed-freshness publication
  doctrine when labeling baseline, current signal, and research-only surfaces.

### `rider_pain`

User-facing question:

> Where do delays affect the most people?

Product answer:

- Daily boardings, route-hour exposure, rider-hours lost, and top rider-impact segments.

Primary data:

- MTA route/hour ridership
- segment speed/travel-time rows
- route/segment delay exposure
- route/daypart profiles

Current implementation:

- Ridership and speed corpus exist.
- `delay_concentration` and rider-weighted EWT work cover pieces.

Gap:

- Stop-level or APC-quality passenger loads are not public enough for precise stop/hour load claims.
- Route/segment rider-impact read models need to become stable serving projections.

### `equity_incidence`

User-facing question:

> Which populations or places bear the most unaddressed bus pain?

Product answer:

- A prioritization lens that joins rider pain, treatment gaps, service delivery, and reliability
  burden to demographic and low-car context.
- This is not a formal Title VI package by default. It is a discovery and advocacy/oversight lens
  with explicit geographic-method caveats.

Primary data:

- route and segment rider-pain summaries
- route/service-delivery and reliability summaries
- ACS tract or county context, low-car households, public-transit commute share, and demographic
  context
- `area_route_allocation` from `geographic_rollup`; equity should consume the shared allocation
  layer rather than inventing a parallel route/tract/catchment method
- source coverage and caveat states

Current implementation:

- Route-level equity context exists as a county/borough proxy, and local tract ACS context exists.
- The public route evidence inventory does not yet treat demographic incidence as a first-class
  product question.

Gap:

- Build the shared `area_route_allocation` method under `geographic_rollup` before making precise
  demographic incidence claims.
- Keep accessibility, stop-level passenger loads, and APC-quality load claims deferred until better
  data exists.
- Add `equity_incidence` to route/area prioritization as a caveated lens, not as a compliance claim.

### `slow_segment`

User-facing question:

> Where does the route lose the most time, and when?

Product answer:

- Top route segments by observed slowness, persistence, daypart, rider exposure, and treatment
  overlap.

Primary data:

- route segment speed history
- segment/daypart residuals
- route-segment treatment summary
- segment evidence refs and caveats

Current implementation:

- `persistent_speed_hotspot`, `speed_pace_hotspot`, and `delay_concentration` cover the main
  detector families.
- Multi-year speed-history artifacts now exist locally for all spine routes.

Gap:

- Public route pages need the child endpoint/read model for top-k segments and speed-history carpet
  coverage labels.

### `reliability_wait`

User-facing question:

> Do buses arrive predictably, or do riders face bunching, long gaps, and excess wait?

Product answer:

- Observed headway/EWT metrics with sample coverage, scheduled baseline, route/hour distribution,
  and source freshness.

Primary data:

- GTFS-RT observed headways
- bus wait assessment / decomposed CJTP wait components where applicable
- scheduled headway baseline
- feed health and sample coverage
- route/hour ridership proxy for exposure

Current implementation:

- `observed_reliability`, `headway_reliability_ewt`, `bunching_hotspots`,
  `rider_weighted_excess_wait`, and `customer_journey_shortfall` cover the detector family.

Gap:

- The public route reliability tab still needs a compact `route_reliability_summary`, dense
  histogram artifacts where useful, and no-hit/insufficient-sample states.
- Reliability should consume decomposed wait/headway components, not raw CJTP shortfall totals that
  also include service-delivery or in-vehicle-time effects.

### `service_delivery`

User-facing question:

> Did the agency operate the service it promised?

Product answer:

- Scheduled-vs-operated service delivery by route, period, direction, and source coverage.
- Cancellation, dropped-trip, no-operator/no-vehicle, and service-delivered indicators where a
  public or source-backed input can support the claim.
- This is upstream of speed and wait: a bus that never ran should not be analyzed only as slow,
  bunched, or unreliable.

Primary data:

- GTFS static schedules and schedule versions
- service delivered, bus wait assessment, CJTP, or equivalent public service-delivery sources
- GTFS-RT/BusTime observed-vehicle coverage where sampled
- route/month/hour coverage states and source freshness
- cancellation/no-operator evidence when available from public reports or documents

Current implementation:

- Schedule, CJTP, observed reliability, and service-delivered inputs exist in pieces.
- `root_cause_diagnosis` names service delivery as a factor, but no family owns the direct
  accountability question.

Gap:

- Build `route_service_delivery_summary` and coverage/no-hit/skipped states before treating
  cancellations or scheduled-vs-operated misses as public route findings.
- This family owns CJTP decomposition. It should split customer-journey shortfall into wait,
  in-vehicle/runtime, and service-delivery/scheduled-vs-operated components, then expose the
  decomposed pieces for `reliability_wait`, `schedule_runtime_gap`, and `root_cause_diagnosis`.
- Keep source definitions explicit: scheduled service, observed service, agency-reported service
  delivered, decomposed CJTP components, and customer-journey shortfall totals are related but not
  interchangeable.

### `history_change`

User-facing question:

> Is this chronic, worsening, improving, or newly unusual?

Product answer:

- Multi-month route/segment speed, reliability, and ridership history; min-history labels; slopes;
  persistence windows; and schedule/source comparability caveats.
- Ridership demand trend is explicitly part of this family when the user-facing question is "is
  demand rising, falling, recovering, or shifting enough to explain the route story?"

Primary data:

- `route_month_history`
- multi-year route speed/ridership history
- stable route/segment spine
- schedule/version break markers

Current implementation:

- `multi_month_speed_peer`, `degradation_trend`, and `positive_deviance` cover core history/peer
  questions.
- Speed-history producer and R2 artifact contract are implemented locally.

Gap:

- Need public coverage/index layer for speed-history artifacts so route lists can advertise
  `series_ready`, `series_ready_with_gaps`, and `needs_pattern_review`.
- Add ridership-trend fields and claim posture to the history read models instead of creating a
  separate thin family for demand trend.

### `peer_context`

User-facing question:

> Is this route unusual compared with similar routes?

Product answer:

- Peer cohort, rank, percentile, residual, and caveats about comparability.

Primary data:

- route peer definitions
- route/month histories
- metric residual artifacts
- route family/borough/mileage/ridership metadata

Current implementation:

- Peer residuals are used by current trend/outlier detectors.

Gap:

- Peer context is still detector-centric. The compare page and route detail need stable
  `route_peer_context` rows.

### `schedule_runtime_gap`

User-facing question:

> Is the schedule aligned with observed travel time and wait conditions?

Product answer:

- Scheduled-vs-observed runtime/headway differences by route, direction, daypart, and source
  coverage.

Primary data:

- GTFS static schedules/timepoints
- route segment speed/travel time
- observed headways where available
- schedule version/coverage audit

Current implementation:

- `schedule_mismatch` and `travel_time_variability` cover the current runtime family.

Gap:

- Historical GTFS static coverage is not yet complete back to the start of the speed corpus, so
  multi-year schedule comparisons require explicit coverage labels.

### `root_cause_diagnosis`

User-facing question:

> Why did this route, corridor, or period underperform, and which explanation should we investigate
> first?

Product answer:

- A ranked explanation bundle, not a single magic cause.
- The bundle should separate schedule/runtime mismatch, service delivery, street/curb context,
  demand shifts, treatment gaps, source gaps, and residual unexplained movement.
- Each explanatory factor needs evidence, counter-evidence, and claim posture.

Primary data:

- route speed/reliability/ridership history
- schedule/runtime gap features
- service-delivery summary and decomposed CJTP components where available
- treatment inventory and intervention timeline
- external context windows such as permits, 311, weather, incidents, and street events
- source completeness states

Current implementation:

- The component families exist in pieces: speed, reliability, schedule mismatch, treatment gaps,
  context detectors, timelines, and source gaps.
- No current artifact synthesizes those pieces into a route diagnosis.

Gap:

- Build an applied-research `route_diagnosis_packet` before making this a public detector. It should
  emit factor scores, evidence/counter-evidence refs, missing inputs, and "needs review" posture.
- Diagnosis should consume decomposed components from `service_delivery`, `reliability_wait`, and
  `schedule_runtime_gap` rather than scoring the raw CJTP composite as another independent factor.

### `treatment_inventory`

User-facing question:

> What bus-priority treatments are in place, planned, historical, candidate, or source-gapped?

Product answer:

- Route/month and route/segment treatment rows with source family, status, date precision,
  geography scope, confidence, and caveats.

Primary data:

- ACE/ABLE datasets
- NYC DOT bus-lane geometry
- Tier 2 reviewed intervention records
- TSP evidence/source gaps
- local intervention events and comparison windows

Current implementation:

- Inputs exist in pieces.
- The route treatment summary materializer plan defines the canonical layer.

Gap:

- Build and serve `route_treatment_summary`, `route_segment_treatment_summary`, and
  `route_treatment_source_gap` before creating more treatment-specific detectors.

### `intervention_ontology`

User-facing questions:

> What is an intervention?
> What are all the interventions?
> What interventions are associated with this route?

Product answer:

- A glossary and browsable inventory, not a detector.
- "Intervention" should mean a source-backed project, policy, operational change, enforcement
  launch, street treatment, service redesign, or dated official action.
- "Treatment" should mean an as-of analytical state used by route/month/segment surfaces, such as
  bus-lane overlap, ACE coverage, historical TSP evidence, current source gap, or planned treatment.
- One intervention can produce multiple treatment rows across routes, months, segments, and source
  states.

Primary data:

- canonical treatment/intervention vocabulary
- `local_intervention_event`
- Tier 2 reviewed intervention records
- `intervention-publishable-v1.json`
- `intervention-publishable-v1-by-route.json`
- ACE/ABLE route evidence
- DOT bus-lane source inventory and route-shape overlap
- TSP evidence/source-gap rows
- source refs, date assertions, and route-resolution caveats

Current implementation:

- Partially covered by the route treatment materializer plan and route timeline work.
- The current product question inventory previously folded this into `treatment_inventory`, but that
  hides the simpler catalog/search questions.

Gap:

- Build a first-class public intervention catalog/read model before treating "all interventions" as
  a solved route-tab question.
- Suggested serving projections:
  - `intervention_catalog`: one row per canonical intervention/event/source-backed treatment concept.
  - `route_intervention_index`: route-keyed rows for "interventions for route X."
  - `intervention_route_link`: route, corridor, segment, source-only, and ambiguous route links.
  - `intervention_source_ref`: citations and date assertions.
- Suggested endpoints:
  - `GET /api/v1/studio/data/interventions`
  - `GET /api/v1/studio/data/interventions/:interventionId`
  - `GET /api/v1/studio/routes/:routeId/interventions`

### `treatment_gap`

User-facing question:

> Where is rider pain high but bus-priority treatment evidence is weak, missing, or poorly scoped?

Product answer:

- A review candidate that distinguishes true no-evidence, source gap, partial coverage, current
  treatment, and geometry unavailable.

Primary data:

- rider-pain summaries
- treatment inventory
- source gap rows
- route/segment treatment overlap

Current implementation:

- `intervention_gap`, `treatment_scope_gap`, and `treatment_scope_mismatch` cover the current
  detector family.

Gap:

- Calibrate false positives using reviewed decisions; especially terminal segments, physical
  node-pair dedupe, partial-vs-uncovered split, and stricter treatment refs.

### `intervention_effect`

User-facing question:

> Did performance change after a known intervention?

Product answer:

- Descriptive or peer-adjusted before/after evidence, with the causal claim ceiling enforced by
  method gates and human review.

Primary data:

- dated treatment/intervention events
- route/segment speed and reliability panels
- peer/control eligibility
- pre/post windows
- robustness/placebo diagnostics

Current implementation:

- `intervention_event_study` and `intervention_underperformance` exist as associational detectors.

Gap:

- Public effect language should wait for stronger methodology gates and route/treatment evaluation
  artifacts. Before/after visuals can be descriptive if labeled.

### `corridor_project_evaluation`

User-facing questions:

> Did this corridor or bus-priority project work?
> Should this concept advance?
> What evidence can defend that answer in a board, community-board, public, or consultant report?

Product answer:

- A project/corridor evidence case with observed before/after, peer or synthetic-control posture,
  rider-weighted impact, treatment scope, tradeoffs, caveats, and export-ready narrative.
- This is broader than `intervention_effect`: it can include pre-implementation concept selection,
  partial implementation, enforcement ROI, bus-lane/TSP/source gaps, and public-meeting evidence.

Primary data:

- corridor or route scope definition
- treatment/intervention inventory and dates
- speed/reliability/ridership panels
- peer/control eligibility
- bus-lane/TSP/ACE/ABLE/source-gap posture
- public documents, board materials, and corridor presentations
- external context and counter-evidence windows

Current implementation:

- `intervention_event_study`, `intervention_underperformance`, `treatment_scope_*`, and
  multi-year speed artifacts cover parts of this.
- The curb-pulse/natural-experiment plan points toward case-study payloads.

Gap:

- Build a corridor/project case artifact that composes existing route/treatment/timeline/evidence
  layers. Do not create a new detector until the case artifact defines clean eligibility, control
  posture, and public wording gates.

### `cost_effectiveness`

User-facing question:

> Was the route, corridor, treatment, or project worth the cost compared with alternatives?

Product answer:

- Cost/value evidence that can travel with a route, corridor, project, enforcement treatment, or
  capital-prioritization packet.
- This family composes into `corridor_project_evaluation`, `board_reporting_package`, and
  `compliance_package`; it owns the cost/value substrate and claim posture, not the whole corridor
  evaluation narrative.
- The product should distinguish cost source, cost type, time horizon, benefit metric, uncertainty,
  and what can safely be said publicly.
- Good corridor evidence can say what changed; cost-effectiveness answers whether the change was
  worth the spend or should beat another option.

Primary data:

- project, capital, operating, enforcement, or consultant cost statements from public sources
- treatment/intervention inventory and project scope
- rider-hours saved, travel-time savings, reliability improvement, ridership exposure, and
  service-delivery effects
- funding/grant/board materials and source refs
- peer or counterfactual posture when comparing alternatives

Current implementation:

- Corridor/project evaluation mentions enforcement ROI and capital/project prioritization, but cost
  is not yet a normalized substrate or claim posture.
- Tier 2 documents may contain public cost statements, but there is no cost extractor/proof layer.

Gap:

- Add cost fields to document feature extraction and proof ledgers before promising cost-per-benefit
  claims.
- Build a `project_cost_value_packet` or equivalent applied-research artifact that composes cost
  evidence with verified benefits and caveats.
- Keep "was it worth it" claims out of public project pages until source costs, benefit windows, and
  uncertainty are explicit.

### `timeline_events`

User-facing question:

> What changed on or near this route, and what happened around those dates?

Product answer:

- A dated, source-backed event timeline with route refs, source refs, date precision, status, and
  non-causal posture by default.

Primary data:

- Tier 2 route timeline bundles
- operational date assertions
- ACE/ABLE and DOT bus-lane event records
- route history overlays

Current implementation:

- Timeline pilot and serving projection exist for a small route set.
- Deterministic date normalization is preferred for broad current coverage.

Gap:

- Widen timeline curation/projection and keep model output ref-first so the runner hydrates known
  dates and source metadata instead of paying the model to rewrite them.

### `document_claims`

User-facing question:

> What do official/public documents claim, and do observed data or source coverage support it?

Product answer:

- Source-stated metric claims, causal claims, caveats, and contradiction/review candidates with
  evidence refs and claim posture.

Primary data:

- document-derived surfaces
- Tier 2 metric claims/events/context signals
- deterministic metric panels
- source coverage and source-gap rows

Current implementation:

- Tier 2 preserves claims and metric claims as research substrate.
- No mature public "document/data contradiction" detector exists yet.

Gap:

- Build relation/projection layers before creating a public contradiction detector. The first pass
  should probably be applied research: claim-to-metric alignment, eligibility, and review packets.

### `source_completeness`

User-facing question:

> What can we evaluate, what is missing, and what is blocked by source availability?

Product answer:

- Explicit states: available, available-not-fetched, upstream-blocked, downstream-blocked,
  derived-not-built, source-absent, partial, missing, and not applicable.

Primary data:

- source registry/captures
- local SQLite data-product manifests
- materialization coverage
- route/surface support flags

Current implementation:

- `source_gap` exists.
- Data-product completeness and coverage audits exist but have historically been too indirect.

Gap:

- Consolidate coverage/audit outputs around the product definition: what the site needs, what we
  have, what can be fetched, and what cannot be fetched yet.

### `evidence_readiness`

User-facing question:

> Which claims are safe enough to show, cite, review, or turn into a brief?

Product answer:

- Evidence refs, promoted findings, review state, caveats, artifact hashes, and public claim
  posture.

Primary data:

- promoted finding artifacts
- detector review packets and decisions
- route evidence index
- Tier 2 reviewed/promoted rows
- brief evidence catalog

Current implementation:

- Finding promotion/review plumbing exists.
- AI interaction doctrine defines artifact-shaped outputs, not chat.

Gap:

- Build stable `route_evidence_index` and `detector_public_coverage_summary` so "checked/no issue"
  and "reviewed/promoted" are visible without exposing raw candidates.

### `board_reporting_package`

User-facing question:

> What changed, why, and what can safely go into a board, committee, press, audit, or performance
> narrative?

Product answer:

- A recurring narrative package built from approved metrics, route/corridor evidence, caveats,
  source refs, and review status.
- The output should be an exportable brief/deck section/table appendix, not a chat answer.

Primary data:

- route and network metric movement
- route diagnosis packets
- promoted findings and evidence refs
- timeline and intervention changes
- source completeness and freshness
- comparison/cohort rows

Current implementation:

- Brief authoring, finding promotion, and evidence refs exist in pieces.
- No current model groups recurring board/reporting narratives by reporting period and claim posture.

Gap:

- Define `reporting_package` as a serving/research artifact after route diagnosis and evidence index
  exist. This is likely a composer/output workflow rather than a detector.

### `compliance_package`

User-facing question:

> What evidence supports a Title VI, NTD, grant, post-redesign, or formal evaluation appendix?

Product answer:

- A structured package of required tables, thresholds, source refs, methodology posture, caveats,
  and attachment/checklist state.
- For this repo, the near-term value is evidence assembly around bus-priority, redesign, corridor,
  route, and source-gap claims. Full NTD form validation is a separate product unless explicitly
  scoped.

Primary data:

- route/corridor performance and rider-impact summaries
- demographic/equity/accessibility context when available
- GTFS and route-change definitions
- source refs, public-comment/document rows, and board materials
- source completeness states and methodology notes

Current implementation:

- Not built as a product family.
- Some building blocks exist through evidence readiness, document claims, timelines, and route
  metrics.

Gap:

- Treat this as adjacent/deferred until there is a concrete compliance workflow. If implemented, it
  should start as `@bp/applied-research` package assembly, not as a detector.

### `external_context`

User-facing question:

> What nearby or recurring external context may explain, caveat, or prioritize the observed pattern?

Product answer:

- Context signals such as permits, 311, weather, traffic, school/event calendar, incidents, and
  document context attached as caveats or research hypotheses.

Primary data:

- permit/context source joins
- 311/service requests
- weather/traffic/incident/context artifacts
- Tier 2 context signals
- route/day/window panels

Current implementation:

- `permit_correlated_slowdown` and `service_request_context` exist.

Gap:

- Calendar/fingerprint, event-pulse, and curb-pressure signals should start as applied-research
  panels. They are not ready to be public causal detectors.

### `service_change_coordination`

User-facing question:

> Which routes and stops are affected by a closure, event, redesign launch, terminal move, or
> temporary service change, and what rider/field artifacts are needed?

Product answer:

- Impacted route/stop list, change reason, affected dates, field tasks, flyer/alert copy, and
  coordination trail.

Primary data:

- permit/closure/event intake
- GTFS routes/stops and planned service changes
- route/stop geography
- public notices, service alerts, and agency materials
- field/customer-communication templates

Current implementation:

- This is not a current route evidence surface.
- Existing source/context/timeline work may provide inputs, but the workflow is operational and
  stop/task oriented.

Gap:

- Keep deferred unless the product expands into disruption or service-change launch workflows. If it
  does, this should probably be a new product surface rather than another detector.

### `multi_year_patterns`

User-facing question:

> What does the panel reveal that one month cannot show?

Product answer:

- Route speed carpets, network anomaly nomination, segment pulse/case-study candidates, and
  evidence-gated multi-year narratives.

Primary data:

- stable segment spine
- route speed-history artifacts
- route/month history
- context/event windows
- natural-experiment case payloads when promoted

Current implementation:

- Speed spines and speed-history artifacts are generated locally for 385 routes.

Gap:

- Productize the coverage/index layer and UI carpet before designing more public pattern detectors.
  Research-only anomaly nominators can run ahead of public UI.

### `compare_cohort`

User-facing question:

> How are two routes different, are they comparable, and what explains the difference?

Product answer:

- A/delta/B rows, peer comparability, history, segment contrast, reliability, treatment, and
  evidence overlap.

Primary data:

- route compare metrics
- peer cohorts
- route segment top-k
- route treatment summary
- route evidence/timeline indexes

Current implementation:

- Compare exists in a thin scalar form.

Gap:

- Build `route_compare_metric`, `route_peer_context`, and child-surface refs before making compare
  a primary UX surface.

### `geographic_rollup`

User-facing question:

> What is happening with buses in this community board, council district, neighborhood, borough, or
> custom area?

Product answer:

- Area-level evidence packets that roll route and segment outcomes into the political/planning
  geographies where board members, electeds, community boards, advocates, and residents ask
  questions.
- The output should explain which routes/segments drive the area result and what caveats come from
  route-area allocation.

Primary data:

- route shapes, segment spine, stops, and route-area allocation weights
- district/community-board/neighborhood/borough boundary sources
- route/segment speed, reliability, rider-pain, service-delivery, treatment, timeline, and evidence
  readiness summaries
- demographic/equity context where claim posture allows it

Current implementation:

- Route borough labels and county-level equity proxies exist.
- No public area summary read model owns community-board/council/neighborhood rollups.

Gap:

- Build `area_route_allocation` and `area_summary` read models before claiming district-level
  service outcomes.
- Make allocation caveats visible, especially for long routes crossing multiple geographies.
- `equity_incidence` must consume this same allocation layer so demographic and political-geography
  caveats do not drift.

## Product Workflow Surfaces

These are product mechanisms, not canonical transit question families. They should still appear in
coverage matrices, but detectors and auto-research should map to the transit claim family they
support, then optionally name the workflow surface that consumes the output.

### `brief_authoring_workflow`

Workflow question:

> How does route, segment, finding, source, or metric evidence become an edited, reviewed, and
> publishable brief?

Product answer:

- A document-shaped authoring workflow where evidence objects become typed blocks/refs, prose is
  reviewed in place, agent proposals require approval, versions are created at approval boundaries,
  and publication is a deliberate validated export/promotion step.
- This workflow consumes `evidence_readiness`, `document_claims`, `board_reporting_package`,
  `corridor_project_evaluation`, `cost_effectiveness`, route evidence families, and promoted
  findings. It does not own a transit-substance claim by itself.

Primary data:

- route, segment, finding, metric, source, and artifact refs
- `bodyMd`, typed `BriefBlock`s, and `BriefRef`s
- send-to-brief attachments
- corpus palette candidate rows
- draft review threads, suggestions, validation, proposals, versions, and publish-candidate audit

Current implementation:

- Draft APIs, review/publish primitives, proposal/versioning backend pieces, shared brief prose
  renderer, composer shell, review shell, brief evidence/history pages, and send-to-brief UI exist
  in pieces.
- The UI is not yet fully on the content graph and send-to-brief does not persist captured objects
  as typed blocks/refs end to end.

Gap:

- Wire send-to-brief and `/briefs/new` to real draft creation/attach flows.
- Move composer/review/public reader onto the shared `bodyMd` + blocks + refs content graph.
- Connect review comments/suggestions, proposal approvals, validation repair, version milestones,
  and publish-candidate export in the UI.

## Cross-Cutting Substrates

These are not product question families because they do not describe a standalone user workflow.
They are required dimensions on artifacts produced by several families.

| Substrate | Owned by | Required posture |
| --- | --- | --- |
| `expected_baseline` | Applied-research panels, detector feature contracts, peer/history/schedule/read-model builders. | Every residual, anomaly, diagnosis, or "underperformed" claim should state the expected level, peer/cohort/method basis, and minimum-history/sample requirements. |
| `measurement_integrity` | Source completeness, evidence readiness, history-change, serving coverage, and detector-quality gates. | Every public change claim should pass or disclose feed outage, source lag, schedule-version, route-shape/spine, method-change, and artifact-coverage caveats. |

## Detector Coverage Map

| Question family | Current detector support | Non-detector support | Main gap |
| --- | --- | --- | --- |
| `route_attention` | speed, reliability, trend, treatment, source-gap detectors | route sections | richer section scoring and coverage/no-hit states |
| `headline_condition` | indirect | route index/detail | mixed-freshness labels |
| `rider_pain` | `delay_concentration`, rider-weighted EWT experimental | ridership/speed corpus | stable rider-impact read models |
| `equity_incidence` | none directly | route equity context, ACS tract/county context, rider-pain inputs | route/area allocation method and claim posture |
| `slow_segment` | `persistent_speed_hotspot`, `speed_pace_hotspot`, `delay_concentration` | speed-history artifacts | segment top-k and carpet UI |
| `reliability_wait` | five reliability/customer-experience detectors | GTFS-RT, decomposed CJTP wait components, observed headway artifacts | route reliability tab/read model |
| `service_delivery` | customer-journey/service-delivery pieces where available | GTFS schedules, CJTP decomposition, service-delivered inputs, observed-service coverage | route service-delivery summary and source definitions |
| `history_change` | `multi_month_speed_peer`, `degradation_trend`, `positive_deviance` | speed-history artifacts | public coverage/index and comparability labels |
| `peer_context` | peer residual detectors | planned compare/cohort rows | route peer context serving rows |
| `schedule_runtime_gap` | `schedule_mismatch`, `travel_time_variability` | GTFS/schedule tables | historical GTFS coverage and labels |
| `root_cause_diagnosis` | none as synthesis; component detectors exist | route diagnosis packet needed | applied-research factor bundle and evidence/counter-evidence refs |
| `treatment_inventory` | indirect | treatment materializer plan | canonical route treatment summary |
| `intervention_ontology` | none needed | treatment materializer, Tier 2 timelines, intervention events | public intervention catalog/read model |
| `treatment_gap` | `intervention_gap`, `treatment_scope_*` | treatment/source-gap inputs | calibration and source-state split |
| `intervention_effect` | `intervention_event_study`, `intervention_underperformance` | event panels | stronger method gates |
| `corridor_project_evaluation` | event/treatment detectors as components | curb-pulse/case-study plans, route evidence layers | corridor/project case artifact and public wording gates |
| `cost_effectiveness` | none directly | corridor/project evaluation, Tier 2 cost statements when extracted | cost substrate and cost/value packet |
| `timeline_events` | none as detector | Tier 2 timeline bundles | wider projection/review |
| `document_claims` | none mature | Tier 2 document surfaces | claim-to-metric relation layer |
| `source_completeness` | `source_gap` | coverage audits/manifests | product-aligned completeness spine |
| `evidence_readiness` | indirect through review/promotion | promoted findings/brief evidence | route evidence index |
| `board_reporting_package` | none directly; uses promoted outputs | brief/finding authoring pieces | period-scoped reporting package artifact |
| `compliance_package` | none directly | evidence/timeline/metric components | deferred applied-research package once workflow is scoped |
| `external_context` | permits and 311 detectors | context artifacts | recurring calendar/fingerprint panels |
| `service_change_coordination` | none; likely not detector-shaped | timeline/context/GTFS pieces | deferred product surface for disruption/change workflows |
| `multi_year_patterns` | trend/peer pieces | speed carpets/case-study plan | public carpet plus anomaly nominator |
| `compare_cohort` | peer residual pieces | compare endpoint plan | v2 compare read models |
| `geographic_rollup` | none directly | route geometry, route summaries, borough/county proxies | area allocation and area summary read models |

## Workflow Coverage Map

| Workflow surface | Consumes | Main gap |
| --- | --- | --- |
| `brief_authoring_workflow` | Evidence-ready route/segment/finding/source/metric refs from canonical families. | End-to-end send-to-brief, composer, review, validation, versioning, and publish-candidate wiring. |

## How To Use This Inventory

Before creating a detector:

1. Pick the canonical question family it serves.
2. Check [[wiki/analysis/detector_catalog|Detector Catalog]] for the closest existing detector.
3. If the question family already has a detector with the same grain and claim posture, improve the
   feature/model/calibration/review packet instead of adding a duplicate.
4. If the family is mostly a public serving question, build a read model or applied-research panel
   first.
5. If the family needs official documents, source gaps, timelines, or claim alignment, start in
   `@bp/applied-research` and keep raw candidates out of public UI.
6. If the output only helps a composer/review/publish flow, map it to the transit family it
   supports plus the workflow surface that consumes it; do not create a detector for the workflow.
7. Only promote to a new detector when the output can define clean hits, clean no-hits, skipped
   scopes, evidence roles, counter-evidence, and missing-data states.

Before changing the frontend:

1. Identify which surface row in this page the UI is answering.
2. Confirm the read model has a grain, freshness label, and empty state.
3. Confirm the claim posture is no stronger than the underlying detector/evidence gate.
4. Route data-coverage explanations to Data Notes unless the missingness is the primary point.

## Next Artifact

The next practical step is a generated/curated coverage matrix:

```text
product_question_family
  -> frontend surfaces
  -> required read models
  -> current detectors
  -> applied-research panels
  -> D1/R2 projections
  -> claim posture
  -> status
  -> blockers
```

This matrix can be produced from this inventory, the detector registry, the Snapshot 2.0 manifest,
and the route/data-product coverage audits. It should become the main way auto-research sessions
decide whether a proposed analytics task is novel, duplicate, or merely missing a serving
projection.

## Maintenance Rule

Update this page when:

- a new public page/tab or route section is added;
- a detector family is added, retired, or materially changes its question;
- Snapshot 2.0 adds a new read model;
- Tier 2 creates a new public evidence/timeline/document-claim projection;
- research changes the product wedge or allowed claim posture.

When the detector registry changes, update both this page and
[[wiki/analysis/detector_catalog|Detector Catalog]] if the product question family mapping changes.
