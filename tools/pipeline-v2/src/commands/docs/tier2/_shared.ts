// NOTE: This file is the consolidated body of the v1 monolith
// `tools/pipeline/src/jobs/docs/tier2-docs.ts`, ported to v2 with v1
// helper imports rewritten to v2 equivalents. Sibling `tier2/*.ts` command
// files thinly wrap the FromCli functions exported here under
// `defineCommand`. Files prefixed with `_` are helpers (no `default`
// export) and are ignored by the v2 CLI loader.
//
// NOTE (Tier 2 LLM transport): the forced-tool-call surfaces now route through
// the pi harness (`lib/llm.ts` -> `@earendil-works/pi-ai`) wherever pi-ai can
// express the request:
//   - DeepSeek candidate + intervention-record extraction
//     (`callDeepSeekMarkdownCandidates`, `callDeepSeekInterventionRecords`):
//     text-only forced tool calls. The pi-ai DeepSeek catalog model auto-injects
//     `thinking: { type: "disabled" }` when reasoning is off, matching the legacy
//     client's manual disable that keeps a forced `tool_choice` working.
//   - Rendered-image (PNG) OCR (`callOpenRouterPageMarkdownOcr`, image path):
//     pi-ai serializes the `{type:"image"}` content block to OpenRouter's
//     `{type:"image_url"}`. This is the canonical OCR path (the corpus is 100%
//     rendered-image input).
// Each pi call synthesizes the legacy `{response, body}` contract (see
// `_llm-clients.ts: synthesizeOpenRouterCallResult`) so the per-step consumers
// (`extractToolCallArguments`, `openRouterErrorMessage`, `body.usage`) are
// unchanged. Because pi-ai streams via the OpenAI SDK, OpenRouter `service_tier`,
// file annotations, and the raw provider `usage` are not recoverable; the image
// OCR path therefore reports a null served service tier and empty annotations.
//
// Only OpenRouter's server-side file-parser path stays inline on
// `postOpenRouterChatCompletions`: the rare non-vision `pdf_page` fallback in
// `callOpenRouterPageMarkdownOcr` needs the `{type:"file"}` content block plus
// `plugins: [{ id: "file-parser", pdf: { engine } }]`, neither of which pi-ai's
// content/option model can express.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { replaceTier2InterventionStagingRows } from "@bp/db/local";
import {
  type DocumentEvidenceCandidateDraft,
  DocumentEvidenceCandidateDraftSchema,
  DocumentEvidenceCandidateDraftToolSchema,
  DocumentServiceChangeKindSchema,
  DocumentTreatmentTypeSchema,
  type Tier2CandidateSourceRef,
  type Tier2CandidateValidationState,
  type Tier2DocumentEvidenceCandidate,
  type Tier2OcrMarkdownCandidateQualityIssueCode,
  type Tier2OcrMarkdownCandidateQualityRepairCode,
} from "@bp/domain/documents/candidates";
import {
  type DocumentInterventionRecord,
  type DocumentInterventionRecordKind,
  INTERVENTION_RECORD_QUALITY_ISSUE_CODES,
  INTERVENTION_RECORD_QUALITY_REPAIR_CODES,
  isInterventionRecordQualityIssueCode,
  isInterventionRecordQualityRepairCode,
  type Tier2InterventionRecordQualityIssueCode,
  type Tier2InterventionRecordQualityRepairCode,
} from "@bp/domain/documents/intervention-records";
import { toProjectJsonSchema } from "@bp/domain/json-schema";
import { PDFDocument } from "pdf-lib";
import * as z from "zod";
import { runLocalDbCommandBoundary } from "../../../effect/local-db-command.ts";
import { writeJson } from "../../../lib/json.ts";
import { defaultLocalPipelineDbPath, type OpenLocalPipelineDb } from "../../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../../lib/paths.ts";

// v1's lib/cli-args.js (kept inline; the FromCli parsers below still want it).
export type CliOption<T> = {
  flags: readonly string[];
  value?: boolean;
  apply: (output: T, value: string | undefined) => void;
};

