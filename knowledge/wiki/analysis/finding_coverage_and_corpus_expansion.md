---
title: Finding Coverage and Corpus Expansion
type: analysis
status: active
last_updated: 2026-05-23
owner: codex
source_count: 12
tags: [findings, corpus, data-quality, pipeline-v2, false-negatives]
---

# Finding Coverage and Corpus Expansion

## Purpose

After Pipeline v1, the next analytical risk is missed findings. A quiet route/corridor can mean one of three things:

1. The route is genuinely not showing a problem in the current evidence.
2. The algorithms did not look for the right pattern.
3. The evidence needed to see the pattern is missing, late, too coarse, or not joined correctly.

Pipeline v2 should treat all three cases explicitly. The goal is not just to ingest more data. The goal is to make the app honest about what it looked for, what it found, and what it could not evaluate.

## Implementation Status - 2026-05-23

Finding Coverage v1 now has an implemented local evidence spine for the March 2026 release:

- `audit:source-coverage` writes source evidence eligibility for 12 source groups, including
  allowed evidence roles, detector eligibility, and automatic-promotion flags.
- `findings:signal-features` writes 381 route-month signal features with all normalized context
  source counts, match weights, high-confidence touch counts, fanout, and provenance.
- `findings:detect` writes eight detector families, 675 candidates, 1,817 evidence links, 3,066
  coverage rows, and a review queue. Detector candidates now receive route-month context evidence
  links in addition to their primary metric/source evidence, and most service/context/intervention
  detectors emit explicit counter-evidence rows.
- `build:studio-release` fills public Studio findings from the detector review queue before using
  any route-score fallback. The March proof produces 50 public findings: 2 reviewed/manual findings
  and 48 detector-derived review candidates.
- `audit:evidence-corpus` verifies the chain. The latest March 2026 detector pass has 12 source
  eligibility rows, 381 route-month features, 6 context sources, 675 detector candidates, 1,817
  evidence links, 3,066 coverage rows, and zero unlinked review-queue candidates.
- Studio finding payloads now carry optional review provenance. Manual B25/BX41 findings are marked
  reviewed/approved, detector-queue findings are marked review candidates with candidate and
  detector IDs, and route-score fallback findings are marked generated candidates.
- `audit:studio-coverage` verifies that review provenance before publish. The March audit passes
  with 2 reviewed findings, 48 review candidates, 0 generated fallback findings, 0 missing review
  records, and no detector review candidate marked approved.

Important boundary: this makes all normalized context data available as evidence context, but it
does not mean every source can drive primary detector claims. Parking remains context-only until
fanout, weights, and promotion rules are explicitly reviewed. The new `multi_month_speed_peer`
detector is also review-only: it uses a broad route-corpus median, not a matched peer/control set.

## Post-v1 Answer

Pipeline v1 should end with a reproducible March 2026 serving release, production source refresh operations, Studio projections, and documented methodology gates. The next phase should be **Finding Coverage v1**:

- Define the universe of possible findings as route x direction x segment/corridor x month x daypart.
- Run multiple detectors over that universe instead of depending on one route score or one hotspot ranking.
- Emit a coverage audit that records detector hits, detector misses, and data gaps.
- Surface "insufficient evidence" as a product state in briefs and reviewer queues, not as silence.
- Expand the source corpus only when the new source reduces a known false-negative risk.

## Detector Architecture Audit - 2026-05-19

The detector should be a local pipeline subsystem, not a Studio/UI feature first. The public Studio
finding schema is useful for cards and reasoning trails, but it is too product-shaped to be the
canonical detector output. Canonical outputs should flow through typed local detector rows, evidence
links, and coverage audit rows; Studio projections should be generated only from reviewed or
promoted candidates.

Current local state already contains the detector storage spine:

- `local_context_event`
- `local_context_event_route_touch`
- `local_finding_candidate`
- `local_finding_evidence_link`
- `local_finding_coverage_audit`
- `packages/db/src/local/repositories/findings.ts`
- `build:context-events`
- `build:context-event-route-touches`

Manual local DB audit from `data/local/pipeline.sqlite` on 2026-05-19:

