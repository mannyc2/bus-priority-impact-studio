import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listDotTrafficSpeedsForLink, listLatestDotTrafficSpeeds } from "@bp/db/local";
import { ingestDotTrafficSpeeds } from "../src/jobs/ingest/ingest-dot-traffic-speeds.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const rawDir = fromRepoRoot(join("data/raw/dot-traffic-speeds"));
const dbPath = fromRepoRoot(join("data/working/test-dot-traffic-speeds/pipeline.sqlite"));

async function cleanup(): Promise<void> {
  await Promise.all([rm(rawDir, { force: true, recursive: true }), rm(dbPath, { force: true })]);
}

afterEach(cleanup);

describe("DOT Traffic Speeds ingestion", () => {
  test("keeps only the latest sample per link in the window", async () => {
    await cleanup();
    const result = await ingestDotTrafficSpeeds({
      fetchedAt: new Date("2026-05-18T22:30:00.000Z"),
      dbPath,
      sinceHours: 6,
      maxRows: 100,
      fetcher: async () =>
        Response.json([
          {
            link_id: "4616338",
            data_as_of: "2026-05-18T22:05:03.000",
            speed: "12.4",
            travel_time: "60",
            status: "0",
            owner: "NYC_DOT_LIC",
            borough: "Manhattan",
            link_name: "12th Ave",
            link_points: "40.76,-74.0 40.77,-74.0",
            transcom_id: "4616338",
          },
          // Older sample for the same link — should be dropped.
          {
            link_id: "4616338",
            data_as_of: "2026-05-18T20:00:00.000",
            speed: "8.0",
            travel_time: "92",
            status: "0",
            borough: "Manhattan",
          },
          // Different link.
          {
            link_id: "4616325",
            data_as_of: "2026-05-18T22:04:50.000",
            speed: "0",
            travel_time: "0",
            status: "-101",
            owner: "NYC_DOT_LIC",
            borough: "Manhattan",
            link_name: "11th Ave",
          },
        ]),
    });

    expect(result.linkCount).toBe(2);
    expect(result.rowCount).toBe(2);

    const local = await openLocalPipelineDb(dbPath);
    const latest = await listLatestDotTrafficSpeeds(local.db, 10);
    const linkRows = await listDotTrafficSpeedsForLink(local.db, "4616338");
    local.sqlite.close();

    expect(latest).toHaveLength(2);
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0]).toMatchObject({
      linkId: "4616338",
      sampledAt: "2026-05-18T22:05:03Z",
      speed: 12.4,
      travelTime: 60,
      statusCode: "0",
    });
  });

  test("re-ingest of the same snapshot is idempotent (upsert)", async () => {
    await cleanup();
    const baseRow = {
      link_id: "4616338",
      data_as_of: "2026-05-18T22:05:03.000",
      speed: "10",
      travel_time: "50",
      status: "0",
      borough: "Manhattan",
    };

    await ingestDotTrafficSpeeds({
      fetchedAt: new Date("2026-05-18T22:30:00.000Z"),
      dbPath,
      sinceHours: 6,
      maxRows: 100,
      fetcher: async () => Response.json([baseRow]),
    });
    await ingestDotTrafficSpeeds({
      fetchedAt: new Date("2026-05-18T22:30:00.000Z"),
      dbPath,
      sinceHours: 6,
      maxRows: 100,
      fetcher: async () => Response.json([{ ...baseRow, speed: "15", travel_time: "33" }]),
    });

    const local = await openLocalPipelineDb(dbPath);
    const rows = await listDotTrafficSpeedsForLink(local.db, "4616338");
    local.sqlite.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.speed).toBe(15);
    expect(rows[0]?.travelTime).toBe(33);
  });
});
