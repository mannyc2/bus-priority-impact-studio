import { decodeStrict } from "@bp/domain/decode";
import {
  type ServingCandidateManifestV1,
  ServingCandidateManifestV1Schema,
} from "@bp/domain/studio/serving-release";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { ServingReleaseResolutionError } from "./serving-release.js";
import {
  D1_GENERATED_CANDIDATE_TABLES,
  D1_MIXED_LEGACY_TABLES,
} from "./serving-table-ownership.js";

export const D1_CANDIDATE_PROJECTION_TABLES = [
  ...D1_GENERATED_CANDIDATE_TABLES,
  ...D1_MIXED_LEGACY_TABLES,
].toSorted();

export type RegisterServingCandidateInput = {
  manifest: ServingCandidateManifestV1;
  manifestKey: string;
  manifestSha256: string;
  stagedAt: string;
};

type CandidateRegistrationRow = {
  candidateId: string;
  state: "staging" | "ready" | "rejected";
  manifestKey: string;
  manifestSha256: string;
  expectedDatasetCount: number;
  expectedArtifactCount: number;
  expectedD1TableCount: number;
  readyAt: string | null;
};

function requireExhaustiveD1Counts(manifest: ServingCandidateManifestV1): void {
  const declared = Object.keys(manifest.d1.rowCounts).toSorted();
  if (JSON.stringify(declared) !== JSON.stringify(D1_CANDIDATE_PROJECTION_TABLES)) {
    throw new ServingReleaseResolutionError(
      "candidate_incomplete",
      "Candidate D1 row counts do not exhaustively cover the Plan 098 projection tables.",
    );
  }
}

async function candidateRegistration(
  database: D1Database,
  candidateId: string,
): Promise<CandidateRegistrationRow | null> {
  return database
    .prepare(
      `SELECT
        candidate_id AS candidateId,
        state,
        canonical_manifest_key AS manifestKey,
        canonical_manifest_sha256 AS manifestSha256,
        expected_dataset_count AS expectedDatasetCount,
        expected_artifact_count AS expectedArtifactCount,
        expected_d1_table_count AS expectedD1TableCount,
        ready_at AS readyAt
      FROM serving_candidate
      WHERE candidate_id = ?`,
    )
    .bind(candidateId)
    .first<CandidateRegistrationRow>();
}

function registrationMatches(
  row: CandidateRegistrationRow,
  input: RegisterServingCandidateInput,
): boolean {
  return (
    row.manifestKey === input.manifestKey &&
    row.manifestSha256 === input.manifestSha256 &&
    row.expectedDatasetCount === input.manifest.datasets.length &&
    row.expectedArtifactCount === input.manifest.artifacts.length &&
    row.expectedD1TableCount === Object.keys(input.manifest.d1.rowCounts).length
  );
}

export async function registerServingCandidate(
  database: D1Database,
  input: RegisterServingCandidateInput,
): Promise<CandidateRegistrationRow> {
  const manifest = decodeStrict(ServingCandidateManifestV1Schema)(input.manifest);
  requireExhaustiveD1Counts(manifest);
  const existing = await candidateRegistration(database, manifest.candidateId);
  if (existing !== null) {
    if (!registrationMatches(existing, input)) {
      throw new ServingReleaseResolutionError(
        "operation_collision",
        "Candidate ID is already registered with different immutable metadata.",
      );
    }
    return existing;
  }

  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO serving_candidate(
          candidate_id, state, schema_version, semantic_input_fingerprint,
          source_commit, canonical_manifest_key, canonical_manifest_sha256,
          projection_schema, projection_sha256, exact_identity_projection_sha256,
          exact_identity_route_count, expected_dataset_count, expected_artifact_count,
          expected_d1_table_count, created_at, ready_at, rejected_at, rejection_code
        ) VALUES (?, 'staging', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
      )
      .bind(
        manifest.candidateId,
        manifest.semanticInputFingerprint,
        manifest.sourceCommit,
        input.manifestKey,
        input.manifestSha256,
        manifest.d1.projectionSchema,
        manifest.d1.projectionSha256,
        manifest.exactIdentity.projectionSha256,
        manifest.exactIdentity.routeCount,
        manifest.datasets.length,
        manifest.artifacts.length,
        Object.keys(manifest.d1.rowCounts).length,
        input.stagedAt,
      ),
    ...manifest.builderVersions.map((builder, rank) =>
      database
        .prepare(
          `INSERT INTO serving_candidate_builder(candidate_id, builder_rank, name, version)
          VALUES (?, ?, ?, ?)`,
        )
        .bind(manifest.candidateId, rank, builder.name, builder.version),
    ),
    ...manifest.datasets.map((dataset) =>
      database
        .prepare(
          `INSERT INTO serving_candidate_dataset(
            candidate_id, dataset_id, grain, coverage_start, coverage_end,
            source_snapshot_ids_json, source_ids_json, missing_intervals_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          manifest.candidateId,
          dataset.datasetId,
          dataset.grain,
          dataset.coverage.start,
          dataset.coverage.end,
          JSON.stringify(dataset.sourceSnapshotIds),
          JSON.stringify(dataset.sourceIds),
          JSON.stringify(dataset.coverage.missingIntervals),
        ),
    ),
    ...manifest.artifacts.map((artifact) =>
      database
        .prepare(
          `INSERT INTO serving_candidate_artifact(
            candidate_id, logical_id, physical_key, sha256, byte_length,
            media_type, schema_id, verified_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .bind(
          manifest.candidateId,
          artifact.logicalId,
          artifact.key,
          artifact.sha256,
          artifact.bytes,
          artifact.mediaType,
          artifact.schemaId,
        ),
    ),
    ...Object.entries(manifest.d1.rowCounts)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([tableName, rowCount]) =>
        database
          .prepare(
            `INSERT INTO serving_candidate_d1_count(candidate_id, table_name, row_count)
            VALUES (?, ?, ?)`,
          )
          .bind(manifest.candidateId, tableName, rowCount),
      ),
  ];
  await database.batch(statements);
  const registered = await candidateRegistration(database, manifest.candidateId);
  if (registered === null || !registrationMatches(registered, input)) {
    throw new ServingReleaseResolutionError(
      "catalog_corrupt",
      "Candidate registration did not commit its exact immutable header.",
    );
  }
  return registered;
}

