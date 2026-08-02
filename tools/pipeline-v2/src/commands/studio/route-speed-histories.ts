import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  routeSpeedHistoryArtifactPath,
  routeSpeedHistoryManifestPath,
  routeSpeedSpineManifestPath,
} from "@bp/analytics/artifacts";
import {
  buildRouteSpeedHistoryBatchManifest,
  DEFAULT_ROUTE_SPEED_HISTORY_READINESS,
  parseRouteSpeedHistoryReadinessList,
  ROUTE_SPEED_SPINE_DEFAULT_START_MONTH,
  type RouteSpeedHistoryBatchRoute,
  type RouteSpeedSpineReadiness,
} from "@bp/analytics/feature-history";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadCompleteRouteSpeedScheduleMonths } from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";
import { runRouteSpeedHistory } from "./route-speed-history.ts";

const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

const RouteSpeedSpineManifestSchema = Schema.Struct({
  artifactKind: Schema.Literal("studio_route_speed_spine_manifest"),
  schemaVersion: Schema.Literal(1),
  source: Schema.Struct({
    startMonth: Schema.String.check(Schema.isPattern(ISO_MONTH_RE)),
    endMonth: Schema.NullOr(Schema.String.check(Schema.isPattern(ISO_MONTH_RE))),
  }),
  routes: Schema.Array(
    Schema.Struct({
      routeId: Schema.String.check(Schema.isMinLength(1)),
      routeSlug: Schema.String.check(Schema.isMinLength(1)),
      readiness: Schema.Literals([
        "series_ready",
        "series_ready_with_gaps",
        "needs_pattern_review",
        "failed",
      ]),
      artifactPath: Schema.String.check(Schema.isMinLength(1)),
      artifactWritten: Schema.Boolean,
    }),
  ),
});

type RouteSpeedSpineManifest = typeof RouteSpeedSpineManifestSchema.Type;

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function normalizeRouteId(routeId: string): string {
  return routeId.trim().toUpperCase();
}

function parseRouteList(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(",")
    .map((routeId) => normalizeRouteId(routeId))
    .filter((routeId) => routeId.length > 0);
}

function absoluteArtifactPath(path: string): string {
  return isAbsolute(path) ? path : fromCliPath(path);
}

export async function runRouteSpeedHistories(input: {
  local: OpenLocalPipelineDb;
  startMonth: string;
  endMonth: string | null;
  artifactRoot?: string | undefined;
  spineManifest?: string | undefined;
  output?: string | undefined;
  routeIds?: readonly string[] | undefined;
  readiness?: readonly RouteSpeedSpineReadiness[] | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  force?: boolean | undefined;
  generatedAt?: string | undefined;
}): Promise<{
  manifestPath: string;
  routeCount: number;
  writtenRouteCount: number;
  skippedExistingRouteCount: number;
  blockedRouteCount: number;
  failedRouteCount: number;
  artifactReadyRouteCount: number;
  totalCellCount: number;
  availableCellCount: number;
  missingCellCount: number;
  unmappedRawKeyCount: number;
}> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const spineManifestPath =
    input.spineManifest ??
    routeSpeedSpineManifestPath({
      artifactRoot,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    });
  const outputPath =
    input.output ??
    routeSpeedHistoryManifestPath({
      artifactRoot,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    });
  const manifest = (await readJsonArtifact(
    spineManifestPath,
    RouteSpeedSpineManifestSchema,
  )) as RouteSpeedSpineManifest;
  const routeFilterIds = new Set((input.routeIds ?? []).map(normalizeRouteId));
  const readinessFilter = new Set(input.readiness ?? DEFAULT_ROUTE_SPEED_HISTORY_READINESS);
  const offset = input.offset ?? 0;
  const selectedRoutes = manifest.routes
    .filter(
      (route) => routeFilterIds.size === 0 || routeFilterIds.has(normalizeRouteId(route.routeId)),
    )
    .filter((route) => readinessFilter.has(route.readiness))
    .slice(offset, input.limit === undefined ? undefined : offset + input.limit);
  const completeScheduleMonths = loadCompleteRouteSpeedScheduleMonths({
    sqlite: input.local.sqlite,
    startMonth: manifest.source.startMonth,
    endMonth: manifest.source.endMonth ?? manifest.source.startMonth,
  });

  const routes: RouteSpeedHistoryBatchRoute[] = [];
  for (const route of selectedRoutes) {
    const routeId = normalizeRouteId(route.routeId);
    const historyPath = routeSpeedHistoryArtifactPath({
      artifactRoot,
      routeSlug: route.routeSlug,
    });
    const spinePath = absoluteArtifactPath(route.artifactPath);
    if (!route.artifactWritten) {
      routes.push({
        routeId,
        routeSlug: route.routeSlug,
        readiness: route.readiness,
        status: "blocked",
        reasons: ["spine_artifact_not_written"],
        spinePath: repoDisplayPath(spinePath),
        artifactPath: repoDisplayPath(historyPath),
        monthCount: null,
        segmentCount: null,
        cellCount: null,
        availableCellCount: null,
        missingCellCount: null,
        unmappedRawKeyCount: null,
      });
      continue;
    }

    try {
      const result = await runRouteSpeedHistory({
        local: input.local,
        routeId,
        artifactRoot,
        spine: spinePath,
        output: historyPath,
        completeScheduleMonths,
      });
      routes.push({
        routeId,
        routeSlug: result.routeSlug,
        readiness: route.readiness,
        status: "written",
        reasons: [],
        spinePath: repoDisplayPath(spinePath),
        artifactPath: result.outputPath,
        monthCount: result.monthCount,
        segmentCount: result.segmentCount,
        cellCount: result.cellCount,
        availableCellCount: result.availableCellCount,
        missingCellCount: result.missingCellCount,
        unmappedRawKeyCount: result.unmappedRawKeyCount,
      });
    } catch (err) {
      routes.push({
        routeId,
        routeSlug: route.routeSlug,
        readiness: route.readiness,
        status: "failed",
        reasons: [(err as Error).message],
        spinePath: repoDisplayPath(spinePath),
        artifactPath: repoDisplayPath(historyPath),
        monthCount: null,
        segmentCount: null,
        cellCount: null,
        availableCellCount: null,
        missingCellCount: null,
        unmappedRawKeyCount: null,
      });
    }
  }

  const batchManifest = buildRouteSpeedHistoryBatchManifest({
    generatedAt,
    dbPath: repoDisplayPath(input.local.path),
    artifactRoot: repoDisplayPath(artifactRoot),
    spineManifestPath: repoDisplayPath(spineManifestPath),
    startMonth: manifest.source.startMonth,
    endMonth: manifest.source.endMonth,
    readiness: [...readinessFilter],
    force: input.force === true,
    routeFilterCount: routeFilterIds.size,
    completeScheduleMonthCount: completeScheduleMonths.size,
    routes,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, batchManifest);

  return {
    manifestPath: repoDisplayPath(outputPath),
    ...batchManifest.summary,
  };
}

