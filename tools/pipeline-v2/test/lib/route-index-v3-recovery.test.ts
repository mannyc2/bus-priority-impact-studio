import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import type {
  StudioRouteEvidenceIndexRouteV2,
  StudioRouteEvidenceIndexV2,
  StudioRouteEvidenceSourceV2,
  StudioRouteIdentityPresentation,
} from "@bp/domain/studio";
import {
  auditExactRouteIndexRecovery,
  buildExactRouteIndexRecovery,
  ExactRouteIndexRecoveryReceiptSchema,
} from "../../src/lib/route-index-v3-recovery.ts";
import { decodeSchemaStrict } from "../../src/lib/schema-decode.ts";

const HASHES = {
  manifest: "1".repeat(64),
  identity: "2".repeat(64),
  busRoutes: "3".repeat(64),
  index: "4".repeat(64),
  indexBytes: 123,
} as const;

const source: StudioRouteEvidenceSourceV2 = {
  kind: "mta-wiki-immutable-release",
  wikiRelease: "v1-test",
  manifestSha256: HASHES.manifest,
  routeIdentitySha256: HASHES.identity,
  routeAnchorSha256: "5".repeat(64),
  trackerRouteInputSha256: "6".repeat(64),
  catalogParity: {
    currentBusRoutesSha256: HASHES.busRoutes,
    effectiveAsOfDate: "2026-07-18",
    currentCatalogRouteCount: 3,
    catalogInEffectIdentityCount: 3,
    gtfsRouteCount: 3,
    descriptorReconciled: true,
    catalogInEffectSetsEqual: true,
    catalogOnlyRouteIds: [],
    gtfsOnlyRouteIds: [],
    rawRouteTypeCounts: { "3": 3 },
    scheduledInWindowCounts: { yes: 3 },
    reliabilityStatusCounts: { reliable: 3 },
    nonBusOrUnknownExtendedRouteTypeCount: 0,
    externalOnlyRouteRecordCount: 0,
  },
};

const b44: StudioRouteIdentityPresentation = {
  routeId: "B44",
  routeFamilyId: "B44",
  displayLabel: "B44",
  officialLongName: "Sheepshead Bay - Williamsburg",
  designationLiterals: ["route_type:Local", "trip_type:1"],
  serviceModes: ["local"],
  routeTypes: ["Local"],
  tripTypes: ["1"],
};

const b44Sbs: StudioRouteIdentityPresentation = {
  routeId: "B44+",
  routeFamilyId: "B44",
  displayLabel: "B44-SBS",
  officialLongName: "Sheepshead Bay - Williamsburg",
  designationLiterals: ["route_type:SBS", "trip_type:14"],
  serviceModes: ["sbs"],
  routeTypes: ["SBS"],
  tripTypes: ["14"],
};

const emptyCoverage = {
  timelineCount: 0,
  interventionCount: 0,
  metricClaimCount: 0,
  projectCount: 0,
  sourceGapCount: 0,
  citationCount: 0,
};

function indexRow(
  presentation: StudioRouteIdentityPresentation,
  slug: "b44" | "b44-sbs",
): StudioRouteEvidenceIndexRouteV2 {
  return {
    routeId: presentation.routeId,
    routeSlug: slug,
    wikiRouteRecordId: `route-${slug}`,
    artifactName: "route_evidence",
    artifactKey: `studio/v2/wiki/routes/${slug}.json`,
    contentType: "application/json",
    byteLength: 100,
    sha256: "a".repeat(64),
    coverage: emptyCoverage,
    bundleSchemaVersion: 2,
    routeIdentity: presentation,
  };
}

function routeEvidenceIndex(): StudioRouteEvidenceIndexV2 {
  return {
    artifactKind: "bp.studio.route_evidence_index.v2",
    schemaVersion: 2,
    generatedAt: "2026-07-18T18:05:27.000Z",
    sourceArtifactKey: "studio/v2/wiki/index.json",
    source,
    summary: {
      routeCount: 2,
      matchedBusRouteCount: 2,
      citationCount: 0,
      totalByteLength: 200,
    },
    routes: [indexRow(b44, "b44"), indexRow(b44Sbs, "b44-sbs")],
  };
}

