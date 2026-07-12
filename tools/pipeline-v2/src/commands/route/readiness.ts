import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  buildReadinessRows,
  missingRouteReadinessInputs,
  type RouteReadinessResult,
  routeReadinessStatus,
  runRouteReadiness,
  scoreReadiness,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import {
  makeRouteLocalDbCommandLayer,
  runRouteReadinessCommand,
} from "../../effect/route-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

export {
  buildReadinessRows,
  missingRouteReadinessInputs,
  type RouteReadinessResult,
  routeReadinessStatus,
  runRouteReadiness,
  scoreReadiness,
};

export default defineCommand({
  path: ["route", "readiness"],
  summary: "Compute build readiness scores per route for a given month.",
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
    buildEligibleRouteCount: Schema.Number,
    dbPath: Schema.String,
  }),
  async run({ input }) {
    return runPipelineEffect(
      runRouteReadinessCommand({
        year: input.options.year,
        month: input.options.month,
      }),
      makeRouteLocalDbCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
