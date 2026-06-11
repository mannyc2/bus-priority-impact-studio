---
title: Curb Pulse Natural Experiment Plan
type: engineering
status: draft
last_updated: 2026-06-01
owner: codex
source_count: 0
tags: [applied-research, natural-experiments, curb-management, travel-time, permits, 311, causal-inference]
---

# Curb Pulse Natural Experiment Plan

## Purpose

This page turns the synthetic "film shoots clear the curb and buses speed up" example into a
practical product and applied-research direction.

The goal is not another route-month detector. The goal is a corpus-backed workbench that finds
small, surprising, falsifiable natural experiments at the segment/daypart grain:

> A repeated external event temporarily changes the street constraint, the bus segment responds in
> the opposite direction from the network average, and independent context evidence explains why.

The synthetic M101 example is fabricated, but it describes exactly the kind of finding the product
should aspire to surface:

- a short segment has recurring travel-time drops;
- the drops are too episodic for monthly detectors to catch;
- official interventions do not explain the pattern;
- an external event overlaps most pulses;
- the event has a network-average effect with the opposite sign;
- independent evidence supports the mechanism;
- the result becomes a falsifiable curb-management hypothesis.

This is a better fit for `packages/applied-research` than for `packages/analytics` alone.

## Product Thesis

Most current detector outputs say:

> This route or segment is slow, unreliable, or context-heavy.

The richer product direction should also say:

> Here is a street segment where the corpus accidentally tested a possible fix.

That is much more valuable for MTA-shaped analysis because it turns public data from a ranking
system into a hypothesis engine. The product can identify places where the city already ran an
unpaid, repeated experiment through film shoots, construction staging, curb clearances, emergency
closures, bus-lane enforcement windows, school-calendar shifts, loading changes, or other events.

The best outputs should feel like small case studies:

- what changed;
- when it changed;
- how large the segment response was;
- why the mechanism is plausible;
- what counter-evidence was checked;
- what permanent intervention would reproduce the useful part;
- how the hypothesis could be falsified after implementation.

## Why Applied Research Is The Right Base

The applied-research architecture separates three roles:

```text
packages/analytics
  pure instruments: pulse detection, effect summaries, placebo diagnostics

packages/applied-research
  corpus-backed study: feature eligibility, panels, context joins, artifacts, scorecards

tools/pipeline-v2
  CLI orchestration: open local stores, call study builders, write artifacts
```

This study needs that middle layer because it depends on corpus state:

- segment/daypart travel-time panels over many months;
- route and street-segment geometry joins;
- event windows for film permits or other curb-affecting events;
- 311, parking, weather, holiday, ridership, and adjacent-segment context;
- official intervention dates and local event-study results;
- review packets with evidence, counter-evidence, caveats, and provenance.

None of that belongs in a public app or in pure detector math. It belongs in a deterministic,
fixture-testable applied-research study builder.

## Working Name

Use `curb_pulse_natural_experiment` as the study family name.

This is intentionally not a detector id. Initial outputs should be local research artifacts and
review packets, not public Studio findings.

Possible future public labels after review:

- "Curb pulse case study"
- "Repeated curb-clearance experiment"
- "Natural experiment review"
- "Segment intervention hypothesis"

## Core Question

For each route segment and daypart:

> Did an external event repeatedly create a short-lived travel-time improvement, and does context
> evidence support a specific operational mechanism that could be reproduced?

The canonical curb version asks:

> Does clearing a curb temporarily make buses faster on a segment where chronic curb friction is the
> binding constraint?

## Synthetic Probe Lessons

The first synthetic probes are not evidence. They are specification probes. They show the workbench
should support more than the original film-clears-curb story.

| Probe family | External domain | Useful design lesson |
|---|---|---|
| Film-production curb occupancy | Film permits and production assets | Event windows can either clear private vehicles or create a permitted obstruction; the mechanism sign matters. |
| Industrial weather reversal | Heavy rain and outdoor loading rules | Weather can be the external treatment, not only a control; the system needs event variables beyond permits. |
| Court dismissal pulse | Court calendars and rideshare geofencing | Highly regular intra-day pulses need hour-level panels and non-permit document calendars. |
| Cruise-terminal staging | Berth manifests and FHV/luggage staging | Event-aligned onset/decay and stop-access/dwell fields can matter as much as segment speed. |
| Commercial loading dock reversal | Loading permits, tenant changes, and grades | Official interventions and external events may be separated by weeks; timing evidence must distinguish them. |

