import {
  type FindingDetectorSpec,
  FindingDetectorSpecSchema,
  type FindingDetectorSpecsArtifact,
  FindingDetectorSpecsArtifactSchema,
  type FindingDetectorSpecTemplate,
  FindingDetectorSpecTemplateSchema,
} from "@bp/domain";

import { BUNCHING_HOTSPOTS_DETECTOR_ID } from "../findings/bunching-hotspots.js";
import { DEGRADATION_TREND_DETECTOR_ID } from "../findings/degradation-trend.js";
import { DELAY_CONCENTRATION_DETECTOR_ID } from "../findings/delay-concentration.js";
import { HEADWAY_RELIABILITY_EWT_DETECTOR_ID } from "../findings/headway-reliability-ewt.js";
import { INTERVENTION_EVENT_STUDY_DETECTOR_ID } from "../findings/intervention-event-study.js";
import { INTERVENTION_GAP_DETECTOR_ID } from "../findings/intervention-gap.js";
import { INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID } from "../findings/intervention-underperformance.js";
import { MULTI_MONTH_SPEED_PEER_DETECTOR_ID } from "../findings/multi-month-speed-peer.js";
import { OBSERVED_RELIABILITY_DETECTOR_ID } from "../findings/observed-reliability.js";
import { PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID } from "../findings/permit-correlated-slowdown.js";
import { PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID } from "../findings/persistent-speed-hotspot.js";
import { POSITIVE_DEVIANCE_DETECTOR_ID } from "../findings/positive-deviance.js";
import { RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID } from "../findings/rider-weighted-excess-wait.js";
import { SCHEDULE_MISMATCH_DETECTOR_ID } from "../findings/schedule-mismatch.js";
import { SERVICE_REQUEST_CONTEXT_DETECTOR_ID } from "../findings/service-request-context.js";
import { SOURCE_GAP_DETECTOR_ID } from "../findings/source-gap.js";
import { SPEED_PACE_HOTSPOT_DETECTOR_ID } from "../findings/speed-pace-hotspot.js";
import { TRAVEL_TIME_VARIABILITY_DETECTOR_ID } from "../findings/travel-time-variability.js";

export const DETECTOR_SPEC_TEMPLATE: FindingDetectorSpecTemplate =
  FindingDetectorSpecTemplateSchema.parse({
    requiredFields: [
      "detectorId",
      "question",
      "claimTemplate",
      "allowedClaimStrength",
      "primaryEvidenceRequired",
      "supportingEvidenceExpected",
      "counterEvidenceRequired",
      "promotionChecklist",
      "knownFailureModes",
    ],
    template: {
      detectorId: "Stable snake_case detector id.",
      question: "Specific question the detector is allowed to answer.",
      claimTemplate: "Strongest safe claim text pattern before reviewer promotion.",
      allowedClaimStrength: "0-5 ceiling where 0 is data-quality only and 5 is publication-grade.",
      primaryEvidenceRequired: "Evidence that must directly support the detector question.",
      supportingEvidenceExpected: "Corroborating context expected in a complete packet.",
      counterEvidenceRequired: "Evidence or caveats that would weaken, scope, or block the claim.",
      promotionChecklist: "Reviewer checks that must pass before promotion.",
      knownFailureModes: "Common ways this detector can overclaim or mislead.",
    },
  });

