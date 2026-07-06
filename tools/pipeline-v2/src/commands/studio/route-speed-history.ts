import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  routeSpeedHistoryArtifactPath,
  routeSpeedSpineArtifactPath,
} from "@bp/analytics/artifacts";
import {
  buildRouteExpectedServiceContext,
  buildRouteSpeedHistoryArtifact,
  ROUTE_SPEED_SPINE_DEFAULT_START_MONTH,
  type RouteSpeedSpineArtifact,
  routeSpeedHistoryMonthsFromSpine,
  routeSpeedSpineRouteSlug,
} from "@bp/analytics/feature-history";
import {
  loadCompleteRouteSpeedScheduleMonths,
  loadRouteSpeedHistoryLocalDbRows,
  loadRouteSpeedScheduleLocalDbRows,
} from "@bp/pipeline-v2/local-db-aggregates";
import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function normalizeRouteId(routeId: string): string {
  return routeId.trim().toUpperCase();
}

async function readSpineArtifact(path: string): Promise<RouteSpeedSpineArtifact> {
  const artifact = await readJsonArtifact(
    path,
    z.object({ artifactKind: z.literal("studio_route_speed_spine") }).passthrough(),
  );
  return artifact as RouteSpeedSpineArtifact;
}

export async function runRouteSpeedHistory(input: {
  local: OpenLocalPipelineDb;
  routeId: string;
  artifactRoot?: string | undefined;
  spine?: string | undefined;
  output?: string | undefined;
  completeScheduleMonths?: ReadonlySet<string> | undefined;
  generatedAt?: string | undefined;
}): Promise<{
  routeId: string;
  routeSlug: string;
  outputPath: string;
  monthCount: number;
  segmentCount: number;
  cellCount: number;
  availableCellCount: number;
  missingCellCount: number;
  unmappedRawKeyCount: number;
}> {
  const routeId = normalizeRouteId(input.routeId);
  const routeSlug = routeSpeedSpineRouteSlug(routeId);
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const spinePath =
    input.spine ??
    routeSpeedSpineArtifactPath({
      artifactRoot,
      routeSlug,
    });
  const outputPath =
    input.output ??
    routeSpeedHistoryArtifactPath({
      artifactRoot,
      routeSlug,
    });
  const spine = await readSpineArtifact(spinePath);
  const months = routeSpeedHistoryMonthsFromSpine(spine);
  const startMonth = months[0] ?? ROUTE_SPEED_SPINE_DEFAULT_START_MONTH;
  const endMonth = months[months.length - 1] ?? spine.source.endMonth ?? startMonth;
  const rows = loadRouteSpeedHistoryLocalDbRows({
    sqlite: input.local.sqlite,
    routeId,
    startMonth,
    endMonth,
  });
  const expectedService =
    input.completeScheduleMonths === undefined
      ? null
      : buildRouteExpectedServiceContext({
          spine,
          scheduleRows: loadRouteSpeedScheduleLocalDbRows({
            sqlite: input.local.sqlite,
            routeId,
            startMonth,
            endMonth,
          }),
          completeMonths: input.completeScheduleMonths,
        });
  const artifact = buildRouteSpeedHistoryArtifact({
    routeId,
    routeSlug,
    spine,
    rows,
    expectedService,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    dbPath: repoDisplayPath(input.local.path),
    speedSpinePath: repoDisplayPath(spinePath),
    artifactPath: repoDisplayPath(outputPath),
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);

  return {
    routeId,
    routeSlug,
    outputPath: repoDisplayPath(outputPath),
    monthCount: artifact.summary.monthCount,
    segmentCount: artifact.summary.segmentCount,
    cellCount: artifact.summary.cellCount,
    availableCellCount: artifact.summary.availableCellCount,
    missingCellCount: artifact.summary.missingCellCount,
    unmappedRawKeyCount: artifact.summary.unmappedRawKeyCount,
  };
}

export { loadCompleteRouteSpeedScheduleMonths as queryCompleteScheduleMonths };

export default defineCommand({
  path: ["studio", "route-speed-history"],
  summary:
    "Build a route's month-spanning segment/daypart speed-history artifact from its stable spine.",
  input: {
    options: dbOptions.extend({
      routeId: z.string().min(1).default("B41").describe("Route ID to materialize"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      spine: z.string().optional().describe("Override speed-spine artifact path"),
      output: z.string().optional().describe("Override speed-history artifact path"),
    }),
  },
  output: z.object({
    routeId: z.string(),
    routeSlug: z.string(),
    outputPath: z.string(),
    monthCount: z.number().int().nonnegative(),
    segmentCount: z.number().int().nonnegative(),
    cellCount: z.number().int().nonnegative(),
    availableCellCount: z.number().int().nonnegative(),
    missingCellCount: z.number().int().nonnegative(),
    unmappedRawKeyCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "studio.route-speed-history",
      operation: "runRouteSpeedHistory",
      spanAttributes: {
        routeId: input.options.routeId,
      },
      run: (local) =>
        runRouteSpeedHistory({
          local,
          routeId: input.options.routeId,
          artifactRoot:
            input.options.artifactRoot === undefined
              ? undefined
              : fromCliPath(input.options.artifactRoot),
          spine: input.options.spine === undefined ? undefined : fromCliPath(input.options.spine),
          output:
            input.options.output === undefined ? undefined : fromCliPath(input.options.output),
        }),
    });
  },
});
