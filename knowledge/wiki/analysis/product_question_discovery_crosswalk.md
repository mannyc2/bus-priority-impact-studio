---
title: Product Question Discovery Crosswalk
type: analysis
status: active
last_updated: 2026-06-07
owner: codex
source_count: 19
tags: [product-questions, crosswalk, discovery, frontend, authoring, detectors, snapshot-2]
---

# Product Question Discovery Crosswalk

## Purpose

This page fixes the weakest part of [[wiki/analysis/product_question_inventory|Product Question
Inventory]]: a fixed list of product-question families can audit known questions, but it cannot
discover missing product value by itself.

This crosswalk is the discovery layer:

```text
source docs / built surfaces / business research
  -> extracted product jobs
  -> canonical question families
  -> promote / absorb / defer / non-goal decision
  -> gaps in data, detectors, applied research, serving, or UI
```

The product-question inventory is the durable family contract. This page is the traceable derivation
and maintenance procedure that keeps that contract from becoming self-referential.

## Primary Consumer

The primary consumer is the same as the inventory:

- Codex/auto-research agents planning analytics or frontend work;
- detector authors deciding whether an idea is new or duplicate;
- Snapshot/serving planners deciding which D1/R2 projections are missing;
- human maintainers reviewing whether product value has drifted.

This is not a runtime publication gate. It is the intake and discovery procedure used before work is
implemented.

## Discovery Procedure

Run this procedure whenever a new research doc, major UI surface, detector family, or business
opportunity appears.

### Step 1: Declare Source Set

Use at least one source from each relevant bucket:

| Bucket | Examples |
| --- | --- |
| Product thesis | project overview, business problem, opportunity data map, AI interaction model. |
| Frontend surface plans | website surface data plan, Snapshot 2.0 surface manifest, visualization/multi-year plan. |
| Authoring/review UX | brief authoring UX, brief primitives, review collaboration/promotion, agent edit approval/versioning. |
| Current app surfaces | `/routes`, route detail, route ladder, route annotate, compare, findings, brief gallery/reader/composer/review/history/evidence, search/docs. |
| Data/research plans | treatment materializer, document-derived surfaces, Tier 2, 100x analytics, applied-research architecture. |
| Business research | user-provided opportunity maps, procurement/buyer research, TSP/acquisition research. |

### Step 2: Extract Product Jobs

Convert each source into product jobs using this shape:

```text
actor:
workflow:
trigger:
question:
required output:
decision it supports:
frequency:
claim posture:
source evidence:
```

Do not extract implementation tasks as product jobs. "Add an endpoint" is not a job. "Show a route's
treatment inventory with source caveats" is.

### Step 3: Normalize Jobs

Normalize each job into one of these decisions:

| Decision | Meaning |
| --- | --- |
| `promote_family` | The job is durable, high-value, and not represented by an existing family. Add a canonical family id. |
| `map_existing` | The job is already represented. Add a source mapping or clarify wording, but do not add a family. |
| `absorb_subcase` | The job is real but narrower than an existing family. Track as subcase until data/workflow justifies a split. |
| `defer_adjacent` | The job is valuable but belongs to a neighboring product or later workflow. Keep visible, do not let it drive current Snapshot 2.0 scope. |
| `promote_workflow` | The job is a durable Studio mechanism, such as authoring/review/publish, but not a transit-substance question. Add a product workflow surface, not a detector family. |
| `map_workflow` | The job is already represented by a product workflow surface. Map it there and also name the transit question families whose evidence it consumes. |
| `name_substrate` | The job names a shared method dimension that many families need, such as expected baselines or measurement integrity. Track it as a substrate, not a family. |
| `non_goal` | The job conflicts with product doctrine or is better served by incumbents. Keep as explicit non-goal if it is likely to recur. |

### Step 4: Promotion Test

Promote a new family only if all five are true:

1. It has a named user or buyer workflow.
2. It asks a different transit-substance question than existing families.
3. It implies a distinct output artifact, review packet, read model, or public surface.
4. It has a different completion test than existing families.
5. It can be mapped to data requirements and allowed claim posture.

