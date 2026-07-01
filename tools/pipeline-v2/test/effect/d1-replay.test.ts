import { describe, expect, test } from "bun:test";
import { runD1ReplayBoundary } from "../../src/effect/d1-replay.ts";

const schemaSql = `
  CREATE TABLE route_artifact (
    route_id TEXT NOT NULL,
    month TEXT NOT NULL,
    artifact_key TEXT NOT NULL
  );
`;

const seedSql = `
  INSERT INTO route_artifact (route_id, month, artifact_key)
  VALUES ('B41', '2026-03', 'routes/b41/index.json');
`;

describe("D1 replay Effect boundary", () => {
  test("loads schema and seed SQL into an in-memory D1-compatible SQLite database", async () => {
    const result = await runD1ReplayBoundary({
      command: "fixture.d1",
      operation: "countRouteArtifacts",
      schemaSql,
      seedSql,
      run: ({ database }) =>
        database.query<{ count: number }, []>("SELECT count(*) AS count FROM route_artifact").get()
          ?.count ?? 0,
    });

    expect(result).toBe(1);
  });

  test("wraps schema and seed replay failures in typed errors", async () => {
    await expect(
      runD1ReplayBoundary({
        command: "fixture.d1",
        operation: "loadBadSql",
        schemaSql: "CREATE TABLE broken (",
        seedSql: "",
        run: () => 0,
      }),
    ).rejects.toMatchObject({
      _tag: "D1ReplayCommandError",
      command: "fixture.d1",
      operation: "loadBadSql",
    });
  });

  test("wraps callback failures in typed errors", async () => {
    await expect(
      runD1ReplayBoundary({
        command: "fixture.d1",
        operation: "failingRead",
        schemaSql,
        seedSql,
        run: () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toMatchObject({
      _tag: "D1ReplayCommandError",
      command: "fixture.d1",
      operation: "failingRead",
    });
  });
});
