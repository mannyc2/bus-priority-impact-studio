import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";

export type CheckSpatialiteResult = {
  ok: boolean;
  path: string | null;
  version: string | null;
};

export function runCheckSpatialite(inputs: { local: OpenLocalPipelineDb }): CheckSpatialiteResult {
  return {
    ok: inputs.local.spatialite !== null,
    path: inputs.local.spatialite?.path ?? null,
    version: inputs.local.spatialite?.version ?? null,
  };
}

export default defineCommand({
  path: ["check", "spatialite"],
  summary: "Verify mod_spatialite loads against the local pipeline DB.",
  input: { options: dbOptions },
  output: z.object({
    ok: z.boolean(),
    path: z.string().nullable(),
    version: z.string().nullable(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { spatial: true },
      command: "check.spatialite",
      operation: "runCheckSpatialite",
      run: async (local) => runCheckSpatialite({ local }),
    });
  },
});
