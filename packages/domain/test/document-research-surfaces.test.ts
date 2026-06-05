import { describe, expect, test } from "bun:test";
import {
  type DocumentResearchEvidenceHandle,
  type DocumentResearchLookupResult,
  type DocumentResearchSourceContext,
  type DocumentResearchSurfaceDraftV2,
  submitDocumentResearchSurfaceDrafts,
  validateDocumentResearchSurfaceDraft,
} from "../src/index.js";

const source: DocumentResearchSourceContext = {
  sourceId: "mta-m15-fixture",
  sourceTitle: "M15 SBS Bus Priority Fixture",
  sourceGroup: "fixture",
  sourceInvestigationId: "investigation-1",
  pageNumbers: [4],
  sourceContentHash: "sha256:source",
  pageArtifactKey: "sources/mta-m15-fixture/pages/0004.md",
  markdownHash: "sha256:markdown",
  blockIndexHash: "sha256:block-index",
};

const evidenceHandles: DocumentResearchEvidenceHandle[] = [
  {
    evidenceHandle: "evidence-route-m15",
    sourceId: source.sourceId,
    pageNumber: 4,
    pageArtifactKey: source.pageArtifactKey,
    sourceContentHash: source.sourceContentHash,
    markdownHash: source.markdownHash,
    blockIndexHash: source.blockIndexHash,
    blockId: "B0004",
    blockHash: "sha256:block",
    lineStart: 12,
    lineEnd: 13,
    quoteText: "The M15 Select Bus Service route received new bus lane treatments.",
  },
];

const routeLookup: DocumentResearchLookupResult = {
  lookupKind: "route",
  lookupHandle: "route-lookup-m15-sbs",
  rawText: "M15 SBS",
  candidates: [
    {
      routeId: "M15",
      aliases: ["M15 SBS", "M15 Select Bus Service"],
      mode: "bus",
      currentStatus: "current",
      routeFamily: "M15",
      serviceVariants: ["sbs"],
      resolutionTier: "catalog_alias",
      score: 0.96,
    },
  ],
};

function baseDraft(overrides: Partial<DocumentResearchSurfaceDraftV2> = {}) {
  return {
    surfaceKind: "event_candidate",
    corpusRole: "atomic_observation",
    rawText: "The M15 SBS route received bus lane treatments.",
    displayLabel: "M15 SBS bus lane treatment",
    payloadSchemaId: "bp.document_research_surface_payload.event_candidate.v1",
    rawPayload: {
      routeTextRaw: "M15 SBS",
      treatmentTextRaw: "bus lane treatments",
    },
    evidenceByField: {
      "rawPayload.routeTextRaw": [
        {
          evidenceHandle: "evidence-route-m15",
          supportRole: "route_scope",
          supportCompleteness: "exact",
        },
      ],
    },
    canonicalSelections: [
      {
        fieldPath: "routeIds",
        lookupKind: "route",
        lookupHandle: "route-lookup-m15-sbs",
        selectedIds: ["M15"],
        rawTextFieldPath: "rawPayload.routeTextRaw",
        evidenceHandles: ["evidence-route-m15"],
      },
    ],
    requestedUses: ["detector_evidence"],
    agentConfidence: "high",
    ...overrides,
  } satisfies DocumentResearchSurfaceDraftV2;
}

