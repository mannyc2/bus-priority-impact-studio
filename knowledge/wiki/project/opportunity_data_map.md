---
title: Opportunity Data Map
type: project
status: active
last_updated: 2026-06-06
owner: codex
source_count: 0
tags: [business-problem, product-strategy, detectors, snapshot-2, tsp]
---

# Opportunity Data Map

## Purpose

This page captures the product direction from the June 2026 business-problem research pass.

The research did not change the project thesis. It sharpened it:

> Do not build a generic bus-data site. Build a route/corridor evidence product that explains what
> changed, why it might have changed, what interventions exist, what the public record supports, and
> what is still unknowable from public data.

The website, detector layer, and Snapshot 2.0 serving artifacts should be organized around that
spine.

## Product Wedge

The strongest wedge is the combination of:

1. Route underperformance diagnostics.
2. Bus-priority impact measurement.
3. Evidence and narrative packaging.

That means the primary product should answer:

- Which routes or corridors deserve attention?
- Where is the rider-exposed pain?
- Is the issue chronic, worsening, improving, or unusual relative to peers?
- What treatment evidence exists: bus lane, busway, ACE/ABLE, TSP, redesign, SBS, stop change, or
  other bus-priority intervention?
- Did the observed data improve after a known intervention?
- What do public documents claim?
- What source gaps prevent a stronger claim?

The best public artifact is not a chart by itself. It is a source-backed explanation:

```text
route/corridor problem
  -> observed multi-year evidence
  -> intervention/treatment context
  -> public-document timeline
  -> detector/review posture
  -> caveats and source gaps
```

## Opportunity Ranking

| Opportunity | Fit | Why |
|---|---|---|
| Route underperformance diagnostics | Core now | Uses existing speed, ridership, reliability, route history, segment, and treatment data. |
| Bus-priority impact measurement | Core now, claim-gated | Uses intervention dates plus speed/reliability panels; strongest buyer-facing wedge. |
| Board/community narrative packets | Downstream of core | Useful packaging once the evidence substrate is strong. |
| TSP accountability/evaluation | High-value treatment layer | Strong source-gap story; requires current inventory or careful caveats. |
| Disruption/service-change coordination | Adjacent later | Real workflow, but becomes an operations/comms product with different data needs. |
| Title VI/grant/compliance packets | Later or consulting wedge | Public-data-friendly, but different buyer and workflow than route/corridor diagnostics. |
| Network redesign comment synthesis | Later | Useful corpus product, but less aligned with current detector/data advantage. |
| Generic dashboarding | Avoid | Agencies already have dashboards; the gap is attribution, evidence, and defensible explanation. |

## Data To Get Next

Do not chase broad data for its own sake. Prioritize data that upgrades claim strength or unlocks a
route/corridor surface.

| Priority | Data | Why it matters | Product use |
|---|---|---|---|
| P0 | Current TSP inventory | Public sources confirm TSP exists historically and at large scale, but current locations/status are not public enough. | Treatment inventory, source-gap findings, TSP evaluation candidates. |
| P0 | Dated intervention inventory | Detectors need dates and geography, not only prose that an intervention exists. | Intervention gap, underperformance, event-study candidates, timelines. |
| P0 | Historical/current GTFS static snapshots | Needed for schedule-speed gap, schedule mismatch, route-version breaks, and fair before/after windows. | Runtime mismatch, reliability baselines, version-aware trend windows. |
| P1 | Fleet-complete observed reliability/headway coverage | Speed and reliability are different business problems. | Reliability watch, bunching, long gaps, rider-weighted excess wait. |
| P1 | Context layers with route/date joins | Explains temporary or external causes when evidence is strong enough. | Permit/event/weather/311/curb-pressure caveats and context detectors. |
| P2 | Stop-level or APC-quality ridership | Would upgrade rider-weighted stop/hour claims. | Rider-weighted EWT and stop-hour ranking. |

Current TSP data should be represented as a treatment/source-gap layer, not as a blocker for the
core product. The core product can move forward with speed history, rider impact, reliability where
available, bus lanes, ACE/ABLE, document timelines, and detector candidates.

The TSP-specific acquisition plan, candidate-corridor posture, and FOIL record classes are tracked
in [[wiki/data/tsp_data_acquisition|Transit Signal Priority Data Acquisition]].

## TSP Evidence Posture

Transit Signal Priority should not be inferred as truth from speed outcomes.

Use this strict posture:

| Status | Meaning |
|---|---|
| `current_confirmed` | Current authoritative source confirms active TSP location/status. |
| `historical_confirmed` | Historical source confirms TSP on a route/corridor/intersection. |
| `planned_or_claimed` | Source says TSP was planned, proposed, funded, or intended. |
| `under_consideration` | Source shows TSP was studied but not committed. |
| `performance_evaluated` | Source includes before/after or impact evaluation. |
| `current_status_source_gap` | TSP is reported at scale, but current locations/status are not disclosed. |
| `candidate_inferred_not_confirmed` | Indirect evidence suggests possible TSP, but no authoritative source confirms it. |
| `not_tsp` | Related bus-priority treatment, but not signal priority. |

