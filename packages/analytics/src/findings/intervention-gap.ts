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

export const INTERVENTION_GAP_DETECTOR_ID = "intervention_gap";

export type InterventionEvidenceStatus =
  | "absent"
  | "thin_source_gap"
  | "future_only"
  | "dated_or_evaluated";

export type InterventionGapRouteInput = {
  routeId: string;
  speedPainScore: number | null;
  reliabilityPainScore: number | null;
  interventionEvidenceStatus: InterventionEvidenceStatus;
  interventionEvidenceCount: number;
};

export type InterventionGapThresholds = {
  minPainScore: number;
  candidateLimit: number;
};

export const DEFAULT_INTERVENTION_GAP_THRESHOLDS: InterventionGapThresholds = {
  minPainScore: 85,
  candidateLimit: 100,
};

export type InterventionGapDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  routes: ReadonlyArray<InterventionGapRouteInput>;
  thresholds?: Partial<InterventionGapThresholds>;
};

export type InterventionGapDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function painScore(route: InterventionGapRouteInput): number | null {
  const scores = [route.speedPainScore, route.reliabilityPainScore].filter(
    (score): score is number => score !== null,
  );
  if (scores.length === 0) return null;
  return Math.max(...scores);
}

function hasTreatmentGap(status: InterventionEvidenceStatus): boolean {
  return status === "absent" || status === "thin_source_gap";
}

export function detectInterventionGaps(
  input: InterventionGapDetectorInput,
): InterventionGapDetectorOutput {
  const detectorId = DetectorIdSchema.parse(INTERVENTION_GAP_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("intervention_gap");
  const thresholds: InterventionGapThresholds = {
    ...DEFAULT_INTERVENTION_GAP_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const hitRouteIds = new Set(
    input.routes
      .map((route) => ({ route, score: painScore(route) }))
      .filter(
        (row): row is { route: InterventionGapRouteInput; score: number } =>
          row.score !== null &&
          row.score >= thresholds.minPainScore &&
          hasTreatmentGap(row.route.interventionEvidenceStatus),
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, thresholds.candidateLimit)
      .map((row) => row.route.routeId),
  );
  const coverage: FindingCoverageAudit[] = [];

  for (const route of input.routes) {
    const routeId = RouteIdSchema.parse(route.routeId);
    const score = painScore(route);
    const skipped = score === null;
    const hit = hitRouteIds.has(route.routeId);

    if (hit && score !== null) {
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
          category: "intervention",
          severity: score >= 95 ? "high" : "medium",
          confidence: route.interventionEvidenceStatus === "absent" ? "medium" : "low",
          detectorScore: score,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Route ${routeId} has high rider-pain signals but no strong dated bus-priority intervention evidence.`,
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
            speedPainScore: route.speedPainScore,
            reliabilityPainScore: route.reliabilityPainScore,
            interventionEvidenceStatus: route.interventionEvidenceStatus,
            interventionEvidenceCount: route.interventionEvidenceCount,
          }),
          evidenceWeight: 1,
          note: null,
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
        outcome: skipped ? "skipped_missing_input" : hit ? "hit" : "clean_no_hit",
        reasonCode: skipped ? FindingReasonCodeSchema.parse("missing_pain_signal") : null,
        reason: skipped ? "No speed or observed-reliability pain signal was available." : null,
        inputsSeenJson: JSON.stringify(route),
        inputsExpectedJson: JSON.stringify({
          painScore: `>=${thresholds.minPainScore}`,
          interventionEvidenceStatus: ["absent", "thin_source_gap"],
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
