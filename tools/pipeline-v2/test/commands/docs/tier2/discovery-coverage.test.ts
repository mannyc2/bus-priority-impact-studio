import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildTier2DiscoveryCoverage } from "../../../../src/commands/docs/tier2/_discovery-coverage.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-discovery-coverage");

function page(pageNumber: number, markdownArtifactKey: string) {
  return {
    sourceId: "fixture_pdf",
    title: "Fixture PDF",
    publisher: "Fixture Agency",
    sourceGroup: "fixture",
    pageNumber,
    status: "ocr_complete",
    markdownArtifactKey,
    toolCallArtifactKey: null,
    responseArtifactKey: null,
    errorArtifactKey: null,
    renderArtifactKey: null,
    inputArtifactKey: null,
    markdownCharCount: 120,
    markdownBodyCharCount: 100,
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
  };
}

function extraction(promptVersion: string, pageNumber: number) {
  const evidenceRef = {
    blockId: "B0001",
    pageNumber,
    lineStart: 1,
    lineEnd: 1,
    blockHash: `sha256:block-${pageNumber}`,
  };
  return {
    source: {
      sourceId: "fixture_pdf",
      sourceTitle: "Fixture PDF",
      publisher: "Fixture Agency",
      sourceGroup: "fixture",
      finalUrl: "https://example.org/fixture.pdf",
      documentDateState: "unknown",
      pageNumbers: [pageNumber],
      pageArtifactKeys: [
        `ocr-page-markdown/sources/0001_fixture_pdf/pages/${String(pageNumber).padStart(4, "0")}/page.md`,
      ],
      markdownHash: `sha256:markdown-${pageNumber}`,
      blockIndexHash: `sha256:block-index-${pageNumber}`,
      sourceContentHash: "sha256:source",
    },
    pageProfile: {
      documentModeRaw: "fixture",
      pageRolesRaw: ["substantive"],
      contentTypesRaw: ["claim"],
      discoveryShouldProceed: true,
    },
    entities: [],
    metrics: [],
    events: [],
    tables: [],
    claims: [
      {
        claimId: `claim-${pageNumber}`,
        claimText: "Fixture claim.",
        claimKindRaw: "performance_observation",
        evidenceRefs: [evidenceRef],
      },
    ],
    contextSignals: [],
    reviewQuestions: [],
    extractionAudit: {
      promptVersion,
      toolSchemaVersion: "1",
      modelId: "fixture-model",
      extractedAt: "2026-06-02T00:00:00.000Z",
      pageWindowId: `fixture_pdf:${pageNumber}`,
      candidateCounts: { claims: 1 },
    },
    extractionId: `extraction-${pageNumber}`,
    validationState: "extracted",
    validationIssues: [],
  };
}

async function seedRun(): Promise<{
  ocrPlanPath: string;
  auditPath: string;
  discoveryRoot: string;
}> {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });

  const ocrPlanPath = join(workingRoot, "ocr-plan.json");
  await writeJson(ocrPlanPath, {
    version: 1,
    runId: "docs-run",
    generatedAt: "2026-06-02T00:00:00.000Z",
    captureManifestPath: join(workingRoot, "capture-manifest.json"),
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
        pageRange: "1-3",
        inputMode: "openrouter_pdf_file_or_rendered_pages",
        reviewState: "triage_ready",
        nextAction: "ocr",
      },
    ],
  });

  const pages = [1, 2, 3].map((pageNumber) =>
    page(
      pageNumber,
      `ocr-page-markdown/sources/0001_fixture_pdf/pages/${String(pageNumber).padStart(4, "0")}/page.md`,
    ),
  );
  const auditPath = join(workingRoot, "ocr-page-markdown-audit.json");
  await writeJson(auditPath, {
    version: 1,
    runId: "docs-run",
    generatedAt: "2026-06-02T00:00:00.000Z",
    ocrPlanPath,
    outputPath: null,
    pageMarkdownRootName: "ocr-page-markdown",
    summary: {
      plannedSourceCount: 1,
      sourceCount: 1,
      pageCount: 3,
      completePageCount: 3,
      failedPageCount: 0,
      missingPageCount: 0,
      toolCallCount: 3,
      responseCount: 3,
      tablePageCount: 0,
      mapPageCount: 0,
      chartPageCount: 0,
      likelyBlankPageCount: 0,
      visualReviewPageCount: 0,
      totalMarkdownChars: 360,
      issueCounts: {},
    },
    sources: [
      {
        sourceId: "fixture_pdf",
        title: "Fixture PDF",
        publisher: "Fixture Agency",
        sourceGroup: "fixture",
        sourceUrl: "https://example.org/fixture.pdf",
        pdfPageCount: 3,
        pageCount: 3,
        completePageCount: 3,
        failedPageCount: 0,
        missingPageCount: 0,
        tablePageCount: 0,
        mapPageCount: 0,
        chartPageCount: 0,
        likelyBlankPageCount: 0,
        visualReviewPageCount: 0,
        totalMarkdownChars: 360,
        issueCounts: {},
        pages,
      },
    ],
  });

  const discoveryRoot = join(workingRoot, "document-discovery-fixture");
  await mkdir(join(discoveryRoot, "sources", "0001_fixture_pdf", "windows", "0001-0001"), {
    recursive: true,
  });
  await mkdir(join(discoveryRoot, "sources", "0001_fixture_pdf", "windows", "0002-0002"), {
    recursive: true,
  });
  await writeJson(
    join(
      discoveryRoot,
      "sources",
      "0001_fixture_pdf",
      "windows",
      "0001-0001",
      "document-discovery.json",
    ),
    extraction("tier2-document-discovery-v1", 1),
  );
  await writeJson(
    join(
      discoveryRoot,
      "sources",
      "0001_fixture_pdf",
      "windows",
      "0002-0002",
      "document-discovery.json",
    ),
    extraction("tier2-document-discovery-old", 2),
  );

  return { ocrPlanPath, auditPath, discoveryRoot };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 discovery coverage", () => {
  test("audits current, old-schema, and missing windows and writes a runnable manifest", async () => {
    const { ocrPlanPath, auditPath, discoveryRoot } = await seedRun();
    const outputPath = join(workingRoot, "coverage.json");
    const missingWindowManifestPath = join(workingRoot, "missing-windows.json");

    const coverage = await buildTier2DiscoveryCoverage({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      discoveryRoots: [discoveryRoot],
      pageWindowSize: 1,
      outputPath,
      missingWindowManifestPath,
      generatedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(coverage.summary.windowCount).toBe(3);
    expect(coverage.summary.discoveredWindowCount).toBe(1);
    expect(coverage.summary.needsRerunOldSchemaWindowCount).toBe(1);
    expect(coverage.summary.missingWindowCount).toBe(1);
    expect(coverage.summary.runnableMissingWindowCount).toBe(2);
    expect(coverage.windows.map((window) => window.status)).toEqual([
      "discovered",
      "needs_rerun_old_schema",
      "missing",
    ]);

    const manifest = await Bun.file(missingWindowManifestPath).json();
    expect(manifest.windowCount).toBe(2);
    expect(manifest.windows.map((window: { windowId: string }) => window.windowId)).toEqual([
      "fixture_pdf:2",
      "fixture_pdf:3",
    ]);
  });
});
