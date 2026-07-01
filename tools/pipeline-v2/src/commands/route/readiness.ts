import {
  buildReadinessRows,
  missingRouteReadinessInputs,
  type RouteReadinessResult,
  routeReadinessStatus,
  runRouteReadiness,
  scoreReadiness,
} from "@bp/pipeline-v2/local-db-aggregates";
import { arg, defineCommand, z } from "@liche/core";
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
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
    }),
  },
  output: z.object({
    isoMonth: z.string(),
    routeCount: z.number(),
    buildEligibleRouteCount: z.number(),
    dbPath: z.string(),
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
