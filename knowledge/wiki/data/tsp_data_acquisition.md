---
title: Transit Signal Priority Data Acquisition
type: data
status: active
last_updated: 2026-06-06
owner: codex
source_count: 20
tags: [tsp, transit-signal-priority, interventions, source-gap, foil, bus-priority]
---

# Transit Signal Priority Data Acquisition

## Purpose

This page records the June 2026 research-output synthesis for finding NYC Transit Signal Priority
data through public sources, derived evidence, archives, FOIL requests, or agency partnership.

The core conclusion is strict:

> NYC's current TSP inventory is not publicly available as a usable per-intersection or per-route
> active-status dataset.

Public sources can support historical/corridor-level TSP evidence, aggregate legal/reporting gaps,
candidate corridors, and effect evaluation once a treatment date/location is known. They cannot
prove current active TSP at an exact intersection.

## Classification

| Question | Current answer |
|---|---|
| Is current NYC TSP inventory publicly available? | No, not as a per-location active inventory. |
| Is it partially reconstructable? | Yes, historically and at corridor/count level. |
| Can it be inferred from outcome data? | Only as `candidate_inferred_not_confirmed`. |
| Is FOIL or agency access required? | Yes, for authoritative current status, intersection IDs, activation dates, controller settings, and request/grant logs. |

## Claim Rules

| Evidence | Allowed claim |
|---|---|
| DOT/MTA current inventory plus active status and activation date | `current_confirmed` |
| Official historical document says TSP was installed on a corridor | `historical_confirmed` plus `current_status_unknown` |
| Official document says TSP was planned, funded, underway, or to be implemented | `planned_or_claimed` or `under_consideration` |
| Annual Streets Plan TSP count without location list | `current_status_source_gap` |
| Speed improvement after a project | `candidate_inferred_not_confirmed` only |
| SBS, bus lane, busway, queue jump, ACE/ABLE, or signal retiming | `not_tsp` unless the source explicitly says TSP |

Rule:

> Speed data can support or challenge a TSP claim. It must not create the TSP claim.

## Public Evidence Leads

These are leads from the research memo. Each row still needs normal source capture, extraction, and
source-backed validation before it can become a public claim.

| Source family | What it can support | Evidence posture | Caveat |
|---|---|---|---|
| NYC Administrative Code `19-199.1` / Streets Plan | Legal definition and annual TSP targets. | `source_gap` | Legal targets are not an inventory. |
| NYC Streets Plan annual updates | Aggregate yearly TSP completion counts. | `source_gap` | Counts do not identify intersections, routes, activation dates, or current status. |
| NYC Comptroller/IBO/Council materials | Independent confirmation that impact/location disclosure is incomplete. | `source_gap` | Secondary policy synthesis, not operational records. |
| NYC DOT 2017/2018 Green Means Go report and press release | Historical TSP corridors, early evaluations, planned expansion. | `historical_confirmed`, `performance_evaluated`, `planned_or_claimed` | Stale for current status. |
| Victory Boulevard pilot report and USDOT case materials | 2006/2008 Staten Island pilot history and evaluation. | `historical_confirmed`, `performance_evaluated` | Old pilot systems may be inactive or superseded. |
| MTA/DOT press releases and CB presentations | Corridor-specific TSP mentions such as B82, 149 Street, Soundview, Flatbush, M14, Northern Boulevard. | Usually `historical_confirmed`, `planned_or_claimed`, or `source_gap` | Usually no full intersection list or current active status. |
| Better Buses / bus-priority project pages | Current bus-priority corridor leads. | `planned_or_claimed` or `not_tsp` | Corridor page alone does not confirm TSP. |
| Procurement/vendor/ASTC specifications | Fields and logs that likely exist in operational systems. | `source_gap` | System capability is not location inventory. |
| MTA 2021 Annual Report to the Governor | Program scale: 626 intersections added in 2021 and 2,156 TSP-enabled intersections by year-end. | `source_gap` | Strong aggregate confirmation, but no intersection list, route map, activation dates, or current status. |
| NYCT Intelligent Transportation Signal Priority procurement | Current program/contract lead and likely system-documentation source. | `planned_or_claimed`, `source_gap` | Procurement evidence implies records and system needs; it is not a deployment inventory. |
| DOT PMMR/testimony/budget-consultation materials | Ongoing study/implementation activity, including study counts and route-study references. | `under_consideration`, `source_gap` | "Studying" or "expected to study" is not installed/active TSP. |
| MTA Bus Route Segment Speeds and CBD speeds | Effect evaluation after known intervention dates. | Candidate/evaluation support only | Timepoint-level speed includes many confounders. |
| MTA GTFS, Bus Time, Bus Stops/Routes, ridership | Geometry, schedule, live/recovered performance, and controls. | Candidate/evaluation support only | Current/live or aggregate sources, not TSP records. |

