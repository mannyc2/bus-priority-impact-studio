import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { replaceTier2InterventionStagingRows } from "@bp/db/local";
import {
  DocumentEvidenceCandidateDraftSchema,
  DocumentEvidenceCandidateTypeSchema,
  DocumentFactClassificationSchema,
  DocumentNegativeEvidenceFlagSchema,
  type DocumentEvidenceCandidateDraft,
  type DocumentEvidenceCandidateType,
  type DocumentFactClassification,
  type DocumentNegativeEvidenceFlag,
} from "@bp/domain";
import { PDFDocument } from "pdf-lib";
import * as z from "zod";
import { type CliOption, parseCliOptions, trueOption } from "../../lib/cli-args.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.js";

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

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

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

export type Tier2OcrTriageSource = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceGroup: string;
  sourceUrl: string;
  finalUrl: string;
  rawArtifactKey: string;
  pageRange: string;
  requestedPageLimit: number;
  pdfPageCount: number | null;
  selectedPageCount: number;
  selectedPages: number[];
  inputPdfArtifactKey: string | null;
  inputByteLength: number;
  inputSha256: string | null;
  status: "prepared" | "ocr_complete" | "ocr_failed";
  reusedExisting: boolean;
  httpStatus: number | null;
  requestedServiceTier: "flex" | "priority" | null;
  servedServiceTier: string | null;
  responseArtifactKey: string | null;
  textArtifactKey: string | null;
  parsedJsonArtifactKey: string | null;
  annotationsArtifactKey: string | null;
  usage: unknown | null;
  error: string | null;
};

export type Tier2OcrTriageManifest = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrPlanPath: string;
  captureManifestPath: string;
  outputPath: string | null;
  runtime: "pi-mono";
  provider: "openrouter";
  model: string;
  api: "chat.completions";
  pdfEngine: "cloudflare-ai" | "mistral-ocr" | "native";
  serviceTier: "flex" | "priority";
  maxTokens: number;
  triageRootName: string;
  execute: boolean;
  pageLimit: number;
  summary: {
    plannedSourceCount: number;
    selectedSourceCount: number;
    preparedCount: number;
    ocrCompleteCount: number;
    ocrFailedCount: number;
    reusedExistingCount: number;
    totalInputBytes: number;
  };
  sources: Tier2OcrTriageSource[];
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
  provider: "openrouter";
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

export type Tier2FollowupCurationPriority = "high" | "medium" | "low";

export type Tier2FollowupCurationQueueItem = {
  reviewItemId: string;
  priority: Tier2FollowupCurationPriority;
  sourceId: string;
  title: string;
  publisher: string;
  sourceGroup: string;
  sourceUrl: string;
  ocrQuality: Tier2OcrQualityReviewSource["ocrQuality"];
  decision: Tier2OcrQualityReviewSource["decision"];
  pagesReviewed: number[];
  usefulPages: number[];
  issueCodes: Tier2OcrQualityIssueCode[];
  reviewNotes: string | null;
  triageSummary: string | null;
  interventionFamilies: string[];
  normalizedInterventionTypes: string[];
  routesMentioned: string[];
  corridorsMentioned: string[];
  dateMentions: string[];
  artifactKeys: {
    ocrText: string | null;
    ocrJson: string | null;
    ocrAnnotations: string | null;
  };
  manualCuration: {
    state: "not_started" | "in_progress" | "curated" | "skip" | "needs_more_source";
    reviewer: string | null;
    reviewedAt: string | null;
    curatedCandidateIds: string[];
    notes: string | null;
  };
};

export type Tier2FollowupCurationQueue = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrQualityReviewPath: string;
  triageManifestPath: string;
  outputPath: string | null;
  summary: {
    reviewedExtractSourceCount: number;
    queueItemCount: number;
    highPriorityCount: number;
    mediumPriorityCount: number;
    lowPriorityCount: number;
    normalizedInterventionTypeCounts: Record<string, number>;
    sourceGroupCounts: Record<string, number>;
    issueCounts: Record<string, number>;
  };
  items: Tier2FollowupCurationQueueItem[];
};

export type Tier2FollowupCuratedCandidateDraft = {
  candidateId: string;
  interventionType: string;
  eventStatus: "implemented" | "planned" | "proposed" | "unknown";
  dateMention: string | null;
  datePrecision: "day" | "month" | "year" | "unknown";
  routeMentions: string[];
  corridorMentions: string[];
  evidenceRefs: Array<{
    artifactKey: string;
    pageRefs: number[];
    excerpt: string | null;
  }>;
  notes: string | null;
};

export type Tier2FollowupCurationDecision = {
  reviewItemId: string;
  sourceId: string;
  priority: Tier2FollowupCurationPriority;
  title: string;
  sourceUrl: string;
  currentDecision: "needs_human_review" | "curate_candidates" | "skip" | "needs_more_source";
  reviewer: string | null;
  reviewedAt: string | null;
  rationale: string | null;
  suggestedInterventionTypes: string[];
  usefulPages: number[];
  curatedCandidates: Tier2FollowupCuratedCandidateDraft[];
};

export type Tier2FollowupCurationDecisionTemplate = {
  version: 1;
  runId: string;
  generatedAt: string;
  queuePath: string;
  outputPath: string | null;
  summary: {
    decisionCount: number;
    needsHumanReviewCount: number;
  };
  decisions: Tier2FollowupCurationDecision[];
};

export type Tier2FollowupCurationDecisionVerification = {
  version: 1;
  runId: string;
  generatedAt: string;
  decisionsPath: string;
  queuePath: string;
  outputPath: string | null;
  complete: boolean;
  summary: {
    decisionCount: number;
    completeDecisionCount: number;
    incompleteDecisionCount: number;
    needsHumanReviewCount: number;
    curateCandidatesCount: number;
    skipCount: number;
    needsMoreSourceCount: number;
    curatedCandidateCount: number;
    missingReviewerCount: number;
    missingReviewedAtCount: number;
    missingRationaleCount: number;
    invalidCuratedCandidateCount: number;
    unknownReviewItemCount: number;
    missingReviewItemCount: number;
  };
};

export type Tier2CandidateValidationState =
  | "unvalidated"
  | "validated"
  | "needs_review"
  | "rejected";

export type Tier2CandidateSourceRef = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  publisher: string;
  documentDate: string | null;
  sourceGroup: string;
  artifactKeys: {
    raw: string | null;
    text: string | null;
    ocrText: string | null;
    ocrJson: string | null;
    ocrAnnotations: string | null;
  };
  pages: number[];
};

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

