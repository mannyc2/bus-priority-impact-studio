import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import {
  type StudyEventCandidateV2,
  type StudyEventCandidateV3,
  type StudyEventCandidateV4,
  type StudyEventMergeArtifactV2,
  StudyEventMergeArtifactV2Schema,
  type StudyEventMergeArtifactV3,
  StudyEventMergeArtifactV3Schema,
  type StudyEventMergeArtifactV4,
  StudyEventMergeArtifactV4Schema,
  type StudyEventMergeArtifactV5,
  StudyEventMergeArtifactV5Schema,
} from "@bp/domain/studio/study";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Result } from "effect";
import { writeJson } from "../../lib/json.ts";
import { fromCliPath, repoRoot } from "../../lib/paths.ts";
import { decodeSchemaEitherStrict } from "../../lib/schema-decode.ts";
import {
  validateStudyEventMergeArtifactV4,
  validateStudyEventMergeArtifactV5,
} from "../../lib/study-engine/study-events.ts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CANDIDATE_SET_V2_PATTERN = /^candidate-set-v2:[a-f0-9]{24}$/u;
const CANDIDATE_SET_V3_PATTERN = /^candidate-set-v3:[a-f0-9]{24}$/u;
const CANDIDATE_SET_V4_PATTERN = /^candidate-set-v4:[a-f0-9]{24}$/u;

type SupportedStudyEventMergeArtifact =
  | StudyEventMergeArtifactV2
  | StudyEventMergeArtifactV3
  | StudyEventMergeArtifactV4
  | StudyEventMergeArtifactV5;
type SupportedStudyEventCandidate =
  | StudyEventCandidateV2
  | StudyEventCandidateV3
  | StudyEventCandidateV4;

type ReviewWorksheetDecision = SupportedStudyEventCandidate & {
  readonly decision: "REVIEW_REQUIRED";
  readonly reviewer: "";
  readonly rationale: "";
};

type ReviewWorksheetSourceArtifact =
  | {
      readonly artifactKind: "bp.studio.study_events.v2";
      readonly schemaVersion: 2;
      readonly approvalState: "awaiting_approval";
      readonly wikiInput: StudyEventMergeArtifactV2["wikiInput"];
      readonly summary: StudyEventMergeArtifactV2["summary"];
    }
  | {
      readonly artifactKind: "bp.studio.study_events.v3";
      readonly schemaVersion: 3;
      readonly approvalState: "awaiting_approval";
      readonly wikiInput: StudyEventMergeArtifactV3["wikiInput"];
      readonly summary: StudyEventMergeArtifactV3["summary"];
    }
  | {
      readonly artifactKind: "bp.studio.study_events.v4";
      readonly schemaVersion: 4;
      readonly approvalState: "awaiting_approval";
      readonly reviewCutId: string;
      readonly candidateUniverse: StudyEventMergeArtifactV4["candidateUniverse"];
      readonly reviewInputs: StudyEventMergeArtifactV4["reviewInputs"];
      readonly wikiInput: StudyEventMergeArtifactV4["wikiInput"];
      readonly summary: StudyEventMergeArtifactV4["summary"];
    }
  | {
      readonly artifactKind: "bp.studio.study_events.v5";
      readonly schemaVersion: 5;
      readonly approvalState: "awaiting_approval";
      readonly reviewCutId: string;
      readonly candidateUniverse: StudyEventMergeArtifactV5["candidateUniverse"];
      readonly reviewInputs: StudyEventMergeArtifactV5["reviewInputs"];
      readonly wikiInput: StudyEventMergeArtifactV5["wikiInput"];
      readonly summary: StudyEventMergeArtifactV5["summary"];
    };

export type StudyEventReviewWorksheet = {
  readonly _notice: string;
  readonly artifactKind: "worksheet-only:not-an-approval";
  readonly schemaVersion: 0;
  readonly reviewState: "awaiting_review";
  readonly approval: null;
  readonly candidateSetId: string;
  readonly reviewCutId?: string;
  readonly generatedFrom: string;
  readonly generatedFromSha256: string;
  readonly sourceArtifact: ReviewWorksheetSourceArtifact;
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
    readonly wikiRouteRecordIds: readonly string[];
    readonly pinnedLineage: {
      readonly releaseId: string;
      readonly manifestSha256: string;
      readonly occurrenceArtifactSha256: string;
      readonly relationshipBundleSha256: string | null;
      readonly relationshipEnforcementProofCanonicalSha256: string | null;
      readonly memberExtent: null | {
        readonly manifestSha256: string;
        readonly projectionSha256: string;
      };
    };
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
    readonly operatorDecisionCount: 0;
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
    : `<isolated-input>/${portable(basename(absolute))}`;
}