If only the feature grain, threshold, source, treatment type, or visualization changes, do not
promote. Route it to a detector/model/read-model improvement.

If the job is about how the Studio captures, edits, reviews, versions, or publishes evidence, use
`promote_workflow` or `map_workflow` instead. If it is about a method dimension every family should
carry, use `name_substrate`.

### Step 5: Update Inventory

For every `promote_family` decision:

- add the family to the inventory with a stable id;
- add at least one surface or workflow row;
- add detector/non-detector support status;
- add a gap and next artifact;
- update the maintenance log.

For every `promote_workflow` decision:

- add a workflow surface to the inventory;
- list the canonical families it consumes;
- keep it out of the detector coverage map.

For `map_existing` and `absorb_subcase` decisions:

- add a note only if future agents are likely to misclassify it as new;
- otherwise leave the family list alone.

### Step 6: Generate Coverage Matrix

The eventual machine-readable artifact should combine:

```text
this crosswalk
  + product_question_inventory
  + detector registry
  + Snapshot 2.0 manifest/read models
  + route/data-product coverage audits
  + app route inventory
```

The matrix should score status by product job, not by detector count.
It should keep `family`, `workflowSurface`, and `substrate` as separate columns so authoring
mechanics and method dimensions do not masquerade as detector families.

## Crosswalk

### Product Thesis And Strategy Docs

| Source | Extracted product job | Family/workflow mapping | Decision | Gap / note |
| --- | --- | --- | --- | --- |
| [[wiki/project/overview|Project Overview]] | Pick a route; see where it fails, who is affected, what interventions exist, and whether evidence supports action. | `headline_condition`, `slow_segment`, `rider_pain`, `treatment_inventory`, `evidence_readiness` | `map_existing` | Confirms route page as evidence workspace, not generic route planner. |
| [[wiki/project/business_problem|Business Problem]] | Identify slow route/segment at rider-relevant times, persistence, treatment overlap, high rider impact, and measurable intervention change. | `slow_segment`, `rider_pain`, `history_change`, `treatment_gap`, `intervention_effect` | `map_existing` | No new family; validates existing core. |
| [[wiki/project/opportunity_data_map|Opportunity Data Map]] | Build route/corridor evidence product: observed multi-year evidence, intervention context, document timeline, detector/review posture, caveats/source gaps. | `multi_year_patterns`, `treatment_inventory`, `timeline_events`, `evidence_readiness`, `source_completeness` | `map_existing` | Confirms Snapshot 2.0 artifact set. |
| User-provided business research, NYC-focused opportunity map | Attribute bus-priority and service-change outcomes; create board-ready evidence; avoid generic dashboards. | `root_cause_diagnosis`, `corridor_project_evaluation`, `board_reporting_package` | `promote_family` | These were added because existing families measured components but not the explanatory/reporting workflow. |
| User-provided business research, public-transit workflow opportunities | Route diagnosis, corridor proof, disruption coordination, customer-information campaigns, board reporting, Title VI/grants, stop decisions, redesign logs. | `root_cause_diagnosis`, `corridor_project_evaluation`, `board_reporting_package`, `compliance_package`, `service_change_coordination` | mixed | Promoted four families; deferred service-change coordination; absorbed stop/enforcement/redesign/premium/capital subcases. |
| User-provided adversarial product-family gap audit | Identify whole dimensions no family owns: cost/value, political geography, service delivery, equity incidence, expected baselines, and measurement artifacts. | `cost_effectiveness`, `geographic_rollup`, `service_delivery`, `equity_incidence`; cross-cutting `expected_baseline`, `measurement_integrity` | mixed | Promoted four families; named two substrates rather than adding detector-shaped families. |

### Frontend Surface Plans

