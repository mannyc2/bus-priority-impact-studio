import type { AnalyticsDetector, DetectorOutput } from "../core/detector.js";
import {
  CONTEXT_SOURCE_FEATURE_GRAIN,
  FEED_HEALTH_FEATURE_GRAIN,
  INTERVENTION_PANEL_FEATURE_GRAIN,
  INTERVENTION_WINDOW_FEATURE_GRAIN,
  POSITIVE_DEVIANCE_FEATURE_GRAIN,
  RIDER_WEIGHTED_EXCESS_WAIT_FEATURE_GRAIN,
  ROUTE_DIRECTION_DAYPART_FEATURE_GRAIN,
  ROUTE_METRIC_HISTORY_FEATURE_GRAIN,
  ROUTE_MONTH_FEATURE_GRAIN,
  ROUTE_RELIABILITY_FEATURE_GRAIN,
  ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN,
  ROUTE_SEGMENT_MONTH_FEATURE_GRAIN,
  ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN,
  ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN,
  SEGMENT_DAYPART_FEATURE_GRAIN,
  SOURCE_COVERAGE_FEATURE_GRAIN,
  STOP_DIRECTION_HOUR_FEATURE_GRAIN,
} from "../features/index.js";
import {
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  type BunchingHotspotsDetectorInput,
  detectBunchingHotspots,
} from "../findings/bunching-hotspots.js";
import {
  DEGRADATION_TREND_DETECTOR_ID,
  type DegradationTrendDetectorInput,
  detectDegradationTrends,
} from "../findings/degradation-trend.js";
import {
  DELAY_CONCENTRATION_DETECTOR_ID,
  type DelayConcentrationDetectorInput,
  detectDelayConcentration,
} from "../findings/delay-concentration.js";
import {
  detectHeadwayReliabilityEwt,
  HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
  type HeadwayReliabilityEwtDetectorInput,
} from "../findings/headway-reliability-ewt.js";
import {
  detectInterventionEventStudies,
  INTERVENTION_EVENT_STUDY_DETECTOR_ID,
  type InterventionEventStudyDetectorInput,
} from "../findings/intervention-event-study.js";
import {
  detectInterventionGaps,
  INTERVENTION_GAP_DETECTOR_ID,
  type InterventionGapDetectorInput,
} from "../findings/intervention-gap.js";
import {
  detectInterventionUnderperformance,
  INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
  type InterventionUnderperformanceDetectorInput,
} from "../findings/intervention-underperformance.js";
import {
  detectTreatmentScopeGaps,
  TREATMENT_SCOPE_GAP_DETECTOR_ID,
  type TreatmentScopeGapDetectorInput,
} from "../findings/treatment-scope-gap.js";
import {
  detectTreatmentScopeMismatch,
  TREATMENT_SCOPE_MISMATCH_DETECTOR_ID,
  type TreatmentScopeMismatchDetectorInput,
} from "../findings/treatment-scope-mismatch.js";
import {
  detectMultiMonthSpeedPeerDeficits,
  MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
  type MultiMonthSpeedPeerDetectorInput,
} from "../findings/multi-month-speed-peer.js";
import {
  detectObservedReliability,
  OBSERVED_RELIABILITY_DETECTOR_ID,
  type ObservedReliabilityDetectorInput,
} from "../findings/observed-reliability.js";
import {
  detectPermitCorrelatedSlowdowns,
  PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
  type PermitCorrelatedSlowdownDetectorInput,
} from "../findings/permit-correlated-slowdown.js";
import {
  detectPersistentSpeedHotspots,
  PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
  type PersistentSpeedHotspotDetectorInput,
} from "../findings/persistent-speed-hotspot.js";
import {
  detectPositiveDeviance,
  POSITIVE_DEVIANCE_DETECTOR_ID,
  type PositiveDevianceDetectorInput,
} from "../findings/positive-deviance.js";
import {
  detectRiderWeightedExcessWait,
  RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
  type RiderWeightedExcessWaitDetectorInput,
} from "../findings/rider-weighted-excess-wait.js";
import {
  detectScheduleMismatch,
  SCHEDULE_MISMATCH_DETECTOR_ID,
  type ScheduleMismatchDetectorInput,
} from "../findings/schedule-mismatch.js";
import {
  detectServiceRequestContext,
  SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
  type ServiceRequestContextDetectorInput,
} from "../findings/service-request-context.js";
import {
  detectSourceGaps,
  SOURCE_GAP_DETECTOR_ID,
  type SourceGapDetectorInput,
} from "../findings/source-gap.js";
import {
  detectSpeedPaceHotspots,
  SPEED_PACE_HOTSPOT_DETECTOR_ID,
  type SpeedPaceHotspotDetectorInput,
} from "../findings/speed-pace-hotspot.js";
import {
  detectTravelTimeVariability,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
  type TravelTimeVariabilityDetectorInput,
} from "../findings/travel-time-variability.js";
import type { DetectorPromotionGate, DetectorRegistryMetadata } from "./metadata.js";
import { FINDING_DETECTOR_SPECS, getFindingDetectorSpec } from "./specs.js";