Recurring requirements across the probes:

- every developed case has a local effect, a reference/network effect, at least one placebo, and a
  demand-side null;
- each case needs an external-domain clock: permit window, berth time, court dismissal time,
  weather threshold, loading permit, or work-order timestamp;
- the mechanism is a binding-constraint claim, not just an event label;
- the product needs near-miss and false-positive artifacts, because many plausible pulses will fail
  on document match, placebo, or mechanism corroboration.

## Historical Event-Family Response Drift

The same workbench should also support a portfolio-level study family that is one level above local
case studies.

The finance analogy is "same financing action, different market regime, changed announcement
effect." The transit equivalent is:

```text
same street event or agency intervention family
+ different historical period or binding-constraint regime
= changed local response, marginal value, or sign
```

This is not the first MVP slice, because it needs the segment/daypart panel and event-window corpus
first. But the local case-study plan should preserve enough metadata to make this later analysis
possible.

Working names:

- `event_family_response_drift`
- `intervention_response_regime_shift`

Core questions:

- Did a class of events that used to help buses become neutral or harmful after curb pressure,
  delivery behavior, FHV staging, construction, ridership, or enforcement context changed?
- Did a class of events that usually slows buses create repeated local improvements on a subset of
  curb-constrained segments?
- Which binding-constraint regimes explain effect sign and magnitude: curb-constrained,
  lane-constrained, stop-access-constrained, loading-dock-constrained, terminal-staging-sensitive,
  institution-calendar-sensitive, or weather-sensitive?
- Where does the old playbook appear to have low marginal ROI because the dominant constraint moved
  from the moving lane to the curb, stop, or adjacent activity?

Product meaning:

- A local natural-experiment case study is the "single segment story": one event family, one segment
  or small corridor, one mechanism, one packet.
- An event-family response drift study is the "historical response panel": many segments and events,
  stratified by time window and street context, showing where effects changed.

Example patterns the product should be able to test later:

| Event/intervention family | Historical drift question | Useful output |
|---|---|---|
| Bus lanes | Did lane paint have high marginal value before curb obstruction became the binding constraint on some blocks? | Segments where future curb management likely beats more paint. |
| ACE/enforcement | Did route-wide gains come with localized displacement or new legal-loading bottlenecks? | Pockets where enforcement strategy needs curb/stop redesign. |
| Street/film permits | Do permits usually slow buses, while a subset improves because they clear private curb friction? | Sign-flip segments worth manual mechanism review. |
| Weather thresholds | Does rain slow the network while speeding blocks where outdoor loading shuts down? | Weather-sensitive operational hypotheses and false-positive controls. |
| Major venue calendars | Did event-day impacts change after street management, facility openings, rideshare rules, or loading changes? | Before/after response drift with nearby placebos. |

Recommended study artifacts:

```text
EventFamilyEffectPanel
  eventFamily
  eventSubtype
  outcome
  segmentKey
  contextRegime
  historicalWindow
  eventWindow
  referenceWindow
  localEffect
  referenceEffect
  placeboEffects
  effectSign
  confidenceInterval
  controls
  sourceCoverage
  provenance

EventFamilyResponseDriftStudy
  studyId
  eventFamily
  historicalWindows
  regimeDefinitions
  effectByWindow
  effectByContextRegime
  signFlipClusters
  lowMarginalValueClusters
  representativeCaseStudies
  multipleTestingSummary
  claimTier
```

Method sketch:

- build event-family panels from the same segment/daypart panel and external event-window joins;
- estimate effects by rolling or split historical windows, not only one pooled average;
- stratify by context-regime labels so the same event can have different expected signs;
- compare local effects to network, corridor, peer, and adjacent-placebo references;
- use shuffled-event/fake-date nulls to estimate how many sign flips would surface by chance;
- require at least one representative local case study before making product claims about a drift
  cluster.

