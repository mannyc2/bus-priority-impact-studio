import { describe, expect, test } from "bun:test";
import {
  assertNoStableInterventionIdCollisions,
  buildRouteTreatmentSummaryArtifact,
  deriveNormalizedRouteTreatmentCurrentState,
  normalizedRouteTreatmentFactsFromPublishableInterventions,
  normalizedRouteTreatmentOccurrenceFacts,
  type ReviewedOpenTreatmentDispositionV1,
  routeTreatmentSourceRowsFromPublishableInterventions,
  stableOccurrenceId,
  stableTreatmentId,
} from "@bp/analytics/interventions";
import type { StudioRouteIdentityPresentation } from "@bp/domain/studio";

function route(routeId: string): StudioRouteIdentityPresentation {
  return {
    routeId,
    routeFamilyId: routeId.replace(/\+$/u, ""),
    displayLabel: routeId,
    officialLongName: null,
    designationLiterals: [routeId],
    serviceModes: routeId.endsWith("+") ? ["sbs"] : ["local"],
    routeTypes: routeId.endsWith("+") ? ["SBS"] : ["Local"],
    tripTypes: [1],
  };
}

const REVIEWED_OTHER: ReviewedOpenTreatmentDispositionV1[] = [
  {
    rawValue: "platform treatment",
    disposition: "other_documented",
    treatmentKind: "other_documented",
    treatmentFamily: "other",
    reviewedLabel: "Platform treatment",
  },
  {
    rawValue: "curb treatment",
    disposition: "other_documented",
    treatmentKind: "other_documented",
    treatmentFamily: "other",
    reviewedLabel: "Curb treatment",
  },
];

const FOUR_COMPONENT_RECORD = {
  recordId: "record-4",
  sourceId: "source-1",
  status: "planned",
  routes: ["B44"],
  primaryTreatments: ["bus_lane", "ace"],
  customTreatments: ["platform treatment", "curb treatment"],
  effectiveDate: "2027-01-01",
  datePrecision: "day",
  evidenceCandidateIds: ["candidate-1"],
};

describe("reviewed-document treatment preservation", () => {
  test("legacy compatibility adapter emits all two primary and two custom components", () => {
    const rows = routeTreatmentSourceRowsFromPublishableInterventions({
      rows: [FOUR_COMPONENT_RECORD],
      month: "2026-07",
    });
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => [row.treatmentType, row.rawTreatmentType])).toEqual([
      ["bus_lane", "bus_lane"],
      ["ace", "ace"],
      ["custom_treatment", "platform treatment"],
      ["custom_treatment", "curb treatment"],
    ]);
  });

  test("normalized adapter preserves four stable source-order facts", () => {
    const result = normalizedRouteTreatmentFactsFromPublishableInterventions({
      rows: [FOUR_COMPONENT_RECORD],
      routes: [route("B44"), route("B44+")],
      statusAsOf: "2026-07-20",
      reviewedOpenDispositions: REVIEWED_OTHER,
    });
    expect(result.summary).toEqual({
      componentCount: 4,
      mappedComponentCount: 2,
      otherDocumentedComponentCount: 2,
      unmappedReviewRequiredComponentCount: 0,
      factCount: 4,
      unresolvedRouteCount: 0,
    });
    expect(result.facts.map((fact) => fact.rawKind)).toEqual([
      "bus_lane",
      "ace",
      "platform treatment",
      "curb treatment",
    ]);
    expect(result.facts.map((fact) => fact.componentPosition)).toEqual([0, 1, 0, 1]);
    expect(result.facts.map((fact) => fact.treatmentId)).toEqual(
      result.componentReconciliation.map((row) => row.treatmentId),
    );
    expect(
      result.facts.every((fact) => /^treatment:v1:[0-9a-f]{24}$/u.test(fact.treatmentId)),
    ).toBe(true);
  });

  test("reconciles unknown treatment and exact-route gaps without dropping counts", () => {
    const result = normalizedRouteTreatmentFactsFromPublishableInterventions({
      rows: [
        {
          ...FOUR_COMPONENT_RECORD,
          routes: ["B44"],
          primaryTreatments: ["bus_lane"],
          customTreatments: ["unreviewed compound"],
        },
      ],
      routes: [route("B44+")],
      statusAsOf: "2026-07-20",
      reviewedOpenDispositions: REVIEWED_OTHER,
    });
    expect(result.summary.componentCount).toBe(
      result.summary.mappedComponentCount +
        result.summary.otherDocumentedComponentCount +
        result.summary.unmappedReviewRequiredComponentCount,
    );
    expect(result.summary).toMatchObject({
      componentCount: 2,
      mappedComponentCount: 1,
      unmappedReviewRequiredComponentCount: 1,
      factCount: 0,
      unresolvedRouteCount: 1,
    });
    expect(result.componentReconciliation[1]?.disposition).toMatchObject({
      disposition: "unmapped_review_required",
      rawValue: "unreviewed compound",
    });
    expect(result.routeReconciliation[0]).toEqual({
      sourceNamespace: "reviewed_intervention_corpus",
      sourceVocabulary: "reviewed_intervention_corpus.routes",
      rawRouteId: "B44",
      reason: "exact_route_not_found",
    });
  });
});