export function parseCliOptions<T>(args: string[], output: T, options: readonly CliOption<T>[]): T {
  for (let index = 0; index < args.length; index += 1) {
    const a = args[index];
    if (a === undefined) {
      throw new Error("Unknown or incomplete argument: ");
    }
    const option = options.find((candidate) => candidate.flags.includes(a));
    if (option === undefined) {
      throw new Error(`Unknown or incomplete argument: ${a ?? ""}`);
    }
    if (option.value === false) {
      option.apply(output, undefined);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Unknown or incomplete argument: ${a ?? ""}`);
    }
    option.apply(output, value);
    index += 1;
  }
  return output;
}

export const trueOption = <T>(
  flags: readonly string[],
  applyTrue: (output: T) => void,
): CliOption<T> => ({
  flags,
  value: false,
  apply: (output) => {
    applyTrue(output);
  },
});

// v1's withLocalPipelineDb callback wrapper, kept local so the existing
// FromCli function bodies below don't need restructuring.
export async function withLocalPipelineDb<T>(
  path: string | undefined,
  useDb: (local: OpenLocalPipelineDb) => T | Promise<T>,
  options: { spatial?: boolean } = {},
): Promise<T> {
  return runLocalDbCommandBoundary({
    dbPath: path,
    localDbOptions: options,
    command: "docs.tier2.local-db",
    operation: "withLocalPipelineDb",
    spanAttributes: { spatial: options.spatial ?? false },
    run: async (local) => useDb(local),
  });
}

const TextExtractionStatusSchema = z.enum([
  "html_text",
  "pdf_text_layer",
  "ocr_required",
  "ocr_complete",
  "ocr_failed",
  "metadata_only",
]);
const CaptureStatusSchema = z.enum(["captured", "failed"]);
const ExpectedContentTypeSchema = z.enum(["html", "pdf", "json", "unknown"]);
const OcrHintSchema = z.enum(["not_needed", "possible", "required"]);

const Tier2BacklogSourceSchema = z.object({
  sourceId: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  url: z.string().url(),
  title: z.string().min(1),
  publisher: z.string().min(1),
  sourceGroup: z.string().min(1),
  intendedUse: z.array(z.string().min(1)).min(1),
  priority: z.number().int().min(1),
  documentDate: z.string().min(1).optional(),
  expectedContentType: ExpectedContentTypeSchema.default("unknown"),
  ocrHint: OcrHintSchema.default("possible"),
  termsNote: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

const Tier2BacklogSchema = z.object({
  version: z.number().int().min(1),
  updatedAt: z.string().min(1),
  sources: z.array(Tier2BacklogSourceSchema).min(1),
});

export type TextExtractionStatus = z.infer<typeof TextExtractionStatusSchema>;
export type CaptureStatus = z.infer<typeof CaptureStatusSchema>;
export type ExpectedContentType = z.infer<typeof ExpectedContentTypeSchema>;
export type OcrHint = z.infer<typeof OcrHintSchema>;
export type Tier2BacklogSource = z.infer<typeof Tier2BacklogSourceSchema>;
export type Tier2Backlog = z.infer<typeof Tier2BacklogSchema>;

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type Tier2CapturedSource = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceGroup: string;
  intendedUse: string[];
  priority: number;
  sourceUrl: string;
  finalUrl: string;
  documentDate: string | null;
  retrievedAt: string;
  captureStatus: CaptureStatus;
  httpStatus: number | null;
  contentType: string | null;
  detectedContentType: ExpectedContentType;
  byteLength: number;
  sha256: string | null;
  rawArtifactKey: string | null;
  textArtifactKey: string | null;
  textLength: number;
  textExtractionStatus: TextExtractionStatus;
  ocrHint: OcrHint;
  termsNote: string | null;
  error: string | null;
};

export type Tier2CaptureManifest = {
  version: 1;
  runId: string;
  generatedAt: string;
  backlogPath: string;
  artifactRoot: string;
  runArtifactRoot: string;
  summary: {
    sourceCount: number;
    capturedCount: number;
    failedCount: number;
    htmlTextCount: number;
    ocrRequiredCount: number;
    metadataOnlyCount: number;
    totalBytes: number;
  };
  sources: Tier2CapturedSource[];
};

export type Tier2OcrPlanSource = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceGroup: string;
  sourceUrl: string;
  finalUrl: string;
  rawArtifactKey: string;
  byteLength: number;
  sha256: string;
  pageRange: string;
  inputMode: "openrouter_pdf_file_or_rendered_pages";
  reviewState: "triage_ready" | "needs_page_range_review";
  nextAction: string;
};

export type Tier2OcrPlan = {
  version: 1;
  runId: string;
  generatedAt: string;
  captureManifestPath: string;
  outputPath: string | null;
  runtime: "pi-mono";
  provider: "openrouter";
  model: string;
  api: "chat.completions";
  summary: {
    ocrRequiredSourceCount: number;
    skippedSourceCount: number;
    totalBytes: number;
    totalMegabytes: number;
  };
  sources: Tier2OcrPlanSource[];
};

export type Tier2OcrPageInputPreference = "auto" | "pdf" | "image";

export type Tier2OcrPageMarkdownPage = {
  pageNumber: number;
  status: "prepared" | "ocr_complete" | "ocr_failed";
  reusedExisting: boolean;
  inputMode: "pdf_page" | "rendered_image";
  pagePdfArtifactKey: string | null;
  pagePdfByteLength: number;
  pagePdfSha256: string | null;
  renderArtifactKey: string | null;
  renderSha256: string | null;
  inputArtifactKey: string | null;
  inputMimeType: "application/pdf" | "image/png" | null;
  inputByteLength: number;
  inputSha256: string | null;
  httpStatus: number | null;
  requestedServiceTier: "flex" | "priority" | null;
  servedServiceTier: string | null;
  responseArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  markdownArtifactKey: string | null;
  annotationsArtifactKey: string | null;
  usage: unknown | null;
  markdownCharCount: number;
  containsTables: boolean | null;
  containsMaps: boolean | null;
  containsCharts: boolean | null;
  routesMentioned: string[];
  corridorsMentioned: string[];
  datesMentioned: string[];
  metricHints: string[];
  visualReviewHints: string[];
  error: string | null;
};

export type Tier2OcrPageMarkdownSource = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceGroup: string;
  sourceUrl: string;
  finalUrl: string;
  rawArtifactKey: string;
  pageRange: string;
  requestedPageLimit: number | null;
  allPages: boolean;
  pdfPageCount: number | null;
  selectedPageCount: number;
  selectedPages: number[];
  status: "prepared" | "ocr_complete" | "ocr_failed";
  reusedExistingCount: number;
  pageCount: number;
  ocrCompletePageCount: number;
  ocrFailedPageCount: number;
  pages: Tier2OcrPageMarkdownPage[];
  error: string | null;
};

export type Tier2OcrPageMarkdownManifest = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrPlanPath: string;
  captureManifestPath: string;
  outputPath: string | null;
  runtime: "pi-mono";
  provider: "openrouter" | "pioneer";
  model: string;
  api: "chat.completions";
  pdfEngine: "cloudflare-ai" | "mistral-ocr" | "native";
  serviceTier: "flex" | "priority";
  maxTokens: number;
  pageMarkdownRootName: string;
  promptVersion: string;
  pageInputPreference: Tier2OcrPageInputPreference;
  allPages: boolean;
  execute: boolean;
  pageLimit: number | null;
  pageConcurrency: number;
  summary: {
    plannedSourceCount: number;
    selectedSourceCount: number;
    preparedPageCount: number;
    ocrCompletePageCount: number;
    ocrFailedPageCount: number;
    reusedExistingPageCount: number;
    renderedImagePageCount: number;
    renderedPageArtifactCount: number;
    pdfPageInputCount: number;
    totalInputBytes: number;
    totalMarkdownChars: number;
  };
  sources: Tier2OcrPageMarkdownSource[];
};

export type Tier2OcrPageMarkdownAuditIssueCode =
  | "missing_page_markdown"
  | "missing_tool_call"
  | "missing_response"
  | "source_id_mismatch"
  | "page_number_mismatch"
  | "markdown_empty"
  | "markdown_short"
  | "visual_review_hint"
  | "contains_map"
  | "contains_chart"
  | "contains_table"
  | "ocr_error";

export type Tier2OcrPageMarkdownAuditPage = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceGroup: string;
  pageNumber: number;
  status: "ocr_complete" | "ocr_failed" | "missing";
  markdownArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  responseArtifactKey: string | null;
  errorArtifactKey: string | null;
  renderArtifactKey: string | null;
  inputArtifactKey: string | null;
  markdownCharCount: number;
  markdownBodyCharCount: number;
  containsTables: boolean | null;
  containsMaps: boolean | null;
  containsCharts: boolean | null;
  blankPageLikely: boolean;
  needsVisualReview: boolean;
  routesMentioned: string[];
  corridorsMentioned: string[];
  datesMentioned: string[];
  metricHints: string[];
  visualReviewHints: string[];
  issueCodes: Tier2OcrPageMarkdownAuditIssueCode[];
  error: string | null;
};

export type Tier2OcrPageMarkdownAuditSource = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceGroup: string;
  sourceUrl: string;
  pdfPageCount: number | null;
  pageCount: number;
  completePageCount: number;
  failedPageCount: number;
  missingPageCount: number;
  tablePageCount: number;
  mapPageCount: number;
  chartPageCount: number;
  likelyBlankPageCount: number;
  visualReviewPageCount: number;
  totalMarkdownChars: number;
  issueCounts: Record<Tier2OcrPageMarkdownAuditIssueCode, number>;
  pages: Tier2OcrPageMarkdownAuditPage[];
};

export type Tier2OcrPageMarkdownAudit = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrPlanPath: string;
  outputPath: string | null;
  pageMarkdownRootName: string;
  summary: {
    plannedSourceCount: number;
    sourceCount: number;
    pageCount: number;
    completePageCount: number;
    failedPageCount: number;
    missingPageCount: number;
    toolCallCount: number;
    responseCount: number;
    tablePageCount: number;
    mapPageCount: number;
    chartPageCount: number;
    likelyBlankPageCount: number;
    visualReviewPageCount: number;
    totalMarkdownChars: number;
    issueCounts: Record<Tier2OcrPageMarkdownAuditIssueCode, number>;
  };
  sources: Tier2OcrPageMarkdownAuditSource[];
};

export type Tier2OcrMarkdownCandidateWindow = {
  sourceId: string;
  pages: number[];
  status: "prepared" | "extracted" | "failed";
  reusedExisting: boolean;
  responseArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  candidateCount: number;
  usage: unknown | null;
  error: string | null;
};

export type Tier2OcrMarkdownCandidateExtraction = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  outputPath: string | null;
  provider: "openrouter";
  model: string;
  serviceTier: "flex" | "priority";
  maxTokens: number;
  pageMarkdownRootName: string;
  candidateRootName: string;
  promptVersion: string;
  execute: boolean;
  summary: {
    selectedSourceCount: number;
    windowCount: number;
    extractedWindowCount: number;
    failedWindowCount: number;
    reusedExistingWindowCount: number;
    candidateCount: number;
    candidateTypeCounts: Record<string, number>;
    candidateValidationStateCounts: Record<Tier2CandidateValidationState, number>;
    candidateQualityIssueCounts: Record<Tier2OcrMarkdownCandidateQualityIssueCode, number>;
    candidateQualityRepairCounts: Record<Tier2OcrMarkdownCandidateQualityRepairCode, number>;
  };
  windows: Tier2OcrMarkdownCandidateWindow[];
  documentEvidenceCandidates: Tier2DocumentEvidenceCandidate[];
};

export type Tier2OcrQualityIssueCode =
  | "not_started"
  | "ocr_failed"
  | "missing_triage_json"
  | "invalid_triage_json"
  | "source_id_mismatch"
  | "missing_annotations"
  | "missing_ocr_text"
  | "low_ocr_text_density"
  | "partial_or_poor_ocr"
  | "extract_no_intervention_family"
  | "extract_no_date"
  | "extract_no_corridor"
  | "extract_no_route"
  | "extract_no_useful_pages"
  | "manual_visual_review_hint";

export type Tier2OcrQualityReviewSource = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceGroup: string;
  sourceUrl: string;
  status: "not_started" | "prepared" | "ocr_complete" | "ocr_failed";
  ocrQuality: "good" | "partial" | "poor" | "unknown";
  decision: "extract" | "skip" | "needs_review" | "unknown";
  pagesReviewed: number[];
  usefulPages: number[];
  interventionFamilyCount: number;
  routeCount: number;
  corridorCount: number;
  dateCount: number;
  annotationTextBlockCount: number;
  annotationTextCharCount: number;
  annotationImageCount: number;
  textCharsPerReviewedPage: number | null;
  issueCodes: Tier2OcrQualityIssueCode[];
  reviewNotes: string | null;
};

export type Tier2OcrQualityReview = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrPlanPath: string;
  outputPath: string | null;
  triageRootName: string;
  summary: {
    plannedSourceCount: number;
    reviewedSourceCount: number;
    notStartedCount: number;
    ocrCompleteCount: number;
    ocrFailedCount: number;
    goodCount: number;
    partialCount: number;
    poorCount: number;
    unknownQualityCount: number;
    extractCount: number;
    skipCount: number;
    needsReviewCount: number;
    unknownDecisionCount: number;
    annotationTextSourceCount: number;
    missingAnnotationTextCount: number;
    totalAnnotationTextChars: number;
    averageTextCharsPerReviewedPage: number | null;
    issueCounts: Record<Tier2OcrQualityIssueCode, number>;
  };
  sources: Tier2OcrQualityReviewSource[];
};

export const OCR_MARKDOWN_CANDIDATE_QUALITY_ISSUE_CODES: readonly Tier2OcrMarkdownCandidateQualityIssueCode[] =
  [
    "evidence_quote_not_exact",
    "evidence_quote_spans_page_boundary",
    "evidence_quote_uses_ellipsis",
    "evidence_quote_flattened_table",
    "metric_value_numeric_not_supported_by_quote",
    "treatment_type_not_supported_by_quote",
    "treatment_candidate_without_supported_type",
    "service_change_candidate_without_change_type",
    "project_status_is_document_milestone",
    "project_status_spans_multiple_projects",
    "project_status_spans_multiple_statuses",
  ];

export const OCR_MARKDOWN_CANDIDATE_QUALITY_REPAIR_CODES: readonly Tier2OcrMarkdownCandidateQualityRepairCode[] =
  [
    "evidence_quote_repaired_to_source_substring",
    "evidence_page_refs_trimmed_to_quote_pages",
    "evidence_page_refs_repaired_to_window_quote_pages",
    "metric_value_numeric_removed_as_derived",
    "negative_evidence_flag_set_proposed_only",
    "negative_evidence_flag_set_presentation_date_not_implementation",
    "fact_classification_set_third_party_evaluation",
    "unsupported_treatment_types_removed",
    "unsupported_service_change_types_removed",
    "route_mentions_normalized",
  ];

export type Tier2DocumentSourceCandidate = {
  candidateType: "document_source_candidate";
  candidateId: string;
  sourceId: string;
  sourceUrl: string;
  finalUrl: string;
  title: string;
  publisher: string;
  sourceGroup: string;
  intendedUse: string[];
  priority: number;
  documentDate: string | null;
  retrievedAt: string | null;
  captureStatus: CaptureStatus | "planned_only";
  detectedContentType: ExpectedContentType;
  textExtractionStatus: TextExtractionStatus;
  contentSha256: string | null;
  rawArtifactKey: string | null;
  textArtifactKey: string | null;
  termsNote: string | null;
  validationState: Tier2CandidateValidationState;
};

export type Tier2DocumentChunk = {
  chunkId: string;
  sourceId: string;
  extractionMode: "html_text" | "ocr_annotation_text";
  artifactKey: string;
  pageRefs: number[];
  textHash: string;
  charLength: number;
  excerpt: string;
  text: string;
};

export type Tier2DocumentChunksArtifact = {
  version: 1;
  runId: string;
  generatedAt: string;
  candidateBundlePath: string;
  outputPath: string | null;
  summary: {
    sourceCount: number;
    chunkCount: number;
    htmlChunkCount: number;
    ocrChunkCount: number;
  };
  chunks: Tier2DocumentChunk[];
};

export type Tier2DocumentEntityLinkCandidate = {
  candidateType: "document_entity_link_candidate";
  candidateId: string;
  sourceRef: Tier2CandidateSourceRef;
  entityKind: "route" | "corridor" | "date" | "intervention_family";
  mentionText: string;
  linkerMethod: "ocr_triage_json";
  validationState: Tier2CandidateValidationState;
  reviewReason: string;
};

export type Tier2DocumentInterventionSeed = {
  candidateType: "document_intervention_seed";
  candidateId: string;
  sourceRef: Tier2CandidateSourceRef;
  interventionFamily: string;
  routeMentions: string[];
  corridorMentions: string[];
  dateMentions: string[];
  status: "candidate_from_ocr_triage";
  validationState: Tier2CandidateValidationState;
  reviewReason: string;
};

export type Tier2ReviewQuestionCandidate = {
  candidateType: "review_question_candidate";
  candidateId: string;
  sourceRef: Tier2CandidateSourceRef;
  priority: "high" | "medium" | "low";
  question: string;
  issueCodes: Tier2OcrQualityIssueCode[];
  validationState: Tier2CandidateValidationState;
};

export type Tier2FollowupOcrCandidate = {
  candidateType: "followup_ocr_candidate";
  candidateId: string;
  sourceRef: Tier2CandidateSourceRef;
  suggestedPageRange: string;
  reason: string;
  priority: "high" | "medium" | "low";
  validationState: Tier2CandidateValidationState;
};

export type Tier2LlmExtractionAudit = {
  candidateType: "llm_extraction_audit";
  candidateId: string;
  model: string;
  provider: "openrouter";
  serviceTier: string | null;
  extractionMode: "ocr_markdown_candidate_bundle";
  generatedAt: string;
  sourceCount: number;
  candidateCounts: Record<string, number>;
  validationSummary: Record<Tier2CandidateValidationState, number>;
};

export type Tier2CandidateBundle = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrPlanPath: string;
  outputPath: string | null;
  summary: {
    sourceCandidateCount: number;
    evidenceCandidateCount: number;
    reviewQuestionCandidateCount: number;
    followupOcrCandidateCount: number;
    auditCount: number;
    unvalidatedCandidateCount: number;
  };
  documentSourceCandidates: Tier2DocumentSourceCandidate[];
  documentEvidenceCandidates: Tier2DocumentEvidenceCandidate[];
  reviewQuestionCandidates: Tier2ReviewQuestionCandidate[];
  followupOcrCandidates: Tier2FollowupOcrCandidate[];
  llmExtractionAudits: Tier2LlmExtractionAudit[];
};

export type Tier2CanonicalInterventionEvent = {
  eventId: string;
  candidateId: string;
  sourceId: string;
  routeIds: string[];
  interventionType: string;
  implementationDate: string;
  implementationMonth: string;
  datePrecision: "day" | "month" | "year";
  eventStatus: "implemented" | "future";
  validationState: "validated";
  sourceSpanChunkIds: string[];
};

export type Tier2CanonicalInterventionEventsArtifact = {
  version: 1;
  runId: string;
  generatedAt: string;
  candidateValidationPath: string;
  outputPath: string | null;
  summary: {
    eventCount: number;
    routeEventCount: number;
    sourceCount: number;
  };
  events: Tier2CanonicalInterventionEvent[];
};

export type Tier2ManualInterventionEvidence = {
  evidenceId: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl?: string;
  artifactKey?: string;
  pageRefs: number[];
  chunkIds: string[];
  excerpt: string;
  supports: string[];
};

export type Tier2ManualInterventionComponent = {
  componentId: string;
  componentType: string;
  status: "implemented" | "planned" | "proposed" | "historical_context";
  description: string;
  extent: {
    corridor: string | null;
    from: string | null;
    to: string | null;
  };
  details: Record<string, unknown>;
  evidenceRefs: string[];
};

export type Tier2ManualInterventionCandidate = {
  candidateId: string;
  reviewState: "manual_curated";
  qualityTier:
    | "canonical_milestone"
    | "implemented_treatment_component"
    | "planned_or_proposed"
    | "historical_context"
    | "supporting_duplicate"
    | "defer";
  canonicalName: string;
  status: "implemented" | "planned" | "proposed" | "historical_context" | "defer";
  program: string;
  interventionType: string;
  implementationDate?: string;
  dateUnknownReason?: string;
  datePrecision?: "day" | "month" | "year";
  dateRole: string;
  dateRangeEnd?: string;
  routesAffected?: string[];
  routeUnknownReason?: string;
  routeRoles: Array<{ routeId: string; role: "affected" | "comparison" | "context" | "unknown" }>;
  location: {
    borough: string | null;
    corridor: string | null;
    from: string | null;
    to: string | null;
    directionality: string[];
    notes: string | null;
  };
  locationUnknownReason?: string;
  components: Tier2ManualInterventionComponent[];
  evidence: Tier2ManualInterventionEvidence[];
  sourceEventIds: string[];
  sourceCandidateIds: string[];
  disposition:
    | "curated"
    | "merged_as_support"
    | "split"
    | "planned_only"
    | "context_only"
    | "defer";
  review: {
    reviewer: string;
    reviewedAt: string;
    notes: string;
  };
};

export type Tier2ManualInterventionEventDisposition = {
  eventId: string;
  disposition:
    | "curated"
    | "merged_as_support"
    | "planned_only"
    | "context_only"
    | "duplicate"
    | "defer";
  candidateId?: string;
  reason: string;
};

export type Tier2ManualInterventionCandidatesArtifact = {
  version: 1;
  runId: string;
  generatedAt: string;
  reviewState: string;
  reviewedCluster: string;
  sourceArtifacts: Record<string, string>;
  summary: Record<string, number>;
  candidates: Tier2ManualInterventionCandidate[];
  eventDispositions?: Tier2ManualInterventionEventDisposition[];
  reviewLog: Array<{
    reviewedAt: string;
    reviewer: string;
    cluster: string;
    disposition: string;
    notes: string;
  }>;
};

export type VerifyTier2ManualInterventionsArgs = {
  manualInterventionsPath: string;
  canonicalEventsPath: string;
  candidateBundlePath: string;
  documentChunksPath: string;
  outputPath?: string;
  generatedAt?: string;
};

export type Tier2ManualInterventionVerification = {
  version: 1;
  runId: string;
  generatedAt: string;
  manualInterventionsPath: string;
  canonicalEventsPath: string;
  candidateBundlePath: string;
  documentChunksPath: string;
  outputPath: string | null;
  complete: boolean;
  summary: {
    candidateCount: number;
    completeCandidateCount: number;
    issueCount: number;
    canonicalMilestoneCount: number;
    implementedTreatmentComponentCount: number;
    plannedOrProposedCount: number;
    canonicalEventCount: number;
    eventDispositionCount: number;
    undispositionedEventCount: number;
  };
  candidateIssues: Array<{
    candidateId: string;
    issueCodes: string[];
  }>;
  eventDispositionIssues: Array<{
    eventId: string;
    issueCodes: string[];
  }>;
};

export type Tier2InterventionDuplicateGroup = {
  fingerprint: string;
  reviewState: "unique" | "duplicate_candidate";
  interventionType: string;
  implementationDate: string;
  datePrecision: "day" | "month" | "year";
  routeIds: string[];
  eventIds: string[];
  candidateIds: string[];
  sourceIds: string[];
  sourceSpanChunkIds: string[];
};

export type Tier2InterventionDuplicateAudit = {
  version: 1;
  runId: string;
  generatedAt: string;
  canonicalEventsPath: string;
  outputPath: string | null;
  summary: {
    eventCount: number;
    fingerprintCount: number;
    duplicateGroupCount: number;
    duplicateEventCount: number;
    uniqueEventCount: number;
    eventsNeedingReviewCount: number;
  };
  groups: Tier2InterventionDuplicateGroup[];
};

export type Tier2DuplicateReviewRecommendation =
  | "collapse_single_source_duplicates"
  | "compare_multi_source_duplicates";

export type Tier2DuplicateReviewEvent = {
  eventId: string;
  candidateId: string;
  sourceId: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  routeIds: string[];
  interventionType: string;
  implementationDate: string;
  datePrecision: "day" | "month" | "year";
  sourceSpanChunkIds: string[];
  routeMentions: string[];
  corridorMentions: string[];
  dateMentions: string[];
  interventionFamily: string | null;
};

export type Tier2DuplicateReviewItem = {
  fingerprint: string;
  recommendation: Tier2DuplicateReviewRecommendation;
  rationale: string;
  interventionType: string;
  implementationDate: string;
  datePrecision: "day" | "month" | "year";
  routeIds: string[];
  eventCount: number;
  candidateCount: number;
  sourceCount: number;
  sourceIds: string[];
  events: Tier2DuplicateReviewEvent[];
};

export type Tier2DuplicateReviewQueue = {
  version: 1;
  runId: string;
  generatedAt: string;
  canonicalEventsPath: string;
  duplicateAuditPath: string;
  candidateBundlePath: string;
  outputPath: string | null;
  summary: {
    duplicateGroupCount: number;
    duplicateEventCount: number;
    singleSourceGroupCount: number;
    multiSourceGroupCount: number;
  };
  items: Tier2DuplicateReviewItem[];
};

export type Tier2DuplicateDecision =
  | "needs_human_review"
  | "collapse_to_one_event"
  | "keep_separate_events";

export type Tier2DuplicateDecisionItem = {
  fingerprint: string;
  currentDecision: Tier2DuplicateDecision;
  suggestedDecision: Tier2DuplicateDecision;
  selectedEventId: string | null;
  eventIds: string[];
  sourceIds: string[];
  routeIds: string[];
  interventionType: string;
  implementationDate: string;
  datePrecision: "day" | "month" | "year";
  reviewer: string | null;
  reviewedAt: string | null;
  rationale: string;
};

export type Tier2DuplicateDecisionTemplate = {
  version: 1;
  runId: string;
  generatedAt: string;
  duplicateReviewPath: string;
  outputPath: string | null;
  summary: {
    duplicateGroupCount: number;
    duplicateEventCount: number;
    needsHumanReviewCount: number;
    collapseSuggestedCount: number;
    keepSeparateSuggestedCount: number;
  };
  decisions: Tier2DuplicateDecisionItem[];
};

export type Tier2DuplicateDecisionVerification = {
  version: 1;
  runId: string;
  generatedAt: string;
  duplicateDecisionsPath: string;
  outputPath: string | null;
  complete: boolean;
  summary: {
    decisionCount: number;
    duplicateEventCount: number;
    completeDecisionCount: number;
    incompleteDecisionCount: number;
    needsHumanReviewCount: number;
    collapseDecisionCount: number;
    keepSeparateDecisionCount: number;
    invalidCollapseSelectionCount: number;
    missingReviewerCount: number;
    missingReviewedAtCount: number;
    missingRationaleCount: number;
  };
  incompleteFingerprints: string[];
};

export type Tier2InterventionPromotionState =
  | "eligible_for_timeline"
  | "blocked_duplicate_review"
  | "suppressed_duplicate";

export type Tier2PipelineStatusGate = {
  gate: string;
  status: "complete" | "partial" | "blocked";
  evidence: string;
  remaining: string | null;
};

export type Tier2PipelineStatusArtifact = {
  version: 1;
  runId: string;
  generatedAt: string;
  outputPath: string | null;
  complete: boolean;
  summary: {
    sourceCandidateCount: number;
    evidenceCandidateCount: number;
    canonicalEventCount: number;
    eligibleTimelineEventCount: number;
    blockedDuplicateEventCount: number;
    suppressedDuplicateEventCount: number;
    completeDuplicateDecisionCount: number;
    incompleteDuplicateDecisionCount: number;
    duplicateDecisionComplete: boolean;
    followupOcrPlannedCount: number;
    followupOcrTop30CompletedCount: number;
    followupOcrLatestReviewPath: string | null;
    followupOcrReviewedCount: number;
    followupOcrCompletedCount: number;
    followupCandidateBundlePath: string | null;
    followupEvidenceCandidateCount: number;
    followupUnresolvedOcrSourceCount: number;
    studioTier2TimelineRowCount: number;
    studioTier2RowsMissingSourceLinks: number;
    studioTier2RowsMissingSourceSpanPreviews: number;
  };
  gates: Tier2PipelineStatusGate[];
};

export type Tier2InterventionStagingLoadReport = {
  version: 1;
  runId: string;
  generatedAt: string;
  canonicalEventsPath: string;
  duplicateAuditPath: string;
  candidateBundlePath: string;
  duplicateDecisionsPath: string | null;
  dbPath: string;
  outputPath: string | null;
  summary: {
    eventCount: number;
    routeEventCount: number;
    sourceSpanCount: number;
    eligibleForTimelineCount: number;
    blockedDuplicateReviewCount: number;
    suppressedDuplicateCount: number;
    completeDuplicateDecisionCount: number;
    incompleteDuplicateDecisionCount: number;
  };
};

export type Tier2DiscoveredSource = Tier2BacklogSource & {
  discovery: {
    href: string;
    anchorText: string;
    discoveredFromSourceId: string;
    discoveredFromUrl: string;
  };
};

export type Tier2ExcludedDiscoveryLink = {
  href: string;
  normalizedUrl: string | null;
  anchorText: string;
  discoveredFromSourceId: string;
  reason: string;
};

export type Tier2DiscoveryArtifact = {
  version: 1;
  runId: string;
  generatedAt: string;
  captureManifestPath: string;
  backlogPath: string;
  mergedBacklogPath: string | null;
  summary: {
    inputBacklogSourceCount: number;
    capturedHtmlSourceCount: number;
    extractedLinkCount: number;
    candidateLinkCount: number;
    newSourceCount: number;
    skippedExistingCount: number;
    excludedLinkCount: number;
    mergedBacklogSourceCount: number;
  };
  sources: Tier2DiscoveredSource[];
  excludedLinks: Tier2ExcludedDiscoveryLink[];
};

export type DiscoveryClassification =
  | {
      include: false;
      reason: string;
    }
  | {
      include: true;
      reason: string;
      sourceGroup: string;
      expectedContentType: ExpectedContentType;
      ocrHint: OcrHint;
      publisher: string;
      intendedUse: string[];
    };

export type CaptureTier2DocsArgs = {
  backlogPath?: string;
  artifactRoot?: string;
  runId?: string;
  fetchedAt?: string;
  fetcher?: FetchLike;
};

export type PlanTier2OcrArgs = {
  captureManifestPath: string;
  outputPath?: string;
  generatedAt?: string;
  model?: string;
  defaultPageRange?: string;
};

export type OcrTier2PageMarkdownArgs = {
  ocrPlanPath: string;
  outputPath?: string;
  generatedAt?: string;
  model?: string;
  provider?: Tier2OcrPageMarkdownManifest["provider"];
  pdfEngine?: Tier2OcrPageMarkdownManifest["pdfEngine"];
  serviceTier?: Tier2OcrPageMarkdownManifest["serviceTier"];
  maxTokens?: number;
  pageMarkdownRootName?: string;
  pageInputPreference?: Tier2OcrPageInputPreference;
  allPages?: boolean;
  pageRangeOverride?: string;
  pageConcurrency?: number;
  pageLimit?: number;
  limit?: number;
  sourceId?: string;
  execute?: boolean;
  fetcher?: FetchLike;
  apiKey?: string;
};

export type AuditTier2OcrPageMarkdownArgs = {
  ocrPlanPath: string;
  outputPath?: string;
  generatedAt?: string;
  pageMarkdownRootName?: string;
};

export type ExtractTier2OcrMarkdownCandidatesArgs = {
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  outputPath?: string;
  generatedAt?: string;
  pageMarkdownRootName?: string;
  candidateRootName?: string;
  model?: string;
  serviceTier?: Tier2OcrPageMarkdownManifest["serviceTier"];
  maxTokens?: number;
  sourceIds?: string[];
  limitSources?: number;
  pageWindowSize?: number;
  windowConcurrency?: number;
  execute?: boolean;
  fetcher?: FetchLike;
  apiKey?: string;
};

export type ExtractTier2CandidatesArgs = {
  ocrPlanPath: string;
  ocrQualityReviewPath: string;
  ocrMarkdownCandidateExtractionPath: string;
  outputPath?: string;
  generatedAt?: string;
  triageRootName?: string;
};

export type ChunkTier2DocumentsArgs = {
  candidateBundlePath: string;
  outputPath?: string;
  generatedAt?: string;
};

export type AuditTier2InterventionDuplicatesArgs = {
  canonicalEventsPath: string;
  outputPath?: string;
  generatedAt?: string;
};

export type BuildTier2DuplicateReviewQueueArgs = {
  canonicalEventsPath: string;
  duplicateAuditPath: string;
  candidateBundlePath: string;
  outputPath?: string;
  generatedAt?: string;
};

export type BuildTier2DuplicateDecisionTemplateArgs = {
  duplicateReviewPath: string;
  outputPath?: string;
  generatedAt?: string;
};

export type VerifyTier2DuplicateDecisionsArgs = {
  duplicateDecisionsPath: string;
  outputPath?: string;
  generatedAt?: string;
};

export type BuildTier2PipelineStatusArgs = {
  runId: string;
  artifactRoot: string;
  studioReleasePath: string;
  outputPath?: string;
  generatedAt?: string;
};

export type LoadTier2InterventionStagingArgs = {
  canonicalEventsPath: string;
  duplicateAuditPath: string;
  candidateBundlePath: string;
  duplicateDecisionsPath?: string;
  dbPath: string;
  outputPath?: string;
  generatedAt?: string;
};

export type PlanTier2FollowupOcrArgs = {
  candidateBundlePath: string;
  outputPath?: string;
  generatedAt?: string;
  limit?: number;
};

export type CaptureCliArgs = {
  backlogPath?: string;
  artifactRoot?: string;
  runId?: string;
};

export type OcrPlanCliArgs = {
  captureManifestPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  model?: string;
  defaultPageRange?: string;
};

type OcrReviewCliArgs = {
  ocrPlanPath?: string;
  ocrQualityReviewPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  triageRootName?: string;
};

export type ExtractCliArgs = OcrReviewCliArgs & {
  ocrMarkdownCandidateExtractionPath?: string;
};

export type OcrPageMarkdownAuditCliArgs = {
  ocrPlanPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  pageMarkdownRootName?: string;
};

export type OcrMarkdownCandidatesCliArgs = {
  ocrPlanPath?: string;
  pageMarkdownAuditPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  pageMarkdownRootName?: string;
  candidateRootName?: string;
  model?: string;
  serviceTier?: Tier2OcrPageMarkdownManifest["serviceTier"];
  maxTokens?: number;
  sourceIds?: string[];
  limitSources?: number;
  pageWindowSize?: number;
  windowConcurrency?: number;
  execute?: boolean;
};

export type ChunkCliArgs = {
  candidateBundlePath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

export type DuplicateAuditCliArgs = {
  canonicalEventsPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

export type DuplicateReviewCliArgs = {
  canonicalEventsPath?: string;
  duplicateAuditPath?: string;
  candidateBundlePath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

export type DuplicateDecisionTemplateCliArgs = {
  duplicateReviewPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

export type VerifyDuplicateDecisionsCliArgs = {
  duplicateDecisionsPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

export type PipelineStatusCliArgs = {
  artifactRoot?: string;
  runId?: string;
  studioReleasePath?: string;
  outputPath?: string;
};

export type VerifyManualInterventionsCliArgs = {
  manualInterventionsPath?: string;
  canonicalEventsPath?: string;
  candidateBundlePath?: string;
  documentChunksPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

export type LoadStagingCliArgs = {
  canonicalEventsPath?: string;
  duplicateAuditPath?: string;
  candidateBundlePath?: string;
  duplicateDecisionsPath?: string;
  dbPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

export type FollowupOcrPlanCliArgs = {
  candidateBundlePath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  limit?: number;
};

export type DiscoverTier2DocsArgs = {
  captureManifestPath: string;
  backlogPath?: string;
  outputPath?: string;
  mergedBacklogPath?: string;
  generatedAt?: string;
};

export type DiscoverCliArgs = {
  captureManifestPath?: string;
  backlogPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  mergedBacklogPath?: string;
};

export const DEFAULT_BACKLOG_PATH = fromRepoRoot("knowledge/raw/tier2_document_backlog.json");
export const DEFAULT_OCR_MODEL = "qwen/qwen3.7-max";
export const DEFAULT_OCR_MAX_TOKENS = 16384;
const DEFAULT_OCR_PAGE_MARKDOWN_ROOT_NAME = "ocr-page-markdown";
export const OCR_PAGE_MARKDOWN_TOOL_NAME = "record_tier2_ocr_page";
const OCR_MARKDOWN_CANDIDATE_TOOL_NAME = "record_tier2_ocr_markdown_candidates";
export const INTERVENTION_RECORDS_TOOL_NAME = "record_tier2_document_intervention_records";
const OCR_PAGE_MARKDOWN_PROMPT_VERSION = "page-markdown-v3";
const OCR_MARKDOWN_CANDIDATE_PROMPT_VERSION = "ocr-markdown-candidates-v4";
export const DEFAULT_TEXT_MODEL = "deepseek-v4-pro";
const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_OPENROUTER_MAX_ATTEMPTS = 3;
const DEFAULT_DEEPSEEK_MAX_ATTEMPTS = 3;

function docsArtifactRoot(artifactRoot: string): string {
  return join(artifactRoot, "docs");
}

export function runArtifactRoot(artifactRoot: string, runId: string): string {
  return join(docsArtifactRoot(artifactRoot), runId);
}

export function captureManifestPath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "capture-manifest.json");
}

export function ocrPlanPath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "ocr-plan.json");
}

export function ocrTriageManifestPath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "ocr-triage-manifest.json");
}

export function ocrQualityReviewPath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "ocr-quality-review.json");
}

export function candidateBundlePath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "candidate-bundle.json");
}

export function documentChunksPath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "document-chunks.json");
}

export function canonicalInterventionEventsPath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "tier2-intervention-events.json");
}

export function interventionDuplicateAuditPath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "tier2-intervention-duplicate-audit.json");
}

export function followupOcrPlanPath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "followup-ocr-plan.json");
}

export function discoveryPath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "discovery.json");
}

export function discoveredBacklogPath(artifactRoot: string, runId: string): string {
  return join(runArtifactRoot(artifactRoot, runId), "discovered-backlog.json");
}

export function createRunId(now = new Date()): string {
  return `docs-capture-${now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(/[:.]/g, "")}`;
}

export function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function artifactKey(absolutePath: string, root: string): string {
  return relative(root, absolutePath).split(/[\\/]/).join("/");
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function readRequiredJsonArtifact<T>(path: string): Promise<T> {
  return (await Bun.file(path).json()) as T;
}

export async function readJsonArtifactIfExistsForStatus<T>(path: string): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return (await file.json()) as T;
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtmlInline(html: string): string {
  return stripHtmlToText(html).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\dA-Za-z]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return slug.length === 0 ? "source" : slug.slice(0, 96).replace(/_+$/g, "");
}

export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectContentType(input: {
  contentType: string | null;
  expected: ExpectedContentType;
  finalUrl: string;
  bytes: Uint8Array;
}): ExpectedContentType {
  const normalized = input.contentType?.toLowerCase() ?? "";
  const urlPath = input.finalUrl.toLowerCase().split("?")[0] ?? "";
  const preview = decodeUtf8(input.bytes.slice(0, 128)).trimStart().toLowerCase();

  if (input.expected !== "unknown") {
    return input.expected;
  }
  if (
    normalized.includes("application/pdf") ||
    urlPath.endsWith(".pdf") ||
    preview.startsWith("%pdf")
  ) {
    return "pdf";
  }
  if (
    normalized.includes("text/html") ||
    preview.startsWith("<!doctype") ||
    preview.startsWith("<html")
  ) {
    return "html";
  }
  if (normalized.includes("application/json") || normalized.includes("+json")) {
    return "json";
  }

  return "unknown";
}

function extensionForContentType(contentType: ExpectedContentType): string {
  if (contentType === "pdf") {
    return "pdf";
  }
  if (contentType === "json") {
    return "json";
  }
  if (contentType === "html") {
    return "html";
  }
  return "bin";
}

function textExtractionStatusFor(
  source: Tier2BacklogSource,
  contentType: ExpectedContentType,
): TextExtractionStatus {
  if (contentType === "html") {
    return "html_text";
  }
  if (contentType === "pdf" && source.ocrHint !== "not_needed") {
    return "ocr_required";
  }
  return "metadata_only";
}

const PROJECT_FETCH_USER_AGENT = "BusPriorityImpactStudio/0.1 (+https://github.com/)";
const BROWSER_FETCH_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CURL_EFFECTIVE_URL_HEADER = "x-bp-effective-url";
const CURL_TRANSPORT_HEADER = "x-bp-fetch-transport";

function captureHeaders(input: {
  init: RequestInit | undefined;
  userAgent: string;
  browserNavigation: boolean;
}): Headers {
  const { init, userAgent, browserNavigation } = input;
  const headers = new Headers(init?.headers);
  headers.set(
    "Accept",
    browserNavigation
      ? "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
      : "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,application/json;q=0.8,*/*;q=0.7",
  );
  headers.set("Accept-Language", "en-US,en;q=0.9");
  headers.set("User-Agent", userAgent);
  if (browserNavigation) {
    headers.set("Cache-Control", "no-cache");
    headers.set("Pragma", "no-cache");
    headers.set("Sec-Fetch-Dest", "document");
    headers.set("Sec-Fetch-Mode", "navigate");
    headers.set("Sec-Fetch-Site", "none");
    headers.set("Sec-Fetch-User", "?1");
    headers.set("Upgrade-Insecure-Requests", "1");
  }
  return headers;
}

function captureRequestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function captureRequestMethod(
  input: string | URL | Request,
  init: RequestInit | undefined,
): string {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

function curlBrowserHeaderArgs(headers: Headers): string[] {
  const args: string[] = [];
  for (const [name, value] of headers) {
    args.push("-H", `${name}: ${value}`);
  }
  return args;
}

async function curlBrowserFetch(
  input: string | URL | Request,
  init: RequestInit | undefined,
): Promise<Response | null> {
  if (captureRequestMethod(input, init) !== "GET" || init?.body !== undefined) {
    return null;
  }
  if (!(await executableExists("curl"))) {
    return null;
  }

  const url = captureRequestUrl(input);
  const tmpRoot = await mkdtemp(join(tmpdir(), "bp-tier2-curl-fetch-"));
  const bodyPath = join(tmpRoot, "body.bin");
  const marker = "BP_TIER2_CURL_FETCH";
  const browserHeaders = captureHeaders({
    init,
    userAgent: BROWSER_FETCH_USER_AGENT,
    browserNavigation: true,
  });
  const args = [
    "-L",
    "-sS",
    "--connect-timeout",
    "20",
    "--max-time",
    "60",
    "-o",
    bodyPath,
    "-w",
    `\n${marker}_HTTP_CODE:%{http_code}\n${marker}_EFFECTIVE_URL:%{url_effective}\n${marker}_CONTENT_TYPE:%{content_type}\n`,
    ...curlBrowserHeaderArgs(browserHeaders),
    url,
  ];

  try {
    const proc = Bun.spawn(["curl", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if (exitCode !== 0) {
      return null;
    }

    const statusMatch = stdout.match(new RegExp(`${marker}_HTTP_CODE:(\\d{3})`));
    const effectiveUrlMatch = stdout.match(new RegExp(`${marker}_EFFECTIVE_URL:(.*)`));
    const contentTypeMatch = stdout.match(new RegExp(`${marker}_CONTENT_TYPE:(.*)`));
    const statusText = statusMatch?.[1];
    const status = statusText === undefined ? Number.NaN : Number.parseInt(statusText, 10);
    if (!Number.isInteger(status) || status < 200 || status > 599) {
      return null;
    }

    const bytes = await readFile(bodyPath);
    const responseHeaders = new Headers();
    const contentType = contentTypeMatch?.[1]?.trim();
    const effectiveUrl = effectiveUrlMatch?.[1]?.trim();
    if (contentType !== undefined && contentType.length > 0) {
      responseHeaders.set("content-type", contentType);
    }
    if (effectiveUrl !== undefined && effectiveUrl.length > 0) {
      responseHeaders.set(CURL_EFFECTIVE_URL_HEADER, effectiveUrl);
    }
    responseHeaders.set(CURL_TRANSPORT_HEADER, "curl");

    return new Response(bytes, {
      status,
      statusText: status >= 200 && status < 300 ? "OK" : "",
      headers: responseHeaders,
    });
  } catch {
    return null;
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

export async function defaultFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const primary = await fetch(input, {
    ...init,
    headers: captureHeaders({
      init,
      userAgent: PROJECT_FETCH_USER_AGENT,
      browserNavigation: false,
    }),
  });

  if (primary.status !== 403) {
    return primary;
  }

  const browser = await fetch(input, {
    ...init,
    headers: captureHeaders({
      init,
      userAgent: BROWSER_FETCH_USER_AGENT,
      browserNavigation: true,
    }),
  });
  if (browser.status !== 403) {
    return browser;
  }

  const curl = await curlBrowserFetch(input, init);
  return curl ?? browser;
}

export async function readBacklog(path: string): Promise<Tier2Backlog> {
  return Tier2BacklogSchema.parse(await Bun.file(path).json());
}

function normalizeDiscoveredUrl(href: string, baseUrl: string): string | null {
  const trimmedHref = decodeHtmlEntities(href);
  if (
    trimmedHref.length === 0 ||
    trimmedHref.startsWith("#") ||
    trimmedHref.startsWith("mailto:") ||
    trimmedHref.startsWith("tel:") ||
    trimmedHref.startsWith("javascript:")
  ) {
    return null;
  }

  try {
    const url = new URL(trimmedHref, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.hostname === "www1.nyc.gov") {
      url.hostname = "www.nyc.gov";
    }
    if (
      url.protocol === "http:" &&
      (url.hostname === "nyc.gov" ||
        url.hostname === "www.nyc.gov" ||
        url.hostname.endsWith(".mta.info") ||
        url.hostname === "mta.info")
    ) {
      url.protocol = "https:";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extractHtmlLinks(
  html: string,
  source: Tier2CapturedSource,
): {
  href: string;
  normalizedUrl: string | null;
  anchorText: string;
}[] {
  const links: {
    href: string;
    normalizedUrl: string | null;
    anchorText: string;
  }[] = [];
  const anchorRegex = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match = anchorRegex.exec(html);
  while (match !== null) {
    const href = match[2] ?? "";
    const anchorText = stripHtmlInline(match[3] ?? "");
    links.push({
      href,
      normalizedUrl: normalizeDiscoveredUrl(href, source.finalUrl),
      anchorText,
    });
    match = anchorRegex.exec(html);
  }
  return links;
}

function isIgnoredAssetUrl(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return /\.(css|js|jpg|jpeg|png|gif|svg|ico|webp|zip|csv|xlsx?)$/i.test(path);
}

function classifyDiscoveryCandidate(input: {
  url: string;
  anchorText: string;
}): DiscoveryClassification {
  const parsed = new URL(input.url);
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const text = input.anchorText.toLowerCase();
  const combined = `${path} ${text}`;

  if (isIgnoredAssetUrl(parsed)) {
    return { include: false, reason: "ignored_asset" };
  }

  const isNycDot =
    host === "www.nyc.gov" ||
    host === "nyc.gov" ||
    (host === "www1.nyc.gov" && path.includes("/html/dot/"));
  const isMta = host === "www.mta.info" || host === "mta.info" || host.endsWith(".mta.info");
  const isSocrata = host === "data.ny.gov" || host === "data.cityofnewyork.us";
  const isLinkedMonitoringReport =
    host === "www.tylin.com" && path.endsWith(".pdf") && combined.includes("14");

  if (!isNycDot && !isMta && !isSocrata && !isLinkedMonitoringReport) {
    return { include: false, reason: "outside_official_scope" };
  }

  let expectedContentType: ExpectedContentType = "unknown";
  let ocrHint: OcrHint = "possible";
  if (path.endsWith(".pdf")) {
    expectedContentType = "pdf";
    ocrHint = "required";
  } else if (path.endsWith(".json") || path.includes("/api/views/")) {
    expectedContentType = "json";
    ocrHint = "not_needed";
  } else if (path.endsWith(".shtml") || isMta || isNycDot) {
    expectedContentType = "html";
    ocrHint = "not_needed";
  }

  let publisher = "NYC DOT";
  if (isMta) {
    publisher = host === "capitaldashboard.mta.info" ? "MTA Capital Dashboard" : "MTA";
  } else if (host === "data.ny.gov") {
    publisher = "MTA Open Data";
  } else if (host === "data.cityofnewyork.us") {
    publisher = "NYC Open Data";
  } else if (isLinkedMonitoringReport) {
    publisher = "NYC DOT linked external report";
  }

  let sourceGroup = "bus_priority_document";
  if (combined.includes("automated-camera") || combined.includes("ace")) {
    sourceGroup = "ace_able";
  } else if (combined.includes("signal-priority") || combined.includes("tsp")) {
    sourceGroup = "transit_signal_priority";
  } else if (combined.includes("busway")) {
    sourceGroup = "busway";
  } else if (combined.includes("better-bus") || combined.includes("betterbuses")) {
    sourceGroup = "better_buses";
  } else if (combined.includes("redesign")) {
    sourceGroup = "route_redesign";
  } else if (combined.includes("capital")) {
    sourceGroup = "capital_projects";
  } else if (
    combined.includes("sbs") ||
    combined.includes("select bus") ||
    path.includes("/routes/")
  ) {
    sourceGroup = "select_bus_service";
  } else if (path.includes("/api/views/") || combined.includes("dataset")) {
    sourceGroup = "dataset_dictionary";
  }

  const pathIsRelevantNyc =
    path.includes("/html/brt/html/") ||
    path.includes("/html/dot/html/pr") ||
    path.includes("/html/dot/downloads/pdf/") ||
    path.includes("/html/brt/downloads/pdf/") ||
    path.includes("/34busway") ||
    path.includes("/tremontbusway");
  const pathIsRelevantMta =
    path.includes("/agency/new-york-city-transit/automated-camera-enforcement") ||
    path.includes("/press-release/") ||
    path.includes("/article/") ||
    path.includes("/document/") ||
    host === "capitaldashboard.mta.info";
  const pathIsRelevantSocrata = path.includes("/api/views/") || path.includes("/transportation/");

  if (
    !pathIsRelevantNyc &&
    !pathIsRelevantMta &&
    !pathIsRelevantSocrata &&
    !isLinkedMonitoringReport
  ) {
    return { include: false, reason: "outside_tier2_path_scope" };
  }

  if (
    path.includes("/home/") ||
    path.includes("/involved/") ||
    path.includes("/contact") ||
    path.includes("/privacy") ||
    path.includes("/accessibility")
  ) {
    return { include: false, reason: "navigation_or_policy_page" };
  }

  const intendedUseByGroup: Record<string, string[]> = {
    ace_able: ["ace_scope_context", "intervention_seed", "source_card"],
    transit_signal_priority: ["tsp_candidate", "route_link_candidate", "source_gap_candidate"],
    busway: ["busway_launch_candidate", "corridor_link_candidate", "route_link_candidate"],
    better_buses: ["bus_priority_project_context", "tsp_candidate", "stop_consolidation_candidate"],
    route_redesign: ["route_redesign_service_change", "route_alias_candidate", "source_card"],
    capital_projects: ["capital_project_milestone", "project_id_candidate", "source_card"],
    select_bus_service: ["sbs_launch_context", "route_link_candidate", "source_card"],
    dataset_dictionary: ["source_dictionary", "field_caveat", "validation_schema"],
    bus_priority_document: ["bus_priority_project_context", "source_gap_candidate", "source_card"],
  };

  return {
    include: true,
    reason: "tier2_candidate",
    sourceGroup,
    expectedContentType,
    ocrHint,
    publisher,
    intendedUse: intendedUseByGroup[sourceGroup] ?? [
      "bus_priority_project_context",
      "source_gap_candidate",
      "source_card",
    ],
  };
}

function titleFromUrl(url: string): string {
  const parsed = new URL(url);
  const pathname = decodeURIComponent(parsed.pathname);
  const basename = pathname.split("/").filter(Boolean).at(-1) ?? parsed.hostname;
  const stem = basename.replace(/\.(shtml|html|pdf|json)$/i, "");
  return stem
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferDocumentDate(url: string, anchorText: string): string | null {
  const combined = `${decodeURIComponent(new URL(url).pathname)} ${anchorText}`;
  const monthMap: Record<string, string> = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
  };
  const monthMatch = combined.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[-_ ]?(\d{4})\b/i,
  );
  if (monthMatch?.[1] !== undefined && monthMatch[2] !== undefined) {
    const month = monthMap[monthMatch[1].toLowerCase()];
    if (month !== undefined) {
      return `${monthMatch[2]}-${month}`;
    }
  }

  const yearMatch = combined.match(/\b(20\d{2})\b/);
  return yearMatch?.[1] ?? null;
}

function sourceIdForDiscovery(input: {
  url: string;
  sourceGroup: string;
  existingIds: Set<string>;
}): string {
  const parsed = new URL(input.url);
  const pathParts = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part).replace(/\.(shtml|html|pdf|json)$/i, ""));
  const stem =
    pathParts.length >= 2 &&
    ["routes", "other", "about", "busways", "betterbuses"].includes(pathParts.at(-2) ?? "")
      ? pathParts.slice(-2).join("_")
      : (pathParts.at(-1) ?? parsed.hostname);
  const prefix = parsed.hostname.includes("mta")
    ? "mta"
    : parsed.hostname.includes("data.cityofnewyork")
      ? "nyc_open_data"
      : parsed.hostname.includes("data.ny")
        ? "mta_open_data"
        : parsed.hostname.includes("tylin")
          ? "nyc_dot_linked"
          : "nyc_dot";
  const type = parsed.pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "page";
  const baseId = slugify(`${prefix}_${input.sourceGroup}_${type}_${stem}`);
  if (!input.existingIds.has(baseId)) {
    input.existingIds.add(baseId);
    return baseId;
  }

  const hashedId = `${baseId}_${shortHash(input.url)}`;
  input.existingIds.add(hashedId);
  return hashedId;
}

async function writeRawArtifacts(input: {
  runRoot: string;
  source: Tier2BacklogSource;
  detectedContentType: ExpectedContentType;
  bytes: Uint8Array;
}): Promise<{ rawArtifactKey: string; textArtifactKey: string | null; textLength: number }> {
  const sourceRoot = join(input.runRoot, "sources", input.source.sourceId);
  await mkdir(sourceRoot, { recursive: true });

  const rawPath = join(sourceRoot, `source.${extensionForContentType(input.detectedContentType)}`);
  await Bun.write(rawPath, input.bytes);

  if (input.detectedContentType !== "html") {
    return {
      rawArtifactKey: artifactKey(rawPath, input.runRoot),
      textArtifactKey: null,
      textLength: 0,
    };
  }

  const text = stripHtmlToText(decodeUtf8(input.bytes));
  const textPath = join(sourceRoot, "text.txt");
  await Bun.write(textPath, `${text}\n`);

  return {
    rawArtifactKey: artifactKey(rawPath, input.runRoot),
    textArtifactKey: artifactKey(textPath, input.runRoot),
    textLength: text.length,
  };
}

export async function writeSourceMetadata(
  runRoot: string,
  source: Tier2CapturedSource,
): Promise<void> {
  const sourceRoot = join(runRoot, "sources", source.sourceId);
  await mkdir(sourceRoot, { recursive: true });
  await writeJson(join(sourceRoot, "metadata.json"), source);
}

async function captureSource(input: {
  source: Tier2BacklogSource;
  fetcher: FetchLike;
  runRoot: string;
  retrievedAt: string;
}): Promise<Tier2CapturedSource> {
  const { source } = input;
  const base = {
    sourceId: source.sourceId,
    title: source.title,
    publisher: source.publisher,
    sourceGroup: source.sourceGroup,
    intendedUse: source.intendedUse,
    priority: source.priority,
    sourceUrl: source.url,
    documentDate: source.documentDate ?? null,
    retrievedAt: input.retrievedAt,
    ocrHint: source.ocrHint,
    termsNote: source.termsNote ?? null,
  };

  try {
    const response = await input.fetcher(source.url, { redirect: "follow" });
    const effectiveUrl = response.headers.get(CURL_EFFECTIVE_URL_HEADER);
    const finalUrl =
      effectiveUrl !== null && effectiveUrl.length > 0
        ? effectiveUrl
        : response.url.length > 0
          ? response.url
          : source.url;
    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      return {
        ...base,
        finalUrl,
        captureStatus: "failed",
        httpStatus: response.status,
        contentType,
        detectedContentType: source.expectedContentType,
        byteLength: 0,
        sha256: null,
        rawArtifactKey: null,
        textArtifactKey: null,
        textLength: 0,
        textExtractionStatus: "metadata_only",
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
      };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const detectedContentType = detectContentType({
      contentType,
      expected: source.expectedContentType,
      finalUrl,
      bytes,
    });
    const artifacts = await writeRawArtifacts({
      runRoot: input.runRoot,
      source,
      detectedContentType,
      bytes,
    });

    return {
      ...base,
      finalUrl,
      captureStatus: "captured",
      httpStatus: response.status,
      contentType,
      detectedContentType,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      rawArtifactKey: artifacts.rawArtifactKey,
      textArtifactKey: artifacts.textArtifactKey,
      textLength: artifacts.textLength,
      textExtractionStatus: textExtractionStatusFor(source, detectedContentType),
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      finalUrl: source.url,
      captureStatus: "failed",
      httpStatus: null,
      contentType: null,
      detectedContentType: source.expectedContentType,
      byteLength: 0,
      sha256: null,
      rawArtifactKey: null,
      textArtifactKey: null,
      textLength: 0,
      textExtractionStatus: "metadata_only",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function summarizeCapture(sources: Tier2CapturedSource[]): Tier2CaptureManifest["summary"] {
  return {
    sourceCount: sources.length,
    capturedCount: sources.filter((source) => source.captureStatus === "captured").length,
    failedCount: sources.filter((source) => source.captureStatus === "failed").length,
    htmlTextCount: sources.filter((source) => source.textExtractionStatus === "html_text").length,
    ocrRequiredCount: sources.filter((source) => source.textExtractionStatus === "ocr_required")
      .length,
    metadataOnlyCount: sources.filter((source) => source.textExtractionStatus === "metadata_only")
      .length,
    totalBytes: sources.reduce((sum, source) => sum + source.byteLength, 0),
  };
}

export async function captureTier2Docs(
  args: CaptureTier2DocsArgs = {},
): Promise<Tier2CaptureManifest> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? createRunId();
  const generatedAt = args.fetchedAt ?? new Date().toISOString();
  const backlogPath = args.backlogPath ?? DEFAULT_BACKLOG_PATH;
  const runRoot = runArtifactRoot(artifactRoot, runId);
  const backlog = await readBacklog(backlogPath);
  const fetcher = args.fetcher ?? defaultFetch;

  const sources: Tier2CapturedSource[] = [];
  for (const source of backlog.sources.toSorted((left, right) => left.priority - right.priority)) {
    const capturedSource = await captureSource({
      source,
      fetcher,
      runRoot,
      retrievedAt: generatedAt,
    });
    await writeSourceMetadata(runRoot, capturedSource);
    sources.push(capturedSource);
  }

  const manifest: Tier2CaptureManifest = {
    version: 1,
    runId,
    generatedAt,
    backlogPath,
    artifactRoot,
    runArtifactRoot: runRoot,
    summary: summarizeCapture(sources),
    sources,
  };

  const outputPath = captureManifestPath(artifactRoot, runId);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, manifest);
  return manifest;
}

function parseCaptureCliArgs(args: string[]): CaptureCliArgs {
  return parseCliOptions<CaptureCliArgs>(args, {}, [
    {
      flags: ["--backlog"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.backlogPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
  ]);
}

export function latestDocsRunId(artifactRoot = defaultArtifactRootPath()): Promise<string | null> {
  return readdir(docsArtifactRoot(artifactRoot), { withFileTypes: true })
    .then((entries) => {
      const runIds = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      return runIds.at(-1) ?? null;
    })
    .catch(() => null);
}

export async function captureTier2DocsFromCli(args: string[]): Promise<Tier2CaptureManifest> {
  return captureTier2Docs(parseCaptureCliArgs(args));
}

function parseDiscoverCliArgs(args: string[]): DiscoverCliArgs {
  const options: CliOption<DiscoverCliArgs>[] = [
    {
      flags: ["--capture-manifest"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.captureManifestPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--backlog"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.backlogPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--merged-backlog"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.mergedBacklogPath = fromCliPath(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

function backlogSourceFromDiscovered(source: Tier2DiscoveredSource): Tier2BacklogSource {
  const backlogSource: Tier2BacklogSource = {
    sourceId: source.sourceId,
    url: source.url,
    title: source.title,
    publisher: source.publisher,
    sourceGroup: source.sourceGroup,
    intendedUse: source.intendedUse,
    priority: source.priority,
    expectedContentType: source.expectedContentType,
    ocrHint: source.ocrHint,
    termsNote: source.termsNote,
    notes: source.notes,
  };
  if (source.documentDate !== undefined) {
    backlogSource.documentDate = source.documentDate;
  }
  return backlogSource;
}

function buildDiscoveredSource(input: {
  url: string;
  href: string;
  anchorText: string;
  discoveredFromSource: Tier2CapturedSource;
  classification: Extract<DiscoveryClassification, { include: true }>;
  existingIds: Set<string>;
  priority: number;
}): Tier2DiscoveredSource {
  const title = input.anchorText.length > 0 ? input.anchorText : titleFromUrl(input.url);
  const source: Tier2BacklogSource = {
    sourceId: sourceIdForDiscovery({
      url: input.url,
      sourceGroup: input.classification.sourceGroup ?? "bus_priority_document",
      existingIds: input.existingIds,
    }),
    url: input.url,
    title,
    publisher: input.classification.publisher ?? "Unknown",
    sourceGroup: input.classification.sourceGroup ?? "bus_priority_document",
    intendedUse: input.classification.intendedUse ?? ["source_card"],
    priority: input.priority,
    expectedContentType: input.classification.expectedContentType ?? "unknown",
    ocrHint: input.classification.ocrHint ?? "possible",
    termsNote:
      input.classification.expectedContentType === "pdf"
        ? "Discovered official or officially linked PDF; OCR/text output must stay in ignored artifacts until reviewed."
        : "Discovered official public page or metadata endpoint; use short excerpts and source links in public artifacts.",
    notes: `Discovered from ${input.discoveredFromSource.sourceId}.`,
  };
  const documentDate = inferDocumentDate(input.url, title);
  if (documentDate !== null) {
    source.documentDate = documentDate;
  }

  return {
    ...source,
    discovery: {
      href: input.href,
      anchorText: title,
      discoveredFromSourceId: input.discoveredFromSource.sourceId,
      discoveredFromUrl: input.discoveredFromSource.finalUrl,
    },
  };
}

export async function discoverTier2Docs(
  args: DiscoverTier2DocsArgs,
): Promise<Tier2DiscoveryArtifact> {
  const manifest = (await Bun.file(args.captureManifestPath).json()) as Tier2CaptureManifest;
  const backlogPath = args.backlogPath ?? manifest.backlogPath ?? DEFAULT_BACKLOG_PATH;
  const backlog = await readBacklog(backlogPath);
  const existingUrls = new Set(
    backlog.sources.map((source) => normalizeDiscoveredUrl(source.url, source.url) ?? source.url),
  );
  const existingIds = new Set(backlog.sources.map((source) => source.sourceId));
  const candidateUrls = new Set<string>();
  const discoveredSources: Tier2DiscoveredSource[] = [];
  const excludedLinks: Tier2ExcludedDiscoveryLink[] = [];
  let extractedLinkCount = 0;
  let candidateLinkCount = 0;
  let skippedExistingCount = 0;
  let priority = Math.max(...backlog.sources.map((source) => source.priority), 0) + 1;

  const capturedHtmlSources = manifest.sources.filter(
    (source) =>
      source.captureStatus === "captured" &&
      source.detectedContentType === "html" &&
      source.rawArtifactKey !== null,
  );

  for (const source of capturedHtmlSources) {
    if (source.rawArtifactKey === null) {
      continue;
    }
    const html = await Bun.file(join(manifest.runArtifactRoot, source.rawArtifactKey)).text();
    const links = extractHtmlLinks(html, source);
    extractedLinkCount += links.length;

    for (const link of links) {
      if (link.normalizedUrl === null) {
        excludedLinks.push({
          href: link.href,
          normalizedUrl: null,
          anchorText: link.anchorText,
          discoveredFromSourceId: source.sourceId,
          reason: "unparseable_or_non_http_link",
        });
        continue;
      }

      const classification = classifyDiscoveryCandidate({
        url: link.normalizedUrl,
        anchorText: link.anchorText,
      });
      if (!classification.include) {
        excludedLinks.push({
          href: link.href,
          normalizedUrl: link.normalizedUrl,
          anchorText: link.anchorText,
          discoveredFromSourceId: source.sourceId,
          reason: classification.reason,
        });
        continue;
      }

      candidateLinkCount += 1;
      if (existingUrls.has(link.normalizedUrl) || candidateUrls.has(link.normalizedUrl)) {
        skippedExistingCount += 1;
        continue;
      }

      candidateUrls.add(link.normalizedUrl);
      discoveredSources.push(
        buildDiscoveredSource({
          url: link.normalizedUrl,
          href: link.href,
          anchorText: link.anchorText,
          discoveredFromSource: source,
          classification,
          existingIds,
          priority,
        }),
      );
      priority += 1;
    }
  }

  const mergedBacklog: Tier2Backlog = {
    version: 1,
    updatedAt: (args.generatedAt ?? new Date().toISOString()).slice(0, 10),
    sources: [
      ...backlog.sources,
      ...discoveredSources.map((source) => backlogSourceFromDiscovered(source)),
    ].toSorted(
      (left, right) =>
        left.priority - right.priority || left.sourceId.localeCompare(right.sourceId),
    ),
  };

  const artifact: Tier2DiscoveryArtifact = {
    version: 1,
    runId: manifest.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    captureManifestPath: args.captureManifestPath,
    backlogPath,
    mergedBacklogPath: args.mergedBacklogPath ?? null,
    summary: {
      inputBacklogSourceCount: backlog.sources.length,
      capturedHtmlSourceCount: capturedHtmlSources.length,
      extractedLinkCount,
      candidateLinkCount,
      newSourceCount: discoveredSources.length,
      skippedExistingCount,
      excludedLinkCount: excludedLinks.length,
      mergedBacklogSourceCount: mergedBacklog.sources.length,
    },
    sources: discoveredSources,
    excludedLinks,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }
  if (args.mergedBacklogPath !== undefined) {
    await mkdir(dirname(args.mergedBacklogPath), { recursive: true });
    await writeJson(args.mergedBacklogPath, mergedBacklog);
  }

  return artifact;
}

async function resolveDiscoverPaths(args: DiscoverCliArgs): Promise<{
  captureManifestPath: string;
  outputPath: string;
  mergedBacklogPath: string;
}> {
  if (args.captureManifestPath !== undefined) {
    return {
      captureManifestPath: args.captureManifestPath,
      outputPath: args.outputPath ?? join(dirname(args.captureManifestPath), "discovery.json"),
      mergedBacklogPath:
        args.mergedBacklogPath ??
        join(dirname(args.captureManifestPath), "discovered-backlog.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --capture-manifest.");
  }

  return {
    captureManifestPath: captureManifestPath(artifactRoot, runId),
    outputPath: args.outputPath ?? discoveryPath(artifactRoot, runId),
    mergedBacklogPath: args.mergedBacklogPath ?? discoveredBacklogPath(artifactRoot, runId),
  };
}

export async function discoverTier2DocsFromCli(args: string[]): Promise<Tier2DiscoveryArtifact> {
  const parsed = parseDiscoverCliArgs(args);
  const paths = await resolveDiscoverPaths(parsed);
  return discoverTier2Docs({
    ...paths,
    ...(parsed.backlogPath !== undefined ? { backlogPath: parsed.backlogPath } : {}),
  });
}

function parseOcrPlanCliArgs(args: string[]): OcrPlanCliArgs {
  const options: CliOption<OcrPlanCliArgs>[] = [
    {
      flags: ["--capture-manifest"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.captureManifestPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--model"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.model = value;
        }
      },
    },
    {
      flags: ["--default-page-range"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.defaultPageRange = value;
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

function ensureCapturedOcrSource(source: Tier2CapturedSource): Tier2OcrPlanSource | null {
  if (
    source.captureStatus !== "captured" ||
    source.textExtractionStatus !== "ocr_required" ||
    source.rawArtifactKey === null ||
    source.sha256 === null
  ) {
    return null;
  }

  return {
    sourceId: source.sourceId,
    title: source.title,
    publisher: source.publisher,
    sourceGroup: source.sourceGroup,
    sourceUrl: source.sourceUrl,
    finalUrl: source.finalUrl,
    rawArtifactKey: source.rawArtifactKey,
    byteLength: source.byteLength,
    sha256: source.sha256,
    pageRange: "1-10",
    inputMode: "openrouter_pdf_file_or_rendered_pages",
    reviewState: "triage_ready",
    nextAction:
      "Run docs:ocr for first-10-page triage, then promote useful pages to focused extraction.",
  };
}

export async function planTier2Ocr(args: PlanTier2OcrArgs): Promise<Tier2OcrPlan> {
  const manifest = (await Bun.file(args.captureManifestPath).json()) as Tier2CaptureManifest;
  const model = args.model ?? process.env["OPENROUTER_OCR_MODEL"] ?? DEFAULT_OCR_MODEL;
  const manifestRunRoot = dirname(args.captureManifestPath);
  const sourcesAsync = await Promise.all(
    manifest.sources.map(async (source) => {
      const plannedSource = ensureCapturedOcrSource(source);
      if (plannedSource === null) {
        return null;
      }
      if (args.defaultPageRange !== undefined) {
        return { ...plannedSource, pageRange: args.defaultPageRange };
      }
      const pageCount = await pdfInfoPageCount(join(manifestRunRoot, plannedSource.rawArtifactKey));
      const pageRange = pageCount === null ? "1-9999" : `1-${pageCount}`;
      return { ...plannedSource, pageRange };
    }),
  );
  const sources = sourcesAsync.filter((source): source is Tier2OcrPlanSource => source !== null);
  const totalBytes = sources.reduce((sum, source) => sum + source.byteLength, 0);

  const plan: Tier2OcrPlan = {
    version: 1,
    runId: manifest.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    captureManifestPath: args.captureManifestPath,
    outputPath: args.outputPath ?? null,
    runtime: "pi-mono",
    provider: "openrouter",
    model,
    api: "chat.completions",
    summary: {
      ocrRequiredSourceCount: sources.length,
      skippedSourceCount: manifest.sources.length - sources.length,
      totalBytes,
      totalMegabytes: Number((totalBytes / 1_000_000).toFixed(3)),
    },
    sources,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, plan);
  }

  return plan;
}

async function resolveOcrPlanPaths(args: OcrPlanCliArgs): Promise<{
  captureManifestPath: string;
  outputPath: string;
}> {
  if (args.captureManifestPath !== undefined) {
    return {
      captureManifestPath: args.captureManifestPath,
      outputPath: args.outputPath ?? join(dirname(args.captureManifestPath), "ocr-plan.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --capture-manifest.");
  }

  return {
    captureManifestPath: captureManifestPath(artifactRoot, runId),
    outputPath: args.outputPath ?? ocrPlanPath(artifactRoot, runId),
  };
}

export async function planTier2OcrFromCli(args: string[]): Promise<Tier2OcrPlan> {
  const parsed = parseOcrPlanCliArgs(args);
  const paths = await resolveOcrPlanPaths(parsed);
  const planArgs: PlanTier2OcrArgs = { ...paths };
  if (parsed.model !== undefined) {
    planArgs.model = parsed.model;
  }
  if (parsed.defaultPageRange !== undefined) {
    planArgs.defaultPageRange = parsed.defaultPageRange;
  }
  return planTier2Ocr(planArgs);
}

function parsePageRange(range: string, pageCount: number): number[] {
  if (pageCount < 1) {
    return [];
  }
  if (range === "all") {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const selected = new Set<number>();
  for (const rawPart of range.split(",")) {
    const part = rawPart.trim();
    if (part.length === 0) {
      continue;
    }
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (match === null || match[1] === undefined) {
      throw new Error(`Unsupported OCR page range: ${range}`);
    }
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      throw new Error(`Invalid OCR page range: ${range}`);
    }
    for (let page = start; page <= Math.min(end, pageCount); page += 1) {
      selected.add(page - 1);
    }
  }

  return [...selected].toSorted((left, right) => left - right);
}

export function normalizeOcrArtifactRootName(input: {
  value: string | undefined;
  defaultName: string;
  flagName: string;
}): string {
  const rootName = input.value ?? input.defaultName;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(rootName)) {
    throw new Error(
      `${input.flagName} must use lowercase letters, numbers, dashes, or underscores.`,
    );
  }
  return rootName;
}

export function normalizeOcrPageMarkdownRootName(value: string | undefined): string {
  return normalizeOcrArtifactRootName({
    value,
    defaultName: DEFAULT_OCR_PAGE_MARKDOWN_ROOT_NAME,
    flagName: "--triage-root",
  });
}

export function ocrPageMarkdownSourceRoot(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  pageMarkdownRootName?: string;
}): string {
  return join(
    input.runRoot,
    normalizeOcrPageMarkdownRootName(input.pageMarkdownRootName),
    "sources",
    `${String(input.sourceIndex + 1).padStart(4, "0")}_${input.source.sourceId}`,
  );
}

export async function executableExists(command: string): Promise<boolean> {
  const proc = Bun.spawn(["which", command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  return exitCode === 0;
}

export async function pdfInfoPageCount(pdfPath: string): Promise<number | null> {
  if (!(await executableExists("pdfinfo"))) {
    return null;
  }
  const proc = Bun.spawn(["pdfinfo", pdfPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  if (exitCode !== 0) {
    return null;
  }
  const match = stdout.match(/^Pages:\s+(\d+)\s*$/m);
  if (match === null) {
    return null;
  }
  const pageCountText = match[1];
  if (pageCountText === undefined) {
    return null;
  }
  const pageCount = Number.parseInt(pageCountText, 10);
  return Number.isFinite(pageCount) && pageCount > 0 ? pageCount : null;
}

async function pdfPageCountWithFallback(pdfPath: string): Promise<number | null> {
  const fromPdfInfo = await pdfInfoPageCount(pdfPath);
  if (fromPdfInfo !== null) return fromPdfInfo;

  try {
    const bytes = new Uint8Array(await Bun.file(pdfPath).arrayBuffer());
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pageCount = pdf.getPageCount();
    return Number.isInteger(pageCount) && pageCount > 0 ? pageCount : null;
  } catch {
    return null;
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("--page-concurrency must be a positive integer.");
  }
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const itemIndex = nextIndex;
        nextIndex += 1;
        if (itemIndex >= items.length) {
          return;
        }
        const item = items[itemIndex];
        if (item === undefined) {
          continue;
        }
        results[itemIndex] = await mapper(item, itemIndex);
      }
    }),
  );
  return results;
}

async function renderPdfPageToPng(input: {
  pdfPath: string;
  outputDir: string;
  pageNumber: number;
  renderPageNumber: number;
}): Promise<{ artifactPath: string; byteLength: number; sha256: string } | null> {
  if (!(await executableExists("pdftoppm"))) {
    return null;
  }
  const prefix = join(input.outputDir, `page-${String(input.pageNumber).padStart(4, "0")}-render`);
  const proc = Bun.spawn(
    [
      "pdftoppm",
      "-f",
      String(input.renderPageNumber),
      "-l",
      String(input.renderPageNumber),
      "-r",
      "180",
      "-png",
      input.pdfPath,
      prefix,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  if (exitCode !== 0) {
    throw new Error(`pdftoppm failed for page ${input.pageNumber}: ${stderr.trim()}`);
  }
  const outputNames = (await readdir(input.outputDir)).filter(
    (name) => name.startsWith(`${basename(prefix)}-`) && name.endsWith(".png"),
  );
  const outputName = outputNames.length === 1 ? outputNames[0] : undefined;
  const outputPath = outputName === undefined ? null : join(input.outputDir, outputName);
  if (outputPath === null) {
    throw new Error(`pdftoppm did not produce exactly one PNG for page ${input.pageNumber}.`);
  }
  const bytes = new Uint8Array(await Bun.file(outputPath).arrayBuffer());
  return {
    artifactPath: outputPath,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

async function preparePageMarkdownInputs(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  pageMarkdownRootName: string;
  pageLimit: number | null;
  allPages: boolean;
  pageRange: string;
  pageRangeOverride: string | undefined;
  pageInputPreference: Tier2OcrPageInputPreference;
  model: string;
}): Promise<{
  pdfPageCount: number;
  selectedPages: number[];
  pages: Array<{
    pageNumber: number;
    pageRoot: string;
    pagePdfPath: string | null;
    pagePdfArtifactKey: string | null;
    pagePdfByteLength: number;
    pagePdfSha256: string | null;
    inputPath: string;
    inputArtifactKey: string;
    inputMimeType: "application/pdf" | "image/png";
    inputMode: Tier2OcrPageMarkdownPage["inputMode"];
    inputByteLength: number;
    inputSha256: string;
    renderArtifactKey: string | null;
    renderSha256: string | null;
  }>;
}> {
  const rawPath = join(input.runRoot, input.source.rawArtifactKey);
  const shouldUseRenderedImageInput =
    input.pageInputPreference === "image" ||
    (input.pageInputPreference === "auto" && supportsRenderedImageOcrInput(input.model));
  const renderAvailable = shouldUseRenderedImageInput ? await executableExists("pdftoppm") : false;
  if (input.pageInputPreference === "image" && !renderAvailable) {
    throw new Error("PDF page image rendering requested, but pdftoppm is not available.");
  }

  let rawBytes: Uint8Array | null = null;
  let pdf: PDFDocument | null = null;
  let pdfPageCount =
    shouldUseRenderedImageInput && renderAvailable ? await pdfInfoPageCount(rawPath) : null;
  if (pdfPageCount === null) {
    try {
      rawBytes = new Uint8Array(await Bun.file(rawPath).arrayBuffer());
      pdf = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
      pdfPageCount = pdf.getPageCount();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to determine PDF page count for ${input.source.sourceId}: ${detail}`);
    }
  }
  const selectedPageIndexes = input.allPages
    ? parsePageRange("all", pdfPageCount)
    : parsePageRange(input.pageRangeOverride ?? input.pageRange, pdfPageCount).slice(
        0,
        input.pageLimit ?? pdfPageCount,
      );
  if (selectedPageIndexes.length === 0) {
    throw new Error(`No pages selected for ${input.source.sourceId}.`);
  }

  const sourceRoot = ocrPageMarkdownSourceRoot(input);
  const preparedPages: Array<{
    pageNumber: number;
    pageRoot: string;
    pagePdfPath: string | null;
    pagePdfArtifactKey: string | null;
    pagePdfByteLength: number;
    pagePdfSha256: string | null;
    inputPath: string;
    inputArtifactKey: string;
    inputMimeType: "application/pdf" | "image/png";
    inputMode: Tier2OcrPageMarkdownPage["inputMode"];
    inputByteLength: number;
    inputSha256: string;
    renderArtifactKey: string | null;
    renderSha256: string | null;
  }> = [];
  for (const pageIndex of selectedPageIndexes) {
    const pageNumber = pageIndex + 1;
    const pageRoot = join(sourceRoot, "pages", String(pageNumber).padStart(4, "0"));
    await mkdir(pageRoot, { recursive: true });
    let pagePdfPath: string | null = null;
    let pagePdfArtifactKey: string | null = null;
    let pagePdfByteLength = 0;
    let pagePdfSha256: string | null = null;
    let inputPath: string;
    let inputArtifactKey: string;
    let inputMimeType: "application/pdf" | "image/png";
    let inputMode: Tier2OcrPageMarkdownPage["inputMode"];
    let inputByteLength: number;
    let inputSha256: string;
    let renderArtifactKey: string | null = null;
    let renderSha256: string | null = null;

    if (shouldUseRenderedImageInput && renderAvailable) {
      const rendered = await renderPdfPageToPng({
        pdfPath: rawPath,
        outputDir: pageRoot,
        pageNumber,
        renderPageNumber: pageNumber,
      });
      if (rendered === null) {
        throw new Error("PDF page image rendering requested, but pdftoppm is not available.");
      }
      const renderedArtifactKey = artifactKey(rendered.artifactPath, input.runRoot);
      renderArtifactKey = renderedArtifactKey;
      renderSha256 = rendered.sha256;
      inputPath = rendered.artifactPath;
      inputArtifactKey = renderedArtifactKey;
      inputMimeType = "image/png";
      inputMode = "rendered_image";
      inputByteLength = rendered.byteLength;
      inputSha256 = rendered.sha256;
    } else {
      if (pdf === null) {
        rawBytes ??= new Uint8Array(await Bun.file(rawPath).arrayBuffer());
        pdf = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
      }
      const pagePdf = await PDFDocument.create();
      const [copiedPage] = await pagePdf.copyPages(pdf, [pageIndex]);
      if (copiedPage === undefined) {
        throw new Error(`Unable to copy page ${pageNumber} from ${input.source.sourceId}.`);
      }
      pagePdf.addPage(copiedPage);
      const pagePdfBytes = await pagePdf.save();
      pagePdfPath = join(pageRoot, "input-page.pdf");
      await Bun.write(pagePdfPath, pagePdfBytes);
      pagePdfArtifactKey = artifactKey(pagePdfPath, input.runRoot);
      pagePdfByteLength = pagePdfBytes.byteLength;
      pagePdfSha256 = sha256(pagePdfBytes);
      inputPath = pagePdfPath;
      inputArtifactKey = pagePdfArtifactKey;
      inputMimeType = "application/pdf";
      inputMode = "pdf_page";
      inputByteLength = pagePdfBytes.byteLength;
      inputSha256 = pagePdfSha256;
    }

    preparedPages.push({
      pageNumber,
      pageRoot,
      pagePdfPath,
      pagePdfArtifactKey,
      pagePdfByteLength,
      pagePdfSha256,
      inputPath,
      inputArtifactKey,
      inputMimeType,
      inputMode,
      inputByteLength,
      inputSha256,
      renderArtifactKey,
      renderSha256,
    });
  }

  return {
    pdfPageCount,
    selectedPages: selectedPageIndexes.map((pageIndex) => pageIndex + 1),
    pages: preparedPages,
  };
}

