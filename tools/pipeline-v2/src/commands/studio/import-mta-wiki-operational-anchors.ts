import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import {
  type MtaWikiOperationalAnchorImportArtifact,
  runMtaWikiOperationalAnchorImport,
} from "../../lib/mta-wiki-operational-anchors.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

const defaultOutputPath = fromRepoRoot(
  "data/artifacts/studio/v2/wiki/document-operational-date-assertions-v2.json",
);

const optionsSchema = Schema.Struct({
  mtaWikiRoot: Schema.String.annotate({
    description: "Path to the MTA Wiki repository root.",
  }),
  wikiRelease: Schema.String.annotate({
    description: "Explicit MTA Wiki release id under data/exports/releases.",
  }),
  wikiManifestSha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)).annotate({
    description: "Expected SHA-256 of the exact pinned release manifest bytes.",
  }),
  output: Schema.String.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultOutputPath)),
  ).annotate({
    description: "Deterministic normalized operational-date assertion artifact path.",
  }),
});

const commandOutputSchema = Schema.Struct({
  outputPath: Schema.String,
  releaseId: Schema.String,
  manifestSha256: Schema.String,
  sourceRowCount: arg.int(),
  assertionCount: arg.int(),
  eligibleAssertionCount: arg.int(),
  rejectedAssertionCount: arg.int(),
  conflictCount: arg.int(),
});

function commandResult(
  outputPath: string,
  artifact: MtaWikiOperationalAnchorImportArtifact,
): typeof commandOutputSchema.Type {
  return {
    outputPath,
    releaseId: artifact.sourceRelease.releaseId,
    manifestSha256: artifact.sourceRelease.manifestSha256,
    sourceRowCount: artifact.summary.sourceRowCount,
    assertionCount: artifact.summary.assertionCount,
    eligibleAssertionCount: artifact.summary.eligibleAssertionCount,
    rejectedAssertionCount: artifact.summary.rejectedAssertionCount,
    conflictCount: artifact.summary.crossDateConflictGroupCount,
  };
}

export default defineCommand({
  path: ["studio", "import-mta-wiki-operational-anchors"],
  summary: "Import a manifest-pinned MTA Wiki operational-anchor release.",
  input: { options: optionsSchema },
  output: commandOutputSchema,
  async run({ input }) {
    const outputPath = fromCliPath(input.options.output);
    const artifact = await runMtaWikiOperationalAnchorImport({
      mtaWikiRoot: fromCliPath(input.options.mtaWikiRoot),
      wikiRelease: input.options.wikiRelease,
      wikiManifestSha256: input.options.wikiManifestSha256,
      output: outputPath,
    });
    return commandResult(outputPath, artifact);
  },
});
