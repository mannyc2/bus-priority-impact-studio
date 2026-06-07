import { BUNCHING_HOTSPOTS_DETECTOR_ID } from "../findings/bunching-hotspots.js";
import { DEGRADATION_TREND_DETECTOR_ID } from "../findings/degradation-trend.js";
import { DELAY_CONCENTRATION_DETECTOR_ID } from "../findings/delay-concentration.js";
import { HEADWAY_RELIABILITY_EWT_DETECTOR_ID } from "../findings/headway-reliability-ewt.js";
import { INTERVENTION_EVENT_STUDY_DETECTOR_ID } from "../findings/intervention-event-study.js";
import { INTERVENTION_GAP_DETECTOR_ID } from "../findings/intervention-gap.js";
import { INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID } from "../findings/intervention-underperformance.js";
import { TREATMENT_SCOPE_GAP_DETECTOR_ID } from "../findings/treatment-scope-gap.js";
import { TREATMENT_SCOPE_MISMATCH_DETECTOR_ID } from "../findings/treatment-scope-mismatch.js";
import { MULTI_MONTH_SPEED_PEER_DETECTOR_ID } from "../findings/multi-month-speed-peer.js";
import { OBSERVED_RELIABILITY_DETECTOR_ID } from "../findings/observed-reliability.js";
import { PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID } from "../findings/persistent-speed-hotspot.js";
import { PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID } from "../findings/permit-correlated-slowdown.js";
import { POSITIVE_DEVIANCE_DETECTOR_ID } from "../findings/positive-deviance.js";
import { RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID } from "../findings/rider-weighted-excess-wait.js";
import { SCHEDULE_MISMATCH_DETECTOR_ID } from "../findings/schedule-mismatch.js";
import { SERVICE_REQUEST_CONTEXT_DETECTOR_ID } from "../findings/service-request-context.js";
import { SOURCE_GAP_DETECTOR_ID } from "../findings/source-gap.js";
import { SPEED_PACE_HOTSPOT_DETECTOR_ID } from "../findings/speed-pace-hotspot.js";
import { TRAVEL_TIME_VARIABILITY_DETECTOR_ID } from "../findings/travel-time-variability.js";

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
  | "bus_wait_assessment"
  | "dot_permit_route_touches"
  | "observed_headways"
  | "route_segment_speeds"
  | "route_hourly_ridership"
  | "intervention_comparisons"
  | "gtfs_schedule_runtime"
  | "service_request_route_touches";

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
    detectorId: SOURCE_GAP_DETECTOR_ID,
    detectorName: "Source gap",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth"],
    seasonalityRules: [],
    minimumHistoryGates: [
      {
        gateId: "source_gap_release_surface_support",
        description:
          "Release-month source-gap findings need the audited speed, headway, and schedule surfaces to distinguish missing evidence from clean evidence.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: null,
        missingDataState: "low_coverage",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Segment-speed coverage is audited before source_gap can classify speed gaps or clean speed evidence.",
        failureState: "missing_speed",
      },
      {
        surfaceId: "observed_headways",
        required: true,
        expectation:
          "Observed headway summaries are audited before source_gap can classify GTFS-RT sample gaps.",
        failureState: "insufficient_gtfs_rt_samples",
      },
      {
        surfaceId: "gtfs_schedule_runtime",
        required: true,
        expectation:
          "Schedule timepoint baselines are audited before source_gap can classify missing scheduled headway baselines.",
        failureState: "missing_scheduled_baseline",
      },
    ],
    validationExpectation:
      "Treat source_gap as a coverage authority only for audited surfaces; context joins, bus-lane date sentinels, source lag, and validator errors remain release-run checks until direct readiness surfaces exist.",
  },
  {
    detectorId: PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
    detectorName: "Persistent speed hotspot",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, ROUTE_VERSION_BREAK],
    minimumHistoryGates: [
      {
        gateId: "persistent_hotspot_release_observation_support",
        description:
          "Release segment candidates need enough segment-speed observations to avoid single-window hotspot claims.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 10,
        missingDataState: "insufficient_speed_observations",
      },
      {
        gateId: "persistent_hotspot_history_support",
        description:
          "Persistence and threshold calibration need enough complete segment-speed months to separate recurring slow segments from one-month volatility.",
        minimumCompleteMonths: 8,
        minimumCoverageShare: 0.75,
        minimumObservations: null,
        missingDataState: "insufficient_speed_observations",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Route segment speed months are present and not thin for the release and lookback windows used by persistent hotspots.",
        failureState: "insufficient_speed_observations",
      },
    ],
    validationExpectation:
      "Backtest legacy hotspot scores against reviewed segment candidates before changing thresholds; keep claims segment-scoped and descriptive.",
  },
  {
    detectorId: MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
    detectorName: "Multi-month speed peer",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, ROUTE_VERSION_BREAK],
    minimumHistoryGates: [
      {
        gateId: "multi_month_peer_history_support",
        description:
          "Peer-speed comparisons need multiple complete months of route speed history before route-level peer deficits are scored.",
        minimumCompleteMonths: 8,
        minimumCoverageShare: 0.75,
        minimumObservations: 100,
        missingDataState: "insufficient_trend_months",
      },
      {
        gateId: "multi_month_peer_current_month_support",
        description:
          "The release month must be present so historical peer deficits are not promoted without a current signal.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 100,
        missingDataState: "missing_current_trend_month",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Route segment speed history is complete enough to build route-month speed observations and matched peer medians.",
        failureState: "insufficient_trend_months",
      },
    ],
    validationExpectation:
      "Compare matched-peer deficit flags to reviewed route-level speed findings; peer gaps stay descriptive/associational and do not imply cause.",
  },
  {
    detectorId: OBSERVED_RELIABILITY_DETECTOR_ID,
    detectorName: "Observed reliability",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, SERVICE_PERIOD_BREAK],
    minimumHistoryGates: [
      {
        gateId: "observed_reliability_gtfs_rt_support",
        description:
          "Release route-month reliability rows need enough observed GTFS-RT headway samples.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 100,
        missingDataState: "insufficient_gtfs_rt_samples",
      },
      {
        gateId: "observed_reliability_schedule_support",
        description:
          "Observed reliability needs a scheduled headway baseline for the release route-month.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 1,
        missingDataState: "missing_scheduled_baseline",
      },
      {
        gateId: "observed_reliability_bwa_support",
        description:
          "Bus Wait Assessment support must exist before route-month reliability candidates use BWA corroboration.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 1,
        missingDataState: "missing_bus_wait_assessment",
      },
      {
        gateId: "observed_reliability_history_support",
        description:
          "Threshold calibration needs enough observed reliability months before route-month cutoffs move.",
        minimumCompleteMonths: 8,
        minimumCoverageShare: 0.75,
        minimumObservations: null,
        missingDataState: "insufficient_gtfs_rt_samples",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "observed_headways",
        required: true,
        expectation:
          "Observed reliability summaries are present and not thin across release and lookback months.",
        failureState: "insufficient_gtfs_rt_samples",
      },
      {
        surfaceId: "gtfs_schedule_runtime",
        required: true,
        expectation:
          "Schedule timepoint baselines are present for months used by route-month reliability summaries.",
        failureState: "missing_scheduled_baseline",
      },
      {
        surfaceId: "bus_wait_assessment",
        required: true,
        expectation:
          "Bus Wait Assessment route-period rows are present before BWA corroboration can support observed_reliability candidates.",
        failureState: "missing_bus_wait_assessment",
      },
    ],
    validationExpectation:
      "Backtest route-month long-gap and wait-ratio thresholds against reviewed reliability packets; no automated cause language is allowed.",
  },
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
    detectorId: BUNCHING_HOTSPOTS_DETECTOR_ID,
    detectorName: "Bunching hotspots",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, SERVICE_PERIOD_BREAK],
    minimumHistoryGates: [
      {
        gateId: "bunching_release_pair_support",
        description:
          "Release stop-direction-hour cells need enough observed headway pairs to compute bunching and long-gap shares.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 20,
        missingDataState: "insufficient_headway_pairs",
      },
      {
        gateId: "bunching_schedule_baseline_support",
        description:
          "Bunching ratios require a scheduled headway baseline for the analyzed service period.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 1,
        missingDataState: "baseline_unavailable",
      },
      {
        gateId: "bunching_history_threshold_support",
        description:
          "Threshold calibration needs enough complete headway-history months before bunching-share cutoffs move.",
        minimumCompleteMonths: 8,
        minimumCoverageShare: 0.8,
        minimumObservations: null,
        missingDataState: "low_coverage",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "observed_headways",
        required: true,
        expectation:
          "Observed headway summaries are present before stop-direction-hour bunching features can be calibrated.",
        failureState: "insufficient_headway_pairs",
      },
      {
        surfaceId: "gtfs_schedule_runtime",
        required: true,
        expectation:
          "Schedule timepoint baselines are present before headway-ratio bunching or gap claims are scored.",
        failureState: "baseline_unavailable",
      },
    ],
    validationExpectation:
      "Backtest bunching and long-gap shares against reviewed stop-hour packets; keep the claim descriptive and expose low coverage or stale-feed states instead of treating missing headways as clean.",
  },
  {
    detectorId: RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
    detectorName: "Rider-weighted excess wait",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, SERVICE_PERIOD_BREAK],
    minimumHistoryGates: [
      {
        gateId: "rider_weighted_ewt_release_headway_support",
        description:
          "Release exposure rows need enough observed headways to compute excess wait before ridership weighting.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 10,
        missingDataState: "insufficient_headways",
      },
      {
        gateId: "rider_weighted_ewt_schedule_support",
        description:
          "Rider-weighted EWT needs a scheduled wait/headway baseline before wait minutes can be interpreted.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 1,
        missingDataState: "missing_excess_wait",
      },
      {
        gateId: "rider_weighted_ewt_ridership_proxy_support",
        description:
          "Boarding/APC or route-hourly-ridership weights must be present before rider-minute exposure can be scored.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 1,
        missingDataState: "ridership_proxy_unavailable",
      },
      {
        gateId: "rider_weighted_ewt_history_support",
        description:
          "Exposure percentile calibration should use enough complete headway and ridership months before thresholds move.",
        minimumCompleteMonths: 8,
        minimumCoverageShare: 0.75,
        minimumObservations: null,
        missingDataState: "low_coverage",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "observed_headways",
        required: true,
        expectation:
          "Observed headway coverage is present before excess-wait minutes can be rider-weighted.",
        failureState: "insufficient_headways",
      },
      {
        surfaceId: "gtfs_schedule_runtime",
        required: true,
        expectation:
          "Schedule baselines are present before excess-wait minutes can be derived.",
        failureState: "missing_excess_wait",
      },
      {
        surfaceId: "route_hourly_ridership",
        required: true,
        expectation:
          "Hourly ridership or APC proxy coverage is present before rider-minute exposure can support an associational candidate.",
        failureState: "ridership_proxy_unavailable",
      },
    ],
    validationExpectation:
      "Treat rider-weighted EWT as exposure ranking, not cause attribution; reviewer confirmation of ridership proxy suitability remains required before publication.",
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
    detectorId: TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
    detectorName: "Travel time variability",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "lookback36", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, ROUTE_VERSION_BREAK],
    minimumHistoryGates: [
      {
        gateId: "travel_time_variability_release_trip_support",
        description:
          "Release route-direction-daypart cells need enough observed trips for stable P50/P95 runtime and buffer-index estimates.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 30,
        missingDataState: "insufficient_runtime_observations",
      },
      {
        gateId: "travel_time_variability_metric_support",
        description:
          "Runtime P50/P95 metrics must be available and internally consistent before variability is scored.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.8,
        minimumObservations: 1,
        missingDataState: "missing_runtime_metric",
      },
      {
        gateId: "travel_time_variability_history_support",
        description:
          "Buffer-index thresholds need enough complete runtime-history months to separate recurring variability from isolated incident months.",
        minimumCompleteMonths: 12,
        minimumCoverageShare: 0.75,
        minimumObservations: null,
        missingDataState: "low_coverage",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Observed segment speed/runtime history is complete enough to materialize route-direction-daypart P50/P95 runtime features.",
        failureState: "insufficient_runtime_observations",
      },
    ],
    validationExpectation:
      "Backtest buffer-index outliers against reviewed route-direction-daypart packets; variability is a descriptive operations signal and does not identify cause.",
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
    detectorId: POSITIVE_DEVIANCE_DETECTOR_ID,
    detectorName: "Positive deviance",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "lookback36", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, ROUTE_VERSION_BREAK],
    minimumHistoryGates: [
      {
        gateId: "positive_deviance_peer_support",
        description:
          "Peer-adjusted positive-deviance features need enough eligible peers before top-decile performance is scored.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 8,
        missingDataState: "insufficient_peers",
      },
      {
        gateId: "positive_deviance_stability_support",
        description:
          "Learning candidates need repeated qualifying periods and enough history to avoid one-period best-practice claims.",
        minimumCompleteMonths: 8,
        minimumCoverageShare: 0.75,
        minimumObservations: 2,
        missingDataState: "insufficient_positive_periods",
      },
      {
        gateId: "positive_deviance_reciprocal_metric_support",
        description:
          "Reciprocal metric warnings must be evaluated so a route is not praised on one metric while failing a paired reliability or speed check.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 1,
        missingDataState: "reciprocal_metric_warning",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Speed/runtime history is present before speed- or pace-based positive-deviance peer residuals are materialized.",
        failureState: "insufficient_positive_periods",
      },
      {
        surfaceId: "route_hourly_ridership",
        required: false,
        expectation:
          "Hourly ridership can support exposure covariates and reciprocal rider-impact checks when a positive-deviance materializer uses them.",
        failureState: "low_coverage",
      },
    ],
    validationExpectation:
      "Readiness covers only audited speed and optional ridership surfaces; peer construction, covariates, and reciprocal warnings remain materializer/reviewer gates, and findings stay descriptive learning candidates.",
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
  {
    detectorId: INTERVENTION_GAP_DETECTOR_ID,
    detectorName: "Intervention gap",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "prePostInterventionWindow"],
    seasonalityRules: [ROUTE_VERSION_BREAK, ADJACENT_MONTH_GUARD],
    minimumHistoryGates: [
      {
        gateId: "intervention_gap_pain_signal_support",
        description:
          "A release route needs at least one audited speed or observed-reliability pain signal before missing-treatment evidence can be interpreted.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 1,
        missingDataState: "missing_pain_signal",
      },
      {
        gateId: "intervention_gap_inventory_support",
        description:
          "Treatment-gap claims need enough intervention inventory/comparison history to avoid confusing source gaps with absence of treatment.",
        minimumCompleteMonths: 12,
        minimumCoverageShare: 0.75,
        minimumObservations: 1,
        missingDataState: "thin_source_gap",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Current and historical speed pain signals are present before a no-treatment evidence gap can be screened.",
        failureState: "missing_pain_signal",
      },
      {
        surfaceId: "intervention_comparisons",
        required: true,
        expectation:
          "Intervention inventory/comparison rows exist before the detector can distinguish absent treatment evidence from thin source coverage.",
        failureState: "thin_source_gap",
      },
      {
        surfaceId: "observed_headways",
        required: false,
        expectation:
          "Observed reliability pain can strengthen the route pain screen when the headway surface is available.",
        failureState: "missing_pain_signal",
      },
    ],
    validationExpectation:
      "Publish only as an evidence-gap screen; absent local intervention rows are not proof no treatment exists, and future-only or undated intervention records must stay visible.",
  },
  {
    detectorId: INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
    detectorName: "Intervention underperformance",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "prePostInterventionWindow", "lookback36"],
    seasonalityRules: [CONTROL_PRETREND, ROUTE_VERSION_BREAK, SAME_MONTH_PRIOR_YEAR],
    minimumHistoryGates: [
      {
        gateId: "intervention_underperformance_pain_signal_support",
        description:
          "Underperformance screens need a current speed pain signal before evaluating treatment comparison rows.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 100,
        missingDataState: "missing_pain_signal",
      },
      {
        gateId: "intervention_underperformance_comparison_support",
        description:
          "Evaluated intervention comparisons need enough pre/post history and comparison-route support before non-positive deltas are scored.",
        minimumCompleteMonths: 12,
        minimumCoverageShare: 0.75,
        minimumObservations: 1,
        missingDataState: "missing_evaluated_intervention",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Speed pain and treated-route performance history are present across the comparison windows.",
        failureState: "missing_pain_signal",
      },
      {
        surfaceId: "intervention_comparisons",
        required: true,
        expectation:
          "Evaluated intervention comparison rows exist before underperformance candidates can be screened.",
        failureState: "missing_evaluated_intervention",
      },
      {
        surfaceId: "observed_headways",
        required: false,
        expectation:
          "Observed reliability pain remains supporting context and does not replace evaluated speed comparisons.",
        failureState: "missing_pain_signal",
      },
    ],
    validationExpectation:
      "Keep underperformance associational: peer-adjusted deltas require review for window choice, controls, and route changes before any effect language.",
  },
  {
    detectorId: TREATMENT_SCOPE_MISMATCH_DETECTOR_ID,
    detectorName: "Treatment scope mismatch",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "prePostInterventionWindow"],
    seasonalityRules: [ROUTE_VERSION_BREAK, CONTROL_PRETREND],
    minimumHistoryGates: [
      {
        gateId: "treatment_scope_mismatch_speed_support",
        description:
          "Slow treated-segment screens need current segment-speed support before bus-lane context can be interpreted.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 50,
        missingDataState: "insufficient_speed_observations",
      },
      {
        gateId: "treatment_scope_mismatch_geometry_support",
        description:
          "Segment-scope treatment review needs a route-shape bus-lane overlap row with enough overlap share.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 1,
        missingDataState: "spatial_join_uncertain",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Current segment-speed summaries exist for bus-lane-overlap route segments.",
        failureState: "insufficient_speed_observations",
      },
      {
        surfaceId: "intervention_comparisons",
        required: false,
        expectation:
          "Peer or before/after comparisons should be attached before any underperformance language.",
        failureState: "no_counterfactual",
      },
    ],
    validationExpectation:
      "Keep scope-mismatch candidates segment-scoped and review-only until peer/daypart or before/after baselines show whether the treatment actually underperformed.",
  },
  {
    detectorId: TREATMENT_SCOPE_GAP_DETECTOR_ID,
    detectorName: "Treatment scope gap",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "prePostInterventionWindow"],
    seasonalityRules: [ROUTE_VERSION_BREAK, CONTROL_PRETREND],
    minimumHistoryGates: [
      {
        gateId: "treatment_scope_gap_speed_support",
        description:
          "Scope-gap screens need current segment-speed support before uncovered treatment context can be interpreted.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 50,
        missingDataState: "insufficient_speed_observations",
      },
      {
        gateId: "treatment_scope_gap_route_treatment_support",
        description:
          "A route must have positive bus-lane treatment evidence before uncovered slow segments can be reviewed as possible scope gaps.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 1,
        missingDataState: "treatment_segment_gap",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Current segment-speed summaries exist for treated routes across all candidate route segments.",
        failureState: "insufficient_speed_observations",
      },
      {
        surfaceId: "intervention_comparisons",
        required: false,
        expectation:
          "Peer or before/after comparisons should be attached before any treatment-effect language.",
        failureState: "no_counterfactual",
      },
    ],
    validationExpectation:
      "Keep scope-gap candidates as geometry/source-review prompts: a weak public overlap can mean missing inventory, intentional treatment scope, or a real uncovered bottleneck.",
  },
  {
    detectorId: PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
    detectorName: "Permit-correlated slowdown",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, ROUTE_VERSION_BREAK],
    minimumHistoryGates: [
      {
        gateId: "permit_slowdown_speed_signal_support",
        description:
          "Permit-context candidates need enough route-month speed observations before context touches are considered.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 100,
        missingDataState: "insufficient_speed_observations",
      },
      {
        gateId: "permit_slowdown_route_touch_support",
        description:
          "DOT permit route-touch rows must be materialized with usable joins before permit context can support an associational candidate.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 25,
        missingDataState: "insufficient_permit_touches",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Route-month speed signals are present before permit context can be evaluated.",
        failureState: "insufficient_speed_observations",
      },
      {
        surfaceId: "dot_permit_route_touches",
        required: true,
        expectation:
          "DOT permit route-touch bridge rows exist for the release/history window and carry join health through review packets.",
        failureState: "insufficient_permit_touches",
      },
    ],
    validationExpectation:
      "Permit findings remain context-only association screens; permit touches, work type, fanout, and match weight must be reviewed before promotion and never imply causation by themselves.",
  },
  {
    detectorId: SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
    detectorName: "Service-request context",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "seasonalPeerWindow"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, ROUTE_VERSION_BREAK],
    minimumHistoryGates: [
      {
        gateId: "service_request_context_speed_signal_support",
        description:
          "311 context candidates need enough route-month speed observations before complaint context is considered.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 100,
        missingDataState: "insufficient_speed_observations",
      },
      {
        gateId: "service_request_context_route_touch_support",
        description:
          "311 route-touch rows need enough joined service-request context and confidence support before context candidates are scored.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 25,
        missingDataState: "insufficient_service_request_context",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Route-month speed signals are present before 311 context can be evaluated.",
        failureState: "insufficient_speed_observations",
      },
      {
        surfaceId: "service_request_route_touches",
        required: true,
        expectation:
          "311 service-request route-touch bridge rows exist for the release/history window and expose match-weight/fanout caveats.",
        failureState: "insufficient_service_request_context",
      },
    ],
    validationExpectation:
      "311 context remains an associational caveat with reporting-bias limits; route-touch volume can corroborate context but cannot identify operational cause.",
  },
  {
    detectorId: DELAY_CONCENTRATION_DETECTOR_ID,
    detectorName: "Delay concentration",
    releaseOutputWindow: "releaseMonth",
    baselineWindowIds: ["releaseMonth", "lookback12", "lookback36"],
    seasonalityRules: [SAME_MONTH_PRIOR_YEAR, ADJACENT_MONTH_GUARD, ROUTE_VERSION_BREAK],
    minimumHistoryGates: [
      {
        gateId: "delay_concentration_release_segment_support",
        description:
          "Release route concentration needs enough clean segment-speed observations and enough eligible segments.",
        minimumCompleteMonths: 1,
        minimumCoverageShare: 0.75,
        minimumObservations: 10,
        missingDataState: "insufficient_speed_observations",
      },
      {
        gateId: "delay_concentration_distribution_support",
        description:
          "Fleet-distribution thresholds need enough complete segment-speed months to keep concentration outliers stable.",
        minimumCompleteMonths: 12,
        minimumCoverageShare: 0.75,
        minimumObservations: null,
        missingDataState: "insufficient_speed_observations",
      },
    ],
    postBackfillValidation: [
      {
        surfaceId: "route_segment_speeds",
        required: true,
        expectation:
          "Route segment speed history is present and not thin before delay concentration can benchmark route-level Gini and excess-delay distributions.",
        failureState: "insufficient_speed_observations",
      },
    ],
    validationExpectation:
      "Backtest concentration outliers against reviewed route packets; concentration locates delay distribution and must not be promoted as a causal explanation.",
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
