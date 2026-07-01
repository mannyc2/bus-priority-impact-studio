// biome-ignore-all lint/style/noNonNullAssertion: Fixture assertions intentionally index rows after explicit length/content checks.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { StructuredDocumentExtractionToolResponseSchema } from "@bp/domain/documents/structured-extraction";
import {
  extractTier2StructuredDocuments,
  validateStructuredExtraction,
} from "../../../../src/commands/docs/tier2/_structured-extraction.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-structured-extraction");

const VALID_TOOL_RESPONSE = {
  source: {
    sourceId: "fixture_pdf",
    sourceTitle: "Fixture PDF",
    publisher: "Fixture Agency",
    sourceGroup: "fixture",
    finalUrl: "https://example.org/fixture.pdf",
    documentDateState: "unknown",
    pageNumbers: [1],
    pageArtifactKeys: ["ocr-page-markdown/sources/0001_fixture_pdf/pages/0001/page.md"],
    markdownHash: "sha256:abc",
    sourceContentHash: "sha256:def",
  },
  pageProfile: {
    documentMode: "project_brochure",
    pageRole: "substantive",
    containsInterventionEvidence: true,
    containsMetricClaim: true,
    containsTable: false,
    containsMapOrFigure: false,
    extractionShouldProceed: true,
  },
  evidenceSpans: [
    {
      spanId: "span-1",
      pageRefs: [1],
      quote: "Average bus speeds increased by 5% after launch.",
      quoteHash: "sha256:span",
      spanRole: "metric_support",
    },
  ],
  entityMentions: [],
  claims: [
    {
      claimId: "claim-1",
      evidenceSpanIds: ["span-1"],
      claimKind: "official_metric_claim",
      claimText: "Average bus speeds increased by 5% after launch.",
      factAuthority: "agency_self_reported_metric",
      metric: {
        metricName: "bus_speed",
        valueText: "5%",
        unit: "percent",
        direction: "increase",
        metricAuthority: "document_claim_only",
      },
      entityMentionIds: [],
      researchUseTags: ["detector_evidence"],
      needsDeterministicMetric: true,
      caveatCodes: [],
    },
  ],
  tables: [],
  interventionEvents: [],
  serviceChanges: [],
  contextSignals: [],
  reviewQuestions: [],
  extractionAudit: {
    promptVersion: "tier2-structured-extraction-v1",
    modelId: "fixture-model",
    toolSchemaVersion: "bp.structured_document_extraction_tool_response.v1",
    extractedAt: "2026-06-01T00:00:00.000Z",
    pageWindowId: "fixture_pdf:1",
    candidateCounts: { claims: 1 },
    skippedReasons: [],
    modelNotes: "",
  },
};