export async function markServingCandidateArtifactVerified(
  database: D1Database,
  input: {
    candidateId: string;
    logicalId: string;
    sha256: string;
    bytes: number;
    verifiedAt: string;
  },
): Promise<void> {
  await database
    .prepare(
      `UPDATE serving_candidate_artifact
      SET verified_at = ?
      WHERE candidate_id = ? AND logical_id = ? AND sha256 = ? AND byte_length = ?
        AND EXISTS(
          SELECT 1 FROM serving_candidate
          WHERE candidate_id = ? AND state = 'staging'
        )`,
    )
    .bind(
      input.verifiedAt,
      input.candidateId,
      input.logicalId,
      input.sha256,
      input.bytes,
      input.candidateId,
    )
    .run();
  const row = await database
    .prepare(
      `SELECT verified_at AS verifiedAt
      FROM serving_candidate_artifact
      WHERE candidate_id = ? AND logical_id = ? AND sha256 = ? AND byte_length = ?`,
    )
    .bind(input.candidateId, input.logicalId, input.sha256, input.bytes)
    .first<{ verifiedAt: string | null }>();
  if (row?.verifiedAt !== input.verifiedAt) {
    throw new ServingReleaseResolutionError(
      "candidate_incomplete",
      "Artifact verification did not match the registered candidate object.",
    );
  }
}

export async function markServingCandidateReady(
  database: D1Database,
  candidateId: string,
  readyAt: string,
): Promise<void> {
  const registration = await candidateRegistration(database, candidateId);
  if (registration?.state === "ready") return;
  if (registration?.state !== "staging") {
    throw new ServingReleaseResolutionError(
      "candidate_incomplete",
      "Only a registered staging candidate can become ready.",
    );
  }
  const expectedResult = await database
    .prepare(
      `SELECT table_name AS tableName, row_count AS rowCount
      FROM serving_candidate_d1_count
      WHERE candidate_id = ?
      ORDER BY table_name`,
    )
    .bind(candidateId)
    .all<{ tableName: string; rowCount: number }>();
  if (!expectedResult.success) {
    throw new ServingReleaseResolutionError("catalog_corrupt", "D1 count inventory query failed.");
  }
  const expected = new Map(expectedResult.results.map((row) => [row.tableName, row.rowCount]));
  for (const table of D1_CANDIDATE_PROJECTION_TABLES) {
    const actual = await database
      .prepare(`SELECT COUNT(*) AS rowCount FROM "${table}_v2" WHERE candidate_id = ?`)
      .bind(candidateId)
      .first<{ rowCount: number }>();
    if (actual?.rowCount !== expected.get(table)) {
      throw new ServingReleaseResolutionError(
        "candidate_incomplete",
        `Candidate D1 row count mismatch for ${table}.`,
      );
    }
  }
  await database
    .prepare(
      `UPDATE serving_candidate
      SET state = 'ready', ready_at = ?
      WHERE candidate_id = ? AND state = 'staging'`,
    )
    .bind(readyAt, candidateId)
    .run();
  const ready = await candidateRegistration(database, candidateId);
  if (ready?.state !== "ready" || ready.readyAt !== readyAt) {
    throw new ServingReleaseResolutionError(
      "candidate_incomplete",
      "Candidate readiness transition did not commit.",
    );
  }
}
