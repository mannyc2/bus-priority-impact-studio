import {
  type AssignedCounty,
  assignRouteCounty,
  buildCountyAggregates,
  buildRouteEquityContextRows,
  type CountyAggregate,
  type RouteEquityContextResult,
  runRouteEquityContext,
} from "@bp/pipeline-v2/local-db-aggregates";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
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
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      acsYear: arg.positiveInt().default(2024).describe("ACS vintage year"),
    }),
  },
  output: z.object({
    analysisPeriod: z.string(),
    acsYear: z.number(),
    routeCount: z.number(),
    assignedRouteCount: z.number(),
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
