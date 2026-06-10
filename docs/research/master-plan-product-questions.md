# Master Plan: Product Question Inventory → Evidence Studio

**For:** the maintainer and implementing agents. This is the umbrella plan above
`docs/research/backend-goal-finish-detectors.md` (the detector calibration plan, referenced here as
**Track B**) and alongside `knowledge/wiki/engineering/curb_pulse_natural_experiment_plan.md` (the
case-study workbench, absorbed here into **Track C**). Produced 2026-06-10; every current-state
claim was verified against the working tree, the serving code, and the sibling repo
`/mnt/models/dev/mta-wiki` on that date.

**Mission:** make the product able to answer the question families in
`knowledge/wiki/analysis/product_question_inventory.md` for its primary user — the route/corridor
**evidence author** — and raise the ceiling until the system can produce briefs of the
"M101 film-shoot curb-pulse" class: multi-source, statistically defended, document-corroborated,
falsifiable, and honest about claim posture.

---

## 0. The bar, decomposed

The exemplar brief (fabricated M101 panel) is the right north star because every sentence of it
maps to a concrete capability. Decomposed:

| Exemplar element | Capability required | Today | Track |
|---|---|---|---|
| "36-month daily panel, median AM-peak segment travel time" | Segment travel-time panel at **daily** grain, 3 years deep | **Does not exist and is not publicly recoverable** — Socrata segment speeds are month × direction × segment × day-of-week × hour; ingest further collapses to route × month | A |
| "41 discrete depressions, 2–4 days each, seasonal clustering" | Date-grain pulse/episode detection with recurrence fingerprinting | Missing; only hour-of-week pattern classification exists (`pulse-fingerprint.ts`, monthly grain) | A + C |
| "event study … −4% (95% CI [−9%, +1%])" | Event study with effect sizes and CIs computed *in this repo* | Detector consumes pre-computed estimates; segmented regression exists but unwired; bootstrap CIs exist for means only | C |
| "day-of-week and month fixed effects, hourly precipitation controls" | Panel contrast with FE absorption + weather covariates | Missing entirely; weather is daily-grain only | A + C |
| "placebo: adjacent upstream segment, +1% (n.s.)" | Placebo-in-space/-in-time computation | Gate *flags* exist (`intervention-gates.ts`); the computations that set them do not | C |
| "311 double-parking at 4× network median … drops 70% on pulse days" | 311 curb-friction taxonomy + segment-confidence joins + windowed contrast | 311 ingested at fine grain; geocode/taxonomy work-in-progress; no curb-friction allowlist | A |
| "37/41 pulses inside a Tier-2 film-permit window, corroborated by work orders and trade press" | Film-permit source + document records with dated windows + event-window overlap joins | Film permits **not ingested**; document records now live in `/mnt/models/dev/mta-wiki` (3.4k records, block-level evidence handles) with **no export contract** to this repo | A + D |
| "boardings flat on pulse days (+0.4%, n.s.)" | Ridership at route × hour × date-ish grain | Route × month × DOW × hour exists 2020+; stop-level collapsed at ingest | A |
| "predict −0.9 min; regression discontinuity at enforcement date should snap −15%" | Counterfactual prediction framed as falsifiable review hypothesis (not a public causal claim) | No framing or artifact for pre-registered predictions | C + F |
| "Deck line:" | Brief composer that can carry the narrative, citations, figures, and caveats to an exportable artifact | Composer ~60% built; evidence minting, real corpus palette, review threads, publish promotion missing | F |
| "Up front: this panel is fabricated" | Claim-posture honesty machinery — and a *synthetic-fixture brief mode* as a legitimate product artifact | ADR-0018 readiness + claim tiers exist for detectors; no composer-level posture enforcement | B + F |

Two consequences worth stating bluntly:

1. **The literal exemplar is a forward-looking capability.** A 36-month *daily* panel cannot be
   reconstructed for 2023–2025 from public data. It accrues from the day we turn on continuous
   GTFS-RT collection. Retrospective studies run at month × DOW × hour grain (which still supports
   seasonal recurrence, daypart pulses, event studies, and document corroboration); daily-grain
   case studies become possible in the forward era and reach 36 months of depth in 2029.
2. **The novelty bar is composition, not any single method.** Every individual piece (pulse
   detection, ITS, placebo loops, document overlap) is buildable in pure TypeScript at this
   project's scale. What no comparable product does is chain them with honest claim posture and
   block-level citations. That chain is this plan.

## 1. Ground truth (verified 2026-06-10)

Summarized from five audits run against both repos; details inline in each track.

