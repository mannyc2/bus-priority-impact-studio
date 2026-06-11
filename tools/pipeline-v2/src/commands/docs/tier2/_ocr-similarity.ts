import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import {
  type CliOption,
  latestDocsRunId,
  markdownBody,
  ocrPlanPath,
  parseCliOptions,
  type Tier2OcrPageMarkdownAudit,
  type Tier2OcrPageMarkdownAuditPage,
  type Tier2OcrPlan,
  type Tier2OcrPlanSource,
  trueOption,
} from "./_shared.ts";
import { type LocalOcrCommandRunner, runTier2TesseractOcr } from "./_tesseract-ocr.ts";

const DEFAULT_OUTPUT_NAME = "ocr-similarity-tesseract-v1.json";
const DEFAULT_LOCAL_PAGE_MARKDOWN_ROOT_PREFIX = "ocr-page-markdown-tesseract-similarity";
const DEFAULT_LIMIT_PAGES = 25;
const DEFAULT_LIMIT_SOURCES = 10;
const HIGH_CONFIDENCE_TEXT_RECALL = 0.95;
const HIGH_CONFIDENCE_CHAR_COSINE = 0.95;
const REVIEWABLE_TEXT_RECALL = 0.8;
const REVIEWABLE_CHAR_COSINE = 0.85;
const HIGH_VALUE_BASELINE_CHARS = 300;
const HIGH_VALUE_ESCALATION_CHARS = 500;

type TextLayerMode = "prefer" | "never";

const OCR_RECOMMENDED_ACTIONS = [
  "local_ok",
  "local_ok_with_review",
  "vision_escalation_candidate",
  "no_paid_vision_low_value_visual",
  "local_failed_needs_triage",
  "prepared_not_run",
] as const;

export type OcrSimilarityRecommendedAction = (typeof OCR_RECOMMENDED_ACTIONS)[number];

export type OcrSimilarityMetricSummary = {
  mean: number | null;
  median: number | null;
  p10: number | null;
  p90: number | null;
};

export type OcrSimilarityRow = {
  sourceId: string;
  title: string;
  pageNumber: number;
  baselineMarkdownArtifactKey: string;
  localMarkdownArtifactKey: string | null;
  localStatus: "ocr_complete" | "ocr_failed" | "prepared" | "missing";
  localTextSource: "pdf_text_layer" | "tesseract" | null;
  baselineCharCount: number;
  localCharCount: number;
  lengthRatio: number | null;
  tokenJaccard: number | null;
  tokenRecall: number | null;
  tokenPrecision: number | null;
  charFiveGramCosine: number | null;
  plainTextBaselineCharCount: number;
  plainTextLocalCharCount: number;
  plainTextLengthRatio: number | null;
  plainTextTokenJaccard: number | null;
  plainTextTokenRecall: number | null;
  plainTextTokenPrecision: number | null;
  plainTextCharFiveGramCosine: number | null;
  routeTokenRecall: number | null;
  dateTokenRecall: number | null;
  numberTokenRecall: number | null;
  baselineRouteTokens: string[];
  missingRouteTokens: string[];
  baselineDateTokens: string[];
  missingDateTokens: string[];
  baselineNumberTokens: string[];
  missingNumberTokens: string[];
  recommendedAction: OcrSimilarityRecommendedAction;
  recommendationReasons: string[];
  error: string | null;
};

export type OcrSimilarityArtifact = {
  version: 1;
  generatedAt: string;
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  outputPath: string | null;
  localPageMarkdownRootName: string;
  textLayerMode: TextLayerMode;
  execute: boolean;
  summary: {
    selectedSourceCount: number;
    selectedPageCount: number;
    comparedPageCount: number;
    failedLocalPageCount: number;
    textLayerPageCount: number;
    tesseractPageCount: number;
    tokenJaccard: OcrSimilarityMetricSummary;
    tokenRecall: OcrSimilarityMetricSummary;
    tokenPrecision: OcrSimilarityMetricSummary;
    charFiveGramCosine: OcrSimilarityMetricSummary;
    plainTextTokenJaccard: OcrSimilarityMetricSummary;
    plainTextTokenRecall: OcrSimilarityMetricSummary;
    plainTextTokenPrecision: OcrSimilarityMetricSummary;
    plainTextCharFiveGramCosine: OcrSimilarityMetricSummary;
    routeTokenRecall: OcrSimilarityMetricSummary;
    dateTokenRecall: OcrSimilarityMetricSummary;
    numberTokenRecall: OcrSimilarityMetricSummary;
    recommendationCounts: Record<OcrSimilarityRecommendedAction, number>;
  };
  rows: OcrSimilarityRow[];
};

