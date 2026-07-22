import { createHash } from "node:crypto";
import { buildExactRouteIdentityRegistrationSql } from "@bp/db/d1/seed";
import {
  assertInjectiveStudioRouteIdentityUniverse,
  routeIdToStudioSlug,
  StudioRouteEvidenceIndexV2Schema,
  studioRouteServiceModesForOfficialTypes,
} from "@bp/domain/studio";
import { ReleaseIdentitySchema } from "@bp/domain/studio/shared";
import { Schema } from "effect";
import { decodeSchemaStrict } from "./schema-decode.ts";

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));
const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const ExactRouteCountsSchema = Schema.Struct({
  catalogRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  catalogRouteTypeCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  exactRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  exactRouteTypeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  exactTripTypeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  excludedRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

export const ExactRouteIndexRecoveryReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.exact_route_index_v3_recovery.v1"),
  schemaVersion: Schema.Literal(1),
  recoveryId: Schema.String.check(
    Schema.isPattern(/^exact-route-index-v3-recovery-v1:[0-9a-f]{24}$/u),
  ),
  preparedAt: Schema.String,
  source: Schema.Struct({
    wikiRelease: NonEmptyStringSchema,
    manifestSha256: Sha256Schema,
    routeIdentitySha256: Sha256Schema,
    currentBusRoutesSha256: Sha256Schema,
    routeEvidenceIndexSha256: Sha256Schema,
    routeEvidenceIndexBytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    routeEvidenceIndexGeneratedAt: Schema.String,
  }),
  servingRelease: ReleaseIdentitySchema,
  counts: ExactRouteCountsSchema,
  excludedRouteIds: Schema.Array(NonEmptyStringSchema),
  catalogSnapshotSha256: Sha256Schema,
  projectionSha256: Sha256Schema,
  sqlSha256: Sha256Schema,
});

export type ExactRouteIndexRecoveryReceipt = typeof ExactRouteIndexRecoveryReceiptSchema.Type;

export type RouteCatalogRecoveryRow = {
  routeId: string;
  routeShortName: string;
  routeLongName: string | null;
};

export type RouteCatalogTypeRecoveryRow = {
  routeId: string;
  typeRank: number;
  routeType: string;
};

export type RouteCatalogTripTypeRecoveryRow = {
  routeId: string;
  tripTypeRank: number;
  tripType: string;
};

export type ExactRouteIdentityReleaseRecoveryRow = {
  releaseId: string;
  publishedAt: string;
  coverageStart: string | null;
  coverageEnd: string;
  sourceWikiRelease: string;
  sourceManifestSha256: string;
  sourceRouteIdentitySha256: string;
  sourceCurrentBusRoutesSha256: string;
  sourceIndexSha256: string;
  catalogSnapshotSha256: string;
  projectionSha256: string;
  exactRouteCount: number;
  routeTypeCount: number;
  tripTypeCount: number;
};

export type ExactRouteIndexRecoveryExpectedSource = {
  wikiRelease: string;
  manifestSha256: string;
  routeIdentitySha256: string;
  currentBusRoutesSha256: string;
  routeEvidenceIndexSha256: string;
  routeEvidenceIndexBytes: number;
};

