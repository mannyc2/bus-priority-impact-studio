import {
  buildSummary,
  defaultObservedReliabilityMinSampleThreshold,
  type ReliabilityStatus,
  type RouteObservedReliabilityResult,
  type RouteReliabilitySummary,
  runRouteObservedReliability,
} from "@bp/pipeline-v2/local-db-aggregates";
import { arg, defineCommand, z } from "@liche/core";
import {
  makeRouteLocalDbCommandLayer,
  runRouteObservedReliabilityCommand,
} from "../../effect/route-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

export {
  buildSummary,
  defaultObservedReliabilityMinSampleThreshold,
  type ReliabilityStatus,
  type RouteObservedReliabilityResult,
  type RouteReliabilitySummary,
  runRouteObservedReliability,
};

export default defineCommand({
  path: ["route", "observed-reliability"],
  summary: "Build route/month observed reliability, bunching, and wait metrics.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      runId: z.string().min(1).describe("GTFS-RT collection run id"),
      minSamples: arg
        .positiveInt()
        .default(defaultObservedReliabilityMinSampleThreshold)
        .describe("Minimum headway samples to mark a route observed"),
    }),
  },
  output: z.object({
    isoMonth: z.string(),
    runId: z.string(),
    routeCount: z.number(),
    observedRouteCount: z.number(),
    insufficientRouteCount: z.number(),
    headwaySampleCount: z.number(),
  }),
  async run({ input }) {
    return runPipelineEffect(
      runRouteObservedReliabilityCommand({
        year: input.options.year,
        month: input.options.month,
        runId: input.options.runId,
        minSamples: input.options.minSamples,
      }),
      makeRouteLocalDbCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
