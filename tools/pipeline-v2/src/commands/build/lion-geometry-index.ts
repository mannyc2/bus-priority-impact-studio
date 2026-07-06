import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { runBuildLionGeometryIndex } from "@bp/pipeline-v2/local-db-aggregates";
import {
  makeBuildLocalDbCommandLayer,
  runBuildLionGeometryIndexCommand,
} from "../../effect/build-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

export type {
  BuildLionGeometryIndexInputs,
  BuildLionGeometryIndexResult,
} from "@bp/pipeline-v2/local-db-aggregates";
export { runBuildLionGeometryIndex };

export default defineCommand({
  path: ["build", "lion-geometry-index"],
  summary: "Materialize LION centerline geometries into a spatialite-indexed table.",
  input: {
    options: dbOptions.extend({
      limit: arg.positiveInt().optional().describe("Cap rows scanned per run"),
    }),
  },
  output: z.object({
    inserted: z.number(),
    skipped: z.number(),
    total: z.number(),
  }),
  async run({ input }) {
    return runPipelineEffect(
      runBuildLionGeometryIndexCommand({
        limit: input.options.limit,
      }),
      makeBuildLocalDbCommandLayer({
        dbPath: input.options.db,
        localDbOptions: { spatial: true },
      }),
    );
  },
});
