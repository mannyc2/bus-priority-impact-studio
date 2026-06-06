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

export const MULTI_MONTH_SPEED_PEER_DETECTOR_ID = "multi_month_speed_peer";

export type MultiMonthSpeedPeerGroupMethod =
  | "route_family_type_spatial"
  | "route_family_type"
  | "route_family"
  | "route_type"
  | "system";

export type MultiMonthSpeedPeerObservation = {
  month: string;
  hasSpeedTrend: boolean;
  averageSpeedMph: number | null;
  speedObservationCount: number;
  peerMedianSpeedMph: number | null;
  peerRouteCount: number;
  peerGroupId: string;
  peerGroupLabel: string;
  peerGroupMethod: MultiMonthSpeedPeerGroupMethod;
  peerRouteIds: readonly string[];
};

export type MultiMonthSpeedPeerRouteInput = {
  routeId: string;
  observations: ReadonlyArray<MultiMonthSpeedPeerObservation>;
};

export type MultiMonthSpeedPeerThresholds = {
  minObservedMonths: number;
  minSpeedObservationCount: number;
  minPeerRouteCount: number;
  maxAverageSpeedMph: number;
  minAveragePeerDeficitMph: number;
  candidateLimit: number;
};

export const DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS: MultiMonthSpeedPeerThresholds = {
  minObservedMonths: 3,
  minSpeedObservationCount: 100,
  minPeerRouteCount: 10,
  maxAverageSpeedMph: 6,
  minAveragePeerDeficitMph: 1,
  candidateLimit: 100,
};

export type MultiMonthSpeedPeerDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  routes: ReadonlyArray<MultiMonthSpeedPeerRouteInput>;
  thresholds?: Partial<MultiMonthSpeedPeerThresholds>;
};

export type MultiMonthSpeedPeerDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type EligibleObservation = MultiMonthSpeedPeerObservation & {
  averageSpeedMph: number;
  peerMedianSpeedMph: number;
};

type Hit = {
  route: MultiMonthSpeedPeerRouteInput;
  eligibleObservations: EligibleObservation[];
  averageSpeedMph: number;
  averagePeerMedianSpeedMph: number;
  averagePeerDeficitMph: number;
  detectorScore: number;
};

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function hasStrongPeerGroup(observation: MultiMonthSpeedPeerObservation): boolean {
  return (
    observation.peerGroupMethod === "route_family_type_spatial" ||
    observation.peerGroupMethod === "route_family_type"
  );
}

function eligibleObservations(
  route: MultiMonthSpeedPeerRouteInput,
  thresholds: MultiMonthSpeedPeerThresholds,
): EligibleObservation[] {
  return route.observations.filter(
    (observation): observation is EligibleObservation =>
      observation.hasSpeedTrend &&
      observation.averageSpeedMph !== null &&
      observation.peerMedianSpeedMph !== null &&
      observation.speedObservationCount >= thresholds.minSpeedObservationCount &&
      observation.peerRouteCount >= thresholds.minPeerRouteCount,
  );
}

function skippedReason(
  month: string,
  eligible: readonly EligibleObservation[],
  thresholds: MultiMonthSpeedPeerThresholds,
): string | null {
  if (eligible.length < thresholds.minObservedMonths) return "insufficient_trend_months";
  if (!eligible.some((observation) => observation.month === month))
    return "missing_current_trend_month";
  return null;
}

function hitFor(
  route: MultiMonthSpeedPeerRouteInput,
  month: string,
  thresholds: MultiMonthSpeedPeerThresholds,
): Hit | null {
  const eligible = eligibleObservations(route, thresholds);
  if (skippedReason(month, eligible, thresholds) !== null) return null;

  const averageSpeedMph = average(eligible.map((observation) => observation.averageSpeedMph));
  const averagePeerMedianSpeedMph = average(
    eligible.map((observation) => observation.peerMedianSpeedMph),
  );
  const averagePeerDeficitMph = averagePeerMedianSpeedMph - averageSpeedMph;
  if (averageSpeedMph > thresholds.maxAverageSpeedMph) return null;
  if (averagePeerDeficitMph < thresholds.minAveragePeerDeficitMph) return null;

  const speedSignal = clamp(
    (thresholds.maxAverageSpeedMph - averageSpeedMph) / thresholds.maxAverageSpeedMph,
    0,
    1,
  );
  const peerDeficitSignal = clamp(averagePeerDeficitMph / 3, 0, 1);
  const detectorScore = Math.round(55 + 45 * (0.45 * speedSignal + 0.55 * peerDeficitSignal));

  return {
    route,
    eligibleObservations: eligible,
    averageSpeedMph: Number(averageSpeedMph.toFixed(2)),
    averagePeerMedianSpeedMph: Number(averagePeerMedianSpeedMph.toFixed(2)),
    averagePeerDeficitMph: Number(averagePeerDeficitMph.toFixed(2)),
    detectorScore,
  };
}

