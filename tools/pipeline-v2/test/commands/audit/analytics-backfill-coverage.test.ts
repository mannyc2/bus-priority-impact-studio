import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { buildAnalyticsBackfillCoverageAudit } from "../../../src/commands/audit/analytics-backfill-coverage.ts";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE local_route_segment_speed (
      month text NOT NULL,
      route_id text NOT NULL
    );
    CREATE TABLE local_route_hourly_ridership (
      month text NOT NULL,
      route_id text NOT NULL
    );
    CREATE TABLE local_route_intervention_comparison (
      month text NOT NULL,
      route_id text NOT NULL,
      comparison_status text NOT NULL
    );
  `);
  return db;
}

function insertRows(db: Database, table: string, month: string, routeCount: number, perRoute: number) {
  const insert =
    table === "local_route_intervention_comparison"
      ? db.prepare(
          `INSERT INTO ${table} (month, route_id, comparison_status) VALUES (?, ?, 'evaluated')`,
        )
      : db.prepare(`INSERT INTO ${table} (month, route_id) VALUES (?, ?)`);
  const tx = db.transaction(() => {
    for (let route = 0; route < routeCount; route += 1) {
      for (let row = 0; row < perRoute; row += 1) {
        insert.run(month, `R${route}`);
      }
    }
  });
  tx();
}

describe("buildAnalyticsBackfillCoverageAudit", () => {
  it("reports missing and thin months for release-only backfill surfaces", () => {
    const db = createDb();
    try {
      insertRows(db, "local_route_segment_speed", "2026-01", 300, 400);
      insertRows(db, "local_route_segment_speed", "2026-02", 300, 400);
      insertRows(db, "local_route_hourly_ridership", "2026-01", 300, 120);
      insertRows(db, "local_route_hourly_ridership", "2026-02", 40, 120);
      insertRows(db, "local_route_intervention_comparison", "2026-01", 80, 1);
      insertRows(db, "local_route_intervention_comparison", "2026-02", 80, 1);

      const audit = buildAnalyticsBackfillCoverageAudit({
        sqlite: db,
        startMonth: "2026-01",
        endMonth: "2026-03",
        generatedAt: "2026-05-30T00:00:00.000Z",
        dbPath: null,
        artifactPath: "/tmp/coverage.json",
      });

      expect(audit.summary.totalExpectedSurfaceMonths).toBe(9);
      expect(audit.summary.missingSurfaceMonths).toBe(3);
      expect(audit.summary.thinSurfaceMonths).toBe(1);
      expect(audit.summary.blockedSurfaceCount).toBe(3);

      const ridership = audit.surfaces.find((surface) => surface.surfaceId === "route_hourly_ridership");
      expect(ridership?.thinMonths).toEqual(["2026-02"]);
      expect(ridership?.months.find((month) => month.month === "2026-02")?.reasons).toContain(
        "below_min_route_count",
      );

      const segmentSpeed = audit.surfaces.find((surface) => surface.surfaceId === "route_segment_speed");
      expect(segmentSpeed?.missingMonths).toEqual(["2026-03"]);
    } finally {
      db.close();
    }
  });
});
