import {
  DEFAULT_DEGRADATION_TREND_THRESHOLDS,
  DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS,
  DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS,
  DEGRADATION_TREND_DETECTOR_ID,
  detectDegradationTrends,
  detectScheduleMismatch,
  detectTravelTimeVariability,
  SCHEDULE_MISMATCH_DETECTOR_ID,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
} from "@bp/analytics";
import {
  buildRouteDirectionDaypartFeatures,
  buildRouteMetricHistoryFeatures,
  type ObservedRuntimeSourceRow,
  type RouteMetricHistorySourceRow,
  type ScheduledRuntimeSourceRow,
} from "../feature-resolvers";

export type RuntimeTrendScoreVectorMonth = {
  month: string;
  featureCount: number;
  candidateCount: number;
  hitCount: number;
  cleanNoHitCount: number;
  skippedCount: number;
  medianCandidateScore: number | null;
  p95CandidateScore: number | null;
  inputSummary: Record<string, unknown>;
};

export type RuntimeTrendDetectorScoreVector = {
  detectorId:
    | typeof SCHEDULE_MISMATCH_DETECTOR_ID
    | typeof TRAVEL_TIME_VARIABILITY_DETECTOR_ID
    | typeof DEGRADATION_TREND_DETECTOR_ID;
  sourceKind: "detector_native_historical_feature_vectors";
  vectorGrain: "route_direction_daypart_month" | "route_metric_history_month";
  summary: {
    usableMonthCount: number;
    totalFeatureCount: number;
    totalCandidateCount: number;
    totalSkippedCount: number;
    routeCount: number;
    releaseFeatureCount: number;
    releaseCandidateCount: number;
    releaseSkippedCount: number;
  };
  monthly: RuntimeTrendScoreVectorMonth[];
  releaseTopCandidates: Array<{
    candidateId: string;
    routeId: string | null;
    scopeId: string;
    detectorScore: number;
    claimText: string;
  }>;
};

export type RuntimeTrendScoreVectorArtifact = {
  artifactKind: "runtime_trend_detector_score_vectors";
  schemaVersion: 1;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  window: {
    startMonth: string;
    endMonth: string;
  };
  source: {
    runtimeTableName: "local_route_segment_speed";
    scheduleTableName: "local_route_schedule_stop";
    trendTableName: "local_route_month_trend";
    caveat: string;
  };
  summary: {
    detectorCount: number;
    usableMonthCount: number;
    totalFeatureCount: number;
    totalCandidateCount: number;
    releaseFeatureCount: number;
    releaseCandidateCount: number;
  };
  detectors: RuntimeTrendDetectorScoreVector[];
};

function percentile(values: readonly number[], percentileValue: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined) return null;
  if (upper === undefined || lowerIndex === upperIndex) return Math.round(lower * 10) / 10;
  return Math.round((lower + (upper - lower) * (position - lowerIndex)) * 10) / 10;
}

function outputMonth(input: {
  month: string;
  featureCount: number;
  inputSummary: Record<string, unknown>;
  output: {
    candidates: Array<{ detectorScore: number }>;
    coverage: Array<{ outcome: string }>;
  };
}): RuntimeTrendScoreVectorMonth {
  const scores = input.output.candidates.map((candidate) => candidate.detectorScore);
  return {
    month: input.month,
    featureCount: input.featureCount,
    candidateCount: input.output.candidates.length,
    hitCount: input.output.coverage.filter((row) => row.outcome === "hit").length,
    cleanNoHitCount: input.output.coverage.filter((row) => row.outcome === "clean_no_hit").length,
    skippedCount: input.output.coverage.filter((row) => row.outcome.startsWith("skipped")).length,
    medianCandidateScore: percentile(scores, 0.5),
    p95CandidateScore: percentile(scores, 0.95),
    inputSummary: input.inputSummary,
  };
}

