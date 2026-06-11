// Tier 2 OCR page-Markdown renderer step, extracted from the former _shared.ts
// monolith during the per-step decomposition. Holds the PDF→PNG render path,
// the OpenRouter page-OCR client wrapper (`callOpenRouterPageMarkdownOcr`, kept
// exported for the request-shape snapshot oracle), the prompt/tool builders,
// per-page/per-source transcription, and the `ocrTier2PageMarkdown` entry point.
// Imports the OpenRouter HTTP client from `_llm-clients.ts` and shared types,
// JSON/markdown helpers, OCR path helpers, and tool-name/model constants from
// the core module; the core module never imports back here at runtime.
import { Buffer } from "node:buffer";
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import {
  callOpenRouterToolCallViaPi,
  callPioneerToolCallDirect,
  openRouterErrorMessage,
  postOpenRouterChatCompletions,
  servedServiceTier,
} from "./_llm-clients.ts";
import {
  artifactKey,
  type CliOption,
  DEFAULT_OCR_MAX_TOKENS,
  DEFAULT_OCR_MODEL,
  defaultFetch,
  executableExists,
  extractToolCallArguments,
  type FetchLike,
  frontmatterValue,
  latestDocsRunId,
  mapWithConcurrency,
  normalizeOcrPageMarkdownRootName,
  OCR_PAGE_MARKDOWN_TOOL_NAME,
  type OcrTier2PageMarkdownArgs,
  ocrPageMarkdownSourceRoot,
  ocrPlanPath,
  pageMarkdownOutputPaths,
  pageMarkdownToolResult,
  parseCliOptions,
  pdfInfoPageCount,
  sha256,
  type Tier2OcrPageInputPreference,
  type Tier2OcrPageMarkdownManifest,
  type Tier2OcrPageMarkdownPage,
  type Tier2OcrPageMarkdownSource,
  type Tier2OcrPlan,
  type Tier2OcrPlanSource,
  trueOption,
} from "./_shared.ts";

const OCR_PAGE_MARKDOWN_PROMPT_VERSION = "page-markdown-v4";

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

async function renderPdfPageToPng(input: {
  pdfPath: string;
  outputDir: string;
  pageNumber: number;
  renderPageNumber: number;
}): Promise<{ artifactPath: string; byteLength: number; sha256: string } | null> {
  const prefix = join(input.outputDir, `page-${String(input.pageNumber).padStart(4, "0")}-render`);
  const existing = await readRenderedPng(input.outputDir, prefix);
  if (existing !== null) {
    return existing;
  }
  if (!(await executableExists("pdftoppm"))) {
    return null;
  }
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
  const rendered = await readRenderedPng(input.outputDir, prefix);
  if (rendered === null) {
    throw new Error(`pdftoppm did not produce a PNG for page ${input.pageNumber}.`);
  }
  return rendered;
}

