import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import type { Tier2OcrPlan } from "../../../../src/commands/docs/tier2/_shared.ts";
import {
  type LocalOcrCommandRunner,
  runTier2TesseractOcr,
} from "../../../../src/commands/docs/tier2/_tesseract-ocr.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-tesseract-ocr");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function markdownBody(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

async function seedOcrPlan(input: {
  caseName: string;
  pageCount?: number;
  pageRange?: string;
}): Promise<{ runRoot: string; ocrPlanPath: string; sourceId: string }> {
  const pageCount = input.pageCount ?? 1;
  const runRoot = join(workingRoot, input.caseName);
  await rm(runRoot, { force: true, recursive: true });
  await mkdir(join(runRoot, "sources", "fixture"), { recursive: true });

  const pdf = await PDFDocument.create();
  for (let page = 0; page < pageCount; page += 1) pdf.addPage([144, 144]);
  const pdfBytes = await pdf.save();
  const rawArtifactKey = "sources/fixture/source.pdf";
  await Bun.write(join(runRoot, rawArtifactKey), pdfBytes);

  const captureManifestPath = join(runRoot, "capture-manifest.json");
  await writeJson(captureManifestPath, { version: 1, runId: input.caseName, sources: [] });
  const plan: Tier2OcrPlan = {
    version: 1,
    runId: input.caseName,
    generatedAt: "2026-06-06T00:00:00.000Z",
    captureManifestPath,
    outputPath: null,
    runtime: "pi-mono",
    provider: "openrouter",
    model: "local-test",
    api: "chat.completions",
    summary: {
      ocrRequiredSourceCount: 1,
      skippedSourceCount: 0,
      totalBytes: pdfBytes.byteLength,
      totalMegabytes: pdfBytes.byteLength / 1_000_000,
    },
    sources: [
      {
        sourceId: "fixture_pdf",
        title: "Fixture PDF",
        publisher: "NYC DOT",
        sourceGroup: "fixture",
        sourceUrl: "https://example.org/source.pdf",
        finalUrl: "https://example.org/source.pdf",
        rawArtifactKey,
        byteLength: pdfBytes.byteLength,
        sha256: sha256(pdfBytes),
        pageRange: input.pageRange ?? (pageCount === 1 ? "1" : `1-${pageCount}`),
        inputMode: "openrouter_pdf_file_or_rendered_pages",
        reviewState: "triage_ready",
        nextAction: "local OCR",
      },
    ],
  };
  const ocrPlanPath = join(runRoot, "ocr-plan.json");
  await writeJson(ocrPlanPath, plan);
  return { runRoot, ocrPlanPath, sourceId: "fixture_pdf" };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("runTier2TesseractOcr", () => {
  test("uses a useful PDF text layer before rendering or invoking tesseract", async () => {
    const { runRoot, ocrPlanPath } = await seedOcrPlan({ caseName: "text-layer" });
    const commands: string[] = [];
    const runCommand: LocalOcrCommandRunner = async (command) => {
      commands.push(command);
      if (command === "pdftotext") {
        return {
          exitCode: 0,
          stdout: "M14 Select Bus Service launched July 2019 on 14th Street.\n",
          stderr: "",
        };
      }
      throw new Error(`unexpected command: ${command}`);
    };

    const manifest = await runTier2TesseractOcr({
      ocrPlanPath,
      outputPath: join(runRoot, "tesseract-ocr-page-markdown.json"),
      generatedAt: "2026-06-06T00:00:00.000Z",
      execute: true,
      commandExists: async (command) => command === "pdftotext",
      runCommand,
    });

    expect(commands).toEqual(["pdftotext"]);
    expect(manifest.summary.completePageCount).toBe(1);
    expect(manifest.summary.textLayerPageCount).toBe(1);
    expect(manifest.summary.tesseractPageCount).toBe(0);
    expect(manifest.audit?.summary.completePageCount).toBe(1);

    const pagePath = join(
      runRoot,
      "ocr-page-markdown-tesseract-v1",
      "sources",
      "0001_fixture_pdf",
      "pages",
      "0001",
      "page.md",
    );
    const markdown = await readFile(pagePath, "utf8");
    expect(markdown).toContain('textSource: "pdf_text_layer"');
    expect(markdownBody(markdown)).toBe(
      "M14 Select Bus Service launched July 2019 on 14th Street.",
    );

    const toolCall = (await Bun.file(
      join(dirname(pagePath), "ocr-page-tool-call.json"),
    ).json()) as { datesMentioned: string[]; routesMentioned: string[] };
    expect(toolCall.routesMentioned).toContain("M14");
    expect(toolCall.datesMentioned).toContain("July 2019");
  });

  test("falls back to rendered-image tesseract when the text layer is not useful", async () => {
    const { runRoot, ocrPlanPath } = await seedOcrPlan({ caseName: "tesseract-fallback" });
    const commands: string[] = [];
    const runCommand: LocalOcrCommandRunner = async (command, args) => {
      commands.push(command);
      if (command === "pdftotext") {
        return { exitCode: 0, stdout: " \n", stderr: "" };
      }
      if (command === "pdftoppm") {
        const prefix = args.at(-1);
        if (prefix === undefined) throw new Error("missing pdftoppm prefix");
        await mkdir(dirname(prefix), { recursive: true });
        await Bun.write(`${prefix}-1.png`, new Uint8Array([137, 80, 78, 71, 13, 10]));
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (command === "tesseract") {
        return {
          exitCode: 0,
          stdout: "B46 Select Bus Service implemented 7/3/16 with bus lanes.\n",
          stderr: "",
        };
      }
      throw new Error(`unexpected command: ${command}`);
    };

    const manifest = await runTier2TesseractOcr({
      ocrPlanPath,
      generatedAt: "2026-06-06T00:00:00.000Z",
      execute: true,
      commandExists: async (command) =>
        command === "pdftotext" || command === "pdftoppm" || command === "tesseract",
      runCommand,
    });

    expect(commands).toEqual(["pdftotext", "pdftoppm", "tesseract"]);
    expect(manifest.summary.completePageCount).toBe(1);
    expect(manifest.summary.textLayerPageCount).toBe(0);
    expect(manifest.summary.tesseractPageCount).toBe(1);
    expect(manifest.summary.renderedPageArtifactCount).toBe(1);
    expect(manifest.audit?.summary.completePageCount).toBe(1);

    const pagePath = join(
      runRoot,
      "ocr-page-markdown-tesseract-v1",
      "sources",
      "0001_fixture_pdf",
      "pages",
      "0001",
      "page.md",
    );
    const markdown = await readFile(pagePath, "utf8");
    expect(markdown).toContain('textSource: "tesseract"');
    expect(markdown).toContain('renderEngine: "poppler-pdftoppm"');
    expect(markdownBody(markdown)).toBe(
      "B46 Select Bus Service implemented 7/3/16 with bus lanes.",
    );
  });

  test("renders contiguous tesseract fallback pages in one pdftoppm batch", async () => {
    const { ocrPlanPath } = await seedOcrPlan({
      caseName: "tesseract-batch-render",
      pageCount: 3,
    });
    const commands: string[] = [];
    const pdftoppmRanges: Array<[string | undefined, string | undefined]> = [];
    const runCommand: LocalOcrCommandRunner = async (command, args) => {
      commands.push(command);
      if (command === "pdftoppm") {
        const start = args.at(args.indexOf("-f") + 1);
        const end = args.at(args.indexOf("-l") + 1);
        pdftoppmRanges.push([start, end]);
        const prefix = args.at(-1);
        if (prefix === undefined) throw new Error("missing pdftoppm prefix");
        await mkdir(dirname(prefix), { recursive: true });
        for (let page = Number(start); page <= Number(end); page += 1) {
          await Bun.write(`${prefix}-${page}.png`, new Uint8Array([137, 80, 78, 71, page]));
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (command === "tesseract") {
        return {
          exitCode: 0,
          stdout: "B46 Select Bus Service implemented 7/3/16 with bus lanes.\n",
          stderr: "",
        };
      }
      throw new Error(`unexpected command: ${command}`);
    };

    const manifest = await runTier2TesseractOcr({
      ocrPlanPath,
      generatedAt: "2026-06-06T00:00:00.000Z",
      execute: true,
      textLayerMode: "never",
      pageLimit: 3,
      pageConcurrency: 3,
      commandExists: async (command) => command === "pdftoppm" || command === "tesseract",
      runCommand,
    });

    expect(commands.filter((command) => command === "pdftoppm")).toHaveLength(1);
    expect(commands.filter((command) => command === "tesseract")).toHaveLength(3);
    expect(pdftoppmRanges).toEqual([["1", "3"]]);
    expect(manifest.summary.completePageCount).toBe(3);
    expect(manifest.summary.tesseractPageCount).toBe(3);
    expect(manifest.summary.renderedPageArtifactCount).toBe(3);
  });
});
