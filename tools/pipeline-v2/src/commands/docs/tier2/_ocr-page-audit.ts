// Tier 2 OCR page-Markdown audit step, extracted from the former _shared.ts
// monolith during the per-step decomposition. Holds the per-page audit
// helpers, the source summarizer, the core audit fn, and the CLI entry point.
// Imports shared types, OCR page helpers, and path/IO/CLI helpers from the core
// module; the core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import {
  type AuditTier2OcrPageMarkdownArgs,
  addPageAuditIssue,
  artifactKey,
  type CliOption,
  emptyPageAuditIssueCounts,
  latestDocsRunId,
  markdownBody,
  normalizeOcrPageMarkdownRootName,
  type OcrPageMarkdownAuditCliArgs,
  ocrPageMarkdownSourceRoot,
  ocrPlanPath,
  pageMarkdownOutputPaths,
  pageMarkdownToolResult,
  parseCliOptions,
  pdfInfoPageCount,
  runArtifactRoot,
  type Tier2OcrPageMarkdownAudit,
  type Tier2OcrPageMarkdownAuditIssueCode,
  type Tier2OcrPageMarkdownAuditPage,
  type Tier2OcrPageMarkdownAuditSource,
  type Tier2OcrPlan,
  type Tier2OcrPlanSource,
} from "./_shared.ts";

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