function buildOcrPageMarkdownPrompt(input: {
  source: Tier2OcrPlanSource;
  pageNumber: number;
  pdfPageCount: number;
}): string {
  return [
    "You are doing page-level OCR for Bus Priority Impact Studio.",
    "Convert only the attached page image to a complete, faithful GitHub-flavored Markdown transcription. The markdown field must not be title-only.",
    "Read the page top-to-bottom and include every visible heading, paragraph sentence, bullet/list item, footnote, chart title, chart axis label, legend label, and readable numeric value.",
    "Use Markdown tables when the page has tables.",
    "If a chart or figure contains readable labels and numeric values, transcribe the chart title and visible values into a Markdown table near the chart position. Do not put chart values only in image alt text.",
    "Use image placeholders only for non-textual visual content that cannot be represented as text or a table.",
    "Ignore repeated slide footers, page numbers, and decorative artifacts unless they carry source meaning. Never repeat the same visible footer or page number more than once.",
    "Use normal Markdown line breaks and sections. Do not collapse the whole page into one paragraph.",
    "Do not summarize, reinterpret, or add facts that are not visible on the page. Mark unreadable text as [unclear].",
    `You must call the ${OCR_PAGE_MARKDOWN_TOOL_NAME} tool. Put the full Markdown transcription in the markdown field.`,
    `In the tool call, pageNumber must be exactly ${input.pageNumber}. This is the PDF page ordinal supplied by the pipeline; do not replace it with a printed page number visible on the document.`,
    "Use the hint fields only for indexing and later search. Do not include pipeline metadata or YAML frontmatter; the host pipeline will add that.",
    "",
    `Source ID: ${input.source.sourceId}`,
    `Title: ${input.source.title}`,
    `Publisher: ${input.source.publisher}`,
    `Source group: ${input.source.sourceGroup}`,
    `Page: ${input.pageNumber} of ${input.pdfPageCount}`,
  ].join("\n");
}

function ocrPageMarkdownTool(): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: OCR_PAGE_MARKDOWN_TOOL_NAME,
      description:
        "Record a faithful page-level Markdown OCR transcription plus lightweight indexing hints.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: [
          "sourceId",
          "pageNumber",
          "markdown",
          "routesMentioned",
          "corridorsMentioned",
          "datesMentioned",
          "metricHints",
          "containsTables",
          "containsMaps",
          "containsCharts",
          "visualReviewHints",
        ],
        properties: {
          sourceId: { type: "string" },
          pageNumber: {
            type: "integer",
            minimum: 1,
            description:
              "The pipeline-supplied PDF page ordinal, not the printed page number visible on the document.",
          },
          markdown: { type: "string", minLength: 1 },
          routesMentioned: { type: "array", items: { type: "string" }, maxItems: 50 },
          corridorsMentioned: { type: "array", items: { type: "string" }, maxItems: 50 },
          datesMentioned: { type: "array", items: { type: "string" }, maxItems: 50 },
          metricHints: {
            type: "array",
            items: { type: "string" },
            maxItems: 50,
            description:
              "Short visible metrics or table labels worth indexing, not unsupported analysis.",
          },
          containsTables: { type: "boolean" },
          containsMaps: { type: "boolean" },
          containsCharts: { type: "boolean" },
          visualReviewHints: {
            type: "array",
            items: { type: "string" },
            maxItems: 20,
            description:
              "Use for maps, charts, scanned tables, or illegible areas that need human visual review.",
          },
        },
      },
    },
  };
}

export function unknownRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function booleanField(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

export function pageMarkdownToolResult(value: unknown): {
  sourceId: string;
  pageNumber: number;
  markdown: string;
  routesMentioned: string[];
  corridorsMentioned: string[];
  datesMentioned: string[];
  metricHints: string[];
  containsTables: boolean | null;
  containsMaps: boolean | null;
  containsCharts: boolean | null;
  visualReviewHints: string[];
} {
  const record = unknownRecord(value);
  if (record === null) {
    throw new Error(`${OCR_PAGE_MARKDOWN_TOOL_NAME} arguments were not an object.`);
  }
  const sourceId = record["sourceId"];
  const pageNumber = record["pageNumber"];
  const markdown = record["markdown"];
  if (typeof sourceId !== "string" || sourceId.length === 0) {
    throw new Error(`${OCR_PAGE_MARKDOWN_TOOL_NAME} sourceId is required.`);
  }
  if (!Number.isInteger(pageNumber) || Number(pageNumber) < 1) {
    throw new Error(`${OCR_PAGE_MARKDOWN_TOOL_NAME} pageNumber must be a positive integer.`);
  }
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    throw new Error(`${OCR_PAGE_MARKDOWN_TOOL_NAME} markdown is required.`);
  }

  return {
    sourceId,
    pageNumber: Number(pageNumber),
    markdown,
    routesMentioned: stringArrayField(record, "routesMentioned"),
    corridorsMentioned: stringArrayField(record, "corridorsMentioned"),
    datesMentioned: stringArrayField(record, "datesMentioned"),
    metricHints: stringArrayField(record, "metricHints"),
    containsTables: booleanField(record, "containsTables"),
    containsMaps: booleanField(record, "containsMaps"),
    containsCharts: booleanField(record, "containsCharts"),
    visualReviewHints: stringArrayField(record, "visualReviewHints"),
  };
}

export function frontmatterValue(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }
  return JSON.stringify(value);
}

function markdownWithFrontmatter(input: {
  source: Tier2OcrPlanSource;
  pageNumber: number;
  pdfPageCount: number;
  generatedAt: string;
  model: string;
  provider: string;
  serviceTier: string;
  pdfEngine: string;
  promptVersion: string;
  inputMode: Tier2OcrPageMarkdownPage["inputMode"];
  pagePdfArtifactKey: string | null;
  pagePdfSha256: string | null;
  renderArtifactKey: string | null;
  renderSha256: string | null;
  inputArtifactKey: string | null;
  inputSha256: string | null;
  result: ReturnType<typeof pageMarkdownToolResult>;
}): string {
  const frontmatter: Record<string, unknown> = {
    sourceId: input.source.sourceId,
    title: input.source.title,
    publisher: input.source.publisher,
    sourceGroup: input.source.sourceGroup,
    sourceUrl: input.source.sourceUrl,
    finalUrl: input.source.finalUrl,
    rawArtifactKey: input.source.rawArtifactKey,
    pageNumber: input.pageNumber,
    pdfPageCount: input.pdfPageCount,
    generatedAt: input.generatedAt,
    ocrProvider: input.provider,
    ocrModel: input.model,
    serviceTier: input.serviceTier,
    pdfEngine: input.inputMode === "pdf_page" ? input.pdfEngine : null,
    renderEngine: input.renderArtifactKey === null ? null : "poppler-pdftoppm",
    promptVersion: input.promptVersion,
    inputMode: input.inputMode,
    pagePdfArtifactKey: input.pagePdfArtifactKey,
    pagePdfSha256: input.pagePdfSha256,
    renderArtifactKey: input.renderArtifactKey,
    renderSha256: input.renderSha256,
    inputArtifactKey: input.inputArtifactKey,
    inputSha256: input.inputSha256,
    containsTables: input.result.containsTables,
    containsMaps: input.result.containsMaps,
    containsCharts: input.result.containsCharts,
    routesMentioned: input.result.routesMentioned,
    corridorsMentioned: input.result.corridorsMentioned,
    datesMentioned: input.result.datesMentioned,
    metricHints: input.result.metricHints,
    visualReviewHints: input.result.visualReviewHints,
  };
  const lines = [
    "---",
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${frontmatterValue(value)}`),
    "---",
    "",
    input.result.markdown.trim(),
    "",
  ];
  return lines.join("\n");
}

function parseToolArguments(value: unknown): unknown | null {
  if (typeof value === "string") {
    return parseJsonObjectFromText(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return null;
}

export function extractToolCallArguments(responseJson: unknown, toolName: string): unknown | null {
  const root = responseJson as {
    choices?: Array<{
      message?: {
        tool_calls?: unknown;
        toolCalls?: unknown;
      };
    }>;
  };
  for (const choice of root.choices ?? []) {
    const message = choice.message;
    const toolCallLists = [message?.tool_calls, message?.toolCalls];
    for (const toolCalls of toolCallLists) {
      if (!Array.isArray(toolCalls)) {
        continue;
      }
      for (const toolCall of toolCalls) {
        if (toolCall === null || typeof toolCall !== "object") {
          continue;
        }
        const record = toolCall as {
          function?: { name?: unknown; arguments?: unknown };
          name?: unknown;
          toolName?: unknown;
          arguments?: unknown;
          input?: unknown;
        };
        const name = record.function?.name ?? record.name ?? record.toolName;
        if (name !== toolName) {
          continue;
        }
        return parseToolArguments(
          record.function?.arguments ?? record.arguments ?? record.input ?? null,
        );
      }
    }
  }
  return null;
}

function extractFinishReason(responseJson: unknown): string | null {
  const root = responseJson as {
    choices?: Array<{ finish_reason?: unknown; finishReason?: unknown }>;
  };
  const choice = root.choices?.[0];
  const reason = choice?.finish_reason ?? choice?.finishReason;
  return typeof reason === "string" ? reason : null;
}

export function missingToolCallErrorMessage(input: {
  responseJson: unknown;
  toolName: string;
  maxTokens: number;
}): string {
  const finishReason = extractFinishReason(input.responseJson);
  return finishReason === "length"
    ? `${input.toolName} tool call truncated at max_tokens=${input.maxTokens} (finish_reason=length). Bump --max-tokens or narrow the input.`
    : `${input.toolName} tool call missing from response (finish_reason=${finishReason ?? "unknown"}).`;
}

function extractFileAnnotations(responseJson: unknown): unknown[] {
  const root = responseJson as {
    choices?: Array<{ message?: { annotations?: unknown[] } }>;
    error?: { metadata?: { file_annotations?: unknown[] } };
  };
  return [
    ...(root.choices?.[0]?.message?.annotations ?? []),
    ...(root.error?.metadata?.file_annotations ?? []),
  ];
}

function parseJsonObjectFromText(text: string): unknown | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const objectText =
      extractFirstJsonObjectText(withoutFence) ??
      extractFirstJsonObjectText(removeStrayJsonObjectLines(withoutFence));
    if (objectText === null) {
      return null;
    }
    try {
      return JSON.parse(objectText);
    } catch {
      const repairedText = removeStrayJsonObjectLines(objectText);
      try {
        return JSON.parse(repairedText);
      } catch {
        const tailRepairedText = removeMalformedTrailingJsonProperty(objectText);
        if (tailRepairedText !== objectText) {
          try {
            return JSON.parse(tailRepairedText);
          } catch {
            return null;
          }
        }
        return null;
      }
    }
  }
}

function removeMalformedTrailingJsonProperty(text: string): string {
  // Some providers occasionally append an HTML-attribute-like tail after a
  // property name, e.g. `"unattachedCandidateIds" string="false">[]}`. If the
  // rest of the object is valid JSON, drop only that malformed trailing
  // property. This is deliberately narrow: it only runs after normal JSON parse
  // has failed and only removes a property that lacks the required colon.
  return text.replace(
    /,\s*"[^"]+"\s+[A-Za-z_][^:{}[\]]*>\s*(?:\[\]|\{\}|null|true|false|"[^"]*"|-?\d+(?:\.\d+)?)\s*}\s*$/s,
    "}",
  );
}

function extractFirstJsonObjectText(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function removeStrayJsonObjectLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => isPlausibleJsonLine(line.trim()))
    .join("\n");
}

function isPlausibleJsonLine(line: string): boolean {
  if (line.length === 0) {
    return false;
  }
  if (
    line.startsWith("{") ||
    line.startsWith("}") ||
    line.startsWith("[") ||
    line.startsWith("]") ||
    line.startsWith('"')
  ) {
    return true;
  }
  return /^(?:-?\d+(?:\.\d+)?|true|false|null),?$/.test(line);
}

export async function readJsonArtifact(path: string): Promise<{
  exists: boolean;
  parsed: unknown | null;
  parseError: boolean;
}> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return { exists: false, parsed: null, parseError: false };
  }
  try {
    return { exists: true, parsed: await file.json(), parseError: false };
  } catch {
    return { exists: true, parsed: null, parseError: true };
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item) && item > 0)
    : [];
}

function triageString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

type OcrAnnotationRecord = Record<string, unknown> & {
  text?: unknown;
  type?: unknown;
};

export type OcrEvidenceCandidateDraft = DocumentEvidenceCandidateDraft;

function shouldDisableReasoningForRequiredToolCalls(model: string): boolean {
  return model.toLowerCase().startsWith("qwen/qwen3.7");
}

function requiredToolCallReasoningOverride(model: string): { effort: "none" } | null {
  return shouldDisableReasoningForRequiredToolCalls(model) ? { effort: "none" } : null;
}

function supportsRenderedImageOcrInput(model: string): boolean {
  return !model.toLowerCase().startsWith("qwen/qwen3.7-max");
}

export function ocrEvidenceCandidateDrafts(value: unknown): OcrEvidenceCandidateDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const drafts: OcrEvidenceCandidateDraft[] = [];
  for (const item of value) {
    const parsed = DocumentEvidenceCandidateDraftSchema.safeParse(item);
    if (parsed.success) {
      drafts.push(parsed.data);
      continue;
    }
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const fallback = DocumentEvidenceCandidateDraftSchema.safeParse({
      candidateType: record["candidateType"],
      factClassification: record["factClassification"],
      negativeEvidenceFlag: record["negativeEvidenceFlag"] ?? "none",
      routeMentions: stringArray(record["routeMentions"] ?? record["routeIds"]),
      corridorMentions: stringArray(record["corridorMentions"] ?? record["corridors"]),
      evidencePageRefs: numberArray(record["evidencePageRefs"] ?? record["pages"]),
      evidenceQuote: triageString(record["evidenceQuote"] ?? record["citedSpanText"]),
      summary: triageString(record["summary"] ?? record["rationale"]),
      fields:
        record["fields"] !== null &&
        typeof record["fields"] === "object" &&
        !Array.isArray(record["fields"])
          ? record["fields"]
          : {},
    });
    if (fallback.success) {
      drafts.push(fallback.data);
    }
  }
  return drafts;
}

function annotationTextIsWrapper(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("<file ") || trimmed === "</file>";
}

export function annotationTextBlocks(annotations: unknown): string[] {
  const blocks: string[] = [];
  const seen = new Set<unknown>();

  const visit = (value: unknown) => {
    if (value === null || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);
    const record = value as OcrAnnotationRecord;
    if (record.type === "text" && typeof record.text === "string") {
      const text = record.text.trim();
      if (text.length > 0 && !annotationTextIsWrapper(text)) {
        blocks.push(text);
      }
      return;
    }
    if (record.type === "image_url") {
      return;
    }
    for (const nested of Object.values(record)) {
      if (Array.isArray(nested)) {
        for (const item of nested) {
          visit(item);
        }
      } else {
        visit(nested);
      }
    }
  };

  if (Array.isArray(annotations)) {
    for (const annotation of annotations) {
      visit(annotation);
    }
  } else {
    visit(annotations);
  }

  return blocks;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type OpenRouterCallResult = { response: Response; body: unknown };

function openRouterErrorCode(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body) || !("error" in body)) {
    return null;
  }
  const error = (body as { error?: unknown }).error;
  if (error !== null && typeof error === "object" && !Array.isArray(error)) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") {
      return String(code);
    }
  }
  return null;
}

function isTransientOpenRouterFailure(result: OpenRouterCallResult): boolean {
  if (result.response.status === 429 || result.response.status >= 500) {
    return true;
  }
  const code = openRouterErrorCode(result.body);
  if (code === "429" || code === "500" || code === "502" || code === "503" || code === "504") {
    return true;
  }
  const message = openRouterErrorMessage(result.body)?.toLowerCase() ?? "";
  return (
    message.includes("temporarily") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("rate limit") ||
    message.includes("try again") ||
    message.includes("overloaded") ||
    message.includes("(code: 503)")
  );
}

async function postOpenRouterChatCompletions(input: {
  apiKey: string;
  title: string;
  body: Record<string, unknown>;
  fetcher: FetchLike;
  maxAttempts?: number;
}): Promise<OpenRouterCallResult> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_OPENROUTER_MAX_ATTEMPTS;
  let lastResult: OpenRouterCallResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await input.fetcher("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/",
        "X-Title": input.title,
      },
      body: JSON.stringify(input.body),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { rawText: text };
    }
    const result = { response, body };
    lastResult = result;
    if (attempt >= maxAttempts || !isTransientOpenRouterFailure(result)) {
      return result;
    }
    await sleepMs(500 * attempt);
  }
  if (lastResult === null) {
    throw new Error("OpenRouter request loop exited without a response.");
  }
  return lastResult;
}

// DeepSeek's API is OpenAI-compatible: same request body shape, same
// `tool_calls` semantics. The differences we have to respect:
//   - URL and auth header
//   - No `service_tier`, no `plugins.file-parser`, no `reasoning` override
//   - Thinking mode is on by default for v4-pro and is incompatible with
//     a forced `tool_choice` ("Thinking mode does not support this
//     tool_choice"). We disable thinking here since every caller of this
//     client forces a specific tool call.
//   - Different transient-failure shapes
async function postDeepSeekChatCompletions(input: {
  apiKey: string;
  body: Record<string, unknown>;
  fetcher: FetchLike;
  maxAttempts?: number;
}): Promise<OpenRouterCallResult> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_DEEPSEEK_MAX_ATTEMPTS;
  const bodyWithThinkingDisabled = {
    ...input.body,
    thinking: { type: "disabled" as const },
  };
  let lastResult: OpenRouterCallResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await input.fetcher(DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyWithThinkingDisabled),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { rawText: text };
    }
    const result = { response, body };
    lastResult = result;
    if (attempt >= maxAttempts || !isTransientDeepSeekFailure(result)) {
      return result;
    }
    await sleepMs(500 * attempt);
  }
  if (lastResult === null) {
    throw new Error("DeepSeek request loop exited without a response.");
  }
  return lastResult;
}

function isTransientDeepSeekFailure(result: OpenRouterCallResult): boolean {
  if (result.response.status === 429 || result.response.status >= 500) {
    return true;
  }
  const body = result.body;
  if (body !== null && typeof body === "object" && !Array.isArray(body) && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (error !== null && typeof error === "object" && !Array.isArray(error)) {
      const message = (error as { message?: unknown }).message;
      const text = typeof message === "string" ? message.toLowerCase() : "";
      if (
        text.includes("rate limit") ||
        text.includes("temporarily") ||
        text.includes("timeout") ||
        text.includes("timed out") ||
        text.includes("overloaded")
      ) {
        return true;
      }
    }
  }
  return false;
}

async function callOpenRouterPageMarkdownOcr(input: {
  apiKey: string;
  model: string;
  pdfEngine: Tier2OcrPageMarkdownManifest["pdfEngine"];
  serviceTier: Tier2OcrPageMarkdownManifest["serviceTier"];
  maxTokens: number;
  source: Tier2OcrPlanSource;
  pageNumber: number;
  pdfPageCount: number;
  inputPath: string;
  inputMimeType: "application/pdf" | "image/png";
  fetcher: FetchLike;
}): Promise<{ response: Response; body: unknown }> {
  const bytes = new Uint8Array(await Bun.file(input.inputPath).arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");
  const prompt = buildOcrPageMarkdownPrompt({
    source: input.source,
    pageNumber: input.pageNumber,
    pdfPageCount: input.pdfPageCount,
  });
  const fileContent =
    input.inputMimeType === "image/png"
      ? {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${base64}`,
          },
        }
      : {
          type: "file",
          file: {
            filename: `${input.source.sourceId}-page-${input.pageNumber}.pdf`,
            file_data: `data:application/pdf;base64,${base64}`,
          },
        };
  const reasoning = requiredToolCallReasoningOverride(input.model);
  const body: Record<string, unknown> = {
    model: input.model,
    service_tier: input.serviceTier,
    max_tokens: input.maxTokens,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }, fileContent],
      },
    ],
    tools: [ocrPageMarkdownTool()],
    tool_choice: {
      type: "function",
      function: { name: OCR_PAGE_MARKDOWN_TOOL_NAME },
    },
    ...(reasoning === null ? {} : { reasoning }),
    temperature: 0,
  };
  if (input.inputMimeType === "application/pdf") {
    body["plugins"] = [
      {
        id: "file-parser",
        pdf: {
          engine: input.pdfEngine,
        },
      },
    ];
  }

  return postOpenRouterChatCompletions({
    apiKey: input.apiKey,
    title: "Bus Priority Impact Studio Page OCR",
    body,
    fetcher: input.fetcher,
  });
}

function openRouterErrorMessage(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body) || !("error" in body)) {
    return null;
  }
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") {
    return error;
  }
  if (error !== null && typeof error === "object" && !Array.isArray(error)) {
    const record = error as { message?: unknown; code?: unknown };
    const message = typeof record.message === "string" ? record.message : null;
    const code =
      typeof record.code === "string" || typeof record.code === "number"
        ? String(record.code)
        : null;
    if (message !== null && code !== null) {
      return `${message} (code: ${code})`;
    }
    if (message !== null) {
      return message;
    }
  }
  return "OpenRouter response contained an error object.";
}

function servedServiceTier(body: unknown): string | null {
  return typeof (body as { service_tier?: unknown }).service_tier === "string"
    ? (body as { service_tier: string }).service_tier
    : null;
}

export function pageMarkdownOutputPaths(pageRoot: string): {
  responsePath: string;
  toolCallPath: string;
  markdownPath: string;
  annotationsPath: string;
  errorPath: string;
} {
  return {
    responsePath: join(pageRoot, "openrouter-response.json"),
    toolCallPath: join(pageRoot, "ocr-page-tool-call.json"),
    markdownPath: join(pageRoot, "page.md"),
    annotationsPath: join(pageRoot, "openrouter-file-annotations.json"),
    errorPath: join(pageRoot, "error.json"),
  };
}

async function readExistingPageMarkdown(input: {
  basePage: Omit<
    Tier2OcrPageMarkdownPage,
    | "status"
    | "reusedExisting"
    | "httpStatus"
    | "requestedServiceTier"
    | "servedServiceTier"
    | "responseArtifactKey"
    | "toolCallArtifactKey"
    | "markdownArtifactKey"
    | "annotationsArtifactKey"
    | "usage"
    | "markdownCharCount"
    | "containsTables"
    | "containsMaps"
    | "containsCharts"
    | "routesMentioned"
    | "corridorsMentioned"
    | "datesMentioned"
    | "metricHints"
    | "visualReviewHints"
    | "error"
  >;
  runRoot: string;
  pageRoot: string;
  requestedServiceTier: Tier2OcrPageMarkdownManifest["serviceTier"] | null;
}): Promise<Tier2OcrPageMarkdownPage | null> {
  const paths = pageMarkdownOutputPaths(input.pageRoot);
  if (
    !(await Bun.file(paths.responsePath).exists()) ||
    !(await Bun.file(paths.toolCallPath).exists()) ||
    !(await Bun.file(paths.markdownPath).exists())
  ) {
    return null;
  }
  const responseBody = (await Bun.file(paths.responsePath)
    .json()
    .catch(() => null)) as { error?: unknown; usage?: unknown; service_tier?: unknown } | null;
  if (responseBody === null || responseBody.error !== undefined) {
    return null;
  }
  const toolCall = await Bun.file(paths.toolCallPath).json();
  const result = pageMarkdownToolResult(toolCall);
  const markdownText = await Bun.file(paths.markdownPath).text();
  return {
    ...input.basePage,
    status: "ocr_complete",
    reusedExisting: true,
    httpStatus: 200,
    requestedServiceTier: input.requestedServiceTier,
    servedServiceTier: servedServiceTier(responseBody),
    responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
    toolCallArtifactKey: artifactKey(paths.toolCallPath, input.runRoot),
    markdownArtifactKey: artifactKey(paths.markdownPath, input.runRoot),
    annotationsArtifactKey: (await Bun.file(paths.annotationsPath).exists())
      ? artifactKey(paths.annotationsPath, input.runRoot)
      : null,
    usage: responseBody.usage ?? null,
    markdownCharCount: markdownText.length,
    containsTables: result.containsTables,
    containsMaps: result.containsMaps,
    containsCharts: result.containsCharts,
    routesMentioned: result.routesMentioned,
    corridorsMentioned: result.corridorsMentioned,
    datesMentioned: result.datesMentioned,
    metricHints: result.metricHints,
    visualReviewHints: result.visualReviewHints,
    error: null,
  };
}

