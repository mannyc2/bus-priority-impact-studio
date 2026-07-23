import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPlan097ReadinessAudit } from "../../../src/commands/audit/plan097-readiness.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("audit plan097-readiness", () => {
  test("hashes exact selected rows and writes a ready per-dataset matrix", async () => {
    const root = await mkdtemp(join(tmpdir(), "plan097-readiness-"));
    roots.push(root);
    const dbPath = join(root, "pipeline.sqlite");
    const sqlite = new Database(dbPath);
    sqlite.exec(`
      CREATE TABLE local_route_segment_speed (month TEXT, route_id TEXT, value INTEGER, PRIMARY KEY (month, route_id));
      CREATE TABLE local_route_hourly_ridership (month TEXT, route_id TEXT, value INTEGER, PRIMARY KEY (month, route_id));
      CREATE TABLE local_bus_wait_assessment (month TEXT, route_id TEXT, value INTEGER, PRIMARY KEY (month, route_id));
      CREATE TABLE local_ace_violation_summary (month TEXT, route_id TEXT, value INTEGER, PRIMARY KEY (month, route_id));
      CREATE TABLE local_ace_route (route_id TEXT PRIMARY KEY, value INTEGER);
      CREATE TABLE local_bus_lane (segment_id TEXT PRIMARY KEY, value INTEGER);
      CREATE TABLE local_gtfs_rt_feed_snapshot (fetched_at TEXT, run_id TEXT, PRIMARY KEY (fetched_at, run_id));
    `);
    const insertSpeed = sqlite.prepare(
      "INSERT INTO local_route_segment_speed VALUES ('2026-05', ?, 1)",
    );
    sqlite.transaction(() => {
      for (let index = 0; index < 300; index += 1) insertSpeed.run(`R${index}`);
    })();
    sqlite.exec(`
      INSERT INTO local_route_hourly_ridership VALUES ('2026-06', 'B1', 1);
      INSERT INTO local_bus_wait_assessment VALUES ('2026-05', 'B1', 1);
      INSERT INTO local_ace_violation_summary VALUES ('2026-06', 'B1', 1);
      INSERT INTO local_ace_route VALUES ('B1', 1);
      INSERT INTO local_bus_lane VALUES ('lane-1', 1);
      INSERT INTO local_gtfs_rt_feed_snapshot VALUES ('2026-07-22T12:00:00.000Z', 'run-1');
    `);
    const freshnessLedgerPath = join(root, "freshness.json");
    await Bun.write(
      freshnessLedgerPath,
      JSON.stringify({
        artifactKind: "freshness_ledger",
        schemaVersion: 1,
        checkedAt: "2026-07-23T00:00:00.000Z",
        publishedAt: null,
        rows: [
          ["bus_segment_speeds_2025", "month", "2026-05", "2026-05"],
          ["bus_hourly_ridership_2025", "month", "2026-07", "2026-06"],
          ["bus_wait_assessment", "month", "2026-05", "2026-05"],
          ["ace_violations", "month", "2026-06", "2026-06"],
          ["bus_time_gtfsrt_vehicle_positions", "realtime", null, "2026-07-22"],
        ].map(([sourceId, grain, upstreamLatest, ingestedLatest]) => ({
          sourceId,
          grain,
          servingCritical: true,
          upstreamLatest,
          ingestedLatest,
          publishedCoverageEnd: null,
          ingestLagMonths: null,
          publishLagMonths: null,
          status: "unknown",
        })),
      }),
    );
    const routeSpeedAvailabilityPath = join(root, "route-speed.json");
    await Bun.write(
      routeSpeedAvailabilityPath,
      JSON.stringify({
        sourceId: "bus_segment_speeds_2025",
        checkedAt: "2026-07-23T00:00:00.000Z",
        startYear: 2026,
        endYear: 2026,
        minSpeedRoutes: 300,
        latestSpeedMonth: {
          isoMonth: "2026-05",
          year: 2026,
          month: 5,
          routeCount: 300,
          rowCount: 300,
          busTripCount: 300,
          status: "complete",
        },
        requestedMonth: null,
        releaseDecision: {
          status: "new_complete_month_available",
          latestCompleteMonth: "2026-05",
          lastBuiltMonth: "2026-03",
          shouldRebuild: true,
          reason: "fixture",
        },
        months: [],
        artifactPath: routeSpeedAvailabilityPath,
      }),
    );
    const aceRoutesSnapshotPath = join(root, "ace-routes.json");
    const busLanesSnapshotPath = join(root, "bus-lanes.json");
    await Promise.all([
      Bun.write(aceRoutesSnapshotPath, '{"rows":["B1"]}\n'),
      Bun.write(busLanesSnapshotPath, '{"rows":["lane-1"]}\n'),
    ]);
    const outputPath = join(root, "out", "matrix.json");
    const result = await runPlan097ReadinessAudit({
      local: { sqlite },
      freshnessLedgerPath,
      routeSpeedAvailabilityPath,
      aceRoutesSnapshotPath,
      busLanesSnapshotPath,
      outputPath,
    });
    sqlite.close();
    expect(result.status).toBe("ready");
    expect(result.candidateCompatibilityCoverageEnd).toBe("2026-05");
    expect(result.datasets).toHaveLength(7);
    expect(result.datasets.every((row) => row.evidence?.rowsSha256.length === 64)).toBe(true);
    expect(await Bun.file(outputPath).exists()).toBe(true);
  });
});
