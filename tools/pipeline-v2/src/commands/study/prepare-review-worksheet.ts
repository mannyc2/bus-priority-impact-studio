import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import {
  type StudyEventCandidateV2,
  type StudyEventMergeArtifactV2,
  StudyEventMergeArtifactV2Schema,
} from "@bp/domain/studio/study";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Result } from "effect";
import { writeJson } from "../../lib/json.ts";
import { fromCliPath, repoRoot } from "../../lib/paths.ts";
import { decodeSchemaEitherStrict } from "../../lib/schema-decode.ts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CANDIDATE_SET_PATTERN = /^candidate-set-v2:[a-f0-9]{24}$/u;

type ReviewWorksheetDecision = StudyEventCandidateV2 & {
  readonly decision: "REVIEW_REQUIRED";
  readonly reviewer: "";
  readonly rationale: "";
};

export type StudyEventReviewWorksheet = {
  readonly _notice: string;
  readonly artifactKind: "worksheet-only:not-an-approval";
  readonly schemaVersion: 0;
  readonly candidateSetId: string;
  readonly generatedFrom: string;
  readonly generatedFromSha256: string;
  readonly sourceArtifact: {
    readonly artifactKind: "bp.studio.study_events.v2";
    readonly schemaVersion: 2;
    readonly approvalState: "awaiting_approval";
    readonly wikiInput: StudyEventMergeArtifactV2["wikiInput"];
    readonly summary: StudyEventMergeArtifactV2["summary"];
  };
  readonly focus: {
    readonly occurrenceId: string;
    readonly routeId: string;
    readonly candidateIds: readonly [string];
    readonly status: "REVIEW_REQUIRED";
    readonly treatmentFamily: StudyEventCandidateV2["treatmentFamily"];
    readonly treatmentScopeKind: StudyEventCandidateV2["treatmentScopeKind"];
    readonly componentTreatmentFamilies: readonly string[];
    readonly confounderGroupId: string | null;
    readonly gtfsRouteIds: readonly string[];
    readonly occurrenceReviewDecisionIds: readonly string[];
    readonly handoffChecks: {
      readonly candidatePresentExactlyOnce: true;
      readonly routeIdentityBound: true;
      readonly occurrenceReviewDecisionBound: true;
      readonly treatmentScopePreserved: true;
      readonly absentFromSourceRejections: true;
      readonly pinnedOccurrenceRelease: true;
      readonly noApprovalApplied: true;
    };
  };
  readonly summary: {
    readonly candidateCount: number;
    readonly reviewRequiredCount: number;
    readonly focusCandidateCount: 1;
  };
  readonly decisions: readonly ReviewWorksheetDecision[];
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function displayPath(path: string): string {
  const absolute = resolve(path);
  const fromRoot = relative(repoRoot, absolute);
  const portable = (value: string) => value.split(sep).join("/");
  return fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`)
    ? portable(fromRoot)
    : portable(absolute);
}

function nonBlank(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function assertPinnedWikiInput(artifact: StudyEventMergeArtifactV2): void {
  if (artifact.wikiInput.mode !== "pinned_occurrence_release") {
    throw new Error("Review worksheet requires a pinned operational-occurrence release");
  }
  if (!nonBlank(artifact.wikiInput.releaseId)) {
    throw new Error("Pinned occurrence release is missing releaseId");
  }
  if (
    !nonBlank(artifact.wikiInput.manifestSha256) ||
    !SHA256_PATTERN.test(artifact.wikiInput.manifestSha256)
  ) {
    throw new Error("Pinned occurrence release is missing a valid manifestSha256");
  }
  if (
    !nonBlank(artifact.wikiInput.artifactSha256) ||
    !SHA256_PATTERN.test(artifact.wikiInput.artifactSha256)
  ) {
    throw new Error("Pinned occurrence release is missing a valid artifactSha256");
  }
}

function assertAwaitingApproval(artifact: StudyEventMergeArtifactV2): void {
  if (
    artifact.approvalState !== "awaiting_approval" ||
    artifact.approval !== null ||
    artifact.approvedEvents.length !== 0 ||
    artifact.summary.approvedCount !== 0 ||
    artifact.summary.rejectedByOperatorCount !== 0
  ) {
    throw new Error(
      "Review worksheet input must be awaiting approval with no approval or operator decisions",
    );
  }
  if (artifact.summary.candidateCount !== artifact.candidates.length) {
    throw new Error("Study-event candidate summary does not match the candidate array");
  }
}

function assertFocusCandidate(
  artifact: StudyEventMergeArtifactV2,
  focusOccurrenceId: string,
  focusRouteId: string,
): StudyEventCandidateV2 {
  const matches = artifact.candidates.filter(
    (candidate) =>
      candidate.occurrenceId === focusOccurrenceId && candidate.routeId === focusRouteId,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected focus occurrence ${focusOccurrenceId} on ${focusRouteId} exactly once; received ${matches.length}`,
    );
  }
  const candidate = matches[0];
  if (candidate === undefined)
    throw new Error("Focus candidate disappeared after cardinality check");
  if (
    artifact.rejections.some(
      (rejection) =>
        rejection.sourceEventId === focusOccurrenceId ||
        rejection.sourceEventId === candidate.candidateId,
    )
  ) {
    throw new Error("Focus occurrence also appears in source rejections");
  }

  const wikiProvenance = candidate.provenance.filter(
    (item) => item.sourceKind === "mta_wiki" && item.occurrenceId === focusOccurrenceId,
  );
  if (wikiProvenance.length === 0) {
    throw new Error("Focus candidate lacks occurrence-bound MTA Wiki provenance");
  }
  const routeIdentity = wikiProvenance.some(
    (item) => nonBlank(item.gtfsRouteId) && item.analysisRouteId === focusRouteId,
  );
  if (!routeIdentity) {
    throw new Error("Focus candidate lacks a non-blank GTFS-to-analysis route identity");
  }
  for (const item of wikiProvenance) {
    if (
      item.sourceEventId !== focusOccurrenceId ||
      !nonBlank(item.occurrenceReviewDecisionId) ||
      item.releaseId !== artifact.wikiInput.releaseId ||
      item.manifestSha256 !== artifact.wikiInput.manifestSha256 ||
      item.artifactSha256 !== artifact.wikiInput.artifactSha256 ||
      item.routeEvidenceBindings.length === 0 ||
      item.treatmentEvidenceBindings.length === 0
    ) {
      throw new Error("Focus provenance is incomplete or does not match the pinned release");
    }
  }
  return candidate;
}

