import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import {
  interventionObservationBundleKey,
  interventionObservationIndexKey,
  routeInterventionInventoryBundleKey,
  routeInterventionInventoryIndexKey,
  StudioInterventionObservationIndexSchema,
  StudioReleasePayloadSchema,
  StudioRouteInterventionInventoryBundleSchema,
  StudioRouteInterventionInventoryIndexSchema,
  StudioRouteInterventionObservationBundleSchema,
} from "@bp/domain/studio";
import { runExportInterventionObservations } from "../../../src/commands/studio/export-intervention-observations.ts";
import type { OpenLocalPipelineDb } from "../../../src/lib/local-db.ts";
import { canonicalRouteInterventionInventoryBytes } from "../../../src/lib/route-intervention-inventory.ts";

const PUBLISHED_AT = "2026-07-20T12:00:00.000Z";
const RELEASE_ID = "pub_20260720T120000000Z";
const COVERAGE = { start: "2023-01", end: "2026-06" } as const;
const ACE_TREATMENT_ID = "treatment:v1:aaaaaaaaaaaaaaaaaaaaaaaa";
const LANE_TREATMENT_ID = "treatment:v1:bbbbbbbbbbbbbbbbbbbbbbbb";
const MULTI_OCCURRENCE_ID = "occurrence:v1:cccccccccccccccccccccccc";
const LANE_OCCURRENCE_ID = "occurrence:v1:dddddddddddddddddddddddd";
const REJECTED_OCCURRENCE_ID = "occurrence:v1:eeeeeeeeeeeeeeeeeeeeeeee";
const temporaryRoots: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function route() {
  return {
    routeId: "B44+",
    routeFamilyId: "B44",
    displayLabel: "B44-SBS",
    officialLongName: "Sheepshead Bay - Williamsburg",
    designationLiterals: ["route_type:SBS"],
    serviceModes: ["sbs"],
    routeTypes: ["SBS"],
    tripTypes: [14],
  };
}

function release() {
  const identity = { releaseId: RELEASE_ID, publishedAt: PUBLISHED_AT, coverage: COVERAGE };
  return decodeStrict(StudioReleasePayloadSchema)({
    schemaVersion: 3,
    generatedAt: PUBLISHED_AT,
    ...identity,
    quality: {
      releaseLayer: "published_release",
      completenessStatus: "complete",
      confidence: "high",
      caveats: [],
    },
    routes: [],
    mapRouteFactsMetadata: identity,
    routeFactMetadata: [],
    segments: [],
    routeArtifacts: [],
    methods: [],
    docsSections: [],
    docsEndpoints: [],
  });
}

function sourceStates(recordCount: number) {
  return [
    {
      sourceKind: "intervention_corpus",
      requirement: "required",
      availability: "available",
      checkedCoverage: COVERAGE,
      recordCount,
    },
    {
      sourceKind: "route_evidence",
      requirement: "required",
      availability: "available",
      checkedCoverage: COVERAGE,
      recordCount,
    },
    {
      sourceKind: "operational_occurrences",
      requirement: "required",
      availability: "available",
      checkedCoverage: COVERAGE,
      recordCount,
    },
    {
      sourceKind: "local_registry",
      requirement: "optional",
      availability: "available",
      checkedCoverage: COVERAGE,
      recordCount,
    },
  ];
}

function occurrence(input: {
  readonly occurrenceId: string;
  readonly eventId: string;
  readonly treatmentIds: readonly string[];
  readonly rawInterventionType: string;
  readonly sourceId?: string;
  readonly registryLineage?: boolean;
}) {
  const sourceId = input.sourceId ?? "mta_ace_routes";
  return {
    occurrenceId: input.occurrenceId,
    sourceNamespace: "local_registry",
    sourceOccurrenceId: input.eventId,
    sourceId,
    producerPhaseOrPosition: `registry:${input.eventId}`,
    routeId: "B44+",
    treatmentIds: input.treatmentIds,
    lifecycleState: "implemented",
    phase: "implementation",
    rawStatus: "implemented",
    program: input.rawInterventionType === "bus_lane" ? "Bus Lanes" : "ACE",
    effectiveDate: "2024-01-15",
    datePrecision: "day",
    geographyScope: "route",
    sourceRefs: [`local_intervention_event:${input.eventId}`],
    projectIds: [],
    wikiOccurrenceId: null,
    registryLineage:
      input.registryLineage === false
        ? null
        : {
            dataProductId: "local_intervention_events_release",
            eventId: input.eventId,
            rawRouteId: "B44+",
            rawInterventionType: input.rawInterventionType,
            sourceId,
            rawStatus: "implemented",
            program: input.rawInterventionType === "bus_lane" ? "Bus Lanes" : "ACE",
            implementationDate: "2024-01-15",
            implementationMonth: "2024-01",
          },
  };
}

