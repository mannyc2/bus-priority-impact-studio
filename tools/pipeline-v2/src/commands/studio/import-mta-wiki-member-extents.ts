import {
  MtaWikiOperationalOccurrenceImportArtifactV4Schema,
  MtaWikiOperationalOccurrenceImportArtifactV5Schema,
} from "@bp/domain/documents/operational-occurrence";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { readJsonArtifact } from "../../lib/json.ts";
import { runMtaWikiMemberExtentImport } from "../../lib/mta-wiki-member-extents.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

const defaultOutputPath = fromRepoRoot(
  "data/artifacts/studio/v2/wiki/operational-occurrence-member-extents-v1.json",
);

const optionsSchema = Schema.Struct({
  occurrenceImport: Schema.String.annotate({
    description: "Exact pinned v4/v5 operational-occurrence import artifact.",
  }),
  mtaWikiRoot: Schema.String.annotate({
    description: "Path to the MTA Wiki repository root.",
  }),
  memberExtentManifest: Schema.String.annotate({
    description: "Explicit repo-relative operational-occurrence-member-extent manifest path.",
  }),
  memberExtentManifestSha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)).annotate({
    description: "Expected SHA-256 of the exact member-extent manifest bytes.",
  }),
  output: Schema.optionalKey(Schema.String).annotate({
    description: "Deterministic normalized member-extent import artifact path.",
  }),
});

export default defineCommand({
  path: ["studio", "import-mta-wiki-member-extents"],
  summary:
    "Import a manifest-pinned MTA Wiki occurrence × route × treatment-member extent companion.",
  input: { options: optionsSchema },
  output: Schema.Struct({
    outputPath: Schema.String,
    releaseId: Schema.String,
    occurrenceCount: arg.int(),
    memberExtentRowCount: arg.int(),
    eligibleMemberExtentRowCount: arg.int(),
    manifestSha256: Schema.String,
    projectionSha256: Schema.String,
  }),
  async run({ input }) {
    const occurrenceImport = await readJsonArtifact(
      fromCliPath(input.options.occurrenceImport),
      Schema.Union([
        MtaWikiOperationalOccurrenceImportArtifactV4Schema,
        MtaWikiOperationalOccurrenceImportArtifactV5Schema,
      ]),
      "strict",
    );
    const outputPath = fromCliPath(input.options.output ?? defaultOutputPath);
    const artifact = await runMtaWikiMemberExtentImport({
      occurrenceImport,
      mtaWikiRoot: fromCliPath(input.options.mtaWikiRoot),
      memberExtentManifestPath: input.options.memberExtentManifest,
      memberExtentManifestSha256: input.options.memberExtentManifestSha256,
      output: outputPath,
    });
    return {
      outputPath,
      releaseId: artifact.sourceRelease.releaseId,
      occurrenceCount: artifact.summary.occurrenceCount,
      memberExtentRowCount: artifact.summary.memberExtentRowCount,
      eligibleMemberExtentRowCount: artifact.summary.eligibleMemberExtentRowCount,
      manifestSha256: artifact.sourceRelease.memberExtent.manifest.sha256,
      projectionSha256: artifact.sourceRelease.memberExtent.projection.sha256,
    };
  },
});
