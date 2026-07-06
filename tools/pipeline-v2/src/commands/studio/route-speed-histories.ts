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
  type RouteSpeedHistoryArtifact,
  type RouteSpeedHistoryBatchRoute,
  type RouteSpeedSpineReadiness,
} from "@bp/analytics/feature-history";
import { loadCompleteRouteSpeedScheduleMonths } from "@bp/pipeline-v2/local-db-aggregates";
import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, readJsonIfExists, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";
import { runRouteSpeedHistory } from "./route-speed-history.ts";

const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

const RouteSpeedSpineManifestSchema = z
  .object({
    artifactKind: z.literal("studio_route_speed_spine_manifest"),
    schemaVersion: z.literal(1),
    source: z
      .object({
        startMonth: z.string().regex(ISO_MONTH_RE),
        endMonth: z.string().regex(ISO_MONTH_RE).nullable(),
      })
      .passthrough(),
    routes: z.array(
      z
        .object({
          routeId: z.string().min(1),
          routeSlug: z.string().min(1),
          readiness: z.enum([
            "series_ready",
            "series_ready_with_gaps",
            "needs_pattern_review",
            "failed",
          ]),
          artifactPath: z.string().min(1),
          artifactWritten: z.boolean(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

type RouteSpeedSpineManifest = z.output<typeof RouteSpeedSpineManifestSchema>;

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

async function readExistingHistorySummary(
  path: string,
  routeSlug: string,
): Promise<RouteSpeedHistoryArtifact | null> {
  let existing: RouteSpeedHistoryArtifact | null;
  try {
    existing = await readJsonIfExists<RouteSpeedHistoryArtifact>(path);
  } catch {
    return null;
  }
  if (existing?.artifactKind !== "studio_route_speed_history") return null;
  if (existing.routeSlug !== routeSlug) return null;
  return existing;
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

    if (input.force !== true) {
      const existing = await readExistingHistorySummary(historyPath, route.routeSlug);
      if (existing !== null) {
        routes.push({
          routeId,
          routeSlug: route.routeSlug,
          readiness: route.readiness,
          status: "skipped_existing",
          reasons: ["valid_existing_artifact"],
          spinePath: repoDisplayPath(spinePath),
          artifactPath: repoDisplayPath(historyPath),
          monthCount: existing.summary.monthCount,
          segmentCount: existing.summary.segmentCount,
          cellCount: existing.summary.cellCount,
          availableCellCount: existing.summary.availableCellCount,
          missingCellCount: existing.summary.missingCellCount,
          unmappedRawKeyCount: existing.summary.unmappedRawKeyCount,
        });
        continue;
      }
    }

    try {
      const result = await runRouteSpeedHistory({
        local: input.local,
        routeId,
        artifactRoot,
        spine: spinePath,
        output: historyPath,
        completeScheduleMonths,
        generatedAt,
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
    options: dbOptions.extend({
      startMonth: z
        .string()
        .regex(ISO_MONTH_RE)
        .default(ROUTE_SPEED_SPINE_DEFAULT_START_MONTH)
        .describe("First source month used by the spine manifest, YYYY-MM"),
      endMonth: z
        .string()
        .regex(ISO_MONTH_RE)
        .optional()
        .describe("Last source month used by the spine manifest, YYYY-MM"),
      routes: z.string().optional().describe("Comma-separated route IDs to include"),
      readiness: z
        .string()
        .optional()
        .describe("Comma-separated spine readiness states to materialize"),
      limit: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum route count to process"),
      offset: z.coerce.number().int().nonnegative().default(0).describe("Selected route offset"),
      force: z.coerce
        .boolean()
        .default(false)
        .describe("Rebuild valid existing speed-history artifacts"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      spineManifest: z.string().optional().describe("Override speed-spines manifest path"),
      output: z.string().optional().describe("Override speed-histories manifest output path"),
    }),
  },
  output: z.object({
    manifestPath: z.string(),
    routeCount: z.number().int().nonnegative(),
    writtenRouteCount: z.number().int().nonnegative(),
    skippedExistingRouteCount: z.number().int().nonnegative(),
    blockedRouteCount: z.number().int().nonnegative(),
    failedRouteCount: z.number().int().nonnegative(),
    artifactReadyRouteCount: z.number().int().nonnegative(),
    totalCellCount: z.number().int().nonnegative(),
    availableCellCount: z.number().int().nonnegative(),
    missingCellCount: z.number().int().nonnegative(),
    unmappedRawKeyCount: z.number().int().nonnegative(),
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
