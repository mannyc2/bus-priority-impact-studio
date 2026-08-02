import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { decodeStrict } from "@bp/domain/decode";
import { MapManifestResponseSchema } from "@bp/domain/maps";
import { HealthResponseSchema, ReleaseStatusResponseSchema } from "@bp/domain/routes";
import {
  STUDIO_ROUTE_EVIDENCE_INDEX_KEY,
  StudioRouteEvidenceBundleSchema,
} from "@bp/domain/studio/route-evidence";
import {
  StudioRouteDetailResponseSchema,
  StudioRouteHistoryResponseSchema,
  StudioRouteHourlyProfileResponseSchema,
  StudioRouteSectionsResponseSchema,
  StudioRouteSpeedHistoryResponseSchema,
  StudioRoutesResponseSchema,
} from "@bp/domain/studio/routes";
import { CoverageWindowSchema } from "@bp/domain/studio/shared";
import {
  StudioRouteIndex2ResponseSchema,
  StudioRouteIndex3ResponseSchema,
  StudioSnapshotResponseSchema,
} from "@bp/domain/studio/snapshots";
import { handleStudioApiRequest, type StudioApiEnv } from "@bp/studio-api/server";

type D1Value = string | number | boolean | null;

type QueryCall = {
  query: string;
  bound: D1Value[];
};

function selectedColumns(query: string): string[] {
  const selectMatch = query.match(/^select\s+(.+?)\s+from\s/s);
  const selectClause = selectMatch?.[1];
  if (selectClause === undefined) return [];
  return selectClause.split(/,\s*/).flatMap((segment) => {
    const aliasMatch = segment.match(/\s+as\s+"([^"]+)"/i);
    if (aliasMatch?.[1] !== undefined) return [aliasMatch[1]];
    const quotedNames = [...segment.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    return quotedNames.at(-1) ?? [];
  });
}

class FakeStatement<T> {
  constructor(
    private readonly call: QueryCall,
    private readonly rows: T[],
  ) {}

  private filteredRows(): T[] {
    if (
      this.call.query.includes("route_batch_status") &&
      this.call.query.includes('."status" = ?') &&
      this.call.bound.length > 0
    ) {
      const status = this.call.bound[0];
      return this.rows.filter((row) => (row as { status?: unknown }).status === status);
    }

    if (
      this.call.query.includes("route_batch_status") &&
      this.call.query.includes('."month" = ?') &&
      this.call.bound.length > 0
    ) {
      const month = this.call.bound[0];
      return this.rows.filter((row) => (row as { month?: unknown }).month === month);
    }

    if (
      this.call.query.includes("route_equity_context") &&
      this.call.query.includes("where") &&
      this.call.bound.length >= 2
    ) {
      const [routeId, month] = this.call.bound;
      return this.rows.filter((row) => {
        const record = row as { month?: unknown; route_id?: unknown };
        return record.route_id === routeId && record.month === month;
      });
    }

    if (
      this.call.query.includes("route_month_source_status") &&
      this.call.query.includes("where") &&
      this.call.bound.length >= 2
    ) {
      const [month, sourceScope] = this.call.bound;
      return this.rows.filter((row) => {
        const record = row as { month?: unknown; source_scope?: unknown };
        return record.month === month && record.source_scope === sourceScope;
      });
    }

    if (
      this.call.query.includes("route_month_trend") &&
      this.call.query.includes("where") &&
      this.call.bound.length > 0
    ) {
      const selector = this.call.bound[0];
      const filtersBySpeedPresence =
        this.call.query.includes("has_speed_trend") &&
        (typeof selector === "boolean" || selector === 0 || selector === 1);
      return filtersBySpeedPresence
        ? this.rows.filter(
            (row) =>
              Boolean((row as { has_speed_trend?: unknown }).has_speed_trend) ===
              (selector === true || selector === 1),
          )
        : this.rows.filter((row) => (row as { route_id?: unknown }).route_id === selector);
    }

    return this.rows;
  }

  bind(...values: D1Value[]): FakeStatement<T> {
    this.call.bound = values;
    return this;
  }

  async first(): Promise<T | null> {
    return this.filteredRows()[0] ?? null;
  }

  async all(): Promise<{ results: T[] }> {
    return { results: this.filteredRows() };
  }

  async raw(): Promise<unknown[][]> {
    const columns = selectedColumns(this.call.query);
    let rows = this.filteredRows();
    if (this.call.query.includes("min(")) {
      const months = rows
        .flatMap((row) => {
          const month = (row as { month?: unknown }).month;
          return typeof month === "string" ? [month] : [];
        })
        .toSorted();
      return months.length === 0 ? [[null]] : [[months[0]]];
    }
    if (this.call.query.includes("order by") && this.call.query.includes("desc")) {
      rows = rows.toSorted((left, right) => {
        const leftMonth = String((left as { month?: unknown }).month ?? "");
        const rightMonth = String((right as { month?: unknown }).month ?? "");
        return rightMonth.localeCompare(leftMonth);
      });
    }
    if (this.call.query.includes("limit")) rows = rows.slice(0, 1);
    return rows.map((row) => {
      const record = row as Record<string, unknown>;
      if (columns.length > 0 && columns.every((column) => column in record)) {
        return columns.map((column) => record[column]);
      }
      return Object.values(record);
    });
  }
}

class FakeDb {
  readonly calls: QueryCall[] = [];

  constructor(private readonly rowsByTable: Record<string, unknown[]>) {
    if (
      rowsByTable["route_batch_status"] === undefined &&
      (rowsByTable["route_brief_summary"]?.length ?? 0) > 0
    ) {
      rowsByTable["route_batch_status"] = [
        {
          month: "2026-03",
          generated_at: "2026-06-10T00:00:00.000Z",
          status: "pass",
          route_count: rowsByTable["route_brief_summary"]?.length ?? 0,
          artifact_count: 1,
          missing_artifact_count: 0,
          hash_mismatch_count: 0,
          byte_length_mismatch_count: 0,
          total_byte_length: 1024,
          issue_count: 0,
        },
      ];
    }
    const mapRelease = rowsByTable["map_release_catalog"]?.[0] as
      | {
          published_at?: unknown;
          coverage_start?: unknown;
          coverage_end?: unknown;
          route_count?: unknown;
        }
      | undefined;
    if (rowsByTable["route_batch_status"] === undefined && mapRelease !== undefined) {
      rowsByTable["route_batch_status"] = [
        {
          month: mapRelease.coverage_end,
          generated_at: mapRelease.published_at,
          status: "pass",
          route_count: mapRelease.route_count,
          artifact_count: 1,
          missing_artifact_count: 0,
          hash_mismatch_count: 0,
          byte_length_mismatch_count: 0,
          total_byte_length: 1024,
          issue_count: 0,
        },
      ];
    }
    if (
      rowsByTable["route_month_trend"] === undefined &&
      typeof mapRelease?.coverage_start === "string"
    ) {
      rowsByTable["route_month_trend"] = [{ month: mapRelease.coverage_start }];
    }
  }

