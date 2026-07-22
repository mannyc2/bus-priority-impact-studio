import {
  MtaWikiOperationalOccurrenceImportArtifactSchema,
  MtaWikiOperationalOccurrenceMemberExtentImportArtifactV1Schema,
} from "@bp/domain/documents/operational-occurrence";
import {
  StudyEventApprovalArtifactSchema,
  StudyEventApprovalArtifactV2Schema,
  StudyEventApprovalArtifactV3Schema,
  StudyEventApprovalArtifactV4Schema,
  StudyEventApprovalArtifactV5Schema,
  type StudyEventCandidateSetArtifactV4,
  type StudyEventMergeArtifact,
  type StudyEventMergeArtifactV2,
  type StudyEventMergeArtifactV3,
  type StudyEventMergeArtifactV4,
  type StudyEventMergeArtifactV5,
  StudyReviewInputsArtifactV1Schema,
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
  buildStudyEventCandidateSetArtifactV4,
  buildStudyEventMergeArtifact,
  buildStudyEventMergeArtifactV2,
  buildStudyEventMergeArtifactV3,
  buildStudyEventMergeArtifactV4,
  buildStudyEventMergeArtifactV5,
  pinnedOccurrenceMemberExtentStudyInput,
  pinnedOccurrenceStudyInput,
  pinnedOccurrenceStudyInputV4,
} from "../../lib/study-engine/study-events.ts";

const DEFAULT_OUTPUT_PATH = fromRepoRoot("data/artifacts/studio/v2/studies/study-events.json");

export type RunStudyEventMergeInput = {
  readonly local: OpenLocalPipelineDb;
  readonly wikiImportPath?: string | undefined;
  readonly memberExtentImportPath?: string | undefined;
  readonly withoutWikiAnchors: boolean;
  readonly approvalPath?: string | undefined;
  readonly reviewInputsPath?: string | undefined;
  readonly outputPath?: string | undefined;
};

