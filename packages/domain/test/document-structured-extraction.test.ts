import { describe, expect, test } from "bun:test";
import {
  StructuredDocumentExtractionSchema,
  StructuredDocumentExtractionToolResponseSchema,
} from "@bp/domain/documents/structured-extraction";

const TOOL_RESPONSE = {
  source: {
    sourceId: "fixture_pdf",
    sourceTitle: "Fixture PDF",
    publisher: "Fixture Agency",
    sourceGroup: "fixture",
    finalUrl: "https://example.org/fixture.pdf",
    documentDateState: "unknown",
    pageNumbers: [1],
    pageArtifactKeys: ["ocr/pages/0001/page.md"],
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
      quote: "The busway launched on October 3, 2019.",
      quoteHash: "sha256:span",
      spanRole: "date_support",
    },
  ],
  entityMentions: [
    {
      mentionId: "mention-1",
      evidenceSpanIds: ["span-1"],
      rawText: "busway",
      entityKind: "program",
      rawRole: "context",
      validationState: "unvalidated",
    },
  ],
  claims: [
    {
      claimId: "claim-1",
      evidenceSpanIds: ["span-1"],
      claimKind: "official_fact",
      claimText: "The busway launched on October 3, 2019.",
      factAuthority: "agency_official",
      entityMentionIds: ["mention-1"],
      researchUseTags: ["public_timeline_candidate"],
      needsDeterministicMetric: false,
      caveatCodes: [],
    },
  ],
  tables: [],
  interventionEvents: [
    {
      eventId: "event-1",
      canonicalName: "Fixture busway launch",
      eventFamily: "busway",
      status: "implemented",
      qualityTier: "canonical_milestone_candidate",
      date: "2019-10-03",
      datePrecision: "day",
      dateRole: "launch",
      routeRoles: [],
      location: {
        corridorRaw: "Fixture Street",
      },
      components: [
        {
          componentType: "busway_restriction",
          status: "implemented",
          description: "Busway restriction",
          evidenceSpanIds: ["span-1"],
        },
      ],
      evidenceSpanIds: ["span-1"],
      claimIds: ["claim-1"],
      researchUseTags: ["public_timeline_candidate", "causal_treatment_inventory"],
      duplicateFingerprint: "fixture-busway-2019-10-03",
    },
  ],
  serviceChanges: [],
  contextSignals: [],
  reviewQuestions: [],
  extractionAudit: {
    promptVersion: "tier2-structured-extraction-v1",
    modelId: "fixture-model",
    toolSchemaVersion: "bp.structured_document_extraction_tool_response.v1",
    extractedAt: "2026-06-01T00:00:00.000Z",
    pageWindowId: "fixture_pdf:1",
    candidateCounts: { interventionEvents: 1 },
    skippedReasons: [],
    modelNotes: "",
  },
};

describe("structured document extraction schemas", () => {
  test("parses a quote-backed page/window tool response", () => {
    const parsed = StructuredDocumentExtractionToolResponseSchema.parse(TOOL_RESPONSE);

    expect(parsed.source.sourceId).toBe("fixture_pdf");
    expect(parsed.interventionEvents[0]?.dateRole).toBe("launch");
  });

  test("parses a persisted extraction with validation issues", () => {
    const parsed = StructuredDocumentExtractionSchema.parse({
      ...TOOL_RESPONSE,
      extractionId: "structured_document_extraction:fixture_pdf:1",
      validationState: "extracted",
      validationIssues: [
        {
          code: "needs_route_validation",
          message: "No route ID was validated.",
          path: "entityMentions",
          severity: "warning",
        },
      ],
    });

    expect(parsed.validationIssues[0]?.severity).toBe("warning");
  });

  test("rejects unknown fields", () => {
    expect(() =>
      StructuredDocumentExtractionToolResponseSchema.parse({
        ...TOOL_RESPONSE,
        unsupported: true,
      }),
    ).toThrow();
  });
});
