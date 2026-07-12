import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  type BuildObservedHeadwaysResult,
  deriveObservedHeadwayRows,
  type ObservedHeadwaySample,
  type ObservedStopEvent,
  runBuildObservedHeadways,
} from "@bp/pipeline-v2/local-db-aggregates";
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
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        runId: Schema.String.check(Schema.isMinLength(1)).annotate({
          description: "GTFS-RT collection run id",
        }),
      },
    }),
  },
  output: Schema.Struct({
    runId: Schema.String,
    vehiclePositionCount: Schema.Number,
    stopEventCount: Schema.Number,
    headwaySampleCount: Schema.Number,
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
