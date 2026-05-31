---
title: Ideal Detector System
type: analysis
status: active
last_updated: 2026-05-31
owner: packages/analytics
source_count: 0
tags: [findings, detectors, methodology, evidence, review, registry, calibration]
---

# Ideal Detector System

## Purpose

This page defines the north star for the Bus Priority Impact Studio detector layer.

The current detector system has outgrown its first threshold-triage shape: it now has a registry,
typed feature contracts, baseline helpers, review packets, promoted findings, and calibration
primitives. That is a serious spine. It is still not a mature learning system until coverage,
calibration, reviewer feedback, retirement, and supersession run as a release-cycle discipline.

The ideal detector system should become a disciplined evidence machine:

> For every route, segment, corridor, time window, source, and intervention question, the system
> should know what it looked for, what it found, what it could not evaluate, what evidence supports
> the claim, what evidence weakens it, and what review decision is required before publication.

The perfect detector is not buildable, because transportation evidence never contains the full
counterfactual. But it is still useful as a reference point: it tells us what kinds of uncertainty
the practical system must expose instead of hiding.

## Current Reality

The detector layer has moved beyond the early March 2026 "8 detector" state this page originally
described. The 2026-05-30 analytics refactor established `packages/analytics` as the detector
kernel:

- 18 detectors are registered in `ANALYTICS_DETECTOR_REGISTRY`.
- Every registered detector has an `AnalyticsDetector<TInput>` contract: detector id, version,
  `FindingDetectorSpec`, feature grains, scope metadata, and a pure `run(input)` function.
- The registry carries analytics-only metadata: `claimTier`, `baselineFamilies`,
  `promotionGates`, `missingDataStates`, `evidenceSchemaVersion`, and `retirementStatus`.
- `data/artifacts/findings/detector-specs.json` is now a projection generated from registry specs,
  not the source of truth.
- `@bp/analytics/features` defines typed feature grains for route/month, segment/month,
  stop-direction-hour, segment-daypart, route-direction-daypart, route metric history,
  intervention panels, feed health, positive deviance, rider-weighted EWT, source coverage, and
  context sources.
- `@bp/analytics/baselines` and `@bp/analytics/calibration` contain pure helpers for headway/EWT,
  pace/runtime, robust trends, intervention gates, score vectors, overlap, gold sets, range
  precision/recall, reviewer summaries, retirement recommendations, and false-positive root-cause
  summaries.

The current registry covers these detector families:

- source and feed coverage: `source_gap`;
- route/segment speed: `persistent_speed_hotspot`, `speed_pace_hotspot`,
  `delay_concentration`;
- reliability and schedule: `observed_reliability`, `headway_reliability_ewt`,
  `bunching_hotspots`, `travel_time_variability`, `schedule_mismatch`,
  `rider_weighted_excess_wait`;
- history and peers: `multi_month_speed_peer`, `degradation_trend`, `positive_deviance`;
- intervention inventory and panels: `intervention_gap`, `intervention_underperformance`,
  `intervention_event_study`;
- context association: `permit_correlated_slowdown`, `service_request_context`.

The remaining weakness is no longer "we need a first detector spine." The weakness is integration
and governance:

- pipeline/review tools still need to persist larger gold sets, reviewer-decision corpora,
  false-positive registers, detector retirement logs, and supersession records;
- score-vector novelty still needs Spearman/rank-correlation and richer spread statistics;
- route/segment/stop-hour feature materialization is not uniformly fleet-complete;
- Studio should continue reading reviewed/promoted projections, not raw detector candidates;
- claim-tier and promotion-gate metadata must be enforced everywhere detector outputs become public.

## Audit Findings, 2026-05-31

This page's original doctrine was directionally right, but too static. The improvements needed are:

1. **Treat the registry as the governing object.** The ideal system is not just a set of detector
   ideas; it is a versioned registry whose entries can be run, compared, retired, superseded, and
   projected into review artifacts.
2. **Separate claim strength from detector score.** Allowed public language is bounded by
   `FindingDetectorSpec.allowedClaimStrength`, registry `claimTier`, and `promotionGates`, not by
   confidence alone.
