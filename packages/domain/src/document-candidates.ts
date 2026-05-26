import * as z from "zod";
import { registerProjectSchema } from "./schema-registry.js";

export const DocumentCandidateValidationStateSchema = z.enum([
  "unvalidated",
  "validated",
  "needs_review",
  "rejected",
]);

export type DocumentCandidateValidationState = z.output<
  typeof DocumentCandidateValidationStateSchema
>;

export const DocumentFactClassificationSchema = z.enum([
  "official_fact",
  "official_claim",
  "third_party_evaluation",
  "context",
  "caveat",
  "methodology",
  "source_gap",
]);

export type DocumentFactClassification = z.output<typeof DocumentFactClassificationSchema>;

export const DocumentNegativeEvidenceFlagSchema = z.enum([
  "proposed_only",
  "outreach_not_implementation",
  "ocr_cannot_read_map",
  "no_stop_table",
  "claim_without_row_data",
  "presentation_date_not_implementation",
  "superseded_source",
  "official_linked_not_mta_dot",
  "mention_too_thin_for_intervention",
  "none",
]);

export type DocumentNegativeEvidenceFlag = z.output<typeof DocumentNegativeEvidenceFlagSchema>;

export const DocumentEvidenceCandidateTypeSchema = z.enum([
  "document_claim_candidate",
  "document_metric_claim_candidate",
  "document_table_candidate",
  "document_figure_candidate",
  "document_map_extent_candidate",
  "document_methodology_candidate",
  "document_caveat_candidate",
  "document_project_status_candidate",
  "document_treatment_component_candidate",
  "document_service_change_candidate",
  "document_stop_or_intersection_candidate",
  "document_supersession_candidate",
  "document_source_gap_candidate",
  "document_evidence_link_candidate",
  "review_question_candidate",
]);

export type DocumentEvidenceCandidateType = z.output<typeof DocumentEvidenceCandidateTypeSchema>;

export const DocumentCandidatePayloadSchema = z.record(z.string(), z.unknown());

export type DocumentCandidatePayload = z.output<typeof DocumentCandidatePayloadSchema>;

const DocumentEvidenceCandidateDraftObjectSchema = z
  .object({
    candidateType: DocumentEvidenceCandidateTypeSchema,
    factClassification: DocumentFactClassificationSchema,
    negativeEvidenceFlag: DocumentNegativeEvidenceFlagSchema.default("none"),
    routeMentions: z.array(z.string().min(1)).default([]),
    corridorMentions: z.array(z.string().min(1)).default([]),
    evidencePageRefs: z.array(z.number().int().positive()).default([]),
    evidenceQuote: z.string().min(1),
    summary: z.string().min(1),
    fields: DocumentCandidatePayloadSchema.default({}),
  })
  .strict();

export const DocumentEvidenceCandidateDraftSchema = registerProjectSchema(
  DocumentEvidenceCandidateDraftObjectSchema.readonly(),
  {
    id: "bp.document_evidence_candidate_draft.v1",
    title: "Document Evidence Candidate Draft",
    description:
      "Source-grounded draft candidate emitted by OCR or review tooling before deterministic validation.",
    stability: "draft",
  },
);

export type DocumentEvidenceCandidateDraft = z.output<
  typeof DocumentEvidenceCandidateDraftSchema
>;

export const DocumentEvidenceCandidateSchema = registerProjectSchema(
  DocumentEvidenceCandidateDraftObjectSchema.extend({
    candidateId: z.string().min(1),
    sourceId: z.string().min(1),
    validationState: DocumentCandidateValidationStateSchema,
    reviewReason: z.string().min(1),
  })
    .strict()
    .readonly(),
  {
    id: "bp.document_evidence_candidate.v1",
    title: "Document Evidence Candidate",
    description:
      "Persisted, unvalidated evidence candidate extracted from official or third-party bus documents.",
    stability: "draft",
  },
);

export type DocumentEvidenceCandidate = z.output<typeof DocumentEvidenceCandidateSchema>;