const specs = [
  {
    detectorId: SOURCE_GAP_DETECTOR_ID,
    name: "Source gap",
    question: "Which route/source scopes are missing required data or join coverage?",
    claimTemplate:
      "A source needed for stronger service claims is missing, stale, or failed to join.",
    allowedClaimStrength: 1,
    primaryEvidenceRequired: [
      "Missing-data or coverage-audit evidence with expected vs observed inputs.",
    ],
    supportingEvidenceExpected: [
      "Source freshness policy, join counts, and affected route/source scope.",
    ],
    counterEvidenceRequired: [
      "A newer source capture, alternate source, or route-specific evidence that resolves the gap.",
    ],
    promotionChecklist: [
      "Keep as data quality unless independent service evidence exists.",
      "Verify the source was expected for this month and route/source scope.",
      "Check whether a rerun or newer source capture clears the gap.",
    ],
    knownFailureModes: [
      "Treating missing data as proof of no problem.",
      "Treating a source lag warning as a service-performance claim.",
    ],
  },
  {
    detectorId: PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
    name: "Persistent speed hotspot",
    question: "Which route segments have persistently slow speed evidence?",
    claimTemplate: "A specific segment on the route has a persistent low-speed hotspot.",
    allowedClaimStrength: 3,
    primaryEvidenceRequired: [
      "Segment speed, slow-window share, observation count, bus-trip count, and hotspot score.",
    ],
    supportingEvidenceExpected: ["Ridership exposure and any route-month context evidence."],
    counterEvidenceRequired: [
      "Scope evidence showing how much of the route is represented by the segment hit.",
    ],
    promotionChecklist: [
      "Keep the claim segment-scoped unless route-wide evidence also supports it.",
      "Inspect raw speed, trip, and observation support before relying on hotspot score.",
      "Check geometry and stop names for implausible segment placement.",
    ],
    knownFailureModes: [
      "Promoting one segment hit into a whole-route diagnosis.",
      "Relying on derived hotspot score without raw speed support.",
    ],
  },
  {
    detectorId: SPEED_PACE_HOTSPOT_DETECTOR_ID,
    name: "Speed pace hotspot",
    question: "Which segment-daypart cells are persistently slow relative to free-flow pace?",
    claimTemplate: "A segment-daypart runs at a high multiple of its free-flow pace.",
    allowedClaimStrength: 3,
    primaryEvidenceRequired: [
      "Median pace, free-flow pace, slowness index, traversal count, systematic/stochastic delay split, spatial confidence, and coverage row.",
    ],
    supportingEvidenceExpected: [
      "Segment length, median speed, daypart, route direction, and adjacent segment evidence before corridor-wide language.",
    ],
    counterEvidenceRequired: [
      "Spatial-join uncertainty, short segment caveats, dwell-vs-running-time ambiguity, and low traversal support.",
    ],
    promotionChecklist: [
      "Confirm segment length and spatial confidence before promotion.",
      "Keep the claim segment/daypart-scoped unless route or corridor evidence also supports it.",
      "Treat systematic/stochastic split as descriptive screening, not cause attribution.",
    ],
    knownFailureModes: [
      "Mistaking dwell time or map-matching error for street-running delay.",
      "Generalizing one daypart hotspot to all-day route performance.",
      "Treating a free-flow pace baseline as a causal counterfactual.",
    ],
  },
  {
    detectorId: MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
    name: "Multi-month speed peer",
    question: "Which routes show multi-month low-speed trends below a matched peer median?",
    claimTemplate: "The route has a multi-month low-speed pattern below its matched peer median.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "Supported route-month speed trend rows, peer median speed, peer route count, and average deficit.",
    ],
    supportingEvidenceExpected: [
      "Current route speed/hotspot evidence and reviewer validation of route-family/type/geography peers before promotion.",
    ],
    counterEvidenceRequired: [
      "Missing/weak months, fallback-peer limitations, seasonal effects, and route/service-pattern changes.",
    ],
    promotionChecklist: [
      "Check that the current release month is included in the multi-month evidence.",
      "Review whether the matched peer group is an acceptable comparison group.",
      "Prefer cautious persistence language until matched peers are reviewed.",
    ],
    knownFailureModes: [
      "Treating a matched peer median as a causal peer/control group.",
      "Ignoring seasonal changes or service-pattern changes across the lookback window.",
    ],
  },
  {
    detectorId: OBSERVED_RELIABILITY_DETECTOR_ID,
    name: "Observed reliability",
    question:
      "Which routes show observed headway reliability risk corroborated by wait assessment?",
    claimTemplate: "The route shows observed long-gap/wait reliability risk for the release month.",
    allowedClaimStrength: 3,
    primaryEvidenceRequired: [
      "GTFS-RT sample count, observed long-gap share, wait reliability ratio, and Bus Wait Assessment.",
    ],
    supportingEvidenceExpected: [
      "Scheduled baseline sample support and route-month context evidence.",
    ],
    counterEvidenceRequired: [
      "Run/window/sample limitations and any official schedule or service-alert context that explains gaps.",
    ],
    promotionChecklist: [
      "Confirm GTFS-RT run coverage and scheduled baseline support.",
      "Avoid causal claims; reliability risk is observed, not explained by this detector alone.",
      "Check whether risk is route-wide, directional, or time-window specific.",
    ],
    knownFailureModes: [
      "Confusing observed unreliability with a diagnosis of why it happened.",
      "Ignoring low sample support or missing scheduled baseline context.",
    ],
  },
  {
    detectorId: HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
    name: "Headway reliability EWT",
    question:
      "Which frequent-service stop-direction-hour cells show excess rider wait and poor headway regularity?",
    claimTemplate:
      "Riders at a stop-direction-hour experienced estimated excess wait with weak headway regularity.",
    allowedClaimStrength: 3,
    primaryEvidenceRequired: [
      "Observed headways, average wait time, scheduled wait time, EWT, cv_h, LOS, sample count, and coverage row.",
    ],
    supportingEvidenceExpected: [
      "Scheduled frequency/headway baseline, stop-direction-hour feature key, and quality/freshness fields.",
    ],
    counterEvidenceRequired: [
      "Low sample, low coverage, stale feed, unsupported frequency, and stop-hour scope caveats.",
    ],
    promotionChecklist: [
      "Confirm the route is frequent enough for EWT interpretation.",
      "Keep the claim descriptive; do not attribute the excess wait to a cause.",
      "Check whether nearby stops, directions, or adjacent hours show the same pattern before generalizing.",
    ],
    knownFailureModes: [
      "Scoring sparse GTFS-RT headways as if missing data meant no issue.",
      "Generalizing a single stop-hour EWT hit to the whole route.",
      "Using EWT on low-frequency scheduled service where schedule adherence is the better primitive.",
    ],
  },
  {
    detectorId: BUNCHING_HOTSPOTS_DETECTOR_ID,
    name: "Bunching hotspots",
    question: "Which stop-direction-hour cells show high bunching or long-gap rates?",
    claimTemplate: "A stop-direction-hour shows bunching or long gaps in observed headway pairs.",
    allowedClaimStrength: 3,
    primaryEvidenceRequired: [
      "Observed headway-pair count, scheduled headway baseline, bunching share, gap share, and headway distribution.",
    ],
    supportingEvidenceExpected: [
      "Terminal vs mid-route context when available and adjacent stop/hour evidence before route-level language.",
    ],
    counterEvidenceRequired: [
      "Arrival timestamp noise, low pair count, stale feed coverage, and upstream propagation caveats.",
    ],
    promotionChecklist: [
      "Review whether irregularity originates at the terminal or upstream before naming a location as the source.",
      "Keep the claim descriptive unless context evidence separately supports an association.",
      "Check route direction and adjacent stops for propagation before promotion.",
    ],
    knownFailureModes: [
      "Treating a mid-route bunching hotspot as the cause of bunching.",
      "Inflating short-headway counts because of GPS arrival timing noise.",
      "Scoring low pair-count cells instead of emitting insufficient data.",
    ],
  },
  {
    detectorId: RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
    name: "Rider-weighted excess wait",
    question:
      "Which stop-direction-hour cells impose the largest rider-minute exposure from excess wait?",
    claimTemplate:
      "A stop-direction-hour has high estimated rider-minutes of excess wait using APC/ridership proxy weights.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "EWT, boardings or ridership proxy, rider-minute estimate, proxy source, coverage rows, and percentile cutoff.",
    ],
    supportingEvidenceExpected: [
      "Unweighted EWT detector evidence, APC/ridership snapshot metadata, and source-quality fields for both inputs.",
    ],
    counterEvidenceRequired: [
      "APC/proxy coverage limits, imputation caveats, sparse ridership support, and stop-hour scope caveats.",
    ],
    promotionChecklist: [
      "Confirm the ridership/APC source is suitable for the stop-hour grain.",
      "Keep the claim framed as an exposure estimate, not a causal explanation.",
      "Compare against the unweighted EWT finding before ranking rider impact.",
    ],
    knownFailureModes: [
      "Treating imputed or low-coverage ridership as measured boardings.",
      "Over-ranking busy stops when the underlying EWT evidence is weak.",
      "Publishing rider-minute estimates without naming proxy limitations.",
    ],
  },
  {
    detectorId: TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
    name: "Travel-time variability",
    question: "Which route-direction-daypart cells have unpredictable travel time?",
    claimTemplate: "A route-direction-daypart has high P95-vs-P50 travel-time spread.",
    allowedClaimStrength: 3,
    primaryEvidenceRequired: [
      "Observed runtime P50, observed runtime P95, buffer index, trip count, service-pattern version, and coverage row.",
    ],
    supportingEvidenceExpected: [
      "Own-route history, incident/service-change context, and route-direction-daypart scope metadata.",
    ],
    counterEvidenceRequired: [
      "Incident-driven outliers, low observed-trip support, and route/service-pattern changes.",
    ],
    promotionChecklist: [
      "Keep variability separate from level of slowness or schedule mismatch.",
      "Check service-pattern version before comparing across periods.",
      "Do not infer cause from P95-P50 spread alone.",
    ],
    knownFailureModes: [
      "Letting a one-off incident dominate a reliability finding.",
      "Confusing runtime variability with schedule mismatch.",
      "Comparing route variants or service patterns as one stable series.",
    ],
  },
  {
    detectorId: SCHEDULE_MISMATCH_DETECTOR_ID,
    name: "Schedule mismatch",
    question:
      "Which route-direction-daypart cells have scheduled runtime far from observed median runtime?",
    claimTemplate:
      "Scheduled runtime differs materially from observed median runtime, suggesting schedule review.",
    allowedClaimStrength: 3,
    primaryEvidenceRequired: [
      "Scheduled runtime, observed median runtime, signed runtime deviation, observed trip count, service-pattern version, and coverage row.",
    ],
    supportingEvidenceExpected: [
      "Observed P95 runtime, schedule-change logs when available, and service-pattern version.",
    ],
    counterEvidenceRequired: [
      "Congestion, incidents, seasonality, route changes, and the lack of early-departure-rate evidence.",
    ],
    promotionChecklist: [
      "Use neutral schedule-review wording, not blame or cause language.",
      "Separate tight schedules from possible schedule padding.",
      "Check whether a service-pattern change makes the comparison stale.",
    ],
    knownFailureModes: [
      "Rewarding padded schedules as reliable service.",
      "Blaming the schedule for congestion-driven runtime increases.",
      "Inferring early departures from median runtime alone.",
    ],
  },
  {
    detectorId: DEGRADATION_TREND_DETECTOR_ID,
    name: "Degradation trend",
    question: "Which metric-history scopes show a worsening trend and current outlier?",
    claimTemplate: "A metric history shows a worsening trend over the configured history window.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "Supported metric-history points, current value, robust z score, Theil-Sen slope, metric direction, and coverage row.",
    ],
    supportingEvidenceExpected: [
      "Route-version stability, source coverage by month, service-pattern context, and seasonality review.",
    ],
    counterEvidenceRequired: [
      "Series-break flags, coverage changes, seasonal artifacts, and route or schedule redesigns.",
    ],
    promotionChecklist: [
      "Treat the trend as associational; do not infer an external cause.",
      "Confirm route/service version stability before using trend language.",
      "Review whether seasonality or source coverage changes explain the current outlier.",
    ],
    knownFailureModes: [
      "Manufacturing a trend across a route redesign or schedule break.",
      "Using the wrong metric direction for lower-is-worse metrics.",
      "Overstating a current outlier as a durable trend without enough history.",
    ],
  },
  {
    detectorId: POSITIVE_DEVIANCE_DETECTOR_ID,
    name: "Positive deviance",
    question: "Which scopes persistently outperform comparable peers after adjustment?",
    claimTemplate:
      "A scope performs in the top decile versus peers after adjustment, persistent across periods.",
    allowedClaimStrength: 3,
    primaryEvidenceRequired: [
      "Peer group, peer count, covariates, performance percentiles, adjusted residuals, qualifying periods, and coverage row.",
    ],
    supportingEvidenceExpected: [
      "Peer-construction method, reciprocal-metric checks, and multi-period stability.",
    ],
    counterEvidenceRequired: [
      "Insufficient peers, reciprocal worst-practice metrics, small sample support, and peer-covariate caveats.",
    ],
    promotionChecklist: [
      "Treat as a learning candidate, not proof of best practice.",
      "Review peer covariates and residual calculation before publication.",
      "Check reciprocal metrics so a top-decile signal does not hide another serious issue.",
    ],
    knownFailureModes: [
      "Confusing positive outliers with proven causes of better performance.",
      "Using too-small peer sets or weak covariates.",
      "Ignoring reciprocal worst-practice signals.",
    ],
  },
  {
    detectorId: INTERVENTION_GAP_DETECTOR_ID,
    name: "Intervention gap",
    question: "Which high-pain routes lack dated or evaluated intervention evidence?",
    claimTemplate:
      "A route with high speed/reliability pain has absent or thin intervention evidence.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "Underlying speed or reliability evidence plus intervention inventory status.",
    ],
    supportingEvidenceExpected: [
      "Route context, bus-lane/ACE/source inventory, and source-gap evidence.",
    ],
    counterEvidenceRequired: [
      "Future interventions, undated interventions, or source gaps that could hide a treatment.",
    ],
    promotionChecklist: [
      "Do not cite derived speedPainScore/reliabilityPainScore without underlying evidence.",
      "Verify intervention evidence status before saying a route lacks treatment.",
      "Separate absent evidence from confirmed absence of an intervention.",
    ],
    knownFailureModes: [
      "Claiming no intervention when intervention sources are incomplete.",
      "Stacking derived scores without exposing raw detector evidence.",
    ],
  },
  {
    detectorId: INTERVENTION_EVENT_STUDY_DETECTOR_ID,
    name: "Intervention event study",
    question: "Which intervention panels show a performance change around a known treatment?",
    claimTemplate:
      "Performance changed in the window after an intervention; association pending methodology review.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "Intervention event, pre/post windows, association estimate, confidence interval, controls, and gate summary.",
    ],
    supportingEvidenceExpected: [
      "Segmented regression fields, matched-peer delta, synthetic-control gap, and control scope ids.",
    ],
    counterEvidenceRequired: [
      "Pre-trend, placebo, autocorrelation, control-eligibility, and method-divergence gate results.",
    ],
    promotionChecklist: [
      "Never auto-publish causal language from this detector.",
      "Require all methodology gates plus human approval before effect language.",
      "Flag divergence between uncontrolled, matched-peer, and synthetic-control estimates.",
    ],
    knownFailureModes: [
      "Treating before/after association as causation.",
      "Ignoring failed pre-trends, placebo tests, or autocorrelation.",
      "Selecting only the favorable method when methods diverge.",
    ],
  },
  {
    detectorId: INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
    name: "Intervention underperformance",
    question: "Which evaluated interventions have non-positive peer-adjusted speed outcomes?",
    claimTemplate:
      "An evaluated treatment has non-positive peer-adjusted speed delta and current pain.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "Intervention event, comparison status, adjusted speed delta, peer count, and current speed evidence.",
    ],
    supportingEvidenceExpected: [
      "Before/after window metadata and underlying current speed-hotspot support.",
    ],
    counterEvidenceRequired: [
      "Peer comparability limits, before/after window limits, and any positive official evaluation context.",
    ],
    promotionChecklist: [
      "Review peer construction before claiming underperformance.",
      "Check whether current pain and treatment evaluation windows are comparable.",
      "Prefer cautious language unless reviewed externally.",
    ],
    knownFailureModes: [
      "Overstating descriptive peer-adjusted deltas as causal impact.",
      "Ignoring route changes or construction windows in the comparison.",
    ],
  },
  {
    detectorId: PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
    name: "Permit-correlated slowdown",
    question: "Which slow routes also have substantial DOT permit context?",
    claimTemplate: "Slow-speed evidence coincides with substantial DOT permit touches.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "Route-month speed signal and permit touch counts with uncertainty fields.",
    ],
    supportingEvidenceExpected: [
      "Permit source ids, route fanout, match weights, and context freshness.",
    ],
    counterEvidenceRequired: [
      "Permit fanout, low match weight, and unrelated work-type caveats before causal interpretation.",
    ],
    promotionChecklist: [
      "Use correlation/context language unless reviewed event-level permits support a cause.",
      "Check route fanout and permit types before promotion.",
      "Keep parking-like noisy joins out of detector-grade promotion.",
    ],
    knownFailureModes: [
      "Treating nearby permits as the cause of slow bus speed.",
      "Ignoring low-confidence route-touch fanout.",
    ],
  },
  {
    detectorId: SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
    name: "311 service-request context",
    question: "Which slow routes also have substantial bus-relevant 311 service-request context?",
    claimTemplate: "Slow-speed evidence coincides with substantial 311 service-request context.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: ["Route-month speed signal and 311 context-event touch summary."],
    supportingEvidenceExpected: [
      "311 source ids, complaint event kind, match weights, and route fanout.",
    ],
    counterEvidenceRequired: [
      "Reporting bias, broad street-condition context, low match weight, and high route fanout caveats.",
    ],
    promotionChecklist: [
      "Keep the detector as context until complaint classes and event-level rows are reviewed.",
      "Check high-confidence touch support and average match weight.",
      "Avoid implying 311 complaints caused the speed condition.",
    ],
    knownFailureModes: [
      "Confusing complaint volume with operational cause.",
      "Promoting noisy street-level context without reviewing route fanout.",
    ],
  },
  {
    detectorId: DELAY_CONCENTRATION_DETECTOR_ID,
    name: "Delay concentration",
    question: "Which routes concentrate avoidable delay in a small set of segments?",
    claimTemplate: "A route has unusually concentrated avoidable delay across its segment set.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "Per-segment excess delay, route free-flow reference speed, Gini score, and fleet percentile.",
    ],
    supportingEvidenceExpected: [
      "Top segment list, eligible segment count, total excess delay, and rider exposure when available.",
    ],
    counterEvidenceRequired: [
      "Segment-count sensitivity, fleet benchmark size, and evidence that the detector is not a causal diagnosis.",
    ],
    promotionChecklist: [
      "Keep the claim about concentration of observed delay, not cause.",
      "Check whether top segments are real route geometry and not duplicate or stale segment rows.",
      "Review fleet benchmark size before comparing percentile language.",
    ],
    knownFailureModes: [
      "Over-reading Gini as a cause or intervention recommendation.",
      "Flagging concentration on routes with too few or mismatched segments.",
    ],
  },
] satisfies readonly unknown[];

export const FINDING_DETECTOR_SPECS: FindingDetectorSpec[] = specs.map((spec) =>
  FindingDetectorSpecSchema.parse(spec),
);

export function getFindingDetectorSpec(detectorId: string): FindingDetectorSpec | null {
  return FINDING_DETECTOR_SPECS.find((spec) => spec.detectorId === detectorId) ?? null;
}

export function buildFindingDetectorSpecsArtifact(input: {
  generatedAt: string;
}): FindingDetectorSpecsArtifact {
  return FindingDetectorSpecsArtifactSchema.parse({
    artifactKind: "finding_detector_specs",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    template: DETECTOR_SPEC_TEMPLATE,
    detectorCount: FINDING_DETECTOR_SPECS.length,
    detectors: FINDING_DETECTOR_SPECS,
  });
}