export type RegisteredAnalyticsDetector = Omit<AnalyticsDetector<unknown>, "run"> &
  DetectorRegistryMetadata & {
    run(input: unknown): DetectorOutput;
  };

const DESCRIPTIVE_GATES: DetectorPromotionGate[] = [
  {
    kind: "coverage",
    description: "Required inputs must be observed for the declared detector universe.",
    requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
  },
  {
    kind: "sample_support",
    description: "Metric sample support must clear the detector-specific minimum.",
    requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
  },
];

const CONTEXT_GATES: DetectorPromotionGate[] = [
  ...DESCRIPTIVE_GATES,
  {
    kind: "spatial_confidence",
    description: "Context joins must have enough match weight and limited route fanout.",
    requiredFor: ["associational", "candidate_causal_needs_review"],
  },
  {
    kind: "source_freshness",
    description: "Context source freshness and join health must be reviewed before promotion.",
    requiredFor: ["associational", "candidate_causal_needs_review"],
  },
];

const INTERVENTION_GATES: DetectorPromotionGate[] = [
  ...DESCRIPTIVE_GATES,
  {
    kind: "control_eligibility",
    description: "Comparison routes or windows must be eligible for any stronger effect language.",
    requiredFor: ["associational", "candidate_causal_needs_review"],
  },
  {
    kind: "reviewer_approval",
    description: "Human review is required before promotion beyond a cautious review candidate.",
    requiredFor: ["associational", "candidate_causal_needs_review"],
  },
];

const EVIDENCE_SCHEMA_VERSION = "v1";

function specFor(detectorId: string) {
  const spec = getFindingDetectorSpec(detectorId);
  if (spec === null) throw new Error(`Missing detector spec for ${detectorId}`);
  return spec;
}

const FEATURE_GRAIN_REQUIRED_DATA_PRODUCTS: Readonly<Record<string, readonly string[]>> = {
  [CONTEXT_SOURCE_FEATURE_GRAIN]: [
    "local_context_event_route_touches_history",
    "local_ace_enforcement_context_history",
  ],
  [FEED_HEALTH_FEATURE_GRAIN]: [
    "analytics_backfill_coverage_audit",
    "bus_observatory_gtfs_rt_availability",
  ],
  [INTERVENTION_PANEL_FEATURE_GRAIN]: [
    "intervention_panel_artifact",
    "local_route_intervention_comparison_history",
  ],
  [INTERVENTION_WINDOW_FEATURE_GRAIN]: ["local_route_intervention_comparison_history"],
  [POSITIVE_DEVIANCE_FEATURE_GRAIN]: [
    "route_hourly_profile_artifact",
    "local_route_month_trends_history",
  ],
  [RIDER_WEIGHTED_EXCESS_WAIT_FEATURE_GRAIN]: [
    "stop_direction_hour_ewt_features",
    "route_hourly_profile_artifact",
    "ewt_route_month_score_vectors",
  ],
  [ROUTE_DIRECTION_DAYPART_FEATURE_GRAIN]: [
    "local_route_schedule_timepoints_release",
    "local_observed_headway_samples_run",
    "local_route_reliability_baseline_release",
  ],
  [ROUTE_METRIC_HISTORY_FEATURE_GRAIN]: [
    "local_route_month_trends_history",
    "local_route_observed_reliability_summary_release",
    "local_bus_wait_assessment_history",
  ],
  [ROUTE_MONTH_FEATURE_GRAIN]: [
    "local_route_month_coverage_release",
    "local_route_month_trends_history",
    "analytics_corpus_profile_artifact",
  ],
  [ROUTE_RELIABILITY_FEATURE_GRAIN]: [
    "local_route_observed_reliability_summary_release",
    "local_route_reliability_baseline_release",
    "local_bus_wait_assessment_history",
  ],
  [ROUTE_SEGMENT_MONTH_FEATURE_GRAIN]: [
    "local_route_segment_speed_history",
    "studio_route_hotspot_summaries",
  ],
  [ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN]: ["route_treatment_summary_artifact"],
  [ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN]: ["route_treatment_summary_artifact"],
  [ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN]: ["route_treatment_summary_artifact"],
  [SEGMENT_DAYPART_FEATURE_GRAIN]: [
    "segment_daypart_history_artifact",
    "local_route_segment_speed_history",
  ],
  [SOURCE_COVERAGE_FEATURE_GRAIN]: [
    "studio_route_source_status_rows",
    "local_route_month_coverage_release",
  ],
  [STOP_DIRECTION_HOUR_FEATURE_GRAIN]: [
    "stop_direction_hour_ewt_features",
    "local_observed_headway_samples_run",
    "local_route_schedule_timepoints_release",
  ],
};

