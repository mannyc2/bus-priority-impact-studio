// Resume / idempotency test for the OCR page-markdown renderer.
//
// `readExistingPageMarkdown` is the per-page resume gate: on a rerun it reuses an
// already-rendered page (so a crash mid-run doesn't redo paid OCR work) but must
// re-render any page whose on-disk artifacts are missing, partial, or corrupt —
// otherwise a truncated write would either crash the whole run or get reused as a
// valid result. This pins both halves of that contract.
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  ocrTier2PageMarkdown,
  readExistingPageMarkdown,
} from "../../../../src/commands/docs/tier2/_ocr-render.ts";
import {
  executableExists,
  pageMarkdownOutputPaths,
  type Tier2OcrPlan,
} from "../../../../src/commands/docs/tier2/_shared.ts";

const BASE_PAGE = {
  pageNumber: 1,
  inputMode: "rendered_image" as const,
  pagePdfArtifactKey: null,
  pagePdfByteLength: 0,
  pagePdfSha256: null,
  renderArtifactKey: "sources/s/pages/1/render.png",
  renderSha256: "0".repeat(64),
  inputArtifactKey: "sources/s/pages/1/render.png",
  inputMimeType: "image/png" as const,
  inputByteLength: 4,
  inputSha256: "0".repeat(64),
};

const VALID_TOOL_CALL = {
  sourceId: "test_source",
  pageNumber: 1,
  markdown: "## Page 1\n\nSelect Bus Service cut excess wait time on the corridor.",
  routesMentioned: ["M15"],
  corridorsMentioned: [],
  datesMentioned: [],
  metricHints: [],
  containsTables: false,
  containsMaps: false,
  containsCharts: false,
  visualReviewHints: [],
};

const OK_RESPONSE = { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };

async function seedPage(
  pageRoot: string,
  parts: { response?: unknown; toolCall?: string; markdown?: string },
): Promise<void> {
  const paths = pageMarkdownOutputPaths(pageRoot);
  if (parts.response !== undefined)
    await writeFile(paths.responsePath, JSON.stringify(parts.response));
  if (parts.toolCall !== undefined) await writeFile(paths.toolCallPath, parts.toolCall);
  if (parts.markdown !== undefined) await writeFile(paths.markdownPath, parts.markdown);
}

