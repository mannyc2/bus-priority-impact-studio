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
} from "@bp/domain/findings";
import { IsoMonthSchema, RouteIdSchema } from "@bp/domain/primitives";

export const INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID = "intervention_underperformance";

export type InterventionUnderperformanceComparisonInput = {
  eventId: string;
  interventionType: string;
  comparisonStatus: string;
  adjustedSpeedDeltaMph: number | null;
  comparisonRouteCount: number;
};

export type InterventionUnderperformanceRouteInput = {
  routeId: string;
  speedPainScore: number | null;
  reliabilityPainScore: number | null;
  comparisons: ReadonlyArray<InterventionUnderperformanceComparisonInput>;
};

export type InterventionUnderperformanceThresholds = {
  minPainScore: number;
  maxAdjustedSpeedDeltaMph: number;
  minComparisonRouteCount: number;
  candidateLimit: number;
};

export const DEFAULT_INTERVENTION_UNDERPERFORMANCE_THRESHOLDS: InterventionUnderperformanceThresholds =
  {
    minPainScore: 85,
    maxAdjustedSpeedDeltaMph: 0,
    minComparisonRouteCount: 1,
    candidateLimit: 100,
  };

export type InterventionUnderperformanceDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  routes: ReadonlyArray<InterventionUnderperformanceRouteInput>;
  thresholds?: Partial<InterventionUnderperformanceThresholds>;
};

export type InterventionUnderperformanceDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type Hit = {
  route: InterventionUnderperformanceRouteInput;
  comparison: InterventionUnderperformanceComparisonInput;
  speedPainScore: number;
  detectorScore: number;
};

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function bestHit(
  route: InterventionUnderperformanceRouteInput,
  thresholds: InterventionUnderperformanceThresholds,
): Hit | null {
  const speedPainScore = route.speedPainScore;
  if (speedPainScore === null || speedPainScore < thresholds.minPainScore) return null;

  const eligible = route.comparisons
    .filter(
      (comparison) =>
        comparison.comparisonStatus === "evaluated" &&
        comparison.adjustedSpeedDeltaMph !== null &&
        comparison.adjustedSpeedDeltaMph <= thresholds.maxAdjustedSpeedDeltaMph &&
        comparison.comparisonRouteCount >= thresholds.minComparisonRouteCount,
    )
    .sort((left, right) => (left.adjustedSpeedDeltaMph ?? 0) - (right.adjustedSpeedDeltaMph ?? 0));
  const comparison = eligible[0];
  if (comparison === undefined) return null;

  const underperformancePenalty = Math.min(10, Math.abs(comparison.adjustedSpeedDeltaMph ?? 0) * 2);
  return {
    route,
    comparison,
    speedPainScore,
    detectorScore: Math.min(100, Math.round(speedPainScore + underperformancePenalty)),
  };
}

export function detectInterventionUnderperformance(
  input: InterventionUnderperformanceDetectorInput,
): InterventionUnderperformanceDetectorOutput {
  const detectorId = DetectorIdSchema.parse(INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("negative_peer_adjusted_delta");
  const thresholds: InterventionUnderperformanceThresholds = {
    ...DEFAULT_INTERVENTION_UNDERPERFORMANCE_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };

  const hits = new Map(
    input.routes
      .map((route) => bestHit(route, thresholds))
      .filter((hit): hit is Hit => hit !== null)
      .sort((left, right) => right.detectorScore - left.detectorScore)
      .slice(0, thresholds.candidateLimit)
      .map((hit) => [hit.route.routeId, hit]),
  );
  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];

  for (const route of input.routes) {
    const routeId = RouteIdSchema.parse(route.routeId);
    const hasEvaluatedComparison = route.comparisons.some(
      (comparison) => comparison.comparisonStatus === "evaluated",
    );
    const hit = hits.get(route.routeId);

    if (hit !== undefined) {
      const candidateId = stableId(detectorRunId, "candidate", routeId, hit.comparison.eventId);
      const evaluatedComparisons = route.comparisons.filter(
        (comparison) => comparison.comparisonStatus === "evaluated",
      );
      const positiveAdjustedDeltaCount = evaluatedComparisons.filter(
        (comparison) =>
          comparison.adjustedSpeedDeltaMph !== null &&
          comparison.adjustedSpeedDeltaMph > thresholds.maxAdjustedSpeedDeltaMph,
      ).length;
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
          category: "intervention",
          severity: hit.detectorScore >= 95 ? "high" : "medium",
          confidence: hit.comparison.comparisonRouteCount >= 3 ? "medium" : "low",
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Route ${routeId} still has a high current speed-hotspot score after an evaluated bus-priority treatment with non-positive peer-adjusted speed delta.`,
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
            eventId: hit.comparison.eventId,
            interventionType: hit.comparison.interventionType,
            speedPainScore: route.speedPainScore,
            reliabilityPainScore: route.reliabilityPainScore,
            adjustedSpeedDeltaMph: hit.comparison.adjustedSpeedDeltaMph,
            comparisonRouteCount: hit.comparison.comparisonRouteCount,
          }),
          evidenceWeight: 1,
          note: null,
        }),
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "comparison_limits"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "counter_evidence",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            selectedEventId: hit.comparison.eventId,
            evaluatedComparisonCount: evaluatedComparisons.length,
            positiveAdjustedDeltaCount,
            selectedComparisonRouteCount: hit.comparison.comparisonRouteCount,
            configuredMinComparisonRouteCount: thresholds.minComparisonRouteCount,
            reliabilityPainScore: route.reliabilityPainScore,
            evaluatedComparisons: evaluatedComparisons.map((comparison) => ({
              eventId: comparison.eventId,
              interventionType: comparison.interventionType,
              adjustedSpeedDeltaMph: comparison.adjustedSpeedDeltaMph,
              comparisonRouteCount: comparison.comparisonRouteCount,
            })),
            limitation:
              "Peer-adjusted speed deltas are descriptive, not causal by themselves; route changes, window choice, and peer comparability can weaken an underperformance claim.",
          }),
          evidenceWeight: 0.5,
          note: "Counter-evidence for treatment underperformance: review peer count, comparison windows, and any positive evaluated comparisons.",
        }),
      );
    }

    const skippedReason =
      route.speedPainScore === null
        ? "missing_pain_signal"
        : hasEvaluatedComparison
          ? null
          : "missing_evaluated_intervention";
    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", routeId),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "route",
        scopeId: routeId,
        outcome:
          skippedReason !== null
            ? "skipped_missing_input"
            : hit === undefined
              ? "clean_no_hit"
              : "hit",
        reasonCode: skippedReason === null ? null : FindingReasonCodeSchema.parse(skippedReason),
        reason:
          skippedReason === null
            ? null
            : "Intervention underperformance detector input was incomplete.",
        inputsSeenJson: JSON.stringify(route),
        inputsExpectedJson: JSON.stringify({
          speedPainScore: `>=${thresholds.minPainScore}`,
          comparisonStatus: "evaluated",
          adjustedSpeedDeltaMph: `<=${thresholds.maxAdjustedSpeedDeltaMph}`,
          comparisonRouteCount: `>=${thresholds.minComparisonRouteCount}`,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
