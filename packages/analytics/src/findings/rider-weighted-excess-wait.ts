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
import { percentile } from "../concentration.js";
import { buildCoverageAudit } from "../core/coverage.js";
import { buildEvidenceLink } from "../core/evidence.js";
import { stableId } from "../core/ids.js";
import { clamp, mergeThresholds, round } from "../core/numbers.js";
import { severityFromScore } from "../core/scoring.js";
import type { FeatureQuality } from "../features/quality.js";
import {
  featureQualityHasCoverage,
  featureQualityHasFreshness,
  featureQualityHasSampleSupport,
} from "../features/quality.js";
import {
  type RiderWeightedExcessWaitFeature,
  riderWeightedExcessWaitFeatureKey,
} from "../features/rider-weighted-excess-wait.js";

export const RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID = "rider_weighted_excess_wait";

export type RiderWeightedExcessWaitThresholds = {
  minExcessWaitMinutes: number;
  minBoardings: number;
  minWeightedExcessWaitRiderMinutes: number;
  topPercentile: number;
  highConfidenceRiderMinutes: number;
  candidateLimit: number;
};

export const DEFAULT_RIDER_WEIGHTED_EXCESS_WAIT_THRESHOLDS: RiderWeightedExcessWaitThresholds = {
  minExcessWaitMinutes: 1,
  minBoardings: 1,
  minWeightedExcessWaitRiderMinutes: 100,
  topPercentile: 0.9,
  highConfidenceRiderMinutes: 1_000,
  candidateLimit: 100,
};

export type RiderWeightedExcessWaitDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<RiderWeightedExcessWaitFeature>;
  thresholds?: Partial<RiderWeightedExcessWaitThresholds>;
};

export type RiderWeightedExcessWaitDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type SkippedFeature = {
  reasonCode: string;
  reason: string;
};

type EvaluatedFeature = {
  feature: RiderWeightedExcessWaitFeature;
  featureKey: string;
  excessWaitTimeMinutes: number;
  boardings: number;
  weightedExcessWaitRiderMinutes: number;
  detectorScore: number;
};

function qualitySkipReason(
  quality: FeatureQuality,
  reasons: {
    coverage: SkippedFeature;
    freshness: SkippedFeature;
    sample: SkippedFeature;
  },
): SkippedFeature | null {
  if (!featureQualityHasCoverage(quality)) {
    return reasons.coverage;
  }
  if (!featureQualityHasFreshness(quality)) {
    return reasons.freshness;
  }
  if (!featureQualityHasSampleSupport(quality)) {
    return reasons.sample;
  }
  return null;
}

function skipReason(
  feature: RiderWeightedExcessWaitFeature,
  thresholds: RiderWeightedExcessWaitThresholds,
): SkippedFeature | null {
  const ewtQualitySkip = qualitySkipReason(
    feature.quality,
    {
      coverage: {
        reasonCode: "low_coverage",
        reason: "Excess-wait coverage is too low to compute rider-weighted wait cost.",
      },
      freshness: {
        reasonCode: "feed_stale",
        reason: "Excess-wait source freshness is too stale to compute rider-weighted wait cost.",
      },
      sample: {
        reasonCode: "insufficient_headways",
        reason: "Excess-wait sample support is below the detector minimum.",
      },
    },
  );
  if (ewtQualitySkip !== null) return ewtQualitySkip;

  const ridershipQualitySkip = qualitySkipReason(
    feature.ridershipQuality,
    {
      coverage: {
        reasonCode: "ridership_proxy_unavailable",
        reason: "Ridership/APC proxy coverage is not strong enough to compute rider-weighted wait cost.",
      },
      freshness: {
        reasonCode: "ridership_proxy_unavailable",
        reason: "Ridership/APC proxy freshness is too stale to compute rider-weighted wait cost.",
      },
      sample: {
        reasonCode: "ridership_proxy_unavailable",
        reason: "Ridership/APC proxy sample support is below the detector minimum.",
      },
    },
  );
  if (ridershipQualitySkip !== null) return ridershipQualitySkip;

  if (
    feature.excessWaitTimeMinutes === null ||
    !Number.isFinite(feature.excessWaitTimeMinutes) ||
    feature.excessWaitTimeMinutes < thresholds.minExcessWaitMinutes
  ) {
    return {
      reasonCode: "missing_excess_wait",
      reason: "Excess wait is unavailable or below the detector minimum.",
    };
  }

  if (
    feature.boardings === null ||
    !Number.isFinite(feature.boardings) ||
    feature.boardings < thresholds.minBoardings
  ) {
    return {
      reasonCode: "ridership_proxy_unavailable",
      reason: "Boardings are unavailable or below the detector minimum.",
    };
  }

  return null;
}

