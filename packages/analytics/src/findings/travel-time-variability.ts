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
import { bufferIndex } from "../baselines/runtime.js";
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

export const TRAVEL_TIME_VARIABILITY_DETECTOR_ID = "travel_time_variability";

export type TravelTimeVariabilityThresholds = {
  minObservedTrips: number;
  minBufferIndex: number;
  highConfidenceTrips: number;
  candidateLimit: number;
};

export const DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS: TravelTimeVariabilityThresholds = {
  minObservedTrips: 30,
  minBufferIndex: 0.5,
  highConfidenceTrips: 60,
  candidateLimit: 100,
};

export type TravelTimeVariabilityDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<RouteDirectionDaypartFeature>;
  thresholds?: Partial<TravelTimeVariabilityThresholds>;
};

export type TravelTimeVariabilityDetectorOutput = {
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
  bufferIndex: number;
  detectorScore: number;
};

function skipReason(
  feature: RouteDirectionDaypartFeature,
  thresholds: TravelTimeVariabilityThresholds,
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

  if (bufferIndex(feature.observedRuntimeP50Minutes, feature.observedRuntimeP95Minutes) === null) {
    return {
      reasonCode: "missing_runtime_metric",
      reason: "Observed P50/P95 runtime fields are unavailable or inconsistent.",
    };
  }

  return null;
}

function evaluateFeature(
  feature: RouteDirectionDaypartFeature,
  thresholds: TravelTimeVariabilityThresholds,
): EvaluatedFeature | null {
  const runtimeBufferIndex = bufferIndex(
    feature.observedRuntimeP50Minutes,
    feature.observedRuntimeP95Minutes,
  );
  if (runtimeBufferIndex === null || runtimeBufferIndex < thresholds.minBufferIndex) return null;

  const variabilitySignal = clamp(
    (runtimeBufferIndex - thresholds.minBufferIndex) / thresholds.minBufferIndex,
    0,
    1,
  );
  const detectorScore = Math.round(60 + 40 * variabilitySignal);

  return {
    feature,
    featureKey: routeDirectionDaypartFeatureKey(feature),
    bufferIndex: runtimeBufferIndex,
    detectorScore,
  };
}

export function detectTravelTimeVariability(
  input: TravelTimeVariabilityDetectorInput,
): TravelTimeVariabilityDetectorOutput {
  const detectorId = DetectorIdSchema.parse(TRAVEL_TIME_VARIABILITY_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("high_travel_time_variability");
  const thresholds = mergeThresholds(DEFAULT_TRAVEL_TIME_VARIABILITY_THRESHOLDS, input.thresholds);

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
          claimText: `Route ${routeId} ${feature.direction} ${feature.daypart} travel time is variable: P50 ${feature.observedRuntimeP50Minutes} min and P95 ${feature.observedRuntimeP95Minutes} min.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "runtime_variability"),
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
            observedRuntimeP50Minutes: feature.observedRuntimeP50Minutes,
            observedRuntimeP95Minutes: feature.observedRuntimeP95Minutes,
            bufferIndex: round(hit.bufferIndex, 4),
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
              "Runtime variability is descriptive and does not identify cause.",
              "Incident-driven outliers can inflate P95 runtime.",
              "Route or service-pattern changes can break comparability across periods.",
            ],
          },
          evidenceWeight: 0.5,
          note: "Review service-pattern version and incident context before promotion.",
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
          observedTripCount: feature.observedTripCount,
          observedRuntimeP50Minutes: feature.observedRuntimeP50Minutes,
          observedRuntimeP95Minutes: feature.observedRuntimeP95Minutes,
          quality: feature.quality,
        },
        inputsExpectedJson: {
          observedTripCount: `>=${thresholds.minObservedTrips}`,
          observedRuntimeP50Minutes: "available_and_positive",
          observedRuntimeP95Minutes: "available_and_>=p50",
          bufferIndex: `>=${thresholds.minBufferIndex}`,
          coverageStatus: "complete_or_partial",
          freshnessStatus: "fresh_or_not_expected",
        },
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
