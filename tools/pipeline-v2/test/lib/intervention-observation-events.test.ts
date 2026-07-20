import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  type StudioInterventionDatePrecision,
  type StudioInterventionGeographyScope,
  type StudioInterventionLifecycleState,
  type StudioInterventionTreatmentFamily,
  type StudioInterventionTreatmentKind,
  type StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionInventoryBundleSchema,
} from "@bp/domain/studio";
import { classifyInterventionObservationEvents } from "../../src/lib/intervention-observation-events.ts";

const RELEASE = {
  releaseId: "pub_20260720T120000000Z",
  publishedAt: "2026-07-20T12:00:00.000Z",
  coverage: { start: "2023-01", end: "2026-06" },
} as const;
const TREATMENT_ID = "treatment:v1:aaaaaaaaaaaaaaaaaaaaaaaa";
const OCCURRENCE_A = "occurrence:v1:aaaaaaaaaaaaaaaaaaaaaaaa";
const OCCURRENCE_B = "occurrence:v1:bbbbbbbbbbbbbbbbbbbbbbbb";

type OccurrenceFixture = {
  readonly occurrenceId: string;
  readonly effectiveDate?: string | null;
  readonly datePrecision?: StudioInterventionDatePrecision;
  readonly lifecycleState?: StudioInterventionLifecycleState;
  readonly geographyScope?: StudioInterventionGeographyScope;
  readonly routeId?: "B44" | "B44+";
  readonly rawRouteId?: "B44" | "B44+";
  readonly registryLineage?: boolean;
  readonly wikiOccurrenceId?: string | null;
  readonly sourceRefs?: readonly string[];
};

type BundleFixture = {
  readonly kind?: StudioInterventionTreatmentKind;
  readonly family?: StudioInterventionTreatmentFamily;
  readonly treatmentLifecycleState?: StudioInterventionLifecycleState;
  readonly treatmentSourceRefs?: readonly string[];
  readonly treatmentOccurrenceIds?: readonly string[];
  readonly occurrences?: readonly OccurrenceFixture[];
  readonly localRegistryAvailability?: "available" | "partial" | "unavailable";
  readonly operationalOccurrencesAvailability?: "available" | "partial";
};

function route(routeId: "B44" | "B44+") {
  const sbs = routeId.endsWith("+");
  return {
    routeId,
    routeFamilyId: "B44",
    displayLabel: sbs ? "B44-SBS" : "B44",
    officialLongName: "Sheepshead Bay - Williamsburg",
    designationLiterals: [sbs ? "route_type:SBS" : "route_type:Local"],
    serviceModes: [sbs ? "sbs" : "local"],
    routeTypes: [sbs ? "SBS" : "Local"],
    tripTypes: [sbs ? 14 : 1],
  };
}

function sourceState(
  sourceKind:
    | "intervention_corpus"
    | "route_evidence"
    | "operational_occurrences"
    | "local_registry",
  availability: "available" | "partial" | "unavailable",
) {
  return {
    sourceKind,
    requirement: sourceKind === "local_registry" ? "optional" : "required",
    availability,
    checkedCoverage: availability === "unavailable" ? null : RELEASE.coverage,
    recordCount: availability === "unavailable" ? 0 : 1,
  } as const;
}

