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
import { runtimeDeviation } from "../baselines/runtime.js";
import { buildCoverageAudit } from "../core/coverage.js";
import { buildEvidenceLink } from "../core/evidence.js";
import { stableId } from "../core/ids.js";
import { clamp, mergeThresholds, round } from "../core/numbers.js";
import { severityFromScore } from "../core/scoring.js";
import {
  type RouteDirectionDaypartFeature,
  routeDirectionDaypartFeatureKey,
} from "../features/route-direction-daypart.js";
import { confidenceFromFeatureQuality, featureQualitySkipReason } from "./feature-quality.js";

export const SCHEDULE_MISMATCH_DETECTOR_ID = "schedule_mismatch";

export type ScheduleMismatchThresholds = {
  minObservedTrips: number;
  minAbsoluteSignedPercent: number;
  highConfidenceTrips: number;
  candidateLimit: number;
};

export const DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS: ScheduleMismatchThresholds = {
  minObservedTrips: 10,
  minAbsoluteSignedPercent: 0.15,
  highConfidenceTrips: 30,
  candidateLimit: 100,
};

export type ScheduleMismatchDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<RouteDirectionDaypartFeature>;
  thresholds?: Partial<ScheduleMismatchThresholds>;
};

export type ScheduleMismatchDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type SkippedFeature = {
  reasonCode: string;
  reason: string;
};

type EvaluatedFeature = {
  feature: RouteDirectionDaypartFeature;
  featureKey: string;
  runtimeRatio: number;
  signedPercent: number;
  reasonCode: "schedule_too_tight" | "schedule_padding_review";
  detectorScore: number;
};

function skipReason(
  feature: RouteDirectionDaypartFeature,
  thresholds: ScheduleMismatchThresholds,
): SkippedFeature | null {
  const qualitySkip = featureQualitySkipReason(
    feature.quality,
    "insufficient_runtime_observations",
  );
  if (qualitySkip !== null) return qualitySkip;

  if (feature.observedTripCount < thresholds.minObservedTrips) {
    return {
      reasonCode: "insufficient_runtime_observations",
      reason: "Observed trip count is below the detector minimum.",
    };
  }

  if (
    feature.scheduledRuntimeMinutes === null ||
    !Number.isFinite(feature.scheduledRuntimeMinutes) ||
    feature.scheduledRuntimeMinutes <= 0
  ) {
    return {
      reasonCode: "baseline_unavailable",
      reason: "Scheduled runtime baseline is unavailable.",
    };
  }

  if (
    feature.observedRuntimeP50Minutes === null ||
    !Number.isFinite(feature.observedRuntimeP50Minutes)
  ) {
    return {
      reasonCode: "missing_runtime_metric",
      reason: "Observed median runtime is unavailable.",
    };
  }

  return null;
}

function evaluateFeature(
  feature: RouteDirectionDaypartFeature,
  thresholds: ScheduleMismatchThresholds,
): EvaluatedFeature | null {
  const deviation = runtimeDeviation(
    feature.observedRuntimeP50Minutes,
    feature.scheduledRuntimeMinutes,
  );
  if (deviation.ratio === null || deviation.signedPercent === null) return null;
  if (Math.abs(deviation.signedPercent) < thresholds.minAbsoluteSignedPercent) return null;

  const mismatchSignal = clamp(
    (Math.abs(deviation.signedPercent) - thresholds.minAbsoluteSignedPercent) /
      thresholds.minAbsoluteSignedPercent,
    0,
    1,
  );
  const detectorScore = Math.round(60 + 40 * mismatchSignal);

  return {
    feature,
    featureKey: routeDirectionDaypartFeatureKey(feature),
    runtimeRatio: deviation.ratio,
    signedPercent: deviation.signedPercent,
    reasonCode: deviation.signedPercent > 0 ? "schedule_too_tight" : "schedule_padding_review",
    detectorScore,
  };
}

export function detectScheduleMismatch(
  input: ScheduleMismatchDetectorInput,
): ScheduleMismatchDetectorOutput {
  const detectorId = DetectorIdSchema.parse(SCHEDULE_MISMATCH_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const thresholds = mergeThresholds(DEFAULT_SCHEDULE_MISMATCH_THRESHOLDS, input.thresholds);

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
    const featureKey = routeDirectionDaypartFeatureKey(feature);
    const skip = skipReason(feature, thresholds);
    const hit = selected.get(featureKey);

    if (skip === null && hit !== undefined) {
      const reasonCode = FindingReasonCodeSchema.parse(hit.reasonCode);
      const candidateId = stableId(detectorRunId, "candidate", featureKey, reasonCode);
      candidates.push(
        FindingCandidateSchema.parse({
          candidateId,
          detectorId,
          detectorRunId,
          month,
          scopeKind: "route",
          scopeId: featureKey,
          routeId,
          physicalId: null,
          category: "reliability",
          severity: severityFromScore(hit.detectorScore),
          confidence: confidenceFromFeatureQuality(
            feature.quality,
            feature.observedTripCount,
            thresholds.highConfidenceTrips,
          ),
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_clean",
          claimText: `Scheduled runtime for route ${routeId} ${feature.direction} ${feature.daypart} differs from observed median runtime by ${round(hit.signedPercent * 100, 1)}%, suggesting schedule review.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "runtime_deviation"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: {
            routeId,
            month,
            direction: feature.direction,
            daypart: feature.daypart,
            featureKey,
            claimStrengthTier: "descriptive",
            scheduledRuntimeMinutes: feature.scheduledRuntimeMinutes,
            observedRuntimeP50Minutes: feature.observedRuntimeP50Minutes,
            observedRuntimeP95Minutes: feature.observedRuntimeP95Minutes,
            runtimeRatio: round(hit.runtimeRatio, 4),
            signedPercent: round(hit.signedPercent, 4),
            observedTripCount: feature.observedTripCount,
            servicePatternVersion: feature.servicePatternVersion,
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
              "Runtime deviation is descriptive and does not assign blame for schedule mismatch.",
              "Congestion, incidents, seasonality, and service-pattern changes can affect observed runtime.",
              "Median runtime alone does not prove early departures or schedule padding.",
            ],
          },
          evidenceWeight: 0.5,
          note: "Review service-pattern version and operations context before promotion.",
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
          direction: feature.direction,
          daypart: feature.daypart,
          scheduledRuntimeMinutes: feature.scheduledRuntimeMinutes,
          observedRuntimeP50Minutes: feature.observedRuntimeP50Minutes,
          observedTripCount: feature.observedTripCount,
          quality: feature.quality,
        },
        inputsExpectedJson: {
          scheduledRuntimeMinutes: "available_and_positive",
          observedRuntimeP50Minutes: "available",
          observedTripCount: `>=${thresholds.minObservedTrips}`,
          absoluteSignedPercent: `>=${thresholds.minAbsoluteSignedPercent}`,
          coverageStatus: "complete_or_partial",
          freshnessStatus: "fresh_or_not_expected",
        },
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
