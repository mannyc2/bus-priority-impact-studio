---
title: Finding Coverage and Corpus Expansion
type: analysis
status: planned
last_updated: 2026-05-18
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

## Post-v1 Answer

Pipeline v1 should end with a reproducible March 2026 serving release, production source refresh operations, Studio projections, and documented methodology gates. The next phase should be **Finding Coverage v1**:

- Define the universe of possible findings as route x direction x segment/corridor x month x daypart.
- Run multiple detectors over that universe instead of depending on one route score or one hotspot ranking.
- Emit a coverage audit that records detector hits, detector misses, and data gaps.
- Surface "insufficient evidence" as a product state in briefs and reviewer queues, not as silence.
- Expand the source corpus only when the new source reduces a known false-negative risk.

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

### Tier 1: high-value structured sources to probe next

These are candidates because they reduce concrete false-negative risks and have public structured endpoints. Add them to `knowledge/raw/source_manifest.yaml` only after a `sources:probe`-style check captures schema, row counts, freshness, join keys, and caveats.

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

- `local_context_event`: source, event type, start/end time, route/stop/street/corridor join refs, geometry hash, confidence, source URL.
- `finding_candidate`: detector, release month, route/corridor refs, severity, confidence, status, claim-safe label, created artifact hash.
- `finding_evidence_link`: candidate to metric/context/source artifact with role (`primary`, `context`, `caveat`, `missing_data`).
- `finding_coverage_audit`: release month, detector coverage counts, skipped reasons, join success rates, source freshness.

D1 should serve compact route/corridor finding summaries. R2 should hold detailed evidence payloads, join samples, coverage audits, and document snippets.

## Implementation Order

1. Add Tier 1 source candidates to a probe backlog without marking them active.
2. Implement `FindingCandidate` and coverage-audit contracts in `packages/domain`.
3. Teach analytics jobs to emit detector-level considered/hit/skipped counts.
4. Add a first source-gap detector for route/months where reliability, speed, ridership, intervention, or context evidence is missing.
5. Probe Tier 1 sources in this order: wait assessment, DOT traffic speeds, construction/opening permits, traffic volume counts, collisions, 311, parking violations, LION.
6. Normalize context events and join them to route segments/corridors with sampled QA.
7. Backtest against a small known-corridor set before adding more detectors.
8. Expose coverage and source-gap states in briefs and composer review panels.

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
