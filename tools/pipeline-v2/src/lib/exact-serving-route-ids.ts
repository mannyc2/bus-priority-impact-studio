import { Database } from "bun:sqlite";

/** Read the exact serving route universe from an exported D1 schema and seed. */
export async function exactServingRouteIdsFromD1(input: {
  schemaPath: string;
  seedPath: string;
  expectedCount: number;
}): Promise<string[]> {
  const [schemaSql, seedSql] = await Promise.all([
    Bun.file(input.schemaPath).text(),
    Bun.file(input.seedPath).text(),
  ]);
  const database = new Database(":memory:");
  try {
    database.exec(`${schemaSql}\n${seedSql}`);
    const rows = database
      .query(
        `
          SELECT DISTINCT route_id AS routeId
          FROM route_catalog_trip_type
          ORDER BY route_id
        `,
      )
      .all() as Array<{ routeId: string }>;
    const routeIds = rows.map((row) => row.routeId);
    if (
      routeIds.length !== input.expectedCount ||
      routeIds.some((routeId) => routeId.length === 0) ||
      new Set(routeIds).size !== routeIds.length
    ) {
      throw new Error(
        `Exact serving route universe has ${routeIds.length} routes; expected ${input.expectedCount}.`,
      );
    }
    return routeIds;
  } finally {
    database.close();
  }
}