3. **Make silence auditable at the same grain as detection.** "No issue" is meaningful only when
   the declared feature grain, scope universe, and missing-data states prove the detector looked.
4. **Promote lifecycle over novelty.** New detectors matter less than improving or retiring weak
   detector versions based on review outcomes and false-positive root causes.
5. **Keep LLMs outside the detector-of-record path.** LLMs may draft or prototype detector
   candidates, but the harness and pure analytics code compute values; review gates decide
   publication.

## Ideal vs Perfect

### Perfect Detector

A perfect detector would know the true state of the bus network.

It would know:

- every bus position, stop arrival, dwell, delay, missed trip, short turn, bunching event, and
  dispatch decision;
- every rider's origin, destination, wait, in-vehicle delay, transfer penalty, crowding exposure,
  and accessibility burden;
- every traffic condition, curb obstruction, collision, construction event, signal failure, special
  event, weather condition, and enforcement condition;
- every intervention's exact geometry, activation date, enforcement period, signal priority state,
  lane operating hours, curb rule, and compliance level;
- every source's measurement error, reporting lag, missingness process, and bias;
- the counterfactual: what would have happened on the same route, with the same demand and street
  conditions, if the intervention had not existed or if a new intervention were added.

It would output:

- the true problem;
- the true cause mix;
- the true rider impact;
- the true intervention effect;
- the best next measurement or intervention;
- an explanation calibrated to the reader's decision.

That system is impossible with public data. The important lesson is not to pretend we can build it.
The lesson is that every real detector must show which parts of that perfect knowledge are missing.

### Ideal Detector

An ideal detector is the best buildable version inside this project.

It does not claim omniscience. It does four things well:

1. It searches a complete declared universe.
2. It emits calibrated hypotheses, not unreviewed conclusions.
3. It attaches evidence, counter-evidence, uncertainty, and missing-data reasons.
4. It learns from review outcomes and backtests without losing deterministic reproducibility.

The ideal detector's public claim is narrow:

> Given the current evidence, this route or corridor deserves review for this specific reason, with
> this strength, this uncertainty, and these blockers.

## The Core Questions

Every detector should declare the question it answers.

Good detector questions are narrow:

- Which route segments are repeatedly slow relative to their peers and their own history?
- Which routes have observed headway gaps that exceed the scheduled baseline and official wait
  assessment?
- Which routes have high rider-impact pain but little dated treatment evidence?
- Which corridors improved after a treatment, and which did not?
- Which routes cannot be evaluated because the data, join, or source freshness is insufficient?
- Which source-specific context events are unusually concentrated near a route's pain window?
- Which routes look normal in aggregate but have severe daypart, direction, stop, or corridor
  pockets?
- Which routes have a new degradation compared with their own seasonal baseline?
- Which routes are positive deviants that improved while similar routes did not?

Bad detector questions are broad or causal before the evidence supports them:

- Why is this route bad?
- What should MTA do?
- Did permits cause the slowdown?
- Did a bus lane fail?
- Is this route solved?

The detector may raise those as review questions, but should not publish them as conclusions.

## Detector Output Is A Hypothesis Packet

The ideal candidate is not a card title. It is a structured hypothesis packet.

Minimum fields:

- detector id;
- detector version;
- run id;
- release month;
- scope kind;
- scope id;
- route id when applicable;
- direction, daypart, segment, stop, corridor, or physical street id when applicable;
- reason code;
- claim-safe label;
- severity;
- confidence;
- score;
- threshold context;
- evidence links;
- counter-evidence links;
- missing-evidence links;
- source eligibility state;
- review state;
- promotion blockers;
- supersession key;
- created artifact hash.

The most important design rule:

> A candidate with no counter-evidence and no missing-evidence section is not mature. It is just a
> hit.

## Evidence Roles

Evidence must be typed by role, not just attached as JSON.

