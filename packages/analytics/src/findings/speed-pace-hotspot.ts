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
import { paceSlownessIndex, positiveDelayComponent } from "../baselines/runtime.js";
import { buildCoverageAudit } from "../core/coverage.js";
import { buildEvidenceLink } from "../core/evidence.js";
import { stableId } from "../core/ids.js";
import { clamp, mergeThresholds, round } from "../core/numbers.js";
import { severityFromScore } from "../core/scoring.js";
import {
  type SegmentDaypartFeature,
  segmentDaypartFeatureKey,
} from "../features/segment-daypart.js";
import { confidenceFromFeatureQuality, featureQualitySkipReason } from "./feature-quality.js";

export const SPEED_PACE_HOTSPOT_DETECTOR_ID = "speed_pace_hotspot";

export type SpeedPaceHotspotThresholds = {
  minTraversals: number;
  minSegmentLengthFeet: number;
  maxSegmentLengthFeet: number;
  minSlownessIndex: number;
  highConfidenceTraversals: number;
  // Per-route cap on emitted candidates. The detector keeps each route's own worst segments so no
  // single corridor monopolizes output — a flat global top-N skewed emission to Manhattan trunk
  // routes and hid most outer-borough slow segments (see ADR-0018 calibration note).
  candidateLimitPerRoute: number;
  // Global safety ceiling across all routes. Set well above realistic per-month volume so it never
  // acts as the primary limiter (that is the slowness floor + per-route cap); it only backstops a
  // runaway run. Overridable via the CLI `--candidateLimit`.
  candidateLimit: number;
};

export const DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS: SpeedPaceHotspotThresholds = {
  minTraversals: 15,
  minSegmentLengthFeet: 300,
  // Segments longer than this are express/highway runs where median-pace-vs-free-flow is not a
  // localizable "slow segment"; reviewed labels marked such multi-mile segments geometry_ambiguous.
  maxSegmentLengthFeet: 15000,
  minSlownessIndex: 1.5,
  highConfidenceTraversals: 50,
  candidateLimitPerRoute: 12,
  candidateLimit: 2000,
};

export type SpeedPaceHotspotDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<SegmentDaypartFeature>;
  thresholds?: Partial<SpeedPaceHotspotThresholds>;
};

export type SpeedPaceHotspotDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type SkippedFeature = {
  reasonCode: string;
  reason: string;
  coverageOutcome: "skipped_missing_input" | "skipped_failed_join";
};

type EvaluatedFeature = {
  feature: SegmentDaypartFeature;
  featureKey: string;
  slownessIndex: number;
  systematicDelayMinutesPerMile: number | null;
  stochasticDelayMinutesPerMile: number | null;
  detectorScore: number;
};

function skipReason(
  feature: SegmentDaypartFeature,
  thresholds: SpeedPaceHotspotThresholds,
): SkippedFeature | null {
  const qualitySkip = featureQualitySkipReason(feature.quality, "insufficient_speed_observations");
  if (qualitySkip !== null) return qualitySkip;

  if (feature.traversalCount < thresholds.minTraversals) {
    return {
      reasonCode: "insufficient_traversals",
      reason: "Segment traversal count is below the detector minimum.",
      coverageOutcome: "skipped_missing_input",
    };
  }

  if (feature.isTerminal) {
    return {
      reasonCode: "terminal_or_layover",
      reason:
        "First/last direction segment can be dominated by terminal, layover, or route-end dwell; pace-versus-free-flow there reflects dwell, not a localizable slow segment. Keep it as review context instead of a slow-pace candidate.",
      coverageOutcome: "skipped_failed_join",
    };
  }

  const minSegmentLength = feature.minSegmentLengthFeet ?? thresholds.minSegmentLengthFeet;
  if (
    feature.segmentLengthFeet !== null &&
    Number.isFinite(feature.segmentLengthFeet) &&
    feature.segmentLengthFeet < minSegmentLength
  ) {
    return {
      reasonCode: "segment_too_short",
      reason: "Segment is shorter than the configured minimum for reliable pace scoring.",
      coverageOutcome: "skipped_failed_join",
    };
  }

  if (
    feature.segmentLengthFeet !== null &&
    Number.isFinite(feature.segmentLengthFeet) &&
    feature.segmentLengthFeet > thresholds.maxSegmentLengthFeet
  ) {
    return {
      reasonCode: "segment_too_long",
      reason:
        "Segment spans an express/highway run too long for pace-versus-free-flow to localize a slow segment.",
      coverageOutcome: "skipped_failed_join",
    };
  }

  if (
    paceSlownessIndex(feature.medianPaceMinutesPerMile, feature.freeFlowPaceMinutesPerMile) === null
  ) {
    return {
      reasonCode: "baseline_unavailable",
      reason: "Median pace or free-flow pace baseline is unavailable.",
      coverageOutcome: "skipped_missing_input",
    };
  }

  return null;
}

function evaluateFeature(
  feature: SegmentDaypartFeature,
  thresholds: SpeedPaceHotspotThresholds,
): EvaluatedFeature | null {
  const slownessIndex = paceSlownessIndex(
    feature.medianPaceMinutesPerMile,
    feature.freeFlowPaceMinutesPerMile,
  );
  if (slownessIndex === null || slownessIndex < thresholds.minSlownessIndex) return null;

  const systematicDelay = positiveDelayComponent(feature.systematicDelayMinutesPerMile);
  const stochasticDelay = positiveDelayComponent(feature.stochasticDelayMinutesPerMile);
  const slownessSignal = clamp(
    (slownessIndex - thresholds.minSlownessIndex) / (3 - thresholds.minSlownessIndex),
    0,
    1,
  );
  const systematicSignal = clamp((systematicDelay ?? 0) / 8, 0, 1);
  const detectorScore = Math.round(60 + 40 * (0.75 * slownessSignal + 0.25 * systematicSignal));

  return {
    feature,
    featureKey: segmentDaypartFeatureKey(feature),
    slownessIndex,
    systematicDelayMinutesPerMile: systematicDelay,
    stochasticDelayMinutesPerMile: stochasticDelay,
    detectorScore,
  };
}

