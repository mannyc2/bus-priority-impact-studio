import { decodeStrict } from "@bp/domain/decode";
import {
  type ServingCandidateManifestV1,
  ServingCandidateManifestV1Schema,
  type ServingReleaseV1,
  ServingReleaseV1Schema,
} from "@bp/domain/studio/serving-release";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

export class ServingReleaseResolutionError extends Error {
  readonly code:
    | "catalog_corrupt"
    | "operation_collision"
    | "stale_pointer"
    | "candidate_incomplete";

  constructor(code: ServingReleaseResolutionError["code"], message: string) {
    super(message);
    this.name = "ServingReleaseResolutionError";
    this.code = code;
  }
}

type ActiveReleaseRow = {
  releaseId: string | null;
  generation: number;
  candidateId: string | null;
  publishedAt: string | null;
  activatedAt: string | null;
  manifestSha256: string | null;
  retainedPublic: number | null;
};

type CandidateRow = {
  candidateId: string;
  schemaVersion: number;
  semanticInputFingerprint: string;
  sourceCommit: string;
  manifestSha256: string;
  projectionSchema: string;
  projectionSha256: string;
  exactIdentityProjectionSha256: string;
  exactIdentityRouteCount: number;
};

type BuilderRow = { name: string; version: string };
type DatasetRow = {
  datasetId: string;
  grain: "month" | "day" | "snapshot" | "realtime";
  coverageStart: string | null;
  coverageEnd: string;
  sourceSnapshotIdsJson: string;
  sourceIdsJson: string;
  missingIntervalsJson: string;
};
type ArtifactRow = {
  logicalId: string;
  key: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  schemaId: string;
};
type CountRow = { tableName: string; rowCount: number };

export type LegacyServingReleaseContext = {
  kind: "legacy";
  generation: 0;
};

export type PointedServingReleaseContext = {
  kind: "pointed";
  generation: number;
  release: ServingReleaseV1;
  candidate: ServingCandidateManifestV1;
  artifactByLogicalId: ReadonlyMap<string, ServingCandidateManifestV1["artifacts"][number]>;
};

export type ServingReleaseContext = LegacyServingReleaseContext | PointedServingReleaseContext;

async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  if (!result.success) {
    throw new ServingReleaseResolutionError("catalog_corrupt", "D1 serving catalog query failed.");
  }
  return result.results;
}

function parseStringArray(value: string, label: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ServingReleaseResolutionError("catalog_corrupt", `${label} is not valid JSON.`);
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new ServingReleaseResolutionError("catalog_corrupt", `${label} is not a string array.`);
  }
  return parsed;
}

function parseCoverageIntervals(
  value: string,
  label: string,
): Array<{ start: string; end: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ServingReleaseResolutionError("catalog_corrupt", `${label} is not valid JSON.`);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (entry) =>
        typeof entry !== "object" ||
        entry === null ||
        Array.isArray(entry) ||
        typeof (entry as { start?: unknown }).start !== "string" ||
        typeof (entry as { end?: unknown }).end !== "string",
    )
  ) {
    throw new ServingReleaseResolutionError(
      "catalog_corrupt",
      `${label} is not an interval array.`,
    );
  }
  return parsed as Array<{ start: string; end: string }>;
}