function confidenceFromWeightedWait(
  feature: RiderWeightedExcessWaitFeature,
  weightedExcessWaitRiderMinutes: number,
  thresholds: RiderWeightedExcessWaitThresholds,
): "low" | "medium" | "high" {
  if (
    weightedExcessWaitRiderMinutes >= thresholds.highConfidenceRiderMinutes &&
    (feature.quality.coverageShare ?? 0) >= 0.95 &&
    (feature.ridershipQuality.coverageShare ?? 0) >= 0.95
  ) {
    return "high";
  }

  if (
    feature.quality.coverageStatus === "partial" ||
    feature.ridershipQuality.coverageStatus === "partial" ||
    (feature.quality.coverageShare ?? 1) < 0.8 ||
    (feature.ridershipQuality.coverageShare ?? 1) < 0.8
  ) {
    return "low";
  }

  return "medium";
}

function evaluateFeature(
  feature: RiderWeightedExcessWaitFeature,
  thresholds: RiderWeightedExcessWaitThresholds,
): EvaluatedFeature | null {
  if (skipReason(feature, thresholds) !== null) return null;

  const excessWaitTimeMinutes = feature.excessWaitTimeMinutes as number;
  const boardings = feature.boardings as number;
  const weightedExcessWaitRiderMinutes = excessWaitTimeMinutes * boardings;
  if (weightedExcessWaitRiderMinutes < thresholds.minWeightedExcessWaitRiderMinutes) return null;

  const weightedSignal = clamp(
    weightedExcessWaitRiderMinutes /
      Math.max(thresholds.minWeightedExcessWaitRiderMinutes * 4, 1),
    0,
    1,
  );
  const excessSignal = clamp(
    excessWaitTimeMinutes / Math.max(thresholds.minExcessWaitMinutes * 4, 1),
    0,
    1,
  );
  const boardingSignal = clamp(boardings / Math.max(thresholds.highConfidenceRiderMinutes, 1), 0, 1);
  const detectorScore = Math.round(
    55 + 45 * (0.6 * weightedSignal + 0.25 * excessSignal + 0.15 * boardingSignal),
  );

  return {
    feature,
    featureKey: riderWeightedExcessWaitFeatureKey(feature),
    excessWaitTimeMinutes,
    boardings,
    weightedExcessWaitRiderMinutes,
    detectorScore,
  };
}

