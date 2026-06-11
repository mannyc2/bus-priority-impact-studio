import {
  DetectorIdSchema,
  DetectorRunIdSchema,
  type FindingCandidate,
  FindingCandidateSchema,
  type FindingCoverageAudit,
  type FindingEvidenceLink,
  FindingReasonCodeSchema,
} from "@bp/domain/findings";
import { IsoMonthSchema, RouteIdSchema } from "@bp/domain/primitives";
import { buildCoverageAudit } from "../core/coverage.js";
import { buildEvidenceLink } from "../core/evidence.js";
import { stableId } from "../core/ids.js";
import { clamp, mergeThresholds } from "../core/numbers.js";
import { severityFromScore } from "../core/scoring.js";
import {
  type PositiveDevianceFeature,
  type PositiveDeviancePeriodEvidence,
  positiveDevianceFeatureKey,
} from "../features/positive-deviance.js";
import { confidenceFromFeatureQuality, featureQualitySkipReason } from "./feature-quality.js";

export const POSITIVE_DEVIANCE_DETECTOR_ID = "positive_deviance";

export type PositiveDevianceThresholds = {
  minPeerCount: number;
  minStablePeriods: number;
  minPerformancePercentile: number;
  minAdjustedResidual: number;
  candidateLimit: number;
};

export const DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS: PositiveDevianceThresholds = {
  minPeerCount: 8,
  minStablePeriods: 2,
  minPerformancePercentile: 0.9,
  minAdjustedResidual: 0,
  candidateLimit: 100,
};

export type PositiveDevianceDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<PositiveDevianceFeature>;
  thresholds?: Partial<PositiveDevianceThresholds>;
};

export type PositiveDevianceDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type SkippedFeature = {
  reasonCode: string;
  reason: string;
};

type EvaluatedFeature = {
  feature: PositiveDevianceFeature;
  featureKey: string;
  qualifyingPeriods: PositiveDeviancePeriodEvidence[];
  detectorScore: number;
};

function periodQualifies(
  period: PositiveDeviancePeriodEvidence,
  thresholds: PositiveDevianceThresholds,
): boolean {
  return (
    period.value !== null &&
    period.performancePercentile !== null &&
    period.adjustedResidual !== null &&
    period.coverageStatus !== "missing" &&
    period.coverageStatus !== "low_coverage" &&
    period.reciprocalMetricWarnings.length === 0 &&
    period.performancePercentile >= thresholds.minPerformancePercentile &&
    period.adjustedResidual >= thresholds.minAdjustedResidual
  );
}

function reciprocalWarnings(feature: PositiveDevianceFeature): string[] {
  return [...new Set(feature.periods.flatMap((period) => period.reciprocalMetricWarnings))].sort();
}

function skipReason(
  feature: PositiveDevianceFeature,
  thresholds: PositiveDevianceThresholds,
): SkippedFeature | null {
  const qualitySkip = featureQualitySkipReason(feature.quality, "insufficient_positive_periods");
  if (qualitySkip !== null) return qualitySkip;

  if (feature.peerCount < Math.max(feature.minPeerCount, thresholds.minPeerCount)) {
    return {
      reasonCode: "insufficient_peers",
      reason: "Peer group support is below the positive-deviance minimum.",
    };
  }

  if (reciprocalWarnings(feature).length > 0) {
    return {
      reasonCode: "reciprocal_metric_warning",
      reason: "A reciprocal metric warning blocks positive-deviance scoring.",
    };
  }

  const qualifyingPeriods = feature.periods.filter((period) => periodQualifies(period, thresholds));
  if (qualifyingPeriods.length < thresholds.minStablePeriods) {
    return {
      reasonCode: "insufficient_positive_periods",
      reason: "Not enough periods clear top-decile and adjusted-residual gates.",
    };
  }

  return null;
}