| Role | Meaning | Example |
|---|---|---|
| `primary` | The signal that allows the detector to fire | Segment speed, observed headway gaps, peer-adjusted treatment row |
| `context` | Nearby or related facts that may explain, caveat, or prioritize | Permits, collisions, 311, parking, weather, traffic |
| `caveat` | Evidence that narrows or weakens the claim | Low sample count, high fanout, broad route-LION join |
| `missing_data` | Required evidence absent or stale | Missing speed, missing scheduled baseline, undated bus lane |
| `coverage_audit` | Proof the detector evaluated or skipped a scope | hit, clean no-hit, skipped missing input |
| `counter_evidence` | Evidence against the candidate | Improved trend, normal peer residual, temporary one-day disruption |
| `official_context` | Source document or agency record that anchors intervention meaning | DOT project page, MTA board note, ACE implementation reference |

The current schema has most of this spine, including explicit `counter_evidence`. The next
evidence-role cleanup is to keep official intervention/source documents distinct from generic
context where publication wording depends on an agency record.

## Confidence Is Multi-Dimensional

The current `confidence` label is a single value. The ideal system decomposes it.

Detector confidence should include:

- `source_sufficiency`: enough rows, months, samples, and source freshness;
- `join_confidence`: route, stop, corridor, LION, or location match quality;
- `temporal_alignment`: source events overlap the same month, daypart, or before/after window;
- `metric_stability`: signal persists across days, weeks, or months;
- `peer_context`: signal is abnormal relative to comparable routes;
- `counterfactual_strength`: whether the design supports descriptive, comparative, or causal
  language;
- `review_readiness`: whether a human can approve the claim from the packet without opening raw
  tables.

The published summary can still show one label, but the review packet should carry the components.

## Severity Is Not Confidence

Severity answers:

> How large is the rider or system impact if this hypothesis is real?

Confidence answers:

> How strong is the evidence that this hypothesis is real?

A mature detector must allow:

- high severity, low confidence: a potentially serious issue with weak evidence;
- low severity, high confidence: a small but real issue;
- high severity, high confidence: a strong review candidate;
- low severity, low confidence: usually suppress or keep in audit only.

The current score often mixes these. The ideal system separates them and then computes review
priority from both.

## Claim Strength And Claim Tier

Every detector output needs two related but distinct controls.

`FindingDetectorSpec.allowedClaimStrength` is the strongest claim ladder level the detector spec
permits:

| Level | Label | Meaning | Public wording |
|---|---|---|---|
| 0 | Missing evidence | The detector could not evaluate the scope | "Insufficient evidence" |
| 1 | Context only | A source is nearby or relevant, but not a primary signal | "Nearby context" |
| 2 | Descriptive issue | The measured behavior is bad or unusual | "Observed slow segment" |
| 3 | Comparative issue | The behavior is bad relative to peers or history | "Worse than comparable routes" |
| 4 | Intervention association | A treatment/context coincides with a change or current condition | "Needs review after treatment" |
| 5 | Causal claim | A method supports effect language | Usually disallowed until methodology review |

Registry `claimTier` is the detector-family posture:

| Tier | Meaning | Gate posture |
|---|---|---|
| `descriptive` | Measures observed behavior or a data-quality state. | Can publish descriptive wording when sample, coverage, freshness, baseline, evidence, and review gates pass. |
| `associational` | Relates a performance signal to context, peers, history, treatment, or exposure. | Requires cautious association language, explicit caveats, and reviewer approval before public use. |
| `candidate_causal_needs_review` | Computes method fields that might support effect language. | May only create methodology-review candidates; causal/effect wording requires human methodology approval. |

The public claim ceiling is the stricter of the spec strength and registry tier. A detector with a
high numerical score but `associational` tier still cannot say "caused." A detector with level-4
intervention evidence still cannot publish effect language unless its promotion gates and human
methodology review allow it.

## The Detector Universe

The ideal detector system declares the full search universe before running.

Dimensions:

- route;
- route direction;
- timepoint segment;
- stop or stop pair;
- corridor;
- physical street segment;
- borough;
- month;
- rolling multi-month window;
- weekday/weekend;
- daypart;
- hour;
- intervention window;
- source event window.

The universe matters because "no candidate" is meaningful only if the system can prove it looked.

For every detector and universe scope, the output must be one of:

- `hit`;
- `clean_no_hit`;
- `skipped_missing_input`;
- `skipped_failed_join`;
- `source_lag`;
- `deferred_not_in_scope`.