async function withPageRoot(
  run: (pageRoot: string, runRoot: string) => Promise<void>,
): Promise<void> {
  const runRoot = await mkdtemp(join(tmpdir(), "ocr-resume-"));
  const pageRoot = join(runRoot, "sources", "test_source", "pages", "1");
  await mkdir(pageRoot, { recursive: true });
  try {
    await run(pageRoot, runRoot);
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
}

describe("readExistingPageMarkdown — resume gate", () => {
  test("reuses a complete, valid page", async () => {
    await withPageRoot(async (pageRoot, runRoot) => {
      await seedPage(pageRoot, {
        response: OK_RESPONSE,
        toolCall: JSON.stringify(VALID_TOOL_CALL),
        markdown: "## Page 1\n\nrendered markdown body",
      });
      const result = await readExistingPageMarkdown({
        basePage: BASE_PAGE,
        runRoot,
        pageRoot,
        requestedServiceTier: "flex",
      });
      expect(result).not.toBeNull();
      expect(result?.status).toBe("ocr_complete");
      expect(result?.reusedExisting).toBe(true);
      expect(result?.routesMentioned).toEqual(["M15"]);
    });
  });

  test("re-renders when an artifact is missing", async () => {
    await withPageRoot(async (pageRoot, runRoot) => {
      // No markdown file written -> not complete.
      await seedPage(pageRoot, {
        response: OK_RESPONSE,
        toolCall: JSON.stringify(VALID_TOOL_CALL),
      });
      expect(
        await readExistingPageMarkdown({
          basePage: BASE_PAGE,
          runRoot,
          pageRoot,
          requestedServiceTier: null,
        }),
      ).toBeNull();
    });
  });

  test("re-renders when the response body recorded a provider error", async () => {
    await withPageRoot(async (pageRoot, runRoot) => {
      await seedPage(pageRoot, {
        response: { error: { message: "429 rate limited" } },
        toolCall: JSON.stringify(VALID_TOOL_CALL),
        markdown: "## Page 1\n\nbody",
      });
      expect(
        await readExistingPageMarkdown({
          basePage: BASE_PAGE,
          runRoot,
          pageRoot,
          requestedServiceTier: null,
        }),
      ).toBeNull();
    });
  });

  test("re-renders on a corrupt/truncated tool-call artifact instead of crashing", async () => {
    await withPageRoot(async (pageRoot, runRoot) => {
      await seedPage(pageRoot, {
        response: OK_RESPONSE,
        toolCall: '{"sourceId":"test_source","pageNum', // truncated JSON
        markdown: "## Page 1\n\nbody",
      });
      expect(
        await readExistingPageMarkdown({
          basePage: BASE_PAGE,
          runRoot,
          pageRoot,
          requestedServiceTier: null,
        }),
      ).toBeNull();
    });
  });

  test("re-renders when the tool-call JSON is valid but fails schema (missing markdown)", async () => {
    await withPageRoot(async (pageRoot, runRoot) => {
      await seedPage(pageRoot, {
        response: OK_RESPONSE,
        toolCall: JSON.stringify({ sourceId: "test_source", pageNumber: 1 }),
        markdown: "## Page 1\n\nbody",
      });
      expect(
        await readExistingPageMarkdown({
          basePage: BASE_PAGE,
          runRoot,
          pageRoot,
          requestedServiceTier: null,
        }),
      ).toBeNull();
    });
  });

  test("re-renders when the markdown artifact is empty", async () => {
    await withPageRoot(async (pageRoot, runRoot) => {
      await seedPage(pageRoot, {
        response: OK_RESPONSE,
        toolCall: JSON.stringify(VALID_TOOL_CALL),
        markdown: "",
      });
      expect(
        await readExistingPageMarkdown({
          basePage: BASE_PAGE,
          runRoot,
          pageRoot,
          requestedServiceTier: null,
        }),
      ).toBeNull();
    });
  });

  test("prepare-only rendered-image input reuses existing PNGs on resume", async () => {
    if (!(await executableExists("pdftoppm"))) {
      return;
    }

    const runRoot = await mkdtemp(join(tmpdir(), "ocr-render-resume-"));
    try {
      const sourceRoot = join(runRoot, "sources", "test_source");
      await mkdir(sourceRoot, { recursive: true });
      const pdf = await PDFDocument.create();
      pdf.addPage([144, 144]);
      const pdfPath = join(sourceRoot, "source.pdf");
      await writeFile(pdfPath, await pdf.save());
      const captureManifestPath = join(runRoot, "capture-manifest.json");
      await writeFile(captureManifestPath, "{}\n");
      const plan: Tier2OcrPlan = {
        version: 1,
        runId: "ocr-render-resume",
        generatedAt: "2026-05-31T00:00:00.000Z",
        captureManifestPath,
        outputPath: null,
        runtime: "pi-mono",
        provider: "openrouter",
        model: "google/gemini-3.1-flash-lite",
        api: "chat.completions",
        summary: {
          ocrRequiredSourceCount: 1,
          skippedSourceCount: 0,
          totalBytes: 1,
          totalMegabytes: 0.001,
        },
        sources: [
          {
            sourceId: "test_source",
            title: "Test Source",
            publisher: "NYC DOT",
            sourceGroup: "test",
            sourceUrl: "https://example.com/source.pdf",
            finalUrl: "https://example.com/source.pdf",
            rawArtifactKey: "sources/test_source/source.pdf",
            byteLength: 1,
            sha256: "0".repeat(64),
            pageRange: "1",
            inputMode: "openrouter_pdf_file_or_rendered_pages",
            reviewState: "triage_ready",
            nextAction: "prepare",
          },
        ],
      };
      const planPath = join(runRoot, "ocr-plan.json");
      await writeFile(planPath, `${JSON.stringify(plan)}\n`);

      await ocrTier2PageMarkdown({
        ocrPlanPath: planPath,
        outputPath: join(runRoot, "prepare-1.json"),
        generatedAt: "2026-05-31T00:00:00.000Z",
        pageMarkdownRootName: "ocr-page-markdown-prepare",
        pageInputPreference: "image",
        pageLimit: 1,
        limit: 1,
        execute: false,
      });
      const pngPath = join(
        runRoot,
        "ocr-page-markdown-prepare",
        "sources",
        "0001_test_source",
        "pages",
        "0001",
        "page-0001-render-1.png",
      );
      const firstModifiedAt = (await stat(pngPath)).mtimeMs;

      await ocrTier2PageMarkdown({
        ocrPlanPath: planPath,
        outputPath: join(runRoot, "prepare-2.json"),
        generatedAt: "2026-05-31T00:00:00.000Z",
        pageMarkdownRootName: "ocr-page-markdown-prepare",
        pageInputPreference: "image",
        pageLimit: 1,
        limit: 1,
        execute: false,
      });

      expect((await stat(pngPath)).mtimeMs).toBe(firstModifiedAt);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});