| Table / signal | Count / status |
|---|---:|
| `local_finding_candidate` | 0 |
| `local_finding_evidence_link` | 0 |
| `local_finding_coverage_audit` | 0 |
| `local_context_event` | 412,685 |
| `local_context_event_route_touch` | local bridge added after audit; rebuild from context events + route-LION links |
| `local_route_hotspot` | 3,097 |
| `local_route_hotspot_summary` | 381 |
| `local_route_observed_reliability_summary` | 762 rows across March and May runs |
| `local_route_intervention_comparison` | 360 |
| `local_corridor_month_summary` | 193 |
| `local_route_lion_link` | 283,557 route-to-LION links across 378 routes |

March 2026 has enough inputs for a first detector pass, but not enough for every detector:

- Observed reliability has 346 observed routes and 35 insufficient-sample routes for March 2026.
- Intervention evaluation has 80 evaluated peer-adjusted rows, 161 insufficient-pre-data rows,
  2 insufficient-post-data rows, 2 future-intervention rows, and 115 bus-lane source-gap rows.
- Context events are large enough for caveats and review tasks, but route-level LION matching is
  broad. The average physical street segment maps to 4.25 routes, with a maximum of 59 routes, so
  route-LION event touches must carry provenance and fanout. Direct route-keyed events are
  `primary` evidence; route-LION-expanded touches are `context` evidence unless a later source
  provides a stronger route-specific key.
- Parking-violation geocoding is in flight under task `bq0nmjpyi`: 71,428 of 186,096 rows had
  been attempted at the latest status check, with 13,963 rows carrying `physical_id`. Do not use
  parking rows in detector scoring until that pass finishes, `build:context-events` is rerun, and
  final hit rates are spot-checked.
- DOT traffic-speed snapshots are May current-signal evidence, not March baseline evidence.

One correctness risk surfaced during audit: March observed reliability rows currently have null
scheduled-baseline fields even though `local_route_reliability_baseline` has March scheduled
headway rows. Reliability detectors should join the scheduled baseline table directly and add a QA
check before ranking excess wait or wait-reliability ratios.

### Package Ownership

Use a three-layer implementation:

| Layer | Location | Responsibility |
|---|---|---|
| Domain contracts | `packages/domain` | Strict Zod schemas for detector ids, candidate rows, evidence links, coverage audits, confidence, review state, and reason codes. |
| Pure detector algorithms | `packages/analytics/src/findings/` | Deterministic scoring over typed inputs. No DB, filesystem, Worker, or source-fetching imports. |
| Pipeline orchestration | `tools/pipeline/src/jobs/build/findings.ts` | Load local DB inputs, run detector matrix, replace candidate/evidence/audit rows idempotently, write R2-ready audit artifacts. |
| Local storage | `packages/db/local` | Replace-by-run repositories, query helpers, indexes, and source/evidence refs. |
| Public projection | `tools/pipeline/src/jobs/build/studio-release.ts` and later D1/R2 export | Convert only reviewed or promoted candidates into Studio cards and brief seeds. |

Target command:

```bash
bun run findings:detect -- --year 2026 --month 3
```

The first implementation should not call an LLM. LLM processing can draft wording later from
deterministic candidates, but the detector pass itself should only emit structured candidate rows,
evidence refs, coverage rows, and source-gap rows.

### Detector v1 Order

Build detectors in this order:

1. **Source-gap detector.** First because it validates the contract and immediately prevents
   false "nothing to see here" states. Emit candidates for missing speed, missing geometry,
   insufficient GTFS-RT, missing scheduled baseline, bus-lane implementation-date gaps, failed
   context joins, and source-lag states.
2. **Persistent speed hotspot detector.** Reuse existing hotspot outputs but treat top-10 hotspots
   as publication candidates, not the whole considered universe. Add all-segment coverage counts or
   explicit skipped coverage before claiming no speed hotspot.
3. **Observed reliability detector.** Combine observed GTFS-RT summaries, scheduled reliability
   baseline, and MTA Bus Wait Assessment. Candidate when observed reliability is poor, source
   samples are sufficient, and scheduled baseline/wait-assessment evidence is present.
4. **Intervention gap detector.** Candidate when rider-impact pain is high and ACE/bus-lane
   treatment evidence is absent or thin. Do not treat missing treatment dates as "no treatment";
   that is a source-gap candidate.
