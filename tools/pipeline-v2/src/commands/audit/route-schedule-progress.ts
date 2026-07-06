import { auditRouteScheduleProgress } from "@bp/pipeline-v2/local-db-aggregates";
import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

export type { RouteScheduleProgressResult } from "@bp/pipeline-v2/local-db-aggregates";
export { auditRouteScheduleProgress } from "@bp/pipeline-v2/local-db-aggregates";

export default defineCommand({
  path: ["audit", "route-schedule-progress"],
  summary: "Report progress for staged Socrata and GTFS static schedule corpora.",
  input: {
    options: dbOptions,
  },
  output: z.object({
    routeCatalogCount: z.number(),
    socrataRouteSchedules: z.array(
      z.object({
        sourceYear: z.number(),
        rowCount: z.number(),
        routeCount: z.number(),
        stopCount: z.number(),
        timepointRowCount: z.number(),
        stagedRouteShare: z.number().nullable(),
        timepointRowShare: z.number().nullable(),
        likelyTimepointGrain: z.boolean(),
      }),
    ),
    gtfsStaticRuns: z.array(
      z.object({
        runId: z.string(),
        bundleCount: z.number(),
        routeCount: z.number(),
        stopCount: z.number(),
        tripCount: z.number(),
        stopTimeCount: z.number(),
        serviceCount: z.number(),
        sourceIds: z.array(z.string()),
      }),
    ),
  }),
  async run({ input }) {
    const dbPath = input.options.db === undefined ? undefined : fromCliPath(input.options.db);

    return runLocalDbCommandBoundary({
      dbPath,
      localDbOptions: { readonly: true },
      command: "audit.route-schedule-progress",
      operation: "auditRouteScheduleProgress",
      run: async (local) => auditRouteScheduleProgress(local.sqlite),
    });
  },
});
