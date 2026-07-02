import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { routeSpeedSpineArtifactPath } from "@bp/analytics/artifacts";
import {
  buildRouteSpeedSpineArtifact,
  ROUTE_SPEED_SPINE_DEFAULT_START_MONTH,
  ROUTE_SPEED_SPINE_DEFAULT_TOLERANCE_METERS,
  routeSpeedSpineRouteSlug,
} from "@bp/analytics/feature-history";
import { loadRouteSpeedSpineLocalDbRows } from "@bp/pipeline-v2/local-db-aggregates";
import { defineCommand, z } from "@liche/core";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function normalizeRouteId(routeId: string): string {
  return routeId.trim().toUpperCase();
}

export async function runRouteSpeedSpine(input: {
  local: OpenLocalPipelineDb;
  routeId: string;
  startMonth: string;
  endMonth: string | null;
  artifactRoot?: string | undefined;
  output?: string | undefined;
  toleranceMeters?: number | undefined;
  generatedAt?: string | undefined;
}): Promise<{
  routeId: string;
  routeSlug: string;
  outputPath: string;
  monthCount: number;
  nodeCount: number;
  spineSegmentCount: number;
  rawSegmentKeyCount: number;
  monthsWithRawKeyDriftCount: number;
  monthsWithPartialSpineCoverageCount: number;
  validationStatus: "pass" | "warn" | "fail";
  issueCount: number;
}> {
  const routeId = normalizeRouteId(input.routeId);
  const routeSlug = routeSpeedSpineRouteSlug(routeId);
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const outputPath =
    input.output ??
    routeSpeedSpineArtifactPath({
      artifactRoot,
      routeSlug,
    });
  const rows = loadRouteSpeedSpineLocalDbRows({
    sqlite: input.local.sqlite,
    routeId,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
  });
  const artifact = buildRouteSpeedSpineArtifact({
    routeId,
    routeSlug,
    rows,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    dbPath: repoDisplayPath(input.local.path),
    artifactPath: repoDisplayPath(outputPath),
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    ...(input.toleranceMeters === undefined ? {} : { toleranceMeters: input.toleranceMeters }),
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);

  return {
    routeId,
    routeSlug,
    outputPath: repoDisplayPath(outputPath),
    monthCount: artifact.summary.monthCount,
    nodeCount: artifact.summary.nodeCount,
    spineSegmentCount: artifact.summary.spineSegmentCount,
    rawSegmentKeyCount: artifact.summary.rawSegmentKeyCount,
    monthsWithRawKeyDriftCount: artifact.summary.monthsWithRawKeyDriftCount,
    monthsWithPartialSpineCoverageCount: artifact.summary.monthsWithPartialSpineCoverageCount,
    validationStatus: artifact.validation.status,
    issueCount: artifact.summary.issueCount,
  };
}

export default defineCommand({
  path: ["studio", "route-speed-spine"],
  summary: "Build a stable geographic segment spine for route speed-history artifacts.",
  input: {
    options: dbOptions.extend({
      routeId: z.string().min(1).default("B41").describe("Route ID to materialize"),
      startMonth: z
        .string()
        .regex(ISO_MONTH_RE)
        .default(ROUTE_SPEED_SPINE_DEFAULT_START_MONTH)
        .describe("First source month, YYYY-MM"),
      endMonth: z
        .string()
        .regex(ISO_MONTH_RE)
        .optional()
        .describe("Last source month, YYYY-MM; defaults to all available months"),
      toleranceMeters: z.coerce
        .number()
        .positive()
        .default(ROUTE_SPEED_SPINE_DEFAULT_TOLERANCE_METERS)
        .describe("Maximum distance for snapping source timepoints into one spine node"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path"),
    }),
  },
  output: z.object({
    routeId: z.string(),
    routeSlug: z.string(),
    outputPath: z.string(),
    monthCount: z.number().int().nonnegative(),
    nodeCount: z.number().int().nonnegative(),
    spineSegmentCount: z.number().int().nonnegative(),
    rawSegmentKeyCount: z.number().int().nonnegative(),
    monthsWithRawKeyDriftCount: z.number().int().nonnegative(),
    monthsWithPartialSpineCoverageCount: z.number().int().nonnegative(),
    validationStatus: z.enum(["pass", "warn", "fail"]),
    issueCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "studio.route-speed-spine",
      operation: "runRouteSpeedSpine",
      spanAttributes: {
        routeId: input.options.routeId,
        startMonth: input.options.startMonth,
        endMonth: input.options.endMonth ?? null,
      },
      run: (local) =>
        runRouteSpeedSpine({
          local,
          routeId: input.options.routeId,
          startMonth: input.options.startMonth,
          endMonth: input.options.endMonth ?? null,
          toleranceMeters: input.options.toleranceMeters,
          artifactRoot:
            input.options.artifactRoot === undefined
              ? undefined
              : fromCliPath(input.options.artifactRoot),
          output:
            input.options.output === undefined ? undefined : fromCliPath(input.options.output),
        }),
    });
  },
});
