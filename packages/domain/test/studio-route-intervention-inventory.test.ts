import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  StudioInterventionFacetIndexSchema,
  StudioRouteInterventionInventoryBundleSchema,
  StudioRouteInterventionInventoryIndexSchema,
  StudioRouteInterventionInventoryReconciliationSchema,
} from "@bp/domain/studio";
import {
  interventionFacetIndexKey,
  routeInterventionInventoryBundleKey,
  routeInterventionInventoryIndexKey,
  routeInterventionInventoryReconciliationKey,
} from "@bp/domain/studio/route-intervention-inventory-key";
import { Schema } from "effect";

const treatmentId = "treatment:v1:aaaaaaaaaaaaaaaaaaaaaaaa";
const secondTreatmentId = "treatment:v1:bbbbbbbbbbbbbbbbbbbbbbbb";
const occurrenceId = "occurrence:v1:cccccccccccccccccccccccc";

const releaseIdentity = {
  releaseId: "pub_20260720T120000000Z",
  publishedAt: "2026-07-20T12:00:00.000Z",
  coverage: { start: "2023-04", end: "2026-06" },
};

const route = {
  routeId: "B44+",
  routeFamilyId: "B44",
  displayLabel: "B44-SBS",
  officialLongName: "Sheepshead Bay - Williamsburg",
  designationLiterals: ["route_type:SBS", "trip_type:14"],
  serviceModes: ["sbs"],
  routeTypes: ["SBS"],
  tripTypes: ["14"],
};

function sourceStates() {
  return [
    {
      sourceKind: "intervention_corpus",
      requirement: "required",
      availability: "available",
      checkedCoverage: releaseIdentity.coverage,
      recordCount: 1,
    },
    {
      sourceKind: "route_evidence",
      requirement: "required",
      availability: "available",
      checkedCoverage: releaseIdentity.coverage,
      recordCount: 1,
    },
    {
      sourceKind: "operational_occurrences",
      requirement: "required",
      availability: "available",
      checkedCoverage: releaseIdentity.coverage,
      recordCount: 1,
    },
    {
      sourceKind: "local_registry",
      requirement: "optional",
      availability: "available",
      checkedCoverage: releaseIdentity.coverage,
      recordCount: 1,
    },
  ];
}

function treatment(id = treatmentId, kind = "bus_lane", family = "bus_priority_lane") {
  return {
    treatmentId: id,
    sourceNamespace: "reviewed_corpus",
    sourceRecordId: "record-1",
    sourceId: "mta-capital-plan",
    componentCollection: "primary",
    componentPosition: 0,
    rawKind: kind,
    rawLabel: "Center-running bus lane",
    treatmentKind: kind,
    treatmentFamily: family,
    lifecycleState: "implemented",
    statusAsOf: "2026-06",
    effectiveDate: "2024-05-01",
    datePrecision: "day",
    geographyScope: "route",
    sourceRefs: ["wiki:record-1"],
    occurrenceIds: [occurrenceId],
    projectIds: ["project-1"],
  };
}

function populatedBundle() {
  return {
    artifactKind: "bp.studio.route_intervention_inventory_bundle.v1",
    schemaVersion: 1,
    ...releaseIdentity,
    route,
    routeSlug: "b44-sbs",
    coverageState: "available",
    sourceStates: sourceStates(),
    treatments: [treatment()],
    occurrences: [
      {
        occurrenceId,
        sourceNamespace: "local_registry",
        sourceOccurrenceId: "event-1",
        sourceId: "mta-open-data",
        producerPhaseOrPosition: "implemented:0",
        routeId: "B44+",
        treatmentIds: [treatmentId],
        lifecycleState: "implemented",
        phase: "implementation",
        rawStatus: "active",
        program: "ACE",
        effectiveDate: "2024-05-01",
        datePrecision: "day",
        geographyScope: "route",
        sourceRefs: ["local_intervention_event:event-1"],
        projectIds: ["project-1"],
        wikiOccurrenceId: null,
        registryLineage: {
          dataProductId: "local_intervention_events_release",
          eventId: "event-1",
          rawRouteId: "B44+",
          rawInterventionType: "bus_lane",
          sourceId: "mta-open-data",
          rawStatus: "active",
          program: "ACE",
          implementationDate: "2024-05-01",
          implementationMonth: "2024-05",
        },
      },
    ],
    currentState: [
      {
        treatmentKind: "bus_lane",
        treatmentFamily: "bus_priority_lane",
        lifecycleState: "implemented",
        effectiveDate: "2024-05-01",
        datePrecision: "day",
        treatmentIds: [treatmentId],
        occurrenceIds: [occurrenceId],
      },
    ],
    projectRefs: [
      {
        projectId: "project-1",
        treatmentIds: [treatmentId],
        occurrenceIds: [occurrenceId],
        citationKeys: ["citation-1"],
      },
    ],
    sourceGaps: [],
  };
}

