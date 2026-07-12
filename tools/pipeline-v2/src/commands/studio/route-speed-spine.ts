import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { routeSpeedSpineArtifactPath } from "@bp/analytics/artifacts";
import {
  buildRouteSpeedSpineArtifact,
  ROUTE_SPEED_SPINE_DEFAULT_START_MONTH,
  ROUTE_SPEED_SPINE_DEFAULT_TOLERANCE_METERS,
  routeSpeedSpineRouteSlug,
} from "@bp/analytics/feature-history";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadRouteSpeedSpineLocalDbRows } from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
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
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        routeId: Schema.String.check(Schema.isMinLength(1))
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("B41")))
          .annotate({ description: "Route ID to materialize" }),
        startMonth: Schema.String.check(Schema.isPattern(ISO_MONTH_RE))
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(ROUTE_SPEED_SPINE_DEFAULT_START_MONTH),
            ),
          )
          .annotate({ description: "First source month, YYYY-MM" }),
        endMonth: Schema.optionalKey(Schema.String.check(Schema.isPattern(ISO_MONTH_RE))).annotate({
          description: "Last source month, YYYY-MM; defaults to all available months",
        }),
        toleranceMeters: arg
          .number()
          .check(Schema.isGreaterThan(0))
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(ROUTE_SPEED_SPINE_DEFAULT_TOLERANCE_METERS),
            ),
          )
          .annotate({
            description: "Maximum distance for snapping source timepoints into one spine node",
          }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        output: Schema.optionalKey(Schema.String).annotate({ description: "Override output path" }),
      },
    }),
  },
  output: Schema.Struct({
    routeId: Schema.String,
    routeSlug: Schema.String,
    outputPath: Schema.String,
    monthCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    nodeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    spineSegmentCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    rawSegmentKeyCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    monthsWithRawKeyDriftCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    monthsWithPartialSpineCoverageCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    validationStatus: Schema.Literals(["pass", "warn", "fail"]),
    issueCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
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