## Indexed Source Backlog

The 2026-06-06 indexing pass promoted the research memo's highest-value public leads into the
durable Tier 2 seed backlog. `knowledge/raw/tier2_document_backlog.json` now has 81 seed sources,
including 20 TSP/source-gap additions. Of those additions, 18 were not previously present in the
meeting-expanded backlog by URL; two high-value corridor PDFs were already present through recent
discovery and are now also durable reviewed seeds.

Generated inventory artifacts:

- `data/ops/docs/tsp-recommended-sources-20260606/recommended-source-index.json`
- `data/ops/docs/tsp-recommended-sources-20260606/recommended-source-index.md`
- `data/ops/docs/tsp-recommended-sources-20260606/augmented-backlog-with-tsp-recommended.json`
- `data/ops/docs/tsp-recommended-sources-20260606/tier2-source-coverage.json`

The merged available universe is now 2,779 sources: 455 captured, 368 OCR-derived, 175 verified/
materialized, 29 reviewed, and 19 promoted. For the 20 new durable TSP leads specifically, two are
already captured, 18 are not captured, and MTA-hosted document/press endpoints remain locally blocked
by HTTP 403 in the current capture environment. Stale public snippets for the legacy standalone
Victory Boulevard TSP fact sheet and guessed 2023/2024 Streets Plan PDF URLs were not added as
capture targets; the pass instead indexed live substitute/summary sources where available.

## Current Aggregate Leads

The newer research output adds a useful current-public-disclosure distinction:

| Lead | What it says | Evidence posture | Action |
|---|---|---|---|
| MTA 2021 annual report | MTA added TSP at 626 city intersections in 2021, bringing the reported total to 2,156 TSP-enabled intersections, and all eligible buses could activate TSP where applicable. | `source_gap` | Capture the report as aggregate evidence and request the underlying route/intersection mapping. |
| Streets Plan 2024-2025 reporting | Annual TSP completions are reported as benchmark counts, but locations are not disclosed. | `source_gap` | Capture current annual reports and request benchmark backup data. |
| DOT PMMR / budget consultation / testimony leads | DOT was studying or expected to study TSP across large intersection sets and multiple bus routes. | `under_consideration`, `source_gap` | Keep as study activity until a deployment record exists. |
| NYCT 2026 Intelligent Transportation Signal Priority procurement | NYCT had a current intelligent-TSP program/procurement lead, implying system records, vendor documentation, acceptance tests, and deployment planning should exist. | `planned_or_claimed`, `source_gap` | Add to FOIL/source-capture backlog; do not treat as a location list. |

These aggregate sources are valuable because they prove the public map is missing despite the program
being large. They should feed source-gap findings and FOIL requests before they feed any map layer.

## Corridor Candidates

These should feed a `tsp_candidate` layer, not a confirmed-current TSP map.

