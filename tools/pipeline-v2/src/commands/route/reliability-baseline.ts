import {
  buildHeadwayGroups,
  type HeadwayGroup,
  type RouteReliabilityBaselineResult,
  type RouteReliabilityBaselineRow,
  routeBaseline,
  runRouteReliabilityBaseline,
} from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { dbOptions, localDbFromCtx, withLocalDb } from "../../lib/local-db.ts";

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
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    isoMonth: z.string(),
    routeCount: z.number(),
    headwaySampleCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runRouteReliabilityBaseline({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
    });
  },
});
