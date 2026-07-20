import { Database } from "bun:sqlite";
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
import {
  type BuildInterventionObservationArtifactsResult,
  buildInterventionObservationArtifacts,
  prepareInterventionObservationArtifacts,
} from "../../src/lib/intervention-observations.ts";
import {
  type InterventionObservationTrendRow,
  loadInterventionObservationTrendRows,
} from "../../src/lib/local-db-aggregates/intervention-observation-rows.ts";

const RELEASE = {
  releaseId: "pub_20260720T120000000Z",
  publishedAt: "2026-07-20T12:00:00.000Z",
  coverage: { start: "2023-01", end: "2026-06" },
} as const;

const ACE_TREATMENT_ID = "treatment:v1:aaaaaaaaaaaaaaaaaaaaaaaa";
const LANE_TREATMENT_ID = "treatment:v1:bbbbbbbbbbbbbbbbbbbbbbbb";
const BUSWAY_TREATMENT_ID = "treatment:v1:cccccccccccccccccccccccc";
const OCCURRENCE_ID = "occurrence:v1:aaaaaaaaaaaaaaaaaaaaaaaa";

type TreatmentFixture = {
  readonly treatmentId: string;
  readonly treatmentKind: StudioInterventionTreatmentKind;
  readonly treatmentFamily: StudioInterventionTreatmentFamily;
  readonly geographyScope?: StudioInterventionGeographyScope;
};