| Candidate | Public basis | Required validation | Public posture |
|---|---|---|---|
| 2017-2020 Green Means Go expansion list | Planned/future corridors in historical DOT TSP materials: Q44/Main, M60/125th-LaGuardia, B46 extension, S62/S92 Victory extension, Q25/Kissena, Q43/Hillside, Q5/Merrick, Bx6, B82, Q52/Q53/Woodhaven, and Bx12/Fordham. | Activation list, intersection IDs, acceptance dates, logs. | Candidate; low current-status confidence. |
| Streets Plan 2022-present annual installations | Reported annual TSP counts. | Benchmark backup data and dedup/intersection list. | Aggregate source gap; no location map. |
| Northern Boulevard / Q66 | DOT project materials said TSP was being implemented. | Completion memo, controller list, activation dates. | Planned/underway candidate. |
| Adaptive TSP grant corridors | Research memo identified Northern, Tremont, Church/Linden, Flatbush, and Utica leads. | Grant award, project schedule, existing-vs-adaptive distinction. | Planned/adaptive candidate. |
| Better Buses corridors | Current DOT bus-priority corridor pages. | Project PDFs must explicitly say TSP, then activation records. | Low-medium candidate. |
| Bronx redesign priority corridors | Redesign materials mention bus-priority treatments. | DOT final designs and TSP activation records. | Low-medium candidate. |
| CBD bus-priority signal locations | DOT aggregate public statements about bus-priority signal technology. | Exact CBD intersection list and signal/controller IDs. | Aggregate source gap. |
| Outcome-only speed anomalies | Speed panels can show suspicious changes. | Official TSP record or request/grant logs. | Low-confidence candidate only. |

Keep these in `under_consideration`, not `candidate_inferred_not_confirmed`, unless later source
capture finds corridor-specific deployment language:

| Corridor/source type | Why |
|---|---|
| 34th Street enhanced bus-priority presentations | TSP appears as toolkit/current-work language, not confirmed deployment. |
| Grand Street / Grand Avenue project presentations | TSP appears as a possible toolkit item, not confirmed deployment. |
| Generic Better Buses corridor pages | Bus lanes, queue jumps, signal phases, stop changes, and retiming are not automatically TSP. |

## Derived Evaluation Workflow

A defensible public-data workflow can evaluate known or candidate TSP, but only after the treatment
record exists.

1. Build candidate set from official project PDFs, historical TSP reports, Streets Plan counts,
   MTA/DOT releases, and Better Buses pages.
2. Map candidates to signalized intersections using DOT signal/location records where available,
   MTA routes/stops, GTFS static, and street geometry.
3. Build pre/post panels from MTA segment speeds, CBD bus speeds, Bus Time/GTFS-RT where collected
   or archived, schedules, route changes, stop changes, and ridership.
4. Control for bus lanes, busways, queue jumps, stop consolidation, ACE/ABLE, construction permits,
   events, weather, holidays, congestion, school calendars, service changes, and redesigns.
5. Look for signal-level signatures when data permits: reduced red delay, fewer red-light stops,
   approach-specific delay changes, direction-specific effects, and time-of-day patterns consistent
   with TSP settings.
6. Graduate only with authoritative validation: current inventory, controller config, TSP phase
   plan, activation date, request/grant logs, or agency confirmation.

## Data Acquisition Plan

### Immediately Downloadable

- Historical DOT TSP reports, Victory pilot materials, SBS reports, DOT/MTA releases.
- Streets Plan updates, Admin Code, Comptroller/IBO/Council materials.
- MTA Bus Route Segment Speeds and CBD Bus Speeds.
- MTA routes/stops, GTFS static, Bus Time APIs, and bus hourly ridership.
- DOT bus lanes, traffic speeds, RTPI/camera/open-street/construction feeds where relevant.

### Public But Extraction-Heavy

- DOT Better Buses and corridor PDFs.
- Community-board presentations.
- MTA board books and committee materials.
- NYC Council testimony and transcripts.
- Procurement specifications, vendor case studies, and technical architecture documents.
- Capital program and budget references.

### Archive Leads

- Old NYC DOT BRT/SBS pages under `nyc.gov/html/brt`.
- Former MTA Bus Time historical-data pages.
- Unofficial historical GTFS/Bus Time mirrors.
- Academic/GitHub projects that archived MTA Bus Time samples.

### FOIL / Records Requests