async function ocrPageMarkdownPage(input: {
  source: Tier2OcrPlanSource;
  page: Awaited<ReturnType<typeof preparePageMarkdownInputs>>["pages"][number];
  runRoot: string;
  generatedAt: string;
  model: string;
  provider: string;
  pdfEngine: Tier2OcrPageMarkdownManifest["pdfEngine"];
  serviceTier: Tier2OcrPageMarkdownManifest["serviceTier"];
  maxTokens: number;
  execute: boolean;
  fetcher: FetchLike;
  apiKey: string | undefined;
  pdfPageCount: number;
}): Promise<Tier2OcrPageMarkdownPage> {
  const basePage = {
    pageNumber: input.page.pageNumber,
    inputMode: input.page.inputMode,
    pagePdfArtifactKey: input.page.pagePdfArtifactKey,
    pagePdfByteLength: input.page.pagePdfByteLength,
    pagePdfSha256: input.page.pagePdfSha256,
    renderArtifactKey: input.page.renderArtifactKey,
    renderSha256: input.page.renderSha256,
    inputArtifactKey: input.page.inputArtifactKey,
    inputMimeType: input.page.inputMimeType,
    inputByteLength: input.page.inputByteLength,
    inputSha256: input.page.inputSha256,
  };
  if (!input.execute) {
    return {
      ...basePage,
      status: "prepared",
      reusedExisting: false,
      httpStatus: null,
      requestedServiceTier: input.serviceTier,
      servedServiceTier: null,
      responseArtifactKey: null,
      toolCallArtifactKey: null,
      markdownArtifactKey: null,
      annotationsArtifactKey: null,
      usage: null,
      markdownCharCount: 0,
      containsTables: null,
      containsMaps: null,
      containsCharts: null,
      routesMentioned: [],
      corridorsMentioned: [],
      datesMentioned: [],
      metricHints: [],
      visualReviewHints: [],
      error: null,
    };
  }

  const existing = await readExistingPageMarkdown({
    basePage,
    runRoot: input.runRoot,
    pageRoot: input.page.pageRoot,
    requestedServiceTier: null,
  });
  if (existing !== null) {
    return existing;
  }

  if (input.apiKey === undefined || input.apiKey.length === 0) {
    throw new Error("OPENROUTER_API_KEY is required for docs:ocr --page-markdown --execute.");
  }

  const paths = pageMarkdownOutputPaths(input.page.pageRoot);
  const openRouter = await callOpenRouterPageMarkdownOcr({
    apiKey: input.apiKey,
    model: input.model,
    pdfEngine: input.pdfEngine,
    serviceTier: input.serviceTier,
    maxTokens: input.maxTokens,
    source: input.source,
    pageNumber: input.page.pageNumber,
    pdfPageCount: input.pdfPageCount,
    inputPath: input.page.inputPath,
    inputMimeType: input.page.inputMimeType,
    fetcher: input.fetcher,
  });
  await writeJson(paths.responsePath, openRouter.body);
  const annotations = extractFileAnnotations(openRouter.body);
  if (annotations.length > 0) {
    await writeJson(paths.annotationsPath, annotations);
  }

  const providerErrorMessage = openRouterErrorMessage(openRouter.body);
  if (!openRouter.response.ok || providerErrorMessage !== null) {
    const httpErrorMessage = `OpenRouter HTTP ${openRouter.response.status} ${openRouter.response.statusText}`;
    const errorMessage =
      providerErrorMessage === null
        ? httpErrorMessage
        : openRouter.response.ok
          ? `OpenRouter provider error: ${providerErrorMessage}`
          : `${httpErrorMessage}: ${providerErrorMessage}`;
    await writeJson(paths.errorPath, {
      sourceId: input.source.sourceId,
      pageNumber: input.page.pageNumber,
      httpStatus: openRouter.response.status,
      statusText: openRouter.response.statusText,
      error: errorMessage,
    });
    return {
      ...basePage,
      status: "ocr_failed",
      reusedExisting: false,
      httpStatus: openRouter.response.status,
      requestedServiceTier: input.serviceTier,
      servedServiceTier: null,
      responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
      toolCallArtifactKey: null,
      markdownArtifactKey: null,
      annotationsArtifactKey:
        annotations.length > 0 ? artifactKey(paths.annotationsPath, input.runRoot) : null,
      usage: null,
      markdownCharCount: 0,
      containsTables: null,
      containsMaps: null,
      containsCharts: null,
      routesMentioned: [],
      corridorsMentioned: [],
      datesMentioned: [],
      metricHints: [],
      visualReviewHints: [],
      error: errorMessage,
    };
  }

  const toolArgs = extractToolCallArguments(openRouter.body, OCR_PAGE_MARKDOWN_TOOL_NAME);
  if (toolArgs !== null) {
    await writeJson(paths.toolCallPath, toolArgs);
  }
  let result: ReturnType<typeof pageMarkdownToolResult>;
  try {
    if (toolArgs === null) {
      throw new Error(
        `OpenRouter response did not include required ${OCR_PAGE_MARKDOWN_TOOL_NAME} tool call.`,
      );
    }
    result = pageMarkdownToolResult(toolArgs);
    if (result.sourceId !== input.source.sourceId) {
      throw new Error(
        `${OCR_PAGE_MARKDOWN_TOOL_NAME} sourceId mismatch: expected ${input.source.sourceId}, got ${result.sourceId}.`,
      );
    }
    if (result.pageNumber !== input.page.pageNumber) {
      throw new Error(
        `${OCR_PAGE_MARKDOWN_TOOL_NAME} pageNumber mismatch: expected ${input.page.pageNumber}, got ${result.pageNumber}.`,
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await writeJson(paths.errorPath, {
      sourceId: input.source.sourceId,
      pageNumber: input.page.pageNumber,
      httpStatus: openRouter.response.status,
      statusText: openRouter.response.statusText,
      error: errorMessage,
    });
    return {
      ...basePage,
      status: "ocr_failed",
      reusedExisting: false,
      httpStatus: openRouter.response.status,
      requestedServiceTier: input.serviceTier,
      servedServiceTier: servedServiceTier(openRouter.body),
      responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
      toolCallArtifactKey:
        toolArgs === null ? null : artifactKey(paths.toolCallPath, input.runRoot),
      markdownArtifactKey: null,
      annotationsArtifactKey:
        annotations.length > 0 ? artifactKey(paths.annotationsPath, input.runRoot) : null,
      usage: (openRouter.body as { usage?: unknown }).usage ?? null,
      markdownCharCount: 0,
      containsTables: null,
      containsMaps: null,
      containsCharts: null,
      routesMentioned: [],
      corridorsMentioned: [],
      datesMentioned: [],
      metricHints: [],
      visualReviewHints: [],
      error: errorMessage,
    };
  }

  const markdown = markdownWithFrontmatter({
    source: input.source,
    pageNumber: input.page.pageNumber,
    pdfPageCount: input.pdfPageCount,
    generatedAt: input.generatedAt,
    model: input.model,
    provider: input.provider,
    serviceTier: input.serviceTier,
    pdfEngine: input.pdfEngine,
    promptVersion: OCR_PAGE_MARKDOWN_PROMPT_VERSION,
    inputMode: input.page.inputMode,
    pagePdfArtifactKey: input.page.pagePdfArtifactKey,
    pagePdfSha256: input.page.pagePdfSha256,
    renderArtifactKey: input.page.renderArtifactKey,
    renderSha256: input.page.renderSha256,
    inputArtifactKey: input.page.inputArtifactKey,
    inputSha256: input.page.inputSha256,
    result,
  });
  await Bun.write(paths.markdownPath, markdown);
  const responseUsage = (openRouter.body as { usage?: unknown }).usage ?? null;

  return {
    ...basePage,
    status: "ocr_complete",
    reusedExisting: false,
    httpStatus: openRouter.response.status,
    requestedServiceTier: input.serviceTier,
    servedServiceTier: servedServiceTier(openRouter.body),
    responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
    toolCallArtifactKey: artifactKey(paths.toolCallPath, input.runRoot),
    markdownArtifactKey: artifactKey(paths.markdownPath, input.runRoot),
    annotationsArtifactKey:
      annotations.length > 0 ? artifactKey(paths.annotationsPath, input.runRoot) : null,
    usage: responseUsage,
    markdownCharCount: markdown.length,
    containsTables: result.containsTables,
    containsMaps: result.containsMaps,
    containsCharts: result.containsCharts,
    routesMentioned: result.routesMentioned,
    corridorsMentioned: result.corridorsMentioned,
    datesMentioned: result.datesMentioned,
    metricHints: result.metricHints,
    visualReviewHints: result.visualReviewHints,
    error: null,
  };
}

async function ocrPageMarkdownSource(input: {
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  runRoot: string;
  pageMarkdownRootName: string;
  pageInputPreference: Tier2OcrPageInputPreference;
  pageLimit: number | null;
  allPages: boolean;
  pageRangeOverride: string | undefined;
  pageConcurrency: number;
  generatedAt: string;
  model: string;
  pdfEngine: Tier2OcrPageMarkdownManifest["pdfEngine"];
  serviceTier: Tier2OcrPageMarkdownManifest["serviceTier"];
  maxTokens: number;
  execute: boolean;
  fetcher: FetchLike;
  apiKey: string | undefined;
}): Promise<Tier2OcrPageMarkdownSource> {
  try {
    const prepared = await preparePageMarkdownInputs({
      runRoot: input.runRoot,
      source: input.source,
      sourceIndex: input.sourceIndex,
      pageMarkdownRootName: input.pageMarkdownRootName,
      pageLimit: input.pageLimit,
      allPages: input.allPages,
      pageRange: input.source.pageRange,
      pageRangeOverride: input.pageRangeOverride,
      pageInputPreference: input.pageInputPreference,
      model: input.model,
    });
    const pages = await mapWithConcurrency(prepared.pages, input.pageConcurrency, async (page) =>
      ocrPageMarkdownPage({
        source: input.source,
        page,
        runRoot: input.runRoot,
        generatedAt: input.generatedAt,
        model: input.model,
        provider: "openrouter",
        pdfEngine: input.pdfEngine,
        serviceTier: input.serviceTier,
        maxTokens: input.maxTokens,
        execute: input.execute,
        fetcher: input.fetcher,
        apiKey: input.apiKey,
        pdfPageCount: prepared.pdfPageCount,
      }),
    );
    const failedPageCount = pages.filter((page) => page.status === "ocr_failed").length;
    const completePageCount = pages.filter((page) => page.status === "ocr_complete").length;
    const preparedPageCount = pages.filter((page) => page.status === "prepared").length;
    const status =
      preparedPageCount === pages.length
        ? "prepared"
        : failedPageCount > 0
          ? "ocr_failed"
          : "ocr_complete";

    return {
      sourceId: input.source.sourceId,
      title: input.source.title,
      publisher: input.source.publisher,
      sourceGroup: input.source.sourceGroup,
      sourceUrl: input.source.sourceUrl,
      finalUrl: input.source.finalUrl,
      rawArtifactKey: input.source.rawArtifactKey,
      pageRange: input.source.pageRange,
      requestedPageLimit: input.pageLimit,
      allPages: input.allPages,
      pdfPageCount: prepared.pdfPageCount,
      selectedPageCount: prepared.selectedPages.length,
      selectedPages: prepared.selectedPages,
      status,
      reusedExistingCount: pages.filter((page) => page.reusedExisting).length,
      pageCount: pages.length,
      ocrCompletePageCount: completePageCount,
      ocrFailedPageCount: failedPageCount,
      pages,
      error: failedPageCount === pages.length ? "All selected pages failed OCR." : null,
    };
  } catch (error) {
    return {
      sourceId: input.source.sourceId,
      title: input.source.title,
      publisher: input.source.publisher,
      sourceGroup: input.source.sourceGroup,
      sourceUrl: input.source.sourceUrl,
      finalUrl: input.source.finalUrl,
      rawArtifactKey: input.source.rawArtifactKey,
      pageRange: input.source.pageRange,
      requestedPageLimit: input.pageLimit,
      allPages: input.allPages,
      pdfPageCount: null,
      selectedPageCount: 0,
      selectedPages: [],
      status: "ocr_failed",
      reusedExistingCount: 0,
      pageCount: 0,
      ocrCompletePageCount: 0,
      ocrFailedPageCount: 0,
      pages: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function ocrTier2PageMarkdown(
  args: OcrTier2PageMarkdownArgs,
): Promise<Tier2OcrPageMarkdownManifest> {
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const runRoot = dirname(plan.captureManifestPath);
  const model = args.model ?? process.env["OPENROUTER_OCR_MODEL"] ?? DEFAULT_OCR_MODEL;
  const allPages = args.allPages ?? args.pageLimit === undefined;
  const pageLimit: number | null = allPages ? null : (args.pageLimit ?? 10);
  if (pageLimit !== null && (!Number.isInteger(pageLimit) || pageLimit < 1)) {
    throw new Error("--page-limit must be a positive integer.");
  }
  const pageConcurrency = args.pageConcurrency ?? 4;
  if (!Number.isInteger(pageConcurrency) || pageConcurrency < 1) {
    throw new Error("--page-concurrency must be a positive integer.");
  }
  const limit = args.limit ?? 1;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  const selectedSources = plan.sources
    .map((source, sourceIndex) => ({ source, sourceIndex }))
    .filter(({ source }) => args.sourceId === undefined || source.sourceId === args.sourceId)
    .slice(0, limit);
  const execute = args.execute ?? false;
  const fetcher = args.fetcher ?? defaultFetch;
  const serviceTier = args.serviceTier ?? "flex";
  const maxTokens = args.maxTokens ?? DEFAULT_OCR_MAX_TOKENS;
  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new Error("--max-tokens must be a positive integer.");
  }
  const pageMarkdownRootName = normalizeOcrPageMarkdownRootName(args.pageMarkdownRootName);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const pdfEngine = args.pdfEngine ?? "mistral-ocr";
  const pageInputPreference = args.pageInputPreference ?? "auto";
  const sources: Tier2OcrPageMarkdownSource[] = [];

  for (const selectedSource of selectedSources) {
    sources.push(
      await ocrPageMarkdownSource({
        source: selectedSource.source,
        sourceIndex: selectedSource.sourceIndex,
        runRoot,
        pageMarkdownRootName,
        pageInputPreference,
        pageLimit,
        allPages,
        pageRangeOverride: args.pageRangeOverride,
        pageConcurrency,
        generatedAt,
        model,
        pdfEngine,
        serviceTier,
        maxTokens,
        execute,
        fetcher,
        apiKey: args.apiKey ?? process.env["OPENROUTER_API_KEY"],
      }),
    );
  }

  const pages = sources.flatMap((source) => source.pages);
  const manifest: Tier2OcrPageMarkdownManifest = {
    version: 1,
    runId: plan.runId,
    generatedAt,
    ocrPlanPath: args.ocrPlanPath,
    captureManifestPath: plan.captureManifestPath,
    outputPath: args.outputPath ?? null,
    runtime: "pi-mono",
    provider: "openrouter",
    model,
    api: "chat.completions",
    pdfEngine,
    serviceTier,
    maxTokens,
    pageMarkdownRootName,
    promptVersion: OCR_PAGE_MARKDOWN_PROMPT_VERSION,
    pageInputPreference,
    allPages,
    execute,
    pageLimit,
    pageConcurrency,
    summary: {
      plannedSourceCount: plan.sources.length,
      selectedSourceCount: selectedSources.length,
      preparedPageCount: pages.filter((page) => page.status === "prepared").length,
      ocrCompletePageCount: pages.filter((page) => page.status === "ocr_complete").length,
      ocrFailedPageCount: pages.filter((page) => page.status === "ocr_failed").length,
      reusedExistingPageCount: pages.filter((page) => page.reusedExisting).length,
      renderedImagePageCount: pages.filter((page) => page.inputMode === "rendered_image").length,
      renderedPageArtifactCount: pages.filter((page) => page.renderArtifactKey !== null).length,
      pdfPageInputCount: pages.filter((page) => page.inputMode === "pdf_page").length,
      totalInputBytes: pages.reduce((sum, page) => sum + page.inputByteLength, 0),
      totalMarkdownChars: pages.reduce((sum, page) => sum + page.markdownCharCount, 0),
    },
    sources,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, manifest);
  }

  return manifest;
}

const OCR_PAGE_AUDIT_ISSUE_CODES = [
  "missing_page_markdown",
  "missing_tool_call",
  "missing_response",
  "source_id_mismatch",
  "page_number_mismatch",
  "markdown_empty",
  "markdown_short",
  "visual_review_hint",
  "contains_map",
  "contains_chart",
  "contains_table",
  "ocr_error",
] as const satisfies readonly Tier2OcrPageMarkdownAuditIssueCode[];

export function emptyPageAuditIssueCounts(): Record<Tier2OcrPageMarkdownAuditIssueCode, number> {
  return Object.fromEntries(OCR_PAGE_AUDIT_ISSUE_CODES.map((code) => [code, 0])) as Record<
    Tier2OcrPageMarkdownAuditIssueCode,
    number
  >;
}

export function addPageAuditIssue(
  counts: Record<Tier2OcrPageMarkdownAuditIssueCode, number>,
  code: Tier2OcrPageMarkdownAuditIssueCode,
): void {
  counts[code] += 1;
}

export function markdownBody(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function markdownFrontmatterString(markdown: string, key: string): string | null {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (frontmatter === null || frontmatter[1] === undefined) return null;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = frontmatter[1].match(new RegExp(`^${escapedKey}:\\s+(.+)$`, "m"));
  if (match === null || match[1] === undefined) return null;
  const raw = match[1].trim();
  if (raw === "null") return null;
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

function likelyBlankMarkdownBody(body: string, visualReviewHints: string[]): boolean {
  const normalized = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length === 0) {
    return true;
  }
  const hintText = visualReviewHints.join(" ").toLowerCase();
  return (
    normalized.length < 80 &&
    (hintText.includes("blank") ||
      hintText.includes("no text") ||
      hintText.includes("solid") ||
      normalized.toLowerCase().includes("blank"))
  );
}

async function auditOcrPageMarkdownPage(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  pageRoot: string;
  pageNumber: number;
}): Promise<Tier2OcrPageMarkdownAuditPage> {
  const paths = pageMarkdownOutputPaths(input.pageRoot);
  const [markdownExists, toolCallExists, responseExists, errorExists] = await Promise.all([
    Bun.file(paths.markdownPath).exists(),
    Bun.file(paths.toolCallPath).exists(),
    Bun.file(paths.responsePath).exists(),
    Bun.file(paths.errorPath).exists(),
  ]);
  const issueCodes: Tier2OcrPageMarkdownAuditIssueCode[] = [];
  let result: ReturnType<typeof pageMarkdownToolResult> | null = null;
  let markdownText = "";
  let body = "";
  let error: string | null = null;

  if (!markdownExists) issueCodes.push("missing_page_markdown");
  if (!toolCallExists) issueCodes.push("missing_tool_call");
  if (!responseExists) issueCodes.push("missing_response");
  if (errorExists) issueCodes.push("ocr_error");

  if (toolCallExists) {
    try {
      result = pageMarkdownToolResult(await Bun.file(paths.toolCallPath).json());
      if (result.sourceId !== input.source.sourceId) issueCodes.push("source_id_mismatch");
      if (result.pageNumber !== input.pageNumber) issueCodes.push("page_number_mismatch");
    } catch (caught) {
      issueCodes.push("missing_tool_call");
      error = caught instanceof Error ? caught.message : String(caught);
    }
  }
  if (markdownExists) {
    markdownText = await Bun.file(paths.markdownPath).text();
    body = markdownBody(markdownText);
    if (body.length === 0) issueCodes.push("markdown_empty");
    if (body.length > 0 && body.length < 120) issueCodes.push("markdown_short");
  }

  const visualReviewHints = result?.visualReviewHints ?? [];
  const containsTables = result?.containsTables ?? null;
  const containsMaps = result?.containsMaps ?? null;
  const containsCharts = result?.containsCharts ?? null;
  if (visualReviewHints.length > 0) issueCodes.push("visual_review_hint");
  if (containsTables === true) issueCodes.push("contains_table");
  if (containsMaps === true) issueCodes.push("contains_map");
  if (containsCharts === true) issueCodes.push("contains_chart");
  const blankPageLikely = likelyBlankMarkdownBody(body, visualReviewHints);

  return {
    sourceId: input.source.sourceId,
    title: input.source.title,
    publisher: input.source.publisher,
    sourceGroup: input.source.sourceGroup,
    pageNumber: input.pageNumber,
    status: errorExists
      ? "ocr_failed"
      : markdownExists && toolCallExists
        ? "ocr_complete"
        : "missing",
    markdownArtifactKey: markdownExists ? artifactKey(paths.markdownPath, input.runRoot) : null,
    toolCallArtifactKey: toolCallExists ? artifactKey(paths.toolCallPath, input.runRoot) : null,
    responseArtifactKey: responseExists ? artifactKey(paths.responsePath, input.runRoot) : null,
    errorArtifactKey: errorExists ? artifactKey(paths.errorPath, input.runRoot) : null,
    renderArtifactKey: markdownFrontmatterString(markdownText, "renderArtifactKey"),
    inputArtifactKey: markdownFrontmatterString(markdownText, "inputArtifactKey"),
    markdownCharCount: markdownText.length,
    markdownBodyCharCount: body.length,
    containsTables,
    containsMaps,
    containsCharts,
    blankPageLikely,
    needsVisualReview:
      visualReviewHints.length > 0 ||
      containsTables === true ||
      containsMaps === true ||
      containsCharts === true,
    routesMentioned: result?.routesMentioned ?? [],
    corridorsMentioned: result?.corridorsMentioned ?? [],
    datesMentioned: result?.datesMentioned ?? [],
    metricHints: result?.metricHints ?? [],
    visualReviewHints,
    issueCodes: [...new Set(issueCodes)],
    error,
  };
}

function summarizeOcrPageAuditSource(input: {
  source: Tier2OcrPlanSource;
  pdfPageCount: number | null;
  pages: Tier2OcrPageMarkdownAuditPage[];
}): Tier2OcrPageMarkdownAuditSource {
  const issueCounts = emptyPageAuditIssueCounts();
  for (const page of input.pages) {
    for (const issue of page.issueCodes) addPageAuditIssue(issueCounts, issue);
  }
  return {
    sourceId: input.source.sourceId,
    title: input.source.title,
    publisher: input.source.publisher,
    sourceGroup: input.source.sourceGroup,
    sourceUrl: input.source.sourceUrl,
    pdfPageCount: input.pdfPageCount,
    pageCount: input.pages.length,
    completePageCount: input.pages.filter((page) => page.status === "ocr_complete").length,
    failedPageCount: input.pages.filter((page) => page.status === "ocr_failed").length,
    missingPageCount: input.pages.filter((page) => page.status === "missing").length,
    tablePageCount: input.pages.filter((page) => page.containsTables === true).length,
    mapPageCount: input.pages.filter((page) => page.containsMaps === true).length,
    chartPageCount: input.pages.filter((page) => page.containsCharts === true).length,
    likelyBlankPageCount: input.pages.filter((page) => page.blankPageLikely).length,
    visualReviewPageCount: input.pages.filter((page) => page.needsVisualReview).length,
    totalMarkdownChars: input.pages.reduce((sum, page) => sum + page.markdownCharCount, 0),
    issueCounts,
    pages: input.pages,
  };
}

export async function auditTier2OcrPageMarkdown(
  args: AuditTier2OcrPageMarkdownArgs,
): Promise<Tier2OcrPageMarkdownAudit> {
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const runRoot = dirname(plan.captureManifestPath);
  const pageMarkdownRootName = normalizeOcrPageMarkdownRootName(args.pageMarkdownRootName);
  const sources: Tier2OcrPageMarkdownAuditSource[] = [];

  for (let sourceIndex = 0; sourceIndex < plan.sources.length; sourceIndex += 1) {
    const source = plan.sources[sourceIndex];
    if (source === undefined) continue;
    const sourceRoot = ocrPageMarkdownSourceRoot({
      runRoot,
      source,
      sourceIndex,
      pageMarkdownRootName,
    });
    const rawPath = join(runRoot, source.rawArtifactKey);
    const pdfPageCount = await pdfPageCountWithFallback(rawPath);
    const pageCount = pdfPageCount ?? 0;
    const pages: Tier2OcrPageMarkdownAuditPage[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const pageRoot = join(sourceRoot, "pages", String(pageNumber).padStart(4, "0"));
      pages.push(await auditOcrPageMarkdownPage({ runRoot, source, pageRoot, pageNumber }));
    }
    sources.push(summarizeOcrPageAuditSource({ source, pdfPageCount, pages }));
  }

  const pages = sources.flatMap((source) => source.pages);
  const issueCounts = emptyPageAuditIssueCounts();
  for (const page of pages) {
    for (const issue of page.issueCodes) addPageAuditIssue(issueCounts, issue);
  }
  const audit: Tier2OcrPageMarkdownAudit = {
    version: 1,
    runId: plan.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    ocrPlanPath: args.ocrPlanPath,
    outputPath: args.outputPath ?? null,
    pageMarkdownRootName,
    summary: {
      plannedSourceCount: plan.sources.length,
      sourceCount: sources.length,
      pageCount: pages.length,
      completePageCount: pages.filter((page) => page.status === "ocr_complete").length,
      failedPageCount: pages.filter((page) => page.status === "ocr_failed").length,
      missingPageCount: pages.filter((page) => page.status === "missing").length,
      toolCallCount: pages.filter((page) => page.toolCallArtifactKey !== null).length,
      responseCount: pages.filter((page) => page.responseArtifactKey !== null).length,
      tablePageCount: pages.filter((page) => page.containsTables === true).length,
      mapPageCount: pages.filter((page) => page.containsMaps === true).length,
      chartPageCount: pages.filter((page) => page.containsCharts === true).length,
      likelyBlankPageCount: pages.filter((page) => page.blankPageLikely).length,
      visualReviewPageCount: pages.filter((page) => page.needsVisualReview).length,
      totalMarkdownChars: pages.reduce((sum, page) => sum + page.markdownCharCount, 0),
      issueCounts,
    },
    sources,
  };
  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, audit);
  }
  return audit;
}

function ocrMarkdownCandidateTool(): Record<string, unknown> {
  const draftSchema = toProjectJsonSchema(DocumentEvidenceCandidateDraftToolSchema);
  return {
    type: "function",
    function: {
      name: OCR_MARKDOWN_CANDIDATE_TOOL_NAME,
      description:
        "Record source-grounded document evidence candidates extracted from the provided OCR Markdown pages. Every draft must be backed by a verbatim quote from those pages; do not infer from outside knowledge.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "pageNumbers", "evidenceCandidateDrafts", "reviewNotes"],
        properties: {
          sourceId: {
            type: "string",
            description: "The sourceId supplied by the pipeline; echo it back unchanged.",
          },
          pageNumbers: {
            type: "array",
            items: { type: "integer", minimum: 1 },
            description: "Page numbers covered by this extraction window (echo the supplied list).",
          },
          reviewNotes: {
            type: "string",
            description:
              "Notes for human review: what was ambiguous, what was skipped and why. Empty string if nothing to flag.",
          },
          evidenceCandidateDrafts: {
            type: "array",
            maxItems: 24,
            description:
              "Source-backed draft candidates. Emit one entry per discrete fact, claim, table, figure, or other extractable evidence. Do not include candidates for decorative pages, table-of-contents rows, or unsourced summaries.",
            items: draftSchema,
          },
        },
      },
    },
  };
}

const OCR_MARKDOWN_CANDIDATE_SYSTEM_PROMPT = [
  "You are extracting source-grounded evidence candidates for Bus Priority Impact Studio.",
  "Use only the provided OCR Markdown pages. Do not infer facts from outside knowledge.",
  "Every candidate must cite a short, contiguous, verbatim excerpt from the supplied Markdown (evidenceQuote) and the page numbers that contain that exact excerpt (evidencePageRefs).",
  "Copy evidenceQuote exactly as it appears in the Markdown. Preserve Markdown table pipes, emphasis markers, footnote digits, punctuation, line breaks inside tables, and OCR oddities. Do not insert ellipses, flatten tables, clean up wording, normalize punctuation, or stitch non-adjacent text.",
  "For tables, evidenceQuote must be an exact Markdown table block or exact contiguous table row block copied from the source, not a prose-like pipe-separated rewrite.",
  'Use valueNumeric only when that exact value appears in evidenceQuote, allowing direct unit wording such as "1.1 million" for 1100000. If the source gives a range, keep the range in valueQualifier and do not invent a midpoint.',
  "For third-party evaluations, audits, consultant reports, advocacy reports, and oversight reports, classify extracted facts or judgments as third_party_evaluation unless the quoted sentence itself is explicitly an official MTA/DOT/NYC agency fact being cited.",
  'Recommendations, goals, planned work, proposed routes, future expected work, and "should" statements must use negativeEvidenceFlag "proposed_only" unless the quote also says the item was implemented or completed.',
  'Do not infer treatment components from a branded program name. If a quote says only "SBS route" or "bus improvement" but does not name bus lanes, off-board fare collection, all-door boarding, TSP, camera enforcement, or another bus-priority treatment, do not add a treatment_component candidate.',
  "document_treatment_component_candidate is only for bus-priority street/operations treatments. Do not use it for subway elevators, subway turnstiles, bike lanes, generic parking enforcement, curb regulation text, pedestrian-only work, or plan prose unless the quote explicitly ties it to bus service or a bus-priority treatment.",
  "Route redesign profile pages and stop tables usually describe service changes, not treatment components. Use document_service_change_candidate for route_added, route_discontinued, route_modified, stop_added, stop_removed, frequency_change, headway_change, terminus_change, branch_added, or branch_discontinued when those changes are explicit.",
  "For large route-profile stop tables, do not emit one candidate per row. Prefer a small number of exact contiguous row-block candidates for meaningful Add/New/Remove/routing spans, or skip the table if it would only duplicate many row-level stop facts.",
  "Never assemble selected rows from a table. If Remove/Add/New rows are interleaved with Keep rows, either quote one exact row, quote one exact contiguous table slice including every intervening row, quote the whole table as a document_table_candidate, or skip it. Do not filter a table down to only the rows you care about.",
  "For document_table_candidate, evidenceQuote already carries the source table text. Omit fields.rows for large tables; include rows/headers only for small tables where the cells are needed downstream and do not duplicate hundreds of tokens.",
  "When one sentence contains multiple lifecycle statuses for separate projects, emit separate candidates instead of collapsing them into one project_status candidate.",
  "The tool's parameter schema defines the candidate types, their fields, and when to use them. Follow the per-type guidance there; do not invent fields outside the documented ones unless the source clearly demands them.",
  "Skip boilerplate pages: title pages, table of contents, copyright notices, and publication-info pages do not produce candidates. Section headings alone are not candidates; only emit a candidate when the section contains a concrete claim, metric, or treatment description.",
  "For optional fields you don't know, omit the key entirely. Do not emit empty strings or empty arrays as placeholders.",
  'Route mentions go in routeMentions as bare MTA route IDs (e.g. "B44", "M15"). Put service-mode information (SBS, Limited, Local) in the relevant per-type field (e.g. serviceMode on a treatment component), not in the route ID.',
].join("\n");

function buildOcrMarkdownCandidatePrompt(input: {
  source: Tier2OcrPlanSource;
  pages: Tier2OcrPageMarkdownAuditPage[];
  markdownText: string;
}): string {
  return [
    `Source ID: ${input.source.sourceId}`,
    `Title: ${input.source.title}`,
    `Publisher: ${input.source.publisher}`,
    `Source group: ${input.source.sourceGroup}`,
    `Pages: ${input.pages.map((page) => page.pageNumber).join(", ")}`,
    "",
    "OCR Markdown:",
    input.markdownText,
  ].join("\n");
}

function ocrMarkdownCandidateSourceRoot(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  candidateRootName: string;
}): string {
  return join(
    input.runRoot,
    input.candidateRootName,
    "sources",
    `${String(input.sourceIndex + 1).padStart(4, "0")}_${input.source.sourceId}`,
  );
}

function ocrMarkdownCandidateWindowPaths(input: { sourceRoot: string; pages: number[] }): {
  windowRoot: string;
  responsePath: string;
  toolCallPath: string;
  errorPath: string;
} {
  const label = `${String(input.pages[0] ?? 0).padStart(4, "0")}-${String(
    input.pages.at(-1) ?? 0,
  ).padStart(4, "0")}`;
  const windowRoot = join(input.sourceRoot, "windows", label);
  return {
    windowRoot,
    responsePath: join(windowRoot, "openrouter-response.json"),
    toolCallPath: join(windowRoot, "ocr-markdown-candidates-tool-call.json"),
    errorPath: join(windowRoot, "error.json"),
  };
}

function markdownCandidateRecordCandidates(value: unknown): OcrEvidenceCandidateDraft[] {
  const record = unknownRecord(value);
  if (record === null) return [];
  return ocrEvidenceCandidateDrafts(record["evidenceCandidateDrafts"]);
}

type OcrMarkdownCandidateQuality = {
  issues: Tier2OcrMarkdownCandidateQualityIssueCode[];
  repairs: Tier2OcrMarkdownCandidateQualityRepairCode[];
  validationState: Tier2CandidateValidationState;
  reviewReason: string;
};

type ProcessedOcrEvidenceCandidateDraft = {
  draft: OcrEvidenceCandidateDraft;
  quality: OcrMarkdownCandidateQuality;
};

const DEFAULT_OCR_MARKDOWN_CANDIDATE_REVIEW_REASON =
  "OCR Markdown evidence candidate requires deterministic source-span, table/metric/methodology, route/corridor, and fact-classification validation before public use.";

const THIRD_PARTY_EVALUATION_SOURCE_PATTERN =
  /\b(?:comptroller|independent budget|ibo|consultant|consulting|sam schwartz|advocacy|oversight|audit)\b/i;

const PROPOSED_ONLY_QUOTE_PATTERN =
  /\b(?:should|recommend(?:s|ed|ation)?|proposal|proposals|proposed|planned|planning to|expected to|scheduled to|slated to|set to|will|would|goal|target)\b/i;

const IMPLEMENTED_OR_COMPLETE_QUOTE_PATTERN =
  /\b(?:implemented|completed|complete|built|installed|launched|went into effect|in effect|operational)\b/i;

const PROJECT_STATUS_DOCUMENT_MILESTONE_PATTERN =
  /\b(?:publish(?:ed|ing)?|publication|draft plan|proposed final plan|final plan|plan addendum|public hearing|board vote|board votes|mta board|open house|workshop|comment period|project launch)\b/i;

const ROUTE_MENTION_PATTERN = /^(?:B|BM|BX|BXM|M|Q|QM|S|SIM|X)\d+[A-Z]?$/;
const ROUTE_MENTION_WITH_SUFFIX_PATTERN =
  /\s*(?:\+|SBS|LTD|LIMITED|LOCAL|SELECTBUSSERVICE|SELECT)$\s*/i;
const SUBWAY_ONLY_ROUTE_MENTION_PATTERN = /^[ACEBDFGJLMNQRSWZ]$/;

const VALID_DOCUMENT_TREATMENT_TYPES = new Set<string>(DocumentTreatmentTypeSchema.options);
const VALID_DOCUMENT_SERVICE_CHANGE_TYPES = new Set<string>(
  DocumentServiceChangeKindSchema.options,
);

const REJECTING_QUALITY_ISSUES = new Set<Tier2OcrMarkdownCandidateQualityIssueCode>([
  "evidence_quote_not_exact",
  "treatment_candidate_without_supported_type",
  "service_change_candidate_without_change_type",
  "project_status_is_document_milestone",
]);

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const TREATMENT_TYPE_QUOTE_PATTERNS: Record<string, RegExp> = {
  bus_lane:
    /\b(?:bus lane|bus lanes|dedicated lane|dedicated lanes|offset lane|curbside lane|center-running lane|median lane|red lane)\b/i,
  busway: /\b(?:busway|transitway|transit and truck priority|ttp)\b/i,
  transit_signal_priority:
    /\b(?:transit signal priority|signal priority|\btsp\b|green signal|green time|signal timing|signal retiming|signal changes?)\b/i,
  queue_jump: /\b(?:queue jump|queue-jump|queue bypass)\b/i,
  stop_consolidation:
    /\b(?:stop consolidation|consolidat(?:e|ed|ion).*stops?|fewer stops?|removed stops?|stop spacing|changed from limited to local only)\b/i,
  stop_relocation:
    /\b(?:stop relocation|relocat(?:e|ed|ion).*stops?|station locations?|stations? were added|stops? were added)\b/i,
  bus_bulb: /\b(?:bus bulb|bus bulbs|boarding bulb|bulb station)\b/i,
  neckdown: /\b(?:neckdown|neckdowns|curb extension|curb extensions)\b/i,
  red_paint: /\b(?:red paint|red-painted|red bus lane)\b/i,
  off_board_fare_collection:
    /\b(?:off-board fare|off board fare|fare machines?|pay before boarding|pre-board fare)\b/i,
  all_door_boarding:
    /\b(?:all-door boarding|all door boarding|board(?:ing)? through any door|proof-of-payment)\b/i,
  ace: /\b(?:automated camera enforcement|\bace\b|camera-enforced|bus-mounted cameras?|stationary cameras?|bus lane camera|camera enforcement)\b/i,
  able: /\b(?:automated bus lane enforcement|\bable\b|bus lane enforcement cameras?)\b/i,
  reroute:
    /\b(?:rerout(?:e|ed|ing)|route modified|moved to|instead of traveling|route change|route extension|extend(?:ing)? .*route)\b/i,
  pedestrian_improvement:
    /\b(?:pedestrian|crosswalk|sidewalk|plaza|traffic calming|pedestrian island|shorten crossing|public space)\b/i,
  signal_retiming:
    /\b(?:signal retiming|signal timing|signal changes?|green time|coordination of the signals|traffic signal)\b/i,
};

function pageMarkdownByNumber(input: {
  runRoot: string;
  pages: Tier2OcrPageMarkdownAuditPage[];
}): Promise<Map<number, string>> {
  return Promise.all(
    input.pages.map(async (page): Promise<[number, string]> => {
      if (page.markdownArtifactKey === null) return [page.pageNumber, ""];
      const text = await Bun.file(join(input.runRoot, page.markdownArtifactKey)).text();
      return [page.pageNumber, markdownBody(text)];
    }),
  ).then((entries) => new Map(entries));
}

function uniqueQualityIssues(
  issues: Tier2OcrMarkdownCandidateQualityIssueCode[],
): Tier2OcrMarkdownCandidateQualityIssueCode[] {
  return [...new Set(issues)];
}

function uniqueQualityRepairs(
  repairs: Tier2OcrMarkdownCandidateQualityRepairCode[],
): Tier2OcrMarkdownCandidateQualityRepairCode[] {
  return [...new Set(repairs)];
}

function isThirdPartyEvaluationSource(sourceRef: Tier2CandidateSourceRef): boolean {
  return THIRD_PARTY_EVALUATION_SOURCE_PATTERN.test(
    [sourceRef.publisher, sourceRef.sourceGroup].join(" "),
  );
}