function nonBlank(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function assertPinnedWikiInput(artifact: SupportedStudyEventMergeArtifact): void {
  const expectedMode =
    artifact.artifactKind === "bp.studio.study_events.v3" ||
    artifact.artifactKind === "bp.studio.study_events.v4"
      ? "pinned_occurrence_release_v4"
      : artifact.artifactKind === "bp.studio.study_events.v5"
        ? "pinned_occurrence_release_with_member_extents_v1"
        : "pinned_occurrence_release";
  if (artifact.wikiInput.mode !== expectedMode) {
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
  if (
    artifact.artifactKind === "bp.studio.study_events.v3" ||
    artifact.artifactKind === "bp.studio.study_events.v4" ||
    artifact.artifactKind === "bp.studio.study_events.v5"
  ) {
    if (!SHA256_PATTERN.test(artifact.wikiInput.relationshipBundleSha256)) {
      throw new Error("Pinned occurrence release is missing a valid relationshipBundleSha256");
    }
    if (!SHA256_PATTERN.test(artifact.wikiInput.relationshipEnforcementProofCanonicalSha256)) {
      throw new Error(
        "Pinned occurrence release is missing a valid relationshipEnforcementProofCanonicalSha256",
      );
    }
    if (artifact.wikiInput.producerReviewCompatibility !== "compatible") {
      throw new Error(
        "Review worksheet cannot be prepared from a producer review-contract incompatibility",
      );
    }
  }
}

function assertAwaitingApproval(artifact: SupportedStudyEventMergeArtifact): void {
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
  artifact: SupportedStudyEventMergeArtifact,
  focusOccurrenceId: string,
  focusRouteId: string,
): SupportedStudyEventCandidate {
  const candidates: readonly SupportedStudyEventCandidate[] = artifact.candidates;
  const matches = candidates.filter(
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

  const wikiProvenance = candidate.provenance.filter((item) => item.sourceKind === "mta_wiki");
  if (wikiProvenance.length === 0) {
    throw new Error("Focus candidate lacks occurrence-bound MTA Wiki provenance");
  }
  for (const item of wikiProvenance) {
    if (
      item.sourceEventId !== focusOccurrenceId ||
      item.occurrenceId !== focusOccurrenceId ||
      !nonBlank(item.occurrenceReviewDecisionId) ||
      !nonBlank(item.gtfsRouteId) ||
      item.analysisRouteId !== focusRouteId ||
      item.analysisRouteId !== candidate.routeId ||
      item.releaseId !== artifact.wikiInput.releaseId ||
      item.manifestSha256 !== artifact.wikiInput.manifestSha256 ||
      item.artifactSha256 !== artifact.wikiInput.artifactSha256 ||
      item.routeEvidenceBindings.length === 0 ||
      item.treatmentEvidenceBindings.length === 0
    ) {
      throw new Error("Focus provenance is incomplete or does not match the pinned release");
    }
    if (
      artifact.artifactKind === "bp.studio.study_events.v3" ||
      artifact.artifactKind === "bp.studio.study_events.v4" ||
      artifact.artifactKind === "bp.studio.study_events.v5"
    ) {
      if (!("wikiRouteRecordId" in item)) {
        throw new Error("Focus v3 provenance is missing exact Wiki route identity lineage");
      }
      if (
        !nonBlank(item.wikiRouteRecordId) ||
        item.relationshipBundleSha256 !== artifact.wikiInput.relationshipBundleSha256 ||
        item.relationshipEnforcementProofCanonicalSha256 !==
          artifact.wikiInput.relationshipEnforcementProofCanonicalSha256 ||
        item.producerReviewCompatibility !== "compatible" ||
        !item.routeEvidenceBindings.some(
          (binding) =>
            binding.role === "route_identity" && binding.record_id === item.wikiRouteRecordId,
        )
      ) {
        throw new Error(
          "Focus v3 provenance is missing exact route, payload, or graph-integrity lineage",
        );
      }
    }
  }
  return candidate;
}

function copyCandidate(candidate: SupportedStudyEventCandidate): ReviewWorksheetDecision {
  return {
    ...structuredClone(candidate),
    decision: "REVIEW_REQUIRED",
    reviewer: "",
    rationale: "",
  };
}

export function buildStudyEventReviewWorksheet(input: {
  readonly artifact: SupportedStudyEventMergeArtifact;
  readonly generatedFrom: string;
  readonly generatedFromSha256: string;
  readonly focusOccurrenceId: string;
  readonly focusRouteId: string;
}): StudyEventReviewWorksheet {
  const candidateSetPattern =
    input.artifact.artifactKind === "bp.studio.study_events.v3" ||
    input.artifact.artifactKind === "bp.studio.study_events.v4" ||
    input.artifact.artifactKind === "bp.studio.study_events.v5"
      ? input.artifact.artifactKind === "bp.studio.study_events.v5"
        ? CANDIDATE_SET_V4_PATTERN
        : CANDIDATE_SET_V3_PATTERN
      : CANDIDATE_SET_V2_PATTERN;
  if (!candidateSetPattern.test(input.artifact.candidateSetId)) {
    throw new Error(
      `Invalid ${input.artifact.schemaVersion === 3 ? "v3" : "v2"} candidateSetId: ${input.artifact.candidateSetId}`,
    );
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
  const candidates: readonly SupportedStudyEventCandidate[] = input.artifact.candidates;
  const candidateIds = candidates.map((candidate) => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error("Study-event candidate artifact contains duplicate candidate IDs");
  }
  const decisions = candidates
    .map(copyCandidate)
    .toSorted((left, right) => left.candidateId.localeCompare(right.candidateId));
  const focusWikiProvenance = focusCandidate.provenance.filter(
    (item) => item.sourceKind === "mta_wiki" && item.occurrenceId === input.focusOccurrenceId,
  );
  const wikiRouteRecordIds = [
    ...new Set(
      focusWikiProvenance.flatMap((item) =>
        "wikiRouteRecordId" in item && nonBlank(item.wikiRouteRecordId)
          ? [item.wikiRouteRecordId]
          : [],
      ),
    ),
  ].toSorted();
  const releaseId = input.artifact.wikiInput.releaseId;
  const manifestSha256 = input.artifact.wikiInput.manifestSha256;
  const occurrenceArtifactSha256 = input.artifact.wikiInput.artifactSha256;
  if (!nonBlank(releaseId) || !nonBlank(manifestSha256) || !nonBlank(occurrenceArtifactSha256)) {
    throw new Error("Pinned occurrence lineage disappeared after validation");
  }
  const pinnedLineage = {
    releaseId,
    manifestSha256,
    occurrenceArtifactSha256,
    relationshipBundleSha256:
      input.artifact.artifactKind === "bp.studio.study_events.v3" ||
      input.artifact.artifactKind === "bp.studio.study_events.v4" ||
      input.artifact.artifactKind === "bp.studio.study_events.v5"
        ? input.artifact.wikiInput.relationshipBundleSha256
        : null,
    relationshipEnforcementProofCanonicalSha256:
      input.artifact.artifactKind === "bp.studio.study_events.v3" ||
      input.artifact.artifactKind === "bp.studio.study_events.v4" ||
      input.artifact.artifactKind === "bp.studio.study_events.v5"
        ? input.artifact.wikiInput.relationshipEnforcementProofCanonicalSha256
        : null,
    memberExtent:
      input.artifact.artifactKind === "bp.studio.study_events.v5"
        ? {
            manifestSha256: input.artifact.wikiInput.memberExtent.manifestSha256,
            projectionSha256: input.artifact.wikiInput.memberExtent.projectionSha256,
          }
        : null,
  };

  const sourceArtifact: ReviewWorksheetSourceArtifact =
    input.artifact.artifactKind === "bp.studio.study_events.v5"
      ? {
          artifactKind: input.artifact.artifactKind,
          schemaVersion: input.artifact.schemaVersion,
          approvalState: "awaiting_approval",
          reviewCutId: input.artifact.reviewCutId,
          candidateUniverse: structuredClone(input.artifact.candidateUniverse),
          reviewInputs: structuredClone(input.artifact.reviewInputs),
          wikiInput: { ...input.artifact.wikiInput },
          summary: { ...input.artifact.summary },
        }
      : input.artifact.artifactKind === "bp.studio.study_events.v4"
        ? {
            artifactKind: input.artifact.artifactKind,
            schemaVersion: input.artifact.schemaVersion,
            approvalState: "awaiting_approval",
            reviewCutId: input.artifact.reviewCutId,
            candidateUniverse: structuredClone(input.artifact.candidateUniverse),
            reviewInputs: structuredClone(input.artifact.reviewInputs),
            wikiInput: { ...input.artifact.wikiInput },
            summary: { ...input.artifact.summary },
          }
        : input.artifact.artifactKind === "bp.studio.study_events.v3"
          ? {
              artifactKind: input.artifact.artifactKind,
              schemaVersion: input.artifact.schemaVersion,
              approvalState: "awaiting_approval",
              wikiInput: { ...input.artifact.wikiInput },
              summary: { ...input.artifact.summary },
            }
          : {
              artifactKind: input.artifact.artifactKind,
              schemaVersion: input.artifact.schemaVersion,
              approvalState: "awaiting_approval",
              wikiInput: { ...input.artifact.wikiInput },
              summary: { ...input.artifact.summary },
            };

  return {
    _notice:
      "INCOMPLETE REVIEW WORKSHEET — this is not an approval receipt and cannot authorize studies",
    artifactKind: "worksheet-only:not-an-approval",
    schemaVersion: 0,
    reviewState: "awaiting_review",
    approval: null,
    candidateSetId: input.artifact.candidateSetId,
    ...(input.artifact.artifactKind === "bp.studio.study_events.v4" ||
    input.artifact.artifactKind === "bp.studio.study_events.v5"
      ? { reviewCutId: input.artifact.reviewCutId }
      : {}),
    generatedFrom: input.generatedFrom,
    generatedFromSha256: input.generatedFromSha256,
    sourceArtifact,
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
      wikiRouteRecordIds,
      pinnedLineage,
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
      operatorDecisionCount: 0,
    },
    decisions,
  };
}

function decodeSupportedStudyEventArtifact(raw: unknown): SupportedStudyEventMergeArtifact {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Unsupported study-event artifact: expected a versioned JSON object");
  }
  const discriminator = raw as {
    readonly artifactKind?: unknown;
    readonly schemaVersion?: unknown;
  };
  const schema =
    discriminator.artifactKind === "bp.studio.study_events.v2" && discriminator.schemaVersion === 2
      ? StudyEventMergeArtifactV2Schema
      : discriminator.artifactKind === "bp.studio.study_events.v3" &&
          discriminator.schemaVersion === 3
        ? StudyEventMergeArtifactV3Schema
        : discriminator.artifactKind === "bp.studio.study_events.v4" &&
            discriminator.schemaVersion === 4
          ? StudyEventMergeArtifactV4Schema
          : discriminator.artifactKind === "bp.studio.study_events.v5" &&
              discriminator.schemaVersion === 5
            ? StudyEventMergeArtifactV5Schema
            : null;
  if (schema === null) {
    throw new Error(
      `Unsupported study-event artifact kind/version: ${String(discriminator.artifactKind)}@${String(discriminator.schemaVersion)}`,
    );
  }
  const decoded = decodeSchemaEitherStrict(schema, raw);
  if (Result.isFailure(decoded)) {
    throw new Error(
      `Failed to strict-decode study-event v${String(discriminator.schemaVersion)} artifact: ${String(decoded.failure)}`,
    );
  }
  return decoded.success.artifactKind === "bp.studio.study_events.v4"
    ? validateStudyEventMergeArtifactV4(decoded.success)
    : decoded.success.artifactKind === "bp.studio.study_events.v5"
      ? validateStudyEventMergeArtifactV5(decoded.success)
      : decoded.success;
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
  const decoded = decodeSupportedStudyEventArtifact(raw);
  const worksheetIdentity =
    decoded.artifactKind === "bp.studio.study_events.v4" ||
    decoded.artifactKind === "bp.studio.study_events.v5"
      ? decoded.reviewCutId
      : decoded.candidateSetId;
  const expectedFilename = `${worksheetIdentity.replace(":", "-")}.review-worksheet.json`;
  if (basename(outputPath) !== expectedFilename) {
    throw new Error(`Review worksheet filename must be ${expectedFilename}`);
  }
  const worksheet = buildStudyEventReviewWorksheet({
    artifact: decoded,
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
  summary: "Prepare a deterministic, non-approval v2/v3/v4/v5 study-event review worksheet.",
  input: {
    options: Schema.Struct({
      input: Schema.String.annotate({
        description: "Awaiting-approval bp.studio.study_events.v2, v3, v4, or v5 artifact.",
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
