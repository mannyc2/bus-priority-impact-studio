import type { Database } from "bun:sqlite";

/**
 * Spatialite geometry columns must be created via `AddGeometryColumn`, not via
 * a plain `CREATE TABLE` column. SRID 4326 (WGS84); distance/length in meters
 * via the geodesic flag of `ST_Distance(a, b, 1)`.
 */

export function ensureLionSegmentGeomColumn(sqlite: Database): void {
  if (!hasGeometryColumn(sqlite, "local_lion_segment_geom", "geom")) {
    sqlite.exec(
      "SELECT AddGeometryColumn('local_lion_segment_geom', 'geom', 4326, 'GEOMETRY', 'XY')",
    );
  }
  ensureSpatialIndex(sqlite, "local_lion_segment_geom", "geom");
}

export function ensureRouteShapeGeomColumn(sqlite: Database): void {
  if (!hasGeometryColumn(sqlite, "local_route_shape_geom", "geom")) {
    sqlite.exec(
      "SELECT AddGeometryColumn('local_route_shape_geom', 'geom', 4326, 'MULTILINESTRING', 'XY')",
    );
  }
  ensureSpatialIndex(sqlite, "local_route_shape_geom", "geom");
}

function hasGeometryColumn(sqlite: Database, table: string, column: string): boolean {
  const row = sqlite
    .query<{ n: number }, [string, string]>(
      "SELECT count(*) AS n FROM geometry_columns WHERE f_table_name = ? AND f_geometry_column = ?",
    )
    .get(table.toLowerCase(), column.toLowerCase());
  return (row?.n ?? 0) > 0;
}

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
function assertSafeIdentifier(name: string, role: string): void {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`spatial-tables: unsafe ${role} identifier ${JSON.stringify(name)}`);
  }
}

function ensureSpatialIndex(sqlite: Database, table: string, column: string): void {
  assertSafeIdentifier(table, "table");
  assertSafeIdentifier(column, "column");
  const row = sqlite
    .query<{ n: number }, [string, string]>(
      "SELECT count(*) AS n FROM geometry_columns WHERE f_table_name = ? AND f_geometry_column = ? AND spatial_index_enabled = 1",
    )
    .get(table.toLowerCase(), column.toLowerCase());
  if ((row?.n ?? 0) > 0) return;
  sqlite.exec(`SELECT CreateSpatialIndex('${table}', '${column}')`);
}