Acceptance gates before treating a drift study as useful:

| Gate | Requirement |
|---|---|
| Event count | Enough events per family, window, and context regime to avoid one-off anecdotes. |
| Event clock stability | Source coverage and timestamp precision are comparable across historical windows. |
| Context labels | Binding-constraint regime labels are present or the study is explicitly exploratory. |
| Shift size | Sign or magnitude drift is statistically visible or operationally meaningful. |
| Placebos | Adjacent, fake-date, or peer placebos do not show the same drift. |
| Representative cases | At least one local case-study packet supports the proposed mechanism. |
| Multiple testing | Candidate library, empirical null, and discarded clusters are preserved. |
| Claim discipline | No public causal or policy language until methodology review. |

This layer is useful precisely because it can answer a different question than a detector:

> Not "where is performance bad?", but "where did the system stop responding to the old treatment,
> or where does an event class reverse because the binding constraint is different?"

## Case Study Acceptance Gates

Do not emit a top-tier natural-experiment case study unless all hard gates pass. Failed gates should
produce lower-tier artifacts such as `interesting_anomaly`, `near_miss`, or `rejected_false_positive`.

| Gate | Requirement |
|---|---|
| Specific grain | Route, direction, physical segment or stop, date/hour or daypart, and segment length are present. |
| Quantified signal | Absolute effect, percent effect, derived intuition, sample support, and confidence interval are present. |
| Multi-year-only shape | The anomaly is explained by a multi-month or multi-year panel pattern, not a single release month. |
| External-domain candidate | The proposed cause is outside normal transit operations and has an auditable event clock. |
| Sign flip or heterogeneous contrast | Local and reference effects differ in sign or materially differ in magnitude; both are quantified. |
| Official hypothesis tested | Overlapping bus-lane, ACE, signal, schedule, detour, or route-change explanations are tested and quantified. |
| Placebo or negative control | At least one adjacent, peer, fake-date, or off-window placebo is reported as an estimate with interval. |
| Demand-side null | Boardings, alightings, passenger load, or another demand proxy is reported as an estimate with interval. |
| Mechanism corroboration | Independent evidence moves in the expected direction, such as 311, parking, dwell, FHV dwell, or complaints. |
| Tier-2 corroboration | Documents or event manifests cover enough episodes to make the event clock credible. |
| Robustness | Day-of-week/month controls, weather controls, and rainy-day/holiday exclusions are declared. |
| Falsifiable test | A future intervention, expected magnitude, co-moving signal, and pass/fail rule are specified. |
| Claim discipline | Causal and recommendation language remains gated until methodology review. |

Suggested tiering:

| Tier | Meaning | Public status |
|---|---|---|
| `case_study_ready_for_methodology_review` | All hard gates pass and score is high. | Local review only. |
| `interesting_anomaly` | Strong pulse or sign flip, but mechanism/documentation is incomplete. | Local workbench only. |
| `near_miss` | Useful for tuning; one or two hard gates fail. | Evaluation artifact only. |
| `rejected_false_positive` | Data artifact, weak event clock, contaminated placebo, or multiple-testing risk dominates. | Evaluation artifact only. |

## Grain Policy

The study must not collapse early to route-month.

Minimum useful grain:

```text
route + direction + physical street segment + service date + daypart
```

Preferred grain:

```text
route + direction + physical street segment + service date + local hour
```

Context grains:

```text
event + physical street segment + active date window
311/parking/collision/context event + physical street segment + event date
boarding/load + route + stop/segment + service date + local hour/daypart
weather + local date/hour
official intervention + route/segment/corridor + implementation date
```

Clean no-hit claims are unsafe unless the segment/daypart panel and context-event joins are known to
be complete enough for the declared history window.

## Data Requirements

### Source Readiness Statuses

The synthetic probes assume a richer corpus than the repo may currently have. Each source family
should be marked before a real run:

| Status | Meaning |
|---|---|
| `available_now` | Local table/artifact exists at the required grain and window. |
| `partial` | Source exists but grain, coverage, timestamps, or join quality are incomplete. |
| `needs_source` | Public source likely exists but is not yet ingested. |
| `tier2_only` | Evidence can come from extracted documents but not a structured table yet. |
| `aspirational` | Useful for product vision, but do not design hard gates around it yet. |

