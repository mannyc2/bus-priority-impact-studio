// Tier 2 captured-text → pseudo-page Markdown normalizer step, extracted from
// the former _shared.ts monolith during the per-step decomposition. Imports
// shared types, path/IO helpers, and OCR-audit shape helpers from the core
// module; the core module never imports back here, keeping the DAG acyclic.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { writeJson } from "../../../lib/json.ts";
import {
  addPageAuditIssue,
  artifactKey,
  captureManifestPath,
  emptyPageAuditIssueCounts,
  frontmatterValue,
  latestDocsRunId,
  markdownBody,
  normalizeOcrArtifactRootName,
  parseCliOptions,
  parseSourceIds,
  type CliOption,
  type Tier2CaptureManifest,
  type Tier2CapturedSource,
  type Tier2OcrPageMarkdownAudit,
  type Tier2OcrPageMarkdownAuditIssueCode,
  type Tier2OcrPageMarkdownAuditPage,
  type Tier2OcrPageMarkdownAuditSource,
  type Tier2OcrPlan,
  type Tier2OcrPlanSource,
} from "./_shared.ts";

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
    const source = eligible[index]!;
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
      const chunk = chunks[chunkIndex]!;
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
  const phase2CompatPlanPath =
    args.phase2CompatPlanPath ?? join(runRoot, "text-ocr-plan-v1.json");
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
      completePageCount: sources.reduce(
        (sum, source) => sum + source.completePageCount,
        0,
      ),
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

export async function normalizeTextMarkdownFromCli(
  args: string[],
): Promise<TextPageMarkdownAudit> {
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
