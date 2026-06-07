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

export const TREATMENT_SCOPE_MISMATCH_DETECTOR_ID = "treatment_scope_mismatch";

export type TreatmentScopeMismatchSegmentInput = {
  routeId: string;
  segmentId: string;
  directionId: string | null;
  segmentOrder: number | null;
  directionMaxSegmentOrder?: number | null;
  treatmentType: string;
  treatmentStatus: string;
  matchMethod: string;
  overlapShare: number | null;
  treatmentConfidence: string;
  treatmentSourceRefs: readonly string[];
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
  historicalSpeedContext: {
    monthCount: number;
    priorMonthAverageSpeedMph: number | null;
    prior12MedianSpeedMph: number | null;
    releaseVsPrior12DeltaMph: number | null;
    slowestMonth: string | null;
    slowestMonthAverageSpeedMph: number | null;
  } | null;
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
  routeMedianSegmentSpeedMph: number | null;
  routeSegmentSpeedRank: number | null;
  routeSegmentCount: number | null;
  routeSlownessPercentile: number | null;
  networkMedianSegmentSpeedMph: number | null;
  networkSegmentSpeedRank: number | null;
  networkSegmentCount: number | null;
  networkSlownessPercentile: number | null;
};

export type TreatmentScopeMismatchThresholds = {
  maxAverageSpeedMph: number;
  minObservationCount: number;
  minSegmentLengthFeet: number;
  minOverlapShare: number;
  highConfidenceOverlapShare: number;
  highConfidenceObservationCount: number;
  terminalLongSegmentFeet: number;
  terminalMinPeakOffPeakGradientMph: number;
  historicalStableDeltaMph: number;
  residualMinHistoryMonths: number;
  residualMaxExpectedSlowMph: number;
  candidateLimit: number;
};

export const DEFAULT_TREATMENT_SCOPE_MISMATCH_THRESHOLDS: TreatmentScopeMismatchThresholds = {
  maxAverageSpeedMph: 6,
  minObservationCount: 50,
  minSegmentLengthFeet: 300,
  minOverlapShare: 0.2,
  highConfidenceOverlapShare: 0.6,
  highConfidenceObservationCount: 100,
  terminalLongSegmentFeet: 1500,
  terminalMinPeakOffPeakGradientMph: 1,
  historicalStableDeltaMph: 0,
  residualMinHistoryMonths: 12,
  residualMaxExpectedSlowMph: 0,
  candidateLimit: 100,
};

export type TreatmentScopeMismatchDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  segments: ReadonlyArray<TreatmentScopeMismatchSegmentInput>;
  thresholds?: Partial<TreatmentScopeMismatchThresholds>;
};

export type TreatmentScopeMismatchDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type SegmentHit = {
  segment: TreatmentScopeMismatchSegmentInput;
  detectorScore: number;
};

function isPositiveBusLaneSegment(segment: TreatmentScopeMismatchSegmentInput): boolean {
  return (
    segment.treatmentType === "bus_lane" &&
    segment.matchMethod === "route_shape_overlap" &&
    (segment.treatmentStatus === "current_confirmed" ||
      segment.treatmentStatus === "implemented" ||
      segment.treatmentStatus === "historical_confirmed")
  );
}

function daypartSpeed(segment: TreatmentScopeMismatchSegmentInput, daypart: string): number | null {
  return segment.daypartSpeeds.find((row) => row.daypart === daypart)?.averageSpeedMph ?? null;
}

function hasPeakOffPeakGradient(
  segment: TreatmentScopeMismatchSegmentInput,
  thresholds: TreatmentScopeMismatchThresholds,
): boolean {
  const peakSpeeds = [daypartSpeed(segment, "am_peak"), daypartSpeed(segment, "pm_peak")].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const offPeakSpeed = daypartSpeed(segment, "off_peak") ?? daypartSpeed(segment, "midday");
  if (peakSpeeds.length === 0 || offPeakSpeed === null) return false;
  return offPeakSpeed - Math.min(...peakSpeeds) >= thresholds.terminalMinPeakOffPeakGradientMph;
}