function build() {
  return buildExactRouteIndexRecovery({
    routeEvidenceIndex: routeEvidenceIndex(),
    routeEvidenceIndexSha256: HASHES.index,
    routeEvidenceIndexBytes: HASHES.indexBytes,
    catalogRows: [
      {
        routeId: "B44",
        routeShortName: "B44",
        routeLongName: "Sheepshead Bay - Williamsburg",
      },
      {
        routeId: "B44+",
        routeShortName: "B44-SBS",
        routeLongName: "Sheepshead Bay - Williamsburg",
      },
      { routeId: "Q999", routeShortName: "Q999", routeLongName: "Legacy only" },
    ],
    routeTypeRows: [
      { routeId: "B44", typeRank: 1, routeType: "Local" },
      { routeId: "B44+", typeRank: 1, routeType: "SBS" },
      { routeId: "Q999", typeRank: 1, routeType: "Local" },
    ],
    servingRelease: {
      releaseId: "pub_20260605T183601689Z",
      publishedAt: "2026-06-05T18:36:01.689Z",
      coverage: { start: "2023-04", end: "2026-03" },
    },
    preparedAt: "2026-07-22T13:58:55.000Z",
    expectedSource: {
      wikiRelease: source.wikiRelease,
      manifestSha256: HASHES.manifest,
      routeIdentitySha256: HASHES.identity,
      currentBusRoutesSha256: HASHES.busRoutes,
      routeEvidenceIndexSha256: HASHES.index,
      routeEvidenceIndexBytes: HASHES.indexBytes,
    },
  });
}