export async function runStudyEventMerge(input: RunStudyEventMergeInput): Promise<
  (
    | StudyEventMergeArtifact
    | StudyEventMergeArtifactV2
    | StudyEventMergeArtifactV3
    | StudyEventMergeArtifactV4
    | StudyEventMergeArtifactV5
    | StudyEventCandidateSetArtifactV4
  ) & {
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
  if (input.memberExtentImportPath !== undefined && input.wikiImportPath === undefined) {
    throw new Error("--member-extent-import requires --wiki-import");
  }
  if (
    input.memberExtentImportPath !== undefined &&
    input.approvalPath !== undefined &&
    input.reviewInputsPath === undefined
  ) {
    throw new Error("Member-grain approvals require --review-inputs and a complete review cut");
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
  const memberExtentImport =
    input.memberExtentImportPath === undefined
      ? null
      : await readJsonArtifact(
          input.memberExtentImportPath,
          MtaWikiOperationalOccurrenceMemberExtentImportArtifactV1Schema,
          "strict",
        );
  if (
    input.reviewInputsPath !== undefined &&
    wikiImport?.artifactKind !== "bp.studio.mta_wiki_operational_occurrences.v4" &&
    wikiImport?.artifactKind !== "bp.studio.mta_wiki_operational_occurrences.v5"
  ) {
    throw new Error("--review-inputs requires a compatible v4/v5 pinned occurrence import");
  }
  if (
    memberExtentImport !== null &&
    wikiImport?.artifactKind !== "bp.studio.mta_wiki_operational_occurrences.v4" &&
    wikiImport?.artifactKind !== "bp.studio.mta_wiki_operational_occurrences.v5"
  ) {
    throw new Error("--member-extent-import requires a compatible v4/v5 occurrence import");
  }
  const artifact =
    memberExtentImport !== null &&
    (wikiImport?.artifactKind === "bp.studio.mta_wiki_operational_occurrences.v4" ||
      wikiImport?.artifactKind === "bp.studio.mta_wiki_operational_occurrences.v5")
      ? input.reviewInputsPath === undefined
        ? buildStudyEventCandidateSetArtifactV4({
            registryEvents,
            wiki: pinnedOccurrenceMemberExtentStudyInput({
              occurrences: wikiImport,
              memberExtents: memberExtentImport,
            }),
            availableAnalysisRouteIds: loadAvailableAnalysisRouteIds(input.local),
          })
        : buildStudyEventMergeArtifactV5({
            registryEvents,
            wiki: pinnedOccurrenceMemberExtentStudyInput({
              occurrences: wikiImport,
              memberExtents: memberExtentImport,
            }),
            availableAnalysisRouteIds: loadAvailableAnalysisRouteIds(input.local),
            reviewInputs: await readJsonArtifact(
              input.reviewInputsPath,
              StudyReviewInputsArtifactV1Schema,
              "strict",
            ),
            approval:
              input.approvalPath === undefined
                ? undefined
                : await readJsonArtifact(
                    input.approvalPath,
                    StudyEventApprovalArtifactV5Schema,
                    "strict",
                  ),
          })
      : wikiImport?.artifactKind === "bp.studio.mta_wiki_operational_occurrences.v4" ||
          wikiImport?.artifactKind === "bp.studio.mta_wiki_operational_occurrences.v5"
        ? input.reviewInputsPath === undefined
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
          : buildStudyEventMergeArtifactV4({
              registryEvents,
              wiki: pinnedOccurrenceStudyInputV4(wikiImport),
              availableAnalysisRouteIds: loadAvailableAnalysisRouteIds(input.local),
              reviewInputs: await readJsonArtifact(
                input.reviewInputsPath,
                StudyReviewInputsArtifactV1Schema,
                "strict",
              ),
              approval:
                input.approvalPath === undefined
                  ? undefined
                  : await readJsonArtifact(
                      input.approvalPath,
                      StudyEventApprovalArtifactV4Schema,
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

export function loadAvailableAnalysisRouteIds(local: OpenLocalPipelineDb): Set<string> {
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
  const routeIds = new Set<string>();
  for (const row of rows) {
    if (row.route_id.length === 0 || row.route_id !== row.route_id.trim()) {
      throw new Error(
        `local_route_segment_speed contains a noncanonical exact route identity: ${JSON.stringify(row.route_id)}`,
      );
    }
    routeIds.add(row.route_id);
  }
  return routeIds;
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
        memberExtentImport: Schema.optionalKey(Schema.String).annotate({
          description: "Pinned occurrence × route × treatment-member extent import artifact",
        }),
        withoutWikiAnchors: arg
          .boolean()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
          .annotate({
            description: "Explicitly record that the candidate build omits MTA Wiki anchors",
          }),
        approval: Schema.optionalKey(Schema.String).annotate({
          description:
            "Operator approval artifact bound to the complete candidate set or review cut",
        }),
        reviewInputs: Schema.optionalKey(Schema.String).annotate({
          description: "Versioned outcome, spine, scope, and engine inputs for a v4 review cut",
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
    reviewCutId: Schema.optionalKey(Schema.String),
    approvalState: Schema.Literals([
      "awaiting_approval",
      "awaiting_review_cut",
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
          memberExtentImportPath:
            options.memberExtentImport === undefined
              ? undefined
              : fromCliPath(options.memberExtentImport),
          withoutWikiAnchors: options.withoutWikiAnchors,
          approvalPath: options.approval === undefined ? undefined : fromCliPath(options.approval),
          reviewInputsPath:
            options.reviewInputs === undefined ? undefined : fromCliPath(options.reviewInputs),
          outputPath: options.output === undefined ? undefined : fromCliPath(options.output),
        });
        return {
          outputPath: artifact.outputPath,
          candidateSetId: artifact.candidateSetId,
          ...(artifact.artifactKind === "bp.studio.study_events.v4" ||
          artifact.artifactKind === "bp.studio.study_events.v5"
            ? { reviewCutId: artifact.reviewCutId }
            : {}),
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
