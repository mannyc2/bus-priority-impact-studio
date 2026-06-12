import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildRouteTimelineServingProjection } from "../../../../src/commands/docs/tier2/_route-timeline-serving-projection.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-route-timeline-serving-projection");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("route timeline serving projection", () => {
  test("projects bundle index rows into D1-style timeline rows and R2 artifact refs", async () => {
    const b46BundlePath = join(workingRoot, "route-timeline-bundle-b46.json");
    const m15BundlePath = join(workingRoot, "route-timeline-bundle-m15.json");
    await Bun.write(b46BundlePath, JSON.stringify({ routeId: "B46", events: [1, 2, 3] }));
    await Bun.write(m15BundlePath, JSON.stringify({ routeId: "M15", events: [1] }));

    const indexPath = join(workingRoot, "route-timeline-bundle-index.json");
    await writeJson(indexPath, {
      artifactKind: "bp.tier2_route_timeline_bundle_index.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-07T06:00:00.000Z",
      bundleCount: 2,
      summary: {
        routeCount: 2,
        timelineReadyCount: 1,
        timelineSparseCount: 1,
        timelineReviewOnlyCount: 0,
        invalidCount: 0,
        defaultEventCount: 4,
        eventCount: 5,
        unresolvedDateEventCount: 1,
        validationErrorCount: 0,
        validationWarningCount: 0,
        totalTokens: 150,
      },
      routeRows: [
        {
          routeId: "B46",
          supportLevel: "timeline_ready",
          qualityFlags: ["has_unresolved_dates"],
          bundlePath: b46BundlePath,
          generatedAt: "2026-06-07T05:00:00.000Z",
          eventCount: 4,
          defaultEventCount: 3,
          secondaryEventCount: 1,
          reviewOnlyEventCount: 0,
          sourceBackedEventCount: 4,
          dateAssertionBackedEventCount: 3,
          unresolvedDateEventCount: 1,
          lowConfidenceEventCount: 0,
          unaccountedCandidateCount: 0,
          validationErrorCount: 0,
          validationWarningCount: 0,
          totalTokens: 100,
          defaultEvents: [
            {
              eventId: "b46-launch",
              displayDate: "July 2016",
              title: "B46 SBS launched",
              layer: "service_change",
              status: "implemented",
              confidence: "high",
              sourceCount: 2,
              dateAssertionRefCount: 1,
              suggestedWindowStatus: "available",
            },
          ],
        },
        {
          routeId: "M15",
          supportLevel: "timeline_sparse",
          qualityFlags: ["low_default_event_count", "review_heavy"],
          bundlePath: m15BundlePath,
          generatedAt: "2026-06-07T05:05:00.000Z",
          eventCount: 1,
          defaultEventCount: 1,
          secondaryEventCount: 0,
          reviewOnlyEventCount: 0,
          sourceBackedEventCount: 1,
          dateAssertionBackedEventCount: 1,
          unresolvedDateEventCount: 0,
          lowConfidenceEventCount: 0,
          unaccountedCandidateCount: 2,
          validationErrorCount: 0,
          validationWarningCount: 0,
          totalTokens: 50,
          defaultEvents: [],
        },
      ],
    });

    const outputPath = join(workingRoot, "serving-projection.json");
    const artifactRoot = join(workingRoot, "artifacts");
    const result = await buildRouteTimelineServingProjection({
      indexPath,
      outputPath,
      artifactRoot,
      month: "2026-03",
      r2Prefix: "studio/v2/routes/",
      generatedAt: "2026-06-07T06:30:00.000Z",
    });

    expect(result.artifact.summary).toMatchObject({
      routeCount: 2,
      timelineReadyCount: 1,
      timelineSparseCount: 1,
      routeTimelineIndexRowCount: 2,
      routeArtifactRowCount: 2,
      copyPlanRowCount: 2,
      totalTokens: 150,
    });
    expect(result.artifact.routeTimelineIndexRows[0]).toMatchObject({
      routeId: "B46",
      month: "2026-03",
      bundleArtifactKey: "studio/v2/routes/b46/timeline.json",
      defaultEventCount: 3,
    });
    expect(result.artifact.routeArtifactRows[1]).toMatchObject({
      routeId: "M15",
      artifactName: "route_timeline_bundle",
      artifactKey: "studio/v2/routes/m15/timeline.json",
      contentType: "application/json",
    });
    expect(result.artifact.copyPlan[0]?.sha256).toHaveLength(64);
    expect(result.materializedArtifactPaths).toEqual([
      join(artifactRoot, "studio/v2/routes/b46/timeline.json"),
      join(artifactRoot, "studio/v2/routes/m15/timeline.json"),
    ]);
    expect(await Bun.file(join(artifactRoot, "studio/v2/routes/b46/timeline.json")).json()).toEqual(
      {
        routeId: "B46",
        events: [1, 2, 3],
      },
    );

    const schemaSql = await Bun.file(result.schemaPath).text();
    const seedSql = await Bun.file(result.seedPath).text();
    expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS route_timeline_index");
    expect(seedSql).toContain("INSERT INTO route_timeline_index");

    const db = new Database(":memory:");
    try {
      db.exec(schemaSql);
      db.exec(seedSql);
      const timelineCount = db
        .query<{ count: number }, []>("SELECT count(*) AS count FROM route_timeline_index")
        .get();
      const artifactCount = db
        .query<{ count: number }, []>("SELECT count(*) AS count FROM route_artifact")
        .get();
      const b46 = db
        .query<{ support_level: string; bundle_artifact_key: string }, []>(
          "SELECT support_level, bundle_artifact_key FROM route_timeline_index WHERE route_id = 'B46'",
        )
        .get();
      expect(timelineCount?.count).toBe(2);
      expect(artifactCount?.count).toBe(2);
      expect(b46).toEqual({
        support_level: "timeline_ready",
        bundle_artifact_key: "studio/v2/routes/b46/timeline.json",
      });
    } finally {
      db.close();
    }

    const markdown = await Bun.file(result.markdownPath).text();
    expect(markdown).toContain("| B46 | timeline_ready |");
    expect(markdown).toContain("studio/v2/routes/b46/timeline.json");
  });
});
