// biome-ignore-all lint/style/noNonNullAssertion: Fixture assertions intentionally index rows after explicit length/content checks.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  buildTextPageMarkdown,
  normalizeTextMarkdown,
  splitCapturedTextIntoPages,
  type Tier2CapturedSource,
  type Tier2CaptureManifest,
} from "../../../../src/commands/docs/tier2/_shared.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-normalize-text-markdown");

function pageBody(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

// Recover the verbatim chunk from a page.md file (without trimming).
// The normalizer writes `---\n<kv>\n---\n\n<chunk>\n`, so the chunk lies
// between `\n---\n\n` and the single trailing newline.
function rawChunkFromPage(markdown: string): string {
  const terminator = "\n---\n\n";
  const idx = markdown.indexOf(terminator);
  if (idx === -1) throw new Error("page.md is missing the frontmatter terminator");
  const after = markdown.slice(idx + terminator.length);
  return after.endsWith("\n") ? after.slice(0, -1) : after;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeSource(
  overrides: Partial<Tier2CapturedSource> & { sourceId: string },
): Tier2CapturedSource {
  return {
    sourceId: overrides.sourceId,
    title: overrides.title ?? "Test Source",
    publisher: overrides.publisher ?? "Test Publisher",
    sourceGroup: overrides.sourceGroup ?? "test",
    intendedUse: overrides.intendedUse ?? ["context"],
    priority: overrides.priority ?? 1,
    sourceUrl: overrides.sourceUrl ?? "https://example.org/source",
    finalUrl: overrides.finalUrl ?? "https://example.org/source",
    documentDate: overrides.documentDate ?? null,
    retrievedAt: overrides.retrievedAt ?? "2026-05-27T00:00:00.000Z",
    captureStatus: overrides.captureStatus ?? "captured",
    httpStatus: overrides.httpStatus ?? 200,
    contentType: overrides.contentType ?? "text/html",
    detectedContentType: overrides.detectedContentType ?? "html",
    byteLength: overrides.byteLength ?? 0,
    sha256: overrides.sha256 ?? null,
    rawArtifactKey: overrides.rawArtifactKey ?? null,
    textArtifactKey: overrides.textArtifactKey ?? null,
    textLength: overrides.textLength ?? 0,
    textExtractionStatus: overrides.textExtractionStatus ?? "html_text",
    ocrHint: overrides.ocrHint ?? "not_needed",
    termsNote: overrides.termsNote ?? null,
    error: overrides.error ?? null,
  };
}

async function seedRun(
  caseName: string,
  textsBySource: Record<string, string>,
  manifestOverrides?: Partial<Tier2CaptureManifest>,
): Promise<{ runRoot: string; captureManifestPath: string }> {
  const runRoot = join(workingRoot, caseName);
  await rm(runRoot, { force: true, recursive: true });
  await mkdir(runRoot, { recursive: true });

  const sources: Tier2CapturedSource[] = [];
  for (const [sourceId, text] of Object.entries(textsBySource)) {
    const textArtifactKey = `sources/${sourceId}/text.txt`;
    const textPath = join(runRoot, textArtifactKey);
    await mkdir(join(runRoot, "sources", sourceId), { recursive: true });
    // Match writeRawArtifacts which appends a trailing newline.
    await Bun.write(textPath, `${text}\n`);
    sources.push(
      makeSource({
        sourceId,
        textArtifactKey,
        textLength: text.length,
        textExtractionStatus: "html_text",
      }),
    );
  }

  const captureManifestPath = join(runRoot, "capture-manifest.json");
  const manifest: Tier2CaptureManifest = {
    version: 1,
    runId: caseName,
    generatedAt: "2026-05-27T00:00:00.000Z",
    backlogPath: "fixture/backlog.json",
    artifactRoot: workingRoot,
    runArtifactRoot: runRoot,
    summary: {
      sourceCount: sources.length,
      capturedCount: sources.length,
      failedCount: 0,
      htmlTextCount: sources.length,
      ocrRequiredCount: 0,
      metadataOnlyCount: 0,
      totalBytes: 0,
    },
    sources,
    ...manifestOverrides,
  };
  await writeJson(captureManifestPath, manifest);
  return { runRoot, captureManifestPath };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("splitCapturedTextIntoPages", () => {
  test("short text emits a single chunk", () => {
    const text = "Short paragraph that fits in one page.";
    expect(splitCapturedTextIntoPages(text)).toEqual([text]);
  });

  test("byte-exact preservation across multiple chunks", () => {
    const sentence = "This is sentence number XYZ that is moderately long. ";
    let text = "";
    while (text.length < 25000) {
      text += sentence.replace("XYZ", String(text.length));
    }
    const chunks = splitCapturedTextIntoPages(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(8000);
    }
    expect(chunks.join("")).toBe(text);
  });

  test("prefers sentence boundaries when available", () => {
    // Place the sentence boundary inside the [6000, 8000) search window so
    // the splitter actually finds it.
    const head = "a".repeat(6500);
    const text = `${head}. ${"b".repeat(5000)}. ${"c".repeat(2000)}`;
    const chunks = splitCapturedTextIntoPages(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]!.endsWith(". ")).toBe(true);
    expect(chunks.join("")).toBe(text);
  });

  test("falls back to space boundary when no sentence boundary is near", () => {
    const word = "word ";
    const text = word.repeat(2000);
    const chunks = splitCapturedTextIntoPages(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.endsWith(" ")).toBe(true);
    }
    expect(chunks.join("")).toBe(text);
  });

  test("hard-boundary fallback splits a single oversized token", () => {
    const text = "x".repeat(20000);
    const chunks = splitCapturedTextIntoPages(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(8000);
    }
    expect(chunks.join("")).toBe(text);
  });
});

describe("buildTextPageMarkdown", () => {
  test("frontmatter parses with the existing OCR helpers", () => {
    const source = makeSource({
      sourceId: "fixture_source",
      title: "Fixture Title",
      sourceUrl: "https://example.org/fixture",
      finalUrl: "https://example.org/fixture",
      textArtifactKey: "sources/fixture_source/text.txt",
    });
    const chunk = "Hello world. This is a sample chunk.";
    const markdown = buildTextPageMarkdown({
      source,
      pageNumber: 1,
      chunkIndex: 1,
      chunkCount: 1,
      originalLength: chunk.length,
      originalArtifactKey: source.textArtifactKey!,
      generatedAt: "2026-05-27T00:00:00.000Z",
      chunk,
    });
    expect(markdown.startsWith("---\n")).toBe(true);
    expect(markdown).toContain('sourceId: "fixture_source"');
    expect(markdown).toContain("pageNumber: 1");
    expect(markdown).toContain("chunkIndex: 1");
    expect(markdown).toContain("chunkCount: 1");
    expect(markdown).toContain(`originalLength: ${chunk.length}`);
    expect(markdown).toContain('inputMode: "captured_text"');
    expect(markdown).toContain('pageKind: "text_chunk"');
    expect(pageBody(markdown)).toBe(chunk);
  });
});

describe("normalizeTextMarkdown", () => {
  test("writes one page per short source and the audit summary matches", async () => {
    const { captureManifestPath, runRoot } = await seedRun("short", {
      one: "First source text.",
      two: "Second source text with more content but still under threshold.",
    });
    const audit = await normalizeTextMarkdown({
      captureManifestPath,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    expect(audit.summary.sourceCount).toBe(2);
    expect(audit.summary.pageCount).toBe(2);
    expect(audit.pageMarkdownRootName).toBe("text-page-markdown-v1");
    const sourceRootOne = join(
      runRoot,
      "text-page-markdown-v1",
      "sources",
      "0001_one",
      "pages",
      "0001",
      "page.md",
    );
    const sourceRootTwo = join(
      runRoot,
      "text-page-markdown-v1",
      "sources",
      "0002_two",
      "pages",
      "0001",
      "page.md",
    );
    const bodyOne = pageBody(await readFile(sourceRootOne, "utf8"));
    const bodyTwo = pageBody(await readFile(sourceRootTwo, "utf8"));
    expect(bodyOne).toBe("First source text.");
    expect(bodyTwo).toBe("Second source text with more content but still under threshold.");
  });

  test("chunks a large source into multiple pseudo-pages with byte-exact body", async () => {
    const sentence = "This is sentence number XYZ that is moderately long. ";
    let text = "";
    let counter = 0;
    while (text.length < 20000) {
      text += sentence.replace("XYZ", String(counter));
      counter += 1;
    }
    const { captureManifestPath, runRoot } = await seedRun("chunked", {
      big: text,
    });
    const audit = await normalizeTextMarkdown({
      captureManifestPath,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    expect(audit.sources).toHaveLength(1);
    const source = audit.sources[0]!;
    expect(source.pageCount).toBeGreaterThan(1);
    expect(source.quality).toBe("ok");
    expect(source.originalLength).toBe(text.length);

    const sourceRoot = join(runRoot, "text-page-markdown-v1", "sources", "0001_big", "pages");
    const pageDirs = (await readdir(sourceRoot)).sort();
    expect(pageDirs).toHaveLength(source.pageCount);

    const rawChunks: string[] = [];
    for (const dir of pageDirs) {
      const file = await readFile(join(sourceRoot, dir, "page.md"), "utf8");
      rawChunks.push(rawChunkFromPage(file));
    }
    expect(rawChunks.join("")).toBe(text);
  });

  test("flags too-short sources without skipping the page", async () => {
    const { captureManifestPath, runRoot } = await seedRun("too-short", {
      dashboard: "MTA Dashboard Loading...",
    });
    const audit = await normalizeTextMarkdown({
      captureManifestPath,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    expect(audit.summary.tooShortSourceCount).toBe(1);
    const source = audit.sources[0]!;
    expect(source.quality).toBe("too_short");
    expect(source.pageCount).toBe(1);
    expect(source.completePageCount).toBe(0);
    const pagePath = join(
      runRoot,
      "text-page-markdown-v1",
      "sources",
      "0001_dashboard",
      "pages",
      "0001",
      "page.md",
    );
    expect(await Bun.file(pagePath).exists()).toBe(true);
  });

  test("output is deterministic for fixed generatedAt", async () => {
    const text = "Deterministic page content here.";
    const generatedAt = "2026-05-27T00:00:00.000Z";

    const first = await seedRun("det-1", { fixed: text });
    await normalizeTextMarkdown({
      captureManifestPath: first.captureManifestPath,
      generatedAt,
    });
    const firstPage = await readFile(
      join(
        first.runRoot,
        "text-page-markdown-v1",
        "sources",
        "0001_fixed",
        "pages",
        "0001",
        "page.md",
      ),
      "utf8",
    );

    const second = await seedRun("det-2", { fixed: text });
    await normalizeTextMarkdown({
      captureManifestPath: second.captureManifestPath,
      generatedAt,
    });
    const secondPage = await readFile(
      join(
        second.runRoot,
        "text-page-markdown-v1",
        "sources",
        "0001_fixed",
        "pages",
        "0001",
        "page.md",
      ),
      "utf8",
    );

    expect(sha256Hex(firstPage)).toBe(sha256Hex(secondPage));
  });

  test("emits Phase 2 compat plan and audit alongside the native audit", async () => {
    const longerThanThreshold = "Sentence to fill space. ".repeat(20); // ~480 chars > 200 threshold
    const { captureManifestPath, runRoot } = await seedRun("compat", {
      one: longerThanThreshold,
      tiny: "MTA Dashboard Loading...",
    });
    const audit = await normalizeTextMarkdown({
      captureManifestPath,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    expect(audit.phase2CompatPlanPath).toBe(join(runRoot, "text-ocr-plan-v1.json"));
    expect(audit.phase2CompatAuditPath).toBe(join(runRoot, "text-page-markdown-phase2-audit.json"));

    const plan = (await Bun.file(audit.phase2CompatPlanPath).json()) as {
      runId: string;
      model: string;
      sources: Array<{ sourceId: string; pageRange: string }>;
    };
    expect(plan.runId).toBe("compat");
    expect(plan.model).toBe("text-normalized-source");
    expect(plan.sources.map((source) => source.sourceId)).toEqual(["one", "tiny"]);
    expect(plan.sources[0]!.pageRange).toBe("1-1");

    const phase2Audit = (await Bun.file(audit.phase2CompatAuditPath).json()) as {
      pageMarkdownRootName: string;
      sources: Array<{
        sourceId: string;
        pageCount: number;
        pages: Array<{
          status: string;
          blankPageLikely: boolean;
          markdownArtifactKey: string;
        }>;
      }>;
    };
    expect(phase2Audit.pageMarkdownRootName).toBe("text-page-markdown-v1");
    // Phase 2 filters pages by status === "ocr_complete" && !blankPageLikely.
    // The too-short source must be gated via blankPageLikely so Phase 2 skips
    // it. The healthy source must NOT be gated.
    const okPage = phase2Audit.sources[0]!.pages[0]!;
    expect(okPage.status).toBe("ocr_complete");
    expect(okPage.blankPageLikely).toBe(false);
    const tinyPage = phase2Audit.sources[1]!.pages[0]!;
    expect(tinyPage.status).toBe("ocr_complete");
    expect(tinyPage.blankPageLikely).toBe(true);
  });

  test("evidence quotes from the original text are substrings of the page body", async () => {
    const sentence = "This is sentence number XYZ that is moderately long. ";
    let text = "";
    for (let counter = 0; text.length < 12000; counter += 1) {
      text += sentence.replace("XYZ", String(counter));
    }
    const { captureManifestPath, runRoot } = await seedRun("substring", {
      doc: text,
    });
    const audit = await normalizeTextMarkdown({
      captureManifestPath,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    const source = audit.sources[0]!;
    expect(source.pageCount).toBeGreaterThan(1);

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= source.pageCount; pageNumber += 1) {
      const file = await readFile(
        join(
          runRoot,
          "text-page-markdown-v1",
          "sources",
          "0001_doc",
          "pages",
          String(pageNumber).padStart(4, "0"),
          "page.md",
        ),
        "utf8",
      );
      pages.push(pageBody(file));
    }

    // Pick a verbatim quote from the original text that lies entirely inside
    // a single chunk. The simplest contract: any sentence "This is sentence
    // number N that is moderately long." should appear verbatim in at least
    // one page body, because we prefer sentence-boundary splits.
    const sampleQuote = "This is sentence number 5 that is moderately long.";
    const hitCount = pages.filter((body) => body.includes(sampleQuote)).length;
    expect(hitCount).toBeGreaterThanOrEqual(1);
  });
});
