import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  type OcrSimilarityArtifact,
  runTier2OcrSimilarity,
} from "../../../../src/commands/docs/tier2/_ocr-similarity.ts";
import type {
  Tier2OcrPageMarkdownAudit,
  Tier2OcrPlan,
} from "../../../../src/commands/docs/tier2/_shared.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-ocr-similarity");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function seedComparisonRun(
  caseName: string,
  baselineBody = "B46 Select Bus Service launched 7/3/16 with bus lanes and 12 mph speeds.",
): Promise<{ runRoot: string; ocrPlanPath: string; auditPath: string }> {
  const runRoot = join(workingRoot, caseName);
  await rm(runRoot, { force: true, recursive: true });
  await mkdir(join(runRoot, "sources", "fixture"), { recursive: true });

  const pdf = await PDFDocument.create();
  pdf.addPage([144, 144]);
  const pdfBytes = await pdf.save();
  const rawArtifactKey = "sources/fixture/source.pdf";
  await Bun.write(join(runRoot, rawArtifactKey), pdfBytes);
  const baselineMarkdownKey = "baseline-ocr/sources/0001_fixture_pdf/pages/0001/page.md";
  await mkdir(dirname(join(runRoot, baselineMarkdownKey)), { recursive: true });
  await Bun.write(
    join(runRoot, baselineMarkdownKey),
    `---\nsourceId: "fixture_pdf"\npageNumber: 1\n---\n\n${baselineBody}\n`,
  );

  const captureManifestPath = join(runRoot, "capture-manifest.json");
  await writeJson(captureManifestPath, { version: 1, runId: caseName, sources: [] });
  const plan: Tier2OcrPlan = {
    version: 1,
    runId: caseName,
    generatedAt: "2026-06-06T00:00:00.000Z",
    captureManifestPath,
    outputPath: null,
    runtime: "pi-mono",
    provider: "openrouter",
    model: "baseline-ocr",
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
        pageRange: "1",
        inputMode: "openrouter_pdf_file_or_rendered_pages",
        reviewState: "triage_ready",
        nextAction: "compare",
      },
    ],
  };
  const ocrPlanPath = join(runRoot, "ocr-plan.json");
  await writeJson(ocrPlanPath, plan);

  const audit: Tier2OcrPageMarkdownAudit = {
    version: 1,
    runId: caseName,
    generatedAt: "2026-06-06T00:00:00.000Z",
    ocrPlanPath,
    outputPath: null,
    pageMarkdownRootName: "baseline-ocr",
    summary: {
      plannedSourceCount: 1,
      sourceCount: 1,
      pageCount: 1,
      completePageCount: 1,
      failedPageCount: 0,
      missingPageCount: 0,
      toolCallCount: 1,
      responseCount: 1,
      tablePageCount: 0,
      mapPageCount: 0,
      chartPageCount: 0,
      likelyBlankPageCount: 0,
      visualReviewPageCount: 0,
      totalMarkdownChars: baselineBody.length,
      issueCounts: {
        missing_page_markdown: 0,
        missing_tool_call: 0,
        missing_response: 0,
        source_id_mismatch: 0,
        page_number_mismatch: 0,
        markdown_empty: 0,
        markdown_short: 0,
        visual_review_hint: 0,
        contains_map: 0,
        contains_chart: 0,
        contains_table: 0,
        ocr_error: 0,
      },
    },
    sources: [
      {
        sourceId: "fixture_pdf",
        title: "Fixture PDF",
        publisher: "NYC DOT",
        sourceGroup: "fixture",
        sourceUrl: "https://example.org/source.pdf",
        pdfPageCount: 1,
        pageCount: 1,
        completePageCount: 1,
        failedPageCount: 0,
        missingPageCount: 0,
        tablePageCount: 0,
        mapPageCount: 0,
        chartPageCount: 0,
        likelyBlankPageCount: 0,
        visualReviewPageCount: 0,
        totalMarkdownChars: baselineBody.length,
        issueCounts: {
          missing_page_markdown: 0,
          missing_tool_call: 0,
          missing_response: 0,
          source_id_mismatch: 0,
          page_number_mismatch: 0,
          markdown_empty: 0,
          markdown_short: 0,
          visual_review_hint: 0,
          contains_map: 0,
          contains_chart: 0,
          contains_table: 0,
          ocr_error: 0,
        },
        pages: [
          {
            sourceId: "fixture_pdf",
            title: "Fixture PDF",
            publisher: "NYC DOT",
            sourceGroup: "fixture",
            pageNumber: 1,
            status: "ocr_complete",
            markdownArtifactKey: baselineMarkdownKey,
            toolCallArtifactKey: "baseline-tool.json",
            responseArtifactKey: "baseline-response.json",
            errorArtifactKey: null,
            renderArtifactKey: null,
            inputArtifactKey: null,
            markdownCharCount: baselineBody.length,
            markdownBodyCharCount: baselineBody.length,
            containsTables: false,
            containsMaps: false,
            containsCharts: false,
            blankPageLikely: false,
            needsVisualReview: false,
            routesMentioned: ["B46"],
            corridorsMentioned: [],
            datesMentioned: ["7/3/16"],
            metricHints: ["12 mph"],
            visualReviewHints: [],
            issueCodes: [],
            error: null,
          },
        ],
      },
    ],
  };
  const auditPath = join(runRoot, "ocr-page-markdown-audit.json");
  await writeJson(auditPath, audit);
  return { runRoot, ocrPlanPath, auditPath };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("runTier2OcrSimilarity", () => {
  test("compares local text-layer output against existing OCR markdown", async () => {
    const { runRoot, ocrPlanPath, auditPath } = await seedComparisonRun("text-layer");
    const artifact = await runTier2OcrSimilarity({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      outputPath: join(runRoot, "ocr-similarity.json"),
      generatedAt: "2026-06-06T00:00:00.000Z",
      execute: true,
      commandExists: async (command) => command === "pdftotext",
      runCommand: async (command) => {
        if (command !== "pdftotext") throw new Error(`unexpected command ${command}`);
        return {
          exitCode: 0,
          stdout: "B46 Select Bus Service launched 7/3/16 with bus lanes and 12 mph speeds.\n",
          stderr: "",
        };
      },
    });

    expect(artifact.summary.comparedPageCount).toBe(1);
    expect(artifact.summary.textLayerPageCount).toBe(1);
    expect(artifact.summary.failedLocalPageCount).toBe(0);
    expect(artifact.summary.recommendationCounts.local_ok).toBe(1);
    expect(artifact.rows[0]?.tokenRecall).toBe(1);
    expect(artifact.rows[0]?.routeTokenRecall).toBe(1);
    expect(artifact.rows[0]?.dateTokenRecall).toBe(1);
    expect(artifact.rows[0]?.recommendedAction).toBe("local_ok");
    expect(
      (await Bun.file(join(runRoot, "ocr-similarity.json")).json()) as OcrSimilarityArtifact,
    ).toBeDefined();
  });

  test("records local OCR failures so missing tesseract is visible in the report", async () => {
    const { ocrPlanPath, auditPath } = await seedComparisonRun("missing-tesseract");
    const artifact = await runTier2OcrSimilarity({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      generatedAt: "2026-06-06T00:00:00.000Z",
      execute: true,
      textLayerMode: "never",
      commandExists: async (command) => command === "pdftoppm",
      runCommand: async (command, args) => {
        if (command !== "pdftoppm") throw new Error(`unexpected command ${command}`);
        const prefix = args.at(-1);
        if (prefix === undefined) throw new Error("missing render prefix");
        await mkdir(dirname(prefix), { recursive: true });
        await Bun.write(`${prefix}-1.png`, new Uint8Array([137, 80, 78, 71]));
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    expect(artifact.summary.comparedPageCount).toBe(0);
    expect(artifact.summary.failedLocalPageCount).toBe(1);
    expect(artifact.summary.recommendationCounts.local_failed_needs_triage).toBe(1);
    expect(artifact.rows[0]?.recommendedAction).toBe("local_failed_needs_triage");
    expect(artifact.rows[0]?.error).toContain("tesseract binary not found");
  });

  test("records Markdown-normalized plain-text similarity metrics", async () => {
    const { ocrPlanPath, auditPath } = await seedComparisonRun(
      "markdown-normalized",
      [
        "## B46 Select Bus Service",
        "",
        "| Route | Launch date | Speed |",
        "|---|---|---:|",
        "| B46 | 7/3/16 | 12 mph |",
      ].join("\n"),
    );
    const artifact = await runTier2OcrSimilarity({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      generatedAt: "2026-06-06T00:00:00.000Z",
      execute: true,
      commandExists: async (command) => command === "pdftotext",
      runCommand: async (command) => {
        if (command !== "pdftotext") throw new Error(`unexpected command ${command}`);
        return {
          exitCode: 0,
          stdout: "B46 Select Bus Service\nRoute Launch date Speed\nB46 7/3/16 12 mph\n",
          stderr: "",
        };
      },
    });

    const row = artifact.rows[0];
    expect(row?.plainTextBaselineCharCount).toBeLessThan(row?.baselineCharCount ?? 0);
    expect(row?.plainTextTokenRecall).toBe(1);
    expect(row?.plainTextCharFiveGramCosine ?? 0).toBeGreaterThan(row?.charFiveGramCosine ?? 0);
    expect(artifact.summary.plainTextTokenRecall.mean).toBe(1);
  });

  test("does not recommend paid vision OCR for short low-value visual misses", async () => {
    const { ocrPlanPath, auditPath } = await seedComparisonRun(
      "short-visual-miss",
      "B46 Select Bus Service launched 7/3/16.",
    );
    const artifact = await runTier2OcrSimilarity({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      generatedAt: "2026-06-06T00:00:00.000Z",
      execute: true,
      commandExists: async (command) => command === "pdftotext",
      runCommand: async (command) => {
        if (command !== "pdftotext") throw new Error(`unexpected command ${command}`);
        return {
          exitCode: 0,
          stdout: "Decorative report cover with agency logos and background photography only.\n",
          stderr: "",
        };
      },
    });

    expect(artifact.summary.comparedPageCount).toBe(1);
    expect(artifact.summary.recommendationCounts.no_paid_vision_low_value_visual).toBe(1);
    expect(artifact.rows[0]?.recommendedAction).toBe("no_paid_vision_low_value_visual");
    expect(artifact.rows[0]?.recommendationReasons.join(" ")).toContain("little substantive text");
  });
});
