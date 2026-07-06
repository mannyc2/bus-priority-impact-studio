import { runBuildContextEvents } from "@bp/pipeline-v2/local-db-aggregates";
import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
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
  output: z.object({
    inserted311: z.number(),
    insertedCollisions: z.number(),
    insertedParking: z.number(),
    insertedPermits: z.number(),
    insertedTrafficVolumes: z.number(),
    insertedTrafficSpeeds: z.number(),
    insertedAceViolations: z.number(),
    total: z.number(),
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
