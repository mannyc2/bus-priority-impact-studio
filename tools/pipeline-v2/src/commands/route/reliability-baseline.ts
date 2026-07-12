import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  buildHeadwayGroups,
  type HeadwayGroup,
  type RouteReliabilityBaselineResult,
  type RouteReliabilityBaselineRow,
  routeBaseline,
  runRouteReliabilityBaseline,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import {
  makeRouteLocalDbCommandLayer,
  runRouteReliabilityBaselineCommand,
} from "../../effect/route-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

export {
  buildHeadwayGroups,
  type HeadwayGroup,
  type RouteReliabilityBaselineResult,
  type RouteReliabilityBaselineRow,
  routeBaseline,
  runRouteReliabilityBaseline,
};

export default defineCommand({
  path: ["route", "reliability-baseline"],
  summary: "Build scheduled-headway reliability baselines per route.",
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
      },
    }),
  },
  output: Schema.Struct({
    isoMonth: Schema.String,
    routeCount: Schema.Number,
    headwaySampleCount: Schema.Number,
  }),
  async run({ input }) {
    return runPipelineEffect(
      runRouteReliabilityBaselineCommand({
        year: input.options.year,
        month: input.options.month,
      }),
      makeRouteLocalDbCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
