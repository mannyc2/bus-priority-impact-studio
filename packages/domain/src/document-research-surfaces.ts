import * as z from "zod";
import { registerProjectSchema } from "./schema-registry.js";

export const DocumentResearchSurfaceKindSchema = z.enum([
  "source_note",
  "entity_mention",
  "metric_observation",
  "table_observation",
  "event_candidate",
  "service_change_candidate",
  "treatment_component",
  "claim",
  "causal_claim",
  "context_signal",
  "review_question",
  "source_gap_seed",
  "brief_claim_seed",
  "finding_reasoning_seed",
  "relation",
]);
export type DocumentResearchSurfaceKind = z.output<typeof DocumentResearchSurfaceKindSchema>;

export const DocumentResearchCorpusRoleSchema = z.enum([
  "atomic_observation",
  "source_level_observation",
  "relation_edge",
  "gap_assertion",
  "derived_seed",
]);
export type DocumentResearchCorpusRole = z.output<typeof DocumentResearchCorpusRoleSchema>;

export const DocumentResearchSupportRoleSchema = z.enum([
  "primary",
  "context",
  "caveat",
  "counter_evidence",
  "missing_data",
  "coverage_audit",
  "methodology",
  "route_scope",
  "date_support",
  "status_support",
  "metric_value",
  "table_cell",
]);
export type DocumentResearchSupportRole = z.output<typeof DocumentResearchSupportRoleSchema>;

export const DocumentResearchSupportCompletenessSchema = z.enum([
  "exact",
  "partial",
  "context_only",
  "absent",
]);
export type DocumentResearchSupportCompleteness = z.output<
  typeof DocumentResearchSupportCompletenessSchema
>;

export const DocumentResearchLookupKindSchema = z.enum([
  "route",
  "street",
  "corridor",
  "metric",
  "date",
  "status",
  "treatment",
  "entity",
  "prior_candidate",
]);
export type DocumentResearchLookupKind = z.output<typeof DocumentResearchLookupKindSchema>;

export const DocumentResearchIntendedUseSchema = z.enum([
  "detector_evidence",
  "detector_context",
  "brief_claim_seed",
  "finding_reasoning_seed",
  "public_timeline_candidate",
  "causal_treatment_inventory",
  "event_study_window",
  "source_gap_queue",
  "gold_label_seed",
  "review_packet_context",
]);
export type DocumentResearchIntendedUse = z.output<typeof DocumentResearchIntendedUseSchema>;

