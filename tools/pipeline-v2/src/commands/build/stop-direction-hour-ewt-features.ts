import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { stopDirectionHourEwtFeatureArtifactPath } from "@bp/analytics/artifacts";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { buildStopDirectionHourEwtFeatureArtifactFromDb } from "@bp/pipeline-v2/local-db-aggregates";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export { stopDirectionHourEwtFeatureArtifactPath } from "@bp/analytics/artifacts";
export { buildStopDirectionHourEwtFeatureArtifactFromDb } from "@bp/pipeline-v2/local-db-aggregates";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export default defineCommand({
  path: ["build", "stop-direction-hour-ewt-features"],
  summary: "Build raw schedule-derived stop-direction-hour EWT feature artifacts for a route.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      routeId: z.string().min(1).describe("Route ID to materialize"),
      runId: z.string().min(1).default("bus-observatory-2026-03").describe("Observed headway run"),
      scheduleSource: z
        .enum(["auto", "gtfs_static", "socrata_route_schedule", "route_schedule_timepoint"])
        .default("auto")
        .describe("Scheduled-arrival source to use for baselines"),
      gtfsRunId: z
        .string()
        .optional()
        .describe("GTFS static run ID to use when scheduleSource resolves to gtfs_static"),
      timezone: z
        .string()
        .default("America/New_York")
        .describe("Timezone for observed stop-hour grouping"),
      observedAggregation: z
        .enum(["service_date_hour", "month_day_type_hour"])
        .default("month_day_type_hour")
        .describe("Observed grouping grain for feature rows"),
      minHeadways: arg
        .positiveInt()
        .default(10)
        .describe("Minimum observed headways per stop-hour cell"),
      minCoverageShare: z
        .number()
        .min(0)
        .max(1)
        .default(0.5)
        .describe("Observed/scheduled coverage share below which a cell is low coverage"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path"),
    }),
  },
  output: z.object({
    month: z.string(),
    routeId: z.string(),
    runId: z.string(),
    scheduleSource: z.enum(["gtfs_static", "socrata_route_schedule", "route_schedule_timepoint"]),
    gtfsRunId: z.string().nullable(),
    observedAggregation: z.enum(["service_date_hour", "month_day_type_hour"]),
    outputPath: z.string(),
    scheduleTimepointCount: z.number().int().nonnegative(),
    observedHeadwaySampleCount: z.number().int().nonnegative(),
    scheduleBaselineCount: z.number().int().nonnegative(),
    featureCount: z.number().int().nonnegative(),
    readyFeatureCount: z.number().int().nonnegative(),
    baselineUnavailableCount: z.number().int().nonnegative(),
    insufficientHeadwayCount: z.number().int().nonnegative(),
    lowCoverageCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const month = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? stopDirectionHourEwtFeatureArtifactPath({
            artifactRoot,
            month,
            runId: input.options.runId,
            routeId: input.options.routeId,
          })
        : fromCliPath(input.options.output);
    const dbPath = input.options.db === undefined ? undefined : fromCliPath(input.options.db);
    return runLocalDbCommandBoundary({
      dbPath,
      localDbOptions: { readonly: true },
      command: "build.stop-direction-hour-ewt-features",
      operation: "buildStopDirectionHourEwtFeatureArtifactFromDb",
      spanAttributes: {
        month,
        routeId: input.options.routeId,
        runId: input.options.runId,
        scheduleSource: input.options.scheduleSource,
        observedAggregation: input.options.observedAggregation,
      },
      run: async (local) => {
        const artifact = buildStopDirectionHourEwtFeatureArtifactFromDb({
          sqlite: local.sqlite,
          month,
          routeId: input.options.routeId.toUpperCase(),
          runId: input.options.runId,
          scheduleSource: input.options.scheduleSource,
          gtfsRunId: input.options.gtfsRunId ?? null,
          timezone: input.options.timezone,
          observedAggregation: input.options.observedAggregation,
          generatedAt: new Date().toISOString(),
          dbPath: repoDisplayPath(local.path),
          artifactPath: repoDisplayPath(outputPath),
          minHeadways: input.options.minHeadways,
          minCoverageShare: input.options.minCoverageShare,
        });

        await mkdir(dirname(outputPath), { recursive: true });
        await writeJson(outputPath, artifact);

        return {
          month,
          routeId: artifact.routeId,
          runId: artifact.runId,
          scheduleSource: artifact.source.scheduleSource,
          gtfsRunId: artifact.source.gtfsRunId,
          observedAggregation: artifact.observedAggregation,
          outputPath: repoDisplayPath(outputPath),
          scheduleTimepointCount: artifact.summary.scheduleTimepointCount,
          observedHeadwaySampleCount: artifact.summary.observedHeadwaySampleCount,
          scheduleBaselineCount: artifact.summary.scheduleBaselineCount,
          featureCount: artifact.summary.featureCount,
          readyFeatureCount: artifact.summary.readyFeatureCount,
          baselineUnavailableCount: artifact.summary.baselineUnavailableCount,
          insufficientHeadwayCount: artifact.summary.insufficientHeadwayCount,
          lowCoverageCount: artifact.summary.lowCoverageCount,
        };
      },
    });
  },
});