  prepare<T = unknown>(query: string): FakeStatement<T> {
    const call = { query, bound: [] };
    this.calls.push(call);
    const exactTable = query.match(/\bfrom\s+["`]?(\w+)["`]?/i)?.[1];
    const table =
      exactTable ??
      Object.keys(this.rowsByTable)
        .sort((left, right) => right.length - left.length)
        .find((candidate) => query.includes(candidate));
    const rows = (table === undefined ? [] : (this.rowsByTable[table] ?? [])) as T[];

    return new FakeStatement(call, rows);
  }
}

class FakeR2Object {
  readonly httpEtag = '"test-etag"';
  readonly body: ReadableStream<Uint8Array>;

  constructor(
    private readonly value: string,
    private readonly contentType: string,
  ) {
    this.body = new Response(value).body ?? new ReadableStream<Uint8Array>();
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.value) as unknown;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return new Response(this.value).arrayBuffer();
  }

  serializedValue(): string {
    return this.value;
  }

  writeHttpMetadata(headers: Headers): void {
    headers.set("Content-Type", this.contentType);
  }
}

class FakeR2Bucket {
  constructor(private readonly objects: Record<string, FakeR2Object>) {}

  async get(key: string): Promise<FakeR2Object | null> {
    return this.objects[key] ?? null;
  }
}

const CAPABILITY_MANIFEST_KEY = "studio/v2/routes/route-capability-manifest.json";
const STUDIO_PUBLISHED_AT = "2026-06-10T00:00:00.000Z";
const STUDIO_RELEASE_ID = "pub_20260610T000000000Z";
const STUDIO_COVERAGE = { start: "2023-04", end: "2026-03" } as const;

function exactRouteIdentityReleaseFixture(input: {
  exactRouteCount: number;
  routeTypeCount: number;
  tripTypeCount: number;
  coverageStart?: string | null;
}) {
  return {
    release_id: STUDIO_RELEASE_ID,
    published_at: STUDIO_PUBLISHED_AT,
    coverage_start: input.coverageStart === undefined ? STUDIO_COVERAGE.start : input.coverageStart,
    coverage_end: STUDIO_COVERAGE.end,
    source_wiki_release: "v1-rc25",
    source_manifest_sha256: "1".repeat(64),
    source_route_identity_sha256: "2".repeat(64),
    source_current_bus_routes_sha256: "3".repeat(64),
    source_index_sha256: "4".repeat(64),
    catalog_snapshot_sha256: "5".repeat(64),
    projection_sha256: "6".repeat(64),
    exact_route_count: input.exactRouteCount,
    route_type_count: input.routeTypeCount,
    trip_type_count: input.tripTypeCount,
  };
}

function capabilitySurface(state: string, reason: string | null = null) {
  return { state, reason, depth: null, dataAsOf: null, freshness: "unknown" };
}

function capabilityManifestArtifact(
  routes: {
    routeId: string;
    overallState: string;
    surfaces: Record<string, unknown>;
    caveats?: string[];
  }[],
): FakeR2Object {
  return new FakeR2Object(
    JSON.stringify({
      artifactKind: "route_capability_manifest",
      schemaVersion: 2,
      generatedAt: STUDIO_PUBLISHED_AT,
      releaseId: STUDIO_RELEASE_ID,
      publishedAt: STUDIO_PUBLISHED_AT,
      coverage: STUDIO_COVERAGE,
      routes: routes.map((route) => ({ caveats: [], ...route })),
    }),
    "application/json",
  );
}

function dossierSummaryArtifact(routeId: string, routeSlug: string): FakeR2Object {
  return new FakeR2Object(
    JSON.stringify({
      artifactKind: "studio_route_dossier_summary",
      schemaVersion: 2,
      generatedAt: STUDIO_PUBLISHED_AT,
      routeId,
      routeSlug,
      releaseId: STUDIO_RELEASE_ID,
      publishedAt: STUDIO_PUBLISHED_AT,
      coverage: STUDIO_COVERAGE,
      dataAsOf: "2026-03",
      speed: {
        current: 6.9,
        movement6mPct: -8,
        peerPercentile: 12,
        sparkline: [
          { month: "2026-02", value: 7 },
          { month: "2026-03", value: 6.9 },
        ],
        dataAsOf: "2026-03",
      },
      ridership: {
        current: 42000,
        movement6mPct: 3.5,
        peerPercentile: 96,
        sparkline: [
          { month: "2026-02", value: 41500 },
          { month: "2026-03", value: 42000 },
        ],
        dataAsOf: "2026-03",
      },
      worstSegment: {
        segmentId: "seg-1",
        direction: "NB",
        label: "14th–23rd",
        averageSpeedMph: 3.7,
        persistenceMonths: 3,
        dataAsOf: "2026-03",
      },
      treatmentPosture: {
        aceActive: true,
        aceSince: "2024-06-01",
        busLaneMatchedLaneCount: 5,
        latestEvents: [
          { date: "2024-06-01", kind: "ace_enforcement", label: "ACE enforcement began" },
        ],
        dataAsOf: "2026-03",
      },
    }),
    "application/json",
  );
}

function routeEvidenceBundleArtifact(): FakeR2Object {
  return new FakeR2Object(
    JSON.stringify({
      routeId: "M15+",
      routeSlug: "m15-sbs",
      wikiRouteRecordId: "route_m15_sbs",
      wikiRouteIds: ["M15"],
      wikiAliases: ["M15 SBS"],
      coverage: {
        timelineCount: 1,
        interventionCount: 1,
        metricClaimCount: 1,
        projectCount: 0,
        sourceGapCount: 1,
        citationCount: 2,
      },
      timeline: [
        {
          recordId: "event_m15_sbs_launch",
          recordKind: "event",
          citationKeys: ["m15_sbs_report#block-1"],
          eventKind: "launch",
          eventFamily: "service_change",
          lifecyclePhase: "implemented",
          title: "M15 SBS launched",
          description: "Select Bus Service launched on the M15 corridor.",
          dateText: "October 2010",
          dateNormalized: "2010-10-10",
          datePrecision: "day",
        },
      ],
      interventions: [
        {
          recordId: "treatment_m15_bus_lane",
          recordKind: "treatment_component",
          citationKeys: ["m15_sbs_report#block-1"],
          treatmentKind: "bus_lane",
          treatmentFamily: "street",
          title: "Bus lane treatment",
          description: "Curbside bus lane treatment documented for M15 SBS.",
          locations: ["First Avenue"],
          projectRecordIds: [],
        },
      ],
      metricClaims: [
        {
          recordId: "metric_m15_speed",
          recordKind: "metric_claim",
          citationKeys: ["m15_sbs_report#block-2"],
          metricName: "travel_time_savings",
          rawValue: "15%",
          value: 15,
          unit: "percent",
          period: "after launch",
          scope: "M15 SBS",
          description: "Source-stated travel-time savings.",
        },
      ],
      projects: [],
      sourceGaps: [
        {
          recordId: "gap_m15_before_after",
          recordKind: "source_gap",
          citationKeys: ["m15_sbs_report#block-2"],
          gapKind: "missing_before_after",
          gapText: "Needs comparable before/after source.",
          missingInformation: "Before/after speed table",
          description: null,
        },
      ],
      citations: [
        {
          key: "m15_sbs_report#block-1",
          sourceId: "m15_sbs_report",
          blockId: "block-1",
          evidenceId: "m15_sbs_report#block-1",
          sourcePath: "raw/sources/m15_sbs_report/blocks.jsonl",
          pageNumber: 4,
          sourceTitle: "M15 SBS report",
          publisher: "NYC DOT",
          sourceUrl: "https://example.test/m15-sbs-report",
          publishedDate: "2011-01-01",
        },
        {
          key: "m15_sbs_report#block-2",
          sourceId: "m15_sbs_report",
          blockId: "block-2",
          evidenceId: "m15_sbs_report#block-2",
          sourcePath: "raw/sources/m15_sbs_report/blocks.jsonl",
          sourceTitle: "M15 SBS report",
          publisher: "NYC DOT",
        },
      ],
    }),
    "application/json",
  );
}

function routeEvidenceIndexArtifact(): FakeR2Object {
  const sha256 = "0".repeat(64);
  return new FakeR2Object(
    JSON.stringify({
      artifactKind: "bp.studio.route_evidence_index.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-06T20:00:00.000Z",
      sourceArtifactKey: "studio/v2/wiki/route-evidence.json",
      summary: {
        routeCount: 2,
        matchedBusRouteCount: 2,
        citationCount: 39,
        totalByteLength: 2400,
      },
      routes: [
        {
          routeId: "M15+",
          routeSlug: "m15-sbs",
          wikiRouteRecordId: "route_m15_sbs",
          artifactName: "route_evidence",
          artifactKey: "studio/v2/wiki/routes/m15-sbs.json",
          contentType: "application/json",
          byteLength: 1800,
          sha256,
          coverage: {
            timelineCount: 8,
            interventionCount: 12,
            metricClaimCount: 20,
            projectCount: 3,
            sourceGapCount: 2,
            citationCount: 35,
          },
        },
        {
          routeId: "B99",
          routeSlug: "b99",
          wikiRouteRecordId: "route_b99",
          artifactName: "route_evidence",
          artifactKey: "studio/v2/wiki/routes/b99.json",
          contentType: "application/json",
          byteLength: 600,
          sha256,
          coverage: {
            timelineCount: 1,
            interventionCount: 0,
            metricClaimCount: 2,
            projectCount: 0,
            sourceGapCount: 1,
            citationCount: 4,
          },
        },
      ],
    }),
    "application/json",
  );
}

function routeEvidenceV2Artifacts(
  input: {
    forgedPresentation?:
      | {
          displayLabel?: string;
          serviceModes?: string[];
          routeTypes?: string[];
          tripTypes?: string[];
          designationLiterals?: string[];
        }
      | undefined;
    forgedSha256?: string | undefined;
    wikiRouteIds?: string[] | undefined;
  } = {},
): { bundle: FakeR2Object; index: FakeR2Object } {
  const source = {
    kind: "mta-wiki-immutable-release",
    wikiRelease: "v1-rc24",
    manifestSha256: "1".repeat(64),
    routeIdentitySha256: "2".repeat(64),
    routeAnchorSha256: "3".repeat(64),
    trackerRouteInputSha256: "4".repeat(64),
    catalogParity: {
      currentBusRoutesSha256: "5".repeat(64),
      effectiveAsOfDate: "2026-07-18",
      currentCatalogRouteCount: 2,
      catalogInEffectIdentityCount: 2,
      gtfsRouteCount: 2,
      descriptorReconciled: true,
      catalogInEffectSetsEqual: true,
      catalogOnlyRouteIds: [],
      gtfsOnlyRouteIds: [],
      rawRouteTypeCounts: { "3": 2 },
      scheduledInWindowCounts: { yes: 2 },
      reliabilityStatusCounts: { reliable: 2 },
      nonBusOrUnknownExtendedRouteTypeCount: 0,
      externalOnlyRouteRecordCount: 0,
    },
  };
  const routeIdentity = {
    routeId: "M15+",
    routeFamilyId: "M15",
    displayLabel: "M15-SBS",
    officialLongName: "East Harlem - South Ferry",
    designationLiterals: ["route_type:SBS", "trip_type:14"],
    serviceModes: ["sbs"],
    routeTypes: ["SBS"],
    tripTypes: ["14"],
    ...input.forgedPresentation,
  };
  const legacy = JSON.parse(routeEvidenceBundleArtifact().serializedValue()) as Record<
    string,
    unknown
  >;
  const bundle = {
    artifactKind: "bp.studio.route_evidence_bundle.v2",
    schemaVersion: 2,
    source,
    routeIdentity,
    operationalBindings: [
      {
        routeRecordId: "route_m15_sbs",
        routeFamilyId: "M15",
        datasetId: "mta-nyct-bus",
        componentFeedIds: ["nyct-manhattan"],
        sourceRouteId: "M15+",
        gtfsRouteId: "M15+",
        serviceVariant: "sbs",
        identityScope: "exact_service",
        serviceClass: "regular_mta_bus",
        recordTemporalScope: "current_description",
        projectable: true,
        presentationPrimary: true,
        derivation: "fixture",
        evidenceIds: ["m15_sbs_report#block-1"],
        canonicalRecordFingerprint: "6".repeat(64),
      },
    ],
    contextualBindings: [],
    ...legacy,
    wikiRouteIds: input.wikiRouteIds ?? ["M15+"],
  };
  const bundleBytes = `${JSON.stringify(bundle, null, 2)}\n`;
  const bundleSha256 = createHash("sha256").update(bundleBytes).digest("hex");
  const b99Identity = {
    routeId: "B99",
    routeFamilyId: "B99",
    displayLabel: "B99",
    officialLongName: "Late Night Shuttle",
    designationLiterals: ["route_type:Local", "trip_type:1"],
    serviceModes: ["local"],
    routeTypes: ["Local"],
    tripTypes: ["1"],
  };
  const index = {
    artifactKind: "bp.studio.route_evidence_index.v2",
    schemaVersion: 2,
    generatedAt: "2026-07-18T18:05:27.000Z",
    sourceArtifactKey: "studio/v2/wiki/route-evidence.json",
    source,
    summary: {
      routeCount: 2,
      matchedBusRouteCount: 1,
      citationCount: 2,
      totalByteLength: Buffer.byteLength(bundleBytes),
    },
    routes: [
      {
        routeId: "M15+",
        routeSlug: "m15-sbs",
        wikiRouteRecordId: "route_m15_sbs",
        artifactName: "route_evidence",
        artifactKey: "studio/v2/wiki/routes/m15-sbs.json",
        contentType: "application/json",
        byteLength: Buffer.byteLength(bundleBytes),
        sha256: input.forgedSha256 ?? bundleSha256,
        coverage: legacy["coverage"],
        bundleSchemaVersion: 2,
        routeIdentity,
      },
      {
        routeId: "B99",
        routeSlug: "b99",
        wikiRouteRecordId: null,
        artifactName: "route_evidence",
        artifactKey: "studio/v2/wiki/routes/b99.json",
        contentType: "application/json",
        byteLength: 0,
        sha256: "0".repeat(64),
        coverage: {
          timelineCount: 0,
          interventionCount: 0,
          metricClaimCount: 0,
          projectCount: 0,
          sourceGapCount: 0,
          citationCount: 0,
        },
        bundleSchemaVersion: 2,
        routeIdentity: b99Identity,
      },
    ],
  };
  return {
    bundle: new FakeR2Object(bundleBytes, "application/json"),
    index: new FakeR2Object(JSON.stringify(index), "application/json"),
  };
}

// Standard contrast routes for the snapshot/index/sections handler tests: a rich route
// with surfaced findings + partial speed history, and a sparse summary-only route.
const STANDARD_ROUTE_CAPABILITIES = [
  {
    routeId: "M15+",
    overallState: "ready",
    surfaces: {
      condition: capabilitySurface("ready"),
      speedHistory: capabilitySurface("partial", "16 cells missing"),
      detectorFindings: capabilitySurface("ready"),
      reliability: capabilitySurface("building"),
      ridership: capabilitySurface("ready"),
      scheduleBaseline: capabilitySurface("ready"),
    },
  },
  {
    routeId: "Q1",
    overallState: "checked_clean",
    surfaces: {
      condition: capabilitySurface("ready"),
      detectorFindings: capabilitySurface("checked_clean"),
      ridership: capabilitySurface("ready"),
    },
  },
  {
    routeId: "B99",
    overallState: "building",
    surfaces: {
      condition: capabilitySurface("ready"),
      detectorFindings: capabilitySurface("insufficient_data"),
      speedHistory: capabilitySurface("insufficient_data"),
      ridership: capabilitySurface("insufficient_data"),
    },
  },
];

const route = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15 SBS",
  corridor: "First Avenue / Second Avenue",
  corridorFull: "First Avenue / Second Avenue",
  borough: "Manhattan",
  sbs: true,
  speedMph: 7.2,
  scheduledMph: 8.4,
  weightedAvgSpeed: 7.2,
  speedPercentile: 12,
  dailyRiders: 30_000,
  ridersYoyPct: 0,
  riderHoursLost: 0,
  laneCoverage: 65,
  aceStatus: "active",
  aceSince: "2024",
  tspCoverage: "none",
  reliability: "High attention route",
  observedReliability: null,
  diagnosis: "M15 SBS has slow segments and active treatment evidence.",
  spark: [7.2, 7.4, 7.1],
  termini: { north: "East Harlem", south: "South Ferry" },
  miles: 8.1,
  stops: 42,
  flags: ["ACE active"],
  peerSlug: null,
  interventions: [],
} as const;

const quality = {
  releaseLayer: "published_release",
  completenessStatus: "complete",
  confidence: "high",
  caveats: [],
} as const;

function hourlyProfileArtifact() {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hourOfDay: hour,
    speedObservationCount: hour === 8 ? 12 : 1,
    speedBusTripCount: hour === 8 ? 120 : 10,
    averageSpeedMph: hour === 8 ? 6.2 : 8.4,
    ridership: hour === 8 ? 14_000 : 1_000,
    transfers: hour === 8 ? 2_000 : 100,
  }));
  return {
    artifactKind: "studio_route_hourly_profile",
    schemaVersion: 1,
    generatedAt: "2026-06-06T00:00:00.000Z",
    routeId: "M15+",
    routeSlug: "m15-sbs",
    source: {
      tables: [
        "local_route_hourly_ridership",
        "local_route_segment_speed",
        "local_route_observed_reliability_summary",
        "local_observed_headway_sample",
      ],
      dbPath: "data/local/pipeline.sqlite",
      startMonth: "2026-02",
      endMonth: "2026-03",
      artifactPath: "data/artifacts/studio/v2/routes/m15-sbs/hourly-profile.json",
    },
    dimensions: {
      months: ["2026-02", "2026-03"],
      hours: Array.from({ length: 24 }, (_, hour) => hour),
    },
    summary: {
      monthCount: 2,
      latestMonth: "2026-03",
      hourCount: 24,
      populatedHourCount: 24,
      speedObservationCount: 35,
      speedBusTripCount: 350,
      totalRidership: 37_000,
      totalTransfers: 4_300,
      reliabilitySampleCount: 8,
    },
    hours,
    peakWindows: [
      {
        month: "2026-03",
        dayOfWeek: "Tuesday",
        hourOfDay: 8,
        ridership: 14_000,
      },
    ],
    slowestWindows: [
      {
        month: "2026-03",
        dayOfWeek: "Tuesday",
        hourOfDay: 8,
        observationCount: 12,
        busTripCount: 120,
        weightedAverageSpeedMph: 6.2,
      },
    ],
    reliabilitySamples: [
      {
        month: "2026-03",
        hourOfDay: 8,
        sampleCount: 8,
        averageObservedHeadwayMinutes: 9.5,
      },
    ],
    monthlyProfiles: [
      {
        routeId: "M15+",
        month: "2026-03",
        hourlyRowCount: 168,
        totalRidership: 37_000,
        totalTransfers: 4_300,
        peakWindow: {
          dayOfWeek: "Tuesday",
          hourOfDay: 8,
          ridership: 14_000,
        },
      },
    ],
  } as const;
}

function createStudioProjectionEnv(
  input: { modelArtifact?: FakeR2Object; extraArtifacts?: Record<string, FakeR2Object> } = {},
): StudioApiEnv {
  return {
    ARTIFACTS: new FakeR2Bucket({
      [CAPABILITY_MANIFEST_KEY]: capabilityManifestArtifact(STANDARD_ROUTE_CAPABILITIES),
      "studio/v2/routes/m15-sbs/dossier.json": dossierSummaryArtifact("M15+", "m15-sbs"),
      "studio/v1/docs.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-05T00:00:00.000Z",
          sections: [{ title: "Quickstart", body: ["Use the API."] }],
          endpoints: [{ method: "GET", path: "/api/v1/studio/routes", body: "List routes." }],
          quality,
        }),
        "application/json",
      ),
      "studio/v1/methods.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-05T00:00:00.000Z",
          datasets: [
            {
              sourceId: "route_month_trends",
              name: "MTA Bus Speeds",
              publisher: "MTA",
              grain: "route-month",
              cadence: "monthly",
              description: "Route/month speed and ridership summary rows.",
              rowCount: 120,
              rowLabel: "route-month rows",
              period: "2026-03",
              schemaKeys: ["route_id", "month", "average_speed_mph"],
              method: "route-month-trends",
              sourceRefCount: 1,
            },
          ],
          quality,
        }),
        "application/json",
      ),
      "studio/v1/routes.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 2,
          generatedAt: "2026-06-05T00:00:00.000Z",
          releaseId: STUDIO_RELEASE_ID,
          publishedAt: STUDIO_PUBLISHED_AT,
          coverage: STUDIO_COVERAGE,
          routes: [route],
          quality,
        }),
        "application/json",
      ),
      "studio/v1/routes/m15-sbs/index.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 3,
          generatedAt: "2026-06-05T00:00:00.000Z",
          releaseId: STUDIO_RELEASE_ID,
          publishedAt: STUDIO_PUBLISHED_AT,
          coverage: STUDIO_COVERAGE,
          route,
          segments: [],
          artifactRefs: [],
          quality,
        }),
        "application/json",
      ),
      "studio/v2/routes/m15-sbs/hourly-profile.json": new FakeR2Object(
        JSON.stringify(hourlyProfileArtifact()),
        "application/json",
      ),
      "studio/v2/routes/m15-sbs/speed-history.json": new FakeR2Object(
        JSON.stringify({
          artifactKind: "studio_route_speed_history",
          schemaVersion: 1,
          generatedAt: "2026-06-06T00:00:00.000Z",
          routeId: "M15+",
          routeSlug: "m15-sbs",
          source: {
            table: "local_route_segment_speed",
            dbPath: "data/local/pipeline.sqlite",
            speedSpinePath: "data/artifacts/studio/v2/routes/m15-sbs/speed-spine.json",
            startMonth: "2026-02",
            endMonth: "2026-03",
            artifactPath: "data/artifacts/studio/v2/routes/m15-sbs/speed-history.json",
          },
          dimensions: {
            months: ["2026-02", "2026-03"],
            dayparts: ["am_peak", "midday", "pm_peak", "off_peak"],
            segments: [
              {
                segmentId: "m15-sbs-n-node-001-node-002",
                direction: "N",
                displayOrder: 10,
                label: "First Av to Second Av",
                fromNodeId: "node-001",
                toNodeId: "node-002",
              },
            ],
          },
          summary: {
            monthCount: 2,
            segmentCount: 1,
            daypartCount: 4,
            cellCount: 8,
            availableCellCount: 2,
            missingCellCount: 6,
            sourceObservationCount: 20,
            traversalCount: 200,
            unmappedRawKeyCount: 0,
          },
          unmappedRawKeys: [],
          cells: [
            {
              segmentId: "m15-sbs-n-node-001-node-002",
              month: "2026-02",
              daypart: "am_peak",
              status: "available",
              observationCount: 10,
              traversalCount: 100,
              averageSpeedMph: 8,
              averageTravelTimeMinutes: 3,
              averageRoadDistanceMiles: 0.4,
              segmentDaypartMeanSpeedMph: 9,
              deltaFromSegmentDaypartMeanMph: -1,
              pctFromSegmentDaypartMean: -0.1111,
            },
            {
              segmentId: "m15-sbs-n-node-001-node-002",
              month: "2026-02",
              daypart: "midday",
              status: "missing",
              observationCount: 0,
              traversalCount: 0,
              averageSpeedMph: null,
              averageTravelTimeMinutes: null,
              averageRoadDistanceMiles: null,
              segmentDaypartMeanSpeedMph: null,
              deltaFromSegmentDaypartMeanMph: null,
              pctFromSegmentDaypartMean: null,
            },
          ],
        }),
        "application/json",
      ),
      "studio/v2/wiki/routes/m15-sbs.json": routeEvidenceBundleArtifact(),
      ...input.extraArtifacts,
      "studio/v2/detectors/model-artifacts.json":
        input.modelArtifact ??
        new FakeR2Object(
          JSON.stringify({
            artifactKind: "model_artifact_serving_projection",
            schemaVersion: 1,
            generatedAt: "2026-06-07T00:00:00.000Z",
            releaseId: STUDIO_RELEASE_ID,
            publishedAt: STUDIO_PUBLISHED_AT,
            coverage: STUDIO_COVERAGE,
            historyWindow: { startMonth: "2023-04", endMonth: "2026-03" },
            sourceEvaluationPath:
              "data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation.json",
            summary: {
              modelCount: 2,
              availableModelCount: 1,
              missingModelCount: 1,
              detectorConsumerCount: 3,
            },
            models: [
              {
                modelId: "segment_speed_residuals_v1",
                status: "available",
                panelId: "segment_month_panel_v1",
                release: {
                  releaseId: STUDIO_RELEASE_ID,
                  publishedAt: STUDIO_PUBLISHED_AT,
                  coverage: STUDIO_COVERAGE,
                },
                modeledReleaseRowCount: 404,
                routeCount: 2,
                segmentCount: 12,
                detectorConsumers: ["speed_pace_hotspot", "treatment_scope_mismatch"],
                limitations: ["fixture limitation"],
              },
              {
                modelId: "pulse_fingerprint_v1",
                status: "missing",
                panelId: "route_hour_of_week_pulse_panel_v1",
                release: null,
                modeledReleaseRowCount: 0,
                routeCount: 0,
                segmentCount: 0,
                detectorConsumers: ["pulse_fingerprint"],
                limitations: ["not built in fixture"],
              },
            ],
          }),
          "application/json",
        ),
    }) as unknown as R2Bucket,
  };
}

function createSparseStudioRouteDb(
  input: {
    sourceMonthCoverage?: unknown[];
    routeArtifacts?: unknown[];
    tripTypes?: unknown[];
    exactRouteIdentityReleases?: unknown[];
  } = {},
): FakeDb {
  return new FakeDb({
    exact_route_identity_release: input.exactRouteIdentityReleases ?? [
      exactRouteIdentityReleaseFixture({
        exactRouteCount: 2,
        routeTypeCount: 2,
        tripTypeCount: 2,
      }),
    ],
    route_artifact: input.routeArtifacts ?? [
      {
        route_id: "M15+",
        month: "2026-03",
        artifact_name: "brief.json",
      },
      {
        route_id: "M15+",
        month: "2026-03",
        artifact_name: "route_evidence",
      },
    ],
    route_batch_status: [
      {
        month: "2026-03",
        generated_at: STUDIO_PUBLISHED_AT,
        status: "pass",
        route_count: 2,
        artifact_count: 2,
        missing_artifact_count: 0,
        hash_mismatch_count: 0,
        byte_length_mismatch_count: 0,
        total_byte_length: 1024,
        issue_count: 0,
      },
    ],
    route_brief_summary: [
      {
        route_id: "M15+",
        month: "2026-03",
        public_visible: true,
        public_visibility_reason: "public",
        route_score: 24,
        average_speed_mph: 7.2,
        hotspot_count: 4,
        total_ridership: 900000,
        total_transfers: 10000,
        ace_active: true,
        ace_violation_count: 10,
        bus_lane_matched_lane_count: 8,
        schedule_match_rate: 0.98,
      },
      {
        route_id: "B99",
        month: "2026-03",
        public_visible: false,
        public_visibility_reason: "no_rich_artifact",
        route_score: 72,
        average_speed_mph: 11.1,
        hotspot_count: 0,
        total_ridership: 0,
        total_transfers: 0,
        ace_active: false,
        ace_violation_count: 0,
        bus_lane_matched_lane_count: 0,
        schedule_match_rate: 0.6,
      },
    ],
    route_catalog: [
      {
        route_id: "M15+",
        route_short_name: "M15-SBS",
        route_long_name: "East Harlem - South Ferry",
        shape_count: 2,
        stop_count: 42,
        timepoint_stop_count: 12,
      },
      {
        route_id: "B99",
        route_short_name: "B99",
        route_long_name: "Late Night Shuttle",
        shape_count: 1,
        stop_count: 10,
        timepoint_stop_count: 4,
      },
    ],
    route_catalog_type: [
      {
        route_id: "M15+",
        type_rank: 1,
        route_type: "SBS",
      },
      {
        route_id: "B99",
        type_rank: 1,
        route_type: "Local",
      },
    ],
    route_catalog_trip_type: input.tripTypes ?? [
      {
        route_id: "M15+",
        trip_type_rank: 1,
        trip_type: "14",
      },
      {
        route_id: "B99",
        trip_type_rank: 1,
        trip_type: "1",
      },
    ],
    route_month_trend: [
      {
        route_id: "M15+",
        month: "2023-04",
        speed_observation_count: 4106,
        speed_bus_trip_count: 72587,
        average_speed_mph: 7.1,
        ridership: 880000,
        transfers: 70737,
        has_speed_trend: true,
        has_ridership_trend: true,
      },
      {
        route_id: "B99",
        month: "2026-03",
        speed_observation_count: 0,
        speed_bus_trip_count: 0,
        average_speed_mph: null,
        ridership: null,
        transfers: null,
        has_speed_trend: false,
        has_ridership_trend: false,
      },
    ],
    route_speed_history_coverage: [
      {
        route_id: "M15+",
        month: "2026-03",
        route_slug: "m15-sbs",
        history_start_month: "2023-04",
        history_end_month: "2026-03",
        artifact_path: "studio/v2/routes/m15-sbs/speed-history.json",
        artifact_status: "written",
        month_count: 36,
        segment_count: 12,
        cell_count: 1728,
        available_cell_count: 1712,
        missing_cell_count: 16,
        generated_at: "2026-06-06T00:00:00.000Z",
      },
    ],
    route_timeline_index: [
      {
        route_id: "M15+",
        month: "2026-03",
        support_level: "timeline_sparse",
        quality_flags_json: JSON.stringify(["low_default_event_count"]),
        default_event_count: 1,
        secondary_event_count: 0,
        review_only_event_count: 0,
        event_count: 1,
        source_backed_event_count: 1,
        date_assertion_backed_event_count: 1,
        unresolved_date_event_count: 0,
        low_confidence_event_count: 0,
        unaccounted_candidate_count: 0,
        validation_error_count: 0,
        validation_warning_count: 0,
        total_tokens: 21507,
        default_events_json: JSON.stringify([
          {
            eventId: "m15_sbs_launch_oct2010",
            displayDate: "2010-10",
            title: "M15 Select Bus Service Launches on 1st/2nd Avenue",
          },
        ]),
        bundle_artifact_key: "studio/v2/routes/m15-sbs/timeline.json",
        bundle_artifact_sha256: "b".repeat(64),
        bundle_artifact_byte_length: 512,
        source_bundle_path: "/tmp/m15-timeline.json",
        generated_at: "2026-06-06T20:14:00.000Z",
      },
    ],
    route_equity_context: [
      {
        route_id: "M15+",
        month: "2026-03",
        acs_year: 2024,
        assignment_geography: "county_proxy",
        assigned_county_fips: "061",
        assigned_county_name: "New York County",
        assignment_method: "route_id_prefix",
        tract_count: 309,
        total_population: 1640000,
        occupied_housing_units: 780000,
        no_vehicle_households: 600000,
        no_vehicle_household_share: 0.7692,
        median_household_income: 98000,
        poverty_rate: 15.4,
        public_transit_commuter_share: 58.2,
        hispanic_share: 25.1,
        non_hispanic_white_share: 44.3,
        non_hispanic_black_share: 12.1,
        non_hispanic_asian_share: 14.2,
      },
    ],
    source_month_coverage: input.sourceMonthCoverage ?? [
      {
        source_id: "local_route_segment_speed",
        month: "2026-03",
        label: "Route segment speed rows",
        source_kind: "source_table",
        grain: "route x month x segment/hour speed observation",
        status: "available",
        row_count: 4200,
        route_count: 350,
        note: null,
        generated_at: "2026-06-06T00:00:00.000Z",
        artifact_path:
          "data/artifacts/source-month-coverage/2023-04_to_2026-03/coverage-matrix.json",
      },
      {
        source_id: "local_route_schedule_stop_source_year",
        month: "2026-03",
        label: "Route schedule stop source-year support",
        source_kind: "source_year_table",
        grain: "source year x route x schedule stop",
        status: "partial",
        row_count: 27538626,
        route_count: 375,
        note: "Source-year schedule stop rows for 375/386 status routes in 2026.",
        generated_at: "2026-06-06T00:00:00.000Z",
        artifact_path:
          "data/artifacts/source-month-coverage/2023-04_to_2026-03/coverage-matrix.json",
      },
    ],
    route_observed_reliability_summary: [],
    route_readiness: [
      {
        route_id: "M15+",
        month: "2026-03",
        readiness_status: "ready",
        build_eligible: true,
        readiness_score: 100,
        speed_observation_count: 4000,
        speed_bus_trip_count: 70000,
        average_speed_mph: 7.2,
        schedule_timepoint_count: 12,
        shape_count: 2,
        stop_count: 42,
        timepoint_stop_count: 12,
      },
      {
        route_id: "B99",
        month: "2026-03",
        readiness_status: "partial",
        build_eligible: false,
        readiness_score: 60,
        speed_observation_count: 0,
        speed_bus_trip_count: 0,
        average_speed_mph: null,
        schedule_timepoint_count: 4,
        shape_count: 1,
        stop_count: 10,
        timepoint_stop_count: 4,
      },
    ],
  });
}

async function fetchApi(path: string, env: StudioApiEnv = {}): Promise<Response> {
  const response = await handleStudioApiRequest(new Request(`https://example.test${path}`), env);
  if (response === null) {
    throw new Error(`Expected API response for ${path}`);
  }
  return response;
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

describe("Studio API facade", () => {
  it("serves health, schema, and OpenAPI routes through the package facade", async () => {
    const [healthResponse, schemaResponse, openApiResponse] = await Promise.all([
      fetchApi("/api/health"),
      fetchApi("/api/schema/route-scorecard"),
      fetchApi("/api/openapi.json"),
    ]);

    expect(healthResponse.status).toBe(200);
    expect(healthResponse.headers.get("Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=86400",
    );
    expect(decodeStrict(HealthResponseSchema)(await healthResponse.json())).toEqual(
      expect.objectContaining({ ok: true, service: "bus-priority-impact-studio" }),
    );

    expect(schemaResponse.status).toBe(200);
    expect(await schemaResponse.json()).toEqual(expect.objectContaining({ type: "object" }));

    expect(openApiResponse.status).toBe(200);
    expect(openApiResponse.headers.get("Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=86400",
    );
    const openApi = (await openApiResponse.json()) as {
      openapi?: unknown;
      paths?: Record<string, unknown>;
    };
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.paths).toEqual(
      expect.objectContaining({
        "/api/v1/studio/routes": expect.any(Object),
        "/api/v1/studio/routes/sections": expect.any(Object),
        "/api/v1/studio/routes/{routeId}/history": expect.any(Object),
        "/api/v1/studio/routes/{routeId}/hourly-profile": expect.any(Object),
        "/api/v1/studio/routes/{routeId}/speed-history": expect.any(Object),
        "/api/v1/studio/routes/{routeId}/timeline": expect.any(Object),
        "/api/v1/studio/snapshot": expect.any(Object),
        "/api/v1/releases/{releaseId}/artifacts/{logicalId}": expect.any(Object),
      }),
    );
  });

  it("applies registry private no-store cache policy to RUM reports", async () => {
    const response = await handleStudioApiRequest(
      new Request("https://example.test/api/v1/rum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/routes/m15-sbs" }),
      }),
      {},
    );

    expect(response?.status).toBe(204);
    expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("keeps unknown API routes closed at the package facade", async () => {
    const response = await fetchApi("/api/missing");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "API route was not found.",
      },
    });
  });

  it("returns method-aware JSON errors for known API paths", async () => {
    const response = await handleStudioApiRequest(
      new Request("https://example.test/api/v1/studio/routes", { method: "POST" }),
      {},
    );

    expect(response?.status).toBe(405);
    expect(response?.headers.get("Allow")).toBe("GET");
    await expect(response?.json()).resolves.toEqual({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method is not allowed for this API route.",
      },
    });
  });

  it("wraps unhandled Studio API failures in a JSON error envelope", async () => {
    const response = await fetchApi("/api/v1/studio/routes?schema=2", {
      ARTIFACTS: {
        get: async () => {
          throw new Error("simulated R2 outage");
        },
      } as unknown as R2Bucket,
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("X-Request-ID")).toBeString();
    expect(response.headers.get("X-Request-ID")?.length).toBeGreaterThan(0);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL",
        message: "Internal error.",
      },
    });
  });

  it("does not cache unhandled Studio API failure envelopes", async () => {
    const response = await fetchApi("/api/v1/studio/routes?schema=2", {
      ARTIFACTS: {
        get: async () => {
          throw new Error("simulated R2 outage");
        },
      } as unknown as R2Bucket,
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    });

    expect(response.status).toBe(500);
    expect(response.headers.has("Cache-Control")).toBe(false);
    expect(response.headers.get("X-Request-ID")).toBeString();
  });

  it("serves D1-backed v1 status", async () => {
    const db = new FakeDb({
      corridor_hotspot: [
        {
          corridor_id: "corridor-b46",
          month: "2026-03",
          corridor_hotspot_rank: 1,
          route_id: "B46-SBS",
          route_hotspot_rank: 2,
          from_stop_name: "DeKalb Av",
          to_stop_name: "Eastern Pkwy",
          weighted_average_speed_mph: 4.9,
          hotspot_score: 91,
          rider_impact_score: 88,
        },
      ],
      corridor_intervention_context: [],
      corridor_month_summary: [
        {
          corridor_id: "corridor-b46",
          month: "2026-03",
          route_count: 1,
          assigned_route_count: 1,
          ambiguous_route_count: 0,
          unassigned_route_count: 0,
          total_ridership: 123456,
          total_transfers: 1234,
          weighted_average_speed_mph: 6.4,
          hotspot_count: 1,
          observed_reliability_route_count: 1,
          insufficient_reliability_route_count: 0,
          intervention_comparison_count: 1,
          evaluated_intervention_comparison_count: 1,
        },
      ],
      corridor_route_member: [],
      corridor: [
        {
          corridor_id: "corridor-b46",
          corridor_name: "Utica Avenue",
          corridor_key: "utica-avenue",
          derivation_method: "route_member",
        },
      ],
      route_artifact: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          artifact_name: "route-brief",
          artifact_key: "briefs/2026-03/b46-sbs.json",
          content_type: "application/json",
          byte_length: 2048,
          sha256: "a".repeat(64),
        },
      ],
      route_batch_built_route: [
        {
          month: "2026-03",
          route_rank: 1,
          route_id: "B46-SBS",
          artifact_count: 3,
          status: "built",
        },
        {
          month: "2026-03",
          route_rank: 2,
          route_id: "M15-SBS",
          artifact_count: 3,
          status: "built",
        },
      ],
      route_batch_issue: [],
      route_batch_status: [
        {
          month: "2026-03",
          generated_at: "2026-05-17T15:46:52.274Z",
          status: "pass",
          route_count: 2,
          artifact_count: 6,
          missing_artifact_count: 0,
          hash_mismatch_count: 0,
          byte_length_mismatch_count: 0,
          total_byte_length: 1234,
          issue_count: 0,
        },
      ],
      route_brief_peak_window: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          window_rank: 1,
          day_of_week: "weekday",
          hour_of_day: 8,
          ridership: 1000,
          transfers: 50,
          matched_observation_count: 20,
          bus_trip_count: 10,
          weighted_average_speed_mph: 6.1,
          slow_observation_share: 0.4,
        },
      ],
      route_brief_slowest_window: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          window_rank: 1,
          day_of_week: "weekday",
          hour_of_day: 17,
          observation_count: 40,
          bus_trip_count: 20,
          segment_count: 5,
          weighted_average_speed_mph: 4.9,
          weighted_average_travel_time_minutes: 12.5,
          slow_observation_share: 0.7,
        },
      ],
      route_brief_summary: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          route_score: 38,
          public_visible: true,
          public_visibility_reason: "public",
          average_speed_mph: 6.4,
          hotspot_count: 9,
          total_ridership: 123456,
          total_transfers: 1234,
          ace_active: true,
          ace_violation_count: 10,
          bus_lane_matched_lane_count: 4,
          schedule_match_rate: 0.98,
        },
        {
          route_id: "M15-SBS",
          month: "2026-03",
          route_score: 54,
          public_visible: true,
          public_visibility_reason: "public",
          average_speed_mph: 7.8,
          hotspot_count: 6,
          total_ridership: 234567,
          total_transfers: 2345,
          ace_active: true,
          ace_violation_count: 20,
          bus_lane_matched_lane_count: 8,
          schedule_match_rate: 0.99,
        },
      ],
      route_comparison_rank: [
        {
          month: "2026-03",
          rank: 1,
          route_id: "B46-SBS",
          route_score: 38,
          average_speed_mph: 6.4,
          total_ridership: 123456,
          ace_violation_count: 10,
          bus_lane_matched_lane_count: 4,
        },
        {
          month: "2026-03",
          rank: 2,
          route_id: "M15-SBS",
          route_score: 54,
          average_speed_mph: 7.8,
          total_ridership: 234567,
          ace_violation_count: 20,
          bus_lane_matched_lane_count: 8,
        },
      ],
      route_month_source_status: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          source_scope: "reliability",
          source_id: "observedHeadways",
          status: "available",
          row_count: 42,
          snapshot_id: "bus-observatory-2026-03",
          note: "third-party recovered",
        },
      ],
      route_observed_reliability_summary: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          run_id: "bus-observatory-2026-03",
          reliability_status: "observed",
          min_sample_threshold: 30,
          sample_count: 2500,
          stop_count: 50,
          direction_count: 2,
          average_observed_headway_minutes: 8,
          median_observed_headway_minutes: 7,
          p90_observed_headway_minutes: 14,
          max_observed_headway_minutes: 22,
          scheduled_median_headway_minutes: null,
          bunching_threshold_minutes: 3,
          long_gap_threshold_minutes: 20,
          observed_bunching_share: 0.12,
          observed_long_gap_share: 0.2,
          expected_wait_minutes: 5,
          scheduled_expected_wait_minutes: null,
          excess_wait_minutes: 1.5,
          wait_reliability_ratio: null,
        },
        {
          route_id: "M15-SBS",
          month: "2026-03",
          run_id: "bus-observatory-2026-03",
          reliability_status: "observed",
          min_sample_threshold: 30,
          sample_count: 3200,
          stop_count: 60,
          direction_count: 2,
          average_observed_headway_minutes: 7,
          median_observed_headway_minutes: 6,
          p90_observed_headway_minutes: 13,
          max_observed_headway_minutes: 21,
          scheduled_median_headway_minutes: null,
          bunching_threshold_minutes: 3,
          long_gap_threshold_minutes: 20,
          observed_bunching_share: 0.08,
          observed_long_gap_share: 0.17,
          expected_wait_minutes: 4,
          scheduled_expected_wait_minutes: null,
          excess_wait_minutes: 0.8,
          wait_reliability_ratio: null,
        },
      ],
    });
    const env = { DB: db as unknown as D1Database };

    const status = await fetchApi("/api/v1/status", env);
    const recoveryStatus = await fetchApi("/api/v1/status", {
      ...env,
      PLAN097_RECOVERY_ENABLED: "true",
      PLAN097_PREVIOUS_RELEASE_ID: "pub_20260517T154652274Z",
    });

    const statusValue = decodeStrict(ReleaseStatusResponseSchema)(await status.json());
    expect(recoveryStatus.status).toBe(200);
    expect(recoveryStatus.headers.get("Cache-Control")).toBe("no-store");
    expect(statusValue).toEqual(
      expect.objectContaining({
        releaseId: "pub_20260517T154652274Z",
        publishedAt: "2026-05-17T15:46:52.274Z",
        coverage: { start: null, end: "2026-03" },
        release: expect.objectContaining({
          releaseId: "pub_20260517T154652274Z",
          publishedAt: "2026-05-17T15:46:52.274Z",
          coverage: { start: null, end: "2026-03" },
          status: "pass",
          routeCount: 2,
        }),
        observedRealtimeEvidence: expect.objectContaining({
          runId: "bus-observatory-2026-03",
          source: "third_party_recovered",
        }),
      }),
    );
  });

  it("counts multi-run reliability once per public release route", async () => {
    const reliabilityRow = {
      month: "2026-05",
      reliability_status: "observed",
      min_sample_threshold: 30,
      sample_count: 100,
      stop_count: 10,
      direction_count: 2,
      average_observed_headway_minutes: 8,
      median_observed_headway_minutes: 7,
      p90_observed_headway_minutes: 14,
      max_observed_headway_minutes: 22,
      scheduled_median_headway_minutes: null,
      bunching_threshold_minutes: 3,
      long_gap_threshold_minutes: 20,
      observed_bunching_share: 0.12,
      observed_long_gap_share: 0.2,
      expected_wait_minutes: 5,
      scheduled_expected_wait_minutes: null,
      excess_wait_minutes: 1.5,
      wait_reliability_ratio: null,
    };
    const db = new FakeDb({
      route_batch_built_route: [
        {
          month: "2026-05",
          route_rank: 1,
          route_id: "B46-SBS",
          artifact_count: 3,
          status: "built",
        },
        {
          month: "2026-05",
          route_rank: 2,
          route_id: "M15-SBS",
          artifact_count: 3,
          status: "built",
        },
      ],
      route_batch_issue: [],
      route_batch_status: [
        {
          month: "2026-05",
          generated_at: "2026-07-25T16:41:23.260Z",
          status: "pass",
          route_count: 2,
          artifact_count: 6,
          missing_artifact_count: 0,
          hash_mismatch_count: 0,
          byte_length_mismatch_count: 0,
          total_byte_length: 1234,
          issue_count: 0,
        },
      ],
      route_observed_reliability_summary: [
        { ...reliabilityRow, route_id: "B46-SBS", run_id: "run-a" },
        { ...reliabilityRow, route_id: "B46-SBS", run_id: "run-b" },
        { ...reliabilityRow, route_id: "M15-SBS", run_id: "run-a" },
        { ...reliabilityRow, route_id: "M15-SBS", run_id: "run-b" },
        { ...reliabilityRow, route_id: "Q99", run_id: "run-a" },
      ],
    });

    const response = await fetchApi("/api/v1/status", {
      DB: db as unknown as D1Database,
    });

    expect(response.status).toBe(200);
    const status = decodeStrict(ReleaseStatusResponseSchema)(await response.json());
    expect(status.release.routeCount).toBe(2);
    expect(status.observedRealtimeEvidence).toEqual(
      expect.objectContaining({
        runId: null,
        source: "none",
        observedRouteCount: 2,
        insufficientRouteCount: 0,
        routeCoverageShare: 1,
      }),
    );
  });

  it("fails current public reads closed without published serving data", async () => {
    const response = await fetchApi("/api/v1/status", {
      DB: new FakeDb({}) as unknown as D1Database,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "No published serving data is available.",
      },
    });
  });

  it("serves the independent public intervention release during Plan 097 recovery", async () => {
    const networkBody = '{"artifactKind":"public_intervention_episodes"}';
    const routeBody = '{"artifactKind":"public_route_intervention_history"}';
    const env = {
      ARTIFACTS: new FakeR2Bucket({
        "studio/v2/interventions/public-episodes-v2.json": new FakeR2Object(
          networkBody,
          "application/json",
        ),
        "studio/v2/routes/m15-sbs/intervention-history-v2.json": new FakeR2Object(
          routeBody,
          "application/json",
        ),
      }) as unknown as R2Bucket,
      PLAN097_RECOVERY_ENABLED: "true",
    };

    const [networkResponse, routeResponse] = await Promise.all([
      fetchApi("/api/v1/artifacts/studio/v2/interventions/public-episodes-v2.json", env),
      fetchApi("/api/v1/artifacts/studio/v2/routes/m15-sbs/intervention-history-v2.json", env),
    ]);

    expect(networkResponse.status).toBe(200);
    expect(routeResponse.status).toBe(200);
    expect(networkResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(routeResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await networkResponse.text()).toBe(networkBody);
    expect(await routeResponse.text()).toBe(routeBody);
  });

  it("serves only the latest cataloged v2 map manifest and artifact objects", async () => {
    const artifactHash = "b".repeat(64);
    const routeFactsHash = "c".repeat(64);
    const releaseId = "pub_20260719T123456789Z";
    const publishedAt = "2026-07-19T12:34:56.789Z";
    const coverage = { start: "2023-04", end: "2026-03" } as const;
    const manifestValue = {
      schemaVersion: 2,
      artifactKind: "map_artifact_manifest",
      releaseId,
      publishedAt,
      coverage,
      releaseProfile: "full",
      buildStatus: "pass",
      verificationStatus: "pass",
      routeFacts: {
        status: "available",
        artifactKey: "studio/v1/map-route-facts.json",
        sha256: routeFactsHash,
        schemaVersion: 2,
        releaseId,
        publishedAt,
        coverage,
        routeCount: 1,
        byteLength: 256,
        gzipByteLength: 128,
      },
      sources: [],
      layers: [],
      routeUniverse: {
        includedRouteTypes: ["Local", "Limited", "SBS"],
        excludedRouteTypes: ["Express", "School"],
        expectedRouteIds: ["B46-SBS"],
        geometryRouteIds: ["B46-SBS"],
        routeSegmentRouteIds: ["B46-SBS"],
        routeFactRouteIds: ["B46-SBS"],
      },
      status: "pass",
      artifactCount: 1,
      routeSegmentArtifactCount: 1,
      totalFeatureCount: 3,
      totalByteLength: 128,
      issueCount: 0,
      artifacts: [
        {
          artifactKind: "map_route_segments_geojson",
          artifactKey: "map/route-segments/b46-sbs/2026-03/all-day.geojson",
          contentType: "application/geo+json",
          byteLength: 128,
          gzipByteLength: 96,
          sha256: artifactHash,
          featureCount: 3,
          coordinateCount: 12,
          routeId: "B46-SBS",
        },
      ],
    };
    const manifestBody = JSON.stringify(manifestValue);
    const manifestSha256 = createHash("sha256").update(manifestBody).digest("hex");
    const manifestKey = `map/2026-03/manifest.${manifestSha256}.json`;
    const bucket = new FakeR2Bucket({
      [manifestKey]: new FakeR2Object(manifestBody, "application/json; charset=utf-8"),
      "map/route-segments/b46-sbs/2026-03/all-day.geojson": new FakeR2Object(
        '{"type":"FeatureCollection","features":[]}',
        "application/geo+json",
      ),
      [`map/route-segments/b46-sbs/2026-03/all-day.${"b".repeat(64)}.geojson`]: new FakeR2Object(
        '{"type":"FeatureCollection","features":[]}',
        "application/geo+json",
      ),
    });
    const catalogRow = {
      release_id: releaseId,
      published_at: publishedAt,
      coverage_start: coverage.start,
      coverage_end: coverage.end,
      manifest_key: manifestKey,
      manifest_sha256: manifestSha256,
      release_profile: "full",
      verification_status: "pass",
      route_count: 1,
    };
    const db = new FakeDb({ map_release_catalog: [catalogRow] });
    const env = {
      ARTIFACTS: bucket as unknown as R2Bucket,
      DB: db as unknown as D1Database,
    };

    const manifestResponse = await fetchApi("/api/v1/map/manifest?month=1900-99", env);
    const artifactResponse = await fetchApi(
      "/api/v1/artifacts/map/route-segments/b46-sbs/2026-03/all-day.geojson",
      env,
    );
    const invalidArtifactResponse = await fetchApi(
      "/api/v1/artifacts/map/%252e%252e/private.json",
      env,
    );
    const recoveryArtifactResponse = await fetchApi(
      "/api/v1/artifacts/operations/plan097/blobs/sha256/aa/private.json",
      env,
    );
    const immutableArtifactResponse = await fetchApi(
      `/api/v1/artifacts/map/route-segments/b46-sbs/2026-03/all-day.${"b".repeat(64)}.geojson`,
      env,
    );

    expect(decodeStrict(MapManifestResponseSchema)(await manifestResponse.json())).toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        releaseId,
        publishedAt,
        coverage,
        artifactCount: 1,
        artifacts: [
          expect.objectContaining({
            routeId: "B46-SBS",
            apiPath: "/api/v1/artifacts/map/route-segments/b46-sbs/2026-03/all-day.geojson",
          }),
        ],
      }),
    );

    const pointedRelease = {
      releaseId: "pub_20260801T232501631Z",
      publishedAt: "2026-08-01T23:25:01.631Z",
    } as const;
    const pointedManifestArtifact = {
      logicalId: manifestKey,
      key: manifestKey,
      sha256: manifestSha256,
      bytes: new TextEncoder().encode(manifestBody).byteLength,
      mediaType: "application/json; charset=utf-8",
      schemaId: "map_artifact_manifest",
    };
    const pointedManifestObject = Object.assign(
      new FakeR2Object(manifestBody, pointedManifestArtifact.mediaType),
      {
        size: pointedManifestArtifact.bytes,
        customMetadata: { sha256: manifestSha256 },
      },
    );
    const pointedManifestResponse = await fetchApi("/api/v1/map/manifest", {
      ARTIFACTS: new FakeR2Bucket({
        [manifestKey]: pointedManifestObject,
      }) as unknown as R2Bucket,
      DB: db as unknown as D1Database,
      SERVING_RELEASE_CONTEXT: {
        kind: "pointed",
        generation: 2,
        release: {
          schemaVersion: 1,
          ...pointedRelease,
          candidateId: "a".repeat(64),
          activatedAt: pointedRelease.publishedAt,
        },
        candidate: {
          datasets: [
            {
              datasetId: "reviewed-serving",
              grain: "month",
              coverage,
              sourceSnapshotIds: [],
            },
          ],
          artifacts: [pointedManifestArtifact],
        },
        artifactByLogicalId: new Map([[manifestKey, pointedManifestArtifact]]),
      } as unknown as NonNullable<StudioApiEnv["SERVING_RELEASE_CONTEXT"]>,
    });
    expect(pointedManifestResponse.status).toBe(200);
    expect(decodeStrict(MapManifestResponseSchema)(await pointedManifestResponse.json())).toEqual(
      expect.objectContaining({
        ...pointedRelease,
        coverage,
        routeFacts: expect.objectContaining(pointedRelease),
        artifacts: [
          expect.objectContaining({
            apiPath: `/api/v1/releases/${pointedRelease.releaseId}/artifacts/map/route-segments/b46-sbs/2026-03/all-day.geojson`,
          }),
        ],
      }),
    );
    expect(manifestResponse.headers.get("Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=86400",
    );
    expect(artifactResponse.headers.get("Content-Type")).toBe("application/geo+json");
    expect(recoveryArtifactResponse.status).toBe(404);
    expect(artifactResponse.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    );
    expect(artifactResponse.headers.get("etag")).not.toBeNull();
    expect(immutableArtifactResponse.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const recoveryModeArtifactResponse = await fetchApi(
      "/api/v1/artifacts/map/route-segments/b46-sbs/2026-03/all-day.geojson",
      {
        ...env,
        ARTIFACTS: new FakeR2Bucket({
          "map/route-segments/b46-sbs/2026-03/all-day.geojson": new FakeR2Object(
            '{"type":"FeatureCollection","features":[]}',
            "application/geo+json",
          ),
        }) as unknown as R2Bucket,
        PLAN097_RECOVERY_ENABLED: "true",
        PLAN097_PREVIOUS_RELEASE_ID: releaseId,
      },
    );
    expect(recoveryModeArtifactResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await artifactResponse.text()).toBe('{"type":"FeatureCollection","features":[]}');
    expect(invalidArtifactResponse.status).toBe(400);
    expect((await invalidArtifactResponse.json()) as unknown).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Artifact key is invalid.",
      },
    });

    const mismatchedCatalog = await fetchApi("/api/v1/map/manifest", {
      ARTIFACTS: bucket as unknown as R2Bucket,
      DB: new FakeDb({
        map_release_catalog: [{ ...catalogRow, route_count: 2 }],
      }) as unknown as D1Database,
    });
    expect(mismatchedCatalog.status).toBe(502);
    expect((await mismatchedCatalog.json()) as unknown).toEqual({
      error: {
        code: "BAD_GATEWAY",
        message: "The registered map manifest does not match its catalog record.",
      },
    });

    const independentlyNewestMap = await fetchApi("/api/v1/map/manifest", {
      ARTIFACTS: bucket as unknown as R2Bucket,
      DB: new FakeDb({
        map_release_catalog: [catalogRow],
        route_batch_status: [
          {
            month: coverage.end,
            generated_at: "2026-07-20T00:00:00.000Z",
            status: "pass",
            route_count: 1,
            artifact_count: 1,
            missing_artifact_count: 0,
            hash_mismatch_count: 0,
            byte_length_mismatch_count: 0,
            total_byte_length: 1024,
            issue_count: 0,
          },
        ],
        route_month_trend: [{ month: coverage.start }],
      }) as unknown as D1Database,
    });
    expect(independentlyNewestMap.status).toBe(503);
    expect((await independentlyNewestMap.json()) as unknown).toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "The verified map release does not match the active Studio release.",
      },
    });

    async function expectRehashedManifestFailure(
      candidate: unknown,
      message: string,
    ): Promise<void> {
      const body = JSON.stringify(candidate);
      const sha256 = createHash("sha256").update(body).digest("hex");
      const key = `map/2026-03/manifest.${sha256}.json`;
      const response = await fetchApi("/api/v1/map/manifest", {
        ARTIFACTS: new FakeR2Bucket({
          [key]: new FakeR2Object(body, "application/json"),
        }) as unknown as R2Bucket,
        DB: new FakeDb({
          map_release_catalog: [{ ...catalogRow, manifest_key: key, manifest_sha256: sha256 }],
        }) as unknown as D1Database,
      });
      expect(response.status).toBe(502);
      expect((await response.json()) as unknown).toEqual({
        error: { code: "BAD_GATEWAY", message },
      });
    }

    const broaderRouteFactsManifest = {
      ...manifestValue,
      routeFacts: {
        ...manifestValue.routeFacts,
        // The projection may also contain Express/School facts outside the public map universe.
        routeCount: 3,
      },
    };
    const broaderRouteFactsBody = JSON.stringify(broaderRouteFactsManifest);
    const broaderRouteFactsSha256 = createHash("sha256")
      .update(broaderRouteFactsBody)
      .digest("hex");
    const broaderRouteFactsKey = `map/2026-03/manifest.${broaderRouteFactsSha256}.json`;
    const broaderRouteFactsResponse = await fetchApi("/api/v1/map/manifest", {
      ARTIFACTS: new FakeR2Bucket({
        [broaderRouteFactsKey]: new FakeR2Object(broaderRouteFactsBody, "application/json"),
      }) as unknown as R2Bucket,
      DB: new FakeDb({
        map_release_catalog: [
          {
            ...catalogRow,
            manifest_key: broaderRouteFactsKey,
            manifest_sha256: broaderRouteFactsSha256,
          },
        ],
      }) as unknown as D1Database,
    });
    expect(broaderRouteFactsResponse.status).toBe(200);
    expect(
      decodeStrict(MapManifestResponseSchema)(await broaderRouteFactsResponse.json()).routeFacts,
    ).toEqual(expect.objectContaining({ status: "available", routeCount: 3 }));

    await expectRehashedManifestFailure(
      {
        ...manifestValue,
        routeUniverse: {
          ...manifestValue.routeUniverse,
          routeFactRouteIds: ["B46-SBS", "B46-SBS"],
        },
      },
      "The registered map manifest does not match its catalog record.",
    );
    await expectRehashedManifestFailure(
      {
        ...manifestValue,
        routeUniverse: {
          ...manifestValue.routeUniverse,
          routeFactRouteIds: ["B46-SBS", "X1"],
        },
      },
      "The registered map manifest does not match its catalog record.",
    );

    const alternateRelease = {
      releaseId: "pub_20260720T123456789Z",
      publishedAt: "2026-07-20T12:34:56.789Z",
    } as const;
    await expectRehashedManifestFailure(
      {
        ...manifestValue,
        ...alternateRelease,
        routeFacts: { ...manifestValue.routeFacts, ...alternateRelease },
      },
      "The registered map manifest does not match its catalog record.",
    );
    const alternateCoverage = { start: "2024-01", end: "2026-03" } as const;
    await expectRehashedManifestFailure(
      {
        ...manifestValue,
        coverage: alternateCoverage,
        routeFacts: { ...manifestValue.routeFacts, coverage: alternateCoverage },
      },
      "The registered map manifest does not match its catalog record.",
    );
    await expectRehashedManifestFailure(
      {
        ...manifestValue,
        routeFacts: { ...manifestValue.routeFacts, coverage: alternateCoverage },
      },
      "The registered map manifest has an invalid v2 contract.",
    );
    await expectRehashedManifestFailure(
      { ...manifestValue, status: "fail" },
      "The registered map manifest does not match its catalog record.",
    );
    await expectRehashedManifestFailure(
      { ...manifestValue, baselineMonth: "2026-03" },
      "The registered map manifest has an invalid v2 shape.",
    );
  });

  it("fails closed when no verified map release is cataloged or manifest bytes drift", async () => {
    const emptyDb = new FakeDb({ map_release_catalog: [] });
    const emptyBucket = new FakeR2Bucket({});
    const noRelease = await fetchApi("/api/v1/map/manifest", {
      DB: emptyDb as unknown as D1Database,
      ARTIFACTS: emptyBucket as unknown as R2Bucket,
    });
    expect(noRelease.status).toBe(503);
    expect((await noRelease.json()) as unknown).toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "No verified full map release is registered.",
      },
    });

    const manifestKey = `map/2026-03/manifest.${"a".repeat(64)}.json`;
    const corruptDb = new FakeDb({
      map_release_catalog: [
        {
          release_id: "pub_20260719T123456789Z",
          published_at: "2026-07-19T12:34:56.789Z",
          coverage_start: null,
          coverage_end: "2026-03",
          manifest_key: manifestKey,
          manifest_sha256: "a".repeat(64),
          release_profile: "full",
          verification_status: "pass",
          route_count: 1,
        },
      ],
    });
    const corrupt = await fetchApi("/api/v1/map/manifest", {
      DB: corruptDb as unknown as D1Database,
      ARTIFACTS: new FakeR2Bucket({
        [manifestKey]: new FakeR2Object("{}", "application/json"),
      }) as unknown as R2Bucket,
    });
    expect(corrupt.status).toBe(502);
    expect((await corrupt.json()) as unknown).toEqual({
      error: {
        code: "BAD_GATEWAY",
        message: "The registered map manifest failed integrity verification.",
      },
    });

    const v1Body = JSON.stringify({
      schemaVersion: 1,
      artifactKind: "map_artifact_manifest",
      baselineMonth: "2026-03",
    });
    const v1Sha256 = createHash("sha256").update(v1Body).digest("hex");
    const v1Key = `map/2026-03/manifest.${v1Sha256}.json`;
    const v1 = await fetchApi("/api/v1/map/manifest", {
      DB: new FakeDb({
        map_release_catalog: [
          {
            release_id: "pub_20260719T123456789Z",
            published_at: "2026-07-19T12:34:56.789Z",
            coverage_start: null,
            coverage_end: "2026-03",
            manifest_key: v1Key,
            manifest_sha256: v1Sha256,
            release_profile: "full",
            verification_status: "pass",
            route_count: 1,
          },
        ],
      }) as unknown as D1Database,
      ARTIFACTS: new FakeR2Bucket({
        [v1Key]: new FakeR2Object(v1Body, "application/json"),
      }) as unknown as R2Bucket,
    });
    expect(v1.status).toBe(502);
    expect((await v1.json()) as unknown).toEqual({
      error: {
        code: "BAD_GATEWAY",
        message: "The registered map manifest has an invalid v2 shape.",
      },
    });
  });

  it("serves Studio projection-backed routes", async () => {
    const env = createStudioProjectionEnv();
    const [routesResponse, detailResponse, hourlyProfileResponse, speedHistoryResponse] =
      await Promise.all([
        fetchApi("/api/v1/studio/routes", env),
        fetchApi("/api/v1/studio/routes/m15-sbs", env),
        fetchApi("/api/v1/studio/routes/m15-sbs/hourly-profile", env),
        fetchApi("/api/v1/studio/routes/m15-sbs/speed-history", env),
      ]);

    expect(routesResponse.headers.get("Server-Timing")).toContain("studio;dur=");
    expect(routesResponse.headers.get("X-Studio-Release")).toBe("studio/v1");
    expect(
      decodeStrict(StudioRoutesResponseSchema)(await routesResponse.json()).routes[0]?.slug,
    ).toBe("m15-sbs");
    // C2: the detail response embeds the pipeline-built capability row + dossier summary.
    expect((await detailResponse.json()) as unknown).toEqual(
      expect.objectContaining({
        schemaVersion: 3,
        releaseId: STUDIO_RELEASE_ID,
        publishedAt: STUDIO_PUBLISHED_AT,
        coverage: STUDIO_COVERAGE,
        route: expect.objectContaining({ slug: "m15-sbs" }),
        capability: expect.objectContaining({ overallState: "ready" }),
        dossier: expect.objectContaining({
          routeSlug: "m15-sbs",
          speed: expect.objectContaining({ current: 6.9, movement6mPct: -8, peerPercentile: 12 }),
          worstSegment: expect.objectContaining({ segmentId: "seg-1", persistenceMonths: 3 }),
        }),
        peakWindows: [
          expect.objectContaining({ dayOfWeek: "Tuesday", hourOfDay: 8, ridership: 14_000 }),
        ],
        slowestWindows: [expect.objectContaining({ hourOfDay: 8, weightedAverageSpeedMph: 6.2 })],
        reliabilitySamples: [
          expect.objectContaining({ hourOfDay: 8, averageObservedHeadwayMinutes: 9.5 }),
        ],
      }),
    );
    const hourlyProfile = decodeStrict(StudioRouteHourlyProfileResponseSchema)(
      await hourlyProfileResponse.json(),
    );
    expect(hourlyProfile.routeSlug).toBe("m15-sbs");
    expect(hourlyProfile.hours).toHaveLength(24);
    expect(hourlyProfile.summary.reliabilitySampleCount).toBe(8);
    const speedHistory = decodeStrict(StudioRouteSpeedHistoryResponseSchema)(
      await speedHistoryResponse.json(),
    );
    expect(speedHistory.routeSlug).toBe("m15-sbs");
    expect(speedHistory.summary.cellCount).toBe(8);
    expect(speedHistory.cells.map((cell) => cell.status)).toEqual(["available", "missing"]);
  });

  it("keeps the Tier-1 route dossier response within the 60 KB gzip budget (C2)", async () => {
    // Worst-case-shaped payload: full 36-month sparklines, every capability surface,
    // and far more segments/insights than any real route carries today (real worst
    // case measured 2026-06-10: ~5.3 KB gz across the 12 rich routes).
    const env = createStudioProjectionEnv();
    const response = await fetchApi("/api/v1/studio/routes/m15-sbs", env);
    const detail = decodeStrict(StudioRouteDetailResponseSchema)(await response.json());
    const padded = {
      ...detail,
      segments: Array.from({ length: 60 }, (_, i) => ({
        id: `M15+:2026-03:N:${i}:node-${i}:node-${i + 1}`,
        routeSlug: "m15-sbs",
        direction: "NB",
        from: `Cross street number ${i} with a realistically long name`,
        to: `Cross street number ${i + 1} with a realistically long name`,
        speedMph: 6.5,
        scheduledMph: 8.2,
        riderHours: 1234.5,
        lane: "partial",
        ace: true,
        tsp: false,
        hours: Array.from({ length: 24 }, (_, h) => 5 + (h % 7)),
      })),
      dossier: {
        ...(detail.dossier ?? {}),
        speed: {
          ...(detail.dossier?.speed ?? {}),
          sparkline: Array.from({ length: 36 }, (_, i) => ({
            month: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
            value: 6.123456 + i * 0.01,
          })),
        },
        ridership: {
          ...(detail.dossier?.ridership ?? {}),
          sparkline: Array.from({ length: 36 }, (_, i) => ({
            month: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
            value: 40000 + i * 137,
          })),
        },
      },
    };
    const gzippedBytes = Bun.gzipSync(JSON.stringify(padded)).byteLength;
    expect(gzippedBytes).toBeLessThanOrEqual(60 * 1024);
  });

  it("serves a D1/R2-backed MTA-wiki route evidence bundle from the timeline endpoint", async () => {
    const env = {
      ...createStudioProjectionEnv(),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/routes/m15-sbs/timeline", env);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Studio-Release")).toBe("studio/v1");
    const evidence = decodeStrict(StudioRouteEvidenceBundleSchema)(await response.json());
    expect(evidence.routeId).toBe("M15+");
    expect(evidence.timeline[0]).toEqual(
      expect.objectContaining({
        recordId: "event_m15_sbs_launch",
        citationKeys: ["m15_sbs_report#block-1"],
      }),
    );
    expect(evidence.citations[0]?.sourceTitle).toBe("M15 SBS report");
  });

  it("serves a byte-pinned route-evidence v2 bundle only after exact D1 closure", async () => {
    const artifacts = routeEvidenceV2Artifacts();
    const env = {
      ...createStudioProjectionEnv({
        extraArtifacts: {
          [STUDIO_ROUTE_EVIDENCE_INDEX_KEY]: artifacts.index,
          "studio/v2/wiki/routes/m15-sbs.json": artifacts.bundle,
        },
      }),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const timelineResponse = await fetchApi("/api/v1/studio/routes/m15-sbs/timeline", env);

    expect(timelineResponse.status).toBe(200);
    expect((await timelineResponse.json()) as unknown).toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        routeId: "M15+",
        routeIdentity: expect.objectContaining({ displayLabel: "M15-SBS" }),
      }),
    );
  });

  it("rejects route-evidence v2 when index and bundle agree on a forged D1 presentation", async () => {
    const artifacts = routeEvidenceV2Artifacts({
      forgedPresentation: { displayLabel: "M15 EXPRESS" },
    });
    const env = {
      ...createStudioProjectionEnv({
        extraArtifacts: {
          [STUDIO_ROUTE_EVIDENCE_INDEX_KEY]: artifacts.index,
          "studio/v2/wiki/routes/m15-sbs.json": artifacts.bundle,
        },
      }),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/routes/m15-sbs/timeline", env);

    expect(response.status).toBe(502);
  });

  it("rejects route-evidence v2 when the served object hash differs from its index row", async () => {
    const artifacts = routeEvidenceV2Artifacts({ forgedSha256: "f".repeat(64) });
    const env = {
      ...createStudioProjectionEnv({
        extraArtifacts: {
          [STUDIO_ROUTE_EVIDENCE_INDEX_KEY]: artifacts.index,
          "studio/v2/wiki/routes/m15-sbs.json": artifacts.bundle,
        },
      }),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/routes/m15-sbs/timeline", env);

    expect(response.status).toBe(502);
  });

  it("rejects a re-signed matched route-evidence bundle whose exact Wiki identity set is empty", async () => {
    const artifacts = routeEvidenceV2Artifacts({ wikiRouteIds: [] });
    const env = {
      ...createStudioProjectionEnv({
        extraArtifacts: {
          [STUDIO_ROUTE_EVIDENCE_INDEX_KEY]: artifacts.index,
          "studio/v2/wiki/routes/m15-sbs.json": artifacts.bundle,
        },
      }),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/routes/m15-sbs/timeline", env);

    expect(response.status).toBe(502);
  });

  it("serves a typed empty MTA-wiki route evidence bundle for routes without evidence", async () => {
    const env = {
      ...createStudioProjectionEnv(),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/routes/b99/timeline", env);

    expect(response.status).toBe(200);
    expect(decodeStrict(StudioRouteEvidenceBundleSchema)(await response.json())).toEqual(
      expect.objectContaining({
        routeId: "B99",
        routeSlug: "b99",
        coverage: expect.objectContaining({ citationCount: 0, timelineCount: 0 }),
        citations: [],
        timeline: [],
      }),
    );
  });

  it("hides route artifact keys from malformed artifact errors", async () => {
    const response = await fetchApi("/api/v1/studio/routes/m15-sbs/speed-history", {
      ARTIFACTS: new FakeR2Bucket({
        "studio/v2/routes/m15-sbs/speed-history.json": new FakeR2Object(
          "not json",
          "application/json",
        ),
      }) as unknown as R2Bucket,
    });

    expect(response.status).toBe(502);
    expect((await response.json()) as unknown).toEqual({
      error: {
        code: "BAD_GATEWAY",
        message: "Artifact is not available.",
      },
    });
  });

  it("enriches Studio route detail with frontend-safe route insights", async () => {
    const env = {
      ARTIFACTS: new FakeR2Bucket({
        "studio/v1/routes/m15-sbs/index.json": new FakeR2Object(
          JSON.stringify({
            schemaVersion: 3,
            generatedAt: "2026-06-05T00:00:00.000Z",
            releaseId: STUDIO_RELEASE_ID,
            publishedAt: STUDIO_PUBLISHED_AT,
            coverage: STUDIO_COVERAGE,
            route,
            segments: [],
            artifactRefs: [
              {
                routeId: "M15+",
                month: "2026-03",
                name: "detector_readiness_manifest",
                key: "studio/v2/detectors/route-detector-readiness-manifest.json",
                contentType: "application/json",
                byteLength: 1234,
                sha256: "a".repeat(64),
              },
            ],
            quality,
          }),
          "application/json",
        ),
        "studio/v2/detectors/route-detector-readiness-manifest.json": new FakeR2Object(
          JSON.stringify({
            artifactKind: "detector_readiness_serving_manifest",
            schemaVersion: 1,
            routes: [
              {
                routeId: "M15+",
                publicFindingCandidateRefs: [
                  {
                    detectorId: "customer_journey_shortfall",
                    routeId: "M15+",
                    scopeId: "M15+:2026-04:Peak:SBS",
                    month: "2026-04",
                    asOfMonth: "2026-04",
                    bucket: "public_finding_candidate",
                    evidenceRefPath: "cjtp.json#scope:m15-peak",
                    sourceProjectionPath: "cjtp.json",
                    caveats: ["true_customer_impact", "wait_component_driven"],
                  },
                  {
                    detectorId: "treatment_scope_gap",
                    routeId: "M15+",
                    scopeId: "M15+:2026-03:N:1:stop-a:stop-b",
                    month: "2026-03",
                    asOfMonth: null,
                    bucket: "public_finding_candidate",
                    evidenceRefPath: "treatment.json#scope:m15-gap",
                    sourceProjectionPath: "treatment.json",
                    caveats: ["fit_status:true_uncovered", "genuine_slowness"],
                  },
                ],
                routeContextRefs: [],
                reviewQueueCounts: { customer_journey_shortfall: 2 },
                suppressedCounts: { customer_journey_shortfall: 1 },
              },
            ],
          }),
          "application/json",
        ),
      }) as unknown as R2Bucket,
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    } satisfies StudioApiEnv;

    const response = await fetchApi("/api/v1/studio/routes/m15-sbs", env);
    const detail = decodeStrict(StudioRouteDetailResponseSchema)(await response.json());

    expect(detail.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "customer_journey",
          placement: "overview",
          title: "Customer journey shortfall",
          shortText:
            "Customer journey shortfall appears in peak service, mainly on the wait-time side.",
        }),
        expect.objectContaining({
          kind: "treatment_scope",
          placement: "map_segment",
          title: "Possible treatment coverage gap",
          shortText: "This slow segment appears outside the confirmed treatment coverage.",
        }),
      ]),
    );
    expect(JSON.stringify(detail.insights)).not.toContain("reviewQueueCounts");
    expect(JSON.stringify(detail.insights)).not.toContain("suppressedCounts");
    expect(JSON.stringify(detail.insights)).not.toContain("reviewed signals");
    expect(detail.equityContext).toEqual(
      expect.objectContaining({
        acsYear: 2024,
        assignedCountyName: "New York County",
        noVehicleHouseholdShare: 0.7692,
        medianHouseholdIncome: 98000,
        povertyRate: 15.4,
        publicTransitCommuterShare: 58.2,
      }),
    );
  });

  it("does not load a sibling service identity mispackaged under the exact route slug", async () => {
    const bx12Route = {
      ...route,
      slug: "bx12-sbs",
      routeId: "BX12+",
      label: "Bx12",
      corridor: "Bay Plaza - Inwood",
      corridorFull: "Bay Plaza - Inwood",
      borough: "Bronx",
      sbs: true,
    } as const;
    const richSegmentId = "BX12+:2026-03:W:1:802025:103255";
    const targetSegmentId = "BX12:2026-03:W:19:103999:104235";
    const env = {
      ARTIFACTS: new FakeR2Bucket({
        "studio/v1/routes/bx12/index.json": new FakeR2Object(
          JSON.stringify({
            schemaVersion: 3,
            generatedAt: "2026-06-05T00:00:00.000Z",
            releaseId: STUDIO_RELEASE_ID,
            publishedAt: STUDIO_PUBLISHED_AT,
            coverage: STUDIO_COVERAGE,
            route: bx12Route,
            segments: [
              {
                id: richSegmentId,
                routeSlug: "bx12-sbs",
                direction: "WB",
                from: "Fixture start",
                to: "Fixture end",
                speedMph: 6.4,
                scheduledMph: 8.7,
                riderHours: 14,
                lane: "yes",
                ace: false,
                tsp: false,
                hours: Array.from({ length: 24 }, () => 0),
              },
            ],
            artifactRefs: [],
            quality,
          }),
          "application/json",
        ),
        "studio/v2/routes/bx12/speed-spine.json": new FakeR2Object(
          JSON.stringify({
            artifactKind: "bp.route_speed_spine.v1",
            routeId: "BX12",
            routeSlug: "bx12",
            segments: [
              {
                segmentId: "bx12-w-node-005-node-007",
                direction: "W",
                displayOrder: 19,
                label: "E FORDHAM RD/WEBSTERAV to E FORDHAM RD/VALENTINE AV",
                averageRoadDistanceMiles: 0.42,
                averageSpeedMph: 5.9,
                raw: {
                  sourceStopPairs: [
                    {
                      fromStopId: "103999",
                      fromStopName: "E FORDHAM RD/WEBSTERAV",
                      toStopId: "104235",
                      toStopName: "E FORDHAM RD/VALENTINE AV",
                      stopOrders: [19],
                    },
                  ],
                },
              },
            ],
          }),
          "application/json",
        ),
        "studio/v2/detectors/route-detector-readiness-manifest.json": new FakeR2Object(
          JSON.stringify({
            artifactKind: "detector_readiness_serving_manifest",
            schemaVersion: 1,
            routes: [
              {
                routeId: "BX12",
                publicFindingCandidateRefs: [
                  {
                    detectorId: "treatment_scope_mismatch",
                    routeId: "BX12",
                    scopeId: targetSegmentId,
                    month: "2026-03",
                    asOfMonth: null,
                    bucket: "public_finding_candidate",
                    caveats: ["mismatch_overlap_confirmed"],
                  },
                ],
                routeContextRefs: [],
              },
            ],
          }),
          "application/json",
        ),
      }) as unknown as R2Bucket,
      DB: new FakeDb({
        exact_route_identity_release: [
          exactRouteIdentityReleaseFixture({
            exactRouteCount: 1,
            routeTypeCount: 1,
            tripTypeCount: 1,
            coverageStart: null,
          }),
        ],
        route_artifact: [
          {
            route_id: "BX12",
            month: "2026-03",
            artifact_name: "brief.json",
          },
        ],
        route_brief_summary: [
          {
            route_id: "BX12",
            month: "2026-03",
            public_visible: true,
            public_visibility_reason: "public",
            route_score: 32,
            average_speed_mph: 8.6,
            hotspot_count: 10,
            total_ridership: 4000,
            total_transfers: 0,
            ace_active: false,
            ace_violation_count: 0,
            bus_lane_matched_lane_count: 8,
            schedule_match_rate: 0.98,
          },
        ],
        route_catalog: [
          {
            route_id: "BX12",
            route_short_name: "Bx12",
            route_long_name: "Bay Plaza - Inwood",
            shape_count: 2,
            stop_count: 58,
            timepoint_stop_count: 12,
          },
        ],
        route_catalog_type: [
          {
            route_id: "BX12",
            type_rank: 1,
            route_type: "SBS",
          },
        ],
        route_catalog_trip_type: [
          {
            route_id: "BX12",
            trip_type_rank: 1,
            trip_type: "14",
          },
        ],
        route_month_trend: [],
        route_speed_history_coverage: [],
        route_timeline_index: [],
        source_month_coverage: [],
        route_observed_reliability_summary: [],
        route_readiness: [
          {
            route_id: "BX12",
            month: "2026-03",
            readiness_status: "ready",
            build_eligible: true,
            readiness_score: 100,
            speed_observation_count: 4000,
            speed_bus_trip_count: 70000,
            average_speed_mph: 8.6,
            schedule_timepoint_count: 12,
            shape_count: 2,
            stop_count: 58,
            timepoint_stop_count: 12,
          },
        ],
      }) as unknown as D1Database,
    } satisfies StudioApiEnv;

    const response = await fetchApi("/api/v1/studio/routes/bx12", env);
    const detail = decodeStrict(StudioRouteDetailResponseSchema)(await response.json());

    expect(detail.route.routeId).toBe("BX12");
    expect(detail.route.slug).toBe("bx12");
    expect(detail.segments.map((segment) => segment.id)).toEqual([targetSegmentId]);
    expect(detail.segments.map((segment) => segment.id)).not.toContain(richSegmentId);
    expect(detail.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scopeId: targetSegmentId,
          target: expect.objectContaining({
            segmentIds: expect.arrayContaining([targetSegmentId]),
          }),
        }),
      ]),
    );
    expect(detail.quality.caveats).not.toContain(
      "Segment rows are loaded from an equivalent base/SBS route artifact so detector segment refs can attach deterministically.",
    );
    expect(detail.quality.caveats).toContain(
      "Some detector insight segment rows are aligned from the route speed-spine provenance so detector refs attach to visible route rows.",
    );
  });

  it("serves a D1-backed Studio route index v2 from the full catalog", async () => {
    const db = new FakeDb({
      route_artifact: [
        {
          route_id: "M15+",
          month: "2026-03",
          artifact_name: "brief.json",
        },
      ],
      route_brief_summary: [
        {
          route_id: "M15+",
          month: "2026-03",
          public_visible: true,
          route_score: 24,
          average_speed_mph: 7.2,
          hotspot_count: 4,
          total_ridership: 900000,
          ace_active: true,
          bus_lane_matched_lane_count: 8,
        },
        {
          route_id: "B99",
          month: "2026-03",
          public_visible: false,
          route_score: 72,
          average_speed_mph: 11.1,
          hotspot_count: 0,
          total_ridership: 0,
          ace_active: false,
          bus_lane_matched_lane_count: 0,
        },
      ],
      route_catalog: [
        {
          route_id: "M15+",
          route_short_name: "M15-SBS",
          route_long_name: "East Harlem - South Ferry",
          shape_count: 2,
          stop_count: 42,
          timepoint_stop_count: 12,
        },
        {
          route_id: "B99",
          route_short_name: "B99",
          route_long_name: "Late Night Shuttle",
          shape_count: 1,
          stop_count: 10,
          timepoint_stop_count: 4,
        },
      ],
      route_catalog_type: [
        {
          route_id: "M15+",
          type_rank: 1,
          route_type: "Select Bus Service",
        },
        {
          route_id: "B99",
          type_rank: 1,
          route_type: "Local",
        },
      ],
      route_month_trend: [
        {
          route_id: "M15+",
          month: "2023-04",
          average_speed_mph: 7.1,
          ridership: 880000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2026-03",
          average_speed_mph: 7.2,
          ridership: 900000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "B99",
          month: "2026-03",
          average_speed_mph: null,
          ridership: null,
          has_speed_trend: false,
          has_ridership_trend: false,
        },
      ],
      route_speed_history_coverage: [
        {
          route_id: "M15+",
          month: "2026-03",
          route_slug: "m15-sbs",
          history_start_month: "2023-04",
          history_end_month: "2026-03",
          artifact_path: "studio/v2/routes/m15-sbs/speed-history.json",
          artifact_status: "written",
          month_count: 36,
          segment_count: 12,
          cell_count: 1728,
          available_cell_count: 1712,
          missing_cell_count: 16,
          generated_at: "2026-06-06T00:00:00.000Z",
        },
      ],
      route_readiness: [
        {
          route_id: "M15+",
          month: "2026-03",
          readiness_status: "ready",
          build_eligible: true,
          readiness_score: 100,
          speed_observation_count: 4000,
          speed_bus_trip_count: 70000,
          average_speed_mph: 7.2,
          schedule_timepoint_count: 12,
          shape_count: 2,
          stop_count: 42,
          timepoint_stop_count: 12,
        },
        {
          route_id: "B99",
          month: "2026-03",
          readiness_status: "partial",
          build_eligible: false,
          readiness_score: 60,
          speed_observation_count: 0,
          speed_bus_trip_count: 0,
          average_speed_mph: null,
          schedule_timepoint_count: 4,
          shape_count: 1,
          stop_count: 10,
          timepoint_stop_count: 4,
        },
      ],
    });

    const response = await fetchApi("/api/v1/studio/routes?schema=2", {
      ARTIFACTS: new FakeR2Bucket({
        [CAPABILITY_MANIFEST_KEY]: capabilityManifestArtifact(STANDARD_ROUTE_CAPABILITIES),
      }) as unknown as R2Bucket,
      DB: db as unknown as D1Database,
    });

    expect(response.status).toBe(200);
    const index = decodeStrict(StudioRouteIndex2ResponseSchema)(await response.json());
    expect(index.routes.map((route) => route.routeId)).toEqual(["M15+", "B99"]);
    const richRoute = index.routes.find((route) => route.routeId === "M15+");
    // Capability is joined from the pipeline manifest, not computed in the Worker.
    expect(richRoute?.capability.overallState).toBe("ready");
    expect(richRoute?.capability.surfaces["speedHistory"]?.state).toBe("partial");
    const sparse = index.routes.find((route) => route.routeId === "B99");
    expect(sparse?.capability.overallState).toBe("building");
    expect(sparse?.capability.surfaces["detectorFindings"]?.state).toBe("insufficient_data");
    expect(sparse?.caveats).toContain(
      "A serving summary exists, but the rich public artifact gate is not satisfied.",
    );
  });
  it("rejects unknown Studio route-index schema versions", async () => {
    const response = await fetchApi("/api/v1/studio/routes?schema=4", {});

    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Unsupported Studio route-index schema version: 4",
      },
    });
  });
  it("serves strict exact route identity in the D1-backed route index v3", async () => {
    const response = await fetchApi("/api/v1/studio/routes?schema=3", {
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    });

    expect(response.status).toBe(200);
    const index = decodeStrict(StudioRouteIndex3ResponseSchema)(await response.json());
    expect(index.schemaVersion).toBe(3);
    expect(index.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          routeSchemaVersion: 2,
          routeId: "M15+",
          routeFamilyId: "M15",
          slug: "m15-sbs",
          label: "M15-SBS",
          displayLabel: "M15-SBS",
          officialLongName: "East Harlem - South Ferry",
          designationLiterals: ["route_type:SBS", "trip_type:14"],
          serviceModes: ["sbs"],
          routeTypes: ["SBS"],
          tripTypes: ["14"],
        }),
        expect.objectContaining({
          routeSchemaVersion: 2,
          routeId: "B99",
          routeFamilyId: "B99",
          slug: "b99",
          label: "B99",
          displayLabel: "B99",
          designationLiterals: ["route_type:Local", "trip_type:1"],
          serviceModes: ["local"],
          routeTypes: ["Local"],
          tripTypes: ["1"],
        }),
      ]),
    );
  });

  it("projects candidate exact identity through a distinct pointed release envelope", async () => {
    const pointedRelease = {
      releaseId: "pub_20260801T232501631Z",
      publishedAt: "2026-08-01T23:25:01.631Z",
    } as const;
    const response = await fetchApi("/api/v1/studio/routes?schema=3", {
      DB: createSparseStudioRouteDb() as unknown as D1Database,
      SERVING_RELEASE_CONTEXT: {
        kind: "pointed",
        generation: 2,
        release: {
          schemaVersion: 1,
          ...pointedRelease,
          candidateId: "a".repeat(64),
          activatedAt: pointedRelease.publishedAt,
        },
        candidate: {
          datasets: [
            {
              datasetId: "reviewed-serving",
              grain: "month",
              coverage: STUDIO_COVERAGE,
              sourceSnapshotIds: [],
            },
            {
              datasetId: "ace-violations",
              grain: "month",
              coverage: { start: null, end: "2026-07" },
              sourceSnapshotIds: ["ace-2026-07"],
            },
          ],
          artifacts: [],
        },
        artifactByLogicalId: new Map(),
      } as unknown as NonNullable<StudioApiEnv["SERVING_RELEASE_CONTEXT"]>,
    });

    expect(response.status).toBe(200);
    expect(decodeStrict(StudioRouteIndex3ResponseSchema)(await response.json())).toEqual(
      expect.objectContaining({
        ...pointedRelease,
        coverage: STUDIO_COVERAGE,
      }),
    );
  });

  it("keeps schema v2 available while exact schema v3 fails closed without its registry", async () => {
    const db = createSparseStudioRouteDb({ exactRouteIdentityReleases: [] });
    const [legacy, exact] = await Promise.all([
      fetchApi("/api/v1/studio/routes?schema=2", { DB: db as unknown as D1Database }),
      fetchApi("/api/v1/studio/routes?schema=3", { DB: db as unknown as D1Database }),
    ]);
    expect(legacy.status).toBe(200);
    expect(exact.status).toBe(503);
    expect((await exact.json()) as unknown).toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Exact route identity serving data is unavailable.",
      },
    });
  });

  it("excludes unresolved legacy catalog routes from exact index and detail addressability", async () => {
    const db = createSparseStudioRouteDb({
      tripTypes: [{ route_id: "M15+", trip_type_rank: 1, trip_type: "14" }],
      exactRouteIdentityReleases: [
        exactRouteIdentityReleaseFixture({
          exactRouteCount: 1,
          routeTypeCount: 1,
          tripTypeCount: 1,
        }),
      ],
    });
    const [legacyResponse, exactResponse, unresolvedDetail] = await Promise.all([
      fetchApi("/api/v1/studio/routes?schema=2", { DB: db as unknown as D1Database }),
      fetchApi("/api/v1/studio/routes?schema=3", { DB: db as unknown as D1Database }),
      fetchApi("/api/v1/studio/routes/b99", { DB: db as unknown as D1Database }),
    ]);
    const legacy = decodeStrict(StudioRouteIndex2ResponseSchema)(await legacyResponse.json());
    const exact = decodeStrict(StudioRouteIndex3ResponseSchema)(await exactResponse.json());
    expect(legacy.routes.map((route) => route.routeId)).toEqual(["M15+", "B99"]);
    expect(exact.routes.map((route) => route.routeId)).toEqual(["M15+"]);
    expect(unresolvedDetail.status).toBe(404);
  });

  it("rejects a registry whose counts do not match the exact D1 projection", async () => {
    const response = await fetchApi("/api/v1/studio/routes?schema=3", {
      DB: createSparseStudioRouteDb({
        tripTypes: [{ route_id: "M15+", trip_type_rank: 1, trip_type: "14" }],
      }) as unknown as D1Database,
    });
    expect(response.status).toBe(503);
  });

  it("fails Studio D1 reads closed without passing publication metadata", async () => {
    const routeSummary = {
      route_id: "M15+",
      month: "2026-03",
      public_visible: true,
      route_score: 24,
      average_speed_mph: 7.2,
      hotspot_count: 4,
      total_ridership: 900000,
      ace_active: true,
      bus_lane_matched_lane_count: 8,
    };
    const absent = await fetchApi("/api/v1/studio/routes?schema=3", {
      DB: new FakeDb({
        route_brief_summary: [routeSummary],
        route_batch_status: [],
      }) as unknown as D1Database,
    });
    const failed = await fetchApi("/api/v1/studio/routes?schema=3", {
      DB: new FakeDb({
        route_brief_summary: [routeSummary],
        route_batch_status: [
          {
            month: "2026-03",
            generated_at: STUDIO_PUBLISHED_AT,
            status: "fail",
          },
        ],
      }) as unknown as D1Database,
    });

    for (const response of [absent, failed]) {
      expect(response.status).toBe(503);
      expect((await response.json()) as unknown).toEqual({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "No published serving data is available.",
        },
      });
    }
  });

  it("recomputes capability freshness against request time", async () => {
    const response = await fetchApi("/api/v1/studio/routes?schema=3", {
      ARTIFACTS: new FakeR2Bucket({
        [CAPABILITY_MANIFEST_KEY]: capabilityManifestArtifact([
          {
            routeId: "M15+",
            overallState: "ready",
            surfaces: {
              condition: {
                state: "ready",
                reason: null,
                depth: null,
                dataAsOf: "2000-01",
                freshness: "current",
              },
            },
          },
        ]),
      }) as unknown as R2Bucket,
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    });

    const index = decodeStrict(StudioRouteIndex3ResponseSchema)(await response.json());
    expect(
      index.routes.find((route) => route.routeId === "M15+")?.capability.surfaces["condition"]
        ?.freshness,
    ).toBe("stale");
  });

  it("serves Snapshot 2.0 route sections from deterministic D1 route facts", async () => {
    const db = new FakeDb({
      route_artifact: [
        {
          route_id: "M15+",
          month: "2026-03",
          artifact_name: "brief.json",
        },
      ],
      route_brief_summary: [
        {
          route_id: "M15+",
          month: "2026-03",
          public_visible: true,
          public_visibility_reason: "public",
          route_score: 24,
          average_speed_mph: 7.2,
          hotspot_count: 4,
          total_ridership: 900000,
          total_transfers: 10000,
          ace_active: true,
          ace_violation_count: 10,
          bus_lane_matched_lane_count: 8,
          schedule_match_rate: 0.98,
        },
        {
          route_id: "Q1",
          month: "2026-03",
          public_visible: true,
          public_visibility_reason: "public",
          route_score: 35,
          average_speed_mph: 6.5,
          hotspot_count: 6,
          total_ridership: 600000,
          total_transfers: 5000,
          ace_active: false,
          ace_violation_count: 0,
          bus_lane_matched_lane_count: 0,
          schedule_match_rate: 0.74,
        },
        {
          route_id: "B99",
          month: "2026-03",
          public_visible: false,
          public_visibility_reason: "no_rich_artifact",
          route_score: 72,
          average_speed_mph: 11.1,
          hotspot_count: 0,
          total_ridership: 0,
          total_transfers: 0,
          ace_active: false,
          ace_violation_count: 0,
          bus_lane_matched_lane_count: 0,
          schedule_match_rate: 0.6,
        },
      ],
      route_catalog: [
        {
          route_id: "M15+",
          route_short_name: "M15-SBS",
          route_long_name: "East Harlem - South Ferry",
          shape_count: 2,
          stop_count: 42,
          timepoint_stop_count: 12,
        },
        {
          route_id: "Q1",
          route_short_name: "Q1",
          route_long_name: "Queens Village - Jamaica",
          shape_count: 1,
          stop_count: 28,
          timepoint_stop_count: 8,
        },
        {
          route_id: "B99",
          route_short_name: "B99",
          route_long_name: "Late Night Shuttle",
          shape_count: 1,
          stop_count: 10,
          timepoint_stop_count: 4,
        },
      ],
      route_catalog_type: [
        {
          route_id: "M15+",
          type_rank: 1,
          route_type: "Select Bus Service",
        },
        {
          route_id: "Q1",
          type_rank: 1,
          route_type: "Local",
        },
        {
          route_id: "B99",
          type_rank: 1,
          route_type: "Local",
        },
      ],
      route_month_trend: [
        {
          route_id: "M15+",
          month: "2023-04",
          average_speed_mph: 8.2,
          ridership: 820000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2023-05",
          average_speed_mph: 8.1,
          ridership: 830000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2023-06",
          average_speed_mph: 8,
          ridership: 840000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2023-07",
          average_speed_mph: 7.9,
          ridership: 850000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2023-08",
          average_speed_mph: 7.8,
          ridership: 860000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2025-03",
          average_speed_mph: 7.6,
          ridership: 880000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2025-09",
          average_speed_mph: 7.5,
          ridership: 890000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2026-03",
          average_speed_mph: 7.2,
          ridership: 900000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "Q1",
          month: "2023-04",
          average_speed_mph: 6.7,
          ridership: 560000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "Q1",
          month: "2026-03",
          average_speed_mph: 6.5,
          ridership: 600000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "B99",
          month: "2026-03",
          average_speed_mph: null,
          ridership: null,
          has_speed_trend: false,
          has_ridership_trend: false,
        },
      ],
      route_speed_history_coverage: [
        {
          route_id: "M15+",
          month: "2026-03",
          route_slug: "m15-sbs",
          history_start_month: "2023-04",
          history_end_month: "2026-03",
          artifact_path: "studio/v2/routes/m15-sbs/speed-history.json",
          artifact_status: "written",
          month_count: 36,
          segment_count: 12,
          cell_count: 1728,
          available_cell_count: 1712,
          missing_cell_count: 16,
          generated_at: "2026-06-06T00:00:00.000Z",
        },
      ],
      route_readiness: [
        {
          route_id: "M15+",
          month: "2026-03",
          readiness_status: "ready",
          build_eligible: true,
          readiness_score: 100,
          speed_observation_count: 4000,
          speed_bus_trip_count: 70000,
          average_speed_mph: 7.2,
          schedule_timepoint_count: 12,
          shape_count: 2,
          stop_count: 42,
          timepoint_stop_count: 12,
        },
        {
          route_id: "Q1",
          month: "2026-03",
          readiness_status: "partial",
          build_eligible: true,
          readiness_score: 78,
          speed_observation_count: 2200,
          speed_bus_trip_count: 32000,
          average_speed_mph: 6.5,
          schedule_timepoint_count: 0,
          shape_count: 1,
          stop_count: 28,
          timepoint_stop_count: 8,
        },
        {
          route_id: "B99",
          month: "2026-03",
          readiness_status: "partial",
          build_eligible: false,
          readiness_score: 60,
          speed_observation_count: 0,
          speed_bus_trip_count: 0,
          average_speed_mph: null,
          schedule_timepoint_count: 4,
          shape_count: 1,
          stop_count: 10,
          timepoint_stop_count: 4,
        },
      ],
    });

    const response = await fetchApi("/api/v1/studio/routes/sections", {
      ARTIFACTS: new FakeR2Bucket({
        [CAPABILITY_MANIFEST_KEY]: capabilityManifestArtifact(STANDARD_ROUTE_CAPABILITIES),
      }) as unknown as R2Bucket,
      DB: db as unknown as D1Database,
    });

    expect(response.status).toBe(200);
    const routeSections = decodeStrict(StudioRouteSectionsResponseSchema)(await response.json());
    // C3: months are resolved internally from D1, and rankings declare their freshness.
    expect(routeSections.coverage).toEqual(decodeStrict(CoverageWindowSchema)(STUDIO_COVERAGE));
    expect(routeSections.releaseId).toBe(STUDIO_RELEASE_ID);
    expect(routeSections.publishedAt).toBe(STUDIO_PUBLISHED_AT);
    expect(routeSections.dataAsOf).toBe("2026-03");
    expect(routeSections.sections.map((section) => section.sectionId)).toEqual([
      "needs_attention",
      "worsening_fast",
      "treatment_gaps",
      "data_coverage",
      "reliability_watch",
      "evidence_ready",
    ]);

    const sections = new Map(routeSections.sections.map((section) => [section.sectionId, section]));
    expect(sections.get("needs_attention")).toEqual(
      expect.objectContaining({
        status: "available",
        rows: expect.arrayContaining([
          expect.objectContaining({ rank: 1, routeId: "M15+", slug: "m15-sbs" }),
        ]),
      }),
    );
    expect(sections.get("worsening_fast")).toEqual(
      expect.objectContaining({
        status: "partial",
        rows: expect.arrayContaining([
          expect.objectContaining({
            routeId: "M15+",
            reasons: expect.arrayContaining(["-1.0 mph from 2023-04 to 2026-03"]),
            // §16-D3: every section row carries 6-month movement + 12-month context.
            movement6mPct: expect.any(Number),
            context12mPct: expect.any(Number),
          }),
        ]),
      }),
    );
    expect(sections.get("treatment_gaps")).toEqual(
      expect.objectContaining({
        status: "partial",
        rows: expect.arrayContaining([
          expect.objectContaining({
            routeId: "Q1",
            reasons: expect.arrayContaining(["No ACE or bus-lane match in summary"]),
          }),
        ]),
      }),
    );
    expect(sections.get("data_coverage")).toEqual(
      expect.objectContaining({
        status: "available",
        rows: expect.arrayContaining([
          expect.objectContaining({
            routeId: "B99",
            reasons: expect.arrayContaining([
              "detector findings insufficient_data",
              "speed history insufficient_data",
              "ridership history insufficient_data",
            ]),
          }),
        ]),
      }),
    );
    expect(sections.get("reliability_watch")).toEqual(
      expect.objectContaining({
        status: "not_built",
        rows: [],
        notBuiltReason: expect.any(String),
      }),
    );
    expect(sections.get("evidence_ready")).toEqual(
      expect.objectContaining({
        status: "not_built",
        rows: [],
        notBuiltReason: expect.any(String),
      }),
    );
  });

  it("promotes Evidence Ready route sections when the MTA-wiki route evidence index is published", async () => {
    const env = {
      ARTIFACTS: new FakeR2Bucket({
        [STUDIO_ROUTE_EVIDENCE_INDEX_KEY]: routeEvidenceIndexArtifact(),
      }) as unknown as R2Bucket,
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/routes/sections", env);

    expect(response.status).toBe(200);
    const routeSections = decodeStrict(StudioRouteSectionsResponseSchema)(await response.json());
    const evidenceReady = routeSections.sections.find(
      (section) => section.sectionId === "evidence_ready",
    );
    expect(evidenceReady).toEqual(
      expect.objectContaining({
        status: "partial",
        notBuiltReason: null,
        rows: expect.arrayContaining([
          expect.objectContaining({
            routeId: "M15+",
            slug: "m15-sbs",
            supportLevel: "evidence_ready",
            reasons: expect.arrayContaining([
              "35 cited evidence references",
              "45 wiki evidence rows",
              "Canonical wiki route anchor published",
            ]),
            metrics: expect.arrayContaining([
              expect.objectContaining({ id: "wiki_citations", value: 35 }),
              expect.objectContaining({ id: "wiki_timeline_events", value: 8 }),
            ]),
          }),
          expect.objectContaining({
            routeId: "B99",
            slug: "b99",
            supportLevel: "evidence_ready",
          }),
        ]),
      }),
    );
    expect(routeSections.quality.caveats).toContain(
      "Reliability Watch is not_built; Evidence Ready is derived from the published MTA-wiki route evidence index.",
    );
  });

  it("resolves sparse catalog routes through list, detail, and history", async () => {
    const env = {
      ...createStudioProjectionEnv(),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const [routesResponse, detailResponse, historyResponse] = await Promise.all([
      fetchApi("/api/v1/studio/routes", env),
      fetchApi("/api/v1/studio/routes/b99", env),
      fetchApi("/api/v1/studio/routes/b99/history", env),
    ]);

    expect(routesResponse.status).toBe(200);
    const routes = decodeStrict(StudioRoutesResponseSchema)(await routesResponse.json());
    expect(routes.routes.map((candidate) => candidate.slug)).toEqual(["m15-sbs", "b99"]);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "m15-sbs",
          routeSchemaVersion: 2,
          routeId: "M15+",
          routeFamilyId: "M15",
          displayLabel: "M15-SBS",
          officialLongName: "East Harlem - South Ferry",
          designationLiterals: ["route_type:SBS", "trip_type:14"],
          serviceModes: ["sbs"],
          routeTypes: ["SBS"],
          tripTypes: ["14"],
          sbs: true,
          scheduledMph: null,
          speedPercentile: 1,
          ridersYoyPct: null,
          riderHoursLost: null,
          aceSince: null,
          spark: null,
          miles: null,
          interventions: [],
        }),
        expect.objectContaining({
          slug: "b99",
          routeSchemaVersion: 2,
          routeId: "B99",
          routeFamilyId: "B99",
          displayLabel: "B99",
          designationLiterals: ["route_type:Local", "trip_type:1"],
          serviceModes: ["local"],
          tripTypes: ["1"],
          scheduledMph: null,
          speedPercentile: 99,
          ridersYoyPct: null,
          riderHoursLost: null,
          aceSince: null,
          spark: null,
          miles: null,
          interventions: [],
        }),
      ]),
    );
    expect(routes.routes.find((candidate) => candidate.slug === "b99")?.flags).toContain(
      "No rich artifact",
    );

    expect(detailResponse.status).toBe(200);
    const detail = decodeStrict(StudioRouteDetailResponseSchema)(await detailResponse.json());
    expect(detail.route.slug).toBe("b99");
    expect(detail.route.speedPercentile).toBeNull();
    expect(detail.equityContext).toBeNull();
    expect(detail.segments).toEqual([]);
    expect(detail.artifactRefs).toEqual([]);
    expect(detail.quality.caveats).toContain(
      "This is a partial route detail built from the all-route index; rich map, segment, finding, and evidence sections may be unavailable.",
    );

    expect(historyResponse.status).toBe(200);
    const history = decodeStrict(StudioRouteHistoryResponseSchema)(await historyResponse.json());
    expect(history.route.slug).toBe("b99");
    expect(history.points).toHaveLength(1);
    expect(history.coverage).toEqual({
      startMonth: "2026-03",
      endMonth: "2026-03",
      pointCount: 1,
      speedMonthCount: 0,
      ridershipMonthCount: 0,
    });
  });

  it("joins public intervention annotations onto D1 cards by exact route ID", async () => {
    const publishedIntervention = {
      eventId: "event:m15-ace",
      interventionType: "automated_bus_lane_enforcement",
      year: "2024",
      title: "ACE enforcement begins",
      detail: "Approved public treatment record.",
      sourceLabel: "MTA Wiki",
    } as const;
    const env = {
      ...createStudioProjectionEnv({
        extraArtifacts: {
          "studio/v1/routes.json": new FakeR2Object(
            JSON.stringify({ routes: [{ ...route, interventions: [publishedIntervention] }] }),
            "application/json",
          ),
        },
      }),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/routes", env);

    expect(response.status).toBe(200);
    const routes = decodeStrict(StudioRoutesResponseSchema)(await response.json()).routes;
    expect(routes.find((candidate) => candidate.routeId === "M15+")?.interventions).toEqual([
      publishedIntervention,
    ]);
    expect(routes.find((candidate) => candidate.routeId === "B99")?.interventions).toEqual([]);
  });

  it("keeps D1 route cards available when the optional intervention projection is invalid", async () => {
    const env = {
      ...createStudioProjectionEnv({
        extraArtifacts: {
          "studio/v1/routes.json": new FakeR2Object("{not-json", "application/json"),
        },
      }),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/routes", env);

    expect(response.status).toBe(200);
    const routes = decodeStrict(StudioRoutesResponseSchema)(await response.json()).routes;
    expect(routes).toHaveLength(2);
    expect(routes.every((candidate) => candidate.interventions.length === 0)).toBe(true);
  });

  it("keeps Snapshot 2.0 addressability endpoints mutually consistent", async () => {
    const env = {
      ...createStudioProjectionEnv(),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const [snapshotResponse, routeIndexResponse, routesResponse] = await Promise.all([
      fetchApi("/api/v1/studio/snapshot", env),
      fetchApi("/api/v1/studio/routes?schema=3", env),
      fetchApi("/api/v1/studio/routes", env),
    ]);

    const snapshot = decodeStrict(StudioSnapshotResponseSchema)(await snapshotResponse.json());
    const routeIndex = decodeStrict(StudioRouteIndex3ResponseSchema)(
      await routeIndexResponse.json(),
    );
    const routes = decodeStrict(StudioRoutesResponseSchema)(await routesResponse.json());
    const snapshot2 = snapshot.v2;

    expect(snapshot2).toBeDefined();
    expect(snapshot2?.routeUniverse).toEqual(
      expect.objectContaining({
        source: "route_catalog",
        indexedRouteCount: routeIndex.routes.length,
        routeCount: routeIndex.routes.length,
      }),
    );
    expect(snapshot2?.counts.routeIndexRows).toBe(routeIndex.routes.length);
    expect(snapshot2?.counts.routeHistoryRows).toBe(
      routeIndex.routes.reduce((sum, route) => sum + route.historyCoverage.pointCount, 0),
    );
    expect(snapshot2?.counts.routeSpeedHistoryCoverageRows).toBe(1);
    expect(snapshot2?.counts.sourceMonthCoverageRows).toBe(2);
    expect(snapshot2?.sourceMonths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "local_route_schedule_stop_source_year",
          status: "partial",
          routeCount: 375,
          grain: "source year x route x schedule stop",
        }),
        expect.objectContaining({
          sourceId: "detector_model_artifact_status",
          status: "available",
          rowCount: 2,
          grain: "model_artifact_status",
          producerCommand: "evaluate detectors",
        }),
      ]),
    );
    expect(snapshot2?.projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "route_index",
          path: "/api/v1/studio/routes?schema=3",
          schemaVersion: 3,
          status: "available",
        }),
        expect.objectContaining({
          id: "route_history_summary",
          path: "/api/v1/studio/routes/:routeId/history",
          status: "available",
        }),
        expect.objectContaining({
          id: "route_speed_history",
          path: "/api/v1/studio/routes/:routeId/speed-history",
          status: "partial",
        }),
        expect.objectContaining({
          id: "source_month_coverage",
          path: "d1:source_month_coverage",
          status: "available",
        }),
        expect.objectContaining({
          id: "detector_model_status",
          path: "studio/v2/detectors/model-artifacts.json",
          status: "partial",
          storage: "r2",
          months: expect.objectContaining({ start: "2023-04", end: "2026-03" }),
        }),
      ]),
    );
    expect(snapshot2?.caveats).toContain(
      "Detector model status is published as a compact R2 projection; raw model rows remain internal.",
    );

    const routeIndexSlugs = routeIndex.routes.map((route) => route.slug);
    expect(routes.routes.map((route) => route.slug)).toEqual(routeIndexSlugs);
    expect(uniqueValues(routeIndex.routes.map((route) => route.routeId))).toHaveLength(
      routeIndex.routes.length,
    );
    expect(uniqueValues(routeIndexSlugs)).toHaveLength(routeIndex.routes.length);

    const sparseRoute = routeIndex.routes.find(
      (route) => route.capability.overallState === "building",
    );
    if (sparseRoute === undefined) {
      throw new Error("Expected fixture to include a sparse Snapshot 2.0 route.");
    }
    expect(sparseRoute.slug).toBe("b99");
    expect(sparseRoute.capability.surfaces["detectorFindings"]?.state).toBe("insufficient_data");

    const historyRoute = routeIndex.routes.find(
      (route) => route.historyCoverage.speedMonthCount > 0,
    );
    if (historyRoute === undefined) {
      throw new Error("Expected fixture to include a route with speed history.");
    }
    expect(historyRoute).toEqual(expect.objectContaining({ slug: "m15-sbs" }));
    expect(historyRoute.projectionRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "route_speed_history",
          path: "/api/v1/studio/routes/m15-sbs/speed-history",
          status: "partial",
          months: expect.objectContaining({ end: "2023-04" }),
        }),
      ]),
    );

    const [detailResponse, historyResponse] = await Promise.all([
      fetchApi(`/api/v1/studio/routes/${sparseRoute.slug}`, env),
      fetchApi(`/api/v1/studio/routes/${historyRoute.slug}/history`, env),
    ]);

    const detail = decodeStrict(StudioRouteDetailResponseSchema)(await detailResponse.json());
    expect(detail.route.slug).toBe(sparseRoute.slug);
    expect(detail.segments).toEqual([]);
    expect(detail.quality.caveats).toEqual(
      expect.arrayContaining([
        "This is a partial route detail built from the all-route index; rich map, segment, finding, and evidence sections may be unavailable.",
      ]),
    );

    const history = decodeStrict(StudioRouteHistoryResponseSchema)(await historyResponse.json());
    expect(history.route.slug).toBe(historyRoute.slug);
    expect(history.coverage).toEqual(historyRoute.historyCoverage);
    expect(history.coverage.pointCount).toBe(history.points.length);
  });

  it("normalizes legacy display months in Snapshot 2.0 source coverage rows", async () => {
    const env = {
      ...createStudioProjectionEnv(),
      DB: createSparseStudioRouteDb({
        sourceMonthCoverage: [
          {
            source_id: "local_route_segment_speed",
            month: "March 2026",
            label: "Route segment speed rows",
            source_kind: "source_table",
            grain: "route x month x segment/hour speed observation",
            status: "available",
            row_count: 4200,
            route_count: 350,
            note: null,
            generated_at: "2026-06-06T00:00:00.000Z",
            artifact_path:
              "data/artifacts/source-month-coverage/2023-04_to_2026-03/coverage-matrix.json",
          },
        ],
      }) as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/snapshot", env);

    expect(response.status).toBe(200);
    const snapshot = decodeStrict(StudioSnapshotResponseSchema)(await response.json());
    const sourceMonth = snapshot.v2?.sourceMonths.find(
      (row) => row.sourceId === "local_route_segment_speed",
    );
    expect(sourceMonth?.month).toBe("2026-03");
    const sourceMonthProjection = snapshot.v2?.projections.find(
      (projection) => projection.id === "source_month_coverage",
    );
    expect(sourceMonthProjection?.months).toEqual({ start: "2026-03", end: "2026-03" });
  });

  it("omits invalid source coverage months from the public Studio snapshot", async () => {
    const env = {
      ...createStudioProjectionEnv(),
      DB: createSparseStudioRouteDb({
        sourceMonthCoverage: [
          {
            source_id: "local_route_segment_speed",
            month: "not-a-month",
            label: "Route segment speed rows",
            source_kind: "source_table",
            grain: "route x month x segment/hour speed observation",
            status: "available",
            row_count: 4200,
            route_count: 350,
            note: null,
            generated_at: "2026-06-06T00:00:00.000Z",
            artifact_path:
              "data/artifacts/source-month-coverage/2023-04_to_2026-03/coverage-matrix.json",
          },
        ],
      }) as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/snapshot", env);

    expect(response.status).toBe(200);
    const snapshot = decodeStrict(StudioSnapshotResponseSchema)(await response.json());
    const sourceMonth = snapshot.v2?.sourceMonths.find(
      (row) => row.sourceId === "local_route_segment_speed",
    );
    expect(sourceMonth).toBeUndefined();
    expect(snapshot.v2?.caveats).toContain(
      "1 source-month coverage row failed the public month contract and was omitted from this snapshot.",
    );
    expect(snapshot.v2?.projections).toContainEqual(
      expect.objectContaining({
        id: "source_month_coverage",
        status: "missing",
        months: { start: null, end: null },
      }),
    );
  });

  it("serves Snapshot 2.0 model projection months when the model artifact is well formed", async () => {
    const env = {
      ...createStudioProjectionEnv(),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/snapshot", env);

    expect(response.status).toBe(200);
    const snapshot = decodeStrict(StudioSnapshotResponseSchema)(await response.json());
    const modelProjection = snapshot.v2?.projections.find(
      (projection) => projection.id === "detector_model_status",
    );
    expect(modelProjection).toEqual(
      expect.objectContaining({
        status: "partial",
        months: { start: "2023-04", end: "2026-03" },
      }),
    );
  });

  it("serves Snapshot 2.0 with a degraded model projection when the model artifact months are malformed", async () => {
    const env = {
      ...createStudioProjectionEnv({
        modelArtifact: new FakeR2Object(
          JSON.stringify({
            artifactKind: "model_artifact_serving_projection",
            schemaVersion: 1,
            generatedAt: "2026-06-07T00:00:00.000Z",
            releaseId: STUDIO_RELEASE_ID,
            publishedAt: STUDIO_PUBLISHED_AT,
            coverage: STUDIO_COVERAGE,
            historyWindow: { startMonth: "not-a-month", endMonth: "2026-03" },
            sourceEvaluationPath:
              "data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation.json",
            summary: {
              modelCount: 0,
              availableModelCount: 0,
              missingModelCount: 0,
              detectorConsumerCount: 0,
            },
            models: [],
          }),
          "application/json",
        ),
      }),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/snapshot", env);

    expect(response.status).toBe(200);
    const snapshot = decodeStrict(StudioSnapshotResponseSchema)(await response.json());
    expect(snapshot.v2).toBeDefined();
    const modelProjection = snapshot.v2?.projections.find(
      (projection) => projection.id === "detector_model_status",
    );
    expect(modelProjection?.status).toBe("not_built");
    expect(snapshot.quality.caveats).not.toContain(
      "Snapshot 2.0 manifest failed contract validation and is temporarily omitted.",
    );
    // Snapshot degrade policy: model projection failures are tolerated and disclosed.
    expect(snapshot.quality.caveats).toContain(
      "Detector model projection is temporarily unavailable and is omitted from Snapshot 2.0.",
    );
  });

  it("applies the declared snapshot degrade policy to methods and docs projections", async () => {
    const cases = [
      {
        key: "studio/v1/methods.json",
        countKey: "methods" as const,
        caveat: "Methods projection is temporarily unavailable; dataset counts are omitted.",
      },
      {
        key: "studio/v1/docs.json",
        countKey: "docsSections" as const,
        caveat: "Docs projection is temporarily unavailable; documentation sections are omitted.",
      },
    ];

    for (const testCase of cases) {
      const env = createStudioProjectionEnv({
        extraArtifacts: {
          [testCase.key]: new FakeR2Object("{not-json", "application/json"),
        },
      });

      const response = await fetchApi("/api/v1/studio/snapshot", env);

      expect(response.status).toBe(200);
      const snapshot = decodeStrict(StudioSnapshotResponseSchema)(await response.json());
      // Snapshot degrade policy: tolerated projections compose as legal empty contributions.
      expect(snapshot.counts[testCase.countKey]).toBe(0);
      if (testCase.countKey === "docsSections") {
        expect(snapshot.counts.docsEndpoints).toBe(0);
      }
      expect(snapshot.quality.caveats).toContain(testCase.caveat);
    }
  });

  it("keeps routes required while tolerating a poisoned route evidence index", async () => {
    const routesRequiredEnv = createStudioProjectionEnv({
      extraArtifacts: {
        "studio/v1/routes.json": new FakeR2Object("{not-json", "application/json"),
      },
    });
    const requiredResponse = await fetchApi("/api/v1/studio/snapshot", routesRequiredEnv);
    expect(requiredResponse.status).toBe(502);

    const evidenceToleratedEnv = {
      ...createStudioProjectionEnv({
        extraArtifacts: {
          [STUDIO_ROUTE_EVIDENCE_INDEX_KEY]: new FakeR2Object("{not-json", "application/json"),
        },
      }),
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };
    const toleratedResponse = await fetchApi("/api/v1/studio/snapshot", evidenceToleratedEnv);
    expect(toleratedResponse.status).toBe(200);
    const snapshot = decodeStrict(StudioSnapshotResponseSchema)(await toleratedResponse.json());
    // Snapshot degrade policy: evidence-index failure omits evidence without failing routes.
    expect(snapshot.quality.caveats).toContain(
      "Route evidence index is temporarily unavailable and is omitted from Snapshot 2.0.",
    );
  });

  it("serves D1-backed Studio route month history", async () => {
    const db = new FakeDb({
      exact_route_identity_release: [
        exactRouteIdentityReleaseFixture({
          exactRouteCount: 1,
          routeTypeCount: 1,
          tripTypeCount: 1,
        }),
      ],
      route_artifact: [],
      route_brief_peak_window: [],
      route_brief_slowest_window: [],
      route_brief_summary: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          route_score: 38,
          public_visible: true,
          public_visibility_reason: "public",
          average_speed_mph: 6.4,
          hotspot_count: 9,
          total_ridership: 123456,
          total_transfers: 1234,
          ace_active: true,
          ace_violation_count: 10,
          bus_lane_matched_lane_count: 4,
          schedule_match_rate: 0.98,
        },
      ],
      route_catalog: [
        {
          route_id: "B46-SBS",
          route_short_name: "B46-SBS",
          route_long_name: "Kings Plaza - Williamsburg Bridge Plaza",
          shape_count: 2,
          stop_count: 44,
          timepoint_stop_count: 12,
        },
      ],
      route_catalog_type: [
        {
          route_id: "B46-SBS",
          type_rank: 1,
          route_type: "SBS",
        },
      ],
      route_catalog_trip_type: [
        {
          route_id: "B46-SBS",
          trip_type_rank: 1,
          trip_type: "14",
        },
      ],
      route_month_trend: [
        {
          route_id: "B46-SBS",
          month: "2023-04",
          speed_observation_count: 4106,
          speed_bus_trip_count: 72587,
          average_speed_mph: 7.5684,
          ridership: 380085,
          transfers: 70737,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "B46-SBS",
          month: "2026-05",
          speed_observation_count: 0,
          speed_bus_trip_count: 0,
          average_speed_mph: null,
          ridership: 411222,
          transfers: 80123,
          has_speed_trend: false,
          has_ridership_trend: true,
        },
      ],
      route_observed_reliability_summary: [],
      route_readiness: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          route_short_name: "B46-SBS",
          route_long_name: "Kings Plaza - Williamsburg Bridge Plaza",
          readiness_status: "ready",
          build_eligible: true,
          readiness_score: 100,
          speed_observation_count: 4000,
          speed_bus_trip_count: 70000,
          average_speed_mph: 6.4,
          schedule_timepoint_count: 12,
          shape_count: 2,
          stop_count: 44,
          timepoint_stop_count: 12,
        },
      ],
      route_readiness_missing_input: [],
    });
    const response = await fetchApi("/api/v1/studio/routes/b46-sbs/history", {
      DB: db as unknown as D1Database,
    });

    expect(response.status).toBe(200);
    const history = decodeStrict(StudioRouteHistoryResponseSchema)(await response.json());
    expect(history.route.slug).toBe("b46-sbs");
    expect(history.coverage).toEqual({
      startMonth: "2023-04",
      endMonth: "2026-05",
      pointCount: 2,
      speedMonthCount: 1,
      ridershipMonthCount: 2,
    });
    expect(history.points[1]).toEqual(
      expect.objectContaining({
        month: "2026-05",
        averageSpeedMph: null,
        ridership: 411222,
        hasSpeedTrend: false,
        hasRidershipTrend: true,
      }),
    );
  });

  it("fails Studio API reads closed when projection artifacts are missing", async () => {
    const [missingProjection, missingBinding] = await Promise.all([
      fetchApi("/api/v1/studio/routes", {
        ARTIFACTS: new FakeR2Bucket({}) as unknown as R2Bucket,
      }),
      fetchApi("/api/v1/studio/routes"),
    ]);

    expect(missingProjection.status).toBe(503);
    expect(
      ((await missingProjection.json()) as { error?: { message?: string } }).error?.message,
    ).toBe("Artifact is not available.");
    expect(missingBinding.status).toBe(503);
    expect(((await missingBinding.json()) as { error?: { message?: string } }).error?.message).toBe(
      "Service dependency is not configured.",
    );
  });
});
