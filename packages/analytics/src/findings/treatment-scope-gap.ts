import {
  DetectorIdSchema,
  DetectorRunIdSchema,
  type FindingCandidate,
  FindingCandidateSchema,
  type FindingCoverageAudit,
  FindingCoverageAuditSchema,
  type FindingEvidenceLink,
  FindingEvidenceLinkSchema,
  FindingReasonCodeSchema,
} from "@bp/domain/findings";
import { IsoMonthSchema, RouteIdSchema } from "@bp/domain/primitives";
import { stableId } from "../core/ids.js";
import { clamp, mergeThresholds, round } from "../core/numbers.js";
import { severityFromScore } from "../core/scoring.js";

export const TREATMENT_SCOPE_GAP_DETECTOR_ID = "treatment_scope_gap";

export type TreatmentScopeGapSegmentInput = {
  routeId: string;
  segmentId: string;
  directionId: string | null;
  segmentOrder: number | null;
  directionMaxSegmentOrder?: number | null;
  averageSpeedMph: number | null;
  segmentLengthFeet: number | null;
  observationCount: number | null;
  busTripCount: number | null;
  daypartSpeeds: readonly {
    daypart: string;
    averageSpeedMph: number | null;
    observationCount: number;
    busTripCount: number;
  }[];
  slowestDaypart: string | null;
  slowestDaypartAverageSpeedMph: number | null;
  routeMedianSegmentSpeedMph: number | null;
  routeSegmentSpeedRank: number | null;
  routeSegmentCount: number | null;
  routeSlownessPercentile: number | null;
  networkMedianSegmentSpeedMph: number | null;
  networkSegmentSpeedRank: number | null;
  networkSegmentCount: number | null;
  networkSlownessPercentile: number | null;
  speedResidualContext?: {
    expectedSpeedMph: number;
    speedResidualMph: number;
    residualPercentileWithinMonth: number;
    residualRankWithinMonth: number;
    residualMonthCount: number;
    segmentHistoryMeanSpeedMph: number;
    segmentHistoryMedianSpeedMph: number;
    segmentHistoryMonthCount: number;
    routeMonthMeanSpeedMph: number;
    routeHistoryMeanSpeedMph: number;
    modelId: string;
  } | null;
  treatmentType: string | null;
  treatmentStatus: string | null;
  matchMethod: string | null;
  overlapShare: number | null;
  routeTreatmentSourceRefs: readonly string[];
  segmentTreatmentSourceRefs: readonly string[];
  positiveRouteTreatmentCount: number;
  positiveSegmentTreatmentCount: number;
  treatmentScopeFitContext?: {
    fitStatus:
      | "covered"
      | "partial_confirmed"
      | "true_uncovered"
      | "route_only"
      | "geometry_unavailable"
      | "source_gap_blocked"
      | "not_applicable";
    sourceGapCount: number;
    sourceGapKinds: readonly string[];
    blocksClaims: readonly string[];
  } | null;
};

export type TreatmentScopeGapThresholds = {
  maxAverageSpeedMph: number;
  minObservationCount: number;
  minSegmentLengthFeet: number;
  minCoveredOverlapShare: number;
  minRouteTreatmentCount: number;
  highConfidenceObservationCount: number;
  terminalLongSegmentFeet: number;
  terminalMinPeakOffPeakGradientMph: number;
  residualMinHistoryMonths: number;
  residualMaxExpectedSlowMph: number;
  candidateLimit: number;
};

export const DEFAULT_TREATMENT_SCOPE_GAP_THRESHOLDS: TreatmentScopeGapThresholds = {
  maxAverageSpeedMph: 6,
  minObservationCount: 50,
  minSegmentLengthFeet: 300,
  minCoveredOverlapShare: 0.2,
  minRouteTreatmentCount: 1,
  highConfidenceObservationCount: 100,
  terminalLongSegmentFeet: 1500,
  terminalMinPeakOffPeakGradientMph: 1,
  residualMinHistoryMonths: 12,
  residualMaxExpectedSlowMph: 0,
  candidateLimit: 100,
};

export type TreatmentScopeGapDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  segments: ReadonlyArray<TreatmentScopeGapSegmentInput>;
  thresholds?: Partial<TreatmentScopeGapThresholds>;
};

export type TreatmentScopeGapDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type SegmentHit = {
  segment: TreatmentScopeGapSegmentInput;
  detectorScore: number;
};