type OccurrenceFixture = {
  readonly occurrenceId: string;
  readonly treatmentIds: readonly string[];
  readonly eventId: string;
  readonly rawInterventionType?: string;
  readonly sourceId?: string;
  readonly rawStatus?: string;
  readonly rawRouteId?: string;
  readonly implementationDate?: string;
  readonly implementationMonth?: string;
  readonly occurrenceDate?: string;
  readonly routeId?: string;
  readonly geographyScope?: StudioInterventionGeographyScope;
  readonly program?: string | null;
  readonly datePrecision?: StudioInterventionDatePrecision;
  readonly lifecycleState?: StudioInterventionLifecycleState;
  readonly registryLineage?: boolean;
  readonly wikiOccurrenceId?: string | null;
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

function sourceStates(recordCount: number) {
  return [
    {
      sourceKind: "intervention_corpus",
      requirement: "required",
      availability: "available",
      checkedCoverage: RELEASE.coverage,
      recordCount,
    },
    {
      sourceKind: "route_evidence",
      requirement: "required",
      availability: "available",
      checkedCoverage: RELEASE.coverage,
      recordCount,
    },
    {
      sourceKind: "operational_occurrences",
      requirement: "required",
      availability: "available",
      checkedCoverage: RELEASE.coverage,
      recordCount,
    },
    {
      sourceKind: "local_registry",
      requirement: "optional",
      availability: "available",
      checkedCoverage: RELEASE.coverage,
      recordCount,
    },
  ];
}

function inventoryBundle(
  input: {
    readonly routeId?: "B44" | "B44+";
    readonly treatments?: readonly TreatmentFixture[];
    readonly occurrences?: readonly OccurrenceFixture[];
  } = {},
): StudioRouteInterventionInventoryBundle {
  const routeId = input.routeId ?? "B44+";
  const treatments =
    input.treatments ??
    ([
      {
        treatmentId: ACE_TREATMENT_ID,
        treatmentKind: "automated_bus_lane_enforcement",
        treatmentFamily: "enforcement",
      },
    ] as const);
  const occurrences =
    input.occurrences ??
    ([
      {
        occurrenceId: OCCURRENCE_ID,
        treatmentIds: [ACE_TREATMENT_ID],
        eventId: "registry-event-1",
      },
    ] as const);
  const occurrenceIdsByTreatment = new Map<string, string[]>();
  for (const occurrence of occurrences) {
    for (const treatmentId of occurrence.treatmentIds) {
      const ids = occurrenceIdsByTreatment.get(treatmentId) ?? [];
      ids.push(occurrence.occurrenceId);
      occurrenceIdsByTreatment.set(treatmentId, ids);
    }
  }
  return decodeStrict(StudioRouteInterventionInventoryBundleSchema)({
    artifactKind: "bp.studio.route_intervention_inventory_bundle.v1",
    schemaVersion: 1,
    ...RELEASE,
    route: route(routeId),
    routeSlug: routeId === "B44+" ? "b44-sbs" : "b44",
    coverageState: "available",
    sourceStates: sourceStates(occurrences.length),
    treatments: treatments.map((treatment, index) => ({
      treatmentId: treatment.treatmentId,
      sourceNamespace: "local_registry",
      sourceRecordId: `treatment-${index + 1}`,
      sourceId: "local-intervention-registry",
      componentCollection: "registry",
      componentPosition: index,
      rawKind: treatment.treatmentKind,
      rawLabel: treatment.treatmentKind,
      treatmentKind: treatment.treatmentKind,
      treatmentFamily: treatment.treatmentFamily,
      lifecycleState: "implemented",
      statusAsOf: "2024-01-01",
      effectiveDate: "2024-01-15",
      datePrecision: "day",
      geographyScope: treatment.geographyScope ?? "route",
      sourceRefs: [`local_intervention_event:treatment-${index + 1}`],
      occurrenceIds: occurrenceIdsByTreatment.get(treatment.treatmentId) ?? [],
      projectIds: [],
    })),
    occurrences: occurrences.map((occurrence, index) => {
      const implementationDate = occurrence.implementationDate ?? "2024-01-15";
      const implementationMonth = occurrence.implementationMonth ?? "2024-01";
      const sourceId = occurrence.sourceId ?? "mta_ace_routes";
      const rawStatus = occurrence.rawStatus ?? "implemented";
      const program = occurrence.program === undefined ? "ACE" : occurrence.program;
      return {
        occurrenceId: occurrence.occurrenceId,
        sourceNamespace: "local_registry",
        sourceOccurrenceId: occurrence.eventId,
        sourceId,
        producerPhaseOrPosition: `registry:${index}`,
        routeId: occurrence.routeId ?? routeId,
        treatmentIds: occurrence.treatmentIds,
        lifecycleState: occurrence.lifecycleState ?? "implemented",
        phase: "implementation",
        rawStatus,
        program,
        effectiveDate: occurrence.occurrenceDate ?? "2024-01-15",
        datePrecision: occurrence.datePrecision ?? "day",
        geographyScope: occurrence.geographyScope ?? "route",
        sourceRefs: [`local_intervention_event:${occurrence.eventId}`],
        projectIds: [],
        wikiOccurrenceId: occurrence.wikiOccurrenceId ?? null,
        registryLineage:
          occurrence.registryLineage === false
            ? null
            : {
                dataProductId: "local_intervention_events_release",
                eventId: occurrence.eventId,
                rawRouteId: occurrence.rawRouteId ?? routeId,
                rawInterventionType:
                  occurrence.rawInterventionType ?? "automated_bus_lane_enforcement",
                sourceId,
                rawStatus,
                program: program ?? "Registry program",
                implementationDate,
                implementationMonth,
              },
      };
    }),
    currentState: [],
    projectRefs: [],
    sourceGaps: [],
  });
}

function monthSequence(anchor: string): string[] {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7)) - 1;
  return Array.from({ length: 25 }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 12 + offset, 1));
    return date.toISOString().slice(0, 7);
  });
}

function trendRow(
  month: string,
  overrides: Partial<InterventionObservationTrendRow> = {},
): InterventionObservationTrendRow {
  return {
    route_id: "B44+",
    month,
    speed_observation_count: 20,
    speed_bus_trip_count: 10,
    average_speed_mph: 7,
    ridership: 1_000,
    transfers: 100,
    has_speed_trend: true,
    has_ridership_trend: true,
    ...overrides,
  };
}