function summarizeDetector(input: {
  detectorId: RuntimeTrendDetectorScoreVector["detectorId"];
  vectorGrain: RuntimeTrendDetectorScoreVector["vectorGrain"];
  monthly: RuntimeTrendScoreVectorMonth[];
  routeCount: number;
  releaseMonth: string;
  releaseTopCandidates: RuntimeTrendDetectorScoreVector["releaseTopCandidates"];
}): RuntimeTrendDetectorScoreVector {
  const release = input.monthly.find((month) => month.month === input.releaseMonth);
  return {
    detectorId: input.detectorId,
    sourceKind: "detector_native_historical_feature_vectors",
    vectorGrain: input.vectorGrain,
    summary: {
      usableMonthCount: input.monthly.filter((month) => month.featureCount > 0).length,
      totalFeatureCount: input.monthly.reduce((sum, month) => sum + month.featureCount, 0),
      totalCandidateCount: input.monthly.reduce((sum, month) => sum + month.candidateCount, 0),
      totalSkippedCount: input.monthly.reduce((sum, month) => sum + month.skippedCount, 0),
      routeCount: input.routeCount,
      releaseFeatureCount: release?.featureCount ?? 0,
      releaseCandidateCount: release?.candidateCount ?? 0,
      releaseSkippedCount: release?.skippedCount ?? 0,
    },
    monthly: input.monthly,
    releaseTopCandidates: input.releaseTopCandidates,
  };
}

function topCandidates(
  candidates: Array<{
    candidateId: string;
    routeId: string | null;
    scopeId: string;
    detectorScore: number;
    claimText: string;
  }>,
): RuntimeTrendDetectorScoreVector["releaseTopCandidates"] {
  return candidates.slice(0, 25).map((candidate) => ({
    candidateId: candidate.candidateId,
    routeId: candidate.routeId,
    scopeId: candidate.scopeId,
    detectorScore: candidate.detectorScore,
    claimText: candidate.claimText,
  }));
}

