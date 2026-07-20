import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  type StudioInterventionTreatmentFamily,
  type StudioInterventionTreatmentKind,
  type StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionInventoryBundleSchema,
} from "@bp/domain/studio";
import {
  type BuildInterventionObservationArtifactsResult,
  buildInterventionObservationArtifacts,
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
const SECOND_ACE_TREATMENT_ID = "treatment:v1:cccccccccccccccccccccccc";
const OCCURRENCE_ID = "occurrence:v1:aaaaaaaaaaaaaaaaaaaaaaaa";

type TreatmentFixture = {
  readonly treatmentId: string;
  readonly treatmentKind: StudioInterventionTreatmentKind;
  readonly treatmentFamily: StudioInterventionTreatmentFamily;
  readonly geographyScope?: "route" | "corridor";
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
  readonly geographyScope?: "route" | "corridor";
  readonly program?: string;
  readonly registryLineage?: boolean;
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
      const program = occurrence.program ?? "ACE";
      return {
        occurrenceId: occurrence.occurrenceId,
        sourceNamespace: "local_registry",
        sourceOccurrenceId: occurrence.eventId,
        sourceId,
        producerPhaseOrPosition: `registry:${index}`,
        routeId: occurrence.routeId ?? routeId,
        treatmentIds: occurrence.treatmentIds,
        lifecycleState: "implemented",
        phase: "implementation",
        rawStatus,
        program,
        effectiveDate: occurrence.occurrenceDate ?? "2024-01-15",
        datePrecision: "day",
        geographyScope: occurrence.geographyScope ?? "route",
        sourceRefs: [`local_intervention_event:${occurrence.eventId}`],
        projectIds: [],
        wikiOccurrenceId: null,
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
                program,
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

  test("counts one admitted anchor before multi-treatment fan-out and keeps unsupported explicit", () => {
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
    expect(result.admissionSummary.admittedAnchorCount).toBe(1);
    expect(result.admissionSummary.rejectedAnchorCount).toBe(0);
    expect(result.admissionSummary.admissionReasonCounts.admitted).toBe(1);
    expect(firstBundle(result).events).toHaveLength(2);
    expect(firstBundle(result).events.map((event) => event.resolutionStatus)).toEqual([
      "missing",
      "unsupported_treatment_family",
    ]);
    expect(result.index.events[1]).toMatchObject({
      treatmentKind: "bus_lane",
      analysisFamily: null,
      availableMetricIds: [],
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
      invalid_registry_implementation_date: 2,
      missing_route_id: 2,
      registry_event_not_implemented: 2,
      registry_month_date_mismatch: 1,
      unsupported_treatment_family: 2,
      untrusted_or_retired_registry_source: 2,
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

  test("selects identical bindings and limitations for rising and falling values", () => {
    const months = monthSequence("2024-01");
    const rising = build({
      trendRows: months.map((month, index) =>
        trendRow(month, { average_speed_mph: 4 + index, ridership: 500 + index * 100 }),
      ),
    });
    const falling = build({
      trendRows: months.map((month, index) =>
        trendRow(month, { average_speed_mph: 40 - index, ridership: 5_000 - index * 100 }),
      ),
    });
    const signature = (result: BuildInterventionObservationArtifactsResult) =>
      firstBundle(result).events.map((event) => ({
        occurrenceId: event.occurrenceId,
        treatmentId: event.treatmentId,
        resolutionStatus: event.resolutionStatus,
        series: event.series.map((series) => ({
          bindingId: series.bindingId,
          role: series.role,
          priority: series.presentationPriority,
          coverage: series.coverage,
          limitations: series.limitations,
          pointShape: series.points.map((point) => ({
            month: point.month,
            sampleCount: point.sampleCount,
            missing: point.value === null,
          })),
        })),
      }));
    expect(signature(rising)).toEqual(signature(falling));
    const risingSeries = required(firstEvent(rising).series[0], "rising speed series");
    const fallingSeries = required(firstEvent(falling).series[0], "falling speed series");
    expect(required(risingSeries.points[0], "rising first point").value).not.toBe(
      required(fallingSeries.points[0], "falling first point").value,
    );
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

  test("fails integrity errors before emitting partial observations", () => {
    const secondOccurrence = {
      occurrenceId: "occurrence:v1:ffffffffffffffffffffffff",
      treatmentIds: [ACE_TREATMENT_ID],
      eventId: "registry-event-1",
    } as const;
    expect(() =>
      build({
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
      }),
    ).toThrow("Duplicate registry lineage event ID");

    expect(() =>
      build({
        inventoryBundles: [
          inventoryBundle({
            occurrences: [
              {
                occurrenceId: OCCURRENCE_ID,
                treatmentIds: [LANE_TREATMENT_ID],
                eventId: "dangling",
              },
            ],
          }),
        ],
      }),
    ).toThrow("references missing");

    expect(() =>
      build({
        inventoryBundles: [
          inventoryBundle({
            occurrences: [
              {
                occurrenceId: OCCURRENCE_ID,
                treatmentIds: [ACE_TREATMENT_ID],
                eventId: "route-mismatch",
                routeId: "B44",
              },
            ],
          }),
        ],
      }),
    ).toThrow("route does not match its bundle");

    expect(() =>
      build({
        inventoryBundles: [
          inventoryBundle({
            treatments: [
              {
                treatmentId: ACE_TREATMENT_ID,
                treatmentKind: "automated_bus_lane_enforcement",
                treatmentFamily: "enforcement",
              },
              {
                treatmentId: SECOND_ACE_TREATMENT_ID,
                treatmentKind: "automated_bus_lane_enforcement",
                treatmentFamily: "enforcement",
              },
            ],
            occurrences: [
              {
                occurrenceId: OCCURRENCE_ID,
                treatmentIds: [SECOND_ACE_TREATMENT_ID, ACE_TREATMENT_ID],
                eventId: "unsorted",
              },
            ],
          }),
        ],
      }),
    ).toThrow("must be nonempty, sorted, and unique");
  });
});
