import {
  StudyEventApprovalArtifactSchema,
  type StudyEventMergeArtifact,
} from "@bp/domain/studio/study";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadStudyEventRegistryRows } from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { MtaWikiOperationalAnchorImportArtifactSchema } from "../../lib/mta-wiki-operational-anchors.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { buildStudyEventMergeArtifact } from "../../lib/study-engine/study-events.ts";

const DEFAULT_OUTPUT_PATH = fromRepoRoot("data/artifacts/studio/v2/studies/study-events.json");

export type RunStudyEventMergeInput = {
  readonly local: OpenLocalPipelineDb;
  readonly wikiImportPath?: string | undefined;
  readonly withoutWikiAnchors: boolean;
  readonly approvalPath?: string | undefined;
  readonly outputPath?: string | undefined;
};

export async function runStudyEventMerge(
  input: RunStudyEventMergeInput,
): Promise<StudyEventMergeArtifact & { outputPath: string }> {
  if (input.withoutWikiAnchors && input.wikiImportPath !== undefined) {
    throw new Error("Cannot provide --wiki-import together with --without-wiki-anchors");
  }
  if (!input.withoutWikiAnchors && input.wikiImportPath === undefined) {
    throw new Error(
      "--wiki-import is required unless --without-wiki-anchors is explicitly supplied",
    );
  }

  const wikiImport =
    input.wikiImportPath === undefined
      ? null
      : await readJsonArtifact(
          input.wikiImportPath,
          MtaWikiOperationalAnchorImportArtifactSchema,
          "strict",
        );
  const approval =
    input.approvalPath === undefined
      ? undefined
      : await readJsonArtifact(input.approvalPath, StudyEventApprovalArtifactSchema, "strict");
  const registryEvents = loadStudyEventRegistryRows({ sqlite: input.local.sqlite });
  const artifact = buildStudyEventMergeArtifact({
    registryEvents,
    wiki:
      wikiImport === null
        ? null
        : {
            releaseId: wikiImport.sourceRelease.releaseId,
            manifestSha256: wikiImport.sourceRelease.manifestSha256,
            artifactSha256: wikiImport.sourceRelease.anchors.sha256,
            assertions: wikiImport.assertions,
          },
    withoutWikiAnchors: input.withoutWikiAnchors,
    approval,
  });
  const outputPath = input.outputPath ?? DEFAULT_OUTPUT_PATH;
  await writeJson(outputPath, artifact);
  return { ...artifact, outputPath };
}

export default defineCommand({
  path: ["study", "merge-events"],
  summary:
    "Merge trusted registry events with pinned Wiki anchors and gate the complete candidate set on approval.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        wikiImport: Schema.optionalKey(Schema.String).annotate({
          description: "Pinned MTA Wiki operational-anchor import artifact",
        }),
        withoutWikiAnchors: arg
          .boolean()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
          .annotate({
            description: "Explicitly record that the candidate build omits MTA Wiki anchors",
          }),
        approval: Schema.optionalKey(Schema.String).annotate({
          description: "Operator approval artifact bound to the complete candidate-set id",
        }),
        output: Schema.optionalKey(Schema.String).annotate({
          description: "Study-event merge artifact output path",
        }),
      },
    }),
  },
  output: Schema.Struct({
    outputPath: Schema.String,
    candidateSetId: Schema.String,
    approvalState: Schema.Literals(["awaiting_approval", "approved"]),
    candidateCount: Schema.Number,
    approvedCount: Schema.Number,
    sourceRejectionCount: Schema.Number,
    conflictCount: Schema.Number,
  }),
  run({ input }) {
    const options = input.options;
    return runLocalDbCommandBoundary({
      dbPath: options.db,
      localDbOptions: { readonly: true },
      command: "study.merge-events",
      operation: "runStudyEventMerge",
      run: async (local) => {
        const artifact = await runStudyEventMerge({
          local,
          wikiImportPath:
            options.wikiImport === undefined ? undefined : fromCliPath(options.wikiImport),
          withoutWikiAnchors: options.withoutWikiAnchors,
          approvalPath: options.approval === undefined ? undefined : fromCliPath(options.approval),
          outputPath: options.output === undefined ? undefined : fromCliPath(options.output),
        });
        return {
          outputPath: artifact.outputPath,
          candidateSetId: artifact.candidateSetId,
          approvalState: artifact.approvalState,
          candidateCount: artifact.summary.candidateCount,
          approvedCount: artifact.summary.approvedCount,
          sourceRejectionCount: artifact.summary.sourceRejectionCount,
          conflictCount: artifact.summary.conflictCount,
        };
      },
    });
  },
});