### Required For R1 MVP

| Input | Needed fields | Current repo fit |
|---|---|---|
| Segment travel time panel | route, direction, segment/physical id, date, hour/daypart, median travel time, sample count, route version | Existing speed corpus has route-segment speed data, but the exact daily/hourly segment panel must be confirmed or built. |
| Route/street geometry bridge | route segment to physical street ids | Existing route-LION bridge and context-event route touches are the right base. |
| Context event windows | event id, source id, physical id, start/end date, event type | DOT street permits exist. Film/production permits may require a new source or Tier-2 extraction if not already captured. |
| 311 curb friction | complaint type, date, physical id, matched route/segment | Existing 311 ingestion/join work is relevant; complaint taxonomy must isolate double-parking, blocked lane, blocked driveway, blocked bus stop, etc. |
| Weather/calendar controls | date/hour precipitation, temperature, holidays | Weather and calendar controls exist or are planned in current context features. |
| Adjacent segment map | upstream/downstream segment candidates | Derive from route shape/timepoint order and route-LION bridge. |

### External Event Families

The first implementation should accept a generic event-window interface instead of hard-coding film
permits:

```text
ExternalEventWindow
  eventId
  eventFamily
  eventSubtype
  sourceId
  physicalId
  routeId?
  segmentId?
  activeStart
  activeEnd
  eventClockConfidence
  spatialMatchConfidence
  tier2Refs
```

Candidate event families:

| Family | Example event clock | Likely status |
|---|---|---|
| Film/production | shoot permit active window | needs_source or tier2_only |
| DOT street permits | issued work start/end dates | available_now or partial |
| Court/institutional calendar | dismissal, jury, shift, school bell, hospital loading | tier2_only or aspirational |
| Maritime/cruise terminal | berth manifests and terminal memos | needs_source or tier2_only |
| Weather threshold | hourly precipitation/temperature/wind threshold | available_now or partial |
| Loading/curb permit | loading window, work order, curb regulation | partial, needs_source, or tier2_only |
| Enforcement/geofence | ACE, parking enforcement, FHV pickup zone | partial or aspirational |

### Required For Stronger Claims

| Input | Why it matters |
|---|---|
| Boardings/passenger load by stop/segment/hour | Rules out demand-side changes as the source of faster travel time. |
| Parking/curb regulation inventory | Distinguishes blocks with no off-street loading, no-standing rules, bus-lane hours, loading windows, and curb availability. |
| Official intervention inventory | Separates bus-lane/ACE/signal/event effects from the recurring pulse. |
| Permit subtype/source quality | Film/production permits are different from street-opening/construction permits; source semantics matter. |
| Segment version history | Prevents route changes or segment boundary changes from creating false pulses. |

## Study Pipeline

### Stage 1: Build The Segment/Daypart Panel

Create an applied-research feature view:

```text
SegmentDaypartTravelTimePanel
  routeId
  direction
  segmentId
  physicalId
  serviceDate
  daypart
  medianTravelTimeMinutes
  medianSpeedMph
  observationCount
  busTripCount
  routeVersion
  quality
```

Normalize enough to compare across months:

- route version;
- scheduled service level where available;
- day of week;
- holiday;
- month/season;
- weather controls;
- sample support.

### Stage 2: Detect Recurring Negative Pulses

Search for short-lived travel-time improvements:

```text
PulseCandidate
  segmentKey
  daypart
  pulseStartDate
  pulseEndDate
  durationDays
  baselineTravelTimeMinutes
  pulseTravelTimeMinutes
  deltaMinutes
  deltaPercent
  zScoreOrRobustResidual
  supportDays
  sampleSupport
```

Pulse rules for the first implementation:

- improvement, not slowdown;
- 2-4 day contiguous duration by default;
- robust residual below a declared threshold;
- no weekly-cycle explanation;
- at least N recurring pulses across the history window;
- enough observations per pulse day and baseline day;
- exclude low-coverage days rather than scoring them as clean.

The first algorithm can be deterministic:

