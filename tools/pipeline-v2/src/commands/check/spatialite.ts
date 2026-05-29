import { defineCommand, z } from "@liche/core";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";

export type CheckSpatialiteResult = {
  ok: boolean;
  path: string | null;
  version: string | null;
};

export function runCheckSpatialite(inputs: {
  local: OpenLocalPipelineDb;
}): CheckSpatialiteResult {
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
  middleware: [withLocalDb({ spatial: true })],
  output: z.object({
    ok: z.boolean(),
    path: z.string().nullable(),
    version: z.string().nullable(),
  }),
  async run({ ctx }) {
    return runCheckSpatialite({ local: localDbFromCtx(ctx) });
  },
});