async function readRenderedPng(
  outputDir: string,
  prefix: string,
): Promise<{ artifactPath: string; byteLength: number; sha256: string } | null> {
  const outputNames = (await readdir(outputDir)).filter(
    (name) => name.startsWith(`${basename(prefix)}-`) && name.endsWith(".png"),
  );
  const outputName = outputNames.length === 1 ? outputNames[0] : undefined;
  const outputPath = outputName === undefined ? null : join(outputDir, outputName);
  if (outputPath === null) {
    return null;
  }
  const bytes = new Uint8Array(await Bun.file(outputPath).arrayBuffer());
  if (bytes.byteLength === 0) {
    return null;
  }
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
    "Image placeholders must be brief alt text only; do not add separate visual-analysis notes, object lists, or inferred scene descriptions.",
    "Ignore repeated slide footers, page numbers, and decorative artifacts unless they carry source meaning. Never repeat the same visible footer or page number more than once.",
    "Use normal Markdown line breaks and sections. Do not collapse the whole page into one paragraph.",
    "Sparse pages are valid OCR outputs. If the page is a cover, divider, map-only page, or mostly decorative image, transcribe only the visible text and use a short image placeholder.",
    "A sparse page can produce a short markdown field. Do not pad the answer to make it look complete.",
    "Never infer report sections, examples, route impacts, benefits, tables, footnotes, or metrics that are not visibly printed on this exact page.",
    "The source metadata below is for routing and validation only. Do not copy Source ID, Title, Publisher, Source group, or Page into the markdown field unless those exact words are visibly printed on the page image.",
    "If no table is visible on the page, do not create a table and set containsTables to false.",
    "Do not summarize, reinterpret, or add facts that are not visible on the page. Omit unreadable background signs, decorative text, and tiny labels; do not emit [unclear], [illegible], or lists of unreadable items.",
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

function markdownWithFrontmatter(input: {
  source: Tier2OcrPlanSource;
  pageNumber: number;
  pdfPageCount: number;
  generatedAt: string;
  model: string;
  provider: Tier2OcrPageMarkdownManifest["provider"];
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

function shouldDisableReasoningForRequiredToolCalls(model: string): boolean {
  return model.toLowerCase().startsWith("qwen/qwen3.7");
}

function requiredToolCallReasoningOverride(model: string): { effort: "none" } | null {
  return shouldDisableReasoningForRequiredToolCalls(model) ? { effort: "none" } : null;
}

function supportsRenderedImageOcrInput(model: string): boolean {
  return !model.toLowerCase().startsWith("qwen/qwen3.7-max");
}

export async function callOpenRouterPageMarkdownOcr(input: {
  apiKey: string;
  provider?: Tier2OcrPageMarkdownManifest["provider"];
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
  const provider = input.provider ?? "openrouter";

  // Canonical (rendered-image) OCR path: route the vision tool call through the
  // pi harness. pi-ai serializes the `{type:"image"}` block to OpenRouter's
  // `{type:"image_url"}`; `service_tier` and file annotations are not expressible
  // and are intentionally dropped (the image path sends no `plugins.file-parser`
  // and the consumer treats a null served service tier / empty annotations as a
  // no-op).
  if (input.inputMimeType === "image/png") {
    const tool = ocrPageMarkdownTool()["function"] as {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
    const toolCallInput = {
      apiKey: input.apiKey,
      model: input.model,
      maxTokens: input.maxTokens,
      toolName: OCR_PAGE_MARKDOWN_TOOL_NAME,
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            { type: "image" as const, data: base64, mimeType: "image/png" },
          ],
        },
      ],
      tools: [tool],
      fetcher: input.fetcher,
    };
    return provider === "pioneer"
      ? callPioneerToolCallDirect(toolCallInput)
      : callOpenRouterToolCallViaPi(toolCallInput);
  }

  if (provider === "pioneer") {
    throw new Error("Pioneer OCR only supports rendered-image page inputs.");
  }

  // Non-vision `pdf_page` fallback: pi-ai cannot express OpenRouter's
  // `{type:"file"}` content block or the `plugins.file-parser` server-side
  // engine, so this rare path stays on the inline OpenRouter client. See the
  // header note in `_shared.ts`.
  const reasoning = requiredToolCallReasoningOverride(input.model);
  const body: Record<string, unknown> = {
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
              filename: `${input.source.sourceId}-page-${input.pageNumber}.pdf`,
              file_data: `data:application/pdf;base64,${base64}`,
            },
          },
        ],
      },
    ],
    tools: [ocrPageMarkdownTool()],
    tool_choice: {
      type: "function",
      function: { name: OCR_PAGE_MARKDOWN_TOOL_NAME },
    },
    ...(reasoning === null ? {} : { reasoning }),
    temperature: 0,
    plugins: [
      {
        id: "file-parser",
        pdf: {
          engine: input.pdfEngine,
        },
      },
    ],
  };

  return postOpenRouterChatCompletions({
    apiKey: input.apiKey,
    title: "Bus Priority Impact Studio Page OCR",
    body,
    fetcher: input.fetcher,
  });
}