1. Build expected travel time from segment median plus month and day-of-week baselines.
2. Compute residuals.
3. Identify contiguous negative-residual blocks.
4. Keep recurring blocks that share segment/daypart and pass sample support.
5. Score recurrence, amplitude, and seasonality.

No transformer is needed for this stage.

### Stage 3: Attach Event Windows

For each pulse cluster, join context events active on the same physical segment and dates:

```text
PulseEventOverlap
  pulseId
  eventId
  sourceId
  eventKind
  activeDateOverlapShare
  physicalMatchConfidence
  streetNameMatch
  eventSubtype
  eventFanout
```

The study should search multiple event families, not only film:

- film/production permits, if source is available;
- DOT street construction/opening permits;
- curb/street closures;
- special events;
- parking-rule changes;
- enforcement/intensification windows;
- service alerts only as caveats, not as primary explanation.

### Stage 4: Reject Official Intervention Explanations

For segments with bus-lane, ACE, signal, or other official intervention dates:

- run or attach local event-study summary around the official intervention date;
- compare official intervention effect size to pulse effect size;
- mark whether pulses predate the official intervention;
- flag if official intervention and pulse windows overlap too much to separate.

The artifact should be explicit:

```text
OfficialInterventionExclusion
  interventionId
  implementationDate
  segmentEffectEstimate
  confidenceInterval
  pulsePredatesIntervention
  pulseMagnitudeVsInterventionMagnitude
  exclusionStatus
```

This is not a claim that the official intervention failed. It is a claim that the recurring pulse
requires a different explanation.

### Stage 5: Estimate Heterogeneous Event Effects

The central insight in the synthetic example is a sign reversal:

```text
network effect of event kind: slows buses
local segment effect: speeds buses
```

Implement this as a study, not a detector:

```text
EventEffectContrast
  eventKind
  treatedSegmentEffect
  networkReferenceEffect
  adjacentPlaceboEffect
  controlsUsed
  confidenceIntervals
  signFlip
  effectRatio
```

First deterministic model options:

- controlled interrupted time series for the segment;
- fixed-effects panel with segment and date/month/day-of-week controls;
- event-window matched comparison against nearby or peer segments;
- adjacent upstream/downstream placebo;
- bootstrap confidence intervals if standard errors are not yet stable.

The first version can be conservative: emit only effect summaries and validity gates, not causal
language.

### Estimand Grammar

Every statistical object should have the same inspectable shape:

```text
EffectEstimate
  estimandId
  label
  grain
  window
  outcome
  estimate
  unit
  percentEffect
  confidenceInterval
  sampleSize
  method
  controls
  plainEnglishInterpretation
```

Required estimands for a top-tier case:

| Estimand | Purpose |
|---|---|
| `local_event_effect` | What happened on the focal segment during event windows. |
| `reference_event_effect` | What happened on network, borough, corridor, or peer reference segments. |
| `sign_flip_contrast` | Whether local and reference effects differ in sign or meaningful magnitude. |
| `official_intervention_effect` | Whether a known agency action explains the same pattern. |
| `adjacent_or_peer_placebo` | Whether the effect appears where the mechanism should not apply. |
| `fake_date_or_off_window_placebo` | Whether the clock itself creates false positives. |
| `demand_side_null` | Whether ridership/load changes explain the effect. |
| `mechanism_comovement` | Whether 311, parking, dwell, FHV dwell, or another mechanism proxy moves correctly. |

Null results must be quantified as estimates with intervals. The workbench should not emit phrases
such as "no effect" unless the estimate and interval are present next to the statement.

### Stage 6: Mechanism Corroboration

The strongest product output needs independent mechanism evidence.

For the curb version:

- 311 double-parking/blocked-lane complaints are high in normal periods;
- 311 complaints fall during pulse/event windows;
- boardings/load are flat during pulse windows;
- adjacent segment without the same curb constraint does not improve;
- weather/holiday/rain exclusions do not change the result.

```text
MechanismEvidence
  baselineCurbFrictionRate
  pulseWindowCurbFrictionRate
  complaintDropPercent
  boardingDeltaPercent
  adjacentPlaceboDeltaPercent
  weatherRobustnessStatus
  holidayRobustnessStatus
```

### Stage 7: Produce A Review Packet

