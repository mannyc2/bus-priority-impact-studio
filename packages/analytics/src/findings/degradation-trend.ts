import {
  DetectorIdSchema,
  DetectorRunIdSchema,
  type FindingCandidate,
  FindingCandidateSchema,
  type FindingCoverageAudit,
  type FindingEvidenceLink,
  FindingReasonCodeSchema,
  IsoMonthSchema,
  RouteIdSchema,
} from "@bp/domain";
import { robustZScore, theilSenSlope } from "../baselines/history.js";
import { buildCoverageAudit } from "../core/coverage.js";
import { buildEvidenceLink } from "../core/evidence.js";
import { stableId } from "../core/ids.js";
import { clamp, mergeThresholds, round } from "../core/numbers.js";
import { severityFromScore } from "../core/scoring.js";
import {
  type RouteMetricHistoryFeature,
  type RouteMetricHistoryPoint,
  routeMetricHistoryFeatureKey,
} from "../features/route-metric-history.js";
import { confidenceFromFeatureQuality, featureQualitySkipReason } from "./feature-quality.js";

export const DEGRADATION_TREND_DETECTOR_ID = "degradation_trend";

export type TrendMetricDirection = "higher_is_worse" | "lower_is_worse";

export type DegradationTrendThresholds = {
  minHistoryPoints: number;
  minPriorBaselinePoints: number;
  minRobustZ: number;
  minPositiveSlope: number;
  highConfidenceHistoryPoints: number;
  defaultMetricDirection: TrendMetricDirection;
  metricDirections: Record<string, TrendMetricDirection>;
  candidateLimit: number;
};

export const DEFAULT_DEGRADATION_TREND_METRIC_DIRECTIONS: Record<
  string,
  TrendMetricDirection
> = {
  average_speed_mph: "lower_is_worse",
  buffer_index: "higher_is_worse",
  excess_wait_minutes: "higher_is_worse",
  slowness_index: "higher_is_worse",
  travel_time_minutes: "higher_is_worse",
};

export const DEFAULT_DEGRADATION_TREND_THRESHOLDS: DegradationTrendThresholds = {
  minHistoryPoints: 8,
  minPriorBaselinePoints: 6,
  minRobustZ: 3,
  minPositiveSlope: 0,
  highConfidenceHistoryPoints: 12,
  defaultMetricDirection: "higher_is_worse",
  metricDirections: DEFAULT_DEGRADATION_TREND_METRIC_DIRECTIONS,
  candidateLimit: 100,
};

export type DegradationTrendDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<RouteMetricHistoryFeature>;
  thresholds?: Partial<DegradationTrendThresholds>;
};

export type DegradationTrendDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type ScoredPoint = RouteMetricHistoryPoint & {
  worseOrientedValue: number;
};

type SkippedFeature = {
  reasonCode: string;
  reason: string;
};

type EvaluatedFeature = {
  feature: RouteMetricHistoryFeature;
  featureKey: string;
  direction: TrendMetricDirection;
  current: ScoredPoint;
  priorValues: number[];
  allValues: number[];
  robustZ: number;
  baselineMedian: number;
  baselineMad: number;
  slope: number;
  detectorScore: number;
};

function metricDirection(
  feature: RouteMetricHistoryFeature,
  thresholds: DegradationTrendThresholds,
): TrendMetricDirection {
  return thresholds.metricDirections[feature.metricName] ?? thresholds.defaultMetricDirection;
}

function worseOrientedValue(value: number, direction: TrendMetricDirection): number {
  return direction === "higher_is_worse" ? value : -value;
}

function finitePoints(
  feature: RouteMetricHistoryFeature,
  direction: TrendMetricDirection,
): ScoredPoint[] {
  return [...feature.points]
    .filter(
      (point) =>
        point.value !== null &&
        Number.isFinite(point.value) &&
        point.coverageStatus !== "missing" &&
        point.coverageStatus !== "low_coverage",
    )
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((point) => ({
      ...point,
      worseOrientedValue: worseOrientedValue(point.value as number, direction),
    }));
}