describe("exact route-index v3 recovery", () => {
  it("builds deterministic bytes while preserving B44 and B44+ as distinct identities", () => {
    const first = build();
    const second = build();
    expect(first.sql).toBe(second.sql);
    expect(first.receiptText).toBe(second.receiptText);
    expect(first.tripTypeRows).toEqual([
      { routeId: "B44", tripTypeRank: 1, tripType: "1" },
      { routeId: "B44+", tripTypeRank: 1, tripType: "14" },
    ]);
    expect(first.receipt.counts).toEqual({
      catalogRouteCount: 3,
      catalogRouteTypeCount: 3,
      exactRouteCount: 2,
      exactRouteTypeCount: 2,
      exactTripTypeCount: 2,
      excludedRouteCount: 1,
    });
    expect(first.receipt.excludedRouteIds).toEqual(["Q999"]);
    expect(decodeSchemaStrict(ExactRouteIndexRecoveryReceiptSchema, first.receipt)).toEqual(
      first.receipt,
    );
  });

  it("rejects source lineage and catalog presentation drift", () => {
    expect(() =>
      buildExactRouteIndexRecovery({
        ...buildInput(),
        routeEvidenceIndexSha256: "f".repeat(64),
      }),
    ).toThrow("route-evidence index SHA-256 mismatch");
    expect(() =>
      buildExactRouteIndexRecovery({
        ...buildInput(),
        catalogRows: buildInput().catalogRows.map((row) =>
          row.routeId === "B44" ? { ...row, routeShortName: "forged" } : row,
        ),
      }),
    ).toThrow("presentation differs from D1 catalog");
  });

  it("applies the generated projection twice without duplicating exact rows", () => {
    const result = build();
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE route_catalog_trip_type (
        route_id TEXT NOT NULL,
        trip_type_rank INTEGER NOT NULL,
        trip_type TEXT NOT NULL,
        PRIMARY KEY (route_id, trip_type_rank)
      );
      CREATE TABLE exact_route_identity_release (
        release_id TEXT PRIMARY KEY NOT NULL,
        published_at TEXT NOT NULL,
        coverage_start TEXT,
        coverage_end TEXT NOT NULL,
        source_wiki_release TEXT NOT NULL,
        source_manifest_sha256 TEXT NOT NULL,
        source_route_identity_sha256 TEXT NOT NULL,
        source_current_bus_routes_sha256 TEXT NOT NULL,
        source_index_sha256 TEXT NOT NULL,
        catalog_snapshot_sha256 TEXT NOT NULL,
        projection_sha256 TEXT NOT NULL,
        exact_route_count INTEGER NOT NULL,
        route_type_count INTEGER NOT NULL,
        trip_type_count INTEGER NOT NULL
      );
    `);
    sqlite.exec(result.sql);
    sqlite.exec(result.sql);
    expect(sqlite.query("SELECT COUNT(*) FROM route_catalog_trip_type").get()).toEqual({
      "COUNT(*)": 2,
    });
    expect(sqlite.query("SELECT COUNT(*) FROM exact_route_identity_release").get()).toEqual({
      "COUNT(*)": 1,
    });
    sqlite.close(false);
  });

  it("fails closed when an existing release ID has drifted metadata", () => {
    const result = build();
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE route_catalog_trip_type (
        route_id TEXT NOT NULL,
        trip_type_rank INTEGER NOT NULL,
        trip_type TEXT NOT NULL,
        PRIMARY KEY (route_id, trip_type_rank)
      );
      CREATE TABLE exact_route_identity_release (
        release_id TEXT PRIMARY KEY NOT NULL,
        published_at TEXT NOT NULL,
        coverage_start TEXT,
        coverage_end TEXT NOT NULL,
        source_wiki_release TEXT NOT NULL,
        source_manifest_sha256 TEXT NOT NULL,
        source_route_identity_sha256 TEXT NOT NULL,
        source_current_bus_routes_sha256 TEXT NOT NULL,
        source_index_sha256 TEXT NOT NULL,
        catalog_snapshot_sha256 TEXT NOT NULL,
        projection_sha256 TEXT NOT NULL,
        exact_route_count INTEGER NOT NULL,
        route_type_count INTEGER NOT NULL,
        trip_type_count INTEGER NOT NULL
      );
    `);
    sqlite.exec(result.sql);
    sqlite.exec(`UPDATE exact_route_identity_release SET projection_sha256 = '${"f".repeat(64)}'`);
    const exactRegistrationSql = result.sql.slice(result.sql.indexOf("WITH `candidate`"));
    expect(() => sqlite.query(exactRegistrationSql).run()).toThrow();
    expect(
      sqlite.query("SELECT projection_sha256 FROM exact_route_identity_release").get(),
    ).toEqual({ projection_sha256: "f".repeat(64) });
    sqlite.close(false);
  });

  it("permits only an empty pre-recovery state or the exact registered projection", () => {
    const result = build();
    const common = {
      receipt: result.receipt,
      servingRelease: result.receipt.servingRelease,
      catalogRows: buildInput().catalogRows,
      routeTypeRows: buildInput().routeTypeRows,
    };
    const pre = auditExactRouteIndexRecovery({
      ...common,
      mode: "pre",
      tripTypeTablePresent: false,
      tripTypeRows: [],
      registryTablePresent: false,
      registryRows: [],
    });
    expect(pre.actions).toEqual({
      applyTripTypeMigration: true,
      applyRegistryMigration: true,
      applyRecoveryProjection: true,
    });
    expect(() =>
      auditExactRouteIndexRecovery({
        ...common,
        mode: "pre",
        tripTypeTablePresent: true,
        tripTypeRows: result.tripTypeRows.slice(0, 1),
        registryTablePresent: false,
        registryRows: [],
      }),
    ).toThrow("trip-type projection does not match");

    const receipt = result.receipt;
    const post = auditExactRouteIndexRecovery({
      ...common,
      mode: "post",
      tripTypeTablePresent: true,
      tripTypeRows: result.tripTypeRows,
      registryTablePresent: true,
      registryRows: [
        {
          releaseId: receipt.servingRelease.releaseId,
          publishedAt: receipt.servingRelease.publishedAt,
          coverageStart: receipt.servingRelease.coverage.start,
          coverageEnd: receipt.servingRelease.coverage.end,
          sourceWikiRelease: receipt.source.wikiRelease,
          sourceManifestSha256: receipt.source.manifestSha256,
          sourceRouteIdentitySha256: receipt.source.routeIdentitySha256,
          sourceCurrentBusRoutesSha256: receipt.source.currentBusRoutesSha256,
          sourceIndexSha256: receipt.source.routeEvidenceIndexSha256,
          catalogSnapshotSha256: receipt.catalogSnapshotSha256,
          projectionSha256: receipt.projectionSha256,
          exactRouteCount: receipt.counts.exactRouteCount,
          routeTypeCount: receipt.counts.exactRouteTypeCount,
          tripTypeCount: receipt.counts.exactTripTypeCount,
        },
      ],
    });
    expect(post.actions).toEqual({
      applyTripTypeMigration: false,
      applyRegistryMigration: false,
      applyRecoveryProjection: false,
    });
    expect(post.projectionSha256).toBe(receipt.projectionSha256);
  });

  it("keeps the deploy gate valid for a later independently registered release", () => {
    const result = build();
    const futureRelease = {
      releaseId: "pub_20260801T120000000Z",
      publishedAt: "2026-08-01T12:00:00.000Z",
      coverage: { start: "2023-04", end: "2026-05" },
    } as const;
    const common = {
      mode: "pre" as const,
      receipt: result.receipt,
      servingRelease: futureRelease,
      catalogRows: buildInput().catalogRows,
      routeTypeRows: buildInput().routeTypeRows,
      tripTypeTablePresent: true,
      tripTypeRows: result.tripTypeRows,
      registryTablePresent: true,
    };
    expect(() => auditExactRouteIndexRecovery({ ...common, registryRows: [] })).toThrow(
      "lacks an exact route identity registry row",
    );
    const audit = auditExactRouteIndexRecovery({
      ...common,
      registryRows: [
        {
          releaseId: futureRelease.releaseId,
          publishedAt: futureRelease.publishedAt,
          coverageStart: futureRelease.coverage.start,
          coverageEnd: futureRelease.coverage.end,
          sourceWikiRelease: "v1-future",
          sourceManifestSha256: "1".repeat(64),
          sourceRouteIdentitySha256: "2".repeat(64),
          sourceCurrentBusRoutesSha256: "3".repeat(64),
          sourceIndexSha256: "4".repeat(64),
          catalogSnapshotSha256: result.receipt.catalogSnapshotSha256,
          projectionSha256: result.receipt.projectionSha256,
          exactRouteCount: 2,
          routeTypeCount: 2,
          tripTypeCount: 2,
        },
      ],
    });
    expect(audit.recoveryId).toBe(`registered-exact-route-release:${futureRelease.releaseId}`);
    expect(audit.actions.applyRecoveryProjection).toBe(false);
  });
});

