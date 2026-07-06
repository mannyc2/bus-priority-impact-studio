import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import {
  defaultRouteLionLinkBufferMeters,
  runBuildRouteLionLink,
} from "@bp/pipeline-v2/local-db-aggregates";
import {
  makeBuildLocalDbCommandLayer,
  runBuildRouteLionLinkCommand,
} from "../../effect/build-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

export type {
  BuildRouteLionLinkInputs,
  BuildRouteLionLinkResult,
} from "@bp/pipeline-v2/local-db-aggregates";
export { defaultRouteLionLinkBufferMeters, runBuildRouteLionLink };

export default defineCommand({
  path: ["build", "route-lion-link"],
  summary: "Compute the route shape ⇄ LION corridor lookup via buffered intersection.",
  input: {
    options: dbOptions.extend({
      bufferM: arg
        .positiveInt()
        .default(defaultRouteLionLinkBufferMeters)
        .describe("Buffer width in meters"),
      route: z
        .string()
        .optional()
        .describe("Comma-separated route_id allowlist (defaults to all routes)"),
    }),
  },
  output: z.object({
    routesProcessed: z.number(),
    totalLinks: z.number(),
    bufferMeters: z.number(),
  }),
  async run({ input }) {
    const routeIds = input.options.route
      ? input.options.route
          .split(",")
          .map((route) => route.trim())
          .filter((route) => route.length > 0)
      : undefined;
    return runPipelineEffect(
      runBuildRouteLionLinkCommand({
        bufferMeters: input.options.bufferM,
        routeIds,
      }),
      makeBuildLocalDbCommandLayer({
        dbPath: input.options.db,
        localDbOptions: { spatial: true },
      }),
    );
  },
});