describe("document research surface draft validation", () => {
  test("accepts canonical route selections backed by lookup handles and evidence", () => {
    const validation = validateDocumentResearchSurfaceDraft({
      draft: baseDraft(),
      source,
      evidenceHandles,
      lookupResults: [routeLookup],
      routeUniverse: ["M15", "M14A", "M14D"],
    });

    expect(validation.state).toBe("accepted");
    expect(validation.issues).toEqual([]);
    expect(validation.acceptedCanonicalFields).toEqual([
      {
        fieldPath: "routeIds",
        lookupKind: "route",
        lookupHandle: "route-lookup-m15-sbs",
        selectedIds: ["M15"],
        evidenceHandles: ["evidence-route-m15"],
      },
    ]);
  });

  test("rejects route ids that include service variants before commit", () => {
    const validation = validateDocumentResearchSurfaceDraft({
      draft: baseDraft({
        canonicalSelections: [
          {
            fieldPath: "routeIds",
            lookupKind: "route",
            lookupHandle: "route-lookup-m15-sbs",
            selectedIds: ["M15 SBS"],
            rawTextFieldPath: "rawPayload.routeTextRaw",
            evidenceHandles: ["evidence-route-m15"],
          },
        ],
      }),
      source,
      evidenceHandles,
      lookupResults: [routeLookup],
      routeUniverse: ["M15"],
    });

    expect(validation.state).toBe("repairable_rejected");
    expect(validation.issues.map((issue) => issue.code)).toContain("service_variant_in_route_id");
  });

  test("rejects selected ids that did not come from the referenced route lookup", () => {
    const validation = validateDocumentResearchSurfaceDraft({
      draft: baseDraft({
        canonicalSelections: [
          {
            fieldPath: "routeIds",
            lookupKind: "route",
            lookupHandle: "route-lookup-m15-sbs",
            selectedIds: ["M14A"],
            rawTextFieldPath: "rawPayload.routeTextRaw",
            evidenceHandles: ["evidence-route-m15"],
          },
        ],
      }),
      source,
      evidenceHandles,
      lookupResults: [routeLookup],
      routeUniverse: ["M15", "M14A"],
    });

    expect(validation.state).toBe("repairable_rejected");
    expect(validation.issues.map((issue) => issue.code)).toContain(
      "selected_route_not_in_lookup_result",
    );
  });

  test("rejects route canonical selections written to non-canonical field paths", () => {
    const validation = validateDocumentResearchSurfaceDraft({
      draft: baseDraft({
        canonicalSelections: [
          {
            fieldPath: "rawPayload.location",
            lookupKind: "route",
            lookupHandle: "route-lookup-m15-sbs",
            selectedIds: ["M15"],
            rawTextFieldPath: "rawPayload.routeTextRaw",
            evidenceHandles: ["evidence-route-m15"],
          },
        ],
      }),
      source,
      evidenceHandles,
      lookupResults: [routeLookup],
      routeUniverse: ["M15"],
    });

    expect(validation.state).toBe("repairable_rejected");
    expect(validation.issues.map((issue) => issue.code)).toContain(
      "route_selection_field_path_not_canonical",
    );
  });

  test("rejects evidence support paths that do not resolve on the draft", () => {
    const validation = validateDocumentResearchSurfaceDraft({
      draft: baseDraft({
        evidenceByField: {
          routeTextRaw: [
            {
              evidenceHandle: "evidence-route-m15",
              supportRole: "route_scope",
              supportCompleteness: "exact",
            },
          ],
        },
      }),
      source,
      evidenceHandles,
      lookupResults: [routeLookup],
      routeUniverse: ["M15"],
    });

    expect(validation.state).toBe("repairable_rejected");
    expect(validation.issues.map((issue) => issue.code)).toContain("evidence_field_path_not_found");
  });

  test("rejects missing-data support without a source search transcript", () => {
    const validation = validateDocumentResearchSurfaceDraft({
      draft: baseDraft({
        evidenceByField: {
          "rawPayload.routeTextRaw": [
            {
              evidenceHandle: "evidence-route-m15",
              supportRole: "missing_data",
              supportCompleteness: "absent",
            },
          ],
        },
      }),
      source,
      evidenceHandles,
      lookupResults: [routeLookup],
      routeUniverse: ["M15"],
    });

    expect(validation.state).toBe("repairable_rejected");
    expect(validation.issues.map((issue) => issue.code)).toContain(
      "missing_data_requires_search_transcript",
    );
  });

  test("rejects missing route raw text field paths", () => {
    const validation = validateDocumentResearchSurfaceDraft({
      draft: baseDraft({
        canonicalSelections: [
          {
            fieldPath: "routeIds",
            lookupKind: "route",
            lookupHandle: "route-lookup-m15-sbs",
            selectedIds: ["M15"],
            rawTextFieldPath: "rawPayload.missingRouteText",
            evidenceHandles: ["evidence-route-m15"],
          },
        ],
      }),
      source,
      evidenceHandles,
      lookupResults: [routeLookup],
      routeUniverse: ["M15"],
    });

    expect(validation.state).toBe("repairable_rejected");
    expect(validation.issues.map((issue) => issue.code)).toContain(
      "raw_route_text_field_path_not_found",
    );
  });

  test("materializes accepted drafts and returns invalid drafts for repair", () => {
    const result = submitDocumentResearchSurfaceDrafts({
      idPrefix: "tier2-agentic-run",
      drafts: [
        baseDraft(),
        baseDraft({
          displayLabel: "Bad route selection",
          canonicalSelections: [
            {
              fieldPath: "routeIds",
              lookupKind: "route",
              lookupHandle: "route-lookup-m15-sbs",
              selectedIds: ["M14A"],
              rawTextFieldPath: "rawPayload.routeTextRaw",
              evidenceHandles: ["evidence-route-m15"],
            },
          ],
        }),
      ],
      source,
      evidenceHandles,
      lookupResults: [routeLookup],
      routeUniverse: ["M15", "M14A"],
    });

    expect(result.state).toBe("partial_accepted");
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.accepted[0]?.surface.surfaceId).toBe("tier2-agentic-run:surface:1");
    expect(result.accepted[0]?.surface.canonicalPayload).toEqual({
      routeIds: ["M15"],
    });
    expect(result.rejected[0]?.validation.issues.map((issue) => issue.code)).toContain(
      "selected_route_not_in_lookup_result",
    );
  });
});
