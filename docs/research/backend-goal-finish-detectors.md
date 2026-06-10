# Backend Goal: Finish the detector system

**For:** an implementing agent. Successor to `docs/research/backend-goal-seam-calibration.md`.
Produced from `docs/research/planning-prompt-finish-detectors.md` on 2026-06-10; every current-state
claim below was verified against the working tree on that date.

**Read with:** `docs/decisions/0018-detector-calibration-readiness-loop.md` (the calibration
contract), `knowledge/wiki/analysis/detector_catalog.md` (the detector map + intake checklist),
`knowledge/wiki/analysis/ideal_detector_system.md` (north star + maturity ladder 0–6).

**Mission:** take the detector layer from "4 of 21 calibrated" to *finished*: every product-facing
detector through the ADR-0018 loop, the kernel→data seam fully closed, serving provably gated by
readiness — and then climb from that floor toward the ideal detector (complete hypothesis packets,
severity≠confidence, decomposed confidence, silence as a state, lifecycle governance). The "perfect
detector" is explicitly not buildable; it is the gap-analysis lens. The buildable target is the
ideal-detector maturity ladder, and this plan schedules the climb in small reviewable slices.

---

## 0. Ground truth (verified 2026-06-10)

### Test suites

| Suite | Result | Note |
|---|---|---|
| `bun --filter @bp/analytics test` | **172 pass / 0 fail** | green |
| `bun --filter @bp/applied-research test` | **316 pass / 0 fail** | green |
| `bun --filter @bp/pipeline-v2 test` | **456 pass / 5 fail** | all 5 are cwd bugs, not regressions |
| `bun --filter @bp/pipeline test` | **no such package** | CLAUDE.md verification default is stale |

The 5 pipeline-v2 failures (`brief/map/evaluation artifacts`, `route-speed-availability`,
`route speed histories manifest` boundary tests) all `readFileSync` repo-root-relative paths like
`"tools/pipeline-v2/src/commands/brief/artifacts.ts"`. They pass when run from repo root and fail
under `--filter` (package cwd). Real red in the documented verification path, trivial fix → S0.1.

### Calibration split (produced from registry + artifacts, not from a summary)

**Calibrated (4):** `treatment_scope_gap`, `treatment_scope_mismatch` (118-label gold, 12/12
primary survival, 0/23 suppress leakage, readiness projection; artifacts under
`data/artifacts/detector-calibration-{terminal-gate,reviewed-gold,expanded-gold,history-gates}/`);
`speed_pace_hotspot` (v2 per-route cap + length gate, 26/27 primary survival, readiness manifest
serving-wired; `detector-calibration-speed-pace-v{1,2}/`); `customer_journey_shortfall` (135-label
gold, 33/33 primary, 2/19 near-floor suppress edge cases documented;
`detector-calibration-customer-journey-gold-v{1,2}/`).

**In-flight (1):** `observed_reliability` — no-write inventory + review-queue builder exist
(`detector-calibration-observed-reliability/`), no reviewed gold yet; known cap bias (100 emitted
vs 220 qualifying at `--candidateLimit 1000`).

**Untouched (16):** `source_gap`, `persistent_speed_hotspot`, `multi_month_speed_peer`,
`headway_reliability_ewt`, `bunching_hotspots`, `rider_weighted_excess_wait`,
`travel_time_variability`, `schedule_mismatch`, `degradation_trend`, `positive_deviance`,
`intervention_gap`, `intervention_event_study`, `intervention_underperformance`,
`permit_correlated_slowdown`, `service_request_context`, `delay_concentration`. Registry entries
complete; no calibration artifacts.

### Seam state (prior goal's Phase A)

- **A1 done.** `FeatureResolver` port + runner live in the kernel
  (`packages/analytics/src/core/runner.ts:39`), satisfaction is typed data
  (`resolved` / `satisfied_by_feature_quality` / `unsupported`).
- **A2 partial / A3 not done.** `packages/applied-research/src/detector-runs/detector-study.ts`
  still hand-rolls `featureContractSupportReason()` (~line 357) as a grain→prose switch and wraps
  it in a thin fake resolver (~line 389) instead of deriving satisfaction from the real resolvers
  in `detector-input-assembly.ts:219-302`.