The workbench output should read like a compact case file:

```text
CurbPulseCaseStudy
  caseId
  segmentKey
  headline
  deckLine
  pulseSummary
  eventOverlapSummary
  effectContrastSummary
  mechanismSummary
  officialInterventionExclusion
  falsificationPlan
  evidenceObjects
  counterEvidence
  caveats
  scorecard
```

### Narrative Template

Case-study prose should be generated from a fixed arc:

1. Signal: segment, window, absolute effect, percent effect, and derived intuition.
2. Shape: pulse/sign flip/discontinuity/staggered onset/seasonal recurrence/spatial boundary.
3. Obvious hypothesis tested: official intervention, schedule, detour, route change, or data issue.
4. Mechanism: binding constraint and why the external event reverses the usual effect.
5. Effect contrast: local effect, reference effect, sign flip, confidence intervals.
6. Robustness: fixed effects, weather/calendar exclusions, placebo, demand null.
7. Documents: match rate, document types, and independent corroboration.
8. Falsifiable test: future action, predicted magnitude, co-moving signal, pass/fail criterion.
9. Deck line: decision-relevant one-liner.

The deck line should be generated from deterministic fields, for example:

```text
Film/production windows overlap 37 of 41 AM travel-time improvement pulses on this segment;
the segment speeds up during those windows while the network slows, and 311 curb-friction
complaints fall on the same dates.
```

Avoid unsupported language until human methodology review:

- allowed: "overlaps", "is associated with", "supports a curb-management hypothesis";
- blocked before review: "caused", "proves", "would reproduce", "beats the bus lane";
- allowed after methodology review only with gates: quantified intervention-effect language.

## Visual Contract

Every case-study artifact should name exactly one primary visual. The renderer can support more
internally, but the review packet should pick the clearest chart for the surprise.

| Visual | Best for |
|---|---|
| `coefficient_flip_chart` | Local effect versus reference/network effect with error bars. |
| `pulse_timeline_with_event_windows` | Recurring pulses and event-window overlap. |
| `discontinuity_plot` | Sharp before/after or event-date regression discontinuity. |
| `map_timeline_panel` | Spatial boundary effects and adjacent-placebo logic. |
| `event_study_inset` | Official intervention exclusion or external-event timing separation. |

Required visual fields:

```text
visualId
visualType
primaryOutcome
effectUnit
series
eventWindows
confidenceIntervals
annotations
plainEnglishCaption
```

## Artifact Families

Add these to applied-research artifact planning after the base package lands:

| Artifact | Purpose |
|---|---|
| `segment-daypart-panel` | Travel-time panel at the native study grain. |
| `pulse-candidate-set` | All detected pulses, including rejected and low-coverage cases. |
| `pulse-event-overlap` | Event windows joined to pulses with match confidence and fanout. |
| `event-effect-contrast` | Segment, network, and placebo effect summaries. |
| `mechanism-corroboration` | 311, boarding, weather, holiday, and adjacent-segment checks. |
| `candidate-anomaly-library` | Developed, near-miss, and rejected candidates with scores and reasons. |
| `natural-experiment-case-study` | Final local review packet for analyst judgment. |
| `event-family-effect-panel` | Portfolio panel of event effects by historical window and context regime. |
| `event-family-response-drift-study` | Higher-level study of sign/magnitude changes across time or regimes. |

`tools/pipeline-v2` should write these artifacts. `packages/applied-research` should build the typed
payloads.

## Candidate Library And Multiple Testing

The workbench will scan many routes, segments, windows, event families, and outcomes. A surprising
case can appear by chance. The study must therefore preserve the search process.

```text
CandidateAnomaly
  candidateId
  segmentKey
  eventFamily
  outcome
  anomalyShape
  score
  tier
  developed
  discardedReason
  multipleTestingGroup
  empiricalNullRank
  holdoutStatus
```

Required controls:

- keep all candidates above the first-pass threshold, not only the winner;
- record discarded reasons for near misses and false positives;
- use shuffled event windows or fake dates to estimate an empirical null;
- require holdout or out-of-window confirmation for high-scanning-volume families;
- expose multiple-testing risk as a score component and veto-cap input;
- prevent LLM or narrative generation from selecting a case before statistical gates run.