function fieldString(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function shouldSetProposedOnlyFlag(draft: OcrEvidenceCandidateDraft): boolean {
  const implementationStatus = fieldString(draft.fields, "implementationStatus");
  const status = fieldString(draft.fields, "status");
  if (
    implementationStatus === "proposed" ||
    implementationStatus === "planned" ||
    status === "proposed" ||
    status === "planning"
  ) {
    return true;
  }
  if (
    draft.candidateType !== "document_claim_candidate" &&
    draft.candidateType !== "document_project_status_candidate" &&
    draft.candidateType !== "document_treatment_component_candidate" &&
    draft.candidateType !== "document_service_change_candidate"
  ) {
    return false;
  }
  return (
    PROPOSED_ONLY_QUOTE_PATTERN.test(draft.evidenceQuote) &&
    !IMPLEMENTED_OR_COMPLETE_QUOTE_PATTERN.test(draft.evidenceQuote)
  );
}

function projectStatusIsDocumentMilestone(quote: string): boolean {
  return PROJECT_STATUS_DOCUMENT_MILESTONE_PATTERN.test(quote);
}

function normalizeRouteMentionToken(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/[.\-_]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(ROUTE_MENTION_WITH_SUFFIX_PATTERN, "");
  if (normalized.length === 0 || SUBWAY_ONLY_ROUTE_MENTION_PATTERN.test(normalized)) {
    return null;
  }
  return ROUTE_MENTION_PATTERN.test(normalized) ? normalized : null;
}

function expandRouteMention(value: string): string[] {
  const compact = value.trim().replace(/\s+/g, "");
  if (!compact.includes("/")) {
    const normalized = normalizeRouteMentionToken(value);
    return normalized === null ? [] : [normalized];
  }

  const parts = compact.split("/").filter((part) => part.length > 0);
  const first = normalizeRouteMentionToken(parts[0] ?? "");
  if (first === null) return [];
  const base = /^([A-Z]+)(\d+)([A-Z]?)$/.exec(first);
  const expanded = [first];

  for (const part of parts.slice(1)) {
    const direct = normalizeRouteMentionToken(part);
    if (direct !== null) {
      expanded.push(direct);
      continue;
    }
    if (base !== null && /^[A-Z]$/i.test(part)) {
      const [, prefix, number] = base;
      expanded.push(`${prefix}${number}${part.toUpperCase()}`);
      continue;
    }
    if (base !== null && /^\d+[A-Z]?$/i.test(part)) {
      const [, prefix] = base;
      expanded.push(`${prefix}${part.toUpperCase()}`);
    }
  }

  return expanded.filter((routeId) => ROUTE_MENTION_PATTERN.test(routeId));
}

function normalizeRouteMentions(routeMentions: string[]): {
  routeMentions: string[];
  changed: boolean;
} {
  const normalized = new Set<string>();
  for (const routeMention of routeMentions) {
    for (const expanded of expandRouteMention(routeMention)) {
      normalized.add(expanded);
    }
  }
  const routeIds = [...normalized];
  return {
    routeMentions: routeIds,
    changed:
      routeIds.length !== routeMentions.length ||
      routeIds.some((routeId, index) => routeId !== routeMentions[index]),
  };
}

function normalizeNumericText(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(value).replace(/0+$/, "").replace(/\.$/, "");
}

function numericQuoteVariants(value: number): string[] {
  const absolute = Math.abs(value);
  const variants = new Set<string>([
    normalizeNumericText(value),
    normalizeNumericText(absolute),
    absolute.toLocaleString("en-US"),
  ]);
  if (absolute >= 1_000_000) {
    const millions = absolute / 1_000_000;
    variants.add(`${normalizeNumericText(millions)} million`);
  }
  if (absolute >= 1_000 && absolute < 1_000_000) {
    const thousands = absolute / 1_000;
    variants.add(`${normalizeNumericText(thousands)} thousand`);
  }
  for (const [word, number] of Object.entries(NUMBER_WORDS)) {
    if (absolute === number) variants.add(word);
  }
  return [...variants].filter((variant) => variant.length > 0);
}

function quoteSupportsNumericValue(quote: string, value: number): boolean {
  const normalizedQuote = quote.toLowerCase().replace(/,/g, "");
  return numericQuoteVariants(value).some((variant) => {
    const normalizedVariant = variant.toLowerCase().replace(/,/g, "");
    const trailingBoundary = Number.isInteger(value)
      ? "(?!\\.\\d)(?=$|[^0-9a-z])"
      : "(?=$|[^0-9a-z])";
    return new RegExp(
      `(^|[^0-9a-z.])\\$?\\s*${escapeRegExp(normalizedVariant)}${trailingBoundary}`,
    ).test(normalizedQuote);
  });
}

function normalizeEvidenceSearchChar(char: string): string | null {
  if (/[*_`#>|\\]/.test(char)) return null;
  if (/\s/.test(char)) return " ";
  if (char === "\u2018" || char === "\u2019") return "'";
  if (char === "\u201c" || char === "\u201d") return '"';
  if (char === "\u2013" || char === "\u2014") return "-";
  return char.toLowerCase();
}

function normalizedEvidenceSearchText(text: string): {
  text: string;
  sourceIndices: number[];
} {
  let normalized = "";
  const sourceIndices: number[] = [];
  let previousWasSpace = true;

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    const normalizedChar = normalizeEvidenceSearchChar(char);
    if (normalizedChar === null) continue;
    if (normalizedChar === " ") {
      if (!previousWasSpace) {
        normalized += " ";
        sourceIndices.push(index);
        previousWasSpace = true;
      }
      continue;
    }
    normalized += normalizedChar;
    sourceIndices.push(index);
    previousWasSpace = false;
  }

  if (normalized.endsWith(" ")) {
    return {
      text: normalized.slice(0, -1),
      sourceIndices: sourceIndices.slice(0, -1),
    };
  }
  return { text: normalized, sourceIndices };
}

function sourceSubstringForNormalizedQuote(input: {
  markdown: string;
  quote: string;
}): string | null {
  const normalizedMarkdown = normalizedEvidenceSearchText(input.markdown);
  const normalizedQuote = normalizedEvidenceSearchText(input.quote).text;
  if (normalizedQuote.length === 0) return null;

  const normalizedStart = normalizedMarkdown.text.indexOf(normalizedQuote);
  if (normalizedStart === -1) return null;
  const normalizedEnd = normalizedStart + normalizedQuote.length - 1;
  const sourceStart = normalizedMarkdown.sourceIndices[normalizedStart];
  const sourceEnd = normalizedMarkdown.sourceIndices[normalizedEnd];
  if (sourceStart === undefined || sourceEnd === undefined) return null;
  return input.markdown.slice(sourceStart, sourceEnd + 1);
}

function repairedQuoteHits(input: {
  quote: string;
  windowMarkdownByPage: Map<number, string>;
}): { quote: string; pageNumbers: number[] } | null {
  const hits: { quote: string; pageNumber: number }[] = [];
  for (const [pageNumber, markdown] of input.windowMarkdownByPage.entries()) {
    const repairedQuote = sourceSubstringForNormalizedQuote({
      markdown,
      quote: input.quote,
    });
    if (repairedQuote !== null) {
      hits.push({ quote: repairedQuote, pageNumber });
    }
  }
  if (hits.length === 0) return null;
  const firstHit = hits[0];
  if (firstHit === undefined) return null;
  const firstQuote = firstHit.quote;
  return {
    quote: firstQuote,
    pageNumbers: hits
      .filter((hit) => hit.quote === firstQuote)
      .map((hit) => hit.pageNumber)
      .sort((leftPage, rightPage) => leftPage - rightPage),
  };
}

function normalizeEvidenceQuoteForSearch(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function pageBoundarySearchText(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/^#\s+Page\s+\d+\s*$/gim, "");
}

function adjacentPageBoundaryHits(input: {
  quote: string;
  windowMarkdownByPage: Map<number, string>;
}): number[] {
  const normalizedQuote = normalizeEvidenceQuoteForSearch(input.quote);
  if (normalizedQuote.length === 0) return [];

  const hits = new Set<number>();
  const pages = [...input.windowMarkdownByPage.entries()].sort(
    ([leftPage], [rightPage]) => leftPage - rightPage,
  );

  for (let index = 0; index < pages.length - 1; index += 1) {
    const leftEntry = pages[index];
    const rightEntry = pages[index + 1];
    if (leftEntry === undefined || rightEntry === undefined) continue;
    const [leftPage, leftMarkdown] = leftEntry;
    const [rightPage, rightMarkdown] = rightEntry;
    const leftBody = pageBoundarySearchText(leftMarkdown);
    const rightBody = pageBoundarySearchText(rightMarkdown);
    const leftText = normalizeEvidenceQuoteForSearch(leftBody);
    const rightText = normalizeEvidenceQuoteForSearch(rightBody);
    if (leftText.includes(normalizedQuote) || rightText.includes(normalizedQuote)) continue;

    const joinedText = normalizeEvidenceQuoteForSearch(`${leftBody}\n${rightBody}`);
    if (joinedText.includes(normalizedQuote)) {
      hits.add(leftPage);
      hits.add(rightPage);
    }
  }

  return [...hits].sort((leftPage, rightPage) => leftPage - rightPage);
}

function pageRefListsMatch(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort((leftPage, rightPage) => leftPage - rightPage);
  const rightSorted = [...right].sort((leftPage, rightPage) => leftPage - rightPage);
  return leftSorted.every((pageNumber, index) => pageNumber === rightSorted[index]);
}

function quoteHasRangeEvidence(quote: string, valueQualifier: unknown): boolean {
  const text = [quote, typeof valueQualifier === "string" ? valueQualifier : ""]
    .join(" ")
    .toLowerCase();
  const numericTokens = text.match(/\d+(?:\.\d+)?/g) ?? [];
  if (numericTokens.length < 2) return false;
  return /\bbetween\b|\bfrom\b|\bto\b|\band\b|-|\u2013/.test(text);
}

function stringListField(fields: Record<string, unknown>, key: string): string[] {
  const value = fields[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function treatmentTypes(fields: Record<string, unknown>): string[] {
  return stringListField(fields, "treatmentTypes").filter((item) =>
    VALID_DOCUMENT_TREATMENT_TYPES.has(item),
  );
}

function supportedTreatmentTypesForQuote(types: string[], quote: string): string[] {
  return types.filter((type) => {
    const pattern = TREATMENT_TYPE_QUOTE_PATTERNS[type];
    return pattern === undefined || pattern.test(quote);
  });
}

function serviceChangeTypes(fields: Record<string, unknown>): string[] {
  return stringListField(fields, "changeTypes").filter((item) =>
    VALID_DOCUMENT_SERVICE_CHANGE_TYPES.has(item),
  );
}

function projectStatusSpanHasMultipleStatuses(quote: string): boolean {
  const statusFamilies = [
    /\bcomplete(?:d)?\b/i,
    /\bimplement(?:ed|ing|ation)\b/i,
    /\bplanning\b/i,
    /\bscheduled\b/i,
    /\bno plans?\b|\bcancel(?:ed|led)\b|\bscrapped\b|\babandon(?:ed|ing)\b/i,
  ];
  return statusFamilies.filter((pattern) => pattern.test(quote)).length > 1;
}

function projectStatusSpanHasMultipleProjects(input: {
  quote: string;
  routeMentions: string[];
}): boolean {
  if (input.routeMentions.length > 1) return true;
  const boroughs = new Set(
    input.quote
      .match(/\b(?:Bronx|Brooklyn|Queens|Manhattan|Staten Island)\b/gi)
      ?.map((value) => value.toLowerCase()) ?? [],
  );
  return boroughs.size > 1 && /\b(?:redesign|network|project|plan)\b/i.test(input.quote);
}

function validationStateForQuality(
  issues: Tier2OcrMarkdownCandidateQualityIssueCode[],
): Tier2CandidateValidationState {
  if (issues.some((issue) => REJECTING_QUALITY_ISSUES.has(issue))) {
    return "rejected";
  }
  return issues.length > 0 ? "needs_review" : "unvalidated";
}

function reviewReasonForQuality(quality: {
  issues: Tier2OcrMarkdownCandidateQualityIssueCode[];
  repairs: Tier2OcrMarkdownCandidateQualityRepairCode[];
}): string {
  if (quality.issues.length > 0) {
    if (quality.issues.some((issue) => REJECTING_QUALITY_ISSUES.has(issue))) {
      return `OCR Markdown evidence candidate rejected by deterministic quality checks: ${quality.issues.join(", ")}.`;
    }
    return `OCR Markdown evidence candidate needs review after deterministic quality checks: ${quality.issues.join(", ")}.`;
  }
  if (quality.repairs.length > 0) {
    return `OCR Markdown evidence candidate received deterministic safe repairs: ${quality.repairs.join(", ")}.`;
  }
  return DEFAULT_OCR_MARKDOWN_CANDIDATE_REVIEW_REASON;
}

function processOcrEvidenceCandidateDraft(input: {
  draft: OcrEvidenceCandidateDraft;
  sourceRef: Tier2CandidateSourceRef;
  windowMarkdownByPage: Map<number, string>;
}): ProcessedOcrEvidenceCandidateDraft {
  const original = input.draft;
  let factClassification = original.factClassification;
  let negativeEvidenceFlag = original.negativeEvidenceFlag;
  let evidencePageRefs = [...original.evidencePageRefs];
  let evidenceQuote = original.evidenceQuote;
  const fields: Record<string, unknown> = { ...original.fields };
  const issues: Tier2OcrMarkdownCandidateQualityIssueCode[] = [];
  const repairs: Tier2OcrMarkdownCandidateQualityRepairCode[] = [];
  const normalizedRouteMentions = normalizeRouteMentions(original.routeMentions);
  if (normalizedRouteMentions.changed) {
    repairs.push("route_mentions_normalized");
  }

  const citedHits = evidencePageRefs.filter(
    (pageNumber) => input.windowMarkdownByPage.get(pageNumber)?.includes(evidenceQuote) ?? false,
  );
  const windowHits = [...input.windowMarkdownByPage.entries()]
    .filter(([, markdown]) => markdown.includes(evidenceQuote))
    .map(([pageNumber]) => pageNumber);
  const boundaryHits =
    citedHits.length === 0 && windowHits.length === 0
      ? adjacentPageBoundaryHits({
          quote: evidenceQuote,
          windowMarkdownByPage: input.windowMarkdownByPage,
        })
      : [];
  const quoteRepair =
    citedHits.length === 0 && windowHits.length === 0 && boundaryHits.length === 0
      ? repairedQuoteHits({
          quote: evidenceQuote,
          windowMarkdownByPage: input.windowMarkdownByPage,
        })
      : null;

  if (evidenceQuote.includes("...")) {
    issues.push("evidence_quote_uses_ellipsis");
  }
  if (
    original.candidateType === "document_table_candidate" &&
    evidenceQuote.includes(" | ") &&
    !evidenceQuote.includes("\n|") &&
    !evidenceQuote.trimStart().startsWith("|") &&
    windowHits.length === 0 &&
    quoteRepair === null
  ) {
    issues.push("evidence_quote_flattened_table");
  }
  if (citedHits.length > 0 && citedHits.length < evidencePageRefs.length) {
    evidencePageRefs = citedHits;
    repairs.push("evidence_page_refs_trimmed_to_quote_pages");
  } else if (citedHits.length === 0 && windowHits.length > 0) {
    evidencePageRefs = windowHits;
    repairs.push("evidence_page_refs_repaired_to_window_quote_pages");
  } else if (citedHits.length === 0 && boundaryHits.length > 0) {
    if (!pageRefListsMatch(evidencePageRefs, boundaryHits)) {
      evidencePageRefs = boundaryHits;
      repairs.push("evidence_page_refs_repaired_to_window_quote_pages");
    }
    issues.push("evidence_quote_spans_page_boundary");
  } else if (quoteRepair !== null) {
    evidenceQuote = quoteRepair.quote;
    if (!pageRefListsMatch(evidencePageRefs, quoteRepair.pageNumbers)) {
      evidencePageRefs = quoteRepair.pageNumbers;
      repairs.push("evidence_page_refs_repaired_to_window_quote_pages");
    }
    repairs.push("evidence_quote_repaired_to_source_substring");
  } else if (citedHits.length === 0) {
    issues.push("evidence_quote_not_exact");
  }

  if (
    original.candidateType === "document_project_status_candidate" &&
    projectStatusIsDocumentMilestone(evidenceQuote)
  ) {
    issues.push("project_status_is_document_milestone");
    if (negativeEvidenceFlag === "none") {
      negativeEvidenceFlag = "presentation_date_not_implementation";
      repairs.push("negative_evidence_flag_set_presentation_date_not_implementation");
    }
  }

  if (original.candidateType === "document_metric_claim_candidate") {
    const valueNumeric = fields["valueNumeric"];
    if (
      typeof valueNumeric === "number" &&
      !quoteSupportsNumericValue(evidenceQuote, valueNumeric)
    ) {
      if (quoteHasRangeEvidence(evidenceQuote, fields["valueQualifier"])) {
        delete fields["valueNumeric"];
        repairs.push("metric_value_numeric_removed_as_derived");
      } else {
        issues.push("metric_value_numeric_not_supported_by_quote");
      }
    }
  }

  if (original.candidateType === "document_treatment_component_candidate") {
    const rawTypes = stringListField(fields, "treatmentTypes");
    const validTypes = treatmentTypes(fields);
    const supportedTypes = supportedTreatmentTypesForQuote(validTypes, evidenceQuote);
    if (rawTypes.length > 0) {
      if (supportedTypes.length < rawTypes.length) {
        repairs.push("unsupported_treatment_types_removed");
        if (supportedTypes.length === 0) {
          delete fields["treatmentTypes"];
        } else {
          fields["treatmentTypes"] = supportedTypes;
        }
        if (supportedTypes.length < validTypes.length) {
          issues.push("treatment_type_not_supported_by_quote");
        }
      }
    }
    if (treatmentTypes(fields).length === 0) {
      issues.push("treatment_candidate_without_supported_type");
    }
  }

  if (original.candidateType === "document_service_change_candidate") {
    const rawTypes = stringListField(fields, "changeTypes");
    const validTypes = serviceChangeTypes(fields);
    if (rawTypes.length > validTypes.length) {
      repairs.push("unsupported_service_change_types_removed");
      if (validTypes.length === 0) {
        delete fields["changeTypes"];
      } else {
        fields["changeTypes"] = validTypes;
      }
    }
    if (serviceChangeTypes(fields).length === 0) {
      issues.push("service_change_candidate_without_change_type");
    }
  }

  if (
    isThirdPartyEvaluationSource(input.sourceRef) &&
    (factClassification === "official_fact" || factClassification === "official_claim")
  ) {
    factClassification = "third_party_evaluation";
    repairs.push("fact_classification_set_third_party_evaluation");
  }

  if (negativeEvidenceFlag === "none" && shouldSetProposedOnlyFlag(original)) {
    negativeEvidenceFlag = "proposed_only";
    repairs.push("negative_evidence_flag_set_proposed_only");
  }

  if (
    original.candidateType === "document_project_status_candidate" &&
    projectStatusSpanHasMultipleStatuses(evidenceQuote)
  ) {
    issues.push("project_status_spans_multiple_statuses");
  }
  if (
    original.candidateType === "document_project_status_candidate" &&
    projectStatusSpanHasMultipleProjects({
      quote: evidenceQuote,
      routeMentions: normalizedRouteMentions.routeMentions,
    })
  ) {
    issues.push("project_status_spans_multiple_projects");
  }

  const uniqueIssues = uniqueQualityIssues(issues);
  const uniqueRepairs = uniqueQualityRepairs(repairs);
  const quality = {
    issues: uniqueIssues,
    repairs: uniqueRepairs,
    validationState: validationStateForQuality(uniqueIssues),
    reviewReason: reviewReasonForQuality({ issues: uniqueIssues, repairs: uniqueRepairs }),
  } satisfies OcrMarkdownCandidateQuality;

  return {
    draft: {
      candidateType: original.candidateType,
      factClassification,
      negativeEvidenceFlag,
      routeMentions: normalizedRouteMentions.routeMentions,
      corridorMentions: [...original.corridorMentions],
      evidencePageRefs,
      evidenceQuote,
      summary: original.summary,
      fields,
    } as OcrEvidenceCandidateDraft,
    quality,
  };
}

async function processOcrEvidenceCandidateDrafts(input: {
  drafts: OcrEvidenceCandidateDraft[];
  sourceRef: Tier2CandidateSourceRef;
  runRoot: string;
  pages: Tier2OcrPageMarkdownAuditPage[];
}): Promise<ProcessedOcrEvidenceCandidateDraft[]> {
  const windowMarkdownByPage = await pageMarkdownByNumber({
    runRoot: input.runRoot,
    pages: input.pages,
  });
  return input.drafts.map((draft) =>
    processOcrEvidenceCandidateDraft({
      draft,
      sourceRef: input.sourceRef,
      windowMarkdownByPage,
    }),
  );
}

async function callDeepSeekMarkdownCandidates(input: {
  apiKey: string;
  model: string;
  maxTokens: number;
  source: Tier2OcrPlanSource;
  pages: Tier2OcrPageMarkdownAuditPage[];
  markdownText: string;
  fetcher: FetchLike;
}): Promise<OpenRouterCallResult> {
  return postDeepSeekChatCompletions({
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    body: {
      model: input.model,
      max_tokens: input.maxTokens,
      messages: [
        { role: "system", content: OCR_MARKDOWN_CANDIDATE_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildOcrMarkdownCandidatePrompt({
            source: input.source,
            pages: input.pages,
            markdownText: input.markdownText,
          }),
        },
      ],
      tools: [ocrMarkdownCandidateTool()],
      tool_choice: {
        type: "function",
        function: { name: OCR_MARKDOWN_CANDIDATE_TOOL_NAME },
      },
      temperature: 0,
    },
  });
}

function evidenceCandidateFromMarkdownDraft(input: {
  draft: OcrEvidenceCandidateDraft;
  sourceRef: Tier2CandidateSourceRef;
  pageMarkdownRootName: string;
  candidateRootName: string;
  windowPages: number[];
  index: number;
  quality?: OcrMarkdownCandidateQuality;
}): Tier2DocumentEvidenceCandidate {
  return {
    candidateType: input.draft.candidateType,
    candidateId: `document_evidence:${input.sourceRef.sourceId}:ocr_markdown:${input.draft.candidateType}:${shortHash(
      [
        input.draft.factClassification,
        input.draft.negativeEvidenceFlag,
        ...input.draft.routeMentions,
        ...input.draft.corridorMentions,
        ...input.draft.evidencePageRefs.map(String),
        input.draft.evidenceQuote,
        input.draft.summary,
        JSON.stringify(input.draft.fields),
        input.windowPages.join(","),
        String(input.index),
      ].join("|"),
    )}`,
    sourceRef: input.sourceRef,
    factClassification: input.draft.factClassification,
    negativeEvidenceFlag: input.draft.negativeEvidenceFlag,
    routeMentions: [...input.draft.routeMentions],
    corridorMentions: [...input.draft.corridorMentions],
    evidencePageRefs: [...input.draft.evidencePageRefs],
    evidenceQuote: input.draft.evidenceQuote,
    summary: input.draft.summary,
    fields: { ...input.draft.fields },
    extraction: {
      pageMarkdownRootName: input.pageMarkdownRootName,
      candidateRootName: input.candidateRootName,
      windowPages: [...input.windowPages],
      ...(input.quality?.issues.length ? { qualityIssues: [...input.quality.issues] } : {}),
      ...(input.quality?.repairs.length ? { qualityRepairs: [...input.quality.repairs] } : {}),
    },
    validationState: input.quality?.validationState ?? "unvalidated",
    reviewReason: input.quality?.reviewReason ?? DEFAULT_OCR_MARKDOWN_CANDIDATE_REVIEW_REASON,
  };
}

function markdownSourceRef(input: {
  capturedSource: Tier2CapturedSource | null;
  source: Tier2OcrPlanSource;
  pageMarkdownRootName: string;
  sourceIndex: number;
  pages: number[];
}): Tier2CandidateSourceRef {
  const sourceArtifactRoot = `${input.pageMarkdownRootName}/sources/${String(
    input.sourceIndex + 1,
  ).padStart(4, "0")}_${input.source.sourceId}`;
  return {
    sourceId: input.source.sourceId,
    sourceUrl: input.source.sourceUrl,
    title: input.source.title,
    publisher: input.source.publisher,
    documentDate: input.capturedSource?.documentDate ?? null,
    sourceGroup: input.source.sourceGroup,
    artifactKeys: {
      raw: input.source.rawArtifactKey,
      text: input.capturedSource?.textArtifactKey ?? null,
      ocrText: sourceArtifactRoot,
      ocrJson: null,
      ocrAnnotations: null,
    },
    pages: input.pages,
  };
}

async function readExistingMarkdownCandidateWindow(input: {
  paths: ReturnType<typeof ocrMarkdownCandidateWindowPaths>;
  runRoot: string;
  sourceRef: Tier2CandidateSourceRef;
  pageMarkdownRootName: string;
  candidateRootName: string;
  pages: Tier2OcrPageMarkdownAuditPage[];
}): Promise<{
  window: Tier2OcrMarkdownCandidateWindow;
  candidates: Tier2DocumentEvidenceCandidate[];
} | null> {
  if (!(await Bun.file(input.paths.toolCallPath).exists())) return null;
  const toolCall = await Bun.file(input.paths.toolCallPath).json();
  const drafts = markdownCandidateRecordCandidates(toolCall);
  const pageNumbers = input.pages.map((page) => page.pageNumber);
  const processedDrafts = await processOcrEvidenceCandidateDrafts({
    drafts,
    sourceRef: input.sourceRef,
    runRoot: input.runRoot,
    pages: input.pages,
  });
  return {
    window: {
      sourceId: input.sourceRef.sourceId,
      pages: pageNumbers,
      status: "extracted",
      reusedExisting: true,
      responseArtifactKey: (await Bun.file(input.paths.responsePath).exists())
        ? artifactKey(input.paths.responsePath, input.runRoot)
        : null,
      toolCallArtifactKey: artifactKey(input.paths.toolCallPath, input.runRoot),
      candidateCount: processedDrafts.length,
      usage: null,
      error: null,
    },
    candidates: processedDrafts.map(({ draft, quality }, index) =>
      evidenceCandidateFromMarkdownDraft({
        draft,
        sourceRef: input.sourceRef,
        pageMarkdownRootName: input.pageMarkdownRootName,
        candidateRootName: input.candidateRootName,
        windowPages: pageNumbers,
        index,
        quality,
      }),
    ),
  };
}

function pageWindowMarkdown(input: {
  runRoot: string;
  pages: Tier2OcrPageMarkdownAuditPage[];
}): Promise<string> {
  return Promise.all(
    input.pages.map(async (page) => {
      if (page.markdownArtifactKey === null) return "";
      const text = await Bun.file(join(input.runRoot, page.markdownArtifactKey)).text();
      return [`## Page ${page.pageNumber}`, markdownBody(text)].join("\n\n");
    }),
  ).then((parts) => parts.filter((part) => part.trim().length > 0).join("\n\n---\n\n"));
}

async function extractOcrMarkdownCandidateWindow(input: {
  source: Tier2OcrPlanSource;
  sourceRef: Tier2CandidateSourceRef;
  pages: Tier2OcrPageMarkdownAuditPage[];
  runRoot: string;
  sourceRoot: string;
  pageMarkdownRootName: string;
  candidateRootName: string;
  model: string;
  serviceTier: "flex" | "priority";
  maxTokens: number;
  execute: boolean;
  fetcher: FetchLike;
  apiKey: string | undefined;
}): Promise<{
  window: Tier2OcrMarkdownCandidateWindow;
  candidates: Tier2DocumentEvidenceCandidate[];
}> {
  const pageNumbers = input.pages.map((page) => page.pageNumber);
  const paths = ocrMarkdownCandidateWindowPaths({
    sourceRoot: input.sourceRoot,
    pages: pageNumbers,
  });
  await mkdir(paths.windowRoot, { recursive: true });
  const existing = await readExistingMarkdownCandidateWindow({
    paths,
    runRoot: input.runRoot,
    sourceRef: input.sourceRef,
    pageMarkdownRootName: input.pageMarkdownRootName,
    candidateRootName: input.candidateRootName,
    pages: input.pages,
  });
  if (existing !== null) return existing;
  if (!input.execute) {
    return {
      window: {
        sourceId: input.source.sourceId,
        pages: pageNumbers,
        status: "prepared",
        reusedExisting: false,
        responseArtifactKey: null,
        toolCallArtifactKey: null,
        candidateCount: 0,
        usage: null,
        error: null,
      },
      candidates: [],
    };
  }
  if (input.apiKey === undefined || input.apiKey.length === 0) {
    throw new Error("DEEPSEEK_API_KEY is required for docs:ocr-markdown-candidates --execute.");
  }
  const markdownText = await pageWindowMarkdown({ runRoot: input.runRoot, pages: input.pages });
  const openRouter = await callDeepSeekMarkdownCandidates({
    apiKey: input.apiKey,
    model: input.model,
    maxTokens: input.maxTokens,
    source: input.source,
    pages: input.pages,
    markdownText,
    fetcher: input.fetcher,
  });
  await writeJson(paths.responsePath, openRouter.body);
  const providerErrorMessage = openRouterErrorMessage(openRouter.body);
  if (!openRouter.response.ok || providerErrorMessage !== null) {
    const errorMessage =
      providerErrorMessage === null
        ? `OpenRouter HTTP ${openRouter.response.status} ${openRouter.response.statusText}`
        : `OpenRouter provider error: ${providerErrorMessage}`;
    await writeJson(paths.errorPath, {
      sourceId: input.source.sourceId,
      pages: pageNumbers,
      httpStatus: openRouter.response.status,
      statusText: openRouter.response.statusText,
      error: errorMessage,
    });
    return {
      window: {
        sourceId: input.source.sourceId,
        pages: pageNumbers,
        status: "failed",
        reusedExisting: false,
        responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
        toolCallArtifactKey: null,
        candidateCount: 0,
        usage: null,
        error: errorMessage,
      },
      candidates: [],
    };
  }
  const toolArgs = extractToolCallArguments(openRouter.body, OCR_MARKDOWN_CANDIDATE_TOOL_NAME);
  if (toolArgs === null) {
    const errorMessage = missingToolCallErrorMessage({
      responseJson: openRouter.body,
      toolName: OCR_MARKDOWN_CANDIDATE_TOOL_NAME,
      maxTokens: input.maxTokens,
    });
    await writeJson(paths.errorPath, {
      sourceId: input.source.sourceId,
      pages: pageNumbers,
      error: errorMessage,
    });
    return {
      window: {
        sourceId: input.source.sourceId,
        pages: pageNumbers,
        status: "failed",
        reusedExisting: false,
        responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
        toolCallArtifactKey: null,
        candidateCount: 0,
        usage: (openRouter.body as { usage?: unknown }).usage ?? null,
        error: errorMessage,
      },
      candidates: [],
    };
  }
  await writeJson(paths.toolCallPath, toolArgs);
  const drafts = markdownCandidateRecordCandidates(toolArgs);
  const processedDrafts = await processOcrEvidenceCandidateDrafts({
    drafts,
    sourceRef: input.sourceRef,
    runRoot: input.runRoot,
    pages: input.pages,
  });
  const candidates = processedDrafts.map(({ draft, quality }, index) =>
    evidenceCandidateFromMarkdownDraft({
      draft,
      sourceRef: input.sourceRef,
      pageMarkdownRootName: input.pageMarkdownRootName,
      candidateRootName: input.candidateRootName,
      windowPages: pageNumbers,
      index,
      quality,
    }),
  );
  return {
    window: {
      sourceId: input.source.sourceId,
      pages: pageNumbers,
      status: "extracted",
      reusedExisting: false,
      responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
      toolCallArtifactKey: artifactKey(paths.toolCallPath, input.runRoot),
      candidateCount: candidates.length,
      usage: (openRouter.body as { usage?: unknown }).usage ?? null,
      error: null,
    },
    candidates,
  };
}

function chunkPages<T>(pages: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < pages.length; index += size) {
    chunks.push(pages.slice(index, index + size));
  }
  return chunks;
}

function candidateValidationStateCounts(
  candidates: Tier2DocumentEvidenceCandidate[],
): Record<Tier2CandidateValidationState, number> {
  const counts: Record<Tier2CandidateValidationState, number> = {
    unvalidated: 0,
    validated: 0,
    needs_review: 0,
    rejected: 0,
  };
  for (const candidate of candidates) {
    counts[candidate.validationState] += 1;
  }
  return counts;
}

function candidateQualityIssueCounts(
  candidates: Tier2DocumentEvidenceCandidate[],
): Record<Tier2OcrMarkdownCandidateQualityIssueCode, number> {
  const counts = Object.fromEntries(
    OCR_MARKDOWN_CANDIDATE_QUALITY_ISSUE_CODES.map((code) => [code, 0]),
  ) as Record<Tier2OcrMarkdownCandidateQualityIssueCode, number>;
  for (const candidate of candidates) {
    for (const code of candidate.extraction.qualityIssues ?? []) {
      counts[code] += 1;
    }
  }
  return counts;
}

function candidateQualityRepairCounts(
  candidates: Tier2DocumentEvidenceCandidate[],
): Record<Tier2OcrMarkdownCandidateQualityRepairCode, number> {
  const counts = Object.fromEntries(
    OCR_MARKDOWN_CANDIDATE_QUALITY_REPAIR_CODES.map((code) => [code, 0]),
  ) as Record<Tier2OcrMarkdownCandidateQualityRepairCode, number>;
  for (const candidate of candidates) {
    for (const code of candidate.extraction.qualityRepairs ?? []) {
      counts[code] += 1;
    }
  }
  return counts;
}

export function recordQualityIssueCounts(input: {
  records: Tier2DocumentInterventionRecord[];
  droppedNoInterventionEvidenceCount: number;
}): Record<Tier2InterventionRecordQualityIssueCode, number> {
  const counts = Object.fromEntries(
    INTERVENTION_RECORD_QUALITY_ISSUE_CODES.map((code) => [code, 0]),
  ) as Record<Tier2InterventionRecordQualityIssueCode, number>;
  for (const record of input.records) {
    for (const code of record.extraction.qualityIssues ?? []) {
      if (isInterventionRecordQualityIssueCode(code)) {
        counts[code] += 1;
      }
    }
  }
  // Records dropped by the eligibility filter never reach persistence, so
  // attach the source-level drop count here so it appears in the same
  // issue counters as other per-record issues.
  counts["phase3_record_dropped_no_intervention_evidence"] =
    input.droppedNoInterventionEvidenceCount;
  return counts;
}

export function recordQualityRepairCounts(
  records: Tier2DocumentInterventionRecord[],
): Record<Tier2InterventionRecordQualityRepairCode, number> {
  const counts = Object.fromEntries(
    INTERVENTION_RECORD_QUALITY_REPAIR_CODES.map((code) => [code, 0]),
  ) as Record<Tier2InterventionRecordQualityRepairCode, number>;
  for (const record of records) {
    for (const code of record.extraction.qualityRepairs ?? []) {
      if (isInterventionRecordQualityRepairCode(code)) {
        counts[code] += 1;
      }
    }
  }
  return counts;
}

export async function extractTier2OcrMarkdownCandidates(
  args: ExtractTier2OcrMarkdownCandidatesArgs,
): Promise<Tier2OcrMarkdownCandidateExtraction> {
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const audit = (await Bun.file(args.pageMarkdownAuditPath).json()) as Tier2OcrPageMarkdownAudit;
  const captureManifest = (await Bun.file(plan.captureManifestPath).json()) as Tier2CaptureManifest;
  const capturedById = new Map(captureManifest.sources.map((source) => [source.sourceId, source]));
  const auditById = new Map(audit.sources.map((source) => [source.sourceId, source]));
  const runRoot = dirname(plan.captureManifestPath);
  const model = args.model ?? process.env["DEEPSEEK_TEXT_MODEL"] ?? DEFAULT_TEXT_MODEL;
  const serviceTier = args.serviceTier ?? "flex";
  const maxTokens = args.maxTokens ?? DEFAULT_OCR_MAX_TOKENS;
  const pageWindowSize = args.pageWindowSize ?? 4;
  const windowConcurrency = args.windowConcurrency ?? 3;
  if (!Number.isInteger(pageWindowSize) || pageWindowSize < 1) {
    throw new Error("--page-window-size must be a positive integer.");
  }
  if (!Number.isInteger(windowConcurrency) || windowConcurrency < 1) {
    throw new Error("--window-concurrency must be a positive integer.");
  }
  const sourceFilter = new Set(args.sourceIds ?? []);
  const selectedSources = plan.sources
    .map((source, sourceIndex) => ({ source, sourceIndex }))
    .filter(({ source }) => sourceFilter.size === 0 || sourceFilter.has(source.sourceId))
    .slice(0, args.limitSources ?? plan.sources.length);
  const pageMarkdownRootName = normalizeOcrPageMarkdownRootName(args.pageMarkdownRootName);
  const candidateRootName = normalizeOcrArtifactRootName({
    value: args.candidateRootName,
    defaultName: "ocr-markdown-candidates",
    flagName: "--candidate-root",
  });
  const execute = args.execute ?? false;
  const fetcher = args.fetcher ?? defaultFetch;
  const apiKey = args.apiKey ?? process.env["DEEPSEEK_API_KEY"];
  const windows: Tier2OcrMarkdownCandidateWindow[] = [];
  const documentEvidenceCandidates: Tier2DocumentEvidenceCandidate[] = [];

  for (const selected of selectedSources) {
    const auditSource = auditById.get(selected.source.sourceId);
    if (auditSource === undefined) continue;
    const candidatePages = auditSource.pages.filter(
      (page) => page.status === "ocr_complete" && !page.blankPageLikely,
    );
    const sourceRoot = ocrMarkdownCandidateSourceRoot({
      runRoot,
      source: selected.source,
      sourceIndex: selected.sourceIndex,
      candidateRootName,
    });
    const pageWindows = chunkPages(candidatePages, pageWindowSize);
    const sourceRef = markdownSourceRef({
      capturedSource: capturedById.get(selected.source.sourceId) ?? null,
      source: selected.source,
      pageMarkdownRootName,
      sourceIndex: selected.sourceIndex,
      pages: candidatePages.map((page) => page.pageNumber),
    });
    const extracted = await mapWithConcurrency(pageWindows, windowConcurrency, async (pages) =>
      extractOcrMarkdownCandidateWindow({
        source: selected.source,
        sourceRef,
        pages,
        runRoot,
        sourceRoot,
        pageMarkdownRootName,
        candidateRootName,
        model,
        serviceTier,
        maxTokens,
        execute,
        fetcher,
        apiKey,
      }),
    );
    for (const result of extracted) {
      windows.push(result.window);
      documentEvidenceCandidates.push(...result.candidates);
    }
  }

  const candidateTypeCounts: Record<string, number> = {};
  for (const candidate of documentEvidenceCandidates) {
    candidateTypeCounts[candidate.candidateType] =
      (candidateTypeCounts[candidate.candidateType] ?? 0) + 1;
  }
  const artifact: Tier2OcrMarkdownCandidateExtraction = {
    version: 1,
    runId: plan.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    ocrPlanPath: args.ocrPlanPath,
    pageMarkdownAuditPath: args.pageMarkdownAuditPath,
    outputPath: args.outputPath ?? null,
    provider: "openrouter",
    model,
    serviceTier,
    maxTokens,
    pageMarkdownRootName,
    candidateRootName,
    promptVersion: OCR_MARKDOWN_CANDIDATE_PROMPT_VERSION,
    execute,
    summary: {
      selectedSourceCount: selectedSources.length,
      windowCount: windows.length,
      extractedWindowCount: windows.filter((window) => window.status === "extracted").length,
      failedWindowCount: windows.filter((window) => window.status === "failed").length,
      reusedExistingWindowCount: windows.filter((window) => window.reusedExisting).length,
      candidateCount: documentEvidenceCandidates.length,
      candidateTypeCounts,
      candidateValidationStateCounts: candidateValidationStateCounts(documentEvidenceCandidates),
      candidateQualityIssueCounts: candidateQualityIssueCounts(documentEvidenceCandidates),
      candidateQualityRepairCounts: candidateQualityRepairCounts(documentEvidenceCandidates),
    },
    windows,
    documentEvidenceCandidates,
  };
  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }
  return artifact;
}