The current domain coverage rows support the core hit/clean/skipped/source-lag pattern, while the
registry now declares detector-specific `missingDataStates`. The ideal system should make
`deferred_not_in_scope` explicit for detectors that intentionally do not apply to a scope, instead
of blending those cases with missing input or clean no-hit.

## Feature Store Shape

The ideal detector does not query raw tables directly. It reads a detector feature store built from
local pipeline jobs.

Core feature grains now exist as analytics contracts and should be treated as the vocabulary for
detector work:

- route-month;
- route-segment-month;
- route reliability;
- intervention window;
- context source;
- source coverage;
- feed health;
- stop-direction-hour;
- segment-daypart;
- route-direction-daypart;
- route metric history;
- intervention panel;
- positive deviance;
- rider-weighted excess wait.

Feature families:

- speed level;
- speed distribution;
- slow-window share;
- rider exposure;
- observed headway reliability;
- scheduled headway baseline;
- Bus Wait Assessment;
- ridership trend;
- multi-month persistence;
- change point/regression;
- peer residual;
- treatment inventory;
- intervention effect;
- source freshness;
- source eligibility;
- join quality;
- context-event density;
- context-event fanout;
- document/intervention references;
- equity or vulnerability context.

The current split is healthy: analytics owns typed feature contracts, while pipeline jobs assemble
concrete feature rows from SQLite/R2/source snapshots. The next maturity step is not moving
pipeline IO into analytics; it is making materialization coverage visible for each feature grain and
release month so a detector cannot quietly run on one route slice and be described as fleet-ready.

## Detector Families

The ideal system should organize detectors by analytical question, not by file history. The current
registry already covers more families than the original version of this page listed.

### 1. Source And Feed Sufficiency

Question:

> Can the system evaluate this scope honestly?

Current registry:

- `source_gap`.

Ideal behavior:

- Acts as the coverage authority for other detectors.
- Emits missing-data candidates when source gaps block meaningful claims.
- Tracks source freshness, date ranges, row counts, join rates, feed health, and source eligibility.
- Distinguishes missing data from true absence of a problem.
- Exposes source-lag, low-coverage, validator-error, and join-failure states as detector outputs.

Next maturity step: connect feed/source readiness directly to detector admission and promotion
gates, so downstream detectors cannot silently treat missing source surfaces as clean no-hits.

### 2. Speed, Pace, And Delay Concentration

Question:

> Which route segments or route corridors are repeatedly slow, rider-exposed, or delay-concentrated?

Current registry:

- `persistent_speed_hotspot`;
- `speed_pace_hotspot`;
- `delay_concentration`.

Ideal behavior:

- Evaluates every segment, direction, daypart, and supported corridor grain.
- Separates level, pace relative to free-flow, systematic delay, stochastic variability, rider
  exposure, and route-level delay concentration.
- Uses multi-month persistence and near-miss audit rows, not release-month thresholds alone.
- Treats short segments, uncertain geometry, and low traversal counts as caveats or missing-data
  states.

Next maturity step: make the legacy route-month and segment-month speed detectors consume the newer
feature/baseline outputs where practical, while preserving historical comparability.

### 3. Headway Reliability, Bunching, And Excess Wait

Question:

> Where do riders experience bunching, long gaps, and excess wait beyond the scheduled baseline?

Current registry:

- `observed_reliability`;
- `headway_reliability_ewt`;
- `bunching_hotspots`;
- `rider_weighted_excess_wait`.

Ideal behavior:

- Uses observed GTFS-RT headways by route, direction, stop, day type, and hour.
- Joins scheduled baselines directly.
- Cross-checks official Bus Wait Assessment and customer-journey ABST/EWT-like aggregates where
  appropriate.
- Flags insufficient sample coverage separately.
- Identifies stop/hour pockets and route-level rollups without confusing the two.
- Keeps rider-weighted EWT associational/experimental unless ridership/APC proxy quality is strong.

Next maturity step: materialize stop-direction-hour features across the fleet and decide how
`observed_reliability` should summarize or coexist with finer-grain EWT and bunching detectors.

### 4. Runtime Variability And Schedule Mismatch

Question:

