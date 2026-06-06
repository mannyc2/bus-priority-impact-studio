import { runBuildLionGeometryIndex } from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { dbOptions, localDbFromCtx, withLocalDb } from "../../lib/local-db.ts";

export type {
  BuildLionGeometryIndexInputs,
  BuildLionGeometryIndexResult,
} from "@bp/applied-research/local-db";
export { runBuildLionGeometryIndex };

export default defineCommand({
  path: ["build", "lion-geometry-index"],
  summary: "Materialize LION centerline geometries into a spatialite-indexed table.",
  input: {
    options: dbOptions.extend({
      limit: arg.positiveInt().optional().describe("Cap rows scanned per run"),
    }),
  },
  middleware: [withLocalDb({ spatial: true })],
  output: z.object({
    inserted: z.number(),
    skipped: z.number(),
    total: z.number(),
  }),
  async run({ ctx, input }) {
    return runBuildLionGeometryIndex({
      local: localDbFromCtx(ctx),
      limit: input.options.limit,
    });
  },
});
