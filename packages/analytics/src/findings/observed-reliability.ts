import { createHash } from "node:crypto";
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
  IsoMonthSchema,
  RouteIdSchema,
} from "@bp/domain";

export const OBSERVED_RELIABILITY_DETECTOR_ID = "observed_reliability";

export type ObservedReliabilityRouteInput = {
  routeId: string;
  reliabilityStatus: "observed" | "insufficient_gtfs_rt_samples" | "missing";
  sampleCount: number;
  minSampleThreshold: number;
  observedLongGapShare: number | null;
  waitReliabilityRatio: number | null;
  excessWaitMinutes: number | null;
  scheduledBaselineHeadwaySampleCount: number;
  busWaitAssessmentTripCount: number;
  busWaitAssessment: number | null;
};

export type ObservedReliabilityThresholds = {
  minGtfsRtHeadwaySamples: number;
  minScheduledBaselineSamples: number;
  minBusWaitAssessmentTrips: number;
  minObservedLongGapShare: number;
  minWaitReliabilityRatio: number;
  maxBusWaitAssessment: number;
  candidateLimit: number;
};

export const DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS: ObservedReliabilityThresholds = {
  minGtfsRtHeadwaySamples: 100,
  minScheduledBaselineSamples: 1,
  minBusWaitAssessmentTrips: 1,
  minObservedLongGapShare: 0.2,
  minWaitReliabilityRatio: 1.5,
  maxBusWaitAssessment: 0.75,
  candidateLimit: 100,
};

export type ObservedReliabilityDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  routes: ReadonlyArray<ObservedReliabilityRouteInput>;
  thresholds?: Partial<ObservedReliabilityThresholds>;
};

export type ObservedReliabilityDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type EvaluatedRoute = {
  route: ObservedReliabilityRouteInput;
  detectorScore: number;
  severity: "low" | "medium" | "high";
};

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function skippedReason(
  route: ObservedReliabilityRouteInput,
  thresholds: ObservedReliabilityThresholds,
): string | null {
  if (route.reliabilityStatus !== "observed") return "insufficient_gtfs_rt_samples";
  if (route.sampleCount < thresholds.minGtfsRtHeadwaySamples) {
    return "insufficient_gtfs_rt_samples";
  }
  if (route.scheduledBaselineHeadwaySampleCount < thresholds.minScheduledBaselineSamples) {
    return "missing_scheduled_baseline";
  }
  if (
    route.busWaitAssessmentTripCount < thresholds.minBusWaitAssessmentTrips ||
    route.busWaitAssessment === null
  ) {
    return "missing_bus_wait_assessment";
  }
  if (route.observedLongGapShare === null || route.waitReliabilityRatio === null) {
    return "missing_reliability_metric";
  }
  return null;
}

function evaluateRoute(
  route: ObservedReliabilityRouteInput,
  thresholds: ObservedReliabilityThresholds,
): EvaluatedRoute | null {
  if (route.observedLongGapShare === null || route.waitReliabilityRatio === null) return null;
  if (route.busWaitAssessment === null) return null;

  if (
    route.observedLongGapShare < thresholds.minObservedLongGapShare ||
    route.waitReliabilityRatio < thresholds.minWaitReliabilityRatio ||
    route.busWaitAssessment > thresholds.maxBusWaitAssessment
  ) {
    return null;
  }

  const longGapSignal = clamp(
    (route.observedLongGapShare - thresholds.minObservedLongGapShare) /
      (0.8 - thresholds.minObservedLongGapShare),
    0,
    1,
  );
  const waitRatioSignal = clamp(
    (Math.log(route.waitReliabilityRatio) - Math.log(thresholds.minWaitReliabilityRatio)) /
      (Math.log(10) - Math.log(thresholds.minWaitReliabilityRatio)),
    0,
    1,
  );
  const waitAssessmentSignal = clamp(
    (thresholds.maxBusWaitAssessment - route.busWaitAssessment) /
      (thresholds.maxBusWaitAssessment - 0.5),
    0,
    1,
  );
  const detectorScore = Math.round(
    60 + 40 * (0.45 * longGapSignal + 0.35 * waitRatioSignal + 0.2 * waitAssessmentSignal),
  );
  const severity = detectorScore >= 85 ? "high" : detectorScore >= 70 ? "medium" : "low";

  return { route, detectorScore, severity };
}