function copyCandidate(candidate: StudyEventCandidateV2): ReviewWorksheetDecision {
  return {
    candidateId: candidate.candidateId,
    routeId: candidate.routeId,
    treatmentFamily: candidate.treatmentFamily,
    implementationDate: candidate.implementationDate,
    implementationMonth: candidate.implementationMonth,
    datePrecision: candidate.datePrecision,
    conflictState: candidate.conflictState,
    occurrenceId: candidate.occurrenceId,
    confounderGroupId: candidate.confounderGroupId,
    treatmentScopeKind: candidate.treatmentScopeKind,
    componentTreatmentFamilies: [...candidate.componentTreatmentFamilies],
    provenance: candidate.provenance.map((item) => ({
      sourceKind: item.sourceKind,
      sourceId: item.sourceId,
      sourceEventId: item.sourceEventId,
      releaseId: item.releaseId,
      anchorIds: [...item.anchorIds],
      occurrenceId: item.occurrenceId,
      occurrenceAliases: [...item.occurrenceAliases],
      manifestSha256: item.manifestSha256,
      artifactSha256: item.artifactSha256,
      occurrenceReviewDecisionId: item.occurrenceReviewDecisionId,
      gtfsRouteId: item.gtfsRouteId,
      analysisRouteId: item.analysisRouteId,
      routeEvidenceBindings: item.routeEvidenceBindings.map((binding) => ({ ...binding })),
      treatmentEvidenceBindings: item.treatmentEvidenceBindings.map((binding) => ({ ...binding })),
    })),
    decision: "REVIEW_REQUIRED",
    reviewer: "",
    rationale: "",
  };
}