## Scoring

Use the applied-research two-layer score, but add a natural-experiment validity profile.

```text
overall_score =
  0.60 * natural_experiment_validity_score
  + 0.40 * research_quality_score
  - veto_penalties
```

### Natural Experiment Validity Score

| Component | Weight | Rewards |
|---|---:|---|
| Pulse strength | 120 | Large, repeated, short-lived travel-time improvements with robust sample support. |
| Recurrence structure | 90 | Multiple pulses across seasons/months without weekly-cycle explanation. |
| Event overlap | 120 | High share of pulses covered by a specific event family with high spatial/date confidence. |
| Event contrast | 130 | Local effect differs from network reference, especially sign reversals. |
| Official-intervention exclusion | 90 | Known interventions do not explain the pulse timing or magnitude. |
| Mechanism corroboration | 130 | 311/parking/boarding/context evidence supports the proposed mechanism. |
| Placebo behavior | 110 | Adjacent or peer placebo segments do not show the same improvement. |
| Robustness | 90 | Weather, holiday, day-of-week, month, and low-coverage exclusions do not erase the result. |
| Multiple-testing discipline | 60 | Candidate library, empirical null, and holdout or shuffled-window checks are present. |
| Visual clarity | 40 | The required visual makes the surprise legible without reading all evidence. |
| Falsifiability | 60 | Packet states a concrete post-intervention prediction and failure condition. |
| Claim discipline | 30 | Causal and policy language stays gated until methodology review. |

### Veto Caps

| Failure | Cap |
|---|---:|
| No segment/daypart panel support | 300 |
| Event source cannot prove active date windows | 400 |
| Pulse explained by route/segment version change | 300 |
| Official intervention overlaps all pulses and cannot be separated | 500 |
| No independent mechanism evidence | 650 |
| Winner-only artifact with no candidate library | 600 |
| Empirical null/fake-date check missing after broad search | 650 |
| Unsupported causal language in generated packet | 300 |

## MVP Build Plan

### R0: Planning And Fixtures

- Keep this plan in the wiki.
- Add one synthetic fixture matching the fabricated panel shape.
- Add one negative fixture where pulses exist but event overlap is random.
- Add one placebo fixture where event overlap exists but adjacent segments move the same way.
- Add one sign-flip fixture for each probe family now seen: film/curb, weather/loading, court
  calendar/rideshare, cruise-terminal staging, and commercial dock timing.

Deliverable:

- no corpus dependency yet;
- pure applied-research tests for pulse detection, overlap scoring, candidate-library preservation,
  multiple-testing caps, visual selection, and case-study score caps.

### R1: Pure Study Primitives

In `packages/applied-research` after the base scaffold lands:

```text
src/natural-experiments/
  pulse-detection.ts
  event-overlap.ts
  effect-contrast.ts
  mechanism-corroboration.ts
  candidate-library.ts
  visual-contract.ts
  case-study.ts
  score.ts
```

Initial functions:

- `detectTravelTimePulses(panel, options)`;
- `joinPulseEventWindows(pulses, events, options)`;
- `summarizeEventEffectContrast(panel, overlaps, controls)`;
- `buildCandidateAnomalyLibrary(candidates, options)`;
- `selectPrimaryVisual(caseStudy)`;
- `scoreNaturalExperimentCase(input)`;
- `buildNaturalExperimentCaseStudy(input)`.

### R2: Pipeline Preview Command

Add a local-only command:

```bash
bun --filter @bp/pipeline-v2 cli -- research curb-pulses --year 2026 --month 3
```

The command should:

- read local DB/artifacts;
- call `@bp/applied-research/natural-experiments`;
- write JSON/Markdown/HTML case-study previews;
- not publish to Studio, D1, or R2.

### R3: Real Corpus Segment Panel

Build or confirm a real segment/daypart/day panel over 2023-04 through the latest complete speed
month.

If only monthly segment aggregates exist, stop and build the daily/hourly panel first. The whole
method depends on short-lived pulses.

### R4: Context Event Coverage

Add source coverage audit for event families:

