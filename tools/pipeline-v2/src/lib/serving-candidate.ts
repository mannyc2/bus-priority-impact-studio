import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { D1_CANDIDATE_PROJECTION_TABLES } from "@bp/db/d1";
import { decodeStrict } from "@bp/domain/decode";
import {
  canonicalServingCandidateSemanticJson,
  canonicalServingJson,
  canonicalServingJsonBytes,
  type ServingCandidateManifestV1,
  ServingCandidateManifestV1Schema,
} from "@bp/domain/studio/serving-release";

export type ServingCandidateArtifactBody = {
  logicalId: string;
  body: Uint8Array;
  mediaType: string;
  schemaId: string;
  extension?: string | undefined;
};

export type ServingCandidateArtifactDescriptor = Omit<
  BuiltServingCandidate["objects"][number],
  "body"
>;

export type BuildServingCandidateInput = Omit<
  ServingCandidateManifestV1,
  "candidateId" | "artifacts"
> & {
  artifacts: readonly ServingCandidateArtifactBody[];
};

export type BuildServingCandidateFromDescriptorsInput = Omit<
  ServingCandidateManifestV1,
  "candidateId" | "artifacts"
> & {
  artifacts: readonly ServingCandidateArtifactDescriptor[];
};

export type BuiltServingCandidate = {
  manifest: ServingCandidateManifestV1;
  manifestBytes: Uint8Array;
  manifestSha256: string;
  manifestKey: string;
  objects: ReadonlyArray<{
    logicalId: string;
    key: string;
    body: Uint8Array;
    sha256: string;
    bytes: number;
    mediaType: string;
    schemaId: string;
  }>;
};

export type ServingD1ProjectionInventory = {
  projectionSha256: string;
  rowCounts: Record<string, number>;
  exactIdentityProjectionSha256: string;
  exactIdentityRouteCount: number;
};

/** Rebind a recovery-era physical map key to its candidate logical ID. */
export function bindCandidateMapManifestLogicalKey(
  database: Database,
  logicalKey: string,
): { releaseId: string; manifestSha256: string } {
  const match = /^map\/\d{4}-\d{2}\/manifest\.([a-f0-9]{64})\.json$/u.exec(logicalKey);
  const manifestSha256 = match?.[1];
  if (manifestSha256 === undefined) {
    throw new Error("Candidate map manifest logical key is invalid.");
  }
  const rows = database
    .query(
      `SELECT
        release_id AS releaseId,
        manifest_sha256 AS manifestSha256
      FROM map_release_catalog
      WHERE verification_status = 'pass'`,
    )
    .all() as Array<{ releaseId: string; manifestSha256: string }>;
  if (rows.length !== 1 || rows[0]?.manifestSha256 !== manifestSha256) {
    throw new Error("Candidate map catalog does not uniquely match the logical manifest hash.");
  }
  database
    .query("UPDATE map_release_catalog SET manifest_key = ? WHERE release_id = ?")
    .run(logicalKey, rows[0].releaseId);
  return rows[0];
}

function quotedIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
    throw new Error(`Unsafe SQLite identifier ${value}.`);
  }
  return `"${value}"`;
}

/**
 * Hash the semantic candidate projection rendered in the legacy D1 tables.
 *
 * Candidate IDs are deliberately absent at this boundary. The resulting
 * inventory can therefore be bound into a candidate manifest first and the
 * same canonical rows can then be namespaced with that derived candidate ID.
 */
export function servingD1ProjectionInventory(
  database: Database,
  coverageEnd: string,
): ServingD1ProjectionInventory {
  const projection = createHash("sha256");
  const rowCounts: Record<string, number> = {};
  for (const table of D1_CANDIDATE_PROJECTION_TABLES) {
    const columns = database.query(`PRAGMA table_info(${quotedIdentifier(table)})`).all() as Array<{
      name: string;
      pk: number;
    }>;
    if (columns.length === 0) throw new Error(`D1 export is missing ${table}.`);
    const orderColumns = columns
      .filter((column) => column.pk > 0)
      .toSorted((left, right) => left.pk - right.pk);
    const order = (orderColumns.length === 0 ? columns : orderColumns)
      .map((column) => quotedIdentifier(column.name))
      .join(", ");
    const mixedReviewedFilter =
      table === "route_month_source_status" || table === "route_observed_reliability_summary"
        ? " WHERE month <= ?"
        : "";
    const statement = database.query(
      `SELECT * FROM ${quotedIdentifier(table)}${mixedReviewedFilter} ORDER BY ${order}`,
    );
    const rows = (
      mixedReviewedFilter.length === 0 ? statement.all() : statement.all(coverageEnd)
    ) as Array<Record<string, unknown>>;
    rowCounts[table] = rows.length;
    for (const row of rows) {
      const line = `${canonicalServingJson({ table, row })}\n`;
      projection.update(line);
    }
  }
  const exactRelease = database
    .query(
      `SELECT
        projection_sha256 AS projectionSha256,
        exact_route_count AS routeCount
      FROM exact_route_identity_release
      WHERE coverage_end = ?`,
    )
    .all(coverageEnd) as Array<{ projectionSha256: string; routeCount: number }>;
  const exactIdentity = exactRelease[0];
  if (
    exactRelease.length !== 1 ||
    exactIdentity === undefined ||
    !/^[a-f0-9]{64}$/u.test(exactIdentity.projectionSha256) ||
    !Number.isSafeInteger(exactIdentity.routeCount) ||
    exactIdentity.routeCount <= 0
  ) {
    throw new Error(`D1 export has no unique exact-route receipt for ${coverageEnd}.`);
  }
  return {
    projectionSha256: projection.digest("hex"),
    rowCounts,
    exactIdentityProjectionSha256: exactIdentity.projectionSha256,
    exactIdentityRouteCount: exactIdentity.routeCount,
  };
}