export function buildStudyEventReviewWorksheet(input: {
  readonly artifact: StudyEventMergeArtifactV2;
  readonly generatedFrom: string;
  readonly generatedFromSha256: string;
  readonly focusOccurrenceId: string;
  readonly focusRouteId: string;
}): StudyEventReviewWorksheet {
  if (!CANDIDATE_SET_PATTERN.test(input.artifact.candidateSetId)) {
    throw new Error(`Invalid v2 candidateSetId: ${input.artifact.candidateSetId}`);
  }
  if (!SHA256_PATTERN.test(input.generatedFromSha256)) {
    throw new Error("generatedFromSha256 must be a lowercase SHA-256 digest");
  }
  if (input.focusOccurrenceId.trim().length === 0) {
    throw new Error("focusOccurrenceId must be non-blank");
  }
  if (input.focusRouteId.trim().length === 0) {
    throw new Error("focusRouteId must be non-blank");
  }
  assertPinnedWikiInput(input.artifact);
  assertAwaitingApproval(input.artifact);
  const focusCandidate = assertFocusCandidate(
    input.artifact,
    input.focusOccurrenceId,
    input.focusRouteId,
  );
  const candidateIds = input.artifact.candidates.map((candidate) => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error("Study-event candidate artifact contains duplicate candidate IDs");
  }
  const decisions = input.artifact.candidates
    .map(copyCandidate)
    .toSorted((left, right) => left.candidateId.localeCompare(right.candidateId));

  return {
    _notice:
      "INCOMPLETE REVIEW WORKSHEET — this is not an approval receipt and cannot authorize studies",
    artifactKind: "worksheet-only:not-an-approval",
    schemaVersion: 0,
    candidateSetId: input.artifact.candidateSetId,
    generatedFrom: input.generatedFrom,
    generatedFromSha256: input.generatedFromSha256,
    sourceArtifact: {
      artifactKind: input.artifact.artifactKind,
      schemaVersion: input.artifact.schemaVersion,
      approvalState: "awaiting_approval",
      wikiInput: { ...input.artifact.wikiInput },
      summary: { ...input.artifact.summary },
    },
    focus: {
      occurrenceId: input.focusOccurrenceId,
      routeId: input.focusRouteId,
      candidateIds: [focusCandidate.candidateId],
      status: "REVIEW_REQUIRED",
      treatmentFamily: focusCandidate.treatmentFamily,
      treatmentScopeKind: focusCandidate.treatmentScopeKind,
      componentTreatmentFamilies: [...focusCandidate.componentTreatmentFamilies],
      confounderGroupId: focusCandidate.confounderGroupId,
      gtfsRouteIds: [
        ...new Set(
          focusCandidate.provenance.flatMap((item) =>
            nonBlank(item.gtfsRouteId) ? [item.gtfsRouteId] : [],
          ),
        ),
      ].toSorted(),
      occurrenceReviewDecisionIds: [
        ...new Set(
          focusCandidate.provenance.flatMap((item) =>
            nonBlank(item.occurrenceReviewDecisionId) ? [item.occurrenceReviewDecisionId] : [],
          ),
        ),
      ].toSorted(),
      handoffChecks: {
        candidatePresentExactlyOnce: true,
        routeIdentityBound: true,
        occurrenceReviewDecisionBound: true,
        treatmentScopePreserved: true,
        absentFromSourceRejections: true,
        pinnedOccurrenceRelease: true,
        noApprovalApplied: true,
      },
    },
    summary: {
      candidateCount: decisions.length,
      reviewRequiredCount: decisions.length,
      focusCandidateCount: 1,
    },
    decisions,
  };
}

export async function runPrepareStudyEventReviewWorksheet(input: {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly focusOccurrenceId: string;
  readonly focusRouteId: string;
}): Promise<{ outputPath: string; candidateSetId: string; candidateCount: number }> {
  const inputPath = resolve(input.inputPath);
  const outputPath = resolve(input.outputPath);
  if (inputPath === outputPath)
    throw new Error("Review worksheet output cannot overwrite its input");
  if (
    outputPath.split(sep).includes("receipts") ||
    basename(outputPath).endsWith(".approval.json")
  ) {
    throw new Error("Review worksheet output cannot be written as an approval receipt");
  }

  const bytes = new Uint8Array(await readFile(inputPath));
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (cause) {
    throw new Error(`Failed to parse study-event artifact at ${inputPath}: ${String(cause)}`);
  }
  const decoded = decodeSchemaEitherStrict(StudyEventMergeArtifactV2Schema, raw);
  if (Result.isFailure(decoded)) {
    throw new Error(`Failed to strict-decode study-event v2 artifact: ${String(decoded.failure)}`);
  }
  const expectedFilename = `${decoded.success.candidateSetId.replace(":", "-")}.review-worksheet.json`;
  if (basename(outputPath) !== expectedFilename) {
    throw new Error(`Review worksheet filename must be ${expectedFilename}`);
  }
  const worksheet = buildStudyEventReviewWorksheet({
    artifact: decoded.success,
    generatedFrom: displayPath(inputPath),
    generatedFromSha256: sha256(bytes),
    focusOccurrenceId: input.focusOccurrenceId,
    focusRouteId: input.focusRouteId,
  });
  await writeJson(outputPath, worksheet);
  return {
    outputPath,
    candidateSetId: worksheet.candidateSetId,
    candidateCount: worksheet.summary.candidateCount,
  };
}

export default defineCommand({
  path: ["study", "prepare-review-worksheet"],
  summary: "Prepare a deterministic, non-approval v2 study-event review worksheet.",
  input: {
    options: Schema.Struct({
      input: Schema.String.annotate({
        description: "Awaiting-approval bp.studio.study_events.v2 artifact.",
      }),
      output: Schema.String.annotate({
        description: "New candidate-set review worksheet path outside receipts/.",
      }),
      focusOccurrenceId: Schema.String.annotate({
        description: "Operational occurrence id to highlight and verify.",
      }),
      focusRouteId: Schema.String.annotate({
        description: "Analysis route id for the focused occurrence projection.",
      }),
    }),
  },
  output: Schema.Struct({
    outputPath: Schema.String,
    candidateSetId: Schema.String,
    candidateCount: Schema.Number,
  }),
  run({ input }) {
    return runPrepareStudyEventReviewWorksheet({
      inputPath: fromCliPath(input.options.input),
      outputPath: fromCliPath(input.options.output),
      focusOccurrenceId: input.options.focusOccurrenceId,
      focusRouteId: input.options.focusRouteId,
    });
  },
});
