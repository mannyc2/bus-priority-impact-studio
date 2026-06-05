import { describe, expect, test } from "bun:test";
import {
  DocumentDiscoveryExtractionToolResponseSchema,
  DocumentDiscoveryMetricCandidateSchema,
} from "../src/index.js";

const evidenceRef = {
  blockId: "B0001",
  pageNumber: 4,
  lineStart: 12,
  lineEnd: 14,
  blockHash: "sha256:block",
};

describe("document discovery schemas", () => {
  test("accept raw discovery vocabulary without forcing final normalization", () => {
    const parsed = DocumentDiscoveryExtractionToolResponseSchema.parse({
      source: {
        sourceId: "fixture",
        sourceTitle: "Fixture",
        publisher: "Fixture Agency",
        sourceGroup: "fixture",
        documentDateState: "unknown",
        pageNumbers: [4],
        pageArtifactKeys: ["pages/0004/page.md"],
        markdownHash: "sha256:markdown",
        blockIndexHash: "sha256:block-index",
        sourceContentHash: "sha256:source",
      },
      pageProfile: {
        documentModeRaw: "community board deck",
        pageRolesRaw: ["map", "table"],
        contentTypesRaw: ["rail access context", "curb operations metric"],
        discoveryShouldProceed: true,
      },
      entities: [
        {
          entityId: "entity-1",
          rawText: "LIRR",
          rawKind: "commuter rail service named in context",
          kindHint: "rail_service",
          roleRaw: "context mode",
          evidenceRefs: [evidenceRef],
        },
        {
          entityId: "entity-2",
          rawText: "M15 SBS",
          rawKind: "bus route with service pattern",
          kindHint: "bus_route",
          evidenceRefs: [evidenceRef],
        },
      ],
      metrics: [
        {
          metricId: "metric-1",
          labelRaw: "loading zone occupancy by delivery vehicles",
          valueRaw: "68%",
          unitRaw: "percent",
          valueKind: "percent",
          subjectRaw: "curb usage",
          geographyRaw: "pilot corridor",
          evidenceRefs: [evidenceRef],
        },
      ],
      events: [
        {
          eventId: "event-1",
          familyRaw: "dynamic curb management pilot",
          statusRaw: "proposed",
          dateRaw: "Spring 2025",
          treatmentRaw: "loading zone rule change",
          evidenceRefs: [evidenceRef],
        },
      ],
      tables: [
        {
          tableId: "table-1",
          tableKindRaw: "mode share and curb activity summary",
          headerTextsRaw: ["Mode", "Share", "Notes"],
          rowCount: 6,
          columnCount: 3,
          evidenceRefs: [evidenceRef],
        },
      ],
      claims: [
        {
          claimId: "claim-1",
          claimText: "The document links rail access, bus circulation, and curb loading.",
          claimKindRaw: "planning context synthesis",
          entityCandidateIds: ["entity-1", "entity-2"],
          metricCandidateIds: ["metric-1"],
          eventCandidateIds: ["event-1"],
          evidenceRefs: [evidenceRef],
        },
      ],
      contextSignals: [
        {
          contextId: "context-1",
          signalText: "Curb friction is named as a bus circulation constraint.",
          contextKindRaw: "curb friction mechanism",
          evidenceRefs: [evidenceRef],
        },
      ],
      reviewQuestions: [
        {
          questionId: "question-1",
          question: "Should this curb pilot become an event-family response-drift candidate?",
          questionKindRaw: "future applied research candidate",
        },
      ],
      extractionAudit: {
        promptVersion: "tier2-document-discovery-v1",
        toolSchemaVersion: "1",
        extractedAt: "2026-06-02T00:00:00.000Z",
        pageWindowId: "fixture:4",
        candidateCounts: { entities: 2, metrics: 1 },
      },
    });

    expect(parsed.entities[0]?.rawKind).toBe("commuter rail service named in context");
    expect(parsed.metrics[0]?.labelRaw).toBe("loading zone occupancy by delivery vehicles");
    expect(parsed.entities[0]?.kindHint).toBe("rail_service");
  });

  test("keeps metric observations flexible for later taxonomy design", () => {
    const parsed = DocumentDiscoveryMetricCandidateSchema.parse({
      metricId: "metric-flex",
      labelRaw: "estimated passenger-minutes lost to queue spillback",
      valueRaw: "roughly 12,500 per weekday",
      valueKind: "textual",
      subjectRaw: "bus passenger delay",
      comparisonRaw: "before/after pilot period",
      evidenceRefs: [evidenceRef],
      attributes: {
        candidateCanonicalFamily: "delay_cost",
        parserNote: "needs deterministic metric crosswalk later",
      },
    });

    expect(parsed.attributes["candidateCanonicalFamily"]).toBe("delay_cost");
    expect(parsed.valueRaw).toBe("roughly 12,500 per weekday");
  });
});