export function detectMultiMonthSpeedPeerDeficits(
  input: MultiMonthSpeedPeerDetectorInput,
): MultiMonthSpeedPeerDetectorOutput {
  const detectorId = DetectorIdSchema.parse(MULTI_MONTH_SPEED_PEER_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("multi_month_peer_speed_deficit");
  const thresholds: MultiMonthSpeedPeerThresholds = {
    ...DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };

  const hits = new Map(
    input.routes
      .map((route) => hitFor(route, month, thresholds))
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
    const eligible = eligibleObservations(route, thresholds);
    const reason = skippedReason(month, eligible, thresholds);
    const hit = hits.get(route.routeId);

    if (hit !== undefined) {
      const candidateId = stableId(detectorRunId, "candidate", routeId, reasonCode);
      const weakObservationMonths = route.observations
        .filter(
          (observation) =>
            !observation.hasSpeedTrend ||
            observation.averageSpeedMph === null ||
            observation.speedObservationCount < thresholds.minSpeedObservationCount ||
            observation.peerMedianSpeedMph === null ||
            observation.peerRouteCount < thresholds.minPeerRouteCount,
        )
        .map((observation) => observation.month);
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
          category: "speed",
          severity: hit.detectorScore >= 85 ? "high" : "medium",
          confidence:
            hit.eligibleObservations.length >= 6 &&
            hit.eligibleObservations.every(hasStrongPeerGroup)
              ? "medium"
              : "low",
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Route ${routeId} has a multi-month low-speed pattern below its matched peer median.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "trend_peer_metric"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            observedMonthCount: hit.eligibleObservations.length,
            averageSpeedMph: hit.averageSpeedMph,
            averagePeerMedianSpeedMph: hit.averagePeerMedianSpeedMph,
            averagePeerDeficitMph: hit.averagePeerDeficitMph,
            peerGroupMethods: uniqueSorted(
              hit.eligibleObservations.map((observation) => observation.peerGroupMethod),
            ),
            observations: hit.eligibleObservations.map((observation) => ({
              month: observation.month,
              averageSpeedMph: observation.averageSpeedMph,
              speedObservationCount: observation.speedObservationCount,
              peerMedianSpeedMph: observation.peerMedianSpeedMph,
              peerRouteCount: observation.peerRouteCount,
              peerGroupId: observation.peerGroupId,
              peerGroupLabel: observation.peerGroupLabel,
              peerGroupMethod: observation.peerGroupMethod,
              peerRouteIds: observation.peerRouteIds,
            })),
          }),
          evidenceWeight: 1,
          note: "Multi-month route speed trend compared with the monthly matched peer median.",
        }),
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "peer_limits"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "counter_evidence",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            weakObservationMonths,
            configuredMinObservedMonths: thresholds.minObservedMonths,
            configuredMinSpeedObservationCount: thresholds.minSpeedObservationCount,
            configuredMinPeerRouteCount: thresholds.minPeerRouteCount,
            fallbackPeerMonths: hit.eligibleObservations
              .filter((observation) => !hasStrongPeerGroup(observation))
              .map((observation) => ({
                month: observation.month,
                peerGroupMethod: observation.peerGroupMethod,
                peerGroupLabel: observation.peerGroupLabel,
                peerRouteCount: observation.peerRouteCount,
              })),
            peerGroupDescription:
              "Peers are selected by route family, route type, and geography when enough supported routes exist; fallback groups are recorded per month.",
            limitation:
              "Matched peer groups are descriptive comparisons, not causal controls; reviewers should inspect route geometry, service pattern, construction, and seasonal differences before promotion.",
          }),
          evidenceWeight: 0.5,
          note: "Counter-evidence for peer interpretation: matched peers improve the baseline but still require reviewer validation.",
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
          reason !== null ? "skipped_missing_input" : hit === undefined ? "clean_no_hit" : "hit",
        reasonCode: reason === null ? null : FindingReasonCodeSchema.parse(reason),
        reason: reason === null ? null : "Multi-month route trend or peer support was incomplete.",
        inputsSeenJson: JSON.stringify({
          routeId,
          observedMonthCount: eligible.length,
          observations: route.observations,
        }),
        inputsExpectedJson: JSON.stringify({
          currentMonth: month,
          observedMonthCount: `>=${thresholds.minObservedMonths}`,
          speedObservationCount: `>=${thresholds.minSpeedObservationCount}`,
          peerRouteCount: `>=${thresholds.minPeerRouteCount}`,
          averageSpeedMph: `<=${thresholds.maxAverageSpeedMph}`,
          averagePeerDeficitMph: `>=${thresholds.minAveragePeerDeficitMph}`,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