type ExactProjectionRow = {
  routeId: string;
  routeSlug: string;
  routeShortName: string;
  routeLongName: string | null;
  routeTypes: string[];
  tripTypes: string[];
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function canonicalSha256(value: unknown): string {
  return sha256Text(`${canonicalJson(value)}\n`);
}

function arraysEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sqlText(value: string | null): string {
  return value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}

function normalizedCatalog(input: {
  catalogRows: readonly RouteCatalogRecoveryRow[];
  routeTypeRows: readonly RouteCatalogTypeRecoveryRow[];
}) {
  const catalogRows = [...input.catalogRows].toSorted((left, right) =>
    left.routeId.localeCompare(right.routeId),
  );
  const routeTypeRows = [...input.routeTypeRows].toSorted(
    (left, right) => left.routeId.localeCompare(right.routeId) || left.typeRank - right.typeRank,
  );
  const routeIds = new Set<string>();
  for (const row of catalogRows) {
    if (routeIds.has(row.routeId)) throw new Error(`Duplicate route catalog row ${row.routeId}`);
    routeIds.add(row.routeId);
  }
  for (const row of routeTypeRows) {
    if (!routeIds.has(row.routeId)) {
      throw new Error(`Route type ${row.routeId}/${row.typeRank} has no catalog row`);
    }
  }
  return { catalogRows, routeTypeRows };
}

function catalogSnapshotSha256(input: {
  catalogRows: readonly RouteCatalogRecoveryRow[];
  routeTypeRows: readonly RouteCatalogTypeRecoveryRow[];
}): string {
  const normalized = normalizedCatalog(input);
  return canonicalSha256(normalized);
}

function projectionFromServingRows(input: {
  catalogRows: readonly RouteCatalogRecoveryRow[];
  routeTypeRows: readonly RouteCatalogTypeRecoveryRow[];
  tripTypeRows: readonly RouteCatalogTripTypeRecoveryRow[];
}): ExactProjectionRow[] {
  const { catalogRows, routeTypeRows } = normalizedCatalog(input);
  const catalogByRoute = new Map(catalogRows.map((row) => [row.routeId, row]));
  const routeTypesByRoute = new Map<string, string[]>();
  for (const row of routeTypeRows) {
    const rows = routeTypesByRoute.get(row.routeId) ?? [];
    rows.push(row.routeType);
    routeTypesByRoute.set(row.routeId, rows);
  }
  const tripTypesByRoute = new Map<string, string[]>();
  const sortedTripTypes = [...input.tripTypeRows].toSorted(
    (left, right) =>
      left.routeId.localeCompare(right.routeId) || left.tripTypeRank - right.tripTypeRank,
  );
  const tripKeys = new Set<string>();
  for (const row of sortedTripTypes) {
    const key = `${row.routeId}\0${row.tripTypeRank}`;
    if (tripKeys.has(key))
      throw new Error(`Duplicate route trip type ${row.routeId}/${row.tripTypeRank}`);
    tripKeys.add(key);
    const catalog = catalogByRoute.get(row.routeId);
    if (catalog === undefined) throw new Error(`Route trip type ${row.routeId} has no catalog row`);
    const rows = tripTypesByRoute.get(row.routeId) ?? [];
    rows.push(row.tripType);
    tripTypesByRoute.set(row.routeId, rows);
  }
  const projection = [...tripTypesByRoute].map(([routeId, tripTypes]) => {
    const catalog = catalogByRoute.get(routeId);
    if (catalog === undefined) throw new Error(`Exact route ${routeId} has no catalog row`);
    const routeTypes = routeTypesByRoute.get(routeId) ?? [];
    if (routeTypes.length === 0 || tripTypes.length === 0) {
      throw new Error(`Exact route ${routeId} lacks route or trip types`);
    }
    studioRouteServiceModesForOfficialTypes(routeTypes, tripTypes);
    return {
      routeId,
      routeSlug: routeIdToStudioSlug(routeId),
      routeShortName: catalog.routeShortName,
      routeLongName: catalog.routeLongName,
      routeTypes,
      tripTypes,
    };
  });
  assertInjectiveStudioRouteIdentityUniverse(projection, "exact D1 route identity projection");
  return projection.toSorted((left, right) => left.routeId.localeCompare(right.routeId));
}

export function buildExactRouteIndexRecovery(input: {
  routeEvidenceIndex: unknown;
  routeEvidenceIndexSha256: string;
  routeEvidenceIndexBytes: number;
  catalogRows: readonly RouteCatalogRecoveryRow[];
  routeTypeRows: readonly RouteCatalogTypeRecoveryRow[];
  servingRelease: unknown;
  preparedAt: string;
  expectedSource: ExactRouteIndexRecoveryExpectedSource;
}): {
  receipt: ExactRouteIndexRecoveryReceipt;
  receiptText: string;
  sql: string;
  tripTypeRows: RouteCatalogTripTypeRecoveryRow[];
} {
  const index = decodeSchemaStrict(StudioRouteEvidenceIndexV2Schema, input.routeEvidenceIndex);
  const servingRelease = decodeSchemaStrict(ReleaseIdentitySchema, input.servingRelease);
  if (index.summary.routeCount !== index.routes.length) {
    throw new Error("Route-evidence index summary count does not match its rows");
  }
  const sourceChecks: Array<[string, string, string]> = [
    ["wiki release", index.source.wikiRelease, input.expectedSource.wikiRelease],
    ["manifest SHA-256", index.source.manifestSha256, input.expectedSource.manifestSha256],
    [
      "route identity SHA-256",
      index.source.routeIdentitySha256,
      input.expectedSource.routeIdentitySha256,
    ],
    [
      "Current Bus Routes SHA-256",
      index.source.catalogParity.currentBusRoutesSha256,
      input.expectedSource.currentBusRoutesSha256,
    ],
    [
      "route-evidence index SHA-256",
      input.routeEvidenceIndexSha256,
      input.expectedSource.routeEvidenceIndexSha256,
    ],
  ];
  for (const [label, actual, expected] of sourceChecks) {
    if (actual !== expected) throw new Error(`${label} mismatch: ${actual} != ${expected}`);
  }
  if (input.routeEvidenceIndexBytes !== input.expectedSource.routeEvidenceIndexBytes) {
    throw new Error(
      `route-evidence index byte count mismatch: ${input.routeEvidenceIndexBytes} != ${input.expectedSource.routeEvidenceIndexBytes}`,
    );
  }

  const { catalogRows, routeTypeRows } = normalizedCatalog(input);
  const catalogByRoute = new Map(catalogRows.map((row) => [row.routeId, row]));
  const routeTypesByRoute = new Map<string, string[]>();
  for (const row of routeTypeRows) {
    const rows = routeTypesByRoute.get(row.routeId) ?? [];
    rows.push(row.routeType);
    routeTypesByRoute.set(row.routeId, rows);
  }
  const exactRouteIds = new Set<string>();
  const tripTypeRows: RouteCatalogTripTypeRecoveryRow[] = [];
  for (const row of [...index.routes].toSorted((left, right) =>
    left.routeId.localeCompare(right.routeId),
  )) {
    const identity = row.routeIdentity;
    if (
      row.routeId !== identity.routeId ||
      row.routeSlug !== routeIdToStudioSlug(identity.routeId)
    ) {
      throw new Error(`Route-evidence identity mismatch for ${row.routeId}`);
    }
    if (exactRouteIds.has(identity.routeId))
      throw new Error(`Duplicate exact route ${identity.routeId}`);
    exactRouteIds.add(identity.routeId);
    const catalog = catalogByRoute.get(identity.routeId);
    if (catalog === undefined)
      throw new Error(`Exact route ${identity.routeId} is absent from D1 catalog`);
    if (
      catalog.routeShortName !== identity.displayLabel ||
      catalog.routeLongName !== identity.officialLongName
    ) {
      throw new Error(`Exact route ${identity.routeId} presentation differs from D1 catalog`);
    }
    const catalogTypes = routeTypesByRoute.get(identity.routeId) ?? [];
    if (!arraysEqual(catalogTypes, identity.routeTypes)) {
      throw new Error(`Exact route ${identity.routeId} route types differ from D1 catalog`);
    }
    if (identity.routeTypes.length === 0 || identity.tripTypes.length === 0) {
      throw new Error(`Exact route ${identity.routeId} has incomplete official type identity`);
    }
    const serviceModes = studioRouteServiceModesForOfficialTypes(
      identity.routeTypes,
      identity.tripTypes,
    );
    if (!arraysEqual(serviceModes, identity.serviceModes)) {
      throw new Error(`Exact route ${identity.routeId} service modes are inconsistent`);
    }
    identity.tripTypes.forEach((tripType, tripTypeIndex) => {
      tripTypeRows.push({
        routeId: identity.routeId,
        tripTypeRank: tripTypeIndex + 1,
        tripType: String(tripType),
      });
    });
  }
  assertInjectiveStudioRouteIdentityUniverse(
    index.routes.map((row) => ({ routeId: row.routeId, slug: row.routeSlug })),
    "route-evidence v2 index",
  );

  const projection = projectionFromServingRows({ catalogRows, routeTypeRows, tripTypeRows });
  const exactRouteTypeCount = projection.reduce((sum, row) => sum + row.routeTypes.length, 0);
  const exactTripTypeCount = projection.reduce((sum, row) => sum + row.tripTypes.length, 0);
  const excludedRouteIds = catalogRows
    .map((row) => row.routeId)
    .filter((routeId) => !exactRouteIds.has(routeId));
  const catalogSha256 = catalogSnapshotSha256({ catalogRows, routeTypeRows });
  const projectionSha256 = canonicalSha256(projection);
  const recoveryDescriptor = {
    source: input.expectedSource,
    servingRelease,
    catalogSnapshotSha256: catalogSha256,
    projectionSha256,
    exactRouteCount: projection.length,
  };
  const recoveryId = `exact-route-index-v3-recovery-v1:${canonicalSha256(recoveryDescriptor).slice(0, 24)}`;

  const sqlLines = [
    `-- ${recoveryId}`,
    `-- source route-evidence index sha256 ${input.routeEvidenceIndexSha256}`,
    `-- projection sha256 ${projectionSha256}`,
    ...tripTypeRows.map(
      (row) =>
        `INSERT OR IGNORE INTO \`route_catalog_trip_type\` (\`route_id\`, \`trip_type_rank\`, \`trip_type\`) VALUES (${sqlText(row.routeId)}, ${row.tripTypeRank}, ${sqlText(row.tripType)});`,
    ),
    buildExactRouteIdentityRegistrationSql({
      releaseId: servingRelease.releaseId,
      publishedAt: servingRelease.publishedAt,
      coverage: servingRelease.coverage,
      sourceWikiRelease: index.source.wikiRelease,
      sourceManifestSha256: index.source.manifestSha256,
      sourceRouteIdentitySha256: index.source.routeIdentitySha256,
      sourceCurrentBusRoutesSha256: index.source.catalogParity.currentBusRoutesSha256,
      sourceIndexSha256: input.routeEvidenceIndexSha256,
      catalogSnapshotSha256: catalogSha256,
      projectionSha256,
      exactRouteCount: projection.length,
      routeTypeCount: exactRouteTypeCount,
      tripTypeCount: exactTripTypeCount,
    }).trimEnd(),
    "",
  ];
  const sql = sqlLines.join("\n");
  const receipt = decodeSchemaStrict(ExactRouteIndexRecoveryReceiptSchema, {
    artifactKind: "bp.ops.exact_route_index_v3_recovery.v1",
    schemaVersion: 1,
    recoveryId,
    preparedAt: input.preparedAt,
    source: {
      wikiRelease: index.source.wikiRelease,
      manifestSha256: index.source.manifestSha256,
      routeIdentitySha256: index.source.routeIdentitySha256,
      currentBusRoutesSha256: index.source.catalogParity.currentBusRoutesSha256,
      routeEvidenceIndexSha256: input.routeEvidenceIndexSha256,
      routeEvidenceIndexBytes: input.routeEvidenceIndexBytes,
      routeEvidenceIndexGeneratedAt: index.generatedAt,
    },
    servingRelease,
    counts: {
      catalogRouteCount: catalogRows.length,
      catalogRouteTypeCount: routeTypeRows.length,
      exactRouteCount: projection.length,
      exactRouteTypeCount,
      exactTripTypeCount,
      excludedRouteCount: excludedRouteIds.length,
    },
    excludedRouteIds,
    catalogSnapshotSha256: catalogSha256,
    projectionSha256,
    sqlSha256: sha256Text(sql),
  });
  return {
    receipt,
    receiptText: `${JSON.stringify(receipt, null, 2)}\n`,
    sql,
    tripTypeRows,
  };
}

export function exactRouteProjectionSha256(input: {
  catalogRows: readonly RouteCatalogRecoveryRow[];
  routeTypeRows: readonly RouteCatalogTypeRecoveryRow[];
  tripTypeRows: readonly RouteCatalogTripTypeRecoveryRow[];
}): string {
  return canonicalSha256(projectionFromServingRows(input));
}

export function exactRouteCatalogSnapshotSha256(input: {
  catalogRows: readonly RouteCatalogRecoveryRow[];
  routeTypeRows: readonly RouteCatalogTypeRecoveryRow[];
}): string {
  return catalogSnapshotSha256(input);
}

export const ExactRouteIndexRecoveryAuditSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.exact_route_index_v3_recovery_audit.v1"),
  schemaVersion: Schema.Literal(1),
  mode: Schema.Literals(["pre", "post"]),
  recoveryId: NonEmptyStringSchema,
  status: Schema.Literal("pass"),
  servingRelease: ReleaseIdentitySchema,
  counts: ExactRouteCountsSchema,
  catalogSnapshotSha256: Sha256Schema,
  projectionSha256: Schema.NullOr(Sha256Schema),
  actions: Schema.Struct({
    applyTripTypeMigration: Schema.Boolean,
    applyRegistryMigration: Schema.Boolean,
    applyRecoveryProjection: Schema.Boolean,
  }),
});