export async function resolveActiveServingRelease(
  database: D1Database,
): Promise<ServingReleaseContext> {
  const active = await database
    .prepare(
      `SELECT
        pointer.release_id AS releaseId,
        pointer.generation AS generation,
        release.candidate_id AS candidateId,
        release.published_at AS publishedAt,
        release.activated_at AS activatedAt,
        release.canonical_manifest_sha256 AS manifestSha256,
        release.retained_public AS retainedPublic
      FROM serving_active_release AS pointer
      LEFT JOIN serving_release AS release ON release.release_id = pointer.release_id
      WHERE pointer.singleton_id = 1`,
    )
    .first<ActiveReleaseRow>();

  if (active === null) {
    throw new ServingReleaseResolutionError(
      "catalog_corrupt",
      "Serving pointer singleton is absent.",
    );
  }
  if (active.releaseId === null) {
    if (active.generation !== 0) {
      throw new ServingReleaseResolutionError(
        "catalog_corrupt",
        "A post-bootstrap serving pointer cannot be null.",
      );
    }
    return { kind: "legacy", generation: 0 };
  }
  if (
    active.candidateId === null ||
    active.publishedAt === null ||
    active.activatedAt === null ||
    active.manifestSha256 === null ||
    active.retainedPublic !== 1
  ) {
    throw new ServingReleaseResolutionError(
      "catalog_corrupt",
      "Active serving release is incomplete or not public.",
    );
  }

  const candidateId = active.candidateId;
  const [candidate, builders, datasets, artifacts, counts] = await Promise.all([
    database
      .prepare(
        `SELECT
          candidate_id AS candidateId,
          schema_version AS schemaVersion,
          semantic_input_fingerprint AS semanticInputFingerprint,
          source_commit AS sourceCommit,
          canonical_manifest_sha256 AS manifestSha256,
          projection_schema AS projectionSchema,
          projection_sha256 AS projectionSha256,
          exact_identity_projection_sha256 AS exactIdentityProjectionSha256,
          exact_identity_route_count AS exactIdentityRouteCount
        FROM serving_candidate
        WHERE candidate_id = ? AND state = 'ready'`,
      )
      .bind(candidateId)
      .first<CandidateRow>(),
    all<BuilderRow>(
      database
        .prepare(
          `SELECT name, version
          FROM serving_candidate_builder
          WHERE candidate_id = ?
          ORDER BY builder_rank`,
        )
        .bind(candidateId),
    ),
    all<DatasetRow>(
      database
        .prepare(
          `SELECT
            dataset_id AS datasetId,
            grain,
            coverage_start AS coverageStart,
            coverage_end AS coverageEnd,
            source_snapshot_ids_json AS sourceSnapshotIdsJson,
            source_ids_json AS sourceIdsJson,
            missing_intervals_json AS missingIntervalsJson
          FROM serving_candidate_dataset
          WHERE candidate_id = ?
          ORDER BY dataset_id`,
        )
        .bind(candidateId),
    ),
    all<ArtifactRow>(
      database
        .prepare(
          `SELECT
            logical_id AS logicalId,
            physical_key AS key,
            sha256,
            byte_length AS bytes,
            media_type AS mediaType,
            schema_id AS schemaId
          FROM serving_candidate_artifact
          WHERE candidate_id = ? AND verified_at IS NOT NULL
          ORDER BY logical_id`,
        )
        .bind(candidateId),
    ),
    all<CountRow>(
      database
        .prepare(
          `SELECT table_name AS tableName, row_count AS rowCount
          FROM serving_candidate_d1_count
          WHERE candidate_id = ?
          ORDER BY table_name`,
        )
        .bind(candidateId),
    ),
  ]);

  if (candidate === null || candidate.manifestSha256 !== active.manifestSha256) {
    throw new ServingReleaseResolutionError(
      "catalog_corrupt",
      "Active release does not resolve to its exact ready candidate manifest.",
    );
  }

  let manifest: ServingCandidateManifestV1;
  try {
    manifest = decodeStrict(ServingCandidateManifestV1Schema)({
      schemaVersion: candidate.schemaVersion,
      candidateId: candidate.candidateId,
      semanticInputFingerprint: candidate.semanticInputFingerprint,
      sourceCommit: candidate.sourceCommit,
      builderVersions: builders,
      datasets: datasets.map((dataset) => ({
        datasetId: dataset.datasetId,
        grain: dataset.grain,
        coverage: {
          start: dataset.coverageStart,
          end: dataset.coverageEnd,
          missingIntervals: parseCoverageIntervals(
            dataset.missingIntervalsJson,
            `Dataset ${dataset.datasetId} missing intervals`,
          ),
        },
        sourceIds: parseStringArray(
          dataset.sourceIdsJson,
          `Dataset ${dataset.datasetId} source IDs`,
        ),
        sourceSnapshotIds: parseStringArray(
          dataset.sourceSnapshotIdsJson,
          `Dataset ${dataset.datasetId} snapshot IDs`,
        ),
      })),
      artifacts,
      d1: {
        projectionSchema: candidate.projectionSchema,
        projectionSha256: candidate.projectionSha256,
        rowCounts: Object.fromEntries(counts.map((count) => [count.tableName, count.rowCount])),
      },
      exactIdentity: {
        projectionSha256: candidate.exactIdentityProjectionSha256,
        routeCount: candidate.exactIdentityRouteCount,
      },
    });
  } catch (error) {
    if (error instanceof ServingReleaseResolutionError) throw error;
    throw new ServingReleaseResolutionError(
      "catalog_corrupt",
      "Active serving candidate failed strict contract decoding.",
    );
  }

  const release = decodeStrict(ServingReleaseV1Schema)({
    schemaVersion: 1,
    releaseId: active.releaseId,
    candidateId,
    publishedAt: active.publishedAt,
    activatedAt: active.activatedAt,
  });
  return {
    kind: "pointed",
    generation: active.generation,
    release,
    candidate: manifest,
    artifactByLogicalId: new Map(
      manifest.artifacts.map((artifact) => [artifact.logicalId, artifact]),
    ),
  };
}

