---
title: Ideal Detector System
type: analysis
status: active
last_updated: 2026-05-23
owner: codex
source_count: 0
tags: [findings, detectors, methodology, evidence, review]
---

# Ideal Detector System

## Purpose

This page defines the north star for the Bus Priority Impact Studio detector layer.

The current detector system is useful, but primitive: it is a threshold-based triage system that
emits candidates, evidence links, coverage rows, and review queues. That is a good spine. It is not
yet a mature analytical engine.

The ideal detector system should become a disciplined evidence machine:

> For every route, segment, corridor, time window, source, and intervention question, the system
> should know what it looked for, what it found, what it could not evaluate, what evidence supports
> the claim, what evidence weakens it, and what review decision is required before publication.

The perfect detector is not buildable, because transportation evidence never contains the full
counterfactual. But it is still useful as a reference point: it tells us what kinds of uncertainty
the practical system must expose instead of hiding.

## Current Reality

The implemented March 2026 detector pass has a real evidence spine:

- 12 source groups with evidence eligibility and promotion flags.
- 381 route-month signal features.
- 6 context sources represented in route-month features.
- 8 detector families.
- 675 detector candidates.
- 1,817 evidence links.
- 3,066 coverage rows.
- 200 surfaced review-queue candidates.
- 675 generated review packets.

The current detectors are intentionally cautious:

- `source_gap`
- `persistent_speed_hotspot`
- `multi_month_speed_peer`
- `observed_reliability`
- `intervention_gap`
- `intervention_underperformance`
- `permit_correlated_slowdown`
- `service_request_context`

They mostly ask simple questions:

- Is a route missing required evidence?
- Does a route have slow segment evidence?
- Does a route have a multi-month speed deficit versus the broad route-corpus peer median?
- Does a route have observed reliability trouble?
- Does a route have high pain and thin treatment evidence?
- Does a route still look bad after a treatment?
- Does a slow route also have many permit touches?
- Does a slow route also have substantial 311 service-request context?

This is useful, but not yet ideal. It is closer to a smoke alarm panel than an analyst. The next
system should preserve that auditability while becoming more precise, comparative, historical, and
review-aware.

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

The current schema has most of this spine. The ideal system should add explicit
`counter_evidence` and `official_context` roles instead of overloading context.

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

## Claim Strength Ladder

Every detector output should be assigned to a claim-strength level.

| Level | Label | Meaning | Public wording |
|---|---|---|---|
| 0 | Missing evidence | The detector could not evaluate the scope | "Insufficient evidence" |
| 1 | Context only | A source is nearby or relevant, but not a primary signal | "Nearby context" |
| 2 | Descriptive issue | The measured behavior is bad or unusual | "Observed slow segment" |
| 3 | Comparative issue | The behavior is bad relative to peers or history | "Worse than comparable routes" |
| 4 | Intervention association | A treatment/context coincides with a change or current condition | "Needs review after treatment" |
| 5 | Causal claim | A method supports effect language | Usually disallowed until methodology review |

Most current detectors live at levels 0-3. `permit_correlated_slowdown` should remain level 1 or 2
unless redesigned with stronger temporal and counterfactual evidence. Intervention evaluation may
reach level 4 descriptively when peer-adjusted rows are strong, but should not reach level 5 without
external methodology review.

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

The current coverage audit has the first five outcomes. The ideal system should add explicit
`deferred_not_in_scope` for detectors that are intentionally not applicable to a scope.

## Feature Store Shape

The ideal detector does not query raw tables directly. It reads a detector feature store built from
local pipeline jobs.

Core feature grains:

- route-month;
- route-direction-month;
- route-direction-daypart-month;
- route-segment-month;
- route-segment-daypart-month;
- corridor-month;
- route-intervention-window;
- route-source-event-window;
- source-month coverage.

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

The current `findings:signal-features` command is an early route-month version of this. It should
grow into a typed feature-store layer rather than one route-month JSON artifact.

## Detector Families

### 1. Source Sufficiency Detector

Question:

> Can the system evaluate this scope honestly?

Ideal behavior:

- Emits missing-data candidates when source gaps block meaningful claims.
- Emits clean coverage rows when evidence is sufficient.
- Tracks source freshness, date range, row counts, join rates, and source eligibility.
- Distinguishes missing data from true absence of a problem.

Current status:

- Implemented as `source_gap`.
- Good foundation.
- Needs more source-specific missingness and freshness logic.

### 2. Persistent Speed Detector

Question:

> Which segments are repeatedly slow and rider-exposed?

Ideal behavior:

