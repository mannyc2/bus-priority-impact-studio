import type { Database, SQLQueryBindings } from "bun:sqlite";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

type RouteRow = {
  route_id?: unknown;
  run_id?: unknown;
};

export type MaterializationCoverageStatus = "complete" | "partial" | "missing" | "not_applicable";

export type MaterializationCoverageSurface = {
  surfaceId: string;
  registryProductId: string | null;
  label: string;
  layer: "artifact" | "table" | "aggregate_artifact";
  expectedBasis: string;
  path: string | null;
  tableName: string | null;
  expectedRouteCount: number;
  materializedRouteCount: number;
  missingRouteCount: number;
  materializedRouteShare: number | null;
  status: MaterializationCoverageStatus;
  sampleMaterializedRoutes: string[];
  sampleMissingRoutes: string[];
  note: string;
};

export type AnalyticsMaterializationCoverageAudit = {
  artifactKind: "analytics_materialization_coverage";
  generatedAt: string;
  month: string;
  runId: string;
  gtfsRunId: string | null;
  artifactPath: string;
  dbPath: string | null;
  routeUniverse: {
    routeCatalogCount: number;
    gtfsStaticRouteCount: number;
    observedHeadwayRouteCount: number;
    ewtEligibleRouteCount: number;
  };
  summary: {
    surfaceCount: number;
    completeSurfaceCount: number;
    partialSurfaceCount: number;
    missingSurfaceCount: number;
    notApplicableSurfaceCount: number;
    totalExpectedRoutes: number;
    totalMaterializedRoutes: number;
    totalMissingRoutes: number;
  };
  surfaces: MaterializationCoverageSurface[];
  nextActions: string[];
};

export const MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_BY_SURFACE = {
  stop_direction_hour_ewt_features: "stop_direction_hour_ewt_features",
  route_brief_input_slices: "route_brief_input_slices",
  route_briefs: "generated_route_briefs",
  ewt_route_month_score_vectors: "ewt_route_month_score_vectors",
  local_route_brief_summary: "studio_route_brief_summaries",
  local_route_scorecard: "studio_route_scorecards",
  local_route_segment_speed: "local_route_segment_speed_history",
  local_route_hourly_ridership: "local_route_hourly_ridership_history",
  local_route_observed_reliability_summary: "local_route_observed_reliability_summary_release",
} as const;

export const MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_IDS = [
  ...new Set(Object.values(MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_BY_SURFACE)),
].sort();

type MaterializationCoverageRegistryProductId =
  (typeof MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_BY_SURFACE)[keyof typeof MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_BY_SURFACE];

export type MaterializationCoverageRegistryProduct = {
  id: string;
  label: string;
  expectedBasis: string;
};

export type BuildAnalyticsMaterializationCoverageInput = {
  sqlite: Database;
  month: string;
  runId: string;
  gtfsRunId?: string | null;
  artifactRoot: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  historyStartMonth: string;
  registryProducts: readonly MaterializationCoverageRegistryProduct[];
};

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeRouteIdText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0) return null;
  return trimmed.replace(/^([A-Z]+)0+([1-9][0-9]*)$/, "$1$2");
}

function canonicalRouteId(value: unknown, routeUniverse: ReadonlySet<string>): string | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : null;
  if (raw === null || raw.length === 0) return null;
  if (routeUniverse.has(raw)) return raw;

  const normalized = normalizeRouteIdText(raw);
  if (normalized === null) return null;
  return routeUniverse.has(normalized) ? normalized : normalized;
}

