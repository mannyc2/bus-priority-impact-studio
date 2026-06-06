import { SPEED_PACE_HOTSPOT_DETECTOR_ID } from "@bp/analytics";

export const SPEED_PACE_ROUTE_MONTH_BASELINE_DETECTOR_ID = "persistent_speed_hotspot";

export const ROUTE_MONTH_BASELINE_DETECTOR_IDS = [
  "multi_month_speed_peer",
  "intervention_gap",
  "intervention_underperformance",
  "permit_correlated_slowdown",
  "service_request_context",
] as const;

export const RICHER_GRAIN_DETECTOR_IDS = [
  "speed_pace_hotspot",
  "headway_reliability_ewt",
  "bunching_hotspots",
  "schedule_mismatch",
  "travel_time_variability",
  "degradation_trend",
] as const;

export type SpeedPaceShadowCandidateRow = {
  route_id: unknown;
  candidate_id: unknown;
  scope_id: unknown;
  detector_score: unknown;
  claim_text: unknown;
};

export type SpeedPaceRouteCoverageRow = {
  scope_id: unknown;
  route_id: unknown;
  outcome: unknown;
};

export type SpeedPaceRouteMonthShadowAuditArtifact = {
  artifactKind: "speed_pace_route_month_shadow_audit";
  schemaVersion: 1;
  generatedAt: string;
  releaseMonth: string;
  dbPath: string | null;
  artifactPath: string;
  detectorId: typeof SPEED_PACE_HOTSPOT_DETECTOR_ID;
  routeMonthBaselineDetectorId: typeof SPEED_PACE_ROUTE_MONTH_BASELINE_DETECTOR_ID;
  summary: {
    routeMonthCleanNoHitRouteCount: number;
    speedPaceHitRouteCount: number;
    hiddenSegmentHitRouteCount: number;
    hiddenSegmentCandidateCount: number;
    maxHiddenDetectorScore: number | null;
  };
  hiddenSegmentRoutes: Array<{
    routeId: string;
    hiddenCandidateCount: number;
    maxDetectorScore: number;
    sampleCandidates: Array<{
      candidateId: string;
      scopeId: string;
      detectorScore: number;
      claimText: string;
    }>;
  }>;
};

export type RouteMonthCleanNoHitRow = {
  detector_id: unknown;
  route_id: unknown;
};

export type RicherCandidateRow = {
  detector_id: unknown;
  route_id: unknown;
  candidate_id: unknown;
  scope_kind: unknown;
  scope_id: unknown;
  reason_code: unknown;
  detector_score: unknown;
  claim_text: unknown;
};

type ShadowCandidate = {
  detectorId: string;
  candidateId: string;
  scopeKind: string;
  scopeId: string;
  reasonCode: string;
  detectorScore: number;
  claimText: string;
};