describe("stable treatment and occurrence facts", () => {
  test("uses deterministic 24-hex IDs and excludes mutable lifecycle fields", () => {
    const treatmentInput = {
      sourceNamespace: "wiki",
      sourceRecordId: "record-1",
      componentCollection: "wiki" as const,
      componentPosition: 2,
      rawKind: "busway",
    };
    const treatmentId = stableTreatmentId(treatmentInput);
    expect(treatmentId).toMatch(/^treatment:v1:[0-9a-f]{24}$/u);
    expect(stableTreatmentId(treatmentInput)).toBe(treatmentId);
    const occurrenceInput = {
      sourceNamespace: "wiki",
      sourceOccurrenceId: "occurrence-source-1",
      producerPhaseOrPosition: "implementation",
      routeId: "B44",
      treatmentId,
    };
    expect(stableOccurrenceId(occurrenceInput)).toMatch(/^occurrence:v1:[0-9a-f]{24}$/u);
    expect(stableOccurrenceId(occurrenceInput)).toBe(stableOccurrenceId({ ...occurrenceInput }));
  });

  test("detects a truncated-ID collision between unequal canonical tuples", () => {
    expect(() =>
      assertNoStableInterventionIdCollisions([
        { id: "treatment:v1:000000000000000000000000", tuple: ["a", "record"] },
        { id: "treatment:v1:000000000000000000000000", tuple: ["b", "record"] },
      ]),
    ).toThrow("Stable intervention ID collision");
  });

  test("keeps independent occurrences and derives current state only as references", () => {
    const normalized = normalizedRouteTreatmentFactsFromPublishableInterventions({
      rows: [
        {
          ...FOUR_COMPONENT_RECORD,
          primaryTreatments: ["bus_lane"],
          customTreatments: [],
        },
      ],
      routes: [route("B44")],
      statusAsOf: "2026-07-20",
    });
    const treatment = normalized.facts[0];
    expect(treatment).toBeDefined();
    if (treatment === undefined) throw new Error("fixture treatment missing");
    const occurrences = normalizedRouteTreatmentOccurrenceFacts([
      {
        sourceNamespace: "wiki",
        sourceOccurrenceId: "producer-occurrence-1",
        producerPhaseOrPosition: "planned",
        routeId: "B44",
        treatmentId: treatment.treatmentId,
        lifecycleState: "planned",
      },
      {
        sourceNamespace: "wiki",
        sourceOccurrenceId: "producer-occurrence-1",
        producerPhaseOrPosition: "implemented",
        routeId: "B44",
        treatmentId: treatment.treatmentId,
        lifecycleState: "implemented",
      },
    ]);
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]?.occurrenceId).not.toBe(occurrences[1]?.occurrenceId);
    const currentState = deriveNormalizedRouteTreatmentCurrentState({
      treatments: normalized.facts,
      occurrences,
    });
    expect(currentState).toEqual([
      {
        routeId: "B44",
        treatmentKind: "bus_lane",
        treatmentFamily: "bus_priority_lane",
        lifecycleState: "implemented",
        treatmentIds: [treatment.treatmentId],
        occurrenceIds: occurrences.map((row) => row.occurrenceId).sort(),
      },
    ]);
    expect(occurrences.map((row) => row.lifecycleState)).toEqual(["planned", "implemented"]);
  });
});

describe("legacy summary exact-route compatibility", () => {
  test("keeps Q6 and Q06 independent and refuses neighboring identities", () => {
    const artifact = buildRouteTreatmentSummaryArtifact({
      month: "2026-07",
      routeIds: ["Q6", "Q06"],
      evidenceRows: [
        {
          routeId: "Q6",
          treatmentType: "bus_lane",
          status: "implemented",
          evidenceLabel: "deterministic_source",
        },
        {
          routeId: "q6",
          treatmentType: "busway",
          status: "implemented",
          evidenceLabel: "deterministic_source",
        },
      ],
      generatedAt: "2026-07-20T00:00:00.000Z",
      dbPath: "fixture.sqlite",
      artifactPath: "fixture.json",
      includeNoDataRows: false,
      includeTspCurrentInventorySourceGap: false,
    });
    expect(artifact.routeTreatmentRows.map((row) => row.routeId)).toEqual(["Q6"]);
    expect(artifact.validation.issues).toContainEqual(
      expect.objectContaining({ code: "non_catalog_evidence_route_ids_skipped" }),
    );
  });
});
