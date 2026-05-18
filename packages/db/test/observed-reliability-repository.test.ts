import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createLocalPipelineDb, type LocalPipelineDb } from "../src/local/client.js";
import { replaceRouteObservedReliabilityRows } from "../src/local/repositories/observed-reliability.js";
import { localRouteObservedReliabilitySummary } from "../src/local/schema.js";

async function createTestLocalDb(): Promise<{ db: LocalPipelineDb; sqlite: Database }> {
  const sqlite = new Database(":memory:");
  const migrationsDir = new URL("../migrations/local/", import.meta.url);
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  for (const filename of filenames) {
    const body = await Bun.file(new URL(filename, migrationsDir)).text();
    for (const statement of body.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) {
        sqlite.exec(trimmed);
      }
    }
  }
  return { db: createLocalPipelineDb(sqlite), sqlite };
}

function summaryRow(month: string, runId: string, routeId: string) {
  return {
    routeId,
    month,
    runId,
    reliabilityStatus: "observed" as const,
    minSampleThreshold: 100,
    sampleCount: 1000,
    stopCount: 50,
    directionCount: 2,
    averageObservedHeadwayMinutes: 5,
    medianObservedHeadwayMinutes: 5,
    p90ObservedHeadwayMinutes: 10,
    maxObservedHeadwayMinutes: 15,
    scheduledMedianHeadwayMinutes: 5,
    bunchingThresholdMinutes: 2,
    longGapThresholdMinutes: 10,
    observedBunchingShare: 0.1,
    observedLongGapShare: 0.05,
    expectedWaitMinutes: 3,
    scheduledExpectedWaitMinutes: 2.5,
    excessWaitMinutes: 0.5,
    waitReliabilityRatio: 1.2,
  };
}

function sourceStatusRow(month: string, routeId: string, sourceId: string) {
  return {
    routeId,
    month,
    sourceScope: "reliability",
    sourceId,
    status: "ok",
    rowCount: 1,
    snapshotId: null,
    note: null,
  };
}

describe("replaceRouteObservedReliabilityRows", () => {
  test("scoped delete preserves rows for the same month under a different runId", async () => {
    const { db, sqlite } = await createTestLocalDb();
    try {
      await replaceRouteObservedReliabilityRows(db, "2026-03", "bus-observatory-2026-03", {
        summaries: [summaryRow("2026-03", "bus-observatory-2026-03", "M15+")],
        sourceStatuses: [sourceStatusRow("2026-03", "M15+", "observedHeadways")],
      });
      await replaceRouteObservedReliabilityRows(db, "2026-03", "gtfs-rt-fixture", {
        summaries: [summaryRow("2026-03", "gtfs-rt-fixture", "M15+")],
        sourceStatuses: [sourceStatusRow("2026-03", "M15+", "observedHeadways")],
      });

      const rows = await db.select().from(localRouteObservedReliabilitySummary);
      const runIds = rows.map((row) => row.runId).sort();
      expect(runIds).toEqual(["bus-observatory-2026-03", "gtfs-rt-fixture"]);
    } finally {
      sqlite.close();
    }
  });

  test("does not delete rows for a different month", async () => {
    const { db, sqlite } = await createTestLocalDb();
    try {
      await replaceRouteObservedReliabilityRows(db, "2026-03", "run-mar", {
        summaries: [summaryRow("2026-03", "run-mar", "M15+")],
        sourceStatuses: [sourceStatusRow("2026-03", "M15+", "observedHeadways")],
      });
      await replaceRouteObservedReliabilityRows(db, "2026-05", "run-may", {
        summaries: [summaryRow("2026-05", "run-may", "M15+")],
        sourceStatuses: [sourceStatusRow("2026-05", "M15+", "observedHeadways")],
      });

      const marchRows = await db
        .select()
        .from(localRouteObservedReliabilitySummary)
        .where(sql`month = '2026-03'`);
      expect(marchRows).toHaveLength(1);
      expect(marchRows[0]?.runId).toBe("run-mar");
    } finally {
      sqlite.close();
    }
  });

  test("rejects summary rows whose month does not match the scope", async () => {
    const { db, sqlite } = await createTestLocalDb();
    try {
      await expect(
        replaceRouteObservedReliabilityRows(db, "2026-03", "run-mar", {
          summaries: [summaryRow("2026-05", "run-mar", "M15+")],
          sourceStatuses: [],
        }),
      ).rejects.toThrow(/does not match scope/);
    } finally {
      sqlite.close();
    }
  });

  test("rejects summary rows whose runId does not match the scope", async () => {
    const { db, sqlite } = await createTestLocalDb();
    try {
      await expect(
        replaceRouteObservedReliabilityRows(db, "2026-03", "run-a", {
          summaries: [summaryRow("2026-03", "run-b", "M15+")],
          sourceStatuses: [],
        }),
      ).rejects.toThrow(/does not match scope/);
    } finally {
      sqlite.close();
    }
  });
});
