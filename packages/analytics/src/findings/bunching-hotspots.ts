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
import { headwayIrregularityRates } from "../baselines/headway.js";
import { buildCoverageAudit } from "../core/coverage.js";
import { buildEvidenceLink } from "../core/evidence.js";
import { stableId } from "../core/ids.js";
import { clamp, mergeThresholds, round } from "../core/numbers.js";
import { severityFromScore } from "../core/scoring.js";
import {
  type StopDirectionHourFeature,
  stopDirectionHourFeatureKey,
} from "../features/stop-direction-hour.js";
import {
  confidenceFromHeadwayQuality,
  effectiveScheduledHeadwayMinutes,
  featureQualitySkipReason,
  summarizeHeadwaysMinutes,
  validHeadwaysMinutes,
} from "./headway-common.js";

export const BUNCHING_HOTSPOTS_DETECTOR_ID = "bunching_hotspots";

export type BunchingHotspotsThresholds = {
  minHeadwayPairs: number;
  bunchingRatio: number;
  gapRatio: number;
  minBunchingShare: number;
  minGapShare: number;
  highConfidencePairs: number;
  candidateLimit: number;
};

export const DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS: BunchingHotspotsThresholds = {
  minHeadwayPairs: 20,
  bunchingRatio: 0.25,
  gapRatio: 2,
  minBunchingShare: 0.15,
  minGapShare: 0.25,
  highConfidencePairs: 50,
  candidateLimit: 100,
};

export type BunchingHotspotsDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<StopDirectionHourFeature>;
  thresholds?: Partial<BunchingHotspotsThresholds>;
};

export type BunchingHotspotsDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type BunchingHotspotMetrics = {
  pairCount: number;
  bunchingPairCount: number;
  gapPairCount: number;
  bunchingShare: number;
  gapShare: number;
  dominantReasonCode: "bunching_hotspot" | "headway_gap_hotspot";
};

type SkippedFeature = {
  reasonCode: string;
  reason: string;
};

type EvaluatedFeature = {
  feature: StopDirectionHourFeature;
  featureKey: string;
  metrics: BunchingHotspotMetrics;
  detectorScore: number;
};

function skipReason(
  feature: StopDirectionHourFeature,
  thresholds: BunchingHotspotsThresholds,
): SkippedFeature | null {
  const qualitySkip = featureQualitySkipReason(feature.quality, "insufficient_headway_pairs");
  if (qualitySkip !== null) return qualitySkip;

  if (validHeadwaysMinutes(feature.observedHeadwaysMinutes).length < thresholds.minHeadwayPairs) {
    return {
      reasonCode: "insufficient_headway_pairs",
      reason: "Observed headway pair count is below the detector minimum.",
    };
  }

  if (effectiveScheduledHeadwayMinutes(feature) === null) {
    return {
      reasonCode: "baseline_unavailable",
      reason: "Scheduled headway baseline is unavailable for the stop-direction-hour cell.",
    };
  }

  return null;
}

function evaluateFeature(
  feature: StopDirectionHourFeature,
  thresholds: BunchingHotspotsThresholds,
): EvaluatedFeature | null {
  const rates = headwayIrregularityRates(
    feature.observedHeadwaysMinutes,
    effectiveScheduledHeadwayMinutes(feature),
    {
      bunchingRatio: thresholds.bunchingRatio,
      gapRatio: thresholds.gapRatio,
    },
  );
  if (rates.bunchingShare === null || rates.gapShare === null) return null;
  if (
    rates.bunchingShare < thresholds.minBunchingShare &&
    rates.gapShare < thresholds.minGapShare
  ) {
    return null;
  }

  const bunchingSignal =
    thresholds.minBunchingShare <= 0 ? 0 : rates.bunchingShare / thresholds.minBunchingShare;
  const gapSignal = thresholds.minGapShare <= 0 ? 0 : rates.gapShare / thresholds.minGapShare;
  const dominantReasonCode =
    bunchingSignal >= gapSignal ? "bunching_hotspot" : "headway_gap_hotspot";
  const detectorScore = Math.round(
    60 + 40 * clamp((Math.max(bunchingSignal, gapSignal) - 1) / 2, 0, 1),
  );

  return {
    feature,
    featureKey: stopDirectionHourFeatureKey(feature),
    metrics: {
      pairCount: rates.pairCount,
      bunchingPairCount: rates.bunchingPairCount,
      gapPairCount: rates.gapPairCount,
      bunchingShare: rates.bunchingShare,
      gapShare: rates.gapShare,
      dominantReasonCode,
    },
    detectorScore,
  };
}

