import { DEGRADATION_TREND_DETECTOR_ID } from "../findings/degradation-trend.js";
import { HEADWAY_RELIABILITY_EWT_DETECTOR_ID } from "../findings/headway-reliability-ewt.js";
import { INTERVENTION_EVENT_STUDY_DETECTOR_ID } from "../findings/intervention-event-study.js";
import { SCHEDULE_MISMATCH_DETECTOR_ID } from "../findings/schedule-mismatch.js";
import { SPEED_PACE_HOTSPOT_DETECTOR_ID } from "../findings/speed-pace-hotspot.js";

export type CalibrationWindowId =
  | "releaseMonth"
  | "lookback12"
  | "lookback36"
  | "seasonalPeerWindow"
  | "prePostInterventionWindow";

export type CalibrationWindowConfig = {
  windowId: CalibrationWindowId;
  label: string;
  defaultMonths: number;
  minimumCompleteMonths: number;
  anchor: "release_month" | "intervention_month";
  purpose: string;
};

export type SeasonalityRuleId =
  | "none"
  | "same_month_prior_year"
  | "adjacent_month_guard"
  | "route_version_break"
  | "service_period_break"
  | "control_pretrend";

export type DetectorSeasonalityRule = {
  ruleId: SeasonalityRuleId;
  description: string;
  requiredForPromotion: boolean;
};

export type MinimumHistoryGate = {
  gateId: string;
  description: string;
  minimumCompleteMonths: number;
  minimumCoverageShare: number;
  minimumObservations: number | null;
  missingDataState: string;
};

export type BackfillValidationSurfaceId =
  | "observed_headways"
  | "route_segment_speeds"
  | "route_hourly_ridership"
  | "intervention_comparisons"
  | "gtfs_schedule_runtime";

export type DetectorPostBackfillValidationExpectation = {
  surfaceId: BackfillValidationSurfaceId;
  required: boolean;
  expectation: string;
  failureState: string;
};

export type DetectorCalibrationPolicy = {
  detectorId: string;
  detectorName: string;
  releaseOutputWindow: CalibrationWindowId;
  baselineWindowIds: readonly CalibrationWindowId[];
  seasonalityRules: readonly DetectorSeasonalityRule[];
  minimumHistoryGates: readonly MinimumHistoryGate[];
  postBackfillValidation: readonly DetectorPostBackfillValidationExpectation[];
  validationExpectation: string;
};

export const CALIBRATION_WINDOW_CONFIGS = [
  {
    windowId: "releaseMonth",
    label: "Release month",
    defaultMonths: 1,
    minimumCompleteMonths: 1,
    anchor: "release_month",
    purpose: "Current public evidence and serving projection.",
  },
  {
    windowId: "lookback12",
    label: "Trailing 12 months",
    defaultMonths: 12,
    minimumCompleteMonths: 8,
    anchor: "release_month",
    purpose: "Stable own-route baselines and persistence checks.",
  },
  {
    windowId: "lookback36",
    label: "Trailing 36 months",
    defaultMonths: 36,
    minimumCompleteMonths: 24,
    anchor: "release_month",
    purpose: "Distribution fitting, rare-event calibration, and score-vector history.",
  },
  {
    windowId: "seasonalPeerWindow",
    label: "Seasonal peer months",
    defaultMonths: 9,
    minimumCompleteMonths: 3,
    anchor: "release_month",
    purpose: "Same-month prior-year and adjacent-month seasonality checks.",
  },
  {
    windowId: "prePostInterventionWindow",
    label: "Intervention pre/post window",
    defaultMonths: 24,
    minimumCompleteMonths: 12,
    anchor: "intervention_month",
    purpose: "Pre/post, control, placebo, and event-study screening panels.",
  },
] as const satisfies readonly CalibrationWindowConfig[];

const SAME_MONTH_PRIOR_YEAR: DetectorSeasonalityRule = {
  ruleId: "same_month_prior_year",
  description:
    "Compare release-month scores to same-month observations in prior years when present.",
  requiredForPromotion: false,
};

