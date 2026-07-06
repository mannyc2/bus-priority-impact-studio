import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createBunSqliteServingDb } from "../src/d1/bun-sqlite.js";
import { getRouteTimelineIndex, listRouteTimelineIndex } from "../src/d1/index.js";
import { routeTimelineIndex } from "../src/d1/schema.js";

async function createTestDb() {
  const sqlite = new Database(":memory:");
  const migrationSql = await Bun.file(
    new URL("../migrations/d1/0028_route_timeline_index.sql", import.meta.url),
  ).text();
  sqlite.exec(migrationSql);
  return { db: createBunSqliteServingDb(sqlite), sqlite };
}

describe("D1 route timeline index read model", () => {
  test("reads route timeline index rows with parsed preview JSON and artifact refs", async () => {
    const { db, sqlite } = await createTestDb();
    try {
      await db.insert(routeTimelineIndex).values({
        routeId: "B46",
        month: "2026-03",
        supportLevel: "timeline_ready",
        qualityFlagsJson: JSON.stringify(["has_unresolved_dates"]),
        defaultEventCount: 1,
        secondaryEventCount: 0,
        reviewOnlyEventCount: 0,
        eventCount: 1,
        sourceBackedEventCount: 1,
        dateAssertionBackedEventCount: 1,
        unresolvedDateEventCount: 0,
        lowConfidenceEventCount: 0,
        unaccountedCandidateCount: 0,
        validationErrorCount: 0,
        validationWarningCount: 0,
        totalTokens: 123,
        defaultEventsJson: JSON.stringify([
          {
            eventId: "b46-launch",
            displayDate: "2016-07",
            title: "B46 SBS launched",
          },
        ]),
        bundleArtifactKey: "studio/v2/routes/b46/timeline.json",
        bundleArtifactSha256: "a".repeat(64),
        bundleArtifactByteLength: 456,
        sourceBundlePath: "/tmp/b46-timeline.json",
        generatedAt: "2026-06-06T20:10:00.000Z",
      });

      const row = await getRouteTimelineIndex(db, "B46", "2026-03");
      expect(row).toMatchObject({
        routeId: "B46",
        supportLevel: "timeline_ready",
        qualityFlags: ["has_unresolved_dates"],
        defaultEventCount: 1,
        bundleArtifactKey: "studio/v2/routes/b46/timeline.json",
      });
      expect(row?.defaultEvents).toEqual([
        {
          eventId: "b46-launch",
          displayDate: "2016-07",
          title: "B46 SBS launched",
        },
      ]);

      const rows = await listRouteTimelineIndex(db, "2026-03");
      expect(rows.map((candidate) => candidate.routeId)).toEqual(["B46"]);
      await expect(getRouteTimelineIndex(db, "M15", "2026-03")).resolves.toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("skips rows with malformed timeline JSON", async () => {
    const { db, sqlite } = await createTestDb();
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await db.insert(routeTimelineIndex).values({
        routeId: "B46",
        month: "2026-03",
        supportLevel: "timeline_ready",
        qualityFlagsJson: JSON.stringify([123]),
        defaultEventCount: 1,
        secondaryEventCount: 0,
        reviewOnlyEventCount: 0,
        eventCount: 1,
        sourceBackedEventCount: 1,
        dateAssertionBackedEventCount: 1,
        unresolvedDateEventCount: 0,
        lowConfidenceEventCount: 0,
        unaccountedCandidateCount: 0,
        validationErrorCount: 0,
        validationWarningCount: 0,
        totalTokens: null,
        defaultEventsJson: JSON.stringify([{ eventId: "b46-launch" }]),
        bundleArtifactKey: "studio/v2/routes/b46/timeline.json",
        bundleArtifactSha256: "a".repeat(64),
        bundleArtifactByteLength: 456,
        sourceBundlePath: "/tmp/b46-timeline.json",
        generatedAt: "2026-06-06T20:10:00.000Z",
      });

      await expect(getRouteTimelineIndex(db, "B46", "2026-03")).resolves.toBeNull();
      await expect(listRouteTimelineIndex(db, "2026-03")).resolves.toEqual([]);
    } finally {
      console.error = originalConsoleError;
      sqlite.close();
    }
  });
});