5. **Intervention underperformance detector.** Candidate when an implemented treatment has
   peer-adjusted before/after evidence and current pain remains high. Keep language descriptive
   until the methodology gate allows stronger claims.
6. **Source-specific context and peer-history starters.** `service_request_context` and
   `multi_month_speed_peer` now exist as cautious review-candidate detectors. 311 context includes
   fanout/match-weight counter-evidence; multi-month peer speed includes broad-peer limitations.

Defer richer context-correlated disruption, matched-peer residual, and positive-deviance detectors
until the candidate/evidence/audit loop has reviewer promotion artifacts. Context-event data already
exists, but the joins need normalization by route overlap, route length, event density, source
coverage, and time window before they can support more than caveats or review prompts.

### Candidate Contract Gaps

The existing local tables are a good start, but they need hardening before detector output becomes
durable:

- Add `month`, `scope_kind`, `scope_id`, `category`, `confidence`, `detector_score`,
  `reason_code`, `review_state`, and `claim_safe_label` to `local_finding_candidate`.
- Extend evidence kinds beyond `metric`, `context_event`, `source_row`, and `missing_data` to
  include `source_doc` and `coverage_audit`.
- Add idempotent repository methods such as `replaceFindingRun(detectorRunId)` or
  `replaceFindingsForMonth(month, detectorId)`. Current methods are insert-only.
- Add indexes for common detector reads:
  - `local_context_event(physical_id, occurred_at)`
  - `local_context_event(route_id, occurred_at)`
  - `local_route_lion_link(physical_id)`
  - `local_context_event_route_touch(route_id, occurred_at)`
  - `local_context_event_route_touch(occurred_at, route_id)`
  - `local_context_event_route_touch(event_kind, occurred_at)`
  - `local_finding_candidate(month, detector_id, route_id)`
  - `local_finding_coverage_audit(detector_run_id, detector_id, outcome)`
- Preserve detailed evidence payloads and sampled join QA in R2/local artifacts. Keep D1 limited
  to compact promoted finding summaries and stable evidence refs.

### Algorithm Notes

Detector outputs should use bounded scores and explicit labels, not free prose:

- `detector_score`: 0-100 rank score for sorting candidates within a detector.
- `severity`: `info`, `low`, `medium`, `high`.
- `confidence`: source sufficiency and join quality, not rhetorical certainty.
- `status`: lifecycle state such as `open`, `promoted`, `dismissed`, or `superseded`.
- `review_state`: reviewer workflow state such as `unreviewed`, `needs_review`, `approved`,
  `rejected`.
- `reason_code`: stable machine-readable reason such as `missing_speed`,
  `insufficient_gtfs_rt_samples`, `persistent_low_speed`, `high_long_gap_share`,
  `bus_lane_date_gap`, or `negative_peer_adjusted_delta`.

For every detector and release month, the audit should record:

- considered scopes;
- hits;
- clean no-hits;
- skipped scopes and reasons;
- near-miss threshold distributions;
- source rows expected vs seen;
- join success rates;
- top examples for manual QA.

This audit is as important as the findings. A route with no candidate should still have a coverage
row proving whether the detector looked cleanly or skipped because evidence was missing.

## False-negative Risk Model

| Risk | What it looks like | Mitigation |
|---|---|---|
| Detector gap | Slowdown, reliability, or intervention issues exist but no algorithm targets that shape | Add detector matrix and backtests |
| Data gap | Detector exists, but source evidence is missing, lagged, sparse, or too coarse | Add source-gap findings and corpus backlog |
| Join gap | Source exists, but route/stop/street/time joins fail | Add join coverage metrics and sampled review |
| Threshold gap | Signal is real but below static cutoffs | Add peer residuals, trend/change detectors, and percentile ranks |
| Context gap | Temporary construction, collisions, events, weather, or alerts distort the signal | Add context-event overlays and caveats |
| Review gap | Algorithmic candidate exists but claim is too strong or poorly worded | Add reviewer state and claim validation |

## Detector Matrix

Each detector should emit a bounded `FindingCandidate` with evidence links, confidence labels, missing-data labels, and reviewer state.