> Where does observed travel time or headway diverge from scheduled expectations?

Current registry:

- `travel_time_variability`;
- `schedule_mismatch`.

Ideal behavior:

- Compares observed runtime and headway behavior to schedule by route, direction, and daypart.
- Distinguishes planned slow service from unplanned unreliability.
- Flags locations where schedule review may be warranted without blaming street operations by
  default.
- Carries service-pattern and route-version break caveats.

Next maturity step: strengthen schedule corpus completeness and route-version rules before
promoting recurring mismatch claims.

### 5. Trends, Peer Residuals, And Positive Deviance

Question:

> Which routes are changing, underperforming peers, or performing unusually well in ways one release
> month hides?

Current registry:

- `multi_month_speed_peer`;
- `degradation_trend`;
- `positive_deviance`.

Ideal behavior:

- Uses named historical windows, route-version breaks, seasonal guards, and robust trend helpers.
- Defines peer groups transparently.
- Emits residuals with uncertainty and reciprocal-metric warnings.
- Produces both worsening and positive-deviance learning candidates.
- Explains whether a pattern is new, chronic, seasonal, peer-relative, or data-limited.

Next maturity step: grow gold sets and reviewer outcomes enough to tune thresholds without
thrashing, especially for trend and peer-residual claims.

### 6. Intervention Inventory, Underperformance, And Event Panels

Question:

> Where is rider pain high relative to treatment evidence, and where do treated scopes deserve
> review after an intervention?

Current registry:

- `intervention_gap`;
- `intervention_underperformance`;
- `intervention_event_study`.

Ideal behavior:

- Uses treatment inventory from ACE, ABLE, bus lanes, TSP, redesign docs, DOT project pages, and
  Tier 2 document records.
- Treats missing implementation dates as source gaps, not "no intervention."
- Compares pre/post windows with eligible controls where possible.
- Requires pre-trend, placebo, autocorrelation, control-eligibility, method-divergence, and human
  methodology gates before candidate-causal language.
- Separates "treatment did not help" from "treatment happened but another problem remains."

Next maturity step: persist intervention gate summaries, reviewer methodology outcomes, and
supersession records for treated corridors.

### 7. Context Association

Question:

> Is an issue plausibly temporary, source-specific, reporting-biased, or context-heavy rather than
> chronic?

Current registry:

- `permit_correlated_slowdown`;
- `service_request_context`.

Ideal behavior:

- Uses permits, 311, collisions, weather, traffic, parking, service alerts, and events as context
  signals.
- Normalizes event density by route length, street density, borough, source coverage, and fanout.
- Matches time windows precisely where possible.
- Produces caveats and review questions before producing primary claims.
- Separates direct route evidence from route-LION-expanded context.

Next maturity step: keep all context detectors association-only until each source has an allowlist,
fanout policy, temporal-alignment policy, and sampled false-positive review.

## Source-Specific Detector Maturity

Every context source needs its own promotion path.

### 311

Current status: `service_request_context` uses 311 as cautious associational context. The
requirements below are for stronger promotion-grade or source-specific claims, not for merely
attaching 311 as caveated context.

Possible mature questions:

- Are blocked-street, traffic-signal, street-defect, or bus-stop-adjacent complaints unusually
  concentrated near route pain windows?
- Do complaint spikes precede or coincide with reliability degradation?
- Are complaints direct enough to support a caveat, or only a review question?

Required before detector-grade use:

- complaint-type allowlist;
- physical-id or high-confidence location join;
- source freshness by era;
- route fanout cap;
- complaint volume normalization by borough and route length;
- sampled false-positive review.

### Parking

Possible mature questions:

- Are bus-lane, bus-stop, double-parking, or no-standing violations unusually concentrated near
  route pain windows?
- Are violations direct enough to indicate curb friction rather than general enforcement density?

Required before detector-grade use:

- strict violation-code allowlist;
- location candidate tiering;
- candidate fanout and match-weight thresholds;
- route length and enforcement-density normalization;
- distinction between "enforcement happened" and "obstruction happened";
- manual promotion review.

Parking should remain context-only until this is done.

### Permits