function isCoveredByPositiveSegmentTreatment(
  segment: TreatmentScopeGapSegmentInput,
  thresholds: TreatmentScopeGapThresholds,
): boolean {
  return (
    segment.treatmentType === "bus_lane" &&
    segment.matchMethod === "route_shape_overlap" &&
    segment.overlapShare !== null &&
    segment.overlapShare >= thresholds.minCoveredOverlapShare &&
    (segment.treatmentStatus === "current_confirmed" ||
      segment.treatmentStatus === "implemented" ||
      segment.treatmentStatus === "historical_confirmed")
  );
}

function isPartialPositiveSegmentTreatment(
  segment: TreatmentScopeGapSegmentInput,
  thresholds: TreatmentScopeGapThresholds,
): boolean {
  return (
    segment.treatmentType === "bus_lane" &&
    segment.matchMethod === "route_shape_overlap" &&
    segment.overlapShare !== null &&
    segment.overlapShare > 0 &&
    segment.overlapShare < thresholds.minCoveredOverlapShare &&
    (segment.treatmentStatus === "current_confirmed" ||
      segment.treatmentStatus === "implemented" ||
      segment.treatmentStatus === "historical_confirmed")
  );
}

function hasGeometryUnavailable(segment: TreatmentScopeGapSegmentInput): boolean {
  return (
    segment.matchMethod === null ||
    segment.matchMethod === "source_only" ||
    segment.overlapShare === null
  );
}

function isTrueUncoveredSegment(segment: TreatmentScopeGapSegmentInput): boolean {
  return (
    segment.treatmentType === null ||
    segment.treatmentStatus === null ||
    segment.matchMethod === "not_matched" ||
    segment.overlapShare === 0
  );
}

function daypartSpeed(segment: TreatmentScopeGapSegmentInput, daypart: string): number | null {
  return segment.daypartSpeeds.find((row) => row.daypart === daypart)?.averageSpeedMph ?? null;
}

function hasPeakOffPeakGradient(
  segment: TreatmentScopeGapSegmentInput,
  thresholds: TreatmentScopeGapThresholds,
): boolean {
  const peakSpeeds = [daypartSpeed(segment, "am_peak"), daypartSpeed(segment, "pm_peak")].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const offPeakSpeed = daypartSpeed(segment, "off_peak") ?? daypartSpeed(segment, "midday");
  if (peakSpeeds.length === 0 || offPeakSpeed === null) return false;
  return offPeakSpeed - Math.min(...peakSpeeds) >= thresholds.terminalMinPeakOffPeakGradientMph;
}

function isTerminalOrLayoverLikeSegment(
  segment: TreatmentScopeGapSegmentInput,
  thresholds: TreatmentScopeGapThresholds,
): boolean {
  const order = segment.segmentOrder;
  if (order === null) return false;
  const maxOrder = segment.directionMaxSegmentOrder ?? null;
  const isTerminal = order === 1 || (maxOrder !== null && order >= maxOrder);
  if (!isTerminal) return false;
  return (
    (segment.segmentLengthFeet ?? 0) < thresholds.terminalLongSegmentFeet ||
    !hasPeakOffPeakGradient(segment, thresholds)
  );
}

function isResidualExpectedSlowSegment(
  segment: TreatmentScopeGapSegmentInput,
  thresholds: TreatmentScopeGapThresholds,
): boolean {
  const residual = segment.speedResidualContext ?? null;
  if (residual === null) return false;
  return (
    residual.segmentHistoryMonthCount >= thresholds.residualMinHistoryMonths &&
    residual.routeHistoryMeanSpeedMph <= thresholds.maxAverageSpeedMph &&
    residual.speedResidualMph >= thresholds.residualMaxExpectedSlowMph &&
    residual.residualPercentileWithinMonth >= 0.5
  );
}

function physicalSegmentKey(segmentId: string): string {
  const parts = segmentId.split(":");
  if (parts.length < 6) return segmentId;
  return [parts[2], parts[4], parts[5]].join(":");
}