function checkedEmptyBundle() {
  return {
    ...populatedBundle(),
    coverageState: "checked_no_positive_evidence",
    treatments: [],
    occurrences: [],
    currentState: [],
    projectRefs: [],
  };
}

describe("Studio route intervention inventory contracts", () => {
  test("round-trips the bundle, route index, facet index, and reconciliation", () => {
    const bundle = decodeStrict(StudioRouteInterventionInventoryBundleSchema)(populatedBundle());
    expect(
      Schema.encodeSync(StudioRouteInterventionInventoryBundleSchema)(bundle) as unknown,
    ).toEqual(populatedBundle());

    const index = {
      artifactKind: "bp.studio.route_intervention_inventory_index.v1",
      schemaVersion: 1,
      ...releaseIdentity,
      summary: { routeCount: 1, checkedEmptyRouteCount: 0, totalByteSize: 4_096 },
      routes: [
        {
          route,
          routeSlug: "b44-sbs",
          bundleKey: routeInterventionInventoryBundleKey("b44-sbs"),
          sha256: "d".repeat(64),
          byteSize: 4_096,
          coverageState: "available",
          familyCounts: [{ treatmentFamily: "bus_priority_lane", count: 1 }],
          stateCounts: [{ lifecycleState: "implemented", count: 1 }],
          sourceStateSummary: { availableCount: 4, partialCount: 0, unavailableCount: 0 },
        },
      ],
    };
    expect(decodeStrict(StudioRouteInterventionInventoryIndexSchema)(index) as unknown).toEqual(
      index,
    );

    const facetIndex = {
      artifactKind: "bp.studio.intervention_facet_index.v1",
      schemaVersion: 1,
      ...releaseIdentity,
      summary: { rowCount: 1, routeCount: 1, treatmentCount: 2, occurrenceCount: 1 },
      rows: [
        {
          facetId: "facet-1",
          sourceNamespace: "reviewed_corpus",
          sourceRecordId: "record-1",
          sourceOccurrenceId: "event-1",
          occurrenceId,
          routeId: "B44+",
          routeSlug: "b44-sbs",
          treatmentIds: [treatmentId, secondTreatmentId],
          treatmentKinds: ["bus_lane", "queue_jump"],
          treatmentFamilies: ["bus_priority_lane", "signal_priority"],
          lifecycleState: "implemented",
          effectiveDate: "2024-05-01",
          datePrecision: "day",
          projectIds: ["project-1"],
          bundleKey: routeInterventionInventoryBundleKey("b44-sbs"),
        },
      ],
    };
    expect(decodeStrict(StudioInterventionFacetIndexSchema)(facetIndex) as unknown).toEqual(
      facetIndex,
    );

    const reconciliation = {
      artifactKind: "bp.studio.route_intervention_inventory_reconciliation.v1",
      schemaVersion: 1,
      ...releaseIdentity,
      summary: {
        sourceRecordCount: 1,
        sourceTreatmentCount: 2,
        sourceOccurrenceCount: 1,
        mappedTreatmentCount: 2,
        otherDocumentedTreatmentCount: 0,
        unmappedTreatmentCount: 0,
        projectedTreatmentCount: 2,
        projectedOccurrenceCount: 1,
        projectTreatmentRelationshipCount: 2,
        projectOccurrenceRelationshipCount: 1,
        routeProjectionFailureCount: 0,
        checkedEmptyRouteCount: 0,
      },
      sourceStates: sourceStates(),
      familyCounts: [
        { treatmentFamily: "bus_priority_lane", count: 1 },
        { treatmentFamily: "signal_priority", count: 1 },
      ],
      stateCounts: [{ lifecycleState: "implemented", count: 2 }],
      projectionFailures: [],
      reviewedOpenVocabulary: {
        sha256: "e".repeat(64),
        literalCount: 2,
        sourceCounts: [{ sourceNamespace: "reviewed_corpus", literalCount: 2 }],
      },
    };
    expect(
      decodeStrict(StudioRouteInterventionInventoryReconciliationSchema)(reconciliation) as unknown,
    ).toEqual(reconciliation);
  });

  test("rejects wrong versions and a route-index hash that is not 64 lowercase hex", () => {
    expect(() =>
      decodeStrict(StudioRouteInterventionInventoryBundleSchema)({
        ...populatedBundle(),
        schemaVersion: 2,
      }),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioRouteInterventionInventoryIndexSchema)({
        artifactKind: "bp.studio.route_intervention_inventory_index.v1",
        schemaVersion: 1,
        ...releaseIdentity,
        summary: { routeCount: 1, checkedEmptyRouteCount: 0, totalByteSize: 1 },
        routes: [
          {
            route,
            routeSlug: "b44-sbs",
            bundleKey: routeInterventionInventoryBundleKey("b44-sbs"),
            sha256: "A".repeat(64),
            byteSize: 1,
            coverageState: "available",
            familyCounts: [],
            stateCounts: [],
            sourceStateSummary: { availableCount: 4, partialCount: 0, unavailableCount: 0 },
          },
        ],
      }),
    ).toThrow();
  });

  test("rejects excess and forbidden observation/effect fields", () => {
    expect(() =>
      decodeStrict(StudioRouteInterventionInventoryBundleSchema)({
        ...populatedBundle(),
        effectEstimate: 2.5,
      }),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioRouteInterventionInventoryBundleSchema)({
        ...populatedBundle(),
        treatments: [{ ...treatment(), beforeMean: 8.1, afterMean: 9.2 }],
      }),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioRouteInterventionInventoryBundleSchema)({
        ...populatedBundle(),
        occurrences: [
          { ...populatedBundle().occurrences[0], direction: "improved", verdict: "win" },
        ],
      }),
    ).toThrow();
  });

  test("requires every source state and accepts explicit checked-empty coverage", () => {
    expect(
      decodeStrict(StudioRouteInterventionInventoryBundleSchema)(checkedEmptyBundle()) as unknown,
    ).toEqual(checkedEmptyBundle());
    expect(() =>
      decodeStrict(StudioRouteInterventionInventoryBundleSchema)({
        ...checkedEmptyBundle(),
        sourceStates: sourceStates().slice(0, 3),
      }),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioRouteInterventionInventoryBundleSchema)({
        ...checkedEmptyBundle(),
        treatments: [treatment()],
      }),
    ).toThrow("Checked-empty bundles");
  });

  test("accepts known rows with explicit partial optional-source coverage", () => {
    const partial = {
      ...populatedBundle(),
      coverageState: "partial",
      sourceStates: sourceStates().map((state) =>
        state.sourceKind === "local_registry"
          ? { ...state, availability: "unavailable", checkedCoverage: null, recordCount: 0 }
          : state,
      ),
    };
    expect(decodeStrict(StudioRouteInterventionInventoryBundleSchema)(partial) as unknown).toEqual(
      partial,
    );
  });

  test("publishes the four exact browser-safe keys", () => {
    expect(routeInterventionInventoryBundleKey("b44-sbs")).toBe(
      "studio/v2/routes/b44-sbs/intervention-inventory.json",
    );
    expect(routeInterventionInventoryIndexKey()).toBe(
      "studio/v2/interventions/route-inventory-index.json",
    );
    expect(interventionFacetIndexKey()).toBe("studio/v2/interventions/facet-index.json");
    expect(routeInterventionInventoryReconciliationKey()).toBe(
      "studio/v2/interventions/route-inventory-reconciliation.json",
    );
  });
});
