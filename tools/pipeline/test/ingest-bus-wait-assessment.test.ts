import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  listBusWaitAssessmentRowsForMonth,
  listBusWaitAssessmentRowsForRoute,
} from "@bp/db/local";
import { ingestBusWaitAssessment } from "../src/jobs/ingest/ingest-bus-wait-assessment.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const rawDir = fromRepoRoot(join("data/raw/reliability"));
const dbPath = fromRepoRoot(join("data/working/test-bus-wait-assessment/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(join(rawDir, "bus-wait-assessment-2026-03.json"), { force: true }),
    rm(dbPath, { force: true }),
  ]);
}

afterEach(removeFixtureArtifacts);

describe("Bus Wait Assessment ingestion", () => {
  test("normalizes Socrata rows, persists per-month grouping, tolerates nulls", async () => {
    await removeFixtureArtifacts();

    const result = await ingestBusWaitAssessment({
      year: 2026,
      month: 3,
      fetchedAt: new Date("2026-05-19T12:00:00.000Z"),
      dbPath,
      fetcher: async () =>
        Response.json([
          {
            month: "2026-03-01T00:00:00.000",
            borough: "Manhattan",
            day_type: "1",
            trip_type: "Local",
            route_id: "M15+",
            period: "Peak",
            number_of_trips_passing_wait: "3650",
            number_of_scheduled_trips: "6444",
            wait_assessment: "0.5664183736809435",
          },
          {
            month: "2026-03-01T00:00:00.000",
            borough: "Bronx",
            day_type: "1",
            trip_type: "Local",
            route_id: "BX1",
            period: "Off-Peak",
            number_of_trips_passing_wait: "6110",
            number_of_scheduled_trips: "8995",
            wait_assessment: "0.679266259032796",
          },
          // Null wait_assessment (0 scheduled trips — the real upstream pattern).
          {
            month: "2026-03-01T00:00:00.000",
            borough: "Queens",
            day_type: "2",
            trip_type: "Express",
            route_id: "QM31",
            period: "Off-Peak",
            number_of_trips_passing_wait: "0",
            number_of_scheduled_trips: "0",
            wait_assessment: null,
          },
        ]),
    });

    const local = await openLocalPipelineDb(dbPath);
    const allRows = await listBusWaitAssessmentRowsForMonth(local.db, "2026-03");
    const m15Rows = await listBusWaitAssessmentRowsForRoute(local.db, "M15+", "2026-03");
    const qm31Rows = await listBusWaitAssessmentRowsForRoute(local.db, "QM31", "2026-03");
    local.sqlite.close();

    expect(result.isoMonth).toBe("2026-03");
    expect(result.rowCount).toBe(3);
    expect(result.routeCount).toBe(3);
    expect(allRows).toHaveLength(3);
    expect(m15Rows[0]).toMatchObject({
      routeId: "M15+",
      borough: "Manhattan",
      tripsPassingWait: 3650,
      scheduledTrips: 6444,
      waitAssessment: 0.5664183736809435,
    });
    expect(qm31Rows[0]?.waitAssessment).toBeNull();
  });

  test("re-ingest replaces prior rows for the same month (no duplicates)", async () => {
    await removeFixtureArtifacts();
    const baseRow = {
      month: "2026-03-01T00:00:00.000",
      borough: "Manhattan",
      day_type: "1",
      trip_type: "Local",
      route_id: "M15+",
      period: "Peak",
      number_of_trips_passing_wait: "100",
      number_of_scheduled_trips: "200",
      wait_assessment: "0.5",
    };

    await ingestBusWaitAssessment({
      year: 2026,
      month: 3,
      fetchedAt: new Date("2026-05-19T12:00:00.000Z"),
      dbPath,
      fetcher: async () => Response.json([baseRow]),
    });
    await ingestBusWaitAssessment({
      year: 2026,
      month: 3,
      fetchedAt: new Date("2026-05-19T12:00:00.000Z"),
      dbPath,
      fetcher: async () =>
        Response.json([{ ...baseRow, wait_assessment: "0.6", number_of_trips_passing_wait: "120" }]),
    });

    const local = await openLocalPipelineDb(dbPath);
    const rows = await listBusWaitAssessmentRowsForMonth(local.db, "2026-03");
    local.sqlite.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.waitAssessment).toBe(0.6);
    expect(rows[0]?.tripsPassingWait).toBe(120);
  });
});