export const DocumentResearchEvidenceHandleSchema = z
  .object({
    evidenceHandle: z.string().min(1),
    sourceId: z.string().min(1),
    pageNumber: z.number().int().positive(),
    pageArtifactKey: z.string().min(1).optional(),
    sourceContentHash: z.string().min(1).optional(),
    markdownHash: z.string().min(1).optional(),
    blockIndexHash: z.string().min(1).optional(),
    blockId: z.string().min(1).optional(),
    blockHash: z.string().min(1).optional(),
    lineStart: z.number().int().positive().optional(),
    lineEnd: z.number().int().positive().optional(),
    quoteText: z.string().min(1).optional(),
    quoteHash: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    tableId: z.string().min(1).optional(),
    tableCell: z
      .object({
        rowIndex: z.number().int().nonnegative(),
        columnIndex: z.number().int().nonnegative(),
        headerText: z.string().min(1).optional(),
        rowHeaderText: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    renderRef: z
      .object({
        renderArtifactKey: z.string().min(1),
        bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      })
      .strict()
      .optional(),
    extractionMethod: z
      .enum([
        "ocr_markdown",
        "table_index",
        "pdf_text",
        "render_inspection",
        "prior_hint",
        "source_shell",
      ])
      .default("ocr_markdown"),
  })
  .strict();
export type DocumentResearchEvidenceHandle = z.output<typeof DocumentResearchEvidenceHandleSchema>;

export const DocumentResearchRouteResolutionTierSchema = z.enum([
  "direct_route_text",
  "route_family_branch_group",
  "source_single_route_context",
  "catalog_alias",
  "corridor_only",
  "systemwide",
  "historical_or_proposed_route",
  "ambiguous",
  "rejected",
]);
export type DocumentResearchRouteResolutionTier = z.output<
  typeof DocumentResearchRouteResolutionTierSchema
>;

export const DocumentResearchRouteLookupCandidateSchema = z
  .object({
    routeId: z.string().min(1),
    aliases: z.array(z.string().min(1)).default([]),
    mode: z.enum(["bus", "subway", "rail", "station", "street", "unknown"]).default("unknown"),
    currentStatus: z.enum(["current", "historical", "proposed", "unknown"]).default("unknown"),
    routeFamily: z.string().min(1).optional(),
    serviceVariants: z.array(z.string().min(1)).default([]),
    resolutionTier: DocumentResearchRouteResolutionTierSchema.default("ambiguous"),
    score: z.number().min(0).max(1).optional(),
    requiresReview: z.boolean().default(false),
  })
  .strict();
export type DocumentResearchRouteLookupCandidate = z.output<
  typeof DocumentResearchRouteLookupCandidateSchema
>;

export const DocumentResearchRouteLookupResultSchema = z
  .object({
    lookupKind: z.literal("route"),
    lookupHandle: z.string().min(1),
    rawText: z.string().min(1),
    candidates: z.array(DocumentResearchRouteLookupCandidateSchema).default([]),
    ambiguityNotes: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type DocumentResearchRouteLookupResult = z.output<
  typeof DocumentResearchRouteLookupResultSchema
>;

export const DocumentResearchGenericLookupCandidateSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    aliases: z.array(z.string().min(1)).default([]),
    confidence: z.enum(["high", "medium", "low", "unknown"]).default("unknown"),
  })
  .strict();
export type DocumentResearchGenericLookupCandidate = z.output<
  typeof DocumentResearchGenericLookupCandidateSchema
>;

export const DocumentResearchGenericLookupResultSchema = z
  .object({
    lookupKind: DocumentResearchLookupKindSchema.exclude(["route"]),
    lookupHandle: z.string().min(1),
    rawText: z.string().min(1).optional(),
    candidates: z.array(DocumentResearchGenericLookupCandidateSchema).default([]),
    ambiguityNotes: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type DocumentResearchGenericLookupResult = z.output<
  typeof DocumentResearchGenericLookupResultSchema
>;

export const DocumentResearchLookupResultSchema = z.discriminatedUnion("lookupKind", [
  DocumentResearchRouteLookupResultSchema,
  DocumentResearchGenericLookupResultSchema,
]);
export type DocumentResearchLookupResult = z.output<typeof DocumentResearchLookupResultSchema>;

export const DocumentResearchCanonicalSelectionSchema = z
  .object({
    fieldPath: z.string().min(1),
    lookupKind: DocumentResearchLookupKindSchema,
    lookupHandle: z.string().min(1),
    selectedIds: z.array(z.string().min(1)),
    rawTextFieldPath: z.string().min(1).optional(),
    evidenceHandles: z.array(z.string().min(1)).default([]),
    selectionReason: z.string().min(1).optional(),
  })
  .strict();
export type DocumentResearchCanonicalSelection = z.output<
  typeof DocumentResearchCanonicalSelectionSchema
>;

export const DocumentResearchSurfaceDraftV2Schema = registerProjectSchema(
  z
    .object({
      surfaceKind: DocumentResearchSurfaceKindSchema,
      corpusRole: DocumentResearchCorpusRoleSchema,
      rawText: z.string().min(1),
      displayLabel: z.string().min(1),
      payloadSchemaId: z.string().min(1),
      rawPayload: z.record(z.string(), z.unknown()).default({}),
      evidenceByField: z
        .record(
          z.string(),
          z.array(
            z
              .object({
                evidenceHandle: z.string().min(1),
                supportRole: DocumentResearchSupportRoleSchema,
                supportCompleteness: DocumentResearchSupportCompletenessSchema.optional(),
              })
              .strict(),
          ),
        )
        .default({}),
      counterEvidenceByField: z.record(z.string(), z.array(z.string().min(1))).optional(),
      canonicalSelections: z.array(DocumentResearchCanonicalSelectionSchema).default([]),
      parentSurfaceIds: z.array(z.string().min(1)).default([]),
      priorHintUses: z
        .array(
          z
            .object({
              hintId: z.string().min(1),
              usedAs: z.enum(["context_only", "candidate_seed", "conflict", "ignored"]),
            })
            .strict(),
        )
        .default([]),
      requestedUses: z.array(DocumentResearchIntendedUseSchema).default([]),
      agentConfidence: z.enum(["low", "medium", "high"]),
      agentNotes: z.string().min(1).optional(),
    })
    .strict(),
  {
    id: "bp.document_research_surface_draft.v2",
    title: "Document Research Surface Draft V2",
    description:
      "Agent-submitted draft document research surface with semantic fields, evidence handles, and canonical lookup selections before validation.",
    stability: "draft",
  },
);
export type DocumentResearchSurfaceDraftV2 = z.output<typeof DocumentResearchSurfaceDraftV2Schema>;

export const DocumentEvidencePointerV2Schema = z
  .object({
    pointerId: z.string().min(1),
    sourceId: z.string().min(1),
    sourceContentHash: z.string().min(1),
    pageNumber: z.number().int().positive(),
    pageArtifactKey: z.string().min(1),
    markdownHash: z.string().min(1),
    blockIndexHash: z.string().min(1),
    blockId: z.string().min(1),
    blockHash: z.string().min(1),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    quoteText: z.string().min(1).optional(),
    quoteHash: z.string().min(1).optional(),
    tableId: z.string().min(1).optional(),
    tableCell: DocumentResearchEvidenceHandleSchema.shape.tableCell,
    renderRef: DocumentResearchEvidenceHandleSchema.shape.renderRef,
    observationId: z.string().min(1).optional(),
    extractionMethod: DocumentResearchEvidenceHandleSchema.shape.extractionMethod,
  })
  .strict();
export type DocumentEvidencePointerV2 = z.output<typeof DocumentEvidencePointerV2Schema>;

export const FieldSupportV2Schema = z
  .object({
    supportId: z.string().min(1),
    surfaceId: z.string().min(1),
    fieldPath: z.string().min(1),
    supportRole: DocumentResearchSupportRoleSchema,
    evidencePointers: z.array(z.string().min(1)),
    counterEvidencePointers: z.array(z.string().min(1)).default([]),
    verifierState: z.enum(["verified", "warning", "rejected", "not_checked"]),
    verifierCodes: z.array(z.string().min(1)).default([]),
    supportCompleteness: DocumentResearchSupportCompletenessSchema,
    notes: z.string().min(1).optional(),
  })
  .strict();
export type FieldSupportV2 = z.output<typeof FieldSupportV2Schema>;

export const DocumentResearchArtifactRefSchema = z
  .object({
    artifactId: z.string().min(1),
    artifactKind: z.enum([
      "source_manifest",
      "page_markdown",
      "block_index",
      "table_index",
      "table_slice",
      "render_image",
      "tool_transcript",
      "prior_extraction",
      "analysis_artifact",
    ]),
    path: z.string().min(1),
    contentHash: z.string().min(1),
    role: z.enum(["primary", "context", "provenance", "bulk_payload", "derived_from"]),
  })
  .strict();
export type DocumentResearchArtifactRef = z.output<typeof DocumentResearchArtifactRefSchema>;

export const DocumentResearchSourceContextSchema = z
  .object({
    sourceId: z.string().min(1),
    sourceTitle: z.string().min(1),
    sourceGroup: z.string().min(1),
    sourceInvestigationId: z.string().min(1),
    pageNumbers: z.array(z.number().int().positive()).min(1),
    sourceContentHash: z.string().min(1),
    pageArtifactKey: z.string().min(1),
    markdownHash: z.string().min(1),
    blockIndexHash: z.string().min(1),
  })
  .strict();
export type DocumentResearchSourceContext = z.output<typeof DocumentResearchSourceContextSchema>;

export const DocumentResearchSurfaceV2Schema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(2),
      surfaceId: z.string().min(1),
      sourceId: z.string().min(1),
      sourceTitle: z.string().min(1),
      sourceGroup: z.string().min(1),
      pageNumbers: z.array(z.number().int().positive()).min(1),
      sourceInvestigationId: z.string().min(1),
      corpusRole: DocumentResearchCorpusRoleSchema,
      sourceScope: z
        .object({
          kind: z.enum([
            "document",
            "page_window",
            "page",
            "block",
            "table",
            "figure",
            "map",
            "cross_document",
          ]),
          blockIds: z.array(z.string().min(1)).optional(),
          tableId: z.string().min(1).optional(),
          figureId: z.string().min(1).optional(),
          parentSurfaceIds: z.array(z.string().min(1)).optional(),
        })
        .strict(),
      surfaceKind: DocumentResearchSurfaceKindSchema,
      rawText: z.string().min(1),
      displayLabel: z.string().min(1),
      payloadSchemaId: z.string().min(1),
      rawPayload: z.record(z.string(), z.unknown()).default({}),
      canonicalPayload: z.record(z.string(), z.unknown()).default({}),
      artifactRefs: z.array(DocumentResearchArtifactRefSchema).default([]),
      priorHints: z
        .array(
          z
            .object({
              hintId: z.string().min(1),
              hintKind: z.string().min(1),
              sourceArtifactKey: z.string().min(1),
              validationState: z.string().min(1),
              usedAs: z.enum(["context_only", "candidate_seed", "conflict", "ignored"]),
            })
            .strict(),
        )
        .default([]),
      fieldSupportIds: z.array(z.string().min(1)).default([]),
      lifecycle: z
        .object({
          extractionState: z.enum([
            "candidate",
            "verified_candidate",
            "reviewed",
            "promoted",
            "rejected",
          ]),
          reviewState: z.enum(["unreviewed", "needs_review", "approved", "rejected"]),
          promotionState: z.enum([
            "none",
            "research_only",
            "detector_context",
            "brief_context",
            "public_candidate",
          ]),
        })
        .strict(),
      intendedUses: z.array(DocumentResearchIntendedUseSchema).default([]),
      blockers: z.array(z.string().min(1)).default([]),
      confidence: z
        .object({
          agentConfidence: z.enum(["low", "medium", "high"]),
          verifierConfidence: z.enum(["none", "low", "medium", "high"]),
          confidenceReasons: z.array(z.string().min(1)).default([]),
        })
        .strict(),
    })
    .strict(),
  {
    id: "bp.document_research_surface.v2",
    title: "Document Research Surface V2",
    description:
      "Persisted, harness-validated document research surface with canonical payload, field support, and provenance.",
    stability: "draft",
  },
);
export type DocumentResearchSurfaceV2 = z.output<typeof DocumentResearchSurfaceV2Schema>;

export const DocumentResearchValidationIssueSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    code: z.string().min(1),
    path: z.string().min(1),
    message: z.string().min(1),
    recoverability: z.enum(["repairable", "quarantine", "hard"]),
    suggestedActions: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type DocumentResearchValidationIssue = z.output<
  typeof DocumentResearchValidationIssueSchema
>;

export const DocumentResearchAcceptedCanonicalFieldSchema = z
  .object({
    fieldPath: z.string().min(1),
    lookupKind: DocumentResearchLookupKindSchema,
    lookupHandle: z.string().min(1),
    selectedIds: z.array(z.string().min(1)),
    evidenceHandles: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type DocumentResearchAcceptedCanonicalField = z.output<
  typeof DocumentResearchAcceptedCanonicalFieldSchema
>;

export const DocumentResearchDraftValidationStateSchema = z.enum([
  "accepted",
  "repairable_rejected",
  "quarantined",
  "hard_rejected",
]);
export type DocumentResearchDraftValidationState = z.output<
  typeof DocumentResearchDraftValidationStateSchema
>;

export type ValidateDocumentResearchSurfaceDraftInput = {
  readonly draft: DocumentResearchSurfaceDraftV2;
  readonly source: DocumentResearchSourceContext;
  readonly evidenceHandles?: readonly DocumentResearchEvidenceHandle[];
  readonly lookupResults?: readonly DocumentResearchLookupResult[];
  readonly routeUniverse?: readonly string[];
};

export type DocumentResearchSurfaceDraftValidation = {
  readonly state: DocumentResearchDraftValidationState;
  readonly issues: DocumentResearchValidationIssue[];
  readonly acceptedCanonicalFields: DocumentResearchAcceptedCanonicalField[];
};

export type SubmitDocumentResearchSurfaceDraftsInput = {
  readonly drafts: readonly DocumentResearchSurfaceDraftV2[];
  readonly source: DocumentResearchSourceContext;
  readonly evidenceHandles?: readonly DocumentResearchEvidenceHandle[];
  readonly lookupResults?: readonly DocumentResearchLookupResult[];
  readonly routeUniverse?: readonly string[];
  readonly idPrefix: string;
};

export type SubmittedDocumentResearchSurface = {
  readonly draftIndex: number;
  readonly surface: DocumentResearchSurfaceV2;
  readonly fieldSupport: FieldSupportV2[];
  readonly evidencePointers: DocumentEvidencePointerV2[];
  readonly acceptedCanonicalFields: DocumentResearchAcceptedCanonicalField[];
  readonly warnings: DocumentResearchValidationIssue[];
};

export type RejectedDocumentResearchSurfaceDraft = {
  readonly draftIndex: number;
  readonly validation: DocumentResearchSurfaceDraftValidation;
};

export type SubmitDocumentResearchSurfaceDraftsResult = {
  readonly state: "accepted" | "partial_accepted" | "rejected";
  readonly accepted: SubmittedDocumentResearchSurface[];
  readonly rejected: RejectedDocumentResearchSurfaceDraft[];
};

function issue(input: {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
  recoverability?: "repairable" | "quarantine" | "hard";
  suggestedActions?: string[];
}): DocumentResearchValidationIssue {
  return {
    recoverability: "repairable",
    suggestedActions: [],
    ...input,
  };
}

function lookupKey(kind: DocumentResearchLookupKind, handle: string): string {
  return `${kind}:${handle}`;
}

function evidenceText(handle: DocumentResearchEvidenceHandle): string {
  return [handle.quoteText, handle.text].filter((part) => part !== undefined).join("\n");
}

function normalizeSearch(value: string): string {
  return value
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textSupportsAny(sourceText: string, needles: readonly string[]): boolean {
  const normalizedSource = normalizeSearch(sourceText);
  return needles
    .map((needle) => normalizeSearch(needle))
    .filter((needle) => needle.length > 0)
    .some((needle) => normalizedSource.includes(needle));
}

function getPathValue(root: unknown, path: string): unknown {
  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  let current: unknown = root;
  for (const part of normalized.split(".")) {
    if (part.length === 0) continue;
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function canonicalRouteIdLooksValid(routeId: string): boolean {
  return /^(SIM|BX|BM|QM|M|B|Q|S|X)\d{1,3}[A-Z]?$/iu.test(routeId);
}

function routeIdContainsServiceVariant(routeId: string): boolean {
  return (
    /\b(SBS|SELECT\s+BUS\s+SERVICE|LOCAL|LIMITED|LTD|EXPRESS)\b/iu.test(routeId) ||
    /[\s/]/u.test(routeId)
  );
}

function routeSelectionFieldPathIsCanonical(fieldPath: string): boolean {
  return fieldPath === "routeIds";
}

function validateKnownEvidenceHandles(input: {
  draft: DocumentResearchSurfaceDraftV2;
  handlesById: ReadonlyMap<string, DocumentResearchEvidenceHandle>;
}): DocumentResearchValidationIssue[] {
  const issues: DocumentResearchValidationIssue[] = [];
  for (const [fieldPath, supports] of Object.entries(input.draft.evidenceByField)) {
    if (getPathValue(input.draft, fieldPath) === undefined) {
      issues.push(
        issue({
          severity: "error",
          code: "evidence_field_path_not_found",
          path: `evidenceByField.${fieldPath}`,
          message: `Evidence field path ${fieldPath} does not resolve on the draft.`,
          suggestedActions: [
            "Use exact draft field paths such as rawText, displayLabel, or rawPayload.routeTextRaw.",
          ],
        }),
      );
    }
    for (const [index, support] of supports.entries()) {
      const handle = input.handlesById.get(support.evidenceHandle);
      if (handle === undefined) {
        issues.push(
          issue({
            severity: "error",
            code: "unknown_evidence_handle",
            path: `evidenceByField.${fieldPath}.${index}.evidenceHandle`,
            message: `Unknown evidence handle ${support.evidenceHandle}.`,
            suggestedActions: [
              "Call doc_search, doc_page, block_context, or table_slice before resubmitting.",
            ],
          }),
        );
        continue;
      }
      if (
        (support.supportRole === "missing_data" || support.supportCompleteness === "absent") &&
        handle.extractionMethod !== "source_shell"
      ) {
        issues.push(
          issue({
            severity: "error",
            code: "missing_data_requires_search_transcript",
            path: `evidenceByField.${fieldPath}.${index}`,
            message:
              "Missing-data support requires a source search/shell transcript, not an affirmative OCR evidence span.",
            suggestedActions: [
              "Record a source-scoped search or shell observation before submitting absent/missing-data support.",
            ],
          }),
        );
      }
    }
  }
  return issues;
}

function routeRawTextForSelection(input: {
  draft: DocumentResearchSurfaceDraftV2;
  selection: DocumentResearchCanonicalSelection;
  lookup: DocumentResearchRouteLookupResult;
}): string {
  const value =
    input.selection.rawTextFieldPath === undefined
      ? undefined
      : getPathValue(input.draft, input.selection.rawTextFieldPath);
  return typeof value === "string" && value.trim().length > 0 ? value : input.lookup.rawText;
}

function validateRouteSelection(input: {
  draft: DocumentResearchSurfaceDraftV2;
  selection: DocumentResearchCanonicalSelection;
  lookup: DocumentResearchRouteLookupResult;
  handlesById: ReadonlyMap<string, DocumentResearchEvidenceHandle>;
  routeUniverse: ReadonlySet<string> | null;
}): {
  issues: DocumentResearchValidationIssue[];
  accepted: DocumentResearchAcceptedCanonicalField | null;
} {
  const issues: DocumentResearchValidationIssue[] = [];
  const candidatesByRoute = new Map(
    input.lookup.candidates.map((candidate) => [candidate.routeId.toUpperCase(), candidate]),
  );
  const rawText = routeRawTextForSelection(input);
  const supportingEvidence = input.selection.evidenceHandles
    .map((handle) => input.handlesById.get(handle))
    .filter((handle): handle is DocumentResearchEvidenceHandle => handle !== undefined);
  const evidenceCombinedText = supportingEvidence.map(evidenceText).join("\n");
  const candidateAliases = input.selection.selectedIds.flatMap((selectedId) => {
    const candidate = candidatesByRoute.get(selectedId.toUpperCase());
    return candidate === undefined ? [] : [candidate.routeId, ...candidate.aliases];
  });

  if (
    input.selection.rawTextFieldPath !== undefined &&
    getPathValue(input.draft, input.selection.rawTextFieldPath) === undefined
  ) {
    issues.push(
      issue({
        severity: "error",
        code: "raw_route_text_field_path_not_found",
        path: input.selection.rawTextFieldPath,
        message: `Route rawTextFieldPath ${input.selection.rawTextFieldPath} does not resolve on the draft.`,
        suggestedActions: [
          "Put the exact source route wording in rawPayload.routeTextRaw and reference rawPayload.routeTextRaw.",
        ],
      }),
    );
  }

  if (!routeSelectionFieldPathIsCanonical(input.selection.fieldPath)) {
    issues.push(
      issue({
        severity: "error",
        code: "route_selection_field_path_not_canonical",
        path: input.selection.fieldPath,
        message: "Canonical route selections must write bare route ids to routeIds.",
        suggestedActions: [
          "Use canonicalSelections[].fieldPath = routeIds and put the source route wording in rawPayload.routeTextRaw.",
        ],
      }),
    );
  }

  if (input.selection.evidenceHandles.length === 0) {
    issues.push(
      issue({
        severity: "error",
        code: "canonical_selection_missing_evidence",
        path: `${input.selection.fieldPath}.evidenceHandles`,
        message: "Canonical route selections need evidence handles.",
        suggestedActions: ["Cite the route-supporting doc_search or block_context result."],
      }),
    );
  }

  for (const evidenceHandle of input.selection.evidenceHandles) {
    if (!input.handlesById.has(evidenceHandle)) {
      issues.push(
        issue({
          severity: "error",
          code: "unknown_evidence_handle",
          path: `${input.selection.fieldPath}.evidenceHandles`,
          message: `Unknown evidence handle ${evidenceHandle}.`,
          suggestedActions: [
            "Call doc_search, doc_page, block_context, or table_slice before resubmitting.",
          ],
        }),
      );
    }
  }

  if (
    supportingEvidence.length > 0 &&
    !textSupportsAny(evidenceCombinedText, [rawText, ...candidateAliases])
  ) {
    issues.push(
      issue({
        severity: "error",
        code: "route_text_not_supported_by_evidence",
        path: input.selection.fieldPath,
        message:
          "Cited evidence does not contain the raw route mention or an accepted route alias.",
        suggestedActions: [
          "Call route_lookup with the exact source wording or cite a tighter evidence span.",
        ],
      }),
    );
  }

  for (const selectedId of input.selection.selectedIds) {
    const normalizedSelected = selectedId.toUpperCase();
    const candidate = candidatesByRoute.get(normalizedSelected);

    if (routeIdContainsServiceVariant(selectedId)) {
      issues.push(
        issue({
          severity: "error",
          code: "service_variant_in_route_id",
          path: input.selection.fieldPath,
          message:
            "Selected route id includes service-variant prose that belongs in serviceVariants[].",
          suggestedActions: [
            "Select the bare route id returned by route_lookup and keep SBS/local/limited separately.",
          ],
        }),
      );
      continue;
    }

    if (!canonicalRouteIdLooksValid(selectedId)) {
      issues.push(
        issue({
          severity: "error",
          code: "unknown_route_id",
          path: input.selection.fieldPath,
          message: `Selected route id ${selectedId} is not a canonical MTA bus route id shape.`,
          suggestedActions: ["Call route_lookup with the exact source route text."],
        }),
      );
    }

    if (input.routeUniverse !== null && !input.routeUniverse.has(normalizedSelected)) {
      issues.push(
        issue({
          severity: "error",
          code: "unknown_route_id",
          path: input.selection.fieldPath,
          message: `Selected route id ${selectedId} is not in the canonical route universe.`,
          suggestedActions: [
            "Select a returned current/historical route id or mark the route ambiguous.",
          ],
        }),
      );
    }

    if (candidate === undefined) {
      issues.push(
        issue({
          severity: "error",
          code: "selected_route_not_in_lookup_result",
          path: input.selection.fieldPath,
          message: `Selected route id ${selectedId} was not returned by ${input.lookup.lookupHandle}.`,
          suggestedActions: [
            "Select from the route_lookup candidates or rerun route_lookup with the exact source text.",
          ],
        }),
      );
      continue;
    }

    if (candidate.mode !== "bus") {
      issues.push(
        issue({
          severity: "error",
          code: "non_bus_mode_route_selection",
          path: input.selection.fieldPath,
          message: `Selected route id ${selectedId} resolved to ${candidate.mode}, not bus.`,
          suggestedActions: [
            "Keep this as context or rerun route_lookup with bus-route-specific source text.",
          ],
        }),
      );
    }

    if (
      candidate.resolutionTier === "route_family_branch_group" &&
      (candidate.requiresReview || selectedId === candidate.routeFamily)
    ) {
      issues.push(
        issue({
          severity: "error",
          code: "route_family_requires_branch_review",
          path: input.selection.fieldPath,
          message:
            "Route family/branch-group wording cannot be collapsed to one route id without review.",
          suggestedActions: [
            "Select exact branch ids from route_lookup or mark route scope ambiguous.",
          ],
        }),
      );
    }
  }

  if (issues.some((candidateIssue) => candidateIssue.severity === "error")) {
    return { issues, accepted: null };
  }

  return {
    issues,
    accepted: {
      fieldPath: input.selection.fieldPath,
      lookupKind: "route",
      lookupHandle: input.selection.lookupHandle,
      selectedIds: input.selection.selectedIds.map((selectedId) => selectedId.toUpperCase()),
      evidenceHandles: input.selection.evidenceHandles,
    },
  };
}

function validateGenericSelection(input: {
  selection: DocumentResearchCanonicalSelection;
  lookup: DocumentResearchGenericLookupResult;
  handlesById: ReadonlyMap<string, DocumentResearchEvidenceHandle>;
}): {
  issues: DocumentResearchValidationIssue[];
  accepted: DocumentResearchAcceptedCanonicalField | null;
} {
  const issues: DocumentResearchValidationIssue[] = [];
  const candidatesById = new Set(input.lookup.candidates.map((candidate) => candidate.id));
  for (const selectedId of input.selection.selectedIds) {
    if (!candidatesById.has(selectedId)) {
      issues.push(
        issue({
          severity: "error",
          code: "selected_id_not_in_lookup_result",
          path: input.selection.fieldPath,
          message: `Selected id ${selectedId} was not returned by ${input.lookup.lookupHandle}.`,
          suggestedActions: [
            "Select from the lookup candidates or rerun the relevant lookup tool.",
          ],
        }),
      );
    }
  }
  for (const evidenceHandle of input.selection.evidenceHandles) {
    if (!input.handlesById.has(evidenceHandle)) {
      issues.push(
        issue({
          severity: "error",
          code: "unknown_evidence_handle",
          path: `${input.selection.fieldPath}.evidenceHandles`,
          message: `Unknown evidence handle ${evidenceHandle}.`,
          suggestedActions: ["Call a source inspection tool before resubmitting."],
        }),
      );
    }
  }
  if (issues.some((candidateIssue) => candidateIssue.severity === "error")) {
    return { issues, accepted: null };
  }
  return {
    issues,
    accepted: {
      fieldPath: input.selection.fieldPath,
      lookupKind: input.selection.lookupKind,
      lookupHandle: input.selection.lookupHandle,
      selectedIds: input.selection.selectedIds,
      evidenceHandles: input.selection.evidenceHandles,
    },
  };
}

export function validateDocumentResearchSurfaceDraft(
  input: ValidateDocumentResearchSurfaceDraftInput,
): DocumentResearchSurfaceDraftValidation {
  const draft = DocumentResearchSurfaceDraftV2Schema.parse(input.draft);
  const source = DocumentResearchSourceContextSchema.parse(input.source);
  const evidenceHandles = (input.evidenceHandles ?? []).map((handle) =>
    DocumentResearchEvidenceHandleSchema.parse(handle),
  );
  const lookupResults = (input.lookupResults ?? []).map((lookup) =>
    DocumentResearchLookupResultSchema.parse(lookup),
  );
  const handlesById = new Map(evidenceHandles.map((handle) => [handle.evidenceHandle, handle]));
  const lookupsByKey = new Map(
    lookupResults.map((lookup) => [lookupKey(lookup.lookupKind, lookup.lookupHandle), lookup]),
  );
  const routeUniverse =
    input.routeUniverse === undefined
      ? null
      : new Set(input.routeUniverse.map((routeId) => routeId.toUpperCase()));
  const issues: DocumentResearchValidationIssue[] = [
    ...validateKnownEvidenceHandles({ draft, handlesById }),
  ];
  const acceptedCanonicalFields: DocumentResearchAcceptedCanonicalField[] = [];

  for (const [index, selection] of draft.canonicalSelections.entries()) {
    const lookup = lookupsByKey.get(lookupKey(selection.lookupKind, selection.lookupHandle));
    if (lookup === undefined) {
      issues.push(
        issue({
          severity: "error",
          code: "unknown_lookup_handle",
          path: `canonicalSelections.${index}.lookupHandle`,
          message: `Unknown ${selection.lookupKind} lookup handle ${selection.lookupHandle}.`,
          suggestedActions: [
            `Call ${selection.lookupKind}_lookup or remove this canonical selection.`,
          ],
        }),
      );
      continue;
    }

    if (lookup.lookupKind !== selection.lookupKind) {
      issues.push(
        issue({
          severity: "error",
          code: "lookup_kind_mismatch",
          path: `canonicalSelections.${index}.lookupKind`,
          message: `Lookup handle ${selection.lookupHandle} is ${lookup.lookupKind}, not ${selection.lookupKind}.`,
          suggestedActions: ["Use the matching lookup handle for this canonical field."],
        }),
      );
      continue;
    }

    const result =
      selection.lookupKind === "route" && lookup.lookupKind === "route"
        ? validateRouteSelection({
            draft,
            selection,
            lookup,
            handlesById,
            routeUniverse,
          })
        : selection.lookupKind !== "route" && lookup.lookupKind !== "route"
          ? validateGenericSelection({
              selection,
              lookup,
              handlesById,
            })
          : {
              issues: [
                issue({
                  severity: "error",
                  code: "lookup_kind_mismatch",
                  path: `canonicalSelections.${index}.lookupKind`,
                  message: `Lookup handle ${selection.lookupHandle} is ${lookup.lookupKind}, not ${selection.lookupKind}.`,
                  suggestedActions: ["Use the matching lookup handle for this canonical field."],
                }),
              ],
              accepted: null,
            };
    issues.push(...result.issues);
    if (result.accepted !== null) acceptedCanonicalFields.push(result.accepted);
  }

  const hardErrors = issues.some(
    (candidateIssue) =>
      candidateIssue.severity === "error" && candidateIssue.recoverability === "hard",
  );
  const repairableErrors = issues.some(
    (candidateIssue) =>
      candidateIssue.severity === "error" && candidateIssue.recoverability === "repairable",
  );
  const quarantineErrors = issues.some(
    (candidateIssue) =>
      candidateIssue.severity === "error" && candidateIssue.recoverability === "quarantine",
  );

  const state: DocumentResearchDraftValidationState = hardErrors
    ? "hard_rejected"
    : repairableErrors
      ? "repairable_rejected"
      : quarantineErrors
        ? "quarantined"
        : "accepted";

  void source;
  return { state, issues, acceptedCanonicalFields };
}

function materializeEvidencePointers(input: {
  surfaceId: string;
  source: DocumentResearchSourceContext;
  evidenceHandles: readonly DocumentResearchEvidenceHandle[];
}): Map<string, DocumentEvidencePointerV2> {
  const pointers = new Map<string, DocumentEvidencePointerV2>();
  for (const handle of input.evidenceHandles) {
    const pointerId = `${input.surfaceId}:pointer:${handle.evidenceHandle}`;
    pointers.set(
      handle.evidenceHandle,
      DocumentEvidencePointerV2Schema.parse({
        pointerId,
        sourceId: handle.sourceId,
        sourceContentHash: handle.sourceContentHash ?? input.source.sourceContentHash,
        pageNumber: handle.pageNumber,
        pageArtifactKey: handle.pageArtifactKey ?? input.source.pageArtifactKey,
        markdownHash: handle.markdownHash ?? input.source.markdownHash,
        blockIndexHash: handle.blockIndexHash ?? input.source.blockIndexHash,
        blockId: handle.blockId ?? "unknown",
        blockHash: handle.blockHash ?? "unknown",
        lineStart: handle.lineStart ?? 1,
        lineEnd: handle.lineEnd ?? handle.lineStart ?? 1,
        quoteText: handle.quoteText,
        quoteHash: handle.quoteHash,
        tableId: handle.tableId,
        tableCell: handle.tableCell,
        renderRef: handle.renderRef,
        extractionMethod: handle.extractionMethod,
      }),
    );
  }
  return pointers;
}

function canonicalPayloadFrom(
  fields: readonly DocumentResearchAcceptedCanonicalField[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    payload[field.fieldPath] = field.selectedIds;
  }
  return payload;
}

function materializeAcceptedDraft(input: {
  draft: DocumentResearchSurfaceDraftV2;
  source: DocumentResearchSourceContext;
  surfaceId: string;
  evidenceHandles: readonly DocumentResearchEvidenceHandle[];
  acceptedCanonicalFields: readonly DocumentResearchAcceptedCanonicalField[];
  warnings: readonly DocumentResearchValidationIssue[];
}): SubmittedDocumentResearchSurface {
  const pointersByHandle = materializeEvidencePointers({
    surfaceId: input.surfaceId,
    source: input.source,
    evidenceHandles: input.evidenceHandles,
  });
  const fieldSupport: FieldSupportV2[] = [];

  for (const [fieldPath, supports] of Object.entries(input.draft.evidenceByField)) {
    for (const [index, support] of supports.entries()) {
      const pointer = pointersByHandle.get(support.evidenceHandle);
      fieldSupport.push(
        FieldSupportV2Schema.parse({
          supportId: `${input.surfaceId}:support:${fieldSupport.length + 1}`,
          surfaceId: input.surfaceId,
          fieldPath,
          supportRole: support.supportRole,
          evidencePointers: pointer === undefined ? [] : [pointer.pointerId],
          counterEvidencePointers: [],
          verifierState: pointer === undefined ? "rejected" : "verified",
          verifierCodes: pointer === undefined ? ["unknown_evidence_handle"] : [],
          supportCompleteness: support.supportCompleteness ?? "exact",
          notes:
            pointer === undefined
              ? `Evidence handle ${support.evidenceHandle} was unavailable at support index ${index}.`
              : undefined,
        }),
      );
    }
  }

  const surface = DocumentResearchSurfaceV2Schema.parse({
    schemaVersion: 2,
    surfaceId: input.surfaceId,
    sourceId: input.source.sourceId,
    sourceTitle: input.source.sourceTitle,
    sourceGroup: input.source.sourceGroup,
    pageNumbers: input.source.pageNumbers,
    sourceInvestigationId: input.source.sourceInvestigationId,
    corpusRole: input.draft.corpusRole,
    sourceScope: {
      kind: "page_window",
      parentSurfaceIds:
        input.draft.parentSurfaceIds.length === 0 ? undefined : input.draft.parentSurfaceIds,
    },
    surfaceKind: input.draft.surfaceKind,
    rawText: input.draft.rawText,
    displayLabel: input.draft.displayLabel,
    payloadSchemaId: input.draft.payloadSchemaId,
    rawPayload: input.draft.rawPayload,
    canonicalPayload: canonicalPayloadFrom(input.acceptedCanonicalFields),
    artifactRefs: [],
    priorHints: input.draft.priorHintUses.map((hint) => ({
      hintId: hint.hintId,
      hintKind: "prior_candidate",
      sourceArtifactKey: "lookup",
      validationState: "provided",
      usedAs: hint.usedAs,
    })),
    fieldSupportIds: fieldSupport.map((support) => support.supportId),
    lifecycle: {
      extractionState: "verified_candidate",
      reviewState: "unreviewed",
      promotionState: "none",
    },
    intendedUses: input.draft.requestedUses,
    blockers: [],
    confidence: {
      agentConfidence: input.draft.agentConfidence,
      verifierConfidence: input.warnings.length === 0 ? "high" : "medium",
      confidenceReasons:
        input.warnings.length === 0
          ? ["draft_validation_accepted"]
          : input.warnings.map((warning) => warning.code),
    },
  });

  return {
    draftIndex: -1,
    surface,
    fieldSupport,
    evidencePointers: [...pointersByHandle.values()],
    acceptedCanonicalFields: [...input.acceptedCanonicalFields],
    warnings: [...input.warnings],
  };
}

export function submitDocumentResearchSurfaceDrafts(
  input: SubmitDocumentResearchSurfaceDraftsInput,
): SubmitDocumentResearchSurfaceDraftsResult {
  const accepted: SubmittedDocumentResearchSurface[] = [];
  const rejected: RejectedDocumentResearchSurfaceDraft[] = [];
  const source = DocumentResearchSourceContextSchema.parse(input.source);
  const evidenceHandles = (input.evidenceHandles ?? []).map((handle) =>
    DocumentResearchEvidenceHandleSchema.parse(handle),
  );

  for (const [draftIndex, draft] of input.drafts.entries()) {
    const parsedDraft = DocumentResearchSurfaceDraftV2Schema.parse(draft);
    const validation = validateDocumentResearchSurfaceDraft({
      draft: parsedDraft,
      source,
      evidenceHandles,
      ...(input.lookupResults === undefined ? {} : { lookupResults: input.lookupResults }),
      ...(input.routeUniverse === undefined ? {} : { routeUniverse: input.routeUniverse }),
    });

    if (validation.state !== "accepted") {
      rejected.push({ draftIndex, validation });
      continue;
    }

    const warnings = validation.issues.filter(
      (candidateIssue) => candidateIssue.severity === "warning",
    );
    const materialized = materializeAcceptedDraft({
      draft: parsedDraft,
      source,
      surfaceId: `${input.idPrefix}:surface:${draftIndex + 1}`,
      evidenceHandles,
      acceptedCanonicalFields: validation.acceptedCanonicalFields,
      warnings,
    });
    accepted.push({ ...materialized, draftIndex });
  }

  const state =
    accepted.length === input.drafts.length
      ? "accepted"
      : accepted.length === 0
        ? "rejected"
        : "partial_accepted";
  return { state, accepted, rejected };
}
