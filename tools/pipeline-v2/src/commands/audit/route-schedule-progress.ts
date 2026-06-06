import { Database as BunDatabase } from "bun:sqlite";
import { auditRouteScheduleProgress } from "@bp/applied-research/local-db";
import { defineCommand, z } from "@liche/core";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

export type { RouteScheduleProgressResult } from "@bp/applied-research/local-db";
export { auditRouteScheduleProgress } from "@bp/applied-research/local-db";

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
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    sqlite.exec("PRAGMA busy_timeout = 30000");
    try {
      return auditRouteScheduleProgress(sqlite);
    } finally {
      sqlite.close();
    }
  },
});