export type ExactRouteIndexRecoveryAudit = typeof ExactRouteIndexRecoveryAuditSchema.Type;

function auditRegisteredExactRouteProjection(input: {
  mode: "pre" | "post";
  servingRelease: typeof ReleaseIdentitySchema.Type;
  catalogRows: readonly RouteCatalogRecoveryRow[];
  routeTypeRows: readonly RouteCatalogTypeRecoveryRow[];
  tripTypeTablePresent: boolean;
  tripTypeRows: readonly RouteCatalogTripTypeRecoveryRow[];
  registryTablePresent: boolean;
  registryRows: readonly ExactRouteIdentityReleaseRecoveryRow[];
}): ExactRouteIndexRecoveryAudit {
  if (!input.tripTypeTablePresent || !input.registryTablePresent) {
    throw new Error("Current D1 release lacks the exact route serving tables");
  }
  const registry = input.registryRows.find(
    (row) => row.releaseId === input.servingRelease.releaseId,
  );
  if (registry === undefined) {
    throw new Error("Current D1 release lacks an exact route identity registry row");
  }
  const projection = projectionFromServingRows({
    catalogRows: input.catalogRows,
    routeTypeRows: input.routeTypeRows,
    tripTypeRows: input.tripTypeRows,
  });
  const catalogSha256 = catalogSnapshotSha256({
    catalogRows: input.catalogRows,
    routeTypeRows: input.routeTypeRows,
  });
  const projectionSha256 = canonicalSha256(projection);
  const exactRouteTypeCount = projection.reduce((sum, row) => sum + row.routeTypes.length, 0);
  const sha256Pattern = /^[0-9a-f]{64}$/u;
  const metadataMatches =
    registry.publishedAt === input.servingRelease.publishedAt &&
    registry.coverageStart === input.servingRelease.coverage.start &&
    registry.coverageEnd === input.servingRelease.coverage.end &&
    registry.catalogSnapshotSha256 === catalogSha256 &&
    registry.projectionSha256 === projectionSha256 &&
    registry.exactRouteCount === projection.length &&
    registry.routeTypeCount === exactRouteTypeCount &&
    registry.tripTypeCount === input.tripTypeRows.length &&
    registry.sourceWikiRelease.length > 0 &&
    [
      registry.sourceManifestSha256,
      registry.sourceRouteIdentitySha256,
      registry.sourceCurrentBusRoutesSha256,
      registry.sourceIndexSha256,
      registry.catalogSnapshotSha256,
      registry.projectionSha256,
    ].every((value) => sha256Pattern.test(value));
  if (!metadataMatches) {
    throw new Error("Current D1 exact route projection does not match its registered release");
  }
  return {
    artifactKind: "bp.ops.exact_route_index_v3_recovery_audit.v1",
    schemaVersion: 1,
    mode: input.mode,
    recoveryId: `registered-exact-route-release:${input.servingRelease.releaseId}`,
    status: "pass",
    servingRelease: input.servingRelease,
    counts: {
      catalogRouteCount: input.catalogRows.length,
      catalogRouteTypeCount: input.routeTypeRows.length,
      exactRouteCount: projection.length,
      exactRouteTypeCount,
      exactTripTypeCount: input.tripTypeRows.length,
      excludedRouteCount: input.catalogRows.length - projection.length,
    },
    catalogSnapshotSha256: catalogSha256,
    projectionSha256,
    actions: {
      applyTripTypeMigration: false,
      applyRegistryMigration: false,
      applyRecoveryProjection: false,
    },
  };
}

