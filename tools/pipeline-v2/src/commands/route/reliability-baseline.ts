import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import {
  buildHeadwayGroups,
  type HeadwayGroup,
  type RouteReliabilityBaselineResult,
  type RouteReliabilityBaselineRow,
  routeBaseline,
  runRouteReliabilityBaseline,
} from "@bp/pipeline-v2/local-db-aggregates";
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
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
    }),
  },
  output: z.object({
    isoMonth: z.string(),
    routeCount: z.number(),
    headwaySampleCount: z.number(),
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