| Source | Extracted product job | Family/workflow mapping | Decision | Gap / note |
| --- | --- | --- | --- | --- |
| [[wiki/engineering/website_surface_data_plan|Website Surface Data Plan]] | Route detail tabs answer overview, slow segments, reliability, riders, timeline, interventions, evidence/data notes, and compare questions. | core route families | `map_existing` | Canonical source for route tab jobs. |
| [[wiki/engineering/serving_snapshot_2_surface_manifest|Serving Snapshot 2.0 Surface Manifest]] | Every page/tab needs product question, read model, grain, store, empty state, and claim posture. | all route/snapshot families | `map_existing` | Supplies completion criteria for read-model coverage. |
| [[wiki/engineering/website_data_expansion_plan|Website Data Expansion Plan]] | Publish richer route-first evidence studio: all routes, bus lanes, timelines, evidence catalog, findings, compare, context. | `route_attention`, `intervention_ontology`, `timeline_events`, `evidence_readiness`, `compare_cohort` | `map_existing` | Confirms intervention catalog and evidence catalog need stable public ids. |
| [[wiki/engineering/serving_snapshot_2_visualization_and_multiyear|Visualization & Multi-Year Expansion]] | Use multi-year data to nominate, locate, and explain surprising route/segment patterns. | `multi_year_patterns`, `root_cause_diagnosis`, `corridor_project_evaluation` | `map_existing` | Supports network nominator and route carpet as applied-research/UI artifacts, not new detectors by default. |

### Authoring, Review, And Brief Docs

| Source | Extracted product job | Family/workflow mapping | Decision | Gap / note |
| --- | --- | --- | --- | --- |
| `docs/architecture/studio-brief-authoring-ux.md` | Turn evidence into a public brief through document-shaped composer, corpus palette, send-to-brief, review, publish, and typed primitives. | workflow `brief_authoring_workflow`; consumes `evidence_readiness`, `document_claims`, `board_reporting_package`, and route evidence families | `promote_workflow` | Added as a product workflow surface, not a detector/product-question family. |
| `docs/architecture/brief-markdown-primitives.md` | Render route/metric/source/segment/evidence primitives inside public, composer, and review views from a shared content graph. | workflow `brief_authoring_workflow`; families `evidence_readiness`, `document_claims` | `map_workflow` | Completion requires typed blocks/refs and public self-contained rendering. |
| `docs/architecture/studio-review-collaboration-and-promotion.md` | Review anchored comments/suggestions; validate/export publish candidate; promote offline to immutable public projection. | workflow `brief_authoring_workflow`; family `evidence_readiness` | `map_workflow` | Adds review/publish lifecycle to completion test. |
| `docs/architecture/studio-agent-edit-approval-versioning.md` | Agent proposes structured edits; human approves; accepted changes create durable versions. | workflow `brief_authoring_workflow` | `map_workflow` | AI belongs in proposal/approval workflow, not direct mutation. |
| [[wiki/project/ai_interaction_model|AI Interaction Model]] | AI outputs finding cards, route diagnosis strips, segment notes, claim seeds, caveats, reviewer notes, and brief drafts as artifacts. | `root_cause_diagnosis`, `evidence_readiness`; workflow `brief_authoring_workflow` | `map_existing` | Confirms artifacts-over-chat doctrine; brief drafting is a workflow consumer. |

### Current App Surfaces