function parseOcrPageMarkdownAuditCliArgs(args: string[]): OcrPageMarkdownAuditCliArgs {
  const options: CliOption<OcrPageMarkdownAuditCliArgs>[] = [
    {
      flags: ["--ocr-plan"],
      apply: (output, value) => {
        if (value !== undefined) output.ocrPlanPath = fromCliPath(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--page-markdown-root", "--triage-root"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownRootName = value;
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveOcrPageMarkdownAuditPaths(
  args: OcrPageMarkdownAuditCliArgs,
): Promise<{ ocrPlanPath: string; outputPath: string }> {
  if (args.ocrPlanPath !== undefined) {
    return {
      ocrPlanPath: args.ocrPlanPath,
      outputPath:
        args.outputPath ?? join(dirname(args.ocrPlanPath), "ocr-page-markdown-audit.json"),
    };
  }
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }
  return {
    ocrPlanPath: ocrPlanPath(artifactRoot, runId),
    outputPath:
      args.outputPath ?? join(runArtifactRoot(artifactRoot, runId), "ocr-page-markdown-audit.json"),
  };
}

export async function auditTier2OcrPageMarkdownFromCli(
  args: string[],
): Promise<Tier2OcrPageMarkdownAudit> {
  const parsed = parseOcrPageMarkdownAuditCliArgs(args);
  const paths = await resolveOcrPageMarkdownAuditPaths(parsed);
  return auditTier2OcrPageMarkdown({
    ...paths,
    ...(parsed.pageMarkdownRootName !== undefined
      ? { pageMarkdownRootName: parsed.pageMarkdownRootName }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// Phase 1b: text → pseudo-page Markdown normalizer
//
// Brings sources captured as `text.txt` (textExtractionStatus === "html_text")
// into the same per-page Markdown shape that OCR-PDF sources use, so Phase 2
// candidate extraction and Phase 3 intervention synthesis can consume them
// without any code changes. The captured text is preserved byte-for-byte
// across pseudo-pages so Phase 2's verbatim `.includes(evidenceQuote)` check
// against `markdownBody(page)` keeps working.
// ---------------------------------------------------------------------------

const DEFAULT_TEXT_PAGE_MARKDOWN_ROOT_NAME = "text-page-markdown-v1";
const TEXT_PAGE_MAX_SINGLE_CHARS = 8000;
const TEXT_PAGE_TARGET_CHUNK_CHARS = 6000;
const TEXT_PAGE_MIN_USEFUL_CHARS = 200;

export type TextPageMarkdownPageQuality = "ok" | "too_short";

export type TextPageMarkdownPage = {
  pageNumber: number;
  chunkIndex: number;
  chunkCount: number;
  textOffset: number;
  textLength: number;
  markdownCharCount: number;
  markdownBodyCharCount: number;
  markdownArtifactKey: string;
};

export type TextPageMarkdownSource = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceGroup: string;
  sourceUrl: string;
  finalUrl: string;
  originalArtifactKey: string;
  originalLength: number;
  pageCount: number;
  completePageCount: number;
  quality: TextPageMarkdownPageQuality;
  pages: TextPageMarkdownPage[];
};

export type TextPageMarkdownAudit = {
  version: 1;
  runId: string;
  generatedAt: string;
  captureManifestPath: string;
  outputPath: string | null;
  pageMarkdownRootName: string;
  inputMode: "captured_text";
  phase2CompatPlanPath: string;
  phase2CompatAuditPath: string;
  summary: {
    sourceCount: number;
    pageCount: number;
    completePageCount: number;
    tooShortSourceCount: number;
    totalOriginalLength: number;
  };
  sources: TextPageMarkdownSource[];
};

// Split captured text into byte-exact pseudo-pages.
// Guarantees: `splitCapturedTextIntoPages(text).join("") === text`,
// every chunk <= TEXT_PAGE_MAX_SINGLE_CHARS, and splits prefer
// sentence boundaries (`. `, `! `, `? `), then any space, then a hard
// character boundary. Captured HTML text is already a single line
// (stripHtmlToText collapses whitespace), so paragraph splitting is
// unavailable — sentence-then-space keeps most quotes inside one chunk.
export function splitCapturedTextIntoPages(text: string): string[] {
  if (text.length <= TEXT_PAGE_MAX_SINGLE_CHARS) {
    return [text];
  }
  const pages: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    const remaining = text.length - offset;
    if (remaining <= TEXT_PAGE_MAX_SINGLE_CHARS) {
      pages.push(text.slice(offset));
      break;
    }
    const minEnd = offset + TEXT_PAGE_TARGET_CHUNK_CHARS;
    const maxEnd = Math.min(text.length, offset + TEXT_PAGE_MAX_SINGLE_CHARS);
    let splitAt = -1;
    for (let i = minEnd; i < maxEnd; i += 1) {
      const prev = text.charAt(i - 1);
      const here = text.charAt(i);
      if ((prev === "." || prev === "!" || prev === "?") && here === " ") {
        splitAt = i + 1;
        break;
      }
    }
    if (splitAt === -1) {
      for (let i = minEnd; i < maxEnd; i += 1) {
        if (text.charAt(i) === " ") {
          splitAt = i + 1;
          break;
        }
      }
    }
    if (splitAt === -1 || splitAt <= offset) {
      splitAt = maxEnd;
    }
    pages.push(text.slice(offset, splitAt));
    offset = splitAt;
  }
  return pages;
}

function textPageMarkdownSourceRoot(input: {
  runRoot: string;
  pageMarkdownRootName: string;
  sourceIndex: number;
  sourceId: string;
}): string {
  return join(
    input.runRoot,
    input.pageMarkdownRootName,
    "sources",
    `${String(input.sourceIndex + 1).padStart(4, "0")}_${input.sourceId}`,
  );
}

// Build the Markdown file for a single captured-text pseudo-page. Frontmatter
// mirrors the OCR page-Markdown shape (one `key: value` line per field, values
// JSON-encoded via `frontmatterValue`) so `markdownBody` and
// `markdownFrontmatterString` parse it identically.
export function buildTextPageMarkdown(input: {
  source: Tier2CapturedSource;
  pageNumber: number;
  chunkIndex: number;
  chunkCount: number;
  originalLength: number;
  originalArtifactKey: string;
  generatedAt: string;
  chunk: string;
}): string {
  const frontmatter: Record<string, unknown> = {
    sourceId: input.source.sourceId,
    title: input.source.title,
    publisher: input.source.publisher,
    sourceGroup: input.source.sourceGroup,
    sourceUrl: input.source.sourceUrl,
    finalUrl: input.source.finalUrl,
    originalArtifactKey: input.originalArtifactKey,
    pageNumber: input.pageNumber,
    chunkIndex: input.chunkIndex,
    chunkCount: input.chunkCount,
    originalLength: input.originalLength,
    inputMode: "captured_text",
    pageKind: "text_chunk",
    generatedAt: input.generatedAt,
  };
  const lines = [
    "---",
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${frontmatterValue(value)}`),
    "---",
    "",
    input.chunk,
    "",
  ];
  return lines.join("\n");
}

export type NormalizeTextMarkdownArgs = {
  captureManifestPath: string;
  pageMarkdownRootName?: string;
  outputPath?: string;
  phase2CompatPlanPath?: string;
  phase2CompatAuditPath?: string;
  sourceIds?: string[];
  generatedAt?: string;
};

const TEXT_NORMALIZED_PLAN_MODEL = "text-normalized-source";
const TEXT_NORMALIZED_NEXT_ACTION =
  "Run docs:ocr-markdown-candidates against normalized text pseudo-pages.";

// Build the Phase 2 compatibility "OCR plan" companion. Phase 2's
// extractTier2OcrMarkdownCandidates reads `Tier2OcrPlan` only to discover
// which sources to extract from; it does not actually run OCR. We synthesize
// a plan whose sources mirror the html_text capture entries 1:1 so Phase 2's
// existing loader runs without a parallel code path. The sentinel
// `model: "text-normalized-source"` signals this companion is not an OCR
// artifact even though its filename suffix is shaped like one.
function buildTextOcrPlanCompat(input: {
  manifest: Tier2CaptureManifest;
  captureManifestPath: string;
  outputPath: string;
  generatedAt: string;
  sources: TextPageMarkdownSource[];
  capturedById: Map<string, Tier2CapturedSource>;
}): Tier2OcrPlan {
  const planSources: Tier2OcrPlanSource[] = input.sources.map((source) => {
    const captured = input.capturedById.get(source.sourceId);
    return {
      sourceId: source.sourceId,
      title: source.title,
      publisher: source.publisher,
      sourceGroup: source.sourceGroup,
      sourceUrl: source.sourceUrl,
      finalUrl: source.finalUrl,
      rawArtifactKey: captured?.rawArtifactKey ?? source.originalArtifactKey,
      byteLength: captured?.byteLength ?? 0,
      sha256: captured?.sha256 ?? "",
      pageRange: `1-${source.pageCount}`,
      inputMode: "openrouter_pdf_file_or_rendered_pages",
      reviewState: "triage_ready",
      nextAction: TEXT_NORMALIZED_NEXT_ACTION,
    };
  });
  const totalBytes = planSources.reduce((sum, source) => sum + source.byteLength, 0);
  return {
    version: 1,
    runId: input.manifest.runId,
    generatedAt: input.generatedAt,
    captureManifestPath: input.captureManifestPath,
    outputPath: input.outputPath,
    runtime: "pi-mono",
    provider: "openrouter",
    model: TEXT_NORMALIZED_PLAN_MODEL,
    api: "chat.completions",
    summary: {
      ocrRequiredSourceCount: planSources.length,
      skippedSourceCount: 0,
      totalBytes,
      totalMegabytes: totalBytes / 1_000_000,
    },
    sources: planSources,
  };
}

// Build the Phase 2 compatibility page-Markdown audit. Phase 2 filters pages
// with `status === "ocr_complete" && !blankPageLikely`, so we mark every
// normalized page complete and use `blankPageLikely: true` to gate sources
// flagged "too_short" (e.g. the 24-byte mta_capital_dashboard).
function buildTextPageMarkdownAuditCompat(input: {
  runId: string;
  generatedAt: string;
  planPath: string;
  outputPath: string;
  pageMarkdownRootName: string;
  sources: TextPageMarkdownSource[];
}): Tier2OcrPageMarkdownAudit {
  const auditSources: Tier2OcrPageMarkdownAuditSource[] = input.sources.map((source) => {
    const pages: Tier2OcrPageMarkdownAuditPage[] = source.pages.map((page) => {
      const issueCodes: Tier2OcrPageMarkdownAuditIssueCode[] = [];
      if (page.markdownBodyCharCount === 0) issueCodes.push("markdown_empty");
      if (page.markdownBodyCharCount > 0 && page.markdownBodyCharCount < 120) {
        issueCodes.push("markdown_short");
      }
      const blankPageLikely = source.quality === "too_short";
      return {
        sourceId: source.sourceId,
        title: source.title,
        publisher: source.publisher,
        sourceGroup: source.sourceGroup,
        pageNumber: page.pageNumber,
        status: "ocr_complete",
        markdownArtifactKey: page.markdownArtifactKey,
        toolCallArtifactKey: null,
        responseArtifactKey: null,
        errorArtifactKey: null,
        renderArtifactKey: null,
        inputArtifactKey: page.markdownArtifactKey,
        markdownCharCount: page.markdownCharCount,
        markdownBodyCharCount: page.markdownBodyCharCount,
        containsTables: false,
        containsMaps: false,
        containsCharts: false,
        blankPageLikely,
        needsVisualReview: false,
        routesMentioned: [],
        corridorsMentioned: [],
        datesMentioned: [],
        metricHints: [],
        visualReviewHints: [],
        issueCodes,
        error: null,
      };
    });
    const issueCounts = emptyPageAuditIssueCounts();
    for (const page of pages) {
      for (const code of page.issueCodes) addPageAuditIssue(issueCounts, code);
    }
    return {
      sourceId: source.sourceId,
      title: source.title,
      publisher: source.publisher,
      sourceGroup: source.sourceGroup,
      sourceUrl: source.sourceUrl,
      pdfPageCount: null,
      pageCount: pages.length,
      completePageCount: pages.filter((page) => page.status === "ocr_complete").length,
      failedPageCount: 0,
      missingPageCount: 0,
      tablePageCount: 0,
      mapPageCount: 0,
      chartPageCount: 0,
      likelyBlankPageCount: pages.filter((page) => page.blankPageLikely).length,
      visualReviewPageCount: 0,
      totalMarkdownChars: pages.reduce((sum, page) => sum + page.markdownCharCount, 0),
      issueCounts,
      pages,
    };
  });
  const allPages = auditSources.flatMap((source) => source.pages);
  const summaryIssueCounts = emptyPageAuditIssueCounts();
  for (const page of allPages) {
    for (const code of page.issueCodes) addPageAuditIssue(summaryIssueCounts, code);
  }
  return {
    version: 1,
    runId: input.runId,
    generatedAt: input.generatedAt,
    ocrPlanPath: input.planPath,
    outputPath: input.outputPath,
    pageMarkdownRootName: input.pageMarkdownRootName,
    summary: {
      plannedSourceCount: auditSources.length,
      sourceCount: auditSources.length,
      pageCount: allPages.length,
      completePageCount: allPages.filter((page) => page.status === "ocr_complete").length,
      failedPageCount: 0,
      missingPageCount: 0,
      toolCallCount: 0,
      responseCount: 0,
      tablePageCount: 0,
      mapPageCount: 0,
      chartPageCount: 0,
      likelyBlankPageCount: allPages.filter((page) => page.blankPageLikely).length,
      visualReviewPageCount: 0,
      totalMarkdownChars: allPages.reduce((sum, page) => sum + page.markdownCharCount, 0),
      issueCounts: summaryIssueCounts,
    },
    sources: auditSources,
  };
}

export async function normalizeTextMarkdown(
  args: NormalizeTextMarkdownArgs,
): Promise<TextPageMarkdownAudit> {
  const manifest = (await Bun.file(args.captureManifestPath).json()) as Tier2CaptureManifest;
  const runRoot = dirname(args.captureManifestPath);
  const pageMarkdownRootName = normalizeOcrArtifactRootName({
    value: args.pageMarkdownRootName,
    defaultName: DEFAULT_TEXT_PAGE_MARKDOWN_ROOT_NAME,
    flagName: "--page-markdown-root",
  });
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const filterSet = args.sourceIds === undefined ? null : new Set(args.sourceIds);

  const eligible = manifest.sources.filter(
    (source) =>
      source.textExtractionStatus === "html_text" &&
      source.textArtifactKey !== null &&
      (filterSet === null || filterSet.has(source.sourceId)),
  );

  const sources: TextPageMarkdownSource[] = [];
  for (let index = 0; index < eligible.length; index += 1) {
    const source = eligible[index];
    if (source === undefined) continue;
    const textArtifactKey = source.textArtifactKey;
    if (textArtifactKey === null) continue;
    const sourceRoot = textPageMarkdownSourceRoot({
      runRoot,
      pageMarkdownRootName,
      sourceIndex: index,
      sourceId: source.sourceId,
    });
    const textPath = join(runRoot, textArtifactKey);
    const rawText = await Bun.file(textPath).text();
    // writeRawArtifacts appends a single trailing newline to text.txt. Strip
    // it so the joined chunks equal the original stripped text byte-for-byte.
    const text = rawText.endsWith("\n") ? rawText.slice(0, -1) : rawText;
    const chunks = splitCapturedTextIntoPages(text);
    const quality: TextPageMarkdownPageQuality =
      text.length < TEXT_PAGE_MIN_USEFUL_CHARS ? "too_short" : "ok";
    const pages: TextPageMarkdownPage[] = [];
    let runningOffset = 0;
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      if (chunk === undefined) continue;
      const pageNumber = chunkIndex + 1;
      const pageRoot = join(sourceRoot, "pages", String(pageNumber).padStart(4, "0"));
      const pagePath = join(pageRoot, "page.md");
      const content = buildTextPageMarkdown({
        source,
        pageNumber,
        chunkIndex: pageNumber,
        chunkCount: chunks.length,
        originalLength: text.length,
        originalArtifactKey: textArtifactKey,
        generatedAt,
        chunk,
      });
      await mkdir(pageRoot, { recursive: true });
      await Bun.write(pagePath, content);
      pages.push({
        pageNumber,
        chunkIndex: pageNumber,
        chunkCount: chunks.length,
        textOffset: runningOffset,
        textLength: chunk.length,
        markdownCharCount: content.length,
        markdownBodyCharCount: markdownBody(content).length,
        markdownArtifactKey: artifactKey(pagePath, runRoot),
      });
      runningOffset += chunk.length;
    }
    sources.push({
      sourceId: source.sourceId,
      title: source.title,
      publisher: source.publisher,
      sourceGroup: source.sourceGroup,
      sourceUrl: source.sourceUrl,
      finalUrl: source.finalUrl,
      originalArtifactKey: textArtifactKey,
      originalLength: text.length,
      pageCount: pages.length,
      completePageCount: quality === "ok" ? pages.length : 0,
      quality,
      pages,
    });
  }

  const outputPath = args.outputPath ?? join(runRoot, "text-page-markdown-audit.json");
  const phase2CompatPlanPath = args.phase2CompatPlanPath ?? join(runRoot, "text-ocr-plan-v1.json");
  const phase2CompatAuditPath =
    args.phase2CompatAuditPath ?? join(runRoot, "text-page-markdown-phase2-audit.json");

  const audit: TextPageMarkdownAudit = {
    version: 1,
    runId: manifest.runId,
    generatedAt,
    captureManifestPath: args.captureManifestPath,
    outputPath,
    pageMarkdownRootName,
    inputMode: "captured_text",
    phase2CompatPlanPath,
    phase2CompatAuditPath,
    summary: {
      sourceCount: sources.length,
      pageCount: sources.reduce((sum, source) => sum + source.pageCount, 0),
      completePageCount: sources.reduce((sum, source) => sum + source.completePageCount, 0),
      tooShortSourceCount: sources.filter((source) => source.quality === "too_short").length,
      totalOriginalLength: sources.reduce((sum, source) => sum + source.originalLength, 0),
    },
    sources,
  };

  const capturedById = new Map(manifest.sources.map((source) => [source.sourceId, source]));
  const compatPlan = buildTextOcrPlanCompat({
    manifest,
    captureManifestPath: args.captureManifestPath,
    outputPath: phase2CompatPlanPath,
    generatedAt,
    sources,
    capturedById,
  });
  const compatAudit = buildTextPageMarkdownAuditCompat({
    runId: manifest.runId,
    generatedAt,
    planPath: phase2CompatPlanPath,
    outputPath: phase2CompatAuditPath,
    pageMarkdownRootName,
    sources,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, audit);
  await mkdir(dirname(phase2CompatPlanPath), { recursive: true });
  await writeJson(phase2CompatPlanPath, compatPlan);
  await mkdir(dirname(phase2CompatAuditPath), { recursive: true });
  await writeJson(phase2CompatAuditPath, compatAudit);
  return audit;
}

type NormalizeTextMarkdownCliArgs = {
  captureManifestPath?: string;
  artifactRoot?: string;
  runId?: string;
  pageMarkdownRootName?: string;
  outputPath?: string;
  phase2CompatPlanPath?: string;
  phase2CompatAuditPath?: string;
  sourceIds?: string[];
};

function parseNormalizeTextMarkdownCliArgs(args: string[]): NormalizeTextMarkdownCliArgs {
  const options: CliOption<NormalizeTextMarkdownCliArgs>[] = [
    {
      flags: ["--capture-manifest"],
      apply: (output, value) => {
        if (value !== undefined) output.captureManifestPath = fromCliPath(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id", "--run"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--page-markdown-root"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownRootName = value;
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--phase2-compat-plan"],
      apply: (output, value) => {
        if (value !== undefined) output.phase2CompatPlanPath = fromCliPath(value);
      },
    },
    {
      flags: ["--phase2-compat-audit"],
      apply: (output, value) => {
        if (value !== undefined) output.phase2CompatAuditPath = fromCliPath(value);
      },
    },
    {
      flags: ["--sources"],
      apply: (output, value) => {
        const parsed = parseSourceIds(value);
        if (parsed !== undefined) output.sourceIds = parsed;
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveNormalizeTextMarkdownPaths(
  parsed: NormalizeTextMarkdownCliArgs,
): Promise<{ captureManifestPath: string }> {
  if (parsed.captureManifestPath !== undefined) {
    return { captureManifestPath: parsed.captureManifestPath };
  }
  const artifactRoot = parsed.artifactRoot ?? defaultArtifactRootPath();
  const runId = parsed.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --capture-manifest.");
  }
  return { captureManifestPath: captureManifestPath(artifactRoot, runId) };
}

export async function normalizeTextMarkdownFromCli(args: string[]): Promise<TextPageMarkdownAudit> {
  const parsed = parseNormalizeTextMarkdownCliArgs(args);
  const paths = await resolveNormalizeTextMarkdownPaths(parsed);
  return normalizeTextMarkdown({
    captureManifestPath: paths.captureManifestPath,
    ...(parsed.pageMarkdownRootName !== undefined
      ? { pageMarkdownRootName: parsed.pageMarkdownRootName }
      : {}),
    ...(parsed.outputPath !== undefined ? { outputPath: parsed.outputPath } : {}),
    ...(parsed.phase2CompatPlanPath !== undefined
      ? { phase2CompatPlanPath: parsed.phase2CompatPlanPath }
      : {}),
    ...(parsed.phase2CompatAuditPath !== undefined
      ? { phase2CompatAuditPath: parsed.phase2CompatAuditPath }
      : {}),
    ...(parsed.sourceIds !== undefined ? { sourceIds: parsed.sourceIds } : {}),
  });
}

// ---------------------------------------------------------------------------
// Phase 1c: Wayback recapture for sources that failed initial capture
//
// Some MTA pages can still fail direct capture even after the native curl
// browser-navigation fallback in defaultFetch. This
// job targets those sources, queries the Internet Archive's CDX API for the
// most recent successful snapshot, fetches the original HTML via the `id_`
// Wayback flavor (no IA UI chrome), strips it to text using the same
// stripHtmlToText helper the primary capture uses, and updates the capture
// manifest in place so the source can join the html_text normalizer.
// ---------------------------------------------------------------------------

export type RecaptureSourceStatus = "recaptured" | "no_snapshot" | "failed";

export type RecaptureSourceResult = {
  sourceId: string;
  sourceUrl: string;
  status: RecaptureSourceStatus;
  httpStatus: number | null;
  waybackTimestamp: string | null;
  waybackUrl: string | null;
  textLength: number;
  error: string | null;
};

export type RecaptureAudit = {
  version: 1;
  runId: string;
  generatedAt: string;
  captureManifestPath: string;
  outputPath: string | null;
  summary: {
    attempted: number;
    recaptured: number;
    noSnapshot: number;
    failed: number;
  };
  sources: RecaptureSourceResult[];
};

const WAYBACK_CDX_BASE = "https://web.archive.org/cdx/search/cdx";

async function findWaybackSnapshot(input: {
  sourceUrl: string;
  fetcher: FetchLike;
}): Promise<{ timestamp: string; originalUrl: string } | null> {
  const params = new URLSearchParams({
    url: input.sourceUrl,
    output: "json",
    limit: "-1",
    filter: "statuscode:200",
  });
  const response = await input.fetcher(`${WAYBACK_CDX_BASE}?${params.toString()}`, {
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Wayback CDX HTTP ${response.status} ${response.statusText}`.trim());
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body) || body.length < 2) {
    return null;
  }
  const header = body[0];
  if (!Array.isArray(header)) return null;
  const timestampIndex = header.indexOf("timestamp");
  const originalIndex = header.indexOf("original");
  if (timestampIndex === -1 || originalIndex === -1) return null;
  const latest = body[body.length - 1];
  if (!Array.isArray(latest)) return null;
  const timestamp = latest[timestampIndex];
  const originalUrl = latest[originalIndex];
  if (typeof timestamp !== "string" || typeof originalUrl !== "string") return null;
  return { timestamp, originalUrl };
}

function waybackContentUrl(snapshot: { timestamp: string; originalUrl: string }): string {
  return `https://web.archive.org/web/${snapshot.timestamp}id_/${snapshot.originalUrl}`;
}

async function recaptureSource(input: {
  source: Tier2CapturedSource;
  fetcher: FetchLike;
  runRoot: string;
  retrievedAt: string;
}): Promise<{ result: RecaptureSourceResult; updated: Tier2CapturedSource }> {
  const baseResult: RecaptureSourceResult = {
    sourceId: input.source.sourceId,
    sourceUrl: input.source.sourceUrl,
    status: "failed",
    httpStatus: null,
    waybackTimestamp: null,
    waybackUrl: null,
    textLength: 0,
    error: null,
  };

  try {
    const snapshot = await findWaybackSnapshot({
      sourceUrl: input.source.sourceUrl,
      fetcher: input.fetcher,
    });
    if (snapshot === null) {
      return {
        result: { ...baseResult, status: "no_snapshot" },
        updated: input.source,
      };
    }
    const contentUrl = waybackContentUrl(snapshot);
    const response = await input.fetcher(contentUrl, { redirect: "follow" });
    if (!response.ok) {
      return {
        result: {
          ...baseResult,
          status: "failed",
          httpStatus: response.status,
          waybackTimestamp: snapshot.timestamp,
          waybackUrl: contentUrl,
          error: `Wayback content HTTP ${response.status} ${response.statusText}`.trim(),
        },
        updated: input.source,
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sourceRoot = join(input.runRoot, "sources", input.source.sourceId);
    await mkdir(sourceRoot, { recursive: true });
    const rawPath = join(sourceRoot, "source.html");
    await Bun.write(rawPath, bytes);
    const text = stripHtmlToText(decodeUtf8(bytes));
    const textPath = join(sourceRoot, "text.txt");
    await Bun.write(textPath, `${text}\n`);
    const recapturePath = join(sourceRoot, "recapture-metadata.json");
    await writeJson(recapturePath, {
      captureSource: "wayback",
      waybackTimestamp: snapshot.timestamp,
      waybackUrl: contentUrl,
      originalUrl: snapshot.originalUrl,
      retrievedAt: input.retrievedAt,
      textLength: text.length,
    });

    const updated: Tier2CapturedSource = {
      ...input.source,
      finalUrl: contentUrl,
      captureStatus: "captured",
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      detectedContentType: "html",
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      rawArtifactKey: artifactKey(rawPath, input.runRoot),
      textArtifactKey: artifactKey(textPath, input.runRoot),
      textLength: text.length,
      textExtractionStatus: "html_text",
      retrievedAt: input.retrievedAt,
      error: null,
    };
    return {
      result: {
        ...baseResult,
        status: "recaptured",
        httpStatus: response.status,
        waybackTimestamp: snapshot.timestamp,
        waybackUrl: contentUrl,
        textLength: text.length,
      },
      updated,
    };
  } catch (error) {
    return {
      result: {
        ...baseResult,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
      updated: input.source,
    };
  }
}

export type RecaptureFailedSourcesArgs = {
  captureManifestPath: string;
  sourceIds?: string[];
  fetcher?: FetchLike;
  outputPath?: string;
  generatedAt?: string;
};

export async function recaptureFailedSources(
  args: RecaptureFailedSourcesArgs,
): Promise<RecaptureAudit> {
  const manifest = (await Bun.file(args.captureManifestPath).json()) as Tier2CaptureManifest;
  const runRoot = dirname(args.captureManifestPath);
  const fetcher = args.fetcher ?? defaultFetch;
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const filterSet = args.sourceIds === undefined ? null : new Set(args.sourceIds);

  const results: RecaptureSourceResult[] = [];
  for (let index = 0; index < manifest.sources.length; index += 1) {
    const source = manifest.sources[index];
    if (source === undefined) continue;
    const isFailed = source.captureStatus === "failed";
    const inFilter = filterSet === null || filterSet.has(source.sourceId);
    if (!isFailed || !inFilter) continue;
    const { result, updated } = await recaptureSource({
      source,
      fetcher,
      runRoot,
      retrievedAt: generatedAt,
    });
    results.push(result);
    if (result.status === "recaptured") {
      manifest.sources[index] = updated;
      await writeSourceMetadata(runRoot, updated);
    }
  }

  manifest.summary = summarizeCapture(manifest.sources);
  await writeJson(args.captureManifestPath, manifest);

  const outputPath = args.outputPath ?? join(runRoot, "capture-recapture-audit.json");
  const audit: RecaptureAudit = {
    version: 1,
    runId: manifest.runId,
    generatedAt,
    captureManifestPath: args.captureManifestPath,
    outputPath,
    summary: {
      attempted: results.length,
      recaptured: results.filter((result) => result.status === "recaptured").length,
      noSnapshot: results.filter((result) => result.status === "no_snapshot").length,
      failed: results.filter((result) => result.status === "failed").length,
    },
    sources: results,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, audit);
  return audit;
}

type RecaptureCliArgs = {
  captureManifestPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  sourceIds?: string[];
};

function parseRecaptureCliArgs(args: string[]): RecaptureCliArgs {
  const options: CliOption<RecaptureCliArgs>[] = [
    {
      flags: ["--capture-manifest"],
      apply: (output, value) => {
        if (value !== undefined) output.captureManifestPath = fromCliPath(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id", "--run"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--sources"],
      apply: (output, value) => {
        const parsed = parseSourceIds(value);
        if (parsed !== undefined) output.sourceIds = parsed;
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveRecapturePaths(
  parsed: RecaptureCliArgs,
): Promise<{ captureManifestPath: string }> {
  if (parsed.captureManifestPath !== undefined) {
    return { captureManifestPath: parsed.captureManifestPath };
  }
  const artifactRoot = parsed.artifactRoot ?? defaultArtifactRootPath();
  const runId = parsed.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --capture-manifest.");
  }
  return { captureManifestPath: captureManifestPath(artifactRoot, runId) };
}

export async function recaptureFailedSourcesFromCli(args: string[]): Promise<RecaptureAudit> {
  const parsed = parseRecaptureCliArgs(args);
  const paths = await resolveRecapturePaths(parsed);
  return recaptureFailedSources({
    captureManifestPath: paths.captureManifestPath,
    ...(parsed.outputPath !== undefined ? { outputPath: parsed.outputPath } : {}),
    ...(parsed.sourceIds !== undefined ? { sourceIds: parsed.sourceIds } : {}),
  });
}

export function parseSourceIds(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const sourceIds = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return sourceIds.length === 0 ? undefined : sourceIds;
}

function parseOcrMarkdownCandidatesCliArgs(args: string[]): OcrMarkdownCandidatesCliArgs {
  const options: CliOption<OcrMarkdownCandidatesCliArgs>[] = [
    {
      flags: ["--ocr-plan"],
      apply: (output, value) => {
        if (value !== undefined) output.ocrPlanPath = fromCliPath(value);
      },
    },
    {
      flags: ["--page-markdown-audit"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownAuditPath = fromCliPath(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--page-markdown-root", "--triage-root"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownRootName = value;
      },
    },
    {
      flags: ["--candidate-root"],
      apply: (output, value) => {
        if (value !== undefined) output.candidateRootName = value;
      },
    },
    {
      flags: ["--model"],
      apply: (output, value) => {
        if (value !== undefined) output.model = value;
      },
    },
    {
      flags: ["--service-tier"],
      apply: (output, value) => {
        if (value === "flex" || value === "priority") {
          output.serviceTier = value;
          return;
        }
        throw new Error("--service-tier must be flex or priority.");
      },
    },
    {
      flags: ["--max-tokens"],
      apply: (output, value) => {
        output.maxTokens = Number(value);
      },
    },
    {
      flags: ["--source-ids"],
      apply: (output, value) => {
        const parsed = parseSourceIds(value);
        if (parsed !== undefined) output.sourceIds = parsed;
      },
    },
    {
      flags: ["--source-id"],
      apply: (output, value) => {
        const parsed = parseSourceIds(value);
        output.sourceIds = [...(output.sourceIds ?? []), ...(parsed ?? [])];
      },
    },
    {
      flags: ["--limit-sources"],
      apply: (output, value) => {
        output.limitSources = Number(value);
      },
    },
    {
      flags: ["--page-window-size"],
      apply: (output, value) => {
        output.pageWindowSize = Number(value);
      },
    },
    {
      flags: ["--window-concurrency"],
      apply: (output, value) => {
        output.windowConcurrency = Number(value);
      },
    },
    trueOption<OcrMarkdownCandidatesCliArgs>(["--execute"], (output) => {
      output.execute = true;
    }),
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveOcrMarkdownCandidatesPaths(
  args: OcrMarkdownCandidatesCliArgs,
): Promise<{ ocrPlanPath: string; pageMarkdownAuditPath: string; outputPath: string }> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId =
    args.runId ?? (args.ocrPlanPath === undefined ? await latestDocsRunId(artifactRoot) : null);
  const baseDir =
    args.ocrPlanPath !== undefined
      ? dirname(args.ocrPlanPath)
      : runId === null
        ? null
        : runArtifactRoot(artifactRoot, runId);
  if (baseDir === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }
  const resolvedOcrPlanPath =
    args.ocrPlanPath ?? (runId === null ? null : ocrPlanPath(artifactRoot, runId));
  if (resolvedOcrPlanPath === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }
  return {
    ocrPlanPath: resolvedOcrPlanPath,
    pageMarkdownAuditPath:
      args.pageMarkdownAuditPath ?? join(baseDir, "ocr-page-markdown-audit.json"),
    outputPath: args.outputPath ?? join(baseDir, "ocr-markdown-candidates.json"),
  };
}

export async function extractTier2OcrMarkdownCandidatesFromCli(
  args: string[],
): Promise<Tier2OcrMarkdownCandidateExtraction> {
  const parsed = parseOcrMarkdownCandidatesCliArgs(args);
  const paths = await resolveOcrMarkdownCandidatesPaths(parsed);
  return extractTier2OcrMarkdownCandidates({
    ...paths,
    ...(parsed.pageMarkdownRootName !== undefined
      ? { pageMarkdownRootName: parsed.pageMarkdownRootName }
      : {}),
    ...(parsed.candidateRootName !== undefined
      ? { candidateRootName: parsed.candidateRootName }
      : {}),
    ...(parsed.model !== undefined ? { model: parsed.model } : {}),
    ...(parsed.serviceTier !== undefined ? { serviceTier: parsed.serviceTier } : {}),
    ...(parsed.maxTokens !== undefined ? { maxTokens: parsed.maxTokens } : {}),
    ...(parsed.sourceIds !== undefined ? { sourceIds: parsed.sourceIds } : {}),
    ...(parsed.limitSources !== undefined ? { limitSources: parsed.limitSources } : {}),
    ...(parsed.pageWindowSize !== undefined ? { pageWindowSize: parsed.pageWindowSize } : {}),
    ...(parsed.windowConcurrency !== undefined
      ? { windowConcurrency: parsed.windowConcurrency }
      : {}),
    execute: parsed.execute ?? false,
  });
}

// ---------------------------------------------------------------------------
// Phase 3 record alias. The intervention-records synthesis policy now lives in
// @bp/analytics/interventions and its LLM/IO/CLI orchestration in
// ./_intervention-records.ts; only this persisted-record alias remains here,
// used by the artifact-summary counters above.
// ---------------------------------------------------------------------------

export type Tier2DocumentInterventionRecord = DocumentInterventionRecord;

function validationSummaryForBundle(bundle: {
  documentSourceCandidates: Tier2DocumentSourceCandidate[];
  documentEvidenceCandidates: Tier2DocumentEvidenceCandidate[];
  reviewQuestionCandidates: Tier2ReviewQuestionCandidate[];
  followupOcrCandidates: Tier2FollowupOcrCandidate[];
}): Record<Tier2CandidateValidationState, number> {
  const summary: Record<Tier2CandidateValidationState, number> = {
    unvalidated: 0,
    validated: 0,
    needs_review: 0,
    rejected: 0,
  };
  for (const candidate of [
    ...bundle.documentSourceCandidates,
    ...bundle.documentEvidenceCandidates,
    ...bundle.reviewQuestionCandidates,
    ...bundle.followupOcrCandidates,
  ]) {
    summary[candidate.validationState] += 1;
  }
  return summary;
}

function documentSourceCandidate(source: Tier2CapturedSource): Tier2DocumentSourceCandidate {
  return {
    candidateType: "document_source_candidate",
    candidateId: `document_source:${source.sourceId}`,
    sourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
    finalUrl: source.finalUrl,
    title: source.title,
    publisher: source.publisher,
    sourceGroup: source.sourceGroup,
    intendedUse: source.intendedUse,
    priority: source.priority,
    documentDate: source.documentDate,
    retrievedAt: source.retrievedAt,
    captureStatus: source.captureStatus,
    detectedContentType: source.detectedContentType,
    textExtractionStatus: source.textExtractionStatus,
    contentSha256: source.sha256,
    rawArtifactKey: source.rawArtifactKey,
    textArtifactKey: source.textArtifactKey,
    termsNote: source.termsNote,
    validationState: "unvalidated",
  };
}

export async function extractTier2Candidates(
  args: ExtractTier2CandidatesArgs,
): Promise<Tier2CandidateBundle> {
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const markdownCandidateExtraction = (await Bun.file(
    args.ocrMarkdownCandidateExtractionPath,
  ).json()) as Tier2OcrMarkdownCandidateExtraction;
  const captureManifest = (await Bun.file(plan.captureManifestPath).json()) as Tier2CaptureManifest;

  const documentSourceCandidates = captureManifest.sources.map(documentSourceCandidate);
  const documentEvidenceCandidates = [...markdownCandidateExtraction.documentEvidenceCandidates];
  const reviewQuestionCandidates: Tier2ReviewQuestionCandidate[] = [];
  const followupOcrCandidates: Tier2FollowupOcrCandidate[] = [];

  const partialBundle = {
    documentSourceCandidates,
    documentEvidenceCandidates,
    reviewQuestionCandidates,
    followupOcrCandidates,
  };
  const validationSummary = validationSummaryForBundle(partialBundle);
  const candidateCounts = {
    document_source_candidate: documentSourceCandidates.length,
    document_evidence_candidate: documentEvidenceCandidates.length,
    review_question_candidate: reviewQuestionCandidates.length,
    followup_ocr_candidate: followupOcrCandidates.length,
  };
  const llmExtractionAudits: Tier2LlmExtractionAudit[] = [
    {
      candidateType: "llm_extraction_audit",
      candidateId: `llm_extraction_audit:${plan.runId}:ocr_markdown_candidate_bundle`,
      model: markdownCandidateExtraction.model,
      provider: markdownCandidateExtraction.provider,
      serviceTier: markdownCandidateExtraction.serviceTier,
      extractionMode: "ocr_markdown_candidate_bundle",
      generatedAt: args.generatedAt ?? new Date().toISOString(),
      sourceCount: captureManifest.sources.length,
      candidateCounts,
      validationSummary,
    },
  ];

  const bundle: Tier2CandidateBundle = {
    version: 1,
    runId: plan.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    ocrPlanPath: args.ocrPlanPath,
    outputPath: args.outputPath ?? null,
    summary: {
      sourceCandidateCount: documentSourceCandidates.length,
      evidenceCandidateCount: documentEvidenceCandidates.length,
      reviewQuestionCandidateCount: reviewQuestionCandidates.length,
      followupOcrCandidateCount: followupOcrCandidates.length,
      auditCount: llmExtractionAudits.length,
      unvalidatedCandidateCount: validationSummary.unvalidated,
    },
    documentSourceCandidates,
    documentEvidenceCandidates,
    reviewQuestionCandidates,
    followupOcrCandidates,
    llmExtractionAudits,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, bundle);
  }

  return bundle;
}

function normalizedChunkText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitDocumentText(value: string, maxChars = 1400): string[] {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => normalizedChunkText(paragraph))
    .filter((paragraph) => paragraph.length > 0);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }
  };

  for (const paragraph of paragraphs.length > 0 ? paragraphs : [normalizedChunkText(value)]) {
    if (paragraph.length > maxChars) {
      flush();
      for (let index = 0; index < paragraph.length; index += maxChars) {
        const chunk = paragraph.slice(index, index + maxChars).trim();
        if (chunk.length > 0) {
          chunks.push(chunk);
        }
      }
      continue;
    }
    const next = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    if (next.length > maxChars) {
      flush();
      current = paragraph;
    } else {
      current = next;
    }
  }
  flush();
  return chunks;
}

function chunkExcerpt(value: string): string {
  const normalized = normalizedChunkText(value);
  return normalized.length <= 280 ? normalized : `${normalized.slice(0, 277).trimEnd()}...`;
}

function documentChunk(input: {
  sourceId: string;
  extractionMode: Tier2DocumentChunk["extractionMode"];
  artifactKey: string;
  pageRefs: number[];
  index: number;
  text: string;
}): Tier2DocumentChunk {
  return {
    chunkId: `chunk:${input.sourceId}:${input.extractionMode}:${input.index + 1}`,
    sourceId: input.sourceId,
    extractionMode: input.extractionMode,
    artifactKey: input.artifactKey,
    pageRefs: input.pageRefs,
    textHash: sha256(new TextEncoder().encode(input.text)),
    charLength: input.text.length,
    excerpt: chunkExcerpt(input.text),
    text: input.text,
  };
}

function sourceRefsForBundle(bundle: Tier2CandidateBundle): Tier2CandidateSourceRef[] {
  const refs: Tier2CandidateSourceRef[] = [];
  for (const candidate of [
    ...bundle.documentEvidenceCandidates,
    ...bundle.reviewQuestionCandidates,
    ...bundle.followupOcrCandidates,
  ]) {
    refs.push(candidate.sourceRef);
  }
  return refs;
}

export async function chunkTier2Documents(
  args: ChunkTier2DocumentsArgs,
): Promise<Tier2DocumentChunksArtifact> {
  const bundle = (await Bun.file(args.candidateBundlePath).json()) as Tier2CandidateBundle;
  const runRoot = dirname(args.candidateBundlePath);
  const chunks: Tier2DocumentChunk[] = [];

  for (const source of [...bundle.documentSourceCandidates].toSorted((a, b) =>
    a.sourceId.localeCompare(b.sourceId),
  )) {
    if (source.textArtifactKey === null) {
      continue;
    }
    const textPath = join(runRoot, source.textArtifactKey);
    if (!(await Bun.file(textPath).exists())) {
      continue;
    }
    const text = await Bun.file(textPath).text();
    for (const [index, chunkText] of splitDocumentText(text).entries()) {
      chunks.push(
        documentChunk({
          sourceId: source.sourceId,
          extractionMode: "html_text",
          artifactKey: source.textArtifactKey,
          pageRefs: [],
          index,
          text: chunkText,
        }),
      );
    }
  }

  const ocrArtifactRefs = new Map<string, Tier2CandidateSourceRef>();
  for (const sourceRef of sourceRefsForBundle(bundle)) {
    const artifactKey = sourceRef.artifactKeys.ocrAnnotations;
    if (artifactKey !== null && !ocrArtifactRefs.has(artifactKey)) {
      ocrArtifactRefs.set(artifactKey, sourceRef);
    }
  }

  for (const [artifactKey, sourceRef] of [...ocrArtifactRefs.entries()].toSorted((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const artifactPath = join(runRoot, artifactKey);
    const artifact = await readJsonArtifact(artifactPath);
    if (!artifact.exists || artifact.parseError) {
      continue;
    }
    const blocks = annotationTextBlocks(artifact.parsed);
    let chunkIndex = 0;
    for (const block of blocks) {
      for (const chunkText of splitDocumentText(block)) {
        chunks.push(
          documentChunk({
            sourceId: sourceRef.sourceId,
            extractionMode: "ocr_annotation_text",
            artifactKey,
            pageRefs: sourceRef.pages,
            index: chunkIndex,
            text: chunkText,
          }),
        );
        chunkIndex += 1;
      }
    }
  }

  const artifact: Tier2DocumentChunksArtifact = {
    version: 1,
    runId: bundle.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    candidateBundlePath: args.candidateBundlePath,
    outputPath: args.outputPath ?? null,
    summary: {
      sourceCount: new Set(chunks.map((chunk) => chunk.sourceId)).size,
      chunkCount: chunks.length,
      htmlChunkCount: chunks.filter((chunk) => chunk.extractionMode === "html_text").length,
      ocrChunkCount: chunks.filter((chunk) => chunk.extractionMode === "ocr_annotation_text")
        .length,
    },
    chunks,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }

  return artifact;
}

function supportPathExists(
  candidate: Tier2ManualInterventionCandidate,
  supportPath: string,
): boolean {
  if (
    [
      "canonicalName",
      "status",
      "program",
      "interventionType",
      "implementationDate",
      "datePrecision",
      "dateRole",
      "dateRangeEnd",
      "routesAffected",
      "routeRoles",
      "location",
    ].includes(supportPath)
  ) {
    return supportPath in candidate;
  }
  const componentMatch = /^components\[(\d+)\]$/.exec(supportPath);
  if (componentMatch !== null) {
    return candidate.components[Number(componentMatch[1])] !== undefined;
  }
  return false;
}

function addManualInterventionIssue(
  issues: Map<string, Set<string>>,
  candidateId: string,
  issueCode: string,
): void {
  const existing = issues.get(candidateId);
  if (existing !== undefined) {
    existing.add(issueCode);
    return;
  }
  issues.set(candidateId, new Set([issueCode]));
}

function addManualEventDispositionIssue(
  issues: Map<string, Set<string>>,
  eventId: string,
  issueCode: string,
): void {
  const existing = issues.get(eventId);
  if (existing !== undefined) {
    existing.add(issueCode);
    return;
  }
  issues.set(eventId, new Set([issueCode]));
}

function manualCandidateHasFieldEvidence(
  candidate: Tier2ManualInterventionCandidate,
  fieldName: string,
): boolean {
  return candidate.evidence.some((evidence) => evidence.supports.includes(fieldName));
}

export async function verifyTier2ManualInterventions(
  args: VerifyTier2ManualInterventionsArgs,
): Promise<Tier2ManualInterventionVerification> {
  const [manual, canonical, bundle, chunks] = await Promise.all([
    readRequiredJsonArtifact<Tier2ManualInterventionCandidatesArtifact>(
      args.manualInterventionsPath,
    ),
    readRequiredJsonArtifact<Tier2CanonicalInterventionEventsArtifact>(args.canonicalEventsPath),
    readRequiredJsonArtifact<Tier2CandidateBundle>(args.candidateBundlePath),
    readRequiredJsonArtifact<Tier2DocumentChunksArtifact>(args.documentChunksPath),
  ]);
  const eventIds = new Set(canonical.events.map((event) => event.eventId));
  const manualCandidateIds = new Set(manual.candidates.map((candidate) => candidate.candidateId));
  const candidateIds = new Set(
    (bundle.documentEvidenceCandidates ?? []).map((candidate) => candidate.candidateId),
  );
  const chunksById = new Map(chunks.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const issues = new Map<string, Set<string>>();

  for (const candidate of manual.candidates) {
    if (candidate.canonicalName.trim() === "") {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_canonical_name");
    }
    if (candidate.interventionType.trim() === "") {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_intervention_type");
    }
    if (candidate.implementationDate === undefined && candidate.dateUnknownReason === undefined) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_date_or_unknown_reason");
    }
    if (candidate.implementationDate !== undefined && candidate.datePrecision === undefined) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_date_precision");
    }
    if (candidate.dateRole.trim() === "") {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_date_role");
    }
    if (
      (candidate.routesAffected?.length ?? 0) === 0 &&
      candidate.routeUnknownReason === undefined
    ) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_routes_or_unknown_reason");
    }
    if (candidate.location.corridor === null && candidate.locationUnknownReason === undefined) {
      addManualInterventionIssue(
        issues,
        candidate.candidateId,
        "missing_location_or_unknown_reason",
      );
    }
    if (candidate.components.length === 0) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_components");
    }
    if (candidate.evidence.length === 0) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_evidence");
    }
    if (candidate.sourceEventIds.length === 0 && candidate.sourceCandidateIds.length === 0) {
      addManualInterventionIssue(issues, candidate.candidateId, "missing_backlinks");
    }

    const evidenceIds = new Set(candidate.evidence.map((evidence) => evidence.evidenceId));
    for (const component of candidate.components) {
      if (component.evidenceRefs.length === 0) {
        addManualInterventionIssue(issues, candidate.candidateId, "component_missing_evidence_ref");
      }
      for (const evidenceRef of component.evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) {
          addManualInterventionIssue(
            issues,
            candidate.candidateId,
            "component_unknown_evidence_ref",
          );
        }
      }
    }

    for (const evidence of candidate.evidence) {
      if (evidence.excerpt.trim() === "") {
        addManualInterventionIssue(issues, candidate.candidateId, "empty_evidence_excerpt");
      }
      if (evidence.supports.length === 0) {
        addManualInterventionIssue(issues, candidate.candidateId, "evidence_missing_supports");
      }
      for (const supportPath of evidence.supports) {
        if (!supportPathExists(candidate, supportPath)) {
          addManualInterventionIssue(issues, candidate.candidateId, "unknown_support_path");
        }
      }
      if (evidence.chunkIds.length === 0) {
        addManualInterventionIssue(issues, candidate.candidateId, "evidence_missing_chunk_ids");
      }
      for (const chunkId of evidence.chunkIds) {
        const chunk = chunksById.get(chunkId);
        if (chunk === undefined) {
          addManualInterventionIssue(issues, candidate.candidateId, "unknown_evidence_chunk");
        } else if (chunk.sourceId !== evidence.sourceId) {
          addManualInterventionIssue(
            issues,
            candidate.candidateId,
            "evidence_chunk_source_mismatch",
          );
        }
      }
    }

    for (const sourceEventId of candidate.sourceEventIds) {
      if (!eventIds.has(sourceEventId)) {
        addManualInterventionIssue(issues, candidate.candidateId, "unknown_source_event");
      }
    }
    for (const sourceCandidateId of candidate.sourceCandidateIds) {
      if (!candidateIds.has(sourceCandidateId)) {
        addManualInterventionIssue(issues, candidate.candidateId, "unknown_source_candidate");
      }
    }

    if (candidate.qualityTier === "canonical_milestone") {
      if (candidate.status !== "implemented") {
        addManualInterventionIssue(
          issues,
          candidate.candidateId,
          "canonical_milestone_not_implemented",
        );
      }
      for (const fieldName of ["implementationDate", "routesAffected", "location"]) {
        if (!manualCandidateHasFieldEvidence(candidate, fieldName)) {
          addManualInterventionIssue(
            issues,
            candidate.candidateId,
            `canonical_milestone_missing_${fieldName}_evidence`,
          );
        }
      }
    }
    if (candidate.qualityTier === "planned_or_proposed" && candidate.status === "implemented") {
      addManualInterventionIssue(
        issues,
        candidate.candidateId,
        "planned_candidate_marked_implemented",
      );
    }
  }

  const eventDispositionIssues = new Map<string, Set<string>>();
  const eventDispositions = manual.eventDispositions ?? [];
  const dispositionEventIds = new Set<string>();
  for (const disposition of eventDispositions) {
    if (!eventIds.has(disposition.eventId)) {
      addManualEventDispositionIssue(
        eventDispositionIssues,
        disposition.eventId,
        "unknown_disposition_event",
      );
    }
    if (dispositionEventIds.has(disposition.eventId)) {
      addManualEventDispositionIssue(
        eventDispositionIssues,
        disposition.eventId,
        "duplicate_event_disposition",
      );
    }
    dispositionEventIds.add(disposition.eventId);
    if (disposition.reason.trim() === "") {
      addManualEventDispositionIssue(
        eventDispositionIssues,
        disposition.eventId,
        "empty_disposition_reason",
      );
    }
    if (disposition.candidateId !== undefined && !manualCandidateIds.has(disposition.candidateId)) {
      addManualEventDispositionIssue(
        eventDispositionIssues,
        disposition.eventId,
        "unknown_disposition_candidate",
      );
    }
  }
  for (const event of canonical.events) {
    if (!dispositionEventIds.has(event.eventId)) {
      addManualEventDispositionIssue(
        eventDispositionIssues,
        event.eventId,
        "missing_event_disposition",
      );
    }
  }

  const candidateIssues = Array.from(issues.entries())
    .map(([candidateId, issueCodes]) => ({
      candidateId,
      issueCodes: Array.from(issueCodes).toSorted(),
    }))
    .toSorted((a, b) => a.candidateId.localeCompare(b.candidateId));
  const eventDispositionIssuesRows = Array.from(eventDispositionIssues.entries())
    .map(([eventId, issueCodes]) => ({
      eventId,
      issueCodes: Array.from(issueCodes).toSorted(),
    }))
    .toSorted((a, b) => a.eventId.localeCompare(b.eventId));
  const issueCount = candidateIssues.reduce((sum, issue) => sum + issue.issueCodes.length, 0);
  const eventDispositionIssueCount = eventDispositionIssuesRows.reduce(
    (sum, issue) => sum + issue.issueCodes.length,
    0,
  );
  const verification: Tier2ManualInterventionVerification = {
    version: 1,
    runId: manual.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    manualInterventionsPath: args.manualInterventionsPath,
    canonicalEventsPath: args.canonicalEventsPath,
    candidateBundlePath: args.candidateBundlePath,
    documentChunksPath: args.documentChunksPath,
    outputPath: args.outputPath ?? null,
    complete: issueCount === 0 && eventDispositionIssueCount === 0,
    summary: {
      candidateCount: manual.candidates.length,
      completeCandidateCount: manual.candidates.length - candidateIssues.length,
      issueCount: issueCount + eventDispositionIssueCount,
      canonicalMilestoneCount: manual.candidates.filter(
        (candidate) => candidate.qualityTier === "canonical_milestone",
      ).length,
      implementedTreatmentComponentCount: manual.candidates.filter(
        (candidate) => candidate.qualityTier === "implemented_treatment_component",
      ).length,
      plannedOrProposedCount: manual.candidates.filter(
        (candidate) => candidate.qualityTier === "planned_or_proposed",
      ).length,
      canonicalEventCount: canonical.events.length,
      eventDispositionCount: dispositionEventIds.size,
      undispositionedEventCount: canonical.events.length - dispositionEventIds.size,
    },
    candidateIssues,
    eventDispositionIssues: eventDispositionIssuesRows,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, verification);
  }

  return verification;
}

function duplicateFingerprint(event: Tier2CanonicalInterventionEvent): string {
  return [
    event.interventionType,
    event.implementationDate,
    event.datePrecision,
    event.routeIds.toSorted().join(","),
  ].join("|");
}

function duplicateGroupForEvents(
  fingerprint: string,
  events: Tier2CanonicalInterventionEvent[],
): Tier2InterventionDuplicateGroup {
  const first = events[0];
  if (first === undefined) {
    throw new Error("Cannot build duplicate group for empty event list.");
  }
  return {
    fingerprint,
    reviewState: events.length > 1 ? "duplicate_candidate" : "unique",
    interventionType: first.interventionType,
    implementationDate: first.implementationDate,
    datePrecision: first.datePrecision,
    routeIds: [...new Set(events.flatMap((event) => event.routeIds))].toSorted(),
    eventIds: events.map((event) => event.eventId).toSorted(),
    candidateIds: events.map((event) => event.candidateId).toSorted(),
    sourceIds: [...new Set(events.map((event) => event.sourceId))].toSorted(),
    sourceSpanChunkIds: [
      ...new Set(events.flatMap((event) => event.sourceSpanChunkIds)),
    ].toSorted(),
  };
}

export async function auditTier2InterventionDuplicates(
  args: AuditTier2InterventionDuplicatesArgs,
): Promise<Tier2InterventionDuplicateAudit> {
  const canonical = (await Bun.file(
    args.canonicalEventsPath,
  ).json()) as Tier2CanonicalInterventionEventsArtifact;
  const byFingerprint = new Map<string, Tier2CanonicalInterventionEvent[]>();
  for (const event of canonical.events) {
    const fingerprint = duplicateFingerprint(event);
    const group = byFingerprint.get(fingerprint) ?? [];
    group.push(event);
    byFingerprint.set(fingerprint, group);
  }

  const groups = [...byFingerprint.entries()]
    .map(([fingerprint, events]) => duplicateGroupForEvents(fingerprint, events))
    .toSorted((a, b) => {
      const reviewDelta = a.reviewState.localeCompare(b.reviewState);
      if (reviewDelta !== 0) {
        return reviewDelta;
      }
      return a.fingerprint.localeCompare(b.fingerprint);
    });
  const duplicateGroups = groups.filter((group) => group.reviewState === "duplicate_candidate");
  const duplicateEventCount = duplicateGroups.reduce(
    (sum, group) => sum + group.eventIds.length,
    0,
  );
  const audit: Tier2InterventionDuplicateAudit = {
    version: 1,
    runId: canonical.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    canonicalEventsPath: args.canonicalEventsPath,
    outputPath: args.outputPath ?? null,
    summary: {
      eventCount: canonical.events.length,
      fingerprintCount: groups.length,
      duplicateGroupCount: duplicateGroups.length,
      duplicateEventCount,
      uniqueEventCount: canonical.events.length - duplicateEventCount,
      eventsNeedingReviewCount: duplicateEventCount,
    },
    groups,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, audit);
  }

  return audit;
}

function duplicateReviewRecommendation(group: Tier2InterventionDuplicateGroup): {
  recommendation: Tier2DuplicateReviewRecommendation;
  rationale: string;
} {
  if (group.sourceIds.length === 1) {
    return {
      recommendation: "collapse_single_source_duplicates",
      rationale:
        "All duplicate candidates share one source, implementation date, intervention type, and route set; review likely synonym/phrase variants before choosing one canonical event.",
    };
  }
  return {
    recommendation: "compare_multi_source_duplicates",
    rationale:
      "Duplicate candidates share implementation date, intervention type, and route set across multiple sources; compare source spans before deciding whether to merge or keep separate events.",
  };
}

export async function buildTier2DuplicateReviewQueue(
  args: BuildTier2DuplicateReviewQueueArgs,
): Promise<Tier2DuplicateReviewQueue> {
  const [canonical, duplicateAudit, bundle] = (await Promise.all([
    Bun.file(args.canonicalEventsPath).json(),
    Bun.file(args.duplicateAuditPath).json(),
    Bun.file(args.candidateBundlePath).json(),
  ])) as [
    Tier2CanonicalInterventionEventsArtifact,
    Tier2InterventionDuplicateAudit,
    Tier2CandidateBundle,
  ];
  const eventsById = new Map(canonical.events.map((event) => [event.eventId, event]));
  const evidenceByCandidateId = new Map(
    bundle.documentEvidenceCandidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const sourcesById = new Map(
    bundle.documentSourceCandidates.map((source) => [source.sourceId, source]),
  );
  const duplicateGroups = duplicateAudit.groups.filter(
    (group) => group.reviewState === "duplicate_candidate",
  );
  const items = duplicateGroups
    .map((group) => {
      const { recommendation, rationale } = duplicateReviewRecommendation(group);
      const events = group.eventIds.flatMap((eventId): Tier2DuplicateReviewEvent[] => {
        const event = eventsById.get(eventId);
        if (event === undefined) {
          throw new Error(`Duplicate review references unknown event ${eventId}`);
        }
        const evidence = evidenceByCandidateId.get(event.candidateId);
        const source = sourcesById.get(event.sourceId);
        return [
          {
            eventId: event.eventId,
            candidateId: event.candidateId,
            sourceId: event.sourceId,
            sourceTitle: source?.title ?? evidence?.sourceRef.title ?? null,
            sourceUrl: source?.sourceUrl ?? evidence?.sourceRef.sourceUrl ?? null,
            routeIds: event.routeIds,
            interventionType: event.interventionType,
            implementationDate: event.implementationDate,
            datePrecision: event.datePrecision,
            sourceSpanChunkIds: event.sourceSpanChunkIds,
            routeMentions: evidence?.routeMentions ?? [],
            corridorMentions: evidence?.corridorMentions ?? [],
            dateMentions: [],
            interventionFamily: null,
          },
        ];
      });
      return {
        fingerprint: group.fingerprint,
        recommendation,
        rationale,
        interventionType: group.interventionType,
        implementationDate: group.implementationDate,
        datePrecision: group.datePrecision,
        routeIds: group.routeIds,
        eventCount: group.eventIds.length,
        candidateCount: group.candidateIds.length,
        sourceCount: group.sourceIds.length,
        sourceIds: group.sourceIds,
        events,
      };
    })
    .toSorted((a, b) => {
      const recommendationDelta = a.recommendation.localeCompare(b.recommendation);
      if (recommendationDelta !== 0) return recommendationDelta;
      return a.fingerprint.localeCompare(b.fingerprint);
    });
  const queue: Tier2DuplicateReviewQueue = {
    version: 1,
    runId: canonical.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    canonicalEventsPath: args.canonicalEventsPath,
    duplicateAuditPath: args.duplicateAuditPath,
    candidateBundlePath: args.candidateBundlePath,
    outputPath: args.outputPath ?? null,
    summary: {
      duplicateGroupCount: items.length,
      duplicateEventCount: items.reduce((sum, item) => sum + item.eventCount, 0),
      singleSourceGroupCount: items.filter(
        (item) => item.recommendation === "collapse_single_source_duplicates",
      ).length,
      multiSourceGroupCount: items.filter(
        (item) => item.recommendation === "compare_multi_source_duplicates",
      ).length,
    },
    items,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, queue);
  }

  return queue;
}

function suggestedDuplicateDecision(item: Tier2DuplicateReviewItem): Tier2DuplicateDecision {
  return item.recommendation === "collapse_single_source_duplicates"
    ? "collapse_to_one_event"
    : "keep_separate_events";
}

export async function buildTier2DuplicateDecisionTemplate(
  args: BuildTier2DuplicateDecisionTemplateArgs,
): Promise<Tier2DuplicateDecisionTemplate> {
  const review = (await Bun.file(args.duplicateReviewPath).json()) as Tier2DuplicateReviewQueue;
  const decisions = review.items.map((item): Tier2DuplicateDecisionItem => {
    const eventIds = item.events.map((event) => event.eventId).toSorted();
    return {
      fingerprint: item.fingerprint,
      currentDecision: "needs_human_review",
      suggestedDecision: suggestedDuplicateDecision(item),
      selectedEventId:
        item.recommendation === "collapse_single_source_duplicates" ? (eventIds[0] ?? null) : null,
      eventIds,
      sourceIds: item.sourceIds,
      routeIds: item.routeIds,
      interventionType: item.interventionType,
      implementationDate: item.implementationDate,
      datePrecision: item.datePrecision,
      reviewer: null,
      reviewedAt: null,
      rationale: item.rationale,
    };
  });
  const template: Tier2DuplicateDecisionTemplate = {
    version: 1,
    runId: review.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    duplicateReviewPath: args.duplicateReviewPath,
    outputPath: args.outputPath ?? null,
    summary: {
      duplicateGroupCount: decisions.length,
      duplicateEventCount: decisions.reduce((sum, item) => sum + item.eventIds.length, 0),
      needsHumanReviewCount: decisions.filter(
        (item) => item.currentDecision === "needs_human_review",
      ).length,
      collapseSuggestedCount: decisions.filter(
        (item) => item.suggestedDecision === "collapse_to_one_event",
      ).length,
      keepSeparateSuggestedCount: decisions.filter(
        (item) => item.suggestedDecision === "keep_separate_events",
      ).length,
    },
    decisions,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, template);
  }

  return template;
}

export function duplicateDecisionIsComplete(item: Tier2DuplicateDecisionItem): boolean {
  if (item.currentDecision === "needs_human_review") {
    return false;
  }
  if (item.reviewer === null || item.reviewer.trim().length === 0) {
    return false;
  }
  if (item.reviewedAt === null || item.reviewedAt.trim().length === 0) {
    return false;
  }
  if (item.rationale.trim().length === 0) {
    return false;
  }
  if (item.currentDecision === "collapse_to_one_event") {
    return item.selectedEventId !== null && item.eventIds.includes(item.selectedEventId);
  }
  return item.selectedEventId === null;
}

export async function verifyTier2DuplicateDecisions(
  args: VerifyTier2DuplicateDecisionsArgs,
): Promise<Tier2DuplicateDecisionVerification> {
  const decisions = (await Bun.file(
    args.duplicateDecisionsPath,
  ).json()) as Tier2DuplicateDecisionTemplate;
  const incompleteFingerprints = decisions.decisions
    .filter((item) => !duplicateDecisionIsComplete(item))
    .map((item) => item.fingerprint)
    .toSorted();
  const invalidCollapseSelectionCount = decisions.decisions.filter(
    (item) =>
      item.currentDecision === "collapse_to_one_event" &&
      (item.selectedEventId === null || !item.eventIds.includes(item.selectedEventId)),
  ).length;
  const verification: Tier2DuplicateDecisionVerification = {
    version: 1,
    runId: decisions.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    duplicateDecisionsPath: args.duplicateDecisionsPath,
    outputPath: args.outputPath ?? null,
    complete: incompleteFingerprints.length === 0,
    summary: {
      decisionCount: decisions.decisions.length,
      duplicateEventCount: decisions.decisions.reduce((sum, item) => sum + item.eventIds.length, 0),
      completeDecisionCount: decisions.decisions.length - incompleteFingerprints.length,
      incompleteDecisionCount: incompleteFingerprints.length,
      needsHumanReviewCount: decisions.decisions.filter(
        (item) => item.currentDecision === "needs_human_review",
      ).length,
      collapseDecisionCount: decisions.decisions.filter(
        (item) => item.currentDecision === "collapse_to_one_event",
      ).length,
      keepSeparateDecisionCount: decisions.decisions.filter(
        (item) => item.currentDecision === "keep_separate_events",
      ).length,
      invalidCollapseSelectionCount,
      missingReviewerCount: decisions.decisions.filter(
        (item) => item.reviewer === null || item.reviewer.trim().length === 0,
      ).length,
      missingReviewedAtCount: decisions.decisions.filter(
        (item) => item.reviewedAt === null || item.reviewedAt.trim().length === 0,
      ).length,
      missingRationaleCount: decisions.decisions.filter(
        (item) => item.rationale.trim().length === 0,
      ).length,
    },
    incompleteFingerprints,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, verification);
  }

  return verification;
}

type StudioReleaseInterventionForStatus = {
  sourceLabel?: string;
  sourceLinks?: unknown[];
  sourceSpanRefs?: unknown[];
};

type StudioReleaseRouteForStatus = {
  interventions?: StudioReleaseInterventionForStatus[];
};

type StudioReleaseForStatus = {
  routes?: StudioReleaseRouteForStatus[];
};

type FollowupOcrReviewForStatus = {
  path: string;
  review: Tier2OcrQualityReview;
};

function topNFromArtifactName(file: string): number {
  const match = /-top(\d+)\.json$/.exec(file);
  return match === null ? 0 : Number(match[1]);
}

async function latestFollowupOcrReviewForStatus(
  baseDir: string,
): Promise<FollowupOcrReviewForStatus | null> {
  const files = (await readdir(baseDir)).filter((file) =>
    /^followup-ocr-quality-review(?:-top\d+|-full)?\.json$/.test(file),
  );
  const reviews = await Promise.all(
    files.map(async (file): Promise<FollowupOcrReviewForStatus | null> => {
      const path = join(baseDir, file);
      try {
        return { path, review: await readRequiredJsonArtifact<Tier2OcrQualityReview>(path) };
      } catch {
        return null;
      }
    }),
  );
  return (
    reviews
      .flatMap((item) => (item === null ? [] : [item]))
      .toSorted((a, b) => {
        const reviewedDelta =
          b.review.summary.reviewedSourceCount - a.review.summary.reviewedSourceCount;
        if (reviewedDelta !== 0) return reviewedDelta;
        return b.review.summary.ocrCompleteCount - a.review.summary.ocrCompleteCount;
      })[0] ?? null
  );
}

async function latestTopNJsonArtifactForStatus<T>(
  baseDir: string,
  pattern: RegExp,
): Promise<{ path: string; artifact: T } | null> {
  const files = (await readdir(baseDir))
    .filter((file) => pattern.test(file))
    .toSorted((a, b) => topNFromArtifactName(b) - topNFromArtifactName(a));
  for (const file of files) {
    const path = join(baseDir, file);
    try {
      return { path, artifact: await readRequiredJsonArtifact<T>(path) };
    } catch {}
  }
  return null;
}

export async function buildTier2PipelineStatus(
  args: BuildTier2PipelineStatusArgs,
): Promise<Tier2PipelineStatusArtifact> {
  const baseDir = runArtifactRoot(args.artifactRoot, args.runId);
  const [baseBundle, baseCanonical, staging, duplicateVerification, followupPlan, top30Review] =
    await Promise.all([
      readRequiredJsonArtifact<Tier2CandidateBundle>(
        candidateBundlePath(args.artifactRoot, args.runId),
      ),
      readRequiredJsonArtifact<Tier2CanonicalInterventionEventsArtifact>(
        canonicalInterventionEventsPath(args.artifactRoot, args.runId),
      ),
      readRequiredJsonArtifact<Tier2InterventionStagingLoadReport>(
        join(baseDir, "tier2-intervention-staging-load-report.json"),
      ),
      readRequiredJsonArtifact<Tier2DuplicateDecisionVerification>(
        join(baseDir, "tier2-intervention-duplicate-decision-verification.json"),
      ),
      readRequiredJsonArtifact<Tier2OcrPlan>(followupOcrPlanPath(args.artifactRoot, args.runId)),
      readJsonArtifactIfExistsForStatus<Tier2OcrQualityReview>(
        join(baseDir, "followup-ocr-quality-review-top30.json"),
      ),
    ]);
  const bundle =
    (await readJsonArtifactIfExistsForStatus<Tier2CandidateBundle>(
      join(baseDir, "candidate-bundle-combined.json"),
    )) ?? baseBundle;
  const canonical =
    (await readJsonArtifactIfExistsForStatus<Tier2CanonicalInterventionEventsArtifact>(
      join(baseDir, "tier2-intervention-events-combined.json"),
    )) ?? baseCanonical;
  const latestFollowupReview = await latestFollowupOcrReviewForStatus(baseDir);
  const latestFollowupBundle = await latestTopNJsonArtifactForStatus<Tier2CandidateBundle>(
    baseDir,
    /^candidate-bundle-followup-top\d+\.json$/,
  );
  const manualFollowupBundle = await readJsonArtifactIfExistsForStatus<Tier2CandidateBundle>(
    join(baseDir, "candidate-bundle-followup-manual.json"),
  );
  const release = await readRequiredJsonArtifact<StudioReleaseForStatus>(args.studioReleasePath);
  const tier2Rows = (release.routes ?? []).flatMap((route) =>
    (route.interventions ?? []).filter(
      (intervention) => intervention.sourceLabel === "Tier 2 documents",
    ),
  );
  const studioTier2RowsMissingSourceLinks = tier2Rows.filter(
    (intervention) => (intervention.sourceLinks?.length ?? 0) === 0,
  ).length;
  const studioTier2RowsMissingSourceSpanPreviews = tier2Rows.filter(
    (intervention) => (intervention.sourceSpanRefs?.length ?? 0) === 0,
  ).length;
  const summary = {
    sourceCandidateCount: bundle.summary.sourceCandidateCount,
    evidenceCandidateCount: bundle.summary.evidenceCandidateCount,
    canonicalEventCount: canonical.summary.eventCount,
    eligibleTimelineEventCount: staging.summary.eligibleForTimelineCount,
    blockedDuplicateEventCount: staging.summary.blockedDuplicateReviewCount,
    suppressedDuplicateEventCount: staging.summary.suppressedDuplicateCount,
    completeDuplicateDecisionCount: staging.summary.completeDuplicateDecisionCount,
    incompleteDuplicateDecisionCount: staging.summary.incompleteDuplicateDecisionCount,
    duplicateDecisionComplete: duplicateVerification.complete,
    followupOcrPlannedCount: followupPlan.summary.ocrRequiredSourceCount,
    followupOcrTop30CompletedCount: top30Review?.summary.ocrCompleteCount ?? 0,
    followupOcrLatestReviewPath: latestFollowupReview?.path ?? null,
    followupOcrReviewedCount: latestFollowupReview?.review.summary.reviewedSourceCount ?? 0,
    followupOcrCompletedCount: latestFollowupReview?.review.summary.ocrCompleteCount ?? 0,
    followupCandidateBundlePath:
      manualFollowupBundle === null
        ? (latestFollowupBundle?.path ?? null)
        : join(baseDir, "candidate-bundle-followup-manual.json"),
    followupEvidenceCandidateCount:
      manualFollowupBundle?.summary.evidenceCandidateCount ??
      latestFollowupBundle?.artifact.summary.evidenceCandidateCount ??
      0,
    followupUnresolvedOcrSourceCount:
      latestFollowupReview === null
        ? 0
        : (latestFollowupReview.review.summary.unknownQualityCount ?? 0) +
          (latestFollowupReview.review.summary.unknownDecisionCount ?? 0),
    studioTier2TimelineRowCount: tier2Rows.length,
    studioTier2RowsMissingSourceLinks,
    studioTier2RowsMissingSourceSpanPreviews,
  };
  const gates: Tier2PipelineStatusGate[] = [
    {
      gate: "corpus_and_extraction",
      status:
        summary.sourceCandidateCount > 0 && summary.evidenceCandidateCount > 0
          ? "complete"
          : "blocked",
      evidence: `${summary.sourceCandidateCount} source candidates; ${summary.evidenceCandidateCount} evidence candidates.`,
      remaining: null,
    },
    {
      gate: "duplicate_decisions",
      status: summary.duplicateDecisionComplete ? "complete" : "blocked",
      evidence: `${summary.completeDuplicateDecisionCount} duplicate decisions complete; ${summary.incompleteDuplicateDecisionCount} incomplete; ${summary.blockedDuplicateEventCount} events remain blocked; ${summary.suppressedDuplicateEventCount} duplicates suppressed.`,
      remaining: summary.duplicateDecisionComplete
        ? null
        : "Complete and apply tier2-intervention-duplicate-decisions.json.",
    },
    {
      gate: "followup_ocr",
      status: summary.followupUnresolvedOcrSourceCount === 0 ? "complete" : "partial",
      evidence: `${summary.followupOcrCompletedCount} completed follow-up OCR outputs; ${summary.followupOcrReviewedCount} reviewed; ${summary.followupUnresolvedOcrSourceCount} OCR-tail sources unresolved; ${summary.followupEvidenceCandidateCount} follow-up evidence candidates; ${summary.followupOcrPlannedCount} total follow-up ranges planned.`,
      remaining:
        summary.followupUnresolvedOcrSourceCount === 0
          ? null
          : "Unresolved follow-up OCR sources remain.",
    },
    {
      gate: "studio_timeline_affordances",
      status:
        summary.studioTier2TimelineRowCount > 0 &&
        summary.studioTier2RowsMissingSourceLinks === 0 &&
        summary.studioTier2RowsMissingSourceSpanPreviews === 0
          ? "complete"
          : "blocked",
      evidence: `${summary.studioTier2TimelineRowCount} Tier 2 Studio rows; ${summary.studioTier2RowsMissingSourceLinks} missing source links; ${summary.studioTier2RowsMissingSourceSpanPreviews} missing span previews.`,
      remaining: null,
    },
  ];
  const status: Tier2PipelineStatusArtifact = {
    version: 1,
    runId: args.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    outputPath: args.outputPath ?? null,
    complete: gates.every((gate) => gate.status === "complete"),
    summary,
    gates,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, status);
  }

  return status;
}

function duplicateGroupsByEventId(
  audit: Tier2InterventionDuplicateAudit,
): Map<string, Tier2InterventionDuplicateGroup> {
  const byEventId = new Map<string, Tier2InterventionDuplicateGroup>();
  for (const group of audit.groups) {
    for (const eventId of group.eventIds) {
      byEventId.set(eventId, group);
    }
  }
  return byEventId;
}

function promotionStateForDuplicateDecision(
  eventId: string,
  duplicateGroup: Tier2InterventionDuplicateGroup,
  decisionsByFingerprint: Map<string, Tier2DuplicateDecisionItem>,
): Tier2InterventionPromotionState {
  if (duplicateGroup.reviewState === "unique") {
    return "eligible_for_timeline";
  }
  const decision = decisionsByFingerprint.get(duplicateGroup.fingerprint);
  if (decision === undefined || !duplicateDecisionIsComplete(decision)) {
    return "blocked_duplicate_review";
  }
  if (decision.currentDecision === "keep_separate_events") {
    return "eligible_for_timeline";
  }
  return decision.selectedEventId === eventId ? "eligible_for_timeline" : "suppressed_duplicate";
}

export async function loadTier2InterventionStaging(
  args: LoadTier2InterventionStagingArgs,
): Promise<Tier2InterventionStagingLoadReport> {
  const canonical = (await Bun.file(
    args.canonicalEventsPath,
  ).json()) as Tier2CanonicalInterventionEventsArtifact;
  const duplicateAudit = (await Bun.file(
    args.duplicateAuditPath,
  ).json()) as Tier2InterventionDuplicateAudit;
  const candidateBundle = (await Bun.file(args.candidateBundlePath).json()) as Tier2CandidateBundle;
  const duplicateDecisions =
    args.duplicateDecisionsPath === undefined
      ? null
      : ((await Bun.file(args.duplicateDecisionsPath).json()) as Tier2DuplicateDecisionTemplate);
  const sourcesById = new Map(
    candidateBundle.documentSourceCandidates.map((source) => [source.sourceId, source]),
  );
  const duplicateByEventId = duplicateGroupsByEventId(duplicateAudit);
  const decisionsByFingerprint = new Map(
    (duplicateDecisions?.decisions ?? []).map((decision) => [decision.fingerprint, decision]),
  );
  const completeDuplicateDecisionCount = (duplicateDecisions?.decisions ?? []).filter((decision) =>
    duplicateDecisionIsComplete(decision),
  ).length;
  const incompleteDuplicateDecisionCount =
    (duplicateDecisions?.decisions.length ?? 0) - completeDuplicateDecisionCount;

  const events = canonical.events.map((event) => {
    const duplicateGroup = duplicateByEventId.get(event.eventId);
    if (duplicateGroup === undefined) {
      throw new Error(`Missing duplicate audit group for Tier 2 event ${event.eventId}`);
    }
    const promotionState = promotionStateForDuplicateDecision(
      event.eventId,
      duplicateGroup,
      decisionsByFingerprint,
    );
    return {
      eventId: event.eventId,
      candidateId: event.candidateId,
      sourceId: event.sourceId,
      sourceTitle: sourcesById.get(event.sourceId)?.title ?? null,
      sourceUrl: sourcesById.get(event.sourceId)?.sourceUrl ?? null,
      interventionType: event.interventionType,
      implementationDate: event.implementationDate,
      implementationMonth: event.implementationMonth,
      datePrecision: event.datePrecision,
      eventStatus: event.eventStatus,
      validationState: event.validationState,
      duplicateReviewState: duplicateGroup.reviewState,
      duplicateFingerprint: duplicateGroup.fingerprint,
      promotionState,
    };
  });
  const routes = canonical.events.flatMap((event) =>
    event.routeIds.map((routeId) => ({
      eventId: event.eventId,
      routeId,
    })),
  );
  const sourceSpans = canonical.events.flatMap((event) =>
    event.sourceSpanChunkIds.map((chunkId, index) => ({
      eventId: event.eventId,
      chunkRank: index + 1,
      chunkId,
    })),
  );

  await withLocalPipelineDb(args.dbPath, (local) =>
    replaceTier2InterventionStagingRows(local.db, {
      events,
      routes,
      sourceSpans,
    }),
  );

  const report: Tier2InterventionStagingLoadReport = {
    version: 1,
    runId: canonical.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    canonicalEventsPath: args.canonicalEventsPath,
    duplicateAuditPath: args.duplicateAuditPath,
    candidateBundlePath: args.candidateBundlePath,
    duplicateDecisionsPath: args.duplicateDecisionsPath ?? null,
    dbPath: args.dbPath,
    outputPath: args.outputPath ?? null,
    summary: {
      eventCount: events.length,
      routeEventCount: routes.length,
      sourceSpanCount: sourceSpans.length,
      eligibleForTimelineCount: events.filter(
        (event) => event.promotionState === "eligible_for_timeline",
      ).length,
      blockedDuplicateReviewCount: events.filter(
        (event) => event.promotionState === "blocked_duplicate_review",
      ).length,
      suppressedDuplicateCount: events.filter(
        (event) => event.promotionState === "suppressed_duplicate",
      ).length,
      completeDuplicateDecisionCount,
      incompleteDuplicateDecisionCount,
    },
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, report);
  }

  return report;
}

