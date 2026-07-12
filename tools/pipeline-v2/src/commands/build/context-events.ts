import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { runBuildContextEvents } from "@bp/pipeline-v2/local-db-aggregates";
import {
  makeBuildLocalDbCommandLayer,
  runBuildContextEventsCommand,
} from "../../effect/build-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

export type { BuildContextEventsResult } from "@bp/pipeline-v2/local-db-aggregates";
export { runBuildContextEvents };

export default defineCommand({
  path: ["build", "context-events"],
  summary: "Upsert per-source rows into local_context_event.",
  input: { options: dbOptions },
  output: Schema.Struct({
    inserted311: Schema.Number,
    insertedCollisions: Schema.Number,
    insertedParking: Schema.Number,
    insertedPermits: Schema.Number,
    insertedTrafficVolumes: Schema.Number,
    insertedTrafficSpeeds: Schema.Number,
    insertedAceViolations: Schema.Number,
    total: Schema.Number,
  }),
  async run({ input }) {
    return runPipelineEffect(
      runBuildContextEventsCommand(),
      makeBuildLocalDbCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