function inventoryBundle(
  input: {
    readonly includeRejected?: boolean;
    readonly onlyRejected?: boolean;
    readonly duplicateRegistryLineage?: boolean;
  } = {},
) {
  const multi = occurrence({
    occurrenceId: MULTI_OCCURRENCE_ID,
    eventId: "registry-multi",
    treatmentIds: [ACE_TREATMENT_ID, LANE_TREATMENT_ID],
    rawInterventionType: "automated_bus_lane_enforcement",
  });
  const lane = occurrence({
    occurrenceId: LANE_OCCURRENCE_ID,
    eventId: input.duplicateRegistryLineage ? "registry-multi" : "registry-lane",
    treatmentIds: [LANE_TREATMENT_ID],
    rawInterventionType: "bus_lane",
    sourceId: "nyc_dot_bus_lanes",
  });
  const rejected = occurrence({
    occurrenceId: REJECTED_OCCURRENCE_ID,
    eventId: "registry-rejected",
    treatmentIds: [ACE_TREATMENT_ID],
    rawInterventionType: "automated_bus_lane_enforcement",
    sourceId: "retired_registry",
  });
  const occurrences = input.onlyRejected
    ? [rejected]
    : [multi, lane, ...(input.includeRejected === false ? [] : [rejected])];
  const occurrenceIds = new Set(occurrences.map((item) => item.occurrenceId));
  return decodeStrict(StudioRouteInterventionInventoryBundleSchema)({
    artifactKind: "bp.studio.route_intervention_inventory_bundle.v1",
    schemaVersion: 1,
    releaseId: RELEASE_ID,
    publishedAt: PUBLISHED_AT,
    coverage: COVERAGE,
    route: route(),
    routeSlug: "b44-sbs",
    coverageState: "available",
    sourceStates: sourceStates(occurrences.length),
    treatments: [
      {
        treatmentId: ACE_TREATMENT_ID,
        sourceNamespace: "local_registry",
        sourceRecordId: "treatment-ace",
        sourceId: "local-intervention-registry",
        componentCollection: "registry",
        componentPosition: 0,
        rawKind: "automated_bus_lane_enforcement",
        rawLabel: "Automated bus lane enforcement",
        treatmentKind: "automated_bus_lane_enforcement",
        treatmentFamily: "enforcement",
        lifecycleState: "implemented",
        statusAsOf: "2024-01-15",
        effectiveDate: "2024-01-15",
        datePrecision: "day",
        geographyScope: "route",
        sourceRefs: ["local_intervention_event:treatment-ace"],
        occurrenceIds: [MULTI_OCCURRENCE_ID, REJECTED_OCCURRENCE_ID].filter((id) =>
          occurrenceIds.has(id),
        ),
        projectIds: [],
      },
      {
        treatmentId: LANE_TREATMENT_ID,
        sourceNamespace: "local_registry",
        sourceRecordId: "treatment-lane",
        sourceId: "local-intervention-registry",
        componentCollection: "registry",
        componentPosition: 1,
        rawKind: "bus_lane",
        rawLabel: "Bus lane",
        treatmentKind: "bus_lane",
        treatmentFamily: "bus_priority_lane",
        lifecycleState: "implemented",
        statusAsOf: "2024-01-15",
        effectiveDate: "2024-01-15",
        datePrecision: "day",
        geographyScope: "route",
        sourceRefs: ["local_intervention_event:treatment-lane"],
        occurrenceIds: [MULTI_OCCURRENCE_ID, LANE_OCCURRENCE_ID].filter((id) =>
          occurrenceIds.has(id),
        ),
        projectIds: [],
      },
    ],
    occurrences,
    currentState: [],
    projectRefs: [],
    sourceGaps: [],
  });
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function local(sqlite: Database): OpenLocalPipelineDb {
  return {
    sqlite,
    path: ":memory:",
    db: undefined as never,
    spatialite: null,
  };
}

function createTrendTable(sqlite: Database): void {
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
      ('B44+', '2024-01', 20, 10, 7.4, 1000, 50, 1, 1);
  `);
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture(
  input: {
    readonly includeRejected?: boolean;
    readonly onlyRejected?: boolean;
    readonly duplicateRegistryLineage?: boolean;
    readonly withTrendTable?: boolean;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "bp-plan090-command-"));
  temporaryRoots.push(root);
  const artifactRoot = join(root, "artifacts");
  const releaseArtifact = join(root, "release.json");
  const bundle = inventoryBundle(input);
  const bundleKey = routeInterventionInventoryBundleKey(bundle.routeSlug);
  const bundlePath = join(artifactRoot, bundleKey);
  const bundleBytes = canonicalRouteInterventionInventoryBytes(bundle);
  await mkdir(join(bundlePath, ".."), { recursive: true });
  await writeFile(bundlePath, bundleBytes);
  const index = decodeStrict(StudioRouteInterventionInventoryIndexSchema)({
    artifactKind: "bp.studio.route_intervention_inventory_index.v1",
    schemaVersion: 1,
    releaseId: RELEASE_ID,
    publishedAt: PUBLISHED_AT,
    coverage: COVERAGE,
    summary: {
      routeCount: 1,
      checkedEmptyRouteCount: 0,
      totalByteSize: bundleBytes.byteLength,
    },
    routes: [
      {
        route: route(),
        routeSlug: bundle.routeSlug,
        bundleKey,
        sha256: digest(bundleBytes),
        byteSize: bundleBytes.byteLength,
        coverageState: "available",
        familyCounts: [],
        stateCounts: [],
        sourceStateSummary: { availableCount: 4, partialCount: 0, unavailableCount: 0 },
      },
    ],
  });
  const inventoryIndex = join(artifactRoot, routeInterventionInventoryIndexKey());
  await writeJson(releaseArtifact, release());
  await writeJson(inventoryIndex, index);
  const sqlite = new Database(":memory:");
  if (input.withTrendTable !== false) createTrendTable(sqlite);
  return {
    root,
    artifactRoot,
    releaseArtifact,
    inventoryIndex,
    bundle,
    index,
    sqlite,
    outputBundlePath: join(artifactRoot, interventionObservationBundleKey(bundle.routeSlug)),
    outputIndexPath: join(artifactRoot, interventionObservationIndexKey()),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function run(value: Fixture) {
  return runExportInterventionObservations({
    options: {
      artifactRoot: value.artifactRoot,
      inventoryIndex: value.inventoryIndex,
      releaseArtifact: value.releaseArtifact,
    },
    local: local(value.sqlite),
  });
}

describe("studio export-intervention-observations command", () => {
  test("writes strict deterministic artifacts and reports anchor-before-fan-out counts", async () => {
    const value = await fixture();
    try {
      const first = await run(value);
      const firstBundleBytes = await readFile(value.outputBundlePath);
      const firstIndexBytes = await readFile(value.outputIndexPath);
      const second = await run(value);

      expect(second).toEqual(first);
      expect(await readFile(value.outputBundlePath)).toEqual(firstBundleBytes);
      expect(await readFile(value.outputIndexPath)).toEqual(firstIndexBytes);
      expect(first).toMatchObject({
        routeBundleCount: 1,
        eventCount: 3,
        admittedAnchorCount: 2,
        rejectedAnchorCount: 1,
        supportedEventCount: 1,
        unsupportedEventCount: 2,
        availableSeriesCount: 0,
        partialSeriesCount: 2,
        missingSeriesCount: 0,
      });
      expect(first.admissionReasonCounts).toEqual({
        admitted: 2,
        invalid_registry_implementation_date: 0,
        missing_route_id: 0,
        registry_event_not_implemented: 0,
        registry_month_date_mismatch: 0,
        unsupported_treatment_family: 0,
        untrusted_or_retired_registry_source: 1,
      });

      const bundle = decodeStrict(StudioRouteInterventionObservationBundleSchema)(
        JSON.parse(await readFile(value.outputBundlePath, "utf8")) as unknown,
      );
      const index = decodeStrict(StudioInterventionObservationIndexSchema)(
        JSON.parse(await readFile(value.outputIndexPath, "utf8")) as unknown,
      );
      expect(bundle.events.some((event) => event.occurrenceId === REJECTED_OCCURRENCE_ID)).toBe(
        false,
      );
      expect(index.events.map((event) => event.occurrenceId)).toEqual([
        MULTI_OCCURRENCE_ID,
        MULTI_OCCURRENCE_ID,
        LANE_OCCURRENCE_ID,
      ]);
      expect(
        index.events.every(
          (event) => event.bundleKey === interventionObservationBundleKey("b44-sbs"),
        ),
      ).toBe(true);
      expect(await exists(join(value.artifactRoot, index.events[0]?.bundleKey ?? "missing"))).toBe(
        true,
      );
    } finally {
      value.sqlite.close();
    }
  });

  test("fails release and inventory preflight errors before writing outputs", async () => {
    const cases = [
      {
        label: "missing release",
        mutate: async (value: Fixture) => {
          await rm(value.releaseArtifact);
        },
      },
      {
        label: "invalid inventory",
        mutate: async (value: Fixture) => {
          await writeJson(value.inventoryIndex, { invalid: true });
        },
      },
      {
        label: "mixed publication identity",
        mutate: async (value: Fixture) => {
          await writeJson(value.inventoryIndex, {
            ...value.index,
            releaseId: "pub_20260721T120000000Z",
            publishedAt: "2026-07-21T12:00:00.000Z",
          });
        },
      },
      {
        label: "mixed coverage",
        mutate: async (value: Fixture) => {
          await writeJson(value.inventoryIndex, {
            ...value.index,
            coverage: { start: "2023-02", end: "2026-06" },
          });
        },
      },
      {
        label: "dangling bundle key",
        mutate: async (value: Fixture) => {
          await writeJson(value.inventoryIndex, {
            ...value.index,
            routes: value.index.routes.map((routeRow) => ({
              ...routeRow,
              bundleKey: "studio/v2/routes/missing/intervention-inventory.json",
            })),
          });
        },
      },
      {
        label: "hash mismatch",
        mutate: async (value: Fixture) => {
          await writeJson(value.inventoryIndex, {
            ...value.index,
            routes: value.index.routes.map((routeRow) => ({ ...routeRow, sha256: "0".repeat(64) })),
          });
        },
      },
    ];

    for (const item of cases) {
      const value = await fixture();
      try {
        await item.mutate(value);
        await expect(run(value)).rejects.toThrow();
        expect(await exists(value.outputBundlePath), item.label).toBe(false);
        expect(await exists(value.outputIndexPath), item.label).toBe(false);
      } finally {
        value.sqlite.close();
      }
    }
  });

  test("fails a missing trend table and zero admitted anchors before writes", async () => {
    const missingTable = await fixture({ withTrendTable: false });
    try {
      await expect(run(missingTable)).rejects.toThrow(
        "Required intervention-observation trend table is missing",
      );
      expect(await exists(missingTable.outputIndexPath)).toBe(false);
    } finally {
      missingTable.sqlite.close();
    }

    const zeroAdmitted = await fixture({ onlyRejected: true });
    try {
      await expect(run(zeroAdmitted)).rejects.toThrow(
        "No trusted registry occurrence anchors were admitted",
      );
      expect(await exists(zeroAdmitted.outputIndexPath)).toBe(false);
    } finally {
      zeroAdmitted.sqlite.close();
    }
  });

  test("fails colliding registry lineage before writes", async () => {
    const value = await fixture({ duplicateRegistryLineage: true });
    try {
      await expect(run(value)).rejects.toThrow("Duplicate registry lineage event ID");
      expect(await exists(value.outputBundlePath)).toBe(false);
      expect(await exists(value.outputIndexPath)).toBe(false);
    } finally {
      value.sqlite.close();
    }
  });
});
