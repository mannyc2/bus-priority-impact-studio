import {
  type BuildObservedHeadwaysResult,
  deriveObservedHeadwayRows,
  type ObservedHeadwaySample,
  type ObservedStopEvent,
  runBuildObservedHeadways,
} from "@bp/pipeline-v2/local-db-aggregates";
import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import {
  makeBuildLocalDbCommandLayer,
  runBuildObservedHeadwaysCommand,
} from "../../effect/build-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

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
  output: z.object({
    runId: z.string(),
    vehiclePositionCount: z.number(),
    stopEventCount: z.number(),
    headwaySampleCount: z.number(),
  }),
  async run({ input }) {
    return runPipelineEffect(
      runBuildObservedHeadwaysCommand({
        runId: input.options.runId,
      }),
      makeBuildLocalDbCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
