// biome-ignore-all lint/style/noNonNullAssertion: Legacy Tier 2 command code is pending plan 024 deletion; existing index assertions are intentional.
// Tier 2 Phase 2 OCR-markdown evidence-candidate extraction step, extracted
// from the former _shared.ts monolith during the per-step decomposition. Holds
// the candidate tool/prompt/system-prompt, the DeepSeek client wrapper, the
// quality-assessment + evidence-repair helpers, per-window extraction, and the
// CLI entry point. Imports shared types, schemas, LLM HTTP clients,
// route/numeric patterns, and path/IO/CLI helpers from the core module; the
// core module never imports back here at runtime, keeping the DAG acyclic.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DocumentEvidenceCandidateDraftToolSchema,
  DocumentServiceChangeKindSchema,
  DocumentTreatmentTypeSchema,
  type Tier2CandidateSourceRef,
  type Tier2CandidateValidationState,
  type Tier2DocumentEvidenceCandidate,
  type Tier2OcrMarkdownCandidateQualityIssueCode,
  type Tier2OcrMarkdownCandidateQualityRepairCode,
} from "@bp/domain/documents/candidates";
import { toProjectJsonSchema } from "@bp/domain/json-schema";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import {
  callDeepSeekToolCallViaPi,
  type OpenRouterCallResult,
  openRouterErrorMessage,
} from "./_llm-clients.ts";
import { expandRouteMention, quoteSupportsNumericValue } from "./_patterns.ts";
import {
  artifactKey,
  type CliOption,
  DEFAULT_OCR_MAX_TOKENS,
  DEFAULT_TEXT_MODEL,
  defaultFetch,
  type ExtractTier2OcrMarkdownCandidatesArgs,
  extractToolCallArguments,
  type FetchLike,
  latestDocsRunId,
  mapWithConcurrency,
  markdownBody,
  missingToolCallErrorMessage,
  normalizeOcrArtifactRootName,
  normalizeOcrPageMarkdownRootName,
  OCR_MARKDOWN_CANDIDATE_QUALITY_ISSUE_CODES,
  OCR_MARKDOWN_CANDIDATE_QUALITY_REPAIR_CODES,
  type OcrEvidenceCandidateDraft,
  type OcrMarkdownCandidatesCliArgs,
  ocrEvidenceCandidateDrafts,
  ocrPlanPath,
  parseCliOptions,
  parseSourceIds,
  runArtifactRoot,
  shortHash,
  type Tier2CapturedSource,
  type Tier2CaptureManifest,
  type Tier2OcrMarkdownCandidateExtraction,
  type Tier2OcrMarkdownCandidateWindow,
  type Tier2OcrPageMarkdownAudit,
  type Tier2OcrPageMarkdownAuditPage,
  type Tier2OcrPlan,
  type Tier2OcrPlanSource,
  trueOption,
  unknownRecord,
} from "./_shared.ts";

const OCR_MARKDOWN_CANDIDATE_TOOL_NAME = "record_tier2_ocr_markdown_candidates";
const OCR_MARKDOWN_CANDIDATE_PROMPT_VERSION = "ocr-markdown-candidates-v4";

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
    const char = text[index]!;
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
  const firstQuote = hits[0]!.quote;
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
    const [leftPage, leftMarkdown] = pages[index]!;
    const [rightPage, rightMarkdown] = pages[index + 1]!;
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

// Exported for request-shape characterization tests (see callOpenRouterPageMarkdownOcr).
// Routes the DeepSeek text-only forced tool call through the pi harness; the
// returned `{response, body}` is synthesized so the consumer below is unchanged.
export async function callDeepSeekMarkdownCandidates(input: {
  apiKey: string;
  model: string;
  maxTokens: number;
  source: Tier2OcrPlanSource;
  pages: Tier2OcrPageMarkdownAuditPage[];
  markdownText: string;
  fetcher: FetchLike;
}): Promise<OpenRouterCallResult> {
  const tool = ocrMarkdownCandidateTool()["function"] as {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  return callDeepSeekToolCallViaPi({
    apiKey: input.apiKey,
    model: input.model,
    maxTokens: input.maxTokens,
    toolName: OCR_MARKDOWN_CANDIDATE_TOOL_NAME,
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
    tools: [tool],
    fetcher: input.fetcher,
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