Rule:

> Speed data can support or challenge a TSP claim. It must not create the TSP claim.

This avoids converting ambiguous outcome evidence into normalized intervention truth. If current
TSP inventory cannot be found publicly, the product should say that clearly and treat the gap as a
finding.

## Detector Priorities

The detector registry already covers the right families. The next work is integration,
materialization, and claim governance.

| Detector priority | User question | Required substrate | Public posture |
|---|---|---|---|
| Coverage/admission | Can we evaluate this scope honestly? | Source-month coverage, materialization coverage, route/segment support flags. | Data-quality/source-gap. |
| Persistent rider-exposed slow segment | Where are riders repeatedly losing the most time? | Segment speed, trip counts, ridership exposure, persistence windows. | Descriptive prioritization. |
| Trend/peer residual | Which routes are worsening, improving, or odd relative to peers? | Multi-year route/month history, route-version guards, peer definitions. | Descriptive/associational. |
| Intervention gap | Where is pain high but treatment evidence weak or missing? | Speed/reliability pain plus treatment inventory/source gaps. | Review candidate, not "no intervention" unless source-backed. |
| Intervention underperformance | Where does treatment exist but performance remains poor? | Dated treatment records plus post-treatment performance. | "Deserves review," not "failed." |
| Event-study candidate | Which interventions have enough pre/post and controls for evaluation? | Dated events, history panel, control eligibility, pre-trend/placebo gates. | Causal only after methodology/human review. |
| Reliability pocket | Where are bunching, long gaps, and excess wait concentrated? | Observed headways, scheduled baselines, sample coverage, ridership proxy. | Descriptive; rider-weighted claims need proxy caveats. |
| Document/data contradiction | Where do public claims and observed data/source coverage diverge? | Tier 2 claims/timelines plus observed metrics and source-gap rows. | Evidence-backed question or contradiction, claim-gated. |

The site should read reviewed/promoted projections, not raw detector candidates. Raw candidates are
for review queues, calibration, and internal opportunity discovery.

## Route Evidence Loop

The practical next product loop is:

1. Pick a small route/corridor set with varied treatment states and strong existing data.
2. Produce a route evidence packet for each:
   - multi-year speed history;
   - rider-exposed slow segments;
   - reliability summary where available;
   - treatment inventory;
   - Tier 2 timeline;
   - source gaps;
   - detector candidates.
3. Review which candidates are actually compelling.
4. Promote only findings with enough evidence.
5. Use the reviewed packet shape to define Snapshot 2.0 D1/R2 artifacts.

This loop should precede large UI commitments. It tells the frontend which questions are genuinely
answerable and which sections need caveats.

## Snapshot 2.0 Implications

Snapshot 2.0 should expose route/corridor evidence products, not raw local tables.

Minimum serving artifacts implied by this map:

| Artifact/read model | Purpose |
|---|---|
| `route_kpi_summary` | Current route headline condition and support level. |
| `route_month_history` | Multi-year route speed/ridership trend context. |
| `route_segment_topk` | Rider-exposed slow segments and persistence. |
| `route_reliability_summary` | Reliability watch where observed samples support it. |
| `route_treatment_summary` | Bus lane, ACE/ABLE, TSP, redesign, SBS, stop-change, and source-gap posture. |
| `route_timeline_index` and timeline bundles | Public-document-backed route/corridor events. |
| `route_detector_summary` | Reviewed detector hits, clean no-hits, skipped/missing states. |
| `route_evidence_index` | Promoted findings, citations, evidence bundles, and public claim posture. |
| `source_month_coverage` | Data Notes and release honesty. |

## Non-Goals

- Do not block the core route/corridor product on current TSP inventory.
- Do not infer active TSP from speed changes alone.
- Do not publish raw Tier 2 rows, detector candidates, or local artifact paths as public facts.
- Do not build a generic "all transit data" dashboard.
- Do not make causal claims from before/after charts without event-study gates and human review.

## See Also

- [[wiki/project/business_problem|Business Problem]]
- [[wiki/engineering/website_surface_data_plan|Website Surface Data Plan]]
- [[wiki/engineering/serving_snapshot_2_surface_manifest|Serving Snapshot 2.0 Surface Manifest]]
- [[wiki/analysis/ideal_detector_system|Ideal Detector System]]
- [[wiki/data/source_registry|Source Registry]]
- [[wiki/data/tsp_data_acquisition|Transit Signal Priority Data Acquisition]]
