import { describe, expect, test } from "bun:test";
import {
  interventionPresentationForTreatment,
  routeInterventionViewModel,
  treatmentRecordAnchorId,
} from "../../src/components/route/route-intervention-model";
import type {
  StudioInterventionLifecycleState,
  StudioInterventionTreatmentFamily,
  StudioInterventionTreatmentKind,
  StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionOccurrence,
  StudioRouteInterventionTreatment,
} from "../../src/studio/api-contract";
import { isoMonthFixture } from "./schema-fixtures";

const TREATMENT_IDS = {
  implementedLane: "treatment:v1:000000000000000000000001",
  historicalLane: "treatment:v1:000000000000000000000002",
  proposedOther: "treatment:v1:000000000000000000000003",
} as const;

const OCCURRENCE_IDS = {
  firstLane: "occurrence:v1:000000000000000000000001",
  secondLane: "occurrence:v1:000000000000000000000002",
} as const;

function treatment(
  treatmentId: string,
  treatmentKind: StudioInterventionTreatmentKind,
  treatmentFamily: StudioInterventionTreatmentFamily,
  lifecycleState: StudioInterventionLifecycleState,
  overrides: Partial<StudioRouteInterventionTreatment> = {},
): StudioRouteInterventionTreatment {
  return {
    treatmentId,
    sourceNamespace: "reviewed_intervention_corpus",
    sourceRecordId: `record:${treatmentId}`,
    sourceId: "fixture-source",
    componentCollection: "primary",
    componentPosition: 0,
    rawKind: treatmentKind,
    rawLabel: null,
    treatmentKind,
    treatmentFamily,
    lifecycleState,
    statusAsOf: null,
    effectiveDate: null,
    datePrecision: "unknown",
    geographyScope: "route",
    sourceRefs: ["source:fixture-source"],
    occurrenceIds: [],
    projectIds: [],
    ...overrides,
  };
}

function occurrence(
  occurrenceId: string,
  treatmentId: string,
  effectiveDate: string,
): StudioRouteInterventionOccurrence {
  return {
    occurrenceId,
    sourceNamespace: "operational_occurrences",
    sourceOccurrenceId: `source:${occurrenceId}`,
    sourceId: "fixture-source",
    producerPhaseOrPosition: "0",
    routeId: "B44",
    treatmentIds: [treatmentId],
    lifecycleState: "implemented",
    phase: "opening",
    rawStatus: "implemented",
    program: "Fixture program",
    effectiveDate,
    datePrecision: "day",
    geographyScope: "route",
    sourceRefs: ["source:fixture-source"],
    projectIds: [],
    wikiOccurrenceId: null,
    registryLineage: null,
  };
}

function bundle(
  routeId = "B44",
  routeSlug = "b44",
  overrides: Partial<StudioRouteInterventionInventoryBundle> = {},
): StudioRouteInterventionInventoryBundle {
  return {
    artifactKind: "bp.studio.route_intervention_inventory_bundle.v1",
    schemaVersion: 1,
    releaseId: "pub_20260718T180527000Z",
    publishedAt: "2026-07-18T18:05:27.000Z",
    coverage: { start: null, end: isoMonthFixture("2026-03") },
    route: {
      routeId,
      routeFamilyId: routeId.replace("+", ""),
      displayLabel: routeId === "B44+" ? "B44 SBS" : routeId,
      officialLongName: null,
      designationLiterals: routeId === "B44+" ? ["route_type:SBS"] : ["route_type:Local"],
      serviceModes: routeId === "B44+" ? ["sbs"] : ["local"],
      routeTypes: routeId === "B44+" ? ["SBS"] : ["Local"],
      tripTypes: routeId === "B44+" ? ["14"] : ["1"],
    },
    routeSlug,
    coverageState: "available",
    sourceStates: [
      {
        sourceKind: "intervention_corpus",
        requirement: "required",
        availability: "available",
        checkedCoverage: { start: null, end: isoMonthFixture("2026-03") },
        recordCount: 1,
      },
      {
        sourceKind: "route_evidence",
        requirement: "required",
        availability: "available",
        checkedCoverage: { start: null, end: isoMonthFixture("2026-03") },
        recordCount: 1,
      },
      {
        sourceKind: "operational_occurrences",
        requirement: "required",
        availability: "available",
        checkedCoverage: { start: null, end: isoMonthFixture("2026-03") },
        recordCount: 2,
      },
      {
        sourceKind: "local_registry",
        requirement: "optional",
        availability: "available",
        checkedCoverage: { start: null, end: isoMonthFixture("2026-03") },
        recordCount: 0,
      },
    ],
    treatments: [],
    occurrences: [],
    currentState: [],
    projectRefs: [],
    sourceGaps: [],
    ...overrides,
  };
}

