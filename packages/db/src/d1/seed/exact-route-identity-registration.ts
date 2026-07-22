import { decodeStrict } from "@bp/domain/decode";
import {
  CanonicalPublishedAtSchema,
  CoverageWindowSchema,
  ReleaseIdSchema,
} from "@bp/domain/studio/shared";
import { Schema } from "effect";

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));
const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const PositiveIntegerSchema = Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0));

export const ExactRouteIdentityRegistrationSchema = Schema.Struct({
  releaseId: ReleaseIdSchema,
  publishedAt: CanonicalPublishedAtSchema,
  coverage: CoverageWindowSchema,
  sourceWikiRelease: NonEmptyStringSchema,
  sourceManifestSha256: Sha256Schema,
  sourceRouteIdentitySha256: Sha256Schema,
  sourceCurrentBusRoutesSha256: Sha256Schema,
  sourceIndexSha256: Sha256Schema,
  catalogSnapshotSha256: Sha256Schema,
  projectionSha256: Sha256Schema,
  exactRouteCount: PositiveIntegerSchema,
  routeTypeCount: PositiveIntegerSchema,
  tripTypeCount: PositiveIntegerSchema,
});

export type ExactRouteIdentityRegistrationInput = typeof ExactRouteIdentityRegistrationSchema.Type;

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Register exact route identity without allowing a release ID to drift.
 *
 * An identical retry becomes a conflict no-op. A same-ID metadata mismatch
 * selects a collision-only primary key plus a NULL required timestamp so SQLite
 * aborts the entire surrounding transaction without replacing the original row.
 */
export function buildExactRouteIdentityRegistrationSql(
  input: ExactRouteIdentityRegistrationInput,
): string {
  const entry = decodeStrict(ExactRouteIdentityRegistrationSchema)(input);
  const coverageStart = entry.coverage.start === null ? "NULL" : sqlString(entry.coverage.start);

  return `WITH \`candidate\` (
  \`release_id\`,
  \`published_at\`,
  \`coverage_start\`,
  \`coverage_end\`,
  \`source_wiki_release\`,
  \`source_manifest_sha256\`,
  \`source_route_identity_sha256\`,
  \`source_current_bus_routes_sha256\`,
  \`source_index_sha256\`,
  \`catalog_snapshot_sha256\`,
  \`projection_sha256\`,
  \`exact_route_count\`,
  \`route_type_count\`,
  \`trip_type_count\`
) AS (VALUES (
  ${sqlString(entry.releaseId)},
  ${sqlString(entry.publishedAt)},
  ${coverageStart},
  ${sqlString(entry.coverage.end)},
  ${sqlString(entry.sourceWikiRelease)},
  ${sqlString(entry.sourceManifestSha256)},
  ${sqlString(entry.sourceRouteIdentitySha256)},
  ${sqlString(entry.sourceCurrentBusRoutesSha256)},
  ${sqlString(entry.sourceIndexSha256)},
  ${sqlString(entry.catalogSnapshotSha256)},
  ${sqlString(entry.projectionSha256)},
  ${entry.exactRouteCount},
  ${entry.routeTypeCount},
  ${entry.tripTypeCount}
)),
\`guarded\` AS (
  SELECT
    \`candidate\`.*,
    EXISTS (
      SELECT 1
      FROM \`exact_route_identity_release\` AS \`existing\`
      WHERE \`existing\`.\`release_id\` IS \`candidate\`.\`release_id\`
    ) AS \`release_exists\`,
    EXISTS (
      SELECT 1
      FROM \`exact_route_identity_release\` AS \`existing\`
      WHERE \`existing\`.\`release_id\` IS \`candidate\`.\`release_id\`
      AND (
        \`existing\`.\`published_at\` IS NOT \`candidate\`.\`published_at\`
        OR \`existing\`.\`coverage_start\` IS NOT \`candidate\`.\`coverage_start\`
        OR \`existing\`.\`coverage_end\` IS NOT \`candidate\`.\`coverage_end\`
        OR \`existing\`.\`source_wiki_release\` IS NOT \`candidate\`.\`source_wiki_release\`
        OR \`existing\`.\`source_manifest_sha256\` IS NOT \`candidate\`.\`source_manifest_sha256\`
        OR \`existing\`.\`source_route_identity_sha256\` IS NOT \`candidate\`.\`source_route_identity_sha256\`
        OR \`existing\`.\`source_current_bus_routes_sha256\` IS NOT \`candidate\`.\`source_current_bus_routes_sha256\`
        OR \`existing\`.\`source_index_sha256\` IS NOT \`candidate\`.\`source_index_sha256\`
        OR \`existing\`.\`catalog_snapshot_sha256\` IS NOT \`candidate\`.\`catalog_snapshot_sha256\`
        OR \`existing\`.\`projection_sha256\` IS NOT \`candidate\`.\`projection_sha256\`
        OR \`existing\`.\`exact_route_count\` IS NOT \`candidate\`.\`exact_route_count\`
        OR \`existing\`.\`route_type_count\` IS NOT \`candidate\`.\`route_type_count\`
        OR \`existing\`.\`trip_type_count\` IS NOT \`candidate\`.\`trip_type_count\`
      )
    ) AS \`metadata_collision\`
  FROM \`candidate\`
)
INSERT INTO \`exact_route_identity_release\` (
  \`release_id\`,
  \`published_at\`,
  \`coverage_start\`,
  \`coverage_end\`,
  \`source_wiki_release\`,
  \`source_manifest_sha256\`,
  \`source_route_identity_sha256\`,
  \`source_current_bus_routes_sha256\`,
  \`source_index_sha256\`,
  \`catalog_snapshot_sha256\`,
  \`projection_sha256\`,
  \`exact_route_count\`,
  \`route_type_count\`,
  \`trip_type_count\`
)
SELECT
  CASE
    WHEN \`guarded\`.\`metadata_collision\`
    THEN \`guarded\`.\`release_id\` || '#metadata-collision'
    ELSE \`guarded\`.\`release_id\`
  END,
  CASE WHEN \`guarded\`.\`metadata_collision\` THEN NULL ELSE \`guarded\`.\`published_at\` END,
  \`guarded\`.\`coverage_start\`,
  \`guarded\`.\`coverage_end\`,
  \`guarded\`.\`source_wiki_release\`,
  \`guarded\`.\`source_manifest_sha256\`,
  \`guarded\`.\`source_route_identity_sha256\`,
  \`guarded\`.\`source_current_bus_routes_sha256\`,
  \`guarded\`.\`source_index_sha256\`,
  \`guarded\`.\`catalog_snapshot_sha256\`,
  \`guarded\`.\`projection_sha256\`,
  \`guarded\`.\`exact_route_count\`,
  \`guarded\`.\`route_type_count\`,
  \`guarded\`.\`trip_type_count\`
FROM \`guarded\`
WHERE \`guarded\`.\`metadata_collision\` OR NOT \`guarded\`.\`release_exists\`;
`;
}