| Surface / file | Extracted product job | Family/workflow mapping | Decision | Gap / note |
| --- | --- | --- | --- | --- |
| `apps/web/src/studio/pages/routes-home.tsx` | Search route universe; scan route discovery sections; identify routes needing attention. | `route_attention`, `headline_condition`, `source_completeness` | `map_existing` | Route discovery sections should be generated from product-family coverage, not static guesses. |
| `apps/web/src/studio/pages/route-detail.tsx` | Route detail tabs show overview, slow segments, riders, interventions, timeline, data notes; generate brief from route. | core route families; workflow `brief_authoring_workflow` | `map_existing` | Generate-brief action must create/attach real evidence, not just navigate. |
| `apps/web/src/studio/pages/route-ladder.tsx` | Let analyst inspect route spine, speed, treatment continuity, rider-hours, and challenge/reveal worst segment. | `slow_segment`, `rider_pain`, `treatment_inventory` | `map_existing` | Ladder is a visual/interaction pattern, not a separate family. |
| `apps/web/src/studio/pages/route-annotate.tsx` | Select segment, start claim seeds, attach segment/metric evidence, open composer. | `evidence_readiness`, `slow_segment`; workflow `brief_authoring_workflow` | `map_existing` | Confirms claim-seeding is part of brief workflow. |
| `apps/web/src/studio/pages/findings-feed.tsx` | Browse reviewed/generated findings by type, impact, confidence, review state. | `evidence_readiness`, `route_attention`, `board_reporting_package` | `map_existing` | Findings need reviewed/no-hit/skipped states to avoid generated-candidate overclaiming. |
| `apps/web/src/studio/pages/finding-detail.tsx` | Read reasoning trail, caveat, comparable routes, review badge; start brief from finding. | `evidence_readiness`, `peer_context`; workflow `brief_authoring_workflow` | `map_existing` | Reasoning trail shape is product evidence, not just detector output. |
| `apps/web/src/studio/pages/briefs.tsx` | Browse/read cited route evidence briefs with claims, sources, caveats, KPIs, primitives. | `board_reporting_package`, `evidence_readiness`; workflow `brief_authoring_workflow` | `map_existing` | Public reader is the proof output. |
| `apps/web/src/studio/pages/brief-workflows.tsx` | View evidence, compose, review, compare history/versions. | workflow `brief_authoring_workflow`; family `evidence_readiness` | `map_workflow` | Completion requires real D1 review/proposal/version endpoints wired into UI. |
| `apps/web/src/studio/pages/compare.tsx` | Compare overview, slow segments, riders, interventions, timeline, data notes for two routes. | `compare_cohort` plus route child families | `map_existing` | Compare should compute from compact route/cohort rows, not bespoke pair artifacts. |
| `apps/web/src/studio/pages/search-results.tsx` | Search routes, segments, findings, briefs, and notes with route/treatment/performance facets. | `route_attention`, `intervention_ontology`, `evidence_readiness` | `absorb_subcase` | Search is a navigation utility unless ranking/facets become a product claim. |
| `apps/web/src/studio/pages/home.tsx` | Public front door: citywide story, full index preview, featured stories, trust framing. | `route_attention`, `board_reporting_package`, `evidence_readiness` | `absorb_subcase` | Homepage editorial claims must be backed by same evidence/readiness contracts. |

### Data, Treatment, And Document Plans

| Source | Extracted product job | Family/workflow mapping | Decision | Gap / note |
| --- | --- | --- | --- | --- |
| [[wiki/engineering/route_treatment_summary_materializer_plan|Route Treatment Summary Materializer Plan]] | Normalize current/historical/planned/candidate/source-gap treatment states by route/month/segment. | `treatment_inventory`, `intervention_ontology`, `treatment_gap` | `map_existing` | Required before treatment-specific detectors multiply. |
| [[wiki/engineering/document_derived_surfaces_v1|Document-Derived Surfaces v1]] | Preserve source-backed entities, events, claims, metric claims, context signals, review questions, route resolution. | `timeline_events`, `document_claims`, `evidence_readiness`, `source_completeness` | `map_existing` | Needs relation/projection layer before public contradiction claims. |
| [[wiki/engineering/curb_pulse_natural_experiment_plan|Curb Pulse Natural Experiment Plan]] | Find sign flips, pulses, mechanism evidence, and case-study packets for analyst review. | `multi_year_patterns`, `root_cause_diagnosis`, `corridor_project_evaluation`, `external_context` | `map_existing` | Research-only until methodology review gates effect language. |
| [[wiki/engineering/analytics_100x_plan|100x Analytics Plan]] | Use panels/model artifacts/evaluation loss to ask product-useful questions rather than generic detector thresholds. | all analytics families | `map_existing` | Supports generated coverage matrix and applied-research-first doctrine. |
| [[wiki/engineering/applied_research_architecture|Applied Research Architecture]] | Keep corpus-backed studies, panels, review packets, causal panels, and evaluation artifacts outside public request paths. | all applied-research families | `map_existing` | Confirms where non-detector product jobs should live. |

