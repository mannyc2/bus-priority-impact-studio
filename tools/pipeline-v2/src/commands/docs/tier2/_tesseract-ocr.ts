import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { auditTier2OcrPageMarkdown } from "./_ocr-page-audit.ts";
import {
  artifactKey,
  type CliOption,
  executableExists,
  frontmatterValue,
  latestDocsRunId,
  mapWithConcurrency,
  normalizeOcrPageMarkdownRootName,
  ocrPageMarkdownSourceRoot,
  ocrPlanPath,
  pageMarkdownOutputPaths,
  pageMarkdownToolResult,
  parseCliOptions,
  pdfInfoPageCount,
  sha256,
  type Tier2OcrPageMarkdownAudit,
  type Tier2OcrPlan,
  type Tier2OcrPlanSource,
  trueOption,
} from "./_shared.ts";

const DEFAULT_TESSERACT_PAGE_MARKDOWN_ROOT_NAME = "ocr-page-markdown-tesseract-v1";
const DEFAULT_TESSERACT_OCR_OUTPUT_NAME = "tesseract-ocr-page-markdown.json";
const DEFAULT_TESSERACT_AUDIT_OUTPUT_NAME = "tesseract-ocr-page-markdown-audit.json";
const DEFAULT_PAGE_LIMIT = 10;
const DEFAULT_PAGE_CONCURRENCY = 2;
const DEFAULT_RENDER_DPI = 220;
const DEFAULT_TEXT_LAYER_MIN_CHARS = 40;
const DEFAULT_TESSERACT_LANGUAGE = "eng";

type LocalOcrStatus = "prepared" | "ocr_complete" | "ocr_failed";
type LocalOcrTextSource = "pdf_text_layer" | "tesseract";
type TextLayerMode = "prefer" | "never";

export type LocalOcrCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type LocalOcrCommandRunner = (
  command: string,
  args: string[],
) => Promise<LocalOcrCommandResult>;

export type Tier2TesseractOcrPage = {
  pageNumber: number;
  status: LocalOcrStatus;
  reusedExisting: boolean;
  textSource: LocalOcrTextSource | null;
  inputMode: "pdf_text_layer" | "rendered_image";
  renderArtifactKey: string | null;
  renderSha256: string | null;
  inputArtifactKey: string | null;
  inputMimeType: "application/pdf" | "image/png" | null;
  inputByteLength: number;
  inputSha256: string | null;
  responseArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  markdownArtifactKey: string | null;
  errorArtifactKey: string | null;
  markdownCharCount: number;
  markdownBodyCharCount: number;
  routesMentioned: string[];
  datesMentioned: string[];
  metricHints: string[];
  error: string | null;
};

export type Tier2TesseractOcrSource = {
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
  status: LocalOcrStatus;
  reusedExistingCount: number;
  pageCount: number;
  completePageCount: number;
  failedPageCount: number;
  textLayerPageCount: number;
  tesseractPageCount: number;
  pages: Tier2TesseractOcrPage[];
  error: string | null;
};

export type Tier2TesseractOcrManifest = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrPlanPath: string;
  captureManifestPath: string;
  outputPath: string | null;
  pageMarkdownAuditPath: string | null;
  pageMarkdownRootName: string;
  engine: "local-tesseract";
  textLayerMode: TextLayerMode;
  minTextLayerChars: number;
  tesseractLanguage: string;
  tesseractPsm: number | null;
  tesseractOem: number | null;
  renderDpi: number;
  allPages: boolean;
  pageLimit: number | null;
  pageConcurrency: number;
  execute: boolean;
  summary: {
    plannedSourceCount: number;
    selectedSourceCount: number;
    preparedPageCount: number;
    completePageCount: number;
    failedPageCount: number;
    reusedExistingPageCount: number;
    textLayerPageCount: number;
    tesseractPageCount: number;
    renderedPageArtifactCount: number;
    totalInputBytes: number;
    totalMarkdownChars: number;
  };
  sources: Tier2TesseractOcrSource[];
  audit: Tier2OcrPageMarkdownAudit | null;
};

export type RunTier2TesseractOcrArgs = {
  ocrPlanPath: string;
  outputPath?: string;
  pageMarkdownAuditPath?: string;
  pageMarkdownRootName?: string;
  generatedAt?: string;
  pageRangeOverride?: string;
  allPages?: boolean;
  pageLimit?: number;
  pageConcurrency?: number;
  limit?: number;
  sourceId?: string;
  sourceIds?: string[];
  execute?: boolean;
  textLayerMode?: TextLayerMode;
  minTextLayerChars?: number;
  tesseractLanguage?: string;
  tesseractPsm?: number;
  tesseractOem?: number;
  tesseractExtraArgs?: string[];
  renderDpi?: number;
  writeAudit?: boolean;
  commandExists?: (command: string) => Promise<boolean>;
  runCommand?: LocalOcrCommandRunner;
};

type PreparedLocalOcrPage = {
  pageNumber: number;
  pageRoot: string;
  pdfPath: string;
  rawArtifactKey: string;
  rawByteLength: number;
  rawSha256: string;
};

type RenderedPng = {
  artifactPath: string;
  byteLength: number;
  sha256: string;
};

