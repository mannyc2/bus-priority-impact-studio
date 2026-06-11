import {
  type BuildObservedHeadwaysResult,
  deriveObservedHeadwayRows,
  type ObservedHeadwaySample,
  type ObservedStopEvent,
  runBuildObservedHeadways,
} from "@bp/applied-research/local-db";
import { defineCommand, z } from "@liche/core";
import { dbOptions, localDbFromCtx, withLocalDb } from "../../lib/local-db.ts";

export {
  type BuildObservedHeadwaysResult,
  deriveObservedHeadwayRows,
  type ObservedHeadwaySample,
  type ObservedStopEvent,
  runBuildObservedHeadways,
};

export default defineCommand({
  path: ["build", "observed-headways"],
  summary: "Derive per-stop observed headway samples from GTFS-RT vehicle positions.",
  input: {
    options: dbOptions.extend({
      runId: z.string().min(1).describe("GTFS-RT collection run id"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    runId: z.string(),
    vehiclePositionCount: z.number(),
    stopEventCount: z.number(),
    headwaySampleCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runBuildObservedHeadways({
      local: localDbFromCtx(ctx),
      runId: input.options.runId,
    });
  },
});