const ADJACENT_MONTH_GUARD: DetectorSeasonalityRule = {
  ruleId: "adjacent_month_guard",
  description: "Check adjacent months before treating a one-month spike as persistent or novel.",
  requiredForPromotion: false,
};

const ROUTE_VERSION_BREAK: DetectorSeasonalityRule = {
  ruleId: "route_version_break",
  description:
    "Suppress or version trend baselines across route geometry, stop-pattern, or schedule breaks.",
  requiredForPromotion: true,
};

const SERVICE_PERIOD_BREAK: DetectorSeasonalityRule = {
  ruleId: "service_period_break",
  description: "Compare observed runtime to the schedule version in force for the analyzed month.",
  requiredForPromotion: true,
};

const CONTROL_PRETREND: DetectorSeasonalityRule = {
  ruleId: "control_pretrend",
  description:
    "Require treated and comparison routes to clear pre-trend checks before stronger intervention language.",
  requiredForPromotion: true,
};

export const DETECTOR_CALIBRATION_POLICIES = [
  {
    detectorId: HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
    detectorName: "Headway reliability EWT",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD],
    minimumHistoryGates: [
      {
        gateId: "ewt_release_cell_support",
        description:
          "Release stop-direction-hour cells need enough observed headways to compute EWT.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 10,
        missingDataState: "insufficient_headways",
      },
      {
        gateId: "ewt_history_threshold_support",
        description:
          "Historical calibration should use at least eight complete months before percentile thresholds move.",
        minimumCompleteMonths: 8,
        minimumCoverageShare: 0.8,
        minimumObservations: null,
        missingDataState: "insufficient_history",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "observed_headways",
        required: true,
        expectation:
          "Observed headway coverage is profiled for release and lookback windows before EWT threshold fitting.",
        failureState: "low_coverage",
      },
    ],
    validationExpectation:
      "Backtest EWT/cv_h score vectors against reviewed long-gap labels and keep descriptive precision high before auto-publication.",
  },
  {
    detectorId: SPEED_PACE_HOTSPOT_DETECTOR_ID,
    detectorName: "Speed pace hotspot",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "lookback36", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, ROUTE_VERSION_BREAK],
    minimumHistoryGates: [
      {
        gateId: "segment_release_traversal_support",
        description:
          "Release segment-daypart cells need enough traversals for stable pace and slowness estimates.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 15,
        missingDataState: "insufficient_data",
      },
      {
        gateId: "segment_free_flow_history_support",
        description:
          "Free-flow and same-segment baselines need enough historical segment months to avoid one-month calibration.",
        minimumCompleteMonths: 12,
        minimumCoverageShare: 0.75,
        minimumObservations: null,
        missingDataState: "insufficient_history",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "analytics-backfill-coverage reports no unexplained missing or thin route segment speed months.",
        failureState: "segment_history_unavailable",
      },
    ],
    validationExpectation:
      "Fit slowness-index thresholds on route-segment score vectors and compare persistent hotspots to reviewed corridor labels.",
  },
  {
    detectorId: SCHEDULE_MISMATCH_DETECTOR_ID,
    detectorName: "Schedule mismatch",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "seasonalPeerWindow"],
    seasonalityRules: [SERVICE_PERIOD_BREAK, ROUTE_VERSION_BREAK, ADJACENT_MONTH_GUARD],
    minimumHistoryGates: [
      {
        gateId: "schedule_release_trip_support",
        description:
          "Release route-direction-daypart cells need enough observed trips before schedule mismatch is scored.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 10,
        missingDataState: "insufficient_data",
      },
      {
        gateId: "schedule_recurring_mismatch_support",
        description:
          "Recurring schedule-review candidates need history across several schedule periods or months.",
        minimumCompleteMonths: 8,
        minimumCoverageShare: 0.75,
        minimumObservations: null,
        missingDataState: "insufficient_history",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "gtfs_schedule_runtime",
        required: true,
        expectation: "Schedule-runtime baselines are versioned by month and service period.",
        failureState: "baseline_unavailable",
      },
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Observed runtime or pace history is present for the route/month cells being compared to schedule.",
        failureState: "observed_runtime_unavailable",
      },
    ],
    validationExpectation:
      "Separate systematic tight schedules from padded schedules and incident months before promoting schedule-review candidates.",
  },
  {
    detectorId: DEGRADATION_TREND_DETECTOR_ID,
    detectorName: "Degradation trend",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["lookback12", "lookback36", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, ROUTE_VERSION_BREAK],
    minimumHistoryGates: [
      {
        gateId: "trend_month_support",
        description:
          "Trend fitting needs enough complete months for robust slope and level-shift estimates.",
        minimumCompleteMonths: 8,
        minimumCoverageShare: 0.75,
        minimumObservations: null,
        missingDataState: "insufficient_history",
      },
      {
        gateId: "trend_seasonal_support",
        description:
          "Promotion should prefer at least one same-month prior-year comparison when available.",
        minimumCompleteMonths: 12,
        minimumCoverageShare: 0.66,
        minimumObservations: null,
        missingDataState: "seasonality_unchecked",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Monthly speed/pace history is complete enough to build route_metric_history or segment_daypart_history artifacts.",
        failureState: "metric_history_unavailable",
      },
      {
        surfaceId: "route_hourly_ridership",
        required: false,
        expectation:
          "Hourly ridership history is available when degradation severity is rider-weighted.",
        failureState: "ridership_proxy_unavailable",
      },
    ],
    validationExpectation:
      "Backtest Theil-Sen and robust-z trend flags against known route changes, reviewed degradations, and series-break examples.",
  },
  {
    detectorId: INTERVENTION_EVENT_STUDY_DETECTOR_ID,
    detectorName: "Intervention event study",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["prePostInterventionWindow", "lookback36"],
    seasonalityRules: [CONTROL_PRETREND, ROUTE_VERSION_BREAK, SAME_MONTH_PRIOR_YEAR],
    minimumHistoryGates: [
      {
        gateId: "intervention_pre_post_support",
        description:
          "Intervention panels need enough pre and post months for ITS/event-study screening.",
        minimumCompleteMonths: 12,
        minimumCoverageShare: 0.75,
        minimumObservations: null,
        missingDataState: "insufficient_window",
      },
      {
        gateId: "intervention_control_support",
        description:
          "Candidate-causal promotion requires enough eligible comparison routes or an auditable synthetic-control fit.",
        minimumCompleteMonths: 12,
        minimumCoverageShare: 0.75,
        minimumObservations: 3,
        missingDataState: "no_counterfactual",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "intervention_comparisons",
        required: true,
        expectation:
          "Intervention comparison rows exist across historical months, not only the release month.",
        failureState: "intervention_panel_unavailable",
      },
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Performance metrics exist for treated and candidate-control routes across pre/post windows.",
        failureState: "performance_history_unavailable",
      },
    ],
    validationExpectation:
      "Compute pre-trend, placebo-in-time, placebo-in-space, autocorrelation, and method-divergence gates; causal language remains human-gated.",
  },
] as const satisfies readonly DetectorCalibrationPolicy[];

export function listCalibrationWindowConfigs(): CalibrationWindowConfig[] {
  return [...CALIBRATION_WINDOW_CONFIGS];
}

export function getCalibrationWindowConfig(
  windowId: CalibrationWindowId,
): CalibrationWindowConfig | null {
  return CALIBRATION_WINDOW_CONFIGS.find((config) => config.windowId === windowId) ?? null;
}

export function listDetectorCalibrationPolicies(): DetectorCalibrationPolicy[] {
  return [...DETECTOR_CALIBRATION_POLICIES];
}

export function getDetectorCalibrationPolicy(detectorId: string): DetectorCalibrationPolicy | null {
  return DETECTOR_CALIBRATION_POLICIES.find((policy) => policy.detectorId === detectorId) ?? null;
}

export function requiredBackfillSurfacesForDetector(
  detectorId: string,
): BackfillValidationSurfaceId[] {
  const policy = getDetectorCalibrationPolicy(detectorId);
  if (policy === null) return [];
  return [
    ...new Set(
      policy.postBackfillValidation
        .filter((expectation) => expectation.required)
        .map((expectation) => expectation.surfaceId),
    ),
  ].sort();
}