async function seedRun(): Promise<{ runRoot: string; ocrPlanPath: string; auditPath: string }> {
  const runRoot = join(workingRoot, "docs-run");
  await rm(runRoot, { force: true, recursive: true });
  await mkdir(runRoot, { recursive: true });
  const markdownKey = "ocr-page-markdown/sources/0001_fixture_pdf/pages/0001/page.md";
  const markdownPath = join(runRoot, markdownKey);
  await mkdir(dirname(markdownPath), { recursive: true });
  await Bun.write(
    markdownPath,
    [
      "---",
      "sourceId: fixture_pdf",
      "pageNumber: 1",
      "---",
      "",
      "## Fixture busway",
      "",
      "Average bus speeds increased by 5% after launch.",
      "",
    ].join("\n"),
  );

  const ocrPlanPath = join(runRoot, "ocr-plan.json");
  await writeJson(ocrPlanPath, {
    version: 1,
    runId: "docs-run",
    generatedAt: "2026-06-01T00:00:00.000Z",
    captureManifestPath: join(runRoot, "capture-manifest.json"),
    outputPath: null,
    runtime: "pi-mono",
    provider: "openrouter",
    model: "fixture-ocr",
    api: "chat.completions",
    summary: {
      ocrRequiredSourceCount: 1,
      skippedSourceCount: 0,
      totalBytes: 10,
      totalMegabytes: 0,
    },
    sources: [
      {
        sourceId: "fixture_pdf",
        title: "Fixture PDF",
        publisher: "Fixture Agency",
        sourceGroup: "fixture",
        sourceUrl: "https://example.org/fixture.pdf",
        finalUrl: "https://example.org/fixture.pdf",
        rawArtifactKey: "raw/fixture.pdf",
        byteLength: 10,
        sha256: "sha256:source",
        pageRange: "1",
        inputMode: "openrouter_pdf_file_or_rendered_pages",
        reviewState: "triage_ready",
        nextAction: "ocr",
      },
    ],
  });

  const auditPath = join(runRoot, "ocr-page-markdown-audit.json");
  await writeJson(auditPath, {
    version: 1,
    runId: "docs-run",
    generatedAt: "2026-06-01T00:00:00.000Z",
    ocrPlanPath,
    outputPath: null,
    pageMarkdownRootName: "ocr-page-markdown",
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
      totalMarkdownChars: 80,
      issueCounts: {},
    },
    sources: [
      {
        sourceId: "fixture_pdf",
        title: "Fixture PDF",
        publisher: "Fixture Agency",
        sourceGroup: "fixture",
        sourceUrl: "https://example.org/fixture.pdf",
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
        totalMarkdownChars: 80,
        issueCounts: {},
        pages: [
          {
            sourceId: "fixture_pdf",
            title: "Fixture PDF",
            publisher: "Fixture Agency",
            sourceGroup: "fixture",
            pageNumber: 1,
            status: "ocr_complete",
            markdownArtifactKey: markdownKey,
            toolCallArtifactKey: "ocr-page-markdown/sources/0001_fixture_pdf/pages/0001/tool.json",
            responseArtifactKey:
              "ocr-page-markdown/sources/0001_fixture_pdf/pages/0001/response.json",
            errorArtifactKey: null,
            renderArtifactKey: null,
            inputArtifactKey: null,
            markdownCharCount: 80,
            markdownBodyCharCount: 60,
            containsTables: false,
            containsMaps: false,
            containsCharts: false,
            blankPageLikely: false,
            needsVisualReview: false,
            routesMentioned: [],
            corridorsMentioned: [],
            datesMentioned: [],
            metricHints: [],
            visualReviewHints: [],
            issueCodes: [],
            error: null,
          },
        ],
      },
    ],
  });
  return { runRoot, ocrPlanPath, auditPath };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("structured extraction validation", () => {
  test("accepts quote-backed document metric claims", () => {
    const extraction = StructuredDocumentExtractionToolResponseSchema.parse(VALID_TOOL_RESPONSE);
    const issues = validateStructuredExtraction({
      extraction,
      markdownBody: "Average bus speeds increased by 5% after launch.",
      expectedSourceId: "fixture_pdf",
      expectedPageNumbers: [1],
    });

    expect(issues).toEqual([]);
  });

  test("flags fabricated quotes, unsupported metric values, and project metric authority", () => {
    const extraction = StructuredDocumentExtractionToolResponseSchema.parse(VALID_TOOL_RESPONSE);
    const issues = validateStructuredExtraction({
      extraction: {
        ...extraction,
        evidenceSpans: [
          {
            ...extraction.evidenceSpans[0]!,
            quote: "This quote does not exist.",
          },
        ],
        claims: [
          {
            ...extraction.claims[0]!,
            metric: {
              ...extraction.claims[0]!.metric!,
              valueText: "99%",
              metricAuthority: "deterministic_project_metric",
            },
          },
        ],
      },
      markdownBody: "Average bus speeds increased by 5% after launch.",
      expectedSourceId: "fixture_pdf",
      expectedPageNumbers: [1],
    });

    expect(issues.map((issue) => issue.code)).toContain("quote_not_found");
    expect(issues.map((issue) => issue.code)).toContain("metric_value_text_not_supported");
    expect(issues.map((issue) => issue.code)).toContain(
      "document_claim_uses_project_metric_authority",
    );
  });
});

describe("extractTier2StructuredDocuments", () => {
  test("plans deterministic page windows without executing LLM calls", async () => {
    const { ocrPlanPath, auditPath } = await seedRun();
    const outputPath = join(workingRoot, "docs-run", "structured-extraction.json");
    const artifact = await extractTier2StructuredDocuments({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      outputPath,
      generatedAt: "2026-06-01T00:00:00.000Z",
      execute: false,
    });

    expect(artifact.summary.windowCount).toBe(1);
    expect(artifact.summary.plannedWindowCount).toBe(1);
    expect(artifact.windows[0]?.status).toBe("planned");
    expect(artifact.extractions).toEqual([]);
    expect(await Bun.file(outputPath).exists()).toBe(true);
  });
});