export default defineCommand({
  path: ["studio", "route-speed-histories"],
  summary:
    "Build route speed-history artifacts for every eligible route in a speed-spine manifest.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        startMonth: Schema.String.check(Schema.isPattern(ISO_MONTH_RE))
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(ROUTE_SPEED_SPINE_DEFAULT_START_MONTH),
            ),
          )
          .annotate({ description: "First source month used by the spine manifest, YYYY-MM" }),
        endMonth: Schema.optionalKey(Schema.String.check(Schema.isPattern(ISO_MONTH_RE))).annotate({
          description: "Last source month used by the spine manifest, YYYY-MM",
        }),
        routes: Schema.optionalKey(Schema.String).annotate({
          description: "Comma-separated route IDs to include",
        }),
        readiness: Schema.optionalKey(Schema.String).annotate({
          description: "Comma-separated spine readiness states to materialize",
        }),
        limit: Schema.optionalKey(
          arg.number().check(Schema.isInt()).check(Schema.isGreaterThan(0)),
        ).annotate({ description: "Maximum route count to process" }),
        offset: arg
          .number()
          .check(Schema.isInt())
          .check(Schema.isGreaterThanOrEqualTo(0))
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(0)))
          .annotate({ description: "Selected route offset" }),
        force: arg
          .boolean()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
          .annotate({ description: "Rebuild valid existing speed-history artifacts" }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        spineManifest: Schema.optionalKey(Schema.String).annotate({
          description: "Override speed-spines manifest path",
        }),
        output: Schema.optionalKey(Schema.String).annotate({
          description: "Override speed-histories manifest output path",
        }),
      },
    }),
  },
  output: Schema.Struct({
    manifestPath: Schema.String,
    routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    writtenRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    skippedExistingRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    blockedRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    failedRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    artifactReadyRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    totalCellCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    availableCellCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    missingCellCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    unmappedRawKeyCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  async run({ input }) {
    const routeIds = parseRouteList(input.options.routes);
    const readiness = parseRouteSpeedHistoryReadinessList(input.options.readiness);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "studio.route-speed-histories",
      operation: "runRouteSpeedHistories",
      spanAttributes: {
        startMonth: input.options.startMonth,
        endMonth: input.options.endMonth ?? null,
        routeFilterCount: routeIds.length,
        readinessFilterCount: readiness.length,
        limit: input.options.limit ?? null,
        offset: input.options.offset,
        force: input.options.force,
      },
      run: (local) =>
        runRouteSpeedHistories({
          local,
          startMonth: input.options.startMonth,
          endMonth: input.options.endMonth ?? null,
          routeIds,
          readiness,
          limit: input.options.limit,
          offset: input.options.offset,
          force: input.options.force,
          artifactRoot:
            input.options.artifactRoot === undefined
              ? undefined
              : fromCliPath(input.options.artifactRoot),
          spineManifest:
            input.options.spineManifest === undefined
              ? undefined
              : fromCliPath(input.options.spineManifest),
          output:
            input.options.output === undefined ? undefined : fromCliPath(input.options.output),
        }),
    });
  },
});
