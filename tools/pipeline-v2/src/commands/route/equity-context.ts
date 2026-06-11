import {
  type AssignedCounty,
  assignRouteCounty,
  buildCountyAggregates,
  buildRouteEquityContextRows,
  type CountyAggregate,
  type RouteEquityContextResult,
  runRouteEquityContext,
} from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { dbOptions, localDbFromCtx, withLocalDb } from "../../lib/local-db.ts";

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
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      acsYear: arg.positiveInt().default(2024).describe("ACS vintage year"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    analysisPeriod: z.string(),
    acsYear: z.number(),
    routeCount: z.number(),
    assignedRouteCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runRouteEquityContext({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      acsYear: input.options.acsYear,
    });
  },
});