export type RouteMonthShadowAuditArtifact = {
  artifactKind: "route_month_false_negative_shadow_audit";
  schemaVersion: 1;
  generatedAt: string;
  releaseMonth: string;
  dbPath: string | null;
  artifactPath: string;
  baselineDetectorIds: string[];
  richerGrainDetectorIds: string[];
  summary: {
    baselineDetectorCount: number;
    richerGrainDetectorCount: number;
    routeMonthCleanNoHitRouteCount: number;
    hiddenRouteCount: number;
    hiddenCandidateCount: number;
    maxHiddenDetectorScore: number | null;
  };
  baselineDetectors: Array<{
    detectorId: string;
    cleanNoHitRouteCount: number;
    hiddenRouteCount: number;
    hiddenCandidateCount: number;
    hiddenCandidateDetectorCounts: Record<string, number>;
    maxHiddenDetectorScore: number | null;
    hiddenRoutes: Array<{
      routeId: string;
      hiddenCandidateCount: number;
      maxDetectorScore: number;
      sampleCandidates: ShadowCandidate[];
    }>;
  }>;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function addCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function buildSpeedPaceRouteMonthShadowAudit(input: {
  month: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  cleanNoHitRows: readonly SpeedPaceRouteCoverageRow[];
  speedPaceCandidateRows: readonly SpeedPaceShadowCandidateRow[];
}): SpeedPaceRouteMonthShadowAuditArtifact {
  const cleanNoHitRoutes = new Set(
    input.cleanNoHitRows
      .map((row) => text(row.route_id) ?? text(row.scope_id))
      .filter((routeId): routeId is string => routeId !== null),
  );
  const candidatesByRoute = new Map<
    string,
    Array<{ candidateId: string; scopeId: string; detectorScore: number; claimText: string }>
  >();
  for (const row of input.speedPaceCandidateRows) {
    const routeId = text(row.route_id);
    const candidateId = text(row.candidate_id);
    const scopeId = text(row.scope_id);
    const detectorScore = numberValue(row.detector_score);
    const claimText = text(row.claim_text);
    if (
      routeId === null ||
      candidateId === null ||
      scopeId === null ||
      detectorScore === null ||
      claimText === null
    ) {
      continue;
    }
    const rows = candidatesByRoute.get(routeId) ?? [];
    rows.push({ candidateId, scopeId, detectorScore, claimText });
    candidatesByRoute.set(routeId, rows);
  }

  const hiddenSegmentRoutes = [...candidatesByRoute.entries()]
    .filter(([routeId]) => cleanNoHitRoutes.has(routeId))
    .map(([routeId, candidates]) => {
      const sorted = candidates.sort((left, right) => right.detectorScore - left.detectorScore);
      return {
        routeId,
        hiddenCandidateCount: sorted.length,
        maxDetectorScore: sorted[0]?.detectorScore ?? 0,
        sampleCandidates: sorted.slice(0, 5),
      };
    })
    .sort(
      (left, right) =>
        right.hiddenCandidateCount - left.hiddenCandidateCount ||
        right.maxDetectorScore - left.maxDetectorScore ||
        left.routeId.localeCompare(right.routeId),
    );
  const hiddenCandidateCount = hiddenSegmentRoutes.reduce(
    (sum, route) => sum + route.hiddenCandidateCount,
    0,
  );
  return {
    artifactKind: "speed_pace_route_month_shadow_audit",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.month,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    detectorId: SPEED_PACE_HOTSPOT_DETECTOR_ID,
    routeMonthBaselineDetectorId: SPEED_PACE_ROUTE_MONTH_BASELINE_DETECTOR_ID,
    summary: {
      routeMonthCleanNoHitRouteCount: cleanNoHitRoutes.size,
      speedPaceHitRouteCount: candidatesByRoute.size,
      hiddenSegmentHitRouteCount: hiddenSegmentRoutes.length,
      hiddenSegmentCandidateCount: hiddenCandidateCount,
      maxHiddenDetectorScore:
        hiddenSegmentRoutes.length === 0
          ? null
          : Math.max(...hiddenSegmentRoutes.map((route) => route.maxDetectorScore)),
    },
    hiddenSegmentRoutes,
  };
}

export function buildRouteMonthShadowAudit(input: {
  month: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  cleanNoHitRows: readonly RouteMonthCleanNoHitRow[];
  richerCandidateRows: readonly RicherCandidateRow[];
}): RouteMonthShadowAuditArtifact {
  const cleanRoutesByDetector = new Map<string, Set<string>>();
  for (const row of input.cleanNoHitRows) {
    const detectorId = text(row.detector_id);
    const routeId = text(row.route_id);
    if (detectorId === null || routeId === null) continue;
    const routes = cleanRoutesByDetector.get(detectorId) ?? new Set<string>();
    routes.add(routeId);
    cleanRoutesByDetector.set(detectorId, routes);
  }

  const candidatesByRoute = new Map<string, ShadowCandidate[]>();
  for (const row of input.richerCandidateRows) {
    const routeId = text(row.route_id);
    const detectorId = text(row.detector_id);
    const candidateId = text(row.candidate_id);
    const scopeKind = text(row.scope_kind);
    const scopeId = text(row.scope_id);
    const reasonCode = text(row.reason_code);
    const detectorScore = numberValue(row.detector_score);
    const claimText = text(row.claim_text);
    if (
      routeId === null ||
      detectorId === null ||
      candidateId === null ||
      scopeKind === null ||
      scopeId === null ||
      reasonCode === null ||
      detectorScore === null ||
      claimText === null
    ) {
      continue;
    }
    const candidates = candidatesByRoute.get(routeId) ?? [];
    candidates.push({
      detectorId,
      candidateId,
      scopeKind,
      scopeId,
      reasonCode,
      detectorScore,
      claimText,
    });
    candidatesByRoute.set(routeId, candidates);
  }

  const baselineDetectors = ROUTE_MONTH_BASELINE_DETECTOR_IDS.map((detectorId) => {
    const cleanRoutes = cleanRoutesByDetector.get(detectorId) ?? new Set<string>();
    const hiddenCandidateDetectorCounts: Record<string, number> = {};
    const hiddenRoutes = [...cleanRoutes]
      .map((routeId) => {
        const candidates = [...(candidatesByRoute.get(routeId) ?? [])].sort(
          (left, right) =>
            right.detectorScore - left.detectorScore ||
            left.detectorId.localeCompare(right.detectorId) ||
            left.candidateId.localeCompare(right.candidateId),
        );
        if (candidates.length === 0) return null;
        for (const candidate of candidates)
          addCount(hiddenCandidateDetectorCounts, candidate.detectorId);
        return {
          routeId,
          hiddenCandidateCount: candidates.length,
          maxDetectorScore: candidates[0]?.detectorScore ?? 0,
          sampleCandidates: candidates.slice(0, 8),
        };
      })
      .filter((route): route is NonNullable<typeof route> => route !== null)
      .sort(
        (left, right) =>
          right.hiddenCandidateCount - left.hiddenCandidateCount ||
          right.maxDetectorScore - left.maxDetectorScore ||
          left.routeId.localeCompare(right.routeId),
      );
    const hiddenCandidateCount = hiddenRoutes.reduce(
      (sum, route) => sum + route.hiddenCandidateCount,
      0,
    );
    return {
      detectorId,
      cleanNoHitRouteCount: cleanRoutes.size,
      hiddenRouteCount: hiddenRoutes.length,
      hiddenCandidateCount,
      hiddenCandidateDetectorCounts,
      maxHiddenDetectorScore:
        hiddenRoutes.length === 0
          ? null
          : Math.max(...hiddenRoutes.map((route) => route.maxDetectorScore)),
      hiddenRoutes,
    };
  });

  const uniqueCleanRoutes = new Set(
    input.cleanNoHitRows
      .map((row) => text(row.route_id))
      .filter((routeId): routeId is string => routeId !== null),
  );
  const hiddenRouteIds = new Set(
    baselineDetectors.flatMap((detector) => detector.hiddenRoutes.map((route) => route.routeId)),
  );
  const hiddenCandidateCount = baselineDetectors.reduce(
    (sum, detector) => sum + detector.hiddenCandidateCount,
    0,
  );
  const hiddenScores = baselineDetectors.flatMap((detector) =>
    detector.hiddenRoutes.map((route) => route.maxDetectorScore),
  );
  return {
    artifactKind: "route_month_false_negative_shadow_audit",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.month,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    baselineDetectorIds: [...ROUTE_MONTH_BASELINE_DETECTOR_IDS],
    richerGrainDetectorIds: [...RICHER_GRAIN_DETECTOR_IDS],
    summary: {
      baselineDetectorCount: ROUTE_MONTH_BASELINE_DETECTOR_IDS.length,
      richerGrainDetectorCount: RICHER_GRAIN_DETECTOR_IDS.length,
      routeMonthCleanNoHitRouteCount: uniqueCleanRoutes.size,
      hiddenRouteCount: hiddenRouteIds.size,
      hiddenCandidateCount,
      maxHiddenDetectorScore: hiddenScores.length === 0 ? null : Math.max(...hiddenScores),
    },
    baselineDetectors,
  };
}