- DOT street permits;
- film/production permits if source exists or can be added;
- 311 curb-friction complaints;
- parking violations or curb obstruction proxies;
- weather/calendar controls.

If film permits are not currently in the corpus, the first real study can still run against DOT
street permits or other event families, but the product should not pretend they are film shoots.

### R5: First Manual Audit

Run the preview and manually audit the top 20 cases:

- 5 likely useful;
- 5 likely false positives;
- 5 low-coverage/ambiguous;
- 5 near misses.

Record why the result is or is not useful. Use that to tune scoring and veto caps.

### R6: Promotion Policy

Only after manual audit:

- define when a case can become a Studio review candidate;
- require methodology review before effect or recommendation language;
- add generated packet validation to block unsupported causal terms.

### R7: Event-Family Response Drift

After local case-study artifacts exist and event-family coverage is audited:

- build `EventFamilyEffectPanel` outputs from all candidate and non-candidate event windows;
- define initial context-regime labels such as curb-constrained, lane-constrained, stop-access,
  terminal-staging, loading-dock, and weather-sensitive;
- estimate event-family effects by historical window and context regime;
- surface sign-flip clusters, low-marginal-value clusters, and representative local case studies;
- keep outputs local until methodology review approves the drift-study claim language.

## What This Is Not

This is not:

- a transformer training task;
- a route-month detector;
- a generic permit-correlated-slowdown detector;
- a public recommendation engine;
- proof that a proposed curb intervention will work.

It is:

- a deterministic natural-experiment miner;
- a case-study generator for analyst review;
- a way to discover surprising mechanisms that coarse detectors flatten away;
- a source of falsifiable intervention hypotheses.

## First Copy-Ready Prompt

Use this after the applied-research base package lands:

```text
Workstream: Curb-pulse natural experiment workbench.

Goal: Implement the first pure applied-research slice for detecting repeated short-lived
travel-time improvement pulses and turning them into local review case studies. This should use
the applied-research package as the implementation layer and keep pipeline-v2 as an IO wrapper.

Read first:
- CLAUDE.md
- knowledge/index.md
- knowledge/wiki/engineering/applied_research_architecture.md
- knowledge/wiki/engineering/curb_pulse_natural_experiment_plan.md
- knowledge/wiki/engineering/testing_standards.md

Constraints:
- Keep pure study logic in packages/applied-research.
- Do not import tools, apps, knowledge, filesystem, or network from pure study modules.
- Use TypeScript and Bun only.
- Do not surface results in Studio or publish artifacts.
- Use synthetic fixtures first; do not depend on live corpus tables until the pure behavior works.

Suggested first slice:
1. Add packages/applied-research/src/natural-experiments/ with pulse detection, event overlap,
   candidate-library preservation, visual-contract selection, case-study scoring, and a small index
   export.
2. Add fixture tests for:
   - recurring 2-4 day travel-time improvement pulses;
   - recurring short intra-day pulses such as court-calendar or terminal berth windows;
   - weather-threshold event windows that flip from network slowdown to local speedup;
   - random event overlap that should not score highly;
   - event overlap with placebo segment movement that should be capped;
   - winner-only output without a candidate library that should be capped;
   - unsupported causal language or missing mechanism evidence caps;
   - visual selection for coefficient-flip versus pulse-timeline cases.
3. Add typed artifact shapes for pulse candidates, candidate anomaly libraries, effect estimates,
   visuals, and natural-experiment case studies.
4. Add a local-only pipeline-v2 preview command only if the package slice is green and the command
   can be a thin IO wrapper.

Verification:
- bun --filter @bp/applied-research test
- bun --filter @bp/applied-research typecheck
- relevant pipeline-v2 command test if a CLI wrapper is added
```

## Open Questions

1. Does the current corpus have daily/hourly segment travel-time panels, or only monthly/aggregate
   segment summaries?
2. Do we have a reliable film/production permit source, or should R1 use DOT street permits and
   reserve film permits for a later source-corpus addition?
3. Can 311 curb-friction complaint types be mapped tightly enough to physical segments, or should
   they start as mechanism context with conservative match confidence?
4. How should adjacent placebo segments be selected when route geometry changes across years?
5. What human methodology review standard is enough to allow effect-language drafts?
