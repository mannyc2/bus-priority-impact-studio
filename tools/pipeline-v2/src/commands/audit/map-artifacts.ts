import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { isoMonth } from "../../lib/dates.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";
import { verifyMapArtifactManifest } from "../map/artifacts.ts";

export default defineCommand({
  path: ["audit", "map-artifacts"],
  summary: "Verify the map artifact manifest for a release month.",
  input: {
    options: Schema.Struct({
      year: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
        .annotate({ description: "Calendar year" }),
      month: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
        .annotate({ description: "Calendar month, 1-12" }),
      artifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Override artifact root directory",
      }),
      profile: Schema.Literals(["demo", "full"])
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("demo")))
        .annotate({ description: "Required manifest release profile" }),
    }),
  },
  output: Schema.Struct({
    status: Schema.Literals(["pass", "fail"]),
    manifestPath: Schema.String,
    artifactCount: Schema.Number,
    routeSegmentArtifactCount: Schema.Number,
    totalFeatureCount: Schema.Number,
    totalByteLength: Schema.Number,
    issueCount: Schema.Number,
  }),
  async run({ input }) {
    const month = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    return verifyMapArtifactManifest({
      artifactRoot,
      month,
      expectedProfile: input.options.profile,
    });
  },
});