function requiredProductsForFeatureGrains(featureGrains: readonly string[]): string[] {
  return [
    ...new Set(featureGrains.flatMap((featureGrain) => FEATURE_GRAIN_REQUIRED_DATA_PRODUCTS[featureGrain] ?? [])),
  ].sort();
}

const ANALYTICS_DETECTOR_REGISTRY_DEFINITIONS: Array<
  Omit<RegisteredAnalyticsDetector, "requiredDataProducts">
> = [
  {
    detectorId: specFor(SOURCE_GAP_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(SOURCE_GAP_DETECTOR_ID),
    featureGrains: [
      SOURCE_COVERAGE_FEATURE_GRAIN,
      FEED_HEALTH_FEATURE_GRAIN,
      ROUTE_RELIABILITY_FEATURE_GRAIN,
      ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN,
    ],
    scope: { kind: "route", description: "Route/source scope coverage and source gaps." },
    claimTier: "descriptive",
    baselineFamilies: ["source_coverage"],
    modelArtifacts: ["source_gap_model_v1"],
    promotionGates: [
      {
        kind: "coverage",
        description:
          "Expected source, route, and join inputs must be explicitly observed or missed.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
      {
        kind: "source_freshness",
        description: "Source lag warnings require freshness policy review before promotion.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: [
      "missing_speed",
      "missing_geometry",
      "insufficient_gtfs_rt_samples",
      "missing_scheduled_baseline",
      "failed_context_join",
      "bus_lane_date_gap",
      "source_lag",
      "tsp_current_inventory_missing",
      "treatment_source_gap",
      "low_coverage",
      "feed_stale",
      "validator_errors",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectSourceGaps(input as SourceGapDetectorInput),
  },
  {
    detectorId: specFor(PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID),
    featureGrains: [ROUTE_SEGMENT_MONTH_FEATURE_GRAIN],
    scope: { kind: "segment", description: "Route timepoint segment speed hotspot." },
    claimTier: "descriptive",
    baselineFamilies: ["free_flow", "source_coverage"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "spatial_confidence",
        description: "Segment geometry and stop labels should be plausible before promotion.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: ["missing_speed", "insufficient_speed_observations"],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectPersistentSpeedHotspots(input as PersistentSpeedHotspotDetectorInput),
  },
  {
    detectorId: specFor(SPEED_PACE_HOTSPOT_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(SPEED_PACE_HOTSPOT_DETECTOR_ID),
    featureGrains: [SEGMENT_DAYPART_FEATURE_GRAIN, FEED_HEALTH_FEATURE_GRAIN],
    scope: { kind: "segment", description: "Segment-daypart pace versus free-flow baseline." },
    claimTier: "descriptive",
    baselineFamilies: ["free_flow", "source_coverage"],
    modelArtifacts: ["segment_daypart_residuals_v1"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "baseline_available",
        description: "Free-flow pace baseline must be available for slowness scoring.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
      {
        kind: "spatial_confidence",
        description: "Segment map matching and segment length must support pace interpretation.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: [
      "insufficient_speed_observations",
      "insufficient_traversals",
      "segment_too_short",
      "spatial_join_uncertain",
      "baseline_unavailable",
      "low_coverage",
      "feed_stale",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectSpeedPaceHotspots(input as SpeedPaceHotspotDetectorInput),
  },
  {
    detectorId: specFor(MULTI_MONTH_SPEED_PEER_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(MULTI_MONTH_SPEED_PEER_DETECTOR_ID),
    featureGrains: [ROUTE_MONTH_FEATURE_GRAIN],
    scope: { kind: "route", description: "Route multi-month speed trend versus peer baseline." },
    claimTier: "associational",
    baselineFamilies: ["peer", "own_history", "source_coverage"],
    modelArtifacts: ["route_peer_residuals_v1"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "peer_count",
        description: "Peer route support must clear the detector threshold before promotion.",
        requiredFor: ["associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: ["insufficient_trend_months", "missing_current_trend_month"],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectMultiMonthSpeedPeerDeficits(input as MultiMonthSpeedPeerDetectorInput),
  },
  {
    detectorId: specFor(OBSERVED_RELIABILITY_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(OBSERVED_RELIABILITY_DETECTOR_ID),
    featureGrains: [ROUTE_RELIABILITY_FEATURE_GRAIN],
    scope: { kind: "route", description: "Route observed headway reliability." },
    claimTier: "descriptive",
    baselineFamilies: ["schedule", "source_coverage"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "baseline_available",
        description: "Scheduled baseline and Bus Wait Assessment support must be available.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: [
      "insufficient_gtfs_rt_samples",
      "missing_scheduled_baseline",
      "missing_bus_wait_assessment",
      "missing_reliability_metric",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectObservedReliability(input as ObservedReliabilityDetectorInput),
  },
  {
    detectorId: specFor(HEADWAY_RELIABILITY_EWT_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(HEADWAY_RELIABILITY_EWT_DETECTOR_ID),
    featureGrains: [STOP_DIRECTION_HOUR_FEATURE_GRAIN, FEED_HEALTH_FEATURE_GRAIN],
    scope: {
      kind: "route",
      description: "Stop-direction-hour EWT and headway regularity on frequent service.",
    },
    claimTier: "descriptive",
    baselineFamilies: ["schedule", "source_coverage"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "baseline_available",
        description: "Scheduled frequency and headway baseline must be available for EWT.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
      {
        kind: "source_freshness",
        description: "GTFS-RT freshness must be acceptable before scoring stop-hour headways.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: [
      "insufficient_headways",
      "baseline_unavailable",
      "unsupported_frequency",
      "low_coverage",
      "feed_stale",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectHeadwayReliabilityEwt(input as HeadwayReliabilityEwtDetectorInput),
  },
  {
    detectorId: specFor(BUNCHING_HOTSPOTS_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(BUNCHING_HOTSPOTS_DETECTOR_ID),
    featureGrains: [STOP_DIRECTION_HOUR_FEATURE_GRAIN, FEED_HEALTH_FEATURE_GRAIN],
    scope: {
      kind: "route",
      description: "Stop-direction-hour bunching and long-gap headway irregularity.",
    },
    claimTier: "descriptive",
    baselineFamilies: ["schedule", "source_coverage"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "baseline_available",
        description: "Scheduled headway baseline must be available for headway-ratio scoring.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
      {
        kind: "source_freshness",
        description: "GTFS-RT freshness must be acceptable before scoring stop-hour headways.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: [
      "insufficient_headway_pairs",
      "baseline_unavailable",
      "low_coverage",
      "feed_stale",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectBunchingHotspots(input as BunchingHotspotsDetectorInput),
  },
  {
    detectorId: specFor(RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID),
    featureGrains: [RIDER_WEIGHTED_EXCESS_WAIT_FEATURE_GRAIN, FEED_HEALTH_FEATURE_GRAIN],
    scope: {
      kind: "route",
      description: "Stop-direction-hour excess-wait exposure weighted by APC/ridership proxies.",
    },
    claimTier: "associational",
    baselineFamilies: ["schedule", "source_coverage"],
    modelArtifacts: ["reliability_exposure_panel_v1"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "source_freshness",
        description: "Both EWT and ridership/APC proxy inputs must be fresh enough before scoring.",
        requiredFor: ["associational", "candidate_causal_needs_review"],
      },
      {
        kind: "reviewer_approval",
        description: "Reviewer must confirm ridership proxy suitability before publication.",
        requiredFor: ["associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: [
      "insufficient_headways",
      "missing_excess_wait",
      "ridership_proxy_unavailable",
      "low_coverage",
      "feed_stale",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "experimental",
    run: (input) => detectRiderWeightedExcessWait(input as RiderWeightedExcessWaitDetectorInput),
  },
  {
    detectorId: specFor(TRAVEL_TIME_VARIABILITY_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(TRAVEL_TIME_VARIABILITY_DETECTOR_ID),
    featureGrains: [ROUTE_DIRECTION_DAYPART_FEATURE_GRAIN, FEED_HEALTH_FEATURE_GRAIN],
    scope: { kind: "route", description: "Route-direction-daypart runtime variability." },
    claimTier: "descriptive",
    baselineFamilies: ["own_history", "source_coverage"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "source_freshness",
        description:
          "Runtime observations must be fresh enough for descriptive variability claims.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: [
      "insufficient_runtime_observations",
      "missing_runtime_metric",
      "low_coverage",
      "feed_stale",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectTravelTimeVariability(input as TravelTimeVariabilityDetectorInput),
  },
  {
    detectorId: specFor(SCHEDULE_MISMATCH_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(SCHEDULE_MISMATCH_DETECTOR_ID),
    featureGrains: [ROUTE_DIRECTION_DAYPART_FEATURE_GRAIN, FEED_HEALTH_FEATURE_GRAIN],
    scope: { kind: "route", description: "Route-direction-daypart schedule-vs-observed runtime." },
    claimTier: "descriptive",
    baselineFamilies: ["schedule", "source_coverage"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "baseline_available",
        description: "Scheduled runtime baseline must be available for runtime deviation scoring.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: [
      "insufficient_runtime_observations",
      "missing_runtime_metric",
      "baseline_unavailable",
      "low_coverage",
      "feed_stale",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectScheduleMismatch(input as ScheduleMismatchDetectorInput),
  },
  {
    detectorId: specFor(DEGRADATION_TREND_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(DEGRADATION_TREND_DETECTOR_ID),
    featureGrains: [ROUTE_METRIC_HISTORY_FEATURE_GRAIN, FEED_HEALTH_FEATURE_GRAIN],
    scope: { kind: "route", description: "Metric-history worsening trend by scope." },
    claimTier: "associational",
    baselineFamilies: ["own_history", "source_coverage"],
    modelArtifacts: ["route_peer_residuals_v1"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "baseline_available",
        description: "A stable own-history baseline with robust dispersion must be available.",
        requiredFor: ["associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: [
      "insufficient_history",
      "missing_current_history_point",
      "series_break_versioned",
      "baseline_dispersion_unavailable",
      "low_coverage",
      "feed_stale",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectDegradationTrends(input as DegradationTrendDetectorInput),
  },
  {
    detectorId: specFor(POSITIVE_DEVIANCE_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(POSITIVE_DEVIANCE_DETECTOR_ID),
    featureGrains: [POSITIVE_DEVIANCE_FEATURE_GRAIN, FEED_HEALTH_FEATURE_GRAIN],
    scope: { kind: "route", description: "Peer-adjusted positive deviance by scope." },
    claimTier: "descriptive",
    baselineFamilies: ["peer", "source_coverage"],
    modelArtifacts: ["route_peer_residuals_v1"],
    promotionGates: [
      ...DESCRIPTIVE_GATES,
      {
        kind: "peer_count",
        description: "Peer support and peer covariates must clear the detector threshold.",
        requiredFor: ["descriptive", "associational", "candidate_causal_needs_review"],
      },
    ],
    missingDataStates: [
      "insufficient_peers",
      "insufficient_positive_periods",
      "reciprocal_metric_warning",
      "low_coverage",
      "feed_stale",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectPositiveDeviance(input as PositiveDevianceDetectorInput),
  },
  {
    detectorId: specFor(INTERVENTION_GAP_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(INTERVENTION_GAP_DETECTOR_ID),
    featureGrains: [
      ROUTE_MONTH_FEATURE_GRAIN,
      INTERVENTION_WINDOW_FEATURE_GRAIN,
      ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN,
      ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN,
    ],
    scope: { kind: "route", description: "Route pain signals versus intervention inventory." },
    claimTier: "associational",
    baselineFamilies: ["source_coverage", "intervention_window"],
    modelArtifacts: ["source_gap_model_v1"],
    promotionGates: INTERVENTION_GATES,
    missingDataStates: [
      "missing_pain_signal",
      "thin_source_gap",
      "future_only",
      "treatment_source_gap",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectInterventionGaps(input as InterventionGapDetectorInput),
  },
  {
    detectorId: specFor(INTERVENTION_EVENT_STUDY_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(INTERVENTION_EVENT_STUDY_DETECTOR_ID),
    featureGrains: [INTERVENTION_PANEL_FEATURE_GRAIN, ROUTE_METRIC_HISTORY_FEATURE_GRAIN],
    scope: { kind: "route", description: "Intervention event-study association panels." },
    claimTier: "associational",
    baselineFamilies: ["intervention_window", "control_routes", "synthetic_control"],
    modelArtifacts: ["treatment_event_panel_v1"],
    promotionGates: [
      ...INTERVENTION_GATES,
      {
        kind: "pre_trend",
        description: "Pre-trend must pass before any candidate-causal review.",
        requiredFor: ["candidate_causal_needs_review"],
      },
      {
        kind: "placebo_in_time",
        description: "Placebo-in-time falsification must pass before candidate-causal review.",
        requiredFor: ["candidate_causal_needs_review"],
      },
      {
        kind: "placebo_in_space",
        description: "Placebo-in-space falsification must pass before candidate-causal review.",
        requiredFor: ["candidate_causal_needs_review"],
      },
      {
        kind: "autocorrelation",
        description: "Autocorrelation check must pass before candidate-causal review.",
        requiredFor: ["candidate_causal_needs_review"],
      },
      {
        kind: "method_divergence",
        description:
          "Divergent uncontrolled, matched-peer, or SCM estimates block stronger claims.",
        requiredFor: ["candidate_causal_needs_review"],
      },
    ],
    missingDataStates: ["insufficient_window", "no_counterfactual", "missing_effect_estimate"],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectInterventionEventStudies(input as InterventionEventStudyDetectorInput),
  },
  {
    detectorId: specFor(INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID),
    featureGrains: [
      ROUTE_MONTH_FEATURE_GRAIN,
      INTERVENTION_WINDOW_FEATURE_GRAIN,
      ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN,
      ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN,
    ],
    scope: { kind: "route", description: "Route treatment comparison and current pain." },
    claimTier: "associational",
    baselineFamilies: ["intervention_window", "peer", "control_routes"],
    promotionGates: INTERVENTION_GATES,
    missingDataStates: [
      "missing_pain_signal",
      "missing_evaluated_intervention",
      "treatment_segment_gap",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) =>
      detectInterventionUnderperformance(input as InterventionUnderperformanceDetectorInput),
  },
  {
    detectorId: specFor(TREATMENT_SCOPE_MISMATCH_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(TREATMENT_SCOPE_MISMATCH_DETECTOR_ID),
    featureGrains: [ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN, ROUTE_SEGMENT_MONTH_FEATURE_GRAIN],
    scope: {
      kind: "segment",
      description: "Bus-lane-overlap segment speed and treatment scope review.",
    },
    claimTier: "associational",
    baselineFamilies: ["source_coverage", "intervention_window"],
    modelArtifacts: ["segment_speed_residuals_v1", "intervention_scope_fit_v1"],
    promotionGates: INTERVENTION_GATES,
    missingDataStates: [
      "missing_speed",
      "insufficient_speed_observations",
      "spatial_join_uncertain",
      "treatment_segment_gap",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectTreatmentScopeMismatch(input as TreatmentScopeMismatchDetectorInput),
  },
  {
    detectorId: specFor(TREATMENT_SCOPE_GAP_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(TREATMENT_SCOPE_GAP_DETECTOR_ID),
    featureGrains: [
      ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN,
      ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN,
      ROUTE_SEGMENT_MONTH_FEATURE_GRAIN,
    ],
    scope: {
      kind: "segment",
      description: "Treated route with slow uncovered or weakly covered segment.",
    },
    claimTier: "associational",
    baselineFamilies: ["source_coverage", "intervention_window"],
    modelArtifacts: ["segment_speed_residuals_v1", "intervention_scope_fit_v1"],
    promotionGates: INTERVENTION_GATES,
    missingDataStates: [
      "missing_speed",
      "insufficient_speed_observations",
      "segment_too_short",
      "spatial_join_uncertain",
      "treatment_segment_gap",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectTreatmentScopeGaps(input as TreatmentScopeGapDetectorInput),
  },
  {
    detectorId: specFor(PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID),
    featureGrains: [ROUTE_MONTH_FEATURE_GRAIN, CONTEXT_SOURCE_FEATURE_GRAIN],
    scope: { kind: "route", description: "Slow route with DOT permit context." },
    claimTier: "associational",
    baselineFamilies: ["source_coverage"],
    promotionGates: CONTEXT_GATES,
    missingDataStates: [
      "missing_speed",
      "insufficient_speed_observations",
      "insufficient_permit_touches",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectPermitCorrelatedSlowdowns(input as PermitCorrelatedSlowdownDetectorInput),
  },
  {
    detectorId: specFor(SERVICE_REQUEST_CONTEXT_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(SERVICE_REQUEST_CONTEXT_DETECTOR_ID),
    featureGrains: [ROUTE_MONTH_FEATURE_GRAIN, CONTEXT_SOURCE_FEATURE_GRAIN],
    scope: { kind: "route", description: "Slow route with 311 service-request context." },
    claimTier: "associational",
    baselineFamilies: ["source_coverage"],
    promotionGates: CONTEXT_GATES,
    missingDataStates: [
      "missing_speed",
      "unsupported_window",
      "insufficient_speed_observations",
      "insufficient_service_request_context",
    ],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectServiceRequestContext(input as ServiceRequestContextDetectorInput),
  },
  {
    detectorId: specFor(DELAY_CONCENTRATION_DETECTOR_ID).detectorId,
    version: "1.0.0",
    spec: specFor(DELAY_CONCENTRATION_DETECTOR_ID),
    featureGrains: [ROUTE_SEGMENT_MONTH_FEATURE_GRAIN],
    scope: { kind: "route", description: "Route-level concentration of segment delay." },
    claimTier: "descriptive",
    baselineFamilies: ["free_flow", "fleet_distribution", "source_coverage"],
    promotionGates: DESCRIPTIVE_GATES,
    missingDataStates: ["insufficient_speed_observations"],
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    retirementStatus: "active",
    run: (input) => detectDelayConcentration(input as DelayConcentrationDetectorInput),
  },
];

export const ANALYTICS_DETECTOR_REGISTRY: RegisteredAnalyticsDetector[] =
  ANALYTICS_DETECTOR_REGISTRY_DEFINITIONS.map((detector) => ({
    ...detector,
    requiredDataProducts: requiredProductsForFeatureGrains(detector.featureGrains),
  }));

export function listAnalyticsDetectors(): RegisteredAnalyticsDetector[] {
  return [...ANALYTICS_DETECTOR_REGISTRY];
}

export function getAnalyticsDetector(detectorId: string): RegisteredAnalyticsDetector | null {
  return ANALYTICS_DETECTOR_REGISTRY.find((detector) => detector.detectorId === detectorId) ?? null;
}

export function assertDetectorRegistryMatchesSpecs(): void {
  const registeredIds = new Set(ANALYTICS_DETECTOR_REGISTRY.map((detector) => detector.detectorId));
  for (const spec of FINDING_DETECTOR_SPECS) {
    if (!registeredIds.has(spec.detectorId)) {
      throw new Error(`Detector spec ${spec.detectorId} is not registered`);
    }
  }
}