function evaluateFeature(
  feature: PositiveDevianceFeature,
  thresholds: PositiveDevianceThresholds,
): EvaluatedFeature | null {
  const qualifyingPeriods = feature.periods.filter((period) => periodQualifies(period, thresholds));
  if (qualifyingPeriods.length < thresholds.minStablePeriods) return null;

  const averagePercentile =
    qualifyingPeriods.reduce((sum, period) => sum + (period.performancePercentile ?? 0), 0) /
    qualifyingPeriods.length;
  const averageResidual =
    qualifyingPeriods.reduce((sum, period) => sum + (period.adjustedResidual ?? 0), 0) /
    qualifyingPeriods.length;
  const percentileSignal = clamp(
    (averagePercentile - thresholds.minPerformancePercentile) /
      (1 - thresholds.minPerformancePercentile),
    0,
    1,
  );
  const residualSignal = clamp(averageResidual / 3, 0, 1);
  const persistenceSignal = clamp(
    qualifyingPeriods.length / Math.max(feature.periods.length, thresholds.minStablePeriods),
    0,
    1,
  );
  const detectorScore = Math.round(
    60 + 40 * (0.45 * percentileSignal + 0.35 * residualSignal + 0.2 * persistenceSignal),
  );

  return {
    feature,
    featureKey: positiveDevianceFeatureKey(feature),
    qualifyingPeriods,
    detectorScore,
  };
}

function categoryForMetric(metricName: string): "reliability" | "speed" {
  return metricName.includes("speed") || metricName.includes("pace") ? "speed" : "reliability";
}

function routeIdForFeature(feature: PositiveDevianceFeature): string | null {
  if (feature.routeId !== null) return RouteIdSchema.parse(feature.routeId);
  if (feature.scopeKind === "route") return RouteIdSchema.parse(feature.scopeId);
  return null;
}

export function detectPositiveDeviance(
  input: PositiveDevianceDetectorInput,
): PositiveDevianceDetectorOutput {
  const detectorId = DetectorIdSchema.parse(POSITIVE_DEVIANCE_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("positive_deviance");
  const thresholds = mergeThresholds(DEFAULT_POSITIVE_DEVIANCE_THRESHOLDS, input.thresholds);

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];
  const selected = new Map(
    input.features
      .filter((feature) => skipReason(feature, thresholds) === null)
      .map((feature) => evaluateFeature(feature, thresholds))
      .filter((feature): feature is EvaluatedFeature => feature !== null)
      .sort((left, right) => right.detectorScore - left.detectorScore)
      .slice(0, thresholds.candidateLimit)
      .map((feature) => [feature.featureKey, feature] as const),
  );

  for (const feature of input.features) {
    const featureKey = positiveDevianceFeatureKey(feature);
    const skip = skipReason(feature, thresholds);
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
            feature.peerCount,
            Math.max(thresholds.minPeerCount * 2, feature.minPeerCount * 2),
          ),
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_clean",
          claimText: `${feature.scopeKind} ${feature.scopeId} performs in the top decile for ${feature.metricName} versus ${feature.peerGroupLabel}, persistent over ${hit.qualifyingPeriods.length} periods.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "positive_deviance"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: {
            scopeKind: feature.scopeKind,
            scopeId: feature.scopeId,
            metricName: feature.metricName,
            featureKey,
            claimStrengthTier: "descriptive",
            peerGroupId: feature.peerGroupId,
            peerGroupLabel: feature.peerGroupLabel,
            peerCount: feature.peerCount,
            covariates: feature.covariates,
            qualifyingPeriods: hit.qualifyingPeriods.map((period) => ({
              period: period.period,
              value: period.value,
              performancePercentile: period.performancePercentile,
              adjustedResidual: period.adjustedResidual,
            })),
            thresholds,
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
            reciprocalMetricWarnings: reciprocalWarnings(feature),
            counterEvidence: [
              "Positive deviance is a learning candidate, not proof of best practice.",
              "Peer covariates and residuals must be reviewed before attributing why performance is better.",
              "A reciprocal worst-practice metric blocks auto-scoring.",
            ],
          },
          evidenceWeight: 0.5,
          note: "Review peer construction, covariates, and reciprocal metrics before promotion.",
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
          peerGroupId: feature.peerGroupId,
          peerCount: feature.peerCount,
          periodCount: feature.periods.length,
          qualifyingPeriodCount: feature.periods.filter((period) =>
            periodQualifies(period, thresholds),
          ).length,
          reciprocalMetricWarnings: reciprocalWarnings(feature),
          quality: feature.quality,
        },
        inputsExpectedJson: {
          peerCount: `>=${Math.max(feature.minPeerCount, thresholds.minPeerCount)}`,
          stablePeriods: `>=${thresholds.minStablePeriods}`,
          performancePercentile: `>=${thresholds.minPerformancePercentile}`,
          adjustedResidual: `>=${thresholds.minAdjustedResidual}`,
          reciprocalMetricWarnings: "none",
          coverageStatus: "complete_or_partial",
          freshnessStatus: "fresh_or_not_expected",
        },
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
