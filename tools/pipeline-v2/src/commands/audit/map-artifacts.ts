import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { isoMonth } from "../../lib/dates.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";
import { verifyMapArtifactManifest } from "../map/artifacts.ts";

export default defineCommand({
  path: ["audit", "map-artifacts"],
  summary: "Verify the map artifact manifest for a release month.",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
    }),
  },
  output: z
    .object({
      status: z.enum(["pass", "fail"]),
      manifestPath: z.string(),
      artifactCount: z.number(),
      routeSegmentArtifactCount: z.number(),
      totalFeatureCount: z.number(),
      totalByteLength: z.number(),
      issueCount: z.number(),
    })
    .passthrough(),
  async run({ input }) {
    const month = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    return verifyMapArtifactManifest({ artifactRoot, month });
  },
});