function skipReason(
  feature: RouteMetricHistoryFeature,
  month: string,
  thresholds: DegradationTrendThresholds,
): SkippedFeature | null {
  const qualitySkip = featureQualitySkipReason(feature.quality, "insufficient_history");
  if (qualitySkip !== null) return qualitySkip;

  if (feature.routeVersionBreaks.length > 0) {
    return {
      reasonCode: "series_break_versioned",
      reason: "Route or scope version breaks are present in the trend window.",
    };
  }

  const direction = metricDirection(feature, thresholds);
  const points = finitePoints(feature, direction);
  if (points.length < thresholds.minHistoryPoints) {
    return {
      reasonCode: "insufficient_history",
      reason: "Not enough supported metric-history points are available for trend scoring.",
    };
  }

  const currentIndex = points.findIndex((point) => point.month === month);
  if (currentIndex < 0) {
    return {
      reasonCode: "missing_current_history_point",
      reason: "The detector month is missing from the metric-history feature.",
    };
  }

  if (currentIndex < thresholds.minPriorBaselinePoints) {
    return {
      reasonCode: "insufficient_history",
      reason: "Not enough prior supported history points are available for the current month.",
    };
  }

  const priorValues = points.slice(0, currentIndex).map((point) => point.worseOrientedValue);
  if (robustZScore(points[currentIndex]!.worseOrientedValue, priorValues).z === null) {
    return {
      reasonCode: "baseline_dispersion_unavailable",
      reason: "Prior history has no robust dispersion, so a z-score cannot be computed.",
    };
  }

  if (theilSenSlope(points.map((point) => point.worseOrientedValue)) === null) {
    return {
      reasonCode: "insufficient_history",
      reason: "Not enough supported metric-history points are available for a trend slope.",
    };
  }

  return null;
}

function evaluateFeature(
  feature: RouteMetricHistoryFeature,
  month: string,
  thresholds: DegradationTrendThresholds,
): EvaluatedFeature | null {
  const direction = metricDirection(feature, thresholds);
  const points = finitePoints(feature, direction);
  const currentIndex = points.findIndex((point) => point.month === month);
  if (currentIndex < 0) return null;

  const current = points[currentIndex]!;
  const priorValues = points.slice(0, currentIndex).map((point) => point.worseOrientedValue);
  const allValues = points.map((point) => point.worseOrientedValue);
  const z = robustZScore(current.worseOrientedValue, priorValues);
  const slope = theilSenSlope(allValues);
  if (z.z === null || slope === null) return null;
  if (z.z < thresholds.minRobustZ || slope <= thresholds.minPositiveSlope) return null;

  const zSignal = clamp((z.z - thresholds.minRobustZ) / thresholds.minRobustZ, 0, 1);
  const slopeDenominator = Math.max(Math.abs(z.median) * 0.1, 0.0001);
  const slopeSignal = clamp(slope / slopeDenominator, 0, 1);
  const detectorScore = Math.round(60 + 40 * (0.75 * zSignal + 0.25 * slopeSignal));

  return {
    feature,
    featureKey: routeMetricHistoryFeatureKey(feature),
    direction,
    current,
    priorValues,
    allValues,
    robustZ: z.z,
    baselineMedian: z.median,
    baselineMad: z.mad,
    slope,
    detectorScore,
  };
}

function routeIdForFeature(feature: RouteMetricHistoryFeature): string | null {
  if (feature.scopeKind !== "route") return null;
  return RouteIdSchema.parse(feature.scopeId);
}

function categoryForMetric(metricName: string): "reliability" | "speed" {
  return metricName.includes("speed") || metricName.includes("pace") ? "speed" : "reliability";
}

