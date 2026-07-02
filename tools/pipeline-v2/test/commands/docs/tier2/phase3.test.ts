// Phase 3 bucketing + orchestration tests (tool-owned IO/LLM glue). The
// deterministic policy units (repair / validate / classify / cluster / dedupe)
// moved to @bp/analytics/interventions and are covered by
// packages/analytics/test/intervention-records.test.ts.
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Tier2CandidateSourceRef,
  Tier2DocumentEvidenceCandidate,
} from "@bp/domain/documents/candidates";
import {
  buildInterventionRecordsBuckets,
  runInterventionRecordsBucket,
  splitBucketByPageRange,
} from "../../../../src/commands/docs/tier2/_intervention-records.ts";

const SOURCE_REF: Tier2CandidateSourceRef = {
  sourceId: "test_source",
  sourceUrl: "https://example.com/test.pdf",
  title: "Test source",
  publisher: "Test publisher",
  documentDate: null,
  sourceGroup: "test_group",
  artifactKeys: {
    raw: null,
    text: null,
    ocrText: null,
    ocrJson: null,
    ocrAnnotations: null,
  },
  pages: [1],
};

function buildCandidate(
  overrides: Partial<Tier2DocumentEvidenceCandidate>,
): Tier2DocumentEvidenceCandidate {
  return {
    candidateType: "document_treatment_component_candidate",
    candidateId: overrides.candidateId ?? "test_candidate_1",
    sourceRef: SOURCE_REF,
    factClassification: "official_claim",
    negativeEvidenceFlag: "none",
    routeMentions: [],
    corridorMentions: [],
    evidencePageRefs: [1],
    evidenceQuote: "",
    summary: "",
    fields: {},
    extraction: {
      pageMarkdownRootName: "ocr-page-markdown",
      candidateRootName: "ocr-markdown-candidates",
      windowPages: [1],
    },
    validationState: "validated",
    reviewReason: "",
    ...overrides,
  };
}

const ROUTE_CATALOG = new Map();

describe("buildInterventionRecordsBuckets + splitBucketByPageRange (Fix 1 + P1.2)", () => {
  test("single_call when source is small", () => {
    const candidates = [
      buildCandidate({ candidateId: "c1", evidenceQuote: "short", routeMentions: ["M15"] }),
      buildCandidate({ candidateId: "c2", evidenceQuote: "short2", routeMentions: ["M15"] }),
    ];
    const buckets = buildInterventionRecordsBuckets({
      sourceId: "test",
      source: {
        sourceId: "test",
        title: "t",
        publisher: "p",
        sourceGroup: "g",
      },
      candidates,
      routeCatalog: ROUTE_CATALOG,
    });
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.bucketKind).toBe("single_call");
    expect(buckets[0]?.candidates).toHaveLength(2);
  });

  test("forces route-aware buckets for route-heavy service-change sources even when prompt fits", () => {
    const candidates = Array.from({ length: 25 }, (_, index) =>
      buildCandidate({
        candidateId: `service_change_${index + 1}`,
        candidateType: "document_service_change_candidate",
        evidenceQuote: `Route Q${index + 1} will be redesigned.`,
        routeMentions: [`Q${index + 1}`],
      }),
    );
    const buckets = buildInterventionRecordsBuckets({
      sourceId: "test",
      source: {
        sourceId: "test",
        title: "t",
        publisher: "p",
        sourceGroup: "g",
      },
      candidates,
      routeCatalog: ROUTE_CATALOG,
    });
    expect(buckets.length).toBeGreaterThan(1);
    expect(buckets.some((bucket) => bucket.bucketKind === "single_call")).toBe(false);
    expect(buckets.filter((bucket) => bucket.bucketKind === "per_route")).toHaveLength(25);
  });

  test("throws when a single candidate exceeds the per-bucket prompt budget", () => {
    const huge = buildCandidate({
      candidateId: "huge",
      evidenceQuote: "x".repeat(300_000),
    });
    expect(() =>
      splitBucketByPageRange({
        baseBucketId: "test:per_route:M15",
        candidates: [huge],
        source: { sourceId: "test", title: "t", publisher: "p", sourceGroup: "g" },
        routeCatalog: ROUTE_CATALOG,
      }),
    ).toThrow(/exceeds budget/);
  });
});

describe("runInterventionRecordsBucket provider errors", () => {
  test("preserves top-level DeepSeek provider errors instead of reporting a missing tool call", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "phase3-provider-error-"));
    try {
      const result = await runInterventionRecordsBucket({
        apiKey: "test-key",
        model: "deepseek-test",
        maxTokens: 1024,
        sourceRoot,
        bucket: {
          bucketId: "test:single_call",
          bucketKind: "single_call",
          candidates: [buildCandidate({ candidateId: "c1", evidenceQuote: "short" })],
          estimatedPromptChars: 100,
        },
        isOnlyBucket: true,
        source: {
          sourceId: "test_source",
          title: "Test source",
          publisher: "Test publisher",
          sourceGroup: "test_group",
        },
        candidateExtractionRootName: "ocr-page-markdown",
        candidateRootName: "ocr-markdown-candidates",
        synthesisRootName: "intervention-records",
        routeCatalog: ROUTE_CATALOG,
        fetcher: async () =>
          new Response(
            JSON.stringify({
              error: {
                message: "Insufficient Balance",
                code: "invalid_request_error",
              },
            }),
            {
              status: 200,
              statusText: "OK",
              headers: { "Content-Type": "application/json" },
            },
          ),
      });
      expect(result.status).toBe("failed");
      if (result.status !== "failed") throw new Error("expected failed status");
      // The live command calls DeepSeek through the pi harness
      // (callDeepSeekToolCallViaPi). A provider error response is surfaced as a
      // DeepSeek transport-level error and classified as `deepseek_provider_error`
      // — NOT misreported as a missing tool call (which would throw and write
      // reason `openrouter_call_failed`). FOLLOW-UP: the pi harness does not yet
      // propagate the provider's own message text (e.g. "Insufficient Balance")
      // the way the retired direct-HTTP path did.
      expect(result.error).toContain("DeepSeek");
      expect(result.responsePath).not.toBeNull();
      const errorJson = JSON.parse(await readFile(join(sourceRoot, "error.json"), "utf8")) as {
        reason?: string;
        message?: string;
      };
      expect(errorJson.reason).toBe("deepseek_provider_error");
      expect(errorJson.message).toBe(result.error);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });
});