- Evaluates every segment, direction, and daypart.
- Uses multi-month persistence, not one month only.
- Normalizes by route type, borough, route length, and peer segment class.
- Separates average slowness, frequency, and rider exposure.
- Detects both chronic slow corridors and acute regressions.

Current status:

- Implemented as `persistent_speed_hotspot`, but it is mostly a hotspot threshold pass.
- Needs multi-month history, daypart/direction handling, peer residuals, and near-miss audit.

### 3. Observed Reliability Detector

Question:

> Where do riders experience bunching, long gaps, and excess wait beyond the scheduled baseline?

Ideal behavior:

- Uses observed GTFS-RT headways by route, direction, stop, weekday/weekend, and hour.
- Joins scheduled baseline directly.
- Cross-checks official Bus Wait Assessment.
- Flags insufficient sample coverage separately.
- Identifies reliability pockets, not just route-level averages.
- Produces stop/daypart review packets with top long-gap windows.

Current status:

- Implemented at route-month level.
- Good candidate source.
- Needs finer grain, official/current provenance split, and schedule mismatch integration.

### 4. Schedule Mismatch Detector

Question:

> Where does observed travel time or headway diverge from scheduled expectations?

Ideal behavior:

- Compares observed segment/trip/headway behavior to schedule by daypart and direction.
- Distinguishes planned slow service from unplanned unreliability.
- Flags locations where schedules may be unrealistic.
- Avoids blaming street operations for schedule design issues without evidence.

Current status:

- Not implemented as a detector.
- Some schedule comparison logic exists in route brief metrics.

### 5. Intervention Gap Detector

Question:

> Where is rider pain high but bus-priority treatment evidence is absent, thin, future-only, or undated?

Ideal behavior:

- Uses pain from speed, reliability, ridership, persistence, and equity context.
- Uses treatment inventory from ACE, ABLE, bus lanes, TSP, redesign docs, and DOT project pages.
- Treats missing implementation dates as source gaps, not "no intervention."
- Explains whether the gap is real absence or source uncertainty.

Current status:

- Implemented as `intervention_gap`.
- Useful but coarse.
- Needs better treatment inventory, corridor geometry, and document corpus support.

### 6. Intervention Underperformance Detector

Question:

> Which treated routes or corridors still show high pain, weak improvement, or negative peer-adjusted deltas?

Ideal behavior:

- Compares pre/post windows with peer baselines.
- Checks treatment activation date, ramp-up period, enforcement period, and source confidence.
- Separates "treatment did not help" from "treatment happened but another problem remains."
- Keeps claims descriptive unless methodology gate allows stronger language.

Current status:

- Implemented but very narrow.
- March pass produced only one candidate.
- Needs stronger treatment metadata, more peer matching, and review gold set.

### 7. Context-Correlated Disruption Detector

Question:

> Is an issue plausibly temporary, source-specific, or context-heavy rather than chronic?

Ideal behavior:

- Uses permits, collisions, 311, weather, traffic, parking, service alerts, and events as context.
- Normalizes event density by route length, street density, borough, source coverage, and fanout.
- Matches time windows precisely where possible.
- Produces caveats and review questions before producing primary claims.
- Separates direct route evidence from route-LION-expanded context.

Current status:

- Only early `permit_correlated_slowdown` exists.
- All normalized context sources are attached to candidates as context evidence.
- Parking remains context-only.
- Needs source-specific QA and promotion rules.

### 8. Trend, Regression, And Change-Point Detector

Question:

> Which routes or segments are getting worse or better in ways that one release month hides?

Ideal behavior:

- Uses 2023-present speed and ridership history.
- Handles seasonality.
- Detects sustained degradation, abrupt changes, and recovery.
- Produces both negative findings and positive-deviance findings.
- Explains whether a trend is new, chronic, seasonal, or data-limited.

Current status:

- Not implemented as a detector.
- Route trend data exists, but detector use is immature.

### 9. Peer Residual Detector

Question:

> Which routes are worse than similar routes after controlling for route type, borough, ridership,
> corridor density, and baseline speed?

Ideal behavior:

- Defines peer groups transparently.
- Emits residuals with uncertainty.
- Does not overfit.
- Explains peer choice and shows comparable routes.

Current status:

- Peer logic exists for intervention evaluation.
- Not yet a general detector.

### 10. Positive Deviance Detector

Question:

> Which routes improved or perform better than expected, and what evidence might explain that?

Ideal behavior:

- Finds successful interventions, operational recoveries, and unusually resilient routes.
- Provides examples for briefs and policy learning.
- Avoids only surfacing bad news.

Current status:

- Not implemented.

## Source-Specific Detector Maturity

Every context source needs its own promotion path.

### 311

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

The current Studio review provenance is a first guardrail. The ideal system needs a full promotion
artifact and a demotion/supersession path.

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