- **Data substrate.** Strong: 18.9M segment-speed rows (2023→present, two Socrata datasets),
  311 (2010→present, minute grain), DOT street permits (2022+), parking violations, NYPD
  collisions (2013+), NOAA daily weather (3 stations, deep history), route×hour ridership
  (2020+), ACE/ABLE, bus-lane geometry with install dates. Weak: the ingest **collapses native
  grain** (segment speeds → route×month; ridership → route-level), GTFS-RT exists as a single
  24-hour snapshot (2026-05-17), film permits and event/school calendars are absent, historical
  GTFS static is indexed but not ingested. Key files:
  `packages/db/src/local/schema.ts`, `tools/pipeline-v2/src/commands/ingest/*`.
- **Study engine.** Real and tested: bootstrap mean CIs, segmented (ITS) regression
  (unwired), Theil-Sen, MAD z-scores, headway/EWT math, concentration stats, causal *gate
  evaluation*. Hollow: `applied-research/src/{core,causal,forecasting}` are typed scaffolds with
  zero importers; effect estimates/CIs/placebos consumed by `intervention_event_study` are
  computed nowhere in the repo. Missing: panel FE regression, placebo computation,
  autocorrelation diagnostics, date-grain changepoint/episode detection, regression CIs.
- **Detector floor.** 4/21 calibrated; full state and the finish plan live in
  `docs/research/backend-goal-finish-detectors.md` (Track B here).
- **Serving (Snapshot 2.0).** ~50%: route index v2, sections, history, search, speed-history
  carpet artifacts (385 routes; 134 `series_ready`) are BUILT. NOT BUILT: `route_evidence_index`
  (critical), `route_segment_topk`, `route_reliability_summary` endpoint, `route_daypart_profile`,
  audited treatment summary, intervention catalog, compare v2, area rollups.
- **Authoring.** ~60%: send-to-brief, composer prose + claims CRUD, validation, publish-candidate
  export are BUILT. PARTIAL/NOT BUILT: evidence minting endpoint, insert-from-corpus on real data
  (palette is hardcoded sample data), figure embeds from real artifacts, threaded review/suggested
  edits, AI runner configuration, publish promotion. Ref types (block/evidence/metric/artifact/
  source/unresolved) are fully typed in `@bp/domain`.
- **Tier 2 (mta-wiki repo).** Pilot→early-production. 3,437 canonical records across 11 kinds
  (1,219 metric claims, 806 relations, 258 events, 216 treatment components, 111 projects…), each
  with block-level `evidence_refs` (source_id + block_id + sha256), identity resolution, a
  deterministic SQLite (`data/canonical.db`) + parity-verified JSONL exports, and ~2,500 staged
  sources (~96k pages) awaiting ingest. **No downstream export contract exists yet.** This repo's
  old in-tree Tier 2 reconciliation problem (extractedReviewedOverlap = 0) is effectively being
  solved by the rebuild — the integration question is now cross-repo.

## 2. Strategy: tracks, not families

The inventory has ~28 families/surfaces, but they share a much smaller set of load-bearing spines.
Building family-by-family would re-litigate the same substrate gaps 28 times. This plan organizes
seven tracks; each inventory family is unlocked by one or more tracks (§11 matrix).

```text
A. Data substrate      — grain preservation, new sources, continuous collection
B. Detector trust      — the calibration/readiness floor (existing plan, referenced)
C. Study engine        — pulse detection, panels, event studies, placebos, CIs
D. Tier 2 integration  — the mta-wiki contract and document-evidence joins
E. Serving read models — Snapshot 2.0 completion (evidence index, top-k, reliability…)
F. Authoring & publication — composer completion + claim-posture enforcement
G. Synthesis artifacts — diagnosis packets, corridor cases, board packages, area rollups
```

Dependency shape: **A and B are the foundations** (A feeds C/E/G with data; B makes anything
public trustworthy). **C and D are the differentiators** (they produce the evidence the exemplar
needs). **E and F are the delivery surfaces.** **G composes everything** into the artifacts the
evidence author actually exports. Tracks run in parallel where they don't share files; milestones
(§10) are cross-track checkpoints, not serial phases.

A note on scope discipline: Track B's plan says "no new feature grains unless a calibration forces
one." This master plan deliberately supersedes that for Track A — the *inventory* (multi-year
patterns, external context, root-cause diagnosis) and the exemplar bar force the new grains, not
gold-plating. Everything else in Track B's non-goals stands.

## 3. Track A — Data substrate