export type ServingActivationInput = {
  operationId: string;
  expectedReleaseId: string | null;
  expectedGeneration: number;
  release: ServingReleaseV1;
  manifestSha256: string;
};

export type ServingPointerTransition = {
  operationId: string;
  fromReleaseId: string | null;
  toReleaseId: string;
  candidateId: string;
  expectedGeneration: number;
  newGeneration: number;
  manifestSha256: string;
  committedAt: string;
};

export type ServingActivationIntentFailure = {
  operationId: string;
  outcome: "absent" | "failed" | "already_failed";
};

type TransitionRow = {
  operationId: string;
  fromReleaseId: string | null;
  toReleaseId: string;
  candidateId: string;
  expectedGeneration: number;
  newGeneration: number;
  manifestSha256: string;
  committedAt: string;
};

function transitionMatches(input: ServingActivationInput, row: TransitionRow): boolean {
  return (
    row.operationId === input.operationId &&
    row.fromReleaseId === input.expectedReleaseId &&
    row.toReleaseId === input.release.releaseId &&
    row.candidateId === input.release.candidateId &&
    row.expectedGeneration === input.expectedGeneration &&
    row.newGeneration === input.expectedGeneration + 1 &&
    row.manifestSha256 === input.manifestSha256
  );
}

async function findTransition(
  database: D1Database,
  operationId: string,
): Promise<TransitionRow | null> {
  return database
    .prepare(
      `SELECT
        operation_id AS operationId,
        from_release_id AS fromReleaseId,
        to_release_id AS toReleaseId,
        candidate_id AS candidateId,
        expected_generation AS expectedGeneration,
        new_generation AS newGeneration,
        canonical_manifest_sha256 AS manifestSha256,
        committed_at AS committedAt
      FROM serving_pointer_transition
      WHERE operation_id = ?`,
    )
    .bind(operationId)
    .first<TransitionRow>();
}

/** Terminally closes a prepared intent that never changed the active pointer. */
export async function failPreparedServingActivationIntent(
  database: D1Database,
  operationId: string,
): Promise<ServingActivationIntentFailure> {
  const intent = await database
    .prepare(
      `SELECT
        intent.state,
        EXISTS(
          SELECT 1 FROM serving_pointer_transition AS transition
          WHERE transition.operation_id = intent.operation_id
        ) AS transitioned,
        EXISTS(
          SELECT 1 FROM serving_active_release AS active
          WHERE active.last_operation_id = intent.operation_id
        ) AS active
      FROM serving_activation_intent AS intent
      WHERE intent.operation_id = ?`,
    )
    .bind(operationId)
    .first<{ state: "prepared" | "committed" | "failed"; transitioned: number; active: number }>();
  if (intent === null) return { operationId, outcome: "absent" };
  if (intent.state === "failed") return { operationId, outcome: "already_failed" };
  if (intent.state !== "prepared" || intent.transitioned !== 0 || intent.active !== 0) {
    throw new ServingReleaseResolutionError(
      "operation_collision",
      "A committed or active serving intent cannot be marked failed.",
    );
  }
  const failed = await database
    .prepare(
      `UPDATE serving_activation_intent
      SET state = 'failed'
      WHERE operation_id = ?
        AND state = 'prepared'
        AND NOT EXISTS(
          SELECT 1 FROM serving_pointer_transition
          WHERE operation_id = ?
        )
        AND NOT EXISTS(
          SELECT 1 FROM serving_active_release
          WHERE last_operation_id = ?
        )
      RETURNING operation_id AS operationId`,
    )
    .bind(operationId, operationId, operationId)
    .first<{ operationId: string }>();
  if (failed?.operationId !== operationId) {
    throw new ServingReleaseResolutionError(
      "stale_pointer",
      "Serving intent changed before it could be marked failed.",
    );
  }
  return { operationId, outcome: "failed" };
}