function registryMatchesReceipt(
  registry: ExactRouteIdentityReleaseRecoveryRow,
  receipt: ExactRouteIndexRecoveryReceipt,
): boolean {
  return (
    registry.releaseId === receipt.servingRelease.releaseId &&
    registry.publishedAt === receipt.servingRelease.publishedAt &&
    registry.coverageStart === receipt.servingRelease.coverage.start &&
    registry.coverageEnd === receipt.servingRelease.coverage.end &&
    registry.sourceWikiRelease === receipt.source.wikiRelease &&
    registry.sourceManifestSha256 === receipt.source.manifestSha256 &&
    registry.sourceRouteIdentitySha256 === receipt.source.routeIdentitySha256 &&
    registry.sourceCurrentBusRoutesSha256 === receipt.source.currentBusRoutesSha256 &&
    registry.sourceIndexSha256 === receipt.source.routeEvidenceIndexSha256 &&
    registry.catalogSnapshotSha256 === receipt.catalogSnapshotSha256 &&
    registry.projectionSha256 === receipt.projectionSha256 &&
    registry.exactRouteCount === receipt.counts.exactRouteCount &&
    registry.routeTypeCount === receipt.counts.exactRouteTypeCount &&
    registry.tripTypeCount === receipt.counts.exactTripTypeCount
  );
}