The single most consequential finding of the audit: **the corpus is richer upstream than what we
persist.** Fixing ingest collapse is cheaper and higher-value than any new modeling.

- **A1. Preserve native segment-speed grain.** Re-ingest `kufs-yh3x` (2025+) and `58t6-89vi`
  (2023–24) into a cell-grain table (`local_route_segment_speed_cell`: route × direction ×
  timepoint-pair × month × day-of-week × hour) instead of collapsing to route×month. Keep the
  existing route-month table as a derived projection (golden-diff it).
  *Verify:* fixture ingest; row-count sanity vs a Socrata probe; existing route-month aggregates
  byte-identical; `bun --filter @bp/pipeline-v2 test`.
- **A2. Continuous GTFS-RT collection → the daily panel era.** Stand up the always-on collection
  path: Worker cron (bindings exist) → R2 archive → scheduled local sync → daily materialization
  of segment travel times and observed headways. This is the only path to daily-grain panels;
  every month of delay is a month of permanently missing panel.
  *Verify:* 7-day soak with a daily coverage artifact (samples/route/hour); one fixture-backed
  materialization command; retention/cost note for Open Decision 1.
- **A3. 311 curb-friction taxonomy + join confidence.** Deterministic complaint-type allowlist
  (double-parking, blocked lane/driveway/hydrant/bus-stop), segment-level join confidence fields,
  borough/route-length normalization fields. (Geocode-confidence work is already in flight —
  finish it under this slice.)
  *Verify:* taxonomy fixture tests; sampled agreement audit artifact (N≥50 complaints hand-checked
  against segments).
- **A4. Film permits source probe + ingest.** NYC Open Data publishes a Mayor's Office film-permit
  dataset (street-level locations, event types, start/end windows) — run the standard source probe
  first, then ingest with LION/segment join fields. This unlocks the exemplar's event family and
  was Open Question #2 of the curb-pulse plan.
  *Verify:* probe metadata fixture; fixture-backed ingest; join-rate report.
- **A5. Hourly weather.** Add NOAA hourly observations (LCD/ISD) for the 3 stations alongside
  daily GHCN. Needed for hourly controls; daily already supports day-level robustness.
  *Verify:* fixture ingest; station/date coverage artifact.
- **A6. Stop-level ridership preservation.** Re-ingest hourly ridership keeping stop grain
  (`local_stop_hourly_ridership`), with route rollup parity-checked against the existing table.
  *Verify:* parity golden-diff; fixture.
- **A7. Historical GTFS static backfill.** Ingest the indexed schedule bundles back to 2023 where
  archives exist, with explicit schedule-version coverage labels (the `schedule_runtime_gap` and
  `measurement_integrity` families both block on this).
  *Verify:* coverage-label artifact per month; fixture.
- **A8. Probe the Bus Time AVL archives (time-boxed).** Third-party/academic archives of historical
  MTA Bus Time data may partially recover pre-2026 daily grain. Non-authoritative — probe, assess
  coverage/licensing, and write a verdict NOTE rather than committing to ingestion.
  *Verify:* probe NOTE under `data/artifacts/`; explicit go/no-go recommendation.
- **A9. Event/school calendars: defer.** `tier2_only`/`needs_source` per the curb-pulse plan;
  revisit after D-track records show what documents already date.

## 4. Track B — Detector trust floor (existing plan, referenced)

The full plan is `docs/research/backend-goal-finish-detectors.md`: stabilization → seam closure →
shared fix-once slices → 17 calibrations in four waves → serving governance + lifecycle →
maturity climb. It is a strict prerequisite for everything public in this plan: **no read model in
Track E and no synthesis artifact in Track G may surface a detector family that has not passed its
ADR-0018 loop.** Two interactions to manage:

- Track A's new grains (daily panels, cell-grain speeds) eventually feed recalibrations — do not
  block Track B waves on Track A; calibrate against current grains and treat grain upgrades as
  detector-version changes with fresh evaluation (the lifecycle records from B's Phase 4 exist for
  exactly this).
- This plan **supersedes Track B's Open Decision 4** (delete unused `causal/`/`forecasting/`):
  see C1. Delete `forecasting/` only; `causal/` and `core/` get rebuilt into the real study engine
  rather than deleted.

## 5. Track C — Study engine

This is what turns "we have panels" into "we can write the exemplar's middle paragraphs." Hard
constraints: TypeScript-pure math in `@bp/analytics` (no I/O), orchestration and panel loading in
`@bp/applied-research` through the FeatureResolver seam, every method fixture-tested on synthetic
series with known answers, all causal-tier wording gated behind human methodology review (ADR-0012
/ ADR-0018 / ideal-doc non-negotiables). Scope discipline: ITS + matched-contrast + bootstrap is
enough; no synthetic-control solver, no GMM, no dynamic panels (Open Decision 3).