function inventoryBundle(input: BundleFixture = {}): StudioRouteInterventionInventoryBundle {
  const kind = input.kind ?? "bus_lane";
  const family = input.family ?? "bus_priority_lane";
  const occurrences = input.occurrences ?? [{ occurrenceId: OCCURRENCE_A }];
  const localAvailability = input.localRegistryAvailability ?? "available";
  const operationalAvailability = input.operationalOccurrencesAvailability ?? "available";
  const sourceStates = [
    sourceState("intervention_corpus", "available"),
    sourceState("route_evidence", "available"),
    sourceState("operational_occurrences", operationalAvailability),
    sourceState("local_registry", localAvailability),
  ];
  const coverageState = sourceStates.every((state) => state.availability === "available")
    ? "available"
    : "partial";
  return decodeStrict(StudioRouteInterventionInventoryBundleSchema)({
    artifactKind: "bp.studio.route_intervention_inventory_bundle.v1",
    schemaVersion: 1,
    ...RELEASE,
    route: route("B44+"),
    routeSlug: "b44-sbs",
    coverageState,
    sourceStates,
    treatments: [
      {
        treatmentId: TREATMENT_ID,
        sourceNamespace: "fixture",
        sourceRecordId: "treatment-1",
        sourceId: "fixture-source",
        componentCollection: "primary",
        componentPosition: 0,
        rawKind: kind,
        rawLabel: kind,
        treatmentKind: kind,
        treatmentFamily: family,
        lifecycleState: input.treatmentLifecycleState ?? "implemented",
        statusAsOf: "2024-01-01",
        effectiveDate: "2024-01-15",
        datePrecision: "day",
        geographyScope: occurrences[0]?.geographyScope ?? "route",
        sourceRefs: input.treatmentSourceRefs ?? ["fixture:treatment-1"],
        occurrenceIds:
          input.treatmentOccurrenceIds ?? occurrences.map((occurrence) => occurrence.occurrenceId),
        projectIds: [],
      },
    ],
    occurrences: occurrences.map((occurrence, index) => {
      const hasRegistryLineage = occurrence.registryLineage ?? true;
      const effectiveDate = occurrence.effectiveDate ?? "2024-01-15T00:00:00.000Z";
      return {
        occurrenceId: occurrence.occurrenceId,
        sourceNamespace: hasRegistryLineage ? "local_registry" : "wiki",
        sourceOccurrenceId: `occurrence-${index + 1}`,
        sourceId: "fixture-source",
        producerPhaseOrPosition: `fixture:${index}`,
        routeId: occurrence.routeId ?? "B44+",
        treatmentIds: [TREATMENT_ID],
        lifecycleState: occurrence.lifecycleState ?? "implemented",
        phase: "implementation",
        rawStatus: "implemented",
        program: "Bus priority",
        effectiveDate,
        datePrecision: occurrence.datePrecision ?? "day",
        geographyScope: occurrence.geographyScope ?? "route",
        sourceRefs: occurrence.sourceRefs ?? ["fixture:occurrence-1"],
        projectIds: [],
        wikiOccurrenceId: occurrence.wikiOccurrenceId ?? null,
        registryLineage: hasRegistryLineage
          ? {
              dataProductId: "local_intervention_events_release",
              eventId: `event-${index + 1}`,
              rawRouteId: occurrence.rawRouteId ?? "B44+",
              rawInterventionType: kind,
              sourceId: "fixture-source",
              rawStatus: "implemented",
              program: "Bus priority",
              implementationDate: effectiveDate ?? "unknown",
              implementationMonth: "2024-01",
            }
          : null,
      };
    }),
    currentState: [],
    projectRefs: [],
    sourceGaps: [],
  });
}

