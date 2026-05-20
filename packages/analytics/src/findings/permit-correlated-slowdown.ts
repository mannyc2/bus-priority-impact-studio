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
  type RouteMonthSignalFeature,
} from "@bp/domain";

export const PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID = "permit_correlated_slowdown";

export type PermitCorrelatedSlowdownThresholds = {
  maxRouteWeightedAverageSpeedMph: number;
  minHotspotScore: number;
  minSpeedObservationCount: number;
  minPermitTouchedEventCount: number;
  candidateLimit: number;
};

export const DEFAULT_PERMIT_CORRELATED_SLOWDOWN_THRESHOLDS: PermitCorrelatedSlowdownThresholds = {
  maxRouteWeightedAverageSpeedMph: 6,
  minHotspotScore: 70,
  minSpeedObservationCount: 100,
  minPermitTouchedEventCount: 25,
  candidateLimit: 100,
};

export type PermitCorrelatedSlowdownDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<RouteMonthSignalFeature>;
  thresholds?: Partial<PermitCorrelatedSlowdownThresholds>;
};

export type PermitCorrelatedSlowdownDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type Hit = {
  feature: RouteMonthSignalFeature;
  detectorScore: number;
};

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function slowdownSignal(
  feature: RouteMonthSignalFeature,
  thresholds: PermitCorrelatedSlowdownThresholds,
): number {
  const speedSignal =
    feature.routeWeightedAverageSpeedMph === null
      ? 0
      : Math.max(
          0,
          (thresholds.maxRouteWeightedAverageSpeedMph - feature.routeWeightedAverageSpeedMph) /
            thresholds.maxRouteWeightedAverageSpeedMph,
        );
  const hotspotSignal =
    feature.maxHotspotScore === null
      ? 0
      : Math.max(0, (feature.maxHotspotScore - thresholds.minHotspotScore) / 30);
  const permitSignal = Math.min(
    1,
    feature.permitTouchedEventCount / (thresholds.minPermitTouchedEventCount * 4),
  );
  return Math.round(
    60 + 40 * Math.min(1, 0.45 * speedSignal + 0.35 * hotspotSignal + 0.2 * permitSignal),
  );
}

function evaluateFeature(
  feature: RouteMonthSignalFeature,
  thresholds: PermitCorrelatedSlowdownThresholds,
): Hit | null {
  if (!feature.coverage.isComputable) return null;
  if (feature.window !== "all_day") return null;
  if (feature.speedObservationCount < thresholds.minSpeedObservationCount) return null;
  if (feature.permitTouchedEventCount < thresholds.minPermitTouchedEventCount) return null;
  const hasSlowRoute =
    feature.routeWeightedAverageSpeedMph !== null &&
    feature.routeWeightedAverageSpeedMph <= thresholds.maxRouteWeightedAverageSpeedMph;
  const hasHotspot =
    feature.maxHotspotScore !== null && feature.maxHotspotScore >= thresholds.minHotspotScore;
  if (!hasSlowRoute && !hasHotspot) return null;
  return { feature, detectorScore: slowdownSignal(feature, thresholds) };
}

export function detectPermitCorrelatedSlowdowns(
  input: PermitCorrelatedSlowdownDetectorInput,
): PermitCorrelatedSlowdownDetectorOutput {
  const detectorId = DetectorIdSchema.parse(PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("permit_correlated_slowdown");
  const thresholds: PermitCorrelatedSlowdownThresholds = {
    ...DEFAULT_PERMIT_CORRELATED_SLOWDOWN_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const hits = new Map(
    input.features
      .map((feature) => evaluateFeature(feature, thresholds))
      .filter((hit): hit is Hit => hit !== null)
      .sort((left, right) => right.detectorScore - left.detectorScore)
      .slice(0, thresholds.candidateLimit)
      .map((hit) => [hit.feature.scopeId, hit]),
  );
  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];

  for (const feature of input.features) {
    const routeId = RouteIdSchema.parse(feature.routeId);
    const hit = hits.get(feature.scopeId);
    if (hit !== undefined) {
      const candidateId = stableId(detectorRunId, "candidate", feature.scopeId, feature.window);
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
          category: "context",
          severity: hit.detectorScore >= 85 ? "high" : "medium",
          confidence: feature.sampleSupport >= 500 ? "high" : "medium",
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Route ${routeId} has slow-speed evidence during a month with substantial DOT permit touches.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "signal_feature"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: JSON.stringify(feature),
          evidenceWeight: 1,
          note: "Route-month signal feature with speed, permit-touch, uncertainty, and provenance fields.",
        }),
      );
    }

    const skippedReason =
      feature.coverage.skippedReasonCode ??
      (feature.speedObservationCount < thresholds.minSpeedObservationCount
        ? "insufficient_speed_observations"
        : feature.permitTouchedEventCount < thresholds.minPermitTouchedEventCount
          ? "insufficient_permit_touches"
          : null);
    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", feature.scopeId, feature.window),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "route",
        scopeId: routeId,
        outcome: !feature.coverage.isComputable
          ? "skipped_missing_input"
          : hit !== undefined
            ? "hit"
            : "clean_no_hit",
        reasonCode: skippedReason === null ? null : FindingReasonCodeSchema.parse(skippedReason),
        reason: skippedReason,
        inputsSeenJson: feature.coverage.inputsSeenJson,
        inputsExpectedJson: JSON.stringify({
          window: "all_day",
          speedObservationCount: `>=${thresholds.minSpeedObservationCount}`,
          permitTouchedEventCount: `>=${thresholds.minPermitTouchedEventCount}`,
          routeWeightedAverageSpeedMph: `<=${thresholds.maxRouteWeightedAverageSpeedMph}`,
          maxHotspotScore: `>=${thresholds.minHotspotScore}`,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