### Business Opportunities Not Promoted As Families

| Opportunity | Decision | Reason |
| --- | --- | --- |
| Stop-decision workbench | `absorb_subcase` | Real workflow, but currently a subcase of service-change coordination, rider impact, accessibility/equity, and redesign documentation. Split only with stop-level product/data. |
| Enforcement ROI planner | `absorb_subcase` | Subcase of cost-effectiveness, corridor/project evaluation, and treatment inventory. Split only if enforcement-specific data rights and decision owners appear. |
| Redesign decision log | `absorb_subcase` | Combines timeline, document claims, service-change coordination, and board reporting. Split only if comment/disposition trail becomes a product surface. |
| Premium-service SLA monitor | `absorb_subcase` | Subcase of reliability and reporting unless express-bus trip-level exception data becomes a dedicated product. |
| Capital/project prioritization | `absorb_subcase` | Subcase of cost-effectiveness, corridor/project evaluation, and compliance packaging until project portfolio inputs exist. |
| Real-time operations dashboard | `non_goal` | Saturated incumbent space and conflicts with evidence-author product wedge. |
| Consumer trip-planning app | `non_goal` | Not the buyer/user in this product. |
| Bus-lane enforcement hardware | `non_goal` | Hardware/vendor market; analytics may sit on top through treatment/corridor families. |

## Current Family Set After Crosswalk

Core route evidence families:

- `route_attention`
- `headline_condition`
- `rider_pain`
- `equity_incidence`
- `slow_segment`
- `reliability_wait`
- `service_delivery`
- `history_change`
- `peer_context`
- `schedule_runtime_gap`
- `root_cause_diagnosis`
- `treatment_inventory`
- `intervention_ontology`
- `treatment_gap`
- `intervention_effect`
- `corridor_project_evaluation`
- `cost_effectiveness`
- `timeline_events`
- `document_claims`
- `source_completeness`
- `evidence_readiness`
- `board_reporting_package`
- `external_context`
- `multi_year_patterns`
- `compare_cohort`
- `geographic_rollup`

Product workflow surfaces:

- `brief_authoring_workflow`

Cross-cutting substrates:

- `expected_baseline`
- `measurement_integrity`

Adjacent/deferred:

- `compliance_package`
- `service_change_coordination`

This split means Snapshot 2.0 should prioritize the core route evidence families. Workflow surfaces
consume those outputs; they should not appear in detector coverage as if they were transit
questions. Deferred families are allowed to influence data architecture, but should not force the
current route UI or detector registry to grow before there is a concrete workflow.

## Missing-Family Audit Questions

Use these adversarial prompts when reviewing new docs:

1. Does this source name an actor we do not currently serve?
2. Does it describe a repeated workflow, deadline, or decision meeting not covered by a family?
3. Does it require an output artifact that none of the families produce?
4. Does it require a completion test not captured by existing read-model/detector/evidence gates?
5. Does it create a claim posture that the current families cannot express?
6. Does it rely on data or permissions outside the current product wedge?
7. Is it really a workflow family, or only a new source/treatment type/grain for an existing family?
8. Would adding a detector be the wrong implementation because the job is actually authoring,
   reporting, serving, review, search, or compliance packaging?

## Maintenance Rule

When a new source doc or major app surface lands:

1. Add it to the source set or crosswalk table.
2. Extract jobs using the template above.
3. Classify each job with `promote_family`, `map_existing`, `absorb_subcase`, `defer_adjacent`, or
   `non_goal`.
4. Update [[wiki/analysis/product_question_inventory|Product Question Inventory]] only when a
   family id, question wording, status, or mapping changes.
5. Update [[wiki/analysis/detector_catalog|Detector Catalog]] only when detector support changes.
6. Run `bun run check:knowledge`.

The crosswalk is allowed to grow. The inventory should stay compact enough to read before adding
work.