FOIL is required for authoritative current status. Request existing records in native electronic
formats. The high-value record classes are:

- current and historical TSP inventory;
- intersections counted toward Streets Plan TSP targets by year;
- activation, acceptance, deactivation, removal, testing, and status dates;
- route/corridor to signal/intersection/controller mappings;
- signal IDs, controller IDs, phase/timing plans, and TSP strategy parameters;
- request, grant, denial, reason-code, latency, and event logs;
- data dictionaries, schemas, API docs, and interface control documents;
- project trackers, work orders, acceptance tests, field tests, completion reports;
- before/after evaluations after 2017;
- vendor statements of work, specifications, acceptance tests, and system documentation;
- adaptive TSP project scopes, data pipelines, algorithms, schedules, and implementation status;
- NYCT Intelligent Transportation Signal Priority program solicitations, scopes, award records,
  implementation plans, and acceptance-test deliverables;
- MTA bus/fleet/onboard-device capability records and Bus Time/TSP integration records.

### Agency Partnership

Some likely records may be security-sensitive or operationally restricted:

- live TMC/ASTC/ATMS interfaces;
- GTT/Opticom or successor TSP server logs;
- MTA Bus Command Center integration logs;
- raw historical AVL archives at full resolution;
- adaptive TSP prediction models;
- controller firmware/configuration exports;
- vendor dashboards and maintenance records.

## Product Data Model

Recommended internal entities:

| Entity | Purpose |
|---|---|
| `tsp_location` | Geometry, intersection, signal/controller ID, route/corridor, status, evidence label, confidence, source refs. |
| `tsp_event` | Planned, studied, installed, activated, disabled, removed, upgraded, or adaptive-upgrade events. |
| `tsp_source` | Source title, agency, date, URL/path, page, quote/span refs, stale flag, evidence label. |
| `tsp_effect_estimate` | Route/segment, metric, pre/post period, method, controls, result, caveat. |
| `tsp_candidate` | Candidate reason, required validation, false-positive risks, confidence. |

Display rules:

| Product layer | Safe claim |
|---|---|
| Confirmed current TSP | "This intersection is confirmed active as of [date]." |
| Historical TSP | "TSP was documented here in [source/date]. Current status is unknown." |
| Planned/proposed TSP | "TSP was planned/proposed/funded/underway." |
| Source gap | "DOT/MTA reported [count] TSP intersections in [year], but locations were not disclosed." |
| Inferred candidate | "Candidate TSP location needing validation." |
| Performance effect | "Bus speeds/travel times changed after [project/date]." |

Unsafe claims without agency records:

- This exact intersection currently has active TSP.
- All SBS routes have TSP.
- All intersections on a TSP corridor have TSP.
- Bus speed improvement proves TSP.
- A bus lane, busway, queue jump, ACE/ABLE camera, or signal-retiming project is TSP.
- Streets Plan aggregate counts can be mapped to specific intersections without DOT backup data.

## Next Actions

1. Add a source-capture backlog for the public TSP leads above, starting with official DOT/MTA pages
   already in Tier 2 and the new Streets Plan/PMMR/Council/adaptive-grant/NYCT-procurement leads.
2. Build a deterministic `tsp_source_inventory` artifact from Tier 2/public sources, with evidence
   status and stale/current posture.
3. Add the MTA 2021 annual-report aggregate count as `source_gap` evidence, not route/intersection
   truth.
4. Keep the current Studio TSP layer caveated as a dated source snapshot until a current inventory is
   acquired.
5. Draft and file narrower DOT/MTA FOIL requests, ideally split into inventory/count-backup first
   and logs/controller records later.
6. Use the resulting candidate layer to prioritize route evidence packets, not to publish confirmed
   current TSP claims.

## See Also

- [[wiki/project/opportunity_data_map|Opportunity Data Map]]
- [[wiki/data/source_registry|Source Registry]]
- [[wiki/data/public_facing_data_catalog|Public-Facing Data Catalog]]
- [[wiki/data/intervention_source_coverage|Intervention Source Coverage]]