export async function planTier2FollowupOcr(args: PlanTier2FollowupOcrArgs): Promise<Tier2OcrPlan> {
  const bundle = (await Bun.file(args.candidateBundlePath).json()) as Tier2CandidateBundle;
  const basePlan = (await Bun.file(bundle.ocrPlanPath).json()) as Tier2OcrPlan;
  const baseSourcesById = new Map(basePlan.sources.map((source) => [source.sourceId, source]));
  const seen = new Set<string>();
  const followupSources: Tier2OcrPlanSource[] = [];
  const sortedCandidates = [...bundle.followupOcrCandidates].toSorted((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDelta = priorityOrder[a.priority] - priorityOrder[b.priority];
    return priorityDelta === 0
      ? a.sourceRef.sourceId.localeCompare(b.sourceRef.sourceId)
      : priorityDelta;
  });

  for (const candidate of sortedCandidates) {
    const baseSource = baseSourcesById.get(candidate.sourceRef.sourceId);
    if (baseSource === undefined) {
      continue;
    }
    const key = `${candidate.sourceRef.sourceId}:${candidate.suggestedPageRange}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    followupSources.push({
      ...baseSource,
      pageRange: candidate.suggestedPageRange,
      reviewState: "triage_ready",
      nextAction:
        "Run docs:ocr with this follow-up plan only after reviewing cost and source priority.",
    });
    if (args.limit !== undefined && followupSources.length >= args.limit) {
      break;
    }
  }

  const totalBytes = followupSources.reduce((sum, source) => sum + source.byteLength, 0);
  const plan: Tier2OcrPlan = {
    version: 1,
    runId: `${bundle.runId}-followup`,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    captureManifestPath: basePlan.captureManifestPath,
    outputPath: args.outputPath ?? null,
    runtime: "pi-mono",
    provider: "openrouter",
    model: basePlan.model,
    api: "chat.completions",
    summary: {
      ocrRequiredSourceCount: followupSources.length,
      skippedSourceCount: basePlan.sources.length - followupSources.length,
      totalBytes,
      totalMegabytes: Math.round((totalBytes / 1_000_000) * 100) / 100,
    },
    sources: followupSources,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, plan);
  }

  return plan;
}

async function resolveExtractPaths(args: ExtractCliArgs): Promise<{
  ocrPlanPath: string;
  ocrQualityReviewPath: string;
  ocrMarkdownCandidateExtractionPath: string;
  outputPath: string;
}> {
  if (args.ocrPlanPath !== undefined) {
    if (args.ocrMarkdownCandidateExtractionPath === undefined) {
      throw new Error("--markdown-candidate-extraction is required when --ocr-plan is provided.");
    }
    return {
      ocrPlanPath: args.ocrPlanPath,
      ocrQualityReviewPath:
        args.ocrQualityReviewPath ?? join(dirname(args.ocrPlanPath), "ocr-quality-review.json"),
      ocrMarkdownCandidateExtractionPath: args.ocrMarkdownCandidateExtractionPath,
      outputPath: args.outputPath ?? join(dirname(args.ocrPlanPath), "candidate-bundle.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }

  if (args.ocrMarkdownCandidateExtractionPath === undefined) {
    throw new Error("--markdown-candidate-extraction is required.");
  }

  return {
    ocrPlanPath: ocrPlanPath(artifactRoot, runId),
    ocrQualityReviewPath: args.ocrQualityReviewPath ?? ocrQualityReviewPath(artifactRoot, runId),
    ocrMarkdownCandidateExtractionPath: args.ocrMarkdownCandidateExtractionPath,
    outputPath: args.outputPath ?? candidateBundlePath(artifactRoot, runId),
  };
}

function parseExtractCliArgs(args: string[]): ExtractCliArgs {
  const options: CliOption<ExtractCliArgs>[] = [
    {
      flags: ["--ocr-plan"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.ocrPlanPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--ocr-review"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.ocrQualityReviewPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--markdown-candidate-extraction"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.ocrMarkdownCandidateExtractionPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--triage-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.triageRootName = value;
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

export async function extractTier2CandidatesFromCli(args: string[]): Promise<Tier2CandidateBundle> {
  const parsed = parseExtractCliArgs(args);
  const paths = await resolveExtractPaths(parsed);
  return extractTier2Candidates({
    ...paths,
    ...(parsed.triageRootName !== undefined ? { triageRootName: parsed.triageRootName } : {}),
  });
}

function parseChunkCliArgs(args: string[]): ChunkCliArgs {
  const options: CliOption<ChunkCliArgs>[] = [
    {
      flags: ["--candidate-bundle"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.candidateBundlePath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveChunkPaths(args: ChunkCliArgs): Promise<ChunkTier2DocumentsArgs> {
  if (args.candidateBundlePath !== undefined) {
    return {
      candidateBundlePath: args.candidateBundlePath,
      outputPath:
        args.outputPath ?? join(dirname(args.candidateBundlePath), "document-chunks.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --candidate-bundle.");
  }

  return {
    candidateBundlePath: candidateBundlePath(artifactRoot, runId),
    outputPath: args.outputPath ?? documentChunksPath(artifactRoot, runId),
  };
}

export async function chunkTier2DocumentsFromCli(
  args: string[],
): Promise<Tier2DocumentChunksArtifact> {
  return chunkTier2Documents(await resolveChunkPaths(parseChunkCliArgs(args)));
}

function parseDuplicateAuditCliArgs(args: string[]): DuplicateAuditCliArgs {
  const options: CliOption<DuplicateAuditCliArgs>[] = [
    {
      flags: ["--canonical-events"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.canonicalEventsPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveDuplicateAuditPaths(
  args: DuplicateAuditCliArgs,
): Promise<AuditTier2InterventionDuplicatesArgs> {
  if (args.canonicalEventsPath !== undefined) {
    return {
      canonicalEventsPath: args.canonicalEventsPath,
      outputPath:
        args.outputPath ??
        join(dirname(args.canonicalEventsPath), "tier2-intervention-duplicate-audit.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --canonical-events.");
  }

  return {
    canonicalEventsPath: canonicalInterventionEventsPath(artifactRoot, runId),
    outputPath: args.outputPath ?? interventionDuplicateAuditPath(artifactRoot, runId),
  };
}

export async function auditTier2InterventionDuplicatesFromCli(
  args: string[],
): Promise<Tier2InterventionDuplicateAudit> {
  return auditTier2InterventionDuplicates(
    await resolveDuplicateAuditPaths(parseDuplicateAuditCliArgs(args)),
  );
}

function parseDuplicateReviewCliArgs(args: string[]): DuplicateReviewCliArgs {
  const options: CliOption<DuplicateReviewCliArgs>[] = [
    {
      flags: ["--canonical-events"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.canonicalEventsPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--duplicate-audit"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.duplicateAuditPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--candidate-bundle"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.candidateBundlePath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveDuplicateReviewPaths(
  args: DuplicateReviewCliArgs,
): Promise<BuildTier2DuplicateReviewQueueArgs> {
  if (args.canonicalEventsPath !== undefined) {
    const baseDir = dirname(args.canonicalEventsPath);
    return {
      canonicalEventsPath: args.canonicalEventsPath,
      duplicateAuditPath:
        args.duplicateAuditPath ?? join(baseDir, "tier2-intervention-duplicate-audit.json"),
      candidateBundlePath: args.candidateBundlePath ?? join(baseDir, "candidate-bundle.json"),
      outputPath: args.outputPath ?? join(baseDir, "tier2-intervention-duplicate-review.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --canonical-events.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    canonicalEventsPath: canonicalInterventionEventsPath(artifactRoot, runId),
    duplicateAuditPath:
      args.duplicateAuditPath ?? join(baseDir, "tier2-intervention-duplicate-audit.json"),
    candidateBundlePath: args.candidateBundlePath ?? candidateBundlePath(artifactRoot, runId),
    outputPath: args.outputPath ?? join(baseDir, "tier2-intervention-duplicate-review.json"),
  };
}

export async function buildTier2DuplicateReviewQueueFromCli(
  args: string[],
): Promise<
  Pick<Tier2DuplicateReviewQueue, "version" | "runId" | "generatedAt" | "outputPath" | "summary">
> {
  const queue = await buildTier2DuplicateReviewQueue(
    await resolveDuplicateReviewPaths(parseDuplicateReviewCliArgs(args)),
  );
  return {
    version: queue.version,
    runId: queue.runId,
    generatedAt: queue.generatedAt,
    outputPath: queue.outputPath,
    summary: queue.summary,
  };
}

function parseDuplicateDecisionTemplateCliArgs(args: string[]): DuplicateDecisionTemplateCliArgs {
  const options: CliOption<DuplicateDecisionTemplateCliArgs>[] = [
    {
      flags: ["--duplicate-review"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.duplicateReviewPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveDuplicateDecisionTemplatePaths(
  args: DuplicateDecisionTemplateCliArgs,
): Promise<BuildTier2DuplicateDecisionTemplateArgs> {
  if (args.duplicateReviewPath !== undefined) {
    return {
      duplicateReviewPath: args.duplicateReviewPath,
      outputPath:
        args.outputPath ??
        join(dirname(args.duplicateReviewPath), "tier2-intervention-duplicate-decisions.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --duplicate-review.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    duplicateReviewPath: join(baseDir, "tier2-intervention-duplicate-review.json"),
    outputPath: args.outputPath ?? join(baseDir, "tier2-intervention-duplicate-decisions.json"),
  };
}

export async function buildTier2DuplicateDecisionTemplateFromCli(
  args: string[],
): Promise<
  Pick<
    Tier2DuplicateDecisionTemplate,
    "version" | "runId" | "generatedAt" | "outputPath" | "summary"
  >
> {
  const template = await buildTier2DuplicateDecisionTemplate(
    await resolveDuplicateDecisionTemplatePaths(parseDuplicateDecisionTemplateCliArgs(args)),
  );
  return {
    version: template.version,
    runId: template.runId,
    generatedAt: template.generatedAt,
    outputPath: template.outputPath,
    summary: template.summary,
  };
}

function parseVerifyDuplicateDecisionsCliArgs(args: string[]): VerifyDuplicateDecisionsCliArgs {
  const options: CliOption<VerifyDuplicateDecisionsCliArgs>[] = [
    {
      flags: ["--duplicate-decisions"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.duplicateDecisionsPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveVerifyDuplicateDecisionsPaths(
  args: VerifyDuplicateDecisionsCliArgs,
): Promise<VerifyTier2DuplicateDecisionsArgs> {
  if (args.duplicateDecisionsPath !== undefined) {
    return {
      duplicateDecisionsPath: args.duplicateDecisionsPath,
      outputPath:
        args.outputPath ??
        join(
          dirname(args.duplicateDecisionsPath),
          "tier2-intervention-duplicate-decision-verification.json",
        ),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --duplicate-decisions.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    duplicateDecisionsPath: join(baseDir, "tier2-intervention-duplicate-decisions.json"),
    outputPath:
      args.outputPath ?? join(baseDir, "tier2-intervention-duplicate-decision-verification.json"),
  };
}

export async function verifyTier2DuplicateDecisionsFromCli(
  args: string[],
): Promise<
  Pick<
    Tier2DuplicateDecisionVerification,
    "version" | "runId" | "generatedAt" | "outputPath" | "complete" | "summary"
  >
> {
  const verification = await verifyTier2DuplicateDecisions(
    await resolveVerifyDuplicateDecisionsPaths(parseVerifyDuplicateDecisionsCliArgs(args)),
  );
  return {
    version: verification.version,
    runId: verification.runId,
    generatedAt: verification.generatedAt,
    outputPath: verification.outputPath,
    complete: verification.complete,
    summary: verification.summary,
  };
}

function parseVerifyManualInterventionsCliArgs(args: string[]): VerifyManualInterventionsCliArgs {
  const options: CliOption<VerifyManualInterventionsCliArgs>[] = [
    {
      flags: ["--manual-interventions"],
      apply: (output, value) => {
        if (value !== undefined) output.manualInterventionsPath = fromCliPath(value);
      },
    },
    {
      flags: ["--canonical-events"],
      apply: (output, value) => {
        if (value !== undefined) output.canonicalEventsPath = fromCliPath(value);
      },
    },
    {
      flags: ["--candidate-bundle"],
      apply: (output, value) => {
        if (value !== undefined) output.candidateBundlePath = fromCliPath(value);
      },
    },
    {
      flags: ["--document-chunks"],
      apply: (output, value) => {
        if (value !== undefined) output.documentChunksPath = fromCliPath(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveVerifyManualInterventionsPaths(
  args: VerifyManualInterventionsCliArgs,
): Promise<VerifyTier2ManualInterventionsArgs> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or all manual intervention paths.");
  }
  const baseDir =
    args.manualInterventionsPath !== undefined
      ? dirname(args.manualInterventionsPath)
      : runArtifactRoot(artifactRoot, runId);
  return {
    manualInterventionsPath:
      args.manualInterventionsPath ?? join(baseDir, "manual-intervention-candidates.json"),
    canonicalEventsPath:
      args.canonicalEventsPath ?? join(baseDir, "tier2-intervention-events-combined.json"),
    candidateBundlePath:
      args.candidateBundlePath ?? join(baseDir, "candidate-bundle-combined.json"),
    documentChunksPath: args.documentChunksPath ?? join(baseDir, "document-chunks-combined.json"),
    outputPath: args.outputPath ?? join(baseDir, "manual-intervention-candidate-verification.json"),
  };
}

export async function verifyTier2ManualInterventionsFromCli(
  args: string[],
): Promise<
  Pick<
    Tier2ManualInterventionVerification,
    "version" | "runId" | "generatedAt" | "outputPath" | "complete" | "summary"
  >
> {
  const verification = await verifyTier2ManualInterventions(
    await resolveVerifyManualInterventionsPaths(parseVerifyManualInterventionsCliArgs(args)),
  );
  return {
    version: verification.version,
    runId: verification.runId,
    generatedAt: verification.generatedAt,
    outputPath: verification.outputPath,
    complete: verification.complete,
    summary: verification.summary,
  };
}

function parsePipelineStatusCliArgs(args: string[]): PipelineStatusCliArgs {
  const options: CliOption<PipelineStatusCliArgs>[] = [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--studio-release"],
      apply: (output, value) => {
        if (value !== undefined) output.studioReleasePath = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolvePipelineStatusPaths(
  args: PipelineStatusCliArgs,
): Promise<BuildTier2PipelineStatusArgs> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    runId,
    artifactRoot,
    studioReleasePath:
      args.studioReleasePath ?? fromRepoRoot("data/artifacts/studio/v1/release.json"),
    outputPath: args.outputPath ?? join(baseDir, "tier2-pipeline-status.json"),
  };
}

export async function buildTier2PipelineStatusFromCli(
  args: string[],
): Promise<
  Pick<
    Tier2PipelineStatusArtifact,
    "version" | "runId" | "generatedAt" | "outputPath" | "complete" | "summary" | "gates"
  >
> {
  const status = await buildTier2PipelineStatus(
    await resolvePipelineStatusPaths(parsePipelineStatusCliArgs(args)),
  );
  return {
    version: status.version,
    runId: status.runId,
    generatedAt: status.generatedAt,
    outputPath: status.outputPath,
    complete: status.complete,
    summary: status.summary,
    gates: status.gates,
  };
}

function parseLoadStagingCliArgs(args: string[]): LoadStagingCliArgs {
  const options: CliOption<LoadStagingCliArgs>[] = [
    {
      flags: ["--canonical-events"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.canonicalEventsPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--duplicate-audit"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.duplicateAuditPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--candidate-bundle"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.candidateBundlePath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--duplicate-decisions"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.duplicateDecisionsPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--db"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.dbPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveLoadStagingPaths(
  args: LoadStagingCliArgs,
): Promise<LoadTier2InterventionStagingArgs> {
  if (args.canonicalEventsPath !== undefined) {
    const baseDir = dirname(args.canonicalEventsPath);
    return {
      canonicalEventsPath: args.canonicalEventsPath,
      duplicateAuditPath:
        args.duplicateAuditPath ?? join(baseDir, "tier2-intervention-duplicate-audit.json"),
      candidateBundlePath: args.candidateBundlePath ?? join(baseDir, "candidate-bundle.json"),
      duplicateDecisionsPath:
        args.duplicateDecisionsPath ?? join(baseDir, "tier2-intervention-duplicate-decisions.json"),
      dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
      outputPath: args.outputPath ?? join(baseDir, "tier2-intervention-staging-load-report.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --canonical-events.");
  }

  return {
    canonicalEventsPath: canonicalInterventionEventsPath(artifactRoot, runId),
    duplicateAuditPath:
      args.duplicateAuditPath ?? interventionDuplicateAuditPath(artifactRoot, runId),
    candidateBundlePath: args.candidateBundlePath ?? candidateBundlePath(artifactRoot, runId),
    duplicateDecisionsPath:
      args.duplicateDecisionsPath ??
      join(runArtifactRoot(artifactRoot, runId), "tier2-intervention-duplicate-decisions.json"),
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
    outputPath:
      args.outputPath ??
      join(runArtifactRoot(artifactRoot, runId), "tier2-intervention-staging-load-report.json"),
  };
}

export async function loadTier2InterventionStagingFromCli(
  args: string[],
): Promise<Tier2InterventionStagingLoadReport> {
  return loadTier2InterventionStaging(await resolveLoadStagingPaths(parseLoadStagingCliArgs(args)));
}

// ---------------------------------------------------------------------------
// Promotion step: reviewed Phase 3 v3 + manual review file -> publishable
// intervention staging artifact (JSON-only, no D1 changes).
//
// Splits records into two serving layers based on manual-review dispositions:
//   publish_candidate       -> canonical_milestone layer
//   planned_layer_candidate -> planned_or_proposed layer
// Records dispositioned needs_manual_curation, supporting_evidence_only, or
// (no longer present in v3) reject_pipeline_issue are excluded with counts.
//
// Evidence previews are embedded inline (first 1-2 evidenceQuote strings from
// the v5 candidate corpus) so the artifact is directly auditable without a
// second lookup.
// ---------------------------------------------------------------------------

export type PromotePublishableInterventionsArgs = {
  reviewedCorpusPath: string;
  manualReviewPath: string;
  candidateCorpusPath: string;
  outputPath?: string;
  generatedAt?: string;
  evidencePreviewLimit?: number;
};

const PROMOTION_DISPOSITION_TO_LAYER = {
  publish_candidate: "canonical_milestone",
  planned_layer_candidate: "planned_or_proposed",
} as const;

type PromotionDisposition = keyof typeof PROMOTION_DISPOSITION_TO_LAYER;
type PromotionLayer = (typeof PROMOTION_DISPOSITION_TO_LAYER)[PromotionDisposition];

export type PromotedInterventionStatus = "implemented" | "planned" | "proposed";

export type PromotionEvidencePreview = {
  candidateId: string;
  sourceLabel: string;
  sourceUrl: string | null;
  quote: string;
};

export type PromotedIntervention = {
  recordId: string;
  sourceId: string;
  disposition: PromotionDisposition;
  timelineLayer: PromotionLayer;
  status: PromotedInterventionStatus;
  recordKind: DocumentInterventionRecordKind;
  routes: string[];
  serviceMode: string | null;
  primaryTreatments: string[];
  customTreatments: string[];
  corridor: Record<string, unknown> | null;
  effectiveDate: string | null;
  datePrecision: "day" | "month" | "year" | null;
  statusHistory: unknown[];
  treatmentComponents: unknown[];
  metrics: unknown[];
  caveats: unknown[];
  evidenceCandidateIds: string[];
  evidencePreviews: PromotionEvidencePreview[];
  review: {
    disposition: PromotionDisposition;
    confidence: string | null;
    rationale: string | null;
    issueTags: string[];
  };
};

export type PromotionConflictReport = {
  recordId: string;
  disposition: PromotionDisposition;
  recordKind: DocumentInterventionRecordKind;
  resolvedStatus: PromotedInterventionStatus;
};

export type PromotionArtifact = {
  version: 1;
  generatedAt: string;
  reviewedCorpusPath: string;
  manualReviewPath: string;
  candidateCorpusPath: string;
  outputPath: string | null;
  summary: {
    reviewedRecordCount: number;
    manualReviewCount: number;
    publishableTotal: number;
    publishableByLayer: Record<PromotionLayer, number>;
    publishableByStatus: Record<PromotedInterventionStatus, number>;
    publishableSourceCount: number;
    publishableRouteCount: number;
    excludedByDisposition: Record<string, number>;
    recordsWithoutReview: string[];
    dispositionVsRecordKindConflicts: PromotionConflictReport[];
  };
  publishableInterventions: PromotedIntervention[];
};

type ReviewedCorpusFile = {
  documentInterventionRecords?: Array<Record<string, unknown>>;
};

type ManualReviewFile = {
  reviews?: Array<{
    recordId: string;
    sourceId?: string;
    disposition: string;
    confidence?: string | null;
    rationale?: string | null;
    issueTags?: string[];
  }>;
};

type V5CandidateCorpusFile = {
  documentEvidenceCandidates?: Array<{
    candidateId: string;
    evidenceQuote: string;
    sourceRef?: {
      title?: string;
      sourceUrl?: string;
    };
  }>;
};

// Map the Phase 3 `recordKind` enum (implemented | in_progress | proposed) and
// manual-review disposition to the studio-facing status enum. The disposition
// is the human verdict; recordKind is the model verdict. Disagreement is
// logged in dispositionVsRecordKindConflicts so the conflicts surface.
function deriveStatus(
  disposition: PromotionDisposition,
  recordKind: DocumentInterventionRecordKind,
): { status: PromotedInterventionStatus; conflict: boolean } {
  if (disposition === "publish_candidate") {
    if (recordKind === "implemented") return { status: "implemented", conflict: false };
    if (recordKind === "in_progress") return { status: "implemented", conflict: false };
    return { status: "implemented", conflict: true };
  }
  // planned_layer_candidate
  if (recordKind === "proposed") return { status: "proposed", conflict: false };
  if (recordKind === "in_progress") return { status: "planned", conflict: false };
  return { status: "planned", conflict: true };
}

export async function promotePublishableInterventions(
  args: PromotePublishableInterventionsArgs,
): Promise<PromotionArtifact> {
  const reviewed = (await Bun.file(args.reviewedCorpusPath).json()) as ReviewedCorpusFile;
  const manualReview = (await Bun.file(args.manualReviewPath).json()) as ManualReviewFile;
  const candidateCorpus = (await Bun.file(
    args.candidateCorpusPath,
  ).json()) as V5CandidateCorpusFile;

  const records = reviewed.documentInterventionRecords ?? [];
  const reviews = manualReview.reviews ?? [];
  const reviewByRecordId = new Map(reviews.map((review) => [review.recordId, review]));
  const candidateById = new Map(
    (candidateCorpus.documentEvidenceCandidates ?? []).map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );

  const previewLimit = args.evidencePreviewLimit ?? 2;
  const excludedByDisposition: Record<string, number> = {};
  const recordsWithoutReview: string[] = [];
  const conflicts: PromotionConflictReport[] = [];
  const publishable: PromotedIntervention[] = [];

  for (const raw of records) {
    const recordId = raw["recordId"] as string;
    const review = reviewByRecordId.get(recordId);
    if (review === undefined) {
      recordsWithoutReview.push(recordId);
      continue;
    }
    const disposition = review.disposition;
    if (!(disposition in PROMOTION_DISPOSITION_TO_LAYER)) {
      excludedByDisposition[disposition] = (excludedByDisposition[disposition] ?? 0) + 1;
      continue;
    }
    const promotionDisposition = disposition as PromotionDisposition;
    const recordKind = raw["recordKind"] as DocumentInterventionRecordKind;
    const { status, conflict } = deriveStatus(promotionDisposition, recordKind);
    if (conflict) {
      conflicts.push({
        recordId,
        disposition: promotionDisposition,
        recordKind,
        resolvedStatus: status,
      });
    }

    const evidenceCandidateIds = Array.isArray(raw["evidenceCandidateIds"])
      ? (raw["evidenceCandidateIds"] as string[])
      : [];
    const evidencePreviews: PromotionEvidencePreview[] = [];
    for (const candidateId of evidenceCandidateIds.slice(0, previewLimit)) {
      const candidate = candidateById.get(candidateId);
      if (candidate === undefined) continue;
      evidencePreviews.push({
        candidateId,
        sourceLabel: candidate.sourceRef?.title ?? (raw["sourceId"] as string),
        sourceUrl: candidate.sourceRef?.sourceUrl ?? null,
        quote: candidate.evidenceQuote,
      });
    }

    publishable.push({
      recordId,
      sourceId: raw["sourceId"] as string,
      disposition: promotionDisposition,
      timelineLayer: PROMOTION_DISPOSITION_TO_LAYER[promotionDisposition],
      status,
      recordKind,
      routes: (raw["routes"] as string[] | undefined) ?? [],
      serviceMode: (raw["serviceMode"] as string | undefined) ?? null,
      primaryTreatments: (raw["primaryTreatments"] as string[] | undefined) ?? [],
      customTreatments: (raw["customTreatments"] as string[] | undefined) ?? [],
      corridor: (raw["corridor"] as Record<string, unknown> | undefined) ?? null,
      effectiveDate: (raw["effectiveDate"] as string | undefined) ?? null,
      datePrecision: (raw["datePrecision"] as "day" | "month" | "year" | undefined) ?? null,
      statusHistory: (raw["statusHistory"] as unknown[] | undefined) ?? [],
      treatmentComponents: (raw["treatmentComponents"] as unknown[] | undefined) ?? [],
      metrics: (raw["metrics"] as unknown[] | undefined) ?? [],
      caveats: (raw["caveats"] as unknown[] | undefined) ?? [],
      evidenceCandidateIds,
      evidencePreviews,
      review: {
        disposition: promotionDisposition,
        confidence: review.confidence ?? null,
        rationale: review.rationale ?? null,
        issueTags: review.issueTags ?? [],
      },
    });
  }

  const publishableByLayer: Record<PromotionLayer, number> = {
    canonical_milestone: 0,
    planned_or_proposed: 0,
  };
  const publishableByStatus: Record<PromotedInterventionStatus, number> = {
    implemented: 0,
    planned: 0,
    proposed: 0,
  };
  const sourceSet = new Set<string>();
  const routeSet = new Set<string>();
  for (const intervention of publishable) {
    publishableByLayer[intervention.timelineLayer] += 1;
    publishableByStatus[intervention.status] += 1;
    sourceSet.add(intervention.sourceId);
    for (const route of intervention.routes) routeSet.add(route);
  }

  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const outputPath =
    args.outputPath ?? join(dirname(args.reviewedCorpusPath), "intervention-publishable-v1.json");

  const artifact: PromotionArtifact = {
    version: 1,
    generatedAt,
    reviewedCorpusPath: args.reviewedCorpusPath,
    manualReviewPath: args.manualReviewPath,
    candidateCorpusPath: args.candidateCorpusPath,
    outputPath,
    summary: {
      reviewedRecordCount: records.length,
      manualReviewCount: reviews.length,
      publishableTotal: publishable.length,
      publishableByLayer,
      publishableByStatus,
      publishableSourceCount: sourceSet.size,
      publishableRouteCount: routeSet.size,
      excludedByDisposition,
      recordsWithoutReview,
      dispositionVsRecordKindConflicts: conflicts,
    },
    publishableInterventions: publishable,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  return artifact;
}

type PromotePublishableInterventionsCliArgs = {
  reviewedCorpusPath?: string;
  manualReviewPath?: string;
  candidateCorpusPath?: string;
  outputPath?: string;
  evidencePreviewLimit?: number;
};

function parsePromotePublishableInterventionsCliArgs(
  args: string[],
): PromotePublishableInterventionsCliArgs {
  const options: CliOption<PromotePublishableInterventionsCliArgs>[] = [
    {
      flags: ["--reviewed-corpus"],
      apply: (output, value) => {
        if (value !== undefined) output.reviewedCorpusPath = fromCliPath(value);
      },
    },
    {
      flags: ["--manual-review"],
      apply: (output, value) => {
        if (value !== undefined) output.manualReviewPath = fromCliPath(value);
      },
    },
    {
      flags: ["--candidate-corpus"],
      apply: (output, value) => {
        if (value !== undefined) output.candidateCorpusPath = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--evidence-preview-limit"],
      apply: (output, value) => {
        if (value !== undefined) output.evidencePreviewLimit = Number(value);
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

// ---------------------------------------------------------------------------
// Studio projection: intervention-publishable-v1.json -> per-route
// StudioIntervention[] map, ready for the studio release builder to attach
// as RouteScorecard.interventions[] entries.
//
// Mirrors buildStudioInterventionFromManualCandidate in
// tools/pipeline/src/jobs/build/studio-release.ts so a follow-up wiring
// change in that file can read the projected JSON and merge with the
// existing manual-interventions index.
// ---------------------------------------------------------------------------

export type StudioInterventionShape = {
  candidateId?: string;
  timelineLayer?:
    | "canonical_milestone"
    | "treatment_component"
    | "planned_or_proposed"
    | "evaluation";
  qualityTier?:
    | "canonical_milestone"
    | "implemented_treatment_component"
    | "planned_or_proposed"
    | "historical_context"
    | "supporting_duplicate"
    | "defer";
  status?: "implemented" | "planned" | "proposed" | "historical_context" | "defer";
  interventionType?: string;
  year: string;
  title: string;
  detail: string;
  tone?: "accent" | "good" | "warn" | "bad";
  sourceLabel?: string;
  sourceDetail?: string;
  sourceLinks?: Array<{ label: string; url: string }>;
};

export type StudioInterventionsByRoute = Record<string, StudioInterventionShape[]>;

export type ProjectPublishableInterventionsArtifact = {
  version: 1;
  generatedAt: string;
  publishableArtifactPath: string;
  outputPath: string | null;
  summary: {
    publishableRecordCount: number;
    projectedInterventionEntryCount: number;
    routeCount: number;
    droppedNoRoutesCount: number;
  };
  interventionsByRoute: StudioInterventionsByRoute;
};

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function projectionRouteKey(routeId: string): string {
  return routeId.toUpperCase().replace(/\+$/u, "");
}

function deriveTitle(record: PromotedIntervention, routeId?: string): string {
  const treatment = record.primaryTreatments[0] ?? record.customTreatments[0];
  if (routeId !== undefined && record.routes.length > 1) {
    if (treatment !== undefined) return `${titleCase(treatment)} — ${projectionRouteKey(routeId)}`;
    return `Bus priority intervention — ${projectionRouteKey(routeId)}`;
  }
  const street = (record.corridor?.["streets"] as string[] | undefined)?.[0];
  if (treatment !== undefined && street !== undefined) {
    return `${titleCase(treatment)} on ${street}`;
  }
  if (treatment !== undefined && record.routes.length > 0) {
    return `${titleCase(treatment)} — ${record.routes.join(", ")}`;
  }
  if (street !== undefined) {
    return `Bus priority on ${street}`;
  }
  if (record.routes.length > 0) {
    return `Bus priority intervention — ${record.routes.join(", ")}`;
  }
  return "Bus priority intervention";
}

function deriveDetail(record: PromotedIntervention): string {
  const components = record.treatmentComponents as Array<{ description?: string }>;
  if (Array.isArray(components) && components.length === 1) {
    const description = components[0]?.description;
    if (typeof description === "string" && description.length > 0) return description;
  }
  if (Array.isArray(components) && components.length > 1) {
    return `${components.length.toLocaleString("en-US")} curated treatment components`;
  }
  if (record.evidencePreviews.length > 0) {
    const firstPreview = record.evidencePreviews[0];
    if (firstPreview !== undefined) return firstPreview.quote;
  }
  return record.primaryTreatments.map(titleCase).join(", ") || "Bus priority intervention";
}

function deriveTone(status: PromotedInterventionStatus): "good" | "warn" {
  return status === "implemented" ? "good" : "warn";
}

function deriveQualityTier(layer: PromotionLayer): "canonical_milestone" | "planned_or_proposed" {
  return layer;
}

function deriveSourceLinks(record: PromotedIntervention): Array<{ label: string; url: string }> {
  const byUrl = new Map<string, { label: string; url: string }>();
  for (const preview of record.evidencePreviews) {
    if (preview.sourceUrl === null || preview.sourceUrl.length === 0) continue;
    if (byUrl.has(preview.sourceUrl)) continue;
    byUrl.set(preview.sourceUrl, {
      label: preview.sourceLabel,
      url: preview.sourceUrl,
    });
  }
  return [...byUrl.values()].toSorted(
    (left, right) => left.label.localeCompare(right.label) || left.url.localeCompare(right.url),
  );
}

function deriveYear(record: PromotedIntervention): string {
  if (record.effectiveDate === null || record.effectiveDate.length === 0) {
    return "date unknown";
  }
  return record.effectiveDate;
}

export function projectPublishableInterventionToStudio(
  record: PromotedIntervention,
  routeId?: string,
): StudioInterventionShape {
  const sourceLinks = deriveSourceLinks(record);
  const evidenceCount = record.evidencePreviews.length;
  return {
    candidateId: record.recordId,
    timelineLayer: record.timelineLayer,
    qualityTier: deriveQualityTier(record.timelineLayer),
    status: record.status,
    ...(record.primaryTreatments[0] !== undefined
      ? { interventionType: record.primaryTreatments[0] }
      : {}),
    year: deriveYear(record),
    title: deriveTitle(record, routeId),
    detail: deriveDetail(record),
    tone: deriveTone(record.status),
    sourceLabel: record.evidencePreviews[0]?.sourceLabel ?? `Source: ${record.sourceId}`,
    sourceDetail: `${evidenceCount.toLocaleString("en-US")} evidence preview${
      evidenceCount === 1 ? "" : "s"
    } from ${record.sourceId}`,
    ...(sourceLinks.length > 0 ? { sourceLinks } : {}),
  };
}

export type ProjectPublishableInterventionsArgs = {
  publishableArtifactPath: string;
  outputPath?: string;
  generatedAt?: string;
};

export async function projectPublishableInterventions(
  args: ProjectPublishableInterventionsArgs,
): Promise<ProjectPublishableInterventionsArtifact> {
  const publishable = (await Bun.file(args.publishableArtifactPath).json()) as PromotionArtifact;
  const interventionsByRoute: StudioInterventionsByRoute = {};
  let projectedInterventionEntryCount = 0;
  let droppedNoRoutesCount = 0;

  for (const record of publishable.publishableInterventions) {
    if (record.routes.length === 0) {
      droppedNoRoutesCount += 1;
      continue;
    }
    for (const routeId of record.routes) {
      const key = projectionRouteKey(routeId);
      const projected = projectPublishableInterventionToStudio(record, routeId);
      const group = interventionsByRoute[key] ?? [];
      group.push(projected);
      interventionsByRoute[key] = group;
      projectedInterventionEntryCount += 1;
    }
  }

  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const outputPath =
    args.outputPath ??
    join(dirname(args.publishableArtifactPath), "intervention-publishable-v1-by-route.json");
  const artifact: ProjectPublishableInterventionsArtifact = {
    version: 1,
    generatedAt,
    publishableArtifactPath: args.publishableArtifactPath,
    outputPath,
    summary: {
      publishableRecordCount: publishable.publishableInterventions.length,
      projectedInterventionEntryCount,
      routeCount: Object.keys(interventionsByRoute).length,
      droppedNoRoutesCount,
    },
    interventionsByRoute,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  return artifact;
}

type ProjectPublishableInterventionsCliArgs = {
  publishableArtifactPath?: string;
  outputPath?: string;
};

function parseProjectPublishableInterventionsCliArgs(
  args: string[],
): ProjectPublishableInterventionsCliArgs {
  const options: CliOption<ProjectPublishableInterventionsCliArgs>[] = [
    {
      flags: ["--publishable"],
      apply: (output, value) => {
        if (value !== undefined) output.publishableArtifactPath = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

export async function projectPublishableInterventionsFromCli(
  args: string[],
): Promise<ProjectPublishableInterventionsArtifact> {
  const parsed = parseProjectPublishableInterventionsCliArgs(args);
  if (parsed.publishableArtifactPath === undefined) {
    throw new Error("--publishable is required.");
  }
  return projectPublishableInterventions({
    publishableArtifactPath: parsed.publishableArtifactPath,
    ...(parsed.outputPath !== undefined ? { outputPath: parsed.outputPath } : {}),
  });
}

export async function promotePublishableInterventionsFromCli(
  args: string[],
): Promise<PromotionArtifact> {
  const parsed = parsePromotePublishableInterventionsCliArgs(args);
  if (parsed.reviewedCorpusPath === undefined) {
    throw new Error("--reviewed-corpus is required.");
  }
  if (parsed.manualReviewPath === undefined) {
    throw new Error("--manual-review is required.");
  }
  if (parsed.candidateCorpusPath === undefined) {
    throw new Error("--candidate-corpus is required.");
  }
  return promotePublishableInterventions({
    reviewedCorpusPath: parsed.reviewedCorpusPath,
    manualReviewPath: parsed.manualReviewPath,
    candidateCorpusPath: parsed.candidateCorpusPath,
    ...(parsed.outputPath !== undefined ? { outputPath: parsed.outputPath } : {}),
    ...(parsed.evidencePreviewLimit !== undefined
      ? { evidencePreviewLimit: parsed.evidencePreviewLimit }
      : {}),
  });
}

function parseFollowupOcrPlanCliArgs(args: string[]): FollowupOcrPlanCliArgs {
  const options: CliOption<FollowupOcrPlanCliArgs>[] = [
    {
      flags: ["--candidate-bundle"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.candidateBundlePath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--limit"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.limit = Number(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveFollowupOcrPlanPaths(
  args: FollowupOcrPlanCliArgs,
): Promise<PlanTier2FollowupOcrArgs> {
  if (args.candidateBundlePath !== undefined) {
    return {
      candidateBundlePath: args.candidateBundlePath,
      outputPath:
        args.outputPath ?? join(dirname(args.candidateBundlePath), "followup-ocr-plan.json"),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --candidate-bundle.");
  }

  return {
    candidateBundlePath: candidateBundlePath(artifactRoot, runId),
    outputPath: args.outputPath ?? followupOcrPlanPath(artifactRoot, runId),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  };
}

export async function planTier2FollowupOcrFromCli(args: string[]): Promise<Tier2OcrPlan> {
  return planTier2FollowupOcr(await resolveFollowupOcrPlanPaths(parseFollowupOcrPlanCliArgs(args)));
}
