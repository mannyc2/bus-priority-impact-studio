import { Effect } from "effect";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { stopDirectionHourEwtFeatureArtifactPath } from "@bp/analytics/artifacts";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
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
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Calendar month, 1-12" }),
        routeId: Schema.String.check(Schema.isMinLength(1)).annotate({
          description: "Route ID to materialize",
        }),
        runId: Schema.String.check(Schema.isMinLength(1))
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("bus-observatory-2026-03")))
          .annotate({ description: "Observed headway run" }),
        scheduleSource: Schema.Literals([
          "auto",
          "gtfs_static",
          "socrata_route_schedule",
          "route_schedule_timepoint",
        ])
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("auto")))
          .annotate({ description: "Scheduled-arrival source to use for baselines" }),
        gtfsRunId: Schema.optionalKey(Schema.String).annotate({
          description: "GTFS static run ID to use when scheduleSource resolves to gtfs_static",
        }),
        timezone: Schema.String.pipe(
          Schema.withDecodingDefaultTypeKey(Effect.succeed("America/New_York")),
        ).annotate({ description: "Timezone for observed stop-hour grouping" }),
        observedAggregation: Schema.Literals(["service_date_hour", "month_day_type_hour"])
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("month_day_type_hour")))
          .annotate({ description: "Observed grouping grain for feature rows" }),
        minHeadways: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(10)))
          .annotate({ description: "Minimum observed headways per stop-hour cell" }),
        minCoverageShare: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))
          .check(Schema.isLessThanOrEqualTo(1))
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(0.5)))
          .annotate({
            description: "Observed/scheduled coverage share below which a cell is low coverage",
          }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        output: Schema.optionalKey(Schema.String).annotate({ description: "Override output path" }),
      },
    }),
  },
  output: Schema.Struct({
    month: Schema.String,
    routeId: Schema.String,
    runId: Schema.String,
    scheduleSource: Schema.Literals([
      "gtfs_static",
      "socrata_route_schedule",
      "route_schedule_timepoint",
    ]),
    gtfsRunId: Schema.NullOr(Schema.String),
    observedAggregation: Schema.Literals(["service_date_hour", "month_day_type_hour"]),
    outputPath: Schema.String,
    scheduleTimepointCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    observedHeadwaySampleCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    scheduleBaselineCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    featureCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    readyFeatureCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    baselineUnavailableCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    insufficientHeadwayCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    lowCoverageCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
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
