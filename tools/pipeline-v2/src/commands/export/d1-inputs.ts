import type { Database } from "bun:sqlite";
import { join } from "node:path";
import type { RouteSpeedSpineReadiness } from "@bp/analytics/feature-history";
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
import { decodePreserve } from "@bp/domain/decode";
import {
  STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME,
  StudioRouteEvidenceIndexSchema,
} from "@bp/domain/studio/route-evidence";
import { Schema } from "effect";
import { readJsonArtifact } from "../../lib/json.ts";
import { PRIMARY_ROUTE_SPEED_FLOOR } from "../../lib/logical-datasets.ts";
import { defaultArtifactRootPath } from "../../lib/paths.ts";

const DEFAULT_HISTORY_START_MONTH = PRIMARY_ROUTE_SPEED_FLOOR;

const SourceMonthCoverageMatrixSchema = Schema.Struct({
  generatedAt: Schema.String,
  artifactPath: Schema.optionalKey(Schema.NullOr(Schema.String)),
  sources: Schema.Array(
    Schema.Struct({
      sourceId: Schema.String,
      label: Schema.String,
      kind: Schema.String,
      grain: Schema.String,
      months: Schema.Array(
        Schema.Struct({
          month: Schema.String,
          status: Schema.String,
          rowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
          routeCount: Schema.NullOr(
            Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
          ),
          note: Schema.NullOr(Schema.String),
        }),
      ),
    }),
  ),
});

export type D1CanonicalInputs = Awaited<ReturnType<typeof readLocalD1Inputs>>;
export type D1AppendixInputs = Awaited<ReturnType<typeof readLocalD1AppendixInputs>>;

type ReadLocalD1InputOptions = {
  sqlite?: Database | undefined;
  artifactRoot?: string | undefined;
  historyStartMonth?: string | undefined;
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
  spine_readiness?: unknown;
  spine_reason_json?: unknown;
  matched_current_segment_count?: unknown;
  unmatched_current_segment_count?: unknown;
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

function nullableNumberValue(value: unknown): number | null {
  return value === null || value === undefined ? null : numberValue(value);
}

function spineReadinessValue(value: unknown): RouteSpeedSpineReadiness {
  if (
    value === "series_ready" ||
    value === "series_ready_with_gaps" ||
    value === "needs_pattern_review" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error(
    "Route speed-history coverage has no valid spine readiness; rerun the coverage materializer for this month before exporting D1 inputs.",
  );
}

function spineReasonsJsonValue(value: unknown): string {
  const text = stringValue(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Route speed-history spine_reason_json is not valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.some((reason) => typeof reason !== "string")) {
    throw new Error("Route speed-history spine_reason_json must be an array of strings.");
  }
  return JSON.stringify(parsed);
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
          available_cell_count, missing_cell_count, spine_readiness, spine_reason_json,
          matched_current_segment_count, unmatched_current_segment_count, generated_at
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
    spineReadiness: spineReadinessValue(row.spine_readiness),
    spineReasonJson: spineReasonsJsonValue(row.spine_reason_json),
    matchedCurrentSegmentCount: nullableNumberValue(row.matched_current_segment_count),
    unmatchedCurrentSegmentCount: nullableNumberValue(row.unmatched_current_segment_count),
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
  const matrix = decodePreserve(SourceMonthCoverageMatrixSchema)(await file.json());
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
    case "mta_wiki_document_operational_date_assertions":
      return "mta-wiki document operational dates";
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

async function readRouteEvidenceIndexRouteArtifacts(input: {
  indexPath?: string | undefined;
  month: string;
}): Promise<{ routeArtifacts: RouteArtifactLike[]; indexAvailable: boolean }> {
  const indexPath = input.indexPath;
  if (indexPath === undefined) return { routeArtifacts: [], indexAvailable: false };
  const file = Bun.file(indexPath);
  if (!(await file.exists())) {
    return { routeArtifacts: [], indexAvailable: false };
  }

  const index = await readJsonArtifact(indexPath, StudioRouteEvidenceIndexSchema);
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
    readRouteEvidenceIndexRouteArtifacts({
      indexPath: options.routeEvidenceIndexPath,
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
    routeArtifacts: mergeRouteArtifacts(routeArtifacts, routeEvidenceIndex.routeArtifacts),
    corridors,
    corridorArtifacts,
    corridorRouteMembers,
    corridorMonthSummaries,
    corridorInterventionContexts,
    corridorHotspots,
    routeMonthSourceStatuses,
    routeMonthTrends,
    routeTimelineIndex: [],
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
    detectorReadinessManifestAvailable: false,
  };
}

export async function readLocalD1AppendixInputs(db: LocalPipelineDb, month: string) {
  const [routeObservedReliabilitySummaries, routeMonthSourceStatuses] = await Promise.all([
    listRouteObservedReliabilitySummaries(db, month),
    listRouteMonthSourceStatuses(db, month),
  ]);
  return { routeObservedReliabilitySummaries, routeMonthSourceStatuses };
}