Current status: `permit_correlated_slowdown` uses DOT permit touches as cautious associational
context. It should remain context-only unless timing, work type, fanout, and counter-evidence are
strong enough for a narrower review claim.

Possible mature questions:

- Are active street work permits concentrated on route-linked physical street segments during a
  slowdown or reliability degradation?
- Is the timing consistent with a temporary caveat rather than chronic route weakness?

Required before detector-grade use:

- active-work window validation;
- street-opening vs construction permit distinction;
- permit type/severity weighting;
- route-LION fanout cap;
- month/daypart temporal alignment;
- counter-evidence when speed was already bad before permit activity.

### Collisions

Possible mature questions:

- Are collision clusters explaining temporary speed or reliability degradation?
- Do recurring collision corridors overlap with bus priority needs?

Required before detector-grade use:

- crash severity and type filters;
- time-window alignment;
- direct street/route join confidence;
- recurring vs one-off distinction;
- normalization by corridor exposure.

### Weather And Traffic

Possible mature questions:

- Did weather or networkwide traffic make the release month abnormal?
- Is a route's problem local after accounting for citywide conditions?

Required before detector-grade use:

- weather station and borough mapping;
- date/hour alignment;
- route-specific vs systemwide traffic residuals;
- source lag and live/current distinction.

## Evidence Packet Anatomy

An ideal review packet should have these sections:

1. Summary
   - one narrow claim;
   - scope;
   - month/window;
   - claim-strength level;
   - review state.

2. Primary evidence
   - metric values;
   - thresholds;
   - percentiles;
   - trend context;
   - sample support.

3. Context evidence
   - relevant source-event summaries;
   - match weights;
   - fanout;
   - source eligibility;
   - source freshness.

4. Counter-evidence
   - improving trend;
   - normal peer residual;
   - low sample support;
   - temporary disruption;
   - conflicting source.

5. Missing evidence
   - source gaps;
   - failed joins;
   - stale sources;
   - unavailable public data.

6. Coverage audit
   - considered universe;
   - hit/clean/skipped state;
   - near-miss thresholds.

7. Reviewer checklist
   - what must be inspected before promotion;
   - what language is allowed;
   - what language is forbidden;
   - what would demote or suppress the candidate.

## Promotion Rules

Detector candidates should not become public claims by default.

Promotion requires:

- detector registry entry is active or explicitly experimental for the target surface;
- claim language is within both `allowedClaimStrength` and `claimTier`;
- registry `promotionGates` pass for the requested claim tier;
- primary evidence source is eligible for the claim level;
- scope is precise enough for the wording;
- source freshness is acceptable;
- join confidence is high enough;
- counter-evidence is not disqualifying;
- missing evidence is either resolved or disclosed;
- candidate is not superseded by a stronger or narrower candidate;
- reviewer state is approved;
- methodology gate allows the claim strength.

Promotion should produce:

- an immutable promoted finding id;
- source candidate ids;
- reviewer id or process id;
- approved claim text;
- approved caveats;
- validation artifact hash;
- date/time;
- supersession key.

The current Studio review provenance, `promotion-queue.json`, reviewer decisions, and immutable
`promoted-findings.json` are real guardrails. The ideal system still needs explicit
demotion/supersession records, detector-version lifecycle records, and release-cycle retirement
policy.

## Scoring Model

The ideal detector should not use one magic number.

Separate scores:

- `severity_score`: rider or operational impact if true;
- `evidence_score`: source sufficiency, sample support, and measurement quality;
- `specificity_score`: scope precision and join precision;
- `persistence_score`: whether the issue is chronic, recurring, or one-off;
- `novelty_score`: whether the issue is new or already known;
- `actionability_score`: whether a review could identify a plausible next evidence/action path;
- `review_priority_score`: sorting score for the review queue.

The public UI can show a simple confidence/severity pair, but the review queue should expose the
decomposition.

## Calibration And Backtesting

The ideal system needs a recall-oriented test set and a detector-version lifecycle loop.

Gold-set rows should include:

- known ACE/ABLE routes and implementation dates;
- DOT bus-priority corridors;
- manually reviewed B25/BX41-style findings;
- MTA or DOT documents naming route/corridor issues;
- known source gaps;
- known false-positive examples;
- known temporary disruption examples.

