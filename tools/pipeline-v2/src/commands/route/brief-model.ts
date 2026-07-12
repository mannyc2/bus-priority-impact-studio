import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import {
  buildRouteBriefModel,
  buildRouteBriefSegmentUniverse,
  defaultRouteBriefModelHotspotLimit,
  defaultRouteBriefModelTopSegmentLimit,
  makeRouteBriefModelCommandLayer,
  type RouteBriefHourlyPassengerDelay,
  type RouteBriefInputRows,
  type RouteBriefModelResult,
  runRouteBriefModel,
  runRouteBriefModelCommand,
} from "../../effect/route-brief-model.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

export type { RouteBriefHourlyPassengerDelay, RouteBriefInputRows, RouteBriefModelResult };
export { buildRouteBriefModel, buildRouteBriefSegmentUniverse, runRouteBriefModel };

export default defineCommand({
  path: ["route", "brief-model"],
  summary:
    "Build route scorecards, brief summary rows, hotspot rows, comparison ranks, and route-slice artifacts.",
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
        route: Schema.optionalKey(Schema.String).annotate({
          description: "Single route ID convenience filter",
        }),
        routes: Schema.Array(Schema.String)
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed([])))
          .annotate({ description: "Specific route IDs (default: all catalog routes)" }),
        routesFile: Schema.optionalKey(Schema.String).annotate({
          description: "JSON file containing route IDs",
        }),
        topSegmentLimit: arg
          .positiveInt()
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(defaultRouteBriefModelTopSegmentLimit),
            ),
          ),
        hotspotLimit: arg
          .positiveInt()
          .pipe(
            Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultRouteBriefModelHotspotLimit)),
          ),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
      },
    }),
  },
  output: Schema.Struct({
    isoMonth: Schema.String,
    routeCount: Schema.Number,
    routesWithObservedSpeedCount: Schema.Number,
    scorecardRowCount: Schema.Number,
    briefSummaryRowCount: Schema.Number,
    comparisonRankRowCount: Schema.Number,
    routeSliceArtifactCount: Schema.Number,
    issueCount: Schema.Number,
    dbPath: Schema.String,
  }),
  async run({ input }) {
    return runPipelineEffect(
      runRouteBriefModelCommand({
        year: input.options.year,
        month: input.options.month,
        route: input.options.route,
        routes: input.options.routes,
        routesFile: input.options.routesFile,
        topSegmentLimit: input.options.topSegmentLimit,
        hotspotLimit: input.options.hotspotLimit,
        artifactRoot:
          input.options.artifactRoot === undefined
            ? undefined
            : fromCliPath(input.options.artifactRoot),
      }),
      makeRouteBriefModelCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
