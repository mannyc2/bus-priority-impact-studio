import {
  buildPlanRows,
  defaultRouteBuildPlanLimit,
  type RouteBuildPlanResult,
  routeBuildPriorityScore,
  runRouteBuildPlan,
} from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { dbOptions, localDbFromCtx, withLocalDb } from "../../lib/local-db.ts";

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
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      limit: arg
        .positiveInt()
        .default(defaultRouteBuildPlanLimit)
        .describe("Maximum routes selected per batch"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    isoMonth: z.string(),
    routeCount: z.number(),
    selectedRouteCount: z.number(),
    alreadyBuiltRouteCount: z.number(),
    blockedRouteCount: z.number(),
    backlogRouteCount: z.number(),
    dbPath: z.string(),
  }),
  async run({ ctx, input }) {
    return runRouteBuildPlan({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      limit: input.options.limit,
    });
  },
});