The ideal system needs a recall-oriented test set.

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
- false-negative explanation rate;
- evidence-link completeness;
- counter-evidence completeness;
- calibration of confidence labels;
- review burden per approved finding;
- stale-source and failed-join rates.

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
- run public request-time analytics.

The ideal system uses LLMs after deterministic detection and before human promotion, not as the
canonical judge.

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

The current package split already matches this direction. The main missing layer is a real typed
feature store and promotion artifact.

## Concrete Next Build Steps

### Implementation slices completed on 2026-05-23

The first practical detector-maturity slice is now implemented in code:

- detector specs now have a generated template/spec artifact at
  `data/artifacts/findings/detector-specs.json`;
- `@bp/domain` has strict review-packet contracts, and `findings:detect` writes
  `data/artifacts/findings/{month}/review-packets.json`;
- evidence links now support an explicit `counter_evidence` role;
- `persistent_speed_hotspot` emits segment-scope counter-evidence so a segment hit does not silently
  become a route-wide claim;
- the first source-specific context detector, `service_request_context`, uses 311 route-month context
  as cautious review-candidate evidence and emits fanout/match-weight counter-evidence;
- `audit:findings-backtest` runs a tiny gold-set check against review packets, with optional
  `--gold-set` input for route-specific known cases.

The second slice adds the first broad counter-evidence pass and starts comparative history:

- `observed_reliability` now emits counter-evidence for GTFS-RT sample support, scheduled-baseline
  support, Bus Wait Assessment support, and route-month aggregation limits;
- `intervention_gap` now emits counter-evidence that absent/thin local inventory evidence is not
  proof of no treatment;
- `intervention_underperformance` now emits counter-evidence for evaluated-comparison counts,
  positive deltas, peer counts, and descriptive-not-causal limitations;
- `permit_correlated_slowdown` now emits permit fanout/match-weight/work-type caveats as explicit
  counter-evidence;
- `multi_month_speed_peer` is now a starter detector over route-month speed trends. It compares each
  route to the monthly route-corpus median and emits broad-peer counter-evidence before any stronger
  peer claim can be promoted.

This moves the detector layer from mostly level 2 toward level 3 for packet shape. It does not make
all detectors promotion-ready: source-gap candidates still need source-resolution counter-evidence,
and the new multi-month peer detector intentionally uses a broad corpus median until stronger
borough/route-type peer groups and calibrated backtests are added.

### Step 1: Write detector specs before adding detectors

For each detector, create a short spec with:

- question;
- scope universe;
- required features;
- primary evidence;
- context evidence;
- counter-evidence;
- missing-data states;
- thresholds;
- review packet;
- allowed claim strength;
- tests.

### Step 2: Add review packet schema

Current candidates and evidence links are good, but reviewers need a richer packet. Add a typed
artifact that groups candidate, evidence, counter-evidence, missing evidence, coverage, and review
checklist.

### Step 3: Add counter-evidence role

Before promoting more findings, add explicit counter-evidence support. This will prevent every
threshold hit from becoming a one-sided story.

Current status: implemented for persistent speed hotspots, observed reliability, intervention gap,
intervention underperformance, permit context, 311 service-request context, and the starter
multi-month peer-speed detector. Source-gap counter-evidence remains source-resolution oriented.

### Step 4: Add source-specific context detectors carefully

Start with 311 or permits before parking:

- define allowlists;
- normalize by route length and source volume;
- cap fanout;
- require temporal alignment;
- produce review candidates, not approved findings.

### Step 5: Add multi-month and peer detectors

These are more important than more context sources:

- trend/regression;
- multi-month persistence;
- peer residual;
- positive deviance.

These move the system from "bad this month" to "meaningfully unusual."

Current status: the first `multi_month_speed_peer` detector is implemented as a conservative route
trend starter. It is useful for review recall, but it should be replaced or complemented by matched
borough/route-type peers before promotion-grade peer claims.

### Step 6: Build a gold-set backtest

Without a gold set, the detector layer will keep feeling primitive because there is no learning
loop. The gold set can start small, but every detector should answer whether it found the known
cases and why it missed any.

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

Current system: mostly level 2, with some level 3 guardrails in Studio projection. The next target
is level 3 across all detector families, then level 4 through backtesting.

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

## North Star

The ideal detector system should make the analyst feel three things:

1. "The system looked broadly."
2. "The system is honest about what it does not know."
3. "The candidates are worth my attention."

That is the real bar. Not perfect automation. Not maximum candidate count. Not clever wording. The
detector layer succeeds when it turns messy public data into a ranked, auditable set of hypotheses
that a serious reviewer can trust enough to inspect.
