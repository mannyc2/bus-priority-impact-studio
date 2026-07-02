import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { D1RouteTimelineIndexInput } from "@bp/db/d1/seed";
import {
  getRouteBatchStatus,
  type LocalPipelineDb,
  listCorridorArtifacts,
  listCorridorHotspots,
  listCorridorInterventionContexts,
  listCorridorMonthSummaries,
  listCorridorRouteMembers,
  listCorridors,
  listInterventionEvents,
  listRouteArtifacts,
  listRouteBatchBuiltRoutes,
  listRouteBatchIssues,
  listRouteBriefPeakWindows,
  listRouteBriefSlowestWindows,
  listRouteBriefSummaries,
  listRouteBuildPlan,
  listRouteCatalog,
  listRouteComparisonRanks,
  listRouteEquityContexts,
  listRouteInterventionComparisons,
  listRouteMonthCoverage,
  listRouteMonthSourceStatuses,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
  listRouteReadiness,
  listRouteReliabilityBaselines,
  listRouteReliabilityGapWindows,
  listRouteScorecards,
} from "@bp/db/local";
import {
  STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME,
  StudioRouteEvidenceIndexSchema,
} from "@bp/domain/studio/route-evidence";
import { STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY } from "@bp/domain/studio/snapshots";
import * as z from "zod";
import { defaultArtifactRootPath } from "../../lib/paths.ts";

const DEFAULT_HISTORY_START_MONTH = "2023-04";