- **A4 nearly closed.** `tests/harness/production-boundaries.test.ts` enforces that
  `apps/web`/`studio-api`/`domain` never import analytics/applied-research/pipeline, and that
  applied-research never imports pipeline. But it does **not** scan `tools/pipeline-v2`, and one
  direct kernel import remains: `tools/pipeline-v2/src/commands/build/treatment-event-panel.ts:13`
  imports `INTERVENTION_EVENT_STUDY_DETECTOR_ID` from `@bp/analytics/detectors`.

### Serving state

Readiness reaches serving correctly in shape: readiness manifest
(`packages/applied-research/src/evaluation/detector-readiness-serving-manifest.ts`) → R2 key
`studio/v2/detectors/route-detector-readiness-manifest.json` → `studio-api` `read-handlers.ts:600`
→ `buildRouteInsightsFromDetectorReadiness()` in `@bp/domain`. `apps/web` imports nothing from
analytics (boundary-tested). **Open gap:** nothing *enforces* that only calibrated detectors'
readiness buckets feed public surfaces — no test that insights/findings projections respect
readiness buckets, no allowlist preventing an uncalibrated detector id from appearing.

### Recurring root causes mined from the 4 completed calibrations

| # | Pattern | Detectors that hit it | Shared or per-detector |
|---|---|---|---|
| 1 | Global top-N candidate cap = biased sampler (Manhattan 78/100 in speed-pace v1; 120 qualifying rows hidden in observed_reliability) | speed_pace, observed_reliability, customer_journey | **Shared** — fix-once (per-route/scope caps + recorded capped-out counts) |
| 2 | Terminal/layover segments emit as slow but aren't actionable; features carry no terminal flag, so suppression is readiness-only (QM11 leak) | speed_pace, treatment_scope_gap/mismatch | **Shared** — feature/resolver gap |
| 3 | Duplicate physical scope (same block under many route/direction/daypart identities) | speed_pace (31/63), treatment_scope | Per-detector keys, shared helper pattern |
| 4 | Inert/incomplete feature fields (`spatialConfidence` all 1.0; lane-type taxonomy missing Enhanced-Bus-Stop split) | speed_pace, treatment_scope | **Shared** — feature audit |
| 5 | "Slow but not worsening" needs history gates, and brittle single-delta thresholds drop reviewed primaries | treatment_scope_mismatch; will recur for degradation_trend, multi_month_speed_peer | Per-family, reusable approach |
| 6 | Sparse-denominator/exposure rows leak suppress labels until an explicit exposure floor exists | customer_journey (minCustomers 500→2,500), observed_reliability | Per-detector thresholds, shared discipline |

### Maturity read (ladder from `ideal_detector_system.md`)

Calibrated 4 ≈ **level 4** with level-5 scaffolding (readiness projections; speed-pace is
serving-wired). `observed_reliability` ≈ level 2–3. The 16 untouched ≈ level 2 (registry packet
shape + coverage rows, no review loop). System-level: no materialization-coverage artifact, no
demotion/supersession/retirement records, no consolidated false-positive register, score-vector
novelty lacks rank-correlation stats.

---

## 1. Priority criterion for detector ordering

Order = **(a) serving demand × (b) substrate reuse × (c) claim risk**, justified by
`public-engagement-questions-research-request.md` §5–6:

- §5 ranks everyday riders ("is *my* route one of the bad ones / when is it least reliable") as the
  highest-volume audience, and journalists/advocates next (rankings, "getting worse",
  "did the bus lane work"). §6's framings put personal lookup, rankings/superlatives, and trend
  decline ahead of context stories.
- Substrate reuse: calibrating detectors that share a grain or gold substrate back-to-back amortizes
  the queue/strata design (the stop-direction-hour pair; the treatment/intervention family on the
  treatment-scope gold).
- Claim risk last: the intervention family is the highest-credibility-risk surface ("before/after"
  stories) — it goes after the shared fixes and after the team has six calibrations of practice,
  but **before** context detectors, because §6 rates before/after stories high-value and the
  treatment-scope substrate is freshly calibrated.

