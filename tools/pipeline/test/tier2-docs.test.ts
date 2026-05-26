import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  auditTier2InterventionDuplicates,
  buildTier2DuplicateDecisionTemplate,
  buildTier2DuplicateReviewQueue,
  buildTier2PipelineStatus,
  captureTier2Docs,
  chunkTier2Documents,
  discoverTier2Docs,
  extractTier2Candidates,
  loadTier2InterventionStaging,
  ocrTier2PageMarkdown,
  planTier2FollowupOcr,
  planTier2Ocr,
  type Tier2Backlog,
  verifyTier2DuplicateDecisions,
  verifyTier2ManualInterventions,
} from "../src/jobs/docs/tier2-docs.js";

let workingRoot: string | null = null;

afterEach(async () => {
  if (workingRoot !== null) {
    await rm(workingRoot, { force: true, recursive: true });
    workingRoot = null;
  }
});

async function makeWorkingRoot(): Promise<string> {
  workingRoot = await mkdtemp(join(tmpdir(), "bp-tier2-docs-"));
  return workingRoot;
}

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([200, 200]);
  }
  return pdf.save();
}

function responseBody(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}

describe("Tier 2 document corpus capture", () => {
  test("captures HTML text and queues OCR-required PDFs", async () => {
    const root = await makeWorkingRoot();
    const backlogPath = join(root, "backlog.json");
    const artifactRoot = join(root, "artifacts");
    const backlog: Tier2Backlog = {
      version: 1,
      updatedAt: "2026-05-24",
      sources: [
        {
          sourceId: "sample_pdf",
          url: "https://example.test/sample.pdf",
          title: "Sample Board Packet",
          publisher: "Example Agency",
          sourceGroup: "board_packet",
          intendedUse: ["review_question_candidate"],
          priority: 2,
          expectedContentType: "pdf",
          ocrHint: "required",
        },
        {
          sourceId: "sample_html",
          url: "https://example.test/sample.html",
          title: "Sample HTML",
          publisher: "Example Agency",
          sourceGroup: "ace_able",
          intendedUse: ["intervention_seed"],
          priority: 1,
          expectedContentType: "html",
          ocrHint: "not_needed",
        },
      ],
    };
    await Bun.write(backlogPath, JSON.stringify(backlog));

    const manifest = await captureTier2Docs({
      backlogPath,
      artifactRoot,
      runId: "test-run",
      fetchedAt: "2026-05-24T00:00:00.000Z",
      fetcher: async (url) => {
        if (String(url).endsWith(".html")) {
          return new Response(
            "<html><body><h1>ACE launch</h1><script>ignored()</script></body></html>",
            {
              headers: { "content-type": "text/html; charset=utf-8" },
            },
          );
        }
        return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]), {
          headers: { "content-type": "application/pdf" },
        });
      },
    });

    expect(manifest.summary).toEqual({
      sourceCount: 2,
      capturedCount: 2,
      failedCount: 0,
      htmlTextCount: 1,
      ocrRequiredCount: 1,
      metadataOnlyCount: 0,
      totalBytes: 79,
    });
    expect(manifest.sources.map((source) => source.sourceId)).toEqual([
      "sample_html",
      "sample_pdf",
    ]);

    const htmlSource = manifest.sources.find((source) => source.sourceId === "sample_html");
    expect(htmlSource).toEqual(
      expect.objectContaining({
        textExtractionStatus: "html_text",
        textLength: 10,
      }),
    );
    if (htmlSource?.textArtifactKey === null || htmlSource?.textArtifactKey === undefined) {
      throw new Error("Expected HTML text artifact.");
    }
    await expect(
      Bun.file(join(manifest.runArtifactRoot, htmlSource.textArtifactKey)).text(),
    ).resolves.toBe("ACE launch\n");

    const pdfSource = manifest.sources.find((source) => source.sourceId === "sample_pdf");
    expect(pdfSource).toEqual(
      expect.objectContaining({
        detectedContentType: "pdf",
        textExtractionStatus: "ocr_required",
        rawArtifactKey: "sources/sample_pdf/source.pdf",
      }),
    );

    const manifestPath = join(manifest.runArtifactRoot, "capture-manifest.json");
    const outputPath = join(manifest.runArtifactRoot, "ocr-plan.json");
    const plan = await planTier2Ocr({
      captureManifestPath: manifestPath,
      outputPath,
      generatedAt: "2026-05-24T00:01:00.000Z",
      model: "openai/gpt-5.5",
      defaultPageRange: "2-4",
    });

    expect(plan).toEqual(
      expect.objectContaining({
        runtime: "pi-mono",
        provider: "openrouter",
        model: "openai/gpt-5.5",
        summary: {
          ocrRequiredSourceCount: 1,
          skippedSourceCount: 1,
          totalBytes: 8,
          totalMegabytes: 0,
        },
      }),
    );
    expect(plan.sources).toEqual([
      expect.objectContaining({
        sourceId: "sample_pdf",
        pageRange: "2-4",
        inputMode: "openrouter_pdf_file_or_rendered_pages",
        reviewState: "triage_ready",
      }),
    ]);
    await expect(Bun.file(outputPath).json()).resolves.toEqual(plan);
  });



  test("writes page-level Markdown OCR with required tool calls and host provenance", async () => {
    const root = await makeWorkingRoot();
    const backlogPath = join(root, "backlog.json");
    const artifactRoot = join(root, "artifacts");
    const backlog: Tier2Backlog = {
      version: 1,
      updatedAt: "2026-05-24",
      sources: [
        {
          sourceId: "sample_pdf",
          url: "https://example.test/sample.pdf",
          title: "Sample Presentation",
          publisher: "Example Agency",
          sourceGroup: "bus_priority_document",
          intendedUse: ["document_table_candidate"],
          priority: 1,
          expectedContentType: "pdf",
          ocrHint: "required",
        },
      ],
    };
    await Bun.write(backlogPath, JSON.stringify(backlog));
    const pdfBytes = await makePdf(2);
    const manifest = await captureTier2Docs({
      backlogPath,
      artifactRoot,
      runId: "page-ocr-run",
      fetchedAt: "2026-05-24T00:00:00.000Z",
      fetcher: async () =>
        new Response(responseBody(pdfBytes), {
          headers: { "content-type": "application/pdf" },
        }),
    });
    const planPath = join(manifest.runArtifactRoot, "ocr-plan.json");
    await planTier2Ocr({
      captureManifestPath: join(manifest.runArtifactRoot, "capture-manifest.json"),
      outputPath: planPath,
      generatedAt: "2026-05-24T00:01:00.000Z",
      defaultPageRange: "1-2",
    });

    const seenToolChoices: unknown[] = [];
    const seenFileInputs: unknown[] = [];
    const seenReasoning: unknown[] = [];
    const pageOcr = await ocrTier2PageMarkdown({
      ocrPlanPath: planPath,
      generatedAt: "2026-05-24T00:02:00.000Z",
      execute: true,
      pageMarkdownRootName: "ocr-page-markdown-test",
      pageInputPreference: "auto",
      pageLimit: 1,
      apiKey: "test-key",
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        seenToolChoices.push(body.tool_choice);
        seenFileInputs.push(body.messages?.[0]?.content?.[1]?.type);
        seenReasoning.push(body.reasoning);
        return new Response(
          JSON.stringify({
            service_tier: "flex",
            choices: [
              {
                message: {
                  content: "",
                  tool_calls: [
                    {
                      id: "call_page_ocr",
                      type: "function",
                      function: {
                        name: "record_tier2_ocr_page",
                        arguments: JSON.stringify({
                          sourceId: "sample_pdf",
                          pageNumber: 1,
                          markdown: [
                            "# Sample Presentation",
                            "",
                            "| Route | Speed |",
                            "| --- | --- |",
                            "| B1 | 7 mph |",
                          ].join("\n"),
                          routesMentioned: ["B1"],
                          corridorsMentioned: ["Sample Street"],
                          datesMentioned: ["2026"],
                          metricHints: ["Speed: 7 mph"],
                          containsTables: true,
                          containsMaps: false,
                          containsCharts: false,
                          visualReviewHints: [],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { cost: 0.02 },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    expect(seenToolChoices).toEqual([
      { type: "function", function: { name: "record_tier2_ocr_page" } },
    ]);
    expect(seenFileInputs).toEqual(["file"]);
    expect(seenReasoning).toEqual([{ effort: "none" }]);
    expect(pageOcr.summary).toEqual(
      expect.objectContaining({
        ocrCompletePageCount: 1,
        ocrFailedPageCount: 0,
        pdfPageInputCount: 1,
        renderedImagePageCount: 0,
      }),
    );
    const page = pageOcr.sources[0]?.pages[0];
    expect(page).toEqual(
      expect.objectContaining({
        status: "ocr_complete",
        inputMode: "pdf_page",
        containsTables: true,
        routesMentioned: ["B1"],
      }),
    );
    if (page?.markdownArtifactKey === null || page?.markdownArtifactKey === undefined) {
      throw new Error("Expected page Markdown artifact.");
    }
    const markdown = await Bun.file(join(manifest.runArtifactRoot, page.markdownArtifactKey)).text();
    expect(markdown).toContain('ocrModel: "qwen/qwen3.7-max"');
    expect(markdown).toContain("inputSha256:");
    expect(markdown).toContain("| Route | Speed |");
    expect(markdown).toContain("routesMentioned: [\"B1\"]");
  });

  test("page Markdown OCR defaults to every page and fans out bounded page calls", async () => {
    const root = await makeWorkingRoot();
    const backlogPath = join(root, "backlog.json");
    const artifactRoot = join(root, "artifacts");
    const backlog: Tier2Backlog = {
      version: 1,
      updatedAt: "2026-05-24",
      sources: [
        {
          sourceId: "sample_pdf",
          url: "https://example.test/sample.pdf",
          title: "Sample Full Document",
          publisher: "Example Agency",
          sourceGroup: "bus_priority_document",
          intendedUse: ["document_table_candidate"],
          priority: 1,
          expectedContentType: "pdf",
          ocrHint: "required",
        },
      ],
    };
    await Bun.write(backlogPath, JSON.stringify(backlog));
    const pdfBytes = await makePdf(3);
    const manifest = await captureTier2Docs({
      backlogPath,
      artifactRoot,
      runId: "page-ocr-all-run",
      fetchedAt: "2026-05-24T00:00:00.000Z",
      fetcher: async () =>
        new Response(responseBody(pdfBytes), {
          headers: { "content-type": "application/pdf" },
        }),
    });
    const planPath = join(manifest.runArtifactRoot, "ocr-plan.json");
    await planTier2Ocr({
      captureManifestPath: join(manifest.runArtifactRoot, "capture-manifest.json"),
      outputPath: planPath,
      generatedAt: "2026-05-24T00:01:00.000Z",
      defaultPageRange: "1-2",
    });

    let activeRequests = 0;
    let maxActiveRequests = 0;
    const requestPageNumbers: number[] = [];
    const pageOcr = await ocrTier2PageMarkdown({
      ocrPlanPath: planPath,
      generatedAt: "2026-05-24T00:02:00.000Z",
      execute: true,
      pageMarkdownRootName: "ocr-page-markdown-all-test",
      pageInputPreference: "pdf",
      pageConcurrency: 2,
      apiKey: "test-key",
      fetcher: async (_url, init) => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        const body = JSON.parse(String(init?.body));
        const prompt = String(body.messages?.[0]?.content?.[0]?.text ?? "");
        const pageNumber = Number(prompt.match(/Page: (\d+) of/)?.[1] ?? "0");
        requestPageNumbers.push(pageNumber);
        await new Promise((resolve) => setTimeout(resolve, pageNumber === 1 ? 20 : 1));
        activeRequests -= 1;
        return new Response(
          JSON.stringify({
            service_tier: "flex",
            choices: [
              {
                message: {
                  content: "",
                  tool_calls: [
                    {
                      id: `call_page_${pageNumber}`,
                      type: "function",
                      function: {
                        name: "record_tier2_ocr_page",
                        arguments: JSON.stringify({
                          sourceId: "sample_pdf",
                          pageNumber,
                          markdown: `# Page ${pageNumber}`,
                          routesMentioned: [],
                          corridorsMentioned: [],
                          datesMentioned: [],
                          metricHints: [],
                          containsTables: false,
                          containsMaps: false,
                          containsCharts: false,
                          visualReviewHints: [],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { cost: 0.01 },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    expect(pageOcr.allPages).toBe(true);
    expect(pageOcr.pageLimit).toBeNull();
    expect(pageOcr.pageConcurrency).toBe(2);
    expect(pageOcr.summary).toEqual(
      expect.objectContaining({
        ocrCompletePageCount: 3,
        ocrFailedPageCount: 0,
        pdfPageInputCount: 3,
      }),
    );
    expect(pageOcr.sources[0]?.selectedPages).toEqual([1, 2, 3]);
    expect(requestPageNumbers.toSorted((left, right) => left - right)).toEqual([1, 2, 3]);
    expect(maxActiveRequests).toBe(2);
  });


  test("discovers official Tier 2 page and PDF links from captured HTML", async () => {
    const root = await makeWorkingRoot();
    const backlogPath = join(root, "backlog.json");
    const artifactRoot = join(root, "artifacts");
    const backlog: Tier2Backlog = {
      version: 1,
      updatedAt: "2026-05-24",
      sources: [
        {
          sourceId: "nyc_dot_brt_route_index",
          url: "https://www.nyc.gov/html/brt/html/routes/routes.shtml",
          title: "NYC DOT SBS Route Index",
          publisher: "NYC DOT",
          sourceGroup: "select_bus_service",
          intendedUse: ["sbs_launch_context"],
          priority: 1,
          expectedContentType: "html",
          ocrHint: "not_needed",
        },
      ],
    };
    await Bun.write(backlogPath, JSON.stringify(backlog));

    const manifest = await captureTier2Docs({
      backlogPath,
      artifactRoot,
      runId: "discover-run",
      fetchedAt: "2026-05-24T00:00:00.000Z",
      fetcher: async () =>
        new Response(
          [
            '<a href="webster.shtml">Webster Avenue Select Bus Service</a>',
            '<a href="/html/brt/downloads/pdf/brt-transit-signal-priority-july2017.pdf">Green Means Go report</a>',
            '<a href="../home/home.shtml">Home</a>',
            '<a href="https://example.com/outside.pdf">Outside</a>',
          ].join("\n"),
          { headers: { "content-type": "text/html; charset=utf-8" } },
        ),
    });

    const outputPath = join(manifest.runArtifactRoot, "discovery.json");
    const mergedBacklogPath = join(manifest.runArtifactRoot, "discovered-backlog.json");
    const discovery = await discoverTier2Docs({
      captureManifestPath: join(manifest.runArtifactRoot, "capture-manifest.json"),
      outputPath,
      mergedBacklogPath,
      generatedAt: "2026-05-24T00:02:00.000Z",
    });

    expect(discovery.summary).toEqual(
      expect.objectContaining({
        inputBacklogSourceCount: 1,
        capturedHtmlSourceCount: 1,
        extractedLinkCount: 4,
        candidateLinkCount: 2,
        newSourceCount: 2,
        mergedBacklogSourceCount: 3,
      }),
    );
    expect(discovery.sources.map((source) => source.sourceGroup)).toEqual([
      "select_bus_service",
      "transit_signal_priority",
    ]);
    expect(discovery.sources.find((source) => source.expectedContentType === "pdf")).toEqual(
      expect.objectContaining({
        ocrHint: "required",
        documentDate: "2017-07",
      }),
    );
    const mergedBacklog = (await Bun.file(mergedBacklogPath).json()) as Tier2Backlog;
    expect(mergedBacklog.sources).toHaveLength(3);
  });

  test("builds a focused follow-up OCR plan from follow-up candidates", async () => {
    const root = await makeWorkingRoot();
    const basePlanPath = join(root, "ocr-plan.json");
    const bundlePath = join(root, "candidate-bundle.json");
    const outputPath = join(root, "followup-ocr-plan.json");
    await Bun.write(
      basePlanPath,
      JSON.stringify({
        version: 1,
        runId: "base-run",
        generatedAt: "2026-05-24T00:00:00.000Z",
        captureManifestPath: join(root, "capture-manifest.json"),
        outputPath: basePlanPath,
        runtime: "pi-mono",
        provider: "openrouter",
        model: "google/gemini-3.5-flash",
        api: "chat.completions",
        summary: {
          ocrRequiredSourceCount: 2,
          skippedSourceCount: 0,
          totalBytes: 300,
          totalMegabytes: 0,
        },
        sources: [
          {
            sourceId: "later_pages",
            title: "Later Pages",
            publisher: "Example",
            sourceGroup: "bus_priority_document",
            sourceUrl: "https://example.test/later.pdf",
            finalUrl: "https://example.test/later.pdf",
            rawArtifactKey: "sources/later_pages/source.pdf",
            byteLength: 200,
            sha256: "sha256:later",
            pageRange: "1-10",
            inputMode: "openrouter_pdf_file_or_rendered_pages",
            reviewState: "triage_ready",
            nextAction: "baseline",
          },
          {
            sourceId: "lower_priority",
            title: "Lower Priority",
            publisher: "Example",
            sourceGroup: "bus_priority_document",
            sourceUrl: "https://example.test/lower.pdf",
            finalUrl: "https://example.test/lower.pdf",
            rawArtifactKey: "sources/lower_priority/source.pdf",
            byteLength: 100,
            sha256: "sha256:lower",
            pageRange: "1-10",
            inputMode: "openrouter_pdf_file_or_rendered_pages",
            reviewState: "triage_ready",
            nextAction: "baseline",
          },
        ],
      }),
    );
    await Bun.write(
      bundlePath,
      JSON.stringify({
        version: 1,
        runId: "base-run",
        generatedAt: "2026-05-24T00:01:00.000Z",
        ocrPlanPath: basePlanPath,
        ocrQualityReviewPath: join(root, "ocr-quality-review.json"),
        outputPath: bundlePath,
        triageRootName: "ocr-triage",
        summary: {},
        documentSourceCandidates: [],
        documentEntityLinkCandidates: [],
        documentInterventionSeeds: [],
        reviewQuestionCandidates: [],
        followupOcrCandidates: [
          {
            candidateType: "followup_ocr_candidate",
            candidateId: "followup_ocr:lower_priority:1_10",
            sourceRef: { sourceId: "lower_priority" },
            suggestedPageRange: "1-10",
            reason: "medium",
            priority: "medium",
            validationState: "needs_review",
          },
          {
            candidateType: "followup_ocr_candidate",
            candidateId: "followup_ocr:later_pages:11_20",
            sourceRef: { sourceId: "later_pages" },
            suggestedPageRange: "11-20",
            reason: "high",
            priority: "high",
            validationState: "needs_review",
          },
        ],
        llmExtractionAudits: [],
      }),
    );

    const plan = await planTier2FollowupOcr({
      candidateBundlePath: bundlePath,
      outputPath,
      generatedAt: "2026-05-24T00:02:00.000Z",
      limit: 1,
    });

    expect(plan.summary).toEqual({
      ocrRequiredSourceCount: 1,
      skippedSourceCount: 1,
      totalBytes: 200,
      totalMegabytes: 0,
    });
    expect(plan.sources).toEqual([
      expect.objectContaining({
        sourceId: "later_pages",
        pageRange: "11-20",
      }),
    ]);
    await expect(Bun.file(outputPath).json()).resolves.toEqual(plan);
  });


  test("builds a duplicate review queue with source context", async () => {
    const root = await makeWorkingRoot();
    const canonicalPath = join(root, "tier2-intervention-events.json");
    const duplicateAuditPath = join(root, "tier2-intervention-duplicate-audit.json");
    const candidateBundlePath = join(root, "candidate-bundle.json");
    const outputPath = join(root, "tier2-intervention-duplicate-review.json");
    const canonical = {
      version: 1,
      runId: "duplicate-run",
      generatedAt: "2026-05-24T00:00:00.000Z",
      candidateValidationPath: "/tmp/candidate-validation.json",
      outputPath: canonicalPath,
      summary: {
        eventCount: 2,
        routeEventCount: 2,
        sourceCount: 1,
      },
      events: [
        {
          eventId: "event-a",
          candidateId: "candidate-a",
          sourceId: "source-a",
          routeIds: ["B1"],
          interventionType: "select_bus_service_launch",
          implementationDate: "2026-05",
          implementationMonth: "2026-05",
          datePrecision: "month",
          eventStatus: "implemented",
          validationState: "validated",
          sourceSpanChunkIds: ["chunk-a"],
        },
        {
          eventId: "event-b",
          candidateId: "candidate-b",
          sourceId: "source-a",
          routeIds: ["B1"],
          interventionType: "select_bus_service_launch",
          implementationDate: "2026-05",
          implementationMonth: "2026-05",
          datePrecision: "month",
          eventStatus: "implemented",
          validationState: "validated",
          sourceSpanChunkIds: ["chunk-b"],
        },
      ],
    };
    const duplicateAudit = {
      version: 1,
      runId: "duplicate-run",
      generatedAt: "2026-05-24T00:01:00.000Z",
      canonicalEventsPath: canonicalPath,
      outputPath: duplicateAuditPath,
      summary: {
        eventCount: 2,
        fingerprintCount: 1,
        duplicateGroupCount: 1,
        duplicateEventCount: 2,
        uniqueEventCount: 0,
        eventsNeedingReviewCount: 2,
      },
      groups: [
        {
          fingerprint: "select_bus_service_launch|2026-05|month|B1",
          reviewState: "duplicate_candidate",
          interventionType: "select_bus_service_launch",
          implementationDate: "2026-05",
          datePrecision: "month",
          routeIds: ["B1"],
          eventIds: ["event-a", "event-b"],
          candidateIds: ["candidate-a", "candidate-b"],
          sourceIds: ["source-a"],
          sourceSpanChunkIds: ["chunk-a", "chunk-b"],
        },
      ],
    };
    const sourceRef = {
      sourceId: "source-a",
      sourceUrl: "https://example.test/source-a.pdf",
      title: "Source A",
      publisher: "Example Agency",
      documentDate: null,
      sourceGroup: "sbs",
      artifactKeys: {
        raw: null,
        text: null,
        ocrText: null,
        ocrJson: null,
        ocrAnnotations: null,
      },
      pages: [1],
    };
    const candidateBundle = {
      version: 1,
      runId: "duplicate-run",
      generatedAt: "2026-05-24T00:02:00.000Z",
      ocrPlanPath: "/tmp/ocr-plan.json",
      ocrQualityReviewPath: "/tmp/ocr-review.json",
      outputPath: candidateBundlePath,
      summary: {
        sourceCandidateCount: 1,
        evidenceCandidateCount: 2,
        reviewQuestionCandidateCount: 0,
        followupOcrCandidateCount: 0,
        auditCount: 0,
        unvalidatedCandidateCount: 2,
      },
      documentSourceCandidates: [
        {
          candidateType: "document_source_candidate",
          candidateId: "source-candidate-a",
          sourceId: "source-a",
          sourceUrl: "https://example.test/source-a.pdf",
          finalUrl: "https://example.test/source-a.pdf",
          title: "Source A",
          publisher: "Example Agency",
          sourceGroup: "sbs",
          intendedUse: ["intervention_seed"],
          priority: 1,
          documentDate: null,
          retrievedAt: null,
          captureStatus: "captured",
          detectedContentType: "pdf",
          textExtractionStatus: "ocr_required",
          contentSha256: null,
          rawArtifactKey: null,
          textArtifactKey: null,
          termsNote: null,
          validationState: "unvalidated",
        },
      ],
      documentEvidenceCandidates: [
        {
          candidateType: "document_treatment_component_candidate",
          candidateId: "candidate-a",
          sourceRef,
          factClassification: "official_claim",
          negativeEvidenceFlag: "none",
          routeMentions: ["B1"],
          corridorMentions: ["Sample Street"],
          evidencePageRefs: [1],
          evidenceQuote: "B1 SBS launch May 2026.",
          summary: "Fixture candidate A.",
          fields: {},
          validationState: "unvalidated",
          reviewReason: "fixture",
        },
        {
          candidateType: "document_treatment_component_candidate",
          candidateId: "candidate-b",
          sourceRef,
          factClassification: "official_claim",
          negativeEvidenceFlag: "none",
          routeMentions: ["B1"],
          corridorMentions: ["Sample Street"],
          evidencePageRefs: [1],
          evidenceQuote: "B1 SBS launch May 2026.",
          summary: "Fixture candidate B.",
          fields: {},
          validationState: "unvalidated",
          reviewReason: "fixture",
        },
      ],
      reviewQuestionCandidates: [],
      followupOcrCandidates: [],
      llmExtractionAudits: [],
    };
    await Bun.write(canonicalPath, JSON.stringify(canonical));
    await Bun.write(duplicateAuditPath, JSON.stringify(duplicateAudit));
    await Bun.write(candidateBundlePath, JSON.stringify(candidateBundle));

    const queue = await buildTier2DuplicateReviewQueue({
      canonicalEventsPath: canonicalPath,
      duplicateAuditPath,
      candidateBundlePath,
      outputPath,
      generatedAt: "2026-05-24T00:03:00.000Z",
    });

    expect(queue.summary).toEqual({
      duplicateGroupCount: 1,
      duplicateEventCount: 2,
      singleSourceGroupCount: 1,
      multiSourceGroupCount: 0,
    });
    expect(queue.items[0]).toEqual(
      expect.objectContaining({
        fingerprint: "select_bus_service_launch|2026-05|month|B1",
        recommendation: "collapse_single_source_duplicates",
        eventCount: 2,
        sourceCount: 1,
      }),
    );
    expect(queue.items[0]?.events.map((event) => event.interventionFamily)).toEqual([
      null,
      null,
    ]);
    expect(queue.items[0]?.events[0]).toEqual(
      expect.objectContaining({
        sourceTitle: "Source A",
        sourceUrl: "https://example.test/source-a.pdf",
        routeMentions: ["B1"],
        dateMentions: [],
      }),
    );
    await expect(Bun.file(outputPath).json()).resolves.toEqual(queue);

    const decisionPath = join(root, "tier2-intervention-duplicate-decisions.json");
    const decisionTemplate = await buildTier2DuplicateDecisionTemplate({
      duplicateReviewPath: outputPath,
      outputPath: decisionPath,
      generatedAt: "2026-05-24T00:04:00.000Z",
    });

    expect(decisionTemplate.summary).toEqual({
      duplicateGroupCount: 1,
      duplicateEventCount: 2,
      needsHumanReviewCount: 1,
      collapseSuggestedCount: 1,
      keepSeparateSuggestedCount: 0,
    });
    expect(decisionTemplate.decisions[0]).toEqual(
      expect.objectContaining({
        fingerprint: "select_bus_service_launch|2026-05|month|B1",
        currentDecision: "needs_human_review",
        suggestedDecision: "collapse_to_one_event",
        selectedEventId: "event-a",
        eventIds: ["event-a", "event-b"],
      }),
    );
    await expect(Bun.file(decisionPath).json()).resolves.toEqual(decisionTemplate);

    const verificationPath = join(root, "tier2-intervention-duplicate-decision-verification.json");
    const verification = await verifyTier2DuplicateDecisions({
      duplicateDecisionsPath: decisionPath,
      outputPath: verificationPath,
      generatedAt: "2026-05-24T00:05:00.000Z",
    });

    expect(verification.complete).toBe(false);
    expect(verification.summary).toEqual({
      decisionCount: 1,
      duplicateEventCount: 2,
      completeDecisionCount: 0,
      incompleteDecisionCount: 1,
      needsHumanReviewCount: 1,
      collapseDecisionCount: 0,
      keepSeparateDecisionCount: 0,
      invalidCollapseSelectionCount: 0,
      missingReviewerCount: 1,
      missingReviewedAtCount: 1,
      missingRationaleCount: 0,
    });
    expect(verification.incompleteFingerprints).toEqual([
      "select_bus_service_launch|2026-05|month|B1",
    ]);
    await expect(Bun.file(verificationPath).json()).resolves.toEqual(verification);

    const reviewedDecisionTemplate = {
      ...decisionTemplate,
      decisions: decisionTemplate.decisions.map((item) => ({
        ...item,
        currentDecision: "collapse_to_one_event" as const,
        selectedEventId: "event-a",
        reviewer: "fixture-reviewer",
        reviewedAt: "2026-05-25T00:00:00.000Z",
        rationale: "Fixture collapse keeps the first single-source duplicate.",
      })),
    };
    await Bun.write(decisionPath, JSON.stringify(reviewedDecisionTemplate));
    const reviewedVerification = await verifyTier2DuplicateDecisions({
      duplicateDecisionsPath: decisionPath,
      generatedAt: "2026-05-25T00:01:00.000Z",
    });
    expect(reviewedVerification.complete).toBe(true);

    const stagingDbPath = join(root, "duplicate-staging.sqlite");
    const loadReport = await loadTier2InterventionStaging({
      canonicalEventsPath: canonicalPath,
      duplicateAuditPath,
      candidateBundlePath,
      duplicateDecisionsPath: decisionPath,
      dbPath: stagingDbPath,
      generatedAt: "2026-05-25T00:02:00.000Z",
    });

    expect(loadReport.summary).toEqual({
      eventCount: 2,
      routeEventCount: 2,
      sourceSpanCount: 2,
      eligibleForTimelineCount: 1,
      blockedDuplicateReviewCount: 0,
      suppressedDuplicateCount: 1,
      completeDuplicateDecisionCount: 1,
      incompleteDuplicateDecisionCount: 0,
    });
    const stagingSqlite = new Database(stagingDbPath);
    try {
      expect(
        stagingSqlite
          .query(
            "select event_id, promotion_state from local_tier2_intervention_event order by event_id",
          )
          .all(),
      ).toEqual([
        { event_id: "event-a", promotion_state: "eligible_for_timeline" },
        { event_id: "event-b", promotion_state: "suppressed_duplicate" },
      ]);
    } finally {
      stagingSqlite.close();
    }
  });

  test("verifies manually enriched intervention candidates", async () => {
    const root = await makeWorkingRoot();
    const manualPath = join(root, "manual-intervention-candidates.json");
    const canonicalEventsPath = join(root, "tier2-intervention-events-combined.json");
    const candidateBundlePath = join(root, "candidate-bundle-combined.json");
    const documentChunksPath = join(root, "document-chunks-combined.json");
    const outputPath = join(root, "manual-intervention-candidate-verification.json");

    await Bun.write(
      manualPath,
      JSON.stringify({
        version: 1,
        runId: "manual-run",
        generatedAt: "2026-05-25T00:00:00.000Z",
        reviewState: "manual_batch_in_progress",
        reviewedCluster: "Fixture",
        sourceArtifacts: {},
        summary: { candidateCount: 1 },
        eventDispositions: [
          {
            eventId: "tier2:busway_launch:fixture",
            disposition: "curated",
            candidateId: "manual_intervention:fixture_busway:2020_01_02",
            reason: "Fixture event is directly represented by the manually curated busway launch.",
          },
        ],
        candidates: [
          {
            candidateId: "manual_intervention:fixture_busway:2020_01_02",
            reviewState: "manual_curated",
            qualityTier: "canonical_milestone",
            canonicalName: "Fixture Busway launch",
            status: "implemented",
            program: "Busway",
            interventionType: "busway_launch",
            implementationDate: "2020-01-02",
            datePrecision: "day",
            dateRole: "launch",
            routesAffected: ["M1"],
            routeRoles: [{ routeId: "M1", role: "affected" }],
            location: {
              borough: "Manhattan",
              corridor: "Fixture Street",
              from: "1st Avenue",
              to: "2nd Avenue",
              directionality: ["northbound"],
              notes: null,
            },
            components: [
              {
                componentId: "component:fixture:busway",
                componentType: "busway_restriction",
                status: "implemented",
                description: "Fixture busway restriction.",
                extent: {
                  corridor: "Fixture Street",
                  from: "1st Avenue",
                  to: "2nd Avenue",
                },
                details: { hours: "6 AM-10 PM" },
                evidenceRefs: ["evidence:fixture:launch"],
              },
            ],
            evidence: [
              {
                evidenceId: "evidence:fixture:launch",
                sourceId: "fixture_source",
                sourceTitle: "Fixture Source",
                pageRefs: [1],
                chunkIds: ["chunk:fixture_source:1"],
                excerpt: "Fixture source says the busway launched on January 2, 2020.",
                supports: [
                  "canonicalName",
                  "implementationDate",
                  "routesAffected",
                  "location",
                  "components[0]",
                ],
              },
            ],
            sourceEventIds: ["tier2:busway_launch:fixture"],
            sourceCandidateIds: ["document_evidence:fixture_source:busway:fixture"],
            disposition: "curated",
            review: {
              reviewer: "test",
              reviewedAt: "2026-05-25",
              notes: "Fixture.",
            },
          },
        ],
        reviewLog: [],
      }),
    );
    await Bun.write(
      canonicalEventsPath,
      JSON.stringify({
        version: 1,
        runId: "manual-run",
        generatedAt: "2026-05-25T00:00:00.000Z",
        candidateValidationPath: "candidate-validation.json",
        outputPath: null,
        summary: { eventCount: 1, routeEventCount: 1, sourceCount: 1 },
        events: [
          {
            eventId: "tier2:busway_launch:fixture",
            candidateId: "intervention_seed:fixture_source:busway:fixture",
            sourceId: "fixture_source",
            routeIds: ["M1"],
            interventionType: "busway_launch",
            implementationDate: "2020-01-02",
            implementationMonth: "2020-01",
            datePrecision: "day",
            eventStatus: "implemented",
            validationState: "validated",
            sourceSpanChunkIds: ["chunk:fixture_source:1"],
          },
        ],
      }),
    );
    await Bun.write(
      candidateBundlePath,
      JSON.stringify({
        version: 1,
        runId: "manual-run",
        generatedAt: "2026-05-25T00:00:00.000Z",
        ocrPlanPath: "ocr-plan.json",
        ocrQualityReviewPath: "ocr-quality-review.json",
        outputPath: null,
        triageRootName: "ocr-triage",
        summary: {
          sourceCandidateCount: 0,
          entityLinkCandidateCount: 0,
          interventionSeedCount: 1,
          reviewQuestionCandidateCount: 0,
          followupOcrCandidateCount: 0,
          auditCount: 0,
          unvalidatedCandidateCount: 1,
        },
        documentSourceCandidates: [],
        documentEntityLinkCandidates: [],
        documentInterventionSeeds: [
          {
            candidateType: "document_intervention_seed",
            candidateId: "intervention_seed:fixture_source:busway:fixture",
            sourceRef: {
              sourceId: "fixture_source",
              sourceUrl: "https://example.test/source.pdf",
              title: "Fixture Source",
              publisher: "Fixture",
              documentDate: null,
              sourceGroup: "fixture",
              artifactKeys: {
                raw: null,
                text: null,
                ocrText: null,
                ocrJson: null,
                ocrAnnotations: null,
              },
              pages: [1],
            },
            interventionFamily: "busway",
            routeMentions: ["M1"],
            corridorMentions: ["Fixture Street"],
            dateMentions: ["January 2, 2020"],
            status: "candidate_from_ocr_triage",
            validationState: "unvalidated",
            reviewReason: "Fixture.",
          },
        ],
        documentEvidenceCandidates: [
          {
            candidateType: "document_treatment_component_candidate",
            candidateId: "document_evidence:fixture_source:busway:fixture",
            sourceRef: {
              sourceId: "fixture_source",
              sourceUrl: "https://example.test/source.pdf",
              title: "Fixture Source",
              publisher: "Fixture",
              documentDate: null,
              sourceGroup: "fixture",
              artifactKeys: {
                raw: null,
                text: null,
                ocrText: null,
                ocrJson: null,
                ocrAnnotations: null,
              },
              pages: [1],
            },
            factClassification: "official_claim",
            negativeEvidenceFlag: "none",
            routeMentions: ["M1"],
            corridorMentions: ["Fixture Street"],
            evidencePageRefs: [1],
            evidenceQuote:
              "Fixture source says the busway launched on January 2, 2020.",
            summary: "Fixture busway launch component.",
            fields: {},
            validationState: "unvalidated",
            reviewReason: "Fixture.",
          },
        ],
        reviewQuestionCandidates: [],
        followupOcrCandidates: [],
        llmExtractionAudits: [],
      }),
    );
    await Bun.write(
      documentChunksPath,
      JSON.stringify({
        version: 1,
        runId: "manual-run",
        generatedAt: "2026-05-25T00:00:00.000Z",
        candidateBundlePath,
        outputPath: null,
        summary: { sourceCount: 1, chunkCount: 1, htmlChunkCount: 0, ocrChunkCount: 1 },
        chunks: [
          {
            chunkId: "chunk:fixture_source:1",
            sourceId: "fixture_source",
            extractionMode: "ocr_annotation_text",
            artifactKey: "fixture.json",
            pageRefs: [1],
            textHash: "sha256:fixture",
            charLength: 64,
            excerpt: "Fixture source says the busway launched on January 2, 2020.",
            text: "Fixture source says the busway launched on January 2, 2020.",
          },
        ],
      }),
    );

    const verification = await verifyTier2ManualInterventions({
      manualInterventionsPath: manualPath,
      canonicalEventsPath,
      candidateBundlePath,
      documentChunksPath,
      outputPath,
      generatedAt: "2026-05-25T00:00:00.000Z",
    });

    expect(verification.complete).toBe(true);
    expect(verification.summary).toEqual({
      candidateCount: 1,
      completeCandidateCount: 1,
      issueCount: 0,
      canonicalMilestoneCount: 1,
      implementedTreatmentComponentCount: 0,
      plannedOrProposedCount: 0,
      canonicalEventCount: 1,
      eventDispositionCount: 1,
      undispositionedEventCount: 0,
    });
    expect(verification.candidateIssues).toEqual([]);
    expect(verification.eventDispositionIssues).toEqual([]);
    await expect(Bun.file(outputPath).json()).resolves.toEqual(verification);
  });

  test("summarizes Tier 2 pipeline completion gates from artifacts", async () => {
    const root = await makeWorkingRoot();
    const artifactRoot = root;
    const runId = "status-run";
    const runRoot = join(artifactRoot, "docs", runId);
    await mkdir(runRoot, { recursive: true });
    await Bun.write(
      join(runRoot, "candidate-bundle.json"),
      JSON.stringify({
        summary: {
          sourceCandidateCount: 2,
          evidenceCandidateCount: 3,
        },
      }),
    );
    await Bun.write(
      join(runRoot, "candidate-validation.json"),
      JSON.stringify({
        summary: {
          validatedCount: 2,
        },
      }),
    );
    await Bun.write(
      join(runRoot, "tier2-intervention-events.json"),
      JSON.stringify({
        summary: {
          eventCount: 2,
        },
      }),
    );
    await Bun.write(
      join(runRoot, "tier2-intervention-staging-load-report.json"),
      JSON.stringify({
        summary: {
          eligibleForTimelineCount: 1,
          blockedDuplicateReviewCount: 1,
          suppressedDuplicateCount: 0,
          completeDuplicateDecisionCount: 0,
          incompleteDuplicateDecisionCount: 1,
        },
      }),
    );
    await Bun.write(
      join(runRoot, "promoted-event-source-backing-audit.json"),
      JSON.stringify({
        complete: true,
        summary: {
          sourceBackedEventCount: 2,
          eventIssueCount: 0,
        },
      }),
    );
    await Bun.write(
      join(runRoot, "tier2-intervention-duplicate-decision-verification.json"),
      JSON.stringify({
        complete: false,
      }),
    );
    await Bun.write(
      join(runRoot, "followup-ocr-plan.json"),
      JSON.stringify({
        summary: {
          ocrRequiredSourceCount: 3,
        },
      }),
    );
    await Bun.write(
      join(runRoot, "followup-ocr-quality-review-top30.json"),
      JSON.stringify({
        summary: {
          reviewedSourceCount: 1,
          ocrCompleteCount: 1,
        },
      }),
    );
    await Bun.write(
      join(runRoot, "followup-ocr-quality-review-full.json"),
      JSON.stringify({
        summary: {
          reviewedSourceCount: 2,
          ocrCompleteCount: 2,
        },
      }),
    );
    const studioReleasePath = join(root, "release.json");
    await Bun.write(
      studioReleasePath,
      JSON.stringify({
        routes: [
          {
            interventions: [
              {
                sourceLabel: "Tier 2 documents",
                sourceLinks: [{ title: "Source", url: "https://example.test/source.pdf" }],
                sourceSpanRefs: [{ chunkId: "chunk-1", pageRefs: ["p. 1"], excerpt: "Launch" }],
              },
              {
                sourceLabel: "Structured ACE",
              },
            ],
          },
        ],
      }),
    );
    const outputPath = join(runRoot, "tier2-pipeline-status.json");

    const status = await buildTier2PipelineStatus({
      runId,
      artifactRoot,
      studioReleasePath,
      outputPath,
      generatedAt: "2026-05-25T00:00:00.000Z",
    });

    expect(status.complete).toBe(false);
    expect(status.summary).toEqual({
      sourceCandidateCount: 2,
      evidenceCandidateCount: 3,
      canonicalEventCount: 2,
      eligibleTimelineEventCount: 1,
      blockedDuplicateEventCount: 1,
      suppressedDuplicateEventCount: 0,
      completeDuplicateDecisionCount: 0,
      incompleteDuplicateDecisionCount: 1,
      duplicateDecisionComplete: false,
      followupOcrPlannedCount: 3,
      followupOcrTop30CompletedCount: 1,
      followupOcrLatestReviewPath: join(runRoot, "followup-ocr-quality-review-full.json"),
      followupOcrReviewedCount: 2,
      followupOcrCompletedCount: 2,
      followupCandidateBundlePath: null,
      followupEvidenceCandidateCount: 0,
      followupUnresolvedOcrSourceCount: 0,
      studioTier2TimelineRowCount: 1,
      studioTier2RowsMissingSourceLinks: 0,
      studioTier2RowsMissingSourceSpanPreviews: 0,
    });
    expect(status.gates.map((gate) => [gate.gate, gate.status])).toEqual([
      ["corpus_and_extraction", "complete"],
      ["duplicate_decisions", "blocked"],
      ["followup_ocr", "complete"],
      ["studio_timeline_affordances", "complete"],
    ]);
    await expect(Bun.file(outputPath).json()).resolves.toEqual(status);
  });
});
