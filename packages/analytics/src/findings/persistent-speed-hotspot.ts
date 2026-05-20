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

export const PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID = "persistent_speed_hotspot";

export type PersistentSpeedHotspotRouteInput = {
  routeId: string;
  hasSpeedData: boolean;
  speedObservationCount: number;
  segmentCount: number;
  hotspots: ReadonlyArray<PersistentSpeedHotspotInput>;
};

export type PersistentSpeedHotspotInput = {
  segmentId: string;
  hotspotRank: number;
  direction: string;
  stopOrder: number;
  timepointStopName: string;
  nextTimepointStopName: string;
  observationCount: number;
  busTripCount: number;
  weightedAverageSpeedMph: number;
  slowWindowShare: number;
  speedSeverity: number;
  hotspotScore: number;
  riderImpactScore: number | null;
  ridershipExposure: number | null;
};

export type PersistentSpeedHotspotThresholds = {
  minHotspotScore: number;
  minObservationCount: number;
  candidateLimitPerRoute: number;
};

export const DEFAULT_PERSISTENT_SPEED_HOTSPOT_THRESHOLDS: PersistentSpeedHotspotThresholds = {
  minHotspotScore: 60,
  minObservationCount: 10,
  candidateLimitPerRoute: 10,
};

export type PersistentSpeedHotspotDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  routes: ReadonlyArray<PersistentSpeedHotspotRouteInput>;
  thresholds?: Partial<PersistentSpeedHotspotThresholds>;
};

export type PersistentSpeedHotspotDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function rankScore(hotspot: PersistentSpeedHotspotInput): number {
  return hotspot.riderImpactScore ?? hotspot.hotspotScore;
}

function severityFor(score: number): "low" | "medium" | "high" {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function confidenceFor(hotspot: PersistentSpeedHotspotInput): "medium" | "high" {
  return hotspot.observationCount >= 50 && hotspot.busTripCount >= 100 ? "high" : "medium";
}

export function detectPersistentSpeedHotspots(
  input: PersistentSpeedHotspotDetectorInput,
): PersistentSpeedHotspotDetectorOutput {
  const detectorId = DetectorIdSchema.parse(PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("persistent_low_speed");
  const thresholds: PersistentSpeedHotspotThresholds = {
    ...DEFAULT_PERSISTENT_SPEED_HOTSPOT_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];

  for (const route of input.routes) {
    const routeId = RouteIdSchema.parse(route.routeId);
    const eligible = route.hotspots
      .filter(
        (hotspot) =>
          hotspot.hotspotScore >= thresholds.minHotspotScore &&
          hotspot.observationCount >= thresholds.minObservationCount,
      )
      .sort((left, right) => {
        const scoreDelta = rankScore(right) - rankScore(left);
        if (scoreDelta !== 0) return scoreDelta;
        const speedDelta = left.weightedAverageSpeedMph - right.weightedAverageSpeedMph;
        if (speedDelta !== 0) return speedDelta;
        return left.hotspotRank - right.hotspotRank;
      })
      .slice(0, thresholds.candidateLimitPerRoute);

    for (const hotspot of eligible) {
      const score = rankScore(hotspot);
      const candidateId = stableId(detectorRunId, "candidate", routeId, hotspot.segmentId);
      candidates.push(
        FindingCandidateSchema.parse({
          candidateId,
          detectorId,
          detectorRunId,
          month,
          scopeKind: "segment",
          scopeId: hotspot.segmentId,
          routeId,
          physicalId: null,
          category: "speed",
          severity: severityFor(score),
          confidence: confidenceFor(hotspot),
          detectorScore: score,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Route ${routeId} has a persistent low-speed hotspot between ${hotspot.timepointStopName} and ${hotspot.nextTimepointStopName}.`,
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
            segmentId: hotspot.segmentId,
            hotspotRank: hotspot.hotspotRank,
            direction: hotspot.direction,
            stopOrder: hotspot.stopOrder,
            hotspotScore: hotspot.hotspotScore,
            riderImpactScore: hotspot.riderImpactScore,
            weightedAverageSpeedMph: hotspot.weightedAverageSpeedMph,
            slowWindowShare: hotspot.slowWindowShare,
            speedSeverity: hotspot.speedSeverity,
            observationCount: hotspot.observationCount,
            busTripCount: hotspot.busTripCount,
            ridershipExposure: hotspot.ridershipExposure,
          }),
          evidenceWeight: 1,
          note: null,
        }),
      );
    }

    const skipped = !route.hasSpeedData || route.speedObservationCount === 0;
    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", routeId),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "route",
        scopeId: routeId,
        outcome: skipped ? "skipped_missing_input" : eligible.length > 0 ? "hit" : "clean_no_hit",
        reasonCode: skipped ? FindingReasonCodeSchema.parse("missing_speed") : null,
        reason: skipped
          ? "No segment-speed observations were available for hotspot detection."
          : null,
        inputsSeenJson: JSON.stringify({
          hasSpeedData: route.hasSpeedData,
          speedObservationCount: route.speedObservationCount,
          segmentCount: route.segmentCount,
          hotspotCount: route.hotspots.length,
          candidateCount: eligible.length,
          maxHotspotScore: route.hotspots.reduce(
            (max, hotspot) => Math.max(max, hotspot.hotspotScore),
            0,
          ),
        }),
        inputsExpectedJson: JSON.stringify({
          hasSpeedData: true,
          speedObservationCount: ">0",
          minHotspotScore: thresholds.minHotspotScore,
          minObservationCount: thresholds.minObservationCount,
          candidateLimitPerRoute: thresholds.candidateLimitPerRoute,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