This yields Waves 1–4 in Phase 3. The alternative frame (MTA-portfolio-first: pull the
intervention family forward to showcase methodology) is listed as Open Decision 1.

---

## Phase 0 — Stabilize the verification floor

*Why first: the plan's own per-slice verification commands must be trustworthy.*

- **S0.1 Fix the 5 cwd-dependent pipeline-v2 boundary tests.** Resolve the command-source paths
  relative to the test file (`import.meta.dir`) instead of cwd.
  *Verify:* `bun --filter @bp/pipeline-v2 test` fully green; same tests still green via repo-root
  `bun test`.
- **S0.2 Fix stale verification defaults.** CLAUDE.md's "Pipeline changes:
  `bun --filter @bp/pipeline test`" matches no package (only `@bp/pipeline-v2` exists). Update
  CLAUDE.md (and any scripts referencing `@bp/pipeline`).
  *Verify:* the documented command runs; `git grep -l "@bp/pipeline\b"` shows no stale references
  outside historical docs.

## Phase 1 — Close the seam (finish prior Phase A)

*Why now: Phase 3 runs ~17 calibrations through this machinery; hand-rolled satisfaction prose and
an unguarded kernel import are exactly the kind of drift that 17 repetitions would entrench.*

- **S1.1 Delete the hand-rolled satisfaction map.** Replace
  `featureContractSupportReason()` + the thin fake resolver in
  `packages/applied-research/src/detector-runs/detector-study.ts` with satisfaction derived from
  the real resolvers in `detector-input-assembly.ts` through the kernel runner port.
  *Verify:* run-artifact fixture outputs unchanged (golden diff);
  `bun --filter @bp/applied-research test`.
- **S1.2 Close A4 and guard it.** Repoint
  `tools/pipeline-v2/src/commands/build/treatment-event-panel.ts` to get the detector-id constant
  from the `@bp/domain` detector-id allowlist (`packages/domain/src/findings/index.ts`) or via
  `@bp/applied-research`; extend `tests/harness/production-boundaries.test.ts` to scan
  `tools/pipeline-v2/src` import statements for `@bp/analytics` (the codemode sandbox prose strings
  in `lib/codemode/tool-loop.ts` and the symlink in `lib/sandbox.ts` are not imports and stay).
  *Verify:* boundary test red on a direct import, green after; one fixture-backed `findings`
  command still runs; `bun --filter @bp/pipeline-v2 test`.

## Phase 2 — Shared fix-once slices

*Why before per-detector work: root causes 1, 2, 4 above recur across families; fixing them once
means Wave 1–4 calibrations don't each rediscover them. Each slice is independent.*

- **S2.1 Terminal/layover flag as a feature field.** Add `isTerminal` (or
  first/last-sequence flags) to `SegmentDaypartFeature` and the `route_segment_month` grain,
  derived in the resolvers; promote terminal suppression from readiness-only into detector gates
  where reviewed labels back it.
  *Verify:* contract + detector tests in `@bp/analytics`; re-run speed-pace eval — reviewed primary
  survival must not drop (26/27 floor; the QM11 terminal leak should now be detector-gated);
  `bun --filter @bp/applied-research test`.
- **S2.2 Cap policy as shared run discipline.** Make per-route/per-scope caps plus a
  qualifying-floor count the default no-write-run pattern (template: speed-pace v2); every run
  artifact records capped-out counts by borough/route so cap bias is visible in inventory, never
  discovered post-review.
  *Verify:* shared helper unit tests; `observed_reliability` no-write rerun artifact shows
  capped-out distribution matching the known 100-vs-220 probe.
- **S2.3 Feature-field audit.** Fix the two known inert/incomplete fields: populate
  `spatialConfidence` from real join quality or mark the gate unsupported in the contract (an
  all-1.0 gate is worse than none — it claims verification that never happened); formalize the
  bus-lane vs Enhanced-Bus-Stop lane-type split as a typed field on
  `route_segment_treatment_summary` instead of gate-side re-derivation.
  *Verify:* `bun --filter @bp/analytics test`; treatment-scope eval unchanged (12/12, 0/23).
