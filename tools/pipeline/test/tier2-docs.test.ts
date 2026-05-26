import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  auditTier2InterventionDuplicates,
  auditTier2PromotedEventSourceBacking,
  buildTier2DuplicateDecisionTemplate,
  buildTier2DuplicateReviewQueue,
  buildTier2FollowupCurationDecisionTemplate,
  buildTier2FollowupCurationQueue,
  buildTier2FollowupResolutionAudit,
  buildTier2PipelineStatus,
  captureTier2Docs,
  chunkTier2Documents,
  discoverTier2Docs,
  extractTier2Candidates,
  loadTier2InterventionStaging,
  ocrTier2PageMarkdown,
  planTier2FollowupOcr,
  planTier2Ocr,
  promoteTier2Candidates,
  reviewTier2OcrQuality,
  type Tier2Backlog,
  triageTier2Ocr,
  validateTier2Candidates,
  verifyTier2DuplicateDecisions,
  verifyTier2FollowupCurationDecisions,
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

  test("prepares first-page OCR triage slices without calling OpenRouter", async () => {
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
          intendedUse: ["document_claim_candidate"],
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
      runId: "ocr-run",
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
      defaultPageRange: "1-10",
    });

    const triagePath = join(manifest.runArtifactRoot, "ocr-triage-manifest.json");
    const triage = await triageTier2Ocr({
      ocrPlanPath: planPath,
      outputPath: triagePath,
      generatedAt: "2026-05-24T00:02:00.000Z",
      pageLimit: 2,
      execute: false,
    });

    expect(triage.summary).toEqual({
      plannedSourceCount: 1,
      selectedSourceCount: 1,
      preparedCount: 1,
      ocrCompleteCount: 0,
      ocrFailedCount: 0,
      reusedExistingCount: 0,
      totalInputBytes: expect.any(Number),
    });
    expect(triage.sources).toEqual([
      expect.objectContaining({
        sourceId: "sample_pdf",
        status: "prepared",
        pdfPageCount: 3,
        selectedPageCount: 2,
        selectedPages: [1, 2],
      }),
    ]);
    const inputPdfArtifactKey = triage.sources[0]?.inputPdfArtifactKey;
    if (inputPdfArtifactKey === null || inputPdfArtifactKey === undefined) {
      throw new Error("Expected OCR triage input PDF artifact.");
    }
    const slicedPdf = await PDFDocument.load(
      new Uint8Array(
        await Bun.file(join(manifest.runArtifactRoot, inputPdfArtifactKey)).arrayBuffer(),
      ),
    );
    expect(slicedPdf.getPageCount()).toBe(2);
    await expect(Bun.file(triagePath).json()).resolves.toEqual(triage);
  });

  test("sends OpenRouter OCR triage with flex service tier and reuses existing outputs", async () => {
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
          intendedUse: ["document_claim_candidate"],
          priority: 1,
          expectedContentType: "pdf",
          ocrHint: "required",
        },
      ],
    };
    await Bun.write(backlogPath, JSON.stringify(backlog));
    const pdfBytes = await makePdf(1);
    const manifest = await captureTier2Docs({
      backlogPath,
      artifactRoot,
      runId: "ocr-flex-run",
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
    });

    let requestCount = 0;
    const seenServiceTiers: unknown[] = [];
    const seenMaxTokens: unknown[] = [];
    const seenToolNames: unknown[] = [];
    const seenToolChoices: unknown[] = [];
    const seenReasoning: unknown[] = [];
    const triage = await triageTier2Ocr({
      ocrPlanPath: planPath,
      generatedAt: "2026-05-24T00:02:00.000Z",
      execute: true,
      triageRootName: "ocr-triage-test-model",
      apiKey: "test-key",
      fetcher: async (_url, init) => {
        requestCount += 1;
        const body = JSON.parse(String(init?.body));
        seenServiceTiers.push(body.service_tier);
        seenMaxTokens.push(body.max_tokens);
        seenToolNames.push(body.tools?.[0]?.function?.name);
        seenToolChoices.push(body.tool_choice);
        seenReasoning.push(body.reasoning);
        return new Response(
          JSON.stringify({
            service_tier: "flex",
            choices: [
              {
                message: {
                  annotations: [
                    {
                      type: "file",
                      file: {
                        content: [
                          { type: "text", text: '<file name="sample_pdf.pdf">' },
                          {
                            type: "text",
                            text: [
                              "# Sample Presentation",
                              "The sample pages clearly identify a 2026 bus lane intervention on Sample Street for the B1 route.",
                              "They include route, corridor, intervention family, launch year, and enough readable OCR text to avoid the low-density review warning.",
                              "This is fixture text used to confirm that annotation OCR text is counted by the quality review command.",
                            ].join("\n\n"),
                          },
                          {
                            type: "image_url",
                            image_url: { url: "data:image/png;base64,fixture" },
                          },
                          { type: "text", text: "</file>" },
                        ],
                      },
                    },
                  ],
                  content: "",
                  tool_calls: [
                    {
                      id: "call_ocr_triage",
                      type: "function",
                      function: {
                        name: "record_tier2_ocr_triage",
                        arguments: JSON.stringify({
                          sourceId: "sample_pdf",
                          pagesReviewed: [1],
                          ocrQuality: "good",
                          decision: "extract",
                          interventionFamilies: ["bus lanes"],
                          routesMentioned: ["B1"],
                          corridorsMentioned: ["Sample Street"],
                          dateMentions: ["2026"],
                          usefulPages: [1],
                          summary: "Useful sample.",
                          reviewNotes: "Fixture response.",
                          candidateDrafts: [
                            {
                              interventionType: "bus lane",
                              eventStatus: "implemented",
                              dateMention: "2026",
                              datePrecision: "year",
                              routeMentions: ["B1"],
                              corridorMentions: ["Sample Street"],
                              evidencePageRefs: [1],
                              evidenceQuote:
                                "The pages identify a 2026 bus lane intervention on Sample Street for the B1 route.",
                              rationale:
                                "One source span ties route, corridor, intervention family, and year.",
                            },
                          ],
                          evidenceCandidateDrafts: [
                            {
                              candidateType: "document_treatment_component_candidate",
                              factClassification: "official_claim",
                              negativeEvidenceFlag: "none",
                              routeMentions: ["B1"],
                              corridorMentions: ["Sample Street"],
                              evidencePageRefs: [1],
                              evidenceQuote:
                                "The pages identify a 2026 bus lane intervention on Sample Street for the B1 route.",
                              summary: "Sample Street bus lane treatment component.",
                              fields: {
                                treatmentType: "bus_lane_curbside",
                                implementationStatus: "implemented",
                              },
                            },
                          ],
                        }),
                      },
                    },
                  ],
                  ignored_json_fallback_fixture: JSON.stringify({
                    sourceId: "sample_pdf",
                    pagesReviewed: [1],
                    ocrQuality: "good",
                    decision: "extract",
                    interventionFamilies: ["bus lanes"],
                    routesMentioned: ["B1"],
                    corridorsMentioned: ["Sample Street"],
                    dateMentions: ["2026"],
                    usefulPages: [1],
                    summary: "Useful sample.",
                    reviewNotes: "Fixture response.",
                  }),
                },
              },
            ],
            usage: { cost: 0.01 },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    expect(requestCount).toBe(1);
    expect(seenServiceTiers).toEqual(["flex"]);
    expect(seenMaxTokens).toEqual([4096]);
    expect(seenToolNames).toEqual(["record_tier2_ocr_triage"]);
    expect(seenToolChoices).toEqual([
      { type: "function", function: { name: "record_tier2_ocr_triage" } },
    ]);
    expect(seenReasoning).toEqual([{ effort: "none" }]);
    expect(triage.triageRootName).toBe("ocr-triage-test-model");
    expect(triage.sources[0]?.inputPdfArtifactKey?.startsWith("ocr-triage-test-model/")).toBe(true);
    expect(triage.sources[0]).toEqual(
      expect.objectContaining({
        status: "ocr_complete",
        reusedExisting: false,
        requestedServiceTier: "flex",
        servedServiceTier: "flex",
      }),
    );
    const parsedJsonArtifactKey = triage.sources[0]?.parsedJsonArtifactKey;
    if (parsedJsonArtifactKey === null || parsedJsonArtifactKey === undefined) {
      throw new Error("Expected parsed OCR triage artifact.");
    }
    await expect(
      Bun.file(join(manifest.runArtifactRoot, parsedJsonArtifactKey)).json(),
    ).resolves.toEqual(
      expect.objectContaining({
        sourceId: "sample_pdf",
        candidateDrafts: [
          expect.objectContaining({
            interventionType: "bus lane",
            evidencePageRefs: [1],
          }),
        ],
        evidenceCandidateDrafts: [
          expect.objectContaining({
            candidateType: "document_treatment_component_candidate",
            evidencePageRefs: [1],
          }),
        ],
      }),
    );
    await Bun.write(
      join(
        root,
        "artifacts",
        "run",
        "ocr-triage-test-model",
        "sources",
        "0001_sample_pdf",
        "error.json",
      ),
      JSON.stringify({ stale: true }),
    );

    const review = await reviewTier2OcrQuality({
      ocrPlanPath: planPath,
      generatedAt: "2026-05-24T00:04:00.000Z",
      triageRootName: "ocr-triage-test-model",
    });
    expect(review.triageRootName).toBe("ocr-triage-test-model");
    expect(review.summary).toEqual(
      expect.objectContaining({
        plannedSourceCount: 1,
        reviewedSourceCount: 1,
        ocrCompleteCount: 1,
        goodCount: 1,
        extractCount: 1,
        annotationTextSourceCount: 1,
        missingAnnotationTextCount: 0,
      }),
    );
    expect(review.sources[0]).toEqual(
      expect.objectContaining({
        sourceId: "sample_pdf",
        status: "ocr_complete",
        annotationImageCount: 1,
        issueCodes: [],
      }),
    );

    const resumed = await triageTier2Ocr({
      ocrPlanPath: planPath,
      generatedAt: "2026-05-24T00:03:00.000Z",
      execute: true,
      triageRootName: "ocr-triage-test-model",
      apiKey: "test-key",
      fetcher: async () => {
        throw new Error("Existing OCR output should be reused.");
      },
    });

    expect(resumed.summary).toEqual(
      expect.objectContaining({
        ocrCompleteCount: 1,
        reusedExistingCount: 1,
      }),
    );
    expect(resumed.sources[0]).toEqual(
      expect.objectContaining({
        status: "ocr_complete",
        reusedExisting: true,
        requestedServiceTier: null,
        servedServiceTier: "flex",
      }),
    );
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

  test("marks OpenRouter 200 error bodies as failed OCR", async () => {
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
          intendedUse: ["document_claim_candidate"],
          priority: 1,
          expectedContentType: "pdf",
          ocrHint: "required",
        },
      ],
    };
    await Bun.write(backlogPath, JSON.stringify(backlog));
    const pdfBytes = await makePdf(1);
    const manifest = await captureTier2Docs({
      backlogPath,
      artifactRoot,
      runId: "ocr-provider-error-run",
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
    });

    const triage = await triageTier2Ocr({
      ocrPlanPath: planPath,
      generatedAt: "2026-05-24T00:02:00.000Z",
      execute: true,
      triageRootName: "ocr-provider-error",
      apiKey: "test-key",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Provider returned error",
              code: 400,
            },
          }),
          {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
          },
        ),
    });

    expect(triage.summary).toEqual(
      expect.objectContaining({
        ocrCompleteCount: 0,
        ocrFailedCount: 1,
      }),
    );
    expect(triage.sources[0]).toEqual(
      expect.objectContaining({
        status: "ocr_failed",
        httpStatus: 200,
        responseArtifactKey: "ocr-provider-error/sources/0001_sample_pdf/openrouter-response.json",
        textArtifactKey: null,
        parsedJsonArtifactKey: null,
        error: "OpenRouter provider error: Provider returned error (code: 400)",
      }),
    );
    await expect(
      Bun.file(
        join(
          manifest.runArtifactRoot,
          "ocr-provider-error",
          "sources",
          "0001_sample_pdf",
          "error.json",
        ),
      ).json(),
    ).resolves.toEqual(
      expect.objectContaining({
        error: "OpenRouter provider error: Provider returned error (code: 400)",
        httpStatus: 200,
      }),
    );
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

  test("builds a manual follow-up curation queue from reviewed OCR", async () => {
    const root = await makeWorkingRoot();
    const runRoot = join(root, "run");
    await mkdir(join(runRoot, "ocr-followup", "sources", "0001_sample"), { recursive: true });
    const triagePath = join(
      runRoot,
      "ocr-followup",
      "sources",
      "0001_sample",
      "triage-output.json",
    );
    await Bun.write(
      triagePath,
      JSON.stringify({
        sourceId: "sample_followup",
        summary: "M60 SBS launch and bus lane proposal pages with date evidence.",
        interventionFamilies: ["Select Bus Service", "bus lanes"],
        routesMentioned: ["M60 SBS"],
        corridorsMentioned: ["125th Street"],
        dateMentions: ["May 2014"],
      }),
    );
    const reviewPath = join(runRoot, "followup-ocr-quality-review-full.json");
    await Bun.write(
      reviewPath,
      JSON.stringify({
        version: 1,
        runId: "followup-run",
        generatedAt: "2026-05-25T00:00:00.000Z",
        ocrPlanPath: join(runRoot, "followup-ocr-plan.json"),
        outputPath: reviewPath,
        triageRootName: "ocr-followup",
        summary: {
          extractCount: 1,
        },
        sources: [
          {
            sourceId: "sample_followup",
            title: "Sample Follow-up OCR",
            publisher: "NYC DOT",
            sourceGroup: "select_bus_service",
            sourceUrl: "https://example.test/sample.pdf",
            status: "ocr_complete",
            ocrQuality: "good",
            decision: "extract",
            pagesReviewed: [1, 2, 3],
            usefulPages: [2],
            interventionFamilyCount: 2,
            routeCount: 1,
            corridorCount: 1,
            dateCount: 1,
            annotationTextBlockCount: 3,
            annotationTextCharCount: 900,
            annotationImageCount: 0,
            textCharsPerReviewedPage: 300,
            issueCodes: ["manual_visual_review_hint"],
            reviewNotes: "Map should be visually checked before promotion.",
          },
        ],
      }),
    );
    const manifestPath = join(runRoot, "followup-ocr-triage-manifest-full.json");
    await Bun.write(
      manifestPath,
      JSON.stringify({
        version: 1,
        runId: "followup-run",
        captureManifestPath: join(runRoot, "capture-manifest.json"),
        sources: [
          {
            sourceId: "sample_followup",
            textArtifactKey: "ocr-followup/sources/0001_sample/triage-output.txt",
            parsedJsonArtifactKey: "ocr-followup/sources/0001_sample/triage-output.json",
            annotationsArtifactKey:
              "ocr-followup/sources/0001_sample/openrouter-file-annotations.json",
          },
        ],
      }),
    );
    const outputPath = join(runRoot, "followup-curation-queue.json");

    const queue = await buildTier2FollowupCurationQueue({
      ocrQualityReviewPath: reviewPath,
      triageManifestPath: manifestPath,
      outputPath,
      generatedAt: "2026-05-25T00:01:00.000Z",
    });

    expect(queue.summary).toEqual({
      reviewedExtractSourceCount: 1,
      queueItemCount: 1,
      highPriorityCount: 1,
      mediumPriorityCount: 0,
      lowPriorityCount: 0,
      normalizedInterventionTypeCounts: {
        bus_lane_infrastructure: 1,
        select_bus_service_launch: 1,
      },
      sourceGroupCounts: {
        select_bus_service: 1,
      },
      issueCounts: {
        manual_visual_review_hint: 1,
      },
    });
    expect(queue.items[0]).toEqual(
      expect.objectContaining({
        priority: "high",
        sourceId: "sample_followup",
        usefulPages: [2],
        normalizedInterventionTypes: ["select_bus_service_launch", "bus_lane_infrastructure"],
        routesMentioned: ["M60 SBS"],
        dateMentions: ["May 2014"],
        manualCuration: expect.objectContaining({ state: "not_started" }),
      }),
    );
    await expect(Bun.file(outputPath).json()).resolves.toEqual(queue);

    const decisionsPath = join(runRoot, "followup-curation-decisions.json");
    const decisions = await buildTier2FollowupCurationDecisionTemplate({
      queuePath: outputPath,
      outputPath: decisionsPath,
      generatedAt: "2026-05-25T00:02:00.000Z",
    });
    expect(decisions.summary).toEqual({
      decisionCount: 1,
      needsHumanReviewCount: 1,
    });
    const verificationPath = join(runRoot, "followup-curation-decision-verification.json");
    const verification = await verifyTier2FollowupCurationDecisions({
      decisionsPath,
      queuePath: outputPath,
      outputPath: verificationPath,
      generatedAt: "2026-05-25T00:03:00.000Z",
    });
    expect(verification.complete).toBe(false);
    expect(verification.summary).toEqual(
      expect.objectContaining({
        decisionCount: 1,
        completeDecisionCount: 0,
        incompleteDecisionCount: 1,
        needsHumanReviewCount: 1,
      }),
    );
  });

  test("builds an unvalidated candidate bundle from OCR review artifacts", async () => {
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
          title: "Sample Bus Priority PDF",
          publisher: "Example Agency",
          sourceGroup: "select_bus_service",
          intendedUse: ["sbs_launch_context", "intervention_seed"],
          priority: 1,
          documentDate: "2026-05",
          expectedContentType: "pdf",
          ocrHint: "required",
        },
        {
          sourceId: "sample_html",
          url: "https://example.test/sample.html",
          title: "Sample Source Card",
          publisher: "Example Agency",
          sourceGroup: "ace_able",
          intendedUse: ["source_card"],
          priority: 2,
          expectedContentType: "html",
          ocrHint: "not_needed",
        },
      ],
    };
    await Bun.write(backlogPath, JSON.stringify(backlog));
    const pdfBytes = await makePdf(1);
    const manifest = await captureTier2Docs({
      backlogPath,
      artifactRoot,
      runId: "candidate-run",
      fetchedAt: "2026-05-24T00:00:00.000Z",
      fetcher: async (url) => {
        if (String(url).endsWith(".html")) {
          return new Response("<html><body>ACE source card</body></html>", {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        return new Response(responseBody(pdfBytes), {
          headers: { "content-type": "application/pdf" },
        });
      },
    });
    const planPath = join(manifest.runArtifactRoot, "ocr-plan.json");
    await planTier2Ocr({
      captureManifestPath: join(manifest.runArtifactRoot, "capture-manifest.json"),
      outputPath: planPath,
      generatedAt: "2026-05-24T00:01:00.000Z",
    });
    await triageTier2Ocr({
      ocrPlanPath: planPath,
      outputPath: join(manifest.runArtifactRoot, "ocr-triage-manifest.json"),
      generatedAt: "2026-05-24T00:02:00.000Z",
      execute: true,
      model: "qwen/qwen3.7-max",
      apiKey: "test-key",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            service_tier: "flex",
            choices: [
              {
                message: {
                  annotations: [
                    {
                      type: "file",
                      file: {
                        content: [
                          {
                            type: "text",
                            text: [
                              "Fixture OCR text names the B1 route, Sample Street corridor,",
                              "Select Bus Service launch family, and May 2026 implementation date.",
                              "It is deliberately long enough to pass OCR text density checks for one reviewed page.",
                              "The extracted text gives the candidate bundle deterministic route, corridor, date, and family mentions.",
                            ].join(" "),
                          },
                        ],
                      },
                    },
                  ],
                  content: JSON.stringify({
                    sourceId: "sample_pdf",
                    pagesReviewed: [1],
                    ocrQuality: "good",
                    decision: "extract",
                    interventionFamilies: ["Select Bus Service launch"],
                    routesMentioned: ["B1"],
                    corridorsMentioned: ["Sample Street"],
                    dateMentions: ["May 2026"],
                    usefulPages: [1],
                    summary: "Useful launch evidence.",
                    reviewNotes: "Fixture response.",
                    candidateDrafts: [
                      {
                        interventionType: "Select Bus Service launch",
                        eventStatus: "implemented",
                        dateMention: "May 2026",
                        datePrecision: "month",
                        routeMentions: ["B1"],
                        corridorMentions: ["Sample Street"],
                        evidencePageRefs: [1],
                        evidenceQuote:
                          "The page names the B1 route, Sample Street corridor, and May 2026 SBS launch.",
                        rationale:
                          "One source span ties the route, corridor, launch family, and month.",
                      },
                    ],
                    evidenceCandidateDrafts: [
                      {
                        candidateType: "document_metric_claim_candidate",
                        factClassification: "official_claim",
                        negativeEvidenceFlag: "none",
                        routeMentions: ["B1"],
                        corridorMentions: ["Sample Street"],
                        evidencePageRefs: [1],
                        evidenceQuote:
                          "The page names the B1 route, Sample Street corridor, and May 2026 SBS launch.",
                        summary: "Fixture route launch claim suitable for evidence review.",
                        fields: {
                          metricName: "launch_status",
                          comparisonPeriodStart: "2026-05",
                        },
                      },
                    ],
                  }),
                },
              },
            ],
            usage: { cost: 0.01 },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    const reviewPath = join(manifest.runArtifactRoot, "ocr-quality-review.json");
    await reviewTier2OcrQuality({
      ocrPlanPath: planPath,
      outputPath: reviewPath,
      generatedAt: "2026-05-24T00:03:00.000Z",
    });
    const markdownCandidateExtractionPath = join(
      manifest.runArtifactRoot,
      "ocr-markdown-candidates.json",
    );
    await Bun.write(
      markdownCandidateExtractionPath,
      JSON.stringify({
        version: 1,
        runId: "candidate-run",
        generatedAt: "2026-05-24T00:03:30.000Z",
        ocrPlanPath: planPath,
        pageMarkdownAuditPath: join(manifest.runArtifactRoot, "ocr-page-markdown-audit.json"),
        outputPath: markdownCandidateExtractionPath,
        provider: "openrouter",
        model: "qwen/qwen3.7-max",
        serviceTier: "flex",
        maxTokens: 4096,
        pageMarkdownRootName: "ocr-page-markdown",
        candidateRootName: "ocr-markdown-candidates",
        promptVersion: "ocr-markdown-candidates-v2",
        execute: false,
        summary: {
          selectedSourceCount: 1,
          windowCount: 1,
          extractedWindowCount: 1,
          failedWindowCount: 0,
          reusedExistingWindowCount: 0,
          candidateCount: 1,
          candidateTypeCounts: { document_metric_claim_candidate: 1 },
        },
        windows: [],
        documentEvidenceCandidates: [
          {
            candidateType: "document_metric_claim_candidate",
            candidateId:
              "document_evidence:sample_pdf:ocr_markdown:document_metric_claim_candidate:fixture",
            sourceRef: {
              sourceId: "sample_pdf",
              sourceUrl: "https://example.test/sample.pdf",
              title: "Sample Presentation",
              publisher: "Example Agency",
              documentDate: null,
              sourceGroup: "bus_priority_document",
              artifactKeys: {
                raw: "sources/sample_pdf/source.pdf",
                text: null,
                ocrText: null,
                ocrJson: null,
                ocrAnnotations: null,
              },
              pages: [1],
            },
            factClassification: "official_claim",
            negativeEvidenceFlag: "none",
            routeMentions: ["B1"],
            corridorMentions: ["Sample Street"],
            evidencePageRefs: [1],
            evidenceQuote:
              "The page names the B1 route, Sample Street corridor, and May 2026 SBS launch.",
            summary: "Fixture route launch claim suitable for evidence review.",
            fields: { metricName: "launch_status", comparisonPeriodStart: "2026-05" },
            validationState: "unvalidated",
            reviewReason: "Fixture.",
          },
        ],
      }),
    );
    const outputPath = join(manifest.runArtifactRoot, "candidate-bundle.json");
    const bundle = await extractTier2Candidates({
      ocrPlanPath: planPath,
      ocrQualityReviewPath: reviewPath,
      ocrMarkdownCandidateExtractionPath: markdownCandidateExtractionPath,
      outputPath,
      generatedAt: "2026-05-24T00:04:00.000Z",
    });

    expect(bundle.summary).toEqual(
      expect.objectContaining({
        sourceCandidateCount: 2,
        entityLinkCandidateCount: 4,
        interventionSeedCount: 1,
        reviewQuestionCandidateCount: 0,
        followupOcrCandidateCount: 0,
      }),
    );
    expect(bundle.documentSourceCandidates.map((candidate) => candidate.sourceId).sort()).toEqual([
      "sample_html",
      "sample_pdf",
    ]);
    expect(
      bundle.documentEntityLinkCandidates.map((candidate) => candidate.entityKind).sort(),
    ).toEqual(["corridor", "date", "intervention_family", "route"]);
    expect(bundle.documentInterventionSeeds[0]).toEqual(
      expect.objectContaining({
        candidateId: expect.stringContaining(":tool:"),
        interventionFamily: "Select Bus Service launch",
        routeMentions: ["B1"],
        corridorMentions: ["Sample Street"],
        dateMentions: ["May 2026"],
        validationState: "unvalidated",
        reviewReason: expect.stringContaining("OCR tool-call candidate"),
      }),
    );
    expect(bundle.documentEvidenceCandidates?.[0]).toEqual(
      expect.objectContaining({
        candidateType: "document_metric_claim_candidate",
        factClassification: "official_claim",
        routeMentions: ["B1"],
        corridorMentions: ["Sample Street"],
        validationState: "unvalidated",
        fields: expect.objectContaining({
          metricName: "launch_status",
        }),
      }),
    );
    expect(bundle.llmExtractionAudits[0]).toEqual(
      expect.objectContaining({
        model: "qwen/qwen3.7-max",
        provider: "openrouter",
        serviceTier: "flex",
      }),
    );
    await expect(Bun.file(outputPath).json()).resolves.toEqual(bundle);

    const chunksPath = join(manifest.runArtifactRoot, "document-chunks.json");
    const chunks = await chunkTier2Documents({
      candidateBundlePath: outputPath,
      outputPath: chunksPath,
      generatedAt: "2026-05-24T00:04:30.000Z",
    });

    expect(chunks.summary).toEqual({
      sourceCount: 2,
      chunkCount: 2,
      htmlChunkCount: 1,
      ocrChunkCount: 1,
    });
    expect(chunks.chunks.map((chunk) => chunk.extractionMode).sort()).toEqual([
      "html_text",
      "ocr_annotation_text",
    ]);
    expect(chunks.chunks.find((chunk) => chunk.extractionMode === "ocr_annotation_text")).toEqual(
      expect.objectContaining({
        sourceId: "sample_pdf",
        pageRefs: [1],
      }),
    );
    await expect(Bun.file(chunksPath).json()).resolves.toEqual(chunks);

    const routeCatalogPath = join(root, "route-catalog.json");
    await Bun.write(
      routeCatalogPath,
      JSON.stringify({
        schemaVersion: 1,
        rows: [{ routeId: "B1", routeShortName: "B1" }],
      }),
    );
    const dbPath = join(root, "pipeline.sqlite");
    const sqlite = new Database(dbPath);
    sqlite.exec(
      "CREATE TABLE local_route_lion_link (route_id TEXT NOT NULL, street_name TEXT, physical_id TEXT)",
    );
    sqlite
      .query(
        "INSERT INTO local_route_lion_link (route_id, street_name, physical_id) VALUES (?, ?, ?)",
      )
      .run("B1", "Sample Street", "1");
    sqlite.close();
    const validationPath = join(manifest.runArtifactRoot, "candidate-validation.json");
    const validation = await validateTier2Candidates({
      candidateBundlePath: outputPath,
      documentChunksPath: chunksPath,
      routeCatalogPath,
      dbPath,
      outputPath: validationPath,
      generatedAt: "2026-05-24T00:05:00.000Z",
    });

    expect(validation.summary).toEqual(
      expect.objectContaining({
        interventionSeedCount: 1,
        routeValidatedCount: 1,
        dateValidatedCount: 1,
        sourceSpanValidatedCount: 1,
        chunkSourceSpanValidatedCount: 1,
        interventionTypeValidatedCount: 1,
        corridorNeedsReviewCount: 0,
      }),
    );
    expect(validation.results[0]).toEqual(
      expect.objectContaining({
        candidateId: bundle.documentInterventionSeeds[0]?.candidateId,
        validationState: "validated",
        normalizedInterventionType: "select_bus_service_launch",
        normalizedRouteIds: ["B1"],
        normalizedCorridorMentions: ["SAMPLE ST"],
        matchedCorridorStreets: ["SAMPLE ST"],
        normalizedDate: "2026-05",
        datePrecision: "month",
        sourceSpanValid: true,
        sourceSpanChunkIds: ["chunk:sample_pdf:ocr_annotation_text:1"],
      }),
    );
    await expect(Bun.file(validationPath).json()).resolves.toEqual(validation);

    const promotionPath = join(manifest.runArtifactRoot, "promotion-report.json");
    const promotion = await promoteTier2Candidates({
      candidateValidationPath: validationPath,
      outputPath: promotionPath,
      generatedAt: "2026-05-24T00:06:00.000Z",
      dryRun: true,
    });

    expect(promotion.summary).toEqual({
      validationResultCount: 1,
      promotedEventCount: 1,
      canonicalEventCount: 0,
      blockedNeedsReviewCount: 0,
      blockedRejectedCount: 0,
    });
    expect(promotion.promotedEvents[0]).toEqual(
      expect.objectContaining({
        candidateId: bundle.documentInterventionSeeds[0]?.candidateId,
        sourceId: "sample_pdf",
        routeIds: ["B1"],
        interventionType: "select_bus_service_launch",
        implementationDate: "2026-05",
        sourceSpanValid: true,
        sourceSpanChunkIds: ["chunk:sample_pdf:ocr_annotation_text:1"],
      }),
    );
    expect(promotion.blockedCandidates).toEqual([]);
    await expect(Bun.file(promotionPath).json()).resolves.toEqual(promotion);

    const canonicalPath = join(manifest.runArtifactRoot, "tier2-intervention-events.json");
    const executedPromotion = await promoteTier2Candidates({
      candidateValidationPath: validationPath,
      outputPath: promotionPath,
      canonicalOutputPath: canonicalPath,
      generatedAt: "2026-05-24T00:07:00.000Z",
      dryRun: false,
    });

    expect(executedPromotion.summary).toEqual({
      validationResultCount: 1,
      promotedEventCount: 1,
      canonicalEventCount: 1,
      blockedNeedsReviewCount: 0,
      blockedRejectedCount: 0,
    });
    await expect(Bun.file(canonicalPath).json()).resolves.toEqual(
      expect.objectContaining({
        version: 1,
        runId: "candidate-run",
        summary: {
          eventCount: 1,
          routeEventCount: 1,
          sourceCount: 1,
        },
        events: [
          expect.objectContaining({
            candidateId: bundle.documentInterventionSeeds[0]?.candidateId,
            sourceId: "sample_pdf",
            routeIds: ["B1"],
            interventionType: "select_bus_service_launch",
            implementationDate: "2026-05",
            implementationMonth: "2026-05",
            datePrecision: "month",
            eventStatus: "implemented",
            validationState: "validated",
            sourceSpanChunkIds: ["chunk:sample_pdf:ocr_annotation_text:1"],
          }),
        ],
      }),
    );

    const duplicateAuditPath = join(
      manifest.runArtifactRoot,
      "tier2-intervention-duplicate-audit.json",
    );
    const duplicateAudit = await auditTier2InterventionDuplicates({
      canonicalEventsPath: canonicalPath,
      outputPath: duplicateAuditPath,
      generatedAt: "2026-05-24T00:08:00.000Z",
    });

    expect(duplicateAudit.summary).toEqual({
      eventCount: 1,
      fingerprintCount: 1,
      duplicateGroupCount: 0,
      duplicateEventCount: 0,
      uniqueEventCount: 1,
      eventsNeedingReviewCount: 0,
    });
    expect(duplicateAudit.groups[0]).toEqual(
      expect.objectContaining({
        reviewState: "unique",
        interventionType: "select_bus_service_launch",
        routeIds: ["B1"],
        sourceIds: ["sample_pdf"],
      }),
    );
    await expect(Bun.file(duplicateAuditPath).json()).resolves.toEqual(duplicateAudit);

    const stagingDbPath = join(root, "tier2-staging.sqlite");
    const loadReportPath = join(manifest.runArtifactRoot, "tier2-staging-load-report.json");
    const loadReport = await loadTier2InterventionStaging({
      canonicalEventsPath: canonicalPath,
      duplicateAuditPath,
      candidateBundlePath: outputPath,
      dbPath: stagingDbPath,
      outputPath: loadReportPath,
      generatedAt: "2026-05-24T00:09:00.000Z",
    });

    const promotedEvent = executedPromotion.promotedEvents[0];
    if (promotedEvent === undefined) {
      throw new Error("Expected one promoted event in tier 2 staging load test.");
    }

    expect(loadReport.summary).toEqual({
      eventCount: 1,
      routeEventCount: 1,
      sourceSpanCount: 1,
      eligibleForTimelineCount: 1,
      blockedDuplicateReviewCount: 0,
      suppressedDuplicateCount: 0,
      completeDuplicateDecisionCount: 0,
      incompleteDuplicateDecisionCount: 0,
    });
    await expect(Bun.file(loadReportPath).json()).resolves.toEqual(loadReport);

    const stagingSqlite = new Database(stagingDbPath);
    try {
      expect(
        stagingSqlite.query("select count(*) from local_tier2_intervention_event").get(),
      ).toEqual({ "count(*)": 1 });
      expect(
        stagingSqlite
          .query("select promotion_state from local_tier2_intervention_event where event_id = ?")
          .get(promotedEvent.eventId),
      ).toEqual({ promotion_state: "eligible_for_timeline" });
      expect(
        stagingSqlite
          .query("select source_title, source_url from local_tier2_intervention_event")
          .get(),
      ).toEqual({
        source_title: "Sample Bus Priority PDF",
        source_url: "https://example.test/sample.pdf",
      });
      expect(
        stagingSqlite.query("select route_id from local_tier2_intervention_event_route").all(),
      ).toEqual([{ route_id: "B1" }]);
      expect(
        stagingSqlite
          .query("select chunk_id from local_tier2_intervention_event_source_span")
          .all(),
      ).toEqual([{ chunk_id: "chunk:sample_pdf:ocr_annotation_text:1" }]);
    } finally {
      stagingSqlite.close();
    }
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
      triageRootName: "ocr-triage",
      summary: {
        sourceCandidateCount: 1,
        entityLinkCandidateCount: 0,
        interventionSeedCount: 2,
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
      documentEntityLinkCandidates: [],
      documentInterventionSeeds: [
        {
          candidateType: "document_intervention_seed",
          candidateId: "candidate-a",
          sourceRef,
          interventionFamily: "sbs_launch",
          routeMentions: ["B1"],
          corridorMentions: ["Sample Street"],
          dateMentions: ["May 2026"],
          status: "candidate_from_ocr_triage",
          validationState: "unvalidated",
          reviewReason: "fixture",
        },
        {
          candidateType: "document_intervention_seed",
          candidateId: "candidate-b",
          sourceRef,
          interventionFamily: "select_bus_service",
          routeMentions: ["B1"],
          corridorMentions: ["Sample Street"],
          dateMentions: ["May 2026"],
          status: "candidate_from_ocr_triage",
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
      "sbs_launch",
      "select_bus_service",
    ]);
    expect(queue.items[0]?.events[0]).toEqual(
      expect.objectContaining({
        sourceTitle: "Source A",
        sourceUrl: "https://example.test/source-a.pdf",
        routeMentions: ["B1"],
        dateMentions: ["May 2026"],
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

  test("audits promoted events for validated source backing", async () => {
    const root = await makeWorkingRoot();
    const canonicalEventsPath = join(root, "tier2-intervention-events.json");
    const candidateValidationPath = join(root, "candidate-validation.json");
    const documentChunksPath = join(root, "document-chunks.json");
    await Bun.write(
      canonicalEventsPath,
      JSON.stringify({
        version: 1,
        runId: "source-audit-run",
        generatedAt: "2026-05-25T00:00:00.000Z",
        candidateValidationPath,
        outputPath: canonicalEventsPath,
        summary: { eventCount: 1, routeEventCount: 1, sourceCount: 1 },
        events: [
          {
            eventId: "event-1",
            candidateId: "candidate-1",
            sourceId: "source-1",
            routeIds: ["M15+"],
            interventionType: "busway_launch",
            implementationDate: "2019-10-03",
            implementationMonth: "2019-10",
            datePrecision: "day",
            eventStatus: "implemented",
            validationState: "validated",
            sourceSpanChunkIds: ["chunk-1"],
          },
        ],
      }),
    );
    await Bun.write(
      candidateValidationPath,
      JSON.stringify({
        version: 1,
        runId: "source-audit-run",
        candidateBundlePath: "/tmp/candidate-bundle.json",
        documentChunksPath,
        routeCatalogPath: "/tmp/route-catalog.json",
        outputPath: candidateValidationPath,
        summary: {
          interventionSeedCount: 1,
          validatedCount: 1,
          needsReviewCount: 0,
          rejectedCount: 0,
          routeValidatedCount: 1,
          dateValidatedCount: 1,
          sourceSpanValidatedCount: 1,
          chunkSourceSpanValidatedCount: 1,
          interventionTypeValidatedCount: 1,
          corridorNeedsReviewCount: 0,
        },
        results: [
          {
            candidateId: "candidate-1",
            candidateType: "document_intervention_seed",
            sourceId: "source-1",
            validationState: "validated",
            normalizedInterventionType: "busway_launch",
            normalizedRouteIds: ["M15+"],
            normalizedCorridorMentions: ["14TH ST"],
            matchedCorridorStreets: ["14TH ST"],
            normalizedDate: "2019-10-03",
            datePrecision: "day",
            sourceSpanValid: true,
            sourceSpanChunkIds: ["chunk-1"],
            checks: {
              route: "validated",
              corridor: "validated",
              date: "validated",
              sourceSpan: "validated",
              interventionType: "validated",
            },
            reasons: [],
          },
        ],
      }),
    );
    await Bun.write(
      documentChunksPath,
      JSON.stringify({
        version: 1,
        runId: "source-audit-run",
        candidateBundlePath: "/tmp/candidate-bundle.json",
        outputPath: documentChunksPath,
        summary: { sourceCount: 1, chunkCount: 1, htmlChunkCount: 0, ocrChunkCount: 1 },
        chunks: [
          {
            chunkId: "chunk-1",
            sourceId: "source-1",
            extractionMode: "ocr_annotation_text",
            artifactKey: "sources/source-1/ocr.txt",
            pageRefs: [1],
            textHash: "sha256:test",
            charLength: 43,
            excerpt: "14th Street busway starts October 3, 2019.",
            text: "14th Street busway starts October 3, 2019.",
          },
        ],
      }),
    );
    const outputPath = join(root, "promoted-event-source-backing-audit.json");

    const audit = await auditTier2PromotedEventSourceBacking({
      canonicalEventsPath,
      candidateValidationPath,
      documentChunksPath,
      outputPath,
      generatedAt: "2026-05-25T00:01:00.000Z",
    });

    expect(audit.complete).toBe(true);
    expect(audit.summary).toEqual(
      expect.objectContaining({
        eventCount: 1,
        sourceBackedEventCount: 1,
        eventIssueCount: 0,
      }),
    );
    await expect(Bun.file(outputPath).json()).resolves.toEqual(audit);
  });

  test("dispositions follow-up OCR tails and validation needs-review candidates", async () => {
    const root = await makeWorkingRoot();
    const validationPath = join(root, "candidate-validation-followup-manual.json");
    const ocrReviewPath = join(root, "followup-ocr-quality-review-full.json");
    await Bun.write(
      validationPath,
      JSON.stringify({
        summary: {
          needsReviewCount: 2,
        },
        results: [
          {
            candidateId: "candidate:source:route_gap",
            sourceId: "source_route_gap",
            validationState: "needs_review",
            checks: {
              route: "needs_review",
              corridor: "needs_review",
              date: "validated",
              sourceSpan: "needs_review",
              interventionType: "validated",
            },
          },
          {
            candidateId: "candidate:source:span_gap",
            sourceId: "source_span_gap",
            validationState: "needs_review",
            checks: {
              route: "validated",
              corridor: "validated",
              date: "validated",
              sourceSpan: "needs_review",
              interventionType: "validated",
            },
          },
        ],
      }),
    );
    await Bun.write(
      ocrReviewPath,
      JSON.stringify({
        sources: [
          {
            sourceId: "source_no_pages",
            status: "not_started",
            ocrQuality: "unknown",
            decision: "unknown",
            issueCodes: ["not_started", "missing_triage_json", "missing_annotations"],
          },
          {
            sourceId: "nyc_dot_bus_priority_document_pdf_2015_04_06_brt_uticaave_cb3_presentation",
            status: "ocr_complete",
            ocrQuality: "unknown",
            decision: "unknown",
            issueCodes: ["missing_triage_json"],
          },
        ],
      }),
    );
    const outputPath = join(root, "followup-resolution-audit.json");

    const audit = await buildTier2FollowupResolutionAudit({
      runId: "followup-run",
      candidateValidationPath: validationPath,
      ocrQualityReviewPath: ocrReviewPath,
      outputPath,
      generatedAt: "2026-05-25T00:00:00.000Z",
    });

    expect(audit.complete).toBe(true);
    expect(audit.summary).toEqual({
      needsReviewCandidateCount: 2,
      resolvedNeedsReviewCandidateCount: 2,
      unresolvedNeedsReviewCandidateCount: 0,
      unresolvedOcrSourceCount: 2,
      resolvedOcrSourceCount: 2,
      unresolvedOcrRemainingCount: 0,
      categoryCounts: {
        exhausted_no_selectable_pages: 1,
        manual_reviewed_from_text_annotations: 1,
        not_route_scoped_enough: 1,
        validator_gap_source_span_packaging: 1,
      },
    });
    await expect(Bun.file(outputPath).json()).resolves.toEqual(audit);
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
          interventionSeedCount: 3,
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
      interventionSeedCount: 3,
      validatedSeedCount: 2,
      promotedEventCount: 2,
      eligibleTimelineEventCount: 1,
      blockedDuplicateEventCount: 1,
      suppressedDuplicateEventCount: 0,
      completeDuplicateDecisionCount: 0,
      incompleteDuplicateDecisionCount: 1,
      duplicateDecisionComplete: false,
      promotedSourceBackingAuditComplete: true,
      promotedSourceBackedEventCount: 2,
      promotedSourceBackingIssueCount: 0,
      followupOcrPlannedCount: 3,
      followupOcrTop30CompletedCount: 1,
      followupOcrLatestReviewPath: join(runRoot, "followup-ocr-quality-review-full.json"),
      followupOcrReviewedCount: 2,
      followupOcrCompletedCount: 2,
      followupCurationQueuePath: null,
      followupCurationQueueItemCount: 0,
      followupCurationQueueHighPriorityCount: 0,
      followupCurationDecisionComplete: false,
      followupCurationCompleteDecisionCount: 0,
      followupCurationIncompleteDecisionCount: 0,
      followupCandidateBundlePath: null,
      followupInterventionSeedCount: 0,
      followupValidatedSeedCount: 0,
      followupNeedsReviewSeedCount: 0,
      followupResolvedNeedsReviewSeedCount: 0,
      followupUnresolvedNeedsReviewSeedCount: 0,
      followupResolvedOcrSourceCount: 0,
      followupUnresolvedOcrSourceCount: 0,
      followupPromotableEventCount: 0,
      studioTier2TimelineRowCount: 1,
      studioTier2RowsMissingSourceLinks: 0,
      studioTier2RowsMissingSourceSpanPreviews: 0,
    });
    expect(status.gates.map((gate) => [gate.gate, gate.status])).toEqual([
      ["corpus_and_extraction", "complete"],
      ["validation_and_promotion", "complete"],
      ["duplicate_decisions", "blocked"],
      ["followup_ocr", "partial"],
      ["studio_timeline_affordances", "complete"],
    ]);
    await expect(Bun.file(outputPath).json()).resolves.toEqual(status);
  });
});