- **C1. Re-found the core.** Delete `applied-research/src/forecasting/` (zero importers, no
  product question needs it). Keep `core/study.ts` (StudyDefinition/StudyRun) and `causal/` types
  as the skeleton the runner below makes real. Document the supersession of Track B OD-4.
  *Verify:* `bun --filter @bp/applied-research test`; boundary tests green; knowledge log entry.
- **C2. Episode/pulse detection primitives (pure).** Rolling robust baseline (median/MAD) over a
  date-indexed series; consecutive-window depression/elevation episodes with minimum-run and
  magnitude parameters; recurrence fingerprinting (inter-episode spacing, seasonal clustering, no
  weekly cycle tests). Works at any grain — month-cell series now, daily series in the forward era.
  *Verify:* synthetic fixtures with planted pulses (recover count/duration/magnitude exactly);
  `bun --filter @bp/analytics test`.
- **C3. Panel contrast with fixed effects (pure).** Within-transform OLS for cell panels with
  DOW/month/hour FE absorption and exogenous covariates (weather), moving-block bootstrap CIs for
  coefficients (extends the existing `bootstrap.ts` rather than adding a covariance-matrix
  stack). Sized for this project: thousands of cells, not millions.
  *Verify:* fixtures vs hand-computed small panels; CI coverage smoke on simulated data.
- **C4. Event study made real (pure).** Wire the existing segmented-regression ITS into an
  event-study helper that *computes* what today arrives precomputed: effect estimate + bootstrap
  CI, pre-trend test, placebo-in-time loop, placebo-in-space (control-unit) loop, lag-1/Ljung-Box-
  lite autocorrelation diagnostic. These populate the `intervention-gates.ts` flags from inside
  the repo for the first time.
  *Verify:* fixtures with known effects/non-effects; `intervention_event_study` detector fixture
  re-run with internally computed fields — outputs match or differences documented.
- **C5. The study runner (applied-research).** Make `StudyDefinition`/`StudyRun` runnable: load a
  panel via the FeatureResolver seam, execute a method (C2–C4), emit a typed study artifact
  (estimates, CIs, gate results, coverage, residual risks) + NOTE. This finally gives the
  applied-research core its job, closing the architecture-request critique by *use* rather than
  deletion.
  *Verify:* one end-to-end fixture study (synthetic panel → artifact); golden artifact diff;
  `bun --filter @bp/applied-research test`.
- **C6. Curb-pulse workbench (absorb the existing plan).** Execute
  `curb_pulse_natural_experiment_plan.md` R1–R5 on the C2–C5 primitives: pulse detection → event-
  window overlap (permits, film permits from A4, Tier 2 windows from D4) → official-intervention
  exclusion → mechanism corroboration (311 contrast from A3) → manually audited case-study review
  packets. R6+ (public promotion) waits for C7 and Track F.
  *Verify:* per the plan's own R-phase gates; first real case packets under `data/artifacts/`.
- **C7. Methodology review gate (workflow artifact).** A human methodology-approval artifact
  (method, spec, diagnostics, approved wording ceiling, falsifiable predictions) required before
  any causal-tier claim reaches a brief or serving projection. Includes the exemplar's
  "pre-registered prediction" form: a dated, falsifiable expectation (e.g., RD at enforcement
  date) stored as a review hypothesis, never as a public claim.
  *Verify:* schema + fixture; composer/serving validation consumes it (F7/E-gates).

## 6. Track D — Tier 2 integration (mta-wiki)

Tier 2 extraction/reconciliation now lives in `/mnt/models/dev/mta-wiki` (block-cited canonical
records, identity resolution, deterministic SQLite + JSONL exports). This track defines the
cross-repo seam. Division of labor: **mta-wiki owns ingestion, identity, and record truth; this
repo owns joins to metrics, projections, and serving.** Work items marked (W) land in mta-wiki.

- **D1 (W). Versioned export contract.** A snapshot artifact: canonical JSONL per kind + schema
  version + parity hash + identity-override version, produced by the existing
  `exportCanonicalJsonl()`/parity machinery. Pin-by-version, never read the live DB across repos.
  *Verify (mta-wiki):* `bun run validate`; parity check; a CONTRACT.md documenting fields/stability.
