import {
  defaultRouteLionLinkBufferMeters,
  runBuildRouteLionLink,
} from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { dbOptions, localDbFromCtx, withLocalDb } from "../../lib/local-db.ts";

export type {
  BuildRouteLionLinkInputs,
  BuildRouteLionLinkResult,
} from "@bp/applied-research/local-db";
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
  middleware: [withLocalDb({ spatial: true })],
  output: z.object({
    routesProcessed: z.number(),
    totalLinks: z.number(),
    bufferMeters: z.number(),
  }),
  async run({ ctx, input }) {
    const routeIds = input.options.route
      ? input.options.route
          .split(",")
          .map((route) => route.trim())
          .filter((route) => route.length > 0)
      : undefined;
    return runBuildRouteLionLink({
      local: localDbFromCtx(ctx),
      bufferMeters: input.options.bufferM,
      routeIds,
    });
  },
});
