import { describe, expect, test } from "bun:test";
import {
  listRouteBriefPeakWindows,
  listRouteBriefSummaries,
  listRouteComparisonRanks,
  replaceRouteBriefRows,
  replaceRouteComparisonRanks,
} from "../src/local/repositories/projection.js";
import { createTestLocalDb } from "./local-test-db.js";

function briefSummary(routeScore: number) {
  return {
    routeId: "M1",
    month: "2026-03",
    routeScore,
    publicVisible: true,
    publicVisibilityReason: "standard_route",
    averageSpeedMph: 6.5,
    hotspotCount: 3,
    totalRidership: 1000,
    totalTransfers: 200,
    aceActive: false,
    aceViolationCount: 0,
    busLaneMatchedLaneCount: 0,
    scheduleMatchRate: 0.9,
  };
}

describe("local replace helpers are transactional", () => {
  test("a failed replace rolls back its deletes, leaving prior rows intact", async () => {
    const { db, sqlite } = createTestLocalDb();
    try {
      // Seed a valid brief for (M1, 2026-03).
      replaceRouteBriefRows(db, {
        summary: briefSummary(10),
        peakWindows: [{ routeId: "M1", month: "2026-03", windowRank: 1, dayOfWeek: "Mon", hourOfDay: 8 }],
        slowestWindows: [],
      });
      expect(await listRouteBriefSummaries(db, "2026-03")).toHaveLength(1);

      // Re-run with two peak windows sharing windowRank 1 — the second row of the
      // batched insert violates the (route, month, windowRank) PK and throws mid-tx.
      expect(() =>
        replaceRouteBriefRows(db, {
          summary: briefSummary(99),
          peakWindows: [
            { routeId: "M1", month: "2026-03", windowRank: 1, dayOfWeek: "Tue", hourOfDay: 9 },
            { routeId: "M1", month: "2026-03", windowRank: 1, dayOfWeek: "Wed", hourOfDay: 10 },
          ],
          slowestWindows: [],
        }),
      ).toThrow();

      // The transaction rolled back: the original score and window survive.
      const summaries = await listRouteBriefSummaries(db, "2026-03");
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.routeScore).toBe(10);
      const windows = await listRouteBriefPeakWindows(db, "2026-03");
      expect(windows).toHaveLength(1);
      expect(windows[0]?.dayOfWeek).toBe("Mon");
    } finally {
      sqlite.close();
    }
  });

  test("inserts past the chunk boundary all land", async () => {
    const { db, sqlite } = createTestLocalDb();
    try {
      // 650 > the 500-row chunk size, so insertAll must split the batch.
      const rows = Array.from({ length: 650 }, (_, i) => ({
        month: "2026-03",
        rank: i + 1,
        routeId: `R${i + 1}`,
        routeScore: i + 1,
        averageSpeedMph: 6.5,
        totalRidership: 100,
        aceViolationCount: 0,
        busLaneMatchedLaneCount: 0,
      }));
      replaceRouteComparisonRanks(db, "2026-03", rows);

      const stored = await listRouteComparisonRanks(db, "2026-03");
      expect(stored).toHaveLength(650);
    } finally {
      sqlite.close();
    }
  });
});