export type Tier2DocumentEvidenceCandidate = {
  candidateType: DocumentEvidenceCandidateType;
  candidateId: string;
  sourceRef: Tier2CandidateSourceRef;
  factClassification: DocumentFactClassification;
  negativeEvidenceFlag: DocumentNegativeEvidenceFlag;
  routeMentions: string[];
  corridorMentions: string[];
  evidencePageRefs: number[];
  evidenceQuote: string;
  summary: string;
  fields: Record<string, unknown>;
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
  extractionMode: "deterministic_ocr_triage_candidate_bundle";
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
  ocrQualityReviewPath: string;
  outputPath: string | null;
  triageRootName: string;
  summary: {
    sourceCandidateCount: number;
    entityLinkCandidateCount: number;
    interventionSeedCount: number;
    reviewQuestionCandidateCount: number;
    followupOcrCandidateCount: number;
    auditCount: number;
    unvalidatedCandidateCount: number;
  };
  documentSourceCandidates: Tier2DocumentSourceCandidate[];
  documentEntityLinkCandidates: Tier2DocumentEntityLinkCandidate[];
  documentInterventionSeeds: Tier2DocumentInterventionSeed[];
  documentEvidenceCandidates?: Tier2DocumentEvidenceCandidate[];
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
    interventionSeedCount: number;
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
    followupCurationQueuePath: string | null;
    followupCurationQueueItemCount: number;
    followupCurationQueueHighPriorityCount: number;
    followupCurationDecisionComplete: boolean;
    followupCurationCompleteDecisionCount: number;
    followupCurationIncompleteDecisionCount: number;
    followupCandidateBundlePath: string | null;
    followupInterventionSeedCount: number;
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

type DiscoveryClassification =
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

type CaptureTier2DocsArgs = {
  backlogPath?: string;
  artifactRoot?: string;
  runId?: string;
  fetchedAt?: string;
  fetcher?: FetchLike;
};

type PlanTier2OcrArgs = {
  captureManifestPath: string;
  outputPath?: string;
  generatedAt?: string;
  model?: string;
  defaultPageRange?: string;
};

type TriageTier2OcrArgs = {
  ocrPlanPath: string;
  outputPath?: string;
  generatedAt?: string;
  model?: string;
  pdfEngine?: Tier2OcrTriageManifest["pdfEngine"];
  serviceTier?: Tier2OcrTriageManifest["serviceTier"];
  maxTokens?: number;
  triageRootName?: string;
  pageLimit?: number;
  limit?: number;
  sourceId?: string;
  execute?: boolean;
  fetcher?: FetchLike;
  apiKey?: string;
};

type OcrTier2PageMarkdownArgs = {
  ocrPlanPath: string;
  outputPath?: string;
  generatedAt?: string;
  model?: string;
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

type ReviewTier2OcrArgs = {
  ocrPlanPath: string;
  outputPath?: string;
  generatedAt?: string;
  triageRootName?: string;
};

type AuditTier2OcrPageMarkdownArgs = {
  ocrPlanPath: string;
  outputPath?: string;
  generatedAt?: string;
  pageMarkdownRootName?: string;
};

type ExtractTier2OcrMarkdownCandidatesArgs = {
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

type ExtractTier2CandidatesArgs = {
  ocrPlanPath: string;
  ocrQualityReviewPath: string;
  ocrMarkdownCandidateExtractionPath: string;
  outputPath?: string;
  generatedAt?: string;
  triageRootName?: string;
};

type ChunkTier2DocumentsArgs = {
  candidateBundlePath: string;
  outputPath?: string;
  generatedAt?: string;
};

type AuditTier2InterventionDuplicatesArgs = {
  canonicalEventsPath: string;
  outputPath?: string;
  generatedAt?: string;
};

type BuildTier2DuplicateReviewQueueArgs = {
  canonicalEventsPath: string;
  duplicateAuditPath: string;
  candidateBundlePath: string;
  outputPath?: string;
  generatedAt?: string;
};

type BuildTier2DuplicateDecisionTemplateArgs = {
  duplicateReviewPath: string;
  outputPath?: string;
  generatedAt?: string;
};

type VerifyTier2DuplicateDecisionsArgs = {
  duplicateDecisionsPath: string;
  outputPath?: string;
  generatedAt?: string;
};

type BuildTier2PipelineStatusArgs = {
  runId: string;
  artifactRoot: string;
  studioReleasePath: string;
  outputPath?: string;
  generatedAt?: string;
};

type LoadTier2InterventionStagingArgs = {
  canonicalEventsPath: string;
  duplicateAuditPath: string;
  candidateBundlePath: string;
  duplicateDecisionsPath?: string;
  dbPath: string;
  outputPath?: string;
  generatedAt?: string;
};

type PlanTier2FollowupOcrArgs = {
  candidateBundlePath: string;
  outputPath?: string;
  generatedAt?: string;
  limit?: number;
};

type BuildTier2FollowupCurationQueueArgs = {
  ocrQualityReviewPath: string;
  triageManifestPath: string;
  outputPath?: string;
  generatedAt?: string;
};

type BuildTier2FollowupCurationDecisionTemplateArgs = {
  queuePath: string;
  outputPath?: string;
  generatedAt?: string;
};

type VerifyTier2FollowupCurationDecisionsArgs = {
  decisionsPath: string;
  queuePath: string;
  outputPath?: string;
  generatedAt?: string;
};

type BuildTier2FollowupCurationCandidateBundleArgs = {
  decisionsPath: string;
  queuePath: string;
  outputPath?: string;
  generatedAt?: string;
};

type DiscoverTier2DocsArgs = {
  captureManifestPath: string;
  backlogPath?: string;
  outputPath?: string;
  mergedBacklogPath?: string;
  generatedAt?: string;
};

type CaptureCliArgs = {
  backlogPath?: string;
  artifactRoot?: string;
  runId?: string;
};

type OcrPlanCliArgs = {
  captureManifestPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  model?: string;
  defaultPageRange?: string;
};

type OcrCliArgs = {
  ocrPlanPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  model?: string;
  pdfEngine?: Tier2OcrTriageManifest["pdfEngine"];
  serviceTier?: Tier2OcrTriageManifest["serviceTier"];
  maxTokens?: number;
  triageRootName?: string;
  pageLimit?: number;
  limit?: number;
  sourceId?: string;
  execute?: boolean;
  pageMarkdown?: boolean;
  pageInputPreference?: Tier2OcrPageInputPreference;
  allPages?: boolean;
  pageRangeOverride?: string;
  pageConcurrency?: number;
};

type OcrReviewCliArgs = {
  ocrPlanPath?: string;
  ocrQualityReviewPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  triageRootName?: string;
};

type ExtractCliArgs = OcrReviewCliArgs & {
  ocrMarkdownCandidateExtractionPath?: string;
};

type OcrPageMarkdownAuditCliArgs = {
  ocrPlanPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  pageMarkdownRootName?: string;
};

type OcrMarkdownCandidatesCliArgs = {
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

type ChunkCliArgs = {
  candidateBundlePath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

type DuplicateAuditCliArgs = {
  canonicalEventsPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

type DuplicateReviewCliArgs = {
  canonicalEventsPath?: string;
  duplicateAuditPath?: string;
  candidateBundlePath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

type DuplicateDecisionTemplateCliArgs = {
  duplicateReviewPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

type VerifyDuplicateDecisionsCliArgs = {
  duplicateDecisionsPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

type PipelineStatusCliArgs = {
  artifactRoot?: string;
  runId?: string;
  studioReleasePath?: string;
  outputPath?: string;
};

type VerifyManualInterventionsCliArgs = {
  manualInterventionsPath?: string;
  canonicalEventsPath?: string;
  candidateBundlePath?: string;
  documentChunksPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

type LoadStagingCliArgs = {
  canonicalEventsPath?: string;
  duplicateAuditPath?: string;
  candidateBundlePath?: string;
  duplicateDecisionsPath?: string;
  dbPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

type FollowupOcrPlanCliArgs = {
  candidateBundlePath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  limit?: number;
};

type FollowupCurationQueueCliArgs = {
  ocrQualityReviewPath?: string;
  triageManifestPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

type FollowupCurationDecisionTemplateCliArgs = {
  queuePath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

type VerifyFollowupCurationDecisionsCliArgs = {
  decisionsPath?: string;
  queuePath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
};

type FollowupCurationCandidateBundleCliArgs = VerifyFollowupCurationDecisionsCliArgs;

type DiscoverCliArgs = {
  captureManifestPath?: string;
  backlogPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  mergedBacklogPath?: string;
};

const DEFAULT_BACKLOG_PATH = fromRepoRoot("knowledge/raw/tier2_document_backlog.json");
const DEFAULT_OCR_MODEL = "qwen/qwen3.7-max";
const DEFAULT_OCR_MAX_TOKENS = 4096;
const DEFAULT_OCR_TRIAGE_ROOT_NAME = "ocr-triage";
const DEFAULT_OCR_PAGE_MARKDOWN_ROOT_NAME = "ocr-page-markdown";
const OCR_TRIAGE_TOOL_NAME = "record_tier2_ocr_triage";
const OCR_PAGE_MARKDOWN_TOOL_NAME = "record_tier2_ocr_page";
const OCR_MARKDOWN_CANDIDATE_TOOL_NAME = "record_tier2_ocr_markdown_candidates";
const OCR_PAGE_MARKDOWN_PROMPT_VERSION = "page-markdown-v3";
const OCR_MARKDOWN_CANDIDATE_PROMPT_VERSION = "ocr-markdown-candidates-v2";
const DEFAULT_OPENROUTER_MAX_ATTEMPTS = 3;

function docsArtifactRoot(artifactRoot: string): string {
  return join(artifactRoot, "docs");
}

function runArtifactRoot(artifactRoot: string, runId: string): string {
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

function createRunId(now = new Date()): string {
  return `docs-capture-${now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(/[:.]/g, "")}`;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function artifactKey(absolutePath: string, root: string): string {
  return relative(root, absolutePath).split(/[\\/]/).join("/");
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function readRequiredJsonArtifact<T>(path: string): Promise<T> {
  return (await Bun.file(path).json()) as T;
}

async function readJsonArtifactIfExistsForStatus<T>(path: string): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return (await file.json()) as T;
}

function stripHtmlToText(html: string): string {
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

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
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

function captureHeaders(init: RequestInit | undefined, userAgent: string): Headers {
  const headers = new Headers(init?.headers);
  headers.set(
    "Accept",
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,application/json;q=0.8,*/*;q=0.7",
  );
  headers.set("Accept-Language", "en-US,en;q=0.9");
  headers.set("User-Agent", userAgent);
  return headers;
}

async function defaultFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const primary = await fetch(input, {
    ...init,
    headers: captureHeaders(init, "BusPriorityImpactStudio/0.1 (+https://github.com/)"),
  });

  if (primary.status !== 403) {
    return primary;
  }

  return fetch(input, {
    ...init,
    headers: captureHeaders(
      init,
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    ),
  });
}

async function readBacklog(path: string): Promise<Tier2Backlog> {
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

async function writeSourceMetadata(runRoot: string, source: Tier2CapturedSource): Promise<void> {
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
    const finalUrl = response.url.length > 0 ? response.url : source.url;
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

function summarizeCapture(sources: Tier2CapturedSource[]): Tier2CaptureManifest["summary"] {
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

function parseOcrCliArgs(args: string[]): OcrCliArgs {
  const options: CliOption<OcrCliArgs>[] = [
    {
      flags: ["--ocr-plan"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.ocrPlanPath = fromCliPath(value);
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
      flags: ["--pdf-engine"],
      apply: (output, value) => {
        if (value === "cloudflare-ai" || value === "mistral-ocr" || value === "native") {
          output.pdfEngine = value;
          return;
        }
        throw new Error("--pdf-engine must be cloudflare-ai, mistral-ocr, or native.");
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
      flags: ["--triage-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.triageRootName = value;
        }
      },
    },
    {
      flags: ["--page-limit"],
      apply: (output, value) => {
        output.pageLimit = Number(value);
      },
    },
    {
      flags: ["--page"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.pageRangeOverride = value;
        }
      },
    },
    {
      flags: ["--page-range"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.pageRangeOverride = value;
        }
      },
    },
    {
      flags: ["--page-concurrency"],
      apply: (output, value) => {
        output.pageConcurrency = Number(value);
      },
    },
    {
      flags: ["--limit"],
      apply: (output, value) => {
        output.limit = Number(value);
      },
    },
    {
      flags: ["--source-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.sourceId = value;
        }
      },
    },
    {
      flags: ["--page-input"],
      apply: (output, value) => {
        if (value === "auto" || value === "pdf" || value === "image") {
          output.pageInputPreference = value;
          return;
        }
        throw new Error("--page-input must be auto, pdf, or image.");
      },
    },
    trueOption<OcrCliArgs>(["--page-markdown"], (output) => {
      output.pageMarkdown = true;
    }),
    trueOption<OcrCliArgs>(["--all-pages"], (output) => {
      output.allPages = true;
    }),
    trueOption<OcrCliArgs>(["--execute"], (output) => {
      output.execute = true;
    }),
  ];
  return parseCliOptions(args, {}, options);
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

function normalizeOcrArtifactRootName(input: {
  value: string | undefined;
  defaultName: string;
  flagName: string;
}): string {
  const rootName = input.value ?? input.defaultName;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(rootName)) {
    throw new Error(`${input.flagName} must use lowercase letters, numbers, dashes, or underscores.`);
  }
  return rootName;
}

function normalizeOcrTriageRootName(value: string | undefined): string {
  return normalizeOcrArtifactRootName({
    value,
    defaultName: DEFAULT_OCR_TRIAGE_ROOT_NAME,
    flagName: "--triage-root",
  });
}

function normalizeOcrPageMarkdownRootName(value: string | undefined): string {
  return normalizeOcrArtifactRootName({
    value,
    defaultName: DEFAULT_OCR_PAGE_MARKDOWN_ROOT_NAME,
    flagName: "--triage-root",
  });
}

function ocrTriageSourceRoot(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  triageRootName?: string;
}): string {
  return join(
    input.runRoot,
    normalizeOcrTriageRootName(input.triageRootName),
    "sources",
    `${String(input.sourceIndex + 1).padStart(4, "0")}_${input.source.sourceId}`,
  );
}

function ocrPageMarkdownSourceRoot(input: {
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

async function writePdfSlice(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  triageRootName?: string;
  pageLimit: number;
  pageRange: string;
}): Promise<{
  pdfPageCount: number;
  selectedPages: number[];
  artifactKey: string;
  byteLength: number;
  sha256: string;
}> {
  const rawPath = join(input.runRoot, input.source.rawArtifactKey);
  const rawBytes = new Uint8Array(await Bun.file(rawPath).arrayBuffer());
  const pdf = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
  const pdfPageCount = pdf.getPageCount();
  const selectedPageIndexes = parsePageRange(input.pageRange, pdfPageCount).slice(
    0,
    input.pageLimit,
  );
  if (selectedPageIndexes.length === 0) {
    throw new Error(`No pages selected for ${input.source.sourceId}.`);
  }

  const slice = await PDFDocument.create();
  const copiedPages = await slice.copyPages(pdf, selectedPageIndexes);
  for (const page of copiedPages) {
    slice.addPage(page);
  }
  const sliceBytes = await slice.save();
  const sourceRoot = ocrTriageSourceRoot(input);
  await mkdir(sourceRoot, { recursive: true });
  const outputPath = join(sourceRoot, "input-pages.pdf");
  await Bun.write(outputPath, sliceBytes);

  return {
    pdfPageCount,
    selectedPages: selectedPageIndexes.map((pageIndex) => pageIndex + 1),
    artifactKey: artifactKey(outputPath, input.runRoot),
    byteLength: sliceBytes.byteLength,
    sha256: sha256(sliceBytes),
  };
}

async function executableExists(command: string): Promise<boolean> {
  const proc = Bun.spawn(["which", command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  return exitCode === 0;
}

async function pdfInfoPageCount(pdfPath: string): Promise<number | null> {
  if (!(await executableExists("pdfinfo"))) {
    return null;
  }
  const proc = Bun.spawn(["pdfinfo", pdfPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
  ]);
  if (exitCode !== 0) {
    return null;
  }
  const match = stdout.match(/^Pages:\s+(\d+)\s*$/m);
  if (match === null) {
    return null;
  }
  const pageCount = Number.parseInt(match[1]!, 10);
  return Number.isFinite(pageCount) && pageCount > 0 ? pageCount : null;
}

async function mapWithConcurrency<T, R>(
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
  const [exitCode, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`pdftoppm failed for page ${input.pageNumber}: ${stderr.trim()}`);
  }
  const outputNames = (await readdir(input.outputDir)).filter(
    (name) => name.startsWith(`${basename(prefix)}-`) && name.endsWith(".png"),
  );
  const outputPath = outputNames.length === 1 ? join(input.outputDir, outputNames[0]!) : null;
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
  const renderAvailable = shouldUseRenderedImageInput
    ? await executableExists("pdftoppm")
    : false;
  if (input.pageInputPreference === "image" && !renderAvailable) {
    throw new Error("PDF page image rendering requested, but pdftoppm is not available.");
  }

  let rawBytes: Uint8Array | null = null;
  let pdf: PDFDocument | null = null;
  let pdfPageCount = shouldUseRenderedImageInput && renderAvailable
    ? await pdfInfoPageCount(rawPath)
    : null;
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

function buildOcrTriagePrompt(input: {
  source: Tier2OcrPlanSource;
  selectedPages: number[];
  pdfPageCount: number;
}): string {
  return [
    "You are doing OCR triage for Bus Priority Impact Studio.",
    "Read only the attached PDF slice and return source-grounded triage. Do not infer facts from memory.",
    `You must call the ${OCR_TRIAGE_TOOL_NAME} tool. Do not answer with plain text or fallback JSON.`,
    "Goal: decide whether these pages contain useful official bus intervention or policy evidence.",
    "Look for SBS launch dates, Transit Signal Priority installs, busway launches, stop consolidation, all-door boarding/fare policy, route redesign/service changes, capital project milestones, ACE/ABLE scope changes, route lists, corridor names, implementation dates, or project status.",
    "Candidate drafts are only draft leads. Create them only when a single source span supports one intervention or policy candidate; do not combine unrelated claims into one draft.",
    "Evidence candidate drafts are also draft leads. Use them for before/after metric rows, tables, methodology notes, caveats, project status, treatment components, supersession, or explicit source gaps. Put type-specific details in fields and keep every candidate anchored to the evidence quote and page refs.",
    "",
    `Source ID: ${input.source.sourceId}`,
    `Title: ${input.source.title}`,
    `Publisher: ${input.source.publisher}`,
    `Source group: ${input.source.sourceGroup}`,
    `Pages in this slice: ${input.selectedPages.join(", ")} of ${input.pdfPageCount}`,
    "",
    "Return JSON with exactly these top-level keys:",
    "{",
    '  "sourceId": string,',
    '  "pagesReviewed": number[],',
    '  "ocrQuality": "good" | "partial" | "poor",',
    '  "decision": "extract" | "skip" | "needs_review",',
    '  "interventionFamilies": string[],',
    '  "routesMentioned": string[],',
    '  "corridorsMentioned": string[],',
    '  "dateMentions": string[],',
    '  "usefulPages": number[],',
    '  "summary": string,',
    '  "reviewNotes": string,',
    '  "candidateDrafts": [',
    "    {",
    '      "interventionType": string,',
    '      "eventStatus": "implemented" | "planned" | "proposed" | "unknown",',
    '      "dateMention": string | null,',
    '      "datePrecision": "day" | "month" | "year" | "unknown",',
    '      "routeMentions": string[],',
    '      "corridorMentions": string[],',
    '      "evidencePageRefs": number[],',
    '      "evidenceQuote": string,',
    '      "rationale": string',
    "    }",
    "  ],",
    '  "evidenceCandidateDrafts": [',
    "    {",
    '      "candidateType": "document_metric_claim_candidate" | "document_table_candidate" | "document_methodology_candidate" | "document_caveat_candidate" | "document_project_status_candidate" | "document_treatment_component_candidate" | "document_supersession_candidate" | "document_source_gap_candidate",',
    '      "factClassification": "official_fact" | "official_claim" | "third_party_evaluation" | "context" | "caveat" | "methodology" | "source_gap",',
    '      "negativeEvidenceFlag": "proposed_only" | "outreach_not_implementation" | "ocr_cannot_read_map" | "no_stop_table" | "claim_without_row_data" | "presentation_date_not_implementation" | "superseded_source" | "official_linked_not_mta_dot" | "mention_too_thin_for_intervention" | "none",',
    '      "routeMentions": string[],',
    '      "corridorMentions": string[],',
    '      "evidencePageRefs": number[],',
    '      "evidenceQuote": string,',
    '      "summary": string,',
    '      "fields": object',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

function ocrTriageTool(): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: OCR_TRIAGE_TOOL_NAME,
      description:
        "Record source-grounded OCR triage and draft intervention candidates from the attached official PDF slice.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: [
          "sourceId",
          "pagesReviewed",
          "ocrQuality",
          "decision",
          "interventionFamilies",
          "routesMentioned",
          "corridorsMentioned",
          "dateMentions",
          "usefulPages",
          "summary",
          "reviewNotes",
          "candidateDrafts",
          "evidenceCandidateDrafts",
        ],
        properties: {
          sourceId: { type: "string" },
          pagesReviewed: { type: "array", items: { type: "integer", minimum: 1 } },
          ocrQuality: { type: "string", enum: ["good", "partial", "poor"] },
          decision: { type: "string", enum: ["extract", "skip", "needs_review"] },
          interventionFamilies: { type: "array", items: { type: "string" } },
          routesMentioned: { type: "array", items: { type: "string" } },
          corridorsMentioned: { type: "array", items: { type: "string" } },
          dateMentions: { type: "array", items: { type: "string" } },
          usefulPages: { type: "array", items: { type: "integer", minimum: 1 } },
          summary: { type: "string" },
          reviewNotes: { type: "string" },
          candidateDrafts: {
            type: "array",
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "interventionType",
                "eventStatus",
                "dateMention",
                "datePrecision",
                "routeMentions",
                "corridorMentions",
                "evidencePageRefs",
                "evidenceQuote",
                "rationale",
              ],
              properties: {
                interventionType: { type: "string" },
                eventStatus: {
                  type: "string",
                  enum: ["implemented", "planned", "proposed", "unknown"],
                },
                dateMention: { type: ["string", "null"] },
                datePrecision: {
                  type: "string",
                  enum: ["day", "month", "year", "unknown"],
                },
                routeMentions: { type: "array", items: { type: "string" } },
                corridorMentions: { type: "array", items: { type: "string" } },
                evidencePageRefs: { type: "array", items: { type: "integer", minimum: 1 } },
                evidenceQuote: { type: "string" },
                rationale: { type: "string" },
              },
            },
          },
          evidenceCandidateDrafts: {
            type: "array",
            maxItems: 16,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "candidateType",
                "factClassification",
                "negativeEvidenceFlag",
                "routeMentions",
                "corridorMentions",
                "evidencePageRefs",
                "evidenceQuote",
                "summary",
                "fields",
              ],
              properties: {
                candidateType: {
                  type: "string",
                  enum: DocumentEvidenceCandidateTypeSchema.options,
                },
                factClassification: {
                  type: "string",
                  enum: DocumentFactClassificationSchema.options,
                },
                negativeEvidenceFlag: {
                  type: "string",
                  enum: DocumentNegativeEvidenceFlagSchema.options,
                },
                routeMentions: { type: "array", items: { type: "string" } },
                corridorMentions: { type: "array", items: { type: "string" } },
                evidencePageRefs: { type: "array", items: { type: "integer", minimum: 1 } },
                evidenceQuote: { type: "string" },
                summary: { type: "string" },
                fields: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
    },
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

function unknownRecord(value: unknown): Record<string, unknown> | null {
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

function pageMarkdownToolResult(value: unknown): {
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

function frontmatterValue(value: unknown): string {
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

function extractToolCallArguments(responseJson: unknown, toolName: string): unknown | null {
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
        return null;
      }
    }
  }
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

const OCR_QUALITY_ISSUE_CODES: readonly Tier2OcrQualityIssueCode[] = [
  "not_started",
  "ocr_failed",
  "missing_triage_json",
  "invalid_triage_json",
  "source_id_mismatch",
  "missing_annotations",
  "missing_ocr_text",
  "low_ocr_text_density",
  "partial_or_poor_ocr",
  "extract_no_intervention_family",
  "extract_no_date",
  "extract_no_corridor",
  "extract_no_route",
  "extract_no_useful_pages",
  "manual_visual_review_hint",
];

function emptyOcrQualityIssueCounts(): Record<Tier2OcrQualityIssueCode, number> {
  return Object.fromEntries(OCR_QUALITY_ISSUE_CODES.map((code) => [code, 0])) as Record<
    Tier2OcrQualityIssueCode,
    number
  >;
}

async function readJsonArtifact(path: string): Promise<{
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

function stringArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").length : 0;
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

function triageOcrQuality(value: unknown): Tier2OcrQualityReviewSource["ocrQuality"] {
  if (value === "good" || value === "partial" || value === "poor") {
    return value;
  }
  return "unknown";
}

function triageDecision(value: unknown): Tier2OcrQualityReviewSource["decision"] {
  if (value === "extract" || value === "skip" || value === "needs_review") {
    return value;
  }
  return "unknown";
}

type OcrAnnotationRecord = Record<string, unknown> & {
  text?: unknown;
  type?: unknown;
};

type OcrTriageRecord = Record<string, unknown> & {
  candidateDrafts?: unknown;
  corridorsMentioned?: unknown;
  dateMentions?: unknown;
  decision?: unknown;
  evidenceCandidateDrafts?: unknown;
  interventionFamilies?: unknown;
  ocrQuality?: unknown;
  pagesReviewed?: unknown;
  reviewNotes?: unknown;
  routesMentioned?: unknown;
  sourceId?: unknown;
  summary?: unknown;
  usefulPages?: unknown;
};

type OcrCandidateDraft = {
  interventionType: string;
  eventStatus: "implemented" | "planned" | "proposed" | "unknown";
  dateMention: string | null;
  datePrecision: "day" | "month" | "year" | "unknown";
  routeMentions: string[];
  corridorMentions: string[];
  evidencePageRefs: number[];
  evidenceQuote: string | null;
  rationale: string | null;
};

type OcrEvidenceCandidateDraft = DocumentEvidenceCandidateDraft;

function shouldDisableReasoningForRequiredToolCalls(model: string): boolean {
  return model.toLowerCase().startsWith("qwen/qwen3.7");
}

function requiredToolCallReasoningOverride(model: string): { effort: "none" } | null {
  return shouldDisableReasoningForRequiredToolCalls(model) ? { effort: "none" } : null;
}

function supportsRenderedImageOcrInput(model: string): boolean {
  return !model.toLowerCase().startsWith("qwen/qwen3.7-max");
}

function ocrCandidateEventStatus(value: unknown): OcrCandidateDraft["eventStatus"] {
  if (value === "implemented" || value === "planned" || value === "proposed") {
    return value;
  }
  return "unknown";
}

function ocrCandidateDatePrecision(value: unknown): OcrCandidateDraft["datePrecision"] {
  if (value === "day" || value === "month" || value === "year") {
    return value;
  }
  return "unknown";
}

function ocrCandidateDrafts(value: unknown): OcrCandidateDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const drafts: OcrCandidateDraft[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const interventionType = triageString(
      record["interventionType"] ?? record["interventionFamily"],
    );
    if (interventionType === null) {
      continue;
    }
    drafts.push({
      interventionType,
      eventStatus: ocrCandidateEventStatus(record["eventStatus"]),
      dateMention: triageString(record["dateMention"]),
      datePrecision: ocrCandidateDatePrecision(record["datePrecision"]),
      routeMentions: [...new Set(stringArray(record["routeMentions"]))],
      corridorMentions: [...new Set(stringArray(record["corridorMentions"]))],
      evidencePageRefs: [...new Set(numberArray(record["evidencePageRefs"] ?? record["pages"]))],
      evidenceQuote: triageString(record["evidenceQuote"]),
      rationale: triageString(record["rationale"] ?? record["notes"]),
    });
  }
  return drafts;
}

function ocrEvidenceCandidateDrafts(value: unknown): OcrEvidenceCandidateDraft[] {
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

function annotationTextBlocks(annotations: unknown): string[] {
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

function annotationStats(annotations: unknown): {
  textBlockCount: number;
  textCharCount: number;
  imageCount: number;
} {
  let textBlockCount = 0;
  let textCharCount = 0;
  let imageCount = 0;
  const seen = new Set<unknown>();

  const visit = (value: unknown) => {
    if (value === null || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);
    const record = value as OcrAnnotationRecord;
    if (record.type === "text" && typeof record.text === "string") {
      if (!annotationTextIsWrapper(record.text)) {
        textBlockCount += 1;
        textCharCount += record.text.trim().length;
      }
      return;
    }
    if (record.type === "image_url") {
      imageCount += 1;
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

  return { textBlockCount, textCharCount, imageCount };
}

function hasManualVisualReviewHint(triage: OcrTriageRecord): boolean {
  const text = [triageString(triage.summary), triageString(triage.reviewNotes)]
    .filter((item): item is string => item !== null)
    .join(" ")
    .toLowerCase();
  return [
    "chart",
    "diagram",
    "garbled",
    "image",
    "map",
    "not captured",
    "not readable",
    "table",
    "timeline",
    "visual review",
  ].some((hint) => text.includes(hint));
}

function issueListForOcrReviewSource(input: {
  status: Tier2OcrQualityReviewSource["status"];
  source: Tier2OcrPlanSource;
  triage: OcrTriageRecord | null;
  triageExists: boolean;
  triageParseError: boolean;
  annotationsExist: boolean;
  annotationTextCharCount: number;
  textCharsPerReviewedPage: number | null;
  ocrQuality: Tier2OcrQualityReviewSource["ocrQuality"];
  decision: Tier2OcrQualityReviewSource["decision"];
  interventionFamilyCount: number;
  routeCount: number;
  corridorCount: number;
  dateCount: number;
  usefulPageCount: number;
}): Tier2OcrQualityIssueCode[] {
  const issues: Tier2OcrQualityIssueCode[] = [];
  if (input.status === "not_started" || input.status === "prepared") {
    issues.push("not_started");
  }
  if (input.status === "ocr_failed") {
    issues.push("ocr_failed");
  }
  if (input.status !== "ocr_failed" && !input.triageExists) {
    issues.push("missing_triage_json");
  } else if (input.status !== "ocr_failed" && input.triageParseError) {
    issues.push("invalid_triage_json");
  }
  if (
    input.triage !== null &&
    typeof input.triage.sourceId === "string" &&
    input.triage.sourceId !== input.source.sourceId
  ) {
    issues.push("source_id_mismatch");
  }
  if (!input.annotationsExist) {
    issues.push("missing_annotations");
  } else if (input.annotationTextCharCount === 0) {
    issues.push("missing_ocr_text");
  }
  if (input.textCharsPerReviewedPage !== null && input.textCharsPerReviewedPage < 250) {
    issues.push("low_ocr_text_density");
  }
  if (input.ocrQuality === "partial" || input.ocrQuality === "poor") {
    issues.push("partial_or_poor_ocr");
  }
  if (input.decision === "extract") {
    if (input.interventionFamilyCount === 0) {
      issues.push("extract_no_intervention_family");
    }
    if (input.dateCount === 0) {
      issues.push("extract_no_date");
    }
    if (input.corridorCount === 0) {
      issues.push("extract_no_corridor");
    }
    if (input.routeCount === 0) {
      issues.push("extract_no_route");
    }
    if (input.usefulPageCount === 0) {
      issues.push("extract_no_useful_pages");
    }
  }
  if (input.triage !== null && hasManualVisualReviewHint(input.triage)) {
    issues.push("manual_visual_review_hint");
  }
  return [...new Set(issues)];
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

async function readExistingTriageSource(input: {
  baseSource: Omit<
    Tier2OcrTriageSource,
    | "status"
    | "reusedExisting"
    | "httpStatus"
    | "requestedServiceTier"
    | "servedServiceTier"
    | "responseArtifactKey"
    | "textArtifactKey"
    | "parsedJsonArtifactKey"
    | "annotationsArtifactKey"
    | "usage"
    | "error"
  >;
  runRoot: string;
  sourceRoot: string;
  requestedServiceTier: Tier2OcrTriageManifest["serviceTier"] | null;
}): Promise<Tier2OcrTriageSource | null> {
  const responsePath = join(input.sourceRoot, "openrouter-response.json");
  const textPath = join(input.sourceRoot, "triage-output.txt");
  const parsedJsonPath = join(input.sourceRoot, "triage-output.json");
  const annotationsPath = join(input.sourceRoot, "openrouter-file-annotations.json");

  if (
    !(await Bun.file(responsePath).exists()) ||
    !(await Bun.file(textPath).exists()) ||
    !(await Bun.file(parsedJsonPath).exists())
  ) {
    return null;
  }

  const responseBody = (await Bun.file(responsePath)
    .json()
    .catch(() => null)) as {
    error?: unknown;
    usage?: unknown;
    service_tier?: string | null;
  } | null;
  if (responseBody === null || responseBody.error !== undefined) {
    return null;
  }

  return {
    ...input.baseSource,
    status: "ocr_complete",
    reusedExisting: true,
    httpStatus: 200,
    requestedServiceTier: input.requestedServiceTier,
    servedServiceTier:
      typeof responseBody.service_tier === "string" ? responseBody.service_tier : null,
    responseArtifactKey: artifactKey(responsePath, input.runRoot),
    textArtifactKey: artifactKey(textPath, input.runRoot),
    parsedJsonArtifactKey: artifactKey(parsedJsonPath, input.runRoot),
    annotationsArtifactKey: (await Bun.file(annotationsPath).exists())
      ? artifactKey(annotationsPath, input.runRoot)
      : null,
    usage: responseBody.usage ?? null,
    error: null,
  };
}

async function callOpenRouterOcr(input: {
  apiKey: string;
  model: string;
  pdfEngine: Tier2OcrTriageManifest["pdfEngine"];
  serviceTier: Tier2OcrTriageManifest["serviceTier"];
  maxTokens: number;
  source: Tier2OcrPlanSource;
  selectedPages: number[];
  pdfPageCount: number;
  inputPdfPath: string;
  fetcher: FetchLike;
}): Promise<{ response: Response; body: unknown }> {
  const bytes = new Uint8Array(await Bun.file(input.inputPdfPath).arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");
  const prompt = buildOcrTriagePrompt({
    source: input.source,
    selectedPages: input.selectedPages,
    pdfPageCount: input.pdfPageCount,
  });
  const reasoning = requiredToolCallReasoningOverride(input.model);
  return postOpenRouterChatCompletions({
    apiKey: input.apiKey,
    title: "Bus Priority Impact Studio Tier 2 OCR",
    fetcher: input.fetcher,
    body: {
      model: input.model,
      service_tier: input.serviceTier,
      max_tokens: input.maxTokens,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "file",
              file: {
                filename: `${input.source.sourceId}.pdf`,
                file_data: `data:application/pdf;base64,${base64}`,
              },
            },
          ],
        },
      ],
      plugins: [
        {
          id: "file-parser",
          pdf: {
            engine: input.pdfEngine,
          },
        },
      ],
      tools: [ocrTriageTool()],
      tool_choice: {
        type: "function",
        function: { name: OCR_TRIAGE_TOOL_NAME },
      },
      ...(reasoning === null ? {} : { reasoning }),
      temperature: 0,
    },
  });
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

async function triageOcrSource(input: {
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  runRoot: string;
  triageRootName: string;
  pageLimit: number;
  model: string;
  pdfEngine: Tier2OcrTriageManifest["pdfEngine"];
  serviceTier: Tier2OcrTriageManifest["serviceTier"];
  maxTokens: number;
  execute: boolean;
  fetcher: FetchLike;
  apiKey: string | undefined;
}): Promise<Tier2OcrTriageSource> {
  try {
    const slice = await writePdfSlice({
      runRoot: input.runRoot,
      source: input.source,
      sourceIndex: input.sourceIndex,
      triageRootName: input.triageRootName,
      pageLimit: input.pageLimit,
      pageRange: input.source.pageRange,
    });
    const inputPdfPath = join(input.runRoot, slice.artifactKey);
    const baseSource = {
      sourceId: input.source.sourceId,
      title: input.source.title,
      publisher: input.source.publisher,
      sourceGroup: input.source.sourceGroup,
      sourceUrl: input.source.sourceUrl,
      finalUrl: input.source.finalUrl,
      rawArtifactKey: input.source.rawArtifactKey,
      pageRange: input.source.pageRange,
      requestedPageLimit: input.pageLimit,
      pdfPageCount: slice.pdfPageCount,
      selectedPageCount: slice.selectedPages.length,
      selectedPages: slice.selectedPages,
      inputPdfArtifactKey: slice.artifactKey,
      inputByteLength: slice.byteLength,
      inputSha256: slice.sha256,
    };

    if (!input.execute) {
      return {
        ...baseSource,
        status: "prepared",
        reusedExisting: false,
        httpStatus: null,
        requestedServiceTier: input.serviceTier,
        servedServiceTier: null,
        responseArtifactKey: null,
        textArtifactKey: null,
        parsedJsonArtifactKey: null,
        annotationsArtifactKey: null,
        usage: null,
        error: null,
      };
    }

    const sourceRoot = dirname(inputPdfPath);
    const existing = await readExistingTriageSource({
      baseSource,
      runRoot: input.runRoot,
      sourceRoot,
      requestedServiceTier: null,
    });
    if (existing !== null) {
      return existing;
    }

    if (input.apiKey === undefined || input.apiKey.length === 0) {
      throw new Error("OPENROUTER_API_KEY is required for docs:ocr --execute.");
    }

    const openRouter = await callOpenRouterOcr({
      apiKey: input.apiKey,
      model: input.model,
      pdfEngine: input.pdfEngine,
      serviceTier: input.serviceTier,
      maxTokens: input.maxTokens,
      source: input.source,
      selectedPages: slice.selectedPages,
      pdfPageCount: slice.pdfPageCount,
      inputPdfPath,
      fetcher: input.fetcher,
    });
    const responsePath = join(sourceRoot, "openrouter-response.json");
    await writeJson(responsePath, openRouter.body);
    const annotations = extractFileAnnotations(openRouter.body);
    const annotationsPath = join(sourceRoot, "openrouter-file-annotations.json");
    if (annotations.length > 0) {
      await writeJson(annotationsPath, annotations);
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
      await writeJson(join(sourceRoot, "error.json"), {
        sourceId: input.source.sourceId,
        httpStatus: openRouter.response.status,
        statusText: openRouter.response.statusText,
        error: errorMessage,
      });
      return {
        ...baseSource,
        status: "ocr_failed",
        reusedExisting: false,
        httpStatus: openRouter.response.status,
        requestedServiceTier: input.serviceTier,
        servedServiceTier: null,
        responseArtifactKey: artifactKey(responsePath, input.runRoot),
        textArtifactKey: null,
        parsedJsonArtifactKey: null,
        annotationsArtifactKey:
          annotations.length > 0 ? artifactKey(annotationsPath, input.runRoot) : null,
        usage: null,
        error: errorMessage,
      };
    }

    const toolArgs = extractToolCallArguments(openRouter.body, OCR_TRIAGE_TOOL_NAME);
    if (toolArgs === null) {
      const errorMessage = `OpenRouter response did not include required ${OCR_TRIAGE_TOOL_NAME} tool call.`;
      await writeJson(join(sourceRoot, "error.json"), {
        sourceId: input.source.sourceId,
        httpStatus: openRouter.response.status,
        statusText: openRouter.response.statusText,
        error: errorMessage,
      });
      return {
        ...baseSource,
        status: "ocr_failed",
        reusedExisting: false,
        httpStatus: openRouter.response.status,
        requestedServiceTier: input.serviceTier,
        servedServiceTier:
          typeof (openRouter.body as { service_tier?: unknown }).service_tier === "string"
            ? (openRouter.body as { service_tier: string }).service_tier
            : null,
        responseArtifactKey: artifactKey(responsePath, input.runRoot),
        textArtifactKey: null,
        parsedJsonArtifactKey: null,
        annotationsArtifactKey:
          annotations.length > 0 ? artifactKey(annotationsPath, input.runRoot) : null,
        usage: (openRouter.body as { usage?: unknown }).usage ?? null,
        error: errorMessage,
      };
    }
    const outputText = JSON.stringify(toolArgs, null, 2);
    const textPath = join(sourceRoot, "triage-output.txt");
    await Bun.write(textPath, `${outputText.trim()}\n`);
    const parsedJson = toolArgs;
    const parsedJsonPath = join(sourceRoot, "triage-output.json");
    if (parsedJson !== null) {
      await writeJson(parsedJsonPath, parsedJson);
    }
    const responseUsage = (openRouter.body as { usage?: unknown }).usage ?? null;

    return {
      ...baseSource,
      status: "ocr_complete",
      reusedExisting: false,
      httpStatus: openRouter.response.status,
      requestedServiceTier: input.serviceTier,
      servedServiceTier:
        typeof (openRouter.body as { service_tier?: unknown }).service_tier === "string"
          ? (openRouter.body as { service_tier: string }).service_tier
          : null,
      responseArtifactKey: artifactKey(responsePath, input.runRoot),
      textArtifactKey: artifactKey(textPath, input.runRoot),
      parsedJsonArtifactKey:
        parsedJson === null ? null : artifactKey(parsedJsonPath, input.runRoot),
      annotationsArtifactKey:
        annotations.length > 0 ? artifactKey(annotationsPath, input.runRoot) : null,
      usage: responseUsage,
      error: null,
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
      pdfPageCount: null,
      selectedPageCount: 0,
      selectedPages: [],
      inputPdfArtifactKey: null,
      inputByteLength: 0,
      inputSha256: null,
      status: "ocr_failed",
      reusedExisting: false,
      httpStatus: null,
      requestedServiceTier: input.serviceTier,
      servedServiceTier: null,
      responseArtifactKey: null,
      textArtifactKey: null,
      parsedJsonArtifactKey: null,
      annotationsArtifactKey: null,
      usage: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function triageTier2Ocr(args: TriageTier2OcrArgs): Promise<Tier2OcrTriageManifest> {
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const runRoot = dirname(plan.captureManifestPath);
  const model = args.model ?? process.env["OPENROUTER_OCR_MODEL"] ?? DEFAULT_OCR_MODEL;
  const pageLimit = args.pageLimit ?? 10;
  if (!Number.isInteger(pageLimit) || pageLimit < 1) {
    throw new Error("--page-limit must be a positive integer.");
  }
  const limit = args.limit ?? 1;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  const filteredSources = plan.sources
    .map((source, sourceIndex) => ({ source, sourceIndex }))
    .filter(({ source }) => args.sourceId === undefined || source.sourceId === args.sourceId);
  const selectedSources = filteredSources.slice(0, limit);
  const execute = args.execute ?? false;
  const fetcher = args.fetcher ?? defaultFetch;
  const serviceTier = args.serviceTier ?? "flex";
  const maxTokens = args.maxTokens ?? DEFAULT_OCR_MAX_TOKENS;
  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new Error("--max-tokens must be a positive integer.");
  }
  const triageRootName = normalizeOcrTriageRootName(args.triageRootName);
  const sources: Tier2OcrTriageSource[] = [];

  for (const selectedSource of selectedSources) {
    if (selectedSource === undefined) {
      continue;
    }
    const { source, sourceIndex } = selectedSource;
    sources.push(
      await triageOcrSource({
        source,
        sourceIndex,
        runRoot,
        triageRootName,
        pageLimit,
        model,
        pdfEngine: args.pdfEngine ?? "mistral-ocr",
        serviceTier,
        maxTokens,
        execute,
        fetcher,
        apiKey: args.apiKey ?? process.env["OPENROUTER_API_KEY"],
      }),
    );
  }

  const manifest: Tier2OcrTriageManifest = {
    version: 1,
    runId: plan.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    ocrPlanPath: args.ocrPlanPath,
    captureManifestPath: plan.captureManifestPath,
    outputPath: args.outputPath ?? null,
    runtime: "pi-mono",
    provider: "openrouter",
    model,
    api: "chat.completions",
    pdfEngine: args.pdfEngine ?? "mistral-ocr",
    serviceTier,
    maxTokens,
    triageRootName,
    execute,
    pageLimit,
    summary: {
      plannedSourceCount: plan.sources.length,
      selectedSourceCount: selectedSources.length,
      preparedCount: sources.filter((source) => source.status === "prepared").length,
      ocrCompleteCount: sources.filter((source) => source.status === "ocr_complete").length,
      ocrFailedCount: sources.filter((source) => source.status === "ocr_failed").length,
      reusedExistingCount: sources.filter((source) => source.reusedExisting).length,
      totalInputBytes: sources.reduce((sum, source) => sum + source.inputByteLength, 0),
    },
    sources,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, manifest);
  }

  return manifest;
}

function servedServiceTier(body: unknown): string | null {
  return typeof (body as { service_tier?: unknown }).service_tier === "string"
    ? (body as { service_tier: string }).service_tier
    : null;
}

function pageMarkdownOutputPaths(pageRoot: string): {
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
      throw new Error(`OpenRouter response did not include required ${OCR_PAGE_MARKDOWN_TOOL_NAME} tool call.`);
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
    const pages = await mapWithConcurrency(
      prepared.pages,
      input.pageConcurrency,
      async (page) =>
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

function emptyPageAuditIssueCounts(): Record<Tier2OcrPageMarkdownAuditIssueCode, number> {
  return Object.fromEntries(OCR_PAGE_AUDIT_ISSUE_CODES.map((code) => [code, 0])) as Record<
    Tier2OcrPageMarkdownAuditIssueCode,
    number
  >;
}

function addPageAuditIssue(
  counts: Record<Tier2OcrPageMarkdownAuditIssueCode, number>,
  code: Tier2OcrPageMarkdownAuditIssueCode,
): void {
  counts[code] += 1;
}

function markdownBody(markdown: string): string {
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
  const [
    markdownExists,
    toolCallExists,
    responseExists,
    errorExists,
  ] = await Promise.all([
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
    status: errorExists ? "ocr_failed" : markdownExists && toolCallExists ? "ocr_complete" : "missing",
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
      visualReviewHints.length > 0 || containsTables === true || containsMaps === true || containsCharts === true,
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
    const pdfPageCount = await pdfInfoPageCount(rawPath);
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
  return {
    type: "function",
    function: {
      name: OCR_MARKDOWN_CANDIDATE_TOOL_NAME,
      description:
        "Record source-grounded document evidence candidates from OCR Markdown pages.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "pageNumbers", "evidenceCandidateDrafts", "reviewNotes"],
        properties: {
          sourceId: { type: "string" },
          pageNumbers: { type: "array", items: { type: "integer", minimum: 1 } },
          reviewNotes: { type: "string" },
          evidenceCandidateDrafts: {
            type: "array",
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "candidateType",
                "factClassification",
                "negativeEvidenceFlag",
                "routeMentions",
                "corridorMentions",
                "evidencePageRefs",
                "evidenceQuote",
                "summary",
                "fields",
              ],
              properties: {
                candidateType: {
                  type: "string",
                  enum: DocumentEvidenceCandidateTypeSchema.options,
                },
                factClassification: {
                  type: "string",
                  enum: DocumentFactClassificationSchema.options,
                },
                negativeEvidenceFlag: {
                  type: "string",
                  enum: DocumentNegativeEvidenceFlagSchema.options,
                },
                routeMentions: { type: "array", items: { type: "string" } },
                corridorMentions: { type: "array", items: { type: "string" } },
                evidencePageRefs: { type: "array", items: { type: "integer", minimum: 1 } },
                evidenceQuote: { type: "string" },
                summary: { type: "string" },
                fields: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
    },
  };
}

function buildOcrMarkdownCandidatePrompt(input: {
  source: Tier2OcrPlanSource;
  pages: Tier2OcrPageMarkdownAuditPage[];
  markdownText: string;
}): string {
  return [
    "You are extracting source-grounded evidence candidates for Bus Priority Impact Studio.",
    "Use only the provided OCR Markdown pages. Do not infer from outside knowledge.",
    `You must call the ${OCR_MARKDOWN_CANDIDATE_TOOL_NAME} tool.`,
    "Emit candidates only for useful, source-backed facts. Prefer the candidate types requested by the research roadmap:",
    "- document_claim_candidate: a single source-backed non-metric claim.",
    "- document_metric_claim_candidate: a metric value, unit, baseline/comparison window, scope, and methodology/caveat when present.",
    "- document_table_candidate: an extracted table caption, headers, and rows when the Markdown preserves enough structure.",
    "- document_figure_candidate: a chart/map/photo/diagram with caption and extractable data notes.",
    "- document_map_extent_candidate: corridor limits, map bounds, intersections, or treatment extents visible in OCR text.",
    "- document_methodology_candidate: dataset definitions, aggregation units, comparison basis, or caveats about how a metric is computed.",
    "- document_caveat_candidate: a limitation, confound, data gap, or source-use warning.",
    "- document_project_status_candidate: proposed, planning, implementing, monitoring, complete, canceled, superseded, or phase status.",
    "- document_treatment_component_candidate: bus lane, busway, TSP, queue jump, stop consolidation, ACE, red paint, bus bulb, or related treatment.",
    "- document_service_change_candidate: route added/discontinued/modified, stop added/removed, frequency/headway/terminus changes.",
    "- document_stop_or_intersection_candidate: stop/intersection-specific treatments, metrics, or named locations.",
    "- document_supersession_candidate: one source, plan, addendum, pilot, or status update replacing/amending/canceling another.",
    "- document_source_gap_candidate: explicit absence or negative evidence, such as no stop table, no TSP inventory, or proposed-only status.",
    "- document_evidence_link_candidate: a link between a claim and its underlying dataset or table.",
    "- review_question_candidate: a concrete open question that needs a follow-up source or human review.",
    "Do not create generic candidates for decorative pages, table-of-contents rows, or unsourced summaries.",
    "For every candidate, evidenceQuote must be a short verbatim excerpt from the provided OCR Markdown and evidencePageRefs must name the supporting page(s).",
    "Put type-specific values in fields, for example claimSubject, metricName, valueNumeric, valueQualifier, unit, baselinePeriodStart, baselinePeriodEnd, comparisonPeriodStart, comparisonPeriodEnd, geographyScope, methodology, tableCaption, headers, rows, figureCaption, figureType, extentIntersections, status, statusAsOfDate, phase, treatmentType, implementationStatus, changeType, effectiveDate, stopIdIfKnown, intersectionName, supersedes, supersededBy, supersessionType, sourceGapSubject, linkedDatasetId, reviewQuestion, proposedAnswer, and requiredSource.",
    "Use negativeEvidenceFlag when a candidate is proposed-only, outreach-only, map OCR is unreadable, no stop table exists, a claim lacks row data, a presentation date is not an implementation date, or the source is superseded.",
    "",
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

function ocrMarkdownCandidateWindowPaths(input: {
  sourceRoot: string;
  pages: number[];
}): {
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

async function callOpenRouterMarkdownCandidates(input: {
  apiKey: string;
  model: string;
  serviceTier: "flex" | "priority";
  maxTokens: number;
  source: Tier2OcrPlanSource;
  pages: Tier2OcrPageMarkdownAuditPage[];
  markdownText: string;
  fetcher: FetchLike;
}): Promise<OpenRouterCallResult> {
  const reasoning = requiredToolCallReasoningOverride(input.model);
  return postOpenRouterChatCompletions({
    apiKey: input.apiKey,
    title: "Bus Priority Impact Studio OCR Markdown Candidate Extraction",
    fetcher: input.fetcher,
    body: {
      model: input.model,
      service_tier: input.serviceTier,
      max_tokens: input.maxTokens,
      messages: [
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
      ...(reasoning === null ? {} : { reasoning }),
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
    fields: {
      ...input.draft.fields,
      pageMarkdownRootName: input.pageMarkdownRootName,
      extractionRootName: input.candidateRootName,
      extractionWindowPages: input.windowPages,
    },
    validationState: "unvalidated",
    reviewReason:
      "OCR Markdown evidence candidate requires deterministic source-span, table/metric/methodology, route/corridor, and fact-classification validation before public use.",
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
  pages: number[];
}): Promise<{
  window: Tier2OcrMarkdownCandidateWindow;
  candidates: Tier2DocumentEvidenceCandidate[];
} | null> {
  if (!(await Bun.file(input.paths.toolCallPath).exists())) return null;
  const toolCall = await Bun.file(input.paths.toolCallPath).json();
  const drafts = markdownCandidateRecordCandidates(toolCall);
  return {
    window: {
      sourceId: input.sourceRef.sourceId,
      pages: input.pages,
      status: "extracted",
      reusedExisting: true,
      responseArtifactKey: (await Bun.file(input.paths.responsePath).exists())
        ? artifactKey(input.paths.responsePath, input.runRoot)
        : null,
      toolCallArtifactKey: artifactKey(input.paths.toolCallPath, input.runRoot),
      candidateCount: drafts.length,
      usage: null,
      error: null,
    },
    candidates: drafts.map((draft, index) =>
      evidenceCandidateFromMarkdownDraft({
        draft,
        sourceRef: input.sourceRef,
        pageMarkdownRootName: input.pageMarkdownRootName,
        candidateRootName: input.candidateRootName,
        windowPages: input.pages,
        index,
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
  const paths = ocrMarkdownCandidateWindowPaths({ sourceRoot: input.sourceRoot, pages: pageNumbers });
  await mkdir(paths.windowRoot, { recursive: true });
  const existing = await readExistingMarkdownCandidateWindow({
    paths,
    runRoot: input.runRoot,
    sourceRef: input.sourceRef,
    pageMarkdownRootName: input.pageMarkdownRootName,
    candidateRootName: input.candidateRootName,
    pages: pageNumbers,
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
    throw new Error("OPENROUTER_API_KEY is required for docs:ocr-markdown-candidates --execute.");
  }
  const markdownText = await pageWindowMarkdown({ runRoot: input.runRoot, pages: input.pages });
  const openRouter = await callOpenRouterMarkdownCandidates({
    apiKey: input.apiKey,
    model: input.model,
    serviceTier: input.serviceTier,
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
    const errorMessage = `OpenRouter response did not include required ${OCR_MARKDOWN_CANDIDATE_TOOL_NAME} tool call.`;
    await writeJson(paths.errorPath, { sourceId: input.source.sourceId, pages: pageNumbers, error: errorMessage });
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
  const candidates = drafts.map((draft, index) =>
    evidenceCandidateFromMarkdownDraft({
      draft,
      sourceRef: input.sourceRef,
      pageMarkdownRootName: input.pageMarkdownRootName,
      candidateRootName: input.candidateRootName,
      windowPages: pageNumbers,
      index,
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

export async function extractTier2OcrMarkdownCandidates(
  args: ExtractTier2OcrMarkdownCandidatesArgs,
): Promise<Tier2OcrMarkdownCandidateExtraction> {
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const audit = (await Bun.file(args.pageMarkdownAuditPath).json()) as Tier2OcrPageMarkdownAudit;
  const captureManifest = (await Bun.file(plan.captureManifestPath).json()) as Tier2CaptureManifest;
  const capturedById = new Map(captureManifest.sources.map((source) => [source.sourceId, source]));
  const auditById = new Map(audit.sources.map((source) => [source.sourceId, source]));
  const runRoot = dirname(plan.captureManifestPath);
  const model = args.model ?? process.env["OPENROUTER_OCR_MODEL"] ?? DEFAULT_OCR_MODEL;
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
  const apiKey = args.apiKey ?? process.env["OPENROUTER_API_KEY"];
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

async function resolveOcrPaths(args: OcrCliArgs): Promise<{
  ocrPlanPath: string;
  outputPath: string;
}> {
  if (args.ocrPlanPath !== undefined) {
    return {
      ocrPlanPath: args.ocrPlanPath,
      outputPath:
        args.outputPath ??
        join(
          dirname(args.ocrPlanPath),
          args.pageMarkdown ? "ocr-page-markdown-manifest.json" : "ocr-triage-manifest.json",
        ),
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
      args.outputPath ??
      (args.pageMarkdown
        ? join(runArtifactRoot(artifactRoot, runId), "ocr-page-markdown-manifest.json")
        : ocrTriageManifestPath(artifactRoot, runId)),
  };
}

export async function triageTier2OcrFromCli(
  args: string[],
): Promise<Tier2OcrTriageManifest | Tier2OcrPageMarkdownManifest> {
  const parsed = parseOcrCliArgs(args);
  const paths = await resolveOcrPaths(parsed);
  if (parsed.pageMarkdown === true) {
    return ocrTier2PageMarkdown({
      ...paths,
      ...(parsed.model !== undefined ? { model: parsed.model } : {}),
      ...(parsed.pdfEngine !== undefined ? { pdfEngine: parsed.pdfEngine } : {}),
      ...(parsed.serviceTier !== undefined ? { serviceTier: parsed.serviceTier } : {}),
      ...(parsed.maxTokens !== undefined ? { maxTokens: parsed.maxTokens } : {}),
      ...(parsed.triageRootName !== undefined
        ? { pageMarkdownRootName: parsed.triageRootName }
        : {}),
      ...(parsed.pageInputPreference !== undefined
        ? { pageInputPreference: parsed.pageInputPreference }
        : {}),
      ...(parsed.allPages !== undefined ? { allPages: parsed.allPages } : {}),
      ...(parsed.pageRangeOverride !== undefined
        ? { pageRangeOverride: parsed.pageRangeOverride }
        : {}),
      ...(parsed.pageConcurrency !== undefined
        ? { pageConcurrency: parsed.pageConcurrency }
        : {}),
      ...(parsed.pageLimit !== undefined ? { pageLimit: parsed.pageLimit } : {}),
      ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
      ...(parsed.sourceId !== undefined ? { sourceId: parsed.sourceId } : {}),
      execute: parsed.execute ?? false,
    });
  }
  return triageTier2Ocr({
    ...paths,
    ...(parsed.model !== undefined ? { model: parsed.model } : {}),
    ...(parsed.pdfEngine !== undefined ? { pdfEngine: parsed.pdfEngine } : {}),
    ...(parsed.serviceTier !== undefined ? { serviceTier: parsed.serviceTier } : {}),
    ...(parsed.maxTokens !== undefined ? { maxTokens: parsed.maxTokens } : {}),
    ...(parsed.triageRootName !== undefined ? { triageRootName: parsed.triageRootName } : {}),
    ...(parsed.pageLimit !== undefined ? { pageLimit: parsed.pageLimit } : {}),
    ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    ...(parsed.sourceId !== undefined ? { sourceId: parsed.sourceId } : {}),
    execute: parsed.execute ?? false,
  });
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
      outputPath: args.outputPath ?? join(dirname(args.ocrPlanPath), "ocr-page-markdown-audit.json"),
    };
  }
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }
  return {
    ocrPlanPath: ocrPlanPath(artifactRoot, runId),
    outputPath: args.outputPath ?? join(runArtifactRoot(artifactRoot, runId), "ocr-page-markdown-audit.json"),
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

function parseSourceIds(value: string | undefined): string[] | undefined {
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
  const runId = args.runId ?? (args.ocrPlanPath === undefined ? await latestDocsRunId(artifactRoot) : null);
  const baseDir =
    args.ocrPlanPath !== undefined
      ? dirname(args.ocrPlanPath)
      : runId === null
        ? null
        : runArtifactRoot(artifactRoot, runId);
  if (baseDir === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }
  return {
    ocrPlanPath: args.ocrPlanPath ?? ocrPlanPath(artifactRoot, runId!),
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

async function reviewOcrSource(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  triageRootName?: string;
}): Promise<Tier2OcrQualityReviewSource> {
  const sourceRoot = ocrTriageSourceRoot(input);
  const triagePath = join(sourceRoot, "triage-output.json");
  const annotationPath = join(sourceRoot, "openrouter-file-annotations.json");
  const errorPath = join(sourceRoot, "error.json");
  const inputPdfPath = join(sourceRoot, "input-pages.pdf");
  const responsePath = join(sourceRoot, "openrouter-response.json");

  const [
    triageArtifact,
    annotationArtifact,
    responseArtifact,
    errorExists,
    inputPdfExists,
    responseExists,
  ] = await Promise.all([
    readJsonArtifact(triagePath),
    readJsonArtifact(annotationPath),
    readJsonArtifact(responsePath),
    Bun.file(errorPath).exists(),
    Bun.file(inputPdfPath).exists(),
    Bun.file(responsePath).exists(),
  ]);
  const responseHasOpenRouterError =
    responseArtifact.parsed !== null &&
    typeof responseArtifact.parsed === "object" &&
    !Array.isArray(responseArtifact.parsed) &&
    "error" in responseArtifact.parsed;
  const triage =
    triageArtifact.parsed !== null &&
    typeof triageArtifact.parsed === "object" &&
    !Array.isArray(triageArtifact.parsed)
      ? (triageArtifact.parsed as OcrTriageRecord)
      : null;

  let status: Tier2OcrQualityReviewSource["status"] = "not_started";
  if (triage !== null) {
    status = "ocr_complete";
  } else if (errorExists || responseHasOpenRouterError) {
    status = "ocr_failed";
  } else if (responseExists) {
    status = "ocr_complete";
  } else if (inputPdfExists) {
    status = "prepared";
  }

  const stats = annotationStats(annotationArtifact.parsed);
  const pagesReviewed = triage === null ? [] : numberArray(triage.pagesReviewed);
  const usefulPages = triage === null ? [] : numberArray(triage.usefulPages);
  const textCharsPerReviewedPage =
    pagesReviewed.length > 0
      ? Math.round((stats.textCharCount / pagesReviewed.length) * 10) / 10
      : null;
  const ocrQuality = triage === null ? "unknown" : triageOcrQuality(triage.ocrQuality);
  const decision = triage === null ? "unknown" : triageDecision(triage.decision);
  const interventionFamilyCount =
    triage === null ? 0 : stringArrayLength(triage.interventionFamilies);
  const routeCount = triage === null ? 0 : stringArrayLength(triage.routesMentioned);
  const corridorCount = triage === null ? 0 : stringArrayLength(triage.corridorsMentioned);
  const dateCount = triage === null ? 0 : stringArrayLength(triage.dateMentions);
  const issueCodes = issueListForOcrReviewSource({
    status,
    source: input.source,
    triage,
    triageExists: triageArtifact.exists,
    triageParseError: triageArtifact.parseError,
    annotationsExist: annotationArtifact.exists,
    annotationTextCharCount: stats.textCharCount,
    textCharsPerReviewedPage,
    ocrQuality,
    decision,
    interventionFamilyCount,
    routeCount,
    corridorCount,
    dateCount,
    usefulPageCount: usefulPages.length,
  });

  return {
    sourceId: input.source.sourceId,
    title: input.source.title,
    publisher: input.source.publisher,
    sourceGroup: input.source.sourceGroup,
    sourceUrl: input.source.sourceUrl,
    status,
    ocrQuality,
    decision,
    pagesReviewed,
    usefulPages,
    interventionFamilyCount,
    routeCount,
    corridorCount,
    dateCount,
    annotationTextBlockCount: stats.textBlockCount,
    annotationTextCharCount: stats.textCharCount,
    annotationImageCount: stats.imageCount,
    textCharsPerReviewedPage,
    issueCodes,
    reviewNotes: triage === null ? null : triageString(triage.reviewNotes),
  };
}

export async function reviewTier2OcrQuality(
  args: ReviewTier2OcrArgs,
): Promise<Tier2OcrQualityReview> {
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const runRoot = dirname(plan.captureManifestPath);
  const triageRootName = normalizeOcrTriageRootName(args.triageRootName);
  const sources: Tier2OcrQualityReviewSource[] = [];

  for (let sourceIndex = 0; sourceIndex < plan.sources.length; sourceIndex += 1) {
    const source = plan.sources[sourceIndex];
    if (source === undefined) {
      continue;
    }
    sources.push(await reviewOcrSource({ runRoot, source, sourceIndex, triageRootName }));
  }

  const issueCounts = emptyOcrQualityIssueCounts();
  let reviewedPageCount = 0;
  for (const source of sources) {
    reviewedPageCount += source.pagesReviewed.length;
    for (const issueCode of source.issueCodes) {
      issueCounts[issueCode] += 1;
    }
  }
  const totalAnnotationTextChars = sources.reduce(
    (sum, source) => sum + source.annotationTextCharCount,
    0,
  );

  const review: Tier2OcrQualityReview = {
    version: 1,
    runId: plan.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    ocrPlanPath: args.ocrPlanPath,
    outputPath: args.outputPath ?? null,
    triageRootName,
    summary: {
      plannedSourceCount: plan.sources.length,
      reviewedSourceCount: sources.filter(
        (source) => source.status === "ocr_complete" && source.decision !== "unknown",
      ).length,
      notStartedCount: sources.filter(
        (source) => source.status === "not_started" || source.status === "prepared",
      ).length,
      ocrCompleteCount: sources.filter((source) => source.status === "ocr_complete").length,
      ocrFailedCount: sources.filter((source) => source.status === "ocr_failed").length,
      goodCount: sources.filter((source) => source.ocrQuality === "good").length,
      partialCount: sources.filter((source) => source.ocrQuality === "partial").length,
      poorCount: sources.filter((source) => source.ocrQuality === "poor").length,
      unknownQualityCount: sources.filter((source) => source.ocrQuality === "unknown").length,
      extractCount: sources.filter((source) => source.decision === "extract").length,
      skipCount: sources.filter((source) => source.decision === "skip").length,
      needsReviewCount: sources.filter((source) => source.decision === "needs_review").length,
      unknownDecisionCount: sources.filter((source) => source.decision === "unknown").length,
      annotationTextSourceCount: sources.filter((source) => source.annotationTextCharCount > 0)
        .length,
      missingAnnotationTextCount: sources.filter((source) =>
        source.issueCodes.includes("missing_ocr_text"),
      ).length,
      totalAnnotationTextChars,
      averageTextCharsPerReviewedPage:
        reviewedPageCount > 0
          ? Math.round((totalAnnotationTextChars / reviewedPageCount) * 10) / 10
          : null,
      issueCounts,
    },
    sources,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, review);
  }

  return review;
}

function validationSummaryForBundle(bundle: {
  documentSourceCandidates: Tier2DocumentSourceCandidate[];
  documentEntityLinkCandidates: Tier2DocumentEntityLinkCandidate[];
  documentInterventionSeeds: Tier2DocumentInterventionSeed[];
  documentEvidenceCandidates?: Tier2DocumentEvidenceCandidate[];
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
    ...bundle.documentEntityLinkCandidates,
    ...bundle.documentInterventionSeeds,
    ...(bundle.documentEvidenceCandidates ?? []),
    ...bundle.reviewQuestionCandidates,
    ...bundle.followupOcrCandidates,
  ]) {
    summary[candidate.validationState] += 1;
  }
  return summary;
}

function sourceRefForCandidate(input: {
  capturedSource: Tier2CapturedSource | null;
  planSource: Tier2OcrPlanSource;
  triageSource: Tier2OcrTriageSource | null;
  reviewSource: Tier2OcrQualityReviewSource;
}): Tier2CandidateSourceRef {
  return {
    sourceId: input.planSource.sourceId,
    sourceUrl: input.planSource.sourceUrl,
    title: input.planSource.title,
    publisher: input.planSource.publisher,
    documentDate: input.capturedSource?.documentDate ?? null,
    sourceGroup: input.planSource.sourceGroup,
    artifactKeys: {
      raw: input.planSource.rawArtifactKey,
      text: input.capturedSource?.textArtifactKey ?? null,
      ocrText: input.triageSource?.textArtifactKey ?? null,
      ocrJson: input.triageSource?.parsedJsonArtifactKey ?? null,
      ocrAnnotations: input.triageSource?.annotationsArtifactKey ?? null,
    },
    pages:
      input.reviewSource.usefulPages.length > 0
        ? input.reviewSource.usefulPages
        : input.reviewSource.pagesReviewed,
  };
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

function entityLinkCandidatesForTriage(input: {
  sourceRef: Tier2CandidateSourceRef;
  triage: OcrTriageRecord;
}): Tier2DocumentEntityLinkCandidate[] {
  const candidates: Tier2DocumentEntityLinkCandidate[] = [];
  const add = (
    entityKind: Tier2DocumentEntityLinkCandidate["entityKind"],
    mentions: string[],
  ): void => {
    for (const mention of [...new Set(mentions)]) {
      candidates.push({
        candidateType: "document_entity_link_candidate",
        candidateId: `entity_link:${input.sourceRef.sourceId}:${entityKind}:${slugify(mention)}`,
        sourceRef: input.sourceRef,
        entityKind,
        mentionText: mention,
        linkerMethod: "ocr_triage_json",
        validationState: "unvalidated",
        reviewReason:
          "OCR triage mention requires deterministic route/corridor/date/intervention validation.",
      });
    }
  };

  add("route", stringArray(input.triage.routesMentioned));
  add("corridor", stringArray(input.triage.corridorsMentioned));
  add("date", stringArray(input.triage.dateMentions));
  add("intervention_family", stringArray(input.triage.interventionFamilies));
  return candidates;
}

function interventionSeedsForTriage(input: {
  sourceRef: Tier2CandidateSourceRef;
  triage: OcrTriageRecord;
}): Tier2DocumentInterventionSeed[] {
  if (triageDecision(input.triage.decision) !== "extract") {
    return [];
  }

  const routeMentions = [...new Set(stringArray(input.triage.routesMentioned))];
  const corridorMentions = [...new Set(stringArray(input.triage.corridorsMentioned))];
  const dateMentions = [...new Set(stringArray(input.triage.dateMentions))];
  const toolDrafts = ocrCandidateDrafts(input.triage.candidateDrafts);
  if (toolDrafts.length > 0) {
    return toolDrafts.map((draft, index) => {
      const draftRouteMentions =
        draft.routeMentions.length > 0 ? draft.routeMentions : routeMentions;
      const draftCorridorMentions =
        draft.corridorMentions.length > 0 ? draft.corridorMentions : corridorMentions;
      const draftDateMentions =
        draft.dateMention === null ? dateMentions : [...new Set([draft.dateMention])];
      const reviewEvidence = [draft.rationale, draft.evidenceQuote]
        .filter((item): item is string => item !== null)
        .join(" ");
      return {
        candidateType: "document_intervention_seed",
        candidateId: `intervention_seed:${input.sourceRef.sourceId}:tool:${slugify(
          draft.interventionType,
        )}:${shortHash(
          [
            ...draftRouteMentions,
            ...draftCorridorMentions,
            ...draftDateMentions,
            ...draft.evidencePageRefs.map(String),
            draft.eventStatus,
            draft.datePrecision,
            reviewEvidence,
            String(index),
          ].join("|"),
        )}`,
        sourceRef: input.sourceRef,
        interventionFamily: draft.interventionType,
        routeMentions: draftRouteMentions,
        corridorMentions: draftCorridorMentions,
        dateMentions: draftDateMentions,
        status: "candidate_from_ocr_triage",
        validationState: "unvalidated",
        reviewReason: [
          "OCR tool-call candidate requires deterministic route/corridor/date/intervention validation.",
          reviewEvidence.length > 0 ? reviewEvidence : null,
        ]
          .filter((item): item is string => item !== null)
          .join(" "),
      };
    });
  }

  return [...new Set(stringArray(input.triage.interventionFamilies))].map((family) => ({
    candidateType: "document_intervention_seed",
    candidateId: `intervention_seed:${input.sourceRef.sourceId}:${slugify(family)}:${shortHash(
      [...routeMentions, ...corridorMentions, ...dateMentions].join("|"),
    )}`,
    sourceRef: input.sourceRef,
    interventionFamily: family,
    routeMentions,
    corridorMentions,
    dateMentions,
    status: "candidate_from_ocr_triage",
    validationState: "unvalidated",
    reviewReason:
      "OCR triage says extract, but this seed still needs source-span, route, corridor, date, and intervention-type validation.",
  }));
}

// @ts-expect-error retained for PR3 cleanup; no longer called after PR1 wired Phase 2 candidates.
function evidenceCandidatesForTriage(input: {
  sourceRef: Tier2CandidateSourceRef;
  triage: OcrTriageRecord;
}): Tier2DocumentEvidenceCandidate[] {
  if (triageDecision(input.triage.decision) !== "extract") {
    return [];
  }
  return ocrEvidenceCandidateDrafts(input.triage.evidenceCandidateDrafts).map((draft, index) => ({
    candidateType: draft.candidateType,
    candidateId: `document_evidence:${input.sourceRef.sourceId}:${draft.candidateType}:${shortHash(
      [
        draft.factClassification,
        draft.negativeEvidenceFlag,
        ...draft.routeMentions,
        ...draft.corridorMentions,
        ...draft.evidencePageRefs.map(String),
        draft.evidenceQuote,
        draft.summary,
        JSON.stringify(draft.fields),
        String(index),
      ].join("|"),
    )}`,
    sourceRef: input.sourceRef,
    factClassification: draft.factClassification,
    negativeEvidenceFlag: draft.negativeEvidenceFlag,
    routeMentions: [...draft.routeMentions],
    corridorMentions: [...draft.corridorMentions],
    evidencePageRefs: [...draft.evidencePageRefs],
    evidenceQuote: draft.evidenceQuote,
    summary: draft.summary,
    fields: { ...draft.fields },
    validationState: "unvalidated",
    reviewReason:
      "OCR tool-call evidence candidate requires deterministic source-span, metric/table/methodology, route/corridor, and fact-classification validation.",
  }));
}

function reviewQuestionsForSource(input: {
  sourceRef: Tier2CandidateSourceRef;
  reviewSource: Tier2OcrQualityReviewSource;
}): Tier2ReviewQuestionCandidate[] {
  const actionableIssues = input.reviewSource.issueCodes.filter(
    (issue) => issue !== "low_ocr_text_density",
  );
  if (input.reviewSource.decision === "extract" && actionableIssues.length === 0) {
    return [];
  }
  if (input.reviewSource.decision === "skip" && actionableIssues.length === 0) {
    return [];
  }

  const priority: Tier2ReviewQuestionCandidate["priority"] =
    actionableIssues.includes("partial_or_poor_ocr") ||
    actionableIssues.includes("extract_no_date") ||
    actionableIssues.includes("extract_no_route")
      ? "high"
      : actionableIssues.length > 0
        ? "medium"
        : "low";
  return [
    {
      candidateType: "review_question_candidate",
      candidateId: `review_question:${input.sourceRef.sourceId}:${shortHash(
        actionableIssues.join("|") || input.reviewSource.decision,
      )}`,
      sourceRef: input.sourceRef,
      priority,
      question: `Review ${input.sourceRef.sourceId} before promotion: ${[
        ...actionableIssues,
        input.reviewSource.reviewNotes ?? "",
      ]
        .filter((item) => item.length > 0)
        .join("; ")}`,
      issueCodes: actionableIssues,
      validationState: "needs_review",
    },
  ];
}

function followupOcrCandidateForSource(input: {
  sourceRef: Tier2CandidateSourceRef;
  reviewSource: Tier2OcrQualityReviewSource;
}): Tier2FollowupOcrCandidate | null {
  const note = input.reviewSource.reviewNotes?.toLowerCase() ?? "";
  const issueSet = new Set(input.reviewSource.issueCodes);
  const laterPageHint =
    /after page 10|later page|outside (?:this )?slice|proposal appears|begin after page 10|timeline/.test(
      note,
    );
  const needsFollowup =
    laterPageHint ||
    issueSet.has("partial_or_poor_ocr") ||
    issueSet.has("manual_visual_review_hint") ||
    input.reviewSource.decision === "needs_review";
  if (!needsFollowup) {
    return null;
  }

  const lastReviewedPage = Math.max(0, ...input.reviewSource.pagesReviewed);
  const suggestedPageRange =
    laterPageHint && lastReviewedPage > 0
      ? `${lastReviewedPage + 1}-${lastReviewedPage + 10}`
      : input.reviewSource.pagesReviewed.join(",") || "1-10";
  const priority: Tier2FollowupOcrCandidate["priority"] =
    input.reviewSource.decision === "extract" && laterPageHint ? "high" : "medium";

  return {
    candidateType: "followup_ocr_candidate",
    candidateId: `followup_ocr:${input.sourceRef.sourceId}:${slugify(suggestedPageRange)}`,
    sourceRef: input.sourceRef,
    suggestedPageRange,
    reason: input.reviewSource.reviewNotes ?? input.reviewSource.issueCodes.join("; "),
    priority,
    validationState: "needs_review",
  };
}

export async function extractTier2Candidates(
  args: ExtractTier2CandidatesArgs,
): Promise<Tier2CandidateBundle> {
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const review = (await Bun.file(args.ocrQualityReviewPath).json()) as Tier2OcrQualityReview;
  const markdownCandidateExtraction = (await Bun.file(
    args.ocrMarkdownCandidateExtractionPath,
  ).json()) as Tier2OcrMarkdownCandidateExtraction;
  const evidenceCandidatesBySourceId = new Map<string, Tier2DocumentEvidenceCandidate[]>();
  for (const candidate of markdownCandidateExtraction.documentEvidenceCandidates) {
    const list = evidenceCandidatesBySourceId.get(candidate.sourceRef.sourceId);
    if (list === undefined) {
      evidenceCandidatesBySourceId.set(candidate.sourceRef.sourceId, [candidate]);
    } else {
      list.push(candidate);
    }
  }
  const captureManifest = (await Bun.file(plan.captureManifestPath).json()) as Tier2CaptureManifest;
  const runRoot = dirname(plan.captureManifestPath);
  const triageRootName = normalizeOcrTriageRootName(args.triageRootName ?? review.triageRootName);
  const triageManifestArtifact = await readJsonArtifact(join(runRoot, "ocr-triage-manifest.json"));
  const triageManifest =
    triageManifestArtifact.parsed !== null &&
    typeof triageManifestArtifact.parsed === "object" &&
    !Array.isArray(triageManifestArtifact.parsed) &&
    (triageManifestArtifact.parsed as { triageRootName?: unknown }).triageRootName ===
      triageRootName
      ? (triageManifestArtifact.parsed as Tier2OcrTriageManifest)
      : null;
  const capturedById = new Map(captureManifest.sources.map((source) => [source.sourceId, source]));
  const reviewById = new Map(review.sources.map((source) => [source.sourceId, source]));

  const documentSourceCandidates = captureManifest.sources.map(documentSourceCandidate);
  const documentEntityLinkCandidates: Tier2DocumentEntityLinkCandidate[] = [];
  const documentInterventionSeeds: Tier2DocumentInterventionSeed[] = [];
  const documentEvidenceCandidates: Tier2DocumentEvidenceCandidate[] = [];
  const reviewQuestionCandidates: Tier2ReviewQuestionCandidate[] = [];
  const followupOcrCandidates: Tier2FollowupOcrCandidate[] = [];

  for (let sourceIndex = 0; sourceIndex < plan.sources.length; sourceIndex += 1) {
    const planSource = plan.sources[sourceIndex];
    if (planSource === undefined) {
      continue;
    }
    const reviewSource = reviewById.get(planSource.sourceId);
    if (reviewSource === undefined) {
      continue;
    }
    const sourceRoot = ocrTriageSourceRoot({
      runRoot,
      source: planSource,
      sourceIndex,
      triageRootName,
    });
    const triageArtifact = await readJsonArtifact(join(sourceRoot, "triage-output.json"));
    const triage =
      triageArtifact.parsed !== null &&
      typeof triageArtifact.parsed === "object" &&
      !Array.isArray(triageArtifact.parsed)
        ? (triageArtifact.parsed as OcrTriageRecord)
        : null;
    const triageSource: Tier2OcrTriageSource | null =
      triage === null
        ? null
        : {
            sourceId: planSource.sourceId,
            title: planSource.title,
            publisher: planSource.publisher,
            sourceGroup: planSource.sourceGroup,
            sourceUrl: planSource.sourceUrl,
            finalUrl: planSource.finalUrl,
            rawArtifactKey: planSource.rawArtifactKey,
            pageRange: planSource.pageRange,
            requestedPageLimit: reviewSource.pagesReviewed.length,
            pdfPageCount: null,
            selectedPageCount: reviewSource.pagesReviewed.length,
            selectedPages: reviewSource.pagesReviewed,
            inputPdfArtifactKey: null,
            inputByteLength: 0,
            inputSha256: null,
            status: "ocr_complete",
            reusedExisting: true,
            httpStatus: null,
            requestedServiceTier: null,
            servedServiceTier: null,
            responseArtifactKey: null,
            textArtifactKey: `${triageRootName}/sources/${String(sourceIndex + 1).padStart(
              4,
              "0",
            )}_${planSource.sourceId}/openrouter-message.txt`,
            parsedJsonArtifactKey: `${triageRootName}/sources/${String(sourceIndex + 1).padStart(
              4,
              "0",
            )}_${planSource.sourceId}/triage-output.json`,
            annotationsArtifactKey: `${triageRootName}/sources/${String(sourceIndex + 1).padStart(
              4,
              "0",
            )}_${planSource.sourceId}/openrouter-file-annotations.json`,
            usage: null,
            error: null,
          };
    const sourceRef = sourceRefForCandidate({
      capturedSource: capturedById.get(planSource.sourceId) ?? null,
      planSource,
      triageSource,
      reviewSource,
    });

    reviewQuestionCandidates.push(...reviewQuestionsForSource({ sourceRef, reviewSource }));
    const followup = followupOcrCandidateForSource({ sourceRef, reviewSource });
    if (followup !== null) {
      followupOcrCandidates.push(followup);
    }
    if (triage === null) {
      continue;
    }
    documentEntityLinkCandidates.push(...entityLinkCandidatesForTriage({ sourceRef, triage }));
    documentInterventionSeeds.push(...interventionSeedsForTriage({ sourceRef, triage }));
  }
  for (const planSource of plan.sources) {
    const phase2Evidence = evidenceCandidatesBySourceId.get(planSource.sourceId);
    if (phase2Evidence !== undefined) {
      documentEvidenceCandidates.push(...phase2Evidence);
    }
  }

  const partialBundle = {
    documentSourceCandidates,
    documentEntityLinkCandidates,
    documentInterventionSeeds,
    documentEvidenceCandidates,
    reviewQuestionCandidates,
    followupOcrCandidates,
  };
  const validationSummary = validationSummaryForBundle(partialBundle);
  const candidateCounts = {
    document_source_candidate: documentSourceCandidates.length,
    document_entity_link_candidate: documentEntityLinkCandidates.length,
    document_intervention_seed: documentInterventionSeeds.length,
    document_evidence_candidate: documentEvidenceCandidates.length,
    review_question_candidate: reviewQuestionCandidates.length,
    followup_ocr_candidate: followupOcrCandidates.length,
  };
  const llmExtractionAudits: Tier2LlmExtractionAudit[] = [
    {
      candidateType: "llm_extraction_audit",
      candidateId: `llm_extraction_audit:${plan.runId}:deterministic_ocr_triage`,
      model: triageManifest?.model ?? plan.model,
      provider: triageManifest?.provider ?? "openrouter",
      serviceTier: triageManifest?.serviceTier ?? null,
      extractionMode: "deterministic_ocr_triage_candidate_bundle",
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
    ocrQualityReviewPath: args.ocrQualityReviewPath,
    outputPath: args.outputPath ?? null,
    triageRootName,
    summary: {
      sourceCandidateCount: documentSourceCandidates.length,
      entityLinkCandidateCount: documentEntityLinkCandidates.length,
      interventionSeedCount: documentInterventionSeeds.length,
      reviewQuestionCandidateCount: reviewQuestionCandidates.length,
      followupOcrCandidateCount: followupOcrCandidates.length,
      auditCount: llmExtractionAudits.length,
      unvalidatedCandidateCount: validationSummary.unvalidated,
    },
    documentSourceCandidates,
    documentEntityLinkCandidates,
    documentInterventionSeeds,
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
    ...bundle.documentEntityLinkCandidates,
    ...bundle.documentInterventionSeeds,
    ...(bundle.documentEvidenceCandidates ?? []),
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

function normalizeInterventionFamily(value: string): string | null {
  const text = value.toLowerCase().replace(/[_-]+/g, " ");
  if (text.includes("select bus service") || /\bsbs\b/.test(text)) {
    return "select_bus_service_launch";
  }
  if (text.includes("signal priority") || /\btsp\b/.test(text)) {
    return "transit_signal_priority_install";
  }
  if (text.includes("busway")) {
    return "busway_launch";
  }
  if (
    text.includes("stop consolidation") ||
    text.includes("bus stop consolidation") ||
    text.includes("stop relocation") ||
    text.includes("bus stop relocation")
  ) {
    return "stop_consolidation";
  }
  if (
    text.includes("all-door") ||
    text.includes("all door") ||
    text.includes("off-board") ||
    text.includes("fare")
  ) {
    return "fare_or_boarding_policy_change";
  }
  if (text.includes("redesign") || text.includes("service change")) {
    return "route_redesign_service_change";
  }
  if (text.includes("capital")) {
    return "capital_project_milestone";
  }
  if (text.includes("ace") || text.includes("able") || text.includes("automated camera")) {
    return "ace_scope_change";
  }
  if (text.includes("bus lane")) {
    return "bus_lane_infrastructure";
  }
  return null;
}

function incrementRecordCount(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function followupCurationPriority(input: {
  review: Tier2OcrQualityReviewSource;
  normalizedInterventionTypes: string[];
}): Tier2FollowupCurationPriority {
  if (input.review.decision !== "extract") return "low";
  const nonStructuredTypes = input.normalizedInterventionTypes.filter(
    (type) => type !== "bus_lane_infrastructure",
  );
  if (nonStructuredTypes.length > 0 && input.review.routeCount > 0 && input.review.dateCount > 0) {
    return "high";
  }
  if (
    nonStructuredTypes.length > 0 ||
    input.normalizedInterventionTypes.length > 0 ||
    input.review.usefulPages.length > 0
  ) {
    return "medium";
  }
  return "low";
}

export async function buildTier2FollowupCurationQueue(
  args: BuildTier2FollowupCurationQueueArgs,
): Promise<Tier2FollowupCurationQueue> {
  const review = await readRequiredJsonArtifact<Tier2OcrQualityReview>(args.ocrQualityReviewPath);
  const triageManifest = await readRequiredJsonArtifact<Tier2OcrTriageManifest>(
    args.triageManifestPath,
  );
  const runRoot = dirname(triageManifest.captureManifestPath);
  const triageBySourceId = new Map(
    triageManifest.sources.map((source) => [source.sourceId, source]),
  );

  const items: Tier2FollowupCurationQueueItem[] = [];
  for (const reviewSource of review.sources) {
    if (reviewSource.decision !== "extract" || reviewSource.ocrQuality !== "good") {
      continue;
    }
    const triageSource = triageBySourceId.get(reviewSource.sourceId);
    const triage =
      triageSource?.parsedJsonArtifactKey === null ||
      triageSource?.parsedJsonArtifactKey === undefined
        ? null
        : await readJsonArtifactIfExistsForStatus<OcrTriageRecord>(
            join(runRoot, triageSource.parsedJsonArtifactKey),
          );
    const interventionFamilies = [
      ...new Set(stringArray(triage?.interventionFamilies).filter((value) => value.length > 0)),
    ];
    const normalizedInterventionTypes = [
      ...new Set(
        interventionFamilies
          .map((family) => normalizeInterventionFamily(family))
          .filter((family): family is string => family !== null),
      ),
    ];
    const priority = followupCurationPriority({
      review: reviewSource,
      normalizedInterventionTypes,
    });
    items.push({
      reviewItemId: `followup_curation:${reviewSource.sourceId}`,
      priority,
      sourceId: reviewSource.sourceId,
      title: reviewSource.title,
      publisher: reviewSource.publisher,
      sourceGroup: reviewSource.sourceGroup,
      sourceUrl: reviewSource.sourceUrl,
      ocrQuality: reviewSource.ocrQuality,
      decision: reviewSource.decision,
      pagesReviewed: reviewSource.pagesReviewed,
      usefulPages: reviewSource.usefulPages,
      issueCodes: reviewSource.issueCodes,
      reviewNotes: reviewSource.reviewNotes,
      triageSummary: triage === null ? null : triageString(triage.summary),
      interventionFamilies,
      normalizedInterventionTypes,
      routesMentioned: [...new Set(stringArray(triage?.routesMentioned))],
      corridorsMentioned: [...new Set(stringArray(triage?.corridorsMentioned))],
      dateMentions: [...new Set(stringArray(triage?.dateMentions))],
      artifactKeys: {
        ocrText: triageSource?.textArtifactKey ?? null,
        ocrJson: triageSource?.parsedJsonArtifactKey ?? null,
        ocrAnnotations: triageSource?.annotationsArtifactKey ?? null,
      },
      manualCuration: {
        state: "not_started",
        reviewer: null,
        reviewedAt: null,
        curatedCandidateIds: [],
        notes: null,
      },
    });
  }

  items.sort((a, b) => {
    const priorityRank: Record<Tier2FollowupCurationPriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };
    const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];
    if (priorityDelta !== 0) return priorityDelta;
    return a.sourceId.localeCompare(b.sourceId);
  });

  const normalizedInterventionTypeCounts: Record<string, number> = {};
  const sourceGroupCounts: Record<string, number> = {};
  const issueCounts: Record<string, number> = {};
  for (const item of items) {
    incrementRecordCount(sourceGroupCounts, item.sourceGroup);
    for (const type of item.normalizedInterventionTypes) {
      incrementRecordCount(normalizedInterventionTypeCounts, type);
    }
    for (const issue of item.issueCodes) {
      incrementRecordCount(issueCounts, issue);
    }
  }

  const artifact: Tier2FollowupCurationQueue = {
    version: 1,
    runId: review.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    ocrQualityReviewPath: args.ocrQualityReviewPath,
    triageManifestPath: args.triageManifestPath,
    outputPath: args.outputPath ?? null,
    summary: {
      reviewedExtractSourceCount: review.summary.extractCount,
      queueItemCount: items.length,
      highPriorityCount: items.filter((item) => item.priority === "high").length,
      mediumPriorityCount: items.filter((item) => item.priority === "medium").length,
      lowPriorityCount: items.filter((item) => item.priority === "low").length,
      normalizedInterventionTypeCounts,
      sourceGroupCounts,
      issueCounts,
    },
    items,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }

  return artifact;
}

export async function buildTier2FollowupCurationDecisionTemplate(
  args: BuildTier2FollowupCurationDecisionTemplateArgs,
): Promise<Tier2FollowupCurationDecisionTemplate> {
  const queue = await readRequiredJsonArtifact<Tier2FollowupCurationQueue>(args.queuePath);
  const decisions = queue.items.map(
    (item): Tier2FollowupCurationDecision => ({
      reviewItemId: item.reviewItemId,
      sourceId: item.sourceId,
      priority: item.priority,
      title: item.title,
      sourceUrl: item.sourceUrl,
      currentDecision: "needs_human_review",
      reviewer: null,
      reviewedAt: null,
      rationale: null,
      suggestedInterventionTypes: item.normalizedInterventionTypes,
      usefulPages: item.usefulPages,
      curatedCandidates: [],
    }),
  );
  const artifact: Tier2FollowupCurationDecisionTemplate = {
    version: 1,
    runId: queue.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    queuePath: args.queuePath,
    outputPath: args.outputPath ?? null,
    summary: {
      decisionCount: decisions.length,
      needsHumanReviewCount: decisions.length,
    },
    decisions,
  };
  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }
  return artifact;
}

function curatedCandidateDraftIsValid(candidate: Tier2FollowupCuratedCandidateDraft): boolean {
  return (
    candidate.candidateId.length > 0 &&
    candidate.interventionType.length > 0 &&
    candidate.evidenceRefs.length > 0 &&
    candidate.evidenceRefs.every((ref) => ref.artifactKey.length > 0 && ref.pageRefs.length > 0)
  );
}

export async function verifyTier2FollowupCurationDecisions(
  args: VerifyTier2FollowupCurationDecisionsArgs,
): Promise<Tier2FollowupCurationDecisionVerification> {
  const [queue, template] = await Promise.all([
    readRequiredJsonArtifact<Tier2FollowupCurationQueue>(args.queuePath),
    readRequiredJsonArtifact<Tier2FollowupCurationDecisionTemplate>(args.decisionsPath),
  ]);
  const queueItemIds = new Set(queue.items.map((item) => item.reviewItemId));
  const decisionItemIds = new Set(template.decisions.map((decision) => decision.reviewItemId));
  const summary = {
    decisionCount: template.decisions.length,
    completeDecisionCount: 0,
    incompleteDecisionCount: 0,
    needsHumanReviewCount: 0,
    curateCandidatesCount: 0,
    skipCount: 0,
    needsMoreSourceCount: 0,
    curatedCandidateCount: 0,
    missingReviewerCount: 0,
    missingReviewedAtCount: 0,
    missingRationaleCount: 0,
    invalidCuratedCandidateCount: 0,
    unknownReviewItemCount: 0,
    missingReviewItemCount: 0,
  };

  for (const decision of template.decisions) {
    if (!queueItemIds.has(decision.reviewItemId)) {
      summary.unknownReviewItemCount += 1;
    }
    if (decision.currentDecision === "needs_human_review") {
      summary.needsHumanReviewCount += 1;
    }
    if (decision.currentDecision === "curate_candidates") {
      summary.curateCandidatesCount += 1;
      summary.curatedCandidateCount += decision.curatedCandidates.length;
      if (
        decision.curatedCandidates.length === 0 ||
        decision.curatedCandidates.some((candidate) => !curatedCandidateDraftIsValid(candidate))
      ) {
        summary.invalidCuratedCandidateCount += 1;
      }
    }
    if (decision.currentDecision === "skip") {
      summary.skipCount += 1;
    }
    if (decision.currentDecision === "needs_more_source") {
      summary.needsMoreSourceCount += 1;
    }
    if (decision.reviewer === null || decision.reviewer.trim().length === 0) {
      summary.missingReviewerCount += 1;
    }
    if (decision.reviewedAt === null || decision.reviewedAt.trim().length === 0) {
      summary.missingReviewedAtCount += 1;
    }
    if (decision.rationale === null || decision.rationale.trim().length === 0) {
      summary.missingRationaleCount += 1;
    }

    const complete =
      decision.currentDecision !== "needs_human_review" &&
      decision.reviewer !== null &&
      decision.reviewer.trim().length > 0 &&
      decision.reviewedAt !== null &&
      decision.reviewedAt.trim().length > 0 &&
      decision.rationale !== null &&
      decision.rationale.trim().length > 0 &&
      (decision.currentDecision !== "curate_candidates" ||
        (decision.curatedCandidates.length > 0 &&
          decision.curatedCandidates.every(curatedCandidateDraftIsValid)));
    if (complete) {
      summary.completeDecisionCount += 1;
    } else {
      summary.incompleteDecisionCount += 1;
    }
  }
  for (const item of queue.items) {
    if (!decisionItemIds.has(item.reviewItemId)) {
      summary.missingReviewItemCount += 1;
    }
  }

  const verification: Tier2FollowupCurationDecisionVerification = {
    version: 1,
    runId: queue.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    decisionsPath: args.decisionsPath,
    queuePath: args.queuePath,
    outputPath: args.outputPath ?? null,
    complete:
      summary.incompleteDecisionCount === 0 &&
      summary.unknownReviewItemCount === 0 &&
      summary.missingReviewItemCount === 0,
    summary,
  };
  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, verification);
  }
  return verification;
}

function sourceRefForFollowupCandidate(input: {
  item: Tier2FollowupCurationQueue["items"][number];
  candidate: Tier2FollowupCuratedCandidateDraft;
}): Tier2CandidateSourceRef {
  const pageRefs = [
    ...new Set(input.candidate.evidenceRefs.flatMap((ref) => ref.pageRefs)),
  ].toSorted((a, b) => a - b);
  const firstEvidenceRef = input.candidate.evidenceRefs[0] ?? null;
  return {
    sourceId: input.item.sourceId,
    sourceUrl: input.item.sourceUrl,
    title: input.item.title,
    publisher: input.item.publisher,
    documentDate: null,
    sourceGroup: input.item.sourceGroup,
    artifactKeys: {
      raw: null,
      text: input.item.artifactKeys.ocrText,
      ocrText: input.item.artifactKeys.ocrText,
      ocrJson: input.item.artifactKeys.ocrJson,
      ocrAnnotations: firstEvidenceRef?.artifactKey ?? input.item.artifactKeys.ocrAnnotations,
    },
    pages: pageRefs,
  };
}

function documentSourceCandidateForFollowupQueueItem(
  item: Tier2FollowupCurationQueueItem,
): Tier2DocumentSourceCandidate {
  return {
    candidateType: "document_source_candidate",
    candidateId: `document_source:${item.sourceId}`,
    sourceId: item.sourceId,
    sourceUrl: item.sourceUrl,
    finalUrl: item.sourceUrl,
    title: item.title,
    publisher: item.publisher,
    sourceGroup: item.sourceGroup,
    intendedUse: [...item.normalizedInterventionTypes],
    priority: item.priority === "high" ? 1 : item.priority === "medium" ? 2 : 3,
    documentDate: null,
    retrievedAt: null,
    captureStatus: "captured",
    detectedContentType: "pdf",
    textExtractionStatus: "ocr_required",
    contentSha256: null,
    rawArtifactKey: null,
    textArtifactKey: item.artifactKeys.ocrText,
    termsNote: null,
    validationState: "unvalidated",
  };
}

export async function buildTier2FollowupCurationCandidateBundle(
  args: BuildTier2FollowupCurationCandidateBundleArgs,
): Promise<Tier2CandidateBundle> {
  const [queue, decisions] = await Promise.all([
    readRequiredJsonArtifact<Tier2FollowupCurationQueue>(args.queuePath),
    readRequiredJsonArtifact<Tier2FollowupCurationDecisionTemplate>(args.decisionsPath),
  ]);
  const queueByReviewItemId = new Map(queue.items.map((item) => [item.reviewItemId, item]));
  const documentSourceCandidatesById = new Map<string, Tier2DocumentSourceCandidate>();
  const documentInterventionSeeds: Tier2DocumentInterventionSeed[] = [];

  for (const decision of decisions.decisions) {
    if (decision.currentDecision !== "curate_candidates") {
      continue;
    }
    const item = queueByReviewItemId.get(decision.reviewItemId);
    if (item === undefined) {
      continue;
    }
    documentSourceCandidatesById.set(
      item.sourceId,
      documentSourceCandidateForFollowupQueueItem(item),
    );
    for (const candidate of decision.curatedCandidates) {
      documentInterventionSeeds.push({
        candidateType: "document_intervention_seed",
        candidateId: candidate.candidateId,
        sourceRef: sourceRefForFollowupCandidate({ item, candidate }),
        interventionFamily: candidate.interventionType,
        routeMentions: candidate.routeMentions,
        corridorMentions: candidate.corridorMentions,
        dateMentions: candidate.dateMention === null ? [] : [candidate.dateMention],
        status: "candidate_from_ocr_triage",
        validationState: "unvalidated",
        reviewReason: candidate.notes ?? "Manually curated from follow-up OCR review.",
      });
    }
  }

  const candidateCounts = {
    document_source_candidate: documentSourceCandidatesById.size,
    document_entity_link_candidate: 0,
    document_intervention_seed: documentInterventionSeeds.length,
    document_evidence_candidate: 0,
    review_question_candidate: 0,
    followup_ocr_candidate: 0,
  };
  const validationSummary = validationSummaryForBundle({
    documentSourceCandidates: [],
    documentEntityLinkCandidates: [],
    documentInterventionSeeds,
    reviewQuestionCandidates: [],
    followupOcrCandidates: [],
  });
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const bundle: Tier2CandidateBundle = {
    version: 1,
    runId: queue.runId,
    generatedAt,
    ocrPlanPath: queue.ocrQualityReviewPath,
    ocrQualityReviewPath: queue.ocrQualityReviewPath,
    outputPath: args.outputPath ?? null,
    triageRootName: "manual_followup_curation",
    summary: {
      sourceCandidateCount: documentSourceCandidatesById.size,
      entityLinkCandidateCount: 0,
      interventionSeedCount: documentInterventionSeeds.length,
      reviewQuestionCandidateCount: 0,
      followupOcrCandidateCount: 0,
      auditCount: 1,
      unvalidatedCandidateCount: validationSummary.unvalidated,
    },
    documentSourceCandidates: [...documentSourceCandidatesById.values()].toSorted((a, b) =>
      a.sourceId.localeCompare(b.sourceId),
    ),
    documentEntityLinkCandidates: [],
    documentInterventionSeeds,
    documentEvidenceCandidates: [],
    reviewQuestionCandidates: [],
    followupOcrCandidates: [],
    llmExtractionAudits: [
      {
        candidateType: "llm_extraction_audit",
        candidateId: `llm_extraction_audit:${queue.runId}:manual_followup_curation`,
        model: "manual_review",
        provider: "openrouter",
        serviceTier: null,
        extractionMode: "deterministic_ocr_triage_candidate_bundle",
        generatedAt,
        sourceCount: new Set(documentInterventionSeeds.map((seed) => seed.sourceRef.sourceId)).size,
        candidateCounts,
        validationSummary,
      },
    ],
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, bundle);
  }

  return bundle;
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
  const seedsById = new Map(
    bundle.documentInterventionSeeds.map((seed) => [seed.candidateId, seed]),
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
        const seed = seedsById.get(event.candidateId);
        const source = sourcesById.get(event.sourceId);
        return [
          {
            eventId: event.eventId,
            candidateId: event.candidateId,
            sourceId: event.sourceId,
            sourceTitle: source?.title ?? seed?.sourceRef.title ?? null,
            sourceUrl: source?.sourceUrl ?? seed?.sourceRef.sourceUrl ?? null,
            routeIds: event.routeIds,
            interventionType: event.interventionType,
            implementationDate: event.implementationDate,
            datePrecision: event.datePrecision,
            sourceSpanChunkIds: event.sourceSpanChunkIds,
            routeMentions: seed?.routeMentions ?? [],
            corridorMentions: seed?.corridorMentions ?? [],
            dateMentions: seed?.dateMentions ?? [],
            interventionFamily: seed?.interventionFamily ?? null,
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

function duplicateDecisionIsComplete(item: Tier2DuplicateDecisionItem): boolean {
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
  const followupCurationQueuePath = join(baseDir, "followup-curation-queue.json");
  const followupCurationQueue =
    await readJsonArtifactIfExistsForStatus<Tier2FollowupCurationQueue>(followupCurationQueuePath);
  const followupCurationVerification =
    await readJsonArtifactIfExistsForStatus<Tier2FollowupCurationDecisionVerification>(
      join(baseDir, "followup-curation-decision-verification.json"),
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
    interventionSeedCount: bundle.summary.interventionSeedCount,
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
    followupCurationQueuePath: followupCurationQueue === null ? null : followupCurationQueuePath,
    followupCurationQueueItemCount: followupCurationQueue?.summary.queueItemCount ?? 0,
    followupCurationQueueHighPriorityCount: followupCurationQueue?.summary.highPriorityCount ?? 0,
    followupCurationDecisionComplete: followupCurationVerification?.complete ?? false,
    followupCurationCompleteDecisionCount:
      followupCurationVerification?.summary.completeDecisionCount ?? 0,
    followupCurationIncompleteDecisionCount:
      followupCurationVerification?.summary.incompleteDecisionCount ?? 0,
    followupCandidateBundlePath:
      manualFollowupBundle === null
        ? (latestFollowupBundle?.path ?? null)
        : join(baseDir, "candidate-bundle-followup-manual.json"),
    followupInterventionSeedCount:
      manualFollowupBundle?.summary.interventionSeedCount ??
      latestFollowupBundle?.artifact.summary.interventionSeedCount ??
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
        summary.sourceCandidateCount > 0 && summary.interventionSeedCount > 0
          ? "complete"
          : "blocked",
      evidence: `${summary.sourceCandidateCount} source candidates; ${summary.interventionSeedCount} intervention seeds.`,
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
      status:
        summary.followupCurationDecisionComplete && summary.followupUnresolvedOcrSourceCount === 0
          ? "complete"
          : "partial",
      evidence: `${summary.followupOcrCompletedCount} completed follow-up OCR outputs; ${summary.followupOcrReviewedCount} reviewed; ${summary.followupUnresolvedOcrSourceCount} OCR-tail sources unresolved; ${summary.followupCurationQueueItemCount} curation-queue items (${summary.followupCurationQueueHighPriorityCount} high priority); ${summary.followupCurationCompleteDecisionCount} curation decisions complete; ${summary.followupCurationIncompleteDecisionCount} incomplete; ${summary.followupInterventionSeedCount} follow-up seeds; ${summary.followupOcrPlannedCount} total follow-up ranges planned.`,
      remaining:
        summary.followupCurationDecisionComplete && summary.followupUnresolvedOcrSourceCount === 0
          ? null
          : summary.followupCurationDecisionComplete
            ? "Follow-up curation decisions complete; remaining work is unresolved OCR-tail sources."
            : "Full follow-up candidate curation remains partial; unreviewed OCR ranges or curation-queue items remain.",
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

function parseOcrReviewCliArgs(args: string[]): OcrReviewCliArgs {
  const options: CliOption<OcrReviewCliArgs>[] = [
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

async function resolveOcrReviewPaths(args: OcrReviewCliArgs): Promise<{
  ocrPlanPath: string;
  outputPath: string;
}> {
  if (args.ocrPlanPath !== undefined) {
    return {
      ocrPlanPath: args.ocrPlanPath,
      outputPath: args.outputPath ?? join(dirname(args.ocrPlanPath), "ocr-quality-review.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }

  return {
    ocrPlanPath: ocrPlanPath(artifactRoot, runId),
    outputPath: args.outputPath ?? ocrQualityReviewPath(artifactRoot, runId),
  };
}

export async function reviewTier2OcrQualityFromCli(args: string[]): Promise<Tier2OcrQualityReview> {
  const parsed = parseOcrReviewCliArgs(args);
  const paths = await resolveOcrReviewPaths(parsed);
  return reviewTier2OcrQuality({
    ...paths,
    ...(parsed.triageRootName !== undefined ? { triageRootName: parsed.triageRootName } : {}),
  });
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

function parseFollowupCurationQueueCliArgs(args: string[]): FollowupCurationQueueCliArgs {
  const options: CliOption<FollowupCurationQueueCliArgs>[] = [
    {
      flags: ["--ocr-review"],
      apply: (output, value) => {
        if (value !== undefined) output.ocrQualityReviewPath = fromCliPath(value);
      },
    },
    {
      flags: ["--triage-manifest"],
      apply: (output, value) => {
        if (value !== undefined) output.triageManifestPath = fromCliPath(value);
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

async function resolveFollowupCurationQueuePaths(
  args: FollowupCurationQueueCliArgs,
): Promise<BuildTier2FollowupCurationQueueArgs> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    ocrQualityReviewPath:
      args.ocrQualityReviewPath ?? join(baseDir, "followup-ocr-quality-review-full.json"),
    triageManifestPath:
      args.triageManifestPath ?? join(baseDir, "followup-ocr-triage-manifest-full.json"),
    outputPath: args.outputPath ?? join(baseDir, "followup-curation-queue.json"),
  };
}

export async function buildTier2FollowupCurationQueueFromCli(
  args: string[],
): Promise<
  Pick<Tier2FollowupCurationQueue, "version" | "runId" | "generatedAt" | "outputPath" | "summary">
> {
  const queue = await buildTier2FollowupCurationQueue(
    await resolveFollowupCurationQueuePaths(parseFollowupCurationQueueCliArgs(args)),
  );
  return {
    version: queue.version,
    runId: queue.runId,
    generatedAt: queue.generatedAt,
    outputPath: queue.outputPath,
    summary: queue.summary,
  };
}

function parseFollowupCurationDecisionTemplateCliArgs(
  args: string[],
): FollowupCurationDecisionTemplateCliArgs {
  const options: CliOption<FollowupCurationDecisionTemplateCliArgs>[] = [
    {
      flags: ["--queue"],
      apply: (output, value) => {
        if (value !== undefined) output.queuePath = fromCliPath(value);
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

async function resolveFollowupCurationDecisionTemplatePaths(
  args: FollowupCurationDecisionTemplateCliArgs,
): Promise<BuildTier2FollowupCurationDecisionTemplateArgs> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    queuePath: args.queuePath ?? join(baseDir, "followup-curation-queue.json"),
    outputPath: args.outputPath ?? join(baseDir, "followup-curation-decisions.json"),
  };
}

export async function buildTier2FollowupCurationDecisionTemplateFromCli(
  args: string[],
): Promise<
  Pick<
    Tier2FollowupCurationDecisionTemplate,
    "version" | "runId" | "generatedAt" | "outputPath" | "summary"
  >
> {
  const template = await buildTier2FollowupCurationDecisionTemplate(
    await resolveFollowupCurationDecisionTemplatePaths(
      parseFollowupCurationDecisionTemplateCliArgs(args),
    ),
  );
  return {
    version: template.version,
    runId: template.runId,
    generatedAt: template.generatedAt,
    outputPath: template.outputPath,
    summary: template.summary,
  };
}

function parseVerifyFollowupCurationDecisionsCliArgs(
  args: string[],
): VerifyFollowupCurationDecisionsCliArgs {
  const options: CliOption<VerifyFollowupCurationDecisionsCliArgs>[] = [
    {
      flags: ["--decisions"],
      apply: (output, value) => {
        if (value !== undefined) output.decisionsPath = fromCliPath(value);
      },
    },
    {
      flags: ["--queue"],
      apply: (output, value) => {
        if (value !== undefined) output.queuePath = fromCliPath(value);
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

async function resolveVerifyFollowupCurationDecisionsPaths(
  args: VerifyFollowupCurationDecisionsCliArgs,
): Promise<VerifyTier2FollowupCurationDecisionsArgs> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    decisionsPath: args.decisionsPath ?? join(baseDir, "followup-curation-decisions.json"),
    queuePath: args.queuePath ?? join(baseDir, "followup-curation-queue.json"),
    outputPath: args.outputPath ?? join(baseDir, "followup-curation-decision-verification.json"),
  };
}

export async function verifyTier2FollowupCurationDecisionsFromCli(
  args: string[],
): Promise<
  Pick<
    Tier2FollowupCurationDecisionVerification,
    "version" | "runId" | "generatedAt" | "outputPath" | "complete" | "summary"
  >
> {
  const verification = await verifyTier2FollowupCurationDecisions(
    await resolveVerifyFollowupCurationDecisionsPaths(
      parseVerifyFollowupCurationDecisionsCliArgs(args),
    ),
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

function parseFollowupCurationCandidateBundleCliArgs(
  args: string[],
): FollowupCurationCandidateBundleCliArgs {
  return parseVerifyFollowupCurationDecisionsCliArgs(args);
}

async function resolveFollowupCurationCandidateBundlePaths(
  args: FollowupCurationCandidateBundleCliArgs,
): Promise<BuildTier2FollowupCurationCandidateBundleArgs> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    decisionsPath: args.decisionsPath ?? join(baseDir, "followup-curation-decisions.json"),
    queuePath: args.queuePath ?? join(baseDir, "followup-curation-queue.json"),
    outputPath: args.outputPath ?? join(baseDir, "candidate-bundle-followup-manual.json"),
  };
}

export async function buildTier2FollowupCurationCandidateBundleFromCli(
  args: string[],
): Promise<
  Pick<Tier2CandidateBundle, "version" | "runId" | "generatedAt" | "outputPath" | "summary">
> {
  const bundle = await buildTier2FollowupCurationCandidateBundle(
    await resolveFollowupCurationCandidateBundlePaths(
      parseFollowupCurationCandidateBundleCliArgs(args),
    ),
  );
  return {
    version: bundle.version,
    runId: bundle.runId,
    generatedAt: bundle.generatedAt,
    outputPath: bundle.outputPath,
    summary: bundle.summary,
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
