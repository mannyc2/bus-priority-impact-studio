import { MtaWikiOperationalOccurrenceImportArtifactSchema } from "@bp/domain/documents/operational-occurrence";
import {
  StudyEventApprovalArtifactSchema,
  StudyEventApprovalArtifactV2Schema,
  StudyEventApprovalArtifactV3Schema,
  type StudyEventMergeArtifact,
  type StudyEventMergeArtifactV2,
  type StudyEventMergeArtifactV3,
} from "@bp/domain/studio/study";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadStudyEventRegistryRows } from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { MtaWikiOperationalAnchorImportArtifactSchema } from "../../lib/mta-wiki-operational-anchors.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  buildStudyEventMergeArtifact,
  buildStudyEventMergeArtifactV2,
  buildStudyEventMergeArtifactV3,
  pinnedOccurrenceStudyInput,
  pinnedOccurrenceStudyInputV4,
} from "../../lib/study-engine/study-events.ts";

const DEFAULT_OUTPUT_PATH = fromRepoRoot("data/artifacts/studio/v2/studies/study-events.json");

export type RunStudyEventMergeInput = {
  readonly local: OpenLocalPipelineDb;
  readonly wikiImportPath?: string | undefined;
  readonly withoutWikiAnchors: boolean;
  readonly approvalPath?: string | undefined;
  readonly outputPath?: string | undefined;
};

export async function runStudyEventMerge(input: RunStudyEventMergeInput): Promise<
  (StudyEventMergeArtifact | StudyEventMergeArtifactV2 | StudyEventMergeArtifactV3) & {
    outputPath: string;
  }
> {
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
          Schema.Union([
            MtaWikiOperationalAnchorImportArtifactSchema,
            MtaWikiOperationalOccurrenceImportArtifactSchema,
          ]),
          "strict",
        );
  const registryEvents = loadStudyEventRegistryRows({ sqlite: input.local.sqlite });
  const artifact =
    wikiImport?.artifactKind === "bp.studio.mta_wiki_operational_occurrences.v4"
      ? buildStudyEventMergeArtifactV3({
          registryEvents,
          wiki: pinnedOccurrenceStudyInputV4(wikiImport),
          availableAnalysisRouteIds: loadAvailableAnalysisRouteIds(input.local),
          approval:
            input.approvalPath === undefined
              ? undefined
              : await readJsonArtifact(
                  input.approvalPath,
                  StudyEventApprovalArtifactV3Schema,
                  "strict",
                ),
        })
      : wikiImport?.artifactKind === "bp.studio.mta_wiki_operational_occurrences.v3"
        ? buildStudyEventMergeArtifactV2({
            registryEvents,
            wiki: pinnedOccurrenceStudyInput(wikiImport),
            withoutWikiAnchors: false,
            availableAnalysisRouteIds: loadAvailableAnalysisRouteIds(input.local),
            approval:
              input.approvalPath === undefined
                ? undefined
                : await readJsonArtifact(
                    input.approvalPath,
                    StudyEventApprovalArtifactV2Schema,
                    "strict",
                  ),
          })
        : buildStudyEventMergeArtifact({
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
            approval:
              input.approvalPath === undefined
                ? undefined
                : await readJsonArtifact(
                    input.approvalPath,
                    StudyEventApprovalArtifactSchema,
                    "strict",
                  ),
          });
  const outputPath = input.outputPath ?? DEFAULT_OUTPUT_PATH;
  await writeJson(outputPath, artifact);
  return { ...artifact, outputPath };
}

function loadAvailableAnalysisRouteIds(local: OpenLocalPipelineDb): Set<string> {
  const hasSpeedRows = local.sqlite
    .query("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get("local_route_segment_speed") as { ok?: number } | null;
  if (hasSpeedRows?.ok !== 1) {
    throw new Error(
      "Required local_route_segment_speed table is missing; occurrence route availability cannot be verified",
    );
  }
  const rows = local.sqlite
    .query("SELECT DISTINCT route_id FROM local_route_segment_speed ORDER BY route_id")
    .all() as Array<{ route_id: string }>;
  return new Set(rows.map((row) => row.route_id.trim().toUpperCase()));
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
    approvalState: Schema.Literals([
      "awaiting_approval",
      "approved",
      "blocked_contract_incompatible",
    ]),
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