| Detector | Question | Primary evidence | Why it helps recall |
|---|---|---|---|
| Persistent speed hotspot | Where are buses slow repeatedly? | MTA route segment speeds | Existing core detector |
| Multi-month persistence | Is the issue chronic or a one-month spike? | 2023-2026 speed history | Avoids missing slow-but-steady corridors |
| Change point / regression | Did a route or corridor get worse recently? | Speed, ridership, schedule, reliability trends | Finds emerging issues not yet worst-in-network |
| Peer residual | Is this route worse than comparable routes after borough/type/ridership controls? | Peer-normalized speed/reliability | Finds outliers hidden by absolute thresholds |
| Observed reliability | Where are bunching and long gaps concentrated? | GTFS-RT observed headways | Finds rider pain that average speed misses |
| Schedule mismatch | Where is observed travel time far from schedule? | Segment speed plus schedule timepoints | Finds timetable/reliability gaps |
| Intervention gap | Where is there high rider pain and little bus-priority treatment? | Hotspots, bus lanes, ACE, alerts | Finds action opportunities |
| Intervention underperformance | Where did a treatment not improve enough? | Before/after plus peer baselines | Prevents "installed equals solved" narratives |
| Context-correlated disruption | Are crashes, construction, permits, alerts, or traffic spikes explaining the finding? | Context-event overlays | Separates chronic problems from temporary disruption |
| Source-gap detector | Which routes/corridors cannot be evaluated? | Source coverage audit | Turns missing data into a visible finding |
| Positive deviance | Which similar routes improved and why? | Trends plus treatment/context docs | Finds patterns worth copying |

## Coverage Audit

For every release month, write a coverage artifact with:

- route/month count by detector considered, hit, no-hit, and skipped;
- segment/corridor geometry join success rates;
- GTFS-RT sample coverage by route, direction, stop, and daypart;
- source freshness and publication-lag labels;
- detector threshold distributions and top near-misses;
- source-gap findings where a claim would be useful but evidence is insufficient;
- manually reviewed known corridors and whether detectors surfaced them.

This is the antidote to quiet false negatives. If a route has no finding, the audit should say whether it was evaluated cleanly or whether it fell through a data/join/review gap.

## Backtesting and Review

Build a small "known issue / known intervention" review set before adding too many new algorithms.

Seed examples from:

- MTA ACE/ABLE routes and implementation dates.
- NYC DOT bus-priority corridors and bus-lane local-street segments.
- MTA bus segment speed blog examples.
- Public MTA board/committee materials mentioning bus performance, reliability, ACE, bus lanes, redesigns, or customer experience.
- A hand-curated list of route/corridor briefs reviewed by humans.

Backtest goals:

- Did at least one detector surface each known corridor?
- Was the surfaced evidence the right evidence, or an accidental proxy?
- Were false positives caused by temporary disruption or bad joins?
- Did source-gap rows explain missing cases?

This should be framed as recall-oriented QA, not a causal validation study.

## Where LLM Processing Helps

LLM processing is most valuable around unstructured evidence, source triage, and reviewer workflow. It should produce cited candidates for deterministic validation, not final metrics.
Product-facing output from this processing must follow [[wiki/project/ai_interaction_model|AI Interaction Model]].

| Area | Useful LLM work | Promotion rule |
|---|---|---|
| Corpus expansion | Read dataset pages, board packets, project pages, and press releases; suggest source cards with purpose, join keys, date range, caveats, and priority | Source stays candidate until `sources:probe` or a purpose-built validator confirms schema/freshness/terms |
| Document extraction | Extract intervention names, route mentions, corridor names, implementation dates, official claims, caveats, and source spans | Structured extraction must keep source URL, document date, quoted span/offset, and confidence |
| Entity linking | Suggest links from text like "Fordham Road SBS" or "M15 full ACE coverage" to route IDs, corridors, bus-lane segments, and ACE records | Deterministic route/street/geospatial match must confirm before use in a public claim |
| Finding hypothesis generation | Given computed metrics plus retrieved docs, propose "look here" questions for analysts | Hypotheses become review tasks, not findings, until backed by detector output |
| Source-gap triage | Summarize why a route/corridor was skipped and what evidence would unblock it | Coverage audit remains canonical; LLM only explains and prioritizes |
| Brief/composer support | Draft plain-language claims, caveats, reviewer notes, and source comparison text | Server-side validation verifies every numeric claim and evidence link before publish |
| Backtest set building | Mine docs for known corridors/interventions to seed recall tests | Human review or deterministic source match approves the gold-set row |