const SourceMonthCoverageMatrixSchema = z
  .object({
    generatedAt: z.string(),
    artifactPath: z.string().nullable().optional(),
    sources: z.array(
      z
        .object({
          sourceId: z.string(),
          label: z.string(),
          kind: z.string(),
          grain: z.string(),
          months: z.array(
            z
              .object({
                month: z.string(),
                status: z.string(),
                rowCount: z.number().int().nonnegative(),
                routeCount: z.number().int().nonnegative().nullable(),
                note: z.string().nullable(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteTimelineSupportLevelSchema = z.enum([
  "timeline_ready",
  "timeline_sparse",
  "timeline_review_only",
  "invalid",
]);

const RouteTimelineServingProjectionSchema = z
  .object({
    releaseMonth: z.string(),
    generatedAt: z.string().min(1).optional(),
    routeTimelineIndexRows: z.array(
      z
        .object({
          routeId: z.string().min(1),
          month: z.string().min(1),
          supportLevel: RouteTimelineSupportLevelSchema,
          qualityFlags: z.array(z.string()),
          defaultEventCount: z.number().int().nonnegative(),
          secondaryEventCount: z.number().int().nonnegative(),
          reviewOnlyEventCount: z.number().int().nonnegative(),
          eventCount: z.number().int().nonnegative(),
          sourceBackedEventCount: z.number().int().nonnegative(),
          dateAssertionBackedEventCount: z.number().int().nonnegative(),
          unresolvedDateEventCount: z.number().int().nonnegative(),
          lowConfidenceEventCount: z.number().int().nonnegative(),
          unaccountedCandidateCount: z.number().int().nonnegative(),
          validationErrorCount: z.number().int().nonnegative(),
          validationWarningCount: z.number().int().nonnegative(),
          totalTokens: z.number().int().nonnegative().nullable(),
          defaultEvents: z.array(z.unknown()),
          bundleArtifactKey: z.string().min(1),
          bundleArtifactSha256: z.string().length(64),
          bundleArtifactByteLength: z.number().int().nonnegative(),
          sourceBundlePath: z.string().min(1),
          generatedAt: z.string().min(1),
        })
        .strict(),
    ),
    routeArtifactRows: z.array(
      z
        .object({
          routeId: z.string().min(1),
          month: z.string().min(1),
          artifactName: z.string().min(1),
          artifactKey: z.string().min(1),
          contentType: z.string().min(1),
          byteLength: z.number().int().nonnegative(),
          sha256: z.string().length(64),
        })
        .strict(),
    ),
  })
  .passthrough();

const DetectorReadinessServingManifestSchema = z
  .object({
    artifactKind: z.literal("detector_readiness_serving_manifest"),
    schemaVersion: z.literal(1),
    releaseMonth: z.string().min(1),
    routes: z.array(
      z
        .object({
          routeId: z.string().min(1),
          counts: z
            .object({
              public_finding_candidate: z.number().int().nonnegative(),
              route_context: z.number().int().nonnegative(),
              review_queue: z.number().int().nonnegative(),
              suppressed: z.number().int().nonnegative(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type D1CanonicalInputs = Awaited<ReturnType<typeof readLocalD1Inputs>>;
export type D1AppendixInputs = Awaited<ReturnType<typeof readLocalD1AppendixInputs>>;

type ReadLocalD1InputOptions = {
  sqlite?: Database | undefined;
  artifactRoot?: string | undefined;
  historyStartMonth?: string | undefined;
  routeTimelineProjectionPath?: string | undefined;
  detectorReadinessManifestPath?: string | undefined;
  routeEvidenceIndexPath?: string | undefined;
};

type RawRouteSpeedHistoryCoverageRow = {
  route_id?: unknown;
  month?: unknown;
  route_slug?: unknown;
  history_start_month?: unknown;
  history_end_month?: unknown;
  artifact_path?: unknown;
  artifact_status?: unknown;
  month_count?: unknown;
  segment_count?: unknown;
  cell_count?: unknown;
  available_cell_count?: unknown;
  missing_cell_count?: unknown;
  generated_at?: unknown;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function tableExists(sqlite: Database | undefined, tableName: string): boolean {
  if (sqlite === undefined) return false;
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function listRouteSpeedHistoryCoverageRows(sqlite: Database | undefined, month: string) {
  if (sqlite === undefined || !tableExists(sqlite, "local_route_speed_history_coverage")) {
    return [];
  }
  const rows = sqlite
    .query(
      `
        SELECT route_id, month, route_slug, history_start_month, history_end_month,
          artifact_path, artifact_status, month_count, segment_count, cell_count,
          available_cell_count, missing_cell_count, generated_at
        FROM local_route_speed_history_coverage
        WHERE month = ?
        ORDER BY route_id
      `,
    )
    .all(month) as RawRouteSpeedHistoryCoverageRow[];
  return rows.map((row) => ({
    routeId: stringValue(row.route_id),
    month: stringValue(row.month),
    routeSlug: stringValue(row.route_slug),
    historyStartMonth: stringValue(row.history_start_month),
    historyEndMonth: stringValue(row.history_end_month),
    artifactPath: stringValue(row.artifact_path),
    artifactStatus: stringValue(row.artifact_status),
    monthCount: numberValue(row.month_count),
    segmentCount: numberValue(row.segment_count),
    cellCount: numberValue(row.cell_count),
    availableCellCount: numberValue(row.available_cell_count),
    missingCellCount: numberValue(row.missing_cell_count),
    generatedAt: stringValue(row.generated_at),
  }));
}

async function readSourceMonthCoverageRows(input: {
  artifactRoot: string;
  historyStartMonth: string;
  releaseMonth: string;
}) {
  const matrixPath = join(
    input.artifactRoot,
    "source-month-coverage",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    "coverage-matrix.json",
  );
  const file = Bun.file(matrixPath);
  if (!(await file.exists())) return [];
  const matrix = SourceMonthCoverageMatrixSchema.parse(await file.json());
  return matrix.sources.flatMap((source) =>
    source.months.map((cell) => ({
      sourceId: source.sourceId,
      month: cell.month,
      label: source.label,
      sourceKind: source.kind,
      grain: source.grain,
      status: cell.status,
      rowCount: cell.rowCount,
      routeCount: cell.routeCount,
      note: cell.note,
      generatedAt: matrix.generatedAt,
      artifactPath: matrix.artifactPath ?? matrixPath,
    })),
  );
}

type RouteArtifactLike = {
  routeId: string;
  month: string;
  artifactName: string;
  artifactKey: string;
  contentType: string;
  byteLength: number;
  sha256: string;
};

function routeArtifactIdentity(row: RouteArtifactLike): string {
  return `${row.routeId}\u0000${row.month}\u0000${row.artifactName}`;
}

function mergeRouteArtifacts(
  localRows: RouteArtifactLike[],
  projectedRows: RouteArtifactLike[],
): RouteArtifactLike[] {
  const rowsByKey = new Map<string, RouteArtifactLike>();
  for (const row of localRows) rowsByKey.set(routeArtifactIdentity(row), row);
  for (const row of projectedRows) rowsByKey.set(routeArtifactIdentity(row), row);
  return [...rowsByKey.values()].sort(
    (left, right) =>
      left.routeId.localeCompare(right.routeId) ||
      left.month.localeCompare(right.month) ||
      left.artifactName.localeCompare(right.artifactName),
  );
}

function isSourceGapComparison(row: {
  evaluationLevel: string;
  comparisonStatus: string;
}): boolean {
  return (
    row.evaluationLevel === "not_evaluated_source_gap" ||
    row.comparisonStatus.startsWith("source_gap")
  );
}

function sourceGapProgram(sourceId: string): string {
  switch (sourceId) {
    case "nyc_dot_bus_lanes":
      return "NYC DOT Bus Lanes";
    case "mta_ace_routes":
      return "MTA ACE";
    case "tier2_document_operational_date_assertions":
      return "Tier 2 document operational dates";
    default:
      return sourceId;
  }
}

function completeInterventionEventsForComparisons(
  interventionEvents: Awaited<ReturnType<typeof listInterventionEvents>>,
  routeInterventionComparisons: Awaited<ReturnType<typeof listRouteInterventionComparisons>>,
) {
  const eventsById = new Map(interventionEvents.map((row) => [row.eventId, row]));
  const completed = [...interventionEvents];
  const missingNonSourceGapIds = new Set<string>();

  for (const comparison of routeInterventionComparisons) {
    if (eventsById.has(comparison.eventId)) {
      continue;
    }

    if (!isSourceGapComparison(comparison)) {
      missingNonSourceGapIds.add(comparison.eventId);
      continue;
    }

    const event = {
      eventId: comparison.eventId,
      routeId: comparison.routeId,
      interventionType: comparison.interventionType,
      sourceId: comparison.sourceId,
      program: sourceGapProgram(comparison.sourceId),
      implementationDate: `${comparison.month}-01T00:00:00.000Z`,
      implementationMonth: comparison.month,
      eventStatus: "source_gap",
      description: comparison.caveat,
    };
    eventsById.set(event.eventId, event);
    completed.push(event);
  }

  if (missingNonSourceGapIds.size > 0) {
    throw new Error(
      `Missing intervention event row(s) for non-source-gap comparison(s): ${[
        ...missingNonSourceGapIds,
      ]
        .sort()
        .join(", ")}`,
    );
  }

  return completed.sort(
    (left, right) =>
      left.routeId.localeCompare(right.routeId) ||
      left.implementationDate.localeCompare(right.implementationDate) ||
      left.eventId.localeCompare(right.eventId),
  );
}

async function readRouteTimelineProjectionRows(input: {
  projectionPath?: string | undefined;
  artifactRoot: string;
  month: string;
}): Promise<{
  routeTimelineIndex: D1RouteTimelineIndexInput[];
  routeArtifacts: RouteArtifactLike[];
}> {
  const projectionPath =
    input.projectionPath ??
    (await findDefaultRouteTimelineProjectionPath({
      artifactRoot: input.artifactRoot,
      month: input.month,
    }));
  if (projectionPath === undefined) {
    return { routeTimelineIndex: [], routeArtifacts: [] };
  }
  const file = Bun.file(projectionPath);
  if (!(await file.exists())) {
    throw new Error(`Route timeline serving projection not found: ${projectionPath}`);
  }
  const projection = RouteTimelineServingProjectionSchema.parse(await file.json());
  if (projection.releaseMonth !== input.month) {
    throw new Error(
      `Route timeline serving projection month ${projection.releaseMonth} does not match export month ${input.month}.`,
    );
  }
  const offMonthTimelineRow = projection.routeTimelineIndexRows.find(
    (row) => row.month !== input.month,
  );
  if (offMonthTimelineRow !== undefined) {
    throw new Error(
      `Route timeline index row ${offMonthTimelineRow.routeId} has month ${offMonthTimelineRow.month}, expected ${input.month}.`,
    );
  }
  const offMonthArtifactRow = projection.routeArtifactRows.find((row) => row.month !== input.month);
  if (offMonthArtifactRow !== undefined) {
    throw new Error(
      `Route timeline artifact row ${offMonthArtifactRow.routeId} has month ${offMonthArtifactRow.month}, expected ${input.month}.`,
    );
  }
  return {
    routeTimelineIndex: projection.routeTimelineIndexRows,
    routeArtifacts: projection.routeArtifactRows,
  };
}

async function findFilesNamed(root: string, fileName: string): Promise<string[]> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFilesNamed(path, fileName)));
      continue;
    }
    if (entry.isFile() && entry.name === fileName) {
      files.push(path);
    }
  }
  return files;
}

async function findDefaultRouteTimelineProjectionPath(input: {
  artifactRoot: string;
  month: string;
}): Promise<string | undefined> {
  const candidates = await findFilesNamed(
    join(input.artifactRoot, "docs"),
    "route-timeline-serving-projection.json",
  );
  const matching: Array<{ path: string; generatedAt: string }> = [];
  for (const path of candidates) {
    const projection = RouteTimelineServingProjectionSchema.safeParse(await Bun.file(path).json());
    if (!projection.success || projection.data.releaseMonth !== input.month) continue;
    matching.push({
      path,
      generatedAt: projection.data.generatedAt ?? "",
    });
  }
  return matching.sort(
    (left, right) =>
      right.generatedAt.localeCompare(left.generatedAt) || right.path.localeCompare(left.path),
  )[0]?.path;
}

async function readDetectorReadinessManifestRouteArtifacts(input: {
  manifestPath?: string | undefined;
  month: string;
}): Promise<{ routeArtifacts: RouteArtifactLike[]; manifestAvailable: boolean }> {
  if (input.manifestPath === undefined) {
    return { routeArtifacts: [], manifestAvailable: false };
  }

  const file = Bun.file(input.manifestPath);
  if (!(await file.exists())) {
    return { routeArtifacts: [], manifestAvailable: false };
  }

  const body = await file.text();
  const manifest = DetectorReadinessServingManifestSchema.parse(JSON.parse(body));
  if (manifest.releaseMonth !== input.month) {
    throw new Error(
      `Detector readiness serving manifest month ${manifest.releaseMonth} does not match export month ${input.month}.`,
    );
  }

  const byteLength = new TextEncoder().encode(body).byteLength;
  const sha256 = createHash("sha256").update(body).digest("hex");
  const routeArtifacts = manifest.routes
    .filter(
      (route) =>
        route.counts.public_finding_candidate > 0 ||
        route.counts.route_context > 0 ||
        route.counts.review_queue > 0 ||
        route.counts.suppressed > 0,
    )
    .map(
      (route): RouteArtifactLike => ({
        routeId: route.routeId,
        month: input.month,
        artifactName: "detector_readiness_manifest",
        artifactKey: STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY,
        contentType: "application/json",
        byteLength,
        sha256,
      }),
    );

  return { routeArtifacts, manifestAvailable: true };
}

async function readRouteEvidenceIndexRouteArtifacts(input: {
  indexPath?: string | undefined;
  artifactRoot: string;
  month: string;
}): Promise<{ routeArtifacts: RouteArtifactLike[]; indexAvailable: boolean }> {
  const indexPath =
    input.indexPath ?? join(input.artifactRoot, "studio", "v2", "wiki", "index.json");
  const file = Bun.file(indexPath);
  if (!(await file.exists())) {
    return { routeArtifacts: [], indexAvailable: false };
  }

  const index = StudioRouteEvidenceIndexSchema.parse(await file.json());
  return {
    routeArtifacts: index.routes.map(
      (route): RouteArtifactLike => ({
        routeId: route.routeId,
        month: input.month,
        artifactName: STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME,
        artifactKey: route.artifactKey,
        contentType: route.contentType,
        byteLength: route.byteLength,
        sha256: route.sha256,
      }),
    ),
    indexAvailable: true,
  };
}

export async function readLocalD1Inputs(
  db: LocalPipelineDb,
  month: string,
  options: ReadLocalD1InputOptions = {},
) {
  const readLegacyRouteTimelineProjection =
    options.routeEvidenceIndexPath === undefined ||
    options.routeTimelineProjectionPath !== undefined;
  const [
    routeCatalog,
    routeCoverage,
    routeReadiness,
    routeBuildPlan,
    routeReliabilityBaseline,
    routeReliabilityGapWindows,
    routeObservedReliabilitySummaries,
    interventionEvents,
    routeInterventionComparisons,
    routeArtifacts,
    corridors,
    corridorArtifacts,
    corridorRouteMembers,
    corridorMonthSummaries,
    corridorInterventionContexts,
    corridorHotspots,
    routeMonthSourceStatuses,
    routeMonthTrends,
    routeEquityContext,
    routeScorecards,
    routeBriefSummaries,
    routeBriefPeakWindows,
    routeBriefSlowestWindows,
    routeComparisonRanks,
    routeBatchStatus,
    routeBatchBuiltRoutes,
    routeBatchIssues,
    sourceMonthCoverage,
    routeTimelineProjection,
    detectorReadinessManifest,
    routeEvidenceIndex,
  ] = await Promise.all([
    listRouteCatalog(db),
    listRouteMonthCoverage(db, month),
    listRouteReadiness(db, month),
    listRouteBuildPlan(db, month),
    listRouteReliabilityBaselines(db, month),
    listRouteReliabilityGapWindows(db, month),
    listRouteObservedReliabilitySummaries(db, month),
    listInterventionEvents(db),
    listRouteInterventionComparisons(db, month),
    listRouteArtifacts(db, month),
    listCorridors(db),
    listCorridorArtifacts(db, month),
    listCorridorRouteMembers(db, month),
    listCorridorMonthSummaries(db, month),
    listCorridorInterventionContexts(db, month),
    listCorridorHotspots(db, month),
    listRouteMonthSourceStatuses(db, month),
    listRouteMonthTrends(db),
    listRouteEquityContexts(db, month),
    listRouteScorecards(db, month),
    listRouteBriefSummaries(db, month),
    listRouteBriefPeakWindows(db, month),
    listRouteBriefSlowestWindows(db, month),
    listRouteComparisonRanks(db, month),
    getRouteBatchStatus(db, month),
    listRouteBatchBuiltRoutes(db, month),
    listRouteBatchIssues(db, month),
    readSourceMonthCoverageRows({
      artifactRoot: options.artifactRoot ?? defaultArtifactRootPath(),
      historyStartMonth: options.historyStartMonth ?? DEFAULT_HISTORY_START_MONTH,
      releaseMonth: month,
    }),
    readLegacyRouteTimelineProjection
      ? readRouteTimelineProjectionRows({
          projectionPath: options.routeTimelineProjectionPath,
          artifactRoot: options.artifactRoot ?? defaultArtifactRootPath(),
          month,
        })
      : Promise.resolve({ routeTimelineIndex: [], routeArtifacts: [] }),
    readDetectorReadinessManifestRouteArtifacts({
      manifestPath: options.detectorReadinessManifestPath,
      month,
    }),
    readRouteEvidenceIndexRouteArtifacts({
      indexPath: options.routeEvidenceIndexPath,
      artifactRoot: options.artifactRoot ?? defaultArtifactRootPath(),
      month,
    }),
  ]);
  const routeSpeedHistoryCoverage = listRouteSpeedHistoryCoverageRows(options.sqlite, month);

  return {
    routeCatalog,
    routeCoverage,
    routeReadiness,
    routeBuildPlan,
    routeReliabilityBaseline,
    routeReliabilityGapWindows,
    routeObservedReliabilitySummaries,
    interventionEvents: completeInterventionEventsForComparisons(
      interventionEvents,
      routeInterventionComparisons,
    ),
    routeInterventionComparisons,
    routeArtifacts: mergeRouteArtifacts(routeArtifacts, [
      ...routeTimelineProjection.routeArtifacts,
      ...detectorReadinessManifest.routeArtifacts,
      ...routeEvidenceIndex.routeArtifacts,
    ]),
    corridors,
    corridorArtifacts,
    corridorRouteMembers,
    corridorMonthSummaries,
    corridorInterventionContexts,
    corridorHotspots,
    routeMonthSourceStatuses,
    routeMonthTrends,
    routeTimelineIndex: routeTimelineProjection.routeTimelineIndex,
    routeEquityContext,
    routeScorecards,
    routeBriefSummaries,
    routeBriefPeakWindows,
    routeBriefSlowestWindows,
    routeComparisonRanks,
    routeBatchStatus,
    routeBatchBuiltRoutes,
    routeBatchIssues,
    routeSpeedHistoryCoverage,
    sourceMonthCoverage,
    detectorReadinessManifestAvailable: detectorReadinessManifest.manifestAvailable,
  };
}

export async function readLocalD1AppendixInputs(db: LocalPipelineDb, month: string) {
  const [routeObservedReliabilitySummaries, routeMonthSourceStatuses] = await Promise.all([
    listRouteObservedReliabilitySummaries(db, month),
    listRouteMonthSourceStatuses(db, month),
  ]);
  return { routeObservedReliabilitySummaries, routeMonthSourceStatuses };
}