function skipReason(
  segment: TreatmentScopeGapSegmentInput,
  thresholds: TreatmentScopeGapThresholds,
): { reasonCode: string; reason: string; outcome: "skipped_missing_input" | "skipped_failed_join" } | null {
  if (segment.positiveRouteTreatmentCount < thresholds.minRouteTreatmentCount) {
    return {
      reasonCode: "treatment_segment_gap",
      reason: "Route does not have enough positive route-level bus-lane treatment evidence.",
      outcome: "skipped_missing_input",
    };
  }
  if (
    segment.averageSpeedMph === null ||
    segment.segmentLengthFeet === null ||
    segment.observationCount === null ||
    segment.busTripCount === null
  ) {
    return {
      reasonCode: "missing_speed",
      reason: "Segment speed summary is unavailable.",
      outcome: "skipped_missing_input",
    };
  }
  if (segment.observationCount < thresholds.minObservationCount || segment.busTripCount <= 0) {
    return {
      reasonCode: "insufficient_speed_observations",
      reason: "Segment speed observations are below the detector minimum.",
      outcome: "skipped_missing_input",
    };
  }
  if (segment.segmentLengthFeet < thresholds.minSegmentLengthFeet) {
    return {
      reasonCode: "segment_too_short",
      reason: "Segment is shorter than the configured minimum for reliable treatment-scope review.",
      outcome: "skipped_failed_join",
    };
  }
  if (isTerminalOrLayoverLikeSegment(segment, thresholds)) {
    return {
      reasonCode: "terminal_or_layover",
      reason:
        "First/last direction segment lacks enough length and peak/off-peak contrast to separate curb friction from terminal or layover dwell.",
      outcome: "skipped_failed_join",
    };
  }
  const fitStatus = segment.treatmentScopeFitContext?.fitStatus ?? null;
  if (fitStatus === "source_gap_blocked") {
    return {
      reasonCode: "treatment_source_gap",
      reason:
        "The intervention scope-fit model says a source gap blocks uncovered-treatment claims for this segment.",
      outcome: "skipped_missing_input",
    };
  }
  if (fitStatus === "covered") {
    return {
      reasonCode: "spatial_join_uncertain",
      reason:
        "The intervention scope-fit model says this segment is covered; use treatment_scope_mismatch instead.",
      outcome: "skipped_failed_join",
    };
  }
  if (fitStatus === "partial_confirmed") {
    return {
      reasonCode: "partial_confirmed_coverage",
      reason:
        "The intervention scope-fit model says this segment has confirmed partial treatment coverage; treat as context, not an uncovered scope gap.",
      outcome: "skipped_failed_join",
    };
  }
  if (fitStatus === "geometry_unavailable") {
    return {
      reasonCode: "geometry_unavailable",
      reason:
        "The intervention scope-fit model says treatment geometry is unavailable, so uncovered-scope language is unsafe.",
      outcome: "skipped_failed_join",
    };
  }
  if (fitStatus !== null && fitStatus !== "true_uncovered") {
    return {
      reasonCode: "spatial_join_uncertain",
      reason: `The intervention scope-fit model returned ${fitStatus}, not true_uncovered.`,
      outcome: "skipped_failed_join",
    };
  }
  if (isCoveredByPositiveSegmentTreatment(segment, thresholds)) {
    return {
      reasonCode: "spatial_join_uncertain",
      reason: "Segment already has positive bus-lane overlap; use treatment_scope_mismatch instead.",
      outcome: "skipped_failed_join",
    };
  }
  if (isPartialPositiveSegmentTreatment(segment, thresholds)) {
    return {
      reasonCode: "partial_confirmed_coverage",
      reason: "Segment has confirmed partial bus-lane overlap; treat as context, not an uncovered scope gap.",
      outcome: "skipped_failed_join",
    };
  }
  if (hasGeometryUnavailable(segment)) {
    return {
      reasonCode: "geometry_unavailable",
      reason: "Segment treatment geometry is unavailable or source-only, so uncovered-scope language is unsafe.",
      outcome: "skipped_failed_join",
    };
  }
  if (!isTrueUncoveredSegment(segment)) {
    return {
      reasonCode: "spatial_join_uncertain",
      reason: "Segment treatment join state is not a true uncovered segment.",
      outcome: "skipped_failed_join",
    };
  }
  if (isResidualExpectedSlowSegment(segment, thresholds)) {
    return {
      reasonCode: "residual_not_worse_than_expected",
      reason:
        "Residual model says this uncovered slow segment is not worse than its segment-history and route-month expected speed.",
      outcome: "skipped_failed_join",
    };
  }
  return null;
}