### LLM Processing Should Not Own

- numeric scoring, speed/ridership/reliability calculations, or row counts;
- causal effect estimates;
- active/inactive source status;
- realtime rider guidance;
- source freshness claims unless backed by probe metadata;
- publishing claims without the composer validation gate.

### Candidate Artifacts

The LLM layer should write candidate artifacts that downstream code can accept or reject:

- `candidate_source_note`: source URL, title, owner, suspected dataset/document type, purpose, date range, join keys, caveats, terms note.
- `document_claim_candidate`: source URL/date, extracted claim, cited span, claim type, mentioned route/corridor/intervention, confidence.
- `entity_link_candidate`: mention text, candidate route/corridor/source IDs, linking rationale, deterministic validation status.
- `review_question_candidate`: route/corridor, reason, evidence refs, missing data needed.
- `llm_extraction_audit`: model/version/prompt hash, source hash, extraction timestamp, validation status.

R2 can hold extracted document chunks and candidate JSON. D1 should only serve promoted compact summaries, validation states, and stable evidence references.

## Corpus Expansion Tiers

### Tier 0: existing v1 corpus

Already in the source registry:

- MTA route segment speeds, current routes/stops, historical routes/stops, schedules, GTFS static, Bus Time GTFS-RT snapshots, ridership, ACE routes/violations, NYC DOT bus lanes, ACS tract context, borough boundaries, and policy docs.

### Tier 1: high-value structured sources

These sources reduce concrete false-negative risks and have public structured endpoints. They are
now in the source registry and several are active in the local pipeline. Do not add detector claims
from them until a source-specific ingest, join coverage check, and sampled QA exist for the release
month being evaluated.

| Candidate source | Candidate ID / URL | Use | False-negative risk reduced |
|---|---:|---|---|
| MTA Bus Wait Assessment | `v4z4-2h6n` | Official monthly route-level wait assessment | Reliability issues missed by speed-only methods |
| NYC DOT Traffic Speeds | `i4gi-tjb9` | Road congestion context from DOT sensors | Slow bus segments caused by networkwide traffic spikes |
| NYC DOT Automated Traffic Volume Counts | `7ym2-wayt` | Traffic pressure and demand context | Corridors with structural traffic load but modest bus samples |
| NYC DOT Street Construction Permits | `tqtj-sjs8` | Active/issued roadway and sidewalk work | Temporary construction masking or explaining hotspots |
| NYC DOT Street Opening Permits | `9jic-byiu` | Street-opening disruption context | Missing construction/utility work near slow segments |
| NYPD Motor Vehicle Collisions - Crashes | `h9gi-nx95` | Crash disruption and safety context | Incident-heavy corridors misread as chronic operations issues |
| 311 Service Requests, 2020-present | `erm2-nwe9` | Complaints about traffic signals, blocked streets, parking, street defects | Street-level issues not visible in MTA feeds |
| 311 Service Requests, 2010-2019 | `76ig-c548` | Historical 311 baseline | Longitudinal context without overloading the current table |
| Parking Violations Issued, current fiscal year | `pvqr-7yc4` | Curb and illegal-standing proxy, including bus stop / bus lane relevant codes after filtering | Blockage pressure not captured by ACE routes alone |
| NYC LION / street centerline | DCP LION page | Stable street segment IDs and street geometry joins | Missed joins between bus lanes, permits, traffic counts, and routes |

### Tier 2: intervention and policy document corpus

Use targeted markdown summaries and metadata, not giant PDF dumps:

- MTA board and committee materials for bus performance, customer experience, ACE, open data, and bus redesign updates.
- NYC DOT bus priority project pages, SBS/BRT pages, and Better Buses materials.
- MTA borough bus network redesign documents and implementation schedules.
- NYC Streets Plan / DOT annual reports where bus priority milestones are described.
- Dataset dictionaries and methodology PDFs for every source used in a claim.