export function detectObservedReliability(
  input: ObservedReliabilityDetectorInput,
): ObservedReliabilityDetectorOutput {
  const detectorId = DetectorIdSchema.parse(OBSERVED_RELIABILITY_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("high_long_gap_share");
  const thresholds: ObservedReliabilityThresholds = {
    ...DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];
  const evaluated = new Map(
    input.routes
      .map((route) => [route.routeId, evaluateRoute(route, thresholds)] as const)
      .filter((entry): entry is readonly [string, EvaluatedRoute] => entry[1] !== null)
      .sort((left, right) => right[1].detectorScore - left[1].detectorScore)
      .slice(0, thresholds.candidateLimit),
  );

  for (const route of input.routes) {
    const routeId = RouteIdSchema.parse(route.routeId);
    const skipReason = skippedReason(route, thresholds);
    const hit = evaluated.get(route.routeId);

    if (skipReason === null && hit !== undefined) {
      const candidateId = stableId(detectorRunId, "candidate", routeId, reasonCode);
      candidates.push(
        FindingCandidateSchema.parse({
          candidateId,
          detectorId,
          detectorRunId,
          month,
          scopeKind: "route",
          scopeId: routeId,
          routeId,
          physicalId: null,
          category: "reliability",
          severity: hit.severity,
          confidence: route.sampleCount >= 500 ? "high" : "medium",
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Route ${routeId} has high observed long-gap reliability risk corroborated by Bus Wait Assessment.`,
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
            sampleCount: route.sampleCount,
            observedLongGapShare: route.observedLongGapShare,
            waitReliabilityRatio: route.waitReliabilityRatio,
            excessWaitMinutes: route.excessWaitMinutes,
            busWaitAssessmentTripCount: route.busWaitAssessmentTripCount,
            busWaitAssessment: route.busWaitAssessment,
          }),
          evidenceWeight: 1,
          note: null,
        }),
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "sample_limits"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "counter_evidence",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            reliabilityStatus: route.reliabilityStatus,
            sampleCount: route.sampleCount,
            minSampleThreshold: route.minSampleThreshold,
            configuredMinGtfsRtHeadwaySamples: thresholds.minGtfsRtHeadwaySamples,
            scheduledBaselineHeadwaySampleCount: route.scheduledBaselineHeadwaySampleCount,
            configuredMinScheduledBaselineSamples: thresholds.minScheduledBaselineSamples,
            busWaitAssessmentTripCount: route.busWaitAssessmentTripCount,
            configuredMinBusWaitAssessmentTrips: thresholds.minBusWaitAssessmentTrips,
            limitation:
              "Observed reliability is route-month evidence from available GTFS-RT and Bus Wait Assessment support; it does not explain cause and may hide direction or time-window differences.",
          }),
          evidenceWeight: 0.5,
          note: "Counter-evidence for reliability interpretation: review sample support, schedule baseline support, and aggregation limits before promotion.",
        }),
      );
    }

    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", routeId),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "route",
        scopeId: routeId,
        outcome:
          skipReason !== null
            ? "skipped_missing_input"
            : hit === undefined
              ? "clean_no_hit"
              : "hit",
        reasonCode: skipReason === null ? null : FindingReasonCodeSchema.parse(skipReason),
        reason: skipReason === null ? null : "Observed reliability detector input was incomplete.",
        inputsSeenJson: JSON.stringify(route),
        inputsExpectedJson: JSON.stringify({
          reliabilityStatus: "observed",
          sampleCount: `>=${thresholds.minGtfsRtHeadwaySamples}`,
          scheduledBaselineHeadwaySampleCount: `>=${thresholds.minScheduledBaselineSamples}`,
          busWaitAssessmentTripCount: `>=${thresholds.minBusWaitAssessmentTrips}`,
          observedLongGapShare: `>=${thresholds.minObservedLongGapShare}`,
          waitReliabilityRatio: `>=${thresholds.minWaitReliabilityRatio}`,
          busWaitAssessment: `<=${thresholds.maxBusWaitAssessment}`,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