function evaluateSegment(
  segment: TreatmentScopeGapSegmentInput,
  thresholds: TreatmentScopeGapThresholds,
): SegmentHit | null {
  const skip = skipReason(segment, thresholds);
  if (skip !== null || segment.averageSpeedMph === null) return null;
  if (segment.averageSpeedMph > thresholds.maxAverageSpeedMph) return null;

  const speedSignal = clamp(
    (thresholds.maxAverageSpeedMph - segment.averageSpeedMph) / thresholds.maxAverageSpeedMph,
    0,
    1,
  );
  const routePeerSignal = segment.routeSlownessPercentile ?? 0.5;
  const networkPeerSignal = segment.networkSlownessPercentile ?? 0.5;
  const gapSignal = segment.overlapShare === null ? 1 : clamp(1 - segment.overlapShare, 0, 1);
  return {
    segment,
    detectorScore: Math.round(
      52 + 48 * (0.5 * speedSignal + 0.2 * routePeerSignal + 0.15 * networkPeerSignal + 0.15 * gapSignal),
    ),
  };
}

function confidenceFor(
  hit: SegmentHit,
  thresholds: TreatmentScopeGapThresholds,
): "low" | "medium" | "high" {
  const observations = hit.segment.observationCount ?? 0;
  if (observations >= thresholds.highConfidenceObservationCount && hit.segment.overlapShare === null) {
    return "high";
  }
  return observations >= thresholds.minObservationCount ? "medium" : "low";
}

