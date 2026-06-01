import { Database as BunDatabase, type Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { SPEED_PACE_HOTSPOT_DETECTOR_ID } from "@bp/analytics";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

const ROUTE_MONTH_BASELINE_DETECTOR_ID = "persistent_speed_hotspot";

type ShadowCandidateRow = {
  route_id: unknown;
  candidate_id: unknown;
  scope_id: unknown;
  detector_score: unknown;
  claim_text: unknown;
};

type RouteCoverageRow = {
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
  routeMonthBaselineDetectorId: typeof ROUTE_MONTH_BASELINE_DETECTOR_ID;
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

export function speedPaceShadowAuditPath(input: {
  artifactRoot: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-shadow-audits",
    input.releaseMonth,
    "speed-pace-route-month-shadow.json",
  );
}

function queryRouteMonthCleanNoHits(sqlite: Database, month: string): Set<string> {
  const rows = sqlite
    .query(
      `
        SELECT c.scope_id, NULL AS route_id, c.outcome
        FROM local_finding_coverage_audit c
        WHERE c.month = ?
          AND c.detector_id = ?
          AND c.scope_kind = 'route'
          AND c.outcome = 'clean_no_hit'
      `,
    )
    .all(month, ROUTE_MONTH_BASELINE_DETECTOR_ID) as RouteCoverageRow[];
  return new Set(
    rows
      .map((row) => text(row.route_id) ?? text(row.scope_id))
      .filter((routeId): routeId is string => routeId !== null),
  );
}

function querySpeedPaceCandidates(sqlite: Database, month: string): ShadowCandidateRow[] {
  return sqlite
    .query(
      `
        SELECT route_id, candidate_id, scope_id, detector_score, claim_text
        FROM local_finding_candidate
        WHERE month = ?
          AND detector_id = ?
        ORDER BY detector_score DESC, route_id, scope_id
      `,
    )
    .all(month, SPEED_PACE_HOTSPOT_DETECTOR_ID) as ShadowCandidateRow[];
}

export function buildSpeedPaceRouteMonthShadowAudit(input: {
  sqlite: Database;
  month: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
}): SpeedPaceRouteMonthShadowAuditArtifact {
  const cleanNoHitRoutes = queryRouteMonthCleanNoHits(input.sqlite, input.month);
  const speedPaceCandidates = querySpeedPaceCandidates(input.sqlite, input.month);
  const candidatesByRoute = new Map<
    string,
    Array<{ candidateId: string; scopeId: string; detectorScore: number; claimText: string }>
  >();
  for (const row of speedPaceCandidates) {
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
    routeMonthBaselineDetectorId: ROUTE_MONTH_BASELINE_DETECTOR_ID,
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

export default defineCommand({
  path: ["audit", "speed-pace-shadow"],
  summary:
    "Audit whether route-month clean no-hits hide segment/daypart speed pace hotspot candidates.",
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
    hiddenSegmentHitRouteCount: z.number().int().nonnegative(),
    hiddenSegmentCandidateCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? speedPaceShadowAuditPath({ artifactRoot, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      sqlite.exec("PRAGMA busy_timeout = 5000");
      const artifact = buildSpeedPaceRouteMonthShadowAudit({
        sqlite,
        month: releaseMonth,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        hiddenSegmentHitRouteCount: artifact.summary.hiddenSegmentHitRouteCount,
        hiddenSegmentCandidateCount: artifact.summary.hiddenSegmentCandidateCount,
      };
    } finally {
      sqlite.close();
    }
  },
});