describe("route intervention presentation model", () => {
  test("maps typed treatments without consulting prose and preserves reviewed custom labels", () => {
    const busway = treatment(
      TREATMENT_IDS.implementedLane,
      "busway",
      "bus_priority_lane",
      "implemented",
      { rawLabel: "generic prose that says nothing useful" },
    );
    expect(interventionPresentationForTreatment(busway)).toMatchObject({
      label: "Busway",
      compactCode: "BWY",
      family: "bus_priority_lane",
      operationalAnnotationStem: null,
    });

    const enforcement = treatment(
      TREATMENT_IDS.historicalLane,
      "automated_bus_lane_enforcement",
      "enforcement",
      "implemented",
    );
    expect(interventionPresentationForTreatment(enforcement).operationalAnnotationStem).toBe(
      "Enforcement starts",
    );

    const custom = treatment(
      TREATMENT_IDS.proposedOther,
      "other_documented",
      "other",
      "proposed",
      { rawKind: "limited_to_local_conversion", rawLabel: "Limited-to-local conversion" },
    );
    expect(interventionPresentationForTreatment(custom)).toMatchObject({
      label: "Limited-to-local conversion",
      compactCode: null,
      tone: "neutral",
      operationalAnnotationStem: null,
    });
  });

  test("orders lifecycle groups without merging distinct treatment IDs", () => {
    const model = routeInterventionViewModel(
      bundle("B44", "b44", {
        treatments: [
          treatment(
            TREATMENT_IDS.proposedOther,
            "other_documented",
            "other",
            "proposed",
            { rawKind: "priority_corridor", rawLabel: "Priority corridor" },
          ),
          treatment(
            TREATMENT_IDS.historicalLane,
            "bus_lane",
            "bus_priority_lane",
            "historical_confirmed",
            { effectiveDate: "2019-01", datePrecision: "month" },
          ),
          treatment(
            TREATMENT_IDS.implementedLane,
            "bus_lane",
            "bus_priority_lane",
            "implemented",
            { effectiveDate: "2024-01", datePrecision: "month" },
          ),
        ],
      }),
    );

    expect(model.treatments.map((row) => row.key)).toEqual([
      TREATMENT_IDS.implementedLane,
      TREATMENT_IDS.historicalLane,
      TREATMENT_IDS.proposedOther,
    ]);
    expect(model.treatments.filter((row) => row.presentation.label === "Bus lane")).toHaveLength(2);
  });

  test("keeps same-family occurrences distinct and relates projects by stable IDs", () => {
    const first = occurrence(
      OCCURRENCE_IDS.firstLane,
      TREATMENT_IDS.implementedLane,
      "2021-01-01",
    );
    const second = occurrence(
      OCCURRENCE_IDS.secondLane,
      TREATMENT_IDS.historicalLane,
      "2023-01-01",
    );
    const model = routeInterventionViewModel(
      bundle("B44", "b44", {
        treatments: [
          treatment(
            TREATMENT_IDS.implementedLane,
            "bus_lane",
            "bus_priority_lane",
            "implemented",
          ),
          treatment(
            TREATMENT_IDS.historicalLane,
            "bus_lane",
            "bus_priority_lane",
            "implemented",
          ),
        ],
        occurrences: [first, second],
        projectRefs: [
          {
            projectId: "project_b44_lane",
            treatmentIds: [TREATMENT_IDS.implementedLane],
            occurrenceIds: [OCCURRENCE_IDS.firstLane],
            citationKeys: ["source#block"],
          },
        ],
        sourceGaps: [
          {
            gapId: "gap:B44:tsp",
            sourceKind: "route_evidence",
            sourceId: "fixture-source",
            treatmentKind: "transit_signal_priority",
            gapKind: "missing_operational_date",
            sourceRefs: ["source:fixture-source"],
            projectIds: ["project_b44_lane"],
          },
        ],
      }),
    );

    expect(model.timeline.map((row) => row.key)).toEqual([
      OCCURRENCE_IDS.secondLane,
      OCCURRENCE_IDS.firstLane,
    ]);
    expect(model.timeline[1]?.projectIds).toEqual(["project_b44_lane"]);
    expect(model.projects[0]?.key).toBe("project_b44_lane");
    expect(model.gaps[0]?.key).toBe("gap:B44:tsp");
  });

  test("preserves B44 and B44+ as separate route identities", () => {
    expect(routeInterventionViewModel(bundle("B44", "b44"))).toMatchObject({
      routeId: "B44",
      routeSlug: "b44",
    });
    expect(routeInterventionViewModel(bundle("B44+", "b44-sbs"))).toMatchObject({
      routeId: "B44+",
      routeSlug: "b44-sbs",
    });
  });

  test("exposes unavailable, partial, and checked-empty states honestly", () => {
    expect(routeInterventionViewModel(null).coverage).toEqual({
      status: "unavailable",
      message: "Treatment inventory unavailable",
    });
    expect(
      routeInterventionViewModel(bundle("B44", "b44", { coverageState: "partial" })).coverage,
    ).toMatchObject({ status: "partial" });
    expect(
      routeInterventionViewModel(
        bundle("B44", "b44", { coverageState: "checked_no_positive_evidence" }),
      ).coverage,
    ).toEqual({
      status: "checked_empty",
      message: "No positive treatment evidence was found in checked sources.",
    });
  });

  test("generates stable DOM-safe and collision-resistant record anchors", () => {
    expect(treatmentRecordAnchorId("treatment:v1:abc")).toBe(
      "intervention-treatment_3a_v1_3a_abc",
    );
    expect(treatmentRecordAnchorId("B44+")).not.toBe(treatmentRecordAnchorId("B44_2b_"));
    expect(treatmentRecordAnchorId("gap:B44:tsp")).toMatch(/^[A-Za-z][A-Za-z0-9_-]+$/u);
  });
});