export function detectTreatmentScopeGaps(
  input: TreatmentScopeGapDetectorInput,
): TreatmentScopeGapDetectorOutput {
  const detectorId = DetectorIdSchema.parse(TREATMENT_SCOPE_GAP_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("treated_route_uncovered_slow_segment");
  const thresholds = mergeThresholds(DEFAULT_TREATMENT_SCOPE_GAP_THRESHOLDS, input.thresholds);

  const bestHitByRoute = new Map<string, SegmentHit>();
  const seenPhysicalSegments = new Set<string>();
  for (const hit of input.segments
    .map((segment) => evaluateSegment(segment, thresholds))
    .filter((hit): hit is SegmentHit => hit !== null)
    .sort(
      (left, right) =>
        right.detectorScore - left.detectorScore ||
        (left.segment.averageSpeedMph ?? 0) - (right.segment.averageSpeedMph ?? 0) ||
        left.segment.segmentId.localeCompare(right.segment.segmentId),
    )) {
    const physicalKey = physicalSegmentKey(hit.segment.segmentId);
    if (bestHitByRoute.has(hit.segment.routeId) || seenPhysicalSegments.has(physicalKey)) continue;
    bestHitByRoute.set(hit.segment.routeId, hit);
    seenPhysicalSegments.add(physicalKey);
  }

  const selected = new Map(
    [...bestHitByRoute.values()]
      .sort(
        (left, right) =>
          right.detectorScore - left.detectorScore ||
          (left.segment.averageSpeedMph ?? 0) - (right.segment.averageSpeedMph ?? 0) ||
          left.segment.segmentId.localeCompare(right.segment.segmentId),
      )
      .slice(0, thresholds.candidateLimit)
      .map((hit) => [hit.segment.segmentId, hit] as const),
  );

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];

  for (const segment of input.segments) {
    const routeId = RouteIdSchema.parse(segment.routeId);
    const skip = skipReason(segment, thresholds);
    const hit = selected.get(segment.segmentId);
    const outcome = skip !== null ? skip.outcome : hit === undefined ? "clean_no_hit" : "hit";

    if (hit !== undefined) {
      const candidateId = stableId(detectorRunId, "candidate", routeId, segment.segmentId);
      const speed = round(hit.segment.averageSpeedMph ?? 0, 1);
      candidates.push(
        FindingCandidateSchema.parse({
          candidateId,
          detectorId,
          detectorRunId,
          month,
          scopeKind: "segment",
          scopeId: segment.segmentId,
          routeId,
          physicalId: segment.segmentId,
          category: "intervention",
          severity: severityFromScore(hit.detectorScore),
          confidence: confidenceFor(hit, thresholds),
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Route ${routeId} has bus-lane treatment evidence, but segment ${segment.segmentId} is a slow uncovered or weakly covered segment at ${speed} mph; review whether the known treatment scope misses the bottleneck.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "metric"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            segmentId: segment.segmentId,
            directionId: segment.directionId,
            segmentOrder: segment.segmentOrder,
            directionMaxSegmentOrder: segment.directionMaxSegmentOrder ?? null,
            averageSpeedMph: hit.segment.averageSpeedMph,
            segmentLengthFeet: hit.segment.segmentLengthFeet,
            observationCount: hit.segment.observationCount,
            busTripCount: hit.segment.busTripCount,
            treatmentType: segment.treatmentType,
            treatmentStatus: segment.treatmentStatus,
            matchMethod: segment.matchMethod,
            overlapShare: segment.overlapShare,
            positiveRouteTreatmentCount: segment.positiveRouteTreatmentCount,
            positiveSegmentTreatmentCount: segment.positiveSegmentTreatmentCount,
            treatmentScopeFitContext: segment.treatmentScopeFitContext ?? null,
            speedResidualContext: segment.speedResidualContext ?? null,
            routeTreatmentSourceRefs: segment.routeTreatmentSourceRefs,
            segmentTreatmentSourceRefs: segment.segmentTreatmentSourceRefs,
          }),
          evidenceWeight: 1,
          note: null,
        }),
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "peer_daypart_context"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "context",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            segmentId: segment.segmentId,
            daypartSpeeds: hit.segment.daypartSpeeds,
            slowestDaypart: hit.segment.slowestDaypart,
            slowestDaypartAverageSpeedMph: hit.segment.slowestDaypartAverageSpeedMph,
            routePeerContext: {
              method: "same_route_current_month_segment_speed_rank",
              medianSegmentSpeedMph: hit.segment.routeMedianSegmentSpeedMph,
              speedRankAscending: hit.segment.routeSegmentSpeedRank,
              segmentCount: hit.segment.routeSegmentCount,
              slownessPercentile: hit.segment.routeSlownessPercentile,
            },
            networkPeerContext: {
              method: "network_current_month_segment_speed_rank",
              medianSegmentSpeedMph: hit.segment.networkMedianSegmentSpeedMph,
              speedRankAscending: hit.segment.networkSegmentSpeedRank,
              segmentCount: hit.segment.networkSegmentCount,
              slownessPercentile: hit.segment.networkSlownessPercentile,
            },
            speedResidualContext: hit.segment.speedResidualContext ?? null,
          }),
          evidenceWeight: 0.8,
          note:
            "Peer/daypart context for reviewer calibration: this identifies a possible treatment-scope miss, not a causal failure.",
        }),
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "scope_limits"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "counter_evidence",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            segmentId: segment.segmentId,
            configuredMaxAverageSpeedMph: thresholds.maxAverageSpeedMph,
            configuredMinSegmentLengthFeet: thresholds.minSegmentLengthFeet,
            configuredMinCoveredOverlapShare: thresholds.minCoveredOverlapShare,
            overlapShare: segment.overlapShare,
            treatmentScopeFitContext: segment.treatmentScopeFitContext ?? null,
            speedResidualContext: segment.speedResidualContext ?? null,
            limitation:
              "A weak or missing segment treatment overlap can reflect incomplete geometry coverage, route-shape mismatch, or a treatment intended for a different part of the route.",
          }),
          evidenceWeight: 0.5,
          note: "Counter-evidence for scope-gap interpretation: verify treatment geometry and source inventory before promotion.",
        }),
      );
    }

    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", segment.segmentId),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "segment",
        scopeId: segment.segmentId,
        outcome,
        reasonCode: skip === null ? null : FindingReasonCodeSchema.parse(skip.reasonCode),
        reason: skip?.reason ?? null,
        inputsSeenJson: JSON.stringify(segment),
        inputsExpectedJson: JSON.stringify({
          positiveRouteTreatmentCount: `>=${thresholds.minRouteTreatmentCount}`,
          averageSpeedMph: `<=${thresholds.maxAverageSpeedMph}`,
          segmentLengthFeet: `>=${thresholds.minSegmentLengthFeet}`,
          observationCount: `>=${thresholds.minObservationCount}`,
          coveredSegmentTreatment: `no positive bus-lane segment overlap >=${thresholds.minCoveredOverlapShare}`,
          speedResidualContext:
            "segment_speed_residuals_v1 expected-speed/residual context when available",
          residualGate: `skip when history months >=${thresholds.residualMinHistoryMonths} and residual >=${thresholds.residualMaxExpectedSlowMph} mph`,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