export type RunTier2OcrSimilarityArgs = {
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  outputPath?: string;
  generatedAt?: string;
  localPageMarkdownRootName?: string;
  sourceIds?: string[];
  limitSources?: number;
  limitPages?: number;
  execute?: boolean;
  textLayerMode?: TextLayerMode;
  minTextLayerChars?: number;
  tesseractLanguage?: string;
  tesseractPsm?: number;
  tesseractOem?: number;
  renderDpi?: number;
  commandExists?: (command: string) => Promise<boolean>;
  runCommand?: LocalOcrCommandRunner;
};

type BaselinePage = {
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  page: Tier2OcrPageMarkdownAuditPage & { markdownArtifactKey: string };
};

type OcrSimilarityRowWithoutRecommendation = Omit<
  OcrSimilarityRow,
  "recommendedAction" | "recommendationReasons"
>;

function sourceSelection(input: {
  plan: Tier2OcrPlan;
  sourceIds: string[] | undefined;
  limitSources: number;
}): Map<string, { source: Tier2OcrPlanSource; sourceIndex: number }> {
  const ids = input.sourceIds === undefined ? null : new Set(input.sourceIds);
  return new Map(
    input.plan.sources
      .map((source, sourceIndex) => ({ source, sourceIndex }))
      .filter(({ source }) => ids === null || ids.has(source.sourceId))
      .slice(0, input.limitSources)
      .map((entry) => [entry.source.sourceId, entry]),
  );
}

function selectBaselinePages(input: {
  plan: Tier2OcrPlan;
  audit: Tier2OcrPageMarkdownAudit;
  sourceIds: string[] | undefined;
  limitSources: number;
  limitPages: number;
}): BaselinePage[] {
  const selectedSources = sourceSelection({
    plan: input.plan,
    sourceIds: input.sourceIds,
    limitSources: input.limitSources,
  });
  const pages: BaselinePage[] = [];
  for (const auditSource of input.audit.sources) {
    const selected = selectedSources.get(auditSource.sourceId);
    if (selected === undefined) continue;
    for (const page of auditSource.pages.toSorted(
      (left, right) => left.pageNumber - right.pageNumber,
    )) {
      if (
        page.status !== "ocr_complete" ||
        page.markdownArtifactKey === null ||
        page.blankPageLikely
      ) {
        continue;
      }
      pages.push({
        source: selected.source,
        sourceIndex: selected.sourceIndex,
        page: {
          ...page,
          markdownArtifactKey: page.markdownArtifactKey,
        },
      });
      if (pages.length >= input.limitPages) return pages;
    }
  }
  return pages;
}

function groupPagesBySource(pages: BaselinePage[]): Map<string, BaselinePage[]> {
  const grouped = new Map<string, BaselinePage[]>();
  for (const page of pages) {
    const existing = grouped.get(page.source.sourceId) ?? [];
    existing.push(page);
    grouped.set(page.source.sourceId, existing);
  }
  return grouped;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:[-/][a-z0-9]+)*/g) ?? [];
}

function unique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.length > 0))].sort();
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function setOverlap(
  left: string[],
  right: string[],
): { shared: number; leftCount: number; rightCount: number } {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let shared = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) shared += 1;
  }
  return { shared, leftCount: leftSet.size, rightCount: rightSet.size };
}

function tokenScores(
  baseline: string,
  local: string,
): {
  tokenJaccard: number | null;
  tokenRecall: number | null;
  tokenPrecision: number | null;
} {
  const overlap = setOverlap(unique(tokenize(baseline)), unique(tokenize(local)));
  const union = overlap.leftCount + overlap.rightCount - overlap.shared;
  return {
    tokenJaccard: ratio(overlap.shared, union),
    tokenRecall: ratio(overlap.shared, overlap.leftCount),
    tokenPrecision: ratio(overlap.shared, overlap.rightCount),
  };
}