function servingSqlValue(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString("hex")}'`;
  throw new Error(`Unsupported D1 projection value ${Object.prototype.toString.call(value)}.`);
}

/** Render a full, idempotent candidate-scoped seed from one verified legacy projection. */
export function renderServingD1CandidateSeedSql(
  database: Database,
  candidateId: string,
  coverageEnd: string,
): string {
  if (!/^[a-f0-9]{64}$/u.test(candidateId)) {
    throw new Error("Candidate seed requires a lowercase SHA-256 candidate ID.");
  }
  const statements: string[] = [];
  for (const table of D1_CANDIDATE_PROJECTION_TABLES) {
    const columns = database.query(`PRAGMA table_info(${quotedIdentifier(table)})`).all() as Array<{
      name: string;
      pk: number;
    }>;
    if (columns.length === 0) throw new Error(`D1 export is missing ${table}.`);
    const orderColumns = columns
      .filter((column) => column.pk > 0)
      .toSorted((left, right) => left.pk - right.pk);
    const order = (orderColumns.length === 0 ? columns : orderColumns)
      .map((column) => quotedIdentifier(column.name))
      .join(", ");
    const mixedReviewedFilter =
      table === "route_month_source_status" || table === "route_observed_reliability_summary"
        ? " WHERE month <= ?"
        : "";
    const statement = database.query(
      `SELECT * FROM ${quotedIdentifier(table)}${mixedReviewedFilter} ORDER BY ${order}`,
    );
    const rows = (
      mixedReviewedFilter.length === 0 ? statement.all() : statement.all(coverageEnd)
    ) as Array<Record<string, unknown>>;
    statements.push(
      `delete from ${quotedIdentifier(`${table}_v2`)} where "candidate_id" = '${candidateId}';`,
    );
    const columnSql = columns.map((column) => quotedIdentifier(column.name)).join(", ");
    for (const row of rows) {
      const values = columns.map((column) => servingSqlValue(row[column.name])).join(", ");
      statements.push(
        `insert into ${quotedIdentifier(`${table}_v2`)} (${columnSql}, "candidate_id") values (${values}, '${candidateId}');`,
      );
    }
  }
  return `${statements.join("\n")}\n`;
}

export function servingSha256(body: Uint8Array | string): string {
  return createHash("sha256").update(body).digest("hex");
}

function artifactExtension(artifact: ServingCandidateArtifactBody): string {
  if (artifact.extension !== undefined) {
    if (!/^[a-z0-9]+$/u.test(artifact.extension)) {
      throw new Error(`Invalid artifact extension for ${artifact.logicalId}.`);
    }
    return artifact.extension;
  }
  if (artifact.mediaType.includes("json")) return "json";
  if (artifact.mediaType === "text/csv") return "csv";
  if (artifact.mediaType.startsWith("text/")) return "txt";
  return "bin";
}

export function buildServingCandidate(input: BuildServingCandidateInput): BuiltServingCandidate {
  const objects = input.artifacts
    .map((artifact) => {
      const sha256 = servingSha256(artifact.body);
      return {
        logicalId: artifact.logicalId,
        key: `serving/blobs/sha256/${sha256.slice(0, 2)}/${sha256}.${artifactExtension(artifact)}`,
        body: artifact.body,
        sha256,
        bytes: artifact.body.byteLength,
        mediaType: artifact.mediaType,
        schemaId: artifact.schemaId,
      };
    })
    .toSorted((left, right) => left.logicalId.localeCompare(right.logicalId));
  const built = buildServingCandidateFromDescriptors({
    ...input,
    artifacts: objects.map(({ body: _body, ...artifact }) => artifact),
  });
  return { ...built, objects };
}

export function buildServingCandidateFromDescriptors(
  input: BuildServingCandidateFromDescriptorsInput,
): Omit<BuiltServingCandidate, "objects"> & {
  objects: readonly ServingCandidateArtifactDescriptor[];
} {
  const artifacts = [...input.artifacts].toSorted((left, right) =>
    left.logicalId.localeCompare(right.logicalId),
  );
  const builderVersions = [...input.builderVersions].toSorted((left, right) =>
    `${left.name}\u0000${left.version}`.localeCompare(`${right.name}\u0000${right.version}`),
  );
  const datasets = [...input.datasets]
    .map((dataset) => ({
      ...dataset,
      sourceSnapshotIds: [...dataset.sourceSnapshotIds].toSorted(),
    }))
    .toSorted((left, right) => left.datasetId.localeCompare(right.datasetId));
  const d1 = {
    ...input.d1,
    rowCounts: Object.fromEntries(
      Object.entries(input.d1.rowCounts).toSorted(([left], [right]) => left.localeCompare(right)),
    ),
  };
  const provisional = decodeStrict(ServingCandidateManifestV1Schema)({
    ...input,
    builderVersions,
    datasets,
    d1,
    candidateId: "0".repeat(64),
    artifacts,
  });
  const candidateId = servingSha256(canonicalServingCandidateSemanticJson(provisional));
  const manifest = decodeStrict(ServingCandidateManifestV1Schema)({
    ...provisional,
    candidateId,
  });
  const manifestBytes = canonicalServingJsonBytes(manifest);
  const manifestSha256 = servingSha256(manifestBytes);
  return {
    manifest,
    manifestBytes,
    manifestSha256,
    manifestKey: `serving/candidates/${candidateId}/manifest.${manifestSha256}.json`,
    objects: artifacts,
  };
}