function build(
  input: {
    readonly inventoryBundles?: readonly StudioRouteInterventionInventoryBundle[];
    readonly trendRows?: readonly InterventionObservationTrendRow[];
  } = {},
): BuildInterventionObservationArtifactsResult {
  return buildInterventionObservationArtifacts({
    inventoryBundles: input.inventoryBundles ?? [inventoryBundle()],
    trendRows: input.trendRows ?? [],
    releaseId: RELEASE.releaseId,
    publishedAt: RELEASE.publishedAt,
    coverage: RELEASE.coverage,
  });
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label} in test fixture`);
  return value;
}

function firstBundle(result: BuildInterventionObservationArtifactsResult) {
  return required(result.bundles[0], "first observation bundle");
}

function firstEvent(result: BuildInterventionObservationArtifactsResult) {
  return required(firstBundle(result).events[0], "first observation event");
}

describe("intervention observation local rows", () => {
  test("fails closed on a missing trend table and loads complete rows in exact order", () => {
    const sqlite = new Database(":memory:");
    try {
      expect(() => loadInterventionObservationTrendRows({ sqlite })).toThrow(
        "Required intervention-observation trend table is missing",
      );
      sqlite.exec(`
        CREATE TABLE local_route_month_trend (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL,
          speed_observation_count INTEGER NOT NULL,
          speed_bus_trip_count INTEGER NOT NULL,
          average_speed_mph REAL,
          ridership REAL,
          transfers REAL,
          has_speed_trend INTEGER NOT NULL,
          has_ridership_trend INTEGER NOT NULL
        );
        INSERT INTO local_route_month_trend VALUES
          ('B44+', '2024-02', 8, 4, 7.2, 1200, 100, 1, 0),
          ('B44', '2024-01', 0, 0, NULL, NULL, NULL, 0, 0);
      `);
      expect(loadInterventionObservationTrendRows({ sqlite })).toEqual([
        {
          route_id: "B44",
          month: "2024-01",
          speed_observation_count: 0,
          speed_bus_trip_count: 0,
          average_speed_mph: null,
          ridership: null,
          transfers: null,
          has_speed_trend: false,
          has_ridership_trend: false,
        },
        {
          route_id: "B44+",
          month: "2024-02",
          speed_observation_count: 8,
          speed_bus_trip_count: 4,
          average_speed_mph: 7.2,
          ridership: 1200,
          transfers: 100,
          has_speed_trend: true,
          has_ridership_trend: false,
        },
      ]);
    } finally {
      sqlite.close();
    }
  });
});

describe("buildInterventionObservationArtifacts", () => {
  test("expands an exact 25-month window and applies metric-specific eligibility", () => {
    const months = monthSequence("2024-01");
    const result = build({
      trendRows: months.map((month, index) =>
        trendRow(month, {
          ridership: index === 1 ? -1 : 1_000 + index,
          has_ridership_trend: index === 0 || index === 1,
        }),
      ),
    });
    const event = firstEvent(result);
    const speed = required(event.series[0], "speed series");
    const ridership = required(event.series[1], "ridership series");

    expect(speed.coverage as unknown).toEqual({
      requestedStart: "2023-01",
      requestedEnd: "2025-01",
      expectedPointCount: 25,
      observedStart: "2023-01",
      observedEnd: "2025-01",
      observedPointCount: 25,
      nullPointCount: 0,
    });
    expect(speed.status).toBe("available");
    expect(speed.points).toHaveLength(25);
    expect(speed.points[0] as unknown).toEqual({
      month: "2023-01",
      value: 7,
      sampleCount: 20,
    });
    expect(ridership.status).toBe("partial");
    expect(ridership.coverage.observedPointCount).toBe(1);
    expect(ridership.points[1] as unknown).toEqual({
      month: "2023-02",
      value: null,
      sampleCount: null,
    });
    expect(event.resolutionStatus).toBe("partial");
    expect(firstBundle(result).dataCoverage as unknown).toEqual({
      start: "2023-01",
      end: "2025-01",
      grain: "month",
    });
  });

  test("emits truthful available, partial, and missing statuses including all-null coverage", () => {
    const months = monthSequence("2024-01");
    const available = build({ trendRows: months.map((month) => trendRow(month)) });
    expect(firstEvent(available).resolutionStatus).toBe("available");

    const partial = build({ trendRows: [trendRow("2024-01")] });
    expect(firstEvent(partial).resolutionStatus).toBe("partial");
    expect(firstEvent(partial).series.map((series) => series.status)).toEqual([
      "partial",
      "partial",
    ]);

    const missing = build();
    expect(firstEvent(missing).resolutionStatus).toBe("missing");
    expect(firstEvent(missing).series.map((series) => series.status)).toEqual([
      "missing",
      "missing",
    ]);
    expect(firstBundle(missing).dataCoverage).toEqual({ start: null, end: null, grain: "month" });
    expect(missing.index.dataCoverage).toEqual({ start: null, end: null, grain: "month" });
    expect(required(missing.index.events[0], "first index event").availableMetricIds).toEqual([]);
  });

  test("admits each reviewed occurrence-treatment pair with its exact spec", () => {
    const bundle = inventoryBundle({
      treatments: [
        {
          treatmentId: ACE_TREATMENT_ID,
          treatmentKind: "automated_bus_lane_enforcement",
          treatmentFamily: "enforcement",
        },
        {
          treatmentId: LANE_TREATMENT_ID,
          treatmentKind: "bus_lane",
          treatmentFamily: "bus_priority_lane",
        },
      ],
      occurrences: [
        {
          occurrenceId: OCCURRENCE_ID,
          treatmentIds: [ACE_TREATMENT_ID, LANE_TREATMENT_ID],
          eventId: "multi-treatment-event",
        },
      ],
    });
    const result = build({ inventoryBundles: [bundle] });
    expect(result.admissionSummary.admittedAnchorCount).toBe(2);
    expect(result.admissionSummary.rejectedAnchorCount).toBe(0);
    expect(result.admissionSummary.admissionReasonCounts.admitted).toBe(2);
    expect(firstBundle(result).events).toHaveLength(2);
    expect(firstBundle(result).events.map((event) => event.resolutionStatus)).toEqual([
      "missing",
      "missing",
    ]);
    expect(result.index.events[1]).toMatchObject({
      treatmentKind: "bus_lane",
      analysisFamily: "bus_lane",
      specId: "bus_lane_route_observations_v1",
      availableMetricIds: [],
    });
  });

  test("materializes bus-lane and busway specs with scope-true roles and month metadata", () => {
    const lane = inventoryBundle({
      routeId: "B44",
      treatments: [
        {
          treatmentId: LANE_TREATMENT_ID,
          treatmentKind: "bus_lane",
          treatmentFamily: "bus_priority_lane",
          geographyScope: "segment",
        },
      ],
      occurrences: [
        {
          occurrenceId: OCCURRENCE_ID,
          treatmentIds: [LANE_TREATMENT_ID],
          eventId: "lane-segment",
          rawInterventionType: "bus_lane",
          geographyScope: "segment",
          sourceId: "tier2_document_operational_date_assertions",
        },
      ],
    });
    const busway = inventoryBundle({
      treatments: [
        {
          treatmentId: BUSWAY_TREATMENT_ID,
          treatmentKind: "busway",
          treatmentFamily: "bus_priority_lane",
          geographyScope: "corridor",
        },
      ],
      occurrences: [
        {
          occurrenceId: "occurrence:v1:cccccccccccccccccccccccc",
          treatmentIds: [BUSWAY_TREATMENT_ID],
          eventId: "busway-month",
          rawInterventionType: "busway",
          geographyScope: "corridor",
          occurrenceDate: "2024-02",
          datePrecision: "month",
          implementationMonth: "2024-02",
          program: null,
          registryLineage: false,
          wikiOccurrenceId: "wiki-busway-month",
          sourceId: "tier2_document_operational_date_assertions",
        },
      ],
    });
    const result = build({ inventoryBundles: [busway, lane], trendRows: [trendRow("2024-02")] });
    const events = result.bundles.flatMap((bundle) => bundle.events);
    const laneEvent = required(
      events.find((event) => event.treatmentKind === "bus_lane"),
      "lane event",
    );
    const buswayEvent = required(
      events.find((event) => event.treatmentKind === "busway"),
      "busway event",
    );
    expect(laneEvent).toMatchObject({
      analysisFamily: "bus_lane",
      specId: "bus_lane_route_observations_v1",
      geographyScope: "segment",
    });
    expect(laneEvent.series.map((series) => series.role)).toEqual(["context", "context"]);
    expect(
      laneEvent.series.every((series) =>
        series.limitations.includes(
          "Route-level observations are context for a treatment scoped below the full route.",
        ),
      ),
    ).toBe(true);
    expect(buswayEvent).toMatchObject({
      analysisFamily: "busway",
      specId: "busway_route_observations_v1",
      program: null,
      implementationDate: "2024-02",
      implementationMonth: "2024-02",
      datePrecision: "month",
      geographyScope: "corridor",
    });
    expect(buswayEvent.series.map((series) => series.bindingId)).toEqual([
      "busway_route_speed_around_implementation_v1",
      "busway_route_ridership_around_implementation_v1",
    ]);
  });

  test("preserves ACE study admission while descriptive lane admission bypasses its allowlist", () => {
    const tier2Source = "tier2_document_operational_date_assertions";
    const ace = inventoryBundle({
      occurrences: [
        {
          occurrenceId: OCCURRENCE_ID,
          treatmentIds: [ACE_TREATMENT_ID],
          eventId: "tier2-ace",
          sourceId: tier2Source,
        },
      ],
    });
    const lane = inventoryBundle({
      routeId: "B44",
      treatments: [
        {
          treatmentId: LANE_TREATMENT_ID,
          treatmentKind: "bus_lane",
          treatmentFamily: "bus_priority_lane",
        },
      ],
      occurrences: [
        {
          occurrenceId: "occurrence:v1:bbbbbbbbbbbbbbbbbbbbbbbb",
          treatmentIds: [LANE_TREATMENT_ID],
          eventId: "tier2-lane",
          rawInterventionType: "bus_lane",
          sourceId: tier2Source,
          rawRouteId: "B44",
          routeId: "B44",
        },
      ],
    });
    const result = build({ inventoryBundles: [ace, lane] });
    expect(result.index.events).toHaveLength(1);
    expect(result.index.events[0]).toMatchObject({
      routeId: "B44",
      treatmentKind: "bus_lane",
      analysisFamily: "bus_lane",
    });
    expect(result.admissionSummary.admissionReasonCounts.untrusted_or_retired_registry_source).toBe(
      1,
    );
  });

  test("keeps source-only and unsupported kinds as explicit pre-value rejections", () => {
    const sourceOnly = inventoryBundle({
      treatments: [
        {
          treatmentId: LANE_TREATMENT_ID,
          treatmentKind: "bus_lane",
          treatmentFamily: "bus_priority_lane",
          geographyScope: "source_only",
        },
      ],
      occurrences: [
        {
          occurrenceId: OCCURRENCE_ID,
          treatmentIds: [LANE_TREATMENT_ID],
          eventId: "source-only",
          rawInterventionType: "bus_lane",
          geographyScope: "source_only",
        },
      ],
    });
    const unsupported = inventoryBundle({
      routeId: "B44",
      treatments: [
        {
          treatmentId: LANE_TREATMENT_ID,
          treatmentKind: "transit_signal_priority",
          treatmentFamily: "signal_priority",
        },
      ],
      occurrences: [
        {
          occurrenceId: "occurrence:v1:bbbbbbbbbbbbbbbbbbbbbbbb",
          treatmentIds: [LANE_TREATMENT_ID],
          eventId: "tsp",
          rawInterventionType: "transit_signal_priority",
          rawRouteId: "B44",
          routeId: "B44",
        },
      ],
    });
    const result = build({ inventoryBundles: [sourceOnly, unsupported] });
    expect(result.bundles).toEqual([]);
    expect(result.index.events).toEqual([]);
    expect(result.admissionSummary.admissionReasonCounts.scope_unresolved).toBe(1);
    expect(result.admissionSummary.admissionReasonCounts.unsupported_treatment_kind).toBe(1);
    expect(result.admissionSummary.relevanceReasonCounts).toEqual({
      signal_inventory_contract_required: 1,
    });
  });

  test("counts every gate rejection once per occurrence and never publishes rejected rows", () => {
    const treatment = {
      treatmentId: ACE_TREATMENT_ID,
      treatmentKind: "automated_bus_lane_enforcement",
      treatmentFamily: "enforcement",
    } as const;
    const occurrence = (
      suffix: string,
      overrides: Partial<OccurrenceFixture> = {},
    ): OccurrenceFixture => ({
      occurrenceId: `occurrence:v1:${suffix.repeat(24)}`,
      treatmentIds: [ACE_TREATMENT_ID],
      eventId: `event-${suffix}`,
      ...overrides,
    });
    const result = build({
      inventoryBundles: [
        inventoryBundle({
          treatments: [treatment],
          occurrences: [
            occurrence("a"),
            occurrence("b", { sourceId: "retired" }),
            occurrence("c", { rawStatus: "proposed" }),
            occurrence("d", { rawInterventionType: "custom_treatment" }),
            occurrence("e", { implementationDate: "2024-02-30" }),
            occurrence("f", { implementationMonth: "2024-02" }),
            occurrence("1", { rawRouteId: " " }),
            occurrence("2", {
              rawRouteId: " ",
              rawInterventionType: "custom_treatment",
              sourceId: "retired",
              rawStatus: "proposed",
              implementationDate: "bad",
            }),
          ],
        }),
      ],
    });
    expect(result.admissionSummary.admittedAnchorCount).toBe(1);
    expect(result.admissionSummary.rejectedAnchorCount).toBe(7);
    expect(result.admissionSummary.admissionReasonCounts).toEqual({
      admitted: 1,
      unsupported_treatment_kind: 0,
      non_operational_lifecycle: 0,
      date_precision_insufficient: 0,
      source_unavailable: 0,
      scope_unresolved: 0,
      route_identity_mismatch: 2,
      occurrence_treatment_mismatch: 0,
      invalid_registry_implementation_date: 1,
      missing_route_id: 0,
      registry_event_not_implemented: 1,
      registry_month_date_mismatch: 1,
      unsupported_treatment_family: 1,
      untrusted_or_retired_registry_source: 1,
    });
    expect(result.index.events).toHaveLength(1);
    expect(required(result.index.events[0], "first index event").occurrenceId).toBe(
      "occurrence:v1:aaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  test("preserves exact B44/B44+ bundle identity and deterministic ordering", () => {
    const local = inventoryBundle({
      routeId: "B44",
      occurrences: [
        {
          occurrenceId: "occurrence:v1:dddddddddddddddddddddddd",
          treatmentIds: [ACE_TREATMENT_ID],
          eventId: "local-event",
          rawRouteId: "B44",
          implementationDate: "2024-01-15T00:00:00.000Z",
          occurrenceDate: "2024-01-15T00:00:00.000Z",
        },
      ],
    });
    const sbs = inventoryBundle();
    const rows = [trendRow("2024-01"), trendRow("2024-01", { route_id: "B44" })];
    const forward = build({ inventoryBundles: [local, sbs], trendRows: rows });
    const reverse = build({
      inventoryBundles: [sbs, local],
      trendRows: [...rows].reverse(),
    });
    expect(forward).toEqual(reverse);
    expect(forward.bundles.map((bundle) => [bundle.routeId, bundle.routeSlug])).toEqual([
      ["B44", "b44"],
      ["B44+", "b44-sbs"],
    ]);
    expect(forward.index.events.map((event) => event.bundleKey)).toEqual([
      "studio/v2/routes/b44/intervention-observations.json",
      "studio/v2/routes/b44-sbs/intervention-observations.json",
    ]);
  });

  test("keeps specs and priorities invariant across direction, magnitude, and null density", () => {
    const months = monthSequence("2024-01");
    const variants = [
      months.map((month, index) =>
        trendRow(month, { average_speed_mph: 4 + index, ridership: 500 + index * 100 }),
      ),
      months.map((month, index) =>
        trendRow(month, { average_speed_mph: 40 - index, ridership: 5_000 - index * 100 }),
      ),
      months.map((month) => trendRow(month, { average_speed_mph: 1_000_000, ridership: 1e9 })),
      months.map((month) => trendRow(month, { average_speed_mph: 0.001, ridership: 1 })),
      months.map((month, index) =>
        trendRow(month, {
          average_speed_mph: index === 12 ? 7 : Number.NaN,
          speed_observation_count: index === 12 ? 20 : 0,
          ridership: index === 12 ? 1_000 : null,
          has_speed_trend: index === 12,
          has_ridership_trend: index === 12,
        }),
      ),
    ].map((trendRows) => build({ trendRows }));
    const signature = (result: BuildInterventionObservationArtifactsResult) =>
      firstBundle(result).events.map((event) => ({
        occurrenceId: event.occurrenceId,
        treatmentId: event.treatmentId,
        specId: event.specId,
        series: event.series.map((series) => ({
          bindingId: series.bindingId,
          role: series.role,
          priority: series.presentationPriority,
        })),
      }));
    expect(new Set(variants.map((variant) => JSON.stringify(signature(variant)))).size).toBe(1);
  });

  test("prepares exact release metadata without accepting observation values", () => {
    const preparation = prepareInterventionObservationArtifacts({
      inventoryBundles: [inventoryBundle()],
      releaseId: RELEASE.releaseId,
      publishedAt: RELEASE.publishedAt,
      coverage: RELEASE.coverage,
    });
    expect(preparation.admissionSummary.admittedAnchorCount).toBe(1);
    expect(preparation.routes[0]?.anchors[0]).toMatchObject({
      analysisFamily: "automated_bus_lane_enforcement",
      specId: "automated_bus_lane_enforcement_route_observations_v1",
    });
    expect(() =>
      prepareInterventionObservationArtifacts({
        inventoryBundles: [inventoryBundle()],
        releaseId: RELEASE.releaseId,
        publishedAt: RELEASE.publishedAt,
        coverage: { start: "2023-02", end: RELEASE.coverage.end },
      }),
    ).toThrow("Inventory release identity mismatch");
  });

  test("emits exact live input refs and computes cross-bundle index coverage", () => {
    const local = inventoryBundle({
      routeId: "B44",
      occurrences: [
        {
          occurrenceId: "occurrence:v1:eeeeeeeeeeeeeeeeeeeeeeee",
          treatmentIds: [ACE_TREATMENT_ID],
          eventId: "local-event",
          rawRouteId: "B44",
        },
      ],
    });
    const result = build({
      inventoryBundles: [inventoryBundle(), local],
      trendRows: [trendRow("2023-06"), trendRow("2024-10", { route_id: "B44" })],
    });
    const expectedRefs = [
      {
        dataProductId: "studio_route_intervention_inventory",
        role: "event_anchor",
        featureGrain: null,
        resolverId: null,
      },
      {
        dataProductId: "local_route_month_trends_history",
        role: "observation_source",
        featureGrain: "route_metric_history",
        resolverId: "sqlite.local_route_month_trend.history.v1",
      },
    ] as const;
    expect(result.bundles.every((bundle) => Bun.deepEquals(bundle.inputRefs, expectedRefs))).toBe(
      true,
    );
    expect(result.index.inputRefs).toEqual(expectedRefs);
    expect(result.index.dataCoverage as unknown).toEqual({
      start: "2023-06",
      end: "2024-10",
      grain: "month",
    });
    for (const bundle of result.bundles) {
      const inventory = bundle.routeId === "B44" ? local : inventoryBundle();
      const occurrenceIds = new Set(inventory.occurrences.map((item) => item.occurrenceId));
      const treatmentIds = new Set(inventory.treatments.map((item) => item.treatmentId));
      expect(bundle.events.every((event) => occurrenceIds.has(event.occurrenceId))).toBe(true);
      expect(bundle.events.every((event) => treatmentIds.has(event.treatmentId))).toBe(true);
    }
  });

  test("uses exact composite identity instead of global registry-lineage uniqueness", () => {
    const secondOccurrence = {
      occurrenceId: "occurrence:v1:ffffffffffffffffffffffff",
      treatmentIds: [ACE_TREATMENT_ID],
      eventId: "registry-event-1",
    } as const;
    const result = build({
      inventoryBundles: [
        inventoryBundle({
          occurrences: [
            {
              occurrenceId: OCCURRENCE_ID,
              treatmentIds: [ACE_TREATMENT_ID],
              eventId: "registry-event-1",
            },
            secondOccurrence,
          ],
        }),
      ],
    });
    expect(firstBundle(result).events).toHaveLength(2);
    expect(firstBundle(result).events.map((event) => event.occurrenceId)).toEqual([
      OCCURRENCE_ID,
      secondOccurrence.occurrenceId,
    ]);

    expect(() =>
      build({
        inventoryBundles: [inventoryBundle(), inventoryBundle()],
      }),
    ).toThrow("Duplicate inventory route");
    expect(() =>
      build({
        trendRows: [trendRow("2024-01"), trendRow("2024-01")],
      }),
    ).toThrow("Duplicate route trend row");
  });
});
