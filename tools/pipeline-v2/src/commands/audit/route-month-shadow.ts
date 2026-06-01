import { Database as BunDatabase, type Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

const ROUTE_MONTH_BASELINE_DETECTOR_IDS = [
  "multi_month_speed_peer",
  "intervention_gap",
  "intervention_underperformance",
  "permit_correlated_slowdown",
  "service_request_context",
] as const;

const RICHER_GRAIN_DETECTOR_IDS = [
  "speed_pace_hotspot",
  "headway_reliability_ewt",
  "bunching_hotspots",
  "schedule_mismatch",
  "travel_time_variability",
  "degradation_trend",
] as const;

type RouteMonthCleanNoHitRow = {
  detector_id: unknown;
  route_id: unknown;
};

type RicherCandidateRow = {
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

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

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

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function addCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function routeMonthShadowAuditPath(input: {
  artifactRoot: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-shadow-audits",
    input.releaseMonth,
    "route-month-false-negative-shadow.json",
  );
}

function queryRouteMonthCleanNoHits(sqlite: Database, month: string): RouteMonthCleanNoHitRow[] {
  return sqlite
    .query(
      `
        SELECT detector_id, scope_id AS route_id
        FROM local_finding_coverage_audit
        WHERE month = ?
          AND detector_id IN (${placeholders(ROUTE_MONTH_BASELINE_DETECTOR_IDS)})
          AND scope_kind = 'route'
          AND outcome = 'clean_no_hit'
        ORDER BY detector_id, scope_id
      `,
    )
    .all(month, ...ROUTE_MONTH_BASELINE_DETECTOR_IDS) as RouteMonthCleanNoHitRow[];
}

function queryRicherCandidates(sqlite: Database, month: string): RicherCandidateRow[] {
  return sqlite
    .query(
      `
        SELECT detector_id, route_id, candidate_id, scope_kind, scope_id, reason_code, detector_score, claim_text
        FROM local_finding_candidate
        WHERE month = ?
          AND detector_id IN (${placeholders(RICHER_GRAIN_DETECTOR_IDS)})
          AND route_id IS NOT NULL
        ORDER BY detector_score DESC, detector_id, route_id, scope_id
      `,
    )
    .all(month, ...RICHER_GRAIN_DETECTOR_IDS) as RicherCandidateRow[];
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
        for (const candidate of candidates) addCount(hiddenCandidateDetectorCounts, candidate.detectorId);
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

export default defineCommand({
  path: ["audit", "route-month-shadow"],
  summary:
    "Audit route-month clean no-hits against richer-grain detector candidates on the same routes.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    routeMonthCleanNoHitRouteCount: z.number().int().nonnegative(),
    hiddenRouteCount: z.number().int().nonnegative(),
    hiddenCandidateCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? routeMonthShadowAuditPath({ artifactRoot, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const artifact = buildRouteMonthShadowAudit({
        month: releaseMonth,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        cleanNoHitRows: queryRouteMonthCleanNoHits(sqlite, releaseMonth),
        richerCandidateRows: queryRicherCandidates(sqlite, releaseMonth),
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        routeMonthCleanNoHitRouteCount: artifact.summary.routeMonthCleanNoHitRouteCount,
        hiddenRouteCount: artifact.summary.hiddenRouteCount,
        hiddenCandidateCount: artifact.summary.hiddenCandidateCount,
      };
    } finally {
      sqlite.close();
    }
  },
});
