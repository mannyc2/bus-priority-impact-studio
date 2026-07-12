import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  type AssignedCounty,
  assignRouteCounty,
  buildCountyAggregates,
  buildRouteEquityContextRows,
  type CountyAggregate,
  type RouteEquityContextResult,
  runRouteEquityContext,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import {
  makeRouteLocalDbCommandLayer,
  runRouteEquityContextCommand,
} from "../../effect/route-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

export {
  type AssignedCounty,
  assignRouteCounty,
  buildCountyAggregates,
  buildRouteEquityContextRows,
  type CountyAggregate,
  type RouteEquityContextResult,
  runRouteEquityContext,
};

export default defineCommand({
  path: ["route", "equity-context"],
  summary: "Assign county-proxy ACS equity context to routes for a given month.",
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
        acsYear: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2024)))
          .annotate({ description: "ACS vintage year" }),
      },
    }),
  },
  output: Schema.Struct({
    analysisPeriod: Schema.String,
    acsYear: Schema.Number,
    routeCount: Schema.Number,
    assignedRouteCount: Schema.Number,
  }),
  async run({ input }) {
    return runPipelineEffect(
      runRouteEquityContextCommand({
        year: input.options.year,
        month: input.options.month,
        acsYear: input.options.acsYear,
      }),
      makeRouteLocalDbCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