export function buildRuntimeTrendScoreVectorArtifact(input: {
  months: readonly string[];
  scheduledRowsByYear: ReadonlyMap<number, readonly ScheduledRuntimeSourceRow[]>;
  observedRowsByMonth: ReadonlyMap<string, readonly ObservedRuntimeSourceRow[]>;
  routeMetricHistoryRows: readonly RouteMetricHistorySourceRow[];
  startMonth: string;
  endMonth: string;
  releaseMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  candidateLimit?: number;
}): RuntimeTrendScoreVectorArtifact {
  const scheduleMismatchMonthly: RuntimeTrendScoreVectorMonth[] = [];
  const travelTimeMonthly: RuntimeTrendScoreVectorMonth[] = [];
  const degradationMonthly: RuntimeTrendScoreVectorMonth[] = [];
  const routeIds = new Set<string>();
  let scheduleReleaseTop: RuntimeTrendDetectorScoreVector["releaseTopCandidates"] = [];
  let travelReleaseTop: RuntimeTrendDetectorScoreVector["releaseTopCandidates"] = [];
  let degradationReleaseTop: RuntimeTrendDetectorScoreVector["releaseTopCandidates"] = [];

  for (const month of input.months) {
    const year = Number(month.slice(0, 4));
    const runtime = buildRouteDirectionDaypartFeatures({
      observedRows: input.observedRowsByMonth.get(month) ?? [],
      scheduledRows: input.scheduledRowsByYear.get(year) ?? [],
      minObservedTrips: Math.min(
        DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS.minObservedTrips,
        DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS.minObservedTrips,
      ),
    });
    for (const feature of runtime.features) routeIds.add(feature.routeId);

    const scheduleOutput = detectScheduleMismatch({
      detectorRunId: `${SCHEDULE_MISMATCH_DETECTOR_ID}-${month}-score-vector`,
      month,
      generatedAt: input.generatedAt,
      features: runtime.features,
      thresholds: {
        candidateLimit:
          input.candidateLimit ?? DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS.candidateLimit,
      },
    });
    const travelOutput = detectTravelTimeVariability({
      detectorRunId: `${TRAVEL_TIME_VARIABILITY_DETECTOR_ID}-${month}-score-vector`,
      month,
      generatedAt: input.generatedAt,
      features: runtime.features,
      thresholds: {
        candidateLimit:
          input.candidateLimit ?? DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS.candidateLimit,
      },
    });
    scheduleMismatchMonthly.push(
      outputMonth({
        month,
        featureCount: runtime.features.length,
        inputSummary: runtime.summary,
        output: scheduleOutput,
      }),
    );
    travelTimeMonthly.push(
      outputMonth({
        month,
        featureCount: runtime.features.length,
        inputSummary: runtime.summary,
        output: travelOutput,
      }),
    );
    if (month === input.releaseMonth) {
      scheduleReleaseTop = topCandidates(scheduleOutput.candidates);
      travelReleaseTop = topCandidates(travelOutput.candidates);
    }

    const history = buildRouteMetricHistoryFeatures({
      rows: input.routeMetricHistoryRows.filter(
        (row) => typeof row.month === "string" && row.month >= input.startMonth && row.month <= month,
      ),
      releaseMonth: month,
      historyStartMonth: input.startMonth,
      minHistoryPoints: DEFAULT_DEGRADATION_TREND_THRESHOLDS.minHistoryPoints,
    });
    for (const feature of history.features) routeIds.add(feature.scopeId);
    const degradationOutput = detectDegradationTrends({
      detectorRunId: `${DEGRADATION_TREND_DETECTOR_ID}-${month}-score-vector`,
      month,
      generatedAt: input.generatedAt,
      features: history.features,
      thresholds: {
        candidateLimit: input.candidateLimit ?? DEFAULT_DEGRADATION_TREND_THRESHOLDS.candidateLimit,
      },
    });
    degradationMonthly.push(
      outputMonth({
        month,
        featureCount: history.features.length,
        inputSummary: history.summary,
        output: degradationOutput,
      }),
    );
    if (month === input.releaseMonth) {
      degradationReleaseTop = topCandidates(degradationOutput.candidates);
    }
  }

  const detectors: RuntimeTrendDetectorScoreVector[] = [
    summarizeDetector({
      detectorId: SCHEDULE_MISMATCH_DETECTOR_ID,
      vectorGrain: "route_direction_daypart_month",
      monthly: scheduleMismatchMonthly,
      routeCount: routeIds.size,
      releaseMonth: input.releaseMonth,
      releaseTopCandidates: scheduleReleaseTop,
    }),
    summarizeDetector({
      detectorId: TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
      vectorGrain: "route_direction_daypart_month",
      monthly: travelTimeMonthly,
      routeCount: routeIds.size,
      releaseMonth: input.releaseMonth,
      releaseTopCandidates: travelReleaseTop,
    }),
    summarizeDetector({
      detectorId: DEGRADATION_TREND_DETECTOR_ID,
      vectorGrain: "route_metric_history_month",
      monthly: degradationMonthly,
      routeCount: routeIds.size,
      releaseMonth: input.releaseMonth,
      releaseTopCandidates: degradationReleaseTop,
    }),
  ];
  const release = detectors.map((detector) => detector.summary);
  return {
    artifactKind: "runtime_trend_detector_score_vectors",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    window: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    },
    source: {
      runtimeTableName: "local_route_segment_speed",
      scheduleTableName: "local_route_schedule_stop",
      trendTableName: "local_route_month_trend",
      caveat:
        "These are detector-native historical vectors: schedule/runtime detectors use route-direction-daypart features; trend uses route metric history. They are calibration surfaces, not public findings.",
    },
    summary: {
      detectorCount: detectors.length,
      usableMonthCount: Math.max(...detectors.map((detector) => detector.summary.usableMonthCount)),
      totalFeatureCount: detectors.reduce(
        (sum, detector) => sum + detector.summary.totalFeatureCount,
        0,
      ),
      totalCandidateCount: detectors.reduce(
        (sum, detector) => sum + detector.summary.totalCandidateCount,
        0,
      ),
      releaseFeatureCount: release.reduce((sum, summary) => sum + summary.releaseFeatureCount, 0),
      releaseCandidateCount: release.reduce(
        (sum, summary) => sum + summary.releaseCandidateCount,
        0,
      ),
    },
    detectors,
  };
}
