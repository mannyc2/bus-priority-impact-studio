import {
  decodeMapReleaseCatalogEntry,
  type MapReleaseCatalogEntry,
} from "../queries/map-release-catalog.js";

export type MapReleaseRegistrationInput = MapReleaseCatalogEntry;

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Build the final, independently applied catalog-registration statement.
 *
 * A byte-for-byte metadata retry becomes a harmless conflict no-op. Metadata
 * drift for an existing release ID, or a manifest-key collision on another
 * release, selects a collision-only primary key plus a NULL required timestamp
 * and aborts atomically.
 */
export function buildMapReleaseRegistrationSql(input: MapReleaseRegistrationInput): string {
  const entry = decodeMapReleaseCatalogEntry(input);
  const coverageStart = entry.coverage.start === null ? "NULL" : sqlString(entry.coverage.start);

  return `WITH \`candidate\` (
  \`release_id\`,
  \`published_at\`,
  \`coverage_start\`,
  \`coverage_end\`,
  \`manifest_key\`,
  \`manifest_sha256\`,
  \`release_profile\`,
  \`verification_status\`,
  \`route_count\`
) AS (VALUES (
  ${sqlString(entry.releaseId)},
  ${sqlString(entry.publishedAt)},
  ${coverageStart},
  ${sqlString(entry.coverage.end)},
  ${sqlString(entry.manifestKey)},
  ${sqlString(entry.manifestSha256)},
  ${sqlString(entry.releaseProfile)},
  ${sqlString(entry.verificationStatus)},
  ${entry.routeCount}
)),
\`guarded\` AS (
  SELECT
    \`candidate\`.*,
    EXISTS (
      SELECT 1
      FROM \`map_release_catalog\` AS \`existing\`
      WHERE (
        \`existing\`.\`release_id\` IS \`candidate\`.\`release_id\`
        OR \`existing\`.\`manifest_key\` IS \`candidate\`.\`manifest_key\`
      )
      AND NOT (
        \`existing\`.\`release_id\` IS \`candidate\`.\`release_id\`
        AND \`existing\`.\`published_at\` IS \`candidate\`.\`published_at\`
        AND \`existing\`.\`coverage_start\` IS \`candidate\`.\`coverage_start\`
        AND \`existing\`.\`coverage_end\` IS \`candidate\`.\`coverage_end\`
        AND \`existing\`.\`manifest_key\` IS \`candidate\`.\`manifest_key\`
        AND \`existing\`.\`manifest_sha256\` IS \`candidate\`.\`manifest_sha256\`
        AND \`existing\`.\`release_profile\` IS \`candidate\`.\`release_profile\`
        AND \`existing\`.\`verification_status\` IS \`candidate\`.\`verification_status\`
        AND \`existing\`.\`route_count\` IS \`candidate\`.\`route_count\`
      )
    ) AS \`metadata_collision\`
  FROM \`candidate\`
)
INSERT INTO \`map_release_catalog\` (
  \`release_id\`,
  \`published_at\`,
  \`coverage_start\`,
  \`coverage_end\`,
  \`manifest_key\`,
  \`manifest_sha256\`,
  \`release_profile\`,
  \`verification_status\`,
  \`route_count\`
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
  \`guarded\`.\`manifest_key\`,
  \`guarded\`.\`manifest_sha256\`,
  \`guarded\`.\`release_profile\`,
  \`guarded\`.\`verification_status\`,
  \`guarded\`.\`route_count\`
FROM \`guarded\`
WHERE true
ON CONFLICT(\`release_id\`) DO NOTHING;
`;
}