function markdownToPlainComparisonText(text: string): string {
  const withoutLinks = text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n");
  return withoutLinks
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s{0,3}>\s?/, "")
        .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "")
        .replace(/^\s*[-*+]\s+/, "")
        .replace(/^\s*\d+[.)]\s+/, "")
        .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/, "")
        .replace(/\|/g, " ")
        .replace(/[*_~]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ngramCounts(text: string, size: number): Map<string, number> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const counts = new Map<string, number>();
  if (normalized.length < size) {
    if (normalized.length > 0) counts.set(normalized, 1);
    return counts;
  }
  for (let i = 0; i <= normalized.length - size; i += 1) {
    const gram = normalized.slice(i, i + size);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

function cosine(left: Map<string, number>, right: Map<string, number>): number | null {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const value of left.values()) leftNorm += value * value;
  for (const value of right.values()) rightNorm += value * value;
  for (const [key, value] of left) dot += value * (right.get(key) ?? 0);
  if (leftNorm === 0 || rightNorm === 0) return null;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function extractRoutes(text: string): string[] {
  return unique(
    Array.from(
      text.matchAll(/\b(?:Bx\d{1,2}[A-Z]?|BM\d{1,2}|QM\d{1,2}|SIM\d{1,2}|[BMQS]\d{1,3}[A-Z]?)\b/g),
      (match) => match[0].toUpperCase(),
    ),
  );
}

function extractDates(text: string): string[] {
  const month =
    "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  const patterns = [
    new RegExp(`\\b${month}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"),
    new RegExp(`\\b${month}\\.?\\s+\\d{4}\\b`, "gi"),
    /\b\d{4}-\d{1,2}(?:-\d{1,2})?\b/g,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    /\b(?:Spring|Summer|Fall|Autumn|Winter)\s+\d{4}\b/gi,
    /\b(?:19|20)\d{2}\b/g,
  ];
  return unique(
    patterns.flatMap((pattern) =>
      Array.from(text.matchAll(pattern), (match) => match[0].toLowerCase()),
    ),
  );
}

function extractNumbers(text: string): string[] {
  return unique(Array.from(text.matchAll(/\b\d+(?:\.\d+)?%?\b/g), (match) => match[0]));
}

function recallForNeedles(
  baselineTokens: string[],
  localText: string,
): { recall: number | null; missing: string[] } {
  if (baselineTokens.length === 0) return { recall: null, missing: [] };
  const localLower = localText.toLowerCase();
  const missing = baselineTokens.filter((token) => !localLower.includes(token.toLowerCase()));
  return {
    recall: (baselineTokens.length - missing.length) / baselineTokens.length,
    missing,
  };
}

function metricSummary(values: Array<number | null>): OcrSimilarityMetricSummary {
  const finite = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (finite.length === 0) {
    return { mean: null, median: null, p10: null, p90: null };
  }
  const sorted = finite.toSorted((left, right) => left - right);
  const pick = (q: number): number => {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
    const value = sorted[index];
    if (value === undefined) throw new Error("metric summary index out of range");
    return value;
  };
  return {
    mean: finite.reduce((sum, value) => sum + value, 0) / finite.length,
    median: pick(0.5),
    p10: pick(0.1),
    p90: pick(0.9),
  };
}

async function readBody(path: string): Promise<string> {
  return markdownBody(await Bun.file(path).text());
}

function pageRangeFor(pages: BaselinePage[]): string {
  return pages.map((page) => String(page.page.pageNumber)).join(",");
}

function localPageByNumber(
  manifest: Awaited<ReturnType<typeof runTier2TesseractOcr>>,
): Map<number, NonNullable<(typeof manifest.sources)[number]>["pages"][number]> {
  const source = manifest.sources[0];
  return new Map((source?.pages ?? []).map((page) => [page.pageNumber, page]));
}

function compareTexts(input: {
  baseline: string;
  local: string;
}): Pick<
  OcrSimilarityRow,
  | "baselineCharCount"
  | "localCharCount"
  | "lengthRatio"
  | "tokenJaccard"
  | "tokenRecall"
  | "tokenPrecision"
  | "charFiveGramCosine"
  | "plainTextBaselineCharCount"
  | "plainTextLocalCharCount"
  | "plainTextLengthRatio"
  | "plainTextTokenJaccard"
  | "plainTextTokenRecall"
  | "plainTextTokenPrecision"
  | "plainTextCharFiveGramCosine"
  | "routeTokenRecall"
  | "dateTokenRecall"
  | "numberTokenRecall"
  | "baselineRouteTokens"
  | "missingRouteTokens"
  | "baselineDateTokens"
  | "missingDateTokens"
  | "baselineNumberTokens"
  | "missingNumberTokens"
> {
  const tokens = tokenScores(input.baseline, input.local);
  const plainTextBaseline = markdownToPlainComparisonText(input.baseline);
  const plainTextLocal = markdownToPlainComparisonText(input.local);
  const plainTextTokens = tokenScores(plainTextBaseline, plainTextLocal);
  const baselineRouteTokens = extractRoutes(input.baseline);
  const routeRecall = recallForNeedles(baselineRouteTokens, input.local);
  const baselineDateTokens = extractDates(input.baseline);
  const dateRecall = recallForNeedles(baselineDateTokens, input.local);
  const baselineNumberTokens = extractNumbers(input.baseline);
  const numberRecall = recallForNeedles(baselineNumberTokens, input.local);
  return {
    baselineCharCount: input.baseline.length,
    localCharCount: input.local.length,
    lengthRatio: ratio(input.local.length, input.baseline.length),
    ...tokens,
    charFiveGramCosine: cosine(ngramCounts(input.baseline, 5), ngramCounts(input.local, 5)),
    plainTextBaselineCharCount: plainTextBaseline.length,
    plainTextLocalCharCount: plainTextLocal.length,
    plainTextLengthRatio: ratio(plainTextLocal.length, plainTextBaseline.length),
    plainTextTokenJaccard: plainTextTokens.tokenJaccard,
    plainTextTokenRecall: plainTextTokens.tokenRecall,
    plainTextTokenPrecision: plainTextTokens.tokenPrecision,
    plainTextCharFiveGramCosine: cosine(
      ngramCounts(plainTextBaseline, 5),
      ngramCounts(plainTextLocal, 5),
    ),
    routeTokenRecall: routeRecall.recall,
    dateTokenRecall: dateRecall.recall,
    numberTokenRecall: numberRecall.recall,
    baselineRouteTokens,
    missingRouteTokens: routeRecall.missing,
    baselineDateTokens,
    missingDateTokens: dateRecall.missing,
    baselineNumberTokens,
    missingNumberTokens: numberRecall.missing,
  };
}

function atLeast(value: number | null, threshold: number): boolean {
  return value !== null && value >= threshold;
}

function recallOk(value: number | null, threshold: number): boolean {
  return value === null || value >= threshold;
}

function pageHasVisualHints(page: Tier2OcrPageMarkdownAuditPage): boolean {
  return (
    page.containsTables ||
    page.containsMaps ||
    page.containsCharts ||
    page.needsVisualReview ||
    page.visualReviewHints.length > 0
  );
}

function recommendationFor(input: {
  row: OcrSimilarityRowWithoutRecommendation;
  page: Tier2OcrPageMarkdownAuditPage;
}): Pick<OcrSimilarityRow, "recommendedAction" | "recommendationReasons"> {
  const { row, page } = input;
  if (row.localStatus === "prepared") {
    return {
      recommendedAction: "prepared_not_run",
      recommendationReasons: ["Run with --execute before making an OCR engine decision."],
    };
  }
  if (row.localStatus !== "ocr_complete") {
    return {
      recommendedAction: "local_failed_needs_triage",
      recommendationReasons: [
        "Local OCR did not produce comparable page text.",
        "Triage the native tool failure before considering paid vision OCR.",
      ],
    };
  }

  const reasons: string[] = [];
  const visualHints = pageHasVisualHints(page);
  const textStrong =
    atLeast(row.tokenRecall, HIGH_CONFIDENCE_TEXT_RECALL) ||
    atLeast(row.charFiveGramCosine, HIGH_CONFIDENCE_CHAR_COSINE) ||
    atLeast(row.plainTextTokenRecall, HIGH_CONFIDENCE_TEXT_RECALL) ||
    atLeast(row.plainTextCharFiveGramCosine, HIGH_CONFIDENCE_CHAR_COSINE);
  const textReviewable =
    atLeast(row.tokenRecall, REVIEWABLE_TEXT_RECALL) ||
    atLeast(row.charFiveGramCosine, REVIEWABLE_CHAR_COSINE) ||
    atLeast(row.plainTextTokenRecall, REVIEWABLE_TEXT_RECALL) ||
    atLeast(row.plainTextCharFiveGramCosine, REVIEWABLE_CHAR_COSINE);
  const routeDateOk =
    recallOk(row.routeTokenRecall, HIGH_CONFIDENCE_TEXT_RECALL) &&
    recallOk(row.dateTokenRecall, HIGH_CONFIDENCE_TEXT_RECALL);
  const numbersOk = recallOk(row.numberTokenRecall, REVIEWABLE_TEXT_RECALL);
  const missingRouteOrDate = row.missingRouteTokens.length > 0 || row.missingDateTokens.length > 0;
  const missingAnyAnchor =
    missingRouteOrDate || row.missingNumberTokens.length > 0 || !numbersOk || !routeDateOk;
  const highValueText = row.baselineCharCount >= HIGH_VALUE_BASELINE_CHARS;
  const highValueEscalation =
    row.baselineCharCount >= HIGH_VALUE_ESCALATION_CHARS || page.containsTables;
  const lowValueVisual =
    !textReviewable &&
    (row.baselineCharCount < HIGH_VALUE_BASELINE_CHARS ||
      (visualHints && row.baselineCharCount < HIGH_VALUE_ESCALATION_CHARS));

  if (textStrong && routeDateOk && numbersOk) {
    return {
      recommendedAction: "local_ok",
      recommendationReasons: [
        "Local OCR preserved the page text and key route/date/number anchors.",
      ],
    };
  }

  if ((!textReviewable || missingRouteOrDate || !numbersOk) && highValueEscalation) {
    if (!textReviewable) reasons.push("Local text similarity is below reviewable thresholds.");
    if (missingRouteOrDate) reasons.push("Local OCR missed route or date anchors.");
    if (!numbersOk) reasons.push("Local OCR missed many numeric anchors.");
    if (page.containsTables) reasons.push("Table content may justify a paid vision comparison.");
    if (row.baselineCharCount >= HIGH_VALUE_ESCALATION_CHARS) {
      reasons.push("Baseline page has enough substantive text to justify escalation review.");
    }
    return {
      recommendedAction: "vision_escalation_candidate",
      recommendationReasons: reasons,
    };
  }

  if (lowValueVisual) {
    if (!textReviewable) reasons.push("Local OCR did not recover much comparable text.");
    if (!highValueText) reasons.push("Baseline page has little substantive text.");
    if (visualHints) reasons.push("Visual/image hints alone do not justify paid OCR by default.");
    if (missingAnyAnchor)
      reasons.push("Missed anchors should be reviewed manually, not escalated by default.");
    return {
      recommendedAction: "no_paid_vision_low_value_visual",
      recommendationReasons: reasons,
    };
  }

  if (!textStrong)
    reasons.push("Local OCR is usable but below high-confidence similarity thresholds.");
  if (!routeDateOk) reasons.push("Route/date anchor recall needs review.");
  if (!numbersOk) reasons.push("Numeric anchor recall needs review.");
  if (visualHints) reasons.push("Visual hints remain for manual quality review.");
  return {
    recommendedAction: "local_ok_with_review",
    recommendationReasons:
      reasons.length > 0 ? reasons : ["Local OCR is usable with normal extraction review."],
  };
}

function withRecommendation(
  row: OcrSimilarityRowWithoutRecommendation,
  page: Tier2OcrPageMarkdownAuditPage,
): OcrSimilarityRow {
  return {
    ...row,
    ...recommendationFor({ row, page }),
  };
}

function recommendationCounts(
  rows: OcrSimilarityRow[],
): Record<OcrSimilarityRecommendedAction, number> {
  const counts = Object.fromEntries(OCR_RECOMMENDED_ACTIONS.map((action) => [action, 0])) as Record<
    OcrSimilarityRecommendedAction,
    number
  >;
  for (const row of rows) counts[row.recommendedAction] += 1;
  return counts;
}

function summarize(
  rows: OcrSimilarityRow[],
  selectedSourceCount: number,
): OcrSimilarityArtifact["summary"] {
  const compared = rows.filter((row) => row.localStatus === "ocr_complete");
  return {
    selectedSourceCount,
    selectedPageCount: rows.length,
    comparedPageCount: compared.length,
    failedLocalPageCount: rows.filter((row) => row.localStatus === "ocr_failed").length,
    textLayerPageCount: rows.filter((row) => row.localTextSource === "pdf_text_layer").length,
    tesseractPageCount: rows.filter((row) => row.localTextSource === "tesseract").length,
    tokenJaccard: metricSummary(compared.map((row) => row.tokenJaccard)),
    tokenRecall: metricSummary(compared.map((row) => row.tokenRecall)),
    tokenPrecision: metricSummary(compared.map((row) => row.tokenPrecision)),
    charFiveGramCosine: metricSummary(compared.map((row) => row.charFiveGramCosine)),
    plainTextTokenJaccard: metricSummary(compared.map((row) => row.plainTextTokenJaccard)),
    plainTextTokenRecall: metricSummary(compared.map((row) => row.plainTextTokenRecall)),
    plainTextTokenPrecision: metricSummary(compared.map((row) => row.plainTextTokenPrecision)),
    plainTextCharFiveGramCosine: metricSummary(
      compared.map((row) => row.plainTextCharFiveGramCosine),
    ),
    routeTokenRecall: metricSummary(compared.map((row) => row.routeTokenRecall)),
    dateTokenRecall: metricSummary(compared.map((row) => row.dateTokenRecall)),
    numberTokenRecall: metricSummary(compared.map((row) => row.numberTokenRecall)),
    recommendationCounts: recommendationCounts(rows),
  };
}

export async function runTier2OcrSimilarity(
  args: RunTier2OcrSimilarityArgs,
): Promise<OcrSimilarityArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const runRoot = dirname(args.ocrPlanPath);
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const audit = (await Bun.file(args.pageMarkdownAuditPath).json()) as Tier2OcrPageMarkdownAudit;
  const limitSources = args.limitSources ?? DEFAULT_LIMIT_SOURCES;
  const limitPages = args.limitPages ?? DEFAULT_LIMIT_PAGES;
  const textLayerMode = args.textLayerMode ?? "prefer";
  const localPageMarkdownRootName =
    args.localPageMarkdownRootName ??
    `${DEFAULT_LOCAL_PAGE_MARKDOWN_ROOT_PREFIX}-${textLayerMode}-v1`;
  const execute = args.execute ?? false;
  const baselinePages = selectBaselinePages({
    plan,
    audit,
    sourceIds: args.sourceIds,
    limitSources,
    limitPages,
  });
  const grouped = groupPagesBySource(baselinePages);
  const rows: OcrSimilarityRow[] = [];

  for (const pages of grouped.values()) {
    const source = pages[0]?.source;
    if (source === undefined) continue;
    const manifest = execute
      ? await runTier2TesseractOcr({
          ocrPlanPath: args.ocrPlanPath,
          generatedAt,
          pageMarkdownRootName: localPageMarkdownRootName,
          pageRangeOverride: pageRangeFor(pages),
          pageLimit: pages.length,
          limit: 1,
          sourceId: source.sourceId,
          execute: true,
          writeAudit: false,
          textLayerMode,
          ...(args.minTextLayerChars === undefined
            ? {}
            : { minTextLayerChars: args.minTextLayerChars }),
          ...(args.tesseractLanguage === undefined
            ? {}
            : { tesseractLanguage: args.tesseractLanguage }),
          ...(args.tesseractPsm === undefined ? {} : { tesseractPsm: args.tesseractPsm }),
          ...(args.tesseractOem === undefined ? {} : { tesseractOem: args.tesseractOem }),
          ...(args.renderDpi === undefined ? {} : { renderDpi: args.renderDpi }),
          ...(args.commandExists === undefined ? {} : { commandExists: args.commandExists }),
          ...(args.runCommand === undefined ? {} : { runCommand: args.runCommand }),
        })
      : null;
    const localPages = manifest === null ? new Map() : localPageByNumber(manifest);

    for (const page of pages) {
      const baselinePath = join(runRoot, page.page.markdownArtifactKey);
      const baseline = await readBody(baselinePath);
      const local = localPages.get(page.page.pageNumber);
      if (local === undefined || local.markdownArtifactKey === null) {
        rows.push(
          withRecommendation(
            {
              sourceId: source.sourceId,
              title: source.title,
              pageNumber: page.page.pageNumber,
              baselineMarkdownArtifactKey: page.page.markdownArtifactKey,
              localMarkdownArtifactKey: local?.markdownArtifactKey ?? null,
              localStatus: execute ? (local?.status ?? "missing") : "prepared",
              localTextSource: local?.textSource ?? null,
              baselineCharCount: baseline.length,
              localCharCount: 0,
              lengthRatio: null,
              tokenJaccard: null,
              tokenRecall: null,
              tokenPrecision: null,
              charFiveGramCosine: null,
              plainTextBaselineCharCount: markdownToPlainComparisonText(baseline).length,
              plainTextLocalCharCount: 0,
              plainTextLengthRatio: null,
              plainTextTokenJaccard: null,
              plainTextTokenRecall: null,
              plainTextTokenPrecision: null,
              plainTextCharFiveGramCosine: null,
              routeTokenRecall: null,
              dateTokenRecall: null,
              numberTokenRecall: null,
              baselineRouteTokens: extractRoutes(baseline),
              missingRouteTokens: extractRoutes(baseline),
              baselineDateTokens: extractDates(baseline),
              missingDateTokens: extractDates(baseline),
              baselineNumberTokens: extractNumbers(baseline),
              missingNumberTokens: extractNumbers(baseline),
              error: local?.error ?? (execute ? "Local OCR page was not produced." : null),
            },
            page.page,
          ),
        );
        continue;
      }
      const localBody = await readBody(join(runRoot, local.markdownArtifactKey));
      rows.push(
        withRecommendation(
          {
            sourceId: source.sourceId,
            title: source.title,
            pageNumber: page.page.pageNumber,
            baselineMarkdownArtifactKey: page.page.markdownArtifactKey,
            localMarkdownArtifactKey: local.markdownArtifactKey,
            localStatus: local.status,
            localTextSource: local.textSource,
            ...compareTexts({ baseline, local: localBody }),
            error: local.error,
          },
          page.page,
        ),
      );
    }
  }

  const artifact: OcrSimilarityArtifact = {
    version: 1,
    generatedAt,
    ocrPlanPath: args.ocrPlanPath,
    pageMarkdownAuditPath: args.pageMarkdownAuditPath,
    outputPath: args.outputPath ?? null,
    localPageMarkdownRootName,
    textLayerMode,
    execute,
    summary: summarize(rows, grouped.size),
    rows,
  };
  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }
  return artifact;
}

type OcrSimilarityCliArgs = {
  ocrPlanPath?: string;
  pageMarkdownAuditPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  localPageMarkdownRootName?: string;
  sourceIds?: string[];
  limitSources?: number;
  limitPages?: number;
  execute?: boolean;
  textLayerMode?: TextLayerMode;
  minTextLayerChars?: number;
  tesseractLanguage?: string;
  tesseractPsm?: number;
  tesseractOem?: number;
  renderDpi?: number;
};

function parseSourceIds(value: string | undefined): string[] | undefined {
  const ids = value
    ?.split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return ids === undefined || ids.length === 0 ? undefined : ids;
}

function parseTextLayerMode(value: string | undefined): TextLayerMode {
  if (value === "prefer" || value === "never") return value;
  throw new Error("--text-layer-mode must be prefer or never.");
}

function parseCliArgs(args: string[]): OcrSimilarityCliArgs {
  const options: CliOption<OcrSimilarityCliArgs>[] = [
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
      flags: ["--local-page-markdown-root"],
      apply: (output, value) => {
        if (value !== undefined) output.localPageMarkdownRootName = value;
      },
    },
    {
      flags: ["--source-id"],
      apply: (output, value) => {
        if (value !== undefined) output.sourceIds = [value];
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
      flags: ["--limit-sources"],
      apply: (output, value) => {
        if (value !== undefined) output.limitSources = Number(value);
      },
    },
    {
      flags: ["--limit-pages"],
      apply: (output, value) => {
        if (value !== undefined) output.limitPages = Number(value);
      },
    },
    {
      flags: ["--text-layer-mode"],
      apply: (output, value) => {
        output.textLayerMode = parseTextLayerMode(value);
      },
    },
    {
      flags: ["--min-text-layer-chars"],
      apply: (output, value) => {
        if (value !== undefined) output.minTextLayerChars = Number(value);
      },
    },
    {
      flags: ["--tesseract-language", "--lang"],
      apply: (output, value) => {
        if (value !== undefined) output.tesseractLanguage = value;
      },
    },
    {
      flags: ["--tesseract-psm"],
      apply: (output, value) => {
        if (value !== undefined) output.tesseractPsm = Number(value);
      },
    },
    {
      flags: ["--tesseract-oem"],
      apply: (output, value) => {
        if (value !== undefined) output.tesseractOem = Number(value);
      },
    },
    {
      flags: ["--render-dpi"],
      apply: (output, value) => {
        if (value !== undefined) output.renderDpi = Number(value);
      },
    },
    trueOption(["--execute"], (output) => {
      output.execute = true;
    }),
  ];
  return parseCliOptions(args, {}, options);
}

async function resolvePaths(
  args: OcrSimilarityCliArgs,
): Promise<{ ocrPlanPath: string; pageMarkdownAuditPath: string; outputPath: string }> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId =
    args.runId ?? (args.ocrPlanPath === undefined ? await latestDocsRunId(artifactRoot) : null);
  const baseDir =
    args.ocrPlanPath !== undefined
      ? dirname(args.ocrPlanPath)
      : runId === null
        ? null
        : join(artifactRoot, "docs", runId);
  if (baseDir === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }
  if (args.ocrPlanPath === undefined && runId === null) {
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
    outputPath: args.outputPath ?? join(baseDir, DEFAULT_OUTPUT_NAME),
  };
}

export async function runTier2OcrSimilarityFromCli(args: string[]): Promise<OcrSimilarityArtifact> {
  const parsed = parseCliArgs(args);
  const paths = await resolvePaths(parsed);
  return runTier2OcrSimilarity({
    ...paths,
    ...(parsed.localPageMarkdownRootName === undefined
      ? {}
      : { localPageMarkdownRootName: parsed.localPageMarkdownRootName }),
    ...(parsed.sourceIds === undefined ? {} : { sourceIds: parsed.sourceIds }),
    ...(parsed.limitSources === undefined ? {} : { limitSources: parsed.limitSources }),
    ...(parsed.limitPages === undefined ? {} : { limitPages: parsed.limitPages }),
    ...(parsed.execute === undefined ? {} : { execute: parsed.execute }),
    ...(parsed.textLayerMode === undefined ? {} : { textLayerMode: parsed.textLayerMode }),
    ...(parsed.minTextLayerChars === undefined
      ? {}
      : { minTextLayerChars: parsed.minTextLayerChars }),
    ...(parsed.tesseractLanguage === undefined
      ? {}
      : { tesseractLanguage: parsed.tesseractLanguage }),
    ...(parsed.tesseractPsm === undefined ? {} : { tesseractPsm: parsed.tesseractPsm }),
    ...(parsed.tesseractOem === undefined ? {} : { tesseractOem: parsed.tesseractOem }),
    ...(parsed.renderDpi === undefined ? {} : { renderDpi: parsed.renderDpi }),
  });
}
