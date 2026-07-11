import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  buildPlanRows,
  defaultRouteBuildPlanLimit,
  type RouteBuildPlanResult,
  routeBuildPriorityScore,
  runRouteBuildPlan,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import {
  makeRouteBuildPlanCommandLayer,
  runRouteBuildPlanCommand,
} from "../../effect/route-build-plan.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

export {
  buildPlanRows,
  defaultRouteBuildPlanLimit,
  type RouteBuildPlanResult,
  routeBuildPriorityScore,
  runRouteBuildPlan,
};

export default defineCommand({
  path: ["route", "build-plan"],
  summary: "Rank eligible routes for the next build batch.",
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
        limit: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultRouteBuildPlanLimit)))
          .annotate({ description: "Maximum routes selected per batch" }),
      },
    }),
  },
  output: Schema.Struct({
    isoMonth: Schema.String,
    routeCount: Schema.Number,
    selectedRouteCount: Schema.Number,
    alreadyBuiltRouteCount: Schema.Number,
    blockedRouteCount: Schema.Number,
    backlogRouteCount: Schema.Number,
    dbPath: Schema.String,
  }),
  async run({ input }) {
    return runPipelineEffect(
      runRouteBuildPlanCommand({
        year: input.options.year,
        month: input.options.month,
        limit: input.options.limit,
      }),
      makeRouteBuildPlanCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