export function detectRiderWeightedExcessWait(
  input: RiderWeightedExcessWaitDetectorInput,
): RiderWeightedExcessWaitDetectorOutput {
  const detectorId = DetectorIdSchema.parse(RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("rider_weighted_excess_wait");
  const thresholds = mergeThresholds(
    DEFAULT_RIDER_WEIGHTED_EXCESS_WAIT_THRESHOLDS,
    input.thresholds,
  );

  const evaluated = input.features
    .map((feature) => evaluateFeature(feature, thresholds))
    .filter((feature): feature is EvaluatedFeature => feature !== null);
  const weightedCutoff =
    evaluated.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.max(
          thresholds.minWeightedExcessWaitRiderMinutes,
          percentile(
            evaluated.map((feature) => feature.weightedExcessWaitRiderMinutes),
            thresholds.topPercentile,
          ),
        );
  const selected = new Map(
    evaluated
      .filter((feature) => feature.weightedExcessWaitRiderMinutes >= weightedCutoff)
      .sort((left, right) => right.detectorScore - left.detectorScore)
      .slice(0, thresholds.candidateLimit)
      .map((feature) => [feature.featureKey, feature] as const),
  );

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];

  for (const feature of input.features) {
    const routeId = RouteIdSchema.parse(feature.routeId);
    const featureKey = riderWeightedExcessWaitFeatureKey(feature);
    const skip = skipReason(feature, thresholds);
    const hit = selected.get(featureKey);

    if (skip === null && hit !== undefined) {
      const candidateId = stableId(detectorRunId, "candidate", featureKey, reasonCode);
      const riderMinutes = round(hit.weightedExcessWaitRiderMinutes, 1);
      candidates.push(
        FindingCandidateSchema.parse({
          candidateId,
          detectorId,
          detectorRunId,
          month,
          scopeKind: "route",
          scopeId: featureKey,
          routeId,
          physicalId: feature.stopId,
          category: "reliability",
          severity: severityFromScore(hit.detectorScore),
          confidence: confidenceFromWeightedWait(
            feature,
            hit.weightedExcessWaitRiderMinutes,
            thresholds,
          ),
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Route ${routeId} riders at ${feature.stopName} carried an estimated ${riderMinutes} rider-minutes of excess wait in hour ${feature.localHour}.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "weighted-ewt"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: {
            routeId,
            stopId: feature.stopId,
            stopName: feature.stopName,
            direction: feature.direction,
            serviceDate: feature.serviceDate,
            localHour: feature.localHour,
            timezone: feature.timezone,
            featureKey,
            claimStrengthTier: "associational",
            excessWaitTimeMinutes: round(hit.excessWaitTimeMinutes, 3),
            boardings: round(hit.boardings, 3),
            boardingsSource: feature.boardingsSource,
            ridershipSnapshotId: feature.ridershipSnapshotId,
            ewtDetectorVersion: feature.ewtDetectorVersion,
            weightedExcessWaitRiderMinutes: round(hit.weightedExcessWaitRiderMinutes, 3),
            weightedCutoff: round(weightedCutoff, 3),
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
            routeId,
            featureKey,
            ewtQuality: feature.quality,
            ridershipQuality: feature.ridershipQuality,
            counterEvidence: [
              "Rider-minutes use APC or ridership proxy weights and should be reviewed before publication.",
              "This detector estimates aggregate rider exposure; it does not identify the cause of irregular service.",
              "If ridership coverage is weak, the detector suppresses scoring rather than treating missing boardings as no issue.",
            ],
          },
          evidenceWeight: 0.5,
          note: "Review APC/ridership proxy coverage and unweighted EWT evidence before promotion.",
        }),
      );
    }

    coverage.push(
      buildCoverageAudit({
        auditId: stableId(detectorRunId, "audit", featureKey),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "route",
        scopeId: featureKey,
        outcome:
          skip !== null ? "skipped_missing_input" : hit === undefined ? "clean_no_hit" : "hit",
        reasonCode: skip === null ? null : FindingReasonCodeSchema.parse(skip.reasonCode),
        reason: skip?.reason ?? null,
        inputsSeenJson: {
          routeId,
          stopId: feature.stopId,
          direction: feature.direction,
          serviceDate: feature.serviceDate,
          localHour: feature.localHour,
          excessWaitTimeMinutes: feature.excessWaitTimeMinutes,
          boardings: feature.boardings,
          boardingsSource: feature.boardingsSource,
          ewtQuality: feature.quality,
          ridershipQuality: feature.ridershipQuality,
        },
        inputsExpectedJson: {
          excessWaitTimeMinutes: `>=${thresholds.minExcessWaitMinutes}`,
          boardings: `>=${thresholds.minBoardings}`,
          weightedExcessWaitRiderMinutes: `>=${thresholds.minWeightedExcessWaitRiderMinutes}`,
          topPercentile: thresholds.topPercentile,
          coverageStatus: "complete_or_partial",
          freshnessStatus: "fresh_or_not_expected",
          ridershipProxy: "available_with_supported_quality",
        },
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