export async function activateServingRelease(
  database: D1Database,
  input: ServingActivationInput,
): Promise<ServingPointerTransition> {
  const existingTransition = await findTransition(database, input.operationId);
  if (existingTransition !== null) {
    if (!transitionMatches(input, existingTransition)) {
      throw new ServingReleaseResolutionError(
        "operation_collision",
        "Serving activation operation ID was reused with different parameters.",
      );
    }
    return existingTransition;
  }

  await database
    .prepare(
      `INSERT INTO serving_activation_intent(
        operation_id, state, expected_release_id, expected_generation,
        release_id, candidate_id, published_at, activated_at,
        canonical_manifest_sha256, new_generation, created_at, committed_at
      ) VALUES (?, 'prepared', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(operation_id) DO NOTHING`,
    )
    .bind(
      input.operationId,
      input.expectedReleaseId,
      input.expectedGeneration,
      input.release.releaseId,
      input.release.candidateId,
      input.release.publishedAt,
      input.release.activatedAt,
      input.manifestSha256,
      input.expectedGeneration + 1,
      input.release.activatedAt,
    )
    .run();

  const intent = await database
    .prepare(
      `SELECT
        operation_id AS operationId,
        expected_release_id AS fromReleaseId,
        release_id AS toReleaseId,
        candidate_id AS candidateId,
        expected_generation AS expectedGeneration,
        new_generation AS newGeneration,
        canonical_manifest_sha256 AS manifestSha256,
        activated_at AS committedAt
      FROM serving_activation_intent
      WHERE operation_id = ?`,
    )
    .bind(input.operationId)
    .first<TransitionRow>();
  if (intent === null || !transitionMatches(input, intent)) {
    throw new ServingReleaseResolutionError(
      "operation_collision",
      "Serving activation operation ID collides with a different intent.",
    );
  }

  const updated = await database
    .prepare(
      `UPDATE serving_active_release
      SET release_id = ?, generation = generation + 1, last_operation_id = ?
      WHERE singleton_id = 1
        AND generation = ?
        AND ((release_id IS NULL AND ? IS NULL) OR release_id = ?)
      RETURNING release_id AS releaseId, generation`,
    )
    .bind(
      input.release.releaseId,
      input.operationId,
      input.expectedGeneration,
      input.expectedReleaseId,
      input.expectedReleaseId,
    )
    .first<{ releaseId: string; generation: number }>();

  if (updated === null) {
    throw new ServingReleaseResolutionError(
      "stale_pointer",
      "Serving activation compare-and-swap found a stale release or generation.",
    );
  }
  const transition = await findTransition(database, input.operationId);
  if (transition === null || !transitionMatches(input, transition)) {
    throw new ServingReleaseResolutionError(
      "catalog_corrupt",
      "Serving pointer changed without its exact transition receipt.",
    );
  }
  return transition;
}

export async function resolvePublicArtifactForRelease(
  database: D1Database,
  releaseId: string,
  logicalId: string,
): Promise<ArtifactRow | null> {
  return database
    .prepare(
      `SELECT
        artifact.logical_id AS logicalId,
        artifact.physical_key AS key,
        artifact.sha256,
        artifact.byte_length AS bytes,
        artifact.media_type AS mediaType,
        artifact.schema_id AS schemaId
      FROM serving_release AS release
      JOIN serving_candidate_artifact AS artifact
        ON artifact.candidate_id = release.candidate_id
      WHERE release.release_id = ?
        AND release.retained_public = 1
        AND artifact.logical_id = ?
        AND artifact.verified_at IS NOT NULL`,
    )
    .bind(releaseId, logicalId)
    .first<ArtifactRow>();
}

export async function isServingReleaseContextCurrent(
  database: D1Database,
  context: PointedServingReleaseContext,
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT release_id AS releaseId, generation
      FROM serving_active_release
      WHERE singleton_id = 1`,
    )
    .first<{ releaseId: string | null; generation: number }>();
  return row?.releaseId === context.release.releaseId && row.generation === context.generation;
}
