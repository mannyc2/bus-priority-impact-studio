import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  buildSummary,
  defaultObservedReliabilityMinSampleThreshold,
  type ReliabilityStatus,
  type RouteObservedReliabilityResult,
  type RouteReliabilitySummary,
  runRouteObservedReliability,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import {
  makeRouteLocalDbCommandLayer,
  runRouteObservedReliabilityCommand,
} from "../../effect/route-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

export {
  buildSummary,
  defaultObservedReliabilityMinSampleThreshold,
  type ReliabilityStatus,
  type RouteObservedReliabilityResult,
  type RouteReliabilitySummary,
  runRouteObservedReliability,
};

export default defineCommand({
  path: ["route", "observed-reliability"],
  summary: "Build route/month observed reliability, bunching, and wait metrics.",
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
        runId: Schema.String.check(Schema.isMinLength(1)).annotate({
          description: "GTFS-RT collection run id",
        }),
        minSamples: arg
          .positiveInt()
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(defaultObservedReliabilityMinSampleThreshold),
            ),
          )
          .annotate({ description: "Minimum headway samples to mark a route observed" }),
      },
    }),
  },
  output: Schema.Struct({
    isoMonth: Schema.String,
    runId: Schema.String,
    routeCount: Schema.Number,
    observedRouteCount: Schema.Number,
    insufficientRouteCount: Schema.Number,
    headwaySampleCount: Schema.Number,
  }),
  async run({ input }) {
    return runPipelineEffect(
      runRouteObservedReliabilityCommand({
        year: input.options.year,
        month: input.options.month,
        runId: input.options.runId,
        minSamples: input.options.minSamples,
      }),
      makeRouteLocalDbCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