function buildInput(): Parameters<typeof buildExactRouteIndexRecovery>[0] {
  const result = build();
  return {
    routeEvidenceIndex: routeEvidenceIndex(),
    routeEvidenceIndexSha256: HASHES.index,
    routeEvidenceIndexBytes: HASHES.indexBytes,
    catalogRows: [
      {
        routeId: "B44",
        routeShortName: "B44",
        routeLongName: "Sheepshead Bay - Williamsburg",
      },
      {
        routeId: "B44+",
        routeShortName: "B44-SBS",
        routeLongName: "Sheepshead Bay - Williamsburg",
      },
      { routeId: "Q999", routeShortName: "Q999", routeLongName: "Legacy only" },
    ],
    routeTypeRows: [
      { routeId: "B44", typeRank: 1, routeType: "Local" },
      { routeId: "B44+", typeRank: 1, routeType: "SBS" },
      { routeId: "Q999", typeRank: 1, routeType: "Local" },
    ],
    servingRelease: result.receipt.servingRelease,
    preparedAt: result.receipt.preparedAt,
    expectedSource: {
      wikiRelease: source.wikiRelease,
      manifestSha256: HASHES.manifest,
      routeIdentitySha256: HASHES.identity,
      currentBusRoutesSha256: HASHES.busRoutes,
      routeEvidenceIndexSha256: HASHES.index,
      routeEvidenceIndexBytes: HASHES.indexBytes,
    },
  };
}