export function detectSpeedPaceHotspots(
  input: SpeedPaceHotspotDetectorInput,
): SpeedPaceHotspotDetectorOutput {
  const detectorId = DetectorIdSchema.parse(SPEED_PACE_HOTSPOT_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("slow_pace_hotspot");
  const thresholds = mergeThresholds(DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS, input.thresholds);

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];
  // Qualifying segments, capped per route so no single corridor dominates, then a global safety
  // ceiling. Ordering within a route and globally is by detector score, with featureKey as a stable
  // tiebreak so the selection is deterministic across equal scores.
  const byScoreThenKey = (left: EvaluatedFeature, right: EvaluatedFeature) =>
    right.detectorScore - left.detectorScore || left.featureKey.localeCompare(right.featureKey);
  const qualifiedByRoute = new Map<string, EvaluatedFeature[]>();
  for (const feature of input.features) {
    if (skipReason(feature, thresholds) !== null) continue;
    const evaluated = evaluateFeature(feature, thresholds);
    if (evaluated === null) continue;
    const route = evaluated.feature.routeId;
    const list = qualifiedByRoute.get(route) ?? [];
    list.push(evaluated);
    qualifiedByRoute.set(route, list);
  }
  const selected = new Map(
    [...qualifiedByRoute.values()]
      .flatMap((list) => list.sort(byScoreThenKey).slice(0, thresholds.candidateLimitPerRoute))
      .sort(byScoreThenKey)
      .slice(0, thresholds.candidateLimit)
      .map((feature) => [feature.featureKey, feature] as const),
  );

  for (const feature of input.features) {
    const routeId = RouteIdSchema.parse(feature.routeId);
    const featureKey = segmentDaypartFeatureKey(feature);
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
          scopeKind: "segment",
          scopeId: featureKey,
          routeId,
          physicalId: feature.segmentId,
          category: "speed",
          severity: severityFromScore(hit.detectorScore),
          confidence: confidenceFromFeatureQuality(
            feature.quality,
            feature.traversalCount,
            thresholds.highConfidenceTraversals,
          ),
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_clean",
          claimText: `Route ${routeId} segment ${feature.segmentId} runs at ${round(hit.slownessIndex, 2)}x free-flow pace during ${feature.daypart}.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "pace"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: {
            routeId,
            month,
            segmentId: feature.segmentId,
            direction: feature.direction,
            daypart: feature.daypart,
            featureKey,
            claimStrengthTier: "descriptive",
            traversalCount: feature.traversalCount,
            segmentLengthFeet: feature.segmentLengthFeet,
            medianSpeedMph: feature.medianSpeedMph,
            medianPaceMinutesPerMile: feature.medianPaceMinutesPerMile,
            freeFlowPaceMinutesPerMile: feature.freeFlowPaceMinutesPerMile,
            slownessIndex: round(hit.slownessIndex, 4),
            systematicDelayMinutesPerMile:
              hit.systematicDelayMinutesPerMile === null
                ? null
                : round(hit.systematicDelayMinutesPerMile, 4),
            stochasticDelayMinutesPerMile:
              hit.stochasticDelayMinutesPerMile === null
                ? null
                : round(hit.stochasticDelayMinutesPerMile, 4),
            spatialConfidence: feature.spatialConfidence,
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
              "Segment pace is descriptive and does not identify why the segment is slow.",
              "Dwell time, map matching, or short segments can inflate pace estimates.",
              "A slow daypart should not be generalized to all-day or route-wide performance without broader evidence.",
            ],
          },
          evidenceWeight: 0.5,
          note: "Review spatial confidence, segment length, and dwell-vs-running-time ambiguity before promotion.",
        }),
      );
    }

    coverage.push(
      buildCoverageAudit({
        auditId: stableId(detectorRunId, "audit", featureKey),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "segment",
        scopeId: featureKey,
        outcome: skip !== null ? skip.coverageOutcome : hit === undefined ? "clean_no_hit" : "hit",
        reasonCode: skip === null ? null : FindingReasonCodeSchema.parse(skip.reasonCode),
        reason: skip?.reason ?? null,
        inputsSeenJson: {
          routeId,
          segmentId: feature.segmentId,
          direction: feature.direction,
          daypart: feature.daypart,
          traversalCount: feature.traversalCount,
          medianPaceMinutesPerMile: feature.medianPaceMinutesPerMile,
          freeFlowPaceMinutesPerMile: feature.freeFlowPaceMinutesPerMile,
          segmentLengthFeet: feature.segmentLengthFeet,
          spatialConfidence: feature.spatialConfidence,
          quality: feature.quality,
        },
        inputsExpectedJson: {
          traversalCount: `>=${thresholds.minTraversals}`,
          segmentLengthFeet: `${thresholds.minSegmentLengthFeet}..${thresholds.maxSegmentLengthFeet}`,
          slownessIndex: `>=${thresholds.minSlownessIndex}`,
          candidateLimitPerRoute: thresholds.candidateLimitPerRoute,
          coverageStatus: "complete_or_partial",
          freshnessStatus: "fresh_or_not_expected",
        },
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