export function detectBunchingHotspots(
  input: BunchingHotspotsDetectorInput,
): BunchingHotspotsDetectorOutput {
  const detectorId = DetectorIdSchema.parse(BUNCHING_HOTSPOTS_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const thresholds = mergeThresholds(DEFAULT_BUNCHING_HOTSPOTS_THRESHOLDS, input.thresholds);

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
    const routeId = RouteIdSchema.parse(feature.routeId);
    const featureKey = stopDirectionHourFeatureKey(feature);
    const skip = skipReason(feature, thresholds);
    const hit = selected.get(featureKey);

    if (skip === null && hit !== undefined) {
      const reasonCode = FindingReasonCodeSchema.parse(hit.metrics.dominantReasonCode);
      const candidateId = stableId(detectorRunId, "candidate", featureKey, reasonCode);
      const share =
        hit.metrics.dominantReasonCode === "bunching_hotspot"
          ? hit.metrics.bunchingShare
          : hit.metrics.gapShare;
      const label =
        hit.metrics.dominantReasonCode === "bunching_hotspot" ? "bunching" : "long gaps";

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
          confidence: confidenceFromHeadwayQuality(
            feature.quality,
            hit.metrics.pairCount,
            thresholds.highConfidencePairs,
          ),
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_clean",
          claimText: `Route ${routeId} at ${feature.stopName} shows ${label} in ${round(share * 100, 1)}% of observed headway pairs in hour ${feature.localHour}.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "headway_ratios"),
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
            claimStrengthTier: "descriptive",
            pairCount: hit.metrics.pairCount,
            bunchingPairCount: hit.metrics.bunchingPairCount,
            gapPairCount: hit.metrics.gapPairCount,
            bunchingShare: round(hit.metrics.bunchingShare, 4),
            gapShare: round(hit.metrics.gapShare, 4),
            scheduledHeadwayMinutes: effectiveScheduledHeadwayMinutes(feature),
            headwayDistribution: summarizeHeadwaysMinutes(feature.observedHeadwaysMinutes),
            sourcePairCounts: {
              observedPairCount: feature.observedPairCount,
              bunchingPairCount: feature.bunchingPairCount,
              gapPairCount: feature.gapPairCount,
            },
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
            quality: feature.quality,
            counterEvidence: [
              "Bunching and gap rates are descriptive and do not identify where the irregularity originated.",
              "GPS arrival noise can inflate short-headway counts at closely spaced stops.",
              "Terminal dispatch irregularity should be checked before assigning a mid-route location.",
            ],
          },
          evidenceWeight: 0.5,
          note: "Review arrival timing quality and upstream propagation before promotion.",
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
          observedHeadwayPairCount: validHeadwaysMinutes(feature.observedHeadwaysMinutes).length,
          scheduledHeadwayMinutes: feature.scheduledHeadwayMinutes,
          quality: feature.quality,
        },
        inputsExpectedJson: {
          observedHeadwayPairCount: `>=${thresholds.minHeadwayPairs}`,
          scheduledHeadwayMinutes: "available",
          bunchingShare: `>=${thresholds.minBunchingShare}`,
          gapShare: `>=${thresholds.minGapShare}`,
          coverageStatus: "complete_or_partial",
          freshnessStatus: "fresh_or_not_expected",
        },
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