- **S2.4 Materialization-coverage artifact.** Per feature-grain × release-month coverage (scopes
  materialized / fleet universe), written by a fixture-backed pipeline command, referenced by
  calibration NOTEs and readiness artifacts. This is ideal-doc "Concrete Next Build Steps" Step 2
  and the precondition for honest fleet-readiness claims on `stop_direction_hour` detectors.
  *Verify:* fixture-backed command writes the artifact; NOTE template cites it;
  `bun --filter @bp/pipeline-v2 test`.
- **S2.5 `deferred_not_in_scope` coverage state.** Add the missing silence state to the coverage
  vocabulary (kernel + domain types) so intentionally-not-applicable scopes stop blending with
  clean no-hits.
  *Verify:* `bun --filter @bp/analytics test`; scoped `check:types` for analytics + domain.

## Phase 3 — Per-detector calibration waves

For **every** detector below, the slice is the ADR-0018 loop verbatim: no-write inventory (with
S2.2 cap accounting) → stratified review queue → reviewed gold labels (stable identity, the five
frontend-use buckets) → evaluator (primary survival, suppress leakage, cap effects) → label-backed
deterministic gates only → readiness projection. One detector = one reviewable slice.

**Per-slice verification template:** `data/artifacts/detector-calibration-<name>/NOTE.md` +
reviewed-gold/eval/readiness JSON artifacts; reviewed-gold + eval module under
`packages/applied-research/src/evaluation/`; focused gate tests in
`packages/analytics/test/r3-detectors.test.ts` or sibling; `bun --filter @bp/analytics test`;
`bun --filter @bp/applied-research test`; `knowledge/log.md` append entry. Suppress leakage 0 on
the combined gold set (or a documented near-floor exception, as customer-journey's 2/19);
reviewed-primary survival reported before/after every gate change.

### Wave 1 — rider-experience core (personal lookup; §5 audience 1)

| # | Detector | Grain | Current level | Dominant calibration risk |
|---|---|---|---|---|
| 1 | `observed_reliability` (finish in-flight) | route_reliability_month | 2–3 | Cap bias (100 vs 220 qualifying); missing GTFS-RT/BWA support must map to readiness states, never threshold relaxation |
| 2 | `headway_reliability_ewt` | stop_direction_hour | 2 | Fleet materialization incompleteness (cite S2.4 artifact); stop-hour pocket vs route rollup confusion |
| 3 | `bunching_hotspots` | stop_direction_hour | 2 | Same substrate as #2 — calibrate immediately after to reuse strata design; cross-route stop-pair duplicate scope |
| 4 | `delay_concentration` | route_segment_month | 2 | Terminal segments (needs S2.1); concentration metric sensitivity to segment count/length mix |

### Wave 2 — trends, peers, superlatives (journalists/advocates; §6 rankings + decline framings)

| # | Detector | Grain | Current level | Dominant calibration risk |
|---|---|---|---|---|
| 5 | `degradation_trend` | route_metric_history | 2 | History-confidence: the mismatch lesson says brittle single-delta worsening thresholds drop reviewed primaries; seasonal/route-version breaks |
| 6 | `multi_month_speed_peer` | route_month | 2 | Peer-group transparency (rankings invite methodology attacks per §6); reciprocal-metric (mph vs pace) artifacts |
| 7 | `travel_time_variability` | route_direction_daypart | 2 | Direction-daypart materialization coverage; service-pattern breaks |
| 8 | `schedule_mismatch` | route_direction_daypart | 2 | Schedule-corpus completeness; expect readiness to cap at `route_context` until route-version rules are strengthened (per ideal-doc family 4) — that capped outcome is a *valid* calibration result |
| 9 | `persistent_speed_hotspot` | route_segment_month | 2 | **Decision slice, not automatic calibration:** overlaps `speed_pace_hotspot` (same similarity cluster). Run the supersession evaluation first (Phase 4 lifecycle records); calibrate only if it survives. See Open Decision 2 |

### Wave 3 — intervention family (before/after stories; highest claim risk; treatment substrate is freshly calibrated)

| # | Detector | Grain | Current level | Dominant calibration risk |
|---|---|---|---|---|
| 10 | `intervention_underperformance` | route_month + intervention_window + treatment summaries | 2 | Named next target in the treatment-scope NOTEs; peer-adjustment validity; undated treatments must surface as source gaps |
| 11 | `intervention_gap` | route_month + intervention_window + treatment summaries | 2 | "Missing date ≠ no intervention" — the gap claim is only as honest as treatment-inventory completeness; pain-threshold fairness across boroughs |
| 12 | `intervention_event_study` | intervention_panel + route_metric_history | 2 | **Family adaptation (candidate-causal):** readiness must cap at `review_queue`/methodology review — there is no `public_finding_candidate` bucket for effect language without human methodology approval. Pre-trend/placebo/autocorrelation gates already exist as pure helpers; calibration = labeling panel quality, not effect truth |

### Wave 4 — context, experimental, coverage (family adaptations dominate)

| # | Detector | Grain | Current level | Dominant risk / family adaptation |
|---|---|---|---|---|
| 13 | `permit_correlated_slowdown` | route_month + context_source_month | 2 | **Adaptation (associational context):** expected label mass is `route_context`/`suppress`; `primary_finding` is rare by design — evaluate leakage *into* findings, not primary survival. Risks: route-LION fanout, month/daypart temporal alignment |
| 14 | `service_request_context` | route_month + context_source_month | 2 | Same adaptation; complaint-type allowlist + borough/route-length normalization (the ideal-doc 311 promotion path) |
| 15 | `rider_weighted_excess_wait` | rider_weighted_excess_wait | 2 (experimental) | **Adaptation:** calibration may legitimately conclude "stays internal" — ridership-proxy quality is the gate. See Open Decision 3 |
| 16 | `positive_deviance` | positive_deviance | 2 | **Adaptation (learning detector, not problem-finding):** invert the vocabulary — "suppress" = false deviants (schedule padding, data artifacts); labels grade learning-candidate quality, and outputs feed internal review, not public findings |
| 17 | `source_gap` | source_coverage + route_reliability + treatment_source_gap | 2 | **Adaptation (coverage authority):** calibration = agreement audit between its emitted states and the S2.4 materialization artifact, then wiring its states as admission inputs to *other* detectors' readiness (ideal-doc family-1 next step). No gold-set precision frame |

## Phase 4 — Serving governance and lifecycle (the "definition of finished" machinery)

*Depends on: Phase 1 (seam), at least Wave 1 (so there is something real to gate). Runs interleaved
with Waves 2–4 — these are system slices, not per-detector.*

- **S4.1 Enforce readiness gating in serving.** Public route-insights/findings projections may only
  carry detector ids present in a readiness manifest with `public_finding_candidate` or
  `route_context` buckets; uncalibrated detector ids are structurally excluded. Add the missing
  harness test (this is today's OPEN gap).
  *Verify:* new test red against a synthetic uncalibrated-id manifest violation, green on current
  artifacts; `bun test tests/harness/production-boundaries.test.ts`; `bun --filter @bp/web build`.
- **S4.2 Lifecycle records: demotion / supersession / retirement.** Persist machine-readable
  lifecycle artifacts per detector id+version (pure helpers exist in
  `packages/analytics/src/calibration/detector-lifecycle.ts`; the persistence and pipeline command
  do not). First real exercise: the `persistent_speed_hotspot` vs `speed_pace_hotspot`
  supersession decision (Wave 2 #9).
  *Verify:* fixture-backed command writes a lifecycle record; registry `retirementStatus` and the
  catalog's Maintenance Rule updated in the same slice; `bun run check:knowledge`.
- **S4.3 Consolidated calibration persistence.** One queryable register across detector families:
  gold-set locations, reviewer outcomes by detector id/version, false-positive root-cause tags
  (today these live per-calibration in scattered NOTEs/JSON). This is what makes level 6
  ("review outcomes feed improvements") possible release-over-release.
  *Verify:* register artifact generated from existing calibration dirs without hand-editing them;
  fixture test.
- **S4.4 Score-vector novelty stats.** Add Spearman/rank-correlation + spread statistics to the
  pure calibration helpers (called out in both the ideal doc and the audit).
  *Verify:* `bun --filter @bp/analytics test` with focused unit tests.

## Phase 5 — Maturity-raising track (from the ADR floor toward the ideal detector)

*Scope discipline: these apply family-by-family, only after that family is calibrated, and only for
families feeding public surfaces. This is the honest subset of the north star for now; the rest is
deferred (see Non-goals).*

- **S5.1 Severity ≠ confidence.** Split the review-queue sort into the ideal-doc scoring
  decomposition (`severity_score`, `evidence_score`, `specificity_score`, `persistence_score`,
  `review_priority_score`) as review-packet fields. Public UI keeps the simple pair.
  *Verify:* review-queue fixture shows decomposed fields; queue ordering change documented in the
  slice NOTE; `bun --filter @bp/applied-research test`.
- **S5.2 Confidence decomposition in review packets.** Add the component fields
  (`source_sufficiency`, `join_confidence`, `temporal_alignment`, `metric_stability`,
  `peer_context`, `counterfactual_strength`, `review_readiness`) for calibrated families; the
  published label stays single-valued.
  *Verify:* packet fixture; evaluator reports component completeness.
- **S5.3 Evidence-packet completeness as an eval metric.** Counter-evidence and missing-evidence
  link completeness reported per family by the evaluators ("a candidate with no counter-evidence
  and no missing-evidence section is not mature — it is just a hit").
  *Verify:* eval output gains completeness rates; thresholds documented, not enforced silently.
- **S5.4 `official_context` evidence-role split.** Separate agency-record evidence from generic
  context where publication wording depends on an official document (the ideal doc's named next
  evidence-role cleanup; matters most for the Wave 3 family).
  *Verify:* schema/type tests; treatment-scope + intervention packets re-validated.

**Target maturity levels:** every calibrated detector exits Phase 3 at **level 4** (gold-tested
confidence/thresholds) with a readiness projection (level-5 scaffold). Phase 4 makes level 5 real
(explicit promotion rules enforced in serving) and scaffolds level 6 (S4.3 register feeding
release decisions). Phase 5 deepens packet quality within levels 4–5. No detector is claimed at
level 6 in this plan — that requires multiple release cycles of reviewer-outcome data.

---

## Missing Spaces decisions (catalog §Missing Spaces; intake checklist gates all of these)

| Space | Decision | Rationale |
|---|---|---|
| Detector supersession & retirement | **In scope now** (S4.2) | It is a system slice, not a new detector; Wave 2 #9 needs it |
| Equity / rider burden | **Applied-research first**; no detector | `rider_weighted_excess_wait` already shows the blocker is ridership-proxy quality, not detector logic |
| Multi-year route carpets / anomaly episodes | **Applied-research first** (serving panel later) | Needs `degradation_trend` calibrated + route-page serving panels; not a detector question yet |
| TSP inventory & effectiveness | **Defer** | No intersection-level treatment source exists; `source_gap` states the absence honestly — that *is* the current product answer |
| Weather / event / school-calendar fingerprints | **Defer** (applied-research panels if revisited) | Context family must finish its own promotion paths (Wave 4) before adding new context sources |
| Route timeline synthesis from Tier 2 | **Out of this plan** | Serving/curation artifact, and Tier 2's bottleneck is reconciliation lineage — a separate workstream |

No new detectors are added anywhere in this plan.

---

## Definition of done

The detector system is "finished" (for this goal) when:

1. **Every active product-facing detector is at maturity level ≥ 4**: through the ADR-0018 loop
   with a combined-gold evaluation showing 0 suppress leakage (or documented near-floor
   exceptions) and full reviewed-primary survival reported — **or** has an explicit lifecycle
   record (superseded/retired/internal-experimental) instead. "Has a gold artifact" alone does
   not count; the eval + readiness projection must exist.
2. **Serving is provably readiness-gated** (S4.1 test in CI): no detector id reaches public
   surfaces outside `public_finding_candidate` / `route_context` buckets; candidate-causal
   detectors cannot reach them at all without methodology review.
3. **The seam is closed and guarded**: no hand-rolled satisfaction prose; no direct
   pipeline→kernel registry imports; boundary tests cover `tools/pipeline-v2`.
4. **Silence is auditable**: materialization-coverage artifact per grain×month exists;
   `deferred_not_in_scope` is a first-class coverage state; stop-hour detectors' fleet-readiness
   claims cite the coverage artifact.
5. **Lifecycle scaffolding exists and was exercised at least once**: lifecycle records (S4.2) used
   for the `persistent_speed_hotspot` decision; consolidated calibration register (S4.3) generated;
   rank-correlation novelty stats available (S4.4).
6. All package suites green under the documented per-package commands, including
   `bun --filter @bp/pipeline-v2 test`.

### Non-goals (resist all of these)

- No auto-promotion — readiness only gates; a human still graduates findings.
- No causal/effect public language anywhere; event-study stays behind methodology review.
- No agent critic loop; no LLM in the detector-of-record path.
- No feature *store*, no new feature grains unless a specific calibration forces one.
- No relaxing detector `.max()` caps/thresholds to flatter metrics; labels never move to make
  evaluations pass.
- No universal gold-label schema beyond the shared bucket vocabulary.
- No new detectors from Missing Spaces; the intake checklist gates any future proposal.
- No claiming level 6 or "network-complete" coverage without the artifacts that prove it.
- No Python/Postgres/PostGIS/new runtime; kernel stays pure.

---

## Open decisions for the user

1. **Priority frame for Waves 2–3.** This plan orders by public-engagement demand (riders →
   journalists/advocates → intervention stories). The defensible alternative is
   MTA-portfolio-first: pull the intervention family (Wave 3) ahead of trends/superlatives to
   showcase methodology discipline. Recommendation: keep engagement order — the intervention
   family benefits from the extra calibration practice first — but this is a positioning call.
2. **`persistent_speed_hotspot`: supersede or calibrate?** It overlaps `speed_pace_hotspot`
   (same cluster, coarser grain). Recommendation: run the S4.2 supersession evaluation and retire
   it if `speed_pace_hotspot` + `delay_concentration` cover its question; calibrating a detector
   we then retire is wasted review labor. User call because it permanently removes a detector.
   **Decided 2026-06-10 (maintainer): supersede.** Execute via the S4.2 lifecycle-record slice
   (inventory already exists under `detector-calibration-persistent-speed-hotspot/`; note its
   high-limit probe returned exactly 100 — verify the candidate-limit flag applies before citing
   emission counts in the retirement record).
3. **`rider_weighted_excess_wait`: invest now or keep internal?** Recommendation: keep
   experimental/internal until ridership-proxy quality is demonstrated (it gates the equity space
   too); slot 15 then becomes a short "documented internal-only readiness" slice.
4. **Unused `@bp/applied-research` core (`core/`, `causal/`, `forecasting/`, `artifacts/`
   study scaffolding): delete or keep?** The architecture request invites deletion if it has zero
   importers after the seam work. Recommendation: delete in a single slice after Wave 3 confirms
   the event-study calibration needs none of it (its gates live in
   `packages/analytics/src/calibration/`); git history is the revival path.

---

## Global verification defaults (every slice)

- Scoped types: `bun run check:types` **per package only** (repo-wide OOMs at default node heap —
  a clean-looking full run may have silently aborted).
- `bun --filter <package> test` for any touched package; pipeline slices add one fixture-backed
  command run.
- `bun test tests/harness/production-boundaries.test.ts` whenever imports change.
- `git diff --check` clean.
- Durable decisions: append `knowledge/log.md` (`## [YYYY-MM-DD] type | title`), update
  `knowledge/index.md`, keep `detector_catalog.md` + `ideal_detector_system.md` current per the
  catalog's Maintenance Rule, `bun run check:knowledge`.

## Assumptions made (documented, not asked)

- This file lives at `docs/research/backend-goal-finish-detectors.md`, following the predecessor's
  naming; it is the implementing agent's goal document.
- One detector per slice, sequential within a wave; ADR-0018 permits LLM-assisted review labeling
  with artifacts saved, which is how a single maintainer gets through 17 gold sets.
- The engagement research request's §5–6 hypotheses are accepted as the demand rationale (the
  request itself asks for external validation, which has not happened; if its ranking changes,
  re-order Waves 2–4, not the phase structure).
- Test-suite state was measured on branch `codex/reviewable-current-worktree-slices` with the
  current uncommitted worktree; if slices land from a different base, re-run the Phase 0 checks.