function isTerminalOrLayoverLikeSegment(
  segment: TreatmentScopeMismatchSegmentInput,
  thresholds: TreatmentScopeMismatchThresholds,
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

function isHistoricallyStableSlowSegment(
  segment: TreatmentScopeMismatchSegmentInput,
  thresholds: TreatmentScopeMismatchThresholds,
): boolean {
  const context = segment.historicalSpeedContext;
  if (context === null) return false;
  if (context.prior12MedianSpeedMph === null || context.releaseVsPrior12DeltaMph === null) return false;
  return (
    context.monthCount >= 12 &&
    context.prior12MedianSpeedMph <= thresholds.maxAverageSpeedMph &&
    context.releaseVsPrior12DeltaMph >= thresholds.historicalStableDeltaMph
  );
}

function isResidualExpectedSlowSegment(
  segment: TreatmentScopeMismatchSegmentInput,
  thresholds: TreatmentScopeMismatchThresholds,
): boolean {
  const residual = segment.speedResidualContext ?? null;
  if (residual === null) return false;
  return (
    residual.segmentHistoryMonthCount >= thresholds.residualMinHistoryMonths &&
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
  segment: TreatmentScopeMismatchSegmentInput,
  thresholds: TreatmentScopeMismatchThresholds,
): { reasonCode: string; reason: string; outcome: "skipped_missing_input" | "skipped_failed_join" } | null {
  if (segment.treatmentType !== "bus_lane") {
    return {
      reasonCode: "treatment_segment_gap",
      reason: "Segment treatment row is not a bus-lane context row.",
      outcome: "skipped_missing_input",
    };
  }
  if (segment.matchMethod !== "route_shape_overlap" || segment.overlapShare === null) {
    return {
      reasonCode: "spatial_join_uncertain",
      reason: "Bus-lane segment overlap is missing or not route-shape derived.",
      outcome: "skipped_failed_join",
    };
  }
  if (segment.overlapShare < thresholds.minOverlapShare) {
    return {
      reasonCode: "spatial_join_uncertain",
      reason: "Bus-lane overlap share is below the detector minimum.",
      outcome: "skipped_failed_join",
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
      reason: "Segment is shorter than the configured minimum for reliable treatment-scope speed review.",
      outcome: "skipped_failed_join",
    };
  }
  if (isTerminalOrLayoverLikeSegment(segment, thresholds)) {
    return {
      reasonCode: "terminal_or_layover",
      reason:
        "First/last direction segment lacks enough length and peak/off-peak contrast to separate bus-lane underperformance from terminal or layover dwell.",
      outcome: "skipped_failed_join",
    };
  }
  if (isHistoricallyStableSlowSegment(segment, thresholds)) {
    return {
      reasonCode: "historically_stable_slow_segment",
      reason:
        "Segment is chronically slow and not worse than its prior-12-month median, so mismatch language should remain context-only.",
      outcome: "skipped_failed_join",
    };
  }
  if (isResidualExpectedSlowSegment(segment, thresholds)) {
    return {
      reasonCode: "residual_not_worse_than_expected",
      reason:
        "Residual model says this slow segment is not worse than its segment-history and route-month expected speed.",
      outcome: "skipped_failed_join",
    };
  }
  return null;
}

function evaluateSegment(
  segment: TreatmentScopeMismatchSegmentInput,
  thresholds: TreatmentScopeMismatchThresholds,
): SegmentHit | null {
  if (!isPositiveBusLaneSegment(segment)) return null;
  const skip = skipReason(segment, thresholds);
  if (skip !== null || segment.averageSpeedMph === null) return null;
  if (segment.averageSpeedMph > thresholds.maxAverageSpeedMph) return null;

  const speedSignal = clamp(
    (thresholds.maxAverageSpeedMph - segment.averageSpeedMph) / thresholds.maxAverageSpeedMph,
    0,
    1,
  );
  const residual = segment.speedResidualContext ?? null;
  const residualMagnitudeSignal =
    residual === null ? 0.35 : clamp(-residual.speedResidualMph / 3, 0, 1);
  const residualTailSignal =
    residual === null ? 0.35 : clamp(1 - residual.residualPercentileWithinMonth, 0, 1);
  const overlapSignal = clamp((segment.overlapShare ?? 0) / 1, 0, 1);
  const routePeerSignal = segment.routeSlownessPercentile ?? 0.5;
  const networkPeerSignal = segment.networkSlownessPercentile ?? 0.5;
  return {
    segment,
    detectorScore: Math.round(
      55 +
        45 *
          (0.35 * speedSignal +
            0.2 * residualMagnitudeSignal +
            0.15 * residualTailSignal +
            0.15 * overlapSignal +
            0.1 * routePeerSignal +
            0.05 * networkPeerSignal),
    ),
  };
}

function confidenceFor(
  hit: SegmentHit,
  thresholds: TreatmentScopeMismatchThresholds,
): "low" | "medium" | "high" {
  const overlap = hit.segment.overlapShare ?? 0;
  const observations = hit.segment.observationCount ?? 0;
  if (
    overlap >= thresholds.highConfidenceOverlapShare &&
    observations >= thresholds.highConfidenceObservationCount
  ) {
    return "high";
  }
  return overlap >= thresholds.minOverlapShare ? "medium" : "low";
}

export function detectTreatmentScopeMismatch(
  input: TreatmentScopeMismatchDetectorInput,
): TreatmentScopeMismatchDetectorOutput {
  const detectorId = DetectorIdSchema.parse(TREATMENT_SCOPE_MISMATCH_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("bus_lane_slow_segment");
  const thresholds = mergeThresholds(DEFAULT_TREATMENT_SCOPE_MISMATCH_THRESHOLDS, input.thresholds);

  const selectedHits: SegmentHit[] = [];
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
    if (seenPhysicalSegments.has(physicalKey)) continue;
    selectedHits.push(hit);
    seenPhysicalSegments.add(physicalKey);
    if (selectedHits.length >= thresholds.candidateLimit) break;
  }
  const selected = new Map(selectedHits.map((hit) => [hit.segment.segmentId, hit] as const));

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];

  for (const segment of input.segments) {
    const routeId = RouteIdSchema.parse(segment.routeId);
    const skip = skipReason(segment, thresholds);
    const hit = selected.get(segment.segmentId);
    const outcome =
      skip !== null
        ? skip.outcome
        : hit === undefined
          ? "clean_no_hit"
          : "hit";

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
          claimText: `Route ${routeId} segment ${segment.segmentId} overlaps bus-lane geometry but still averages ${speed} mph; review scope, enforcement, and peer context before underperformance language.`,
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
            treatmentConfidence: segment.treatmentConfidence,
            treatmentSourceRefs: segment.treatmentSourceRefs,
            historicalSpeedContext: segment.historicalSpeedContext,
            speedResidualContext: segment.speedResidualContext ?? null,
            peerContext: {
              routeMedianSegmentSpeedMph: segment.routeMedianSegmentSpeedMph,
              routeSegmentSpeedRank: segment.routeSegmentSpeedRank,
              routeSegmentCount: segment.routeSegmentCount,
              routeSlownessPercentile: segment.routeSlownessPercentile,
              networkMedianSegmentSpeedMph: segment.networkMedianSegmentSpeedMph,
              networkSegmentSpeedRank: segment.networkSegmentSpeedRank,
              networkSegmentCount: segment.networkSegmentCount,
              networkSlownessPercentile: segment.networkSlownessPercentile,
            },
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
            averageSpeedMph: hit.segment.averageSpeedMph,
            segmentLengthFeet: hit.segment.segmentLengthFeet,
            daypartSpeeds: hit.segment.daypartSpeeds,
            slowestDaypart: hit.segment.slowestDaypart,
            slowestDaypartAverageSpeedMph: hit.segment.slowestDaypartAverageSpeedMph,
            historicalSpeedContext: hit.segment.historicalSpeedContext,
            speedResidualContext: hit.segment.speedResidualContext ?? null,
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
          }),
          evidenceWeight: 0.8,
          note:
            "Peer/daypart context for reviewer calibration: ranks are descriptive current-month baselines, not causal controls.",
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
            configuredMinOverlapShare: thresholds.minOverlapShare,
            overlapShare: segment.overlapShare,
            routeSegmentSpeedRank: segment.routeSegmentSpeedRank,
            routeSegmentCount: segment.routeSegmentCount,
            networkSegmentSpeedRank: segment.networkSegmentSpeedRank,
            networkSegmentCount: segment.networkSegmentCount,
            speedResidualContext: segment.speedResidualContext ?? null,
            limitation:
              "Bus-lane overlap is route-shape geometry context, not audited lane-mile inventory; a slow current segment can still be improved versus peers or prior months.",
          }),
          evidenceWeight: 0.5,
          note: "Counter-evidence for treatment-scope interpretation: review peer/daypart baseline, lane geometry, and enforcement before promotion.",
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
          treatmentType: "bus_lane",
          treatmentStatus: ["current_confirmed", "implemented", "historical_confirmed"],
          matchMethod: "route_shape_overlap",
          overlapShare: `>=${thresholds.minOverlapShare}`,
          averageSpeedMph: `<=${thresholds.maxAverageSpeedMph}`,
          segmentLengthFeet: `>=${thresholds.minSegmentLengthFeet}`,
          observationCount: `>=${thresholds.minObservationCount}`,
          peerDaypartContext: "descriptive_current_month_rank_and_daypart_profile",
          historicalSpeedContext: "same_segment_monthly_speed_summary_when_available",
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
