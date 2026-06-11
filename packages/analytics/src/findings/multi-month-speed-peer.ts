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

export type MultiMonthSpeedPeerServiceClass = "local" | "express" | "sbs";

const EXPRESS_ROUTE_PREFIXES = new Set(["BM", "BXM", "QM", "SIM", "X"]);

const BOROUGH_BY_ROUTE_PREFIX: Record<string, string> = {
  B: "B",
  BM: "B",
  BX: "BX",
  BXM: "BX",
  M: "M",
  Q: "Q",
  QM: "Q",
  S: "S",
  SIM: "S",
};

const SERVICE_CLASS_LABELS: Record<MultiMonthSpeedPeerServiceClass, string> = {
  local: "local",
  express: "express",
  sbs: "SBS",
};

export type MultiMonthSpeedPeerRouteClass = {
  serviceClass: MultiMonthSpeedPeerServiceClass;
  borough: string | null;
};

export function classifyMultiMonthSpeedPeerRoute(routeId: string): MultiMonthSpeedPeerRouteClass {
  const normalized = routeId.trim().toUpperCase();
  const prefix = /^[A-Z]+/.exec(normalized)?.[0] ?? "";
  const serviceClass: MultiMonthSpeedPeerServiceClass = normalized.endsWith("+")
    ? "sbs"
    : EXPRESS_ROUTE_PREFIXES.has(prefix)
      ? "express"
      : "local";
  return { serviceClass, borough: BOROUGH_BY_ROUTE_PREFIX[prefix] ?? null };
}

export type MultiMonthSpeedPeerCandidatePeer = {
  routeId: string;
  averageSpeedMph: number;
};

export type MultiMonthSpeedPeerGroupSelection = {
  peerGroupId: string;
  peerGroupLabel: string;
  peerGroupMethod: MultiMonthSpeedPeerGroupMethod;
  peerRouteIds: string[];
  peerRouteCount: number;
  peerMedianSpeedMph: number | null;
};

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  return Number(value.toFixed(2));
}

function groupSelection(
  method: MultiMonthSpeedPeerGroupMethod,
  groupId: string,
  groupLabel: string,
  peers: readonly MultiMonthSpeedPeerCandidatePeer[],
): MultiMonthSpeedPeerGroupSelection {
  const sorted = [...peers].sort((left, right) => left.routeId.localeCompare(right.routeId));
  return {
    peerGroupId: groupId,
    peerGroupLabel: groupLabel,
    peerGroupMethod: method,
    peerRouteIds: sorted.map((peer) => peer.routeId),
    peerRouteCount: sorted.length,
    peerMedianSpeedMph: medianOf(sorted.map((peer) => peer.averageSpeedMph)),
  };
}

/**
 * Service-class-aware peer-group selection with a minimum-size fallback chain:
 * borough + service class ("route_family_type") -> service class only ("route_type")
 * -> system-wide fallback ("system"). The method actually used is always recorded.
 */
export function selectMultiMonthSpeedPeerGroup(input: {
  routeId: string;
  peers: ReadonlyArray<MultiMonthSpeedPeerCandidatePeer>;
  minPeerRouteCount?: number;
}): MultiMonthSpeedPeerGroupSelection {
  const minPeerRouteCount =
    input.minPeerRouteCount ?? DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS.minPeerRouteCount;
  const { serviceClass, borough } = classifyMultiMonthSpeedPeerRoute(input.routeId);
  const classLabel = SERVICE_CLASS_LABELS[serviceClass];
  const classPeers = input.peers.filter(
    (peer) =>
      peer.routeId !== input.routeId &&
      classifyMultiMonthSpeedPeerRoute(peer.routeId).serviceClass === serviceClass,
  );

  if (borough !== null) {
    const boroughPeers = classPeers.filter(
      (peer) => classifyMultiMonthSpeedPeerRoute(peer.routeId).borough === borough,
    );
    if (boroughPeers.length >= minPeerRouteCount) {
      return groupSelection(
        "route_family_type",
        `route_family_type:${borough}:${serviceClass}`,
        `${borough} ${classLabel} routes`,
        boroughPeers,
      );
    }
  }

  if (classPeers.length >= minPeerRouteCount) {
    return groupSelection(
      "route_type",
      `route_type:${serviceClass}`,
      `Systemwide ${classLabel} routes`,
      classPeers,
    );
  }

  return groupSelection(
    "system",
    "system",
    "System routes",
    input.peers.filter((peer) => peer.routeId !== input.routeId),
  );
}

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

function claimTextFor(routeId: string, eligible: readonly EligibleObservation[]): string {
  const matched = eligible.filter((observation) => observation.peerGroupMethod !== "system");
  if (matched.length === 0) {
    return `Route ${routeId} has a multi-month low-speed pattern below the citywide median route speed (no matched peer group met the minimum size).`;
  }
  const typicalPeerCount = Math.round(
    average(matched.map((observation) => observation.peerRouteCount)),
  );
  if (matched.length === eligible.length) {
    return `Route ${routeId} has a multi-month low-speed pattern below the median of ${typicalPeerCount} same-class peer routes.`;
  }
  return `Route ${routeId} has a multi-month low-speed pattern below its peer median (${typicalPeerCount} same-class peer routes in ${matched.length} of ${eligible.length} months, citywide fallback otherwise).`;
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
          claimText: claimTextFor(routeId, hit.eligibleObservations),
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
          note: "Multi-month route speed trend compared with the monthly peer-group median (method recorded per month).",
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
              "Peers share the route's service class (local, SBS, or express), refined by borough when enough peers exist; months that fell back to a coarser group or the system-wide pool are recorded per month.",
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