- **D2. Snapshot ingest command.** `ingest:mta-wiki-snapshot` → local tables (`tier2_record`,
  `tier2_relation`, `tier2_evidence_ref`) preserving record ids, evidence handles, and schema
  version. Replaces the legacy in-tree Tier 2 path as records mature; keep both until parity.
  *Verify:* fixture snapshot ingest; row/relation counts match manifest;
  `bun --filter @bp/pipeline-v2 test`.
- **D3. Record projections.** Map record kinds onto the families that need them:
  treatment_component/project/event → intervention records + `intervention_ontology` catalog rows;
  event/date assertions → route timelines; claim/metric_claim → `document_claims` alignment
  substrate; cost statements (extend extraction fields in mta-wiki if absent) →
  `cost_effectiveness` substrate.
  *Verify:* projection fixtures; existing timeline/intervention consumers golden-diffed or
  explicitly migrated.
- **D4. Corroboration joins.** The exemplar's signature move: event-window overlap between
  detected episodes (C2/C6) and dated document windows (film permits, work orders, project
  phases), with match counts and misses reported ("37/41 inside a permit window") plus the
  independent-check join (311 contrast on matched windows).
  *Verify:* fixture with planted overlaps; join-quality artifact.
- **D5. Claim↔metric alignment (applied research first).** For `document_claims`: align
  metric_claims to deterministic panels (same route/period/metric), emit
  agreement/disagreement/not-evaluable rows as review packets — not a public contradiction
  detector yet (inventory's own guidance).
  *Verify:* alignment fixture; review packet artifact.
- **D6. Tier 2 coverage states.** Which routes/corridors/months have document coverage, feeding
  `source_completeness` and the diagnosis packet's missing-evidence sections.
  *Verify:* coverage artifact generated from snapshot; surfaced in Data Notes read models (E).

## 7. Track E — Serving read models (Snapshot 2.0 completion)

Ordered by what they unblock. Hard rule inherited from Track B: read models expose only
readiness-gated detector content and reviewed/promoted document content. Heavy computation stays
in the local pipeline; serving reads projections (CLAUDE.md boundary).

- **E1. `route_evidence_index` + evidence minting.** The single most load-bearing missing model:
  stable public evidence ids over promoted findings, reviewed Tier 2 rows, metric panels, and
  artifacts — consumed by briefs (F1), findings, and the evidence-ready section.
  *Verify:* D1/R2 projection fixtures; `bun --filter @bp/web build`; boundary tests.
- **E2. `route_segment_topk`.** Ranked segments (rider-impact, slowest, persistent, untreated,
  worsening) for slow-segments/riders/compare tabs.
- **E3. `route_reliability_summary`.** Endpoint over the existing D1 table once
  `observed_reliability`/EWT detectors clear Track B Wave 1.
- **E4. `route_daypart_profile`.** Explicit daypart aggregation (feeds hour profiles, compare).
- **E5. Treatment summary materializer.** Execute the existing
  `route_treatment_summary_materializer_plan.md` (`route_treatment_summary`,
  `route_segment_treatment_summary`, `route_treatment_source_gap`).
- **E6. Intervention catalog.** `intervention_catalog`, `route_intervention_index`,
  `intervention_route_link`, `intervention_source_ref` + the three endpoints named in the
  inventory — projected from D3 records.
- **E7. Timeline widening.** Ref-first hydration (runner hydrates known dates/source metadata),
  coverage growth from D2 snapshots.
- **E8. Compare v2.** `route_compare_metric`, `route_peer_context`, child-surface refs.
- **E9. `area_route_allocation` + `area_summary`.** The shared geography layer; `equity_incidence`
  consumes this same allocation (inventory requirement) — never a parallel method.
- **E10. Speed-history coverage/index + carpet productization.** Advertise `series_ready` /
  `series_ready_with_gaps` / `needs_pattern_review` publicly; carpet UI on the existing 385-route
  artifacts.

*Per-slice verification:* read-model fixture + schema in `@bp/domain`, studio-api handler test,
`bun --filter @bp/web build`, production-boundaries test, and a route with the artifact rendering
in the app (`/verify`-style manual check noted in the slice).

## 8. Track F — Authoring & publication

Target remains the canonical "Authoring v2 (converged)" design (send-to-brief + brief-writes-with-
you composer + insert-from-corpus; no evidence shelf/scoring/drag-reorder/chat). Slices:

- **F1. Evidence minting + real corpus palette.** `POST /briefs/{id}/evidence` (or mint-on-attach)
  backed by E1's evidence index; replace the hardcoded palette sample with real corpus queries.
- **F2. Send-to-brief end-to-end.** Captured objects persist as typed blocks/refs into the draft
  content graph (today the capture sheet works but persistence is partial).
- **F3. Review: threads, suggested edits, approval states.** Backend for anchored comments,
  from→to suggestions with accept/apply, reviewer assignment, versioned approval boundaries.
- **F4. AI runner configuration.** Wire the BriefAuthorAgent runner (bindings exist,
  `jobLlmStatus: "not_configured"`); artifact-shaped outputs only, per the AI interaction doctrine.
- **F5. Publish promotion + public reader on the content graph.** Validated export → deliberate
  promotion step → public brief reader renders the same `bodyMd` + blocks + refs graph.
- **F6. Figures from real artifacts.** Embed registry (segment cards, before/after, hour figures,
  carpet excerpts) rendered from evidence/artifact refs instead of demo data — the exemplar's
  panel figure, event-study plot, and 311-contrast figure are exactly these embeds.
- **F7. Claim-posture enforcement in the composer.** Claims carry posture from `evidence_readiness`
  and C7 methodology artifacts; validation blocks causal-tier wording without an approval ref;
  **synthetic-fixture briefs are first-class but force the "fabricated/illustrative" banner and a
  distinct visual treatment** (the exemplar's own opening line, productized).

*Per-slice verification:* `bun --filter @bp/web build`, studio-api tests, a scripted composer
walkthrough (browse-based QA), boundary tests.

## 9. Track G — Synthesis artifacts

The composed deliverables that make the evidence author successful. Each starts as an
applied-research artifact (review-gated), then earns a serving projection.

- **G1. `route_diagnosis_packet`** (`root_cause_diagnosis`): ranked factor bundle — schedule/
  runtime, service delivery, street/curb context, demand, treatment gaps, source gaps, residual —
  each factor with evidence/counter-evidence/claim posture, consuming decomposed components (CJTP
  decomposition from `service_delivery`, never the raw composite).
- **G2. Corridor/project case artifact** (`corridor_project_evaluation`): composes C4/C6 studies,
  treatment scope, timelines, document corroboration, rider weighting → exportable scorecard. The
  productized form of the exemplar's analysis core; the serving `natural_experiment_case` payload
  and `case_ready` support level hang off this.
- **G3. `board_reporting_package`** (period-scoped): approved metric movement + diagnosis +
  caveats + refs → composer template, reusing F exports.
- **G4. Cost/value packet** (`cost_effectiveness`): after D3 cost fields exist; cost-per-benefit
  with uncertainty; public wording stays out until sources/windows are explicit.
- **G5. Equity incidence lens**: consumes E9 allocation + rider pain + treatment gaps; caveated
  discovery lens, never a compliance claim.
- **G6. Flagship briefs (integration tests for the whole plan).**
  - **Flagship I — synthetic methods brief** (the exemplar itself, or close): fabricated panel,
    full narrative, real composer, real figures, banner per F7. Proves Tracks C (methods on
    fixtures) + F end-to-end without waiting for data depth. This is a *publishable portfolio
    artifact* in its own right.
  - **Flagship II — real corridor brief**: a real treated corridor with Tier 2 coverage, run
    through C6 case packets, methodology-gated wording, document corroboration, falsifiable
    prediction. The "finished" bell for this plan.

## 10. Milestones

Tracks run in parallel; milestones are checkpoints with exit criteria.

| Milestone | Exit criteria |
|---|---|
| **M0 — Foundations lit** | Track B Phases 0–2 landed; A1 cell-grain re-ingest done; A2 continuous collection running (soak artifact); D1 contract agreed and documented in both repos |
| **M1 — Substrate complete** | A3–A7 done (A8 probe verdict written); D2/D3 snapshot ingest + projections live; mta-wiki staged-source ingestion progressing (its own roadmap) |
| **M2 — Study engine v1** | C1–C5 landed with fixture-proven methods; curb-pulse R1–R3 running on real panels; first case packets exist |
| **M3 — Serving spine** | E1–E7 live; Track B Waves 1–2 calibrated so reliability/trend models are gated honestly |
| **M4 — Synthesis v1** | G1 diagnosis packet + G2 case artifact as review-gated applied-research outputs; E8–E10 live |
| **M5 — Authoring end-to-end** | F1–F7 done; **Flagship I published**; C7 methodology gate exercised at least once |
| **M6 — Evidence studio** | G3–G5; **Flagship II published with methodology approval**; coverage matrix (§11) auto-generated and green or explicitly deferred per family |

## 11. Family coverage matrix (plan view)

Disposition per inventory family: which tracks unlock it and at which milestone it should be
answerable with honest posture. (The generated matrix the inventory calls for becomes an artifact
in M6; this is the planning view.)

| Family | Tracks | Milestone | Posture notes |
|---|---|---|---|
| `route_attention` | B, E | M3 | richer sections need E2/E3 + B readiness |
| `headline_condition` | E | M3 | mixed-freshness labels |
| `rider_pain` | A6, B, E2 | M3 | stop-level loads stay caveated |
| `equity_incidence` | E9, G5 | M6 | discovery lens only |
| `slow_segment` | A1, B, E2, E10 | M3 | daypart claims need cell grain |
| `reliability_wait` | B(W1), E3 | M3 | decomposed wait components |
| `service_delivery` | A7, B, E | M4 | owns CJTP decomposition; build read model before findings |
| `history_change` | A1, B(W2), E10 | M3 | comparability labels from A7 |
| `peer_context` | B(W2), E8 | M4 | transparent cohorts |
| `schedule_runtime_gap` | A7, B(W2) | M3–M4 | readiness may cap at route_context until corpus complete |
| `root_cause_diagnosis` | G1 (A,C,D inputs) | M4 | applied-research packet first, public later |
| `treatment_inventory` | D3, E5 | M3 | materializer plan executes |
| `intervention_ontology` | D3, E6 | M3 | catalog + endpoints |
| `treatment_gap` | B (calibrated) | M3 | done at Track B Wave 3 |
| `intervention_effect` | C4, C7, B(W3) | M4 | causal ceiling enforced |
| `corridor_project_evaluation` | G2 | M4–M6 | case artifact before any new detector |
| `cost_effectiveness` | D3, G4 | M6 | no public "worth it" until sources explicit |
| `timeline_events` | D2/D3, E7 | M3 | ref-first hydration |
| `document_claims` | D5 | M4 | alignment as review packets first |
| `source_completeness` | B, D6, E | M3 | product-aligned spine |
| `evidence_readiness` | B, E1 | M3 | readiness buckets + evidence index |
| `board_reporting_package` | G3, F | M6 | composer workflow |
| `compliance_package` | deferred | — | revisit when a concrete workflow appears |
| `external_context` | A3/A4/A5, B(W4), C6 | M2–M4 | panels before public detectors |
| `service_change_coordination` | deferred | — | neighboring product |
| `multi_year_patterns` | A1/A2, C2, E10, G2 | M2–M4 | carpets + nominator research-first |
| `compare_cohort` | E8 | M4 | v2 read models |
| `geographic_rollup` | E9 | M4 | allocation caveats visible |
| `brief_authoring_workflow` | F | M5 | workflow surface, not a family |

## 12. Claim-posture doctrine for exemplar-class briefs

The exemplar works because it is honest at every step. Productized rules (most already exist in
ADR-0018/the ideal doc; the new ones are starred):

1. Descriptive panel facts (medians, pulses, percentiles) — allowed once grain + coverage are
   cited; silence states explicit.
2. Associational context (311 density, permit overlap) — allowed with fanout/temporal-alignment
   caveats; never "caused."
3. Event-study/effect language — methodology-gated (C7), CIs mandatory, placebo + pre-trend
   reported, *including null results* (the exemplar's "−4%, indistinguishable from zero" is a
   feature).
4. ★ Counterfactual predictions — allowed only as dated, falsifiable review hypotheses with the
   check named ("RD at enforcement date should…"); rendered distinctly in briefs.
5. ★ Synthetic/illustrative briefs — first-class artifacts with a forced banner and visual
   treatment; never mixable with real-data claims in one brief.
6. Document corroboration — block-cited (mta-wiki evidence handles), with match *and* miss counts
   ("37/41" implies reporting the 4).

## 13. Risks and honest limits

- **Daily history is gone.** 2023–2025 daily segment panels cannot be reconstructed from public
  aggregates; A8's archive probe is the only (uncertain) partial remedy. Mitigation: month-cell
  retrospectives now, daily era accrues from A2. The literal 36-month-daily exemplar is a 2029
  artifact; an exemplar-*class* brief (month-cell recurrence + document corroboration + event
  study) is an M5–M6 artifact.
- **Film permits dataset shape is unverified.** A4 probes before promising; fallback is DOT
  permits + Tier 2 document windows (the curb-pulse plan's stated default).
- **Cross-repo coupling.** mta-wiki is pilot-stage; D1's pin-by-version contract isolates this
  repo from its churn. Risk: schema drift — mitigated by snapshot schema-version checks at ingest.
- **TypeScript statistics scope creep.** C-track is the most tempting place to gold-plate. The
  ceiling is fixed: ITS + FE-contrast + bootstrap + placebos. Anything beyond needs a new ADR.
- **Single-maintainer review bandwidth.** Calibration gold sets (B), case-packet audits (C6), and
  methodology approvals (C7) all consume human review. LLM-assisted review with saved artifacts
  (per ADR-0018) is the lever; milestones should slip before review discipline does.
- **Engagement-validation gap.** The §5–6 demand hypotheses in the engagement research request are
  still unvalidated externally; if validation lands, re-rank within tracks (same structure).

## 14. Non-goals

- No real-time operations dashboard, trip planner, or enforcement hardware integrations.
- No Python/Postgres/PostGIS/new runtime; kernel stays pure; serving stays projection-only.
- No public causal claims without C7 methodology approval — ever.
- No synthetic-control/GMM/dynamic-panel methods in v1 (Open Decision 3 to revisit).
- No new detectors for families the intake checklist routes to panels/read-models first.
- No full NTD/Title VI form tooling (`compliance_package` stays deferred).
- No second geography method outside `area_route_allocation`.
- No chat-shaped AI surfaces; artifact-shaped outputs only.

## 15. Open decisions for the user

1. **Commit to continuous GTFS-RT collection (A2) now?** It has real operational cost (Worker
   invocations, R2 storage, retention policy) and is the only path to the daily-panel era — every
   deferred month is unrecoverable. Recommendation: yes, immediately, with a 90-day retention
   review.
   **Decided 2026-06-10 (maintainer): defer A2; rely on the archival source.** The Bus Observatory
   `busobservatory-lake` S3 archive already captures the feed (March 2026 verified complete:
   32 Parquet files, 3.59 GB, `full_month_candidate` per
   `data/artifacts/source-availability/bus-observatory-gtfs-rt-2026-03.json`), so "every deferred
   month is unrecoverable" no longer holds while that archive stays live. The A8 probe is
   effectively answered; the remaining work is row-level/route-coverage QA + an importer with
   `gtfsRtSource = third_party_recovered`. Priority goes to finishing the other tracks instead.
2. **mta-wiki export-contract ownership and cadence (D1).** Who cuts snapshots, how versions are
   pinned, and whether bus-reliability-tracker CI verifies contract compatibility.
   Recommendation: manual snapshot cuts at mta-wiki milestones for now; revisit automation at M3.
3. **Study-engine ceiling (C-track).** Confirm the minimal-methods scope (ITS + FE contrast +
   bootstrap + placebos, no synthetic control). Recommendation: confirm; revisit only if a
   flagship case genuinely needs stronger identification.
4. **Flagship II corridor choice.** Criteria: treated within the speed-corpus window, Tier 2
   document coverage, 311 density, clean control candidates. Recommendation: shortlist three at
   M2 from curb-pulse R3 output rather than choosing now.
5. **Supersede Track B Open Decision 4** (was: delete `causal/`+`forecasting/`). New
   recommendation: delete `forecasting/` only; `causal/`+`core/` become the C5 study runner.
   Needs explicit confirmation since Track B may land first.

## 16. Verification defaults and maintenance

Everything in the global defaults of `backend-goal-finish-detectors.md` applies (scoped
`check:types`, per-package tests, fixture-backed pipeline commands, boundary tests,
`git diff --check`, knowledge log/index updates, `bun run check:knowledge`). Additions for this
plan:

- Cross-repo slices (D) verify on **both** sides: mta-wiki `bun run validate` + parity check;
  bus-side fixture ingest + schema-version assertion.
- Every track slice that changes a public surface re-runs the production-boundaries harness and
  `bun --filter @bp/web build` (respect the 168KB initial-JS budget; lazy-load all new chart
  surfaces).
- This document is maintained like the inventory: update the §11 matrix when families/tracks
  change disposition; the M6 coverage matrix becomes the generated successor.

## 17. Assumptions (documented, not asked)

- File location/name follows the `docs/research/` planning-doc convention; this plan is the
  umbrella the inventory's "Next Artifact" (coverage matrix) will eventually be generated from.
- The product question inventory's family ids are treated as the durable contract (per its own
  lifecycle section); this plan never renames them.
- Tier 2 staged-source ingestion throughput (the ~2.5k staged sources) is mta-wiki-repo work and
  is referenced, not planned, here.
- The exemplar brief's role is a capability bar and integration test, not a literal commitment to
  the M101 numbers or to film permits being the first proven event family.