export function auditExactRouteIndexRecovery(input: {
  mode: "pre" | "post";
  receipt: unknown;
  servingRelease: unknown;
  catalogRows: readonly RouteCatalogRecoveryRow[];
  routeTypeRows: readonly RouteCatalogTypeRecoveryRow[];
  tripTypeTablePresent: boolean;
  tripTypeRows: readonly RouteCatalogTripTypeRecoveryRow[];
  registryTablePresent: boolean;
  registryRows: readonly ExactRouteIdentityReleaseRecoveryRow[];
}): ExactRouteIndexRecoveryAudit {
  const receipt = decodeSchemaStrict(ExactRouteIndexRecoveryReceiptSchema, input.receipt);
  const servingRelease = decodeSchemaStrict(ReleaseIdentitySchema, input.servingRelease);
  if (canonicalJson(servingRelease) !== canonicalJson(receipt.servingRelease)) {
    return auditRegisteredExactRouteProjection({
      mode: input.mode,
      servingRelease,
      catalogRows: input.catalogRows,
      routeTypeRows: input.routeTypeRows,
      tripTypeTablePresent: input.tripTypeTablePresent,
      tripTypeRows: input.tripTypeRows,
      registryTablePresent: input.registryTablePresent,
      registryRows: input.registryRows,
    });
  }
  const catalogSha256 = catalogSnapshotSha256({
    catalogRows: input.catalogRows,
    routeTypeRows: input.routeTypeRows,
  });
  if (
    input.catalogRows.length !== receipt.counts.catalogRouteCount ||
    input.routeTypeRows.length !== receipt.counts.catalogRouteTypeCount ||
    catalogSha256 !== receipt.catalogSnapshotSha256
  ) {
    throw new Error("D1 route catalog does not match the recovery receipt");
  }

  let projectionSha256: string | null = null;
  const tripRowsMissing = !input.tripTypeTablePresent || input.tripTypeRows.length === 0;
  if (!tripRowsMissing) {
    projectionSha256 = exactRouteProjectionSha256({
      catalogRows: input.catalogRows,
      routeTypeRows: input.routeTypeRows,
      tripTypeRows: input.tripTypeRows,
    });
    if (
      input.tripTypeRows.length !== receipt.counts.exactTripTypeCount ||
      projectionSha256 !== receipt.projectionSha256
    ) {
      throw new Error("D1 exact route trip-type projection does not match the recovery receipt");
    }
  }

  const registry = input.registryRows.find(
    (row) => row.releaseId === receipt.servingRelease.releaseId,
  );
  if (registry !== undefined && !registryMatchesReceipt(registry, receipt)) {
    throw new Error("D1 exact route identity registry does not match the recovery receipt");
  }
  if (registry !== undefined && tripRowsMissing) {
    throw new Error("D1 registry exists without its exact route trip-type projection");
  }
  if (input.mode === "post" && (tripRowsMissing || registry === undefined)) {
    throw new Error("D1 exact route identity recovery is incomplete after mutation");
  }

  const applyTripTypeMigration = !input.tripTypeTablePresent;
  const applyRegistryMigration = !input.registryTablePresent;
  const applyRecoveryProjection = tripRowsMissing || registry === undefined;
  return {
    artifactKind: "bp.ops.exact_route_index_v3_recovery_audit.v1",
    schemaVersion: 1,
    mode: input.mode,
    recoveryId: receipt.recoveryId,
    status: "pass",
    servingRelease,
    counts: receipt.counts,
    catalogSnapshotSha256: catalogSha256,
    projectionSha256,
    actions: {
      applyTripTypeMigration,
      applyRegistryMigration,
      applyRecoveryProjection,
    },
  };
}