This tier helps the composer produce grounded briefs and helps reviewers distinguish "computed evidence" from "officially announced intervention."
The concrete capture/extraction/validation plan lives in
[[wiki/engineering/tier_2_document_corpus_pipeline|Tier 2 Document Corpus Pipeline]].

### Tier 3: external or heavier enrichment

Add only when a Tier 1/2 gap proves the need:

- NOAA weather observations for snow, heavy rain, heat, and storm disruption flags.
- School calendars, holidays, and major-event calendars.
- PLUTO / land use / employment-density or LODES-style context for demand generators.
- Recovered GTFS-RT archives, subject to license, provenance, and redistribution review.

## Source Evaluation Checklist

Before promoting a new source from candidate to active:

- What missed-finding risk does it reduce?
- Is it historical enough for before/after or only current-state context?
- Does it have route, stop, street, geometry, timestamp, or borough keys that can join deterministically?
- How fresh is it, and what publication lag should the app display?
- Is it complete enough for claims, or only caveat/context labels?
- Can heavy processing stay in `tools/pipeline` with compact D1/R2 serving projections?
- Does the source license or terms restrict redistribution?
- What quality test can prove it is not silently breaking joins?

## Data Model Direction

Do not add these as ad hoc JSON blobs directly to the public API. Prefer a pipeline-normalized shape:

- `local_context_event`: source, event type, start/end time, route/stop/street/corridor join refs,
  geometry hash, confidence, source URL.
- `local_finding_candidate`: detector, release month, route/corridor/segment refs, severity,
  confidence, status, review state, claim-safe label, reason code, detector score, created artifact
  hash.
- `local_finding_evidence_link`: candidate to metric/context/source/document/coverage artifact with
  role (`primary`, `context`, `caveat`, `missing_data`, `coverage_audit`).
- `local_finding_coverage_audit`: release month, detector coverage counts, skipped reasons, join
  success rates, source freshness, and top near-misses.

D1 should serve compact route/corridor finding summaries. R2 should hold detailed evidence payloads, join samples, coverage audits, and document snippets.

## Implementation Order

1. Harden `FindingCandidate`, evidence-link, and coverage-audit contracts in `packages/domain` and
   `packages/db/local`.
2. Add idempotent local repository writes and detector-read indexes.
3. Build `local_context_event_route_touch` with `build:context-event-route-touches` after
   `build:context-events` and `build:route-lion-link`; detectors query this bridge instead of
   redoing the route-LION join.
4. Implement `findings:detect` with the source-gap detector only.
5. Verify source-gap output on a fixture DB and on March 2026 local state.
6. Add persistent speed hotspot candidates, with coverage rows for every considered route/segment.
7. Add observed reliability candidates after fixing or directly joining scheduled baseline fields.
8. Add intervention-gap and intervention-underperformance candidates.
9. Add a small recall-backtest fixture from ACE/ABLE, DOT bus-priority corridors, and validated
   document seeds.
10. Normalize context events and join them to route segments/corridors with sampled QA before adding
   context-correlated disruption claims.
11. Expose only reviewed/promoted finding summaries, coverage states, and source-gap states in
    Studio projections, briefs, and composer review panels.

## Product Rule

After Pipeline v1, public-facing briefs should not imply "nothing to see here" just because a detector stayed quiet. They should distinguish:

- no issue detected with sufficient evidence;
- issue detected with sufficient evidence;
- issue suspected but needs review;
- insufficient evidence or failed join;
- source lag expected.

## Sources

- https://catalog.data.gov/dataset/mta-bus-wait-assessment-beginning-2025
- https://data.cityofnewyork.us/d/i4gi-tjb9
- https://catalog.data.gov/dataset/automated-traffic-volume-counts
- https://catalog.data.gov/dataset/street-construction-permits
- https://data.cityofnewyork.us/d/9jic-byiu
- https://data.cityofnewyork.us/d/h9gi-nx95
- https://opendata.cityofnewyork.us/311-service-requests-from-2010-to-present-updates/
- https://data.cityofnewyork.us/d/erm2-nwe9
- https://data.cityofnewyork.us/d/76ig-c548
- https://data.cityofnewyork.us/d/pvqr-7yc4
- https://catalog.data.gov/dataset/lion
- https://www.mta.info/developers
