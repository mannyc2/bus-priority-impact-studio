// Resume / idempotency test for the OCR page-markdown renderer.
//
// `readExistingPageMarkdown` is the per-page resume gate: on a rerun it reuses an
// already-rendered page (so a crash mid-run doesn't redo paid OCR work) but must
// re-render any page whose on-disk artifacts are missing, partial, or corrupt —
// otherwise a truncated write would either crash the whole run or get reused as a
// valid result. This pins both halves of that contract.
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readExistingPageMarkdown } from "../../../../src/commands/docs/tier2/_ocr-render.ts";
import { pageMarkdownOutputPaths } from "../../../../src/commands/docs/tier2/_shared.ts";

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
  if (parts.response !== undefined) await writeFile(paths.responsePath, JSON.stringify(parts.response));
  if (parts.toolCall !== undefined) await writeFile(paths.toolCallPath, parts.toolCall);
  if (parts.markdown !== undefined) await writeFile(paths.markdownPath, parts.markdown);
}

async function withPageRoot(run: (pageRoot: string, runRoot: string) => Promise<void>): Promise<void> {
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
      await seedPage(pageRoot, { response: OK_RESPONSE, toolCall: JSON.stringify(VALID_TOOL_CALL) });
      expect(
        await readExistingPageMarkdown({ basePage: BASE_PAGE, runRoot, pageRoot, requestedServiceTier: null }),
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
        await readExistingPageMarkdown({ basePage: BASE_PAGE, runRoot, pageRoot, requestedServiceTier: null }),
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
        await readExistingPageMarkdown({ basePage: BASE_PAGE, runRoot, pageRoot, requestedServiceTier: null }),
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
        await readExistingPageMarkdown({ basePage: BASE_PAGE, runRoot, pageRoot, requestedServiceTier: null }),
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
        await readExistingPageMarkdown({ basePage: BASE_PAGE, runRoot, pageRoot, requestedServiceTier: null }),
      ).toBeNull();
    });
  });
});
