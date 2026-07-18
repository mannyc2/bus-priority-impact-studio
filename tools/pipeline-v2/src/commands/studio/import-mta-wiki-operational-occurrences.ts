import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import {
  type MtaWikiOperationalOccurrenceImportArtifact,
  runMtaWikiOperationalOccurrenceImport,
} from "../../lib/mta-wiki-operational-occurrences.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

const defaultOutputPath = fromRepoRoot(
  "data/artifacts/studio/v2/wiki/operational-occurrences-v3.json",
);

const optionsSchema = Schema.Struct({
  mtaWikiRoot: Schema.String.annotate({
    description: "Path to the MTA Wiki repository root.",
  }),
  wikiRelease: Schema.String.annotate({
    description:
      "Explicit manifest-v3 or manifest-v4 MTA Wiki release id under data/exports/releases.",
  }),
  wikiManifestSha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)).annotate({
    description: "Expected SHA-256 of the exact pinned release manifest bytes.",
  }),
  output: Schema.String.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultOutputPath)),
  ).annotate({
    description: "Deterministic normalized operational-occurrence import artifact path.",
  }),
});

const commandOutputSchema = Schema.Struct({
  outputPath: Schema.String,
  releaseId: Schema.String,
  manifestSha256: Schema.String,
  sourceOccurrenceCount: arg.int(),
  eligibleOccurrenceCount: arg.int(),
  routeProjectionCount: arg.int(),
  rejectedOccurrenceCount: arg.int(),
});

function commandResult(
  outputPath: string,
  artifact: MtaWikiOperationalOccurrenceImportArtifact,
): typeof commandOutputSchema.Type {
  return {
    outputPath,
    releaseId: artifact.sourceRelease.releaseId,
    manifestSha256: artifact.sourceRelease.manifestSha256,
    sourceOccurrenceCount: artifact.summary.sourceOccurrenceCount,
    eligibleOccurrenceCount: artifact.summary.eligibleOccurrenceCount,
    routeProjectionCount: artifact.summary.routeProjectionCount,
    rejectedOccurrenceCount: artifact.summary.rejectedOccurrenceCount,
  };
}

export default defineCommand({
  path: ["studio", "import-mta-wiki-operational-occurrences"],
  summary: "Import a manifest-pinned MTA Wiki operational-occurrence release.",
  input: { options: optionsSchema },
  output: commandOutputSchema,
  async run({ input }) {
    const outputPath = fromCliPath(input.options.output);
    const artifact = await runMtaWikiOperationalOccurrenceImport({
      mtaWikiRoot: fromCliPath(input.options.mtaWikiRoot),
      wikiRelease: input.options.wikiRelease,
      wikiManifestSha256: input.options.wikiManifestSha256,
      output: outputPath,
    });
    return commandResult(outputPath, artifact);
  },
});