function routeIdValue(value: unknown): string | null {
  const text = textValue(value);
  return text === null ? null : text.toUpperCase();
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function columnExists(sqlite: Database, tableName: string, columnName: string): boolean {
  if (!tableExists(sqlite, tableName)) return false;
  const rows = sqlite.query(`PRAGMA table_info(${tableName})`).all() as { name?: unknown }[];
  return rows.some((row) => row.name === columnName);
}

function routeSetFromRows(
  rows: readonly RouteRow[],
  routeUniverse: ReadonlySet<string> | null = null,
): Set<string> {
  return new Set(
    rows
      .map((row) =>
        routeUniverse === null
          ? routeIdValue(row.route_id)
          : canonicalRouteId(row.route_id, routeUniverse),
      )
      .filter(
        (routeId): routeId is string =>
          routeId !== null && (routeUniverse === null || routeUniverse.has(routeId)),
      )
      .sort(),
  );
}

function routeSetFromQuery(input: {
  sqlite: Database;
  tableName: string;
  sql: string;
  params?: SQLQueryBindings[];
  routeUniverse?: ReadonlySet<string> | null;
}): Set<string> {
  if (!tableExists(input.sqlite, input.tableName)) return new Set();
  return routeSetFromRows(
    input.sqlite.query(input.sql).all(...(input.params ?? [])) as RouteRow[],
    input.routeUniverse ?? null,
  );
}

function latestGtfsRunId(sqlite: Database): string | null {
  if (!tableExists(sqlite, "local_gtfs_static_bundle")) return null;
  const row = sqlite
    .query(
      `
        SELECT run_id
        FROM local_gtfs_static_bundle
        GROUP BY run_id
        ORDER BY MAX(ingested_at) DESC, run_id DESC
        LIMIT 1
      `,
    )
    .get() as RouteRow | null;
  return textValue(row?.run_id);
}

function intersection(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
  return new Set([...left].filter((routeId) => right.has(routeId)).sort());
}

function sortedRoutes(routes: ReadonlySet<string>): string[] {
  return [...routes].sort();
}

function registryProduct(
  productsById: ReadonlyMap<string, MaterializationCoverageRegistryProduct>,
  id: MaterializationCoverageRegistryProductId,
): MaterializationCoverageRegistryProduct {
  const product = productsById.get(id);
  if (product === undefined) {
    throw new Error(`Materialization coverage registry product is missing: ${id}`);
  }
  return product;
}

async function safeDirEntries(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function ewtArtifactRoutes(
  artifactRoot: string,
  month: string,
  runId: string,
): Promise<Set<string>> {
  const root = join(artifactRoot, "analytics-stop-direction-hour-ewt", month, runId);
  const routes = new Set<string>();
  for (const entry of await safeDirEntries(root)) {
    if (!entry.isDirectory()) continue;
    const artifactPath = join(root, entry.name, "stop-direction-hour-ewt-features.json");
    if (existsSync(artifactPath)) routes.add(entry.name.toUpperCase());
  }
  return routes;
}

async function routeSliceInputRoutes(artifactRoot: string, month: string): Promise<Set<string>> {
  const root = join(artifactRoot, "route-slices");
  const routes = new Set<string>();
  const suffix = `-${month}`;
  for (const entry of await safeDirEntries(root)) {
    if (!entry.isDirectory() || !entry.name.endsWith(suffix)) continue;
    const routeId = entry.name.slice(0, -suffix.length).toUpperCase();
    if (routeId.length === 0) continue;
    const artifactPath = join(root, entry.name, "route-brief-input.json");
    if (existsSync(artifactPath)) routes.add(routeId);
  }
  return routes;
}

async function routeBriefRoutes(artifactRoot: string, month: string): Promise<Set<string>> {
  const root = join(artifactRoot, "briefs", "routes");
  const routes = new Set<string>();
  for (const entry of await safeDirEntries(root)) {
    if (!entry.isDirectory()) continue;
    const artifactPath = join(root, entry.name, month, "brief.json");
    if (existsSync(artifactPath)) routes.add(entry.name.toUpperCase());
  }
  return routes;
}

function routeIdsFromScoreVectorArtifact(value: unknown): Set<string> {
  if (typeof value !== "object" || value === null) return new Set();
  const artifact = value as {
    scoreVectors?: { releaseMonth?: unknown };
    baselines?: { routes?: unknown };
  };
  const releaseRows = Array.isArray(artifact.scoreVectors?.releaseMonth)
    ? artifact.scoreVectors.releaseMonth
    : [];
  const baselineRows = Array.isArray(artifact.baselines?.routes) ? artifact.baselines.routes : [];
  const rows = releaseRows.length > 0 ? releaseRows : baselineRows;
  return new Set(
    rows
      .map((row) =>
        typeof row === "object" && row !== null && "routeId" in row
          ? routeIdValue((row as { routeId?: unknown }).routeId)
          : null,
      )
      .filter((routeId): routeId is string => routeId !== null)
      .sort(),
  );
}

async function ewtScoreVectorRoutes(input: {
  artifactRoot: string;
  historyStartMonth: string;
  month: string;
}): Promise<Set<string>> {
  const artifactPath = join(
    input.artifactRoot,
    "analytics-ewt-score-vectors",
    `${input.historyStartMonth}_to_${input.month}`,
    input.month,
    "ewt-route-month-score-vectors.json",
  );
  if (!existsSync(artifactPath)) return new Set();
  return routeIdsFromScoreVectorArtifact(await Bun.file(artifactPath).json());
}

type CoverageSurfaceInput = {
  surfaceId: string;
  registryProductId?: string | null;
  label: string;
  layer: MaterializationCoverageSurface["layer"];
  expectedBasis: string;
  expectedRoutes: ReadonlySet<string>;
  materializedRoutes: ReadonlySet<string>;
  path?: string | null;
  tableName?: string | null;
  note: string;
};

function coverageSurface(input: CoverageSurfaceInput): MaterializationCoverageSurface {
  const expectedRoutes = sortedRoutes(input.expectedRoutes);
  const materializedExpectedRoutes = expectedRoutes.filter((routeId) =>
    input.materializedRoutes.has(routeId),
  );
  const missingRoutes = expectedRoutes.filter((routeId) => !input.materializedRoutes.has(routeId));
  const expectedRouteCount = expectedRoutes.length;
  const materializedRouteCount = materializedExpectedRoutes.length;
  const missingRouteCount = missingRoutes.length;
  const materializedRouteShare =
    expectedRouteCount === 0 ? null : materializedRouteCount / expectedRouteCount;
  const status: MaterializationCoverageStatus =
    expectedRouteCount === 0
      ? "not_applicable"
      : materializedRouteCount === 0
        ? "missing"
        : missingRouteCount === 0
          ? "complete"
          : "partial";

  return {
    surfaceId: input.surfaceId,
    registryProductId: input.registryProductId ?? null,
    label: input.label,
    layer: input.layer,
    expectedBasis: input.expectedBasis,
    path: input.path ?? null,
    tableName: input.tableName ?? null,
    expectedRouteCount,
    materializedRouteCount,
    missingRouteCount,
    materializedRouteShare,
    status,
    sampleMaterializedRoutes: materializedExpectedRoutes.slice(0, 12),
    sampleMissingRoutes: missingRoutes.slice(0, 12),
    note: input.note,
  };
}

function registryBackedCoverageSurface(
  productsById: ReadonlyMap<string, MaterializationCoverageRegistryProduct>,
  input: Omit<CoverageSurfaceInput, "label" | "expectedBasis" | "registryProductId"> & {
    registryProductId: MaterializationCoverageRegistryProductId;
  },
): MaterializationCoverageSurface {
  const product = registryProduct(productsById, input.registryProductId);
  return coverageSurface({
    ...input,
    registryProductId: product.id,
    label: product.label,
    expectedBasis: product.expectedBasis,
  });
}

function routeTableRoutes(sqlite: Database, tableName: string, month: string): Set<string> {
  return routeSetFromQuery({
    sqlite,
    tableName,
    sql: `SELECT DISTINCT route_id FROM ${tableName} WHERE month = ? ORDER BY route_id`,
    params: [month],
  });
}

function observedReliabilityRoutes(sqlite: Database, month: string, runId: string): Set<string> {
  return routeSetFromQuery({
    sqlite,
    tableName: "local_route_observed_reliability_summary",
    sql: `
      SELECT DISTINCT route_id
      FROM local_route_observed_reliability_summary
      WHERE month = ? AND run_id = ?
      ORDER BY route_id
    `,
    params: [month, runId],
  });
}

export async function buildAnalyticsMaterializationCoverageAudit(
  input: BuildAnalyticsMaterializationCoverageInput,
): Promise<AnalyticsMaterializationCoverageAudit> {
  const productsById = new Map(input.registryProducts.map((product) => [product.id, product]));
  const gtfsRunId = input.gtfsRunId ?? latestGtfsRunId(input.sqlite);
  const catalogRoutes = routeSetFromQuery({
    sqlite: input.sqlite,
    tableName: "local_route_catalog",
    sql: "SELECT DISTINCT route_id FROM local_route_catalog ORDER BY route_id",
  });
  const speedSourceRoutes = routeSetFromQuery({
    sqlite: input.sqlite,
    tableName: "local_route_segment_speed",
    sql: "SELECT DISTINCT route_id FROM local_route_segment_speed WHERE month = ? ORDER BY route_id",
    params: [input.month],
    routeUniverse: catalogRoutes,
  });
  const ridershipSourceRoutes = routeSetFromQuery({
    sqlite: input.sqlite,
    tableName: "local_route_hourly_ridership",
    sql: "SELECT DISTINCT route_id FROM local_route_hourly_ridership WHERE month = ? ORDER BY route_id",
    params: [input.month],
    routeUniverse: catalogRoutes,
  });
  const gtfsRoutes =
    gtfsRunId === null
      ? new Set<string>()
      : routeSetFromQuery({
          sqlite: input.sqlite,
          tableName: "local_gtfs_static_route",
          sql: "SELECT DISTINCT route_id FROM local_gtfs_static_route WHERE run_id = ? ORDER BY route_id",
          params: [gtfsRunId],
          routeUniverse: catalogRoutes,
        });
  const observedRoutes = routeSetFromQuery({
    sqlite: input.sqlite,
    tableName: "local_observed_headway_sample",
    sql: "SELECT DISTINCT route_id FROM local_observed_headway_sample WHERE run_id = ? ORDER BY route_id",
    params: [input.runId],
    routeUniverse: catalogRoutes,
  });
  const observedReliabilitySql = columnExists(
    input.sqlite,
    "local_route_observed_reliability_summary",
    "sample_count",
  )
    ? `
        SELECT DISTINCT route_id
        FROM local_route_observed_reliability_summary
        WHERE month = ? AND run_id = ? AND sample_count >= 30
        ORDER BY route_id
      `
    : `
        SELECT DISTINCT route_id
        FROM local_route_observed_reliability_summary
        WHERE month = ? AND run_id = ?
        ORDER BY route_id
      `;
  const observedReliabilityExpectedRoutes = routeSetFromQuery({
    sqlite: input.sqlite,
    tableName: "local_route_observed_reliability_summary",
    sql: observedReliabilitySql,
    params: [input.month, input.runId],
    routeUniverse: catalogRoutes,
  });
  const publicVisibleSql = columnExists(input.sqlite, "local_route_brief_summary", "public_visible")
    ? `
        SELECT DISTINCT route_id
        FROM local_route_brief_summary
        WHERE month = ? AND public_visible = 1
        ORDER BY route_id
      `
    : `
        SELECT DISTINCT route_id
        FROM local_route_brief_summary
        WHERE month = ?
        ORDER BY route_id
      `;
  const publicVisibleRoutes = routeSetFromQuery({
    sqlite: input.sqlite,
    tableName: "local_route_brief_summary",
    sql: publicVisibleSql,
    params: [input.month],
    routeUniverse: catalogRoutes,
  });
  const ewtEligibleRoutes = intersection(intersection(catalogRoutes, gtfsRoutes), observedRoutes);
  const surfaces: MaterializationCoverageSurface[] = [
    registryBackedCoverageSurface(productsById, {
      surfaceId: "stop_direction_hour_ewt_features",
      registryProductId: "stop_direction_hour_ewt_features",
      layer: "artifact",
      expectedRoutes: ewtEligibleRoutes,
      materializedRoutes: await ewtArtifactRoutes(input.artifactRoot, input.month, input.runId),
      path: join(input.artifactRoot, "analytics-stop-direction-hour-ewt", input.month, input.runId),
      note: "This is the detector-grade all-stop EWT materialization; source staging alone does not imply these per-route artifacts exist.",
    }),
    registryBackedCoverageSurface(productsById, {
      surfaceId: "route_brief_input_slices",
      registryProductId: "route_brief_input_slices",
      layer: "artifact",
      expectedRoutes: catalogRoutes,
      materializedRoutes: await routeSliceInputRoutes(input.artifactRoot, input.month),
      path: join(input.artifactRoot, "route-slices"),
      note: "One route-slice input should exist for each served route-month.",
    }),
    registryBackedCoverageSurface(productsById, {
      surfaceId: "route_briefs",
      registryProductId: "generated_route_briefs",
      layer: "artifact",
      expectedRoutes: publicVisibleRoutes,
      materializedRoutes: await routeBriefRoutes(input.artifactRoot, input.month),
      path: join(input.artifactRoot, "briefs", "routes"),
      note: "Generated prose/html briefs are downstream serving artifacts, not detector primitives.",
    }),
    registryBackedCoverageSurface(productsById, {
      surfaceId: "ewt_route_month_score_vectors",
      registryProductId: "ewt_route_month_score_vectors",
      layer: "aggregate_artifact",
      expectedRoutes: observedReliabilityExpectedRoutes,
      materializedRoutes: await ewtScoreVectorRoutes({
        artifactRoot: input.artifactRoot,
        historyStartMonth: input.historyStartMonth,
        month: input.month,
      }),
      path: join(
        input.artifactRoot,
        "analytics-ewt-score-vectors",
        `${input.historyStartMonth}_to_${input.month}`,
        input.month,
        "ewt-route-month-score-vectors.json",
      ),
      note: "This artifact is a route-month baseline/calibration surface; it is useful, but it is not a substitute for stop-direction-hour EWT artifacts.",
    }),
    registryBackedCoverageSurface(productsById, {
      surfaceId: "local_route_brief_summary",
      registryProductId: "studio_route_brief_summaries",
      layer: "table",
      expectedRoutes: catalogRoutes,
      materializedRoutes: routeTableRoutes(input.sqlite, "local_route_brief_summary", input.month),
      tableName: "local_route_brief_summary",
      note: "D1/serving-facing route summary rows.",
    }),
    registryBackedCoverageSurface(productsById, {
      surfaceId: "local_route_scorecard",
      registryProductId: "studio_route_scorecards",
      layer: "table",
      expectedRoutes: catalogRoutes,
      materializedRoutes: routeTableRoutes(input.sqlite, "local_route_scorecard", input.month),
      tableName: "local_route_scorecard",
      note: "Route-month scorecard rows used by serving projections.",
    }),
    registryBackedCoverageSurface(productsById, {
      surfaceId: "local_route_segment_speed",
      registryProductId: "local_route_segment_speed_history",
      layer: "table",
      expectedRoutes: speedSourceRoutes,
      materializedRoutes: routeTableRoutes(input.sqlite, "local_route_segment_speed", input.month),
      tableName: "local_route_segment_speed",
      note: "Fine-grain monthly speed surface; should cover the route universe for detector baselines.",
    }),
    registryBackedCoverageSurface(productsById, {
      surfaceId: "local_route_hourly_ridership",
      registryProductId: "local_route_hourly_ridership_history",
      layer: "table",
      expectedRoutes: ridershipSourceRoutes,
      materializedRoutes: routeTableRoutes(
        input.sqlite,
        "local_route_hourly_ridership",
        input.month,
      ),
      tableName: "local_route_hourly_ridership",
      note: "Rider-weighting route-month surface.",
    }),
    registryBackedCoverageSurface(productsById, {
      surfaceId: "local_route_observed_reliability_summary",
      registryProductId: "local_route_observed_reliability_summary_release",
      layer: "table",
      expectedRoutes: observedRoutes,
      materializedRoutes: observedReliabilityRoutes(input.sqlite, input.month, input.runId),
      tableName: "local_route_observed_reliability_summary",
      note: "Route-level observed reliability summary generated from GTFS-RT headway samples.",
    }),
  ];

  const statusCounts = {
    completeSurfaceCount: surfaces.filter((surface) => surface.status === "complete").length,
    partialSurfaceCount: surfaces.filter((surface) => surface.status === "partial").length,
    missingSurfaceCount: surfaces.filter((surface) => surface.status === "missing").length,
    notApplicableSurfaceCount: surfaces.filter((surface) => surface.status === "not_applicable")
      .length,
  };
  const blockedSurfaces = surfaces.filter(
    (surface) => surface.status === "partial" || surface.status === "missing",
  );

  return {
    artifactKind: "analytics_materialization_coverage",
    generatedAt: input.generatedAt,
    month: input.month,
    runId: input.runId,
    gtfsRunId,
    artifactPath: input.artifactPath,
    dbPath: input.dbPath,
    routeUniverse: {
      routeCatalogCount: catalogRoutes.size,
      gtfsStaticRouteCount: gtfsRoutes.size,
      observedHeadwayRouteCount: observedRoutes.size,
      ewtEligibleRouteCount: ewtEligibleRoutes.size,
    },
    summary: {
      surfaceCount: surfaces.length,
      ...statusCounts,
      totalExpectedRoutes: surfaces.reduce((sum, surface) => sum + surface.expectedRouteCount, 0),
      totalMaterializedRoutes: surfaces.reduce(
        (sum, surface) => sum + surface.materializedRouteCount,
        0,
      ),
      totalMissingRoutes: surfaces.reduce((sum, surface) => sum + surface.missingRouteCount, 0),
    },
    surfaces,
    nextActions:
      blockedSurfaces.length === 0
        ? ["No route-materialization gaps found for the audited month/run."]
        : blockedSurfaces.map(
            (surface) =>
              `Materialize or explicitly waive ${surface.surfaceId}: ${surface.materializedRouteCount}/${surface.expectedRouteCount} route(s) present.`,
          ),
  };
}
