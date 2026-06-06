import { runBuildContextEvents } from "@bp/applied-research/local-db";
import { defineCommand, z } from "@liche/core";
import { dbOptions, localDbFromCtx, withLocalDb } from "../../lib/local-db.ts";

export type { BuildContextEventsResult } from "@bp/applied-research/local-db";
export { runBuildContextEvents };

export default defineCommand({
  path: ["build", "context-events"],
  summary: "Upsert per-source rows into local_context_event.",
  input: { options: dbOptions },
  middleware: [withLocalDb()],
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
  async run({ ctx }) {
    return runBuildContextEvents({ local: localDbFromCtx(ctx) });
  },
});
