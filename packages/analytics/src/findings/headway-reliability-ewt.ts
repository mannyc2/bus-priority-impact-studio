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
import {
  excessWaitTimeMinutes,
  headwayCoefficientOfVariation,
  headwayLosFromCoefficient,
  type HeadwayLos,
} from "../baselines/headway.js";
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

export const HEADWAY_RELIABILITY_EWT_DETECTOR_ID = "headway_reliability_ewt";

export type HeadwayReliabilityEwtThresholds = {
  minHeadways: number;
  minScheduledBusesPerHour: number;
  minExcessWaitMinutes: number;
  minLos: HeadwayLos;
  highConfidenceHeadways: number;
  candidateLimit: number;
};

export const DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS: HeadwayReliabilityEwtThresholds = {
  minHeadways: 10,
  minScheduledBusesPerHour: 5,
  minExcessWaitMinutes: 2,
  minLos: "E",
  highConfidenceHeadways: 30,
  candidateLimit: 100,
};

export type HeadwayReliabilityEwtDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<StopDirectionHourFeature>;
  thresholds?: Partial<HeadwayReliabilityEwtThresholds>;
};

export type HeadwayReliabilityEwtDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type HeadwayReliabilityEwtMetrics = {
  observedHeadwayCount: number;
  averageWaitTimeMinutes: number;
  scheduledWaitTimeMinutes: number;
  excessWaitTimeMinutes: number;
  coefficientOfVariation: number;
  los: HeadwayLos;
};

type SkippedFeature = {
  reasonCode: string;
  reason: string;
};

type EvaluatedFeature = {
  feature: StopDirectionHourFeature;
  featureKey: string;
  metrics: HeadwayReliabilityEwtMetrics;
  detectorScore: number;
};

const HEADWAY_LOS_RANK: Record<HeadwayLos, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
};

function skipReason(
  feature: StopDirectionHourFeature,
  thresholds: HeadwayReliabilityEwtThresholds,
): SkippedFeature | null {
  const qualitySkip = featureQualitySkipReason(feature.quality, "insufficient_headways");
  if (qualitySkip !== null) return qualitySkip;

  if (validHeadwaysMinutes(feature.observedHeadwaysMinutes).length < thresholds.minHeadways) {
    return {
      reasonCode: "insufficient_headways",
      reason: "Observed headway count is below the detector minimum.",
    };
  }

  if (
    feature.scheduledBusesPerHour === null ||
    !Number.isFinite(feature.scheduledBusesPerHour) ||
    feature.scheduledBusesPerHour <= 0
  ) {
    return {
      reasonCode: "baseline_unavailable",
      reason: "Scheduled buses per hour is unavailable for the stop-direction-hour cell.",
    };
  }

  if (feature.scheduledBusesPerHour < thresholds.minScheduledBusesPerHour) {
    return {
      reasonCode: "unsupported_frequency",
      reason: "EWT is configured only for frequent service cells.",
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
  thresholds: HeadwayReliabilityEwtThresholds,
): EvaluatedFeature | null {
  const headways = validHeadwaysMinutes(feature.observedHeadwaysMinutes);
  const wait = excessWaitTimeMinutes(headways, feature.scheduledBusesPerHour);
  const coefficientOfVariation = headwayCoefficientOfVariation(
    headways,
    effectiveScheduledHeadwayMinutes(feature),
  );
  const los = headwayLosFromCoefficient(coefficientOfVariation);

  if (
    wait.averageWaitTimeMinutes === null ||
    wait.scheduledWaitTimeMinutes === null ||
    wait.excessWaitTimeMinutes === null ||
    coefficientOfVariation === null ||
    los === null
  ) {
    return null;
  }

  if (wait.excessWaitTimeMinutes < thresholds.minExcessWaitMinutes) return null;
  if (HEADWAY_LOS_RANK[los] < HEADWAY_LOS_RANK[thresholds.minLos]) return null;

  const excessWaitSignal = clamp(
    wait.excessWaitTimeMinutes / Math.max(thresholds.minExcessWaitMinutes * 3, 1),
    0,
    1,
  );
  const losSignal = clamp((HEADWAY_LOS_RANK[los] - 1) / 5, 0, 1);
  const detectorScore = Math.round(60 + 40 * (0.65 * excessWaitSignal + 0.35 * losSignal));

  return {
    feature,
    featureKey: stopDirectionHourFeatureKey(feature),
    metrics: {
      observedHeadwayCount: headways.length,
      averageWaitTimeMinutes: wait.averageWaitTimeMinutes,
      scheduledWaitTimeMinutes: wait.scheduledWaitTimeMinutes,
      excessWaitTimeMinutes: wait.excessWaitTimeMinutes,
      coefficientOfVariation,
      los,
    },
    detectorScore,
  };
}

export function detectHeadwayReliabilityEwt(
  input: HeadwayReliabilityEwtDetectorInput,
): HeadwayReliabilityEwtDetectorOutput {
  const detectorId = DetectorIdSchema.parse(HEADWAY_RELIABILITY_EWT_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("excess_wait_time");
  const thresholds = mergeThresholds(DEFAULT_HEADWAY_RELIABILITY_EWT_THRESHOLDS, input.thresholds);

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
      const candidateId = stableId(detectorRunId, "candidate", featureKey, reasonCode);
      const excessWaitRounded = round(hit.metrics.excessWaitTimeMinutes, 1);
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
            hit.metrics.observedHeadwayCount,
            thresholds.highConfidenceHeadways,
          ),
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_clean",
          claimText: `Route ${routeId} riders at ${feature.stopName} experienced an estimated ${excessWaitRounded} minutes of excess wait in hour ${feature.localHour}.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "ewt"),
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
            averageWaitTimeMinutes: round(hit.metrics.averageWaitTimeMinutes, 3),
            scheduledWaitTimeMinutes: round(hit.metrics.scheduledWaitTimeMinutes, 3),
            excessWaitTimeMinutes: round(hit.metrics.excessWaitTimeMinutes, 3),
            coefficientOfVariation: round(hit.metrics.coefficientOfVariation, 4),
            los: hit.metrics.los,
            observedHeadwayCount: hit.metrics.observedHeadwayCount,
            scheduledBusesPerHour: feature.scheduledBusesPerHour,
            scheduledHeadwayMinutes: effectiveScheduledHeadwayMinutes(feature),
            headwayDistribution: summarizeHeadwaysMinutes(feature.observedHeadwaysMinutes),
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
              "EWT is descriptive and does not identify the operational cause.",
              "Sparse or stale GTFS-RT feed coverage suppresses scoring.",
              "This stop-direction-hour cell should not be generalized to the whole route without broader evidence.",
            ],
          },
          evidenceWeight: 0.5,
          note: "Review coverage, frequency, and stop-hour scope before promotion.",
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
          observedHeadwayCount: validHeadwaysMinutes(feature.observedHeadwaysMinutes).length,
          scheduledBusesPerHour: feature.scheduledBusesPerHour,
          scheduledHeadwayMinutes: feature.scheduledHeadwayMinutes,
          quality: feature.quality,
        },
        inputsExpectedJson: {
          observedHeadwayCount: `>=${thresholds.minHeadways}`,
          scheduledBusesPerHour: `>=${thresholds.minScheduledBusesPerHour}`,
          excessWaitTimeMinutes: `>=${thresholds.minExcessWaitMinutes}`,
          los: `>=${thresholds.minLos}`,
          coverageStatus: "complete_or_partial",
          freshnessStatus: "fresh_or_not_expected",
        },
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
