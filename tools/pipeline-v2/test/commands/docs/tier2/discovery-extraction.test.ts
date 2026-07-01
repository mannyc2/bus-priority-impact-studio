// biome-ignore-all lint/style/noNonNullAssertion: Fixture assertions intentionally index rows after explicit length/content checks.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  extractTier2DocumentDiscoveries,
  type Tier2DiscoveryEvidenceBlock,
  validateDiscoveryExtraction,
} from "../../../../src/commands/docs/tier2/_discovery-extraction.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-discovery-extraction");

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
      "## Fixture bus corridor",
      "",
      "The M15 SBS and the LIRR are both mentioned in this corridor plan.",
      "Average bus speeds increased by 5% after launch.",
      "",
      "| Metric | Value |",
      "| --- | --- |",
      "| Loading zone occupancy by delivery vehicles | 68% |",
      "",
    ].join("\n"),
  );

  const ocrPlanPath = join(runRoot, "ocr-plan.json");
  await writeJson(ocrPlanPath, {
    version: 1,
    runId: "docs-run",
    generatedAt: "2026-06-02T00:00:00.000Z",
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
    generatedAt: "2026-06-02T00:00:00.000Z",
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
      tablePageCount: 1,
      mapPageCount: 0,
      chartPageCount: 0,
      likelyBlankPageCount: 0,
      visualReviewPageCount: 0,
      totalMarkdownChars: 250,
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
        tablePageCount: 1,
        mapPageCount: 0,
        chartPageCount: 0,
        likelyBlankPageCount: 0,
        visualReviewPageCount: 0,
        totalMarkdownChars: 250,
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
            markdownCharCount: 250,
            markdownBodyCharCount: 210,
            containsTables: true,
            containsMaps: false,
            containsCharts: false,
            blankPageLikely: false,
            needsVisualReview: false,
            routesMentioned: ["M15"],
            corridorsMentioned: [],
            datesMentioned: [],
            metricHints: ["Average bus speeds", "Loading zone occupancy"],
            visualReviewHints: [],
            issueCodes: ["contains_table"],
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

describe("Tier 2 discovery extraction", () => {
  test("dry-run writes block-indexed request artifacts without calling a model", async () => {
    const { runRoot, ocrPlanPath, auditPath } = await seedRun();
    const outputPath = join(runRoot, "document-discovery-extraction.json");
    const artifact = await extractTier2DocumentDiscoveries({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      outputPath,
      execute: false,
    });

    expect(artifact.summary.plannedWindowCount).toBe(1);
    expect(artifact.summary.extractedWindowCount).toBe(0);
    const window = artifact.windows[0]!;
    expect(window.requestArtifactKey).not.toBeNull();
    expect(window.blockIndexArtifactKey).not.toBeNull();

    const request = await Bun.file(join(runRoot, window.requestArtifactKey!)).json();
    const blockIndex = (await Bun.file(join(runRoot, window.blockIndexArtifactKey!)).json()) as {
      blocks: Tier2DiscoveryEvidenceBlock[];
      blockIndexHash: string;
      markdownHash: string;
    };

    expect(JSON.stringify(request)).toContain("Do not mark subway");
    expect(JSON.stringify(request)).toContain("runner fills canonical blockHash");
    expect(JSON.stringify(request.tool.parameters)).not.toContain('"format"');
    expect(JSON.stringify(request.tool.parameters)).not.toContain('"propertyNames"');
    expect(blockIndex.blocks.length).toBeGreaterThanOrEqual(2);
    expect(blockIndex.blocks[0]?.blockId).toBe("B0001");
  });

  test("validates candidate evidence refs against deterministic block hashes and line ranges", async () => {
    const { runRoot, ocrPlanPath, auditPath } = await seedRun();
    const artifact = await extractTier2DocumentDiscoveries({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      execute: false,
    });
    const blockIndex = (await Bun.file(
      join(runRoot, artifact.windows[0]!.blockIndexArtifactKey!),
    ).json()) as {
      blocks: Tier2DiscoveryEvidenceBlock[];
      blockIndexHash: string;
      markdownHash: string;
      pageArtifactKeys: string[];
    };
    const block = blockIndex.blocks.find((current) => current.text.includes("M15 SBS"))!;
    const extraction = {
      source: {
        sourceId: "fixture_pdf",
        sourceTitle: "Fixture PDF",
        publisher: "Fixture Agency",
        sourceGroup: "fixture",
        finalUrl: "https://example.org/fixture.pdf",
        documentDateState: "unknown" as const,
        pageNumbers: [1],
        pageArtifactKeys: blockIndex.pageArtifactKeys,
        markdownHash: blockIndex.markdownHash,
        blockIndexHash: blockIndex.blockIndexHash,
        sourceContentHash: "sha256:source",
      },
      pageProfile: {
        documentModeRaw: "corridor plan",
        pageRolesRaw: ["substantive"],
        contentTypesRaw: ["route mention", "metric claim"],
        discoveryShouldProceed: true,
      },
      entities: [
        {
          entityId: "entity-1",
          rawText: "LIRR",
          rawKind: "railroad context mention",
          kindHint: "rail_service" as const,
          attributes: {},
          evidenceRefs: [
            {
              blockId: block.blockId,
              pageNumber: block.pageNumber,
              lineStart: block.lineStart,
              lineEnd: block.lineEnd,
              blockHash: block.blockHash,
            },
          ],
        },
      ],
      metrics: [],
      events: [],
      tables: [],
      claims: [],
      contextSignals: [],
      reviewQuestions: [],
      extractionAudit: {
        promptVersion: "tier2-document-discovery-v1",
        toolSchemaVersion: "1",
        extractedAt: "2026-06-02T00:00:00.000Z",
        pageWindowId: "fixture_pdf:1",
        candidateCounts: { entities: 1 },
      },
    };

    expect(
      validateDiscoveryExtraction({
        extraction,
        expectedSourceId: "fixture_pdf",
        expectedPageNumbers: [1],
        expectedMarkdownHash: blockIndex.markdownHash,
        expectedBlockIndexHash: blockIndex.blockIndexHash,
        blocks: blockIndex.blocks,
      }),
    ).toEqual([]);

    const issues = validateDiscoveryExtraction({
      extraction: {
        ...extraction,
        entities: [
          {
            ...extraction.entities[0]!,
            evidenceRefs: [
              { ...extraction.entities[0]!.evidenceRefs[0]!, blockHash: "sha256:bad" },
            ],
          },
        ],
      },
      expectedSourceId: "fixture_pdf",
      expectedPageNumbers: [1],
      expectedMarkdownHash: blockIndex.markdownHash,
      expectedBlockIndexHash: blockIndex.blockIndexHash,
      blocks: blockIndex.blocks,
    });

    expect(issues.map((issue) => issue.code)).toContain("evidence_block_hash_mismatch");
  });

  test("execute path sends direct DeepSeek thinking-disabled tool requests", async () => {
    const { ocrPlanPath, auditPath } = await seedRun();
    const capturedBodies: Array<Record<string, unknown>> = [];
    let expectedCanonicalEvidenceRef:
      | {
          blockId: string;
          pageNumber: number;
          lineStart: number;
          lineEnd: number;
          blockHash: string;
        }
      | undefined;
    const artifact = await extractTier2DocumentDiscoveries({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      generatedAt: "2026-06-02T12:00:00.000Z",
      execute: true,
      model: "deepseek-v4-flash",
      deepseekApiKey: "test-key",
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        capturedBodies.push(body);
        const messages = body["messages"] as Array<{ role: string; content: string }>;
        const userContent = messages.find((message) => message.role === "user")!.content;
        const sourceMatch = userContent.match(
          /REQUIRED SOURCE OBJECT FOR TOOL CALL\n([\s\S]*?)\n\nREQUIRED EXTRACTION AUDIT/,
        );
        const source = JSON.parse(sourceMatch![1]!) as Record<string, unknown>;
        const blockMatch = userContent.match(
          /\[(B\d{4})\] page=(\d+) lines=(\d+)-(\d+) hash=(sha256:[a-f0-9]+)/,
        );
        const canonicalBlockId = blockMatch![1]!;
        const canonicalBlockHash = blockMatch![5]!;
        const evidenceRef = {
          blockId: canonicalBlockId,
          pageNumber: 999,
          lineStart: Number(blockMatch![3]),
          lineEnd: Number(blockMatch![4]),
          blockHash: "sha256:model-supplied-wrong-hash",
        };
        expectedCanonicalEvidenceRef = {
          ...evidenceRef,
          pageNumber: Number(blockMatch![2]),
          blockHash: canonicalBlockHash,
        };
        const toolArgs = {
          source,
          pageProfile: {
            documentModeRaw: "fixture",
            pageRolesRaw: ["substantive"],
            contentTypesRaw: ["entity"],
            discoveryShouldProceed: true,
          },
          entities: [
            {
              entityId: "entity-1",
              rawText: "M15 SBS",
              rawKind: "bus route mention",
              kindHint: "bus_route",
              evidenceRefs: [evidenceRef],
              attributes: {},
            },
          ],
          metrics: [
            {
              metricId: "metric-1",
              labelRaw: "optional empty field repair smoke",
              valueRaw: "5%",
              valueNumeric: null,
              periodRaw: "",
              comparisonRaw: "",
              valueKind: "percent",
              evidenceRefs: [evidenceRef],
              attributes: {},
            },
          ],
          events: [],
          tables: [],
          claims: [],
          contextSignals: [],
          reviewQuestions: [],
          extractionAudit: {
            promptVersion: "tier2-document-discovery-v1",
            toolSchemaVersion: "1",
            modelId: "hallucinated-provider-model",
            extractedAt: "2025-01-01T00:00:00Z",
            pageWindowId: "wrong-window",
            candidateCounts: { entities: 999, metrics: 999 },
          },
        };
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "",
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "submit_document_discovery_candidates",
                        arguments: JSON.stringify(toolArgs),
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 20,
              total_tokens: 120,
              prompt_tokens_details: { cached_tokens: 10 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0]?.["thinking"]).toEqual({ type: "disabled" });
    expect(capturedBodies[0]?.["tool_choice"]).toEqual({
      type: "function",
      function: { name: "submit_document_discovery_candidates" },
    });
    expect(artifact.summary.extractedWindowCount).toBe(1);
    expect(artifact.extractions[0]?.entities[0]?.rawText).toBe("M15 SBS");
    expect(artifact.extractions[0]?.entities[0]?.evidenceRefs[0]).toEqual(
      expectedCanonicalEvidenceRef,
    );
    expect(artifact.extractions[0]?.metrics[0]?.labelRaw).toBe("optional empty field repair smoke");
    expect(artifact.extractions[0]?.extractionAudit).toMatchObject({
      modelId: "deepseek-v4-flash",
      extractedAt: "2026-06-02T12:00:00.000Z",
      pageWindowId: "fixture_pdf:1",
      candidateCounts: {
        entities: 1,
        metrics: 1,
        events: 0,
        tables: 0,
        claims: 0,
        contextSignals: 0,
        reviewQuestions: 0,
      },
    });
  });

  test("execute path classifies malformed tool arguments with provider attempt traces", async () => {
    const { runRoot, ocrPlanPath, auditPath } = await seedRun();
    const artifact = await extractTier2DocumentDiscoveries({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      generatedAt: "2026-06-02T12:00:00.000Z",
      execute: true,
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      pioneerApiKey: "test-key",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "",
                  tool_calls: [
                    {
                      id: "call_bad_args",
                      type: "function",
                      function: {
                        name: "submit_document_discovery_candidates",
                        arguments: '{"source":{"sourceId":"fixture_pdf"},"entities":[{"entityId":',
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 20,
              total_tokens: 120,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json", "x-request-id": "req-1" } },
        ),
    });

    const window = artifact.windows[0]!;
    expect(artifact.summary.failedWindowCount).toBe(1);
    expect(window.validationIssues[0]?.code).toBe("tool_arguments_unparseable");
    const error = (await Bun.file(join(runRoot, window.errorArtifactKey!)).json()) as {
      errorClass: string;
      details: Record<string, unknown>;
      attempts: Array<{
        httpStatus: number | null;
        headers: Record<string, string>;
        latencyMs: number;
        providerRequestIds: string[];
        responseBodyShape: string;
        usage: unknown | null;
      }>;
      providerRequestIds: string[];
      finalHttpStatus: number | null;
    };

    expect(error.errorClass).toBe("tool_arguments_unparseable");
    expect(error.details["toolCallId"]).toBe("call_bad_args");
    expect(error.details["argumentLength"]).toBeGreaterThan(20);
    expect(String(error.details["parseError"])).toContain("JSON");
    expect(error.attempts).toHaveLength(1);
    expect(error.attempts[0]?.httpStatus).toBe(200);
    expect(error.attempts[0]?.headers["x-request-id"]).toBe("req-1");
    expect(error.attempts[0]?.providerRequestIds).toContain("req-1");
    expect(error.attempts[0]?.responseBodyShape).toBe("chat_completion");
    expect(error.attempts[0]?.usage).not.toBeNull();
    expect(error.providerRequestIds).toEqual(["req-1"]);
    expect(error.finalHttpStatus).toBe(200);
  });

  test("execute path records retried Pioneer gateway attempts and CloudFront request ids", async () => {
    const { runRoot, ocrPlanPath, auditPath } = await seedRun();
    let callCount = 0;
    const artifact = await extractTier2DocumentDiscoveries({
      ocrPlanPath,
      pageMarkdownAuditPath: auditPath,
      generatedAt: "2026-06-02T12:00:00.000Z",
      execute: true,
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      pioneerApiKey: "test-key",
      fetcher: async () => {
        callCount += 1;
        return new Response(
          `<html><body>Gateway Timeout<br>Request ID: cloudfront-${callCount}&#x3D;</body></html>`,
          {
            status: 504,
            statusText: "Gateway Timeout",
            headers: {
              "Content-Type": "text/html",
              "cf-ray": `cf-ray-${callCount}`,
            },
          },
        );
      },
    });

    const window = artifact.windows[0]!;
    expect(callCount).toBe(3);
    expect(artifact.summary.failedWindowCount).toBe(1);
    expect(window.validationIssues[0]?.code).toBe("provider_http_error");
    const error = (await Bun.file(join(runRoot, window.errorArtifactKey!)).json()) as {
      errorClass: string;
      attempts: Array<{
        attempt: number;
        httpStatus: number | null;
        statusText: string | null;
        headers: Record<string, string>;
        transient: boolean;
        providerRequestIds: string[];
        responseBodyShape: string;
      }>;
      providerRequestIds: string[];
      finalHttpStatus: number | null;
    };

    expect(error.errorClass).toBe("provider_http_error");
    expect(error.attempts.map((attempt) => attempt.httpStatus)).toEqual([504, 504, 504]);
    expect(error.attempts.map((attempt) => attempt.attempt)).toEqual([1, 2, 3]);
    expect(error.attempts[0]?.statusText).toBe("Gateway Timeout");
    expect(error.attempts[0]?.headers["cf-ray"]).toBe("cf-ray-1");
    expect(error.attempts[0]?.providerRequestIds).toContain("cloudfront-1=");
    expect(error.attempts[0]?.responseBodyShape).toBe("raw_text");
    expect(error.attempts.map((attempt) => attempt.transient)).toEqual([true, true, false]);
    expect(error.providerRequestIds).toContain("cf-ray-3");
    expect(error.providerRequestIds).toContain("cloudfront-3=");
    expect(error.finalHttpStatus).toBe(504);
  });
});