async function defaultRunCommand(command: string, args: string[]): Promise<LocalOcrCommandResult> {
  const proc = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

function memoizedCommandExists(
  commandExists: (command: string) => Promise<boolean>,
): (command: string) => Promise<boolean> {
  const cache = new Map<string, Promise<boolean>>();
  return (command) => {
    const existing = cache.get(command);
    if (existing !== undefined) return existing;
    const result = commandExists(command);
    cache.set(command, result);
    return result;
  };
}

function parsePageRange(range: string, pageCount: number): number[] {
  if (pageCount < 1) return [];
  if (range === "all") {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const selected = new Set<number>();
  for (const rawPart of range.split(",")) {
    const part = rawPart.trim();
    if (part.length === 0) continue;
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

function parseSourceIds(value: string | undefined): string[] | undefined {
  const ids = value
    ?.split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return ids === undefined || ids.length === 0 ? undefined : ids;
}

async function pdfPageCount(pdfPath: string): Promise<number> {
  const fromPdfInfo = await pdfInfoPageCount(pdfPath);
  if (fromPdfInfo !== null) return fromPdfInfo;

  const bytes = new Uint8Array(await Bun.file(pdfPath).arrayBuffer());
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdf.getPageCount();
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function usefulTextCharCount(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function textLayerIsUseful(text: string, minChars: number): boolean {
  if (usefulTextCharCount(text) >= minChars) return true;
  const wordCount = text.match(/[A-Za-z0-9]{3,}/g)?.length ?? 0;
  return wordCount >= 6;
}

async function extractPdfTextLayerPage(input: {
  pdfPath: string;
  pageNumber: number;
  commandExists: (command: string) => Promise<boolean>;
  runCommand: LocalOcrCommandRunner;
}): Promise<string | null> {
  if (!(await input.commandExists("pdftotext"))) return null;
  const result = await input.runCommand("pdftotext", [
    "-f",
    String(input.pageNumber),
    "-l",
    String(input.pageNumber),
    "-layout",
    "-nopgbrk",
    input.pdfPath,
    "-",
  ]);
  if (result.exitCode !== 0) return null;
  const text = normalizeExtractedText(result.stdout);
  return text.length === 0 ? null : text;
}

function contiguousPageRuns(pageNumbers: number[]): Array<{ start: number; end: number }> {
  const sorted = [...new Set(pageNumbers)].toSorted((left, right) => left - right);
  const runs: Array<{ start: number; end: number }> = [];
  for (const pageNumber of sorted) {
    const last = runs.at(-1);
    if (last !== undefined && pageNumber === last.end + 1) {
      last.end = pageNumber;
      continue;
    }
    runs.push({ start: pageNumber, end: pageNumber });
  }
  return runs;
}

function renderedPngPageNumber(fileName: string, prefixBaseName: string): number | null {
  if (!fileName.startsWith(`${prefixBaseName}-`) || !fileName.endsWith(".png")) return null;
  const suffix = fileName.slice(prefixBaseName.length + 1, -".png".length);
  const match = suffix.match(/(\d+)$/);
  if (match?.[1] === undefined) return null;
  return Number(match[1]);
}

async function readRenderedPngForPage(
  outputDir: string,
  prefix: string,
  pageNumber: number,
): Promise<RenderedPng | null> {
  const prefixBaseName = basename(prefix);
  const outputNames = (await readdir(outputDir).catch(() => []))
    .filter((name) => renderedPngPageNumber(name, prefixBaseName) === pageNumber)
    .toSorted();
  const outputName = outputNames[0];
  if (outputName === undefined) return null;
  const outputPath = join(outputDir, outputName);
  const bytes = new Uint8Array(await Bun.file(outputPath).arrayBuffer());
  if (bytes.byteLength === 0) return null;
  return {
    artifactPath: outputPath,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

async function readRenderedPngsForPages(input: {
  outputDir: string;
  prefix: string;
  pageNumbers: number[];
}): Promise<Map<number, RenderedPng>> {
  const rendered = new Map<number, RenderedPng>();
  await Promise.all(
    input.pageNumbers.map(async (pageNumber) => {
      const page = await readRenderedPngForPage(input.outputDir, input.prefix, pageNumber);
      if (page !== null) rendered.set(pageNumber, page);
    }),
  );
  return rendered;
}

async function renderPdfPagesToPng(input: {
  pdfPath: string;
  outputDir: string;
  pageNumbers: number[];
  dpi: number;
  commandExists: (command: string) => Promise<boolean>;
  runCommand: LocalOcrCommandRunner;
}): Promise<Map<number, RenderedPng>> {
  await mkdir(input.outputDir, { recursive: true });
  const prefix = join(input.outputDir, `pages-dpi-${String(input.dpi)}`);
  const requested = [...new Set(input.pageNumbers)].toSorted((left, right) => left - right);
  const rendered = await readRenderedPngsForPages({
    outputDir: input.outputDir,
    prefix,
    pageNumbers: requested,
  });
  const missing = requested.filter((pageNumber) => !rendered.has(pageNumber));
  if (missing.length === 0) return rendered;

  if (!(await input.commandExists("pdftoppm"))) {
    throw new Error(
      "pdftoppm binary not found. Install Poppler (poppler-utils) to render PDF pages for Tesseract.",
    );
  }

  for (const run of contiguousPageRuns(missing)) {
    const result = await input.runCommand("pdftoppm", [
      "-f",
      String(run.start),
      "-l",
      String(run.end),
      "-r",
      String(input.dpi),
      "-png",
      input.pdfPath,
      prefix,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`pdftoppm failed for pages ${run.start}-${run.end}: ${result.stderr.trim()}`);
    }
  }

  const afterRender = await readRenderedPngsForPages({
    outputDir: input.outputDir,
    prefix,
    pageNumbers: requested,
  });
  const stillMissing = requested.filter((pageNumber) => !afterRender.has(pageNumber));
  if (stillMissing.length > 0) {
    throw new Error(`pdftoppm did not produce PNGs for pages ${stillMissing.join(",")}.`);
  }
  return afterRender;
}

async function runTesseract(input: {
  imagePath: string;
  language: string;
  psm: number | null;
  oem: number | null;
  extraArgs: string[];
  commandExists: (command: string) => Promise<boolean>;
  runCommand: LocalOcrCommandRunner;
}): Promise<string> {
  if (!(await input.commandExists("tesseract"))) {
    throw new Error(
      "tesseract binary not found. Install Tesseract OCR before running scanned-PDF OCR.",
    );
  }
  const args = [input.imagePath, "stdout", "-l", input.language];
  if (input.psm !== null) args.push("--psm", String(input.psm));
  if (input.oem !== null) args.push("--oem", String(input.oem));
  args.push(...input.extraArgs);

  const result = await input.runCommand("tesseract", args);
  if (result.exitCode !== 0) {
    throw new Error(`tesseract failed: ${result.stderr.trim()}`);
  }
  const text = normalizeExtractedText(result.stdout);
  if (text.length === 0) {
    throw new Error("tesseract returned no readable text.");
  }
  return text;
}

function uniqueStrings(values: Iterable<string>, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function extractRouteHints(text: string): string[] {
  const matches = text.matchAll(
    /\b(?:Bx\d{1,2}[A-Z]?|BM\d{1,2}|QM\d{1,2}|SIM\d{1,2}|[BMQS]\d{1,3}[A-Z]?)\b/g,
  );
  return uniqueStrings(
    Array.from(matches, (match) => match[0].replace(/\s+/g, "")),
    50,
  );
}

function extractDateHints(text: string): string[] {
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
  return uniqueStrings(
    patterns.flatMap((pattern) => Array.from(text.matchAll(pattern), (m) => m[0])),
    50,
  );
}

function extractMetricHints(text: string): string[] {
  const matches = text.matchAll(
    /\b\d+(?:\.\d+)?\s*(?:%|mph|minutes?|mins?|seconds?|secs?|riders?|passengers?|buses per hour|bus lanes?|miles?)\b/gi,
  );
  return uniqueStrings(
    Array.from(matches, (match) => match[0]),
    50,
  );
}

function localToolCall(input: {
  sourceId: string;
  pageNumber: number;
  markdown: string;
}): ReturnType<typeof pageMarkdownToolResult> {
  return {
    sourceId: input.sourceId,
    pageNumber: input.pageNumber,
    markdown: input.markdown,
    routesMentioned: extractRouteHints(input.markdown),
    corridorsMentioned: [],
    datesMentioned: extractDateHints(input.markdown),
    metricHints: extractMetricHints(input.markdown),
    containsTables: false,
    containsMaps: false,
    containsCharts: false,
    visualReviewHints: [],
  };
}

export function buildTesseractPageMarkdown(input: {
  source: Tier2OcrPlanSource;
  pageNumber: number;
  pdfPageCount: number;
  generatedAt: string;
  textSource: LocalOcrTextSource;
  markdown: string;
  rawArtifactKey: string;
  inputArtifactKey: string | null;
  inputSha256: string | null;
  renderArtifactKey: string | null;
  renderSha256: string | null;
  tesseractLanguage: string;
  tesseractPsm: number | null;
  tesseractOem: number | null;
  renderDpi: number;
  toolCall: ReturnType<typeof pageMarkdownToolResult>;
}): string {
  const frontmatter: Record<string, unknown> = {
    sourceId: input.source.sourceId,
    title: input.source.title,
    publisher: input.source.publisher,
    sourceGroup: input.source.sourceGroup,
    sourceUrl: input.source.sourceUrl,
    finalUrl: input.source.finalUrl,
    rawArtifactKey: input.rawArtifactKey,
    pageNumber: input.pageNumber,
    pdfPageCount: input.pdfPageCount,
    generatedAt: input.generatedAt,
    ocrProvider: "local",
    ocrModel: "tesseract",
    ocrEngine: "tesseract",
    textSource: input.textSource,
    textLayerEngine: input.textSource === "pdf_text_layer" ? "poppler-pdftotext" : null,
    renderEngine: input.renderArtifactKey === null ? null : "poppler-pdftoppm",
    renderDpi: input.renderArtifactKey === null ? null : input.renderDpi,
    tesseractLanguage: input.textSource === "tesseract" ? input.tesseractLanguage : null,
    tesseractPsm: input.textSource === "tesseract" ? input.tesseractPsm : null,
    tesseractOem: input.textSource === "tesseract" ? input.tesseractOem : null,
    promptVersion: null,
    inputMode: input.textSource === "pdf_text_layer" ? "pdf_text_layer" : "rendered_image",
    inputArtifactKey: input.inputArtifactKey,
    inputSha256: input.inputSha256,
    renderArtifactKey: input.renderArtifactKey,
    renderSha256: input.renderSha256,
    containsTables: input.toolCall.containsTables,
    containsMaps: input.toolCall.containsMaps,
    containsCharts: input.toolCall.containsCharts,
    routesMentioned: input.toolCall.routesMentioned,
    corridorsMentioned: input.toolCall.corridorsMentioned,
    datesMentioned: input.toolCall.datesMentioned,
    metricHints: input.toolCall.metricHints,
    visualReviewHints: input.toolCall.visualReviewHints,
  };
  return [
    "---",
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${frontmatterValue(value)}`),
    "---",
    "",
    input.markdown.trim(),
    "",
  ].join("\n");
}

async function readExistingLocalPage(input: {
  pageRoot: string;
  runRoot: string;
  pageNumber: number;
}): Promise<Pick<
  Tier2TesseractOcrPage,
  | "responseArtifactKey"
  | "toolCallArtifactKey"
  | "markdownArtifactKey"
  | "markdownCharCount"
  | "markdownBodyCharCount"
  | "routesMentioned"
  | "datesMentioned"
  | "metricHints"
> | null> {
  const paths = pageMarkdownOutputPaths(input.pageRoot);
  const [responseExists, toolCallExists, markdownExists] = await Promise.all([
    Bun.file(paths.responsePath).exists(),
    Bun.file(paths.toolCallPath).exists(),
    Bun.file(paths.markdownPath).exists(),
  ]);
  if (!responseExists || !toolCallExists || !markdownExists) return null;

  const responseBody = await Bun.file(paths.responsePath)
    .json()
    .catch(() => null);
  if (responseBody === null || (responseBody as { error?: unknown }).error !== undefined) {
    return null;
  }
  const toolCallJson = await Bun.file(paths.toolCallPath)
    .json()
    .catch(() => null);
  if (toolCallJson === null) return null;
  let toolCall: ReturnType<typeof pageMarkdownToolResult>;
  try {
    toolCall = pageMarkdownToolResult(toolCallJson);
  } catch {
    return null;
  }
  if (toolCall.pageNumber !== input.pageNumber) return null;
  const markdown = await Bun.file(paths.markdownPath).text();
  if (markdown.trim().length === 0) return null;
  return {
    responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
    toolCallArtifactKey: artifactKey(paths.toolCallPath, input.runRoot),
    markdownArtifactKey: artifactKey(paths.markdownPath, input.runRoot),
    markdownCharCount: markdown.length,
    markdownBodyCharCount: toolCall.markdown.trim().length,
    routesMentioned: toolCall.routesMentioned,
    datesMentioned: toolCall.datesMentioned,
    metricHints: toolCall.metricHints,
  };
}

async function writeSuccessfulPage(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  page: PreparedLocalOcrPage;
  pdfPageCount: number;
  generatedAt: string;
  textSource: LocalOcrTextSource;
  markdown: string;
  inputArtifactKey: string | null;
  inputMimeType: "application/pdf" | "image/png";
  inputByteLength: number;
  inputSha256: string | null;
  renderArtifactKey: string | null;
  renderSha256: string | null;
  tesseractLanguage: string;
  tesseractPsm: number | null;
  tesseractOem: number | null;
  renderDpi: number;
}): Promise<Tier2TesseractOcrPage> {
  const paths = pageMarkdownOutputPaths(input.page.pageRoot);
  const toolCall = localToolCall({
    sourceId: input.source.sourceId,
    pageNumber: input.page.pageNumber,
    markdown: input.markdown,
  });
  const pageMarkdown = buildTesseractPageMarkdown({
    source: input.source,
    pageNumber: input.page.pageNumber,
    pdfPageCount: input.pdfPageCount,
    generatedAt: input.generatedAt,
    textSource: input.textSource,
    markdown: input.markdown,
    rawArtifactKey: input.page.rawArtifactKey,
    inputArtifactKey: input.inputArtifactKey,
    inputSha256: input.inputSha256,
    renderArtifactKey: input.renderArtifactKey,
    renderSha256: input.renderSha256,
    tesseractLanguage: input.tesseractLanguage,
    tesseractPsm: input.tesseractPsm,
    tesseractOem: input.tesseractOem,
    renderDpi: input.renderDpi,
    toolCall,
  });
  await writeJson(paths.responsePath, {
    provider: "local",
    engine: "tesseract",
    textSource: input.textSource,
    generatedAt: input.generatedAt,
  });
  await writeJson(paths.toolCallPath, toolCall);
  await Bun.write(paths.markdownPath, pageMarkdown);

  return {
    pageNumber: input.page.pageNumber,
    status: "ocr_complete",
    reusedExisting: false,
    textSource: input.textSource,
    inputMode: input.textSource === "pdf_text_layer" ? "pdf_text_layer" : "rendered_image",
    renderArtifactKey: input.renderArtifactKey,
    renderSha256: input.renderSha256,
    inputArtifactKey: input.inputArtifactKey,
    inputMimeType: input.inputMimeType,
    inputByteLength: input.inputByteLength,
    inputSha256: input.inputSha256,
    responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
    toolCallArtifactKey: artifactKey(paths.toolCallPath, input.runRoot),
    markdownArtifactKey: artifactKey(paths.markdownPath, input.runRoot),
    errorArtifactKey: null,
    markdownCharCount: pageMarkdown.length,
    markdownBodyCharCount: input.markdown.trim().length,
    routesMentioned: toolCall.routesMentioned,
    datesMentioned: toolCall.datesMentioned,
    metricHints: toolCall.metricHints,
    error: null,
  };
}

async function writeFailedPage(input: {
  runRoot: string;
  page: PreparedLocalOcrPage;
  error: string;
}): Promise<Tier2TesseractOcrPage> {
  const paths = pageMarkdownOutputPaths(input.page.pageRoot);
  await writeJson(paths.errorPath, {
    pageNumber: input.page.pageNumber,
    error: input.error,
  });
  return {
    pageNumber: input.page.pageNumber,
    status: "ocr_failed",
    reusedExisting: false,
    textSource: null,
    inputMode: "rendered_image",
    renderArtifactKey: null,
    renderSha256: null,
    inputArtifactKey: null,
    inputMimeType: null,
    inputByteLength: 0,
    inputSha256: null,
    responseArtifactKey: null,
    toolCallArtifactKey: null,
    markdownArtifactKey: null,
    errorArtifactKey: artifactKey(paths.errorPath, input.runRoot),
    markdownCharCount: 0,
    markdownBodyCharCount: 0,
    routesMentioned: [],
    datesMentioned: [],
    metricHints: [],
    error: input.error,
  };
}

function preparedPageResult(input: { page: PreparedLocalOcrPage }): Tier2TesseractOcrPage {
  return {
    pageNumber: input.page.pageNumber,
    status: "prepared",
    reusedExisting: false,
    textSource: null,
    inputMode: "pdf_text_layer",
    renderArtifactKey: null,
    renderSha256: null,
    inputArtifactKey: input.page.rawArtifactKey,
    inputMimeType: "application/pdf",
    inputByteLength: input.page.rawByteLength,
    inputSha256: input.page.rawSha256,
    responseArtifactKey: null,
    toolCallArtifactKey: null,
    markdownArtifactKey: null,
    errorArtifactKey: null,
    markdownCharCount: 0,
    markdownBodyCharCount: 0,
    routesMentioned: [],
    datesMentioned: [],
    metricHints: [],
    error: null,
  };
}

function existingPageResult(input: {
  existing: NonNullable<Awaited<ReturnType<typeof readExistingLocalPage>>>;
  page: PreparedLocalOcrPage;
}): Tier2TesseractOcrPage {
  return {
    pageNumber: input.page.pageNumber,
    status: "ocr_complete",
    reusedExisting: true,
    textSource: null,
    inputMode: "pdf_text_layer",
    renderArtifactKey: null,
    renderSha256: null,
    inputArtifactKey: null,
    inputMimeType: null,
    inputByteLength: 0,
    inputSha256: null,
    errorArtifactKey: null,
    error: null,
    ...input.existing,
  };
}

async function tryWriteTextLayerPage(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  page: PreparedLocalOcrPage;
  pdfPageCount: number;
  generatedAt: string;
  minTextLayerChars: number;
  tesseractLanguage: string;
  tesseractPsm: number | null;
  tesseractOem: number | null;
  renderDpi: number;
  commandExists: (command: string) => Promise<boolean>;
  runCommand: LocalOcrCommandRunner;
}): Promise<Tier2TesseractOcrPage | null> {
  const textLayer = await extractPdfTextLayerPage({
    pdfPath: input.page.pdfPath,
    pageNumber: input.page.pageNumber,
    commandExists: input.commandExists,
    runCommand: input.runCommand,
  });
  if (textLayer === null || !textLayerIsUseful(textLayer, input.minTextLayerChars)) return null;
  return writeSuccessfulPage({
    runRoot: input.runRoot,
    source: input.source,
    page: input.page,
    pdfPageCount: input.pdfPageCount,
    generatedAt: input.generatedAt,
    textSource: "pdf_text_layer",
    markdown: textLayer,
    inputArtifactKey: input.page.rawArtifactKey,
    inputMimeType: "application/pdf",
    inputByteLength: input.page.rawByteLength,
    inputSha256: input.page.rawSha256,
    renderArtifactKey: null,
    renderSha256: null,
    tesseractLanguage: input.tesseractLanguage,
    tesseractPsm: input.tesseractPsm,
    tesseractOem: input.tesseractOem,
    renderDpi: input.renderDpi,
  });
}

async function processRenderedTesseractPage(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  page: PreparedLocalOcrPage;
  pdfPageCount: number;
  generatedAt: string;
  rendered: RenderedPng | null;
  tesseractLanguage: string;
  tesseractPsm: number | null;
  tesseractOem: number | null;
  tesseractExtraArgs: string[];
  renderDpi: number;
  commandExists: (command: string) => Promise<boolean>;
  runCommand: LocalOcrCommandRunner;
}): Promise<Tier2TesseractOcrPage> {
  try {
    if (input.rendered === null) {
      throw new Error(`No rendered PNG available for page ${input.page.pageNumber}.`);
    }
    const text = await runTesseract({
      imagePath: input.rendered.artifactPath,
      language: input.tesseractLanguage,
      psm: input.tesseractPsm,
      oem: input.tesseractOem,
      extraArgs: input.tesseractExtraArgs,
      commandExists: input.commandExists,
      runCommand: input.runCommand,
    });
    return writeSuccessfulPage({
      runRoot: input.runRoot,
      source: input.source,
      page: input.page,
      pdfPageCount: input.pdfPageCount,
      generatedAt: input.generatedAt,
      textSource: "tesseract",
      markdown: text,
      inputArtifactKey: artifactKey(input.rendered.artifactPath, input.runRoot),
      inputMimeType: "image/png",
      inputByteLength: input.rendered.byteLength,
      inputSha256: input.rendered.sha256,
      renderArtifactKey: artifactKey(input.rendered.artifactPath, input.runRoot),
      renderSha256: input.rendered.sha256,
      tesseractLanguage: input.tesseractLanguage,
      tesseractPsm: input.tesseractPsm,
      tesseractOem: input.tesseractOem,
      renderDpi: input.renderDpi,
    });
  } catch (error) {
    return writeFailedPage({
      runRoot: input.runRoot,
      page: input.page,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function processSource(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  pageMarkdownRootName: string;
  pageLimit: number | null;
  allPages: boolean;
  pageRangeOverride: string | undefined;
  pageConcurrency: number;
  generatedAt: string;
  execute: boolean;
  textLayerMode: TextLayerMode;
  minTextLayerChars: number;
  tesseractLanguage: string;
  tesseractPsm: number | null;
  tesseractOem: number | null;
  tesseractExtraArgs: string[];
  renderDpi: number;
  commandExists: (command: string) => Promise<boolean>;
  runCommand: LocalOcrCommandRunner;
}): Promise<Tier2TesseractOcrSource> {
  try {
    const pdfPath = join(input.runRoot, input.source.rawArtifactKey);
    const pdfPageCountValue = await pdfPageCount(pdfPath);
    const selectedPageIndexes = input.allPages
      ? parsePageRange("all", pdfPageCountValue)
      : parsePageRange(input.pageRangeOverride ?? input.source.pageRange, pdfPageCountValue).slice(
          0,
          input.pageLimit ?? DEFAULT_PAGE_LIMIT,
        );
    if (selectedPageIndexes.length === 0) {
      throw new Error(`No pages selected for ${input.source.sourceId}.`);
    }
    const sourceRoot = ocrPageMarkdownSourceRoot({
      runRoot: input.runRoot,
      source: input.source,
      sourceIndex: input.sourceIndex,
      pageMarkdownRootName: input.pageMarkdownRootName,
    });
    const preparedPages = selectedPageIndexes.map((pageIndex): PreparedLocalOcrPage => {
      const pageNumber = pageIndex + 1;
      return {
        pageNumber,
        pageRoot: join(sourceRoot, "pages", String(pageNumber).padStart(4, "0")),
        pdfPath,
        rawArtifactKey: input.source.rawArtifactKey,
        rawByteLength: input.source.byteLength,
        rawSha256: input.source.sha256,
      };
    });

    let pages: Tier2TesseractOcrPage[];
    if (!input.execute) {
      pages = preparedPages.map((page) => preparedPageResult({ page }));
    } else {
      const pagesByNumber = new Map<number, Tier2TesseractOcrPage>();
      const existingChecks = await mapWithConcurrency(
        preparedPages,
        input.pageConcurrency,
        async (page) => {
          await mkdir(page.pageRoot, { recursive: true });
          const existing = await readExistingLocalPage({
            pageRoot: page.pageRoot,
            runRoot: input.runRoot,
            pageNumber: page.pageNumber,
          });
          return { page, existing };
        },
      );
      const pendingPages: PreparedLocalOcrPage[] = [];
      for (const checked of existingChecks) {
        if (checked.existing === null) {
          pendingPages.push(checked.page);
          continue;
        }
        pagesByNumber.set(
          checked.page.pageNumber,
          existingPageResult({ page: checked.page, existing: checked.existing }),
        );
      }

      const tesseractPages: PreparedLocalOcrPage[] = [];
      if (input.textLayerMode === "prefer") {
        const textLayerResults = await mapWithConcurrency(
          pendingPages,
          input.pageConcurrency,
          async (page) => {
            try {
              return {
                page,
                result: await tryWriteTextLayerPage({
                  runRoot: input.runRoot,
                  source: input.source,
                  page,
                  pdfPageCount: pdfPageCountValue,
                  generatedAt: input.generatedAt,
                  minTextLayerChars: input.minTextLayerChars,
                  tesseractLanguage: input.tesseractLanguage,
                  tesseractPsm: input.tesseractPsm,
                  tesseractOem: input.tesseractOem,
                  renderDpi: input.renderDpi,
                  commandExists: input.commandExists,
                  runCommand: input.runCommand,
                }),
              };
            } catch (error) {
              return {
                page,
                result: await writeFailedPage({
                  runRoot: input.runRoot,
                  page,
                  error: error instanceof Error ? error.message : String(error),
                }),
              };
            }
          },
        );
        for (const textLayerResult of textLayerResults) {
          if (textLayerResult.result === null) {
            tesseractPages.push(textLayerResult.page);
            continue;
          }
          pagesByNumber.set(textLayerResult.page.pageNumber, textLayerResult.result);
        }
      } else {
        tesseractPages.push(...pendingPages);
      }

      if (tesseractPages.length > 0) {
        const renderOutputDir = join(sourceRoot, "rendered-pages", `dpi-${input.renderDpi}`);
        let renderedPages: Map<number, RenderedPng> | null = null;
        let renderError: string | null = null;
        try {
          renderedPages = await renderPdfPagesToPng({
            pdfPath,
            outputDir: renderOutputDir,
            pageNumbers: tesseractPages.map((page) => page.pageNumber),
            dpi: input.renderDpi,
            commandExists: input.commandExists,
            runCommand: input.runCommand,
          });
        } catch (error) {
          renderError = error instanceof Error ? error.message : String(error);
        }

        if (renderedPages === null) {
          await Promise.all(
            tesseractPages.map(async (page) => {
              pagesByNumber.set(
                page.pageNumber,
                await writeFailedPage({
                  runRoot: input.runRoot,
                  page,
                  error: renderError ?? "PDF page rendering failed.",
                }),
              );
            }),
          );
        } else {
          const tesseractResults = await mapWithConcurrency(
            tesseractPages,
            input.pageConcurrency,
            async (page) =>
              processRenderedTesseractPage({
                runRoot: input.runRoot,
                source: input.source,
                page,
                pdfPageCount: pdfPageCountValue,
                generatedAt: input.generatedAt,
                rendered: renderedPages.get(page.pageNumber) ?? null,
                tesseractLanguage: input.tesseractLanguage,
                tesseractPsm: input.tesseractPsm,
                tesseractOem: input.tesseractOem,
                tesseractExtraArgs: input.tesseractExtraArgs,
                renderDpi: input.renderDpi,
                commandExists: input.commandExists,
                runCommand: input.runCommand,
              }),
          );
          for (const result of tesseractResults) {
            pagesByNumber.set(result.pageNumber, result);
          }
        }
      }

      pages = preparedPages.map((page) => {
        const result = pagesByNumber.get(page.pageNumber);
        if (result === undefined) {
          throw new Error(`Internal local OCR result missing for page ${page.pageNumber}.`);
        }
        return result;
      });
    }

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
      pdfPageCount: pdfPageCountValue,
      selectedPageCount: selectedPageIndexes.length,
      selectedPages: selectedPageIndexes.map((pageIndex) => pageIndex + 1),
      status,
      reusedExistingCount: pages.filter((page) => page.reusedExisting).length,
      pageCount: pages.length,
      completePageCount,
      failedPageCount,
      textLayerPageCount: pages.filter((page) => page.textSource === "pdf_text_layer").length,
      tesseractPageCount: pages.filter((page) => page.textSource === "tesseract").length,
      pages,
      error: failedPageCount === pages.length ? "All selected pages failed local OCR." : null,
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
      completePageCount: 0,
      failedPageCount: 0,
      textLayerPageCount: 0,
      tesseractPageCount: 0,
      pages: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function positiveInteger(value: number | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return value;
}

function nonNegativeInteger(value: number | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${flag} must be a non-negative integer.`);
  }
  return value;
}

export async function runTier2TesseractOcr(
  args: RunTier2TesseractOcrArgs,
): Promise<Tier2TesseractOcrManifest> {
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const runRoot = dirname(plan.captureManifestPath);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const pageMarkdownRootName = normalizeOcrPageMarkdownRootName(
    args.pageMarkdownRootName ?? DEFAULT_TESSERACT_PAGE_MARKDOWN_ROOT_NAME,
  );
  const allPages = args.allPages ?? false;
  const pageLimit = allPages
    ? null
    : (positiveInteger(args.pageLimit, "--page-limit") ?? DEFAULT_PAGE_LIMIT);
  const pageConcurrency =
    positiveInteger(args.pageConcurrency, "--page-concurrency") ?? DEFAULT_PAGE_CONCURRENCY;
  const limit = positiveInteger(args.limit, "--limit") ?? 1;
  const renderDpi = positiveInteger(args.renderDpi, "--render-dpi") ?? DEFAULT_RENDER_DPI;
  const minTextLayerChars =
    nonNegativeInteger(args.minTextLayerChars, "--min-text-layer-chars") ??
    DEFAULT_TEXT_LAYER_MIN_CHARS;
  const tesseractPsm = nonNegativeInteger(args.tesseractPsm, "--tesseract-psm") ?? null;
  const tesseractOem = nonNegativeInteger(args.tesseractOem, "--tesseract-oem") ?? null;
  const textLayerMode = args.textLayerMode ?? "prefer";
  const sourceIds = new Set([...(args.sourceIds ?? []), ...(args.sourceId ? [args.sourceId] : [])]);
  const selectedSources = plan.sources
    .map((source, sourceIndex) => ({ source, sourceIndex }))
    .filter(({ source }) => sourceIds.size === 0 || sourceIds.has(source.sourceId))
    .slice(0, limit);
  const commandExists = memoizedCommandExists(args.commandExists ?? executableExists);
  const runCommand = args.runCommand ?? defaultRunCommand;
  const execute = args.execute ?? false;

  const sources: Tier2TesseractOcrSource[] = [];
  for (const selected of selectedSources) {
    sources.push(
      await processSource({
        runRoot,
        source: selected.source,
        sourceIndex: selected.sourceIndex,
        pageMarkdownRootName,
        pageLimit,
        allPages,
        pageRangeOverride: args.pageRangeOverride,
        pageConcurrency,
        generatedAt,
        execute,
        textLayerMode,
        minTextLayerChars,
        tesseractLanguage: args.tesseractLanguage ?? DEFAULT_TESSERACT_LANGUAGE,
        tesseractPsm,
        tesseractOem,
        tesseractExtraArgs: args.tesseractExtraArgs ?? [],
        renderDpi,
        commandExists,
        runCommand,
      }),
    );
  }

  const pages = sources.flatMap((source) => source.pages);
  const auditPath =
    args.pageMarkdownAuditPath ??
    ((args.execute ?? false) && (args.writeAudit ?? true)
      ? join(dirname(args.ocrPlanPath), DEFAULT_TESSERACT_AUDIT_OUTPUT_NAME)
      : undefined);
  const audit =
    execute && auditPath !== undefined
      ? await auditTier2OcrPageMarkdown({
          ocrPlanPath: args.ocrPlanPath,
          outputPath: auditPath,
          generatedAt,
          pageMarkdownRootName,
        })
      : null;

  const manifest: Tier2TesseractOcrManifest = {
    version: 1,
    runId: plan.runId,
    generatedAt,
    ocrPlanPath: args.ocrPlanPath,
    captureManifestPath: plan.captureManifestPath,
    outputPath: args.outputPath ?? null,
    pageMarkdownAuditPath: auditPath ?? null,
    pageMarkdownRootName,
    engine: "local-tesseract",
    textLayerMode,
    minTextLayerChars,
    tesseractLanguage: args.tesseractLanguage ?? DEFAULT_TESSERACT_LANGUAGE,
    tesseractPsm,
    tesseractOem,
    renderDpi,
    allPages,
    pageLimit,
    pageConcurrency,
    execute,
    summary: {
      plannedSourceCount: plan.sources.length,
      selectedSourceCount: selectedSources.length,
      preparedPageCount: pages.filter((page) => page.status === "prepared").length,
      completePageCount: pages.filter((page) => page.status === "ocr_complete").length,
      failedPageCount: pages.filter((page) => page.status === "ocr_failed").length,
      reusedExistingPageCount: pages.filter((page) => page.reusedExisting).length,
      textLayerPageCount: pages.filter((page) => page.textSource === "pdf_text_layer").length,
      tesseractPageCount: pages.filter((page) => page.textSource === "tesseract").length,
      renderedPageArtifactCount: pages.filter((page) => page.renderArtifactKey !== null).length,
      totalInputBytes: pages.reduce((sum, page) => sum + page.inputByteLength, 0),
      totalMarkdownChars: pages.reduce((sum, page) => sum + page.markdownCharCount, 0),
    },
    sources,
    audit,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, manifest);
  }

  return manifest;
}

type TesseractOcrCliArgs = {
  ocrPlanPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  pageMarkdownAuditPath?: string;
  pageMarkdownRootName?: string;
  pageRangeOverride?: string;
  allPages?: boolean;
  pageLimit?: number;
  pageConcurrency?: number;
  limit?: number;
  sourceId?: string;
  sourceIds?: string[];
  execute?: boolean;
  textLayerMode?: TextLayerMode;
  minTextLayerChars?: number;
  tesseractLanguage?: string;
  tesseractPsm?: number;
  tesseractOem?: number;
  renderDpi?: number;
};

function parseTextLayerMode(value: string | undefined): TextLayerMode {
  if (value === "prefer" || value === "never") return value;
  throw new Error("--text-layer-mode must be prefer or never.");
}

function parseTesseractOcrCliArgs(args: string[]): TesseractOcrCliArgs {
  const options: CliOption<TesseractOcrCliArgs>[] = [
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
      flags: ["--page-markdown-audit"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownAuditPath = fromCliPath(value);
      },
    },
    {
      flags: ["--page-markdown-root", "--page-markdown-root-name"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownRootName = value;
      },
    },
    {
      flags: ["--page-range"],
      apply: (output, value) => {
        if (value !== undefined) output.pageRangeOverride = value;
      },
    },
    {
      flags: ["--page-limit"],
      apply: (output, value) => {
        if (value !== undefined) output.pageLimit = Number(value);
      },
    },
    {
      flags: ["--page-concurrency"],
      apply: (output, value) => {
        if (value !== undefined) output.pageConcurrency = Number(value);
      },
    },
    {
      flags: ["--limit"],
      apply: (output, value) => {
        if (value !== undefined) output.limit = Number(value);
      },
    },
    {
      flags: ["--source-id"],
      apply: (output, value) => {
        if (value !== undefined) output.sourceId = value;
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
    trueOption(["--all-pages"], (output) => {
      output.allPages = true;
    }),
    trueOption(["--execute"], (output) => {
      output.execute = true;
    }),
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveTesseractOcrPlanPath(args: TesseractOcrCliArgs): Promise<string> {
  if (args.ocrPlanPath !== undefined) return args.ocrPlanPath;
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }
  return ocrPlanPath(artifactRoot, runId);
}

export async function runTier2TesseractOcrFromCli(
  args: string[],
): Promise<Tier2TesseractOcrManifest> {
  const parsed = parseTesseractOcrCliArgs(args);
  const {
    artifactRoot: _artifactRoot,
    runId: _runId,
    ocrPlanPath: _ocrPlanFlag,
    outputPath,
    ...rest
  } = parsed;
  const resolvedOcrPlanPath = await resolveTesseractOcrPlanPath(parsed);
  return runTier2TesseractOcr({
    ...rest,
    ocrPlanPath: resolvedOcrPlanPath,
    outputPath: outputPath ?? join(dirname(resolvedOcrPlanPath), DEFAULT_TESSERACT_OCR_OUTPUT_NAME),
  });
}