export function detectDegradationTrends(
  input: DegradationTrendDetectorInput,
): DegradationTrendDetectorOutput {
  const detectorId = DetectorIdSchema.parse(DEGRADATION_TREND_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("worsening_trend");
  const thresholds = mergeThresholds(DEFAULT_DEGRADATION_TREND_THRESHOLDS, input.thresholds);

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];
  const selected = new Map(
    input.features
      .filter((feature) => skipReason(feature, month, thresholds) === null)
      .map((feature) => evaluateFeature(feature, month, thresholds))
      .filter((feature): feature is EvaluatedFeature => feature !== null)
      .sort((left, right) => right.detectorScore - left.detectorScore)
      .slice(0, thresholds.candidateLimit)
      .map((feature) => [feature.featureKey, feature] as const),
  );

  for (const feature of input.features) {
    const featureKey = routeMetricHistoryFeatureKey(feature);
    const skip = skipReason(feature, month, thresholds);
    const hit = selected.get(featureKey);
    const routeId = routeIdForFeature(feature);

    if (skip === null && hit !== undefined) {
      const candidateId = stableId(detectorRunId, "candidate", featureKey, reasonCode);
      candidates.push(
        FindingCandidateSchema.parse({
          candidateId,
          detectorId,
          detectorRunId,
          month,
          scopeKind: feature.scopeKind,
          scopeId: feature.scopeId,
          routeId,
          physicalId: feature.scopeKind === "segment" ? feature.scopeId : null,
          category: categoryForMetric(feature.metricName),
          severity: severityFromScore(hit.detectorScore),
          confidence: confidenceFromFeatureQuality(
            feature.quality,
            hit.allValues.length,
            thresholds.highConfidenceHistoryPoints,
          ),
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `${feature.scopeKind} ${feature.scopeId} shows a worsening trend in ${feature.metricName} over ${feature.historyWindowMonths} months.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "trend"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: {
            scopeKind: feature.scopeKind,
            scopeId: feature.scopeId,
            metricName: feature.metricName,
            month,
            featureKey,
            claimStrengthTier: "associational",
            direction: hit.direction,
            currentValue: hit.current.value,
            baselineMedianWorseOriented: round(hit.baselineMedian, 4),
            baselineMadWorseOriented: round(hit.baselineMad, 4),
            robustZ: round(hit.robustZ, 4),
            theilSenSlopeWorseOriented: round(hit.slope, 4),
            supportedPointCount: hit.allValues.length,
            priorBaselinePointCount: hit.priorValues.length,
            points: finitePoints(feature, hit.direction).map((point) => ({
              month: point.month,
              value: point.value,
              coverageStatus: point.coverageStatus,
              routeVersion: point.routeVersion,
            })),
            thresholds: {
              ...thresholds,
              metricDirections: undefined,
            },
          },
          evidenceWeight: 1,
          note: null,
        }),
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "limits"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "counter_evidence",
          evidenceRef: {
            scopeKind: feature.scopeKind,
            scopeId: feature.scopeId,
            metricName: feature.metricName,
            quality: feature.quality,
            routeVersionBreaks: feature.routeVersionBreaks,
            counterEvidence: [
              "Trend evidence is associational and does not identify an external cause.",
              "Route redesigns, schedule changes, or source coverage changes can create artificial trends.",
              "Seasonality is not modeled by this detector beyond the provided history window.",
            ],
          },
          evidenceWeight: 0.5,
          note: "Review route-version stability, source coverage, and seasonality before promotion.",
        }),
      );
    }

    coverage.push(
      buildCoverageAudit({
        auditId: stableId(detectorRunId, "audit", featureKey),
        detectorRunId,
        detectorId,
        month,
        scopeKind: feature.scopeKind,
        scopeId: feature.scopeId,
        outcome:
          skip !== null ? "skipped_missing_input" : hit === undefined ? "clean_no_hit" : "hit",
        reasonCode: skip === null ? null : FindingReasonCodeSchema.parse(skip.reasonCode),
        reason: skip?.reason ?? null,
        inputsSeenJson: {
          scopeKind: feature.scopeKind,
          scopeId: feature.scopeId,
          metricName: feature.metricName,
          historyWindowMonths: feature.historyWindowMonths,
          supportedPointCount: finitePoints(feature, metricDirection(feature, thresholds)).length,
          routeVersionBreaks: feature.routeVersionBreaks,
          quality: feature.quality,
        },
        inputsExpectedJson: {
          currentMonth: month,
          minHistoryPoints: thresholds.minHistoryPoints,
          minPriorBaselinePoints: thresholds.minPriorBaselinePoints,
          minRobustZ: thresholds.minRobustZ,
          minPositiveSlope: thresholds.minPositiveSlope,
          routeVersionBreaks: "none",
          coverageStatus: "complete_or_partial",
          freshnessStatus: "fresh_or_not_expected",
        },
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