// Exported for the resume idempotency test (see ocr-render-resume.test.ts).
export async function readExistingPageMarkdown(input: {
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
  // A crash mid-write (or a truncated artifact) can leave the tool-call JSON
  // unparseable or the markdown empty. Treat any such partial state as "not
  // rendered" so the page is re-OCR'd on resume rather than crashing the run —
  // mirroring the defensive `.catch(() => null)` on the response body above.
  const toolCall = await Bun.file(paths.toolCallPath)
    .json()
    .catch(() => null);
  if (toolCall === null) {
    return null;
  }
  let result: ReturnType<typeof pageMarkdownToolResult>;
  try {
    result = pageMarkdownToolResult(toolCall);
  } catch {
    return null;
  }
  const markdownText = await Bun.file(paths.markdownPath).text();
  if (markdownText.length === 0) {
    return null;
  }
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
  provider: Tier2OcrPageMarkdownManifest["provider"];
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
    throw new Error(
      input.provider === "pioneer"
        ? "PIONEER_API_KEY is required for docs:tier2:ocr --provider pioneer --execute."
        : "OPENROUTER_API_KEY is required for docs:tier2:ocr --execute.",
    );
  }

  const paths = pageMarkdownOutputPaths(input.page.pageRoot);
  const openRouter = await callOpenRouterPageMarkdownOcr({
    apiKey: input.apiKey,
    provider: input.provider,
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
    const providerLabel = input.provider === "pioneer" ? "Pioneer" : "OpenRouter";
    const httpErrorMessage = `${providerLabel} HTTP ${openRouter.response.status} ${openRouter.response.statusText}`;
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
  provider: Tier2OcrPageMarkdownManifest["provider"];
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
        provider: input.provider,
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
  const provider = args.provider ?? "openrouter";
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
        provider,
        pdfEngine,
        serviceTier,
        maxTokens,
        execute,
        fetcher,
        apiKey:
          args.apiKey ??
          (provider === "pioneer"
            ? process.env["PIONEER_API_KEY"]
            : process.env["OPENROUTER_API_KEY"]),
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
    provider,
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

// CLI surface for the `docs:tier2:ocr` command. Mirrors the sibling
// `auditTier2OcrPageMarkdownFromCli` arg-parse + plan-path resolution idiom so
// the renderer can be located by an explicit `--ocr-plan` or by
// `--artifact-root`/`--run-id` against the latest docs run.
type OcrPageMarkdownRenderCliArgs = {
  ocrPlanPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
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
};

function parseOcrTier2PageMarkdownCliArgs(args: string[]): OcrPageMarkdownRenderCliArgs {
  const options: CliOption<OcrPageMarkdownRenderCliArgs>[] = [
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
      flags: ["--model"],
      apply: (output, value) => {
        if (value !== undefined) output.model = value;
      },
    },
    {
      flags: ["--provider"],
      apply: (output, value) => {
        if (value !== undefined)
          output.provider = value as Tier2OcrPageMarkdownManifest["provider"];
      },
    },
    {
      flags: ["--pdf-engine"],
      apply: (output, value) => {
        if (value !== undefined)
          output.pdfEngine = value as Tier2OcrPageMarkdownManifest["pdfEngine"];
      },
    },
    {
      flags: ["--service-tier"],
      apply: (output, value) => {
        if (value !== undefined)
          output.serviceTier = value as Tier2OcrPageMarkdownManifest["serviceTier"];
      },
    },
    {
      flags: ["--max-tokens"],
      apply: (output, value) => {
        if (value !== undefined) output.maxTokens = Number(value);
      },
    },
    {
      flags: ["--page-markdown-root", "--page-markdown-root-name"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownRootName = value;
      },
    },
    {
      flags: ["--page-input-preference"],
      apply: (output, value) => {
        if (value !== undefined) output.pageInputPreference = value as Tier2OcrPageInputPreference;
      },
    },
    {
      flags: ["--page-range"],
      apply: (output, value) => {
        if (value !== undefined) output.pageRangeOverride = value;
      },
    },
    {
      flags: ["--page-concurrency"],
      apply: (output, value) => {
        if (value !== undefined) output.pageConcurrency = Number(value);
      },
    },
    {
      flags: ["--page-limit"],
      apply: (output, value) => {
        if (value !== undefined) output.pageLimit = Number(value);
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
    trueOption(["--all-pages"], (output) => {
      output.allPages = true;
    }),
    trueOption(["--execute"], (output) => {
      output.execute = true;
    }),
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveRenderOcrPlanPath(args: OcrPageMarkdownRenderCliArgs): Promise<string> {
  if (args.ocrPlanPath !== undefined) {
    return args.ocrPlanPath;
  }
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }
  return ocrPlanPath(artifactRoot, runId);
}

export async function ocrTier2PageMarkdownFromCli(
  args: string[],
): Promise<Tier2OcrPageMarkdownManifest> {
  const parsed = parseOcrTier2PageMarkdownCliArgs(args);
  const {
    artifactRoot: _artifactRoot,
    runId: _runId,
    ocrPlanPath: _ocrPlanFlag,
    outputPath,
    ...rest
  } = parsed;
  const resolvedOcrPlanPath = await resolveRenderOcrPlanPath(parsed);
  return ocrTier2PageMarkdown({
    ...rest,
    ocrPlanPath: resolvedOcrPlanPath,
    outputPath: outputPath ?? join(dirname(resolvedOcrPlanPath), "ocr-page-markdown.json"),
  });
}

export async function prepareTier2PageMarkdownInputsFromCli(
  args: string[],
): Promise<Tier2OcrPageMarkdownManifest> {
  const parsed = parseOcrTier2PageMarkdownCliArgs(args);
  if (parsed.execute === true) {
    throw new Error(
      "docs:tier2:ocr-prepare never submits OCR LLM requests. Use docs:tier2:ocr --execute after review.",
    );
  }
  const {
    artifactRoot: _artifactRoot,
    runId: _runId,
    ocrPlanPath: _ocrPlanFlag,
    outputPath,
    ...rest
  } = parsed;
  const resolvedOcrPlanPath = await resolveRenderOcrPlanPath(parsed);
  const plan = (await Bun.file(resolvedOcrPlanPath).json()) as Tier2OcrPlan;
  return ocrTier2PageMarkdown({
    ...rest,
    execute: false,
    pageInputPreference: rest.pageInputPreference ?? "image",
    limit: rest.limit ?? plan.sources.length,
    ocrPlanPath: resolvedOcrPlanPath,
    outputPath: outputPath ?? join(dirname(resolvedOcrPlanPath), "ocr-page-markdown-prepare.json"),
  });
}
