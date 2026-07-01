import { arg, defineCommand, z } from "@liche/core";
import {
  buildRouteBriefModel,
  buildRouteBriefSegmentUniverse,
  defaultRouteBriefModelHotspotLimit,
  defaultRouteBriefModelTopSegmentLimit,
  makeRouteBriefModelCommandLayer,
  type RouteBriefHourlyPassengerDelay,
  type RouteBriefInputRows,
  type RouteBriefModelResult,
  runRouteBriefModel,
  runRouteBriefModelCommand,
} from "../../effect/route-brief-model.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

export type { RouteBriefHourlyPassengerDelay, RouteBriefInputRows, RouteBriefModelResult };
export { buildRouteBriefModel, buildRouteBriefSegmentUniverse, runRouteBriefModel };

export default defineCommand({
  path: ["route", "brief-model"],
  summary:
    "Build route scorecards, brief summary rows, hotspot rows, comparison ranks, and route-slice artifacts.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      route: z.string().optional().describe("Single route ID convenience filter"),
      routes: z
        .array(z.string())
        .default([])
        .describe("Specific route IDs (default: all catalog routes)"),
      routesFile: z.string().optional().describe("JSON file containing route IDs"),
      topSegmentLimit: arg.positiveInt().default(defaultRouteBriefModelTopSegmentLimit),
      hotspotLimit: arg.positiveInt().default(defaultRouteBriefModelHotspotLimit),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
    }),
  },
  output: z.object({
    isoMonth: z.string(),
    routeCount: z.number(),
    routesWithObservedSpeedCount: z.number(),
    scorecardRowCount: z.number(),
    briefSummaryRowCount: z.number(),
    comparisonRankRowCount: z.number(),
    routeSliceArtifactCount: z.number(),
    issueCount: z.number(),
    dbPath: z.string(),
  }),
  async run({ input }) {
    return runPipelineEffect(
      runRouteBriefModelCommand({
        year: input.options.year,
        month: input.options.month,
        route: input.options.route,
        routes: input.options.routes,
        routesFile: input.options.routesFile,
        topSegmentLimit: input.options.topSegmentLimit,
        hotspotLimit: input.options.hotspotLimit,
        artifactRoot:
          input.options.artifactRoot === undefined
            ? undefined
            : fromCliPath(input.options.artifactRoot),
      }),
      makeRouteBriefModelCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