Backtest questions:

- Did at least one detector surface the known issue?
- Did the best detector use the right evidence?
- Did source gaps explain missed cases?
- Did context detectors overclaim temporary correlation?
- Did review outcomes match detector confidence?
- Were high-priority false positives caused by thresholds, joins, or wording?

Metrics:

- recall by gold-set issue;
- precision after human review;
- range precision/recall for window and intervention detectors;
- false-negative explanation rate;
- evidence-link completeness;
- counter-evidence completeness;
- calibration of confidence labels;
- review burden per approved finding;
- stale-source and failed-join rates.

Current pure helpers already cover score-vector summaries, flagged-set overlap, gold-set
evaluation, range precision/recall, reviewer summaries, review-cycle confirmed rates, false-positive
root-cause summaries, intervention gate summaries, and retirement recommendations. The largest gaps
are persistence and policy: pipeline/review tooling must store gold sets, review outcomes,
false-positive registers, detector retirement logs, and supersession records by detector id and
version. Score-vector novelty also still needs Spearman/rank correlation and richer spread
statistics.

## Handling Silence

The ideal detector treats silence as a product state.

A route with no finding should still have one of these states:

- no issue detected with sufficient evidence;
- evaluated but near miss;
- evaluated only at route-month grain;
- skipped because source missing;
- skipped because join failed;
- source lag expected;
- detector not applicable;
- detector not yet built.

This is the key to avoiding false reassurance.

## Role Of LLMs

LLMs should not be detectors of record.

Allowed LLM roles:

- propose detector candidates or implementation patches;
- draft claim wording from deterministic candidates;
- summarize evidence packets;
- extract document-claim candidates;
- propose entity links;
- propose reviewer questions;
- cluster similar candidates;
- help build gold-set review seeds.

Forbidden LLM roles:

- compute metric values;
- invent missing rows;
- decide source freshness;
- make causal claims;
- promote findings without deterministic validation;
- become the accepted detector registry;
- read `.ralph` memory or call a model from `packages/analytics`;
- run public request-time analytics.

The ideal system can also use LLMs before deterministic detection to draft a frozen candidate
procedure. That candidate is still only a proposal: the harness computes, pure analytics code
becomes the registry entry only after review, and publication remains gated by reviewer decisions.

## Ideal Architecture

The buildable system should keep these layers separate:

1. Source ingestion
   - raw rows;
   - source metadata;
   - freshness;
   - schema validation.

2. Join and normalization
   - route ids;
   - stop ids;
   - physical street ids;
   - corridors;
   - match weights;
   - fanout.

3. Feature store
   - typed feature rows by declared grain;
   - provenance;
   - source eligibility;
   - coverage.

4. Pure detectors
   - no DB or filesystem;
   - typed inputs;
   - typed outputs;
   - deterministic thresholds/models.

5. Detector orchestration
   - loads features;
   - runs matrix;
   - writes candidates/evidence/audits;
   - builds review queue.

6. Review and promotion
   - reviewer packets;
   - promotion artifacts;
   - rejection/demotion reasons;
   - feedback into thresholds and source QA.

7. Studio projection
   - compact public route/brief/finding surfaces;
   - no heavy analytics;
   - no unapproved detector claims.

The current package split and promoted-finding path already match this direction. The main missing
layer is release-cycle governance: materialization coverage by feature grain, calibration
persistence, detector-version lifecycle records, demotion/supersession, and hard enforcement of
claim-tier gates in every public projection.

## Current Implementation Ledger

The early detector-maturity slices are complete:

- detector specs and generated spec artifacts exist;
- review packets, promotion queues, reviewer decisions, and immutable promoted findings exist;
- evidence links support `counter_evidence`;
- Studio projections prefer approved promoted findings before detector review candidates;
- context evidence can carry fanout, match weight, source freshness, and caveats;
- `@bp/analytics` has registry, feature, baseline, detector, and calibration layers;
- the literature-driven reliability, speed, trend, intervention, context, and positive-deviance
  detector families are registered as pure analytics detectors.

