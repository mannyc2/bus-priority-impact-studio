import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { auditRouteScheduleProgress } from "@bp/pipeline-v2/local-db-aggregates";
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
  output: Schema.Struct({
    routeCatalogCount: Schema.Number,
    socrataRouteSchedules: Schema.Array(
      Schema.Struct({
        sourceYear: Schema.Number,
        rowCount: Schema.Number,
        routeCount: Schema.Number,
        stopCount: Schema.Number,
        timepointRowCount: Schema.Number,
        stagedRouteShare: Schema.NullOr(Schema.Number),
        timepointRowShare: Schema.NullOr(Schema.Number),
        likelyTimepointGrain: Schema.Boolean,
      }),
    ),
    gtfsStaticRuns: Schema.Array(
      Schema.Struct({
        runId: Schema.String,
        bundleCount: Schema.Number,
        routeCount: Schema.Number,
        stopCount: Schema.Number,
        tripCount: Schema.Number,
        stopTimeCount: Schema.Number,
        serviceCount: Schema.Number,
        sourceIds: Schema.Array(Schema.String),
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
