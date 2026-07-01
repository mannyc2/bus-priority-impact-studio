import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { routeSpeedHistoryManifestPath } from "@bp/analytics/artifacts";
import { ROUTE_SPEED_SPINE_DEFAULT_START_MONTH } from "@bp/analytics/feature-history";
import {
  materializeRouteSpeedHistoryCoverageIndex,
  type RouteSpeedHistoryCoverageIndexRoute,
} from "@bp/pipeline-v2/local-db-aggregates";
import { arg, defineCommand, z } from "@liche/core";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

const RouteSpeedHistoryManifestSchema = z
  .object({
    artifactKind: z.literal("studio_route_speed_history_manifest"),
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
          status: z.enum(["written", "skipped_existing", "blocked", "failed"]),
          artifactPath: z.string().min(1),
          monthCount: z.number().int().nonnegative().nullable(),
          segmentCount: z.number().int().nonnegative().nullable(),
          cellCount: z.number().int().nonnegative().nullable(),
          availableCellCount: z.number().int().nonnegative().nullable(),
          missingCellCount: z.number().int().nonnegative().nullable(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function absoluteArtifactPath(path: string): string {
  return isAbsolute(path) ? path : join(repoRoot, path);
}

export async function runRouteSpeedHistoryCoverageIndex(input: {
  local: OpenLocalPipelineDb;
  releaseMonth: string;
  startMonth: string;
  endMonth: string | null;
  artifactRoot?: string | undefined;
  manifestPath?: string | undefined;
  generatedAt?: string | undefined;
}): Promise<{
  releaseMonth: string;
  manifestPath: string;
  expectedRouteCount: number;
  availableRouteCount: number;
  missingRouteCount: number;
  tableRowCount: number;
}> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const manifestPath =
    input.manifestPath ??
    routeSpeedHistoryManifestPath({
      artifactRoot,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    });
  const manifest = RouteSpeedHistoryManifestSchema.parse(await Bun.file(manifestPath).json());
  const historyEndMonth = manifest.source.endMonth ?? input.endMonth ?? input.releaseMonth;
  const availableRoutes: RouteSpeedHistoryCoverageIndexRoute[] = manifest.routes.flatMap(
    (route) => {
      const artifactPath = absoluteArtifactPath(route.artifactPath);
      const artifactReady =
        (route.status === "written" || route.status === "skipped_existing") &&
        existsSync(artifactPath);
      if (!artifactReady) return [];
      return [
        {
          routeId: route.routeId,
          routeSlug: route.routeSlug,
          artifactPath: repoDisplayPath(artifactPath),
          artifactStatus: route.status,
          monthCount: route.monthCount,
          segmentCount: route.segmentCount,
          cellCount: route.cellCount,
          availableCellCount: route.availableCellCount,
          missingCellCount: route.missingCellCount,
        },
      ];
    },
  );
  const result = materializeRouteSpeedHistoryCoverageIndex({
    local: input.local,
    releaseMonth: input.releaseMonth,
    historyStartMonth: manifest.source.startMonth,
    historyEndMonth,
    expectedRouteCount: manifest.routes.length,
    routes: availableRoutes,
    generatedAt,
  });

  return {
    ...result,
    manifestPath: repoDisplayPath(manifestPath),
  };
}

export default defineCommand({
  path: ["export", "route-speed-history-coverage-index"],
  summary: "Materialize local route speed-history coverage rows from the Studio history manifest.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Release calendar year"),
      month: arg.positiveInt().default(3).describe("Release calendar month, 1-12"),
      startMonth: z
        .string()
        .regex(ISO_MONTH_RE)
        .default(ROUTE_SPEED_SPINE_DEFAULT_START_MONTH)
        .describe("First source month in the route speed-history manifest"),
      endMonth: z
        .string()
        .regex(ISO_MONTH_RE)
        .optional()
        .describe("Last source month in the route speed-history manifest"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      manifest: z.string().optional().describe("Override route speed-history manifest path"),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    manifestPath: z.string(),
    expectedRouteCount: z.number().int().nonnegative(),
    availableRouteCount: z.number().int().nonnegative(),
    missingRouteCount: z.number().int().nonnegative(),
    tableRowCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? undefined
        : fromCliPath(input.options.artifactRoot);
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "export.route-speed-history-coverage-index",
      operation: "runRouteSpeedHistoryCoverageIndex",
      spanAttributes: {
        releaseMonth,
        startMonth: input.options.startMonth,
        endMonth: input.options.endMonth ?? null,
      },
      run: (local) =>
        runRouteSpeedHistoryCoverageIndex({
          local,
          releaseMonth,
          startMonth: input.options.startMonth,
          endMonth: input.options.endMonth ?? null,
          artifactRoot,
          manifestPath:
            input.options.manifest === undefined ? undefined : fromCliPath(input.options.manifest),
        }),
    });
  },
});