The detector layer is therefore mostly level 3 for packet shape, with level 4 hooks in analytics.
It is not yet level 4 operationally until calibration artifacts, gold sets, reviewer decisions, and
false-positive registers are persisted and used release over release.

## Concrete Next Build Steps

### Step 1: Enforce Registry-First Runs

- Make pipeline detector selection registry-driven wherever it is not already.
- Persist detector version, claim tier, promotion gates, missing-data states, feature grains, and
  evidence schema version with every run artifact.
- Verify generated detector-spec artifacts are projections from the registry.

### Step 2: Complete Feature Materialization Coverage

- Use route-level materialization audits to distinguish source availability from derived artifact
  availability.
- Backfill fleet-scale stop-direction-hour EWT, segment-daypart, route-direction-daypart, and
  route-metric-history surfaces before describing those detectors as network-complete.
- Keep incomplete feature grains visible as missing-data states, not clean no-hits.

### Step 3: Build Calibration Persistence

- Persist larger gold sets by detector family and release month.
- Persist reviewer outcomes by detector id/version.
- Persist false-positive root causes.
- Add detector retirement and supersession logs.
- Add Spearman/rank-correlation and richer score-vector spread helpers for detector novelty and
  non-degeneracy.

### Step 4: Harden Promotion And Demotion

- Add demotion/supersession records for promoted findings.
- Enforce claim-tier and promotion-gate checks wherever candidates become public projections.
- Keep event-study and intervention-effect language behind methodology review.
- Surface weak detector versions to engineering review rather than public UI.

### Step 5: Add Agent-Assisted Detector Candidates Carefully

- Follow ADR 0012: agents may propose detector candidates, specs, or patches, but the registry
  remains the source of truth.
- Keep candidate ledgers, `.ralph` memory, sandbox code, and admission packets outside analytics.
- Require deterministic admission packets before any agent-authored detector patch is accepted.

### Step 6: Evaluate Detector Mode Against Findings Mode

- Compare equal-budget Ralph findings runs and detector-candidate runs.
- Score them by promoted findings per dollar after review, distinct detector families improved,
  false-positive reduction, coverage gains, and claim-tier downgrades that prevented overclaiming.

## Maturity Levels

| Level | Name | Description |
|---|---|---|
| 0 | No detector | The source or issue shape is not evaluated |
| 1 | Threshold hit | A simple rule emits a candidate |
| 2 | Evidence-linked hit | Candidate has primary evidence and coverage audit |
| 3 | Review-ready hit | Candidate has context, missing evidence, counter-evidence, and checklist |
| 4 | Calibrated detector | Confidence and thresholds are tested against a gold set |
| 5 | Promotion-ready detector | Approved candidates can become public claims under explicit rules |
| 6 | Learning detector | Review outcomes feed threshold, feature, and source-quality improvements |

Current system: mostly level 3 for packet shape and promotion triage. Analytics has many level 4
primitives, but the operational system is not fully calibrated until the gold-set,
reviewer-decision, false-positive, retirement, and supersession corpora are larger and used in
release decisions. The next target is a release-cycle feedback loop that can say which detector
versions to keep, watch, revise, or retire.

## Non-Negotiables

- Every detector has a declared scope universe.
- Every scope gets a coverage outcome.
- Every candidate has primary evidence or an explicit missing-data reason.
- Every context source carries join confidence and fanout.
- Every source has detector eligibility.
- Every public finding has review provenance.
- Every causal-sounding claim is blocked unless the methodology gate allows it.
- Every "no issue" state is backed by coverage, not absence of output.
- Every promoted finding is traceable back to detector inputs and review decision.
- Every detector version has registry metadata, feature-grain declarations, and lifecycle state.
- Every detector improvement claim is backed by a fixture, gold set, reviewer outcome, or admission
  packet.

## North Star

The ideal detector system should make the analyst feel three things:

1. "The system looked broadly."
2. "The system is honest about what it does not know."
3. "The candidates are worth my attention."

That is the real bar. Not perfect automation. Not maximum candidate count. Not clever wording. The
detector layer succeeds when it turns messy public data into a ranked, auditable set of hypotheses
that a serious reviewer can trust enough to inspect.