describe("intervention observation event gate", () => {
  test("admits reviewed route, corridor, and segment anchors without using a study allowlist", () => {
    const fixtures = [
      {
        bundle: inventoryBundle(),
        kind: "bus_lane",
        scope: "route",
        month: "2024-01",
        specId: "bus_lane_route_observations_v1",
      },
      {
        bundle: inventoryBundle({
          kind: "busway",
          occurrences: [
            {
              occurrenceId: OCCURRENCE_A,
              effectiveDate: "2024-02",
              datePrecision: "month",
              geographyScope: "corridor",
            },
          ],
        }),
        kind: "busway",
        scope: "corridor",
        month: "2024-02",
        specId: "busway_route_observations_v1",
      },
      {
        bundle: inventoryBundle({
          occurrences: [{ occurrenceId: OCCURRENCE_A, geographyScope: "segment" }],
        }),
        kind: "bus_lane",
        scope: "segment",
        month: "2024-01",
        specId: "bus_lane_route_observations_v1",
      },
      {
        bundle: inventoryBundle({ localRegistryAvailability: "partial" }),
        kind: "bus_lane",
        scope: "route",
        month: "2024-01",
        specId: "bus_lane_route_observations_v1",
      },
    ] as const;
    for (const fixture of fixtures) {
      const result = classifyInterventionObservationEvents(fixture.bundle);
      expect(result.rejections).toEqual([]);
      expect(result.anchors).toHaveLength(1);
      expect(result.anchors[0]).toEqual(
        expect.objectContaining({
          treatmentKind: fixture.kind,
          geographyScope: fixture.scope,
          implementationMonth: fixture.month,
          specIds: [fixture.specId],
        }),
      );
    }
  });

  test("rejects unresolved source-only scope and insufficient year precision", () => {
    const sourceOnly = classifyInterventionObservationEvents(
      inventoryBundle({
        occurrences: [{ occurrenceId: OCCURRENCE_A, geographyScope: "source_only" }],
      }),
    );
    expect(sourceOnly.rejections[0]?.reasons).toEqual(["scope_unresolved"]);
    const yearOnly = classifyInterventionObservationEvents(
      inventoryBundle({
        occurrences: [{ occurrenceId: OCCURRENCE_A, effectiveDate: "2024", datePrecision: "year" }],
      }),
    );
    expect(yearOnly.rejections[0]?.reasons).toEqual(["date_precision_insufficient"]);
  });

  test("rejects every non-operational lifecycle without inventing inventory states", () => {
    for (const lifecycleState of [
      "planned",
      "proposed",
      "under_consideration",
      "candidate",
    ] as const) {
      const result = classifyInterventionObservationEvents(
        inventoryBundle({
          treatmentLifecycleState: lifecycleState,
          occurrences: [{ occurrenceId: OCCURRENCE_A, lifecycleState }],
        }),
      );
      expect(result.rejections[0]?.reasons).toEqual(["non_operational_lifecycle"]);
    }
  });

  test("admits every reviewed operational lifecycle", () => {
    for (const lifecycleState of [
      "current_confirmed",
      "implemented",
      "historical_confirmed",
    ] as const) {
      const result = classifyInterventionObservationEvents(
        inventoryBundle({
          treatmentLifecycleState: lifecycleState,
          occurrences: [{ occurrenceId: OCCURRENCE_A, lifecycleState }],
        }),
      );
      expect(result.rejections).toEqual([]);
      expect(result.anchors).toHaveLength(1);
    }
  });

  test("requires an available-or-partial reviewed lineage lane and source refs", () => {
    const unavailable = classifyInterventionObservationEvents(
      inventoryBundle({ localRegistryAvailability: "unavailable" }),
    );
    expect(unavailable.rejections[0]?.reasons).toEqual(["source_unavailable"]);

    const missingLineage = classifyInterventionObservationEvents(
      inventoryBundle({
        occurrences: [
          {
            occurrenceId: OCCURRENCE_A,
            registryLineage: false,
            wikiOccurrenceId: null,
            sourceRefs: [],
          },
        ],
      }),
    );
    expect(missingLineage.rejections[0]?.reasons).toEqual(["source_unavailable"]);

    const wikiPartial = classifyInterventionObservationEvents(
      inventoryBundle({
        operationalOccurrencesAvailability: "partial",
        occurrences: [
          {
            occurrenceId: OCCURRENCE_A,
            registryLineage: false,
            wikiOccurrenceId: "wiki-occurrence-1",
          },
        ],
      }),
    );
    expect(wikiPartial.rejections).toEqual([]);
  });

  test("requires exact route identity and never aliases B44 to B44+", () => {
    const result = classifyInterventionObservationEvents(
      inventoryBundle({
        occurrences: [
          {
            occurrenceId: OCCURRENCE_A,
            routeId: "B44",
            rawRouteId: "B44",
          },
        ],
      }),
    );
    expect(result.anchors).toEqual([]);
    expect(result.rejections[0]?.reasons).toEqual(["route_identity_mismatch"]);
  });

  test("retains the concrete registry reason for unsupported treatment kinds", () => {
    const result = classifyInterventionObservationEvents(
      inventoryBundle({ kind: "transit_signal_priority", family: "signal_priority" }),
    );
    expect(result.rejections[0]).toEqual(
      expect.objectContaining({
        treatmentKind: "transit_signal_priority",
        reasons: ["unsupported_treatment_kind"],
        relevanceReasonId: "signal_inventory_contract_required",
      }),
    );
  });

  test("keeps independent same-date occurrences and deduplicates only an exact composite key", () => {
    const independent = classifyInterventionObservationEvents(
      inventoryBundle({
        occurrences: [{ occurrenceId: OCCURRENCE_B }, { occurrenceId: OCCURRENCE_A }],
      }),
    );
    expect(independent.anchors.map((anchor) => anchor.occurrenceId)).toEqual([
      OCCURRENCE_A,
      OCCURRENCE_B,
    ]);
    expect(independent.exactDeduplicationCount).toBe(0);

    const duplicate = classifyInterventionObservationEvents(
      inventoryBundle({
        occurrences: [{ occurrenceId: OCCURRENCE_A }, { occurrenceId: OCCURRENCE_A }],
      }),
    );
    expect(duplicate.anchors).toHaveLength(1);
    expect(duplicate.exactDeduplicationCount).toBe(1);
  });

  test("rejects broken treatment links and is byte-stable under reversed occurrence input", () => {
    const broken = classifyInterventionObservationEvents(
      inventoryBundle({ treatmentOccurrenceIds: [] }),
    );
    expect(broken.rejections[0]?.reasons).toEqual(["occurrence_treatment_mismatch"]);

    const occurrences = [{ occurrenceId: OCCURRENCE_A }, { occurrenceId: OCCURRENCE_B }] as const;
    const forward = classifyInterventionObservationEvents(inventoryBundle({ occurrences }));
    const reverse = classifyInterventionObservationEvents(
      inventoryBundle({ occurrences: [...occurrences].reverse() }),
    );
    expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward));
  });
});
